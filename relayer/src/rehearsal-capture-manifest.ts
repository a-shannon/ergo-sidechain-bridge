import { sanitizeReportText } from './report-text-sanitizer.js';
import { LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE } from './legacy-aggregate-settlement-conservation.js';

export interface RehearsalCaptureManifestInput {
  sourceCommit: string;
  prerequisiteMapTarget: string;
  prerequisiteMapMarkdown: string;
  operatorPacketTarget: string;
  operatorPacketMarkdown: string;
  liveTemplateTarget: string;
  operatorRunbookTarget: string;
  readinessRequestTarget?: string;
  patchedDevnetGoNoGoJsonTarget?: string;
  patchedDevnetGoNoGoValidationTarget?: string;
  patchedDevnetGoNoGoVerdict?: string;
  patchedDevnetGoNoGoValidationMessage?: string;
  command: string;
}

export interface RehearsalCaptureManifest {
  title: string;
  sourceCommit: string;
  prerequisiteMapTarget: string;
  operatorPacketTarget: string;
  liveTemplateTarget: string;
  operatorRunbookTarget: string;
  readinessRequestTarget?: string;
  patchedDevnetGoNoGoJsonTarget?: string;
  patchedDevnetGoNoGoValidationTarget?: string;
  patchedDevnetGoNoGoVerdict?: string;
  patchedDevnetGoNoGoValidationMessage?: string;
  command: string;
  prerequisiteResult: string;
  prerequisiteStructuralIssues: number;
  operatorPacketResult: string;
  captureSequence: RehearsalCapturePhase[];
  acceptanceCriteria: RehearsalAcceptanceCriterion[];
  boundary: Record<string, 'yes' | 'no'>;
}

export interface RehearsalCapturePhase {
  phase: string;
  commandOrArtifact: string;
  requiredConcreteBinding: string;
  stopCondition: string;
}

export interface RehearsalAcceptanceCriterion {
  criterion: string;
  requiredValue: string;
}

export function buildRehearsalCaptureManifest(
  input: RehearsalCaptureManifestInput,
): RehearsalCaptureManifest {
  return {
    title: `Gate 3 Live Rehearsal Capture Manifest - ${sanitize(input.sourceCommit)}`,
    sourceCommit: sanitize(input.sourceCommit),
    prerequisiteMapTarget: sanitize(input.prerequisiteMapTarget),
    operatorPacketTarget: sanitize(input.operatorPacketTarget),
    liveTemplateTarget: sanitize(input.liveTemplateTarget),
    operatorRunbookTarget: sanitize(input.operatorRunbookTarget),
    readinessRequestTarget: input.readinessRequestTarget
      ? sanitize(input.readinessRequestTarget)
      : undefined,
    patchedDevnetGoNoGoJsonTarget: input.patchedDevnetGoNoGoJsonTarget
      ? sanitize(input.patchedDevnetGoNoGoJsonTarget)
      : undefined,
    patchedDevnetGoNoGoValidationTarget: input.patchedDevnetGoNoGoValidationTarget
      ? sanitize(input.patchedDevnetGoNoGoValidationTarget)
      : undefined,
    patchedDevnetGoNoGoVerdict: input.patchedDevnetGoNoGoVerdict
      ? sanitize(input.patchedDevnetGoNoGoVerdict)
      : undefined,
    patchedDevnetGoNoGoValidationMessage: input.patchedDevnetGoNoGoValidationMessage
      ? sanitize(input.patchedDevnetGoNoGoValidationMessage)
      : undefined,
    command: sanitize(input.command),
    prerequisiteResult: extractTableValue(input.prerequisiteMapMarkdown, 'Result') ?? 'unknown',
    prerequisiteStructuralIssues: Number(
      extractTableValue(input.prerequisiteMapMarkdown, 'Structural issues') ?? '0',
    ),
    operatorPacketResult: extractTableValue(input.operatorPacketMarkdown, 'Current result') ?? 'unknown',
    captureSequence: buildCaptureSequence({
      jsonTarget: input.patchedDevnetGoNoGoJsonTarget,
      validationTarget: input.patchedDevnetGoNoGoValidationTarget,
      verdict: input.patchedDevnetGoNoGoVerdict,
    }),
    acceptanceCriteria: buildAcceptanceCriteria(input.patchedDevnetGoNoGoVerdict),
    boundary: {
      'Planning output only': 'yes',
      'Concrete next capture order defined': 'yes',
      'Derived from prerequisite map': 'yes',
      'Derived from operator packet': 'yes',
      'Runtime database opened': 'no',
      'Private deployment state opened': 'no',
      'Secret or environment file read': 'no',
      'Live transaction signing performed': 'no',
      'Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed': 'no',
      'Completed Gate 3 lifecycle evidence claimed': 'no',
      'Release gate PASS claimed': 'no',
      'Production-ready claim allowed': 'no',
      'Testnet production-candidate claim allowed': 'no',
    },
  };
}

export function formatRehearsalCaptureManifestMarkdown(
  report: RehearsalCaptureManifest,
): string {
  const currentInputs: string[][] = [
    ['Input', 'Current target', 'Capture status'],
    ['Source commit', `\`${report.sourceCommit}\``, 'reference only'],
    [
      'Gate 3 prerequisite map',
      report.prerequisiteMapTarget,
      `${report.prerequisiteResult} with ${report.prerequisiteStructuralIssues} structural issues`,
    ],
    ['Gate 3 operator packet', report.operatorPacketTarget, `${report.operatorPacketResult}; planning only`],
    ['Live rehearsal template', report.liveTemplateTarget, 'template only'],
    ['Operator runbook', report.operatorRunbookTarget, 'command route reference'],
  ];
  if (report.readinessRequestTarget) {
    currentInputs.push([
      'Current readiness operator request',
      report.readinessRequestTarget,
      'remaining runtime inputs',
    ]);
  }
  if (report.patchedDevnetGoNoGoJsonTarget) {
    currentInputs.push([
      'Patched-devnet go/no-go JSON',
      report.patchedDevnetGoNoGoJsonTarget,
      `${report.patchedDevnetGoNoGoVerdict ?? 'validated'}; local prereqs only; execution not ready`,
    ]);
  }
  if (report.patchedDevnetGoNoGoValidationTarget) {
    currentInputs.push([
      'Patched-devnet go/no-go validation',
      report.patchedDevnetGoNoGoValidationTarget,
      `${report.patchedDevnetGoNoGoValidationMessage ?? 'PASS; not Gate 3 closure'}; planning only`,
    ]);
  }

  return [
    `# ${escapeMarkdownText(report.title)}`,
    '',
    'This manifest converts the current Gate 3 rehearsal blockers into the next',
    'local-devnet and testnet capture sequence for operators and reviewers.',
    '',
    'It is not completed lifecycle, recovery, approval, submit, confirmation, or',
    'reconciliation evidence. It does not authorize deployment, signing, settlement,',
    'live submit, transaction broadcast, publication, release support, or any',
    'production-ready or testnet production-candidate claim.',
    '',
    '## Command',
    '',
    `\`${escapeMarkdownText(report.command)}\``,
    '',
    '## Current Inputs',
    '',
    markdownTable(currentInputs),
    '',
    '## Capture Sequence',
    '',
    markdownTable([
      ['Phase', 'Command or artifact to produce', 'Required concrete binding', 'Stop condition'],
      ...report.captureSequence.map(row => [
        row.phase,
        row.commandOrArtifact,
        row.requiredConcreteBinding,
        row.stopCondition,
      ]),
    ]),
    '',
    '## Acceptance Criteria Before Any Live Submit',
    '',
    markdownTable([
      ['Criterion', 'Required value'],
      ...report.acceptanceCriteria.map(row => [row.criterion, row.requiredValue]),
    ]),
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

function buildCaptureSequence(
  patchedDevnetGoNoGo?: {
    jsonTarget?: string;
    validationTarget?: string;
    verdict?: string;
  },
): RehearsalCapturePhase[] {
  const goNoGoPhase = patchedDevnetGoNoGo?.jsonTarget
    ? {
        phase: 'Local 1. Patched-devnet go/no-go JSON',
        commandOrArtifact: [
          `Linked current JSON: ${sanitize(patchedDevnetGoNoGo.jsonTarget)}`,
          patchedDevnetGoNoGo.validationTarget
            ? `validated by ${sanitize(patchedDevnetGoNoGo.validationTarget)}`
            : 'validation target not linked',
          'rerun npm run demo:patched-devnet:go-no-go and npm run demo:patched-devnet:go-no-go:validate if operator inputs, node config, runtime state, or funding change',
        ].join('; '),
        requiredConcreteBinding:
          `${sanitize(patchedDevnetGoNoGo.verdict ?? 'validated')} patched-devnet prerequisite report, validation PASS, broadcast disabled, local non-mainnet endpoints classified, runtime-state checks explicitly skipped with execution-not-ready boundary, no secret environment dump`,
        stopCondition:
          'Block controlled execution until the report is rerun for current operator inputs, live local nodes, scoped funding, signer alignment, and runtime-state inspection, and still reports no unsafe broadcast state.',
      }
    : {
        phase: 'Local 1. Patched-devnet go/no-go JSON',
        commandOrArtifact:
          'npm run demo:patched-devnet:go-no-go -- --json-out ../evidence/live-rehearsals/<patched-devnet-go-no-go.json> and npm run demo:patched-devnet:go-no-go:validate -- ../evidence/live-rehearsals/<patched-devnet-go-no-go.json>',
        requiredConcreteBinding:
          'Read-only patched-devnet prerequisite report, broadcast disabled, local non-mainnet endpoints classified, runtime-state checks explicit, no secret environment dump',
        stopCondition:
          'Block if the report is not read-only, uses --include-secret-env, targets public/testnet/mainnet endpoints, skips required runtime-state checks without reviewer rationale, or reports unsafe broadcast state.',
      };

  return [
    goNoGoPhase,
    {
      phase: 'Local 2. Unsigned legacy shape diagnostic',
      commandOrArtifact:
        'npm run settle:aggregate -- prepare-with-ingest <sidechainTxHash> <sidechainHeaderHashHex> <bridgeEventRootHex> <ergoAnchorHeight>',
      requiredConcreteBinding:
        'Deterministic unsigned transaction shape only, with signing, node check, Expected transaction ID, authorization, submit, confirmation, reconciliation, and Gate 3 closure all absent',
      stopCondition:
        'Block if the diagnostic is presented as live lifecycle evidence or used to recreate a legacy V1 signing or transport path.',
    },
    {
      phase: 'Testnet 1. Replacement-profile activation',
      commandOrArtifact:
        'BLOCKED until a separately versioned external-fee profile is reviewed, activated, application-bound, and linked to global DUP cutover lineage',
      requiredConcreteBinding:
        'Activated profile identity, source-finality proof, conservation equation, global replay lineage, and permanent legacy-route retirement',
      stopCondition:
        'Block while any activation, finality, conservation, replay, or route-retirement binding is absent.',
    },
    {
      phase: 'Testnet 2. Replacement-profile target-node acceptance',
      commandOrArtifact:
        'No current command: implement and review a profile-specific no-submit acceptance packet only after replacement-profile activation',
      requiredConcreteBinding:
        'Exact chain-resident setup/admission state, activated profile, application/finality proof, exact transaction identity, stateful node acceptance, and no-broadcast scope',
      stopCondition:
        'Block if a legacy V1 schema, Expected transaction ID, approval, or local status is treated as replacement-profile authority.',
    },
    {
      phase: 'Testnet 3. Future corrected-profile rehearsal tooling',
      commandOrArtifact:
        'No current command: define profile-specific preflight, window, checkpoint, and evidence validators after target-node acceptance exists',
      requiredConcreteBinding:
        'Each future tool must bind the activated profile and exact accepted transaction without inheriting legacy V1 authority semantics',
      stopCondition:
        'Block if tooling can sign, authorize, submit, or broadcast without a separate explicit capability boundary.',
    },
    {
      phase: 'Testnet 4. Historical V1 approval archive',
      commandOrArtifact:
        'Retain and validate already-existing approval files only when proving the provenance of an exact pre-quarantine transaction; no new approval generator exists',
      requiredConcreteBinding:
        'Immutable historical target, exact transaction identity, ordered burn set, original check provenance, non-mainnet context, and pre-quarantine timestamp',
      stopCondition:
        'Block if historical metadata is regenerated, extended, or presented as current authorization.',
    },
    {
      phase: 'Testnet 5. Historical V1 preflight archive',
      commandOrArtifact:
        'Retained pre-quarantine preflight evidence only; no new V1 preflight packet may be generated',
      requiredConcreteBinding:
        'Approval binding, package mode, Expected transaction ID, ordered burn set, deployment-state hash, no-broadcast lines',
      stopCondition:
        'Block if approvals, package mode, burn order, or deployment hash do not match.',
    },
    {
      phase: 'Testnet 6. Historical V1 window archive',
      commandOrArtifact:
        'Retained pre-quarantine window evidence only; it cannot be refreshed into current V1 authority',
      requiredConcreteBinding:
        'Original captured heights, same Expected transaction ID, same burn order, non-mainnet scope, all-false gate boundary, and immutable source target',
      stopCondition:
        'Block if the archived window is refreshed, detached from its original targets, or presented as current authority.',
    },
    {
      phase: 'Testnet 7. Historical V1 checkpoint archive',
      commandOrArtifact:
        'Retained checkpoint evidence only; freshness cannot be extended after legacy V1 retirement',
      requiredConcreteBinding:
        'Original checkpoint, aggregate JSON binding, captured heights, no-broadcast boundary, no Gate 3 closure, and immutable source target',
      stopCondition:
        'Block if node/source provenance is missing, checkpoint identity drifts, freshness is renewed, or any closure/broadcast claim is made.',
    },
    {
      phase: 'Testnet 8. Historical V1 gate archive',
      commandOrArtifact:
        'Retained offline-gate evidence may be inspected for provenance but cannot authorize or reopen V1 settlement',
      requiredConcreteBinding:
        'All offline stages PASS-equivalent, concrete source bindings for doctor, preflight, window-prep, and fresh checkpoint',
      stopCondition:
        'Block if any source target is placeholder, reused ambiguously, or mismatched.',
    },
    {
      phase: 'Testnet 9. Historical V1 bundle archive',
      commandOrArtifact:
        'Retained prep bundles remain archival evidence only and cannot be promoted to a new execution request',
      requiredConcreteBinding:
        'Archived commands, artifact targets, all-false gate boundary, offline-gate source binding, executionStatus QUARANTINED, external-fee profile activation handoff',
      stopCondition:
        'Block if any prepared command is broadcast-capable or if artifact targets drift from prior JSON.',
    },
    {
      phase: 'Testnet 10. Legacy V1 execution quarantine',
      commandOrArtifact: `QUARANTINED: ${LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE}`,
      requiredConcreteBinding:
        'Reviewed separately versioned external-fee profile, exact target-node acceptance, on-chain funds-authority transition, legacy route retirement, replay-lineage cutover',
      stopCondition:
        'Do not sign, submit, or broadcast legacy V1. Approval cannot lift the quarantine.',
    },
  ];
}

function buildAcceptanceCriteria(patchedDevnetGoNoGoVerdict?: string): RehearsalAcceptanceCriterion[] {
  return [
    [
      'Patched-devnet go/no-go JSON exists and validates',
      patchedDevnetGoNoGoVerdict
        ? `${sanitize(patchedDevnetGoNoGoVerdict)} linked; read-only prerequisites only, not live lifecycle closure`
        : 'optional read-only prerequisite evidence only',
    ],
    ['Legacy V1 unsigned diagnostic is non-authoritative', 'yes'],
    ['New legacy V1 check or approval command emitted', 'no'],
    ['Historical V1 evidence accepted as current lifecycle closure', 'no'],
    ['Legacy V1 settlement submission quarantine', 'active; approval cannot lift it'],
    [
      'Separately versioned external-fee profile activation and legacy-route retirement',
      'required before any new live preflight or submit handoff',
    ],
    ['Replacement-profile target-node acceptance', 'required before any new live rehearsal'],
    ['Corrected-profile rehearsal tooling implemented and reviewed', 'required before any new live rehearsal'],
    ['Corrected-profile submit, confirmation, and reconciliation evidence', 'not captured by this manifest'],
  ].map(([criterion, requiredValue]) => ({ criterion, requiredValue }));
}

function extractTableValue(markdown: string, field: string): string | undefined {
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\|\\s*${escapedField}\\s*\\|\\s*([^|]+?)\\s*\\|`, 'im');
  const match = markdown.match(pattern);
  return match?.[1]?.trim();
}

function markdownTable(rows: string[][]): string {
  const [header, ...body] = rows;
  return [
    `| ${header.map(escapeMarkdownCell).join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map(row => `| ${row.map(escapeMarkdownCell).join(' | ')} |`),
  ].join('\n');
}

function escapeMarkdownCell(value: string): string {
  return escapeMarkdownText(value).replace(/\n/g, '<br>').replace(/\|/g, '\\|');
}

function escapeMarkdownText(value: string): string {
  return sanitize(value);
}

function sanitize(value: string): string {
  return sanitizeReportText(value).trim();
}
