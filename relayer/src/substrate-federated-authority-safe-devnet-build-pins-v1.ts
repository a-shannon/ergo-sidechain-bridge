import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
  inspectConsensusSourceBaseline,
  type ConsensusSourceBaselineReport,
} from './consensus-source-baseline.js';
import {
  createPinnedLocalNativeBuildWorkspace,
  EXPECTED_NATIVE_VERIFIER_TOOLCHAIN_LOCK_SHA256,
  runBoundedProcess,
  type NativeVerifierBuildToolObservation,
} from './pinned-local-native-verifier-build.js';
import {
  assertSubstrateFederatedAuthoritySafeBuildSpecStderrV1,
  buildSubstrateFederatedAuthoritySafeCargoEnvironmentV1,
  buildSubstrateFederatedAuthoritySafeMinimalToolEnvironmentV1,
  inspectSubstrateFederatedAuthoritySafePinnedToolchainV1,
} from './substrate-federated-authority-safe-devnet-build-environment-v1.js';
import { parseStrictJsonPreservingNumbers } from
  './substrate-federated-legacy-compatibility-devnet-chain-spec-v1.js';

export const SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_BUILD_PINS_V1_SCHEMA =
  'e2s.substrate-federated-authority-safe-devnet-build-pins.v1' as const;
export const SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_BUILD_PINS_V1_FILES =
  Object.freeze({
    baseSpec: 'frontier-base-spec.json',
    report: 'build-pins.v1.json',
  } as const);

const FRONTIER_PACKAGE = 'frontier-template-node';
const BUILD_TIMEOUT_MS = 10 * 60_000;
const SHORT_PROCESS_TIMEOUT_MS = 30_000;
const MAX_BUILD_OUTPUT_BYTES = 1024 * 1024;
const MAX_CHAIN_SPEC_OUTPUT_BYTES = 16 * 1024 * 1024;

export interface RefreshSubstrateFederatedAuthoritySafeDevnetBuildPinsV1Input {
  readonly worktreeRoot: string;
  readonly bridgeRoot: string;
  readonly frontierSourcePath: string;
  readonly cargoExecutablePath: string;
  readonly rustcExecutablePath: string;
  readonly gitExecutablePath: string;
  readonly expectedFrontierCommit: string;
  readonly expectedFrontierPatchSha256Hex: string;
  readonly expectedFrontierBinaryVersion: string;
  readonly temporaryDirectoryRoot: string;
  readonly sharedCargoHomeRoot: string;
}

export interface SubstrateFederatedAuthoritySafeDevnetBuildPinsV1Report {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_BUILD_PINS_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'same_toolchain_frontier_build_pins_reproduced';
  readonly source: Readonly<{
    readonly frontierCommit: string;
    readonly frontierPatchSha256Hex: string;
    readonly checkoutDigestHex: string;
  }>;
  readonly toolchain: Readonly<{
    readonly lockSha256Hex: string;
    readonly platformKey: string;
    readonly rustTarget: string;
    readonly cargo: Readonly<{
      readonly version: string;
      readonly sha256Hex: string;
    }>;
    readonly rustc: Readonly<{
      readonly version: string;
      readonly sha256Hex: string;
    }>;
    readonly git: Readonly<{
      readonly version: string;
      readonly sha256Hex: string;
    }>;
  }>;
  readonly baseSpec: Readonly<{
    readonly byteLength: number;
    readonly sha256Hex: string;
  }>;
  readonly runtimeCode: Readonly<{
    readonly byteLength: number;
    readonly sha256Hex: string;
  }>;
  readonly nativeBuilds: readonly Readonly<{
    readonly ordinal: 1 | 2;
    readonly binaryByteLength: number;
    readonly binarySha256Hex: string;
    readonly binaryVersion: string;
  }>[];
  readonly observations: Readonly<{
    readonly nativeBinaryDigestsEqual: boolean;
  }>;
  readonly checks: Readonly<{
    readonly exactPatchedSourceCheckoutVerifiedBeforeAndAfterBothBuilds: true;
    readonly exactLockedToolchainVerifiedBeforeAndAfterBothBuilds: true;
    readonly sameExactToolchainPathsUsedForBothBuilds: true;
    readonly distinctFreshCargoTargetsUsed: true;
    readonly sameExplicitCargoCacheRootSelected: true;
    readonly cargoLockedAndOfflineForBothBuilds: true;
    readonly deterministicNativeAndWasmPathRemappingApplied: true;
    readonly baseSpecBytesReproducedExactly: true;
    readonly runtimeCodeBytesReproducedExactly: true;
  }>;
  readonly boundaries: Readonly<{
    readonly sameMachineObservationOnly: true;
    readonly sameToolchainRootObservationOnly: true;
    readonly crossRootReproducibilityEstablished: false;
    readonly nativeBinaryReproducibilityEstablished: false;
    readonly completeBuildToolClosureVerified: false;
    readonly dependencyCacheContentAttested: false;
    readonly independentBuildAttestationVerified: false;
    readonly hermeticBuildAttestationVerified: false;
    readonly targetNodeAcceptanceVerified: false;
    readonly sourceFinalityAuthenticated: false;
    readonly trackerAdmissionVerified: false;
    readonly mintAuthorized: false;
    readonly settlementAuthorized: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly reportDigestHex: string;
}

export interface SubstrateFederatedAuthoritySafeDevnetBuildPinsV1Result {
  readonly baseSpecBytes: Uint8Array;
  readonly report: Readonly<
    SubstrateFederatedAuthoritySafeDevnetBuildPinsV1Report
  >;
}

interface BuildObservation {
  readonly buildTargetPath: string;
  readonly baseSpecBytes: Buffer;
  readonly runtimeCodeBytes: Buffer;
  readonly nativeBinaryByteLength: number;
  readonly nativeBinarySha256Hex: string;
  readonly nativeBinaryVersion: string;
  readonly source: Readonly<ConsensusSourceBaselineReport>;
  readonly toolchain: Readonly<NativeVerifierBuildToolObservation>;
}

export async function refreshSubstrateFederatedAuthoritySafeDevnetBuildPinsV1(
  input: Readonly<
    RefreshSubstrateFederatedAuthoritySafeDevnetBuildPinsV1Input
  >,
): Promise<Readonly<SubstrateFederatedAuthoritySafeDevnetBuildPinsV1Result>> {
  const worktreeRoot = canonicalDirectory(input.worktreeRoot, 'bridge worktree root');
  const bridgeRoot = canonicalDirectory(input.bridgeRoot, 'bridge root');
  const frontierSourcePath = canonicalDirectory(
    input.frontierSourcePath,
    'patched Frontier source',
  );
  const cargoExecutablePath = canonicalRegularFile(
    input.cargoExecutablePath,
    'Cargo executable',
  );
  const rustcExecutablePath = canonicalRegularFile(
    input.rustcExecutablePath,
    'Rust compiler executable',
  );
  const gitExecutablePath = canonicalRegularFile(
    input.gitExecutablePath,
    'Git executable',
  );
  const toolDirectory = dirname(cargoExecutablePath);
  if (dirname(rustcExecutablePath) !== toolDirectory) {
    throw new Error('Cargo and Rust compiler must come from one pinned toolchain directory');
  }
  const gitToolDirectory = dirname(gitExecutablePath);
  const expectedFrontierCommit = lowercaseHex(
    input.expectedFrontierCommit,
    40,
    'expected Frontier commit',
  );
  const expectedFrontierPatchSha256Hex = lowercaseHex(
    input.expectedFrontierPatchSha256Hex,
    64,
    'expected Frontier patch SHA-256',
  );
  const expectedFrontierBinaryVersion = boundedLine(
    input.expectedFrontierBinaryVersion,
    'expected Frontier binary version',
  );
  const temporaryDirectoryRoot = canonicalDirectory(
    input.temporaryDirectoryRoot,
    'build temporary root',
  );
  const sharedCargoHomeRoot = canonicalDirectory(
    input.sharedCargoHomeRoot,
    'shared Cargo home',
  );
  for (const [mutablePath, mutableLabel] of [
    [temporaryDirectoryRoot, 'build temporary root'],
    [sharedCargoHomeRoot, 'shared Cargo home'],
  ] as const) {
    for (const [protectedPath, protectedLabel] of [
      [worktreeRoot, 'bridge worktree root'],
      [bridgeRoot, 'bridge root'],
      [frontierSourcePath, 'patched Frontier source'],
      [toolDirectory, 'pinned Cargo/Rust toolchain directory'],
      [gitToolDirectory, 'pinned Git tool directory'],
    ] as const) {
      assertDisjointDirectories(
        mutablePath,
        mutableLabel,
        protectedPath,
        protectedLabel,
      );
    }
  }
  assertDisjointDirectories(
    temporaryDirectoryRoot,
    'build temporary root',
    sharedCargoHomeRoot,
    'shared Cargo home',
  );
  const common = Object.freeze({
    worktreeRoot,
    bridgeRoot,
    frontierSourcePath,
    cargoExecutablePath,
    rustcExecutablePath,
    gitExecutablePath,
    expectedFrontierCommit,
    expectedFrontierPatchSha256Hex,
    expectedFrontierBinaryVersion,
    temporaryDirectoryRoot,
    sharedCargoHomeRoot,
  });
  const first = await buildOnce(common);
  const second = await buildOnce(common);

  if (canonicalPathIdentity(first.buildTargetPath)
    === canonicalPathIdentity(second.buildTargetPath)) {
    throw new Error('the two Frontier builds must use distinct fresh Cargo targets');
  }
  if (!first.baseSpecBytes.equals(second.baseSpecBytes)) {
    throw new Error(
      'same-toolchain Frontier builds produced different base chain-spec bytes',
    );
  }
  if (!first.runtimeCodeBytes.equals(second.runtimeCodeBytes)) {
    throw new Error(
      'same-toolchain Frontier builds produced different runtime-code bytes',
    );
  }
  assertSameObservation(
    first.source,
    second.source,
    'patched Frontier source changed between the two builds',
  );
  assertSameObservation(
    first.toolchain,
    second.toolchain,
    'locked native toolchain changed between the two builds',
  );

  const baseSpecSha256Hex = sha256(first.baseSpecBytes);
  const runtimeCodeSha256Hex = sha256(first.runtimeCodeBytes);
  const solidityBuildManifestSha256Hex =
    first.source.sourceIdentity.solidityBuildManifestSha256;
  if (
    typeof solidityBuildManifestSha256Hex !== 'string'
    || !/^[0-9a-f]{64}$/.test(solidityBuildManifestSha256Hex)
  ) {
    throw new Error('source baseline lacks the exact Solidity build manifest pin');
  }
  const source = Object.freeze({
    frontierCommit: expectedFrontierCommit,
    frontierPatchSha256Hex: expectedFrontierPatchSha256Hex,
    checkoutDigestHex: sha256Canonical({
      frontierCommit: expectedFrontierCommit,
      frontierPatchSha256Hex: expectedFrontierPatchSha256Hex,
      runtimeCodeSha256Hex,
      solidityBuildManifestSha256Hex,
    }),
  });
  const toolchain = toolchainSummary(first.toolchain);
  const nativeBuilds = Object.freeze([
    nativeBuildSummary(1, first),
    nativeBuildSummary(2, second),
  ] as const);
  const unsignedReport = Object.freeze({
    schema: SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_BUILD_PINS_V1_SCHEMA,
    version: 1 as const,
    status: 'same_toolchain_frontier_build_pins_reproduced' as const,
    source,
    toolchain,
    baseSpec: Object.freeze({
      byteLength: first.baseSpecBytes.length,
      sha256Hex: baseSpecSha256Hex,
    }),
    runtimeCode: Object.freeze({
      byteLength: first.runtimeCodeBytes.length,
      sha256Hex: runtimeCodeSha256Hex,
    }),
    nativeBuilds,
    observations: Object.freeze({
      nativeBinaryDigestsEqual:
        first.nativeBinarySha256Hex === second.nativeBinarySha256Hex,
    }),
    checks: Object.freeze({
      exactPatchedSourceCheckoutVerifiedBeforeAndAfterBothBuilds: true as const,
      exactLockedToolchainVerifiedBeforeAndAfterBothBuilds: true as const,
      sameExactToolchainPathsUsedForBothBuilds: true as const,
      distinctFreshCargoTargetsUsed: true as const,
      sameExplicitCargoCacheRootSelected: true as const,
      cargoLockedAndOfflineForBothBuilds: true as const,
      deterministicNativeAndWasmPathRemappingApplied: true as const,
      baseSpecBytesReproducedExactly: true as const,
      runtimeCodeBytesReproducedExactly: true as const,
    }),
    boundaries: Object.freeze({
      sameMachineObservationOnly: true as const,
      sameToolchainRootObservationOnly: true as const,
      crossRootReproducibilityEstablished: false as const,
      nativeBinaryReproducibilityEstablished: false as const,
      completeBuildToolClosureVerified: false as const,
      dependencyCacheContentAttested: false as const,
      independentBuildAttestationVerified: false as const,
      hermeticBuildAttestationVerified: false as const,
      targetNodeAcceptanceVerified: false as const,
      sourceFinalityAuthenticated: false as const,
      trackerAdmissionVerified: false as const,
      mintAuthorized: false as const,
      settlementAuthorized: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    }),
  });
  const report = Object.freeze({
    ...unsignedReport,
    reportDigestHex: sha256Canonical(unsignedReport),
  });
  return Object.freeze({
    baseSpecBytes: Buffer.from(first.baseSpecBytes),
    report,
  });
}

async function buildOnce(
  input: Readonly<
    RefreshSubstrateFederatedAuthoritySafeDevnetBuildPinsV1Input
  >,
): Promise<Readonly<BuildObservation>> {
  const sourceBefore = inspectExactSource(input, 'before build');
  const toolchainBefore =
    await inspectSubstrateFederatedAuthoritySafePinnedToolchainV1({
      bridgeRoot: input.bridgeRoot,
      cargoExecutablePath: input.cargoExecutablePath,
      rustcExecutablePath: input.rustcExecutablePath,
      gitExecutablePath: input.gitExecutablePath,
      cwd: input.frontierSourcePath,
    });
  const workspace = createPinnedLocalNativeBuildWorkspace(undefined, {
    cargoDependencyMode: 'shared-cache',
    temporaryDirectoryRoot: input.temporaryDirectoryRoot,
    sharedCargoHomeRoot: input.sharedCargoHomeRoot,
  });
  const buildTargetPath = workspace.buildTargetPath;
  try {
    const cargoEnvironment =
      buildSubstrateFederatedAuthoritySafeCargoEnvironmentV1({
        cargoTargetDirectory: buildTargetPath,
        cargoHomeDirectory: workspace.cargoHomePath,
        cargoExecutablePath: input.cargoExecutablePath,
        frontierSourcePath: input.frontierSourcePath,
        rustcExecutablePath: input.rustcExecutablePath,
        rustTarget: toolchainBefore.rustTarget,
      });
    await runBoundedProcess({
      executablePath: input.cargoExecutablePath,
      args: ['build', '--locked', '--offline', '-p', FRONTIER_PACKAGE],
      cwd: input.frontierSourcePath,
      env: cargoEnvironment,
      timeoutMs: BUILD_TIMEOUT_MS,
      maxOutputBytes: MAX_BUILD_OUTPUT_BYTES,
      label: 'source-locked authority-safe Frontier pin build',
    });
    const binaryPath = canonicalRegularFile(
      join(
        buildTargetPath,
        'debug',
        process.platform === 'win32'
          ? `${FRONTIER_PACKAGE}.exe`
          : FRONTIER_PACKAGE,
      ),
      'built Frontier binary',
    );
    const nativeBinaryBytes = readFileSync(binaryPath);
    const nativeBinaryStat = statSync(binaryPath);
    const nativeBinaryVersion = await exactBinaryVersion(
      binaryPath,
      input.frontierSourcePath,
      input.expectedFrontierBinaryVersion,
    );
    const baseSpecResult = await runBoundedProcess({
      executablePath: binaryPath,
      args: ['build-spec', '--chain', 'dev', '--disable-default-bootnode'],
      cwd: input.frontierSourcePath,
      env: buildSubstrateFederatedAuthoritySafeMinimalToolEnvironmentV1(),
      timeoutMs: SHORT_PROCESS_TIMEOUT_MS,
      maxOutputBytes: MAX_CHAIN_SPEC_OUTPUT_BYTES,
      maxStdoutBytes: MAX_CHAIN_SPEC_OUTPUT_BYTES,
      maxStderrBytes: 64 * 1024,
      label: 'freshly built Frontier base-spec pin reproduction',
    });
    assertSubstrateFederatedAuthoritySafeBuildSpecStderrV1(
      baseSpecResult.stderr,
    );
    const baseSpecBytes = boundedBaseSpecBytes(baseSpecResult.stdoutBytes);
    const runtimeCodeBytes = runtimeCodeFromBaseSpec(baseSpecBytes);
    if (
      statSync(binaryPath).size !== nativeBinaryStat.size
      || sha256(readFileSync(binaryPath)) !== sha256(nativeBinaryBytes)
    ) {
      throw new Error('built Frontier binary changed during base-spec reproduction');
    }
    const sourceAfter = inspectExactSource(input, 'after build');
    const toolchainAfter =
      await inspectSubstrateFederatedAuthoritySafePinnedToolchainV1({
        bridgeRoot: input.bridgeRoot,
        cargoExecutablePath: input.cargoExecutablePath,
        rustcExecutablePath: input.rustcExecutablePath,
        gitExecutablePath: input.gitExecutablePath,
        cwd: input.frontierSourcePath,
      });
    assertSameObservation(
      sourceBefore,
      sourceAfter,
      'patched Frontier source changed during one pin build',
    );
    assertSameObservation(
      toolchainBefore,
      toolchainAfter,
      'locked native toolchain changed during one pin build',
    );
    return Object.freeze({
      buildTargetPath,
      baseSpecBytes,
      runtimeCodeBytes,
      nativeBinaryByteLength: nativeBinaryStat.size,
      nativeBinarySha256Hex: sha256(nativeBinaryBytes),
      nativeBinaryVersion,
      source: sourceBefore,
      toolchain: toolchainBefore,
    });
  } finally {
    workspace.cleanup();
  }
}

function inspectExactSource(
  input: Readonly<
    Pick<
      RefreshSubstrateFederatedAuthoritySafeDevnetBuildPinsV1Input,
      | 'worktreeRoot'
      | 'bridgeRoot'
      | 'frontierSourcePath'
      | 'gitExecutablePath'
      | 'expectedFrontierCommit'
      | 'expectedFrontierPatchSha256Hex'
    >
  >,
  stage: string,
): Readonly<ConsensusSourceBaselineReport> {
  const baseline = inspectConsensusSourceBaseline({
    worktreeRoot: input.worktreeRoot,
    bridgeRoot: input.bridgeRoot,
    frontierSourcePath: input.frontierSourcePath,
    requireFrontierCheckout: true,
    requireErgoCheckout: false,
    gitExecutablePath: input.gitExecutablePath,
  });
  if (
    baseline.status !== 'PASS'
    || !baseline.checks.lockBindingsValidated
    || !baseline.checks.solidityBuildClosureArtifactsValidated
    || !baseline.checks.frontierCheckoutValidated
    || baseline.sourceIdentity.frontierCommit !== input.expectedFrontierCommit
    || baseline.sourceIdentity.frontierPatchSha256
      !== input.expectedFrontierPatchSha256Hex
  ) {
    throw new Error(
      `patched Frontier checkout differs from the complete source lock ${stage}`,
    );
  }
  return baseline;
}

async function exactBinaryVersion(
  executablePath: string,
  cwd: string,
  expected: string,
): Promise<string> {
  const result = await runBoundedProcess({
    executablePath,
    args: ['--version'],
    cwd,
    env: buildSubstrateFederatedAuthoritySafeMinimalToolEnvironmentV1(),
    timeoutMs: SHORT_PROCESS_TIMEOUT_MS,
    maxOutputBytes: 64 * 1024,
    label: 'Frontier binary version',
  });
  if (result.stderr.trim() !== '' || result.stdout.trim() !== expected) {
    throw new Error('Frontier binary version differs from the explicit pin');
  }
  return expected;
}

function boundedBaseSpecBytes(stdout: Uint8Array): Buffer {
  const bytes = Buffer.from(stdout);
  if (bytes.length === 0 || bytes.length > MAX_CHAIN_SPEC_OUTPUT_BYTES) {
    throw new Error('Frontier base chain spec size is outside the bounded limit');
  }
  return bytes;
}

function runtimeCodeFromBaseSpec(baseSpecBytes: Uint8Array): Buffer {
  const baseSpec = record(
    parseStrictJsonPreservingNumbers(
      strictUtf8(baseSpecBytes, 'Frontier base chain spec'),
      'Frontier base chain spec',
    ),
    'Frontier base chain spec',
  );
  const genesis = record(baseSpec.genesis, 'Frontier base chain-spec genesis');
  const runtimeGenesis = record(
    genesis.runtimeGenesis,
    'Frontier base chain-spec runtime genesis',
  );
  if (
    typeof runtimeGenesis.code !== 'string'
    || !/^0x(?:[0-9a-f]{2})+$/u.test(runtimeGenesis.code)
  ) {
    throw new Error('Frontier base chain-spec runtime code must be canonical hex');
  }
  return Buffer.from(runtimeGenesis.code.slice(2), 'hex');
}

function nativeBuildSummary(
  ordinal: 1 | 2,
  value: Readonly<BuildObservation>,
): Readonly<
  SubstrateFederatedAuthoritySafeDevnetBuildPinsV1Report['nativeBuilds'][number]
> {
  return Object.freeze({
    ordinal,
    binaryByteLength: value.nativeBinaryByteLength,
    binarySha256Hex: value.nativeBinarySha256Hex,
    binaryVersion: value.nativeBinaryVersion,
  });
}

function toolchainSummary(
  value: Readonly<NativeVerifierBuildToolObservation>,
): SubstrateFederatedAuthoritySafeDevnetBuildPinsV1Report['toolchain'] {
  return Object.freeze({
    lockSha256Hex: EXPECTED_NATIVE_VERIFIER_TOOLCHAIN_LOCK_SHA256,
    platformKey: value.platformKey,
    rustTarget: value.rustTarget,
    cargo: Object.freeze({
      version: value.cargo.version,
      sha256Hex: value.cargo.sha256,
    }),
    rustc: Object.freeze({
      version: value.rustc.version,
      sha256Hex: value.rustc.sha256,
    }),
    git: Object.freeze({
      version: value.git.version,
      sha256Hex: value.git.sha256,
    }),
  });
}

function canonicalDirectory(value: unknown, label: string): string {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) {
    throw new Error(`${label} must be one local absolute path`);
  }
  const path = resolve(value);
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be one regular directory`);
  }
  return realpathSync(path);
}

function canonicalRegularFile(value: unknown, label: string): string {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) {
    throw new Error(`${label} must be one local absolute path`);
  }
  const path = resolve(value);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be one regular file`);
  }
  return realpathSync(path);
}

function canonicalPathIdentity(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function assertDisjointDirectories(
  left: string,
  leftLabel: string,
  right: string,
  rightLabel: string,
): void {
  if (containsDirectory(left, right) || containsDirectory(right, left)) {
    throw new Error(`${leftLabel} must not overlap ${rightLabel}`);
  }
}

function containsDirectory(parent: string, candidate: string): boolean {
  const parentIdentity = canonicalPathIdentity(parent);
  const candidateIdentity = canonicalPathIdentity(candidate);
  const pathFromParent = relative(parentIdentity, candidateIdentity);
  return pathFromParent === '' || (
    pathFromParent !== '..'
    && !pathFromParent.startsWith(`..${sep}`)
    && !isAbsolute(pathFromParent)
  );
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function strictUtf8(value: Uint8Array, label: string): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(value);
  } catch {
    throw new Error(`${label} must be encoded as UTF-8`);
  }
  if (text.charCodeAt(0) === 0xfeff) {
    throw new Error(`${label} must not contain a UTF-8 BOM`);
  }
  return text;
}

function lowercaseHex(value: unknown, length: number, label: string): string {
  if (
    typeof value !== 'string'
    || value.length !== length
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be ${length} lowercase hex characters`);
  }
  return value;
}

function boundedLine(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 256
    || /[\r\n\0]/.test(value)
  ) {
    throw new Error(`${label} must be one bounded line`);
  }
  return value;
}

function assertSameObservation(left: unknown, right: unknown, message: string): void {
  if (sha256Canonical(left) !== sha256Canonical(right)) throw new Error(message);
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Canonical(value: unknown): string {
  return sha256(Buffer.from(JSON.stringify(sortCanonical(value)), 'utf8'));
}

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortCanonical(child)]),
    );
  }
  return value;
}
