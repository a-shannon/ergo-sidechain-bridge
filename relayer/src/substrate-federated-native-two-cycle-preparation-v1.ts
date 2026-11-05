import { createHash } from 'node:crypto';
import { lstatSync, realpathSync, type BigIntStats } from 'node:fs';
import { dirname, join } from 'node:path';
import { canonicalPathIdentity, readBoundedRegularFile, writeNewFile }
  from './create-only-out-of-repository-artifact.js';
import { assertNoDuplicateJsonKeys, canonicalJson, sha256CanonicalJson }
  from './ergo-settlement-core/strict-json.js';

const SCHEMA = 'e2s.substrate-federated-native-two-cycle-preparation-failure.v1';
const DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PREPARATION_FAILURE_V1';
const PHASES = [
  'environment-before-build', 'ergo-inputs-before-wasm', 'wasm-build',
  'wasm-package', 'environment-after-build', 'environment-stability',
  'pre-attempt-outputs', 'ergo-inputs-before-attempt',
] as const;
export type NativeTwoCyclePreparationPhaseV1 = typeof PHASES[number];
export const NATIVE_TWO_CYCLE_PREPARATION_FAILURE_FILE_V1 = 'preparation-failure-v1.json';
export interface NativeTwoCyclePreparationBindingsV1 {
  readonly configSha256Hex: string;
  /** A config declaration, not an observed repository attestation. */
  readonly expectedBridgeCommit: string;
  readonly pathIdentityDigestHex: string;
}
export interface NativeTwoCyclePreparationFailureV1 extends NativeTwoCyclePreparationBindingsV1 {
  readonly schema: typeof SCHEMA;
  readonly version: 1;
  readonly status: 'preparation_failed';
  readonly phase: NativeTwoCyclePreparationPhaseV1;
  readonly operationCompletionEstablished: false;
  readonly rootCleanupEstablished: false;
  readonly twoCyclesEstablished: false;
  readonly externalAcceptanceEstablished: false;
  readonly rawCausePublished: false;
  readonly receiptDigestHex: string;
}
const failures = new WeakMap<object, Readonly<{
  phase: NativeTwoCyclePreparationPhaseV1; cause: unknown;
}>>();
class PreparationFailure extends Error {
  constructor(phase: NativeTwoCyclePreparationPhaseV1, cause: unknown) {
    super('native two-cycle preparation failed', { cause });
    this.name = 'NativeTwoCyclePreparationFailure';
    failures.set(this, Object.freeze({ phase, cause }));
    Object.freeze(this);
  }
}
function phaseOf(error: unknown): NativeTwoCyclePreparationPhaseV1 | undefined {
  return error !== null && (typeof error === 'object' || typeof error === 'function')
    ? failures.get(error)?.phase : undefined;
}
export async function withNativeTwoCyclePreparationPhaseV1<T>(
  phase: NativeTwoCyclePreparationPhaseV1,
  operation: () => T | Promise<T>,
): Promise<T> {
  if (!(PHASES as readonly unknown[]).includes(phase)) {
    throw new Error('native two-cycle preparation phase is invalid');
  }
  try { return await operation(); }
  catch (cause) { throw new PreparationFailure(phase, cause); }
}
/** Restore the exact original thrown value after optional diagnostic publication. */
export function originalNativeTwoCyclePreparationFailureV1(error: unknown): unknown {
  return error !== null && (typeof error === 'object' || typeof error === 'function')
    && failures.has(error) ? failures.get(error)!.cause : error;
}
function exactKeys(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) {
    throw new Error('native two-cycle preparation diagnostic fields differ');
  }
}
function bindings(value: NativeTwoCyclePreparationBindingsV1): void {
  exactKeys(value, ['configSha256Hex', 'expectedBridgeCommit', 'pathIdentityDigestHex']);
  for (const [name, length] of [
    ['configSha256Hex', 64], ['expectedBridgeCommit', 40], ['pathIdentityDigestHex', 64],
  ] as const) {
    if (typeof value[name] !== 'string'
        || !new RegExp('^[0-9a-f]{' + length + '}$', 'u').test(value[name])) {
      throw new Error('native two-cycle preparation diagnostic binding differs');
    }
  }
}
/** Self-consistent public diagnostics only; no authentication or admission authority. */
export function createNativeTwoCyclePreparationFailureV1(
  expected: NativeTwoCyclePreparationBindingsV1,
  error: unknown,
): Readonly<NativeTwoCyclePreparationFailureV1> | null {
  const phase = phaseOf(error);
  if (phase === undefined) return null;
  bindings(expected);
  const body: Omit<NativeTwoCyclePreparationFailureV1, 'receiptDigestHex'> = {
    schema: SCHEMA, version: 1 as const, status: 'preparation_failed' as const,
    ...expected, phase, operationCompletionEstablished: false as const,
    rootCleanupEstablished: false as const, twoCyclesEstablished: false as const,
    externalAcceptanceEstablished: false as const, rawCausePublished: false as const,
  };
  return Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, DOMAIN) });
}
export function parseNativeTwoCyclePreparationFailureV1(
  text: string,
  expected: NativeTwoCyclePreparationBindingsV1,
): Readonly<NativeTwoCyclePreparationFailureV1> {
  bindings(expected);
  if (Buffer.byteLength(text, 'utf8') > 4096 || text.charCodeAt(0) === 0xfeff
      || text.includes('\r') || !text.endsWith('\n')) {
    throw new Error('native two-cycle preparation diagnostic framing differs');
  }
  assertNoDuplicateJsonKeys(text);
  const value: unknown = JSON.parse(text);
  exactKeys(value, ['schema', 'version', 'status', 'configSha256Hex',
    'expectedBridgeCommit', 'pathIdentityDigestHex', 'phase',
    'operationCompletionEstablished', 'rootCleanupEstablished', 'twoCyclesEstablished',
    'externalAcceptanceEstablished', 'rawCausePublished', 'receiptDigestHex']);
  if (value.schema !== SCHEMA || value.version !== 1 || value.status !== 'preparation_failed'
      || value.configSha256Hex !== expected.configSha256Hex
      || value.expectedBridgeCommit !== expected.expectedBridgeCommit
      || value.pathIdentityDigestHex !== expected.pathIdentityDigestHex
      || !(PHASES as readonly unknown[]).includes(value.phase)
      || ['operationCompletionEstablished', 'rootCleanupEstablished', 'twoCyclesEstablished',
        'externalAcceptanceEstablished', 'rawCausePublished'].some(key => value[key] !== false)
      || typeof value.receiptDigestHex !== 'string'
      || !/^[0-9a-f]{64}$/u.test(value.receiptDigestHex)
      || canonicalJson(value) + '\n' !== text) {
    throw new Error('native two-cycle preparation diagnostic content differs');
  }
  const { receiptDigestHex, ...body } = value;
  if (sha256CanonicalJson(body, DOMAIN) !== receiptDigestHex) {
    throw new Error('native two-cycle preparation diagnostic digest differs');
  }
  return Object.freeze(value) as unknown as Readonly<NativeTwoCyclePreparationFailureV1>;
}

interface NativePreparationInitial {
  readonly configBytes: Uint8Array;
  readonly configSha256Hex: string;
  readonly configCanonicalPath: string;
  readonly pathIdentityDigestHex: string;
  readonly config: Readonly<{ expectedBridgeCommit: string }>;
}
interface NativePreparationConfigContext {
  readonly configCanonicalPath: string;
  readonly configSha256Hex: string;
  readonly expectedBridgeCommit: string;
  readonly pathIdentityDigestHex: string;
  readonly fileIdentity: string;
  readonly ancestors: readonly Readonly<{ path: string; identity: string }>[];
}
function preparationFileIdentity(stat: BigIntStats): string {
  return [stat.dev, stat.ino, stat.mode, stat.nlink, stat.size,
    stat.mtimeNs, stat.ctimeNs].join(':');
}
function inspectPreparationConfig(initial: NativePreparationInitial):
  Readonly<NativePreparationConfigContext> {
  const path = initial.configCanonicalPath;
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n) {
    throw new Error('indirect preparation config');
  }
  const current = readBoundedRegularFile(path, 'native two-cycle preparation config', 32 * 1024);
  if (canonicalPathIdentity(current.canonicalPath) !== canonicalPathIdentity(path)
      || !Buffer.from(current.bytes).equals(Buffer.from(initial.configBytes))
      || createHash('sha256').update(current.bytes).digest('hex')
        !== initial.configSha256Hex) throw new Error('preparation config changed');
  const ancestors: Array<Readonly<{ path: string; identity: string }>> = [];
  for (let cursor = dirname(path);; cursor = dirname(cursor)) {
    const stat = lstatSync(cursor, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()
        || canonicalPathIdentity(realpathSync(cursor)) !== canonicalPathIdentity(cursor)) {
      throw new Error('indirect preparation parent');
    }
    ancestors.push(Object.freeze({ path: cursor,
      identity: [stat.dev, stat.ino, stat.mode, stat.nlink].join(':') }));
    if (dirname(cursor) === cursor) break;
  }
  if (preparationFileIdentity(before)
      !== preparationFileIdentity(lstatSync(path, { bigint: true }))) {
    throw new Error('preparation config identity changed');
  }
  return Object.freeze({
    configCanonicalPath: path, configSha256Hex: initial.configSha256Hex,
    expectedBridgeCommit: initial.config.expectedBridgeCommit,
    pathIdentityDigestHex: initial.pathIdentityDigestHex,
    fileIdentity: preparationFileIdentity(before), ancestors: Object.freeze(ancestors),
  });
}
/** Diagnostic-only capture; an unavailable witness never changes operation admission. */
export function captureNativeTwoCyclePreparationConfigV1(initial: NativePreparationInitial):
  Readonly<NativePreparationConfigContext> | null {
  try { return inspectPreparationConfig(initial); } catch { return null; }
}
/** Optional public detail; publication failure never replaces the original refusal. */
export function tryPublishNativeTwoCyclePreparationFailureV1(
  initial: NativePreparationInitial,
  context: Readonly<NativePreparationConfigContext> | null,
  error: unknown,
): boolean {
  try {
    if (context === null || canonicalJson(inspectPreparationConfig(initial))
        !== canonicalJson(context)) return false;
    const detail = createNativeTwoCyclePreparationFailureV1({
      configSha256Hex: context.configSha256Hex,
      expectedBridgeCommit: context.expectedBridgeCommit,
      pathIdentityDigestHex: context.pathIdentityDigestHex,
    }, error);
    if (detail === null) return false;
    writeNewFile(join(dirname(context.configCanonicalPath),
      NATIVE_TWO_CYCLE_PREPARATION_FAILURE_FILE_V1),
    Buffer.from(canonicalJson(detail) + '\n', 'utf8'),
    'native two-cycle public preparation failure');
    return true;
  } catch { return false; }
}
