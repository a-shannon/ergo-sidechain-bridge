import { createHash } from 'node:crypto';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync,
  realpathSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, parse, resolve } from 'node:path';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { actor, toolCapture } = vi.hoisted(() => ({ actor: vi.fn(), toolCapture: vi.fn() }));
vi.mock('./substrate-federated-isolated-devnet-ergo-node-build-v4-owned-resolver.js',
  () => ({ runV6OwnedBuildAttempt: actor }));
vi.mock('./substrate-federated-isolated-devnet-ergo-node-build-v4-toolchain.js',
  async importOriginal => ({
    ...await importOriginal<Record<string, unknown>>(), captureV4PinnedToolchain: toolCapture,
  }));
// Isolate the previously reviewed fixed terminal/source pins, retaining the real
// direct-file reader, outcome selector and strict canonical public-result parser.
vi.mock('./substrate-federated-isolated-devnet-ergo-node-build-v6-result-reader.js',
  async importOriginal => {
    const real = await importOriginal<typeof import(
      './substrate-federated-isolated-devnet-ergo-node-build-v6-result-reader.js')>();
    return {
      ...real,
      inspectSelectedV6PublicBuildResult(input: {
        bridgeRoot: string; resultParent: string; expectedOutcomeSha256Hex: string;
      }) {
        const selected = real.selectV6PublicBuildOutcomePathNonAuthorizing(input.resultParent);
        const file = real.readDirectV6PublicBuildFile(selected.path, 16_384);
        if (hash(file.bytes) !== input.expectedOutcomeSha256Hex) throw new Error('fixture digest differs');
        const selectedLock = inspectSelectedV6NodeBuildLock({
          path: join(input.bridgeRoot, V6_NODE_BUILD_LOCK_RELATIVE_PATH),
          expectedSha256Hex: V6_NODE_BUILD_LOCK_SHA256_HEX,
        });
        return real.parseV6PublicBuildResultNonAuthorizing(
          new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(file.bytes),
          selectedLock.lock);
      },
    };
  });

import { canonicalJson, sha256CanonicalJson } from './strict-json.js';
import type { V6OwnedBuildInput, V6OwnedBuildResult }
  from './substrate-federated-isolated-devnet-ergo-node-build-v4-owned-resolver.js';
import type { V4PinnedToolchainCapture, V4PinnedToolchainInput }
  from './substrate-federated-isolated-devnet-ergo-node-build-v4-toolchain.js';
import { V4_GENERATED_OUTPUT_ROOTS }
  from './substrate-federated-isolated-devnet-ergo-node-build-v4-postbuild.js';
import { inspectSelectedV6NodeBuildLock, V6_NODE_BUILD_LOCK_CANONICAL_TEXT,
  V6_NODE_BUILD_LOCK_RELATIVE_PATH, V6_NODE_BUILD_LOCK_SHA256_HEX }
  from './substrate-federated-isolated-devnet-ergo-node-build-v6-lock.js';
import { buildSubstrateFederatedIsolatedDevnetErgoNodeV6ForExecution,
  selectV6ErgoRuntimeBuildInputNonAuthorizing }
  from './substrate-federated-isolated-devnet-ergo-node-build-v6-execution.js';

const hash = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');
const RESULT_DOMAIN = 'E2S_SUBSTRATE_FED_V6_OWNED_BUILD_STATIC_RECEIPT_V1';
const ROOT = resolve(import.meta.dirname, '..', '..');
const TEST_ROOT = resolve(process.env.ERGO_BRIDGE_TEST_TMP_ROOT
  ?? join(dirname(ROOT), 'diagnostics', 'v6-execution'));
const homeNames = ['b0', 'preTarget', 'beforeResolverJob', 'afterResolverJob',
  'beforeUpdateJob', 'afterUpdateJob', 'beforeAssemblyJob', 'afterAssemblyJob'] as const;
const cap = { maxFiles: 50_000, maxDirectories: 4_096, maxBytes: 536_870_912 };
let suite: string | undefined;
let serial = 0;

function candidate(root = resolve(TEST_ROOT, 'pure-input-no-files')): V6OwnedBuildInput {
  const namespace = join(root, 'namespace');
  const leveldbRoot = join(namespace, 'gitlab-leveldb-file-repo-01');
  return {
    bridgeRoot: join(root, 'bridge'), sourcePath: join(root, 'sources', 'source'),
    gitExecutablePath: join(root, 'tools', 'git.exe'), lockSelection: 'v6-current',
    mirrorRoot: join(root, 'mirror'), bootRoot: join(namespace, 'boot'),
    leveldbRoot, leveldbReceiptPath: leveldbRoot + '.json',
    mavenNamespaceRoot: namespace, v6MavenSourceRoot: join(root, 'public-cache'),
    caps: { total: { ...cap }, roots: Object.fromEntries(
      V4_GENERATED_OUTPUT_ROOTS.map(name => [name, { ...cap }])) as V6OwnedBuildInput['caps']['roots'] },
    maxMembershipBytes: 16_777_216,
    gitHomes: Object.fromEntries(homeNames.map(name => [name, join(root, 'git-homes', name)])) as
      unknown as V6OwnedBuildInput['gitHomes'],
    resultPath: join(root, 'result', 'v6-process-owned-build-result.json'),
    javaExecutablePath: join(root, 'tools', 'jdk', 'bin', 'java.exe'),
    sbtLauncherJarPath: join(root, 'tools', 'sbt-launch-1.12.11.jar'),
    systemRoot: process.env.SystemRoot ?? process.env.WINDIR ?? resolve(TEST_ROOT, 'windows'),
  };
}
function fixture(): V6OwnedBuildInput {
  if (!suite) {
    mkdirSync(TEST_ROOT, { recursive: true });
    suite = realpathSync.native(mkdtempSync(join(TEST_ROOT, 'v6-execution-')));
  }
  const selected = candidate(join(suite, String(++serial)));
  for (const directory of [selected.sourcePath, dirname(selected.resultPath),
    dirname(selected.gitHomes.b0), join(selected.bridgeRoot, 'sources')]) {
    mkdirSync(directory, { recursive: true });
  }
  writeFileSync(join(selected.bridgeRoot, V6_NODE_BUILD_LOCK_RELATIVE_PATH),
    V6_NODE_BUILD_LOCK_CANONICAL_TEXT, { flag: 'wx' });
  return selected;
}
function capture(input: V4PinnedToolchainInput): Readonly<V4PinnedToolchainCapture> {
  return {
    javaHomeRoot: dirname(dirname(input.javaExecutablePath)),
    javaExecutablePath: input.javaExecutablePath, sbtLauncherJarPath: input.sbtLauncherJarPath,
    javaHomeSha256Hex: input.lock.javaHomeSha256,
    javaExecutableSha256Hex: hash('fixture-java'),
    sbtLauncherJarSha256Hex: input.lock.sbtLauncherJarSha256,
    javaFileCount: 1, javaDirectoryCount: 2, javaBytes: 12,
    identityFrameSha256Hex: hash('fixture-tool-identities'),
  };
}
type MutableResult = Record<string, unknown>;
interface EmitOptions {
  body?: (body: MutableResult) => void;
  built?: (built: MutableResult) => void;
  text?: (text: string) => string;
  jar?: 'valid' | 'tampered' | 'linked';
}
function emit(input: V6OwnedBuildInput, options: EmitOptions = {}): Readonly<V6OwnedBuildResult> {
  const lock = inspectSelectedV6NodeBuildLock({
    path: join(input.bridgeRoot, V6_NODE_BUILD_LOCK_RELATIVE_PATH),
    expectedSha256Hex: V6_NODE_BUILD_LOCK_SHA256_HEX,
  }).lock;
  const physical = { rootIdentity: 'synthetic-source', gitRootIdentity: 'synthetic-git',
    entries: [{ path: 'src/file', kind: 'file', bytes: 1,
      sha256Hex: hash('s'), identity: 'synthetic-file' }], membership: 'src/file\n' };
  const source = { checkoutHead: lock.ergoNodeBaseCommit,
    checkoutTree: '9f8d571534b21eec660ff21177adf725e50ddf02',
    checkoutIndexSha256Hex: hash('index'), physicalSourceDigestHex: hash('source'),
    planSnapshotSha256Hex: hash('plan'), lockSha256Hex: V6_NODE_BUILD_LOCK_SHA256_HEX };
  const dependencies = {
    lockSha256Hex: V6_NODE_BUILD_LOCK_SHA256_HEX,
    mirrorReceiptSha256Hex: lock.ownedMavenMirrorReceiptSha256,
    mavenTerminalSha256Hex: lock.v6MavenTerminalSha256,
    leveldbReceiptSha256Hex: lock.ownedGitlabLeveldbReceiptSha256,
    leveldbTerminalSha256Hex: lock.v6LeveldbTerminalSha256,
    mirrorMetadataSha256Hex: lock.ownedMavenMirrorMetadataSha256,
    mirrorFileCount: lock.ownedMavenMirrorFileCount, mirrorBytes: lock.ownedMavenMirrorBytes,
    bootJarFrameSha256Hex: lock.ownedBootJarFrameSha256,
    bootFileCount: lock.ownedBootJarCount, bootBytes: lock.ownedBootJarBytes,
    leveldbAggregateSha256Hex: lock.ownedGitlabLeveldbAggregateSha256,
    leveldbFileCount: lock.ownedGitlabLeveldbFileCount, leveldbBytes: lock.ownedGitlabLeveldbBytes,
  };
  const jarBytes = 33_554_432;
  const jarHash = createHash('sha256').update(Buffer.alloc(jarBytes)).digest('hex');
  const assembly = { path: 'target/scala-2.12/ergo-synthetic.jar',
    bytes: jarBytes, sha256Hex: jarHash };
  const captures = Object.fromEntries(['B0', 'R', 'U', 'A'].map(phase => [
    phase.toLowerCase(), { entryCount: 1, sha256Hex: sha256CanonicalJson(physical,
      'E2S_SUBSTRATE_FED_V6_PHYSICAL_CAPTURE_' + phase + '_V1') },
  ]));
  const body: MutableResult = {
    schemaVersion: 1, kind: 'v6-process-owned-build-static-observation', source,
    dependencies, caps: input.caps, captures,
    jobs: {
      resolver: { stdoutBytes: 1, stdoutSha256Hex: hash('r') },
      update: { stdoutBytes: 1, stdoutSha256Hex: hash('u') },
      assembly: { stdoutBytes: 1, stdoutSha256Hex: hash('a') },
    },
    assembly: { relativePath: assembly.path, bytes: assembly.bytes, sha256Hex: assembly.sha256Hex },
    status: { resolverExecuted: true, updateExecuted: true, assemblyExecuted: true,
      updateDependencyGraphReviewed: false, campaignAdmitted: false },
  };
  // Keep the actor's independently returned source/capture objects separate from
  // coherently re-signed public forgeries.
  const preflight = structuredClone(source);
  const preentry = {
    schema: 'substrate-federated-isolated-devnet-node-build-v6-preentry',
    sourceOnly: true, resolverExecuted: false, buildExecuted: false,
    bridgeHeadBound: false, campaignAdmitted: false, externalAcceptanceEstablished: false,
    preflight, planSnapshot: { canonical: 'plan', sha256Hex: source.planSnapshotSha256Hex },
    prebuild: structuredClone(physical), dependencies: structuredClone(dependencies),
    caps: input.caps, maxMembershipBytes: input.maxMembershipBytes,
  };
  options.body?.(body);
  const receiptDigestHex = sha256CanonicalJson(body, RESULT_DOMAIN);
  let text = canonicalJson({ ...body, receiptDigestHex }) + '\n';
  text = options.text?.(text) ?? text;
  writeFileSync(input.resultPath, text, { flag: 'wx' });
  if (options.jar) {
    const path = resolve(input.sourcePath, assembly.path);
    mkdirSync(dirname(path), { recursive: true });
    const bytes = Buffer.alloc(jarBytes);
    if (options.jar === 'tampered') bytes[0] = 1;
    writeFileSync(path, bytes, { flag: 'wx' });
    if (options.jar === 'linked') linkSync(path, join(dirname(input.sourcePath), 'jar-alias'));
  }
  const built: MutableResult = {
    schema: 'substrate-federated-isolated-devnet-node-build-v6-process-owned',
    resolverExecuted: true, updateExecuted: true, assemblyExecuted: true,
    updateDependencyGraphReviewed: false, campaignAdmitted: false, preentry,
    resolverCapture: structuredClone(physical), updateCapture: structuredClone(physical),
    assemblyCapture: structuredClone(physical),
    effectiveResolvers: { stdoutSha256Hex: hash('r') },
    updateStdoutBytes: 1, updateStdoutSha256Hex: hash('u'), assembly,
    receiptDigestHex, receiptFileSha256Hex: hash(text),
  };
  options.built?.(built);
  return built as unknown as Readonly<V6OwnedBuildResult>;
}
function run(input: V6OwnedBuildInput, options?: EmitOptions) {
  actor.mockImplementation((selected: V6OwnedBuildInput) => emit(selected, options));
  return buildSubstrateFederatedIsolatedDevnetErgoNodeV6ForExecution(input);
}

beforeEach(() => {
  actor.mockReset();
  toolCapture.mockReset();
  toolCapture.mockImplementation(capture);
});
afterAll(() => {
  if (!suite) return;
  if (dirname(suite).toLowerCase() !== realpathSync.native(TEST_ROOT).toLowerCase()
      || !basename(suite).startsWith('v6-execution-')) throw new Error('unsafe fixture quarantine');
  const quarantine = join(parse(suite).root, 'A EFFACER');
  mkdirSync(quarantine, { recursive: true });
  const target = join(quarantine, 'bridge-' + basename(suite));
  if (existsSync(target)) throw new Error('fixture quarantine is occupied');
  renameSync(suite, target);
  expect(existsSync(suite)).toBe(false);
  expect(existsSync(target)).toBe(true);
});

describe('V6 execution literal selection', () => {
  it('deep-copies and freezes the exact seventeen fields without touching files or a builder', () => {
    const input = candidate();
    const selected = selectV6ErgoRuntimeBuildInputNonAuthorizing(input);
    expect(Object.keys(selected)).toHaveLength(17);
    expect(selected).not.toBe(input);
    expect(selected.gitHomes).not.toBe(input.gitHomes);
    expect(Object.isFrozen(selected)).toBe(true);
    expect(Object.isFrozen(selected.gitHomes)).toBe(true);
    expect(Object.isFrozen(selected.caps.roots.target)).toBe(true);
    expect(Object.isFrozen(selected.caps.total)).toBe(true);
    (input.caps.total as { maxFiles: number }).maxFiles = 1;
    expect(selected.caps.total.maxFiles).toBe(50_000);
    expect(actor).not.toHaveBeenCalled();
    expect(toolCapture).not.toHaveBeenCalled();
  });

  it.each(['legacy', 'extra', 'missing', 'relative', 'overlap', 'source-parent-home', 'cap', 'membership'] as const)(
    'rejects isolated %s input before effects', fault => {
      const input = candidate() as unknown as MutableResult;
      if (fault === 'legacy') input.lockSelection = 'v4';
      if (fault === 'extra') input.mirrorReceiptPath = 'historical';
      if (fault === 'missing') delete input.javaExecutablePath;
      if (fault === 'relative') input.sourcePath = '.';
      if (fault === 'overlap') (input.gitHomes as MutableResult).preTarget =
        (input.gitHomes as MutableResult).b0;
      if (fault === 'source-parent-home') (input.gitHomes as MutableResult).beforeUpdateJob =
        join(dirname(input.sourcePath as string), 'refused-home');
      if (fault === 'cap') ((input.caps as MutableResult).total as MutableResult).maxFiles = 50_001;
      if (fault === 'membership') input.maxMembershipBytes = 16_777_217;
      expect(() => selectV6ErgoRuntimeBuildInputNonAuthorizing(
        input as unknown as V6OwnedBuildInput)).toThrow();
      expect(actor).not.toHaveBeenCalled();
      expect(toolCapture).not.toHaveBeenCalled();
    });

  it('rejects an accessor without invoking it', () => {
    const input = candidate();
    let accessed = false;
    Object.defineProperty(input, 'javaExecutablePath',
      { enumerable: true, get() { accessed = true; return 'unexpected'; } });
    expect(() => selectV6ErgoRuntimeBuildInputNonAuthorizing(input)).toThrow(/data fields/u);
    expect(accessed).toBe(false);
  });
});

describe('fresh V6 builder to fixed node-owner input', () => {
  it('joins the actual returned V6 result, canonical receipt and direct JAR into only five fields', async () => {
    const input = fixture();
    const result = await run(input, { jar: 'valid' });
    expect(Object.keys(result).sort()).toEqual(['buildIdentityDigestHex',
      'expectedJavaExecutableSha256Hex', 'expectedNodeAssemblyJarSha256Hex',
      'javaExecutablePath', 'nodeAssemblyJarPath'].sort());
    expect(result.javaExecutablePath).toBe(input.javaExecutablePath);
    expect(result.nodeAssemblyJarPath).toBe(resolve(input.sourcePath,
      'target/scala-2.12/ergo-synthetic.jar'));
    expect(result.expectedNodeAssemblyJarSha256Hex).toBe(hash(
      readFileSync(result.nodeAssemblyJarPath)));
    expect(result.buildIdentityDigestHex).toMatch(/^[0-9a-f]{64}$/u);
    expect(Object.isFrozen(result)).toBe(true);
    expect(actor).toHaveBeenCalledTimes(1);
    expect(toolCapture).toHaveBeenCalledTimes(2);
    const record = JSON.parse(readFileSync(input.resultPath, 'utf8'));
    expect(record.status.updateDependencyGraphReviewed).toBe(false);
    expect(record.status.campaignAdmitted).toBe(false);
  });

  it.each(['target', 'result-parent', 'home'] as const)(
    'rejects occupied %s before the actual actor', async fault => {
      const input = fixture();
      if (fault === 'target') mkdirSync(join(input.sourcePath, 'target'));
      if (fault === 'result-parent') writeFileSync(join(dirname(input.resultPath), 'occupied'), 'x');
      if (fault === 'home') mkdirSync(input.gitHomes.afterAssemblyJob);
      await expect(run(input)).rejects.toThrow(/occupied/u);
      expect(actor).not.toHaveBeenCalled();
      expect(toolCapture).not.toHaveBeenCalled();
    });

  it('refuses a stale V1 consensus binding before actor or tool capture', async () => {
    const input = fixture();
    writeFileSync(join(input.bridgeRoot, V6_NODE_BUILD_LOCK_RELATIVE_PATH),
      V6_NODE_BUILD_LOCK_CANONICAL_TEXT.replace(
        '443fc2029710f85eb487fa5566e5395160ab946d65abce73380e046fd311cb32',
        '82e96dca999244f145a67381e0037770dfd93ad61ecb29d3063a6e5ea426a8b6'));
    await expect(run(input)).rejects.toThrow(/selected lock digest/u);
    expect(actor).not.toHaveBeenCalled();
    expect(toolCapture).not.toHaveBeenCalled();
  });

  it.each(['legacy-schema', 'actor-approval', 'receipt-file', 'receipt-domain',
    'source', 'capture', 'assembly', 'job', 'public-approval', 'duplicate'] as const)(
    'rejects an isolated coherent %s mismatch', async fault => {
      const input = fixture();
      const options: EmitOptions = {
        body(body) {
          if (fault === 'source') (body.source as MutableResult).physicalSourceDigestHex = 'f'.repeat(64);
          if (fault === 'capture') ((body.captures as MutableResult).a as MutableResult).sha256Hex =
            'f'.repeat(64);
          if (fault === 'assembly') (body.assembly as MutableResult).relativePath =
            'target/scala-2.12/ergo-other.jar';
          if (fault === 'job') ((body.jobs as MutableResult).update as MutableResult).stdoutSha256Hex =
            'f'.repeat(64);
          if (fault === 'public-approval') (body.status as MutableResult).campaignAdmitted = true;
        },
        built(built) {
          if (fault === 'legacy-schema') built.schema =
            'substrate-federated-isolated-devnet-node-build-v4-process-owned';
          if (fault === 'actor-approval') built.campaignAdmitted = true;
          if (fault === 'receipt-file') built.receiptFileSha256Hex = 'f'.repeat(64);
          if (fault === 'receipt-domain') built.receiptDigestHex = 'f'.repeat(64);
        },
        text(text) { return fault === 'duplicate' ? text.replace(
          '"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1') : text; },
      };
      await expect(run(input, options)).rejects.toThrow();
      expect(actor).toHaveBeenCalledTimes(1);
      expect(toolCapture).toHaveBeenCalledTimes(1);
    });

  it.each(['tampered', 'linked'] as const)('rejects a %s selected physical JAR', async jar => {
    const input = fixture();
    await expect(run(input, { jar })).rejects.toThrow(/assembly/u);
    expect(actor).toHaveBeenCalledTimes(1);
  });

  it('refuses a Java/SBT identity change across the actor and JAR validation', async () => {
    const input = fixture();
    toolCapture.mockImplementationOnce(capture).mockImplementationOnce(
      (value: V4PinnedToolchainInput) => ({
        ...capture(value), identityFrameSha256Hex: 'f'.repeat(64),
      }));
    await expect(run(input, { jar: 'valid' })).rejects.toThrow(/toolchain changed/u);
  });

  it('refuses a selected lock changed after the public-result validation', async () => {
    const input = fixture();
    toolCapture.mockImplementationOnce(capture).mockImplementationOnce(
      (value: V4PinnedToolchainInput) => {
        writeFileSync(join(input.bridgeRoot, V6_NODE_BUILD_LOCK_RELATIVE_PATH),
          V6_NODE_BUILD_LOCK_CANONICAL_TEXT + ' ');
        return capture(value);
      });
    await expect(run(input, { jar: 'valid' })).rejects.toThrow(/selected lock changed/u);
  });

  it('propagates actor failure without creating a node handoff or retrying', async () => {
    const input = fixture();
    const failure = new Error('synthetic actor failure');
    actor.mockRejectedValue(failure);
    await expect(buildSubstrateFederatedIsolatedDevnetErgoNodeV6ForExecution(input))
      .rejects.toBe(failure);
    expect(actor).toHaveBeenCalledTimes(1);
    expect(toolCapture).toHaveBeenCalledTimes(1);
    expect(existsSync(input.resultPath)).toBe(false);
  });
});
