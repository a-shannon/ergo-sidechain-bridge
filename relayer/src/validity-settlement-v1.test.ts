import blakejs from 'blakejs';

import { describe, expect, it } from 'vitest';

import {
  EIP0045_BRIDGE_VALIDITY_TRACKER_CONTRACT_ID_HEX,
} from './bridge-validity-tracker-contract-v1.js';
import {
  buildTrustlessBurnInclusionProof,
  deriveTrustlessBurnIdHex,
} from './trustless-burn-proof.js';
import {
  encodeValiditySpvTrackerValue,
  deriveValiditySpvTrackerKey,
} from './spv-tracker-validity-v1.js';
import {
  VALIDITY_SETTLEMENT_PROFILE_V1_BYTES,
  VALIDITY_SETTLEMENT_V1_ZERO_SOURCE_ASSET_ID_HEX,
  buildValiditySettlementPlanV1,
  decodeValiditySettlementProfileV1,
  deriveValiditySettlementProfileIdV1,
  encodeValiditySettlementProfileV1,
  type ValiditySettlementProfileV1,
} from './validity-settlement-v1.js';

const SOURCE_NETWORK_ID_HEX = '10'.repeat(32);
const SIDECHAIN_ID_HEX = '11'.repeat(32);
const TRACKER_NFT_ID_HEX = '12'.repeat(32);
const TRUST_ROOT_HEX = '13'.repeat(32);
const SEMANTIC_PROGRAM_ID_HEX = '14'.repeat(32);
const VERIFIER_PROFILE_ID_HEX = '15'.repeat(32);
const DUP_NFT_ID_HEX = '16'.repeat(32);
const ADMISSION_PROFILE_ID_HEX = '17'.repeat(32);
const EXECUTION_BLOCK_HASH_HEX = '18'.repeat(32);
const SIDECHAIN_TX_HASH_HEX = '19'.repeat(32);
const RECIPIENT_ERGO_TREE_HEX = `0008cd02${'20'.repeat(32)}`;

function profile(): ValiditySettlementProfileV1 {
  return {
    formatVersion: 1,
    compatibilityProofSystemId: 1,
    minAnchorConfirmations: 10,
    sourceNetworkIdHex: SOURCE_NETWORK_ID_HEX,
    sidechainIdHex: SIDECHAIN_ID_HEX,
    trackerNftIdHex: TRACKER_NFT_ID_HEX,
    trackerContractIdHex: EIP0045_BRIDGE_VALIDITY_TRACKER_CONTRACT_ID_HEX,
    approvedTrustRootDigestHex: TRUST_ROOT_HEX,
    compatibilitySemanticProgramIdHex: SEMANTIC_PROGRAM_ID_HEX,
    compatibilityVerifierProfileIdHex: VERIFIER_PROFILE_ID_HEX,
    duplicatePreventionNftIdHex: DUP_NFT_ID_HEX,
    admissionProfileIdHex: ADMISSION_PROFILE_ID_HEX,
    zeroSourceAssetIdHex: VALIDITY_SETTLEMENT_V1_ZERO_SOURCE_ASSET_ID_HEX,
  };
}

function fixture() {
  const burnIdHex = deriveTrustlessBurnIdHex({
    sidechainIdHex: SIDECHAIN_ID_HEX,
    sidechainTxHashHex: SIDECHAIN_TX_HASH_HEX,
    eventIndex: 3,
  });
  const recipientErgoTreeHashHex = Buffer.from(
    blakejs.blake2b(Buffer.from(RECIPIENT_ERGO_TREE_HEX, 'hex'), undefined, 32),
  ).toString('hex');
  const burn = {
    sidechainIdHex: SIDECHAIN_ID_HEX,
    sidechainBlockHashHex: EXECUTION_BLOCK_HASH_HEX,
    burnIdHex,
    sidechainTxHashHex: SIDECHAIN_TX_HASH_HEX,
    eventIndex: 3,
    recipientErgoTreeHashHex,
    amountNanoErg: 2_000_000n,
    assetIdHex: VALIDITY_SETTLEMENT_V1_ZERO_SOURCE_ASSET_ID_HEX,
  };
  const inclusion = buildTrustlessBurnInclusionProof([burn], burnIdHex);
  const trackerKeyHex = deriveValiditySpvTrackerKey({
    sidechainIdHex: SIDECHAIN_ID_HEX,
    sidechainHeight: 42,
    executionBlockHashHex: EXECUTION_BLOCK_HASH_HEX,
  });
  const trackerValueHex = encodeValiditySpvTrackerValue({
    bridgeEventRootHex: inclusion.bridgeEventRootHex,
    checkpointCommitmentHex: '21'.repeat(32),
    anchorHeaderIdHex: '22'.repeat(32),
    anchorHeaderHeight: 100,
    compatibilityStatementDigestHex: '23'.repeat(32),
    compatibilitySemanticProgramIdHex: SEMANTIC_PROGRAM_ID_HEX,
    compatibilityVerifierProfileIdHex: VERIFIER_PROFILE_ID_HEX,
    compatibilityPayloadDigestHex: '24'.repeat(32),
    compatibilityAggregateProofDigestHex: '25'.repeat(32),
  });
  return {
    profile: profile(),
    burn,
    inclusion,
    trackerKeyHex,
    trackerValueHex,
    input: {
      profile: profile(),
      trackerHistory: [{ key: trackerKeyHex, value: trackerValueHex }],
      duplicatePreventionHistoryKeys: [],
      claim: {
        trackerIdentity: {
          sidechainHeight: 42,
          executionBlockHashHex: EXECUTION_BLOCK_HASH_HEX,
        },
        burnLeaf: burn,
        burnProof: inclusion.proof,
        recipientErgoTreeHex: RECIPIENT_ERGO_TREE_HEX,
      },
      currentErgoHeight: 110,
    },
  };
}

describe('ValiditySettlementProfileV1', () => {
  it('uses the fixed 329-byte canonical profile format and domain-separated ID', () => {
    const p = profile();
    const encoded = encodeValiditySettlementProfileV1(p);

    expect(encoded).toHaveLength(VALIDITY_SETTLEMENT_PROFILE_V1_BYTES * 2);
    expect(decodeValiditySettlementProfileV1(encoded)).toEqual(p);
    expect(deriveValiditySettlementProfileIdV1(p))
      .toBe(deriveValiditySettlementProfileIdV1(decodeValiditySettlementProfileV1(encoded)));
    expect(encoded.slice(-16)).toBe('0000000a00000001');
  });

  it('fails closed on unknown format, proof system, confirmation policy, or non-ERG asset', () => {
    expect(() => encodeValiditySettlementProfileV1({ ...profile(), formatVersion: 2 as 1 }))
      .toThrow(/format version/);
    expect(() => encodeValiditySettlementProfileV1({ ...profile(), compatibilityProofSystemId: 2 as 1 }))
      .toThrow(/proof-system ID/);
    expect(() => encodeValiditySettlementProfileV1({ ...profile(), minAnchorConfirmations: 9 as 10 }))
      .toThrow(/exactly 10/);
    expect(() => encodeValiditySettlementProfileV1({
      ...profile(),
      zeroSourceAssetIdHex: 'ff'.repeat(32),
    })).toThrow(/zero native ERG/);
    for (const field of [
      'sourceNetworkIdHex',
      'sidechainIdHex',
      'trackerNftIdHex',
      'trackerContractIdHex',
      'approvedTrustRootDigestHex',
      'compatibilitySemanticProgramIdHex',
      'compatibilityVerifierProfileIdHex',
      'duplicatePreventionNftIdHex',
      'admissionProfileIdHex',
    ] as const) {
      expect(() => encodeValiditySettlementProfileV1({
        ...profile(),
        [field]: '00'.repeat(32),
      })).toThrow(/must be nonzero/);
    }
  });
});

describe('ValiditySettlementV1 planner', () => {
  it('binds one validity tracker entry, burn leaf, compact ABI, and DUP insertion', () => {
    const f = fixture();
    const plan = buildValiditySettlementPlanV1(f.input);

    expect(plan.contractCompatibility).toBe('validity-settlement-v1');
    expect(plan.trackerKeyHex).toBe(f.trackerKeyHex);
    expect(plan.bridgeEventRootHex).toBe(f.inclusion.bridgeEventRootHex);
    expect(plan.burnLeaf.encodedLeafHex).toHaveLength(205 * 2);
    expect(plan.recipientErgoTreeHex).toBe(RECIPIENT_ERGO_TREE_HEX);
    expect(Object.keys(plan.dupExtension)).toEqual(['0', '1', '2']);
    expect(Object.keys(plan.vaultExtension)).toEqual(['0', '1', '2', '3']);
    expect(plan.boundaries).toEqual({
      trackerEntryDecoded: true,
      burnInclusionValidatedByPlanner: true,
      chainDomainActivationIdentityResolved: false,
      bridgeEventRootFinalizedStateMembershipEstablished: false,
      activationEstablished: false,
      nodeAcceptanceEstablished: false,
      proofValidityEstablishedInPayoutTx: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    });
  });

  it('rejects isolated tracker, burn, anchor, and replay relaxations', () => {
    const f = fixture();
    expect(() => buildValiditySettlementPlanV1({
      ...f.input,
      currentErgoHeight: 109,
    })).toThrow(/lacks required confirmations/);
    expect(() => buildValiditySettlementPlanV1({
      ...f.input,
      profile: { ...f.profile, compatibilitySemanticProgramIdHex: 'fe'.repeat(32) },
    })).toThrow(/semantic program ID/);
    expect(() => buildValiditySettlementPlanV1({
      ...f.input,
      claim: {
        ...f.input.claim,
        recipientErgoTreeHex: `0008cd02${'21'.repeat(32)}`,
      },
    })).toThrow(/recipient ErgoTree/);
    expect(() => buildValiditySettlementPlanV1({
      ...f.input,
      claim: {
        ...f.input.claim,
        trackerIdentity: {
          ...f.input.claim.trackerIdentity,
          executionBlockHashHex: 'ff'.repeat(32),
        },
      },
    })).toThrow(/block hash/);
    expect(() => buildValiditySettlementPlanV1({
      ...f.input,
      duplicatePreventionHistoryKeys: [f.burn.burnIdHex],
    })).toThrow(/already present/);
  });
});
