import { sanitizeReportText } from './report-text-sanitizer.js';

export interface BenchmarkLiveCaptureManifestInput {
  sourceCommit: string;
  prerequisiteMapTarget: string;
  prerequisiteMapMarkdown: string;
  reviewPacketTarget: string;
  reviewPacketMarkdown: string;
  readinessRequestTarget?: string;
  command: string;
}

export interface BenchmarkLiveCaptureManifest {
  title: string;
  sourceCommit: string;
  prerequisiteMapTarget: string;
  reviewPacketTarget: string;
  readinessRequestTarget?: string;
  command: string;
  candidateTarget: string;
  prerequisiteResult: string;
  prerequisiteStructuralIssues: number;
  liveBatchIssues: number;
  reviewerApprovalIssues: number;
  publicationBoundaryIssues: number;
  captureSequence: BenchmarkLiveCapturePhase[];
  acceptanceCriteria: BenchmarkLiveAcceptanceCriterion[];
  boundary: Record<string, 'yes' | 'no'>;
}

export interface BenchmarkLiveCapturePhase {
  phase: string;
  commandOrArtifact: string;
  requiredConcreteBinding: string;
  stopCondition: string;
}

export interface BenchmarkLiveAcceptanceCriterion {
  criterion: string;
  requiredValue: string;
}

export function buildBenchmarkLiveCaptureManifest(
  input: BenchmarkLiveCaptureManifestInput,
): BenchmarkLiveCaptureManifest {
  return {
    title: `Gate 7 Live Benchmark Capture Manifest - ${sanitize(input.sourceCommit)}`,
    sourceCommit: sanitize(input.sourceCommit),
    prerequisiteMapTarget: sanitize(input.prerequisiteMapTarget),
    reviewPacketTarget: sanitize(input.reviewPacketTarget),
    readinessRequestTarget: input.readinessRequestTarget
      ? sanitize(input.readinessRequestTarget)
      : undefined,
    command: sanitize(input.command),
    candidateTarget: extractTableValue(input.prerequisiteMapMarkdown, 'Candidate target') ?? 'unknown',
    prerequisiteResult: extractTableValue(input.prerequisiteMapMarkdown, 'Result') ?? 'unknown',
    prerequisiteStructuralIssues: numericTableValue(input.prerequisiteMapMarkdown, 'Structural issues'),
    liveBatchIssues: numericTableValue(input.reviewPacketMarkdown, 'Live batch issues'),
    reviewerApprovalIssues: numericTableValue(input.reviewPacketMarkdown, 'Reviewer approval issues'),
    publicationBoundaryIssues: numericTableValue(input.reviewPacketMarkdown, 'Publication-boundary issues'),
    captureSequence: buildCaptureSequence(),
    acceptanceCriteria: buildAcceptanceCriteria(),
    boundary: {
      'Planning output only': 'yes',
      'Concrete next capture order defined': 'yes',
      'Derived from Gate 7 prerequisite map': 'yes',
      'Derived from Gate 7 review packet': 'yes',
      'Runtime database opened': 'no',
      'Private deployment state opened': 'no',
      'Secret or environment file read': 'no',
      'Node or RPC request performed': 'no',
      'Live transaction signing performed': 'no',
      'Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed': 'no',
      'Completed Gate 7 benchmark evidence claimed': 'no',
      'Gate 7 closure claimed': 'no',
      'Release gate PASS claimed': 'no',
      'Production-ready claim allowed': 'no',
      'Production throughput claim allowed': 'no',
      'Mainnet-grade evidence linked': 'no',
    },
  };
}

export function formatBenchmarkLiveCaptureManifestMarkdown(
  report: BenchmarkLiveCaptureManifest,
): string {
  const currentInputs: string[][] = [
    ['Input', 'Current target', 'Capture status'],
    ['Source commit', `\`${report.sourceCommit}\``, 'reference only'],
    ['Gate 7 candidate', report.candidateTarget, 'source evidence candidate'],
    [
      'Gate 7 prerequisite map',
      report.prerequisiteMapTarget,
      `${report.prerequisiteResult} with ${report.prerequisiteStructuralIssues} structural issues`,
    ],
    [
      'Gate 7 review packet',
      report.reviewPacketTarget,
      `${report.liveBatchIssues} live issue, ${report.reviewerApprovalIssues} reviewer approval issues, ${report.publicationBoundaryIssues} publication-boundary issues`,
    ],
  ];
  if (report.readinessRequestTarget) {
    currentInputs.push([
      'Current readiness operator request',
      report.readinessRequestTarget,
      'remaining operator inputs',
    ]);
  }

  return [
    `# ${escapeMarkdownText(report.title)}`,
    '',
    'This manifest records the current Gate 7 live-batch blocker and the',
    'diagnostic work that remains valid while legacy V1 submission is quarantined.',
    '',
    'It is not completed benchmark evidence. It does not authorize live',
    'settlement, transaction signing, submit, broadcast, deployment, publication,',
    'release support, production throughput, production-ready wording, or',
    'mainnet-grade claims.',
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
    '## Acceptance Criteria Before Gate 7 Closure',
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

function buildCaptureSequence(): BenchmarkLiveCapturePhase[] {
  return [
    {
      phase: '1. Bind live-batch identity inputs',
      commandOrArtifact:
        'Operator-selected non-mainnet network, Gate 7 candidate, batch window, ordered burn set, and read-only state/deployed-state input targets',
      requiredConcreteBinding:
        'Network, candidate target, batch window, ordered burn set, sourceBindings.state target class, sourceBindings.deployedState target class, and no submit/broadcast scope',
      stopCondition:
        'Block if identity inputs are generic, targetless, private runtime defaults, secret-bearing, mainnet-scoped, or authorize broader live operation.',
    },
    {
      phase: '2. Unsigned legacy shape diagnostic',
      commandOrArtifact:
        'npm run settle:aggregate -- prepare-batch <sidechainTxHash> <sidechainTxHash> [...]',
      requiredConcreteBinding:
        'Ordered burn set and deterministic unsigned settlement shape with no signature, node check, Expected transaction ID, authority, submit, or broadcast',
      stopCondition:
        'Block if unsigned preparation is presented as target-node acceptance, funds authority, live evidence, or permission to recreate legacy signing.',
    },
    {
      phase: '3. Record the settlement-profile blocker',
      commandOrArtifact:
        'Quarantine record for the legacy V1 fee-from-backing route plus the reviewed activation and legacy-retirement prerequisites for a separately versioned external-fee profile',
      requiredConcreteBinding:
        'Legacy profile identity, conservation defect, disabled daemon/CLI/programmatic routes, replacement profile identity, activation evidence, and legacy-route retirement evidence',
      stopCondition:
        'Block if any approval, Expected transaction ID, local status, or operator packet is presented as authority to re-enable legacy V1.',
    },
    {
      phase: '4. Replacement-profile target-node acceptance',
      commandOrArtifact:
        'BLOCKED until a separately versioned external-fee profile is reviewed, activated, application-bound, and linked to global DUP cutover lineage and exact chain-resident setup/admission state',
      requiredConcreteBinding:
        'Activated profile identity, source-finality proof, conservation equation, replay lineage, target-node stateful acceptance, exact transaction identity, and no-broadcast boundary',
      stopCondition:
        'Block while any profile, finality, conservation, replay, chain-state, or target-node acceptance binding is absent.',
    },
    {
      phase: '5. Future corrected-profile prebroadcast package',
      commandOrArtifact:
        'No current command: define and review a profile-specific package only after replacement-profile activation and target-node acceptance',
      requiredConcreteBinding:
        'Profile-specific validator output and diagnostic report bind the exact activated profile, accepted transaction, network, state, and no-broadcast scope',
      stopCondition:
        'Block if legacy V1 validators or evidence schemas are reused as replacement-profile authority.',
    },
    {
      phase: '6. Verify the quarantine remains active',
      commandOrArtifact:
        'Broadcast-disabled and aggregate-disabled npm run demo:readiness output plus legacy submission boundary tests',
      requiredConcreteBinding:
        'Broadcast disabled, aggregate settlement disabled, legacy V1 startup remains non-live, and every submit facade rejects before state acquisition, signing, or transport',
      stopCondition:
        'Block if any generated packet contains an executable legacy submit command or implies that approval can lift the conservation quarantine.',
    },
    {
      phase: '7. Live submit blocked',
      commandOrArtifact:
        'BLOCKED: no legacy V1 submit command is emitted while miner fees reduce protected backing without an equal sidechain supply reduction',
      requiredConcreteBinding:
        'A reviewed and activated external-fee profile, target-node acceptance, exact funds authority, and permanent retirement of the legacy route',
      stopCondition:
        'Stop unconditionally on legacy V1; explicit approval, broadcast enablement, or a checked Expected transaction ID cannot override this blocker.',
    },
    {
      phase: '8. Historical reconciliation only',
      commandOrArtifact:
        'Read-only confirmation and recovery evidence for an exact transaction proven to have been submitted before the legacy V1 quarantine',
      requiredConcreteBinding:
        'Historical submission provenance, confirmation, finality, settlement output boxes, DUP successor, SPV tracker successor, recipient payout boxes, fee, and failed-event queue status match the same transaction ID',
      stopCondition:
        'Block if the transaction lacks pre-quarantine submission provenance or reconciliation attempts to sign, submit, replace, or authorize funds.',
    },
    {
      phase: '9. Completed benchmark evidence update',
      commandOrArtifact:
        'Keep Gate 7 blocked, record the inactive legacy route, and rerun npm run benchmark:validate -- <completed-benchmark-evidence.md> only after a corrected profile has real live-batch evidence',
      requiredConcreteBinding:
        'Legacy quarantine remains explicit; Open benchmark blockers is non-zero until corrected-profile live evidence exists; production-ready, testnet production-candidate, and production-throughput claims remain no',
      stopCondition:
        'Block if corrected-profile activation, live evidence, or reviewer evidence is absent, or if production/mainnet/throughput claims are broadened.',
    },
  ];
}

function buildAcceptanceCriteria(): BenchmarkLiveAcceptanceCriterion[] {
  return [
    ['Legacy V1 submission quarantine', 'active'],
    ['Legacy V1 unsigned shape diagnostic remains non-authoritative', 'yes'],
    ['Replacement-profile target-node acceptance', 'required before any live benchmark capture'],
    ['Corrected-profile prebroadcast package and validator exist', 'required before any live benchmark capture'],
    ['Separately versioned external-fee profile activated and legacy route retired', 'required before live capture'],
    ['Live submission command available from this manifest', 'no'],
    ['Historical confirmation and reconciliation accepted as new live evidence', 'no'],
    ['Open benchmark blockers', 'at least 1'],
    ['Testnet production-candidate claim allowed', 'no'],
    ['Production-ready claim allowed', 'no'],
    ['Production throughput claim allowed', 'no'],
    ['Mainnet-grade evidence linked', 'no'],
  ].map(([criterion, requiredValue]) => ({ criterion, requiredValue }));
}

function numericTableValue(markdown: string, field: string): number {
  return Number(extractTableValue(markdown, field) ?? '0');
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
