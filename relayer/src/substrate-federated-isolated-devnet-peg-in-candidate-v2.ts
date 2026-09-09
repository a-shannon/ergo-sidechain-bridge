import { sha256CanonicalJson } from './strict-json.js';
import type { SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1 }
  from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV3,
  getSubstrateFederatedIsolatedDevnetSetupCompilerInputV3,
  type SubstrateFederatedIsolatedDevnetSetupExecutionBatchV3,
  assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1,
  assertSubstrateFederatedNativeGenesisSetupReadCustodyV1,
  getSubstrateFederatedNativeGenesisSetupCompilerInputV1,
  type SubstrateFederatedNativeGenesisSetupExecutionBatchV1,
} from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';
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
  assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1(batch, target);
  assertSubstrateFederatedPooledReserveDepositV2Packet(packet);
  return packet;
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
  assertSubstrateFederatedNativeGenesisSetupReadCustodyV1(batch, target);
  assertSubstrateFederatedPooledReserveDepositV2Packet(packet);
  return packet;
}
