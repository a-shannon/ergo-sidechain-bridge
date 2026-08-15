import { readEvidenceMarkdownTarget } from './evidence-target-path.js';
import {
  readLinkedAggregateSettlementEvidenceJsonRecords,
  summarizeLinkedAggregateSettlementEvidenceJsonRecords,
} from './testnet-prebroadcast-linked-json.js';
import type {
  LinkedAggregateSettlementEvidenceJsonSummary,
} from './testnet-prebroadcast-linked-json.js';
import {
  validateTestnetPreBroadcastEvidence,
} from './testnet-prebroadcast-evidence.js';
import type {
  LinkedAggregateSettlementEvidenceJsonRecord,
  TestnetPreBroadcastValidation,
} from './testnet-prebroadcast-evidence.js';

export interface TestnetPreBroadcastPackageDoctorInput {
  label: string;
  markdown: string;
  linkedAggregateSettlementEvidenceJsonRecords: LinkedAggregateSettlementEvidenceJsonRecord[];
}

export interface TestnetPreBroadcastPackageDoctorReport {
  status: 'PASS' | 'BLOCKED';
  label: string;
  message: string;
  errors: string[];
  linkedAggregateJsonSummaries: LinkedAggregateSettlementEvidenceJsonSummary[];
  nextSafeActions: TestnetPreBroadcastPackageDoctorNextSafeAction[];
  lines: string[];
}

export interface TestnetPreBroadcastPackageDoctorNextSafeAction {
  label:
    | 'fix-prebroadcast-package'
    | 'rehearsal-preflight'
    | 'testnet-window-prep'
    | 'fresh-testnet-check'
    | 'offline-gate'
    | 'prep-bundle';
  phase: 'fix-blockers' | 'offline-preparation';
  command?: string;
  note: string;
  broadcastCommand: false;
  requiresExplicitLiveBroadcastApproval: false;
}

export function doctorTestnetPreBroadcastPackage(
  markdownTarget: string,
): TestnetPreBroadcastPackageDoctorReport {
  const { errors, label, markdown } = readEvidenceMarkdownTarget(markdownTarget);
  if (errors.length > 0) {
    return buildBlockedTargetReport(label, errors);
  }

  return buildTestnetPreBroadcastPackageDoctorReport({
    label,
    markdown,
    linkedAggregateSettlementEvidenceJsonRecords: readLinkedAggregateSettlementEvidenceJsonRecords(
      markdownTarget,
      markdown,
    ),
  });
}

export function buildTestnetPreBroadcastPackageDoctorReport(
  input: TestnetPreBroadcastPackageDoctorInput,
): TestnetPreBroadcastPackageDoctorReport {
  const validation = validateTestnetPreBroadcastEvidence(input.markdown, {
    linkedAggregateSettlementEvidenceJsonRecords: input.linkedAggregateSettlementEvidenceJsonRecords,
  });
  const linkedAggregateJsonSummaries = summarizeLinkedAggregateSettlementEvidenceJsonRecords(
    input.linkedAggregateSettlementEvidenceJsonRecords,
  );
  const nextSafeActions = buildNextSafeActions(input.label, validation.status, linkedAggregateJsonSummaries);
  const message = `${input.label}: prebroadcast package doctor ${validation.status}${
    validation.status === 'BLOCKED' ? `: ${validation.errors.length} structural issue(s)` : ''
  }`;

  return {
    status: validation.status,
    label: input.label,
    message,
    errors: validation.errors,
    linkedAggregateJsonSummaries,
    nextSafeActions,
    lines: buildReportLines(input.label, validation, linkedAggregateJsonSummaries, nextSafeActions),
  };
}

function buildBlockedTargetReport(
  label: string,
  errors: string[],
): TestnetPreBroadcastPackageDoctorReport {
  const message = `${label}: prebroadcast package doctor BLOCKED: ${errors.length} structural issue(s)`;
  return {
    status: 'BLOCKED',
    label,
    message,
    errors,
    linkedAggregateJsonSummaries: [],
    nextSafeActions: [fixPrebroadcastPackageAction],
    lines: [
      message,
      `- markdown: ${label}`,
      '- linkedAggregateJson: 0 local record(s)',
      `- Next safe action: ${fixPrebroadcastPackageAction.note}`,
      '- Remaining issues:',
      ...errors.map(error => `  - ${error}`),
    ],
  };
}

function buildReportLines(
  label: string,
  validation: TestnetPreBroadcastValidation,
  linkedAggregateJsonSummaries: LinkedAggregateSettlementEvidenceJsonSummary[],
  nextSafeActions: TestnetPreBroadcastPackageDoctorNextSafeAction[],
): string[] {
  const message = `${label}: prebroadcast package doctor ${validation.status}${
    validation.status === 'BLOCKED' ? `: ${validation.errors.length} structural issue(s)` : ''
  }`;
  const lines = [
    message,
    `- markdown: ${label}`,
    `- linkedAggregateJson: ${linkedAggregateJsonSummaries.length} local record(s)`,
    ...linkedAggregateJsonSummaries.map(formatLinkedJsonSummary),
  ];

  if (validation.errors.length > 0) {
    lines.push(`- Next safe action: ${fixPrebroadcastPackageAction.note}`);
    lines.push('- Remaining issues:');
    lines.push(...validation.errors.map(error => `  - ${error}`));
  } else {
    lines.push('- Next safe step: this doctor report authorizes no live submit, confirmation, or reconciliation; keep each outside scope unless separately and explicitly approved by the user.');
    lines.push('- Next safe actions:');
    lines.push(...nextSafeActions.map(action =>
      `  - ${action.label}: ${action.command ?? action.note}`
    ));
  }

  return lines;
}

const fixPrebroadcastPackageAction: TestnetPreBroadcastPackageDoctorNextSafeAction = {
  label: 'fix-prebroadcast-package',
  phase: 'fix-blockers',
  note: 'fix prebroadcast evidence or linked aggregate JSON while keeping broadcast disabled',
  broadcastCommand: false,
  requiresExplicitLiveBroadcastApproval: false,
};

function buildNextSafeActions(
  prebroadcastTarget: string,
  status: TestnetPreBroadcastValidation['status'],
  linkedAggregateJsonSummaries: LinkedAggregateSettlementEvidenceJsonSummary[],
): TestnetPreBroadcastPackageDoctorNextSafeAction[] {
  if (status === 'BLOCKED') {
    return [fixPrebroadcastPackageAction];
  }

  const aggregateTarget = firstReadableAggregateTarget(linkedAggregateJsonSummaries);
  return [
    {
      label: 'rehearsal-preflight',
      phase: 'offline-preparation',
      command:
        `npm run rehearsal:preflight -- --prebroadcast ${safeCommandTarget(prebroadcastTarget, 'COMPLETED_TESTNET_PREBROADCAST_EVIDENCE_MD')} ` +
        '--approvals AGGREGATE_APPROVALS_V2_JSON --json-out REHEARSAL_PREFLIGHT_JSON',
      note: 'validate the approvals file against the dry-run package before any live window',
      broadcastCommand: false,
      requiresExplicitLiveBroadcastApproval: false,
    },
    {
      label: 'testnet-window-prep',
      phase: 'offline-preparation',
      command:
        'npm run rehearsal:testnet-window-prep -- --prebroadcast COMPLETED_TESTNET_PREBROADCAST_EVIDENCE_MD ' +
        '--approvals AGGREGATE_APPROVALS_V2_JSON --current-ergo-height CURRENT_ERGO_HEIGHT --current-sidechain-height CURRENT_SIDECHAIN_HEIGHT ' +
        '--current-deployed-state-hash DEPLOYED_STATE_HASH_64_HEX --ergo-node-network testnet --sidechain-network SIDECHAIN_NETWORK_NON_MAINNET ' +
        '--out TESTNET_WINDOW_PREP_MD --json-out TESTNET_WINDOW_PREP_JSON',
      note: 'record the current non-broadcast testnet live-window boundary',
      broadcastCommand: false,
      requiresExplicitLiveBroadcastApproval: false,
    },
    {
      label: 'fresh-testnet-check',
      phase: 'offline-preparation',
      command:
        `npm run rehearsal:fresh-testnet-check -- --aggregate-evidence ${aggregateTarget} --auto-heights ` +
        '--ergo-node-network testnet --sidechain-network SIDECHAIN_NETWORK_NON_MAINNET ' +
        '--out FRESH_TESTNET_CHECKPOINT_MD --json-out FRESH_TESTNET_CHECKPOINT_JSON',
      note: 'collect read-only current heights, singleton state, and 0x0401 anchor observations',
      broadcastCommand: false,
      requiresExplicitLiveBroadcastApproval: false,
    },
    {
      label: 'offline-gate',
      phase: 'offline-preparation',
      command:
        'npm run rehearsal:offline-gate -- --prebroadcast PREBROADCAST_DOCTOR_JSON --preflight REHEARSAL_PREFLIGHT_JSON ' +
        '--window-prep TESTNET_WINDOW_PREP_JSON --fresh-checkpoint FRESH_TESTNET_CHECKPOINT_JSON --json-out OFFLINE_GATE_JSON',
      note: 'check that all preparation artifacts match without authorizing broadcast',
      broadcastCommand: false,
      requiresExplicitLiveBroadcastApproval: false,
    },
    {
      label: 'prep-bundle',
      phase: 'offline-preparation',
      command:
        'npm run rehearsal:prep-bundle -- --prebroadcast COMPLETED_TESTNET_PREBROADCAST_EVIDENCE_MD --approvals AGGREGATE_APPROVALS_V2_JSON ' +
        '--current-ergo-height CURRENT_ERGO_HEIGHT --current-sidechain-height CURRENT_SIDECHAIN_HEIGHT --current-deployed-state-hash DEPLOYED_STATE_HASH_64_HEX ' +
        '--ergo-node-network testnet --sidechain-network SIDECHAIN_NETWORK_NON_MAINNET ' +
        '--fresh-checkpoint-artifact FRESH_TESTNET_CHECKPOINT_JSON --out PREP_BUNDLE_MD --json-out PREP_BUNDLE_JSON',
      note: 'package the preparation commands and artifacts for reviewer handoff',
      broadcastCommand: false,
      requiresExplicitLiveBroadcastApproval: false,
    },
  ];
}

function firstReadableAggregateTarget(
  linkedAggregateJsonSummaries: LinkedAggregateSettlementEvidenceJsonSummary[],
): string {
  const first = linkedAggregateJsonSummaries.find(summary => summary.status === 'READ');
  return first ? safeCommandTarget(first.target, 'AGGREGATE_CHECK_JSON') : 'AGGREGATE_CHECK_JSON';
}

function safeCommandTarget(target: string, fallback: string): string {
  const normalized = target.trim().replace(/\\/g, '/');
  const segments = normalized.split('/');
  if (
    normalized.length === 0 ||
    normalized.includes(' ') ||
    normalized.includes('<') ||
    normalized.includes('>') ||
    !/^[A-Za-z0-9._/-]+$/.test(normalized) ||
    /^[a-z][a-z0-9+.-]*:/i.test(normalized) ||
    normalized.startsWith('/') ||
    segments.some(segment => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    return fallback;
  }
  return normalized;
}

function formatLinkedJsonSummary(summary: LinkedAggregateSettlementEvidenceJsonSummary): string {
  if (summary.status === 'BLOCKED') {
    return `- ${summary.label}: BLOCKED ${summary.readError ?? 'linked JSON unavailable'}`;
  }

  return (
    `- ${summary.label}: READ ` +
    `command=${summary.command} ` +
    `expectedTxId=${summary.expectedTxId} ` +
    `claims=${summary.claimCount} ` +
    `inputs=${summary.inputCount} ` +
    `outputs=${summary.outputCount} ` +
    `contextExtensionKeyCounts=${summary.contextExtensionKeyCountsCsv}`
  );
}
