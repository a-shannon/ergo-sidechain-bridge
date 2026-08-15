import { readFileSync, realpathSync } from 'fs';
import { basename, isAbsolute, relative, resolve } from 'path';

import {
  formatAggregateSettlementEvidenceJsonPathLabel,
  validateAggregateSettlementEvidenceJsonPath,
  validateAggregateSettlementPrebroadcastEvidenceRecord,
  type AggregateSettlementPrebroadcastEvidenceRecord,
} from './aggregate-settlement-evidence.js';
import {
  concreteBridgeEventRootsFromClaims,
  formatBridgeEventRootCsv,
  normalizeBridgeEventRootHex,
} from './bridge-event-root-evidence.js';
import { type DeployedState } from './config.js';
import {
  evidenceTargetInspectionVariants,
  hasEvidenceLocalOnlyInspectionReference,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from './evidence-sensitive-target.js';
import { type ErgoClient, type ErgoExtensionField } from './ergo-client.js';
import { LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE } from './legacy-aggregate-settlement-conservation.js';
import { validateReadOnlyNodeUrl } from './read-only-node-url.js';
import { findSidechainAnchorFields } from './spv-anchor.js';

export interface FreshTestnetCheckpointInput {
  aggregateEvidence: string;
  currentErgoHeight: string | number;
  currentSidechainHeight: string | number;
  ergoNodeNetwork: string;
  sidechainNetwork: string;
  deployedState?: DeployedState;
  deployedStateHash?: string;
  singletonCheckpoint?: FreshTestnetSingletonCheckpoint;
  singletonCheckpointSource?: FreshTestnetSingletonCheckpointSource;
  anchorObservations?: FreshTestnetAnchorObservation[];
  anchorObservationSource?: FreshTestnetAnchorObservationSource;
  heightEvidence?: FreshTestnetHeightEvidence;
  heightEvidenceSource?: FreshTestnetHeightEvidenceSource;
  now?: Date;
}

export interface FreshTestnetSingletonObservation {
  name: string;
  nftId: string;
  expectedBoxId?: string;
  observedBoxId: string;
  expectedErgoTreeHex: string;
  observedErgoTreeHex: string;
  observedCount: number;
}

export interface FreshTestnetSingletonCheckpoint {
  deployedStateHash: string;
  observedAt: string;
  nodeHeight: string | number;
  nodeNetwork: string;
  expectedTxId: string;
  expectedTxMempoolAbsent: boolean;
  expectedTxConfirmedAbsent: boolean;
  singletons: FreshTestnetSingletonObservation[];
}

export interface FreshTestnetAnchorObservation {
  ergoAnchorHeight: number;
  expectedBridgeEventRootHex: string;
  observedBridgeEventRootHexes: string[];
  matchingFieldFound: boolean;
  fieldCount: number;
  headerIds: string[];
  observedAt: string;
  nodeHeight: number;
}

export interface FreshTestnetCheckpointBoundary {
  lifecyclePassAllowed: false;
  broadcastAuthorized: false;
  liveSubmitPerformed: false;
  confirmationObserved: false;
  reconciliationPerformed: false;
  gate3ClosureAllowed: false;
  productionReadyClaimAllowed: false;
  testnetProductionCandidateClaimAllowed: false;
}

export interface FreshTestnetCheckpointSummary {
  aggregateEvidence: string;
  lifecycleGate: 'Fresh testnet lifecycle';
  lifecycleStatus: 'publication blocker';
  ergoNodeNetwork: string;
  sidechainNetwork: string;
  currentErgoHeight: string | number;
  currentSidechainHeight: string | number;
  expectedTxId?: string;
  burnTxHashes: string[];
  sidechainBlockHeights: number[];
  ergoAnchorHeights: number[];
  sidechainHeaderHashHexes: string[];
  bridgeEventRootHexes: string[];
  transactionCheckResult?: 'PASS';
  broadcast?: 'no';
  singletonCheckpoint?: FreshTestnetSingletonCheckpoint;
  singletonObservationFreshness?: FreshTestnetObservationFreshness;
  anchorObservations?: FreshTestnetAnchorObservation[];
  heightEvidence?: FreshTestnetHeightEvidence;
}

export interface FreshTestnetObservationFreshness {
  observedAt: string;
  checkedAt: string;
  maxAgeSeconds: 900;
  maxAgeMinutes: 15;
  ageSeconds: number;
  ageMs: number;
  status: 'fresh' | 'future' | 'stale';
}

export interface FreshTestnetSingletonCheckpointSource {
  mode: 'provided-json' | 'live-read-only-node';
  target?: string;
  ergoNodeUrl?: string;
}

export interface FreshTestnetAnchorObservationSource {
  mode: 'live-read-only-node';
  ergoNodeUrl?: string;
}

export interface FreshTestnetHeightEvidenceSource {
  mode: 'provided-json' | 'live-read-only-sources';
  target?: string;
  ergoNodeUrl?: string;
  sidechainRpcUrl?: string;
}

export interface FreshTestnetCheckpointSourceBindings {
  aggregateEvidence: string;
  anchorObservations: {
    mode: 'live-read-only-node' | 'provided-json' | 'unspecified';
    observationCount?: number;
    ergoAnchorHeights?: number[];
    bridgeEventRootHexes?: string[];
    observedAtValues?: string[];
    nodeHeights?: number[];
    ergoNodeUrl?: string;
    readOnlyNodeClient: boolean;
    nodeAuthHeader: 'not-used' | 'not-applicable';
    operations: string[];
  };
  singletonCheckpoint: {
    mode: 'provided-json' | 'live-read-only-node' | 'unspecified';
    target?: string;
    observedAt?: string;
    nodeHeight?: string | number;
    expectedTxId?: string;
    deployedStateHash?: string;
    singletonCount?: number;
    ergoNodeUrl?: string;
    readOnlyNodeClient: boolean;
    nodeAuthHeader: 'not-used' | 'not-applicable';
    operations: string[];
  };
  heightEvidence: {
    mode: 'provided-json' | 'live-read-only-sources' | 'unspecified';
    target?: string;
    observedAt?: string;
    ergoNodeHeight?: number;
    sidechainBlockHeight?: number;
    broadcastEnabled?: false;
    ergoNodeUrl?: string;
    sidechainRpcUrl?: string;
    readOnlyErgoNodeClient: boolean;
    readOnlySidechainRpcClient: boolean;
    nodeAuthHeader: 'not-used' | 'not-applicable';
    operations: string[];
  };
}

export interface FreshTestnetHeightEvidence {
  observedAt: string;
  ergoNodeHeight: number;
  sidechainBlockHeight: number;
  sources: {
    ergo: 'read-only-no-auth /info';
    sidechain: 'read-only EVM getBlockNumber';
  };
  broadcastEnabled: false;
}

export interface FreshTestnetCheckpointReport {
  status: 'CREATED' | 'BLOCKED';
  message: string;
  errors: string[];
  checkpoint: FreshTestnetCheckpointSummary;
  boundary: FreshTestnetCheckpointBoundary;
  sourceBindings: FreshTestnetCheckpointSourceBindings;
  markdown?: string;
  lines: string[];
}

const boundary: FreshTestnetCheckpointBoundary = {
  lifecyclePassAllowed: false,
  broadcastAuthorized: false,
  liveSubmitPerformed: false,
  confirmationObserved: false,
  reconciliationPerformed: false,
  gate3ClosureAllowed: false,
  productionReadyClaimAllowed: false,
  testnetProductionCandidateClaimAllowed: false,
};
const maxObservationAgeMs = 15 * 60 * 1000;
const blockedAggregateEvidenceJsonTargetLabel = '<blocked evidence JSON target>';
const blockedSingletonCheckpointJsonTargetLabel = '<blocked singleton checkpoint JSON target>';
const blockedHeightEvidenceJsonTargetLabel = '<blocked height evidence JSON target>';
const nonConcreteFreshCheckpointJsonTargetLabel =
  'template/sample/generic/placeholder/fixture/mock/dummy/fake/stub/testdata/synthetic/simulated';
const internalFixtureEndpointPattern = /\b(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)\b/;

export function validateFreshCheckpointBroadcastDisabled(
  env: Record<string, string | undefined> = process.env,
): string[] {
  return env.BRIDGE_BROADCAST_ENABLED === 'true'
    ? ['fresh testnet checkpoint: BRIDGE_BROADCAST_ENABLED must be false or unset']
    : [];
}

export function validateFreshCheckpointReadOnlyNodeUrl(nodeUrl: string | undefined): string[] {
  return validateReadOnlyNodeUrl(nodeUrl, 'fresh testnet checkpoint: --node-url');
}

export function buildFreshTestnetCheckpoint(input: FreshTestnetCheckpointInput): FreshTestnetCheckpointReport {
  const recordRead = readAggregateEvidenceRecord(input.aggregateEvidence);
  const label = recordRead.targetLabel;
  const record = recordRead.record;
  const aggregateRecord = isAggregateRecordLike(record) ? record : undefined;
  const recordErrors = record ? validateAggregateSettlementPrebroadcastEvidenceRecord(record) : [];
  const errors = [
    ...validateFreshCheckpointBroadcastDisabled(),
    ...recordRead.errors,
    ...recordErrors.map(error => `aggregate evidence: ${error}`),
    ...validateNetworkScope(input.ergoNodeNetwork, input.sidechainNetwork),
    ...validateHeight('Current Ergo height', input.currentErgoHeight),
    ...validateHeight('Current sidechain height', input.currentSidechainHeight),
    ...(aggregateRecord ? validateFreshTestnetClaimShape(aggregateRecord) : []),
    ...(aggregateRecord ? validateCurrentHeightFloor(
      'Current Ergo height',
      input.currentErgoHeight,
      aggregateRecord.claims.flatMap(claim => claim.ergoAnchorHeight === undefined ? [] : [claim.ergoAnchorHeight]),
      'aggregate evidence Ergo anchor height',
    ) : []),
    ...(aggregateRecord ? validateCurrentHeightFloor(
      'Current sidechain height',
      input.currentSidechainHeight,
      aggregateRecord.claims.map(claim => claim.sidechainBlockHeight),
      'aggregate evidence sidechain block height',
    ) : []),
    ...(aggregateRecord ? validateSingletonCheckpoint(
      input.singletonCheckpoint,
      input.singletonCheckpointSource,
      aggregateRecord,
      input.currentErgoHeight,
      input.ergoNodeNetwork,
      input.deployedState,
      input.deployedStateHash,
      input.now ?? new Date(),
    ) : []),
    ...(aggregateRecord ? validateAnchorObservations(
      input.anchorObservations,
      input.anchorObservationSource,
      aggregateRecord,
      input.currentErgoHeight,
      input.now ?? new Date(),
    ) : []),
    ...(aggregateRecord ? validateHeightEvidence(
      input.heightEvidence,
      input.heightEvidenceSource,
      input.currentErgoHeight,
      input.currentSidechainHeight,
      input.now ?? new Date(),
    ) : []),
  ];
  const now = input.now ?? new Date();
  const checkpoint = summarizeCheckpoint(label, input, aggregateRecord, now);
  const sourceBindings = summarizeSourceBindings(
    label,
    input.singletonCheckpointSource,
    input.singletonCheckpoint,
    input.anchorObservationSource,
    input.anchorObservations,
    input.heightEvidenceSource,
    input.heightEvidence,
  );

  if (errors.length > 0) {
    const message = `fresh testnet non-broadcast checkpoint BLOCKED: ${errors.length} issue(s)`;
    return {
      status: 'BLOCKED',
      message,
      errors,
      checkpoint,
      boundary,
      sourceBindings,
      lines: buildLines(message, checkpoint, errors),
    };
  }

  const message = 'fresh testnet non-broadcast checkpoint CREATED publication-blocker';
  const markdown = renderMarkdown(input, checkpoint);
  return {
    status: 'CREATED',
    message,
    errors: [],
    checkpoint,
    boundary,
    sourceBindings,
    markdown,
    lines: buildLines(message, checkpoint, []),
  };
}

function readAggregateEvidenceRecord(target: string): { record?: unknown; targetLabel: string; errors: string[] } {
  const label = formatAggregateSettlementEvidenceJsonPathLabel(target);
  const pathErrors = validateAggregateSettlementEvidenceJsonPath(target).map(normalizeAggregateEvidenceReadPathError);
  if (pathErrors.length > 0) {
    const targetLabel = pathErrors.some(error => error.includes(blockedAggregateEvidenceJsonTargetLabel))
      ? blockedAggregateEvidenceJsonTargetLabel
      : label;
    return { targetLabel, errors: pathErrors.map(error => `aggregate evidence: ${error}`) };
  }

  try {
    const bridgeRoot = realpathSync(resolve(process.cwd(), '..'));
    const evidencePath = realpathSync(resolve(process.cwd(), target));
    if (!isInsidePath(evidencePath, bridgeRoot)) {
      return {
        targetLabel: blockedAggregateEvidenceJsonTargetLabel,
        errors: [`aggregate evidence: ${blockedAggregateEvidenceJsonTargetLabel} must resolve inside the bridge repository`],
      };
    }
    return { record: JSON.parse(readFileSync(evidencePath, 'utf8')), targetLabel: label, errors: [] };
  } catch {
    return { targetLabel: label, errors: [`aggregate evidence: ${label} could not be read or parsed`] };
  }
}

export function readFreshTestnetAggregateExpectedTxId(target: string): { expectedTxId?: string; errors: string[] } {
  const read = readFreshTestnetAggregateEvidenceRecord(target);
  return { expectedTxId: read.record?.transactionCheck.expectedTxId, errors: read.errors };
}

export function readFreshTestnetAggregateEvidenceRecord(
  target: string,
): { record?: AggregateSettlementPrebroadcastEvidenceRecord; errors: string[] } {
  const recordRead = readAggregateEvidenceRecord(target);
  if (recordRead.errors.length > 0) return { errors: recordRead.errors };
  if (!isAggregateRecordLike(recordRead.record)) {
    return { errors: ['aggregate evidence: record must include transactionCheck'] };
  }
  const recordErrors = validateAggregateSettlementPrebroadcastEvidenceRecord(recordRead.record);
  if (recordErrors.length > 0) {
    return { errors: recordErrors.map(error => `aggregate evidence: ${error}`) };
  }
  return { record: recordRead.record, errors: [] };
}

export function readFreshTestnetSingletonCheckpointJson(
  target: string,
): { checkpoint?: FreshTestnetSingletonCheckpoint; targetLabel: string; errors: string[] } {
  const targetLabel = formatAggregateSettlementEvidenceJsonPathLabel(target);
  const pathErrors = validateAggregateSettlementEvidenceJsonPath(target).map(error =>
    normalizeAggregateEvidenceReadPathError(error)
      .replace('aggregate evidence output', 'singleton checkpoint input')
      .replace(/evidence JSON/g, 'singleton checkpoint JSON')
      .replace('aggregate evidence', 'singleton checkpoint'),
  );
  if (pathErrors.length > 0) {
    const sanitizedTargetLabel = pathErrors.some(error => error.includes('<blocked'))
      ? blockedAggregateEvidenceJsonTargetLabel
      : targetLabel;
    return {
      targetLabel: sanitizedTargetLabel,
      errors: pathErrors,
    };
  }

  try {
    const bridgeRoot = realpathSync(resolve(process.cwd(), '..'));
    const checkpointPath = realpathSync(resolve(process.cwd(), target));
    if (!isInsidePath(checkpointPath, bridgeRoot)) {
      return {
        targetLabel: blockedAggregateEvidenceJsonTargetLabel,
        errors: [`singleton checkpoint: ${blockedAggregateEvidenceJsonTargetLabel} must resolve inside the bridge repository`],
      };
    }
    return { checkpoint: JSON.parse(readFileSync(checkpointPath, 'utf8')), targetLabel, errors: [] };
  } catch {
    return { targetLabel, errors: [`singleton checkpoint: ${targetLabel} could not be read or parsed`] };
  }
}

export function readFreshTestnetHeightEvidenceJson(
  target: string,
): { heightEvidence?: FreshTestnetHeightEvidence; targetLabel: string; errors: string[] } {
  const targetCheck = validateConcreteHeightEvidenceJsonTarget(target);
  if (targetCheck.errors.length > 0) {
    return { targetLabel: targetCheck.targetLabel, errors: targetCheck.errors };
  }

  try {
    const bridgeRoot = realpathSync(resolve(process.cwd(), '..'));
    const evidencePath = realpathSync(resolve(process.cwd(), target));
    if (!isInsidePath(evidencePath, bridgeRoot)) {
      return {
        targetLabel: blockedHeightEvidenceJsonTargetLabel,
        errors: [`height evidence: ${blockedHeightEvidenceJsonTargetLabel} must resolve inside the bridge repository`],
      };
    }
    return {
      heightEvidence: JSON.parse(readFileSync(evidencePath, 'utf8')),
      targetLabel: targetCheck.targetLabel,
      errors: [],
    };
  } catch {
    return {
      targetLabel: targetCheck.targetLabel,
      errors: [`height evidence: ${targetCheck.targetLabel} could not be read or parsed`],
    };
  }
}

function validateFreshTestnetClaimShape(record: AggregateSettlementPrebroadcastEvidenceRecord): string[] {
  const errors: string[] = [];
  for (const [index, claim] of record.claims.entries()) {
    const prefix = `aggregate evidence claim[${index}]`;
    if (!claim.sidechainHeaderHashHex) {
      errors.push(`${prefix}: sidechainHeaderHashHex is required for fresh testnet checkpoint`);
    }
    if (!claim.bridgeEventRootHex) {
      errors.push(`${prefix}: bridgeEventRootHex is required for fresh testnet checkpoint`);
    }
    if (claim.ergoAnchorHeight === undefined) {
      errors.push(`${prefix}: ergoAnchorHeight is required for fresh testnet checkpoint`);
    }
  }
  return errors;
}

function validateAnchorObservations(
  observations: FreshTestnetAnchorObservation[] | undefined,
  source: FreshTestnetAnchorObservationSource | undefined,
  record: AggregateSettlementPrebroadcastEvidenceRecord,
  currentErgoHeight: string | number,
  now: Date,
): string[] {
  const anchoredClaims = record.claims
    .map((claim, index) => ({ claim, index }))
    .filter(({ claim }) => claim.ergoAnchorHeight !== undefined && claim.bridgeEventRootHex !== undefined);
  if (anchoredClaims.length === 0) return [];
  if (!observations || observations.length === 0) {
    return ['live anchor observation: read-only 0x0401 anchor observations are required'];
  }

  const errors: string[] = [];
  if (source?.mode !== 'live-read-only-node') {
    errors.push('live anchor observation: source binding must be live-read-only-node');
  } else {
    errors.push(...validateReadOnlyEndpointBinding(
      source.ergoNodeUrl,
      'live anchor observation: source binding ergoNodeUrl',
    ));
  }
  for (const { claim, index } of anchoredClaims) {
    const expectedHeight = claim.ergoAnchorHeight!;
    const expectedRoot = normalizeHexId(claim.bridgeEventRootHex!);
    const observation = observations.find(candidate =>
      candidate.ergoAnchorHeight === expectedHeight &&
      normalizeHexId(candidate.expectedBridgeEventRootHex) === expectedRoot
    );
    const prefix = `live anchor observation claim[${index}]`;
    if (!observation) {
      errors.push(`${prefix}: read-only 0x0401 observation is required for Ergo anchor height ${expectedHeight}`);
      continue;
    }
    if (!Number.isSafeInteger(observation.fieldCount) || observation.fieldCount < 0) {
      errors.push(`${prefix}: fieldCount must be a non-negative safe integer`);
    }
    if (!isIsoUtcTimestamp(observation.observedAt)) {
      errors.push(`${prefix}: observedAt must be an ISO UTC timestamp`);
    } else {
      errors.push(...validateObservedAtWindow(
        observation.observedAt,
        now,
        `${prefix}: observedAt`,
      ));
    }
    const current = parseSafeHeight(currentErgoHeight);
    if (!Number.isSafeInteger(observation.nodeHeight) || observation.nodeHeight < 0) {
      errors.push(`${prefix}: nodeHeight must be a non-negative safe integer`);
    } else {
      if (current !== undefined && observation.nodeHeight !== current) {
        errors.push(`${prefix}: nodeHeight must match Current Ergo height`);
      }
      if (observation.nodeHeight < expectedHeight) {
        errors.push(`${prefix}: nodeHeight must be greater than or equal to Ergo anchor height ${expectedHeight}`);
      }
    }
    if (observation.observedBridgeEventRootHexes.some(root => !/^[0-9a-f]{64}$/i.test(normalizeHexId(root)))) {
      errors.push(`${prefix}: observed bridge event roots must be 32-byte hex`);
    }
    if (observation.matchingFieldFound !== true) {
      errors.push(`${prefix}: 0x0401 bridgeEventRoot must be present at Ergo anchor height ${expectedHeight}`);
    }
    if (!observation.observedBridgeEventRootHexes.map(normalizeHexId).includes(expectedRoot)) {
      errors.push(`${prefix}: observed roots must include aggregate bridgeEventRootHex at Ergo anchor height ${expectedHeight}`);
    }
  }
  return errors;
}

function validateHeightEvidence(
  evidence: FreshTestnetHeightEvidence | undefined,
  source: FreshTestnetHeightEvidenceSource | undefined,
  currentErgoHeight: string | number,
  currentSidechainHeight: string | number,
  now: Date,
): string[] {
  if (!evidence) {
    return ['height evidence: read-only current height evidence is required'];
  }

  const errors: string[] = [];
  const currentErgo = parseSafeHeight(currentErgoHeight);
  const currentSidechain = parseSafeHeight(currentSidechainHeight);
  const sources = isRecord(evidence.sources) ? evidence.sources : undefined;

  if (!source) {
    errors.push('height evidence: source binding is required');
  } else if (source.mode === 'provided-json') {
    if (!isConcreteHeightEvidenceJsonTarget(source.target ?? '')) {
      errors.push('height evidence: provided-json source target must cite a concrete non-template height evidence JSON target');
    }
  } else if (source.mode !== 'live-read-only-sources') {
    errors.push('height evidence: source mode must be live-read-only-sources or provided-json');
  } else {
    errors.push(...validateReadOnlyEndpointBinding(
      source.ergoNodeUrl,
      'height evidence: source binding ergoNodeUrl',
    ));
    errors.push(...validateReadOnlyEndpointBinding(
      source.sidechainRpcUrl,
      'height evidence: source binding sidechainRpcUrl',
    ));
  }

  if (!isIsoUtcTimestamp(String(evidence.observedAt ?? ''))) {
    errors.push('height evidence: observedAt must be an ISO UTC timestamp');
  } else {
    errors.push(...validateObservedAtWindow(
      String(evidence.observedAt),
      now,
      'height evidence: observedAt',
    ));
  }

  if (
    typeof evidence.ergoNodeHeight !== 'number' ||
    !Number.isSafeInteger(evidence.ergoNodeHeight) ||
    evidence.ergoNodeHeight < 0
  ) {
    errors.push('height evidence: ergoNodeHeight must be a non-negative safe integer');
  } else if (currentErgo !== undefined && evidence.ergoNodeHeight !== currentErgo) {
    errors.push('height evidence: ergoNodeHeight must match Current Ergo height');
  }

  if (
    typeof evidence.sidechainBlockHeight !== 'number' ||
    !Number.isSafeInteger(evidence.sidechainBlockHeight) ||
    evidence.sidechainBlockHeight < 0
  ) {
    errors.push('height evidence: sidechainBlockHeight must be a non-negative safe integer');
  } else if (currentSidechain !== undefined && evidence.sidechainBlockHeight !== currentSidechain) {
    errors.push('height evidence: sidechainBlockHeight must match Current sidechain height');
  }

  if (!sources) {
    errors.push('height evidence: sources are required');
  } else {
    if (sources.ergo !== 'read-only-no-auth /info') {
      errors.push('height evidence: sources.ergo must be read-only-no-auth /info');
    }
    if (sources.sidechain !== 'read-only EVM getBlockNumber') {
      errors.push('height evidence: sources.sidechain must be read-only EVM getBlockNumber');
    }
  }

  if (evidence.broadcastEnabled !== false) {
    errors.push('height evidence: broadcastEnabled must be false');
  }

  return errors;
}

function validateNetworkScope(ergoNodeNetwork: string, sidechainNetwork: string): string[] {
  const errors: string[] = [];
  if (!identifiesPositiveTestnetNetwork(ergoNodeNetwork)) {
    errors.push('network scope: Ergo node network must positively identify testnet');
  }
  if (!identifiesAllowedSidechainNetwork(sidechainNetwork)) {
    errors.push('network scope: Sidechain network must identify patched-devnet, testnet, or non-mainnet');
  }
  return errors;
}

function validateHeight(label: string, value: string | number): string[] {
  const parsed = parseSafeHeight(value);
  if (parsed !== undefined) return [];
  return /^\d+$/.test(String(value))
    ? [`${label}: must be a safe integer`]
    : [`${label}: must be a non-negative integer`];
}

function validateCurrentHeightFloor(
  label: string,
  currentHeight: string | number,
  packageHeights: number[],
  packageLabel: string,
): string[] {
  const current = parseSafeHeight(currentHeight);
  if (current === undefined || packageHeights.length === 0) return [];
  const maxPackageHeight = Math.max(...packageHeights);
  return current >= maxPackageHeight
    ? []
    : [`${label}: must be greater than or equal to max ${packageLabel} ${maxPackageHeight}`];
}

function parseSafeHeight(value: string | number): number | undefined {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  }
  if (!/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function summarizeCheckpoint(
  label: string,
  input: FreshTestnetCheckpointInput,
  record: unknown,
  now: Date,
): FreshTestnetCheckpointSummary {
  if (!isAggregateRecordLike(record)) {
    return {
      aggregateEvidence: label,
      lifecycleGate: 'Fresh testnet lifecycle',
      lifecycleStatus: 'publication blocker',
      ergoNodeNetwork: input.ergoNodeNetwork,
      sidechainNetwork: input.sidechainNetwork,
      currentErgoHeight: input.currentErgoHeight,
      currentSidechainHeight: input.currentSidechainHeight,
      burnTxHashes: [],
      sidechainBlockHeights: [],
      ergoAnchorHeights: [],
      sidechainHeaderHashHexes: [],
      bridgeEventRootHexes: [],
      heightEvidence: input.heightEvidence,
    };
  }

  return {
    aggregateEvidence: label,
    lifecycleGate: 'Fresh testnet lifecycle',
    lifecycleStatus: 'publication blocker',
    ergoNodeNetwork: input.ergoNodeNetwork,
    sidechainNetwork: input.sidechainNetwork,
    currentErgoHeight: input.currentErgoHeight,
    currentSidechainHeight: input.currentSidechainHeight,
    expectedTxId: record.transactionCheck.expectedTxId,
    burnTxHashes: record.claims.map(claim => claim.burnTxHash),
    sidechainBlockHeights: record.claims.map(claim => claim.sidechainBlockHeight),
    ergoAnchorHeights: record.claims.flatMap(claim => claim.ergoAnchorHeight === undefined ? [] : [claim.ergoAnchorHeight]),
    sidechainHeaderHashHexes: record.claims.flatMap(
      claim => claim.sidechainHeaderHashHex === undefined ? [] : [claim.sidechainHeaderHashHex],
    ),
    bridgeEventRootHexes: concreteBridgeEventRootsFromClaims(record.claims),
    transactionCheckResult: record.transactionCheck.result,
    broadcast: record.broadcast,
    singletonCheckpoint: input.singletonCheckpoint,
    singletonObservationFreshness: summarizeObservationFreshness(input.singletonCheckpoint?.observedAt, now),
    anchorObservations: input.anchorObservations,
    heightEvidence: input.heightEvidence,
  };
}

export async function collectFreshTestnetAnchorObservations(input: {
  ergo: Pick<ErgoClient, 'getInfo' | 'getSidechainExtensionFieldsAtHeight'>;
  aggregateEvidence: AggregateSettlementPrebroadcastEvidenceRecord;
  now?: Date;
}): Promise<FreshTestnetAnchorObservation[]> {
  const observations: FreshTestnetAnchorObservation[] = [];
  const [info] = await Promise.all([input.ergo.getInfo()]);
  const observedAt = (input.now ?? new Date()).toISOString();
  const nodeHeight = info.fullHeight;
  for (const claim of input.aggregateEvidence.claims) {
    if (claim.ergoAnchorHeight === undefined || claim.bridgeEventRootHex === undefined) continue;
    const fields: ErgoExtensionField[] = await input.ergo.getSidechainExtensionFieldsAtHeight(claim.ergoAnchorHeight);
    const anchors = findSidechainAnchorFields(fields);
    const expectedRoot = normalizeBridgeEventRootHex(claim.bridgeEventRootHex) ?? normalizeHexId(claim.bridgeEventRootHex);
    observations.push({
      ergoAnchorHeight: claim.ergoAnchorHeight,
      expectedBridgeEventRootHex: expectedRoot,
      observedBridgeEventRootHexes: anchors.map(anchor => normalizeBridgeEventRootHex(anchor.bridgeEventRootHex) ?? anchor.bridgeEventRootHex),
      matchingFieldFound: anchors.some(anchor => (normalizeBridgeEventRootHex(anchor.bridgeEventRootHex) ?? normalizeHexId(anchor.bridgeEventRootHex)) === expectedRoot),
      fieldCount: anchors.length,
      headerIds: [...new Set(anchors.map(anchor => anchor.headerId))],
      observedAt,
      nodeHeight,
    });
  }
  return observations;
}

export async function collectFreshTestnetHeightEvidence(input: {
  ergo: Pick<ErgoClient, 'getInfo'>;
  sidechain: { getBlockNumber(): Promise<number> };
  now?: Date;
}): Promise<FreshTestnetHeightEvidence> {
  const [ergoInfo, sidechainBlockHeight] = await Promise.all([
    input.ergo.getInfo(),
    input.sidechain.getBlockNumber(),
  ]);
  return {
    observedAt: (input.now ?? new Date()).toISOString(),
    ergoNodeHeight: ergoInfo.fullHeight,
    sidechainBlockHeight,
    sources: {
      ergo: 'read-only-no-auth /info',
      sidechain: 'read-only EVM getBlockNumber',
    },
    broadcastEnabled: false,
  };
}

function summarizeSourceBindings(
  aggregateEvidence: string,
  singletonSource: FreshTestnetSingletonCheckpointSource | undefined,
  singletonCheckpoint: FreshTestnetSingletonCheckpoint | undefined,
  anchorSource: FreshTestnetAnchorObservationSource | undefined,
  anchorObservations: FreshTestnetAnchorObservation[] | undefined,
  heightSource: FreshTestnetHeightEvidenceSource | undefined,
  heightEvidence: FreshTestnetHeightEvidence | undefined,
): FreshTestnetCheckpointSourceBindings {
  const mode = singletonSource?.mode ?? 'unspecified';
  const anchorMode = anchorSource?.mode ?? 'unspecified';
  const heightMode = heightSource?.mode ?? 'unspecified';
  const singletonTarget = singletonSource?.target
    ? formatSensitiveSourceTargetLabel(singletonSource.target, blockedSingletonCheckpointJsonTargetLabel)
    : undefined;
  const heightTarget = heightSource?.target
    ? formatSensitiveSourceTargetLabel(heightSource.target, blockedHeightEvidenceJsonTargetLabel)
    : undefined;
  return {
    aggregateEvidence,
    anchorObservations: {
      mode: anchorMode,
      ...(anchorMode === 'live-read-only-node' ? {
        observationCount: anchorObservations?.length ?? 0,
        ergoAnchorHeights: anchorObservations?.map(observation => observation.ergoAnchorHeight) ?? [],
        bridgeEventRootHexes: anchorObservations
          ?.map(observation =>
            normalizeBridgeEventRootHex(observation.expectedBridgeEventRootHex) ?? observation.expectedBridgeEventRootHex,
          ) ?? [],
        observedAtValues: anchorObservations?.map(observation => observation.observedAt) ?? [],
        nodeHeights: anchorObservations?.map(observation => observation.nodeHeight) ?? [],
        ...(anchorSource?.ergoNodeUrl ? { ergoNodeUrl: anchorSource.ergoNodeUrl } : {}),
      } : {}),
      readOnlyNodeClient: anchorMode === 'live-read-only-node',
      nodeAuthHeader: anchorMode === 'live-read-only-node' ? 'not-used' : 'not-applicable',
      operations: anchorMode === 'live-read-only-node'
        ? ['/info', 'Ergo extension fields at aggregate anchor heights', '0x0401 bridgeEventRoot matching']
        : [],
    },
    singletonCheckpoint: {
      mode,
      ...(singletonTarget ? { target: singletonTarget } : {}),
      ...(mode !== 'unspecified' && singletonCheckpoint ? {
        observedAt: singletonCheckpoint.observedAt,
        nodeHeight: singletonCheckpoint.nodeHeight,
        expectedTxId: singletonCheckpoint.expectedTxId,
        deployedStateHash: singletonCheckpoint.deployedStateHash,
        singletonCount: singletonCheckpoint.singletons.length,
        ...(singletonSource?.ergoNodeUrl ? { ergoNodeUrl: singletonSource.ergoNodeUrl } : {}),
      } : {}),
      readOnlyNodeClient: mode === 'live-read-only-node',
      nodeAuthHeader: mode === 'live-read-only-node' ? 'not-used' : 'not-applicable',
      operations: mode === 'live-read-only-node'
        ? ['/info', 'singleton boxes by token ID', 'mempool/unconfirmed transaction lookup', 'confirmed transaction lookup']
        : [],
    },
    heightEvidence: {
      mode: heightMode,
      ...(heightTarget ? { target: heightTarget } : {}),
      ...(heightMode !== 'unspecified' && heightEvidence ? {
        observedAt: heightEvidence.observedAt,
        ergoNodeHeight: heightEvidence.ergoNodeHeight,
        sidechainBlockHeight: heightEvidence.sidechainBlockHeight,
        broadcastEnabled: heightEvidence.broadcastEnabled,
        ...(heightSource?.ergoNodeUrl ? { ergoNodeUrl: heightSource.ergoNodeUrl } : {}),
        ...(heightSource?.sidechainRpcUrl ? { sidechainRpcUrl: heightSource.sidechainRpcUrl } : {}),
      } : {}),
      readOnlyErgoNodeClient: heightMode === 'live-read-only-sources',
      readOnlySidechainRpcClient: heightMode === 'live-read-only-sources',
      nodeAuthHeader: heightMode === 'live-read-only-sources' ? 'not-used' : 'not-applicable',
      operations: heightMode === 'live-read-only-sources'
        ? ['/info', 'EVM getBlockNumber']
        : [],
    },
  };
}

export async function collectFreshTestnetSingletonCheckpoint(input: {
  ergo: Pick<ErgoClient, 'getBoxesByTokenId' | 'getInfo' | 'hasUnconfirmedTransaction' | 'getTransaction'>;
  deployedState: DeployedState;
  deployedStateHash: string;
  expectedTxId: string;
  now?: Date;
}): Promise<FreshTestnetSingletonCheckpoint> {
  const info = await input.ergo.getInfo();
  const singletons = deployedSingletons(input.deployedState);
  const observations: FreshTestnetSingletonObservation[] = [];
  for (const singleton of singletons) {
    const boxes = await input.ergo.getBoxesByTokenId(singleton.nftId);
    const box = boxes[0] ?? {};
    observations.push({
      name: singleton.name,
      nftId: singleton.nftId,
      expectedBoxId: singleton.boxId,
      observedBoxId: normalizeHexId(String(box.boxId ?? box.id ?? '')),
      expectedErgoTreeHex: normalizeHexId(singleton.ergoTreeHex),
      observedErgoTreeHex: normalizeHexId(String(box.ergoTree ?? box.ergoTreeHex ?? '')),
      observedCount: boxes.length,
    });
  }

  return {
    deployedStateHash: normalizeHexId(input.deployedStateHash),
    observedAt: (input.now ?? new Date()).toISOString(),
    nodeHeight: info.fullHeight,
    nodeNetwork: info.network,
    expectedTxId: normalizeHexId(input.expectedTxId),
    expectedTxMempoolAbsent: !(await input.ergo.hasUnconfirmedTransaction(input.expectedTxId)),
    expectedTxConfirmedAbsent: (await input.ergo.getTransaction(input.expectedTxId)) === null,
    singletons: observations,
  };
}

function deployedSingletons(deployedState: DeployedState): Array<{
  name: string;
  nftId: string;
  boxId?: string;
  ergoTreeHex: string;
}> {
  const singletons: Array<{
    name: string;
    nftId: string;
    boxId?: string;
    ergoTreeHex: string;
  }> = [
    { name: 'sideChainState', ...deployedState.sideChainState },
    { name: 'doubleUnlockPrevention', ...deployedState.doubleUnlockPrevention },
  ];
  if (deployedState.doubleUnlockPreventionAggregate) {
    singletons.push({
      name: 'doubleUnlockPreventionAggregate',
      ...deployedState.doubleUnlockPreventionAggregate,
    });
  }
  if (deployedState.spvTracker) {
    singletons.push({ name: 'spvTracker', ...deployedState.spvTracker });
  }
  if (deployedState.doubleUnlockPreventionAggregateBatch) {
    singletons.push({
      name: 'doubleUnlockPreventionAggregateBatch',
      ...deployedState.doubleUnlockPreventionAggregateBatch,
    });
  }
  return singletons;
}

function validateSingletonCheckpoint(
  checkpoint: FreshTestnetSingletonCheckpoint | undefined,
  source: FreshTestnetSingletonCheckpointSource | undefined,
  record: AggregateSettlementPrebroadcastEvidenceRecord,
  currentErgoHeight: string | number,
  ergoNodeNetwork: string,
  deployedState: DeployedState | undefined,
  deployedStateHash: string | undefined,
  now: Date,
): string[] {
  if (!checkpoint) return ['live singleton checkpoint: read-only singleton checkpoint is required'];
  const errors: string[] = [];
  if (!source) {
    errors.push('live singleton checkpoint: source binding is required');
  } else if (source.mode === 'provided-json' && !isConcreteSingletonCheckpointJsonTarget(source.target ?? '')) {
    errors.push('live singleton checkpoint: provided-json source target must cite a concrete non-template singleton checkpoint JSON target');
  } else if (source.mode === 'live-read-only-node') {
    errors.push(...validateReadOnlyEndpointBinding(
      source.ergoNodeUrl,
      'live singleton checkpoint: source binding ergoNodeUrl',
    ));
  }
  if (!/^[0-9a-f]{64}$/i.test(normalizeHexId(checkpoint.deployedStateHash))) {
    errors.push('live singleton checkpoint: deployed-state hash must be 32-byte hex');
  } else if (deployedStateHash && normalizeHexId(checkpoint.deployedStateHash) !== normalizeHexId(deployedStateHash)) {
    errors.push('live singleton checkpoint: deployed-state hash must match current deployed_state.json');
  }
  if (!isIsoUtcTimestamp(checkpoint.observedAt)) {
    errors.push('live singleton checkpoint: observedAt must be an ISO UTC timestamp');
  } else {
    errors.push(...validateObservedAtWindow(
      checkpoint.observedAt,
      now,
      'live singleton checkpoint: observedAt',
    ));
  }
  if (normalizeHexId(checkpoint.expectedTxId) !== normalizeHexId(record.transactionCheck.expectedTxId)) {
    errors.push('live singleton checkpoint: Expected transaction ID must match aggregate evidence');
  }
  if (checkpoint.expectedTxMempoolAbsent !== true) {
    errors.push('live singleton checkpoint: Expected transaction ID must be absent from mempool');
  }
  if (checkpoint.expectedTxConfirmedAbsent !== true) {
    errors.push('live singleton checkpoint: Expected transaction ID must be absent from confirmed chain');
  }
  if (!identifiesPositiveTestnetNetwork(checkpoint.nodeNetwork)) {
    errors.push('live singleton checkpoint: node network must positively identify testnet');
  } else if (checkpoint.nodeNetwork.trim().toLowerCase() !== ergoNodeNetwork.trim().toLowerCase()) {
    errors.push('live singleton checkpoint: node network must match declared Ergo node network');
  }
  const nodeHeight = parseSafeHeight(checkpoint.nodeHeight);
  const current = parseSafeHeight(currentErgoHeight);
  if (nodeHeight === undefined) {
    errors.push('live singleton checkpoint: node height must be a non-negative integer');
  } else if (current !== undefined && nodeHeight !== current) {
    errors.push('live singleton checkpoint: node height must match Current Ergo height');
  }
  if (checkpoint.singletons.length === 0) {
    errors.push('live singleton checkpoint: at least one singleton observation is required');
  }
  const expectedSingletons = deployedState ? new Map(
    deployedSingletons(deployedState).map(singleton => [singleton.name, singleton]),
  ) : undefined;
  if (expectedSingletons && checkpoint.singletons.length !== expectedSingletons.size) {
    errors.push('live singleton checkpoint: singleton observation set must match current deployed_state.json');
  }
  const names = new Set<string>();
  const nftIds = new Set<string>();
  for (const [index, singleton] of checkpoint.singletons.entries()) {
    const prefix = `live singleton checkpoint singleton[${index}]`;
    if (isBlank(singleton.name)) errors.push(`${prefix}: name is required`);
    if (names.has(singleton.name)) errors.push(`${prefix}: singleton name must be unique`);
    names.add(singleton.name);
    if (!/^[0-9a-f]{64}$/i.test(normalizeHexId(singleton.nftId))) {
      errors.push(`${prefix}: NFT ID must be 32-byte hex`);
    }
    const expectedSingleton = expectedSingletons?.get(singleton.name);
    if (expectedSingletons && !expectedSingleton) {
      errors.push(`${prefix}: singleton name must exist in current deployed_state.json`);
    }
    if (expectedSingleton && normalizeHexId(singleton.nftId) !== normalizeHexId(expectedSingleton.nftId)) {
      errors.push(`${prefix}: NFT ID must match current deployed_state.json`);
    }
    if (nftIds.has(normalizeHexId(singleton.nftId))) errors.push(`${prefix}: NFT ID must be unique`);
    nftIds.add(normalizeHexId(singleton.nftId));
    if (singleton.observedCount !== 1) {
      errors.push(`${prefix}: observed singleton count must be exactly 1`);
    }
    if (!/^[0-9a-f]{64}$/i.test(normalizeHexId(singleton.observedBoxId))) {
      errors.push(`${prefix}: observed box ID must be 32-byte hex`);
    }
    if (singleton.expectedBoxId && normalizeHexId(singleton.expectedBoxId) !== normalizeHexId(singleton.observedBoxId)) {
      errors.push(`${prefix}: observed box ID must match deployed_state box ID`);
    }
    if (expectedSingleton?.boxId && !singleton.expectedBoxId) {
      errors.push(`${prefix}: expected box ID is required for current deployed_state.json binding`);
    }
    if (expectedSingleton?.boxId && normalizeHexId(singleton.observedBoxId) !== normalizeHexId(expectedSingleton.boxId)) {
      errors.push(`${prefix}: observed box ID must match current deployed_state.json`);
    }
    if (expectedSingleton?.boxId && singleton.expectedBoxId && normalizeHexId(singleton.expectedBoxId) !== normalizeHexId(expectedSingleton.boxId)) {
      errors.push(`${prefix}: expected box ID must match current deployed_state.json`);
    }
    if (expectedSingleton && normalizeHexId(singleton.expectedErgoTreeHex) !== normalizeHexId(expectedSingleton.ergoTreeHex)) {
      errors.push(`${prefix}: expected ErgoTree must match current deployed_state.json`);
    }
    if (normalizeHexId(singleton.expectedErgoTreeHex) !== normalizeHexId(singleton.observedErgoTreeHex)) {
      errors.push(`${prefix}: observed ErgoTree must match deployed_state ErgoTree`);
    }
  }
  if (expectedSingletons) {
    for (const expectedName of expectedSingletons.keys()) {
      if (!names.has(expectedName)) {
        errors.push(`live singleton checkpoint: missing ${expectedName} observation from current deployed_state.json`);
      }
    }
  }
  return errors;
}

function isConcreteSingletonCheckpointJsonTarget(target: string): boolean {
  const normalizedTarget = target.trim().replace(/\\/g, '/').toLowerCase();
  return (
    normalizedTarget.endsWith('.json') &&
    !isAbsolute(target) &&
    !/[<>]/.test(normalizedTarget) &&
    !normalizedTarget.includes('://') &&
    !hasNonConcreteFreshCheckpointJsonTarget(normalizedTarget) &&
    !isLocalOnlyJsonTarget(normalizedTarget) &&
    !isSensitiveOrRuntimeJsonTarget(normalizedTarget)
  );
}

function validateConcreteHeightEvidenceJsonTarget(target: string): { targetLabel: string; errors: string[] } {
  const sanitizedTargetLabel = formatHeightEvidenceJsonTargetLabel(target);
  const normalizedTarget = target.trim().replace(/\\/g, '/').toLowerCase();
  const pathErrors = validateAggregateSettlementEvidenceJsonPath(target).map(error =>
    normalizeAggregateEvidenceReadPathError(error)
      .replace(/<blocked evidence JSON target>/g, blockedHeightEvidenceJsonTargetLabel)
      .replace('aggregate evidence output', 'height evidence JSON')
      .replace('aggregate evidence', 'height evidence'),
  );
  if (pathErrors.length > 0) {
    return {
      targetLabel: pathErrors.some(error => error.includes(blockedHeightEvidenceJsonTargetLabel))
        ? blockedHeightEvidenceJsonTargetLabel
        : sanitizedTargetLabel,
      errors: pathErrors,
    };
  }

  if (hasNonConcreteFreshCheckpointJsonTarget(normalizedTarget)) {
    return {
      targetLabel: blockedHeightEvidenceJsonTargetLabel,
      errors: [
        `${blockedHeightEvidenceJsonTargetLabel}: refusing to read ${nonConcreteFreshCheckpointJsonTargetLabel} targets as height evidence JSON`,
      ],
    };
  }
  if (!isConcreteHeightEvidenceJsonTarget(target)) {
    return {
      targetLabel: blockedHeightEvidenceJsonTargetLabel,
      errors: [`${blockedHeightEvidenceJsonTargetLabel}: refusing to read non-concrete height evidence JSON targets`],
    };
  }

  return { targetLabel: sanitizedTargetLabel, errors: [] };
}

function formatHeightEvidenceJsonTargetLabel(target: string): string {
  const label = formatAggregateSettlementEvidenceJsonPathLabel(target);
  return label === '<blocked evidence JSON target>' ? blockedHeightEvidenceJsonTargetLabel : label;
}

function normalizeAggregateEvidenceReadPathError(error: string): string {
  return error
    .replace(
      `${blockedAggregateEvidenceJsonTargetLabel}: refusing to write evidence JSON paths outside the bridge repository`,
      `${blockedAggregateEvidenceJsonTargetLabel}: must resolve inside the bridge repository`,
    )
    .replace('refusing to write', 'refusing to read')
    .replace('aggregate evidence output', 'aggregate evidence input');
}

function isConcreteHeightEvidenceJsonTarget(target: string): boolean {
  const normalizedTarget = target.trim().replace(/\\/g, '/').toLowerCase();
  return (
    normalizedTarget.endsWith('.json') &&
    !isAbsolute(target) &&
    !/[<>]/.test(normalizedTarget) &&
    !normalizedTarget.includes('://') &&
    !hasNonConcreteFreshCheckpointJsonTarget(normalizedTarget) &&
    !isLocalOnlyJsonTarget(normalizedTarget) &&
    !isSensitiveOrRuntimeJsonTarget(normalizedTarget)
  );
}

function hasNonConcreteFreshCheckpointJsonTarget(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\\/]+/)
    .some(segment => isNonConcreteFreshCheckpointJsonTargetSegment(segment));
}

function isNonConcreteFreshCheckpointJsonTargetSegment(segment: string): boolean {
  const normalized = segment.toLowerCase().replace(/\.[a-z0-9]+$/i, '');
  return (
    /[<>]/.test(segment) ||
    /(?:^|[-_.])(?:placeholder|generic|todo|tbd)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:sample|example)[-_ ]*evidence(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:sample|example|template)(?:[-_.](?:singleton|checkpoint|height|evidence|json|fresh|target|artifact|output|report)|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:singleton|checkpoint|height|evidence|json|fresh|target|artifact|output|report)(?:[-_.](?:sample|example|template)(?:[-_.]|$))/i.test(normalized)
  );
}

function isLocalOnlyJsonTarget(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(isLocalOnlyJsonInspectionTarget);
}

function isLocalOnlyJsonInspectionTarget(normalizedTarget: string): boolean {
  return (
    hasEvidenceLocalOnlyInspectionReference(normalizedTarget) ||
    /^file:\/\//i.test(normalizedTarget) ||
    /^[a-z]:\//i.test(normalizedTarget) ||
    /^\/\/[^/]/.test(normalizedTarget) ||
    /^\/(?:users?|home|tmp|var|private|mnt|volumes|etc)(?:\/|$)/i.test(normalizedTarget)
  );
}

function isSensitiveOrRuntimeJsonTarget(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(isSensitiveOrRuntimeJsonInspectionTarget);
}

function isSensitiveOrRuntimeJsonInspectionTarget(normalizedTarget: string): boolean {
  const name = basename(normalizedTarget);
  return (
    hasSensitiveJsonEnvironmentTargetSegment(normalizedTarget) ||
    hasSensitiveJsonRuntimeDatabaseTargetSegment(normalizedTarget) ||
    isEvidenceEnvironmentFileName(name) ||
    isEvidenceSecretOrRuntimeName(normalizedTarget, { includeDeployedState: true }) ||
    isEvidenceRuntimeDatabaseTarget(normalizedTarget)
  );
}

function hasSensitiveJsonEnvironmentTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\/\s,;=()]+/)
    .some(segment => segment !== normalizedTarget && isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasSensitiveJsonRuntimeDatabaseTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\s,;=()]+/)
    .some(segment => segment !== normalizedTarget && isEvidenceRuntimeDatabaseTarget(segment.replace(/[),;]+$/g, '')));
}

function formatSensitiveSourceTargetLabel(target: string, blockedLabel: string): string {
  const normalizedTarget = target.trim().replace(/\\/g, '/').toLowerCase();
  return isLocalOnlyJsonTarget(normalizedTarget) || isSensitiveOrRuntimeJsonTarget(normalizedTarget)
    ? blockedLabel
    : target;
}

function validateReadOnlyEndpointBinding(value: unknown, label: string): string[] {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return [`${label} must cite a concrete read-only http(s) URL`];
  }
  const normalized = value.trim().toLowerCase();
  if (/[<>]/.test(normalized) || /\b(?:template|example|sample|generic|placeholder|todo|tbd)\b/.test(normalized)) {
    return [`${label} must cite a concrete non-template read-only http(s) URL`];
  }
  if (internalFixtureEndpointPattern.test(normalized)) {
    return [`${label} must cite a concrete read-only endpoint, not an internal fixture/mock/dummy/fake/stub/testdata/synthetic/simulated URL`];
  }
  return validateReadOnlyNodeUrl(value, label);
}

function renderMarkdown(input: FreshTestnetCheckpointInput, checkpoint: FreshTestnetCheckpointSummary): string {
  const date = (input.now ?? new Date()).toISOString().slice(0, 10);
  return `# Fresh Testnet Non-Broadcast Checkpoint

This checkpoint records a fresh testnet aggregate settlement check. It is not a live lifecycle pass. It does not authorize broadcast, does not submit a transaction, does not observe confirmation, and does not perform reconciliation.

## Scope

- Date: ${date}
- Environment: testnet
- Ergo node network: ${checkpoint.ergoNodeNetwork}
- Sidechain network: ${checkpoint.sidechainNetwork}
- Current Ergo height: ${checkpoint.currentErgoHeight}
- Current sidechain height: ${checkpoint.currentSidechainHeight}
- Height evidence observedAt: ${checkpoint.heightEvidence?.observedAt ?? '<missing>'}
- Height evidence Ergo node height: ${checkpoint.heightEvidence?.ergoNodeHeight ?? '<missing>'}
- Height evidence sidechain block height: ${checkpoint.heightEvidence?.sidechainBlockHeight ?? '<missing>'}
- Height evidence Ergo source: ${checkpoint.heightEvidence?.sources.ergo ?? '<missing>'}
- Height evidence sidechain source: ${checkpoint.heightEvidence?.sources.sidechain ?? '<missing>'}
- Height evidence broadcast enabled: ${checkpoint.heightEvidence?.broadcastEnabled === false ? 'no' : '<missing>'}
- Aggregate evidence JSON: ${checkpoint.aggregateEvidence}
- Transaction check endpoint: /transactions/check
- Transaction check result: PASS
- Broadcast: no
- Expected transaction ID: ${checkpoint.expectedTxId}
- Peg-out burn TX IDs: ${checkpoint.burnTxHashes.join(',')}
- Sidechain block heights: ${checkpoint.sidechainBlockHeights.join(',')}
- Sidechain block hashes: ${checkpoint.sidechainHeaderHashHexes.join(',')}
- Ergo anchor heights: ${checkpoint.ergoAnchorHeights.join(',')}
- Bridge event roots: ${formatBridgeEventRootCsv(checkpoint.bridgeEventRootHexes)}
- Live anchor observations: ${formatAnchorObservations(checkpoint.anchorObservations)}
- Deployed-state hash: ${checkpoint.singletonCheckpoint?.deployedStateHash ?? '<missing live singleton checkpoint>'}
- Live singleton checkpoint observedAt: ${checkpoint.singletonCheckpoint?.observedAt ?? '<missing>'}
- Live singleton checkpoint checkedAt: ${checkpoint.singletonObservationFreshness?.checkedAt ?? '<missing>'}
- Live singleton checkpoint max age seconds: ${checkpoint.singletonObservationFreshness?.maxAgeSeconds ?? '<missing>'}
- Live singleton checkpoint max age minutes: ${checkpoint.singletonObservationFreshness?.maxAgeMinutes ?? '<missing>'}
- Live singleton checkpoint age seconds: ${checkpoint.singletonObservationFreshness?.ageSeconds ?? '<missing>'}
- Live singleton checkpoint age ms: ${checkpoint.singletonObservationFreshness?.ageMs ?? '<missing>'}
- Live singleton checkpoint freshness: ${checkpoint.singletonObservationFreshness?.status ?? '<missing>'}
- Live singleton checkpoint node height: ${checkpoint.singletonCheckpoint?.nodeHeight ?? '<missing>'}
- Live singleton checkpoint node network: ${checkpoint.singletonCheckpoint?.nodeNetwork ?? '<missing>'}
- Expected transaction absent from mempool: ${checkpoint.singletonCheckpoint?.expectedTxMempoolAbsent ? 'yes' : 'no'}
- Expected transaction absent from confirmed chain: ${checkpoint.singletonCheckpoint?.expectedTxConfirmedAbsent ? 'yes' : 'no'}
- Live singleton observations: ${formatSingletonObservations(checkpoint.singletonCheckpoint)}

## Lifecycle Gate Classification

| Release gate | Status | Evidence artifact | Blocking note | Required next evidence |
|---|---|---|---|---|
| Fresh testnet lifecycle | publication blocker | ${checkpoint.aggregateEvidence} | Non-broadcast /transactions/check evidence captured; legacy V1 live settlement remains quarantined. | Activate a reviewed, separately versioned external-fee settlement profile with exact target-node acceptance, on-chain funds-authority transition, legacy route retirement, and replay-lineage evidence. |

## Boundary

- Fresh testnet lifecycle pass allowed: no
- Broadcast authorized: no
- Live submit performed: no
- Confirmation observed: no
- Reconciliation performed: no
- Gate 3 closure allowed: no
- Production-ready claim allowed: no
- Testnet production-candidate claim allowed: no
`;
}

function formatSingletonObservations(checkpoint: FreshTestnetSingletonCheckpoint | undefined): string {
  if (!checkpoint) return '<missing>';
  return checkpoint.singletons
    .map(singleton => `${singleton.name}:${singleton.observedBoxId}:count=${singleton.observedCount}`)
    .join(',');
}

function formatAnchorObservations(observations: FreshTestnetAnchorObservation[] | undefined): string {
  if (!observations || observations.length === 0) return '<missing>';
  return observations
    .map(observation =>
      `height=${observation.ergoAnchorHeight}:match=${observation.matchingFieldFound ? 'yes' : 'no'}:roots=${observation.observedBridgeEventRootHexes.join(',') || '<none>'}:observedAt=${observation.observedAt}:nodeHeight=${observation.nodeHeight}`,
    )
    .join(';');
}

function buildLines(
  message: string,
  checkpoint: FreshTestnetCheckpointSummary,
  errors: string[],
): string[] {
  const lines = [
    message,
    `- aggregate evidence: ${checkpoint.aggregateEvidence}`,
    `- lifecycle gate: ${checkpoint.lifecycleGate} -> ${checkpoint.lifecycleStatus}`,
    `- current Ergo height: ${checkpoint.currentErgoHeight}`,
    `- current sidechain height: ${checkpoint.currentSidechainHeight}`,
    `- height evidence: ${checkpoint.heightEvidence ? 'linked read-only /info and getBlockNumber' : '<missing>'}`,
    `- Expected transaction ID: ${checkpoint.expectedTxId ?? '<missing>'}`,
    `- burnTxHashes: ${checkpoint.burnTxHashes.join(',') || '<missing>'}`,
    `- live anchor observations: ${checkpoint.anchorObservations ? 'linked read-only extension fields' : '<missing>'}`,
    `- live singleton checkpoint: ${checkpoint.singletonCheckpoint ? 'linked read-only observations' : '<missing>'}`,
    `- live singleton observedAt: ${checkpoint.singletonCheckpoint?.observedAt ?? '<missing>'}`,
    `- live singleton freshness: ${checkpoint.singletonObservationFreshness?.status ?? '<missing>'} ageSeconds=${checkpoint.singletonObservationFreshness?.ageSeconds ?? '<missing>'} maxAgeSeconds=${checkpoint.singletonObservationFreshness?.maxAgeSeconds ?? '<missing>'}`,
    '- scope: offline non-broadcast checkpoint only; no signing, submit, confirmation, reconciliation, node mutation, or broadcast command executed.',
  ];
  if (errors.length > 0) {
    lines.push('- Remaining issues:');
    lines.push(...errors.map(error => `  - ${error}`));
    lines.push('- Next safe step: fix aggregate check evidence while keeping broadcast disabled.');
  } else {
    lines.push(`- Legacy V1 submission quarantine: ${LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE}`);
    lines.push('- Next safe step: activate a reviewed, separately versioned external-fee settlement profile and prove target-node acceptance, on-chain funds-authority transition, legacy route retirement, and replay lineage.');
  }
  return lines;
}

function isAggregateRecordLike(value: unknown): value is AggregateSettlementPrebroadcastEvidenceRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'transactionCheck' in value && 'claims' in value && 'broadcast' in value;
}

function identifiesPositiveTestnetNetwork(value: string): boolean {
  return /\btest[- ]?net\b/i.test(value) && !hasForbiddenNetworkWording(value);
}

function identifiesAllowedSidechainNetwork(value: string): boolean {
  if (isBlank(value) || hasForbiddenNetworkWording(value)) return false;
  return (
    /\bpatched[- ]?devnet\b/i.test(value) ||
    /\btest[- ]?net\b/i.test(value) ||
    /\bnon[- ]?main[- ]?net\b/i.test(value)
  );
}

function hasForbiddenNetworkWording(value: string): boolean {
  const valueWithoutNonMainnet = value.replace(/\bnon[- ]?main[- ]?net\b/gi, '');
  return (
    /\b(?:main[- ]?net|main\s+network|main[- ]?chain|mainchain)\b/i.test(valueWithoutNonMainnet) ||
    /\b(?:non[- ]?test[- ]?net|no|not|without|missing|absent|unavailable|unconnected|disconnected)\b.{0,80}\btest[- ]?net\b/i.test(value) ||
    /\btest[- ]?net\b.{0,80}\b(?:not|missing|absent|unavailable|unconnected|disconnected)\b/i.test(value)
  );
}

function isBlank(value: string): boolean {
  return value.trim().length === 0 || /\s\/\s/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isIsoUtcTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function validateObservedAtWindow(observedAt: string, now: Date, label: string): string[] {
  const observedMs = new Date(observedAt).valueOf();
  const nowMs = now.valueOf();
  if (!Number.isFinite(observedMs) || !Number.isFinite(nowMs)) {
    return [`${label} must be compared against a valid current time`];
  }
  if (observedMs > nowMs) {
    return [`${label} must not be in the future`];
  }
  return nowMs - observedMs <= maxObservationAgeMs
    ? []
    : [`${label} must be no older than 15 minutes`];
}

function summarizeObservationFreshness(
  observedAt: string | undefined,
  now: Date,
): FreshTestnetObservationFreshness | undefined {
  if (!observedAt || !isIsoUtcTimestamp(observedAt)) return undefined;
  const observedMs = new Date(observedAt).valueOf();
  const checkedAt = now.toISOString();
  const ageMs = now.valueOf() - observedMs;
  return {
    observedAt,
    checkedAt,
    maxAgeSeconds: 900,
    maxAgeMinutes: 15,
    ageSeconds: Math.floor(ageMs / 1000),
    ageMs,
    status: ageMs < 0 ? 'future' : ageMs <= maxObservationAgeMs ? 'fresh' : 'stale',
  };
}

function normalizeHexId(value: string): string {
  return value.trim().replace(/^0x/i, '').toLowerCase();
}

function isInsidePath(path: string, parent: string): boolean {
  const relativePath = relative(parent, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}
