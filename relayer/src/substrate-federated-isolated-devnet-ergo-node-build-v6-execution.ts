import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';

import { canonicalJson, parseStrictJson, sha256CanonicalJson } from './strict-json.js';
import {
  runV6OwnedBuildAttempt, type V6OwnedBuildInput, type V6OwnedBuildResult,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-owned-resolver.js';
import { rootsOverlap } from './substrate-federated-isolated-devnet-ergo-node-build-v4-dependencies.js';
import {
  hashV4SelectedAssembly, V4_GENERATED_OUTPUT_ROOTS,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-postbuild.js';
import {
  assertSameV4PinnedToolchain, captureV4PinnedToolchain,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-toolchain.js';
import {
  inspectSelectedV6NodeBuildLock, V6_NODE_BUILD_LOCK_RELATIVE_PATH,
  V6_NODE_BUILD_LOCK_SHA256_HEX,
} from './substrate-federated-isolated-devnet-ergo-node-build-v6-lock.js';
import { selectV6BuildPreentryInputNonAuthorizing }
  from './substrate-federated-isolated-devnet-ergo-node-build-v6-preentry.js';
import {
  inspectSelectedV6PublicBuildResult, readDirectV6PublicBuildFile,
} from './substrate-federated-isolated-devnet-ergo-node-build-v6-result-reader.js';
import type { SubstrateFederatedIsolatedDevnetErgoNodeProcessV1Input }
  from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';

export type V6ErgoRuntimeBuildInput = Readonly<V6OwnedBuildInput>;
export type ErgoNodeExecutionHandoff = Readonly<SubstrateFederatedIsolatedDevnetErgoNodeProcessV1Input>;

const DOMAIN = 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_BUILD_V6_EXECUTION_V1';
const RESULT_NAME = 'v6-process-owned-build-result.json';
const PATH_KEYS = [
  'bridgeRoot', 'sourcePath', 'gitExecutablePath', 'mirrorRoot', 'bootRoot',
  'leveldbRoot', 'leveldbReceiptPath', 'mavenNamespaceRoot', 'v6MavenSourceRoot',
  'resultPath', 'javaExecutablePath', 'sbtLauncherJarPath', 'systemRoot',
] as const;
const HOME_KEYS = [
  'b0', 'preTarget', 'beforeResolverJob', 'afterResolverJob',
  'beforeUpdateJob', 'afterUpdateJob', 'beforeAssemblyJob', 'afterAssemblyJob',
] as const;
const INPUT_KEYS = [...PATH_KEYS, 'lockSelection', 'gitHomes', 'caps', 'maxMembershipBytes'];
const CAP_KEYS = ['maxFiles', 'maxDirectories', 'maxBytes'] as const;

function fail(reason: string): never {
  throw new Error('V6 Ergo execution build: ' + reason);
}
function data(value: unknown, names: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail(label + ' is not a literal record');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== names.length
      || Object.keys(descriptors).sort().join('\0') !== [...names].sort().join('\0')
      || Object.values(descriptors).some(item => !('value' in item) || !item.enumerable)) {
    fail(label + ' exact data fields differ');
  }
  return Object.fromEntries(names.map(name => [name, descriptors[name]!.value]));
}
function absolute(value: unknown): string {
  if (typeof value !== 'string' || !isAbsolute(value)
      || /[\u0000-\u001f\u007f]/u.test(value)) fail('absolute path differs');
  return resolve(value);
}
function sameJson(left: unknown, right: unknown, label: string): void {
  if (canonicalJson(left) !== canonicalJson(right)) fail(label + ' join differs');
}
function sha(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Literal selection only: no filesystem, process, build or custody effect. */
export function selectV6ErgoRuntimeBuildInputNonAuthorizing(
  value: Readonly<V6OwnedBuildInput>,
): Readonly<V6OwnedBuildInput> {
  const raw = data(value, INPUT_KEYS, 'input');
  if (raw.lockSelection !== 'v6-current') fail('explicit V6 selection differs');
  const paths = Object.fromEntries(PATH_KEYS.map(key => [key, absolute(raw[key])])) as
    Record<typeof PATH_KEYS[number], string>;
  if (basename(paths.resultPath) !== RESULT_NAME) fail('result name differs');
  const rawHomes = data(raw.gitHomes, HOME_KEYS, 'Git homes');
  const homes = Object.freeze(Object.fromEntries(HOME_KEYS.map(key => [key, absolute(rawHomes[key])]))) as
    Readonly<V6OwnedBuildInput['gitHomes']>;
  const rawCaps = data(raw.caps, ['roots', 'total'], 'caps');
  const rawRoots = data(rawCaps.roots, V4_GENERATED_OUTPUT_ROOTS, 'root caps');
  const cap = (entry: unknown) => Object.freeze(data(entry, CAP_KEYS, 'cap'));
  const caps = {
    total: cap(rawCaps.total),
    roots: Object.fromEntries(V4_GENERATED_OUTPUT_ROOTS.map(root => [root, cap(rawRoots[root])])),
  } as unknown as V6OwnedBuildInput['caps'];
  const selected = selectV6BuildPreentryInputNonAuthorizing({
    bridgeRoot: paths.bridgeRoot, sourcePath: paths.sourcePath,
    gitExecutablePath: paths.gitExecutablePath, gitHomePath: homes.b0,
    lockSelection: 'v6-current', mirrorRoot: paths.mirrorRoot, bootRoot: paths.bootRoot,
    leveldbRoot: paths.leveldbRoot, leveldbReceiptPath: paths.leveldbReceiptPath,
    mavenNamespaceRoot: paths.mavenNamespaceRoot, v6MavenSourceRoot: paths.v6MavenSourceRoot,
    caps, maxMembershipBytes: raw.maxMembershipBytes as number,
  });
  const protectedRoots = [paths.bridgeRoot, paths.sourcePath, paths.mirrorRoot,
    paths.bootRoot, paths.leveldbRoot, paths.mavenNamespaceRoot, paths.v6MavenSourceRoot];
  for (let index = 0; index < HOME_KEYS.length; index++) {
    const home = homes[HOME_KEYS[index]!];
    if (rootsOverlap(home, dirname(paths.sourcePath))
        || protectedRoots.some(root => rootsOverlap(home, root))
        || rootsOverlap(home, paths.resultPath)
        || HOME_KEYS.slice(index + 1).some(key => rootsOverlap(home, homes[key]))) {
      fail('Git homes overlap selected inputs or each other');
    }
  }
  if (protectedRoots.some(root => rootsOverlap(paths.resultPath, root))) {
    fail('result overlaps selected input');
  }
  return Object.freeze({
    ...paths, lockSelection: 'v6-current' as const, gitHomes: homes,
    caps: selected.caps, maxMembershipBytes: selected.maxMembershipBytes,
  });
}

function directParents(file: string): void {
  for (let cursor = dirname(file);; cursor = dirname(cursor)) {
    const current = lstatSync(cursor, { bigint: true });
    if (!current.isDirectory() || current.isSymbolicLink()
        || resolve(realpathSync.native(cursor)).toLowerCase() !== cursor.toLowerCase()) {
      fail('indirect ancestor');
    }
    if (dirname(cursor) === cursor) return;
  }
}
function absent(path: string): void {
  try { lstatSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  fail('fresh output or Git HOME is occupied');
}
function identity(path: string): string {
  const stat = lstatSync(path, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n) fail('indirect assembly');
  return [stat.dev, stat.ino, stat.mode, stat.nlink, stat.size,
    stat.mtimeNs, stat.ctimeNs, stat.birthtimeNs].join(':');
}
function fresh(input: Readonly<V6OwnedBuildInput>): void {
  directParents(resolve(input.sourcePath, 'target'));
  directParents(input.resultPath);
  if (readdirSync(dirname(input.resultPath)).length !== 0) fail('result parent is occupied');
  absent(resolve(input.sourcePath, 'target'));
  for (const home of Object.values(input.gitHomes)) {
    directParents(home);
    absent(home);
  }
}
function actorClaims(built: Readonly<V6OwnedBuildResult>): void {
  data(built, ['schema', 'resolverExecuted', 'updateExecuted', 'assemblyExecuted',
    'updateDependencyGraphReviewed', 'campaignAdmitted', 'preentry',
    'resolverCapture', 'updateCapture', 'assemblyCapture', 'effectiveResolvers',
    'updateStdoutBytes', 'updateStdoutSha256Hex', 'assembly', 'receiptDigestHex',
    'receiptFileSha256Hex'], 'actor result');
  if (built.schema !== 'substrate-federated-isolated-devnet-node-build-v6-process-owned'
      || built.resolverExecuted !== true || built.updateExecuted !== true
      || built.assemblyExecuted !== true || built.updateDependencyGraphReviewed !== false
      || built.campaignAdmitted !== false
      || built.preentry?.schema !== 'substrate-federated-isolated-devnet-node-build-v6-preentry'
      || built.preentry.sourceOnly !== true || built.preentry.resolverExecuted !== false
      || built.preentry.buildExecuted !== false || built.preentry.bridgeHeadBound !== false
      || built.preentry.campaignAdmitted !== false
      || built.preentry.externalAcceptanceEstablished !== false) fail('actor schema or claims differ');
}

/** Fixed V6 builder-to-node handoff. A retained public result is never an input. */
export async function buildSubstrateFederatedIsolatedDevnetErgoNodeV6ForExecution(
  inputValue: Readonly<V6OwnedBuildInput>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetErgoNodeProcessV1Input>> {
  const input = selectV6ErgoRuntimeBuildInputNonAuthorizing(inputValue);
  fresh(input);
  const lockPath = resolve(input.bridgeRoot, V6_NODE_BUILD_LOCK_RELATIVE_PATH);
  const lockPin = readDirectV6PublicBuildFile(lockPath, 4_096);
  if (sha(lockPin.bytes) !== V6_NODE_BUILD_LOCK_SHA256_HEX) fail('selected lock digest differs');
  const selectedLock = inspectSelectedV6NodeBuildLock({
    path: lockPath, expectedSha256Hex: V6_NODE_BUILD_LOCK_SHA256_HEX,
  });
  const tools = captureV4PinnedToolchain({
    javaExecutablePath: input.javaExecutablePath, sbtLauncherJarPath: input.sbtLauncherJarPath,
    lock: selectedLock.lock,
  });
  const built = await runV6OwnedBuildAttempt(input);
  actorClaims(built);
  if (built.preentry.preflight.lockSha256Hex !== selectedLock.sha256Hex
      || built.preentry.maxMembershipBytes !== input.maxMembershipBytes) fail('actor preentry differs');
  sameJson(built.preentry.caps, input.caps, 'selected caps');
  const resultPin = readDirectV6PublicBuildFile(input.resultPath, 16_384);
  if (sha(resultPin.bytes) !== built.receiptFileSha256Hex) fail('actor receipt file differs');
  const observed = inspectSelectedV6PublicBuildResult({
    bridgeRoot: input.bridgeRoot, namespaceRoot: input.mavenNamespaceRoot,
    resultParent: dirname(input.resultPath), expectedOutcomeSha256Hex: built.receiptFileSha256Hex,
  });
  if (observed.kind !== 'reported_static_success' || observed.jobsReportedExecuted !== true
      || observed.physicalAssemblyVerified !== false || observed.cleanBridgeReferenceVerified !== false
      || observed.campaignAdmitted !== false) fail('public result is not the selected static success');
  const body = parseStrictJson(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
    .decode(resultPin.bytes), 'V6 execution result') as Record<string, unknown>;
  if (body.receiptDigestHex !== built.receiptDigestHex
      || observed.receiptSha256Hex !== built.receiptFileSha256Hex) fail('actor receipt digest differs');
  const preflight = built.preentry.preflight;
  sameJson(body.source, {
    checkoutHead: preflight.checkoutHead, checkoutTree: preflight.checkoutTree,
    checkoutIndexSha256Hex: preflight.checkoutIndexSha256Hex,
    physicalSourceDigestHex: preflight.physicalSourceDigestHex,
    planSnapshotSha256Hex: built.preentry.planSnapshot.sha256Hex,
    lockSha256Hex: selectedLock.sha256Hex,
  }, 'source');
  sameJson(body.dependencies, built.preentry.dependencies, 'dependencies');
  sameJson(body.caps, input.caps, 'receipt caps');
  const captures = Object.fromEntries(([
    ['b0', 'B0', built.preentry.prebuild], ['r', 'R', built.resolverCapture],
    ['u', 'U', built.updateCapture], ['a', 'A', built.assemblyCapture],
  ] as const).map(([name, phase, capture]) => [name, {
    entryCount: capture.entries.length,
    sha256Hex: sha256CanonicalJson(capture, 'E2S_SUBSTRATE_FED_V6_PHYSICAL_CAPTURE_' + phase + '_V1'),
  }]));
  sameJson(body.captures, captures, 'captures');
  const jobs = body.jobs as Record<string, Record<string, unknown>>;
  if (jobs.resolver?.stdoutSha256Hex !== built.effectiveResolvers.stdoutSha256Hex
      || jobs.update?.stdoutBytes !== built.updateStdoutBytes
      || jobs.update?.stdoutSha256Hex !== built.updateStdoutSha256Hex) fail('job result joins differ');
  sameJson(body.assembly, {
    relativePath: built.assembly.path, bytes: built.assembly.bytes, sha256Hex: built.assembly.sha256Hex,
  }, 'assembly');
  sameJson(observed.assembly, body.assembly, 'public assembly');
  const assemblyPath = resolve(input.sourcePath, observed.assembly.relativePath);
  const assemblyIdentity = identity(assemblyPath);
  hashV4SelectedAssembly(input.sourcePath, built.assembly,
    Math.min(input.caps.total.maxBytes, selectedLock.lock.approvedOutputCaps.maxBytes));
  assertSameV4PinnedToolchain(tools, captureV4PinnedToolchain({
    javaExecutablePath: input.javaExecutablePath, sbtLauncherJarPath: input.sbtLauncherJarPath,
    lock: selectedLock.lock,
  }));
  const finalLock = readDirectV6PublicBuildFile(lockPath, 4_096);
  if (lockPin.identity !== finalLock.identity || !lockPin.bytes.equals(finalLock.bytes)) {
    fail('selected lock changed');
  }
  inspectSelectedV6NodeBuildLock({
    path: lockPath, expectedSha256Hex: V6_NODE_BUILD_LOCK_SHA256_HEX,
  });
  const finalResult = readDirectV6PublicBuildFile(input.resultPath, 16_384);
  if (resultPin.identity !== finalResult.identity || !resultPin.bytes.equals(finalResult.bytes)) {
    fail('selected result changed');
  }
  sameJson(inspectSelectedV6PublicBuildResult({
    bridgeRoot: input.bridgeRoot, namespaceRoot: input.mavenNamespaceRoot,
    resultParent: dirname(input.resultPath), expectedOutcomeSha256Hex: built.receiptFileSha256Hex,
  }), observed, 'final public result');
  directParents(assemblyPath);
  if (identity(assemblyPath) !== assemblyIdentity) fail('assembly changed after its stream');
  const buildIdentityDigestHex = sha256CanonicalJson({
    schema: 'substrate-federated-isolated-devnet-ergo-node-v6-execution',
    receiptDigestHex: built.receiptDigestHex, receiptFileSha256Hex: built.receiptFileSha256Hex,
    source: body.source, dependencies: body.dependencies, caps: body.caps,
    assembly: body.assembly,
    toolchain: {
      javaHomeSha256Hex: tools.javaHomeSha256Hex,
      javaExecutableSha256Hex: tools.javaExecutableSha256Hex,
      sbtLauncherJarSha256Hex: tools.sbtLauncherJarSha256Hex,
      identityFrameSha256Hex: tools.identityFrameSha256Hex,
    },
    updateDependencyGraphReviewed: false, campaignAdmitted: false,
  }, DOMAIN);
  return Object.freeze({
    javaExecutablePath: tools.javaExecutablePath,
    expectedJavaExecutableSha256Hex: tools.javaExecutableSha256Hex,
    nodeAssemblyJarPath: assemblyPath,
    expectedNodeAssemblyJarSha256Hex: observed.assembly.sha256Hex,
    buildIdentityDigestHex,
  });
}
