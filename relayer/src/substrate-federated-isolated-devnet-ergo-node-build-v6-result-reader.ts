import { createHash } from 'node:crypto';
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readSync,
  realpathSync, type BigIntStats,
} from 'node:fs';
import { basename, dirname, isAbsolute, resolve, sep } from 'node:path';

import { canonicalJson, parseStrictJson, sha256CanonicalJson } from './strict-json.js';
import { V4_GENERATED_OUTPUT_ROOTS } from
  './substrate-federated-isolated-devnet-ergo-node-build-v4-postbuild.js';
import {
  inspectSelectedV6NodeBuildLock, V6_NODE_BUILD_LOCK_RELATIVE_PATH,
  V6_NODE_BUILD_LOCK_SHA256_HEX, type V6CurrentNodeBuildLock,
} from './substrate-federated-isolated-devnet-ergo-node-build-v6-lock.js';

const ACTOR_SOURCE_NAME = 'substrate-federated-isolated-devnet-ergo-node-build-v4-owned-resolver.ts';
const ACTOR_SOURCE_SHA256 = 'ff604b5885cd2035c2adc1c6c29cb4105effe0991967e3fd9dab6a36d6eac74e';
const RESULT_NAME = 'v6-process-owned-build-result.json';
const FAILURE_NAME = 'v6-process-owned-build-failure-phase.json';
const MAVEN_TERMINAL_NAME = 'maven-public-cache-reattest-terminal-01.json';
const LEVELDB_TERMINAL_NAME = 'gitlab-leveldb-owner-terminal-01.json';
const RESULT_DOMAIN = 'E2S_SUBSTRATE_FED_V6_OWNED_BUILD_STATIC_RECEIPT_V1';
const FAILURE_DOMAIN = 'E2S_SUBSTRATE_FED_V6_OWNED_BUILD_FAILURE_PHASE_V1';
const MAX_RESULT_BYTES = 16_384;
const MAX_SOURCE_BYTES = 100_000;
const MAX_LOCK_BYTES = 4_096;
const MAX_TERMINAL_BYTES = 4_096;
const ERGO_TREE = '9f8d571534b21eec660ff21177adf725e50ddf02';
const FAILURE_STAGES = Object.freeze([
  'CREATE_GIT_HOMES', 'B0_PRECHECK', 'PRE_TARGET_PRECHECK', 'MATERIALIZE',
  'RESOLVER_PRECHECK', 'RESOLVER_JOB', 'RESOLVER_POSTCHECK',
  'UPDATE_PRECHECK', 'UPDATE_JOB', 'UPDATE_POSTCHECK',
  'ASSEMBLY_PRECHECK', 'ASSEMBLY_JOB', 'ASSEMBLY_POSTCHECK', 'RESULT_WRITE',
] as const);
const V4_SIBLING_NAMES = Object.freeze([
  'v4-process-owned-build-result.json',
  'v4-process-owned-build-failure-phase.json',
  'v4-process-owned-build-failure-resolver-postcheck-v2.json',
  'v4-process-owned-build-failure-assembly-postcheck-v2.json',
  'v4-process-owned-build-failure-resolver-output-v3.json',
]);
const V6_OPTIONAL_NAMES = Object.freeze([
  'v6-process-owned-build-failure-resolver-postcheck-v1.json',
  'v6-process-owned-build-failure-assembly-postcheck-v1.json',
  'v6-process-owned-build-failure-resolver-output-v1.json',
]);

export interface V6PublicBuildReadInput {
  readonly bridgeRoot: string;
  readonly namespaceRoot: string;
  readonly resultParent: string;
  readonly expectedOutcomeSha256Hex: string;
}
export type V6PublicBuildClassification =
  | Readonly<{
    kind: 'public_failure'; failedWhile: string; receiptSha256Hex: string;
    successEstablished: false; lineageInReceipt: false;
    campaignAdmitted: false; physicalAssemblyVerified: false;
  }>
  | Readonly<{
    kind: 'reported_static_success'; receiptSha256Hex: string;
    assembly: Readonly<{ relativePath: string; bytes: number; sha256Hex: string }>;
    jobsReportedExecuted: true; physicalAssemblyVerified: false;
    cleanBridgeReferenceVerified: false; campaignAdmitted: false;
  }>;

function fail(reason: string): never {
  throw new Error('V6 public build result: ' + reason);
}
function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function hex(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
}
function exact(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) {
    fail(label + ' fields differ');
  }
  return value as Record<string, unknown>;
}
function integer(value: unknown, minimum: number, maximum: number, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)
      || value < minimum || value > maximum) fail(label + ' bound differs');
  return value;
}
function samePath(left: string, right: string): boolean {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase();
}
function overlap(left: string, right: string): boolean {
  const a = resolve(left).toLowerCase();
  const b = resolve(right).toLowerCase();
  return a === b || a.startsWith(b + sep) || b.startsWith(a + sep);
}
function identity(stat: BigIntStats): string {
  return [stat.dev, stat.ino, stat.mode, stat.nlink, stat.size,
    stat.mtimeNs, stat.ctimeNs, stat.birthtimeNs].join(':');
}
function directDirectory(path: string): void {
  for (let cursor = path;; cursor = dirname(cursor)) {
    const stat = lstatSync(cursor, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()
        || !samePath(realpathSync.native(cursor), cursor)) {
      fail('linked or non-directory ancestor');
    }
    if (dirname(cursor) === cursor) return;
  }
}
/** Presence-only selection. It never opens an old V4 sibling or a target. */
export function selectV6PublicBuildOutcomePathNonAuthorizing(parent: string):
  Readonly<{ path: string; kind: 'success' | 'failure' }> {
  if (typeof parent !== 'string' || !isAbsolute(parent)) fail('result parent is not absolute');
  const selected = resolve(parent);
  directDirectory(selected);
  const before = lstatSync(selected, { bigint: true });
  const names = readdirSync(selected);
  if (names.length > 8) fail('result parent membership exceeds cap');
  for (const name of [...V4_SIBLING_NAMES, ...V6_OPTIONAL_NAMES]) {
    if (names.includes(name)) fail('foreign or optional sibling is occupied');
  }
  const result = resolve(selected, RESULT_NAME);
  const failure = resolve(selected, FAILURE_NAME);
  const hasResult = names.includes(RESULT_NAME);
  const hasFailure = names.includes(FAILURE_NAME);
  if (hasResult === hasFailure) fail('result and failure presence is ambiguous');
  if (names.length !== 1) fail('unexpected result parent member');
  const afterNames = readdirSync(selected);
  if (afterNames.length !== 1 || afterNames[0] !== names[0]
      || identity(before) !== identity(lstatSync(selected, { bigint: true }))) {
    fail('result parent membership changed');
  }
  directDirectory(selected);
  return Object.freeze(hasResult
    ? { path: result, kind: 'success' as const }
    : { path: failure, kind: 'failure' as const });
}

/** Bounded direct read for isolated tests and the selected public reader. */
export function readDirectV6PublicBuildFile(path: string, maximumBytes: number):
  Readonly<{ bytes: Buffer; identity: string }> {
  if (typeof path !== 'string' || !isAbsolute(path)
      || !Number.isSafeInteger(maximumBytes)
      || maximumBytes <= 0 || maximumBytes > MAX_SOURCE_BYTES) {
    fail('selected file path or cap differs');
  }
  const selected = resolve(path);
  directDirectory(dirname(selected));
  const before = lstatSync(selected, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size <= 0n || before.size > BigInt(maximumBytes)
      || !samePath(realpathSync.native(selected), selected)) {
    fail('selected file is indirect or exceeds cap');
  }
  const fd = openSync(selected, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (identity(before) !== identity(opened)) fail('selected file changed before read');
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (count <= 0) fail('selected file shortened during read');
      offset += count;
    }
    const trailing = Buffer.alloc(1);
    if (readSync(fd, trailing, 0, 1, bytes.length) !== 0
        || identity(opened) !== identity(fstatSync(fd, { bigint: true }))
        || identity(opened) !== identity(lstatSync(selected, { bigint: true }))) {
      fail('selected file changed during read');
    }
    directDirectory(dirname(selected));
    return Object.freeze({ bytes, identity: identity(opened) });
  } finally { closeSync(fd); }
}

function strictText(text: string): Record<string, unknown> {
  if (!text || Buffer.byteLength(text, 'utf8') > MAX_RESULT_BYTES
      || text.charCodeAt(0) === 0xfeff || text.includes('\r')
      || !text.endsWith('\n')) fail('result encoding or size differs');
  const value = parseStrictJson(text, 'V6 public build result');
  if (canonicalJson(value) + '\n' !== text) fail('result is not canonical JSON+LF');
  return exact(value, ['schemaVersion', 'kind', 'receiptDigestHex',
    ...(typeof value === 'object' && value !== null && !Array.isArray(value)
      && (value as Record<string, unknown>).kind === 'v6-process-owned-build-failure-phase'
      ? ['failedWhile', 'successEstablished', 'campaignAdmitted']
      : ['source', 'dependencies', 'caps', 'captures', 'jobs', 'assembly', 'status'])],
  'result');
}

function safeRelative(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && !path.includes('\\')
    && path.split('/').every(piece => piece !== '' && piece !== '.' && piece !== '..'
      && /^[\x21-\x7e]+$/u.test(piece) && !/[<>:"|?*\\/]/u.test(piece)
      && !/[. ]$/u.test(piece));
}
function selectedCaps(value: unknown, lock: Readonly<V6CurrentNodeBuildLock>): void {
  const caps = exact(value, ['roots', 'total'], 'caps');
  const total = exact(caps.total, ['maxBytes', 'maxDirectories', 'maxFiles'], 'total caps');
  const fileCap = integer(total.maxFiles, 0, lock.approvedOutputCaps.maxFiles, 'total files');
  const dirCap = integer(total.maxDirectories, 0, lock.approvedOutputCaps.maxDirectories,
    'total directories');
  const byteCap = integer(total.maxBytes, 0, lock.approvedOutputCaps.maxBytes, 'total bytes');
  const roots = exact(caps.roots, V4_GENERATED_OUTPUT_ROOTS, 'root caps');
  for (const root of V4_GENERATED_OUTPUT_ROOTS) {
    const cap = exact(roots[root], ['maxBytes', 'maxDirectories', 'maxFiles'], 'root cap');
    integer(cap.maxFiles, 0, fileCap, 'root files');
    integer(cap.maxDirectories, 0, dirCap, 'root directories');
    integer(cap.maxBytes, 0, byteCap, 'root bytes');
  }
}
function selectedDependencies(value: unknown, lock: Readonly<V6CurrentNodeBuildLock>): void {
  const deps = exact(value, [
    'lockSha256Hex', 'mirrorReceiptSha256Hex', 'mavenTerminalSha256Hex',
    'leveldbReceiptSha256Hex', 'leveldbTerminalSha256Hex',
    'mirrorMetadataSha256Hex', 'mirrorFileCount', 'mirrorBytes',
    'bootJarFrameSha256Hex', 'bootFileCount', 'bootBytes',
    'leveldbAggregateSha256Hex', 'leveldbFileCount', 'leveldbBytes',
  ], 'dependencies');
  if (deps.lockSha256Hex !== V6_NODE_BUILD_LOCK_SHA256_HEX
      || deps.mirrorReceiptSha256Hex !== lock.ownedMavenMirrorReceiptSha256
      || deps.mavenTerminalSha256Hex !== lock.v6MavenTerminalSha256
      || deps.leveldbReceiptSha256Hex !== lock.ownedGitlabLeveldbReceiptSha256
      || deps.leveldbTerminalSha256Hex !== lock.v6LeveldbTerminalSha256
      || deps.mirrorMetadataSha256Hex !== lock.ownedMavenMirrorMetadataSha256
      || deps.bootJarFrameSha256Hex !== lock.ownedBootJarFrameSha256
      || deps.leveldbAggregateSha256Hex !== lock.ownedGitlabLeveldbAggregateSha256
      || deps.mirrorFileCount !== lock.ownedMavenMirrorFileCount
      || deps.mirrorBytes !== lock.ownedMavenMirrorBytes
      || deps.bootFileCount !== lock.ownedBootJarCount
      || deps.bootBytes !== lock.ownedBootJarBytes
      || deps.leveldbFileCount !== lock.ownedGitlabLeveldbFileCount
      || deps.leveldbBytes !== lock.ownedGitlabLeveldbBytes) {
    fail('selected V6 lock or terminal lineage differs');
  }
}

/** Parses a receipt claim; no target, Java, JAR or cleanup bytes are read. */
export function parseV6PublicBuildResultNonAuthorizing(
  text: string, lock: Readonly<V6CurrentNodeBuildLock>,
): V6PublicBuildClassification {
  const value = strictText(text);
  const { receiptDigestHex, ...body } = value;
  if (!hex(receiptDigestHex)) fail('receipt digest shape differs');
  if (value.kind === 'v6-process-owned-build-failure-phase') {
    if (value.schemaVersion !== 1
        || !FAILURE_STAGES.includes(value.failedWhile as typeof FAILURE_STAGES[number])
        || value.successEstablished !== false || value.campaignAdmitted !== false
        || receiptDigestHex !== sha256CanonicalJson(body, FAILURE_DOMAIN)) {
      fail('V6 public failure claims or digest differ');
    }
    return Object.freeze({
      kind: 'public_failure' as const, failedWhile: value.failedWhile as string,
      receiptSha256Hex: sha256(Buffer.from(text, 'utf8')),
      successEstablished: false as const, lineageInReceipt: false as const,
      campaignAdmitted: false as const, physicalAssemblyVerified: false as const,
    });
  }
  if (value.kind !== 'v6-process-owned-build-static-observation'
      || value.schemaVersion !== 1
      || receiptDigestHex !== sha256CanonicalJson(body, RESULT_DOMAIN)) {
    fail('V6 static result kind or digest differs');
  }
  const source = exact(value.source, ['checkoutHead', 'checkoutTree',
    'checkoutIndexSha256Hex', 'physicalSourceDigestHex',
    'planSnapshotSha256Hex', 'lockSha256Hex'], 'source');
  if (source.checkoutHead !== lock.ergoNodeBaseCommit
      || source.checkoutTree !== ERGO_TREE
      || source.lockSha256Hex !== V6_NODE_BUILD_LOCK_SHA256_HEX
      || !hex(source.checkoutIndexSha256Hex)
      || !hex(source.physicalSourceDigestHex)
      || !hex(source.planSnapshotSha256Hex)) {
    fail('V6 static source pins differ');
  }
  selectedDependencies(value.dependencies, lock);
  selectedCaps(value.caps, lock);
  const captures = exact(value.captures, ['a', 'b0', 'r', 'u'], 'physical captures');
  for (const name of ['a', 'b0', 'r', 'u']) {
    const row = exact(captures[name], ['entryCount', 'sha256Hex'], 'physical capture');
    integer(row.entryCount, 1, 100_000, 'capture entries');
    if (!hex(row.sha256Hex)) fail('capture digest differs');
  }
  const jobs = exact(value.jobs, ['assembly', 'resolver', 'update'], 'jobs');
  for (const [name, maximum] of [
    ['resolver', lock.resolverJob.maxOutputBytes],
    ['update', lock.updateJob.maxOutputBytes],
    ['assembly', lock.buildMaxOutputBytes],
  ] as const) {
    const row = exact(jobs[name], ['stdoutBytes', 'stdoutSha256Hex'], 'job');
    integer(row.stdoutBytes, name === 'resolver' ? 1 : 0, maximum, 'job output bytes');
    if (!hex(row.stdoutSha256Hex)) fail('job output digest differs');
  }
  const status = exact(value.status, ['resolverExecuted', 'updateExecuted',
    'assemblyExecuted', 'updateDependencyGraphReviewed', 'campaignAdmitted'], 'status');
  if (status.resolverExecuted !== true || status.updateExecuted !== true
      || status.assemblyExecuted !== true
      || status.updateDependencyGraphReviewed !== false
      || status.campaignAdmitted !== false) fail('V6 static status claims differ');
  const assembly = exact(value.assembly, ['relativePath', 'bytes', 'sha256Hex'], 'assembly');
  if (typeof assembly.relativePath !== 'string' || !safeRelative(assembly.relativePath)
      || dirname(assembly.relativePath) !== lock.assemblyDirectory
      || !new RegExp(lock.assemblyNamePattern, 'u').test(basename(assembly.relativePath))
      || !hex(assembly.sha256Hex)) fail('selected assembly path or digest differs');
  const size = integer(assembly.bytes, lock.minimumAssemblyBytes,
    lock.approvedOutputCaps.maxBytes, 'assembly bytes');
  return Object.freeze({
    kind: 'reported_static_success' as const,
    receiptSha256Hex: sha256(Buffer.from(text, 'utf8')),
    assembly: Object.freeze({ relativePath: assembly.relativePath,
      bytes: size, sha256Hex: assembly.sha256Hex }),
    jobsReportedExecuted: true as const, physicalAssemblyVerified: false as const,
    cleanBridgeReferenceVerified: false as const, campaignAdmitted: false as const,
  });
}

/** Selects only public B0 records; it never opens an assembly or old V4 receipt. */
export function inspectSelectedV6PublicBuildResult(
  input: Readonly<V6PublicBuildReadInput>,
): V6PublicBuildClassification {
  if (input === null || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).sort().join('\0')
        !== 'bridgeRoot\0expectedOutcomeSha256Hex\0namespaceRoot\0resultParent'
      || !isAbsolute(input.bridgeRoot) || !isAbsolute(input.namespaceRoot)
      || !isAbsolute(input.resultParent) || !hex(input.expectedOutcomeSha256Hex)
      || overlap(input.bridgeRoot, input.namespaceRoot)
      || overlap(input.bridgeRoot, input.resultParent)
      || overlap(input.namespaceRoot, input.resultParent)) {
    fail('selected public roots or digest differ');
  }
  const bridgeRoot = resolve(input.bridgeRoot);
  const namespaceRoot = resolve(input.namespaceRoot);
  const resultParent = resolve(input.resultParent);
  const selectedLock = inspectSelectedV6NodeBuildLock({
    path: resolve(bridgeRoot, V6_NODE_BUILD_LOCK_RELATIVE_PATH),
    expectedSha256Hex: V6_NODE_BUILD_LOCK_SHA256_HEX,
  });
  const lock = selectedLock.lock;
  const pins = [
    { path: resolve(bridgeRoot, 'relayer', 'src', ACTOR_SOURCE_NAME),
      bytes: MAX_SOURCE_BYTES, sha: ACTOR_SOURCE_SHA256 },
    { path: resolve(bridgeRoot, V6_NODE_BUILD_LOCK_RELATIVE_PATH),
      bytes: MAX_LOCK_BYTES, sha: V6_NODE_BUILD_LOCK_SHA256_HEX },
    { path: resolve(namespaceRoot, MAVEN_TERMINAL_NAME),
      bytes: MAX_TERMINAL_BYTES, sha: lock.v6MavenTerminalSha256 },
    { path: resolve(namespaceRoot, LEVELDB_TERMINAL_NAME),
      bytes: MAX_TERMINAL_BYTES, sha: lock.v6LeveldbTerminalSha256 },
  ] as const;
  const before = pins.map(pin => {
    const result = readDirectV6PublicBuildFile(pin.path, pin.bytes);
    if (sha256(result.bytes) !== pin.sha) fail('selected source or terminal pin differs');
    return result;
  });
  const outcome = selectV6PublicBuildOutcomePathNonAuthorizing(resultParent);
  const first = readDirectV6PublicBuildFile(outcome.path, MAX_RESULT_BYTES);
  if (sha256(first.bytes) !== input.expectedOutcomeSha256Hex) {
    fail('selected outcome digest differs');
  }
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
    .decode(first.bytes);
  const parsed = parseV6PublicBuildResultNonAuthorizing(text, lock);
  if ((parsed.kind === 'public_failure') !== (outcome.kind === 'failure')) {
    fail('selected outcome kind differs');
  }
  const last = readDirectV6PublicBuildFile(outcome.path, MAX_RESULT_BYTES);
  if (first.identity !== last.identity || !first.bytes.equals(last.bytes)) {
    fail('selected outcome changed');
  }
  for (let index = 0; index < pins.length; index++) {
    const pin = pins[index]!;
    const after = readDirectV6PublicBuildFile(pin.path, pin.bytes);
    if (before[index]!.identity !== after.identity
        || !before[index]!.bytes.equals(after.bytes)) {
      fail('selected source or terminal changed');
    }
  }
  const finalOutcome = selectV6PublicBuildOutcomePathNonAuthorizing(resultParent);
  if (finalOutcome.path !== outcome.path || finalOutcome.kind !== outcome.kind) {
    fail('selected result/failure presence changed');
  }
  return parsed;
}
