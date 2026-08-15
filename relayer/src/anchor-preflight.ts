/**
 * Anchor Preflight -- pure helpers for 0x0401 extension field readiness checks.
 *
 * These classify the anchor status based on extension field scan results.
 * Optionally verifies that the anchor value matches an expected bridge event root.
 * No live node required -- all pure functions.
 */

import type { ErgoExtensionField } from './ergo-client.js';
import type { PreflightStatus } from './batch-demo-preflight.js';

export const DEFAULT_ANCHOR_KEY = '0401';

export interface AnchorScanResult {
  /** Total number of 0x0401 fields found in the scan window */
  anchorCount: number;
  /** Newest anchor field (closest to chain tip) */
  newestAnchor: ErgoExtensionField | null;
  /** Oldest anchor field (deepest in lookback) */
  oldestAnchor: ErgoExtensionField | null;
  /** All discovered anchors ordered by height ascending */
  anchors: ErgoExtensionField[];
}

export interface AnchorClassification {
  status: PreflightStatus;
  message: string;
  /** Age in blocks of newest anchor (currentHeight - anchorHeight), or null if none */
  newestAnchorAge: number | null;
}

/**
 * Normalize an extension key to lowercase without 0x prefix, for matching.
 */
export function normalizeExtensionKey(key: string): string {
  const lower = key.toLowerCase();
  const clean = lower.startsWith('0x') ? lower.slice(2) : lower;
  return clean;
}

/**
 * Normalize an extension value for comparison (lowercase, strip 0x prefix).
 */
export function normalizeExtensionValue(value: string): string {
  const lower = value.toLowerCase();
  return lower.startsWith('0x') ? lower.slice(2) : lower;
}

const HEX_64_RE = /^[0-9a-f]{64}$/;

export interface ParsedExpectedRoot {
  /** Normalized 64-char lowercase hex root, or undefined on error */
  root: string | undefined;
  /** Human-readable error if input is malformed */
  error: string | undefined;
}

export interface ParsedAnchorPreflightArgs {
  /** Raw operator-provided expected bridge event root, if present. */
  rawExpectedRoot: string | undefined;
  /** Explicit opt-in for diagnostic presence-only scans. */
  allowGenericAnchorScan: boolean;
  /** Explicit read-only Ergo node endpoint. */
  nodeUrl: string | undefined;
  /** Explicit scan lookback window in blocks. */
  lookbackBlocks: number | undefined;
  /** Explicit upper bound for blocks scanned inside the lookback window. */
  maxScanBlocks: number | undefined;
  /** Explicit minimum confirmation depth for accepted anchors. */
  minConfirmations: number | undefined;
  /** Optional Markdown report output path. */
  out: string | undefined;
  /** Optional structured JSON report output path. */
  jsonOut: string | undefined;
  /** Optional sanitized extension-observation JSON output path. */
  observationsOut: string | undefined;
  /** Human-readable argument errors. */
  errors: string[];
}

export interface ExpectedRootRequirement {
  status: PreflightStatus;
  message: string;
  mode: 'root-bound' | 'generic-diagnostic' | 'missing-required-root';
}

/**
 * Parse an operator-provided expected root string.
 *
 * Accepts:
 *   - raw 64-char hex: `aabb...`
 *   - 0x-prefixed hex: `0xaabb...`
 *   - extension pair:  `0401:aabb...`
 *   - extension pair:  `0x0401:aabb...`
 *
 * Returns { root, error }. On malformed input, root is undefined and
 * error contains a human-readable message.
 */
export function parseExpectedRoot(input: string): ParsedExpectedRoot {
  const trimmed = input.trim();
  if (!trimmed) {
    return { root: undefined, error: 'expected root is empty' };
  }

  let candidate: string;

  // Check for extension pair format: key:value
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx !== -1) {
    const key = normalizeExtensionKey(trimmed.slice(0, colonIdx));
    if (key !== '0401') {
      return { root: undefined, error: `expected root key prefix '${trimmed.slice(0, colonIdx)}' is not 0401` };
    }
    candidate = trimmed.slice(colonIdx + 1);
  } else {
    candidate = trimmed;
  }

  // Strip optional 0x prefix from the value part
  const normalized = normalizeExtensionValue(candidate);

  if (!HEX_64_RE.test(normalized)) {
    const lenInfo = `got ${normalized.length} chars`;
    return {
      root: undefined,
      error: `expected root must be 32-byte hex (64 chars) or 0401:<32-byte hex> (${lenInfo})`,
    };
  }

  return { root: normalized, error: undefined };
}

/**
 * Parse anchor preflight CLI/env inputs without touching live nodes.
 */
export function parseAnchorPreflightArgs(
  argv: string[],
  env: Record<string, string | undefined> = {},
): ParsedAnchorPreflightArgs {
  const errors: string[] = [];
  let rawExpectedRoot: string | undefined;
  let out: string | undefined;
  let jsonOut: string | undefined;
  let observationsOut: string | undefined;
  let nodeUrl: string | undefined;
  let lookbackBlocks: number | undefined;
  let maxScanBlocks: number | undefined;
  let minConfirmations: number | undefined;
  let allowGenericAnchorScan =
    env.ANCHOR_PREFLIGHT_ALLOW_GENERIC === 'true' ||
    env.ANCHOR_PREFLIGHT_ALLOW_GENERIC === '1';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--allow-generic-anchor-scan') {
      allowGenericAnchorScan = true;
      continue;
    }
    if (arg === '--out') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        errors.push('--out requires a value');
        continue;
      }
      out = value;
      index += 1;
      continue;
    }
    if (arg === '--json-out') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        errors.push('--json-out requires a value');
        continue;
      }
      jsonOut = value;
      index += 1;
      continue;
    }
    if (arg === '--observations-out') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        errors.push('--observations-out requires a value');
        continue;
      }
      observationsOut = value;
      index += 1;
      continue;
    }
    if (arg === '--node-url') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        errors.push('--node-url requires a value');
        continue;
      }
      nodeUrl = value;
      index += 1;
      continue;
    }
    if (arg === '--lookback-blocks') {
      const parsed = parsePositiveIntegerOption(argv[index + 1], arg);
      if (parsed.error) {
        errors.push(parsed.error);
        if (argv[index + 1] && !argv[index + 1].startsWith('--')) index += 1;
      } else {
        lookbackBlocks = parsed.value;
        index += 1;
      }
      continue;
    }
    if (arg === '--max-scan-blocks') {
      const parsed = parsePositiveIntegerOption(argv[index + 1], arg);
      if (parsed.error) {
        errors.push(parsed.error);
        if (argv[index + 1] && !argv[index + 1].startsWith('--')) index += 1;
      } else {
        maxScanBlocks = parsed.value;
        index += 1;
      }
      continue;
    }
    if (arg === '--min-confirmations') {
      const parsed = parsePositiveIntegerOption(argv[index + 1], arg);
      if (parsed.error) {
        errors.push(parsed.error);
        if (argv[index + 1] && !argv[index + 1].startsWith('--')) index += 1;
      } else {
        minConfirmations = parsed.value;
        index += 1;
      }
      continue;
    }
    if (arg.startsWith('--')) {
      errors.push(`unknown anchor preflight option: ${arg}`);
      continue;
    }
    if (rawExpectedRoot !== undefined) {
      errors.push('anchor preflight accepts at most one expected bridgeEventRootHex argument');
      continue;
    }
    rawExpectedRoot = arg;
  }

  if (rawExpectedRoot === undefined) {
    const envExpected = env.EXPECTED_BRIDGE_EVENT_ROOT_HEX?.trim();
    rawExpectedRoot = envExpected || undefined;
  }

  return {
    rawExpectedRoot,
    allowGenericAnchorScan,
    nodeUrl,
    lookbackBlocks,
    maxScanBlocks,
    minConfirmations,
    out,
    jsonOut,
    observationsOut,
    errors,
  };
}

function parsePositiveIntegerOption(
  value: string | undefined,
  option: string,
): { value: number; error?: undefined } | { value?: undefined; error: string } {
  if (!value || value.startsWith('--') || !/^[1-9][0-9]*$/.test(value)) {
    return { error: `${option} requires a positive integer` };
  }
  return { value: Number(value) };
}

/**
 * Classify whether the scan is bound to a concrete bridgeEventRootHex.
 */
export function classifyExpectedRootRequirement(
  expectedRoot: string | undefined,
  allowGenericAnchorScan: boolean,
): ExpectedRootRequirement {
  if (expectedRoot !== undefined) {
    return {
      status: 'PASS',
      mode: 'root-bound',
      message: `root-bound scan for bridgeEventRootHex ${expectedRoot.slice(0, 16)}...`,
    };
  }

  if (allowGenericAnchorScan) {
    return {
      status: 'WARN',
      mode: 'generic-diagnostic',
      message:
        'no bridgeEventRootHex provided; generic 0x0401 scan is diagnostic only and cannot satisfy readiness evidence',
    };
  }

  return {
    status: 'FAIL',
    mode: 'missing-required-root',
    message:
      'bridgeEventRootHex is required; pass <bridgeEventRootHex> or 0401:<bridgeEventRootHex> ' +
      'to prove exact anchor binding',
  };
}

/**
 * Filter extension fields for a specific anchor key.
 */
export function filterAnchorFields(
  fields: ErgoExtensionField[],
  anchorKey: string = DEFAULT_ANCHOR_KEY,
): ErgoExtensionField[] {
  const normalizedTarget = normalizeExtensionKey(anchorKey);
  return fields.filter(f => normalizeExtensionKey(f.key) === normalizedTarget);
}

/**
 * Scan a flat array of extension fields (from multiple heights) and
 * return the anchor scan result.
 */
export function buildAnchorScanResult(
  allFields: ErgoExtensionField[],
  anchorKey: string = DEFAULT_ANCHOR_KEY,
): AnchorScanResult {
  const anchors = filterAnchorFields(allFields, anchorKey)
    .sort((a, b) => a.height - b.height);

  return {
    anchorCount: anchors.length,
    newestAnchor: anchors.length > 0 ? anchors[anchors.length - 1] : null,
    oldestAnchor: anchors.length > 0 ? anchors[0] : null,
    anchors,
  };
}

/**
 * Classify anchor readiness from a scan result.
 */
export function classifyAnchorStatus(
  scan: AnchorScanResult,
  currentHeight: number,
  minConfirmations: number,
  expectedRoot?: string,
): AnchorClassification {
  if (scan.anchorCount === 0) {
    return {
      status: 'FAIL',
      message: `no 0x0401 anchor found in scan window`,
      newestAnchorAge: null,
    };
  }

  // If an expected root is provided, verify that at least one anchor matches
  if (expectedRoot) {
    const normalizedExpected = normalizeExtensionValue(expectedRoot);
    const matching = scan.anchors.filter(
      a => normalizeExtensionValue(a.value) === normalizedExpected,
    );
    if (matching.length === 0) {
      const preview = scan.newestAnchor!.value.length > 16
        ? scan.newestAnchor!.value.slice(0, 16) + '...'
        : scan.newestAnchor!.value;
      return {
        status: 'FAIL',
        message: `${scan.anchorCount} anchor(s) found but none match expected root ${normalizedExpected.slice(0, 16)}... (newest value: ${preview})`,
        newestAnchorAge: currentHeight - scan.newestAnchor!.height,
      };
    }
    // Use the newest matching anchor for age classification
    const newestMatching = matching[matching.length - 1];
    const matchAge = currentHeight - newestMatching.height;
    if (matchAge < minConfirmations) {
      return {
        status: 'WARN',
        message: `matching anchor at height ${newestMatching.height} is only ${matchAge} blocks old (need ${minConfirmations})`,
        newestAnchorAge: matchAge,
      };
    }
    return {
      status: 'PASS',
      message: `matching anchor at height ${newestMatching.height}, age=${matchAge} blocks (>= ${minConfirmations} required)`,
      newestAnchorAge: matchAge,
    };
  }

  // Generic mode: any 0401 is accepted
  const newestAge = currentHeight - scan.newestAnchor!.height;
  if (newestAge < minConfirmations) {
    return {
      status: 'WARN',
      message: `anchor at height ${scan.newestAnchor!.height} is only ${newestAge} blocks old (need ${minConfirmations})`,
      newestAnchorAge: newestAge,
    };
  }

  return {
    status: 'PASS',
    message: `anchor at height ${scan.newestAnchor!.height}, age=${newestAge} blocks (>= ${minConfirmations} required)`,
    newestAnchorAge: newestAge,
  };
}

/**
 * Compute the scan window given current height and lookback.
 */
export function computeScanWindow(
  currentHeight: number,
  lookbackBlocks: number,
): { minHeight: number; maxHeight: number } {
  const maxHeight = currentHeight;
  const minHeight = Math.max(0, currentHeight - lookbackBlocks + 1);
  return { minHeight, maxHeight };
}
