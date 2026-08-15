/**
 * Read-shaped FED-3 predecessor collector.
 *
 * This module observes the exact reserve, duplicate-prevention and external-fee
 * inputs already frozen in one process-owned settlement packet. It invokes no
 * write-shaped port, but it does not attest source-implementation side effects
 * and does not check, sign, submit, broadcast, persist, or establish consensus.
 */

import {
  decodeAvlTreeRegisterDigest,
  decodeCanonicalLongRegister,
  decodeCollByteRegister,
  encodeAvlTreeRegister,
} from './ergo-encoding.js';
import {
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';
import {
  normalizeRootReadOnlyNodeEndpoint,
} from './authenticated-spv-tracker-read-only-node-client.js';
import {
  assertSubstrateFederatedBurnSettlementV1Packet,
  type SubstrateFederatedBurnSettlementV1Packet,
} from './substrate-federated-burn-settlement-v1.js';
import {
  assertSubstrateFederatedSettlementFamilyV1Identity,
  decodeSubstrateFederatedSettlementFamilyV1Profile,
  type SubstrateFederatedSettlementFamilyV1DecodedProfile,
  type SubstrateFederatedSettlementFamilyV1Identity,
} from './substrate-federated-settlement-family-v1.js';
import {
  normalizeEip12Box,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

export const SUBSTRATE_FEDERATED_SETTLEMENT_PREDECESSOR_PRODUCER_V1_SCHEMA =
  'e2s.substrate-federated-settlement-predecessor-producer.v1' as const;

const SOURCE_ID_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_SETTLEMENT_PREDECESSOR_SOURCE_V1';
const STATE_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_SETTLEMENT_PREDECESSOR_STATE_V1';
const AGREEMENT_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_SETTLEMENT_PREDECESSOR_AGREEMENT_V1';
const PACKET_BINDING_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_SETTLEMENT_PREDECESSOR_PACKET_V1';
const BOX_IDENTITY_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_SETTLEMENT_PREDECESSOR_BOX_V1';
const SNAPSHOT_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_SETTLEMENT_PREDECESSOR_SNAPSHOT_V1';
const MAX_SINGLETON_LINEAGE_BOXES = 16_385;
const AVLTREE_INSERT_ONLY = 0x01;
const RESERVE_VALUE_BYTES = 32;
const DUP_VALUE_BYTES = 1;

export interface SubstrateFederatedSettlementPredecessorErgoSourceV1 {
  readonly observationSourceId: string;
  getIndexedHeight(): Promise<unknown>;
  getBestHeader(): Promise<unknown>;
  getIndexedBoxesByTokenId(tokenId: string): Promise<unknown[]>;
  getBoxByIdOrNull(boxId: string): Promise<unknown | null>;
}

export interface SubstrateFederatedSettlementPredecessorSourceSetV1 {
  readonly ergoSourceIdsHex: readonly [string, string];
}

export interface SubstrateFederatedSettlementPredecessorProducerV1Input {
  readonly sources: SubstrateFederatedSettlementPredecessorSourceSetV1;
  readonly familyIdentity:
    Readonly<SubstrateFederatedSettlementFamilyV1Identity>;
  readonly settlementPacket:
    Readonly<SubstrateFederatedBurnSettlementV1Packet>;
}

interface ObservedSingletonStateV1 {
  readonly box: Readonly<Eip12Box>;
  readonly boxIdHex: string;
  readonly boxIdentityDigestHex: string;
  readonly inclusionHeight: number;
  readonly indexedLineageBoxCount: number;
}

interface ObservedFeeStateV1 {
  readonly box: Readonly<Eip12Box>;
  readonly boxIdHex: string;
  readonly boxIdentityDigestHex: string;
}

export interface SubstrateFederatedSettlementPredecessorProducerV1Result {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_SETTLEMENT_PREDECESSOR_PRODUCER_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'settlement_predecessors_observed_non_authorizing';
  readonly familyIdHex: string;
  readonly settlementTransactionIdHex: string;
  readonly settlementPacketBindingDigestHex: string;
  readonly predecessorState: {
    readonly reserve: Readonly<ObservedSingletonStateV1>;
    readonly duplicatePrevention: Readonly<ObservedSingletonStateV1>;
    readonly feeFunding: Readonly<ObservedFeeStateV1>;
    readonly observedErgoTipIdHex: string;
    readonly observedErgoTipHeight: number;
    readonly stateObservationDigestHex: string;
    readonly sourceIdsHex: readonly [string, string];
    readonly sourceAgreementDigestHex: string;
  };
  readonly boundary: {
    readonly readShapedSourcePortUsed: true;
    readonly exactReserveSingletonObserved: true;
    readonly exactDuplicatePreventionSingletonObserved: true;
    readonly exactExternalFeeUtxoObserved: true;
    readonly exactSettlementPacketBound: true;
    readonly stableIndexedTipObservedByBothSources: true;
    readonly matchingDistinctErgoSourceObservations: true;
    readonly producerPersistencePortUsed: false;
    readonly sourceImplementationSideEffectsVerifiedAbsent: false;
    readonly localObservationAuthoritative: false;
    readonly ergoConsensusCryptographicallyVerified: false;
    readonly predecessorFundsAuthorityEstablished: false;
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
  };
}

interface BoundSource {
  readonly sourceIdHex: string;
  readonly canonicalOrigin: string;
  readonly source: SubstrateFederatedSettlementPredecessorErgoSourceV1;
}

interface SourceSetBinding {
  readonly sources: readonly [BoundSource, BoundSource];
  readonly sourceIdsHex: readonly [string, string];
}

interface NormalizedHeader {
  readonly idHex: string;
  readonly parentIdHex: string;
  readonly height: number;
  readonly extensionRootHex: string;
}

interface ErgoSnapshot {
  readonly indexedHeight: number;
  readonly fullHeight: number;
  readonly bestHeader: NormalizedHeader;
}

interface NormalizedInput {
  readonly familyIdentity:
    Readonly<SubstrateFederatedSettlementFamilyV1Identity>;
  readonly familyProfile:
    Readonly<SubstrateFederatedSettlementFamilyV1DecodedProfile>;
  readonly settlementPacket:
    Readonly<SubstrateFederatedBurnSettlementV1Packet>;
  readonly settlementPacketBindingDigestHex: string;
  readonly reserve: Readonly<Eip12Box>;
  readonly duplicatePrevention: Readonly<Eip12Box>;
  readonly feeFunding: Readonly<Eip12Box>;
}

const SOURCE_SET_BINDINGS = new WeakMap<object, SourceSetBinding>();
const PRODUCER_RESULTS = new WeakSet<object>();
const CONSUMED_PRODUCER_RESULTS = new WeakSet<object>();
const PRODUCER_RECOLLECTION_INPUTS = new WeakMap<
  object,
  Readonly<SubstrateFederatedSettlementPredecessorProducerV1Input>
>();

export function createSubstrateFederatedSettlementPredecessorSourceSetV1(
  input: {
    readonly primaryErgoSource:
      SubstrateFederatedSettlementPredecessorErgoSourceV1;
    readonly witnessErgoSource:
      SubstrateFederatedSettlementPredecessorErgoSourceV1;
  },
): Readonly<SubstrateFederatedSettlementPredecessorSourceSetV1> {
  assertExactKeys(input, [
    'primaryErgoSource',
    'witnessErgoSource',
  ], 'federated settlement predecessor source set');
  if (input.primaryErgoSource === input.witnessErgoSource) {
    throw new Error(
      'federated settlement predecessor observation requires distinct source objects',
    );
  }
  const primaryOrigin = normalizeRootReadOnlyNodeEndpoint(
    input.primaryErgoSource.observationSourceId,
    'primary federated settlement predecessor source',
  );
  const witnessOrigin = normalizeRootReadOnlyNodeEndpoint(
    input.witnessErgoSource.observationSourceId,
    'witness federated settlement predecessor source',
  );
  if (primaryOrigin === witnessOrigin) {
    throw new Error(
      'federated settlement predecessor observation requires distinct origins',
    );
  }
  const sources = Object.freeze([
    bindSource(primaryOrigin, input.primaryErgoSource),
    bindSource(witnessOrigin, input.witnessErgoSource),
  ] as const);
  const sourceIdsHex = Object.freeze(
    sources.map(source => source.sourceIdHex).sort(),
  ) as readonly [string, string];
  const sourceSet = Object.freeze({ ergoSourceIdsHex: sourceIdsHex });
  SOURCE_SET_BINDINGS.set(sourceSet, Object.freeze({ sources, sourceIdsHex }));
  return sourceSet;
}

export async function collectSubstrateFederatedSettlementPredecessorProducerV1(
  input: SubstrateFederatedSettlementPredecessorProducerV1Input,
): Promise<Readonly<SubstrateFederatedSettlementPredecessorProducerV1Result>> {
  assertExactKeys(input, [
    'sources',
    'familyIdentity',
    'settlementPacket',
  ], 'federated settlement predecessor producer input');
  const sources = sourceSetBinding(input.sources);
  const normalized = await normalizeProducerInput(input);
  const [primary, witness] = await Promise.all([
    collectSourceState(sources.sources[0], normalized),
    collectSourceState(sources.sources[1], normalized),
  ]);
  if (primary.stateObservationDigestHex !== witness.stateObservationDigestHex) {
    throw new Error(
      'federated settlement predecessor sources disagree on current state',
    );
  }
  const sourceAgreementDigestHex = sha256CanonicalJson({
    stateObservationDigestHex: primary.stateObservationDigestHex,
    sourceIdsHex: sources.sourceIdsHex,
  }, AGREEMENT_DOMAIN);
  const result = deepFreeze({
    schema: SUBSTRATE_FEDERATED_SETTLEMENT_PREDECESSOR_PRODUCER_V1_SCHEMA,
    version: 1 as const,
    status: 'settlement_predecessors_observed_non_authorizing' as const,
    familyIdHex: normalized.familyIdentity.profile.familyIdHex,
    settlementTransactionIdHex: normalized.settlementPacket.transaction.txId,
    settlementPacketBindingDigestHex:
      normalized.settlementPacketBindingDigestHex,
    predecessorState: {
      reserve: primary.reserve,
      duplicatePrevention: primary.duplicatePrevention,
      feeFunding: primary.feeFunding,
      observedErgoTipIdHex: primary.snapshot.bestHeader.idHex,
      observedErgoTipHeight: primary.snapshot.fullHeight,
      stateObservationDigestHex: primary.stateObservationDigestHex,
      sourceIdsHex: sources.sourceIdsHex,
      sourceAgreementDigestHex,
    },
    boundary: falseAuthorityBoundary(),
  });
  PRODUCER_RESULTS.add(result);
  PRODUCER_RECOLLECTION_INPUTS.set(result, Object.freeze({
    sources: input.sources,
    familyIdentity: input.familyIdentity,
    settlementPacket: input.settlementPacket,
  }));
  return result;
}

export function assertSubstrateFederatedSettlementPredecessorProducerV1Provenance(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedSettlementPredecessorProducerV1Result> {
  if (
    value === null
    || typeof value !== 'object'
    || !PRODUCER_RESULTS.has(value)
  ) {
    throw new Error(
      'federated settlement predecessor producer provenance is missing',
    );
  }
}

export function consumeSubstrateFederatedSettlementPredecessorProducerV1(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedSettlementPredecessorProducerV1Result> {
  assertSubstrateFederatedSettlementPredecessorProducerV1Provenance(value);
  if (CONSUMED_PRODUCER_RESULTS.has(value)) {
    throw new Error(
      'federated settlement predecessor producer result was already consumed',
    );
  }
  CONSUMED_PRODUCER_RESULTS.add(value);
}

/**
 * Recollects the same packet through the same process-owned source set.
 *
 * The returned result is a new one-shot observation. This is intentionally
 * separate from consuming the earlier result so a scheduler can reobserve the
 * exact inputs after asynchronous reconciliation and immediately before it
 * records its non-authorizing decision.
 */
export function recollectSubstrateFederatedSettlementPredecessorProducerV1(
  value: unknown,
): Promise<Readonly<SubstrateFederatedSettlementPredecessorProducerV1Result>> {
  assertSubstrateFederatedSettlementPredecessorProducerV1Provenance(value);
  const input = PRODUCER_RECOLLECTION_INPUTS.get(value);
  if (input === undefined) {
    throw new Error(
      'federated settlement predecessor recollection provenance is missing',
    );
  }
  return collectSubstrateFederatedSettlementPredecessorProducerV1(input);
}

export function getSubstrateFederatedSettlementPredecessorPacketBindingV1(
  packet: Readonly<SubstrateFederatedBurnSettlementV1Packet>,
): string {
  assertSubstrateFederatedBurnSettlementV1Packet(packet);
  return sha256CanonicalJson({
    familyIdHex: packet.familyIdHex,
    settlementTransactionIdHex: packet.transaction.txId,
    reserveBoxIdentityDigestHex:
      canonicalBoxIdentityDigest(packet.boxes.reservePredecessor),
    duplicatePreventionBoxIdentityDigestHex:
      canonicalBoxIdentityDigest(
        packet.boxes.duplicatePreventionPredecessor,
      ),
    feeFundingBoxIdentityDigestHex:
      canonicalBoxIdentityDigest(packet.boxes.feeFundingInput),
  }, PACKET_BINDING_DOMAIN);
}

async function normalizeProducerInput(
  input: SubstrateFederatedSettlementPredecessorProducerV1Input,
): Promise<NormalizedInput> {
  assertSubstrateFederatedSettlementFamilyV1Identity(input.familyIdentity);
  assertSubstrateFederatedBurnSettlementV1Packet(input.settlementPacket);
  const familyProfile = decodeSubstrateFederatedSettlementFamilyV1Profile(
    input.familyIdentity.profile,
  );
  if (input.settlementPacket.familyIdHex !== input.familyIdentity.profile.familyIdHex) {
    throw new Error(
      'federated settlement predecessor packet differs from the family identity',
    );
  }
  const [reserve, duplicatePrevention, feeFunding] = await Promise.all([
    normalizeEip12Box(
      input.settlementPacket.boxes.reservePredecessor,
      'federated settlement packet reserve predecessor',
    ),
    normalizeEip12Box(
      input.settlementPacket.boxes.duplicatePreventionPredecessor,
      'federated settlement packet duplicate-prevention predecessor',
    ),
    normalizeEip12Box(
      input.settlementPacket.boxes.feeFundingInput,
      'federated settlement packet fee input',
    ),
  ]);
  assertDistinctBoxIds([reserve, duplicatePrevention, feeFunding]);
  assertReserveBox(reserve, input.familyIdentity, familyProfile);
  assertDuplicatePreventionBox(
    duplicatePrevention,
    input.familyIdentity,
    familyProfile,
  );
  assertFeeFundingBox(feeFunding, familyProfile);
  assertPacketInputTopology(input.settlementPacket, {
    reserve,
    duplicatePrevention,
    feeFunding,
  });
  return Object.freeze({
    familyIdentity: input.familyIdentity,
    familyProfile,
    settlementPacket: input.settlementPacket,
    settlementPacketBindingDigestHex:
      getSubstrateFederatedSettlementPredecessorPacketBindingV1(
        input.settlementPacket,
      ),
    reserve: deepFreeze(reserve),
    duplicatePrevention: deepFreeze(duplicatePrevention),
    feeFunding: deepFreeze(feeFunding),
  });
}

async function collectSourceState(
  source: BoundSource,
  input: NormalizedInput,
) {
  const before = await captureSnapshot(source.source, 'initial');
  const [reserve, duplicatePrevention, feeFunding] = await Promise.all([
    observeSingleton(
      source.source,
      input.familyProfile.pooledReserveNftIdHex,
      input.reserve,
      before,
      'reserve',
      box => assertReserveBox(
        box,
        input.familyIdentity,
        input.familyProfile,
      ),
    ),
    observeSingleton(
      source.source,
      input.familyProfile.duplicatePreventionNftIdHex,
      input.duplicatePrevention,
      before,
      'duplicate-prevention',
      box => assertDuplicatePreventionBox(
        box,
        input.familyIdentity,
        input.familyProfile,
      ),
    ),
    observeFeeFunding(
      source.source,
      input.feeFunding,
      before,
      input.familyProfile,
    ),
  ]);
  assertDistinctBoxIds([
    reserve.box,
    duplicatePrevention.box,
    feeFunding.box,
  ]);
  const after = await captureSnapshot(source.source, 'final');
  if (snapshotIdentity(before) !== snapshotIdentity(after)) {
    throw new Error(
      'federated settlement predecessor Ergo view changed during collection',
    );
  }
  const state = {
    reserve: observedSingletonBinding(reserve),
    duplicatePrevention: observedSingletonBinding(duplicatePrevention),
    feeFunding: observedFeeBinding(feeFunding),
    observedErgoTipIdHex: before.bestHeader.idHex,
    observedErgoTipHeight: before.fullHeight,
    settlementPacketBindingDigestHex:
      input.settlementPacketBindingDigestHex,
  };
  return deepFreeze({
    reserve,
    duplicatePrevention,
    feeFunding,
    snapshot: before,
    stateObservationDigestHex: sha256CanonicalJson(state, STATE_DOMAIN),
  });
}

async function observeSingleton(
  source: SubstrateFederatedSettlementPredecessorErgoSourceV1,
  nftIdHex: string,
  expected: Readonly<Eip12Box>,
  snapshot: ErgoSnapshot,
  role: 'reserve' | 'duplicate-prevention',
  assertRole: (box: Readonly<Eip12Box>) => void,
): Promise<Readonly<ObservedSingletonStateV1>> {
  const rawBoxes = await source.getIndexedBoxesByTokenId(nftIdHex);
  if (
    !Array.isArray(rawBoxes)
    || rawBoxes.length === 0
    || rawBoxes.length > MAX_SINGLETON_LINEAGE_BOXES
  ) {
    throw new Error(
      `federated ${role} index must contain between 1 and ${MAX_SINGLETON_LINEAGE_BOXES} boxes`,
    );
  }
  const ids = rawBoxes.map((value, index) => fixedHex(
    objectValue(value, `indexed federated ${role} box ${index}`).boxId,
    32,
    `indexed federated ${role} box ${index} ID`,
  ));
  if (new Set(ids).size !== ids.length) {
    throw new Error(`federated ${role} index contains duplicate boxes`);
  }
  const unspent = rawBoxes.filter(value => {
    const raw = objectValue(value, `indexed federated ${role} box`);
    return raw.spentTransactionId === null
      || raw.spentTransactionId === undefined;
  });
  if (unspent.length !== 1) {
    throw new Error(
      `federated ${role} index must contain one unspent singleton, got ${unspent.length}`,
    );
  }
  const indexedRaw = objectValue(unspent[0], `indexed federated ${role} tip`);
  if (indexedRaw.spendingProof !== null && indexedRaw.spendingProof !== undefined) {
    throw new Error(`unspent federated ${role} tip has a spending proof`);
  }
  const inclusionHeight = nonnegativeSafeInteger(
    indexedRaw.inclusionHeight,
    `federated ${role} inclusion height`,
  );
  const box = deepFreeze(await normalizeEip12Box(
    indexedRaw,
    `indexed federated ${role} tip`,
  ));
  assertRole(box);
  if (
    inclusionHeight > snapshot.fullHeight
    || box.creationHeight > snapshot.fullHeight
  ) {
    throw new Error(`federated ${role} singleton is ahead of the observed tip`);
  }
  const canonicalRaw = await source.getBoxByIdOrNull(box.boxId);
  if (canonicalRaw === null) {
    throw new Error(`federated ${role} singleton is absent from the UTXO set`);
  }
  const canonical = await normalizeEip12Box(
    canonicalRaw,
    `canonical federated ${role} tip`,
  );
  if (canonicalBoxIdentityDigest(canonical) !== canonicalBoxIdentityDigest(box)) {
    throw new Error(`canonical federated ${role} singleton differs from the index`);
  }
  if (canonicalBoxIdentityDigest(box) !== canonicalBoxIdentityDigest(expected)) {
    throw new Error(`federated ${role} singleton differs from the settlement packet`);
  }
  return deepFreeze({
    box,
    boxIdHex: box.boxId,
    boxIdentityDigestHex: canonicalBoxIdentityDigest(box),
    inclusionHeight,
    indexedLineageBoxCount: rawBoxes.length,
  });
}

async function observeFeeFunding(
  source: SubstrateFederatedSettlementPredecessorErgoSourceV1,
  expected: Readonly<Eip12Box>,
  snapshot: ErgoSnapshot,
  profile: Readonly<SubstrateFederatedSettlementFamilyV1DecodedProfile>,
): Promise<Readonly<ObservedFeeStateV1>> {
  const raw = await source.getBoxByIdOrNull(expected.boxId);
  if (raw === null) {
    throw new Error(
      'federated external-fee input is absent from the canonical UTXO set',
    );
  }
  const box = deepFreeze(await normalizeEip12Box(
    raw,
    'canonical federated external-fee input',
  ));
  assertFeeFundingBox(box, profile);
  if (box.creationHeight > snapshot.fullHeight) {
    throw new Error(
      'federated external-fee input is ahead of the observed tip',
    );
  }
  if (canonicalBoxIdentityDigest(box) !== canonicalBoxIdentityDigest(expected)) {
    throw new Error(
      'federated external-fee input differs from the settlement packet',
    );
  }
  return deepFreeze({
    box,
    boxIdHex: box.boxId,
    boxIdentityDigestHex: canonicalBoxIdentityDigest(box),
  });
}

function assertReserveBox(
  box: Readonly<Eip12Box>,
  family: Readonly<SubstrateFederatedSettlementFamilyV1Identity>,
  profile: Readonly<SubstrateFederatedSettlementFamilyV1DecodedProfile>,
): void {
  if (
    box.ergoTree !== family.contracts.pooledReserve.receipt.propositionHex
    || box.assets.length !== 1
    || box.assets[0].tokenId !== profile.pooledReserveNftIdHex
    || box.assets[0].amount !== '1'
    || Object.keys(box.additionalRegisters).sort().join(',') !== 'R4,R5,R6'
    || decodeCollByteRegister(box.additionalRegisters.R4, 'federated reserve R4')
      !== family.profile.familyIdHex
  ) {
    throw new Error('federated reserve singleton identity is invalid');
  }
  const digest = decodeAvlTreeRegisterDigest(
    box.additionalRegisters.R5,
    'federated reserve R5',
  );
  const liability = decodeCanonicalLongRegister(
    box.additionalRegisters.R6,
    'federated reserve R6',
  );
  if (
    box.additionalRegisters.R5 !== encodeAvlTreeRegister(
      Buffer.from(digest, 'hex'),
      AVLTREE_INSERT_ONLY,
      RESERVE_VALUE_BYTES,
    )
    || liability < 0n
    || liability > BigInt(box.value)
  ) {
    throw new Error('federated reserve singleton registers are invalid');
  }
}

function assertDuplicatePreventionBox(
  box: Readonly<Eip12Box>,
  family: Readonly<SubstrateFederatedSettlementFamilyV1Identity>,
  profile: Readonly<SubstrateFederatedSettlementFamilyV1DecodedProfile>,
): void {
  if (
    box.ergoTree
      !== family.contracts.duplicatePrevention.receipt.propositionHex
    || box.assets.length !== 1
    || box.assets[0].tokenId !== profile.duplicatePreventionNftIdHex
    || box.assets[0].amount !== '1'
    || Object.keys(box.additionalRegisters).sort().join(',') !== 'R4,R5'
    || decodeCollByteRegister(box.additionalRegisters.R4, 'federated DUP R4')
      !== family.profile.familyIdHex
  ) {
    throw new Error(
      'federated duplicate-prevention singleton identity is invalid',
    );
  }
  const digest = decodeAvlTreeRegisterDigest(
    box.additionalRegisters.R5,
    'federated DUP R5',
  );
  if (box.additionalRegisters.R5 !== encodeAvlTreeRegister(
    Buffer.from(digest, 'hex'),
    AVLTREE_INSERT_ONLY,
    DUP_VALUE_BYTES,
  )) {
    throw new Error(
      'federated duplicate-prevention singleton registers are invalid',
    );
  }
}

function assertFeeFundingBox(
  box: Readonly<Eip12Box>,
  profile: Readonly<SubstrateFederatedSettlementFamilyV1DecodedProfile>,
): void {
  const value = BigInt(box.value);
  if (
    box.assets.length !== 0
    || Object.keys(box.additionalRegisters).length !== 0
    || value < BigInt(profile.minimumExternalFeeNanoErg)
    || value > BigInt(profile.maximumExternalFeeNanoErg)
  ) {
    throw new Error('federated external-fee input is not exact pure ERG');
  }
}

function assertPacketInputTopology(
  packet: Readonly<SubstrateFederatedBurnSettlementV1Packet>,
  boxes: {
    readonly reserve: Readonly<Eip12Box>;
    readonly duplicatePrevention: Readonly<Eip12Box>;
    readonly feeFunding: Readonly<Eip12Box>;
  },
): void {
  const inputs = packet.transaction.eip12Tx.inputs;
  if (
    inputs.length !== 3
    || inputs[0].boxId !== boxes.reserve.boxId
    || inputs[1].boxId !== boxes.duplicatePrevention.boxId
    || inputs[2].boxId !== boxes.feeFunding.boxId
    || packet.transaction.txId.length !== 64
  ) {
    throw new Error(
      'federated settlement predecessor packet input topology drifted',
    );
  }
}

async function captureSnapshot(
  source: SubstrateFederatedSettlementPredecessorErgoSourceV1,
  label: string,
): Promise<ErgoSnapshot> {
  const progress = objectValue(
    await source.getIndexedHeight(),
    `${label} federated predecessor index progress`,
  );
  const indexedHeight = nonnegativeSafeInteger(
    progress.indexedHeight,
    `${label} federated predecessor indexed height`,
  );
  const fullHeight = nonnegativeSafeInteger(
    progress.fullHeight,
    `${label} federated predecessor full height`,
  );
  if (indexedHeight !== fullHeight) {
    throw new Error(
      'federated settlement predecessor index is not synchronized',
    );
  }
  const bestHeader = normalizeHeader(
    await source.getBestHeader(),
    `${label} federated predecessor best header`,
  );
  if (bestHeader.height !== fullHeight) {
    throw new Error(
      'federated settlement predecessor best header does not identify full height',
    );
  }
  return Object.freeze({ indexedHeight, fullHeight, bestHeader });
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

function bindSource(
  canonicalOrigin: string,
  source: SubstrateFederatedSettlementPredecessorErgoSourceV1,
): BoundSource {
  return Object.freeze({
    sourceIdHex: sha256CanonicalJson({
      schema: 'e2s.substrate-federated-settlement-predecessor-source.v1',
      canonicalOrigin,
    }, SOURCE_ID_DOMAIN),
    canonicalOrigin,
    source,
  });
}

function sourceSetBinding(value: unknown): SourceSetBinding {
  if (value === null || typeof value !== 'object') {
    throw new Error(
      'federated settlement predecessor source-set provenance is missing',
    );
  }
  const binding = SOURCE_SET_BINDINGS.get(value);
  if (binding === undefined) {
    throw new Error(
      'federated settlement predecessor source-set provenance is missing',
    );
  }
  return binding;
}

function observedSingletonBinding(value: ObservedSingletonStateV1) {
  return {
    boxIdHex: value.boxIdHex,
    boxIdentityDigestHex: value.boxIdentityDigestHex,
    inclusionHeight: value.inclusionHeight,
    indexedLineageBoxCount: value.indexedLineageBoxCount,
  };
}

function observedFeeBinding(value: ObservedFeeStateV1) {
  return {
    boxIdHex: value.boxIdHex,
    boxIdentityDigestHex: value.boxIdentityDigestHex,
  };
}

function snapshotIdentity(value: ErgoSnapshot): string {
  return sha256CanonicalJson(value, SNAPSHOT_DOMAIN);
}

function canonicalBoxIdentityDigest(value: Readonly<Eip12Box>): string {
  return sha256CanonicalJson({
    boxId: value.boxId,
    value: value.value,
    ergoTree: value.ergoTree,
    assets: value.assets,
    additionalRegisters: value.additionalRegisters,
    creationHeight: value.creationHeight,
    transactionId: value.transactionId,
    index: value.index,
  }, BOX_IDENTITY_DOMAIN);
}

function assertDistinctBoxIds(boxes: readonly Readonly<Eip12Box>[]): void {
  if (new Set(boxes.map(box => box.boxId)).size !== boxes.length) {
    throw new Error('federated settlement predecessor boxes must be distinct');
  }
}

function falseAuthorityBoundary():
SubstrateFederatedSettlementPredecessorProducerV1Result['boundary'] {
  return Object.freeze({
    readShapedSourcePortUsed: true as const,
    exactReserveSingletonObserved: true as const,
    exactDuplicatePreventionSingletonObserved: true as const,
    exactExternalFeeUtxoObserved: true as const,
    exactSettlementPacketBound: true as const,
    stableIndexedTipObservedByBothSources: true as const,
    matchingDistinctErgoSourceObservations: true as const,
    producerPersistencePortUsed: false as const,
    sourceImplementationSideEffectsVerifiedAbsent: false as const,
    localObservationAuthoritative: false as const,
    ergoConsensusCryptographicallyVerified: false as const,
    predecessorFundsAuthorityEstablished: false as const,
    trackerAdmissionAuthorized: false as const,
    payoutAuthorized: false as const,
    checkPassed: false as const,
    signingAuthorized: false as const,
    submissionAuthorized: false as const,
    broadcastAuthorized: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  });
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be canonical hex`);
  }
  const normalized = value.replace(/^0x/i, '').toLowerCase();
  if (
    normalized.length !== bytes * 2
    || !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new Error(`${label} must be ${bytes}-byte canonical hex`);
  }
  return normalized;
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
