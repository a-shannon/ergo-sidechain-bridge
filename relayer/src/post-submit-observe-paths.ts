import { existsSync, realpathSync } from 'fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'path';

import {
  evidenceTargetInspectionVariants,
  hasEvidenceLocalOnlyInspectionReference,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from './evidence-sensitive-target.js';

const blockedStateDbTargetLabel = '<blocked state-db target>';

export interface ResolvedStateDbPath {
  path?: string;
  errors: string[];
}

export function resolveStateDbPath(target: string, workspaceRoot = process.cwd()): ResolvedStateDbPath {
  const trimmedTarget = target.trim();
  const errors = validateStateDbPath(target, workspaceRoot);
  if (errors.length > 0) return { errors };

  const resolved = resolve(workspaceRoot, trimmedTarget);
  return { path: existsSync(resolved) ? realpathSync(resolved) : resolved, errors: [] };
}

export function validateStateDbPath(target: string, workspaceRoot = process.cwd()): string[] {
  const trimmedTarget = target.trim();
  const normalized = normalizeStateDbTarget(target);
  const errors: string[] = [];
  if (!/\.(?:db|sqlite|sqlite3)$/.test(normalized)) {
    errors.push('--state-db must point to a SQLite database file');
  }
  if (isAbsolute(trimmedTarget) || /^[a-z]:\//i.test(normalized)) {
    errors.push('--state-db must be a relative path inside the relayer workspace');
  }
  if (/^file:\/\//i.test(normalized) || /^[a-z][a-z0-9+.-]*:/i.test(normalized)) {
    errors.push('--state-db must not be a URI');
  }
  if (isSensitiveStateDbTarget(normalized)) {
    errors.push(`--state-db ${blockedStateDbTargetLabel} must not target secret-bearing material`);
  }
  if (!isAbsolute(trimmedTarget) && !/^[a-z][a-z0-9+.-]*:/i.test(normalized)) {
    const escapedError = validateResolvedInsideWorkspace(trimmedTarget, workspaceRoot);
    if (escapedError) errors.push(escapedError);
  }
  return errors;
}

function validateResolvedInsideWorkspace(target: string, workspaceRoot: string): string | undefined {
  const resolvedWorkspace = realpathSync(workspaceRoot);
  const resolvedTarget = resolve(resolvedWorkspace, target);
  const finalTarget = existsSync(resolvedTarget) ? realpathSync(resolvedTarget) : resolvedTarget;
  const nearestExistingAncestor = realpathNearestExistingAncestor(resolvedTarget);
  return isInsidePath(finalTarget, resolvedWorkspace) && isInsidePath(nearestExistingAncestor, resolvedWorkspace)
    ? undefined
    : `--state-db ${blockedStateDbTargetLabel} must resolve inside the relayer workspace`;
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

function formatStateDbTargetLabel(target: string): string {
  const normalized = normalizeStateDbTarget(target);
  if (isSensitiveStateDbTarget(normalized)) return blockedStateDbTargetLabel;
  return basename(normalized) || '<state-db target>';
}

function normalizeStateDbTarget(target: string): string {
  return target.trim().replace(/\\/g, '/').toLowerCase();
}

function isSensitiveStateDbTarget(normalized: string): boolean {
  return evidenceTargetInspectionVariants(normalized).some(isSensitiveStateDbInspectionTarget);
}

function isSensitiveStateDbInspectionTarget(normalized: string): boolean {
  const name = basename(normalized);
  return (
    hasEvidenceLocalOnlyInspectionReference(normalized) ||
    hasSensitiveStateDbSourceTargetPayload(normalized) ||
    hasSensitiveStateDbTargetSegment(normalized) ||
    isEvidenceEnvironmentFileName(name) ||
    isEvidenceSecretOrRuntimeName(normalized, { includeDeployedState: true })
  );
}

function hasSensitiveStateDbSourceTargetPayload(normalizedTarget: string): boolean {
  return [...normalizedTarget.matchAll(/\bsourcetarget\s*=\s*\(([^)]*)\)/g)]
    .some(([, value]) => {
      const normalizedValue = normalizeStateDbTarget(value.replace(/[),;]+$/g, ''));
      const name = basename(normalizedValue);
      return (
        isEvidenceEnvironmentFileName(name) ||
        isEvidenceRuntimeDatabaseTarget(normalizedValue) ||
        isEvidenceSecretOrRuntimeName(normalizedValue, { includeDeployedState: true })
      );
    });
}

function hasSensitiveStateDbTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\/\s,;=()]+/)
    .some(segment => {
      const normalizedSegment = segment.replace(/[),;]+$/g, '');
      return (
        segment !== normalizedTarget &&
        (isEvidenceEnvironmentFileName(normalizedSegment) ||
          isEvidenceSecretOrRuntimeName(normalizedSegment, { includeDeployedState: true }))
      );
    });
}

function isInsidePath(path: string, parent: string): boolean {
  const relativePath = relative(parent, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}
