import {
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE,
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
} from './substrate-grandpa-v1/asset-profile.js';
import {
  AGGREGATE_FINALITY_PROOF_SYSTEM_ACTIVATED_STARK_RESERVED,
  AGGREGATE_FINALITY_PROOF_SYSTEM_NATIVE_GRANDPA,
  BRIDGE_FINALITY_STATEMENT_V1_DOMAIN,
  BRIDGE_FINALITY_STATEMENT_VERSION,
} from './substrate-grandpa-v1/bridge-finality-proof.js';

export const SUBSTRATE_GRANDPA_V1_SOURCE_PROFILE_ID =
  'e2s.source-profile.substrate-frontier-grandpa.v1' as const;
export const SUBSTRATE_GRANDPA_V1_STATEMENT_PROFILE_ID =
  'e2s.statement-profile.bridge-finality-grandpa.v1' as const;
export const SUBSTRATE_GRANDPA_V1_SETTLEMENT_PROFILE_ID =
  'e2s.settlement-profile.ergo-authenticated-native-erg.v1' as const;

export const SUBSTRATE_GRANDPA_V1_SOURCE_PROFILE_SELECTION = Object.freeze({
  sourceProfileId: SUBSTRATE_GRANDPA_V1_SOURCE_PROFILE_ID,
  statementProfileId: SUBSTRATE_GRANDPA_V1_STATEMENT_PROFILE_ID,
  proofSystemId: AGGREGATE_FINALITY_PROOF_SYSTEM_NATIVE_GRANDPA,
  settlementProfileId: SUBSTRATE_GRANDPA_V1_SETTLEMENT_PROFILE_ID,
  assetProfileId: SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
});

export const SUBSTRATE_GRANDPA_V1_SOURCE_PROFILE = Object.freeze({
  ...SUBSTRATE_GRANDPA_V1_SOURCE_PROFILE_SELECTION,
  sourceExecution: 'substrate-frontier' as const,
  sourceFinality: 'grandpa' as const,
  statementVersion: BRIDGE_FINALITY_STATEMENT_VERSION,
  statementDomain: BRIDGE_FINALITY_STATEMENT_V1_DOMAIN,
  assetProfile: SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE,
});

export type BridgeSourceProfile =
  typeof SUBSTRATE_GRANDPA_V1_SOURCE_PROFILE;

export interface BridgeSourceProfileSelection {
  readonly sourceProfileId: string;
  readonly statementProfileId: string;
  readonly proofSystemId: number;
  readonly settlementProfileId: string;
  readonly assetProfileId: string;
}

const SELECTION_KEYS = Object.freeze([
  'assetProfileId',
  'proofSystemId',
  'settlementProfileId',
  'sourceProfileId',
  'statementProfileId',
] as const);

/**
 * Resolve one statically registered, off-wire compatibility profile.
 *
 * These identifiers select already frozen semantics. They do not enter or
 * reinterpret V1 checkpoint, statement, proof, candidate, leaf, or ErgoTree
 * bytes. A future validity/STARK family requires distinct reviewed identifiers
 * and statement semantics before it can be registered here.
 */
export function selectBridgeSourceProfile(
  value: unknown,
): BridgeSourceProfile {
  const selection = requireExactSelection(value);
  if (selection.sourceProfileId !== SUBSTRATE_GRANDPA_V1_SOURCE_PROFILE_ID) {
    throw new Error('unsupported bridge source profile');
  }
  if (
    selection.statementProfileId
      !== SUBSTRATE_GRANDPA_V1_STATEMENT_PROFILE_ID
  ) {
    throw new Error('unsupported bridge statement profile');
  }
  if (
    selection.proofSystemId
      === AGGREGATE_FINALITY_PROOF_SYSTEM_ACTIVATED_STARK_RESERVED
  ) {
    throw new Error('reserved bridge proof system is not activated');
  }
  if (
    selection.proofSystemId
      !== AGGREGATE_FINALITY_PROOF_SYSTEM_NATIVE_GRANDPA
  ) {
    throw new Error('unsupported bridge proof system');
  }
  if (
    selection.settlementProfileId
      !== SUBSTRATE_GRANDPA_V1_SETTLEMENT_PROFILE_ID
  ) {
    throw new Error('unsupported Ergo settlement profile');
  }
  if (
    selection.assetProfileId
      !== SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID
  ) {
    throw new Error('unsupported bridge asset profile');
  }
  return SUBSTRATE_GRANDPA_V1_SOURCE_PROFILE;
}

function requireExactSelection(value: unknown): BridgeSourceProfileSelection {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('bridge source profile selection must be an object');
  }
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record).sort();
  if (
    actualKeys.length !== SELECTION_KEYS.length
    || actualKeys.some((key, index) => key !== SELECTION_KEYS[index])
  ) {
    throw new Error('bridge source profile selection fields are not exact');
  }
  if (
    typeof record.sourceProfileId !== 'string'
    || typeof record.statementProfileId !== 'string'
    || typeof record.proofSystemId !== 'number'
    || !Number.isSafeInteger(record.proofSystemId)
    || typeof record.settlementProfileId !== 'string'
    || typeof record.assetProfileId !== 'string'
  ) {
    throw new Error('bridge source profile selection fields are invalid');
  }
  return record as unknown as BridgeSourceProfileSelection;
}
