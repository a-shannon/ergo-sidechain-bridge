import { basename } from 'path';

import {
  evidenceTargetInspectionVariants,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from './evidence-sensitive-target.js';
import {
  hasStructuredValidationFailureMarker,
  hasUnresolvedIssueMarker,
  normalizeEvidenceMarkerText,
} from './evidence-hygiene.js';
import { validateReadOnlyNodeUrl } from './read-only-node-url.js';

export interface PostSubmitObserveJsonValidation {
  errors: string[];
  markdown?: string;
}

export interface PostSubmitObserveJsonValidationOptions {
  livePreflightTarget?: string;
  livePreflightApprovedBurnTxHashes?: string[];
}

const ARTIFACT_TARGET_PATTERN = /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s<>]+$/;

export function validatePostSubmitObserveJsonReport(
  report: unknown,
  options: PostSubmitObserveJsonValidationOptions = {},
): PostSubmitObserveJsonValidation {
  const errors: string[] = [];

  if (!isRecord(report)) {
    return { errors: ['post-submit: JSON observe report must be an object'] };
  }

  if (report.schemaVersion !== 1) {
    errors.push('post-submit: JSON observe report schemaVersion must be 1');
  }
  if (report.status !== 'CREATED') {
    errors.push('post-submit: JSON observe report status must be CREATED');
  }
  if (!Array.isArray(report.errors)) {
    errors.push('post-submit: JSON observe report errors must be an array');
  } else if (report.errors.length > 0) {
    errors.push('post-submit: JSON observe report errors must be empty');
  }
  if (typeof report.markdown !== 'string' || report.markdown.trim().length === 0) {
    errors.push('post-submit: JSON observe report markdown must be present');
  } else if (hasContradictoryValidationFailureMarker(report.markdown)) {
    errors.push('post-submit: JSON observe report markdown must not include contradictory failure markers');
  } else if (hasUnresolvedEvidenceIssueMarker(report.markdown)) {
    errors.push('post-submit: JSON observe report markdown must not include remaining issues');
  }
  if ('lines' in report) {
    if (!Array.isArray(report.lines) || report.lines.some(line => typeof line !== 'string')) {
      errors.push('post-submit: JSON observe report lines must be an array of strings when present');
    } else if (report.lines.some(hasContradictoryValidationFailureMarker)) {
      errors.push('post-submit: JSON observe report lines must not include contradictory failure markers');
    } else if (report.lines.some(hasUnresolvedEvidenceIssueMarker)) {
      errors.push('post-submit: JSON observe report lines must not include remaining issues');
    }
  }
  errors.push(...validatePostSubmitObservationJson(report, options));

  return {
    errors,
    markdown: errors.length === 0 && typeof report.markdown === 'string' ? report.markdown : undefined,
  };
}

function validatePostSubmitObservationJson(
  report: Record<string, unknown>,
  options: PostSubmitObserveJsonValidationOptions,
): string[] {
  const errors: string[] = [];
  const observation = isRecord(report.observation) ? report.observation : undefined;
  if (!observation) {
    return ['post-submit: JSON observe report observation object is required'];
  }

  const txBinding = isRecord(observation.txBinding) ? observation.txBinding : undefined;
  const expectedTxId = normalizeHex32Value(txBinding?.expectedTxId);
  const submittedTxId = normalizeHex32Value(txBinding?.submittedTxId);
  if (!expectedTxId) errors.push('post-submit: JSON observe report observation.txBinding.expectedTxId must be 32-byte hex');
  if (!submittedTxId) errors.push('post-submit: JSON observe report observation.txBinding.submittedTxId must be 32-byte hex');
  if (txBinding?.idsMatch !== true || !expectedTxId || !submittedTxId || expectedTxId !== submittedTxId) {
    errors.push('post-submit: JSON observe report observation.txBinding must prove matching expected/submitted IDs');
  }
  errors.push(...validateMarkdownSubmittedTxBinding(
    typeof report.markdown === 'string' ? report.markdown : undefined,
    submittedTxId,
  ));

  const burnOrder = normalizeHex32ArrayValue(observation.burnOrder);
  if (!burnOrder) errors.push('post-submit: JSON observe report observation.burnOrder must contain burn IDs');
  else if (hasDuplicateHex32Values(burnOrder)) {
    errors.push('post-submit: JSON observe report observation.burnOrder must not contain duplicates');
  }

  errors.push(...validatePostSubmitSourceBindings(
    report,
    expectedTxId,
    submittedTxId,
    burnOrder,
  ));

  errors.push(...validateLivePreflightBinding(
    observation,
    expectedTxId,
    burnOrder,
    options.livePreflightTarget,
    options.livePreflightApprovedBurnTxHashes,
    typeof report.markdown === 'string' ? report.markdown : undefined,
  ));

  const settlementOutputs = isRecord(observation.settlementOutputs) ? observation.settlementOutputs : undefined;
  const settlementOutputBoxIds = normalizeHex32ArrayValue(settlementOutputs?.boxIds);
  if (
    !settlementOutputs ||
    !isSafePositiveInteger(settlementOutputs.outputCount) ||
    !settlementOutputBoxIds
  ) {
    errors.push('post-submit: JSON observe report observation.settlementOutputs must include outputCount and boxIds');
  } else if (settlementOutputs.outputCount !== settlementOutputBoxIds.length) {
    errors.push('post-submit: JSON observe report settlement output count must match boxIds length');
  } else if (hasDuplicateHex32Values(settlementOutputBoxIds)) {
    errors.push('post-submit: JSON observe report settlementOutputs.boxIds must not contain duplicates');
  }

  const successors = isRecord(observation.successors) ? observation.successors : undefined;
  const spvTracker = isRecord(successors?.spvTracker) ? successors.spvTracker : undefined;
  const aggregateDup = isRecord(successors?.aggregateDup) ? successors.aggregateDup : undefined;
  const spvTrackerBoxId = normalizeHex32Value(spvTracker?.boxId);
  const aggregateDupBoxId = normalizeHex32Value(aggregateDup?.boxId);
  if (spvTracker?.outputIndex !== 0 || !spvTrackerBoxId) {
    errors.push('post-submit: JSON observe report must bind SPV tracker successor to OUTPUTS(0)');
  }
  if (aggregateDup?.outputIndex !== 1 || !aggregateDupBoxId) {
    errors.push('post-submit: JSON observe report must bind aggregate DUP successor to OUTPUTS(1)');
  }
  if (settlementOutputBoxIds && spvTrackerBoxId && settlementOutputBoxIds[0] !== spvTrackerBoxId) {
    errors.push('post-submit: JSON observe report settlementOutputs.boxIds[0] must match SPV tracker successor');
  }
  if (settlementOutputBoxIds && aggregateDupBoxId && settlementOutputBoxIds[1] !== aggregateDupBoxId) {
    errors.push('post-submit: JSON observe report settlementOutputs.boxIds[1] must match aggregate DUP successor');
  }

  const recipientPayouts = Array.isArray(observation.recipientPayouts) ? observation.recipientPayouts : undefined;
  const payoutOutputIndices: number[] = [];
  if (!recipientPayouts || recipientPayouts.length === 0) {
    errors.push('post-submit: JSON observe report observation.recipientPayouts must be non-empty');
  } else if (burnOrder && recipientPayouts.length !== burnOrder.length) {
    errors.push('post-submit: JSON observe report payout count must match burn order');
  } else {
    recipientPayouts.forEach((payout, index) => {
      const record = isRecord(payout) ? payout : undefined;
      const burnTxId = normalizeHex32Value(record?.burnTxId);
      const outputIndex = record?.outputIndex;
      const payoutBoxId = normalizeHex32Value(record?.boxId);
      if (!record || burnTxId !== burnOrder?.[index] || outputIndex !== 2 + index || !payoutBoxId) {
        errors.push(`post-submit: JSON observe report payout ${index + 1} must bind burn order to OUTPUTS(${2 + index})`);
      } else {
        payoutOutputIndices.push(outputIndex);
        if (settlementOutputBoxIds && settlementOutputBoxIds[2 + index] !== payoutBoxId) {
          errors.push(`post-submit: JSON observe report settlementOutputs.boxIds[${2 + index}] must match payout ${index + 1}`);
        }
      }
    });
  }

  const aggregateUnlockChange = isRecord(observation.aggregateUnlockChange)
    ? observation.aggregateUnlockChange
    : undefined;
  const aggregateUnlockChangeBoxId = normalizeHex32Value(aggregateUnlockChange?.boxId);
  if (settlementOutputBoxIds && burnOrder) {
    const noChangeOutputCount = burnOrder.length + 3;
    const withChangeOutputCount = burnOrder.length + 4;
    const changeIndex = 2 + burnOrder.length;
    if (settlementOutputBoxIds.length > noChangeOutputCount && !aggregateUnlockChange) {
      errors.push('post-submit: JSON observe report must explicitly bind aggregate unlock change output when present');
    }
    if (settlementOutputBoxIds.length > withChangeOutputCount) {
      errors.push('post-submit: JSON observe report settlement outputs must contain at most one aggregate unlock change output');
    }
    if (aggregateUnlockChange) {
      if (
        aggregateUnlockChange.outputIndex !== changeIndex ||
        !aggregateUnlockChangeBoxId ||
        settlementOutputBoxIds[changeIndex] !== aggregateUnlockChangeBoxId
      ) {
        errors.push(`post-submit: JSON observe report aggregate unlock change must bind OUTPUTS(${changeIndex})`);
      }
      if (typeof aggregateUnlockChange.ergoTreeHex !== 'string' || !isHex(aggregateUnlockChange.ergoTreeHex)) {
        errors.push('post-submit: JSON observe report aggregate unlock change must bind ErgoTree hex');
      }
      if (!isPositiveIntegerString(aggregateUnlockChange.valueNanoErg)) {
        errors.push('post-submit: JSON observe report aggregate unlock change must bind positive valueNanoErg');
      } else if (!isPositiveSafeIntegerString(aggregateUnlockChange.valueNanoErg)) {
        errors.push('post-submit: JSON observe report aggregate unlock change valueNanoErg must be a positive safe integer');
      }
      if (aggregateUnlockChange.tokenless !== true) {
        errors.push('post-submit: JSON observe report aggregate unlock change must prove tokenless output');
      }
      if (settlementOutputBoxIds.length !== withChangeOutputCount) {
        errors.push('post-submit: JSON observe report aggregate unlock change requires exactly one change output before miner fee');
      }
    }
  }

  const minerFee = isRecord(observation.minerFee) ? observation.minerFee : undefined;
  const minerFeeBoxId = normalizeHex32Value(minerFee?.boxId);
  if (
    !minerFee ||
    typeof minerFee.outputIndex !== 'number' ||
    !minerFeeBoxId ||
    !isPositiveIntegerString(minerFee.feeNanoErg)
  ) {
    errors.push('post-submit: JSON observe report must bind final miner fee output boxId and feeNanoErg');
  } else if (settlementOutputBoxIds) {
    if (!isPositiveSafeIntegerString(minerFee.feeNanoErg)) {
      errors.push('post-submit: JSON observe report miner fee feeNanoErg must be a positive safe integer');
    }
    const finalOutputIndex = settlementOutputBoxIds.length - 1;
    const maxPayoutOutputIndex = payoutOutputIndices.length > 0 ? Math.max(...payoutOutputIndices) : 1;
    if (minerFee.outputIndex !== finalOutputIndex || minerFee.outputIndex <= maxPayoutOutputIndex) {
      errors.push('post-submit: JSON observe report miner fee must bind the final output after all payouts');
    }
    if (settlementOutputBoxIds[finalOutputIndex] !== minerFeeBoxId) {
      errors.push('post-submit: JSON observe report miner fee boxId must match the final settlement output');
    }
  }

  const confirmation = isRecord(observation.confirmation) ? observation.confirmation : undefined;
  const finalityEvidenceArtifact = typeof confirmation?.finalityEvidenceArtifact === 'string'
    ? confirmation.finalityEvidenceArtifact
    : undefined;
  if (
    !confirmation ||
    !isSafePositiveInteger(confirmation.count) ||
    !isSafePositiveInteger(confirmation.required) ||
    confirmation.policyMet !== true ||
    Number(confirmation.count) < Number(confirmation.required)
  ) {
    errors.push('post-submit: JSON observe report confirmation policy must be met');
  }
  if (!isCompletedArtifactTarget(finalityEvidenceArtifact)) {
    errors.push('post-submit: JSON observe report confirmation.finalityEvidenceArtifact must be a completed artifact:// target');
  }
  errors.push(...validateMarkdownConfirmationPolicyBinding(
    typeof report.markdown === 'string' ? report.markdown : undefined,
    submittedTxId,
    isSafePositiveInteger(confirmation?.required) ? Number(confirmation!.required) : undefined,
    isSafePositiveInteger(confirmation?.count) ? Number(confirmation!.count) : undefined,
    finalityEvidenceArtifact,
  ));

  const boundaries = isRecord(observation.boundaries) ? observation.boundaries : undefined;
  const falseFields = [
    'signs',
    'submits',
    'confirms',
    'reconciles',
    'authorizesBroadcast',
    'gate3ClosureAllowed',
    'productionReadyClaimAllowed',
    'testnetProductionCandidateClaimAllowed',
  ] as const;
  if (!boundaries || boundaries.readOnlyObservation !== true) {
    errors.push('post-submit: JSON observe report boundary must prove read-only observation');
  }
  for (const field of falseFields) {
    if (!boundaries || boundaries[field] !== false) {
      errors.push(`post-submit: JSON observe report boundaries.${field} must be false`);
    }
  }

  return errors;
}

function validatePostSubmitSourceBindings(
  report: Record<string, unknown>,
  expectedTxId: string | undefined,
  submittedTxId: string | undefined,
  burnOrder: string[] | undefined,
): string[] {
  const errors: string[] = [];
  const sourceBindings = isRecord(report.sourceBindings) ? report.sourceBindings : undefined;
  const node = isRecord(sourceBindings?.node) ? sourceBindings.node : undefined;
  if (!isValidPostSubmitNodeSourceBinding(node, expectedTxId, submittedTxId)) {
    errors.push(
      'post-submit: JSON observe report sourceBindings.node must prove live-read-only-node read-only provenance',
    );
  }
  if (node) {
    errors.push(...validateStringArrayEntries(
      node.operations,
      'post-submit: JSON observe report sourceBindings.node.operations',
    ));
  }
  if (node && operationsContainUnsafeMarker(node.operations)) {
    errors.push(
      'post-submit: JSON observe report sourceBindings.node.operations must not include signing, submission, broadcast, reconciliation, or mutation operations',
    );
  }

  const state = isRecord(sourceBindings?.state) ? sourceBindings.state : undefined;
  if (!isValidPostSubmitStateSourceBinding(state, burnOrder)) {
    errors.push(
      'post-submit: JSON observe report sourceBindings.state must prove read-only-state-tracker operator-provided-state-db provenance without serialized runtime paths',
    );
  }
  if (state) {
    errors.push(...validateStringArrayEntries(
      state.operations,
      'post-submit: JSON observe report sourceBindings.state.operations',
    ));
  }
  if (state && operationsContainUnsafeMarker(state.operations)) {
    errors.push(
      'post-submit: JSON observe report sourceBindings.state.operations must not include signing, submission, broadcast, reconciliation, or mutation operations',
    );
  }

  return errors;
}

function isValidPostSubmitNodeSourceBinding(
  node: Record<string, unknown> | undefined,
  expectedTxId: string | undefined,
  submittedTxId: string | undefined,
): boolean {
  if (!node) return false;
  const boundExpectedTxId = normalizeHex32Value(node.expectedTxId);
  const boundSubmittedTxId = normalizeHex32Value(node.submittedTxId);
  return (
    node.sourceType === 'live-read-only-node' &&
    node.readOnly === true &&
    node.noAuthHeader === true &&
    typeof node.ergoNodeUrl === 'string' &&
    validateReadOnlyNodeUrl(node.ergoNodeUrl, 'post-submit: JSON observe report sourceBindings.node.ergoNodeUrl').length === 0 &&
    isIsoUtcTimestamp(node.observedAt) &&
    isNonNegativeSafeInteger(node.nodeHeight) &&
    identifiesPositiveTestnetNetwork(node.nodeNetwork) &&
    boundExpectedTxId !== undefined &&
    expectedTxId !== undefined &&
    boundExpectedTxId === expectedTxId &&
    boundSubmittedTxId !== undefined &&
    submittedTxId !== undefined &&
    boundSubmittedTxId === submittedTxId &&
    hasReadOnlyNodeOperations(node.operations) &&
    !containsForbiddenNodeSourceBindingValue(node)
  );
}

function isValidPostSubmitStateSourceBinding(
  state: Record<string, unknown> | undefined,
  burnOrder: string[] | undefined,
): boolean {
  if (!state) return false;
  const boundBurnOrder = normalizeHex32ArrayValue(state.burnOrder);
  return (
    state.sourceType === 'read-only-state-tracker' &&
    state.readOnly === true &&
    state.runtimePathSerialized === false &&
    state.targetClass === 'operator-provided-state-db' &&
    boundBurnOrder !== undefined &&
    burnOrder !== undefined &&
    sameOrderedHexValues(boundBurnOrder, burnOrder) &&
    hasReadOnlyStateOperations(state.operations) &&
    !containsForbiddenStateSourceBindingValue(state)
  );
}

function hasReadOnlyNodeOperations(value: unknown): boolean {
  const operations = stringArrayValues(value).map(item => item.toLowerCase());
  return operations.some(item => /\bread[- ]only\b/.test(item) && /\/info\b/.test(item)) &&
    operations.some(item => /\bread[- ]only\b/.test(item) && /\btransaction\b/.test(item));
}

function hasReadOnlyStateOperations(value: unknown): boolean {
  return stringArrayValues(value)
    .some(item => /\bread[- ]only\b/i.test(item) && /\bpeg[- ]out\b/i.test(item) && /\bstate\b/i.test(item));
}

function operationsContainUnsafeMarker(value: unknown): boolean {
  return stringArrayValues(value).some(item =>
    /\b(?:broadcast(?:ed|ing|s)?|submit(?:ted|ting|s)?|submission|sign(?:ed|ing|s|ature)?|send(?:ing|s)?|spend(?:ing|s)?|mutat(?:e|ed|es|ing|ion)|write(?:s|n|ing)?|post(?:ed|ing)?|put|delete|patch|repair(?:ed|ing)?|reconcile(?:d|s|ing|iation)?|state\s*(?:update|mutation)|node\s*mutation)\b/i.test(item),
  );
}

function validateStringArrayEntries(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) return [];
  return value.some(item => typeof item !== 'string')
    ? [`${label} entries must be strings`]
    : [];
}

function containsForbiddenNodeSourceBindingValue(value: unknown): boolean {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase().replace(/\\/g, '/');
    return (
      isLocalRuntimeOrSecretTarget(normalized) ||
      /\b(?:authorization|bearer|api[-_ ]?key|auth[-_ ]?header|secret|token|password|credential)\b/i.test(normalized) ||
      /^[a-z]:\//i.test(normalized)
    );
  }
  if (Array.isArray(value)) {
    return value.some(containsForbiddenNodeSourceBindingValue);
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .filter(([key]) => key !== 'ergoNodeUrl' && key !== 'noAuthHeader')
      .some(([key, child]) =>
        /^(?:authheader|authorization|apikey|token|secret|password|credential)$/i.test(key.replace(/[-_\s]/g, '')) ||
        containsForbiddenNodeSourceBindingValue(child),
      );
  }
  return false;
}

function containsForbiddenStateSourceBindingValue(value: unknown): boolean {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase().replace(/\\/g, '/');
    return (
      isLocalRuntimeOrSecretTarget(normalized) ||
      /\b(?:authorization|bearer|api[-_ ]?key|auth[-_ ]?header|secret|token|password|credential)\b/i.test(normalized) ||
      /^[a-z]:\//i.test(normalized)
    );
  }
  if (Array.isArray(value)) {
    return value.some(containsForbiddenStateSourceBindingValue);
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .filter(([key]) => key !== 'targetClass')
      .some(([key, child]) =>
        /^(?:authheader|authorization|apikey|token|secret|password|credential|runtimepath|statepath|dbpath)$/i.test(key.replace(/[-_\s]/g, '')) ||
        containsForbiddenStateSourceBindingValue(child),
      );
  }
  return false;
}

function identifiesPositiveTestnetNetwork(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.toLowerCase();
  const withoutNonMainnet = normalized.replace(/\bnon[- ]?main[- ]?net\b/gi, '');
  return /\btestnet\b/.test(normalized) &&
    !/\b(?:main[- ]?net|main\s+network|main[- ]?chain|mainchain)\b/.test(withoutNonMainnet) &&
    !/\b(?:not|no|without)\s+(?:on\s+|using\s+|connected\s+to\s+|the\s+)?testnet\b/.test(normalized);
}

function isIsoUtcTimestamp(value: unknown): boolean {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value));
}

function isNonNegativeSafeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function stringArrayValues(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => String(item)) : [];
}

function validateMarkdownConfirmationPolicyBinding(
  markdown: string | undefined,
  submittedTxId: string | undefined,
  confirmationsRequired: number | undefined,
  confirmationsObserved: number | undefined,
  finalityEvidenceArtifact: string | undefined,
): string[] {
  const errors: string[] = [];
  if (!markdown) return errors;

  const line = /^-\s*Confirmation policy met:\s*(.+)$/im.exec(markdown)?.[1] ?? '';
  if (!line) {
    return ['post-submit: JSON observe report markdown must include Confirmation policy met'];
  }
  if (!/^yes\b/i.test(line.trim())) {
    errors.push('post-submit: JSON observe report markdown Confirmation policy met must be yes');
  }
  if (!/\bfinality\b/i.test(line)) {
    errors.push('post-submit: JSON observe report markdown Confirmation policy met must cite finality evidence');
  }
  if (
    finalityEvidenceArtifact &&
    !lineCitesExactPostSubmitObserveTarget(line, finalityEvidenceArtifact)
  ) {
    errors.push(
      'post-submit: JSON observe report markdown Confirmation policy met must cite observation.confirmation.finalityEvidenceArtifact',
    );
  }
  if (
    confirmationsRequired !== undefined &&
    !new RegExp(`\\bconfirmationsRequired=${confirmationsRequired}\\b`).test(line)
  ) {
    errors.push('post-submit: JSON observe report markdown Confirmation policy met must cite confirmationsRequired');
  }
  if (
    confirmationsObserved !== undefined &&
    !new RegExp(`\\bconfirmationsObserved=${confirmationsObserved}\\b`).test(line)
  ) {
    errors.push('post-submit: JSON observe report markdown Confirmation policy met must cite confirmationsObserved');
  }
  if (submittedTxId && !line.toLowerCase().includes(submittedTxId)) {
    errors.push('post-submit: JSON observe report markdown Confirmation policy met must cite submitted transaction ID');
  }

  return errors;
}

function validateMarkdownSubmittedTxBinding(
  markdown: string | undefined,
  submittedTxId: string | undefined,
): string[] {
  const errors: string[] = [];
  if (!markdown) return errors;

  const line = /^-\s*Submitted transaction ID:\s*(.+)$/im.exec(markdown)?.[1] ?? '';
  if (!line) {
    return ['post-submit: JSON observe report markdown must include Submitted transaction ID'];
  }
  if (submittedTxId && !line.toLowerCase().includes(submittedTxId)) {
    errors.push(
      'post-submit: JSON observe report markdown Submitted transaction ID must cite observation.txBinding.submittedTxId',
    );
  }

  return errors;
}

function validateLivePreflightBinding(
  observation: Record<string, unknown>,
  expectedTxId: string | undefined,
  burnOrder: string[] | undefined,
  expectedTarget: string | undefined,
  expectedApprovedBurnTxHashes: string[] | undefined,
  markdown: string | undefined,
): string[] {
  const errors: string[] = [];
  const binding = isRecord(observation.livePreflightBinding)
    ? observation.livePreflightBinding
    : undefined;
  if (!binding) {
    return ['post-submit: JSON observe report observation.livePreflightBinding is required'];
  }

  if (typeof binding.target !== 'string' || !isConcreteJsonTarget(binding.target)) {
    errors.push('post-submit: JSON observe report livePreflightBinding.target must be a concrete JSON report');
  }
  if (typeof binding.target === 'string' && hasShellUnsafeTargetContent(binding.target)) {
    errors.push('post-submit: JSON observe report livePreflightBinding.target must not contain whitespace or shell metacharacters');
  }
  if (
    expectedTarget &&
    typeof binding.target === 'string' &&
    normalizeEvidenceJsonTarget(binding.target) !== normalizeEvidenceJsonTarget(expectedTarget)
  ) {
    errors.push('post-submit: JSON observe report livePreflightBinding.target must match the validated live-preflight JSON target');
  }
  if (binding.status !== 'GO') {
    errors.push('post-submit: JSON observe report livePreflightBinding.status must be GO');
  }
  const boundExpectedTxId = normalizeHex32Value(binding.expectedTxId);
  if (!boundExpectedTxId || !expectedTxId || boundExpectedTxId !== expectedTxId) {
    errors.push('post-submit: JSON observe report livePreflightBinding.expectedTxId must match observation.txBinding.expectedTxId');
  }
  const approvedBurnTxHashes = normalizeHex32ArrayValue(binding.approvedBurnTxHashes);
  if (!approvedBurnTxHashes || !burnOrder || !sameOrderedHexValues(approvedBurnTxHashes, burnOrder)) {
    errors.push('post-submit: JSON observe report livePreflightBinding.approvedBurnTxHashes must match observation.burnOrder');
  }
  if (approvedBurnTxHashes && hasDuplicateHex32Values(approvedBurnTxHashes)) {
    errors.push('post-submit: JSON observe report livePreflightBinding.approvedBurnTxHashes must not contain duplicates');
  }
  if (
    approvedBurnTxHashes &&
    expectedApprovedBurnTxHashes &&
    !sameOrderedHexValues(approvedBurnTxHashes, expectedApprovedBurnTxHashes)
  ) {
    errors.push('post-submit: JSON observe report livePreflightBinding.approvedBurnTxHashes must match the validated live-preflight approvalBinding.burnTxHashes');
  }
  errors.push(...validateMarkdownLivePreflightBinding(
    markdown,
    binding.target,
    boundExpectedTxId,
    approvedBurnTxHashes,
  ));
  if (binding.runtimeBroadcastEnabled !== false) {
    errors.push('post-submit: JSON observe report livePreflightBinding.runtimeBroadcastEnabled must be false');
  }
  if (binding.preSubmitBoundaryPreserved !== true) {
    errors.push('post-submit: JSON observe report livePreflightBinding.preSubmitBoundaryPreserved must be true');
  }
  if (binding.authorizationEvidenceLinked !== true) {
    errors.push('post-submit: JSON observe report livePreflightBinding.authorizationEvidenceLinked must be true');
  }

  return errors;
}

function validateMarkdownLivePreflightBinding(
  markdown: string | undefined,
  bindingTarget: unknown,
  expectedTxId: string | undefined,
  approvedBurnTxHashes: string[] | undefined,
): string[] {
  const errors: string[] = [];
  if (!markdown) return errors;

  const line = /^-\s*Live-preflight JSON binding:\s*(.+)$/im.exec(markdown)?.[1] ?? '';
  if (!line) {
    return ['post-submit: JSON observe report markdown must include Live-preflight JSON binding'];
  }

  const markdownTarget = extractMarkdownLivePreflightBindingTarget(line);
  if (!markdownTarget || hasShellUnsafeTargetContent(markdownTarget)) {
    errors.push('post-submit: JSON observe report markdown Live-preflight JSON binding target must not contain whitespace or shell metacharacters');
  }
  const normalizedLine = normalizeEvidenceJsonTarget(line);
  if (
    !markdownTarget ||
    !/\.json$/i.test(markdownTarget) ||
    hasNonConcretePostSubmitObserveTargetSegment(markdownTarget)
  ) {
    errors.push('post-submit: JSON observe report markdown Live-preflight JSON binding must cite a concrete non-template JSON report');
  }
  if (
    typeof bindingTarget === 'string' &&
    (
      markdownTarget === undefined ||
      normalizeEvidenceJsonTarget(markdownTarget) !== normalizeEvidenceJsonTarget(bindingTarget)
    )
  ) {
    errors.push('post-submit: JSON observe report markdown Live-preflight JSON binding must cite observation.livePreflightBinding.target');
  }
  if (expectedTxId && !normalizedLine.includes(expectedTxId)) {
    errors.push('post-submit: JSON observe report markdown Live-preflight JSON binding must cite observation expectedTxId');
  }
  if (approvedBurnTxHashes && !sameOrderedHexValuesInText(normalizedLine, approvedBurnTxHashes)) {
    errors.push('post-submit: JSON observe report markdown Live-preflight JSON binding must cite approved burn order');
  }
  if (!/\bstatus\s+GO\b/i.test(line)) {
    errors.push('post-submit: JSON observe report markdown Live-preflight JSON binding must cite status GO');
  }
  if (!/\bruntimeBroadcastEnabled\s*[:=]?\s*false\b/i.test(line)) {
    errors.push('post-submit: JSON observe report markdown Live-preflight JSON binding must cite runtimeBroadcastEnabled false');
  }
  if (!/\bpre-submit boundary preserved\b/i.test(line)) {
    errors.push('post-submit: JSON observe report markdown Live-preflight JSON binding must preserve the pre-submit boundary');
  }
  if (!/\bauthorization evidence linked\b/i.test(line)) {
    errors.push('post-submit: JSON observe report markdown Live-preflight JSON binding must cite linked authorization evidence');
  }

  return errors;
}

function sameOrderedHexValues(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameOrderedHexValuesInText(text: string, values: string[]): boolean {
  let cursor = -1;
  for (const value of values) {
    const index = text.indexOf(value, cursor + 1);
    if (index === -1) return false;
    cursor = index;
  }
  return true;
}

function normalizeEvidenceJsonTarget(target: string): string {
  return target.trim().replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

function lineCitesExactPostSubmitObserveTarget(line: string, target: string): boolean {
  const normalizedTarget = normalizeEvidenceJsonTarget(target);
  return extractPostSubmitObserveTargets(line)
    .some(candidate => normalizeEvidenceJsonTarget(candidate) === normalizedTarget);
}

function extractPostSubmitObserveTargets(line: string): string[] {
  return [
    ...Array.from(
      line.matchAll(/(?:^|\s)(artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;|]+)/g),
      match => match[1].replace(/[.;]+$/g, ''),
    ),
    ...Array.from(
      line.matchAll(/\b([A-Za-z0-9._/-]+\.json)\b/g),
      match => match[1],
    ),
  ];
}

function extractMarkdownLivePreflightBindingTarget(line: string): string | undefined {
  return /^(.+?)\s+status\s+GO\b/i.exec(line)?.[1]?.trim();
}

function isConcreteJsonTarget(target: string): boolean {
  const normalized = normalizeEvidenceJsonTarget(target);
  return (
    /\.json$/i.test(normalized) &&
    !hasNonConcretePostSubmitObserveTargetSegment(normalized) &&
    !normalized.includes('://') &&
    !hasShellUnsafeTargetContent(normalized) &&
    !isLocalRuntimeOrSecretTarget(normalized)
  );
}

function hasShellUnsafeTargetContent(target: string): boolean {
  return !/^[A-Za-z0-9._/-]+$/.test(target.replace(/\\/g, '/'));
}

function isCompletedArtifactTarget(target: unknown): target is string {
  if (typeof target !== 'string') return false;
  const normalized = target.trim().replace(/\\/g, '/').toLowerCase();
  return (
    ARTIFACT_TARGET_PATTERN.test(target) &&
    !hasNonConcretePostSubmitObserveTargetSegment(normalized) &&
    !isLocalRuntimeOrSecretTarget(normalized)
  );
}

function hasNonConcretePostSubmitObserveTargetSegment(value: string): boolean {
  return value
    .split('#')[0]
    .split('?')[0]
    .replace(/[),;]+$/g, '')
    .toLowerCase()
    .split(/[\\/]+/)
    .some(segment => isNonConcretePostSubmitObserveTargetSegment(segment));
}

function isNonConcretePostSubmitObserveTargetSegment(segment: string): boolean {
  const normalized = segment.toLowerCase().replace(/\.[a-z0-9]+$/i, '');
  return (
    /[<>]/.test(segment) ||
    /(?:^|[-_.])(?:not[-_]?completed|uncompleted)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:placeholder|generic|todo|tbd)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:sample|example)[-_ ]*evidence(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:sample|example|template)(?:[-_.](?:post|submit|submitted|observe|observation|live|preflight|report|confirmation|confirm|finality|reconciliation|reconcile|artifact|target|json|log|run|check|row|evidence)|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:post|submit|submitted|observe|observation|live|preflight|report|confirmation|confirm|finality|reconciliation|reconcile|artifact|target|json|log|run|check|row|evidence)(?:[-_.](?:sample|example|template)(?:[-_.]|$))/i.test(normalized)
  );
}

function isLocalRuntimeOrSecretTarget(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(isLocalRuntimeOrSecretInspectionTarget);
}

function isLocalRuntimeOrSecretInspectionTarget(normalizedTarget: string): boolean {
  const name = basename(normalizedTarget);
  return (
    hasLocalOnlyInspectionReference(normalizedTarget) ||
    /^file:\/\//i.test(normalizedTarget) ||
    /^[a-z]:\//i.test(normalizedTarget) ||
    /^\/\/[^/]/.test(normalizedTarget) ||
    /^\/(?:users?|home|tmp|var|private|mnt|volumes|etc)(?:\/|$)/i.test(normalizedTarget) ||
    hasEnvironmentTargetSegment(normalizedTarget) ||
    hasRuntimeDatabaseTargetSegment(normalizedTarget) ||
    isEvidenceEnvironmentFileName(name) ||
    isEvidenceSecretOrRuntimeName(normalizedTarget, { includeDeployedState: true }) ||
    isEvidenceRuntimeDatabaseTarget(normalizedTarget)
  );
}

function hasLocalOnlyInspectionReference(normalizedTarget: string): boolean {
  return /(?:^|[\s([<=])(?:file:\/\/|[a-z]:\/|\/\/[^/\s]|\/(?:users?|home|tmp|var|private|mnt|volumes|etc)(?:\/|$))/i
    .test(normalizedTarget);
}

function hasEnvironmentTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\/\s,;=()]+/)
    .some(segment => isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasRuntimeDatabaseTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\s,;=()]+/)
    .some(segment => isEvidenceRuntimeDatabaseTarget(segment.replace(/[),;]+$/g, '')));
}

function hasContradictoryValidationFailureMarker(segment: string): boolean {
  const normalized = normalizeEvidenceMarkerText(segment);
  return (
    /(?:^|[^A-Za-z0-9_-])FAIL(?:$|[^A-Za-z0-9_-])/i.test(normalized) ||
    /\b(?:status|result|validation|validator|command|outcome)\s*[:=]?\s*FAILED\b/i.test(normalized) ||
    /\bFAILED\b\s+(?:validation|validator|command|run|result|status)\b/i.test(normalized) ||
    /\bBLOCKED\b/i.test(normalized) ||
    /\bERROR\b/i.test(normalized) ||
    /\bexit\s+code\s*[:=]?\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\berrors?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    hasStructuredValidationFailureMarker(normalized) ||
    /\bstructural\s+issues?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\b[1-9]\d*\s+structural\s+issues?\b/i.test(normalized)
  );
}

function hasUnresolvedEvidenceIssueMarker(segment: string): boolean {
  return hasUnresolvedIssueMarker(normalizeEvidenceMarkerText(segment));
}

function normalizeHex32Value(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replace(/^0x/, '');
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : undefined;
}

function normalizeHex32ArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const normalized = value.map(normalizeHex32Value);
  return normalized.every((item): item is string => item !== undefined) ? normalized : undefined;
}

function hasDuplicateHex32Values(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

function isSafePositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isPositiveIntegerString(value: unknown): boolean {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value);
}

function isPositiveSafeIntegerString(value: unknown): boolean {
  return isPositiveIntegerString(value) && Number.isSafeInteger(Number(value));
}

function isHex(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/^0x/, '');
  return normalized.length > 0 && normalized.length % 2 === 0 && /^[0-9a-f]+$/.test(normalized);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
