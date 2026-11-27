#!/usr/bin/env tsx
/**
 * Generate a complete mTLS PKI bundle (private CA + per-signer server certs +
 * coordinator client cert) for multi-host Ergo Bridge V1/V1.2 committee ceremonies.
 *
 * Usage:
 *   npm run gen:mtls -- --out ./mtls-certs --signers signer-1,signer-2,signer-3 --days 365
 *
 * Zero external `openssl` binary required (pure Node `node:crypto` ECDSA P-256).
 * Keep the generated directory OUT of Git (`*.pem` and `*.key` are gitignored).
 */
import fs from 'node:fs';
import path from 'node:path';
import { generateCommitteeMtlsPki } from '../src/crypto/x509.js';

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: generate-mtls-certs.ts --out <dir> [--signers signer-1,signer-2,signer-3] [--ips 127.0.0.1,::1] [--days 365]',
    );
    return;
  }

  const outDir = path.resolve(getArg(args, '--out') ?? './mtls-certs');
  const signerNames = (getArg(args, '--signers') ?? 'signer-1,signer-2,signer-3')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const name of signerNames) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(name) || name.toLowerCase() === 'coordinator') {
      throw new Error(
        `Invalid signer name "${name}": must match /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/ and not equal "coordinator"`,
      );
    }
  }
  const extraIps = (getArg(args, '--ips') ?? '127.0.0.1,::1')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const validDays = Number(getArg(args, '--days') ?? '365');
  if (!Number.isInteger(validDays) || validDays < 1 || validDays > 3650) {
    throw new Error(`Invalid --days: ${validDays} (expected integer 1..3650)`);
  }

  const pki = generateCommitteeMtlsPki({ signerNames, extraIps, validDays });
  fs.mkdirSync(outDir, { recursive: true });

  const writeSecret = (filePath: string, content: string) => {
    fs.writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o600 });
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      // POSIX chmod may be a no-op on Windows filesystems
    }
  };
  const writePublic = (filePath: string, content: string) => {
    fs.writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o644 });
  };

  writePublic(path.join(outDir, 'ca.crt'), pki.ca.certPem);
  writeSecret(path.join(outDir, 'ca.key'), pki.ca.keyPem);

  for (const [name, bundle] of Object.entries(pki.servers)) {
    const dir = path.join(outDir, name);
    fs.mkdirSync(dir, { recursive: true });
    writePublic(path.join(dir, 'server.crt'), bundle.certPem);
    writeSecret(path.join(dir, 'server.key'), bundle.keyPem);
    writePublic(path.join(dir, 'ca.crt'), pki.ca.certPem);
  }

  const clientDir = path.join(outDir, 'coordinator');
  fs.mkdirSync(clientDir, { recursive: true });
  writePublic(path.join(clientDir, 'client.crt'), pki.client.certPem);
  writeSecret(path.join(clientDir, 'client.key'), pki.client.keyPem);
  writePublic(path.join(clientDir, 'ca.crt'), pki.ca.certPem);

  console.log(
    JSON.stringify(
      {
        ok: true,
        outDir,
        validDays,
        signers: signerNames,
        files: {
          caCert: path.join(outDir, 'ca.crt'),
          coordinatorClientCert: path.join(clientDir, 'client.crt'),
          coordinatorClientKey: path.join(clientDir, 'client.key'),
        },
        note: 'Distribute each signer/<name> directory ONLY to its isolated host and remove ca.key from online hosts after issuance.',
      },
      null,
      2,
    ),
  );
}

main();
