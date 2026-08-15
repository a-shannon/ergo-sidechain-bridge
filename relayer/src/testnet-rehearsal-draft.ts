import {
  type AggregateSettlementPrebroadcastEvidenceRecord,
} from './aggregate-settlement-evidence.js';
import {
  bridgeEventRootsFromClaims,
  formatBridgeEventRootCsv,
  formatBridgeEventRootCsvOrPlaceholder,
  normalizeBridgeEventRootHex,
} from './bridge-event-root-evidence.js';
import { readEvidenceMarkdownTarget } from './evidence-target-path.js';
import {
  readLinkedAggregateSettlementEvidenceJsonRecords,
} from './testnet-prebroadcast-linked-json.js';
import {
  preflightTestnetRehearsal,
  type TestnetRehearsalPreflightTargetBindings,
} from './testnet-rehearsal-preflight.js';
import { LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE } from './legacy-aggregate-settlement-conservation.js';

export interface TestnetRehearsalDraftInput {
  prebroadcastTarget: string;
  approvalsPath: string;
  doctorArtifact?: string;
  preflightArtifact?: string;
  date?: string;
  operator?: string;
  reviewer?: string;
  gitCommit?: string;
  sidechainNetwork?: string;
  now?: Date;
}

export interface TestnetRehearsalDraftReport {
  status: 'CREATED' | 'BLOCKED';
  executionStatus: 'QUARANTINED';
  message: string;
  errors: string[];
  targetBindings?: TestnetRehearsalDraftTargetBindings;
  plannedCommands?: TestnetRehearsalDraftPlannedCommand[];
  markdown?: string;
  lines: string[];
}

export interface TestnetRehearsalDraftTargetBindings {
  prebroadcast: string;
  approvals: string;
  doctorArtifact?: string;
  preflightArtifact?: string;
}

export interface TestnetRehearsalDraftPlannedCommand {
  label:
    | 'historical-check-provenance'
    | 'legacy-v1-quarantine-check'
    | 'legacy-v1-submit-quarantine'
    | 'historical-post-submit-confirm-reconcile'
    | 'historical-post-submit-read-only-observe'
    | 'offline-assembly'
    | 'final-validation-transcript';
  phase:
    | 'historical-evidence'
    | 'offline-verification'
    | 'blocked-live-settlement'
    | 'historical-reconciliation'
    | 'offline-assembly'
    | 'final-validation';
  command: string;
  broadcastCommand: boolean;
  stateMutationCommand: boolean;
  requiresExplicitLiveBroadcastApproval: boolean;
  requiresCompletedSubmitEvidence: boolean;
  reportAuthorizesExecution: false;
}

interface DraftPackage {
  mode: string;
  expectedTxId: string;
  burnTxHashes: string[];
  bridgeEventRootHexes: string[];
  submissionStatus: string;
  confirmCommand: string;
  checkCommand: string;
  sidechainBlockHeight?: number;
  sidechainHeaderHashHex?: string;
  bridgeEventRootHex?: string;
  ergoAnchorHeight?: number;
  inputCount: number;
  outputCount: number;
  contextExtensionKeyCountsCsv: string;
}

const blockedDraftTargetLabel = '<blocked draft target>';
const legacyV1SubmissionStatus = `BLOCKED: ${LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE}`;

export function buildTestnetRehearsalDraft(
  input: TestnetRehearsalDraftInput,
): TestnetRehearsalDraftReport {
  const preflight = preflightTestnetRehearsal({
    prebroadcastTarget: input.prebroadcastTarget,
    approvalsPath: input.approvalsPath,
    now: input.now,
  });
  const rawTargetBindings = buildTargetBindings(input, preflight.targetBindings);
  const targetBindingErrors = validateGeneratedDraftTargetBindings(rawTargetBindings);
  const targetBindings = formatDraftTargetBindings(rawTargetBindings);
  const displayInput = buildDisplayInput(input, targetBindings);
  if (preflight.status === 'BLOCKED' || targetBindingErrors.length > 0) {
    const errors = [...preflight.errors, ...targetBindingErrors];
    return {
      status: 'BLOCKED',
      executionStatus: 'QUARANTINED',
      message: `testnet rehearsal draft BLOCKED: ${errors.length} preflight issue(s)`,
      errors,
      targetBindings,
      lines: [
        `testnet rehearsal draft BLOCKED: ${errors.length} preflight issue(s)`,
        '- Next safe step: fix rehearsal:preflight blockers and keep broadcast disabled.',
        ...errors.map(error => `  - ${error}`),
      ],
    };
  }

  const target = readEvidenceMarkdownTarget(input.prebroadcastTarget);
  if (target.errors.length > 0) {
    return {
      status: 'BLOCKED',
      executionStatus: 'QUARANTINED',
      message: `testnet rehearsal draft BLOCKED: ${target.errors.length} target issue(s)`,
      errors: target.errors,
      targetBindings,
      lines: [
        `testnet rehearsal draft BLOCKED: ${target.errors.length} target issue(s)`,
        ...target.errors.map(error => `  - ${error}`),
      ],
    };
  }

  const linkedRecords = readLinkedAggregateSettlementEvidenceJsonRecords(
    input.prebroadcastTarget,
    target.markdown,
  );
  const packages: DraftPackage[] = [];
  const errors: string[] = [];
  for (const linkedRecord of linkedRecords) {
    if (linkedRecord.readError) {
      errors.push(`Linked aggregate settlement evidence ${linkedRecord.target}: ${linkedRecord.readError}`);
      continue;
    }
    packages.push(toDraftPackage(linkedRecord.record as AggregateSettlementPrebroadcastEvidenceRecord));
  }

  if (packages.length === 0) {
    errors.push('Draft: at least one linked aggregate settlement JSON record is required');
  }
  if (packages.length > 1) {
    errors.push(
      'Draft: multiple linked aggregate settlement JSON records are not supported by the live rehearsal draft; generate one rehearsal draft per package until per-package live evidence binding is implemented',
    );
  }
  if (errors.length > 0) {
    return {
      status: 'BLOCKED',
      executionStatus: 'QUARANTINED',
      message: `testnet rehearsal draft BLOCKED: ${errors.length} issue(s)`,
      errors,
      targetBindings,
      lines: [
        `testnet rehearsal draft BLOCKED: ${errors.length} issue(s)`,
        ...errors.map(error => `  - ${error}`),
      ],
    };
  }

  const plannedCommands = buildPlannedCommands(packages[0]);
  const markdown = renderDraftMarkdown(displayInput, packages, plannedCommands);
  return {
    status: 'CREATED',
    executionStatus: 'QUARANTINED',
    message: 'testnet rehearsal draft CREATED - execution QUARANTINED',
    errors: [],
    targetBindings,
    plannedCommands,
    markdown,
    lines: [
      'testnet rehearsal draft CREATED - execution QUARANTINED',
      `- prebroadcast target: ${displayInput.prebroadcastTarget}`,
      `- approvals target: ${displayInput.approvalsPath}`,
      `- package count: ${packages.length}`,
      ...packages.flatMap(formatDraftPackageLines),
      '- Next safe step: keep broadcast and aggregate settlement disabled, then complete the reviewed external-fee profile activation and permanent legacy-route retirement prerequisites. This draft does not authorize broadcast, and no approval can enable legacy V1 submission.',
    ],
  };
}

function buildTargetBindings(
  input: TestnetRehearsalDraftInput,
  preflightBindings: TestnetRehearsalPreflightTargetBindings,
): TestnetRehearsalDraftTargetBindings {
  return {
    prebroadcast: preflightBindings.prebroadcast,
    approvals: preflightBindings.approvals ?? input.approvalsPath,
    doctorArtifact: input.doctorArtifact,
    preflightArtifact: input.preflightArtifact,
  };
}

function formatDraftTargetBindings(
  targetBindings: TestnetRehearsalDraftTargetBindings,
): TestnetRehearsalDraftTargetBindings {
  return {
    prebroadcast: formatDraftTargetBinding(targetBindings.prebroadcast),
    approvals: formatDraftTargetBinding(targetBindings.approvals),
    doctorArtifact: targetBindings.doctorArtifact,
    preflightArtifact: targetBindings.preflightArtifact,
  };
}

function formatDraftTargetBinding(target: string): string {
  const trimmedTarget = target.trim();
  if (isBlockedOrPlaceholderTargetLabel(trimmedTarget)) return trimmedTarget;
  return hasShellUnsafeTargetContent(trimmedTarget) ? blockedDraftTargetLabel : trimmedTarget;
}

function validateGeneratedDraftTargetBindings(
  targetBindings: TestnetRehearsalDraftTargetBindings,
): string[] {
  return [
    ...validateGeneratedDraftTargetBinding('targetBindings.prebroadcast', targetBindings.prebroadcast),
    ...validateGeneratedDraftTargetBinding('targetBindings.approvals', targetBindings.approvals),
  ];
}

function validateGeneratedDraftTargetBinding(label: string, target: string): string[] {
  const trimmedTarget = target.trim();
  if (isBlockedOrPlaceholderTargetLabel(trimmedTarget)) return [];
  return hasShellUnsafeTargetContent(trimmedTarget)
    ? [`Draft ${label}: ${blockedDraftTargetLabel} must not contain whitespace or shell metacharacters`]
    : [];
}

function buildDisplayInput(
  input: TestnetRehearsalDraftInput,
  targetBindings: TestnetRehearsalDraftTargetBindings,
): TestnetRehearsalDraftInput {
  return {
    ...input,
    prebroadcastTarget: targetBindings.prebroadcast,
    approvalsPath: targetBindings.approvals,
  };
}

function buildPlannedCommands(
  selected: DraftPackage,
): TestnetRehearsalDraftPlannedCommand[] {
  return [
    plannedCommand({
      label: 'historical-check-provenance',
      phase: 'historical-evidence',
      command: selected.checkCommand,
      broadcastCommand: false,
      stateMutationCommand: false,
      requiresExplicitLiveBroadcastApproval: false,
      requiresCompletedSubmitEvidence: false,
    }),
    plannedCommand({
      label: 'legacy-v1-quarantine-check',
      phase: 'offline-verification',
      command: 'npm run demo:readiness',
      broadcastCommand: false,
      stateMutationCommand: false,
      requiresExplicitLiveBroadcastApproval: false,
      requiresCompletedSubmitEvidence: false,
    }),
    plannedCommand({
      label: 'legacy-v1-submit-quarantine',
      phase: 'blocked-live-settlement',
      command: selected.submissionStatus,
      broadcastCommand: false,
      stateMutationCommand: false,
      requiresExplicitLiveBroadcastApproval: false,
      requiresCompletedSubmitEvidence: false,
    }),
    plannedCommand({
      label: 'historical-post-submit-confirm-reconcile',
      phase: 'historical-reconciliation',
      command: selected.confirmCommand,
      broadcastCommand: false,
      stateMutationCommand: true,
      requiresExplicitLiveBroadcastApproval: false,
      requiresCompletedSubmitEvidence: true,
    }),
    plannedCommand({
      label: 'historical-post-submit-read-only-observe',
      phase: 'historical-reconciliation',
      command: buildPostSubmitObserveCommand(selected),
      broadcastCommand: false,
      stateMutationCommand: false,
      requiresExplicitLiveBroadcastApproval: false,
      requiresCompletedSubmitEvidence: true,
    }),
    plannedCommand({
      label: 'offline-assembly',
      phase: 'offline-assembly',
      command:
        'npm run rehearsal:assemble -- --draft <completed-live-rehearsal-draft.md> --live-preflight <live-preflight.json> ' +
        '--fresh-checkpoint <fresh-testnet-checkpoint.json> [--failed-broadcast <failed-broadcast-row.md>] ' +
        '[--reorg-recovery <reorg-stale-singleton-row.md>] --post-submit <post-submit-observe.json> ' +
        '--out <assembled-live-rehearsal-candidate.md> --json-out <assembled-live-rehearsal-candidate.json>',
      broadcastCommand: false,
      stateMutationCommand: false,
      requiresExplicitLiveBroadcastApproval: false,
      requiresCompletedSubmitEvidence: true,
    }),
    plannedCommand({
      label: 'final-validation-transcript',
      phase: 'final-validation',
      command:
        'npm run rehearsal:validate -- --transcript <artifact://.../rehearsal-validate.log> ' +
        '--assembly-report-json <assembled-live-rehearsal-candidate.json> --live-preflight-json <live-preflight.json> ' +
        '--post-submit-observe-json <post-submit-observe.json> ' +
        '--fresh-checkpoint-json <fresh-testnet-checkpoint.json> ' +
        '--recovery-observe-json <failed-broadcast-observe.json> --recovery-observe-json <reorg-stale-singleton-observe.json> ' +
        '<completed-live-rehearsal.md>',
      broadcastCommand: false,
      stateMutationCommand: false,
      requiresExplicitLiveBroadcastApproval: false,
      requiresCompletedSubmitEvidence: true,
    }),
  ];
}

function plannedCommand(
  command: Omit<TestnetRehearsalDraftPlannedCommand, 'reportAuthorizesExecution'>,
): TestnetRehearsalDraftPlannedCommand {
  return {
    ...command,
    reportAuthorizesExecution: false,
  };
}

function buildPostSubmitObserveCommand(selected: DraftPackage): string {
  return (
    `npm run rehearsal:post-submit:observe -- --expected-tx-id ${selected.expectedTxId} ` +
    `--submitted-tx-id <submittedTxId> ${selected.burnTxHashes.map(txId => `--burn-tx-id ${txId}`).join(' ')} ` +
    '--submission-artifact <artifact://.../submit.log> --confirmation-artifact <artifact://.../confirmation.log> ' +
    '--finality-evidence-artifact <artifact://.../finality.log> ' +
    '--reconciliation-artifact <artifact://.../reconciliation.log> --submission-timestamp <YYYY-MM-DDTHH:mm:ssZ> ' +
    '--first-observed-mempool-height <height> --confirmations-required <n> ' +
    '--fee-nanoerg <feeNanoErg> --failed-event-queue <status> --manual-repair-performed <yes|no> ' +
    '--live-preflight-report <live-preflight.json> ' +
    '[--spv-tracker-nft-id <spvTrackerNftId>] [--aggregate-dup-nft-id <aggregateDupNftId>] ' +
    '--json-out <post-submit-observe.json> --out <post-submit-observe-companion.md>'
  );
}

function toDraftPackage(record: AggregateSettlementPrebroadcastEvidenceRecord): DraftPackage {
  const expectedTxId = record.transactionCheck.expectedTxId.toLowerCase();
  const burnTxHashes = record.claims.map(claim => claim.burnTxHash.toLowerCase());
  const bridgeEventRootHexes = bridgeEventRootsFromClaims(record.claims);
  const firstClaim = record.claims[0];
  const sidechainHeaderHashHex = firstClaim?.sidechainHeaderHashHex?.toLowerCase();
  const bridgeEventRootHex = normalizeBridgeEventRootHex(firstClaim?.bridgeEventRootHex);
  const ergoAnchorHeight = firstClaim?.ergoAnchorHeight;
  const archivedCheckProvenance =
    `ARCHIVED legacy V1 ${record.command} provenance for ${burnTxHashes.join(',')}; ` +
    'the executable check command is physically removed';

  if (record.command === 'check-batch') {
    return {
      mode: 'batch',
      expectedTxId,
      burnTxHashes,
      bridgeEventRootHexes,
      submissionStatus: legacyV1SubmissionStatus,
      confirmCommand: `npm run settle:aggregate -- confirm-batch <settlementTxId> ${burnTxHashes.join(' ')}`,
      checkCommand: archivedCheckProvenance,
      sidechainBlockHeight: firstClaim?.sidechainBlockHeight,
      sidechainHeaderHashHex,
      bridgeEventRootHex,
      ergoAnchorHeight,
      inputCount: record.settlementShape.inputCount,
      outputCount: record.settlementShape.outputCount,
      contextExtensionKeyCountsCsv: record.settlementShape.contextExtensionKeyCountsCsv,
    };
  }

  if (record.command === 'check') {
    return {
      mode: 'single',
      expectedTxId,
      burnTxHashes,
      bridgeEventRootHexes,
      submissionStatus: legacyV1SubmissionStatus,
      confirmCommand: `npm run settle:aggregate -- confirm ${burnTxHashes[0]} <settlementTxId>`,
      checkCommand: archivedCheckProvenance,
      sidechainBlockHeight: firstClaim?.sidechainBlockHeight,
      sidechainHeaderHashHex,
      bridgeEventRootHex,
      ergoAnchorHeight,
      inputCount: record.settlementShape.inputCount,
      outputCount: record.settlementShape.outputCount,
      contextExtensionKeyCountsCsv: record.settlementShape.contextExtensionKeyCountsCsv,
    };
  }

  if (record.command === 'check-anchored') {
    return {
      mode: 'single-with-ingest',
      expectedTxId,
      burnTxHashes,
      bridgeEventRootHexes,
      submissionStatus: legacyV1SubmissionStatus,
      confirmCommand: `npm run settle:aggregate -- confirm-anchored ${burnTxHashes[0]} <settlementTxId> ${ergoAnchorHeight ?? '<ergoAnchorHeight>'}`,
      checkCommand: archivedCheckProvenance,
      sidechainBlockHeight: firstClaim?.sidechainBlockHeight,
      sidechainHeaderHashHex,
      bridgeEventRootHex,
      ergoAnchorHeight,
      inputCount: record.settlementShape.inputCount,
      outputCount: record.settlementShape.outputCount,
      contextExtensionKeyCountsCsv: record.settlementShape.contextExtensionKeyCountsCsv,
    };
  }

  return {
    mode: 'single-with-ingest',
    expectedTxId,
    burnTxHashes,
    bridgeEventRootHexes,
    submissionStatus: legacyV1SubmissionStatus,
    confirmCommand:
      `npm run settle:aggregate -- confirm-with-ingest ${burnTxHashes[0]} <settlementTxId> ` +
      `${sidechainHeaderHashHex ?? '<sidechainHeaderHashHex>'} ${bridgeEventRootHex ?? '<bridgeEventRootHex>'} ${ergoAnchorHeight ?? '<ergoAnchorHeight>'}`,
    checkCommand: archivedCheckProvenance,
    sidechainBlockHeight: firstClaim?.sidechainBlockHeight,
    sidechainHeaderHashHex,
    bridgeEventRootHex,
    ergoAnchorHeight,
    inputCount: record.settlementShape.inputCount,
    outputCount: record.settlementShape.outputCount,
    contextExtensionKeyCountsCsv: record.settlementShape.contextExtensionKeyCountsCsv,
  };
}

function renderDraftMarkdown(
  input: TestnetRehearsalDraftInput,
  packages: DraftPackage[],
  plannedCommands: TestnetRehearsalDraftPlannedCommand[],
): string {
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const operator = input.operator ?? '<operator>';
  const reviewer = input.reviewer ?? '<reviewer>';
  const gitCommit = input.gitCommit ?? '<git-commit>';
  const sidechainNetwork = input.sidechainNetwork ?? 'patched-devnet';
  const selected = packages[0];
  const burnSet = selected.burnTxHashes.join(',');
  const postSubmitObserveCommand = commandByLabel(plannedCommands, 'historical-post-submit-read-only-observe');

  return `# Testnet Live Rehearsal Draft

This draft was generated from a validated pre-broadcast package. It is not completed Gate 3 evidence, does not authorize broadcast, and cannot support production-ready or testnet production-candidate claims. Legacy V1 aggregate submission is quarantined for a deterministic fee-from-backing deficit, so this draft contains no executable submit command. It preserves diagnostic checks and historical reconciliation structure only.

## Session Metadata

- Date: ${date}
- Operator: ${operator}
- Reviewer: ${reviewer}
- Environment: testnet
- Git commit: ${gitCommit}
- Release level being evaluated: institutional reference
- Ergo node network: testnet
- Sidechain network: ${sidechainNetwork}
- Broadcast mode at start: disabled
- Broadcast mode at end: disabled
- Settlement profile ID: legacy-aggregate-v1
- Profile activation status: QUARANTINED
- Evidence purpose: historical-diagnostics
- Activation evidence target: none
- Activation ID: none

## Lifecycle Gate Classification

| Release gate | Status | Evidence artifact | Blocking note | Required next evidence |
|---|---|---|---|---|
| Fresh local devnet lifecycle | not applicable | artifact://draft/not-local-devnet | This is a testnet rehearsal draft. | None for this testnet draft. |
| Fresh testnet lifecycle | publication blocker | ${input.prebroadcastTarget} | Legacy V1 live submit is disabled and no replacement profile is activated. | Activate a reviewed external-fee profile, retire every legacy funds route, obtain exact target-node and funds-authority evidence, then regenerate the live lifecycle package. |
| Peg-in evidence | publication blocker | ${input.prebroadcastTarget} | Pre-broadcast package may cite peg-in evidence, but this draft does not close live lifecycle evidence. | Link completed peg-in evidence from the live rehearsal. |
| Peg-out burn evidence | publication blocker | ${input.prebroadcastTarget} burnTxHashes=${burnSet} | Pre-broadcast burn evidence is preparation evidence only. | Link completed peg-out burn evidence from the live rehearsal. |
| Anchor evidence | publication blocker | ${input.prebroadcastTarget} bridgeEventRoot=${selected.bridgeEventRootHex ?? '<bridgeEventRoot>'} | Pre-broadcast anchor evidence is preparation evidence only. | Link completed anchor evidence from the live rehearsal. |
| Settlement check evidence | publication blocker | ${input.prebroadcastTarget} Expected transaction ID ${selected.expectedTxId} | /transactions/check evidence is non-broadcast preparation evidence only. | Link completed settlement check evidence from the live rehearsal. |
| Settlement submit evidence | publication blocker | <corrected-profile-live-submit-artifact> | No executable legacy V1 submit command exists in this draft. | Link a future live submission from a reviewed and activated external-fee profile after legacy-route retirement; approval alone cannot satisfy this row. |
| Confirmation evidence | publication blocker | <live-confirmation-artifact> | No canonical confirmation has been observed by this draft. | Record confirmation policy evidence with confirmationsRequired, confirmationsObserved, and submitted transaction ID. |
| Reconciliation evidence | publication blocker | <live-reconciliation-artifact> | No DUP/SPV reconciliation has been performed by this draft. | Record status, DUP successor, SPV tracker successor, payout box, and duplicate-payout evidence after confirmation. |
| Failed broadcast / phantom AVL evidence | publication blocker | <failed-broadcast-drill-artifact> | Recovery drill evidence is not included in this draft. | Link completed failed-broadcast/phantom-AVL recovery drill evidence. |
| Reorged burn / stale singleton evidence | publication blocker | <reorg-recovery-drill-artifact> | Reorg/stale-singleton recovery drill evidence is not included in this draft. | Link completed reorged-burn and stale-singleton recovery evidence. |
| Backup-restore or reconstructibility evidence | publication blocker | <backup-restore-artifact> | Backup-restore drill evidence is not included in this draft. | Link completed backup-restore evidence validated with npm run backup:validate. |

## Preflight Evidence

- Clean-checkout checks passed: <completed npm run check evidence>
- ContextExtension guard result: <completed ContextExtension guard evidence>
- Broadcast policy result: <completed broadcast disabled/refused evidence>
- Deployed singleton status: <completed singleton status evidence>
- Clean deployment state evidence: <deployment-state hash, contract IDs, singleton inventory evidence>
- Liquidity status: <completed liquidity evidence>
- Current Ergo height: <height> <completed node height evidence>
- Current sidechain height: <height> <completed sidechain height evidence>
- Pre-broadcast package: ${input.prebroadcastTarget}
- Pre-broadcast doctor transcript/report: ${input.doctorArtifact ?? '<prebroadcast:doctor transcript/report artifact>'}
- Rehearsal preflight transcript/report: ${input.preflightArtifact ?? '<rehearsal:preflight transcript/report artifact>'}

## Dry-Run Settlement Evidence

${packages.map(formatDraftPackageMarkdown).join('\n')}
- Expected transaction ID: ${selected.expectedTxId}
- Expected transaction ID boundary: ${selected.expectedTxId} is diagnostic V1 check output and cannot become submit authority while the legacy route is quarantined.
- Daemon approval evidence: ${input.approvalsPath} version 2 approval file matched by npm run rehearsal:preflight; distinct rehearsal:preflight transcript/report ${input.preflightArtifact ?? '<rehearsal:preflight transcript/report artifact>'}

## Planned Command Boundary

${plannedCommands.map(formatPlannedCommandMarkdown).join('\n')}

## Legacy V1 Quarantine

- Submission status: ${selected.submissionStatus}
- Broadcast mode required: disabled
- Aggregate settlement mode required: disabled
- Diagnostic command: \`npm run demo:readiness\` with broadcast and aggregate settlement both disabled
- Replacement boundary: a reviewed and activated, separately versioned external-fee profile plus permanent legacy-route retirement is required before any live-preflight or submit handoff is generated.
- Authorization boundary: reviewer approval, user approval, an Expected transaction ID, a local status, or a broadcast setting cannot override the quarantine.

## Submission And Historical Confirmation Evidence

- Submission status: ${selected.submissionStatus}
- Historical confirm command: ${selected.confirmCommand}
- Historical submitted transaction ID: <required only for an exact transaction proven submitted before quarantine>
- Submission timestamp: <pending YYYY-MM-DDTHH:mm:ssZ>
- First observed mempool height: <pending height>
- Confirmation height: <pending height>
- Confirmation count: <pending count>
- Required confirmation count: <pending positive integer>
- Confirmation policy met: no <pending finality evidence>
- Settlement output box IDs: <pending output box IDs>
- DUP successor box ID: <pending DUP successor box ID>
- SPV tracker successor box ID: <pending SPV tracker successor box ID>
- Recipient payout box ID: <pending payout box ID>
- Recipient payout box IDs: <pending payout box IDs>
- Miner fee output: <pending feeNanoErg evidence>
- Historical post-submit observe output shape: <pending only for a pre-quarantine submitted transaction; must bind its exact submitted transaction ID, SPV tracker successor output OUTPUTS(0), Aggregate DUP successor output OUTPUTS(1), positional recipient payout binding, and final canonical miner fee output>

## Post-Submit Observe Handoff

- Command template: \`${postSubmitObserveCommand}\`
- Required timing: run only for an exact historical transaction proven submitted before quarantine, after confirmation evidence and reconciliation evidence already exist.
- Read-only boundary: this command observes the node and SQLite state only; it does not sign, submit, confirm, reconcile, approve, or broadcast transactions.
- Required output-shape evidence: rehearsal:post-submit:observe PASS output, same submitted/Expected transaction ID ${selected.expectedTxId}, SPV tracker successor output OUTPUTS(0), Aggregate DUP successor output OUTPUTS(1), positional recipient payout binding, and canonical miner fee output.
- Assembly input: include the resulting structured post-submit observe JSON report as the rehearsal:assemble --post-submit source target; Markdown output is companion human-readable evidence only.

## Reconciliation Evidence

- Peg-out status after reconciliation: <pending status plus submitted transaction ID>
- DUP history contains only confirmed keys: <pending evidence>
- SPV tracker digest matches confirmed successor: <pending evidence>
- No duplicate payout exists for the same burn: <pending evidence>
- Failed-event queue: <pending evidence>
- Manual repair performed: no <pending evidence>

## Rollback And Cleanup

- Broadcast disabled in all shells: <pending final disabled-broadcast evidence>
- Runtime state files preserved but not staged: <pending git status evidence>
- Logs archived: <pending log archive evidence>
- Incident or regression issue opened if needed: <pending yes/no>
- Regression test or runbook update needed: <pending yes/no>

## Publication Evidence

- Release notes updated: no
- Required release-note updates: completed Gate 3 rehearsal release-note update evidence: <pending>
- Pending Evidence Register updated: no
- Required checklist updates: completed Gate 3 checklist update evidence: <pending>
- Production-ready claim allowed by this rehearsal: no
- Testnet production-candidate claim allowed by this rehearsal: no

## Reviewer Sign-Off

- Classification: inconclusive
- Publication blockers discovered: corrected external-fee profile activation, legacy-route retirement, target-node acceptance, funds authority, live lifecycle evidence, recovery drill, backup-restore, and publication-update evidence remain pending
- Follow-up tests required: corrected-profile live testnet rehearsal, recovery drill, backup-restore drill, final rehearsal validation
- Follow-up runbook changes required: no
- Reviewer: ${reviewer}
- Date: ${date}
`;
}

function commandByLabel(
  commands: TestnetRehearsalDraftPlannedCommand[],
  label: TestnetRehearsalDraftPlannedCommand['label'],
): string {
  return commands.find(command => command.label === label)?.command ?? '<missing planned command>';
}

function formatPlannedCommandMarkdown(command: TestnetRehearsalDraftPlannedCommand): string {
  return (
    `- ${command.label}: ${command.command} ` +
    `[broadcast command: ${formatBoolean(command.broadcastCommand)}; ` +
    `report authorizes execution: ${formatBoolean(command.reportAuthorizesExecution)}; ` +
    `phase: ${command.phase}; ` +
    `state mutation command: ${formatBoolean(command.stateMutationCommand)}; ` +
    `requires explicit live broadcast approval: ${formatBoolean(command.requiresExplicitLiveBroadcastApproval)}; ` +
    `requires completed submit evidence: ${formatBoolean(command.requiresCompletedSubmitEvidence)}]`
  );
}

function formatBoolean(value: boolean): 'yes' | 'no' {
  return value ? 'yes' : 'no';
}

function formatDraftPackageMarkdown(pkg: DraftPackage, index: number): string {
  const bridgeEventRootCsv = formatBridgeEventRootCsv(pkg.bridgeEventRootHexes);
  const singularBridgeRootLine = pkg.mode === 'batch'
    ? `- Bridge event root: ${pkg.bridgeEventRootHex ?? '<bridgeEventRootHex>'} (first ordered batch claim; Bridge event roots is authoritative for batch approval binding)`
    : `- Bridge event root: ${pkg.bridgeEventRootHex ?? '<bridgeEventRootHex>'}`;
  const packageSingularBridgeRootLine = pkg.mode === 'batch'
    ? `- Package ${index + 1} bridge event root: ${pkg.bridgeEventRootHex ?? '<bridgeEventRootHex>'} (first ordered batch claim; Package ${index + 1} bridge event roots is authoritative)`
    : `- Package ${index + 1} bridge event root: ${pkg.bridgeEventRootHex ?? '<bridgeEventRootHex>'}`;
  return [
    `- Package ${index + 1} mode: ${pkg.mode}`,
    `- Package ${index + 1} historical check provenance: ${pkg.checkCommand}`,
    `- Package ${index + 1} peg-out burn TX ID: ${pkg.burnTxHashes.join(',')}`,
    `- Package ${index + 1} sidechain block height: ${pkg.sidechainBlockHeight ?? '<sidechainBlockHeight>'}`,
    `- Package ${index + 1} sidechain block hash: ${pkg.sidechainHeaderHashHex ?? '<sidechainHeaderHashHex>'}`,
    singularBridgeRootLine,
    ...(pkg.mode === 'batch' ? [`- Bridge event roots: ${bridgeEventRootCsv}`] : []),
    packageSingularBridgeRootLine,
    ...(pkg.mode === 'batch' ? [`- Package ${index + 1} bridge event roots: ${bridgeEventRootCsv}`] : []),
    `- Package ${index + 1} Ergo anchor height: ${pkg.ergoAnchorHeight ?? '<ergoAnchorHeight>'}`,
    `- Package ${index + 1} aggregate claim count: ${pkg.burnTxHashes.length}`,
    `- Package ${index + 1} input count: ${pkg.inputCount}`,
    `- Package ${index + 1} output count: ${pkg.outputCount}`,
    `- Package ${index + 1} ContextExtension key counts per input: ${pkg.contextExtensionKeyCountsCsv}`,
    `- Package ${index + 1} Expected transaction ID: ${pkg.expectedTxId}`,
  ].join('\n');
}

function formatDraftPackageLines(pkg: DraftPackage): string[] {
  return [
    `- package mode=${pkg.mode} expectedTxId=${pkg.expectedTxId} burnTxHashes=${pkg.burnTxHashes.join(',')} bridgeEventRoots=${formatBridgeEventRootCsvOrPlaceholder(pkg.bridgeEventRootHexes)}`,
    `  submissionStatus=${pkg.submissionStatus}`,
    `  historicalConfirm=${pkg.confirmCommand}`,
  ];
}

function isBlockedOrPlaceholderTargetLabel(target: string): boolean {
  return /^<[^<>]+>$/.test(target);
}

function hasShellUnsafeTargetContent(target: string): boolean {
  return !/^[A-Za-z0-9._/-]+$/.test(target.replace(/\\/g, '/'));
}
