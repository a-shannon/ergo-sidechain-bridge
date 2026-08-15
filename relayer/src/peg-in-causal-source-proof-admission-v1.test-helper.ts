import {
  createPrivateKey,
  createPublicKey,
  sign as signMessage,
} from 'node:crypto';

import {
  PEG_IN_CAUSAL_SOURCE_FINALITY_POLICY_ID_V1_HEX,
  PEG_IN_CAUSAL_SOURCE_PROOF_ADMISSION_V1_SCHEMA,
  PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX,
  PEG_IN_CAUSAL_SOURCE_PROOF_REQUIRED_CONFIRMATIONS_V1,
  PEG_IN_CAUSAL_SOURCE_PROOF_SIGNER_PUBLIC_KEYS_V1_HEX,
  PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
  buildPegInCausalSourceProofResultFieldsV1,
  derivePegInCausalSourceProofAttestationDigestV1Hex,
  derivePegInCausalSourceProofResultIdV1Hex,
  validatePegInCausalSourceProofEnvelopeV1,
  type PegInCausalSourceProofEnvelopeV1,
  type PegInCausalSourceProofRequestV1,
  type PegInCausalSourceProofResultFieldsV1,
  type PegInCausalSourceProofResultV1,
  type PegInCausalSourceProofSignatureV1,
} from './peg-in-causal-source-proof-admission-v1.js';
import {
  derivePegInCausalAdmissionIdV2Hex,
  derivePegInCausalAdmissionProfileIdV2Hex,
  derivePegInSourceIntentIdV2Hex,
} from './peg-in-causal-admission-v2.js';
import { derivePegInRuntimeRecordKeyV1Hex } from './peg-in-runtime-state.js';

const ED25519_PKCS8_SEED_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

const FIXTURE_SIGNERS = [0x42, 0x43, 0x41].map(seedByte => {
  const privateKey = createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_SEED_PREFIX, Buffer.alloc(32, seedByte)]),
    format: 'der',
    type: 'pkcs8',
  });
  const publicKeyHex = `0x${createPublicKey(privateKey)
    .export({ format: 'der', type: 'spki' })
    .subarray(-32)
    .toString('hex')}`;
  return { privateKey, publicKeyHex };
});

for (const [index, signer] of FIXTURE_SIGNERS.entries()) {
  if (signer.publicKeyHex !== PEG_IN_CAUSAL_SOURCE_PROOF_SIGNER_PUBLIC_KEYS_V1_HEX[index]) {
    throw new Error('deterministic source-proof fixture signer differs from the static profile');
  }
}

export function createPegInCausalSourceProofRequestV1Fixture(
  label: string,
): PegInCausalSourceProofRequestV1 {
  const admissionProfile = {
    formatVersion: 2 as const,
    sourceNetworkIdHex: fixtureHash(`${label}-network`),
    sidechainIdHex: fixtureHash(`${label}-sidechain`),
    bridgeAddressHex: fixtureAddress(`${label}-bridge`),
    tokenAddressHex: fixtureAddress(`${label}-token`),
    settlementProfileIdHex: fixtureHash(`${label}-settlement`),
    sourceLockErgoTreeHashHex: fixtureHash(`${label}-source-tree`),
    vaultErgoTreeHashHex: fixtureHash(`${label}-vault-tree`),
    finalityPolicyIdHex: PEG_IN_CAUSAL_SOURCE_FINALITY_POLICY_ID_V1_HEX,
    proofSystemIdHex: PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
    proofProfileIdHex: PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX,
    profileRevision: '1',
    activationHeight: '1',
  };
  const sourceIntent = {
    formatVersion: 2 as const,
    sourceNetworkIdHex: admissionProfile.sourceNetworkIdHex,
    sidechainIdHex: admissionProfile.sidechainIdHex,
    bridgeAddressHex: admissionProfile.bridgeAddressHex,
    tokenAddressHex: admissionProfile.tokenAddressHex,
    settlementProfileIdHex: admissionProfile.settlementProfileIdHex,
    admissionProfileIdHex: derivePegInCausalAdmissionProfileIdV2Hex(admissionProfile),
    sourceAssetIdHex: `0x${'00'.repeat(32)}`,
    amountNanoErg: '1000000',
    recipientAddressHex: fixtureAddress(`${label}-recipient`),
  };
  const statement = {
    formatVersion: 2 as const,
    sourceIntentIdHex: derivePegInSourceIntentIdV2Hex(sourceIntent),
    legacyMintIdentityHex: derivePegInRuntimeRecordKeyV1Hex({
      sidechainIdHex: admissionProfile.sidechainIdHex,
      ergoBoxIdHex: fixtureHash(`${label}-source-box`),
    }),
    sourceBoxIdHex: fixtureHash(`${label}-source-box`),
    sourceCreationTransactionIdHex: fixtureHash(`${label}-creation`),
    sourceOutputIndex: 0,
    sourceLockErgoTreeHashHex: admissionProfile.sourceLockErgoTreeHashHex,
    commitmentTransactionIdHex: fixtureHash(`${label}-commitment`),
    vaultOutputIndex: 0,
    vaultBoxIdHex: fixtureHash(`${label}-vault-box`),
    vaultErgoTreeHashHex: admissionProfile.vaultErgoTreeHashHex,
    commitmentInclusionBlockIdHex: fixtureHash(`${label}-inclusion`),
    commitmentInclusionHeight: '100',
    acceptanceCheckpointBlockIdHex: fixtureHash(`${label}-checkpoint`),
    acceptanceCheckpointHeight: '109',
    finalityPolicyIdHex: PEG_IN_CAUSAL_SOURCE_FINALITY_POLICY_ID_V1_HEX,
    requiredConfirmations: PEG_IN_CAUSAL_SOURCE_PROOF_REQUIRED_CONFIRMATIONS_V1,
  };
  return {
    schema: PEG_IN_CAUSAL_SOURCE_PROOF_ADMISSION_V1_SCHEMA,
    candidateIdHex: derivePegInCausalAdmissionIdV2Hex(statement),
    admissionProfile,
    sourceIntent,
    statement,
    sourceBoxCanonicalHex: '0x010203',
    commitmentTransactionCanonicalHex: '0x040506',
    vaultSuccessorCanonicalHex: '0x070809',
    inclusionProofCanonicalHex: '0x0a0b0c',
    checkpointAncestryCanonicalHex: '0x0d0e0f',
    finalityProofCanonicalHex: '0x101112',
    verifierExecutableSha256Hex: fixtureHash(`${label}-verifier-executable`),
    sourceConsumption: {
      consumedSourceBoxIdHex: statement.sourceBoxIdHex,
      consumingTransactionIdHex: statement.commitmentTransactionIdHex,
      vaultOutputIndex: statement.vaultOutputIndex,
      vaultBoxIdHex: statement.vaultBoxIdHex,
      commitmentInclusionBlockIdHex: statement.commitmentInclusionBlockIdHex,
      commitmentInclusionHeight: statement.commitmentInclusionHeight,
      acceptanceCheckpointBlockIdHex: statement.acceptanceCheckpointBlockIdHex,
      acceptanceCheckpointHeight: statement.acceptanceCheckpointHeight,
      finalityPolicyIdHex: statement.finalityPolicyIdHex,
    },
  };
}

/** Exact cross-language fixture mirrored by the Frontier runtime unit test. */
export function createRustInteropPegInCausalSourceProofRequestV1Fixture():
PegInCausalSourceProofRequestV1 {
  const admissionProfile = {
    formatVersion: 2 as const,
    sourceNetworkIdHex: repeatedHex(0x11, 32),
    sidechainIdHex: repeatedHex(0x22, 32),
    bridgeAddressHex: repeatedHex(0x33, 20),
    tokenAddressHex: repeatedHex(0x44, 20),
    settlementProfileIdHex: repeatedHex(0x55, 32),
    sourceLockErgoTreeHashHex: repeatedHex(0xcc, 32),
    vaultErgoTreeHashHex: repeatedHex(0xff, 32),
    finalityPolicyIdHex: PEG_IN_CAUSAL_SOURCE_FINALITY_POLICY_ID_V1_HEX,
    proofSystemIdHex: PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
    proofProfileIdHex: PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX,
    profileRevision: '3',
    activationHeight: '1000',
  };
  const sourceIntent = {
    formatVersion: 2 as const,
    sourceNetworkIdHex: admissionProfile.sourceNetworkIdHex,
    sidechainIdHex: admissionProfile.sidechainIdHex,
    bridgeAddressHex: admissionProfile.bridgeAddressHex,
    tokenAddressHex: admissionProfile.tokenAddressHex,
    settlementProfileIdHex: admissionProfile.settlementProfileIdHex,
    admissionProfileIdHex: derivePegInCausalAdmissionProfileIdV2Hex(admissionProfile),
    sourceAssetIdHex: repeatedHex(0x00, 32),
    amountNanoErg: '2000000',
    recipientAddressHex: repeatedHex(0x99, 20),
  };
  const sourceBoxIdHex = repeatedHex(0xaa, 32);
  const statement = {
    formatVersion: 2 as const,
    sourceIntentIdHex: derivePegInSourceIntentIdV2Hex(sourceIntent),
    legacyMintIdentityHex: derivePegInRuntimeRecordKeyV1Hex({
      sidechainIdHex: admissionProfile.sidechainIdHex,
      ergoBoxIdHex: sourceBoxIdHex,
    }),
    sourceBoxIdHex,
    sourceCreationTransactionIdHex: repeatedHex(0xbb, 32),
    sourceOutputIndex: 1,
    sourceLockErgoTreeHashHex: admissionProfile.sourceLockErgoTreeHashHex,
    commitmentTransactionIdHex: repeatedHex(0xdd, 32),
    vaultOutputIndex: 0,
    vaultBoxIdHex: repeatedHex(0xee, 32),
    vaultErgoTreeHashHex: admissionProfile.vaultErgoTreeHashHex,
    commitmentInclusionBlockIdHex: repeatedHex(0x12, 32),
    commitmentInclusionHeight: '500000',
    acceptanceCheckpointBlockIdHex: repeatedHex(0x13, 32),
    acceptanceCheckpointHeight: '500011',
    finalityPolicyIdHex: PEG_IN_CAUSAL_SOURCE_FINALITY_POLICY_ID_V1_HEX,
    requiredConfirmations: PEG_IN_CAUSAL_SOURCE_PROOF_REQUIRED_CONFIRMATIONS_V1,
  };
  return {
    schema: PEG_IN_CAUSAL_SOURCE_PROOF_ADMISSION_V1_SCHEMA,
    candidateIdHex: derivePegInCausalAdmissionIdV2Hex(statement),
    admissionProfile,
    sourceIntent,
    statement,
    sourceBoxCanonicalHex: '0x010203',
    commitmentTransactionCanonicalHex: '0x040506',
    vaultSuccessorCanonicalHex: '0x070809',
    inclusionProofCanonicalHex: '0x0a0b0c',
    checkpointAncestryCanonicalHex: '0x0d0e0f',
    finalityProofCanonicalHex: '0x101112',
    verifierExecutableSha256Hex: repeatedHex(0x87, 32),
    sourceConsumption: {
      consumedSourceBoxIdHex: statement.sourceBoxIdHex,
      consumingTransactionIdHex: statement.commitmentTransactionIdHex,
      vaultOutputIndex: statement.vaultOutputIndex,
      vaultBoxIdHex: statement.vaultBoxIdHex,
      commitmentInclusionBlockIdHex: statement.commitmentInclusionBlockIdHex,
      commitmentInclusionHeight: statement.commitmentInclusionHeight,
      acceptanceCheckpointBlockIdHex: statement.acceptanceCheckpointBlockIdHex,
      acceptanceCheckpointHeight: statement.acceptanceCheckpointHeight,
      finalityPolicyIdHex: statement.finalityPolicyIdHex,
    },
  };
}

export function signPegInCausalSourceProofResultFieldsV1Fixture(
  result: PegInCausalSourceProofResultFieldsV1,
  signerIndexes: readonly number[] = [0, 1],
): readonly PegInCausalSourceProofSignatureV1[] {
  const resultIdHex = derivePegInCausalSourceProofResultIdV1Hex(result);
  const attestationDigest = Buffer.from(
    derivePegInCausalSourceProofAttestationDigestV1Hex(resultIdHex).slice(2),
    'hex',
  );
  return signerIndexes.map(index => {
    const signer = FIXTURE_SIGNERS[index];
    if (signer === undefined) throw new Error(`unknown fixture signer ${index}`);
    return {
      signerPublicKeyHex: signer.publicKeyHex,
      signatureHex: `0x${signMessage(null, attestationDigest, signer.privateKey).toString('hex')}`,
    };
  });
}

export function createPegInCausalSourceProofEnvelopeV1Fixture(input: {
  readonly request: PegInCausalSourceProofRequestV1;
  readonly issuedAtNativeHeight?: string;
  readonly expiresAtNativeHeight?: string;
  readonly signerIndexes?: readonly number[];
}): PegInCausalSourceProofEnvelopeV1 {
  const result = buildPegInCausalSourceProofResultFieldsV1({
    request: input.request,
    issuedAtNativeHeight: input.issuedAtNativeHeight ?? '1000',
    expiresAtNativeHeight: input.expiresAtNativeHeight ?? '1064',
  });
  return {
    result,
    signatures: signPegInCausalSourceProofResultFieldsV1Fixture(
      result,
      input.signerIndexes,
    ),
  };
}

export function createValidatedPegInCausalSourceProofResultV1Fixture(
  label: string,
): Readonly<{
  request: PegInCausalSourceProofRequestV1;
  envelope: PegInCausalSourceProofEnvelopeV1;
  result: PegInCausalSourceProofResultV1;
}> {
  const request = createPegInCausalSourceProofRequestV1Fixture(label);
  const envelope = createPegInCausalSourceProofEnvelopeV1Fixture({ request });
  return {
    request,
    envelope,
    result: validatePegInCausalSourceProofEnvelopeV1({
      request,
      envelope,
      currentNativeHeight: '1001',
    }),
  };
}

export function fixtureHash(value: string): string {
  let state = 0;
  for (const character of value) state = (state * 31 + character.charCodeAt(0)) >>> 0;
  return `0x${state.toString(16).padStart(64, '0')}`;
}

function fixtureAddress(value: string): string {
  return `0x${fixtureHash(value).slice(-40)}`;
}

function repeatedHex(byte: number, length: number): string {
  return `0x${byte.toString(16).padStart(2, '0').repeat(length)}`;
}
