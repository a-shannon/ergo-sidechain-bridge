import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

import { parseStrictJson } from './strict-json.js';
import {
  assertPinnedSubstrateFederatedTrackerV2ReserveV7FamilyFixtureV1,
  type ValidateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1Input,
} from './substrate-federated-tracker-v2-reserve-v7-family-identity-v1.js';

export const SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V2_SOURCES_SCHEMA =
  'e2s.substrate-federated-settlement-family-sources.v2' as const;

const ROLES = [
  'tracker', 'duplicatePrevention', 'sourceLock', 'pooledReserve',
] as const;
type Role = typeof ROLES[number];
const PATHS = [
  'contracts/SPVTrackerSubstrateFederatedV2.es',
  'contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
  'contracts/MainChainLockPooledReserveV6.es',
  'contracts/MainChainPooledReserveValidityApplicationV7.es',
] as const;

/**
 * Resolves only the selected public four-contract fixture. Its JVM receipt is
 * a pinned static input, not evidence of a compiler process or an active box.
 */
export function resolvePinnedSubstrateFederatedSettlementFamilyV2Sources(
  input: ValidateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1Input,
) {
  exactKeys(input, ['receiptBytes', 'intentBytes', 'admissionBytes', 'templates'], 'fixture input');
  if (!Array.isArray(input.templates) || input.templates.length !== ROLES.length) {
    throw new Error('V2/V7 family requires exactly four ordered templates');
  }
  const snapshot = {
    receiptBytes: copyBytes(input.receiptBytes, 'receipt', 32 * 1024),
    intentBytes: copyBytes(input.intentBytes, 'intent', 8 * 1024),
    admissionBytes: copyBytes(input.admissionBytes, 'admission', 8 * 1024),
    templates: input.templates.map((template, index) => {
      exactKeys(template, ['role', 'relativePath', 'sourceBytes'], 'template');
      if (template.role !== ROLES[index] || template.relativePath !== PATHS[index]) {
        throw new Error('V2/V7 family template role or path drifted');
      }
      return {
        role: template.role,
        relativePath: template.relativePath,
        sourceBytes: copyBytes(template.sourceBytes, template.role, 64 * 1024),
      };
    }),
  };
  const identity = assertPinnedSubstrateFederatedTrackerV2ReserveV7FamilyFixtureV1(snapshot);
  const intent = record(parseStrictJson(
    new TextDecoder('utf-8', { fatal: true }).decode(snapshot.intentBytes),
    'V2/V7 intent',
  ), 'V2/V7 intent');
  const tracker = record(intent.tracker, 'tracker');
  const application = record(intent.application, 'application');
  const family = record(intent.family, 'family');
  const familyId = identity.familyIdHex;
  const ids = identity.contracts;
  const keys = tracker.ergoAdmissionPublicKeysHex as readonly string[];
  const sigmaProps = keys.map(key =>
    'proveDlog(decodePoint(fromBase16("' + key + '")))'
  ).join(',\n    ');
  const sourceText = Object.fromEntries(snapshot.templates.map(template => [
    template.role, template.sourceBytes.toString('ascii'),
  ])) as Record<Role, string>;

  const resolved: Record<Role, string> = {
    tracker: replaceExactly(sourceText.tracker, [
      ['FEDERATED_TRACKER_NFT_ID_PLACEHOLDER', str(tracker, 'trackerNftIdHex')],
      ['FEDERATED_SOURCE_NETWORK_ID_PLACEHOLDER', str(application, 'sourceNetworkIdHex')],
      ['FEDERATED_SIDECHAIN_ID_PLACEHOLDER', str(application, 'sidechainIdHex')],
      ['FEDERATED_BRIDGE_ADDRESS_PLACEHOLDER', str(application, 'bridgeAddressHex')],
      ['FEDERATED_TOKEN_ADDRESS_PLACEHOLDER', str(application, 'tokenAddressHex')],
      ['FEDERATED_BRIDGE_RUNTIME_HASH_PLACEHOLDER', str(application, 'bridgeRuntimeCodeSha256Hex')],
      ['FEDERATED_BRIDGE_RUNTIME_BYTES_PLACEHOLDER', uint32(application.bridgeRuntimeCodeBytes)],
      ['FEDERATED_TOKEN_RUNTIME_HASH_PLACEHOLDER', str(application, 'tokenRuntimeCodeSha256Hex')],
      ['FEDERATED_TOKEN_RUNTIME_BYTES_PLACEHOLDER', uint32(application.tokenRuntimeCodeBytes)],
      ['FEDERATED_SOURCE_RUNTIME_HASH_PLACEHOLDER', str(application, 'sourceRuntimeCodeSha256Hex')],
      ['FEDERATED_SOURCE_RUNTIME_BYTES_PLACEHOLDER', uint32(application.sourceRuntimeCodeBytes)],
      ['FEDERATED_RUNTIME_PROFILE_ID_PLACEHOLDER', str(application, 'runtimeProfileIdHex')],
      ['FEDERATED_SETTLEMENT_PROFILE_ID_PLACEHOLDER', str(application, 'settlementProfileIdHex')],
      ['FEDERATED_PROFILE_ID_PLACEHOLDER', str(tracker, 'federationProfileIdHex')],
      ['FEDERATED_SOURCE_KEY_SET_DIGEST_PLACEHOLDER', str(tracker, 'sourceAttestationKeySetDigestHex')],
      ['FEDERATED_SOURCE_THRESHOLD_PLACEHOLDER', uint16(tracker.sourceAttestationThreshold)],
      ['FEDERATED_ERGO_KEY_SET_DIGEST_PLACEHOLDER', str(tracker, 'ergoAdmissionKeySetDigestHex')],
      ['FEDERATED_ERGO_THRESHOLD_BYTES_PLACEHOLDER', uint16(tracker.ergoAdmissionThreshold)],
      ['FEDERATED_EPOCH_PLACEHOLDER', uint64(tracker.federationEpoch)],
      ['FEDERATED_MAX_ADMISSION_VALIDITY_BLOCKS_PLACEHOLDER',
        str(tracker, 'maxAdmissionValidityBlocks') + 'L'],
      ['FEDERATED_ERGO_SIGMAPROP_PLACEHOLDERS', sigmaProps],
      ['FEDERATED_ERGO_THRESHOLD_PLACEHOLDER', String(tracker.ergoAdmissionThreshold)],
    ], 'tracker'),
    duplicatePrevention: replaceExactly(sourceText.duplicatePrevention, [
      ['FEDERATED_SETTLEMENT_TRACKER_NFT_ID_PLACEHOLDER', str(tracker, 'trackerNftIdHex')],
      ['FEDERATED_SETTLEMENT_DUP_NFT_ID_PLACEHOLDER', str(family, 'duplicatePreventionNftIdHex')],
      ['FEDERATED_SETTLEMENT_RESERVE_NFT_ID_PLACEHOLDER', str(family, 'pooledReserveNftIdHex')],
      ['FEDERATED_SETTLEMENT_FAMILY_ID_PLACEHOLDER', familyId],
      ['FEDERATED_SETTLEMENT_TRACKER_CONTRACT_ID_PLACEHOLDER', ids.tracker.contractIdHex],
      ['FEDERATED_SETTLEMENT_SOURCE_NETWORK_ID_PLACEHOLDER', str(application, 'sourceNetworkIdHex')],
      ['FEDERATED_SETTLEMENT_SIDECHAIN_ID_PLACEHOLDER', str(application, 'sidechainIdHex')],
      ['FEDERATED_SETTLEMENT_RUNTIME_PROFILE_ID_PLACEHOLDER', str(application, 'runtimeProfileIdHex')],
      ['FEDERATED_SETTLEMENT_PROFILE_ID_PLACEHOLDER', str(application, 'settlementProfileIdHex')],
      ['FEDERATED_SETTLEMENT_FEDERATION_PROFILE_ID_PLACEHOLDER', str(tracker, 'federationProfileIdHex')],
      ['FEDERATED_SETTLEMENT_ERGO_KEY_SET_DIGEST_PLACEHOLDER', str(tracker, 'ergoAdmissionKeySetDigestHex')],
      ['FEDERATED_SETTLEMENT_ERGO_THRESHOLD_PLACEHOLDER', uint16(tracker.ergoAdmissionThreshold)],
      ['FEDERATED_SETTLEMENT_EPOCH_PLACEHOLDER', uint64(tracker.federationEpoch)],
    ], 'duplicate prevention'),
    sourceLock: replaceExactly(sourceText.sourceLock, [
      ['POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER', str(application, 'sourceNetworkIdHex')],
      ['POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER', str(application, 'sidechainIdHex')],
      ['POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER', str(application, 'bridgeAddressHex')],
      ['POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER', str(application, 'tokenAddressHex')],
      ['POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER', str(application, 'settlementProfileIdHex')],
      ['POOLED_RESERVE_PROFILE_ID_PLACEHOLDER', familyId],
      ['POOLED_RESERVE_NFT_ID_PLACEHOLDER', str(family, 'pooledReserveNftIdHex')],
    ], 'source lock'),
    pooledReserve: replaceExactly(sourceText.pooledReserve, [
      ['POOLED_RESERVE_DUP_NFT_ID_PLACEHOLDER', str(family, 'duplicatePreventionNftIdHex')],
      ['POOLED_RESERVE_NFT_ID_PLACEHOLDER', str(family, 'pooledReserveNftIdHex')],
      ['POOLED_RESERVE_PROFILE_ID_PLACEHOLDER', familyId],
      ['POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER', str(application, 'sidechainIdHex')],
      ['POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER', str(application, 'sourceNetworkIdHex')],
      ['POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER', str(application, 'bridgeAddressHex')],
      ['POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER', str(application, 'tokenAddressHex')],
      ['POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER', str(application, 'settlementProfileIdHex')],
      ['POOLED_RESERVE_DUP_CONTRACT_ID_PLACEHOLDER', ids.duplicatePrevention.contractIdHex],
      ['POOLED_RESERVE_SOURCE_LOCK_CONTRACT_ID_PLACEHOLDER', ids.sourceLock.contractIdHex],
    ], 'pooled reserve'),
  };

  const contracts = ROLES.map((role, index) => {
    const bytes = Buffer.from(resolved[role], 'ascii');
    if (!bytes.equals(Buffer.from(resolved[role], 'utf8'))
      || bytes.length === 0 || bytes.length > 512 * 1024) {
      throw new Error(role + ' resolved source is outside the ASCII compiler bound');
    }
    const resolvedSourceSha256Hex = sha256(bytes);
    if (resolvedSourceSha256Hex !== ids[role].resolvedSourceSha256Hex) {
      throw new Error(role + ' resolved source binding drifted');
    }
    return Object.freeze({
      role,
      relativePath: PATHS[index],
      templateSha256Hex: sha256(snapshot.templates[index].sourceBytes),
      resolvedSourceSha256Hex,
      contractIdHex: ids[role].contractIdHex,
      source: resolved[role],
    });
  });
  return Object.freeze({
    schema: SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V2_SOURCES_SCHEMA,
    version: 2 as const,
    provenance: 'source-only-pinned-static-jvm-fixture' as const,
    receiptSha256Hex: identity.receiptSha256Hex,
    familyProfileHex: identity.familyProfileHex,
    familyIdHex: identity.familyIdHex,
    contracts: Object.freeze(contracts),
    boundaries: Object.freeze({
      processOwnedCompilationEstablished: false as const,
      targetGenesisBoxesObserved: false as const,
      profileActivated: false as const,
      productionReadinessEstablished: false as const,
    }),
  });
}

function replaceExactly(source: string, replacements: readonly (readonly [string, string])[], label: string): string {
  let result = source;
  for (const [placeholder, value] of replacements) {
    if (result.split(placeholder).length !== 2) {
      throw new Error(label + ' placeholder count drifted: ' + placeholder);
    }
    result = result.replace(placeholder, value);
  }
  if (/[A-Z][A-Z0-9_]+_PLACEHOLDERS?/.test(result) || result.includes('\r')
    || result.includes('\0')) {
    throw new Error(label + ' retained an invalid placeholder or byte');
  }
  return result;
}

function copyBytes(value: Uint8Array, label: string, maximum: number): Buffer {
  if (!(value instanceof Uint8Array) || value.length === 0 || value.length > maximum) {
    throw new Error(label + ' byte length is outside the fixture bound');
  }
  return Buffer.from(value);
}

function exactKeys(value: unknown, expected: readonly string[], label: string): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== [...expected].sort().join(',')) {
    throw new Error(label + ' fields drifted');
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(label + ' must be an object');
  }
  return value as Record<string, unknown>;
}

function str(value: Record<string, unknown>, key: string): string {
  if (typeof value[key] !== 'string') {
    throw new Error(key + ' must be a string');
  }
  return value[key];
}

function uint16(value: unknown): string {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 0xffff) {
    throw new Error('uint16 value drifted');
  }
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16BE(value);
  return bytes.toString('hex');
}

function uint32(value: unknown): string {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error('uint32 value drifted');
  }
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes.toString('hex');
}

function uint64(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)
    || BigInt(value) > 0x7fff_ffff_ffff_ffffn) {
    throw new Error('uint64 value drifted');
  }
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(value));
  return bytes.toString('hex');
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
