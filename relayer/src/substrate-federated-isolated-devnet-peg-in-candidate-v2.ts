import { canonicalJson, sha256CanonicalJson } from './strict-json.js';
import type { SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1 }
  from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV3,
  getSubstrateFederatedIsolatedDevnetSetupCompilerInputV3,
  type SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3,
  assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1,
  assertSubstrateFederatedNativeGenesisSetupReadCustodyV1,
  getSubstrateFederatedNativeGenesisSetupCompilerInputV1,
  getSubstrateFederatedNativeGenesisReadCompilerInputV1,
  type SubstrateFederatedNativeGenesisSetupExecutionBatchV1,
  assertSubstrateFederatedIsolatedDevnetWithdrawalV2Check,
  type SubstrateFederatedIsolatedDevnetWithdrawalV2Check,
} from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import { reobserveSubstrateFederatedIsolatedDevnetConfirmedWithdrawalV2,
  type SubstrateFederatedIsolatedDevnetWithdrawalV2Attempt }
  from './substrate-federated-isolated-devnet-withdrawal-v2-lifecycle.js';
import {
  assertSubstrateFederatedPooledReserveDepositV2Packet,
  buildSubstrateFederatedPooledReserveDepositV2,
  type BuildSubstrateFederatedPooledReserveDepositV2Input,
  type SubstrateFederatedPooledReserveDepositV2Packet,
} from './substrate-federated-pooled-reserve-deposit-v2.js';
import type { Eip12Box } from './unsigned-ergo-transaction.js';

const DOMAIN = 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_CANDIDATE_V2';
type Target = Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
type Batch = Readonly<SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3>;
const candidates = new WeakMap<object, Readonly<{ batch: Batch; target: Target }>>();
type NativeBatch = Readonly<SubstrateFederatedNativeGenesisSetupExecutionBatchV1>;
const nativePackets = new WeakMap<object, Readonly<{ batch: NativeBatch; target: Target }>>();
type Packet = Readonly<SubstrateFederatedPooledReserveDepositV2Packet>;
type Withdrawal = Readonly<{
  check: Readonly<SubstrateFederatedIsolatedDevnetWithdrawalV2Check>;
  attempt: Readonly<SubstrateFederatedIsolatedDevnetWithdrawalV2Attempt>;
  target: Target;
}>;
const nativeContinuations = new WeakMap<object, Readonly<{ previousPacket: Packet; withdrawal: Withdrawal }>>();

export interface BuildSubstrateFederatedIsolatedDevnetPegInCandidateV2Input
  extends Omit<BuildSubstrateFederatedPooledReserveDepositV2Input,
    'familyCompilerInput' | 'familyCompilerReceipt' | 'reserveState'> {
  readonly batch: Batch;
  readonly target: Target;
}

export interface SubstrateFederatedIsolatedDevnetPegInCandidateV2 {
  readonly schema: 'e2s.substrate-federated-isolated-devnet-peg-in-candidate.v2';
  readonly version: 2;
  readonly status: 'unsigned_non_authorizing_candidate';
  readonly candidateDigestHex: string;
  readonly target: Batch['targetBinding'];
  readonly setupRequestDigestHex: string;
  readonly setupCheckReceiptDigestHex: string;
  readonly depositPacket: Readonly<SubstrateFederatedPooledReserveDepositV2Packet>;
}

export async function buildSubstrateFederatedIsolatedDevnetPegInCandidateV2(
  input: Readonly<BuildSubstrateFederatedIsolatedDevnetPegInCandidateV2Input>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateV2>> {
  // The setup owns the reserve predecessor and compiler identity, never the caller.
  if (input === null || typeof input !== 'object' || Array.isArray(input)
    || ['batch', 'target', 'sourceFundingInput', 'sourceIntent', 'depositorErgoTreeHex', 'creationHeights']
      .some(key => !Object.hasOwn(input, key))
    || Object.keys(input).some(key => !['batch', 'target', 'sourceFundingInput', 'sourceIntent',
      'depositorErgoTreeHex', 'creationHeights', 'fees'].includes(key))) {
    throw new Error('isolated V2 peg-in candidate requires exact construction inputs');
  }
  const { batch, target } = input;
  const compiler = getSubstrateFederatedIsolatedDevnetSetupCompilerInputV3(batch, target);
  const issuance = batch.orderedTransactions[2]!.issuance;
  const outputs = issuance.unsignedTransactionBody['outputs'];
  if (issuance.ordinal !== 2 || issuance.role !== 'pooled-reserve'
    || issuance.predictedStateOutput.index !== 0 || !Array.isArray(outputs)
    || outputs[0] === null || typeof outputs[0] !== 'object' || Array.isArray(outputs[0])) {
    throw new Error('isolated V3 reserve issuance output is invalid');
  }
  const predecessor: Eip12Box = {
    ...structuredClone(outputs[0]),
    boxId: issuance.predictedStateOutput.boxIdHex,
    transactionId: issuance.predictedStateOutput.transactionIdHex,
    index: 0,
  };
  const depositPacket = await buildSubstrateFederatedPooledReserveDepositV2({
    familyCompilerInput: {
      trackerRequest: compiler.trackerRequest,
      trackerReceipt: compiler.trackerReceipt,
      templates: compiler.familyTemplates,
      duplicatePreventionGenesisInputBoxIdHex: compiler.familyReceipt.profile.duplicatePreventionNftIdHex,
      pooledReserveGenesisInputBoxIdHex: compiler.familyReceipt.profile.pooledReserveNftIdHex,
    },
    familyCompilerReceipt: compiler.familyReceipt,
    sourceFundingInput: input.sourceFundingInput,
    reserveState: { predecessor, depositHistory: [] },
    sourceIntent: input.sourceIntent,
    depositorErgoTreeHex: input.depositorErgoTreeHex,
    creationHeights: input.creationHeights,
    fees: input.fees,
  });
  assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV3(batch, target);
  const body = Object.freeze({
    schema: 'e2s.substrate-federated-isolated-devnet-peg-in-candidate.v2' as const,
    version: 2 as const,
    status: 'unsigned_non_authorizing_candidate' as const,
    target: batch.targetBinding,
    setupRequestDigestHex: batch.request.requestDigestHex,
    setupCheckReceiptDigestHex: batch.receipt.receiptDigestHex,
    depositPacket,
  });
  const candidate = Object.freeze({ ...body, candidateDigestHex: sha256CanonicalJson(body, DOMAIN) });
  candidates.set(candidate, Object.freeze({ batch, target }));
  return candidate;
}

export function assertSubstrateFederatedIsolatedDevnetPegInCandidateV2(
  candidate: Readonly<SubstrateFederatedIsolatedDevnetPegInCandidateV2>,
  batch: Batch,
  target: Target,
): Readonly<SubstrateFederatedPooledReserveDepositV2Packet> {
  const retained = candidates.get(candidate);
  if (retained === undefined || retained.batch !== batch || retained.target !== target) {
    throw new Error('isolated V2 peg-in candidate lacks exact process provenance');
  }
  assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV3(batch, target);
  assertSubstrateFederatedPooledReserveDepositV2Packet(candidate.depositPacket);
  return candidate.depositPacket;
}

/** Native setup binding; the underlying deposit format remains V2. */
export async function buildSubstrateFederatedNativeGenesisPegInPacketV1(
  input: Readonly<Omit<BuildSubstrateFederatedIsolatedDevnetPegInCandidateV2Input, 'batch'> & {
    readonly batch: Readonly<SubstrateFederatedNativeGenesisSetupExecutionBatchV1>;
  }>,
): Promise<Readonly<SubstrateFederatedPooledReserveDepositV2Packet>> {
  const required = ['batch', 'target', 'sourceFundingInput', 'sourceIntent', 'depositorErgoTreeHex', 'creationHeights'];
  if (input === null || typeof input !== 'object' || Array.isArray(input)
    || required.some(key => !Object.hasOwn(input, key))
    || Reflect.ownKeys(input).some(key => typeof key !== 'string' || ![...required, 'fees'].includes(key)
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(input, key)!, 'value'))) {
    throw new Error('native FED peg-in requires exact own-data construction inputs');
  }
  const { batch, target, sourceFundingInput, sourceIntent, depositorErgoTreeHex, creationHeights, fees } = input;
  const compiler = getSubstrateFederatedNativeGenesisSetupCompilerInputV1(batch, target);
  const issuance = batch.orderedTransactions[2]!.issuance;
  const outputs = issuance.unsignedTransactionBody['outputs'];
  if (issuance.ordinal !== 2 || issuance.role !== 'pooled-reserve'
    || issuance.predictedStateOutput.index !== 0 || !Array.isArray(outputs)
    || outputs[0] === null || typeof outputs[0] !== 'object' || Array.isArray(outputs[0])) {
    throw new Error('native FED reserve issuance output is invalid');
  }
  const predecessor: Eip12Box = {
    ...structuredClone(outputs[0]),
    boxId: issuance.predictedStateOutput.boxIdHex,
    transactionId: issuance.predictedStateOutput.transactionIdHex,
    index: 0,
  };
  const packet = await buildSubstrateFederatedPooledReserveDepositV2({
    familyCompilerInput: {
      trackerRequest: compiler.trackerRequest,
      trackerReceipt: compiler.trackerReceipt,
      templates: compiler.familyTemplates,
      duplicatePreventionGenesisInputBoxIdHex: compiler.familyReceipt.profile.duplicatePreventionNftIdHex,
      pooledReserveGenesisInputBoxIdHex: compiler.familyReceipt.profile.pooledReserveNftIdHex,
    },
    familyCompilerReceipt: compiler.familyReceipt,
    sourceFundingInput,
    reserveState: { predecessor, depositHistory: [] },
    sourceIntent,
    depositorErgoTreeHex,
    creationHeights,
    fees,
  });
  assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(batch, target);
  assertSubstrateFederatedPooledReserveDepositV2Packet(packet);
  const retained = nativePackets.get(packet);
  if (retained !== undefined && (retained.batch !== batch || retained.target !== target)) {
    throw new Error('native FED peg-in packet is already bound to another setup');
  }
  nativePackets.set(packet, Object.freeze({ batch, target }));
  return packet;
}

export function assertSubstrateFederatedNativeGenesisPegInPacketV1(
  packet: Readonly<SubstrateFederatedPooledReserveDepositV2Packet>,
  batch: NativeBatch,
  target: Target,
): Readonly<SubstrateFederatedPooledReserveDepositV2Packet> {
  const retained = nativePackets.get(packet);
  if (retained === undefined || retained.batch !== batch || retained.target !== target) {
    throw new Error('native FED peg-in packet lacks exact process provenance');
  }
  const continuation = nativeContinuations.get(packet);
  if (continuation === undefined) assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(batch, target);
  else assertNativeContinuationPredecessor(continuation.previousPacket, batch, target, continuation.withdrawal);
  assertSubstrateFederatedPooledReserveDepositV2Packet(packet);
  return packet;
}

/** Build only from the confirmed payout of the original native deposit. */
export async function buildSubstrateFederatedNativeContinuationPegInPacketV1(
  input: Readonly<Omit<BuildSubstrateFederatedIsolatedDevnetPegInCandidateV2Input, 'batch'> & {
    batch: NativeBatch;
    previousPacket: Packet;
    withdrawal: Omit<Withdrawal, 'target'>;
  }>,
): Promise<Packet> {
  const required = ['batch', 'target', 'previousPacket', 'withdrawal', 'sourceFundingInput',
    'sourceIntent', 'depositorErgoTreeHex', 'creationHeights'];
  if (input === null || typeof input !== 'object' || Array.isArray(input)
    || required.some(key => !Object.hasOwn(input, key))
    || Reflect.ownKeys(input).some(key => typeof key !== 'string' || ![...required, 'fees'].includes(key)
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(input, key)!, 'value'))) {
    throw new Error('native FED continuation requires exact own-data construction inputs');
  }
  const { batch, target, previousPacket } = input;
  const value = input.withdrawal;
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || ['check', 'attempt'].some(key => !Object.hasOwn(value, key))
    || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !['check', 'attempt'].includes(key)
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, 'value'))) {
    throw new Error('native FED continuation requires exact withdrawal references');
  }
  const withdrawal = Object.freeze({ check: value.check, attempt: value.attempt, target });
  // Snapshot caller-owned construction values before observation yields.
  const construction = structuredClone({ sourceFundingInput: input.sourceFundingInput,
    sourceIntent: input.sourceIntent, depositorErgoTreeHex: input.depositorErgoTreeHex,
    creationHeights: input.creationHeights, fees: input.fees });
  assertNativeContinuationPredecessor(previousPacket, batch, target, withdrawal);
  const compiler = getSubstrateFederatedNativeGenesisReadCompilerInputV1(batch, nativePackets.get(previousPacket)!.target);
  const payout = await reobserveSubstrateFederatedIsolatedDevnetConfirmedWithdrawalV2(
    withdrawal.attempt, withdrawal.target, withdrawal.check);
  assertNativeContinuationPredecessor(previousPacket, batch, target, withdrawal);
  const packet = await buildSubstrateFederatedPooledReserveDepositV2({
    familyCompilerInput: { trackerRequest: compiler.trackerRequest, trackerReceipt: compiler.trackerReceipt,
      templates: compiler.familyTemplates,
      duplicatePreventionGenesisInputBoxIdHex: compiler.familyReceipt.profile.duplicatePreventionNftIdHex,
      pooledReserveGenesisInputBoxIdHex: compiler.familyReceipt.profile.pooledReserveNftIdHex },
    familyCompilerReceipt: compiler.familyReceipt,
    reserveState: { predecessor: payout.boxes.reserveSuccessor, depositHistory: [{
      sourceLockBoxIdHex: previousPacket.boxes.sourceLock.boxId,
      depositCommitmentHex: previousPacket.depositCommitmentHex,
    }] },
    ...construction,
  });
  await reobserveSubstrateFederatedIsolatedDevnetConfirmedWithdrawalV2(
    withdrawal.attempt, withdrawal.target, withdrawal.check);
  assertNativeContinuationPredecessor(previousPacket, batch, target, withdrawal);
  assertSubstrateFederatedPooledReserveDepositV2Packet(packet);
  nativePackets.set(packet, Object.freeze({ batch, target }));
  nativeContinuations.set(packet, Object.freeze({ previousPacket, withdrawal }));
  return packet;
}

function assertNativeContinuationPredecessor(previousPacket: Packet, batch: NativeBatch, target: Target,
  withdrawal: Withdrawal): void {
  const original = nativePackets.get(previousPacket);
  if (original === undefined || original.batch !== batch || nativeContinuations.has(previousPacket)
    || withdrawal.target !== target) throw new Error('native FED continuation lacks its original setup provenance');
  // The setup action is terminal; retained read custody is not current node authority.
  assertSubstrateFederatedNativeGenesisPegInReadCustodyV1(previousPacket, batch, original.target);
  const lineage = assertSubstrateFederatedIsolatedDevnetWithdrawalV2Check(withdrawal.check, withdrawal.target);
  if (previousPacket.reserve.predecessorDepositCount !== 0
    || previousPacket.reserve.successorDepositCount !== 1
    || lineage.setupRequestDigestHex !== batch.request.requestDigestHex
    || lineage.genesisHeaderIdHex !== batch.request.target.genesisHeaderIdHex
    || canonicalJson(withdrawal.check.packet.boxes.reservePredecessor) !== canonicalJson(previousPacket.boxes.reserveSuccessor)) {
    throw new Error('native FED continuation differs from the original deposit and payout');
  }
}

/** Original packet/check identity plus fresh confirmed successors; never a signing grant. */
export async function assertSubstrateFederatedNativeContinuationPegInPacketV1(
  packet: Packet, batch: NativeBatch, target: Target, previousPacket: Packet,
  withdrawalCheck: Readonly<SubstrateFederatedIsolatedDevnetWithdrawalV2Check>,
): Promise<void> {
  assertSubstrateFederatedNativeGenesisPegInPacketV1(packet, batch, target);
  const retained = nativeContinuations.get(packet);
  if (retained === undefined || retained.previousPacket !== previousPacket || retained.withdrawal.check !== withdrawalCheck) {
    throw new Error('native FED continuation packet lacks exact retained payout provenance');
  }
  assertNativeContinuationPredecessor(previousPacket, batch, target, retained.withdrawal);
  await reobserveSubstrateFederatedIsolatedDevnetConfirmedWithdrawalV2(
    retained.withdrawal.attempt, retained.withdrawal.target, withdrawalCheck);
  assertNativeContinuationPredecessor(previousPacket, batch, target, retained.withdrawal);
  assertSubstrateFederatedNativeGenesisPegInPacketV1(packet, batch, target);
}

/** Use only inside a read group bracketed by the full packet/target assertion. */
export function assertSubstrateFederatedNativeGenesisPegInReadCustodyV1(
  packet: Readonly<SubstrateFederatedPooledReserveDepositV2Packet>,
  batch: NativeBatch,
  target: Target,
): Readonly<SubstrateFederatedPooledReserveDepositV2Packet> {
  const retained = nativePackets.get(packet);
  if (retained === undefined || retained.batch !== batch || retained.target !== target) {
    throw new Error('native FED peg-in packet lacks exact retained read custody');
  }
  const continuation = nativeContinuations.get(packet);
  if (continuation === undefined) assertSubstrateFederatedNativeGenesisSetupReadCustodyV1(batch, target);
  else {
    const original = nativePackets.get(continuation.previousPacket);
    if (original === undefined || original.batch !== batch || nativeContinuations.has(continuation.previousPacket)) {
      throw new Error('native FED continuation lacks its original read custody');
    }
    assertSubstrateFederatedNativeGenesisPegInReadCustodyV1(continuation.previousPacket, batch, original.target);
  }
  assertSubstrateFederatedPooledReserveDepositV2Packet(packet);
  return packet;
}
