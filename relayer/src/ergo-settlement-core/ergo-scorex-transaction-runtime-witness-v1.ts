import blakejs from 'blakejs';

import { assertCompressedSecp256k1Point } from './ergo-autolykos-v2-header.js';
import { computeErgoTransactionWitnessId } from './ergo-block-transactions-root.js';
import { sha256Bytes } from './strict-json.js';

export const ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_FORMAT = 1 as const;
export const ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_SCHEMA =
  'e2s.ergo-scorex-transaction-runtime-witness.v1' as const;
export const ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_FAMILY_DOMAIN =
  'E2S_ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_FAMILY_V1' as const;
export const ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_ID_DOMAIN =
  'E2S_ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_ID_V1' as const;
export const ERGO_SCOREX_TRANSACTION_RUNTIME_PARSER_PROFILE_V1_DOMAIN =
  'E2S_ERGO_SCOREX_TRANSACTION_RUNTIME_PARSER_PROFILE_V1' as const;
export const ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_MAX_BYTES =
  256 * 1024;

const MAGIC = Buffer.from('E2STXW01', 'ascii');
const SECTION_COUNT = 4;
const FIXED_PREFIX_BYTES = 48;
const DIRECTORY_ENTRY_BYTES = 6;
const ENVELOPE_HEADER_BYTES =
  FIXED_PREFIX_BYTES + (SECTION_COUNT * DIRECTORY_ENTRY_BYTES);
const PROFILE_SECTION = 1;
const TRANSACTION_SECTION = 2;
const INCLUSION_SECTION = 3;
const SOURCE_BOX_SECTION = 4;

const DIGEST_BYTES = 32;
const EXACT_INPUTS = 2;
const EXACT_OUTPUTS = 2;
const MAX_TRANSACTION_COUNT = 65_535;
const MAX_MERKLE_SIBLINGS = 32;
const MAX_PROOF_BYTES = 64 * 1024;
const MAX_TREE_BYTES = 4 * 1024;
const MAX_BOX_BYTES = 4 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024;
const MAX_REGISTER_BYTES = 4 * 1024;
const MAX_U16 = 0xffff;
const MAX_U32 = 0xffff_ffff;
const MAX_U64 = 0xffff_ffff_ffff_ffffn;
const ERGO_LONG_MAX = 0x7fff_ffff_ffff_ffffn;
const SCOREX_LEAF_PREFIX = 0x00;
const SCOREX_INTERNAL_PREFIX = 0x01;

export const ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_FAMILY_ID_HEX =
  blake2b256(Buffer.from(
    ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_FAMILY_DOMAIN,
    'ascii',
  )).toString('hex');

export interface ErgoScorexTransactionRuntimeParserProfileV1 {
  readonly routeProfileIdHex: string;
  readonly assetProfileIdHex: string;
  readonly sourceLockErgoTreeHex: string;
  readonly vaultErgoTreeHex: string;
  readonly changeErgoTreeHex: string;
}

export interface ErgoScorexTransactionRuntimeInputV1 {
  readonly boxIdHex: string;
  readonly proofHex: string;
  readonly contextExtensionHex: string;
}

export interface ErgoScorexTransactionRuntimeOutputV1 {
  readonly valueNanoErg: string;
  readonly ergoTreeHex: string;
  readonly creationHeight: number;
  readonly registersHex: readonly string[];
}

export interface ErgoScorexTransactionRuntimeWitnessInputV1 {
  readonly profile: ErgoScorexTransactionRuntimeParserProfileV1;
  readonly blockVersion: number;
  readonly transactionIndex: number;
  readonly transactionCount: number;
  readonly inputs: readonly ErgoScorexTransactionRuntimeInputV1[];
  readonly outputs: readonly ErgoScorexTransactionRuntimeOutputV1[];
  readonly transactionMerkleSiblingsHex: readonly string[];
  readonly witnessMerkleSiblingsHex: readonly string[];
  readonly sourceBoxHex: string;
}

export interface VerifiedErgoScorexTransactionRuntimeWitnessV1 {
  readonly schema: typeof ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_SCHEMA;
  readonly status: 'NON_AUTHORIZING_SCOREX_TRANSACTION_WITNESS_VERIFIED';
  readonly formatVersion: typeof ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_FORMAT;
  readonly formatFamilyIdHex: string;
  readonly parserProfileIdHex: string;
  readonly witnessIdHex: string;
  readonly routeProfileIdHex: string;
  readonly assetProfileIdHex: string;
  readonly blockVersion: number;
  readonly transactionIndex: number;
  readonly transactionCount: number;
  readonly transactionIdHex: string;
  readonly signedTransactionLength: number;
  readonly signedTransactionSha256Hex: string;
  readonly signedTransactionBytesHex: string;
  readonly bytesToSignHex: string;
  readonly transactionWitnessLeafIdHex: string;
  readonly targetTransactionsRootHex: string;
  readonly source: Readonly<{
    boxIdHex: string;
    serializedBytesLength: number;
    inputIndex: number;
    valueNanoErg: string;
    sourceLockErgoTreeSha256Hex: string;
    recipientH160Hex: string;
    signerPublicKeyHex: string;
    depositorErgoTreeHex: string;
    depositorErgoTreeSha256Hex: string;
    originTransactionIdHex: string;
    originOutputIndex: number;
  }>;
  readonly vault: Readonly<{
    boxIdHex: string;
    serializedBytesHex: string;
    outputIndex: 0;
    valueNanoErg: string;
    vaultErgoTreeSha256Hex: string;
  }>;
  readonly authority: Readonly<{
    transactionExecutionValidated: false;
    currentUtxoMembershipEstablished: false;
    globallyCanonicalErgoConsensusAccepted: false;
    runtimeAdmissionAuthorized: false;
    mintAuthorized: false;
    fundsAuthorityEstablished: false;
    gate5Closed: false;
    productionReady: false;
  }>;
}

interface NormalizedProfile {
  readonly routeProfileId: Buffer;
  readonly assetProfileId: Buffer;
  readonly sourceLockErgoTree: Buffer;
  readonly vaultErgoTree: Buffer;
  readonly changeErgoTree: Buffer;
  readonly parserProfileId: Buffer;
}

interface NormalizedInput {
  readonly boxId: Buffer;
  readonly proof: Buffer;
  readonly contextExtension: Buffer;
}

interface NormalizedOutput {
  readonly valueNanoErg: bigint;
  readonly ergoTree: Buffer;
  readonly creationHeight: number;
  readonly registers: readonly Buffer[];
}

interface NormalizedWitness {
  readonly profile: NormalizedProfile;
  readonly blockVersion: number;
  readonly transactionIndex: number;
  readonly transactionCount: number;
  readonly inputs: readonly NormalizedInput[];
  readonly outputs: readonly NormalizedOutput[];
  readonly transactionMerkleSiblings: readonly Buffer[];
  readonly witnessMerkleSiblings: readonly Buffer[];
  readonly sourceBox: Buffer;
}

interface SourceSemantics {
  readonly boxId: Buffer;
  readonly valueNanoErg: bigint;
  readonly recipientH160: Buffer;
  readonly signerPublicKey: Buffer;
  readonly depositorErgoTree: Buffer;
  readonly originTransactionId: Buffer;
  readonly originOutputIndex: number;
}

export function computeErgoScorexTransactionRuntimeParserProfileIdV1Hex(
  value: ErgoScorexTransactionRuntimeParserProfileV1,
): string {
  return normalizeProfile(value).parserProfileId.toString('hex');
}

export function encodeErgoScorexTransactionRuntimeWitnessV1(
  value: ErgoScorexTransactionRuntimeWitnessInputV1,
): Buffer {
  const witness = normalizeWitness(value);
  const encoded = encodeCanonicalWitness(witness);
  verifyCanonicalWitness(encoded, witness.profile);
  return encoded;
}

export function decodeErgoScorexTransactionRuntimeWitnessV1(
  value: Uint8Array,
  expectedProfile: ErgoScorexTransactionRuntimeParserProfileV1,
): Readonly<VerifiedErgoScorexTransactionRuntimeWitnessV1> {
  return verifyCanonicalWitness(exactWitnessBytes(value), normalizeProfile(expectedProfile));
}

export function deriveErgoScorexTransactionRuntimeWitnessIdV1Hex(
  value: Uint8Array,
  expectedProfile: ErgoScorexTransactionRuntimeParserProfileV1,
): string {
  const bytes = exactWitnessBytes(value);
  decodeErgoScorexTransactionRuntimeWitnessV1(bytes, expectedProfile);
  return witnessId(bytes).toString('hex');
}

function verifyCanonicalWitness(
  bytes: Buffer,
  expectedProfile: NormalizedProfile,
): Readonly<VerifiedErgoScorexTransactionRuntimeWitnessV1> {
  const reader = new BinaryReader(bytes);
  if (!reader.bytes(MAGIC.length, 'magic').equals(MAGIC)) {
    throw new Error('Ergo Scorex transaction witness magic is unsupported');
  }
  if (reader.u8('format') !== ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_FORMAT) {
    throw new Error('Ergo Scorex transaction witness format is unsupported');
  }
  if (reader.u8('flags') !== 0) {
    throw new Error('Ergo Scorex transaction witness flags are unsupported');
  }
  if (reader.u16('section count') !== SECTION_COUNT) {
    throw new Error('Ergo Scorex transaction witness section count is unsupported');
  }
  if (reader.u32('total length') !== bytes.length) {
    throw new Error('Ergo Scorex transaction witness total length is inconsistent');
  }
  if (
    reader.bytes(DIGEST_BYTES, 'format-family ID').toString('hex')
      !== ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_FAMILY_ID_HEX
  ) {
    throw new Error('Ergo Scorex transaction witness format-family ID is unsupported');
  }

  const sectionLengths: number[] = [];
  for (let sectionId = 1; sectionId <= SECTION_COUNT; sectionId += 1) {
    if (reader.u8(`section ${sectionId} ID`) !== sectionId) {
      throw new Error('Ergo Scorex transaction witness section order is unsupported');
    }
    if (reader.u8(`section ${sectionId} flags`) !== 0) {
      throw new Error('Ergo Scorex transaction witness section flags are unsupported');
    }
    sectionLengths.push(reader.u32(`section ${sectionId} length`));
  }
  const payloadLength = sectionLengths.reduce((sum, length) => sum + length, 0);
  if (payloadLength !== bytes.length - ENVELOPE_HEADER_BYTES) {
    throw new Error('Ergo Scorex transaction witness section lengths are inconsistent');
  }

  const profile = decodeProfile(reader.section(
    sectionLengths[PROFILE_SECTION - 1]!,
    'profile section',
  ));
  assertProfileEquals(profile, expectedProfile);
  const transaction = decodeTransaction(reader.section(
    sectionLengths[TRANSACTION_SECTION - 1]!,
    'transaction section',
  ), profile);
  const inclusion = decodeInclusion(reader.section(
    sectionLengths[INCLUSION_SECTION - 1]!,
    'inclusion section',
  ));
  const sourceBox = reader.section(
    sectionLengths[SOURCE_BOX_SECTION - 1]!,
    'source-box section',
  ).remaining('source box');
  reader.end('Ergo Scorex transaction witness');

  const witness: NormalizedWitness = {
    profile,
    blockVersion: transaction.blockVersion,
    transactionIndex: transaction.transactionIndex,
    transactionCount: transaction.transactionCount,
    inputs: transaction.inputs,
    outputs: transaction.outputs,
    transactionMerkleSiblings: inclusion.transactionMerkleSiblings,
    witnessMerkleSiblings: inclusion.witnessMerkleSiblings,
    sourceBox,
  };
  const result = verifySemantics(witness, bytes);
  if (!encodeCanonicalWitness(witness).equals(bytes)) {
    throw new Error('Ergo Scorex transaction witness is not canonically encoded');
  }
  return result;
}

function verifySemantics(
  witness: NormalizedWitness,
  encodedWitness: Buffer,
): Readonly<VerifiedErgoScorexTransactionRuntimeWitnessV1> {
  if (witness.blockVersion < 2 || witness.blockVersion > 4) {
    throw new Error('Ergo Scorex transaction witness block version is unsupported');
  }
  if (
    witness.transactionCount < 1
    || witness.transactionCount > MAX_TRANSACTION_COUNT
    || witness.transactionIndex < 0
    || witness.transactionIndex >= witness.transactionCount
  ) {
    throw new Error('Ergo Scorex transaction position is invalid');
  }
  if (witness.inputs.length !== EXACT_INPUTS) {
    throw new Error(`Ergo Scorex transaction must contain exactly ${EXACT_INPUTS} inputs`);
  }
  if (witness.outputs.length !== EXACT_OUTPUTS) {
    throw new Error(`Ergo Scorex transaction must contain exactly ${EXACT_OUTPUTS} outputs`);
  }

  const source = parseSourceBox(witness.sourceBox, witness.profile);
  const sourceMatches = witness.inputs
    .map((input, index) => ({ input, index }))
    .filter(({ input }) => input.boxId.equals(source.boxId));
  if (sourceMatches.length !== 1) {
    throw new Error('refundable source box must appear exactly once as a spending input');
  }
  if (witness.inputs[0]!.boxId.equals(witness.inputs[1]!.boxId)) {
    throw new Error('Ergo Scorex transaction input box IDs must be distinct');
  }

  const vaultOutput = witness.outputs[0]!;
  const changeOutput = witness.outputs[1]!;
  if (!vaultOutput.ergoTree.equals(witness.profile.vaultErgoTree)) {
    throw new Error('Ergo Scorex output zero does not use the registered vault ErgoTree');
  }
  if (!changeOutput.ergoTree.equals(witness.profile.changeErgoTree)) {
    throw new Error('Ergo Scorex output one does not use the registered change ErgoTree');
  }
  if (vaultOutput.valueNanoErg !== source.valueNanoErg) {
    throw new Error('Ergo Scorex vault value does not equal the refundable source value');
  }
  if (changeOutput.registers.length !== 0) {
    throw new Error('Ergo Scorex change output must have no nonmandatory registers');
  }
  const vault = parseVaultRegisters(vaultOutput.registers, source);

  const signedTransaction = serializeTransaction(witness, false);
  const bytesToSign = serializeTransaction(witness, true);
  if (signedTransaction.length > MAX_PROOF_BYTES) {
    throw new Error('Ergo Scorex signed transaction exceeds its 64 KiB bound');
  }
  const transactionId = blake2b256(bytesToSign);
  const transactionWitnessLeafId = computeErgoTransactionWitnessId(
    witness.inputs.map(input => input.proof),
  );
  const leafCount = witness.transactionCount * 2;
  const transactionRoot = verifyScorexMerklePath(
    transactionId,
    witness.transactionIndex,
    leafCount,
    witness.transactionMerkleSiblings,
    'transaction-ID',
  );
  const witnessRoot = verifyScorexMerklePath(
    transactionWitnessLeafId,
    witness.transactionCount + witness.transactionIndex,
    leafCount,
    witness.witnessMerkleSiblings,
    'witness-ID',
  );
  if (!transactionRoot.equals(witnessRoot)) {
    throw new Error('Ergo Scorex transaction and witness Merkle paths disagree');
  }

  const serializedVaultBox = Buffer.concat([
    serializeOutput(vaultOutput),
    transactionId,
    encodeUnsignedVlq(0n),
  ]);
  const vaultBoxId = blake2b256(serializedVaultBox);
  const sourceLockErgoTreeSha256Hex = sha256Bytes(witness.profile.sourceLockErgoTree);
  const vaultErgoTreeSha256Hex = sha256Bytes(witness.profile.vaultErgoTree);
  const depositorErgoTreeSha256Hex = sha256Bytes(source.depositorErgoTree);

  return deepFreeze({
    schema: ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_SCHEMA,
    status: 'NON_AUTHORIZING_SCOREX_TRANSACTION_WITNESS_VERIFIED' as const,
    formatVersion: ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_FORMAT,
    formatFamilyIdHex: ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_FAMILY_ID_HEX,
    parserProfileIdHex: witness.profile.parserProfileId.toString('hex'),
    witnessIdHex: witnessId(encodedWitness).toString('hex'),
    routeProfileIdHex: `0x${witness.profile.routeProfileId.toString('hex')}`,
    assetProfileIdHex: `0x${witness.profile.assetProfileId.toString('hex')}`,
    blockVersion: witness.blockVersion,
    transactionIndex: witness.transactionIndex,
    transactionCount: witness.transactionCount,
    transactionIdHex: transactionId.toString('hex'),
    signedTransactionLength: signedTransaction.length,
    signedTransactionSha256Hex: sha256Bytes(signedTransaction),
    signedTransactionBytesHex: signedTransaction.toString('hex'),
    bytesToSignHex: bytesToSign.toString('hex'),
    transactionWitnessLeafIdHex: transactionWitnessLeafId.toString('hex'),
    targetTransactionsRootHex: transactionRoot.toString('hex'),
    source: {
      boxIdHex: source.boxId.toString('hex'),
      serializedBytesLength: witness.sourceBox.length,
      inputIndex: sourceMatches[0]!.index,
      valueNanoErg: source.valueNanoErg.toString(),
      sourceLockErgoTreeSha256Hex,
      recipientH160Hex: source.recipientH160.toString('hex'),
      signerPublicKeyHex: source.signerPublicKey.toString('hex'),
      depositorErgoTreeHex: source.depositorErgoTree.toString('hex'),
      depositorErgoTreeSha256Hex,
      originTransactionIdHex: source.originTransactionId.toString('hex'),
      originOutputIndex: source.originOutputIndex,
    },
    vault: {
      boxIdHex: vaultBoxId.toString('hex'),
      serializedBytesHex: serializedVaultBox.toString('hex'),
      outputIndex: 0 as const,
      valueNanoErg: vault.valueNanoErg.toString(),
      vaultErgoTreeSha256Hex,
    },
    authority: {
      transactionExecutionValidated: false as const,
      currentUtxoMembershipEstablished: false as const,
      globallyCanonicalErgoConsensusAccepted: false as const,
      runtimeAdmissionAuthorized: false as const,
      mintAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
    },
  });
}

function normalizeWitness(value: unknown): NormalizedWitness {
  const raw = exactDataObject(value, [
    'profile',
    'blockVersion',
    'transactionIndex',
    'transactionCount',
    'inputs',
    'outputs',
    'transactionMerkleSiblingsHex',
    'witnessMerkleSiblingsHex',
    'sourceBoxHex',
  ], 'Ergo Scorex transaction witness input');
  const profile = normalizeProfile(raw.profile);
  const inputsRaw = exactArray(raw.inputs, 'Ergo Scorex transaction inputs');
  if (inputsRaw.length !== EXACT_INPUTS) {
    throw new Error(`Ergo Scorex transaction must contain exactly ${EXACT_INPUTS} inputs`);
  }
  let totalProofBytes = 0;
  const inputs = inputsRaw.map((entry, index) => {
    const input = exactDataObject(entry, [
      'boxIdHex',
      'proofHex',
      'contextExtensionHex',
    ], `Ergo Scorex transaction input ${index}`);
    const proof = variableHex(input.proofHex, MAX_PROOF_BYTES, `input ${index} proof`);
    totalProofBytes += proof.length;
    if (totalProofBytes > MAX_PROOF_BYTES) {
      throw new Error('Ergo Scorex total proof payloads exceed 64 KiB');
    }
    const contextExtension = variableHex(
      input.contextExtensionHex,
      1,
      `input ${index} context extension`,
    );
    if (!contextExtension.equals(Buffer.from([0]))) {
      throw new Error('Ergo Scorex transaction supports only empty context extensions');
    }
    return {
      boxId: fixedHex(input.boxIdHex, DIGEST_BYTES, `input ${index} box ID`),
      proof,
      contextExtension,
    };
  });
  const outputsRaw = exactArray(raw.outputs, 'Ergo Scorex transaction outputs');
  if (outputsRaw.length !== EXACT_OUTPUTS) {
    throw new Error(`Ergo Scorex transaction must contain exactly ${EXACT_OUTPUTS} outputs`);
  }
  const outputs = outputsRaw.map((entry, index) => {
    const output = exactDataObject(entry, [
      'valueNanoErg',
      'ergoTreeHex',
      'creationHeight',
      'registersHex',
    ], `Ergo Scorex transaction output ${index}`);
    const registersRaw = exactArray(
      output.registersHex,
      `Ergo Scorex output ${index} registers`,
    );
    const registers = registersRaw.map((register, registerIndex) =>
      variableHex(
        register,
        MAX_REGISTER_BYTES,
        `Ergo Scorex output ${index} R${registerIndex + 4}`,
      ));
    return {
      valueNanoErg: positiveErgoLong(output.valueNanoErg, `output ${index} value`),
      ergoTree: variableHex(output.ergoTreeHex, MAX_TREE_BYTES, `output ${index} ErgoTree`),
      creationHeight: uint32(output.creationHeight, `output ${index} creation height`),
      registers,
    };
  });
  return {
    profile,
    blockVersion: uint8(raw.blockVersion, 'block version'),
    transactionIndex: uint32(raw.transactionIndex, 'transaction index'),
    transactionCount: uint32(raw.transactionCount, 'transaction count'),
    inputs,
    outputs,
    transactionMerkleSiblings: merkleSiblings(
      raw.transactionMerkleSiblingsHex,
      'transaction-ID Merkle path',
    ),
    witnessMerkleSiblings: merkleSiblings(
      raw.witnessMerkleSiblingsHex,
      'witness-ID Merkle path',
    ),
    sourceBox: variableHex(raw.sourceBoxHex, MAX_BOX_BYTES, 'refundable source box'),
  };
}

function normalizeProfile(value: unknown): NormalizedProfile {
  const raw = exactDataObject(value, [
    'routeProfileIdHex',
    'assetProfileIdHex',
    'sourceLockErgoTreeHex',
    'vaultErgoTreeHex',
    'changeErgoTreeHex',
  ], 'Ergo Scorex transaction parser profile');
  const profile = {
    routeProfileId: fixedHex(raw.routeProfileIdHex, DIGEST_BYTES, 'route-profile ID'),
    assetProfileId: fixedHex(raw.assetProfileIdHex, DIGEST_BYTES, 'asset-profile ID'),
    sourceLockErgoTree: variableHex(
      raw.sourceLockErgoTreeHex,
      MAX_TREE_BYTES,
      'source-lock ErgoTree',
    ),
    vaultErgoTree: variableHex(raw.vaultErgoTreeHex, MAX_TREE_BYTES, 'vault ErgoTree'),
    changeErgoTree: variableHex(raw.changeErgoTreeHex, MAX_TREE_BYTES, 'change ErgoTree'),
  };
  if (profile.routeProfileId.equals(Buffer.alloc(DIGEST_BYTES))) {
    throw new Error('route-profile ID must be nonzero');
  }
  if (profile.assetProfileId.equals(Buffer.alloc(DIGEST_BYTES))) {
    throw new Error('asset-profile ID must be nonzero');
  }
  if (
    profile.sourceLockErgoTree.length === 0
    || profile.vaultErgoTree.length === 0
    || profile.changeErgoTree.length === 0
  ) {
    throw new Error('registered ErgoTrees must not be empty');
  }
  return {
    ...profile,
    parserProfileId: blake2b256(Buffer.concat([
      Buffer.from(ERGO_SCOREX_TRANSACTION_RUNTIME_PARSER_PROFILE_V1_DOMAIN, 'ascii'),
      profile.routeProfileId,
      profile.assetProfileId,
      lengthPrefixedU16(profile.sourceLockErgoTree),
      lengthPrefixedU16(profile.vaultErgoTree),
      lengthPrefixedU16(profile.changeErgoTree),
    ])),
  };
}

function encodeCanonicalWitness(witness: NormalizedWitness): Buffer {
  const sections = [
    encodeProfile(witness.profile),
    encodeTransaction(witness),
    encodeInclusion(witness),
    witness.sourceBox,
  ];
  const totalLength = ENVELOPE_HEADER_BYTES
    + sections.reduce((sum, section) => sum + section.length, 0);
  if (totalLength > ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_MAX_BYTES) {
    throw new Error('Ergo Scorex transaction witness exceeds its byte bound');
  }
  const writer = new BinaryWriter();
  writer.bytes(MAGIC);
  writer.u8(ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_FORMAT);
  writer.u8(0);
  writer.u16(SECTION_COUNT);
  writer.u32(totalLength);
  writer.bytes(Buffer.from(
    ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_FAMILY_ID_HEX,
    'hex',
  ));
  sections.forEach((section, index) => {
    writer.u8(index + 1);
    writer.u8(0);
    writer.u32(section.length);
  });
  sections.forEach(section => writer.bytes(section));
  return writer.finish();
}

function encodeProfile(profile: NormalizedProfile): Buffer {
  const writer = new BinaryWriter();
  writer.bytes(profile.parserProfileId);
  writer.bytes(profile.routeProfileId);
  writer.bytes(profile.assetProfileId);
  writer.byteStringU16(profile.sourceLockErgoTree);
  writer.byteStringU16(profile.vaultErgoTree);
  writer.byteStringU16(profile.changeErgoTree);
  return writer.finish();
}

function decodeProfile(reader: BinaryReader): NormalizedProfile {
  const suppliedParserProfileId = reader.bytes(DIGEST_BYTES, 'parser-profile ID');
  const profile = normalizeProfile({
    routeProfileIdHex: reader.bytes(DIGEST_BYTES, 'route-profile ID').toString('hex'),
    assetProfileIdHex: reader.bytes(DIGEST_BYTES, 'asset-profile ID').toString('hex'),
    sourceLockErgoTreeHex: reader.byteStringU16(MAX_TREE_BYTES, 'source-lock ErgoTree').toString('hex'),
    vaultErgoTreeHex: reader.byteStringU16(MAX_TREE_BYTES, 'vault ErgoTree').toString('hex'),
    changeErgoTreeHex: reader.byteStringU16(MAX_TREE_BYTES, 'change ErgoTree').toString('hex'),
  });
  reader.end('Ergo Scorex transaction profile section');
  if (!suppliedParserProfileId.equals(profile.parserProfileId)) {
    throw new Error('Ergo Scorex transaction parser-profile ID is inconsistent');
  }
  return profile;
}

function encodeTransaction(witness: NormalizedWitness): Buffer {
  const writer = new BinaryWriter();
  writer.u8(witness.blockVersion);
  writer.u32(witness.transactionIndex);
  writer.u32(witness.transactionCount);
  writer.u8(witness.inputs.length);
  witness.inputs.forEach(input => {
    writer.bytes(input.boxId);
    writer.byteStringU32(input.proof);
    writer.byteStringU16(input.contextExtension);
  });
  writer.u8(0); // exact data-input count
  writer.u8(0); // exact distinct-token table count
  writer.u8(witness.outputs.length);
  witness.outputs.forEach(output => {
    writer.u64(output.valueNanoErg);
    writer.byteStringU16(output.ergoTree);
    writer.u32(output.creationHeight);
    writer.u8(0); // exact output token count
    writer.u8(output.registers.length);
    output.registers.forEach(register => writer.byteStringU16(register));
  });
  return writer.finish();
}

function decodeTransaction(
  reader: BinaryReader,
  profile: NormalizedProfile,
): Omit<NormalizedWitness, 'profile' | 'transactionMerkleSiblings' | 'witnessMerkleSiblings' | 'sourceBox'> {
  const blockVersion = reader.u8('block version');
  const transactionIndex = reader.u32('transaction index');
  const transactionCount = reader.u32('transaction count');
  const inputCount = reader.u8('input count');
  if (inputCount !== EXACT_INPUTS) {
    throw new Error(`Ergo Scorex transaction must contain exactly ${EXACT_INPUTS} inputs`);
  }
  let totalProofBytes = 0;
  const inputs = Array.from({ length: inputCount }, (_, index) => {
    const boxId = reader.bytes(DIGEST_BYTES, `input ${index} box ID`);
    const proof = reader.byteStringU32(MAX_PROOF_BYTES, `input ${index} proof`);
    totalProofBytes += proof.length;
    if (totalProofBytes > MAX_PROOF_BYTES) {
      throw new Error('Ergo Scorex total proof payloads exceed 64 KiB');
    }
    const contextExtension = reader.byteStringU16(1, `input ${index} context extension`);
    if (!contextExtension.equals(Buffer.from([0]))) {
      throw new Error('Ergo Scorex transaction supports only empty context extensions');
    }
    return {
      boxId,
      proof,
      contextExtension,
    };
  });
  if (reader.u8('data-input count') !== 0) {
    throw new Error('Ergo Scorex transaction supports no data inputs');
  }
  if (reader.u8('distinct-token table count') !== 0) {
    throw new Error('Ergo Scorex transaction supports no distinct token IDs');
  }
  const outputCount = reader.u8('output count');
  if (outputCount !== EXACT_OUTPUTS) {
    throw new Error(`Ergo Scorex transaction must contain exactly ${EXACT_OUTPUTS} outputs`);
  }
  const expectedTrees = [profile.vaultErgoTree, profile.changeErgoTree];
  const outputs = Array.from({ length: outputCount }, (_, index) => {
    const valueNanoErg = reader.u64(`output ${index} value`);
    if (valueNanoErg === 0n || valueNanoErg > ERGO_LONG_MAX) {
      throw new Error(`output ${index} value is outside the positive Ergo Long range`);
    }
    const ergoTree = reader.byteStringU16(MAX_TREE_BYTES, `output ${index} ErgoTree`);
    if (!ergoTree.equals(expectedTrees[index]!)) {
      throw new Error(`Ergo Scorex output ${index} uses an unregistered ErgoTree`);
    }
    const creationHeight = reader.u32(`output ${index} creation height`);
    if (reader.u8(`output ${index} token count`) !== 0) {
      throw new Error(`Ergo Scorex output ${index} must contain no tokens`);
    }
    const registerCount = reader.u8(`output ${index} register count`);
    if (registerCount !== (index === 0 ? 4 : 0)) {
      throw new Error(`Ergo Scorex output ${index} register count is unsupported`);
    }
    const registers = Array.from({ length: registerCount }, (_, registerIndex) =>
      reader.byteStringU16(
        MAX_REGISTER_BYTES,
        `output ${index} R${registerIndex + 4}`,
      ));
    return { valueNanoErg, ergoTree, creationHeight, registers };
  });
  reader.end('Ergo Scorex transaction section');
  return { blockVersion, transactionIndex, transactionCount, inputs, outputs };
}

function encodeInclusion(witness: NormalizedWitness): Buffer {
  const writer = new BinaryWriter();
  writer.u8(witness.transactionMerkleSiblings.length);
  witness.transactionMerkleSiblings.forEach(sibling => writer.bytes(sibling));
  writer.u8(witness.witnessMerkleSiblings.length);
  witness.witnessMerkleSiblings.forEach(sibling => writer.bytes(sibling));
  return writer.finish();
}

function decodeInclusion(reader: BinaryReader): Pick<
NormalizedWitness,
'transactionMerkleSiblings' | 'witnessMerkleSiblings'
> {
  const transactionCount = reader.u8('transaction-ID sibling count');
  if (transactionCount > MAX_MERKLE_SIBLINGS) {
    throw new Error('transaction-ID Merkle path exceeds its bound');
  }
  const transactionMerkleSiblings = Array.from(
    { length: transactionCount },
    (_, index) => reader.bytes(DIGEST_BYTES, `transaction-ID sibling ${index}`),
  );
  const witnessCount = reader.u8('witness-ID sibling count');
  if (witnessCount > MAX_MERKLE_SIBLINGS) {
    throw new Error('witness-ID Merkle path exceeds its bound');
  }
  const witnessMerkleSiblings = Array.from(
    { length: witnessCount },
    (_, index) => reader.bytes(DIGEST_BYTES, `witness-ID sibling ${index}`),
  );
  reader.end('Ergo Scorex transaction inclusion section');
  return { transactionMerkleSiblings, witnessMerkleSiblings };
}

function serializeTransaction(witness: NormalizedWitness, proofless: boolean): Buffer {
  const chunks: Buffer[] = [encodeUnsignedVlq(BigInt(witness.inputs.length))];
  witness.inputs.forEach(input => {
    const proof = proofless ? Buffer.alloc(0) : input.proof;
    chunks.push(
      input.boxId,
      encodeUnsignedVlq(BigInt(proof.length)),
      proof,
      input.contextExtension,
    );
  });
  chunks.push(
    encodeUnsignedVlq(0n), // data-input count
    encodeUnsignedVlq(0n), // distinct-token table count
    encodeUnsignedVlq(BigInt(witness.outputs.length)),
  );
  witness.outputs.forEach(output => chunks.push(serializeOutput(output)));
  return Buffer.concat(chunks);
}

function serializeOutput(output: NormalizedOutput): Buffer {
  const encoded = Buffer.concat([
    encodeUnsignedVlq(output.valueNanoErg),
    output.ergoTree,
    encodeUnsignedVlq(BigInt(output.creationHeight)),
    Buffer.from([0, output.registers.length]),
    ...output.registers,
  ]);
  if (encoded.length > MAX_OUTPUT_BYTES) {
    throw new Error(`Ergo Scorex output body exceeds ${MAX_OUTPUT_BYTES} bytes`);
  }
  return encoded;
}

function parseSourceBox(sourceBox: Buffer, profile: NormalizedProfile): SourceSemantics {
  if (sourceBox.length === 0 || sourceBox.length > MAX_BOX_BYTES) {
    throw new Error('refundable source box length is outside its bound');
  }
  const reader = new ScorexReader(sourceBox);
  const valueNanoErg = reader.vlq(64, 'refundable source value');
  if (valueNanoErg === 0n || valueNanoErg > ERGO_LONG_MAX) {
    throw new Error('refundable source value is outside the positive Ergo Long range');
  }
  reader.exact(profile.sourceLockErgoTree, 'refundable source ErgoTree');
  reader.vlq(32, 'refundable source creation height');
  if (reader.u8('refundable source token count') !== 0) {
    throw new Error('refundable source box must contain no tokens');
  }
  if (reader.u8('refundable source register count') !== 4) {
    throw new Error('refundable source box must contain exactly R4-R7');
  }
  const recipientH160 = reader.collByte(20, 20, 'refundable source R4');
  const registeredAmount = reader.long('refundable source R5');
  if (registeredAmount !== valueNanoErg) {
    throw new Error('refundable source R5 must equal the source box value');
  }
  const signerPublicKey = reader.collByte(33, 33, 'refundable source R6');
  assertCompressedSecp256k1Point(signerPublicKey);
  const depositorErgoTree = reader.collByte(1, MAX_TREE_BYTES, 'refundable source R7');
  const originTransactionId = reader.bytes(DIGEST_BYTES, 'refundable source transaction ID');
  const originOutputIndex = Number(reader.vlq(16, 'refundable source output index'));
  reader.end('refundable source box');
  return {
    boxId: blake2b256(sourceBox),
    valueNanoErg,
    recipientH160,
    signerPublicKey,
    depositorErgoTree,
    originTransactionId,
    originOutputIndex,
  };
}

function parseVaultRegisters(
  registers: readonly Buffer[],
  source: SourceSemantics,
): { readonly valueNanoErg: bigint } {
  if (registers.length !== 4) {
    throw new Error('Ergo Scorex vault output must contain exactly R4-R7');
  }
  const sourceId = parseStandaloneCollByte(registers[0]!, 32, 32, 'vault R4');
  if (!sourceId.equals(source.boxId)) {
    throw new Error('vault R4 does not bind the refundable source box ID');
  }
  const recipient = parseStandaloneCollByte(registers[1]!, 20, 20, 'vault R5');
  if (!recipient.equals(source.recipientH160)) {
    throw new Error('vault R5 does not bind the refundable source recipient');
  }
  const amount = parseStandaloneLong(registers[2]!, 'vault R6');
  if (amount !== source.valueNanoErg) {
    throw new Error('vault R6 does not bind the refundable source amount');
  }
  const depositor = parseStandaloneCollByte(
    registers[3]!,
    1,
    MAX_TREE_BYTES,
    'vault R7',
  );
  if (!depositor.equals(source.depositorErgoTree)) {
    throw new Error('vault R7 does not bind the refundable source depositor');
  }
  return { valueNanoErg: amount };
}

function parseStandaloneCollByte(
  value: Buffer,
  minimum: number,
  maximum: number,
  label: string,
): Buffer {
  const reader = new ScorexReader(value);
  const payload = reader.collByte(minimum, maximum, label);
  reader.end(label);
  return payload;
}

function parseStandaloneLong(value: Buffer, label: string): bigint {
  const reader = new ScorexReader(value);
  const decoded = reader.long(label);
  reader.end(label);
  return decoded;
}

function verifyScorexMerklePath(
  rawLeaf: Buffer,
  leafIndex: number,
  leafCount: number,
  siblings: readonly Buffer[],
  label: string,
): Buffer {
  if (!Number.isSafeInteger(leafIndex) || leafIndex < 0 || leafIndex >= leafCount) {
    throw new Error(`${label} Merkle leaf position is invalid`);
  }
  let node = blake2b256(Buffer.concat([
    Buffer.from([SCOREX_LEAF_PREFIX]),
    rawLeaf,
  ]));
  let index = leafIndex;
  let width = leafCount;
  let siblingIndex = 0;
  while (width > 1) {
    const siblingPosition = index ^ 1;
    if (siblingPosition < width) {
      const sibling = siblings[siblingIndex];
      if (sibling === undefined) {
        throw new Error(`${label} Merkle path is truncated`);
      }
      siblingIndex += 1;
      node = blake2b256(
        index % 2 === 0
          ? Buffer.concat([Buffer.from([SCOREX_INTERNAL_PREFIX]), node, sibling])
          : Buffer.concat([Buffer.from([SCOREX_INTERNAL_PREFIX]), sibling, node]),
      );
    } else {
      node = blake2b256(Buffer.concat([
        Buffer.from([SCOREX_INTERNAL_PREFIX]),
        node,
      ]));
    }
    index = Math.floor(index / 2);
    width = Math.ceil(width / 2);
  }
  if (siblingIndex !== siblings.length) {
    throw new Error(`${label} Merkle path contains unused siblings`);
  }
  return node;
}

function merkleSiblings(value: unknown, label: string): Buffer[] {
  const raw = exactArray(value, label);
  if (raw.length > MAX_MERKLE_SIBLINGS) {
    throw new Error(`${label} exceeds its bound`);
  }
  return raw.map((entry, index) => fixedHex(entry, DIGEST_BYTES, `${label} sibling ${index}`));
}

function assertProfileEquals(actual: NormalizedProfile, expected: NormalizedProfile): void {
  for (const [left, right] of [
    [actual.parserProfileId, expected.parserProfileId],
    [actual.routeProfileId, expected.routeProfileId],
    [actual.assetProfileId, expected.assetProfileId],
    [actual.sourceLockErgoTree, expected.sourceLockErgoTree],
    [actual.vaultErgoTree, expected.vaultErgoTree],
    [actual.changeErgoTree, expected.changeErgoTree],
  ] as const) {
    if (!left.equals(right)) {
      throw new Error('Ergo Scorex transaction parser profile is not statically registered');
    }
  }
}

function encodeUnsignedVlq(value: bigint): Buffer {
  if (value < 0n || value > MAX_U64) {
    throw new Error('Scorex unsigned VLQ value is out of range');
  }
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining !== 0n) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0n);
  return Buffer.from(bytes);
}

function lengthPrefixedU16(value: Buffer): Buffer {
  if (value.length > MAX_U16) throw new Error('profile byte string exceeds UInt16');
  const length = Buffer.alloc(2);
  length.writeUInt16BE(value.length);
  return Buffer.concat([length, value]);
}

function witnessId(value: Buffer): Buffer {
  return blake2b256(Buffer.concat([
    Buffer.from(ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_ID_DOMAIN, 'ascii'),
    value,
  ]));
}

function exactWitnessBytes(value: Uint8Array): Buffer {
  if (!(value instanceof Uint8Array)) {
    throw new Error('Ergo Scorex transaction witness must be bytes');
  }
  const bytes = Buffer.from(value);
  if (
    bytes.length < ENVELOPE_HEADER_BYTES
    || bytes.length > ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_MAX_BYTES
  ) {
    throw new Error('Ergo Scorex transaction witness length is outside its bound');
  }
  return bytes;
}

function exactDataObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, any> {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const symbolKeys = Object.getOwnPropertySymbols(value);
  const actual = Object.getOwnPropertyNames(descriptors).sort();
  const expected = [...keys].sort();
  if (
    symbolKeys.length !== 0
    || actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} must contain exactly ${expected.join(', ')}`);
  }
  const snapshot: Record<string, any> = {};
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new Error(`${label}.${key} must be a data property`);
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function exactArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw new Error(`${label} must not be sparse`);
    }
  }
  return value;
}

function fixedHex(value: unknown, length: number, label: string): Buffer {
  const bytes = variableHex(value, length, label);
  if (bytes.length !== length) {
    throw new Error(`${label} must be exactly ${length} bytes`);
  }
  return bytes;
}

function variableHex(value: unknown, maximum: number, label: string): Buffer {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be lowercase even-length hex`);
  }
  const raw = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^(?:[0-9a-f]{2})*$/.test(raw)) {
    throw new Error(`${label} must be lowercase even-length hex`);
  }
  const bytes = Buffer.from(raw, 'hex');
  if (bytes.length > maximum) throw new Error(`${label} exceeds ${maximum} bytes`);
  return bytes;
}

function positiveErgoLong(value: unknown, label: string): bigint {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be canonical positive decimal`);
  }
  const amount = BigInt(value);
  if (amount > ERGO_LONG_MAX) throw new Error(`${label} exceeds the Ergo Long range`);
  return amount;
}

function uint8(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 0xff) {
    throw new Error(`${label} must be an unsigned UInt8`);
  }
  return Number(value);
}

function uint32(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > MAX_U32) {
    throw new Error(`${label} must be an unsigned UInt32`);
  }
  return Number(value);
}

function blake2b256(value: Uint8Array): Buffer {
  return Buffer.from(blakejs.blake2b(value, undefined, DIGEST_BYTES));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

class BinaryWriter {
  private readonly chunks: Buffer[] = [];

  bytes(value: Uint8Array): void {
    this.chunks.push(Buffer.from(value));
  }

  u8(value: number): void {
    this.integer(value, 0xff, 1, 'UInt8');
  }

  u16(value: number): void {
    this.integer(value, MAX_U16, 2, 'UInt16');
  }

  u32(value: number): void {
    this.integer(value, MAX_U32, 4, 'UInt32');
  }

  u64(value: bigint): void {
    if (value < 0n || value > MAX_U64) throw new Error('UInt64 value is out of range');
    const bytes = Buffer.alloc(8);
    bytes.writeBigUInt64BE(value);
    this.bytes(bytes);
  }

  byteStringU16(value: Buffer): void {
    this.u16(value.length);
    this.bytes(value);
  }

  byteStringU32(value: Buffer): void {
    this.u32(value.length);
    this.bytes(value);
  }

  finish(): Buffer {
    return Buffer.concat(this.chunks);
  }

  private integer(value: number, maximum: number, length: number, label: string): void {
    if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
      throw new Error(`${label} value is out of range`);
    }
    const bytes = Buffer.alloc(length);
    if (length === 1) bytes.writeUInt8(value);
    else if (length === 2) bytes.writeUInt16BE(value);
    else bytes.writeUInt32BE(value);
    this.bytes(bytes);
  }
}

class BinaryReader {
  private offset = 0;

  constructor(private readonly source: Buffer) {}

  bytes(length: number, label: string): Buffer {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.source.length) {
      throw new Error(`${label} exceeds the Ergo Scorex witness boundary`);
    }
    const result = Buffer.from(this.source.subarray(this.offset, this.offset + length));
    this.offset += length;
    return result;
  }

  u8(label: string): number {
    return this.bytes(1, label).readUInt8(0);
  }

  u16(label: string): number {
    return this.bytes(2, label).readUInt16BE(0);
  }

  u32(label: string): number {
    return this.bytes(4, label).readUInt32BE(0);
  }

  u64(label: string): bigint {
    return this.bytes(8, label).readBigUInt64BE(0);
  }

  byteStringU16(maximum: number, label: string): Buffer {
    const length = this.u16(`${label} length`);
    if (length > maximum) throw new Error(`${label} exceeds ${maximum} bytes`);
    return this.bytes(length, label);
  }

  byteStringU32(maximum: number, label: string): Buffer {
    const length = this.u32(`${label} length`);
    if (length > maximum) throw new Error(`${label} exceeds ${maximum} bytes`);
    return this.bytes(length, label);
  }

  section(length: number, label: string): BinaryReader {
    return new BinaryReader(this.bytes(length, label));
  }

  remaining(label: string): Buffer {
    return this.bytes(this.source.length - this.offset, label);
  }

  end(label: string): void {
    if (this.offset !== this.source.length) throw new Error(`${label} contains trailing bytes`);
  }
}

class ScorexReader {
  private offset = 0;

  constructor(private readonly source: Buffer) {}

  bytes(length: number, label: string): Buffer {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.source.length) {
      throw new Error(`${label} exceeds its Scorex boundary`);
    }
    const result = Buffer.from(this.source.subarray(this.offset, this.offset + length));
    this.offset += length;
    return result;
  }

  u8(label: string): number {
    return this.bytes(1, label).readUInt8(0);
  }

  exact(expected: Buffer, label: string): void {
    if (!this.bytes(expected.length, label).equals(expected)) {
      throw new Error(`${label} does not match the registered profile`);
    }
  }

  vlq(bits: 16 | 32 | 64, label: string): bigint {
    const start = this.offset;
    let value = 0n;
    let shift = 0n;
    const maximumBytes = bits === 16 ? 3 : bits === 32 ? 5 : 10;
    for (let index = 0; index < maximumBytes; index += 1) {
      const byte = this.u8(label);
      value |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        const maximum = (1n << BigInt(bits)) - 1n;
        if (value > maximum) throw new Error(`${label} exceeds UInt${bits}`);
        const consumed = this.source.subarray(start, this.offset);
        if (!encodeUnsignedVlq(value).equals(consumed)) {
          throw new Error(`${label} is not minimally encoded`);
        }
        return value;
      }
      shift += 7n;
    }
    throw new Error(`${label} has an invalid unsigned VLQ encoding`);
  }

  collByte(minimum: number, maximum: number, label: string): Buffer {
    if (this.u8(`${label} type`) !== 0x0e) {
      throw new Error(`${label} must be a Sigma Coll[Byte]`);
    }
    const length = Number(this.vlq(16, `${label} length`));
    if (length < minimum || length > maximum) {
      throw new Error(`${label} length is outside its bound`);
    }
    return this.bytes(length, label);
  }

  long(label: string): bigint {
    if (this.u8(`${label} type`) !== 0x05) {
      throw new Error(`${label} must be a Sigma Long`);
    }
    const encoded = this.vlq(64, label);
    const decoded = (encoded >> 1n) ^ -(encoded & 1n);
    if (decoded < 0n || decoded > ERGO_LONG_MAX) {
      throw new Error(`${label} is outside the supported positive Ergo Long range`);
    }
    return decoded;
  }

  end(label: string): void {
    if (this.offset !== this.source.length) throw new Error(`${label} contains trailing bytes`);
  }
}
