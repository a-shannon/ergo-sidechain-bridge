import { sha256CanonicalJson } from './strict-json.js';
import type { DeploymentObservationNetworkScope } from './read-only-deployment-identity-observer.js';
import {
  deriveNativeGrandpaAuthoritySetHashHex,
  deriveNativeGrandpaTrustAnchorDigestFromTrustAnchor,
} from './native-finalized-bridge-checkpoint.js';

export const DEPLOYMENT_LINEAGE_PROFILE_SCHEMA =
  'e2s.reviewed-deployment-lineage-profile.v1';
export const DEPLOYMENT_LINEAGE_PROFILE_DIGEST_DOMAIN =
  'e2s.reviewed-deployment-lineage-profile.digest.v1';

const REVIEWED_PROFILES = new WeakSet<object>();

export interface DeploymentCoordinateV1 {
  readonly address: string;
  readonly deploymentHeight: string;
  readonly deploymentBlockHashHex: string;
  readonly deploymentTransactionHashHex: string;
}

export interface DeploymentLineageProfileV1 {
  readonly schema: typeof DEPLOYMENT_LINEAGE_PROFILE_SCHEMA;
  readonly profileId: string;
  readonly profileKind: 'deployment-lineage-v1';
  readonly declaredNetworkScope: DeploymentObservationNetworkScope;
  readonly evmChainId: string;
  readonly substrateGenesisHashHex: string;
  readonly sidechainIdHex: string;
  readonly nativeGrandpaTrust: Readonly<{
    checkpointHashHex: string;
    checkpointHeight: string;
    grandpaSetId: string;
    authorityListScaleHex: string;
    authoritySetHashHex: string;
    trustedAnchorDigestHex: string;
  }>;
  readonly token: DeploymentCoordinateV1;
  readonly bridge: DeploymentCoordinateV1;
  readonly interval: Readonly<{
    startHeight: string;
    startBlockHashHex: string;
    terminalHeight: string;
    terminalExecutionBlockHashHex: string;
    maximumBlockCount: number;
  }>;
  readonly profileDigestHex: string;
}

export type DeploymentLineageProfileInputV1 = Omit<
  DeploymentLineageProfileV1,
  'profileDigestHex'
>;

const CONFORMANCE_SIDECHAIN_ID_HEX = hash('10');
const CONFORMANCE_CHECKPOINT_HASH_HEX = hash('12');
const CONFORMANCE_CHECKPOINT_HEIGHT = '1';
const CONFORMANCE_GRANDPA_SET_ID = '7';
const CONFORMANCE_AUTHORITY_LIST_SCALE_HEX = '0x0401';
const CONFORMANCE_AUTHORITY_SET_HASH_HEX = deriveNativeGrandpaAuthoritySetHashHex(
  CONFORMANCE_AUTHORITY_LIST_SCALE_HEX,
);

export const INERT_DEPLOYMENT_LINEAGE_CONFORMANCE_PROFILE_INPUT = deepFreeze({
  schema: DEPLOYMENT_LINEAGE_PROFILE_SCHEMA,
  profileId: 'inert-local-lineage-conformance-v1',
  profileKind: 'deployment-lineage-v1',
  declaredNetworkScope: 'local-devnet',
  evmChainId: '1337',
  substrateGenesisHashHex: CONFORMANCE_SIDECHAIN_ID_HEX,
  sidechainIdHex: CONFORMANCE_SIDECHAIN_ID_HEX,
  nativeGrandpaTrust: {
    checkpointHashHex: CONFORMANCE_CHECKPOINT_HASH_HEX,
    checkpointHeight: CONFORMANCE_CHECKPOINT_HEIGHT,
    grandpaSetId: CONFORMANCE_GRANDPA_SET_ID,
    authorityListScaleHex: CONFORMANCE_AUTHORITY_LIST_SCALE_HEX,
    authoritySetHashHex: CONFORMANCE_AUTHORITY_SET_HASH_HEX,
    trustedAnchorDigestHex: deriveNativeGrandpaTrustAnchorDigestFromTrustAnchor({
      sidechainIdHex: CONFORMANCE_SIDECHAIN_ID_HEX,
      checkpointHashHex: CONFORMANCE_CHECKPOINT_HASH_HEX,
      checkpointNumber: CONFORMANCE_CHECKPOINT_HEIGHT,
      grandpaSetId: CONFORMANCE_GRANDPA_SET_ID,
      authorityListScaleHex: CONFORMANCE_AUTHORITY_LIST_SCALE_HEX,
    }),
  },
  token: {
    address: address('21'),
    deploymentHeight: '10',
    deploymentBlockHashHex: hash('30'),
    deploymentTransactionHashHex: hash('40'),
  },
  bridge: {
    address: address('22'),
    deploymentHeight: '11',
    deploymentBlockHashHex: hash('31'),
    deploymentTransactionHashHex: hash('41'),
  },
  interval: {
    startHeight: '9',
    startBlockHashHex: hash('29'),
    terminalHeight: '15',
    terminalExecutionBlockHashHex: hash('35'),
    maximumBlockCount: 7,
  },
} as const satisfies DeploymentLineageProfileInputV1);

export const INERT_DEPLOYMENT_LINEAGE_CONFORMANCE_PROFILE_DIGEST_HEX =
  deploymentLineageProfileDigestHex(
    INERT_DEPLOYMENT_LINEAGE_CONFORMANCE_PROFILE_INPUT,
  );

export const REVIEWED_DEPLOYMENT_LINEAGE_PROFILE_SHA256_HEXES:
readonly string[] = Object.freeze([
  INERT_DEPLOYMENT_LINEAGE_CONFORMANCE_PROFILE_DIGEST_HEX,
]);

export function createReviewedDeploymentLineageProfile(
  input: DeploymentLineageProfileInputV1,
): DeploymentLineageProfileV1 {
  const normalized = normalizeProfile(input);
  const profileDigestHex = deploymentLineageProfileDigestHex(normalized);
  if (!REVIEWED_DEPLOYMENT_LINEAGE_PROFILE_SHA256_HEXES.includes(profileDigestHex)) {
    throw new Error('deployment-lineage profile digest is not source-reviewed');
  }
  const profile = deepFreeze({ ...normalized, profileDigestHex });
  REVIEWED_PROFILES.add(profile);
  return profile;
}

export function assertReviewedDeploymentLineageProfileProvenance(
  value: unknown,
): asserts value is DeploymentLineageProfileV1 {
  if (!value || typeof value !== 'object' || !REVIEWED_PROFILES.has(value)) {
    throw new Error('reviewed deployment-lineage profile provenance is missing');
  }
}

export function deploymentLineageProfileDigestHex(
  input: DeploymentLineageProfileInputV1,
): string {
  return `0x${sha256CanonicalJson(
    input,
    DEPLOYMENT_LINEAGE_PROFILE_DIGEST_DOMAIN,
  )}`;
}

function normalizeProfile(
  value: DeploymentLineageProfileInputV1,
): DeploymentLineageProfileInputV1 {
  const record = exactRecord(value, [
    'bridge',
    'declaredNetworkScope',
    'evmChainId',
    'interval',
    'nativeGrandpaTrust',
    'profileId',
    'profileKind',
    'schema',
    'sidechainIdHex',
    'substrateGenesisHashHex',
    'token',
  ], 'deployment-lineage profile');
  if (record.schema !== DEPLOYMENT_LINEAGE_PROFILE_SCHEMA) {
    throw new Error('deployment-lineage profile schema is unsupported');
  }
  if (record.profileKind !== 'deployment-lineage-v1') {
    throw new Error('deployment-lineage profile kind is unsupported');
  }
  const declaredNetworkScope = record.declaredNetworkScope;
  if (declaredNetworkScope !== 'local-devnet' && declaredNetworkScope !== 'public-testnet') {
    throw new Error('deployment-lineage profile network scope is unsupported');
  }
  const token = coordinate(record.token, 'token');
  const bridge = coordinate(record.bridge, 'bridge');
  if (token.address === bridge.address) {
    throw new Error('deployment-lineage token and bridge addresses must differ');
  }
  const tokenHeight = uint64(token.deploymentHeight, 'token deployment height');
  const bridgeHeight = uint64(bridge.deploymentHeight, 'bridge deployment height');
  if (tokenHeight >= bridgeHeight) {
    throw new Error('token deployment must precede bridge deployment');
  }
  const interval = exactRecord(record.interval, [
    'maximumBlockCount',
    'startBlockHashHex',
    'startHeight',
    'terminalExecutionBlockHashHex',
    'terminalHeight',
  ], 'deployment-lineage interval');
  const startHeight = uint64(interval.startHeight, 'lineage interval start height');
  const terminalHeight = uint64(interval.terminalHeight, 'lineage terminal height');
  if (tokenHeight === 0n || startHeight !== tokenHeight - 1n) {
    throw new Error('deployment-lineage interval must start at the token pre-deployment parent');
  }
  if (bridgeHeight > terminalHeight) {
    throw new Error('deployment-lineage terminal height must include the bridge deployment');
  }
  const maximumBlockCount = safeInteger(
    interval.maximumBlockCount,
    'deployment-lineage maximum block count',
  );
  const count = terminalHeight - startHeight + 1n;
  if (count < 3n || count !== BigInt(maximumBlockCount)) {
    throw new Error('deployment-lineage interval must exactly bind its bounded block count');
  }
  const trust = exactRecord(record.nativeGrandpaTrust, [
    'authorityListScaleHex',
    'authoritySetHashHex',
    'checkpointHashHex',
    'checkpointHeight',
    'grandpaSetId',
    'trustedAnchorDigestHex',
  ], 'deployment-lineage native GRANDPA trust');
  const substrateGenesisHashHex = fixedHex(
    record.substrateGenesisHashHex,
    32,
    'Substrate genesis hash',
  );
  const sidechainIdHex = fixedHex(record.sidechainIdHex, 32, 'sidechain ID');
  if (sidechainIdHex !== substrateGenesisHashHex) {
    throw new Error('sidechain ID must equal the raw Substrate genesis hash');
  }
  const authorityListScaleHex = variableHex(
    trust.authorityListScaleHex,
    'GRANDPA authority list',
  );
  const authoritySetHash = fixedHex(
    trust.authoritySetHashHex,
    32,
    'GRANDPA authority-set hash',
  );
  if (
    deriveNativeGrandpaAuthoritySetHashHex(authorityListScaleHex)
    !== authoritySetHash
  ) {
    throw new Error('GRANDPA authority-set hash does not bind the reviewed authority list');
  }
  const checkpointHashHex = fixedHex(
    trust.checkpointHashHex,
    32,
    'GRANDPA checkpoint hash',
  );
  const checkpointHeight = uint64(
    trust.checkpointHeight,
    'GRANDPA checkpoint height',
  ).toString();
  if (BigInt(checkpointHeight) > startHeight) {
    throw new Error('GRANDPA trust checkpoint must not be after the lineage interval start');
  }
  const grandpaSetId = uint64(trust.grandpaSetId, 'GRANDPA set ID').toString();
  const trustedAnchorDigest = fixedHex(
    trust.trustedAnchorDigestHex,
    32,
    'GRANDPA trust digest',
  );
  if (deriveNativeGrandpaTrustAnchorDigestFromTrustAnchor({
    sidechainIdHex,
    checkpointHashHex,
    checkpointNumber: checkpointHeight,
    grandpaSetId,
    authorityListScaleHex,
  }) !== trustedAnchorDigest) {
    throw new Error('GRANDPA trust digest does not bind the complete reviewed trust anchor');
  }
  return deepFreeze({
    schema: DEPLOYMENT_LINEAGE_PROFILE_SCHEMA,
    profileId: text(record.profileId, 80, 'deployment-lineage profile ID'),
    profileKind: 'deployment-lineage-v1',
    declaredNetworkScope,
    evmChainId: positiveUint64(record.evmChainId, 'deployment-lineage EVM chain ID'),
    substrateGenesisHashHex,
    sidechainIdHex,
    nativeGrandpaTrust: {
      checkpointHashHex,
      checkpointHeight,
      grandpaSetId,
      authorityListScaleHex,
      authoritySetHashHex: authoritySetHash,
      trustedAnchorDigestHex: trustedAnchorDigest,
    },
    token,
    bridge,
    interval: {
      startHeight: startHeight.toString(),
      startBlockHashHex: fixedHex(
        interval.startBlockHashHex,
        32,
        'lineage interval start block hash',
      ),
      terminalHeight: terminalHeight.toString(),
      terminalExecutionBlockHashHex: fixedHex(
        interval.terminalExecutionBlockHashHex,
        32,
        'terminal execution block hash',
      ),
      maximumBlockCount,
    },
  });
}

function coordinate(value: unknown, label: string): DeploymentCoordinateV1 {
  const record = exactRecord(value, [
    'address',
    'deploymentBlockHashHex',
    'deploymentHeight',
    'deploymentTransactionHashHex',
  ], `${label} deployment coordinate`);
  return deepFreeze({
    address: canonicalAddress(record.address, `${label} address`),
    deploymentHeight: uint64(record.deploymentHeight, `${label} deployment height`).toString(),
    deploymentBlockHashHex: fixedHex(record.deploymentBlockHashHex, 32, `${label} deployment block hash`),
    deploymentTransactionHashHex: fixedHex(
      record.deploymentTransactionHashHex,
      32,
      `${label} deployment transaction hash`,
    ),
  });
}

function exactRecord(
  value: unknown,
  fields: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
    throw new Error(`${label} must contain exactly the supported fields`);
  }
  return record;
}

function canonicalAddress(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${label} must be a 20-byte address`);
  }
  const normalized = value.toLowerCase();
  if (normalized === `0x${'00'.repeat(20)}`) throw new Error(`${label} must not be zero`);
  return normalized;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`).test(value)) {
    throw new Error(`${label} must be exactly ${bytes} bytes of hex`);
  }
  return value.toLowerCase();
}

function uint64(value: unknown, label: string): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical unsigned decimal string`);
  }
  const parsed = BigInt(value);
  if (parsed > 0xffff_ffff_ffff_ffffn) throw new Error(`${label} exceeds uint64`);
  return parsed;
}

function positiveUint64(value: unknown, label: string): string {
  const parsed = uint64(value, label);
  if (parsed === 0n) throw new Error(`${label} must be positive`);
  return parsed.toString();
}

function safeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 4_096) {
    throw new Error(`${label} must be between 1 and 4096`);
  }
  return Number(value);
}

function text(value: unknown, maximum: number, label: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || !/^[a-z0-9-]+$/.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function hash(byte: string): string {
  return `0x${byte.repeat(32)}`;
}

function address(byte: string): string {
  return `0x${byte.repeat(20)}`;
}

function variableHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-fA-F]{2})+$/.test(value)) {
    throw new Error(`${label} must be non-empty even-length hex bytes`);
  }
  return value.toLowerCase();
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
