import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  cpSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {
  basename,
  delimiter,
  dirname,
  isAbsolute,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';

import blakejs from 'blakejs';

import { sha256CanonicalJson } from './strict-json.js';
import {
  resolveSubstrateFederatedTrackerCompilerSourceV1,
  type SubstrateFederatedTrackerCompilerRequestV1,
} from './substrate-federated-tracker-compiler-v1.js';

export const SUBSTRATE_FEDERATED_TRACKER_JVM_COMPILER_LOCK_KIND =
  'bridge-substrate-federated-tracker-compiler-lock' as const;
export const SUBSTRATE_FEDERATED_TRACKER_JVM_COMPILER_RECEIPT_V1_SCHEMA =
  'e2s.substrate-federated-tracker-jvm-compiler-receipt.v1' as const;

const LOCK_RELATIVE_PATH =
  'sources/substrate-federated-tracker-compiler-lock-v1.json';
const LOCK_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_TRACKER_JVM_COMPILER_LOCK_V1';
const RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_TRACKER_JVM_COMPILER_RECEIPT_V1';
const INPUT_PREFIX = 'BRIDGE_FED_TRACKER_REQUEST';
const META_PREFIX = 'BRIDGE_FED_TRACKER_META';
const CONTRACT_PREFIX = 'BRIDGE_FED_TRACKER_CONTRACT';
const SHA256_HEX = /^[0-9a-f]{64}$/;
const VARIABLE_HEX = /^(?:[0-9a-f]{2})+$/;
const processReceipts = new WeakSet<object>();
const DEPENDENCY_CLASSPATH_NAMES = [
  '001-scala-library.jar',
  '002-sigma-state_2.12-6.0.2.jar',
  '003-scala-reflect.jar',
  '004-debox_2.12-0.10.0.jar',
  '005-scala-collection-compat_2.12-2.7.0.jar',
  '006-scorex-util_2.12-0.2.1.jar',
  '007-bcprov-jdk15on-1.66.jar',
  '008-fastparse_2.12-2.3.3.jar',
  '009-circe-core_2.12-0.13.0.jar',
  '010-circe-generic_2.12-0.13.0.jar',
  '011-circe-parser_2.12-0.13.0.jar',
  '012-scrypto_2.12-3.0.0.jar',
  '013-scodec-bits_2.12-1.1.34.jar',
  '014-spire-macros_2.12-0.17.0-M1.jar',
  '015-supertagged_2.12-2.0-RC2.jar',
  '016-scala-logging_2.12-3.9.2.jar',
  '017-sourcecode_2.12-0.2.3.jar',
  '018-geny_2.12-0.6.10.jar',
  '019-circe-numbers_2.12-0.13.0.jar',
  '020-cats-core_2.12-2.1.0.jar',
  '021-shapeless_2.12-2.3.3.jar',
  '022-circe-jawn_2.12-0.13.0.jar',
  '023-bcprov-jdk15to18-1.66.jar',
  '024-machinist_2.12-0.6.8.jar',
  '025-algebra_2.12-2.0.0-M2.jar',
  '026-slf4j-api-1.7.25.jar',
  '027-cats-macros_2.12-2.1.0.jar',
  '028-cats-kernel_2.12-2.1.0.jar',
  '029-macro-compat_2.12-1.1.1.jar',
  '030-jawn-parser_2.12-1.0.0.jar',
] as const;

export interface SubstrateFederatedTrackerJvmCompilerLockV1 {
  readonly schemaVersion: 1;
  readonly kind:
    typeof SUBSTRATE_FEDERATED_TRACKER_JVM_COMPILER_LOCK_KIND;
  readonly platform: 'win32-x64';
  readonly nodeVersion: '24.14.0';
  readonly nodeExecutableSha256: string;
  readonly trustedHostModel: 'exclusive-same-user-process';
  readonly dependencyRootPath:
    'relayer/tools/authenticated-v2-compiler/target/locked-runtime';
  readonly dependencyClasspath: readonly Readonly<{
    readonly name: string;
    readonly sha256: string;
  }>[];
  readonly dependencyClasspathSha256: string;
  readonly sigmaStateVersion: '6.0.2';
  readonly sigmaStateArtifactSha256: string;
  readonly scalaVersion: '2.12.20';
  readonly javaMajorVersion: 17;
  readonly javaDistribution: 'Microsoft OpenJDK 17.0.19+10-LTS';
  readonly javaHomeSha256: string;
  readonly javaExecutableSha256: string;
  readonly javacExecutableSha256: string;
  readonly networkPrefix: 16;
  readonly scriptVersion: 3;
  readonly treeVersion: 0;
  readonly toolPath:
    'relayer/tools/federated-tracker-compiler/ExactFederatedTrackerCompiler.java';
  readonly toolSha256: string;
  readonly compiledToolClassesSha256: string;
  readonly mainClass:
    'org.ergoplatform.bridge.tools.ExactFederatedTrackerCompiler';
  readonly javacArguments: readonly [
    '-encoding',
    'UTF-8',
    '-source',
    '17',
    '-target',
    '17',
  ];
  readonly maximumInputBytes: 1048576;
  readonly maximumOutputBytes: 16384;
  readonly forbiddenParentEnvironmentOverrides: readonly string[];
  readonly forbiddenChildEnvironmentOverrides: readonly string[];
}

export interface SubstrateFederatedTrackerJvmCompilerObservationV1 {
  readonly authority: 'observation-only';
  readonly requestDigestHex: string;
  readonly resolvedSourceSha256Hex: string;
  readonly propositionBytes: number;
  readonly propositionHex: string;
  readonly propositionSha256Hex: string;
  readonly contractIdHex: string;
  readonly metadata: Readonly<{
    readonly networkPrefix: 16;
    readonly scriptVersion: 3;
    readonly treeVersion: 0;
    readonly javaMajorVersion: '17';
    readonly scalaVersion: '2.12.20';
    readonly sigmaStateArtifactSha256: string;
    readonly dependencyClasspathSha256: string;
    readonly javaHomeSha256: string;
    readonly compiledToolClassesSha256: string;
  }>;
}

export interface SubstrateFederatedTrackerJvmCompilerReceiptV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_TRACKER_JVM_COMPILER_RECEIPT_V1_SCHEMA;
  readonly version: 1;
  readonly receiptDigestHex: string;
  readonly compilerRequestDigestHex: string;
  readonly compilerLockDigestHex: string;
  readonly compiler: Readonly<{
    readonly execution: 'process-owned-resolver-free-jvm';
    readonly sigmaStateVersion: '6.0.2';
    readonly sigmaStateArtifactSha256: string;
    readonly dependencyClasspathSha256: string;
    readonly javaDistribution: 'Microsoft OpenJDK 17.0.19+10-LTS';
    readonly javaHomeSha256: string;
    readonly toolSha256: string;
    readonly compiledToolClassesSha256: string;
  }>;
  readonly contract: Readonly<{
    readonly resolvedSourceSha256Hex: string;
    readonly propositionBytes: number;
    readonly propositionHex: string;
    readonly propositionSha256Hex: string;
    readonly contractIdHex: string;
  }>;
  readonly checks: Readonly<{
    readonly sameProcessCompilerRequestVerified: true;
    readonly processOwnedInputCreated: true;
    readonly pinnedToolSourceCompiled: true;
    readonly pinnedRuntimeSnapshotVerified: true;
    readonly exactCompilerOutputBound: true;
    readonly propositionIdentityRecomputed: true;
    readonly jvmSerializationRoundTripVerified: true;
    readonly callerContractIdentityAccepted: false;
    readonly callerAuthorityClaimsAccepted: false;
  }>;
  readonly boundaries: Readonly<{
    readonly profileActivated: false;
    readonly targetGenesisBoxObserved: false;
    readonly targetNetworkIdentityAuthenticated: false;
    readonly jvmCompilationReplayed: true;
    readonly compilerReceiptAuthenticated: true;
    readonly trustedHostRequired: true;
    readonly concurrentSameUserTamperingOutOfScope: true;
    readonly nodeCheckPerformed: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
  }>;
}

interface LoadedCompilerRuntime {
  readonly bridgeRoot: string;
  readonly lock: Readonly<SubstrateFederatedTrackerJvmCompilerLockV1>;
  readonly lockDigestHex: string;
  readonly toolPath: string;
  readonly runtimeDependencyPaths: readonly string[];
  readonly javaHome: string;
}

export interface PinnedFederatedJvmCompilerExecutionV1 {
  readonly authority: 'observation-only';
  readonly output: string;
  readonly compilerLock:
    Readonly<SubstrateFederatedTrackerJvmCompilerLockV1>;
  readonly compilerLockDigestHex: string;
}

export async function compileSubstrateFederatedTrackerWithPinnedJvmV1(
  request: Readonly<SubstrateFederatedTrackerCompilerRequestV1>,
): Promise<Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV1>> {
  const source = resolveSubstrateFederatedTrackerCompilerSourceV1(request);
  const sourceBytes = Buffer.from(source, 'utf8');
  if (
    sourceBytes.length === 0
    || sourceBytes.length > 512 * 1024
    || sourceBytes.includes(0)
    || source.includes('\r')
  ) {
    throw new Error('federated tracker resolved source is outside the compiler bound');
  }
  if (sha256Bytes(sourceBytes) !== request.template.resolvedSourceSha256Hex) {
    throw new Error('federated tracker resolved source does not match its request digest');
  }

  const input = `${INPUT_PREFIX}\t1\t${request.requestDigestHex}`
    + `\t${request.template.resolvedSourceSha256Hex}`
    + `\t${sourceBytes.toString('base64')}\n`;
  const execution = await executePinnedFederatedJvmCompilerV1(
    Buffer.from(input, 'utf8'),
  );
  const observation = parseSubstrateFederatedTrackerJvmCompilerOutputV1(
    execution.output,
    {
      requestDigestHex: request.requestDigestHex,
      resolvedSourceSha256Hex: request.template.resolvedSourceSha256Hex,
      lock: execution.compilerLock,
    },
  );
  const binding = {
    schema: SUBSTRATE_FEDERATED_TRACKER_JVM_COMPILER_RECEIPT_V1_SCHEMA,
    version: 1 as const,
    compilerRequestDigestHex: request.requestDigestHex,
    compilerLockDigestHex: execution.compilerLockDigestHex,
    compiler: {
      execution: 'process-owned-resolver-free-jvm' as const,
      sigmaStateVersion: execution.compilerLock.sigmaStateVersion,
      sigmaStateArtifactSha256:
        observation.metadata.sigmaStateArtifactSha256,
      dependencyClasspathSha256:
        observation.metadata.dependencyClasspathSha256,
      javaDistribution: execution.compilerLock.javaDistribution,
      javaHomeSha256: observation.metadata.javaHomeSha256,
      toolSha256: execution.compilerLock.toolSha256,
      compiledToolClassesSha256:
        observation.metadata.compiledToolClassesSha256,
    },
    contract: {
      resolvedSourceSha256Hex: observation.resolvedSourceSha256Hex,
      propositionBytes: observation.propositionBytes,
      propositionHex: observation.propositionHex,
      propositionSha256Hex: observation.propositionSha256Hex,
      contractIdHex: observation.contractIdHex,
    },
    checks: {
      sameProcessCompilerRequestVerified: true as const,
      processOwnedInputCreated: true as const,
      pinnedToolSourceCompiled: true as const,
      pinnedRuntimeSnapshotVerified: true as const,
      exactCompilerOutputBound: true as const,
      propositionIdentityRecomputed: true as const,
      jvmSerializationRoundTripVerified: true as const,
      callerContractIdentityAccepted: false as const,
      callerAuthorityClaimsAccepted: false as const,
    },
    boundaries: receiptBoundaries(),
  };
  const receipt = deepFreeze({
    ...binding,
    receiptDigestHex: sha256CanonicalJson(binding, RECEIPT_DIGEST_DOMAIN),
  });
  processReceipts.add(receipt);
  return receipt;
}

/** Execute a canonical compiler record; the returned text is observation-only. */
export async function executePinnedFederatedJvmCompilerV1(
  input: Buffer,
): Promise<Readonly<PinnedFederatedJvmCompilerExecutionV1>> {
  if (!Buffer.isBuffer(input)) {
    throw new Error('pinned federated JVM compiler input must be bytes');
  }
  const inputBytes = Buffer.from(input);
  const runtime = loadCompilerRuntime();
  if (
    inputBytes.length === 0
    || inputBytes.length > runtime.lock.maximumInputBytes
  ) {
    throw new Error('pinned federated JVM compiler input exceeds its lock');
  }
  const outputBytes = await executeCompiler(runtime, inputBytes);
  const output = outputBytes.toString('utf8');
  if (!Buffer.from(output, 'utf8').equals(outputBytes)) {
    throw new Error('pinned federated JVM compiler output is not canonical UTF-8');
  }
  return deepFreeze({
    authority: 'observation-only' as const,
    output,
    compilerLock: runtime.lock,
    compilerLockDigestHex: runtime.lockDigestHex,
  });
}

export function assertSubstrateFederatedTrackerJvmCompilerReceiptV1(
  receipt: Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV1>,
  request: Readonly<SubstrateFederatedTrackerCompilerRequestV1>,
): Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV1> {
  const source = resolveSubstrateFederatedTrackerCompilerSourceV1(request);
  if (!processReceipts.has(receipt)) {
    throw new Error('federated tracker JVM compiler receipt lacks process provenance');
  }
  if (
    receipt.compilerRequestDigestHex !== request.requestDigestHex
    || receipt.contract.resolvedSourceSha256Hex
      !== request.template.resolvedSourceSha256Hex
    || sha256Bytes(Buffer.from(source, 'utf8'))
      !== receipt.contract.resolvedSourceSha256Hex
  ) {
    throw new Error('federated tracker JVM compiler receipt request binding drifted');
  }
  return receipt;
}

/** Parse compiler output as data only; this function never grants process provenance. */
export function parseSubstrateFederatedTrackerJvmCompilerOutputV1(
  outputInput: Buffer | string,
  expected: Readonly<{
    readonly requestDigestHex: string;
    readonly resolvedSourceSha256Hex: string;
    readonly lock: Readonly<SubstrateFederatedTrackerJvmCompilerLockV1>;
  }>,
): Readonly<SubstrateFederatedTrackerJvmCompilerObservationV1> {
  const lock = validateSubstrateFederatedTrackerJvmCompilerLockV1(expected.lock);
  const outputBytes = Buffer.isBuffer(outputInput)
    ? Buffer.from(outputInput)
    : Buffer.from(outputInput, 'utf8');
  if (
    outputBytes.length === 0
    || outputBytes.length > lock.maximumOutputBytes
    || outputBytes.includes(0)
  ) {
    throw new Error('federated tracker JVM compiler output size is invalid');
  }
  const output = outputBytes.toString('utf8');
  if (!Buffer.from(output, 'utf8').equals(outputBytes)) {
    throw new Error('federated tracker JVM compiler output is not canonical UTF-8');
  }
  if (output.includes('\r') || !output.endsWith('\n')) {
    throw new Error('federated tracker JVM compiler output must be LF-only');
  }
  const lines = output.slice(0, -1).split('\n');
  if (lines.length !== 2) {
    throw new Error('federated tracker JVM compiler output must contain two records');
  }
  const metadata = lines[0].split('\t');
  if (
    metadata.length !== 12
    || metadata[0] !== META_PREFIX
    || metadata[1] !== '1'
    || metadata[2] !== String(lock.networkPrefix)
    || metadata[3] !== String(lock.scriptVersion)
    || metadata[4] !== String(lock.treeVersion)
    || metadata[5] !== String(lock.javaMajorVersion)
    || metadata[6] !== lock.scalaVersion
    || metadata[7] !== lock.sigmaStateArtifactSha256
    || metadata[8] !== lock.dependencyClasspathSha256
    || metadata[9] !== lock.javaHomeSha256
    || metadata[10] !== lock.compiledToolClassesSha256
    || metadata[11] !== expected.requestDigestHex
  ) {
    throw new Error('federated tracker JVM compiler metadata drifted');
  }
  const contract = lines[1].split('\t');
  if (
    contract.length !== 7
    || contract[0] !== CONTRACT_PREFIX
    || contract[1] !== 'tracker'
    || contract[2] !== expected.resolvedSourceSha256Hex
  ) {
    throw new Error('federated tracker JVM compiler contract binding drifted');
  }
  const propositionBytes = positiveInteger(
    contract[3],
    'federated tracker proposition bytes',
  );
  if (propositionBytes >= 4096) {
    throw new Error('federated tracker proposition exceeds the supported bound');
  }
  const propositionHex = variableHex(
    contract[4],
    'federated tracker proposition',
  );
  const proposition = Buffer.from(propositionHex, 'hex');
  const propositionSha256Hex = fixedSha256(
    contract[5],
    'federated tracker proposition digest',
  );
  const contractIdHex = fixedSha256(
    contract[6],
    'federated tracker contract ID',
  );
  if (
    proposition.length !== propositionBytes
    || sha256Bytes(proposition) !== propositionSha256Hex
    || blake2b256Hex(proposition) !== contractIdHex
  ) {
    throw new Error('federated tracker proposition identity drifted');
  }
  return deepFreeze({
    authority: 'observation-only' as const,
    requestDigestHex: expected.requestDigestHex,
    resolvedSourceSha256Hex: expected.resolvedSourceSha256Hex,
    propositionBytes,
    propositionHex,
    propositionSha256Hex,
    contractIdHex,
    metadata: {
      networkPrefix: 16 as const,
      scriptVersion: 3 as const,
      treeVersion: 0 as const,
      javaMajorVersion: '17' as const,
      scalaVersion: '2.12.20' as const,
      sigmaStateArtifactSha256: metadata[7],
      dependencyClasspathSha256: metadata[8],
      javaHomeSha256: metadata[9],
      compiledToolClassesSha256: metadata[10],
    },
  });
}

export function validateSubstrateFederatedTrackerJvmCompilerLockV1(
  value: unknown,
): Readonly<SubstrateFederatedTrackerJvmCompilerLockV1> {
  const lock = requireRecord(value, 'federated tracker JVM compiler lock');
  assertExactKeys(lock, [
    'schemaVersion',
    'kind',
    'platform',
    'nodeVersion',
    'nodeExecutableSha256',
    'trustedHostModel',
    'dependencyRootPath',
    'dependencyClasspath',
    'dependencyClasspathSha256',
    'sigmaStateVersion',
    'sigmaStateArtifactSha256',
    'scalaVersion',
    'javaMajorVersion',
    'javaDistribution',
    'javaHomeSha256',
    'javaExecutableSha256',
    'javacExecutableSha256',
    'networkPrefix',
    'scriptVersion',
    'treeVersion',
    'toolPath',
    'toolSha256',
    'compiledToolClassesSha256',
    'mainClass',
    'javacArguments',
    'maximumInputBytes',
    'maximumOutputBytes',
    'forbiddenParentEnvironmentOverrides',
    'forbiddenChildEnvironmentOverrides',
  ], 'federated tracker JVM compiler lock');
  if (
    lock.schemaVersion !== 1
    || lock.kind !== SUBSTRATE_FEDERATED_TRACKER_JVM_COMPILER_LOCK_KIND
    || lock.platform !== 'win32-x64'
    || lock.nodeVersion !== '24.14.0'
    || lock.trustedHostModel !== 'exclusive-same-user-process'
    || lock.dependencyRootPath
      !== 'relayer/tools/authenticated-v2-compiler/target/locked-runtime'
    || lock.sigmaStateVersion !== '6.0.2'
    || lock.scalaVersion !== '2.12.20'
    || lock.javaMajorVersion !== 17
    || lock.javaDistribution !== 'Microsoft OpenJDK 17.0.19+10-LTS'
    || lock.networkPrefix !== 16
    || lock.scriptVersion !== 3
    || lock.treeVersion !== 0
    || lock.toolPath
      !== 'relayer/tools/federated-tracker-compiler/ExactFederatedTrackerCompiler.java'
    || lock.mainClass
      !== 'org.ergoplatform.bridge.tools.ExactFederatedTrackerCompiler'
    || lock.maximumInputBytes !== 1048576
    || lock.maximumOutputBytes !== 16384
  ) {
    throw new Error('federated tracker JVM compiler lock constants are unsupported');
  }
  for (const [field, candidate] of [
    ['Node executable', lock.nodeExecutableSha256],
    ['dependency classpath', lock.dependencyClasspathSha256],
    ['SigmaState artifact', lock.sigmaStateArtifactSha256],
    ['Java home', lock.javaHomeSha256],
    ['Java executable', lock.javaExecutableSha256],
    ['Javac executable', lock.javacExecutableSha256],
    ['tool source', lock.toolSha256],
    ['compiled tool classes', lock.compiledToolClassesSha256],
  ] as const) {
    fixedSha256(candidate, `${field} digest`);
  }
  if (
    !Array.isArray(lock.dependencyClasspath)
    || lock.dependencyClasspath.length !== DEPENDENCY_CLASSPATH_NAMES.length
  ) {
    throw new Error('federated tracker JVM compiler dependency classpath is invalid');
  }
  for (const [index, value] of lock.dependencyClasspath.entries()) {
    const entry = requireRecord(
      value,
      `federated tracker JVM compiler dependency ${index}`,
    );
    assertExactKeys(
      entry,
      ['name', 'sha256'],
      `federated tracker JVM compiler dependency ${index}`,
    );
    if (entry.name !== DEPENDENCY_CLASSPATH_NAMES[index]) {
      throw new Error('federated tracker JVM compiler dependency name drifted');
    }
    fixedSha256(
      entry.sha256,
      `federated tracker JVM compiler dependency ${index} digest`,
    );
  }
  const sigmaDependency = requireRecord(
    lock.dependencyClasspath[1],
    'federated tracker JVM compiler SigmaState dependency',
  );
  if (sigmaDependency.sha256 !== lock.sigmaStateArtifactSha256) {
    throw new Error('federated tracker JVM compiler SigmaState pin drifted');
  }
  const javacArguments = ['-encoding', 'UTF-8', '-source', '17', '-target', '17'];
  if (
    !Array.isArray(lock.javacArguments)
    || lock.javacArguments.length !== javacArguments.length
    || lock.javacArguments.some((entry, index) => entry !== javacArguments[index])
  ) {
    throw new Error('federated tracker JVM compiler javac arguments drifted');
  }
  for (const [label, actual, expected] of [
    [
      'parent environment overrides',
      lock.forbiddenParentEnvironmentOverrides,
      ['NODE_COMPILE_CACHE', 'NODE_EXTRA_CA_CERTS', 'NODE_OPTIONS', 'NODE_PATH', 'TSX_TSCONFIG_PATH'],
    ],
    [
      'child environment overrides',
      lock.forbiddenChildEnvironmentOverrides,
      ['CLASSPATH', 'JAVA_OPTS', 'JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS', 'SBT_OPTS', 'SIGMASTATE_VERSION', '_JAVA_OPTIONS'],
    ],
  ] as const) {
    if (
      !Array.isArray(actual)
      || actual.length !== expected.length
      || actual.some((entry, index) => entry !== expected[index])
    ) {
      throw new Error(`federated tracker JVM compiler ${label} drifted`);
    }
  }
  return deepFreeze(structuredClone(
    lock as unknown as SubstrateFederatedTrackerJvmCompilerLockV1,
  ));
}

function loadCompilerRuntime(): LoadedCompilerRuntime {
  const bridgeRoot = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
  const lockPath = resolve(bridgeRoot, LOCK_RELATIVE_PATH);
  const lockBytes = readFileSync(lockPath);
  const lock = validateSubstrateFederatedTrackerJvmCompilerLockV1(
    JSON.parse(lockBytes.toString('utf8')),
  );
  assertNoEnvironmentOverrides(
    process.env,
    lock.forbiddenParentEnvironmentOverrides,
    'parent',
  );
  if (`${process.platform}-${process.arch}` !== lock.platform) {
    throw new Error('federated tracker compiler platform does not match its lock');
  }
  if (
    process.version !== `v${lock.nodeVersion}`
    || sha256Bytes(readFileSync(realpathSync(process.execPath)))
      !== lock.nodeExecutableSha256
  ) {
    throw new Error('federated tracker compiler parent Node does not match its lock');
  }

  const dependencyRoot = resolveLockedDirectory(
    bridgeRoot,
    lock.dependencyRootPath,
    'federated tracker compiler dependency root',
  );
  const runtimeDependencyPaths = lock.dependencyClasspath.map(entry => {
    const path = resolve(dependencyRoot, entry.name);
    if (
      !isInsidePath(path, dependencyRoot)
      || !existsSync(path)
      || lstatSync(path).isSymbolicLink()
      || !statSync(path).isFile()
      || realpathSync(path) !== path
      || sha256Bytes(readFileSync(path)) !== entry.sha256
    ) {
      throw new Error('federated tracker compiler dependency does not match its direct pin');
    }
    return path;
  });
  if (dependencyClasspathSha256(runtimeDependencyPaths)
      !== lock.dependencyClasspathSha256) {
    throw new Error('federated tracker compiler dependency classpath drifted');
  }

  const toolPath = resolveLockedFile(
    bridgeRoot,
    lock.toolPath,
    lock.toolSha256,
    'federated tracker compiler source',
  );
  const toolRoot = realpathSync(dirname(toolPath));
  const projectFiles = listProjectFiles(toolRoot);
  if (
    projectFiles.length !== 1
    || projectFiles[0] !== basename(toolPath)
  ) {
    throw new Error('federated tracker compiler project contains unreviewed files');
  }

  const javaHomeInput = process.env.JAVA_HOME;
  if (!javaHomeInput) {
    throw new Error('JAVA_HOME is required for federated tracker compilation');
  }
  const javaHome = realpathSync(javaHomeInput);
  if (hashDirectoryFiles(javaHome) !== lock.javaHomeSha256) {
    throw new Error('federated tracker compiler Java home does not match its lock');
  }
  for (const [name, digest] of [
    ['java', lock.javaExecutableSha256],
    ['javac', lock.javacExecutableSha256],
  ] as const) {
    const executable = realpathSync(resolve(
      javaHome,
      'bin',
      process.platform === 'win32' ? `${name}.exe` : name,
    ));
    if (sha256Bytes(readFileSync(executable)) !== digest) {
      throw new Error(`federated tracker compiler ${name} executable drifted`);
    }
  }
  return {
    bridgeRoot,
    lock,
    lockDigestHex: sha256CanonicalJson(lock, LOCK_DIGEST_DOMAIN),
    toolPath,
    runtimeDependencyPaths,
    javaHome,
  };
}

async function executeCompiler(
  runtime: LoadedCompilerRuntime,
  inputBytes: Buffer,
): Promise<Buffer> {
  const toolRoot = realpathSync(dirname(runtime.toolPath));
  const targetRootInput = resolve(toolRoot, 'target');
  if (existsSync(targetRootInput)) {
    const targetEntry = lstatSync(targetRootInput);
    if (targetEntry.isSymbolicLink() || !targetEntry.isDirectory()) {
      throw new Error('federated tracker compiler target must be a real directory');
    }
  } else {
    mkdirSync(targetRootInput);
  }
  const targetRoot = realpathSync(targetRootInput);
  if (
    targetRoot !== targetRootInput
    || !isInsidePath(targetRoot, toolRoot)
    || lstatSync(targetRootInput).isSymbolicLink()
  ) {
    throw new Error('federated tracker compiler target escapes its tool root');
  }
  const runRoot = mkdtempSync(resolve(targetRoot, 'process-run-'));
  if (
    !isInsidePath(runRoot, targetRoot)
    || realpathSync(runRoot) !== runRoot
    || lstatSync(runRoot).isSymbolicLink()
  ) {
    throw new Error('federated tracker compiler run directory escaped its target');
  }
  try {
    const snapshotRoot = resolve(runRoot, 'runtime');
    const dependencyRoot = resolve(snapshotRoot, 'dependencies');
    const sourceRoot = resolve(snapshotRoot, 'source');
    const classesRoot = resolve(snapshotRoot, 'classes');
    const javaHome = resolve(snapshotRoot, 'java-home');
    mkdirSync(dependencyRoot, { recursive: true });
    mkdirSync(sourceRoot, { recursive: true });
    mkdirSync(classesRoot, { recursive: true });
    cpSync(runtime.javaHome, javaHome, {
      recursive: true,
      force: false,
      errorOnExist: true,
      verbatimSymlinks: true,
    });
    const dependencyPaths = runtime.runtimeDependencyPaths.map(path => {
      const destination = resolve(dependencyRoot, basename(path));
      cpSync(path, destination, {
        force: false,
        errorOnExist: true,
        verbatimSymlinks: true,
      });
      return destination;
    });
    const sourcePath = resolve(sourceRoot, basename(runtime.toolPath));
    cpSync(runtime.toolPath, sourcePath, {
      force: false,
      errorOnExist: true,
      verbatimSymlinks: true,
    });
    assertRuntimeSnapshot(runtime, javaHome, dependencyPaths, sourcePath);
    makeFilesReadOnly(javaHome);
    makeFilesReadOnly(dependencyRoot);
    makeFilesReadOnly(sourceRoot);

    const inputPath = resolve(snapshotRoot, 'input.tsv');
    const outputPath = resolve(snapshotRoot, 'output.tsv');
    writeFileSync(inputPath, inputBytes, { flag: 'wx', mode: 0o600 });
    const inputSha256 = sha256Bytes(readFileSync(inputPath));
    const childEnvironment = safeChildEnvironment(snapshotRoot, javaHome);
    assertNoEnvironmentOverrides(
      childEnvironment,
      runtime.lock.forbiddenChildEnvironmentOverrides,
      'child',
    );
    const dependencyClasspath = dependencyPaths.join(delimiter);
    const javacExecutable = resolve(
      javaHome,
      'bin',
      process.platform === 'win32' ? 'javac.exe' : 'javac',
    );
    await execFileChecked(javacExecutable, [
      ...runtime.lock.javacArguments,
      '-classpath',
      dependencyClasspath,
      '-d',
      classesRoot,
      sourcePath,
    ], snapshotRoot, childEnvironment);
    if (hashDirectoryFiles(classesRoot)
        !== runtime.lock.compiledToolClassesSha256) {
      throw new Error('federated tracker compiler generated classes drifted');
    }
    makeFilesReadOnly(classesRoot);

    const javaExecutable = resolve(
      javaHome,
      'bin',
      process.platform === 'win32' ? 'java.exe' : 'java',
    );
    await execFileChecked(javaExecutable, [
      '-cp',
      [classesRoot, ...dependencyPaths].join(delimiter),
      runtime.lock.mainClass,
      '--input',
      inputPath,
      '--output',
      outputPath,
    ], snapshotRoot, childEnvironment);
    assertRuntimeSnapshot(runtime, javaHome, dependencyPaths, sourcePath);
    if (
      hashDirectoryFiles(classesRoot)
        !== runtime.lock.compiledToolClassesSha256
      || sha256Bytes(readFileSync(inputPath)) !== inputSha256
    ) {
      throw new Error('federated tracker compiler process inputs changed');
    }
    return readStableCompilerOutput(
      outputPath,
      runtime.lock.maximumOutputBytes,
    );
  } finally {
    try {
      makeFilesWritable(runRoot);
    } catch {
      // Cleanup remains best-effort for a partial failed snapshot.
    }
    rmSync(runRoot, { recursive: true, force: true });
  }
}

function assertRuntimeSnapshot(
  runtime: LoadedCompilerRuntime,
  javaHome: string,
  dependencyPaths: readonly string[],
  sourcePath: string,
): void {
  if (
    hashDirectoryFiles(runtime.javaHome) !== runtime.lock.javaHomeSha256
    || hashDirectoryFiles(javaHome) !== runtime.lock.javaHomeSha256
    || dependencyClasspathSha256(runtime.runtimeDependencyPaths)
      !== runtime.lock.dependencyClasspathSha256
    || dependencyClasspathSha256(dependencyPaths)
      !== runtime.lock.dependencyClasspathSha256
    || sha256Bytes(readFileSync(runtime.toolPath)) !== runtime.lock.toolSha256
    || sha256Bytes(readFileSync(sourcePath)) !== runtime.lock.toolSha256
  ) {
    throw new Error('federated tracker compiler runtime snapshot drifted');
  }
}

function safeChildEnvironment(
  runtimeRoot: string,
  javaHome: string,
): NodeJS.ProcessEnv {
  const directories = {
    USERPROFILE: resolve(runtimeRoot, 'home'),
    HOME: resolve(runtimeRoot, 'home'),
    APPDATA: resolve(runtimeRoot, 'appdata'),
    LOCALAPPDATA: resolve(runtimeRoot, 'localappdata'),
    TEMP: resolve(runtimeRoot, 'temp'),
    TMP: resolve(runtimeRoot, 'temp'),
  };
  for (const directory of new Set(Object.values(directories))) {
    mkdirSync(directory, { recursive: true });
  }
  const result: NodeJS.ProcessEnv = {
    PATH: resolve(javaHome, 'bin'),
    JAVA_HOME: javaHome,
    ...directories,
    NO_COLOR: '1',
  };
  for (const key of ['SystemRoot', 'SYSTEMROOT', 'PATHEXT']) {
    const value = process.env[key];
    if (typeof value === 'string' && value.length > 0) result[key] = value;
  }
  return result;
}

function execFileChecked(
  executable: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    execFile(executable, [...args], {
      cwd,
      env,
      timeout: 300_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      encoding: 'utf8',
    }, (error, stdout, stderr) => {
      if (!error) {
        resolvePromise();
        return;
      }
      const detail = `${stdout}\n${stderr}`
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .slice(-3)
        .join(' | ')
        .replace(/[A-Za-z]:[\\/][^\s)]+/g, '<local-path>');
      reject(new Error(
        `federated tracker compiler process failed (${error.code ?? 'unknown'})`
        + (detail ? `: ${detail}` : ''),
      ));
    });
  });
}

function readStableCompilerOutput(path: string, maximumBytes: number): Buffer {
  if (!existsSync(path)) {
    throw new Error('federated tracker compiler did not create an output file');
  }
  const pathEntry = lstatSync(path);
  if (pathEntry.isSymbolicLink() || !pathEntry.isFile()) {
    throw new Error('federated tracker compiler output must be a real file');
  }
  const descriptor = openSync(path, constants.O_RDONLY);
  try {
    const before = fstatSync(descriptor);
    if (
      !before.isFile()
      || before.size <= 0
      || before.size > maximumBytes
    ) {
      throw new Error('federated tracker compiler output exceeds its lock');
    }
    const output = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const current = lstatSync(path);
    if (
      current.isSymbolicLink()
      || !current.isFile()
      || output.length !== before.size
      || !sameFileState(before, after)
      || !sameFileState(after, current)
    ) {
      throw new Error('federated tracker compiler output changed while being read');
    }
    return output;
  } finally {
    closeSync(descriptor);
  }
}

function sameFileState(
  left: ReturnType<typeof fstatSync>,
  right: ReturnType<typeof fstatSync>,
): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function resolveLockedDirectory(
  bridgeRoot: string,
  relativePath: string,
  label: string,
): string {
  if (
    isAbsolute(relativePath)
    || relativePath.includes('\\')
    || relativePath.split('/').includes('..')
  ) {
    throw new Error(`${label} path is not canonical`);
  }
  const requested = resolve(bridgeRoot, relativePath);
  if (!isInsidePath(requested, bridgeRoot) || !existsSync(requested)) {
    throw new Error(`${label} is missing; run npm run compiler:runtime-bundle`);
  }
  const entry = lstatSync(requested);
  const path = realpathSync(requested);
  if (
    entry.isSymbolicLink()
    || !entry.isDirectory()
    || path !== requested
    || !isInsidePath(path, bridgeRoot)
  ) {
    throw new Error(`${label} must be a real repository directory`);
  }
  return path;
}

function resolveLockedFile(
  bridgeRoot: string,
  relativePath: string,
  expectedSha256: string,
  label: string,
): string {
  if (
    isAbsolute(relativePath)
    || relativePath.includes('\\')
    || relativePath.split('/').includes('..')
  ) {
    throw new Error(`${label} path is not canonical`);
  }
  const requested = resolve(bridgeRoot, relativePath);
  if (!isInsidePath(requested, bridgeRoot) || !existsSync(requested)) {
    throw new Error(`${label} path is missing or escapes the bridge repository`);
  }
  const path = realpathSync(requested);
  if (
    !isInsidePath(path, bridgeRoot)
    || !statSync(path).isFile()
    || sha256Bytes(readFileSync(path)) !== expectedSha256
  ) {
    throw new Error(`${label} does not match its SHA-256 lock`);
  }
  return path;
}

function listProjectFiles(root: string, cursor: string = root): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(cursor, { withFileTypes: true })) {
    if (entry.name === 'target') continue;
    const path = resolve(cursor, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error('federated tracker compiler project contains a symbolic link');
    }
    if (entry.isDirectory()) files.push(...listProjectFiles(root, path));
    else if (entry.isFile()) files.push(relative(root, path).replace(/\\/g, '/'));
    else throw new Error('federated tracker compiler project contains an unsupported entry');
  }
  return files.sort();
}

function dependencyClasspathSha256(paths: readonly string[]): string {
  const records = paths.map((path, index) => {
    if (!statSync(path).isFile()) {
      throw new Error('federated tracker compiler dependency is not a file');
    }
    return `${index}\tfile\t${basename(path)}\t${sha256Bytes(readFileSync(path))}`;
  });
  return sha256Bytes(Buffer.from(records.join('\n'), 'utf8'));
}

function hashDirectoryFiles(root: string): string {
  const records = listAllRegularFiles(root)
    .map(path => (
      `${relative(root, path).replace(/\\/g, '/')}:${sha256Bytes(readFileSync(path))}`
    ))
    .sort();
  if (records.length === 0) throw new Error('hashed directory contains no files');
  return sha256Bytes(Buffer.from(records.join('\n'), 'utf8'));
}

function listAllRegularFiles(root: string, cursor: string = root): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(cursor, { withFileTypes: true })) {
    const path = resolve(cursor, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error('runtime snapshot must not contain symbolic links');
    }
    if (entry.isDirectory()) files.push(...listAllRegularFiles(root, path));
    else if (entry.isFile()) files.push(path);
    else throw new Error('runtime snapshot contains an unsupported entry');
  }
  return files;
}

function makeFilesReadOnly(root: string): void {
  for (const path of listAllRegularFiles(root)) chmodSync(path, 0o444);
}

function makeFilesWritable(root: string): void {
  if (!existsSync(root)) return;
  for (const path of listAllRegularFiles(root)) chmodSync(path, 0o666);
}

function assertNoEnvironmentOverrides(
  env: NodeJS.ProcessEnv,
  forbidden: readonly string[],
  label: string,
): void {
  for (const key of forbidden) {
    if (env[key] !== undefined) {
      throw new Error(`federated tracker compiler ${label} environment contains ${key}`);
    }
  }
}

function receiptBoundaries() {
  return deepFreeze({
    profileActivated: false as const,
    targetGenesisBoxObserved: false as const,
    targetNetworkIdentityAuthenticated: false as const,
    jvmCompilationReplayed: true as const,
    compilerReceiptAuthenticated: true as const,
    trustedHostRequired: true as const,
    concurrentSameUserTamperingOutOfScope: true as const,
    nodeCheckPerformed: false as const,
    targetNodeAcceptanceEstablished: false as const,
    signingAuthorityEstablished: false as const,
    submissionAuthorityEstablished: false as const,
    broadcastAuthorityEstablished: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
  });
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (
    actual.length !== canonical.length
    || actual.some((key, index) => key !== canonical[index])
  ) {
    throw new Error(`${label} fields are not exact`);
  }
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be canonical positive decimal text`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || String(parsed) !== value) {
    throw new Error(`${label} must encode a positive safe integer`);
  }
  return parsed;
}

function fixedSha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256_HEX.test(value)) {
    throw new Error(`${label} must be lowercase SHA-256 hex`);
  }
  return value;
}

function variableHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !VARIABLE_HEX.test(value)) {
    throw new Error(`${label} must be nonempty lowercase bytes`);
  }
  return value;
}

function sha256Bytes(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function blake2b256Hex(value: Buffer): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function isInsidePath(candidate: string, parent: string): boolean {
  const relation = relative(parent, candidate);
  return relation === '' || (
    !relation.startsWith('..')
    && !isAbsolute(relation)
  );
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value !== null && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child, seen);
    }
    Object.freeze(value);
  }
  return value;
}
