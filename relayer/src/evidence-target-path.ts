import { readFileSync, realpathSync } from 'fs';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'path';
import {
  evidenceTargetInspectionVariants,
  hasEvidenceLocalOnlyInspectionReference,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from './evidence-sensitive-target.js';
import { classifyPublicationClaimText } from './publication-claim-boundary.js';

export interface EvidenceTargetRead {
  errors: string[];
  label: string;
  markdown: string;
}

const blockedTargetLabel = '<blocked evidence target>';

export function validateEvidenceTargetPath(target: string): string[] {
  const label = formatEvidenceTargetLabel(target);
  const normalized = normalizeEvidencePathTarget(target);
  const name = basename(normalized);
  const extension = extname(name);
  const isLocalAbsolutePath = isLocalAbsoluteTarget(normalized);
  const isLocalFileUrlPath = isLocalFileUrl(normalized);
  const isUriSchemeTarget =
    hasUriSchemeTarget(normalized) && !isLocalAbsolutePath && !isLocalFileUrlPath;
  const escapesBridgeRootPath = escapesBridgeRoot(normalized);
  const hasEnvironmentTargetBinding = hasEvidenceEnvironmentTarget(normalized);
  const hasRuntimeDatabaseTargetBinding = hasEvidenceRuntimeOrSecretBindingTarget(normalized);
  const hasLocalOnlyTargetBinding = hasEvidenceLocalOnlyTarget(normalized);
  const isRuntimeDatabasePath = hasEvidenceRuntimeDatabasePathTarget(normalized);
  const errors: string[] = [];

  if (extension !== '.md') {
    errors.push(`${label}: evidence validator only accepts Markdown evidence files`);
  }
  if (isLocalAbsolutePath) {
    errors.push(`${label}: refusing to read local absolute evidence paths`);
  }
  if (isLocalFileUrlPath) {
    errors.push(`${label}: refusing to read local file URLs as evidence`);
  }
  if (isUriSchemeTarget) {
    errors.push(`${label}: refusing to read URI evidence targets`);
  }
  if (escapesBridgeRootPath) {
    errors.push(`${label}: refusing to read evidence paths outside the bridge repository`);
  }
  if (hasLocalOnlyTargetBinding) {
    errors.push(`${label}: refusing to read local-only evidence target references`);
  }
  if (hasClaimEscalatingEvidenceTarget(normalized)) {
    errors.push(`${label}: evidence target must not use production claim wording`);
  }
  if (isEvidenceEnvironmentFileName(name) || hasEnvironmentTargetBinding) {
    errors.push(`${label}: refusing to read environment files as evidence`);
  }
  if (hasRuntimeDatabaseTargetBinding) {
    errors.push(`${label}: refusing to read secret-bearing or runtime-state paths as evidence`);
  }
  if (isRuntimeDatabasePath) {
    errors.push(`${label}: refusing to read runtime database files as evidence`);
  }
  if (hasEvidenceSecretOrRuntimeName(normalized)) {
    errors.push(`${label}: refusing to read secret-bearing or runtime-state paths as evidence`);
  }

  return errors;
}

export function formatEvidenceTargetLabel(target: string): string {
  const trimmedTarget = target.trim();
  const normalized = normalizeEvidencePathTarget(target);
  const name = basename(normalized);
  const extension = extname(name);
  const isLocalAbsolutePath = isLocalAbsoluteTarget(normalized) || isLocalFileUrl(normalized);
  const isUriSchemeTarget =
    hasUriSchemeTarget(normalized) &&
    !isLocalAbsoluteTarget(normalized) &&
    !isLocalFileUrl(normalized);
  const escapesBridgeRootPath = escapesBridgeRoot(normalized);
  const hasEnvironmentTargetBinding = hasEvidenceEnvironmentTarget(normalized);
  const hasRuntimeDatabaseTargetBinding = hasEvidenceRuntimeOrSecretBindingTarget(normalized);
  const hasLocalOnlyTargetBinding = hasEvidenceLocalOnlyTarget(normalized);
  const isSensitiveName =
    hasEnvironmentTargetBinding ||
    hasRuntimeDatabaseTargetBinding ||
    hasLocalOnlyTargetBinding ||
    isEvidenceEnvironmentFileName(name) ||
    hasEvidenceSecretOrRuntimeName(normalized);
  const isRuntimeDatabasePath = hasEvidenceRuntimeDatabasePathTarget(normalized);

  if (isSensitiveName) return blockedTargetLabel;
  if (isUriSchemeTarget) return blockedTargetLabel;
  if (escapesBridgeRootPath) return blockedTargetLabel;
  if (isLocalAbsolutePath) return blockedTargetLabel;
  if (isRuntimeDatabasePath) return name;
  return trimmedTarget;
}

function normalizeEvidencePathTarget(target: string): string {
  return target.trim().replace(/\\/g, '/').toLowerCase();
}

function hasClaimEscalatingEvidenceTarget(normalizedTarget: string): boolean {
  const comparableTarget = normalizedTarget.split('#')[0].split('?')[0].replace(/[),;]+$/g, '');
  const claim = classifyPublicationClaimText(comparableTarget);
  return claim.hasProductionClaim;
}

function hasEvidenceEnvironmentTarget(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(candidate => {
    const name = basename(candidate);
    return isEvidenceEnvironmentFileName(name) || hasEnvironmentTargetSegment(candidate);
  });
}

function hasEvidenceRuntimeOrSecretBindingTarget(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(candidate =>
    hasRuntimeDatabaseTargetSegment(candidate) || isEvidenceSecretOrRuntimeName(candidate),
  );
}

function hasEvidenceRuntimeDatabasePathTarget(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(candidate =>
    isEvidenceRuntimeDatabaseTarget(candidate),
  );
}

function hasEvidenceLocalOnlyTarget(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(candidate =>
    hasEvidenceLocalOnlyInspectionReference(candidate),
  );
}

function hasEvidenceSecretOrRuntimeName(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(candidate =>
    isEvidenceSecretOrRuntimeName(candidate),
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

function isLocalFileUrl(normalized: string): boolean {
  return /^file:\/\/\/(?:[a-z]:|\/)/i.test(normalized);
}

function hasUriSchemeTarget(normalized: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(normalized);
}

function escapesBridgeRoot(normalized: string): boolean {
  if (isLocalAbsoluteTarget(normalized) || isLocalFileUrl(normalized) || hasUriSchemeTarget(normalized)) {
    return false;
  }

  let depthFromRelayer = 0;
  const parts = normalized.split('/').filter(part => part.length > 0 && part !== '.');
  for (const part of parts) {
    if (part === '..') {
      depthFromRelayer -= 1;
    } else {
      depthFromRelayer += 1;
    }

    if (depthFromRelayer < -1) {
      return true;
    }
  }

  return false;
}

export function readEvidenceMarkdownTarget(target: string): EvidenceTargetRead {
  const trimmedTarget = target.trim();
  const label = formatEvidenceTargetLabel(trimmedTarget);
  const errors = validateEvidenceTargetPath(trimmedTarget);
  if (errors.length > 0) return { errors, label, markdown: '' };

  try {
    const bridgeRoot = realpathSync(resolve(process.cwd(), '..'));
    const evidencePath = realpathSync(resolve(process.cwd(), trimmedTarget));
    if (!isInsidePath(evidencePath, bridgeRoot)) {
      const resolvedLabel = formatResolvedEvidenceTargetLabel(trimmedTarget);
      return {
        errors: [`${resolvedLabel}: refusing to read evidence paths outside the bridge repository`],
        label: resolvedLabel,
        markdown: '',
      };
    }

    return { errors: [], label, markdown: readFileSync(evidencePath, 'utf8') };
  } catch {
    const resolvedLabel = formatResolvedEvidenceTargetLabel(trimmedTarget);
    return { errors: [`${resolvedLabel}: evidence file could not be read`], label: resolvedLabel, markdown: '' };
  }
}

function formatResolvedEvidenceTargetLabel(target: string): string {
  const label = formatEvidenceTargetLabel(target);
  if (label === blockedTargetLabel) {
    return label;
  }

  try {
    const bridgeRoot = realpathSync(resolve(process.cwd(), '..'));
    const resolvedTarget = resolve(process.cwd(), target);
    if (!isInsidePath(resolvedTarget, bridgeRoot)) {
      return blockedTargetLabel;
    }
    const evidencePath = realpathSync(resolvedTarget);
    return isInsidePath(evidencePath, bridgeRoot) ? label : blockedTargetLabel;
  } catch {
    try {
      const bridgeRoot = realpathSync(resolve(process.cwd(), '..'));
      const resolvedTarget = resolve(process.cwd(), target);
      if (!isInsidePath(resolvedTarget, bridgeRoot)) {
        return blockedTargetLabel;
      }
      const nearestExistingAncestor = realpathNearestExistingAncestor(resolvedTarget);
      return isInsidePath(nearestExistingAncestor, bridgeRoot) ? label : blockedTargetLabel;
    } catch {
      return label;
    }
  }
}

function realpathNearestExistingAncestor(target: string): string {
  let cursor = target;
  while (true) {
    try {
      return realpathSync(cursor);
    } catch {
      const parent = dirname(cursor);
      if (parent === cursor) {
        throw new Error(`No existing ancestor for ${target}`);
      }
      cursor = parent;
    }
  }
}

function isInsidePath(path: string, parent: string): boolean {
  const relativePath = relative(parent, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}
