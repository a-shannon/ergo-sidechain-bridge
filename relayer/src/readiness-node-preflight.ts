import { validateReadOnlyNodeUrl } from './read-only-node-url.js';
import { sanitizeReportText } from './report-text-sanitizer.js';

export type ReadinessNodePreflightResult = 'PASS' | 'BLOCKED';

export type NodePreflightFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface ReadinessNodePreflightInput {
  command: string;
  nodeUrl: string;
}

export interface ReadinessNodePreflightCommandInput {
  nodeUrl: string;
  explicitNodeUrl: boolean;
  out?: string;
  jsonOut?: string;
}

export interface ReadinessNodePreflightCheck {
  name: string;
  result: 'PASS' | 'BLOCKED';
  detail: string;
}

export interface ReadinessNodePreflightReport {
  result: ReadinessNodePreflightResult;
  exitCode: number;
  command: string;
  nodeEndpoint: string;
  reason: string;
  observedError?: string;
  network?: string;
  height?: string;
  checks: ReadinessNodePreflightCheck[];
  boundary: Record<string, 'yes' | 'no'>;
}

interface ProbeState {
  requestAttempted: boolean;
  infoReachable: boolean;
  nonMainnet: boolean;
  headerReachable: boolean;
  scriptCompileReachable: boolean;
}

const TRUE_SCRIPT_SOURCE = 'sigmaProp(true)';
const DEFAULT_BOUNDARY = {
  'ERGO_API_KEY read': 'no',
  'Auth header sent': 'no',
  'Node wallet used': 'no',
  'Runtime database opened': 'no',
  'Deployment state opened': 'no',
  'Private key material serialized': 'no',
  'Transaction broadcast, submit, deploy, or state mutation performed': 'no',
  'Evidence row closure claimed': 'no',
  'Release gate PASS claimed': 'no',
} as const;

export async function runReadinessNodePreflight(
  input: ReadinessNodePreflightInput,
  fetchFn: NodePreflightFetch = fetch,
): Promise<ReadinessNodePreflightReport> {
  const command = sanitizeNodePreflightText(input.command);
  const endpointValidationErrors = validateReadOnlyNodeUrl(input.nodeUrl, 'node URL');
  if (endpointValidationErrors.length > 0) {
    return buildBlockedReport({
      command,
      nodeEndpoint: '<blocked node endpoint>',
      reason: endpointValidationErrors[0],
      state: initialProbeState(),
    });
  }

  const nodeEndpoint = normalizeNodeEndpointForReport(input.nodeUrl);
  const state = initialProbeState();

  try {
    const info = await requestJson(fetchFn, input.nodeUrl, '/info', { state });
    state.infoReachable = true;
    const network = String(info.network ?? '').trim();
    const height = String(info.fullHeight ?? info.height ?? '').trim();
    if (network.length === 0) {
      return buildBlockedReport({
        command,
        nodeEndpoint,
        reason: 'Node did not identify a concrete non-mainnet network.',
        state,
        height,
      });
    }
    if (network.toLowerCase() === 'mainnet') {
      return buildBlockedReport({
        command,
        nodeEndpoint,
        reason: 'Mainnet node rejected for bridge readiness preflight; use a non-mainnet local or testnet node.',
        state,
        network,
        height,
      });
    }
    state.nonMainnet = true;

    const headers = await requestJson(fetchFn, input.nodeUrl, '/blocks/lastHeaders/1', { state });
    if (!Array.isArray(headers) || headers.length === 0) {
      throw new Error('GET /blocks/lastHeaders/1 returned no headers');
    }
    state.headerReachable = true;

    const compile = await requestJson(fetchFn, input.nodeUrl, '/script/p2sAddress', {
      method: 'POST',
      body: { source: TRUE_SCRIPT_SOURCE, treeVersion: 0 },
      state,
    });
    if (typeof compile.address !== 'string' || compile.address.trim().length === 0) {
      throw new Error('POST /script/p2sAddress returned no address');
    }
    state.scriptCompileReachable = true;

    return {
      result: 'PASS',
      exitCode: 0,
      command,
      nodeEndpoint,
      reason: `Ergo node readiness preflight completed on ${sanitizeNodePreflightText(network)} height ${sanitizeNodePreflightText(height)}.`,
      network: sanitizeNodePreflightText(network),
      height: sanitizeNodePreflightText(height),
      checks: [
        {
          name: 'Node info endpoint reachable',
          result: 'PASS',
          detail: `network=${sanitizeNodePreflightText(network)} height=${sanitizeNodePreflightText(height)}`,
        },
        {
          name: 'Latest header endpoint reachable',
          result: 'PASS',
          detail: `headers=${headers.length}`,
        },
        {
          name: 'Script compile endpoint reachable',
          result: 'PASS',
          detail: 'compiled deterministic sigmaProp(true) probe without auth headers',
        },
      ],
      boundary: buildBoundary(state),
    };
  } catch (error) {
    return buildBlockedReport({
      command,
      nodeEndpoint,
      reason: 'Ergo node readiness preflight blocked before all required non-mutating endpoints completed.',
      observedError: summarizeNodePreflightError(error),
      state,
    });
  }
}

export function buildReadinessNodePreflightCommand(input: ReadinessNodePreflightCommandInput): string {
  const parts = ['npm run readiness:node-preflight --'];
  if (input.explicitNodeUrl) parts.push('--node-url', normalizeNodeEndpointForReport(input.nodeUrl));
  if (input.out) parts.push('--out <report.md>');
  if (input.jsonOut) parts.push('--json-out <report.json>');
  return parts.join(' ');
}

export function formatReadinessNodePreflightReportMarkdown(
  report: ReadinessNodePreflightReport,
): string {
  const rows = [
    ['Command', report.command],
    ['Result', report.result],
    ['Exit code', String(report.exitCode)],
    ['Node endpoint', report.nodeEndpoint],
    ['Reason', report.reason],
  ];
  if (report.network) rows.push(['Network', report.network]);
  if (report.height) rows.push(['Height', report.height]);
  if (report.observedError) rows.push(['Observed error', report.observedError]);

  const checks = report.checks.length > 0
    ? [
        '| Check | Result | Detail |',
        '|---|---|---|',
        ...report.checks.map(check =>
          `| ${sanitizeNodePreflightText(check.name)} | ${check.result} | ${sanitizeNodePreflightText(check.detail)} |`,
        ),
      ].join('\n')
    : '- None completed before the blocker.';

  const boundaryRows = Object.entries(report.boundary)
    .map(([field, value]) => `| ${sanitizeNodePreflightText(field)} | ${value} |`)
    .join('\n');

  return [
    '# Bridge Readiness Node Preflight Report',
    '',
    'This report checks whether the configured non-mainnet Ergo node can support bridge readiness evidence collection.',
    'It does not close release evidence, authorize claims, deploy, sign, submit, or broadcast transactions.',
    '',
    '## Command Result',
    '',
    '| Field | Value |',
    '|---|---|',
    ...rows.map(([field, value]) => `| ${field} | ${value} |`),
    '',
    '## Endpoint Checks',
    '',
    checks,
    '',
    '## Boundary',
    '',
    '| Boundary | Value |',
    '|---|---|',
    boundaryRows,
    '',
    report.result === 'PASS'
      ? 'This is prerequisite output only. It proves the local node prerequisite is available for later evidence commands, not that any release gate row is complete.'
      : 'This is blocker output only. It records why node-backed bridge readiness evidence cannot be collected yet.',
    '',
  ].join('\n');
}

async function requestJson(
  fetchFn: NodePreflightFetch,
  nodeUrl: string,
  path: string,
  options: {
    method?: 'GET' | 'POST';
    body?: unknown;
    state: ProbeState;
  },
): Promise<any> {
  options.state.requestAttempted = true;
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (method === 'POST') headers['Content-Type'] = 'application/json';

  const response = await fetchFn(new URL(path, normalizedBaseNodeUrl(nodeUrl)), {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path}: ${response.status} ${truncateForReport(text)}`);
  }
  if (text.trim().length === 0) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${method} ${path}: response was not JSON`);
  }
}

function buildBlockedReport(input: {
  command: string;
  nodeEndpoint: string;
  reason: string;
  state: ProbeState;
  observedError?: string;
  network?: string;
  height?: string;
}): ReadinessNodePreflightReport {
  return {
    result: 'BLOCKED',
    exitCode: 1,
    command: sanitizeNodePreflightText(input.command),
    nodeEndpoint: sanitizeNodePreflightText(input.nodeEndpoint),
    reason: sanitizeNodePreflightText(input.reason),
    observedError: input.observedError,
    network: input.network ? sanitizeNodePreflightText(input.network) : undefined,
    height: input.height ? sanitizeNodePreflightText(input.height) : undefined,
    checks: [],
    boundary: buildBoundary(input.state),
  };
}

function buildBoundary(state: ProbeState): Record<string, 'yes' | 'no'> {
  return {
    'Ergo node request attempted': state.requestAttempted ? 'yes' : 'no',
    'Node info endpoint reachable': state.infoReachable ? 'yes' : 'no',
    'Node network identified as non-mainnet': state.nonMainnet ? 'yes' : 'no',
    'Header endpoint reachable': state.headerReachable ? 'yes' : 'no',
    'Script compile endpoint reachable': state.scriptCompileReachable ? 'yes' : 'no',
    ...DEFAULT_BOUNDARY,
  };
}

function initialProbeState(): ProbeState {
  return {
    requestAttempted: false,
    infoReachable: false,
    nonMainnet: false,
    headerReachable: false,
    scriptCompileReachable: false,
  };
}

function normalizedBaseNodeUrl(nodeUrl: string): URL {
  const url = new URL(nodeUrl);
  if (!url.pathname.endsWith('/')) url.pathname = `${url.pathname}/`;
  return url;
}

function normalizeNodeEndpointForReport(nodeUrl: string): string {
  try {
    const url = new URL(nodeUrl);
    url.username = '';
    url.password = '';
    return sanitizeNodePreflightText(url.toString().replace(/\/$/, ''));
  } catch {
    return '<invalid node endpoint>';
  }
}

function summarizeNodePreflightError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined;
  const causeSummary = summarizeCause(cause);
  return sanitizeNodePreflightText([message, causeSummary].filter(Boolean).join('; '));
}

function summarizeCause(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null) return undefined;
  const record = cause as Record<string, unknown>;
  const code = stringifyCauseField(record.code);
  const syscall = stringifyCauseField(record.syscall);
  const address = stringifyCauseField(record.address);
  const port = stringifyCauseField(record.port);

  if (code && address && port) {
    return `${syscall || 'connect'} ${code} ${address}:${port}`;
  }
  if (code) return code;
  return undefined;
}

function stringifyCauseField(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return undefined;
}

function truncateForReport(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 240 ? `${trimmed.slice(0, 240)}...` : trimmed;
}

function sanitizeNodePreflightText(value: string): string {
  return sanitizeReportText(
    value.replace(/https?:\/\/[^@\s`'")|]+@/gi, match => `${match.split('//')[0]}//[redacted-credentials]@`),
  );
}
