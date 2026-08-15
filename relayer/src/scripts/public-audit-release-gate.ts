import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PUBLIC_AUDIT_RELEASE_GATE_ARGS,
  validatePublicAuditReleaseGateProcess,
} from '../public-audit-release-gate.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const relayerRoot = path.resolve(scriptDirectory, '..', '..');

function main(): void {
  if (process.argv.length > 2) throw new Error('public audit release gate accepts no arguments');
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('npm executable identity is unavailable');

  const result = spawnSync(
    process.execPath,
    [npmCli, 'run', 'release:gate', '--', ...PUBLIC_AUDIT_RELEASE_GATE_ARGS],
    {
      cwd: relayerRoot,
      encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;

  const validation = validatePublicAuditReleaseGateProcess({
    exitCode: result.status,
    output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
  });
  if (!validation.accepted) {
    throw new Error('release gate did not produce one exit-status-aligned zero-issue summary');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'public audit release gate failed');
    process.exitCode = 1;
  }
}
