import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  parse,
  relative,
  resolve,
} from 'node:path';

import {
  validatePinnedAuthenticatedV2ParentRuntime,
  type VerifiedParentRuntime,
} from './authenticated-v2-source-tree-conformance.js';
import {
  resolveBridgeRepositoryRootsFromCheckoutLayout,
} from './bridge-repository-layout.js';
import {
  canonicalPathIdentity,
  isPathInside,
  readBoundedRegularFile,
} from './create-only-out-of-repository-artifact.js';
import {
  assertNoDuplicateJsonKeys,
  canonicalJson,
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';
import { runBoundedProcess } from './pinned-local-native-verifier-build.js';
import {
  inspectSubstrateFederatedAuthoritySafePinnedToolchainV1,
} from './substrate-federated-authority-safe-devnet-build-environment-v1.js';
import {
  inspectSubstrateFederatedAuthoritySafePinnedProtocV1,
} from './substrate-federated-authority-safe-devnet-protoc-v1.js';
import {
  inspectSubstrateFederatedIsolatedDevnetErgoNodeBuildLockV1,
} from './substrate-federated-isolated-devnet-ergo-node-build-v1.js';

export const SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_INVOCATION_V1_SCHEMA =
  'e2s.substrate-federated-native-two-cycle-invocation.v1' as const;
export const SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_RESULT_V1_SCHEMA =
  'e2s.substrate-federated-native-two-cycle-result.v1' as const;

const PROFILE = 'synthetic-loopback-two-cycle' as const;
const MAX_CONFIG_BYTES = 32 * 1024;
const GIT_TIMEOUT_MS = 30_000;
const MAX_GIT_OUTPUT_BYTES = 1024 * 1024;
const RESULT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_RESULT_V1';
const PATH_IDENTITY_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PATH_IDENTITY_V1';
const TOOL_IDENTITY_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_TOOL_IDENTITY_V1';

const CONFIG_KEYS = Object.freeze([
  'schema',
  'version',
  'profile',
  'expectedBridgeCommit',
  'bridgeRoot',
  'frontierSourcePath',
  'frontierBuildParentDirectory',
  'frontierCargoHomeDirectory',
  'frontierCargoExecutablePath',
  'frontierRustcExecutablePath',
  'frontierGitExecutablePath',
  'frontierProtocExecutablePath',
  'ergoSourcePath',
  'ergoGitExecutablePath',
  'ergoJavaExecutablePath',
  'ergoSbtLauncherJarPath',
  'outputParentDirectory',
  'attemptName',
] as const);

export interface SubstrateFederatedNativeTwoCycleInvocationV1Config {
  readonly schema: typeof SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_INVOCATION_V1_SCHEMA;
  readonly version: 1;
  readonly profile: typeof PROFILE;
  readonly expectedBridgeCommit: string;
  readonly bridgeRoot: string;
  readonly frontierSourcePath: string;
  readonly frontierBuildParentDirectory: string;
  readonly frontierCargoHomeDirectory: string;
  readonly frontierCargoExecutablePath: string;
  readonly frontierRustcExecutablePath: string;
  readonly frontierGitExecutablePath: string;
  readonly frontierProtocExecutablePath: string;
  readonly ergoSourcePath: string;
  readonly ergoGitExecutablePath: string;
  readonly ergoJavaExecutablePath: string;
  readonly ergoSbtLauncherJarPath: string;
  readonly outputParentDirectory: string;
  readonly attemptName: string;
}

export interface LoadedSubstrateFederatedNativeTwoCycleInvocationV1 {
  readonly config: Readonly<SubstrateFederatedNativeTwoCycleInvocationV1Config>;
  readonly configBytes: Uint8Array;
  readonly configSha256Hex: string;
  readonly configCanonicalPath: string;
  readonly worktreeRoot: string;
  readonly attemptPath: string;
  readonly pathIdentityDigestHex: string;
  readonly rootInput: Readonly<{
    readonly frontierBuild: Readonly<{
      readonly bridgeRoot: string;
      readonly frontierSourcePath: string;
      readonly buildParentDirectory: string;
      readonly cargoHomeDirectory: string;
      readonly cargoExecutablePath: string;
      readonly rustcExecutablePath: string;
      readonly gitExecutablePath: string;
      readonly protocExecutablePath: string;
    }>;
    readonly ergoBuild: Readonly<{
      readonly worktreeRoot: string;
      readonly bridgeRoot: string;
      readonly ergoSourcePath: string;
      readonly gitExecutablePath: string;
      readonly javaExecutablePath: string;
      readonly sbtLauncherJarPath: string;
    }>;
  }>;
}

export interface SubstrateFederatedNativeTwoCycleEnvironmentV1 {
  readonly repository: Readonly<{
    readonly commit: string;
    readonly tree: string;
    readonly clean: true;
  }>;
  readonly runtime: Readonly<VerifiedParentRuntime>;
  readonly toolIdentityDigestHex: string;
}

export interface SubstrateFederatedNativeTwoCycleResultV1 {
  readonly schema: typeof SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_RESULT_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'two_cycle_local_synthetic_execution_completed';
  readonly rootResultDigestHex: string;
  readonly genesis: Readonly<{
    readonly nativeGenesisHashHex: string;
    readonly typedGenesisSha256Hex: string;
    readonly rawSpecSha256Hex: string;
    readonly runtimeProfileIdHex: string;
    readonly familyIdHex: string;
    readonly sourceProofProfileIdHex: string;
    readonly nodeSha256Hex: string;
    readonly wasmSha256Hex: string;
    readonly operatorAddressHex: string;
    readonly storageKeysChecked: number;
  }>;
  readonly issuance: Readonly<{
    readonly inputBoxIds: readonly string[];
    readonly transactionIds: readonly string[];
    readonly confirmationHeights: readonly number[];
  }>;
  readonly firstCycle: Readonly<{
    readonly pegIn: Readonly<Record<string, string>>;
    readonly mintIdentityHex: string;
    readonly sourceProofReceiptDigestHex: string;
    readonly amountNanoErg: string;
    readonly burnGrossAmountNanoErg: string;
    readonly burnNetAmountNanoErg: string;
    readonly trackerTransactionIdHex: string;
    readonly payoutTransactionIdHex: string;
    readonly payoutAmountNanoErg: string;
  }>;
  readonly secondCycle: Readonly<{
    readonly pegIn: Readonly<Record<string, string>>;
    readonly mintIdentityHex: string;
    readonly sourceProofReceiptDigestHex: string;
    readonly amountNanoErg: string;
    readonly burnGrossAmountNanoErg: string;
    readonly burnNetAmountNanoErg: string;
    readonly trackerTransactionIdHex: string;
    readonly payoutTransactionIdHex: string;
    readonly payoutAmountNanoErg: string;
  }>;
  readonly checks: Readonly<{
    readonly completedCycles: 2;
    readonly nativeAndErgoCleanupCompletedBeforeReturn: true;
    readonly cycleIdentitiesDistinct: true;
    readonly createOnlyWorkerTransportRequired: true;
  }>;
  readonly boundaries: Readonly<{
    readonly fixedSyntheticLoopbackProfile: true;
    readonly trustedHostAndCachesRequired: true;
    readonly independentlyReproducibleBuildEstablished: false;
    readonly independentOperatorCustodyEstablished: false;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly releaseReadinessEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

export function loadSubstrateFederatedNativeTwoCycleInvocationV1(
  configPathInput: string,
  expectedExistingAttemptPath?: string,
): Readonly<LoadedSubstrateFederatedNativeTwoCycleInvocationV1> {
  const configPath = existingPath(configPathInput, 'invocation config', 'file');
  const loaded = readBoundedRegularFile(
    configPath,
    'native two-cycle invocation config',
    MAX_CONFIG_BYTES,
  );
  const configText = decodeUtf8(loaded.bytes, 'native two-cycle invocation config');
  assertNoDuplicateJsonKeys(configText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(configText) as unknown;
  } catch {
    throw new Error('native two-cycle invocation config is invalid JSON');
  }
  const raw = exactRecord(parsed, CONFIG_KEYS, 'native two-cycle invocation config');
  if (
    raw.schema !== SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_INVOCATION_V1_SCHEMA
    || raw.version !== 1
    || raw.profile !== PROFILE
  ) {
    throw new Error('native two-cycle invocation config identity is unsupported');
  }
  const expectedBridgeCommit = fixedLowerHex(
    raw.expectedBridgeCommit,
    20,
    'expected bridge commit',
  );
  const bridgeRoot = existingPath(raw.bridgeRoot, 'bridge root', 'directory');
  const roots = resolveBridgeRepositoryRootsFromCheckoutLayout(bridgeRoot);
  if (!samePath(roots.bridgeRoot, bridgeRoot)) {
    throw new Error('bridge root differs from the checkout layout');
  }
  const frontierSourcePath = existingPath(
    raw.frontierSourcePath,
    'Frontier source',
    'directory',
  );
  const frontierBuildParentDirectory = existingPath(
    raw.frontierBuildParentDirectory,
    'Frontier build parent',
    'directory',
  );
  const frontierCargoHomeDirectory = existingPath(
    raw.frontierCargoHomeDirectory,
    'Frontier Cargo home',
    'directory',
  );
  const frontierCargoExecutablePath = existingPath(
    raw.frontierCargoExecutablePath,
    'Cargo executable',
    'file',
  );
  const frontierRustcExecutablePath = existingPath(
    raw.frontierRustcExecutablePath,
    'Rust compiler executable',
    'file',
  );
  const frontierGitExecutablePath = existingPath(
    raw.frontierGitExecutablePath,
    'Frontier Git executable',
    'file',
  );
  const frontierProtocExecutablePath = existingPath(
    raw.frontierProtocExecutablePath,
    'Protobuf compiler executable',
    'file',
  );
  const ergoSourcePath = existingPath(raw.ergoSourcePath, 'Ergo source', 'directory');
  const ergoGitExecutablePath = existingPath(
    raw.ergoGitExecutablePath,
    'Ergo Git executable',
    'file',
  );
  const ergoJavaExecutablePath = existingPath(
    raw.ergoJavaExecutablePath,
    'Java executable',
    'file',
  );
  const ergoSbtLauncherJarPath = existingPath(
    raw.ergoSbtLauncherJarPath,
    'sbt launcher JAR',
    'file',
  );
  const outputParentDirectory = existingPath(
    raw.outputParentDirectory,
    'invocation output parent',
    'directory',
  );
  const attemptName = boundedAttemptName(raw.attemptName);
  const attemptPath = resolve(outputParentDirectory, attemptName);
  if (expectedExistingAttemptPath === undefined && existsSync(attemptPath)) {
    throw new Error('native two-cycle invocation attempt must be absent');
  }
  if (expectedExistingAttemptPath !== undefined) {
    const expectedAttempt = existingPath(
      expectedExistingAttemptPath,
      'existing invocation attempt',
      'directory',
    );
    if (!samePath(expectedAttempt, attemptPath)) {
      throw new Error('existing invocation attempt differs from the captured config');
    }
    if (!samePath(configPath, resolve(attemptPath, 'config.json'))) {
      throw new Error('worker config must be the captured attempt config');
    }
  } else if (isPathInside(roots.worktreeRoot, configPath)
    || isPathInside(bridgeRoot, configPath)) {
    throw new Error('original invocation config must be outside the checkout');
  }

  const config: SubstrateFederatedNativeTwoCycleInvocationV1Config = Object.freeze({
    schema: SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_INVOCATION_V1_SCHEMA,
    version: 1,
    profile: PROFILE,
    expectedBridgeCommit,
    bridgeRoot,
    frontierSourcePath,
    frontierBuildParentDirectory,
    frontierCargoHomeDirectory,
    frontierCargoExecutablePath,
    frontierRustcExecutablePath,
    frontierGitExecutablePath,
    frontierProtocExecutablePath,
    ergoSourcePath,
    ergoGitExecutablePath,
    ergoJavaExecutablePath,
    ergoSbtLauncherJarPath,
    outputParentDirectory,
    attemptName,
  });
  assertRequiredPathRelationships(config, roots.worktreeRoot, attemptPath);
  const pathIdentityDigestHex = sha256CanonicalJson({
    bridgeRoot,
    worktreeRoot: roots.worktreeRoot,
    frontierSourcePath,
    frontierBuildParentDirectory,
    frontierCargoHomeDirectory,
    frontierCargoExecutablePath,
    frontierRustcExecutablePath,
    frontierGitExecutablePath,
    frontierProtocExecutablePath,
    ergoSourcePath,
    ergoGitExecutablePath,
    ergoJavaExecutablePath,
    ergoSbtLauncherJarPath,
    outputParentDirectory,
    attemptPath,
  }, PATH_IDENTITY_DIGEST_DOMAIN);
  return Object.freeze({
    config,
    configBytes: loaded.bytes,
    configSha256Hex: sha256(loaded.bytes),
    configCanonicalPath: loaded.canonicalPath,
    worktreeRoot: roots.worktreeRoot,
    attemptPath,
    pathIdentityDigestHex,
    rootInput: Object.freeze({
      frontierBuild: Object.freeze({
        bridgeRoot,
        frontierSourcePath,
        buildParentDirectory: frontierBuildParentDirectory,
        cargoHomeDirectory: frontierCargoHomeDirectory,
        cargoExecutablePath: frontierCargoExecutablePath,
        rustcExecutablePath: frontierRustcExecutablePath,
        gitExecutablePath: frontierGitExecutablePath,
        protocExecutablePath: frontierProtocExecutablePath,
      }),
      ergoBuild: Object.freeze({
        worktreeRoot: roots.worktreeRoot,
        bridgeRoot,
        ergoSourcePath,
        gitExecutablePath: ergoGitExecutablePath,
        javaExecutablePath: ergoJavaExecutablePath,
        sbtLauncherJarPath: ergoSbtLauncherJarPath,
      }),
    }),
  });
}

export async function validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1(
  invocation: Readonly<LoadedSubstrateFederatedNativeTwoCycleInvocationV1>,
): Promise<Readonly<SubstrateFederatedNativeTwoCycleEnvironmentV1>> {
  revalidateLoadedInvocation(invocation);
  const runtime = validatePinnedAuthenticatedV2ParentRuntime(
    invocation.config.bridgeRoot,
  );
  if (
    !samePath(runtime.gitExecutablePath, invocation.config.frontierGitExecutablePath)
    || !samePath(runtime.gitExecutablePath, invocation.config.ergoGitExecutablePath)
  ) {
    throw new Error('invocation Git paths differ from the pinned parent runtime');
  }
  const repository = await inspectCleanRepository(
    invocation.worktreeRoot,
    runtime.gitExecutablePath,
    invocation.config.expectedBridgeCommit,
  );
  const frontier = await inspectSubstrateFederatedAuthoritySafePinnedToolchainV1({
    bridgeRoot: invocation.config.bridgeRoot,
    cargoExecutablePath: invocation.config.frontierCargoExecutablePath,
    rustcExecutablePath: invocation.config.frontierRustcExecutablePath,
    gitExecutablePath: invocation.config.frontierGitExecutablePath,
    cwd: invocation.config.frontierSourcePath,
  });
  const protoc = inspectPinnedProtoc(invocation.config);
  const ergoLock = inspectSubstrateFederatedIsolatedDevnetErgoNodeBuildLockV1(
    invocation.config.bridgeRoot,
  );
  const javaHome = javaHomeFromExecutable(invocation.config.ergoJavaExecutablePath);
  if (
    sha256(readFileSync(invocation.config.ergoGitExecutablePath))
      !== ergoLock.gitExecutableSha256Hex
    || sha256(readFileSync(invocation.config.ergoSbtLauncherJarPath))
      !== ergoLock.sbtLauncherJarSha256Hex
    || hashDirectoryFiles(javaHome) !== ergoLock.javaHomeSha256Hex
  ) {
    throw new Error('invocation Ergo build tools differ from committed locks');
  }
  const toolIdentityDigestHex = sha256CanonicalJson({
    nodeVersion: runtime.nodeVersion,
    nodeExecutableSha256: runtime.nodeExecutableSha256,
    relayerPackageLockSha256: runtime.relayerPackageLockSha256,
    parentRuntimePackagesValidated: runtime.parentRuntimePackagesValidated,
    loaderInvocationValidated: runtime.loaderInvocationValidated,
    gitVersion: runtime.gitVersion,
    gitExecutableSha256: runtime.gitExecutableSha256,
    frontier,
    protoc: {
      platformKey: protoc.platformKey,
      version: protoc.version,
      sha256Hex: protoc.sha256Hex,
    },
    ergo: {
      gitVersion: ergoLock.gitVersion,
      gitExecutableSha256Hex: ergoLock.gitExecutableSha256Hex,
      javaHomeSha256Hex: ergoLock.javaHomeSha256Hex,
      sbtLauncherJarSha256Hex: ergoLock.sbtLauncherJarSha256Hex,
      projectSbtVersion: ergoLock.projectSbtVersion,
    },
  }, TOOL_IDENTITY_DIGEST_DOMAIN);
  revalidateLoadedInvocation(invocation);
  return Object.freeze({ repository, runtime, toolIdentityDigestHex });
}

export function projectSubstrateFederatedNativeTwoCycleResultV1(
  value: unknown,
): Readonly<SubstrateFederatedNativeTwoCycleResultV1> {
  assertPlainSerializablePathFree(value, 'native two-cycle root result');
  const root = exactRecord(value, [
    'status', 'nativeGenesisHashHex', 'typedGenesisSha256Hex',
    'rawSpecSha256Hex', 'runtimeProfileIdHex', 'familyIdHex',
    'sourceProofProfileIdHex', 'nodeSha256Hex', 'wasmSha256Hex',
    'operatorAddressHex', 'storageKeysChecked', 'issuanceInputBoxIds',
    'issuedTransactions', 'pegIn', 'mint', 'burn', 'unsignedIssuance',
    'frontierProcess', 'ergoExecution', 'withdrawal', 'completedCycles',
    'secondCycle', 'singletonIssuanceEstablished',
    'operationalMintEstablished', 'canonicalPayoutEstablished',
    'sourceFinalityEstablished', 'trustless',
  ], 'native two-cycle root result');
  if (
    root.status !== 'fresh-federated-round-trip-confirmed'
    || root.completedCycles !== 2
    || root.singletonIssuanceEstablished !== true
    || root.operationalMintEstablished !== true
    || root.canonicalPayoutEstablished !== true
    || root.sourceFinalityEstablished !== false
    || root.trustless !== false
  ) {
    throw new Error('native two-cycle root result did not complete its fixed profile');
  }
  const genesis = Object.freeze({
    nativeGenesisHashHex: fixedHexFlexible(root.nativeGenesisHashHex, 32, 'native genesis hash'),
    typedGenesisSha256Hex: fixedLowerHex(root.typedGenesisSha256Hex, 32, 'typed genesis SHA-256'),
    rawSpecSha256Hex: fixedLowerHex(root.rawSpecSha256Hex, 32, 'raw spec SHA-256'),
    runtimeProfileIdHex: fixedHexFlexible(root.runtimeProfileIdHex, 32, 'runtime profile ID'),
    familyIdHex: fixedHexFlexible(root.familyIdHex, 32, 'family ID'),
    sourceProofProfileIdHex: fixedHexFlexible(root.sourceProofProfileIdHex, 32, 'source proof profile ID'),
    nodeSha256Hex: fixedLowerHex(root.nodeSha256Hex, 32, 'node SHA-256'),
    wasmSha256Hex: fixedLowerHex(root.wasmSha256Hex, 32, 'WASM SHA-256'),
    operatorAddressHex: fixedHexFlexible(root.operatorAddressHex, 20, 'operator address'),
    storageKeysChecked: positiveSafeInteger(root.storageKeysChecked, 'storage key count'),
  });
  const inputBoxIds = fixedHexArray(root.issuanceInputBoxIds, 3, 'issuance input box IDs');
  const transactions = issuanceTransactions(root.issuedTransactions);
  unsignedIssuance(root.unsignedIssuance, transactions.transactionIds);
  const firstPegIn = pegIn(root.pegIn, 'first cycle peg-in');
  const firstMint = firstCycleMint(root.mint, firstPegIn);
  const firstBurn = firstCycleBurn(root.burn);
  const firstWithdrawal = cycleReturn(root.withdrawal, 'first cycle return', true);
  const second = exactRecord(root.secondCycle, [
    'pegIn', 'mint', 'burn', 'checkpoint', 'feeFunding', 'anchor',
    'tracker', 'payout', 'confirmationExecution',
  ], 'second cycle');
  const secondPegIn = pegIn(second.pegIn, 'second cycle peg-in');
  const secondMint = secondCycleMint(second.mint, secondPegIn);
  const secondBurn = secondCycleBurn(second.burn);
  const secondReturn = cycleReturn({
    checkpoint: second.checkpoint,
    feeFunding: second.feeFunding,
    anchor: second.anchor,
    tracker: second.tracker,
    payout: second.payout,
    confirmationExecution: second.confirmationExecution,
  }, 'second cycle return');
  if (
    firstPegIn.mintIdentityHex === secondPegIn.mintIdentityHex
    || firstPegIn.sourceLockTransactionIdHex === secondPegIn.sourceLockTransactionIdHex
    || firstPegIn.reserveTransitionTransactionIdHex === secondPegIn.reserveTransitionTransactionIdHex
    || firstWithdrawal.trackerTransactionIdHex === secondReturn.trackerTransactionIdHex
    || firstWithdrawal.payoutTransactionIdHex === secondReturn.payoutTransactionIdHex
  ) {
    throw new Error('native two-cycle identities must be distinct');
  }
  if (
    firstMint.amountNanoErg !== '20000000'
    || secondMint.amountNanoErg !== firstMint.amountNanoErg
    || firstBurn.grossAmountNanoErg !== '15000000'
    || secondBurn.grossAmountNanoErg !== firstBurn.grossAmountNanoErg
    || firstBurn.netAmountNanoErg !== '10000000'
    || secondBurn.netAmountNanoErg !== firstBurn.netAmountNanoErg
    || firstWithdrawal.payoutAmountNanoErg !== firstBurn.netAmountNanoErg
    || secondReturn.payoutAmountNanoErg !== secondBurn.netAmountNanoErg
  ) throw new Error('native two-cycle fixed value conservation changed');
  const body = {
    schema: SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_RESULT_V1_SCHEMA,
    version: 1 as const,
    status: 'two_cycle_local_synthetic_execution_completed' as const,
    rootResultDigestHex: sha256CanonicalJson(root, RESULT_DIGEST_DOMAIN),
    genesis,
    issuance: Object.freeze({
      inputBoxIds,
      transactionIds: transactions.transactionIds,
      confirmationHeights: transactions.confirmationHeights,
    }),
    firstCycle: Object.freeze({
      pegIn: firstPegIn,
      mintIdentityHex: firstMint.mintIdentityHex,
      sourceProofReceiptDigestHex: firstMint.sourceProofReceiptDigestHex,
      amountNanoErg: firstMint.amountNanoErg,
      burnGrossAmountNanoErg: firstBurn.grossAmountNanoErg,
      burnNetAmountNanoErg: firstBurn.netAmountNanoErg,
      ...firstWithdrawal,
    }),
    secondCycle: Object.freeze({
      pegIn: secondPegIn,
      mintIdentityHex: secondMint.mintIdentityHex,
      sourceProofReceiptDigestHex: secondPegIn.sourceProofReceiptDigestHex,
      amountNanoErg: secondMint.amountNanoErg,
      burnGrossAmountNanoErg: secondBurn.grossAmountNanoErg,
      burnNetAmountNanoErg: secondBurn.netAmountNanoErg,
      ...secondReturn,
    }),
    checks: Object.freeze({
      completedCycles: 2 as const,
      nativeAndErgoCleanupCompletedBeforeReturn: true as const,
      cycleIdentitiesDistinct: true as const,
      createOnlyWorkerTransportRequired: true as const,
    }),
    boundaries: Object.freeze({
      fixedSyntheticLoopbackProfile: true as const,
      trustedHostAndCachesRequired: true as const,
      independentlyReproducibleBuildEstablished: false as const,
      independentOperatorCustodyEstablished: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      releaseReadinessEstablished: false as const,
      productionReadinessEstablished: false as const,
    }),
  };
  return Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, RESULT_DIGEST_DOMAIN),
  });
}

function revalidateLoadedInvocation(
  invocation: Readonly<LoadedSubstrateFederatedNativeTwoCycleInvocationV1>,
): void {
  const current = readBoundedRegularFile(
    invocation.configCanonicalPath,
    'native two-cycle invocation config',
    MAX_CONFIG_BYTES,
  );
  if (
    sha256(current.bytes) !== invocation.configSha256Hex
    || !Buffer.from(current.bytes).equals(Buffer.from(invocation.configBytes))
  ) {
    throw new Error('native two-cycle invocation config changed');
  }
  for (const [value, label, kind] of [
    [invocation.config.bridgeRoot, 'bridge root', 'directory'],
    [invocation.worktreeRoot, 'worktree root', 'directory'],
    [invocation.config.frontierSourcePath, 'Frontier source', 'directory'],
    [invocation.config.frontierBuildParentDirectory, 'Frontier build parent', 'directory'],
    [invocation.config.frontierCargoHomeDirectory, 'Frontier Cargo home', 'directory'],
    [invocation.config.frontierCargoExecutablePath, 'Cargo executable', 'file'],
    [invocation.config.frontierRustcExecutablePath, 'Rust compiler executable', 'file'],
    [invocation.config.frontierGitExecutablePath, 'Frontier Git executable', 'file'],
    [invocation.config.frontierProtocExecutablePath, 'Protobuf compiler executable', 'file'],
    [invocation.config.ergoSourcePath, 'Ergo source', 'directory'],
    [invocation.config.ergoGitExecutablePath, 'Ergo Git executable', 'file'],
    [invocation.config.ergoJavaExecutablePath, 'Java executable', 'file'],
    [invocation.config.ergoSbtLauncherJarPath, 'sbt launcher JAR', 'file'],
    [invocation.config.outputParentDirectory, 'invocation output parent', 'directory'],
  ] as const) {
    if (!samePath(existingPath(value, label, kind), value)) {
      throw new Error(`${label} identity changed`);
    }
  }
}

async function inspectCleanRepository(
  worktreeRoot: string,
  gitExecutablePath: string,
  expectedCommit: string,
): Promise<Readonly<{ commit: string; tree: string; clean: true }>> {
  const git = async (args: readonly string[], label: string): Promise<string> => {
    const result = await runBoundedProcess({
      executablePath: gitExecutablePath,
      args: ['-C', worktreeRoot, ...args],
      cwd: worktreeRoot,
      env: minimalGitEnvironment(gitExecutablePath),
      timeoutMs: GIT_TIMEOUT_MS,
      maxOutputBytes: MAX_GIT_OUTPUT_BYTES,
      label,
    });
    if (result.stderr !== '') throw new Error(`${label} emitted diagnostics`);
    return result.stdout;
  };
  const commit = (await git(['rev-parse', '--verify', 'HEAD'], 'bridge HEAD inspection')).trim();
  if (commit !== expectedCommit) throw new Error('bridge HEAD differs from the expected commit');
  const tree = (await git(['rev-parse', '--verify', 'HEAD^{tree}'], 'bridge tree inspection')).trim();
  fixedLowerHex(tree, 20, 'bridge tree');
  const status = await git(
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    'bridge cleanliness inspection',
  );
  if (status !== '') throw new Error('bridge checkout must have no tracked or untracked changes');
  return Object.freeze({ commit, tree, clean: true as const });
}

function inspectPinnedProtoc(
  config: Readonly<SubstrateFederatedNativeTwoCycleInvocationV1Config>,
) {
  const original = process.env.PROTOC;
  process.env.PROTOC = config.frontierProtocExecutablePath;
  try {
    const observation = inspectSubstrateFederatedAuthoritySafePinnedProtocV1({
      bridgeRoot: config.bridgeRoot,
      cwd: config.frontierSourcePath,
    });
    if (!samePath(observation.executablePath, config.frontierProtocExecutablePath)) {
      throw new Error('Protobuf compiler path differs from the invocation config');
    }
    return observation;
  } finally {
    if (original === undefined) delete process.env.PROTOC;
    else process.env.PROTOC = original;
  }
}

function assertRequiredPathRelationships(
  config: Readonly<SubstrateFederatedNativeTwoCycleInvocationV1Config>,
  worktreeRoot: string,
  attemptPath: string,
): void {
  const protectedPaths = [
    worktreeRoot,
    config.bridgeRoot,
    config.frontierSourcePath,
    config.frontierBuildParentDirectory,
    config.frontierCargoHomeDirectory,
    dirname(config.frontierCargoExecutablePath),
    dirname(config.frontierRustcExecutablePath),
    dirname(config.frontierGitExecutablePath),
    dirname(config.frontierProtocExecutablePath),
    config.ergoSourcePath,
    javaHomeFromExecutable(config.ergoJavaExecutablePath),
    dirname(config.ergoSbtLauncherJarPath),
  ];
  for (const path of protectedPaths) {
    if (pathsOverlap(attemptPath, path)) {
      throw new Error('native two-cycle attempt must not overlap repository, source, cache, build or tool paths');
    }
  }
  const mutableRoots = [config.frontierBuildParentDirectory,
    config.frontierCargoHomeDirectory, config.outputParentDirectory];
  const immutableRoots = [worktreeRoot, config.bridgeRoot,
    config.frontierSourcePath, config.ergoSourcePath,
    dirname(config.frontierCargoExecutablePath), dirname(config.frontierRustcExecutablePath),
    dirname(config.frontierGitExecutablePath), dirname(config.frontierProtocExecutablePath),
    javaHomeFromExecutable(config.ergoJavaExecutablePath), dirname(config.ergoSbtLauncherJarPath)];
  for (const [index, mutable] of mutableRoots.entries()) {
    if ([...immutableRoots, ...mutableRoots.slice(index + 1)]
      .some(protectedRoot => pathsOverlap(mutable, protectedRoot))) {
      throw new Error('build, cache and output roots must not overlap repository, source, tools or each other');
    }
  }
  if ([config.frontierSourcePath, config.ergoSourcePath]
    .some(source => pathsOverlap(source, worktreeRoot) || pathsOverlap(source, config.bridgeRoot))
    || pathsOverlap(config.frontierSourcePath, config.ergoSourcePath)) {
    throw new Error('source roots must not overlap the bridge checkout or each other');
  }
}

function issuanceTransactions(value: unknown): Readonly<{
  transactionIds: readonly string[];
  confirmationHeights: readonly number[];
}> {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error('native issuance must contain exactly three transactions');
  }
  const roles = ['tracker', 'duplicatePrevention', 'pooledReserve'] as const;
  const transactionIds = value.map((entry, index) => {
    const receipt = exactRecord(entry, [
      'ordinal', 'role', 'expectedTxId', 'transportStatus',
      'durableAttemptDigestHex', 'journalDigestHex', 'confirmationDigestHex',
      'confirmationHeight', 'confirmationHeaderIdHex',
    ], `native issuance transaction ${index}`);
    if (
      receipt.ordinal !== index
      || receipt.role !== roles[index]
      || !['accepted', 'ambiguous', 'reconciled'].includes(String(receipt.transportStatus))
      || !Number.isSafeInteger(receipt.confirmationHeight)
      || Number(receipt.confirmationHeight) <= 0
    ) {
      throw new Error('native issuance transaction identity changed');
    }
    for (const key of [
      'expectedTxId', 'durableAttemptDigestHex', 'journalDigestHex',
      'confirmationDigestHex', 'confirmationHeaderIdHex',
    ]) fixedLowerHex(receipt[key], 32, `native issuance transaction ${index} ${key}`);
    return receipt.expectedTxId as string;
  });
  if (new Set(transactionIds).size !== transactionIds.length) {
    throw new Error('native issuance transaction IDs must be distinct');
  }
  return Object.freeze({
    transactionIds: Object.freeze(transactionIds),
    confirmationHeights: Object.freeze(value.map(entry => (
      entry as Record<string, unknown>
    ).confirmationHeight as number)),
  });
}

function unsignedIssuance(value: unknown, transactionIds: readonly string[]): void {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error('unsigned native issuance must contain exactly three transactions');
  }
  const roles = ['tracker', 'duplicatePrevention', 'pooledReserve'] as const;
  value.forEach((entry, index) => {
    const record = exactRecord(entry, [
      'role', 'transactionIdHex', 'predictedSingletonBoxIdHex',
    ], `unsigned native issuance ${index}`);
    if (record.role !== roles[index] || record.transactionIdHex !== transactionIds[index]) {
      throw new Error('unsigned native issuance differs from confirmed issuance');
    }
    fixedLowerHex(record.predictedSingletonBoxIdHex, 32, 'predicted singleton box ID');
  });
}

function pegIn(value: unknown, label: string): Readonly<Record<string, string>> {
  const record = exactRecord(value, [
    'sourceLockTransactionIdHex', 'reserveTransitionTransactionIdHex',
    'sourceLockBoxIdHex', 'reserveSuccessorBoxIdHex', 'mintIdentityHex',
    'sourceProofReceiptDigestHex',
  ], label);
  const result: Record<string, string> = {};
  for (const key of Object.keys(record)) {
    result[key] = fixedHexFlexible(record[key], 32, `${label} ${key}`);
  }
  if (new Set([
    result.sourceLockTransactionIdHex,
    result.reserveTransitionTransactionIdHex,
    result.sourceLockBoxIdHex,
    result.reserveSuccessorBoxIdHex,
  ]).size !== 4) {
    throw new Error(`${label} transaction and box identities must be distinct`);
  }
  return Object.freeze(result);
}

function firstCycleMint(value: unknown, pegInValue: Readonly<Record<string, string>>) {
  const mint = exactRecord(value, [
    'blockHashHex', 'ethereumBlockHashHex', 'blockHeight',
    'transactionHashHex', 'transactionIndex', 'eventIndex', 'mintIdentityHex',
    'amountNanoErg', 'recipientAddressHex', 'sourceProofReceiptDigestHex',
    'consumedReservationScaleHex', 'runtimeReservationConsumed',
    'mintExecuted', 'sourceFinalityEstablished', 'trustless',
  ], 'first cycle mint');
  if (
    mint.blockHeight !== 2
    || mint.transactionIndex !== 0
    || mint.eventIndex !== 1
    || mint.mintExecuted !== true
    || mint.runtimeReservationConsumed !== true
    || mint.sourceFinalityEstablished !== false
    || mint.trustless !== false
    || mint.mintIdentityHex !== pegInValue.mintIdentityHex
    || mint.sourceProofReceiptDigestHex !== pegInValue.sourceProofReceiptDigestHex
  ) throw new Error('first cycle mint differs from its peg-in');
  validateNativeExecutionIdentity(mint, 'first cycle mint');
  fixedHexFlexible(mint.recipientAddressHex, 20, 'first cycle mint recipient');
  variableHex(mint.consumedReservationScaleHex, 'first cycle consumed reservation');
  return Object.freeze({
    mintIdentityHex: pegInValue.mintIdentityHex!,
    sourceProofReceiptDigestHex: pegInValue.sourceProofReceiptDigestHex!,
    amountNanoErg: positiveDecimal(mint.amountNanoErg, 'first cycle mint amount'),
  });
}

function firstCycleBurn(value: unknown) {
  const burn = exactRecord(value, [
    'phase', 'blockHashHex', 'ethereumBlockHashHex', 'blockHeight',
    'transactionHashHex', 'transactionIndex', 'eventIndex',
    'grossAmountNanoErg', 'netAmountNanoErg', 'recipientErgoTreeHex',
    'sourceFinalityEstablished', 'trustless',
  ], 'first cycle burn');
  validateNativeBurnIdentity(burn, 4, 'first cycle burn');
  return burnAmounts(burn, 'first cycle burn');
}

function secondCycleMint(value: unknown, pegInValue: Readonly<Record<string, string>>) {
  const mint = exactRecord(value, [
    'blockHashHex', 'ethereumBlockHashHex', 'blockHeight',
    'transactionHashHex', 'transactionIndex', 'eventIndex', 'mintIdentityHex',
    'amountNanoErg', 'recipientAddressHex', 'sourceProofReceiptDigestHex',
    'consumedReservationScaleHex', 'runtimeReservationConsumed',
    'mintExecuted', 'sourceFinalityEstablished', 'trustless',
  ], 'second cycle mint');
  if (
    mint.blockHeight !== 6
    || mint.transactionIndex !== 0
    || mint.eventIndex !== 1
    || mint.mintExecuted !== true
    || mint.runtimeReservationConsumed !== true
    || mint.mintIdentityHex !== pegInValue.mintIdentityHex
    || mint.sourceProofReceiptDigestHex !== pegInValue.sourceProofReceiptDigestHex
    || mint.sourceFinalityEstablished !== false
    || mint.trustless !== false
  ) throw new Error('second cycle mint differs from its peg-in');
  validateNativeExecutionIdentity(mint, 'second cycle mint');
  fixedHexFlexible(mint.recipientAddressHex, 20, 'second cycle mint recipient');
  variableHex(mint.consumedReservationScaleHex, 'second cycle consumed reservation');
  return Object.freeze({
    mintIdentityHex: pegInValue.mintIdentityHex!,
    amountNanoErg: positiveDecimal(mint.amountNanoErg, 'second cycle mint amount'),
  });
}

function secondCycleBurn(value: unknown) {
  const burn = exactRecord(value, [
    'phase', 'blockHashHex', 'ethereumBlockHashHex', 'blockHeight',
    'transactionHashHex', 'transactionIndex', 'eventIndex',
    'grossAmountNanoErg', 'netAmountNanoErg', 'recipientErgoTreeHex',
    'sourceFinalityEstablished', 'trustless',
  ], 'second cycle burn');
  validateNativeBurnIdentity(burn, 8, 'second cycle burn');
  return burnAmounts(burn, 'second cycle burn');
}

function validateNativeExecutionIdentity(
  value: Record<string, unknown>,
  label: string,
): void {
  for (const key of ['blockHashHex', 'ethereumBlockHashHex', 'transactionHashHex']) {
    fixedHexFlexible(value[key], 32, `${label} ${key}`);
  }
}

function validateNativeBurnIdentity(
  value: Record<string, unknown>,
  expectedHeight: number,
  label: string,
): void {
  if (
    value.phase !== 'burn'
    || value.blockHeight !== expectedHeight
    || value.transactionIndex !== 0
    || value.eventIndex !== 2
    || value.sourceFinalityEstablished !== false
    || value.trustless !== false
  ) throw new Error(`${label} execution identity changed`);
  validateNativeExecutionIdentity(value, label);
  variableHex(value.recipientErgoTreeHex, `${label} recipient ErgoTree`);
}

function burnAmounts(record: Record<string, unknown>, label: string) {
  const netAmountNanoErg = positiveDecimal(record.netAmountNanoErg, `${label} net amount`);
  const grossAmountNanoErg = positiveDecimal(record.grossAmountNanoErg, `${label} gross amount`);
  if (BigInt(netAmountNanoErg) >= BigInt(grossAmountNanoErg)) {
    throw new Error(`${label} net amount must be below gross amount`);
  }
  return Object.freeze({ netAmountNanoErg, grossAmountNanoErg });
}

function cycleReturn(value: unknown, label: string, includesFeeBoxes = false): Readonly<{
  trackerTransactionIdHex: string;
  payoutTransactionIdHex: string;
  payoutAmountNanoErg: string;
}> {
  const cycle = exactRecord(value, [
    'checkpoint', 'feeFunding', 'anchor', 'tracker', 'payout',
    'confirmationExecution',
  ], label);
  const fees = exactRecord(cycle.feeFunding, ['withdrawal', 'tracker'], `${label} fee funding`);
  const validateFee = includesFeeBoxes ? firstCycleFee : feeSummary;
  validateFee(fees.withdrawal, `${label} withdrawal fee`);
  validateFee(fees.tracker, `${label} tracker fee`);
  const tracker = exactRecord(cycle.tracker, [
    'expectedTxId', 'confirmationHeight', 'confirmationHeaderIdHex',
    'authorizationDigestHex', 'checkDigestHex', 'frozenExecution',
    'freshnessExecution', 'transportExecution', 'transportStatus',
    'journalDigestHex',
  ], `${label} tracker`);
  if (
    !positiveSafeInteger(tracker.confirmationHeight, `${label} tracker confirmation height`)
    || !['accepted', 'ambiguous', 'reconciled'].includes(String(tracker.transportStatus))
  ) throw new Error(`${label} tracker is not canonically confirmed`);
  for (const key of [
    'expectedTxId', 'confirmationHeaderIdHex', 'authorizationDigestHex',
    'checkDigestHex', 'journalDigestHex',
  ]) fixedLowerHex(tracker[key], 32, `${label} tracker ${key}`);
  const payout = exactRecord(cycle.payout, [
    'expectedTxId', 'confirmationHeight', 'confirmationHeaderIdHex',
    'observationDigestHex', 'authorizationDigestHex',
    'durableAttemptDigestHex', 'transportStatus', 'journalDigestHex',
    'payoutBoxIdHex', 'amountNanoErg', 'reserveSuccessorBoxIdHex',
    'duplicatePreventionSuccessorBoxIdHex',
  ], `${label} payout`);
  if (
    !positiveSafeInteger(payout.confirmationHeight, `${label} payout confirmation height`)
    || !['accepted', 'ambiguous', 'reconciled'].includes(String(payout.transportStatus))
  ) throw new Error(`${label} payout is not canonically confirmed`);
  for (const key of [
    'expectedTxId', 'confirmationHeaderIdHex', 'observationDigestHex',
    'authorizationDigestHex', 'durableAttemptDigestHex', 'journalDigestHex',
    'payoutBoxIdHex', 'reserveSuccessorBoxIdHex',
    'duplicatePreventionSuccessorBoxIdHex',
  ]) fixedLowerHex(payout[key], 32, `${label} payout ${key}`);
  return Object.freeze({
    trackerTransactionIdHex: tracker.expectedTxId as string,
    payoutTransactionIdHex: payout.expectedTxId as string,
    payoutAmountNanoErg: positiveDecimal(payout.amountNanoErg, `${label} payout amount`),
  });
}

function firstCycleFee(value: unknown, label: string): void {
  const receipt = exactRecord(value, [
    'expectedTxId', 'durableAttemptDigestHex', 'transportStatus',
    'journalDigestHex', 'confirmationDigestHex', 'confirmationHeight',
    'confirmationHeaderIdHex', 'feeInputBox',
  ], label);
  const box = exactRecord(receipt.feeInputBox, [
    'boxId', 'value', 'ergoTree', 'assets', 'additionalRegisters',
    'creationHeight', 'transactionId', 'index',
  ], `${label} input box`);
  if (box.transactionId !== receipt.expectedTxId || box.index !== 0) {
    throw new Error(`${label} input box differs from its funding transaction`);
  }
  fixedLowerHex(box.boxId, 32, `${label} input box ID`);
  positiveDecimal(box.value, `${label} input value`);
  if (typeof box.ergoTree !== 'string' || !/^(?:[0-9a-f]{2})+$/u.test(box.ergoTree)
    || box.ergoTree.length > 1024 * 1024) {
    throw new Error(`${label} input script must be bounded unprefixed Ergo hexadecimal`);
  }
  positiveSafeInteger(box.creationHeight, `${label} input creation height`);
  if (!Array.isArray(box.assets) || box.assets.length !== 0) {
    throw new Error(`${label} input box must contain only external fee funds`);
  }
  exactRecord(box.additionalRegisters, [], `${label} input registers`);
  const { feeInputBox: _feeInputBox, ...summary } = receipt;
  feeSummary({ ...summary, feeInputBoxIdHex: box.boxId }, label);
}

function feeSummary(value: unknown, label: string): void {
  const fee = exactRecord(value, [
    'expectedTxId', 'durableAttemptDigestHex', 'transportStatus',
    'journalDigestHex', 'confirmationDigestHex', 'confirmationHeight',
    'confirmationHeaderIdHex', 'feeInputBoxIdHex',
  ], label);
  if (
    !positiveSafeInteger(fee.confirmationHeight, `${label} confirmation height`)
    || !['accepted', 'ambiguous', 'reconciled'].includes(String(fee.transportStatus))
  ) throw new Error(`${label} is not canonically confirmed`);
  for (const key of [
    'expectedTxId', 'durableAttemptDigestHex', 'journalDigestHex',
    'confirmationDigestHex', 'confirmationHeaderIdHex', 'feeInputBoxIdHex',
  ]) fixedLowerHex(fee[key], 32, `${label} ${key}`);
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) throw new Error(`${label} must be one plain object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).length !== keys.length
    || keys.some(key => !descriptors[key]?.enumerable || !('value' in descriptors[key]!))
  ) throw new Error(`${label} fields differ from V1`);
  return value as Record<string, unknown>;
}

function assertPlainSerializablePathFree(value: unknown, label: string): void {
  const seen = new Set<object>();
  const visit = (current: unknown): void => {
    if (typeof current === 'string') {
      if (current.length > 1024 * 1024 || hasLocalPath(current)) {
        throw new Error(`${label} contains an unsupported string`);
      }
      return;
    }
    if (current === null || typeof current === 'number' || typeof current === 'boolean') return;
    if (typeof current !== 'object') throw new Error(`${label} contains a non-data value`);
    if (seen.has(current)) throw new Error(`${label} contains a cycle`);
    seen.add(current);
    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) {
      throw new Error(`${label} contains a non-plain object`);
    }
    if (Object.getOwnPropertySymbols(current).length !== 0) {
      throw new Error(`${label} contains symbol fields`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(current);
    if (Array.isArray(current)) {
      if (Object.keys(descriptors).length !== current.length + 1
        || Array.from({ length: current.length }, (_, index) => descriptors[String(index)])
          .some(descriptor => descriptor === undefined)) {
        throw new Error(`${label} contains a sparse or extended array`);
      }
      delete descriptors.length;
    }
    for (const descriptor of Object.values(descriptors)) {
      if (!descriptor.enumerable || !('value' in descriptor)) {
        throw new Error(`${label} contains hidden or accessor fields`);
      }
      visit(descriptor.value);
    }
    seen.delete(current);
  };
  visit(value);
  let encoded: string;
  try { encoded = canonicalJson(value); }
  catch { throw new Error(`${label} is not canonical JSON data`); }
  if (Buffer.byteLength(encoded, 'utf8') > 2 * 1024 * 1024) {
    throw new Error(`${label} exceeds the bounded result size`);
  }
}

function existingPath(
  value: unknown,
  label: string,
  kind: 'file' | 'directory',
): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.includes('\0')
    || !isAbsolute(value)
    || hasRemoteOrDeviceNamespace(value)
    || hasSensitivePath(value)
  ) throw new Error(`${label} must be one local absolute non-sensitive path`);
  const requested = resolve(value);
  assertLinkFreeExistingPath(requested, label);
  const canonical = realpathSync.native(requested);
  const stat = lstatSync(canonical);
  if (
    (kind === 'file' ? !stat.isFile() : !stat.isDirectory())
    || stat.isSymbolicLink()
    || !samePath(requested, canonical)
  ) throw new Error(`${label} must be one canonical link-free ${kind}`);
  return canonical;
}

function assertLinkFreeExistingPath(pathValue: string, label: string): void {
  const root = parse(pathValue).root;
  let cursor = root;
  const tail = pathValue.slice(root.length).split(/[\\/]/u).filter(Boolean);
  for (const component of tail) {
    cursor = resolve(cursor, component);
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink() || !samePath(realpathSync.native(cursor), cursor)) {
      throw new Error(`${label} path must not contain a symbolic link or junction`);
    }
  }
}

function javaHomeFromExecutable(javaExecutablePath: string): string {
  if (
    basename(javaExecutablePath).toLowerCase() !== 'java.exe'
    || basename(dirname(javaExecutablePath)).toLowerCase() !== 'bin'
  ) throw new Error('Java executable must be java.exe inside the pinned Java home');
  return realpathSync.native(dirname(dirname(javaExecutablePath)));
}

function hashDirectoryFiles(root: string): string {
  const files: string[] = [];
  const visit = (cursor: string): void => {
    for (const entry of readdirSync(cursor, { withFileTypes: true })) {
      const path = resolve(cursor, entry.name);
      if (entry.isSymbolicLink()) throw new Error('locked Java home must not contain links');
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error('locked Java home contains an unsupported entry');
    }
  };
  visit(root);
  if (files.length === 0) throw new Error('locked Java home contains no regular files');
  const rows = files
    .map(path => `${relative(root, path).replace(/\\/gu, '/')}:${sha256(readFileSync(path))}`)
    .sort();
  return sha256(Buffer.from(rows.join('\n'), 'utf8'));
}

function fixedHexArray(value: unknown, length: number, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error(`${label} must contain exactly ${length} values`);
  }
  const result = value.map((entry, index) => fixedLowerHex(entry, 32, `${label} ${index}`));
  if (new Set(result).size !== result.length) throw new Error(`${label} must be distinct`);
  return Object.freeze(result);
}

function fixedLowerHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(value)
  ) throw new Error(`${label} must be ${bytes} lowercase hexadecimal bytes`);
  return value;
}

function fixedHexFlexible(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hexadecimal`);
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  fixedLowerHex(normalized, bytes, label);
  return value.startsWith('0x') ? `0x${normalized}` : normalized;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value as number;
}

function positiveDecimal(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,30}$/u.test(value)) {
    throw new Error(`${label} must be a positive canonical decimal`);
  }
  return value;
}

function variableHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || !/^0x(?:[0-9a-f]{2})+$/u.test(value)
    || value.length > 1024 * 1024
  ) throw new Error(`${label} must be bounded 0x-prefixed lowercase hexadecimal`);
  return value;
}

function boundedAttemptName(value: unknown): string {
  if (
    typeof value !== 'string'
    || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(value)
    || value.endsWith('-')
  ) throw new Error('native two-cycle attempt name is invalid');
  return value;
}

function decodeUtf8(bytes: Uint8Array, label: string): string {
  const text = Buffer.from(bytes).toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(Buffer.from(bytes))) {
    throw new Error(`${label} must be canonical UTF-8`);
  }
  return text;
}

function minimalGitEnvironment(gitExecutablePath: string): NodeJS.ProcessEnv {
  return {
    PATH: dirname(gitExecutablePath),
    SystemRoot: process.env.SystemRoot ?? process.env.SYSTEMROOT,
    WINDIR: process.env.WINDIR,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
  };
}

function pathsOverlap(left: string, right: string): boolean {
  return isPathInside(left, right) || isPathInside(right, left);
}

function samePath(left: string, right: string): boolean {
  return canonicalPathIdentity(left) === canonicalPathIdentity(right);
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function hasRemoteOrDeviceNamespace(value: string): boolean {
  return /^(?:\\\\|\/\/|\\[?.]\\|\\Device\\)/iu.test(value);
}

function hasSensitivePath(value: string): boolean {
  return /(?:^|[\\/])(?:\.env(?:\.[^\\/]*)?|\.ssh|logs?|db|database|[^\\/]*(?:mnemonic|seed[-_ ]?phrase|private[-_ ]?key|api[-_ ]?key|credentials?|secret|wallet|keystore|keyring|deployed[-_ ]state|deployment[-_ ]state|runtime[-_ ]?(?:db|database|state))[^\\/]*|[^\\/]+\.(?:sqlite(?:3)?|db|log)(?:[.-][^\\/]*)?)(?:[\\/]|$)/iu.test(value);
}

function hasLocalPath(value: string): boolean {
  return /(?<![A-Za-z0-9])[A-Za-z]:[\\/]/u.test(value)
    || /^(?:\\\\|\/\/|\\[?.]\\|\\Device\\)/iu.test(value);
}
