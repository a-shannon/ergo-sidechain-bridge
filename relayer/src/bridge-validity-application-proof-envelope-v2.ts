import blakejs from 'blakejs';

import {
  BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES,
  EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES,
  assertEip0045BridgeApplicationStatementV2Matches,
} from './bridge-validity-application-statement-v2.js';
import {
  EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
} from './spv-tracker-validity-v2.js';
import {
  EIP0045_BRIDGE_VALIDITY_MAX_CONTRACT_PROPOSITION_BYTES,
  EIP0045_BRIDGE_VALIDITY_PROOF_CHUNK_BYTES,
  EIP0045_BRIDGE_VALIDITY_RAW_SEAL_BYTES,
} from './bridge-validity-proof-envelope-v1.js';
import {
  deriveEip0045ContractIdHex,
} from './bridge-validity-finality-statement-v2.js';

export const EIP0045_BRIDGE_APPLICATION_PROOF_ENVELOPE_V2_SCHEMA =
  'e2s.bridge-validity-application-proof-envelope.v2';
export const EIP0045_BRIDGE_APPLICATION_PROOF_ENVELOPE_V2_VERSION = 2;
export const EIP0045_BRIDGE_APPLICATION_CONSUMER_CHILD_ORDER = Object.freeze([
  'proofChunks',
  'applicationPayload',
  'programId',
  'profileId',
] as const);

type BinaryInput = Buffer | string;
type ProofChunksHex = readonly [string, string, string, string];

export interface Eip0045BridgeApplicationProofEnvelopeV2Input {
  readonly proofChunks: readonly BinaryInput[];
  readonly applicationPayload: BinaryInput;
  readonly programIdHex: string;
  readonly profileIdHex: string;
  readonly encodedStatement: BinaryInput;
  readonly chainDomainIdHex: string;
  readonly contractPropositionBytes: BinaryInput;
}

export interface Eip0045BridgeApplicationProofEnvelopeV2ExpectedContext {
  readonly chainDomainIdHex: string;
  readonly contractPropositionBytes: BinaryInput;
  readonly rawSealDigestHex: string;
}

export interface Eip0045BridgeApplicationProofEnvelopeV2 {
  readonly schema:
    typeof EIP0045_BRIDGE_APPLICATION_PROOF_ENVELOPE_V2_SCHEMA;
  readonly version: 2;
  readonly consumerAbi: {
    readonly proofChunksHex: ProofChunksHex;
    readonly applicationPayloadHex: string;
    readonly programIdHex: string;
    readonly profileIdHex: string;
  };
  readonly chainDomainIdHex: string;
  readonly contractIdHex: string;
  readonly encodedStatementHex: string;
  readonly statementDigestHex: string;
  readonly rawSealBytes: typeof EIP0045_BRIDGE_VALIDITY_RAW_SEAL_BYTES;
  readonly rawSealDigestHex: string;
  readonly trustBoundary: {
    readonly transportShapeValidated: true;
    readonly statementBindingValidated: true;
    readonly applicationBindingValidated: true;
    readonly rawSealDigestDerived: true;
    readonly proofValidityEstablished: false;
    readonly sourceFinalityEstablished: false;
    readonly profileActivated: false;
    readonly onChainAcceptanceEstablished: false;
    readonly fundsAuthorityEstablished: false;
  };
}

const TOP_LEVEL_KEYS = [
  'schema',
  'version',
  'consumerAbi',
  'chainDomainIdHex',
  'contractIdHex',
  'encodedStatementHex',
  'statementDigestHex',
  'rawSealBytes',
  'rawSealDigestHex',
  'trustBoundary',
] as const;
const CONSUMER_ABI_KEYS = [
  'proofChunksHex',
  'applicationPayloadHex',
  'programIdHex',
  'profileIdHex',
] as const;
const TRUST_BOUNDARY_KEYS = [
  'transportShapeValidated',
  'statementBindingValidated',
  'applicationBindingValidated',
  'rawSealDigestDerived',
  'proofValidityEstablished',
  'sourceFinalityEstablished',
  'profileActivated',
  'onChainAcceptanceEstablished',
  'fundsAuthorityEstablished',
] as const;

export function buildEip0045BridgeApplicationProofEnvelopeV2(
  input: Eip0045BridgeApplicationProofEnvelopeV2Input,
): Eip0045BridgeApplicationProofEnvelopeV2 {
  const proofChunksHex = normalizeProofChunks(input.proofChunks);
  const applicationPayload = exactBytes(
    input.applicationPayload,
    BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES,
    'bridge validity application payload V3',
  );
  const profileIdHex = exactHex(
    input.profileIdHex,
    32,
    'EIP-0045 application verifier profile ID',
  );
  if (
    profileIdHex
    !== EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX
  ) {
    throw new Error(
      'EIP-0045 bridge application preactivation profile mismatch',
    );
  }
  const programIdHex = exactHex(
    input.programIdHex,
    32,
    'EIP-0045 bridge application guest program ID',
  );
  if (programIdHex !== EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX) {
    throw new Error('EIP-0045 bridge application guest program mismatch');
  }
  const chainDomainIdHex = exactHex(
    input.chainDomainIdHex,
    32,
    'chain domain ID',
  );
  const contractPropositionBytes = variableBytes(
    input.contractPropositionBytes,
    'contract proposition bytes',
    EIP0045_BRIDGE_VALIDITY_MAX_CONTRACT_PROPOSITION_BYTES,
  );
  if (contractPropositionBytes.length === 0) {
    throw new Error('contract proposition bytes must be non-empty');
  }
  const contractIdHex =
    deriveEip0045ContractIdHex(contractPropositionBytes);
  const encodedStatement = exactBytes(
    input.encodedStatement,
    EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES,
    'encoded EIP-0045 bridge application statement V2',
  );
  const statement = assertEip0045BridgeApplicationStatementV2Matches(
    encodedStatement,
    {
      chainDomainIdHex,
      profileIdHex,
      programIdHex,
      contractIdHex,
      applicationPayload,
    },
  );
  const rawSeal = Buffer.concat(
    proofChunksHex.map(chunk => Buffer.from(chunk, 'hex')),
  );
  if (rawSeal.length !== EIP0045_BRIDGE_VALIDITY_RAW_SEAL_BYTES) {
    throw new Error('EIP-0045 bridge application raw seal length mismatch');
  }

  return deepFreeze({
    schema: EIP0045_BRIDGE_APPLICATION_PROOF_ENVELOPE_V2_SCHEMA,
    version: EIP0045_BRIDGE_APPLICATION_PROOF_ENVELOPE_V2_VERSION,
    consumerAbi: {
      proofChunksHex,
      applicationPayloadHex: applicationPayload.toString('hex'),
      programIdHex,
      profileIdHex,
    },
    chainDomainIdHex,
    contractIdHex,
    encodedStatementHex: statement.encodedStatementHex,
    statementDigestHex: statement.statementDigestHex,
    rawSealBytes: EIP0045_BRIDGE_VALIDITY_RAW_SEAL_BYTES,
    rawSealDigestHex: blake2b256(rawSeal).toString('hex'),
    trustBoundary: {
      transportShapeValidated: true as const,
      statementBindingValidated: true as const,
      applicationBindingValidated: true as const,
      rawSealDigestDerived: true as const,
      proofValidityEstablished: false as const,
      sourceFinalityEstablished: false as const,
      profileActivated: false as const,
      onChainAcceptanceEstablished: false as const,
      fundsAuthorityEstablished: false as const,
    },
  });
}

export function assertEip0045BridgeApplicationProofEnvelopeV2Matches(
  value: unknown,
  expected: Eip0045BridgeApplicationProofEnvelopeV2ExpectedContext,
): Eip0045BridgeApplicationProofEnvelopeV2 {
  const envelope = exactRecord(
    value,
    'EIP-0045 bridge application proof envelope V2',
  );
  exactKeys(
    envelope,
    TOP_LEVEL_KEYS,
    'EIP-0045 bridge application proof envelope V2',
  );
  if (
    envelope.schema
    !== EIP0045_BRIDGE_APPLICATION_PROOF_ENVELOPE_V2_SCHEMA
  ) {
    throw new Error(
      'unsupported EIP-0045 bridge application proof envelope schema',
    );
  }
  if (
    envelope.version
    !== EIP0045_BRIDGE_APPLICATION_PROOF_ENVELOPE_V2_VERSION
  ) {
    throw new Error(
      'unsupported EIP-0045 bridge application proof envelope version',
    );
  }
  const consumerAbi = exactRecord(
    envelope.consumerAbi,
    'EIP-0045 application consumer ABI',
  );
  exactKeys(
    consumerAbi,
    CONSUMER_ABI_KEYS,
    'EIP-0045 application consumer ABI',
  );
  if (!Array.isArray(consumerAbi.proofChunksHex)) {
    throw new Error(
      'EIP-0045 application consumer ABI proofChunksHex must be an array',
    );
  }
  const chainDomainIdHex = exactHex(
    envelope.chainDomainIdHex,
    32,
    'envelope chain domain ID',
  );
  if (
    chainDomainIdHex
    !== exactHex(expected.chainDomainIdHex, 32, 'expected chain domain ID')
  ) {
    throw new Error(
      'EIP-0045 bridge application envelope chain domain mismatch',
    );
  }
  const rebuilt = buildEip0045BridgeApplicationProofEnvelopeV2({
    proofChunks: consumerAbi.proofChunksHex.map((chunk, index) => {
      if (typeof chunk !== 'string') {
        throw new Error(
          `EIP-0045 application proof chunk ${index} must be hex`,
        );
      }
      return chunk;
    }),
    applicationPayload: requireString(
      consumerAbi.applicationPayloadHex,
      'applicationPayloadHex',
    ),
    programIdHex: requireString(consumerAbi.programIdHex, 'programIdHex'),
    profileIdHex: requireString(consumerAbi.profileIdHex, 'profileIdHex'),
    encodedStatement: requireString(
      envelope.encodedStatementHex,
      'encodedStatementHex',
    ),
    chainDomainIdHex,
    contractPropositionBytes: expected.contractPropositionBytes,
  });
  exactDerivedString(
    envelope.contractIdHex,
    rebuilt.contractIdHex,
    'contract ID',
  );
  exactDerivedString(
    envelope.statementDigestHex,
    rebuilt.statementDigestHex,
    'statement digest',
  );
  if (envelope.rawSealBytes !== rebuilt.rawSealBytes) {
    throw new Error(
      'EIP-0045 bridge application raw seal byte count mismatch',
    );
  }
  exactDerivedString(
    envelope.rawSealDigestHex,
    rebuilt.rawSealDigestHex,
    'raw seal digest',
  );
  if (
    rebuilt.rawSealDigestHex
    !== exactHex(expected.rawSealDigestHex, 32, 'expected raw seal digest')
  ) {
    throw new Error(
      'EIP-0045 bridge application expected raw seal digest mismatch',
    );
  }
  const trustBoundary = exactRecord(
    envelope.trustBoundary,
    'EIP-0045 application trust boundary',
  );
  exactKeys(
    trustBoundary,
    TRUST_BOUNDARY_KEYS,
    'EIP-0045 application trust boundary',
  );
  for (const key of TRUST_BOUNDARY_KEYS) {
    if (trustBoundary[key] !== rebuilt.trustBoundary[key]) {
      throw new Error(`EIP-0045 application trust boundary ${key} mismatch`);
    }
  }
  return rebuilt;
}

function normalizeProofChunks(value: readonly BinaryInput[]): ProofChunksHex {
  if (
    !Array.isArray(value)
    || value.length !== EIP0045_BRIDGE_VALIDITY_PROOF_CHUNK_BYTES.length
  ) {
    throw new Error(
      'EIP-0045 bridge application proof must contain exactly 4 chunks',
    );
  }
  return Object.freeze(value.map((chunk, index) => exactBytes(
    chunk,
    EIP0045_BRIDGE_VALIDITY_PROOF_CHUNK_BYTES[index],
    `proof chunk ${index}`,
  ).toString('hex'))) as unknown as ProofChunksHex;
}

function exactDerivedString(
  value: unknown,
  expected: string,
  label: string,
): void {
  if (value !== expected) {
    throw new Error(`EIP-0045 bridge application ${label} mismatch`);
  }
}

function exactRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} fields mismatch`);
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  return value;
}

function exactHex(value: unknown, expectedBytes: number, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]+$/.test(value)) {
    throw new Error(`${label} must be lowercase unprefixed hex`);
  }
  if (value.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes`);
  }
  return value;
}

function exactBytes(
  value: unknown,
  expectedBytes: number,
  label: string,
): Buffer {
  const bytes = Buffer.isBuffer(value)
    ? Buffer.from(value)
    : Buffer.from(exactHex(value, expectedBytes, label), 'hex');
  if (bytes.length !== expectedBytes) {
    throw new Error(`${label} must contain exactly ${expectedBytes} bytes`);
  }
  return bytes;
}

function variableBytes(
  value: unknown,
  label: string,
  maxBytes: number,
): Buffer {
  if (Buffer.isBuffer(value)) {
    if (value.length > maxBytes) {
      throw new Error(
        `${label} exceeds the ${maxBytes}-byte transport-profile limit`,
      );
    }
    return Buffer.from(value);
  }
  if (
    typeof value !== 'string'
    || value.length % 2 !== 0
    || !/^[0-9a-f]*$/.test(value)
  ) {
    throw new Error(
      `${label} must be lowercase unprefixed whole-byte hex`,
    );
  }
  if (value.length > maxBytes * 2) {
    throw new Error(
      `${label} exceeds the ${maxBytes}-byte transport-profile limit`,
    );
  }
  return Buffer.from(value, 'hex');
}

function blake2b256(value: Buffer): Buffer {
  return Buffer.from(blakejs.blake2b(value, undefined, 32));
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
