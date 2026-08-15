/**
 * Pure V6 pooled-reserve burn-settlement planner.
 *
 * This module reconstructs authenticated tracker and DUP state from caller
 * supplied history, binds the retained V5 proof object to exact V6 singleton
 * identities, and materializes an unsigned EIP-12 transaction. It performs no
 * network, persistence, checker, signing, submission, or broadcast operation.
 */

import blakejs from 'blakejs';

import {
  tracker_application_v2_empty_digest,
  tracker_application_v2_get_proof,
} from '../../wasm-avl/pkg/bridge_avl.js';
import {
  getDupTreeDigest,
  insertLockRecord,
} from './avl-bridge.js';
import {
  decodeAvlTreeRegisterDigest,
  decodeCanonicalIntRegister,
  decodeCanonicalLongRegister,
  decodeCollByteRegister,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeLongRegister,
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  decodePegInPooledReserveLineageProfileV4Hex,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
import {
  decodePooledReserveBurnApplicationBindingV5,
} from './pooled-reserve-burn-statement-v5.js';
import {
  encodeValidityApplicationSettlementBundleV2,
} from './validity-application-settlement-v2.js';
import {
  encodeTrustlessBurnLeaf,
  validateTrustlessBurnInclusionProofEnvelope,
  verifyTrustlessBurnSettlementBinding,
  type TrustlessBurnLeaf,
  type TrustlessBurnLeafInput,
  type TrustlessBurnMerkleProofStep,
} from './trustless-burn-proof.js';
import {
  assertCompiledValidityApplicationPooledReserveInstanceV6Candidate,
  type ValidityApplicationPooledReserveInstanceV6Candidate,
} from './validity-application-pooled-reserve-instance-v6.js';
import {
  materializeUnsignedTransaction,
  normalizeEip12Box,
  normalizeErgoTreeHex,
  type Eip12Box,
  type Eip12OutputCandidate,
  type MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';

export const
VALIDITY_APPLICATION_POOLED_RESERVE_BURN_SETTLEMENT_V6_SCHEMA =
  'e2s.validity-application-pooled-reserve-burn-settlement.v6' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_TRACKER_KEY_V5_DOMAIN =
  'E2S_SPV_VALIDITY_APPLICATION_KEY_V5' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_TRACKER_VALUE_V5_DOMAIN =
  'E2S_SPV_VALIDITY_APPLICATION_VALUE_V5' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_TRACKER_VALUE_V5_BYTES = 370;

const TRACKER_VALUE_VERSION = 5 as const;
const HASH_ALGORITHM_BLAKE2B256 = 1 as const;
const SOURCE_FINALITY_PROFILE_V1 = 1 as const;
const VALUE_FLAGS_NONE = 0 as const;
const TRACKER_VALUE_DOMAIN_BYTES = Buffer.byteLength(
  VALIDITY_APPLICATION_POOLED_RESERVE_TRACKER_VALUE_V5_DOMAIN,
  'ascii',
);
const TRACKER_VALUE_FIELDS_OFFSET = TRACKER_VALUE_DOMAIN_BYTES + 1 + 4;
const TRACKER_KEY_BYTES = 32;
const TRACKER_VALUE_BYTES =
  VALIDITY_APPLICATION_POOLED_RESERVE_TRACKER_VALUE_V5_BYTES;
const TRACKER_AVL_FLAGS = 0x01;
const DUP_AVL_FLAGS = 0x01;
const DUP_VALUE_BYTES = 1;
const RESERVE_DEPOSIT_VALUE_BYTES = 32;
const RESERVE_AVL_FLAGS = 0x01;
const MIN_ANCHOR_CONFIRMATIONS = 10;
const MAX_SUCCESSOR_CREATION_HEIGHT_LAG = 100;
const MAX_BURN_LEAVES = 256;
const MIN_BOX_VALUE = 1_000_000n;
const MAX_MINER_FEE = 2_100_000n;
const SIGNED_LONG_MAX = 0x7fff_ffff_ffff_ffffn;
const ZERO_ASSET_ID_HEX = '00'.repeat(32);
const packets = new WeakSet<object>();

export interface ValidityApplicationPooledReserveTrackerIdentityV5 {
  readonly sidechainIdHex: string;
  readonly sidechainHeight: string | number | bigint;
  readonly executionBlockHashHex: string;
}

export interface ValidityApplicationPooledReserveTrackerHistoryEntryV5 {
  readonly key: string;
  readonly value: string;
}

export interface ValidityApplicationPooledReserveTrackerValueV5Input {
  readonly bridgeEventRootHex: string;
  readonly checkpointCommitmentHex: string;
  readonly anchorHeaderIdHex: string;
  readonly anchorHeaderHeight: number;
  readonly sidechainConsensusBlockHashHex: string;
  readonly burnLeafCount: number;
  readonly applicationBindingDigestHex: string;
  readonly settlementProfileIdHex: string;
  readonly pooledReserveProfileIdHex: string;
  readonly applicationPayloadDigestHex: string;
  readonly programIdHex: string;
  readonly verifierProfileIdHex: string;
}

export interface ValidityApplicationPooledReserveTrackerValueV5 {
  readonly version: 5;
  readonly hashAlgorithmId: 1;
  readonly sourceFinalityProfileId: 1;
  readonly flags: 0;
  readonly bridgeEventRootHex: string;
  readonly checkpointCommitmentHex: string;
  readonly anchorHeaderIdHex: string;
  readonly anchorHeaderHeight: number;
  readonly sidechainConsensusBlockHashHex: string;
  readonly burnLeafCount: number;
  readonly applicationBindingDigestHex: string;
  readonly settlementProfileIdHex: string;
  readonly pooledReserveProfileIdHex: string;
  readonly applicationPayloadDigestHex: string;
  readonly programIdHex: string;
  readonly verifierProfileIdHex: string;
}

export interface ValidityApplicationPooledReserveBurnClaimV6 {
  readonly trackerIdentity: Omit<
    ValidityApplicationPooledReserveTrackerIdentityV5,
    'sidechainIdHex'
  >;
  readonly burnLeaf: TrustlessBurnLeafInput;
  readonly leafIndex: number;
  readonly leafCount: number;
  readonly burnProof: readonly TrustlessBurnMerkleProofStep[];
  readonly recipientErgoTreeHex: string;
}

export interface BuildValidityApplicationPooledReserveBurnSettlementV6Input {
  readonly compiledInstance:
    Readonly<ValidityApplicationPooledReserveInstanceV6Candidate>;
  readonly trackerState: {
    readonly dataInput: Eip12Box;
    readonly history:
      readonly ValidityApplicationPooledReserveTrackerHistoryEntryV5[];
  };
  readonly reserveState: {
    readonly predecessor: Eip12Box;
  };
  readonly duplicatePreventionState: {
    readonly predecessor: Eip12Box;
    readonly historyKeys: readonly string[];
  };
  readonly feeFundingInput: Eip12Box;
  readonly claim: ValidityApplicationPooledReserveBurnClaimV6;
  readonly currentErgoHeight: number;
  readonly creationHeight: number;
  readonly feeNanoErg?: string | number | bigint;
}

export interface ValidityApplicationPooledReserveBurnSettlementV6Packet {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_BURN_SETTLEMENT_V6_SCHEMA;
  readonly version: 6;
  readonly lineageProfileIdHex: string;
  readonly tracker: {
    readonly keyHex: string;
    readonly valueHex: string;
    readonly getProofHex: string;
    readonly inputDigestHex: string;
    readonly decodedValue: ValidityApplicationPooledReserveTrackerValueV5;
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
    readonly exactV5TrackerEntryProved: true;
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
    readonly trackerAdmissionEstablished: false;
    readonly sidechainFinalityEstablished: false;
    readonly proofSystemActivated: false;
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

export function deriveValidityApplicationPooledReserveTrackerKeyV5Hex(
  input: ValidityApplicationPooledReserveTrackerIdentityV5,
): string {
  assertExactKeys(input, [
    'sidechainIdHex',
    'sidechainHeight',
    'executionBlockHashHex',
  ], 'pooled-reserve V5 tracker identity');
  return blake2b256Hex(Buffer.concat([
    Buffer.from(
      VALIDITY_APPLICATION_POOLED_RESERVE_TRACKER_KEY_V5_DOMAIN,
      'ascii',
    ),
    fixedHexBytes(input.sidechainIdHex, 32, 'sidechain ID'),
    uint64Be(positiveLong(input.sidechainHeight, 'sidechain height')),
    fixedHexBytes(
      input.executionBlockHashHex,
      32,
      'execution block hash',
    ),
  ]));
}

export function encodeValidityApplicationPooledReserveTrackerValueV5Hex(
  input: ValidityApplicationPooledReserveTrackerValueV5Input,
): string {
  const value = normalizeTrackerValueInput(input);
  const encoded = Buffer.concat([
    Buffer.from(
      VALIDITY_APPLICATION_POOLED_RESERVE_TRACKER_VALUE_V5_DOMAIN,
      'ascii',
    ),
    Buffer.from([0]),
    Buffer.from([
      TRACKER_VALUE_VERSION,
      HASH_ALGORITHM_BLAKE2B256,
      SOURCE_FINALITY_PROFILE_V1,
      VALUE_FLAGS_NONE,
    ]),
    Buffer.from(value.bridgeEventRootHex, 'hex'),
    Buffer.from(value.checkpointCommitmentHex, 'hex'),
    Buffer.from(value.anchorHeaderIdHex, 'hex'),
    uint32Be(value.anchorHeaderHeight, 'anchor header height'),
    Buffer.from(value.sidechainConsensusBlockHashHex, 'hex'),
    uint32Be(value.burnLeafCount, 'burn leaf count'),
    Buffer.from(value.applicationBindingDigestHex, 'hex'),
    Buffer.from(value.settlementProfileIdHex, 'hex'),
    Buffer.from(value.pooledReserveProfileIdHex, 'hex'),
    Buffer.from(value.applicationPayloadDigestHex, 'hex'),
    Buffer.from(value.programIdHex, 'hex'),
    Buffer.from(value.verifierProfileIdHex, 'hex'),
  ]);
  if (encoded.length !== TRACKER_VALUE_BYTES) {
    throw new Error('pooled-reserve V5 tracker value internal length mismatch');
  }
  return encoded.toString('hex');
}

export function decodeValidityApplicationPooledReserveTrackerValueV5(
  valueHex: string,
): ValidityApplicationPooledReserveTrackerValueV5 {
  const bytes = Buffer.from(fixedHex(
    valueHex,
    TRACKER_VALUE_BYTES,
    'pooled-reserve V5 tracker value',
  ), 'hex');
  const expectedDomain = Buffer.concat([
    Buffer.from(
      VALIDITY_APPLICATION_POOLED_RESERVE_TRACKER_VALUE_V5_DOMAIN,
      'ascii',
    ),
    Buffer.from([0]),
  ]);
  if (!bytes.subarray(0, expectedDomain.length).equals(expectedDomain)) {
    throw new Error('pooled-reserve V5 tracker value domain mismatch');
  }
  const discriminatorOffset = expectedDomain.length;
  const version = bytes[discriminatorOffset];
  const hashAlgorithmId = bytes[discriminatorOffset + 1];
  const sourceFinalityProfileId = bytes[discriminatorOffset + 2];
  const flags = bytes[discriminatorOffset + 3];
  if (version !== TRACKER_VALUE_VERSION) {
    throw new Error(`unsupported pooled-reserve tracker value version: ${version}`);
  }
  if (hashAlgorithmId !== HASH_ALGORITHM_BLAKE2B256) {
    throw new Error(
      `unsupported pooled-reserve tracker hash algorithm: ${hashAlgorithmId}`,
    );
  }
  if (sourceFinalityProfileId !== SOURCE_FINALITY_PROFILE_V1) {
    throw new Error(
      'unsupported pooled-reserve tracker source finality profile: '
      + sourceFinalityProfileId,
    );
  }
  if (flags !== VALUE_FLAGS_NONE) {
    throw new Error(`unsupported pooled-reserve tracker value flags: ${flags}`);
  }
  let offset = TRACKER_VALUE_FIELDS_OFFSET;
  const take32 = (label: string): string => {
    const field = bytes.subarray(offset, offset + 32).toString('hex');
    offset += 32;
    return nonzeroFixedHex(field, 32, label);
  };
  const bridgeEventRootHex = take32('bridge event root');
  const checkpointCommitmentHex = take32('checkpoint commitment');
  const anchorHeaderIdHex = take32('anchor header ID');
  const anchorHeaderHeight = bytes.readUInt32BE(offset);
  offset += 4;
  const sidechainConsensusBlockHashHex =
    take32('sidechain consensus block hash');
  const burnLeafCount = bytes.readUInt32BE(offset);
  offset += 4;
  if (burnLeafCount < 1 || burnLeafCount > MAX_BURN_LEAVES) {
    throw new Error(
      `pooled-reserve tracker burn leaf count must be 1..${MAX_BURN_LEAVES}`,
    );
  }
  const applicationBindingDigestHex =
    take32('application binding digest');
  const settlementProfileIdHex = take32('settlement profile ID');
  const pooledReserveProfileIdHex = take32('pooled-reserve profile ID');
  const applicationPayloadDigestHex =
    take32('application payload digest');
  const programIdHex = take32('program ID');
  const verifierProfileIdHex = take32('verifier profile ID');
  if (offset !== bytes.length) {
    throw new Error('pooled-reserve V5 tracker value was not fully consumed');
  }
  return Object.freeze({
    version: TRACKER_VALUE_VERSION,
    hashAlgorithmId: HASH_ALGORITHM_BLAKE2B256,
    sourceFinalityProfileId: SOURCE_FINALITY_PROFILE_V1,
    flags: VALUE_FLAGS_NONE,
    bridgeEventRootHex,
    checkpointCommitmentHex,
    anchorHeaderIdHex,
    anchorHeaderHeight,
    sidechainConsensusBlockHashHex,
    burnLeafCount,
    applicationBindingDigestHex,
    settlementProfileIdHex,
    pooledReserveProfileIdHex,
    applicationPayloadDigestHex,
    programIdHex,
    verifierProfileIdHex,
  });
}

export function getValidityApplicationPooledReserveTrackerDigestV5Hex(
  history: readonly ValidityApplicationPooledReserveTrackerHistoryEntryV5[],
): string {
  const normalized = normalizeTrackerHistory(history);
  if (normalized.length === 0) {
    return fixedHex(
      tracker_application_v2_empty_digest(),
      33,
      'empty pooled-reserve V5 tracker digest',
    );
  }
  return trackerGetProof(normalized, normalized[0].key).digestHex;
}

export async function
buildValidityApplicationPooledReserveBurnSettlementV6(
  input: BuildValidityApplicationPooledReserveBurnSettlementV6Input,
): Promise<Readonly<ValidityApplicationPooledReserveBurnSettlementV6Packet>> {
  assertExactKeys(input, [
    'compiledInstance',
    'trackerState',
    'reserveState',
    'duplicatePreventionState',
    'feeFundingInput',
    'claim',
    'currentErgoHeight',
    'creationHeight',
  ], 'pooled-reserve V6 burn-settlement input', ['feeNanoErg']);
  assertExactKeys(input.trackerState, [
    'dataInput',
    'history',
  ], 'pooled-reserve V5 tracker state');
  assertExactKeys(input.reserveState, [
    'predecessor',
  ], 'pooled-reserve V6 reserve state');
  assertExactKeys(input.duplicatePreventionState, [
    'predecessor',
    'historyKeys',
  ], 'pooled-reserve V6 duplicate-prevention state');
  assertClaimShape(input.claim);

  const compiled = input.compiledInstance;
  assertCompiledValidityApplicationPooledReserveInstanceV6Candidate(compiled);
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
  const profile = decodePegInPooledReserveLineageProfileV4Hex(
    compiled.encodedLineageProfileHex,
  );
  const burnApplicationBinding =
    decodePooledReserveBurnApplicationBindingV5(
      compiled.application.burnBindingHex,
    );
  requireEqual(
    burnApplicationBinding.bindingDigestHex,
    fixedHex(
      compiled.application.burnBindingDigestHex,
      32,
      'compiled burn application binding digest',
    ),
    'compiled burn application binding digest',
  );
  requireEqual(
    fixedHex(
      burnApplicationBinding.runtimeProfileScaleHex,
      349,
      'burn application runtime profile',
    ),
    fixedHex(
      compiled.application.runtimeProfileScaleHex,
      349,
      'compiled runtime profile',
    ),
    'compiled runtime profile',
  );
  requireEqual(
    fixedHex(
      burnApplicationBinding.runtimeProfileIdHex,
      32,
      'burn application runtime profile ID',
    ),
    fixedHex(
      compiled.application.runtimeProfileIdHex,
      32,
      'compiled runtime profile ID',
    ),
    'compiled runtime profile ID',
  );
  requireEqual(
    fixedHex(
      burnApplicationBinding.settlementTrackerContractIdHex,
      32,
      'burn application tracker contract ID',
    ),
    fixedHex(
      compiled.contracts.tracker.receipt.contractIdHex,
      32,
      'compiled tracker contract ID',
    ),
    'compiled tracker contract ID',
  );
  requireEqual(
    fixedHex(
      burnApplicationBinding.trackerNftIdHex,
      32,
      'burn application tracker NFT ID',
    ),
    fixedHex(
      compiled.genesis.trackerNftIdHex,
      32,
      'compiled tracker NFT ID',
    ),
    'compiled tracker NFT ID',
  );
  requireEqual(
    fixedHex(
      burnApplicationBinding.runtimeProfile.sidechainIdHex,
      32,
      'burn application sidechain ID',
    ),
    fixedHex(profile.sidechainIdHex, 32, 'profile sidechain ID'),
    'compiled burn application sidechain ID',
  );
  requireEqual(
    fixedHex(
      burnApplicationBinding.runtimeProfile.settlementProfileIdHex,
      32,
      'burn application settlement profile ID',
    ),
    fixedHex(profile.settlementProfileIdHex, 32, 'settlement profile ID'),
    'compiled settlement profile ID',
  );
  requireEqual(
    fixedHex(
      burnApplicationBinding.runtimeProfile.lineageProfileIdHex,
      32,
      'burn application source runtime lineage profile ID',
    ),
    fixedHex(
      compiled.sourceRuntimeLineageProfileIdHex,
      32,
      'source runtime lineage profile ID',
    ),
    'compiled source runtime lineage profile ID',
  );

  const currentErgoHeight = positiveHeight(
    snapshot.currentErgoHeight,
    'current Ergo height',
  );
  const creationHeight = normalizeCreationHeight(
    snapshot.creationHeight,
    currentErgoHeight,
  );
  const fee = minerFee(snapshot.feeNanoErg ?? MINER_FEE);
  const trackerHistory = normalizeTrackerHistory(
    snapshot.trackerState.history,
  );
  if (trackerHistory.length === 0) {
    throw new Error('pooled-reserve V5 tracker history must not be empty');
  }
  const claim = normalizeClaim(snapshot.claim);
  const trackerIdentity = {
    sidechainIdHex: profile.sidechainIdHex,
    sidechainHeight: claim.trackerIdentity.sidechainHeight,
    executionBlockHashHex:
      claim.trackerIdentity.executionBlockHashHex,
  };
  const trackerKeyHex =
    deriveValidityApplicationPooledReserveTrackerKeyV5Hex(trackerIdentity);
  const trackerProof = trackerGetProof(trackerHistory, trackerKeyHex);
  const trackerValue =
    decodeValidityApplicationPooledReserveTrackerValueV5(
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
      'pooled-reserve V5 tracker data input',
    ),
    normalizeEip12Box(
      snapshot.reserveState.predecessor,
      'pooled-reserve V6 reserve predecessor',
    ),
    normalizeEip12Box(
      snapshot.duplicatePreventionState.predecessor,
      'pooled-reserve V6 duplicate-prevention predecessor',
    ),
    normalizeEip12Box(
      snapshot.feeFundingInput,
      'pooled-reserve V6 fee funding input',
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
    compiled,
    profileIdHex: compiled.lineageProfileIdHex,
    sidechainIdHex: profile.sidechainIdHex,
    trustAnchorDigestHex:
      compiled.sidechainFinalityPolicy.approvedTrustAnchorDigestHex,
    expectedDigestHex: trackerProof.digestHex,
    claimSidechainHeight: claim.trackerIdentity.sidechainHeight,
    currentErgoHeight,
  });
  validateTrackerValueBindings({
    trackerValue,
    compiled,
    burnApplicationBinding,
    claim,
    currentErgoHeight,
  });

  const recipientErgoTreeHex = await normalizeErgoTreeHex(
    claim.recipientErgoTreeHex,
    'pooled-reserve V6 payout ErgoTree',
  );
  const burnLeaf = encodeTrustlessBurnLeaf(claim.burnLeaf);
  requireEqual(
    burnLeaf.sidechainIdHex,
    fixedHex(profile.sidechainIdHex, 32, 'profile sidechain ID'),
    'burn leaf sidechain ID',
  );
  requireEqual(
    burnLeaf.sidechainBlockHashHex,
    fixedHex(
      claim.trackerIdentity.executionBlockHashHex,
      32,
      'claim execution block hash',
    ),
    'burn leaf execution block hash',
  );
  requireEqual(
    burnLeaf.assetIdHex,
    ZERO_ASSET_ID_HEX,
    'pooled-reserve V6 native ERG asset lane',
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
      `pooled-reserve V6 burn inclusion rejected: ${
        proofEnvelope.errors.join('; ')
      }`,
    );
  }
  if (claim.leafCount !== trackerValue.burnLeafCount) {
    throw new Error(
      'pooled-reserve V6 leafCount must equal tracker burnLeafCount',
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
    assetIdHex: ZERO_ASSET_ID_HEX,
  });
  if (!binding.ok) {
    throw new Error(
      `pooled-reserve V6 payout binding rejected: ${binding.errors.join('; ')}`,
    );
  }

  const burnAmount = positiveLong(burnLeaf.amountNanoErg, 'burn amount');
  if (burnAmount < MIN_BOX_VALUE) {
    throw new Error(
      'pooled-reserve V6 burn amount is below the minimum payout box value',
    );
  }
  const reserve = assertReservePredecessor({
    reserve: reservePredecessor,
    compiled,
    burnAmount,
  });
  const dupHistory = normalizeDupHistory(
    snapshot.duplicatePreventionState.historyKeys,
  );
  if (dupHistory.includes(burnLeaf.burnIdHex)) {
    throw new Error(
      'pooled-reserve V6 burn ID is already present in replay history',
    );
  }
  const dupInputDigestHex = getDupTreeDigest(dupHistory);
  assertDuplicatePreventionPredecessor({
    duplicatePrevention: duplicatePreventionPredecessor,
    compiled,
    expectedDigestHex: dupInputDigestHex,
  });
  const dupTransition = insertLockRecord(dupHistory, burnLeaf.burnIdHex);
  assertPureFeeFunding(feeFundingInput, fee);
  assertCreationHeightAfterInputs(
    creationHeight,
    [reservePredecessor, duplicatePreventionPredecessor],
  );

  const proofBundleHex = encodeValidityApplicationSettlementBundleV2({
    sidechainHeight: claim.trackerIdentity.sidechainHeight,
    leafIndex: claim.leafIndex,
    leafCount: claim.leafCount,
    leafHashHex: burnLeaf.leafHashHex,
    burnProof: claim.burnProof,
    dupLookupProofHex: dupTransition.lookup_proof_hex,
    dupInsertProofHex: dupTransition.insert_proof_hex,
  });
  const proofContextExtension = Object.freeze({
    '0': encodeCollByteRegister(Buffer.from(trackerKeyHex, 'hex')),
    '1': encodeCollByteRegister(Buffer.from(
      trackerProof.getProofHex,
      'hex',
    )),
    '2': encodeCollByteRegister(Buffer.from(
      burnLeaf.encodedLeafHex,
      'hex',
    )),
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
  }, 'validity application pooled-reserve burn settlement V6');
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
    schema:
      VALIDITY_APPLICATION_POOLED_RESERVE_BURN_SETTLEMENT_V6_SCHEMA,
    version: 6 as const,
    lineageProfileIdHex: fixedHex(
      compiled.lineageProfileIdHex,
      32,
      'pooled-reserve profile ID',
    ),
    tracker: Object.freeze({
      keyHex: trackerKeyHex,
      valueHex: trackerProof.valueHex,
      getProofHex: trackerProof.getProofHex,
      inputDigestHex: trackerProof.digestHex,
      decodedValue: trackerValue,
    }),
    burn: Object.freeze({
      leaf: burnLeaf,
      leafIndex: claim.leafIndex,
      leafCount: claim.leafCount,
      proof: Object.freeze([...claim.burnProof]),
      duplicatePreventionKeyHex: burnLeaf.burnIdHex,
      recipientErgoTreeHex,
    }),
    duplicatePrevention: Object.freeze({
      inputDigestHex: dupInputDigestHex,
      outputDigestHex: dupTransition.new_digest_hex,
      lookupProofHex: dupTransition.lookup_proof_hex,
      insertProofHex: dupTransition.insert_proof_hex,
    }),
    reserve: Object.freeze({
      inputValueNanoErg: reserve.inputValue.toString(),
      outputValueNanoErg: reserve.outputValue.toString(),
      inputLiabilityNanoErg: reserve.inputLiability.toString(),
      outputLiabilityNanoErg: reserve.outputLiability.toString(),
      protectedSeedNanoErg: reserve.protectedSeed.toString(),
      depositDigestHex: reserve.depositDigestHex,
    }),
    proofBundleHex,
    contextExtensions: Object.freeze({
      reserve: emptyContextExtension,
      duplicatePrevention: proofContextExtension,
      feeFunding: emptyContextExtension,
    }),
    transaction,
    boxes: Object.freeze({
      trackerDataInput,
      reservePredecessor,
      reserveSuccessor: transaction.outputs[0],
      duplicatePreventionPredecessor,
      duplicatePreventionSuccessor: transaction.outputs[1],
      feeFundingInput,
      payout: transaction.outputs[2],
    }),
    invariants: Object.freeze({
      exactV5TrackerEntryProved: true as const,
      canonicalBurnInclusionProved: true as const,
      payoutBoundToBurnLeaf: true as const,
      duplicatePreventionIsSoleProofConsumer: true as const,
      reserveBurnContextExtensionIsEmpty: true as const,
      reserveValueAndLiabilityReducedTogether: true as const,
      duplicatePreventionInsertedOnce: true as const,
      externalFeeIsValueNeutral: true as const,
      deterministicUnsignedTransactionConstructed: true as const,
    }),
    boundaries: Object.freeze({
      burnSettlementTransactionConstructed: true as const,
      trackerAdmissionEstablished: false as const,
      sidechainFinalityEstablished: false as const,
      proofSystemActivated: false as const,
      targetNodeAcceptanceEstablished: false as const,
      nodeCheckPerformed: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    }),
  });
  packets.add(result);
  return result;
}

export function
assertValidityApplicationPooledReserveBurnSettlementV6Packet(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveBurnSettlementV6Packet
> {
  if (value === null || typeof value !== 'object' || !packets.has(value)) {
    throw new Error(
      'pooled-reserve V6 burn-settlement packet was not built in this process',
    );
  }
}

function normalizeTrackerValueInput(
  input: ValidityApplicationPooledReserveTrackerValueV5Input,
): ValidityApplicationPooledReserveTrackerValueV5Input {
  assertExactKeys(input, [
    'bridgeEventRootHex',
    'checkpointCommitmentHex',
    'anchorHeaderIdHex',
    'anchorHeaderHeight',
    'sidechainConsensusBlockHashHex',
    'burnLeafCount',
    'applicationBindingDigestHex',
    'settlementProfileIdHex',
    'pooledReserveProfileIdHex',
    'applicationPayloadDigestHex',
    'programIdHex',
    'verifierProfileIdHex',
  ], 'pooled-reserve V5 tracker value');
  const burnLeafCount = boundedCount(
    input.burnLeafCount,
    1,
    MAX_BURN_LEAVES,
    'burn leaf count',
  );
  return Object.freeze({
    bridgeEventRootHex:
      nonzeroFixedHex(input.bridgeEventRootHex, 32, 'bridge event root'),
    checkpointCommitmentHex: nonzeroFixedHex(
      input.checkpointCommitmentHex,
      32,
      'checkpoint commitment',
    ),
    anchorHeaderIdHex:
      nonzeroFixedHex(input.anchorHeaderIdHex, 32, 'anchor header ID'),
    anchorHeaderHeight: unsignedInt32(
      input.anchorHeaderHeight,
      'anchor header height',
    ),
    sidechainConsensusBlockHashHex: nonzeroFixedHex(
      input.sidechainConsensusBlockHashHex,
      32,
      'sidechain consensus block hash',
    ),
    burnLeafCount,
    applicationBindingDigestHex: nonzeroFixedHex(
      input.applicationBindingDigestHex,
      32,
      'application binding digest',
    ),
    settlementProfileIdHex: nonzeroFixedHex(
      input.settlementProfileIdHex,
      32,
      'settlement profile ID',
    ),
    pooledReserveProfileIdHex: nonzeroFixedHex(
      input.pooledReserveProfileIdHex,
      32,
      'pooled-reserve profile ID',
    ),
    applicationPayloadDigestHex: nonzeroFixedHex(
      input.applicationPayloadDigestHex,
      32,
      'application payload digest',
    ),
    programIdHex: nonzeroFixedHex(input.programIdHex, 32, 'program ID'),
    verifierProfileIdHex: nonzeroFixedHex(
      input.verifierProfileIdHex,
      32,
      'verifier profile ID',
    ),
  });
}

function normalizeTrackerHistory(
  history: readonly ValidityApplicationPooledReserveTrackerHistoryEntryV5[],
): ValidityApplicationPooledReserveTrackerHistoryEntryV5[] {
  if (!Array.isArray(history)) {
    throw new Error('pooled-reserve V5 tracker history must be an array');
  }
  const seen = new Set<string>();
  return history.map((entry, index) => {
    assertExactKeys(entry, [
      'key',
      'value',
    ], `pooled-reserve V5 tracker history entry ${index}`);
    const key = fixedHex(
      entry.key,
      TRACKER_KEY_BYTES,
      `pooled-reserve V5 tracker history entry ${index} key`,
    );
    if (seen.has(key)) {
      throw new Error('pooled-reserve V5 tracker history contains duplicate keys');
    }
    seen.add(key);
    const value = fixedHex(
      entry.value,
      TRACKER_VALUE_BYTES,
      `pooled-reserve V5 tracker history entry ${index} value`,
    );
    decodeValidityApplicationPooledReserveTrackerValueV5(value);
    return Object.freeze({ key, value });
  });
}

function trackerGetProof(
  history: readonly ValidityApplicationPooledReserveTrackerHistoryEntryV5[],
  keyHex: string,
): {
  keyHex: string;
  valueHex: string;
  getProofHex: string;
  digestHex: string;
} {
  const key = fixedHex(keyHex, TRACKER_KEY_BYTES, 'pooled-reserve tracker key');
  if (!history.some(entry => entry.key === key)) {
    throw new Error(
      'pooled-reserve V5 tracker history does not contain the derived key',
    );
  }
  const raw = JSON.parse(
    tracker_application_v2_get_proof(JSON.stringify(history), key),
  ) as Readonly<Record<string, unknown>>;
  return Object.freeze({
    keyHex: key,
    valueHex: fixedHex(
      raw.value_hex,
      TRACKER_VALUE_BYTES,
      'pooled-reserve V5 tracker proof value',
    ),
    getProofHex: variableHex(
      raw.get_proof_hex,
      'pooled-reserve V5 tracker get proof',
    ),
    digestHex: fixedHex(
      raw.digest_hex,
      33,
      'pooled-reserve V5 tracker digest',
    ),
  });
}

function assertClaimShape(
  claim: ValidityApplicationPooledReserveBurnClaimV6,
): void {
  assertExactKeys(claim, [
    'trackerIdentity',
    'burnLeaf',
    'leafIndex',
    'leafCount',
    'burnProof',
    'recipientErgoTreeHex',
  ], 'pooled-reserve V6 burn claim');
  assertExactKeys(claim.trackerIdentity, [
    'sidechainHeight',
    'executionBlockHashHex',
  ], 'pooled-reserve V6 burn tracker identity');
  assertExactKeys(claim.burnLeaf, [
    'sidechainIdHex',
    'sidechainBlockHashHex',
    'burnIdHex',
    'sidechainTxHashHex',
    'eventIndex',
    'recipientErgoTreeHashHex',
    'amountNanoErg',
  ], 'pooled-reserve V6 burn leaf', ['assetIdHex']);
  if (!Array.isArray(claim.burnProof)) {
    throw new Error('pooled-reserve V6 burn proof must be an array');
  }
  claim.burnProof.forEach((step, index) => {
    assertExactKeys(step, [
      'side',
      'hashHex',
    ], `pooled-reserve V6 burn proof step ${index}`);
  });
}

function normalizeClaim(
  claim: ValidityApplicationPooledReserveBurnClaimV6,
): ValidityApplicationPooledReserveBurnClaimV6 {
  return Object.freeze({
    trackerIdentity: Object.freeze({
      sidechainHeight: positiveLong(
        claim.trackerIdentity.sidechainHeight,
        'claim sidechain height',
      ).toString(),
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
        throw new Error(`pooled-reserve V6 burn proof step ${index} side is invalid`);
      }
      return Object.freeze({
        side: step.side,
        hashHex: fixedHex(
          step.hashHex,
          32,
          `pooled-reserve V6 burn proof step ${index} hash`,
        ),
      });
    })),
    recipientErgoTreeHex: variableHex(
      claim.recipientErgoTreeHex,
      'pooled-reserve V6 payout ErgoTree',
    ),
  });
}

function assertTrackerDataInput(input: {
  tracker: Eip12Box;
  compiled: Readonly<ValidityApplicationPooledReserveInstanceV6Candidate>;
  profileIdHex: string;
  sidechainIdHex: string;
  trustAnchorDigestHex: string;
  expectedDigestHex: string;
  claimSidechainHeight: string | number | bigint;
  currentErgoHeight: number;
}): void {
  const expectedRegisters = {
    R4: encodeCollByteRegister(Buffer.from(
      fixedHex(input.profileIdHex, 32, 'pooled-reserve profile ID'),
      'hex',
    )),
    R5: encodeAvlTreeRegister(
      Buffer.from(input.expectedDigestHex, 'hex'),
      TRACKER_AVL_FLAGS,
      TRACKER_VALUE_BYTES,
    ),
    R6: encodeCollByteRegister(Buffer.from(
      fixedHex(input.sidechainIdHex, 32, 'sidechain ID'),
      'hex',
    )),
    R9: encodeCollByteRegister(Buffer.from(
      fixedHex(input.trustAnchorDigestHex, 32, 'trust-anchor digest'),
      'hex',
    )),
  };
  const latestHeight = decodeCanonicalLongRegister(
    input.tracker.additionalRegisters.R7,
    'pooled-reserve V5 tracker R7',
  );
  const stamp = decodeCanonicalIntRegister(
    input.tracker.additionalRegisters.R8,
    'pooled-reserve V5 tracker R8',
  );
  if (
    input.tracker.ergoTree !== fixedHex(
      input.compiled.contracts.tracker.receipt.propositionHex,
      undefined,
      'pooled-reserve V5 tracker proposition',
    )
    || input.tracker.assets.length !== 1
    || input.tracker.assets[0].tokenId !== fixedHex(
      input.compiled.genesis.trackerNftIdHex,
      32,
      'pooled-reserve V5 tracker NFT',
    )
    || input.tracker.assets[0].amount !== '1'
    || Object.keys(input.tracker.additionalRegisters).sort().join(',')
      !== 'R4,R5,R6,R7,R8,R9'
    || input.tracker.additionalRegisters.R4 !== expectedRegisters.R4
    || input.tracker.additionalRegisters.R5 !== expectedRegisters.R5
    || input.tracker.additionalRegisters.R6 !== expectedRegisters.R6
    || input.tracker.additionalRegisters.R9 !== expectedRegisters.R9
  ) {
    throw new Error(
      'pooled-reserve V5 tracker data input is not the exact compiled singleton',
    );
  }
  if (
    latestHeight < positiveLong(
      input.claimSidechainHeight,
      'claim sidechain height',
    )
  ) {
    throw new Error(
      'pooled-reserve V5 tracker latest height predates the claimed entry',
    );
  }
  if (stamp < 0 || stamp > input.currentErgoHeight) {
    throw new Error('pooled-reserve V5 tracker stamp is invalid or in the future');
  }
}

function validateTrackerValueBindings(input: {
  trackerValue: ValidityApplicationPooledReserveTrackerValueV5;
  compiled: Readonly<ValidityApplicationPooledReserveInstanceV6Candidate>;
  burnApplicationBinding: ReturnType<
    typeof decodePooledReserveBurnApplicationBindingV5
  >;
  claim: ValidityApplicationPooledReserveBurnClaimV6;
  currentErgoHeight: number;
}): void {
  const bindings = [
    [
      'burn application binding digest',
      input.trackerValue.applicationBindingDigestHex,
      fixedHex(
        input.compiled.application.burnBindingDigestHex,
        32,
        'compiled burn application binding digest',
      ),
    ],
    [
      'settlement profile ID',
      input.trackerValue.settlementProfileIdHex,
      fixedHex(
        input.burnApplicationBinding.runtimeProfile.settlementProfileIdHex,
        32,
        'burn application settlement profile ID',
      ),
    ],
    [
      'pooled-reserve profile ID',
      input.trackerValue.pooledReserveProfileIdHex,
      fixedHex(
        input.compiled.lineageProfileIdHex,
        32,
        'compiled pooled-reserve profile ID',
      ),
    ],
    [
      'program ID',
      input.trackerValue.programIdHex,
      fixedHex(
        input.compiled.application.programIdHex,
        32,
        'compiled program ID',
      ),
    ],
    [
      'verifier profile ID',
      input.trackerValue.verifierProfileIdHex,
      fixedHex(
        input.compiled.application.verifierProfileIdHex,
        32,
        'compiled verifier profile ID',
      ),
    ],
  ] as const;
  for (const [label, actual, expected] of bindings) {
    requireEqual(actual, expected, `pooled-reserve V5 tracker ${label}`);
  }
  if (
    input.trackerValue.anchorHeaderHeight > input.currentErgoHeight
  ) {
    throw new Error('pooled-reserve V5 tracker anchor is in the future');
  }
  if (
    input.currentErgoHeight - input.trackerValue.anchorHeaderHeight
      < MIN_ANCHOR_CONFIRMATIONS
  ) {
    throw new Error(
      'pooled-reserve V5 tracker anchor lacks required confirmations',
    );
  }
  if (
    input.trackerValue.burnLeafCount !== input.claim.leafCount
  ) {
    throw new Error(
      'pooled-reserve V5 tracker burn count differs from claim leafCount',
    );
  }
}

function assertReservePredecessor(input: {
  reserve: Eip12Box;
  compiled: Readonly<ValidityApplicationPooledReserveInstanceV6Candidate>;
  burnAmount: bigint;
}): {
  inputValue: bigint;
  outputValue: bigint;
  inputLiability: bigint;
  outputLiability: bigint;
  protectedSeed: bigint;
  depositDigestHex: string;
} {
  const profileRegister = encodeCollByteRegister(Buffer.from(
    fixedHex(
      input.compiled.lineageProfileIdHex,
      32,
      'pooled-reserve profile ID',
    ),
    'hex',
  ));
  const depositDigestHex = decodeAvlTreeRegisterDigest(
    input.reserve.additionalRegisters.R5,
    'pooled-reserve V6 reserve R5',
  );
  const inputLiability = decodeCanonicalLongRegister(
    input.reserve.additionalRegisters.R6,
    'pooled-reserve V6 reserve R6',
  );
  if (
    input.reserve.ergoTree !== fixedHex(
      input.compiled.contracts.pooledReserve.receipt.propositionHex,
      undefined,
      'pooled-reserve V6 reserve proposition',
    )
    || input.reserve.assets.length !== 1
    || input.reserve.assets[0].tokenId !== fixedHex(
      input.compiled.genesis.settlementVaultNftIdHex,
      32,
      'pooled-reserve V6 reserve NFT',
    )
    || input.reserve.assets[0].amount !== '1'
    || Object.keys(input.reserve.additionalRegisters).sort().join(',')
      !== 'R4,R5,R6'
    || input.reserve.additionalRegisters.R4 !== profileRegister
    || input.reserve.additionalRegisters.R5 !== encodeAvlTreeRegister(
      Buffer.from(depositDigestHex, 'hex'),
      RESERVE_AVL_FLAGS,
      RESERVE_DEPOSIT_VALUE_BYTES,
    )
  ) {
    throw new Error(
      'pooled-reserve V6 reserve predecessor has wrong contract, NFT, profile, or AVL policy',
    );
  }
  const inputValue = positiveLong(
    input.reserve.value,
    'pooled-reserve V6 reserve value',
  );
  if (inputLiability < 0n || inputLiability > inputValue) {
    throw new Error('pooled-reserve V6 reserve liability is invalid');
  }
  if (
    input.burnAmount > inputValue
    || input.burnAmount > inputLiability
  ) {
    throw new Error(
      'pooled-reserve V6 reserve value or liability is insufficient for burn',
    );
  }
  const outputValue = inputValue - input.burnAmount;
  const outputLiability = inputLiability - input.burnAmount;
  const protectedSeed = inputValue - inputLiability;
  if (
    outputValue - outputLiability !== protectedSeed
    || outputValue < MIN_BOX_VALUE
  ) {
    throw new Error(
      'pooled-reserve V6 reserve successor would violate conservation or minimum value',
    );
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

function normalizeDupHistory(historyKeys: readonly string[]): string[] {
  if (!Array.isArray(historyKeys)) {
    throw new Error('pooled-reserve V6 replay history must be an array');
  }
  const normalized = historyKeys.map((key, index) => fixedHex(
    key,
    32,
    `pooled-reserve V6 replay history key ${index}`,
  ));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('pooled-reserve V6 replay history contains duplicate keys');
  }
  return normalized;
}

function assertDuplicatePreventionPredecessor(input: {
  duplicatePrevention: Eip12Box;
  compiled: Readonly<ValidityApplicationPooledReserveInstanceV6Candidate>;
  expectedDigestHex: string;
}): void {
  const expectedProfile = encodeCollByteRegister(Buffer.from(
    fixedHex(
      input.compiled.lineageProfileIdHex,
      32,
      'pooled-reserve profile ID',
    ),
    'hex',
  ));
  const actualDigest = decodeAvlTreeRegisterDigest(
    input.duplicatePrevention.additionalRegisters.R5,
    'pooled-reserve V6 duplicate-prevention R5',
  );
  if (
    input.duplicatePrevention.ergoTree !== fixedHex(
      input.compiled.contracts.duplicatePrevention.receipt.propositionHex,
      undefined,
      'pooled-reserve V6 duplicate-prevention proposition',
    )
    || input.duplicatePrevention.assets.length !== 1
    || input.duplicatePrevention.assets[0].tokenId !== fixedHex(
      input.compiled.genesis.duplicatePreventionNftIdHex,
      32,
      'pooled-reserve V6 duplicate-prevention NFT',
    )
    || input.duplicatePrevention.assets[0].amount !== '1'
    || Object.keys(input.duplicatePrevention.additionalRegisters).sort()
      .join(',') !== 'R4,R5'
    || input.duplicatePrevention.additionalRegisters.R4 !== expectedProfile
    || input.duplicatePrevention.additionalRegisters.R5
      !== encodeAvlTreeRegister(
      Buffer.from(actualDigest, 'hex'),
      DUP_AVL_FLAGS,
      DUP_VALUE_BYTES,
    )
    || actualDigest !== fixedHex(
      input.expectedDigestHex,
      33,
      'expected duplicate-prevention digest',
    )
  ) {
    throw new Error(
      'pooled-reserve V6 duplicate-prevention identity or history digest mismatch',
    );
  }
}

function assertPureFeeFunding(box: Eip12Box, fee: bigint): void {
  if (
    box.assets.length !== 0
    || Object.keys(box.additionalRegisters).length !== 0
    || BigInt(box.value) !== fee
  ) {
    throw new Error(
      'pooled-reserve V6 fee funding must be exact pure ERG with no registers',
    );
  }
}

function assertExactMaterializedSettlement(input: {
  transaction: MaterializedUnsignedTransaction;
  trackerDataInput: Eip12Box;
  reservePredecessor: Eip12Box;
  duplicatePreventionPredecessor: Eip12Box;
  feeFundingInput: Eip12Box;
  proofContextExtension:
    Readonly<Record<'0' | '1' | '2' | '3', string>>;
  reserve: ReturnType<typeof assertReservePredecessor>;
  dupOutputDigestHex: string;
  burnLeaf: TrustlessBurnLeaf;
  recipientErgoTreeHex: string;
  fee: bigint;
  creationHeight: number;
}): void {
  const tx = input.transaction;
  const topologyOk =
    tx.eip12Tx.inputs.length === 3
    && tx.eip12Tx.dataInputs.length === 1
    && tx.outputs.length === 4
    && tx.eip12Tx.inputs[0].boxId === input.reservePredecessor.boxId
    && tx.eip12Tx.inputs[1].boxId
      === input.duplicatePreventionPredecessor.boxId
    && tx.eip12Tx.inputs[2].boxId === input.feeFundingInput.boxId
    && tx.eip12Tx.dataInputs[0].boxId === input.trackerDataInput.boxId
    && Object.keys(tx.eip12Tx.inputs[0].extension).length === 0
    && exactRecord(
      tx.eip12Tx.inputs[1].extension,
      input.proofContextExtension,
    )
    && Object.keys(tx.eip12Tx.inputs[2].extension).length === 0;
  if (!topologyOk) {
    throw new Error('pooled-reserve V6 burn-settlement topology drifted');
  }
  const reserveOut = tx.outputs[0];
  const dupOut = tx.outputs[1];
  const payout = tx.outputs[2];
  const fee = tx.outputs[3];
  const outputChecks = [
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
    BigInt(dupOut.value)
      === BigInt(input.duplicatePreventionPredecessor.value),
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
    BigInt(payout.value) === BigInt(input.burnLeaf.amountNanoErg),
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
  if (outputChecks.some(passed => !passed)) {
    throw new Error('pooled-reserve V6 burn-settlement outputs drifted');
  }
}

function normalizeCreationHeight(
  creationHeight: number,
  currentErgoHeight: number,
): number {
  const normalized = positiveHeight(
    creationHeight,
    'pooled-reserve V6 successor creation height',
  );
  if (
    normalized > currentErgoHeight
    || normalized < currentErgoHeight - MAX_SUCCESSOR_CREATION_HEIGHT_LAG
  ) {
    throw new Error(
      'pooled-reserve V6 successor creation height is outside the reviewed window',
    );
  }
  return normalized;
}

function assertCreationHeightAfterInputs(
  creationHeight: number,
  inputs: readonly Eip12Box[],
): void {
  if (inputs.some(input => creationHeight < input.creationHeight)) {
    throw new Error(
      'pooled-reserve V6 successor creation height predates a protected input',
    );
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

function minerFee(value: string | number | bigint): bigint {
  const fee = positiveLong(value, 'pooled-reserve V6 miner fee');
  if (fee < MIN_BOX_VALUE || fee > MAX_MINER_FEE) {
    throw new Error(
      'pooled-reserve V6 miner fee is outside the reviewed bound',
    );
  }
  return fee;
}

function assertDistinctBoxIds(boxes: readonly Eip12Box[]): void {
  if (new Set(boxes.map(box => box.boxId)).size !== boxes.length) {
    throw new Error(
      'pooled-reserve V6 tracker and transaction boxes must be distinct',
    );
  }
}

function assertObservedBoxesNotFuture(
  boxes: readonly Eip12Box[],
  currentErgoHeight: number,
): void {
  if (boxes.some(box => box.creationHeight > currentErgoHeight)) {
    throw new Error(
      'pooled-reserve V6 observed input creation height is in the future',
    );
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

function unsignedInt32(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error(`${label} must be an unsigned 32-bit integer`);
  }
  return value;
}

function uint32Be(value: number, label: string): Buffer {
  const normalized = unsignedInt32(value, label);
  const encoded = Buffer.alloc(4);
  encoded.writeUInt32BE(normalized);
  return encoded;
}

function uint64Be(value: bigint): Buffer {
  const encoded = Buffer.alloc(8);
  encoded.writeBigUInt64BE(value);
  return encoded;
}

function fixedHexBytes(
  value: string,
  bytes: number,
  label: string,
): Buffer {
  return Buffer.from(fixedHex(value, bytes, label), 'hex');
}

function nonzeroFixedHex(
  value: unknown,
  bytes: number,
  label: string,
): string {
  const normalized = fixedHex(value, bytes, label);
  if (normalized === '00'.repeat(bytes)) {
    throw new Error(`${label} must not be zero`);
  }
  return normalized;
}

function fixedHex(
  value: unknown,
  bytes: number,
  label: string,
): string;
function fixedHex(
  value: unknown,
  bytes: undefined,
  label: string,
): string;
function fixedHex(
  value: unknown,
  bytes: number | undefined,
  label: string,
): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be canonical hex`);
  }
  const normalized = value.toLowerCase().replace(/^0x/, '');
  if (
    !/^[0-9a-f]+$/.test(normalized)
    || normalized.length % 2 !== 0
    || (bytes !== undefined && normalized.length !== bytes * 2)
  ) {
    throw new Error(`${label} must be canonical hex`);
  }
  return normalized;
}

function variableHex(value: unknown, label: string): string {
  return fixedHex(value, undefined, label);
}

function blake2b256Hex(value: Buffer): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function assertExactKeys(
  value: object,
  requiredKeys: readonly string[],
  label: string,
  optionalKeys: readonly string[] = [],
): void {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
  ) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const allowed = [...requiredKeys, ...optionalKeys].sort();
  const missing = requiredKeys.filter(
    key => !Object.prototype.hasOwnProperty.call(value, key),
  );
  if (
    missing.length !== 0
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
