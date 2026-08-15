import { createHash } from 'crypto';
import blakejs from 'blakejs';

const TRACKER_NFT_PLACEHOLDER = 'TRACKER_NFT_ID_PLACEHOLDER';
const DUP_NFT_PLACEHOLDER = 'DUP_NFT_ID_PLACEHOLDER';
const AUTHENTICATED_UNLOCK_HASH_PLACEHOLDER = 'AUTHENTICATED_UNLOCK_HASH_PLACEHOLDER';

export interface ProvisioningContractInput {
  sourceTemplate: string;
  sourceTemplateSha256Hex: string;
  ergoTreeHex: string;
  ergoTreeSha256Hex: string;
}

export interface AuthenticatedV2ContractInputs {
  tracker: ProvisioningContractInput;
  unlock: ProvisioningContractInput;
  duplicatePrevention: ProvisioningContractInput;
}

export interface ProvisioningContractBinding {
  templateSha256Hex: string;
  resolvedSourceSha256Hex: string;
  ergoTreeHex: string;
  ergoTreeSha256Hex: string;
}

export interface ResolvedAuthenticatedV2ContractSource extends ProvisioningContractBinding {
  source: string;
}

export interface ResolvedAuthenticatedV2ContractSources {
  tracker: ResolvedAuthenticatedV2ContractSource;
  unlock: ResolvedAuthenticatedV2ContractSource;
  duplicatePrevention: ResolvedAuthenticatedV2ContractSource;
  authenticatedUnlockErgoTreeHashHex: string;
}

export function resolveAuthenticatedV2ContractSources(
  input: AuthenticatedV2ContractInputs,
  trackerNftIdInput: string,
  duplicatePreventionNftIdInput: string,
): ResolvedAuthenticatedV2ContractSources {
  const trackerNftId = fixedHex(trackerNftIdInput, 32, 'tracker NFT ID');
  const duplicatePreventionNftId = fixedHex(
    duplicatePreventionNftIdInput,
    32,
    'duplicate-prevention NFT ID',
  );
  const tracker = validateContractPin(input.tracker, 'tracker');
  const unlockInput = validateContractPin(input.unlock, 'authenticated unlock');
  const dupInput = validateContractPin(input.duplicatePrevention, 'authenticated DUP');
  if (tracker.ergoTreeHex === unlockInput.ergoTreeHex
    || tracker.ergoTreeHex === dupInput.ergoTreeHex
    || unlockInput.ergoTreeHex === dupInput.ergoTreeHex) {
    throw new Error('authenticated tracker, unlock, and DUP ErgoTrees must be distinct');
  }
  const unlockSource = resolveTemplate(
    unlockInput.sourceTemplate,
    [
      [TRACKER_NFT_PLACEHOLDER, trackerNftId],
      [DUP_NFT_PLACEHOLDER, duplicatePreventionNftId],
    ],
    'authenticated unlock source',
  );
  const unlockErgoTreeHashHex = blake2b256Hex(Buffer.from(unlockInput.ergoTreeHex, 'hex'));
  const dupSource = resolveTemplate(
    dupInput.sourceTemplate,
    [
      [TRACKER_NFT_PLACEHOLDER, trackerNftId],
      [AUTHENTICATED_UNLOCK_HASH_PLACEHOLDER, unlockErgoTreeHashHex],
    ],
    'authenticated DUP source',
  );
  if (
    tracker.sourceTemplate.includes(TRACKER_NFT_PLACEHOLDER)
    || tracker.sourceTemplate.includes(DUP_NFT_PLACEHOLDER)
    || tracker.sourceTemplate.includes(AUTHENTICATED_UNLOCK_HASH_PLACEHOLDER)
  ) {
    throw new Error('authenticated tracker source must not contain deployment placeholders');
  }
  return {
    tracker: {
      templateSha256Hex: tracker.templateSha256Hex,
      resolvedSourceSha256Hex: sha256Utf8(tracker.sourceTemplate),
      source: tracker.sourceTemplate,
      ergoTreeHex: tracker.ergoTreeHex,
      ergoTreeSha256Hex: tracker.ergoTreeSha256Hex,
    },
    unlock: {
      templateSha256Hex: unlockInput.templateSha256Hex,
      resolvedSourceSha256Hex: sha256Utf8(unlockSource),
      source: unlockSource,
      ergoTreeHex: unlockInput.ergoTreeHex,
      ergoTreeSha256Hex: unlockInput.ergoTreeSha256Hex,
    },
    duplicatePrevention: {
      templateSha256Hex: dupInput.templateSha256Hex,
      resolvedSourceSha256Hex: sha256Utf8(dupSource),
      source: dupSource,
      ergoTreeHex: dupInput.ergoTreeHex,
      ergoTreeSha256Hex: dupInput.ergoTreeSha256Hex,
    },
    authenticatedUnlockErgoTreeHashHex: unlockErgoTreeHashHex,
  };
}

function validateContractPin(input: ProvisioningContractInput, label: string): {
  sourceTemplate: string;
  templateSha256Hex: string;
  ergoTreeHex: string;
  ergoTreeSha256Hex: string;
} {
  if (typeof input.sourceTemplate !== 'string' || input.sourceTemplate.trim().length === 0) {
    throw new Error(`${label} source template must be non-empty`);
  }
  const templateSha256Hex = fixedHex(input.sourceTemplateSha256Hex, 32, `${label} template SHA-256`);
  if (sha256Utf8(input.sourceTemplate) !== templateSha256Hex) {
    throw new Error(`${label} source template does not match its SHA-256 pin`);
  }
  const ergoTreeHex = variableHex(input.ergoTreeHex, `${label} ErgoTree`);
  const ergoTreeSha256Hex = fixedHex(input.ergoTreeSha256Hex, 32, `${label} ErgoTree SHA-256`);
  if (sha256Bytes(Buffer.from(ergoTreeHex, 'hex')) !== ergoTreeSha256Hex) {
    throw new Error(`${label} ErgoTree does not match its SHA-256 pin`);
  }
  return { sourceTemplate: input.sourceTemplate, templateSha256Hex, ergoTreeHex, ergoTreeSha256Hex };
}

function resolveTemplate(
  source: string,
  replacements: Array<[string, string]>,
  label: string,
): string {
  let resolved = source;
  for (const [placeholder, value] of replacements) {
    if (!resolved.includes(placeholder)) {
      throw new Error(`${label} is missing ${placeholder}`);
    }
    resolved = resolved.replaceAll(placeholder, value);
  }
  for (const placeholder of [
    TRACKER_NFT_PLACEHOLDER,
    DUP_NFT_PLACEHOLDER,
    AUTHENTICATED_UNLOCK_HASH_PLACEHOLDER,
  ]) {
    if (resolved.includes(placeholder)) {
      throw new Error(`${label} retains unresolved ${placeholder}`);
    }
  }
  return resolved;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  const clean = typeof value === 'string' && value.startsWith('0x') ? value.slice(2) : value;
  if (typeof clean !== 'string' || !/^[0-9a-fA-F]+$/.test(clean) || clean.length !== bytes * 2) {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  return clean.toLowerCase();
}

function variableHex(value: unknown, label: string): string {
  const clean = typeof value === 'string' && value.startsWith('0x') ? value.slice(2) : value;
  if (
    typeof clean !== 'string'
    || clean.length === 0
    || clean.length % 2 !== 0
    || !/^[0-9a-fA-F]+$/.test(clean)
  ) {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  return clean.toLowerCase();
}

function sha256Utf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sha256Bytes(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function blake2b256Hex(value: Buffer): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}
