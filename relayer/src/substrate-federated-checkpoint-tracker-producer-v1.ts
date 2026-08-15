import blakejs from 'blakejs';

import { sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import {
  decodeAvlTreeRegisterDigest,
  decodeCanonicalIntRegister,
  decodeCanonicalLongRegister,
  decodeCollByteRegister,
  encodeAvlTreeRegister,
} from './ergo-encoding.js';
import {
  normalizeRootReadOnlyNodeEndpoint,
} from './authenticated-spv-tracker-read-only-node-client.js';
import {
  assertSubstrateFederatedCheckpointStatementV1MatchesProfile,
  decodeSubstrateFederatedCheckpointProfileV1,
  decodeSubstrateFederatedCheckpointStatementV1,
  type SubstrateFederatedCheckpointProfileV1,
  type SubstrateFederatedCheckpointStatementV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  buildSubstrateFederatedTrackerAdmissionV1,
  decodeSubstrateFederatedTrackerValueV1,
  SUBSTRATE_FEDERATED_TRACKER_VALUE_V1_BYTES,
  type SubstrateFederatedTrackerValueV1,
} from './profiles/substrate-federated-v1/tracker-admission.js';
import {
  assertSubstrateFederatedSettlementFamilyV1Identity,
  decodeSubstrateFederatedSettlementFamilyV1Profile,
  type SubstrateFederatedSettlementFamilyV1Identity,
} from './substrate-federated-settlement-family-v1.js';
import {
  getSubstrateFederatedTrackerDigestV1Hex,
  type SubstrateFederatedTrackerHistoryEntryV1,
} from './substrate-federated-burn-settlement-v1.js';
import {
  BRIDGE_EVENT_COMMITMENT_V1_SCALE_BYTES,
  ReadOnlySubstrateFinalityRpc,
  requestBridgeCommitmentReadProof,
  requestSubstrateBlockHashAt,
  requestSubstrateFinalizedHeadHash,
  requestSubstrateHeaderObservation,
} from './substrate-finality-provider.js';
import {
  normalizeEip12Box,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

export const SUBSTRATE_FEDERATED_CHECKPOINT_TRACKER_PRODUCER_V1_SCHEMA =
  'e2s.substrate-federated-checkpoint-tracker-producer.v1' as const;

const SOURCE_ID_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_CHECKPOINT_TRACKER_SOURCE_V1';
const SUBSTRATE_STATE_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_CHECKPOINT_SOURCE_STATE_V1';
const SUBSTRATE_AGREEMENT_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_CHECKPOINT_SOURCE_AGREEMENT_V1';
const ERGO_STATE_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_TRACKER_ERGO_STATE_V1';
const ERGO_AGREEMENT_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_TRACKER_ERGO_AGREEMENT_V1';
const ERGO_ANCHOR_ANCESTRY_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_TRACKER_ANCHOR_ANCESTRY_V1';
const TRACKER_KEY_BYTES = 32;
const TRACKER_AVL_FLAGS = 0x01;
const MAX_TRACKER_LINEAGE_BOXES = 16_385;
const MAX_ERGO_ANCHOR_ANCESTRY_DEPTH = 16_384;
const UINT32_MAX = 0xffff_ffffn;

export interface SubstrateFederatedTrackerErgoSourceV1 {
  readonly observationSourceId: string;
  getIndexedHeight(): Promise<unknown>;
  getBestHeader(): Promise<unknown>;
  getIndexedBoxesByTokenId(tokenId: string): Promise<unknown[]>;
  getBoxByIdOrNull(boxId: string): Promise<unknown | null>;
  getBlockHeaderById(headerId: string): Promise<unknown | null>;
  getBlockHeaderIdsAtHeight(height: number): Promise<string[]>;
}

export interface SubstrateFederatedCheckpointTrackerSourceSetV1 {
  readonly substrateSourceIdsHex: readonly [string, string];
  readonly ergoSourceIdsHex: readonly [string, string];
}

export interface SubstrateFederatedCheckpointTrackerProducerV1Input {
  readonly sources: SubstrateFederatedCheckpointTrackerSourceSetV1;
  readonly checkpointProfile:
    Readonly<SubstrateFederatedCheckpointProfileV1>;
  readonly checkpointStatement:
    Readonly<SubstrateFederatedCheckpointStatementV1>;
  readonly familyIdentity:
    Readonly<SubstrateFederatedSettlementFamilyV1Identity>;
  readonly trackerHistory:
    readonly SubstrateFederatedTrackerHistoryEntryV1[];
}

export interface SubstrateFederatedCheckpointTrackerProducerV1Result {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_CHECKPOINT_TRACKER_PRODUCER_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'checkpoint_tracker_observed_non_authorizing';
  readonly checkpointProfile:
    Readonly<SubstrateFederatedCheckpointProfileV1>;
  readonly checkpointStatement:
    Readonly<SubstrateFederatedCheckpointStatementV1>;
  readonly trackerState: {
    readonly dataInput: Readonly<Eip12Box>;
    readonly history:
      readonly Readonly<SubstrateFederatedTrackerHistoryEntryV1>[];
  };
  readonly finalizedSourceState: {
    readonly targetNativeBlockHashHex: string;
    readonly targetNativeHeight: string;
    readonly targetStateRootHex: string;
    readonly reportedFinalizedHeadHashHex: string;
    readonly reportedFinalizedHeadHeight: string;
    readonly executionBlockHashHex: string;
    readonly bridgeEventRootHex: string;
    readonly burnLeafCount: number;
    readonly commitmentScaleHex: string;
    readonly commitmentProofDigestHex: string;
    readonly stateObservationDigestHex: string;
    readonly sourceIdsHex: readonly [string, string];
    readonly sourceAgreementDigestHex: string;
  };
  readonly ergoTrackerState: {
    readonly trackerBoxIdHex: string;
    readonly trackerDigestHex: string;
    readonly trackerEntryKeyHex: string;
    readonly trackerEntryValueHex: string;
    readonly trackerLatestSourceNativeHeight: string;
    readonly trackerStampErgoHeight: number;
    readonly trackerInclusionHeight: number;
    readonly anchorHeaderIdHex: string;
    readonly anchorHeaderHeight: number;
    readonly anchorExtensionRootHex: string;
    readonly anchorDepth: number;
    readonly anchorAncestryDigestHex: string;
    readonly observedErgoTipIdHex: string;
    readonly observedErgoTipHeight: number;
    readonly stateObservationDigestHex: string;
    readonly sourceIdsHex: readonly [string, string];
    readonly sourceAgreementDigestHex: string;
  };
  readonly boundary: {
    readonly readOnlyRpc: true;
    readonly exactCheckpointCommitmentObserved: true;
    readonly exactApplicationProfileBound: true;
    readonly exactTrackerEntryBoundToTipDigest: true;
    readonly anchorHeaderObservedByBothSources: true;
    readonly anchorAncestryObservedByBothSources: true;
    readonly matchingDistinctSubstrateSourceObservations: true;
    readonly matchingDistinctErgoSourceObservations: true;
    readonly stateProofCaptured: true;
    readonly stateProofVerified: false;
    readonly sourceAttestationsVerifiedOnChain: false;
    readonly sourceFinalityCryptographicallyVerified: false;
    readonly ergoConsensusCryptographicallyVerified: false;
    readonly localPersistenceConsulted: false;
    readonly localObservationAuthoritative: false;
    readonly trackerAdmissionAuthorized: false;
    readonly payoutAuthorized: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  };
}

interface BoundSubstrateSource {
  readonly sourceIdHex: string;
  readonly canonicalOrigin: string;
  readonly rpc: ReadOnlySubstrateFinalityRpc;
}

interface BoundErgoSource {
  readonly sourceIdHex: string;
  readonly canonicalOrigin: string;
  readonly source: SubstrateFederatedTrackerErgoSourceV1;
}

interface SourceSetBinding {
  readonly substrate: readonly [BoundSubstrateSource, BoundSubstrateSource];
  readonly ergo: readonly [BoundErgoSource, BoundErgoSource];
  readonly substrateSourceIdsHex: readonly [string, string];
  readonly ergoSourceIdsHex: readonly [string, string];
}

interface NormalizedInput {
  readonly checkpointProfile:
    Readonly<SubstrateFederatedCheckpointProfileV1>;
  readonly checkpointStatement:
    Readonly<SubstrateFederatedCheckpointStatementV1>;
  readonly familyIdentity:
    Readonly<SubstrateFederatedSettlementFamilyV1Identity>;
  readonly trackerHistory:
    readonly Readonly<SubstrateFederatedTrackerHistoryEntryV1>[];
  readonly trackerDigestHex: string;
  readonly trackerEntry: Readonly<SubstrateFederatedTrackerHistoryEntryV1>;
  readonly trackerValue: Readonly<SubstrateFederatedTrackerValueV1>;
}

interface NormalizedHeader {
  readonly idHex: string;
  readonly parentIdHex: string;
  readonly height: number;
  readonly extensionRootHex: string;
}

interface ErgoSnapshot {
  readonly bestHeader: NormalizedHeader;
  readonly indexedHeight: number;
  readonly fullHeight: number;
}

const SOURCE_SET_BINDINGS = new WeakMap<object, SourceSetBinding>();
const PRODUCER_RESULTS = new WeakSet<object>();
const CONSUMED_PRODUCER_RESULTS = new WeakSet<object>();
const PRODUCER_RECOLLECTION_INPUTS = new WeakMap<
  object,
  Readonly<SubstrateFederatedCheckpointTrackerProducerV1Input>
>();

export function createSubstrateFederatedCheckpointTrackerSourceSetV1(input: {
  readonly primarySubstrateRpc: ReadOnlySubstrateFinalityRpc;
  readonly witnessSubstrateRpc: ReadOnlySubstrateFinalityRpc;
  readonly primaryErgoSource: SubstrateFederatedTrackerErgoSourceV1;
  readonly witnessErgoSource: SubstrateFederatedTrackerErgoSourceV1;
}): Readonly<SubstrateFederatedCheckpointTrackerSourceSetV1> {
  assertExactKeys(input, [
    'primarySubstrateRpc',
    'witnessSubstrateRpc',
    'primaryErgoSource',
    'witnessErgoSource',
  ], 'federated checkpoint/tracker source set');
  if (
    !(input.primarySubstrateRpc instanceof ReadOnlySubstrateFinalityRpc)
    || !(input.witnessSubstrateRpc instanceof ReadOnlySubstrateFinalityRpc)
  ) {
    throw new Error(
      'federated checkpoint sources require read-only Substrate RPC clients',
    );
  }
  if (input.primarySubstrateRpc.sharesTransportWith(input.witnessSubstrateRpc)) {
    throw new Error(
      'federated checkpoint observation requires distinct Substrate transports',
    );
  }
  const primarySubstrateOrigin =
    input.primarySubstrateRpc.getCanonicalOrigin();
  const witnessSubstrateOrigin =
    input.witnessSubstrateRpc.getCanonicalOrigin();
  if (
    primarySubstrateOrigin === null
    || witnessSubstrateOrigin === null
    || primarySubstrateOrigin === witnessSubstrateOrigin
  ) {
    throw new Error(
      'federated checkpoint observation requires distinct endpoint-bound Substrate origins',
    );
  }
  if (input.primaryErgoSource === input.witnessErgoSource) {
    throw new Error(
      'federated tracker observation requires distinct Ergo source objects',
    );
  }
  const primaryErgoOrigin = normalizeRootReadOnlyNodeEndpoint(
    input.primaryErgoSource.observationSourceId,
    'primary federated tracker Ergo source',
  );
  const witnessErgoOrigin = normalizeRootReadOnlyNodeEndpoint(
    input.witnessErgoSource.observationSourceId,
    'witness federated tracker Ergo source',
  );
  if (primaryErgoOrigin === witnessErgoOrigin) {
    throw new Error(
      'federated tracker observation requires distinct Ergo origins',
    );
  }

  const substrate = Object.freeze([
    bindSubstrateSource(primarySubstrateOrigin, input.primarySubstrateRpc),
    bindSubstrateSource(witnessSubstrateOrigin, input.witnessSubstrateRpc),
  ] as const);
  const ergo = Object.freeze([
    bindErgoSource(primaryErgoOrigin, input.primaryErgoSource),
    bindErgoSource(witnessErgoOrigin, input.witnessErgoSource),
  ] as const);
  const substrateSourceIdsHex = Object.freeze(
    substrate.map(source => source.sourceIdHex).sort(),
  ) as readonly [string, string];
  const ergoSourceIdsHex = Object.freeze(
    ergo.map(source => source.sourceIdHex).sort(),
  ) as readonly [string, string];
  const sourceSet = Object.freeze({
    substrateSourceIdsHex,
    ergoSourceIdsHex,
  });
  SOURCE_SET_BINDINGS.set(sourceSet, Object.freeze({
    substrate,
    ergo,
    substrateSourceIdsHex,
    ergoSourceIdsHex,
  }));
  return sourceSet;
}

export async function collectSubstrateFederatedCheckpointTrackerProducerV1(
  input: SubstrateFederatedCheckpointTrackerProducerV1Input,
): Promise<Readonly<SubstrateFederatedCheckpointTrackerProducerV1Result>> {
  assertExactKeys(input, [
    'sources',
    'checkpointProfile',
    'checkpointStatement',
    'familyIdentity',
    'trackerHistory',
  ], 'federated checkpoint/tracker producer input');
  const sources = sourceSetBinding(input.sources);
  const normalized = normalizeProducerInput(input);
  const [primarySubstrate, witnessSubstrate, primaryErgo, witnessErgo] =
    await Promise.all([
      collectSubstrateState(sources.substrate[0], normalized),
      collectSubstrateState(sources.substrate[1], normalized),
      collectErgoState(sources.ergo[0], normalized),
      collectErgoState(sources.ergo[1], normalized),
    ]);
  if (
    primarySubstrate.stateObservationDigestHex
      !== witnessSubstrate.stateObservationDigestHex
  ) {
    throw new Error(
      'federated checkpoint sources disagree on the checkpoint state',
    );
  }
  if (
    primaryErgo.stateObservationDigestHex
      !== witnessErgo.stateObservationDigestHex
  ) {
    throw new Error(
      'federated tracker sources disagree on the tracker or anchor state',
    );
  }

  const substrateAgreementDigestHex = sha256CanonicalJson({
    stateObservationDigestHex: primarySubstrate.stateObservationDigestHex,
    sourceIdsHex: sources.substrateSourceIdsHex,
  }, SUBSTRATE_AGREEMENT_DOMAIN);
  const ergoAgreementDigestHex = sha256CanonicalJson({
    stateObservationDigestHex: primaryErgo.stateObservationDigestHex,
    sourceIdsHex: sources.ergoSourceIdsHex,
  }, ERGO_AGREEMENT_DOMAIN);
  const result = deepFreeze({
    schema: SUBSTRATE_FEDERATED_CHECKPOINT_TRACKER_PRODUCER_V1_SCHEMA,
    version: 1 as const,
    status: 'checkpoint_tracker_observed_non_authorizing' as const,
    checkpointProfile: normalized.checkpointProfile,
    checkpointStatement: normalized.checkpointStatement,
    trackerState: {
      dataInput: primaryErgo.trackerDataInput,
      history: normalized.trackerHistory,
    },
    finalizedSourceState: {
      ...primarySubstrate.binding,
      stateObservationDigestHex: primarySubstrate.stateObservationDigestHex,
      sourceIdsHex: sources.substrateSourceIdsHex,
      sourceAgreementDigestHex: substrateAgreementDigestHex,
    },
    ergoTrackerState: {
      ...primaryErgo.binding,
      stateObservationDigestHex: primaryErgo.stateObservationDigestHex,
      sourceIdsHex: sources.ergoSourceIdsHex,
      sourceAgreementDigestHex: ergoAgreementDigestHex,
    },
    boundary: falseAuthorityBoundary(),
  });
  PRODUCER_RESULTS.add(result);
  PRODUCER_RECOLLECTION_INPUTS.set(result, Object.freeze({
    sources: input.sources,
    checkpointProfile: result.checkpointProfile,
    checkpointStatement: result.checkpointStatement,
    familyIdentity: input.familyIdentity,
    trackerHistory: result.trackerState.history,
  }));
  return result;
}

export function assertSubstrateFederatedCheckpointTrackerProducerV1Provenance(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedCheckpointTrackerProducerV1Result> {
  if (
    value === null
    || typeof value !== 'object'
    || !PRODUCER_RESULTS.has(value)
  ) {
    throw new Error(
      'federated checkpoint/tracker producer provenance is missing',
    );
  }
}

export function consumeSubstrateFederatedCheckpointTrackerProducerV1(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedCheckpointTrackerProducerV1Result> {
  assertSubstrateFederatedCheckpointTrackerProducerV1Provenance(value);
  if (CONSUMED_PRODUCER_RESULTS.has(value)) {
    throw new Error(
      'federated checkpoint/tracker producer result was already consumed',
    );
  }
  CONSUMED_PRODUCER_RESULTS.add(value);
}

/** Reobserve the exact checkpoint and tracker through the original ports. */
export function recollectSubstrateFederatedCheckpointTrackerProducerV1(
  value: unknown,
): Promise<Readonly<SubstrateFederatedCheckpointTrackerProducerV1Result>> {
  assertSubstrateFederatedCheckpointTrackerProducerV1Provenance(value);
  const input = PRODUCER_RECOLLECTION_INPUTS.get(value);
  if (input === undefined) {
    throw new Error(
      'federated checkpoint/tracker recollection provenance is missing',
    );
  }
  return collectSubstrateFederatedCheckpointTrackerProducerV1(input);
}

function normalizeProducerInput(
  input: SubstrateFederatedCheckpointTrackerProducerV1Input,
): NormalizedInput {
  assertSubstrateFederatedSettlementFamilyV1Identity(input.familyIdentity);
  const checkpointProfile = decodeSubstrateFederatedCheckpointProfileV1(
    input.checkpointProfile.encodedProfileHex,
  );
  const checkpointStatement =
    decodeSubstrateFederatedCheckpointStatementV1(
      input.checkpointStatement.encodedStatementHex,
    );
  assertSubstrateFederatedCheckpointStatementV1MatchesProfile(
    checkpointStatement,
    checkpointProfile,
  );
  const family = decodeSubstrateFederatedSettlementFamilyV1Profile(
    input.familyIdentity.profile,
  );
  const exactBindings = [
    [checkpointStatement.sourceNetworkIdHex, family.sourceNetworkIdHex],
    [checkpointStatement.sidechainIdHex, family.sidechainIdHex],
    [checkpointStatement.bridgeAddressHex, family.bridgeAddressHex],
    [checkpointStatement.tokenAddressHex, family.tokenAddressHex],
    [checkpointStatement.runtimeProfileIdHex, family.runtimeProfileIdHex],
    [checkpointStatement.settlementProfileIdHex, family.settlementProfileIdHex],
    [checkpointStatement.federationProfileIdHex, family.federationProfileIdHex],
    [
      checkpointStatement.sourceAttestationKeySetDigestHex,
      family.sourceAttestationKeySetDigestHex,
    ],
    [
      String(checkpointStatement.sourceAttestationThreshold),
      String(family.sourceAttestationThreshold),
    ],
    [
      checkpointStatement.ergoAdmissionKeySetDigestHex,
      family.ergoAdmissionKeySetDigestHex,
    ],
    [
      String(checkpointStatement.ergoAdmissionThreshold),
      String(family.ergoAdmissionThreshold),
    ],
    [checkpointStatement.federationEpoch, family.federationEpoch],
    [checkpointProfile.profileIdHex, family.federationProfileIdHex],
  ] as const;
  if (exactBindings.some(([actual, expected]) => actual !== expected)) {
    throw new Error(
      'federated checkpoint statement differs from the settlement-family profile',
    );
  }

  const trackerHistory = normalizeTrackerHistory(input.trackerHistory);
  if (trackerHistory.length === 0) {
    throw new Error('federated tracker history must not be empty');
  }
  const trackerDigestHex = getSubstrateFederatedTrackerDigestV1Hex(
    trackerHistory,
  );
  const matchingEntries = trackerHistory.map(entry => ({
    entry,
    value: decodeSubstrateFederatedTrackerValueV1(entry.value),
  })).filter(({ value }) =>
    value.statementIdHex === checkpointStatement.statementIdHex
  );
  if (matchingEntries.length !== 1) {
    throw new Error(
      'federated tracker history must contain the exact checkpoint once',
    );
  }
  const trackerEntry = matchingEntries[0].entry;
  const trackerValue = matchingEntries[0].value;
  const admission = buildSubstrateFederatedTrackerAdmissionV1({
    profile: checkpointProfile,
    encodedStatementHex: checkpointStatement.encodedStatementHex,
    currentErgoHeight: trackerValue.anchorHeaderHeight,
    anchorHeaderIdHex: trackerValue.anchorHeaderIdHex,
    anchorHeaderHeight: trackerValue.anchorHeaderHeight,
  });
  if (
    trackerEntry.key !== admission.trackerKeyHex
    || trackerEntry.value !== admission.trackerValueHex
  ) {
    throw new Error(
      'federated tracker history entry differs from the exact checkpoint admission',
    );
  }
  let previousHeight = 0n;
  for (const [index, entry] of trackerHistory.entries()) {
    const height = BigInt(
      decodeSubstrateFederatedTrackerValueV1(entry.value)
        .sourceNativeBlockHeight,
    );
    if (height <= previousHeight) {
      throw new Error(
        `federated tracker history source height ${index} is not strictly increasing`,
      );
    }
    previousHeight = height;
  }
  return Object.freeze({
    checkpointProfile,
    checkpointStatement,
    familyIdentity: input.familyIdentity,
    trackerHistory,
    trackerDigestHex,
    trackerEntry,
    trackerValue,
  });
}

async function collectSubstrateState(
  source: BoundSubstrateSource,
  input: NormalizedInput,
) {
  const statement = input.checkpointStatement;
  const targetHeight = uint32(
    statement.sourceNativeBlockHeight,
    'federated checkpoint source native height',
  );
  const targetHash = `0x${statement.sourceNativeBlockHashHex}`;
  const finalizedHeadHash = await requestSubstrateFinalizedHeadHash(source.rpc);
  const [finalizedHead, targetHeader, canonicalTargetHash, proof] =
    await Promise.all([
      requestSubstrateHeaderObservation(source.rpc, finalizedHeadHash),
      requestSubstrateHeaderObservation(source.rpc, targetHash),
      requestSubstrateBlockHashAt(source.rpc, targetHeight),
      requestBridgeCommitmentReadProof(source.rpc, targetHash),
    ]);
  const finalizedHeight = rpcUint32(
    finalizedHead.number,
    'reported finalized Substrate height',
  );
  const observedTargetHeight = rpcUint32(
    targetHeader.number,
    'checkpoint Substrate height',
  );
  if (
    observedTargetHeight !== BigInt(targetHeight)
    || normalizeHex(canonicalTargetHash) !== statement.sourceNativeBlockHashHex
    || finalizedHeight < observedTargetHeight
  ) {
    throw new Error(
      'federated checkpoint target is not canonical under the reported finalized head',
    );
  }
  if (normalizeHex(proof.atNativeBlockHashHex) !== statement.sourceNativeBlockHashHex) {
    throw new Error(
      'federated checkpoint proof differs from the requested source block',
    );
  }
  const commitment = decodeRuntimeCommitment(proof.storageValueScaleHex);
  if (
    commitment.sidechainIdHex !== statement.sidechainIdHex
    || commitment.sidechainHeight !== statement.sourceNativeBlockHeight
    || commitment.executionBlockHashHex !== statement.executionBlockHashHex
    || commitment.bridgeEventRootHex !== statement.bridgeEventRootHex
    || commitment.burnLeafCount !== statement.burnLeafCount
  ) {
    throw new Error(
      'federated runtime checkpoint commitment differs from the exact statement',
    );
  }
  const [finalHeadRecheck, canonicalTargetRecheck] = await Promise.all([
    requestSubstrateFinalizedHeadHash(source.rpc),
    requestSubstrateBlockHashAt(source.rpc, targetHeight),
  ]);
  if (
    normalizeHex(finalHeadRecheck) !== normalizeHex(finalizedHeadHash)
    || normalizeHex(canonicalTargetRecheck) !== statement.sourceNativeBlockHashHex
  ) {
    throw new Error(
      'federated checkpoint finalized source view changed during collection',
    );
  }
  const commitmentProofDigestHex = sha256CanonicalJson({
    atNativeBlockHashHex: normalizeHex(proof.atNativeBlockHashHex),
    storageKeysHex: proof.storageKeysHex.map(normalizeHex),
    storageValueScaleHex: normalizeHex(proof.storageValueScaleHex),
    proofNodesHex: proof.proofNodesHex.map(normalizeHex),
  }, 'E2S_SUBSTRATE_FEDERATED_CHECKPOINT_READ_PROOF_V1');
  const binding = deepFreeze({
    targetNativeBlockHashHex: statement.sourceNativeBlockHashHex,
    targetNativeHeight: statement.sourceNativeBlockHeight,
    targetStateRootHex: fixedHex(
      targetHeader.stateRoot,
      32,
      'federated checkpoint target state root',
    ),
    reportedFinalizedHeadHashHex: fixedHex(
      finalizedHeadHash,
      32,
      'reported finalized Substrate head hash',
    ),
    reportedFinalizedHeadHeight: finalizedHeight.toString(),
    executionBlockHashHex: commitment.executionBlockHashHex,
    bridgeEventRootHex: commitment.bridgeEventRootHex,
    burnLeafCount: commitment.burnLeafCount,
    commitmentScaleHex: commitment.scaleHex,
    commitmentProofDigestHex,
  });
  return deepFreeze({
    binding,
    stateObservationDigestHex: sha256CanonicalJson(
      binding,
      SUBSTRATE_STATE_DOMAIN,
    ),
  });
}

async function collectErgoState(
  source: BoundErgoSource,
  input: NormalizedInput,
) {
  const family = decodeSubstrateFederatedSettlementFamilyV1Profile(
    input.familyIdentity.profile,
  );
  const before = await captureErgoSnapshot(source.source, 'initial');
  const rawBoxes = await source.source.getIndexedBoxesByTokenId(
    family.trackerNftIdHex,
  );
  if (
    !Array.isArray(rawBoxes)
    || rawBoxes.length === 0
    || rawBoxes.length > MAX_TRACKER_LINEAGE_BOXES
  ) {
    throw new Error(
      `federated tracker index must contain between 1 and ${MAX_TRACKER_LINEAGE_BOXES} boxes`,
    );
  }
  const boxIds = rawBoxes.map((value, index) => fixedHex(
    objectValue(value, `indexed federated tracker box ${index}`).boxId,
    32,
    `indexed federated tracker box ${index} ID`,
  ));
  if (new Set(boxIds).size !== boxIds.length) {
    throw new Error('federated tracker index contains duplicate boxes');
  }
  const unspent = rawBoxes.filter(value => {
    const raw = objectValue(value, 'indexed federated tracker box');
    return raw.spentTransactionId === null
      || raw.spentTransactionId === undefined;
  });
  if (unspent.length !== 1) {
    throw new Error(
      `federated tracker index must contain one unspent singleton, got ${unspent.length}`,
    );
  }
  const indexedRaw = objectValue(unspent[0], 'indexed federated tracker tip');
  if (indexedRaw.spendingProof !== null && indexedRaw.spendingProof !== undefined) {
    throw new Error(
      'unspent federated tracker tip must not contain a spending proof',
    );
  }
  const trackerInclusionHeight = nonnegativeSafeInteger(
    indexedRaw.inclusionHeight,
    'federated tracker inclusion height',
  );
  const trackerDataInput = deepFreeze(await normalizeEip12Box(
    indexedRaw,
    'indexed federated tracker tip',
  ));
  assertTrackerDataInput(
    trackerDataInput,
    trackerInclusionHeight,
    before,
    input,
  );
  const canonicalRaw = await source.source.getBoxByIdOrNull(
    trackerDataInput.boxId,
  );
  if (canonicalRaw === null) {
    throw new Error(
      'federated tracker tip is absent from the canonical UTXO set',
    );
  }
  const canonical = await normalizeEip12Box(
    canonicalRaw,
    'canonical federated tracker tip',
  );
  if (canonicalBoxIdentity(canonical) !== canonicalBoxIdentity(trackerDataInput)) {
    throw new Error(
      'canonical federated tracker tip differs from the indexed singleton',
    );
  }

  const anchorHeight = input.trackerValue.anchorHeaderHeight;
  const anchorId = input.trackerValue.anchorHeaderIdHex;
  const [anchorIdsRaw, anchorHeaderRaw] = await Promise.all([
    source.source.getBlockHeaderIdsAtHeight(anchorHeight),
    source.source.getBlockHeaderById(anchorId),
  ]);
  if (!Array.isArray(anchorIdsRaw) || anchorIdsRaw.length === 0) {
    throw new Error('federated tracker anchor height has no observed headers');
  }
  const anchorIds = anchorIdsRaw.map((id, index) => fixedHex(
    id,
    32,
    `federated tracker anchor header ID ${index}`,
  ));
  if (
    new Set(anchorIds).size !== anchorIds.length
    || anchorIds.filter(id => id === anchorId).length !== 1
  ) {
    throw new Error(
      'federated tracker anchor is not canonical at its observed height',
    );
  }
  if (anchorHeaderRaw === null) {
    throw new Error('federated tracker anchor header is unavailable');
  }
  const anchorHeader = normalizeHeader(
    anchorHeaderRaw,
    'federated tracker anchor header',
  );
  if (anchorHeader.idHex !== anchorId || anchorHeader.height !== anchorHeight) {
    throw new Error('federated tracker anchor header identity drifted');
  }
  const anchorAncestry = await collectAnchorAncestry(
    source.source,
    before.bestHeader,
    anchorHeader,
  );
  if (anchorAncestry.depth < family.minimumAnchorConfirmations) {
    throw new Error('federated tracker anchor lacks required depth');
  }
  const validFrom = BigInt(
    input.checkpointStatement.admissionValidFromErgoHeight,
  );
  const expiresAt = BigInt(
    input.checkpointStatement.admissionExpiresAtErgoHeight,
  );
  if (BigInt(anchorHeight) < validFrom || BigInt(anchorHeight) >= expiresAt) {
    throw new Error('federated tracker anchor is outside the statement horizon');
  }
  const after = await captureErgoSnapshot(source.source, 'final');
  if (ergoSnapshotIdentity(before) !== ergoSnapshotIdentity(after)) {
    throw new Error(
      'federated tracker Ergo view changed during collection',
    );
  }
  const trackerStampErgoHeight = decodeCanonicalIntRegister(
    trackerDataInput.additionalRegisters.R8,
    'federated tracker R8',
  );
  const trackerLatestSourceNativeHeight = decodeCanonicalLongRegister(
    trackerDataInput.additionalRegisters.R7,
    'federated tracker R7',
  ).toString();
  const binding = deepFreeze({
    trackerBoxIdHex: trackerDataInput.boxId,
    trackerDigestHex: input.trackerDigestHex,
    trackerEntryKeyHex: input.trackerEntry.key,
    trackerEntryValueHex: input.trackerEntry.value,
    trackerLatestSourceNativeHeight,
    trackerStampErgoHeight,
    trackerInclusionHeight,
    anchorHeaderIdHex: anchorHeader.idHex,
    anchorHeaderHeight: anchorHeader.height,
    anchorExtensionRootHex: anchorHeader.extensionRootHex,
    anchorDepth: anchorAncestry.depth,
    anchorAncestryDigestHex: anchorAncestry.digestHex,
    observedErgoTipIdHex: before.bestHeader.idHex,
    observedErgoTipHeight: before.fullHeight,
  });
  return deepFreeze({
    trackerDataInput,
    binding,
    stateObservationDigestHex: sha256CanonicalJson(
      {
        ...binding,
        trackerDataInput: canonicalBoxIdentity(trackerDataInput),
      },
      ERGO_STATE_DOMAIN,
    ),
  });
}

function assertTrackerDataInput(
  box: Readonly<Eip12Box>,
  inclusionHeight: number,
  snapshot: ErgoSnapshot,
  input: NormalizedInput,
): void {
  const family = decodeSubstrateFederatedSettlementFamilyV1Profile(
    input.familyIdentity.profile,
  );
  if (
    blake2b256Hex(Buffer.from(box.ergoTree, 'hex'))
      !== family.trackerContractIdHex
    || box.assets.length !== 1
    || box.assets[0].tokenId !== family.trackerNftIdHex
    || box.assets[0].amount !== '1'
    || Object.keys(box.additionalRegisters).sort().join(',')
      !== 'R4,R5,R6,R7,R8,R9'
    || decodeCollByteRegister(
      box.additionalRegisters.R4,
      'federated tracker R4',
    ) !== family.federationProfileIdHex
    || decodeCollByteRegister(
      box.additionalRegisters.R6,
      'federated tracker R6',
    ) !== family.sidechainIdHex
    || decodeCollByteRegister(
      box.additionalRegisters.R9,
      'federated tracker R9',
    ) !== family.ergoAdmissionKeySetDigestHex
  ) {
    throw new Error(
      'federated tracker data input is not the exact configured singleton',
    );
  }
  const digest = decodeAvlTreeRegisterDigest(
    box.additionalRegisters.R5,
    'federated tracker R5',
  );
  if (
    digest !== input.trackerDigestHex
    || box.additionalRegisters.R5 !== encodeAvlTreeRegister(
      Buffer.from(digest, 'hex'),
      TRACKER_AVL_FLAGS,
      SUBSTRATE_FEDERATED_TRACKER_VALUE_V1_BYTES,
    )
  ) {
    throw new Error(
      'federated tracker tip digest differs from the supplied exact history',
    );
  }
  const historyLatestHeight = BigInt(
    decodeSubstrateFederatedTrackerValueV1(
      input.trackerHistory[input.trackerHistory.length - 1].value,
    ).sourceNativeBlockHeight,
  );
  const registerLatestHeight = decodeCanonicalLongRegister(
    box.additionalRegisters.R7,
    'federated tracker R7',
  );
  const stamp = decodeCanonicalIntRegister(
    box.additionalRegisters.R8,
    'federated tracker R8',
  );
  const latestAnchorHeight = decodeSubstrateFederatedTrackerValueV1(
    input.trackerHistory[input.trackerHistory.length - 1].value,
  ).anchorHeaderHeight;
  if (
    registerLatestHeight !== historyLatestHeight
    || stamp < latestAnchorHeight
    || stamp > snapshot.fullHeight
    || inclusionHeight > snapshot.fullHeight
    || box.creationHeight > snapshot.fullHeight
  ) {
    throw new Error('federated tracker tip height state is inconsistent');
  }
}

async function captureErgoSnapshot(
  source: SubstrateFederatedTrackerErgoSourceV1,
  label: string,
): Promise<ErgoSnapshot> {
  const progress = objectValue(
    await source.getIndexedHeight(),
    `${label} federated tracker index progress`,
  );
  const indexedHeight = nonnegativeSafeInteger(
    progress.indexedHeight,
    `${label} federated tracker indexed height`,
  );
  const fullHeight = nonnegativeSafeInteger(
    progress.fullHeight,
    `${label} federated tracker full height`,
  );
  if (indexedHeight !== fullHeight) {
    throw new Error(
      'federated tracker Ergo extra index is not synchronized',
    );
  }
  const bestHeader = normalizeHeader(
    await source.getBestHeader(),
    `${label} federated tracker best header`,
  );
  if (bestHeader.height !== fullHeight) {
    throw new Error(
      'federated tracker Ergo best header does not identify full height',
    );
  }
  return Object.freeze({ bestHeader, indexedHeight, fullHeight });
}

async function collectAnchorAncestry(
  source: SubstrateFederatedTrackerErgoSourceV1,
  bestHeader: NormalizedHeader,
  anchorHeader: NormalizedHeader,
): Promise<Readonly<{ readonly depth: number; readonly digestHex: string }>> {
  if (bestHeader.height < anchorHeader.height) {
    throw new Error('federated tracker anchor is above the observed Ergo tip');
  }
  const depth = bestHeader.height - anchorHeader.height;
  if (depth > MAX_ERGO_ANCHOR_ANCESTRY_DEPTH) {
    throw new Error(
      `federated tracker anchor ancestry exceeds ${MAX_ERGO_ANCHOR_ANCESTRY_DEPTH} headers`,
    );
  }
  const ancestry: NormalizedHeader[] = [bestHeader];
  let cursor = bestHeader;
  while (cursor.height > anchorHeader.height) {
    const parentRaw = await source.getBlockHeaderById(cursor.parentIdHex);
    if (parentRaw === null) {
      throw new Error(
        'federated tracker anchor ancestry has a missing parent header',
      );
    }
    const parent = normalizeHeader(
      parentRaw,
      `federated tracker ancestry header ${cursor.height - 1}`,
    );
    if (
      parent.idHex !== cursor.parentIdHex
      || parent.height !== cursor.height - 1
    ) {
      throw new Error(
        'federated tracker anchor ancestry parent identity drifted',
      );
    }
    ancestry.push(parent);
    cursor = parent;
  }
  if (canonicalHeaderIdentity(cursor) !== canonicalHeaderIdentity(anchorHeader)) {
    throw new Error(
      'federated tracker anchor is not an ancestor of the observed Ergo tip',
    );
  }
  return Object.freeze({
    depth,
    digestHex: sha256CanonicalJson(
      ancestry.map(header => ({
        idHex: header.idHex,
        parentIdHex: header.parentIdHex,
        height: header.height,
        extensionRootHex: header.extensionRootHex,
      })),
      ERGO_ANCHOR_ANCESTRY_DOMAIN,
    ),
  });
}

function decodeRuntimeCommitment(value: string) {
  const scaleHex = normalizeHex(value);
  if (scaleHex.length !== BRIDGE_EVENT_COMMITMENT_V1_SCALE_BYTES * 2) {
    throw new Error(
      `federated runtime checkpoint must be ${BRIDGE_EVENT_COMMITMENT_V1_SCALE_BYTES} bytes`,
    );
  }
  const bytes = Buffer.from(scaleHex, 'hex');
  if (bytes[0] !== 1) {
    throw new Error('federated runtime checkpoint format version is invalid');
  }
  const burnLeafCount = bytes.readUInt32LE(105);
  if (burnLeafCount < 1 || burnLeafCount > 256) {
    throw new Error('federated runtime checkpoint burn count is invalid');
  }
  return Object.freeze({
    scaleHex,
    sidechainIdHex: nonzeroSlice(bytes, 1, 33, 'runtime sidechain ID'),
    sidechainHeight: bytes.readBigUInt64LE(33).toString(),
    executionBlockHashHex: nonzeroSlice(
      bytes,
      41,
      73,
      'runtime execution block hash',
    ),
    bridgeEventRootHex: nonzeroSlice(
      bytes,
      73,
      105,
      'runtime bridge event root',
    ),
    burnLeafCount,
  });
}

function normalizeTrackerHistory(
  history: readonly SubstrateFederatedTrackerHistoryEntryV1[],
): readonly Readonly<SubstrateFederatedTrackerHistoryEntryV1>[] {
  if (!Array.isArray(history)) {
    throw new Error('federated tracker history must be an array');
  }
  if (history.length > MAX_TRACKER_LINEAGE_BOXES) {
    throw new Error(
      `federated tracker history exceeds ${MAX_TRACKER_LINEAGE_BOXES} entries`,
    );
  }
  const seen = new Set<string>();
  return Object.freeze(history.map((entry, index) => {
    assertExactKeys(entry, [
      'key',
      'value',
    ], `federated tracker history entry ${index}`);
    const key = fixedHex(
      entry.key,
      TRACKER_KEY_BYTES,
      `federated tracker history entry ${index} key`,
    );
    if (seen.has(key)) {
      throw new Error('federated tracker history contains duplicate keys');
    }
    seen.add(key);
    const value = fixedHex(
      entry.value,
      SUBSTRATE_FEDERATED_TRACKER_VALUE_V1_BYTES,
      `federated tracker history entry ${index} value`,
    );
    decodeSubstrateFederatedTrackerValueV1(value);
    return Object.freeze({ key, value });
  }));
}

function bindSubstrateSource(
  canonicalOrigin: string,
  rpc: ReadOnlySubstrateFinalityRpc,
): BoundSubstrateSource {
  return Object.freeze({
    sourceIdHex: sourceIdHex('substrate', canonicalOrigin),
    canonicalOrigin,
    rpc,
  });
}

function bindErgoSource(
  canonicalOrigin: string,
  source: SubstrateFederatedTrackerErgoSourceV1,
): BoundErgoSource {
  return Object.freeze({
    sourceIdHex: sourceIdHex('ergo', canonicalOrigin),
    canonicalOrigin,
    source,
  });
}

function sourceIdHex(kind: 'substrate' | 'ergo', canonicalOrigin: string) {
  return sha256CanonicalJson({
    schema: 'e2s.substrate-federated-checkpoint-tracker-source.v1',
    kind,
    canonicalOrigin,
  }, SOURCE_ID_DOMAIN);
}

function sourceSetBinding(value: unknown): SourceSetBinding {
  if (value === null || typeof value !== 'object') {
    throw new Error(
      'federated checkpoint/tracker source-set provenance is missing',
    );
  }
  const binding = SOURCE_SET_BINDINGS.get(value);
  if (binding === undefined) {
    throw new Error(
      'federated checkpoint/tracker source-set provenance is missing',
    );
  }
  return binding;
}

function normalizeHeader(value: unknown, label: string): NormalizedHeader {
  const raw = objectValue(value, label);
  const extensionRoot = raw.extensionRoot === undefined
    ? raw.extensionHash
    : raw.extensionRoot;
  if (
    raw.extensionRoot !== undefined
    && raw.extensionHash !== undefined
    && fixedHex(raw.extensionRoot, 32, `${label} extension root`)
      !== fixedHex(raw.extensionHash, 32, `${label} extension hash`)
  ) {
    throw new Error(`${label} extension aliases disagree`);
  }
  return Object.freeze({
    idHex: fixedHex(raw.id, 32, `${label} ID`),
    parentIdHex: fixedHex(raw.parentId, 32, `${label} parent ID`),
    height: nonnegativeSafeInteger(raw.height, `${label} height`),
    extensionRootHex: fixedHex(
      extensionRoot,
      32,
      `${label} extension root`,
    ),
  });
}

function ergoSnapshotIdentity(value: ErgoSnapshot): string {
  return JSON.stringify(value);
}

function canonicalHeaderIdentity(value: NormalizedHeader): string {
  return sha256CanonicalJson({
    idHex: value.idHex,
    parentIdHex: value.parentIdHex,
    height: value.height,
    extensionRootHex: value.extensionRootHex,
  }, 'E2S_SUBSTRATE_FEDERATED_TRACKER_ERGO_HEADER_V1');
}

function canonicalBoxIdentity(value: Readonly<Eip12Box>): string {
  return sha256CanonicalJson({
    boxId: value.boxId,
    value: value.value,
    ergoTree: value.ergoTree,
    assets: value.assets,
    additionalRegisters: value.additionalRegisters,
    creationHeight: value.creationHeight,
    transactionId: value.transactionId,
    index: value.index,
  }, 'E2S_SUBSTRATE_FEDERATED_TRACKER_EIP12_BOX_V1');
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  const normalized = normalizeHex(value);
  if (normalized.length !== bytes * 2) {
    throw new Error(`${label} must be ${bytes}-byte canonical hex`);
  }
  return normalized;
}

function normalizeHex(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('hex value must be a string');
  }
  const normalized = value.replace(/^0x/i, '').toLowerCase();
  if (
    normalized.length === 0
    || normalized.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new Error('hex value must contain canonical whole bytes');
  }
  return normalized;
}

function nonzeroSlice(
  value: Buffer,
  start: number,
  end: number,
  label: string,
): string {
  const bytes = value.subarray(start, end);
  if (bytes.every(byte => byte === 0)) {
    throw new Error(`${label} must not be zero`);
  }
  return bytes.toString('hex');
}

function uint32(value: string, label: string): number {
  const parsed = BigInt(value);
  if (parsed < 0n || parsed > UINT32_MAX) {
    throw new Error(`${label} must fit uint32`);
  }
  return Number(parsed);
}

function rpcUint32(value: unknown, label: string): bigint {
  if (
    typeof value !== 'string'
    || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value)
  ) {
    throw new Error(`${label} must be canonical lowercase RPC hex`);
  }
  const parsed = BigInt(value);
  if (parsed > UINT32_MAX) {
    throw new Error(`${label} exceeds uint32`);
  }
  return parsed;
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(value);
}

function objectValue(value: unknown, label: string): Record<string, any> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function blake2b256Hex(value: Uint8Array): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function falseAuthorityBoundary():
SubstrateFederatedCheckpointTrackerProducerV1Result['boundary'] {
  return Object.freeze({
    readOnlyRpc: true as const,
    exactCheckpointCommitmentObserved: true as const,
    exactApplicationProfileBound: true as const,
    exactTrackerEntryBoundToTipDigest: true as const,
    anchorHeaderObservedByBothSources: true as const,
    anchorAncestryObservedByBothSources: true as const,
    matchingDistinctSubstrateSourceObservations: true as const,
    matchingDistinctErgoSourceObservations: true as const,
    stateProofCaptured: true as const,
    stateProofVerified: false as const,
    sourceAttestationsVerifiedOnChain: false as const,
    sourceFinalityCryptographicallyVerified: false as const,
    ergoConsensusCryptographicallyVerified: false as const,
    localPersistenceConsulted: false as const,
    localObservationAuthoritative: false as const,
    trackerAdmissionAuthorized: false as const,
    payoutAuthorized: false as const,
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
  keys: readonly string[],
  label: string,
): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} fields are invalid`);
  }
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value as Readonly<T>;
}
