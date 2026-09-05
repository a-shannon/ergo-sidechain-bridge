import blakejs from 'blakejs';

import { assertContextExtensionSafe } from './context-extension-guard.js';
import { canonicalJson } from './strict-json.js';
import {
  assertExactSubstrateFederatedTrackerV2InputBox,
  assertSubstrateFederatedTrackerV2Context,
  type SubstrateFederatedTrackerV2Context,
} from './substrate-federated-tracker-v2.js';
import type {
  Eip12Box, Eip12OutputCandidate, Eip12UnsignedInput,
} from './unsigned-ergo-transaction.js';

export const SUBSTRATE_FEDERATED_TRACKER_V2_EXTERNAL_FEE_TRANSACTION_SCHEMA =
  'e2s.substrate-federated-v2-tracker-external-fee-transaction' as const;

// Compatibility bytes from profiles/substrate-grandpa-v1/ergo-settlement-policy.ts.
// No V1 profile policy or activation authority is imported into this composer.
const MINER_FEE_NANO_ERG = '1100000' as const;
const MINER_FEE_TREE =
  '1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304';
const MAX_TRANSACTION_BYTES = 262_144;

export interface BuildSubstrateFederatedTrackerV2ExternalFeeTransactionInput {
  readonly trackerContext: Readonly<SubstrateFederatedTrackerV2Context>;
  readonly trackerInputBox: unknown;
  readonly feeInputBox: unknown;
  readonly feePayerPublicKeyHex: string;
}

export interface SubstrateFederatedTrackerV2ExternalFeeTransaction {
  readonly schema: typeof SUBSTRATE_FEDERATED_TRACKER_V2_EXTERNAL_FEE_TRANSACTION_SCHEMA;
  readonly version: 2;
  readonly trackerUnsignedTransactionIdHex: string;
  readonly unsignedTransactionIdHex: string;
  readonly minerFeeNanoErg: typeof MINER_FEE_NANO_ERG;
  readonly inputBoxes: readonly [Readonly<Eip12Box>, Readonly<Eip12Box>];
  readonly inputBoxSigmaHex: readonly [string, string];
  readonly eip12UnsignedTransaction: {
    readonly inputs: readonly [Readonly<Eip12UnsignedInput>, Readonly<Eip12UnsignedInput>];
    readonly dataInputs: readonly [];
    readonly outputs: readonly [Readonly<Eip12OutputCandidate>, Readonly<Eip12OutputCandidate>];
  };
  readonly prooflessTransactionHex: string;
  readonly prooflessTransactionBytes: number;
  readonly boundaries: Omit<SubstrateFederatedTrackerV2Context['boundaries'], 'feesIncluded'> & {
    readonly feesIncluded: true;
  };
}

const TRANSACTIONS = new WeakSet<object>();
let wasmPromise: Promise<any> | undefined;

export function assertSubstrateFederatedTrackerV2ExternalFeeTransaction(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedTrackerV2ExternalFeeTransaction> {
  if (value === null || typeof value !== 'object'
    || !TRANSACTIONS.has(value) || !Object.isFrozen(value)) {
    throw new Error('substrate federated tracker V2 external fee transaction provenance is missing');
  }
}

export async function buildSubstrateFederatedTrackerV2ExternalFeeTransaction(
  input: BuildSubstrateFederatedTrackerV2ExternalFeeTransactionInput,
): Promise<Readonly<SubstrateFederatedTrackerV2ExternalFeeTransaction>> {
  // Capture caller properties and deep-copy mutable boxes before any await.
  const context = input.trackerContext;
  const trackerSnapshot = structuredClone(input.trackerInputBox);
  const feeSnapshot = structuredClone(input.feeInputBox);
  const publicKeyHex = input.feePayerPublicKeyHex;
  assertSubstrateFederatedTrackerV2Context(context);
  if (typeof publicKeyHex !== 'string' || !/^(02|03)[0-9a-f]{64}$/.test(publicKeyHex)) {
    throw new Error('fee payer public key must be canonical compressed lowercase hex');
  }
  const trackerBox = await assertExactSubstrateFederatedTrackerV2InputBox(context, trackerSnapshot);
  const wasm = await (wasmPromise ??= import('ergo-lib-wasm-nodejs')
    .then(module => module.default ?? module));
  let address: any;
  let tree: any;
  let feeBoxHandle: any;
  let feeBoxId: any;
  let unsigned: any;
  let unsignedId: any;
  let proofless: any;
  let roundTrip: any;
  try {
    // WASM must parse an actual curve point, not just a 33-byte prefix pattern.
    address = wasm.Address.p2pk_from_pk_bytes(Buffer.from(publicKeyHex, 'hex'));
    tree = address.to_ergo_tree();
    const feeTree = tree.to_base16_bytes();
    if (Buffer.from(address.content_bytes()).toString('hex') !== publicKeyHex
      || feeTree !== `0008cd${publicKeyHex}`) {
      throw new Error('fee payer public key does not round-trip as canonical P2PK');
    }
    const currentHeight = context.trackerTransition.currentErgoHeight;
    assertFeeBoxShape(feeSnapshot, trackerBox.boxId, feeTree, currentHeight);
    feeBoxHandle = wasm.ErgoBox.from_json(JSON.stringify(feeSnapshot));
    const feeBox = feeBoxHandle.to_js_eip12() as Eip12Box;
    feeBoxId = feeBoxHandle.box_id();
    if (canonicalJson(feeBox) !== canonicalJson(feeSnapshot)
      || feeBoxId.to_str() !== feeSnapshot.boxId) {
      throw new Error('fee input box is not exact canonical EIP-12 or its box ID differs');
    }
    const source = context.eip12UnsignedTransaction;
    if (!Array.isArray(source.inputs) || source.inputs.length !== 1
      || !Array.isArray(source.dataInputs) || source.dataInputs.length !== 0
      || !Array.isArray(source.outputs) || source.outputs.length !== 1
      || source.inputs[0]?.boxId !== trackerBox.boxId
      || canonicalJson(source.inputs[0]?.extension) !== canonicalJson(context.contextExtension.eip12Values)) {
      throw new Error('tracker context transaction shape differs');
    }
    const successor = source.outputs[0] as Eip12OutputCandidate;
    if (successor.value !== trackerBox.value
      || canonicalJson(successor.assets) !== canonicalJson(trackerBox.assets)) {
      throw new Error('tracker successor does not preserve tracker value and tokens');
    }
    const eip12UnsignedTransaction: SubstrateFederatedTrackerV2ExternalFeeTransaction['eip12UnsignedTransaction'] = {
      inputs: [
        { ...trackerBox, extension: { ...context.contextExtension.eip12Values } },
        { ...feeBox, extension: {} },
      ],
      dataInputs: [],
      outputs: [successor, {
        value: MINER_FEE_NANO_ERG, ergoTree: MINER_FEE_TREE,
        assets: [], additionalRegisters: {}, creationHeight: currentHeight,
      }],
    };
    const wire = {
      inputs: eip12UnsignedTransaction.inputs.map(({ boxId, extension }) => ({ boxId, extension })),
      dataInputs: [], outputs: eip12UnsignedTransaction.outputs,
    };
    assertContextExtensionSafe(wire.inputs, 'substrate federated tracker V2 external fee', 3);
    // Feed the signer-usable full EIP-12 object to the real parser, then compare
    // its canonical wire projection (WASM omits input box fields from this view).
    unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify(eip12UnsignedTransaction));
    if (canonicalJson(unsigned.to_js_eip12()) !== canonicalJson(wire)) {
      throw new Error('WASM changed the external fee transaction or tracker successor');
    }
    unsignedId = unsigned.id();
    const unsignedTransactionIdHex = unsignedId.to_str();
    const consumed = unsigned;
    unsigned = undefined;
    proofless = wasm.Transaction.from_unsigned_tx(consumed, [new Uint8Array(), new Uint8Array()]);
    const bytes = Buffer.from(proofless.sigma_serialize_bytes());
    if (bytes.length > MAX_TRANSACTION_BYTES
      || Buffer.from(blakejs.blake2b(bytes, undefined, 32)).toString('hex') !== unsignedTransactionIdHex) {
      throw new Error('external fee proofless transaction size or ID mismatch');
    }
    const prooflessJson = proofless.to_js_eip12();
    // Match V2's JSON-to-bytes round-trip; the binary parser has known failures.
    roundTrip = wasm.Transaction.from_json(JSON.stringify(prooflessJson));
    if (!Buffer.from(roundTrip.sigma_serialize_bytes()).equals(bytes)
      || canonicalJson(roundTrip.to_js_eip12()) !== canonicalJson(prooflessJson)) {
      throw new Error('external fee proofless transaction round-trip mismatch');
    }
    const result: Readonly<SubstrateFederatedTrackerV2ExternalFeeTransaction> = deepFreeze({
      schema: SUBSTRATE_FEDERATED_TRACKER_V2_EXTERNAL_FEE_TRANSACTION_SCHEMA,
      version: 2,
      trackerUnsignedTransactionIdHex: context.unsignedTransactionIdHex,
      unsignedTransactionIdHex,
      minerFeeNanoErg: MINER_FEE_NANO_ERG,
      inputBoxes: [trackerBox, feeBox],
      inputBoxSigmaHex: [context.inputBoxSigmaHex, Buffer.from(feeBoxHandle.sigma_serialize_bytes()).toString('hex')],
      eip12UnsignedTransaction,
      prooflessTransactionHex: bytes.toString('hex'),
      prooflessTransactionBytes: bytes.length,
      boundaries: { ...context.boundaries, feesIncluded: true },
    });
    TRANSACTIONS.add(result);
    return result;
  } finally {
    roundTrip?.free?.();
    proofless?.free?.();
    unsignedId?.free?.();
    unsigned?.free?.();
    feeBoxId?.free?.();
    feeBoxHandle?.free?.();
    tree?.free?.();
    address?.free?.();
  }
}

function assertFeeBoxShape(
  value: unknown, trackerBoxId: string, feeTree: string, currentHeight: number,
): asserts value is Eip12Box {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('fee input box must be exact canonical EIP-12');
  }
  const box = value as Eip12Box;
  if (box.boxId === trackerBoxId) throw new Error('fee input box must have a different box ID');
  if (canonicalJson(Object.keys(box).sort()) !== canonicalJson([
    'additionalRegisters', 'assets', 'boxId', 'creationHeight', 'ergoTree', 'index', 'transactionId', 'value',
  ])
    || typeof box.boxId !== 'string' || !/^[0-9a-f]{64}$/.test(box.boxId)
    || typeof box.transactionId !== 'string' || !/^[0-9a-f]{64}$/.test(box.transactionId)
    || !Number.isInteger(box.index) || box.index < 0 || box.index > 0x7fff
    || !Number.isSafeInteger(box.creationHeight) || box.creationHeight < 0
    || box.creationHeight >= currentHeight
    || box.value !== MINER_FEE_NANO_ERG || box.ergoTree !== feeTree
    || !Array.isArray(box.assets) || box.assets.length !== 0
    || box.additionalRegisters === null || typeof box.additionalRegisters !== 'object'
    || Array.isArray(box.additionalRegisters) || Object.keys(box.additionalRegisters).length !== 0) {
    throw new Error('fee input box must be exact canonical EIP-12, pure ERG, exact P2PK and 1100000 nanoERG before current height');
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
