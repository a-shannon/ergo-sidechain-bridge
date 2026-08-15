import {
  collectLegacyMcuInventory,
  type LegacyMcuInventoryClient,
  type LegacyMcuInventoryReport,
} from './legacy-mcu-inventory.js';
import {
  legacyMcuCutoverManifestDigestHex,
  validateLegacyMcuCutoverManifest,
  type LegacyMcuCutoverManifestV1,
} from './legacy-mcu-cutover-manifest.js';

export type LegacyMcuCutoverClassification =
  | 'blocked_manifest_invalid'
  | 'blocked_manifest_digest_mismatch'
  | 'blocked_source_identity'
  | 'blocked_network_mismatch'
  | 'blocked_anchor_policy'
  | 'blocked_index_unsynchronized'
  | 'blocked_node_view_unstable'
  | 'blocked_source_disagreement'
  | 'blocked_query_failure'
  | 'blocked_box_malformed'
  | 'blocked_script_mismatch'
  | 'blocked_legacy_utxo_present'
  | 'observation_condition_met_under_explicit_manifest';

export interface LegacyMcuCutoverSource extends LegacyMcuInventoryClient {
  readonly observationSourceId: string;
  getInfo(): Promise<unknown>;
  getIndexedHeight(): Promise<unknown>;
  getBestHeader(): Promise<unknown>;
  getBlockHeaderIdsAtHeight(height: number): Promise<string[]>;
}

interface LegacyMcuCutoverTip {
  height: number;
  idHex: string;
}

interface LegacyMcuCutoverSnapshot {
  network: string;
  indexedHeight: number;
  fullHeight: number;
  tip: LegacyMcuCutoverTip;
}

interface LegacyMcuCutoverSourceObservation {
  sourceId: string;
  snapshotBefore: LegacyMcuCutoverSnapshot;
  snapshotAfter: LegacyMcuCutoverSnapshot;
  stable: boolean;
  anchorHeader: {
    height: number;
    expectedIdHex: string;
    observedIdsHex: string[];
    depthAtSnapshot: number;
  };
  inventory: LegacyMcuInventoryReport;
}

export interface LegacyMcuCutoverBlocker {
  code: Exclude<
    LegacyMcuCutoverClassification,
    'observation_condition_met_under_explicit_manifest'
  >;
  message: string;
}

export interface LegacyMcuCutoverAssessment {
  schemaVersion: 1;
  kind: 'legacy-mcu-cutover-assessment';
  generatedAt: string;
  manifest: {
    manifestId: string;
    schemaVersion: string;
    profile: 'legacy-mcu-v1';
    computedSha256Hex: string;
    expectedSha256Hex: string;
    coverageMode: 'complete_historical_v1_mcu_address_script_set';
    declaredEntryCount: number;
    cutoffSourceRevision: string;
  };
  networkObservation: {
    networkId: string;
    expectedNodeInfoNetwork: string;
    policy: {
      requiredDistinctOrigins: 2;
      synchronizedExtraIndexRequired: true;
      exactSourceAgreementRequired: true;
      minimumAnchorDepth: number;
      maximumAnchorAgeBlocks: number;
    };
    primary: LegacyMcuCutoverSourceObservation;
    witness: LegacyMcuCutoverSourceObservation;
    exactSourceAgreement: boolean;
  };
  contractBindings: Array<{
    ordinal: number;
    address: string;
    ergoTreeHex: string;
    ergoTreeSha256Hex: string;
  }>;
  decision: {
    classification: LegacyMcuCutoverClassification;
    observationConditionMet: boolean;
    cutoverAuthorized: false;
    blockers: LegacyMcuCutoverBlocker[];
    statement: string;
  };
  boundary: {
    readOnly: true;
    distinctSourceOriginsRequired: true;
    sourceOperationalIndependenceAuthenticated: false;
    independentSourceOperationProven: false;
    canonicalConsensusProven: false;
    completePaginatedAddressQueriesRequired: true;
    synchronizedExtraIndexesRequired: true;
    manifestAnchorDepthPolicyEnforced: true;
    expectedManifestDigestMatched: true;
    manifestCompletenessProvenByTool: false;
    manifestReviewApprovalBound: false;
    cutoverAuthorized: false;
    foundBoxClassification: 'quarantined';
    receiptPresenceVerified: false;
    migrationInferred: false;
    transactionOperationsPerformed: false;
    fundsAuthorityGranted: false;
    deploymentActivationClaimed: false;
    productionReadinessClaimed: false;
  };
}

export interface AssessLegacyMcuCutoverInput {
  manifest: LegacyMcuCutoverManifestV1;
  expectedManifestSha256Hex: string;
  primarySource: LegacyMcuCutoverSource;
  witnessSource: LegacyMcuCutoverSource;
  generatedAt?: string;
}

export class LegacyMcuCutoverBlockedError extends Error {
  constructor(
    readonly classification: LegacyMcuCutoverClassification,
    message: string,
  ) {
    super(message);
    this.name = 'LegacyMcuCutoverBlockedError';
  }
}

export async function assessLegacyMcuCutover(
  input: AssessLegacyMcuCutoverInput,
): Promise<LegacyMcuCutoverAssessment> {
  let manifest: LegacyMcuCutoverManifestV1;
  try {
    manifest = validateLegacyMcuCutoverManifest(input.manifest);
  } catch (error) {
    throw blocked(
      'blocked_manifest_invalid',
      error,
      'legacy MCU manifest is invalid',
    );
  }
  let expectedSha256Hex: string;
  try {
    expectedSha256Hex = fixedLowerHex(
      input.expectedManifestSha256Hex,
      32,
      'expected manifest SHA-256',
    );
  } catch (error) {
    throw blocked(
      'blocked_manifest_digest_mismatch',
      error,
      'expected manifest digest is invalid',
    );
  }
  const computedSha256Hex = legacyMcuCutoverManifestDigestHex(manifest);
  if (computedSha256Hex !== expectedSha256Hex) {
    throw new LegacyMcuCutoverBlockedError(
      'blocked_manifest_digest_mismatch',
      'computed legacy MCU manifest digest does not match the caller-supplied expected digest',
    );
  }
  if (input.primarySource === input.witnessSource) {
    throw new LegacyMcuCutoverBlockedError(
      'blocked_source_identity',
      'legacy MCU cutover assessment requires distinct source instances',
    );
  }
  const primarySourceId = canonicalHttpOrigin(
    input.primarySource.observationSourceId,
    'primary source ID',
  );
  const witnessSourceId = canonicalHttpOrigin(
    input.witnessSource.observationSourceId,
    'witness source ID',
  );
  if (primarySourceId === witnessSourceId) {
    throw new LegacyMcuCutoverBlockedError(
      'blocked_source_identity',
      'legacy MCU cutover assessment requires distinct source origins',
    );
  }
  const generatedAt = canonicalIsoTimestamp(input.generatedAt ?? new Date().toISOString());

  const [primaryBefore, witnessBefore] = await Promise.all([
    captureSyncedSnapshot(input.primarySource, 'primary before'),
    captureSyncedSnapshot(input.witnessSource, 'witness before'),
  ]);
  assertExpectedNetwork(primaryBefore, manifest, 'primary');
  assertExpectedNetwork(witnessBefore, manifest, 'witness');
  if (snapshotIdentity(primaryBefore) !== snapshotIdentity(witnessBefore)) {
    throw new LegacyMcuCutoverBlockedError(
      'blocked_source_disagreement',
      'primary and witness sources do not identify the same synchronized starting snapshot',
    );
  }

  const [primaryAnchor, witnessAnchor] = await Promise.all([
    observeManifestAnchor(input.primarySource, primaryBefore, manifest, 'primary'),
    observeManifestAnchor(input.witnessSource, witnessBefore, manifest, 'witness'),
  ]);
  const addresses = manifest.entries.map(entry => entry.address);
  const [primaryInventory, witnessInventory] = await Promise.all([
    collectLegacyMcuInventory({
      addresses,
      client: input.primarySource,
      currentHeight: primaryBefore.fullHeight,
      currentHeightSource: 'manifest-snapshot',
      generatedAt,
    }),
    collectLegacyMcuInventory({
      addresses,
      client: input.witnessSource,
      currentHeight: witnessBefore.fullHeight,
      currentHeightSource: 'manifest-snapshot',
      generatedAt,
    }),
  ]);
  const [primaryAfter, witnessAfter] = await Promise.all([
    captureSyncedSnapshot(input.primarySource, 'primary after'),
    captureSyncedSnapshot(input.witnessSource, 'witness after'),
  ]);

  const primaryStable = snapshotIdentity(primaryBefore) === snapshotIdentity(primaryAfter);
  const witnessStable = snapshotIdentity(witnessBefore) === snapshotIdentity(witnessAfter);
  const exactSourceAgreement = snapshotIdentity(primaryAfter) === snapshotIdentity(witnessAfter)
    && primaryAnchor.identity === witnessAnchor.identity;

  const blockers: LegacyMcuCutoverBlocker[] = [];
  if (!primaryStable || !witnessStable) {
    blockers.push({
      code: 'blocked_node_view_unstable',
      message: 'one or both node/index snapshots changed during the inventory',
    });
  }
  if (!exactSourceAgreement) {
    blockers.push({
      code: 'blocked_source_disagreement',
      message: 'primary and witness sources do not agree on the ending snapshot and anchor',
    });
  }
  appendInventoryBlockers(blockers, primaryInventory, manifest, 'primary');
  appendInventoryBlockers(blockers, witnessInventory, manifest, 'witness');

  const classification = blockers[0]?.code
    ?? 'observation_condition_met_under_explicit_manifest';
  const observationConditionMet = blockers.length === 0;
  return {
    schemaVersion: 1,
    kind: 'legacy-mcu-cutover-assessment',
    generatedAt,
    manifest: {
      manifestId: manifest.manifestId,
      schemaVersion: manifest.schemaVersion,
      profile: 'legacy-mcu-v1',
      computedSha256Hex,
      expectedSha256Hex,
      coverageMode: manifest.coverage.mode,
      declaredEntryCount: manifest.coverage.declaredEntryCount,
      cutoffSourceRevision: manifest.coverage.cutoff.sourceRevision,
    },
    networkObservation: {
      networkId: manifest.network.id,
      expectedNodeInfoNetwork: manifest.network.nodeInfoNetwork,
      policy: {
        requiredDistinctOrigins: 2,
        synchronizedExtraIndexRequired: true,
        exactSourceAgreementRequired: true,
        minimumAnchorDepth: manifest.network.anchorHeader.minimumDepth,
        maximumAnchorAgeBlocks: manifest.network.anchorHeader.maximumAgeBlocks,
      },
      primary: {
        sourceId: primarySourceId,
        snapshotBefore: primaryBefore,
        snapshotAfter: primaryAfter,
        stable: primaryStable,
        anchorHeader: primaryAnchor.observation,
        inventory: primaryInventory,
      },
      witness: {
        sourceId: witnessSourceId,
        snapshotBefore: witnessBefore,
        snapshotAfter: witnessAfter,
        stable: witnessStable,
        anchorHeader: witnessAnchor.observation,
        inventory: witnessInventory,
      },
      exactSourceAgreement,
    },
    contractBindings: manifest.entries.map(entry => ({
      ordinal: entry.ordinal,
      address: entry.address,
      ergoTreeHex: entry.ergoTreeHex,
      ergoTreeSha256Hex: entry.ergoTreeSha256Hex,
    })),
    decision: {
      classification,
      observationConditionMet,
      cutoverAuthorized: false,
      blockers,
      statement: observationConditionMet
        ? 'The non-authorizing zero-legacy-UTXO observation condition is met under the explicit manifest and two bound origins.'
        : 'The legacy MCU observation condition is blocked under the explicit manifest.',
    },
    boundary: {
      readOnly: true,
      distinctSourceOriginsRequired: true,
      sourceOperationalIndependenceAuthenticated: false,
      independentSourceOperationProven: false,
      canonicalConsensusProven: false,
      completePaginatedAddressQueriesRequired: true,
      synchronizedExtraIndexesRequired: true,
      manifestAnchorDepthPolicyEnforced: true,
      expectedManifestDigestMatched: true,
      manifestCompletenessProvenByTool: false,
      manifestReviewApprovalBound: false,
      cutoverAuthorized: false,
      foundBoxClassification: 'quarantined',
      receiptPresenceVerified: false,
      migrationInferred: false,
      transactionOperationsPerformed: false,
      fundsAuthorityGranted: false,
      deploymentActivationClaimed: false,
      productionReadinessClaimed: false,
    },
  };
}

async function captureSyncedSnapshot(
  source: LegacyMcuCutoverSource,
  label: string,
): Promise<LegacyMcuCutoverSnapshot> {
  let info: Record<string, unknown>;
  let progress: Record<string, unknown>;
  let header: Record<string, unknown>;
  try {
    [info, progress, header] = await Promise.all([
      source.getInfo().then(value => objectValue(value, `${label} node info`)),
      source.getIndexedHeight().then(value => objectValue(value, `${label} index progress`)),
      source.getBestHeader().then(value => objectValue(value, `${label} best header`)),
    ]);
  } catch (error) {
    throw blocked('blocked_node_view_unstable', error, `${label} snapshot is unavailable`);
  }
  const network = lowerSlug(info.network, `${label} node info network`);
  const infoFullHeight = nonnegativeSafeInteger(info.fullHeight, `${label} node full height`);
  const indexedHeight = nonnegativeSafeInteger(
    progress.indexedHeight,
    `${label} indexed height`,
  );
  const fullHeight = nonnegativeSafeInteger(progress.fullHeight, `${label} indexed full height`);
  const tip = {
    height: nonnegativeSafeInteger(header.height, `${label} best header height`),
    idHex: fixedLowerHex(header.id, 32, `${label} best header id`),
  };
  if (indexedHeight !== fullHeight) {
    throw new LegacyMcuCutoverBlockedError(
      'blocked_index_unsynchronized',
      `${label} extra index is not synchronized with full height`,
    );
  }
  if (infoFullHeight !== fullHeight || tip.height !== fullHeight) {
    throw new LegacyMcuCutoverBlockedError(
      'blocked_node_view_unstable',
      `${label} info, index progress, and best header do not identify one height`,
    );
  }
  return { network, indexedHeight, fullHeight, tip };
}

async function observeManifestAnchor(
  source: LegacyMcuCutoverSource,
  snapshot: LegacyMcuCutoverSnapshot,
  manifest: LegacyMcuCutoverManifestV1,
  label: string,
): Promise<{
  identity: string;
  observation: LegacyMcuCutoverSourceObservation['anchorHeader'];
}> {
  const expected = manifest.network.anchorHeader;
  if (expected.height > snapshot.fullHeight) {
    throw new LegacyMcuCutoverBlockedError(
      'blocked_anchor_policy',
      `${label} manifest anchor is above the synchronized node tip`,
    );
  }
  let observedIdsHex: string[];
  try {
    observedIdsHex = (await source.getBlockHeaderIdsAtHeight(expected.height))
      .map((id, index) => fixedLowerHex(id, 32, `${label} anchor header id ${index}`));
  } catch (error) {
    throw blocked('blocked_anchor_policy', error, `${label} anchor observation failed`);
  }
  if (observedIdsHex.length !== 1 || observedIdsHex[0] !== expected.idHex) {
    throw new LegacyMcuCutoverBlockedError(
      'blocked_anchor_policy',
      `${label} canonical header at the approved anchor height does not match the manifest`,
    );
  }
  const depthAtSnapshot = snapshot.fullHeight - expected.height;
  if (
    depthAtSnapshot < expected.minimumDepth
    || depthAtSnapshot > expected.maximumAgeBlocks
  ) {
    throw new LegacyMcuCutoverBlockedError(
      'blocked_anchor_policy',
      `${label} manifest anchor depth is outside the manifest freshness window`,
    );
  }
  const observation = {
    height: expected.height,
    expectedIdHex: expected.idHex,
    observedIdsHex,
    depthAtSnapshot,
  };
  return { identity: JSON.stringify(observation), observation };
}

function appendInventoryBlockers(
  blockers: LegacyMcuCutoverBlocker[],
  inventory: LegacyMcuInventoryReport,
  manifest: LegacyMcuCutoverManifestV1,
  label: string,
): void {
  if (!inventory.addressQueriesComplete) {
    blockers.push({
      code: 'blocked_query_failure',
      message: `${label} did not complete every paginated address query`,
    });
  }
  const expectedTrees = new Map(manifest.entries.map(entry => [entry.address, entry.ergoTreeHex]));
  const scriptMismatches = inventory.boxes.filter(box =>
    box.ergoTreeHex === null || box.ergoTreeHex !== expectedTrees.get(box.address));
  if (scriptMismatches.length > 0) {
    blockers.push({
      code: 'blocked_script_mismatch',
      message: `${label} returned ${scriptMismatches.length} box(es) outside their manifest ErgoTree`,
    });
  }
  const boxIds = inventory.boxes.flatMap(box => box.boxId === null ? [] : [box.boxId]);
  const duplicateBoxIds = boxIds.length - new Set(boxIds).size;
  if (inventory.summary.malformedBoxes > 0 || duplicateBoxIds > 0) {
    blockers.push({
      code: 'blocked_box_malformed',
      message: duplicateBoxIds > 0
        ? `${label} inventory contains duplicate box IDs`
        : `${label} inventory contains ${inventory.summary.malformedBoxes} malformed box(es)`,
    });
  }
  if (inventory.summary.boxesFound > 0) {
    blockers.push({
      code: 'blocked_legacy_utxo_present',
      message: `${label} reports ${inventory.summary.boxesFound} quarantined legacy MCU UTXO(s)`,
    });
  }
}

function assertExpectedNetwork(
  snapshot: LegacyMcuCutoverSnapshot,
  manifest: LegacyMcuCutoverManifestV1,
  label: string,
): void {
  if (snapshot.network !== manifest.network.nodeInfoNetwork) {
    throw new LegacyMcuCutoverBlockedError(
      'blocked_network_mismatch',
      `${label} node network does not match the manifest`,
    );
  }
}

function snapshotIdentity(snapshot: LegacyMcuCutoverSnapshot): string {
  return JSON.stringify(snapshot);
}

function canonicalHttpOrigin(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
    throw new LegacyMcuCutoverBlockedError(
      'blocked_source_identity',
      `${label} must be a canonical HTTP(S) origin`,
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new LegacyMcuCutoverBlockedError(
      'blocked_source_identity',
      `${label} must be a canonical HTTP(S) origin`,
    );
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || (parsed.pathname !== '' && parsed.pathname !== '/')
    || parsed.search
    || parsed.hash
    || parsed.origin !== value
  ) {
    throw new LegacyMcuCutoverBlockedError(
      'blocked_source_identity',
      `${label} must be a canonical credential-free HTTP(S) root origin`,
    );
  }
  return parsed.origin;
}

function canonicalIsoTimestamp(value: unknown): string {
  if (typeof value !== 'string') throw new Error('generatedAt must be an ISO timestamp');
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new Error('generatedAt must be a canonical ISO timestamp');
  }
  return value;
}

function blocked(
  classification: LegacyMcuCutoverClassification,
  error: unknown,
  fallback: string,
): LegacyMcuCutoverBlockedError {
  return new LegacyMcuCutoverBlockedError(
    classification,
    error instanceof Error ? error.message : fallback,
  );
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function lowerSlug(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(value)) {
    throw new Error(`${label} must be a lowercase identifier`);
  }
  return value;
}

function fixedLowerHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`${label} must be ${bytes}-byte lowercase hex`);
  }
  return value;
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(value);
}
