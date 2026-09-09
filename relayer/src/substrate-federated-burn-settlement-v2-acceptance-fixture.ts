import { createHash } from 'node:crypto';
import blakejs from 'blakejs';

import { buildSubstrateFederatedBurnSettlementV2, type SubstrateFederatedBurnSettlementV2Packet } from './substrate-federated-burn-settlement-v2.js';
import { buildSubstrateFederatedBurnSettlementV2FixtureInput } from './substrate-federated-burn-settlement-v2-fixture.js';
import type { Eip12Box } from './unsigned-ergo-transaction.js';

export const SUBSTRATE_FEDERATED_BURN_SETTLEMENT_V2_ACCEPTANCE_FIXTURE_SCHEMA =
  'e2s.substrate-federated-burn-settlement-jvm-fixture.v2' as const;

/** Genuine process-owned V2 compilation, followed by synthetic state construction.
 * The exported bytes carry identity, not reusable compiler or state authority.
 */
export async function buildSubstrateFederatedBurnSettlementV2AcceptanceFixture() {
  const input = await buildSubstrateFederatedBurnSettlementV2FixtureInput();
  const packet = await buildSubstrateFederatedBurnSettlementV2(input);
  const family = input.familyCompilerReceipt;
  const tracker = input.familyCompilerInput.trackerReceipt;
  const serialized = await serializeSubstrateFederatedWithdrawalFixtureTransaction(packet.transaction);
  const module = await import('ergo-lib-wasm-nodejs');
  const wasm = module.default ?? module;
  const serializeBox = (value: Eip12Box) => {
    const box = wasm.ErgoBox.from_json(JSON.stringify(value));
    try { return Buffer.from(box.sigma_serialize_bytes()).toString('hex'); }
    finally { box.free(); }
  };
  const contract = (propositionHex: string) => ({
    propositionHex, contractIdHex: blake2b256(Buffer.from(propositionHex, 'hex')),
    propositionSha256Hex: sha256(Buffer.from(propositionHex, 'hex')),
  });
  return {
    schema: SUBSTRATE_FEDERATED_BURN_SETTLEMENT_V2_ACCEPTANCE_FIXTURE_SCHEMA,
    version: 2 as const,
    compiler: {
      trackerReceiptSchema: tracker.schema, familyReceiptSchema: family.schema,
      trackerRequestDigestHex: packet.trackerCompilerRequestDigestHex,
      trackerReceiptDigestHex: packet.trackerCompilerReceiptDigestHex,
      familyRequestDigestHex: packet.familyCompilerRequestDigestHex,
      familyReceiptDigestHex: packet.familyCompilerReceiptDigestHex,
      lockDigestHex: packet.compilerLockDigestHex,
      sigmaStateVersion: tracker.compiler.sigmaStateVersion,
      sigmaStateArtifactSha256Hex: tracker.compiler.sigmaStateArtifactSha256,
    },
    contracts: {
      tracker: contract(tracker.contract.propositionHex),
      duplicatePrevention: contract(family.contracts.duplicatePrevention.propositionHex),
      sourceLock: contract(family.contracts.sourceLock.propositionHex),
      pooledReserve: contract(family.contracts.pooledReserve.propositionHex),
    },
    familyProfile: family.profile,
    currentErgoHeight: input.currentErgoHeight,
    activatedScriptVersion: 3,
    burnIdHex: packet.burn.leaf.burnIdHex,
    amountNanoErg: packet.burn.leaf.amountNanoErg,
    inputBoxSigmaHex: [packet.boxes.reservePredecessor, packet.boxes.duplicatePreventionPredecessor,
      packet.boxes.feeFundingInput].map(serializeBox),
    dataInputBoxSigmaHex: [serializeBox(packet.boxes.trackerDataInput)],
    eip12UnsignedTransaction: serialized.eip12UnsignedTransaction,
    unsignedTransactionIdHex: packet.transaction.txId,
    prooflessTransactionHex: serialized.prooflessTransactionHex,
    prooflessTransactionSha256Hex: serialized.prooflessTransactionSha256Hex,
    boundaries: {
      syntheticPredecessors: true, genuineV2CompilerProvenanceConsumed: true,
      canonicalStateEstablished: false, trackerAdmissionEstablished: false,
      nodeAcceptanceEstablished: false, fundsAuthorityEstablished: false,
      broadcastPerformed: false,
    },
  };
}

/** Pure wire preparation; this also accepts ordinary synthetic transactions.
 * It does not create a V2 packet, compiler receipt, or state authority.
 */
export async function serializeSubstrateFederatedWithdrawalFixtureTransaction(
  transaction: Pick<SubstrateFederatedBurnSettlementV2Packet['transaction'], 'eip12Tx' | 'txId'>,
) {
  const module = await import('ergo-lib-wasm-nodejs');
  const wasm = module.default ?? module;
  const eip12UnsignedTransaction = {
    inputs: transaction.eip12Tx.inputs.map(({ boxId, extension }) => ({ boxId, extension })),
    dataInputs: transaction.eip12Tx.dataInputs.map(({ boxId }) => ({ boxId })),
    outputs: transaction.eip12Tx.outputs.map(output => ({
      value: String(output.value), ergoTree: output.ergoTree,
      assets: (output.assets ?? []).map(asset => ({ tokenId: asset.tokenId, amount: String(asset.amount) })),
      additionalRegisters: output.additionalRegisters ?? {}, creationHeight: output.creationHeight,
    })),
  };
  if (eip12UnsignedTransaction.inputs.length !== 3) throw new Error('withdrawal fixture requires three inputs');
  let unsigned: any = wasm.UnsignedTransaction.from_json(JSON.stringify(eip12UnsignedTransaction));
  let proofless: any;
  try {
    const id = unsigned.id();
    try {
      if (id.to_str() !== transaction.txId) throw new Error('V2 unsigned transaction identity drift');
    } finally { id.free(); }
    const consumed = unsigned;
    unsigned = undefined;
    proofless = wasm.Transaction.from_unsigned_tx(consumed, [new Uint8Array(), new Uint8Array(), new Uint8Array()]);
    const bytes = Buffer.from(proofless.sigma_serialize_bytes());
    if (blake2b256(bytes) !== transaction.txId) throw new Error('V2 proofless bytes differ from constructor');
    return {
      eip12UnsignedTransaction, prooflessTransactionHex: bytes.toString('hex'),
      prooflessTransactionSha256Hex: sha256(bytes),
    };
  } finally { proofless?.free(); unsigned?.free(); }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function blake2b256(bytes: Uint8Array): string {
  return Buffer.from(blakejs.blake2b(bytes, undefined, 32)).toString('hex');
}
