import { readFileSync, realpathSync } from 'fs';
import { basename, extname, isAbsolute, relative, resolve } from 'path';
import {
  evidenceTargetInspectionVariants,
  hasEvidenceLocalOnlyInspectionReference,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from './evidence-sensitive-target.js';
import { classifyPublicationClaimText } from './publication-claim-boundary.js';

export interface EvidenceJsonTargetRead {
  errors: string[];
  label: string;
  json?: unknown;
}

const blockedTargetLabel = '<blocked JSON evidence target>';

export function readEvidenceJsonTarget(target: string, optionName = '--json'): EvidenceJsonTargetRead {
  const trimmedTarget = target.trim();
  const label = formatEvidenceJsonTargetLabel(trimmedTarget);
  const errors = validateEvidenceJsonTargetPath(trimmedTarget, optionName);
  if (errors.length > 0) return { errors, label };

  try {
    const bridgeRoot = realpathSync(resolve(process.cwd(), '..'));
    const evidencePath = realpathSync(resolve(process.cwd(), trimmedTarget));
    if (!isInsidePath(evidencePath, bridgeRoot)) {
      return {
        errors: [`${blockedTargetLabel}: ${optionName} must resolve inside the bridge repository`],
        label: blockedTargetLabel,
      };
    }

    return { errors: [], label, json: JSON.parse(readFileSync(evidencePath, 'utf8')) };
  } catch (error: any) {
    const message = error instanceof SyntaxError ? 'JSON evidence could not be parsed' : 'JSON evidence file could not be read';
    return { errors: [`${label}: ${message}`], label };
  }
}

export function validateEvidenceJsonTargetPath(target: string, optionName: string): string[] {
  const label = formatEvidenceJsonTargetLabel(target);
  const normalized = normalizeEvidenceJsonPathTarget(target);
  const name = basename(normalized);
  const extension = extname(name);
  const errors: string[] = [];

  if (target.trim().length === 0) {
    errors.push(`${label}: ${optionName} must not be empty`);
  }
  if (extension !== '.json') {
    errors.push(`${label}: ${optionName} must be a JSON evidence file`);
  }
  if (isLocalAbsoluteTarget(normalized)) {
    errors.push(`${label}: refusing to read local absolute JSON evidence paths`);
  }
  if (isLocalFileUrl(normalized)) {
    errors.push(`${label}: refusing to read local file URLs as JSON evidence`);
  }
  if (hasUriSchemeTarget(normalized) && !isLocalAbsoluteTarget(normalized) && !isLocalFileUrl(normalized)) {
    errors.push(`${label}: refusing to read URI JSON evidence targets`);
  }
  if (escapesBridgeRoot(normalized)) {
    errors.push(`${label}: ${optionName} must resolve inside the bridge repository`);
  }
  if (hasLocalOnlyEvidenceTarget(normalized)) {
    errors.push(`${label}: refusing to read local-only JSON evidence target references`);
  }
  if (hasClaimEscalatingEvidenceJsonTarget(normalized)) {
    errors.push(`${label}: ${optionName} target must not use production claim wording`);
  }
  if (isSensitiveOrRuntimeTarget(normalized)) {
    errors.push(`${label}: refusing to read secret-bearing or runtime-state JSON evidence`);
  }

  return errors;
}

function formatEvidenceJsonTargetLabel(target: string): string {
  const trimmedTarget = target.trim();
  const normalized = normalizeEvidenceJsonPathTarget(target);
  if (
    isSensitiveOrRuntimeTarget(normalized) ||
    hasLocalOnlyEvidenceTarget(normalized) ||
    escapesBridgeRoot(normalized) ||
    isLocalAbsoluteTarget(normalized) ||
    isLocalFileUrl(normalized) ||
    hasUriSchemeTarget(normalized)
  ) {
    return blockedTargetLabel;
  }
  return trimmedTarget;
}

function normalizeEvidenceJsonPathTarget(target: string): string {
  return target.trim().replace(/\\/g, '/').toLowerCase();
}

function hasClaimEscalatingEvidenceJsonTarget(normalized: string): boolean {
  const comparableTarget = normalized.split('#')[0].split('?')[0].replace(/[),;]+$/g, '');
  const claim = classifyPublicationClaimText(comparableTarget);
  return claim.hasProductionClaim;
}

function isSensitiveOrRuntimeTarget(normalized: string): boolean {
  return evidenceTargetInspectionVariants(normalized).some(isSensitiveOrRuntimeInspectionTarget);
}

function hasLocalOnlyEvidenceTarget(normalized: string): boolean {
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

    if (depthFromRelayer < -1) return true;
  }

  return false;
}

function isInsidePath(path: string, parent: string): boolean {
  const relativePath = relative(parent, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}
