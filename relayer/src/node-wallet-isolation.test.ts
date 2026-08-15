import { readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const srcRoot = dirname(fileURLToPath(import.meta.url));

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (entry.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}

describe('node wallet isolation', () => {
  it('does not use node wallet signing endpoints outside explicit diagnostics', () => {
    const forbiddenEndpoints = [
      '/wallet/unlock',
      '/wallet/addresses',
      '/wallet/balances',
      '/wallet/transaction/sign',
      '/wallet/transaction/generateAndSign',
      '/wallet/transaction/send',
      '/wallet/payment/send',
    ];

    const allowedPathFragments = [
      'scripts/verify-avl-state.ts',
      'scripts/spikes/fund-node-wallet.ts',
      'node-wallet-isolation.test.ts',
    ];

    const offenders = walk(srcRoot)
      .map(file => ({
        file,
        rel: toPosix(relative(srcRoot, file)),
        text: readFileSync(file, 'utf-8'),
      }))
      .filter(({ rel }) => !allowedPathFragments.some(fragment => rel.includes(fragment)))
      .flatMap(({ rel, text }) =>
        forbiddenEndpoints
          .filter(endpoint => text.includes(endpoint))
          .map(endpoint => `${rel}: ${endpoint}`),
      );

    expect(offenders).toEqual([]);
  });

  it('does not import or instantiate Fleet Prover outside explicit diagnostics', () => {
    const allowedPathFragments = [
      'scripts/spikes/',
      'node-wallet-isolation.test.ts',
    ];

    const offenders = walk(srcRoot)
      .map(file => ({
        file,
        rel: toPosix(relative(srcRoot, file)),
        text: readFileSync(file, 'utf-8'),
      }))
      .filter(({ rel }) => !allowedPathFragments.some(fragment => rel.includes(fragment)))
      .flatMap(({ rel, text }) => {
        const findings: string[] = [];
        if (/\bimport\s*\{[^}]*\bProver\b[^}]*\}\s*from\s*['"]@fleet-sdk\/wallet['"]/.test(text)) {
          findings.push(`${rel}: Fleet Prover import`);
        }
        if (/\bnew\s+Prover\s*\(/.test(text)) {
          findings.push(`${rel}: Fleet Prover instantiation`);
        }
        return findings;
      });

    expect(offenders).toEqual([]);
  });
});
