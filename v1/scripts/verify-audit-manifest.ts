#!/usr/bin/env tsx
/**
 * Deterministic audit artifact SHA-256 verifier (`npm run audit:verify`).
 *
 * Computes normalized (LF) SHA-256 digests of every in-scope ErgoScript,
 * Solidity, compiled Solidity manifest, and JVM verifier file and verifies
 * exact 100% parity against `v1/docs/audit-package.md` so the external audit
 * handoff document can never silently drift from live code.
 *
 * Usage:
 *   tsx scripts/verify-audit-manifest.ts           # verify against audit-package.md
 *   tsx scripts/verify-audit-manifest.ts --print   # print current SHA-256 table
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const V1_ROOT = path.resolve(__dirname, '..');
const AUDIT_DOC_PATH = path.join(V1_ROOT, 'docs', 'audit-package.md');

export const AUDITED_ARTIFACTS: string[] = [
  'contracts/BridgeDepositLock.es',
  'contracts/BridgeReserve.es',
  'contracts/BridgeDup.es',
  'contracts/BridgeTracker.es',
  'contracts/BridgeTrackerStark.es',
  'solidity/SERG.sol',
  'solidity/ErgoBridge.sol',
  'solidity/BridgeCommitteeTimelock.sol',
  'solidity/compiled/build-manifest.json',
  'jvm/BridgeJvmTool.java',
];

function normalizedSha256(filePath: string): { sha256: string; lines: number } {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  const sha256 = crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
  const lines = raw.split('\n').length - (raw.endsWith('\n') ? 1 : 0);
  return { sha256, lines };
}

function main(): void {
  const printMode = process.argv.includes('--print');
  const computed = AUDITED_ARTIFACTS.map((rel) => {
    const abs = path.join(V1_ROOT, rel);
    if (!fs.existsSync(abs)) {
      throw new Error(`Missing audited artifact: v1/${rel}`);
    }
    const { sha256, lines } = normalizedSha256(abs);
    return { rel: `v1/${rel}`, sha256, lines };
  });

  if (printMode) {
    for (const item of computed) {
      console.log(`| \`${item.rel}\` | ${item.lines} | \`${item.sha256}\` |`);
    }
    return;
  }

  if (!fs.existsSync(AUDIT_DOC_PATH)) {
    throw new Error(`Missing audit package doc: ${AUDIT_DOC_PATH}`);
  }
  const doc = fs.readFileSync(AUDIT_DOC_PATH, 'utf8');
  const mismatches: string[] = [];

  for (const item of computed) {
    const escapedPath = item.rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\|\\s*\`${escapedPath}\`\\s*\\|\\s*\\d+\\s*\\|\\s*\`([0-9a-f]{64})\`\\s*\\|`);
    const match = doc.match(re);
    if (!match) {
      mismatches.push(`${item.rel}: missing entry in v1/docs/audit-package.md`);
    } else if (match[1] !== item.sha256) {
      mismatches.push(`${item.rel}: doc=${match[1]} != live=${item.sha256}`);
    }
  }

  if (mismatches.length > 0) {
    console.error('Audit manifest verification FAILED:');
    for (const m of mismatches) console.error(`  - ${m}`);
    process.exit(1);
  }

  console.log(`Audit manifest check PASS (${computed.length}/${computed.length} artifacts matched exact normalized SHA-256)`);
}

main();
