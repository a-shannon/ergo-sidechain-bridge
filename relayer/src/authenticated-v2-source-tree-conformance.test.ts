import { createHash } from 'crypto';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildInjectedAuthenticatedV2SourceTreeConformanceReportForTest,
  assertNoParentRuntimeOverrides,
  encodeAuthenticatedV2CompilerInput,
  encodeAuthenticatedSpvTrackerJvmAvlFixture,
  loadAuthenticatedV2CompilerLock,
  parseAuthenticatedV2CompilerOutput,
  parseAuthenticatedV2JvmVmOutput,
  safeCompilerChildEnvironment,
  validateAuthenticatedV2CompilerLock,
  validateAuthenticatedV2CompilerProjectFileSet,
  validateAuthenticatedSpvTrackerJvmAvlFixture,
  type AuthenticatedV2CompilerLock,
  type AuthenticatedV2CompilerObservation,
} from './authenticated-v2-source-tree-conformance.js';
import {
  resolveAuthenticatedV2ContractSources,
  type ProvisioningContractInput,
  type ResolvedAuthenticatedV2ContractSources,
} from './authenticated-v2-contract-sources.js';
import { initialBindingCompilerRunFromPinnedJvm } from './authenticated-v2-initial-binding.js';
import {
  discoverBridgeRepositoryRoot,
  resolveBridgeRepositoryLayout,
} from './bridge-repository-layout.js';
import {
  type AuthenticatedV2ProvisioningPlan,
} from './authenticated-v2-provisioning-plan.js';
import { AUTHENTICATED_V2_PROVISIONING_SCHEMA } from './authenticated-v2-provisioning-schema.js';
import type { ConsensusSourceBaselineReport } from './consensus-source-baseline.js';
import { parseAuthenticatedV2CompilerSelfcheckArgs } from './scripts/authenticated-v2-compiler-selfcheck.js';
import { parseAuthenticatedV2SourceTreeConformanceArgs } from './scripts/authenticated-v2-source-tree-conformance.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRIDGE_ROOT = resolve(__dirname, '..', '..');
const LOCK_PATH = resolve(BRIDGE_ROOT, 'sources', 'authenticated-v2-compiler-lock.json');
const TRACKER_NFT_ID = '11'.repeat(32);
const DUP_NFT_ID = '22'.repeat(32);

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Canonical(value: unknown): string {
  return sha256(canonicalJson(value));
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => (
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`
  )).join(',')}}`;
}

function contract(sourceTemplate: string, ergoTreeHex: string): ProvisioningContractInput {
  return {
    sourceTemplate,
    sourceTemplateSha256Hex: sha256(sourceTemplate),
    ergoTreeHex,
    ergoTreeSha256Hex: sha256(Buffer.from(ergoTreeHex, 'hex')),
  };
}

function resolvedFixture(): ResolvedAuthenticatedV2ContractSources {
  return resolveAuthenticatedV2ContractSources({
    tracker: contract('{ sigmaProp(true) }', '1000'),
    unlock: contract(
      '{ val tracker = fromBase16("TRACKER_NFT_ID_PLACEHOLDER"); val dup = fromBase16("DUP_NFT_ID_PLACEHOLDER"); sigmaProp(tracker != dup) }',
      '1001',
    ),
    duplicatePrevention: contract(
      '{ val tracker = fromBase16("TRACKER_NFT_ID_PLACEHOLDER"); val unlock = fromBase16("AUTHENTICATED_UNLOCK_HASH_PLACEHOLDER"); sigmaProp(tracker != unlock) }',
      '1002',
    ),
  }, TRACKER_NFT_ID, DUP_NFT_ID);
}

function compilerLock(): AuthenticatedV2CompilerLock {
  return validateAuthenticatedV2CompilerLock(JSON.parse(readFileSync(LOCK_PATH, 'utf8')));
}

function baseline(status: 'PASS' | 'BLOCKED' = 'PASS'): ConsensusSourceBaselineReport {
  return {
    schemaVersion: 1,
    kind: 'bridge-consensus-source-baseline-report',
    status,
    errors: status === 'PASS' ? [] : ['unexpected checkout drift'],
    checks: {
      lockBindingsValidated: status === 'PASS',
      solidityBuildClosureArtifactsValidated: status === 'PASS',
      frontierCheckoutRequired: false,
      frontierCheckoutValidated: false,
      ergoCheckoutRequired: true,
      ergoCheckoutValidated: status === 'PASS',
    },
    sourceIdentity: {
      solidityBuildManifestSha256: null,
      frontierCommit: null,
      frontierPatchSha256: null,
      ergoBaseCommit: '2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1',
      ergoPatchSha256: compilerLock().ergoPatchSha256,
    },
    boundaries: {
      sidechainFinalityImplemented: true,
      runtimeCommitmentProducerImplemented: true,
      grandpaAuthorityTransitionVerificationImplemented: true,
      hashLinkedGrandpaVerificationImplemented: true,
      nativeRuntimeCommitmentStateVerificationImplemented: true,
      nativeFinalizedCheckpointVerificationImplemented: true,
      nativeRpcProofCodecImplemented: true,
      trustlessBurnVerificationImplemented: false,
      gate5Closed: false,
    },
  };
}

function plan(): AuthenticatedV2ProvisioningPlan {
  return {
    schema: AUTHENTICATED_V2_PROVISIONING_SCHEMA,
    packageDigestHex: 'ab'.repeat(32),
    environment: 'local-devnet',
    identities: {
      trackerNftId: TRACKER_NFT_ID,
      duplicatePreventionNftId: DUP_NFT_ID,
      authenticatedUnlockErgoTreeHashHex: 'cd'.repeat(32),
    },
  } as unknown as AuthenticatedV2ProvisioningPlan;
}

function observation(
  resolved: ResolvedAuthenticatedV2ContractSources,
  lock: AuthenticatedV2CompilerLock,
): AuthenticatedV2CompilerObservation {
  return {
    metadata: {
      networkPrefix: lock.networkPrefix,
      scriptVersion: lock.scriptVersion,
      treeVersion: lock.treeVersion,
      scalaVersion: lock.scalaVersion,
      javaMajorVersion: String(lock.javaMajorVersion),
      sigmaStateArtifactSha256: lock.sigmaStateArtifactSha256,
      runtimeClasspathSha256: lock.runtimeClasspathSha256,
      javaHomeSha256: lock.javaHomeSha256,
      roles: ['tracker', 'unlock', 'duplicatePrevention'],
    },
    contracts: {
      tracker: observedContract('tracker', resolved.tracker),
      unlock: observedContract('unlock', resolved.unlock),
      duplicatePrevention: observedContract('duplicatePrevention', resolved.duplicatePrevention),
    },
  };
}

function observedContract(role: 'tracker' | 'unlock' | 'duplicatePrevention', contractSource: ResolvedAuthenticatedV2ContractSources[typeof role]) {
  return {
    role,
    resolvedSourceSha256Hex: contractSource.resolvedSourceSha256Hex,
    ergoTreeHex: contractSource.ergoTreeHex,
    ergoTreeSha256Hex: contractSource.ergoTreeSha256Hex,
  };
}

describe('authenticated V2 source-to-tree conformance', () => {
  const originalSigmaOverride = process.env.SIGMASTATE_VERSION;
  const originalSbtOptions = process.env.SBT_OPTS;
  const originalJavaOptions = process.env.JAVA_OPTS;

  afterEach(() => {
    if (originalSigmaOverride === undefined) delete process.env.SIGMASTATE_VERSION;
    else process.env.SIGMASTATE_VERSION = originalSigmaOverride;
    if (originalSbtOptions === undefined) delete process.env.SBT_OPTS;
    else process.env.SBT_OPTS = originalSbtOptions;
    if (originalJavaOptions === undefined) delete process.env.JAVA_OPTS;
    else process.env.JAVA_OPTS = originalJavaOptions;
    delete process.env.BRIDGE_TEST_SECRET;
  });

  it('resolves the exact tracker, unlock, and DUP dependency graph once', () => {
    const resolved = resolvedFixture();
    expect(resolved.tracker.source).not.toContain('PLACEHOLDER');
    expect(resolved.unlock.source).toContain(TRACKER_NFT_ID);
    expect(resolved.unlock.source).toContain(DUP_NFT_ID);
    expect(resolved.duplicatePrevention.source).toContain(TRACKER_NFT_ID);
    expect(resolved.duplicatePrevention.source).toContain(
      resolved.authenticatedUnlockErgoTreeHashHex,
    );
    expect(resolved.duplicatePrevention.source).not.toContain('PLACEHOLDER');
  });

  it('loads only the exact locked compiler project files', () => {
    const loaded = loadAuthenticatedV2CompilerLock(BRIDGE_ROOT);
    expect(loaded.lock).toEqual(compilerLock());
    expect(loaded.buildPath).toMatch(/authenticated-v2-compiler[\\/]build\.sbt$/);
    expect(loaded.toolPath).toMatch(/ExactAuthenticatedV2Compiler\.scala$/);
    const repositoryRoot = discoverBridgeRepositoryRoot(BRIDGE_ROOT);
    const layout = resolveBridgeRepositoryLayout({ repositoryRoot, bridgeRoot: BRIDGE_ROOT });
    const attributes = readFileSync(resolve(repositoryRoot, '.gitattributes'), 'utf8');
    const bridgePrefix = layout.mode === 'standalone' ? '' : 'ergo-sidechain-bridge/';
    for (const rule of [
      layout.mode === 'standalone'
        ? '.github/workflows/*.yml text eol=lf'
        : '/.github/workflows/bridge-consensus-sources.yml text eol=lf',
      `${bridgePrefix}sources/authenticated-v2-compiler-lock.json text eol=lf`,
      `${bridgePrefix}sources/consensus-source-lock.json text eol=lf`,
      `${bridgePrefix}relayer/package-lock.json text eol=lf`,
      `${bridgePrefix}relayer/src/authenticated-v2-source-tree-conformance*.ts text eol=lf`,
      `${bridgePrefix}relayer/src/authenticated-v2-canonical-contracts.ts text eol=lf`,
      `${bridgePrefix}relayer/src/authenticated-v2-initial-binding*.ts text eol=lf`,
      `${bridgePrefix}relayer/src/authenticated-v2-sanitized-io.ts text eol=lf`,
      `${bridgePrefix}relayer/src/scripts/derive-authenticated-v2-initial-binding.ts text eol=lf`,
      `${bridgePrefix}relayer/tools/authenticated-v2-compiler/** text eol=lf`,
    ]) {
      expect(attributes).toContain(rule);
    }
  });

  it('rejects compiler identity drift and unsafe lock paths', () => {
    const lock = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
    expect(() => validateAuthenticatedV2CompilerLock({ ...lock, sigmaStateVersion: '6.0.3' }))
      .toThrow('sigma-state 6.0.2');
    expect(() => validateAuthenticatedV2CompilerLock({ ...lock, toolPath: '../compiler.scala' }))
      .toThrow('safe repository-relative path');
    expect(() => validateAuthenticatedV2CompilerLock({
      ...lock,
      gitDistributionUrl: 'https://example.invalid/MinGit.zip',
    })).toThrow('reviewed official MinGit distribution');
    expect(() => validateAuthenticatedV2CompilerLock({
      ...lock,
      gitDistributionSha256: lock.gitDistributionSha256.toUpperCase(),
    })).toThrow('lowercase SHA-256 hex');
    expect(() => validateAuthenticatedV2CompilerLock({
      ...lock,
      runtimeClasspathEntries: [...lock.runtimeClasspathEntries].reverse(),
    })).toThrow('canonical, ordered, and complete');
    expect(() => validateAuthenticatedV2CompilerLock({ ...lock, extra: true }))
      .toThrow('must contain exactly');
    expect(() => validateAuthenticatedV2CompilerProjectFileSet(
      ['build.sbt', 'project/build.properties', 'src/main/scala/Compiler.scala', 'project/plugins.sbt'],
      ['build.sbt', 'project/build.properties', 'src/main/scala/Compiler.scala'],
    )).toThrow('outside the reviewed lock set');
  });

  it('encodes canonical ordered compiler records and parses exact output', () => {
    const resolved = resolvedFixture();
    const lock = compilerLock();
    const encoded = encodeAuthenticatedV2CompilerInput(resolved).trimEnd().split('\n');
    expect(encoded.map(line => line.split('\t')[0])).toEqual([
      'tracker',
      'unlock',
      'duplicatePrevention',
    ]);
    const source = compilerOutput(resolved, lock);
    expect(parseAuthenticatedV2CompilerOutput(source)).toEqual(observation(resolved, lock));
  });

  it('rejects reordered roles, noncanonical hashes, and inconsistent tree hashes', () => {
    const resolved = resolvedFixture();
    const lock = compilerLock();
    const valid = compilerOutput(resolved, lock);
    const lines = valid.trimEnd().split('\n');
    expect(() => parseAuthenticatedV2CompilerOutput([
      lines[0], lines[2], lines[1], lines[3], '',
    ].join('\n'))).toThrow('malformed or out of order');
    expect(() => parseAuthenticatedV2CompilerOutput(valid.replace(
      resolved.tracker.ergoTreeSha256Hex,
      '00'.repeat(32),
    ))).toThrow('ErgoTree hash is inconsistent');
    expect(() => parseAuthenticatedV2CompilerOutput(valid.replace(
      lock.sigmaStateArtifactSha256,
      lock.sigmaStateArtifactSha256.toUpperCase(),
    ))).toThrow('lowercase');
  });

  it('parses context-bound per-input JVM acceptance without claiming node or Gate 5 acceptance', () => {
    const transactionId = '33'.repeat(32);
    const fixtureSha256 = '44'.repeat(32);
    const contextSha256 = '55'.repeat(32);
    const preHeaderParentId = '66'.repeat(32);
    const headerIdsSha256 = '77'.repeat(32);
    const unlockTreeSha256 = '88'.repeat(32);
    const duplicateTreeSha256 = '99'.repeat(32);
    const trackerTreeSha256 = 'aa'.repeat(32);
    const report = parseAuthenticatedV2JvmVmOutput([
      `BRIDGE_VM_META\t2\tsettlement\t${transactionId}\t${transactionId}\t${'bb'.repeat(32)}\t${fixtureSha256}\t${contextSha256}\t${preHeaderParentId}\t201\t${headerIdsSha256}\t2\t1\t10\troundtrip-ok`,
      `BRIDGE_VM_INPUT\t0\tduplicatePrevention\t${duplicateTreeSha256}\ttrue\t1234\t0`,
      `BRIDGE_VM_INPUT\t1\tunlock\t${unlockTreeSha256}\ttrue\t5678\t64`,
      `BRIDGE_VM_DATA\t0\ttracker\t${trackerTreeSha256}`,
      '',
    ].join('\n'));

    expect(report).toMatchObject({
      schemaVersion: 2,
      mode: 'settlement',
      transactionIdHex: transactionId,
      bytesToSignDigestHex: transactionId,
      fixtureSha256Hex: fixtureSha256,
      contextSha256Hex: contextSha256,
      preHeaderParentIdHex: preHeaderParentId,
      preHeaderHeight: 201,
      headerIdsSha256Hex: headerIdsSha256,
      inputCount: 2,
      dataInputCount: 1,
      headerCount: 10,
      serializationRoundTrip: true,
      allInputsAccepted: true,
      nodeStatefulAcceptance: false,
      broadcastPerformed: false,
      gate5Closed: false,
    });
    expect(report.inputs).toEqual([
      {
        inputIndex: 0,
        role: 'duplicatePrevention',
        ergoTreeSha256Hex: duplicateTreeSha256,
        accepted: true,
        cost: 1234,
        proofBytes: 0,
      },
      {
        inputIndex: 1,
        role: 'unlock',
        ergoTreeSha256Hex: unlockTreeSha256,
        accepted: true,
        cost: 5678,
        proofBytes: 64,
      },
    ]);
    expect(report.dataInputs).toEqual([{
      dataInputIndex: 0,
      role: 'tracker',
      ergoTreeSha256Hex: trackerTreeSha256,
    }]);
  });

  it('derives retained JVM contract authority from the pinned compiler internally', () => {
    const source = readFileSync(
      resolve(__dirname, 'authenticated-v2-source-tree-conformance.ts'),
      'utf8',
    );
    expect(source).not.toContain('expectedContractTrees');
    expect(source).toContain("await import(\n    './authenticated-v2-offline-vm-fixture.js'");
    expect(source).toContain('compilerIdentityDigestHex');
    expect(source).toContain('sourceBaselineDigestHex');
    expect(source).toContain('bindingDigestHex: sha256Canonical(canonicalBindingWithoutDigest)');
  });

  it('rejects malformed, role-divergent, or identity-divergent JVM VM acceptance output', () => {
    const transactionId = '33'.repeat(32);
    const metadata = `BRIDGE_VM_META\t2\ttracker\t${transactionId}\t${transactionId}\t${'44'.repeat(32)}\t${'55'.repeat(32)}\t${'66'.repeat(32)}\t${'77'.repeat(32)}\t201\t${'88'.repeat(32)}\t1\t0\t10\troundtrip-ok`;
    const input = `BRIDGE_VM_INPUT\t0\ttracker\t${'99'.repeat(32)}\ttrue\t1234\t64`;
    expect(() => parseAuthenticatedV2JvmVmOutput([
      metadata,
      input.replace('\ttrue\t', '\tfalse\t'),
    ].join('\n'))).toThrow('malformed or rejected');
    expect(() => parseAuthenticatedV2JvmVmOutput([
      metadata.replace(`\t${transactionId}\t${transactionId}\t`, `\t${transactionId}\t${'55'.repeat(32)}\t`),
      input,
    ].join('\n'))).toThrow('does not match the bytes-to-sign digest');
    expect(() => parseAuthenticatedV2JvmVmOutput([
      metadata.replace('\t1\t0\t10\t', '\t1\t0\t9\t'),
      input,
    ].join('\n'))).toThrow('header count must be exactly 10');
    expect(() => parseAuthenticatedV2JvmVmOutput([
      metadata,
      input.replace('\ttracker\t', '\tunlock\t'),
    ].join('\n'))).toThrow('tracker JVM VM input roles must be exactly tracker');
  });

  it('parses bounded JVM AVL insert outcomes without promoting node or Gate 5 authority', async () => {
    const module = await import('./authenticated-v2-source-tree-conformance.js');
    const parse = (module as Record<string, unknown>)
      .parseAuthenticatedSpvTrackerJvmAvlOutput;
    expect(parse).toBeTypeOf('function');

    const fixtureSha256Hex = '41'.repeat(32);
    const verifierArtifactSha256Hex = '42'.repeat(32);
    const runtimeClasspathSha256Hex = '43'.repeat(32);
    const successorDigestHex = `${'44'.repeat(32)}01`;
    const report = (parse as (source: string) => any)([
      `BRIDGE_AVL_META\t1\t${fixtureSha256Hex}\t2\t${verifierArtifactSha256Hex}\t${runtimeClasspathSha256Hex}\tno-node\tno-sign\tno-submit\tno-broadcast\tgate5-open`,
      `BRIDGE_AVL_CASE\t0\tcanonical-empty\ttrue\t${successorDigestHex}\toperation-accepted`,
      'BRIDGE_AVL_CASE\t1\ttruncated-proof\tfalse\t-\tverifier-construction-rejected',
    ].join('\n'));

    expect(report).toEqual({
      schemaVersion: 1,
      fixtureSha256Hex,
      verifierArtifactSha256Hex,
      runtimeClasspathSha256Hex,
      cases: [
        {
          caseIndex: 0,
          caseId: 'canonical-empty',
          operationAccepted: true,
          successorDigestHex,
          outcome: 'operation-accepted',
        },
        {
          caseIndex: 1,
          caseId: 'truncated-proof',
          operationAccepted: false,
          successorDigestHex: null,
          outcome: 'verifier-construction-rejected',
        },
      ],
      nodeStatefulAcceptance: false,
      signingPerformed: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      gate5Closed: false,
    });
  });

  it('rejects malformed or authority-promoting JVM AVL insert output', async () => {
    const module = await import('./authenticated-v2-source-tree-conformance.js');
    const parse = (module as Record<string, unknown>)
      .parseAuthenticatedSpvTrackerJvmAvlOutput as (source: string) => unknown;
    expect(parse).toBeTypeOf('function');

    const metadata = `BRIDGE_AVL_META\t1\t${'41'.repeat(32)}\t1\t${'42'.repeat(32)}\t${'43'.repeat(32)}\tno-node\tno-sign\tno-submit\tno-broadcast\tgate5-open`;
    const accepted = `BRIDGE_AVL_CASE\t0\tcanonical-empty\ttrue\t${'44'.repeat(32)}01\toperation-accepted`;
    expect(() => parse([
      metadata.replace('\tno-broadcast\t', '\tbroadcast\t'),
      accepted,
    ].join('\n'))).toThrow('boundary record is malformed');
    expect(() => parse([
      metadata,
      accepted.replace('\ttrue\t', '\tfalse\t'),
    ].join('\n'))).toThrow('rejected case must not expose a successor digest');
    expect(() => parse([
      metadata,
      accepted.replace('\toperation-accepted', '\toperation-rejected'),
    ].join('\n'))).toThrow('outcome is inconsistent');
    expect(() => parse([
      metadata,
      accepted.replace(`\ttrue\t${'44'.repeat(32)}01\toperation-accepted`, '\tfalse\t-\tunknown-rejection'),
    ].join('\n'))).toThrow('outcome is inconsistent');
  });

  it('validates and canonically encodes the bounded JVM AVL insert fixture', () => {
    const fixture = {
      schema: 'e2s.authenticated-spv-tracker-jvm-avl-fixture.v1',
      cases: [{
        caseId: 'canonical-empty',
        currentDigestHex: `${'11'.repeat(32)}00`,
        keyHex: '22'.repeat(32),
        valueHex: '33'.repeat(264),
        proofHex: '01',
      }],
      boundaries: {
        nodeStatefulAcceptance: false,
        signingPerformed: false,
        submissionPerformed: false,
        broadcastPerformed: false,
        gate5Closed: false,
      },
    };
    expect(validateAuthenticatedSpvTrackerJvmAvlFixture(fixture)).toEqual(fixture);
    expect(encodeAuthenticatedSpvTrackerJvmAvlFixture(fixture)).toBe(`${canonicalJson(fixture)}\n`);

    expect(() => validateAuthenticatedSpvTrackerJvmAvlFixture({
      ...fixture,
      extra: true,
    })).toThrow('must contain exactly');
    expect(() => validateAuthenticatedSpvTrackerJvmAvlFixture({
      ...fixture,
      cases: [{ ...fixture.cases[0], currentDigestHex: '11'.repeat(32) }],
    })).toThrow('current digest must be 33-byte lowercase hex');
    expect(() => validateAuthenticatedSpvTrackerJvmAvlFixture({
      ...fixture,
      cases: [fixture.cases[0], fixture.cases[0]],
    })).toThrow('case ID canonical-empty is duplicated');
    expect(() => validateAuthenticatedSpvTrackerJvmAvlFixture({
      ...fixture,
      boundaries: { ...fixture.boundaries, nodeStatefulAcceptance: true },
    })).toThrow('cannot claim node acceptance');
  });

  it('maps every pinned compiler identity field without retaining local executable paths', () => {
    const resolved = resolvedFixture();
    const lock = compilerLock();
    const sourceBaseline = baseline();
    const observed = observation(resolved, lock);
    const mapped = initialBindingCompilerRunFromPinnedJvm({
      lock,
      sourceBaseline,
      observation: observed,
      parentRuntime: {
        nodeVersion: lock.nodeVersion,
        nodeExecutableSha256: lock.nodeExecutableSha256,
        gitVersion: lock.gitVersion,
        gitExecutableSha256: lock.gitExecutableSha256,
        gitExecutablePath: 'local-executable-sentinel.exe',
        relayerPackageLockSha256: lock.relayerPackageLockSha256,
        parentRuntimePackagesValidated: true,
        loaderInvocationValidated: true,
        gitEnvironmentSanitized: true,
      },
    });

    expect(mapped.identity).toEqual({
      execution: 'pinned-resolver-free-jvm',
      compilerLockDigestHex: sha256Canonical(lock),
      sourceBaselineDigestHex: sha256Canonical(sourceBaseline),
      platform: lock.platform,
      nodeVersion: lock.nodeVersion,
      nodeExecutableSha256: lock.nodeExecutableSha256,
      gitVersion: lock.gitVersion,
      gitExecutableSha256: lock.gitExecutableSha256,
      relayerPackageLockSha256: lock.relayerPackageLockSha256,
      ergoNodeBaseCommit: lock.ergoNodeBaseCommit,
      consensusSourceLockSha256: lock.consensusSourceLockSha256,
      ergoPatchSha256: lock.ergoPatchSha256,
      sigmaStateVersion: lock.sigmaStateVersion,
      sigmaStateArtifactSha256: observed.metadata.sigmaStateArtifactSha256,
      runtimeBundleSha256: lock.runtimeBundleSha256,
      runtimeClasspathSha256: observed.metadata.runtimeClasspathSha256,
      javaHomeSha256: observed.metadata.javaHomeSha256,
      networkPrefix: observed.metadata.networkPrefix,
      scriptVersion: observed.metadata.scriptVersion,
      treeVersion: observed.metadata.treeVersion,
    });
    expect(mapped.observation.contracts).toEqual(observed.contracts);
    expect(JSON.stringify(mapped)).not.toContain('local-executable-sentinel');
  });

  it('keeps injected matching observations blocked and non-authoritative', () => {
    const resolved = resolvedFixture();
    const lock = compilerLock();
    const report = buildInjectedAuthenticatedV2SourceTreeConformanceReportForTest({
      plan: plan(),
      resolved,
      lock,
      sourceBaseline: baseline(),
      observation: observation(resolved, lock),
      parentRuntime: {
        nodeVersion: lock.nodeVersion,
        nodeExecutableSha256: lock.nodeExecutableSha256,
        gitVersion: lock.gitVersion,
        gitExecutableSha256: lock.gitExecutableSha256,
        gitExecutablePath: 'injected-git.exe',
        relayerPackageLockSha256: lock.relayerPackageLockSha256,
        parentRuntimePackagesValidated: true,
        loaderInvocationValidated: true,
        gitEnvironmentSanitized: true,
      },
      executionEvidence: {
        observation: observation(resolved, lock),
        compilerProjectFileSetValidated: true,
        forbiddenEnvironmentOverridesExcluded: true,
        runtimeSnapshotsValidated: true,
        runtimeSnapshotsReadOnly: true,
      },
    } as unknown as Parameters<typeof buildInjectedAuthenticatedV2SourceTreeConformanceReportForTest>[0]);
    expect(report.status).toBe('BLOCKED');
    expect(report.reportDigestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(report.compiler.observedMetadata).toEqual(observation(resolved, lock).metadata);
    expect(report.compiler.executionAuthority).toBe('injected-test-data');
    expect(report.compiler.sourceLockBindingsValidated).toBe(false);
    expect(report.compiler.ergoCheckoutValidated).toBe(false);
    expect(report.compiler.parentRuntimeValidated).toBe(false);
    expect(report.compiler.parentRuntimePackagesValidated).toBe(false);
    expect(report.compiler.loaderInvocationValidated).toBe(false);
    expect(report.compiler.gitEnvironmentSanitized).toBe(false);
    expect(report.compiler.compilerProjectFileSetValidated).toBe(false);
    expect(report.compiler.forbiddenEnvironmentOverridesExcluded).toBe(false);
    expect(report.compiler.runtimeSnapshotsValidated).toBe(false);
    expect(report.compiler.runtimeSnapshotsReadOnly).toBe(false);
    expect(report.errors).toContain('injected observations cannot establish pinned compiler execution');
    expect(report.boundaries.sourceToTreeVerified).toBe(false);
    expect(report.boundaries.retainedReportSufficientForSetup).toBe(false);
    expect(report.boundaries.independentAttestation).toBe(false);
    expect(report.boundaries.verifierRerunRequired).toBe(true);
    expect(report.contracts.unlock.exactByteMatch).toBe(true);
    expect(report.boundaries).toMatchObject({
      setupAuthorized: false,
      signingPerformed: false,
      jvmTransactionCheckPerformed: false,
      submissionPerformed: false,
      deploymentPerformed: false,
      broadcastPerformed: false,
      sidechainFinalityVerifiedOnErgo: false,
      gate5Closed: false,
      productionReady: false,
      trustedHostRequired: true,
      concurrentSameUserTamperingOutOfScope: true,
    });
  });

  it('blocks checkout drift, compiler artifact drift, source drift, and one-byte tree drift', () => {
    const resolved = resolvedFixture();
    const lock = compilerLock();
    const observed = observation(resolved, lock);
    observed.metadata.sigmaStateArtifactSha256 = 'ff'.repeat(32);
    observed.contracts.tracker.resolvedSourceSha256Hex = 'ee'.repeat(32);
    observed.contracts.unlock.ergoTreeHex = '1000';
    observed.contracts.unlock.ergoTreeSha256Hex = sha256(Buffer.from('1000', 'hex'));
    const report = buildInjectedAuthenticatedV2SourceTreeConformanceReportForTest({
      plan: plan(),
      resolved,
      lock,
      sourceBaseline: baseline('BLOCKED'),
      observation: observed,
    });
    expect(report.status).toBe('BLOCKED');
    expect(report.boundaries.sourceToTreeVerified).toBe(false);
    expect(report.errors).toEqual(expect.arrayContaining([
      'pinned Ergo source checkout was not validated',
      'loaded sigma-state compiler artifact does not match the lock',
      'tracker compiled source hash does not match the resolved source',
      'unlock compiled ErgoTree bytes do not match the provisioning binding',
    ]));
  });

  it('does not inherit compiler overrides or unrelated process secrets', () => {
    process.env.SIGMASTATE_VERSION = 'unreviewed';
    process.env.SBT_OPTS = '-Dunreviewed=true';
    process.env.JAVA_OPTS = '-javaagent:unreviewed.jar';
    process.env.BRIDGE_TEST_SECRET = 'must-not-propagate';
    const root = mkdtempSync(resolve(tmpdir(), 'bridge-compiler-env-'));
    try {
      const runtimeRoot = resolve(root, 'runtime');
      const javaHome = resolve(root, 'java-home');
      const environment = safeCompilerChildEnvironment(runtimeRoot, javaHome);
      expect(environment.SIGMASTATE_VERSION).toBeUndefined();
      expect(environment.SBT_OPTS).toBeUndefined();
      expect(environment.JAVA_OPTS).toBeUndefined();
      expect(environment.JAVA_TOOL_OPTIONS).toBeUndefined();
      expect(environment.JDK_JAVA_OPTIONS).toBeUndefined();
      expect(environment.CLASSPATH).toBeUndefined();
      expect(environment.BRIDGE_TEST_SECRET).toBeUndefined();
      expect(environment.JAVA_HOME).toBe(javaHome);
      expect(environment.USERPROFILE).toBe(resolve(runtimeRoot, 'home'));
      expect(environment.LOCALAPPDATA).toBe(resolve(runtimeRoot, 'localappdata'));
      expect(environment.NO_COLOR).toBe('1');
      expect(environment.COURSIER_MODE).toBe('offline');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects parent Node loader overrides while leaving Git variables to the sanitized child', () => {
    const lock = compilerLock();
    expect(() => assertNoParentRuntimeOverrides({
      NODE_OPTIONS: '--require unreviewed-loader.cjs',
    }, lock.forbiddenParentEnvironmentOverrides)).toThrow('override variables must be absent');
    expect(() => assertNoParentRuntimeOverrides({
      GIT_INDEX_FILE: 'unreviewed-index',
    }, lock.forbiddenParentEnvironmentOverrides)).not.toThrow();
  });

  it('requires one explicit sanitized-input binding, source checkout, digest, and new report target', () => {
    expect(parseAuthenticatedV2SourceTreeConformanceArgs([
      '--input',
      'input.json',
      '--expected-package-digest',
      'aa'.repeat(32),
      '--ergo-source',
      '../.source-cache/ergo-node',
      '--out',
      'report.json',
    ])).toMatchObject({
      input: 'input.json',
      expectedPackageDigest: 'aa'.repeat(32),
      ergoSource: '../.source-cache/ergo-node',
      out: 'report.json',
      errors: [],
    });
    expect(parseAuthenticatedV2SourceTreeConformanceArgs(['--input', 'input.json']).errors)
      .toEqual(expect.arrayContaining([
        '--expected-package-digest is required',
        '--ergo-source is required',
        '--out is required',
      ]));
    expect(parseAuthenticatedV2SourceTreeConformanceArgs([
      '--input', 'one.json', '--input', 'two.json',
    ]).errors).toContain('--input may be provided only once');
  });

  it('requires one explicit patched Ergo source for compiler self-check', () => {
    expect(parseAuthenticatedV2CompilerSelfcheckArgs([
      '--ergo-source',
      '../.source-cache/ergo-node',
    ])).toEqual({
      ergoSource: '../.source-cache/ergo-node',
      errors: [],
    });
    expect(parseAuthenticatedV2CompilerSelfcheckArgs([]).errors)
      .toContain('--ergo-source is required');
  });
});

function compilerOutput(
  resolved: ResolvedAuthenticatedV2ContractSources,
  lock: AuthenticatedV2CompilerLock,
): string {
  const metadata = [
    'BRIDGE_COMPILER_META',
    lock.networkPrefix,
    lock.scriptVersion,
    lock.treeVersion,
    lock.scalaVersion,
    lock.javaMajorVersion,
    lock.sigmaStateArtifactSha256,
    lock.runtimeClasspathSha256,
    lock.javaHomeSha256,
    'tracker,unlock,duplicatePrevention',
  ].join('\t');
  const records = (['tracker', 'unlock', 'duplicatePrevention'] as const).map(role => [
    'BRIDGE_CONTRACT',
    role,
    resolved[role].resolvedSourceSha256Hex,
    resolved[role].ergoTreeHex,
    resolved[role].ergoTreeSha256Hex,
  ].join('\t'));
  return `${[metadata, ...records].join('\n')}\n`;
}
