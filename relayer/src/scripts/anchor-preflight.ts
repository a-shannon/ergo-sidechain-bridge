/**
 * Anchor Preflight -- read-only check for 0x0401 extension fields.
 *
 * Scans recent Ergo blocks for sidechain anchor fields and reports
 * whether the aggregate settlement anchor prerequisite is met.
 *
 * Usage:
 *   npm.cmd run demo:anchor:preflight -- <bridgeEventRootHex>
 *   npm.cmd run demo:anchor:preflight -- 0401:<bridgeEventRootHex>
 *   npm.cmd run demo:anchor:preflight -- --allow-generic-anchor-scan
 *   npm.cmd run demo:anchor:preflight -- --allow-generic-anchor-scan --node-url <http://...> --lookback-blocks <n> --max-scan-blocks <n> --min-confirmations <n> --out ../evidence/readiness/<report.md> --json-out ../evidence/readiness/<report.json> --observations-out ../evidence/readiness/<observations.json>
 *
 * Or via env:
 *   $env:EXPECTED_BRIDGE_EVENT_ROOT_HEX = "<hex>"
 *   npm.cmd run demo:anchor:preflight
 *
 * Generic scans require --allow-generic-anchor-scan, are diagnostic only, and
 * intentionally exit non-zero until rerun with a concrete bridgeEventRootHex.
 *
 * Accepted expected root formats:
 *   - raw 64-char hex
 *   - 0x-prefixed hex
 *   - 0401:<hex> (full extension pair)
 *   - 0x0401:<hex>
 *
 * If an expected root is given, PASS only if a 0401 value matches it.
 * If no expected root is given, the command FAILS unless explicit diagnostic
 * generic mode is enabled.
 *
 * No .env loading. No signing. No DB writes. No POST mutations.
 * Uses process.env for config (set in shell if needed).
 */

import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { ErgoClient, type ErgoExtensionField } from '../ergo-client.js';
import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js';
import {
  buildAnchorScanResult,
  classifyExpectedRootRequirement,
  classifyAnchorStatus,
  computeScanWindow,
  normalizeExtensionKey,
  parseAnchorPreflightArgs,
  parseExpectedRoot,
  type AnchorClassification,
  type AnchorScanResult,
  type ExpectedRootRequirement,
} from '../anchor-preflight.js';
import { formatPreflightReport, type PreflightCheck } from '../batch-demo-preflight.js';
import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';

const DEFAULT_LOOKBACK = parseInt(process.env.AGGREGATE_ANCHOR_LOOKBACK_BLOCKS ?? '720', 10);
const DEFAULT_MIN_CONFIRMATIONS = parseInt(process.env.AGGREGATE_ANCHOR_MIN_CONFIRMATIONS ?? '10', 10);

function emitReport(checks: PreflightCheck[], out?: string): void {
  const report = formatPreflightReport(checks, 'Anchor Preflight');
  console.log(report);
  writeReport(out, report);
}

function emitReports(
  checks: PreflightCheck[],
  out: string | undefined,
  jsonOut: string | undefined,
  report: AnchorPreflightJsonReport,
): void {
  emitReport(checks, out);
  if (!jsonOut) return;
  const output = writeOfflineReportJson(jsonOut, report);
  if (output.errors.length > 0) {
    for (const error of output.errors) console.error(error);
    process.exit(1);
  }
  console.log(formatOfflineReportJsonWriteLine('anchor preflight JSON report', jsonOut));
}

function writeReport(out: string | undefined, markdown: string): void {
  if (!out) return;
  const resolved = resolveEvidenceOutputPath(out);
  if (resolved.errors.length > 0 || !resolved.path) {
    for (const error of resolved.errors) console.error(error);
    process.exit(1);
  }
  mkdirSync(dirname(resolved.path), { recursive: true });
  writeFileSync(resolved.path, markdown, { encoding: 'utf8', flag: 'wx' });
}

interface AnchorPreflightJsonReport {
  status: PreflightCheck['status'];
  exitCode: number;
  expectedRoot: {
    mode: ExpectedRootRequirement['mode'];
    status: PreflightCheck['status'];
    provided: boolean;
    rootHex?: string;
    message: string;
  };
  node: {
    endpoint: string;
    requestAttempted: boolean;
    currentHeight?: number;
  };
  scanWindow?: {
    minHeight: number;
    maxHeight: number;
    lookbackBlocks: number;
    maxScanBlocks: number;
    scannedBlocks: number;
  };
  anchorScan?: {
    anchorKey: '0401';
    anchorCount: number;
    newestAnchorHeight?: number;
    newestAnchorAge?: number;
  };
  checks: PreflightCheck[];
  boundary: Record<string, string>;
}

interface AnchorPreflightObservationRow {
  height: number;
  fields: ErgoExtensionField[];
}

interface AnchorPreflightObservationJson {
  schemaVersion: 1;
  command: 'demo:anchor:preflight';
  sourceLabel: 'demo:anchor:preflight read-only Ergo extension scan';
  network?: string;
  nodeUrl: string;
  observedAt: string;
  scanWindow: {
    minHeight: number;
    maxHeight: number;
    lookbackBlocks: number;
    maxScanBlocks: number;
    scannedBlocks: number;
  };
  heights: AnchorPreflightObservationRow[];
  boundary: Record<string, string>;
}

function buildJsonReport(input: {
  checks: PreflightCheck[];
  expectedRootRequirement: ExpectedRootRequirement;
  expectedRoot?: string;
  nodeEndpoint: string;
  nodeRequestAttempted: boolean;
  currentHeight?: number;
  nodeNetwork?: string;
  scanWindow?: {
    minHeight: number;
    maxHeight: number;
    lookbackBlocks: number;
    maxScanBlocks: number;
    scannedBlocks: number;
  };
  scan?: AnchorScanResult;
  classification?: AnchorClassification;
}): AnchorPreflightJsonReport {
  const hasFail = input.checks.some(c => c.status === 'FAIL');
  const status: PreflightCheck['status'] = hasFail
    ? 'FAIL'
    : input.checks.some(c => c.status === 'WARN')
      ? 'WARN'
      : 'PASS';
  const newestAnchorAge = input.classification?.newestAnchorAge ?? undefined;
  return {
    status,
    exitCode: hasFail ? 1 : 0,
    expectedRoot: {
      mode: input.expectedRootRequirement.mode,
      status: input.expectedRootRequirement.status,
      provided: input.expectedRoot !== undefined,
      ...(input.expectedRoot ? { rootHex: input.expectedRoot } : {}),
      message: input.expectedRootRequirement.message,
    },
    node: {
      endpoint: input.nodeEndpoint,
      requestAttempted: input.nodeRequestAttempted,
      ...(input.currentHeight !== undefined ? { currentHeight: input.currentHeight } : {}),
      ...(input.nodeNetwork !== undefined ? { network: input.nodeNetwork } : {}),
    },
    ...(input.scanWindow ? { scanWindow: input.scanWindow } : {}),
    ...(input.scan ? {
      anchorScan: {
        anchorKey: '0401',
        anchorCount: input.scan.anchorCount,
        ...(input.scan.newestAnchor ? { newestAnchorHeight: input.scan.newestAnchor.height } : {}),
        ...(newestAnchorAge !== undefined && newestAnchorAge !== null ? { newestAnchorAge } : {}),
      },
    } : {}),
    checks: input.checks,
    boundary: {
      'Ergo node request attempted': input.nodeRequestAttempted ? 'yes' : 'no',
      'Read-only Ergo node client': 'yes',
      'Node wallet used': 'no',
      'ERGO_API_KEY read': 'no',
      'Runtime database opened': 'no',
      'Deployment state opened': 'no',
      'Private key material serialized': 'no',
      'Transaction broadcast, submit, deploy, or state mutation performed': 'no',
      'Evidence row closure claimed': 'no',
      'Release gate PASS claimed': 'no',
    },
  };
}

function buildObservationJson(input: {
  nodeEndpoint: string;
  nodeNetwork?: string;
  observedAt: string;
  scanWindow: {
    minHeight: number;
    maxHeight: number;
    lookbackBlocks: number;
    maxScanBlocks: number;
    scannedBlocks: number;
  };
  observationRows: AnchorPreflightObservationRow[];
}): AnchorPreflightObservationJson {
  return {
    schemaVersion: 1,
    command: 'demo:anchor:preflight',
    sourceLabel: 'demo:anchor:preflight read-only Ergo extension scan',
    ...(input.nodeNetwork !== undefined ? { network: input.nodeNetwork } : {}),
    nodeUrl: input.nodeEndpoint,
    observedAt: input.observedAt,
    scanWindow: input.scanWindow,
    heights: input.observationRows,
    boundary: {
      'Sanitized public extension observations only': 'yes',
      'Read-only Ergo node client': 'yes',
      'Node wallet used': 'no',
      'ERGO_API_KEY read': 'no',
      'Auth header sent': 'no',
      'Runtime database opened': 'no',
      'Deployment state opened': 'no',
      'Private key material serialized': 'no',
      'Transaction broadcast, submit, deploy, or state mutation performed': 'no',
      'Evidence row closure claimed': 'no',
      'Release gate PASS claimed': 'no',
    },
  };
}

function writeObservationJson(
  observationsOut: string | undefined,
  report: AnchorPreflightObservationJson,
): void {
  if (!observationsOut) return;
  const output = writeOfflineReportJson(observationsOut, report);
  if (output.errors.length > 0) {
    for (const error of output.errors) console.error(error);
    process.exit(1);
  }
  console.log(formatOfflineReportJsonWriteLine('anchor observation input JSON', observationsOut));
}

async function main(): Promise<void> {
  const checks: PreflightCheck[] = [];
  const parsedArgs = parseAnchorPreflightArgs(process.argv.slice(2), process.env);
  const lookback = parsedArgs.lookbackBlocks ?? DEFAULT_LOOKBACK;
  const minConfirmations = parsedArgs.minConfirmations ?? DEFAULT_MIN_CONFIRMATIONS;
  const nodeEndpoint = parsedArgs.nodeUrl ? parsedArgs.nodeUrl.replace(/\/$/, '') : 'default read-only node endpoint';
  const jsonOutputTarget = parsedArgs.jsonOut ? resolveEvidenceJsonOutputPath(parsedArgs.jsonOut) : undefined;
  if (jsonOutputTarget?.errors.length) {
    for (const error of jsonOutputTarget.errors) console.error(error);
    process.exit(1);
  }
  const observationsOutputTarget = parsedArgs.observationsOut
    ? resolveEvidenceJsonOutputPath(parsedArgs.observationsOut, { optionName: '--observations-out' })
    : undefined;
  if (observationsOutputTarget?.errors.length) {
    for (const error of observationsOutputTarget.errors) console.error(error);
    process.exit(1);
  }

  // Parse and validate expected root if provided
  let expectedRoot: string | undefined;
  let expectedRootRequirement: ExpectedRootRequirement | undefined;
  if (parsedArgs.errors.length > 0) {
    expectedRootRequirement = {
      status: 'FAIL',
      mode: 'missing-required-root',
      message: parsedArgs.errors.join('; '),
    };
    checks.push({
      name: 'Expected root',
      status: 'FAIL',
      message: parsedArgs.errors.join('; '),
    });
    emitReports(checks, parsedArgs.out, parsedArgs.jsonOut, buildJsonReport({
      checks,
      expectedRootRequirement,
      nodeEndpoint,
      nodeRequestAttempted: false,
    }));
    process.exit(1);
  }

  if (parsedArgs.rawExpectedRoot) {
    const parsed = parseExpectedRoot(parsedArgs.rawExpectedRoot);
    if (parsed.error) {
      expectedRootRequirement = {
        status: 'FAIL',
        mode: 'missing-required-root',
        message: parsed.error,
      };
      checks.push({
        name: 'Expected root',
        status: 'FAIL',
        message: parsed.error,
      });
      emitReports(checks, parsedArgs.out, parsedArgs.jsonOut, buildJsonReport({
        checks,
        expectedRootRequirement,
        nodeEndpoint,
        nodeRequestAttempted: false,
      }));
      process.exit(1);
    }
    expectedRoot = parsed.root;
  }

  expectedRootRequirement = classifyExpectedRootRequirement(
    expectedRoot,
    parsedArgs.allowGenericAnchorScan,
  );
  checks.push({
    name: 'Expected root',
    status: expectedRootRequirement.status,
    message: expectedRootRequirement.message,
  });
  if (expectedRootRequirement.status === 'FAIL') {
    emitReports(checks, parsedArgs.out, parsedArgs.jsonOut, buildJsonReport({
      checks,
      expectedRootRequirement,
      nodeEndpoint,
      nodeRequestAttempted: false,
    }));
    process.exit(1);
  }

  // -- 1. Ergo node connectivity --
  const ergo = new ErgoClient(parsedArgs.nodeUrl, { readOnly: true });
  let currentHeight: number;
  let nodeNetwork: string | undefined;
  try {
    const info = await ergo.getInfo();
    currentHeight = info.fullHeight;
    nodeNetwork = info.network;
    checks.push({
      name: 'Ergo node',
      status: 'PASS',
      message: `reachable, network=${nodeNetwork}, height=${currentHeight}`,
    });
  } catch (err: any) {
    checks.push({
      name: 'Ergo node',
      status: 'FAIL',
      message: `unreachable: ${err.message ?? err}`,
    });
    emitReports(checks, parsedArgs.out, parsedArgs.jsonOut, buildJsonReport({
      checks,
      expectedRootRequirement,
      expectedRoot,
      nodeEndpoint,
      nodeRequestAttempted: true,
    }));
    process.exit(1);
  }

  checks.push({
    name: 'Node endpoint',
    status: 'PASS',
    message: nodeEndpoint,
  });

  // -- 2. Scan window --
  const { minHeight, maxHeight } = computeScanWindow(currentHeight, lookback);
  checks.push({
    name: 'Scan window',
    status: 'PASS',
    message: `heights ${minHeight}..${maxHeight} (lookback=${lookback})`,
  });

  // -- 3. Scan for 0x0401 fields --
  const maxScanBlocks = parsedArgs.maxScanBlocks ?? parseInt(
    process.env.ANCHOR_PREFLIGHT_MAX_SCAN_BLOCKS ?? String(lookback), 10,
  );
  const effectiveMinHeight = Math.max(minHeight, maxHeight - maxScanBlocks + 1);
  const allFields: ErgoExtensionField[] = [];
  const observationRows: AnchorPreflightObservationRow[] = [];
  const extensionReadFailures: number[] = [];

  let scannedCount = 0;
  for (let h = maxHeight; h >= effectiveMinHeight; h--) {
    try {
      const fields = (await ergo.getExtensionFieldsAtHeight(h))
        .filter(field => normalizeExtensionKey(field.key).startsWith('04'));
      allFields.push(...fields);
      observationRows.push({ height: h, fields });
    } catch {
      extensionReadFailures.push(h);
      // Block may not exist at this height (e.g. beyond genesis)
    }
    scannedCount++;
  }

  if (parsedArgs.observationsOut && extensionReadFailures.length > 0) {
    checks.push({
      name: 'Observation export',
      status: 'FAIL',
      message: `refusing --observations-out because ${extensionReadFailures.length} scanned height(s) could not be read`,
    });
  }

  // -- 4. Classify results --
  const scan = buildAnchorScanResult(allFields);
  const classification = classifyAnchorStatus(scan, currentHeight, minConfirmations, expectedRoot);

  checks.push({
    name: `0x0401 anchors (scanned ${scannedCount} blocks)`,
    status: classification.status,
    message: classification.message,
  });

  if (scan.anchorCount > 0) {
    const newest = scan.newestAnchor!;
    const valuePreview = newest.value.length > 20
      ? `${newest.value.slice(0, 20)}...`
      : newest.value;
    checks.push({
      name: 'Newest anchor detail',
      status: 'PASS',
      message: `height=${newest.height}, value=${valuePreview} (${newest.value.length / 2} bytes)`,
    });
  }

  checks.push({
    name: `Min confirmations`,
    status: classification.newestAnchorAge !== null && classification.newestAnchorAge >= minConfirmations
      ? 'PASS'
      : classification.newestAnchorAge !== null
        ? 'WARN'
        : 'FAIL',
    message: classification.newestAnchorAge !== null
      ? `newest age=${classification.newestAnchorAge}, required=${minConfirmations}`
      : `no anchor to confirm`,
  });

  if (expectedRootRequirement.mode === 'generic-diagnostic') {
    checks.push({
      name: 'Readiness binding',
      status: 'FAIL',
      message: 'generic anchor scan is not bridgeEventRootHex-bound; rerun with a concrete expected root',
    });
  }

  // -- 5. Report --
  const scanWindow = {
    minHeight,
    maxHeight,
    lookbackBlocks: lookback,
    maxScanBlocks,
    scannedBlocks: scannedCount,
  };

  if (parsedArgs.observationsOut && extensionReadFailures.length === 0) {
    writeObservationJson(parsedArgs.observationsOut, buildObservationJson({
      nodeEndpoint,
      nodeNetwork,
      observedAt: new Date().toISOString(),
      scanWindow,
      observationRows: observationRows.sort((a, b) => a.height - b.height),
    }));
  }

  emitReports(checks, parsedArgs.out, parsedArgs.jsonOut, buildJsonReport({
    checks,
    expectedRootRequirement,
    expectedRoot,
    nodeEndpoint,
    nodeRequestAttempted: true,
    currentHeight,
    nodeNetwork,
    scanWindow,
    scan,
    classification,
  }));

  const hasFail = checks.some(c => c.status === 'FAIL');
  process.exit(hasFail ? 1 : 0);
}

main().catch((err: any) => {
  console.error(`Anchor preflight error: ${err.message ?? err}`);
  process.exit(1);
});
