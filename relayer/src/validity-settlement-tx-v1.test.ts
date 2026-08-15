import blakejs from 'blakejs';

import { describe, expect, it } from 'vitest';

import {
  EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX,
} from './bridge-validity-tracker-contract-v1.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeLongRegister,
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import { encodePegInSourceIntentV2Hex } from './peg-in-causal-admission-v2.js';
import { encodeValiditySpvTrackerAvlRegister, encodeValiditySpvTrackerValue, deriveValiditySpvTrackerKey } from './spv-tracker-validity-v1.js';
import { buildTrustlessBurnInclusionProof, deriveTrustlessBurnIdHex } from './trustless-burn-proof.js';
import { buildValiditySettlementTxV1 } from './validity-settlement-tx-v1.js';
import {
  VALIDITY_SETTLEMENT_V1_ZERO_SOURCE_ASSET_ID_HEX,
  buildValiditySettlementPlanV1,
  deriveValiditySettlementProfileIdV1,
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

function fixture() {
  const profile: ValiditySettlementProfileV1 = {
    formatVersion: 1,
    compatibilityProofSystemId: 1,
    minAnchorConfirmations: 10,
    sourceNetworkIdHex: SOURCE_NETWORK_ID_HEX,
    sidechainIdHex: SIDECHAIN_ID_HEX,
    trackerNftIdHex: TRACKER_NFT_ID_HEX,
    trackerContractIdHex: Buffer.from(
      blakejs.blake2b(Buffer.from(EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX, 'hex'), undefined, 32),
    ).toString('hex'),
    approvedTrustRootDigestHex: TRUST_ROOT_HEX,
    compatibilitySemanticProgramIdHex: SEMANTIC_PROGRAM_ID_HEX,
    compatibilityVerifierProfileIdHex: VERIFIER_PROFILE_ID_HEX,
    duplicatePreventionNftIdHex: DUP_NFT_ID_HEX,
    admissionProfileIdHex: ADMISSION_PROFILE_ID_HEX,
    zeroSourceAssetIdHex: VALIDITY_SETTLEMENT_V1_ZERO_SOURCE_ASSET_ID_HEX,
  };
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
  const plan = buildValiditySettlementPlanV1({
    profile,
    trackerHistory: [{ key: trackerKeyHex, value: trackerValueHex }],
    duplicatePreventionHistoryKeys: [],
    claim: {
      trackerIdentity: { sidechainHeight: 42, executionBlockHashHex: EXECUTION_BLOCK_HASH_HEX },
      burnLeaf: burn,
      burnProof: inclusion.proof,
      recipientErgoTreeHex: RECIPIENT_ERGO_TREE_HEX,
    },
    currentErgoHeight: 110,
  });
  const profileIdHex = deriveValiditySettlementProfileIdV1(profile);
  const sourceIntentHex = encodePegInSourceIntentV2Hex({
    formatVersion: 2,
    sourceNetworkIdHex: SOURCE_NETWORK_ID_HEX,
    sidechainIdHex: SIDECHAIN_ID_HEX,
    bridgeAddressHex: '30'.repeat(20),
    tokenAddressHex: '31'.repeat(20),
    settlementProfileIdHex: profileIdHex,
    admissionProfileIdHex: ADMISSION_PROFILE_ID_HEX,
    sourceAssetIdHex: VALIDITY_SETTLEMENT_V1_ZERO_SOURCE_ASSET_ID_HEX,
    amountNanoErg: 5_000_000,
    recipientAddressHex: '32'.repeat(20),
  }).slice(2);
  const deployed = {
    tracker: { nftIdHex: TRACKER_NFT_ID_HEX, ergoTreeHex: EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX },
    duplicatePrevention: { nftIdHex: DUP_NFT_ID_HEX, ergoTreeHex: '1003' },
    causalVault: { ergoTreeHex: '1004' },
  };
  return {
    plan,
    deployed,
    trackerBox: {
      boxId: '40'.repeat(32),
      value: 1_000_000,
      ergoTree: deployed.tracker.ergoTreeHex,
      assets: [{ tokenId: TRACKER_NFT_ID_HEX, amount: 1 }],
      additionalRegisters: {
        R4: encodeLongRegister(1),
        R5: encodeValiditySpvTrackerAvlRegister(plan.trackerInputDigestHex),
        R6: encodeCollByteRegister(Buffer.from(SIDECHAIN_ID_HEX, 'hex')),
        R7: encodeLongRegister(42),
        R8: '0402',
        R9: encodeCollByteRegister(Buffer.from(TRUST_ROOT_HEX, 'hex')),
      },
      creationHeight: 110,
    },
    duplicatePreventionBox: {
      boxId: '41'.repeat(32),
      value: 1_000_000,
      ergoTree: deployed.duplicatePrevention.ergoTreeHex,
      assets: [{ tokenId: DUP_NFT_ID_HEX, amount: 1 }],
      additionalRegisters: {
        R4: encodeLongRegister(7),
        R5: encodeAvlTreeRegister(Buffer.from(plan.dupInputDigestHex, 'hex'), 0x0b, 1),
        R6: encodeCollByteRegister(Buffer.from(profileIdHex, 'hex')),
      },
      creationHeight: 110,
    },
    causalVaultBox: {
      boxId: '42'.repeat(32),
      value: 5_000_000,
      ergoTree: deployed.causalVault.ergoTreeHex,
      assets: [],
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from(sourceIntentHex, 'hex')),
        R5: encodeCollByteRegister(Buffer.from('43'.repeat(32), 'hex')),
      },
      creationHeight: 110,
    },
    feeFundingBox: {
      boxId: '44'.repeat(32),
      value: MINER_FEE,
      ergoTree: '10010100d17300',
      assets: [],
      additionalRegisters: {},
      creationHeight: 110,
    },
  };
}

describe('ValiditySettlementV1 unsigned transaction assembly', () => {
  it('builds a tracker-data-input, committee-free DUP, causal vault transaction', () => {
    const f = fixture();
    const tx = buildValiditySettlementTxV1({
      ...f,
      creationHeight: 111,
    });

    expect(tx.inputs).toHaveLength(3);
    expect(tx.inputs[0].boxId).toBe(f.duplicatePreventionBox.boxId);
    expect(tx.inputs[1].boxId).toBe(f.causalVaultBox.boxId);
    expect(tx.inputs[2]).toEqual({
      boxId: f.feeFundingBox.boxId,
      extension: {},
    });
    expect(tx.dataInputs).toEqual([{ boxId: f.trackerBox.boxId }]);
    expect(tx.outputs).toHaveLength(4);
    expect(tx.outputs[0].additionalRegisters.R6)
      .toBe(encodeCollByteRegister(Buffer.from(f.plan.profileIdHex, 'hex')));
    expect(tx.outputs[1]).toMatchObject({
      value: '2000000',
      ergoTree: RECIPIENT_ERGO_TREE_HEX,
      assets: [],
    });
    expect(tx.outputs[2]).toMatchObject({
      value: '3000000',
      ergoTree: f.deployed.causalVault.ergoTreeHex,
      additionalRegisters: f.causalVaultBox.additionalRegisters,
    });
    expect(tx.outputs[3]).toEqual({
      value: String(MINER_FEE),
      ergoTree: MINER_FEE_TREE,
      assets: [],
      additionalRegisters: {},
      creationHeight: 111,
    });
    expect(tx.boundaries.gate5Closed).toBe(false);
  });

  it('rejects tracker, DUP, vault, and source profile substitution', () => {
    const f = fixture();
    const build = (overrides: Record<string, unknown>) => () =>
      buildValiditySettlementTxV1({ ...f, creationHeight: 111, ...overrides });

    expect(build({ trackerBox: { ...f.trackerBox, ergoTree: '1001' } }))
      .toThrow(/tracker box ErgoTree/);
    expect(build({ trackerBox: {
      ...f.trackerBox,
      additionalRegisters: { ...f.trackerBox.additionalRegisters, R9: encodeCollByteRegister(Buffer.from('ff'.repeat(32), 'hex')) },
    } })).toThrow(/R9/);
    expect(build({ deployed: {
      ...f.deployed,
      tracker: { ...f.deployed.tracker, nftIdHex: 'ff'.repeat(32) },
    } })).toThrow(/deployment NFT/);
    expect(build({ duplicatePreventionBox: {
      ...f.duplicatePreventionBox,
      additionalRegisters: { ...f.duplicatePreventionBox.additionalRegisters, R6: encodeCollByteRegister(Buffer.from('ff'.repeat(32), 'hex')) },
    } })).toThrow(/R6/);
    expect(build({ duplicatePreventionBox: {
      ...f.duplicatePreventionBox,
      additionalRegisters: { ...f.duplicatePreventionBox.additionalRegisters, R5: encodeAvlTreeRegister(Buffer.from('aa'.repeat(33), 'hex'), 0x0b, 1) },
    } })).toThrow(/R5/);
    expect(build({ causalVaultBox: {
      ...f.causalVaultBox,
      additionalRegisters: { ...f.causalVaultBox.additionalRegisters, R5: encodeCollByteRegister(Buffer.alloc(32)) },
    } })).toThrow(/must be nonzero/);
    const mutableStamp = {
      ...f.trackerBox,
      additionalRegisters: { ...f.trackerBox.additionalRegisters, R8: '04fe01' },
    };
    expect(buildValiditySettlementTxV1({
      ...f,
      trackerBox: mutableStamp,
      creationHeight: 111,
    }).dataInputs).toEqual([{ boxId: f.trackerBox.boxId }]);
    expect(build({ minerFee: 999_999 })).toThrow(/between 1000000/);
    expect(build({
      feeFundingBox: { ...f.feeFundingBox, value: Number(MINER_FEE) + 1 },
    })).toThrow(/must equal the exact miner fee/);
    expect(build({
      feeFundingBox: {
        ...f.feeFundingBox,
        assets: [{ tokenId: 'aa'.repeat(32), amount: 1 }],
      },
    })).toThrow(/must contain only ERG/);
    expect(build({
      feeFundingBox: {
        ...f.feeFundingBox,
        boxId: f.causalVaultBox.boxId,
      },
    })).toThrow(/must be distinct/);
    expect(build({
      causalVaultBox: {
        ...f.causalVaultBox,
        value: 2_500_000,
      },
    })).toThrow(/below minimum box value/);
    expect(build({ creationHeight: 0 })).toThrow(/positive Int/);
  });
});
