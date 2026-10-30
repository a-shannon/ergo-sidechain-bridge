import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

import blakejs from 'blakejs';

import {
  decodeSubstrateFederatedSettlementFamilyV1Profile,
  SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_DOMAIN,
  SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_SCHEMA,
} from './substrate-federated-settlement-family-v1.js';
import { parseStrictJson } from './strict-json.js';

export const SUBSTRATE_FEDERATED_TRACKER_V2_RESERVE_V7_FAMILY_IDENTITY_V1_SCHEMA =
  'e2s.substrate-federated-tracker-v2-reserve-v7-family-identity.v1' as const;
export const SUBSTRATE_FEDERATED_TRACKER_V2_RESERVE_V7_RECEIPT_SHA256_HEX =
  'a48a49ead2b1072bdb46acd42fa7a735be94e01a0696a15a3c51e32bbead6db6' as const;

const INTENT_SHA =
  'f1b153e054a00099d0d786a638a4191d4325fee3dda20595fd532360f392539a';
const ADMISSION_SHA =
  '87b1db594810e8e21f4132ed51ee929dde6a07cce9f690ec8bba2fc90c57f5be';
const ROLES = [
  'tracker', 'duplicatePrevention', 'sourceLock', 'pooledReserve',
] as const;
type Role = typeof ROLES[number];
const TEMPLATE_PATHS = {
  tracker: 'contracts/SPVTrackerSubstrateFederatedV2.es',
  duplicatePrevention: 'contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
  sourceLock: 'contracts/MainChainLockPooledReserveV6.es',
  pooledReserve: 'contracts/MainChainPooledReserveValidityApplicationV7.es',
} as const;
const TEMPLATE_SHA = {
  tracker: '110b1aa22d59e1202435bb139cadbb49f28a48c8b8a3056d0426e620ee828eec',
  duplicatePrevention: 'a3902150efcdeb4025a50c6a14149d9dc656232c5c65c923a91f85658ddaa12f',
  sourceLock: 'f03c1e2ecbb0433d9b5bcad2489467bee26e2e03543ec2a1cd61c18aba21db6b',
  pooledReserve: 'cc507306454541c09e9e9be1d38d6858566aff4f31b260166e946161499a7229',
} as const;
const COMPILED = {
  tracker: {
    bytes: 2767,
    source: '015e7f3c82895ded29432b90395dd86a273a4108d3fcea7e6d304d23ed3551f4',
    proposition: '7a467ebcaf12709f51215b038d0c3f6b6a591fcede84553e4c0dd61f53699dc7',
    id: '9e9a4bc54640a35299110f9870b8ffab6d7ed5a64cb39dbe323d805caaa91da7',
  },
  duplicatePrevention: {
    bytes: 3419,
    source: 'c7450301980d2fe0a42de4604d06936bc765a7a3bc57231b3b93a108c2441569',
    proposition: '895d286dc2a3379486ba2e426279ef73c21b93509d68c8a5a4952e65a97976c7',
    id: '0b9403ef836effe2a402fd85fb006ee1dd3805dacfe470a384185267fd1ef2de',
  },
  sourceLock: {
    bytes: 1317,
    source: 'f71a6c1eb975e5db121f60cf276a76e9a7bb2c2b412e0edfff77414613d75013',
    proposition: '0751ed1f5321b7f212f611d84e25cb8fc3ab3f0b7971d64edea4a2997b0e8a18',
    id: '36aa9030eb5fc45dbcac71b75dc717aadc023a23981fd051708d11a6b1908de2',
  },
  pooledReserve: {
    bytes: 1985,
    source: 'e1b0f3e360a7d5d0fcf4699704c50015dcf529ed4777721ce19868ed352d3bb3',
    proposition: '1e89d0b6a1675cc4aa74aa37eafa973e12466cf22146c6210f9801fd13abb586',
    id: 'cd987d5a77ee19f2fa3894d4d2265207156638a40fbdaefe85f3d512b38fc320',
  },
} as const;
const FALSE_FIELDS = [
  'profileActivated',
  'nodeCheckPerformed',
  'signingAuthorityEstablished',
  'submissionAuthorityEstablished',
  'broadcastAuthorityEstablished',
  'fundsAuthorityEstablished',
  'gate5Closed',
] as const;
const RECEIPT_FIELDS = [
  'schema', 'version', 'sigmaStateCommit', 'scalaVersion', 'sbtVersion',
  'compilerIntentSha256Hex', 'trackerAnchorSelector', 'familySchema',
  'familyProfileHex', 'familyIdHex', 'contracts', ...FALSE_FIELDS,
] as const;
const CONTRACT_FIELDS = [
  'schema', 'version', 'role', 'scriptVersion', 'treeVersion',
  'resolvedSourceSha256Hex', 'propositionBytes', 'propositionSha256Hex',
  'propositionHex', 'contractIdHex',
] as const;
const INTENT_FIELDS = [
  'schema', 'version', 'sigmaStateCommit', 'compiler', 'admissionVector',
  'templates', 'tracker', 'application', 'family', 'boundaries',
] as const;

export interface SubstrateFederatedTrackerV2ReserveV7TemplateV1 {
  readonly role: Role;
  readonly relativePath: string;
  readonly sourceBytes: Uint8Array;
}

export interface ValidateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1Input {
  readonly receiptBytes: Uint8Array;
  readonly intentBytes: Uint8Array;
  readonly admissionBytes: Uint8Array;
  readonly templates: readonly SubstrateFederatedTrackerV2ReserveV7TemplateV1[];
}

/** Static source fixture only; this does not attest a process-owned compiler run. */
export function validateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1(
  input: ValidateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1Input,
) {
  exact(input, [
    'receiptBytes', 'intentBytes', 'admissionBytes', 'templates',
  ], 'V7 identity input');
  const receiptBytes = boundedBytes(input.receiptBytes, 32 * 1024, 'V7 receipt');
  const intentBytes = boundedBytes(input.intentBytes, 8 * 1024, 'V7 intent');
  const admissionBytes = boundedBytes(input.admissionBytes, 8 * 1024, 'admission vector');
  equal(sha(intentBytes), INTENT_SHA, 'compiler intent SHA-256');
  equal(sha(admissionBytes), ADMISSION_SHA, 'admission vector SHA-256');
  const receipt = exact(parseJson(receiptBytes, 'V7 receipt'), RECEIPT_FIELDS, 'V7 receipt');
  const intent = exact(parseJson(intentBytes, 'V7 intent'), INTENT_FIELDS, 'V7 intent');
  const admission = exact(parseJson(admissionBytes, 'admission vector'), [
    'schema', 'version', 'status', 'input', 'expected', 'boundaries',
  ], 'admission vector');

  equal(text(intent, 'schema'), 'e2s.substrate-federated-tracker-v2-reserve-v7-family-compiler-intent.v1', 'intent schema');
  equal(integer(intent, 'version'), 1, 'intent version');
  equal(text(intent, 'sigmaStateCommit'), 'f78deadd668f801e7fae3bc884283f79c6f484fa', 'intent SigmaState commit');
  const compiler = exact(intent.compiler, ['scriptVersion', 'treeVersion'], 'intent compiler');
  equal(integer(compiler, 'scriptVersion'), 3, 'intent script version');
  equal(integer(compiler, 'treeVersion'), 0, 'intent tree version');
  const admissionRef = exact(intent.admissionVector, ['relativePath', 'sha256Hex'], 'admission reference');
  equal(text(admissionRef, 'relativePath'), 'relayer/test-vectors/substrate-federated-v1-tracker-admission.json', 'admission path');
  equal(text(admissionRef, 'sha256Hex'), ADMISSION_SHA, 'admission reference SHA-256');
  const tracker = exact(intent.tracker, [
    'anchorSelector', 'trackerNftIdHex', 'federationProfileIdHex',
    'sourceAttestationKeySetDigestHex', 'sourceAttestationThreshold',
    'ergoAdmissionKeySetDigestHex', 'ergoAdmissionThreshold',
    'ergoAdmissionPublicKeysHex', 'federationEpoch',
    'maxAdmissionValidityBlocks',
  ], 'intent tracker');
  const application = exact(intent.application, [
    'sourceNetworkIdHex', 'sidechainIdHex', 'bridgeAddressHex',
    'tokenAddressHex', 'bridgeRuntimeCodeSha256Hex',
    'bridgeRuntimeCodeBytes', 'tokenRuntimeCodeSha256Hex',
    'tokenRuntimeCodeBytes', 'sourceRuntimeCodeSha256Hex',
    'sourceRuntimeCodeBytes', 'runtimeProfileIdHex',
    'settlementProfileIdHex',
  ], 'intent application');
  const family = exact(intent.family, [
    'schema', 'version', 'duplicatePreventionNftIdHex',
    'pooledReserveNftIdHex', 'sourceRefundDelayBlocks',
    'minimumAnchorConfirmations', 'maximumSuccessorCreationHeightLag',
    'minimumExternalFeeNanoErg', 'maximumExternalFeeNanoErg',
    'settlementAssetIdHex',
  ], 'intent family');
  falseFields(exact(intent.boundaries, FALSE_FIELDS, 'intent boundaries'), 'intent boundaries');
  equal(text(tracker, 'anchorSelector'), 'absolute-ergo-header-height', 'tracker selector');
  equal(text(family, 'schema'), SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_SCHEMA, 'family schema');
  equal(integer(family, 'version'), 1, 'family version');
  const trackerNft = fixedHex(tracker.trackerNftIdHex, 32, 'tracker NFT');
  const dupNft = fixedHex(family.duplicatePreventionNftIdHex, 32, 'DUP NFT');
  const reserveNft = fixedHex(family.pooledReserveNftIdHex, 32, 'reserve NFT');
  if (new Set([trackerNft, dupNft, reserveNft]).size !== 3) {
    throw new Error('V7 singleton NFT IDs must be distinct');
  }
  equal(integer(family, 'sourceRefundDelayBlocks'), 10_000, 'refund delay');
  equal(integer(family, 'minimumAnchorConfirmations'), 10, 'minimum confirmations');
  equal(integer(family, 'maximumSuccessorCreationHeightLag'), 100, 'successor lag');
  equal(text(family, 'minimumExternalFeeNanoErg'), '1000000', 'minimum fee');
  equal(text(family, 'maximumExternalFeeNanoErg'), '2100000', 'maximum fee');
  equal(fixedHex(family.settlementAssetIdHex, 32, 'settlement asset'), '00'.repeat(32), 'native ERG asset');

  if (!Array.isArray(intent.templates) || intent.templates.length !== ROLES.length
    || !Array.isArray(input.templates) || input.templates.length !== ROLES.length) {
    throw new Error('V7 template role count is invalid');
  }
  const sources = {} as Record<Role, string>;
  for (const [index, role] of ROLES.entries()) {
    const reference = exact(intent.templates[index], [
      'role', 'relativePath', 'sha256Hex',
    ], role + ' template reference');
    const supplied = exact(input.templates[index], [
      'role', 'relativePath', 'sourceBytes',
    ], role + ' source input');
    equal(text(reference, 'role'), role, role + ' intent role');
    equal(text(reference, 'relativePath'), TEMPLATE_PATHS[role], role + ' template path');
    equal(text(reference, 'sha256Hex'), TEMPLATE_SHA[role], role + ' intent template SHA-256');
    equal(text(supplied, 'role'), role, role + ' source role');
    equal(text(supplied, 'relativePath'), TEMPLATE_PATHS[role], role + ' source path');
    const sourceBytes = boundedBytes(supplied.sourceBytes as Uint8Array, 64 * 1024, role + ' template');
    const source = asciiSource(sourceBytes, role + ' template');
    equal(sha(sourceBytes), TEMPLATE_SHA[role], role + ' source SHA-256');
    sources[role] = source;
  }
  checkAdmission(admission, tracker, application);

  equal(text(receipt, 'schema'), 'e2s.substrate-federated-tracker-v2-reserve-v7-family-compiler-batch.v1', 'receipt schema');
  equal(integer(receipt, 'version'), 1, 'receipt version');
  equal(text(receipt, 'sigmaStateCommit'), text(intent, 'sigmaStateCommit'), 'receipt SigmaState commit');
  equal(text(receipt, 'scalaVersion'), '2.13.18', 'Scala version');
  equal(text(receipt, 'sbtVersion'), '1.12.11', 'sbt version');
  equal(text(receipt, 'compilerIntentSha256Hex'), INTENT_SHA, 'receipt intent SHA-256');
  equal(text(receipt, 'trackerAnchorSelector'), text(tracker, 'anchorSelector'), 'receipt tracker selector');
  equal(text(receipt, 'familySchema'), SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_SCHEMA, 'receipt family schema');
  falseFields(receipt, 'V7 receipt');
  if (!Array.isArray(receipt.contracts) || receipt.contracts.length !== ROLES.length) {
    throw new Error('V7 receipt contract role count is invalid');
  }
  const contracts = {} as Record<Role, Readonly<{
    resolvedSourceSha256Hex: string;
    propositionBytes: number;
    propositionSha256Hex: string;
    contractIdHex: string;
  }>>;
  for (const [index, role] of ROLES.entries()) {
    const contract = exact(receipt.contracts[index], CONTRACT_FIELDS, role + ' contract');
    equal(text(contract, 'schema'), 'e2s.substrate-federated-tracker-v2-reserve-v7-compiler-receipt.v1', role + ' schema');
    equal(integer(contract, 'version'), 1, role + ' version');
    equal(text(contract, 'role'), role, role + ' role');
    equal(integer(contract, 'scriptVersion'), 3, role + ' script version');
    equal(integer(contract, 'treeVersion'), 0, role + ' tree version');
    const propositionBytes = integer(contract, 'propositionBytes');
    if (propositionBytes < 1 || propositionBytes >= 4096) {
      throw new Error(role + ' proposition length is out of bounds');
    }
    const propositionHex = fixedHex(contract.propositionHex, propositionBytes, role + ' proposition');
    const proposition = Buffer.from(propositionHex, 'hex');
    const sourceSha = fixedHex(contract.resolvedSourceSha256Hex, 32, role + ' resolved source');
    const propositionSha = fixedHex(contract.propositionSha256Hex, 32, role + ' proposition SHA-256');
    const contractId = fixedHex(contract.contractIdHex, 32, role + ' contract ID');
    equal(sha(proposition), propositionSha, role + ' proposition SHA-256');
    equal(blake(proposition), contractId, role + ' proposition contract ID');
    equal(propositionBytes, COMPILED[role].bytes, role + ' proposition byte pin');
    equal(sourceSha, COMPILED[role].source, role + ' resolved source pin');
    equal(propositionSha, COMPILED[role].proposition, role + ' proposition pin');
    equal(contractId, COMPILED[role].id, role + ' contract ID pin');
    contracts[role] = {
      resolvedSourceSha256Hex: sourceSha,
      propositionBytes,
      propositionSha256Hex: propositionSha,
      contractIdHex: contractId,
    };
  }
  if (new Set(ROLES.map(role => contracts[role].contractIdHex)).size !== 4) {
    throw new Error('V7 contract IDs must be distinct');
  }
  const profileBytes = encodeFamily(tracker, application, family, contracts.tracker.contractIdHex);
  const profileHex = fixedHex(receipt.familyProfileHex, 596, 'family profile');
  equal(profileHex, profileBytes.toString('hex'), 'family profile bindings');
  const familyId = fixedHex(receipt.familyIdHex, 32, 'family ID');
  equal(familyId, blake(Buffer.concat([
    Buffer.from(SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_DOMAIN, 'ascii'),
    profileBytes,
  ])), 'family ID');
  decodeSubstrateFederatedSettlementFamilyV1Profile({
    schema: SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_SCHEMA,
    version: 1,
    encodedProfileHex: profileHex,
    familyIdHex: familyId,
    duplicatePreventionNftIdHex: dupNft,
    pooledReserveNftIdHex: reserveNft,
  });
  const compiledSources = {
    tracker: replaceExactly(sources.tracker, trackerReplacements(tracker, application), 'tracker'),
    duplicatePrevention: replaceExactly(
      sources.duplicatePrevention,
      duplicateReplacements(tracker, application, family, familyId, contracts.tracker.contractIdHex),
      'duplicate prevention',
    ),
    sourceLock: replaceExactly(
      sources.sourceLock,
      sourceLockReplacements(application, reserveNft, familyId),
      'source lock',
    ),
    pooledReserve: replaceExactly(
      sources.pooledReserve,
      reserveReplacements(application, family, familyId,
        contracts.duplicatePrevention.contractIdHex, contracts.sourceLock.contractIdHex),
      'pooled reserve',
    ),
  };
  for (const role of ROLES) {
    equal(sha(Buffer.from(compiledSources[role], 'ascii')),
      contracts[role].resolvedSourceSha256Hex, role + ' resolved source SHA-256');
  }
  return deepFreeze({
    schema: SUBSTRATE_FEDERATED_TRACKER_V2_RESERVE_V7_FAMILY_IDENTITY_V1_SCHEMA,
    version: 1 as const,
    provenance: 'source-only-static-jvm-fixture' as const,
    receiptSha256Hex: sha(receiptBytes),
    compilerIntentSha256Hex: INTENT_SHA,
    trackerAnchorSelector: 'absolute-ergo-header-height' as const,
    familySchema: SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_SCHEMA,
    familyProfileHex: profileHex,
    familyIdHex: familyId,
    contracts,
    boundaries: {
      profileActivated: false as const,
      nodeCheckPerformed: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
    },
  });
}

export function assertPinnedSubstrateFederatedTrackerV2ReserveV7FamilyFixtureV1(
  input: ValidateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1Input,
) {
  const identity = validateSubstrateFederatedTrackerV2ReserveV7FamilyIdentityV1(input);
  equal(identity.receiptSha256Hex,
    SUBSTRATE_FEDERATED_TRACKER_V2_RESERVE_V7_RECEIPT_SHA256_HEX,
    'frozen V7 compiler fixture SHA-256');
  return identity;
}

function checkAdmission(
  admission: Record<string, unknown>,
  tracker: Record<string, unknown>,
  application: Record<string, unknown>,
): void {
  equal(text(admission, 'schema'), 'e2s.substrate-federated-v1-tracker-admission.golden-vector', 'admission schema');
  equal(integer(admission, 'version'), 1, 'admission version');
  const input = record(admission.input, 'admission input');
  const profile = record(input.profile, 'admission profile');
  const statement = record(input.statement, 'admission statement');
  const expected = record(admission.expected, 'admission expected');
  const anchoredTracker = record(input.tracker, 'admission tracker');
  for (const key of [
    'federationProfileIdHex', 'sourceAttestationKeySetDigestHex',
    'ergoAdmissionKeySetDigestHex',
  ]) equal(text(tracker, key), text(expected, key), key + ' admission binding');
  for (const key of ['sourceAttestationThreshold', 'ergoAdmissionThreshold']) {
    equal(integer(tracker, key), integer(profile, key), key + ' admission binding');
  }
  for (const key of ['federationEpoch', 'maxAdmissionValidityBlocks']) {
    equal(text(tracker, key), text(profile, key), key + ' admission binding');
  }
  const keys = tracker.ergoAdmissionPublicKeysHex;
  const admittedKeys = profile.ergoAdmissionPublicKeysHex;
  if (!Array.isArray(keys) || !Array.isArray(admittedKeys)
    || keys.length !== 3 || admittedKeys.length !== 3) {
    throw new Error('Ergo admission public key count is invalid');
  }
  for (let index = 0; index < 3; index += 1) {
    equal(fixedHex(keys[index], 33, 'Ergo admission key'),
      admittedKeys[index], 'Ergo admission key binding');
  }
  for (const key of [
    'sourceNetworkIdHex', 'sidechainIdHex', 'bridgeAddressHex',
    'tokenAddressHex', 'bridgeRuntimeCodeSha256Hex',
    'tokenRuntimeCodeSha256Hex', 'sourceRuntimeCodeSha256Hex',
    'runtimeProfileIdHex', 'settlementProfileIdHex',
  ]) equal(text(application, key), text(statement, key), key + ' admission binding');
  for (const key of [
    'bridgeRuntimeCodeBytes', 'tokenRuntimeCodeBytes', 'sourceRuntimeCodeBytes',
  ]) equal(integer(application, key), integer(statement, key), key + ' admission binding');
  equal(text(tracker, 'trackerNftIdHex'), text(anchoredTracker, 'trackerNftIdHex'), 'tracker NFT admission binding');
}

function encodeFamily(
  tracker: Record<string, unknown>,
  application: Record<string, unknown>,
  family: Record<string, unknown>,
  trackerContractId: string,
): Buffer {
  const parts = [
    Buffer.from([1, 1, 1, 0]),
    fromHex(application.sourceNetworkIdHex, 32, 'source network ID'),
    fromHex(application.sidechainIdHex, 32, 'sidechain ID'),
    fromHex(application.bridgeAddressHex, 20, 'bridge address'),
    fromHex(application.tokenAddressHex, 20, 'token address'),
    fromHex(application.runtimeProfileIdHex, 32, 'runtime profile ID'),
    fromHex(application.settlementProfileIdHex, 32, 'settlement profile ID'),
    fromHex(tracker.federationProfileIdHex, 32, 'federation profile ID'),
    fromHex(tracker.sourceAttestationKeySetDigestHex, 32, 'source key-set digest'),
    uint(integer(tracker, 'sourceAttestationThreshold'), 2, 'source threshold'),
    fromHex(tracker.ergoAdmissionKeySetDigestHex, 32, 'Ergo key-set digest'),
    uint(integer(tracker, 'ergoAdmissionThreshold'), 2, 'Ergo threshold'),
    uint(positiveDecimal(tracker.federationEpoch, 'federation epoch'), 8, 'federation epoch'),
    fromHex(tracker.trackerNftIdHex, 32, 'tracker NFT'),
    fromHex(family.duplicatePreventionNftIdHex, 32, 'DUP NFT'),
    fromHex(family.pooledReserveNftIdHex, 32, 'reserve NFT'),
    fromHex(trackerContractId, 32, 'tracker contract ID'),
    ...ROLES.map(role => Buffer.from(TEMPLATE_SHA[role], 'hex')),
    uint(integer(family, 'sourceRefundDelayBlocks'), 4, 'refund delay'),
    uint(integer(family, 'minimumAnchorConfirmations'), 4, 'minimum confirmations'),
    uint(integer(family, 'maximumSuccessorCreationHeightLag'), 4, 'successor lag'),
    uint(positiveDecimal(family.minimumExternalFeeNanoErg, 'minimum fee'), 8, 'minimum fee'),
    uint(positiveDecimal(family.maximumExternalFeeNanoErg, 'maximum fee'), 8, 'maximum fee'),
    fromHex(family.settlementAssetIdHex, 32, 'settlement asset'),
  ];
  const encoded = Buffer.concat(parts);
  equal(encoded.length, 596, 'family profile length');
  return encoded;
}

function trackerReplacements(t: Record<string, unknown>, a: Record<string, unknown>): [string, string][] {
  const keys = t.ergoAdmissionPublicKeysHex as string[];
  const sigmaProps = keys.map(key => 'proveDlog(decodePoint(fromBase16("' + key + '")))').join(',\n    ');
  return [
    ['FEDERATED_TRACKER_NFT_ID_PLACEHOLDER', text(t, 'trackerNftIdHex')],
    ['FEDERATED_SOURCE_NETWORK_ID_PLACEHOLDER', text(a, 'sourceNetworkIdHex')],
    ['FEDERATED_SIDECHAIN_ID_PLACEHOLDER', text(a, 'sidechainIdHex')],
    ['FEDERATED_BRIDGE_ADDRESS_PLACEHOLDER', text(a, 'bridgeAddressHex')],
    ['FEDERATED_TOKEN_ADDRESS_PLACEHOLDER', text(a, 'tokenAddressHex')],
    ['FEDERATED_BRIDGE_RUNTIME_HASH_PLACEHOLDER', text(a, 'bridgeRuntimeCodeSha256Hex')],
    ['FEDERATED_BRIDGE_RUNTIME_BYTES_PLACEHOLDER', uint(integer(a, 'bridgeRuntimeCodeBytes'), 4, 'bridge runtime bytes').toString('hex')],
    ['FEDERATED_TOKEN_RUNTIME_HASH_PLACEHOLDER', text(a, 'tokenRuntimeCodeSha256Hex')],
    ['FEDERATED_TOKEN_RUNTIME_BYTES_PLACEHOLDER', uint(integer(a, 'tokenRuntimeCodeBytes'), 4, 'token runtime bytes').toString('hex')],
    ['FEDERATED_SOURCE_RUNTIME_HASH_PLACEHOLDER', text(a, 'sourceRuntimeCodeSha256Hex')],
    ['FEDERATED_SOURCE_RUNTIME_BYTES_PLACEHOLDER', uint(integer(a, 'sourceRuntimeCodeBytes'), 4, 'source runtime bytes').toString('hex')],
    ['FEDERATED_RUNTIME_PROFILE_ID_PLACEHOLDER', text(a, 'runtimeProfileIdHex')],
    ['FEDERATED_SETTLEMENT_PROFILE_ID_PLACEHOLDER', text(a, 'settlementProfileIdHex')],
    ['FEDERATED_PROFILE_ID_PLACEHOLDER', text(t, 'federationProfileIdHex')],
    ['FEDERATED_SOURCE_KEY_SET_DIGEST_PLACEHOLDER', text(t, 'sourceAttestationKeySetDigestHex')],
    ['FEDERATED_SOURCE_THRESHOLD_PLACEHOLDER', uint(integer(t, 'sourceAttestationThreshold'), 2, 'source threshold').toString('hex')],
    ['FEDERATED_ERGO_KEY_SET_DIGEST_PLACEHOLDER', text(t, 'ergoAdmissionKeySetDigestHex')],
    ['FEDERATED_ERGO_THRESHOLD_BYTES_PLACEHOLDER', uint(integer(t, 'ergoAdmissionThreshold'), 2, 'Ergo threshold').toString('hex')],
    ['FEDERATED_EPOCH_PLACEHOLDER', uint(positiveDecimal(t.federationEpoch, 'federation epoch'), 8, 'federation epoch').toString('hex')],
    ['FEDERATED_MAX_ADMISSION_VALIDITY_BLOCKS_PLACEHOLDER', text(t, 'maxAdmissionValidityBlocks') + 'L'],
    ['FEDERATED_ERGO_SIGMAPROP_PLACEHOLDERS', sigmaProps],
    ['FEDERATED_ERGO_THRESHOLD_PLACEHOLDER', String(integer(t, 'ergoAdmissionThreshold'))],
  ];
}

function duplicateReplacements(
  t: Record<string, unknown>, a: Record<string, unknown>, f: Record<string, unknown>,
  familyId: string, trackerId: string,
): [string, string][] {
  return [
    ['FEDERATED_SETTLEMENT_TRACKER_NFT_ID_PLACEHOLDER', text(t, 'trackerNftIdHex')],
    ['FEDERATED_SETTLEMENT_DUP_NFT_ID_PLACEHOLDER', text(f, 'duplicatePreventionNftIdHex')],
    ['FEDERATED_SETTLEMENT_RESERVE_NFT_ID_PLACEHOLDER', text(f, 'pooledReserveNftIdHex')],
    ['FEDERATED_SETTLEMENT_FAMILY_ID_PLACEHOLDER', familyId],
    ['FEDERATED_SETTLEMENT_TRACKER_CONTRACT_ID_PLACEHOLDER', trackerId],
    ['FEDERATED_SETTLEMENT_SOURCE_NETWORK_ID_PLACEHOLDER', text(a, 'sourceNetworkIdHex')],
    ['FEDERATED_SETTLEMENT_SIDECHAIN_ID_PLACEHOLDER', text(a, 'sidechainIdHex')],
    ['FEDERATED_SETTLEMENT_RUNTIME_PROFILE_ID_PLACEHOLDER', text(a, 'runtimeProfileIdHex')],
    ['FEDERATED_SETTLEMENT_PROFILE_ID_PLACEHOLDER', text(a, 'settlementProfileIdHex')],
    ['FEDERATED_SETTLEMENT_FEDERATION_PROFILE_ID_PLACEHOLDER', text(t, 'federationProfileIdHex')],
    ['FEDERATED_SETTLEMENT_ERGO_KEY_SET_DIGEST_PLACEHOLDER', text(t, 'ergoAdmissionKeySetDigestHex')],
    ['FEDERATED_SETTLEMENT_ERGO_THRESHOLD_PLACEHOLDER', uint(integer(t, 'ergoAdmissionThreshold'), 2, 'Ergo threshold').toString('hex')],
    ['FEDERATED_SETTLEMENT_EPOCH_PLACEHOLDER', uint(positiveDecimal(t.federationEpoch, 'federation epoch'), 8, 'federation epoch').toString('hex')],
  ];
}

function sourceLockReplacements(a: Record<string, unknown>, reserveNft: string, familyId: string): [string, string][] {
  return [
    ['POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER', text(a, 'sourceNetworkIdHex')],
    ['POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER', text(a, 'sidechainIdHex')],
    ['POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER', text(a, 'bridgeAddressHex')],
    ['POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER', text(a, 'tokenAddressHex')],
    ['POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER', text(a, 'settlementProfileIdHex')],
    ['POOLED_RESERVE_PROFILE_ID_PLACEHOLDER', familyId],
    ['POOLED_RESERVE_NFT_ID_PLACEHOLDER', reserveNft],
  ];
}

function reserveReplacements(
  a: Record<string, unknown>, f: Record<string, unknown>, familyId: string,
  duplicateId: string, sourceLockId: string,
): [string, string][] {
  return [
    ['POOLED_RESERVE_DUP_NFT_ID_PLACEHOLDER', text(f, 'duplicatePreventionNftIdHex')],
    ['POOLED_RESERVE_NFT_ID_PLACEHOLDER', text(f, 'pooledReserveNftIdHex')],
    ['POOLED_RESERVE_PROFILE_ID_PLACEHOLDER', familyId],
    ['POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER', text(a, 'sidechainIdHex')],
    ['POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER', text(a, 'sourceNetworkIdHex')],
    ['POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER', text(a, 'bridgeAddressHex')],
    ['POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER', text(a, 'tokenAddressHex')],
    ['POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER', text(a, 'settlementProfileIdHex')],
    ['POOLED_RESERVE_DUP_CONTRACT_ID_PLACEHOLDER', duplicateId],
    ['POOLED_RESERVE_SOURCE_LOCK_CONTRACT_ID_PLACEHOLDER', sourceLockId],
  ];
}

function replaceExactly(source: string, replacements: readonly (readonly [string, string])[], label: string): string {
  let resolved = source;
  for (const [placeholder, value] of replacements) {
    if (resolved.split(placeholder).length !== 2) {
      throw new Error(label + ' placeholder count is not one: ' + placeholder);
    }
    resolved = resolved.replace(placeholder, value);
  }
  if (/[A-Z][A-Z0-9_]+_PLACEHOLDERS?/.test(resolved)) {
    throw new Error(label + ' retains a placeholder');
  }
  if (!Buffer.from(resolved, 'ascii').equals(Buffer.from(resolved, 'utf8'))) {
    throw new Error(label + ' resolved source is not ASCII');
  }
  return resolved;
}

function boundedBytes(value: Uint8Array, maximum: number, label: string): Buffer {
  if (!(value instanceof Uint8Array) || value.length === 0 || value.length > maximum) {
    throw new Error(label + ' byte length is invalid');
  }
  return Buffer.from(value);
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error(label + ' must be BOM-free LF-only JSON');
  }
  const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (value.charCodeAt(0) === 0xfeff || value.includes('\r') || !value.endsWith('\n')) {
    throw new Error(label + ' must be BOM-free LF-only JSON');
  }
  return parseStrictJson(value, label);
}

function asciiSource(bytes: Uint8Array, label: string): string {
  if ([...bytes].some(byte => byte === 0 || byte === 13 || byte > 127)) {
    throw new Error(label + ' must be nonempty LF-only ASCII');
  }
  return Buffer.from(bytes).toString('ascii');
}

function exact(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(label + ' must be an object');
  }
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length
    || actual.some(key => typeof key !== 'string' || !keys.includes(key))) {
    throw new Error(label + ' fields are not exact');
  }
  return value as Record<string, unknown>;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(label + ' must be an object');
  }
  return value as Record<string, unknown>;
}

function text(value: Record<string, unknown>, key: string): string {
  if (typeof value[key] !== 'string') {
    throw new Error(key + ' must be text');
  }
  return value[key] as string;
}

function integer(value: Record<string, unknown>, key: string): number {
  if (typeof value[key] !== 'number' || !Number.isSafeInteger(value[key])) {
    throw new Error(key + ' must be a safe integer');
  }
  return value[key] as number;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string'
    || !new RegExp('^[0-9a-f]{' + bytes * 2 + '}$').test(value)) {
    throw new Error(label + ' must be ' + bytes + ' lowercase hex bytes');
  }
  return value;
}

function fromHex(value: unknown, bytes: number, label: string): Buffer {
  return Buffer.from(fixedHex(value, bytes, label), 'hex');
}

function positiveDecimal(value: unknown, label: string): bigint {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(label + ' must be canonical positive decimal');
  }
  const number = BigInt(value);
  if (number > 0x7fff_ffff_ffff_ffffn) {
    throw new Error(label + ' exceeds signed Long');
  }
  return number;
}

function uint(value: number | bigint, bytes: number, label: string): Buffer {
  const number = BigInt(value);
  if (number < 0n || number >= (1n << BigInt(bytes * 8))) {
    throw new Error(label + ' exceeds unsigned ' + bytes + '-byte width');
  }
  const encoded = Buffer.alloc(bytes);
  for (let index = bytes - 1, remaining = number; index >= 0; index -= 1, remaining >>= 8n) {
    encoded[index] = Number(remaining & 0xffn);
  }
  return encoded;
}

function falseFields(value: Record<string, unknown>, label: string): void {
  for (const key of FALSE_FIELDS) {
    if (value[key] !== false) throw new Error(label + ' must keep ' + key + ' false');
  }
}

function sha(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function blake(value: Uint8Array): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function equal(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(label + ' drifted');
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
