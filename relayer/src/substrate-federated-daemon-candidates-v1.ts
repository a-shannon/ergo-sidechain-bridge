import {
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';
import {
  registerSubstrateFederatedCandidatePreparationV1,
} from './adapters/substrate-federated-candidate-provenance-v1.js';
import {
  decodePegInSourceIntentV2Hex,
} from './peg-in-causal-admission-v2.js';
import {
  assertSubstrateFederatedCheckpointStatementV1MatchesProfile,
  decodeSubstrateFederatedCheckpointProfileV1,
  decodeSubstrateFederatedCheckpointStatementV1,
  type SubstrateFederatedCheckpointProfileV1,
  type SubstrateFederatedCheckpointStatementV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  deriveSubstrateFederatedTrackerKeyV1Hex,
} from './profiles/substrate-federated-v1/tracker-admission.js';
import type {
  AuthenticatedSettlementCandidateReconciliationView,
} from './relayer-core/authenticated-settlement-candidate-reconciliation.js';
import {
  assertSubstrateFederatedBurnSettlementV1Packet,
  type SubstrateFederatedBurnSettlementV1Packet,
} from './substrate-federated-burn-settlement-v1.js';
import {
  assertSubstrateFederatedSettlementFamilyV1Identity,
  decodeSubstrateFederatedSettlementFamilyV1Profile,
  type SubstrateFederatedSettlementFamilyV1Identity,
} from './substrate-federated-settlement-family-v1.js';
import {
  assertValidityApplicationPooledReserveMintReservationStatementV4Bindings,
  decodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
  deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex,
  encodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
  type ValidityApplicationPooledReserveMintReservationStatementV4,
} from './validity-application-pooled-reserve-mint-reservation-v4.js';

export const SUBSTRATE_FEDERATED_DAEMON_CANDIDATES_V1_SCHEMA =
  'e2s.substrate-federated-daemon-candidates.v1' as const;
export const SUBSTRATE_FEDERATED_MINT_DAEMON_CANDIDATE_V1_SCHEMA =
  'e2s.substrate-federated-mint-daemon-candidate.v1' as const;
export const SUBSTRATE_FEDERATED_BURN_DAEMON_CANDIDATE_V1_SCHEMA =
  'e2s.substrate-federated-burn-daemon-candidate.v1' as const;

const MINT_CANDIDATE_ID_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_MINT_DAEMON_CANDIDATE_V1';
const BURN_CANDIDATE_ID_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_BURN_DAEMON_CANDIDATE_V1';
const SETTLEMENT_TRANSACTION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_SETTLEMENT_TRANSACTION_V1';

interface NonAuthorizingCandidateBoundary {
  readonly localJournalAuthoritative: false;
  readonly mintAuthorized: false;
  readonly trackerAdmissionAuthorized: false;
  readonly payoutAuthorized: false;
  readonly checkPassed: false;
  readonly signingAuthorized: false;
  readonly submissionAuthorized: false;
  readonly broadcastAuthorized: false;
  readonly fundsAuthorityEstablished: false;
  readonly gate5Closed: false;
  readonly trustlessStatusEstablished: false;
  readonly productionReadinessEstablished: false;
}

export interface SubstrateFederatedMintDaemonCandidateV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_MINT_DAEMON_CANDIDATE_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'observed_non_authorizing';
  readonly candidateId: string;
  readonly statementHex: string;
  readonly statementIdHex: string;
  readonly reservationKeyHex: string;
  readonly sourceIntentIdHex: string;
  readonly lineageProfileIdHex: string;
  readonly familyProfileHex: string;
  readonly familyIdHex: string;
  readonly sourceNetworkIdHex: string;
  readonly sidechainIdHex: string;
  readonly bridgeAddressHex: string;
  readonly tokenAddressHex: string;
  readonly settlementProfileIdHex: string;
  readonly sourceAssetIdHex: string;
  readonly amountNanoErg: string;
  readonly recipientAddressHex: string;
  readonly sourceLockBoxIdHex: string;
  readonly successorReserveBoxIdHex: string;
  readonly targetHeaderIdHex: string;
  readonly targetHeight: string;
  readonly boundary: Readonly<NonAuthorizingCandidateBoundary>;
}

export interface SubstrateFederatedBurnDaemonCandidateV1
  extends AuthenticatedSettlementCandidateReconciliationView {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_BURN_DAEMON_CANDIDATE_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'prepared_non_authorizing';
  readonly sidechainId: string;
  readonly checkpointProfileHex: string;
  readonly checkpointProfileIdHex: string;
  readonly checkpointStatementHex: string;
  readonly checkpointStatementIdHex: string;
  readonly familyProfileHex: string;
  readonly familyIdHex: string;
  readonly trackerKeyHex: string;
  readonly trackerValueHex: string;
  readonly trackerInputDigestHex: string;
  readonly settlementTransactionIdHex: string;
  readonly settlementTransactionDigestHex: string;
  readonly amountNanoErg: string;
  readonly recipientErgoTreeHashHex: string;
  readonly boundary: Readonly<NonAuthorizingCandidateBoundary>;
}

export interface SubstrateFederatedDaemonCandidatesV1 {
  readonly schema: typeof SUBSTRATE_FEDERATED_DAEMON_CANDIDATES_V1_SCHEMA;
  readonly version: 1;
  readonly trustModel: 'federated_non_trustless';
  readonly sharedProfile: {
    readonly sourceNetworkIdHex: string;
    readonly sidechainIdHex: string;
    readonly bridgeAddressHex: string;
    readonly tokenAddressHex: string;
    readonly settlementProfileIdHex: string;
    readonly settlementAssetIdHex: string;
    readonly familyIdHex: string;
  };
  readonly mint: Readonly<SubstrateFederatedMintDaemonCandidateV1>;
  readonly burn: Readonly<SubstrateFederatedBurnDaemonCandidateV1>;
  readonly checks: {
    readonly canonicalMintReservationDecoded: true;
    readonly canonicalFederatedCheckpointDecoded: true;
    readonly exactFederatedSettlementFamilyVerified: true;
    readonly exactFederatedSettlementPacketVerified: true;
    readonly sourceAndSettlementProfilesBound: true;
    readonly mintAndBurnRemainIndependentPoolWorkItems: true;
  };
  readonly boundary: Readonly<NonAuthorizingCandidateBoundary> & {
    readonly mintAndBurnCausallyPaired: false;
    readonly localSnapshotCanRestoreCandidate: false;
    readonly freshMintObservationRequiredBeforeScheduling: true;
    readonly freshBurnObservationRequiredBeforeScheduling: true;
    readonly freshSettlementPreparationRequiredAfterRestart: true;
  };
}

export interface BuildSubstrateFederatedDaemonCandidatesV1Input {
  readonly mintReservationStatement:
    Readonly<ValidityApplicationPooledReserveMintReservationStatementV4>;
  readonly checkpointProfile:
    Readonly<SubstrateFederatedCheckpointProfileV1>;
  readonly checkpointStatement:
    Readonly<SubstrateFederatedCheckpointStatementV1>;
  readonly familyIdentity:
    Readonly<SubstrateFederatedSettlementFamilyV1Identity>;
  readonly settlementPacket:
    Readonly<SubstrateFederatedBurnSettlementV1Packet>;
}

export function buildSubstrateFederatedDaemonCandidatesV1(
  input: BuildSubstrateFederatedDaemonCandidatesV1Input,
): Readonly<SubstrateFederatedDaemonCandidatesV1> {
  assertExactKeys(input, [
    'mintReservationStatement',
    'checkpointProfile',
    'checkpointStatement',
    'familyIdentity',
    'settlementPacket',
  ], 'substrate federated daemon candidate input');
  assertSubstrateFederatedSettlementFamilyV1Identity(input.familyIdentity);
  assertSubstrateFederatedBurnSettlementV1Packet(input.settlementPacket);

  const family = decodeSubstrateFederatedSettlementFamilyV1Profile(
    input.familyIdentity.profile,
  );
  const checkpointProfile = decodeSubstrateFederatedCheckpointProfileV1(
    input.checkpointProfile.encodedProfileHex,
  );
  const checkpointStatement = decodeSubstrateFederatedCheckpointStatementV1(
    input.checkpointStatement.encodedStatementHex,
  );
  assertSubstrateFederatedCheckpointStatementV1MatchesProfile(
    checkpointStatement,
    checkpointProfile,
  );

  const mintStatementHex =
    encodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
      input.mintReservationStatement,
    );
  const mintStatement =
    decodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
      mintStatementHex,
    );
  assertValidityApplicationPooledReserveMintReservationStatementV4Bindings(
    mintStatement,
  );
  const sourceIntent = decodePegInSourceIntentV2Hex(
    mintStatement.sourceIntentHex,
  );

  assertProfileBindings(family, checkpointProfile, checkpointStatement);
  assertMintProfileBindings(family, sourceIntent);
  assertSettlementBindings(
    family,
    checkpointStatement,
    input.familyIdentity,
    input.settlementPacket,
  );

  const familyProfileHex = canonicalVariableHex(
    input.familyIdentity.profile.encodedProfileHex,
    'settlement family profile',
  );
  const familyIdHex = fixedHex(
    input.familyIdentity.profile.familyIdHex,
    32,
    'settlement family ID',
  );
  const mintBinding = {
    schema: SUBSTRATE_FEDERATED_MINT_DAEMON_CANDIDATE_V1_SCHEMA,
    version: 1 as const,
    statementHex: canonicalVariableHex(mintStatementHex, 'mint statement'),
    statementIdHex: fixedHex(
      deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex(
        mintStatement,
      ),
      32,
      'mint statement ID',
    ),
    reservationKeyHex: fixedHex(
      mintStatement.mintIdentityHex,
      32,
      'mint reservation key',
    ),
    sourceIntentIdHex: fixedHex(
      mintStatement.sourceIntentIdHex,
      32,
      'source intent ID',
    ),
    lineageProfileIdHex: fixedHex(
      mintStatement.lineageProfileIdHex,
      32,
      'lineage profile ID',
    ),
    familyProfileHex,
    familyIdHex,
    sourceNetworkIdHex: fixedHex(
      sourceIntent.sourceNetworkIdHex,
      32,
      'source network ID',
    ),
    sidechainIdHex: fixedHex(sourceIntent.sidechainIdHex, 32, 'sidechain ID'),
    bridgeAddressHex: fixedHex(
      sourceIntent.bridgeAddressHex,
      20,
      'bridge address',
    ),
    tokenAddressHex: fixedHex(
      sourceIntent.tokenAddressHex,
      20,
      'token address',
    ),
    settlementProfileIdHex: fixedHex(
      sourceIntent.settlementProfileIdHex,
      32,
      'settlement profile ID',
    ),
    sourceAssetIdHex: fixedHex(
      sourceIntent.sourceAssetIdHex,
      32,
      'source asset ID',
    ),
    amountNanoErg: positiveLong(sourceIntent.amountNanoErg, 'mint amount'),
    recipientAddressHex: fixedHex(
      sourceIntent.recipientAddressHex,
      20,
      'mint recipient',
    ),
    sourceLockBoxIdHex: fixedHex(
      mintStatement.sourceLockBoxIdHex,
      32,
      'source-lock box ID',
    ),
    successorReserveBoxIdHex: fixedHex(
      mintStatement.successorReserveBoxIdHex,
      32,
      'successor reserve box ID',
    ),
    targetHeaderIdHex: fixedHex(
      mintStatement.targetHeaderIdHex,
      32,
      'mint target header ID',
    ),
    targetHeight: uint32String(mintStatement.targetHeight, 'mint target height'),
  };
  const mint = deepFreeze({
    ...mintBinding,
    status: 'observed_non_authorizing' as const,
    candidateId: sha256CanonicalJson(mintBinding, MINT_CANDIDATE_ID_DOMAIN),
    boundary: falseBoundary(),
  });

  const packet = input.settlementPacket;
  const burnBinding = {
    schema: SUBSTRATE_FEDERATED_BURN_DAEMON_CANDIDATE_V1_SCHEMA,
    version: 1 as const,
    burnId: fixedHex(packet.burn.leaf.burnIdHex, 32, 'burn ID'),
    sidechainId: fixedHex(packet.burn.leaf.sidechainIdHex, 32, 'sidechain ID'),
    anchorHeaderHeight: positiveUint32(
      packet.tracker.decodedValue.anchorHeaderHeight,
      'anchor header height',
    ),
    anchorHeaderId: fixedHex(
      packet.tracker.decodedValue.anchorHeaderIdHex,
      32,
      'anchor header ID',
    ),
    trackerBoxId: fixedHex(
      packet.boxes.trackerDataInput.boxId,
      32,
      'tracker box ID',
    ),
    dupInputBoxId: fixedHex(
      packet.boxes.duplicatePreventionPredecessor.boxId,
      32,
      'duplicate-prevention box ID',
    ),
    vaultBoxId: fixedHex(
      packet.boxes.reservePredecessor.boxId,
      32,
      'reserve box ID',
    ),
    checkpointProfileHex: canonicalVariableHex(
      checkpointProfile.encodedProfileHex,
      'checkpoint profile',
    ),
    checkpointProfileIdHex: fixedHex(
      checkpointProfile.profileIdHex,
      32,
      'checkpoint profile ID',
    ),
    checkpointStatementHex: canonicalVariableHex(
      checkpointStatement.encodedStatementHex,
      'checkpoint statement',
    ),
    checkpointStatementIdHex: fixedHex(
      checkpointStatement.statementIdHex,
      32,
      'checkpoint statement ID',
    ),
    familyProfileHex,
    familyIdHex,
    trackerKeyHex: fixedHex(packet.tracker.keyHex, 32, 'tracker key'),
    trackerValueHex: canonicalVariableHex(
      packet.tracker.valueHex,
      'tracker value',
    ),
    trackerInputDigestHex: fixedHex(
      packet.tracker.inputDigestHex,
      33,
      'tracker input digest',
    ),
    settlementTransactionIdHex: fixedHex(
      packet.transaction.txId,
      32,
      'settlement transaction ID',
    ),
    settlementTransactionDigestHex: sha256CanonicalJson(
      packet.transaction.eip12Tx,
      SETTLEMENT_TRANSACTION_DIGEST_DOMAIN,
    ),
    amountNanoErg: positiveLong(packet.burn.leaf.amountNanoErg, 'burn amount'),
    recipientErgoTreeHashHex: fixedHex(
      packet.burn.leaf.recipientErgoTreeHashHex,
      32,
      'burn recipient ErgoTree hash',
    ),
  };
  const burn = deepFreeze({
    ...burnBinding,
    status: 'prepared_non_authorizing' as const,
    candidateId: sha256CanonicalJson(burnBinding, BURN_CANDIDATE_ID_DOMAIN),
    boundary: falseBoundary(),
  });

  const result = deepFreeze({
    schema: SUBSTRATE_FEDERATED_DAEMON_CANDIDATES_V1_SCHEMA,
    version: 1 as const,
    trustModel: 'federated_non_trustless' as const,
    sharedProfile: {
      sourceNetworkIdHex: fixedHex(family.sourceNetworkIdHex, 32, 'source network ID'),
      sidechainIdHex: fixedHex(family.sidechainIdHex, 32, 'sidechain ID'),
      bridgeAddressHex: fixedHex(family.bridgeAddressHex, 20, 'bridge address'),
      tokenAddressHex: fixedHex(family.tokenAddressHex, 20, 'token address'),
      settlementProfileIdHex: fixedHex(
        family.settlementProfileIdHex,
        32,
        'settlement profile ID',
      ),
      settlementAssetIdHex: fixedHex(
        family.settlementAssetIdHex,
        32,
        'settlement asset ID',
      ),
      familyIdHex,
    },
    mint,
    burn,
    checks: {
      canonicalMintReservationDecoded: true as const,
      canonicalFederatedCheckpointDecoded: true as const,
      exactFederatedSettlementFamilyVerified: true as const,
      exactFederatedSettlementPacketVerified: true as const,
      sourceAndSettlementProfilesBound: true as const,
      mintAndBurnRemainIndependentPoolWorkItems: true as const,
    },
    boundary: {
      ...falseBoundary(),
      mintAndBurnCausallyPaired: false as const,
      localSnapshotCanRestoreCandidate: false as const,
      freshMintObservationRequiredBeforeScheduling: true as const,
      freshBurnObservationRequiredBeforeScheduling: true as const,
      freshSettlementPreparationRequiredAfterRestart: true as const,
    },
  });
  return registerSubstrateFederatedCandidatePreparationV1(result);
}

function assertProfileBindings(
  family: ReturnType<typeof decodeSubstrateFederatedSettlementFamilyV1Profile>,
  profile: Readonly<SubstrateFederatedCheckpointProfileV1>,
  statement: Readonly<SubstrateFederatedCheckpointStatementV1>,
): void {
  for (const [actual, expected, label] of [
    [statement.sourceNetworkIdHex, family.sourceNetworkIdHex, 'source network ID'],
    [statement.sidechainIdHex, family.sidechainIdHex, 'sidechain ID'],
    [statement.bridgeAddressHex, family.bridgeAddressHex, 'bridge address'],
    [statement.tokenAddressHex, family.tokenAddressHex, 'token address'],
    [statement.runtimeProfileIdHex, family.runtimeProfileIdHex, 'runtime profile ID'],
    [statement.settlementProfileIdHex, family.settlementProfileIdHex, 'settlement profile ID'],
    [profile.profileIdHex, family.federationProfileIdHex, 'federation profile ID'],
    [profile.sourceAttestationKeySetDigestHex, family.sourceAttestationKeySetDigestHex, 'source key-set digest'],
    [profile.ergoAdmissionKeySetDigestHex, family.ergoAdmissionKeySetDigestHex, 'Ergo key-set digest'],
  ] as const) {
    assertHexEqual(actual, expected, `federated ${label}`);
  }
  if (
    profile.sourceAttestationThreshold !== family.sourceAttestationThreshold
    || profile.ergoAdmissionThreshold !== family.ergoAdmissionThreshold
    || profile.federationEpoch !== family.federationEpoch
  ) {
    throw new Error('federated checkpoint authority profile does not match the settlement family');
  }
}

function assertMintProfileBindings(
  family: ReturnType<typeof decodeSubstrateFederatedSettlementFamilyV1Profile>,
  sourceIntent: ReturnType<typeof decodePegInSourceIntentV2Hex>,
): void {
  for (const [actual, expected, label] of [
    [sourceIntent.sourceNetworkIdHex, family.sourceNetworkIdHex, 'source network ID'],
    [sourceIntent.sidechainIdHex, family.sidechainIdHex, 'sidechain ID'],
    [sourceIntent.bridgeAddressHex, family.bridgeAddressHex, 'bridge address'],
    [sourceIntent.tokenAddressHex, family.tokenAddressHex, 'token address'],
    [sourceIntent.settlementProfileIdHex, family.settlementProfileIdHex, 'settlement profile ID'],
    [sourceIntent.sourceAssetIdHex, family.settlementAssetIdHex, 'settlement asset ID'],
  ] as const) {
    assertHexEqual(actual, expected, `federated mint ${label}`);
  }
}

function assertSettlementBindings(
  family: ReturnType<typeof decodeSubstrateFederatedSettlementFamilyV1Profile>,
  statement: Readonly<SubstrateFederatedCheckpointStatementV1>,
  identity: Readonly<SubstrateFederatedSettlementFamilyV1Identity>,
  packet: Readonly<SubstrateFederatedBurnSettlementV1Packet>,
): void {
  assertHexEqual(packet.familyIdHex, identity.profile.familyIdHex, 'settlement family ID');
  const tracker = packet.tracker.decodedValue;
  for (const [actual, expected, label] of [
    [tracker.statementIdHex, statement.statementIdHex, 'statement ID'],
    [tracker.bridgeEventRootHex, statement.bridgeEventRootHex, 'bridge event root'],
    [tracker.sourceNativeBlockHashHex, statement.sourceNativeBlockHashHex, 'source block hash'],
    [tracker.executionBlockHashHex, statement.executionBlockHashHex, 'execution block hash'],
    [tracker.runtimeProfileIdHex, statement.runtimeProfileIdHex, 'runtime profile ID'],
    [tracker.settlementProfileIdHex, statement.settlementProfileIdHex, 'settlement profile ID'],
    [tracker.federationProfileIdHex, statement.federationProfileIdHex, 'federation profile ID'],
    [tracker.ergoAdmissionKeySetDigestHex, statement.ergoAdmissionKeySetDigestHex, 'Ergo key-set digest'],
    [packet.burn.leaf.sidechainIdHex, family.sidechainIdHex, 'burn sidechain ID'],
    [packet.burn.leaf.sidechainBlockHashHex, statement.executionBlockHashHex, 'burn execution block hash'],
    [packet.burn.leaf.assetIdHex, family.settlementAssetIdHex, 'burn asset ID'],
    [packet.burn.duplicatePreventionKeyHex, packet.burn.leaf.burnIdHex, 'burn replay key'],
  ] as const) {
    assertHexEqual(actual, expected, `federated settlement ${label}`);
  }
  if (
    tracker.sourceNativeBlockHeight !== statement.sourceNativeBlockHeight
    || tracker.burnLeafCount !== statement.burnLeafCount
    || tracker.ergoAdmissionThreshold !== statement.ergoAdmissionThreshold
    || tracker.federationEpoch !== statement.federationEpoch
    || tracker.admissionValidFromErgoHeight !== statement.admissionValidFromErgoHeight
    || tracker.admissionExpiresAtErgoHeight !== statement.admissionExpiresAtErgoHeight
  ) {
    throw new Error('federated settlement tracker value does not match the checkpoint statement');
  }
  const expectedTrackerKey = deriveSubstrateFederatedTrackerKeyV1Hex({
    sourceNetworkIdHex: statement.sourceNetworkIdHex,
    sidechainIdHex: statement.sidechainIdHex,
    sourceNativeBlockHeight: statement.sourceNativeBlockHeight,
    sourceNativeBlockHashHex: statement.sourceNativeBlockHashHex,
    executionBlockHashHex: statement.executionBlockHashHex,
  });
  assertHexEqual(packet.tracker.keyHex, expectedTrackerKey, 'federated tracker key');
}

function falseBoundary(): NonAuthorizingCandidateBoundary {
  return {
    localJournalAuthoritative: false,
    mintAuthorized: false,
    trackerAdmissionAuthorized: false,
    payoutAuthorized: false,
    checkPassed: false,
    signingAuthorized: false,
    submissionAuthorized: false,
    broadcastAuthorized: false,
    fundsAuthorityEstablished: false,
    gate5Closed: false,
    trustlessStatusEstablished: false,
    productionReadinessEstablished: false,
  };
}

function assertHexEqual(actual: unknown, expected: unknown, label: string): void {
  const actualHex = String(actual).replace(/^0x/i, '').toLowerCase();
  const expectedHex = String(expected).replace(/^0x/i, '').toLowerCase();
  if (actualHex !== expectedHex) {
    throw new Error(`${label} mismatch`);
  }
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  const normalized = String(value).replace(/^0x/i, '').toLowerCase();
  if (!new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(normalized)) {
    throw new Error(`${label} must be exactly ${bytes} bytes of hexadecimal data`);
  }
  return normalized;
}

function canonicalVariableHex(value: unknown, label: string): string {
  const normalized = String(value).replace(/^0x/i, '').toLowerCase();
  if (normalized.length === 0 || normalized.length % 2 !== 0 || !/^[0-9a-f]+$/.test(normalized)) {
    throw new Error(`${label} must be non-empty canonical hexadecimal data`);
  }
  return normalized;
}

function positiveLong(value: unknown, label: string): string {
  if (
    (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint')
    || (typeof value === 'number' && !Number.isSafeInteger(value))
    || !/^[0-9]+$/.test(String(value))
  ) {
    throw new Error(`${label} must be a positive integer`);
  }
  const normalized = BigInt(value);
  if (normalized <= 0n || normalized > 0x7fff_ffff_ffff_ffffn) {
    throw new Error(`${label} must fit the positive Ergo Long range`);
  }
  return normalized.toString();
}

function positiveUint32(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > 0xffff_ffff) {
    throw new Error(`${label} must be a positive uint32`);
  }
  return value;
}

function uint32String(value: unknown, label: string): string {
  if (
    (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint')
    || !/^[0-9]+$/.test(String(value))
  ) {
    throw new Error(`${label} must be a uint32`);
  }
  const normalized = BigInt(value);
  if (normalized < 0n || normalized > 0xffff_ffffn) {
    throw new Error(`${label} must be a uint32`);
  }
  return normalized.toString();
}

function assertExactKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (actual.length !== canonical.length || actual.some((key, index) => key !== canonical[index])) {
    throw new Error(`${label} must contain exactly: ${canonical.join(', ')}`);
  }
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
