import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readdirSync, readSync, realpathSync, writeSync, type BigIntStats,
} from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';

import { runBoundedProcess } from './bounded-process-runner.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';
import {
  captureV4PostBuildPhysicalTree, validateV4PhysicalPostBuildPair,
  validateV4PhysicalResolverStagePair, V4PostBuildCaptureFailure,
  type V4PostBuildCaptureFailureCode, type V4PostBuildCaptureInput,
  type V4PostBuildPhysicalCapture,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-capture.js';
import {
  prepareV4GitHome, type V4PostTargetGitObservation,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-checkout.js';
import {
  captureV4BuildDependencies, captureV6BuildDependencies, rootsOverlap,
  type V4DependencyCapture, type V6DependencyCapture,
  type V6DependencyCaptureInput,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-dependencies.js';
import { inspectSelectedV4OrV5BuildLock } from './substrate-federated-isolated-devnet-ergo-node-build-v5-source59-lock.js';
import { inspectSelectedV6OrLegacyBuildLock } from './substrate-federated-isolated-devnet-ergo-node-build-v6-lock-selection.js';
import { materializeV4ResolverState } from './substrate-federated-isolated-devnet-ergo-node-build-v4-materialize.js';
import {
  assertSameV4PhysicalPlanSnapshot, withPinnedV4BoundedChildTools,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-physical.js';
import {
  inspectV4BuildPreentry, V4_PREENTRY_DIAGNOSTIC_STAGES,
  type V4BuildPreentry, type V4BuildPreentryInput,
  type V4PreentryDiagnosticStage,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-preentry.js';
import {
  inspectV6BuildPreentry, selectV6BuildPreentryInputNonAuthorizing,
  type V6BuildPreentry, type V6BuildPreentryInput,
} from './substrate-federated-isolated-devnet-ergo-node-build-v6-preentry.js';
import {
  inspectV4NodeBuildGitAfterTarget, inspectV4NodeBuildPreflightWithPlan,
  inspectV6NodeBuildGitAfterTarget, inspectV6NodeBuildPreflightWithPlan,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-preflight.js';
import {
  V4_GENERATED_OUTPUT_ROOTS, hashV4SelectedAssembly,
  type V4GeneratedOutputRoot, type V4PostBuildCap, type V4PostBuildCaps,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-postbuild.js';
import {
  classifyV4EffectiveResolverOutputRefusal, parseV4EffectiveResolverOutput,
  V4_EFFECTIVE_RESOLVER_REFUSAL_CODES, type V4EffectiveResolverOutput,
  type V4EffectiveResolverRefusalCode,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-resolver-output.js';
import {
  assertSameV4ResolverSeedBoundary, selectV4ResolverSeedBoundary,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-resolver-seed-boundary.js';
import {
  assertSameV4PinnedToolchain, captureV4PinnedToolchain,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-toolchain.js';

const RESOLVER_TIMEOUT_MS = 300_000;
const RESOLVER_OUTPUT_BYTES = 4_194_304;
const RESOLVER_STDERR_BYTES = 16_384;
const RESOLVER_TERMINATION_GRACE_MS = 10_000;
const UPDATE_TIMEOUT_MS = 120_000;
const UPDATE_OUTPUT_BYTES = 33_554_432;
const UPDATE_STDERR_BYTES = 16_384;
const MAX_AUTHORIZED_FILES = 50_000;
const MAX_AUTHORIZED_DIRECTORIES = 4_096;
const MAX_AUTHORIZED_BYTES = 536_870_912;

type V4OwnedBuildFailurePhase =
  | 'CREATE_GIT_HOMES'
  | 'B0_PRECHECK'
  | `B0_PRECHECK_${V4PreentryDiagnosticStage}`
  | 'PRE_TARGET_PRECHECK'
  | 'MATERIALIZE'
  | 'RESOLVER_PRECHECK'
  | 'RESOLVER_JOB'
  | 'RESOLVER_POSTCHECK'
  | 'UPDATE_PRECHECK'
  | 'UPDATE_JOB'
  | 'UPDATE_POSTCHECK'
  | 'ASSEMBLY_PRECHECK'
  | 'ASSEMBLY_JOB'
  | 'ASSEMBLY_POSTCHECK'
  | 'RESULT_WRITE';

export const V4_RESOLVER_POSTCHECK_SUBPHASES = [
  'OUTPUT_PARSE', 'PHYSICAL_CAPTURE_1', 'PHYSICAL_VALIDATE_1',
  'SEED_SELECT_1', 'SEED_COMPARE_PRE', 'DEPENDENCIES_CAPTURE',
  'DEPENDENCIES_COMPARE', 'TOOLCHAIN_CAPTURE', 'TOOLCHAIN_COMPARE',
  'GIT_OBSERVE', 'LOCK_COMPARE', 'PHYSICAL_CAPTURE_2',
  'PHYSICAL_VALIDATE_2', 'SEED_SELECT_2', 'SEED_COMPARE_2',
  'CAPTURE_COMPARE', 'PLAN_COMPARE',
] as const;
export type V4ResolverPostcheckSubphase =
  (typeof V4_RESOLVER_POSTCHECK_SUBPHASES)[number];
const V4_CAPTURE_FIRST_FAILURE_CODES = [
  'INSPECTOR_INPUT', 'INSPECTOR_REPARSE', 'INSPECTOR_KIND',
  'INSPECTOR_ENTRY_CAP', 'INSPECTOR_MEMBERSHIP_CAP',
  'INSPECTOR_DEPTH', 'INSPECTOR_NAME', 'INSPECTOR_GIT',
  'INSPECTOR_OTHER', 'INSPECTOR_AMBIGUOUS', 'INSPECTOR_DRIFT',
  'INSPECTOR_OUTPUT', 'INSPECTOR_MISMATCH',
  'INSPECTOR_OUTPUT_BASE64', 'INSPECTOR_OUTPUT_BYTES',
  'INSPECTOR_OUTPUT_UTF8', 'INSPECTOR_OUTPUT_FRAMING',
  'INSPECTOR_OUTPUT_COUNT', 'INSPECTOR_OUTPUT_ROW',
  'INSPECTOR_OUTPUT_ORDER', 'INSPECTOR_OUTPUT_PATH',
  'INSPECTOR_OUTPUT_CASE', 'INSPECTOR_OUTPUT_GIT',
  'INSPECTOR_OUTPUT_PARENT',
  'NODE_ENTRY_CAP', 'NODE_ROOT_FILES', 'NODE_ROOT_DIRECTORIES',
  'NODE_ROOT_BYTES', 'NODE_TOTAL_FILES', 'NODE_TOTAL_DIRECTORIES',
  'NODE_TOTAL_BYTES', 'NODE_MEMBERSHIP_CAP', 'NODE_FILE_DRIFT',
  'REPARSE', 'SOURCE_DRIFT', 'OTHER',
] as const satisfies readonly V4PostBuildCaptureFailureCode[];
type MissingCaptureCode = Exclude<V4PostBuildCaptureFailureCode,
  (typeof V4_CAPTURE_FIRST_FAILURE_CODES)[number]>;
const ALL_CAPTURE_CODES_COVERED: MissingCaptureCode extends never ? true : never = true;
void ALL_CAPTURE_CODES_COVERED;

export const V4_ASSEMBLY_POSTCHECK_SUBPHASES = [
  'PHYSICAL_CAPTURE_1', 'PHYSICAL_VALIDATE_1', 'ASSEMBLY_HASH',
  'SEED_SELECT_1', 'SEED_COMPARE_1', 'INPUT_PLAN', 'INPUT_GIT',
  'INPUT_DEPENDENCIES', 'INPUT_TOOLCHAIN', 'INPUT_LOCK',
  'PHYSICAL_CAPTURE_2', 'PHYSICAL_VALIDATE_2',
  'SEED_SELECT_2', 'SEED_COMPARE_2',
  'CAPTURE_STABILITY', 'VALIDATION_STABILITY', 'ASSEMBLY_HASH_STABILITY',
  'COMPANION_ABSENCE',
  ...V4_CAPTURE_FIRST_FAILURE_CODES.map(code =>
    `PHYSICAL_CAPTURE_1_${code}` as const),
] as const;
export type V4AssemblyPostcheckSubphase =
  (typeof V4_ASSEMBLY_POSTCHECK_SUBPHASES)[number];

/** A code is publishable only after a typed first capture refusal. */
export function classifyV4AssemblyFirstCaptureFailure(
  error: unknown, lockSelection: V4OwnedBuildInput['lockSelection'],
): V4AssemblyPostcheckSubphase {
  if (lockSelection !== 'v5-source59') return 'PHYSICAL_CAPTURE_1';
  try {
    if (V4PostBuildCaptureFailure.isConstructed(error)) {
      const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
      const code: unknown = descriptor && 'value' in descriptor
        ? descriptor.value : undefined;
      if (typeof code === 'string'
          && V4_CAPTURE_FIRST_FAILURE_CODES.includes(
            code as V4PostBuildCaptureFailureCode)) {
        return `PHYSICAL_CAPTURE_1_${code}` as V4AssemblyPostcheckSubphase;
      }
    }
  } catch { /* A forged descriptor is not a typed source observation. */ }
  return 'PHYSICAL_CAPTURE_1_OTHER';
}

export interface V4OwnedBuildGitHomes {
  readonly b0: string;
  readonly preTarget: string;
  readonly beforeResolverJob: string;
  readonly afterResolverJob: string;
  readonly beforeUpdateJob: string;
  readonly afterUpdateJob: string;
  readonly beforeAssemblyJob: string;
  readonly afterAssemblyJob: string;
}

export interface V4OwnedBuildInput extends Omit<V4BuildPreentryInput, 'gitHomePath'> {
  readonly gitHomes: Readonly<V4OwnedBuildGitHomes>;
  readonly resultPath: string;
  readonly javaExecutablePath: string;
  readonly sbtLauncherJarPath: string;
  readonly systemRoot: string;
}
export interface V6OwnedBuildInput extends Omit<V6BuildPreentryInput, 'gitHomePath'> {
  readonly gitHomes: Readonly<V4OwnedBuildGitHomes>;
  readonly resultPath: string;
  readonly javaExecutablePath: string;
  readonly sbtLauncherJarPath: string;
  readonly systemRoot: string;
}

export interface V4OwnedBuildResult {
  readonly schema: 'substrate-federated-isolated-devnet-node-build-v4-process-owned';
  readonly resolverExecuted: true;
  readonly updateExecuted: true;
  readonly assemblyExecuted: true;
  readonly updateDependencyGraphReviewed: false;
  readonly campaignAdmitted: false;
  readonly preentry: Readonly<V4BuildPreentry>;
  readonly resolverCapture: Readonly<V4PostBuildPhysicalCapture>;
  readonly updateCapture: Readonly<V4PostBuildPhysicalCapture>;
  readonly assemblyCapture: Readonly<V4PostBuildPhysicalCapture>;
  readonly effectiveResolvers: Readonly<V4EffectiveResolverOutput>;
  readonly updateStdoutBytes: number;
  readonly updateStdoutSha256Hex: string;
  readonly assembly: Readonly<{ path: string; bytes: number; sha256Hex: string }>;
  readonly receiptDigestHex: string;
  readonly receiptFileSha256Hex: string;
}
export interface V6OwnedBuildResult extends Omit<V4OwnedBuildResult, 'schema' | 'preentry'> {
  readonly schema: 'substrate-federated-isolated-devnet-node-build-v6-process-owned';
  readonly preentry: Readonly<V6BuildPreentry>;
}
type SelectedOwnedBuildInput = V4OwnedBuildInput | V6OwnedBuildInput;
type OwnedBuildVariant = 'legacy' | 'v6';

function fail(reason: string): never {
  throw new Error('V4 process-owned resolver stage: ' + reason);
}

function sameRoot(a: string, b: string): boolean {
  return isAbsolute(a) && isAbsolute(b)
    && resolve(a).toLowerCase() === resolve(b).toLowerCase();
}

function copyCap(value: Readonly<V4PostBuildCap>): Readonly<V4PostBuildCap> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join('\0') !== 'maxBytes\0maxDirectories\0maxFiles'
      || !Number.isSafeInteger(value.maxFiles) || value.maxFiles < 0
      || !Number.isSafeInteger(value.maxDirectories) || value.maxDirectories < 0
      || !Number.isSafeInteger(value.maxBytes) || value.maxBytes < 0) {
    fail('explicit output cap differs');
  }
  return Object.freeze({ maxFiles: value.maxFiles,
    maxDirectories: value.maxDirectories, maxBytes: value.maxBytes });
}

function copyCaps(value: Readonly<V4PostBuildCaps>): Readonly<V4PostBuildCaps> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !value.roots || typeof value.roots !== 'object'
      || Array.isArray(value.roots)
      || Object.keys(value.roots).sort().join('\0')
        !== [...V4_GENERATED_OUTPUT_ROOTS].sort().join('\0')) {
    fail('exact six-root caller caps are required');
  }
  const roots = {} as Record<V4GeneratedOutputRoot, Readonly<V4PostBuildCap>>;
  for (const root of V4_GENERATED_OUTPUT_ROOTS) roots[root] = copyCap(value.roots[root]);
  return Object.freeze({ roots: Object.freeze(roots), total: copyCap(value.total) });
}

function selectedDependencyPaths(
  input: Readonly<SelectedOwnedBuildInput>, variant: OwnedBuildVariant,
): readonly string[] {
  if (variant === 'v6') {
    const current = input as V6OwnedBuildInput;
    return [current.mavenNamespaceRoot, current.v6MavenSourceRoot,
      current.leveldbReceiptPath];
  }
  const legacy = input as V4OwnedBuildInput;
  return [legacy.mirrorReceiptPath, legacy.leveldbReceiptPath];
}
function selectedHomes(input: Readonly<SelectedOwnedBuildInput>,
  variant: OwnedBuildVariant): readonly string[] {
  if (!input.gitHomes || Object.keys(input.gitHomes).sort().join('\0')
      !== 'afterAssemblyJob\0afterResolverJob\0afterUpdateJob\0b0\0beforeAssemblyJob\0beforeResolverJob\0beforeUpdateJob\0preTarget') {
    fail('exact eight Git HOME paths required');
  }
  const homes = [input.gitHomes.b0, input.gitHomes.preTarget,
    input.gitHomes.beforeResolverJob, input.gitHomes.afterResolverJob,
    input.gitHomes.beforeUpdateJob, input.gitHomes.afterUpdateJob,
    input.gitHomes.beforeAssemblyJob, input.gitHomes.afterAssemblyJob];
  const protectedRoots = [input.bridgeRoot, input.sourcePath,
    dirname(resolve(input.sourcePath)),
    input.mirrorRoot, input.bootRoot, input.leveldbRoot,
    ...selectedDependencyPaths(input, variant)];
  for (let index = 0; index < homes.length; index++) {
    const home = homes[index]!;
    if (typeof home !== 'string' || !isAbsolute(home)
        || !/^[d]:[\\/]/iu.test(home)
        || /(^|[\\/])\.\.?([\\/]|$)/u.test(home)
        || protectedRoots.some(root => rootsOverlap(home, root))
        || homes.slice(0, index).some(previous => rootsOverlap(home, previous))) {
      fail('Git HOME is indirect, overlapping or outside D');
    }
  }
  return homes;
}

function directAncestors(path: string): readonly Readonly<{ path: string; stat: BigIntStats }>[] {
  const ancestors: { path: string; stat: BigIntStats }[] = [];
  let cursor = path;
  for (;;) {
    const stat = lstatSync(cursor, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()
        || resolve(realpathSync.native(cursor)).toLowerCase()
          !== resolve(cursor).toLowerCase()) {
      fail('Git HOME ancestor is indirect');
    }
    ancestors.push({ path: cursor, stat });
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return ancestors;
}

function sameDirectory(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode
    && a.nlink === b.nlink;
}

type V4ProducerSourcePin = Readonly<{
  sha256Hex: string; stat: BigIntStats;
}>;

function sameProducerFile(a: BigIntStats, b: BigIntStats): boolean {
  return a.isFile() && !a.isSymbolicLink() && a.nlink === 1n
    && a.dev === b.dev && a.ino === b.ino && a.mode === b.mode
    && a.nlink === b.nlink && a.size === b.size
    && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

function pinV4ProducerSource(): V4ProducerSourcePin {
  const source = resolve(import.meta.filename);
  if (basename(source)
      !== 'substrate-federated-isolated-devnet-ergo-node-build-v4-owned-resolver.ts') {
    fail('producer source path differs');
  }
  const ancestors = directAncestors(dirname(source));
  const before = lstatSync(source, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size <= 0n || before.size > 2_097_152n) {
    fail('producer source type or bound differs');
  }
  const fd = openSync(source, 'r');
  let bytes: Buffer;
  try {
    if (!sameProducerFile(before, fstatSync(fd, { bigint: true }))) {
      fail('producer source descriptor differs');
    }
    const expected = Number(before.size);
    const buffer = Buffer.alloc(expected + 1);
    let used = 0;
    while (used < buffer.length) {
      const count = readSync(fd, buffer, used, buffer.length - used, used);
      if (count === 0) break;
      used += count;
    }
    if (used !== expected
        || !sameProducerFile(before, fstatSync(fd, { bigint: true }))
        || !sameProducerFile(before, lstatSync(source, { bigint: true }))) {
      fail('producer source changed while read');
    }
    bytes = buffer.subarray(0, used);
  } finally { closeSync(fd); }
  for (const ancestor of ancestors) {
    const current = lstatSync(ancestor.path, { bigint: true });
    if (!current.isDirectory() || current.isSymbolicLink()
        || resolve(realpathSync.native(ancestor.path)).toLowerCase()
          !== resolve(ancestor.path).toLowerCase()
        || !sameDirectory(ancestor.stat, current)) {
      fail('producer source ancestor changed');
    }
  }
  return Object.freeze({
    sha256Hex: createHash('sha256').update(bytes).digest('hex'),
    stat: before,
  });
}

function absent(path: string): void {
  try { lstatSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  fail('Git HOME already exists');
}

function selectedResultPath(input: Readonly<SelectedOwnedBuildInput>,
  homes: readonly string[], variant: OwnedBuildVariant): Readonly<{
    path: string;
    ancestors: readonly Readonly<{ path: string; stat: BigIntStats }>[];
  }> {
  const path = input.resultPath;
  if (typeof path !== 'string' || !isAbsolute(path)
      || !/^[d]:[\\/]/iu.test(path)
      || /(^|[\\/])\.\.?([\\/]|$)/u.test(path)
      || basename(path) !== (variant === 'v6'
        ? 'v6-process-owned-build-result.json'
        : 'v4-process-owned-build-result.json')
      || [input.bridgeRoot, input.sourcePath, input.mirrorRoot,
        input.bootRoot, input.leveldbRoot,
        ...(variant === 'v6' ? [
          (input as V6OwnedBuildInput).mavenNamespaceRoot,
          (input as V6OwnedBuildInput).v6MavenSourceRoot,
        ] : []), ...homes]
        .some(root => rootsOverlap(path, root))) {
    fail('result path is indirect or overlaps a selected input');
  }
  const resolved = resolve(path);
  const ancestors = directAncestors(dirname(resolved));
  if (lstatMaybe(resolved)) fail('result already exists');
  return { path: resolved, ancestors };
}

function selectedCompanionPath(
  result: ReturnType<typeof selectedResultPath>,
  input: Readonly<SelectedOwnedBuildInput>, homes: readonly string[],
  variant: OwnedBuildVariant, name: string, label: string,
): ReturnType<typeof selectedResultPath> {
  const path = resolve(dirname(result.path), name);
  if ([input.bridgeRoot, input.sourcePath, input.mirrorRoot,
    ...selectedDependencyPaths(input, variant), input.bootRoot, input.leveldbRoot,
    input.gitExecutablePath, input.javaExecutablePath,
    input.sbtLauncherJarPath, ...homes]
    .some(root => rootsOverlap(path, root))) {
    fail(label + ' overlaps a selected input');
  }
  if (lstatMaybe(path)) fail(label + ' already exists');
  return { path, ancestors: result.ancestors };
}
function selectedFailurePhasePath(
  result: ReturnType<typeof selectedResultPath>,
  input: Readonly<SelectedOwnedBuildInput>, homes: readonly string[],
  variant: OwnedBuildVariant,
): ReturnType<typeof selectedResultPath> {
  return selectedCompanionPath(result, input, homes, variant,
    variant === 'v6' ? 'v6-process-owned-build-failure-phase.json'
      : 'v4-process-owned-build-failure-phase.json', 'failure-phase result');
}
function selectedResolverPostcheckPath(
  result: ReturnType<typeof selectedResultPath>,
  input: Readonly<SelectedOwnedBuildInput>, homes: readonly string[],
  variant: OwnedBuildVariant,
): ReturnType<typeof selectedResultPath> {
  return selectedCompanionPath(result, input, homes, variant,
    variant === 'v6' ? 'v6-process-owned-build-failure-resolver-postcheck-v1.json'
      : 'v4-process-owned-build-failure-resolver-postcheck-v2.json',
    'resolver postcheck result');
}
function selectedAssemblyPostcheckPath(
  result: ReturnType<typeof selectedResultPath>,
  input: Readonly<SelectedOwnedBuildInput>, homes: readonly string[],
  variant: OwnedBuildVariant,
): ReturnType<typeof selectedResultPath> {
  return selectedCompanionPath(result, input, homes, variant,
    variant === 'v6' ? 'v6-process-owned-build-failure-assembly-postcheck-v1.json'
      : 'v4-process-owned-build-failure-assembly-postcheck-v2.json',
    'assembly postcheck result');
}
function selectedResolverOutputRefusalPath(
  result: ReturnType<typeof selectedResultPath>,
  input: Readonly<SelectedOwnedBuildInput>, homes: readonly string[],
  variant: OwnedBuildVariant,
): ReturnType<typeof selectedResultPath> {
  return selectedCompanionPath(result, input, homes, variant,
    variant === 'v6' ? 'v6-process-owned-build-failure-resolver-output-v1.json'
      : 'v4-process-owned-build-failure-resolver-output-v3.json',
    'resolver output refusal result');
}

function lstatMaybe(path: string): BigIntStats | undefined {
  try { return lstatSync(path, { bigint: true }); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function writeNewResult(
  selected: Readonly<{
    path: string;
    ancestors: readonly Readonly<{ path: string; stat: BigIntStats }>[];
  }>, bytes: Buffer,
): string {
  for (const ancestor of selected.ancestors) {
    const current = lstatSync(ancestor.path, { bigint: true });
    if (!current.isDirectory() || current.isSymbolicLink()
        || resolve(realpathSync.native(ancestor.path)).toLowerCase()
          !== resolve(ancestor.path).toLowerCase()
        || !sameDirectory(ancestor.stat, current)) {
      fail('result ancestor changed before create');
    }
  }
  if (lstatMaybe(selected.path)) fail('result already exists before create');
  const sameResultFile = (a: BigIntStats, b: BigIntStats): boolean =>
    a.isFile() && !a.isSymbolicLink() && a.nlink === 1n
    && a.dev === b.dev && a.ino === b.ino && a.mode === b.mode
    && a.nlink === b.nlink && a.size === b.size
    && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
  const handle = openSync(selected.path, 'wx+');
  let verified: BigIntStats;
  try {
    let offset = 0;
    while (offset < bytes.length) {
      const count = writeSync(handle, bytes, offset, bytes.length - offset);
      if (count <= 0) fail('result write stopped');
      offset += count;
    }
    fsyncSync(handle);
    verified = fstatSync(handle, { bigint: true });
    if (verified.size !== BigInt(bytes.length)
        || !sameResultFile(verified, lstatSync(selected.path, { bigint: true }))) {
      fail('create-only result identity changed after write');
    }
    const actual = Buffer.alloc(bytes.length + 1);
    let read = 0;
    while (read < actual.length) {
      const count = readSync(handle, actual, read, actual.length - read, read);
      if (count === 0) break;
      read += count;
    }
    if (read !== bytes.length || !actual.subarray(0, read).equals(bytes)
        || !sameResultFile(verified, fstatSync(handle, { bigint: true }))
        || !sameResultFile(verified, lstatSync(selected.path, { bigint: true }))) {
      fail('create-only result byte verification failed');
    }
  } finally { closeSync(handle); }
  if (!sameResultFile(verified!, lstatSync(selected.path, { bigint: true }))) {
    fail('create-only result identity changed after close');
  }
  return createHash('sha256').update(bytes).digest('hex');
}

function writeFailurePhase(
  selected: ReturnType<typeof selectedResultPath>,
  failedWhile: V4OwnedBuildFailurePhase,
  variant: OwnedBuildVariant,
): string {
  const body = {
    schemaVersion: 1,
    kind: variant === 'v6' ? 'v6-process-owned-build-failure-phase'
      : 'v4-process-owned-build-failure-phase',
    failedWhile,
    successEstablished: false,
    campaignAdmitted: false,
  } as const;
  const receiptDigestHex = sha256CanonicalJson(body,
    variant === 'v6' ? 'E2S_SUBSTRATE_FED_V6_OWNED_BUILD_FAILURE_PHASE_V1'
      : 'E2S_SUBSTRATE_FED_V4_OWNED_BUILD_FAILURE_PHASE_V1');
  const bytes = Buffer.from(canonicalJson({ ...body, receiptDigestHex })
    + '\n', 'utf8');
  if (bytes.length > 16_384) fail('failure-phase result exceeds receipt cap');
  return writeNewResult(selected, bytes);
}

/** An optional diagnostic cannot replace or invalidate the V1 failure. */
export function tryWriteV4ResolverPostcheckCompanion(
  subphase: string, parentFailureFileSha256Hex: string,
  producerSourceSha256Hex: string, write: (bytes: Buffer) => void,
): void {
  try {
    if (!V4_RESOLVER_POSTCHECK_SUBPHASES.includes(
      subphase as V4ResolverPostcheckSubphase)
        || !/^[0-9a-f]{64}$/u.test(parentFailureFileSha256Hex)
        || !/^[0-9a-f]{64}$/u.test(producerSourceSha256Hex)
        || typeof write !== 'function') return;
    const body = {
      schemaVersion: 2,
      kind: 'v4-process-owned-build-resolver-postcheck-subphase',
      subphase,
      parentFailureFileSha256Hex,
      producerSourceSha256Hex,
      successEstablished: false,
      campaignAdmitted: false,
    } as const;
    const receiptDigestHex = sha256CanonicalJson(body,
      'E2S_SUBSTRATE_FED_V4_RESOLVER_POSTCHECK_SUBPHASE_V2');
    const bytes = Buffer.from(canonicalJson({ ...body, receiptDigestHex })
      + '\n', 'utf8');
    if (bytes.length === 0 || bytes.length > 16_384) return;
    write(bytes);
  } catch {
    // A missing or partial optional diagnostic leaves only V1 established.
  }
}

/** Optional V2 cannot replace the immutable V1 assembly failure receipt. */
export function tryWriteV4AssemblyPostcheckCompanion(
  subphase: string, parentFailureFileSha256Hex: string,
  producerSourceSha256Hex: string, write: (bytes: Buffer) => void,
): void {
  try {
    if (!V4_ASSEMBLY_POSTCHECK_SUBPHASES.includes(
      subphase as V4AssemblyPostcheckSubphase)
        || !/^[0-9a-f]{64}$/u.test(parentFailureFileSha256Hex)
        || !/^[0-9a-f]{64}$/u.test(producerSourceSha256Hex)
        || typeof write !== 'function') return;
    const body = {
      schemaVersion: 2,
      kind: 'v4-process-owned-build-assembly-postcheck-subphase',
      subphase,
      parentFailureFileSha256Hex,
      producerSourceSha256Hex,
      successEstablished: false,
      campaignAdmitted: false,
    } as const;
    const receiptDigestHex = sha256CanonicalJson(body,
      'E2S_SUBSTRATE_FED_V4_ASSEMBLY_POSTCHECK_SUBPHASE_V2');
    const bytes = Buffer.from(canonicalJson({ ...body, receiptDigestHex })
      + '\n', 'utf8');
    if (bytes.length === 0 || bytes.length > 16_384) return;
    write(bytes);
  } catch {
    // Missing or partial optional V2 leaves only the V1 failure established.
  }
}

/** An optional fixed code requires both earlier public failure receipts. */
export function tryWriteV4ResolverOutputRefusalCompanion(
  refusalCode: string, parentFailureFileSha256Hex: string,
  parentPostcheckFileSha256Hex: string, producerSourceSha256Hex: string,
  write: (bytes: Buffer) => void,
): void {
  try {
    if (!V4_EFFECTIVE_RESOLVER_REFUSAL_CODES.includes(
      refusalCode as V4EffectiveResolverRefusalCode)
        || !/^[0-9a-f]{64}$/u.test(parentFailureFileSha256Hex)
        || !/^[0-9a-f]{64}$/u.test(parentPostcheckFileSha256Hex)
        || !/^[0-9a-f]{64}$/u.test(producerSourceSha256Hex)
        || typeof write !== 'function') return;
    const body = {
      schemaVersion: 3,
      kind: 'v4-process-owned-build-resolver-output-refusal',
      refusalCode,
      parentFailureFileSha256Hex,
      parentPostcheckFileSha256Hex,
      producerSourceSha256Hex,
      successEstablished: false,
      campaignAdmitted: false,
    } as const;
    const receiptDigestHex = sha256CanonicalJson(body,
      'E2S_SUBSTRATE_FED_V4_RESOLVER_OUTPUT_REFUSAL_V3');
    const bytes = Buffer.from(canonicalJson({ ...body, receiptDigestHex })
      + '\n', 'utf8');
    if (bytes.length === 0 || bytes.length > 16_384) return;
    write(bytes);
  } catch {
    // The V1/V2 observations remain the only established evidence.
  }
}

function createFreshGitHomes(sourcePath: string, homes: readonly string[]): void {
  // The eight directories are owned by this attempt. A partial create consumes
  // the attempt; the caller preserves it and never reruns this function.
  // Reject every indirect ancestor and pre-existing destination before the
  // first write, including a bad eighth HOME after seven valid ones.
  const checked = homes.map(home => {
    const ancestors = directAncestors(dirname(resolve(home)));
    absent(home);
    return { home, ancestors };
  });
  for (const { home, ancestors } of checked) {
    for (const ancestor of ancestors) {
      const current = lstatSync(ancestor.path, { bigint: true });
      if (!current.isDirectory() || current.isSymbolicLink()
          || resolve(realpathSync.native(ancestor.path)).toLowerCase()
            !== resolve(ancestor.path).toLowerCase()
          || !sameDirectory(ancestor.stat, current)) {
        fail('Git HOME ancestor changed before create');
      }
    }
    absent(home);
    mkdirSync(home);
    const stat = lstatSync(home);
    if (!stat.isDirectory() || stat.isSymbolicLink()
        || readdirSync(home).length !== 0) fail('new Git HOME is not empty');
    prepareV4GitHome(sourcePath, home);
  }
}

function assertOnlyMaterializedBeforeJob(
  before: Readonly<V4PostBuildPhysicalCapture>,
  current: Readonly<V4PostBuildPhysicalCapture>,
): void {
  const original = new Set(before.entries.map(entry => entry.path));
  const added = current.entries.filter(entry => !original.has(entry.path));
  if (original.has('target')
      || added.filter(entry => entry.path === 'target').length !== 1
      || added.find(entry => entry.path === 'target')?.kind !== 'directory'
      || added.some(entry => entry.path !== 'target'
        && entry.path !== 'target/bridge-sbt-state-v4'
        && !entry.path.startsWith('target/bridge-sbt-state-v4/'))) {
    fail('foreign generated output exists before resolver Job');
  }
}

function assertPreentryDependencies(
  preentry: Readonly<V4BuildPreentry | V6BuildPreentry>,
  captured: Readonly<V4DependencyCapture | V6DependencyCapture>,
): void {
  const expected = preentry.dependencies;
  if (expected.lockSha256Hex !== captured.lockSha256Hex
      || expected.mirrorReceiptSha256Hex !== captured.mirrorReceiptSha256Hex
      || expected.leveldbReceiptSha256Hex !== captured.leveldbReceiptSha256Hex
      || expected.mirrorMetadataSha256Hex !== captured.mirror.metadataSha256Hex
      || expected.mirrorFileCount !== captured.mirror.files.length
      || expected.mirrorBytes !== captured.mirror.bytes
      || expected.bootJarFrameSha256Hex !== captured.bootJarFrameSha256Hex
      || expected.bootFileCount !== captured.boot.files.length
      || expected.bootBytes !== captured.boot.bytes
      || expected.leveldbAggregateSha256Hex !== captured.leveldbAggregateSha256Hex
      || expected.leveldbFileCount !== captured.leveldb.files.length
       || expected.leveldbBytes !== captured.leveldb.bytes
       || (preentry.schema === 'substrate-federated-isolated-devnet-node-build-v6-preentry'
         && (preentry.dependencies.mavenTerminalSha256Hex
           !== (captured as V6DependencyCapture).mavenTerminalSha256Hex
           || preentry.dependencies.leveldbTerminalSha256Hex
             !== (captured as V6DependencyCapture).leveldbTerminalSha256Hex))) {
    fail('B0 dependency summary differs from the complete capture');
  }
}

function assertSameDependencies(
  before: Readonly<V4DependencyCapture>, after: Readonly<V4DependencyCapture>,
): void {
  if (!isDeepStrictEqual(before, after)) {
    fail('Maven mirror, boot seed or LevelDB changed across the Job');
  }
}

function assertSameGit(
  preentry: Readonly<V4BuildPreentry | V6BuildPreentry>,
  current: Readonly<V4PostTargetGitObservation>,
): void {
  const initial = preentry.preflight;
  if (current.head !== initial.checkoutHead || current.tree !== initial.checkoutTree
      || current.indexSha256Hex !== initial.checkoutIndexSha256Hex
      || current.status !== initial.checkoutStatus
      || current.sourceIdentityDigestHex !== initial.sourceIdentityDigestHex) {
    fail('post-target Git source differs from B0');
  }
}

type SelectedStable =
  | Readonly<Omit<V4OwnedBuildInput, 'gitHomes' | 'resultPath'> & { variant: 'legacy' }>
  | Readonly<Omit<V6OwnedBuildInput, 'gitHomes' | 'resultPath'> & { variant: 'v6' }>;

function selectedLock(stable: Readonly<SelectedStable>) {
  return stable.variant === 'v6'
    ? inspectSelectedV6OrLegacyBuildLock(stable.bridgeRoot, 'v6-current')
    : inspectSelectedV4OrV5BuildLock(stable.bridgeRoot, stable.lockSelection);
}
function selectedDependencies(stable: Readonly<SelectedStable>):
  Promise<Readonly<V4DependencyCapture | V6DependencyCapture>> {
  if (stable.variant === 'v6') {
    const exact: V6DependencyCaptureInput = {
      bridgeRoot: stable.bridgeRoot, lockSelection: 'v6-current',
      mavenNamespaceRoot: stable.mavenNamespaceRoot,
      v6MavenSourceRoot: stable.v6MavenSourceRoot,
      mirrorRoot: stable.mirrorRoot, bootRoot: stable.bootRoot,
      leveldbRoot: stable.leveldbRoot,
      leveldbReceiptPath: stable.leveldbReceiptPath,
    };
    return captureV6BuildDependencies(exact);
  }
  return captureV4BuildDependencies({
    bridgeRoot: stable.bridgeRoot, lockSelection: stable.lockSelection,
    mirrorRoot: stable.mirrorRoot, mirrorReceiptPath: stable.mirrorReceiptPath,
    bootRoot: stable.bootRoot, leveldbRoot: stable.leveldbRoot,
    leveldbReceiptPath: stable.leveldbReceiptPath,
  });
}
function selectedPreflight(stable: Readonly<SelectedStable>, home: string) {
  const common = {
    bridgeRoot: stable.bridgeRoot, sourcePath: stable.sourcePath,
    gitHomePath: home, gitExecutablePath: stable.gitExecutablePath,
  };
  return stable.variant === 'v6'
    ? inspectV6NodeBuildPreflightWithPlan({ ...common, lockSelection: 'v6-current' })
    : inspectV4NodeBuildPreflightWithPlan({ ...common, lockSelection: stable.lockSelection });
}
function selectedPostTargetGit(stable: Readonly<SelectedStable>, home: string) {
  const common = {
    bridgeRoot: stable.bridgeRoot, sourcePath: stable.sourcePath,
    gitHomePath: home, gitExecutablePath: stable.gitExecutablePath,
  };
  return stable.variant === 'v6'
    ? inspectV6NodeBuildGitAfterTarget({ ...common, lockSelection: 'v6-current' })
    : inspectV4NodeBuildGitAfterTarget({ ...common, lockSelection: stable.lockSelection });
}
function selectedPreentry(stable: Readonly<SelectedStable>, home: string,
  reportStage: (stage: V4PreentryDiagnosticStage) => void) {
  if (stable.variant === 'v6') {
    const exact: V6BuildPreentryInput = {
      bridgeRoot: stable.bridgeRoot, sourcePath: stable.sourcePath,
      gitHomePath: home, gitExecutablePath: stable.gitExecutablePath,
      lockSelection: 'v6-current', mirrorRoot: stable.mirrorRoot,
      bootRoot: stable.bootRoot, leveldbRoot: stable.leveldbRoot,
      leveldbReceiptPath: stable.leveldbReceiptPath,
      mavenNamespaceRoot: stable.mavenNamespaceRoot,
      v6MavenSourceRoot: stable.v6MavenSourceRoot,
      caps: stable.caps, maxMembershipBytes: stable.maxMembershipBytes,
    };
    return inspectV6BuildPreentry(exact);
  }
  const exact: V4BuildPreentryInput = {
    bridgeRoot: stable.bridgeRoot, sourcePath: stable.sourcePath,
    gitHomePath: home, gitExecutablePath: stable.gitExecutablePath,
    lockSelection: stable.lockSelection, mirrorRoot: stable.mirrorRoot,
    mirrorReceiptPath: stable.mirrorReceiptPath, bootRoot: stable.bootRoot,
    leveldbRoot: stable.leveldbRoot,
    leveldbReceiptPath: stable.leveldbReceiptPath,
    caps: stable.caps, maxMembershipBytes: stable.maxMembershipBytes,
  };
  return stable.lockSelection === 'v5-source59'
    ? inspectV4BuildPreentry(exact, reportStage)
    : inspectV4BuildPreentry(exact);
}

// This function owns all three SBT Jobs in one process. A partial failure
// consumes the attempt; the caller neither retries nor cleans it up.
// The returned physical result is not a campaign or two-cycle result.
async function runSelectedOwnedBuildAttempt(
  input: Readonly<SelectedOwnedBuildInput>, variant: OwnedBuildVariant,
): Promise<Readonly<V4OwnedBuildResult | V6OwnedBuildResult>> {
  const common = {
    bridgeRoot: input.bridgeRoot, sourcePath: input.sourcePath,
    gitExecutablePath: input.gitExecutablePath, mirrorRoot: input.mirrorRoot,
    bootRoot: input.bootRoot, leveldbRoot: input.leveldbRoot,
    leveldbReceiptPath: input.leveldbReceiptPath,
    javaExecutablePath: input.javaExecutablePath,
    sbtLauncherJarPath: input.sbtLauncherJarPath,
    systemRoot: input.systemRoot,
    caps: copyCaps(input.caps), maxMembershipBytes: input.maxMembershipBytes,
  };
  const stable: SelectedStable = variant === 'v6'
    ? Object.freeze({ ...common, variant: 'v6' as const,
      lockSelection: 'v6-current' as const,
      mavenNamespaceRoot: (input as V6OwnedBuildInput).mavenNamespaceRoot,
      v6MavenSourceRoot: (input as V6OwnedBuildInput).v6MavenSourceRoot })
    : Object.freeze({ ...common, variant: 'legacy' as const,
      lockSelection: (input as V4OwnedBuildInput).lockSelection,
      mirrorReceiptPath: (input as V4OwnedBuildInput).mirrorReceiptPath });
  const parentSystemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (process.platform !== 'win32' || typeof parentSystemRoot !== 'string'
      || !sameRoot(parentSystemRoot, stable.systemRoot)
      || stable.caps.total.maxFiles > MAX_AUTHORIZED_FILES
      || stable.caps.total.maxDirectories > MAX_AUTHORIZED_DIRECTORIES
      || stable.caps.total.maxBytes > MAX_AUTHORIZED_BYTES) {
    fail('platform, PowerShell root or approved output cap differs');
  }
  const homes = selectedHomes(input, variant);
  const resultPath = selectedResultPath(input, homes, variant);
  const failurePath = selectedFailurePhasePath(resultPath, input, homes, variant);
  const postcheckPath = selectedResolverPostcheckPath(resultPath, input, homes, variant);
  const assemblyPostcheckPath = selectedAssemblyPostcheckPath(resultPath, input, homes, variant);
  const refusalPath = selectedResolverOutputRefusalPath(resultPath, input, homes, variant);
  let failedWhile: V4OwnedBuildFailurePhase = 'CREATE_GIT_HOMES';
  let resolverPostcheckSubphase: V4ResolverPostcheckSubphase | undefined;
  let assemblyPostcheckSubphase: V4AssemblyPostcheckSubphase | undefined;
  try {
  createFreshGitHomes(stable.sourcePath, homes);
  failedWhile = 'B0_PRECHECK';
  const preentry = await selectedPreentry(stable, homes[0]!, stage => {
    if (V4_PREENTRY_DIAGNOSTIC_STAGES.includes(stage)) {
      failedWhile = `B0_PRECHECK_${stage}`;
    }
  });
  failedWhile = 'PRE_TARGET_PRECHECK';
  const preTarget = await selectedPreflight(stable, homes[1]!);
  if (!isDeepStrictEqual(preentry.preflight, preTarget.observation)) {
    fail('pre-target source differs from B0');
  }
  assertSameV4PhysicalPlanSnapshot(preentry.planSnapshot, preTarget.physicalPlan);
  const lockBefore = selectedLock(stable);
  if (lockBefore.sha256Hex !== preentry.preflight.lockSha256Hex) {
    fail('build lock differs from B0');
  }
  const dependenciesBefore = await selectedDependencies(stable);
  assertPreentryDependencies(preentry, dependenciesBefore);
  assertSameV4PhysicalPlanSnapshot(preentry.planSnapshot, preTarget.physicalPlan);

  // First target write. It is create-only and never attempted a second time.
  failedWhile = 'MATERIALIZE';
  const materialization = materializeV4ResolverState({
    sourceRoot: stable.sourcePath, mirrorRoot: stable.mirrorRoot,
    leveldbRoot: stable.leveldbRoot, bootSourceRoot: stable.bootRoot,
    javaExecutablePath: stable.javaExecutablePath, systemRoot: stable.systemRoot,
    lock: lockBefore.lock, capturedBoot: dependenciesBefore.boot,
  });
  const capture = async (
    phase: 'resolver' | 'after' = 'resolver',
    inspectorSelection?: V4PostBuildCaptureInput['inspectorSelection'],
  ): Promise<Readonly<V4PostBuildPhysicalCapture>> => {
    assertSameV4PhysicalPlanSnapshot(preentry.planSnapshot, preTarget.physicalPlan);
    return captureV4PostBuildPhysicalTree({
      sourceRoot: resolve(stable.sourcePath), plan: preTarget.physicalPlan,
      caps: preentry.caps, phase,
      maxMembershipBytes: preentry.maxMembershipBytes,
      inspectorSelection,
    });
  };
  const validate = (current: Readonly<V4PostBuildPhysicalCapture>): void => {
    assertSameV4PhysicalPlanSnapshot(preentry.planSnapshot, preTarget.physicalPlan);
    validateV4PhysicalResolverStagePair({
      before: preentry.prebuild, resolver: current, plan: preTarget.physicalPlan,
      expectedSourceDigestHex: preentry.preflight.physicalSourceDigestHex,
      caps: preentry.caps, lock: lockBefore.lock,
    });
  };
  failedWhile = 'RESOLVER_PRECHECK';
  assertSameGit(preentry, await selectedPostTargetGit(stable, homes[2]!));
  const dependenciesAtJob = await selectedDependencies(stable);
  assertSameDependencies(dependenciesBefore, dependenciesAtJob);
  const toolchainBefore = captureV4PinnedToolchain({
    javaExecutablePath: stable.javaExecutablePath,
    sbtLauncherJarPath: stable.sbtLauncherJarPath, lock: lockBefore.lock,
  });
  if (selectedLock(stable).sha256Hex !== lockBefore.sha256Hex) {
    fail('build lock changed before resolver Job');
  }
  const beforeJob = await capture();
  validate(beforeJob);
  assertOnlyMaterializedBeforeJob(preentry.prebuild, beforeJob);
  const seedBefore = selectV4ResolverSeedBoundary({
    sourceRoot: stable.sourcePath, capture: beforeJob, materialization,
    capturedBoot: dependenciesBefore.boot, phase: 'before-job',
  });
  if (!sameRoot(process.env.SystemRoot ?? process.env.WINDIR ?? '',
      stable.systemRoot)) {
    fail('parent PowerShell root changed before resolver Job');
  }
  const plan = materialization.plan;
  const javaArgs = (commands: readonly string[]): string[] => {
    const properties = plan.javaSystemProperties;
    if (properties.length !== 11
        || properties.some(property => typeof property !== 'string'
          || !property.startsWith('-D'))
        || commands.length === 0) fail('Java argument plan differs');
    return ['-Xmx4G', ...properties.slice(0, 4),
      '-Dsbt.supershell=false', '-Dsbt.log.noformat=true',
      ...properties.slice(4), '-jar', stable.sbtLauncherJarPath, ...commands];
  };
  failedWhile = 'RESOLVER_JOB';
  const job = await withPinnedV4BoundedChildTools(() => runBoundedProcess({
    executablePath: plan.javaExecutablePath,
    args: javaArgs(plan.commands),
    cwd: resolve(stable.sourcePath), env: { ...plan.environment },
    timeoutMs: RESOLVER_TIMEOUT_MS, maxOutputBytes: RESOLVER_OUTPUT_BYTES,
    maxStdoutBytes: RESOLVER_OUTPUT_BYTES,
    maxStderrBytes: RESOLVER_STDERR_BYTES,
    terminationGraceMs: RESOLVER_TERMINATION_GRACE_MS,
    label: variant === 'v6' ? 'V6 process-owned effective resolver observation'
      : 'V4 process-owned effective resolver observation',
  }));
  if (job.exitCode !== 0 || job.stderrBytes.length !== 0) {
    fail('resolver Job failed or emitted stderr');
  }
  failedWhile = 'RESOLVER_POSTCHECK';
  resolverPostcheckSubphase = 'OUTPUT_PARSE';
  const effectiveResolvers = parseV4EffectiveResolverOutput({
    stdoutBytes: job.stdoutBytes, sourceRoot: stable.sourcePath,
    repositoriesText: plan.repositoriesText, commands: plan.commands,
  });
  resolverPostcheckSubphase = 'PHYSICAL_CAPTURE_1';
  const afterJob = await capture();
  resolverPostcheckSubphase = 'PHYSICAL_VALIDATE_1';
  validate(afterJob);
  resolverPostcheckSubphase = 'SEED_SELECT_1';
  const seedAfter = selectV4ResolverSeedBoundary({
    sourceRoot: stable.sourcePath, capture: afterJob, materialization,
    capturedBoot: dependenciesBefore.boot, phase: 'after-job',
  });
  resolverPostcheckSubphase = 'SEED_COMPARE_PRE';
  assertSameV4ResolverSeedBoundary(seedBefore, seedAfter);
  resolverPostcheckSubphase = 'DEPENDENCIES_CAPTURE';
  const dependenciesAfter = await selectedDependencies(stable);
  resolverPostcheckSubphase = 'DEPENDENCIES_COMPARE';
  assertSameDependencies(dependenciesBefore, dependenciesAfter);
  resolverPostcheckSubphase = 'TOOLCHAIN_CAPTURE';
  const toolchainAfter = captureV4PinnedToolchain({
    javaExecutablePath: stable.javaExecutablePath,
    sbtLauncherJarPath: stable.sbtLauncherJarPath, lock: lockBefore.lock,
  });
  resolverPostcheckSubphase = 'TOOLCHAIN_COMPARE';
  assertSameV4PinnedToolchain(toolchainBefore, toolchainAfter);
  resolverPostcheckSubphase = 'GIT_OBSERVE';
  assertSameGit(preentry, await selectedPostTargetGit(stable, homes[3]!));
  resolverPostcheckSubphase = 'LOCK_COMPARE';
  if (selectedLock(stable).sha256Hex !== lockBefore.sha256Hex) {
    fail('build lock changed after resolver Job');
  }
  resolverPostcheckSubphase = 'PHYSICAL_CAPTURE_2';
  const finalCapture = await capture();
  resolverPostcheckSubphase = 'PHYSICAL_VALIDATE_2';
  validate(finalCapture);
  resolverPostcheckSubphase = 'SEED_SELECT_2';
  const finalSeed = selectV4ResolverSeedBoundary({
    sourceRoot: stable.sourcePath, capture: finalCapture, materialization,
    capturedBoot: dependenciesBefore.boot, phase: 'after-job',
  });
  resolverPostcheckSubphase = 'SEED_COMPARE_2';
  assertSameV4ResolverSeedBoundary(seedAfter, finalSeed);
  resolverPostcheckSubphase = 'CAPTURE_COMPARE';
  if (!isDeepStrictEqual(afterJob, finalCapture)) {
    fail('resolver output changed during final checks');
  }
  resolverPostcheckSubphase = 'PLAN_COMPARE';
  assertSameV4PhysicalPlanSnapshot(preentry.planSnapshot, preTarget.physicalPlan);

  // The original complete dependency and toolchain captures remain private
  // across the update and assembly Jobs. Every Git observation has a distinct
  // fresh HOME prepared before the first target write.
  const assertCurrentInputs = async (home: string,
    mark?: (stage: V4AssemblyPostcheckSubphase) => void): Promise<void> => {
    mark?.('INPUT_PLAN');
    assertSameV4PhysicalPlanSnapshot(preentry.planSnapshot, preTarget.physicalPlan);
    mark?.('INPUT_GIT');
    assertSameGit(preentry, await selectedPostTargetGit(stable, home));
    mark?.('INPUT_DEPENDENCIES');
    assertSameDependencies(dependenciesBefore,
      await selectedDependencies(stable));
    mark?.('INPUT_TOOLCHAIN');
    assertSameV4PinnedToolchain(toolchainBefore, captureV4PinnedToolchain({
      javaExecutablePath: stable.javaExecutablePath,
      sbtLauncherJarPath: stable.sbtLauncherJarPath, lock: lockBefore.lock,
    }));
    mark?.('INPUT_LOCK');
    if (selectedLock(stable).sha256Hex !== lockBefore.sha256Hex
        || !sameRoot(process.env.SystemRoot ?? process.env.WINDIR ?? '',
          stable.systemRoot)) {
      fail('lock or parent SystemRoot changed between Jobs');
    }
  };
  const assertSeed = (
    current: Readonly<V4PostBuildPhysicalCapture>,
    stages?: readonly [V4AssemblyPostcheckSubphase, V4AssemblyPostcheckSubphase],
  ): void => {
    if (stages) assemblyPostcheckSubphase = stages[0];
    const seed = selectV4ResolverSeedBoundary({
      sourceRoot: stable.sourcePath, capture: current, materialization,
      capturedBoot: dependenciesBefore.boot, phase: 'after-job',
    });
    if (stages) assemblyPostcheckSubphase = stages[1];
    assertSameV4ResolverSeedBoundary(seedBefore, seed);
  };
  const assertResolverState = (
    current: Readonly<V4PostBuildPhysicalCapture>,
    expected: Readonly<V4PostBuildPhysicalCapture>,
  ): void => {
    validate(current);
    assertSeed(current);
    if (!isDeepStrictEqual(expected, current)) {
      fail('intermediate physical output changed between Jobs');
    }
  };

  failedWhile = 'UPDATE_PRECHECK';
  await assertCurrentInputs(homes[4]!);
  assertResolverState(await capture(), finalCapture);
  failedWhile = 'UPDATE_JOB';
  const updateJob = await withPinnedV4BoundedChildTools(() => runBoundedProcess({
    executablePath: plan.javaExecutablePath,
    args: javaArgs(['avldb / update']),
    cwd: resolve(stable.sourcePath), env: { ...plan.environment },
    timeoutMs: UPDATE_TIMEOUT_MS, maxOutputBytes: UPDATE_OUTPUT_BYTES,
    maxStdoutBytes: UPDATE_OUTPUT_BYTES,
    maxStderrBytes: UPDATE_STDERR_BYTES,
    terminationGraceMs: RESOLVER_TERMINATION_GRACE_MS,
    label: variant === 'v6' ? 'V6 process-owned avldb update'
      : 'V4 process-owned avldb update',
  }));
  if (updateJob.exitCode !== 0 || updateJob.stderrBytes.length !== 0) {
    fail('avldb update Job failed or emitted stderr');
  }
  failedWhile = 'UPDATE_POSTCHECK';
  // SBT exposes no selected machine-readable UpdateReport producer here.
  // This digest identifies bounded stdout; it proves no dependency graph.
  const updateStdoutSha256Hex = createHash('sha256')
    .update(updateJob.stdoutBytes).digest('hex');
  const updateCapture = await capture();
  validate(updateCapture);
  assertSeed(updateCapture);
  await assertCurrentInputs(homes[5]!);
  const updateFinalCapture = await capture();
  assertResolverState(updateFinalCapture, updateCapture);

  failedWhile = 'ASSEMBLY_PRECHECK';
  await assertCurrentInputs(homes[6]!);
  assertResolverState(await capture(), updateFinalCapture);
  failedWhile = 'ASSEMBLY_JOB';
  const assemblyJob = await withPinnedV4BoundedChildTools(() => runBoundedProcess({
    executablePath: plan.javaExecutablePath,
    args: javaArgs(lockBefore.lock.buildArguments),
    cwd: resolve(stable.sourcePath), env: { ...plan.environment },
    timeoutMs: lockBefore.lock.buildTimeoutMs,
    maxOutputBytes: lockBefore.lock.buildMaxOutputBytes,
    maxStdoutBytes: lockBefore.lock.buildMaxOutputBytes,
    maxStderrBytes: UPDATE_STDERR_BYTES,
    terminationGraceMs: lockBefore.lock.buildTerminationGraceMs,
    label: variant === 'v6' ? 'V6 process-owned assembly'
      : 'V4 process-owned assembly',
  }));
  if (assemblyJob.exitCode !== 0 || assemblyJob.stderrBytes.length !== 0) {
    fail('assembly Job failed or emitted stderr');
  }
  failedWhile = 'ASSEMBLY_POSTCHECK';
  assemblyPostcheckSubphase = 'PHYSICAL_CAPTURE_1';
  let assemblyCapture: Readonly<V4PostBuildPhysicalCapture>;
  try {
    assemblyCapture = await capture('after',
      stable.lockSelection === 'v5-source59'
        ? 'v5-source59-after-assembly' : undefined);
  } catch (error) {
    assemblyPostcheckSubphase = classifyV4AssemblyFirstCaptureFailure(
      error, stable.variant === 'v6' ? undefined : stable.lockSelection);
    throw error;
  }
  assemblyPostcheckSubphase = 'PHYSICAL_VALIDATE_1';
  const assemblyValidation = validateV4PhysicalPostBuildPair({
    before: preentry.prebuild, after: assemblyCapture,
    plan: preTarget.physicalPlan,
    expectedSourceDigestHex: preentry.preflight.physicalSourceDigestHex,
    caps: preentry.caps, lock: lockBefore.lock,
  });
  assemblyPostcheckSubphase = 'ASSEMBLY_HASH';
  const assemblySha256Hex = hashV4SelectedAssembly(
    resolve(stable.sourcePath), assemblyValidation.assembly,
    preentry.caps.total.maxBytes,
  );
  assertSeed(assemblyCapture, ['SEED_SELECT_1', 'SEED_COMPARE_1']);
  await assertCurrentInputs(homes[7]!, stage => { assemblyPostcheckSubphase = stage; });
  assemblyPostcheckSubphase = 'PHYSICAL_CAPTURE_2';
  const finalAssemblyCapture = await capture('after');
  assemblyPostcheckSubphase = 'PHYSICAL_VALIDATE_2';
  const finalAssemblyValidation = validateV4PhysicalPostBuildPair({
    before: preentry.prebuild, after: finalAssemblyCapture,
    plan: preTarget.physicalPlan,
    expectedSourceDigestHex: preentry.preflight.physicalSourceDigestHex,
    caps: preentry.caps, lock: lockBefore.lock,
  });
  assertSeed(finalAssemblyCapture, ['SEED_SELECT_2', 'SEED_COMPARE_2']);
  assemblyPostcheckSubphase = 'CAPTURE_STABILITY';
  if (!isDeepStrictEqual(assemblyCapture, finalAssemblyCapture)) {
    fail('assembly output changed during final checks');
  }
  assemblyPostcheckSubphase = 'VALIDATION_STABILITY';
  if (!isDeepStrictEqual(assemblyValidation, finalAssemblyValidation)) {
    fail('assembly output changed during final checks');
  }
  assemblyPostcheckSubphase = 'ASSEMBLY_HASH_STABILITY';
  if (finalAssemblyValidation.assembly.sha256Hex !== assemblySha256Hex) {
    fail('assembly output changed during final checks');
  }
  assemblyPostcheckSubphase = 'COMPANION_ABSENCE';
  if (lstatMaybe(assemblyPostcheckPath.path)) {
    fail('assembly postcheck companion exists on successful path');
  }
  failedWhile = 'RESULT_WRITE';
  const capturePin = (phase: 'B0' | 'R' | 'U' | 'A',
    current: Readonly<V4PostBuildPhysicalCapture>) => Object.freeze({
    entryCount: current.entries.length,
    sha256Hex: sha256CanonicalJson(current,
      `E2S_SUBSTRATE_FED_${variant === 'v6' ? 'V6' : 'V4'}_PHYSICAL_CAPTURE_${phase}_V1`),
  });
  const body = {
    schemaVersion: 1,
    kind: variant === 'v6' ? 'v6-process-owned-build-static-observation'
      : 'v4-process-owned-build-static-observation',
    source: {
      checkoutHead: preentry.preflight.checkoutHead,
      checkoutTree: preentry.preflight.checkoutTree,
      checkoutIndexSha256Hex: preentry.preflight.checkoutIndexSha256Hex,
      physicalSourceDigestHex: preentry.preflight.physicalSourceDigestHex,
      planSnapshotSha256Hex: preentry.planSnapshot.sha256Hex,
      lockSha256Hex: lockBefore.sha256Hex,
    },
    dependencies: preentry.dependencies,
    caps: preentry.caps,
    captures: {
      b0: capturePin('B0', preentry.prebuild),
      r: capturePin('R', finalCapture),
      u: capturePin('U', updateFinalCapture),
      a: capturePin('A', finalAssemblyCapture),
    },
    jobs: {
      resolver: { stdoutBytes: job.stdoutBytes.length,
        stdoutSha256Hex: effectiveResolvers.stdoutSha256Hex },
      update: { stdoutBytes: updateJob.stdoutBytes.length,
        stdoutSha256Hex: updateStdoutSha256Hex },
      assembly: { stdoutBytes: assemblyJob.stdoutBytes.length,
        stdoutSha256Hex: createHash('sha256')
          .update(assemblyJob.stdoutBytes).digest('hex') },
    },
    assembly: { relativePath: finalAssemblyValidation.assembly.path,
      bytes: finalAssemblyValidation.assembly.bytes,
      sha256Hex: assemblySha256Hex },
    status: { resolverExecuted: true, updateExecuted: true,
      assemblyExecuted: true, updateDependencyGraphReviewed: false,
      campaignAdmitted: false },
  } as const;
  const receiptDigestHex = sha256CanonicalJson(body,
    variant === 'v6' ? 'E2S_SUBSTRATE_FED_V6_OWNED_BUILD_STATIC_RECEIPT_V1'
      : 'E2S_SUBSTRATE_FED_V4_OWNED_BUILD_STATIC_RECEIPT_V1');
  const receiptBytes = Buffer.from(canonicalJson({ ...body, receiptDigestHex })
    + '\n', 'utf8');
  if (receiptBytes.length > 16_384) fail('process-owned result exceeds receipt cap');
  // This is the last mutation. A failed or partial create consumes the attempt.
  if (lstatMaybe(failurePath.path) || lstatMaybe(postcheckPath.path)
      || lstatMaybe(refusalPath.path)) {
    fail('failure-phase result appeared before success create');
  }
  const receiptFileSha256Hex = writeNewResult(resultPath, receiptBytes);
  const beforePreentry = Object.freeze({
    resolverExecuted: true, updateExecuted: true, assemblyExecuted: true,
    updateDependencyGraphReviewed: false, campaignAdmitted: false,
  });
  const afterPreentry = Object.freeze({
    resolverCapture: finalCapture,
    updateCapture: updateFinalCapture,
    assemblyCapture: finalAssemblyCapture, effectiveResolvers,
    updateStdoutBytes: updateJob.stdoutBytes.length,
    updateStdoutSha256Hex,
    assembly: Object.freeze({
      path: finalAssemblyValidation.assembly.path,
      bytes: finalAssemblyValidation.assembly.bytes,
      sha256Hex: assemblySha256Hex,
    }),
    receiptDigestHex, receiptFileSha256Hex,
  });
  return variant === 'v6'
    ? Object.freeze({ schema: 'substrate-federated-isolated-devnet-node-build-v6-process-owned' as const,
      ...beforePreentry, preentry: preentry as V6BuildPreentry, ...afterPreentry })
    : Object.freeze({ schema: 'substrate-federated-isolated-devnet-node-build-v4-process-owned' as const,
      ...beforePreentry, preentry: preentry as V4BuildPreentry, ...afterPreentry });
  } catch (error) {
    // A failed or partial create is indeterminate. Keep the original error and
    // never turn a result/failure coexistence into a success claim.
    let parentFailureFileSha256Hex: string | undefined;
    try {
      if (!lstatMaybe(resultPath.path) && !lstatMaybe(failurePath.path)) {
        parentFailureFileSha256Hex = writeFailurePhase(failurePath, failedWhile, variant);
      }
    } catch {
      // Missing or partial public evidence remains indeterminate.
    }
    if (variant === 'legacy' && failedWhile === 'ASSEMBLY_POSTCHECK'
        && assemblyPostcheckSubphase && parentFailureFileSha256Hex) {
      try {
        const beforeProducer = pinV4ProducerSource();
        tryWriteV4AssemblyPostcheckCompanion(
          assemblyPostcheckSubphase, parentFailureFileSha256Hex,
          beforeProducer.sha256Hex, bytes => {
            const afterProducer = pinV4ProducerSource();
            if (beforeProducer.sha256Hex !== afterProducer.sha256Hex
                || !sameProducerFile(beforeProducer.stat, afterProducer.stat)
                || lstatMaybe(resultPath.path)
                || lstatMaybe(assemblyPostcheckPath.path)) {
              fail('optional assembly postcheck source or output changed');
            }
            writeNewResult(assemblyPostcheckPath, bytes);
          },
        );
      } catch {
        // V1 alone remains authoritative when optional V2 cannot close.
      }
    }
    if (variant === 'legacy' && failedWhile === 'RESOLVER_POSTCHECK'
        && resolverPostcheckSubphase && parentFailureFileSha256Hex) {
      try {
        const beforeProducer = pinV4ProducerSource();
        let postcheckFileSha256Hex: string | undefined;
        let postcheckStat: BigIntStats | undefined;
        tryWriteV4ResolverPostcheckCompanion(
          resolverPostcheckSubphase, parentFailureFileSha256Hex,
          beforeProducer.sha256Hex, bytes => {
            const afterProducer = pinV4ProducerSource();
            if (beforeProducer.sha256Hex !== afterProducer.sha256Hex
                || !sameProducerFile(beforeProducer.stat, afterProducer.stat)
                || lstatMaybe(resultPath.path)
                || lstatMaybe(postcheckPath.path)) {
              fail('optional resolver postcheck source or output changed');
            }
            postcheckFileSha256Hex = writeNewResult(postcheckPath, bytes);
            postcheckStat = lstatSync(postcheckPath.path, { bigint: true });
          },
        );
        const refusalCode = resolverPostcheckSubphase === 'OUTPUT_PARSE'
          ? classifyV4EffectiveResolverOutputRefusal(error) : undefined;
        if (refusalCode && postcheckFileSha256Hex && postcheckStat) {
          tryWriteV4ResolverOutputRefusalCompanion(
            refusalCode, parentFailureFileSha256Hex,
            postcheckFileSha256Hex, beforeProducer.sha256Hex, bytes => {
              const afterProducer = pinV4ProducerSource();
              if (beforeProducer.sha256Hex !== afterProducer.sha256Hex
                  || !sameProducerFile(beforeProducer.stat, afterProducer.stat)
                  || !sameProducerFile(postcheckStat!,
                    lstatSync(postcheckPath.path, { bigint: true }))
                  || lstatMaybe(resultPath.path)
                  || lstatMaybe(refusalPath.path)) {
                fail('optional resolver output source or parent changed');
              }
              writeNewResult(refusalPath, bytes);
            },
          );
        }
      } catch {
        // V1 and the original failure remain the only established evidence.
      }
    }
    throw error;
  }
}

/** The legacy entry never accepts the explicit V6 branch, even from untyped JS. */
export async function runV4OwnedBuildAttempt(
  input: Readonly<V4OwnedBuildInput>,
): Promise<Readonly<V4OwnedBuildResult>> {
  if (input.lockSelection !== undefined && input.lockSelection !== 'v4'
      && input.lockSelection !== 'v5-source59') {
    fail('legacy lock selection differs');
  }
  const result = await runSelectedOwnedBuildAttempt(input, 'legacy');
  if (result.schema !== 'substrate-federated-isolated-devnet-node-build-v4-process-owned') {
    fail('legacy result schema differs');
  }
  return result;
}

/** First V6 build entry; it reuses the same bounded three-Job engine with new evidence. */
export async function runV6OwnedBuildAttempt(
  input: Readonly<V6OwnedBuildInput>,
): Promise<Readonly<V6OwnedBuildResult>> {
  if (input.lockSelection !== 'v6-current' || 'mirrorReceiptPath' in input) {
    fail('explicit V6 selection or historical mirror receipt differs');
  }
  selectV6BuildPreentryInputNonAuthorizing({
    bridgeRoot: input.bridgeRoot, sourcePath: input.sourcePath,
    gitHomePath: input.gitHomes.b0, gitExecutablePath: input.gitExecutablePath,
    lockSelection: 'v6-current', mirrorRoot: input.mirrorRoot,
    bootRoot: input.bootRoot, leveldbRoot: input.leveldbRoot,
    leveldbReceiptPath: input.leveldbReceiptPath,
    mavenNamespaceRoot: input.mavenNamespaceRoot,
    v6MavenSourceRoot: input.v6MavenSourceRoot,
    caps: input.caps, maxMembershipBytes: input.maxMembershipBytes,
  });
  const result = await runSelectedOwnedBuildAttempt(input, 'v6');
  if (result.schema !== 'substrate-federated-isolated-devnet-node-build-v6-process-owned') {
    fail('V6 result schema differs');
  }
  return result;
}
