import { existsSync, realpathSync, statSync } from 'fs';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  evidenceTargetInspectionVariants,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from './evidence-sensitive-target.js';

const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const defaultBridgeRoot = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));

export interface AuthenticatedV2PathResolutionOptions {
  cwd?: string;
  bridgeRoot?: string;
}

export function resolveProvisioningInputPath(
  target: string,
  options: AuthenticatedV2PathResolutionOptions = {},
): string {
  const cwd = resolve(options.cwd ?? process.cwd());
  const requested = resolve(cwd, target);
  assertSanitizedJsonTarget(target, '--input');
  assertSanitizedJsonTarget(requested, '--input');
  if (!existsSync(requested)) throw new Error('--input does not exist');
  const resolved = realpathSync(requested);
  assertSanitizedJsonTarget(resolved, '--input');
  const stats = statSync(resolved);
  if (!stats.isFile()) throw new Error('--input must be a regular JSON file');
  if (stats.size > MAX_INPUT_BYTES) {
    throw new Error(`--input must not exceed ${MAX_INPUT_BYTES} bytes`);
  }
  return resolved;
}

export function resolveProvisioningRepositoryInputPath(
  target: string,
  options: AuthenticatedV2PathResolutionOptions = {},
): string {
  const cwd = resolve(options.cwd ?? process.cwd());
  const allowedRoot = realpathSync(resolve(options.bridgeRoot ?? defaultBridgeRoot));
  const requested = resolve(cwd, target);
  const rejectRepositoryEscape = (): never => {
    throw new Error('--input must resolve inside the bridge repository');
  };

  if (isAbsolute(target) || !isInsidePath(requested, allowedRoot)) {
    rejectRepositoryEscape();
  }
  const existingAncestor = realpathNearestExistingAncestor(requested);
  if (!isInsidePath(existingAncestor, allowedRoot)) {
    rejectRepositoryEscape();
  }

  const resolved = resolveProvisioningInputPath(target, options);
  if (!isInsidePath(resolved, allowedRoot)) {
    rejectRepositoryEscape();
  }
  return resolved;
}

export function resolveProvisioningOutputPath(
  target: string,
  options: AuthenticatedV2PathResolutionOptions = {},
): string {
  const cwd = resolve(options.cwd ?? process.cwd());
  const allowedRoot = realpathSync(resolve(options.bridgeRoot ?? defaultBridgeRoot));
  const requested = resolve(cwd, target);
  assertSanitizedJsonTarget(target, '--out');
  assertSanitizedJsonTarget(requested, '--out');
  if (!isInsidePath(requested, allowedRoot)) {
    throw new Error('--out must resolve inside the bridge repository');
  }
  const existingAncestor = realpathNearestExistingAncestor(requested);
  if (!isInsidePath(existingAncestor, allowedRoot)) {
    throw new Error('--out parent must resolve inside the bridge repository');
  }
  if (existsSync(requested)) throw new Error('--out must identify a new file');
  return requested;
}

function assertSanitizedJsonTarget(target: string, optionName: string): void {
  const trimmed = target.trim();
  if (trimmed.length === 0) throw new Error(`${optionName} must not be empty`);
  if (extname(basename(trimmed)).toLowerCase() !== '.json') {
    throw new Error(`${optionName} must be a JSON file`);
  }
  const unsafe = evidenceTargetInspectionVariants(trimmed.replace(/\\/g, '/').toLowerCase())
    .some(candidate => {
      const name = basename(candidate);
      return isEvidenceEnvironmentFileName(name)
        || isEvidenceRuntimeDatabaseTarget(candidate)
        || isEvidenceSecretOrRuntimeName(candidate, { includeDeployedState: true })
        || /(?:^|[/_. -])(?:deployment[-_ ]?state|private[-_ ]?runtime)(?:$|[/_. -])/i.test(candidate);
    });
  if (unsafe) throw new Error(`${optionName} must not target secret or runtime material`);
}

function realpathNearestExistingAncestor(target: string): string {
  let cursor = existsSync(target) ? target : dirname(target);
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return realpathSync(cursor);
}

function isInsidePath(target: string, parent: string): boolean {
  const relativePath = relative(parent, target);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}
