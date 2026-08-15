import { createHash } from 'crypto';
import { existsSync, realpathSync } from 'fs';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'path';

import blakejs from 'blakejs';

import {
  evidenceTargetInspectionVariants,
  hasEvidenceLocalOnlyInspectionReference,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from './evidence-sensitive-target.js';
import {
  hasStructuredValidationFailureMarker,
  normalizeEvidenceMarkerText,
} from './evidence-hygiene.js';
import { validateEvidenceJsonTargetPath } from './evidence-json-target-path.js';
import { BATCH_UNLOCK_MAX_CLAIMS } from './aggregate-settlement-limits.js';
import { classifyPublicationClaimText } from './publication-claim-boundary.js';
import { deriveTrustlessBurnIdHex } from './trustless-burn-proof.js';
import { canonicalNodeOrigin } from './ergo-node-endpoint-alignment.js';

export interface PreparedSettlementShapeSummary {
  inputCount: number;
  outputCount: number;
  contextExtensionKeyCounts: number[];
  contextExtensionKeyCountsCsv: string;
}

export interface AggregateSettlementPrebroadcastClaimEvidence {
  burnTxHash: string;
  sidechainBlockHeight: number;
  sidechainHeaderHashHex?: string;
  bridgeEventRootHex?: string;
  ergoAnchorHeight?: number;
}

export interface AggregateSettlementPrebroadcastEvidenceInput {
  command: string;
  label: string;
  expectedTxId: string;
  transactionCheckResponse: unknown;
  checkerIdentity: AggregateSettlementPrebroadcastCheckerIdentity;
  settlementShape: PreparedSettlementShapeSummary;
  claims: AggregateSettlementPrebroadcastClaimEvidence[];
  sourceBindings?: AggregateSettlementPrebroadcastSourceBindings;
  generatedAt?: string;
}

export interface AggregateSettlementPrebroadcastCheckerIdentity {
  profile: 'e2s.ergo-node-transactions-check.v1';
  sourceAdapterProfile: 'e2s.ergo-node-json-source.v1';
  nodeOrigin: string;
  path: '/transactions/check';
  method: 'POST';
  transportPolicy: 'no-redirect-no-proxy';
}

export interface AggregateSettlementPrebroadcastStateSourceBinding {
  sourceType: 'read-only-state-tracker';
  input: '--state-db';
  readOnly: true;
  targetClass: 'operator-provided-state-db';
  runtimePathSerialized: false;
  defaultFallbackUsed: false;
  operations: string[];
}

export interface AggregateSettlementPrebroadcastDeployedStateSourceBinding {
  sourceType: 'sanitized-deployed-state-json';
  input: '--deployed-state-json';
  targetClass: 'operator-provided-deployed-state-json';
  runtimePathSerialized: false;
  defaultLoaderUsed: false;
  operations: string[];
}

export interface AggregateSettlementPrebroadcastSourceBindings {
  state: AggregateSettlementPrebroadcastStateSourceBinding;
  deployedState: AggregateSettlementPrebroadcastDeployedStateSourceBinding;
}

export interface AggregateSettlementPrebroadcastEvidenceRecord {
  schemaVersion: 2;
  generatedAt: string;
  command: string;
  label: string;
  stateTrackerMode: 'read-only';
  broadcast: 'no';
  transactionCheck: {
    endpoint: '/transactions/check';
    result: 'PASS';
    expectedTxId: string;
    nodeResponse: unknown;
    nodeResponseKind: TransactionCheckNodeResponseKind;
    nodeResponseDigest: string;
    checkerIdentity: AggregateSettlementPrebroadcastCheckerIdentity;
  };
  claimCount: number;
  claims: AggregateSettlementPrebroadcastClaimEvidence[];
  settlementShape: PreparedSettlementShapeSummary;
  sourceBindings: AggregateSettlementPrebroadcastSourceBindings;
}

export interface TrustlessSettlementCandidateIdentityEvidence {
  source: 'trustless-burn-leaf';
  duplicatePreventionKeyHex: string;
  bridgeEventRootHex: string;
  recipientErgoTreeHashHex: string;
  amountNanoErg: string;
  assetIdHex?: string;
}

export interface AggregateSettlementTrustlessCandidateClaimEvidence {
  legacySidechainTxHash: string;
  sidechainBlockHeight: number;
  trustlessBurnDerivation: {
    sidechainIdHex: string;
    sidechainLogIndex: number;
    derivedBurnIdHex: string;
  };
  settlementIdentity: TrustlessSettlementCandidateIdentityEvidence;
}

export interface AggregateSettlementTrustlessCandidateEvidenceInput {
  label: string;
  claims: AggregateSettlementTrustlessCandidateClaimEvidence[];
  sourceBindings?: AggregateSettlementTrustlessCandidateSourceBindings;
  generatedAt?: string;
}

export interface AggregateSettlementTrustlessCandidateSourceBindings {
  proofVector?: TrustlessSettlementCandidateProofVectorSourceEvidence;
}

export interface TrustlessSettlementCandidateProofVectorSourceEvidence {
  sourceKind: 'trustless-burn-proof-vector';
  target: string;
  targetBurnIdHex: string;
  bridgeEventRootHex: string;
  leafHashHex: string;
  leafCount: number;
  proofNodeCount: number;
  gate5Claim: false;
  contractsChanged: false;
  boundary: 'local-proof-core-candidate-only';
}

export interface AggregateSettlementTrustlessCandidateEvidenceRecord {
  schemaVersion: 1;
  generatedAt: string;
  evidenceKind: 'trustless-settlement-candidate';
  label: string;
  stateTrackerMode: 'read-only';
  broadcast: 'no';
  boundary: {
    gate5Closure: 'no';
    prebroadcastEvidence: 'no';
    settlementReadiness: 'no';
    testnetProductionCandidateClaim: 'no';
    productionReadyClaim: 'no';
  };
  claimCount: number;
  claims: AggregateSettlementTrustlessCandidateClaimEvidence[];
  sourceBindings?: AggregateSettlementTrustlessCandidateSourceBindings;
  contractCompatibility: 'candidate-only-trustless-v2-required';
}

export interface TrustlessUnsignedTxSelectedBoxesEvidence {
  trackerBoxId: string;
  aggregateDupBoxId: string;
  unlockBoxId: string;
}

export interface TrustlessUnsignedTxPayoutBindingEvidence {
  outputIndex: number;
  recipientErgoTreeHex: string;
  recipientErgoTreeHashHex: string;
  amountNanoErg: string;
  recipientHashEqualsProvedBurn: true;
  amountEqualsProvedBurn: true;
}

export interface TrustlessUnsignedTxContextExtensionOffenderEvidence {
  inputIndex: number;
  varCount: number;
  keys: number[];
}

export interface TrustlessUnsignedTxContextExtensionGuardEvidence {
  status: 'pass' | 'blocked';
  reason: 'unsigned-source-boundary-only' | 'context-extension-serialization-conformance';
  effectiveThreshold: number;
  offenderCount: number;
  offenders: TrustlessUnsignedTxContextExtensionOffenderEvidence[];
  signingPermitted: false;
  broadcastPermitted: false;
}

export interface AggregateSettlementTrustlessUnsignedTxEvidenceInput {
  label: string;
  candidateEvidence: AggregateSettlementTrustlessCandidateEvidenceRecord;
  settlementShape: PreparedSettlementShapeSummary;
  selectedBoxes: TrustlessUnsignedTxSelectedBoxesEvidence;
  payoutBinding: TrustlessUnsignedTxPayoutBindingEvidence;
  contextExtensionGuard: Omit<TrustlessUnsignedTxContextExtensionGuardEvidence, 'offenderCount'>;
  generatedAt?: string;
}

export interface AggregateSettlementTrustlessUnsignedTxEvidenceRecord {
  schemaVersion: 1;
  generatedAt: string;
  evidenceKind: 'trustless-single-leaf-unsigned-tx';
  label: string;
  stateTrackerMode: 'read-only';
  broadcast: 'no';
  boundary: {
    gate5Closure: 'no';
    prebroadcastEvidence: 'no';
    settlementReadiness: 'no';
    transactionCheck: 'no';
    expectedTxId: 'no';
    signing: 'no';
    submit: 'no';
    testnetProductionCandidateClaim: 'no';
    productionReadyClaim: 'no';
  };
  claimCount: number;
  claims: AggregateSettlementTrustlessCandidateClaimEvidence[];
  selectedBoxes: TrustlessUnsignedTxSelectedBoxesEvidence;
  payoutBinding: TrustlessUnsignedTxPayoutBindingEvidence;
  settlementShape: PreparedSettlementShapeSummary;
  contextExtensionGuard: TrustlessUnsignedTxContextExtensionGuardEvidence;
  contractCompatibility: 'candidate-only-trustless-v2-required';
}

export interface ResolvedAggregateSettlementEvidenceJsonPath {
  path?: string;
  label: string;
  errors: string[];
}

interface Eip12TxShape {
  inputs?: unknown[];
  outputs?: unknown[];
}

type TransactionCheckNodeResponseKind =
  | 'empty-string'
  | 'string'
  | 'object'
  | 'array'
  | 'number'
  | 'boolean';

const blockedEvidenceJsonTargetLabel = '<blocked evidence JSON target>';
const aggregateSettlementEvidenceCommands = new Set([
  'check',
  'check-batch',
  'check-with-ingest',
  'check-anchored',
]);
const commandsRequiringTrackerHeader = new Set([
  'check-batch',
  'check-with-ingest',
  'check-anchored',
]);
const commandsRequiringFullTrackerIngest = new Set([
  'check-batch',
  'check-with-ingest',
  'check-anchored',
]);
const bytes32HexPattern = /^[0-9a-f]{64}$/i;
const UINT64_MAX = 0xffff_ffff_ffff_ffffn;
const aggregateSettlementEvidenceRecordKeys = new Set([
  'schemaVersion',
  'generatedAt',
  'command',
  'label',
  'stateTrackerMode',
  'broadcast',
  'transactionCheck',
  'claimCount',
  'claims',
  'settlementShape',
  'sourceBindings',
]);
const transactionCheckEvidenceKeys = new Set([
  'endpoint',
  'result',
  'expectedTxId',
  'nodeResponse',
  'nodeResponseKind',
  'nodeResponseDigest',
  'checkerIdentity',
]);
const checkerIdentityKeys = new Set([
  'profile',
  'sourceAdapterProfile',
  'nodeOrigin',
  'path',
  'method',
  'transportPolicy',
]);
const transactionCheckNodeResponseKinds = new Set<TransactionCheckNodeResponseKind>([
  'empty-string',
  'string',
  'object',
  'array',
  'number',
  'boolean',
]);
const claimEvidenceKeys = new Set([
  'burnTxHash',
  'sidechainBlockHeight',
  'sidechainHeaderHashHex',
  'bridgeEventRootHex',
  'ergoAnchorHeight',
]);
const settlementShapeEvidenceKeys = new Set([
  'inputCount',
  'outputCount',
  'contextExtensionKeyCounts',
  'contextExtensionKeyCountsCsv',
]);
const aggregateSettlementSourceBindingsKeys = new Set([
  'state',
  'deployedState',
]);
const aggregateSettlementStateSourceBindingKeys = new Set([
  'sourceType',
  'input',
  'readOnly',
  'targetClass',
  'runtimePathSerialized',
  'defaultFallbackUsed',
  'operations',
]);
const aggregateSettlementDeployedStateSourceBindingKeys = new Set([
  'sourceType',
  'input',
  'targetClass',
  'runtimePathSerialized',
  'defaultLoaderUsed',
  'operations',
]);
const aggregateSettlementStateSourceOperations = [
  'read-only peg-out state lookup',
] as const;
const aggregateSettlementDeployedStateSourceOperations = [
  'read-only sanitized deployed-state load',
] as const;
const trustlessSettlementCandidateEvidenceRecordKeys = new Set([
  'schemaVersion',
  'generatedAt',
  'evidenceKind',
  'label',
  'stateTrackerMode',
  'broadcast',
  'boundary',
  'claimCount',
  'claims',
  'sourceBindings',
  'contractCompatibility',
]);
const trustlessSettlementCandidateBoundaryKeys = new Set([
  'gate5Closure',
  'prebroadcastEvidence',
  'settlementReadiness',
  'testnetProductionCandidateClaim',
  'productionReadyClaim',
]);
const trustlessSettlementCandidateClaimEvidenceKeys = new Set([
  'legacySidechainTxHash',
  'sidechainBlockHeight',
  'trustlessBurnDerivation',
  'settlementIdentity',
]);
const trustlessBurnDerivationEvidenceKeys = new Set([
  'sidechainIdHex',
  'sidechainLogIndex',
  'derivedBurnIdHex',
]);
const trustlessSettlementCandidateIdentityEvidenceKeys = new Set([
  'source',
  'duplicatePreventionKeyHex',
  'bridgeEventRootHex',
  'recipientErgoTreeHashHex',
  'amountNanoErg',
  'assetIdHex',
]);
const trustlessSettlementCandidateSourceBindingsKeys = new Set([
  'proofVector',
]);
const trustlessSettlementCandidateProofVectorSourceKeys = new Set([
  'sourceKind',
  'target',
  'targetBurnIdHex',
  'bridgeEventRootHex',
  'leafHashHex',
  'leafCount',
  'proofNodeCount',
  'gate5Claim',
  'contractsChanged',
  'boundary',
]);
const trustlessUnsignedTxEvidenceRecordKeys = new Set([
  'schemaVersion',
  'generatedAt',
  'evidenceKind',
  'label',
  'stateTrackerMode',
  'broadcast',
  'boundary',
  'claimCount',
  'claims',
  'selectedBoxes',
  'payoutBinding',
  'settlementShape',
  'contextExtensionGuard',
  'contractCompatibility',
]);
const trustlessUnsignedTxBoundaryKeys = new Set([
  'gate5Closure',
  'prebroadcastEvidence',
  'settlementReadiness',
  'transactionCheck',
  'expectedTxId',
  'signing',
  'submit',
  'testnetProductionCandidateClaim',
  'productionReadyClaim',
]);
const trustlessUnsignedTxSelectedBoxesKeys = new Set([
  'trackerBoxId',
  'aggregateDupBoxId',
  'unlockBoxId',
]);
const trustlessUnsignedTxPayoutBindingKeys = new Set([
  'outputIndex',
  'recipientErgoTreeHex',
  'recipientErgoTreeHashHex',
  'amountNanoErg',
  'recipientHashEqualsProvedBurn',
  'amountEqualsProvedBurn',
]);
const trustlessUnsignedTxContextExtensionGuardKeys = new Set([
  'status',
  'reason',
  'effectiveThreshold',
  'offenderCount',
  'offenders',
  'signingPermitted',
  'broadcastPermitted',
]);
const trustlessUnsignedTxContextExtensionOffenderKeys = new Set([
  'inputIndex',
  'varCount',
  'keys',
]);

export function summarizePreparedSettlementShape(eip12Tx: Eip12TxShape): PreparedSettlementShapeSummary {
  const inputs = Array.isArray(eip12Tx.inputs) ? eip12Tx.inputs : [];
  const outputs = Array.isArray(eip12Tx.outputs) ? eip12Tx.outputs : [];
  const contextExtensionKeyCounts = inputs.map((input) => {
    if (!input || typeof input !== 'object') return 0;
    const extension = (input as { extension?: unknown }).extension;
    return extension && typeof extension === 'object'
      ? Object.keys(extension).length
      : 0;
  });

  return {
    inputCount: inputs.length,
    outputCount: outputs.length,
    contextExtensionKeyCounts,
    contextExtensionKeyCountsCsv: contextExtensionKeyCounts.join(','),
  };
}

export function formatPreparedSettlementShapeEvidenceLines(
  summary: PreparedSettlementShapeSummary,
): string[] {
  return [
    `inputs: ${summary.inputCount}`,
    `outputs: ${summary.outputCount}`,
    `contextExtensionKeyCountsPerInput: ${summary.contextExtensionKeyCountsCsv}`,
  ];
}

export function summarizeTrustlessUnsignedTxPayoutBinding(
  eip12Tx: Eip12TxShape,
): TrustlessUnsignedTxPayoutBindingEvidence {
  const outputs = Array.isArray(eip12Tx.outputs) ? eip12Tx.outputs : [];
  const payoutOutput = outputs[2];
  if (!isRecord(payoutOutput)) {
    throw new Error('payoutBinding output[2] must be an object');
  }

  const recipientErgoTreeHex = normalizeTrustlessPayoutErgoTreeHex(
    payoutOutput.ergoTree,
    'payoutBinding.recipientErgoTreeHex',
  );
  const amountNanoErg = normalizePositiveUint64DecimalValue(
    payoutOutput.value,
    'payoutBinding.amountNanoErg',
  );

  return {
    outputIndex: 2,
    recipientErgoTreeHex,
    recipientErgoTreeHashHex: hashTrustlessPayoutRecipientErgoTree(recipientErgoTreeHex),
    amountNanoErg,
    recipientHashEqualsProvedBurn: true,
    amountEqualsProvedBurn: true,
  };
}

export function buildAggregateSettlementPrebroadcastEvidenceRecord(
  input: AggregateSettlementPrebroadcastEvidenceInput,
): AggregateSettlementPrebroadcastEvidenceRecord {
  if (input.transactionCheckResponse === undefined || input.transactionCheckResponse === null) {
    throw new Error('transactionCheckResponse must be the observed /transactions/check response');
  }
  const record: AggregateSettlementPrebroadcastEvidenceRecord = {
    schemaVersion: 2,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    command: input.command,
    label: input.label,
    stateTrackerMode: 'read-only',
    broadcast: 'no',
    transactionCheck: {
      endpoint: '/transactions/check',
      result: 'PASS',
      expectedTxId: input.expectedTxId,
      nodeResponse: input.transactionCheckResponse,
      nodeResponseKind: classifyTransactionCheckNodeResponse(input.transactionCheckResponse),
      nodeResponseDigest: digestTransactionCheckNodeResponse(input.transactionCheckResponse),
      checkerIdentity: { ...input.checkerIdentity },
    },
    claimCount: input.claims.length,
    claims: input.claims,
    settlementShape: input.settlementShape,
    sourceBindings: input.sourceBindings ?? buildAggregateSettlementPrebroadcastSourceBindings(),
  };
  const errors = validateAggregateSettlementPrebroadcastEvidenceRecord(record);
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }
  return record;
}

export function buildAggregateSettlementPrebroadcastSourceBindings(): AggregateSettlementPrebroadcastSourceBindings {
  return {
    state: {
      sourceType: 'read-only-state-tracker',
      input: '--state-db',
      readOnly: true,
      targetClass: 'operator-provided-state-db',
      runtimePathSerialized: false,
      defaultFallbackUsed: false,
      operations: [...aggregateSettlementStateSourceOperations],
    },
    deployedState: {
      sourceType: 'sanitized-deployed-state-json',
      input: '--deployed-state-json',
      targetClass: 'operator-provided-deployed-state-json',
      runtimePathSerialized: false,
      defaultLoaderUsed: false,
      operations: [...aggregateSettlementDeployedStateSourceOperations],
    },
  };
}

export function validateAggregateSettlementPrebroadcastEvidenceRecord(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return ['aggregate settlement evidence record must be an object'];
  }

  validateKnownKeys('aggregate settlement evidence record', value, aggregateSettlementEvidenceRecordKeys, errors);

  if (value.schemaVersion !== 2) {
    errors.push('schemaVersion must be 2');
  }
  if (!isIsoTimestamp(value.generatedAt)) {
    errors.push('generatedAt must be an ISO timestamp');
  }
  if (!isNonEmptyString(value.command)) {
    errors.push('command must be a non-empty string');
  } else if (!aggregateSettlementEvidenceCommands.has(value.command)) {
    errors.push('command must be a non-broadcast aggregate check command');
  }
  if (!isNonEmptyString(value.label)) {
    errors.push('label must be a non-empty string');
  }
  if (value.stateTrackerMode !== 'read-only') {
    errors.push('stateTrackerMode must be read-only');
  }
  if (value.broadcast !== 'no') {
    errors.push('broadcast must be no');
  }
  if (!isPositiveSafeInteger(value.claimCount)) {
    errors.push('claimCount must be a positive safe integer');
  }

  validateTransactionCheckEvidence(value.transactionCheck, errors);
  validateClaimsEvidence(value.command, value.claimCount, value.claims, errors);
  validateSettlementShapeEvidence(value.settlementShape, errors);
  validateAggregateSettlementPrebroadcastSourceBindings(value.sourceBindings, errors);

  return errors;
}

export function buildAggregateSettlementTrustlessCandidateEvidenceRecord(
  input: AggregateSettlementTrustlessCandidateEvidenceInput,
): AggregateSettlementTrustlessCandidateEvidenceRecord {
  const record: AggregateSettlementTrustlessCandidateEvidenceRecord = {
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    evidenceKind: 'trustless-settlement-candidate',
    label: input.label,
    stateTrackerMode: 'read-only',
    broadcast: 'no',
    boundary: {
      gate5Closure: 'no',
      prebroadcastEvidence: 'no',
      settlementReadiness: 'no',
      testnetProductionCandidateClaim: 'no',
      productionReadyClaim: 'no',
    },
    claimCount: input.claims.length,
    claims: input.claims,
    ...(input.sourceBindings === undefined ? {} : { sourceBindings: input.sourceBindings }),
    contractCompatibility: 'candidate-only-trustless-v2-required',
  };
  const errors = validateAggregateSettlementTrustlessCandidateEvidenceRecord(record);
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }
  return record;
}

export function validateAggregateSettlementTrustlessCandidateEvidenceRecord(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return ['trustless settlement candidate evidence record must be an object'];
  }

  validateKnownKeys(
    'trustless settlement candidate evidence record',
    value,
    trustlessSettlementCandidateEvidenceRecordKeys,
    errors,
  );

  if (value.schemaVersion !== 1) {
    errors.push('schemaVersion must be 1');
  }
  if (!isIsoTimestamp(value.generatedAt)) {
    errors.push('generatedAt must be an ISO timestamp');
  }
  if (value.evidenceKind !== 'trustless-settlement-candidate') {
    errors.push('evidenceKind must be trustless-settlement-candidate');
  }
  if (!isNonEmptyString(value.label)) {
    errors.push('label must be a non-empty string');
  }
  if (value.stateTrackerMode !== 'read-only') {
    errors.push('stateTrackerMode must be read-only');
  }
  if (value.broadcast !== 'no') {
    errors.push('broadcast must be no');
  }
  validateTrustlessSettlementCandidateBoundary(value.boundary, errors);
  if (!isPositiveSafeInteger(value.claimCount)) {
    errors.push('claimCount must be a positive safe integer');
  }
  if (value.contractCompatibility !== 'candidate-only-trustless-v2-required') {
    errors.push('contractCompatibility must be candidate-only-trustless-v2-required');
  }

  validateTrustlessSettlementCandidateClaimsEvidence(value.claimCount, value.claims, errors);
  validateTrustlessSettlementCandidateSourceBindings(value.sourceBindings, value.claims, errors);

  return errors;
}

export function buildAggregateSettlementTrustlessUnsignedTxEvidenceRecord(
  input: AggregateSettlementTrustlessUnsignedTxEvidenceInput,
): AggregateSettlementTrustlessUnsignedTxEvidenceRecord {
  const candidateErrors = validateAggregateSettlementTrustlessCandidateEvidenceRecord(input.candidateEvidence);
  if (candidateErrors.length > 0) {
    throw new Error(candidateErrors.join('; '));
  }

  const record: AggregateSettlementTrustlessUnsignedTxEvidenceRecord = {
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? input.candidateEvidence.generatedAt,
    evidenceKind: 'trustless-single-leaf-unsigned-tx',
    label: input.label,
    stateTrackerMode: 'read-only',
    broadcast: 'no',
    boundary: {
      gate5Closure: 'no',
      prebroadcastEvidence: 'no',
      settlementReadiness: 'no',
      transactionCheck: 'no',
      expectedTxId: 'no',
      signing: 'no',
      submit: 'no',
      testnetProductionCandidateClaim: 'no',
      productionReadyClaim: 'no',
    },
    claimCount: input.candidateEvidence.claimCount,
    claims: input.candidateEvidence.claims,
    selectedBoxes: input.selectedBoxes,
    payoutBinding: input.payoutBinding,
    settlementShape: input.settlementShape,
    contextExtensionGuard: {
      status: input.contextExtensionGuard.status,
      reason: input.contextExtensionGuard.reason,
      effectiveThreshold: input.contextExtensionGuard.effectiveThreshold,
      offenderCount: input.contextExtensionGuard.offenders.length,
      offenders: input.contextExtensionGuard.offenders,
      signingPermitted: input.contextExtensionGuard.signingPermitted,
      broadcastPermitted: input.contextExtensionGuard.broadcastPermitted,
    },
    contractCompatibility: 'candidate-only-trustless-v2-required',
  };
  const errors = validateAggregateSettlementTrustlessUnsignedTxEvidenceRecord(record);
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }
  return record;
}

export function validateAggregateSettlementTrustlessUnsignedTxEvidenceRecord(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return ['trustless unsigned tx evidence record must be an object'];
  }

  validateKnownKeys(
    'trustless unsigned tx evidence record',
    value,
    trustlessUnsignedTxEvidenceRecordKeys,
    errors,
  );

  if (value.schemaVersion !== 1) {
    errors.push('schemaVersion must be 1');
  }
  if (!isIsoTimestamp(value.generatedAt)) {
    errors.push('generatedAt must be an ISO timestamp');
  }
  if (value.evidenceKind !== 'trustless-single-leaf-unsigned-tx') {
    errors.push('evidenceKind must be trustless-single-leaf-unsigned-tx');
  }
  if (!isNonEmptyString(value.label)) {
    errors.push('label must be a non-empty string');
  }
  if (value.stateTrackerMode !== 'read-only') {
    errors.push('stateTrackerMode must be read-only');
  }
  if (value.broadcast !== 'no') {
    errors.push('broadcast must be no');
  }
  validateTrustlessUnsignedTxBoundary(value.boundary, errors);
  if (value.claimCount !== 1) {
    errors.push('claimCount must be 1 for trustless single-leaf unsigned tx evidence');
  }
  if (value.contractCompatibility !== 'candidate-only-trustless-v2-required') {
    errors.push('contractCompatibility must be candidate-only-trustless-v2-required');
  }

  validateTrustlessSettlementCandidateClaimsEvidence(value.claimCount, value.claims, errors);
  validateTrustlessUnsignedTxSelectedBoxes(value.selectedBoxes, errors);
  validateTrustlessUnsignedTxPayoutBinding(value.payoutBinding, value.claims, errors);
  validateSettlementShapeEvidence(value.settlementShape, errors);
  validateTrustlessUnsignedTxSettlementShape(value.settlementShape, errors);
  validateTrustlessUnsignedTxContextExtensionGuard(value.contextExtensionGuard, errors);

  return errors;
}

function validateTrustlessSettlementCandidateBoundary(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('boundary must be an object');
    return;
  }
  validateKnownKeys('boundary', value, trustlessSettlementCandidateBoundaryKeys, errors);
  for (const field of trustlessSettlementCandidateBoundaryKeys) {
    if (value[field] !== 'no') {
      errors.push(`boundary.${field} must be no`);
    }
  }
}

export function resolveAggregateSettlementEvidenceJsonPath(
  target: string,
  workspaceRoot = process.cwd(),
  bridgeRoot = resolve(workspaceRoot, '..'),
): ResolvedAggregateSettlementEvidenceJsonPath {
  const trimmedTarget = target.trim();
  const errors = validateAggregateSettlementEvidenceJsonPath(target, workspaceRoot, bridgeRoot);
  const label = formatAggregateSettlementEvidenceJsonPathLabelForErrors(target, errors);
  if (errors.length > 0) return { label, errors };

  const evidencePath = resolve(workspaceRoot, trimmedTarget);
  return { path: existsSync(evidencePath) ? realpathSync(evidencePath) : evidencePath, label, errors: [] };
}

export function validateAggregateSettlementEvidenceJsonPath(
  target: string,
  workspaceRoot = process.cwd(),
  bridgeRoot = resolve(workspaceRoot, '..'),
): string[] {
  const label = formatAggregateSettlementEvidenceJsonPathLabel(target);
  const trimmedTarget = target.trim();
  const normalized = normalizeAggregateSettlementEvidenceJsonPathTarget(target);
  const name = basename(normalized);
  const extension = extname(name);
  const isLocalAbsolutePath = isLocalAbsoluteTarget(normalized);
  const isLocalFileUrlPath = isLocalFileUrl(normalized);
  const isUriSchemeTarget =
    hasUriSchemeTarget(normalized) && !isLocalAbsolutePath && !isLocalFileUrlPath;
  const escapesBridgeRootPath = escapesBridgeRoot(normalized);
  const isRuntimeDatabasePath = hasEvidenceRuntimeDatabasePathTarget(normalized);
  const hasEnvironmentTargetBinding = hasEvidenceEnvironmentTarget(normalized);
  const hasRuntimeDatabaseTargetBinding = hasEvidenceRuntimeDatabaseTargetBinding(normalized);
  const hasLocalOnlyTargetBinding = hasEvidenceLocalOnlyTarget(normalized);
  const hasClaimEscalatingTarget = hasClaimEscalatingAggregateSettlementEvidenceJsonTarget(normalized);
  const errors: string[] = [];

  if (extension !== '.json') {
    errors.push(`${label}: aggregate evidence output must be a JSON file`);
  }
  if (isLocalAbsolutePath) {
    errors.push(`${label}: refusing to write local absolute evidence JSON paths`);
  }
  if (isLocalFileUrlPath) {
    errors.push(`${label}: refusing to write local file URLs as evidence JSON`);
  }
  if (isUriSchemeTarget) {
    errors.push(`${label}: refusing to write URI evidence JSON targets`);
  }
  if (escapesBridgeRootPath) {
    errors.push(`${label}: refusing to write evidence JSON paths outside the bridge repository`);
  }
  if (hasLocalOnlyTargetBinding) {
    errors.push(`${label}: refusing to write local-only evidence JSON target references`);
  }
  if (hasClaimEscalatingTarget) {
    errors.push(`${label}: aggregate evidence JSON target must not use production claim wording`);
  }
  if (isEvidenceEnvironmentFileName(name) || hasEnvironmentTargetBinding) {
    errors.push(`${label}: refusing to write environment files as evidence JSON`);
  }
  if (isRuntimeDatabasePath || hasRuntimeDatabaseTargetBinding) {
    errors.push(`${label}: refusing to write runtime database files as evidence JSON`);
  }
  if (
    hasEnvironmentTargetBinding ||
    hasRuntimeDatabaseTargetBinding ||
    hasEvidenceSecretOrRuntimeName(normalized)
  ) {
    errors.push(`${label}: refusing to write secret-bearing or runtime-state paths as evidence JSON`);
  }
  if (!isLocalAbsolutePath && !isLocalFileUrlPath && !isUriSchemeTarget && !escapesBridgeRootPath) {
    const resolvedPathError = validateResolvedEvidenceJsonInsideBridge(trimmedTarget, workspaceRoot, bridgeRoot, label);
    if (resolvedPathError) errors.push(resolvedPathError);
  }

  return errors;
}

export function formatAggregateSettlementEvidenceJsonPathLabel(target: string): string {
  const trimmedTarget = target.trim();
  const normalized = normalizeAggregateSettlementEvidenceJsonPathTarget(target);
  const name = basename(normalized);
  const extension = extname(name);
  const isLocalAbsolutePath = isLocalAbsoluteTarget(normalized) || isLocalFileUrl(normalized);
  const isUriSchemeTarget =
    hasUriSchemeTarget(normalized) &&
    !isLocalAbsoluteTarget(normalized) &&
    !isLocalFileUrl(normalized);
  const escapesBridgeRootPath = escapesBridgeRoot(normalized);
  const isSensitiveName =
    hasEvidenceEnvironmentTarget(normalized) ||
    hasEvidenceRuntimeDatabaseTargetBinding(normalized) ||
    hasEvidenceLocalOnlyTarget(normalized) ||
    isEvidenceEnvironmentFileName(name) ||
    hasEvidenceSecretOrRuntimeName(normalized);
  const isRuntimeDatabasePath = hasEvidenceRuntimeDatabasePathTarget(normalized);

  if (isSensitiveName) return blockedEvidenceJsonTargetLabel;
  if (isUriSchemeTarget) return blockedEvidenceJsonTargetLabel;
  if (escapesBridgeRootPath) return blockedEvidenceJsonTargetLabel;
  if (isLocalAbsolutePath) return blockedEvidenceJsonTargetLabel;
  if (isRuntimeDatabasePath) return name;
  return trimmedTarget;
}

function normalizeAggregateSettlementEvidenceJsonPathTarget(target: string): string {
  return target.trim().replace(/\\/g, '/').toLowerCase();
}

function hasClaimEscalatingAggregateSettlementEvidenceJsonTarget(normalizedTarget: string): boolean {
  const comparableTarget = normalizedTarget.split('#')[0].split('?')[0].replace(/[),;]+$/g, '');
  const claim = classifyPublicationClaimText(comparableTarget);
  return claim.hasProductionClaim;
}

function hasEvidenceEnvironmentTarget(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(candidate => {
    const name = basename(candidate);
    return isEvidenceEnvironmentFileName(name) || hasEnvironmentTargetSegment(candidate);
  });
}

function hasEvidenceRuntimeDatabaseTargetBinding(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(hasRuntimeDatabaseTargetSegment);
}

function hasEvidenceRuntimeDatabasePathTarget(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(isEvidenceRuntimeDatabaseTarget);
}

function hasEvidenceLocalOnlyTarget(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(candidate =>
    hasEvidenceLocalOnlyInspectionReference(candidate),
  );
}

function hasEvidenceSecretOrRuntimeName(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(candidate =>
    isEvidenceSecretOrRuntimeName(candidate, { includeDeployedState: true }),
  );
}

function hasEnvironmentTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\/\s,;=()]+/)
    .some(segment => segment !== normalizedTarget && isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasRuntimeDatabaseTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\s,;=()]+/)
    .some(segment => segment !== normalizedTarget && isEvidenceRuntimeDatabaseTarget(segment.replace(/[),;]+$/g, '')));
}

function formatAggregateSettlementEvidenceJsonPathLabelForErrors(
  target: string,
  errors: readonly string[],
): string {
  return errors.some(error => error.startsWith(`${blockedEvidenceJsonTargetLabel}:`))
    ? blockedEvidenceJsonTargetLabel
    : formatAggregateSettlementEvidenceJsonPathLabel(target);
}

function isLocalAbsoluteTarget(normalized: string): boolean {
  return /^[a-z]:\//i.test(normalized) || normalized.startsWith('/');
}

function isLocalFileUrl(normalized: string): boolean {
  return /^file:\/\/\/(?:[a-z]:|\/)/i.test(normalized);
}

function hasUriSchemeTarget(normalized: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(normalized);
}

function escapesBridgeRoot(normalized: string): boolean {
  if (isLocalAbsoluteTarget(normalized) || isLocalFileUrl(normalized) || hasUriSchemeTarget(normalized)) {
    return false;
  }

  let depthFromRelayer = 0;
  const parts = normalized.split('/').filter(part => part.length > 0 && part !== '.');
  for (const part of parts) {
    if (part === '..') {
      depthFromRelayer -= 1;
    } else {
      depthFromRelayer += 1;
    }

    if (depthFromRelayer < -1) {
      return true;
    }
  }

  return false;
}

function validateResolvedEvidenceJsonInsideBridge(
  target: string,
  workspaceRoot: string,
  bridgeRoot: string,
  label: string,
): string | undefined {
  let resolvedBridgeRoot: string;
  try {
    resolvedBridgeRoot = realpathSync(resolve(bridgeRoot));
  } catch {
    return `${label}: bridge root could not be resolved`;
  }

  const resolvedTarget = resolve(workspaceRoot, target);
  const finalTarget = existsSync(resolvedTarget) ? realpathSync(resolvedTarget) : resolvedTarget;
  const nearestExistingAncestor = realpathNearestExistingAncestor(resolvedTarget);
  return isInsidePath(finalTarget, resolvedBridgeRoot) && isInsidePath(nearestExistingAncestor, resolvedBridgeRoot)
    ? undefined
    : `${blockedEvidenceJsonTargetLabel}: refusing to write evidence JSON paths outside the bridge repository`;
}

function realpathNearestExistingAncestor(target: string): string {
  let cursor = existsSync(target) ? target : dirname(target);
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return realpathSync(cursor);
}

function isInsidePath(path: string, parent: string): boolean {
  const relativePath = relative(parent, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

type UnknownRecord = Record<string, unknown>;

function validateTransactionCheckEvidence(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('transactionCheck must be an object');
    return;
  }

  validateKnownKeys('transactionCheck', value, transactionCheckEvidenceKeys, errors);
  if (value.endpoint !== '/transactions/check') {
    errors.push('transactionCheck.endpoint must be /transactions/check');
  }
  if (value.result !== 'PASS') {
    errors.push('transactionCheck.result must be PASS');
  }
  validateBytes32Hex('transactionCheck.expectedTxId', value.expectedTxId, errors);
  if (!transactionCheckNodeResponseKinds.has(value.nodeResponseKind as TransactionCheckNodeResponseKind)) {
    errors.push('transactionCheck.nodeResponseKind must identify the observed /transactions/check response kind');
  }
  validateBytes32Hex('transactionCheck.nodeResponseDigest', value.nodeResponseDigest, errors);
  if (!Object.prototype.hasOwnProperty.call(value, 'nodeResponse') ||
      value.nodeResponse === null ||
      value.nodeResponse === undefined) {
    errors.push('transactionCheck.nodeResponse must expose the observed /transactions/check response');
    return;
  }

  let actualKind: TransactionCheckNodeResponseKind;
  try {
    actualKind = classifyTransactionCheckNodeResponse(value.nodeResponse);
  } catch {
    errors.push('transactionCheck.nodeResponse must expose a JSON response value');
    return;
  }
  if (transactionCheckNodeResponseKinds.has(value.nodeResponseKind as TransactionCheckNodeResponseKind) &&
      value.nodeResponseKind !== actualKind) {
    errors.push('transactionCheck.nodeResponseKind must match the observed /transactions/check response');
  }
  if (typeof value.nodeResponseDigest === 'string' &&
      /^[0-9a-f]{64}$/i.test(value.nodeResponseDigest) &&
      value.nodeResponseDigest.toLowerCase() !== digestTransactionCheckNodeResponse(value.nodeResponse)) {
    errors.push('transactionCheck.nodeResponseDigest must match the observed /transactions/check response');
  }
  if (hasContradictoryTransactionCheckNodeResponse(value.nodeResponse)) {
    errors.push('transactionCheck.nodeResponse must not include contradictory failure markers');
  }
  validateTransactionCheckCheckerIdentity(value.checkerIdentity, errors);
}

function validateTransactionCheckCheckerIdentity(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('transactionCheck.checkerIdentity must be an object');
    return;
  }

  validateKnownKeys('transactionCheck.checkerIdentity', value, checkerIdentityKeys, errors);
  if (value.profile !== 'e2s.ergo-node-transactions-check.v1') {
    errors.push('transactionCheck.checkerIdentity.profile must identify the Ergo node checker');
  }
  if (value.sourceAdapterProfile !== 'e2s.ergo-node-json-source.v1') {
    errors.push('transactionCheck.checkerIdentity.sourceAdapterProfile must identify the Ergo node JSON source');
  }
  if (value.path !== '/transactions/check') {
    errors.push('transactionCheck.checkerIdentity.path must be /transactions/check');
  }
  if (value.method !== 'POST') {
    errors.push('transactionCheck.checkerIdentity.method must be POST');
  }
  if (value.transportPolicy !== 'no-redirect-no-proxy') {
    errors.push('transactionCheck.checkerIdentity.transportPolicy must be no-redirect-no-proxy');
  }
  if (typeof value.nodeOrigin !== 'string') {
    errors.push('transactionCheck.checkerIdentity.nodeOrigin must be a canonical HTTP(S) origin');
    return;
  }
  try {
    const canonicalOrigin = canonicalNodeOrigin(
      value.nodeOrigin,
      'transactionCheck.checkerIdentity.nodeOrigin',
    );
    if (canonicalOrigin !== value.nodeOrigin) {
      errors.push('transactionCheck.checkerIdentity.nodeOrigin must be canonical');
    }
  } catch {
    errors.push('transactionCheck.checkerIdentity.nodeOrigin must be a canonical HTTP(S) origin');
  }
}

function validateTrustlessUnsignedTxBoundary(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('boundary must be an object');
    return;
  }
  validateKnownKeys('boundary', value, trustlessUnsignedTxBoundaryKeys, errors);
  for (const field of trustlessUnsignedTxBoundaryKeys) {
    if (value[field] !== 'no') {
      errors.push(`boundary.${field} must be no`);
    }
  }
}

function validateTrustlessUnsignedTxSelectedBoxes(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('selectedBoxes must be an object');
    return;
  }

  validateKnownKeys('selectedBoxes', value, trustlessUnsignedTxSelectedBoxesKeys, errors);
  const seenBoxIds = new Set<string>();
  for (const field of trustlessUnsignedTxSelectedBoxesKeys) {
    const boxIdValue = value[field];
    if (!validateBytes32Hex(`selectedBoxes.${field}`, boxIdValue, errors)) {
      continue;
    }
    const boxId = boxIdValue.toLowerCase();
    if (seenBoxIds.has(boxId)) {
      errors.push(`selectedBoxes.${field} must be unique`);
    }
    seenBoxIds.add(boxId);
  }
}

function validateTrustlessUnsignedTxPayoutBinding(
  value: unknown,
  claims: unknown,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push('payoutBinding must be an object');
    return;
  }

  validateKnownKeys('payoutBinding', value, trustlessUnsignedTxPayoutBindingKeys, errors);
  if (value.outputIndex !== 2) {
    errors.push('payoutBinding.outputIndex must be 2 for the trustless payout output');
  }

  const recipientErgoTreeHex = validateTrustlessPayoutErgoTreeHex(
    'payoutBinding.recipientErgoTreeHex',
    value.recipientErgoTreeHex,
    errors,
  );
  const recipientErgoTreeHashHexValue = value.recipientErgoTreeHashHex;
  const recipientHashValid = validateBytes32Hex(
    'payoutBinding.recipientErgoTreeHashHex',
    recipientErgoTreeHashHexValue,
    errors,
  );
  if (recipientErgoTreeHex !== undefined && recipientHashValid) {
    const expectedRecipientHash = hashTrustlessPayoutRecipientErgoTree(recipientErgoTreeHex);
    if (recipientErgoTreeHashHexValue.toLowerCase() !== expectedRecipientHash) {
      errors.push('payoutBinding.recipientErgoTreeHashHex must equal Blake2b-256(recipientErgoTreeHex)');
    }
  }

  if (!isPositiveUint64DecimalString(value.amountNanoErg)) {
    errors.push('payoutBinding.amountNanoErg must be a positive uint64 decimal string');
  }
  if (value.recipientHashEqualsProvedBurn !== true) {
    errors.push('payoutBinding.recipientHashEqualsProvedBurn must be true');
  }
  if (value.amountEqualsProvedBurn !== true) {
    errors.push('payoutBinding.amountEqualsProvedBurn must be true');
  }

  const claimIdentity = firstTrustlessSettlementIdentity(claims);
  if (!claimIdentity) return;
  if (
    recipientHashValid &&
    typeof claimIdentity.recipientErgoTreeHashHex === 'string' &&
    bytes32HexPattern.test(claimIdentity.recipientErgoTreeHashHex) &&
    recipientErgoTreeHashHexValue.toLowerCase() !== claimIdentity.recipientErgoTreeHashHex.toLowerCase()
  ) {
    errors.push(
      'payoutBinding.recipientErgoTreeHashHex must match claims[0].settlementIdentity.recipientErgoTreeHashHex',
    );
  }
  if (
    isPositiveUint64DecimalString(value.amountNanoErg) &&
    typeof claimIdentity.amountNanoErg === 'string' &&
    isPositiveUint64DecimalString(claimIdentity.amountNanoErg) &&
    value.amountNanoErg !== claimIdentity.amountNanoErg
  ) {
    errors.push('payoutBinding.amountNanoErg must exactly match claims[0].settlementIdentity.amountNanoErg');
  }
}

function validateTrustlessUnsignedTxSettlementShape(value: unknown, errors: string[]): void {
  if (!isRecord(value)) return;

  if (value.inputCount !== 3) {
    errors.push('settlementShape.inputCount must be 3 for trustless single-leaf unsigned tx evidence');
  }
  if (typeof value.outputCount === 'number' && ![4, 5].includes(value.outputCount)) {
    errors.push('settlementShape.outputCount must be 4 or 5 for trustless single-leaf unsigned tx evidence');
  }
  if (!Array.isArray(value.contextExtensionKeyCounts)) return;
  if (value.contextExtensionKeyCounts[2] !== 4) {
    errors.push('settlementShape.contextExtensionKeyCounts[2] must be 4 for the compact V2 trustless unlock input');
  }
}

function validateTrustlessUnsignedTxContextExtensionGuard(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('contextExtensionGuard must be an object');
    return;
  }

  validateKnownKeys('contextExtensionGuard', value, trustlessUnsignedTxContextExtensionGuardKeys, errors);
  if (!['pass', 'blocked'].includes(value.status as string)) {
    errors.push('contextExtensionGuard.status must be pass or blocked');
  }
  if (
    ![
      'unsigned-source-boundary-only',
      'context-extension-serialization-conformance',
    ].includes(value.reason as string)
  ) {
    errors.push('contextExtensionGuard.reason must be a supported trustless unsigned boundary reason');
  }
  if (!isPositiveSafeInteger(value.effectiveThreshold)) {
    errors.push('contextExtensionGuard.effectiveThreshold must be a positive safe integer');
  }
  if (!isNonNegativeSafeInteger(value.offenderCount)) {
    errors.push('contextExtensionGuard.offenderCount must be a non-negative safe integer');
  }
  if (value.signingPermitted !== false) {
    errors.push('contextExtensionGuard.signingPermitted must be false');
  }
  if (value.broadcastPermitted !== false) {
    errors.push('contextExtensionGuard.broadcastPermitted must be false');
  }

  if (!Array.isArray(value.offenders)) {
    errors.push('contextExtensionGuard.offenders must be an array');
    return;
  }
  if (isNonNegativeSafeInteger(value.offenderCount) && value.offenderCount !== value.offenders.length) {
    errors.push('contextExtensionGuard.offenderCount must match offenders.length');
  }

  if (value.status === 'blocked') {
    if (value.reason !== 'context-extension-serialization-conformance') {
      errors.push('contextExtensionGuard.reason must be context-extension-serialization-conformance when blocked');
    }
    if (value.offenders.length === 0) {
      errors.push('contextExtensionGuard.offenders must not be empty when blocked');
    }
  }
  if (value.status === 'pass') {
    if (value.reason !== 'unsigned-source-boundary-only') {
      errors.push('contextExtensionGuard.reason must be unsigned-source-boundary-only when pass');
    }
    if (value.offenders.length !== 0) {
      errors.push('contextExtensionGuard.offenders must be empty when pass');
    }
  }

  value.offenders.forEach((offender, index) => {
    const label = `contextExtensionGuard.offenders[${index}]`;
    if (!isRecord(offender)) {
      errors.push(`${label} must be an object`);
      return;
    }
    validateKnownKeys(label, offender, trustlessUnsignedTxContextExtensionOffenderKeys, errors);
    if (!isNonNegativeSafeInteger(offender.inputIndex)) {
      errors.push(`${label}.inputIndex must be a non-negative safe integer`);
    }
    if (!isPositiveSafeInteger(offender.varCount)) {
      errors.push(`${label}.varCount must be a positive safe integer`);
    }
    if (!Array.isArray(offender.keys)) {
      errors.push(`${label}.keys must be an array`);
      return;
    }
    if (isPositiveSafeInteger(offender.varCount) && offender.varCount !== offender.keys.length) {
      errors.push(`${label}.varCount must match keys.length`);
    }
    if (offender.keys.some(key => !isNonNegativeSafeInteger(key))) {
      errors.push(`${label}.keys must contain non-negative safe integers`);
    }
  });
}

function hasContradictoryTransactionCheckNodeResponse(value: unknown): boolean {
  const normalized = normalizeEvidenceMarkerText(stableJsonStringify(value));
  return (
    /(?:^|[^A-Za-z0-9_-])FAIL(?:$|[^A-Za-z0-9_-])/i.test(normalized) ||
    /\b(?:FAILED|BLOCKED|ERROR)\b/i.test(normalized) ||
    /\bexit\s*code\b\s*["']?\s*[:=]?\s*["']?(?!0\b)\d+\b/i.test(normalized) ||
    /\berrors?\b\s*["']?\s*[:=]?\s*["']?(?!0\b)\d+\b/i.test(normalized) ||
    hasStructuredValidationFailureMarker(normalized)
  );
}

function classifyTransactionCheckNodeResponse(value: unknown): TransactionCheckNodeResponseKind {
  if (value === '') return 'empty-string';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  throw new Error('transactionCheckResponse must be a JSON response value');
}

function digestTransactionCheckNodeResponse(value: unknown): string {
  return createHash('sha256')
    .update(stableJsonStringify(value))
    .digest('hex');
}

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalJson(value));
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map(key => [key, canonicalJson(record[key])]),
    );
  }
  return value;
}

function validateClaimsEvidence(
  command: unknown,
  claimCount: unknown,
  value: unknown,
  errors: string[],
): void {
  if (!Array.isArray(value)) {
    errors.push('claims must be an array');
    return;
  }
  if (value.length === 0) {
    errors.push('claims must not be empty');
  }
  if (command === 'check-batch' && value.length === 1) {
    errors.push('check-batch evidence must contain at least two claims');
  }
  if (command === 'check-batch' && value.length > BATCH_UNLOCK_MAX_CLAIMS) {
    errors.push(`check-batch evidence must not exceed batch unlock cap (${BATCH_UNLOCK_MAX_CLAIMS} claims)`);
  }
  if (
    typeof command === 'string' &&
    aggregateSettlementEvidenceCommands.has(command) &&
    command !== 'check-batch' &&
    value.length !== 1
  ) {
    errors.push(`${command} evidence must contain exactly one claim`);
  }
  if (isPositiveSafeInteger(claimCount) && claimCount !== value.length) {
    errors.push('claimCount must match claims.length');
  }

  const seenBurnTxHashes = new Set<string>();
  value.forEach((claim, index) => {
    const label = `claims[${index}]`;
    if (!isRecord(claim)) {
      errors.push(`${label} must be an object`);
      return;
    }

    validateKnownKeys(label, claim, claimEvidenceKeys, errors);
    const burnTxHashValue = claim.burnTxHash;
    if (!validateBytes32Hex(`${label}.burnTxHash`, burnTxHashValue, errors)) {
      return;
    }
    const burnTxHash = burnTxHashValue.toLowerCase();
    if (seenBurnTxHashes.has(burnTxHash)) {
      errors.push(`${label}.burnTxHash must be unique`);
    }
    seenBurnTxHashes.add(burnTxHash);

    if (!isNonNegativeSafeInteger(claim.sidechainBlockHeight)) {
      errors.push(`${label}.sidechainBlockHeight must be a non-negative safe integer`);
    }

    if (commandRequiresTrackerHeader(command) || claim.sidechainHeaderHashHex !== undefined) {
      validateBytes32Hex(`${label}.sidechainHeaderHashHex`, claim.sidechainHeaderHashHex, errors);
    }
    if (commandRequiresFullTrackerIngest(command) || claim.bridgeEventRootHex !== undefined) {
      validateBytes32Hex(`${label}.bridgeEventRootHex`, claim.bridgeEventRootHex, errors);
    }
    if (commandRequiresFullTrackerIngest(command) || claim.ergoAnchorHeight !== undefined) {
      if (!isNonNegativeSafeInteger(claim.ergoAnchorHeight)) {
        errors.push(`${label}.ergoAnchorHeight must be a non-negative safe integer`);
      }
    }
  });
}

function validateSettlementShapeEvidence(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('settlementShape must be an object');
    return;
  }

  validateKnownKeys('settlementShape', value, settlementShapeEvidenceKeys, errors);
  if (!isPositiveSafeInteger(value.inputCount)) {
    errors.push('settlementShape.inputCount must be a positive safe integer');
  }
  if (!isPositiveSafeInteger(value.outputCount)) {
    errors.push('settlementShape.outputCount must be a positive safe integer');
  }

  if (!Array.isArray(value.contextExtensionKeyCounts)) {
    errors.push('settlementShape.contextExtensionKeyCounts must be an array');
    return;
  }

  if (
    isPositiveSafeInteger(value.inputCount) &&
    value.contextExtensionKeyCounts.length !== value.inputCount
  ) {
    errors.push('settlementShape.contextExtensionKeyCounts length must match inputCount');
  }
  const hasInvalidContextExtensionKeyCount = value.contextExtensionKeyCounts.some(
    count => !isNonNegativeSafeInteger(count),
  );
  if (hasInvalidContextExtensionKeyCount) {
    errors.push('settlementShape.contextExtensionKeyCounts must contain non-negative safe integers');
  }

  const expectedCsv = value.contextExtensionKeyCounts.join(',');
  if (value.contextExtensionKeyCountsCsv !== expectedCsv) {
    errors.push('settlementShape.contextExtensionKeyCountsCsv must match contextExtensionKeyCounts');
  }
}

function validateAggregateSettlementPrebroadcastSourceBindings(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('sourceBindings must be an object');
    return;
  }

  validateKnownKeys('sourceBindings', value, aggregateSettlementSourceBindingsKeys, errors);
  validateAggregateSettlementPrebroadcastStateSourceBinding(value.state, errors);
  validateAggregateSettlementPrebroadcastDeployedStateSourceBinding(value.deployedState, errors);
}

function validateAggregateSettlementPrebroadcastStateSourceBinding(
  value: unknown,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push('sourceBindings.state must be an object');
    return;
  }

  validateKnownKeys('sourceBindings.state', value, aggregateSettlementStateSourceBindingKeys, errors);
  if (value.sourceType !== 'read-only-state-tracker') {
    errors.push('sourceBindings.state.sourceType must be read-only-state-tracker');
  }
  if (value.input !== '--state-db') {
    errors.push('sourceBindings.state.input must be --state-db');
  }
  if (value.readOnly !== true) {
    errors.push('sourceBindings.state.readOnly must be true');
  }
  if (value.targetClass !== 'operator-provided-state-db') {
    errors.push('sourceBindings.state.targetClass must be operator-provided-state-db');
  }
  if (value.runtimePathSerialized !== false) {
    errors.push('sourceBindings.state.runtimePathSerialized must be false');
  }
  if (value.defaultFallbackUsed !== false) {
    errors.push('sourceBindings.state.defaultFallbackUsed must be false');
  }
  validateExactOperations(
    'sourceBindings.state.operations',
    value.operations,
    aggregateSettlementStateSourceOperations,
    errors,
  );
}

function validateAggregateSettlementPrebroadcastDeployedStateSourceBinding(
  value: unknown,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push('sourceBindings.deployedState must be an object');
    return;
  }

  validateKnownKeys(
    'sourceBindings.deployedState',
    value,
    aggregateSettlementDeployedStateSourceBindingKeys,
    errors,
  );
  if (value.sourceType !== 'sanitized-deployed-state-json') {
    errors.push('sourceBindings.deployedState.sourceType must be sanitized-deployed-state-json');
  }
  if (value.input !== '--deployed-state-json') {
    errors.push('sourceBindings.deployedState.input must be --deployed-state-json');
  }
  if (value.targetClass !== 'operator-provided-deployed-state-json') {
    errors.push('sourceBindings.deployedState.targetClass must be operator-provided-deployed-state-json');
  }
  if (value.runtimePathSerialized !== false) {
    errors.push('sourceBindings.deployedState.runtimePathSerialized must be false');
  }
  if (value.defaultLoaderUsed !== false) {
    errors.push('sourceBindings.deployedState.defaultLoaderUsed must be false');
  }
  validateExactOperations(
    'sourceBindings.deployedState.operations',
    value.operations,
    aggregateSettlementDeployedStateSourceOperations,
    errors,
  );
}

function validateExactOperations(
  label: string,
  value: unknown,
  expected: readonly string[],
  errors: string[],
): void {
  if (!Array.isArray(value) || value.length !== expected.length) {
    errors.push(`${label} must list the expected read-only provenance operations`);
    return;
  }
  for (const [index, operation] of expected.entries()) {
    if (value[index] !== operation) {
      errors.push(`${label} must list the expected read-only provenance operations`);
      return;
    }
  }
}

function validateTrustlessSettlementCandidateClaimsEvidence(
  claimCount: unknown,
  value: unknown,
  errors: string[],
): void {
  if (!Array.isArray(value)) {
    errors.push('claims must be an array');
    return;
  }
  if (value.length === 0) {
    errors.push('claims must not be empty');
  }
  if (isPositiveSafeInteger(claimCount) && claimCount !== value.length) {
    errors.push('claimCount must match claims.length');
  }

  const seenDuplicatePreventionKeys = new Set<string>();
  value.forEach((claim, index) => {
    const label = `claims[${index}]`;
    if (!isRecord(claim)) {
      errors.push(`${label} must be an object`);
      return;
    }

    validateKnownKeys(label, claim, trustlessSettlementCandidateClaimEvidenceKeys, errors);
    const legacySidechainTxHashValue = claim.legacySidechainTxHash;
    const hasLegacySidechainTxHash = validateBytes32Hex(
      `${label}.legacySidechainTxHash`,
      legacySidechainTxHashValue,
      errors,
    );
    if (!isNonNegativeSafeInteger(claim.sidechainBlockHeight)) {
      errors.push(`${label}.sidechainBlockHeight must be a non-negative safe integer`);
    }
    validateTrustlessSettlementCandidateIdentityEvidence(
      `${label}.settlementIdentity`,
      claim.settlementIdentity,
      hasLegacySidechainTxHash ? legacySidechainTxHashValue.toLowerCase() : undefined,
      seenDuplicatePreventionKeys,
      errors,
    );
    validateTrustlessBurnDerivationEvidence(
      `${label}.trustlessBurnDerivation`,
      claim.trustlessBurnDerivation,
      hasLegacySidechainTxHash ? legacySidechainTxHashValue.toLowerCase() : undefined,
      trustlessDuplicatePreventionKeyHex(claim.settlementIdentity),
      errors,
    );
  });
}

function validateTrustlessSettlementCandidateSourceBindings(
  value: unknown,
  claims: unknown,
  errors: string[],
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    errors.push('sourceBindings must be an object');
    return;
  }

  validateKnownKeys('sourceBindings', value, trustlessSettlementCandidateSourceBindingsKeys, errors);
  if (value.proofVector === undefined) {
    errors.push('sourceBindings.proofVector must be an object');
    return;
  }
  validateTrustlessSettlementCandidateProofVectorSourceBinding(value.proofVector, claims, errors);
}

function validateTrustlessSettlementCandidateProofVectorSourceBinding(
  value: unknown,
  claims: unknown,
  errors: string[],
): void {
  const label = 'sourceBindings.proofVector';
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return;
  }

  validateKnownKeys(label, value, trustlessSettlementCandidateProofVectorSourceKeys, errors);
  if (value.sourceKind !== 'trustless-burn-proof-vector') {
    errors.push(`${label}.sourceKind must be trustless-burn-proof-vector`);
  }
  if (!isNonEmptyString(value.target)) {
    errors.push(`${label}.target must be a non-empty JSON evidence target`);
  } else {
    errors.push(...validateEvidenceJsonTargetPath(value.target, `${label}.target`));
  }

  const targetBurnIdHexValue = value.targetBurnIdHex;
  const bridgeEventRootHexValue = value.bridgeEventRootHex;
  const hasTargetBurnId = validateBytes32Hex(`${label}.targetBurnIdHex`, targetBurnIdHexValue, errors);
  const hasBridgeEventRoot = validateBytes32Hex(`${label}.bridgeEventRootHex`, bridgeEventRootHexValue, errors);
  validateBytes32Hex(`${label}.leafHashHex`, value.leafHashHex, errors);
  if (!isPositiveSafeInteger(value.leafCount) || value.leafCount < 2) {
    errors.push(`${label}.leafCount must be at least 2`);
  }
  if (!isPositiveSafeInteger(value.proofNodeCount)) {
    errors.push(`${label}.proofNodeCount must be a positive safe integer`);
  }
  if (value.gate5Claim !== false) {
    errors.push(`${label}.gate5Claim must be false`);
  }
  if (value.contractsChanged !== false) {
    errors.push(`${label}.contractsChanged must be false`);
  }
  if (value.boundary !== 'local-proof-core-candidate-only') {
    errors.push(`${label}.boundary must be local-proof-core-candidate-only`);
  }

  if (!Array.isArray(claims)) return;
  if (claims.length !== 1) {
    errors.push(`${label} currently supports exactly one trustless candidate claim`);
    return;
  }
  const claim = claims[0];
  const settlementIdentity = isRecord(claim) && isRecord(claim.settlementIdentity)
    ? claim.settlementIdentity
    : undefined;
  const duplicatePreventionKeyHex = typeof settlementIdentity?.duplicatePreventionKeyHex === 'string' &&
    bytes32HexPattern.test(settlementIdentity.duplicatePreventionKeyHex)
    ? settlementIdentity.duplicatePreventionKeyHex.toLowerCase()
    : undefined;
  const candidateBridgeEventRootHex = typeof settlementIdentity?.bridgeEventRootHex === 'string' &&
    bytes32HexPattern.test(settlementIdentity.bridgeEventRootHex)
    ? settlementIdentity.bridgeEventRootHex.toLowerCase()
    : undefined;

  if (
    hasTargetBurnId &&
    duplicatePreventionKeyHex !== undefined &&
    targetBurnIdHexValue.toLowerCase() !== duplicatePreventionKeyHex
  ) {
    errors.push(`${label}.targetBurnIdHex must match claims[0].settlementIdentity.duplicatePreventionKeyHex`);
  }
  if (
    hasBridgeEventRoot &&
    candidateBridgeEventRootHex !== undefined &&
    bridgeEventRootHexValue.toLowerCase() !== candidateBridgeEventRootHex
  ) {
    errors.push(`${label}.bridgeEventRootHex must match claims[0].settlementIdentity.bridgeEventRootHex`);
  }
}

function validateTrustlessBurnDerivationEvidence(
  label: string,
  value: unknown,
  legacySidechainTxHash: string | undefined,
  duplicatePreventionKeyHex: string | undefined,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return;
  }

  validateKnownKeys(label, value, trustlessBurnDerivationEvidenceKeys, errors);
  const sidechainIdHex = value.sidechainIdHex;
  const sidechainLogIndex = value.sidechainLogIndex;
  const derivedBurnIdHexValue = value.derivedBurnIdHex;
  const hasSidechainId = validateBytes32Hex(`${label}.sidechainIdHex`, sidechainIdHex, errors);
  const hasDerivedBurnId = validateBytes32Hex(`${label}.derivedBurnIdHex`, derivedBurnIdHexValue, errors);
  const hasSidechainLogIndex = isNonNegativeSafeInteger(sidechainLogIndex);
  if (!hasSidechainLogIndex) {
    errors.push(`${label}.sidechainLogIndex must be a non-negative safe integer`);
  } else if (sidechainLogIndex > 0xffffffff) {
    errors.push(`${label}.sidechainLogIndex must fit uint32`);
  }

  if (
    hasSidechainId &&
    hasDerivedBurnId &&
    hasSidechainLogIndex &&
    sidechainLogIndex <= 0xffffffff &&
    legacySidechainTxHash !== undefined
  ) {
    const expectedBurnIdHex = deriveTrustlessBurnIdHex({
      sidechainIdHex: sidechainIdHex.toLowerCase(),
      sidechainTxHashHex: legacySidechainTxHash,
      eventIndex: sidechainLogIndex,
    });
    const derivedBurnIdHex = derivedBurnIdHexValue.toLowerCase();
    if (derivedBurnIdHex !== expectedBurnIdHex) {
      errors.push(`${label}.derivedBurnIdHex must match sidechainIdHex, legacySidechainTxHash, and sidechainLogIndex`);
    }
    if (duplicatePreventionKeyHex !== undefined && derivedBurnIdHex !== duplicatePreventionKeyHex) {
      errors.push(`${label}.derivedBurnIdHex must match settlementIdentity.duplicatePreventionKeyHex`);
    }
  }
}

function trustlessDuplicatePreventionKeyHex(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return typeof value.duplicatePreventionKeyHex === 'string' && bytes32HexPattern.test(value.duplicatePreventionKeyHex)
    ? value.duplicatePreventionKeyHex.toLowerCase()
    : undefined;
}

function validateTrustlessSettlementCandidateIdentityEvidence(
  label: string,
  value: unknown,
  legacySidechainTxHash: string | undefined,
  seenDuplicatePreventionKeys: Set<string>,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return;
  }

  validateKnownKeys(
    label,
    value,
    trustlessSettlementCandidateIdentityEvidenceKeys,
    errors,
  );
  if (value.source !== 'trustless-burn-leaf') {
    errors.push(`${label}.source must be trustless-burn-leaf`);
  }
  const duplicatePreventionKeyValue = value.duplicatePreventionKeyHex;
  if (validateBytes32Hex(`${label}.duplicatePreventionKeyHex`, duplicatePreventionKeyValue, errors)) {
    const duplicatePreventionKeyHex = duplicatePreventionKeyValue.toLowerCase();
    if (duplicatePreventionKeyHex === legacySidechainTxHash) {
      errors.push(`${label}.duplicatePreventionKeyHex must not equal legacySidechainTxHash`);
    }
    if (seenDuplicatePreventionKeys.has(duplicatePreventionKeyHex)) {
      errors.push(`${label}.duplicatePreventionKeyHex must be unique`);
    }
    seenDuplicatePreventionKeys.add(duplicatePreventionKeyHex);
  }
  validateBytes32Hex(`${label}.bridgeEventRootHex`, value.bridgeEventRootHex, errors);
  validateBytes32Hex(`${label}.recipientErgoTreeHashHex`, value.recipientErgoTreeHashHex, errors);
  if (value.assetIdHex !== undefined) {
    validateBytes32Hex(`${label}.assetIdHex`, value.assetIdHex, errors);
  }
  if (!isPositiveUint64DecimalString(value.amountNanoErg)) {
    errors.push(`${label}.amountNanoErg must be a positive uint64 decimal string`);
  }
}

function commandRequiresTrackerHeader(command: unknown): boolean {
  return typeof command === 'string' && commandsRequiringTrackerHeader.has(command);
}

function commandRequiresFullTrackerIngest(command: unknown): boolean {
  return typeof command === 'string' && commandsRequiringFullTrackerIngest.has(command);
}

function validateKnownKeys(
  label: string,
  value: UnknownRecord,
  allowedKeys: ReadonlySet<string>,
  errors: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      errors.push(`${label}.${key}: unsupported evidence field`);
    }
  }
}

function validateBytes32Hex(label: string, value: unknown, errors: string[]): value is string {
  if (typeof value !== 'string' || !bytes32HexPattern.test(value)) {
    errors.push(`${label} must be 32-byte hex`);
    return false;
  }
  return true;
}

function validateTrustlessPayoutErgoTreeHex(
  label: string,
  value: unknown,
  errors: string[],
): string | undefined {
  if (typeof value !== 'string' || !/^[0-9a-f]{72}$/i.test(value)) {
    errors.push(`${label} must be 36-byte hex`);
    return undefined;
  }
  return value.toLowerCase();
}

function normalizeTrustlessPayoutErgoTreeHex(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be 36-byte hex`);
  }
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]{72}$/.test(clean)) {
    throw new Error(`${label} must be 36-byte hex`);
  }
  return clean.toLowerCase();
}

function normalizePositiveUint64DecimalValue(value: unknown, label: string): string {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${label} must be a positive uint64 decimal value`);
    }
    return String(value);
  }
  const decimal = typeof value === 'bigint'
    ? value.toString()
    : typeof value === 'string'
      ? value
      : undefined;
  if (decimal === undefined || !isPositiveUint64DecimalString(decimal)) {
    throw new Error(`${label} must be a positive uint64 decimal value`);
  }
  return decimal;
}

function hashTrustlessPayoutRecipientErgoTree(recipientErgoTreeHex: string): string {
  return Buffer.from(blakejs.blake2b(Buffer.from(recipientErgoTreeHex, 'hex'), undefined, 32)).toString('hex');
}

function firstTrustlessSettlementIdentity(claims: unknown): UnknownRecord | undefined {
  if (!Array.isArray(claims) || claims.length === 0 || !isRecord(claims[0])) {
    return undefined;
  }
  return isRecord(claims[0].settlementIdentity)
    ? claims[0].settlementIdentity
    : undefined;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    isNonEmptyString(value) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isPositiveUint64DecimalString(value: unknown): value is string {
  return typeof value === 'string' && /^(?!0+$)\d+$/.test(value) && BigInt(value) <= UINT64_MAX;
}
