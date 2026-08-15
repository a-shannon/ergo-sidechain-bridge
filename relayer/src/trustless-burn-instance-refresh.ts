import type { TrustlessUnsignedTxEvidenceJsonValidation } from './aggregate-settlement-candidate-evidence-json.js';
import type { AggregateSettlementTrustlessUnsignedTxEvidenceRecord } from './aggregate-settlement-evidence.js';
import { sanitizeReportText } from './report-text-sanitizer.js';
import {
  validateTrustlessBurnContractAcceptanceReportJson,
  type TrustlessBurnContractAcceptanceReport,
} from './trustless-burn-contract-acceptance-report.js';
import {
  validateTrustlessBurnInstanceBindingReportJson,
  type TrustlessBurnInstanceBindingReport,
  type TrustlessBurnInstanceIdentity,
} from './trustless-burn-instance-binding.js';

export type TrustlessBurnInstanceRefreshStatus =
  | 'TRUSTLESS_BURN_INSTANCE_REFRESH_READY'
  | 'TRUSTLESS_BURN_INSTANCE_REFRESH_BLOCKED';

export type TrustlessBurnInstanceRefreshCheckStatus = 'pass' | 'blocked';

export interface TrustlessBurnInstanceRefreshCheck {
  check: string;
  status: TrustlessBurnInstanceRefreshCheckStatus;
  detail: string;
}

export interface TrustlessBurnInstanceRefreshInput {
  sourceCommit: string;
  command: string;
  instanceBindingTarget: string;
  instanceBindingJsonTarget: string;
  instanceBindingJson: unknown;
  instanceBindingMarkdown: string;
  candidateTarget: string;
  candidateMarkdown: string;
  proofVectorReportTarget: string;
  proofVectorReportJson: unknown;
  unsignedTxReportTarget: string;
  unsignedTxReportMarkdown: string;
  unsignedTxJsonTarget: string;
  unsignedTxValidation: TrustlessUnsignedTxEvidenceJsonValidation;
  contractAcceptanceJsonTarget?: string;
  contractAcceptanceJson?: unknown;
}

export interface TrustlessBurnInstanceRefreshReport {
  status: TrustlessBurnInstanceRefreshStatus;
  exitCode: 0 | 1;
  command: string;
  sourceCommit: string;
  instanceBindingTarget: string;
  instanceBindingJsonTarget: string;
  candidateTarget: string;
  proofVectorReportTarget: string;
  unsignedTxReportTarget: string;
  unsignedTxJsonTarget: string;
  contractAcceptanceJsonTarget?: string;
  selectedNetwork: string;
  identity: TrustlessBurnInstanceIdentity;
  structuralIssues: number;
  checks: TrustlessBurnInstanceRefreshCheck[];
  mismatches: string[];
  nextEvidence: string[];
  boundary: Record<string, 'yes' | 'no'>;
}

export function buildTrustlessBurnInstanceRefreshCommand(input: {
  sourceCommit: string;
  instanceBinding: string;
  instanceBindingJson: string;
  candidate: string;
  proofVectorReport: string;
  unsignedTxReport: string;
  unsignedTxJson: string;
  contractAcceptanceJson?: string;
  out?: string;
  jsonOut?: string;
}): string {
  const parts = [
    'npm run trustless:instance-refresh --',
    '--source-commit',
    sanitize(input.sourceCommit),
    '--instance-binding',
    sanitize(input.instanceBinding),
    '--instance-binding-json',
    sanitize(input.instanceBindingJson),
    '--candidate',
    sanitize(input.candidate),
    '--proof-vector-report',
    sanitize(input.proofVectorReport),
    '--unsigned-tx-report',
    sanitize(input.unsignedTxReport),
    '--unsigned-tx-json',
    sanitize(input.unsignedTxJson),
  ];
  if (input.contractAcceptanceJson) {
    parts.push('--contract-acceptance-json', sanitize(input.contractAcceptanceJson));
  }
  if (input.out) parts.push('--out <refresh.md>');
  if (input.jsonOut) parts.push('--json-out <refresh.json>');
  return parts.join(' ');
}

export function buildTrustlessBurnInstanceRefreshReport(
  input: TrustlessBurnInstanceRefreshInput,
): TrustlessBurnInstanceRefreshReport {
  const bindingErrors = validateTrustlessBurnInstanceBindingReportJson(input.instanceBindingJson);
  if (bindingErrors.length > 0) {
    throw new Error(bindingErrors.join('; '));
  }
  const binding = input.instanceBindingJson as TrustlessBurnInstanceBindingReport;
  const checks: TrustlessBurnInstanceRefreshCheck[] = [];
  const mismatches: string[] = [];
  const identity = binding.identity;

  addCheck(
    checks,
    'Instance binding Markdown matches JSON identity',
    instanceBindingMarkdownMatches(input.instanceBindingMarkdown, identity),
    `binding target ${input.instanceBindingTarget} carries burnId ${identity.burnIdHex}`,
    'instance binding Markdown must contain the bound burnId, bridgeEventRoot, DUP key, recipient, amount, and proof-vector target',
  );
  addCheck(
    checks,
    'Candidate target matches instance binding target',
    normalizeTarget(input.candidateTarget) === normalizeTarget(binding.candidateTarget),
    `candidate target ${input.candidateTarget}`,
    `candidate target must equal instance binding candidateTarget ${binding.candidateTarget}`,
  );
  addCheck(
    checks,
    'Candidate Markdown carries bound instance identity',
    candidateMarkdownMatches(input.candidateMarkdown, identity),
    'candidate carries the bound burnId, root, recipient, amount, and sidechain identifiers',
    'candidate Markdown must carry every bound instance identifier before it can support refresh evidence',
  );
  addCheck(
    checks,
    'Proof-vector target matches instance binding target',
    normalizeTarget(input.proofVectorReportTarget) === normalizeTarget(identity.proofVectorTarget),
    `proof-vector report target ${input.proofVectorReportTarget}`,
    `proof-vector report target must equal instance proofVectorTarget ${identity.proofVectorTarget}`,
  );
  addProofVectorChecks(checks, identity, input.proofVectorReportJson);
  addUnsignedValidationReportChecks(
    checks,
    input.unsignedTxReportMarkdown,
    input.unsignedTxJsonTarget,
  );
  addUnsignedTxJsonChecks(checks, mismatches, identity, input.unsignedTxValidation);
  addContractAcceptanceJsonChecks(
    checks,
    mismatches,
    identity,
    input.contractAcceptanceJsonTarget,
    input.contractAcceptanceJson,
  );

  const structuralIssues = checks.filter(check => check.status === 'blocked').length + mismatches.length;
  const status: TrustlessBurnInstanceRefreshStatus =
    structuralIssues === 0 ? 'TRUSTLESS_BURN_INSTANCE_REFRESH_READY' : 'TRUSTLESS_BURN_INSTANCE_REFRESH_BLOCKED';

  return {
    status,
    exitCode: status === 'TRUSTLESS_BURN_INSTANCE_REFRESH_READY' ? 0 : 1,
    command: sanitize(input.command),
    sourceCommit: sanitize(input.sourceCommit),
    instanceBindingTarget: sanitize(input.instanceBindingTarget),
    instanceBindingJsonTarget: sanitize(input.instanceBindingJsonTarget),
    candidateTarget: sanitize(input.candidateTarget),
    proofVectorReportTarget: sanitize(input.proofVectorReportTarget),
    unsignedTxReportTarget: sanitize(input.unsignedTxReportTarget),
    unsignedTxJsonTarget: sanitize(input.unsignedTxJsonTarget),
    ...(input.contractAcceptanceJsonTarget
      ? { contractAcceptanceJsonTarget: sanitize(input.contractAcceptanceJsonTarget) }
      : {}),
    selectedNetwork: sanitize(binding.selectedNetwork),
    identity,
    structuralIssues,
    checks,
    mismatches,
    nextEvidence: buildNextEvidence(identity, mismatches),
    boundary: buildBoundary({ contractAcceptanceChecked: input.contractAcceptanceJsonTarget !== undefined }),
  };
}

export function formatTrustlessBurnInstanceRefreshMarkdown(
  report: TrustlessBurnInstanceRefreshReport,
): string {
  return [
    '# Gate 5 Trustless Burn Instance Refresh Check',
    '',
    'This packet checks whether the local proof-vector, candidate, and unsigned transaction evidence are bound to the same non-mainnet trustless-burn instance.',
    report.contractAcceptanceJsonTarget
      ? 'It also checks the linked local contract-equivalent acceptance JSON against the same bound instance.'
      : 'No local contract-equivalent acceptance JSON target was supplied for this refresh packet.',
    'It does not close Gate 5, does not authorize transaction checks, signing, submit, broadcast, deployment, reconciliation, release-gate PASS, mainnet, production-ready, or testnet-production-candidate claims.',
    '',
    '## Summary',
    '',
    markdownTable([
      ['Field', 'Value'],
      ['Status', report.status],
      ['Exit code', String(report.exitCode)],
      ['Source commit', report.sourceCommit],
      ['Selected network', report.selectedNetwork],
      ['Structural issues', String(report.structuralIssues)],
    ]),
    '',
    '## Source Targets',
    '',
    markdownTable([
      ['Target', 'Value'],
      ['Instance binding', report.instanceBindingTarget],
      ['Instance binding JSON', report.instanceBindingJsonTarget],
      ['Candidate', report.candidateTarget],
      ['Proof-vector report', report.proofVectorReportTarget],
      ['Unsigned TX validation report', report.unsignedTxReportTarget],
      ['Unsigned TX JSON', report.unsignedTxJsonTarget],
      ...(report.contractAcceptanceJsonTarget
        ? [['Contract-equivalent acceptance JSON', report.contractAcceptanceJsonTarget]]
        : []),
    ]),
    '',
    '## Bound Instance Identity',
    '',
    markdownTable([
      ['Field', 'Value'],
      ['sidechainId', report.identity.sidechainIdHex],
      ['sidechainTxHash', report.identity.sidechainTxHashHex],
      ['sidechainBlockHash', report.identity.sidechainBlockHashHex],
      ['eventIndex', String(report.identity.eventIndex)],
      ['bridgeEventRoot', report.identity.bridgeEventRootHex],
      ['ergoAnchorHeight', String(report.identity.ergoAnchorHeight)],
      ['burnId', report.identity.burnIdHex],
      ['duplicatePreventionKey', report.identity.duplicatePreventionKeyHex],
      ['recipientErgoTreeHash', report.identity.recipientErgoTreeHashHex],
      ['amountNanoErg', report.identity.amountNanoErg],
      ['assetId', report.identity.assetIdHex],
      ['proofVectorTarget', report.identity.proofVectorTarget],
    ]),
    '',
    '## Refresh Checks',
    '',
    markdownTable([
      ['Check', 'Status', 'Detail'],
      ...report.checks.map(check => [check.check, check.status, check.detail]),
    ]),
    '',
    '## Exact Binding Mismatches',
    '',
    ...(report.mismatches.length > 0 ? report.mismatches.map(issue => `- ${escapeMarkdownText(issue)}`) : ['- None.']),
    '',
    '## Next Evidence',
    '',
    ...report.nextEvidence.map(item => `- ${escapeMarkdownText(item)}`),
    '',
    '## Boundary',
    '',
    markdownTable([
      ['Boundary', 'Value'],
      ...Object.entries(report.boundary),
    ]),
    '',
  ].join('\n');
}

export function validateTrustlessBurnInstanceRefreshReportJson(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['--trustless-burn-instance-refresh-json report must be an object'];
  if (
    value.status !== 'TRUSTLESS_BURN_INSTANCE_REFRESH_READY' &&
    value.status !== 'TRUSTLESS_BURN_INSTANCE_REFRESH_BLOCKED'
  ) {
    errors.push('--trustless-burn-instance-refresh-json report.status must be a known refresh status');
  }
  if (value.status === 'TRUSTLESS_BURN_INSTANCE_REFRESH_READY' && value.exitCode !== 0) {
    errors.push('--trustless-burn-instance-refresh-json report.exitCode must be 0 for READY');
  }
  if (value.status === 'TRUSTLESS_BURN_INSTANCE_REFRESH_BLOCKED' && value.exitCode !== 1) {
    errors.push('--trustless-burn-instance-refresh-json report.exitCode must be 1 for BLOCKED');
  }
  for (const field of [
    'command',
    'sourceCommit',
    'instanceBindingTarget',
    'instanceBindingJsonTarget',
    'candidateTarget',
    'proofVectorReportTarget',
    'unsignedTxReportTarget',
    'unsignedTxJsonTarget',
    'selectedNetwork',
  ]) {
    if (typeof value[field] !== 'string' || value[field].trim().length === 0) {
      errors.push(`--trustless-burn-instance-refresh-json report.${field} must be a non-empty string`);
    }
  }
  if (typeof value.sourceCommit === 'string' && !/^[0-9a-f]{7,40}$/i.test(value.sourceCommit)) {
    errors.push('--trustless-burn-instance-refresh-json report.sourceCommit must be a 7-40 character hex commit identifier');
  }
  if (
    value.contractAcceptanceJsonTarget !== undefined &&
    (typeof value.contractAcceptanceJsonTarget !== 'string' || value.contractAcceptanceJsonTarget.trim().length === 0)
  ) {
    errors.push('--trustless-burn-instance-refresh-json report.contractAcceptanceJsonTarget must be a non-empty string when present');
  }
  if (
    typeof value.selectedNetwork === 'string' &&
    /\bmainnet\b/i.test(value.selectedNetwork) &&
    !/\bnon-mainnet\b/i.test(value.selectedNetwork)
  ) {
    errors.push('--trustless-burn-instance-refresh-json report.selectedNetwork must be non-mainnet');
  }
  validateIdentity(value.identity, errors);
  validateChecks(value.checks, errors);
  validateStringArray(value.mismatches, 'mismatches', errors, { allowEmpty: true });
  validateStringArray(value.nextEvidence, 'nextEvidence', errors);
  const structuralIssues = typeof value.structuralIssues === 'number' ? value.structuralIssues : Number.NaN;
  if (!isNonNegativeSafeInteger(structuralIssues)) {
    errors.push('--trustless-burn-instance-refresh-json report.structuralIssues must be a non-negative safe integer');
  }
  if (value.status === 'TRUSTLESS_BURN_INSTANCE_REFRESH_READY') {
    if (structuralIssues !== 0) {
      errors.push('--trustless-burn-instance-refresh-json READY report.structuralIssues must be 0');
    }
    if (Array.isArray(value.checks) && value.checks.some(check => isRecord(check) && check.status !== 'pass')) {
      errors.push('--trustless-burn-instance-refresh-json READY report must not contain blocked checks');
    }
    if (Array.isArray(value.mismatches) && value.mismatches.length !== 0) {
      errors.push('--trustless-burn-instance-refresh-json READY report.mismatches must be empty');
    }
  }
  if (value.status === 'TRUSTLESS_BURN_INSTANCE_REFRESH_BLOCKED') {
    if (!isNonNegativeSafeInteger(structuralIssues) || structuralIssues <= 0) {
      errors.push('--trustless-burn-instance-refresh-json BLOCKED report.structuralIssues must be positive');
    }
    if (Array.isArray(value.checks) && value.checks.every(check => isRecord(check) && check.status === 'pass')) {
      errors.push('--trustless-burn-instance-refresh-json BLOCKED report must contain at least one blocked check');
    }
  }
  validateBoundary(value.boundary, errors);
  if (findLocalPathLeak(value)) {
    errors.push('--trustless-burn-instance-refresh-json report must not serialize local absolute paths');
  }
  return errors;
}

function addProofVectorChecks(
  checks: TrustlessBurnInstanceRefreshCheck[],
  identity: TrustlessBurnInstanceIdentity,
  proofVectorReportJson: unknown,
): void {
  if (!isRecord(proofVectorReportJson)) {
    addCheck(
      checks,
      'Proof-vector report JSON is parseable',
      false,
      '',
      'proof-vector report must be a JSON object',
    );
    return;
  }
  addCheck(
    checks,
    'Proof-vector report status is PASS',
    proofVectorReportJson.status === 'PASS',
    'proof-vector report status PASS',
    'proof-vector report status must be PASS',
  );
  const boundary = isRecord(proofVectorReportJson.boundary) ? proofVectorReportJson.boundary : {};
  addCheck(
    checks,
    'Proof-vector report remains local read-only evidence',
    boundary.readOnly === true &&
      boundary.localProofCoreOnly === true &&
      boundary.gate5Closure === false &&
      boundary.settlementReadiness === false &&
      boundary.broadcastAuthorization === false &&
      boundary.productionClaimSupport === false &&
      boundary.testnetProductionCandidateClaimSupport === false,
    'proof-vector boundary is readOnly/localProofCoreOnly with no closure, settlement, broadcast, or claim support',
    'proof-vector boundary must remain read-only local proof-core evidence with all claim and broadcast flags false',
  );
  const reports = Array.isArray(proofVectorReportJson.reports) ? proofVectorReportJson.reports : [];
  const matchingRootReport = reports.find(report =>
    isRecord(report) &&
    report.status === 'PASS' &&
    normalizeHex(report.bridgeEventRootHex) === identity.bridgeEventRootHex,
  );
  addCheck(
    checks,
    'Proof-vector report bridgeEventRoot matches instance',
    matchingRootReport !== undefined,
    `bridgeEventRoot ${identity.bridgeEventRootHex}`,
    `proof-vector report must include a PASS result for bridgeEventRoot ${identity.bridgeEventRootHex}`,
  );
  const negativeCases = matchingRootReport && isRecord(matchingRootReport)
    ? (Array.isArray(matchingRootReport.negativeCaseResults) ? matchingRootReport.negativeCaseResults : [])
    : [];
  const requiredNegativeCases = [
    'wrong-sidechain-id',
    'wrong-burn-id',
    'wrong-event-index',
    'wrong-recipient',
    'wrong-amount',
    'wrong-duplicate-prevention-key',
    'wrong-bridge-event-root',
    'malformed-inclusion-path',
  ];
  const rejectedNames = new Set(
    negativeCases
      .filter(result => isRecord(result) && result.status === 'REJECTED' && typeof result.name === 'string')
      .map(result => (result as Record<string, unknown>).name as string),
  );
  const missingNegativeCases = requiredNegativeCases.filter(name => !rejectedNames.has(name));
  addCheck(
    checks,
    'Proof-vector report includes expected rejected negative cases',
    missingNegativeCases.length === 0,
    'required negative cases rejected',
    `proof-vector report missing rejected negative cases: ${missingNegativeCases.join(', ')}`,
  );
}

function addUnsignedValidationReportChecks(
  checks: TrustlessBurnInstanceRefreshCheck[],
  unsignedTxReportMarkdown: string,
  unsignedTxJsonTarget: string,
): void {
  addCheck(
    checks,
    'Unsigned TX validation report target matches JSON target',
    markdownTableField(unsignedTxReportMarkdown, 'Validated target') === unsignedTxJsonTarget,
    `validated target ${unsignedTxJsonTarget}`,
    `unsigned TX validation report must validate ${unsignedTxJsonTarget}`,
  );
  addCheck(
    checks,
    'Unsigned TX validation report is PASS with zero structural issues',
    markdownTableField(unsignedTxReportMarkdown, 'Result') === 'PASS' &&
      markdownTableField(unsignedTxReportMarkdown, 'Structural issues') === '0',
    'unsigned TX validation report PASS / 0 structural issues',
    'unsigned TX validation report must be PASS with 0 structural issues before exact instance matching',
  );
  addCheck(
    checks,
    'Unsigned TX validation report preserves no-check/no-sign/no-broadcast boundary',
    unsignedTxReportMarkdown.includes('| Transaction-check evidence claimed | no |') &&
      unsignedTxReportMarkdown.includes('| Expected transaction ID evidence claimed | no |') &&
      unsignedTxReportMarkdown.includes('| Signing authorization granted | no |') &&
      unsignedTxReportMarkdown.includes('| Transaction broadcast, submit, deploy, reconcile, or state mutation performed | no |'),
    'unsigned TX validation report records no transaction check, expected tx id, signing, or broadcast',
    'unsigned TX validation report must preserve no-check/no-sign/no-broadcast boundaries',
  );
}

function addUnsignedTxJsonChecks(
  checks: TrustlessBurnInstanceRefreshCheck[],
  mismatches: string[],
  identity: TrustlessBurnInstanceIdentity,
  validation: TrustlessUnsignedTxEvidenceJsonValidation,
): void {
  addCheck(
    checks,
    'Unsigned TX JSON structure validates',
    validation.status === 'PASS' && validation.record !== undefined,
    validation.message,
    `unsigned TX JSON validator must PASS before exact instance matching: ${validation.errors.join('; ')}`,
  );
  if (validation.status !== 'PASS' || !validation.record) return;

  const record = validation.record;
  const exactMismatches = collectUnsignedTxInstanceMismatches(identity, record);
  mismatches.push(...exactMismatches);
  addCheck(
    checks,
    'Unsigned TX JSON settlement identity matches instance',
    exactMismatches.length === 0,
    `unsigned TX JSON claimCount=${record.claimCount}, burnId=${record.claims[0]?.settlementIdentity?.duplicatePreventionKeyHex ?? 'missing'}`,
    exactMismatches.length === 0
      ? 'unsigned TX JSON matches bound instance'
      : 'unsigned TX JSON must be regenerated for the bound instance before this refresh can be READY',
  );
  addCheck(
    checks,
    'Unsigned TX JSON context-extension guard remains source-boundary only',
    record.contextExtensionGuard.status === 'pass' &&
      record.contextExtensionGuard.signingPermitted === false &&
      record.contextExtensionGuard.broadcastPermitted === false,
    'contextExtensionGuard pass with signingPermitted=false and broadcastPermitted=false',
    'unsigned TX JSON contextExtensionGuard must pass while keeping signing and broadcast forbidden',
  );
}

function addContractAcceptanceJsonChecks(
  checks: TrustlessBurnInstanceRefreshCheck[],
  mismatches: string[],
  identity: TrustlessBurnInstanceIdentity,
  target: string | undefined,
  value: unknown,
): void {
  if (!target) return;

  const errors = validateTrustlessBurnContractAcceptanceReportJson(value);
  addCheck(
    checks,
    'Contract-equivalent acceptance JSON validates',
    errors.length === 0,
    `contract-equivalent acceptance target ${target}`,
    `contract-equivalent acceptance JSON must validate before exact instance matching: ${errors.join('; ')}`,
  );
  if (errors.length > 0) return;

  const report = value as TrustlessBurnContractAcceptanceReport;
  addCheck(
    checks,
    'Contract-equivalent acceptance JSON is PASS with zero structural issues',
    report.status === 'PASS' && report.structuralIssues === 0,
    'contract-equivalent acceptance report PASS / 0 structural issues',
    'contract-equivalent acceptance report must be PASS with 0 structural issues before exact instance matching',
  );
  addCheck(
    checks,
    'Contract-equivalent acceptance preserves local-only boundary',
    report.boundary['ErgoScript VM execution performed'] === 'no' &&
      report.boundary['On-chain proof acceptance claimed'] === 'no' &&
      report.boundary['DUP insertion on-chain claimed'] === 'no' &&
      report.boundary['Transaction signing performed or authorized'] === 'no' &&
      report.boundary['Transaction submit or broadcast performed or authorized'] === 'no' &&
      report.boundary['Gate 5 trustless-burn evidence claimed complete'] === 'no',
    'contract-equivalent acceptance remains no-VM/no-chain/no-DUP/no-sign/no-broadcast/no-closure evidence',
    'contract-equivalent acceptance report must preserve local-only no-claim boundaries',
  );

  const exactMismatches = collectContractAcceptanceInstanceMismatches(identity, report);
  mismatches.push(...exactMismatches);
  addCheck(
    checks,
    'Contract-equivalent acceptance identity matches instance',
    exactMismatches.length === 0,
    `contract-equivalent acceptance burnId=${report.identity.burnIdHex}, bridgeEventRoot=${report.identity.bridgeEventRootHex}`,
    exactMismatches.length === 0
      ? 'contract-equivalent acceptance JSON matches bound instance'
      : 'contract-equivalent acceptance JSON must be regenerated for the bound instance before this refresh can be READY',
  );
}

function collectContractAcceptanceInstanceMismatches(
  identity: TrustlessBurnInstanceIdentity,
  report: TrustlessBurnContractAcceptanceReport,
): string[] {
  const mismatches: string[] = [];
  compare(mismatches, 'contractAcceptance.identity.sidechainIdHex', report.identity.sidechainIdHex, identity.sidechainIdHex);
  compare(mismatches, 'contractAcceptance.identity.sidechainTxHashHex', report.identity.sidechainTxHashHex, identity.sidechainTxHashHex);
  compare(mismatches, 'contractAcceptance.identity.sidechainBlockHashHex', report.identity.sidechainBlockHashHex, identity.sidechainBlockHashHex);
  compare(mismatches, 'contractAcceptance.identity.bridgeEventRootHex', report.identity.bridgeEventRootHex, identity.bridgeEventRootHex);
  compare(mismatches, 'contractAcceptance.identity.burnIdHex', report.identity.burnIdHex, identity.burnIdHex);
  compare(
    mismatches,
    'contractAcceptance.identity.duplicatePreventionKeyHex',
    report.identity.duplicatePreventionKeyHex,
    identity.duplicatePreventionKeyHex,
  );
  compare(
    mismatches,
    'contractAcceptance.identity.recipientErgoTreeHashHex',
    report.identity.recipientErgoTreeHashHex,
    identity.recipientErgoTreeHashHex,
  );
  compare(mismatches, 'contractAcceptance.identity.assetIdHex', report.identity.assetIdHex, identity.assetIdHex);
  compare(
    mismatches,
    'contractAcceptance.positiveAcceptance.derived.merkleRootHex',
    report.positiveAcceptance.derived.merkleRootHex,
    identity.bridgeEventRootHex,
  );
  compareString(
    mismatches,
    'contractAcceptance.identity.amountNanoErg',
    report.identity.amountNanoErg,
    identity.amountNanoErg,
  );
  if (report.identity.eventIndex !== identity.eventIndex) {
    mismatches.push(
      `contractAcceptance.identity.eventIndex must match instance eventIndex ${identity.eventIndex}`,
    );
  }
  if (report.identity.ergoAnchorHeight !== identity.ergoAnchorHeight) {
    mismatches.push(
      `contractAcceptance.identity.ergoAnchorHeight must match instance ergoAnchorHeight ${identity.ergoAnchorHeight}`,
    );
  }
  if (report.positiveAcceptance.derived.ergoAnchorHeight !== identity.ergoAnchorHeight) {
    mismatches.push(
      `contractAcceptance.positiveAcceptance.derived.ergoAnchorHeight must match instance ergoAnchorHeight ${identity.ergoAnchorHeight}`,
    );
  }
  if (report.positiveAcceptance.accepted !== true) {
    mismatches.push('contractAcceptance.positiveAcceptance.accepted must be true');
  }
  const requiredNegativeCases = [
    'tracker-event-root-drift',
    'malformed-inclusion-path',
    'stale-ergo-anchor',
    'payout-value-drift',
    'recipient-tree-drift',
    'tracker-key-drift',
    'spent-dup-key',
    'bad-proof-side-byte',
  ];
  const rejectedNames = new Set(
    report.negativeCases
      .filter(test => test.status === 'REJECTED')
      .map(test => test.name),
  );
  for (const name of requiredNegativeCases) {
    if (!rejectedNames.has(name)) {
      mismatches.push(`contractAcceptance.negativeCases must include rejected ${name}`);
    }
  }
  return mismatches;
}

function collectUnsignedTxInstanceMismatches(
  identity: TrustlessBurnInstanceIdentity,
  record: AggregateSettlementTrustlessUnsignedTxEvidenceRecord,
): string[] {
  const mismatches: string[] = [];
  if (record.claimCount !== 1 || record.claims.length !== 1) {
    mismatches.push('unsignedTx.claimCount must be exactly one bound instance claim');
    return mismatches;
  }
  const claim = record.claims[0];
  compare(mismatches, 'unsignedTx.claims[0].legacySidechainTxHash', claim.legacySidechainTxHash, identity.sidechainTxHashHex);
  compare(mismatches, 'unsignedTx.claims[0].trustlessBurnDerivation.sidechainIdHex', claim.trustlessBurnDerivation.sidechainIdHex, identity.sidechainIdHex);
  if (claim.trustlessBurnDerivation.sidechainLogIndex !== identity.eventIndex) {
    mismatches.push(
      `unsignedTx.claims[0].trustlessBurnDerivation.sidechainLogIndex must match instance eventIndex ${identity.eventIndex}`,
    );
  }
  compare(
    mismatches,
    'unsignedTx.claims[0].trustlessBurnDerivation.derivedBurnIdHex',
    claim.trustlessBurnDerivation.derivedBurnIdHex,
    identity.burnIdHex,
  );
  compare(
    mismatches,
    'unsignedTx.claims[0].settlementIdentity.duplicatePreventionKeyHex',
    claim.settlementIdentity.duplicatePreventionKeyHex,
    identity.duplicatePreventionKeyHex,
  );
  compare(
    mismatches,
    'unsignedTx.claims[0].settlementIdentity.bridgeEventRootHex',
    claim.settlementIdentity.bridgeEventRootHex,
    identity.bridgeEventRootHex,
  );
  compare(
    mismatches,
    'unsignedTx.claims[0].settlementIdentity.recipientErgoTreeHashHex',
    claim.settlementIdentity.recipientErgoTreeHashHex,
    identity.recipientErgoTreeHashHex,
  );
  compareString(
    mismatches,
    'unsignedTx.claims[0].settlementIdentity.amountNanoErg',
    claim.settlementIdentity.amountNanoErg,
    identity.amountNanoErg,
  );
  if (
    claim.settlementIdentity.assetIdHex !== undefined &&
    normalizeHex(claim.settlementIdentity.assetIdHex) !== identity.assetIdHex
  ) {
    mismatches.push(
      `unsignedTx.claims[0].settlementIdentity.assetIdHex must match instance assetId ${identity.assetIdHex}`,
    );
  }
  return mismatches;
}

function addCheck(
  checks: TrustlessBurnInstanceRefreshCheck[],
  check: string,
  ok: boolean,
  passDetail: string,
  blockedDetail: string,
): void {
  checks.push({
    check: sanitize(check),
    status: ok ? 'pass' : 'blocked',
    detail: sanitize(ok ? passDetail : blockedDetail),
  });
}

function instanceBindingMarkdownMatches(markdown: string, identity: TrustlessBurnInstanceIdentity): boolean {
  return [
    '# Gate 5 Trustless Burn Instance Binding',
    identity.burnIdHex,
    identity.bridgeEventRootHex,
    identity.duplicatePreventionKeyHex,
    identity.recipientErgoTreeHashHex,
    identity.amountNanoErg,
    identity.proofVectorTarget,
  ].every(value => markdown.includes(value));
}

function candidateMarkdownMatches(markdown: string, identity: TrustlessBurnInstanceIdentity): boolean {
  return [
    '# Gate 5 Trustless Burn SPV-Linked Candidate',
    identity.sidechainIdHex,
    identity.sidechainTxHashHex,
    identity.sidechainBlockHashHex,
    identity.bridgeEventRootHex,
    identity.burnIdHex,
    identity.duplicatePreventionKeyHex,
    identity.recipientErgoTreeHashHex,
    identity.amountNanoErg,
    identity.assetIdHex,
    identity.proofVectorTarget,
  ].every(value => markdown.includes(value));
}

function buildNextEvidence(identity: TrustlessBurnInstanceIdentity, mismatches: string[]): string[] {
  if (mismatches.length > 0) {
    return [
      'Treat the existing unsigned transaction or contract-equivalent acceptance evidence as stale for this instance until every exact binding mismatch is cleared.',
      `Regenerate local trustless unsigned transaction evidence for burnId ${identity.burnIdHex}, bridgeEventRoot ${identity.bridgeEventRootHex}, recipient ${identity.recipientErgoTreeHashHex}, and amountNanoErg ${identity.amountNanoErg}.`,
      'Keep regenerated evidence offline and source-boundary only: no /transactions/check, expected tx id, signing, submit, broadcast, reconciliation, node mutation, or deployment.',
    ];
  }
  return [
    `Use this matched local source-boundary chain for burnId ${identity.burnIdHex} as prerequisite evidence only; it does not close Gate 5.`,
    'Next concrete Gate 5 evidence is a sanitized mined 0x0401 anchor plus SPV tracker/finality observation for the same bridgeEventRoot and Ergo anchor height.',
    'Then capture non-broadcast proof-acceptance and DUP insertion/replay evidence, or record the ContextExtension conformance blocker if live VM/check execution remains blocked.',
  ];
}

function buildBoundary(options: { contractAcceptanceChecked?: boolean } = {}): Record<string, 'yes' | 'no'> {
  return {
    'Refresh/prerequisite output only': 'yes',
    'Instance binding evidence reused': 'yes',
    'Candidate evidence reused': 'yes',
    'Proof-vector report evidence reused': 'yes',
    'Unsigned transaction evidence checked': 'yes',
    'Contract-equivalent acceptance evidence checked': options.contractAcceptanceChecked ? 'yes' : 'no',
    'Secret or environment file read': 'no',
    'Wallet recovery material or private key read': 'no',
    'Node config secret read': 'no',
    'Runtime database opened by refresh command': 'no',
    'Private deployment state opened by refresh command': 'no',
    'Node or RPC request performed by refresh command': 'no',
    'Transaction check performed': 'no',
    'Expected transaction ID claimed': 'no',
    'Transaction signing performed or authorized': 'no',
    'Transaction submit or broadcast performed or authorized': 'no',
    'Settlement reconciliation performed': 'no',
    'Gate 5 trustless-burn evidence claimed complete': 'no',
    'Release gate PASS claimed': 'no',
    'Production-ready claim allowed': 'no',
    'Mainnet-grade evidence linked': 'no',
    'Testnet production-candidate claim authorized by refresh': 'no',
  };
}

function validateIdentity(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('--trustless-burn-instance-refresh-json report.identity must be an object');
    return;
  }
  for (const field of [
    'sidechainIdHex',
    'sidechainTxHashHex',
    'sidechainBlockHashHex',
    'bridgeEventRootHex',
    'burnIdHex',
    'duplicatePreventionKeyHex',
    'recipientErgoTreeHashHex',
    'assetIdHex',
  ]) {
    if (!isHex32(value[field])) {
      errors.push(`--trustless-burn-instance-refresh-json report.identity.${field} must be a 32-byte hex string`);
    }
  }
  if (!isNonNegativeSafeInteger(value.eventIndex)) {
    errors.push('--trustless-burn-instance-refresh-json report.identity.eventIndex must be a non-negative safe integer');
  }
  if (!isNonNegativeSafeInteger(value.ergoAnchorHeight)) {
    errors.push('--trustless-burn-instance-refresh-json report.identity.ergoAnchorHeight must be a non-negative safe integer');
  }
  if (typeof value.amountNanoErg !== 'string' || !/^[1-9][0-9]*$/.test(value.amountNanoErg)) {
    errors.push('--trustless-burn-instance-refresh-json report.identity.amountNanoErg must be a positive decimal string');
  }
  if (typeof value.proofVectorTarget !== 'string' || !value.proofVectorTarget.trim().endsWith('.json')) {
    errors.push('--trustless-burn-instance-refresh-json report.identity.proofVectorTarget must be a JSON target string');
  }
  if (
    typeof value.burnIdHex === 'string' &&
    typeof value.duplicatePreventionKeyHex === 'string' &&
    value.burnIdHex !== value.duplicatePreventionKeyHex
  ) {
    errors.push('--trustless-burn-instance-refresh-json report.identity.duplicatePreventionKeyHex must equal burnIdHex');
  }
}

function validateChecks(value: unknown, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push('--trustless-burn-instance-refresh-json report.checks must be a non-empty array');
    return;
  }
  value.forEach((check, index) => {
    if (!isRecord(check)) {
      errors.push(`--trustless-burn-instance-refresh-json report.checks[${index}] must be an object`);
      return;
    }
    if (typeof check.check !== 'string' || check.check.trim().length === 0) {
      errors.push(`--trustless-burn-instance-refresh-json report.checks[${index}].check must be a non-empty string`);
    }
    if (check.status !== 'pass' && check.status !== 'blocked') {
      errors.push(`--trustless-burn-instance-refresh-json report.checks[${index}].status must be pass or blocked`);
    }
    if (typeof check.detail !== 'string' || check.detail.trim().length === 0) {
      errors.push(`--trustless-burn-instance-refresh-json report.checks[${index}].detail must be a non-empty string`);
    }
  });
}

function validateStringArray(
  value: unknown,
  field: string,
  errors: string[],
  options: { allowEmpty?: boolean } = {},
): void {
  if (
    !Array.isArray(value) ||
    (!options.allowEmpty && value.length === 0) ||
    value.some(entry => typeof entry !== 'string' || entry.trim().length === 0)
  ) {
    errors.push(`--trustless-burn-instance-refresh-json report.${field} must be a${options.allowEmpty ? '' : ' non-empty'} string array`);
  }
}

function validateBoundary(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('--trustless-burn-instance-refresh-json report.boundary must be an object');
    return;
  }
  if (
    value['Contract-equivalent acceptance evidence checked'] !== 'yes' &&
    value['Contract-equivalent acceptance evidence checked'] !== 'no'
  ) {
    errors.push('--trustless-burn-instance-refresh-json report.boundary.Contract-equivalent acceptance evidence checked must be yes or no');
  }
  const expected = buildBoundary({
    contractAcceptanceChecked: value['Contract-equivalent acceptance evidence checked'] === 'yes',
  });
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (value[field] !== expectedValue) {
      errors.push(`--trustless-burn-instance-refresh-json report.boundary.${field} must be ${expectedValue}`);
    }
  }
}

function compare(mismatches: string[], field: string, actual: unknown, expected: string): void {
  if (normalizeHex(actual) !== expected) {
    mismatches.push(`${field} must match instance ${expected}`);
  }
}

function compareString(mismatches: string[], field: string, actual: unknown, expected: string): void {
  if (actual !== expected) {
    mismatches.push(`${field} must match instance ${expected}`);
  }
}

function markdownTableField(markdown: string, field: string): string | undefined {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`^\\|\\s*${escaped}\\s*\\|\\s*([^|]+?)\\s*\\|`, 'im'));
  return match ? stripInlineCode(match[1].trim()) : undefined;
}

function stripInlineCode(value: string): string {
  return value.replace(/^`/, '').replace(/`$/, '');
}

function markdownTable(rows: string[][]): string {
  const [header, ...body] = rows;
  return [
    markdownTableRow(header),
    markdownTableRow(header.map(() => '---')),
    ...body.map(markdownTableRow),
  ].join('\n');
}

function markdownTableRow(cells: string[]): string {
  return `| ${cells.map(escapeMarkdownTableCell).join(' | ')} |`;
}

function escapeMarkdownTableCell(value: string): string {
  return escapeMarkdownText(value).replace(/\|/g, '\\|');
}

function escapeMarkdownText(value: string): string {
  return sanitize(value).replace(/\r?\n/g, '<br>');
}

function normalizeTarget(value: string): string {
  return value.trim().replace(/\\/g, '/');
}

function normalizeHex(value: unknown): string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value) ? value.toLowerCase() : '';
}

function sanitize(value: string): string {
  return sanitizeReportText(value).trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHex32(value: unknown): boolean {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

function isNonNegativeSafeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function findLocalPathLeak(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return /\b[A-Za-z]:[\\/]/.test(value) || /file:\/\/\//i.test(value) || /\\\\[^\\]/.test(value)
      ? value
      : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const leaked = findLocalPathLeak(item);
      if (leaked) return leaked;
    }
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      const leaked = findLocalPathLeak(item);
      if (leaked) return leaked;
    }
  }
  return undefined;
}
