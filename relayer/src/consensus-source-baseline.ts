import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { existsSync, lstatSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';

import { resolveBridgeRepositoryLayout } from './bridge-repository-layout.js';

export interface SourceLockObservation {
  frontierGitlinkCommit: string;
  frontierSubmoduleUrl: string;
  frontierPatchSha256: string;
  ergoPatchSha256: string;
}

export interface CheckoutObservation {
  head: string;
  status: string;
  blobs: Record<string, string>;
}

export interface SourceValidationResult {
  errors: string[];
}

export interface CheckoutValidationResult extends SourceValidationResult {
  observedBlobs: Record<string, string>;
  expectedStatus?: string;
}

export interface ConsensusSourceBaselineInspection {
  worktreeRoot: string;
  bridgeRoot: string;
  frontierSourcePath?: string;
  ergoSourcePath?: string;
  requireFrontierCheckout: boolean;
  requireErgoCheckout: boolean;
  gitExecutablePath?: string;
}

export interface ConsensusSourceBaselineReport {
  schemaVersion: 1;
  kind: 'bridge-consensus-source-baseline-report';
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  checks: {
    lockBindingsValidated: boolean;
    solidityBuildClosureArtifactsValidated: boolean;
    frontierCheckoutRequired: boolean;
    frontierCheckoutValidated: boolean;
    ergoCheckoutRequired: boolean;
    ergoCheckoutValidated: boolean;
  };
  sourceIdentity: {
    solidityBuildManifestSha256: string | null;
    frontierCommit: string | null;
    frontierPatchSha256: string | null;
    ergoBaseCommit: string | null;
    ergoPatchSha256: string | null;
  };
  boundaries: {
    sidechainFinalityImplemented: boolean;
    runtimeCommitmentProducerImplemented: boolean;
    grandpaAuthorityTransitionVerificationImplemented: boolean;
    hashLinkedGrandpaVerificationImplemented: boolean;
    nativeRuntimeCommitmentStateVerificationImplemented: boolean;
    nativeFinalizedCheckpointVerificationImplemented: boolean;
    nativeRpcProofCodecImplemented: boolean;
    trustlessBurnVerificationImplemented: boolean;
    gate5Closed: boolean;
  };
}

const SHA1_PATTERN = /^[0-9a-f]{40}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const FRONTIER_REPOSITORY = 'https://github.com/polkadot-evm/frontier.git';
const ERGO_REPOSITORY = 'https://github.com/ergoplatform/ergo.git';
const SOLIDITY_BUILD_SCHEMA =
  'ergo-sidechain-bridge/solidity-build-closure/v1';
const SOLIDITY_BUILD_MANIFEST_PATH =
  'solidity/compiled/build-manifest.json';
const SOLIDITY_BUILD_CHECK_COMMAND = 'npm --prefix solidity run check';
const SOLIDITY_COMPILER = 'solc@0.8.35';
const SOLIDITY_DEPENDENCY = '@openzeppelin/contracts@5.6.1';
const SOLIDITY_OPENZEPPELIN_IMPORT_PREFIX = '@openzeppelin/contracts/';
const REQUIRED_SOLIDITY_COMPILER_SOURCES = [
  {
    path: '@openzeppelin/contracts/access/Ownable.sol',
    sha256: '38578bd71c0a909840e67202db527cc6b4e6b437e0f39f0c909da32c1e30cb81',
  },
  {
    path: '@openzeppelin/contracts/interfaces/draft-IERC6093.sol',
    sha256: 'fa7068f56bc180571a6095be6eaef06d51dbe81e30cb128397d993c9599ecc30',
  },
  {
    path: '@openzeppelin/contracts/token/ERC20/ERC20.sol',
    sha256: '50f34ae16a067a41c2c1091445d11d63788e54c717677cb6d6b0e4cdea2ad21d',
  },
  {
    path: '@openzeppelin/contracts/token/ERC20/IERC20.sol',
    sha256: '01b6f5c4fa45fd38822b286ecef6daf983d27306dd6362496fa71b3e4600b72c',
  },
  {
    path: '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol',
    sha256: '0b7132f17d14d1d84b41b0bb429be62dafdff00fd3470f68724d8018eb07f57a',
  },
  {
    path: '@openzeppelin/contracts/utils/Context.sol',
    sha256: '847fda5460fee70f56f4200f59b82ae622bb03c79c77e67af010e31b7e2cc5b6',
  },
  { path: 'ErgoBridge.sol' },
  { path: 'SERG.sol' },
] as const;
const REQUIRED_SOLIDITY_BUILD_ARTIFACTS = [
  {
    name: 'SERG',
    sourcePath: 'SERG.sol',
    abiPath: 'compiled/SERG.abi',
    creationPath: 'compiled/SERG.bin',
    runtimePath: 'compiled/SERG.runtime.bin',
    metadataPath: 'compiled/SERG.metadata.json',
    storageLayoutPath: 'compiled/SERG.storage-layout.json',
  },
  {
    name: 'ErgoBridge',
    sourcePath: 'ErgoBridge.sol',
    abiPath: 'compiled/ErgoBridge.abi',
    creationPath: 'compiled/ErgoBridge.bin',
    runtimePath: 'compiled/ErgoBridge.runtime.bin',
    metadataPath: 'compiled/ErgoBridge.metadata.json',
    storageLayoutPath: 'compiled/ErgoBridge.storage-layout.json',
  },
] as const;
const REQUIRED_BRIDGE_ATOMICITY_FIXTURES = [
  {
    artifactPath: 'solidity/compiled/SERG.bin',
    fixturePath: 'template/node/src/tests/res/bridge-atomicity/SERG.bin',
  },
  {
    artifactPath: 'solidity/compiled/ErgoBridge.bin',
    fixturePath: 'template/node/src/tests/res/bridge-atomicity/ErgoBridge.bin',
  },
  {
    artifactPath: 'solidity/compiled/ErgoBridge.runtime.bin',
    fixturePath: 'template/node/src/tests/res/bridge-atomicity/ErgoBridge.runtime.bin',
  },
  {
    artifactPath: 'solidity/compiled/SERG.runtime.bin',
    fixturePath: 'template/node/src/tests/res/bridge-atomicity/SERG.runtime.bin',
  },
] as const;

export function inspectConsensusSourceBaseline(
  input: ConsensusSourceBaselineInspection,
): ConsensusSourceBaselineReport {
  const errors: string[] = [];
  const lockPath = resolve(input.bridgeRoot, 'sources', 'consensus-source-lock.json');
  let repositoryLayout: ReturnType<typeof resolveBridgeRepositoryLayout> | null = null;
  try {
    repositoryLayout = resolveBridgeRepositoryLayout({
      repositoryRoot: input.worktreeRoot,
      bridgeRoot: input.bridgeRoot,
    });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'bridge repository layout is invalid');
  }

  const lock = readJsonObject(lockPath, errors);
  const frontier = asRecord(lock?.frontier);
  const ergoNode = asRecord(lock?.ergoNode);
  const solidityBuild = asRecord(lock?.solidityBuild);
  const boundaries = asRecord(lock?.boundaries);

  let lockBindingsValidated = false;
  let solidityBuildClosureArtifactsValidated = false;
  let frontierCheckoutValidated = false;
  let ergoCheckoutValidated = false;
  let frontierPatchSha256: string | null = null;
  let ergoPatchSha256: string | null = null;

  if (lock && frontier && ergoNode && repositoryLayout) {
    const gitlinkCommit = readFrontierGitlinkCommit(
      repositoryLayout.repositoryRoot,
      repositoryLayout.frontierGitlinkPath,
      errors,
      input.gitExecutablePath,
    );
    const submoduleUrl = readSubmoduleUrl(
      repositoryLayout.repositoryRoot,
      repositoryLayout.gitmodulesPath,
      repositoryLayout.frontierSubmoduleName,
      repositoryLayout.frontierGitlinkPath,
      errors,
      input.gitExecutablePath,
    );
    frontierPatchSha256 = hashTrackedPatch(
      input.bridgeRoot,
      frontier.patchPath,
      'Frontier runtime commitment',
      errors,
    );
    ergoPatchSha256 = hashTrackedPatch(
      input.bridgeRoot,
      ergoNode.patchPath,
      'Ergo extension',
      errors,
    );

    if (gitlinkCommit && submoduleUrl && frontierPatchSha256 && ergoPatchSha256) {
      const lockValidation = validateConsensusSourceLock(lock, {
        frontierGitlinkCommit: gitlinkCommit,
        frontierSubmoduleUrl: submoduleUrl,
        frontierPatchSha256,
        ergoPatchSha256,
      });
      const fixtureValidation = validateBridgeAtomicityFixtureArtifacts(
        input.bridgeRoot,
        frontier,
      );
      const solidityValidation = validateSolidityBuildClosureArtifacts(
        input.bridgeRoot,
        solidityBuild,
      );
      errors.push(
        ...lockValidation.errors,
        ...fixtureValidation.errors,
        ...solidityValidation.errors,
      );
      solidityBuildClosureArtifactsValidated =
        solidityValidation.errors.length === 0;
      lockBindingsValidated =
        lockValidation.errors.length === 0
        && fixtureValidation.errors.length === 0
        && solidityValidation.errors.length === 0;
    }
  }

  if (input.requireFrontierCheckout) {
    if (!frontier) {
      errors.push('Frontier checkout cannot be validated without a valid source lock');
    } else {
      const frontierPath = input.frontierSourcePath ?? resolve(input.bridgeRoot, 'substrate-node');
      const patchFiles = declaredPatchPaths(frontier.files);
      const observation = inspectCheckout(
        frontierPath,
        uniquePaths([
          'Cargo.lock',
          'rust-toolchain.toml',
          'template/node/Cargo.toml',
          'template/runtime/Cargo.toml',
          ...patchFiles,
        ]),
        'Frontier',
        errors,
        input.gitExecutablePath,
      );
      if (observation) {
        const checkoutValidation = validateFrontierCheckout(frontier, observation);
        errors.push(...checkoutValidation.errors);
        frontierCheckoutValidated = checkoutValidation.errors.length === 0;
      }
    }
  }

  if (input.requireErgoCheckout) {
    if (!ergoNode) {
      errors.push('Ergo checkout cannot be validated without a valid source lock');
    } else {
      const ergoPath = input.ergoSourcePath ?? resolve(input.bridgeRoot, '.source-cache', 'ergo-node');
      const patchFiles = Array.isArray(ergoNode.files)
        ? ergoNode.files
          .map(asRecord)
          .map(file => file?.path)
          .filter((path): path is string => typeof path === 'string')
        : [];
      const observation = inspectCheckout(
        ergoPath,
        patchFiles,
        'Ergo',
        errors,
        input.gitExecutablePath,
      );
      if (observation) {
        const checkoutValidation = validateErgoCheckout(ergoNode, observation);
        errors.push(...checkoutValidation.errors);
        ergoCheckoutValidated = checkoutValidation.errors.length === 0;
      }
    }
  }

  return {
    schemaVersion: 1,
    kind: 'bridge-consensus-source-baseline-report',
    status: errors.length === 0 ? 'PASS' : 'BLOCKED',
    errors,
    checks: {
      lockBindingsValidated,
      solidityBuildClosureArtifactsValidated,
      frontierCheckoutRequired: input.requireFrontierCheckout,
      frontierCheckoutValidated,
      ergoCheckoutRequired: input.requireErgoCheckout,
      ergoCheckoutValidated,
    },
    sourceIdentity: {
      solidityBuildManifestSha256: stringOrNull(solidityBuild?.manifestSha256),
      frontierCommit: stringOrNull(frontier?.commit),
      frontierPatchSha256,
      ergoBaseCommit: stringOrNull(ergoNode?.baseCommit),
      ergoPatchSha256,
    },
    boundaries: {
      sidechainFinalityImplemented: boundaries?.sidechainFinalityImplemented === true,
      runtimeCommitmentProducerImplemented: boundaries?.runtimeCommitmentProducerImplemented === true,
      grandpaAuthorityTransitionVerificationImplemented:
        boundaries?.grandpaAuthorityTransitionVerificationImplemented === true,
      hashLinkedGrandpaVerificationImplemented:
        boundaries?.hashLinkedGrandpaVerificationImplemented === true,
      nativeRuntimeCommitmentStateVerificationImplemented:
        boundaries?.nativeRuntimeCommitmentStateVerificationImplemented === true,
      nativeFinalizedCheckpointVerificationImplemented:
        boundaries?.nativeFinalizedCheckpointVerificationImplemented === true,
      nativeRpcProofCodecImplemented:
        boundaries?.nativeRpcProofCodecImplemented === true,
      trustlessBurnVerificationImplemented: boundaries?.trustlessBurnVerificationImplemented === true,
      gate5Closed: boundaries?.gate5Closed === true,
    },
  };
}

export function validateConsensusSourceLock(
  input: unknown,
  observed: SourceLockObservation,
): SourceValidationResult {
  const errors: string[] = [];
  const lock = asRecord(input);
  if (!lock) return { errors: ['source lock must be an object'] };

  requireExact(errors, lock.schemaVersion, 3, 'schemaVersion must be 3');
  requireExact(
    errors,
    lock.kind,
    'bridge-consensus-source-lock',
    'kind must be bridge-consensus-source-lock',
  );

  validateSolidityBuildDeclaration(errors, lock.solidityBuild);

  const frontier = asRecord(lock.frontier);
  if (!frontier) {
    errors.push('frontier source lock must be an object');
  } else {
    requireExact(errors, frontier.repository, FRONTIER_REPOSITORY, 'Frontier repository must use the public upstream URL');
    requireExact(errors, frontier.path, 'substrate-node', 'Frontier bridge-relative path must be substrate-node');
    requireExact(
      errors,
      frontier.gitlinkPath,
      'ergo-sidechain-bridge/substrate-node',
      'Frontier gitlink path must match the superproject path',
    );
    requireExact(
      errors,
      frontier.submoduleName,
      'ergo-sidechain-bridge/substrate-node',
      'Frontier submodule name must match the superproject path',
    );
    requireSha1(errors, frontier.commit, 'Frontier commit');
    requireExact(errors, frontier.ref, 'stable2412', 'Frontier ref must document stable2412');
    requireSha1(errors, frontier.cargoLockBlob, 'Frontier Cargo.lock blob');
    requireSha1(errors, frontier.rustToolchainBlob, 'Frontier rust-toolchain blob');
    requireSha1(errors, frontier.nodeManifestBlob, 'Frontier node manifest blob');
    requireSha1(errors, frontier.runtimeManifestBlob, 'Frontier runtime manifest blob');
    requireExact(
      errors,
      frontier.patchPath,
      'sources/frontier/0001-bridge-runtime-commitment.patch',
      'Frontier patch path must identify the tracked runtime commitment patch',
    );
    requireSafeRelativePath(errors, frontier.patchPath, 'Frontier patch path');
    requireSha256(errors, frontier.patchSha256, 'Frontier patch SHA-256');
    validatePatchedFiles(errors, frontier.files, 'Frontier', true);
    validateBridgeAtomicityFixtureDeclaration(errors, frontier);
    const buildEnvironment = asRecord(frontier.buildEnvironment);
    if (!buildEnvironment) {
      errors.push('Frontier build environment must be an object');
    } else {
      requireExact(
        errors,
        buildEnvironment.WASM_BUILD_WORKSPACE_HINT,
        '<frontier-workspace-root>',
        'Frontier WASM build must resolve dependencies from the locked workspace root',
      );
    }
    requireExact(
      errors,
      frontier.role,
      'evm-execution-and-bridge-commitment-producer',
      'Frontier role must disclose EVM execution and bridge commitment production',
    );
    requireTrue(
      errors,
      frontier.runtimeCommitmentProducerImplemented,
      'Frontier source lock must record the implemented runtime commitment producer',
    );
    requireTrue(
      errors,
      frontier.grandpaFinalityProofRpcImplemented,
      'Frontier source lock must record the implemented GRANDPA finality-proof RPC',
    );
    requireTrue(
      errors,
      frontier.nativeGrandpaFinalityProofVerificationImplemented,
      'Frontier source lock must record the native GRANDPA finality-proof verifier',
    );
    requireTrue(
      errors,
      frontier.grandpaAuthorityTransitionProofRpcImplemented,
      'Frontier source lock must record the GRANDPA authority-transition proof RPC',
    );
    requireTrue(
      errors,
      frontier.nativeGrandpaAuthorityTransitionVerificationImplemented,
      'Frontier source lock must record native GRANDPA authority-transition verification',
    );
    requireTrue(
      errors,
      frontier.nativeHashLinkedGrandpaVerificationImplemented,
      'Frontier source lock must record hash-linked GRANDPA checkpoint verification',
    );
    requireTrue(
      errors,
      frontier.nativeRuntimeCommitmentStateProofVerificationImplemented,
      'Frontier source lock must record native runtime commitment state-proof verification',
    );
    requireTrue(
      errors,
      frontier.nativeFinalizedCheckpointVerificationImplemented,
      'Frontier source lock must record the composed native finalized-checkpoint verifier',
    );
    requireTrue(
      errors,
      frontier.nativeRpcProofCodecImplemented,
      'Frontier source lock must record the native read-only RPC proof codec',
    );

    if (!sameHex(frontier.commit, observed.frontierGitlinkCommit)) {
      errors.push('Frontier gitlink commit does not match the source lock');
    }
    if (frontier.repository !== observed.frontierSubmoduleUrl) {
      errors.push('Frontier submodule URL does not match the source lock');
    }
    if (!sameHex(frontier.patchSha256, observed.frontierPatchSha256)) {
      errors.push('Frontier runtime commitment patch SHA-256 does not match the source lock');
    }
  }

  const ergoNode = asRecord(lock.ergoNode);
  if (!ergoNode) {
    errors.push('ergoNode source lock must be an object');
  } else {
    requireExact(errors, ergoNode.repository, ERGO_REPOSITORY, 'Ergo repository must use the public upstream URL');
    requireSha1(errors, ergoNode.baseCommit, 'Ergo base commit');
    requireExact(errors, ergoNode.baseTag, 'v6.0.2', 'Ergo base tag must document v6.0.2');
    requireSha1(errors, ergoNode.patchCommitProvenance, 'Ergo patch provenance commit');
    requireExact(
      errors,
      ergoNode.patchPath,
      'sources/ergo-node/0001-sidechain-extension-fields.patch',
      'Ergo patch path must identify the tracked sidechain extension patch',
    );
    requireSafeRelativePath(errors, ergoNode.patchPath, 'Ergo patch path');
    requireSha256(errors, ergoNode.patchSha256, 'Ergo patch SHA-256');
    requireExact(
      errors,
      ergoNode.role,
      'operator-provided-ergo-extension-producer',
      'Ergo patch role must disclose operator-provided extension production',
    );
    requireExact(
      errors,
      ergoNode.commitmentInput,
      'operator-provided',
      'Ergo extension commitment input must remain operator-provided',
    );
    validatePatchedFiles(errors, ergoNode.files, 'Ergo', false);

    if (!sameHex(ergoNode.patchSha256, observed.ergoPatchSha256)) {
      errors.push('Ergo extension patch SHA-256 does not match the source lock');
    }
  }

  const boundaries = asRecord(lock.boundaries);
  if (!boundaries) {
    errors.push('source lock boundaries must be an object');
  } else {
    requireTrue(
      errors,
      boundaries.sidechainFinalityImplemented,
      'sidechain finality verification must be recorded for reviewed GRANDPA trust anchors',
    );
    requireTrue(
      errors,
      boundaries.runtimeCommitmentProducerImplemented,
      'runtime commitment production must be recorded after the canonical Frontier producer is implemented',
    );
    requireTrue(
      errors,
      boundaries.grandpaAuthorityTransitionVerificationImplemented,
      'GRANDPA authority-transition verification must be recorded after implementation',
    );
    requireTrue(
      errors,
      boundaries.hashLinkedGrandpaVerificationImplemented,
      'hash-linked GRANDPA checkpoint verification must be recorded after implementation',
    );
    requireTrue(
      errors,
      boundaries.nativeRuntimeCommitmentStateVerificationImplemented,
      'native runtime commitment state verification must be recorded after implementation',
    );
    requireTrue(
      errors,
      boundaries.nativeFinalizedCheckpointVerificationImplemented,
      'native finalized checkpoint verification must be recorded after implementation',
    );
    requireTrue(
      errors,
      boundaries.nativeRpcProofCodecImplemented,
      'native read-only RPC proof normalization must be recorded after implementation',
    );
    requireFalse(
      errors,
      boundaries.trustlessBurnVerificationImplemented,
      'trustless burn verification must remain open in the source baseline',
    );
    requireFalse(errors, boundaries.gate5Closed, 'Gate 5 must remain open in the source baseline');
  }

  return { errors };
}

export function validateSolidityBuildClosureArtifacts(
  bridgeRoot: string,
  input: unknown,
): SourceValidationResult {
  const errors: string[] = [];
  validateSolidityBuildDeclaration(errors, input);
  const declaration = asRecord(input);
  if (!declaration || declaration.manifestPath !== SOLIDITY_BUILD_MANIFEST_PATH) {
    return { errors };
  }

  const manifestBytes = readSolidityBuildFile(
    bridgeRoot,
    SOLIDITY_BUILD_MANIFEST_PATH,
    'Solidity build manifest',
    errors,
  );
  if (!manifestBytes) return { errors };
  const manifestSha256 = createHash('sha256').update(manifestBytes).digest('hex');
  if (!sameHex(declaration.manifestSha256, manifestSha256)) {
    errors.push('Solidity build manifest SHA-256 does not match the source lock');
  }

  let manifest: Record<string, unknown> | undefined;
  try {
    manifest = asRecord(JSON.parse(manifestBytes.toString('utf8')));
  } catch {
    errors.push('Solidity build manifest is not valid JSON');
  }
  if (!manifest) {
    if (!errors.includes('Solidity build manifest is not valid JSON')) {
      errors.push('Solidity build manifest must contain a JSON object');
    }
    return { errors };
  }

  requireExact(
    errors,
    manifest.schema,
    SOLIDITY_BUILD_SCHEMA,
    'Solidity build manifest schema is not supported',
  );
  validateSolidityCompilerIdentity(errors, manifest.compiler);
  validateSolidityDependencyClosure(bridgeRoot, errors, manifest.dependencyClosure);
  validateSolidityCompilerInput(bridgeRoot, errors, manifest.compilerInput);
  validateSolidityContractArtifacts(bridgeRoot, errors, manifest.contracts);
  validateSolidityBuildScope(errors, manifest.scope);
  return { errors };
}

function validateSolidityBuildDeclaration(
  errors: string[],
  input: unknown,
): void {
  const build = asRecord(input);
  if (!build) {
    errors.push('solidityBuild source lock must be an object');
    return;
  }
  requireExact(
    errors,
    build.schema,
    SOLIDITY_BUILD_SCHEMA,
    'Solidity build schema is not supported',
  );
  requireExact(
    errors,
    build.manifestPath,
    SOLIDITY_BUILD_MANIFEST_PATH,
    'Solidity build manifest path must identify the tracked manifest',
  );
  requireSafeRelativePath(errors, build.manifestPath, 'Solidity build manifest path');
  requireSha256(errors, build.manifestSha256, 'Solidity build manifest SHA-256');
  requireExact(
    errors,
    build.checkCommand,
    SOLIDITY_BUILD_CHECK_COMMAND,
    'Solidity build check command must use the package-local closure',
  );
  requireExact(
    errors,
    build.compiler,
    SOLIDITY_COMPILER,
    'Solidity compiler identity must be solc@0.8.35',
  );
  requireExact(
    errors,
    build.dependency,
    SOLIDITY_DEPENDENCY,
    'Solidity dependency identity must be @openzeppelin/contracts@5.6.1',
  );
  requireTrue(
    errors,
    build.runtimeCodeIdentityProduced,
    'Solidity build must produce exact runtime-code identity',
  );
  requireTrue(
    errors,
    build.storageLayoutIdentityProduced,
    'Solidity build must produce exact storage-layout identity',
  );
  requireFalse(
    errors,
    build.deployedCodeIdentityVerified,
    'Solidity source build must not claim deployed-code identity',
  );
}

function validateSolidityCompilerIdentity(
  errors: string[],
  input: unknown,
): void {
  const compiler = asRecord(input);
  if (!compiler) {
    errors.push('Solidity build compiler identity must be an object');
    return;
  }
  requireExact(errors, compiler.package, 'solc', 'Solidity compiler package must be solc');
  requireExact(
    errors,
    compiler.packageVersion,
    '0.8.35',
    'Solidity compiler package version must be 0.8.35',
  );
  requireExact(
    errors,
    compiler.longVersion,
    '0.8.35+commit.47b9dedd.Emscripten.clang',
    'Solidity compiler long version must be pinned exactly',
  );
}

function validateSolidityDependencyClosure(
  bridgeRoot: string,
  errors: string[],
  input: unknown,
): void {
  const closure = asRecord(input);
  if (!closure) {
    errors.push('Solidity dependency closure must be an object');
    return;
  }
  const packageJsonBytes = validateSolidityManifestFile(
    bridgeRoot,
    errors,
    closure.packageJsonPath,
    'package.json',
    closure.packageJsonSha256Hex,
    'Solidity package manifest',
  );
  const packageLockBytes = validateSolidityManifestFile(
    bridgeRoot,
    errors,
    closure.packageLockPath,
    'package-lock.json',
    closure.packageLockSha256Hex,
    'Solidity package lock',
  );
  const packages = Array.isArray(closure.packages)
    ? closure.packages.map(asRecord)
    : [];
  const requiredPackages = [
    { name: '@openzeppelin/contracts', version: '5.6.1' },
    { name: 'solc', version: '0.8.35' },
  ];
  if (packages.length !== requiredPackages.length) {
    errors.push('Solidity build manifest must bind the exact direct package set');
  }
  for (const required of requiredPackages) {
    const matches = packages.filter(entry => entry?.name === required.name);
    if (matches.length !== 1) {
      errors.push(`${required.name} must have one Solidity package binding`);
      continue;
    }
    requireExact(
      errors,
      matches[0]!.version,
      required.version,
      `${required.name} version must be ${required.version}`,
    );
    if (typeof matches[0]!.integrity !== 'string'
      || !matches[0]!.integrity.startsWith('sha512-')) {
      errors.push(`${required.name} package integrity must be SHA-512`);
    }
  }
  if (packageJsonBytes) {
    try {
      const packageJson = asRecord(JSON.parse(packageJsonBytes.toString('utf8')));
      const devDependencies = asRecord(packageJson?.devDependencies);
      const overrides = asRecord(packageJson?.overrides);
      requireExact(
        errors,
        devDependencies?.['@openzeppelin/contracts'],
        '5.6.1',
        'Solidity package manifest must pin OpenZeppelin 5.6.1',
      );
      requireExact(
        errors,
        devDependencies?.solc,
        '0.8.35',
        'Solidity package manifest must pin solc 0.8.35',
      );
      requireExact(
        errors,
        overrides?.tmp,
        '0.2.7',
        'Solidity package manifest must pin the reviewed tmp override',
      );
    } catch {
      errors.push('Solidity package manifest is not valid JSON');
    }
  }
  if (packageLockBytes) {
    try {
      const lock = asRecord(JSON.parse(packageLockBytes.toString('utf8')));
      requireExact(
        errors,
        lock?.lockfileVersion,
        3,
        'Solidity package lock must use lockfileVersion 3',
      );
      const root = asRecord(asRecord(lock?.packages)?.['']);
      const lockedPackages = asRecord(lock?.packages);
      const devDependencies = asRecord(root?.devDependencies);
      requireExact(
        errors,
        devDependencies?.['@openzeppelin/contracts'],
        '5.6.1',
        'Solidity package lock must pin OpenZeppelin 5.6.1',
      );
      requireExact(
        errors,
        devDependencies?.solc,
        '0.8.35',
        'Solidity package lock must pin solc 0.8.35',
      );
      for (const required of requiredPackages) {
        const manifestPackage = packages.find(entry => entry?.name === required.name);
        const lockPackage = asRecord(
          lockedPackages?.[`node_modules/${required.name}`],
        );
        requireExact(
          errors,
          lockPackage?.version,
          required.version,
          `${required.name} package-lock entry must pin ${required.version}`,
        );
        requireExact(
          errors,
          lockPackage?.integrity,
          manifestPackage?.integrity,
          `${required.name} manifest integrity must match package-lock`,
        );
      }
    } catch {
      errors.push('Solidity package lock is not valid JSON');
    }
  }
}

function validateSolidityCompilerInput(
  bridgeRoot: string,
  errors: string[],
  input: unknown,
): void {
  const compilerInput = asRecord(input);
  if (!compilerInput) {
    errors.push('Solidity compiler input closure must be an object');
    return;
  }
  requireExact(
    errors,
    compilerInput.lineEndings,
    'lf',
    'Solidity compiler inputs must use normalized LF line endings',
  );
  validateSolidityManifestFile(
    bridgeRoot,
    errors,
    compilerInput.buildDriverPath,
    'compile.js',
    compilerInput.buildDriverSha256Hex,
    'Solidity build driver',
  );
  const settingsBytes = validateSolidityManifestFile(
    bridgeRoot,
    errors,
    compilerInput.settingsPath,
    'solc-settings.json',
    compilerInput.settingsSha256Hex,
    'Solidity compiler settings',
  );
  let settings: unknown;
  if (settingsBytes) {
    try {
      settings = JSON.parse(settingsBytes.toString('utf8'));
    } catch {
      errors.push('Solidity compiler settings are not valid JSON');
    }
  }
  const sources = Array.isArray(compilerInput.sources)
    ? compilerInput.sources.map(asRecord)
    : [];
  const sourcePaths = sources.map(entry => entry?.path);
  const requiredSourcePaths = REQUIRED_SOLIDITY_COMPILER_SOURCES.map(source => source.path);
  if (JSON.stringify(sourcePaths) !== JSON.stringify(requiredSourcePaths)) {
    errors.push('Solidity compiler sources must match the exact reviewed source closure');
  }
  const verifiedSources: Array<{
    path: string;
    compilerInputSha256Hex: string;
  }> = [];
  for (const requiredSource of REQUIRED_SOLIDITY_COMPILER_SOURCES) {
    const matches = sources.filter(entry => entry?.path === requiredSource.path);
    if (matches.length !== 1) {
      errors.push(`${requiredSource.path} must have one compiler-input binding`);
      continue;
    }
    const sourceIdentity = validateSolidityCompilerSource(
      bridgeRoot,
      errors,
      matches[0]!,
      requiredSource,
    );
    if (sourceIdentity) verifiedSources.push(sourceIdentity);
  }
  requireSha256(
    errors,
    compilerInput.inputClosureSha256Hex,
    'Solidity compiler input closure SHA-256',
  );
  if (settings !== undefined
    && verifiedSources.length === REQUIRED_SOLIDITY_COMPILER_SOURCES.length) {
    const inputClosureSha256 = createHash('sha256').update(Buffer.from(JSON.stringify({
      language: 'Solidity',
      settings,
      sources: verifiedSources,
    }), 'utf8')).digest('hex');
    if (!sameHex(compilerInput.inputClosureSha256Hex, inputClosureSha256)) {
      errors.push('Solidity compiler input closure SHA-256 does not match the manifest');
    }
  }
}

function validateSolidityCompilerSource(
  bridgeRoot: string,
  errors: string[],
  entry: Record<string, unknown>,
  expected: { readonly path: string; readonly sha256?: string },
): { path: string; compilerInputSha256Hex: string } | undefined {
  const expectedPath = expected.path;
  requireExact(
    errors,
    entry.path,
    expectedPath,
    `Solidity compiler source path must be ${expectedPath}`,
  );
  requireSha256(
    errors,
    entry.compilerInputSha256Hex,
    `Solidity compiler source ${expectedPath} SHA-256`,
  );
  const repositoryPath = expectedPath.startsWith(SOLIDITY_OPENZEPPELIN_IMPORT_PREFIX)
    ? `solidity/node_modules/${expectedPath}`
    : `solidity/${expectedPath}`;
  if (expected.sha256 !== undefined) {
    requireExact(
      errors,
      entry.compilerInputSha256Hex,
      expected.sha256,
      `Solidity compiler source ${expectedPath} must match the reviewed package source hash`,
    );
  }
  const absolutePath = resolve(bridgeRoot, repositoryPath);
  if (expected.sha256 !== undefined && !existsSync(absolutePath)) {
    return {
      path: expectedPath,
      compilerInputSha256Hex: expected.sha256,
    };
  }
  const bytes = readSolidityBuildFile(
    bridgeRoot,
    repositoryPath,
    `Solidity compiler source ${expectedPath}`,
    errors,
  );
  if (!bytes) return undefined;
  const normalizedBytes = Buffer.from(
    bytes.toString('utf8').replace(/\r\n?/g, '\n'),
    'utf8',
  );
  const observedSha256 = createHash('sha256').update(normalizedBytes).digest('hex');
  if (!sameHex(entry.compilerInputSha256Hex, observedSha256)) {
    errors.push(
      `Solidity compiler source ${expectedPath} SHA-256 does not match the build manifest`,
    );
  }
  return {
    path: expectedPath,
    compilerInputSha256Hex: observedSha256,
  };
}

function validateSolidityContractArtifacts(
  bridgeRoot: string,
  errors: string[],
  input: unknown,
): void {
  const contracts = asRecord(input);
  if (!contracts) {
    errors.push('Solidity contract artifact closure must be an object');
    return;
  }
  for (const required of REQUIRED_SOLIDITY_BUILD_ARTIFACTS) {
    const contract = asRecord(contracts[required.name]);
    if (!contract) {
      errors.push(`${required.name} artifact closure must be an object`);
      continue;
    }
    requireExact(
      errors,
      contract.source,
      required.sourcePath,
      `${required.name} source path must be ${required.sourcePath}`,
    );
    validateSolidityFileIdentity(
      bridgeRoot,
      errors,
      contract.abi,
      required.abiPath,
      `${required.name} ABI`,
      false,
    );
    validateSolidityFileIdentity(
      bridgeRoot,
      errors,
      contract.creationBytecode,
      required.creationPath,
      `${required.name} creation bytecode`,
      true,
    );
    validateSolidityFileIdentity(
      bridgeRoot,
      errors,
      contract.runtimeBytecode,
      required.runtimePath,
      `${required.name} runtime bytecode`,
      true,
    );
    validateSolidityFileIdentity(
      bridgeRoot,
      errors,
      contract.metadata,
      required.metadataPath,
      `${required.name} metadata`,
      false,
    );
    validateSolidityFileIdentity(
      bridgeRoot,
      errors,
      contract.storageLayout,
      required.storageLayoutPath,
      `${required.name} storage layout`,
      false,
    );
  }
}

function validateSolidityFileIdentity(
  bridgeRoot: string,
  errors: string[],
  input: unknown,
  expectedPath: string,
  label: string,
  bytecode: boolean,
): void {
  const identity = asRecord(input);
  if (!identity) {
    errors.push(`${label} identity must be an object`);
    return;
  }
  const bytes = validateSolidityManifestFile(
    bridgeRoot,
    errors,
    identity.path,
    expectedPath,
    identity.fileSha256Hex,
    label,
    false,
  );
  if (!bytes) return;
  requireExact(
    errors,
    identity.fileByteLength,
    bytes.length,
    `${label} file length does not match the manifest`,
  );
  if (!bytecode) return;
  requireExact(
    errors,
    identity.encoding,
    'lowercase-hex-no-prefix',
    `${label} encoding must be lowercase hex without a prefix`,
  );
  const encoded = bytes.toString('utf8');
  if (!/^[0-9a-f]+$/.test(encoded) || encoded.length % 2 !== 0) {
    errors.push(`${label} must contain non-empty canonical bytecode hex`);
    return;
  }
  const payload = Buffer.from(encoded, 'hex');
  requireExact(
    errors,
    identity.bytecodeByteLength,
    payload.length,
    `${label} payload length does not match the manifest`,
  );
  const payloadSha256 = createHash('sha256').update(payload).digest('hex');
  if (!sameHex(identity.bytecodeSha256Hex, payloadSha256)) {
    errors.push(`${label} payload SHA-256 does not match the manifest`);
  }
}

function validateSolidityManifestFile(
  bridgeRoot: string,
  errors: string[],
  pathValue: unknown,
  expectedPath: string,
  sha256Value: unknown,
  label: string,
  normalizeLineEndings = true,
): Buffer | undefined {
  requireExact(
    errors,
    pathValue,
    expectedPath,
    `${label} path must be ${expectedPath}`,
  );
  requireSha256(errors, sha256Value, `${label} SHA-256`);
  if (pathValue !== expectedPath) return undefined;
  const bytes = readSolidityBuildFile(
    bridgeRoot,
    `solidity/${expectedPath}`,
    label,
    errors,
  );
  if (!bytes) return undefined;
  const identityBytes = normalizeLineEndings
    ? Buffer.from(bytes.toString('utf8').replace(/\r\n?/g, '\n'), 'utf8')
    : bytes;
  const observedSha256 = createHash('sha256').update(identityBytes).digest('hex');
  if (!sameHex(sha256Value, observedSha256)) {
    errors.push(`${label} SHA-256 does not match the build manifest`);
  }
  return identityBytes;
}

function readSolidityBuildFile(
  bridgeRoot: string,
  relativePath: string,
  label: string,
  errors: string[],
): Buffer | undefined {
  if (!isSafeRelativePath(relativePath)) {
    errors.push(`${label} path must be repository-relative`);
    return undefined;
  }
  const normalizedBridgeRoot = resolve(bridgeRoot);
  const filePath = resolve(normalizedBridgeRoot, relativePath);
  if (!isInsideCheckout(filePath, normalizedBridgeRoot)) {
    errors.push(`${label} path escapes the bridge repository`);
    return undefined;
  }
  if (!existsSync(filePath) || !lstatSync(filePath).isFile()) {
    errors.push(`${label} is missing or is not a regular file`);
    return undefined;
  }
  return readFileSync(filePath);
}

function validateSolidityBuildScope(
  errors: string[],
  input: unknown,
): void {
  const scope = asRecord(input);
  if (!scope) {
    errors.push('Solidity build scope must be an object');
    return;
  }
  requireExact(
    errors,
    scope.proves,
    'reproducible local source-to-artifact closure',
    'Solidity build scope must remain local source-to-artifact closure',
  );
  const expectedBoundaries = [
    'deployed runtime code or address identity',
    'bridge-to-token ownership or historical mint state',
    'sidechain finality or Gate 5 closure',
    'production readiness',
  ];
  if (!Array.isArray(scope.doesNotProve)
    || JSON.stringify(scope.doesNotProve) !== JSON.stringify(expectedBoundaries)) {
    errors.push('Solidity build manifest must preserve the exact non-claim boundaries');
  }
}

export function validateBridgeAtomicityFixtureArtifacts(
  bridgeRoot: string,
  frontierInput: unknown,
): SourceValidationResult {
  const errors: string[] = [];
  const frontier = asRecord(frontierInput);
  const bindings = Array.isArray(frontier?.bridgeAtomicityFixtures)
    ? frontier.bridgeAtomicityFixtures.map(asRecord)
    : [];
  const files = declaredPatchFiles(frontier?.files);
  const normalizedBridgeRoot = resolve(bridgeRoot);

  for (const expected of REQUIRED_BRIDGE_ATOMICITY_FIXTURES) {
    const binding = bindings.find(entry => entry?.artifactPath === expected.artifactPath);
    if (!binding || binding.fixturePath !== expected.fixturePath) {
      errors.push(`${expected.artifactPath} is not bound to the required Frontier fixture`);
      continue;
    }
    const fixtureFile = files.find(file => file.path === expected.fixturePath);
    if (!fixtureFile) {
      errors.push(`${expected.fixturePath} is not pinned by the Frontier source lock`);
      continue;
    }
    const artifactPath = resolve(normalizedBridgeRoot, expected.artifactPath);
    if (!isInsideCheckout(artifactPath, normalizedBridgeRoot)) {
      errors.push('bridge atomicity artifact path escapes the bridge repository');
      continue;
    }
    if (!existsSync(artifactPath) || !lstatSync(artifactPath).isFile()) {
      errors.push(`${expected.artifactPath} is missing or is not a regular file`);
      continue;
    }
    const bytes = readFileSync(artifactPath);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (!sameHex(binding.sha256, sha256)) {
      errors.push(`${expected.artifactPath} SHA-256 does not match the source lock`);
    }
    if (!sameHex(fixtureFile.patchedBlob, gitBlobId(bytes))) {
      errors.push(`${expected.artifactPath} bytes do not match the pinned Frontier fixture`);
    }
  }

  return { errors };
}

export function validateFrontierCheckout(
  input: unknown,
  observed: CheckoutObservation,
): CheckoutValidationResult {
  const errors: string[] = [];
  const frontier = asRecord(input);
  if (!frontier) return { errors: ['frontier source lock must be an object'], observedBlobs: observed.blobs };

  if (!sameHex(frontier.commit, observed.head)) {
    errors.push('Frontier checkout HEAD does not match the source lock');
  }
  const files = declaredPatchFiles(frontier.files);
  const expectedStatus = expectedPatchStatus(files, true);
  const observedStatus = normalizedStatus(observed.status);
  if (observedStatus !== expectedStatus) {
    errors.push('Frontier checkout changes must exactly match the declared runtime patch files');
  }

  compareBlob(errors, observed.blobs, 'Cargo.lock', frontier.cargoLockBlob, 'Frontier Cargo.lock');
  compareBlob(
    errors,
    observed.blobs,
    'rust-toolchain.toml',
    frontier.rustToolchainBlob,
    'Frontier rust-toolchain',
  );
  compareBlob(
    errors,
    observed.blobs,
    'template/node/Cargo.toml',
    frontier.nodeManifestBlob,
    'Frontier node manifest',
  );
  compareBlob(
    errors,
    observed.blobs,
    'template/runtime/Cargo.toml',
    frontier.runtimeManifestBlob,
    'Frontier runtime manifest',
  );

  for (const file of files) {
    compareBlob(
      errors,
      observed.blobs,
      file.path,
      file.patchedBlob,
      `Frontier patched blob ${file.path}`,
    );
  }

  return { errors, observedBlobs: observed.blobs, expectedStatus };
}

export function validateErgoCheckout(
  input: unknown,
  observed: CheckoutObservation,
): CheckoutValidationResult {
  const errors: string[] = [];
  const ergoNode = asRecord(input);
  if (!ergoNode) return { errors: ['ergoNode source lock must be an object'], observedBlobs: observed.blobs };

  if (!sameHex(ergoNode.baseCommit, observed.head)) {
    errors.push('Ergo checkout HEAD does not match the source lock base commit');
  }

  const files = Array.isArray(ergoNode.files)
    ? ergoNode.files.map(asRecord).filter((file): file is Record<string, unknown> => !!file)
    : [];
  const expectedLines = files
    .map(file => typeof file.path === 'string' ? ` M ${file.path}` : '')
    .filter(Boolean)
    .sort();
  const observedLines = observed.status
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(Boolean)
    .sort();
  const expectedStatus = expectedLines.join('\n');
  if (JSON.stringify(observedLines) !== JSON.stringify(expectedLines)) {
    errors.push('Ergo checkout changes must be limited to the declared patch files');
  }

  for (const file of files) {
    if (typeof file.path !== 'string') continue;
    compareBlob(
      errors,
      observed.blobs,
      file.path,
      file.patchedBlob,
      `Ergo patched blob ${file.path}`,
    );
  }

  return { errors, observedBlobs: observed.blobs, expectedStatus };
}

function validatePatchedFiles(
  errors: string[],
  value: unknown,
  label: string,
  allowAdded: boolean,
): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${label} patch files must be a non-empty array`);
    return;
  }

  const seen = new Set<string>();
  for (const entry of value) {
    const file = asRecord(entry);
    if (!file || typeof file.path !== 'string' || !isSafeRelativePath(file.path)) {
      errors.push(`${label} patch file paths must be safe repository-relative paths`);
      continue;
    }
    if (seen.has(file.path)) errors.push(`${label} patch file paths must be unique`);
    seen.add(file.path);
    const status = allowAdded ? file.status : 'modified';
    if (status !== 'modified' && status !== 'added') {
      errors.push(`${label} patch file status must be modified or added`);
      continue;
    }
    if (status === 'added') {
      if (!allowAdded) errors.push(`${label} patch files must modify existing files`);
      if (file.baseBlob !== undefined) {
        errors.push(`${label} added patch file ${file.path} must not declare a base blob`);
      }
    } else {
      requireSha1(errors, file.baseBlob, `${label} base blob ${file.path}`);
    }
    requireSha1(errors, file.patchedBlob, `${label} patched blob ${file.path}`);
  }
}

function validateBridgeAtomicityFixtureDeclaration(
  errors: string[],
  frontier: Record<string, unknown>,
): void {
  const bindings = frontier.bridgeAtomicityFixtures;
  if (!Array.isArray(bindings) || bindings.length !== REQUIRED_BRIDGE_ATOMICITY_FIXTURES.length) {
    errors.push('Frontier bridge atomicity fixtures must declare the exact required bindings');
    return;
  }
  const records = bindings.map(asRecord);
  for (const expected of REQUIRED_BRIDGE_ATOMICITY_FIXTURES) {
    const matches = records.filter(record => record?.artifactPath === expected.artifactPath);
    if (matches.length !== 1) {
      errors.push(`${expected.artifactPath} must have one bridge atomicity fixture binding`);
      continue;
    }
    const binding = matches[0]!;
    requireExact(
      errors,
      binding.fixturePath,
      expected.fixturePath,
      `${expected.artifactPath} must bind the required Frontier fixture path`,
    );
    requireSafeRelativePath(errors, binding.artifactPath, 'Bridge atomicity artifact path');
    requireSafeRelativePath(errors, binding.fixturePath, 'Bridge atomicity fixture path');
    requireSha256(errors, binding.sha256, `${expected.artifactPath} SHA-256`);
    const fixtureFile = declaredPatchFiles(frontier.files)
      .find(file => file.path === expected.fixturePath);
    if (!fixtureFile || fixtureFile.status !== 'added') {
      errors.push(`${expected.fixturePath} must be an added Frontier patch file`);
    }
  }
}

function requireSafeRelativePath(errors: string[], value: unknown, label: string): void {
  if (typeof value !== 'string' || !isSafeRelativePath(value)) {
    errors.push(`${label} must be a safe repository-relative path`);
  }
}

interface DeclaredPatchFile {
  path: string;
  status: 'modified' | 'added';
  patchedBlob: string;
}

function declaredPatchPaths(value: unknown): string[] {
  return declaredPatchFiles(value).map(file => file.path);
}

function declaredPatchFiles(value: unknown): DeclaredPatchFile[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(asRecord)
    .filter((file): file is Record<string, unknown> => !!file)
    .filter((file): file is Record<string, unknown> & {
      path: string;
      status: 'modified' | 'added';
      patchedBlob: string;
    } => (
      typeof file.path === 'string' &&
      (file.status === 'modified' || file.status === 'added') &&
      typeof file.patchedBlob === 'string'
    ))
    .map(file => ({
      path: file.path,
      status: file.status,
      patchedBlob: file.patchedBlob,
    }));
}

function expectedPatchStatus(files: DeclaredPatchFile[], allowAdded: boolean): string {
  return files
    .map(file => file.status === 'added' && allowAdded ? `?? ${file.path}` : ` M ${file.path}`)
    .sort()
    .join('\n');
}

function normalizedStatus(value: string): string {
  return value
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(Boolean)
    .sort()
    .join('\n');
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}

function isSafeRelativePath(value: string): boolean {
  return (
    value.length > 0 &&
    !value.startsWith('/') &&
    !value.startsWith('\\') &&
    !/^[A-Za-z]:/.test(value) &&
    !value.split(/[\\/]/).includes('..')
  );
}

function compareBlob(
  errors: string[],
  observed: Record<string, string>,
  path: string,
  expected: unknown,
  label: string,
): void {
  if (typeof expected !== 'string' || !sameHex(expected, observed[path])) {
    errors.push(`${label} does not match the source lock`);
  }
}

function requireSha1(errors: string[], value: unknown, label: string): void {
  if (typeof value !== 'string' || !SHA1_PATTERN.test(value)) {
    errors.push(`${label} must be a 40-character Git object ID`);
  }
}

function requireSha256(errors: string[], value: unknown, label: string): void {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    errors.push(`${label} must be 64-character hex`);
  }
}

function requireFalse(errors: string[], value: unknown, message: string): void {
  if (value !== false) errors.push(message);
}

function requireTrue(errors: string[], value: unknown, message: string): void {
  if (value !== true) errors.push(message);
}

function requireExact(
  errors: string[],
  value: unknown,
  expected: unknown,
  message: string,
): void {
  if (value !== expected) errors.push(message);
}

function sameHex(left: unknown, right: unknown): boolean {
  return (
    typeof left === 'string' &&
    typeof right === 'string' &&
    left.toLowerCase() === right.toLowerCase()
  );
}

function readJsonObject(
  path: string,
  errors: string[],
): Record<string, unknown> | undefined {
  if (!existsSync(path)) {
    errors.push('consensus source lock is missing');
    return undefined;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    const record = asRecord(parsed);
    if (!record) errors.push('consensus source lock must contain a JSON object');
    return record;
  } catch {
    errors.push('consensus source lock is not valid JSON');
    return undefined;
  }
}

function readFrontierGitlinkCommit(
  worktreeRoot: string,
  value: unknown,
  errors: string[],
  gitExecutablePath?: string,
): string | null {
  if (typeof value !== 'string' || !isSafeRelativePath(value)) {
    errors.push('Frontier gitlink path is invalid');
    return null;
  }
  try {
    const line = runGit(worktreeRoot, ['ls-files', '-s', '--', value], false, gitExecutablePath);
    const match = /^160000\s+([0-9a-f]{40})\s+0\t(.+)$/i.exec(line);
    if (!match || match[2] !== value) {
      errors.push('Frontier source is not tracked as the declared gitlink');
      return null;
    }
    return match[1].toLowerCase();
  } catch {
    errors.push('Frontier gitlink could not be inspected');
    return null;
  }
}

function readSubmoduleUrl(
  worktreeRoot: string,
  gitmodulesPath: string,
  submoduleName: string,
  gitlinkPath: string,
  errors: string[],
  gitExecutablePath?: string,
): string | null {
  if (!existsSync(gitmodulesPath)) {
    errors.push('repository .gitmodules is missing');
    return null;
  }
  try {
    const configuredPath = runGit(worktreeRoot, [
      'config',
      '-f',
      gitmodulesPath,
      '--get',
      `submodule.${submoduleName}.path`,
    ], false, gitExecutablePath);
    if (configuredPath !== gitlinkPath) {
      errors.push('Frontier submodule path does not match the repository layout');
      return null;
    }
    return runGit(worktreeRoot, [
      'config',
      '-f',
      gitmodulesPath,
      '--get',
      `submodule.${submoduleName}.url`,
    ], false, gitExecutablePath);
  } catch {
    errors.push('Frontier submodule URL could not be inspected');
    return null;
  }
}

function hashTrackedPatch(
  bridgeRoot: string,
  value: unknown,
  label: string,
  errors: string[],
): string | null {
  if (typeof value !== 'string' || !isSafeRelativePath(value)) {
    errors.push(`${label} patch path is invalid`);
    return null;
  }
  const patchPath = resolve(bridgeRoot, value);
  const normalizedBridgeRoot = resolve(bridgeRoot);
  if (!patchPath.startsWith(`${normalizedBridgeRoot}\\`) && !patchPath.startsWith(`${normalizedBridgeRoot}/`)) {
    errors.push(`${label} patch path escapes the bridge repository`);
    return null;
  }
  if (!existsSync(patchPath)) {
    errors.push(`${label} patch is missing`);
    return null;
  }
  return createHash('sha256').update(readFileSync(patchPath)).digest('hex');
}

function inspectCheckout(
  sourcePath: string,
  blobPaths: string[],
  label: string,
  errors: string[],
  gitExecutablePath?: string,
): CheckoutObservation | null {
  if (!existsSync(sourcePath)) {
    errors.push(`${label} source checkout is missing`);
    return null;
  }
  try {
    return inspectRawCheckout(sourcePath, blobPaths, gitExecutablePath);
  } catch {
    errors.push(`${label} source checkout could not be inspected`);
    return null;
  }
}

export function inspectRawCheckout(
  sourcePathInput: string,
  blobPaths: string[],
  gitExecutablePath?: string,
): CheckoutObservation {
  const sourcePath = resolve(sourcePathInput);
  const head = runGit(sourcePath, ['rev-parse', 'HEAD'], false, gitExecutablePath);
  const treeEntries = parseHeadTree(runGit(
    sourcePath,
    ['ls-tree', '-r', '-z', '--full-tree', 'HEAD'],
    true,
    gitExecutablePath,
  ));
  const indexEntries = parseIndexTree(runGit(
    sourcePath,
    ['ls-files', '--stage', '-z'],
    true,
    gitExecutablePath,
  ));
  const requested = new Set(blobPaths);
  for (const path of requested) {
    if (!isSafeCheckoutPath(path)) throw new Error('unsafe blob path');
  }

  const statusLines: string[] = [];
  const blobs: Record<string, string> = {};
  for (const entry of treeEntries) {
    if (entry.type !== 'blob' || (entry.mode !== '100644' && entry.mode !== '100755' && entry.mode !== '120000')) {
      throw new Error('checkout HEAD contains an unsupported tree entry');
    }
    const workingPath = resolve(sourcePath, entry.path);
    if (!isInsideCheckout(workingPath, sourcePath) || !existsSync(workingPath)) {
      statusLines.push(` D ${entry.path}`);
      continue;
    }
    const filesystemEntry = lstatSync(workingPath);
    if (!filesystemEntry.isFile()) {
      statusLines.push(` M ${entry.path}`);
      continue;
    }
    const bytes = readFileSync(workingPath);
    const identities = rawGitBlobIdentities(entry.path, bytes);
    if (!identities.includes(entry.objectId)) statusLines.push(` M ${entry.path}`);
    if (requested.has(entry.path)) blobs[entry.path] = identities[identities.length - 1];
  }

  const untracked = runGit(
    sourcePath,
    ['ls-files', '--others', '--exclude-per-directory=.gitignore', '-z'],
    true,
    gitExecutablePath,
  ).split('\0').filter(Boolean);
  for (const path of untracked) {
    if (!isSafeCheckoutPath(path)) throw new Error('checkout contains an unsafe untracked path');
    statusLines.push(`?? ${path}`);
  }

  for (const path of requested) {
    if (blobs[path]) continue;
    const workingPath = resolve(sourcePath, path);
    if (!isInsideCheckout(workingPath, sourcePath) || !existsSync(workingPath) || !lstatSync(workingPath).isFile()) {
      throw new Error('requested checkout blob is missing or unsupported');
    }
    const identities = rawGitBlobIdentities(path, readFileSync(workingPath));
    blobs[path] = identities[identities.length - 1];
  }

  if (!sameIndexAndHeadTree(indexEntries, treeEntries)) statusLines.push('!! INDEX DRIFT');
  return {
    head,
    status: statusLines.sort().join('\n'),
    blobs,
  };
}

interface RawHeadTreeEntry {
  mode: string;
  type: string;
  objectId: string;
  path: string;
}

interface RawIndexTreeEntry {
  mode: string;
  objectId: string;
  stage: string;
  path: string;
}

function parseHeadTree(source: string): RawHeadTreeEntry[] {
  return source.split('\0').filter(Boolean).map(record => {
    const match = /^(\d{6}) ([a-z]+) ([0-9a-f]{40})\t([^\r\n\t]+)$/.exec(record);
    if (!match || !isSafeCheckoutPath(match[4])) throw new Error('checkout HEAD tree record is malformed');
    return { mode: match[1], type: match[2], objectId: match[3], path: match[4] };
  });
}

function parseIndexTree(source: string): RawIndexTreeEntry[] {
  return source.split('\0').filter(Boolean).map(record => {
    const match = /^(\d{6}) ([0-9a-f]{40}) ([0-3])\t([^\r\n\t]+)$/.exec(record);
    if (!match || !isSafeCheckoutPath(match[4])) throw new Error('checkout index record is malformed');
    return { mode: match[1], objectId: match[2], stage: match[3], path: match[4] };
  });
}

function sameIndexAndHeadTree(index: RawIndexTreeEntry[], head: RawHeadTreeEntry[]): boolean {
  if (index.some(entry => entry.stage !== '0')) return false;
  const indexRecords = index.map(entry => `${entry.mode} ${entry.objectId}\t${entry.path}`).sort();
  const headRecords = head.map(entry => `${entry.mode} ${entry.objectId}\t${entry.path}`).sort();
  return (
    indexRecords.length === headRecords.length
    && indexRecords.every((record, position) => record === headRecords[position])
  );
}

function rawGitBlobIdentities(path: string, bytes: Buffer): string[] {
  const identities = [gitBlobId(bytes)];
  if (isControlledCrLfTextPath(path) && bytes.includes(0x0d)) {
    const normalized = Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
    if (!normalized.equals(bytes)) identities.push(gitBlobId(normalized));
  }
  return identities;
}

function isControlledCrLfTextPath(path: string): boolean {
  const name = path.split(/[\\/]/).at(-1)?.toLowerCase() ?? '';
  return (
    /\.(?:bat|bib|cfg|cmd|conf|css|csv|dat|dockerignore|editorconfig|gitattributes|gitignore|gnu|gradle|hbs|html|ini|java|js|jsx|json|kt|lock|md|mjs|nix|orig|properties|ps1|py|rej|rs|sample|sbt|scala|scss|sh|sol|stderr|svg|tex|toml|ts|tsx|tsv|txt|uxf|xml|ya?ml)$/i.test(name)
    || ['codeowners', 'dockerfile', 'license', 'makefile', 'notice'].includes(name)
    || /^(?:header|license)-/.test(name)
  );
}

function gitBlobId(bytes: Buffer): string {
  return createHash('sha1')
    .update(Buffer.from(`blob ${bytes.length}\0`, 'utf8'))
    .update(bytes)
    .digest('hex');
}

function isSafeCheckoutPath(path: string): boolean {
  return isSafeRelativePath(path) && !/[\r\n\t]/.test(path);
}

function isInsideCheckout(path: string, root: string): boolean {
  return path.startsWith(`${root}\\`) || path.startsWith(`${root}/`);
}

export function isRawOrControlledCrLfEquivalent(
  path: string,
  workingBytes: Buffer,
  headBytes: Buffer,
): boolean {
  if (workingBytes.equals(headBytes)) return true;
  if (!isControlledCrLfTextPath(path)) return false;
  if (headBytes.includes(0x0d)) return false;
  const normalized = Buffer.from(
    workingBytes.toString('latin1').replace(/\r\n/g, '\n'),
    'latin1',
  );
  return normalized.equals(headBytes);
}

export function normalizeCheckoutStatus(
  status: string,
  isWorkingBlobEqualToHead: (path: string) => boolean,
): string {
  return status
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(line => {
      if (!line.startsWith(' M ') || line.includes(' -> ')) return true;
      const path = line.slice(3);
      if (!isSafeRelativePath(path)) return true;
      return !isWorkingBlobEqualToHead(path);
    })
    .join('\n');
}

function runGit(
  cwd: string,
  args: string[],
  preserveEmpty = false,
  gitExecutablePath?: string,
): string {
  const executable = gitExecutablePath ?? 'git';
  const safeHome = resolve(cwd, '.git', 'bridge-no-global-home');
  const env: NodeJS.ProcessEnv = {
    PATH: gitExecutablePath ? dirname(gitExecutablePath) : process.env.PATH,
    HOME: safeHome,
    USERPROFILE: safeHome,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_ATTR_NOSYSTEM: '1',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    GIT_PAGER: 'cat',
    LC_ALL: 'C',
    LANG: 'C',
  };
  for (const key of ['SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP']) {
    const value = process.env[key];
    if (typeof value === 'string' && value.length > 0) env[key] = value;
  }
  const output = execFileSync(executable, [
    '-c',
    'core.fsmonitor=false',
    '-c',
    'core.untrackedCache=false',
    ...args,
  ], {
    cwd,
    env,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trimEnd();
  return preserveEmpty ? output : output.trim();
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
