import { AddressType } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';

import {
  decodeCanonicalLongRegister,
  decodeCollByteRegister,
  MINER_FEE,
} from './ergo-encoding.js';
import {
  pegInRouteManifestDigestHex,
  resolvePegInRouteMainChainLockSource,
  resolvePegInRouteSettlementVaultSource,
  validatePegInRouteManifest,
  type PegInRouteManifestV1,
} from './peg-in-route-manifest.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';

const MCL_ESCAPE_TIMEOUT_BLOCKS = 10_000;

export type PegInRouteObservationClassification =
  | 'blocked_manifest_invalid'
  | 'blocked_manifest_digest_mismatch'
  | 'blocked_source_identity'
  | 'blocked_source_template_mismatch'
  | 'blocked_network_mismatch'
  | 'blocked_anchor_policy'
  | 'blocked_index_unsynchronized'
  | 'blocked_node_view_unstable'
  | 'blocked_source_disagreement'
  | 'blocked_query_failure'
  | 'blocked_compile_identity'
  | 'blocked_box_malformed'
  | 'blocked_commit_pending'
  | 'blocked_transition_unresolved'
  | 'blocked_no_active_route_history'
  | 'blocked_no_committed_transition'
  | 'blocked_legacy_mcl_utxo_present'
  | 'observation_condition_met_under_explicit_manifest';

export interface PegInRouteObservationSource {
  readonly observationSourceId: string;
  getInfo(): Promise<unknown>;
  getIndexedHeight(): Promise<unknown>;
  getBestHeader(): Promise<unknown>;
  getBlockHeaderIdsAtHeight(height: number): Promise<string[]>;
  getIndexedBoxesByAddress(address: string): Promise<unknown[]>;
  getUnspentBoxesByAddress(address: string): Promise<unknown[]>;
  getTransaction(txId: string): Promise<unknown | null>;
  compileP2sAddress(source: string): Promise<string>;
  beginAuthenticatedTrackerReconstruction?(): void;
  endAuthenticatedTrackerReconstruction?(): void;
}

interface RouteSnapshot {
  network: string;
  indexedHeight: number;
  fullHeight: number;
  tip: { height: number; idHex: string };
}

export interface ObservedPegInRouteDeposit {
  addressBoxIndex: number;
  boxIdHex: string;
  transactionIdHex: string;
  outputIndex: number;
  creationHeight: number;
  valueNanoErg: string;
  spentTransactionIdHex: string | null;
  targetEvmAddressHex: string;
  declaredAmountNanoErg: string;
  signerMetadataHex: string;
  depositorErgoTreeHex: string;
  classification: 'refundable' | 'commit_pending' | 'committed' | 'refunded' | 'unresolved';
  transition: null | {
    spendingTransactionIdHex: string;
    inclusionHeight: number;
    inclusionBlockIdHex: string;
    confirmations: number;
    vaultBoxIdHex: string | null;
  };
}

interface SourceObservationPayload {
  compiledMainChainLock: {
    address: string;
    ergoTreeHex: string;
  };
  compiledSettlementVault: {
    address: string;
    ergoTreeHex: string;
  };
  activeHistory: ObservedPegInRouteDeposit[];
  activeCurrentBoxIdsHex: string[];
  vaultHistoryBoxIdsHex: string[];
  vaultCurrentBoxIdsHex: string[];
  legacyRoutes: Array<{
    ordinal: number;
    version: string;
    address: string;
    historyBoxIdsHex: string[];
    currentBoxIdsHex: string[];
  }>;
}

interface SourceObservation extends SourceObservationPayload {
  sourceId: string;
  snapshotBefore: RouteSnapshot;
  snapshotAfter: RouteSnapshot;
  stable: boolean;
  anchorHeader: {
    height: number;
    expectedIdHex: string;
    observedIdsHex: string[];
    depthAtSnapshot: number;
  };
  observationDigestHex: string;
}

export interface PegInRouteObservationBlocker {
  code: Exclude<
    PegInRouteObservationClassification,
    'observation_condition_met_under_explicit_manifest'
  >;
  message: string;
}

export interface PegInRouteObservationAssessment {
  schemaVersion: 1;
  kind: 'peg-in-route-observation-assessment';
  generatedAt: string;
  manifest: {
    manifestId: string;
    schemaVersion: string;
    computedSha256Hex: string;
    expectedSha256Hex: string;
    sourceRevision: string;
    profile: 'committed-vault-v3';
    settlementVaultProfileId: 'main-chain-aggregate-unlock-trustless-v1-compatibility';
  };
  routeBindings: {
    mainChainLockAddress: string;
    mainChainLockErgoTreeHex: string;
    settlementVaultAddress: string;
    settlementVaultErgoTreeHex: string;
    commitConfirmations: number;
    committeePublicKeysHex: string[];
    committeeThreshold: number;
    declaredLegacyCount: number;
  };
  networkObservation: {
    networkId: string;
    policy: {
      requiredDistinctOrigins: 2;
      synchronizedExtraIndexRequired: true;
      stableBeforeAfterSnapshotRequired: true;
      exactObservationAgreementRequired: true;
      completeActiveAndVaultHistoryRequired: true;
      minimumAnchorDepth: number;
      maximumAnchorAgeBlocks: number;
    };
    primary: SourceObservation;
    witness: SourceObservation;
    exactObservationAgreement: boolean;
  };
  summary: {
    activeDepositsObserved: number;
    refundableDeposits: number;
    pendingCommitDeposits: number;
    committedDeposits: number;
    refundedDeposits: number;
    unresolvedDeposits: number;
    legacyCurrentUtxos: number;
  };
  decision: {
    classification: PegInRouteObservationClassification;
    observationConditionMet: boolean;
    routeActivated: false;
    mintAuthorized: false;
    cutoverAuthorized: false;
    blockers: PegInRouteObservationBlocker[];
    statement: string;
  };
  boundary: {
    readOnly: true;
    deterministicCompilationOnlyPost: true;
    completePaginatedHistoryRequired: true;
    sourceOperationalIndependenceAuthenticated: false;
    canonicalConsensusProven: false;
    manifestReviewApprovalBound: false;
    repositoryRevisionAuthenticated: false;
    routingConfigurationAuthenticated: false;
    sidechainMintTimingVerified: false;
    localPersistenceConsulted: false;
    nodeWalletUsed: false;
    transactionCheckPerformed: false;
    signingPerformed: false;
    submissionPerformed: false;
    broadcastPerformed: false;
    fundsAuthorityGranted: false;
    deploymentActivationClaimed: false;
    productionReadinessClaimed: false;
  };
}

export interface AssessPegInRouteObservationInput {
  manifest: PegInRouteManifestV1;
  expectedManifestSha256Hex: string;
  mainChainLockTemplateSource: string;
  settlementVaultTemplateSource: string;
  primarySource: PegInRouteObservationSource;
  witnessSource: PegInRouteObservationSource;
  generatedAt?: string;
}

export class PegInRouteObservationBlockedError extends Error {
  constructor(
    readonly classification: PegInRouteObservationClassification,
    message: string,
  ) {
    super(message);
    this.name = 'PegInRouteObservationBlockedError';
  }
}

export async function assessPegInRouteObservation(
  input: AssessPegInRouteObservationInput,
): Promise<PegInRouteObservationAssessment> {
  let manifest: PegInRouteManifestV1;
  try {
    manifest = validatePegInRouteManifest(input.manifest);
  } catch (error) {
    throw blocked('blocked_manifest_invalid', error, 'peg-in route manifest is invalid');
  }
  const expectedSha256Hex = fixedLowerHexOrBlock(
    input.expectedManifestSha256Hex,
    32,
    'expected manifest SHA-256',
    'blocked_manifest_digest_mismatch',
  );
  const computedSha256Hex = pegInRouteManifestDigestHex(manifest);
  if (computedSha256Hex !== expectedSha256Hex) {
    throw new PegInRouteObservationBlockedError(
      'blocked_manifest_digest_mismatch',
      'computed peg-in route manifest digest does not match the caller-supplied digest',
    );
  }
  let resolvedMainChainLockSource: string;
  let resolvedSettlementVaultSource: string;
  try {
    resolvedMainChainLockSource = resolvePegInRouteMainChainLockSource(
      manifest,
      input.mainChainLockTemplateSource,
    );
    resolvedSettlementVaultSource = resolvePegInRouteSettlementVaultSource(
      manifest,
      input.settlementVaultTemplateSource,
    );
  } catch (error) {
    throw blocked(
      'blocked_source_template_mismatch',
      error,
      'MainChainLock source does not match the manifest',
    );
  }
  const { primarySource, witnessSource } = input;
  if (primarySource === witnessSource) {
    throw new PegInRouteObservationBlockedError(
      'blocked_source_identity',
      'peg-in route observation requires distinct source instances',
    );
  }
  const primarySourceId = canonicalHttpOrigin(primarySource.observationSourceId, 'primary source ID');
  const witnessSourceId = canonicalHttpOrigin(witnessSource.observationSourceId, 'witness source ID');
  if (primarySourceId === witnessSourceId) {
    throw new PegInRouteObservationBlockedError(
      'blocked_source_identity',
      'peg-in route observation requires distinct source origins',
    );
  }
  assertPairedBudgets(primarySource, 'primary');
  assertPairedBudgets(witnessSource, 'witness');
  const generatedAt = canonicalIsoTimestamp(input.generatedAt ?? new Date().toISOString());

  let primaryStarted = false;
  let witnessStarted = false;
  try {
    primarySource.beginAuthenticatedTrackerReconstruction?.();
    primaryStarted = Boolean(primarySource.beginAuthenticatedTrackerReconstruction);
    witnessSource.beginAuthenticatedTrackerReconstruction?.();
    witnessStarted = Boolean(witnessSource.beginAuthenticatedTrackerReconstruction);

    const [primaryBefore, witnessBefore] = await Promise.all([
      captureSnapshot(primarySource, 'primary before'),
      captureSnapshot(witnessSource, 'witness before'),
    ]);
    assertExpectedNetwork(primaryBefore, manifest, 'primary');
    assertExpectedNetwork(witnessBefore, manifest, 'witness');
    if (snapshotIdentity(primaryBefore) !== snapshotIdentity(witnessBefore)) {
      throw new PegInRouteObservationBlockedError(
        'blocked_source_disagreement',
        'primary and witness do not identify the same synchronized starting snapshot',
      );
    }
    const [primaryAnchor, witnessAnchor] = await Promise.all([
      observeAnchor(primarySource, primaryBefore, manifest, 'primary'),
      observeAnchor(witnessSource, witnessBefore, manifest, 'witness'),
    ]);
    let primaryPayload: SourceObservationPayload;
    let witnessPayload: SourceObservationPayload;
    try {
      [primaryPayload, witnessPayload] = await Promise.all([
        observeSourcePayload(
          primarySource,
          manifest,
          resolvedMainChainLockSource,
          resolvedSettlementVaultSource,
          primaryBefore,
        ),
        observeSourcePayload(
          witnessSource,
          manifest,
          resolvedMainChainLockSource,
          resolvedSettlementVaultSource,
          witnessBefore,
        ),
      ]);
    } catch (error) {
      if (error instanceof PegInRouteObservationBlockedError) throw error;
      throw blocked('blocked_box_malformed', error, 'peg-in route observation is malformed');
    }
    const [primaryAfter, witnessAfter] = await Promise.all([
      captureSnapshot(primarySource, 'primary after'),
      captureSnapshot(witnessSource, 'witness after'),
    ]);
    const primaryStable = snapshotIdentity(primaryBefore) === snapshotIdentity(primaryAfter);
    const witnessStable = snapshotIdentity(witnessBefore) === snapshotIdentity(witnessAfter);
    const primaryDigest = sourcePayloadDigest(primaryPayload, primaryAnchor.observation);
    const witnessDigest = sourcePayloadDigest(witnessPayload, witnessAnchor.observation);
    const exactObservationAgreement = primaryDigest === witnessDigest
      && snapshotIdentity(primaryAfter) === snapshotIdentity(witnessAfter);
    const primary: SourceObservation = {
      sourceId: primarySourceId,
      snapshotBefore: primaryBefore,
      snapshotAfter: primaryAfter,
      stable: primaryStable,
      anchorHeader: primaryAnchor.observation,
      ...primaryPayload,
      observationDigestHex: primaryDigest,
    };
    const witness: SourceObservation = {
      sourceId: witnessSourceId,
      snapshotBefore: witnessBefore,
      snapshotAfter: witnessAfter,
      stable: witnessStable,
      anchorHeader: witnessAnchor.observation,
      ...witnessPayload,
      observationDigestHex: witnessDigest,
    };
    const blockers = collectBlockers(primary, witness, exactObservationAgreement);
    const classification = blockers[0]?.code
      ?? 'observation_condition_met_under_explicit_manifest';
    const observationConditionMet = blockers.length === 0;
    const summary = summarize(primaryPayload);
    return {
      schemaVersion: 1,
      kind: 'peg-in-route-observation-assessment',
      generatedAt,
      manifest: {
        manifestId: manifest.manifestId,
        schemaVersion: manifest.schemaVersion,
        computedSha256Hex,
        expectedSha256Hex,
        sourceRevision: manifest.coverage.cutoff.sourceRevision,
        profile: manifest.route.profile,
        settlementVaultProfileId: manifest.route.settlementVault.profileId,
      },
      routeBindings: {
        mainChainLockAddress: manifest.route.mainChainLock.address,
        mainChainLockErgoTreeHex: manifest.route.mainChainLock.ergoTreeHex,
        settlementVaultAddress: manifest.route.settlementVault.address,
        settlementVaultErgoTreeHex: manifest.route.settlementVault.ergoTreeHex,
        commitConfirmations: manifest.route.commitConfirmations,
        committeePublicKeysHex: [...manifest.route.committee.publicKeysHex],
        committeeThreshold: manifest.route.committee.threshold,
        declaredLegacyCount: manifest.coverage.declaredLegacyCount,
      },
      networkObservation: {
        networkId: manifest.network.id,
        policy: {
          requiredDistinctOrigins: 2,
          synchronizedExtraIndexRequired: true,
          stableBeforeAfterSnapshotRequired: true,
          exactObservationAgreementRequired: true,
          completeActiveAndVaultHistoryRequired: true,
          minimumAnchorDepth: manifest.network.anchorHeader.minimumDepth,
          maximumAnchorAgeBlocks: manifest.network.anchorHeader.maximumAgeBlocks,
        },
        primary,
        witness,
        exactObservationAgreement,
      },
      summary,
      decision: {
        classification,
        observationConditionMet,
        routeActivated: false,
        mintAuthorized: false,
        cutoverAuthorized: false,
        blockers,
        statement: observationConditionMet
          ? 'The exact MCL-to-vault route has at least one observed committed transition and no current legacy MCL UTXO under the explicit manifest.'
          : 'The non-authorizing peg-in route observation is blocked under the explicit manifest.',
      },
      boundary: {
        readOnly: true,
        deterministicCompilationOnlyPost: true,
        completePaginatedHistoryRequired: true,
        sourceOperationalIndependenceAuthenticated: false,
        canonicalConsensusProven: false,
        manifestReviewApprovalBound: false,
        repositoryRevisionAuthenticated: false,
        routingConfigurationAuthenticated: false,
        sidechainMintTimingVerified: false,
        localPersistenceConsulted: false,
        nodeWalletUsed: false,
        transactionCheckPerformed: false,
        signingPerformed: false,
        submissionPerformed: false,
        broadcastPerformed: false,
        fundsAuthorityGranted: false,
        deploymentActivationClaimed: false,
        productionReadinessClaimed: false,
      },
    };
  } finally {
    if (witnessStarted) witnessSource.endAuthenticatedTrackerReconstruction?.();
    if (primaryStarted) primarySource.endAuthenticatedTrackerReconstruction?.();
  }
}

async function observeSourcePayload(
  source: PegInRouteObservationSource,
  manifest: PegInRouteManifestV1,
  resolvedMainChainLockSource: string,
  resolvedSettlementVaultSource: string,
  snapshot: RouteSnapshot,
): Promise<SourceObservationPayload> {
  let compiledMainChainLockAddress: string;
  let compiledSettlementVaultAddress: string;
  let activeIndexed: unknown[];
  let activeCurrent: unknown[];
  let vaultIndexed: unknown[];
  let vaultCurrent: unknown[];
  let legacyResults: Array<{ history: unknown[]; current: unknown[] }>;
  try {
    [
      compiledMainChainLockAddress,
      compiledSettlementVaultAddress,
      activeIndexed,
      activeCurrent,
      vaultIndexed,
      vaultCurrent,
      legacyResults,
    ] =
      await Promise.all([
        source.compileP2sAddress(resolvedMainChainLockSource),
        source.compileP2sAddress(resolvedSettlementVaultSource),
        source.getIndexedBoxesByAddress(manifest.route.mainChainLock.address),
        source.getUnspentBoxesByAddress(manifest.route.mainChainLock.address),
        source.getIndexedBoxesByAddress(manifest.route.settlementVault.address),
        source.getUnspentBoxesByAddress(manifest.route.settlementVault.address),
        Promise.all(manifest.legacyMainChainLocks.map(async entry => ({
          history: await source.getIndexedBoxesByAddress(entry.address),
          current: await source.getUnspentBoxesByAddress(entry.address),
        }))),
      ]);
  } catch (error) {
    throw blocked('blocked_query_failure', error, 'peg-in route source query failed');
  }
  const compiled = decodeP2sAddress(
    compiledMainChainLockAddress,
    manifest.network.addressNetworkPrefix,
    'compiled MainChainLock address',
  );
  if (
    compiled.address !== manifest.route.mainChainLock.address
    || compiled.ergoTreeHex !== manifest.route.mainChainLock.ergoTreeHex
  ) {
    throw new PegInRouteObservationBlockedError(
      'blocked_compile_identity',
      'compiled MainChainLock identity does not match the manifest',
    );
  }
  const compiledSettlementVault = decodeP2sAddress(
    compiledSettlementVaultAddress,
    manifest.network.addressNetworkPrefix,
    'compiled settlement-vault address',
  );
  if (
    compiledSettlementVault.address !== manifest.route.settlementVault.address
    || compiledSettlementVault.ergoTreeHex !== manifest.route.settlementVault.ergoTreeHex
  ) {
    throw new PegInRouteObservationBlockedError(
      'blocked_compile_identity',
      'compiled settlement-vault identity does not match the manifest',
    );
  }

  const vaultHistory = vaultIndexed.map((box, index) => normalizeVaultBox(
    box,
    index,
    manifest.route.settlementVault.ergoTreeHex,
    snapshot.fullHeight,
    'indexed vault',
  ));
  assertUnique(vaultHistory.map(box => box.boxIdHex), 'indexed vault box IDs');
  const vaultById = new Map(vaultHistory.map(box => [box.boxIdHex, box]));
  const vaultCurrentBoxIdsHex = normalizeCurrentSet(
    vaultCurrent,
    manifest.route.settlementVault.ergoTreeHex,
    'current vault',
  );
  assertCurrentSetMatchesHistory(vaultHistory, vaultCurrentBoxIdsHex, 'vault');

  const activeBase = activeIndexed.map((box, index) => normalizeDepositBox(
    box,
    index,
    manifest.route.mainChainLock.ergoTreeHex,
    snapshot.fullHeight,
  ));
  assertUnique(activeBase.map(box => box.boxIdHex), 'indexed MainChainLock box IDs');
  const activeCurrentBoxIdsHex = normalizeCurrentSet(
    activeCurrent,
    manifest.route.mainChainLock.ergoTreeHex,
    'current MainChainLock',
  );
  assertCurrentSetMatchesHistory(activeBase, activeCurrentBoxIdsHex, 'MainChainLock');
  const activeHistory = await Promise.all(activeBase.map(box => classifyDepositSpend(
    source,
    box,
    manifest.route.settlementVault.ergoTreeHex,
    vaultById,
    snapshot.fullHeight,
    manifest.route.commitConfirmations,
  )));

  const legacyRoutes = legacyResults.map((result, index) => {
    const binding = manifest.legacyMainChainLocks[index];
    const history = normalizeLegacyHistory(result.history, binding.ergoTreeHex, snapshot.fullHeight);
    const current = normalizeCurrentSet(result.current, binding.ergoTreeHex, 'current legacy MCL');
    assertCurrentSetMatchesHistory(history, current, `legacy MCL ${binding.ordinal}`);
    return {
      ordinal: binding.ordinal,
      version: binding.version,
      address: binding.address,
      historyBoxIdsHex: history.map(box => box.boxIdHex),
      currentBoxIdsHex: current,
    };
  });

  return {
    compiledMainChainLock: compiled,
    compiledSettlementVault,
    activeHistory,
    activeCurrentBoxIdsHex,
    vaultHistoryBoxIdsHex: vaultHistory.map(box => box.boxIdHex),
    vaultCurrentBoxIdsHex,
    legacyRoutes,
  };
}

interface BaseHistoryBox {
  boxIdHex: string;
  spentTransactionIdHex: string | null;
}

interface DepositBase extends BaseHistoryBox {
  addressBoxIndex: number;
  transactionIdHex: string;
  outputIndex: number;
  creationHeight: number;
  valueNanoErg: bigint;
  targetEvmAddressHex: string;
  declaredAmountNanoErg: bigint;
  signerMetadataHex: string;
  depositorErgoTreeHex: string;
}

interface VaultHistoryBox extends BaseHistoryBox {
  transactionIdHex: string;
  outputIndex: number;
  valueNanoErg: bigint;
  depositIdHex: string;
  targetEvmAddressHex: string;
  originalAmountNanoErg: bigint;
  depositorErgoTreeHex: string;
}

function normalizeDepositBox(
  value: unknown,
  addressBoxIndex: number,
  expectedTreeHex: string,
  snapshotHeight: number,
): DepositBase {
  const raw = record(value, `indexed MainChainLock box ${addressBoxIndex}`);
  const label = `indexed MainChainLock box ${addressBoxIndex}`;
  const boxIdHex = fixedLowerHex(raw.boxId, 32, `${label} box ID`);
  const transactionIdHex = fixedLowerHex(raw.transactionId, 32, `${label} transaction ID`);
  const outputIndex = nonnegativeSafeInteger(raw.index, `${label} output index`);
  const creationHeight = nonnegativeSafeInteger(raw.creationHeight, `${label} creation height`);
  if (creationHeight > snapshotHeight) throw malformed(`${label} was created after the snapshot`);
  const valueNanoErg = positiveBigInt(raw.value, `${label} value`);
  if (variableLowerHex(raw.ergoTree, `${label} ErgoTree`) !== expectedTreeHex) {
    throw malformed(`${label} uses an unexpected ErgoTree`);
  }
  assertPureErg(raw.assets, `${label} assets`);
  const registers = exactRegisters(raw.additionalRegisters, label);
  const targetEvmAddressHex = decodeCollByteRegister(registers.R4, `${label} R4`);
  if (targetEvmAddressHex.length !== 40) throw malformed(`${label} R4 must contain 20 bytes`);
  const declaredAmountNanoErg = decodeCanonicalLongRegister(registers.R5, `${label} R5`);
  if (declaredAmountNanoErg !== valueNanoErg) {
    throw malformed(`${label} R5 must equal the actual deposit value`);
  }
  const signerMetadataHex = decodeCollByteRegister(registers.R6, `${label} R6`);
  if (!/^(?:02|03)[0-9a-f]{64}$/.test(signerMetadataHex)) {
    throw malformed(`${label} R6 must contain one compressed public key`);
  }
  const depositorErgoTreeHex = decodeCollByteRegister(registers.R7, `${label} R7`);
  if (depositorErgoTreeHex.length === 0) throw malformed(`${label} R7 must not be empty`);
  return {
    addressBoxIndex,
    boxIdHex,
    transactionIdHex,
    outputIndex,
    creationHeight,
    valueNanoErg,
    spentTransactionIdHex: nullableSpentTransactionId(raw.spentTransactionId, label),
    targetEvmAddressHex,
    declaredAmountNanoErg,
    signerMetadataHex,
    depositorErgoTreeHex,
  };
}

function normalizeVaultBox(
  value: unknown,
  index: number,
  expectedTreeHex: string,
  snapshotHeight: number,
  prefix: string,
): VaultHistoryBox {
  const label = `${prefix} ${index}`;
  const raw = record(value, label);
  const creationHeight = nonnegativeSafeInteger(raw.creationHeight, `${label} creation height`);
  if (creationHeight > snapshotHeight) throw malformed(`${label} was created after the snapshot`);
  if (variableLowerHex(raw.ergoTree, `${label} ErgoTree`) !== expectedTreeHex) {
    throw malformed(`${label} uses an unexpected ErgoTree`);
  }
  assertPureErg(raw.assets, `${label} assets`);
  const registers = exactRegisters(raw.additionalRegisters, label);
  const depositIdHex = decodeCollByteRegister(registers.R4, `${label} R4`);
  if (depositIdHex.length !== 64) throw malformed(`${label} R4 must contain 32 bytes`);
  const targetEvmAddressHex = decodeCollByteRegister(registers.R5, `${label} R5`);
  if (targetEvmAddressHex.length !== 40) throw malformed(`${label} R5 must contain 20 bytes`);
  const originalAmountNanoErg = decodeCanonicalLongRegister(registers.R6, `${label} R6`);
  if (originalAmountNanoErg <= 0n) throw malformed(`${label} R6 must be positive`);
  const depositorErgoTreeHex = decodeCollByteRegister(registers.R7, `${label} R7`);
  if (depositorErgoTreeHex.length === 0) throw malformed(`${label} R7 must not be empty`);
  return {
    boxIdHex: fixedLowerHex(raw.boxId, 32, `${label} box ID`),
    transactionIdHex: fixedLowerHex(raw.transactionId, 32, `${label} transaction ID`),
    outputIndex: nonnegativeSafeInteger(raw.index, `${label} output index`),
    valueNanoErg: positiveBigInt(raw.value, `${label} value`),
    spentTransactionIdHex: nullableSpentTransactionId(raw.spentTransactionId, label),
    depositIdHex,
    targetEvmAddressHex,
    originalAmountNanoErg,
    depositorErgoTreeHex,
  };
}

async function classifyDepositSpend(
  source: PegInRouteObservationSource,
  deposit: DepositBase,
  vaultErgoTreeHex: string,
  vaultById: ReadonlyMap<string, VaultHistoryBox>,
  snapshotHeight: number,
  requiredCommitConfirmations: number,
): Promise<ObservedPegInRouteDeposit> {
  const base = {
    addressBoxIndex: deposit.addressBoxIndex,
    boxIdHex: deposit.boxIdHex,
    transactionIdHex: deposit.transactionIdHex,
    outputIndex: deposit.outputIndex,
    creationHeight: deposit.creationHeight,
    valueNanoErg: deposit.valueNanoErg.toString(),
    spentTransactionIdHex: deposit.spentTransactionIdHex,
    targetEvmAddressHex: deposit.targetEvmAddressHex,
    declaredAmountNanoErg: deposit.declaredAmountNanoErg.toString(),
    signerMetadataHex: deposit.signerMetadataHex,
    depositorErgoTreeHex: deposit.depositorErgoTreeHex,
  };
  if (deposit.spentTransactionIdHex === null) {
    return { ...base, classification: 'refundable', transition: null };
  }
  let rawTransaction: unknown | null;
  try {
    rawTransaction = await source.getTransaction(deposit.spentTransactionIdHex);
  } catch (error) {
    throw blocked('blocked_query_failure', error, 'MainChainLock spending transaction query failed');
  }
  if (rawTransaction === null) {
    return { ...base, classification: 'unresolved', transition: null };
  }
  const tx = normalizeTransaction(rawTransaction, 'MainChainLock spending transaction');
  if (
    tx.idHex !== deposit.spentTransactionIdHex
    || !tx.inputBoxIdsHex.includes(deposit.boxIdHex)
    || tx.outputs.length === 0
    || tx.inclusionHeight > snapshotHeight
  ) {
    return { ...base, classification: 'unresolved', transition: null };
  }
  let canonicalBlockIdsHex: string[];
  try {
    canonicalBlockIdsHex = (await source.getBlockHeaderIdsAtHeight(tx.inclusionHeight))
      .map((id, index) => fixedLowerHex(
        id,
        32,
        `MainChainLock spending transaction canonical block ID ${index}`,
      ));
  } catch (error) {
    throw blocked(
      'blocked_query_failure',
      error,
      'MainChainLock spending transaction canonical block query failed',
    );
  }
  if (
    canonicalBlockIdsHex.length !== 1
    || canonicalBlockIdsHex[0] !== tx.inclusionBlockIdHex
  ) {
    return { ...base, classification: 'unresolved', transition: null };
  }
  const confirmations = snapshotHeight - tx.inclusionHeight + 1;
  const output0 = tx.outputs[0];
  if (isExactVaultCommit(output0, deposit, vaultErgoTreeHex)) {
    const indexedVault = vaultById.get(output0.boxIdHex);
    if (
      !indexedVault
      || indexedVault.transactionIdHex !== tx.idHex
      || indexedVault.outputIndex !== 0
      || indexedVault.valueNanoErg !== deposit.valueNanoErg
      || indexedVault.depositIdHex !== deposit.boxIdHex
      || indexedVault.targetEvmAddressHex !== deposit.targetEvmAddressHex
      || indexedVault.originalAmountNanoErg !== deposit.valueNanoErg
      || indexedVault.depositorErgoTreeHex !== deposit.depositorErgoTreeHex
    ) {
      return { ...base, classification: 'unresolved', transition: null };
    }
    const transition = {
      spendingTransactionIdHex: tx.idHex,
      inclusionHeight: tx.inclusionHeight,
      inclusionBlockIdHex: tx.inclusionBlockIdHex,
      confirmations,
      vaultBoxIdHex: output0.boxIdHex,
    };
    if (confirmations < requiredCommitConfirmations) {
      return { ...base, classification: 'commit_pending', transition };
    }
    return {
      ...base,
      classification: 'committed',
      transition,
    };
  }
  const minimumRefund = deposit.valueNanoErg - BigInt(MINER_FEE);
  if (
    tx.inclusionHeight >= deposit.creationHeight + MCL_ESCAPE_TIMEOUT_BLOCKS
    && output0.transactionIdHex === tx.idHex
    && output0.outputIndex === 0
    && output0.ergoTreeHex === deposit.depositorErgoTreeHex
    && output0.valueNanoErg >= minimumRefund
    && output0.assets.length === 0
  ) {
    return {
      ...base,
      classification: 'refunded',
      transition: {
        spendingTransactionIdHex: tx.idHex,
        inclusionHeight: tx.inclusionHeight,
        inclusionBlockIdHex: tx.inclusionBlockIdHex,
        confirmations,
        vaultBoxIdHex: null,
      },
    };
  }
  return { ...base, classification: 'unresolved', transition: null };
}

interface NormalizedTransaction {
  idHex: string;
  inclusionHeight: number;
  inclusionBlockIdHex: string;
  inputBoxIdsHex: string[];
  outputs: NormalizedOutput[];
}

interface NormalizedOutput {
  boxIdHex: string;
  transactionIdHex: string;
  outputIndex: number;
  valueNanoErg: bigint;
  ergoTreeHex: string;
  assets: unknown[];
  additionalRegisters: Record<string, unknown>;
}

function normalizeTransaction(value: unknown, label: string): NormalizedTransaction {
  const raw = record(value, label);
  if (!Array.isArray(raw.inputs) || !Array.isArray(raw.outputs)) {
    throw malformed(`${label} must contain input and output arrays`);
  }
  const idHex = reconcileFixedHexAlias(
    raw.id,
    raw.txId,
    32,
    `${label} id`,
    `${label} txId`,
  );
  const inclusionHeight = reconcileNonnegativeIntegerAlias(
    raw.inclusionHeight,
    raw.blockHeight,
    `${label} inclusionHeight`,
    `${label} blockHeight`,
  );
  const inclusionBlockIdHex = reconcileTransactionBlockId(raw, label);
  return {
    idHex,
    inclusionHeight,
    inclusionBlockIdHex,
    inputBoxIdsHex: raw.inputs.map((entry, index) => fixedLowerHex(
      record(entry, `${label} input ${index}`).boxId,
      32,
      `${label} input ${index} box ID`,
    )),
    outputs: raw.outputs.map((entry, index) => {
      const output = record(entry, `${label} output ${index}`);
      if (!Array.isArray(output.assets)) throw malformed(`${label} output ${index} assets missing`);
      const transactionIdHex = output.transactionId === undefined
        ? idHex
        : fixedLowerHex(
          output.transactionId,
          32,
          `${label} output ${index} transaction ID`,
        );
      if (transactionIdHex !== idHex) {
        throw malformed(`${label} output ${index} transaction ID must equal the parent ID`);
      }
      const outputIndex = output.index === undefined
        ? index
        : nonnegativeSafeInteger(output.index, `${label} output ${index} index`);
      if (outputIndex !== index) {
        throw malformed(`${label} output ${index} index must equal its array position`);
      }
      return {
        boxIdHex: fixedLowerHex(output.boxId, 32, `${label} output ${index} box ID`),
        transactionIdHex,
        outputIndex,
        valueNanoErg: positiveBigInt(output.value, `${label} output ${index} value`),
        ergoTreeHex: variableLowerHex(output.ergoTree, `${label} output ${index} ErgoTree`),
        assets: output.assets,
        additionalRegisters: record(
          output.additionalRegisters,
          `${label} output ${index} registers`,
        ),
      };
    }),
  };
}

function isExactVaultCommit(
  output: NormalizedOutput,
  deposit: DepositBase,
  vaultErgoTreeHex: string,
): boolean {
  try {
    if (
      output.outputIndex !== 0
      || output.transactionIdHex !== deposit.spentTransactionIdHex
      || output.ergoTreeHex !== vaultErgoTreeHex
      || output.valueNanoErg !== deposit.valueNanoErg
      || output.assets.length !== 0
    ) return false;
    const registers = exactRegisters(output.additionalRegisters, 'vault commit output');
    return decodeCollByteRegister(registers.R4, 'vault commit R4') === deposit.boxIdHex
      && decodeCollByteRegister(registers.R5, 'vault commit R5') === deposit.targetEvmAddressHex
      && decodeCanonicalLongRegister(registers.R6, 'vault commit R6') === deposit.valueNanoErg
      && decodeCollByteRegister(registers.R7, 'vault commit R7') === deposit.depositorErgoTreeHex;
  } catch {
    return false;
  }
}

function reconcileFixedHexAlias(
  primaryValue: unknown,
  aliasValue: unknown,
  bytes: number,
  primaryLabel: string,
  aliasLabel: string,
): string {
  if (primaryValue === undefined && aliasValue === undefined) {
    throw malformed(`${primaryLabel} or ${aliasLabel} is required`);
  }
  const primary = primaryValue === undefined
    ? undefined
    : fixedLowerHex(primaryValue, bytes, primaryLabel);
  const alias = aliasValue === undefined
    ? undefined
    : fixedLowerHex(aliasValue, bytes, aliasLabel);
  if (primary !== undefined && alias !== undefined && primary !== alias) {
    throw malformed(`${primaryLabel} and ${aliasLabel} disagree`);
  }
  return primary ?? alias!;
}

function reconcileNonnegativeIntegerAlias(
  primaryValue: unknown,
  aliasValue: unknown,
  primaryLabel: string,
  aliasLabel: string,
): number {
  if (primaryValue === undefined && aliasValue === undefined) {
    throw malformed(`${primaryLabel} or ${aliasLabel} is required`);
  }
  const primary = primaryValue === undefined
    ? undefined
    : nonnegativeSafeInteger(primaryValue, primaryLabel);
  const alias = aliasValue === undefined
    ? undefined
    : nonnegativeSafeInteger(aliasValue, aliasLabel);
  if (primary !== undefined && alias !== undefined && primary !== alias) {
    throw malformed(`${primaryLabel} and ${aliasLabel} disagree`);
  }
  return primary ?? alias!;
}

function reconcileTransactionBlockId(
  raw: Record<string, unknown>,
  label: string,
): string {
  const aliases = [
    ['headerId', raw.headerId],
    ['blockId', raw.blockId],
    ['inclusionBlockId', raw.inclusionBlockId],
  ] as const;
  const present = aliases
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ({
      name,
      value: fixedLowerHex(value, 32, `${label} ${name}`),
    }));
  if (present.length === 0) {
    throw malformed(`${label} headerId, blockId, or inclusionBlockId is required`);
  }
  if (present.some(entry => entry.value !== present[0].value)) {
    throw malformed(`${label} inclusion block ID aliases disagree`);
  }
  return present[0].value;
}

function normalizeLegacyHistory(
  values: unknown[],
  expectedTreeHex: string,
  snapshotHeight: number,
): BaseHistoryBox[] {
  const history = values.map((value, index) => {
    const label = `indexed legacy MCL box ${index}`;
    const raw = record(value, label);
    const creationHeight = nonnegativeSafeInteger(raw.creationHeight, `${label} creation height`);
    if (creationHeight > snapshotHeight) throw malformed(`${label} was created after the snapshot`);
    if (variableLowerHex(raw.ergoTree, `${label} ErgoTree`) !== expectedTreeHex) {
      throw malformed(`${label} uses an unexpected ErgoTree`);
    }
    return {
      boxIdHex: fixedLowerHex(raw.boxId, 32, `${label} box ID`),
      spentTransactionIdHex: nullableSpentTransactionId(raw.spentTransactionId, label),
    };
  });
  assertUnique(history.map(box => box.boxIdHex), 'indexed legacy MCL box IDs');
  return history;
}

function normalizeCurrentSet(values: unknown[], expectedTreeHex: string, label: string): string[] {
  const ids = values.map((value, index) => {
    const raw = record(value, `${label} box ${index}`);
    if (raw.spentTransactionId !== undefined && raw.spentTransactionId !== null) {
      throw malformed(`${label} box ${index} must be unspent`);
    }
    if (variableLowerHex(raw.ergoTree, `${label} box ${index} ErgoTree`) !== expectedTreeHex) {
      throw malformed(`${label} box ${index} uses an unexpected ErgoTree`);
    }
    return fixedLowerHex(raw.boxId, 32, `${label} box ${index} ID`);
  }).sort();
  assertUnique(ids, `${label} box IDs`);
  return ids;
}

function assertCurrentSetMatchesHistory(
  history: BaseHistoryBox[],
  currentIds: string[],
  label: string,
): void {
  const expected = history
    .filter(box => box.spentTransactionIdHex === null)
    .map(box => box.boxIdHex)
    .sort();
  if (canonicalJson(expected) !== canonicalJson(currentIds)) {
    throw malformed(`${label} indexed history and current UTXO set disagree`);
  }
}

function collectBlockers(
  primary: SourceObservation,
  witness: SourceObservation,
  exactObservationAgreement: boolean,
): PegInRouteObservationBlocker[] {
  const blockers: PegInRouteObservationBlocker[] = [];
  if (!primary.stable || !witness.stable) {
    blockers.push({
      code: 'blocked_node_view_unstable',
      message: 'one or both source snapshots changed during route observation',
    });
  }
  if (!exactObservationAgreement) {
    blockers.push({
      code: 'blocked_source_disagreement',
      message: 'primary and witness route observations do not match exactly',
    });
  }
  if (primary.activeHistory.length === 0) {
    blockers.push({
      code: 'blocked_no_active_route_history',
      message: 'the declared active MainChainLock has no indexed deposit history',
    });
  }
  if (primary.activeHistory.some(deposit => deposit.classification === 'unresolved')) {
    blockers.push({
      code: 'blocked_transition_unresolved',
      message: 'one or more spent MainChainLock deposits lack an exact commit or refund transition',
    });
  }
  if (primary.activeHistory.some(deposit => deposit.classification === 'commit_pending')) {
    blockers.push({
      code: 'blocked_commit_pending',
      message: 'one or more exact MainChainLock-to-vault transitions have insufficient confirmations',
    });
  }
  if (!primary.activeHistory.some(deposit => deposit.classification === 'committed')) {
    blockers.push({
      code: 'blocked_no_committed_transition',
      message: 'no exact on-chain MainChainLock-to-vault transition was observed',
    });
  }
  if (primary.legacyRoutes.some(route => route.currentBoxIdsHex.length > 0)) {
    blockers.push({
      code: 'blocked_legacy_mcl_utxo_present',
      message: 'one or more declared legacy refundable MainChainLock UTXOs remain unspent',
    });
  }
  return blockers;
}

function summarize(payload: SourceObservationPayload): PegInRouteObservationAssessment['summary'] {
  const count = (classification: ObservedPegInRouteDeposit['classification']): number =>
    payload.activeHistory.filter(deposit => deposit.classification === classification).length;
  return {
    activeDepositsObserved: payload.activeHistory.length,
    refundableDeposits: count('refundable'),
    pendingCommitDeposits: count('commit_pending'),
    committedDeposits: count('committed'),
    refundedDeposits: count('refunded'),
    unresolvedDeposits: count('unresolved'),
    legacyCurrentUtxos: payload.legacyRoutes
      .reduce((sum, route) => sum + route.currentBoxIdsHex.length, 0),
  };
}

async function captureSnapshot(
  source: PegInRouteObservationSource,
  label: string,
): Promise<RouteSnapshot> {
  let info: Record<string, unknown>;
  let index: Record<string, unknown>;
  let header: Record<string, unknown>;
  try {
    [info, index, header] = await Promise.all([
      source.getInfo().then(value => record(value, `${label} node info`)),
      source.getIndexedHeight().then(value => record(value, `${label} index progress`)),
      source.getBestHeader().then(value => record(value, `${label} best header`)),
    ]);
  } catch (error) {
    throw blocked('blocked_node_view_unstable', error, `${label} snapshot is unavailable`);
  }
  const network = lowerSlug(info.network ?? info.networkType, `${label} network`);
  const infoHeight = nonnegativeSafeInteger(info.fullHeight, `${label} node full height`);
  const indexedHeight = nonnegativeSafeInteger(index.indexedHeight, `${label} indexed height`);
  const fullHeight = nonnegativeSafeInteger(index.fullHeight, `${label} indexed full height`);
  const tip = {
    height: nonnegativeSafeInteger(header.height, `${label} best-header height`),
    idHex: fixedLowerHex(header.id, 32, `${label} best-header ID`),
  };
  if (indexedHeight !== fullHeight) {
    throw new PegInRouteObservationBlockedError(
      'blocked_index_unsynchronized',
      `${label} extra index is not synchronized with full height`,
    );
  }
  if (infoHeight !== fullHeight || tip.height !== fullHeight) {
    throw new PegInRouteObservationBlockedError(
      'blocked_node_view_unstable',
      `${label} info, index, and best header do not identify one height`,
    );
  }
  return { network, indexedHeight, fullHeight, tip };
}

async function observeAnchor(
  source: PegInRouteObservationSource,
  snapshot: RouteSnapshot,
  manifest: PegInRouteManifestV1,
  label: string,
): Promise<{ observation: SourceObservation['anchorHeader'] }> {
  const expected = manifest.network.anchorHeader;
  if (expected.height > snapshot.fullHeight) {
    throw new PegInRouteObservationBlockedError(
      'blocked_anchor_policy',
      `${label} manifest anchor is above the synchronized tip`,
    );
  }
  let ids: string[];
  try {
    ids = (await source.getBlockHeaderIdsAtHeight(expected.height))
      .map((id, index) => fixedLowerHex(id, 32, `${label} anchor ID ${index}`));
  } catch (error) {
    throw blocked('blocked_anchor_policy', error, `${label} anchor observation failed`);
  }
  if (ids.length !== 1 || ids[0] !== expected.idHex) {
    throw new PegInRouteObservationBlockedError(
      'blocked_anchor_policy',
      `${label} canonical anchor does not match the manifest`,
    );
  }
  const depth = snapshot.fullHeight - expected.height + 1;
  if (depth < expected.minimumDepth || depth > expected.maximumAgeBlocks) {
    throw new PegInRouteObservationBlockedError(
      'blocked_anchor_policy',
      `${label} anchor depth is outside the manifest freshness window`,
    );
  }
  return {
    observation: {
      height: expected.height,
      expectedIdHex: expected.idHex,
      observedIdsHex: ids,
      depthAtSnapshot: depth,
    },
  };
}

function assertExpectedNetwork(
  snapshot: RouteSnapshot,
  manifest: PegInRouteManifestV1,
  label: string,
): void {
  if (snapshot.network !== manifest.network.nodeInfoNetwork) {
    throw new PegInRouteObservationBlockedError(
      'blocked_network_mismatch',
      `${label} node network does not match the manifest`,
    );
  }
}

function sourcePayloadDigest(
  payload: SourceObservationPayload,
  anchor: SourceObservation['anchorHeader'],
): string {
  return sha256CanonicalJson({ anchor, payload }, 'ERGO-BRIDGE-PEG-IN-ROUTE-OBSERVATION-V1');
}

function decodeP2sAddress(
  value: unknown,
  networkPrefix: 0 | 16,
  label: string,
): { address: string; ergoTreeHex: string } {
  if (typeof value !== 'string') throw malformed(`${label} must be a string`);
  let address: ErgoAddress;
  try {
    address = ErgoAddress.fromBase58(value);
  } catch {
    throw malformed(`${label} must be valid base58`);
  }
  if (Number(address.network) !== networkPrefix || Number(address.type) !== AddressType.P2S) {
    throw malformed(`${label} must be P2S on the manifest network`);
  }
  return { address: value, ergoTreeHex: address.ergoTree.toLowerCase() };
}

function exactRegisters(value: unknown, label: string): Record<'R4' | 'R5' | 'R6' | 'R7', string> {
  const raw = record(value, `${label} registers`);
  if (canonicalJson(Object.keys(raw).sort()) !== canonicalJson(['R4', 'R5', 'R6', 'R7'])) {
    throw malformed(`${label} registers must be exactly R4-R7`);
  }
  const normalized = {} as Record<'R4' | 'R5' | 'R6' | 'R7', string>;
  for (const key of ['R4', 'R5', 'R6', 'R7'] as const) {
    const rawValue = raw[key];
    const serialized = typeof rawValue === 'string'
      ? rawValue
      : record(rawValue, `${label} ${key}`).serializedValue;
    if (typeof serialized !== 'string') throw malformed(`${label} ${key} must be serialized`);
    normalized[key] = serialized;
  }
  return normalized;
}

function assertPureErg(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length !== 0) throw malformed(`${label} must be empty`);
}

function nullableSpentTransactionId(value: unknown, label: string): string | null {
  return value === null || value === undefined
    ? null
    : fixedLowerHex(value, 32, `${label} spending transaction ID`);
}

function record(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw malformed(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function fixedLowerHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || value.length !== bytes * 2 || !/^[0-9a-f]+$/.test(value)) {
    throw malformed(`${label} must be ${bytes}-byte canonical lowercase hex`);
  }
  return value;
}

function fixedLowerHexOrBlock(
  value: unknown,
  bytes: number,
  label: string,
  classification: PegInRouteObservationClassification,
): string {
  try {
    return fixedLowerHex(value, bytes, label);
  } catch (error) {
    throw blocked(classification, error, `${label} is invalid`);
  }
}

function variableLowerHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length < 2
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(value)
  ) throw malformed(`${label} must be non-empty canonical lowercase even-length hex`);
  return value;
}

function positiveBigInt(value: unknown, label: string): bigint {
  let normalized: bigint;
  try {
    if (typeof value === 'bigint') normalized = value;
    else if (typeof value === 'number' && Number.isSafeInteger(value)) normalized = BigInt(value);
    else if (typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value)) {
      normalized = BigInt(value);
    } else throw new Error('invalid');
  } catch {
    throw malformed(`${label} must be a canonical positive integer`);
  }
  if (normalized <= 0n || normalized > 0x7fff_ffff_ffff_ffffn) {
    throw malformed(`${label} must fit a positive signed Long`);
  }
  return normalized;
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw malformed(`${label} must be a nonnegative safe integer`);
  }
  return Number(value);
}

function lowerSlug(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(value)) {
    throw malformed(`${label} must be a lowercase identifier`);
  }
  return value;
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw malformed(`${label} must be unique`);
}

function assertPairedBudgets(source: PegInRouteObservationSource, label: string): void {
  if (
    Boolean(source.beginAuthenticatedTrackerReconstruction)
    !== Boolean(source.endAuthenticatedTrackerReconstruction)
  ) throw new Error(`${label} source reconstruction budget hooks must be paired`);
}

function snapshotIdentity(snapshot: RouteSnapshot): string {
  return canonicalJson(snapshot);
}

function canonicalHttpOrigin(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} is required`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) origin`);
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || (parsed.pathname !== '' && parsed.pathname !== '/')
    || parsed.search
    || parsed.hash
  ) throw new Error(`${label} must be a credential-free root HTTP(S) origin`);
  return parsed.origin;
}

function canonicalIsoTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error('generatedAt must be a canonical UTC ISO timestamp');
  }
  if (new Date(value).toISOString() !== value) throw new Error('generatedAt is not a real timestamp');
  return value;
}

function malformed(message: string): PegInRouteObservationBlockedError {
  return new PegInRouteObservationBlockedError('blocked_box_malformed', message);
}

function blocked(
  classification: PegInRouteObservationClassification,
  error: unknown,
  prefix: string,
): PegInRouteObservationBlockedError {
  const detail = error instanceof Error ? error.message : String(error);
  return new PegInRouteObservationBlockedError(classification, `${prefix}: ${detail}`);
}
