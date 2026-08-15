import {
  computeErgoHeaderId,
  parseErgoAutolykosV2HeaderIdentity,
  serializeErgoHeaderIdentity,
} from '../ergo-settlement-core/ergo-header-id.js';
import {
  computeErgoScorexTransactionRuntimeParserProfileIdV1Hex,
  decodeErgoScorexTransactionRuntimeWitnessV1,
  ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_MAX_BYTES,
  type ErgoScorexTransactionRuntimeParserProfileV1,
} from '../ergo-settlement-core/ergo-scorex-transaction-runtime-witness-v1.js';
import {
  decodeErgoUtxoStateRuntimeWitnessV1,
} from '../ergo-settlement-core/ergo-utxo-state-runtime-witness-v1.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import {
  assertErgoUtxoStateRuntimeWitnessCaptureV1Provenance,
  composeErgoUtxoStateRuntimeWitnessCaptureV1,
  type ErgoUtxoStateRuntimeWitnessCaptureV1,
} from './ergo-utxo-state-runtime-witness-capture-v1.js';

export const ERGO_UTXO_STATE_RUNTIME_WITNESS_RETAINED_PACKET_V1_SCHEMA =
  'e2s.ergo-utxo-state-runtime-witness-retained-packet.v1' as const;
export const ERGO_UTXO_STATE_RUNTIME_WITNESS_RETAINED_PACKET_V1_FORMAT = 1 as const;
export const ERGO_UTXO_STATE_RUNTIME_WITNESS_RETAINED_PACKET_V1_STATUS =
  'NON_AUTHORIZING_RETAINED_UTXO_WITNESS_BYTES' as const;
export const ERGO_UTXO_STATE_RUNTIME_WITNESS_RETAINED_PACKET_V1_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:ergo-utxo-state-runtime-witness-retained-packet:v1' as const;

const MAX_CANONICAL_HEADER_BYTES = 4 * 1024;
const MAX_UTXO_WITNESS_BYTES = 32 * 1024;
const MAX_PROFILE_TREE_BYTES = 4 * 1024;
const MAX_PACKET_JSON_BYTES = 1024 * 1024;
const REPLAYS = new WeakSet<object>();

export interface ErgoUtxoStateRuntimeWitnessRetainedPacketV1 {
  readonly schema:
    typeof ERGO_UTXO_STATE_RUNTIME_WITNESS_RETAINED_PACKET_V1_SCHEMA;
  readonly formatVersion:
    typeof ERGO_UTXO_STATE_RUNTIME_WITNESS_RETAINED_PACKET_V1_FORMAT;
  readonly status:
    typeof ERGO_UTXO_STATE_RUNTIME_WITNESS_RETAINED_PACKET_V1_STATUS;
  readonly targetHeaderIdHex: string;
  readonly targetHeaderBytesHex: string;
  readonly transactionParserProfileIdHex: string;
  readonly expectedTransactionProfile:
    Readonly<ErgoScorexTransactionRuntimeParserProfileV1>;
  readonly transactionWitnessIdHex: string;
  readonly transactionWitnessBytesHex: string;
  readonly utxoWitnessIdHex: string;
  readonly utxoWitnessBytesHex: string;
  readonly sourceCaptureDigestHex: string;
  readonly authority: Readonly<{
    nodeObservationProvenancePersisted: false;
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
  readonly packetDigestHex: string;
}

export interface BuildErgoUtxoStateRuntimeWitnessRetainedPacketV1Input {
  readonly capture: Readonly<ErgoUtxoStateRuntimeWitnessCaptureV1>;
  readonly transactionWitnessBytes: Uint8Array;
  readonly expectedTransactionProfile: ErgoScorexTransactionRuntimeParserProfileV1;
}

export interface ReplayedErgoUtxoStateRuntimeWitnessRetainedPacketV1 {
  readonly schema: 'e2s.ergo-utxo-state-runtime-witness-retained-replay.v1';
  readonly status: 'NON_AUTHORIZING_RETAINED_UTXO_WITNESS_REPLAYED';
  readonly packet: Readonly<ErgoUtxoStateRuntimeWitnessRetainedPacketV1>;
  readonly capture: Readonly<ErgoUtxoStateRuntimeWitnessCaptureV1>;
  readonly checks: Readonly<{
    packetDigestVerified: true;
    targetHeaderCanonicalBytesVerified: true;
    transactionWitnessReplayed: true;
    utxoWitnessReplayed: true;
    captureDigestReproduced: true;
  }>;
  readonly authority: ErgoUtxoStateRuntimeWitnessRetainedPacketV1['authority'];
}

interface DerivedPacket {
  readonly body: Omit<ErgoUtxoStateRuntimeWitnessRetainedPacketV1, 'packetDigestHex'>;
  readonly capture: Readonly<ErgoUtxoStateRuntimeWitnessCaptureV1>;
}

export function buildErgoUtxoStateRuntimeWitnessRetainedPacketV1(
  value: BuildErgoUtxoStateRuntimeWitnessRetainedPacketV1Input,
): Readonly<ErgoUtxoStateRuntimeWitnessRetainedPacketV1> {
  const input = exactDataObject(value, [
    'capture',
    'transactionWitnessBytes',
    'expectedTransactionProfile',
  ], 'retained UTXO witness packet input');
  const capture = input.capture as Readonly<ErgoUtxoStateRuntimeWitnessCaptureV1>;
  assertErgoUtxoStateRuntimeWitnessCaptureV1Provenance(capture);
  const transactionWitnessBytes = exactBytes(
    input.transactionWitnessBytes,
    ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_MAX_BYTES,
    'transaction runtime witness',
  );
  const expectedTransactionProfile = normalizeTransactionProfileInput(
    input.expectedTransactionProfile,
  );
  const targetHeaderBytes = lowerHexBytes(
    capture.targetHeader.canonicalHeaderBytesHex,
    MAX_CANONICAL_HEADER_BYTES,
    'capture target header bytes',
  );
  const utxoWitnessBytes = lowerHexBytes(
    capture.witness.bytesHex,
    MAX_UTXO_WITNESS_BYTES,
    'capture UTXO witness bytes',
  );
  const derived = derivePacket(
    targetHeaderBytes,
    transactionWitnessBytes,
    expectedTransactionProfile,
    utxoWitnessBytes,
    capture.captureDigestHex,
  );
  if (
    derived.capture.targetHeader.canonicalHeaderBytesHex
      !== capture.targetHeader.canonicalHeaderBytesHex
    || derived.capture.witness.bytesHex !== capture.witness.bytesHex
    || derived.capture.captureDigestHex !== capture.captureDigestHex
  ) {
    throw new Error('retained UTXO witness packet does not match the source capture');
  }
  return finalizePacket(derived.body);
}

export function normalizeErgoUtxoStateRuntimeWitnessRetainedPacketV1(
  value: unknown,
): Readonly<ErgoUtxoStateRuntimeWitnessRetainedPacketV1> {
  const raw = exactDataObject(value, [
    'schema',
    'formatVersion',
    'status',
    'targetHeaderIdHex',
    'targetHeaderBytesHex',
    'transactionParserProfileIdHex',
    'expectedTransactionProfile',
    'transactionWitnessIdHex',
    'transactionWitnessBytesHex',
    'utxoWitnessIdHex',
    'utxoWitnessBytesHex',
    'sourceCaptureDigestHex',
    'authority',
    'packetDigestHex',
  ], 'retained UTXO witness packet');
  const targetHeaderBytes = lowerHexBytes(
    raw.targetHeaderBytesHex,
    MAX_CANONICAL_HEADER_BYTES,
    'retained target header bytes',
  );
  const transactionWitnessBytes = lowerHexBytes(
    raw.transactionWitnessBytesHex,
    ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_MAX_BYTES,
    'retained transaction witness bytes',
  );
  const expectedTransactionProfile = normalizeStoredTransactionProfile(
    raw.expectedTransactionProfile,
  );
  const utxoWitnessBytes = lowerHexBytes(
    raw.utxoWitnessBytesHex,
    MAX_UTXO_WITNESS_BYTES,
    'retained UTXO witness bytes',
  );
  const sourceCaptureDigestHex = exactLowerHex(
    raw.sourceCaptureDigestHex,
    32,
    'source capture digest',
  );
  const derived = derivePacket(
    targetHeaderBytes,
    transactionWitnessBytes,
    expectedTransactionProfile,
    utxoWitnessBytes,
    sourceCaptureDigestHex,
  );
  const normalizedBody = normalizePacketBody(raw);
  if (canonicalJson(normalizedBody) !== canonicalJson(derived.body)) {
    throw new Error('retained UTXO witness packet derived fields drifted');
  }
  const packetDigestHex = exactLowerHex(
    raw.packetDigestHex,
    32,
    'retained packet digest',
  );
  const expectedDigestHex = sha256CanonicalJson(
    derived.body,
    ERGO_UTXO_STATE_RUNTIME_WITNESS_RETAINED_PACKET_V1_DIGEST_DOMAIN,
  );
  if (packetDigestHex !== expectedDigestHex) {
    throw new Error('retained UTXO witness packet digest mismatch');
  }
  const packet = deepFreeze({ ...derived.body, packetDigestHex });
  if (Buffer.byteLength(canonicalJson(packet), 'utf8') > MAX_PACKET_JSON_BYTES) {
    throw new Error('retained UTXO witness packet exceeds its JSON byte bound');
  }
  return packet;
}

export function replayErgoUtxoStateRuntimeWitnessRetainedPacketV1(
  value: unknown,
): Readonly<ReplayedErgoUtxoStateRuntimeWitnessRetainedPacketV1> {
  const packet = normalizeErgoUtxoStateRuntimeWitnessRetainedPacketV1(value);
  const derived = derivePacket(
    Buffer.from(packet.targetHeaderBytesHex, 'hex'),
    Buffer.from(packet.transactionWitnessBytesHex, 'hex'),
    packet.expectedTransactionProfile,
    Buffer.from(packet.utxoWitnessBytesHex, 'hex'),
    packet.sourceCaptureDigestHex,
  );
  const replay = deepFreeze({
    schema: 'e2s.ergo-utxo-state-runtime-witness-retained-replay.v1' as const,
    status: 'NON_AUTHORIZING_RETAINED_UTXO_WITNESS_REPLAYED' as const,
    packet,
    capture: derived.capture,
    checks: {
      packetDigestVerified: true as const,
      targetHeaderCanonicalBytesVerified: true as const,
      transactionWitnessReplayed: true as const,
      utxoWitnessReplayed: true as const,
      captureDigestReproduced: true as const,
    },
    authority: packet.authority,
  });
  REPLAYS.add(replay);
  return replay;
}

export function assertErgoUtxoStateRuntimeWitnessRetainedReplayV1Provenance(
  value: unknown,
): asserts value is Readonly<ReplayedErgoUtxoStateRuntimeWitnessRetainedPacketV1> {
  if (typeof value !== 'object' || value === null || !REPLAYS.has(value)) {
    throw new Error('retained UTXO witness replay lacks process provenance');
  }
}

function derivePacket(
  targetHeaderBytes: Buffer,
  transactionWitnessBytes: Buffer,
  expectedTransactionProfile: ErgoScorexTransactionRuntimeParserProfileV1,
  utxoWitnessBytes: Buffer,
  sourceCaptureDigestValue: unknown,
): DerivedPacket {
  const targetHeader = parseErgoAutolykosV2HeaderIdentity(targetHeaderBytes);
  if (!serializeErgoHeaderIdentity(targetHeader).equals(targetHeaderBytes)) {
    throw new Error('retained target header bytes are not canonical');
  }
  const transaction = decodeErgoScorexTransactionRuntimeWitnessV1(
    transactionWitnessBytes,
    expectedTransactionProfile,
  );
  const utxo = decodeErgoUtxoStateRuntimeWitnessV1(utxoWitnessBytes);
  if (
    transaction.blockVersion !== targetHeader.version
    || transaction.targetTransactionsRootHex
      !== Buffer.from(targetHeader.transactionsRoot).toString('hex')
  ) {
    throw new Error('retained transaction witness does not match the target header');
  }
  if (utxo.stateRootHex !== Buffer.from(targetHeader.stateRoot).toString('hex')) {
    throw new Error('retained UTXO witness does not match the target state root');
  }
  if (
    utxo.vaultBoxIdHex !== transaction.vault.boxIdHex
    || utxo.refundableSourceBoxIdHex !== transaction.source.boxIdHex
    || utxo.expectedVaultBoxHex !== transaction.vault.serializedBytesHex
  ) {
    throw new Error('retained UTXO witness does not match the transaction transition');
  }
  const capture = composeErgoUtxoStateRuntimeWitnessCaptureV1({
    targetHeaderBytes,
    transactionWitnessBytes,
    expectedTransactionProfile,
    currentTipBeforeHeaderBytes: targetHeaderBytes,
    boxesBinaryProofBytes: Buffer.from(utxo.proofHex, 'hex'),
    currentTipAfterHeaderBytes: targetHeaderBytes,
  });
  assertErgoUtxoStateRuntimeWitnessCaptureV1Provenance(capture);
  const sourceCaptureDigestHex = exactLowerHex(
    sourceCaptureDigestValue,
    32,
    'source capture digest',
  );
  if (capture.captureDigestHex !== sourceCaptureDigestHex) {
    throw new Error('retained UTXO witness source capture digest mismatch');
  }
  const profile = normalizeStoredTransactionProfile(expectedTransactionProfile);
  return {
    body: {
      schema: ERGO_UTXO_STATE_RUNTIME_WITNESS_RETAINED_PACKET_V1_SCHEMA,
      formatVersion: ERGO_UTXO_STATE_RUNTIME_WITNESS_RETAINED_PACKET_V1_FORMAT,
      status: ERGO_UTXO_STATE_RUNTIME_WITNESS_RETAINED_PACKET_V1_STATUS,
      targetHeaderIdHex: computeErgoHeaderId(targetHeader).toString('hex'),
      targetHeaderBytesHex: targetHeaderBytes.toString('hex'),
      transactionParserProfileIdHex:
        computeErgoScorexTransactionRuntimeParserProfileIdV1Hex(profile),
      expectedTransactionProfile: profile,
      transactionWitnessIdHex: transaction.witnessIdHex,
      transactionWitnessBytesHex: transactionWitnessBytes.toString('hex'),
      utxoWitnessIdHex: utxo.witnessIdHex,
      utxoWitnessBytesHex: utxoWitnessBytes.toString('hex'),
      sourceCaptureDigestHex,
      authority: falseAuthority(),
    },
    capture,
  };
}

function finalizePacket(
  body: Omit<ErgoUtxoStateRuntimeWitnessRetainedPacketV1, 'packetDigestHex'>,
): Readonly<ErgoUtxoStateRuntimeWitnessRetainedPacketV1> {
  return normalizeErgoUtxoStateRuntimeWitnessRetainedPacketV1({
    ...body,
    packetDigestHex: sha256CanonicalJson(
      body,
      ERGO_UTXO_STATE_RUNTIME_WITNESS_RETAINED_PACKET_V1_DIGEST_DOMAIN,
    ),
  });
}

function normalizePacketBody(
  raw: Record<string, unknown>,
): Omit<ErgoUtxoStateRuntimeWitnessRetainedPacketV1, 'packetDigestHex'> {
  if (raw.schema !== ERGO_UTXO_STATE_RUNTIME_WITNESS_RETAINED_PACKET_V1_SCHEMA) {
    throw new Error('retained UTXO witness packet schema is unsupported');
  }
  if (raw.formatVersion !== ERGO_UTXO_STATE_RUNTIME_WITNESS_RETAINED_PACKET_V1_FORMAT) {
    throw new Error('retained UTXO witness packet format is unsupported');
  }
  if (raw.status !== ERGO_UTXO_STATE_RUNTIME_WITNESS_RETAINED_PACKET_V1_STATUS) {
    throw new Error('retained UTXO witness packet status is unsupported');
  }
  return {
    schema: ERGO_UTXO_STATE_RUNTIME_WITNESS_RETAINED_PACKET_V1_SCHEMA,
    formatVersion: ERGO_UTXO_STATE_RUNTIME_WITNESS_RETAINED_PACKET_V1_FORMAT,
    status: ERGO_UTXO_STATE_RUNTIME_WITNESS_RETAINED_PACKET_V1_STATUS,
    targetHeaderIdHex: exactLowerHex(raw.targetHeaderIdHex, 32, 'target header ID'),
    targetHeaderBytesHex: exactLowerHexVariable(
      raw.targetHeaderBytesHex,
      MAX_CANONICAL_HEADER_BYTES,
      'target header bytes',
    ),
    transactionParserProfileIdHex: exactLowerHex(
      raw.transactionParserProfileIdHex,
      32,
      'transaction parser profile ID',
    ),
    expectedTransactionProfile: normalizeStoredTransactionProfile(
      raw.expectedTransactionProfile,
    ),
    transactionWitnessIdHex: exactLowerHex(
      raw.transactionWitnessIdHex,
      32,
      'transaction witness ID',
    ),
    transactionWitnessBytesHex: exactLowerHexVariable(
      raw.transactionWitnessBytesHex,
      ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_MAX_BYTES,
      'transaction witness bytes',
    ),
    utxoWitnessIdHex: exactLowerHex(raw.utxoWitnessIdHex, 32, 'UTXO witness ID'),
    utxoWitnessBytesHex: exactLowerHexVariable(
      raw.utxoWitnessBytesHex,
      MAX_UTXO_WITNESS_BYTES,
      'UTXO witness bytes',
    ),
    sourceCaptureDigestHex: exactLowerHex(
      raw.sourceCaptureDigestHex,
      32,
      'source capture digest',
    ),
    authority: normalizeFalseAuthority(raw.authority),
  };
}

function normalizeTransactionProfileInput(
  value: unknown,
): Readonly<ErgoScorexTransactionRuntimeParserProfileV1> {
  return normalizeTransactionProfile(value, true);
}

function normalizeStoredTransactionProfile(
  value: unknown,
): Readonly<ErgoScorexTransactionRuntimeParserProfileV1> {
  return normalizeTransactionProfile(value, false);
}

function normalizeTransactionProfile(
  value: unknown,
  allowHexPrefix: boolean,
): Readonly<ErgoScorexTransactionRuntimeParserProfileV1> {
  const raw = exactDataObject(value, [
    'routeProfileIdHex',
    'assetProfileIdHex',
    'sourceLockErgoTreeHex',
    'vaultErgoTreeHex',
    'changeErgoTreeHex',
  ], 'transaction parser profile');
  return deepFreeze({
    routeProfileIdHex: canonicalProfileHex(
      raw.routeProfileIdHex,
      32,
      32,
      'route profile ID',
      allowHexPrefix,
    ),
    assetProfileIdHex: canonicalProfileHex(
      raw.assetProfileIdHex,
      32,
      32,
      'asset profile ID',
      allowHexPrefix,
    ),
    sourceLockErgoTreeHex: canonicalProfileHex(
      raw.sourceLockErgoTreeHex,
      null,
      MAX_PROFILE_TREE_BYTES,
      'source-lock ErgoTree',
      allowHexPrefix,
    ),
    vaultErgoTreeHex: canonicalProfileHex(
      raw.vaultErgoTreeHex,
      null,
      MAX_PROFILE_TREE_BYTES,
      'vault ErgoTree',
      allowHexPrefix,
    ),
    changeErgoTreeHex: canonicalProfileHex(
      raw.changeErgoTreeHex,
      null,
      MAX_PROFILE_TREE_BYTES,
      'change ErgoTree',
      allowHexPrefix,
    ),
  });
}

function canonicalProfileHex(
  value: unknown,
  exactBytes: number | null,
  maximumBytes: number,
  label: string,
  allowHexPrefix: boolean,
): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be bounded canonical lowercase hexadecimal`);
  }
  const raw = allowHexPrefix && value.startsWith('0x') ? value.slice(2) : value;
  if (
    raw.length === 0
    || raw.length % 2 !== 0
    || raw.length > maximumBytes * 2
    || (exactBytes !== null && raw.length !== exactBytes * 2)
    || !/^[0-9a-f]+$/.test(raw)
  ) {
    throw new Error(`${label} must be bounded canonical lowercase hexadecimal`);
  }
  return raw;
}

function falseAuthority(): ErgoUtxoStateRuntimeWitnessRetainedPacketV1['authority'] {
  return deepFreeze({
    nodeObservationProvenancePersisted: false as const,
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
  });
}

function normalizeFalseAuthority(
  value: unknown,
): ErgoUtxoStateRuntimeWitnessRetainedPacketV1['authority'] {
  const expected = falseAuthority();
  const raw = exactDataObject(value, Object.keys(expected), 'retained packet authority');
  for (const key of Object.keys(expected)) {
    if (raw[key] !== false) {
      throw new Error(`retained packet authority ${key} must remain false`);
    }
  }
  return expected;
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

function exactBytes(value: unknown, maximum: number, label: string): Buffer {
  if (!(value instanceof Uint8Array)) throw new Error(`${label} must be bytes`);
  const bytes = Buffer.from(value);
  if (bytes.length === 0 || bytes.length > maximum) {
    throw new Error(`${label} length is outside its bound`);
  }
  return bytes;
}

function lowerHexBytes(value: unknown, maximum: number, label: string): Buffer {
  return Buffer.from(exactLowerHexVariable(value, maximum, label), 'hex');
}

function exactLowerHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || value.length !== bytes * 2
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be canonical ${bytes}-byte lowercase hexadecimal`);
  }
  return value;
}

function exactLowerHexVariable(
  value: unknown,
  maximumBytes: number,
  label: string,
): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || value.length > maximumBytes * 2
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be bounded canonical lowercase hexadecimal`);
  }
  return value;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (typeof value !== 'object' || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}
