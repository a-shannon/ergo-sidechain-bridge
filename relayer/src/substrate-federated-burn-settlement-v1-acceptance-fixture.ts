import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import blakejs from 'blakejs';

import {
  buildSubstrateFederatedBurnSettlementV1,
  type SubstrateFederatedBurnSettlementV1Packet,
} from './substrate-federated-burn-settlement-v1.js';
import {
  buildSubstrateFederatedBurnSettlementV1FixtureInput,
} from './substrate-federated-burn-settlement-v1-fixture.js';
import {
  decodeSubstrateFederatedSettlementFamilyV1Profile,
  SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_COMPILER_BATCH_SHA256_HEX,
} from './substrate-federated-settlement-family-v1.js';
import type { Eip12Box } from './unsigned-ergo-transaction.js';

export const SUBSTRATE_FEDERATED_BURN_SETTLEMENT_V1_ACCEPTANCE_FIXTURE_SCHEMA =
  'e2s.substrate-federated-burn-settlement-jvm-fixture.v1' as const;

export interface SubstrateFederatedBurnSettlementV1AcceptanceFixture {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_BURN_SETTLEMENT_V1_ACCEPTANCE_FIXTURE_SCHEMA;
  readonly version: 1;
  readonly trustModel: 'federated_non_trustless';
  readonly sigmaStateCommit: string;
  readonly compilerBatch: {
    readonly relativePath: string;
    readonly sha256Hex: string;
  };
  readonly contracts: {
    readonly tracker: ContractIdentity;
    readonly duplicatePrevention: ContractIdentity;
    readonly sourceLock: ContractIdentity;
    readonly pooledReserve: ContractIdentity;
  };
  readonly currentErgoHeight: number;
  readonly transactionShape: {
    readonly protectedInputIndices: readonly [0, 1];
    readonly reserveInputIndex: 0;
    readonly duplicatePreventionInputIndex: 1;
    readonly externalFeeInputIndex: 2;
    readonly trackerDataInputIndex: 0;
    readonly reserveOutputIndex: 0;
    readonly duplicatePreventionOutputIndex: 1;
    readonly payoutOutputIndex: 2;
    readonly externalFeeOutputIndex: 3;
  };
  readonly bindings: {
    readonly familyIdHex: string;
    readonly sourceNetworkIdHex: string;
    readonly sidechainIdHex: string;
    readonly bridgeAddressHex: string;
    readonly tokenAddressHex: string;
    readonly runtimeProfileIdHex: string;
    readonly settlementProfileIdHex: string;
    readonly federationProfileIdHex: string;
    readonly ergoAdmissionKeySetDigestHex: string;
    readonly ergoAdmissionThreshold: number;
    readonly federationEpoch: string;
    readonly trackerNftIdHex: string;
    readonly duplicatePreventionNftIdHex: string;
    readonly pooledReserveNftIdHex: string;
    readonly trackerKeyHex: string;
    readonly trackerValueHex: string;
    readonly trackerInputDigestHex: string;
    readonly burnLeafHex: string;
    readonly burnIdHex: string;
    readonly bridgeEventRootHex: string;
    readonly burnLeafCount: number;
    readonly proofBundleHex: string;
    readonly amountNanoErg: string;
    readonly recipientErgoTreeHex: string;
    readonly anchorHeaderHeight: number;
    readonly requiredAnchorDepth: number;
  };
  readonly eip12UnsignedTransaction: Readonly<Record<string, unknown>>;
  readonly inputBoxSigmaHex: readonly [string, string, string];
  readonly dataInputBoxSigmaHex: readonly [string];
  readonly contextExtensions: readonly [
    SerializedContextExtension,
    SerializedContextExtension,
    SerializedContextExtension,
  ];
  readonly unsignedTransactionIdHex: string;
  readonly prooflessTransactionIdHex: string;
  readonly prooflessTransactionHex: string;
  readonly prooflessTransactionBytes: number;
  readonly boundaries: {
    readonly exactFed3bPacketConsumed: true;
    readonly syntheticSettlementPredecessorsConstructed: true;
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

interface ContractIdentity {
  readonly contractIdHex: string;
  readonly propositionHex: string;
  readonly propositionSha256Hex: string;
  readonly propositionBytes: number;
}

interface SerializedContextExtension {
  readonly keys: readonly number[];
  readonly serializedHex: string;
  readonly serializedBlake2b256Hex: string;
}

const COMPILER_BATCH_RELATIVE_PATH =
  'relayer/test-vectors/substrate-federated-v1-settlement-family-compiler-v1.json';
const SIGMASTATE_COMMIT = 'f78deadd668f801e7fae3bc884283f79c6f484fa';
const REQUIRED_ANCHOR_DEPTH = 10;

export function buildSubstrateFederatedBurnSettlementV1AcceptanceFixture():
Promise<Readonly<SubstrateFederatedBurnSettlementV1AcceptanceFixture>> {
  return buildFixture();
}

async function buildFixture(): Promise<Readonly<
SubstrateFederatedBurnSettlementV1AcceptanceFixture
>> {
  assertCompilerBatch();
  const input = await buildSubstrateFederatedBurnSettlementV1FixtureInput();
  const packet = await buildSubstrateFederatedBurnSettlementV1(input);
  const profile = decodeSubstrateFederatedSettlementFamilyV1Profile(
    input.familyIdentity.profile,
  );
  const wasmModule = await import('ergo-lib-wasm-nodejs');
  const wasm = wasmModule.default ?? wasmModule;
  const eip12UnsignedTransaction = canonicalUnsignedShape(packet);
  let unsigned: any;
  let unsignedId: any;
  let proofless: any;
  let prooflessId: any;
  try {
    unsigned = wasm.UnsignedTransaction.from_json(
      JSON.stringify(eip12UnsignedTransaction),
    );
    if (
      canonicalJson(unsigned.to_js_eip12())
      !== canonicalJson(eip12UnsignedTransaction)
    ) {
      throw new Error('WASM changed the exact federated unsigned transaction');
    }
    const contextExtensions = serializeInputExtensions(wasm, unsigned);
    unsignedId = unsigned.id();
    const unsignedTransactionIdHex =
      String(unsignedId.to_str()).toLowerCase();
    if (unsignedTransactionIdHex !== packet.transaction.txId) {
      throw new Error('federated unsigned transaction ID drifted');
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
    const prooflessTransactionIdHex =
      String(prooflessId.to_str()).toLowerCase();
    const prooflessBytes = Buffer.from(proofless.sigma_serialize_bytes());
    if (
      prooflessTransactionIdHex !== unsignedTransactionIdHex
      || blake2b256Hex(prooflessBytes) !== unsignedTransactionIdHex
    ) {
      throw new Error('proofless transaction bytes differ from FED-3B');
    }

    const family = input.familyIdentity;
    return deepFreeze({
      schema: SUBSTRATE_FEDERATED_BURN_SETTLEMENT_V1_ACCEPTANCE_FIXTURE_SCHEMA,
      version: 1 as const,
      trustModel: 'federated_non_trustless' as const,
      sigmaStateCommit: SIGMASTATE_COMMIT,
      compilerBatch: {
        relativePath: COMPILER_BATCH_RELATIVE_PATH,
        sha256Hex:
          SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_COMPILER_BATCH_SHA256_HEX,
      },
      contracts: {
        tracker: contractIdentity(
          packet.boxes.trackerDataInput.ergoTree,
          profile.trackerContractIdHex,
        ),
        duplicatePrevention: contractIdentity(
          family.contracts.duplicatePrevention.receipt.propositionHex,
          family.contracts.duplicatePrevention.receipt.contractIdHex,
        ),
        sourceLock: contractIdentity(
          family.contracts.sourceLock.receipt.propositionHex,
          family.contracts.sourceLock.receipt.contractIdHex,
        ),
        pooledReserve: contractIdentity(
          family.contracts.pooledReserve.receipt.propositionHex,
          family.contracts.pooledReserve.receipt.contractIdHex,
        ),
      },
      currentErgoHeight: input.currentErgoHeight,
      transactionShape: {
        protectedInputIndices: [0, 1] as const,
        reserveInputIndex: 0 as const,
        duplicatePreventionInputIndex: 1 as const,
        externalFeeInputIndex: 2 as const,
        trackerDataInputIndex: 0 as const,
        reserveOutputIndex: 0 as const,
        duplicatePreventionOutputIndex: 1 as const,
        payoutOutputIndex: 2 as const,
        externalFeeOutputIndex: 3 as const,
      },
      bindings: {
        familyIdHex: packet.familyIdHex,
        sourceNetworkIdHex: profile.sourceNetworkIdHex,
        sidechainIdHex: profile.sidechainIdHex,
        bridgeAddressHex: profile.bridgeAddressHex,
        tokenAddressHex: profile.tokenAddressHex,
        runtimeProfileIdHex: profile.runtimeProfileIdHex,
        settlementProfileIdHex: profile.settlementProfileIdHex,
        federationProfileIdHex: profile.federationProfileIdHex,
        ergoAdmissionKeySetDigestHex: profile.ergoAdmissionKeySetDigestHex,
        ergoAdmissionThreshold: profile.ergoAdmissionThreshold,
        federationEpoch: profile.federationEpoch,
        trackerNftIdHex: profile.trackerNftIdHex,
        duplicatePreventionNftIdHex: profile.duplicatePreventionNftIdHex,
        pooledReserveNftIdHex: profile.pooledReserveNftIdHex,
        trackerKeyHex: packet.tracker.keyHex,
        trackerValueHex: packet.tracker.valueHex,
        trackerInputDigestHex: packet.tracker.inputDigestHex,
        burnLeafHex: packet.burn.leaf.encodedLeafHex,
        burnIdHex: packet.burn.leaf.burnIdHex,
        bridgeEventRootHex: packet.tracker.decodedValue.bridgeEventRootHex,
        burnLeafCount: packet.burn.leafCount,
        proofBundleHex: packet.proofBundleHex,
        amountNanoErg: packet.burn.leaf.amountNanoErg,
        recipientErgoTreeHex: packet.burn.recipientErgoTreeHex,
        anchorHeaderHeight: packet.tracker.decodedValue.anchorHeaderHeight,
        requiredAnchorDepth: REQUIRED_ANCHOR_DEPTH,
      },
      eip12UnsignedTransaction,
      inputBoxSigmaHex: [
        serializeBox(wasm, packet.boxes.reservePredecessor),
        serializeBox(wasm, packet.boxes.duplicatePreventionPredecessor),
        serializeBox(wasm, packet.boxes.feeFundingInput),
      ] as const,
      dataInputBoxSigmaHex: [
        serializeBox(wasm, packet.boxes.trackerDataInput),
      ] as const,
      contextExtensions,
      unsignedTransactionIdHex,
      prooflessTransactionIdHex,
      prooflessTransactionHex: prooflessBytes.toString('hex'),
      prooflessTransactionBytes: prooflessBytes.length,
      boundaries: {
        exactFed3bPacketConsumed: true as const,
        syntheticSettlementPredecessorsConstructed: true as const,
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
  } finally {
    prooflessId?.free?.();
    proofless?.free?.();
    unsignedId?.free?.();
    unsigned?.free?.();
  }
}

function canonicalUnsignedShape(
  packet: Readonly<SubstrateFederatedBurnSettlementV1Packet>,
): Readonly<Record<string, unknown>> {
  return deepFreeze({
    inputs: packet.transaction.eip12Tx.inputs.map(input => ({
      boxId: input.boxId,
      extension: input.extension,
    })),
    dataInputs: packet.transaction.eip12Tx.dataInputs.map(input => ({
      boxId: input.boxId,
    })),
    outputs: packet.transaction.eip12Tx.outputs.map(output => ({
      value: String(output.value),
      ergoTree: output.ergoTree,
      assets: (output.assets ?? []).map(asset => ({
        tokenId: asset.tokenId,
        amount: String(asset.amount),
      })),
      additionalRegisters: output.additionalRegisters ?? {},
      creationHeight: output.creationHeight,
    })),
  });
}

function serializeInputExtensions(
  wasm: any,
  unsigned: any,
): readonly [
  SerializedContextExtension,
  SerializedContextExtension,
  SerializedContextExtension,
] {
  const inputs = unsigned.inputs();
  const output: SerializedContextExtension[] = [];
  try {
    for (let index = 0; index < inputs.len(); index += 1) {
      const item = inputs.get(index);
      const extension = item.extension();
      try {
        const keys = [...extension.keys()];
        const expected = index === 1 ? [0, 1, 2, 3] : [];
        if (
          keys.length !== expected.length
          || keys.some((key, keyIndex) => key !== expected[keyIndex])
        ) {
          throw new Error(
            `federated settlement input ${index} ContextExtension keys drifted`,
          );
        }
        const serialized = Buffer.from(extension.sigma_serialize_bytes());
        output.push(Object.freeze({
          keys: Object.freeze(keys),
          serializedHex: serialized.toString('hex'),
          serializedBlake2b256Hex: blake2b256Hex(serialized),
        }));
      } finally {
        extension.free?.();
        item.free?.();
      }
    }
  } finally {
    inputs.free?.();
  }
  if (output.length !== 3) {
    throw new Error('federated settlement transaction must contain three inputs');
  }
  return Object.freeze(output) as unknown as readonly [
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

function contractIdentity(
  propositionHex: string,
  expectedContractIdHex: string,
): ContractIdentity {
  const bytes = Buffer.from(propositionHex, 'hex');
  const contractIdHex = blake2b256Hex(bytes);
  if (contractIdHex !== expectedContractIdHex.replace(/^0x/, '')) {
    throw new Error('federated contract ID drifted');
  }
  return Object.freeze({
    contractIdHex,
    propositionHex,
    propositionSha256Hex:
      createHash('sha256').update(bytes).digest('hex'),
    propositionBytes: bytes.length,
  });
}

function assertCompilerBatch(): void {
  const bytes = readFileSync(new URL(
    '../test-vectors/substrate-federated-v1-settlement-family-compiler-v1.json',
    import.meta.url,
  ));
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (
    digest
    !== SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_COMPILER_BATCH_SHA256_HEX
  ) {
    throw new Error('federated settlement compiler batch bytes drifted');
  }
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
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}
