import { existsSync, realpathSync } from 'fs';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'path';
import {
  evidenceTargetInspectionVariants,
  hasEvidenceLocalOnlyInspectionReference,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from './evidence-sensitive-target.js';
import { classifyPublicationClaimText } from './publication-claim-boundary.js';

export interface ResolvedEvidenceJsonOutputPath {
  path?: string;
  errors: string[];
}

export interface EvidenceJsonOutputPathOptions {
  workspaceRoot?: string;
  bridgeRoot?: string;
  optionName?: string;
}

const blockedOutputTargetLabel = '<blocked output target>';

export function resolveEvidenceJsonOutputPath(
  target: string,
  options: EvidenceJsonOutputPathOptions = {},
): ResolvedEvidenceJsonOutputPath {
  const trimmedTarget = target.trim();
  const errors = validateEvidenceJsonOutputPath(target, options);
  if (errors.length > 0) return { errors };

  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
  const outputPath = resolve(workspaceRoot, trimmedTarget);
  return { path: outputPath, errors: [] };
}

export function validateEvidenceJsonOutputPath(
  target: string,
  options: EvidenceJsonOutputPathOptions = {},
): string[] {
  const optionName = options.optionName ?? '--json-out';
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
  const bridgeRoot = resolve(options.bridgeRoot ?? resolve(workspaceRoot, '..'));
  const trimmedTarget = target.trim();
  const normalized = normalizeEvidenceJsonOutputTarget(target);
  const errors: string[] = [];

  if (trimmedTarget.length === 0) {
    errors.push(`${optionName} must not be empty`);
  }
  if (extname(basename(normalized)) !== '.json') {
    errors.push(`${optionName} must be a JSON file`);
  }
  if (isLocalAbsoluteTarget(normalized)) {
    errors.push(`${optionName} must be a relative path inside the bridge repository`);
  }
  if (hasUriSchemeTarget(normalized)) {
    errors.push(`${optionName} must not be a URI`);
  }
  if (isLocalOnlyEvidenceTarget(normalized)) {
    errors.push(`${optionName} ${blockedOutputTargetLabel} must not reference local-only evidence target bindings`);
  }
  if (hasClaimEscalatingEvidenceJsonOutputTarget(normalized)) {
    errors.push(`${optionName} ${blockedOutputTargetLabel} must not use production claim wording`);
  }
  if (isSensitiveOrRuntimeTarget(normalized)) {
    errors.push(`${optionName} ${blockedOutputTargetLabel} must not target runtime or secret-bearing material`);
  }
  if (!isLocalAbsoluteTarget(normalized) && !hasUriSchemeTarget(normalized)) {
    const escapedError = validateResolvedInsideBridge(trimmedTarget, workspaceRoot, bridgeRoot, optionName);
    if (escapedError) errors.push(escapedError);
  }

  return errors;
}

function validateResolvedInsideBridge(
  target: string,
  workspaceRoot: string,
  bridgeRoot: string,
  optionName: string,
): string | undefined {
  let resolvedBridgeRoot: string;
  try {
    resolvedBridgeRoot = realpathSync(bridgeRoot);
  } catch {
    return `${optionName} bridge root could not be resolved`;
  }

  const resolvedTarget = resolve(workspaceRoot, target);
  const finalTarget = existsSync(resolvedTarget) ? realpathSync(resolvedTarget) : resolvedTarget;
  const nearestExistingAncestor = realpathNearestExistingAncestor(resolvedTarget);
  return isInsidePath(finalTarget, resolvedBridgeRoot) && isInsidePath(nearestExistingAncestor, resolvedBridgeRoot)
    ? undefined
    : `${optionName} ${blockedOutputTargetLabel} must resolve inside the bridge repository`;
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

function isSensitiveOrRuntimeTarget(normalized: string): boolean {
  return evidenceTargetInspectionVariants(normalized).some(isSensitiveOrRuntimeInspectionTarget);
}

function normalizeEvidenceJsonOutputTarget(target: string): string {
  return target.trim().replace(/\\/g, '/').toLowerCase();
}

function hasClaimEscalatingEvidenceJsonOutputTarget(normalized: string): boolean {
  const comparableTarget = normalized.split('#')[0].split('?')[0].replace(/[),;]+$/g, '');
  const claim = classifyPublicationClaimText(comparableTarget);
  return claim.hasProductionClaim;
}

function isLocalOnlyEvidenceTarget(normalized: string): boolean {
  return evidenceTargetInspectionVariants(normalized).some(candidate =>
    hasEvidenceLocalOnlyInspectionReference(candidate),
  );
}

function isSensitiveOrRuntimeInspectionTarget(normalized: string): boolean {
  const name = basename(normalized);
  return (
    hasEnvironmentTargetSegment(normalized) ||
    hasRuntimeDatabaseTargetSegment(normalized) ||
    isEvidenceEnvironmentFileName(name) ||
    isEvidenceSecretOrRuntimeName(normalized, { includeDeployedState: true }) ||
    isEvidenceRuntimeDatabaseTarget(normalized)
  );
}

function hasEnvironmentTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\/\s,;=()]+/)
    .some(segment => segment !== normalizedTarget && isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasRuntimeDatabaseTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\s,;=()]+/)
    .some(segment => segment !== normalizedTarget && isEvidenceRuntimeDatabaseTarget(segment.replace(/[),;]+$/g, '')));
}

function isLocalAbsoluteTarget(normalized: string): boolean {
  return /^[a-z]:\//i.test(normalized) || normalized.startsWith('/');
}

function hasUriSchemeTarget(normalized: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(normalized);
}

function isInsidePath(path: string, parent: string): boolean {
  const relativePath = relative(parent, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}
