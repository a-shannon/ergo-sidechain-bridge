import { createHash } from 'crypto';
import { readFileSync, realpathSync } from 'fs';
import { isAbsolute, relative, resolve } from 'path';

import type {
  AuthenticatedV2ContractInputs,
  ProvisioningContractInput,
} from './authenticated-v2-contract-sources.js';

export const AUTHENTICATED_V2_CANONICAL_TEMPLATE_SHA256 = {
  tracker: 'bd74c503fc615df49664fd8b9d9c76095b17d32c63be0b9903f6343f93c71558',
  unlock: 'a90cffcc26373c2861524b81368834a803372d705fd33c16913b22b79c08e82e',
  duplicatePrevention: 'c4947b034b40ebf8c6385d48da1e8c109a98958cb9c1d5431b9714853ad24a33',
} as const;

const CONTRACT_PATHS = {
  tracker: 'contracts/SPVTrackerAuthenticated.es',
  unlock: 'contracts/MainChainAggregateUnlockAuthenticated.es',
  duplicatePrevention: 'contracts/DoubleUnlockPreventionAuthenticated.es',
} as const;

export interface AuthenticatedV2ContractTemplate {
  sourceTemplate: string;
  sourceTemplateSha256Hex: string;
}

export type AuthenticatedV2ContractTemplates = Record<
  keyof typeof CONTRACT_PATHS,
  AuthenticatedV2ContractTemplate
>;

export type AuthenticatedV2ContractTrees = Record<keyof typeof CONTRACT_PATHS, string>;

export function loadCanonicalAuthenticatedV2ContractTemplates(
  bridgeRootInput: string,
): AuthenticatedV2ContractTemplates {
  const bridgeRoot = realpathSync(bridgeRootInput);
  const entries = (Object.keys(CONTRACT_PATHS) as Array<keyof typeof CONTRACT_PATHS>).map(role => {
    const sourcePath = realpathSync(resolve(bridgeRoot, CONTRACT_PATHS[role]));
    const relativePath = relative(bridgeRoot, sourcePath);
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new Error(`canonical authenticated V2 ${role} source must remain inside the bridge repository`);
    }
    const sourceTemplate = readFileSync(sourcePath, 'utf8');
    const sourceTemplateSha256Hex = sha256Utf8(sourceTemplate);
    if (sourceTemplateSha256Hex !== AUTHENTICATED_V2_CANONICAL_TEMPLATE_SHA256[role]) {
      throw new Error(`checked-in ${role} contract source does not match its canonical code pin`);
    }
    return [role, { sourceTemplate, sourceTemplateSha256Hex }];
  });
  return deepFreeze(Object.fromEntries(entries) as AuthenticatedV2ContractTemplates);
}

export function buildAuthenticatedV2ContractInputs(
  templates: AuthenticatedV2ContractTemplates,
  trees: AuthenticatedV2ContractTrees,
): AuthenticatedV2ContractInputs {
  const contract = (role: keyof AuthenticatedV2ContractTemplates): ProvisioningContractInput => ({
    sourceTemplate: templates[role].sourceTemplate,
    sourceTemplateSha256Hex: templates[role].sourceTemplateSha256Hex,
    ergoTreeHex: trees[role],
    ergoTreeSha256Hex: sha256Bytes(Buffer.from(trees[role], 'hex')),
  });
  return {
    tracker: contract('tracker'),
    unlock: contract('unlock'),
    duplicatePrevention: contract('duplicatePrevention'),
  };
}

function sha256Utf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sha256Bytes(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
