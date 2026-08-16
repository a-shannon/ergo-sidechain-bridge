import { execFile, execFileSync } from 'child_process';
import { createHash } from 'crypto';
import {
  cpSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { basename, delimiter, dirname, isAbsolute, relative, resolve } from 'path';
import { pathToFileURL } from 'url';

import {
  resolveAuthenticatedV2ContractSources,
  type ResolvedAuthenticatedV2ContractSource,
  type ResolvedAuthenticatedV2ContractSources,
} from './authenticated-v2-contract-sources.js';
import {
  type AuthenticatedV2ProvisioningInput,
  type AuthenticatedV2ProvisioningPlan,
} from './authenticated-v2-provisioning-plan.js';
import { AUTHENTICATED_V2_PROVISIONING_SCHEMA } from './authenticated-v2-provisioning-schema.js';
import {
  inspectConsensusSourceBaseline,
  type ConsensusSourceBaselineReport,
} from './consensus-source-baseline.js';

export const AUTHENTICATED_V2_SOURCE_TREE_CONFORMANCE_SCHEMA =
  'e2s.authenticated-v2-source-tree-conformance.v1';
export const AUTHENTICATED_SPV_TRACKER_JVM_AVL_FIXTURE_SCHEMA =
  'e2s.authenticated-spv-tracker-jvm-avl-fixture.v1';

const COMPILER_LOCK_KIND = 'bridge-authenticated-v2-compiler-lock';
const COMPILER_LOCK_SCHEMA_VERSION = 4;
const ERGO_NODE_BASE_COMMIT = '2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1';
const CONTRACT_ROLES = ['tracker', 'unlock', 'duplicatePrevention'] as const;
const HEX_32 = /^[0-9a-f]{64}$/;
const HEX_33 = /^[0-9a-f]{66}$/;
const HEX_20 = /^[0-9a-f]{40}$/;
const HEX_BYTES = /^(?:[0-9a-f]{2})+$/;
const PINNED_EXECUTION_AUTHORITY = Symbol('authenticated-v2-pinned-jvm-execution');

type ContractRole = typeof CONTRACT_ROLES[number];

export interface AuthenticatedV2CompilerLock {
  schemaVersion: 4;
  kind: typeof COMPILER_LOCK_KIND;
  platform: 'win32-x64';
  nodeVersion: '24.14.0';
  nodeExecutableSha256: string;
  gitVersion: '2.54.0.windows.1';
  gitExecutableSha256: string;
  gitDistributionUrl: 'https://github.com/git-for-windows/git/releases/download/v2.54.0.windows.1/MinGit-2.54.0-64-bit.zip';
  gitDistributionSha256: string;
  relayerPackageLockSha256: string;
  parentRuntimePackages: Array<{
    path: string;
    sha256: string;
  }>;
  forbiddenParentEnvironmentOverrides: [
    'NODE_COMPILE_CACHE',
    'NODE_EXTRA_CA_CERTS',
    'NODE_OPTIONS',
    'NODE_PATH',
    'TSX_TSCONFIG_PATH',
  ];
  trustedHostModel: 'exclusive-same-user-process';
  ergoNodeBaseCommit: string;
  ergoNodeBaseTag: 'v6.0.2';
  consensusSourceLockSha256: string;
  ergoPatchSha256: string;
  ergoPatchedBlobIds: [string, string];
  sigmaStateVersion: '6.0.2';
  sigmaStateArtifactSha256: string;
  runtimeBundlePath: string;
  runtimeBundleSha256: string;
  runtimeClasspathEntries: string[];
  runtimeClasspathSha256: string;
  scalaVersion: '2.12.20';
  sbtVersion: '1.11.1';
  javaMajorVersion: 17;
  javaDistribution: 'Microsoft OpenJDK 17.0.19+10-LTS';
  javaHomeSha256: string;
  networkPrefix: 16;
  scriptVersion: 3;
  treeVersion: 0;
  buildPath: string;
  buildSha256: string;
  sbtPropertiesPath: string;
  sbtPropertiesSha256: string;
  toolPath: string;
  toolSha256: string;
  compiledToolClassesSha256: string;
  mainClass: 'org.ergoplatform.bridge.tools.ExactAuthenticatedV2Compiler';
  forbiddenEnvironmentOverrides: [
    'CLASSPATH',
    'JAVA_OPTS',
    'JAVA_TOOL_OPTIONS',
    'JDK_JAVA_OPTIONS',
    'SBT_OPTS',
    'SIGMASTATE_VERSION',
    '_JAVA_OPTIONS',
  ];
}

export interface AuthenticatedV2CompilerMetadata {
  networkPrefix: number;
  scriptVersion: number;
  treeVersion: number;
  scalaVersion: string;
  javaMajorVersion: string;
  sigmaStateArtifactSha256: string;
  runtimeClasspathSha256: string;
  javaHomeSha256: string;
  roles: ContractRole[];
}

export interface AuthenticatedV2CompiledContractObservation {
  role: ContractRole;
  resolvedSourceSha256Hex: string;
  ergoTreeHex: string;
  ergoTreeSha256Hex: string;
}

export interface AuthenticatedV2CompilerObservation {
  metadata: AuthenticatedV2CompilerMetadata;
  contracts: Record<ContractRole, AuthenticatedV2CompiledContractObservation>;
}

export interface AuthenticatedV2SourceTreeContractResult {
  templateSha256Hex: string;
  resolvedSourceSha256Hex: string;
  expectedErgoTreeHex: string;
  expectedErgoTreeSha256Hex: string;
  compiledResolvedSourceSha256Hex: string | null;
  compiledErgoTreeHex: string | null;
  compiledErgoTreeSha256Hex: string | null;
  exactByteMatch: boolean;
}

export interface AuthenticatedV2SourceTreeConformanceReport {
  schema: typeof AUTHENTICATED_V2_SOURCE_TREE_CONFORMANCE_SCHEMA;
  reportDigestHex: string;
  status: 'PASS' | 'BLOCKED';
  provisioning: {
    schema: typeof AUTHENTICATED_V2_PROVISIONING_SCHEMA;
    packageDigestHex: string;
    environment: string;
    trackerNftId: string;
    duplicatePreventionNftId: string;
  };
  compiler: {
    execution: 'pinned-resolver-free-jvm' | 'injected-test-data';
    executionAuthority: 'local-reproducible-run' | 'injected-test-data';
    sourceBaselineStatus: ConsensusSourceBaselineReport['status'];
    sourceLockBindingsValidated: boolean;
    ergoCheckoutValidated: boolean;
    parentRuntimeValidated: boolean;
    nodeVersion: string;
    nodeExecutableSha256: string;
    gitVersion: string;
    gitExecutableSha256: string;
    gitDistributionUrl: string;
    gitDistributionSha256: string;
    relayerPackageLockSha256: string;
    parentRuntimePackagesValidated: boolean;
    loaderInvocationValidated: boolean;
    gitEnvironmentSanitized: boolean;
    ergoNodeBaseCommit: string;
    consensusSourceLockSha256: string;
    ergoPatchSha256: string;
    ergoPatchedBlobIds: [string, string];
    sigmaStateVersion: string;
    sigmaStateArtifactSha256: string;
    runtimeBundleSha256: string;
    runtimeClasspathEntries: string[];
    runtimeClasspathSha256: string;
    scalaVersion: string;
    sbtVersion: string;
    javaMajorVersion: number;
    javaDistribution: string;
    javaHomeSha256: string;
    networkPrefix: number;
    scriptVersion: number;
    treeVersion: number;
    buildSha256: string;
    sbtPropertiesSha256: string;
    toolSha256: string;
    compiledToolClassesSha256: string;
    compilerProjectFileSetValidated: boolean;
    forbiddenEnvironmentOverridesExcluded: boolean;
    runtimeSnapshotsValidated: boolean;
    runtimeSnapshotsReadOnly: boolean;
    observedMetadata: AuthenticatedV2CompilerMetadata | null;
  };
  contracts: Record<ContractRole, AuthenticatedV2SourceTreeContractResult>;
  errors: string[];
  boundaries: {
    sourceToTreeVerified: boolean;
    retainedReportSufficientForSetup: false;
    independentAttestation: false;
    verifierRerunRequired: true;
    setupAuthorized: false;
    signingPerformed: false;
    jvmTransactionCheckPerformed: false;
    submissionPerformed: false;
    deploymentPerformed: false;
    broadcastPerformed: false;
    sidechainFinalityVerifiedOnErgo: false;
    gate5Closed: false;
    productionReady: false;
    trustedHostRequired: true;
    concurrentSameUserTamperingOutOfScope: true;
  };
}

export interface RunAuthenticatedV2SourceTreeConformanceInput {
  provisioningInput: AuthenticatedV2ProvisioningInput;
  expectedProvisioningPackageDigestHex: string;
  bridgeRoot: string;
  worktreeRoot: string;
  ergoSourcePath: string;
}

export interface PinnedAuthenticatedV2CompilerRun {
  lock: AuthenticatedV2CompilerLock;
  sourceBaseline: ConsensusSourceBaselineReport;
  observation: AuthenticatedV2CompilerObservation;
  parentRuntime: VerifiedParentRuntime;
}

export interface VerifiedParentRuntime {
  nodeVersion: string;
  nodeExecutableSha256: string;
  gitVersion: string;
  gitExecutableSha256: string;
  gitExecutablePath: string;
  relayerPackageLockSha256: string;
  parentRuntimePackagesValidated: true;
  loaderInvocationValidated: true;
  gitEnvironmentSanitized: true;
}

export interface AuthenticatedV2JvmVmInputResult {
  inputIndex: number;
  role: 'tracker' | 'unlock' | 'duplicatePrevention';
  ergoTreeSha256Hex: string;
  accepted: true;
  cost: number;
  proofBytes: number;
}

export interface AuthenticatedV2JvmVmDataInputResult {
  dataInputIndex: number;
  role: 'tracker' | 'unlock' | 'duplicatePrevention';
  ergoTreeSha256Hex: string;
}

export interface AuthenticatedV2JvmVmRawConformanceReport {
  schemaVersion: 2;
  mode: 'tracker' | 'settlement';
  transactionIdHex: string;
  bytesToSignDigestHex: string;
  signedTransactionSha256Hex: string;
  fixtureSha256Hex: string;
  contextSha256Hex: string;
  preHeaderParentIdHex: string;
  preHeaderHeight: number;
  headerIdsSha256Hex: string;
  inputCount: number;
  dataInputCount: number;
  headerCount: 10;
  inputs: AuthenticatedV2JvmVmInputResult[];
  dataInputs: AuthenticatedV2JvmVmDataInputResult[];
  serializationRoundTrip: true;
  allInputsAccepted: true;
  nodeStatefulAcceptance: false;
  broadcastPerformed: false;
  gate5Closed: false;
}

export interface AuthenticatedV2JvmVmCanonicalCompilationBinding {
  fixtureSha256Hex: string;
  contextSha256Hex: string;
  trackerNftId: string;
  duplicatePreventionNftId: string;
  compilerIdentityDigestHex: string;
  sourceBaselineDigestHex: string;
  treeSha256: Record<ContractRole, string>;
  compilerPasses: 3;
  fixedPointVerified: true;
  bindingDigestHex: string;
}

export interface AuthenticatedV2JvmVmConformanceReport
  extends AuthenticatedV2JvmVmRawConformanceReport {
  canonicalCompilation: AuthenticatedV2JvmVmCanonicalCompilationBinding;
}

export type AuthenticatedSpvTrackerJvmAvlOutcome =
  | 'operation-accepted'
  | 'verifier-construction-rejected'
  | 'operation-rejected'
  | 'digest-read-rejected'
  | 'digest-missing'
  | 'digest-invalid';

export interface AuthenticatedSpvTrackerJvmAvlCaseResult {
  caseIndex: number;
  caseId: string;
  operationAccepted: boolean;
  successorDigestHex: string | null;
  outcome: AuthenticatedSpvTrackerJvmAvlOutcome;
}

export interface AuthenticatedSpvTrackerJvmAvlFixtureCase {
  caseId: string;
  currentDigestHex: string;
  keyHex: string;
  valueHex: string;
  proofHex: string;
}

export interface AuthenticatedSpvTrackerJvmAvlFixture {
  schema: typeof AUTHENTICATED_SPV_TRACKER_JVM_AVL_FIXTURE_SCHEMA;
  cases: AuthenticatedSpvTrackerJvmAvlFixtureCase[];
  boundaries: {
    nodeStatefulAcceptance: false;
    signingPerformed: false;
    submissionPerformed: false;
    broadcastPerformed: false;
    gate5Closed: false;
  };
}

export interface AuthenticatedSpvTrackerJvmAvlReport {
  schemaVersion: 1;
  fixtureSha256Hex: string;
  verifierArtifactSha256Hex: string;
  runtimeClasspathSha256Hex: string;
  cases: AuthenticatedSpvTrackerJvmAvlCaseResult[];
  nodeStatefulAcceptance: false;
  signingPerformed: false;
  submissionPerformed: false;
  broadcastPerformed: false;
  gate5Closed: false;
}

interface PinnedCompilerExecution {
  observation: AuthenticatedV2CompilerObservation;
  compilerProjectFileSetValidated: true;
  forbiddenEnvironmentOverridesExcluded: true;
  runtimeSnapshotsValidated: true;
  runtimeSnapshotsReadOnly: true;
}

interface PinnedToolExecution {
  output: string;
  compilerProjectFileSetValidated: true;
  forbiddenEnvironmentOverridesExcluded: true;
  runtimeSnapshotsValidated: true;
  runtimeSnapshotsReadOnly: true;
}

interface CompilerLockPaths {
  lock: AuthenticatedV2CompilerLock;
  buildPath: string;
  sbtPropertiesPath: string;
  toolPath: string;
  toolRoot: string;
  runtimeBundlePath: string;
  bridgeRoot: string;
  relayerRoot: string;
}

export interface AuthenticatedV2CompilerRuntimeBuildInputs {
  toolRoot: string;
  runtimeBundlePath: string;
  runtimeBundleSha256: string;
  javaHome: string;
}

export async function runAuthenticatedV2SourceTreeConformance(
  input: RunAuthenticatedV2SourceTreeConformanceInput,
): Promise<AuthenticatedV2SourceTreeConformanceReport> {
  const { buildAuthenticatedV2ProvisioningPlan } = await import(
    './authenticated-v2-provisioning-plan.js'
  );
  const bridgeRoot = realpathSync(input.bridgeRoot);
  const worktreeRoot = realpathSync(input.worktreeRoot);
  const ergoSourcePath = realpathSync(input.ergoSourcePath);
  const plan = await buildAuthenticatedV2ProvisioningPlan(input.provisioningInput);
  const expectedDigest = fixedHex(
    input.expectedProvisioningPackageDigestHex,
    'expected provisioning package digest',
  );
  if (plan.packageDigestHex !== expectedDigest) {
    throw new Error('provisioning input does not rebuild the expected package digest');
  }
  const resolved = resolveAuthenticatedV2ContractSources(
    input.provisioningInput.contracts,
    plan.identities.trackerNftId,
    plan.identities.duplicatePreventionNftId,
  );
  const lockPaths = loadAuthenticatedV2CompilerLock(bridgeRoot);
  const parentRuntime = validatePinnedParentRuntime(lockPaths);
  const sourceBaseline = inspectConsensusSourceBaseline({
    bridgeRoot,
    worktreeRoot,
    ergoSourcePath,
    requireFrontierCheckout: false,
    requireErgoCheckout: true,
    gitExecutablePath: parentRuntime.gitExecutablePath,
  });

  let observation: AuthenticatedV2CompilerObservation | null = null;
  let executionEvidence: PinnedCompilerExecution | null = null;
  let executionAuthority: typeof PINNED_EXECUTION_AUTHORITY | null = null;
  const executionErrors: string[] = [];
  if (sourceBaseline.status === 'PASS' && sourceBaseline.checks.ergoCheckoutValidated) {
    try {
      executionEvidence = await executePinnedCompiler(lockPaths, resolved);
      observation = executionEvidence.observation;
      executionAuthority = PINNED_EXECUTION_AUTHORITY;
    } catch (error) {
      executionErrors.push(`pinned compiler execution failed: ${errorMessage(error)}`);
    }
  } else {
    executionErrors.push(...sourceBaseline.errors.map(error => `source baseline: ${error}`));
  }

  return buildAuthenticatedV2SourceTreeConformanceReport({
    plan,
    resolved,
    lock: lockPaths.lock,
    sourceBaseline,
    observation,
    parentRuntime,
    executionEvidence,
    executionErrors,
  }, executionAuthority);
}

export async function compileResolvedAuthenticatedV2SourcesWithPinnedJvm(input: {
  resolved: ResolvedAuthenticatedV2ContractSources;
  bridgeRoot: string;
  worktreeRoot: string;
  ergoSourcePath: string;
}): Promise<PinnedAuthenticatedV2CompilerRun> {
  const bridgeRoot = realpathSync(input.bridgeRoot);
  const lockPaths = loadAuthenticatedV2CompilerLock(bridgeRoot);
  const parentRuntime = validatePinnedParentRuntime(lockPaths);
  const sourceBaseline = inspectConsensusSourceBaseline({
    bridgeRoot,
    worktreeRoot: realpathSync(input.worktreeRoot),
    ergoSourcePath: realpathSync(input.ergoSourcePath),
    requireFrontierCheckout: false,
    requireErgoCheckout: true,
    gitExecutablePath: parentRuntime.gitExecutablePath,
  });
  if (sourceBaseline.status !== 'PASS' || !sourceBaseline.checks.ergoCheckoutValidated) {
    throw new Error(`pinned Ergo source checkout is not valid: ${sourceBaseline.errors.join('; ')}`);
  }
  if (sourceBaseline.sourceIdentity.ergoBaseCommit !== lockPaths.lock.ergoNodeBaseCommit) {
    throw new Error('compiler lock Ergo base commit does not match the consensus source lock');
  }
  const execution = await executePinnedCompiler(lockPaths, input.resolved);
  const observation = execution.observation;
  const identityErrors: string[] = [];
  validateObservedCompilerIdentity(lockPaths.lock, observation.metadata, identityErrors);
  if (identityErrors.length > 0) throw new Error(identityErrors.join('; '));
  return deepFreeze({ lock: lockPaths.lock, sourceBaseline, observation, parentRuntime });
}

export async function runAuthenticatedV2JvmVmConformance(input: {
  bridgeRoot: string;
  worktreeRoot: string;
  ergoSourcePath: string;
  trackerNftId: string;
  duplicatePreventionNftId: string;
  fixtureJson: string;
}): Promise<AuthenticatedV2JvmVmConformanceReport> {
  const fixtureBytes = Buffer.from(input.fixtureJson, 'utf8');
  if (fixtureBytes.length === 0 || fixtureBytes.length > 16 * 1024 * 1024) {
    throw new Error('JVM VM fixture must contain between 1 byte and 16 MiB of UTF-8 JSON');
  }
  if (fixtureBytes.includes(0)) throw new Error('JVM VM fixture must not contain NUL bytes');

  const fixture = parseJvmVmFixtureBinding(input.fixtureJson, fixtureBytes);
  const trackerNftId = fixedHex(input.trackerNftId, 'tracker NFT ID');
  const duplicatePreventionNftId = fixedHex(
    input.duplicatePreventionNftId,
    'duplicate-prevention NFT ID',
  );
  const { compilePinnedAuthenticatedV2VmTrees } = await import(
    './authenticated-v2-offline-vm-fixture.js'
  );
  const canonicalCompilation = await compilePinnedAuthenticatedV2VmTrees({
    bridgeRoot: input.bridgeRoot,
    worktreeRoot: input.worktreeRoot,
    ergoSourcePath: input.ergoSourcePath,
    trackerNftId,
    duplicatePreventionNftId,
  });
  assertJvmVmCanonicalContractTrees(fixture, canonicalCompilation.trees);
  const bridgeRoot = realpathSync(input.bridgeRoot);
  const lockPaths = loadAuthenticatedV2CompilerLock(bridgeRoot);
  validatePinnedParentRuntime(lockPaths);
  const execution = await executePinnedTool(
    lockPaths,
    input.fixtureJson,
    (inputPath, outputPath) => ['--verify-vm', inputPath, '--output', outputPath],
  );
  const report = parseAuthenticatedV2JvmVmOutput(execution.output);
  if (report.fixtureSha256Hex !== fixture.fixtureSha256Hex) {
    throw new Error('JVM VM report fixture SHA-256 does not match the exact fixture bytes');
  }
  if (report.contextSha256Hex !== fixture.contextSha256Hex) {
    throw new Error('JVM VM report context SHA-256 does not match the fixture context');
  }
  if (
    report.mode !== fixture.mode
    || report.preHeaderParentIdHex !== fixture.preHeaderParentIdHex
    || report.preHeaderHeight !== fixture.preHeaderHeight
    || report.headerIdsSha256Hex !== fixture.headerIdsSha256Hex
  ) {
    throw new Error('JVM VM report context identity does not match the fixture');
  }
  assertJvmVmReportBindings(report, fixture.inputBindings, fixture.dataInputBindings);
  const canonicalBindingWithoutDigest = {
    fixtureSha256Hex: report.fixtureSha256Hex,
    contextSha256Hex: report.contextSha256Hex,
    trackerNftId,
    duplicatePreventionNftId,
    compilerIdentityDigestHex: fixedHex(
      canonicalCompilation.compilerIdentityDigestHex,
      'canonical compiler identity digest',
    ),
    sourceBaselineDigestHex: fixedHex(
      canonicalCompilation.sourceBaselineDigestHex,
      'canonical source baseline digest',
    ),
    treeSha256: {
      tracker: fixedHex(
        canonicalCompilation.treeSha256.tracker,
        'canonical tracker ErgoTree SHA-256',
      ),
      unlock: fixedHex(
        canonicalCompilation.treeSha256.unlock,
        'canonical unlock ErgoTree SHA-256',
      ),
      duplicatePrevention: fixedHex(
        canonicalCompilation.treeSha256.duplicatePrevention,
        'canonical duplicate-prevention ErgoTree SHA-256',
      ),
    },
    compilerPasses: canonicalCompilation.compilerPasses,
    fixedPointVerified: canonicalCompilation.fixedPointVerified,
  };
  if (
    canonicalBindingWithoutDigest.compilerPasses !== 3
    || canonicalBindingWithoutDigest.fixedPointVerified !== true
  ) {
    throw new Error('canonical JVM contract compilation did not retain the reviewed fixed point');
  }
  return deepFreeze({
    ...report,
    canonicalCompilation: {
      ...canonicalBindingWithoutDigest,
      bindingDigestHex: sha256Canonical(canonicalBindingWithoutDigest),
    },
  });
}

export function validateAuthenticatedSpvTrackerJvmAvlFixture(
  value: unknown,
): AuthenticatedSpvTrackerJvmAvlFixture {
  const fixture = requireRecord(value, 'JVM AVL fixture');
  assertExactKeys(fixture, ['schema', 'cases', 'boundaries'], 'JVM AVL fixture');
  if (fixture.schema !== AUTHENTICATED_SPV_TRACKER_JVM_AVL_FIXTURE_SCHEMA) {
    throw new Error('JVM AVL fixture schema is unsupported');
  }
  if (!Array.isArray(fixture.cases) || fixture.cases.length < 1 || fixture.cases.length > 64) {
    throw new Error('JVM AVL fixture must contain between 1 and 64 cases');
  }
  const seenCaseIds = new Set<string>();
  const cases = fixture.cases.map((entry, index) => {
    const record = requireRecord(entry, `JVM AVL fixture case ${index}`);
    assertExactKeys(
      record,
      ['caseId', 'currentDigestHex', 'keyHex', 'valueHex', 'proofHex'],
      `JVM AVL fixture case ${index}`,
    );
    if (typeof record.caseId !== 'string' || !/^[a-z][a-z0-9-]{2,63}$/.test(record.caseId)) {
      throw new Error(`JVM AVL fixture case ${index} ID is not canonical`);
    }
    if (seenCaseIds.has(record.caseId)) {
      throw new Error(`JVM AVL fixture case ID ${record.caseId} is duplicated`);
    }
    seenCaseIds.add(record.caseId);
    const currentDigestHex = fixedByteHex(
      record.currentDigestHex,
      33,
      `JVM AVL fixture case ${record.caseId} current digest`,
    );
    const keyHex = fixedByteHex(
      record.keyHex,
      32,
      `JVM AVL fixture case ${record.caseId} key`,
    );
    const valueHex = fixedByteHex(
      record.valueHex,
      264,
      `JVM AVL fixture case ${record.caseId} value`,
    );
    if (
      typeof record.proofHex !== 'string'
      || !HEX_BYTES.test(record.proofHex)
      || record.proofHex.length > 2 * 1024 * 1024
    ) {
      throw new Error(`JVM AVL fixture case ${record.caseId} proof must be 1 to 1048576 bytes of lowercase hex`);
    }
    return {
      caseId: record.caseId,
      currentDigestHex,
      keyHex,
      valueHex,
      proofHex: record.proofHex,
    };
  });
  const boundaries = requireRecord(fixture.boundaries, 'JVM AVL fixture boundaries');
  assertExactKeys(boundaries, [
    'nodeStatefulAcceptance',
    'signingPerformed',
    'submissionPerformed',
    'broadcastPerformed',
    'gate5Closed',
  ], 'JVM AVL fixture boundaries');
  if (boundaries.nodeStatefulAcceptance !== false) {
    throw new Error('JVM AVL fixture cannot claim node acceptance');
  }
  if (boundaries.signingPerformed !== false) throw new Error('JVM AVL fixture cannot claim signing');
  if (boundaries.submissionPerformed !== false) throw new Error('JVM AVL fixture cannot claim submission');
  if (boundaries.broadcastPerformed !== false) throw new Error('JVM AVL fixture cannot claim broadcast');
  if (boundaries.gate5Closed !== false) throw new Error('JVM AVL fixture cannot claim Gate 5 closure');
  return deepFreeze({
    schema: AUTHENTICATED_SPV_TRACKER_JVM_AVL_FIXTURE_SCHEMA,
    cases,
    boundaries: {
      nodeStatefulAcceptance: false,
      signingPerformed: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      gate5Closed: false,
    },
  });
}

export function encodeAuthenticatedSpvTrackerJvmAvlFixture(value: unknown): string {
  const encoded = `${canonicalJson(validateAuthenticatedSpvTrackerJvmAvlFixture(value))}\n`;
  const bytes = Buffer.from(encoded, 'utf8');
  if (bytes.length > 4 * 1024 * 1024) throw new Error('JVM AVL fixture exceeds 4 MiB');
  if (bytes.includes(0)) throw new Error('JVM AVL fixture must not contain NUL bytes');
  return encoded;
}

export async function runAuthenticatedSpvTrackerJvmAvlConformance(input: {
  bridgeRoot: string;
  fixture: unknown;
}): Promise<AuthenticatedSpvTrackerJvmAvlReport> {
  const fixture = validateAuthenticatedSpvTrackerJvmAvlFixture(input.fixture);
  const fixtureJson = encodeAuthenticatedSpvTrackerJvmAvlFixture(fixture);
  const bridgeRoot = realpathSync(input.bridgeRoot);
  const lockPaths = loadAuthenticatedV2CompilerLock(bridgeRoot);
  validatePinnedParentRuntime(lockPaths);
  const runtimeBundle = resolvePinnedRuntimeBundle(lockPaths);
  const runtimeClasspath = validateAndListRuntimeClasspath(runtimeBundle, lockPaths.lock);
  const verifierIndex = lockPaths.lock.runtimeClasspathEntries.findIndex(entry => (
    entry.endsWith('scrypto_2.12-3.0.0.jar')
  ));
  if (verifierIndex < 0) throw new Error('pinned JVM AVL verifier artifact is missing');
  const expectedVerifierArtifactSha256Hex = sha256Bytes(readFileSync(runtimeClasspath[verifierIndex]));
  const execution = await executePinnedTool(
    lockPaths,
    fixtureJson,
    (inputPath, outputPath) => ['--verify-avl-insert', inputPath, '--output', outputPath],
  );
  const report = parseAuthenticatedSpvTrackerJvmAvlOutput(execution.output);
  if (report.fixtureSha256Hex !== sha256Bytes(Buffer.from(fixtureJson, 'utf8'))) {
    throw new Error('JVM AVL report fixture SHA-256 does not match the exact fixture bytes');
  }
  if (report.verifierArtifactSha256Hex !== expectedVerifierArtifactSha256Hex) {
    throw new Error('JVM AVL report verifier artifact does not match the pinned runtime');
  }
  if (report.runtimeClasspathSha256Hex !== lockPaths.lock.runtimeClasspathSha256) {
    throw new Error('JVM AVL report runtime classpath does not match the pinned runtime');
  }
  if (
    report.cases.length !== fixture.cases.length
    || report.cases.some((entry, index) => entry.caseId !== fixture.cases[index].caseId)
  ) {
    throw new Error('JVM AVL report case order does not match the fixture');
  }
  return deepFreeze(report);
}

function assertJvmVmCanonicalContractTrees(
  fixture: JvmVmFixtureBinding,
  expectedTreesInput: Record<'tracker' | 'unlock' | 'duplicatePrevention', string>,
): void {
  const expectedTreeHashes = {
    tracker: sha256Bytes(Buffer.from(variableHex(
      expectedTreesInput.tracker,
      'canonical tracker ErgoTree',
    ), 'hex')),
    unlock: sha256Bytes(Buffer.from(variableHex(
      expectedTreesInput.unlock,
      'canonical unlock ErgoTree',
    ), 'hex')),
    duplicatePrevention: sha256Bytes(Buffer.from(variableHex(
      expectedTreesInput.duplicatePrevention,
      'canonical duplicate-prevention ErgoTree',
    ), 'hex')),
  };
  for (const [kind, entries] of [
    ['input', fixture.inputBindings],
    ['data-input', fixture.dataInputBindings],
  ] as const) {
    entries.forEach((entry, index) => {
      if (entry.ergoTreeSha256Hex !== expectedTreeHashes[entry.role]) {
        throw new Error(
          `JVM VM fixture ${kind} ${index} ${entry.role} tree does not match the pinned canonical compilation`,
        );
      }
    });
  }
}

export function loadAuthenticatedV2CompilerLock(bridgeRootInput: string): CompilerLockPaths {
  const bridgeRoot = realpathSync(bridgeRootInput);
  const relayerRoot = realpathSync(resolve(bridgeRoot, 'relayer'));
  const lockPath = resolve(bridgeRoot, 'sources', 'authenticated-v2-compiler-lock.json');
  const raw = JSON.parse(readFileSync(lockPath, 'utf8')) as unknown;
  const lock = validateAuthenticatedV2CompilerLock(raw);
  const buildPath = resolveLockedFile(bridgeRoot, lock.buildPath, lock.buildSha256, 'compiler build');
  const sbtPropertiesPath = resolveLockedFile(
    bridgeRoot,
    lock.sbtPropertiesPath,
    lock.sbtPropertiesSha256,
    'compiler sbt properties',
  );
  const toolPath = resolveLockedFile(bridgeRoot, lock.toolPath, lock.toolSha256, 'compiler source');
  const toolRoot = realpathSync(dirname(buildPath));
  if (realpathSync(resolve(toolRoot, 'project', 'build.properties')) !== sbtPropertiesPath) {
    throw new Error('compiler sbt properties must belong to the locked compiler project');
  }
  if (!isInsidePath(toolPath, toolRoot)) {
    throw new Error('compiler source must belong to the locked compiler project');
  }
  const runtimeBundlePath = resolve(bridgeRoot, lock.runtimeBundlePath);
  if (!isInsidePath(runtimeBundlePath, bridgeRoot)) {
    throw new Error('compiler runtime bundle path escapes the bridge repository');
  }
  validateAuthenticatedV2CompilerProjectFileSet(
    listCompilerProjectFiles(toolRoot),
    [buildPath, sbtPropertiesPath, toolPath]
      .map(path => relative(toolRoot, path).replace(/\\/g, '/')),
  );
  validateCompilerConsensusBinding(bridgeRoot, lock);
  return {
    lock,
    buildPath,
    sbtPropertiesPath,
    toolPath,
    toolRoot,
    runtimeBundlePath,
    bridgeRoot,
    relayerRoot,
  };
}

export function resolveAuthenticatedV2CompilerRuntimeBuildInputs(
  bridgeRootInput: string,
): AuthenticatedV2CompilerRuntimeBuildInputs {
  const paths = loadAuthenticatedV2CompilerLock(bridgeRootInput);
  validatePinnedParentRuntime(paths);
  return resolveAuthenticatedV2CompilerRuntimeProjectInputsFromPaths(paths);
}

export function resolveAuthenticatedV2CompilerRuntimeProjectInputs(
  bridgeRootInput: string,
): AuthenticatedV2CompilerRuntimeBuildInputs {
  return resolveAuthenticatedV2CompilerRuntimeProjectInputsFromPaths(
    loadAuthenticatedV2CompilerLock(bridgeRootInput),
  );
}

function resolveAuthenticatedV2CompilerRuntimeProjectInputsFromPaths(
  paths: CompilerLockPaths,
): AuthenticatedV2CompilerRuntimeBuildInputs {
  return {
    toolRoot: paths.toolRoot,
    runtimeBundlePath: paths.runtimeBundlePath,
    runtimeBundleSha256: paths.lock.runtimeBundleSha256,
    javaHome: resolvePinnedJavaHome(process.env, paths.lock),
  };
}

export function validateAuthenticatedV2CompilerRuntimeBundle(
  bridgeRootInput: string,
): Pick<AuthenticatedV2CompilerRuntimeBuildInputs, 'runtimeBundlePath' | 'runtimeBundleSha256'> {
  const paths = loadAuthenticatedV2CompilerLock(bridgeRootInput);
  const runtimeBundlePath = resolvePinnedRuntimeBundle(paths);
  return {
    runtimeBundlePath,
    runtimeBundleSha256: paths.lock.runtimeBundleSha256,
  };
}

export function validateAuthenticatedV2CompilerProjectFileSet(
  actualInput: string[],
  expectedInput: string[],
): void {
  const actual = [...actualInput].sort();
  const expected = [...expectedInput].sort();
  if (
    actual.length !== expected.length
    || actual.some((path, index) => path !== expected[index])
  ) {
    const actualSet = new Set(actual);
    const expectedSet = new Set(expected);
    const unexpected = actual.filter(path => !expectedSet.has(path));
    const missing = expected.filter(path => !actualSet.has(path));
    throw new Error(
      'compiler project contains files outside the reviewed lock set '
      + `(unexpected: ${unexpected.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'})`,
    );
  }
}

function validatePinnedParentRuntime(paths: CompilerLockPaths): VerifiedParentRuntime {
  const lock = paths.lock;
  if (`${process.platform}-${process.arch}` !== lock.platform) {
    throw new Error('parent runtime platform does not match the compiler lock');
  }
  assertNoParentRuntimeOverrides(process.env, lock.forbiddenParentEnvironmentOverrides);
  const nodeExecutable = realpathSync(process.execPath);
  if (process.version !== `v${lock.nodeVersion}`) {
    throw new Error('parent Node version does not match the compiler lock');
  }
  const nodeExecutableSha256 = sha256Bytes(readFileSync(nodeExecutable));
  if (nodeExecutableSha256 !== lock.nodeExecutableSha256) {
    throw new Error('parent Node executable does not match the compiler lock');
  }

  const tsxRoot = resolve(paths.relayerRoot, 'node_modules', 'tsx');
  const expectedExecArgv = [
    '--require',
    resolve(tsxRoot, 'dist', 'preflight.cjs'),
    '--import',
    pathToFileURL(resolve(tsxRoot, 'dist', 'loader.mjs')).href,
  ];
  if (
    process.execArgv.length !== expectedExecArgv.length
    || process.execArgv.some((value, index) => value !== expectedExecArgv[index])
  ) {
    throw new Error('parent tsx loader invocation does not match the reviewed command shape');
  }

  const packageLockPath = resolve(paths.relayerRoot, 'package-lock.json');
  if (sha256Bytes(readFileSync(packageLockPath)) !== lock.relayerPackageLockSha256) {
    throw new Error('relayer package lock does not match the compiler lock');
  }
  for (const entry of lock.parentRuntimePackages) {
    const packagePath = resolve(paths.bridgeRoot, entry.path);
    if (
      !isInsidePath(packagePath, resolve(paths.relayerRoot, 'node_modules'))
      || !existsSync(packagePath)
      || !statSync(packagePath).isDirectory()
      || hashDirectoryFiles(packagePath) !== entry.sha256
    ) {
      throw new Error('parent TypeScript runtime package does not match the compiler lock');
    }
  }

  const gitExecutablePath = resolvePinnedGitExecutable(lock);
  return deepFreeze({
    nodeVersion: lock.nodeVersion,
    nodeExecutableSha256,
    gitVersion: lock.gitVersion,
    gitExecutableSha256: lock.gitExecutableSha256,
    gitExecutablePath,
    relayerPackageLockSha256: lock.relayerPackageLockSha256,
    parentRuntimePackagesValidated: true as const,
    loaderInvocationValidated: true as const,
    gitEnvironmentSanitized: true as const,
  });
}

export function assertNoParentRuntimeOverrides(
  env: NodeJS.ProcessEnv,
  forbidden: readonly string[],
): void {
  const present = forbidden.filter(key => typeof env[key] === 'string' && env[key]!.length > 0);
  if (present.length > 0) throw new Error('parent runtime override variables must be absent');
}

function resolvePinnedGitExecutable(lock: AuthenticatedV2CompilerLock): string {
  const pathValue = process.env.PATH ?? process.env.Path;
  if (!pathValue) throw new Error('PATH is unavailable for pinned Git discovery');
  const executableName = process.platform === 'win32' ? 'git.exe' : 'git';
  const inspected = new Set<string>();
  for (const entry of pathValue.split(delimiter).filter(Boolean)) {
    const candidate = resolve(entry, executableName);
    if (inspected.has(candidate) || !existsSync(candidate) || !statSync(candidate).isFile()) continue;
    inspected.add(candidate);
    const executable = realpathSync(candidate);
    if (sha256Bytes(readFileSync(executable)) !== lock.gitExecutableSha256) continue;
    const version = execFileSync(executable, ['--version'], {
      encoding: 'utf8',
      windowsHide: true,
      env: {
        PATH: dirname(executable),
        SystemRoot: process.env.SystemRoot,
        SYSTEMROOT: process.env.SYSTEMROOT,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (version === `git version ${lock.gitVersion}`) return executable;
  }
  throw new Error('no Git executable matches the reviewed version and SHA-256');
}

function validateCompilerConsensusBinding(
  bridgeRoot: string,
  lock: AuthenticatedV2CompilerLock,
): void {
  const sourceLockPath = resolve(
    bridgeRoot,
    'sources',
    'authenticated-v2-compiler-consensus-source-lock-v1.json',
  );
  if (!existsSync(sourceLockPath) || !statSync(sourceLockPath).isFile()) {
    throw new Error('historical compiler consensus source lock is missing');
  }
  if (sha256Bytes(readFileSync(sourceLockPath)) !== lock.consensusSourceLockSha256) {
    throw new Error('historical compiler consensus source lock does not match the compiler lock');
  }
  const sourceLock = requireRecord(
    JSON.parse(readFileSync(sourceLockPath, 'utf8')),
    'historical compiler consensus source lock',
  );
  const ergoNode = requireRecord(
    sourceLock.ergoNode,
    'historical compiler consensus source lock ergoNode',
  );
  if (ergoNode.baseCommit !== lock.ergoNodeBaseCommit) {
    throw new Error('consensus source lock Ergo base commit does not match the compiler lock');
  }
  if (ergoNode.baseTag !== lock.ergoNodeBaseTag) {
    throw new Error('consensus source lock Ergo base tag does not match the compiler lock');
  }
  if (ergoNode.patchSha256 !== lock.ergoPatchSha256) {
    throw new Error('consensus source lock Ergo patch does not match the compiler lock');
  }
  if (!Array.isArray(ergoNode.files)) {
    throw new Error('consensus source lock Ergo patched files are missing');
  }
  const patchedBlobIds = ergoNode.files
    .map(file => requireRecord(file, 'consensus source lock Ergo patched file').patchedBlob)
    .sort();
  if (
    patchedBlobIds.length !== lock.ergoPatchedBlobIds.length
    || patchedBlobIds.some((value, index) => value !== [...lock.ergoPatchedBlobIds].sort()[index])
  ) {
    throw new Error('consensus source lock Ergo patched blobs do not match the compiler lock');
  }
}

export function validateAuthenticatedV2CompilerLock(value: unknown): AuthenticatedV2CompilerLock {
  const lock = requireRecord(value, 'compiler lock');
  assertExactKeys(lock, [
    'schemaVersion',
    'kind',
    'platform',
    'nodeVersion',
    'nodeExecutableSha256',
    'gitVersion',
    'gitExecutableSha256',
    'gitDistributionUrl',
    'gitDistributionSha256',
    'relayerPackageLockSha256',
    'parentRuntimePackages',
    'forbiddenParentEnvironmentOverrides',
    'trustedHostModel',
    'ergoNodeBaseCommit',
    'ergoNodeBaseTag',
    'consensusSourceLockSha256',
    'ergoPatchSha256',
    'ergoPatchedBlobIds',
    'sigmaStateVersion',
    'sigmaStateArtifactSha256',
    'runtimeBundlePath',
    'runtimeBundleSha256',
    'runtimeClasspathEntries',
    'runtimeClasspathSha256',
    'scalaVersion',
    'sbtVersion',
    'javaMajorVersion',
    'javaDistribution',
    'javaHomeSha256',
    'networkPrefix',
    'scriptVersion',
    'treeVersion',
    'buildPath',
    'buildSha256',
    'sbtPropertiesPath',
    'sbtPropertiesSha256',
    'toolPath',
    'toolSha256',
    'compiledToolClassesSha256',
    'mainClass',
    'forbiddenEnvironmentOverrides',
  ], 'compiler lock');
  if (lock.schemaVersion !== COMPILER_LOCK_SCHEMA_VERSION) throw new Error('unsupported compiler lock schema');
  if (lock.kind !== COMPILER_LOCK_KIND) throw new Error('unsupported compiler lock kind');
  if (lock.platform !== 'win32-x64') throw new Error('compiler lock must use the reviewed Windows x64 host profile');
  if (lock.nodeVersion !== '24.14.0') throw new Error('compiler lock must use Node 24.14.0');
  if (lock.gitVersion !== '2.54.0.windows.1') throw new Error('compiler lock must use Git 2.54.0.windows.1');
  if (
    lock.gitDistributionUrl
      !== 'https://github.com/git-for-windows/git/releases/download/v2.54.0.windows.1/MinGit-2.54.0-64-bit.zip'
  ) {
    throw new Error('compiler lock must use the reviewed official MinGit distribution');
  }
  if (lock.trustedHostModel !== 'exclusive-same-user-process') {
    throw new Error('compiler lock must declare the reviewed trusted-host model');
  }
  if (lock.ergoNodeBaseCommit !== ERGO_NODE_BASE_COMMIT) throw new Error('compiler lock uses an unsupported Ergo base commit');
  if (lock.ergoNodeBaseTag !== 'v6.0.2') throw new Error('compiler lock must use Ergo v6.0.2');
  if (lock.sigmaStateVersion !== '6.0.2') throw new Error('compiler lock must use sigma-state 6.0.2');
  if (lock.scalaVersion !== '2.12.20') throw new Error('compiler lock must use Scala 2.12.20');
  if (lock.sbtVersion !== '1.11.1') throw new Error('compiler lock must use sbt 1.11.1');
  if (lock.javaMajorVersion !== 17) throw new Error('compiler lock must use Java 17');
  if (lock.javaDistribution !== 'Microsoft OpenJDK 17.0.19+10-LTS') {
    throw new Error('compiler lock must use the reviewed Microsoft OpenJDK distribution');
  }
  if (lock.networkPrefix !== 16 || lock.scriptVersion !== 3 || lock.treeVersion !== 0) {
    throw new Error('compiler lock uses unsupported Sigma compilation parameters');
  }
  for (const field of [
    'sigmaStateArtifactSha256',
    'nodeExecutableSha256',
    'gitExecutableSha256',
    'gitDistributionSha256',
    'relayerPackageLockSha256',
    'runtimeBundleSha256',
    'runtimeClasspathSha256',
    'consensusSourceLockSha256',
    'ergoPatchSha256',
    'javaHomeSha256',
    'buildSha256',
    'sbtPropertiesSha256',
    'toolSha256',
    'compiledToolClassesSha256',
  ] as const) {
    if (typeof lock[field] !== 'string' || !HEX_32.test(lock[field])) {
      throw new Error(`compiler lock ${field} must be lowercase SHA-256 hex`);
    }
  }
  if (
    !Array.isArray(lock.ergoPatchedBlobIds)
    || lock.ergoPatchedBlobIds.length !== 2
    || lock.ergoPatchedBlobIds.some(value => typeof value !== 'string' || !HEX_20.test(value))
    || new Set(lock.ergoPatchedBlobIds).size !== 2
  ) {
    throw new Error('compiler lock ergoPatchedBlobIds must contain two unique lowercase Git blob IDs');
  }
  for (const field of ['runtimeBundlePath', 'buildPath', 'sbtPropertiesPath', 'toolPath'] as const) {
    if (typeof lock[field] !== 'string' || !isSafeRelativePath(lock[field])) {
      throw new Error(`compiler lock ${field} must be a safe repository-relative path`);
    }
  }
  if (lock.mainClass !== 'org.ergoplatform.bridge.tools.ExactAuthenticatedV2Compiler') {
    throw new Error('compiler lock main class is unsupported');
  }
  if (
    !Array.isArray(lock.runtimeClasspathEntries)
    || lock.runtimeClasspathEntries.length < 3
    || lock.runtimeClasspathEntries.some((entry, index) => (
      typeof entry !== 'string'
      || !new RegExp(`^${String(index).padStart(3, '0')}-[A-Za-z0-9._-]+$`).test(entry)
    ))
    || new Set(lock.runtimeClasspathEntries).size !== lock.runtimeClasspathEntries.length
    || lock.runtimeClasspathEntries[0] !== '000-classes'
    || lock.runtimeClasspathEntries.filter(entry => entry.endsWith('sigma-state_2.12-6.0.2.jar')).length !== 1
  ) {
    throw new Error('compiler lock runtime classpath entries must be canonical, ordered, and complete');
  }
  const parentRuntimePackagePaths = [
    'relayer/node_modules/tsx',
    'relayer/node_modules/esbuild',
    'relayer/node_modules/@esbuild/win32-x64',
    'relayer/node_modules/get-tsconfig',
    'relayer/node_modules/resolve-pkg-maps',
  ];
  if (
    !Array.isArray(lock.parentRuntimePackages)
    || lock.parentRuntimePackages.length !== parentRuntimePackagePaths.length
    || lock.parentRuntimePackages.some((entry, index) => {
      const record = requireRecord(entry, `compiler lock parent runtime package ${index}`);
      return (
        record.path !== parentRuntimePackagePaths[index]
        || typeof record.sha256 !== 'string'
        || !HEX_32.test(record.sha256)
      );
    })
  ) {
    throw new Error('compiler lock parent runtime packages must be canonical and hash-pinned');
  }
  const forbiddenParentEnvironmentOverrides = [
    'NODE_COMPILE_CACHE',
    'NODE_EXTRA_CA_CERTS',
    'NODE_OPTIONS',
    'NODE_PATH',
    'TSX_TSCONFIG_PATH',
  ];
  if (
    !Array.isArray(lock.forbiddenParentEnvironmentOverrides)
    || lock.forbiddenParentEnvironmentOverrides.length !== forbiddenParentEnvironmentOverrides.length
    || lock.forbiddenParentEnvironmentOverrides.some((value, index) => (
      value !== forbiddenParentEnvironmentOverrides[index]
    ))
  ) {
    throw new Error('compiler lock must exclude all parent Node and tsx override variables');
  }
  const forbiddenEnvironmentOverrides = [
    'CLASSPATH',
    'JAVA_OPTS',
    'JAVA_TOOL_OPTIONS',
    'JDK_JAVA_OPTIONS',
    'SBT_OPTS',
    'SIGMASTATE_VERSION',
    '_JAVA_OPTIONS',
  ];
  if (
    !Array.isArray(lock.forbiddenEnvironmentOverrides)
    || lock.forbiddenEnvironmentOverrides.length !== forbiddenEnvironmentOverrides.length
    || lock.forbiddenEnvironmentOverrides.some((value, index) => value !== forbiddenEnvironmentOverrides[index])
  ) {
    throw new Error('compiler lock must exclude all JVM and build override variables');
  }
  return lock as unknown as AuthenticatedV2CompilerLock;
}

export function encodeAuthenticatedV2CompilerInput(
  resolved: ResolvedAuthenticatedV2ContractSources,
): string {
  return `${CONTRACT_ROLES.map(role => {
    const source = Buffer.from(resolved[role].source, 'utf8');
    if (source.toString('utf8') !== resolved[role].source) {
      throw new Error(`${role} source is not canonical UTF-8`);
    }
    return `${role}\t${source.toString('base64')}`;
  }).join('\n')}\n`;
}

export function parseAuthenticatedV2CompilerOutput(
  source: string,
): AuthenticatedV2CompilerObservation {
  const lines = source.split(/\r?\n/).filter(Boolean);
  if (lines.length !== 4) throw new Error('compiler output must contain one metadata and three contract records');
  const metadataFields = lines[0].split('\t');
  if (metadataFields.length !== 10 || metadataFields[0] !== 'BRIDGE_COMPILER_META') {
    throw new Error('compiler metadata record is malformed');
  }
  const roles = metadataFields[9].split(',');
  if (roles.join(',') !== CONTRACT_ROLES.join(',')) {
    throw new Error('compiler metadata roles are not canonical');
  }
  const metadata: AuthenticatedV2CompilerMetadata = {
    networkPrefix: strictInteger(metadataFields[1], 'compiler network prefix'),
    scriptVersion: strictInteger(metadataFields[2], 'compiler script version'),
    treeVersion: strictInteger(metadataFields[3], 'compiler tree version'),
    scalaVersion: metadataFields[4],
    javaMajorVersion: metadataFields[5],
    sigmaStateArtifactSha256: fixedHex(metadataFields[6], 'sigma-state artifact SHA-256'),
    runtimeClasspathSha256: fixedHex(metadataFields[7], 'runtime classpath SHA-256'),
    javaHomeSha256: fixedHex(metadataFields[8], 'Java home SHA-256'),
    roles: [...CONTRACT_ROLES],
  };
  const contracts = {} as Record<ContractRole, AuthenticatedV2CompiledContractObservation>;
  for (let index = 0; index < CONTRACT_ROLES.length; index += 1) {
    const fields = lines[index + 1].split('\t');
    const expectedRole = CONTRACT_ROLES[index];
    if (fields.length !== 5 || fields[0] !== 'BRIDGE_CONTRACT' || fields[1] !== expectedRole) {
      throw new Error(`compiler ${expectedRole} record is malformed or out of order`);
    }
    const ergoTreeHex = variableHex(fields[3], `${expectedRole} compiled ErgoTree`);
    const treeHash = fixedHex(fields[4], `${expectedRole} compiled ErgoTree SHA-256`);
    if (sha256Bytes(Buffer.from(ergoTreeHex, 'hex')) !== treeHash) {
      throw new Error(`compiler ${expectedRole} ErgoTree hash is inconsistent`);
    }
    contracts[expectedRole] = {
      role: expectedRole,
      resolvedSourceSha256Hex: fixedHex(
        fields[2],
        `${expectedRole} compiled source SHA-256`,
      ),
      ergoTreeHex,
      ergoTreeSha256Hex: treeHash,
    };
  }
  return { metadata, contracts };
}

export function parseAuthenticatedV2JvmVmOutput(
  source: string,
): AuthenticatedV2JvmVmRawConformanceReport {
  const lines = source.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    throw new Error('JVM VM output must contain one metadata record and at least one input record');
  }
  const metadata = lines[0].split('\t');
  if (metadata.length !== 15 || metadata[0] !== 'BRIDGE_VM_META' || metadata[1] !== '2') {
    throw new Error('JVM VM metadata record is malformed');
  }
  const mode = metadata[2];
  if (mode !== 'tracker' && mode !== 'settlement') throw new Error('JVM VM mode is unsupported');
  const inputCount = strictInteger(metadata[11], 'JVM VM input count');
  const dataInputCount = strictInteger(metadata[12], 'JVM VM data-input count');
  const headerCount = strictInteger(metadata[13], 'JVM VM header count');
  if (inputCount < 1 || lines.length !== inputCount + dataInputCount + 1) {
    throw new Error('JVM VM input and data-input result counts do not match metadata');
  }
  if (headerCount !== 10) throw new Error('JVM VM header count must be exactly 10');
  if (metadata[14] !== 'roundtrip-ok') throw new Error('JVM VM serialization round trip did not pass');

  const inputs = lines.slice(1, inputCount + 1).map((line, expectedIndex) => {
    const fields = line.split('\t');
    if (
      fields.length !== 7
      || fields[0] !== 'BRIDGE_VM_INPUT'
      || strictInteger(fields[1], 'JVM VM input index') !== expectedIndex
      || fields[4] !== 'true'
    ) {
      throw new Error(`JVM VM input ${expectedIndex} result is malformed or rejected`);
    }
    const cost = strictInteger(fields[5], `JVM VM input ${expectedIndex} cost`);
    const proofBytes = strictInteger(fields[6], `JVM VM input ${expectedIndex} proof bytes`);
    if (cost < 0 || proofBytes < 0) {
      throw new Error(`JVM VM input ${expectedIndex} metrics must be non-negative`);
    }
    return {
      inputIndex: expectedIndex,
      role: jvmVmRole(fields[2], `JVM VM input ${expectedIndex} role`),
      ergoTreeSha256Hex: fixedHex(fields[3], `JVM VM input ${expectedIndex} ErgoTree SHA-256`),
      accepted: true as const,
      cost,
      proofBytes,
    };
  });

  const dataInputs = lines.slice(inputCount + 1).map((line, expectedIndex) => {
    const fields = line.split('\t');
    if (
      fields.length !== 4
      || fields[0] !== 'BRIDGE_VM_DATA'
      || strictInteger(fields[1], 'JVM VM data-input index') !== expectedIndex
    ) {
      throw new Error(`JVM VM data-input ${expectedIndex} result is malformed`);
    }
    return {
      dataInputIndex: expectedIndex,
      role: jvmVmRole(fields[2], `JVM VM data-input ${expectedIndex} role`),
      ergoTreeSha256Hex: fixedHex(
        fields[3],
        `JVM VM data-input ${expectedIndex} ErgoTree SHA-256`,
      ),
    };
  });

  assertJvmVmModeRoles(
    mode,
    inputs.map(input => input.role),
    dataInputs.map(input => input.role),
  );

  const transactionIdHex = fixedHex(metadata[3], 'JVM VM transaction ID');
  const bytesToSignDigestHex = fixedHex(metadata[4], 'JVM VM bytes-to-sign digest');
  if (transactionIdHex !== bytesToSignDigestHex) {
    throw new Error('JVM VM transaction ID does not match the bytes-to-sign digest');
  }

  return {
    schemaVersion: 2,
    mode,
    transactionIdHex,
    bytesToSignDigestHex,
    signedTransactionSha256Hex: fixedHex(metadata[5], 'JVM VM signed transaction SHA-256'),
    fixtureSha256Hex: fixedHex(metadata[6], 'JVM VM fixture SHA-256'),
    contextSha256Hex: fixedHex(metadata[7], 'JVM VM context SHA-256'),
    preHeaderParentIdHex: fixedHex(metadata[8], 'JVM VM preheader parent ID'),
    preHeaderHeight: strictInteger(metadata[9], 'JVM VM preheader height'),
    headerIdsSha256Hex: fixedHex(metadata[10], 'JVM VM header IDs SHA-256'),
    inputCount,
    dataInputCount,
    headerCount: 10,
    inputs,
    dataInputs,
    serializationRoundTrip: true,
    allInputsAccepted: true,
    nodeStatefulAcceptance: false,
    broadcastPerformed: false,
    gate5Closed: false,
  };
}

export function parseAuthenticatedSpvTrackerJvmAvlOutput(
  source: string,
): AuthenticatedSpvTrackerJvmAvlReport {
  const lines = source.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    throw new Error('JVM AVL output must contain one metadata record and at least one case');
  }
  const metadata = lines[0].split('\t');
  if (
    metadata.length !== 11
    || metadata[0] !== 'BRIDGE_AVL_META'
    || metadata[1] !== '1'
  ) {
    throw new Error('JVM AVL metadata record is malformed');
  }
  if (
    metadata[6] !== 'no-node'
    || metadata[7] !== 'no-sign'
    || metadata[8] !== 'no-submit'
    || metadata[9] !== 'no-broadcast'
    || metadata[10] !== 'gate5-open'
  ) {
    throw new Error('JVM AVL boundary record is malformed');
  }
  const caseCount = strictInteger(metadata[3], 'JVM AVL case count');
  if (caseCount < 1 || caseCount > 64 || lines.length !== caseCount + 1) {
    throw new Error('JVM AVL case count is outside bounds or does not match output');
  }
  const seenCaseIds = new Set<string>();
  const cases = lines.slice(1).map((line, expectedIndex) => {
    const fields = line.split('\t');
    if (
      fields.length !== 6
      || fields[0] !== 'BRIDGE_AVL_CASE'
      || strictInteger(fields[1], 'JVM AVL case index') !== expectedIndex
      || !/^[a-z][a-z0-9-]{2,63}$/.test(fields[2])
      || (fields[3] !== 'true' && fields[3] !== 'false')
    ) {
      throw new Error(`JVM AVL case ${expectedIndex} record is malformed`);
    }
    const caseId = fields[2];
    if (seenCaseIds.has(caseId)) throw new Error(`JVM AVL case ID ${caseId} is duplicated`);
    seenCaseIds.add(caseId);
    const operationAccepted = fields[3] === 'true';
    if (operationAccepted) {
      if (!HEX_33.test(fields[4])) {
        throw new Error(`JVM AVL accepted case ${caseId} must expose a 33-byte successor digest`);
      }
      if (fields[5] !== 'operation-accepted') {
        throw new Error(`JVM AVL case ${caseId} outcome is inconsistent`);
      }
      return {
        caseIndex: expectedIndex,
        caseId,
        operationAccepted: true,
        successorDigestHex: fields[4],
        outcome: 'operation-accepted' as const,
      };
    }
    if (fields[4] !== '-') {
      throw new Error(`JVM AVL rejected case must not expose a successor digest: ${caseId}`);
    }
    const rejectionOutcomes: AuthenticatedSpvTrackerJvmAvlOutcome[] = [
      'verifier-construction-rejected',
      'operation-rejected',
      'digest-read-rejected',
      'digest-missing',
      'digest-invalid',
    ];
    if (!rejectionOutcomes.includes(fields[5] as AuthenticatedSpvTrackerJvmAvlOutcome)) {
      throw new Error(`JVM AVL case ${caseId} outcome is inconsistent`);
    }
    return {
      caseIndex: expectedIndex,
      caseId,
      operationAccepted: false,
      successorDigestHex: null,
      outcome: fields[5] as AuthenticatedSpvTrackerJvmAvlOutcome,
    };
  });
  return {
    schemaVersion: 1,
    fixtureSha256Hex: fixedHex(metadata[2], 'JVM AVL fixture SHA-256'),
    verifierArtifactSha256Hex: fixedHex(
      metadata[4],
      'JVM AVL verifier artifact SHA-256',
    ),
    runtimeClasspathSha256Hex: fixedHex(
      metadata[5],
      'JVM AVL runtime classpath SHA-256',
    ),
    cases,
    nodeStatefulAcceptance: false,
    signingPerformed: false,
    submissionPerformed: false,
    broadcastPerformed: false,
    gate5Closed: false,
  };
}

interface JvmVmExpectedBinding {
  role: 'tracker' | 'unlock' | 'duplicatePrevention';
  ergoTreeSha256Hex: string;
}

interface JvmVmFixtureBinding {
  mode: 'tracker' | 'settlement';
  fixtureSha256Hex: string;
  contextSha256Hex: string;
  preHeaderParentIdHex: string;
  preHeaderHeight: number;
  headerIdsSha256Hex: string;
  inputBindings: JvmVmExpectedBinding[];
  dataInputBindings: JvmVmExpectedBinding[];
}

function parseJvmVmFixtureBinding(source: string, bytes: Buffer): JvmVmFixtureBinding {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`JVM VM fixture is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const fixture = requireRecord(parsed, 'JVM VM fixture');
  if (fixture.schema !== 'e2s.authenticated-v2-jvm-vm-fixture.v2') {
    throw new Error('JVM VM fixture schema is unsupported');
  }
  if (fixture.contextKind !== 'node-simplified-upcoming') {
    throw new Error('JVM VM fixture context kind is unsupported');
  }
  const mode = fixture.mode;
  if (mode !== 'tracker' && mode !== 'settlement') throw new Error('JVM VM fixture mode is unsupported');
  if (typeof fixture.preHeaderJson !== 'string') throw new Error('JVM VM fixture preheader JSON is invalid');
  const preHeader = requireRecord(JSON.parse(fixture.preHeaderJson), 'JVM VM fixture preheader');
  const preHeaderHeight = typeof preHeader.height === 'number'
    ? preHeader.height
    : Number.NaN;
  if (!Number.isSafeInteger(preHeaderHeight) || preHeaderHeight < 0) {
    throw new Error('JVM VM fixture preheader height must be a non-negative safe integer');
  }

  if (!Array.isArray(fixture.headers) || fixture.headers.length !== 10) {
    throw new Error('JVM VM fixture must contain exactly 10 headers');
  }
  const headerIds = fixture.headers.map((entry, index) => fixedHex(
    requireRecord(entry, `JVM VM fixture header ${index}`).expectedIdHex,
    `JVM VM fixture header ${index} expected ID`,
  ));
  const contractBindings = requireRecord(fixture.contractBindings, 'JVM VM fixture contract bindings');
  const inputBindings = parseJvmVmExpectedBindings(contractBindings.inputs, 'input');
  const dataInputBindings = parseJvmVmExpectedBindings(contractBindings.dataInputs, 'data-input');
  assertJvmVmModeRoles(
    mode,
    inputBindings.map(binding => binding.role),
    dataInputBindings.map(binding => binding.role),
  );

  return {
    mode,
    fixtureSha256Hex: sha256Bytes(bytes),
    contextSha256Hex: fixedHex(fixture.contextSha256Hex, 'JVM VM fixture context SHA-256'),
    preHeaderParentIdHex: fixedHex(preHeader.parentId, 'JVM VM fixture preheader parent ID'),
    preHeaderHeight,
    headerIdsSha256Hex: createHash('sha256').update(headerIds.join('\n'), 'utf8').digest('hex'),
    inputBindings,
    dataInputBindings,
  };
}

function parseJvmVmExpectedBindings(value: unknown, label: string): JvmVmExpectedBinding[] {
  if (!Array.isArray(value)) throw new Error(`JVM VM fixture ${label} bindings must be an array`);
  return value.map((entry, index) => {
    const binding = requireRecord(entry, `JVM VM fixture ${label} binding ${index}`);
    const ergoTreeHex = variableHex(
      binding.ergoTreeHex,
      `JVM VM fixture ${label} binding ${index} ErgoTree`,
    );
    return {
      role: jvmVmRole(binding.role, `JVM VM fixture ${label} binding ${index} role`),
      ergoTreeSha256Hex: sha256Bytes(Buffer.from(ergoTreeHex, 'hex')),
    };
  });
}

function assertJvmVmReportBindings(
  report: AuthenticatedV2JvmVmRawConformanceReport,
  expectedInputs: JvmVmExpectedBinding[],
  expectedDataInputs: JvmVmExpectedBinding[],
): void {
  if (report.inputs.length !== expectedInputs.length || report.dataInputs.length !== expectedDataInputs.length) {
    throw new Error('JVM VM report contract binding counts do not match the fixture');
  }
  report.inputs.forEach((input, index) => {
    const expected = expectedInputs[index];
    if (input.role !== expected.role || input.ergoTreeSha256Hex !== expected.ergoTreeSha256Hex) {
      throw new Error(`JVM VM report input ${index} contract binding does not match the fixture`);
    }
  });
  report.dataInputs.forEach((input, index) => {
    const expected = expectedDataInputs[index];
    if (input.role !== expected.role || input.ergoTreeSha256Hex !== expected.ergoTreeSha256Hex) {
      throw new Error(`JVM VM report data-input ${index} contract binding does not match the fixture`);
    }
  });
}

function assertJvmVmModeRoles(
  mode: 'tracker' | 'settlement',
  inputRoles: Array<'tracker' | 'unlock' | 'duplicatePrevention'>,
  dataInputRoles: Array<'tracker' | 'unlock' | 'duplicatePrevention'>,
): void {
  const inputs = inputRoles.join(',');
  const dataInputs = dataInputRoles.join(',');
  if (mode === 'tracker') {
    if (inputs !== 'tracker') throw new Error('tracker JVM VM input roles must be exactly tracker');
    if (dataInputs !== '') throw new Error('tracker JVM VM must not contain data-input roles');
    return;
  }
  if (inputs !== 'duplicatePrevention,unlock') {
    throw new Error('settlement JVM VM input roles must be exactly duplicatePrevention,unlock');
  }
  if (dataInputs !== 'tracker') {
    throw new Error('settlement JVM VM data-input roles must be exactly tracker');
  }
}

function jvmVmRole(
  value: unknown,
  label: string,
): 'tracker' | 'unlock' | 'duplicatePrevention' {
  if (value !== 'tracker' && value !== 'unlock' && value !== 'duplicatePrevention') {
    throw new Error(`${label} is unsupported`);
  }
  return value;
}

export function buildInjectedAuthenticatedV2SourceTreeConformanceReportForTest(input: {
  plan: AuthenticatedV2ProvisioningPlan;
  resolved: ResolvedAuthenticatedV2ContractSources;
  lock: AuthenticatedV2CompilerLock;
  sourceBaseline: ConsensusSourceBaselineReport;
  observation: AuthenticatedV2CompilerObservation | null;
  executionErrors?: string[];
}): AuthenticatedV2SourceTreeConformanceReport {
  return buildAuthenticatedV2SourceTreeConformanceReport({
    ...input,
    parentRuntime: null,
    executionEvidence: null,
  }, null);
}

function buildAuthenticatedV2SourceTreeConformanceReport(input: {
  plan: AuthenticatedV2ProvisioningPlan;
  resolved: ResolvedAuthenticatedV2ContractSources;
  lock: AuthenticatedV2CompilerLock;
  sourceBaseline: ConsensusSourceBaselineReport;
  observation: AuthenticatedV2CompilerObservation | null;
  executionErrors?: string[];
  parentRuntime?: VerifiedParentRuntime | null;
  executionEvidence?: PinnedCompilerExecution | null;
}, executionAuthority: typeof PINNED_EXECUTION_AUTHORITY | null): AuthenticatedV2SourceTreeConformanceReport {
  const pinnedExecution = executionAuthority === PINNED_EXECUTION_AUTHORITY
    && input.parentRuntime !== null
    && input.parentRuntime !== undefined
    && input.executionEvidence !== null
    && input.executionEvidence !== undefined;
  const executionKind = pinnedExecution
    ? 'pinned-resolver-free-jvm' as const
    : 'injected-test-data' as const;
  const executionAuthorityLabel = pinnedExecution
    ? 'local-reproducible-run' as const
    : 'injected-test-data' as const;
  const injectedError = pinnedExecution
    ? []
    : ['injected observations cannot establish pinned compiler execution'];
  const errors = [...(input.executionErrors ?? []), ...injectedError];
  if (!input.sourceBaseline.checks.lockBindingsValidated) errors.push('consensus source lock bindings were not validated');
  if (!input.sourceBaseline.checks.ergoCheckoutValidated) errors.push('pinned Ergo source checkout was not validated');
  if (input.sourceBaseline.sourceIdentity.ergoBaseCommit !== input.lock.ergoNodeBaseCommit) {
    errors.push('compiler lock Ergo base commit does not match the consensus source lock');
  }
  if (input.sourceBaseline.sourceIdentity.ergoPatchSha256 !== input.lock.ergoPatchSha256) {
    errors.push('compiler lock Ergo patch does not match the validated source baseline');
  }
  if (input.observation) validateObservedCompilerIdentity(input.lock, input.observation.metadata, errors);

  const contracts = {} as Record<ContractRole, AuthenticatedV2SourceTreeContractResult>;
  for (const role of CONTRACT_ROLES) {
    const expected = input.resolved[role];
    const observed = input.observation?.contracts[role] ?? null;
    const exactByteMatch = !!observed
      && observed.resolvedSourceSha256Hex === expected.resolvedSourceSha256Hex
      && observed.ergoTreeHex === expected.ergoTreeHex
      && observed.ergoTreeSha256Hex === expected.ergoTreeSha256Hex;
    if (!observed) errors.push(`${role} compiler output is missing`);
    else {
      if (observed.resolvedSourceSha256Hex !== expected.resolvedSourceSha256Hex) {
        errors.push(`${role} compiled source hash does not match the resolved source`);
      }
      if (observed.ergoTreeHex !== expected.ergoTreeHex) {
        errors.push(`${role} compiled ErgoTree bytes do not match the provisioning binding`);
      }
      if (observed.ergoTreeSha256Hex !== expected.ergoTreeSha256Hex) {
        errors.push(`${role} compiled ErgoTree hash does not match the provisioning binding`);
      }
    }
    contracts[role] = contractResult(expected, observed, exactByteMatch);
  }

  const status = pinnedExecution && errors.length === 0 ? 'PASS' as const : 'BLOCKED' as const;
  const withoutDigest = {
    schema: AUTHENTICATED_V2_SOURCE_TREE_CONFORMANCE_SCHEMA,
    status,
    provisioning: {
      schema: input.plan.schema,
      packageDigestHex: input.plan.packageDigestHex,
      environment: input.plan.environment,
      trackerNftId: input.plan.identities.trackerNftId,
      duplicatePreventionNftId: input.plan.identities.duplicatePreventionNftId,
    },
    compiler: {
      execution: executionKind,
      executionAuthority: executionAuthorityLabel,
      sourceBaselineStatus: input.sourceBaseline.status,
      sourceLockBindingsValidated:
        pinnedExecution && input.sourceBaseline.checks.lockBindingsValidated,
      ergoCheckoutValidated:
        pinnedExecution && input.sourceBaseline.checks.ergoCheckoutValidated,
      parentRuntimeValidated: pinnedExecution,
      nodeVersion: input.parentRuntime?.nodeVersion ?? input.lock.nodeVersion,
      nodeExecutableSha256: input.parentRuntime?.nodeExecutableSha256 ?? input.lock.nodeExecutableSha256,
      gitVersion: input.parentRuntime?.gitVersion ?? input.lock.gitVersion,
      gitExecutableSha256: input.parentRuntime?.gitExecutableSha256 ?? input.lock.gitExecutableSha256,
      gitDistributionUrl: input.lock.gitDistributionUrl,
      gitDistributionSha256: input.lock.gitDistributionSha256,
      relayerPackageLockSha256: input.lock.relayerPackageLockSha256,
      parentRuntimePackagesValidated:
        pinnedExecution && (input.parentRuntime?.parentRuntimePackagesValidated ?? false),
      loaderInvocationValidated:
        pinnedExecution && (input.parentRuntime?.loaderInvocationValidated ?? false),
      gitEnvironmentSanitized:
        pinnedExecution && (input.parentRuntime?.gitEnvironmentSanitized ?? false),
      ergoNodeBaseCommit: input.lock.ergoNodeBaseCommit,
      consensusSourceLockSha256: input.lock.consensusSourceLockSha256,
      ergoPatchSha256: input.lock.ergoPatchSha256,
      ergoPatchedBlobIds: input.lock.ergoPatchedBlobIds,
      sigmaStateVersion: input.lock.sigmaStateVersion,
      sigmaStateArtifactSha256: input.lock.sigmaStateArtifactSha256,
      runtimeBundleSha256: input.lock.runtimeBundleSha256,
      runtimeClasspathEntries: input.lock.runtimeClasspathEntries,
      runtimeClasspathSha256: input.lock.runtimeClasspathSha256,
      scalaVersion: input.lock.scalaVersion,
      sbtVersion: input.lock.sbtVersion,
      javaMajorVersion: input.lock.javaMajorVersion,
      javaDistribution: input.lock.javaDistribution,
      javaHomeSha256: input.lock.javaHomeSha256,
      networkPrefix: input.lock.networkPrefix,
      scriptVersion: input.lock.scriptVersion,
      treeVersion: input.lock.treeVersion,
      buildSha256: input.lock.buildSha256,
      sbtPropertiesSha256: input.lock.sbtPropertiesSha256,
      toolSha256: input.lock.toolSha256,
      compiledToolClassesSha256: input.lock.compiledToolClassesSha256,
      compilerProjectFileSetValidated:
        pinnedExecution && (input.executionEvidence?.compilerProjectFileSetValidated ?? false),
      forbiddenEnvironmentOverridesExcluded:
        pinnedExecution && (input.executionEvidence?.forbiddenEnvironmentOverridesExcluded ?? false),
      runtimeSnapshotsValidated:
        pinnedExecution && (input.executionEvidence?.runtimeSnapshotsValidated ?? false),
      runtimeSnapshotsReadOnly:
        pinnedExecution && (input.executionEvidence?.runtimeSnapshotsReadOnly ?? false),
      observedMetadata: input.observation?.metadata ?? null,
    },
    contracts,
    errors: [...new Set(errors)],
    boundaries: {
      sourceToTreeVerified: status === 'PASS',
      retainedReportSufficientForSetup: false as const,
      independentAttestation: false as const,
      verifierRerunRequired: true as const,
      setupAuthorized: false as const,
      signingPerformed: false as const,
      jvmTransactionCheckPerformed: false as const,
      submissionPerformed: false as const,
      deploymentPerformed: false as const,
      broadcastPerformed: false as const,
      sidechainFinalityVerifiedOnErgo: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
      trustedHostRequired: true as const,
      concurrentSameUserTamperingOutOfScope: true as const,
    },
  };
  return deepFreeze({
    ...withoutDigest,
    reportDigestHex: sha256Canonical(withoutDigest),
  }) as AuthenticatedV2SourceTreeConformanceReport;
}

export function safeCompilerChildEnvironment(
  runtimeRootInput: string,
  javaHomeInput: string,
): NodeJS.ProcessEnv {
  const runtimeRoot = resolve(runtimeRootInput);
  const javaHome = resolve(javaHomeInput);
  const privateHome = resolve(runtimeRoot, 'home');
  const privateAppData = resolve(runtimeRoot, 'appdata');
  const privateLocalAppData = resolve(runtimeRoot, 'localappdata');
  const privateTemp = resolve(runtimeRoot, 'temp');
  for (const path of [privateHome, privateAppData, privateLocalAppData, privateTemp]) {
    mkdirSync(path, { recursive: true });
  }
  const result: NodeJS.ProcessEnv = {
    PATH: resolve(javaHome, 'bin'),
    JAVA_HOME: javaHome,
    USERPROFILE: privateHome,
    HOME: privateHome,
    APPDATA: privateAppData,
    LOCALAPPDATA: privateLocalAppData,
    TEMP: privateTemp,
    TMP: privateTemp,
    NO_COLOR: '1',
    COURSIER_MODE: 'offline',
  };
  for (const key of ['SystemRoot', 'SYSTEMROOT', 'PATHEXT']) {
    const value = process.env[key];
    if (typeof value === 'string' && value.length > 0) result[key] = value;
  }
  return result;
}

async function executePinnedCompiler(
  paths: CompilerLockPaths,
  resolved: ResolvedAuthenticatedV2ContractSources,
): Promise<PinnedCompilerExecution> {
  const execution = await executePinnedTool(
    paths,
    encodeAuthenticatedV2CompilerInput(resolved),
    (inputPath, outputPath) => ['--input', inputPath, '--output', outputPath],
  );
  return {
    observation: parseAuthenticatedV2CompilerOutput(execution.output),
    compilerProjectFileSetValidated: execution.compilerProjectFileSetValidated,
    forbiddenEnvironmentOverridesExcluded: execution.forbiddenEnvironmentOverridesExcluded,
    runtimeSnapshotsValidated: execution.runtimeSnapshotsValidated,
    runtimeSnapshotsReadOnly: execution.runtimeSnapshotsReadOnly,
  };
}

async function executePinnedTool(
  paths: CompilerLockPaths,
  input: string,
  buildArguments: (inputPath: string, outputPath: string) => string[],
): Promise<PinnedToolExecution> {
  const targetRoot = resolve(paths.toolRoot, 'target');
  mkdirSync(targetRoot, { recursive: true });
  const runRoot = mkdtempSync(resolve(targetRoot, 'bridge-conformance-'));
  if (!isInsidePath(runRoot, targetRoot)) throw new Error('compiler run directory escaped the tool target');
  try {
    assertLockedCompilerProjectUnchanged(paths);
    const sourceBundle = resolvePinnedRuntimeBundle(paths);
    const sourceJavaHome = resolvePinnedJavaHome(process.env, paths.lock);
    const runtimeRoot = resolve(runRoot, 'runtime');
    mkdirSync(runtimeRoot, { recursive: false });
    const classpathRoot = resolve(runtimeRoot, 'classpath');
    const javaHome = resolve(runtimeRoot, 'java-home');
    cpSync(sourceBundle, classpathRoot, {
      recursive: true,
      force: false,
      errorOnExist: true,
      verbatimSymlinks: true,
    });
    cpSync(sourceJavaHome, javaHome, {
      recursive: true,
      force: false,
      errorOnExist: true,
      verbatimSymlinks: true,
    });
    if (hashDirectoryFiles(classpathRoot) !== paths.lock.runtimeBundleSha256) {
      throw new Error('private compiler runtime bundle does not match the lock');
    }
    if (hashDirectoryFiles(javaHome) !== paths.lock.javaHomeSha256) {
      throw new Error('private Java home does not match the complete distribution lock');
    }
    const runtimeClasspath = validateAndListRuntimeClasspath(classpathRoot, paths.lock);
    makeSnapshotFilesReadOnly(classpathRoot);
    makeSnapshotFilesReadOnly(javaHome);
    const inputPath = resolve(runtimeRoot, 'input.tsv');
    const outputPath = resolve(runtimeRoot, 'output.tsv');
    writeFileSync(inputPath, input, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    const inputSha256 = sha256Bytes(readFileSync(inputPath));
    const javaExecutable = resolve(
      javaHome,
      'bin',
      process.platform === 'win32' ? 'java.exe' : 'java',
    );
    if (!existsSync(javaExecutable) || !statSync(javaExecutable).isFile()) {
      throw new Error('private Java executable is missing');
    }
    const childEnvironment = safeCompilerChildEnvironment(runtimeRoot, javaHome);
    assertCompilerChildEnvironment(childEnvironment, paths.lock);
    await execFileChecked(javaExecutable, [
      '-cp',
      runtimeClasspath.join(delimiter),
      paths.lock.mainClass,
      ...buildArguments(inputPath, outputPath),
    ], {
      cwd: runtimeRoot,
      env: childEnvironment,
      timeout: 300_000,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
      encoding: 'utf8' as const,
    });
    assertLockedCompilerProjectUnchanged(paths);
    if (hashDirectoryFiles(sourceBundle) !== paths.lock.runtimeBundleSha256) {
      throw new Error('source compiler runtime bundle changed during execution');
    }
    if (hashDirectoryFiles(classpathRoot) !== paths.lock.runtimeBundleSha256) {
      throw new Error('private compiler runtime bundle changed during execution');
    }
    if (hashDirectoryFiles(sourceJavaHome) !== paths.lock.javaHomeSha256) {
      throw new Error('source Java distribution changed during execution');
    }
    if (hashDirectoryFiles(javaHome) !== paths.lock.javaHomeSha256) {
      throw new Error('private Java distribution changed during execution');
    }
    if (sha256Bytes(readFileSync(inputPath)) !== inputSha256) {
      throw new Error('compiler input changed during execution');
    }
    if (!existsSync(outputPath) || !statSync(outputPath).isFile()) {
      throw new Error('compiler did not produce a regular output file');
    }
    return {
      output: readFileSync(outputPath, 'utf8'),
      compilerProjectFileSetValidated: true,
      forbiddenEnvironmentOverridesExcluded: true,
      runtimeSnapshotsValidated: true,
      runtimeSnapshotsReadOnly: true,
    };
  } finally {
    try {
      makeSnapshotFilesWritable(runRoot);
    } catch {
      // Cleanup below remains best-effort for a failed partial snapshot.
    }
    rmSync(runRoot, { recursive: true, force: true });
  }
}

function assertCompilerChildEnvironment(
  env: NodeJS.ProcessEnv,
  lock: AuthenticatedV2CompilerLock,
): void {
  for (const key of lock.forbiddenEnvironmentOverrides) {
    if (env[key] !== undefined) throw new Error(`compiler child environment contains forbidden override ${key}`);
  }
  const allowed = new Set([
    'PATH',
    'JAVA_HOME',
    'USERPROFILE',
    'HOME',
    'APPDATA',
    'LOCALAPPDATA',
    'TEMP',
    'TMP',
    'NO_COLOR',
    'COURSIER_MODE',
    'SystemRoot',
    'SYSTEMROOT',
    'PATHEXT',
  ]);
  const unexpected = Object.keys(env).filter(key => !allowed.has(key));
  if (unexpected.length > 0) throw new Error('compiler child environment contains unexpected variables');
}

function makeSnapshotFilesReadOnly(root: string): void {
  const files = listAllRegularFiles(root);
  for (const path of files) chmodSync(path, 0o444);
  for (const path of files) {
    if ((statSync(path).mode & 0o222) !== 0) throw new Error('private runtime snapshot remained writable');
  }
}

function makeSnapshotFilesWritable(root: string): void {
  if (!existsSync(root)) return;
  for (const path of listAllRegularFiles(root)) chmodSync(path, 0o666);
}

function assertLockedCompilerProjectUnchanged(paths: CompilerLockPaths): void {
  const files = lockedCompilerProjectFiles(paths);
  validateAuthenticatedV2CompilerProjectFileSet(
    listCompilerProjectFiles(paths.toolRoot),
    files.map(file => file.relativePath),
  );
  for (const file of files) {
    if (!existsSync(file.sourcePath) || sha256Bytes(readFileSync(file.sourcePath)) !== file.sha256) {
      throw new Error(`compiler ${file.label} changed during execution`);
    }
  }
}

function lockedCompilerProjectFiles(paths: CompilerLockPaths): Array<{
  label: string;
  sourcePath: string;
  relativePath: string;
  sha256: string;
}> {
  return [
    {
      label: 'build',
      sourcePath: paths.buildPath,
      relativePath: relative(paths.toolRoot, paths.buildPath).replace(/\\/g, '/'),
      sha256: paths.lock.buildSha256,
    },
    {
      label: 'sbt properties',
      sourcePath: paths.sbtPropertiesPath,
      relativePath: relative(paths.toolRoot, paths.sbtPropertiesPath).replace(/\\/g, '/'),
      sha256: paths.lock.sbtPropertiesSha256,
    },
    {
      label: 'source',
      sourcePath: paths.toolPath,
      relativePath: relative(paths.toolRoot, paths.toolPath).replace(/\\/g, '/'),
      sha256: paths.lock.toolSha256,
    },
  ];
}

function execFileChecked(
  file: string,
  args: string[],
  options: Parameters<typeof execFile>[2],
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        const detail = summarizeCompilerFailure(`${String(stdout)}\n${String(stderr)}`);
        reject(new Error(
          `compiler process exited unsuccessfully (${error.code ?? 'unknown'})${detail ? `: ${detail}` : ''}`,
        ));
        return;
      }
      resolvePromise();
    });
  });
}

function summarizeCompilerFailure(output: string): string {
  const candidates = output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /bridge compiler failed:|\[error\]|unexpected|inattendu/i.test(line))
    .slice(-3)
    .map(line => line
      .replace(/[A-Za-z]:[\\/][^\s)]+/g, '<local-path>')
      .replace(/file:\/\/\/[^\s)]+/g, '<local-uri>'));
  return candidates.join(' | ');
}

function resolvePinnedRuntimeBundle(paths: CompilerLockPaths): string {
  if (!existsSync(paths.runtimeBundlePath) || !statSync(paths.runtimeBundlePath).isDirectory()) {
    throw new Error('compiler runtime bundle is missing; run the locked runtimeBundle sbt task');
  }
  const bundle = realpathSync(paths.runtimeBundlePath);
  if (!isInsidePath(bundle, paths.toolRoot) || hashDirectoryFiles(bundle) !== paths.lock.runtimeBundleSha256) {
    throw new Error('compiler runtime bundle does not match the lock');
  }
  validateAndListRuntimeClasspath(bundle, paths.lock);
  return bundle;
}

function validateAndListRuntimeClasspath(
  bundleRoot: string,
  lock: AuthenticatedV2CompilerLock,
): string[] {
  const entries = readdirSync(bundleRoot, { withFileTypes: true }).sort((left, right) => (
    left.name.localeCompare(right.name, 'en')
  ));
  const names = entries.map(entry => entry.name);
  if (
    names.length !== lock.runtimeClasspathEntries.length
    || names.some((name, index) => name !== lock.runtimeClasspathEntries[index])
  ) {
    throw new Error('compiler runtime bundle entries do not match the ordered lock');
  }
  const paths = entries.map((entry, index) => {
    if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) {
      throw new Error('compiler runtime bundle contains an unsupported filesystem entry');
    }
    if (index === 0 && !entry.isDirectory()) throw new Error('compiler classes entry must be a directory');
    if (index > 0 && !entry.isFile()) throw new Error('compiler dependency entries must be regular files');
    return resolve(bundleRoot, entry.name);
  });
  if (hashDirectoryFiles(paths[0]) !== lock.compiledToolClassesSha256) {
    throw new Error('compiled JVM tool classes do not match the compiler lock');
  }
  const sigmaIndex = names.findIndex(name => name.endsWith('sigma-state_2.12-6.0.2.jar'));
  if (sigmaIndex < 0 || sha256Bytes(readFileSync(paths[sigmaIndex])) !== lock.sigmaStateArtifactSha256) {
    throw new Error('sigma-state runtime artifact does not match the compiler lock');
  }
  if (runtimeClasspathSha256(paths) !== lock.runtimeClasspathSha256) {
    throw new Error('ordered compiler runtime classpath does not match the lock');
  }
  return paths;
}

function runtimeClasspathSha256(paths: string[]): string {
  const records = paths.map((path, index) => {
    const stat = statSync(path);
    const kind = stat.isDirectory() ? 'dir' : stat.isFile() ? 'file' : 'unsupported';
    if (kind === 'unsupported') throw new Error('runtime classpath contains an unsupported entry');
    const digest = kind === 'dir' ? hashDirectoryFiles(path) : sha256Bytes(readFileSync(path));
    return `${index}\t${kind}\t${basename(path)}\t${digest}`;
  });
  return sha256Bytes(Buffer.from(records.join('\n'), 'utf8'));
}

function resolvePinnedJavaHome(
  env: NodeJS.ProcessEnv,
  lock: AuthenticatedV2CompilerLock,
): string {
  const javaHome = env.JAVA_HOME;
  if (!javaHome) throw new Error('JAVA_HOME is required for complete Java distribution validation');
  const javaRoot = realpathSync(javaHome);
  if (hashDirectoryFiles(javaRoot) !== lock.javaHomeSha256) {
    throw new Error('JAVA_HOME does not match the complete Microsoft OpenJDK distribution lock');
  }
  return javaRoot;
}

function validateObservedCompilerIdentity(
  lock: AuthenticatedV2CompilerLock,
  metadata: AuthenticatedV2CompilerMetadata,
  errors: string[],
): void {
  if (metadata.networkPrefix !== lock.networkPrefix) errors.push('compiler network prefix does not match the lock');
  if (metadata.scriptVersion !== lock.scriptVersion) errors.push('compiler script version does not match the lock');
  if (metadata.treeVersion !== lock.treeVersion) errors.push('compiler tree version does not match the lock');
  if (metadata.scalaVersion !== lock.scalaVersion) errors.push('compiler Scala version does not match the lock');
  if (metadata.javaMajorVersion !== String(lock.javaMajorVersion)) errors.push('compiler Java major version does not match the lock');
  if (metadata.sigmaStateArtifactSha256 !== lock.sigmaStateArtifactSha256) {
    errors.push('loaded sigma-state compiler artifact does not match the lock');
  }
  if (metadata.runtimeClasspathSha256 !== lock.runtimeClasspathSha256) {
    errors.push('loaded compiler runtime classpath does not match the lock');
  }
  if (metadata.javaHomeSha256 !== lock.javaHomeSha256) {
    errors.push('loaded Java home does not match the complete distribution lock');
  }
}

function contractResult(
  expected: ResolvedAuthenticatedV2ContractSource,
  observed: AuthenticatedV2CompiledContractObservation | null,
  exactByteMatch: boolean,
): AuthenticatedV2SourceTreeContractResult {
  return {
    templateSha256Hex: expected.templateSha256Hex,
    resolvedSourceSha256Hex: expected.resolvedSourceSha256Hex,
    expectedErgoTreeHex: expected.ergoTreeHex,
    expectedErgoTreeSha256Hex: expected.ergoTreeSha256Hex,
    compiledResolvedSourceSha256Hex: observed?.resolvedSourceSha256Hex ?? null,
    compiledErgoTreeHex: observed?.ergoTreeHex ?? null,
    compiledErgoTreeSha256Hex: observed?.ergoTreeSha256Hex ?? null,
    exactByteMatch,
  };
}

function resolveLockedFile(
  bridgeRoot: string,
  relativePath: string,
  expectedSha256: string,
  label: string,
): string {
  const requested = resolve(bridgeRoot, relativePath);
  if (!isInsidePath(requested, bridgeRoot) || !existsSync(requested)) {
    throw new Error(`${label} path is missing or escapes the bridge repository`);
  }
  const resolved = realpathSync(requested);
  if (!isInsidePath(resolved, bridgeRoot) || !statSync(resolved).isFile()) {
    throw new Error(`${label} must be a regular file inside the bridge repository`);
  }
  if (sha256Bytes(readFileSync(resolved)) !== expectedSha256) {
    throw new Error(`${label} does not match its SHA-256 lock`);
  }
  return resolved;
}

function listCompilerProjectFiles(root: string, cursor: string = root): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(cursor, { withFileTypes: true })) {
    if (entry.name === 'target') continue;
    const path = resolve(cursor, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error('compiler project must not contain symbolic links');
    }
    if (entry.isDirectory()) {
      files.push(...listCompilerProjectFiles(root, path));
      continue;
    }
    if (!entry.isFile()) throw new Error('compiler project contains an unsupported filesystem entry');
    files.push(relative(root, path).replace(/\\/g, '/'));
  }
  return files;
}

function hashDirectoryFiles(root: string): string {
  const records = listAllRegularFiles(root)
    .map(path => `${relative(root, path).replace(/\\/g, '/')}:${sha256Bytes(readFileSync(path))}`)
    .sort();
  if (records.length === 0) throw new Error('compiled JVM tool classes are missing');
  return createHash('sha256').update(records.join('\n'), 'utf8').digest('hex');
}

function listAllRegularFiles(root: string, cursor: string = root): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(cursor, { withFileTypes: true })) {
    const path = resolve(cursor, entry.name);
    if (entry.isSymbolicLink()) throw new Error('compiled JVM tool output must not contain symbolic links');
    if (entry.isDirectory()) files.push(...listAllRegularFiles(root, path));
    else if (entry.isFile()) files.push(path);
    else throw new Error('compiled JVM tool output contains an unsupported filesystem entry');
  }
  return files;
}

function fixedHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !HEX_32.test(value)) {
    throw new Error(`${label} must be 32-byte lowercase hex`);
  }
  return value;
}

function fixedByteHex(value: unknown, expectedBytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || value.length !== expectedBytes * 2
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be ${expectedBytes}-byte lowercase hex`);
  }
  return value;
}

function variableHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !HEX_BYTES.test(value)) {
    throw new Error(`${label} must be non-empty lowercase even-length hex`);
  }
  return value;
}

function strictInteger(value: string, label: string): number {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) throw new Error(`${label} must be a canonical integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} must be a safe integer`);
  return parsed;
}

function sha256Bytes(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonical JSON cannot encode non-finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  throw new Error('canonical JSON cannot encode this value');
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} must contain exactly: ${wanted.join(', ')}`);
  }
}

function isSafeRelativePath(value: string): boolean {
  return value.length > 0
    && !value.startsWith('/')
    && !value.startsWith('\\')
    && !/^[A-Za-z]:/.test(value)
    && !value.split(/[\\/]/).includes('..');
}

function isInsidePath(target: string, parent: string): boolean {
  const relativePath = relative(parent, target);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
