import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  comparePublicAuditAlphaCandidateIdentity,
  inspectPublicAuditAlphaPreflight,
} from '../public-audit-alpha.js';
import { resolveAuditNpmCli } from './check-clean-checkout.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const relayerRoot = path.resolve(scriptDirectory, '..', '..');
const bridgeRoot = path.resolve(relayerRoot, '..');
const validationScripts = [
  'sources:verify:lock',
  'sources:verify:workflow',
  'check:clean-checkout',
  'audit:alpha:release-structure',
  'operator:drill:signer-unavailable',
  'operator:drill:peg-in-mint-transport',
  'operator:drill:recovery',
  'operator:drill:alerts',
] as const;

function main(): void {
  if (process.argv.length > 2) throw new Error('public audit alpha accepts no arguments');
  const npmCli = resolveAuditNpmCli();

  const entry = inspectPublicAuditAlphaPreflight({ bridgeRoot });
  printPreflight('entry', entry);
  if (entry.status !== 'PASS') throw new Error('entry audit preflight is blocked');

  for (const script of validationScripts) runNpmScript(npmCli, script);

  const finalNpmCli = resolveAuditNpmCli();
  if (finalNpmCli !== npmCli) {
    throw new Error('audit npm CLI identity changed during validation');
  }

  const final = inspectPublicAuditAlphaPreflight({ bridgeRoot });
  printPreflight('final', final);
  if (final.status !== 'PASS') throw new Error('final audit preflight is blocked');
  const identityErrors = comparePublicAuditAlphaCandidateIdentity(entry.candidate, final.candidate);
  if (identityErrors.length > 0) {
    throw new Error(`audit candidate identity changed: ${identityErrors.join('; ')}`);
  }
}

function runNpmScript(npmCli: string, script: string): void {
  const result = spawnSync(process.execPath, [npmCli, 'run', script], {
    cwd: relayerRoot,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${script} failed with exit code ${String(result.status)}`);
}

function printPreflight(
  phase: 'entry' | 'final',
  report: ReturnType<typeof inspectPublicAuditAlphaPreflight>,
): void {
  process.stdout.write(`${JSON.stringify({ phase, ...report }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'public audit alpha failed');
    process.exitCode = 1;
  }
}
