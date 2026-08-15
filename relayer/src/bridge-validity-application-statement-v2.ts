import blakejs from 'blakejs';

import {
  BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES,
  EIP0045_ERGO_STATEMENT_V1_DOMAIN,
  EIP0045_ERGO_STATEMENT_V1_VERSION,
  decodeBridgeValidityFinalityPayloadV2,
  type BridgeValidityFinalityPayloadV2,
} from './bridge-validity-finality-statement-v2.js';

export const BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_DOMAIN =
  'E2S_BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3';
export const BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_VERSION = 3;
export const BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_HASH_BLAKE2B256 = 1;
export const BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_SOURCE_APPLICATION_V2 = 2;
export const BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_FLAGS_NONE = 0;
export const BRIDGE_CAUSAL_APPLICATION_BINDING_V2_DOMAIN =
  'E2S_CAUSAL_APPLICATION_BINDING_V2';
export const BRIDGE_CAUSAL_APPLICATION_BINDING_V2_BYTES = 240;
export const BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES = 973;
export const EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES = 1_132;

const DIGEST_BYTES = 32;
const EVM_ADDRESS_BYTES = 20;
const UINT32_MAX = 0xffff_ffff;
const APPLICATION_PAYLOAD_DOMAIN_BYTES = Buffer.byteLength(
  BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_DOMAIN,
  'ascii',
);
const APPLICATION_PAYLOAD_DISCRIMINATOR_OFFSET = APPLICATION_PAYLOAD_DOMAIN_BYTES + 1;
const FINALITY_PAYLOAD_OFFSET = APPLICATION_PAYLOAD_DISCRIMINATOR_OFFSET + 4;
const APPLICATION_BINDING_OFFSET =
  FINALITY_PAYLOAD_OFFSET + BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES;
const APPLICATION_BINDING_DIGEST_OFFSET =
  APPLICATION_BINDING_OFFSET + BRIDGE_CAUSAL_APPLICATION_BINDING_V2_BYTES;

const SOURCE_NETWORK_OFFSET = 0;
const SIDECHAIN_OFFSET = 32;
const BRIDGE_ADDRESS_OFFSET = 64;
const TOKEN_ADDRESS_OFFSET = 84;
const SETTLEMENT_PROFILE_OFFSET = 104;
const CAUSAL_PROFILE_OFFSET = 136;
const BRIDGE_CODE_HASH_OFFSET = 168;
const BRIDGE_CODE_SIZE_OFFSET = 200;
const TOKEN_CODE_HASH_OFFSET = 204;
const TOKEN_CODE_SIZE_OFFSET = 236;

const EIP_STATEMENT_CHAIN_DOMAIN_OFFSET = EIP0045_ERGO_STATEMENT_V1_DOMAIN.length + 1;
const EIP_STATEMENT_PROFILE_OFFSET = EIP_STATEMENT_CHAIN_DOMAIN_OFFSET + DIGEST_BYTES;
const EIP_STATEMENT_PROGRAM_OFFSET = EIP_STATEMENT_PROFILE_OFFSET + DIGEST_BYTES;
const EIP_STATEMENT_CONTRACT_OFFSET = EIP_STATEMENT_PROGRAM_OFFSET + DIGEST_BYTES;
const EIP_STATEMENT_PAYLOAD_LENGTH_OFFSET = EIP_STATEMENT_CONTRACT_OFFSET + DIGEST_BYTES;
const EIP_STATEMENT_PAYLOAD_OFFSET = EIP_STATEMENT_PAYLOAD_LENGTH_OFFSET + 4;

export interface BridgeCausalApplicationBindingV2Input {
  sourceNetworkIdHex: string;
  sidechainIdHex: string;
  bridgeAddressHex: string;
  tokenAddressHex: string;
  settlementProfileIdHex: string;
  causalProfileIdHex: string;
  bridgeRuntimeCodeSha256Hex: string;
  bridgeRuntimeCodeBytes: number;
  tokenRuntimeCodeSha256Hex: string;
  tokenRuntimeCodeBytes: number;
}

export interface BridgeCausalApplicationBindingV2 {
  readonly sourceNetworkIdHex: string;
  readonly sidechainIdHex: string;
  readonly bridgeAddressHex: string;
  readonly tokenAddressHex: string;
  readonly settlementProfileIdHex: string;
  readonly causalProfileIdHex: string;
  readonly bridgeRuntimeCodeSha256Hex: string;
  readonly bridgeRuntimeCodeBytes: number;
  readonly tokenRuntimeCodeSha256Hex: string;
  readonly tokenRuntimeCodeBytes: number;
  readonly encodedBindingHex: string;
  readonly bindingDigestHex: string;
}

export interface BridgeValidityApplicationPayloadV3Input {
  finalityPayload: Buffer | string;
  application: BridgeCausalApplicationBindingV2Input;
}

export interface BridgeValidityApplicationPayloadV3 {
  readonly version: 3;
  readonly hashAlgorithmId: 1;
  readonly sourceApplicationProfileId: 2;
  readonly flags: 0;
  readonly finality: Readonly<BridgeValidityFinalityPayloadV2>;
  readonly application: Readonly<BridgeCausalApplicationBindingV2>;
  readonly applicationBindingDigestHex: string;
  readonly encodedPayloadHex: string;
  readonly payloadDigestHex: string;
}

export interface Eip0045BridgeApplicationStatementV2Input {
  chainDomainIdHex: string;
  profileIdHex: string;
  programIdHex: string;
  contractIdHex: string;
  applicationPayload: Buffer | string;
}

export interface Eip0045BridgeApplicationStatementV2 {
  readonly version: 1;
  readonly chainDomainIdHex: string;
  readonly profileIdHex: string;
  readonly programIdHex: string;
  readonly contractIdHex: string;
  readonly applicationPayload: Readonly<BridgeValidityApplicationPayloadV3>;
  readonly encodedStatementHex: string;
  readonly statementDigestHex: string;
}

export function encodeBridgeCausalApplicationBindingV2(
  input: BridgeCausalApplicationBindingV2Input,
): Buffer {
  const binding = normalizeApplicationBinding(input);
  return Buffer.concat([
    Buffer.from(binding.sourceNetworkIdHex, 'hex'),
    Buffer.from(binding.sidechainIdHex, 'hex'),
    Buffer.from(binding.bridgeAddressHex, 'hex'),
    Buffer.from(binding.tokenAddressHex, 'hex'),
    Buffer.from(binding.settlementProfileIdHex, 'hex'),
    Buffer.from(binding.causalProfileIdHex, 'hex'),
    Buffer.from(binding.bridgeRuntimeCodeSha256Hex, 'hex'),
    uint32Be(binding.bridgeRuntimeCodeBytes, 'bridgeRuntimeCodeBytes'),
    Buffer.from(binding.tokenRuntimeCodeSha256Hex, 'hex'),
    uint32Be(binding.tokenRuntimeCodeBytes, 'tokenRuntimeCodeBytes'),
  ]);
}

export function decodeBridgeCausalApplicationBindingV2(
  encodedBinding: Buffer | string,
): BridgeCausalApplicationBindingV2 {
  const bytes = exactBytes(
    encodedBinding,
    BRIDGE_CAUSAL_APPLICATION_BINDING_V2_BYTES,
    'bridge causal application binding V2',
  );
  const normalized = normalizeApplicationBinding({
    sourceNetworkIdHex: bytes.subarray(SOURCE_NETWORK_OFFSET, SIDECHAIN_OFFSET).toString('hex'),
    sidechainIdHex: bytes.subarray(SIDECHAIN_OFFSET, BRIDGE_ADDRESS_OFFSET).toString('hex'),
    bridgeAddressHex: bytes.subarray(BRIDGE_ADDRESS_OFFSET, TOKEN_ADDRESS_OFFSET).toString('hex'),
    tokenAddressHex: bytes.subarray(TOKEN_ADDRESS_OFFSET, SETTLEMENT_PROFILE_OFFSET).toString('hex'),
    settlementProfileIdHex:
      bytes.subarray(SETTLEMENT_PROFILE_OFFSET, CAUSAL_PROFILE_OFFSET).toString('hex'),
    causalProfileIdHex:
      bytes.subarray(CAUSAL_PROFILE_OFFSET, BRIDGE_CODE_HASH_OFFSET).toString('hex'),
    bridgeRuntimeCodeSha256Hex:
      bytes.subarray(BRIDGE_CODE_HASH_OFFSET, BRIDGE_CODE_SIZE_OFFSET).toString('hex'),
    bridgeRuntimeCodeBytes: bytes.readUInt32BE(BRIDGE_CODE_SIZE_OFFSET),
    tokenRuntimeCodeSha256Hex:
      bytes.subarray(TOKEN_CODE_HASH_OFFSET, TOKEN_CODE_SIZE_OFFSET).toString('hex'),
    tokenRuntimeCodeBytes: bytes.readUInt32BE(TOKEN_CODE_SIZE_OFFSET),
  });
  const bindingDigestHex = domainHash(
    BRIDGE_CAUSAL_APPLICATION_BINDING_V2_DOMAIN,
    bytes,
  ).toString('hex');
  return Object.freeze({
    ...normalized,
    encodedBindingHex: bytes.toString('hex'),
    bindingDigestHex,
  });
}

export function deriveBridgeCausalApplicationBindingV2DigestHex(
  input: BridgeCausalApplicationBindingV2Input | Buffer | string,
): string {
  const bytes = Buffer.isBuffer(input) || typeof input === 'string'
    ? exactBytes(
      input,
      BRIDGE_CAUSAL_APPLICATION_BINDING_V2_BYTES,
      'bridge causal application binding V2',
    )
    : encodeBridgeCausalApplicationBindingV2(input);
  decodeBridgeCausalApplicationBindingV2(bytes);
  return domainHash(BRIDGE_CAUSAL_APPLICATION_BINDING_V2_DOMAIN, bytes).toString('hex');
}

export function encodeBridgeValidityApplicationPayloadV3(
  input: BridgeValidityApplicationPayloadV3Input,
): Buffer {
  const finalityBytes = exactBytes(
    input.finalityPayload,
    BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES,
    'bridge validity finality payload V2',
  );
  const finality = decodeBridgeValidityFinalityPayloadV2(finalityBytes);
  const applicationBytes = encodeBridgeCausalApplicationBindingV2(input.application);
  const application = decodeBridgeCausalApplicationBindingV2(applicationBytes);
  requireMatchingSidechain(finality, application);
  const applicationBindingDigest = domainHash(
    BRIDGE_CAUSAL_APPLICATION_BINDING_V2_DOMAIN,
    applicationBytes,
  );
  const payload = Buffer.concat([
    Buffer.from(BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_DOMAIN, 'ascii'),
    Buffer.from([0]),
    Buffer.from([
      BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_VERSION,
      BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_HASH_BLAKE2B256,
      BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_SOURCE_APPLICATION_V2,
      BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_FLAGS_NONE,
    ]),
    finalityBytes,
    applicationBytes,
    applicationBindingDigest,
  ]);
  if (payload.length !== BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES) {
    throw new Error('bridge validity application payload V3 internal length mismatch');
  }
  return payload;
}

export function decodeBridgeValidityApplicationPayloadV3(
  encodedPayload: Buffer | string,
): BridgeValidityApplicationPayloadV3 {
  const bytes = exactBytes(
    encodedPayload,
    BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES,
    'bridge validity application payload V3',
  );
  const expectedDomain = Buffer.concat([
    Buffer.from(BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_DOMAIN, 'ascii'),
    Buffer.from([0]),
  ]);
  if (!bytes.subarray(0, APPLICATION_PAYLOAD_DISCRIMINATOR_OFFSET).equals(expectedDomain)) {
    throw new Error('bridge validity application payload V3 domain mismatch');
  }
  validateApplicationPayloadDiscriminators(
    bytes[APPLICATION_PAYLOAD_DISCRIMINATOR_OFFSET],
    bytes[APPLICATION_PAYLOAD_DISCRIMINATOR_OFFSET + 1],
    bytes[APPLICATION_PAYLOAD_DISCRIMINATOR_OFFSET + 2],
    bytes[APPLICATION_PAYLOAD_DISCRIMINATOR_OFFSET + 3],
  );

  const finality = decodeBridgeValidityFinalityPayloadV2(
    bytes.subarray(FINALITY_PAYLOAD_OFFSET, APPLICATION_BINDING_OFFSET),
  );
  const applicationBytes = bytes.subarray(
    APPLICATION_BINDING_OFFSET,
    APPLICATION_BINDING_DIGEST_OFFSET,
  );
  const application = decodeBridgeCausalApplicationBindingV2(applicationBytes);
  requireMatchingSidechain(finality, application);
  const applicationBindingDigest = bytes.subarray(APPLICATION_BINDING_DIGEST_OFFSET);
  const expectedDigest = domainHash(
    BRIDGE_CAUSAL_APPLICATION_BINDING_V2_DOMAIN,
    applicationBytes,
  );
  if (!applicationBindingDigest.equals(expectedDigest)) {
    throw new Error('causal application binding digest mismatch');
  }

  return Object.freeze({
    version: BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_VERSION,
    hashAlgorithmId: BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_HASH_BLAKE2B256,
    sourceApplicationProfileId:
      BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_SOURCE_APPLICATION_V2,
    flags: BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_FLAGS_NONE,
    finality,
    application,
    applicationBindingDigestHex: applicationBindingDigest.toString('hex'),
    encodedPayloadHex: bytes.toString('hex'),
    payloadDigestHex: blake2b256(bytes).toString('hex'),
  });
}

export function deriveBridgeValidityApplicationPayloadV3DigestHex(
  encodedPayload: Buffer | string,
): string {
  const decoded = decodeBridgeValidityApplicationPayloadV3(encodedPayload);
  return decoded.payloadDigestHex;
}

export function encodeEip0045BridgeApplicationStatementV2(
  input: Eip0045BridgeApplicationStatementV2Input,
): Buffer {
  const chainDomainId = nonzeroHexBytes(input.chainDomainIdHex, 'chainDomainId');
  const profileId = nonzeroHexBytes(input.profileIdHex, 'profileId');
  const programId = nonzeroHexBytes(input.programIdHex, 'programId');
  const contractId = nonzeroHexBytes(input.contractIdHex, 'contractId');
  const applicationPayload = exactBytes(
    input.applicationPayload,
    BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES,
    'bridge validity application payload V3',
  );
  const decodedPayload = decodeBridgeValidityApplicationPayloadV3(applicationPayload);
  requireMatchingSettlementNetwork(chainDomainId, decodedPayload.application);

  const statement = Buffer.concat([
    Buffer.from(EIP0045_ERGO_STATEMENT_V1_DOMAIN, 'ascii'),
    Buffer.from([EIP0045_ERGO_STATEMENT_V1_VERSION]),
    chainDomainId,
    profileId,
    programId,
    contractId,
    uint32Le(applicationPayload.length, 'application payload length'),
    applicationPayload,
  ]);
  if (statement.length !== EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES) {
    throw new Error('EIP-0045 bridge application statement V2 internal length mismatch');
  }
  return statement;
}

export function decodeEip0045BridgeApplicationStatementV2(
  encodedStatement: Buffer | string,
): Eip0045BridgeApplicationStatementV2 {
  const bytes = exactBytes(
    encodedStatement,
    EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES,
    'EIP-0045 bridge application statement V2',
  );
  const expectedDomain = Buffer.from(EIP0045_ERGO_STATEMENT_V1_DOMAIN, 'ascii');
  if (!bytes.subarray(0, expectedDomain.length).equals(expectedDomain)) {
    throw new Error('EIP-0045 ErgoStatementV1 domain mismatch');
  }
  if (bytes[expectedDomain.length] !== EIP0045_ERGO_STATEMENT_V1_VERSION) {
    throw new Error('unsupported EIP-0045 ErgoStatement version');
  }
  const payloadLength = bytes.readUInt32LE(EIP_STATEMENT_PAYLOAD_LENGTH_OFFSET);
  if (payloadLength !== BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES) {
    throw new Error('EIP-0045 bridge application payload length mismatch');
  }

  const chainDomainId = nonzeroBytes(
    bytes.subarray(EIP_STATEMENT_CHAIN_DOMAIN_OFFSET, EIP_STATEMENT_PROFILE_OFFSET),
    'chainDomainId',
  );
  const profileId = nonzeroBytes(
    bytes.subarray(EIP_STATEMENT_PROFILE_OFFSET, EIP_STATEMENT_PROGRAM_OFFSET),
    'profileId',
  );
  const programId = nonzeroBytes(
    bytes.subarray(EIP_STATEMENT_PROGRAM_OFFSET, EIP_STATEMENT_CONTRACT_OFFSET),
    'programId',
  );
  const contractId = nonzeroBytes(
    bytes.subarray(EIP_STATEMENT_CONTRACT_OFFSET, EIP_STATEMENT_PAYLOAD_LENGTH_OFFSET),
    'contractId',
  );
  const applicationPayload = decodeBridgeValidityApplicationPayloadV3(
    bytes.subarray(EIP_STATEMENT_PAYLOAD_OFFSET),
  );
  requireMatchingSettlementNetwork(chainDomainId, applicationPayload.application);

  return Object.freeze({
    version: EIP0045_ERGO_STATEMENT_V1_VERSION,
    chainDomainIdHex: chainDomainId.toString('hex'),
    profileIdHex: profileId.toString('hex'),
    programIdHex: programId.toString('hex'),
    contractIdHex: contractId.toString('hex'),
    applicationPayload,
    encodedStatementHex: bytes.toString('hex'),
    statementDigestHex: blake2b256(bytes).toString('hex'),
  });
}

export function deriveEip0045BridgeApplicationStatementV2DigestHex(
  encodedStatement: Buffer | string,
): string {
  const decoded = decodeEip0045BridgeApplicationStatementV2(encodedStatement);
  return decoded.statementDigestHex;
}

export function assertEip0045BridgeApplicationStatementV2Matches(
  encodedStatement: Buffer | string,
  expected: Eip0045BridgeApplicationStatementV2Input,
): Eip0045BridgeApplicationStatementV2 {
  const actual = decodeEip0045BridgeApplicationStatementV2(encodedStatement);
  const rebuilt = encodeEip0045BridgeApplicationStatementV2(expected);
  if (actual.encodedStatementHex !== rebuilt.toString('hex')) {
    throw new Error('EIP-0045 bridge application statement V2 expected binding mismatch');
  }
  return actual;
}

function normalizeApplicationBinding(
  input: BridgeCausalApplicationBindingV2Input,
): BridgeCausalApplicationBindingV2Input {
  const bridgeAddress = nonzeroHexBytes(
    input.bridgeAddressHex,
    'bridgeAddress',
    EVM_ADDRESS_BYTES,
  );
  const tokenAddress = nonzeroHexBytes(
    input.tokenAddressHex,
    'tokenAddress',
    EVM_ADDRESS_BYTES,
  );
  if (bridgeAddress.equals(tokenAddress)) {
    throw new Error('bridge and token addresses must not alias');
  }
  return Object.freeze({
    sourceNetworkIdHex:
      nonzeroHexBytes(input.sourceNetworkIdHex, 'sourceNetworkId').toString('hex'),
    sidechainIdHex: nonzeroHexBytes(input.sidechainIdHex, 'sidechainId').toString('hex'),
    bridgeAddressHex: bridgeAddress.toString('hex'),
    tokenAddressHex: tokenAddress.toString('hex'),
    settlementProfileIdHex:
      nonzeroHexBytes(input.settlementProfileIdHex, 'settlementProfileId').toString('hex'),
    causalProfileIdHex:
      nonzeroHexBytes(input.causalProfileIdHex, 'causalProfileId').toString('hex'),
    bridgeRuntimeCodeSha256Hex: nonzeroHexBytes(
      input.bridgeRuntimeCodeSha256Hex,
      'bridgeRuntimeCodeSha256',
    ).toString('hex'),
    bridgeRuntimeCodeBytes:
      positiveUint32(input.bridgeRuntimeCodeBytes, 'bridgeRuntimeCodeBytes'),
    tokenRuntimeCodeSha256Hex: nonzeroHexBytes(
      input.tokenRuntimeCodeSha256Hex,
      'tokenRuntimeCodeSha256',
    ).toString('hex'),
    tokenRuntimeCodeBytes:
      positiveUint32(input.tokenRuntimeCodeBytes, 'tokenRuntimeCodeBytes'),
  });
}

function requireMatchingSidechain(
  finality: BridgeValidityFinalityPayloadV2,
  application: BridgeCausalApplicationBindingV2,
): void {
  if (finality.checkpoint.sidechainIdHex !== application.sidechainIdHex) {
    throw new Error('application/checkpoint sidechain ID mismatch');
  }
}

function requireMatchingSettlementNetwork(
  chainDomainId: Buffer,
  application: BridgeCausalApplicationBindingV2,
): void {
  if (chainDomainId.toString('hex') !== application.sourceNetworkIdHex) {
    throw new Error('application/settlement chain domain mismatch');
  }
}

function validateApplicationPayloadDiscriminators(
  version: number,
  hashAlgorithmId: number,
  sourceApplicationProfileId: number,
  flags: number,
): void {
  if (version !== BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_VERSION) {
    throw new Error(`unsupported bridge validity application payload version: ${version}`);
  }
  if (hashAlgorithmId !== BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_HASH_BLAKE2B256) {
    throw new Error(`unsupported bridge validity application hash algorithm: ${hashAlgorithmId}`);
  }
  if (
    sourceApplicationProfileId
    !== BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_SOURCE_APPLICATION_V2
  ) {
    throw new Error(
      `unsupported bridge validity source application profile: ${sourceApplicationProfileId}`,
    );
  }
  if (flags !== BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_FLAGS_NONE) {
    throw new Error(`unsupported bridge validity application payload flags: ${flags}`);
  }
}

function exactHexBytes(
  value: string,
  expectedBytes: number,
  label: string,
): Buffer {
  if (typeof value !== 'string' || !/^[0-9a-f]+$/.test(value)) {
    throw new Error(`${label} must be lowercase unprefixed hex`);
  }
  if (value.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes`);
  }
  return Buffer.from(value, 'hex');
}

function exactBytes(
  value: Buffer | string,
  expectedBytes: number,
  label: string,
): Buffer {
  const bytes = Buffer.isBuffer(value)
    ? Buffer.from(value)
    : exactHexBytes(value, expectedBytes, label);
  if (bytes.length !== expectedBytes) {
    throw new Error(`${label} must be ${expectedBytes} bytes`);
  }
  return bytes;
}

function nonzeroHexBytes(
  value: string,
  label: string,
  expectedBytes = DIGEST_BYTES,
): Buffer {
  return nonzeroBytes(exactHexBytes(value, expectedBytes, label), label);
}

function nonzeroBytes(value: Buffer, label: string): Buffer {
  if (value.every((byte) => byte === 0)) {
    throw new Error(`${label} must be nonzero`);
  }
  return Buffer.from(value);
}

function positiveUint32(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > UINT32_MAX) {
    throw new Error(`${label} must be a positive uint32`);
  }
  return value;
}

function uint32Be(value: number, label: string): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(positiveUint32(value, label));
  return out;
}

function uint32Le(value: number, label: string): Buffer {
  if (!Number.isSafeInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new Error(`${label} must fit uint32`);
  }
  const out = Buffer.alloc(4);
  out.writeUInt32LE(value);
  return out;
}

function domainHash(domain: string, bytes: Buffer): Buffer {
  return blake2b256(Buffer.concat([Buffer.from(domain, 'ascii'), bytes]));
}

function blake2b256(bytes: Buffer): Buffer {
  return Buffer.from(blakejs.blake2b(bytes, undefined, DIGEST_BYTES));
}
