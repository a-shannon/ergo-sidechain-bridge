/**
 * Rebuild the authenticated tracker cache from the canonical Ergo singleton
 * lineage. The result is process-local provenance: persistence may consume it,
 * but neither the node response nor SQLite becomes a funds authority.
 */

import { createHash } from 'crypto';

import { decodeAggregateFinalityCommitmentV1 } from './bridge-finality-commitment.js';
import {
  decodeBoundedCollByteRegister,
  decodeCanonicalDlogSigmaPropRegister,
  decodeCanonicalIntRegister,
  decodeCanonicalLongRegister,
  decodeCollByteRegister,
} from './ergo-encoding.js';
import {
  AUTHENTICATED_SPV_TRACKER_MAX_PROOF_BUNDLE_BYTES,
  decodeAuthenticatedSpvProofBundle,
  decodeAuthenticatedSpvTrackerValue,
  encodeAuthenticatedSpvTrackerAvlRegister,
  getAuthenticatedSpvTrackerDigest,
  replayAuthenticatedSpvAdmission,
} from './spv-tracker-authenticated.js';

export interface AuthenticatedSpvTrackerChainSource {
  beginAuthenticatedTrackerReconstruction?(): void;
  endAuthenticatedTrackerReconstruction?(): void;
  getIndexedHeight(): Promise<unknown>;
  getBestHeader(): Promise<unknown>;
  getIndexedBoxesByTokenId(tokenId: string): Promise<unknown[]>;
  getTransaction(txId: string): Promise<unknown | null>;
  getBlockHeaderById(headerId: string): Promise<unknown | null>;
  getBoxByIdOrNull(boxId: string): Promise<unknown | null>;
}

export interface ReconstructedAuthenticatedSpvTrackerEntry {
  readonly keyHex: string;
  readonly valueHex: string;
  readonly encodedCheckpointHex: string;
  readonly sidechainId: string;
  readonly sidechainHeight: bigint;
  readonly executionBlockHash: string;
  readonly bridgeEventRoot: string;
  readonly checkpointCommitment: string;
  readonly anchorHeaderId: string;
  readonly anchorHeaderHeight: number;
}

export interface AuthenticatedSpvTrackerObservation {
  readonly sidechainIdHex: string;
  readonly trackerNftIdHex: string;
  readonly genesisBoxId: string;
  readonly finalityAttestorSigmaPropRegisterHex: string;
  readonly tipBoxId: string;
  readonly tipDigestHex: string;
  readonly observationDigestHex: string;
  readonly entries: readonly ReconstructedAuthenticatedSpvTrackerEntry[];
  readonly observedTip: Readonly<{
    idHex: string;
    parentIdHex: string;
    height: number;
    extensionRootHex: string;
  }>;
}

export interface AuthenticatedSpvTrackerReconstruction
  extends AuthenticatedSpvTrackerObservation {
  readonly independentObservationAgreement: true;
}

export interface AuthenticatedSpvTrackerTipCurrentObservation {
  readonly current: boolean;
  readonly observedErgoHeight: number | null;
}

export interface ReconstructAuthenticatedSpvTrackerHistoryInput {
  source: AuthenticatedSpvTrackerChainSource;
  trackerNftIdHex: string;
  trackerErgoTreeHex: string;
  expectedSidechainIdHex: string;
  expectedGenesisBoxIdHex?: string;
}

export interface ReconstructAuthenticatedSpvTrackerHistoryFromIndependentSourcesInput {
  primarySource: AuthenticatedSpvTrackerChainSource;
  witnessSource: AuthenticatedSpvTrackerChainSource;
  trackerNftIdHex: string;
  trackerErgoTreeHex: string;
  expectedSidechainIdHex: string;
  expectedGenesisBoxIdHex: string;
}

interface NormalizedHeader {
  idHex: string;
  parentIdHex: string;
  height: number;
  extensionRootHex: string;
}

interface SyncedIndexSnapshot {
  bestHeader: NormalizedHeader;
  indexedHeight: number;
  fullHeight: number;
}

interface NormalizedTrackerBox {
  raw: Record<string, any>;
  boxId: string;
  transactionId: string;
  inclusionHeight: number;
  ergoTreeHex: string;
  registers: Record<'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9', string>;
  spentTransactionId: string | null;
  spendingContext: Record<string, string> | null;
}

interface TransitionObservation {
  spendingTransactionId: string;
  spendingBlockId: string;
  spendingInclusionHeight: number;
  anchorHeaderId: string;
  anchorHeaderHeight: number;
}

export const AUTHENTICATED_SPV_TRACKER_MAX_LINEAGE_BOXES = 16_385;

const independentlyValidatedReconstructions = new WeakSet<object>();

export function assertAuthenticatedSpvTrackerReconstructionProvenance(
  value: AuthenticatedSpvTrackerReconstruction,
): void {
  if (
    !value
    || typeof value !== 'object'
    || value.independentObservationAgreement !== true
    || !independentlyValidatedReconstructions.has(value)
  ) {
    throw new Error('independent authenticated SPV tracker reconstruction provenance is missing');
  }
}

export async function reconstructAuthenticatedSpvTrackerHistory(
  input: ReconstructAuthenticatedSpvTrackerHistoryInput,
): Promise<AuthenticatedSpvTrackerObservation> {
  const beginBoundedObservation = input.source.beginAuthenticatedTrackerReconstruction;
  const endBoundedObservation = input.source.endAuthenticatedTrackerReconstruction;
  if (Boolean(beginBoundedObservation) !== Boolean(endBoundedObservation)) {
    throw new Error('authenticated tracker reconstruction source budget hooks must be paired');
  }
  let boundedObservationStarted = false;
  try {
    if (beginBoundedObservation) {
      beginBoundedObservation.call(input.source);
      boundedObservationStarted = true;
    }
    return await reconstructAuthenticatedSpvTrackerHistoryWithinBudget(input);
  } finally {
    if (boundedObservationStarted) endBoundedObservation!.call(input.source);
  }
}

async function reconstructAuthenticatedSpvTrackerHistoryWithinBudget(
  input: ReconstructAuthenticatedSpvTrackerHistoryInput,
): Promise<AuthenticatedSpvTrackerObservation> {
  const trackerNftIdHex = fixedHex(input.trackerNftIdHex, 32, 'tracker NFT id');
  const trackerErgoTreeHex = variableHex(input.trackerErgoTreeHex, 'tracker ErgoTree');
  const expectedSidechainIdHex = fixedHex(
    input.expectedSidechainIdHex,
    32,
    'expected sidechain id',
  );
  const expectedGenesisBoxIdHex = input.expectedGenesisBoxIdHex === undefined
    ? null
    : fixedHex(input.expectedGenesisBoxIdHex, 32, 'expected tracker genesis box id');
  const snapshotBefore = await captureSyncedIndexSnapshot(input.source, 'initial');
  const rawBoxes = await input.source.getIndexedBoxesByTokenId(trackerNftIdHex);
  if (!Array.isArray(rawBoxes) || rawBoxes.length === 0) {
    throw new Error('authenticated tracker singleton lineage is empty');
  }
  if (rawBoxes.length > AUTHENTICATED_SPV_TRACKER_MAX_LINEAGE_BOXES) {
    throw new Error(
      `authenticated tracker singleton lineage exceeds the ${AUTHENTICATED_SPV_TRACKER_MAX_LINEAGE_BOXES}-box operational bound`,
    );
  }
  const boxes = rawBoxes.map((box, index) => normalizeTrackerBox(
    box,
    index,
    trackerNftIdHex,
    trackerErgoTreeHex,
  ));
  const lineage = orderSingletonLineage(boxes);
  const genesis = lineage[0];
  if (expectedGenesisBoxIdHex !== null && genesis.boxId !== expectedGenesisBoxIdHex) {
    throw new Error('authenticated tracker lineage does not start at the expected genesis box');
  }
  if (decodeCanonicalLongRegister(genesis.registers.R4, 'tracker genesis R4') !== 0n) {
    throw new Error('authenticated tracker genesis counter must be zero');
  }
  const emptyDigestHex = getAuthenticatedSpvTrackerDigest([]);
  if (genesis.registers.R5 !== encodeAuthenticatedSpvTrackerAvlRegister(emptyDigestHex)) {
    throw new Error('authenticated tracker genesis AVL digest must be empty');
  }
  if (decodeCollByteRegister(genesis.registers.R6, 'tracker genesis R6') !== expectedSidechainIdHex) {
    throw new Error('authenticated tracker genesis sidechain id does not match the configured sidechain');
  }
  if (decodeCanonicalLongRegister(genesis.registers.R7, 'tracker genesis R7') !== 0n) {
    throw new Error('authenticated tracker genesis sidechain height must be zero');
  }
  decodeCanonicalIntRegister(genesis.registers.R8, 'tracker genesis R8');
  decodeCanonicalDlogSigmaPropRegister(genesis.registers.R9, 'tracker genesis R9');
  const entries: ReconstructedAuthenticatedSpvTrackerEntry[] = [];
  const transitionObservations: TransitionObservation[] = [];
  let runningDigestHex = emptyDigestHex;

  for (let index = 0; index < lineage.length - 1; index++) {
    const current = lineage[index];
    const successor = lineage[index + 1];
    if (!current.spentTransactionId || !current.spendingContext) {
      throw new Error(`tracker lineage box ${current.boxId} is missing its spending proof`);
    }
    if (current.spentTransactionId !== successor.transactionId) {
      throw new Error(`tracker lineage successor transaction mismatch after ${current.boxId}`);
    }

    const transaction = normalizeIndexedTransaction(
      await input.source.getTransaction(current.spentTransactionId),
      current.spentTransactionId,
    );
    if (transaction.inclusionHeight !== successor.inclusionHeight) {
      throw new Error('tracker successor inclusion height does not match its spending transaction');
    }
    assertSingleTransactionBox(transaction.inputs, current.boxId, 'input');
    assertSingleTransactionBox(transaction.outputs, successor.boxId, 'output');
    const txInput = transaction.inputs.find(box => normalizedBoxId(box) === current.boxId)!;
    const txContext = normalizeContextExtension(
      txInput?.spendingProof?.extension,
      'indexed transaction tracker input context extension',
    );
    assertContextEqual(current.spendingContext, txContext, 'indexed input proof');

    const finalityCommitmentHex = decodeCollByteRegister(
      current.spendingContext['0'],
      'tracker Var(0)',
    );
    const trackerValueHex = decodeCollByteRegister(
      current.spendingContext['1'],
      'tracker Var(1)',
    );
    const proofBundleHex = decodeBoundedCollByteRegister(
      current.spendingContext['2'],
      'tracker Var(2)',
      AUTHENTICATED_SPV_TRACKER_MAX_PROOF_BUNDLE_BYTES,
    );
    const headerIndex = decodeCanonicalIntRegister(
      current.spendingContext['3'],
      'tracker Var(3)',
    );
    if (headerIndex < 0 || headerIndex > 9) {
      throw new Error('tracker anchor header index must be between 0 and 9');
    }
    const proofBundle = decodeAuthenticatedSpvProofBundle(proofBundleHex);
    const finalityCommitment = decodeAggregateFinalityCommitmentV1(finalityCommitmentHex);
    const checkpoint = finalityCommitment.statement.checkpoint;
    if (checkpoint.sidechainIdHex !== expectedSidechainIdHex) {
      throw new Error('tracker checkpoint sidechain id does not match the configured sidechain');
    }

    const anchorHeader = await resolveAnchorHeader(
      input.source,
      transaction.blockId,
      transaction.inclusionHeight,
      headerIndex,
    );
    const plan = replayAuthenticatedSpvAdmission({
      encodedCheckpointHex: finalityCommitment.statement.encodedCheckpointHex,
      aggregateFinalityCommitmentHex: finalityCommitment.encodedCommitmentHex,
      extensionProofHex: proofBundle.extensionProofHex,
      currentDigestHex: runningDigestHex,
      avlInsertProofHex: proofBundle.avlInsertProofHex,
      anchorHeader: {
        idHex: anchorHeader.idHex,
        height: anchorHeader.height,
        extensionRootHex: anchorHeader.extensionRootHex,
        contextIndex: headerIndex,
      },
      approvedSidechainIdHex: expectedSidechainIdHex,
      currentCounter: decodeCanonicalLongRegister(current.registers.R4, 'tracker input R4'),
      currentLatestSidechainHeight: decodeCanonicalLongRegister(
        current.registers.R7,
        'tracker input R7',
      ),
      currentStampHeight: decodeCanonicalIntRegister(current.registers.R8, 'tracker input R8'),
      currentErgoHeight: transaction.inclusionHeight,
      finalityAttestorSigmaPropRegisterHex: current.registers.R9,
    });

    assertRegisterSetEqual(current.registers, plan.inputRegisters, 'input');
    assertRegisterSetEqual(successor.registers, plan.successorRegisters, 'successor');
    assertContextEqual(
      current.spendingContext,
      plan.contextExtension,
      'admission plan',
    );
    if (trackerValueHex !== plan.trackerValueHex) {
      throw new Error('tracker admission value does not replay deterministically');
    }
    decodeAuthenticatedSpvTrackerValue(trackerValueHex);

    entries.push(Object.freeze({
      keyHex: plan.trackerKeyHex,
      valueHex: plan.trackerValueHex,
      encodedCheckpointHex: finalityCommitment.statement.encodedCheckpointHex,
      sidechainId: expectedSidechainIdHex,
      sidechainHeight: BigInt(checkpoint.sidechainHeight),
      executionBlockHash: checkpoint.executionBlockHashHex,
      bridgeEventRoot: checkpoint.bridgeEventRootHex,
      checkpointCommitment: finalityCommitment.statement.checkpointCommitmentHex,
      anchorHeaderId: anchorHeader.idHex,
      anchorHeaderHeight: anchorHeader.height,
    }));
    transitionObservations.push({
      spendingTransactionId: transaction.id,
      spendingBlockId: transaction.blockId,
      spendingInclusionHeight: transaction.inclusionHeight,
      anchorHeaderId: anchorHeader.idHex,
      anchorHeaderHeight: anchorHeader.height,
    });
    runningDigestHex = plan.successorDigestHex;
  }

  const tip = lineage[lineage.length - 1];
  const expectedDigestHex = runningDigestHex;
  if (tip.registers.R5 !== encodeAuthenticatedSpvTrackerAvlRegister(expectedDigestHex)) {
    throw new Error('tracker tip digest does not match the reconstructed history');
  }
  if (decodeCollByteRegister(tip.registers.R6, 'tracker tip R6') !== expectedSidechainIdHex) {
    throw new Error('tracker tip sidechain id does not match the configured sidechain');
  }
  decodeCanonicalLongRegister(tip.registers.R4, 'tracker tip R4');
  decodeCanonicalLongRegister(tip.registers.R7, 'tracker tip R7');
  decodeCanonicalIntRegister(tip.registers.R8, 'tracker tip R8');
  decodeCanonicalDlogSigmaPropRegister(tip.registers.R9, 'tracker tip R9');

  const canonicalTipRaw = await input.source.getBoxByIdOrNull(tip.boxId);
  if (canonicalTipRaw === null) {
    throw new Error('authenticated tracker tip is not present in the canonical UTXO set');
  }
  const canonicalTip = normalizeTrackerBox(
    canonicalTipRaw,
    0,
    trackerNftIdHex,
    trackerErgoTreeHex,
  );
  if (
    canonicalTip.boxId !== tip.boxId
    || canonicalTip.transactionId !== tip.transactionId
    || canonicalTip.inclusionHeight !== tip.inclusionHeight
    || canonicalTip.spentTransactionId !== null
  ) {
    throw new Error('canonical tracker tip identity does not match the indexed lineage tip');
  }
  assertRegisterSetEqual(canonicalTip.registers, tip.registers, 'canonical tip');

  const snapshotAfter = await captureSyncedIndexSnapshot(input.source, 'final');
  assertSameIndexSnapshot(snapshotBefore, snapshotAfter);
  if (snapshotBefore.fullHeight < tip.inclusionHeight) {
    throw new Error('authenticated tracker tip is newer than the observed Ergo tip');
  }

  const observationDigestHex = reconstructionObservationDigest({
    sidechainIdHex: expectedSidechainIdHex,
    trackerNftIdHex,
    lineage,
    entries,
    transitionObservations,
    snapshot: snapshotBefore,
  });
  const result: AuthenticatedSpvTrackerObservation = Object.freeze({
    sidechainIdHex: expectedSidechainIdHex,
    trackerNftIdHex,
    genesisBoxId: genesis.boxId,
    finalityAttestorSigmaPropRegisterHex: genesis.registers.R9,
    tipBoxId: tip.boxId,
    tipDigestHex: expectedDigestHex,
    observationDigestHex,
    entries: Object.freeze(entries),
    observedTip: Object.freeze({
      idHex: snapshotBefore.bestHeader.idHex,
      parentIdHex: snapshotBefore.bestHeader.parentIdHex,
      height: snapshotBefore.fullHeight,
      extensionRootHex: snapshotBefore.bestHeader.extensionRootHex,
    }),
  });
  return result;
}

export async function reconstructAuthenticatedSpvTrackerHistoryFromIndependentSources(
  input: ReconstructAuthenticatedSpvTrackerHistoryFromIndependentSourcesInput,
): Promise<AuthenticatedSpvTrackerReconstruction> {
  assertIndependentSources(input.primarySource, input.witnessSource);
  const reconstructionInput = {
    trackerNftIdHex: input.trackerNftIdHex,
    trackerErgoTreeHex: input.trackerErgoTreeHex,
    expectedSidechainIdHex: input.expectedSidechainIdHex,
    expectedGenesisBoxIdHex: input.expectedGenesisBoxIdHex,
  };
  const [primaryResult, witnessResult] = await Promise.allSettled([
    reconstructAuthenticatedSpvTrackerHistory({
      ...reconstructionInput,
      source: input.primarySource,
    }),
    reconstructAuthenticatedSpvTrackerHistory({
      ...reconstructionInput,
      source: input.witnessSource,
    }),
  ]);
  if (primaryResult.status === 'rejected') throw primaryResult.reason;
  if (witnessResult.status === 'rejected') throw witnessResult.reason;
  const primary = primaryResult.value;
  const witness = witnessResult.value;
  if (reconstructionIdentity(primary) !== reconstructionIdentity(witness)) {
    throw new Error('independent Ergo observations disagree on authenticated tracker reconstruction');
  }
  const reconstruction: AuthenticatedSpvTrackerReconstruction = Object.freeze({
    ...primary,
    independentObservationAgreement: true,
  });
  independentlyValidatedReconstructions.add(reconstruction);
  return reconstruction;
}

interface AuthenticatedSpvTrackerTipCurrentInput {
  source: AuthenticatedSpvTrackerChainSource;
  trackerNftIdHex: string;
  trackerErgoTreeHex: string;
  expectedSidechainIdHex: string;
  expectedTipBoxId: string;
  expectedTipDigestHex: string;
}

interface AuthenticatedSpvTrackerTipObservation {
  current: boolean;
  snapshot: SyncedIndexSnapshot | null;
  tipIdentityHex: string | null;
}

export async function isAuthenticatedSpvTrackerTipCurrent(
  input: AuthenticatedSpvTrackerTipCurrentInput,
): Promise<boolean> {
  return (await observeAuthenticatedSpvTrackerTip(input)).current;
}

async function observeAuthenticatedSpvTrackerTip(
  input: AuthenticatedSpvTrackerTipCurrentInput,
): Promise<AuthenticatedSpvTrackerTipObservation> {
  const trackerNftIdHex = fixedHex(input.trackerNftIdHex, 32, 'tracker NFT id');
  const trackerErgoTreeHex = variableHex(input.trackerErgoTreeHex, 'tracker ErgoTree');
  const expectedSidechainIdHex = fixedHex(
    input.expectedSidechainIdHex,
    32,
    'expected sidechain id',
  );
  const expectedTipBoxId = fixedHex(input.expectedTipBoxId, 32, 'expected tracker tip box id');
  const expectedTipDigestHex = fixedHex(
    input.expectedTipDigestHex,
    33,
    'expected tracker tip digest',
  );
  const snapshotBefore = await captureSyncedIndexSnapshot(input.source, 'tip recheck initial');
  const currentTipRaw = await input.source.getBoxByIdOrNull(expectedTipBoxId);
  if (currentTipRaw === null) {
    return { current: false, snapshot: null, tipIdentityHex: null };
  }
  const currentTip = normalizeTrackerBox(
    currentTipRaw,
    0,
    trackerNftIdHex,
    trackerErgoTreeHex,
  );
  if (currentTip.boxId !== expectedTipBoxId || currentTip.spentTransactionId !== null) {
    return { current: false, snapshot: null, tipIdentityHex: null };
  }
  if (currentTip.registers.R5 !== encodeAuthenticatedSpvTrackerAvlRegister(expectedTipDigestHex)) {
    throw new Error('canonical tracker tip digest changed without a new singleton box');
  }
  if (decodeCollByteRegister(currentTip.registers.R6, 'canonical tracker tip R6') !== expectedSidechainIdHex) {
    throw new Error('canonical tracker tip sidechain id changed without a new singleton box');
  }
  const snapshotAfter = await captureSyncedIndexSnapshot(input.source, 'tip recheck final');
  assertSameIndexSnapshot(snapshotBefore, snapshotAfter);
  return {
    current: true,
    snapshot: snapshotBefore,
    tipIdentityHex: trackerBoxObservationIdentity(currentTip),
  };
}

export async function observeAuthenticatedSpvTrackerTipCurrentOnIndependentSources(input: {
  primarySource: AuthenticatedSpvTrackerChainSource;
  witnessSource: AuthenticatedSpvTrackerChainSource;
  trackerNftIdHex: string;
  trackerErgoTreeHex: string;
  expectedSidechainIdHex: string;
  expectedTipBoxId: string;
  expectedTipDigestHex: string;
}): Promise<AuthenticatedSpvTrackerTipCurrentObservation> {
  assertIndependentSources(input.primarySource, input.witnessSource);
  const tipInput = {
    trackerNftIdHex: input.trackerNftIdHex,
    trackerErgoTreeHex: input.trackerErgoTreeHex,
    expectedSidechainIdHex: input.expectedSidechainIdHex,
    expectedTipBoxId: input.expectedTipBoxId,
    expectedTipDigestHex: input.expectedTipDigestHex,
  };
  const [primary, witness] = await Promise.all([
    observeAuthenticatedSpvTrackerTip({ ...tipInput, source: input.primarySource }),
    observeAuthenticatedSpvTrackerTip({ ...tipInput, source: input.witnessSource }),
  ]);
  if (!primary.current || !witness.current) {
    return Object.freeze({
      current: false,
      observedErgoHeight: null,
    });
  }
  if (
    !primary.snapshot
    || !witness.snapshot
    || !primary.tipIdentityHex
    || !witness.tipIdentityHex
  ) {
    throw new Error('current independent tracker observations must expose stable tip snapshots');
  }
  if (primary.tipIdentityHex !== witness.tipIdentityHex) {
    throw new Error('independent Ergo observations disagree on the current canonical tracker tip');
  }
  if (indexSnapshotIdentity(primary.snapshot) !== indexSnapshotIdentity(witness.snapshot)) {
    throw new Error('independent Ergo observations disagree on the current canonical snapshot');
  }
  return Object.freeze({
    current: true,
    observedErgoHeight: primary.snapshot.fullHeight,
  });
}

export async function isAuthenticatedSpvTrackerTipCurrentOnIndependentSources(
  input: Parameters<
    typeof observeAuthenticatedSpvTrackerTipCurrentOnIndependentSources
  >[0],
): Promise<boolean> {
  return (
    await observeAuthenticatedSpvTrackerTipCurrentOnIndependentSources(input)
  ).current;
}

function assertIndependentSources(
  primarySource: AuthenticatedSpvTrackerChainSource,
  witnessSource: AuthenticatedSpvTrackerChainSource,
): void {
  if (primarySource === witnessSource) {
    throw new Error('authenticated tracker reconstruction requires two independent source instances');
  }
}

function reconstructionIdentity(reconstruction: AuthenticatedSpvTrackerObservation): string {
  return JSON.stringify({
    sidechainIdHex: reconstruction.sidechainIdHex,
    trackerNftIdHex: reconstruction.trackerNftIdHex,
    genesisBoxId: reconstruction.genesisBoxId,
    finalityAttestorSigmaPropRegisterHex: reconstruction.finalityAttestorSigmaPropRegisterHex,
    tipBoxId: reconstruction.tipBoxId,
    tipDigestHex: reconstruction.tipDigestHex,
    observationDigestHex: reconstruction.observationDigestHex,
    observedTip: reconstruction.observedTip,
    entries: reconstruction.entries.map(entry => ({
      ...entry,
      sidechainHeight: entry.sidechainHeight.toString(),
    })),
  });
}

function reconstructionObservationDigest(input: {
  sidechainIdHex: string;
  trackerNftIdHex: string;
  lineage: readonly NormalizedTrackerBox[];
  entries: readonly ReconstructedAuthenticatedSpvTrackerEntry[];
  transitionObservations: readonly TransitionObservation[];
  snapshot: SyncedIndexSnapshot;
}): string {
  const canonical = JSON.stringify({
    schemaVersion: 1,
    sidechainIdHex: input.sidechainIdHex,
    trackerNftIdHex: input.trackerNftIdHex,
    lineage: input.lineage.map(box => ({
      boxId: box.boxId,
      transactionId: box.transactionId,
      inclusionHeight: box.inclusionHeight,
      ergoTreeHex: box.ergoTreeHex,
      registers: box.registers,
      spentTransactionId: box.spentTransactionId,
      spendingContext: box.spendingContext,
    })),
    entries: input.entries.map(entry => ({
      ...entry,
      sidechainHeight: entry.sidechainHeight.toString(),
    })),
    transitions: input.transitionObservations,
    snapshot: {
      bestHeaderId: input.snapshot.bestHeader.idHex,
      bestHeaderParentId: input.snapshot.bestHeader.parentIdHex,
      bestHeaderHeight: input.snapshot.bestHeader.height,
      bestHeaderExtensionRoot: input.snapshot.bestHeader.extensionRootHex,
      indexedHeight: input.snapshot.indexedHeight,
      fullHeight: input.snapshot.fullHeight,
    },
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function indexSnapshotIdentity(snapshot: SyncedIndexSnapshot): string {
  return JSON.stringify({
    bestHeaderId: snapshot.bestHeader.idHex,
    bestHeaderParentId: snapshot.bestHeader.parentIdHex,
    bestHeaderHeight: snapshot.bestHeader.height,
    bestHeaderExtensionRoot: snapshot.bestHeader.extensionRootHex,
    indexedHeight: snapshot.indexedHeight,
    fullHeight: snapshot.fullHeight,
  });
}

function trackerBoxObservationIdentity(box: NormalizedTrackerBox): string {
  const canonical = JSON.stringify({
    boxId: box.boxId,
    transactionId: box.transactionId,
    inclusionHeight: box.inclusionHeight,
    ergoTreeHex: box.ergoTreeHex,
    registers: box.registers,
    spentTransactionId: box.spentTransactionId,
    spendingContext: box.spendingContext,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

async function captureSyncedIndexSnapshot(
  source: AuthenticatedSpvTrackerChainSource,
  label: string,
): Promise<SyncedIndexSnapshot> {
  const progress = objectValue(await source.getIndexedHeight(), `${label} index progress`);
  const indexedHeight = nonnegativeInt(progress.indexedHeight, `${label} indexed height`);
  const fullHeight = nonnegativeInt(progress.fullHeight, `${label} full height`);
  if (indexedHeight !== fullHeight) {
    throw new Error(
      `Ergo extra index is not synchronized: indexed height ${indexedHeight}, full height ${fullHeight}`,
    );
  }
  const bestHeader = normalizeHeader(await source.getBestHeader(), `${label} best header`);
  if (bestHeader.height !== fullHeight) {
    throw new Error(
      `Ergo best header height ${bestHeader.height} does not identify full height ${fullHeight}`,
    );
  }
  return { bestHeader, indexedHeight, fullHeight };
}

function assertSameIndexSnapshot(
  before: SyncedIndexSnapshot,
  after: SyncedIndexSnapshot,
): void {
  if (indexSnapshotIdentity(before) !== indexSnapshotIdentity(after)) {
    throw new Error('Ergo full-block and extra-index snapshot changed during tracker reconstruction');
  }
}

function normalizeTrackerBox(
  value: unknown,
  index: number,
  trackerNftIdHex: string,
  trackerErgoTreeHex: string,
): NormalizedTrackerBox {
  const raw = objectValue(value, `indexed tracker box ${index}`);
  const boxId = fixedHex(raw.boxId, 32, `indexed tracker box ${index} id`);
  const transactionId = fixedHex(
    raw.transactionId,
    32,
    `indexed tracker box ${index} transaction id`,
  );
  const inclusionHeight = nonnegativeInt(
    raw.inclusionHeight,
    `indexed tracker box ${index} inclusion height`,
  );
  const ergoTreeHex = variableHex(raw.ergoTree, `indexed tracker box ${index} ErgoTree`);
  if (ergoTreeHex !== trackerErgoTreeHex) {
    throw new Error(`indexed tracker box ${boxId} does not use the configured ErgoTree`);
  }
  if (!Array.isArray(raw.assets) || raw.assets.length !== 1) {
    throw new Error(`indexed tracker box ${boxId} must contain exactly one tracker NFT`);
  }
  const firstAsset = objectValue(raw.assets[0], `indexed tracker box ${boxId} first asset`);
  if (
    fixedHex(firstAsset.tokenId, 32, `indexed tracker box ${boxId} first token id`)
      !== trackerNftIdHex
    || BigInt(String(firstAsset.amount)) !== 1n
  ) {
    throw new Error(`indexed tracker box ${boxId} must preserve the exact singleton tracker NFT`);
  }
  const registersRaw = objectValue(
    raw.additionalRegisters,
    `indexed tracker box ${boxId} registers`,
  );
  const registers = {} as NormalizedTrackerBox['registers'];
  for (const name of ['R4', 'R5', 'R6', 'R7', 'R8', 'R9'] as const) {
    registers[name] = variableHex(registersRaw[name], `indexed tracker box ${boxId} ${name}`);
  }
  const spentTransactionId = raw.spentTransactionId === null || raw.spentTransactionId === undefined
    ? null
    : fixedHex(raw.spentTransactionId, 32, `indexed tracker box ${boxId} spending tx id`);
  const spendingContext = spentTransactionId === null
    ? null
    : normalizeContextExtension(
      objectValue(raw.spendingProof, `indexed tracker box ${boxId} spending proof`).extension,
      `indexed tracker box ${boxId} context extension`,
    );
  if (spentTransactionId === null && raw.spendingProof !== null && raw.spendingProof !== undefined) {
    throw new Error(`unspent tracker box ${boxId} must not contain a spending proof`);
  }
  return {
    raw,
    boxId,
    transactionId,
    inclusionHeight,
    ergoTreeHex,
    registers,
    spentTransactionId,
    spendingContext,
  };
}

function orderSingletonLineage(boxes: NormalizedTrackerBox[]): NormalizedTrackerBox[] {
  const byBoxId = new Map<string, NormalizedTrackerBox>();
  const byCreationTx = new Map<string, NormalizedTrackerBox>();
  for (const box of boxes) {
    if (byBoxId.has(box.boxId)) throw new Error(`duplicate tracker box ${box.boxId}`);
    if (byCreationTx.has(box.transactionId)) {
      throw new Error(`multiple tracker NFT outputs were created by transaction ${box.transactionId}`);
    }
    byBoxId.set(box.boxId, box);
    byCreationTx.set(box.transactionId, box);
  }
  const tips = boxes.filter(box => box.spentTransactionId === null);
  if (tips.length !== 1) {
    throw new Error(`authenticated tracker lineage must have exactly one unspent singleton tip, got ${tips.length}`);
  }
  const predecessorCount = new Map<string, number>();
  for (const box of boxes) {
    if (!box.spentTransactionId) continue;
    const successor = byCreationTx.get(box.spentTransactionId);
    if (!successor) {
      throw new Error(`tracker lineage successor for spending transaction ${box.spentTransactionId} is missing`);
    }
    predecessorCount.set(successor.boxId, (predecessorCount.get(successor.boxId) ?? 0) + 1);
  }
  const roots = boxes.filter(box => (predecessorCount.get(box.boxId) ?? 0) === 0);
  if (roots.length !== 1) {
    throw new Error(`authenticated tracker lineage must have exactly one root, got ${roots.length}`);
  }
  for (const [boxId, count] of predecessorCount) {
    if (count !== 1) throw new Error(`tracker box ${boxId} has ${count} predecessors`);
  }
  const ordered: NormalizedTrackerBox[] = [];
  const visited = new Set<string>();
  let cursor: NormalizedTrackerBox | undefined = roots[0];
  while (cursor) {
    if (visited.has(cursor.boxId)) throw new Error('authenticated tracker lineage contains a cycle');
    visited.add(cursor.boxId);
    ordered.push(cursor);
    cursor = cursor.spentTransactionId
      ? byCreationTx.get(cursor.spentTransactionId)
      : undefined;
  }
  if (ordered.length !== boxes.length || ordered[ordered.length - 1].boxId !== tips[0].boxId) {
    throw new Error('authenticated tracker lineage is disconnected');
  }
  return ordered;
}

async function resolveAnchorHeader(
  source: AuthenticatedSpvTrackerChainSource,
  transactionBlockId: string,
  transactionHeight: number,
  contextIndex: number,
): Promise<NormalizedHeader> {
  let cursor = normalizeHeader(
    await source.getBlockHeaderById(transactionBlockId),
    'tracker spending transaction header',
  );
  if (cursor.idHex !== transactionBlockId || cursor.height !== transactionHeight) {
    throw new Error('tracker spending transaction header identity or height mismatch');
  }
  for (let step = 0; step <= contextIndex; step++) {
    const parent = normalizeHeader(
      await source.getBlockHeaderById(cursor.parentIdHex),
      `tracker header ancestry step ${step + 1}`,
    );
    if (parent.idHex !== cursor.parentIdHex || parent.height !== cursor.height - 1) {
      throw new Error('tracker anchor header ancestry is not contiguous');
    }
    cursor = parent;
  }
  return cursor;
}

function normalizeIndexedTransaction(value: unknown, expectedTxId: string) {
  const raw = objectValue(value, `indexed tracker transaction ${expectedTxId}`);
  const id = fixedHex(raw.id, 32, 'indexed tracker transaction id');
  if (id !== expectedTxId) throw new Error('indexed tracker transaction id mismatch');
  const blockId = fixedHex(raw.blockId, 32, 'indexed tracker transaction block id');
  const inclusionHeight = nonnegativeInt(
    raw.inclusionHeight,
    'indexed tracker transaction inclusion height',
  );
  if (!Array.isArray(raw.inputs) || !Array.isArray(raw.outputs)) {
    throw new Error('indexed tracker transaction must contain input and output arrays');
  }
  return { id, blockId, inclusionHeight, inputs: raw.inputs, outputs: raw.outputs };
}

function assertSingleTransactionBox(values: unknown[], expectedBoxId: string, role: string): void {
  const matches = values.filter(value => normalizedBoxId(value) === expectedBoxId);
  if (matches.length !== 1) {
    throw new Error(`tracker transaction must contain exactly one ${role} box ${expectedBoxId}`);
  }
}

function normalizedBoxId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  try {
    return fixedHex((value as any).boxId, 32, 'transaction box id');
  } catch {
    return null;
  }
}

function normalizeContextExtension(value: unknown, label: string): Record<string, string> {
  const raw = objectValue(value, label);
  const normalized: Record<string, string> = {};
  for (const [key, entry] of Object.entries(raw).sort(([left], [right]) => left.localeCompare(right))) {
    normalized[key] = key === '2'
      ? boundedVariableHex(
          entry,
          `${label} Var(${key})`,
          AUTHENTICATED_SPV_TRACKER_MAX_PROOF_BUNDLE_BYTES + 6,
        )
      : variableHex(entry, `${label} Var(${key})`);
  }
  for (const key of ['0', '1', '2', '3']) {
    if (!normalized[key]) throw new Error(`${label} is missing mandatory Var(${key})`);
  }
  return normalized;
}

function assertContextEqual(
  actual: Record<string, string>,
  expected: Record<string, string>,
  label: string,
  keys: readonly string[] = ['0', '1', '2', '3'],
): void {
  for (const key of keys) {
    if (actual[key] !== expected[key]) {
      throw new Error(`${label} context Var(${key}) does not match the authenticated admission`);
    }
  }
}

function assertRegisterSetEqual(
  actual: NormalizedTrackerBox['registers'],
  expected: Record<'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9', string>,
  label: string,
): void {
  for (const name of ['R4', 'R5', 'R6', 'R7', 'R8', 'R9'] as const) {
    if (actual[name] !== expected[name]) {
      throw new Error(`tracker ${label} register ${name} does not replay deterministically`);
    }
  }
}

function normalizeHeader(value: unknown, label: string): NormalizedHeader {
  const raw = objectValue(value, label);
  const extensionRootHex = raw.extensionRoot === undefined
    ? undefined
    : fixedHex(raw.extensionRoot, 32, `${label} extensionRoot`);
  const extensionHashHex = raw.extensionHash === undefined
    ? undefined
    : fixedHex(raw.extensionHash, 32, `${label} extensionHash`);
  if (
    extensionRootHex !== undefined
    && extensionHashHex !== undefined
    && extensionRootHex !== extensionHashHex
  ) {
    throw new Error(`${label} extension aliases disagree`);
  }
  return {
    idHex: fixedHex(raw.id, 32, `${label} id`),
    parentIdHex: fixedHex(raw.parentId, 32, `${label} parent id`),
    height: nonnegativeInt(raw.height, `${label} height`),
    extensionRootHex: fixedHex(
      extensionRootHex ?? extensionHashHex,
      32,
      `${label} extension root`,
    ),
  };
}

function objectValue(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  const normalized = variableHex(value, label);
  if (normalized.length !== bytes * 2) {
    throw new Error(`${label} must be ${bytes} bytes`);
  }
  return normalized;
}

function variableHex(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-f]+$/i.test(clean) || clean.length % 2 !== 0) {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  return clean.toLowerCase();
}

function boundedVariableHex(value: unknown, label: string, maxBytes: number): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const prefixChars = value.startsWith('0x') ? 2 : 0;
  if (value.length > maxBytes * 2 + prefixChars) {
    throw new Error(`${label} exceeds the ${maxBytes}-byte serialized bound`);
  }
  const clean = prefixChars === 2 ? value.slice(2) : value;
  return variableHex(clean, label);
}

function nonnegativeInt(value: unknown, label: string): number {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0 || normalized > 0x7fff_ffff) {
    throw new Error(`${label} must be a nonnegative signed Int`);
  }
  return normalized;
}
