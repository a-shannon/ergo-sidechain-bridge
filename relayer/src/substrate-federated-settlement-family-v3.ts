import { createHash } from 'node:crypto';

import blakejs from 'blakejs';

import {
  SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_BYTES,
  SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_DOMAIN,
  SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_SCHEMA,
  SUBSTRATE_FEDERATED_SETTLEMENT_MAX_EXTERNAL_FEE_NANOERG,
  SUBSTRATE_FEDERATED_SETTLEMENT_MAX_SUCCESSOR_HEIGHT_LAG,
  SUBSTRATE_FEDERATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS,
  SUBSTRATE_FEDERATED_SETTLEMENT_MIN_EXTERNAL_FEE_NANOERG,
  SUBSTRATE_FEDERATED_SETTLEMENT_NATIVE_ERG_ASSET_ID_HEX,
  SUBSTRATE_FEDERATED_SETTLEMENT_SOURCE_REFUND_DELAY_BLOCKS,
  type SubstrateFederatedSettlementFamilyV1Profile,
  type SubstrateFederatedSettlementTrackerBindingV1,
} from './substrate-federated-settlement-family-v1.js';
import type { SubstrateFederatedTrackerCompilerRequestV2 } from './substrate-federated-tracker-compiler-v2.js';
import {
  assertSubstrateFederatedTrackerJvmCompilerReceiptV2,
  type SubstrateFederatedTrackerJvmCompilerReceiptV2,
} from './substrate-federated-tracker-jvm-compiler-v2.js';

export const SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V3_COMPILER_REQUEST_SCHEMA =
  'e2s.substrate-federated-settlement-family-compiler-request.v3' as const;
export const SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V3_LAYOUT =
  'native-erg-federated-family-reserve-v7' as const;

const roles = ['duplicatePrevention', 'sourceLock', 'pooledReserve'] as const;
type Role = typeof roles[number];
const paths = {
  duplicatePrevention: 'contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
  sourceLock: 'contracts/MainChainLockPooledReserveV6.es',
  pooledReserve: 'contracts/MainChainPooledReserveValidityApplicationV7.es',
} as const;
const pinnedTemplateHashes = {
  duplicatePrevention: 'a3902150efcdeb4025a50c6a14149d9dc656232c5c65c923a91f85658ddaa12f',
  sourceLock: 'f03c1e2ecbb0433d9b5bcad2489467bee26e2e03543ec2a1cd61c18aba21db6b',
  pooledReserve: 'cc507306454541c09e9e9be1d38d6858566aff4f31b260166e946161499a7229',
} as const;
const placeholders = {
  duplicatePrevention: [
    'FEDERATED_SETTLEMENT_TRACKER_NFT_ID_PLACEHOLDER',
    'FEDERATED_SETTLEMENT_DUP_NFT_ID_PLACEHOLDER',
    'FEDERATED_SETTLEMENT_RESERVE_NFT_ID_PLACEHOLDER',
    'FEDERATED_SETTLEMENT_FAMILY_ID_PLACEHOLDER',
    'FEDERATED_SETTLEMENT_TRACKER_CONTRACT_ID_PLACEHOLDER',
    'FEDERATED_SETTLEMENT_SOURCE_NETWORK_ID_PLACEHOLDER',
    'FEDERATED_SETTLEMENT_SIDECHAIN_ID_PLACEHOLDER',
    'FEDERATED_SETTLEMENT_RUNTIME_PROFILE_ID_PLACEHOLDER',
    'FEDERATED_SETTLEMENT_PROFILE_ID_PLACEHOLDER',
    'FEDERATED_SETTLEMENT_FEDERATION_PROFILE_ID_PLACEHOLDER',
    'FEDERATED_SETTLEMENT_ERGO_KEY_SET_DIGEST_PLACEHOLDER',
    'FEDERATED_SETTLEMENT_ERGO_THRESHOLD_PLACEHOLDER',
    'FEDERATED_SETTLEMENT_EPOCH_PLACEHOLDER',
  ],
  sourceLock: [
    'POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER',
    'POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER',
    'POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER',
    'POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER',
    'POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER',
    'POOLED_RESERVE_PROFILE_ID_PLACEHOLDER',
    'POOLED_RESERVE_NFT_ID_PLACEHOLDER',
  ],
  pooledReserve: [
    'POOLED_RESERVE_DUP_NFT_ID_PLACEHOLDER',
    'POOLED_RESERVE_NFT_ID_PLACEHOLDER',
    'POOLED_RESERVE_PROFILE_ID_PLACEHOLDER',
    'POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER',
    'POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER',
    'POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER',
    'POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER',
    'POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER',
    'POOLED_RESERVE_DUP_CONTRACT_ID_PLACEHOLDER',
    'POOLED_RESERVE_SOURCE_LOCK_CONTRACT_ID_PLACEHOLDER',
  ],
} as const;
const templateSnapshots = new WeakMap<object, Readonly<Record<Role, string>>>();

export interface BuildSubstrateFederatedSettlementFamilyV3CompilerRequestInput {
  readonly trackerRequest: Readonly<SubstrateFederatedTrackerCompilerRequestV2>;
  readonly trackerReceipt: Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV2>;
  readonly templates: Readonly<Record<Role, Readonly<{ relativePath: string; source: string }>>>;
  readonly duplicatePreventionGenesisInputBoxIdHex: string;
  readonly pooledReserveGenesisInputBoxIdHex: string;
}

export interface SubstrateFederatedSettlementFamilyV3CompilerRequest {
  readonly schema: typeof SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V3_COMPILER_REQUEST_SCHEMA;
  readonly version: 3;
  readonly settlementLayout: typeof SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V3_LAYOUT;
  readonly trackerCompilerRequestDigestHex: string;
  readonly trackerCompilerReceiptDigestHex: string;
  readonly contracts: readonly Readonly<{
    role: Role;
    relativePath: string;
    templateSha256Hex: string;
  }>[];
  readonly profile: Readonly<SubstrateFederatedSettlementFamilyV1Profile>;
  readonly tracker: Readonly<SubstrateFederatedSettlementTrackerBindingV1>;
  readonly boundaries: Readonly<{
    profileActivated: false;
    nodeCheckPerformed: false;
    signingAuthorityEstablished: false;
    submissionAuthorityEstablished: false;
    broadcastAuthorityEstablished: false;
    fundsAuthorityEstablished: false;
    gate5Closed: false;
    productionReadinessEstablished: false;
  }>;
}

export function buildSubstrateFederatedSettlementFamilyV3CompilerRequest(
  input: Readonly<BuildSubstrateFederatedSettlementFamilyV3CompilerRequestInput>,
): Readonly<SubstrateFederatedSettlementFamilyV3CompilerRequest> {
  const captured = exactKeys(input, [
    'trackerRequest', 'trackerReceipt', 'templates',
    'duplicatePreventionGenesisInputBoxIdHex', 'pooledReserveGenesisInputBoxIdHex',
  ], 'V3 family input');
  const { trackerRequest, trackerReceipt } = captured;
  assertSubstrateFederatedTrackerJvmCompilerReceiptV2(trackerReceipt, trackerRequest);
  const templates = exactKeys(captured.templates, roles, 'V3 family templates');
  const snapshots = Object.fromEntries(roles.map(role => {
    const { relativePath, source } = exactKeys(templates[role],
      ['relativePath', 'source'], `${role} template`);
    if (relativePath !== paths[role] || typeof source !== 'string'
      || !source || source.charCodeAt(0) === 0xfeff
      || source.includes('\r') || source.includes('\0')) {
      throw new Error(`${role} V3 template path or bytes drifted`);
    }
    const sourceBytes = Buffer.from(source, 'utf8');
    if (!sourceBytes.equals(Buffer.from(source, 'ascii'))
      || sha256(sourceBytes) !== pinnedTemplateHashes[role]) {
      throw new Error(`${role} V3 template SHA-256 drifted`);
    }
    const actual = [...source.matchAll(/[A-Z][A-Z0-9_]+_PLACEHOLDERS?/g)]
      .map(match => match[0]).sort();
    const expected = [...placeholders[role]].sort();
    if (actual.length !== expected.length
      || actual.some((placeholder, index) => placeholder !== expected[index])) {
      throw new Error(`${role} V3 placeholder set drifted`);
    }
    return [role, source];
  })) as Record<Role, string>;
  const nftIds = [trackerRequest.trackerNftIdHex,
    fixedHex(captured.duplicatePreventionGenesisInputBoxIdHex, 32, 'duplicate-prevention NFT ID'),
    fixedHex(captured.pooledReserveGenesisInputBoxIdHex, 32, 'reserve NFT ID')];
  if (new Set(nftIds).size !== 3) throw new Error('V3 singleton IDs must be pairwise distinct');
  const { application, profile } = trackerRequest;
  const tracker = deepFreeze({
    contractIdHex: fixedHex(trackerReceipt.contract.contractIdHex, 32, 'tracker contract ID'),
    templateSourceSha256Hex: fixedHex(trackerRequest.template.templateSourceSha256Hex, 32, 'tracker template SHA-256'),
    trackerNftIdHex: fixedHex(nftIds[0], 32, 'tracker NFT ID'),
    sourceNetworkIdHex: fixedHex(application.sourceNetworkIdHex, 32, 'source network ID'),
    sidechainIdHex: fixedHex(application.sidechainIdHex, 32, 'sidechain ID'),
    bridgeAddressHex: fixedHex(application.bridgeAddressHex, 20, 'bridge address'),
    tokenAddressHex: fixedHex(application.tokenAddressHex, 20, 'token address'),
    runtimeProfileIdHex: fixedHex(application.runtimeProfileIdHex, 32, 'runtime profile ID'),
    settlementProfileIdHex: fixedHex(application.settlementProfileIdHex, 32, 'settlement profile ID'),
    federationProfileIdHex: fixedHex(profile.profileIdHex, 32, 'federation profile ID'),
    sourceAttestationKeySetDigestHex: fixedHex(profile.sourceAttestationKeySetDigestHex, 32, 'source key set'),
    sourceAttestationThreshold: positiveUint16(profile.sourceAttestationThreshold),
    ergoAdmissionKeySetDigestHex: fixedHex(profile.ergoAdmissionKeySetDigestHex, 32, 'Ergo key set'),
    ergoAdmissionThreshold: positiveUint16(profile.ergoAdmissionThreshold),
    federationEpoch: positiveLong(profile.federationEpoch),
  });
  const encoded = Buffer.concat([
    Buffer.from([1, 1, 1, 0]),
    hexBytes(tracker.sourceNetworkIdHex), hexBytes(tracker.sidechainIdHex),
    hexBytes(tracker.bridgeAddressHex), hexBytes(tracker.tokenAddressHex),
    hexBytes(tracker.runtimeProfileIdHex), hexBytes(tracker.settlementProfileIdHex),
    hexBytes(tracker.federationProfileIdHex), hexBytes(tracker.sourceAttestationKeySetDigestHex),
    uint16(tracker.sourceAttestationThreshold), hexBytes(tracker.ergoAdmissionKeySetDigestHex),
    uint16(tracker.ergoAdmissionThreshold), uint64(tracker.federationEpoch),
    hexBytes(tracker.trackerNftIdHex), hexBytes(nftIds[1]), hexBytes(nftIds[2]),
    hexBytes(tracker.contractIdHex), hexBytes(tracker.templateSourceSha256Hex),
    ...roles.map(role => hexBytes(pinnedTemplateHashes[role])),
    uint32(SUBSTRATE_FEDERATED_SETTLEMENT_SOURCE_REFUND_DELAY_BLOCKS),
    uint32(SUBSTRATE_FEDERATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS),
    uint32(SUBSTRATE_FEDERATED_SETTLEMENT_MAX_SUCCESSOR_HEIGHT_LAG),
    uint64(SUBSTRATE_FEDERATED_SETTLEMENT_MIN_EXTERNAL_FEE_NANOERG.toString()),
    uint64(SUBSTRATE_FEDERATED_SETTLEMENT_MAX_EXTERNAL_FEE_NANOERG.toString()),
    hexBytes(SUBSTRATE_FEDERATED_SETTLEMENT_NATIVE_ERG_ASSET_ID_HEX),
  ]);
  if (encoded.length !== SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_BYTES) {
    throw new Error('V3 family profile length drifted');
  }
  const familyIdHex = Buffer.from(blakejs.blake2b(Buffer.concat([
    Buffer.from(SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_DOMAIN, 'ascii'), encoded,
  ]), undefined, 32)).toString('hex');
  const request = deepFreeze({
    schema: SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V3_COMPILER_REQUEST_SCHEMA,
    version: 3 as const,
    settlementLayout: SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V3_LAYOUT,
    trackerCompilerRequestDigestHex: trackerRequest.requestDigestHex,
    trackerCompilerReceiptDigestHex: trackerReceipt.receiptDigestHex,
    contracts: roles.map(role => ({
      role, relativePath: paths[role], templateSha256Hex: pinnedTemplateHashes[role],
    })),
    profile: {
      schema: SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_SCHEMA,
      version: 1 as const,
      encodedProfileHex: encoded.toString('hex'), familyIdHex,
      duplicatePreventionNftIdHex: nftIds[1], pooledReserveNftIdHex: nftIds[2],
    },
    tracker,
    boundaries: {
      profileActivated: false as const, nodeCheckPerformed: false as const,
      signingAuthorityEstablished: false as const, submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const, fundsAuthorityEstablished: false as const,
      gate5Closed: false as const, productionReadinessEstablished: false as const,
    },
  });
  templateSnapshots.set(request, deepFreeze(snapshots));
  return request;
}

export function resolveSubstrateFederatedSettlementFamilyV3Sources(
  request: Readonly<SubstrateFederatedSettlementFamilyV3CompilerRequest>,
) {
  const templates = templateSnapshots.get(request);
  if (!templates) throw new Error('V3 family request lacks same-process source provenance');
  const t = request.tracker;
  const p = request.profile;
  const duplicatePrevention = replace(templates.duplicatePrevention, [
    ['FEDERATED_SETTLEMENT_TRACKER_NFT_ID_PLACEHOLDER', t.trackerNftIdHex],
    ['FEDERATED_SETTLEMENT_DUP_NFT_ID_PLACEHOLDER', p.duplicatePreventionNftIdHex],
    ['FEDERATED_SETTLEMENT_RESERVE_NFT_ID_PLACEHOLDER', p.pooledReserveNftIdHex],
    ['FEDERATED_SETTLEMENT_FAMILY_ID_PLACEHOLDER', p.familyIdHex],
    ['FEDERATED_SETTLEMENT_TRACKER_CONTRACT_ID_PLACEHOLDER', t.contractIdHex],
    ['FEDERATED_SETTLEMENT_SOURCE_NETWORK_ID_PLACEHOLDER', t.sourceNetworkIdHex],
    ['FEDERATED_SETTLEMENT_SIDECHAIN_ID_PLACEHOLDER', t.sidechainIdHex],
    ['FEDERATED_SETTLEMENT_RUNTIME_PROFILE_ID_PLACEHOLDER', t.runtimeProfileIdHex],
    ['FEDERATED_SETTLEMENT_PROFILE_ID_PLACEHOLDER', t.settlementProfileIdHex],
    ['FEDERATED_SETTLEMENT_FEDERATION_PROFILE_ID_PLACEHOLDER', t.federationProfileIdHex],
    ['FEDERATED_SETTLEMENT_ERGO_KEY_SET_DIGEST_PLACEHOLDER', t.ergoAdmissionKeySetDigestHex],
    ['FEDERATED_SETTLEMENT_ERGO_THRESHOLD_PLACEHOLDER', uint16(t.ergoAdmissionThreshold).toString('hex')],
    ['FEDERATED_SETTLEMENT_EPOCH_PLACEHOLDER', uint64(t.federationEpoch).toString('hex')],
  ], []);
  const sourceLock = replace(templates.sourceLock, [
    ['POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER', t.sourceNetworkIdHex],
    ['POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER', t.sidechainIdHex],
    ['POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER', t.bridgeAddressHex],
    ['POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER', t.tokenAddressHex],
    ['POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER', t.settlementProfileIdHex],
    ['POOLED_RESERVE_PROFILE_ID_PLACEHOLDER', p.familyIdHex],
    ['POOLED_RESERVE_NFT_ID_PLACEHOLDER', p.pooledReserveNftIdHex],
  ], []);
  const partialReserve = replace(templates.pooledReserve, [
    ['POOLED_RESERVE_DUP_NFT_ID_PLACEHOLDER', p.duplicatePreventionNftIdHex],
    ['POOLED_RESERVE_NFT_ID_PLACEHOLDER', p.pooledReserveNftIdHex],
    ['POOLED_RESERVE_PROFILE_ID_PLACEHOLDER', p.familyIdHex],
    ['POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER', t.sidechainIdHex],
    ['POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER', t.sourceNetworkIdHex],
    ['POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER', t.bridgeAddressHex],
    ['POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER', t.tokenAddressHex],
    ['POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER', t.settlementProfileIdHex],
  ], ['POOLED_RESERVE_DUP_CONTRACT_ID_PLACEHOLDER',
    'POOLED_RESERVE_SOURCE_LOCK_CONTRACT_ID_PLACEHOLDER']);
  return deepFreeze({ duplicatePrevention, sourceLock, partialReserve });
}

export function resolveSubstrateFederatedSettlementFamilyV3ReserveSource(
  partialReserve: string,
  ids: Readonly<{ duplicatePreventionContractIdHex: string; sourceLockContractIdHex: string }>,
) {
  const captured = exactKeys(ids,
    ['duplicatePreventionContractIdHex', 'sourceLockContractIdHex'], 'V3 predecessor IDs');
  return replace(partialReserve, [
    ['POOLED_RESERVE_DUP_CONTRACT_ID_PLACEHOLDER', fixedHex(captured.duplicatePreventionContractIdHex, 32, 'DUP ID')],
    ['POOLED_RESERVE_SOURCE_LOCK_CONTRACT_ID_PLACEHOLDER', fixedHex(captured.sourceLockContractIdHex, 32, 'source-lock ID')],
  ], []);
}

function replace(source: string, replacements: readonly (readonly [string, string])[], remaining: readonly string[]): string {
  let result = source;
  for (const [placeholder, value] of replacements) {
    if (!/^[0-9a-f]+$/.test(value) || value.length % 2 || result.split(placeholder).length !== 2) {
      throw new Error(`V3 replacement for ${placeholder} drifted`);
    }
    result = result.replace(placeholder, value);
  }
  const found = [...result.matchAll(/[A-Z][A-Z0-9_]+_PLACEHOLDERS?/g)].map(match => match[0]);
  if (found.length !== remaining.length || found.some((name, index) => name !== remaining[index])) {
    throw new Error('V3 unresolved placeholder set drifted');
  }
  return result;
}

function exactKeys<T>(value: T, keys: readonly string[], label: string): Readonly<T> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error(`${label} must contain exact plain data fields`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.some(key => typeof key !== 'string')
    || ownKeys.sort().join(',') !== [...keys].sort().join(',')
    || Object.values(descriptors).some(descriptor => !descriptor.enumerable || !('value' in descriptor))) {
    throw new Error(`${label} must contain exact plain data fields`);
  }
  return Object.freeze(Object.fromEntries(keys.map(key => [key, descriptors[key]!.value]))) as Readonly<T>;
}
function fixedHex(value: unknown, size: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^(?:0x)?[0-9a-f]{${size * 2}}$`).test(value)) {
    throw new Error(`${label} must be lowercase ${size}-byte hex`);
  }
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  if (/^0+$/.test(normalized)) throw new Error(`${label} must be nonzero`);
  return normalized;
}
function positiveUint16(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > 0xffff) {
    throw new Error('V3 threshold must fit positive uint16');
  }
  return value;
}
function positiveLong(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)
    || BigInt(value) > 0x7fff_ffff_ffff_ffffn) {
    throw new Error('V3 epoch must be canonical positive signed Long');
  }
  return BigInt(value).toString();
}
function hexBytes(value: string): Buffer { return Buffer.from(value, 'hex'); }
function uint16(value: number): Buffer { const b = Buffer.alloc(2); b.writeUInt16BE(value); return b; }
function uint32(value: number): Buffer { const b = Buffer.alloc(4); b.writeUInt32BE(value); return b; }
function uint64(value: string): Buffer { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(value)); return b; }
function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
