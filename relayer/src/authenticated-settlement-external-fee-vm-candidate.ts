import blakejs from 'blakejs';

import {
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';
import {
  materializeUnsignedTransaction,
  normalizeEip12Box,
  type Eip12Box,
  type Eip12UnsignedTransaction,
} from './unsigned-ergo-transaction.js';
import {
  assertAuthenticatedSettlementExternalFeePacketIntegrity,
  assertAuthenticatedSettlementExternalFeePacketProvenance,
  type AuthenticatedSettlementExternalFeeBoxBinding,
  type AuthenticatedSettlementExternalFeePacket,
} from './profiles/substrate-grandpa-v1/authenticated-settlement-external-fee-transaction.js';

export const AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_VM_CANDIDATE_SCHEMA =
  'e2s.authenticated-settlement-external-fee-vm-candidate.v1' as const;
export const AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_VM_CANDIDATE_DIGEST_DOMAIN =
  'e2s.authenticated-settlement-external-fee-vm-candidate.v1' as const;

const VM_CANDIDATES = new WeakSet<object>();
const CANDIDATE_BOUNDARIES = Object.freeze({
  compilerReceiptBound: false,
  contractCompiledAndVmAccepted: false,
  targetNodeAccepted: false,
  liveInputBoxesRevalidated: false,
  externalFeeSpendabilityEstablished: false,
  replayCutoverEstablished: false,
  legacyRoutesDisabled: false,
  finalityAuthorityReplaced: false,
  signingAuthorized: false,
  submissionAuthorized: false,
  broadcastAuthorized: false,
  fundsAuthorityEstablished: false,
  gate5Closed: false,
  trustlessStatusEstablished: false,
  productionReadinessEstablished: false,
} as const);

export interface BuildAuthenticatedSettlementExternalFeeVmCandidateInput {
  packet: AuthenticatedSettlementExternalFeePacket;
  currentErgoHeight: number;
  duplicatePreventionBox: Eip12Box;
  vaultBox: Eip12Box;
  externalFeeBox: Eip12Box;
  trackerDataInput: Eip12Box;
}

export interface SerializedContextExtension {
  keys: number[];
  serializedHex: string;
  serializedBlake2b256Hex: string;
}

export interface AuthenticatedSettlementExternalFeeVmCandidate {
  schema: typeof AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_VM_CANDIDATE_SCHEMA;
  packetDigestHex: string;
  currentErgoHeight: number;
  contractIdentities:
    AuthenticatedSettlementExternalFeePacket['contractIdentities'];
  boxes: {
    inputs: [Eip12Box, Eip12Box, Eip12Box];
    dataInputs: [Eip12Box];
  };
  transaction: {
    eip12UnsignedTransaction: Eip12UnsignedTransaction;
    unsignedTransactionIdHex: string;
    prooflessTransactionIdHex: string;
    prooflessTransactionHex: string;
    prooflessTransactionBytes: number;
    inputBoxSigmaHex: [string, string, string];
    dataInputBoxSigmaHex: [string];
    contextExtensions: [
      SerializedContextExtension,
      SerializedContextExtension,
      SerializedContextExtension,
    ];
  };
  localBindings: {
    exactInputBoxesMaterialized: true;
    exactTransactionMaterialized: true;
    prooflessSerializationEstablished: true;
  };
  boundaries: typeof CANDIDATE_BOUNDARIES;
  candidateDigestHex: string;
}

export async function buildAuthenticatedSettlementExternalFeeVmCandidate(
  input: BuildAuthenticatedSettlementExternalFeeVmCandidateInput,
): Promise<Readonly<AuthenticatedSettlementExternalFeeVmCandidate>> {
  assertExactKeys(input, [
    'packet',
    'currentErgoHeight',
    'duplicatePreventionBox',
    'vaultBox',
    'externalFeeBox',
    'trackerDataInput',
  ], 'external-fee VM candidate input');
  assertAuthenticatedSettlementExternalFeePacketProvenance(input.packet);
  assertAuthenticatedSettlementExternalFeePacketIntegrity(input.packet);

  const currentErgoHeight = positiveSafeInteger(
    input.currentErgoHeight,
    'current Ergo height',
  );
  const duplicatePreventionBox = await bindExactBox(
    input.duplicatePreventionBox,
    input.packet.inputBindings.duplicatePrevention,
    'duplicate-prevention input',
  );
  const vaultBox = await bindExactBox(
    input.vaultBox,
    input.packet.inputBindings.vault,
    'vault input',
  );
  const externalFeeBox = await bindExactBox(
    input.externalFeeBox,
    input.packet.inputBindings.externalFee,
    'external-fee input',
  );
  const trackerDataInput = await bindExactBox(
    input.trackerDataInput,
    input.packet.inputBindings.trackerDataInput,
    'tracker data input',
  );

  const eip12UnsignedTransaction: Eip12UnsignedTransaction = {
    inputs: [
      {
        ...duplicatePreventionBox,
        extension: structuredClone(input.packet.unsignedTx.inputs[0].extension),
      },
      {
        ...vaultBox,
        extension: structuredClone(input.packet.unsignedTx.inputs[1].extension),
      },
      {
        ...externalFeeBox,
        extension: structuredClone(input.packet.unsignedTx.inputs[2].extension),
      },
    ],
    dataInputs: [trackerDataInput],
    outputs: structuredClone(input.packet.unsignedTx.outputs),
  };
  const materialized = await materializeUnsignedTransaction(
    eip12UnsignedTransaction,
    'authenticated external-fee VM candidate',
  );
  const wasmModule = await import('ergo-lib-wasm-nodejs');
  const wasm = wasmModule.default ?? wasmModule;
  let unsigned: any;
  let unsignedId: any;
  let proofless: any;
  let prooflessId: any;
  try {
    unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify(
      canonicalUnsignedShape(materialized.eip12Tx),
    ));
    const roundTrip = unsigned.to_js_eip12();
    if (
      canonicalJson(roundTrip)
      !== canonicalJson(canonicalUnsignedShape(materialized.eip12Tx))
    ) {
      throw new Error('WASM changed the exact external-fee unsigned transaction');
    }
    const contextExtensions = serializeInputExtensions(wasm, unsigned);
    unsignedId = unsigned.id();
    const unsignedTransactionIdHex = fixedHex(
      unsignedId.to_str(),
      32,
      'unsigned transaction ID',
    );
    if (unsignedTransactionIdHex !== materialized.txId) {
      throw new Error('materialized and WASM unsigned transaction IDs differ');
    }
    unsignedId.free?.();
    unsignedId = undefined;
    const consumedUnsigned = unsigned;
    unsigned = undefined;
    proofless = wasm.Transaction.from_unsigned_tx(
      consumedUnsigned,
      [new Uint8Array(), new Uint8Array(), new Uint8Array()],
    );
    prooflessId = proofless.id();
    const prooflessTransactionIdHex = fixedHex(
      prooflessId.to_str(),
      32,
      'proofless transaction ID',
    );
    const prooflessBytes = Buffer.from(proofless.sigma_serialize_bytes());
    if (
      prooflessTransactionIdHex !== unsignedTransactionIdHex
      || blake2b256Hex(prooflessBytes) !== unsignedTransactionIdHex
    ) {
      throw new Error(
        'proofless transaction bytes differ from the exact external-fee transaction',
      );
    }

    const withoutDigest = {
      schema: AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_VM_CANDIDATE_SCHEMA,
      packetDigestHex: fixedHex(
        input.packet.packetDigestHex,
        32,
        'packet digest',
      ),
      currentErgoHeight,
      contractIdentities: structuredClone(input.packet.contractIdentities),
      boxes: {
        inputs: [
          duplicatePreventionBox,
          vaultBox,
          externalFeeBox,
        ] as [Eip12Box, Eip12Box, Eip12Box],
        dataInputs: [trackerDataInput] as [Eip12Box],
      },
      transaction: {
        eip12UnsignedTransaction: materialized.eip12Tx,
        unsignedTransactionIdHex,
        prooflessTransactionIdHex,
        prooflessTransactionHex: prooflessBytes.toString('hex'),
        prooflessTransactionBytes: prooflessBytes.length,
        inputBoxSigmaHex: [
          serializeBox(wasm, duplicatePreventionBox),
          serializeBox(wasm, vaultBox),
          serializeBox(wasm, externalFeeBox),
        ] as [string, string, string],
        dataInputBoxSigmaHex: [
          serializeBox(wasm, trackerDataInput),
        ] as [string],
        contextExtensions,
      },
      localBindings: {
        exactInputBoxesMaterialized: true as const,
        exactTransactionMaterialized: true as const,
        prooflessSerializationEstablished: true as const,
      },
      boundaries: { ...CANDIDATE_BOUNDARIES },
    };
    const candidate: AuthenticatedSettlementExternalFeeVmCandidate = {
      ...withoutDigest,
      candidateDigestHex: sha256CanonicalJson(
        withoutDigest,
        AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_VM_CANDIDATE_DIGEST_DOMAIN,
      ),
    };
    const frozen = deepFreeze(candidate);
    VM_CANDIDATES.add(frozen);
    return frozen;
  } finally {
    prooflessId?.free?.();
    proofless?.free?.();
    unsignedId?.free?.();
    unsigned?.free?.();
  }
}

export function assertAuthenticatedSettlementExternalFeeVmCandidateProvenance(
  value: unknown,
): asserts value is Readonly<AuthenticatedSettlementExternalFeeVmCandidate> {
  if (
    value === null
    || typeof value !== 'object'
    || !VM_CANDIDATES.has(value)
  ) {
    throw new Error(
      'external-fee VM candidate was not materialized in this process',
    );
  }
}

export function assertAuthenticatedSettlementExternalFeeVmCandidateDigest(
  candidate: AuthenticatedSettlementExternalFeeVmCandidate,
): void {
  const { candidateDigestHex, ...withoutDigest } = candidate;
  if (
    fixedHex(candidateDigestHex, 32, 'VM candidate digest')
    !== sha256CanonicalJson(
      withoutDigest,
      AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_VM_CANDIDATE_DIGEST_DOMAIN,
    )
  ) {
    throw new Error('external-fee VM candidate digest does not match');
  }
}

async function bindExactBox(
  box: Eip12Box,
  binding: AuthenticatedSettlementExternalFeeBoxBinding,
  label: string,
): Promise<Eip12Box> {
  const normalized = await normalizeEip12Box(box, label);
  const expected = {
    boxId: binding.boxId,
    value: binding.valueNanoErg,
    ergoTree: binding.ergoTreeHex,
    assets: binding.assets.map(asset => ({
      tokenId: asset.tokenId,
      amount: asset.amount,
    })),
    additionalRegisters: structuredClone(binding.additionalRegisters),
    creationHeight: binding.creationHeight,
  };
  const observed = {
    boxId: normalized.boxId,
    value: normalized.value,
    ergoTree: normalized.ergoTree,
    assets: normalized.assets,
    additionalRegisters: normalized.additionalRegisters,
    creationHeight: normalized.creationHeight,
  };
  if (canonicalJson(observed) !== canonicalJson(expected)) {
    throw new Error(`${label} does not match the packet binding`);
  }
  return normalized;
}

function canonicalUnsignedShape(
  transaction: Eip12UnsignedTransaction,
): Record<string, unknown> {
  return {
    inputs: transaction.inputs.map(input => ({
      boxId: input.boxId,
      extension: input.extension,
    })),
    dataInputs: transaction.dataInputs.map(input => ({
      boxId: input.boxId,
    })),
    outputs: transaction.outputs.map(output => ({
      value: String(output.value),
      ergoTree: output.ergoTree,
      assets: (output.assets ?? []).map(asset => ({
        tokenId: asset.tokenId,
        amount: String(asset.amount),
      })),
      additionalRegisters: output.additionalRegisters ?? {},
      creationHeight: output.creationHeight,
    })),
  };
}

function serializeInputExtensions(
  wasm: any,
  unsigned: any,
): [
  SerializedContextExtension,
  SerializedContextExtension,
  SerializedContextExtension,
] {
  const expectedKeys = [[0, 1, 2], [0, 1, 2, 3], []] as const;
  const inputs = unsigned.inputs();
  const output: SerializedContextExtension[] = [];
  try {
    if (inputs.len() !== 3) {
      throw new Error('external-fee VM candidate must contain exactly three inputs');
    }
    for (let index = 0; index < inputs.len(); index += 1) {
      const item = inputs.get(index);
      const extension = item.extension();
      try {
        const keys = [...extension.keys()];
        const expected = expectedKeys[index];
        if (
          expected === undefined
          || keys.length !== expected.length
          || keys.some((key, keyIndex) => key !== expected[keyIndex])
        ) {
          throw new Error(
            `external-fee VM candidate input ${index} ContextExtension keys drifted`,
          );
        }
        const serialized = Buffer.from(extension.sigma_serialize_bytes());
        output.push({
          keys,
          serializedHex: serialized.toString('hex'),
          serializedBlake2b256Hex: blake2b256Hex(serialized),
        });
      } finally {
        extension.free?.();
        item.free?.();
      }
    }
  } finally {
    inputs.free?.();
  }
  return output as [
    SerializedContextExtension,
    SerializedContextExtension,
    SerializedContextExtension,
  ];
}

function serializeBox(wasm: any, boxJson: Eip12Box): string {
  const box = wasm.ErgoBox.from_json(JSON.stringify(boxJson));
  try {
    return Buffer.from(box.sigma_serialize_bytes()).toString('hex');
  } finally {
    box.free?.();
  }
}

function assertExactKeys(
  value: object,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length
    || actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${label} has an unexpected field set`);
  }
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be ${bytes} bytes of lowercase hex`);
  }
  return value;
}

function blake2b256Hex(value: Uint8Array): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key =>
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}
