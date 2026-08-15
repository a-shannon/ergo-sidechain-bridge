import type {
  ReadinessRuntimePrereqsReport,
  ReadinessRuntimePrereqsStatus,
  ReadinessRuntimePrereqsTriageTarget,
} from './readiness-runtime-prereqs.js';
import type {
  ReadinessNodePreflightResult,
} from './readiness-node-preflight.js';
import type {
  ReadinessTriageLane,
  ReadinessTriageLocalClosureStatus,
} from './readiness-triage.js';
import { sanitizeReportText } from './report-text-sanitizer.js';

export type ReadinessHandoffStatus = 'ACTION_REQUIRED' | 'PASS_READY';
export type ReadinessHandoffPackageStatus = 'action-required' | 'blocked' | 'complete';

export interface ReadinessHandoffCommandInput {
  runtimePrereqsJson: string;
  out?: string;
  jsonOut?: string;
}

export interface ReadinessHandoffValidationCommandInput {
  handoffJson: string;
  expectedSourceCommit?: string;
  reportOut?: string;
  jsonOut?: string;
}

export interface ReadinessHandoffInput {
  command: string;
  runtimePrereqsReport: ReadinessRuntimePrereqsReport;
  runtimePrereqsSource: {
    mode: 'json';
    target: string;
  };
}

export interface ReadinessHandoffLiveRequest {
  lane: ReadinessTriageLane;
  laneLabel: string;
  issue: string;
}

export interface ReadinessHandoffLocalRequest {
  lane: ReadinessTriageLane;
  laneLabel: string;
  issue: string;
}

export interface ReadinessHandoffReviewerRequest {
  lane: ReadinessTriageLane;
  laneLabel: string;
  issue: string;
}

export interface ReadinessHandoffLanePacket {
  lane: ReadinessTriageLane;
  laneLabel: string;
  issueCount: number;
  evidenceTemplate: string;
  validatorCommand: string;
  releaseGateFlag: string;
  triageTarget?: string;
  currentPrerequisiteMap: string;
  nextOperatorStep: string;
  closureBoundary: string;
  operatorEvidenceInputs?: string[];
  requestedEvidence: string[];
}

export interface ReadinessHandoffWorkPackage {
  name: string;
  status: ReadinessHandoffPackageStatus;
  issueCount: number;
  action: string;
}

export interface ReadinessHandoffReport {
  status: ReadinessHandoffStatus;
  exitCode: number;
  sourceCommit?: string;
  command: string;
  runtimePrereqsSource: {
    mode: 'json';
    target: string;
  };
  runtimePrereqsStatus: ReadinessRuntimePrereqsStatus;
  totalStructuralIssues: number;
  nodeBackedIssueCount: number;
  reviewerOrExternalIssueCount: number;
  claimOrPublicationBoundaryIssueCount: number;
  localEvidenceIssueCount: number;
  localClosureStatus: ReadinessTriageLocalClosureStatus;
  localOnlyClosureIssueCount: number;
  externalOrLiveClosureIssueCount: number;
  manualTriageIssueCount: number;
  localClosureSummary: string;
  triageTargets: ReadinessRuntimePrereqsTriageTarget[];
  nodePreflight: ReadinessNodePreflightResult;
  anchorPreflight?: string;
  nodeEndpoint: string;
  localEvidenceRequests: ReadinessHandoffLocalRequest[];
  liveEvidenceRequests: ReadinessHandoffLiveRequest[];
  reviewerOrExternalRequests: ReadinessHandoffReviewerRequest[];
  lanePackets: ReadinessHandoffLanePacket[];
  workPackages: ReadinessHandoffWorkPackage[];
  nextActions: string[];
  boundary: Record<string, 'yes' | 'no'>;
}

export type ReadinessHandoffValidationStatus = 'PASS' | 'BLOCKED';

export interface ReadinessHandoffValidationInput {
  command: string;
  handoffReport: ReadinessHandoffReport;
  handoffSource: {
    mode: 'json';
    target: string;
  };
  expectedSourceCommit?: string;
}

export interface ReadinessHandoffValidationReport {
  status: ReadinessHandoffValidationStatus;
  exitCode: number;
  command: string;
  sourceCommit?: string;
  expectedSourceCommit?: string;
  handoffSource: {
    mode: 'json';
    target: string;
  };
  localEvidenceRequestCount: number;
  liveEvidenceRequestCount: number;
  reviewerOrExternalRequestCount: number;
  lanePacketCount: number;
  laneCoverageIssueCount: number;
  operatorInputChecklistCount: number;
  operatorEvidenceInputCount: number;
  errors: string[];
  laneSummaries: Array<{
    lane: ReadinessTriageLane;
    laneLabel: string;
    issueCount: number;
    operatorEvidenceInputCount: number;
    evidenceTemplate: string;
    validatorCommand: string;
    releaseGateFlag: string;
  }>;
  boundary: Record<string, 'yes' | 'no'>;
}

const LANE_LABELS: Record<ReadinessTriageLane, string> = {
  'security-review': 'Independent security review',
  'trustless-burn': 'Trustless burn verification',
  'committee-governance': 'Committee governance and key rotation',
  benchmark: 'Benchmark and scaling evidence',
};

const READINESS_LANES: ReadinessTriageLane[] = [
  'security-review',
  'trustless-burn',
  'committee-governance',
  'benchmark',
];

const LANE_PACKET_CONFIG: Record<ReadinessTriageLane, Omit<ReadinessHandoffLanePacket, 'lane' | 'laneLabel' | 'issueCount' | 'requestedEvidence'>> = {
  'security-review': {
    evidenceTemplate: '../docs/independent-security-review-evidence-template.md',
    validatorCommand: 'npm run security:validate -- <completed-independent-security-review.md>',
    releaseGateFlag: '--security-review-evidence <completed-independent-security-review.md>',
    currentPrerequisiteMap: '../evidence/security/gate4-independent-security-review-prerequisite-map-2026-07-09-c6fea203.md',
    nextOperatorStep:
      'Collect the independent reviewer, scope, finding, negative-check, and publication-boundary artifacts, then run the security review validator on the completed evidence document.',
    closureBoundary:
      'Gate 4 remains blocked until a concrete independent review approves the scoped evidence and keeps production-ready, mainnet, publication, deployment, signing, submit, and broadcast boundaries closed.',
    operatorEvidenceInputs: [
      'External reviewer packet: concrete independent reviewer organization or affiliation, organization type, lead reviewer, review period, reviewed commit, release scope, and final decision fields.',
      'Scope and evidence packet: area-specific scope coverage, command evidence, lifecycle, recovery, batch settlement, dependency, Gate 5, Gate 6, Gate 7, and release-note/checklist evidence as applicable.',
      'Finding and negative-check packet: finding-class disposition, accepted-risk disposition, publication blocker closure, and question-specific negative security-review checks.',
      'Boundary confirmation: no audit approval, accepted-risk closure, production-ready claim, publication, deployment, signing, submit, broadcast, runtime DB read, or private deployment-state read from this handoff.',
    ],
  },
  'trustless-burn': {
    evidenceTemplate: '../docs/trustless-burn-verification-evidence-template.md',
    validatorCommand: 'npm run trustless:validate -- <completed-trustless-burn-evidence.md>',
    releaseGateFlag: '--trustless-burn-evidence <completed-trustless-burn-evidence.md>',
    currentPrerequisiteMap: '../evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-07-2401733f.md',
    nextOperatorStep:
      'Use the compact unsigned candidate PASS validation as the source-boundary handoff, then collect the requested non-mainnet proof-acceptance artifacts and run the trustless burn validator on the completed evidence document.',
    closureBoundary:
      'Candidate proof-vector or candidate settlement JSON alone does not close Gate 5; completed protocol evidence plus reviewer sign-off is still required.',
    operatorEvidenceInputs: [
      'Proof-path packet: sidechain commitment, bridgeEventRoot, burnId, burn amount, recipient ErgoTree hash, sidechain transaction and block hashes, event index, duplicate-prevention key, and non-empty inclusion path.',
      'Compact unsigned candidate packet: completed npm run trustless:unsigned-tx JSON at ../evidence/trustless-burn/artifacts/completed-local-trustless-compact-unsigned-tx-2026-07-07-faf05c0b.json plus validation report at ../evidence/trustless-burn/artifacts/completed-local-trustless-compact-unsigned-tx-validation-2026-07-07-faf05c0b.md showing contextExtensionGuard = pass, transactionCheck = no, expectedTxId = no, signing = no, and submit = no. This is terminal legacy V1 diagnostic evidence and cannot be promoted into a signed node-backed packet.',
      'Replacement-profile target-node packet: wait for a separately versioned, reviewed, and activated external-fee profile with application-bound source finality, global DUP cutover lineage, and exact chain-resident setup/admission UTXOs. Only that profile may produce stateful /transactions/check PASS plus exact unsigned/signed transaction identity after explicit non-mainnet local-signing/check approval. Legacy V1 cannot produce this packet; this is not submit, reconciliation, deployment, or broadcast approval.',
      'Anchor observation packet: sanitized public extension-observation JSON plus completed npm run trustless:anchor-observe -- --bridge-event-root <64hex|0401:64hex> --observations-json <sanitized-public-observations.json> --min-height <n> --max-height <n> --json-out <completed-report.json> report target, with the observed 0x0401 bridgeEventRoot bound to the proof-path packet.',
      'SPV tracker observation packet: sanitized public observation JSON plus completed npm run trustless:spv-tracker-observe -- --observation-json <sanitized-public-observation.json> --json-out <completed-report.json> report target, with tracker key, value, and digest matched to the recomputed observation.',
      'Observation reconciliation packet: completed npm run trustless:observation-reconcile -- --anchor-report-json <completed-anchor-observation-report.json> --spv-tracker-report-json <completed-spv-tracker-observation-report.json> --json-out <completed-reconciliation-report.json> target; current command-specific reconciliation at ../evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-09-a21efc0b.md shows the refreshed testnet anchor observation remains BLOCKED after 720 successful extension reads at heights 434811..435530 because no matching 0x0401 bridgeEventRoot was observed, while SPV tracker linked-local prerequisite evidence still matches the bridgeEventRoot without a linked testnet anchor height, so the next packet must produce a LINKED anchor observation and bind one shared bridgeEventRoot and Ergo anchor height across anchor, SPV, proof-vector, and settlement-binding evidence.',
      'Proof-vector validation packet: current local proof-vector report at ../evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-07-07-faf05c0b.json and validation report at ../evidence/trustless-burn/artifacts/completed-local-proof-vector-validation-2026-07-07-faf05c0b.md, plus current SPV-linked candidate at ../evidence/trustless-burn/gate5-trustless-burn-spv-linked-candidate-2026-07-07-faf05c0b.md and compact unsigned transaction validation at ../evidence/trustless-burn/artifacts/completed-local-trustless-compact-unsigned-tx-validation-2026-07-07-faf05c0b.md. Treat them as source-boundary local proof-core evidence only; they do not close Gate 5, prove anchoring or finality, authorize /transactions/check, settlement readiness, signing, submit, or broadcast.',
      'Execution request packet: current non-mainnet execution request at ../evidence/trustless-burn/gate5-trustless-burn-execution-request-2026-07-07-4cb587fc.md plus JSON at ../evidence/trustless-burn/artifacts/gate5-trustless-burn-execution-request-2026-07-07-4cb587fc.json, bound to the 2401733f prerequisite map, 2401733f operator packet, and the refreshed faf05c0b SPV-linked candidate, compact unsigned transaction, instance binding, and instance refresh chain. Treat it as an operator request only; it does not authorize signing, /transactions/check, submit, broadcast, Gate 5 closure, or production claims.',
      'Acceptance-boundary packet: positive proof acceptance evidence plus reviewer notes confirming no Gate 5 closure, no settlement readiness, no broadcast authorization, and no production claim support from local proof-core evidence alone.',
    ],
  },
  'committee-governance': {
    evidenceTemplate: '../docs/committee-governance-evidence-template.md',
    validatorCommand: 'npm run governance:validate -- <completed-committee-governance-evidence.md>',
    releaseGateFlag: '--governance-evidence <completed-committee-governance-evidence.md>',
    currentPrerequisiteMap: '../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-09-57a50625.md',
    nextOperatorStep:
      'Collect the requested key-rotation and network-scope artifacts, then run the governance validator on the completed evidence document.',
    closureBoundary:
      'Do not flip governance-ready or claim/publication fields until completed governance evidence and external review bindings pass validation.',
    operatorEvidenceInputs: [
      'Sanitized deployment-state reconciliation packet: network name or chain id, sidechain id, SCS NFT id, singleton box ids or hashes, governance contract hashes, old and new committee public key or hash identifiers, and npm run governance:reconcile:validate command output with exit code 0.',
      'Wrong-network negative evidence: sanitized rejected or blocked result that names the deployment-state target, expected network, observed mismatched network, stop condition, and npm run governance:reconcile:validate command output with exit code 0 without exposing private deployment-state content.',
      'Boundary confirmation: no .env values, secrets, mnemonics, private DB rows, private deployment-state file dumps, signing, key rotation, state mutation, deploy, submit, or broadcast.',
    ],
  },
  benchmark: {
    evidenceTemplate: '../docs/performance-benchmark-evidence-template.md',
    validatorCommand: 'npm run benchmark:validate -- <completed-benchmark-evidence.md>',
    releaseGateFlag: '--benchmark-evidence <completed-benchmark-evidence.md>',
    currentPrerequisiteMap: '../evidence/benchmarks/gate7-live-benchmark-prerequisite-map-2026-07-09-e91f591c.md',
    nextOperatorStep:
      'Keep Gate 7 blocked while legacy V1 submission is quarantined; next complete the reviewed external-fee profile activation and permanent legacy-route retirement prerequisites before requesting a new live batch capture.',
    closureBoundary:
      'Benchmark data can support bounded scaling claims only after completed command-specific outputs, reviewer sign-off, and claim-boundary rows pass validation.',
    operatorEvidenceInputs: [
      'Legacy V1 quarantine packet: exact fee-from-backing invariant, disabled daemon/CLI/programmatic submit boundaries, and proof that approval, Expected transaction ID, local state, and broadcast settings cannot restore funds authority.',
      'Replacement-profile packet: reviewed external-fee profile identity, target-node acceptance, exact funds-authority transition, conservation evidence, and permanent retirement of every legacy route before any new live batch request.',
      'Metric-boundary packet: positive measurements with units for throughput, latency, build time, proof size, transaction size, inputs, outputs, context-extension Vars, and batch size; no production throughput or mainnet-grade claim approval.',
    ],
  },
};

export function buildReadinessHandoffCommand(input: ReadinessHandoffCommandInput): string {
  const parts = [
    'npm run readiness:handoff --',
    '--runtime-prereqs-json',
    formatReadinessHandoffTargetForCommand(input.runtimePrereqsJson),
  ];
  if (input.out) parts.push('--out <report.md>');
  if (input.jsonOut) parts.push('--json-out <report.json>');
  return parts.join(' ');
}

export function buildReadinessHandoffValidationCommand(input: ReadinessHandoffValidationCommandInput): string {
  const parts = [
    'npm run readiness:handoff:validate --',
    formatReadinessHandoffTargetForCommand(input.handoffJson),
  ];
  if (input.expectedSourceCommit) parts.push('--expected-source-commit', normalizeReadinessSourceCommit(input.expectedSourceCommit));
  if (input.reportOut) parts.push('--report-out <report.md>');
  if (input.jsonOut) parts.push('--json-out <report.json>');
  return parts.join(' ');
}

export function buildReadinessHandoffReport(input: ReadinessHandoffInput): ReadinessHandoffReport {
  const runtimeReport = input.runtimePrereqsReport;
  const triageTargets = sanitizeHandoffTriageTargets(runtimeReport.triageTargets);
  const localEvidenceRequests = runtimeReport.localEvidenceIssues.map(issue => ({
    lane: issue.lane,
    laneLabel: LANE_LABELS[issue.lane],
    issue: sanitizeReadinessHandoffText(issue.issue),
  }));
  const liveEvidenceRequests = runtimeReport.nodeBackedIssues.map(issue => ({
    lane: issue.lane,
    laneLabel: LANE_LABELS[issue.lane],
    issue: sanitizeReadinessHandoffText(issue.issue),
  }));
  const reviewerOrExternalRequests = (runtimeReport.reviewerOrExternalIssues ?? []).map(issue => ({
    lane: issue.lane,
    laneLabel: LANE_LABELS[issue.lane],
    issue: sanitizeReadinessHandoffText(issue.issue),
  }));
  const status = classifyHandoffStatus(runtimeReport);

  return {
    status,
    exitCode: 0,
    ...(runtimeReport.sourceCommit ? { sourceCommit: normalizeReadinessSourceCommit(runtimeReport.sourceCommit) } : {}),
    command: sanitizeReadinessHandoffText(input.command),
    runtimePrereqsSource: {
      mode: 'json',
      target: formatReadinessHandoffTargetForCommand(input.runtimePrereqsSource.target),
    },
    runtimePrereqsStatus: runtimeReport.status,
    totalStructuralIssues: runtimeReport.totalStructuralIssues,
    nodeBackedIssueCount: runtimeReport.nodeBackedIssueCount,
    reviewerOrExternalIssueCount: runtimeReport.reviewerOrExternalIssueCount,
    claimOrPublicationBoundaryIssueCount: runtimeReport.claimOrPublicationBoundaryIssueCount,
    localEvidenceIssueCount: runtimeReport.localEvidenceIssueCount,
    localClosureStatus: runtimeReport.localClosureStatus,
    localOnlyClosureIssueCount: runtimeReport.localOnlyClosureIssueCount,
    externalOrLiveClosureIssueCount: runtimeReport.externalOrLiveClosureIssueCount,
    manualTriageIssueCount: runtimeReport.manualTriageIssueCount,
    localClosureSummary: sanitizeReadinessHandoffText(runtimeReport.localClosureSummary),
    triageTargets,
    nodePreflight: runtimeReport.nodePreflight,
    ...(runtimeReport.anchorPreflight ? { anchorPreflight: runtimeReport.anchorPreflight } : {}),
    nodeEndpoint: sanitizeReadinessHandoffText(runtimeReport.nodeEndpoint),
    localEvidenceRequests,
    liveEvidenceRequests,
    reviewerOrExternalRequests,
    lanePackets: buildLanePackets([...localEvidenceRequests, ...liveEvidenceRequests, ...reviewerOrExternalRequests], triageTargets),
    workPackages: buildWorkPackages(runtimeReport),
    nextActions: buildNextActions(runtimeReport),
    boundary: buildHandoffBoundary(runtimeReport),
  };
}

export function buildReadinessHandoffValidationReport(
  input: ReadinessHandoffValidationInput,
): ReadinessHandoffValidationReport {
  const errors = validateReadinessHandoffReportJson(input.handoffReport);
  const sourceCommit = typeof input.handoffReport.sourceCommit === 'string'
    ? normalizeReadinessSourceCommit(input.handoffReport.sourceCommit)
    : undefined;
  const expectedSourceCommit = input.expectedSourceCommit
    ? normalizeReadinessSourceCommit(input.expectedSourceCommit)
    : undefined;
  if (expectedSourceCommit && sourceCommit !== expectedSourceCommit) {
    errors.push(sourceCommit
      ? `--expected-source-commit must match handoff sourceCommit ${sourceCommit}`
      : '--expected-source-commit requires handoff sourceCommit to be present');
  }
  const liveEvidenceRequests = Array.isArray(input.handoffReport.liveEvidenceRequests)
    ? input.handoffReport.liveEvidenceRequests
    : [];
  const localEvidenceRequests = Array.isArray(input.handoffReport.localEvidenceRequests)
    ? input.handoffReport.localEvidenceRequests
    : [];
  const reviewerOrExternalRequests = Array.isArray(input.handoffReport.reviewerOrExternalRequests)
    ? input.handoffReport.reviewerOrExternalRequests
    : [];
  const lanePackets = Array.isArray(input.handoffReport.lanePackets)
    ? input.handoffReport.lanePackets
    : [];
  const laneSummaries = lanePackets.flatMap(packet => {
    if (!isRecord(packet) || typeof packet.lane !== 'string' || !isReadinessLane(packet.lane)) {
      return [];
    }
    const config = LANE_PACKET_CONFIG[packet.lane];
    return [{
      lane: packet.lane,
      laneLabel: sanitizeReadinessHandoffText(stringOrFallback(packet.laneLabel, LANE_LABELS[packet.lane])),
      issueCount: nonNegativeIntegerOrZero(packet.issueCount),
      operatorEvidenceInputCount: Array.isArray(packet.operatorEvidenceInputs)
        ? packet.operatorEvidenceInputs.length
        : 0,
      evidenceTemplate: sanitizeReadinessHandoffText(stringOrFallback(packet.evidenceTemplate, config.evidenceTemplate)),
      validatorCommand: sanitizeReadinessHandoffText(stringOrFallback(packet.validatorCommand, config.validatorCommand)),
      releaseGateFlag: sanitizeReadinessHandoffText(stringOrFallback(packet.releaseGateFlag, config.releaseGateFlag)),
    }];
  });
  const status: ReadinessHandoffValidationStatus = errors.length === 0 ? 'PASS' : 'BLOCKED';

  return {
    status,
    exitCode: status === 'PASS' ? 0 : 1,
    command: sanitizeReadinessHandoffText(input.command),
    ...(sourceCommit ? { sourceCommit } : {}),
    ...(expectedSourceCommit ? { expectedSourceCommit } : {}),
    handoffSource: {
      mode: 'json',
      target: formatReadinessHandoffTargetForCommand(input.handoffSource.target),
    },
    localEvidenceRequestCount: localEvidenceRequests.length,
    liveEvidenceRequestCount: liveEvidenceRequests.length,
    reviewerOrExternalRequestCount: reviewerOrExternalRequests.length,
    lanePacketCount: lanePackets.length,
    laneCoverageIssueCount: lanePackets.reduce(
      (total, packet) => total + (isRecord(packet) ? nonNegativeIntegerOrZero(packet.issueCount) : 0),
      0,
    ),
    operatorInputChecklistCount: laneSummaries.filter(summary => summary.operatorEvidenceInputCount > 0).length,
    operatorEvidenceInputCount: laneSummaries.reduce(
      (total, summary) => total + summary.operatorEvidenceInputCount,
      0,
    ),
    errors,
    laneSummaries,
    boundary: buildHandoffValidationBoundary(input.handoffReport),
  };
}

export function formatReadinessHandoffReportMarkdown(report: ReadinessHandoffReport): string {
  const localRows = report.localEvidenceRequests.length > 0
    ? [
        '| Area | Required local evidence |',
        '|---|---|',
        ...report.localEvidenceRequests.map(request =>
          `| ${formatMarkdownCell(request.laneLabel)} | ${formatMarkdownCell(request.issue)} |`,
        ),
      ]
    : ['- No local evidence requests were carried into this handoff.'];
  const liveRows = report.liveEvidenceRequests.length > 0
    ? [
        '| Area | Required evidence |',
        '|---|---|',
        ...report.liveEvidenceRequests.map(request =>
          `| ${formatMarkdownCell(request.laneLabel)} | ${formatMarkdownCell(request.issue)} |`,
        ),
      ]
    : ['- No node-backed or live-drill requests were carried into this handoff.'];
  const reviewerRows = report.reviewerOrExternalRequests.length > 0
    ? [
        '| Area | Required decision/evidence |',
        '|---|---|',
        ...report.reviewerOrExternalRequests.map(request =>
          `| ${formatMarkdownCell(request.laneLabel)} | ${formatMarkdownCell(request.issue)} |`,
        ),
      ]
    : ['- No reviewer or external-decision requests were carried into this handoff.'];
  const packageRows = report.workPackages.map(workPackage =>
    `| ${formatMarkdownCell(workPackage.name)} | ${workPackage.status} | ${workPackage.issueCount} | ${formatMarkdownCell(workPackage.action)} |`,
  );
  const lanePacketRows = report.lanePackets.length > 0
    ? report.lanePackets.map(packet =>
        `| ${formatMarkdownCell(packet.laneLabel)} | ${packet.issueCount} | ${formatMarkdownCell(packet.evidenceTemplate)} | ${formatMarkdownCell(packet.validatorCommand)} | ${formatMarkdownCell(packet.releaseGateFlag)} |`,
      )
    : ['| No lane packet | 0 | not required | not required | not required |'];
  const lanePacketDetailRows = report.lanePackets.length > 0
    ? report.lanePackets.flatMap(packet => {
        const operatorEvidenceInputRows = packet.operatorEvidenceInputs && packet.operatorEvidenceInputs.length > 0
          ? [
              '- Operator evidence inputs:',
              ...packet.operatorEvidenceInputs.map(input => `  - ${sanitizeReadinessHandoffText(input)}`),
            ]
          : [];
        return [
          `### ${sanitizeReadinessHandoffText(packet.laneLabel)}`,
          '',
          `- Triage target: ${sanitizeReadinessHandoffText(packet.triageTarget ?? packet.currentPrerequisiteMap)}`,
          `- Current prerequisite map: ${sanitizeReadinessHandoffText(packet.currentPrerequisiteMap)}`,
          `- Next operator step: ${sanitizeReadinessHandoffText(packet.nextOperatorStep)}`,
          `- Closure boundary: ${sanitizeReadinessHandoffText(packet.closureBoundary)}`,
          ...operatorEvidenceInputRows,
          '- Requested evidence:',
          ...packet.requestedEvidence.map(issue => `  - ${sanitizeReadinessHandoffText(issue)}`),
          '',
        ];
      })
    : ['No lane-specific runtime evidence packets are required by this handoff.', ''];
  const nextActionRows = report.nextActions.length > 0
    ? report.nextActions.map(action => `- ${sanitizeReadinessHandoffText(action)}`)
    : ['- No handoff action remains from this report.'];
  const boundaryRows = Object.entries(report.boundary).map(
    ([field, value]) => `| ${formatMarkdownCell(field)} | ${value} |`,
  );

  return [
    '# Bridge Readiness External Handoff',
    '',
    'This report turns the current readiness prerequisite result into concrete work packets for local operators and external reviewers.',
    'It is planning output only and does not close release evidence, authorize claims, deploy, sign, submit, or broadcast transactions.',
    '',
    '## Summary',
    '',
    '| Field | Value |',
    '|---|---|',
    `| Command | ${formatMarkdownCell(report.command)} |`,
    `| Handoff result | ${report.status} |`,
    ...(report.sourceCommit ? [`| Source commit | ${formatMarkdownCell(report.sourceCommit)} |`] : []),
    `| Runtime prerequisite result | ${report.runtimePrereqsStatus} |`,
    `| Runtime prerequisite source | ${formatMarkdownCell(report.runtimePrereqsSource.target)} |`,
    `| Total unresolved structural issues | ${report.totalStructuralIssues} |`,
    `| Local-only issues | ${report.localOnlyClosureIssueCount} |`,
    `| Node-backed/live-drill issues | ${report.nodeBackedIssueCount} |`,
    `| Reviewer/external issues | ${report.reviewerOrExternalIssueCount} |`,
    `| Claim/publication-boundary issues | ${report.claimOrPublicationBoundaryIssueCount} |`,
    `| Manual triage issues | ${report.manualTriageIssueCount} |`,
    `| Local closure status | ${formatLocalClosureStatus(report.localClosureStatus)} |`,
    `| Node preflight | ${report.nodePreflight} |`,
    `| Anchor preflight | ${report.anchorPreflight ?? 'not provided'} |`,
    `| Node endpoint | ${formatMarkdownCell(report.nodeEndpoint)} |`,
    `| Local closure summary | ${formatMarkdownCell(report.localClosureSummary)} |`,
    `| Local evidence requests | ${report.localEvidenceRequests.length} |`,
    `| Live evidence requests | ${report.liveEvidenceRequests.length} |`,
    `| Reviewer/external requests | ${report.reviewerOrExternalRequests.length} |`,
    '',
    '## Work Packages',
    '',
    '| Work package | Status | Issues | Action |',
    '|---|---:|---:|---|',
    ...packageRows,
    '',
    '## Local Evidence Requests',
    '',
    ...localRows,
    '',
    '## Node-Backed And Live Evidence Requests',
    '',
    ...liveRows,
    '',
    '## Reviewer/External Decision Requests',
    '',
    ...reviewerRows,
    '',
    '## Lane Packets',
    '',
    '| Lane | Requests | Template | Validator command | Release-gate flag |',
    '|---|---:|---|---|---|',
    ...lanePacketRows,
    '',
    '## Lane Packet Details',
    '',
    ...lanePacketDetailRows,
    '## Next Actions',
    '',
    ...nextActionRows,
    '',
    '## Boundary',
    '',
    '| Boundary | Value |',
    '|---|---|',
    ...boundaryRows,
    '',
  ].join('\n');
}

export function formatReadinessHandoffValidationReportMarkdown(
  report: ReadinessHandoffValidationReport,
): string {
  const laneRows = report.laneSummaries.length > 0
    ? report.laneSummaries.map(summary =>
        `| ${formatMarkdownCell(summary.laneLabel)} | ${summary.issueCount} | ${summary.operatorEvidenceInputCount} | ${formatMarkdownCell(summary.evidenceTemplate)} | ${formatMarkdownCell(summary.validatorCommand)} | ${formatMarkdownCell(summary.releaseGateFlag)} |`,
      )
    : ['| No lane packet | 0 | 0 | not required | not required | not required |'];
  const errorRows = report.errors.length > 0
    ? report.errors.map(error => `- ${sanitizeReadinessHandoffText(error)}`)
    : ['- None.'];
  const boundaryRows = Object.entries(report.boundary).map(
    ([field, value]) => `| ${formatMarkdownCell(field)} | ${value} |`,
  );

  return [
    '# Bridge Readiness Handoff Validation',
    '',
    'This report validates a generated readiness handoff JSON artifact without closing evidence rows or authorizing claims.',
    '',
    '## Summary',
    '',
    '| Field | Value |',
    '|---|---|',
    `| Command | ${formatMarkdownCell(report.command)} |`,
    `| Result | ${report.status} |`,
    `| Exit code | ${report.exitCode} |`,
    ...(report.sourceCommit ? [`| Source commit | ${formatMarkdownCell(report.sourceCommit)} |`] : []),
    ...(report.expectedSourceCommit ? [`| Expected source commit | ${formatMarkdownCell(report.expectedSourceCommit)} |`] : []),
    `| Handoff source | ${formatMarkdownCell(report.handoffSource.target)} |`,
    `| Local evidence requests | ${report.localEvidenceRequestCount} |`,
    `| Live evidence requests | ${report.liveEvidenceRequestCount} |`,
    `| Reviewer/external requests | ${report.reviewerOrExternalRequestCount} |`,
    `| Lane packets | ${report.lanePacketCount} |`,
    `| Lane packet covered requests | ${report.laneCoverageIssueCount} |`,
    `| Operator input checklists | ${report.operatorInputChecklistCount} |`,
    `| Operator evidence inputs | ${report.operatorEvidenceInputCount} |`,
    `| Structural issues | ${report.errors.length} |`,
    '',
    '## Lane Coverage',
    '',
    '| Lane | Requests | Operator inputs | Template | Validator command | Release-gate flag |',
    '|---|---:|---:|---|---|---|',
    ...laneRows,
    '',
    '## Structural Issues',
    '',
    ...errorRows,
    '',
    '## Boundary',
    '',
    '| Boundary | Value |',
    '|---|---|',
    ...boundaryRows,
    '',
  ].join('\n');
}

export function validateReadinessRuntimePrereqsJson(value: unknown, optionName = '--runtime-prereqs-json'): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return [`${optionName} report must be a JSON object`];

  requireEnum(value.status, ['PASS', 'READY', 'BLOCKED'], `${optionName} report.status`, errors);
  requireSafeInteger(value.exitCode, `${optionName} report.exitCode`, errors);
  requireOptionalGitCommit(value.sourceCommit, `${optionName} report.sourceCommit`, errors);
  requireString(value.command, `${optionName} report.command`, errors);
  requireNonNegativeSafeInteger(value.totalStructuralIssues, `${optionName} report.totalStructuralIssues`, errors);
  requireNonNegativeSafeInteger(value.nodeBackedIssueCount, `${optionName} report.nodeBackedIssueCount`, errors);
  requireNonNegativeSafeInteger(
    value.reviewerOrExternalIssueCount,
    `${optionName} report.reviewerOrExternalIssueCount`,
    errors,
  );
  requireNonNegativeSafeInteger(
    value.claimOrPublicationBoundaryIssueCount,
    `${optionName} report.claimOrPublicationBoundaryIssueCount`,
    errors,
  );
  requireNonNegativeSafeInteger(value.localEvidenceIssueCount, `${optionName} report.localEvidenceIssueCount`, errors);
  requireEnum(
    value.localClosureStatus,
    ['complete', 'local-evidence-work-available', 'external-or-live-required', 'manual-triage-required'],
    `${optionName} report.localClosureStatus`,
    errors,
  );
  requireNonNegativeSafeInteger(value.localOnlyClosureIssueCount, `${optionName} report.localOnlyClosureIssueCount`, errors);
  requireNonNegativeSafeInteger(
    value.externalOrLiveClosureIssueCount,
    `${optionName} report.externalOrLiveClosureIssueCount`,
    errors,
  );
  requireNonNegativeSafeInteger(value.manualTriageIssueCount, `${optionName} report.manualTriageIssueCount`, errors);
  requireString(value.localClosureSummary, `${optionName} report.localClosureSummary`, errors);
  validateSource(value.triageSource, `${optionName} report.triageSource`, errors);
  validateSource(value.nodePreflightSource, `${optionName} report.nodePreflightSource`, errors);
  if (value.anchorPreflightSource !== undefined) {
    validateSource(value.anchorPreflightSource, `${optionName} report.anchorPreflightSource`, errors);
  }
  requireEnum(value.nodePreflight, ['PASS', 'BLOCKED'], `${optionName} report.nodePreflight`, errors);
  if (value.anchorPreflight !== undefined) {
    requireEnum(value.anchorPreflight, ['PASS', 'WARN', 'FAIL'], `${optionName} report.anchorPreflight`, errors);
  }
  requireString(value.nodeEndpoint, `${optionName} report.nodeEndpoint`, errors);
  validateRuntimePrereqsTriageTargets(value.triageTargets, `${optionName} report.triageTargets`, errors);
  validateLocalEvidenceIssues(value.localEvidenceIssues, value.localEvidenceIssueCount, optionName, errors);
  validateNodeBackedIssues(value.nodeBackedIssues, value.nodeBackedIssueCount, optionName, errors);
  validateReviewerOrExternalIssues(
    value.reviewerOrExternalIssues,
    value.reviewerOrExternalIssueCount,
    optionName,
    errors,
  );
  requireStringArray(value.nextActions, `${optionName} report.nextActions`, errors);

  if (!isRecord(value.boundary)) {
    errors.push(`${optionName} report.boundary must be an object`);
  } else {
    for (const [field, boundaryValue] of Object.entries(value.boundary)) {
      if (boundaryValue !== 'yes' && boundaryValue !== 'no') {
        errors.push(`${optionName} report.boundary.${field} must be yes or no`);
      }
    }
    requireBoundaryNo(value.boundary, 'Claim/publication fields unlocked', errors, optionName);
    requireBoundaryNo(value.boundary, 'Runtime database opened', errors, optionName);
    requireBoundaryNo(value.boundary, 'Deployment state opened', errors, optionName);
    requireBoundaryNo(value.boundary, 'Private key material serialized', errors, optionName);
    requireBoundaryNo(value.boundary, 'Anchor evidence row closure claimed', errors, optionName);
    requireBoundaryNo(value.boundary, 'Evidence row closure claimed', errors, optionName);
    requireBoundaryNo(value.boundary, 'Release gate PASS claimed', errors, optionName);
    requireBoundaryNo(value.boundary, 'Public claim authorization granted', errors, optionName);
    requireBoundaryNo(
      value.boundary,
      'Transaction broadcast, submit, deploy, key rotation, or state mutation performed',
      errors,
      optionName,
    );
  }

  return errors;
}

export function validateReadinessHandoffReportJson(value: unknown, optionName = '--handoff-json'): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return [`${optionName} report must be a JSON object`];

  requireEnum(value.status, ['ACTION_REQUIRED', 'PASS_READY'], `${optionName} report.status`, errors);
  requireSafeInteger(value.exitCode, `${optionName} report.exitCode`, errors);
  requireOptionalGitCommit(value.sourceCommit, `${optionName} report.sourceCommit`, errors);
  requireString(value.command, `${optionName} report.command`, errors);
  validateSource(value.runtimePrereqsSource, `${optionName} report.runtimePrereqsSource`, errors);
  requireEnum(value.runtimePrereqsStatus, ['PASS', 'READY', 'BLOCKED'], `${optionName} report.runtimePrereqsStatus`, errors);
  requireNonNegativeSafeInteger(value.totalStructuralIssues, `${optionName} report.totalStructuralIssues`, errors);
  requireNonNegativeSafeInteger(value.nodeBackedIssueCount, `${optionName} report.nodeBackedIssueCount`, errors);
  requireNonNegativeSafeInteger(
    value.reviewerOrExternalIssueCount,
    `${optionName} report.reviewerOrExternalIssueCount`,
    errors,
  );
  requireNonNegativeSafeInteger(
    value.claimOrPublicationBoundaryIssueCount,
    `${optionName} report.claimOrPublicationBoundaryIssueCount`,
    errors,
  );
  requireNonNegativeSafeInteger(value.localEvidenceIssueCount, `${optionName} report.localEvidenceIssueCount`, errors);
  requireNonNegativeSafeInteger(value.localOnlyClosureIssueCount, `${optionName} report.localOnlyClosureIssueCount`, errors);
  requireNonNegativeSafeInteger(
    value.externalOrLiveClosureIssueCount,
    `${optionName} report.externalOrLiveClosureIssueCount`,
    errors,
  );
  requireNonNegativeSafeInteger(value.manualTriageIssueCount, `${optionName} report.manualTriageIssueCount`, errors);
  requireEnum(
    value.localClosureStatus,
    ['complete', 'local-evidence-work-available', 'external-or-live-required', 'manual-triage-required'],
    `${optionName} report.localClosureStatus`,
    errors,
  );
  requireString(value.localClosureSummary, `${optionName} report.localClosureSummary`, errors);
  requireEnum(value.nodePreflight, ['PASS', 'BLOCKED'], `${optionName} report.nodePreflight`, errors);
  if (value.anchorPreflight !== undefined) {
    requireEnum(value.anchorPreflight, ['PASS', 'WARN', 'FAIL'], `${optionName} report.anchorPreflight`, errors);
  }
  requireString(value.nodeEndpoint, `${optionName} report.nodeEndpoint`, errors);
  validateOptionalHandoffTriageTargets(value.triageTargets, `${optionName} report.triageTargets`, errors);
  validateHandoffLocalRequests(value.localEvidenceRequests, value.localEvidenceIssueCount, optionName, errors);
  validateHandoffLiveRequests(value.liveEvidenceRequests, value.nodeBackedIssueCount, optionName, errors);
  validateHandoffReviewerRequests(
    value.reviewerOrExternalRequests,
    value.reviewerOrExternalIssueCount,
    optionName,
    errors,
  );
  validateHandoffLanePackets(
    value.lanePackets,
    value.localEvidenceRequests,
    value.liveEvidenceRequests,
    value.reviewerOrExternalRequests,
    value.triageTargets,
    optionName,
    errors,
  );
  validateHandoffWorkPackages(value.workPackages, optionName, errors);
  requireStringArray(value.nextActions, `${optionName} report.nextActions`, errors);
  validateHandoffBoundary(value.boundary, optionName, errors);

  return errors;
}

function classifyHandoffStatus(report: ReadinessRuntimePrereqsReport): ReadinessHandoffStatus {
  return report.status === 'PASS' && report.totalStructuralIssues === 0 ? 'PASS_READY' : 'ACTION_REQUIRED';
}

function buildLanePackets(
  handoffRequests: Array<ReadinessHandoffLocalRequest | ReadinessHandoffLiveRequest | ReadinessHandoffReviewerRequest>,
  triageTargets: ReadinessRuntimePrereqsTriageTarget[],
): ReadinessHandoffLanePacket[] {
  const packets: ReadinessHandoffLanePacket[] = [];
  const prerequisiteMapByLane = buildTriageTargetMap(triageTargets);
  const requestLanes = handoffRequests
    .map(request => request.lane)
    .filter((lane, index, lanes) => lanes.indexOf(lane) === index);
  for (const lane of requestLanes) {
    const requests = handoffRequests.filter(request => request.lane === lane);
    if (requests.length === 0) continue;

    const config = LANE_PACKET_CONFIG[lane];
    const triageTarget = prerequisiteMapByLane.get(lane) ?? config.currentPrerequisiteMap;
    const packet: ReadinessHandoffLanePacket = {
      lane,
      laneLabel: LANE_LABELS[lane],
      issueCount: requests.length,
      evidenceTemplate: sanitizeReadinessHandoffText(config.evidenceTemplate),
      validatorCommand: sanitizeReadinessHandoffText(config.validatorCommand),
      releaseGateFlag: sanitizeReadinessHandoffText(config.releaseGateFlag),
      triageTarget: sanitizeReadinessHandoffText(triageTarget),
      currentPrerequisiteMap: sanitizeReadinessHandoffText(config.currentPrerequisiteMap),
      nextOperatorStep: sanitizeReadinessHandoffText(config.nextOperatorStep),
      closureBoundary: sanitizeReadinessHandoffText(config.closureBoundary),
      requestedEvidence: requests.map(request => sanitizeReadinessHandoffText(request.issue)),
    };
    if (config.operatorEvidenceInputs) {
      packet.operatorEvidenceInputs = config.operatorEvidenceInputs.map(input => sanitizeReadinessHandoffText(input));
    }
    packets.push(packet);
  }
  return packets;
}

function sanitizeHandoffTriageTargets(
  triageTargets: ReadinessRuntimePrereqsTriageTarget[] | undefined,
): ReadinessRuntimePrereqsTriageTarget[] {
  if (!Array.isArray(triageTargets)) return [];
  const seen = new Set<ReadinessTriageLane>();
  const sanitized: ReadinessRuntimePrereqsTriageTarget[] = [];
  for (const target of triageTargets) {
    if (!target || !isReadinessLane(target.lane) || typeof target.target !== 'string') continue;
    if (seen.has(target.lane)) continue;
    seen.add(target.lane);
    sanitized.push({
      lane: target.lane,
      target: formatReadinessHandoffTargetForCommand(target.target),
    });
  }
  return sanitized;
}

function buildTriageTargetMap(
  triageTargets: ReadinessRuntimePrereqsTriageTarget[] | unknown,
): Map<ReadinessTriageLane, string> {
  const map = new Map<ReadinessTriageLane, string>();
  if (!Array.isArray(triageTargets)) return map;
  for (const target of triageTargets) {
    if (!isRecord(target) || typeof target.lane !== 'string' || !isReadinessLane(target.lane)) continue;
    if (typeof target.target !== 'string') continue;
    if (!map.has(target.lane)) map.set(target.lane, formatReadinessHandoffTargetForCommand(target.target));
  }
  return map;
}

function buildWorkPackages(report: ReadinessRuntimePrereqsReport): ReadinessHandoffWorkPackage[] {
  const packages: ReadinessHandoffWorkPackage[] = [
    {
      name: 'Local evidence cleanup',
      status: report.localOnlyClosureIssueCount > 0 ? 'action-required' : 'complete',
      issueCount: report.localOnlyClosureIssueCount,
      action: report.localOnlyClosureIssueCount > 0
        ? 'Resolve local-only evidence and target-access blockers before routing external work.'
        : 'No local-only closure candidates remain in the current triage.',
    },
    {
      name: 'Non-mainnet or live drill evidence',
      status: report.nodeBackedIssueCount > 0 && report.nodePreflight === 'BLOCKED' ? 'blocked' : packageStatus(report.nodeBackedIssueCount),
      issueCount: report.nodeBackedIssueCount,
      action: report.nodeBackedIssueCount > 0
        ? `Collect concrete node-backed or live-drill evidence for ${formatLaneList(report.nodeBackedIssues.map(issue => issue.lane))}.`
        : 'No node-backed or live-drill evidence requests remain in this report.',
    },
    {
      name: 'Reviewer or external decisions',
      status: packageStatus(report.reviewerOrExternalIssueCount),
      issueCount: report.reviewerOrExternalIssueCount,
      action: report.reviewerOrExternalIssueCount > 0
        ? 'Prepare reviewer packets and external decision material after the runtime evidence is concrete.'
        : 'No reviewer or external decision blockers remain in this report.',
    },
    {
      name: 'Claim and publication boundary',
      status: report.claimOrPublicationBoundaryIssueCount > 0 ? 'blocked' : 'complete',
      issueCount: report.claimOrPublicationBoundaryIssueCount,
      action: report.claimOrPublicationBoundaryIssueCount > 0
        ? 'Keep claim and publication fields blocked until runtime evidence and reviewer decisions resolve.'
        : 'No claim or publication boundary blockers remain in this report.',
    },
  ];

  return packages.map((workPackage): ReadinessHandoffWorkPackage => ({
    ...workPackage,
    action: sanitizeReadinessHandoffText(workPackage.action),
  }));
}

function buildNextActions(report: ReadinessRuntimePrereqsReport): string[] {
  const actions: string[] = [];

  if (report.localOnlyClosureIssueCount > 0) {
    actions.push('Resolve local-only evidence blockers first, then rerun npm run readiness:triage -- and npm run readiness:runtime-prereqs --.');
  }
  if (report.nodeBackedIssueCount > 0 && report.nodePreflight === 'BLOCKED') {
    actions.push(
      `Start or configure a non-mainnet Ergo node at ${report.nodeEndpoint}, rerun npm run readiness:node-preflight --, then collect the listed runtime evidence.`,
    );
  } else if (report.nodeBackedIssueCount > 0) {
    actions.push(`Collect node-backed or live-drill evidence for ${formatLaneList(report.nodeBackedIssues.map(issue => issue.lane))}.`);
  }
  if (report.reviewerOrExternalIssueCount > 0) {
    actions.push('Route reviewer and external blockers into human review packets with concrete evidence targets.');
  }
  if (report.claimOrPublicationBoundaryIssueCount > 0) {
    actions.push('Keep claim and publication fields blocked until runtime evidence plus reviewer or external decisions are resolved.');
  }
  if (actions.length === 0) {
    actions.push('No handoff actions remain in the runtime prerequisite report.');
  }

  return actions.map(sanitizeReadinessHandoffText);
}

function buildHandoffBoundary(report: ReadinessRuntimePrereqsReport): Record<string, 'yes' | 'no'> {
  return {
    'Planning output only': 'yes',
    'Runtime prerequisites JSON reused': 'yes',
    'Readiness triage JSON reused': report.boundary['Readiness triage JSON reused'] ?? 'no',
    'Node preflight JSON reused': report.boundary['Node preflight JSON reused'] ?? 'no',
    'Anchor preflight JSON reused': report.boundary['Anchor preflight JSON reused'] ?? 'no',
    'Live node probe executed by handoff command': 'no',
    'ERGO_API_KEY read': 'no',
    'Auth header sent': 'no',
    'Runtime database opened': 'no',
    'Deployment state opened': 'no',
    'Private key material serialized': 'no',
    'Evidence row closure claimed': 'no',
    'Release gate PASS claimed': 'no',
    'Public claim authorization granted': 'no',
    'Claim/publication fields unlocked': 'no',
    'Transaction broadcast, submit, deploy, key rotation, or state mutation performed': 'no',
  };
}

function buildHandoffValidationBoundary(report: ReadinessHandoffReport): Record<string, 'yes' | 'no'> {
  const boundary = isRecord(report.boundary) ? report.boundary : {};
  return {
    'Planning output only': 'yes',
    'Handoff JSON reused': 'yes',
    'Runtime prerequisites JSON reused': yesNoOrNo(boundary['Runtime prerequisites JSON reused']),
    'Live node probe executed by handoff validation': 'no',
    'ERGO_API_KEY read': 'no',
    'Auth header sent': 'no',
    'Runtime database opened': 'no',
    'Deployment state opened': 'no',
    'Private key material serialized': 'no',
    'Evidence row closure claimed': 'no',
    'Release gate PASS claimed': 'no',
    'Public claim authorization granted': 'no',
    'Claim/publication fields unlocked': 'no',
    'Transaction broadcast, submit, deploy, key rotation, or state mutation performed': 'no',
  };
}

function packageStatus(issueCount: number): ReadinessHandoffPackageStatus {
  return issueCount > 0 ? 'action-required' : 'complete';
}

function formatLaneList(lanes: ReadinessTriageLane[]): string {
  const labels = [...new Set(lanes)].map(lane => LANE_LABELS[lane]).sort();
  if (labels.length === 0) return 'no areas';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

function formatLocalClosureStatus(status: ReadinessTriageLocalClosureStatus): string {
  return status
    .split('-')
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function formatReadinessHandoffTargetForCommand(target: string): string {
  return sanitizeReadinessHandoffText(target.trim().replace(/\\/g, '/'));
}

function formatMarkdownCell(value: string): string {
  return sanitizeReadinessHandoffText(value)
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|');
}

function sanitizeReadinessHandoffText(value: string): string {
  return sanitizeReportText(
    value.replace(/https?:\/\/[^@\s`'")|]+@/gi, match => `${match.split('//')[0]}//[redacted-credentials]@`),
  );
}

function normalizeReadinessSourceCommit(value: string): string {
  return sanitizeReadinessHandoffText(value).toLowerCase();
}

function validateNodeBackedIssues(
  value: unknown,
  expectedCount: unknown,
  optionName: string,
  errors: string[],
): void {
  if (!Array.isArray(value)) {
    errors.push(`${optionName} report.nodeBackedIssues must be an array`);
    return;
  }

  value.forEach((issue, index) => {
    if (!isRecord(issue)) {
      errors.push(`${optionName} report.nodeBackedIssues[${index}] must be an object`);
      return;
    }
    requireEnum(issue.lane, READINESS_LANES, `${optionName} report.nodeBackedIssues[${index}].lane`, errors);
    requireString(issue.issue, `${optionName} report.nodeBackedIssues[${index}].issue`, errors);
  });

  if (Number.isSafeInteger(expectedCount) && expectedCount !== value.length) {
    errors.push(`${optionName} report.nodeBackedIssueCount must equal report.nodeBackedIssues.length`);
  }
}

function validateLocalEvidenceIssues(
  value: unknown,
  expectedCount: unknown,
  optionName: string,
  errors: string[],
): void {
  if (!Array.isArray(value)) {
    errors.push(`${optionName} report.localEvidenceIssues must be an array`);
    return;
  }

  value.forEach((issue, index) => {
    if (!isRecord(issue)) {
      errors.push(`${optionName} report.localEvidenceIssues[${index}] must be an object`);
      return;
    }
    requireEnum(issue.lane, READINESS_LANES, `${optionName} report.localEvidenceIssues[${index}].lane`, errors);
    requireString(issue.issue, `${optionName} report.localEvidenceIssues[${index}].issue`, errors);
  });

  if (Number.isSafeInteger(expectedCount) && expectedCount !== value.length) {
    errors.push(`${optionName} report.localEvidenceIssueCount must equal report.localEvidenceIssues.length`);
  }
}

function validateReviewerOrExternalIssues(
  value: unknown,
  expectedCount: unknown,
  optionName: string,
  errors: string[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push(`${optionName} report.reviewerOrExternalIssues must be an array`);
    return;
  }

  value.forEach((issue, index) => {
    if (!isRecord(issue)) {
      errors.push(`${optionName} report.reviewerOrExternalIssues[${index}] must be an object`);
      return;
    }
    requireEnum(issue.lane, READINESS_LANES, `${optionName} report.reviewerOrExternalIssues[${index}].lane`, errors);
    requireString(issue.issue, `${optionName} report.reviewerOrExternalIssues[${index}].issue`, errors);
  });

  if (Number.isSafeInteger(expectedCount) && expectedCount !== value.length) {
    errors.push(`${optionName} report.reviewerOrExternalIssueCount must equal report.reviewerOrExternalIssues.length`);
  }
}

function validateRuntimePrereqsTriageTargets(value: unknown, label: string, errors: string[]): void {
  if (value === undefined) return;
  validateTriageTargets(value, label, errors);
}

function validateOptionalHandoffTriageTargets(value: unknown, label: string, errors: string[]): void {
  if (value === undefined) return;
  validateTriageTargets(value, label, errors);
}

function validateTriageTargets(value: unknown, label: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return;
  }
  const seenLanes = new Set<string>();
  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(`${label}[${index}] must be an object`);
      return;
    }
    requireEnum(entry.lane, READINESS_LANES, `${label}[${index}].lane`, errors);
    requireString(entry.target, `${label}[${index}].target`, errors);
    if (typeof entry.lane === 'string' && isReadinessLane(entry.lane)) {
      if (seenLanes.has(entry.lane)) {
        errors.push(`${label} must not duplicate lane ${entry.lane}`);
      }
      seenLanes.add(entry.lane);
    }
    if (typeof entry.target === 'string' && sanitizeReadinessHandoffText(entry.target) !== entry.target) {
      errors.push(`${label}[${index}].target must not contain local paths or sensitive labels`);
    }
  });
}

function validateSource(value: unknown, label: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  requireString(value.mode, `${label}.mode`, errors);
  if (value.mode === 'json') requireString(value.target, `${label}.target`, errors);
}

function validateHandoffLiveRequests(
  value: unknown,
  expectedCount: unknown,
  optionName: string,
  errors: string[],
): void {
  if (!Array.isArray(value)) {
    errors.push(`${optionName} report.liveEvidenceRequests must be an array`);
    return;
  }
  value.forEach((request, index) => {
    if (!isRecord(request)) {
      errors.push(`${optionName} report.liveEvidenceRequests[${index}] must be an object`);
      return;
    }
    requireEnum(request.lane, READINESS_LANES, `${optionName} report.liveEvidenceRequests[${index}].lane`, errors);
    if (typeof request.lane === 'string' && isReadinessLane(request.lane)) {
      requireExactString(request.laneLabel, LANE_LABELS[request.lane], `${optionName} report.liveEvidenceRequests[${index}].laneLabel`, errors);
    } else {
      requireString(request.laneLabel, `${optionName} report.liveEvidenceRequests[${index}].laneLabel`, errors);
    }
    requireString(request.issue, `${optionName} report.liveEvidenceRequests[${index}].issue`, errors);
  });
  if (Number.isSafeInteger(expectedCount) && expectedCount !== value.length) {
    errors.push(`${optionName} report.nodeBackedIssueCount must equal report.liveEvidenceRequests.length`);
  }
}

function validateHandoffLocalRequests(
  value: unknown,
  expectedCount: unknown,
  optionName: string,
  errors: string[],
): void {
  if (!Array.isArray(value)) {
    errors.push(`${optionName} report.localEvidenceRequests must be an array`);
    return;
  }
  value.forEach((request, index) => {
    if (!isRecord(request)) {
      errors.push(`${optionName} report.localEvidenceRequests[${index}] must be an object`);
      return;
    }
    requireEnum(request.lane, READINESS_LANES, `${optionName} report.localEvidenceRequests[${index}].lane`, errors);
    if (typeof request.lane === 'string' && isReadinessLane(request.lane)) {
      requireExactString(request.laneLabel, LANE_LABELS[request.lane], `${optionName} report.localEvidenceRequests[${index}].laneLabel`, errors);
    } else {
      requireString(request.laneLabel, `${optionName} report.localEvidenceRequests[${index}].laneLabel`, errors);
    }
    requireString(request.issue, `${optionName} report.localEvidenceRequests[${index}].issue`, errors);
  });
  if (Number.isSafeInteger(expectedCount) && expectedCount !== value.length) {
    errors.push(`${optionName} report.localEvidenceIssueCount must equal report.localEvidenceRequests.length`);
  }
}

function validateHandoffReviewerRequests(
  value: unknown,
  expectedCount: unknown,
  optionName: string,
  errors: string[],
): void {
  if (!Array.isArray(value)) {
    errors.push(`${optionName} report.reviewerOrExternalRequests must be an array`);
    return;
  }
  value.forEach((request, index) => {
    if (!isRecord(request)) {
      errors.push(`${optionName} report.reviewerOrExternalRequests[${index}] must be an object`);
      return;
    }
    requireEnum(request.lane, READINESS_LANES, `${optionName} report.reviewerOrExternalRequests[${index}].lane`, errors);
    if (typeof request.lane === 'string' && isReadinessLane(request.lane)) {
      requireExactString(request.laneLabel, LANE_LABELS[request.lane], `${optionName} report.reviewerOrExternalRequests[${index}].laneLabel`, errors);
    } else {
      requireString(request.laneLabel, `${optionName} report.reviewerOrExternalRequests[${index}].laneLabel`, errors);
    }
    requireString(request.issue, `${optionName} report.reviewerOrExternalRequests[${index}].issue`, errors);
  });
  if (Number.isSafeInteger(expectedCount) && expectedCount !== value.length) {
    errors.push(`${optionName} report.reviewerOrExternalIssueCount must equal report.reviewerOrExternalRequests.length`);
  }
}

function validateHandoffLanePackets(
  value: unknown,
  localRequests: unknown,
  liveRequests: unknown,
  reviewerRequests: unknown,
  triageTargets: unknown,
  optionName: string,
  errors: string[],
): void {
  if (!Array.isArray(value)) {
    errors.push(`${optionName} report.lanePackets must be an array`);
    return;
  }

  const requests = [
    ...(Array.isArray(localRequests)
      ? localRequests.filter(isRecord)
      : []),
    ...(Array.isArray(liveRequests)
    ? liveRequests.filter(isRecord)
    : []),
    ...(Array.isArray(reviewerRequests)
      ? reviewerRequests.filter(isRecord)
      : []),
  ];
  const prerequisiteMapByLane = buildTriageTargetMap(triageTargets);
  const seenLanes = new Set<string>();
  const coveredRequests: string[] = [];

  value.forEach((packet, index) => {
    if (!isRecord(packet)) {
      errors.push(`${optionName} report.lanePackets[${index}] must be an object`);
      return;
    }
    requireEnum(packet.lane, READINESS_LANES, `${optionName} report.lanePackets[${index}].lane`, errors);
    if (typeof packet.lane !== 'string' || !isReadinessLane(packet.lane)) return;
    if (seenLanes.has(packet.lane)) {
      errors.push(`${optionName} report.lanePackets must not duplicate lane ${packet.lane}`);
    }
    seenLanes.add(packet.lane);

    const config = LANE_PACKET_CONFIG[packet.lane];
    const laneRequests = requests
      .filter(request => request.lane === packet.lane)
      .map(request => (typeof request.issue === 'string' ? request.issue : ''));

    requireExactString(packet.laneLabel, LANE_LABELS[packet.lane], `${optionName} report.lanePackets[${index}].laneLabel`, errors);
    requireSafeInteger(packet.issueCount, `${optionName} report.lanePackets[${index}].issueCount`, errors);
    requireExactString(packet.evidenceTemplate, config.evidenceTemplate, `${optionName} report.lanePackets[${index}].evidenceTemplate`, errors);
    requireExactString(packet.validatorCommand, config.validatorCommand, `${optionName} report.lanePackets[${index}].validatorCommand`, errors);
    requireExactString(packet.releaseGateFlag, config.releaseGateFlag, `${optionName} report.lanePackets[${index}].releaseGateFlag`, errors);
    const expectedTriageTarget = prerequisiteMapByLane.get(packet.lane) ?? config.currentPrerequisiteMap;
    if (packet.triageTarget !== undefined || prerequisiteMapByLane.has(packet.lane)) {
      requireExactString(
        packet.triageTarget,
        expectedTriageTarget,
        `${optionName} report.lanePackets[${index}].triageTarget`,
        errors,
      );
    }
    requireExactString(
      packet.currentPrerequisiteMap,
      config.currentPrerequisiteMap,
      `${optionName} report.lanePackets[${index}].currentPrerequisiteMap`,
      errors,
    );
    requireExactString(packet.nextOperatorStep, config.nextOperatorStep, `${optionName} report.lanePackets[${index}].nextOperatorStep`, errors);
    requireExactString(packet.closureBoundary, config.closureBoundary, `${optionName} report.lanePackets[${index}].closureBoundary`, errors);
    if (config.operatorEvidenceInputs) {
      requireStringArray(packet.operatorEvidenceInputs, `${optionName} report.lanePackets[${index}].operatorEvidenceInputs`, errors);
      if (Array.isArray(packet.operatorEvidenceInputs) && !stringArraysEqual(packet.operatorEvidenceInputs, config.operatorEvidenceInputs)) {
        errors.push(`${optionName} report.lanePackets[${index}].operatorEvidenceInputs must match the ${packet.lane} operator input checklist`);
      }
    } else if (packet.operatorEvidenceInputs !== undefined) {
      errors.push(`${optionName} report.lanePackets[${index}].operatorEvidenceInputs must not be present for ${packet.lane}`);
    }
    requireStringArray(packet.requestedEvidence, `${optionName} report.lanePackets[${index}].requestedEvidence`, errors);

    if (Array.isArray(packet.requestedEvidence)) {
      if (Number.isSafeInteger(packet.issueCount) && packet.issueCount !== packet.requestedEvidence.length) {
        errors.push(`${optionName} report.lanePackets[${index}].issueCount must equal requestedEvidence.length`);
      }
      if (!stringArraysEqual(packet.requestedEvidence, laneRequests)) {
        errors.push(`${optionName} report.lanePackets[${index}].requestedEvidence must match handoff requests for ${packet.lane}`);
      }
      coveredRequests.push(...packet.requestedEvidence.filter((entry): entry is string => typeof entry === 'string'));
    }
  });

  for (const lane of READINESS_LANES) {
    const hasRequests = requests.some(request => request.lane === lane);
    if (hasRequests && !seenLanes.has(lane)) {
      errors.push(`${optionName} report.lanePackets must include lane ${lane}`);
    }
    if (!hasRequests && seenLanes.has(lane)) {
      errors.push(`${optionName} report.lanePackets must not include empty lane ${lane}`);
    }
  }
  if (coveredRequests.length !== requests.length) {
    errors.push(`${optionName} report.lanePackets requestedEvidence total must equal handoff request count`);
  }
}

function validateHandoffWorkPackages(value: unknown, optionName: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${optionName} report.workPackages must be an array`);
    return;
  }
  value.forEach((workPackage, index) => {
    if (!isRecord(workPackage)) {
      errors.push(`${optionName} report.workPackages[${index}] must be an object`);
      return;
    }
    requireString(workPackage.name, `${optionName} report.workPackages[${index}].name`, errors);
    requireEnum(workPackage.status, ['action-required', 'blocked', 'complete'], `${optionName} report.workPackages[${index}].status`, errors);
    requireNonNegativeSafeInteger(workPackage.issueCount, `${optionName} report.workPackages[${index}].issueCount`, errors);
    requireString(workPackage.action, `${optionName} report.workPackages[${index}].action`, errors);
  });
}

function validateHandoffBoundary(value: unknown, optionName: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${optionName} report.boundary must be an object`);
    return;
  }
  for (const [field, boundaryValue] of Object.entries(value)) {
    if (boundaryValue !== 'yes' && boundaryValue !== 'no') {
      errors.push(`${optionName} report.boundary.${field} must be yes or no`);
    }
  }
  requireBoundaryNo(value, 'Live node probe executed by handoff command', errors, optionName);
  requireBoundaryNo(value, 'ERGO_API_KEY read', errors, optionName);
  requireBoundaryNo(value, 'Auth header sent', errors, optionName);
  requireBoundaryNo(value, 'Runtime database opened', errors, optionName);
  requireBoundaryNo(value, 'Deployment state opened', errors, optionName);
  requireBoundaryNo(value, 'Private key material serialized', errors, optionName);
  requireBoundaryNo(value, 'Evidence row closure claimed', errors, optionName);
  requireBoundaryNo(value, 'Release gate PASS claimed', errors, optionName);
  requireBoundaryNo(value, 'Public claim authorization granted', errors, optionName);
  requireBoundaryNo(value, 'Claim/publication fields unlocked', errors, optionName);
  requireBoundaryNo(
    value,
    'Transaction broadcast, submit, deploy, key rotation, or state mutation performed',
    errors,
    optionName,
  );
}

function isReadinessLane(value: string): value is ReadinessTriageLane {
  return READINESS_LANES.includes(value as ReadinessTriageLane);
}

function requireExactString(value: unknown, expected: string, label: string, errors: string[]): void {
  if (value !== expected) {
    errors.push(`${label} must be ${expected}`);
  }
}

function stringArraysEqual(left: unknown[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => entry === right[index]);
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function nonNegativeIntegerOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function yesNoOrNo(value: unknown): 'yes' | 'no' {
  return value === 'yes' ? 'yes' : 'no';
}

function requireString(value: unknown, label: string, errors: string[]): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${label} must be present`);
  }
}

function requireStringArray(value: unknown, label: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return;
  }
  value.forEach((entry, index) => requireString(entry, `${label}[${index}]`, errors));
}

function requireOptionalGitCommit(value: unknown, label: string, errors: string[]): void {
  if (value === undefined) return;
  if (typeof value !== 'string' || !/^[0-9a-f]{7,40}$/i.test(value)) {
    errors.push(`${label} must be a 7-40 character Git commit SHA`);
  }
}

function requireSafeInteger(value: unknown, label: string, errors: string[]): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    errors.push(`${label} must be a safe integer`);
  }
}

function requireNonNegativeSafeInteger(value: unknown, label: string, errors: string[]): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    errors.push(`${label} must be a non-negative safe integer`);
  }
}

function requireEnum(value: unknown, allowed: string[], label: string, errors: string[]): void {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    errors.push(`${label} must be ${allowed.join(' or ')}`);
  }
}

function requireBoundaryNo(
  boundary: Record<string, unknown>,
  field: string,
  errors: string[],
  optionName: string,
): void {
  if (boundary[field] !== 'no') {
    errors.push(`${optionName} report.boundary.${field} must be no`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
