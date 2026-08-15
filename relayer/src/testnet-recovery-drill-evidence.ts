import { basename } from 'path';

import {
  evidenceTargetInspectionVariants,
  hasEvidenceLocalOnlyInspectionReference,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from './evidence-sensitive-target.js';
import { normalizeEvidenceMarkerText } from './evidence-hygiene.js';
import { classifyPublicationClaimText } from './publication-claim-boundary.js';

export type TestnetRecoveryDrillKind =
  | 'failed-broadcast-phantom-avl'
  | 'reorged-burn-stale-singleton';

export interface TestnetRecoveryDrillEvidenceInput {
  kind: TestnetRecoveryDrillKind;
  evidenceArtifact: string;
  validationArtifact: string;
  observationArtifact: string;
  pegOutBurnTxId: string;
  expectedTxId?: string;
  singletonInventoryId?: string;
}

export interface TestnetRecoveryDrillEvidenceReport {
  status: 'CREATED' | 'BLOCKED';
  message: string;
  errors: string[];
  recoveryBoundary: TestnetRecoveryDrillBoundary;
  markdown?: string;
  lines: string[];
}

export interface TestnetRecoveryDrillBoundary {
  evidenceAssemblyOnly: true;
  signingPerformed: false;
  nodeQueryPerformed: false;
  liveSubmitPerformed: false;
  confirmationObserved: false;
  reconciliationPerformed: false;
  broadcastAuthorized: false;
  gate3ClosureAllowed: false;
  productionReadyClaimAllowed: false;
  testnetProductionCandidateClaimAllowed: false;
}

export interface TestnetRecoveryDrillNodeObservation {
  observedAt: string;
  nodeHeight: number;
  nodeNetwork: string;
  expectedTxId?: string;
  confirmedChain?: boolean;
  mempool?: boolean;
}

export interface TestnetRecoveryDrillStateObservation {
  aggregateAttempt?: {
    expectedTxId: string;
    submittedTxId: string | null;
    status: string;
    mode: string;
    burnTxHashes: string[];
  };
  pegOut?: {
    burnTxHash: string;
    status: string;
    phase1BoxId: string | null;
    phase2UnlockTxId: string | null;
    pendingAvlKey: string | null;
  };
  avlKeyPresent: boolean;
  spvTrackerKeyPresent?: boolean;
  pendingDupHeartbeatForTx: boolean;
  reorgCandidate?: {
    burnTxHash: string;
    pendingAvlKey: string | null;
    status: string;
    phase1BoxId: string;
  };
}

export interface TestnetRecoveryDrillObservationInput {
  kind: TestnetRecoveryDrillKind;
  pegOutBurnTxId: string;
  expectedTxId?: string;
  singletonInventoryId?: string;
  node?: TestnetRecoveryDrillNodeObservation;
  state?: TestnetRecoveryDrillStateObservation;
  stateTargetClass?: TestnetRecoveryDrillStateSourceTargetClass;
  now?: Date;
}

export type TestnetRecoveryDrillStateSourceTargetClass =
  | 'operator-provided-state-db';

export interface TestnetRecoveryDrillObservationSourceBindings {
  node: {
    sourceType: 'live-read-only-node';
    readOnly: true;
    noAuthHeader: true;
    observedAt: string;
    nodeHeight: number;
    nodeNetwork: string;
  };
  state: {
    sourceType: 'read-only-state-tracker';
    readOnly: true;
    runtimePathSerialized: false;
    targetClass: TestnetRecoveryDrillStateSourceTargetClass;
  };
}

export interface TestnetRecoveryDrillObservationBoundary {
  readOnlyObservationOnly: true;
  nodeQueryPerformed: boolean;
  stateReadPerformed: boolean;
  signingPerformed: false;
  broadcastAuthorized: false;
  liveSubmitPerformed: false;
  confirmationObserved: false;
  nodeMutationPerformed: false;
  repairPerformed: false;
  stateMutationPerformed: false;
  reconciliationPerformed: false;
  gate3ClosureAllowed: false;
  productionReadyClaimAllowed: false;
  testnetProductionCandidateClaimAllowed: false;
}

export interface TestnetRecoveryDrillObservationReport {
  status: 'PASS' | 'BLOCKED';
  message: string;
  errors: string[];
  kind: TestnetRecoveryDrillKind;
  observedAt: string;
  pegOutBurnTxId: string;
  expectedTxId?: string;
  singletonInventoryId?: string;
  node?: TestnetRecoveryDrillNodeObservation;
  state?: TestnetRecoveryDrillStateObservation;
  sourceBindings?: TestnetRecoveryDrillObservationSourceBindings;
  observationBoundary: TestnetRecoveryDrillObservationBoundary;
  lines: string[];
}

export interface TestnetRecoveryObservationState {
  getAggregateSettlementAttempt(expectedTxId: string): {
    expectedTxId: string;
    submittedTxId: string | null;
    status: string;
    mode: string;
    burnTxHashes: string[];
  } | null;
  getPegOutByTxHash(burnTxHash: string): unknown;
  hasAvlKey(keyHex: string): boolean;
  hasSpvTrackerKey(keyHex: string): boolean;
  getPendingDupHeartbeats(): Array<{ txId: string; keyHex: string }>;
  getPegOutsWithAvlKeysForReorg(): Array<{
    burnTxHash: string;
    pendingAvlKey: string | null;
    status: string;
    phase1BoxId: string;
  }>;
}

export interface TestnetRecoveryObservationErgo {
  getInfo(): Promise<{ fullHeight: number; network: string }>;
  getTransaction(txId: string): Promise<unknown | null>;
  hasUnconfirmedTransaction(txId: string): Promise<boolean>;
}

const ARTIFACT_TARGET_PATTERN = /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s<>]+$/;
const recoveryBoundary: TestnetRecoveryDrillBoundary = {
  evidenceAssemblyOnly: true,
  signingPerformed: false,
  nodeQueryPerformed: false,
  liveSubmitPerformed: false,
  confirmationObserved: false,
  reconciliationPerformed: false,
  broadcastAuthorized: false,
  gate3ClosureAllowed: false,
  productionReadyClaimAllowed: false,
  testnetProductionCandidateClaimAllowed: false,
};

export async function observeTestnetRecoveryDrill(input: {
  kind: TestnetRecoveryDrillKind;
  pegOutBurnTxId: string;
  expectedTxId?: string;
  singletonInventoryId?: string;
  ergo: TestnetRecoveryObservationErgo;
  state: TestnetRecoveryObservationState;
  stateTargetClass: TestnetRecoveryDrillStateSourceTargetClass;
  now?: Date;
}): Promise<TestnetRecoveryDrillObservationReport> {
  const errors: string[] = [];
  const pegOutBurnTxId = normalizeHex32(input.pegOutBurnTxId, 'peg-out burn TX ID', errors);
  const expectedTxId = input.expectedTxId
    ? normalizeHex32(input.expectedTxId, 'Expected transaction ID', errors)
    : '';
  const singletonInventoryId = input.singletonInventoryId
    ? normalizeHex32(input.singletonInventoryId, 'singleton inventory identifier', errors)
    : '';
  if (errors.length > 0) {
    return buildTestnetRecoveryDrillObservation({
      kind: input.kind,
      pegOutBurnTxId: input.pegOutBurnTxId,
      expectedTxId: input.expectedTxId,
      singletonInventoryId: input.singletonInventoryId,
      now: input.now,
    });
  }

  const observedAt = (input.now ?? new Date()).toISOString();
  const info = await input.ergo.getInfo();
  const confirmedChain = expectedTxId ? !!await input.ergo.getTransaction(expectedTxId) : undefined;
  const mempool = expectedTxId && !confirmedChain
    ? await input.ergo.hasUnconfirmedTransaction(expectedTxId)
    : expectedTxId ? false : undefined;
  const aggregateAttempt = expectedTxId
    ? input.state.getAggregateSettlementAttempt(expectedTxId) ?? undefined
    : undefined;
  const pegOut =
    normalizePegOutObservation(input.state.getPegOutByTxHash(pegOutBurnTxId)) ??
    normalizePegOutObservation(input.state.getPegOutByTxHash(`0x${pegOutBurnTxId}`));
  const pendingDupHeartbeats = input.state.getPendingDupHeartbeats();
  const reorgCandidate = input.state.getPegOutsWithAvlKeysForReorg()
    .find(row => normalizeHexId(row.burnTxHash) === pegOutBurnTxId);

  return buildTestnetRecoveryDrillObservation({
    kind: input.kind,
    pegOutBurnTxId,
    expectedTxId: expectedTxId || undefined,
    singletonInventoryId: singletonInventoryId || undefined,
    stateTargetClass: input.stateTargetClass,
    now: input.now,
    node: {
      observedAt,
      nodeHeight: info.fullHeight,
      nodeNetwork: info.network,
      ...(expectedTxId ? {
        expectedTxId,
        confirmedChain,
        mempool,
      } : {}),
    },
    state: {
      aggregateAttempt,
      pegOut,
      avlKeyPresent: input.state.hasAvlKey(pegOutBurnTxId),
      ...(singletonInventoryId ? {
        spvTrackerKeyPresent: input.state.hasSpvTrackerKey(singletonInventoryId),
      } : {}),
      pendingDupHeartbeatForTx: expectedTxId
        ? pendingDupHeartbeats.some(row => normalizeHexId(row.txId) === expectedTxId)
        : false,
      reorgCandidate,
    },
  });
}

export function buildTestnetRecoveryDrillObservation(
  input: TestnetRecoveryDrillObservationInput,
): TestnetRecoveryDrillObservationReport {
  const errors: string[] = [];
  const pegOutBurnTxId = normalizeHex32(input.pegOutBurnTxId, 'peg-out burn TX ID', errors);
  const expectedTxId = input.expectedTxId
    ? normalizeHex32(input.expectedTxId, 'Expected transaction ID', errors)
    : '';
  const singletonInventoryId = input.singletonInventoryId
    ? normalizeHex32(input.singletonInventoryId, 'singleton inventory identifier', errors)
    : '';
  const observedAt = (input.now ?? new Date()).toISOString();

  if (input.kind === 'failed-broadcast-phantom-avl' && expectedTxId.length === 0) {
    errors.push('Expected transaction ID is required for failed-broadcast recovery observation');
  }
  if (input.kind === 'reorged-burn-stale-singleton' && singletonInventoryId.length === 0) {
    errors.push('singleton inventory identifier is required for reorged-burn recovery observation');
  }
  errors.push(...validateRecoveryNodeObservation(input.kind, input.node, expectedTxId));
  errors.push(...validateRecoveryStateObservation(
    input.kind,
    input.state,
    pegOutBurnTxId,
    expectedTxId,
  ));
  if (input.node && input.state && input.stateTargetClass !== 'operator-provided-state-db') {
    errors.push('recovery observation state source target class must be operator-provided-state-db');
  }

  const boundary: TestnetRecoveryDrillObservationBoundary = {
    readOnlyObservationOnly: true,
    nodeQueryPerformed: input.node !== undefined,
    stateReadPerformed: input.state !== undefined,
    signingPerformed: false,
    broadcastAuthorized: false,
    liveSubmitPerformed: false,
    confirmationObserved: false,
    nodeMutationPerformed: false,
    repairPerformed: false,
    stateMutationPerformed: false,
    reconciliationPerformed: false,
    gate3ClosureAllowed: false,
    productionReadyClaimAllowed: false,
    testnetProductionCandidateClaimAllowed: false,
  };
  const status = errors.length === 0 ? 'PASS' : 'BLOCKED';
  const message = status === 'PASS'
    ? 'testnet recovery no-broadcast observation PASS'
    : `testnet recovery no-broadcast observation BLOCKED: ${errors.length} issue(s)`;
  const sourceBindings = input.node && input.state && input.stateTargetClass
    ? buildObservationSourceBindings(input)
    : undefined;

  return {
    status,
    message,
    errors,
    kind: input.kind,
    observedAt,
    pegOutBurnTxId,
    ...(expectedTxId ? { expectedTxId } : {}),
    ...(singletonInventoryId ? { singletonInventoryId } : {}),
    ...(input.node ? { node: input.node } : {}),
    ...(input.state ? { state: input.state } : {}),
    ...(sourceBindings ? { sourceBindings } : {}),
    observationBoundary: boundary,
    lines: buildObservationLines(message, input, errors),
  };
}

export function buildTestnetRecoveryDrillEvidence(
  input: TestnetRecoveryDrillEvidenceInput,
): TestnetRecoveryDrillEvidenceReport {
  const errors: string[] = [];
  const pegOutBurnTxId = normalizeHex32(input.pegOutBurnTxId, 'peg-out burn TX ID', errors);
  const expectedTxId = input.expectedTxId
    ? normalizeHex32(input.expectedTxId, 'Expected transaction ID', errors)
    : '';
  const singletonInventoryId = input.singletonInventoryId
    ? normalizeHex32(input.singletonInventoryId, 'singleton inventory identifier', errors)
    : '';

  validateArtifactTarget(input.evidenceArtifact, 'evidence artifact', errors);
  validateArtifactTarget(input.validationArtifact, 'validation artifact', errors);
  validateArtifactTarget(input.observationArtifact, 'observation artifact', errors);
  validateDistinctArtifactTargets(errors, [
    ['evidence artifact', input.evidenceArtifact],
    ['validation artifact', input.validationArtifact],
    ['observation artifact', input.observationArtifact],
  ]);
  validateNoForbiddenText(input.evidenceArtifact, 'evidence artifact', errors);
  validateNoForbiddenText(input.validationArtifact, 'validation artifact', errors);
  validateNoForbiddenText(input.observationArtifact, 'observation artifact', errors);
  validateValidationArtifactKind(input.kind, input.validationArtifact, errors);

  if (input.kind === 'failed-broadcast-phantom-avl' && expectedTxId.length === 0) {
    errors.push('Expected transaction ID is required for failed-broadcast recovery evidence');
  }
  if (input.kind === 'reorged-burn-stale-singleton' && singletonInventoryId.length === 0) {
    errors.push('singleton inventory identifier is required for reorged-burn recovery evidence');
  }

  if (errors.length > 0) {
    return {
      status: 'BLOCKED',
      message: `testnet recovery drill evidence BLOCKED: ${errors.length} issue(s)`,
      errors,
      recoveryBoundary,
      lines: [
        `testnet recovery drill evidence BLOCKED: ${errors.length} issue(s)`,
        '- scope: offline evidence row assembly only; no signing, node query, submit, confirmation, or broadcast command executed.',
        '- Remaining issues:',
        ...errors.map(error => `  - ${error}`),
      ],
    };
  }

  const markdown = renderRecoveryDrillMarkdown({
    ...input,
    pegOutBurnTxId,
    expectedTxId,
    singletonInventoryId,
  });
  return {
    status: 'CREATED',
    message: 'testnet recovery drill evidence CREATED',
    errors: [],
    recoveryBoundary,
    markdown,
    lines: [
      'testnet recovery drill evidence CREATED',
      `- kind: ${input.kind}`,
      `- evidence artifact: ${input.evidenceArtifact}`,
      `- validation artifact: ${input.validationArtifact}`,
      `- observation artifact: ${input.observationArtifact}`,
      `- peg-out burn TX ID: ${pegOutBurnTxId}`,
      '- scope: offline evidence row assembly only; no signing, node query, submit, confirmation, or broadcast command executed.',
    ],
  };
}

function renderRecoveryDrillMarkdown(input: Required<TestnetRecoveryDrillEvidenceInput>): string {
  if (input.kind === 'failed-broadcast-phantom-avl') {
    return (
      '| Failed broadcast / phantom AVL evidence | pass | ' +
      `${input.evidenceArtifact} failed broadcast phantom AVL ` +
      `structured recovery observation PASS observation ${input.observationArtifact} ` +
      `recovery-observe validation target ${input.observationArtifact} ` +
      `npm run rehearsal:recovery-observe:validate command output: PASS recovery-observe JSON validation PASS ` +
      `npm run rehearsal:validate command output: PASS validation ${input.validationArtifact} ` +
      `no phantom DUP AVL history inserted expected transaction ${input.expectedTxId} ` +
      `peg-out burn TX ID ${input.pegOutBurnTxId} | | |`
    );
  }

  return (
    '| Reorged burn / stale singleton evidence | pass | ' +
      `${input.evidenceArtifact} reorged burn stale singleton detected recoverable ` +
      `structured recovery observation PASS observation ${input.observationArtifact} ` +
      `recovery-observe validation target ${input.observationArtifact} ` +
      `npm run rehearsal:recovery-observe:validate command output: PASS recovery-observe JSON validation PASS ` +
      `${formatValidationEvidenceLine(input.validationArtifact)} ` +
    `peg-out burn TX ID ${input.pegOutBurnTxId} singleton inventory ${input.singletonInventoryId} | | |`
  );
}

function formatValidationEvidenceLine(validationArtifact: string): string {
  return identifiesRehearsalValidationArtifact(validationArtifact)
    ? `npm run rehearsal:validate command output: PASS validation ${validationArtifact}`
    : `test evidence command output: PASS validation ${validationArtifact}`;
}

function validateArtifactTarget(value: string, label: string, errors: string[]): void {
  if (!ARTIFACT_TARGET_PATTERN.test(value)) {
    errors.push(`${label} must be a completed artifact:// target`);
  }
  if (
    hasNonConcreteRecoveryEvidenceTargetSegment(value) ||
    hasClaimEscalatingRecoveryEvidenceTarget(value)
  ) {
    errors.push(`${label} must not be a template, placeholder, or non-concrete target`);
  }
}

function hasClaimEscalatingRecoveryEvidenceTarget(target: string): boolean {
  const normalizedTarget = target.split('#')[0].split('?')[0].replace(/[),;]+$/g, '').toLowerCase();
  const claim = classifyPublicationClaimText(normalizedTarget);
  return claim.hasProductionClaim;
}

function hasNonConcreteRecoveryEvidenceTargetSegment(value: string): boolean {
  return value
    .split('#')[0]
    .split('?')[0]
    .replace(/[),;]+$/g, '')
    .toLowerCase()
    .split(/[\\/]+/)
    .some(segment => isNonConcreteRecoveryEvidenceTargetSegment(segment));
}

function isNonConcreteRecoveryEvidenceTargetSegment(segment: string): boolean {
  const normalized = segment.toLowerCase().replace(/\.[a-z0-9]+$/i, '');
  return (
    /[<>]/.test(segment) ||
    /(?:^|[-_.])(?:not[-_]?completed|uncompleted)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:placeholder|generic|todo|tbd)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:sample|example)[-_ ]*evidence(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:sample|example|template)(?:[-_.](?:recovery|drill|failed|broadcast|phantom|avl|reorg|reorged|burn|stale|singleton|observe|observation|rehearsal|validate|validation|artifact|target|log|run|check|row|evidence)|$)/i.test(normalized)
  );
}

function validateDistinctArtifactTargets(
  errors: string[],
  targets: Array<[label: string, target: string]>,
): void {
  const seen = new Map<string, string>();

  for (const [label, target] of targets) {
    const targetErrors: string[] = [];
    validateArtifactTarget(target, 'artifact', targetErrors);
    if (targetErrors.length > 0) continue;

    const normalized = target.replace(/\\/g, '/').toLowerCase();
    const previousLabel = seen.get(normalized);
    if (previousLabel) {
      errors.push(`Recovery drill artifact targets must be distinct: ${previousLabel} and ${label} reuse the same evidence target`);
    } else {
      seen.set(normalized, label);
    }
  }
}

function validateNoForbiddenText(value: string, label: string, errors: string[]): void {
  const normalized = value.toLowerCase().replace(/\\/g, '/');
  if (
    isSharedSensitiveRecoveryText(normalized) ||
    /\b(?:main[- ]?net|main\s+network|main[- ]?chain|mainchain)\b/i.test(stripNonMainnet(normalized)) ||
    recoveryTextEnablesBroadcast(value)
  ) {
    errors.push(`${label} must not reference secrets, local-only paths, mainnet, or enabled broadcast`);
  }
}

function recoveryTextEnablesBroadcast(value: string): boolean {
  const normalized = normalizeEvidenceMarkerText(value);
  const comparable = normalized.replace(/[-_./:=]+/g, ' ');
  return (
    /\bBRIDGE_BROADCAST_ENABLED\s*(?:=|:|is)\s*true\b/i.test(normalized) ||
    /\bbroadcast\s+(?:approved|allowed|certified|endorsed|recommended|accredited)\b/i.test(comparable) ||
    /\b(?:certif(?:y|ied|ies)|endorse(?:d|s)?|recommend(?:ed|s)?|accredit(?:ed|s)?)\s+(?:live\s+)?broadcast(?:\s+approval)?\b/i.test(comparable) ||
    /\blive\s+broadcast\s+approval(?:\s+recorded)?\s*(?:=|:|is)?\s*(?:yes|approved|certified|endorsed|recommended|accredited)\b/i.test(comparable)
  );
}

function isSharedSensitiveRecoveryText(normalized: string): boolean {
  return evidenceTargetInspectionVariants(normalized).some(isSharedSensitiveRecoveryInspectionText);
}

function isSharedSensitiveRecoveryInspectionText(normalized: string): boolean {
  const name = basename(normalized);
  return (
    hasEvidenceLocalOnlyInspectionReference(normalized) ||
    hasRecoveryEnvironmentTargetSegment(normalized) ||
    hasRecoveryRuntimeDatabaseTargetSegment(normalized) ||
    isEvidenceEnvironmentFileName(name) ||
    isEvidenceSecretOrRuntimeName(normalized, { includeDeployedState: true }) ||
    isEvidenceRuntimeDatabaseTarget(normalized)
  );
}

function hasRecoveryEnvironmentTargetSegment(normalized: string): boolean {
  return normalized
    .split(/[\/\s,;=()]+/)
    .some(segment => isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasRecoveryRuntimeDatabaseTargetSegment(normalized: string): boolean {
  return normalized
    .split(/[\s,;=()]+/)
    .some(segment => isEvidenceRuntimeDatabaseTarget(segment.replace(/[),;]+$/g, '')));
}

function validateValidationArtifactKind(
  kind: TestnetRecoveryDrillKind,
  validationArtifact: string,
  errors: string[],
): void {
  const normalized = validationArtifact.toLowerCase();
  const identifiesRehearsalValidation = identifiesRehearsalValidationArtifact(normalized);
  const identifiesTestArtifact = /\b(?:test|vitest|ci|workflow)\b/.test(normalized);

  if (kind === 'failed-broadcast-phantom-avl' && !identifiesRehearsalValidation) {
    errors.push('validation artifact must identify rehearsal:validate evidence for failed-broadcast recovery');
  }
  if (kind === 'reorged-burn-stale-singleton' && !identifiesRehearsalValidation && !identifiesTestArtifact) {
    errors.push('validation artifact must identify rehearsal:validate or test evidence for reorged-burn recovery');
  }
}

function identifiesRehearsalValidationArtifact(value: string): boolean {
  return /rehearsal[-_: ]?validate|rehearsal[-_/].*validate/.test(value.toLowerCase());
}

function stripNonMainnet(value: string): string {
  return value.replace(/\bnon[- ]?main[- ]?net\b/gi, '');
}

function normalizeHex32(value: string, label: string, errors: string[]): string {
  const normalized = value.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    errors.push(`${label} must be 32-byte hex`);
    return '';
  }
  return normalized;
}

function validateRecoveryNodeObservation(
  kind: TestnetRecoveryDrillKind,
  node: TestnetRecoveryDrillNodeObservation | undefined,
  expectedTxId: string,
): string[] {
  if (!node) return ['recovery observation node evidence is required'];
  const errors: string[] = [];
  if (!isIsoUtcTimestamp(node.observedAt)) {
    errors.push('recovery observation node observedAt must be an ISO UTC timestamp');
  }
  if (!Number.isSafeInteger(node.nodeHeight) || node.nodeHeight < 0) {
    errors.push('recovery observation node height must be a non-negative safe integer');
  }
  if (!identifiesPositiveTestnetNetwork(node.nodeNetwork)) {
    errors.push('recovery observation node network must positively identify testnet');
  }
  if (kind === 'failed-broadcast-phantom-avl') {
    if (normalizeHexId(node.expectedTxId) !== expectedTxId) {
      errors.push('recovery observation node Expected transaction ID must match input');
    }
    if (node.confirmedChain !== false) {
      errors.push('recovery observation must prove Expected transaction ID is absent from confirmed chain');
    }
    if (node.mempool !== false) {
      errors.push('recovery observation must prove Expected transaction ID is absent from mempool');
    }
  }
  return errors;
}

function validateRecoveryStateObservation(
  kind: TestnetRecoveryDrillKind,
  state: TestnetRecoveryDrillStateObservation | undefined,
  pegOutBurnTxId: string,
  expectedTxId: string,
): string[] {
  if (!state) return ['recovery observation state evidence is required'];
  const errors: string[] = [];
  if (state.pendingDupHeartbeatForTx) {
    errors.push('recovery observation must prove no pending DUP heartbeat exists for the Expected transaction ID');
  }
  if (state.aggregateAttempt?.status === 'confirmed') {
    errors.push('recovery observation aggregate attempt must not be confirmed');
  }
  if (kind === 'failed-broadcast-phantom-avl') {
    if (!state.aggregateAttempt) {
      errors.push('failed-broadcast observation must include aggregate settlement attempt for Expected transaction ID');
    } else {
      if (normalizeHexId(state.aggregateAttempt.expectedTxId) !== expectedTxId) {
        errors.push('failed-broadcast observation aggregate attempt Expected transaction ID must match input');
      }
      const submittedTxId = normalizeHexId(state.aggregateAttempt.submittedTxId);
      if (state.aggregateAttempt.submittedTxId !== null && submittedTxId !== expectedTxId) {
        errors.push('failed-broadcast observation aggregate submitted transaction ID must be null or match input');
      }
      if (state.aggregateAttempt.status === 'submitted' && submittedTxId !== expectedTxId) {
        errors.push('failed-broadcast submitted aggregate attempt must include submitted transaction ID matching input');
      }
      if (
        (state.aggregateAttempt.status === 'pending' || state.aggregateAttempt.status === 'abandoned') &&
        state.aggregateAttempt.submittedTxId !== null
      ) {
        errors.push('failed-broadcast pending or abandoned aggregate attempt must not include submitted transaction ID');
      }
      if (!state.aggregateAttempt.burnTxHashes.some(value => normalizeHexId(value) === pegOutBurnTxId)) {
        errors.push('failed-broadcast observation aggregate attempt must include the peg-out burn TX ID');
      }
      if (!['pending', 'submitted', 'abandoned'].includes(state.aggregateAttempt.status)) {
        errors.push('failed-broadcast observation aggregate attempt status must be pending, submitted, or abandoned');
      }
    }
    if (!state.pegOut) {
      errors.push('failed-broadcast observation must include peg-out state for the burn');
    } else if (normalizeHexId(state.pegOut.burnTxHash) !== pegOutBurnTxId) {
      errors.push('failed-broadcast observation peg-out burn TX ID must match input');
    }
    if (state.avlKeyPresent) {
      errors.push('failed-broadcast observation must prove no DUP AVL key was inserted for the burn');
    }
    if (state.pegOut && ['phase2_unlocked', 'failed'].includes(state.pegOut.status)) {
      errors.push('failed-broadcast observation peg-out status must not be terminal or reconciled');
    }
  }
  if (kind === 'reorged-burn-stale-singleton') {
    if (state.spvTrackerKeyPresent !== true) {
      errors.push('reorg observation must prove singleton inventory key is present before recovery');
    }
    if (!state.reorgCandidate) {
      errors.push('reorg observation must identify a recoverable stale singleton / pending AVL candidate');
    } else {
      if (!state.reorgCandidate.pendingAvlKey) {
        errors.push('reorg observation candidate must include pending AVL key');
      }
      if (!state.reorgCandidate.phase1BoxId) {
        errors.push('reorg observation candidate must include stale phase1 box ID');
      }
      if (!['phase1_created', 'burn_reverted'].includes(state.reorgCandidate.status)) {
        errors.push('reorg observation candidate status must be phase1_created or burn_reverted');
      }
    }
  }
  return errors;
}

function buildObservationLines(
  message: string,
  input: TestnetRecoveryDrillObservationInput,
  errors: string[],
): string[] {
  return [
    message,
    `- kind: ${input.kind}`,
    `- peg-out burn TX ID: ${normalizeHexId(input.pegOutBurnTxId) ?? '<invalid>'}`,
    ...(input.expectedTxId ? [`- Expected transaction ID: ${normalizeHexId(input.expectedTxId) ?? '<invalid>'}`] : []),
    ...(input.singletonInventoryId ? [`- singleton inventory identifier: ${normalizeHexId(input.singletonInventoryId) ?? '<invalid>'}`] : []),
    `- node query performed: ${input.node ? 'yes read-only' : 'no'}`,
    `- state read performed: ${input.state ? 'yes read-only' : 'no'}`,
    ...(input.node && input.state && input.stateTargetClass
      ? ['- source bindings: live-read-only-node plus read-only state tracker; runtime database path serialized: no']
      : []),
    '- boundary: no signing, no broadcast, no submit, no repair, no state mutation, no reconciliation.',
    ...errors.map(error => `  - ${error}`),
  ];
}

function buildObservationSourceBindings(
  input: TestnetRecoveryDrillObservationInput,
): TestnetRecoveryDrillObservationSourceBindings {
  return {
    node: {
      sourceType: 'live-read-only-node',
      readOnly: true,
      noAuthHeader: true,
      observedAt: input.node!.observedAt,
      nodeHeight: input.node!.nodeHeight,
      nodeNetwork: input.node!.nodeNetwork,
    },
    state: {
      sourceType: 'read-only-state-tracker',
      readOnly: true,
      runtimePathSerialized: false,
      targetClass: 'operator-provided-state-db',
    },
  };
}

function normalizePegOutObservation(value: unknown): TestnetRecoveryDrillStateObservation['pegOut'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as Record<string, unknown>;
  const burnTxHash = normalizeHexId(row.sidechainBurnTxHash ?? row.sidechain_burn_tx_hash);
  if (!burnTxHash) return undefined;
  return {
    burnTxHash,
    status: String(row.status ?? ''),
    phase1BoxId: normalizeOptionalHexId(row.phase1BoxId ?? row.phase1_box_id),
    phase2UnlockTxId: normalizeOptionalHexId(row.phase2UnlockTxId ?? row.phase2_unlock_tx_id),
    pendingAvlKey: normalizeOptionalHexId(row.pendingAvlKey ?? row.pending_avl_key),
  };
}

function normalizeHexId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replace(/^0x/, '');
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : undefined;
}

function normalizeOptionalHexId(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return normalizeHexId(value) ?? null;
}

function isIsoUtcTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value));
}

function identifiesPositiveTestnetNetwork(value: string): boolean {
  const normalized = value.toLowerCase();
  return /\btestnet\b/.test(normalized) &&
    !/\b(?:main[- ]?net|main\s+network|main[- ]?chain|mainchain)\b/.test(stripNonMainnet(normalized)) &&
    !/\b(?:not|no|without)\s+(?:on\s+|using\s+|connected\s+to\s+|the\s+)?testnet\b/.test(normalized);
}
