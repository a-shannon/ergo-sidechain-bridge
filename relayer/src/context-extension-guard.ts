/**
 * Context Extension Safety Guard
 *
 * Pre-signing validation to prevent WASM signing of transactions affected by
 * the sigma-rust/JVM ContextExtension serialization ordering divergence.
 *
 * ROOT CAUSE: sigma-rust uses IndexMap (insertion order) for ContextExtension
 * keys, while sigmastate-interpreter (JVM) uses HashMap for >4 keys (hash-bucket
 * order). Both serialize entries in iteration order, producing different
 * bytesToSign and TX IDs when any input has >4 Vars.
 *
 * TEMPORARY POLICY: This guard blocks inputs with >4 Vars. In the observed
 * sigma-rust/JVM fixture, inputs with <=4 Vars serialized identically because
 * JVM uses Map1..Map4 for small maps. This is NOT a spec guarantee -- it is an
 * observed JVM implementation detail. Upstream canonical serialization is still
 * pending.
 *
 * STATUS: Blocked pending sigma-rust/JVM canonical ContextExtension serialization
 * conformance (upstream issue pending).
 *
 * @see .devnet-diagnostics/upstream-repro/ for the full reproduction package
 */

/**
 * Maximum number of context extension Vars per input allowed by the current
 * temporary bridge policy.
 *
 * In the observed sigma-rust/JVM fixture, <=4 Vars was unaffected because
 * Scala uses Map1..Map4 for small maps. This is NOT a spec guarantee -- upstream
 * canonical ContextExtension serialization is still pending.
 */
export const MAX_SAFE_CONTEXT_EXTENSION_VARS = 4;

/**
 * Patched-local-stack threshold: 128 ids covers the full valid non-negative
 * ContextExtension id range [0..127] per the upstream spec direction
 * (sigmastate-interpreter #1122, #1121, #1067).
 */
const PATCHED_MAX_CONTEXT_EXTENSION_VARS = 128;

/**
 * Valid ContextExtension key range: [0..127].
 * Keys are Byte-typed in the protocol but upstream (#1122) treats them as
 * non-negative ids. Negative Byte keys (128-255 as unsigned) are technically
 * possible in legacy JVM code but are not part of the intended spec.
 */
const MIN_CONTEXT_EXTENSION_KEY = 0;
const MAX_CONTEXT_EXTENSION_KEY = 127;

/** Loopback hostnames accepted by the patched-stack dual gate. */
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1']);

/** Accepted URL schemes for node URLs. */
const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

/**
 * Check whether a URL string points to a loopback host over http/https.
 *
 * Uses URL parsing (not regex) to prevent subdomain spoofing such as
 * "localhost.evil.com" or "127.0.0.1.evil.com".
 *
 * Accepts exactly: 127.0.0.1, localhost, ::1 (IPv6 loopback).
 * Only http: and https: schemes are allowed.
 * Rejects file:, ftp:, malformed URLs, and everything else.
 */
export function isLoopbackUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
      return false;
    }
    // URL.hostname keeps brackets for IPv6 (e.g. "[::1]") -- strip them.
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
    return LOOPBACK_HOSTNAMES.has(hostname);
  } catch {
    return false;
  }
}

/**
 * Extract origin (scheme + host + port) from a URL for comparison.
 * Returns empty string on parse failure.
 */
function urlOrigin(raw: string): string {
  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
}

/**
 * Resolve the effective guard limit.
 *
 * Dual gate -- when PATCHED_STACK_MODE=true, ALL of these must hold:
 *   1. ERGO_NODE_URL is present and parses as a loopback http/https URL.
 *   2. ERGO_NODE is present and parses as a loopback http/https URL.
 *   3. Both point to the same origin (scheme + host + port).
 *
 * If any condition fails, throws immediately -- fail closed, not open.
 *
 * When PATCHED_STACK_MODE is absent or not "true", returns the default
 * threshold of 4 with no additional checks.
 *
 * Exported for unit testing. Production code uses EFFECTIVE_MAX_CONTEXT_EXTENSION_VARS.
 */
export function resolveEffectiveLimit(env: Record<string, string | undefined> = process.env): number {
  if (env.PATCHED_STACK_MODE !== 'true') {
    return MAX_SAFE_CONTEXT_EXTENSION_VARS; // 4
  }

  const nodeUrl = env.ERGO_NODE_URL ?? '';
  const ergoNode = env.ERGO_NODE ?? '';

  // Both must be present
  if (!nodeUrl || !ergoNode) {
    throw new Error(
      `PATCHED_STACK_MODE=true but ERGO_NODE_URL="${nodeUrl}" and/or ` +
      `ERGO_NODE="${ergoNode}" is missing. ` +
      `Both must be set to loopback URLs for patched-stack mode.`
    );
  }

  // Both must be loopback
  if (!isLoopbackUrl(nodeUrl)) {
    throw new Error(
      `PATCHED_STACK_MODE=true but ERGO_NODE_URL="${nodeUrl}" is not loopback. ` +
      `The patched ContextExtension guard is only valid on a local devnet node ` +
      `built from sigmastate-interpreter #1122. ` +
      `Refusing to relax guard for a remote node.`
    );
  }
  if (!isLoopbackUrl(ergoNode)) {
    throw new Error(
      `PATCHED_STACK_MODE=true but ERGO_NODE="${ergoNode}" is not loopback. ` +
      `Both ERGO_NODE_URL and ERGO_NODE must be loopback for patched-stack mode. ` +
      `Refusing to relax guard for a remote node.`
    );
  }

  // Both must point to the same origin
  const originUrl = urlOrigin(nodeUrl);
  const originNode = urlOrigin(ergoNode);
  if (originUrl !== originNode) {
    throw new Error(
      `PATCHED_STACK_MODE=true but ERGO_NODE_URL and ERGO_NODE point to ` +
      `different origins: "${originUrl}" vs "${originNode}". ` +
      `Both must target the same patched local devnet node.`
    );
  }

  console.warn(
    '[WARN] PATCHED_STACK_MODE active -- ContextExtension guard raised to 128 ' +
    '(patched local devnet only, sigmastate-interpreter #1122).'
  );
  return PATCHED_MAX_CONTEXT_EXTENSION_VARS;
}

export const EFFECTIVE_MAX_CONTEXT_EXTENSION_VARS = resolveEffectiveLimit();

export interface ContextExtensionOffender {
  inputIndex: number;
  varCount: number;
  keys: number[];
}

export class ContextExtensionDivergenceError extends Error {
  /** First offending input (convenience accessor). */
  readonly inputIndex: number;
  readonly varCount: number;
  readonly keys: number[];
  /** All offending inputs in this transaction. */
  readonly offenders: ContextExtensionOffender[];
  /** The effective threshold at the time this error was thrown. */
  readonly effectiveThreshold: number;

  constructor(label: string, offenders: ContextExtensionOffender[], effectiveThreshold: number) {
    const details = offenders
      .map(o => `input[${o.inputIndex}]: ${o.varCount} Vars (keys: [${o.keys.join(',')}])`)
      .join('; ');
    super(
      `[${label}] BLOCKED: ${offenders.length} input(s) exceed the ContextExtension guard ` +
      `threshold of ${effectiveThreshold} Vars -- ${details}. ` +
      `Signing is blocked pending sigma-rust/JVM ContextExtension serialization conformance. ` +
      `See upstream-repro/ for details.`
    );
    this.name = 'ContextExtensionDivergenceError';
    this.offenders = offenders;
    this.effectiveThreshold = effectiveThreshold;
    // Convenience: first offender
    this.inputIndex = offenders[0].inputIndex;
    this.varCount = offenders[0].varCount;
    this.keys = offenders[0].keys;
  }
}

/**
 * Error thrown when a ContextExtension contains keys outside the valid
 * range [0..127]. ContextExtension keys are Byte-typed in the protocol;
 * upstream sigmastate-interpreter #1122 defines them as non-negative ids.
 */
export class ContextExtensionKeyRangeError extends Error {
  readonly inputIndex: number;
  readonly invalidKeys: (string | number)[];

  constructor(label: string, inputIndex: number, invalidKeys: (string | number)[]) {
    super(
      `[${label}] BLOCKED: input[${inputIndex}] has ContextExtension keys outside ` +
      `valid range [${MIN_CONTEXT_EXTENSION_KEY}..${MAX_CONTEXT_EXTENSION_KEY}]: ` +
      `[${invalidKeys.join(',')}]. ` +
      `ContextExtension ids must be canonical decimal integers in [0..127].`
    );
    this.name = 'ContextExtensionKeyRangeError';
    this.inputIndex = inputIndex;
    this.invalidKeys = invalidKeys;
  }
}

export interface ContextExtensionInput {
  boxId?: string;
  extension?: Record<string, any>;
}

/**
 * Validate that no input in the transaction has more context extension
 * variables than the effective threshold.
 *
 * The effective threshold is MAX_SAFE_CONTEXT_EXTENSION_VARS (4) by default,
 * or PATCHED_MAX_CONTEXT_EXTENSION_VARS (128) in patched-local-stack mode.
 *
 * Accepts an optional limitOverride for testing patched-mode behavior
 * without module reload.
 *
 * If any inputs exceed the threshold, collects ALL offenders and throws a
 * single ContextExtensionDivergenceError listing every affected input.
 *
 * Call this BEFORE key derivation and wasmSign() to prevent producing a TX
 * that would be rejected by the Ergo node's JVM-based /transactions/check.
 *
 * NOTE: <=4 Vars was unaffected in the observed fixture, but this is NOT a
 * spec guarantee. Upstream canonical serialization is still pending.
 *
 * @param inputs Array of EIP-12 inputs with `extension` maps
 * @param label  Human-readable TX label for error reporting
 * @param limitOverride  Optional override for the effective limit (testing only)
 * @throws ContextExtensionDivergenceError if any input exceeds the threshold
 * @throws ContextExtensionKeyRangeError if any key is outside [0..127]
 */
export function assertContextExtensionSafe(
  inputs: ContextExtensionInput[],
  label: string,
  limitOverride?: number,
): void {
  const limit = limitOverride ?? EFFECTIVE_MAX_CONTEXT_EXTENSION_VARS;
  const offenders: ContextExtensionOffender[] = [];

  for (let i = 0; i < inputs.length; i++) {
    const ext = inputs[i].extension;
    if (!ext) continue;

    const keys = Object.keys(ext);
    const varCount = keys.length;

    // Key validation: each key must be a canonical non-negative decimal integer
    // string in [0..127]. Reject leading zeros ("01"), partial numerics ("1abc"),
    // fractional ("1.5"), negative ("-1"), empty (""), and non-numeric ("abc").
    const CANONICAL_UINT = /^(0|[1-9][0-9]*)$/;
    const invalidKeys: (string | number)[] = [];
    const numericKeys: number[] = [];

    for (const k of keys) {
      if (!CANONICAL_UINT.test(k)) {
        invalidKeys.push(k);
      } else {
        const n = Number(k);
        if (n < MIN_CONTEXT_EXTENSION_KEY || n > MAX_CONTEXT_EXTENSION_KEY) {
          invalidKeys.push(n);
        }
        numericKeys.push(n);
      }
    }
    numericKeys.sort((a, b) => a - b);

    if (invalidKeys.length > 0) {
      // Report numeric values where possible, raw strings for non-parseable keys
      throw new ContextExtensionKeyRangeError(label, i, invalidKeys);
    }

    if (varCount > limit) {
      offenders.push({ inputIndex: i, varCount, keys: numericKeys });
    }
  }

  if (offenders.length > 0) {
    throw new ContextExtensionDivergenceError(label, offenders, limit);
  }
}
