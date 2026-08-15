/**
 * Pure helpers for patched-devnet go/no-go classification.
 *
 * Extracted so the final verdict logic and report formatting can be
 * unit-tested without I/O, process.exit(), or network calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CheckStatus = 'PASS' | 'WARN' | 'FAIL';

export interface CheckResult {
  status: CheckStatus;
  label: string;
  detail: string;
  /** True if this check represents a live-execution prerequisite. */
  liveExecution?: boolean;
}

export function pass(label: string, detail: string, liveExecution?: boolean): CheckResult {
  return { status: 'PASS', label, detail, liveExecution };
}
export function warn(label: string, detail: string, liveExecution?: boolean): CheckResult {
  return { status: 'WARN', label, detail, liveExecution };
}
export function fail(label: string, detail: string, liveExecution?: boolean): CheckResult {
  return { status: 'FAIL', label, detail, liveExecution };
}

export const PATCHED_DEVNET_REQUIRED_SCRIPTS = [
  'e2e:aggregate',
  'demo:devnet:safety',
  'demo:patched-devnet:readiness',
  'demo:anchor:preflight',
] as const;

export const PATCHED_DEVNET_RETIRED_SCRIPTS = [
  'deploy',
  'deploy:sidechain',
] as const;

const PATCHED_DEVNET_RETIRED_SCRIPT_REASONS = {
  deploy: 'legacy SCS/DUP deployment must not be exposed by package.json',
  'deploy:sidechain': 'legacy owner-mint deployment must not be exposed by package.json',
} as const satisfies Record<typeof PATCHED_DEVNET_RETIRED_SCRIPTS[number], string>;

export function classifyPatchedDevnetPackageScripts(
  scripts: Readonly<Record<string, string | undefined>>,
): CheckResult[] {
  const results = PATCHED_DEVNET_REQUIRED_SCRIPTS.map(name =>
    scripts[name]
      ? pass(`script: ${name}`, scripts[name])
      : fail(`script: ${name}`, 'not found in package.json')
  );
  for (const name of PATCHED_DEVNET_RETIRED_SCRIPTS) {
    results.push(
      scripts[name]
        ? fail(
            `retired script: ${name}`,
            PATCHED_DEVNET_RETIRED_SCRIPT_REASONS[name],
          )
        : pass(`retired script: ${name}`, 'absent from package.json'),
    );
  }
  return results;
}

// ---------------------------------------------------------------------------
// Final verdict
// ---------------------------------------------------------------------------

export type Verdict =
  | 'NO-GO'
  | 'LOCAL_PREREQS_OK'
  | 'READY';

export interface VerdictResult {
  verdict: Verdict;
  message: string;
  exitCode: number;
}

export const GO_NO_GO_SCHEMA_VERSION = 2 as const;

export interface GoNoGoJsonReport {
  schemaVersion: typeof GO_NO_GO_SCHEMA_VERSION;
  command: 'demo:patched-devnet:go-no-go';
  generatedAt: string;
  secretEnvInspection: 'disabled' | 'enabled';
  nodeConfigInspection: 'disabled' | 'enabled';
  runtimeStateInspection: 'inspected' | 'skipped';
  checks: CheckResult[];
  summary: {
    verdict: Verdict;
    message: string;
    exitCode: number;
    passCount: number;
    warnCount: number;
    failCount: number;
    liveExecutionWarnCount: number;
  };
  boundary: {
    noEnvFileLoaded: true;
    noSigning: true;
    noBroadcast: true;
    noDbWrites: true;
    noDeployment: true;
  };
}

export interface GoNoGoReportValidation {
  status: 'PASS' | 'BLOCKED';
  message: string;
  errors: string[];
  report?: GoNoGoJsonReport;
}

/**
 * Classify the combined go/no-go result.
 *
 * - Any FAIL => NO-GO (exit 1)
 * - No FAIL but live-execution WARNs => LOCAL PREREQS OK (exit 0)
 * - All PASS => LOCAL PREREQS OK while no reviewed activated value profile exists
 */
export function classifyFinalVerdict(results: CheckResult[]): VerdictResult {
  const hasFail = results.some(r => r.status === 'FAIL');
  if (hasFail) {
    return {
      verdict: 'NO-GO',
      message: 'RESULT: NO-GO -- resolve FAIL items before proceeding',
      exitCode: 1,
    };
  }

  const liveWarns = results.filter(r => r.status === 'WARN' && r.liveExecution);
  if (liveWarns.length > 0) {
    return {
      verdict: 'LOCAL_PREREQS_OK',
      message: 'RESULT: LOCAL PREREQS OK -- EXECUTION NOT READY',
      exitCode: 0,
    };
  }

  const anyWarn = results.some(r => r.status === 'WARN');
  if (anyWarn) {
    // Non-live warnings (e.g. informational) still mean not fully ready
    return {
      verdict: 'LOCAL_PREREQS_OK',
      message: 'RESULT: LOCAL PREREQS OK -- EXECUTION NOT READY',
      exitCode: 0,
    };
  }

  return {
    verdict: 'LOCAL_PREREQS_OK',
    message:
      'RESULT: LOCAL PREREQS OK -- VALUE EXECUTION DISABLED; reviewed activated profile required',
    exitCode: 0,
  };
}

export function buildGoNoGoJsonReport(
  results: CheckResult[],
  options: {
    generatedAt?: string;
    secretEnvInspection?: 'disabled' | 'enabled';
    nodeConfigInspection?: 'disabled' | 'enabled';
    runtimeStateInspection?: 'inspected' | 'skipped';
  } = {},
): GoNoGoJsonReport {
  const verdict = classifyFinalVerdict(results);
  return {
    schemaVersion: GO_NO_GO_SCHEMA_VERSION,
    command: 'demo:patched-devnet:go-no-go',
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    secretEnvInspection: options.secretEnvInspection ?? 'disabled',
    nodeConfigInspection: options.nodeConfigInspection ?? 'disabled',
    runtimeStateInspection: options.runtimeStateInspection ?? 'inspected',
    checks: results,
    summary: {
      verdict: verdict.verdict,
      message: verdict.message,
      exitCode: verdict.exitCode,
      passCount: results.filter(r => r.status === 'PASS').length,
      warnCount: results.filter(r => r.status === 'WARN').length,
      failCount: results.filter(r => r.status === 'FAIL').length,
      liveExecutionWarnCount: results.filter(r => r.status === 'WARN' && r.liveExecution).length,
    },
    boundary: {
      noEnvFileLoaded: true,
      noSigning: true,
      noBroadcast: true,
      noDbWrites: true,
      noDeployment: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Runtime file classification
// ---------------------------------------------------------------------------

/**
 * Classify a runtime file's status for the go/no-go report.
 *
 * @param label  Bridge-root-relative path label
 * @param exists Whether the file exists on disk
 * @param dirty  Whether git reports uncommitted changes
 */
export function classifyRuntimeFile(
  label: string,
  exists: boolean,
  dirty: boolean,
): CheckResult {
  if (!exists) {
    return pass(`${label} (dirty?)`, 'does not exist', true);
  }
  if (dirty) {
    return warn(`${label} (dirty?)`, 'has uncommitted changes', true);
  }
  return pass(`${label} (dirty?)`, 'exists, clean', true);
}

export function runtimeStateInspectionSkipped(): CheckResult {
  return warn(
    'Runtime state inspection',
    'disabled by --skip-runtime-state-checks; deployment-state files, SQLite state, and backup directories are not inspected',
    true,
  );
}

export function nodeConfigInspectionSkipped(): CheckResult {
  return warn(
    'Devnet signer alignment',
    'node config inspection disabled by default; pass --include-secret-env only for a local signer alignment check',
    true,
  );
}

// ---------------------------------------------------------------------------
// JSON report validation
// ---------------------------------------------------------------------------

export function validateGoNoGoJsonReport(json: unknown): GoNoGoReportValidation {
  const errors: string[] = [];
  if (!isRecord(json)) {
    return blockedGoNoGoReport(['go/no-go JSON report must be an object']);
  }

  if (json.schemaVersion !== GO_NO_GO_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${GO_NO_GO_SCHEMA_VERSION}`);
  }
  if (json.command !== 'demo:patched-devnet:go-no-go') {
    errors.push('command must be demo:patched-devnet:go-no-go');
  }
  if (typeof json.generatedAt !== 'string' || !isIsoDateString(json.generatedAt)) {
    errors.push('generatedAt must be an ISO timestamp');
  }
  if (json.secretEnvInspection !== 'disabled') {
    errors.push('secretEnvInspection must be disabled');
  }
  if (json.nodeConfigInspection !== 'disabled') {
    errors.push('nodeConfigInspection must be disabled');
  }
  if (json.runtimeStateInspection !== 'skipped') {
    errors.push('runtimeStateInspection must be skipped');
  }

  const checks = Array.isArray(json.checks) ? json.checks : undefined;
  if (!checks || checks.length === 0) {
    errors.push('checks must be a non-empty array');
  }
  const typedChecks = checks?.filter(isCheckResult) ?? [];
  if (checks && typedChecks.length !== checks.length) {
    errors.push('checks must contain only status/label/detail result objects');
  }

  const boundary = isRecord(json.boundary) ? json.boundary : undefined;
  if (!boundary) {
    errors.push('boundary must be an object');
  } else {
    for (const key of ['noEnvFileLoaded', 'noSigning', 'noBroadcast', 'noDbWrites', 'noDeployment'] as const) {
      if (boundary[key] !== true) errors.push(`boundary.${key} must be true`);
    }
  }

  const summary = isRecord(json.summary) ? json.summary : undefined;
  if (!summary) {
    errors.push('summary must be an object');
  } else {
    if (!isVerdict(summary.verdict)) errors.push('summary.verdict must be a known go/no-go verdict');
    if (typeof summary.message !== 'string' || summary.message.trim().length === 0) {
      errors.push('summary.message must be non-empty');
    }
    if (typeof summary.exitCode !== 'number') errors.push('summary.exitCode must be a number');
    if (summary.verdict === 'READY') {
      errors.push(
        'summary.verdict must not be READY without a reviewed activated value profile',
      );
    }
    assertSummaryCount(summary, 'passCount', typedChecks.filter(r => r.status === 'PASS').length, errors);
    assertSummaryCount(summary, 'warnCount', typedChecks.filter(r => r.status === 'WARN').length, errors);
    assertSummaryCount(summary, 'failCount', typedChecks.filter(r => r.status === 'FAIL').length, errors);
    assertSummaryCount(summary, 'liveExecutionWarnCount', typedChecks.filter(r => r.status === 'WARN' && r.liveExecution).length, errors);
  }

  if (typedChecks.length > 0) {
    if (!hasSecretEnvDisabledCheck(typedChecks)) {
      errors.push('checks must include disabled Secret env inspection warning');
    }
    if (!hasNodeConfigInspectionDisabledCheck(typedChecks)) {
      errors.push('checks must include disabled node config inspection warning');
    }
    if (!hasRuntimeStateSkippedCheck(typedChecks)) {
      errors.push('checks must include --skip-runtime-state-checks Runtime state inspection warning');
    }
  }

  const leakedLocalPath = findLocalPathLeak(json);
  if (leakedLocalPath) {
    errors.push('go/no-go JSON report must not serialize local absolute paths');
  }

  if (errors.length > 0) return blockedGoNoGoReport(errors);

  const report = json as unknown as GoNoGoJsonReport;
  return {
    status: 'PASS',
    message: `PASS go/no-go prerequisite report: verdict=${report.summary.verdict}; not Gate 3 closure; not broadcast authorization`,
    errors: [],
    report,
  };
}

function blockedGoNoGoReport(errors: string[]): GoNoGoReportValidation {
  return {
    status: 'BLOCKED',
    message: 'BLOCKED go/no-go prerequisite report',
    errors,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCheckResult(value: unknown): value is CheckResult {
  if (!isRecord(value)) return false;
  return (
    (value.status === 'PASS' || value.status === 'WARN' || value.status === 'FAIL') &&
    typeof value.label === 'string' &&
    typeof value.detail === 'string' &&
    (value.liveExecution === undefined || typeof value.liveExecution === 'boolean')
  );
}

function isVerdict(value: unknown): value is Verdict {
  return value === 'NO-GO' || value === 'LOCAL_PREREQS_OK' || value === 'READY';
}

function isIsoDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && !Number.isNaN(Date.parse(value));
}

function assertSummaryCount(
  summary: Record<string, unknown>,
  key: 'passCount' | 'warnCount' | 'failCount' | 'liveExecutionWarnCount',
  expected: number,
  errors: string[],
): void {
  if (summary[key] !== expected) {
    errors.push(`summary.${key} must match checks`);
  }
}

function hasSecretEnvDisabledCheck(checks: CheckResult[]): boolean {
  return checks.some(check =>
    check.status === 'WARN' &&
    check.label === 'Secret env inspection' &&
    check.liveExecution === true &&
    check.detail.includes('disabled by default'),
  );
}

function hasNodeConfigInspectionDisabledCheck(checks: CheckResult[]): boolean {
  return checks.some(check =>
    check.status === 'WARN' &&
    check.label === 'Devnet signer alignment' &&
    check.liveExecution === true &&
    check.detail.includes('node config inspection disabled') &&
    check.detail.includes('--include-secret-env'),
  );
}

function hasRuntimeStateSkippedCheck(checks: CheckResult[]): boolean {
  return checks.some(check =>
    check.status === 'WARN' &&
    check.label === 'Runtime state inspection' &&
    check.liveExecution === true &&
    check.detail.includes('--skip-runtime-state-checks') &&
    check.detail.includes('deployment-state files') &&
    check.detail.includes('SQLite state') &&
    check.detail.includes('backup directories'),
  );
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

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

/**
 * Format the full go/no-go report as plain ASCII text.
 */
export function formatGoNoGoReport(results: CheckResult[]): string {
  const lines: string[] = [];
  const SEP = '='.repeat(70);

  lines.push(SEP);
  lines.push('  Patched Devnet Go/No-Go Checklist');
  lines.push(SEP);
  lines.push('');

  for (const r of results) {
    const prefix =
      r.status === 'FAIL' ? '  [FAIL]' :
      r.status === 'WARN' ? '  [WARN]' :
      '  [PASS]';
    lines.push(`${prefix} ${r.label}: ${r.detail}`);
  }

  lines.push('');
  const verdict = classifyFinalVerdict(results);
  lines.push(`  ${verdict.message}`);
  lines.push('');

  return lines.join('\n');
}
