import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  buildSubstrateFederatedCheckpointProfileV1,
  buildSubstrateFederatedCheckpointStatementV1,
  deriveSubstrateFederatedCheckpointAttestationDigestHex,
} from '../profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  buildSubstrateFederatedTrackerAdmissionV1,
} from '../profiles/substrate-federated-v1/tracker-admission.js';

const output = parseOutput(process.argv.slice(2));
const profileInput = Object.freeze({
  federationEpoch: '7',
  maxAdmissionValidityBlocks: '64',
  sourceAttestationThreshold: 2,
  sourceAttestationPublicKeysHex: Object.freeze([
    '1111111111111111111111111111111111111111111111111111111111111111',
    '2222222222222222222222222222222222222222222222222222222222222222',
    '3333333333333333333333333333333333333333333333333333333333333333',
  ]),
  ergoAdmissionThreshold: 2,
  ergoAdmissionPublicKeysHex: Object.freeze([
    '0227562580bbfc2cf3f72b3dbb725f30f358ca545209255458536adcf1a4aad871',
    '02671c8e95c0237797901a6cdb2ef8e6599400578385455f3423f77e43df39aad5',
    '03b6447502eeff10813c6c7a01e1f2c3a97c54bbeeb3f9206984ccb0e63b0c56f3',
  ]),
});
const statementInput = Object.freeze({
  sourceNetworkIdHex: '01'.repeat(32),
  sidechainIdHex: '02'.repeat(32),
  sourceNativeBlockHeight: '1000',
  sourceNativeBlockHashHex: '03'.repeat(32),
  executionBlockHashHex: '04'.repeat(32),
  bridgeEventRootHex: '05'.repeat(32),
  burnLeafCount: 3,
  bridgeAddressHex: '06'.repeat(20),
  tokenAddressHex: '07'.repeat(20),
  bridgeRuntimeCodeSha256Hex: '08'.repeat(32),
  bridgeRuntimeCodeBytes: 12_345,
  tokenRuntimeCodeSha256Hex: '09'.repeat(32),
  tokenRuntimeCodeBytes: 6_789,
  sourceRuntimeCodeSha256Hex: '0a'.repeat(32),
  sourceRuntimeCodeBytes: 54_321,
  runtimeProfileIdHex: '0b'.repeat(32),
  settlementProfileIdHex: '0c'.repeat(32),
  admissionValidFromErgoHeight: '1010',
  admissionExpiresAtErgoHeight: '1060',
});
const trackerInput = Object.freeze({
  trackerNftIdHex: '0d'.repeat(32),
  currentErgoHeight: 1_030,
  anchorHeaderIdHex: '0e'.repeat(32),
  anchorHeaderHeight: 1_028,
});
const profile = buildSubstrateFederatedCheckpointProfileV1(profileInput);
const statement = buildSubstrateFederatedCheckpointStatementV1({
  profile,
  ...statementInput,
});
const admission = buildSubstrateFederatedTrackerAdmissionV1({
  profile,
  encodedStatementHex: statement.encodedStatementHex,
  currentErgoHeight: trackerInput.currentErgoHeight,
  anchorHeaderIdHex: trackerInput.anchorHeaderIdHex,
  anchorHeaderHeight: trackerInput.anchorHeaderHeight,
});
const vector = Object.freeze({
  schema: 'e2s.substrate-federated-v1-tracker-admission.golden-vector',
  version: 1,
  status: 'federated_non_trustless_non_authorizing',
  input: {
    profile: profileInput,
    statement: statementInput,
    tracker: trackerInput,
  },
  expected: {
    encodedProfileHex: profile.encodedProfileHex,
    federationProfileIdHex: profile.profileIdHex,
    sourceAttestationKeySetDigestHex: profile.sourceAttestationKeySetDigestHex,
    ergoAdmissionKeySetDigestHex: profile.ergoAdmissionKeySetDigestHex,
    encodedStatementHex: statement.encodedStatementHex,
    statementIdHex: statement.statementIdHex,
    attestationDigestHex: deriveSubstrateFederatedCheckpointAttestationDigestHex(
      statement.encodedStatementHex,
    ),
    extensionKeyHex: admission.extensionKeyHex,
    extensionValueHex: admission.extensionValueHex,
    trackerKeyHex: admission.trackerKeyHex,
    trackerValueHex: admission.trackerValueHex,
  },
  boundaries: {
    sourceThresholdSignaturesVerified: false,
    ergoAdmissionAuthorized: false,
    jvmReductionAccepted: false,
    signingPerformed: false,
    submissionPerformed: false,
    broadcastPerformed: false,
    profileActivated: false,
    fundsAuthorityEstablished: false,
    gate5Closed: false,
    trustlessStatusEstablished: false,
  },
});
const bytes = Buffer.from(`${JSON.stringify(vector, null, 2)}\n`, 'ascii');
if (bytes.length === 0 || bytes.includes(13) || bytes.some(byte => byte > 0x7f)) {
  throw new Error('federated tracker vector must be LF-only ASCII JSON');
}
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, bytes, { flag: 'wx' });
console.log(`vector_path=${output}`);

function parseOutput(args: readonly string[]): string {
  if (args.length !== 2 || args[0] !== '--output' || args[1].length === 0) {
    throw new Error('usage: --output <new-json-path>');
  }
  return resolve(args[1]);
}
