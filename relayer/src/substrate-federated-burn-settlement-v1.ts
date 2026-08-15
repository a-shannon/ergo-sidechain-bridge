/**
 * Pure Substrate federated V1 pooled-reserve burn-settlement planner.
 *
 * The planner consumes one exact FED-2 tracker entry and the frozen FED-3A
 * contract family, then materializes the reserve/DUP/external-fee transaction.
 * It performs no network, persistence, checking, signing, submission, or
 * broadcast operation and does not establish source finality.
 */

import blakejs from 'blakejs';

import {
  tracker_application_v2_empty_digest,
  tracker_application_v2_get_proof,
} from '../../wasm-avl/pkg/bridge_avl.js';
import { getDupTreeDigest, insertLockRecord } from './avl-bridge.js';
import {
  decodeAvlTreeRegisterDigest,
  decodeCanonicalIntRegister,
  decodeCanonicalLongRegister,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeLongRegister,
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  decodeSubstrateFederatedTrackerValueV1,
  deriveSubstrateFederatedTrackerKeyV1Hex,
  SUBSTRATE_FEDERATED_TRACKER_VALUE_V1_BYTES,
  type SubstrateFederatedTrackerValueV1,
} from './profiles/substrate-federated-v1/tracker-admission.js';
import {
  assertSubstrateFederatedSettlementFamilyV1Identity,
  decodeSubstrateFederatedSettlementFamilyV1Profile,
  type SubstrateFederatedSettlementFamilyV1DecodedProfile,
  type SubstrateFederatedSettlementFamilyV1Identity,
} from './substrate-federated-settlement-family-v1.js';
import {
  encodeTrustlessBurnLeaf,
  validateTrustlessBurnInclusionProofEnvelope,
  verifyTrustlessBurnSettlementBinding,
  type TrustlessBurnLeaf,
  type TrustlessBurnLeafInput,
  type TrustlessBurnMerkleProofStep,
} from './trustless-burn-proof.js';
import {
  materializeUnsignedTransaction,
  normalizeEip12Box,
  normalizeErgoTreeHex,
  type Eip12Box,
  type Eip12OutputCandidate,
  type MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';
import {
  encodeValidityApplicationSettlementBundleV2,
} from './validity-application-settlement-v2.js';

export const SUBSTRATE_FEDERATED_BURN_SETTLEMENT_V1_SCHEMA =
  'e2s.substrate-federated-burn-settlement.v1' as const;

const TRACKER_KEY_BYTES = 32;
const TRACKER_AVL_FLAGS = 0x01;
const DUP_AVL_FLAGS = 0x01;
const DUP_VALUE_BYTES = 1;
const RESERVE_AVL_FLAGS = 0x01;
const RESERVE_DEPOSIT_VALUE_BYTES = 32;
const MAX_BURN_LEAVES = 256;
const MIN_BOX_VALUE = 1_000_000n;
const SIGNED_LONG_MAX = 0x7fff_ffff_ffff_ffffn;
const packets = new WeakSet<object>();

export interface SubstrateFederatedTrackerHistoryEntryV1 {
  readonly key: string;
  readonly value: string;
}

export interface SubstrateFederatedBurnClaimV1 {
  readonly trackerIdentity: {
    readonly sourceNativeBlockHeight: string | number | bigint;
    readonly sourceNativeBlockHashHex: string;
    readonly executionBlockHashHex: string;
  };
  readonly burnLeaf: TrustlessBurnLeafInput;
  readonly leafIndex: number;
  readonly leafCount: number;
  readonly burnProof: readonly TrustlessBurnMerkleProofStep[];
  readonly recipientErgoTreeHex: string;
}

export interface BuildSubstrateFederatedBurnSettlementV1Input {
  readonly familyIdentity:
    Readonly<SubstrateFederatedSettlementFamilyV1Identity>;
  readonly trackerState: {
    readonly dataInput: Eip12Box;
    readonly history: readonly SubstrateFederatedTrackerHistoryEntryV1[];
  };
  readonly reserveState: { readonly predecessor: Eip12Box };
  readonly duplicatePreventionState: {
    readonly predecessor: Eip12Box;
    readonly historyKeys: readonly string[];
  };
  readonly feeFundingInput: Eip12Box;
  readonly claim: SubstrateFederatedBurnClaimV1;
  readonly currentErgoHeight: number;
  readonly creationHeight: number;
  readonly feeNanoErg?: string | number | bigint;
}

export interface SubstrateFederatedBurnSettlementV1Packet {
  readonly schema: typeof SUBSTRATE_FEDERATED_BURN_SETTLEMENT_V1_SCHEMA;
  readonly version: 1;
  readonly trustModel: 'federated_non_trustless';
  readonly familyIdHex: string;
  readonly tracker: {
    readonly keyHex: string;
    readonly valueHex: string;
    readonly getProofHex: string;
    readonly inputDigestHex: string;
    readonly decodedValue: Readonly<SubstrateFederatedTrackerValueV1>;
  };
  readonly burn: {
    readonly leaf: TrustlessBurnLeaf;
    readonly leafIndex: number;
    readonly leafCount: number;
    readonly proof: readonly TrustlessBurnMerkleProofStep[];
    readonly duplicatePreventionKeyHex: string;
    readonly recipientErgoTreeHex: string;
  };
  readonly duplicatePrevention: {
    readonly inputDigestHex: string;
    readonly outputDigestHex: string;
    readonly lookupProofHex: string;
    readonly insertProofHex: string;
  };
  readonly reserve: {
    readonly inputValueNanoErg: string;
    readonly outputValueNanoErg: string;
    readonly inputLiabilityNanoErg: string;
    readonly outputLiabilityNanoErg: string;
    readonly protectedSeedNanoErg: string;
    readonly depositDigestHex: string;
  };
  readonly proofBundleHex: string;
  readonly contextExtensions: {
    readonly reserve: Readonly<Record<string, never>>;
    readonly duplicatePrevention:
      Readonly<Record<'0' | '1' | '2' | '3', string>>;
    readonly feeFunding: Readonly<Record<string, never>>;
  };
  readonly transaction: MaterializedUnsignedTransaction;
  readonly boxes: {
    readonly trackerDataInput: Eip12Box;
    readonly reservePredecessor: Eip12Box;
    readonly reserveSuccessor: Eip12Box;
    readonly duplicatePreventionPredecessor: Eip12Box;
    readonly duplicatePreventionSuccessor: Eip12Box;
    readonly feeFundingInput: Eip12Box;
    readonly payout: Eip12Box;
  };
  readonly invariants: {
    readonly exactFederatedTrackerEntryProved: true;
    readonly federatedAuthorityProfileBound: true;
    readonly canonicalBurnInclusionProved: true;
    readonly payoutBoundToBurnLeaf: true;
    readonly duplicatePreventionIsSoleProofConsumer: true;
    readonly reserveBurnContextExtensionIsEmpty: true;
    readonly reserveValueAndLiabilityReducedTogether: true;
    readonly duplicatePreventionInsertedOnce: true;
    readonly externalFeeIsValueNeutral: true;
    readonly deterministicUnsignedTransactionConstructed: true;
  };
  readonly boundaries: {
    readonly burnSettlementTransactionConstructed: true;
    readonly predecessorStateProvenanceEstablished: false;
    readonly sourceAttestationsVerifiedOnChain: false;
    readonly trackerAdmissionEstablished: false;
    readonly sidechainFinalityEstablished: false;
    readonly profileActivated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly nodeCheckPerformed: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  };
}

export async function buildSubstrateFederatedBurnSettlementV1(
  input: BuildSubstrateFederatedBurnSettlementV1Input,
): Promise<Readonly<SubstrateFederatedBurnSettlementV1Packet>> {
  assertExactKeys(input, [
    'familyIdentity',
    'trackerState',
    'reserveState',
    'duplicatePreventionState',
    'feeFundingInput',
    'claim',
    'currentErgoHeight',
    'creationHeight',
  ], 'substrate federated burn-settlement input', ['feeNanoErg']);
  assertExactKeys(input.trackerState, [
    'dataInput',
    'history',
  ], 'substrate federated tracker state');
  assertExactKeys(input.reserveState, [
    'predecessor',
  ], 'substrate federated reserve state');
  assertExactKeys(input.duplicatePreventionState, [
    'predecessor',
    'historyKeys',
  ], 'substrate federated duplicate-prevention state');
  assertClaimShape(input.claim);
  assertSubstrateFederatedSettlementFamilyV1Identity(input.familyIdentity);
  const family = input.familyIdentity;
  const profile = decodeSubstrateFederatedSettlementFamilyV1Profile(
    family.profile,
  );
  assertFamilyReceipts(family, profile);

  const snapshot = structuredClone({
    trackerState: input.trackerState,
    reserveState: input.reserveState,
    duplicatePreventionState: input.duplicatePreventionState,
    feeFundingInput: input.feeFundingInput,
    claim: input.claim,
    currentErgoHeight: input.currentErgoHeight,
    creationHeight: input.creationHeight,
    feeNanoErg: input.feeNanoErg,
  });
  const currentErgoHeight = positiveHeight(
    snapshot.currentErgoHeight,
    'current Ergo height',
  );
  const creationHeight = normalizeCreationHeight(
    snapshot.creationHeight,
    currentErgoHeight,
    profile,
  );
  const fee = minerFee(snapshot.feeNanoErg ?? MINER_FEE, profile);
  const trackerHistory = normalizeTrackerHistory(snapshot.trackerState.history);
  if (trackerHistory.length === 0) {
    throw new Error('substrate federated tracker history must not be empty');
  }
  const claim = normalizeClaim(snapshot.claim);
  const trackerKeyHex = deriveSubstrateFederatedTrackerKeyV1Hex({
    sourceNetworkIdHex: profile.sourceNetworkIdHex,
    sidechainIdHex: profile.sidechainIdHex,
    sourceNativeBlockHeight:
      String(claim.trackerIdentity.sourceNativeBlockHeight),
    sourceNativeBlockHashHex:
      claim.trackerIdentity.sourceNativeBlockHashHex,
    executionBlockHashHex: claim.trackerIdentity.executionBlockHashHex,
  });
  const trackerProof = trackerGetProof(trackerHistory, trackerKeyHex);
  const trackerValue = decodeSubstrateFederatedTrackerValueV1(
    trackerProof.valueHex,
  );

  const [
    trackerDataInput,
    reservePredecessor,
    duplicatePreventionPredecessor,
    feeFundingInput,
  ] = await Promise.all([
    normalizeEip12Box(
      snapshot.trackerState.dataInput,
      'substrate federated tracker data input',
    ),
    normalizeEip12Box(
      snapshot.reserveState.predecessor,
      'substrate federated reserve predecessor',
    ),
    normalizeEip12Box(
      snapshot.duplicatePreventionState.predecessor,
      'substrate federated duplicate-prevention predecessor',
    ),
    normalizeEip12Box(
      snapshot.feeFundingInput,
      'substrate federated fee funding input',
    ),
  ]);
  assertDistinctBoxIds([
    trackerDataInput,
    reservePredecessor,
    duplicatePreventionPredecessor,
    feeFundingInput,
  ]);
  assertObservedBoxesNotFuture([
    trackerDataInput,
    reservePredecessor,
    duplicatePreventionPredecessor,
    feeFundingInput,
  ], currentErgoHeight);
  assertTrackerDataInput({
    tracker: trackerDataInput,
    profile,
    expectedDigestHex: trackerProof.digestHex,
    claimSourceHeight: claim.trackerIdentity.sourceNativeBlockHeight,
    currentErgoHeight,
  });
  validateTrackerValueBindings({
    trackerValue,
    profile,
    claim,
    currentErgoHeight,
  });

  const recipientErgoTreeHex = await normalizeErgoTreeHex(
    claim.recipientErgoTreeHex,
    'substrate federated payout ErgoTree',
  );
  const burnLeaf = encodeTrustlessBurnLeaf(claim.burnLeaf);
  requireEqual(
    burnLeaf.sidechainIdHex,
    profile.sidechainIdHex,
    'substrate federated burn sidechain ID',
  );
  requireEqual(
    burnLeaf.sidechainBlockHashHex,
    claim.trackerIdentity.executionBlockHashHex,
    'substrate federated burn execution block hash',
  );
  requireEqual(
    burnLeaf.assetIdHex,
    profile.settlementAssetIdHex,
    'substrate federated settlement asset ID',
  );
  const proofEnvelope = validateTrustlessBurnInclusionProofEnvelope({
    bridgeEventRootHex: trackerValue.bridgeEventRootHex,
    leaf: burnLeaf,
    leafIndex: claim.leafIndex,
    leafCount: claim.leafCount,
    proof: [...claim.burnProof],
  });
  if (!proofEnvelope.ok) {
    throw new Error(
      `substrate federated burn inclusion rejected: ${
        proofEnvelope.errors.join('; ')
      }`,
    );
  }
  const binding = verifyTrustlessBurnSettlementBinding({
    leaf: burnLeaf,
    bridgeEventRootHex: trackerValue.bridgeEventRootHex,
    proof: [...claim.burnProof],
    duplicatePreventionKeyHex: burnLeaf.burnIdHex,
    recipientErgoTreeHashHex: blake2b256Hex(
      Buffer.from(recipientErgoTreeHex, 'hex'),
    ),
    amountNanoErg: burnLeaf.amountNanoErg,
    assetIdHex: profile.settlementAssetIdHex,
  });
  if (!binding.ok) {
    throw new Error(
      `substrate federated payout binding rejected: ${
        binding.errors.join('; ')
      }`,
    );
  }

  const burnAmount = positiveLong(burnLeaf.amountNanoErg, 'burn amount');
  if (burnAmount < MIN_BOX_VALUE) {
    throw new Error(
      'substrate federated burn amount is below the minimum payout box value',
    );
  }
  const reserve = assertReservePredecessor({
    reserve: reservePredecessor,
    family,
    profile,
    burnAmount,
  });
  const dupHistory = normalizeDupHistory(
    snapshot.duplicatePreventionState.historyKeys,
  );
  if (dupHistory.includes(burnLeaf.burnIdHex)) {
    throw new Error('substrate federated burn ID is already in replay history');
  }
  const dupInputDigestHex = getDupTreeDigest(dupHistory);
  assertDuplicatePreventionPredecessor({
    duplicatePrevention: duplicatePreventionPredecessor,
    family,
    expectedDigestHex: dupInputDigestHex,
  });
  const dupTransition = insertLockRecord(dupHistory, burnLeaf.burnIdHex);
  assertPureFeeFunding(feeFundingInput, fee);
  assertCreationHeightAfterInputs(
    creationHeight,
    [reservePredecessor, duplicatePreventionPredecessor],
  );

  const proofBundleHex = encodeValidityApplicationSettlementBundleV2({
    sidechainHeight: claim.trackerIdentity.sourceNativeBlockHeight,
    leafIndex: claim.leafIndex,
    leafCount: claim.leafCount,
    leafHashHex: burnLeaf.leafHashHex,
    burnProof: claim.burnProof,
    dupLookupProofHex: dupTransition.lookup_proof_hex,
    dupInsertProofHex: dupTransition.insert_proof_hex,
  });
  const proofContextExtension = Object.freeze({
    '0': encodeCollByteRegister(Buffer.from(trackerKeyHex, 'hex')),
    '1': encodeCollByteRegister(Buffer.from(trackerProof.getProofHex, 'hex')),
    '2': encodeCollByteRegister(Buffer.from(burnLeaf.encodedLeafHex, 'hex')),
    '3': encodeCollByteRegister(Buffer.from(proofBundleHex, 'hex')),
  });
  const emptyContextExtension = Object.freeze({}) as Readonly<
    Record<string, never>
  >;
  const reserveSuccessor: Eip12OutputCandidate = {
    value: reserve.outputValue,
    ergoTree: reservePredecessor.ergoTree,
    assets: reservePredecessor.assets,
    additionalRegisters: {
      R4: reservePredecessor.additionalRegisters.R4,
      R5: reservePredecessor.additionalRegisters.R5,
      R6: encodeLongRegister(reserve.outputLiability),
    },
    creationHeight,
  };
  const duplicatePreventionSuccessor: Eip12OutputCandidate = {
    value: duplicatePreventionPredecessor.value,
    ergoTree: duplicatePreventionPredecessor.ergoTree,
    assets: duplicatePreventionPredecessor.assets,
    additionalRegisters: {
      R4: duplicatePreventionPredecessor.additionalRegisters.R4,
      R5: encodeAvlTreeRegister(
        Buffer.from(dupTransition.new_digest_hex, 'hex'),
        DUP_AVL_FLAGS,
        DUP_VALUE_BYTES,
      ),
    },
    creationHeight,
  };
  const payout: Eip12OutputCandidate = {
    value: burnLeaf.amountNanoErg,
    ergoTree: recipientErgoTreeHex,
    assets: [],
    additionalRegisters: {},
    creationHeight,
  };
  const transaction = await materializeUnsignedTransaction({
    inputs: [
      { ...reservePredecessor, extension: emptyContextExtension },
      {
        ...duplicatePreventionPredecessor,
        extension: proofContextExtension,
      },
      { ...feeFundingInput, extension: emptyContextExtension },
    ],
    dataInputs: [trackerDataInput],
    outputs: [
      reserveSuccessor,
      duplicatePreventionSuccessor,
      payout,
      feeOutput(fee, creationHeight),
    ],
  }, 'substrate federated burn settlement V1');
  assertExactMaterializedSettlement({
    transaction,
    trackerDataInput,
    reservePredecessor,
    duplicatePreventionPredecessor,
    feeFundingInput,
    proofContextExtension,
    reserve,
    dupOutputDigestHex: dupTransition.new_digest_hex,
    burnLeaf,
    recipientErgoTreeHex,
    fee,
    creationHeight,
  });

  const result = deepFreeze({
    schema: SUBSTRATE_FEDERATED_BURN_SETTLEMENT_V1_SCHEMA,
    version: 1 as const,
    trustModel: 'federated_non_trustless' as const,
    familyIdHex: family.profile.familyIdHex,
    tracker: {
      keyHex: trackerKeyHex,
      valueHex: trackerProof.valueHex,
      getProofHex: trackerProof.getProofHex,
      inputDigestHex: trackerProof.digestHex,
      decodedValue: trackerValue,
    },
    burn: {
      leaf: burnLeaf,
      leafIndex: claim.leafIndex,
      leafCount: claim.leafCount,
      proof: [...claim.burnProof],
      duplicatePreventionKeyHex: burnLeaf.burnIdHex,
      recipientErgoTreeHex,
    },
    duplicatePrevention: {
      inputDigestHex: dupInputDigestHex,
      outputDigestHex: dupTransition.new_digest_hex,
      lookupProofHex: dupTransition.lookup_proof_hex,
      insertProofHex: dupTransition.insert_proof_hex,
    },
    reserve: {
      inputValueNanoErg: reserve.inputValue.toString(),
      outputValueNanoErg: reserve.outputValue.toString(),
      inputLiabilityNanoErg: reserve.inputLiability.toString(),
      outputLiabilityNanoErg: reserve.outputLiability.toString(),
      protectedSeedNanoErg: reserve.protectedSeed.toString(),
      depositDigestHex: reserve.depositDigestHex,
    },
    proofBundleHex,
    contextExtensions: {
      reserve: emptyContextExtension,
      duplicatePrevention: proofContextExtension,
      feeFunding: emptyContextExtension,
    },
    transaction,
    boxes: {
      trackerDataInput,
      reservePredecessor,
      reserveSuccessor: transaction.outputs[0],
      duplicatePreventionPredecessor,
      duplicatePreventionSuccessor: transaction.outputs[1],
      feeFundingInput,
      payout: transaction.outputs[2],
    },
    invariants: {
      exactFederatedTrackerEntryProved: true as const,
      federatedAuthorityProfileBound: true as const,
      canonicalBurnInclusionProved: true as const,
      payoutBoundToBurnLeaf: true as const,
      duplicatePreventionIsSoleProofConsumer: true as const,
      reserveBurnContextExtensionIsEmpty: true as const,
      reserveValueAndLiabilityReducedTogether: true as const,
      duplicatePreventionInsertedOnce: true as const,
      externalFeeIsValueNeutral: true as const,
      deterministicUnsignedTransactionConstructed: true as const,
    },
    boundaries: {
      burnSettlementTransactionConstructed: true as const,
      predecessorStateProvenanceEstablished: false as const,
      sourceAttestationsVerifiedOnChain: false as const,
      trackerAdmissionEstablished: false as const,
      sidechainFinalityEstablished: false as const,
      profileActivated: false as const,
      targetNodeAcceptanceEstablished: false as const,
      nodeCheckPerformed: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  });
  packets.add(result);
  return result;
}

export function assertSubstrateFederatedBurnSettlementV1Packet(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedBurnSettlementV1Packet> {
  if (value === null || typeof value !== 'object' || !packets.has(value)) {
    throw new Error(
      'substrate federated burn-settlement packet was not built in this process',
    );
  }
}

export function getSubstrateFederatedTrackerDigestV1Hex(
  history: readonly SubstrateFederatedTrackerHistoryEntryV1[],
): string {
  const normalized = normalizeTrackerHistory(history);
  if (normalized.length === 0) {
    return fixedHex(
      tracker_application_v2_empty_digest(),
      33,
      'empty substrate federated tracker digest',
    );
  }
  return trackerGetProof(normalized, normalized[0].key).digestHex;
}

function normalizeTrackerHistory(
  history: readonly SubstrateFederatedTrackerHistoryEntryV1[],
): SubstrateFederatedTrackerHistoryEntryV1[] {
  if (!Array.isArray(history)) {
    throw new Error('substrate federated tracker history must be an array');
  }
  const seen = new Set<string>();
  return history.map((entry, index) => {
    assertExactKeys(entry, [
      'key',
      'value',
    ], `substrate federated tracker history entry ${index}`);
    const key = fixedHex(
      entry.key,
      TRACKER_KEY_BYTES,
      `substrate federated tracker history entry ${index} key`,
    );
    if (seen.has(key)) {
      throw new Error('substrate federated tracker history has duplicate keys');
    }
    seen.add(key);
    const value = fixedHex(
      entry.value,
      SUBSTRATE_FEDERATED_TRACKER_VALUE_V1_BYTES,
      `substrate federated tracker history entry ${index} value`,
    );
    decodeSubstrateFederatedTrackerValueV1(value);
    return Object.freeze({ key, value });
  });
}

function trackerGetProof(
  history: readonly SubstrateFederatedTrackerHistoryEntryV1[],
  keyHex: string,
): {
  readonly valueHex: string;
  readonly getProofHex: string;
  readonly digestHex: string;
} {
  const key = fixedHex(keyHex, 32, 'substrate federated tracker key');
  if (!history.some(entry => entry.key === key)) {
    throw new Error('substrate federated tracker history lacks the derived key');
  }
  const raw = JSON.parse(tracker_application_v2_get_proof(
    JSON.stringify(history),
    key,
  )) as Readonly<Record<string, unknown>>;
  return Object.freeze({
    valueHex: fixedHex(
      raw.value_hex,
      SUBSTRATE_FEDERATED_TRACKER_VALUE_V1_BYTES,
      'substrate federated tracker proof value',
    ),
    getProofHex: variableHex(
      raw.get_proof_hex,
      'substrate federated tracker get proof',
    ),
    digestHex: fixedHex(
      raw.digest_hex,
      33,
      'substrate federated tracker digest',
    ),
  });
}

function assertFamilyReceipts(
  family: Readonly<SubstrateFederatedSettlementFamilyV1Identity>,
  profile: Readonly<SubstrateFederatedSettlementFamilyV1DecodedProfile>,
): void {
  const checks = [
    [
      family.contracts.duplicatePrevention.templateSha256Hex,
      profile.duplicatePreventionTemplateSha256Hex,
    ],
    [
      family.contracts.sourceLock.templateSha256Hex,
      profile.sourceLockTemplateSha256Hex,
    ],
    [
      family.contracts.pooledReserve.templateSha256Hex,
      profile.pooledReserveTemplateSha256Hex,
    ],
  ] as const;
  if (checks.some(([actual, expected]) => actual !== expected)) {
    throw new Error('substrate federated family template identity drifted');
  }
}

function assertClaimShape(claim: SubstrateFederatedBurnClaimV1): void {
  assertExactKeys(claim, [
    'trackerIdentity',
    'burnLeaf',
    'leafIndex',
    'leafCount',
    'burnProof',
    'recipientErgoTreeHex',
  ], 'substrate federated burn claim');
  assertExactKeys(claim.trackerIdentity, [
    'sourceNativeBlockHeight',
    'sourceNativeBlockHashHex',
    'executionBlockHashHex',
  ], 'substrate federated tracker identity');
  assertExactKeys(claim.burnLeaf, [
    'sidechainIdHex',
    'sidechainBlockHashHex',
    'burnIdHex',
    'sidechainTxHashHex',
    'eventIndex',
    'recipientErgoTreeHashHex',
    'amountNanoErg',
  ], 'substrate federated burn leaf', ['assetIdHex']);
  if (!Array.isArray(claim.burnProof)) {
    throw new Error('substrate federated burn proof must be an array');
  }
  claim.burnProof.forEach((step, index) => assertExactKeys(step, [
    'side',
    'hashHex',
  ], `substrate federated burn proof step ${index}`));
}

function normalizeClaim(
  claim: SubstrateFederatedBurnClaimV1,
): SubstrateFederatedBurnClaimV1 {
  return Object.freeze({
    trackerIdentity: Object.freeze({
      sourceNativeBlockHeight: positiveLong(
        claim.trackerIdentity.sourceNativeBlockHeight,
        'claim source native block height',
      ).toString(),
      sourceNativeBlockHashHex: nonzeroFixedHex(
        claim.trackerIdentity.sourceNativeBlockHashHex,
        32,
        'claim source native block hash',
      ),
      executionBlockHashHex: nonzeroFixedHex(
        claim.trackerIdentity.executionBlockHashHex,
        32,
        'claim execution block hash',
      ),
    }),
    burnLeaf: structuredClone(claim.burnLeaf),
    leafIndex: boundedCount(
      claim.leafIndex,
      0,
      MAX_BURN_LEAVES - 1,
      'burn leaf index',
    ),
    leafCount: boundedCount(
      claim.leafCount,
      1,
      MAX_BURN_LEAVES,
      'burn leaf count',
    ),
    burnProof: Object.freeze(claim.burnProof.map((step, index) => {
      if (step.side !== 'left' && step.side !== 'right') {
        throw new Error(
          `substrate federated burn proof step ${index} side is invalid`,
        );
      }
      return Object.freeze({
        side: step.side,
        hashHex: fixedHex(
          step.hashHex,
          32,
          `substrate federated burn proof step ${index} hash`,
        ),
      });
    })),
    recipientErgoTreeHex: variableHex(
      claim.recipientErgoTreeHex,
      'substrate federated payout ErgoTree',
    ),
  });
}

function assertTrackerDataInput(input: {
  readonly tracker: Eip12Box;
  readonly profile: Readonly<SubstrateFederatedSettlementFamilyV1DecodedProfile>;
  readonly expectedDigestHex: string;
  readonly claimSourceHeight: string | number | bigint;
  readonly currentErgoHeight: number;
}): void {
  const tracker = input.tracker;
  if (
    blake2b256Hex(Buffer.from(tracker.ergoTree, 'hex'))
      !== input.profile.trackerContractIdHex
    || tracker.assets.length !== 1
    || tracker.assets[0].tokenId !== input.profile.trackerNftIdHex
    || tracker.assets[0].amount !== '1'
    || Object.keys(tracker.additionalRegisters).sort().join(',')
      !== 'R4,R5,R6,R7,R8,R9'
    || tracker.additionalRegisters.R4 !== encodeCollByteRegister(
      Buffer.from(input.profile.federationProfileIdHex, 'hex'),
    )
    || tracker.additionalRegisters.R6 !== encodeCollByteRegister(
      Buffer.from(input.profile.sidechainIdHex, 'hex'),
    )
    || tracker.additionalRegisters.R9 !== encodeCollByteRegister(
      Buffer.from(input.profile.ergoAdmissionKeySetDigestHex, 'hex'),
    )
  ) {
    throw new Error(
      'substrate federated tracker data input is not the exact singleton',
    );
  }
  const actualDigest = decodeAvlTreeRegisterDigest(
    tracker.additionalRegisters.R5,
    'substrate federated tracker R5',
  );
  const latestHeight = decodeCanonicalLongRegister(
    tracker.additionalRegisters.R7,
    'substrate federated tracker R7',
  );
  const stamp = decodeCanonicalIntRegister(
    tracker.additionalRegisters.R8,
    'substrate federated tracker R8',
  );
  if (
    tracker.additionalRegisters.R5 !== encodeAvlTreeRegister(
      Buffer.from(actualDigest, 'hex'),
      TRACKER_AVL_FLAGS,
      SUBSTRATE_FEDERATED_TRACKER_VALUE_V1_BYTES,
    )
    || actualDigest !== fixedHex(
      input.expectedDigestHex,
      33,
      'expected substrate federated tracker digest',
    )
  ) {
    throw new Error(
      'substrate federated tracker data input is not the exact singleton',
    );
  }
  if (latestHeight < positiveLong(
    input.claimSourceHeight,
    'claim source native block height',
  )) {
    throw new Error('substrate federated tracker latest height is stale');
  }
  if (stamp < 0 || stamp > input.currentErgoHeight) {
    throw new Error('substrate federated tracker stamp is invalid');
  }
}

function validateTrackerValueBindings(input: {
  readonly trackerValue: Readonly<SubstrateFederatedTrackerValueV1>;
  readonly profile: Readonly<SubstrateFederatedSettlementFamilyV1DecodedProfile>;
  readonly claim: SubstrateFederatedBurnClaimV1;
  readonly currentErgoHeight: number;
}): void {
  const value = input.trackerValue;
  const exact = [
    [value.runtimeProfileIdHex, input.profile.runtimeProfileIdHex],
    [value.settlementProfileIdHex, input.profile.settlementProfileIdHex],
    [value.federationProfileIdHex, input.profile.federationProfileIdHex],
    [
      value.ergoAdmissionKeySetDigestHex,
      input.profile.ergoAdmissionKeySetDigestHex,
    ],
    [
      String(value.ergoAdmissionThreshold),
      String(input.profile.ergoAdmissionThreshold),
    ],
    [value.federationEpoch, input.profile.federationEpoch],
    [
      value.sourceNativeBlockHeight,
      String(input.claim.trackerIdentity.sourceNativeBlockHeight),
    ],
    [
      value.sourceNativeBlockHashHex,
      input.claim.trackerIdentity.sourceNativeBlockHashHex,
    ],
    [
      value.executionBlockHashHex,
      input.claim.trackerIdentity.executionBlockHashHex,
    ],
  ] as const;
  if (exact.some(([actual, expected]) => actual !== expected)) {
    throw new Error('substrate federated tracker value binding mismatch');
  }
  if (
    value.anchorHeaderHeight > input.currentErgoHeight
    || input.currentErgoHeight - value.anchorHeaderHeight
      < input.profile.minimumAnchorConfirmations
  ) {
    throw new Error('substrate federated tracker anchor lacks required depth');
  }
  const anchorHeight = BigInt(value.anchorHeaderHeight);
  if (
    anchorHeight < BigInt(value.admissionValidFromErgoHeight)
    || anchorHeight >= BigInt(value.admissionExpiresAtErgoHeight)
  ) {
    throw new Error('substrate federated tracker anchor is outside its horizon');
  }
  if (value.burnLeafCount !== input.claim.leafCount) {
    throw new Error('substrate federated tracker burn count differs from claim');
  }
}

function assertReservePredecessor(input: {
  readonly reserve: Eip12Box;
  readonly family: Readonly<SubstrateFederatedSettlementFamilyV1Identity>;
  readonly profile: Readonly<SubstrateFederatedSettlementFamilyV1DecodedProfile>;
  readonly burnAmount: bigint;
}) {
  const reserve = input.reserve;
  if (
    reserve.ergoTree
      !== input.family.contracts.pooledReserve.receipt.propositionHex
    || reserve.assets.length !== 1
    || reserve.assets[0].tokenId !== input.profile.pooledReserveNftIdHex
    || reserve.assets[0].amount !== '1'
    || Object.keys(reserve.additionalRegisters).sort().join(',') !== 'R4,R5,R6'
    || reserve.additionalRegisters.R4 !== encodeCollByteRegister(
      Buffer.from(input.family.profile.familyIdHex, 'hex'),
    )
  ) {
    throw new Error(
      'substrate federated reserve predecessor identity is invalid',
    );
  }
  const depositDigestHex = decodeAvlTreeRegisterDigest(
    reserve.additionalRegisters.R5,
    'substrate federated reserve R5',
  );
  const inputLiability = decodeCanonicalLongRegister(
    reserve.additionalRegisters.R6,
    'substrate federated reserve R6',
  );
  if (
    reserve.additionalRegisters.R5 !== encodeAvlTreeRegister(
      Buffer.from(depositDigestHex, 'hex'),
      RESERVE_AVL_FLAGS,
      RESERVE_DEPOSIT_VALUE_BYTES,
    )
  ) {
    throw new Error(
      'substrate federated reserve predecessor identity is invalid',
    );
  }
  const inputValue = positiveLong(reserve.value, 'substrate federated reserve');
  if (inputLiability < 0n || inputLiability > inputValue) {
    throw new Error('substrate federated reserve liability is invalid');
  }
  if (input.burnAmount > inputValue || input.burnAmount > inputLiability) {
    throw new Error('substrate federated reserve is insufficient for burn');
  }
  const outputValue = inputValue - input.burnAmount;
  const outputLiability = inputLiability - input.burnAmount;
  const protectedSeed = inputValue - inputLiability;
  if (
    outputValue - outputLiability !== protectedSeed
    || outputValue < MIN_BOX_VALUE
  ) {
    throw new Error('substrate federated reserve conservation would fail');
  }
  return {
    inputValue,
    outputValue,
    inputLiability,
    outputLiability,
    protectedSeed,
    depositDigestHex,
  };
}

function assertDuplicatePreventionPredecessor(input: {
  readonly duplicatePrevention: Eip12Box;
  readonly family: Readonly<SubstrateFederatedSettlementFamilyV1Identity>;
  readonly expectedDigestHex: string;
}): void {
  const dup = input.duplicatePrevention;
  if (
    dup.ergoTree
      !== input.family.contracts.duplicatePrevention.receipt.propositionHex
    || dup.assets.length !== 1
    || dup.assets[0].tokenId
      !== input.family.profile.duplicatePreventionNftIdHex
    || dup.assets[0].amount !== '1'
    || Object.keys(dup.additionalRegisters).sort().join(',') !== 'R4,R5'
    || dup.additionalRegisters.R4 !== encodeCollByteRegister(
      Buffer.from(input.family.profile.familyIdHex, 'hex'),
    )
  ) {
    throw new Error(
      'substrate federated duplicate-prevention identity or history mismatch',
    );
  }
  const actualDigest = decodeAvlTreeRegisterDigest(
    dup.additionalRegisters.R5,
    'substrate federated duplicate-prevention R5',
  );
  if (
    dup.additionalRegisters.R5 !== encodeAvlTreeRegister(
      Buffer.from(actualDigest, 'hex'),
      DUP_AVL_FLAGS,
      DUP_VALUE_BYTES,
    )
    || actualDigest !== fixedHex(
      input.expectedDigestHex,
      33,
      'expected substrate federated duplicate-prevention digest',
    )
  ) {
    throw new Error(
      'substrate federated duplicate-prevention identity or history mismatch',
    );
  }
}

function normalizeDupHistory(historyKeys: readonly string[]): string[] {
  if (!Array.isArray(historyKeys)) {
    throw new Error('substrate federated replay history must be an array');
  }
  const normalized = historyKeys.map((key, index) => fixedHex(
    key,
    32,
    `substrate federated replay history key ${index}`,
  ));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('substrate federated replay history has duplicate keys');
  }
  return normalized;
}

function assertPureFeeFunding(box: Eip12Box, fee: bigint): void {
  if (
    box.assets.length !== 0
    || Object.keys(box.additionalRegisters).length !== 0
    || BigInt(box.value) !== fee
  ) {
    throw new Error(
      'substrate federated fee funding must be exact pure ERG',
    );
  }
}

function assertExactMaterializedSettlement(input: {
  readonly transaction: MaterializedUnsignedTransaction;
  readonly trackerDataInput: Eip12Box;
  readonly reservePredecessor: Eip12Box;
  readonly duplicatePreventionPredecessor: Eip12Box;
  readonly feeFundingInput: Eip12Box;
  readonly proofContextExtension:
    Readonly<Record<'0' | '1' | '2' | '3', string>>;
  readonly reserve: ReturnType<typeof assertReservePredecessor>;
  readonly dupOutputDigestHex: string;
  readonly burnLeaf: TrustlessBurnLeaf;
  readonly recipientErgoTreeHex: string;
  readonly fee: bigint;
  readonly creationHeight: number;
}): void {
  const tx = input.transaction;
  if (
    tx.eip12Tx.inputs.length !== 3
    || tx.eip12Tx.dataInputs.length !== 1
    || tx.outputs.length !== 4
    || tx.eip12Tx.inputs[0].boxId !== input.reservePredecessor.boxId
    || tx.eip12Tx.inputs[1].boxId
      !== input.duplicatePreventionPredecessor.boxId
    || tx.eip12Tx.inputs[2].boxId !== input.feeFundingInput.boxId
    || tx.eip12Tx.dataInputs[0].boxId !== input.trackerDataInput.boxId
    || Object.keys(tx.eip12Tx.inputs[0].extension).length !== 0
    || !exactRecord(
      tx.eip12Tx.inputs[1].extension,
      input.proofContextExtension,
    )
    || Object.keys(tx.eip12Tx.inputs[2].extension).length !== 0
  ) {
    throw new Error('substrate federated settlement topology drifted');
  }
  const reserveOut = tx.outputs[0];
  const dupOut = tx.outputs[1];
  const payout = tx.outputs[2];
  const fee = tx.outputs[3];
  const checks = [
    BigInt(reserveOut.value) === input.reserve.outputValue,
    reserveOut.ergoTree === input.reservePredecessor.ergoTree,
    JSON.stringify(reserveOut.assets)
      === JSON.stringify(input.reservePredecessor.assets),
    reserveOut.additionalRegisters.R4
      === input.reservePredecessor.additionalRegisters.R4,
    reserveOut.additionalRegisters.R5
      === input.reservePredecessor.additionalRegisters.R5,
    reserveOut.additionalRegisters.R6
      === encodeLongRegister(input.reserve.outputLiability),
    reserveOut.creationHeight === input.creationHeight,
    dupOut.value === input.duplicatePreventionPredecessor.value,
    dupOut.ergoTree === input.duplicatePreventionPredecessor.ergoTree,
    JSON.stringify(dupOut.assets)
      === JSON.stringify(input.duplicatePreventionPredecessor.assets),
    dupOut.additionalRegisters.R4
      === input.duplicatePreventionPredecessor.additionalRegisters.R4,
    dupOut.additionalRegisters.R5 === encodeAvlTreeRegister(
      Buffer.from(input.dupOutputDigestHex, 'hex'),
      DUP_AVL_FLAGS,
      DUP_VALUE_BYTES,
    ),
    dupOut.creationHeight === input.creationHeight,
    payout.value === input.burnLeaf.amountNanoErg,
    payout.ergoTree === input.recipientErgoTreeHex,
    payout.assets.length === 0,
    Object.keys(payout.additionalRegisters).length === 0,
    payout.creationHeight === input.creationHeight,
    BigInt(fee.value) === input.fee,
    fee.ergoTree === MINER_FEE_TREE,
    fee.assets.length === 0,
    Object.keys(fee.additionalRegisters).length === 0,
    fee.creationHeight === input.creationHeight,
  ];
  if (checks.some(passed => !passed)) {
    throw new Error('substrate federated settlement outputs drifted');
  }
}

function normalizeCreationHeight(
  creationHeight: number,
  currentErgoHeight: number,
  profile: Readonly<SubstrateFederatedSettlementFamilyV1DecodedProfile>,
): number {
  const normalized = positiveHeight(
    creationHeight,
    'substrate federated successor creation height',
  );
  if (
    normalized > currentErgoHeight
    || normalized
      < currentErgoHeight - profile.maximumSuccessorCreationHeightLag
  ) {
    throw new Error(
      'substrate federated successor creation height is outside the window',
    );
  }
  return normalized;
}

function assertCreationHeightAfterInputs(
  creationHeight: number,
  inputs: readonly Eip12Box[],
): void {
  if (inputs.some(input => creationHeight < input.creationHeight)) {
    throw new Error('substrate federated successor predates a protected input');
  }
}

function feeOutput(
  value: bigint,
  creationHeight: number,
): Eip12OutputCandidate {
  return {
    value,
    ergoTree: MINER_FEE_TREE,
    assets: [],
    additionalRegisters: {},
    creationHeight,
  };
}

function minerFee(
  value: string | number | bigint,
  profile: Readonly<SubstrateFederatedSettlementFamilyV1DecodedProfile>,
): bigint {
  const fee = positiveLong(value, 'substrate federated miner fee');
  if (
    fee < BigInt(profile.minimumExternalFeeNanoErg)
    || fee > BigInt(profile.maximumExternalFeeNanoErg)
  ) {
    throw new Error('substrate federated miner fee is outside the profile');
  }
  return fee;
}

function assertDistinctBoxIds(boxes: readonly Eip12Box[]): void {
  if (new Set(boxes.map(box => box.boxId)).size !== boxes.length) {
    throw new Error('substrate federated settlement boxes must be distinct');
  }
}

function assertObservedBoxesNotFuture(
  boxes: readonly Eip12Box[],
  currentErgoHeight: number,
): void {
  if (boxes.some(box => box.creationHeight > currentErgoHeight)) {
    throw new Error('substrate federated settlement input is in the future');
  }
}

function requireEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} mismatch`);
  }
}

function exactRecord(
  actual: Readonly<Record<string, string>>,
  expected: Readonly<Record<string, string>>,
): boolean {
  const actualKeys = Object.keys(actual);
  const expectedKeys = Object.keys(expected);
  return actualKeys.length === expectedKeys.length
    && expectedKeys.every(key => actual[key] === expected[key]);
}

function positiveLong(
  value: string | number | bigint,
  label: string,
): bigint {
  if (
    !['string', 'number', 'bigint'].includes(typeof value)
    || (typeof value === 'number' && !Number.isSafeInteger(value))
  ) {
    throw new Error(`${label} must be an exact integer`);
  }
  let normalized: bigint;
  try {
    normalized = typeof value === 'bigint' ? value : BigInt(value);
  } catch {
    throw new Error(`${label} must be an integer`);
  }
  if (normalized <= 0n || normalized > SIGNED_LONG_MAX) {
    throw new Error(`${label} must be a positive signed Long`);
  }
  return normalized;
}

function positiveHeight(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 0x7fff_ffff) {
    throw new Error(`${label} must be a positive signed Int`);
  }
  return value;
}

function boundedCount(
  value: number,
  min: number,
  max: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function nonzeroFixedHex(
  value: unknown,
  bytes: number,
  label: string,
): string {
  const normalized = fixedHex(value, bytes, label);
  if (/^0+$/.test(normalized)) {
    throw new Error(`${label} must not be zero`);
  }
  return normalized;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be canonical hex`);
  }
  const normalized = value.toLowerCase().replace(/^0x/, '');
  if (
    !/^[0-9a-f]+$/.test(normalized)
    || normalized.length !== bytes * 2
  ) {
    throw new Error(`${label} must be canonical hex`);
  }
  return normalized;
}

function variableHex(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be canonical hex`);
  }
  const normalized = value.toLowerCase().replace(/^0x/, '');
  if (
    normalized.length === 0
    || normalized.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new Error(`${label} must be canonical hex`);
  }
  return normalized;
}

function blake2b256Hex(value: Uint8Array): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function assertExactKeys(
  value: object,
  requiredKeys: readonly string[],
  label: string,
  optionalKeys: readonly string[] = [],
): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value);
  const allowed = [...requiredKeys, ...optionalKeys];
  if (
    requiredKeys.some(key => !Object.hasOwn(value, key))
    || actual.some(key => !allowed.includes(key))
  ) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (
    value === null
    || typeof value !== 'object'
    || seen.has(value as object)
  ) {
    return value;
  }
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}
