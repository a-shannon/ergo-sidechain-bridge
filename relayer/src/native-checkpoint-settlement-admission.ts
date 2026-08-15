import blakejs from 'blakejs';

import type { CollectFrontierBurnProofForPegOutResult } from './frontier-burn-proof-source.js';
import {
  assertReviewedNativeCheckpointSettlementProfileProvenance,
  getReviewedNativeCheckpointSettlementProfileSha256Hex,
} from './native-checkpoint-settlement-source.js';
import {
  assertNativeCheckpointAggregateFinalityProofProvenance,
  assertNativeVerifiedBridgeCheckpointProvenance,
  type NativeVerifiedBridgeCheckpoint,
} from './native-finalized-bridge-checkpoint.js';
import type { AggregateFinalityProofV1 } from './bridge-finality-proof.js';
import { buildAggregateFinalityCommitmentV1 } from './bridge-finality-commitment.js';
import type { ParsedPegOut } from './sidechain-client.js';
import {
  decodeAuthenticatedSpvTrackerValue,
  deriveAuthenticatedSpvTrackerKey,
  type AuthenticatedSpvTrackerHistoryEntry,
  type AuthenticatedSpvTrackerIdentity,
} from './spv-tracker-authenticated.js';
import {
  deriveTrustlessBurnIdHex,
  validateTrustlessBurnInclusionProofEnvelope,
} from './trustless-burn-proof.js';
import {
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
  selectSubstrateGrandpaV1AssetProfile,
} from './profiles/substrate-grandpa-v1/asset-profile.js';

const NATIVE_ERG_ASSET_PROFILE = selectSubstrateGrandpaV1AssetProfile(
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
);
const ERGO_P2PK_TREE_PREFIX_HEX = '0008cd';
const BURN_PROOF_PATH_DOMAIN = Buffer.from(
  'E2S_TRUSTLESS_BURN_PROOF_PATH_V1',
  'ascii',
);
const NATIVE_SETTLEMENT_ADMISSION_BRAND: unique symbol = Symbol(
  'e2s.native-checkpoint-settlement-admission.verified',
);
const NATIVE_SETTLEMENT_ADMISSION_RESULTS = new WeakMap<object, string>();

export interface BindNativeCheckpointToAuthenticatedSettlementInput {
  checkpoint: NativeVerifiedBridgeCheckpoint;
  aggregateFinalityProof: AggregateFinalityProofV1;
  expectedSidechainIdHex: string;
  pegOut: ParsedPegOut;
  proofBundle: CollectFrontierBurnProofForPegOutResult;
  trackerIdentity: AuthenticatedSpvTrackerIdentity;
  trackerHistory: AuthenticatedSpvTrackerHistoryEntry[];
}

export interface NativeCheckpointSettlementAdmissionPayload {
  nativeCheckpointSettlementProfileSha256Hex: string;
  sidechainIdHex: string;
  sidechainHeight: string;
  nativeConsensusBlockHashHex: string;
  executionBlockHashHex: string;
  bridgeEventRootHex: string;
  burnLeafCount: number;
  burnIdHex: string;
  sidechainTxHashHex: string;
  eventIndex: number;
  leafIndex: number;
  leafHashHex: string;
  recipientErgoTreeHashHex: string;
  amountNanoErg: string;
  assetIdHex: string;
  proofPathDigestHex: string;
  trackerKeyHex: string;
  trackerValueHex: string;
  trackerAnchorHeaderIdHex: string;
  trackerAnchorHeaderHeight: number;
  checkpointCommitmentHex: string;
  nativeVerificationRequestDigestHex: string;
  trustAnchorDigestHex: string;
  finalityHorizonHashHex: string;
  finalityHorizonHeight: string;
  finalityStatementDigestHex: string;
  finalityProgramIdHex: string;
  finalityProofSystemId: number;
  finalityVerifierProfileIdHex: string;
  finalityProofPayloadDigestHex: string;
  finalityProofDigestHex: string;
  boundary: {
    sidechainFinalityVerified: true;
    trackerCommitmentMatched: true;
    ergoExtensionAnchorVerified: false;
    onChainAcceptanceVerified: false;
    transactionMutationEnabled: false;
    gate5Closed: false;
  };
}

export type NativeCheckpointSettlementAdmission =
  NativeCheckpointSettlementAdmissionPayload & {
    readonly [NATIVE_SETTLEMENT_ADMISSION_BRAND]: true;
  };

export function bindNativeCheckpointToAuthenticatedSettlement(
  input: BindNativeCheckpointToAuthenticatedSettlementInput,
): NativeCheckpointSettlementAdmission {
  assertNativeVerifiedBridgeCheckpointProvenance(input?.checkpoint);
  assertReviewedNativeCheckpointSettlementProfileProvenance(input.checkpoint);
  const nativeCheckpointSettlementProfileSha256Hex =
    getReviewedNativeCheckpointSettlementProfileSha256Hex(input.checkpoint);
  assertNativeCheckpointAggregateFinalityProofProvenance(
    input.aggregateFinalityProof,
    input.checkpoint,
  );
  const checkpoint = input.checkpoint.checkpointCommitment.checkpoint;
  const expectedSidechainIdHex = fixedHex(
    input.expectedSidechainIdHex,
    32,
    'configured sidechain ID',
  );
  if (checkpoint.sidechainIdHex !== expectedSidechainIdHex) {
    throw new Error('native checkpoint does not match the configured sidechain ID');
  }

  const trackerSidechainIdHex = fixedHex(
    input.trackerIdentity?.sidechainIdHex,
    32,
    'tracker sidechain ID',
  );
  if (trackerSidechainIdHex !== checkpoint.sidechainIdHex) {
    throw new Error('tracker sidechain ID does not match the native checkpoint');
  }
  const trackerHeight = uint64(input.trackerIdentity?.sidechainHeight, 'tracker height');
  if (trackerHeight !== BigInt(checkpoint.sidechainHeight)) {
    throw new Error('tracker height does not match the native checkpoint');
  }
  const trackerExecutionBlockHashHex = fixedHex(
    input.trackerIdentity?.executionBlockHashHex,
    32,
    'tracker execution block hash',
  );
  if (trackerExecutionBlockHashHex !== checkpoint.executionBlockHashHex) {
    throw new Error('tracker execution block hash does not match the native checkpoint');
  }

  const pegOutHeight = uint64(input.pegOut?.sidechainBlockNumber, 'peg-out height');
  if (pegOutHeight !== trackerHeight) {
    throw new Error('peg-out height does not match the native checkpoint');
  }
  const pegOutExecutionBlockHashHex = fixedHex(
    input.pegOut?.sidechainBlockHash,
    32,
    'peg-out execution block hash',
  );
  if (pegOutExecutionBlockHashHex !== checkpoint.executionBlockHashHex) {
    throw new Error('peg-out execution block hash does not match the native checkpoint');
  }

  const proof = input.proofBundle.proof;
  if (proof.leaf.sidechainIdHex !== checkpoint.sidechainIdHex) {
    throw new Error('burn proof sidechain ID does not match the native checkpoint');
  }
  if (proof.leaf.sidechainBlockHashHex !== checkpoint.executionBlockHashHex) {
    throw new Error('burn proof execution block hash does not match the native checkpoint');
  }
  if (proof.bridgeEventRootHex !== checkpoint.bridgeEventRootHex) {
    throw new Error('burn proof event root does not match the native checkpoint');
  }
  if (proof.leafCount !== checkpoint.burnLeafCount) {
    throw new Error('burn proof leaf count does not match the native checkpoint');
  }

  const burnTxHashHex = fixedHex(input.pegOut.sidechainTxHash, 32, 'peg-out transaction hash');
  if (proof.leaf.sidechainTxHashHex !== burnTxHashHex) {
    throw new Error('burn proof transaction hash does not match the peg-out');
  }
  const eventIndex = uint32(input.pegOut.sidechainLogIndex, 'peg-out log index');
  if (proof.leaf.eventIndex !== eventIndex) {
    throw new Error('burn proof event index does not match the peg-out');
  }
  const expectedBurnIdHex = deriveTrustlessBurnIdHex({
    sidechainIdHex: checkpoint.sidechainIdHex,
    sidechainTxHashHex: burnTxHashHex,
    eventIndex,
  });
  if (proof.leaf.burnIdHex !== expectedBurnIdHex) {
    throw new Error('burn proof burn ID does not match the peg-out event identity');
  }
  const pegOutAmount = positiveErgoLong(input.pegOut.amount, 'peg-out amount');
  if (BigInt(proof.leaf.amountNanoErg) !== pegOutAmount) {
    throw new Error('burn proof amount does not match the peg-out');
  }
  const recipientTreeHex = canonicalRecipientTree(input.pegOut.ergoRecipientAddress);
  const recipientHashHex = Buffer.from(
    blakejs.blake2b(Buffer.from(recipientTreeHex, 'hex'), undefined, 32),
  ).toString('hex');
  if (proof.leaf.recipientErgoTreeHashHex !== recipientHashHex) {
    throw new Error('burn proof recipient does not match the peg-out');
  }
  if (proof.leaf.assetIdHex !== NATIVE_ERG_ASSET_PROFILE.assetIdHex) {
    throw new Error('burn proof asset does not match the supported ERG lane');
  }

  const settlementIdentity = input.proofBundle.settlementIdentity;
  if (
    settlementIdentity.source !== 'trustless-burn-leaf'
    || settlementIdentity.duplicatePreventionKeyHex !== proof.leaf.burnIdHex
    || settlementIdentity.bridgeEventRootHex !== proof.bridgeEventRootHex
    || settlementIdentity.recipientErgoTreeHashHex !== proof.leaf.recipientErgoTreeHashHex
    || BigInt(settlementIdentity.amountNanoErg ?? -1) !== BigInt(proof.leaf.amountNanoErg)
    || (settlementIdentity.assetIdHex ?? NATIVE_ERG_ASSET_PROFILE.assetIdHex)
      !== proof.leaf.assetIdHex
  ) {
    throw new Error('settlement identity does not match the canonical burn proof');
  }
  const envelope = validateTrustlessBurnInclusionProofEnvelope(proof);
  if (!envelope.ok) {
    throw new Error(`burn proof envelope is invalid: ${envelope.errors.join('; ')}`);
  }

  const trackerKeyHex = deriveAuthenticatedSpvTrackerKey({
    sidechainIdHex: trackerSidechainIdHex,
    sidechainHeight: trackerHeight,
    executionBlockHashHex: trackerExecutionBlockHashHex,
  });
  const matchingTrackerEntries = input.trackerHistory.filter(entry =>
    fixedHex(entry.key, 32, 'tracker history key') === trackerKeyHex
  );
  if (matchingTrackerEntries.length !== 1) {
    throw new Error('authenticated tracker history must contain exactly one matching checkpoint');
  }
  const trackerValue = decodeAuthenticatedSpvTrackerValue(matchingTrackerEntries[0].value);
  if (trackerValue.bridgeEventRootHex !== checkpoint.bridgeEventRootHex) {
    throw new Error('tracker event root does not match the native checkpoint');
  }
  if (
    trackerValue.checkpointCommitmentHex
    !== input.checkpoint.checkpointCommitment.checkpointCommitmentHex
  ) {
    throw new Error('tracker checkpoint commitment does not match the native checkpoint');
  }

  const nativeVerificationRequestDigestHex = fixedHex(
    input.checkpoint.nativeVerification.requestDigestHex,
    32,
    'native verification request digest',
  );
  const trustAnchorDigestHex = fixedHex(
    input.checkpoint.nativeVerification.trustAnchorDigestHex,
    32,
    'native trust anchor digest',
  );
  const finalityHorizonHashHex = fixedHex(
    input.checkpoint.nativeVerification.finality.horizonHashHex,
    32,
    'native finality horizon hash',
  );
  const finalityHorizonHeight = uint64(
    input.checkpoint.nativeVerification.finality.horizonHeight,
    'native finality horizon height',
  ).toString();
  const finalityStatement = input.checkpoint.finalityStatement;
  const aggregateFinalityProof = input.aggregateFinalityProof;
  const finalityCommitment = buildAggregateFinalityCommitmentV1(aggregateFinalityProof);
  if (
    finalityStatement.checkpointCommitmentHex
      !== input.checkpoint.checkpointCommitment.checkpointCommitmentHex
    || finalityStatement.trustedAnchorDigestHex !== trustAnchorDigestHex
    || finalityStatement.finalityHorizonHashHex !== finalityHorizonHashHex
    || finalityStatement.finalityHorizonHeight !== finalityHorizonHeight
  ) {
    throw new Error('canonical finality statement does not match the verified native checkpoint');
  }
  if (
    aggregateFinalityProof.statementDigestHex !== finalityStatement.statementDigestHex
    || aggregateFinalityProof.statement.encodedStatementHex
      !== finalityStatement.encodedStatementHex
  ) {
    throw new Error('aggregate finality proof does not match the canonical finality statement');
  }
  if (
    trackerValue.finalityProofSystemId !== finalityCommitment.proofSystemId
    || trackerValue.finalityStatementDigestHex !== finalityCommitment.statementDigestHex
    || trackerValue.finalityProgramIdHex !== finalityCommitment.statement.programIdHex
    || trackerValue.finalityVerifierProfileIdHex !== finalityCommitment.verifierProfileIdHex
    || trackerValue.finalityProofPayloadDigestHex !== finalityCommitment.payloadDigestHex
    || trackerValue.finalityProofDigestHex !== finalityCommitment.proofDigestHex
  ) {
    throw new Error('tracker finality proof identity does not match the verified native proof');
  }

  const admission = {
    nativeCheckpointSettlementProfileSha256Hex,
    sidechainIdHex: checkpoint.sidechainIdHex,
    sidechainHeight: checkpoint.sidechainHeight,
    nativeConsensusBlockHashHex: checkpoint.sidechainConsensusBlockHashHex,
    executionBlockHashHex: checkpoint.executionBlockHashHex,
    bridgeEventRootHex: checkpoint.bridgeEventRootHex,
    burnLeafCount: checkpoint.burnLeafCount,
    burnIdHex: proof.leaf.burnIdHex,
    sidechainTxHashHex: proof.leaf.sidechainTxHashHex,
    eventIndex: proof.leaf.eventIndex,
    leafIndex: proof.leafIndex,
    leafHashHex: proof.leaf.leafHashHex,
    recipientErgoTreeHashHex: proof.leaf.recipientErgoTreeHashHex,
    amountNanoErg: proof.leaf.amountNanoErg,
    assetIdHex: proof.leaf.assetIdHex,
    proofPathDigestHex: deriveTrustlessBurnProofPathDigestHex({
      leafIndex: proof.leafIndex,
      leafCount: proof.leafCount,
      proof: proof.proof,
    }),
    trackerKeyHex,
    trackerValueHex: variableHex(
      matchingTrackerEntries[0].value,
      'tracker history value',
    ),
    trackerAnchorHeaderIdHex: trackerValue.anchorHeaderIdHex,
    trackerAnchorHeaderHeight: trackerValue.anchorHeaderHeight,
    checkpointCommitmentHex:
      input.checkpoint.checkpointCommitment.checkpointCommitmentHex,
    nativeVerificationRequestDigestHex,
    trustAnchorDigestHex,
    finalityHorizonHashHex,
    finalityHorizonHeight,
    finalityStatementDigestHex: fixedHex(
      finalityCommitment.statementDigestHex,
      32,
      'finality statement digest',
    ),
    finalityProgramIdHex: fixedHex(
      finalityCommitment.statement.programIdHex,
      32,
      'finality program ID',
    ),
    finalityProofSystemId: finalityCommitment.proofSystemId,
    finalityVerifierProfileIdHex: fixedHex(
      finalityCommitment.verifierProfileIdHex,
      32,
      'finality verifier profile ID',
    ),
    finalityProofPayloadDigestHex: fixedHex(
      finalityCommitment.payloadDigestHex,
      32,
      'finality proof payload digest',
    ),
    finalityProofDigestHex: fixedHex(
      finalityCommitment.proofDigestHex,
      32,
      'aggregate finality proof digest',
    ),
    boundary: {
      sidechainFinalityVerified: true,
      trackerCommitmentMatched: true,
      ergoExtensionAnchorVerified: false,
      onChainAcceptanceVerified: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
    },
  } as unknown as NativeCheckpointSettlementAdmission;
  Object.freeze(admission.boundary);
  Object.freeze(admission);
  NATIVE_SETTLEMENT_ADMISSION_RESULTS.set(
    admission,
    nativeCheckpointSettlementProfileSha256Hex,
  );
  return admission;
}

export function getNativeCheckpointSettlementAdmissionProfileSha256Hex(
  admission: NativeCheckpointSettlementAdmission,
): string {
  assertNativeCheckpointSettlementAdmissionProvenance(admission);
  const profileSha256Hex = NATIVE_SETTLEMENT_ADMISSION_RESULTS.get(admission)!;
  if (
    normalizeProfileSha256Hex(
      admission.nativeCheckpointSettlementProfileSha256Hex,
      'native checkpoint settlement admission profile digest',
    ) !== profileSha256Hex
  ) {
    throw new Error(
      'native checkpoint settlement admission profile digest drifted from its provenance',
    );
  }
  return profileSha256Hex;
}

export function deriveTrustlessBurnProofPathDigestHex(input: {
  leafIndex: number;
  leafCount: number;
  proof: Array<{ side: 'left' | 'right'; hashHex: string }>;
}): string {
  const leafIndex = uint32(input?.leafIndex, 'burn proof leaf index');
  const leafCount = uint32(input?.leafCount, 'burn proof leaf count');
  if (leafCount < 1 || leafIndex >= leafCount) {
    throw new Error('burn proof leaf index must be within the leaf count');
  }
  if (!Array.isArray(input?.proof)) {
    throw new Error('burn proof path must be an array');
  }
  const encodedIndex = Buffer.alloc(4);
  encodedIndex.writeUInt32BE(leafIndex);
  const encodedCount = Buffer.alloc(4);
  encodedCount.writeUInt32BE(leafCount);
  const encodedSteps = input.proof.map((step, index) => {
    if (step?.side !== 'left' && step?.side !== 'right') {
      throw new Error(`burn proof path step ${index} side is invalid`);
    }
    return Buffer.concat([
      Buffer.from([step.side === 'left' ? 0 : 1]),
      Buffer.from(fixedHex(step.hashHex, 32, `burn proof path step ${index} hash`), 'hex'),
    ]);
  });
  return Buffer.from(blakejs.blake2b(Buffer.concat([
    BURN_PROOF_PATH_DOMAIN,
    encodedIndex,
    encodedCount,
    ...encodedSteps,
  ]), undefined, 32)).toString('hex');
}

export function assertNativeCheckpointSettlementAdmissionProvenance(
  admission: unknown,
): asserts admission is NativeCheckpointSettlementAdmission {
  if (
    typeof admission !== 'object'
    || admission === null
    || !NATIVE_SETTLEMENT_ADMISSION_RESULTS.has(admission)
  ) {
    throw new Error('native checkpoint settlement admission provenance is missing');
  }
}

function canonicalRecipientTree(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('peg-out recipient must be hex');
  }
  const normalized = value.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized)) {
    throw new Error('peg-out recipient must be hex');
  }
  if (normalized.length === 66 && /^(02|03)/.test(normalized)) {
    return `${ERGO_P2PK_TREE_PREFIX_HEX}${normalized}`;
  }
  if (normalized.length === 72 && /^(0008cd02|0008cd03)/.test(normalized)) {
    return normalized;
  }
  throw new Error('peg-out recipient must be a compressed key or canonical P2PK ErgoTree');
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  const normalized = value.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length !== bytes * 2) {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  return normalized;
}

function normalizeProfileSha256Hex(value: unknown, label: string): string {
  return `0x${fixedHex(value, 32, label)}`;
}

function variableHex(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  const normalized = value.replace(/^0x/, '').toLowerCase();
  if (
    normalized.length === 0
    || normalized.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  return normalized;
}

function uint64(value: unknown, label: string): bigint {
  let parsed: bigint;
  if (typeof value === 'bigint') {
    parsed = value;
  } else if (typeof value === 'number' && Number.isSafeInteger(value)) {
    parsed = BigInt(value);
  } else if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) {
    parsed = BigInt(value);
  } else {
    throw new Error(`${label} must be an unsigned integer`);
  }
  if (parsed < 0n || parsed > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} must fit uint64`);
  }
  return parsed;
}

function positiveErgoLong(value: unknown, label: string): bigint {
  const parsed = uint64(value, label);
  if (parsed === 0n || parsed > 0x7fff_ffff_ffff_ffffn) {
    throw new Error(`${label} must fit the positive Ergo Long range`);
  }
  return parsed;
}

function uint32(value: unknown, label: string): number {
  const parsed = uint64(value, label);
  if (parsed > 0xffff_ffffn) {
    throw new Error(`${label} must fit uint32`);
  }
  return Number(parsed);
}
