/**
 * Devnet Session Safety CLI - pre-run safety check for patched devnet sessions.
 *
 * No .env loading. No mutations. No signing.
 * Inspects runtime files that will change during a devnet run and prints
 * backup/restore commands for the operator.
 *
 * Exit 0 unless filesystem inspection itself fails.
 */

import { existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { formatSafetyReport, type FileStatus } from '../devnet-session-safety.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RELAYER_ROOT = resolve(__dirname, '..', '..');
const BRIDGE_ROOT = resolve(RELAYER_ROOT, '..');

/** Files that are expected to change during a devnet run and must never be committed. */
const RUNTIME_FILES = [
  {
    label: 'contracts/deployed_state.json',
    path: resolve(BRIDGE_ROOT, 'contracts', 'deployed_state.json'),
  },
  {
    label: 'relayer/bridge-state.sqlite',
    path: resolve(RELAYER_ROOT, 'bridge-state.sqlite'),
  },
];

/**
 * Check git dirty status for a file using bridge-root-relative pathspec.
 */
function isGitDirty(relativeLabel: string): boolean {
  try {
    const output = execSync(`git status --porcelain -- "${relativeLabel}"`, {
      encoding: 'utf-8',
      cwd: BRIDGE_ROOT,
      timeout: 5000,
    });
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Inspect runtime files and return their status.
 */
function inspectRuntimeFiles(): FileStatus[] {
  return RUNTIME_FILES.map(f => ({
    label: f.label,
    exists: existsSync(f.path),
    dirty: isGitDirty(f.label),
    size: existsSync(f.path) ? statSync(f.path).size : null,
  }));
}

function main(): void {
  try {
    const statuses = inspectRuntimeFiles();
    console.log(formatSafetyReport(statuses, BRIDGE_ROOT));
    process.exit(0);
  } catch (err: any) {
    console.error(`Devnet session safety error: ${err.message ?? err}`);
    process.exit(1);
  }
}

main();
