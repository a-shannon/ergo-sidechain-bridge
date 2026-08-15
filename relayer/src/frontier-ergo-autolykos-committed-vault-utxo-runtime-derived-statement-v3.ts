import blakejs from 'blakejs';

import {
  decodeErgoAutolykosV2RelayRuntimeWitnessV1,
  deriveErgoAutolykosV2RelayRuntimeWitnessIdV1Hex,
  ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_FAMILY_ID_HEX,
} from './ergo-settlement-core/ergo-autolykos-v2-relay-runtime-witness-v1.js';
import {
  decodeErgoScorexTransactionRuntimeWitnessV1,
  ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_FAMILY_ID_HEX,
  type ErgoScorexTransactionRuntimeParserProfileV1,
} from './ergo-settlement-core/ergo-scorex-transaction-runtime-witness-v1.js';
import { computeErgoHeaderId } from './ergo-settlement-core/ergo-header-id.js';
import {
  replayErgoAutolykosV2RelayWitnessV1,
} from './ergo-settlement-core/ergo-autolykos-v2-relay-witness-v1.js';
import {
  decodeErgoUtxoStateRuntimeWitnessV1,
  ERGO_UTXO_STATE_RUNTIME_VERIFIER_PROFILE_V1_ID_HEX,
  ERGO_UTXO_STATE_RUNTIME_WITNESS_V1_FAMILY_ID_HEX,
} from './ergo-settlement-core/ergo-utxo-state-runtime-witness-v1.js';
import {
  buildFrontierErgoAutolykosCommittedVaultRuntimeStatementV2,
  FRONTIER_ERGO_AUTOLYKOS_SUPPLIED_BRANCH_POLICY_ID_V2_HEX,
} from './frontier-ergo-autolykos-committed-vault-runtime-derived-statement-v2.js';

export const FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_STATEMENT_V3_FORMAT =
  3 as const;
export const FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_STATEMENT_V3_SCHEMA =
  'e2s.frontier-ergo-autolykos-committed-vault-utxo-runtime-statement.v3' as const;
export const FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_STATEMENT_V3_BYTES =
  588;

const PROOF_SYSTEM_DOMAIN =
  'E2S_PEG_IN_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_DERIVED_PROOF_SYSTEM_V3';
const STATEMENT_PROFILE_DOMAIN =
  'E2S_PEG_IN_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_DERIVED_STATEMENT_PROFILE_V3';
const VERIFIER_PROFILE_DOMAIN =
  'E2S_PEG_IN_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_DERIVED_VERIFIER_V3';
const STATEMENT_ID_DOMAIN =
  'E2S_PEG_IN_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_DERIVED_STATEMENT_ID_V3';
const DIGEST_BYTES = 32;
const STATE_ROOT_BYTES = 33;
const MAX_VALUE_BYTES = 4 * 1024;
const MAX_PROOF_BYTES = 16 * 1024;

export const FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_PROOF_SYSTEM_ID_V3_HEX =
  hashDomain(PROOF_SYSTEM_DOMAIN);
export const FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_STATEMENT_PROFILE_ID_V3_HEX =
  hashDomain(STATEMENT_PROFILE_DOMAIN);
export const FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_VERIFIER_PROFILE_ID_V3_HEX =
  hashDomain(VERIFIER_PROFILE_DOMAIN);

export interface BuildFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3Input {
  readonly relayWitnessBytes: Uint8Array;
  readonly expectedSpvProfileIdHex: string;
  readonly transactionWitnessBytes: Uint8Array;
  readonly expectedTransactionProfile: ErgoScorexTransactionRuntimeParserProfileV1;
  readonly utxoWitnessBytes: Uint8Array;
}

export interface FrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3 {
  readonly formatVersion:
    typeof FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_STATEMENT_V3_FORMAT;
  readonly proofSystemIdHex: string;
  readonly statementProfileIdHex: string;
  readonly suppliedBranchPolicyIdHex: string;
  readonly verifierProfileIdHex: string;
  readonly relayFamilyIdHex: string;
  readonly relayWitnessIdHex: string;
  readonly transactionFamilyIdHex: string;
  readonly transactionWitnessIdHex: string;
  readonly baseRuntimeStatementV2IdHex: string;
  readonly utxoWitnessFamilyIdHex: string;
  readonly utxoWitnessIdHex: string;
  readonly utxoVerifierProfileIdHex: string;
  readonly targetHeaderIdHex: string;
  readonly targetStateRootHex: string;
  readonly vaultBoxIdHex: string;
  readonly refundableSourceBoxIdHex: string;
  readonly expectedVaultBoxSha256Hex: string;
  readonly expectedVaultBoxLength: number;
  readonly proofSha256Hex: string;
  readonly proofLength: number;
  readonly authorityFlags: 0;
}

export interface FrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementCandidateV3 {
  readonly schema:
    typeof FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_STATEMENT_V3_SCHEMA;
  readonly status: 'NON_AUTHORIZING_UTXO_RUNTIME_DERIVED_STATEMENT_BUILT';
  readonly statement: Readonly<FrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3>;
  readonly statementHex: string;
  readonly statementIdHex: string;
  readonly authority: Readonly<{
    suppliedStateRootLookupsVerified: true;
    checkpointExternallyAuthenticated: false;
    completeCompetingBranchKnowledgeEstablished: false;
    globallyCanonicalErgoConsensusAccepted: false;
    deterministicFinalityEstablished: false;
    sourceTransactionExecutionValidated: false;
    currentUtxoMembershipEstablished: false;
    runtimeStateMutationAuthorized: false;
    runtimeAdmissionAuthorized: false;
    mintAuthorized: false;
    fundsAuthorityEstablished: false;
    gate5Closed: false;
    productionReady: false;
  }>;
  readonly limitations: readonly string[];
}

export function buildFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3(
  value: BuildFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3Input,
): Readonly<FrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementCandidateV3> {
  const input = exactDataObject(value, [
    'relayWitnessBytes',
    'expectedSpvProfileIdHex',
    'transactionWitnessBytes',
    'expectedTransactionProfile',
    'utxoWitnessBytes',
  ], 'UTXO runtime-derived statement V3 input');
  const relayBytes = exactBytes(input.relayWitnessBytes, 'relay runtime witness');
  const transactionBytes = exactBytes(
    input.transactionWitnessBytes,
    'transaction runtime witness',
  );
  const utxoBytes = exactBytes(input.utxoWitnessBytes, 'UTXO runtime witness');
  const expectedSpvProfileIdHex = exactHexString(
    input.expectedSpvProfileIdHex,
    DIGEST_BYTES,
    'expected SPV profile ID',
  );
  const expectedTransactionProfile = input.expectedTransactionProfile as
    ErgoScorexTransactionRuntimeParserProfileV1;

  const baseV2 = buildFrontierErgoAutolykosCommittedVaultRuntimeStatementV2({
    relayWitnessBytes: relayBytes,
    expectedSpvProfileIdHex,
    transactionWitnessBytes: transactionBytes,
    expectedTransactionProfile,
  });
  const relay = decodeErgoAutolykosV2RelayRuntimeWitnessV1(
    relayBytes,
    expectedSpvProfileIdHex,
  );
  const replayedRelay = replayErgoAutolykosV2RelayWitnessV1(relay);
  const transaction = decodeErgoScorexTransactionRuntimeWitnessV1(
    transactionBytes,
    expectedTransactionProfile,
  );
  const utxo = decodeErgoUtxoStateRuntimeWitnessV1(utxoBytes);
  const targetHeaderIdHex = computeErgoHeaderId(
    replayedRelay.targetHeader,
  ).toString('hex');
  const targetStateRootHex = Buffer.from(
    replayedRelay.targetHeader.stateRoot,
  ).toString('hex');
  if (utxo.stateRootHex !== targetStateRootHex) {
    throw new Error('UTXO witness state root does not match the selected target header');
  }
  if (utxo.vaultBoxIdHex !== transaction.vault.boxIdHex) {
    throw new Error('UTXO witness vault key does not match the transaction witness');
  }
  if (utxo.refundableSourceBoxIdHex !== transaction.source.boxIdHex) {
    throw new Error('UTXO witness source key does not match the transaction witness');
  }
  if (utxo.expectedVaultBoxHex !== transaction.vault.serializedBytesHex) {
    throw new Error('UTXO witness vault value does not match the transaction witness');
  }

  const statement = deepFreeze({
    formatVersion:
      FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_STATEMENT_V3_FORMAT,
    proofSystemIdHex:
      FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_PROOF_SYSTEM_ID_V3_HEX,
    statementProfileIdHex:
      FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_STATEMENT_PROFILE_ID_V3_HEX,
    suppliedBranchPolicyIdHex: normalizeHex(
      FRONTIER_ERGO_AUTOLYKOS_SUPPLIED_BRANCH_POLICY_ID_V2_HEX,
    ),
    verifierProfileIdHex:
      FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_VERIFIER_PROFILE_ID_V3_HEX,
    relayFamilyIdHex: ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_FAMILY_ID_HEX,
    relayWitnessIdHex: deriveErgoAutolykosV2RelayRuntimeWitnessIdV1Hex(
      relayBytes,
      expectedSpvProfileIdHex,
    ),
    transactionFamilyIdHex:
      ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_FAMILY_ID_HEX,
    transactionWitnessIdHex: transaction.witnessIdHex,
    baseRuntimeStatementV2IdHex: normalizeHex(baseV2.statementIdHex),
    utxoWitnessFamilyIdHex: ERGO_UTXO_STATE_RUNTIME_WITNESS_V1_FAMILY_ID_HEX,
    utxoWitnessIdHex: utxo.witnessIdHex,
    utxoVerifierProfileIdHex:
      ERGO_UTXO_STATE_RUNTIME_VERIFIER_PROFILE_V1_ID_HEX,
    targetHeaderIdHex,
    targetStateRootHex: utxo.stateRootHex,
    vaultBoxIdHex: utxo.vaultBoxIdHex,
    refundableSourceBoxIdHex: utxo.refundableSourceBoxIdHex,
    expectedVaultBoxSha256Hex: utxo.expectedVaultBoxSha256Hex,
    expectedVaultBoxLength: utxo.expectedVaultBoxLength,
    proofSha256Hex: utxo.proofSha256Hex,
    proofLength: utxo.proofLength,
    authorityFlags: 0 as const,
  });
  const statementBytes = encodeFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3(
    statement,
  );
  const decoded = decodeFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3(
    statementBytes,
  );
  return deepFreeze({
    schema:
      FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_STATEMENT_V3_SCHEMA,
    status: 'NON_AUTHORIZING_UTXO_RUNTIME_DERIVED_STATEMENT_BUILT' as const,
    statement: decoded,
    statementHex: `0x${statementBytes.toString('hex')}`,
    statementIdHex:
      deriveFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementIdV3Hex(
        statementBytes,
      ),
    authority: {
      suppliedStateRootLookupsVerified: true as const,
      checkpointExternallyAuthenticated: false as const,
      completeCompetingBranchKnowledgeEstablished: false as const,
      globallyCanonicalErgoConsensusAccepted: false as const,
      deterministicFinalityEstablished: false as const,
      sourceTransactionExecutionValidated: false as const,
      currentUtxoMembershipEstablished: false as const,
      runtimeStateMutationAuthorized: false as const,
      runtimeAdmissionAuthorized: false as const,
      mintAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
    },
    limitations: [
      'The lookup proof is verified only against the exact supplied target-header state root; checkpoint trust and complete branch knowledge remain open.',
      'The base V2 statement binds the transaction transition, but source transaction execution and globally canonical Ergo consensus remain separate obligations.',
      'Production runtime consumers remain statically rejecting and no daemon, mint, signer, submitter, broadcaster, funds route, Gate 5, or readiness claim consumes this result.',
    ] as const,
  });
}

export function encodeFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3(
  value: FrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3,
): Buffer {
  const statement = normalizeStatement(value);
  const chunks: Buffer[] = [Buffer.from([statement.formatVersion])];
  for (const field of [
    'proofSystemIdHex',
    'statementProfileIdHex',
    'suppliedBranchPolicyIdHex',
    'verifierProfileIdHex',
    'relayFamilyIdHex',
    'relayWitnessIdHex',
    'transactionFamilyIdHex',
    'transactionWitnessIdHex',
    'baseRuntimeStatementV2IdHex',
    'utxoWitnessFamilyIdHex',
    'utxoWitnessIdHex',
    'utxoVerifierProfileIdHex',
    'targetHeaderIdHex',
  ] as const) {
    chunks.push(Buffer.from(statement[field], 'hex'));
  }
  chunks.push(
    Buffer.from(statement.targetStateRootHex, 'hex'),
    Buffer.from(statement.vaultBoxIdHex, 'hex'),
    Buffer.from(statement.refundableSourceBoxIdHex, 'hex'),
    Buffer.from(statement.expectedVaultBoxSha256Hex, 'hex'),
    u32(statement.expectedVaultBoxLength),
    Buffer.from(statement.proofSha256Hex, 'hex'),
    u32(statement.proofLength),
    u16(statement.authorityFlags),
  );
  const encoded = Buffer.concat(chunks);
  if (
    encoded.length
      !== FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_STATEMENT_V3_BYTES
  ) {
    throw new Error('UTXO runtime-derived statement V3 composition length drifted');
  }
  return encoded;
}

export function decodeFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3(
  value: Uint8Array,
): Readonly<FrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3> {
  const bytes = exactBytes(value, 'UTXO runtime-derived statement V3');
  if (
    bytes.length
      !== FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_STATEMENT_V3_BYTES
  ) {
    throw new Error('UTXO runtime-derived statement V3 length is invalid');
  }
  const reader = new BinaryReader(bytes);
  const statement = {
    formatVersion: reader.u8(),
    proofSystemIdHex: reader.hex(DIGEST_BYTES),
    statementProfileIdHex: reader.hex(DIGEST_BYTES),
    suppliedBranchPolicyIdHex: reader.hex(DIGEST_BYTES),
    verifierProfileIdHex: reader.hex(DIGEST_BYTES),
    relayFamilyIdHex: reader.hex(DIGEST_BYTES),
    relayWitnessIdHex: reader.hex(DIGEST_BYTES),
    transactionFamilyIdHex: reader.hex(DIGEST_BYTES),
    transactionWitnessIdHex: reader.hex(DIGEST_BYTES),
    baseRuntimeStatementV2IdHex: reader.hex(DIGEST_BYTES),
    utxoWitnessFamilyIdHex: reader.hex(DIGEST_BYTES),
    utxoWitnessIdHex: reader.hex(DIGEST_BYTES),
    utxoVerifierProfileIdHex: reader.hex(DIGEST_BYTES),
    targetHeaderIdHex: reader.hex(DIGEST_BYTES),
    targetStateRootHex: reader.hex(STATE_ROOT_BYTES),
    vaultBoxIdHex: reader.hex(DIGEST_BYTES),
    refundableSourceBoxIdHex: reader.hex(DIGEST_BYTES),
    expectedVaultBoxSha256Hex: reader.hex(DIGEST_BYTES),
    expectedVaultBoxLength: reader.u32(),
    proofSha256Hex: reader.hex(DIGEST_BYTES),
    proofLength: reader.u32(),
    authorityFlags: reader.u16(),
  };
  reader.end();
  const normalized = deepFreeze(normalizeStatement(statement));
  if (!encodeFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3(
    normalized,
  ).equals(bytes)) {
    throw new Error('UTXO runtime-derived statement V3 is not canonically encoded');
  }
  return normalized;
}

export function deriveFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementIdV3Hex(
  value: Uint8Array,
): string {
  const bytes = exactBytes(value, 'UTXO runtime-derived statement V3');
  if (
    bytes.length
      !== FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_STATEMENT_V3_BYTES
  ) {
    throw new Error('UTXO runtime-derived statement V3 length is invalid');
  }
  return hash(Buffer.concat([
    Buffer.from(STATEMENT_ID_DOMAIN, 'ascii'),
    bytes,
  ])).toString('hex');
}

export function assertFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3Matches(
  statementBytes: Uint8Array,
  input: BuildFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3Input,
): Readonly<FrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3> {
  const bytes = exactBytes(statementBytes, 'UTXO runtime-derived statement V3');
  const decoded = decodeFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3(
    bytes,
  );
  const expected = buildFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3(
    input,
  );
  if (!Buffer.from(expected.statementHex.slice(2), 'hex').equals(bytes)) {
    throw new Error(
      'UTXO runtime-derived statement V3 does not match the exact runtime witnesses',
    );
  }
  return decoded;
}

function normalizeStatement(
  value: unknown,
): FrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3 {
  const fields = [
    'formatVersion',
    'proofSystemIdHex',
    'statementProfileIdHex',
    'suppliedBranchPolicyIdHex',
    'verifierProfileIdHex',
    'relayFamilyIdHex',
    'relayWitnessIdHex',
    'transactionFamilyIdHex',
    'transactionWitnessIdHex',
    'baseRuntimeStatementV2IdHex',
    'utxoWitnessFamilyIdHex',
    'utxoWitnessIdHex',
    'utxoVerifierProfileIdHex',
    'targetHeaderIdHex',
    'targetStateRootHex',
    'vaultBoxIdHex',
    'refundableSourceBoxIdHex',
    'expectedVaultBoxSha256Hex',
    'expectedVaultBoxLength',
    'proofSha256Hex',
    'proofLength',
    'authorityFlags',
  ] as const;
  const raw = exactDataObject(value, fields, 'UTXO runtime-derived statement V3');
  const expectedStatic: Readonly<Record<string, string>> = {
    proofSystemIdHex:
      FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_PROOF_SYSTEM_ID_V3_HEX,
    statementProfileIdHex:
      FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_STATEMENT_PROFILE_ID_V3_HEX,
    suppliedBranchPolicyIdHex: normalizeHex(
      FRONTIER_ERGO_AUTOLYKOS_SUPPLIED_BRANCH_POLICY_ID_V2_HEX,
    ),
    verifierProfileIdHex:
      FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_VERIFIER_PROFILE_ID_V3_HEX,
    relayFamilyIdHex: ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_FAMILY_ID_HEX,
    transactionFamilyIdHex:
      ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_FAMILY_ID_HEX,
    utxoWitnessFamilyIdHex: ERGO_UTXO_STATE_RUNTIME_WITNESS_V1_FAMILY_ID_HEX,
    utxoVerifierProfileIdHex:
      ERGO_UTXO_STATE_RUNTIME_VERIFIER_PROFILE_V1_ID_HEX,
  };
  if (
    raw.formatVersion
      !== FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_UTXO_RUNTIME_STATEMENT_V3_FORMAT
  ) {
    throw new Error('UTXO runtime-derived statement V3 format is unsupported');
  }
  const normalized: Record<string, unknown> = { formatVersion: raw.formatVersion };
  for (const field of fields.slice(1, 18)) {
    const expectedBytes = field === 'targetStateRootHex'
      ? STATE_ROOT_BYTES
      : DIGEST_BYTES;
    normalized[field] = exactHexString(raw[field], expectedBytes, field);
  }
  normalized.proofSha256Hex = exactHexString(
    raw.proofSha256Hex,
    DIGEST_BYTES,
    'proofSha256Hex',
  );
  for (const [field, expected] of Object.entries(expectedStatic)) {
    if (normalized[field] !== expected) {
      throw new Error(`UTXO runtime-derived statement V3 ${field} is unsupported`);
    }
  }
  const expectedVaultBoxLength = boundedU32(
    raw.expectedVaultBoxLength,
    MAX_VALUE_BYTES,
    'expected vault box length',
  );
  const proofLength = boundedU32(raw.proofLength, MAX_PROOF_BYTES, 'proof length');
  if (raw.authorityFlags !== 0) {
    throw new Error('UTXO runtime-derived statement V3 authority flags must be zero');
  }
  return {
    ...(normalized as Omit<
      FrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3,
      'expectedVaultBoxLength' | 'proofLength' | 'authorityFlags'
    >),
    expectedVaultBoxLength,
    proofLength,
    authorityFlags: 0,
  };
}

function boundedU32(value: unknown, maximum: number, label: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0 || Number(value) > maximum) {
    throw new Error(`UTXO runtime-derived statement V3 ${label} is outside its bound`);
  }
  return Number(value);
}

function exactDataObject(
  value: unknown,
  fields: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
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

function exactHexString(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hexadecimal`);
  const normalized = normalizeHex(value);
  if (normalized.length !== bytes * 2 || !/^[0-9a-f]+$/.test(normalized)) {
    throw new Error(`${label} has an invalid hexadecimal encoding`);
  }
  return normalized;
}

function normalizeHex(value: string): string {
  return value.startsWith('0x') ? value.slice(2) : value;
}

function hashDomain(value: string): string {
  return hash(Buffer.from(value, 'ascii')).toString('hex');
}

function hash(value: Uint8Array): Buffer {
  return Buffer.from(blakejs.blake2b(value, undefined, DIGEST_BYTES));
}

function u16(value: number): Buffer {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16BE(value);
  return bytes;
}

function u32(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}

class BinaryReader {
  private offset = 0;

  constructor(private readonly value: Buffer) {}

  u8(): number {
    return this.bytes(1)[0]!;
  }

  u16(): number {
    return this.bytes(2).readUInt16BE();
  }

  u32(): number {
    return this.bytes(4).readUInt32BE();
  }

  hex(length: number): string {
    return this.bytes(length).toString('hex');
  }

  bytes(length: number): Buffer {
    const end = this.offset + length;
    if (!Number.isSafeInteger(end) || length < 0 || end > this.value.length) {
      throw new Error('UTXO runtime-derived statement V3 is truncated');
    }
    const result = Buffer.from(this.value.subarray(this.offset, end));
    this.offset = end;
    return result;
  }

  end(): void {
    if (this.offset !== this.value.length) {
      throw new Error('UTXO runtime-derived statement V3 contains trailing bytes');
    }
  }
}
