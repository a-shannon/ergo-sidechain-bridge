import type {
  ReadinessNodePreflightReport,
  ReadinessNodePreflightResult,
} from './readiness-node-preflight.js';
import type {
  ReadinessTriageCategory,
  ReadinessTriageLane,
  ReadinessTriageLocalClosureStatus,
  ReadinessTriageLocalClosureSummary,
  ReadinessTriageReport,
} from './readiness-triage.js';
import { sanitizeReportText } from './report-text-sanitizer.js';

export type ReadinessRuntimePrereqsStatus = 'PASS' | 'READY' | 'BLOCKED';

export interface ReadinessRuntimePrereqsCommandInput {
  nodeUrl: string;
  explicitNodeUrl: boolean;
  triageJson?: string;
  nodePreflightJson?: string;
  anchorPreflightJson?: string;
  out?: string;
  jsonOut?: string;
}

export type ReadinessRuntimePrereqsNodePreflightSource =
  | { mode: 'live' }
  | { mode: 'json'; target: string };

export type ReadinessRuntimePrereqsTriageSource =
  | { mode: 'default-discovery' }
  | { mode: 'json'; target: string };

export type ReadinessRuntimePrereqsAnchorPreflightResult = 'PASS' | 'WARN' | 'FAIL';

export type ReadinessRuntimePrereqsAnchorPreflightSource =
  | { mode: 'json'; target: string };

export interface ReadinessRuntimePrereqsAnchorPreflightReport {
  status: ReadinessRuntimePrereqsAnchorPreflightResult;
  expectedRoot: {
    mode: string;
  };
  node?: {
    endpoint?: string;
  };
  anchorScan?: {
    anchorCount?: number;
  };
  boundary: Record<string, string>;
}

export interface ReadinessRuntimePrereqsAnchorPreflightSummary {
  expectedRootMode: string;
  anchorCount?: number;
  nodeEndpoint?: string;
}

export interface ReadinessRuntimePrereqsTriageTarget {
  lane: ReadinessTriageLane;
  target: string;
}

export interface ReadinessRuntimePrereqsInput {
  command: string;
  triageReport: ReadinessTriageReport;
  triageSource?: ReadinessRuntimePrereqsTriageSource;
  nodePreflightReport: ReadinessNodePreflightReport;
  nodePreflightSource?: ReadinessRuntimePrereqsNodePreflightSource;
  anchorPreflightReport?: ReadinessRuntimePrereqsAnchorPreflightReport;
  anchorPreflightSource?: ReadinessRuntimePrereqsAnchorPreflightSource;
}

export interface ReadinessRuntimePrereqsReport {
  status: ReadinessRuntimePrereqsStatus;
  exitCode: number;
  sourceCommit?: string;
  command: string;
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
  triageSource: ReadinessRuntimePrereqsTriageSource;
  triageTargets?: ReadinessRuntimePrereqsTriageTarget[];
  localEvidenceIssues: Array<{
    lane: ReadinessTriageLane;
    issue: string;
  }>;
  nodeBackedIssues: Array<{
    lane: ReadinessTriageLane;
    issue: string;
  }>;
  reviewerOrExternalIssues?: Array<{
    lane: ReadinessTriageLane;
    issue: string;
  }>;
  nodePreflight: ReadinessNodePreflightResult;
  nodePreflightSource: ReadinessRuntimePrereqsNodePreflightSource;
  anchorPreflight?: ReadinessRuntimePrereqsAnchorPreflightResult;
  anchorPreflightSource?: ReadinessRuntimePrereqsAnchorPreflightSource;
  anchorPreflightSummary?: ReadinessRuntimePrereqsAnchorPreflightSummary;
  nodeEndpoint: string;
  nextActions: string[];
  boundary: Record<string, 'yes' | 'no'>;
}

const LANE_LABELS: Record<ReadinessTriageLane, string> = {
  'security-review': 'Gate 4 independent security review',
  'trustless-burn': 'Gate 5 trustless burn',
  'committee-governance': 'Gate 6 committee governance',
  benchmark: 'Gate 7 benchmark',
};

export function buildReadinessRuntimePrereqsReport(
  input: ReadinessRuntimePrereqsInput,
): ReadinessRuntimePrereqsReport {
  const counts = countCategories(input.triageReport);
  const triageSource = sanitizeTriageSource(input.triageSource ?? { mode: 'default-discovery' });
  const nodePreflightSource = sanitizeNodePreflightSource(input.nodePreflightSource ?? { mode: 'live' });
  const anchorPreflightSource = input.anchorPreflightSource
    ? sanitizeAnchorPreflightSource(input.anchorPreflightSource)
    : undefined;
  const anchorPreflightSummary = input.anchorPreflightReport
    ? buildAnchorPreflightSummary(input.anchorPreflightReport)
    : undefined;
  const localClosure = sanitizeLocalClosure(input.triageReport.localClosure);
  const status = classifyRuntimePrereqsStatus(input.triageReport, input.nodePreflightReport, counts);
  const exitCode = status === 'BLOCKED' ? 1 : 0;
  const nextActions = buildNextActions(input.triageReport, input.nodePreflightReport, counts, localClosure);

  return {
    status,
    exitCode,
    ...(input.triageReport.sourceCommit ? { sourceCommit: normalizeRuntimePrereqsSourceCommit(input.triageReport.sourceCommit) } : {}),
    command: sanitizeRuntimePrereqsText(input.command),
    totalStructuralIssues: input.triageReport.totalStructuralIssues,
    nodeBackedIssueCount: counts['node-backed-or-live-drill'],
    reviewerOrExternalIssueCount: counts['reviewer-or-external'],
    claimOrPublicationBoundaryIssueCount: counts['claim-or-publication-boundary'],
    localEvidenceIssueCount: counts['local-evidence'],
    localClosureStatus: localClosure.status,
    localOnlyClosureIssueCount: localClosure.localOnlyIssueCount,
    externalOrLiveClosureIssueCount: localClosure.externalOrLiveIssueCount,
    manualTriageIssueCount: localClosure.manualTriageIssueCount,
    localClosureSummary: localClosure.summary,
    triageSource,
    triageTargets: buildRuntimePrereqsTriageTargets(input.triageReport),
    localEvidenceIssues: input.triageReport.issues
      .filter(issue => issue.category === 'local-evidence')
      .map(issue => ({
        lane: issue.lane,
        issue: sanitizeRuntimePrereqsText(issue.issue),
      })),
    nodeBackedIssues: input.triageReport.issues
      .filter(issue => issue.category === 'node-backed-or-live-drill')
      .map(issue => ({
        lane: issue.lane,
        issue: sanitizeRuntimePrereqsText(issue.issue),
      })),
    reviewerOrExternalIssues: input.triageReport.issues
      .filter(issue => issue.category === 'reviewer-or-external')
      .map(issue => ({
        lane: issue.lane,
        issue: sanitizeRuntimePrereqsText(issue.issue),
      })),
    nodePreflight: input.nodePreflightReport.result,
    nodePreflightSource,
    ...(input.anchorPreflightReport ? { anchorPreflight: input.anchorPreflightReport.status } : {}),
    ...(anchorPreflightSource ? { anchorPreflightSource } : {}),
    ...(anchorPreflightSummary ? { anchorPreflightSummary } : {}),
    nodeEndpoint: sanitizeRuntimePrereqsText(input.nodePreflightReport.nodeEndpoint),
    nextActions,
    boundary: buildRuntimePrereqsBoundary(
      input.triageReport,
      input.nodePreflightReport,
      status,
      triageSource,
      nodePreflightSource,
      anchorPreflightSource,
    ),
  };
}

export function buildReadinessRuntimePrereqsCommand(
  input: ReadinessRuntimePrereqsCommandInput,
): string {
  const parts = ['npm run readiness:runtime-prereqs --'];
  if (input.explicitNodeUrl) parts.push('--node-url', normalizeNodeEndpointForReport(input.nodeUrl));
  if (input.triageJson) parts.push('--triage-json', formatRuntimePrereqsTargetForCommand(input.triageJson));
  if (input.nodePreflightJson) parts.push('--node-preflight-json', formatRuntimePrereqsTargetForCommand(input.nodePreflightJson));
  if (input.anchorPreflightJson) parts.push('--anchor-preflight-json', formatRuntimePrereqsTargetForCommand(input.anchorPreflightJson));
  if (input.out) parts.push('--out <report.md>');
  if (input.jsonOut) parts.push('--json-out <report.json>');
  return parts.join(' ');
}

export function formatReadinessRuntimePrereqsReportMarkdown(
  report: ReadinessRuntimePrereqsReport,
): string {
  const nextActionRows = report.nextActions.length > 0
    ? report.nextActions.map(action => `- ${sanitizeRuntimePrereqsText(action)}`)
    : ['- No runtime-prerequisite action remains from this report.'];
  const localEvidenceRows = report.localEvidenceIssues.length > 0
    ? [
        '| Lane | Issue |',
        '|---|---|',
        ...report.localEvidenceIssues.map(issue =>
          `| ${LANE_LABELS[issue.lane]} | ${sanitizeRuntimePrereqsText(issue.issue)} |`,
        ),
      ]
    : ['- No local evidence blockers were reported.'];
  const nodeBackedRows = report.nodeBackedIssues.length > 0
    ? [
        '| Lane | Issue |',
        '|---|---|',
        ...report.nodeBackedIssues.map(issue =>
          `| ${LANE_LABELS[issue.lane]} | ${sanitizeRuntimePrereqsText(issue.issue)} |`,
        ),
      ]
    : ['- No node-backed or live-drill blockers were reported.'];
  const reviewerOrExternalIssues = report.reviewerOrExternalIssues ?? [];
  const reviewerOrExternalRows = reviewerOrExternalIssues.length > 0
    ? [
        '| Lane | Issue |',
        '|---|---|',
        ...reviewerOrExternalIssues.map(issue =>
          `| ${LANE_LABELS[issue.lane]} | ${sanitizeRuntimePrereqsText(issue.issue)} |`,
        ),
      ]
    : ['- No reviewer or external-decision blockers were reported.'];
  const triageTargetRows = report.triageTargets && report.triageTargets.length > 0
    ? [
        '| Lane | Target |',
        '|---|---|',
        ...report.triageTargets.map(target =>
          `| ${LANE_LABELS[target.lane]} | ${sanitizeRuntimePrereqsText(target.target)} |`,
        ),
      ]
    : ['- No triage lane targets were recorded.'];
  const boundaryRows = Object.entries(report.boundary).map(
    ([field, value]) => `| ${sanitizeRuntimePrereqsText(field)} | ${value} |`,
  );

  return [
    '# Bridge Readiness Runtime Prerequisites',
    '',
    'This report combines the default or JSON-backed readiness triage with the non-mainnet Ergo node preflight.',
    'It is planning output only and does not close evidence rows, authorize claims, deploy, sign, submit, or broadcast transactions.',
    '',
    '## Summary',
    '',
    '| Field | Value |',
    '|---|---|',
    `| Command | ${report.command} |`,
    `| Result | ${report.status} |`,
    `| Exit code | ${report.exitCode} |`,
    ...(report.sourceCommit ? [`| Source commit | ${sanitizeRuntimePrereqsText(report.sourceCommit)} |`] : []),
    `| Total structural issues | ${report.totalStructuralIssues} |`,
    `| Node-backed/live-drill issues | ${report.nodeBackedIssueCount} |`,
    `| Reviewer/external issues | ${report.reviewerOrExternalIssueCount} |`,
    `| Claim/publication-boundary issues | ${report.claimOrPublicationBoundaryIssueCount} |`,
    `| Local evidence issues | ${report.localEvidenceIssueCount} |`,
    `| Local-only closure status | ${formatLocalClosureStatus(report.localClosureStatus)} |`,
    `| Local-only closure issues | ${report.localOnlyClosureIssueCount} |`,
    `| External/live/claim closure issues | ${report.externalOrLiveClosureIssueCount} |`,
    `| Manual triage issues | ${report.manualTriageIssueCount} |`,
    `| Local closure summary | ${report.localClosureSummary} |`,
    `| Readiness triage source | ${formatTriageSource(report.triageSource)} |`,
    `| Node preflight | ${report.nodePreflight} |`,
    `| Node preflight source | ${formatNodePreflightSource(report.nodePreflightSource)} |`,
    ...formatAnchorPreflightSummaryRows(report),
    `| Node endpoint | ${report.nodeEndpoint} |`,
    '',
    '## Next Actions',
    '',
    ...nextActionRows,
    '',
    '## Local Evidence Blockers',
    '',
    ...localEvidenceRows,
    '',
    '## Node-Backed/Live Drill Blockers',
    '',
    ...nodeBackedRows,
    '',
    '## Reviewer/External Decision Blockers',
    '',
    ...reviewerOrExternalRows,
    '',
    '## Triage Lane Targets',
    '',
    ...triageTargetRows,
    '',
    '## Boundary',
    '',
    '| Boundary | Value |',
    '|---|---|',
    ...boundaryRows,
    '',
  ].join('\n');
}

function classifyRuntimePrereqsStatus(
  triageReport: ReadinessTriageReport,
  nodePreflightReport: ReadinessNodePreflightReport,
  counts: Record<ReadinessTriageCategory, number>,
): ReadinessRuntimePrereqsStatus {
  if (triageReport.status === 'PASS' && triageReport.totalStructuralIssues === 0) {
    return 'PASS';
  }
  if (counts['node-backed-or-live-drill'] > 0 && nodePreflightReport.result === 'BLOCKED') {
    return 'BLOCKED';
  }
  return 'READY';
}

function buildNextActions(
  triageReport: ReadinessTriageReport,
  nodePreflightReport: ReadinessNodePreflightReport,
  counts: Record<ReadinessTriageCategory, number>,
  localClosure: ReadinessTriageLocalClosureSummary,
): string[] {
  const actions: string[] = [];
  const nodeBackedLanes = formatLaneList(
    new Set(
      triageReport.issues
        .filter(issue => issue.category === 'node-backed-or-live-drill')
        .map(issue => issue.lane),
    ),
  );

  if (counts['node-backed-or-live-drill'] > 0 && nodePreflightReport.result === 'BLOCKED') {
    actions.push(
      `Start or configure a non-mainnet Ergo node at ${nodePreflightReport.nodeEndpoint}, then rerun npm run readiness:node-preflight -- before collecting node-backed/live-drill evidence.`,
    );
    actions.push(localClosure.summary);
    actions.push(
      'Keep claim/publication fields and reviewer approvals blocked until node-backed/live-drill evidence and reviewer/external evidence are resolved.',
    );
    actions.push(
      'After the node preflight returns PASS, rerun npm run readiness:runtime-prereqs -- to route the remaining lane evidence work.',
    );
    return actions.map(sanitizeRuntimePrereqsText);
  }

  if (counts['node-backed-or-live-drill'] > 0) {
    actions.push(
      `Collect node-backed/live-drill evidence for ${nodeBackedLanes} before changing claim/publication fields.`,
    );
  }
  if (localClosure.status === 'external-or-live-required') {
    actions.push(localClosure.summary);
  }
  if (localClosure.status === 'manual-triage-required') {
    actions.push(localClosure.summary);
  }
  if (counts['reviewer-or-external'] > 0) {
    actions.push(
      'Route reviewer/external blockers to human review material after the concrete runtime evidence exists.',
    );
  }
  if (localClosure.status === 'local-evidence-work-available') {
    actions.push(
      'Resolve remaining local-only evidence or target-access blockers with completed command output artifacts before rerunning readiness:triage.',
    );
  }
  if (counts['claim-or-publication-boundary'] > 0) {
    const blockingDomains = formatBlockingDomainList(counts, localClosure);
    actions.push(
      `Do not unlock claim/publication fields until ${blockingDomains} blockers are resolved.`,
    );
  }
  if (triageReport.status === 'PASS' && triageReport.totalStructuralIssues === 0) {
    actions.push('No runtime-prerequisite blockers remain in the default triage lanes.');
  }

  return actions.map(sanitizeRuntimePrereqsText);
}

function buildRuntimePrereqsBoundary(
  triageReport: ReadinessTriageReport,
  nodePreflightReport: ReadinessNodePreflightReport,
  status: ReadinessRuntimePrereqsStatus,
  triageSource: ReadinessRuntimePrereqsTriageSource,
  nodePreflightSource: ReadinessRuntimePrereqsNodePreflightSource,
  anchorPreflightSource: ReadinessRuntimePrereqsAnchorPreflightSource | undefined,
): Record<string, 'yes' | 'no'> {
  return {
    'Planning output only': 'yes',
    'Readiness triage JSON reused': triageSource.mode === 'json' ? 'yes' : 'no',
    'Node preflight executed': nodePreflightSource.mode === 'live' ? 'yes' : 'no',
    'Node preflight JSON reused': nodePreflightSource.mode === 'json' ? 'yes' : 'no',
    'Live node probe executed by runtime prerequisites': nodePreflightSource.mode === 'live' ? 'yes' : 'no',
    'Anchor preflight JSON reused': anchorPreflightSource ? 'yes' : 'no',
    'Non-mainnet node prerequisite available': nodePreflightReport.result === 'PASS' ? 'yes' : 'no',
    'Claim/publication fields unlocked': status === 'PASS' && triageReport.totalStructuralIssues === 0 ? 'yes' : 'no',
    'ERGO_API_KEY read': nodePreflightReport.boundary['ERGO_API_KEY read'] ?? 'no',
    'Auth header sent': nodePreflightReport.boundary['Auth header sent'] ?? 'no',
    'Runtime database opened': 'no',
    'Deployment state opened': 'no',
    'Private key material serialized': 'no',
    'Anchor evidence row closure claimed': 'no',
    'Evidence row closure claimed': 'no',
    'Release gate PASS claimed': 'no',
    'Public claim authorization granted': 'no',
    'Transaction broadcast, submit, deploy, key rotation, or state mutation performed': 'no',
  };
}

function countCategories(
  triageReport: ReadinessTriageReport,
): Record<ReadinessTriageCategory, number> {
  const counts: Record<ReadinessTriageCategory, number> = {
    'target-access': 0,
    'local-evidence': 0,
    'node-backed-or-live-drill': 0,
    'reviewer-or-external': 0,
    'claim-or-publication-boundary': 0,
    other: 0,
  };
  for (const issue of triageReport.issues) {
    counts[issue.category] += 1;
  }
  return counts;
}

function buildRuntimePrereqsTriageTargets(
  triageReport: ReadinessTriageReport,
): ReadinessRuntimePrereqsTriageTarget[] {
  return triageReport.lanes.map(lane => ({
    lane: lane.lane,
    target: formatRuntimePrereqsTargetForCommand(lane.target),
  }));
}

function sanitizeLocalClosure(
  localClosure: ReadinessTriageLocalClosureSummary,
): ReadinessTriageLocalClosureSummary {
  return {
    status: localClosure.status,
    localOnlyIssueCount: localClosure.localOnlyIssueCount,
    externalOrLiveIssueCount: localClosure.externalOrLiveIssueCount,
    manualTriageIssueCount: localClosure.manualTriageIssueCount,
    summary: sanitizeRuntimePrereqsText(localClosure.summary),
  };
}

function formatBlockingDomainList(
  counts: Record<ReadinessTriageCategory, number>,
  localClosure: ReadinessTriageLocalClosureSummary,
): string {
  const domains: string[] = [];
  if (counts['node-backed-or-live-drill'] > 0) domains.push('node-backed/live-drill');
  if (localClosure.localOnlyIssueCount > 0) domains.push('local-only evidence');
  if (counts['reviewer-or-external'] > 0) domains.push('reviewer/external');
  if (localClosure.manualTriageIssueCount > 0) domains.push('manual-triage');

  if (domains.length === 0) return 'upstream';
  if (domains.length === 1) return domains[0];
  return `${domains.slice(0, -1).join(', ')} and ${domains[domains.length - 1]}`;
}

function formatLaneList(lanes: Set<ReadinessTriageLane>): string {
  const labels = [...lanes].map(lane => LANE_LABELS[lane]).sort();
  if (labels.length === 0) return 'no lanes';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

function normalizeNodeEndpointForReport(nodeUrl: string): string {
  try {
    const url = new URL(nodeUrl);
    url.username = '';
    url.password = '';
    return sanitizeRuntimePrereqsText(url.toString().replace(/\/$/, ''));
  } catch {
    return '<invalid node endpoint>';
  }
}

function sanitizeTriageSource(
  source: ReadinessRuntimePrereqsTriageSource,
): ReadinessRuntimePrereqsTriageSource {
  if (source.mode === 'default-discovery') return source;
  return {
    mode: 'json',
    target: formatRuntimePrereqsTargetForCommand(source.target),
  };
}

function sanitizeNodePreflightSource(
  source: ReadinessRuntimePrereqsNodePreflightSource,
): ReadinessRuntimePrereqsNodePreflightSource {
  if (source.mode === 'live') return source;
  return {
    mode: 'json',
    target: formatRuntimePrereqsTargetForCommand(source.target),
  };
}

function sanitizeAnchorPreflightSource(
  source: ReadinessRuntimePrereqsAnchorPreflightSource,
): ReadinessRuntimePrereqsAnchorPreflightSource {
  return {
    mode: 'json',
    target: formatRuntimePrereqsTargetForCommand(source.target),
  };
}

function buildAnchorPreflightSummary(
  report: ReadinessRuntimePrereqsAnchorPreflightReport,
): ReadinessRuntimePrereqsAnchorPreflightSummary {
  return {
    expectedRootMode: sanitizeRuntimePrereqsText(report.expectedRoot.mode),
    ...(typeof report.anchorScan?.anchorCount === 'number' ? { anchorCount: report.anchorScan.anchorCount } : {}),
    ...(report.node?.endpoint ? { nodeEndpoint: sanitizeRuntimePrereqsText(report.node.endpoint) } : {}),
  };
}

function formatAnchorPreflightSummaryRows(report: ReadinessRuntimePrereqsReport): string[] {
  if (!report.anchorPreflight) return [];
  const summary = report.anchorPreflightSummary;
  return [
    `| Anchor preflight | ${report.anchorPreflight} |`,
    report.anchorPreflightSource
      ? `| Anchor preflight source | ${formatAnchorPreflightSource(report.anchorPreflightSource)} |`
      : '| Anchor preflight source | not provided |',
    ...(summary?.anchorCount !== undefined ? [`| Anchor count | ${summary.anchorCount} |`] : []),
    ...(summary?.expectedRootMode ? [`| Anchor expected root mode | ${summary.expectedRootMode} |`] : []),
  ];
}

function formatTriageSource(source: ReadinessRuntimePrereqsTriageSource): string {
  if (source.mode === 'default-discovery') return 'default blocker-map discovery';
  return `json report: ${formatRuntimePrereqsTargetForCommand(source.target)}`;
}

function formatNodePreflightSource(source: ReadinessRuntimePrereqsNodePreflightSource): string {
  if (source.mode === 'live') return 'live node probe';
  return `json report: ${formatRuntimePrereqsTargetForCommand(source.target)}`;
}

function formatAnchorPreflightSource(source: ReadinessRuntimePrereqsAnchorPreflightSource): string {
  return `json report: ${formatRuntimePrereqsTargetForCommand(source.target)}`;
}

function formatLocalClosureStatus(status: ReadinessTriageLocalClosureStatus): string {
  return status
    .split('-')
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function formatRuntimePrereqsTargetForCommand(target: string): string {
  return sanitizeRuntimePrereqsText(target.trim().replace(/\\/g, '/'));
}

function sanitizeRuntimePrereqsText(value: string): string {
  return sanitizeReportText(
    value.replace(/https?:\/\/[^@\s`'")|]+@/gi, match => `${match.split('//')[0]}//[redacted-credentials]@`),
  );
}

function normalizeRuntimePrereqsSourceCommit(value: string): string {
  return sanitizeRuntimePrereqsText(value).toLowerCase();
}
