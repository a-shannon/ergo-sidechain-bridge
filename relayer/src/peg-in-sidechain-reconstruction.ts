/**
 * Reconstruct Frontier PegIn history against one live, provenance-bound Ergo
 * route view. This module is read-only and cannot authorize or submit a mint.
 */

import { ethers } from 'ethers';

import { canonicalNodeOrigin } from './ergo-node-endpoint-alignment.js';
import type { AssessPegInRouteObservationInput } from './peg-in-route-observation.js';
import {
  assertPegInRouteReconstructionProvenance,
  reconstructPegInRouteFromDistinctSources,
  type PegInRouteReconstruction,
  type PegInRouteReconstructionDeposit,
} from './peg-in-route-reconstruction.js';
import { sha256CanonicalJson } from './strict-json.js';

export const FRONTIER_PEG_IN_EVENT = 'PegIn(address,uint256,bytes32)';
export const FRONTIER_PEG_IN_EVENT_ABI =
  'event PegIn(address indexed to, uint256 amount, bytes32 ergoBoxId)';
export const FRONTIER_PEG_IN_TOPIC = ethers.id(FRONTIER_PEG_IN_EVENT).toLowerCase();
export const PEG_IN_SIDECHAIN_PROFILE_SCHEMA = 'e2s.peg-in-sidechain-profile.v1';
export const PEG_IN_SIDECHAIN_RECONSTRUCTION_SCHEMA =
  'e2s.peg-in-sidechain-reconstruction.v1';
export const PEG_IN_SIDECHAIN_RECONSTRUCTION_DIGEST_DOMAIN =
  'e2s.peg-in-sidechain-reconstruction.digest.v1';
export const MAX_PEG_IN_SIDECHAIN_EVENTS = 100_000;
const FRONTIER_PEG_IN_PROVIDER_OPTIONS = Object.freeze({
  cacheTimeout: -1,
  batchMaxCount: 1,
});

const bridgeInterface = new ethers.Interface([
  FRONTIER_PEG_IN_EVENT_ABI,
  'function processedPegIns(bytes32) view returns (bool)',
]);
const validatedReconstructions = new WeakSet<object>();

export interface PegInSidechainProfileV1 {
  readonly schema: typeof PEG_IN_SIDECHAIN_PROFILE_SCHEMA;
  readonly sidechainIdHex: string;
  readonly evmChainId: string;
  readonly bridgeAddress: string;
  readonly deploymentBlock: number;
  readonly requiredConfirmations: number;
  readonly maxEvents: number;
}

export interface PegInSidechainLogFilter {
  readonly address: string;
  readonly fromBlock: number;
  readonly toBlock: number;
  readonly topics: readonly string[];
}

export interface PegInSidechainBlockIdentity {
  readonly height: number;
  readonly idHex: string;
}

export interface PegInSidechainObservationSource {
  readonly observationSourceId: string;
  getChainId(): Promise<unknown>;
  getBlockNumber(): Promise<unknown>;
  getBlock(blockNumber: number): Promise<unknown | null>;
  getLogs(filter: PegInSidechainLogFilter): Promise<unknown[]>;
  getTransactionReceipt(transactionHash: string): Promise<unknown | null>;
  getProcessedPegIn(
    bridgeAddress: string,
    ergoBoxIdHex: string,
    block: PegInSidechainBlockIdentity,
  ): Promise<unknown>;
  destroy?(): void;
}

export interface CanonicalFrontierPegInEvent {
  readonly ergoBoxIdHex: string;
  readonly recipientAddress: string;
  readonly amountNanoErg: string;
  readonly transactionHashHex: string;
  readonly blockNumber: number;
  readonly blockHashHex: string;
  readonly logIndex: number;
  readonly confirmations: number;
  readonly confirmationStatus: 'pending' | 'confirmed_by_depth';
}

export type PegInCrossChainState =
  | 'committed_unminted'
  | 'mint_pending'
  | 'mint_confirmed_by_depth'
  | 'refundable_unminted'
  | 'commit_pending_unminted'
  | 'refunded_unminted'
  | 'unresolved_unminted'
  | 'invalid_event_semantics'
  | 'invalid_event_without_processed_state'
  | 'invalid_processed_state_without_event'
  | 'invalid_mint_without_committed_vault'
  | 'legacy_unminted'
  | 'legacy_invalid_event_without_processed_state'
  | 'legacy_invalid_processed_state_without_event'
  | 'legacy_mint_observed_unverifiable';

export interface PegInCrossChainEntry {
  readonly ergoBoxIdHex: string;
  readonly routeKind: 'active' | 'legacy';
  readonly routeClassification: PegInRouteReconstructionDeposit['classification'] | 'legacy';
  readonly processedAtObservedTip: boolean;
  readonly state: PegInCrossChainState;
  readonly event: CanonicalFrontierPegInEvent | null;
}

export type PegInSidechainIssueCode =
  | 'event_semantics_mismatch'
  | 'event_without_processed_state'
  | 'processed_state_without_event'
  | 'mint_without_committed_vault'
  | 'legacy_refundable_mint'
  | 'legacy_mint_semantics_unverifiable'
  | 'unknown_peg_in_event';

export interface PegInSidechainIssue {
  readonly code: PegInSidechainIssueCode;
  readonly ergoBoxIdHex: string;
  readonly message: string;
}

export interface PegInSidechainReconstruction {
  readonly schema: typeof PEG_IN_SIDECHAIN_RECONSTRUCTION_SCHEMA;
  readonly observedAt: string;
  readonly profile: PegInSidechainProfileV1;
  readonly ergoRouteReconstructionDigestHex: string;
  readonly frontierViewDigestHex: string;
  readonly frontierSourceIds: readonly string[];
  readonly observedTip: Readonly<{ height: number; idHex: string }>;
  readonly entries: readonly PegInCrossChainEntry[];
  readonly issues: readonly PegInSidechainIssue[];
  readonly decision: Readonly<{
    classification: 'reconstruction_consistent' | 'blocked_inconsistent_mint_history';
    exactCrossChainHistoryAgreement: boolean;
  }>;
  readonly reconstructionDigestHex: string;
  readonly boundary: Readonly<{
    readOnlyObservation: true;
    localOrPersistedStateDoesNotAuthorizeMint: true;
    ergoRouteReobservedAfterFrontier: true;
    frontierTipsRecheckedAfterErgo: true;
    processedBooleanAloneDoesNotProveMint: true;
    confirmationDepthDoesNotProveGrandpaFinality: true;
    distinctOriginsDoNotProveIndependentOperationOrConsensus: true;
    noCheckerSignerSubmitterOrBroadcastCapability: true;
  }>;
}

export type PegInSidechainReconstructionSemantic = Omit<
  PegInSidechainReconstruction,
  'observedAt' | 'reconstructionDigestHex'
>;

type NormalizedProfile = PegInSidechainProfileV1;

interface SourceViewSemantic {
  readonly chainId: string;
  readonly tip: Readonly<{ height: number; idHex: string }>;
  readonly events: readonly CanonicalFrontierPegInEvent[];
  readonly processed: readonly Readonly<{
    ergoBoxIdHex: string;
    processed: boolean;
  }>[];
}

interface SourceView {
  readonly sourceId: string;
  readonly semantic: SourceViewSemantic;
  readonly viewDigestHex: string;
}

const BOUNDARY = deepFreeze({
  readOnlyObservation: true as const,
  localOrPersistedStateDoesNotAuthorizeMint: true as const,
  ergoRouteReobservedAfterFrontier: true as const,
  frontierTipsRecheckedAfterErgo: true as const,
  processedBooleanAloneDoesNotProveMint: true as const,
  confirmationDepthDoesNotProveGrandpaFinality: true as const,
  distinctOriginsDoNotProveIndependentOperationOrConsensus: true as const,
  noCheckerSignerSubmitterOrBroadcastCapability: true as const,
});

export function pegInSidechainReconstructionDigestHex(
  semantic: PegInSidechainReconstructionSemantic,
): string {
  return sha256CanonicalJson(
    semantic,
    PEG_IN_SIDECHAIN_RECONSTRUCTION_DIGEST_DOMAIN,
  );
}

export function createReadOnlyFrontierPegInSource(
  rpcUrl: string,
): PegInSidechainObservationSource {
  const observationSourceId = canonicalNodeOrigin(
    rpcUrl,
    'Frontier peg-in observation RPC URL',
  );
  const provider = new ethers.JsonRpcProvider(
    observationSourceId,
    undefined,
    FRONTIER_PEG_IN_PROVIDER_OPTIONS,
  );
  return {
    observationSourceId,
    async getChainId(): Promise<bigint> {
      return (await provider.getNetwork()).chainId;
    },
    async getBlockNumber(): Promise<number> {
      return provider.getBlockNumber();
    },
    async getBlock(blockNumber: number): Promise<unknown | null> {
      return provider.getBlock(blockNumber);
    },
    async getLogs(filter: PegInSidechainLogFilter): Promise<unknown[]> {
      return provider.getLogs({
        address: filter.address,
        fromBlock: filter.fromBlock,
        toBlock: filter.toBlock,
        topics: [...filter.topics],
      });
    },
    async getTransactionReceipt(transactionHash: string): Promise<unknown | null> {
      return provider.getTransactionReceipt(transactionHash);
    },
    async getProcessedPegIn(
      bridgeAddress: string,
      ergoBoxIdHex: string,
      block: PegInSidechainBlockIdentity,
    ): Promise<boolean> {
      const data = bridgeInterface.encodeFunctionData('processedPegIns', [
        `0x${normalizeFixedHex(ergoBoxIdHex, 32, 'processed peg-in box ID')}`,
      ]);
      // Pinned Frontier resolves this EIP-1898 hash only through its canonical
      // native-block mapping; the observer still brackets it with tip rechecks.
      const result = await provider.send('eth_call', [
        { to: bridgeAddress, data },
        {
          blockHash: `0x${normalizeFixedHex(
            block.idHex,
            32,
            'processed peg-in block hash',
          )}`,
          requireCanonical: true,
        },
      ]);
      return Boolean(bridgeInterface.decodeFunctionResult('processedPegIns', result)[0]);
    },
    destroy(): void {
      provider.destroy();
    },
  };
}

export async function reconstructPegInSidechainHistory(input: {
  profile: PegInSidechainProfileV1;
  ergoRoute: PegInRouteReconstruction;
  primarySource: PegInSidechainObservationSource;
  witnessSource: PegInSidechainObservationSource;
  ergoRouteReobservationInput: AssessPegInRouteObservationInput;
  observedAt: string;
}): Promise<PegInSidechainReconstruction> {
  assertPegInRouteReconstructionProvenance(input.ergoRoute);
  const profile = normalizeProfile(input.profile);
  const observedAt = normalizeCanonicalIsoTimestamp(input.observedAt, 'peg-in sidechain observation time');
  if (input.primarySource === input.witnessSource) {
    throw new Error('peg-in sidechain reconstruction requires distinct source instances');
  }
  const primarySourceId = canonicalNodeOrigin(
    input.primarySource.observationSourceId,
    'primary Frontier peg-in source',
  );
  const witnessSourceId = canonicalNodeOrigin(
    input.witnessSource.observationSourceId,
    'witness Frontier peg-in source',
  );
  if (primarySourceId === witnessSourceId) {
    throw new Error('peg-in sidechain reconstruction requires distinct source origins');
  }

  const routeBoxIds = routeBoxIdSet(input.ergoRoute);
  const [primary, witness] = await Promise.all([
    observeSource(input.primarySource, primarySourceId, profile, routeBoxIds),
    observeSource(input.witnessSource, witnessSourceId, profile, routeBoxIds),
  ]);
  if (primary.viewDigestHex !== witness.viewDigestHex) {
    throw new Error('Frontier peg-in sources disagree on the exact stable view');
  }

  const refreshedErgoRoute = await reconstructPegInRouteFromDistinctSources(
    input.ergoRouteReobservationInput,
  );
  assertPegInRouteReconstructionProvenance(refreshedErgoRoute);
  if (
    refreshedErgoRoute.reconstructionDigestHex
    !== input.ergoRoute.reconstructionDigestHex
  ) {
    throw new Error('Ergo peg-in route changed during Frontier reconstruction');
  }
  await Promise.all([
    assertSourceTipStillMatches(
      input.primarySource,
      primary.semantic.tip,
      'primary Frontier peg-in source',
    ),
    assertSourceTipStillMatches(
      input.witnessSource,
      witness.semantic.tip,
      'witness Frontier peg-in source',
    ),
  ]);

  const { entries, issues } = joinErgoRouteToFrontierView(
    refreshedErgoRoute,
    primary.semantic,
  );
  const frontierSourceIds = Object.freeze([primarySourceId, witnessSourceId].sort());
  const decision = deepFreeze({
    classification: issues.length === 0
      ? 'reconstruction_consistent' as const
      : 'blocked_inconsistent_mint_history' as const,
    exactCrossChainHistoryAgreement: issues.length === 0,
  });
  const semantic: PegInSidechainReconstructionSemantic = {
    schema: PEG_IN_SIDECHAIN_RECONSTRUCTION_SCHEMA as typeof PEG_IN_SIDECHAIN_RECONSTRUCTION_SCHEMA,
    profile,
    ergoRouteReconstructionDigestHex: input.ergoRoute.reconstructionDigestHex,
    frontierViewDigestHex: primary.viewDigestHex,
    frontierSourceIds,
    observedTip: primary.semantic.tip,
    entries,
    issues,
    decision,
    boundary: BOUNDARY,
  };
  const reconstruction = deepFreeze<PegInSidechainReconstruction>({
    ...semantic,
    observedAt,
    reconstructionDigestHex: pegInSidechainReconstructionDigestHex(semantic),
  });
  validatedReconstructions.add(reconstruction);
  return reconstruction;
}

export function assertPegInSidechainReconstructionProvenance(
  value: unknown,
): asserts value is PegInSidechainReconstruction {
  if (!value || typeof value !== 'object' || !validatedReconstructions.has(value)) {
    throw new Error('peg-in sidechain reconstruction provenance is missing');
  }
}

/**
 * Revalidate a serialized reconstruction without granting live-observation
 * provenance. Persisted cache readers use this to reject malformed or
 * digest-inconsistent rows after restart.
 */
export function validatePegInSidechainReconstructionStructure(
  value: unknown,
): PegInSidechainReconstruction {
  const raw = record(value, 'peg-in sidechain reconstruction');
  assertExactKeys(raw, [
    'schema',
    'observedAt',
    'profile',
    'ergoRouteReconstructionDigestHex',
    'frontierViewDigestHex',
    'frontierSourceIds',
    'observedTip',
    'entries',
    'issues',
    'decision',
    'reconstructionDigestHex',
    'boundary',
  ], 'peg-in sidechain reconstruction');
  if (raw.schema !== PEG_IN_SIDECHAIN_RECONSTRUCTION_SCHEMA) {
    throw new Error('peg-in sidechain reconstruction schema is unsupported');
  }
  const profileValue = normalizeProfile(
    raw.profile as PegInSidechainProfileV1,
  );
  const observedTipRaw = record(raw.observedTip, 'peg-in sidechain observed tip');
  assertExactKeys(observedTipRaw, ['height', 'idHex'], 'peg-in sidechain observed tip');
  const observedTip = deepFreeze({
    height: normalizeSafeInteger(observedTipRaw.height, 'peg-in sidechain tip height'),
    idHex: normalizeFixedHex(observedTipRaw.idHex, 32, 'peg-in sidechain tip ID'),
  });
  if (observedTip.height < profileValue.deploymentBlock) {
    throw new Error('peg-in sidechain observed tip predates bridge deployment');
  }

  if (!Array.isArray(raw.frontierSourceIds) || raw.frontierSourceIds.length !== 2) {
    throw new Error('peg-in sidechain reconstruction requires exactly two source origins');
  }
  const frontierSourceIds = raw.frontierSourceIds.map((source, index) => canonicalNodeOrigin(
    source as string,
    `persisted Frontier peg-in source ${index}`,
  )).sort();
  if (frontierSourceIds[0] === frontierSourceIds[1]) {
    throw new Error('peg-in sidechain reconstruction source origins must be distinct');
  }
  if (canonicalStringArray(raw.frontierSourceIds as string[]) !== canonicalStringArray(frontierSourceIds)) {
    throw new Error('peg-in sidechain reconstruction source origins must be sorted');
  }

  if (!Array.isArray(raw.entries)) {
    throw new Error('peg-in sidechain reconstruction entries must be an array');
  }
  const seenBoxes = new Set<string>();
  const entries = raw.entries.map((entry, index) => normalizePersistedEntry(
    entry,
    index,
    profileValue,
    observedTip,
  )).sort((left, right) => compareHex(left.ergoBoxIdHex, right.ergoBoxIdHex));
  for (const entry of entries) {
    if (seenBoxes.has(entry.ergoBoxIdHex)) {
      throw new Error(`peg-in sidechain reconstruction repeats box ${entry.ergoBoxIdHex}`);
    }
    seenBoxes.add(entry.ergoBoxIdHex);
  }
  if (canonicalStringArray(
    (raw.entries as Array<{ ergoBoxIdHex?: unknown }>).map(entry => String(entry.ergoBoxIdHex)),
  ) !== canonicalStringArray(entries.map(entry => entry.ergoBoxIdHex))) {
    throw new Error('peg-in sidechain reconstruction entries must be sorted by box ID');
  }
  const eventCount = entries.filter(entry => entry.event !== null).length;
  if (eventCount > profileValue.maxEvents) {
    throw new Error('peg-in sidechain reconstruction exceeds its event bound');
  }

  if (!Array.isArray(raw.issues)) {
    throw new Error('peg-in sidechain reconstruction issues must be an array');
  }
  const issues = raw.issues.map((entry, index) => normalizePersistedIssue(entry, index));
  const sortedIssues = [...issues].sort((left, right) => (
    compareHex(left.ergoBoxIdHex, right.ergoBoxIdHex)
    || left.code.localeCompare(right.code)
  ));
  if (JSON.stringify(issues) !== JSON.stringify(sortedIssues)) {
    throw new Error('peg-in sidechain reconstruction issues must be canonically sorted');
  }

  const decisionRaw = record(raw.decision, 'peg-in sidechain reconstruction decision');
  assertExactKeys(
    decisionRaw,
    ['classification', 'exactCrossChainHistoryAgreement'],
    'peg-in sidechain reconstruction decision',
  );
  if (
    decisionRaw.classification !== 'reconstruction_consistent'
    && decisionRaw.classification !== 'blocked_inconsistent_mint_history'
  ) {
    throw new Error('peg-in sidechain reconstruction decision is unsupported');
  }
  const exactAgreement = normalizeBoolean(
    decisionRaw.exactCrossChainHistoryAgreement,
    'peg-in sidechain reconstruction agreement',
  );
  if (
    exactAgreement !== (issues.length === 0)
    || decisionRaw.classification !== (
      issues.length === 0
        ? 'reconstruction_consistent'
        : 'blocked_inconsistent_mint_history'
    )
  ) {
    throw new Error('peg-in sidechain reconstruction decision does not match its issues');
  }
  assertPersistedEntryIssueConsistency(entries, issues);

  const boundaryRaw = record(raw.boundary, 'peg-in sidechain reconstruction boundary');
  assertExactKeys(boundaryRaw, Object.keys(BOUNDARY), 'peg-in sidechain reconstruction boundary');
  for (const key of Object.keys(BOUNDARY)) {
    if (boundaryRaw[key] !== true) {
      throw new Error(`peg-in sidechain reconstruction boundary ${key} must remain true`);
    }
  }
  const boundary = BOUNDARY;
  const semantic: PegInSidechainReconstructionSemantic = {
    schema: PEG_IN_SIDECHAIN_RECONSTRUCTION_SCHEMA,
    profile: profileValue,
    ergoRouteReconstructionDigestHex: normalizeFixedHex(
      raw.ergoRouteReconstructionDigestHex,
      32,
      'peg-in sidechain Ergo route digest',
    ),
    frontierViewDigestHex: normalizeFixedHex(
      raw.frontierViewDigestHex,
      32,
      'peg-in sidechain Frontier view digest',
    ),
    frontierSourceIds: Object.freeze(frontierSourceIds),
    observedTip,
    entries: Object.freeze(entries),
    issues: Object.freeze(issues),
    decision: deepFreeze({
      classification: decisionRaw.classification,
      exactCrossChainHistoryAgreement: exactAgreement,
    }) as PegInSidechainReconstruction['decision'],
    boundary,
  };
  const reconstructionDigestHex = normalizeFixedHex(
    raw.reconstructionDigestHex,
    32,
    'peg-in sidechain reconstruction digest',
  );
  if (pegInSidechainReconstructionDigestHex(semantic) !== reconstructionDigestHex) {
    throw new Error('peg-in sidechain reconstruction digest does not match its semantics');
  }
  return deepFreeze({
    ...semantic,
    observedAt: normalizeCanonicalIsoTimestamp(
      raw.observedAt,
      'peg-in sidechain observation time',
    ),
    reconstructionDigestHex,
  });
}

function normalizePersistedEntry(
  value: unknown,
  index: number,
  profile: PegInSidechainProfileV1,
  observedTip: Readonly<{ height: number; idHex: string }>,
): PegInCrossChainEntry {
  const label = `persisted peg-in sidechain entry ${index}`;
  const raw = record(value, label);
  assertExactKeys(raw, [
    'ergoBoxIdHex',
    'routeKind',
    'routeClassification',
    'processedAtObservedTip',
    'state',
    'event',
  ], label);
  const ergoBoxIdHex = normalizeFixedHex(raw.ergoBoxIdHex, 32, `${label} box ID`);
  if (raw.routeKind !== 'active' && raw.routeKind !== 'legacy') {
    throw new Error(`${label} route kind is unsupported`);
  }
  if (![
    'refundable',
    'commit_pending',
    'committed',
    'refunded',
    'unresolved',
    'legacy',
  ].includes(String(raw.routeClassification))) {
    throw new Error(`${label} route classification is unsupported`);
  }
  const routeClassification = raw.routeClassification as PegInCrossChainEntry['routeClassification'];
  if ((raw.routeKind === 'legacy') !== (routeClassification === 'legacy')) {
    throw new Error(`${label} route kind and classification disagree`);
  }
  const processedAtObservedTip = normalizeBoolean(
    raw.processedAtObservedTip,
    `${label} processed state`,
  );
  const event = raw.event === null
    ? null
    : normalizePersistedEvent(raw.event, label, profile, observedTip);
  if (event !== null && event.ergoBoxIdHex !== ergoBoxIdHex) {
    throw new Error(`${label} event box ID differs from its joined route`);
  }
  if (![
    'committed_unminted',
    'mint_pending',
    'mint_confirmed_by_depth',
    'refundable_unminted',
    'commit_pending_unminted',
    'refunded_unminted',
    'unresolved_unminted',
    'invalid_event_semantics',
    'invalid_event_without_processed_state',
    'invalid_processed_state_without_event',
    'invalid_mint_without_committed_vault',
    'legacy_unminted',
    'legacy_invalid_event_without_processed_state',
    'legacy_invalid_processed_state_without_event',
    'legacy_mint_observed_unverifiable',
  ].includes(String(raw.state))) {
    throw new Error(`${label} state is unsupported`);
  }
  const state = raw.state as PegInCrossChainState;
  const expectedState = raw.routeKind === 'legacy'
    ? legacyState(event, processedAtObservedTip)
    : activeState(
      { classification: routeClassification } as PegInRouteReconstructionDeposit,
      event,
      processedAtObservedTip,
      false,
    );
  const semanticMismatchVariant = state === 'invalid_event_semantics'
    && (expectedState === 'mint_pending' || expectedState === 'mint_confirmed_by_depth');
  if (state !== expectedState && !semanticMismatchVariant) {
    throw new Error(`${label} state does not match its event and processed flag`);
  }
  return deepFreeze({
    ergoBoxIdHex,
    routeKind: raw.routeKind,
    routeClassification,
    processedAtObservedTip,
    state,
    event,
  });
}

function normalizePersistedEvent(
  value: unknown,
  entryLabel: string,
  profile: PegInSidechainProfileV1,
  observedTip: Readonly<{ height: number; idHex: string }>,
): CanonicalFrontierPegInEvent {
  const raw = record(value, `${entryLabel} event`);
  assertExactKeys(raw, [
    'ergoBoxIdHex',
    'recipientAddress',
    'amountNanoErg',
    'transactionHashHex',
    'blockNumber',
    'blockHashHex',
    'logIndex',
    'confirmations',
    'confirmationStatus',
  ], `${entryLabel} event`);
  const amountNanoErg = normalizePositiveBigInt(
    raw.amountNanoErg,
    `${entryLabel} event amount`,
  ).toString();
  if (raw.amountNanoErg !== amountNanoErg) {
    throw new Error(`${entryLabel} event amount must be a canonical decimal string`);
  }
  const blockNumber = normalizeSafeInteger(
    raw.blockNumber,
    `${entryLabel} event block number`,
  );
  if (blockNumber < profile.deploymentBlock || blockNumber > observedTip.height) {
    throw new Error(`${entryLabel} event block is outside the observed range`);
  }
  const confirmations = normalizePositiveSafeInteger(
    raw.confirmations,
    `${entryLabel} event confirmations`,
  );
  if (confirmations !== observedTip.height - blockNumber + 1) {
    throw new Error(`${entryLabel} event confirmations do not match the observed tip`);
  }
  const confirmationStatus = confirmations >= profile.requiredConfirmations
    ? 'confirmed_by_depth' as const
    : 'pending' as const;
  if (raw.confirmationStatus !== confirmationStatus) {
    throw new Error(`${entryLabel} event confirmation status is inconsistent`);
  }
  return deepFreeze({
    ergoBoxIdHex: normalizeFixedHex(
      raw.ergoBoxIdHex,
      32,
      `${entryLabel} event box ID`,
    ),
    recipientAddress: normalizeAddress(
      raw.recipientAddress,
      `${entryLabel} event recipient`,
    ),
    amountNanoErg,
    transactionHashHex: normalizeFixedHex(
      raw.transactionHashHex,
      32,
      `${entryLabel} event transaction hash`,
    ),
    blockNumber,
    blockHashHex: normalizeFixedHex(
      raw.blockHashHex,
      32,
      `${entryLabel} event block hash`,
    ),
    logIndex: normalizeSafeInteger(raw.logIndex, `${entryLabel} event log index`),
    confirmations,
    confirmationStatus,
  });
}

function normalizePersistedIssue(value: unknown, index: number): PegInSidechainIssue {
  const label = `persisted peg-in sidechain issue ${index}`;
  const raw = record(value, label);
  assertExactKeys(raw, ['code', 'ergoBoxIdHex', 'message'], label);
  if (![
    'event_semantics_mismatch',
    'event_without_processed_state',
    'processed_state_without_event',
    'mint_without_committed_vault',
    'legacy_refundable_mint',
    'legacy_mint_semantics_unverifiable',
    'unknown_peg_in_event',
  ].includes(String(raw.code))) {
    throw new Error(`${label} code is unsupported`);
  }
  return deepFreeze({
    code: raw.code as PegInSidechainIssueCode,
    ergoBoxIdHex: normalizeFixedHex(raw.ergoBoxIdHex, 32, `${label} box ID`),
    message: normalizeBoundedText(raw.message, 1000, `${label} message`),
  });
}

function assertPersistedEntryIssueConsistency(
  entries: readonly PegInCrossChainEntry[],
  issues: readonly PegInSidechainIssue[],
): void {
  const issueKeys = new Set(issues.map(entry => `${entry.ergoBoxIdHex}:${entry.code}`));
  if (issueKeys.size !== issues.length) {
    throw new Error('peg-in sidechain reconstruction issues must be unique by box and code');
  }
  const eventIdentities = new Set<string>();
  for (const entry of entries) {
    if (entry.event !== null) {
      const identity = `${entry.event.transactionHashHex}:${entry.event.logIndex}`;
      if (eventIdentities.has(identity)) {
        throw new Error(`peg-in sidechain reconstruction repeats event ${identity}`);
      }
      eventIdentities.add(identity);
    }
    const requiredCodes = requiredIssueCodesForPersistedState(entry.state);
    for (const code of requiredCodes) {
      if (!issueKeys.has(`${entry.ergoBoxIdHex}:${code}`)) {
        throw new Error(`persisted peg-in state ${entry.state} must retain issue ${code}`);
      }
    }
  }
}

function requiredIssueCodesForPersistedState(
  state: PegInCrossChainState,
): readonly PegInSidechainIssueCode[] {
  switch (state) {
    case 'invalid_event_semantics':
      return ['event_semantics_mismatch'];
    case 'invalid_event_without_processed_state':
    case 'legacy_invalid_event_without_processed_state':
      return ['event_without_processed_state'];
    case 'invalid_processed_state_without_event':
    case 'legacy_invalid_processed_state_without_event':
      return ['processed_state_without_event'];
    case 'invalid_mint_without_committed_vault':
      return ['mint_without_committed_vault'];
    case 'legacy_mint_observed_unverifiable':
      return ['legacy_mint_semantics_unverifiable'];
    default:
      return [];
  }
}

async function observeSource(
  source: PegInSidechainObservationSource,
  sourceId: string,
  profile: NormalizedProfile,
  routeBoxIds: ReadonlySet<string>,
): Promise<SourceView> {
  const chainId = normalizePositiveBigInt(await source.getChainId(), 'observed EVM chain ID').toString();
  if (chainId !== profile.evmChainId) {
    throw new Error('observed EVM chain ID does not match the peg-in sidechain profile');
  }
  const tipHeightBefore = normalizeSafeInteger(
    await source.getBlockNumber(),
    'initial Frontier peg-in tip height',
  );
  if (tipHeightBefore < profile.deploymentBlock) {
    throw new Error('Frontier peg-in tip predates the configured bridge deployment');
  }
  const tipBefore = await canonicalBlock(source, tipHeightBefore, 'initial Frontier peg-in tip');
  const rawLogs = await source.getLogs({
    address: profile.bridgeAddress,
    fromBlock: profile.deploymentBlock,
    toBlock: tipHeightBefore,
    topics: [FRONTIER_PEG_IN_TOPIC],
  });
  if (!Array.isArray(rawLogs)) throw new Error('Frontier PegIn log result must be an array');
  if (rawLogs.length > profile.maxEvents) {
    throw new Error(`Frontier PegIn log count exceeds maxEvents ${profile.maxEvents}`);
  }

  const events = await Promise.all(rawLogs.map((raw, index) => normalizeAndVerifyEvent(
    source,
    raw,
    index,
    profile,
    tipHeightBefore,
  )));
  events.sort(compareEvents);
  const eventBoxIds = new Set(events.map(event => event.ergoBoxIdHex));
  const allBoxIds = [...new Set([...routeBoxIds, ...eventBoxIds])].sort();
  const processed = await readProcessedState(
    source,
    profile.bridgeAddress,
    allBoxIds,
    tipBefore,
  );

  const tipHeightAfter = normalizeSafeInteger(
    await source.getBlockNumber(),
    'final Frontier peg-in tip height',
  );
  const tipAfter = await canonicalBlock(source, tipHeightAfter, 'final Frontier peg-in tip');
  if (tipHeightAfter !== tipHeightBefore || tipAfter.idHex !== tipBefore.idHex) {
    throw new Error('Frontier canonical tip changed while peg-in history was observed');
  }
  await Promise.all(events.map(event => reverifyCanonicalEvent(
    source,
    profile,
    event,
  )));
  const revalidatedProcessed = await readProcessedState(
    source,
    profile.bridgeAddress,
    allBoxIds,
    tipAfter,
  );
  if (JSON.stringify(revalidatedProcessed) !== JSON.stringify(processed)) {
    throw new Error('Frontier processedPegIns state changed during peg-in revalidation');
  }
  const tipHeightFinal = normalizeSafeInteger(
    await source.getBlockNumber(),
    'revalidated Frontier peg-in tip height',
  );
  const tipFinal = await canonicalBlock(
    source,
    tipHeightFinal,
    'revalidated Frontier peg-in tip',
  );
  if (tipHeightFinal !== tipHeightBefore || tipFinal.idHex !== tipBefore.idHex) {
    throw new Error('Frontier canonical tip changed while peg-in history was revalidated');
  }
  const semantic = deepFreeze<SourceViewSemantic>({
    chainId,
    tip: tipFinal,
    events,
    processed,
  });
  return deepFreeze({
    sourceId,
    semantic,
    viewDigestHex: sha256CanonicalJson(semantic, 'e2s.peg-in-sidechain-view.digest.v1'),
  });
}

async function readProcessedState(
  source: PegInSidechainObservationSource,
  bridgeAddress: string,
  ergoBoxIdsHex: readonly string[],
  block: PegInSidechainBlockIdentity,
): Promise<Array<Readonly<{ ergoBoxIdHex: string; processed: boolean }>>> {
  return Promise.all(ergoBoxIdsHex.map(async ergoBoxIdHex => deepFreeze({
    ergoBoxIdHex,
    processed: normalizeBoolean(
      await source.getProcessedPegIn(bridgeAddress, ergoBoxIdHex, block),
      `processedPegIns ${ergoBoxIdHex}`,
    ),
  })));
}

async function assertSourceTipStillMatches(
  source: PegInSidechainObservationSource,
  expected: PegInSidechainBlockIdentity,
  label: string,
): Promise<void> {
  const height = normalizeSafeInteger(
    await source.getBlockNumber(),
    `${label} post-Ergo tip height`,
  );
  const block = await canonicalBlock(source, height, `${label} post-Ergo tip`);
  if (height !== expected.height || block.idHex !== expected.idHex) {
    throw new Error(`${label} changed during final Ergo route re-observation`);
  }
}

async function normalizeAndVerifyEvent(
  source: PegInSidechainObservationSource,
  value: unknown,
  index: number,
  profile: NormalizedProfile,
  tipHeight: number,
): Promise<CanonicalFrontierPegInEvent> {
  const raw = record(value, `Frontier PegIn log ${index}`);
  const address = normalizeAddress(raw.address, `Frontier PegIn log ${index} address`);
  if (address !== profile.bridgeAddress) {
    throw new Error(`Frontier PegIn log ${index} was emitted by another contract`);
  }
  const topics = normalizeTopics(raw.topics, `Frontier PegIn log ${index}`);
  if (topics[0] !== FRONTIER_PEG_IN_TOPIC) {
    throw new Error(`Frontier PegIn log ${index} has the wrong event topic`);
  }
  const data = normalizeData(raw.data, `Frontier PegIn log ${index} data`, 64);
  if (raw.removed !== false) {
    throw new Error(`Frontier PegIn log ${index} must be a non-removed canonical log`);
  }
  const transactionHashHex = normalizeFixedHex(
    raw.transactionHash,
    32,
    `Frontier PegIn log ${index} transaction hash`,
  );
  const blockNumber = normalizeSafeInteger(
    raw.blockNumber,
    `Frontier PegIn log ${index} block number`,
  );
  if (blockNumber < profile.deploymentBlock || blockNumber > tipHeight) {
    throw new Error(`Frontier PegIn log ${index} is outside the observed block range`);
  }
  const blockHashHex = normalizeFixedHex(
    raw.blockHash,
    32,
    `Frontier PegIn log ${index} block hash`,
  );
  const logIndex = reconcileLogIndex(raw, `Frontier PegIn log ${index}`);
  const decoded = bridgeInterface.decodeEventLog(
    'PegIn',
    `0x${data}`,
    topics,
  );
  const recipientAddress = normalizeAddress(decoded.to, 'decoded PegIn recipient');
  const amountNanoErg = normalizePositiveBigInt(decoded.amount, 'decoded PegIn amount').toString();
  const ergoBoxIdHex = normalizeFixedHex(decoded.ergoBoxId, 32, 'decoded PegIn Ergo box ID');

  await assertCanonicalEventEvidence(source, {
    address,
    topics,
    data,
    transactionHashHex,
    blockNumber,
    blockHashHex,
    logIndex,
  }, `Frontier PegIn log ${index}`);
  const confirmations = tipHeight - blockNumber + 1;
  return deepFreeze({
    ergoBoxIdHex,
    recipientAddress,
    amountNanoErg,
    transactionHashHex,
    blockNumber,
    blockHashHex,
    logIndex,
    confirmations,
    confirmationStatus: confirmations >= profile.requiredConfirmations
      ? 'confirmed_by_depth'
      : 'pending',
  });
}

async function reverifyCanonicalEvent(
  source: PegInSidechainObservationSource,
  profile: NormalizedProfile,
  event: CanonicalFrontierPegInEvent,
): Promise<void> {
  const encoded = bridgeInterface.encodeEventLog(
    bridgeInterface.getEvent('PegIn')!,
    [
      event.recipientAddress,
      BigInt(event.amountNanoErg),
      `0x${event.ergoBoxIdHex}`,
    ],
  );
  await assertCanonicalEventEvidence(source, {
    address: profile.bridgeAddress,
    topics: normalizeTopics(encoded.topics, 'revalidated Frontier PegIn topics'),
    data: normalizeData(encoded.data, 'revalidated Frontier PegIn data', 64),
    transactionHashHex: event.transactionHashHex,
    blockNumber: event.blockNumber,
    blockHashHex: event.blockHashHex,
    logIndex: event.logIndex,
  }, `revalidated Frontier PegIn ${event.transactionHashHex}:${event.logIndex}`);
}

async function assertCanonicalEventEvidence(
  source: PegInSidechainObservationSource,
  expected: {
    address: string;
    topics: readonly string[];
    data: string;
    transactionHashHex: string;
    blockNumber: number;
    blockHashHex: string;
    logIndex: number;
  },
  label: string,
): Promise<void> {
  const block = await canonicalBlock(
    source,
    expected.blockNumber,
    `${label} event block`,
  );
  if (block.idHex !== expected.blockHashHex) {
    throw new Error(`${label} block is not canonical at its height`);
  }
  const receipt = record(
    await source.getTransactionReceipt(`0x${expected.transactionHashHex}`),
    `${label} receipt`,
  );
  if (normalizeReceiptStatus(receipt.status, `${label} receipt status`) !== 1) {
    throw new Error(`${label} receipt did not succeed`);
  }
  if (
    normalizeFixedHex(receipt.transactionHash ?? receipt.hash, 32, `${label} receipt hash`)
      !== expected.transactionHashHex
    || normalizeSafeInteger(receipt.blockNumber, `${label} receipt block number`)
      !== expected.blockNumber
    || normalizeFixedHex(receipt.blockHash, 32, `${label} receipt block hash`)
      !== expected.blockHashHex
  ) {
    throw new Error(`${label} receipt identity is inconsistent`);
  }
  assertReceiptContainsExactLog(receipt, expected);
}

function assertReceiptContainsExactLog(
  receipt: Record<string, unknown>,
  expected: {
    address: string;
    topics: readonly string[];
    data: string;
    transactionHashHex: string;
    blockNumber: number;
    blockHashHex: string;
    logIndex: number;
  },
): void {
  if (!Array.isArray(receipt.logs)) throw new Error('Frontier PegIn receipt logs must be an array');
  const matching = receipt.logs.filter(candidate => {
    try {
      const raw = record(candidate, 'Frontier PegIn receipt log');
      return reconcileLogIndex(raw, 'Frontier PegIn receipt log') === expected.logIndex
        && normalizeAddress(raw.address, 'Frontier PegIn receipt log address') === expected.address
        && normalizeData(raw.data, 'Frontier PegIn receipt log data', 64) === expected.data
        && canonicalStringArray(normalizeTopics(raw.topics, 'Frontier PegIn receipt log'))
          === canonicalStringArray(expected.topics)
        && normalizeFixedHex(
          raw.transactionHash,
          32,
          'Frontier PegIn receipt log transaction hash',
        ) === expected.transactionHashHex
        && normalizeSafeInteger(raw.blockNumber, 'Frontier PegIn receipt log block number')
          === expected.blockNumber
        && normalizeFixedHex(raw.blockHash, 32, 'Frontier PegIn receipt log block hash')
          === expected.blockHashHex
        && raw.removed === false;
    } catch {
      return false;
    }
  });
  if (matching.length !== 1) {
    throw new Error('Frontier PegIn receipt does not contain exactly one matching canonical log');
  }
}

function joinErgoRouteToFrontierView(
  route: PegInRouteReconstruction,
  view: SourceViewSemantic,
): { entries: PegInCrossChainEntry[]; issues: PegInSidechainIssue[] } {
  const eventsByBox = new Map<string, CanonicalFrontierPegInEvent>();
  for (const event of view.events) {
    if (eventsByBox.has(event.ergoBoxIdHex)) {
      throw new Error(`duplicate canonical PegIn events for Ergo box ${event.ergoBoxIdHex}`);
    }
    eventsByBox.set(event.ergoBoxIdHex, event);
  }
  const processed = new Map(view.processed.map(row => [row.ergoBoxIdHex, row.processed]));
  const entries: PegInCrossChainEntry[] = [];
  const issues: PegInSidechainIssue[] = [];
  const known = routeBoxIdSet(route);

  for (const deposit of route.activeHistory) {
    const event = eventsByBox.get(deposit.boxIdHex) ?? null;
    const isProcessed = processed.get(deposit.boxIdHex) ?? false;
    const mismatch = event !== null && (
      event.recipientAddress !== `0x${deposit.targetEvmAddressHex}`
      || event.amountNanoErg !== deposit.valueNanoErg
    );
    if (mismatch) {
      issues.push(issue(
        'event_semantics_mismatch',
        deposit.boxIdHex,
        'PegIn recipient or amount differs from the manifest-bound Ergo deposit and vault',
      ));
    }
    if (event !== null && !isProcessed) {
      issues.push(issue(
        'event_without_processed_state',
        deposit.boxIdHex,
        'canonical PegIn event exists while processedPegIns is false at the same tip',
      ));
    }
    if (event === null && isProcessed) {
      issues.push(issue(
        'processed_state_without_event',
        deposit.boxIdHex,
        'processedPegIns is true without one canonical PegIn event',
      ));
    }
    if (event !== null && deposit.classification !== 'committed') {
      issues.push(issue(
        'mint_without_committed_vault',
        deposit.boxIdHex,
        'PegIn event is bound to a deposit without one confirmed committed-vault transition',
      ));
    }
    entries.push(deepFreeze({
      ergoBoxIdHex: deposit.boxIdHex,
      routeKind: 'active' as const,
      routeClassification: deposit.classification,
      processedAtObservedTip: isProcessed,
      state: activeState(deposit, event, isProcessed, mismatch),
      event,
    }));
  }

  for (const legacy of route.legacyRoutes) {
    const current = new Set(legacy.currentBoxIdsHex);
    for (const ergoBoxIdHex of legacy.historyBoxIdsHex) {
      const event = eventsByBox.get(ergoBoxIdHex) ?? null;
      const isProcessed = processed.get(ergoBoxIdHex) ?? false;
      if (event !== null && !isProcessed) {
        issues.push(issue(
          'event_without_processed_state',
          ergoBoxIdHex,
          'legacy PegIn event exists while processedPegIns is false at the same tip',
        ));
      }
      if (event === null && isProcessed) {
        issues.push(issue(
          'processed_state_without_event',
          ergoBoxIdHex,
          'legacy processedPegIns is true without one canonical PegIn event',
        ));
      }
      if (event !== null && current.has(ergoBoxIdHex)) {
        issues.push(issue(
          'legacy_refundable_mint',
          ergoBoxIdHex,
          'legacy PegIn event is bound to an Ergo box that remains refundable',
        ));
      }
      if (event !== null) {
        issues.push(issue(
          'legacy_mint_semantics_unverifiable',
          ergoBoxIdHex,
          'legacy route history does not retain the recipient and amount bindings required to verify this mint',
        ));
      }
      entries.push(deepFreeze({
        ergoBoxIdHex,
        routeKind: 'legacy' as const,
        routeClassification: 'legacy' as const,
        processedAtObservedTip: isProcessed,
        state: legacyState(event, isProcessed),
        event,
      }));
    }
  }

  for (const event of view.events) {
    if (!known.has(event.ergoBoxIdHex)) {
      issues.push(issue(
        'unknown_peg_in_event',
        event.ergoBoxIdHex,
        'canonical PegIn event is outside the complete manifest-bound Ergo route history',
      ));
      if (!(processed.get(event.ergoBoxIdHex) ?? false)) {
        issues.push(issue(
          'event_without_processed_state',
          event.ergoBoxIdHex,
          'unknown canonical PegIn event exists while processedPegIns is false at the same tip',
        ));
      }
    }
  }
  entries.sort((left, right) => compareHex(left.ergoBoxIdHex, right.ergoBoxIdHex));
  issues.sort((left, right) => (
    compareHex(left.ergoBoxIdHex, right.ergoBoxIdHex)
    || left.code.localeCompare(right.code)
  ));
  return { entries, issues };
}

function legacyState(
  event: CanonicalFrontierPegInEvent | null,
  processed: boolean,
): PegInCrossChainState {
  if (event === null) {
    return processed
      ? 'legacy_invalid_processed_state_without_event'
      : 'legacy_unminted';
  }
  return processed
    ? 'legacy_mint_observed_unverifiable'
    : 'legacy_invalid_event_without_processed_state';
}

function activeState(
  deposit: PegInRouteReconstructionDeposit,
  event: CanonicalFrontierPegInEvent | null,
  processed: boolean,
  semanticsMismatch: boolean,
): PegInCrossChainState {
  if (event === null) {
    if (processed) return 'invalid_processed_state_without_event';
    switch (deposit.classification) {
      case 'committed': return 'committed_unminted';
      case 'refundable': return 'refundable_unminted';
      case 'commit_pending': return 'commit_pending_unminted';
      case 'refunded': return 'refunded_unminted';
      case 'unresolved': return 'unresolved_unminted';
    }
  }
  if (!processed) return 'invalid_event_without_processed_state';
  if (deposit.classification !== 'committed') return 'invalid_mint_without_committed_vault';
  if (semanticsMismatch) return 'invalid_event_semantics';
  return event.confirmationStatus === 'confirmed_by_depth'
    ? 'mint_confirmed_by_depth'
    : 'mint_pending';
}

function routeBoxIdSet(route: PegInRouteReconstruction): Set<string> {
  return new Set([
    ...route.activeHistory.map(deposit => deposit.boxIdHex),
    ...route.legacyRoutes.flatMap(legacy => legacy.historyBoxIdsHex),
  ]);
}

function normalizeProfile(value: PegInSidechainProfileV1): NormalizedProfile {
  const raw = record(value, 'peg-in sidechain profile');
  assertExactKeys(raw, [
    'schema',
    'sidechainIdHex',
    'evmChainId',
    'bridgeAddress',
    'deploymentBlock',
    'requiredConfirmations',
    'maxEvents',
  ], 'peg-in sidechain profile');
  if (raw.schema !== PEG_IN_SIDECHAIN_PROFILE_SCHEMA) {
    throw new Error('peg-in sidechain profile schema is unsupported');
  }
  const evmChainId = normalizePositiveBigInt(raw.evmChainId, 'peg-in profile EVM chain ID').toString();
  if (raw.evmChainId !== evmChainId) {
    throw new Error('peg-in profile EVM chain ID must be a canonical decimal string');
  }
  return deepFreeze({
    schema: PEG_IN_SIDECHAIN_PROFILE_SCHEMA,
    sidechainIdHex: normalizeFixedHex(raw.sidechainIdHex, 32, 'peg-in profile sidechain ID'),
    evmChainId,
    bridgeAddress: normalizeAddress(raw.bridgeAddress, 'peg-in profile bridge address'),
    deploymentBlock: normalizeSafeInteger(raw.deploymentBlock, 'peg-in profile deployment block'),
    requiredConfirmations: normalizePositiveSafeInteger(
      raw.requiredConfirmations,
      'peg-in profile required confirmations',
    ),
    maxEvents: normalizeBoundedEventCount(raw.maxEvents),
  });
}

function normalizeBoundedEventCount(value: unknown): number {
  const normalized = normalizePositiveSafeInteger(value, 'peg-in profile maxEvents');
  if (normalized > MAX_PEG_IN_SIDECHAIN_EVENTS) {
    throw new Error(
      `peg-in profile maxEvents must not exceed ${MAX_PEG_IN_SIDECHAIN_EVENTS}`,
    );
  }
  return normalized;
}

async function canonicalBlock(
  source: PegInSidechainObservationSource,
  expectedHeight: number,
  label: string,
): Promise<{ height: number; idHex: string }> {
  const raw = record(await source.getBlock(expectedHeight), label);
  const height = normalizeSafeInteger(raw.number, `${label} number`);
  if (height !== expectedHeight) throw new Error(`${label} returned the wrong block height`);
  return {
    height,
    idHex: normalizeFixedHex(raw.hash, 32, `${label} hash`),
  };
}

function normalizeTopics(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`${label} must contain exactly two topics`);
  }
  return value.map((topic, index) => `0x${normalizeFixedHex(
    topic,
    32,
    `${label} topic ${index}`,
  )}`);
}

function normalizeData(value: unknown, label: string, bytes: number): string {
  return normalizeFixedHex(value, bytes, label);
}

function reconcileLogIndex(raw: Record<string, unknown>, label: string): number {
  if (raw.index === undefined && raw.logIndex === undefined) {
    throw new Error(`${label} index is required`);
  }
  const index = raw.index === undefined
    ? undefined
    : normalizeSafeInteger(raw.index, `${label} index`);
  const logIndex = raw.logIndex === undefined
    ? undefined
    : normalizeSafeInteger(raw.logIndex, `${label} logIndex`);
  if (index !== undefined && logIndex !== undefined && index !== logIndex) {
    throw new Error(`${label} index aliases disagree`);
  }
  return index ?? logIndex!;
}

function normalizeReceiptStatus(value: unknown, label: string): number {
  const status = normalizeSafeInteger(value, label);
  if (status !== 0 && status !== 1) throw new Error(`${label} must be zero or one`);
  return status;
}

function normalizeBoolean(value: unknown, label: string): boolean {
  if (value !== true && value !== false) throw new Error(`${label} must be boolean`);
  return value;
}

function normalizePositiveBigInt(value: unknown, label: string): bigint {
  let parsed: bigint;
  if (typeof value === 'bigint') parsed = value;
  else if (typeof value === 'number' && Number.isSafeInteger(value)) parsed = BigInt(value);
  else if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) parsed = BigInt(value);
  else throw new Error(`${label} must be a canonical integer`);
  if (parsed <= 0n) throw new Error(`${label} must be positive`);
  return parsed;
}

function normalizeSafeInteger(value: unknown, label: string): number {
  let parsed: bigint;
  if (typeof value === 'bigint') parsed = value;
  else if (typeof value === 'number' && Number.isSafeInteger(value)) parsed = BigInt(value);
  else if (typeof value === 'string' && /^(?:0x[0-9a-f]+|0|[1-9]\d*)$/i.test(value)) parsed = BigInt(value);
  else throw new Error(`${label} must be a nonnegative safe integer`);
  if (parsed < 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(parsed);
}

function normalizePositiveSafeInteger(value: unknown, label: string): number {
  const normalized = normalizeSafeInteger(value, label);
  if (normalized === 0) throw new Error(`${label} must be positive`);
  return normalized;
}

function normalizeFixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length !== bytes * 2) {
    throw new Error(`${label} must be exactly ${bytes} bytes of hex`);
  }
  return clean.toLowerCase();
}

function normalizeAddress(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${label} must be an exact 20-byte address`);
  }
  return value.toLowerCase();
}

function normalizeCanonicalIsoTimestamp(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || new Date(value).toISOString() !== value
  ) {
    throw new Error(`${label} must be a canonical UTC timestamp`);
  }
  return value;
}

function normalizeBoundedText(value: unknown, maxLength: number, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > maxLength
    || value.trim() !== value
    || /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`${label} must be bounded canonical text`);
  }
  return value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (canonicalStringArray(expected) !== canonicalStringArray(actual)) {
    throw new Error(`${label} fields must be exactly ${expected.join(', ')}`);
  }
}

function issue(
  code: PegInSidechainIssueCode,
  ergoBoxIdHex: string,
  message: string,
): PegInSidechainIssue {
  return deepFreeze({ code, ergoBoxIdHex, message });
}

function compareEvents(
  left: CanonicalFrontierPegInEvent,
  right: CanonicalFrontierPegInEvent,
): number {
  return left.blockNumber - right.blockNumber
    || left.logIndex - right.logIndex
    || compareHex(left.transactionHashHex, right.transactionHashHex);
}

function compareHex(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalStringArray(value: readonly string[]): string {
  return JSON.stringify(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
