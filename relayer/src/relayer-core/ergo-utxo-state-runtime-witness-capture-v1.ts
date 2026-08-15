import {
  decodeErgoScorexTransactionRuntimeWitnessV1,
  type ErgoScorexTransactionRuntimeParserProfileV1,
} from '../ergo-settlement-core/ergo-scorex-transaction-runtime-witness-v1.js';
import {
  decodeErgoUtxoStateRuntimeWitnessV1,
  encodeErgoUtxoStateRuntimeWitnessV1,
} from '../ergo-settlement-core/ergo-utxo-state-runtime-witness-v1.js';
import {
  computeErgoHeaderId,
  parseErgoAutolykosV2HeaderIdentity,
  serializeErgoHeaderIdentity,
} from '../ergo-settlement-core/ergo-header-id.js';
import {
  sha256Bytes,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';

export const ERGO_UTXO_STATE_RUNTIME_WITNESS_CAPTURE_V1_SCHEMA =
  'e2s.ergo-utxo-state-runtime-witness-capture.v1' as const;
export const ERGO_UTXO_STATE_RUNTIME_WITNESS_CAPTURE_V1_STATUS =
  'NON_AUTHORIZING_STABLE_SUPPLIED_TIP_UTXO_PROOF_CAPTURED' as const;
export const ERGO_UTXO_STATE_RUNTIME_WITNESS_CAPTURE_V1_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:ergo-utxo-state-runtime-witness-capture:v1' as const;

const CAPTURES = new WeakSet<object>();

export interface ComposeErgoUtxoStateRuntimeWitnessCaptureV1Input {
  readonly targetHeaderBytes: Uint8Array;
  readonly transactionWitnessBytes: Uint8Array;
  readonly expectedTransactionProfile: ErgoScorexTransactionRuntimeParserProfileV1;
  readonly currentTipBeforeHeaderBytes: Uint8Array;
  readonly boxesBinaryProofBytes: Uint8Array;
  readonly currentTipAfterHeaderBytes: Uint8Array;
}

export interface ErgoUtxoStateRuntimeWitnessCaptureV1 {
  readonly schema: typeof ERGO_UTXO_STATE_RUNTIME_WITNESS_CAPTURE_V1_SCHEMA;
  readonly status: typeof ERGO_UTXO_STATE_RUNTIME_WITNESS_CAPTURE_V1_STATUS;
  readonly targetHeader: Readonly<{
    headerIdHex: string;
    height: number;
    canonicalHeaderBytesHex: string;
    stateRootHex: string;
    transactionsRootHex: string;
  }>;
  readonly lookup: Readonly<{
    orderedBoxIdsHex: readonly [string, string];
    vaultBoxIdHex: string;
    refundableSourceBoxIdHex: string;
    expectedVaultBoxLength: number;
    expectedVaultBoxSha256Hex: string;
    proofLength: number;
    proofSha256Hex: string;
  }>;
  readonly witness: Readonly<{
    bytesHex: string;
    witnessIdHex: string;
  }>;
  readonly checks: Readonly<{
    targetHeaderCanonicalBytesVerified: true;
    transactionRootAndVersionMatched: true;
    lookupKeysAndVaultValueDerivedFromTransaction: true;
    suppliedTipBeforeMatchedExactTarget: true;
    suppliedTipAfterMatchedExactTarget: true;
    suppliedTipStateLookupsVerified: true;
  }>;
  readonly authority: Readonly<{
    nodeObservationAdapterProvenanceEstablished: false;
    checkpointExternallyAuthenticated: false;
    completeCompetingBranchKnowledgeEstablished: false;
    globallyCanonicalErgoConsensusAccepted: false;
    deterministicFinalityEstablished: false;
    currentUtxoMembershipEstablished: false;
    transactionExecutionValidated: false;
    runtimeAdmissionAuthorized: false;
    mintAuthorized: false;
    fundsAuthorityEstablished: false;
    gate5Closed: false;
    productionReady: false;
  }>;
  readonly captureDigestHex: string;
}

/**
 * Verifies one exact before/proof/after tuple supplied by an observation port.
 * Adapter provenance is deliberately separate from this pure composition.
 */
export function composeErgoUtxoStateRuntimeWitnessCaptureV1(
  value: ComposeErgoUtxoStateRuntimeWitnessCaptureV1Input,
): Readonly<ErgoUtxoStateRuntimeWitnessCaptureV1> {
  const input = exactDataObject(value, [
    'targetHeaderBytes',
    'transactionWitnessBytes',
    'expectedTransactionProfile',
    'currentTipBeforeHeaderBytes',
    'boxesBinaryProofBytes',
    'currentTipAfterHeaderBytes',
  ], 'Ergo UTXO runtime witness capture input');
  const targetHeaderBytes = exactBytes(input.targetHeaderBytes, 'target header');
  const currentTipBeforeHeaderBytes = exactBytes(
    input.currentTipBeforeHeaderBytes,
    'current tip before UTXO proof',
  );
  const proof = exactBytes(input.boxesBinaryProofBytes, 'Ergo boxes binary proof');
  const currentTipAfterHeaderBytes = exactBytes(
    input.currentTipAfterHeaderBytes,
    'current tip after UTXO proof',
  );
  const targetHeader = parseErgoAutolykosV2HeaderIdentity(targetHeaderBytes);
  if (!serializeErgoHeaderIdentity(targetHeader).equals(targetHeaderBytes)) {
    throw new Error('target header bytes are not canonical');
  }
  const targetHeaderIdHex = computeErgoHeaderId(targetHeader).toString('hex');
  const transaction = decodeErgoScorexTransactionRuntimeWitnessV1(
    exactBytes(input.transactionWitnessBytes, 'transaction runtime witness'),
    input.expectedTransactionProfile as ErgoScorexTransactionRuntimeParserProfileV1,
  );
  const targetTransactionsRootHex = Buffer.from(
    targetHeader.transactionsRoot,
  ).toString('hex');
  if (
    transaction.blockVersion !== targetHeader.version
    || transaction.targetTransactionsRootHex !== targetTransactionsRootHex
  ) {
    throw new Error('transaction runtime witness does not match the target header');
  }

  assertExactSuppliedTip(
    currentTipBeforeHeaderBytes,
    targetHeaderBytes,
    'before UTXO proof',
  );
  assertExactSuppliedTip(
    currentTipAfterHeaderBytes,
    targetHeaderBytes,
    'after UTXO proof',
  );
  const orderedBoxIdsHex = Object.freeze([
    transaction.vault.boxIdHex,
    transaction.source.boxIdHex,
  ]) as readonly [string, string];
  const witnessBytes = encodeErgoUtxoStateRuntimeWitnessV1({
    stateRootHex: Buffer.from(targetHeader.stateRoot).toString('hex'),
    vaultBoxIdHex: orderedBoxIdsHex[0],
    refundableSourceBoxIdHex: orderedBoxIdsHex[1],
    expectedVaultBoxHex: transaction.vault.serializedBytesHex,
    proofHex: proof.toString('hex'),
  });
  const witness = decodeErgoUtxoStateRuntimeWitnessV1(witnessBytes);
  const body = {
    schema: ERGO_UTXO_STATE_RUNTIME_WITNESS_CAPTURE_V1_SCHEMA,
    status: ERGO_UTXO_STATE_RUNTIME_WITNESS_CAPTURE_V1_STATUS,
    targetHeader: {
      headerIdHex: targetHeaderIdHex,
      height: targetHeader.height,
      canonicalHeaderBytesHex: targetHeaderBytes.toString('hex'),
      stateRootHex: witness.stateRootHex,
      transactionsRootHex: targetTransactionsRootHex,
    },
    lookup: {
      orderedBoxIdsHex,
      vaultBoxIdHex: witness.vaultBoxIdHex,
      refundableSourceBoxIdHex: witness.refundableSourceBoxIdHex,
      expectedVaultBoxLength: witness.expectedVaultBoxLength,
      expectedVaultBoxSha256Hex: witness.expectedVaultBoxSha256Hex,
      proofLength: witness.proofLength,
      proofSha256Hex: sha256Bytes(proof),
    },
    witness: {
      bytesHex: witnessBytes.toString('hex'),
      witnessIdHex: witness.witnessIdHex,
    },
    checks: {
      targetHeaderCanonicalBytesVerified: true as const,
      transactionRootAndVersionMatched: true as const,
      lookupKeysAndVaultValueDerivedFromTransaction: true as const,
      suppliedTipBeforeMatchedExactTarget: true as const,
      suppliedTipAfterMatchedExactTarget: true as const,
      suppliedTipStateLookupsVerified: true as const,
    },
    authority: {
      nodeObservationAdapterProvenanceEstablished: false as const,
      checkpointExternallyAuthenticated: false as const,
      completeCompetingBranchKnowledgeEstablished: false as const,
      globallyCanonicalErgoConsensusAccepted: false as const,
      deterministicFinalityEstablished: false as const,
      currentUtxoMembershipEstablished: false as const,
      transactionExecutionValidated: false as const,
      runtimeAdmissionAuthorized: false as const,
      mintAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
    },
  };
  const capture = deepFreeze({
    ...body,
    captureDigestHex: sha256CanonicalJson(
      body,
      ERGO_UTXO_STATE_RUNTIME_WITNESS_CAPTURE_V1_DIGEST_DOMAIN,
    ),
  });
  CAPTURES.add(capture);
  return capture;
}

export function assertErgoUtxoStateRuntimeWitnessCaptureV1Provenance(
  value: unknown,
): asserts value is Readonly<ErgoUtxoStateRuntimeWitnessCaptureV1> {
  if (typeof value !== 'object' || value === null || !CAPTURES.has(value)) {
    throw new Error('Ergo UTXO runtime witness capture lacks process provenance');
  }
}

function assertExactSuppliedTip(
  observed: Buffer,
  expected: Buffer,
  phase: string,
): void {
  const parsed = parseErgoAutolykosV2HeaderIdentity(observed);
  if (
    !serializeErgoHeaderIdentity(parsed).equals(observed)
    || !observed.equals(expected)
  ) {
    throw new Error(`supplied Ergo tip does not equal the exact target header ${phase}`);
  }
}

function exactDataObject(
  value: unknown,
  fields: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain data object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const symbolKeys = Object.getOwnPropertySymbols(value);
  const actualKeys = Object.getOwnPropertyNames(descriptors).sort();
  const expectedKeys = [...fields].sort();
  if (
    symbolKeys.length !== 0
    || actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(`${label} must contain exactly ${fields.join(', ')}`);
  }
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const descriptor = descriptors[field]!;
    if (!('value' in descriptor) || descriptor.enumerable !== true) {
      throw new Error(`${label}.${field} must be an enumerable data property`);
    }
    result[field] = descriptor.value;
  }
  return result;
}

function exactBytes(value: unknown, label: string): Buffer {
  if (!(value instanceof Uint8Array)) throw new Error(`${label} must be bytes`);
  return Buffer.from(value);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (typeof value !== 'object' || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}
