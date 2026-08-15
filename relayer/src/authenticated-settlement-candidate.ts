import { createHash } from 'crypto';
import blakejs from 'blakejs';

import {
  assertPreparedAuthenticatedSettlementUnsignedTxProvenance,
  type PreparedAuthenticatedSettlementUnsignedTx,
} from './aggregate-settlement-service.js';
import {
  assertNativeCheckpointSettlementAdmissionProvenance,
  deriveTrustlessBurnProofPathDigestHex,
  type NativeCheckpointSettlementAdmission,
} from './native-checkpoint-settlement-admission.js';
import {
  AUTHENTICATED_SETTLEMENT_CANDIDATE_SCHEMA_VERSION,
} from './authenticated-settlement-candidate-schema.js';
import type { ParsedPegOut } from './sidechain-client.js';
import {
  decodeAuthenticatedSpvTrackerValue,
  type AuthenticatedSpvTrackerIdentity,
} from './spv-tracker-authenticated.js';
import type {
  AuthenticatedSettlementCandidate,
  AuthenticatedSettlementCandidateInput,
  StateTracker,
} from './state-tracker.js';
import { deriveTrustlessBurnIdHex } from './trustless-burn-proof.js';
import {
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE,
} from './profiles/substrate-grandpa-v1/asset-profile.js';

const ERGO_P2PK_TREE_PREFIX_HEX = '0008cd';
const NATIVE_VERIFIED_SETTLEMENT_CANDIDATES = new WeakSet<object>();

export interface BuildAuthenticatedSettlementCandidateInput {
  prepared: PreparedAuthenticatedSettlementUnsignedTx;
  pegOut: ParsedPegOut;
  trackerIdentity: AuthenticatedSpvTrackerIdentity;
  observedSidechainTip: number | bigint;
  observedErgoTip: number;
}

export interface RecordNativeVerifiedAuthenticatedSettlementCandidateInput
  extends NativeVerifiedAuthenticatedSettlementCandidateBindingInput {
  state: Pick<StateTracker, 'recordAuthenticatedSettlementCandidate'>;
}

export interface NativeVerifiedAuthenticatedSettlementCandidateBindingInput
  extends BuildAuthenticatedSettlementCandidateInput {
  nativeAdmission: NativeCheckpointSettlementAdmission;
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('candidate binding cannot contain non-finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  throw new Error(`candidate binding cannot serialize ${typeof value}`);
}

function sha256Hex(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

export function buildAuthenticatedSettlementCandidate(
  input: BuildAuthenticatedSettlementCandidateInput,
): AuthenticatedSettlementCandidateInput {
  const { pegOut, prepared, trackerIdentity } = input;
  if (!pegOut.sidechainBlockHash) {
    throw new Error('authenticated settlement candidate requires the canonical sidechain block hash');
  }
  if (pegOut.sidechainLogIndex === undefined) {
    throw new Error('authenticated settlement candidate requires the sidechain log index');
  }
  if (
    BigInt(pegOut.sidechainBlockNumber) !== BigInt(trackerIdentity.sidechainHeight)
    || pegOut.sidechainBlockHash.replace(/^0x/, '').toLowerCase()
      !== trackerIdentity.executionBlockHashHex.replace(/^0x/, '').toLowerCase()
  ) {
    throw new Error('authenticated settlement candidate burn coordinates do not match tracker identity');
  }
  if (BigInt(input.observedSidechainTip) < BigInt(pegOut.sidechainBlockNumber)) {
    throw new Error('observed sidechain tip precedes the candidate burn block');
  }
  if (!Array.isArray(prepared.plan.claims) || prepared.plan.claims.length !== 1) {
    throw new Error('authenticated settlement candidate requires exactly one claim');
  }
  const creationHeights = prepared.eip12Tx.outputs.map((output: any) => output.creationHeight);
  if (
    creationHeights.length === 0
    || !creationHeights.every(
      height => Number.isSafeInteger(height) && height > 0 && height === creationHeights[0],
    )
  ) {
    throw new Error('authenticated settlement candidate requires one explicit output creation height');
  }

  const claim = prepared.plan.claims[0];
  const burnId = deriveTrustlessBurnIdHex({
    sidechainIdHex: trackerIdentity.sidechainIdHex,
    sidechainTxHashHex: pegOut.sidechainTxHash,
    eventIndex: pegOut.sidechainLogIndex,
  });
  if (claim.duplicatePreventionKeyHex !== burnId) {
    throw new Error('authenticated settlement candidate DUP key does not match the derived burnId');
  }
  const unsignedTxDigest = sha256Hex(prepared.eip12Tx);
  const binding = {
    schemaVersion: AUTHENTICATED_SETTLEMENT_CANDIDATE_SCHEMA_VERSION,
    burnId,
    burnTxHash: pegOut.sidechainTxHash,
    sidechainId: trackerIdentity.sidechainIdHex,
    sidechainHeight: BigInt(trackerIdentity.sidechainHeight),
    sidechainBlockHash: pegOut.sidechainBlockHash,
    sidechainLogIndex: pegOut.sidechainLogIndex,
    trackerKey: claim.trackerKeyHex,
    trackerValue: claim.trackerValueHex,
    trackerBoxId: prepared.trackerBox.boxId,
    anchorHeaderId: claim.trackerAnchorHeaderIdHex,
    anchorHeaderHeight: claim.ergoAnchorHeight,
    dupInputBoxId: prepared.authenticatedDupBox.boxId,
    dupInputDigest: prepared.plan.dupInputDigestHex,
    vaultBoxId: prepared.unlockBox.boxId,
    unsignedTxDigest,
    creationHeight: creationHeights[0],
    observedSidechainTip: BigInt(input.observedSidechainTip),
    observedErgoTip: input.observedErgoTip,
  };
  return {
    candidateId: sha256Hex(binding),
    ...binding,
  };
}

export function recordNativeVerifiedAuthenticatedSettlementCandidate(
  input: RecordNativeVerifiedAuthenticatedSettlementCandidateInput,
): AuthenticatedSettlementCandidate {
  return input.state.recordAuthenticatedSettlementCandidate(
    authorizeNativeVerifiedAuthenticatedSettlementCandidate(input),
  );
}

export function authorizeNativeVerifiedAuthenticatedSettlementCandidate(
  input: NativeVerifiedAuthenticatedSettlementCandidateBindingInput,
): AuthenticatedSettlementCandidateInput {
  assertNativeCheckpointSettlementAdmissionProvenance(input?.nativeAdmission);
  assertPreparedAuthenticatedSettlementUnsignedTxProvenance(input?.prepared);
  assertNativeCheckpointSettlementCandidateBindings(input);
  const candidate = buildAuthenticatedSettlementCandidate(input);
  const claim = input.prepared.plan.claims[0];
  const trackerValue = decodeAuthenticatedSpvTrackerValue(claim.trackerValueHex);
  const nativeAdmission = input.nativeAdmission;
  if (
    nativeAdmission.sidechainIdHex
      !== input.trackerIdentity.sidechainIdHex.replace(/^0x/, '').toLowerCase()
    || BigInt(nativeAdmission.sidechainHeight)
      !== BigInt(input.trackerIdentity.sidechainHeight)
    || nativeAdmission.executionBlockHashHex
      !== input.trackerIdentity.executionBlockHashHex.replace(/^0x/, '').toLowerCase()
  ) {
    throw new Error('native checkpoint settlement admission does not match tracker identity');
  }
  if (
    nativeAdmission.bridgeEventRootHex !== trackerValue.bridgeEventRootHex
    || nativeAdmission.checkpointCommitmentHex
      !== trackerValue.checkpointCommitmentHex
    || nativeAdmission.finalityProofSystemId !== trackerValue.finalityProofSystemId
    || nativeAdmission.finalityStatementDigestHex
      !== trackerValue.finalityStatementDigestHex
    || nativeAdmission.finalityProgramIdHex !== trackerValue.finalityProgramIdHex
    || nativeAdmission.finalityVerifierProfileIdHex
      !== trackerValue.finalityVerifierProfileIdHex
    || nativeAdmission.finalityProofPayloadDigestHex
      !== trackerValue.finalityProofPayloadDigestHex
    || nativeAdmission.finalityProofDigestHex !== trackerValue.finalityProofDigestHex
    || nativeAdmission.bridgeEventRootHex !== claim.bridgeEventRootHex
    || nativeAdmission.checkpointCommitmentHex
      !== claim.trackerCheckpointCommitmentHex
  ) {
    throw new Error('native checkpoint settlement admission does not match prepared tracker value');
  }

  const candidateId = deriveNativeVerifiedAuthenticatedSettlementCandidateId(
    candidate,
    nativeAdmission,
  );
  const verifiedCandidate = Object.freeze({
    ...candidate,
    candidateId,
  });
  NATIVE_VERIFIED_SETTLEMENT_CANDIDATES.add(verifiedCandidate);
  return verifiedCandidate;
}

export function deriveNativeVerifiedAuthenticatedSettlementCandidateId(
  candidate: AuthenticatedSettlementCandidateInput,
  nativeAdmission: NativeCheckpointSettlementAdmission,
): string {
  return sha256Hex({
    schemaVersion: candidate.schemaVersion,
    candidateId: candidate.candidateId,
    nativeCheckpoint: {
      sidechainIdHex: nativeAdmission.sidechainIdHex,
      sidechainHeight: nativeAdmission.sidechainHeight,
      nativeConsensusBlockHashHex: nativeAdmission.nativeConsensusBlockHashHex,
      executionBlockHashHex: nativeAdmission.executionBlockHashHex,
      bridgeEventRootHex: nativeAdmission.bridgeEventRootHex,
      burnLeafCount: nativeAdmission.burnLeafCount,
      burnIdHex: nativeAdmission.burnIdHex,
      sidechainTxHashHex: nativeAdmission.sidechainTxHashHex,
      eventIndex: nativeAdmission.eventIndex,
      leafIndex: nativeAdmission.leafIndex,
      leafHashHex: nativeAdmission.leafHashHex,
      recipientErgoTreeHashHex: nativeAdmission.recipientErgoTreeHashHex,
      amountNanoErg: nativeAdmission.amountNanoErg,
      assetIdHex: nativeAdmission.assetIdHex,
      proofPathDigestHex: nativeAdmission.proofPathDigestHex,
      trackerKeyHex: nativeAdmission.trackerKeyHex,
      trackerValueHex: nativeAdmission.trackerValueHex,
      trackerAnchorHeaderIdHex: nativeAdmission.trackerAnchorHeaderIdHex,
      trackerAnchorHeaderHeight: nativeAdmission.trackerAnchorHeaderHeight,
      checkpointCommitmentHex: nativeAdmission.checkpointCommitmentHex,
      nativeVerificationRequestDigestHex:
        nativeAdmission.nativeVerificationRequestDigestHex,
      trustAnchorDigestHex: nativeAdmission.trustAnchorDigestHex,
      finalityHorizonHashHex: nativeAdmission.finalityHorizonHashHex,
      finalityHorizonHeight: nativeAdmission.finalityHorizonHeight,
      finalityStatementDigestHex: nativeAdmission.finalityStatementDigestHex,
      finalityProgramIdHex: nativeAdmission.finalityProgramIdHex,
      finalityProofSystemId: nativeAdmission.finalityProofSystemId,
      finalityVerifierProfileIdHex: nativeAdmission.finalityVerifierProfileIdHex,
      finalityProofPayloadDigestHex: nativeAdmission.finalityProofPayloadDigestHex,
      finalityProofDigestHex: nativeAdmission.finalityProofDigestHex,
    },
  });
}

export function assertNativeVerifiedAuthenticatedSettlementCandidateProvenance(
  candidate: unknown,
): asserts candidate is AuthenticatedSettlementCandidateInput {
  if (
    typeof candidate !== 'object'
    || candidate === null
    || !NATIVE_VERIFIED_SETTLEMENT_CANDIDATES.has(candidate)
  ) {
    throw new Error('native-verified authenticated settlement candidate provenance is missing');
  }
}

export function assertNativeCheckpointSettlementCandidateBindings(
  input: NativeVerifiedAuthenticatedSettlementCandidateBindingInput,
): void {
  const { nativeAdmission, pegOut, prepared, trackerIdentity } = input;
  if (!Array.isArray(prepared?.plan?.claims) || prepared.plan.claims.length !== 1) {
    throw new Error('authenticated settlement candidate requires exactly one claim');
  }
  if (prepared.plan.contractCompatibility !== 'authenticated-v2') {
    throw new Error('prepared settlement plan must use authenticated-v2 compatibility');
  }
  const claim = prepared.plan.claims[0];
  const pegOutTxHashHex = fixedHex(pegOut.sidechainTxHash, 32, 'peg-out transaction hash');
  const pegOutBlockHashHex = fixedHex(
    pegOut.sidechainBlockHash,
    32,
    'peg-out execution block hash',
  );
  const pegOutEventIndex = uint32(pegOut.sidechainLogIndex, 'peg-out event index');
  const pegOutAmount = uint64(pegOut.amount, 'peg-out amount');
  const recipientErgoTreeHex = canonicalRecipientTree(prepared.recipientErgoTreeHex);
  const recipientHashHex = Buffer.from(
    blakejs.blake2b(Buffer.from(recipientErgoTreeHex, 'hex'), undefined, 32),
  ).toString('hex');

  if (
    nativeAdmission.sidechainIdHex !== fixedHex(trackerIdentity.sidechainIdHex, 32, 'tracker sidechain ID')
    || BigInt(nativeAdmission.sidechainHeight) !== uint64(trackerIdentity.sidechainHeight, 'tracker height')
    || nativeAdmission.executionBlockHashHex
      !== fixedHex(trackerIdentity.executionBlockHashHex, 32, 'tracker execution block hash')
    || nativeAdmission.sidechainHeight !== uint64(pegOut.sidechainBlockNumber, 'peg-out height').toString()
    || nativeAdmission.executionBlockHashHex !== pegOutBlockHashHex
    || nativeAdmission.sidechainTxHashHex !== pegOutTxHashHex
    || nativeAdmission.eventIndex !== pegOutEventIndex
    || nativeAdmission.amountNanoErg !== pegOutAmount.toString()
    || nativeAdmission.recipientErgoTreeHashHex !== recipientHashHex
    || nativeAdmission.assetIdHex
      !== SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE.assetIdHex
  ) {
    throw new Error('native checkpoint settlement admission does not match the prepared peg-out target');
  }
  if (canonicalRecipientTree(pegOut.ergoRecipientAddress) !== recipientErgoTreeHex) {
    throw new Error('prepared payout recipient does not match the peg-out recipient');
  }

  const nestedPegOut = claim.claim.pegOut;
  const nestedTracker = claim.claim.trackerIdentity;
  if (
    fixedHex(nestedPegOut.sidechainTxHash, 32, 'prepared peg-out transaction hash')
      !== nativeAdmission.sidechainTxHashHex
    || uint64(nestedPegOut.sidechainBlockNumber, 'prepared peg-out height').toString()
      !== nativeAdmission.sidechainHeight
    || uint32(nestedPegOut.sidechainLogIndex, 'prepared peg-out event index')
      !== nativeAdmission.eventIndex
    || uint64(nestedPegOut.amount, 'prepared peg-out amount').toString()
      !== nativeAdmission.amountNanoErg
    || canonicalRecipientTree(nestedPegOut.ergoRecipientAddress) !== recipientErgoTreeHex
    || fixedHex(nestedTracker.sidechainIdHex, 32, 'prepared tracker sidechain ID')
      !== nativeAdmission.sidechainIdHex
    || uint64(nestedTracker.sidechainHeight, 'prepared tracker height').toString()
      !== nativeAdmission.sidechainHeight
    || fixedHex(nestedTracker.sidechainHeaderHashHex, 32, 'prepared tracker execution block hash')
      !== nativeAdmission.executionBlockHashHex
  ) {
    throw new Error('prepared claim coordinates do not match the native checkpoint admission');
  }

  assertSettlementIdentityMatchesAdmission(
    claim.settlementIdentity,
    nativeAdmission,
    'prepared settlement identity',
  );
  assertSettlementIdentityMatchesAdmission(
    claim.claim.settlementIdentity,
    nativeAdmission,
    'prepared nested settlement identity',
  );
  if (
    fixedHex(claim.burnTxIdHex, 32, 'prepared burn transaction ID')
      !== nativeAdmission.burnIdHex
    || fixedHex(claim.duplicatePreventionKeyHex, 32, 'prepared DUP key')
      !== nativeAdmission.burnIdHex
    || fixedHex(claim.bridgeEventRootHex, 32, 'prepared bridge event root')
      !== nativeAdmission.bridgeEventRootHex
    || fixedHex(claim.trackerKeyHex, 32, 'prepared tracker key')
      !== nativeAdmission.trackerKeyHex
    || variableHex(claim.trackerValueHex, 'prepared tracker value')
      !== nativeAdmission.trackerValueHex
    || fixedHex(claim.trackerCheckpointCommitmentHex, 32, 'prepared tracker commitment')
      !== nativeAdmission.checkpointCommitmentHex
    || fixedHex(claim.trackerAnchorHeaderIdHex, 32, 'prepared tracker anchor header ID')
      !== nativeAdmission.trackerAnchorHeaderIdHex
    || claim.ergoAnchorHeight !== nativeAdmission.trackerAnchorHeaderHeight
  ) {
    throw new Error('native checkpoint settlement admission does not match prepared tracker value');
  }

  const contextGuard = prepared.contextExtensionGuard;
  if (
    contextGuard?.status !== 'pass'
    || contextGuard.signingPermitted !== false
    || contextGuard.broadcastPermitted !== false
  ) {
    throw new Error('prepared settlement context-extension guard must pass with signing and broadcast disabled');
  }

  const dupBoxId = fixedHex(prepared.authenticatedDupBox.boxId, 32, 'prepared DUP input box ID');
  const vaultBoxId = fixedHex(prepared.unlockBox.boxId, 32, 'prepared vault input box ID');
  const trackerBoxId = fixedHex(prepared.trackerBox.boxId, 32, 'prepared tracker data-input box ID');
  if (
    prepared.unsignedTx.inputs.length !== 2
    || prepared.eip12Tx.inputs.length !== 2
    || prepared.unsignedTx.dataInputs.length !== 1
    || prepared.eip12Tx.dataInputs.length !== 1
  ) {
    throw new Error('prepared settlement must contain exactly two inputs and one tracker data input');
  }
  const expectedInputIds = [dupBoxId, vaultBoxId];
  for (let index = 0; index < expectedInputIds.length; index += 1) {
    const unsignedInput = prepared.unsignedTx.inputs[index];
    const eip12Input = prepared.eip12Tx.inputs[index];
    if (
      fixedHex(unsignedInput.boxId, 32, `unsigned input ${index} box ID`) !== expectedInputIds[index]
      || fixedHex(eip12Input.boxId, 32, `EIP-12 input ${index} box ID`) !== expectedInputIds[index]
      || canonicalJson(unsignedInput.extension) !== canonicalJson(eip12Input.extension)
    ) {
      throw new Error('prepared settlement input ordering or context extensions do not match selected boxes');
    }
  }
  if (
    fixedHex(prepared.unsignedTx.dataInputs[0]?.boxId, 32, 'unsigned tracker data-input box ID')
      !== trackerBoxId
    || fixedHex(prepared.eip12Tx.dataInputs[0]?.boxId, 32, 'EIP-12 tracker data-input box ID')
      !== trackerBoxId
  ) {
    throw new Error('prepared settlement tracker data-input does not match the selected tracker box');
  }

  const payout = prepared.eip12Tx.outputs[1];
  if (!payout || canonicalRecipientTree(payout.ergoTree) !== recipientErgoTreeHex) {
    throw new Error('prepared settlement payout recipient does not match the admitted burn');
  }
  if (uint64(payout.value, 'prepared settlement payout amount') !== pegOutAmount) {
    throw new Error('prepared settlement payout amount does not match the admitted burn');
  }
  if (!Array.isArray(payout.assets) || payout.assets.length !== 0) {
    throw new Error('prepared settlement payout asset does not match the admitted ERG lane');
  }
  const payoutRecipientCount = prepared.eip12Tx.outputs.filter(output =>
    typeof output?.ergoTree === 'string'
    && output.ergoTree.replace(/^0x/, '').toLowerCase() === recipientErgoTreeHex
  ).length;
  if (payoutRecipientCount !== 1) {
    throw new Error('prepared settlement must contain exactly one payout recipient output');
  }
  if (canonicalJson(prepared.eip12Tx.outputs) !== canonicalJson(prepared.unsignedTx.outputs)) {
    throw new Error('prepared EIP-12 outputs do not match the unsigned transaction outputs');
  }
}

function assertSettlementIdentityMatchesAdmission(
  identity: unknown,
  admission: NativeCheckpointSettlementAdmission,
  label: string,
): void {
  if (!identity || typeof identity !== 'object') {
    throw new Error(`${label} is missing`);
  }
  const value = identity as {
    source?: unknown;
    duplicatePreventionKeyHex?: unknown;
    bridgeEventRootHex?: unknown;
    recipientErgoTreeHashHex?: unknown;
    amountNanoErg?: unknown;
    assetIdHex?: unknown;
    trustlessBurnProof?: unknown;
  };
  const proof = Array.isArray(value.trustlessBurnProof)
    ? value.trustlessBurnProof as Array<{ side: 'left' | 'right'; hashHex: string }>
    : [];
  if (
    value.source !== 'trustless-burn-leaf'
    || fixedHex(value.duplicatePreventionKeyHex, 32, `${label} DUP key`)
      !== admission.burnIdHex
    || fixedHex(value.bridgeEventRootHex, 32, `${label} event root`)
      !== admission.bridgeEventRootHex
    || fixedHex(value.recipientErgoTreeHashHex, 32, `${label} recipient hash`)
      !== admission.recipientErgoTreeHashHex
    || uint64(value.amountNanoErg, `${label} amount`).toString()
      !== admission.amountNanoErg
    || fixedHex(
      value.assetIdHex ?? SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE.assetIdHex,
      32,
      `${label} asset ID`,
    )
      !== admission.assetIdHex
    || deriveTrustlessBurnProofPathDigestHex({
      leafIndex: admission.leafIndex,
      leafCount: admission.burnLeafCount,
      proof,
    }) !== admission.proofPathDigestHex
  ) {
    throw new Error(`${label} does not match the native checkpoint admission`);
  }
}

function canonicalRecipientTree(value: unknown): string {
  if (typeof value !== 'string') throw new Error('payout recipient must be hex');
  const normalized = value.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized)) throw new Error('payout recipient must be hex');
  if (normalized.length === 66 && /^(02|03)/.test(normalized)) {
    return `${ERGO_P2PK_TREE_PREFIX_HEX}${normalized}`;
  }
  if (normalized.length === 72 && /^(0008cd02|0008cd03)/.test(normalized)) {
    return normalized;
  }
  throw new Error('payout recipient must be a compressed key or canonical P2PK ErgoTree');
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be ${bytes} bytes of hex`);
  const normalized = value.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length !== bytes * 2) {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  return normalized;
}

function variableHex(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be non-empty even-length hex`);
  const normalized = value.replace(/^0x/, '').toLowerCase();
  if (normalized.length === 0 || normalized.length % 2 !== 0 || !/^[0-9a-f]+$/.test(normalized)) {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  return normalized;
}

function uint64(value: unknown, label: string): bigint {
  let parsed: bigint;
  if (typeof value === 'bigint') parsed = value;
  else if (typeof value === 'number' && Number.isSafeInteger(value)) parsed = BigInt(value);
  else if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) parsed = BigInt(value);
  else throw new Error(`${label} must be an unsigned integer`);
  if (parsed < 0n || parsed > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} must fit uint64`);
  }
  return parsed;
}

function uint32(value: unknown, label: string): number {
  const parsed = uint64(value, label);
  if (parsed > 0xffff_ffffn) throw new Error(`${label} must fit uint32`);
  return Number(parsed);
}
