import { sha256CanonicalJson } from './strict-json.js';
import type { SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1 }
  from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  assertSubstrateFederatedNativeGenesisSetupExecutionBatchV3,
  assertSubstrateFederatedNativeGenesisSetupReadCustodyV3,
  getSubstrateFederatedNativeGenesisSetupCompilerInputV3,
  type SubstrateFederatedNativeGenesisSetupExecutionBatchV3,
} from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import {
  assertSubstrateFederatedPooledReserveDepositV3Packet,
  buildSubstrateFederatedPooledReserveDepositV3,
  type BuildSubstrateFederatedPooledReserveDepositV3Input,
  type SubstrateFederatedPooledReserveDepositV3Packet,
} from './substrate-federated-pooled-reserve-deposit-v3.js';
import { materializeUnsignedTransaction, type Eip12UnsignedTransaction }
  from './unsigned-ergo-transaction.js';

const BODY_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_UNSIGNED_BODY_V1';
const MATERIALIZED_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MATERIALIZED_TX_V1';
const OUTPUT_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETUP_CHECK_OUTPUT_BODY_V2';
type Target = Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
type Batch = Readonly<SubstrateFederatedNativeGenesisSetupExecutionBatchV3>;
type Packet = Readonly<SubstrateFederatedPooledReserveDepositV3Packet>;
const nativePackets = new WeakMap<object, Readonly<{
  batch: Batch;
  target: Target;
  familyReceipt: ReturnType<typeof getSubstrateFederatedNativeGenesisSetupCompilerInputV3>['familyReceipt'];
}>>();

export interface BuildSubstrateFederatedNativeGenesisPegInPacketV3Input extends Omit<
  BuildSubstrateFederatedPooledReserveDepositV3Input,
  'familyCompilerInput' | 'familyCompilerReceipt' | 'reserveState'
> {
  readonly batch: Batch;
  readonly target: Target;
}

/** Bind one unsigned V3 deposit to its exact retained native setup batch. */
export async function buildSubstrateFederatedNativeGenesisPegInPacketV3(
  input: Readonly<BuildSubstrateFederatedNativeGenesisPegInPacketV3Input>,
): Promise<Packet> {
  const required = ['batch', 'target', 'sourceFundingInput', 'sourceIntent',
    'depositorErgoTreeHex', 'creationHeights'];
  if (input === null || typeof input !== 'object' || Array.isArray(input)
    || required.some(key => !Object.hasOwn(input, key))
    || Reflect.ownKeys(input).some(key => typeof key !== 'string'
      || ![...required, 'fees'].includes(key)
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(input, key)!, 'value'))) {
    throw new Error('native FED V3 peg-in requires exact own-data construction inputs');
  }
  const { batch, target, sourceFundingInput, sourceIntent, depositorErgoTreeHex,
    creationHeights, fees } = input;
  const construction = structuredClone({ sourceFundingInput, sourceIntent, creationHeights, fees });
  const compiler = getSubstrateFederatedNativeGenesisSetupCompilerInputV3(batch, target);
  const issuance = batch.orderedTransactions[2]?.issuance;
  if (issuance === undefined || issuance.ordinal !== 2 || issuance.role !== 'pooled-reserve'
    || issuance.predictedStateOutput.index !== 0) {
    throw new Error('native FED V3 reserve issuance identity is invalid');
  }
  const materialized = await materializeUnsignedTransaction(
    structuredClone(issuance.unsignedTransactionBody) as unknown as Eip12UnsignedTransaction,
    'native FED V3 reserve issuance',
  );
  assertSubstrateFederatedNativeGenesisSetupExecutionBatchV3(batch, target);
  const predecessor = materialized.outputs[0];
  const predicted = issuance.predictedStateOutput;
  if (predecessor === undefined
    || materialized.txId !== issuance.unsignedTransactionIdHex
    || materialized.txId !== predicted.transactionIdHex
    || sha256CanonicalJson(issuance.unsignedTransactionBody, BODY_DOMAIN)
      !== issuance.unsignedTransactionBodyDigestHex
    || sha256CanonicalJson(materialized.eip12Tx, BODY_DOMAIN)
      !== issuance.unsignedTransactionBodyDigestHex
    || sha256CanonicalJson(materialized, MATERIALIZED_DOMAIN)
      !== issuance.materializedTransactionDigestHex
    || predecessor.boxId !== predicted.boxIdHex
    || predecessor.transactionId !== predicted.transactionIdHex
    || predecessor.index !== predicted.index
    || predecessor.creationHeight !== predicted.creationHeight
    || sha256CanonicalJson(predecessor, OUTPUT_DOMAIN) !== predicted.bodyDigestHex) {
    throw new Error('native FED V3 reserve issuance prediction differs from materialized output');
  }
  const packet = await buildSubstrateFederatedPooledReserveDepositV3({
    familyCompilerInput: compiler.familyCompilerInput,
    familyCompilerReceipt: compiler.familyReceipt,
    sourceFundingInput: construction.sourceFundingInput,
    reserveState: { predecessor, depositHistory: [] },
    sourceIntent: construction.sourceIntent,
    depositorErgoTreeHex,
    creationHeights: construction.creationHeights,
    fees: construction.fees,
  });
  assertSubstrateFederatedNativeGenesisSetupExecutionBatchV3(batch, target);
  assertSubstrateFederatedPooledReserveDepositV3Packet(packet);
  const retained = nativePackets.get(packet);
  if (retained !== undefined && (retained.batch !== batch || retained.target !== target
    || retained.familyReceipt !== compiler.familyReceipt)) {
    throw new Error('native FED V3 peg-in packet is already bound to another setup');
  }
  nativePackets.set(packet, Object.freeze({ batch, target, familyReceipt: compiler.familyReceipt }));
  return packet;
}

export function assertSubstrateFederatedNativeGenesisPegInPacketV3(
  packet: Packet,
  batch: Batch,
  target: Target,
): Packet {
  const retained = nativePackets.get(packet);
  if (retained === undefined || retained.batch !== batch || retained.target !== target) {
    throw new Error('native FED V3 peg-in packet lacks exact process provenance');
  }
  assertSubstrateFederatedNativeGenesisSetupExecutionBatchV3(batch, target);
  assertSubstrateFederatedPooledReserveDepositV3Packet(packet);
  return packet;
}

/** Retained packet and setup read custody within a fully bracketed output read. */
export function assertSubstrateFederatedNativeGenesisPegInReadCustodyV3(
  packet: Packet,
  batch: Batch,
  target: Target,
): Packet {
  const retained = nativePackets.get(packet);
  if (retained === undefined || retained.batch !== batch || retained.target !== target) {
    throw new Error('native FED V3 peg-in packet lacks exact retained read custody');
  }
  assertSubstrateFederatedNativeGenesisSetupReadCustodyV3(batch, target);
  assertSubstrateFederatedPooledReserveDepositV3Packet(packet);
  return packet;
}

/** Read only the compiler receipt retained with this exact native V3 packet. */
export function getSubstrateFederatedNativeGenesisPegInFamilyReceiptV3(
  packet: Packet,
  batch: Batch,
  target: Target,
): ReturnType<typeof getSubstrateFederatedNativeGenesisSetupCompilerInputV3>['familyReceipt'] {
  assertSubstrateFederatedNativeGenesisPegInReadCustodyV3(packet, batch, target);
  const familyReceipt = nativePackets.get(packet)!.familyReceipt;
  assertSubstrateFederatedNativeGenesisPegInReadCustodyV3(packet, batch, target);
  return familyReceipt;
}
