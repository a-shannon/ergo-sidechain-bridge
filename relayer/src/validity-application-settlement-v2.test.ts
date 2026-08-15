import { readFileSync } from 'fs';

import blakejs from 'blakejs';
import { describe, expect, it } from 'vitest';

import {
  deriveBridgeCheckpointCommitmentHex,
} from './bridge-checkpoint-commitment.js';
import {
  decodeBridgeCausalApplicationBindingV2,
  decodeBridgeValidityApplicationPayloadV3,
  deriveBridgeCausalApplicationBindingV2DigestHex,
  encodeBridgeValidityApplicationPayloadV3,
} from './bridge-validity-application-statement-v2.js';
import {
  EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_CAUSAL_PROFILE_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SETTLEMENT_PROFILE_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_NETWORK_ID_HEX,
} from './bridge-validity-tracker-contract-v2.js';
import {
  EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX,
} from './bridge-validity-tracker-contract-v1.js';
import {
  EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
  encodeApplicationValiditySpvTrackerValue,
  deriveApplicationValidityPayloadDigestHex,
  deriveApplicationValiditySpvTrackerKey,
  getApplicationValiditySpvTrackerDigest,
} from './spv-tracker-validity-v2.js';
import {
  encodeValiditySpvTrackerValue,
  deriveValiditySpvTrackerKey,
} from './spv-tracker-validity-v1.js';
import {
  buildTrustlessBurnInclusionProof,
  deriveTrustlessBurnIdHex,
  type TrustlessBurnLeafInput,
  type TrustlessBurnMerkleProofStep,
} from './trustless-burn-proof.js';
import {
  VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2_DOMAIN,
  VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2_HEADER_BYTES,
  VALIDITY_APPLICATION_SETTLEMENT_PROFILE_V2_BYTES,
  VALIDITY_APPLICATION_SETTLEMENT_V2_APPROVED_TRUST_ROOT_HEX,
  VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_NFT_ID_HEX,
  VALIDITY_APPLICATION_SETTLEMENT_V2_TRACKER_NFT_ID_HEX,
  VALIDITY_APPLICATION_SETTLEMENT_V2_ZERO_SOURCE_ASSET_ID_HEX,
  buildValidityApplicationSettlementPlanV2,
  decodeValidityApplicationSettlementBundleV2,
  deriveValidityApplicationSettlementProfileDescriptorDigestV2,
  encodeValidityApplicationSettlementBundleV2,
  encodeValidityApplicationSettlementProfileV2,
  type BuildValidityApplicationSettlementPlanV2Input,
  type ValidityApplicationSettlementProfileV2,
} from './validity-application-settlement-v2.js';

const finalityVector = JSON.parse(readFileSync(
  new URL(
    '../test-vectors/bridge-validity-finality-statement-v2.json',
    import.meta.url,
  ),
  'utf8',
));

const TRACKER_NFT_ID_HEX =
  VALIDITY_APPLICATION_SETTLEMENT_V2_TRACKER_NFT_ID_HEX;
const APPROVED_TRUST_ROOT_HEX =
  VALIDITY_APPLICATION_SETTLEMENT_V2_APPROVED_TRUST_ROOT_HEX;
const DUP_NFT_ID_HEX = VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_NFT_ID_HEX;
const EXECUTION_BLOCK_HASH_HEX = '93'.repeat(32);
const CONSENSUS_BLOCK_HASH_HEX = '94'.repeat(32);
const ANCHOR_HEADER_ID_HEX = '95'.repeat(32);
const RECIPIENT_ERGO_TREE_HEX = `0008cd02${'96'.repeat(32)}`;
const SIDECHAIN_HEIGHT = 42;

interface Fixture {
  readonly input: BuildValidityApplicationSettlementPlanV2Input;
  readonly profile: ValidityApplicationSettlementProfileV2;
  readonly applicationPayloadHex: string;
  readonly finalityPayloadHex: string;
  readonly trackerKeyHex: string;
  readonly trackerValueFields: Parameters<
    typeof encodeApplicationValiditySpvTrackerValue
  >[0];
  readonly trackerValueHex: string;
  readonly targetBurn: TrustlessBurnLeafInput;
  readonly inclusion: ReturnType<typeof buildTrustlessBurnInclusionProof>;
}

function profile(): ValidityApplicationSettlementProfileV2 {
  return {
    formatVersion: 2,
    minAnchorConfirmations: 10,
    sourceNetworkIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_NETWORK_ID_HEX,
    sidechainIdHex: EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
    trackerNftIdHex: TRACKER_NFT_ID_HEX,
    trackerContractIdHex: EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX,
    trackerPropositionBytesHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
    approvedTrustRootDigestHex: APPROVED_TRUST_ROOT_HEX,
    applicationBindingHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
    applicationBindingDigestHex:
      deriveBridgeCausalApplicationBindingV2DigestHex(
        EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
      ),
    settlementProfileIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_SETTLEMENT_PROFILE_ID_HEX,
    causalProfileIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_CAUSAL_PROFILE_ID_HEX,
    programIdHex: EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
    verifierProfileIdHex:
      EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
    duplicatePreventionNftIdHex: DUP_NFT_ID_HEX,
    zeroSourceAssetIdHex:
      VALIDITY_APPLICATION_SETTLEMENT_V2_ZERO_SOURCE_ASSET_ID_HEX,
  };
}

function fixture(): Fixture {
  const recipientErgoTreeHashHex = blake2b256Hex(
    Buffer.from(RECIPIENT_ERGO_TREE_HEX, 'hex'),
  );
  const burns = [7, 11, 99].map((eventIndex, index) => {
    const sidechainTxHashHex = (0x30 + index).toString(16).repeat(32);
    return {
      sidechainIdHex:
        EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
      sidechainBlockHashHex: EXECUTION_BLOCK_HASH_HEX,
      burnIdHex: deriveTrustlessBurnIdHex({
        sidechainIdHex:
          EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
        sidechainTxHashHex,
        eventIndex,
      }),
      sidechainTxHashHex,
      eventIndex,
      recipientErgoTreeHashHex,
      amountNanoErg: 2_000_000n + BigInt(index),
      assetIdHex:
        VALIDITY_APPLICATION_SETTLEMENT_V2_ZERO_SOURCE_ASSET_ID_HEX,
    } satisfies TrustlessBurnLeafInput;
  });
  const targetBurn = burns[2];
  const inclusion = buildTrustlessBurnInclusionProof(
    burns,
    targetBurn.burnIdHex,
  );
  const finalityPayloadHex = buildBoundFinalityPayloadHex({
    bridgeEventRootHex: inclusion.bridgeEventRootHex,
    burnLeafCount: inclusion.leafCount,
  });
  const application = decodeBridgeCausalApplicationBindingV2(
    EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
  );
  const applicationPayload = encodeBridgeValidityApplicationPayloadV3({
    finalityPayload: finalityPayloadHex,
    application,
  });
  const applicationPayloadHex = applicationPayload.toString('hex');
  const decodedPayload =
    decodeBridgeValidityApplicationPayloadV3(applicationPayload);
  const trackerKeyHex = deriveApplicationValiditySpvTrackerKey({
    sidechainIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
    sidechainHeight: SIDECHAIN_HEIGHT,
    executionBlockHashHex: EXECUTION_BLOCK_HASH_HEX,
  });
  const trackerValueFields = {
    bridgeEventRootHex: inclusion.bridgeEventRootHex,
    checkpointCommitmentHex:
      decodedPayload.finality.checkpointCommitmentHex,
    anchorHeaderIdHex: ANCHOR_HEADER_ID_HEX,
    anchorHeaderHeight: 100,
    sidechainConsensusBlockHashHex: CONSENSUS_BLOCK_HASH_HEX,
    burnLeafCount: inclusion.leafCount,
    applicationBindingDigestHex:
      decodedPayload.applicationBindingDigestHex,
    settlementProfileIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_SETTLEMENT_PROFILE_ID_HEX,
    causalProfileIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_CAUSAL_PROFILE_ID_HEX,
    applicationPayloadDigestHex:
      deriveApplicationValidityPayloadDigestHex(applicationPayload),
    programIdHex: EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
    verifierProfileIdHex:
      EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
  } as const;
  const trackerValueHex =
    encodeApplicationValiditySpvTrackerValue(trackerValueFields);
  const trackerHistory = [{
    key: trackerKeyHex,
    value: trackerValueHex,
  }];
  const trackerDigestHex =
    getApplicationValiditySpvTrackerDigest(trackerHistory);
  const p = profile();
  return {
    profile: p,
    applicationPayloadHex,
    finalityPayloadHex,
    trackerKeyHex,
    trackerValueFields,
    trackerValueHex,
    targetBurn,
    inclusion,
    input: {
      profile: p,
      trackerHistory,
      trackerTree: {
        digestHex: trackerDigestHex,
        keyLength: 32,
        valueLength: 370,
        flags: 1,
      },
      applicationPayloadHex,
      duplicatePreventionHistoryKeys: [],
      claim: {
        trackerIdentity: {
          sidechainHeight: SIDECHAIN_HEIGHT,
          executionBlockHashHex: EXECUTION_BLOCK_HASH_HEX,
        },
        burnLeaf: targetBurn,
        leafIndex: inclusion.leafIndex,
        leafCount: inclusion.leafCount,
        burnProof: inclusion.proof,
        recipientErgoTreeHex: RECIPIENT_ERGO_TREE_HEX,
      },
      currentErgoHeight: 110,
    },
  };
}

function buildBoundFinalityPayloadHex(input: {
  bridgeEventRootHex: string;
  burnLeafCount: number;
}): string {
  const bytes = Buffer.from(
    finalityVector.expected.encodedPayloadHex as string,
    'hex',
  );
  const checkpoint = Buffer.from(bytes.subarray(76, 292));
  Buffer.from(
    EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
    'hex',
  ).copy(checkpoint, 4);
  checkpoint.writeBigUInt64BE(BigInt(SIDECHAIN_HEIGHT), 36);
  Buffer.from(CONSENSUS_BLOCK_HASH_HEX, 'hex').copy(checkpoint, 44);
  Buffer.from(EXECUTION_BLOCK_HASH_HEX, 'hex').copy(checkpoint, 76);
  Buffer.from(input.bridgeEventRootHex, 'hex').copy(checkpoint, 108);
  checkpoint.writeUInt32BE(input.burnLeafCount, 140);
  checkpoint.copy(bytes, 76);
  const checkpointCommitment = Buffer.from(
    deriveBridgeCheckpointCommitmentHex(checkpoint),
    'hex',
  );
  checkpointCommitment.copy(bytes, 292);
  Buffer.from(TRACKER_NFT_ID_HEX, 'hex').copy(bytes, 44);
  Buffer.from(APPROVED_TRUST_ROOT_HEX, 'hex').copy(bytes, 516);
  Buffer.concat([
    checkpoint.subarray(108, 140),
    checkpointCommitment,
  ]).copy(bytes, 590);
  return bytes.toString('hex');
}

function withTrackerValue(
  f: Fixture,
  overrides: Partial<Fixture['trackerValueFields']>,
): BuildValidityApplicationSettlementPlanV2Input {
  const value = encodeApplicationValiditySpvTrackerValue({
    ...f.trackerValueFields,
    ...overrides,
  });
  const history = [{ key: f.trackerKeyHex, value }];
  return {
    ...f.input,
    trackerHistory: history,
    trackerTree: {
      ...f.input.trackerTree,
      digestHex: getApplicationValiditySpvTrackerDigest(history),
    },
  };
}

describe('application-bound settlement V2 profile and compact bundle', () => {
  it('pins the distinct profile and encodes the exact compact Var3 ABI', () => {
    const f = fixture();
    const encodedProfile = encodeValidityApplicationSettlementProfileV2(
      f.profile,
    );
    const plan = buildValidityApplicationSettlementPlanV2(f.input);
    const bundle = decodeValidityApplicationSettlementBundleV2(
      plan.proofBundleHex,
    );
    const bundleBytes = Buffer.from(plan.proofBundleHex, 'hex');
    const domainBytes = Buffer.byteLength(
      VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2_DOMAIN,
      'ascii',
    );

    expect(encodedProfile).toHaveLength(
      VALIDITY_APPLICATION_SETTLEMENT_PROFILE_V2_BYTES * 2,
    );
    expect(plan.settlementProfileIdHex)
      .toBe(EIP0045_BRIDGE_APPLICATION_TRACKER_SETTLEMENT_PROFILE_ID_HEX);
    expect(
      deriveValidityApplicationSettlementProfileDescriptorDigestV2(f.profile),
    ).toBe(plan.profileDescriptorDigestHex);
    expect(plan.profileDescriptorDigestHex)
      .not.toBe(plan.settlementProfileIdHex);
    expect(plan.contractCompatibility)
      .toBe('validity-application-settlement-v2-preactivation');
    expect(bundleBytes.subarray(0, domainBytes).toString('ascii'))
      .toBe('E2S_VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2');
    expect(bundleBytes[domainBytes]).toBe(0);
    expect([...bundleBytes.subarray(domainBytes + 1, domainBytes + 5)])
      .toEqual([2, 1, 1, 0]);
    expect(VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2_HEADER_BYTES).toBe(90);
    const fieldsOffset = domainBytes + 5;
    expect([
      bundleBytes.readBigUInt64BE(fieldsOffset),
      bundleBytes.readBigUInt64BE(fieldsOffset + 8),
      bundleBytes.readBigUInt64BE(fieldsOffset + 16),
      bundleBytes.readBigUInt64BE(fieldsOffset + 24),
      bundleBytes.readBigUInt64BE(fieldsOffset + 32),
    ]).toEqual([
      42n,
      2n,
      3n,
      2n,
      BigInt(Buffer.from(plan.dupLookupProofHex, 'hex').length),
    ]);
    expect(bundle).toMatchObject({
      sidechainHeight: String(SIDECHAIN_HEIGHT),
      leafIndex: 2,
      leafCount: 3,
      burnProofNodeCount: 2,
      dupLookupProofLength: Buffer.from(plan.dupLookupProofHex, 'hex').length,
      dupLookupProofHex: plan.dupLookupProofHex,
      dupInsertProofHex: plan.dupInsertProofHex,
    });
    expect(bundle.burnProof).toEqual(f.inclusion.proof);
    expect(plan.proofBundleHex).not.toContain(f.applicationPayloadHex);
    expect(Buffer.from(plan.proofBundleHex, 'hex').length)
      .toBeLessThan(Buffer.from(f.applicationPayloadHex, 'hex').length);
    expect(f.targetBurn.eventIndex).toBe(99);
    expect(plan.leafIndex).toBe(2);
    expect(Object.keys(plan.vaultExtension)).toEqual(['0', '1', '2', '3']);
    expect(Object.keys(plan.dupExtension)).toEqual(['0', '1', '2']);
    expect(plan.boundaries).toEqual({
      trackerValueDecoded: true,
      applicationPayloadCrossCheckedOffChain: true,
      canonicalBurnPathValidatedByPlanner: true,
      payloadOrReceiptTransportedToSettlement: false,
      profileActivated: false,
      targetNodeAcceptanceEstablished: false,
      proofValidityEstablishedInPayoutTransaction: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    });
  });

  it('rejects non-V2 bundle domains and discriminators', () => {
    const plan = buildValidityApplicationSettlementPlanV2(fixture().input);
    const wrongDomain = Buffer.from(plan.proofBundleHex, 'hex');
    wrongDomain[0] ^= 0x01;
    expect(() => decodeValidityApplicationSettlementBundleV2(
      wrongDomain.toString('hex'),
    )).toThrow(/domain mismatch/);

    const wrongDiscriminator = Buffer.from(plan.proofBundleHex, 'hex');
    const offset = Buffer.byteLength(
      VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2_DOMAIN,
      'ascii',
    ) + 1;
    wrongDiscriminator[offset] = 1;
    expect(() => decodeValidityApplicationSettlementBundleV2(
      wrongDiscriminator.toString('hex'),
    )).toThrow(/discriminator mismatch/);
  });

  it('accepts the 256-leaf boundary and rejects 257 leaves', () => {
    const proof = Array.from({ length: 8 }, (_, index) => ({
      side: 'left' as const,
      hashHex: (0xa0 + index).toString(16).repeat(32),
    }));
    const encoded = encodeValidityApplicationSettlementBundleV2({
      sidechainHeight: SIDECHAIN_HEIGHT,
      leafIndex: 255,
      leafCount: 256,
      leafHashHex: 'af'.repeat(32),
      burnProof: proof,
      dupLookupProofHex: '01',
      dupInsertProofHex: '02',
    });

    expect(decodeValidityApplicationSettlementBundleV2(encoded))
      .toMatchObject({
        leafIndex: 255,
        leafCount: 256,
        burnProofNodeCount: 8,
      });
    expect(() => encodeValidityApplicationSettlementBundleV2({
      sidechainHeight: SIDECHAIN_HEIGHT,
      leafIndex: 255,
      leafCount: 257,
      leafHashHex: 'af'.repeat(32),
      burnProof: proof,
      dupLookupProofHex: '01',
      dupInsertProofHex: '02',
    })).toThrow(/leafCount must be between 1 and 256/);
  });
});

describe('application-bound settlement V2 planner', () => {
  it('binds the exact 370-byte tracker value, key, proposition, payload and DUP transition', () => {
    const f = fixture();
    const plan = buildValidityApplicationSettlementPlanV2(f.input);

    expect(plan.trackerKeyHex).toBe(f.trackerKeyHex);
    expect(plan.trackerValueHex).toBe(f.trackerValueHex);
    expect(plan.trackerValueHex).toHaveLength(370 * 2);
    expect(plan.trackerPropositionBytesHex)
      .toBe(EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX);
    expect(plan.applicationPayloadDigestHex)
      .toBe(f.trackerValueFields.applicationPayloadDigestHex);
    expect(plan.burnLeaf.encodedLeafHex).toHaveLength(205 * 2);
    expect(plan.duplicatePreventionKeyHex).toBe(f.targetBurn.burnIdHex);
    expect(plan.dupInputDigestHex).not.toBe(plan.dupOutputDigestHex);
  });

  it('rejects V1 value, key, tree and proposition families independently', () => {
    const f = fixture();
    const v1Value = encodeValiditySpvTrackerValue({
      bridgeEventRootHex: f.inclusion.bridgeEventRootHex,
      checkpointCommitmentHex: 'a2'.repeat(32),
      anchorHeaderIdHex: ANCHOR_HEADER_ID_HEX,
      anchorHeaderHeight: 100,
      compatibilityStatementDigestHex: 'a3'.repeat(32),
      compatibilitySemanticProgramIdHex: 'a4'.repeat(32),
      compatibilityVerifierProfileIdHex: 'a5'.repeat(32),
      compatibilityPayloadDigestHex: 'a6'.repeat(32),
      compatibilityAggregateProofDigestHex: 'a7'.repeat(32),
    });
    expect(() => buildValidityApplicationSettlementPlanV2({
      ...f.input,
      trackerHistory: [{ key: f.trackerKeyHex, value: v1Value }],
    })).toThrow(/370 lowercase hex bytes/);

    const v1Key = deriveValiditySpvTrackerKey({
      sidechainIdHex:
        EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
      sidechainHeight: SIDECHAIN_HEIGHT,
      executionBlockHashHex: EXECUTION_BLOCK_HASH_HEX,
    });
    const wrongKeyHistory = [{ key: v1Key, value: f.trackerValueHex }];
    expect(v1Key).not.toBe(f.trackerKeyHex);
    expect(() => buildValidityApplicationSettlementPlanV2({
      ...f.input,
      trackerHistory: wrongKeyHistory,
      trackerTree: {
        ...f.input.trackerTree,
        digestHex: getApplicationValiditySpvTrackerDigest(wrongKeyHistory),
      },
    })).toThrow(/does not contain the derived V2 key/);

    expect(() => buildValidityApplicationSettlementPlanV2({
      ...f.input,
      trackerTree: { ...f.input.trackerTree, valueLength: 264 },
    })).toThrow(/370-byte values/);
    expect(() => buildValidityApplicationSettlementPlanV2({
      ...f.input,
      trackerTree: {
        ...f.input.trackerTree,
        digestHex: 'fa'.repeat(33),
      },
    })).toThrow(/AVL digest/);

    expect(() => buildValidityApplicationSettlementPlanV2({
      ...f.input,
      profile: {
        ...f.profile,
        trackerPropositionBytesHex:
          EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX,
      },
    })).toThrow(/trackerPropositionBytes/);
  });

  it('rejects isolated static tracker binding substitutions', () => {
    const f = fixture();
    const mutations = [
      ['applicationBindingDigestHex', 'tracker application-binding digest'],
      ['settlementProfileIdHex', 'tracker settlement profile'],
      ['causalProfileIdHex', 'tracker causal profile'],
      ['programIdHex', 'tracker program ID'],
      ['verifierProfileIdHex', 'tracker verifier profile'],
    ] as const;
    for (const [field, message] of mutations) {
      expect(() => buildValidityApplicationSettlementPlanV2(
        withTrackerValue(f, { [field]: 'fe'.repeat(32) }),
      )).toThrow(message);
    }
  });

  it('rejects isolated contract-profile identity substitutions', () => {
    const f = fixture();
    const mutations: readonly (readonly [
      keyof ValidityApplicationSettlementProfileV2,
      string,
    ])[] = [
      ['sourceNetworkIdHex', 'source network'],
      ['sidechainIdHex', 'sidechain'],
      ['trackerNftIdHex', 'tracker NFT'],
      ['trackerContractIdHex', 'tracker contract'],
      ['approvedTrustRootDigestHex', 'approved trust root'],
      ['applicationBindingHex', 'application binding'],
      ['applicationBindingDigestHex', 'application-binding digest'],
      ['settlementProfileIdHex', 'settlement profile'],
      ['causalProfileIdHex', 'causal profile'],
      ['programIdHex', 'program ID'],
      ['verifierProfileIdHex', 'verifier profile'],
      ['duplicatePreventionNftIdHex', 'duplicate-prevention NFT'],
      ['zeroSourceAssetIdHex', 'native ERG asset'],
    ];
    for (const [field, message] of mutations) {
      const current = f.profile[field];
      if (typeof current !== 'string') {
        throw new Error(`test profile field ${field} is not a string`);
      }
      const mutated = `${current.slice(0, -2)}${current.endsWith('ff') ? 'fe' : 'ff'}`;
      expect(() => buildValidityApplicationSettlementPlanV2({
        ...f.input,
        profile: { ...f.profile, [field]: mutated },
      })).toThrow(message);
    }
  });

  it('rejects isolated dynamic tracker and anchor substitutions', () => {
    const f = fixture();
    const mutations = [
      ['bridgeEventRootHex', 'bridge event root'],
      ['checkpointCommitmentHex', 'checkpoint commitment'],
      ['sidechainConsensusBlockHashHex', 'consensus block'],
      ['applicationPayloadDigestHex', 'payload digest'],
    ] as const;
    for (const [field, message] of mutations) {
      expect(() => buildValidityApplicationSettlementPlanV2(
        withTrackerValue(f, { [field]: 'fd'.repeat(32) }),
      )).toThrow(message);
    }
    expect(() => buildValidityApplicationSettlementPlanV2(
      withTrackerValue(f, { burnLeafCount: 4 }),
    )).toThrow(/burn count/);
    expect(() => buildValidityApplicationSettlementPlanV2({
      ...f.input,
      currentErgoHeight: 109,
    })).toThrow(/lacks required confirmations/);
    expect(() => buildValidityApplicationSettlementPlanV2(
      withTrackerValue(f, { anchorHeaderHeight: 111 }),
    )).toThrow(/cannot be in the future/);
  });

  it('rejects leaf index/count, direction, depth and odd-leaf duplication faults', () => {
    const f = fixture();
    expect(() => buildValidityApplicationSettlementPlanV2({
      ...f.input,
      claim: { ...f.input.claim, leafIndex: 3 },
    })).toThrow(/leafIndex must be less than leafCount/);
    expect(() => buildValidityApplicationSettlementPlanV2({
      ...f.input,
      claim: { ...f.input.claim, leafCount: 4 },
    })).toThrow(/equal tracker burnLeafCount/);

    const wrongDirection = [...f.inclusion.proof];
    wrongDirection[0] = {
      ...wrongDirection[0],
      side: wrongDirection[0].side === 'left' ? 'right' : 'left',
    };
    expect(() => buildValidityApplicationSettlementPlanV2({
      ...f.input,
      claim: { ...f.input.claim, burnProof: wrongDirection },
    })).toThrow(/side must match leafIndex path/);
    expect(() => buildValidityApplicationSettlementPlanV2({
      ...f.input,
      claim: {
        ...f.input.claim,
        burnProof: f.inclusion.proof.slice(0, 1),
      },
    })).toThrow(/proof length must match leafCount depth/);

    const wrongOddDuplication: TrustlessBurnMerkleProofStep[] = [
      { ...f.inclusion.proof[0], hashHex: 'fc'.repeat(32) },
      f.inclusion.proof[1],
    ];
    expect(() => buildValidityApplicationSettlementPlanV2({
      ...f.input,
      claim: {
        ...f.input.claim,
        burnProof: wrongOddDuplication,
      },
    })).toThrow(/duplicate the current hash at an odd-width boundary/);
  });

  it('rejects a different but well-formed application payload and a prior spend', () => {
    const f = fixture();
    const application = decodeBridgeCausalApplicationBindingV2(
      EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
    );
    const mismatchedPayload = encodeBridgeValidityApplicationPayloadV3({
      finalityPayload: f.finalityPayloadHex,
      application: {
        ...application,
        bridgeRuntimeCodeSha256Hex: 'fb'.repeat(32),
      },
    });
    expect(() => buildValidityApplicationSettlementPlanV2({
      ...f.input,
      applicationPayloadHex: mismatchedPayload.toString('hex'),
    })).toThrow(/exact binding/);
    expect(() => buildValidityApplicationSettlementPlanV2({
      ...f.input,
      duplicatePreventionHistoryKeys: [f.targetBurn.burnIdHex],
    })).toThrow(/already present in DUP history/);
  });
});

function blake2b256Hex(value: Buffer): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}
