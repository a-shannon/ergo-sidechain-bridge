import { basename } from 'path';

import {
  hasStructuredValidationFailureMarker,
  hasUnresolvedIssueMarker,
  normalizeEvidenceMarkerText,
  validateEvidenceHygiene,
} from './evidence-hygiene.js';
import { validateDuplicateRequiredFields } from './evidence-required-names.js';
import { validateGitCommitField } from './evidence-git.js';
import { isIsoCalendarDate } from './evidence-date.js';
import {
  evidenceTargetInspectionVariants,
  hasEvidenceLocalOnlyInspectionReference,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from './evidence-sensitive-target.js';
import {
  formatAggregateSettlementEvidenceJsonPathLabel,
  validateAggregateSettlementEvidenceJsonPath,
  validateAggregateSettlementPrebroadcastEvidenceRecord,
} from './aggregate-settlement-evidence.js';
import type {
  AggregateSettlementPrebroadcastEvidenceRecord,
} from './aggregate-settlement-evidence.js';
import {
  extractBridgeEventRootHexes,
  sameOrderedBridgeEventRoots,
} from './bridge-event-root-evidence.js';
import { classifyPublicationClaimText } from './publication-claim-boundary.js';

export interface TestnetPreBroadcastValidation {
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  message: string;
}

export interface LinkedAggregateSettlementEvidenceJsonRecord {
  target: string;
  record?: unknown;
  readError?: string;
}

export interface TestnetPreBroadcastValidationOptions {
  linkedAggregateSettlementEvidenceJsonRecords?: LinkedAggregateSettlementEvidenceJsonRecord[];
}

const blockedAggregateEvidenceJsonTargetLabel = '<blocked evidence JSON target>';

const REQUIRED_SECTIONS = [
  '## Scope Statement',
  '## Required Command Artifacts',
  '## Dry-Run Settlement Shape',
  '## Non-Broadcast Attestation',
  '## Lifecycle Linkage Guidance',
  '## Publication Control',
  '## Reviewer Sign-Off',
];

const REQUIRED_SCOPE_FIELDS = [
  'Evidence package name',
  'Date',
  'Operator',
  'Reviewer',
  'Git commit',
  'Environment',
  'Ergo node network',
  'Sidechain network',
  'Broadcast mode at start',
  'Broadcast mode at end',
  'Gate 3 closure claimed',
  'Testnet production-candidate claim allowed',
  'Mainnet production-ready claim allowed',
];

const REQUIRED_COMMAND_ARTIFACT_FIELDS = [
  '`npm run check` artifact',
  '`npm run wasm:test` artifact',
  '`npm run demo:readiness` artifact',
  '`npm run status` artifact',
  'ContextExtension guard result',
  'Broadcast policy result',
  'Clean deployment state evidence',
  'Current Ergo height',
  'Current sidechain height',
];

const REQUIRED_DRY_RUN_FIELDS = [
  'Peg-in event ID or TX ID',
  'Peg-out burn TX ID',
  'Sidechain block height',
  'Sidechain block hash',
  'Bridge event root',
  'Ergo anchor height',
  'Aggregate claim count',
  'Input count',
  'Output count',
  'ContextExtension key counts per input',
  '`/transactions/check` result',
  'Expected transaction ID',
  'Daemon approval preparation',
];

const REQUIRED_NON_BROADCAST_FIELDS = [
  '`BRIDGE_BROADCAST_ENABLED` state at start',
  '`BRIDGE_BROADCAST_ENABLED` state at end',
  'Live broadcast approval recorded',
  'Submit command attempted',
  'Mempool transaction observed',
  'Local DUP confirmed-history mutation performed',
  'Local SPV/AVL confirmed-history mutation performed',
  'Runtime state files staged',
];

const REQUIRED_PUBLICATION_FIELDS = [
  'Release notes updated for this dry-run package',
  'Pending Evidence Register updated for this dry-run package',
  'Gate 3 checklist row closed by this package',
  'Production-ready claim allowed by this package',
  'Testnet production-candidate claim allowed by this package',
];

const REQUIRED_SIGNOFF_FIELDS = [
  'Classification',
  'Stop conditions discovered',
  'Follow-up live rehearsal required',
  'Follow-up recovery drill required',
  'Reviewer',
  'Date',
];

const HEX_32_BYTE_PATTERN = /(?:^|[^0-9a-fA-F])(?:0x)?([0-9a-fA-F]{64})(?![0-9a-fA-F])/g;
const HEX_32_BYTE_VALUE_PATTERN = '(?:0x)?[0-9a-fA-F]{64}';
const EXACT_CONTEXT_EXTENSION_COUNTS_PATTERN = /^\s*\d+(?:\s*,\s*\d+)*\s*$/;
const DEPLOYMENT_STATE_HASH_VALUE_PATTERN = new RegExp(
  `deployment[- ]state (?:hash|digest)\\s*(?:=|:|is)\\s*${HEX_32_BYTE_VALUE_PATTERN}\\b`,
  'i',
);
const CONTRACT_IDS_VALUE_PATTERN = new RegExp(
  `contract IDs?\\s*(?:=|:|include|includes)\\s*${HEX_32_BYTE_VALUE_PATTERN}\\b`,
  'i',
);
const SINGLETON_INVENTORY_VALUE_PATTERN = new RegExp(
  `singleton inventory\\s*(?:=|:|include|includes)\\s*${HEX_32_BYTE_VALUE_PATTERN}\\b`,
  'i',
);
const ALLOWED_CLASSIFICATIONS = new Set(['pass', 'fail', 'inconclusive']);
const LIFECYCLE_LINKAGE_ITEMS = [
  { term: /\bFresh testnet lifecycle\b/i, label: 'Fresh testnet lifecycle' },
  { term: /\bSettlement submit evidence\b/i, label: 'Settlement submit evidence' },
  { term: /\bConfirmation evidence\b/i, label: 'Confirmation evidence' },
  { term: /\bReconciliation evidence\b/i, label: 'Reconciliation evidence' },
] as const;
const LIFECYCLE_BLOCKER_STATUS_PATTERN = /\b(blockers?|blocked|unchecked|pending)\b/i;
const LIFECYCLE_COMPLETED_STATUS_PATTERN =
  /\b(?:pass(?:ed|es)?|complete(?:d)?|checked|satisfied|linked|resolved|closed)\b/i;
const SIDECHAIN_NETWORK_SCOPE_ERROR =
  'Scope Statement: Sidechain network must identify patched-devnet, testnet, or an explicit non-mainnet sidechain network';
const CLAIM_BOUNDARY_FIELDS = [
  'Gate 3 closure claimed',
  'Testnet production-candidate claim allowed',
  'Mainnet production-ready claim allowed',
  'Gate 3 checklist row closed by this package',
  'Production-ready claim allowed by this package',
  'Testnet production-candidate claim allowed by this package',
] as const;
const AGGREGATE_SETTLEMENT_JSON_LINK_FIELDS = [
  '`/transactions/check` result',
  'Expected transaction ID',
] as const;
const BROADCAST_ENABLED_INDICATOR_PATTERN =
  /\b(?:BRIDGE_BROADCAST_ENABLED\s*(?:=|:|is)\s*true|broadcast\s+(?:enabled|approved|allowed|certified|endorsed|recommended|accredited)|(?:certif(?:y|ied|ies)|endorse(?:d|s)?|recommend(?:ed|s)?|accredit(?:ed|s)?)\s+(?:live\s+)?broadcast(?:\s+approval)?|live broadcast approval\s+(?:recorded\s*)?(?:yes|approved|certified|endorsed|recommended|accredited)|submit command attempted\s*:\s*yes|mempool transaction observed\s*:\s*yes)\b/i;
const NON_BROADCAST_ATTESTATION_CONTRADICTION_PATTERN =
  /\bBRIDGE_BROADCAST_ENABLED\s*(?:=|:|is)\s*true\b|\b(?:certif(?:y|ied|ies)|endorse(?:d|s)?|recommend(?:ed|s)?|accredit(?:ed|s)?)\s+(?:live\s+)?broadcast(?:\s+approval)?\b|\blive\s+broadcast\s+approval(?:\s+recorded)?\s*(?:=|:|is)?\s*(?:yes|approved|certified|endorsed|recommended|accredited)\b|\bsubmit\s+command\s+attempted\s*(?:=|:|is)?\s*yes\b|\bmempool\s+transaction\s+observed\s*(?:=|:|is)?\s*yes\b|\blocal\s+(?:DUP\s+confirmed-history|SPV\/AVL\s+confirmed-history)\s+mutation\s+performed\s*(?:=|:|is)?\s*yes\b|\bruntime\s+state\s+files\s+staged\s*(?:=|:|is)?\s*yes\b/i;
const TESTNET_PRODUCTION_CANDIDATE_READINESS_PATTERN =
  /\b(?:(?:testnet\s+production[- ]candidate|production[- ]grade\s+testnet|production[- ]candidate)\b[^\r\n.]{0,80}\b(?:ready|readiness|eligible|cleared|validated)|(?:ready|readiness|eligible|cleared|validated)\b[^\r\n.]{0,80}\b(?:testnet\s+production[- ]candidate|production[- ]grade\s+testnet|production[- ]candidate))\b/i;
const FORBIDDEN_PREBROADCAST_COMMAND_SURFACE_PATTERNS = [
  /\bnpm(?:\.cmd)?\s+run\s+e2e:aggregate\s+--\s+(?:trigger|run|submit|confirm)\b/gi,
  /\bnpm(?:\.cmd)?\s+run\s+settle:aggregate\s+--\s+(?:submit|confirm)(?:-with-ingest|-anchored|-batch)?\b/gi,
  /\bnpm(?:\.cmd)?\s+run\s+deploy(?::aggregate|:sidechain)?\b/gi,
  /\bnpm(?:\.cmd)?\s+run\s+test:roundtrip\b/gi,
  /\b(?:npx\s+)?tsx(?:\.cmd)?\s+src[\\/]+scripts[\\/]+e2e-aggregate-settlement\.ts\s+(?:trigger|run|submit|confirm)\b/gi,
  /\b(?:npx\s+)?tsx(?:\.cmd)?\s+src[\\/]+scripts[\\/]+aggregate-settlement\.ts\s+(?:submit|confirm)(?:-with-ingest|-anchored|-batch)?\b/gi,
  /\b(?:npx\s+)?tsx(?:\.cmd)?\s+src[\\/]+scripts[\\/]+(?:deploy|deploy-aggregate|deploy-sidechain|test-roundtrip)\.ts\b/gi,
  /\b(?:deploy-sidechain|trigger-peg-out|e2e-pegout-test|test-roundtrip)\.ts\b/gi,
  /\bspike5-frontier-pegout-extraction\.ts\b/gi,
] as const;
const PREBROADCAST_VALIDATION_TARGET_BINDING =
  /\b(?:validated target|validated input|pre[- ]?broadcast validate target|pre[- ]?broadcast validation target|testnet pre[- ]?broadcast validate target|testnet pre[- ]?broadcast validation target)\b/i;

export function validateTestnetPreBroadcastEvidence(
  markdown: string,
  options: TestnetPreBroadcastValidationOptions = {},
): TestnetPreBroadcastValidation {
  const errors = [
    ...validateEvidenceHygiene(markdown, 'Testnet Pre-Broadcast Evidence'),
    ...validateRequiredSections(markdown),
    ...validateDocumentWidePreBroadcastSafety(markdown),
    ...validateClaimBoundaries(markdown),
    ...validateScope(markdown),
    ...validateCommandArtifacts(markdown),
    ...validateDryRunSettlementShape(markdown),
    ...validateNonBroadcastAttestation(markdown),
    ...validateLifecycleLinkageGuidance(markdown),
    ...validatePublicationControl(markdown),
    ...validateReviewerSignoff(markdown),
    ...validateLinkedAggregateSettlementEvidenceJsonRecords(
      markdown,
      options.linkedAggregateSettlementEvidenceJsonRecords,
    ),
  ];

  return {
    status: errors.length === 0 ? 'PASS' : 'BLOCKED',
    errors,
    message: errors.length === 0
      ? 'Testnet pre-broadcast dry-run evidence PASS: preparation package is structured and non-broadcast.'
      : `Testnet pre-broadcast dry-run evidence BLOCKED: ${errors.length} structural issue(s).`,
  };
}

export function findLocalAggregateSettlementEvidenceJsonTargets(markdown: string): string[] {
  return findAggregateSettlementEvidenceJsonTargets(markdown).filter(isSafeLocalRelativeJsonTarget);
}

function findAggregateSettlementEvidenceJsonTargets(markdown: string): string[] {
  const section = sectionBetween(markdown, '## Dry-Run Settlement Shape', '## Non-Broadcast Attestation');
  const fields = parseListFields(section, REQUIRED_DRY_RUN_FIELDS);
  const targets = new Set<string>();

  for (const field of AGGREGATE_SETTLEMENT_JSON_LINK_FIELDS) {
    const value = fields.get(field) ?? '';
    for (const target of extractJsonMarkdownLinkTargets(value)) {
      targets.add(target);
    }
  }

  return [...targets];
}

function validateRequiredSections(markdown: string): string[] {
  return REQUIRED_SECTIONS
    .filter(section => !markdown.includes(section))
    .map(section => `Missing required section: ${section}`);
}

function validateDocumentWidePreBroadcastSafety(markdown: string): string[] {
  const errors: string[] = [];
  validateNoForbiddenPreBroadcastCommandSurfaces(errors, 'Testnet Pre-Broadcast Evidence', 'document', markdown);
  validateNoBroadcastPositiveMarkers(errors, 'Testnet Pre-Broadcast Evidence', 'document', markdown);
  validateNoTestnetProductionCandidateReadiness(errors, 'Testnet Pre-Broadcast Evidence', 'document', markdown);
  return errors;
}

function validateScope(markdown: string): string[] {
  const section = sectionBetween(markdown, '## Scope Statement', '## Required Command Artifacts');
  const fields = parseListFields(section, REQUIRED_SCOPE_FIELDS);
  const errors = validateRequiredListFields('Scope Statement', section, fields, REQUIRED_SCOPE_FIELDS);

  validateIsoDate(errors, fields, 'Scope Statement', 'Date');
  validateGitCommitField(errors, fields, 'Scope Statement', 'Git commit');
  validateExactValue(errors, fields, 'Scope Statement', 'Environment', 'testnet');
  validatePositiveTestnetNetwork(errors, fields.get('Ergo node network') ?? '');
  validateSidechainNetwork(errors, fields.get('Sidechain network') ?? '');
  validateExactValue(errors, fields, 'Scope Statement', 'Broadcast mode at start', 'disabled');
  validateExactValue(errors, fields, 'Scope Statement', 'Broadcast mode at end', 'disabled');
  validateExactValue(errors, fields, 'Scope Statement', 'Gate 3 closure claimed', 'no');
  validateExactValue(errors, fields, 'Scope Statement', 'Testnet production-candidate claim allowed', 'no');
  validateExactValue(errors, fields, 'Scope Statement', 'Mainnet production-ready claim allowed', 'no');

  return errors;
}

function validateCommandArtifacts(markdown: string): string[] {
  const section = sectionBetween(markdown, '## Required Command Artifacts', '## Dry-Run Settlement Shape');
  const fields = parseListFields(section, REQUIRED_COMMAND_ARTIFACT_FIELDS);
  const errors = validateRequiredListFields('Required Command Artifacts', section, fields, REQUIRED_COMMAND_ARTIFACT_FIELDS);

  for (const field of REQUIRED_COMMAND_ARTIFACT_FIELDS) {
    const value = fields.get(field) ?? '';
    validateCompletedEvidenceTarget(errors, 'Required Command Artifacts', field, value);
    validateNoForbiddenPreBroadcastCommandSurfaces(errors, 'Required Command Artifacts', field, value);
    validateNoBroadcastPositiveMarkers(errors, 'Required Command Artifacts', field, value);
  }

  const contextExtensionGuard = fields.get('ContextExtension guard result') ?? '';
  if (!isBlank(contextExtensionGuard)) {
    if (!/\bContextExtension\b/i.test(contextExtensionGuard) || !/\bguard\b/i.test(contextExtensionGuard)) {
      errors.push('Required Command Artifacts: ContextExtension guard result must identify the ContextExtension guard');
    }
    if (!/\bsigma[- ]?rust\b/i.test(contextExtensionGuard) || !/\bJVM\b/i.test(contextExtensionGuard)) {
      errors.push('Required Command Artifacts: ContextExtension guard result must cite sigma-rust/JVM conformance coverage');
    }
    if (!/\bfail[- ]closed\b/i.test(contextExtensionGuard)) {
      errors.push('Required Command Artifacts: ContextExtension guard result must cite fail-closed behavior');
    }
  }

  const broadcastPolicy = fields.get('Broadcast policy result') ?? '';
  if (!isBlank(broadcastPolicy) && !/\bbroadcast policy\b/i.test(broadcastPolicy)) {
    errors.push('Required Command Artifacts: Broadcast policy result must identify broadcast policy output');
  }
  if (
    !isBlank(broadcastPolicy) &&
    !/(\bbroadcast\b.{0,80}\b(disabled|refus(?:ed|ing)|blocked)\b|\bBRIDGE_BROADCAST_ENABLED\b\s*(?:=|:|is)\s*(?:false|unset)\b|\brefusing to broadcast\b)/i.test(broadcastPolicy)
  ) {
    errors.push(
      'Required Command Artifacts: Broadcast policy result must prove broadcast is disabled or refused for this dry-run package',
    );
  }
  if (!isBlank(broadcastPolicy) && BROADCAST_ENABLED_INDICATOR_PATTERN.test(broadcastPolicy)) {
    errors.push(
      'Required Command Artifacts: Broadcast policy result must not include enabled or approved broadcast indicators',
    );
  }

  const cleanDeploymentState = fields.get('Clean deployment state evidence') ?? '';
  if (!isBlank(cleanDeploymentState)) {
    if (!/clean deployment state/i.test(cleanDeploymentState)) {
      errors.push('Required Command Artifacts: Clean deployment state evidence must mention clean deployment state');
    }
    if (!DEPLOYMENT_STATE_HASH_VALUE_PATTERN.test(cleanDeploymentState)) {
      errors.push('Required Command Artifacts: Clean deployment state evidence must include a concrete 32-byte deployment-state hash or digest');
    }
    if (!CONTRACT_IDS_VALUE_PATTERN.test(cleanDeploymentState)) {
      errors.push('Required Command Artifacts: Clean deployment state evidence must include at least one concrete 32-byte contract ID');
    }
    if (!SINGLETON_INVENTORY_VALUE_PATTERN.test(cleanDeploymentState)) {
      errors.push('Required Command Artifacts: Clean deployment state evidence must include at least one concrete 32-byte singleton inventory identifier');
    }
  }
  for (const field of ['Current Ergo height', 'Current sidechain height']) {
    validateEvidenceBoundNonNegativeInteger(errors, 'Required Command Artifacts', field, fields.get(field) ?? '');
  }

  return errors;
}

function validateDryRunSettlementShape(markdown: string): string[] {
  const commandSection = sectionBetween(markdown, '## Required Command Artifacts', '## Dry-Run Settlement Shape');
  const commandFields = parseListFields(commandSection, REQUIRED_COMMAND_ARTIFACT_FIELDS);
  const section = sectionBetween(markdown, '## Dry-Run Settlement Shape', '## Non-Broadcast Attestation');
  const fields = parseListFields(section, REQUIRED_DRY_RUN_FIELDS);
  const errors = validateRequiredListFields('Dry-Run Settlement Shape', section, fields, REQUIRED_DRY_RUN_FIELDS);
  const aggregateClaimCount = parseNonNegativeInteger(fields.get('Aggregate claim count') ?? '');

  for (const field of [
    'Peg-in event ID or TX ID',
    'Peg-out burn TX ID',
    'Sidechain block hash',
    'Bridge event root',
    '`/transactions/check` result',
    'Expected transaction ID',
  ]) {
    const value = fields.get(field) ?? '';
    validateCompletedEvidenceTarget(errors, 'Dry-Run Settlement Shape', field, value);
    validateNoForbiddenPreBroadcastCommandSurfaces(errors, 'Dry-Run Settlement Shape', field, value);
    validateNoBroadcastPositiveMarkers(errors, 'Dry-Run Settlement Shape', field, value);
  }

  validateExactlyOneHex32(errors, 'Dry-Run Settlement Shape', 'Peg-out burn TX ID', fields.get('Peg-out burn TX ID') ?? '');
  validateExactlyOneHex32(errors, 'Dry-Run Settlement Shape', 'Peg-in event ID or TX ID', fields.get('Peg-in event ID or TX ID') ?? '');
  validateExactlyOneHex32(errors, 'Dry-Run Settlement Shape', 'Sidechain block hash', fields.get('Sidechain block hash') ?? '');
  validateExactlyOneHex32(errors, 'Dry-Run Settlement Shape', 'Bridge event root', fields.get('Bridge event root') ?? '');
  validateExactlyOneHex32(errors, 'Dry-Run Settlement Shape', 'Expected transaction ID', fields.get('Expected transaction ID') ?? '');
  validateBatchBridgeEventRoots(errors, fields, aggregateClaimCount);
  validateDistinctDryRunIdentifiers(errors, fields);

  for (const field of [
    'Sidechain block height',
    'Ergo anchor height',
    'Aggregate claim count',
    'Input count',
    'Output count',
  ]) {
    const value = fields.get(field) ?? '';
    validateNonNegativeInteger(errors, 'Dry-Run Settlement Shape', field, value);
    validateNoForbiddenPreBroadcastCommandSurfaces(errors, 'Dry-Run Settlement Shape', field, value);
    validateNoBroadcastPositiveMarkers(errors, 'Dry-Run Settlement Shape', field, value);
  }
  validateNoForbiddenPreBroadcastCommandSurfaces(
    errors,
    'Dry-Run Settlement Shape',
    'ContextExtension key counts per input',
    fields.get('ContextExtension key counts per input') ?? '',
  );
  validateNoBroadcastPositiveMarkers(
    errors,
    'Dry-Run Settlement Shape',
    'ContextExtension key counts per input',
    fields.get('ContextExtension key counts per input') ?? '',
  );
  for (const field of ['Aggregate claim count', 'Input count', 'Output count']) {
    const parsed = parseNonNegativeInteger(fields.get(field) ?? '');
    if (parsed !== undefined && parsed <= 0) {
      errors.push(`Dry-Run Settlement Shape: ${field} must be greater than 0`);
    }
  }

  const keyCounts = fields.get('ContextExtension key counts per input') ?? '';
  if (!isBlank(keyCounts) && !/^\s*\d+(?:\s*,\s*\d+)*\s*$/.test(keyCounts)) {
    errors.push('Dry-Run Settlement Shape: ContextExtension key counts per input must be comma-separated non-negative integers');
  } else if (hasUnsafeIntegerCsvEntry(keyCounts)) {
    errors.push('Dry-Run Settlement Shape: ContextExtension key counts per input must contain safe integers');
  }
  const inputCount = parseNonNegativeInteger(fields.get('Input count') ?? '');
  if (inputCount !== undefined && /^\s*\d+(?:\s*,\s*\d+)*\s*$/.test(keyCounts)) {
    const entries = keyCounts.split(',').map(entry => entry.trim()).filter(Boolean);
    if (entries.length !== inputCount) {
      errors.push('Dry-Run Settlement Shape: ContextExtension key counts per input must have one entry per input');
    }
  }
  const currentErgoHeight = parseEvidenceBoundNonNegativeInteger(commandFields.get('Current Ergo height') ?? '');
  const currentSidechainHeight = parseEvidenceBoundNonNegativeInteger(commandFields.get('Current sidechain height') ?? '');
  const ergoAnchorHeight = parseNonNegativeInteger(fields.get('Ergo anchor height') ?? '');
  const sidechainBlockHeight = parseNonNegativeInteger(fields.get('Sidechain block height') ?? '');
  if (
    sidechainBlockHeight !== undefined &&
    currentSidechainHeight !== undefined &&
    sidechainBlockHeight > currentSidechainHeight
  ) {
    errors.push('Dry-Run Settlement Shape: Sidechain block height must not exceed Current sidechain height');
  }
  if (ergoAnchorHeight !== undefined && currentErgoHeight !== undefined && ergoAnchorHeight > currentErgoHeight) {
    errors.push('Dry-Run Settlement Shape: Ergo anchor height must not exceed Current Ergo height');
  }

  const transactionCheck = fields.get('`/transactions/check` result') ?? '';
  if (!isBlank(transactionCheck)) {
    if (!/\bPASS\b/i.test(transactionCheck)) {
      errors.push('Dry-Run Settlement Shape: `/transactions/check` result must contain PASS');
    } else if (hasContradictoryValidationFailureMarker(transactionCheck)) {
      errors.push('Dry-Run Settlement Shape: `/transactions/check` result must contain internally positive PASS evidence');
    }
  }
  validateDaemonApprovalPreparation(errors, fields);

  return errors;
}

function validateDistinctDryRunIdentifiers(
  errors: string[],
  fields: Map<string, string>,
): void {
  const identifierFields = [
    'Peg-in event ID or TX ID',
    'Peg-out burn TX ID',
    'Sidechain block hash',
    'Expected transaction ID',
  ] as const;
  const bridgeEventRoots = extractBridgeEventRootHexes(fields.get('Bridge event roots') ?? '');
  const bridgeEventRoot = extractSingleHex32(fields.get('Bridge event root') ?? '');
  const identifiers = [
    ...identifierFields
      .map(field => extractSingleHex32(fields.get(field) ?? ''))
      .filter(identifier => identifier !== undefined),
    ...(bridgeEventRoots.length > 0 ? bridgeEventRoots : bridgeEventRoot === undefined ? [] : [bridgeEventRoot]),
  ];

  if (new Set(identifiers).size !== identifiers.length) {
    errors.push(
      'Dry-Run Settlement Shape: dry-run 32-byte identifiers must be distinct across Peg-in event ID or TX ID, Peg-out burn TX ID, Sidechain block hash, Bridge event root, and Expected transaction ID',
    );
  }
}

function validateBatchBridgeEventRoots(
  errors: string[],
  fields: Map<string, string>,
  aggregateClaimCount: number | undefined,
): void {
  if (aggregateClaimCount === undefined || aggregateClaimCount <= 1) return;

  const value = fields.get('Bridge event roots') ?? '';
  validateCompletedEvidenceTarget(errors, 'Dry-Run Settlement Shape', 'Bridge event roots', value);
  validateNoForbiddenPreBroadcastCommandSurfaces(errors, 'Dry-Run Settlement Shape', 'Bridge event roots', value);
  validateNoBroadcastPositiveMarkers(errors, 'Dry-Run Settlement Shape', 'Bridge event roots', value);

  if (isBlank(value)) {
    errors.push('Dry-Run Settlement Shape: Bridge event roots are required for batch dry-run evidence');
    return;
  }

  const roots = extractBridgeEventRootHexes(value);
  if (roots.length !== aggregateClaimCount) {
    errors.push('Dry-Run Settlement Shape: Bridge event roots must include one ordered 32-byte hex root per aggregate claim');
    return;
  }

  const firstRoot = extractSingleHex32(fields.get('Bridge event root') ?? '');
  if (firstRoot !== undefined && roots[0] !== firstRoot) {
    errors.push('Dry-Run Settlement Shape: Bridge event root must match the first ordered Bridge event roots value');
  }
}

function validateDaemonApprovalPreparation(
  errors: string[],
  fields: Map<string, string>,
): void {
  const approval = fields.get('Daemon approval preparation') ?? '';
  if (isBlank(approval)) return;

  validateCompletedEvidenceTarget(errors, 'Dry-Run Settlement Shape', 'Daemon approval preparation', approval);
  validateNoForbiddenPreBroadcastCommandSurfaces(errors, 'Dry-Run Settlement Shape', 'Daemon approval preparation', approval);
  validateNoBroadcastPositiveMarkers(errors, 'Dry-Run Settlement Shape', 'Daemon approval preparation', approval);

  if (/\bN\/A\b/i.test(approval)) {
    if (/\bexplicit CLI submit workflow\b/i.test(approval) || /\bdaemon submit not planned\b/i.test(approval)) {
      return;
    }
    errors.push(
      'Dry-Run Settlement Shape: Daemon approval preparation N/A must identify explicit CLI submit workflow or daemon submit not planned',
    );
    return;
  }

  const expectedTxId = extractSingleHex32(fields.get('Expected transaction ID') ?? '');
  const pegOutBurnTxId = extractSingleHex32(fields.get('Peg-out burn TX ID') ?? '');

  if (!/\b(?:version\s*2|v2)\b/i.test(approval)) {
    errors.push('Dry-Run Settlement Shape: Daemon approval preparation must cite approval file version 2');
  }
  if (!/\b(?:runtime\s+context|context\s+binding|runtime\s+binding)\b/i.test(approval)) {
    errors.push('Dry-Run Settlement Shape: Daemon approval preparation must cite runtime context binding');
  }
  if (!/\bergoNodeUrl\b/i.test(approval) || !/\bsidechainRpcUrl\b/i.test(approval) || !/\bsidechainWsUrl\b/i.test(approval)) {
    errors.push('Dry-Run Settlement Shape: Daemon approval preparation must cite bound node and sidechain URLs');
  }
  if (!/\bdeployedStateHash\b/i.test(approval)) {
    errors.push('Dry-Run Settlement Shape: Daemon approval preparation must cite deployedStateHash');
  }
  if (!/\bmode\b.{0,32}\b(single|single-with-ingest|batch)\b/i.test(approval)) {
    errors.push('Dry-Run Settlement Shape: Daemon approval preparation must cite mode single, single-with-ingest, or batch');
  }
  if (!/\b(?:active\s+approval\s+window|approvedAt\b.{0,80}\bexpiresAt\b)\b/i.test(approval)) {
    errors.push('Dry-Run Settlement Shape: Daemon approval preparation must cite active approval window');
  }
  if (!/\bnon-mainnet\b/i.test(approval)) {
    errors.push('Dry-Run Settlement Shape: Daemon approval preparation must cite non-mainnet networks');
  }
  if (!/\bnpm(?:\.cmd)?\s+run\s+settle:aggregate\s+--\s+check(?:-with-ingest|-anchored|-batch)?\b/i.test(approval)) {
    errors.push('Dry-Run Settlement Shape: Daemon approval preparation must cite non-broadcast aggregate check command');
  }
  const citesCheckEvidence = /\bcheckEvidence\b/i.test(approval);
  const citesTransactionsCheckPass = /\/transactions\/check\b.{0,80}\bPASS\b/i.test(approval);
  if (!citesCheckEvidence && !citesTransactionsCheckPass) {
    errors.push('Dry-Run Settlement Shape: Daemon approval preparation must cite checkEvidence or /transactions/check PASS evidence');
  } else if (hasContradictoryValidationFailureMarker(approval)) {
    errors.push(
      'Dry-Run Settlement Shape: Daemon approval preparation checkEvidence or /transactions/check PASS evidence must be internally positive',
    );
  }
  if (!hasCompletedApprovalEvidenceTargetMarker(approval)) {
    errors.push('Dry-Run Settlement Shape: Daemon approval preparation must cite completed approval evidence target');
  }
  if (expectedTxId !== undefined && !containsCaseInsensitive(approval, expectedTxId)) {
    errors.push('Dry-Run Settlement Shape: Daemon approval preparation must cite Expected transaction ID');
  }
  if (pegOutBurnTxId !== undefined && !containsCaseInsensitive(approval, pegOutBurnTxId)) {
    errors.push('Dry-Run Settlement Shape: Daemon approval preparation must cite peg-out burn TX ID or ordered batch burn set');
  }
  if (/\bbatch\b/i.test(approval) && !/\bordered\b.{0,40}\bburn\b/i.test(approval)) {
    errors.push('Dry-Run Settlement Shape: Daemon approval preparation for batch mode must cite ordered batch burn set');
  }
  if (/\bmode\b.{0,32}\bbatch\b/i.test(approval) && !/\bnpm(?:\.cmd)?\s+run\s+settle:aggregate\s+--\s+check-batch\b/i.test(approval)) {
    errors.push('Dry-Run Settlement Shape: Daemon approval preparation for batch mode must cite check-batch command');
  }
}

function validateNonBroadcastAttestation(markdown: string): string[] {
  const section = sectionBetween(markdown, '## Non-Broadcast Attestation', '## Lifecycle Linkage Guidance');
  const fields = parseListFields(section, REQUIRED_NON_BROADCAST_FIELDS);
  const errors = validateRequiredListFields('Non-Broadcast Attestation', section, fields, REQUIRED_NON_BROADCAST_FIELDS);

  validateAttestedFalseOrUnset(errors, fields, 'Non-Broadcast Attestation', '`BRIDGE_BROADCAST_ENABLED` state at start');
  validateAttestedFalseOrUnset(errors, fields, 'Non-Broadcast Attestation', '`BRIDGE_BROADCAST_ENABLED` state at end');
  for (const field of [
    'Live broadcast approval recorded',
    'Submit command attempted',
    'Mempool transaction observed',
    'Local DUP confirmed-history mutation performed',
    'Local SPV/AVL confirmed-history mutation performed',
    'Runtime state files staged',
  ]) {
    validateAttestedNo(errors, fields, 'Non-Broadcast Attestation', field);
  }

  return errors;
}

function validateLifecycleLinkageGuidance(markdown: string): string[] {
  const section = sectionBetween(markdown, '## Lifecycle Linkage Guidance', '## Publication Control');
  const errors: string[] = [];
  const lines = section.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);

  validateNoForbiddenProductionClaimWording(
    errors,
    'Testnet Pre-Broadcast Evidence',
    'document',
    section,
  );

  for (const { term, label } of LIFECYCLE_LINKAGE_ITEMS) {
    const matchingLines = lines.filter(line => term.test(line));
    if (matchingLines.length === 0) {
      errors.push(`Lifecycle Linkage Guidance: must mention ${label}`);
      continue;
    }
    if (!matchingLines.some(line => LIFECYCLE_BLOCKER_STATUS_PATTERN.test(line))) {
      errors.push(`Lifecycle Linkage Guidance: ${label} must remain explicitly blocker, unchecked, or pending`);
    }
    if (matchingLines.some(line => LIFECYCLE_COMPLETED_STATUS_PATTERN.test(line))) {
      errors.push(
        `Lifecycle Linkage Guidance: ${label} must not be marked pass, complete, checked, satisfied, linked, resolved, or closed`,
      );
    }
  }

  if (!/\bpublication blockers?\b/i.test(section)) {
    errors.push('Lifecycle Linkage Guidance: must state incomplete live lifecycle rows remain publication blockers');
  }
  if (!/(?:\bexplicit\s+(?:user\s+)?(?:live\s+)?broadcast\s+approval\b|\buser\s+explicit\s+live\s+broadcast\s+approval\b)/i.test(section)) {
    errors.push('Lifecycle Linkage Guidance: must require explicit broadcast approval before live submit evidence');
  }
  if (!/\buser\s+explicit\s+live\s+broadcast\s+approval\b/i.test(section)) {
    errors.push('Lifecycle Linkage Guidance: must require user explicit live broadcast approval before live submit evidence');
  }
  if (!/\bsubmitted transaction ID\b/i.test(section)) {
    errors.push('Lifecycle Linkage Guidance: must require submitted transaction ID evidence');
  }
  if (!/\bconfirmation evidence\b/i.test(section)) {
    errors.push('Lifecycle Linkage Guidance: must require confirmation evidence');
  }
  if (!/\breconciliation evidence\b/i.test(section)) {
    errors.push('Lifecycle Linkage Guidance: must require reconciliation evidence');
  }

  return errors;
}

function validatePublicationControl(markdown: string): string[] {
  const section = sectionBetween(markdown, '## Publication Control', '## Reviewer Sign-Off');
  const fields = parseListFields(section, REQUIRED_PUBLICATION_FIELDS);
  const errors = validateRequiredListFields('Publication Control', section, fields, REQUIRED_PUBLICATION_FIELDS);

  validateYesNo(errors, fields, 'Publication Control', 'Release notes updated for this dry-run package');
  validateYesNo(errors, fields, 'Publication Control', 'Pending Evidence Register updated for this dry-run package');
  validateExactValue(errors, fields, 'Publication Control', 'Gate 3 checklist row closed by this package', 'no');
  validateExactValue(errors, fields, 'Publication Control', 'Production-ready claim allowed by this package', 'no');
  validateExactValue(errors, fields, 'Publication Control', 'Testnet production-candidate claim allowed by this package', 'no');

  return errors;
}

function validateClaimBoundaries(markdown: string): string[] {
  const errors: string[] = [];

  for (const field of CLAIM_BOUNDARY_FIELDS) {
    const escapedField = escapeRegExp(field);
    const dedicatedNoLinePattern = new RegExp(`^-\\s+${escapedField}\\s*:\\s*no\\s*$`, 'gm');
    const dedicatedFieldLinePattern = new RegExp(`^-\\s+${escapedField}\\s*:`, 'gm');
    const hiddenClaimMarkerPattern = new RegExp(`${escapedField}\\s*(?:=|:)\\s*(?!no\\b)[^\\r\\n]+`, 'i');
    const markdownWithoutDedicatedNoLines = markdown.replace(dedicatedNoLinePattern, '');
    const dedicatedNoLineCount = [...markdown.matchAll(dedicatedNoLinePattern)].length;
    const dedicatedFieldLineCount = [...markdown.matchAll(dedicatedFieldLinePattern)].length;

    if (
      dedicatedFieldLineCount !== 1 ||
      dedicatedNoLineCount !== 1 ||
      hiddenClaimMarkerPattern.test(markdownWithoutDedicatedNoLines)
    ) {
      errors.push(
        `Claim Boundary: ${field} must appear exactly once as a dedicated field with value no`,
      );
    }
  }

  return errors;
}

function validateReviewerSignoff(markdown: string): string[] {
  const section = sectionAfter(markdown, '## Reviewer Sign-Off');
  const fields = parseListFields(section, REQUIRED_SIGNOFF_FIELDS);
  const errors = validateRequiredListFields('Reviewer Sign-Off', section, fields, REQUIRED_SIGNOFF_FIELDS);

  const classification = fields.get('Classification') ?? '';
  if (!isBlank(classification) && !ALLOWED_CLASSIFICATIONS.has(classification)) {
    errors.push('Reviewer Sign-Off: Classification must be pass, fail, or inconclusive');
  }
  if (classification === 'pass') {
    const stopConditions = fields.get('Stop conditions discovered') ?? '';
    if (!/^(none|no|0)$/i.test(stopConditions.trim())) {
      errors.push('Reviewer Sign-Off: pass requires Stop conditions discovered to be none, no, or 0');
    }
    validateExactValue(errors, fields, 'Reviewer Sign-Off', 'Follow-up live rehearsal required', 'yes');
  }
  validateYesNo(errors, fields, 'Reviewer Sign-Off', 'Follow-up live rehearsal required');
  validateYesNo(errors, fields, 'Reviewer Sign-Off', 'Follow-up recovery drill required');
  validateIsoDate(errors, fields, 'Reviewer Sign-Off', 'Date');
  for (const field of REQUIRED_SIGNOFF_FIELDS) {
    validateNoBroadcastPositiveMarkers(errors, 'Reviewer Sign-Off', field, fields.get(field) ?? '');
  }

  const scopeFields = parseListFields(
    sectionBetween(markdown, '## Scope Statement', '## Required Command Artifacts'),
    REQUIRED_SCOPE_FIELDS,
  );
  const scopeReviewer = scopeFields.get('Reviewer') ?? '';
  const signoffReviewer = fields.get('Reviewer') ?? '';
  if (!isBlank(scopeReviewer) && !isBlank(signoffReviewer) && scopeReviewer !== signoffReviewer) {
    errors.push('Reviewer Sign-Off: Reviewer must match Scope Statement Reviewer');
  }
  const scopeDate = scopeFields.get('Date') ?? '';
  const signoffDate = fields.get('Date') ?? '';
  if (
    isIsoCalendarDate(scopeDate.trim()) &&
    isIsoCalendarDate(signoffDate.trim()) &&
    signoffDate.trim() < scopeDate.trim()
  ) {
    errors.push('Reviewer Sign-Off: Date must not be before Scope Statement Date');
  }

  return errors;
}

function validateLinkedAggregateSettlementEvidenceJsonRecords(
  markdown: string,
  records: LinkedAggregateSettlementEvidenceJsonRecord[] | undefined,
): string[] {
  if (records === undefined) return [];

  const errors: string[] = [];
  const dryRunSection = sectionBetween(markdown, '## Dry-Run Settlement Shape', '## Non-Broadcast Attestation');
  const dryRunFields = parseListFields(dryRunSection, REQUIRED_DRY_RUN_FIELDS);
  const expectedTargets = findAggregateSettlementEvidenceJsonTargets(markdown);
  const recordsByTarget = new Map(records.map(record => [record.target, record]));
  const blockedLinkedRecord = records.find(record =>
    record.target === blockedAggregateEvidenceJsonTargetLabel && record.readError
  );

  for (const target of expectedTargets) {
    const pathErrors = validateAggregateSettlementMarkdownJsonLinkTarget(target);
    if (pathErrors.length > 0) {
      errors.push(...pathErrors);
      continue;
    }

    const label = formatAggregateSettlementEvidenceJsonPathLabel(target);
    const record = recordsByTarget.get(target);
    if (!record) {
      if (blockedLinkedRecord?.readError) {
        errors.push(
          `Linked aggregate settlement evidence ${blockedAggregateEvidenceJsonTargetLabel}: ${blockedLinkedRecord.readError}`,
        );
      } else {
        errors.push(`Linked aggregate settlement evidence ${label}: JSON link was not read`);
      }
      continue;
    }
    if (record.readError) {
      errors.push(`Linked aggregate settlement evidence ${label}: ${record.readError}`);
      continue;
    }

    const recordErrors = validateAggregateSettlementPrebroadcastEvidenceRecord(record.record);
    for (const recordError of recordErrors) {
      errors.push(`Linked aggregate settlement evidence ${label}: ${recordError}`);
    }
    if (recordErrors.length === 0 && isAggregateSettlementEvidenceRecord(record.record)) {
      validateLinkedAggregateSettlementEvidenceJsonFieldConsistency(
        errors,
        label,
        dryRunFields,
        record.record,
      );
    }
  }

  return errors;
}

function validateLinkedAggregateSettlementEvidenceJsonFieldConsistency(
  errors: string[],
  label: string,
  fields: Map<string, string>,
  record: AggregateSettlementPrebroadcastEvidenceRecord,
): void {
  const expectedTxId = extractSingleHex32(fields.get('Expected transaction ID') ?? '');
  if (
    expectedTxId !== undefined &&
    record.transactionCheck.expectedTxId.toLowerCase() !== expectedTxId
  ) {
    errors.push(`Linked aggregate settlement evidence ${label}: Expected transaction ID must match JSON transactionCheck.expectedTxId`);
  }

  const pegOutBurnTxId = extractSingleHex32(fields.get('Peg-out burn TX ID') ?? '');
  const selectedClaim = pegOutBurnTxId === undefined
    ? undefined
    : record.claims.find(claim => claim.burnTxHash.toLowerCase() === pegOutBurnTxId);
  if (
    pegOutBurnTxId !== undefined &&
    selectedClaim === undefined
  ) {
    errors.push(`Linked aggregate settlement evidence ${label}: Peg-out burn TX ID must match a JSON claim burnTxHash`);
  }

  validateLinkedIntegerField(
    errors,
    label,
    'Aggregate claim count',
    fields.get('Aggregate claim count') ?? '',
    record.claimCount,
    'JSON claimCount',
  );
  validateLinkedIntegerField(
    errors,
    label,
    'Input count',
    fields.get('Input count') ?? '',
    record.settlementShape.inputCount,
    'JSON settlementShape.inputCount',
  );
  validateLinkedIntegerField(
    errors,
    label,
    'Output count',
    fields.get('Output count') ?? '',
    record.settlementShape.outputCount,
    'JSON settlementShape.outputCount',
  );

  const contextExtensionKeyCounts = normalizeContextExtensionKeyCounts(
    fields.get('ContextExtension key counts per input') ?? '',
  );
  if (
    contextExtensionKeyCounts !== undefined &&
    contextExtensionKeyCounts !== record.settlementShape.contextExtensionKeyCountsCsv
  ) {
    errors.push(
      `Linked aggregate settlement evidence ${label}: ContextExtension key counts per input must match JSON settlementShape.contextExtensionKeyCountsCsv`,
    );
  }

  const sidechainBlockHeight = parseNonNegativeInteger(fields.get('Sidechain block height') ?? '');
  if (
    sidechainBlockHeight !== undefined &&
    (selectedClaim === undefined || selectedClaim.sidechainBlockHeight !== sidechainBlockHeight)
  ) {
    errors.push(`Linked aggregate settlement evidence ${label}: Sidechain block height must match a JSON claim sidechainBlockHeight`);
  }

  const sidechainBlockHash = extractSingleHex32(fields.get('Sidechain block hash') ?? '');
  if (
    sidechainBlockHash !== undefined &&
    (selectedClaim === undefined || selectedClaim.sidechainHeaderHashHex?.toLowerCase() !== sidechainBlockHash)
  ) {
    errors.push(`Linked aggregate settlement evidence ${label}: Sidechain block hash must match a JSON claim sidechainHeaderHashHex`);
  }

  const bridgeEventRoot = extractSingleHex32(fields.get('Bridge event root') ?? '');
  if (
    bridgeEventRoot !== undefined &&
    (selectedClaim === undefined || selectedClaim.bridgeEventRootHex?.toLowerCase() !== bridgeEventRoot)
  ) {
    errors.push(`Linked aggregate settlement evidence ${label}: Bridge event root must match a JSON claim bridgeEventRootHex`);
  }

  const bridgeEventRoots = extractBridgeEventRootHexes(fields.get('Bridge event roots') ?? '');
  if (
    record.claimCount > 1 &&
    bridgeEventRoots.length > 0 &&
    !sameOrderedBridgeEventRoots(
      bridgeEventRoots,
      record.claims.map(claim => claim.bridgeEventRootHex ?? ''),
    )
  ) {
    errors.push(`Linked aggregate settlement evidence ${label}: Bridge event roots must match JSON claim bridgeEventRootHex values in order`);
  }

  const ergoAnchorHeight = parseNonNegativeInteger(fields.get('Ergo anchor height') ?? '');
  if (
    ergoAnchorHeight !== undefined &&
    (selectedClaim === undefined || selectedClaim.ergoAnchorHeight !== ergoAnchorHeight)
  ) {
    errors.push(`Linked aggregate settlement evidence ${label}: Ergo anchor height must match a JSON claim ergoAnchorHeight`);
  }
}

function validateAggregateSettlementMarkdownJsonLinkTarget(target: string): string[] {
  const label = formatAggregateSettlementEvidenceJsonPathLabel(target);
  const errors: string[] = [];

  if (!isLocalRelativeJsonTarget(target)) {
    errors.push(`Linked aggregate settlement evidence ${label}: JSON link must be a local relative path`);
    return errors;
  }
  if (hasParentDirectorySegment(target)) {
    errors.push(`Linked aggregate settlement evidence ${label}: JSON link must not use parent directory segments`);
    return errors;
  }
  for (const pathError of validateAggregateSettlementEvidenceJsonPath(target)) {
    errors.push(`Linked aggregate settlement evidence ${pathError}`);
  }
  return errors;
}

function validateLinkedIntegerField(
  errors: string[],
  label: string,
  field: string,
  value: string,
  expected: number,
  expectedLabel: string,
): void {
  const parsed = parseNonNegativeInteger(value);
  if (parsed !== undefined && parsed !== expected) {
    errors.push(`Linked aggregate settlement evidence ${label}: ${field} must match ${expectedLabel}`);
  }
}

function validateRequiredListFields(
  label: string,
  section: string,
  fields: Map<string, string>,
  requiredFields: string[],
): string[] {
  const errors = validateDuplicateRequiredFields(label, [...fields.keys()], requiredFields);
  for (const field of requiredFields) {
    if (isBlank(fields.get(field) ?? '')) errors.push(`${label}: ${field} is required`);
  }
  return errors;
}

function validateCompletedEvidenceTarget(
  errors: string[],
  label: string,
  field: string,
  value: string,
): void {
  if (isBlank(value)) return;
  if (!hasEvidenceMarker(value)) {
    errors.push(`${label}: ${field} must include a link, command, or artifact marker`);
  } else if (!hasCompletedEvidenceTarget(value)) {
    errors.push(
      `${label}: ${field} must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence`,
    );
  }
}

function validateNoForbiddenPreBroadcastCommandSurfaces(
  errors: string[],
  label: string,
  field: string,
  value: string,
): void {
  for (const commandSurface of findForbiddenPreBroadcastCommandSurfaces(value)) {
    errors.push(`${label}: ${field} must not cite live broadcast-capable command surface: ${commandSurface}`);
  }
}

function findForbiddenPreBroadcastCommandSurfaces(value: string): string[] {
  const surfaces = new Set<string>();
  for (const pattern of FORBIDDEN_PREBROADCAST_COMMAND_SURFACE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of value.matchAll(pattern)) {
      surfaces.add(match[0].replace(/\s+/g, ' ').trim());
    }
  }
  return [...surfaces];
}

function validatePositiveTestnetNetwork(errors: string[], value: string): void {
  if (isBlank(value)) return;
  if (!identifiesPositiveTestnetNetwork(value)) {
    errors.push('Scope Statement: Ergo node network must positively identify testnet');
  }
}

function validateSidechainNetwork(errors: string[], value: string): void {
  if (!identifiesAllowedSidechainNetwork(value)) {
    errors.push(SIDECHAIN_NETWORK_SCOPE_ERROR);
  }
}

function identifiesAllowedSidechainNetwork(value: string): boolean {
  if (isBlank(value) || hasForbiddenSidechainNetworkWording(value)) return false;
  return (
    /\bpatched[- ]?devnet\b/i.test(value) ||
    /\btest[- ]?net\b/i.test(value) ||
    /\bnon[- ]?main[- ]?net\b/i.test(value)
  );
}

function hasForbiddenSidechainNetworkWording(value: string): boolean {
  const withoutNonMainnet = value.replace(/\bnon[- ]?main[- ]?net\b/gi, '');
  return (
    /\b(?:main[- ]?net|main\s+network|main[- ]?chain|mainchain)\b/i.test(withoutNonMainnet) ||
    /\b(?:non[- ]?test[- ]?net|no|not|without|missing|absent|unavailable|unconnected|disconnected)\b.{0,80}\btest[- ]?net\b/i.test(value) ||
    /\btest[- ]?net\b.{0,80}\b(?:not|missing|absent|unavailable|unconnected|disconnected)\b/i.test(value)
  );
}

function identifiesPositiveTestnetNetwork(value: string): boolean {
  return /\btest[- ]?net\b/i.test(value) && !hasForbiddenTestnetNetworkWording(value);
}

function hasForbiddenTestnetNetworkWording(value: string): boolean {
  return (
    /\b(?:main[- ]?net|main\s+network|main[- ]?chain|mainchain)\b/i.test(value) ||
    /\b(?:non[- ]?test[- ]?net|no|not|without|missing|absent|unavailable|unconnected|disconnected)\b.{0,80}\btest[- ]?net\b/i.test(value) ||
    /\btest[- ]?net\b.{0,80}\b(?:not|missing|absent|unavailable|unconnected|disconnected)\b/i.test(value)
  );
}

function validateExactValue(
  errors: string[],
  fields: Map<string, string>,
  label: string,
  field: string,
  expected: string,
): void {
  const value = fields.get(field) ?? '';
  if (!isBlank(value) && value.trim() !== expected) {
    errors.push(`${label}: ${field} must be ${expected}`);
  }
}

function validateAttestedFalseOrUnset(
  errors: string[],
  fields: Map<string, string>,
  label: string,
  field: string,
): void {
  const value = fields.get(field) ?? '';
  if (isBlank(value)) return;
  if (!/^(false|unset)(?:\s+.+)?$/i.test(value.trim())) {
    errors.push(`${label}: ${field} must be false or unset`);
  }
  validateCompletedEvidenceTarget(errors, label, field, value);
  validateNoForbiddenPreBroadcastCommandSurfaces(errors, label, field, value);
  validateNoBroadcastPositiveMarkers(errors, label, field, value);
}

function validateAttestedNo(
  errors: string[],
  fields: Map<string, string>,
  label: string,
  field: string,
): void {
  const value = fields.get(field) ?? '';
  if (isBlank(value)) return;
  if (!/^no(?:\s+.+)?$/i.test(value.trim())) {
    errors.push(`${label}: ${field} must be no`);
  }
  validateCompletedEvidenceTarget(errors, label, field, value);
  validateNoForbiddenPreBroadcastCommandSurfaces(errors, label, field, value);
  validateNoBroadcastPositiveMarkers(errors, label, field, value);
}

function validateNoBroadcastPositiveMarkers(
  errors: string[],
  label: string,
  field: string,
  value: string,
): void {
  if (NON_BROADCAST_ATTESTATION_CONTRADICTION_PATTERN.test(value)) {
    errors.push(`${label}: ${field} must not include broadcast-enabled or live-action indicators`);
  }
}

function validateNoTestnetProductionCandidateReadiness(
  errors: string[],
  label: string,
  field: string,
  value: string,
): void {
  if (TESTNET_PRODUCTION_CANDIDATE_READINESS_PATTERN.test(value)) {
    errors.push(`${label}: ${field} must not imply testnet production-candidate readiness`);
  }
}

function validateNoForbiddenProductionClaimWording(
  errors: string[],
  label: string,
  field: string,
  value: string,
): void {
  const claim = classifyPublicationClaimText(value);
  if (claim.hasMainnetProductionClaim) {
    errors.push(`${label}: ${field} must not contain mainnet production claim wording`);
  }
  if (claim.hasProductionReadyClaim) {
    errors.push(`${label}: ${field} must not contain production-ready claim wording`);
  }
}

function hasContradictoryValidationFailureMarker(segment: string): boolean {
  const normalized = normalizeEvidenceMarkerText(segment);
  return (
    hasUnresolvedIssueMarker(normalized) ||
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

function validateYesNo(
  errors: string[],
  fields: Map<string, string>,
  label: string,
  field: string,
): void {
  const value = fields.get(field) ?? '';
  if (!isBlank(value) && !/^(yes|no)$/i.test(value.trim())) {
    errors.push(`${label}: ${field} must be yes or no`);
  }
}

function validateIsoDate(
  errors: string[],
  fields: Map<string, string>,
  label: string,
  field: string,
): void {
  const value = fields.get(field) ?? '';
  if (!isBlank(value) && !isIsoCalendarDate(value.trim())) {
    errors.push(`${label}: ${field} must use YYYY-MM-DD`);
  }
}

function validateExactlyOneHex32(
  errors: string[],
  label: string,
  field: string,
  value: string,
): void {
  if (isBlank(value)) return;
  const matches = [...value.matchAll(HEX_32_BYTE_PATTERN)];
  if (matches.length !== 1) {
    errors.push(`${label}: ${field} must include exactly one 32-byte hex value`);
  }
}

function extractSingleHex32(value: string): string | undefined {
  const matches = [...value.matchAll(HEX_32_BYTE_PATTERN)].map(match => match[1].toLowerCase());
  return matches.length === 1 ? matches[0] : undefined;
}

function normalizeContextExtensionKeyCounts(value: string): string | undefined {
  if (!EXACT_CONTEXT_EXTENSION_COUNTS_PATTERN.test(value)) return undefined;
  return value.split(',').map(entry => entry.trim()).join(',');
}

function containsCaseInsensitive(value: string, needle: string): boolean {
  return value.toLowerCase().includes(needle.toLowerCase());
}

function validateNonNegativeInteger(
  errors: string[],
  label: string,
  field: string,
  value: string,
): void {
  if (isBlank(value)) return;
  const parsed = parseNonNegativeInteger(value);
  if (parsed === undefined) {
    errors.push(`${label}: ${field} must be a non-negative integer`);
  } else if (!Number.isSafeInteger(parsed)) {
    errors.push(`${label}: ${field} must be a safe integer`);
  }
}

function validateEvidenceBoundNonNegativeInteger(
  errors: string[],
  label: string,
  field: string,
  value: string,
): void {
  if (isBlank(value)) return;
  const parsed = parseEvidenceBoundNonNegativeInteger(value);
  if (parsed === undefined) {
    errors.push(`${label}: ${field} must be a non-negative integer`);
  } else if (!Number.isSafeInteger(parsed)) {
    errors.push(`${label}: ${field} must be a safe integer`);
  }
}

function parseNonNegativeInteger(value: string): number | undefined {
  if (!/^\d+$/.test(value.trim())) return undefined;
  return Number(value.trim());
}

function parseEvidenceBoundNonNegativeInteger(value: string): number | undefined {
  const match = /^(\d+)(?:\s+.+)?$/.exec(value.trim());
  return match ? Number(match[1]) : undefined;
}

function hasUnsafeIntegerCsvEntry(value: string): boolean {
  const trimmed = value.trim();
  if (isBlank(trimmed) || !/^\d+(?:\s*,\s*\d+)*$/.test(trimmed)) return false;
  return trimmed.split(',').some(entry => !Number.isSafeInteger(Number(entry.trim())));
}

function hasEvidenceMarker(value: string): boolean {
  return (
    /\[[^\]]+\]\([^)]+\)/.test(value) ||
    /\bnpm(?:\.cmd)?\s+run\s+[A-Za-z0-9:_-]+\b/.test(value) ||
    hasArtifactMarker(value)
  );
}

function hasCompletedEvidenceTarget(value: string): boolean {
  const completedEvidenceText = preBroadcastCompletedEvidenceText(value);
  return !hasLocalOnlyEvidenceTarget(value) &&
    !hasClaimEscalatingPreBroadcastEvidenceReference(value) &&
    (hasCompletedArtifactTarget(completedEvidenceText) || hasNonTemplateMarkdownLink(completedEvidenceText));
}

function hasCompletedApprovalEvidenceTargetMarker(value: string): boolean {
  return value.split(/[;\n]+/).some(segment =>
    /\bcompleted approval evidence target\b/i.test(segment) &&
    !/\b(?:not|without|missing|lacks?)\s+completed approval evidence target\b/i.test(segment) &&
    hasCompletedEvidenceTarget(segment),
  );
}

function preBroadcastCompletedEvidenceText(value: string): string {
  return value
    .split(/[;\n]+/)
    .map(segment => {
      const targetBinding = PREBROADCAST_VALIDATION_TARGET_BINDING.exec(segment);
      return targetBinding
        ? segment.slice(0, targetBinding.index).trim()
        : segment.trim();
    })
    .filter(segment => segment.length > 0)
    .join('; ');
}

function hasArtifactMarker(value: string): boolean {
  return /(?:^|\s)artifact:\/\//.test(value);
}

function hasCompletedArtifactTarget(value: string): boolean {
  return extractArtifactTargets(value).some(isConcreteEvidenceTarget);
}

function hasNonTemplateMarkdownLink(value: string): boolean {
  const links = [...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)];
  return links.some(([, target]) => isConcreteEvidenceTarget(target));
}

function extractArtifactTargets(value: string): string[] {
  return [...value.matchAll(/(?:^|\s)(artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;]+)/g)]
    .map(([, target]) => target.replace(/[.;]+$/g, ''));
}

function extractEvidenceTargets(value: string): string[] {
  return [
    ...extractArtifactTargets(value),
    ...[...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(([, target]) => target.trim()),
  ];
}

function isConcreteEvidenceTarget(target: string): boolean {
  const normalized = normalizeEvidenceTarget(target);
  if (normalized.length === 0) return false;
  if (isLocalOnlyEvidenceTarget(normalized)) return false;
  if (isSensitiveOrRuntimePreBroadcastEvidenceTarget(normalized)) return false;
  if (hasClaimEscalatingPreBroadcastEvidenceTarget(normalized)) return false;
  return !/-template\.md(?:[#?].*)?$/i.test(normalized) &&
    normalized.split(/[\\/]+/).every(segment => !isNonConcreteEvidenceTargetSegment(segment));
}

function hasClaimEscalatingPreBroadcastEvidenceReference(value: string): boolean {
  return extractEvidenceTargets(value)
    .some(target => hasClaimEscalatingPreBroadcastEvidenceTarget(target));
}

function hasClaimEscalatingPreBroadcastEvidenceTarget(target: string): boolean {
  const claim = classifyPublicationClaimText(normalizeEvidenceTarget(target));
  return claim.hasProductionClaim;
}

function hasLocalOnlyEvidenceTarget(value: string): boolean {
  const normalized = value.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized).some(hasLocalOnlyEvidenceInspectionText);
}

function hasLocalOnlyEvidenceInspectionText(normalized: string): boolean {
  return hasEvidenceLocalOnlyInspectionReference(normalized);
}

function isLocalOnlyEvidenceTarget(value: string): boolean {
  const normalized = value.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized).some(isLocalOnlyEvidenceInspectionTarget);
}

function isLocalOnlyEvidenceInspectionTarget(normalized: string): boolean {
  return (
    hasEvidenceLocalOnlyInspectionReference(normalized) ||
    /^file:\/\//i.test(normalized) ||
    /^[a-z]:\//i.test(normalized) ||
    /^\/\/[^/]/.test(normalized) ||
    /^\/(?:users?|home|tmp|var|private|mnt|volumes|etc)(?:\/|$)/i.test(normalized)
  );
}

function isSensitiveOrRuntimePreBroadcastEvidenceTarget(target: string): boolean {
  const normalized = target.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized).some(isSensitiveOrRuntimePreBroadcastEvidenceInspectionTarget);
}

function isSensitiveOrRuntimePreBroadcastEvidenceInspectionTarget(normalizedTarget: string): boolean {
  const name = basename(normalizedTarget);
  return (
    hasPreBroadcastEnvironmentTargetSegment(normalizedTarget) ||
    hasPreBroadcastRuntimeDatabaseTargetSegment(normalizedTarget) ||
    isEvidenceEnvironmentFileName(name) ||
    isEvidenceSecretOrRuntimeName(normalizedTarget, { includeDeployedState: true }) ||
    isEvidenceRuntimeDatabaseTarget(normalizedTarget)
  );
}

function hasPreBroadcastEnvironmentTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\/\s,;=()]+/)
    .some(segment => isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasPreBroadcastRuntimeDatabaseTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\s,;=()]+/)
    .some(segment => isEvidenceRuntimeDatabaseTarget(segment.replace(/[),;]+$/g, '')));
}

function normalizeEvidenceTarget(target: string): string {
  const trimmed = target.trim();
  const withoutAngleBrackets = trimmed.startsWith('<') && trimmed.endsWith('>')
    ? trimmed.slice(1, -1)
    : trimmed;
  return withoutAngleBrackets.split(/[ \t]/, 1)[0].split('#')[0].split('?')[0].replace(/[),;]+$/g, '').toLowerCase();
}

function isNonConcreteEvidenceTargetSegment(segment: string): boolean {
  const normalized = segment.toLowerCase().replace(/\.[a-z0-9]+$/i, '');
  return (
    /(?:^|[-_.])(?:not[-_]?completed|uncompleted)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])template(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|pre[-_.]?broadcast|non[-_.]?broadcast|broadcast|policy|readiness|status|context[-_.]?extension|guard|deployment[-_.]?state|height|ergo|sidechain|transaction|transactions|expected[-_.]?tx|approval|approvals|daemon|aggregate|claim|claims|package|mempool|dup|spv|avl|runtime|release|checklist|gate|dry[-_.]?run|settlement|shape|scope|signoff|signing|network|reconfirmation|scoped[-_.]?shell)|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:placeholder|generic|todo|tbd)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])sample(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|pre[-_.]?broadcast|non[-_.]?broadcast|broadcast|policy|readiness|status|context[-_.]?extension|guard|deployment[-_.]?state|height|ergo|sidechain|transaction|transactions|expected[-_.]?tx|approval|approvals|daemon|aggregate|claim|claims|package|mempool|dup|spv|avl|runtime|release|checklist|gate|dry[-_.]?run|settlement|shape|scope|signoff|signing|network|reconfirmation|scoped[-_.]?shell)|$)/i.test(normalized) ||
    /(?:^|[-_.])example(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|validator|pre[-_.]?broadcast|non[-_.]?broadcast|broadcast|policy|readiness|status|context[-_.]?extension|guard|deployment[-_.]?state|height|ergo|sidechain|transaction|transactions|expected[-_.]?tx|approval|approvals|daemon|aggregate|claim|claims|package|mempool|dup|spv|avl|runtime|release|checklist|gate|dry[-_.]?run|settlement|shape|scope|signoff|signing|network|reconfirmation|scoped[-_.]?shell)|$)/i.test(normalized)
  );
}

function extractJsonMarkdownLinkTargets(value: string): string[] {
  const targets = new Set<string>();
  for (const [, rawTarget] of value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = normalizeMarkdownLinkTarget(rawTarget);
    if (/\.json$/i.test(target.replace(/\\/g, '/'))) {
      targets.add(target);
    }
  }
  return [...targets];
}

function normalizeMarkdownLinkTarget(rawTarget: string): string {
  const trimmed = rawTarget.trim();
  const withoutAngleBrackets = trimmed.startsWith('<') && trimmed.endsWith('>')
    ? trimmed.slice(1, -1)
    : trimmed;
  return withoutAngleBrackets.split(/[ \t]/, 1)[0].replace(/[?#].*$/, '');
}

function isLocalRelativeJsonTarget(target: string): boolean {
  const normalized = target.replace(/\\/g, '/');
  return (
    /\.json$/i.test(normalized) &&
    !normalized.startsWith('/') &&
    !/^[a-z]:\//i.test(normalized) &&
    !/^[a-z][a-z0-9+.-]*:/i.test(normalized)
  );
}

function isSafeLocalRelativeJsonTarget(target: string): boolean {
  return isLocalRelativeJsonTarget(target) && !hasParentDirectorySegment(target);
}

function hasParentDirectorySegment(target: string): boolean {
  return target.replace(/\\/g, '/').split('/').includes('..');
}

function isAggregateSettlementEvidenceRecord(
  value: unknown,
): value is AggregateSettlementPrebroadcastEvidenceRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseListFields(section: string, knownFields: string[]): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of section.split(/\r?\n/)) {
    if (!line.startsWith('- ')) continue;
    const body = line.slice(2);
    const knownField = knownFields.find(field => body.startsWith(`${field}:`));
    if (knownField !== undefined) {
      fields.set(knownField, body.slice(knownField.length + 1).trim());
      continue;
    }

    const separator = body.indexOf(':');
    if (separator > -1) {
      fields.set(body.slice(0, separator).trim(), body.slice(separator + 1).trim());
    }
  }
  return fields;
}

function sectionBetween(markdown: string, startHeading: string, endHeading: string): string {
  const start = markdown.indexOf(startHeading);
  const end = markdown.indexOf(endHeading);
  if (start < 0 || end < 0 || end <= start) return '';
  return markdown.slice(start + startHeading.length, end);
}

function sectionAfter(markdown: string, startHeading: string): string {
  const start = markdown.indexOf(startHeading);
  if (start < 0) return '';
  return markdown.slice(start + startHeading.length);
}

function isBlank(value: string): boolean {
  return value.trim().length === 0 || /\s\/\s/.test(value.trim());
}
