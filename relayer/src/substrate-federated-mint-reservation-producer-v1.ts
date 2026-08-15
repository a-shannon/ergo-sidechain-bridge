import { createHash } from 'node:crypto';

import blakejs from 'blakejs';

import { sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import {
  POOLED_RESERVE_MINT_RESERVATION_PENDING_LIFECYCLE_RECORD_V4_BYTES,
  normalizePooledReserveMintReservationLifecycleRecordScaleHexV4,
} from './native-finalized-pooled-reserve-mint-reservation-state-v4.js';
import {
  decodePegInSourceIntentV2Hex,
} from './peg-in-causal-admission-v2.js';
import {
  decodePooledReserveMintReservationRuntimeProfileV4ScaleHex,
  derivePooledReserveMintReservationRuntimeProfileV4IdHex,
  type PooledReserveMintReservationRuntimeProfileV4,
} from './pooled-reserve-mint-reservation-runtime-profile-v4.js';
import {
  MAX_POOLED_RESERVE_MINT_RESERVATION_PENDING_KEYS_SCALE_BYTES_V4,
  decodePooledReserveMintReservationPendingKeysScaleV4,
  derivePooledReserveMintReservationRuntimeStorageKeysV4,
} from './pooled-reserve-mint-reservation-runtime-state-v4.js';
import {
  POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES,
} from './pooled-reserve-mint-reservation-runtime-profile-v4-codec.js';
import {
  ReadOnlySubstrateFinalityRpc,
  requestPooledReserveMintReservationStateReadProofV4,
  requestSubstrateFinalizedHeadHash,
  requestSubstrateHeaderObservation,
  type SubstrateRpcHeaderObservation,
} from './substrate-finality-provider.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_BYTES,
  decodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
  deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex,
  encodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
  type ValidityApplicationPooledReserveMintReservationStatementV4,
} from './validity-application-pooled-reserve-mint-reservation-v4.js';

export const SUBSTRATE_FEDERATED_MINT_RESERVATION_PRODUCER_V1_SCHEMA =
  'e2s.substrate-federated-mint-reservation-producer.v1' as const;

const SOURCE_ID_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_MINT_RESERVATION_SOURCE_V1';
const SOURCE_STATE_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_MINT_RESERVATION_SOURCE_STATE_V1';
const SOURCE_AGREEMENT_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_MINT_RESERVATION_SOURCE_AGREEMENT_V1';
const MINT_OBSERVATION_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_MINT_RESERVATION_OBSERVATION_V1';
const STATE_PROOF_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_MINT_RESERVATION_STATE_PROOF_V1';
const STORAGE_VALUES_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_MINT_RESERVATION_STORAGE_VALUES_V1';
const MAX_RUNTIME_CODE_BYTES = 4 * 1024 * 1024;
const UINT64_MAX = 0xffff_ffff_ffff_ffffn;

const SOURCE_PAIR_BINDINGS = new WeakMap<
  object,
  Readonly<{
    primary: ReadonlySubstrateSourceV1;
    witness: ReadonlySubstrateSourceV1;
    sourceIdsHex: readonly [string, string];
  }>
>();
const PRODUCER_RESULTS = new WeakSet<object>();
const CONSUMED_PRODUCER_RESULTS = new WeakSet<object>();
const PRODUCER_RECOLLECTION_INPUTS = new WeakMap<
  object,
  Readonly<SubstrateFederatedMintReservationProducerV1Input>
>();

interface ReadonlySubstrateSourceV1 {
  readonly sourceIdHex: string;
  readonly canonicalOrigin: string;
  readonly rpc: ReadOnlySubstrateFinalityRpc;
}

export interface SubstrateFederatedMintReservationSourcePairV1 {
  readonly sourceIdsHex: readonly [string, string];
}

export interface SubstrateFederatedMintReservationProducerV1Input {
  readonly sources: SubstrateFederatedMintReservationSourcePairV1;
  readonly mintReservationStatement:
    Readonly<ValidityApplicationPooledReserveMintReservationStatementV4>;
  readonly familyIdHex: string;
  readonly expectedRuntimeCodeSha256Hex: string;
  readonly expectedRuntimeCodeBytes: number;
  readonly expectedRuntimeProfileScaleHex: string;
  readonly expectedSourceProofSystemIdHex: string;
  readonly expectedSourceProofProfileIdHex: string;
}

export interface SubstrateFederatedMintReservationProducerV1Result {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_MINT_RESERVATION_PRODUCER_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'pending_hold';
  readonly mintReservationStatement:
    Readonly<ValidityApplicationPooledReserveMintReservationStatementV4>;
  readonly mintObservation: {
    readonly statementIdHex: string;
    readonly reservationKeyHex: string;
    readonly lineageProfileIdHex: string;
    readonly familyIdHex: string;
    readonly targetHeaderIdHex: string;
    readonly targetHeight: string;
    readonly lifecycleStatus: 'pending';
    readonly classification: 'pending_hold';
    readonly observationDigestHex: string;
    readonly localObservationAuthoritative: false;
    readonly mintAuthorized: false;
  };
  readonly finalizedSourceState: {
    readonly targetNativeBlockHashHex: string;
    readonly targetNativeHeight: string;
    readonly targetStateRootHex: string;
    readonly runtimeCodeSha256Hex: string;
    readonly runtimeCodeBytes: number;
    readonly runtimeProfileScaleHex: string;
    readonly runtimeProfileIdHex: string;
    readonly sourceProofSystemIdHex: string;
    readonly sourceProofProfileIdHex: string;
    readonly reservationKeyHex: string;
    readonly storageKeysHex: readonly string[];
    readonly pendingIndexEntryCount: number;
    readonly pendingLifecycleRecordDigestHex: string;
    readonly sourceProofResultIdHex: string;
    readonly reservedAtNativeHeight: string;
    readonly expiresAtNativeHeight: string;
    readonly storageValuesDigestHex: string;
    readonly stateProofDigestHex: string;
    readonly stateObservationDigestHex: string;
    readonly sourceIdsHex: readonly [string, string];
    readonly sourceAgreementDigestHex: string;
  };
  readonly boundary: {
    readonly readOnlyRpc: true;
    readonly exactFinalizedBlockReportedByBothSources: true;
    readonly exactRuntimeAndProfileObserved: true;
    readonly exactPendingReservationDecoded: true;
    readonly matchingDistinctSourceObservations: true;
    readonly stateProofCaptured: true;
    readonly stateProofVerified: false;
    readonly sourceFinalityCryptographicallyVerified: false;
    readonly localPersistenceConsulted: false;
    readonly localObservationAuthoritative: false;
    readonly mintAuthorized: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  };
}

interface NormalizedProducerInputV1 {
  readonly statement:
    Readonly<ValidityApplicationPooledReserveMintReservationStatementV4>;
  readonly statementHex: string;
  readonly statementIdHex: string;
  readonly reservationKeyHex: string;
  readonly familyIdHex: string;
  readonly expectedRuntimeCodeSha256Hex: string;
  readonly expectedRuntimeCodeBytes: number;
  readonly expectedRuntimeProfileScaleHex: string;
  readonly expectedRuntimeProfileIdHex: string;
  readonly expectedRuntimeProfile:
    Readonly<PooledReserveMintReservationRuntimeProfileV4>;
}

interface SourceStateObservationV1 {
  readonly binding: {
    readonly targetNativeBlockHashHex: string;
    readonly targetNativeHeight: string;
    readonly targetHeader: Readonly<SubstrateRpcHeaderObservation>;
    readonly runtimeCodeSha256Hex: string;
    readonly runtimeCodeBytes: number;
    readonly runtimeProfileScaleHex: string;
    readonly runtimeProfileIdHex: string;
    readonly sourceProofSystemIdHex: string;
    readonly sourceProofProfileIdHex: string;
    readonly reservationKeyHex: string;
    readonly storageKeysHex: readonly string[];
    readonly pendingIndexEntryCount: number;
    readonly pendingLifecycleRecordDigestHex: string;
    readonly sourceProofResultIdHex: string;
    readonly reservedAtNativeHeight: string;
    readonly expiresAtNativeHeight: string;
    readonly storageValuesDigestHex: string;
    readonly stateProofDigestHex: string;
  };
  readonly stateObservationDigestHex: string;
}

interface DecodedPendingReservationV1 {
  readonly sourceProofResultIdHex: string;
  readonly reservedAtNativeHeight: string;
  readonly expiresAtNativeHeight: string;
}

export function createSubstrateFederatedMintReservationSourcePairV1(input: {
  readonly primaryRpc: ReadOnlySubstrateFinalityRpc;
  readonly witnessRpc: ReadOnlySubstrateFinalityRpc;
}): Readonly<SubstrateFederatedMintReservationSourcePairV1> {
  assertExactKeys(input, [
    'primaryRpc',
    'witnessRpc',
  ], 'federated mint-reservation source pair');
  if (
    !(input.primaryRpc instanceof ReadOnlySubstrateFinalityRpc)
    || !(input.witnessRpc instanceof ReadOnlySubstrateFinalityRpc)
  ) {
    throw new Error(
      'federated mint-reservation sources require read-only Substrate RPC clients',
    );
  }
  if (input.primaryRpc.sharesTransportWith(input.witnessRpc)) {
    throw new Error(
      'federated mint-reservation observation requires distinct RPC transports',
    );
  }
  const primaryOrigin = input.primaryRpc.getCanonicalOrigin();
  const witnessOrigin = input.witnessRpc.getCanonicalOrigin();
  if (primaryOrigin === null || witnessOrigin === null) {
    throw new Error(
      'federated mint-reservation sources require endpoint-bound RPC origins',
    );
  }
  if (primaryOrigin === witnessOrigin) {
    throw new Error(
      'federated mint-reservation observation requires distinct RPC origins',
    );
  }
  const primary = sourceBinding(primaryOrigin, input.primaryRpc);
  const witness = sourceBinding(witnessOrigin, input.witnessRpc);
  const sourceIdsHex = Object.freeze(
    [primary.sourceIdHex, witness.sourceIdHex].sort(),
  ) as readonly [string, string];
  const pair = Object.freeze({ sourceIdsHex });
  SOURCE_PAIR_BINDINGS.set(pair, Object.freeze({
    primary,
    witness,
    sourceIdsHex,
  }));
  return pair;
}

/**
 * Collect one exact pending FED-1 reservation under matching finalized-state
 * observations. The read proof is retained only as a drift detector: this
 * adapter does not execute a Substrate proof verifier or authorize minting.
 */
export async function collectSubstrateFederatedMintReservationProducerV1(
  input: SubstrateFederatedMintReservationProducerV1Input,
): Promise<Readonly<SubstrateFederatedMintReservationProducerV1Result>> {
  assertExactKeys(input, [
    'sources',
    'mintReservationStatement',
    'familyIdHex',
    'expectedRuntimeCodeSha256Hex',
    'expectedRuntimeCodeBytes',
    'expectedRuntimeProfileScaleHex',
    'expectedSourceProofSystemIdHex',
    'expectedSourceProofProfileIdHex',
  ], 'federated mint-reservation producer input');
  const sources = sourcePairBinding(input.sources);
  const normalized = normalizeProducerInput(input);
  const [primary, witness] = await Promise.all([
    collectSourceState(sources.primary, normalized),
    collectSourceState(sources.witness, normalized),
  ]);
  if (primary.stateObservationDigestHex !== witness.stateObservationDigestHex) {
    throw new Error(
      'federated mint-reservation sources disagree on finalized reservation state',
    );
  }

  const state = primary.binding;
  const sourceAgreementDigestHex = sha256CanonicalJson({
    stateObservationDigestHex: primary.stateObservationDigestHex,
    sourceIdsHex: sources.sourceIdsHex,
  }, SOURCE_AGREEMENT_DOMAIN);
  const mintObservationBinding = {
    statementIdHex: normalized.statementIdHex,
    reservationKeyHex: normalized.reservationKeyHex,
    lineageProfileIdHex: fixedHex(
      normalized.statement.lineageProfileIdHex,
      32,
      'federated mint-reservation lineage profile ID',
    ),
    familyIdHex: normalized.familyIdHex,
    targetHeaderIdHex: fixedHex(
      normalized.statement.targetHeaderIdHex,
      32,
      'federated mint-reservation Ergo target header ID',
    ),
    targetHeight: uint32String(
      normalized.statement.targetHeight,
      'federated mint-reservation Ergo target height',
    ),
    lifecycleStatus: 'pending' as const,
    classification: 'pending_hold' as const,
    sourceAgreementDigestHex,
  };
  const mintObservation = deepFreeze({
    statementIdHex: mintObservationBinding.statementIdHex,
    reservationKeyHex: mintObservationBinding.reservationKeyHex,
    lineageProfileIdHex: mintObservationBinding.lineageProfileIdHex,
    familyIdHex: mintObservationBinding.familyIdHex,
    targetHeaderIdHex: mintObservationBinding.targetHeaderIdHex,
    targetHeight: mintObservationBinding.targetHeight,
    lifecycleStatus: mintObservationBinding.lifecycleStatus,
    classification: mintObservationBinding.classification,
    observationDigestHex: sha256CanonicalJson(
      mintObservationBinding,
      MINT_OBSERVATION_DOMAIN,
    ),
    localObservationAuthoritative: false as const,
    mintAuthorized: false as const,
  });
  const result = deepFreeze({
    schema: SUBSTRATE_FEDERATED_MINT_RESERVATION_PRODUCER_V1_SCHEMA,
    version: 1 as const,
    status: 'pending_hold' as const,
    mintReservationStatement: normalized.statement,
    mintObservation,
    finalizedSourceState: {
      targetNativeBlockHashHex: state.targetNativeBlockHashHex,
      targetNativeHeight: state.targetNativeHeight,
      targetStateRootHex: fixedHex(
        state.targetHeader.stateRoot,
        32,
        'federated mint-reservation target state root',
      ),
      runtimeCodeSha256Hex: state.runtimeCodeSha256Hex,
      runtimeCodeBytes: state.runtimeCodeBytes,
      runtimeProfileScaleHex: state.runtimeProfileScaleHex,
      runtimeProfileIdHex: state.runtimeProfileIdHex,
      sourceProofSystemIdHex: state.sourceProofSystemIdHex,
      sourceProofProfileIdHex: state.sourceProofProfileIdHex,
      reservationKeyHex: state.reservationKeyHex,
      storageKeysHex: state.storageKeysHex,
      pendingIndexEntryCount: state.pendingIndexEntryCount,
      pendingLifecycleRecordDigestHex:
        state.pendingLifecycleRecordDigestHex,
      sourceProofResultIdHex: state.sourceProofResultIdHex,
      reservedAtNativeHeight: state.reservedAtNativeHeight,
      expiresAtNativeHeight: state.expiresAtNativeHeight,
      storageValuesDigestHex: state.storageValuesDigestHex,
      stateProofDigestHex: state.stateProofDigestHex,
      stateObservationDigestHex: primary.stateObservationDigestHex,
      sourceIdsHex: sources.sourceIdsHex,
      sourceAgreementDigestHex,
    },
    boundary: falseAuthorityBoundary(),
  });
  PRODUCER_RESULTS.add(result);
  PRODUCER_RECOLLECTION_INPUTS.set(result, Object.freeze({
    sources: input.sources,
    mintReservationStatement: result.mintReservationStatement,
    familyIdHex: normalized.familyIdHex,
    expectedRuntimeCodeSha256Hex:
      normalized.expectedRuntimeCodeSha256Hex,
    expectedRuntimeCodeBytes: normalized.expectedRuntimeCodeBytes,
    expectedRuntimeProfileScaleHex:
      normalized.expectedRuntimeProfileScaleHex,
    expectedSourceProofSystemIdHex:
      input.expectedSourceProofSystemIdHex,
    expectedSourceProofProfileIdHex:
      input.expectedSourceProofProfileIdHex,
  }));
  return result;
}

export function assertSubstrateFederatedMintReservationProducerV1Provenance(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedMintReservationProducerV1Result> {
  if (
    typeof value !== 'object'
    || value === null
    || !PRODUCER_RESULTS.has(value)
  ) {
    throw new Error(
      'federated mint-reservation producer provenance is missing',
    );
  }
}

export function consumeSubstrateFederatedMintReservationProducerV1(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedMintReservationProducerV1Result> {
  assertSubstrateFederatedMintReservationProducerV1Provenance(value);
  if (CONSUMED_PRODUCER_RESULTS.has(value)) {
    throw new Error(
      'federated mint-reservation producer result was already consumed',
    );
  }
  CONSUMED_PRODUCER_RESULTS.add(value);
}

/** Reobserve the exact reservation through the original process-owned ports. */
export function recollectSubstrateFederatedMintReservationProducerV1(
  value: unknown,
): Promise<Readonly<SubstrateFederatedMintReservationProducerV1Result>> {
  assertSubstrateFederatedMintReservationProducerV1Provenance(value);
  const input = PRODUCER_RECOLLECTION_INPUTS.get(value);
  if (input === undefined) {
    throw new Error(
      'federated mint-reservation recollection provenance is missing',
    );
  }
  return collectSubstrateFederatedMintReservationProducerV1(input);
}

function sourceBinding(
  canonicalOrigin: string,
  rpc: ReadOnlySubstrateFinalityRpc,
): ReadonlySubstrateSourceV1 {
  return Object.freeze({
    sourceIdHex: sha256CanonicalJson({
      schema: 'e2s.substrate-federated-mint-reservation-source.v1',
      canonicalOrigin,
    }, SOURCE_ID_DOMAIN),
    canonicalOrigin,
    rpc,
  });
}

function sourcePairBinding(
  pair: unknown,
): Readonly<{
  primary: ReadonlySubstrateSourceV1;
  witness: ReadonlySubstrateSourceV1;
  sourceIdsHex: readonly [string, string];
}> {
  if (typeof pair !== 'object' || pair === null) {
    throw new Error(
      'federated mint-reservation source-pair provenance is missing',
    );
  }
  const binding = SOURCE_PAIR_BINDINGS.get(pair);
  if (binding === undefined) {
    throw new Error(
      'federated mint-reservation source-pair provenance is missing',
    );
  }
  return binding;
}

function normalizeProducerInput(
  input: SubstrateFederatedMintReservationProducerV1Input,
): NormalizedProducerInputV1 {
  const statementHex =
    encodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
      input.mintReservationStatement,
    );
  const statement = deepFreeze(
    decodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
      statementHex,
    ),
  );
  const statementIdHex = fixedHex(
    deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex(
      statement,
    ),
    32,
    'federated mint-reservation statement ID',
  );
  const reservationKeyHex = fixedHex(
    statement.mintIdentityHex,
    32,
    'federated mint-reservation key',
  );
  const expectedRuntimeProfileScaleHex = fixedWireHex(
    input.expectedRuntimeProfileScaleHex,
    POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES,
    'expected federated mint-reservation runtime profile',
  );
  const expectedRuntimeProfile =
    decodePooledReserveMintReservationRuntimeProfileV4ScaleHex(
      expectedRuntimeProfileScaleHex,
    );
  const expectedRuntimeProfileIdHex = fixedHex(
    derivePooledReserveMintReservationRuntimeProfileV4IdHex(
      expectedRuntimeProfileScaleHex,
    ),
    32,
    'expected federated mint-reservation runtime profile ID',
  );
  const expectedSourceProofSystemIdHex = fixedHex(
    input.expectedSourceProofSystemIdHex,
    32,
    'expected federated source-proof system ID',
  );
  const expectedSourceProofProfileIdHex = fixedHex(
    input.expectedSourceProofProfileIdHex,
    32,
    'expected federated source-proof profile ID',
  );
  if (
    fixedHex(
      expectedRuntimeProfile.sourceProofSystemIdHex,
      32,
      'runtime-profile source-proof system ID',
    ) !== expectedSourceProofSystemIdHex
    || fixedHex(
      expectedRuntimeProfile.sourceProofProfileIdHex,
      32,
      'runtime-profile source-proof profile ID',
    ) !== expectedSourceProofProfileIdHex
  ) {
    throw new Error(
      'expected federated source-proof identity differs from the runtime profile',
    );
  }
  assertProfileMatchesStatement(expectedRuntimeProfile, statement);
  return Object.freeze({
    statement,
    statementHex,
    statementIdHex,
    reservationKeyHex,
    familyIdHex: fixedHex(
      input.familyIdHex,
      32,
      'federated settlement family ID',
    ),
    expectedRuntimeCodeSha256Hex: fixedHex(
      input.expectedRuntimeCodeSha256Hex,
      32,
      'expected Substrate runtime code SHA-256',
    ),
    expectedRuntimeCodeBytes: boundedPositiveInteger(
      input.expectedRuntimeCodeBytes,
      1,
      MAX_RUNTIME_CODE_BYTES,
      'expected Substrate runtime code bytes',
    ),
    expectedRuntimeProfileScaleHex,
    expectedRuntimeProfileIdHex,
    expectedRuntimeProfile,
  });
}

async function collectSourceState(
  source: ReadonlySubstrateSourceV1,
  input: NormalizedProducerInputV1,
): Promise<SourceStateObservationV1> {
  const targetHash = await requestSubstrateFinalizedHeadHash(source.rpc);
  const targetHeader = deepFreeze(
    await requestSubstrateHeaderObservation(source.rpc, targetHash),
  );
  const targetHeight = rpcUint32(targetHeader.number, 'finalized Substrate height');
  const storage = derivePooledReserveMintReservationRuntimeStorageKeysV4(
    `0x${input.reservationKeyHex}`,
  );
  const storageKeysHex = Object.freeze([
    storage.runtimeCodeStorageKeyHex,
    storage.currentProfileStorageKeyHex,
    storage.enforcementStorageKeyHex,
    storage.pendingKeysStorageKeyHex,
    storage.pendingReservationStorageKeyHex,
    storage.consumedReservationStorageKeyHex,
    storage.invalidatedReservationStorageKeyHex,
  ]);
  const [rawStorageValues, proof] = await Promise.all([
    Promise.all(storageKeysHex.map(key =>
      source.rpc.request<unknown>('state_getStorage', [key, targetHash])
    )),
    requestPooledReserveMintReservationStateReadProofV4(source.rpc, {
      nativeBlockHashHex: targetHash,
      reservationKeyHex: `0x${input.reservationKeyHex}`,
    }),
  ]);
  const finalHead = await requestSubstrateFinalizedHeadHash(source.rpc);
  if (normalizeHex(finalHead) !== normalizeHex(targetHash)) {
    throw new Error(
      'federated mint-reservation finalized head changed during collection',
    );
  }
  if (
    normalizeHex(proof.atNativeBlockHashHex) !== normalizeHex(targetHash)
    || proof.storageKeysHex.length !== storageKeysHex.length
    || proof.storageKeysHex.some((key, index) =>
      normalizeHex(key) !== normalizeHex(storageKeysHex[index])
    )
  ) {
    throw new Error(
      'federated mint-reservation state proof differs from the exact requested state',
    );
  }

  const runtimeCodeScaleHex = requiredStorageHex(
    rawStorageValues[0],
    MAX_RUNTIME_CODE_BYTES,
    'federated mint-reservation Substrate runtime code',
  );
  const runtimeCode = Buffer.from(runtimeCodeScaleHex.slice(2), 'hex');
  const runtimeCodeSha256Hex = createHash('sha256')
    .update(runtimeCode)
    .digest('hex');
  if (
    runtimeCode.length !== input.expectedRuntimeCodeBytes
    || runtimeCodeSha256Hex !== input.expectedRuntimeCodeSha256Hex
  ) {
    throw new Error(
      'federated mint-reservation Substrate runtime code identity mismatch',
    );
  }
  const runtimeProfileScaleHex = requiredStorageHex(
    rawStorageValues[1],
    POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES,
    'federated mint-reservation runtime profile',
  );
  if (runtimeProfileScaleHex !== input.expectedRuntimeProfileScaleHex) {
    throw new Error(
      'federated mint-reservation runtime profile bytes mismatch',
    );
  }
  const runtimeProfile =
    decodePooledReserveMintReservationRuntimeProfileV4ScaleHex(
      runtimeProfileScaleHex,
    );
  const runtimeProfileIdHex = fixedHex(
    derivePooledReserveMintReservationRuntimeProfileV4IdHex(
      runtimeProfileScaleHex,
    ),
    32,
    'observed federated mint-reservation runtime profile ID',
  );
  if (runtimeProfileIdHex !== input.expectedRuntimeProfileIdHex) {
    throw new Error(
      'federated mint-reservation runtime profile identity mismatch',
    );
  }
  if (requiredStorageHex(
    rawStorageValues[2],
    1,
    'federated mint-reservation enforcement flag',
  ) !== '0x01') {
    throw new Error(
      'federated mint-reservation enforcement is not active in the observed state',
    );
  }
  const pendingIndexScaleHex = requiredStorageHex(
    rawStorageValues[3],
    MAX_POOLED_RESERVE_MINT_RESERVATION_PENDING_KEYS_SCALE_BYTES_V4,
    'federated mint-reservation pending index',
  );
  const pendingKeys =
    decodePooledReserveMintReservationPendingKeysScaleV4(
      pendingIndexScaleHex,
    );
  if (
    pendingKeys.filter(key => normalizeHex(key) === input.reservationKeyHex)
      .length !== 1
  ) {
    throw new Error(
      'federated mint-reservation pending index does not contain the exact reservation once',
    );
  }
  const pendingLifecycleRecordScaleHex =
    normalizePooledReserveMintReservationLifecycleRecordScaleHexV4(
      'pending',
      requiredStorageHex(
        rawStorageValues[4],
        POOLED_RESERVE_MINT_RESERVATION_PENDING_LIFECYCLE_RECORD_V4_BYTES,
        'federated mint-reservation pending lifecycle record',
      ),
    );
  if (pendingLifecycleRecordScaleHex === null) {
    throw new Error(
      'federated mint-reservation pending lifecycle record is absent',
    );
  }
  if (rawStorageValues[5] !== null || rawStorageValues[6] !== null) {
    throw new Error(
      'federated mint-reservation pending state conflicts with a terminal record',
    );
  }
  const pending = decodePendingReservation(
    pendingLifecycleRecordScaleHex,
    input,
    runtimeProfile,
    targetHeight,
  );
  const storageValuesDigestHex = sha256CanonicalJson(
    storageKeysHex.map((key, index) => [
      key,
      rawStorageValues[index] === null
        ? null
        : normalizeStorageHex(rawStorageValues[index], `storage value ${index}`),
    ]),
    STORAGE_VALUES_DOMAIN,
  );
  const stateProofDigestHex = sha256CanonicalJson({
    atNativeBlockHashHex: normalizeHex(proof.atNativeBlockHashHex),
    storageKeysHex: proof.storageKeysHex.map(normalizeHex),
    proofNodesHex: proof.proofNodesHex.map(normalizeHex),
  }, STATE_PROOF_DOMAIN);
  const binding = deepFreeze({
    targetNativeBlockHashHex: fixedHex(
      targetHash,
      32,
      'federated mint-reservation finalized block hash',
    ),
    targetNativeHeight: targetHeight.toString(),
    targetHeader,
    runtimeCodeSha256Hex,
    runtimeCodeBytes: runtimeCode.length,
    runtimeProfileScaleHex,
    runtimeProfileIdHex,
    sourceProofSystemIdHex: fixedHex(
      runtimeProfile.sourceProofSystemIdHex,
      32,
      'observed federated source-proof system ID',
    ),
    sourceProofProfileIdHex: fixedHex(
      runtimeProfile.sourceProofProfileIdHex,
      32,
      'observed federated source-proof profile ID',
    ),
    reservationKeyHex: input.reservationKeyHex,
    storageKeysHex,
    pendingIndexEntryCount: pendingKeys.length,
    pendingLifecycleRecordDigestHex: sha256Hex(
      Buffer.from(pendingLifecycleRecordScaleHex.slice(2), 'hex'),
    ),
    sourceProofResultIdHex: pending.sourceProofResultIdHex,
    reservedAtNativeHeight: pending.reservedAtNativeHeight,
    expiresAtNativeHeight: pending.expiresAtNativeHeight,
    storageValuesDigestHex,
    stateProofDigestHex,
  });
  return deepFreeze({
    binding,
    stateObservationDigestHex: sha256CanonicalJson(
      binding,
      SOURCE_STATE_DOMAIN,
    ),
  });
}

function decodePendingReservation(
  lifecycleRecordScaleHex: string,
  input: NormalizedProducerInputV1,
  profile: Readonly<PooledReserveMintReservationRuntimeProfileV4>,
  targetHeight: bigint,
): DecodedPendingReservationV1 {
  const bytes = Buffer.from(lifecycleRecordScaleHex.slice(2), 'hex');
  if (
    bytes.length !== POOLED_RESERVE_MINT_RESERVATION_PENDING_LIFECYCLE_RECORD_V4_BYTES
    || bytes[0] !== 4
  ) {
    throw new Error(
      'federated mint-reservation pending lifecycle record is malformed',
    );
  }
  let offset = 1;
  requireBufferHex(
    bytes.subarray(offset, offset + 32),
    input.expectedRuntimeProfileIdHex,
    'pending runtime profile ID',
  );
  offset += 32;
  const statementLength = decodeCompactLength(bytes, offset);
  if (
    statementLength.value
      !== VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_BYTES
  ) {
    throw new Error(
      'federated mint-reservation pending statement length mismatch',
    );
  }
  offset += statementLength.bytesRead;
  const statementBytes = bytes.subarray(offset, offset + statementLength.value);
  if (`0x${statementBytes.toString('hex')}` !== input.statementHex) {
    throw new Error(
      'federated mint-reservation pending record contains a different statement',
    );
  }
  offset += statementLength.value;
  requireBufferHex(
    bytes.subarray(offset, offset + 32),
    input.statementIdHex,
    'pending statement ID',
  );
  offset += 32;
  requireBufferHex(
    bytes.subarray(offset, offset + 32),
    input.reservationKeyHex,
    'pending reservation key',
  );
  offset += 32;
  requireBufferHex(
    bytes.subarray(offset, offset + 32),
    blake2b256Hex(statementBytes),
    'pending statement digest',
  );
  offset += 32;
  requireBufferHex(
    bytes.subarray(offset, offset + 32),
    fixedHex(
      profile.sourceProofSystemIdHex,
      32,
      'pending source-proof system ID',
    ),
    'pending source-proof system ID',
  );
  offset += 32;
  requireBufferHex(
    bytes.subarray(offset, offset + 32),
    fixedHex(
      profile.sourceProofProfileIdHex,
      32,
      'pending source-proof profile ID',
    ),
    'pending source-proof profile ID',
  );
  offset += 32;
  const issuedAt = bytes.readBigUInt64LE(offset);
  offset += 8;
  for (const label of [
    'pending source-proof request digest',
    'pending source-proof result ID',
    'pending source-proof digest',
  ]) {
    nonzeroBuffer(bytes.subarray(offset, offset + 32), label);
    offset += 32;
  }
  const sourceProofResultIdHex = bytes
    .subarray(offset - 64, offset - 32)
    .toString('hex');
  const reservedAt = bytes.readBigUInt64LE(offset);
  offset += 8;
  const expiresAt = bytes.readBigUInt64LE(offset);
  offset += 8;
  if (offset !== bytes.length) {
    throw new Error(
      'federated mint-reservation pending lifecycle record has trailing bytes',
    );
  }
  const activationHeight = uint64(
    profile.activationHeight,
    'federated mint-reservation activation height',
  );
  if (
    issuedAt < activationHeight
    || issuedAt > reservedAt
    || reservedAt > targetHeight
    || expiresAt <= targetHeight
    || expiresAt <= reservedAt
    || expiresAt > reservedAt + BigInt(profile.maxPendingBlocks)
  ) {
    throw new Error(
      'federated mint-reservation pending lifecycle horizon is stale or invalid',
    );
  }
  return Object.freeze({
    sourceProofResultIdHex,
    reservedAtNativeHeight: reservedAt.toString(),
    expiresAtNativeHeight: expiresAt.toString(),
  });
}

function assertProfileMatchesStatement(
  profile: Readonly<PooledReserveMintReservationRuntimeProfileV4>,
  statement: Readonly<ValidityApplicationPooledReserveMintReservationStatementV4>,
): void {
  const sourceIntent = decodePegInSourceIntentV2Hex(statement.sourceIntentHex);
  for (const [actual, expected, label] of [
    [profile.lineageProfileIdHex, statement.lineageProfileIdHex, 'lineage profile ID'],
    [profile.sourceNetworkIdHex, sourceIntent.sourceNetworkIdHex, 'source network ID'],
    [profile.sidechainIdHex, sourceIntent.sidechainIdHex, 'sidechain ID'],
    [profile.bridgeAddressHex, sourceIntent.bridgeAddressHex, 'bridge address'],
    [profile.tokenAddressHex, sourceIntent.tokenAddressHex, 'token address'],
    [profile.settlementProfileIdHex, sourceIntent.settlementProfileIdHex, 'settlement profile ID'],
    [profile.ergoDepositFinalityPolicyIdHex, statement.ergoDepositFinalityPolicyIdHex, 'Ergo finality policy ID'],
  ] as const) {
    if (normalizeHex(actual) !== normalizeHex(expected)) {
      throw new Error(
        `federated mint-reservation runtime profile ${label} mismatch`,
      );
    }
  }
}

function requiredStorageHex(
  value: unknown,
  maxBytes: number,
  label: string,
): string {
  if (value === null) {
    throw new Error(`${label} is absent`);
  }
  const normalized = normalizeStorageHex(value, label);
  const bytes = (normalized.length - 2) / 2;
  if (bytes === 0 || bytes > maxBytes) {
    throw new Error(`${label} must contain between 1 and ${maxBytes} bytes`);
  }
  return normalized;
}

function normalizeStorageHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || !/^0x(?:[0-9a-fA-F]{2})*$/.test(value)
  ) {
    throw new Error(`${label} must be whole 0x-prefixed bytes`);
  }
  return value.toLowerCase();
}

function fixedWireHex(
  value: unknown,
  bytes: number,
  label: string,
): string {
  const normalized = normalizeStorageHex(value, label);
  if ((normalized.length - 2) / 2 !== bytes) {
    throw new Error(`${label} must be exactly ${bytes} bytes`);
  }
  return normalized;
}

function fixedHex(
  value: unknown,
  bytes: number,
  label: string,
): string {
  const normalized = normalizeHex(value);
  if (!new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(normalized)) {
    throw new Error(`${label} must be exactly ${bytes} bytes of hexadecimal data`);
  }
  return normalized;
}

function normalizeHex(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/^0x/i, '').toLowerCase()
    : '';
}

function rpcUint32(value: unknown, label: string): bigint {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value)) {
    throw new Error(`${label} must be canonical RPC hexadecimal`);
  }
  const parsed = BigInt(value);
  if (parsed < 0n || parsed > 0xffff_ffffn) {
    throw new Error(`${label} must fit uint32`);
  }
  return parsed;
}

function uint32String(value: unknown, label: string): string {
  if (
    (typeof value !== 'string'
      && typeof value !== 'number'
      && typeof value !== 'bigint')
    || !/^[0-9]+$/.test(String(value))
  ) {
    throw new Error(`${label} must be a uint32`);
  }
  const parsed = BigInt(value);
  if (parsed < 0n || parsed > 0xffff_ffffn) {
    throw new Error(`${label} must be a uint32`);
  }
  return parsed.toString();
}

function uint64(value: unknown, label: string): bigint {
  if (
    (typeof value !== 'string'
      && typeof value !== 'number'
      && typeof value !== 'bigint')
    || !/^[0-9]+$/.test(String(value))
  ) {
    throw new Error(`${label} must be a uint64`);
  }
  const parsed = BigInt(value);
  if (parsed < 0n || parsed > UINT64_MAX) {
    throw new Error(`${label} must be a uint64`);
  }
  return parsed;
}

function boundedPositiveInteger(
  value: unknown,
  min: number,
  max: number,
  label: string,
): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < min
    || value > max
  ) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function decodeCompactLength(
  bytes: Buffer,
  offset: number,
): Readonly<{ value: number; bytesRead: number }> {
  const first = bytes[offset];
  const mode = first & 0b11;
  if (mode === 0) {
    return Object.freeze({ value: first >>> 2, bytesRead: 1 });
  }
  if (mode === 1) {
    if (offset + 2 > bytes.length) {
      throw new Error(
        'federated mint-reservation pending statement length is truncated',
      );
    }
    const value = bytes.readUInt16LE(offset) >>> 2;
    if (value < 1 << 6) {
      throw new Error(
        'federated mint-reservation pending statement length is noncanonical',
      );
    }
    return Object.freeze({ value, bytesRead: 2 });
  }
  throw new Error(
    'federated mint-reservation pending statement length mode is unsupported',
  );
}

function requireBufferHex(
  value: Buffer,
  expectedHex: string,
  label: string,
): void {
  if (value.toString('hex') !== normalizeHex(expectedHex)) {
    throw new Error(`federated mint-reservation ${label} mismatch`);
  }
}

function nonzeroBuffer(value: Buffer, label: string): void {
  if (value.length !== 32 || value.every(byte => byte === 0)) {
    throw new Error(`${label} must be a nonzero 32-byte value`);
  }
}

function blake2b256Hex(value: Uint8Array): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function sha256Hex(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function falseAuthorityBoundary(): SubstrateFederatedMintReservationProducerV1Result['boundary'] {
  return Object.freeze({
    readOnlyRpc: true as const,
    exactFinalizedBlockReportedByBothSources: true as const,
    exactRuntimeAndProfileObserved: true as const,
    exactPendingReservationDecoded: true as const,
    matchingDistinctSourceObservations: true as const,
    stateProofCaptured: true as const,
    stateProofVerified: false as const,
    sourceFinalityCryptographicallyVerified: false as const,
    localPersistenceConsulted: false as const,
    localObservationAuthoritative: false as const,
    mintAuthorized: false as const,
    signingAuthorized: false as const,
    submissionAuthorized: false as const,
    broadcastAuthorized: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  });
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
  if (
    actual.length !== canonical.length
    || actual.some((key, index) => key !== canonical[index])
  ) {
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
