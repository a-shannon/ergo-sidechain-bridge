import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, resolve, sep as pathSeparator } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

import {
  discoverBridgeRepositoryRoot,
  resolveBridgeRepositoryLayout,
} from './bridge-repository-layout.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRIDGE_ROOT = resolve(__dirname, '..', '..');
const REPOSITORY_ROOT = discoverBridgeRepositoryRoot(BRIDGE_ROOT);
const REPOSITORY_LAYOUT = resolveBridgeRepositoryLayout({
  repositoryRoot: REPOSITORY_ROOT,
  bridgeRoot: BRIDGE_ROOT,
});
const MODULE_PATH = './consensus-source-baseline.js';
const CLI_MODULE_PATH = './scripts/consensus-source-baseline.js';

const frontier = {
  repository: 'https://github.com/polkadot-evm/frontier.git',
  path: 'substrate-node',
  gitlinkPath: 'ergo-sidechain-bridge/substrate-node',
  submoduleName: 'ergo-sidechain-bridge/substrate-node',
  commit: '7'.repeat(40),
  ref: 'stable2412',
  cargoLockBlob: 'a'.repeat(40),
  rustToolchainBlob: 'b'.repeat(40),
  nodeManifestBlob: 'c'.repeat(40),
  runtimeManifestBlob: 'd'.repeat(40),
  patchPath: 'sources/frontier/0001-bridge-runtime-commitment.patch',
  patchSha256: '6'.repeat(64),
  bridgeAtomicityFixtures: [
    {
      artifactPath: 'solidity/compiled/SERG.bin',
      fixturePath: 'template/node/src/tests/res/bridge-atomicity/SERG.bin',
      sha256: '8'.repeat(64),
    },
    {
      artifactPath: 'solidity/compiled/ErgoBridge.bin',
      fixturePath: 'template/node/src/tests/res/bridge-atomicity/ErgoBridge.bin',
      sha256: '9'.repeat(64),
    },
    {
      artifactPath: 'solidity/compiled/ErgoBridge.runtime.bin',
      fixturePath: 'template/node/src/tests/res/bridge-atomicity/ErgoBridge.runtime.bin',
      sha256: 'a'.repeat(64),
    },
    {
      artifactPath: 'solidity/compiled/SERG.runtime.bin',
      fixturePath: 'template/node/src/tests/res/bridge-atomicity/SERG.runtime.bin',
      sha256: 'b'.repeat(64),
    },
  ],
  files: [
    {
      path: 'frame/ethereum/src/lib.rs',
      status: 'modified',
      baseBlob: '1'.repeat(40),
      patchedBlob: '2'.repeat(40),
    },
    {
      path: 'template/runtime/src/bridge_commitment.rs',
      status: 'added',
      patchedBlob: '3'.repeat(40),
    },
    {
      path: 'template/node/src/tests/res/bridge-atomicity/SERG.bin',
      status: 'added',
      patchedBlob: '4'.repeat(40),
    },
    {
      path: 'template/node/src/tests/res/bridge-atomicity/ErgoBridge.bin',
      status: 'added',
      patchedBlob: '5'.repeat(40),
    },
    {
      path: 'template/node/src/tests/res/bridge-atomicity/ErgoBridge.runtime.bin',
      status: 'added',
      patchedBlob: '6'.repeat(40),
    },
    {
      path: 'template/node/src/tests/res/bridge-atomicity/SERG.runtime.bin',
      status: 'added',
      patchedBlob: '7'.repeat(40),
    },
  ],
  buildEnvironment: {
    WASM_BUILD_WORKSPACE_HINT: '<frontier-workspace-root>',
  },
  role: 'evm-execution-and-bridge-commitment-producer',
  runtimeCommitmentProducerImplemented: true,
  grandpaFinalityProofRpcImplemented: true,
  nativeGrandpaFinalityProofVerificationImplemented: true,
  grandpaAuthorityTransitionProofRpcImplemented: true,
  nativeGrandpaAuthorityTransitionVerificationImplemented: true,
  nativeHashLinkedGrandpaVerificationImplemented: true,
  nativeRuntimeCommitmentStateProofVerificationImplemented: true,
  nativeFinalizedCheckpointVerificationImplemented: true,
  nativeRpcProofCodecImplemented: true,
};

const ergoNode = {
  repository: 'https://github.com/ergoplatform/ergo.git',
  baseCommit: '2'.repeat(40),
  baseTag: 'v6.0.2',
  patchCommitProvenance: 'e'.repeat(40),
  patchPath: 'sources/ergo-node/0001-sidechain-extension-fields.patch',
  patchSha256: 'f'.repeat(64),
  role: 'operator-provided-ergo-extension-producer',
  commitmentInput: 'operator-provided',
  files: [
    {
      path: 'src/main/scala/org/ergoplatform/mining/CandidateGenerator.scala',
      baseBlob: '1'.repeat(40),
      patchedBlob: '3'.repeat(40),
    },
    {
      path: 'src/test/scala/org/ergoplatform/mining/CandidateGeneratorSpec.scala',
      baseBlob: '4'.repeat(40),
      patchedBlob: '5'.repeat(40),
    },
  ],
};

const solidityBuild = {
  schema: 'ergo-sidechain-bridge/solidity-build-closure/v1',
  manifestPath: 'solidity/compiled/build-manifest.json',
  manifestSha256: '0'.repeat(64),
  checkCommand: 'npm --prefix solidity run check',
  compiler: 'solc@0.8.35',
  dependency: '@openzeppelin/contracts@5.6.1',
  runtimeCodeIdentityProduced: true,
  storageLayoutIdentityProduced: true,
  deployedCodeIdentityVerified: false,
};

const validLock = {
  schemaVersion: 3,
  kind: 'bridge-consensus-source-lock',
  solidityBuild,
  frontier,
  ergoNode,
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

async function loadBaselineModule(): Promise<any | undefined> {
  try {
    return await import(MODULE_PATH);
  } catch {
    return undefined;
  }
}

async function loadCliModule(): Promise<any | undefined> {
  try {
    return await import(CLI_MODULE_PATH);
  } catch {
    return undefined;
  }
}

function extractAddedPatchFile(patch: string, path: string): string {
  const marker = `diff --git a/${path} b/${path}\n`;
  const start = patch.indexOf(marker);
  if (start < 0) throw new Error(`patch does not add ${path}`);
  const next = patch.indexOf('\ndiff --git ', start + marker.length);
  const section = patch.slice(start, next < 0 ? undefined : next);
  const sourceLines = section
    .split('\n')
    .filter(line => line.startsWith('+') && line !== `+++ b/${path}`)
    .map(line => line.slice(1));
  if (sourceLines.length === 0) throw new Error(`patch body for ${path} is empty`);
  return sourceLines.join('\n');
}

function extractTopLevelRustFunction(source: string, name: string): string {
  const marker = `fn ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Rust function ${name} is absent`);
  const next = source.indexOf('\nfn ', start + marker.length);
  return source.slice(start, next < 0 ? undefined : next);
}

describe('consensus source baseline', () => {
  it('tracks the reachable Frontier submodule and Ergo patch artifacts in the repository', () => {
    const gitmodulesPath = resolve(REPOSITORY_ROOT, '.gitmodules');
    const attributesPath = resolve(REPOSITORY_ROOT, '.gitattributes');
    const standaloneGitmodulesPath = resolve(BRIDGE_ROOT, '.gitmodules');
    const standaloneAttributesPath = resolve(BRIDGE_ROOT, '.gitattributes');
    const lockPath = resolve(BRIDGE_ROOT, 'sources', 'consensus-source-lock.json');
    const ergoPatchPath = resolve(
      BRIDGE_ROOT,
      'sources',
      'ergo-node',
      '0001-sidechain-extension-fields.patch',
    );
    const frontierPatchPath = resolve(
      BRIDGE_ROOT,
      'sources',
      'frontier',
      '0001-bridge-runtime-commitment.patch',
    );

    expect(existsSync(gitmodulesPath), '.gitmodules').toBe(true);
    expect(existsSync(attributesPath), '.gitattributes').toBe(true);
    expect(existsSync(standaloneGitmodulesPath), 'standalone .gitmodules').toBe(true);
    expect(existsSync(standaloneAttributesPath), 'standalone .gitattributes').toBe(true);
    expect(existsSync(lockPath), 'source lock').toBe(true);
    expect(existsSync(ergoPatchPath), 'Ergo patch').toBe(true);
    expect(existsSync(frontierPatchPath), 'Frontier patch').toBe(true);

    if (existsSync(gitmodulesPath)) {
      const gitmodules = readFileSync(gitmodulesPath, 'utf8');
      expect(gitmodules).toContain(`path = ${REPOSITORY_LAYOUT.frontierGitlinkPath}`);
      expect(gitmodules).toContain('url = https://github.com/polkadot-evm/frontier.git');
    }
    if (existsSync(attributesPath)) {
      const attributes = readFileSync(attributesPath, 'utf8');
      const bridgePrefix = REPOSITORY_LAYOUT.mode === 'standalone'
        ? ''
        : 'ergo-sidechain-bridge/';
      expect(attributes).toContain(
        `${bridgePrefix}sources/ergo-node/*.patch text eol=lf whitespace=-blank-at-eol,-space-before-tab`,
      );
      expect(attributes).toContain(
        `${bridgePrefix}sources/frontier/*.patch text eol=lf whitespace=-blank-at-eol,-space-before-tab`,
      );
      expect(attributes).toContain(
        `${bridgePrefix}sources/native-verifier-toolchain-lock.json text eol=lf`,
      );
    }
    if (existsSync(standaloneGitmodulesPath)) {
      const gitmodules = readFileSync(standaloneGitmodulesPath, 'utf8');
      expect(gitmodules).toContain('path = substrate-node');
      expect(gitmodules).toContain('url = https://github.com/polkadot-evm/frontier.git');
    }
    if (existsSync(standaloneAttributesPath)) {
      const attributes = readFileSync(standaloneAttributesPath, 'utf8');
      expect(attributes).toContain(
        'sources/ergo-node/*.patch text eol=lf whitespace=-blank-at-eol,-space-before-tab',
      );
      expect(attributes).toContain(
        'sources/frontier/*.patch text eol=lf whitespace=-blank-at-eol,-space-before-tab',
      );
      expect(attributes).toContain('sources/consensus-source-lock.json text eol=lf');
    }
  });

  it('derives the LAB source-proof validity window from the activated runtime profile', () => {
    const frontierPatch = readFileSync(
      resolve(
        BRIDGE_ROOT,
        'sources',
        'frontier',
        '0001-bridge-runtime-commitment.patch',
      ),
      'utf8',
    );
    const rustSource = extractAddedPatchFile(
      frontierPatch,
      'template/node/src/bridge_federated_lab_reservation_tests.rs',
    );
    const fixture = extractTopLevelRustFunction(
      rustSource,
      'unactivated_fixture',
    );
    const admission = extractTopLevelRustFunction(
      rustSource,
      'federated_lab_reservation_is_admitted_without_evm_state_change',
    );

    expect(fixture).toContain(
      '\tlet issued_at_native_height = profile.activation_height;',
    );
    expect(fixture).toContain(
      '\tlet expires_at_native_height = issued_at_native_height\n'
        + '\t\t.checked_add(u64::from(profile.max_pending_blocks))\n'
        + '\t\t.expect("LAB source-proof validity window fits u64");',
    );
    expect(fixture).not.toMatch(
      /let expires_at_native_height\s*=\s*\d[\d_]*;/u,
    );
    expect(fixture).toContain(
      '\tlet proof = source_proof_from_environment_or_fixture(\n'
        + '\t\t&profile,\n'
        + '\t\t&statement,\n'
        + '\t\tissued_at_native_height,\n'
        + '\t\texpires_at_native_height,\n'
        + '\t);',
    );
    expect(fixture).not.toMatch(
      /source_proof_from_environment_or_fixture\(\s*&profile,\s*&statement,\s*\d[\d_]*,\s*\d[\d_]*,?\s*\)/u,
    );
    expect(admission).toContain(
      '\t\tfixture\n'
        + '\t\t\t.profile\n'
        + '\t\t\t.activation_height\n'
        + '\t\t\t.checked_add(u64::from(fixture.profile.max_pending_blocks))',
    );
    expect(admission).not.toMatch(
      /assert_eq!\(\s*pending\.expires_at_native_height,\s*\d[\d_]*,?\s*\)/u,
    );
  });

  it('pins effective LF checkout semantics for the external-fee JVM fixture closure', () => {
    const paths = [
      'contracts/MainChainAggregateUnlockAuthenticatedExternalFeeV1.es',
      'contracts/DoubleUnlockPreventionAuthenticatedExternalFeeV1.es',
      'contracts/DoubleUnlockPreventionAuthenticated.es',
      'relayer/test-vectors/authenticated-external-fee-settlement-jvm-compiler-v1.json',
      'scripts/run-authenticated-external-fee-settlement-jvm-v1.ps1',
      'validity-proof/consumer-jvm/BridgeAuthenticatedExternalFeeSettlementAcceptanceV1Spec.scala',
    ];
    const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'bridge-attributes-'));
    const emptyGlobalAttributes = resolve(fixtureRoot, 'empty-global-attributes');
    writeFileSync(emptyGlobalAttributes, '');
    const assertLfAttributes = (root: string, targets: string[]) => {
      const output = execFileSync(
        'git',
        [
          '-c',
          `core.attributesFile=${emptyGlobalAttributes.replace(/\\/g, '/')}`,
          'check-attr',
          'text',
          'eol',
          '--',
          ...targets,
        ],
        {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            GIT_ATTR_NOSYSTEM: '1',
          },
          windowsHide: true,
        },
      );
      for (const target of targets) {
        expect(output).toContain(`${target}: text: set`);
        expect(output).toContain(`${target}: eol: lf`);
      }
    };

    try {
      if (REPOSITORY_LAYOUT.mode === 'superproject') {
        const nestedRoot = resolve(fixtureRoot, 'nested');
        const nestedBridgeRoot = resolve(nestedRoot, 'ergo-sidechain-bridge');
        mkdirSync(nestedBridgeRoot, { recursive: true });
        execFileSync('git', ['init', '--quiet'], {
          cwd: nestedRoot,
          windowsHide: true,
        });
        cpSync(
          resolve(REPOSITORY_ROOT, '.gitattributes'),
          resolve(nestedRoot, '.gitattributes'),
        );
        cpSync(
          resolve(BRIDGE_ROOT, '.gitattributes'),
          resolve(nestedBridgeRoot, '.gitattributes'),
        );
        assertLfAttributes(
          nestedRoot,
          paths.map(path => `ergo-sidechain-bridge/${path}`),
        );
      }

      const standaloneRoot = resolve(fixtureRoot, 'standalone');
      mkdirSync(standaloneRoot, { recursive: true });
      execFileSync('git', ['init', '--quiet'], {
        cwd: standaloneRoot,
        windowsHide: true,
      });
      cpSync(
        resolve(BRIDGE_ROOT, '.gitattributes'),
        resolve(standaloneRoot, '.gitattributes'),
      );
      assertLfAttributes(standaloneRoot, paths);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('normalizes current and synthetic superproject and standalone source layouts', () => {
    expect(REPOSITORY_LAYOUT).toMatchObject({
      mode: REPOSITORY_LAYOUT.mode,
      frontierGitlinkPath: REPOSITORY_LAYOUT.mode === 'standalone'
        ? 'substrate-node'
        : 'ergo-sidechain-bridge/substrate-node',
    });
    const syntheticSuperprojectRoot = resolve(tmpdir(), 'bridge-layout-superproject');
    const syntheticBridgeRoot = resolve(syntheticSuperprojectRoot, 'ergo-sidechain-bridge');
    expect(resolveBridgeRepositoryLayout({
      repositoryRoot: syntheticSuperprojectRoot,
      bridgeRoot: syntheticBridgeRoot,
    })).toMatchObject({
      mode: 'superproject',
      frontierGitlinkPath: 'ergo-sidechain-bridge/substrate-node',
      frontierSubmoduleName: 'ergo-sidechain-bridge/substrate-node',
    });
    expect(resolveBridgeRepositoryLayout({
      repositoryRoot: BRIDGE_ROOT,
      bridgeRoot: BRIDGE_ROOT,
    })).toMatchObject({
      mode: 'standalone',
      frontierGitlinkPath: 'substrate-node',
      frontierSubmoduleName: 'substrate-node',
    });
    expect(() => resolveBridgeRepositoryLayout({
      repositoryRoot: resolve(REPOSITORY_ROOT, 'unrelated'),
      bridgeRoot: BRIDGE_ROOT,
    })).toThrow('bridge root must be either the Git repository root');
  });

  it('discovers a real standalone repository with the local Frontier gitlink shape', () => {
    const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'bridge-standalone-layout-'));
    const root = resolve(fixtureRoot, 'physical');
    const aliasRoot = resolve(fixtureRoot, 'alias');
    mkdirSync(root);
    symlinkSync(root, aliasRoot, process.platform === 'win32' ? 'junction' : 'dir');
    const git = (...args: string[]) => execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    }).trim();
    try {
      git('init');
      writeFileSync(
        resolve(root, '.gitmodules'),
        '[submodule "substrate-node"]\n\tpath = substrate-node\n\turl = https://github.com/polkadot-evm/frontier.git\n',
      );
      git('add', '.gitmodules');
      git(
        'update-index',
        '--add',
        '--cacheinfo',
        '160000,75329a2df49e2cc7981485392c31160929d1bd48,substrate-node',
      );

      const discoveredRoot = discoverBridgeRepositoryRoot(aliasRoot);
      const canonicalRoot = realpathSync.native(resolve(root));
      expect(resolve(aliasRoot)).not.toBe(canonicalRoot);
      expect(discoveredRoot).toBe(canonicalRoot);
      expect(resolveBridgeRepositoryLayout({
        repositoryRoot: discoveredRoot,
        bridgeRoot: aliasRoot,
      })).toMatchObject({
        mode: 'standalone',
        repositoryRoot: canonicalRoot,
        bridgeRoot: resolve(aliasRoot),
        frontierGitlinkPath: 'substrate-node',
        frontierSubmoduleName: 'substrate-node',
      });
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('binds the checked-in Solidity bytecode to the exact Frontier rollback fixtures', async () => {
    const baseline = await loadBaselineModule();
    expect(baseline, 'consensus-source-baseline module').toBeDefined();
    if (!baseline) return;

    const lock = JSON.parse(
      readFileSync(resolve(BRIDGE_ROOT, 'sources', 'consensus-source-lock.json'), 'utf8'),
    );
    expect(
      baseline.validateBridgeAtomicityFixtureArtifacts(BRIDGE_ROOT, lock.frontier).errors,
    ).toEqual([]);

    const digestDrift = structuredClone(lock.frontier);
    digestDrift.bridgeAtomicityFixtures[0].sha256 = '0'.repeat(64);
    expect(
      baseline.validateBridgeAtomicityFixtureArtifacts(BRIDGE_ROOT, digestDrift).errors,
    ).toContain('solidity/compiled/SERG.bin SHA-256 does not match the source lock');

    const fixtureDrift = structuredClone(lock.frontier);
    fixtureDrift.files.find(
      (file: any) => file.path === 'template/node/src/tests/res/bridge-atomicity/ErgoBridge.bin',
    ).patchedBlob = '0'.repeat(40);
    expect(
      baseline.validateBridgeAtomicityFixtureArtifacts(BRIDGE_ROOT, fixtureDrift).errors,
    ).toContain(
      'solidity/compiled/ErgoBridge.bin bytes do not match the pinned Frontier fixture',
    );
  });

  it('validates the reproducible Solidity artifact closure without claiming deployment identity', async () => {
    const baseline = await loadBaselineModule();
    expect(baseline, 'consensus-source-baseline module').toBeDefined();
    if (!baseline) return;

    const lock = JSON.parse(
      readFileSync(resolve(BRIDGE_ROOT, 'sources', 'consensus-source-lock.json'), 'utf8'),
    );
    expect(
      baseline.validateSolidityBuildClosureArtifacts(BRIDGE_ROOT, lock.solidityBuild).errors,
    ).toEqual([]);

    const digestDrift = structuredClone(lock.solidityBuild);
    digestDrift.manifestSha256 = '0'.repeat(64);
    expect(
      baseline.validateSolidityBuildClosureArtifacts(BRIDGE_ROOT, digestDrift).errors,
    ).toContain('Solidity build manifest SHA-256 does not match the source lock');

    const temporaryRoot = createSolidityClosureFixture();
    try {
      const runtimePath = resolve(
        temporaryRoot,
        'solidity',
        'compiled',
        'SERG.runtime.bin',
      );
      const runtimeHex = readFileSync(runtimePath, 'utf8');
      writeFileSync(
        runtimePath,
        `${runtimeHex.startsWith('00') ? '01' : '00'}${runtimeHex.slice(2)}`,
        'utf8',
      );
      expect(
        baseline.validateSolidityBuildClosureArtifacts(
          temporaryRoot,
          lock.solidityBuild,
        ).errors,
      ).toEqual([
        'SERG runtime bytecode SHA-256 does not match the build manifest',
        'SERG runtime bytecode payload SHA-256 does not match the manifest',
      ]);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('validates the pinned Solidity compiler closure without installed packages', async () => {
    const baseline = await loadBaselineModule();
    expect(baseline, 'consensus-source-baseline module').toBeDefined();
    if (!baseline) return;

    const lock = JSON.parse(
      readFileSync(resolve(BRIDGE_ROOT, 'sources', 'consensus-source-lock.json'), 'utf8'),
    );
    const temporaryRoot = createSolidityClosureFixture(false);
    try {
      expect(
        baseline.validateSolidityBuildClosureArtifacts(
          temporaryRoot,
          lock.solidityBuild,
        ).errors,
      ).toEqual([]);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('rejects inconsistent Solidity compiler input closure metadata', async () => {
    const baseline = await loadBaselineModule();
    expect(baseline, 'consensus-source-baseline module').toBeDefined();
    if (!baseline) return;

    const lock = JSON.parse(
      readFileSync(resolve(BRIDGE_ROOT, 'sources', 'consensus-source-lock.json'), 'utf8'),
    );
    const temporaryRoot = createSolidityClosureFixture();
    try {
      const manifestPath = resolve(
        temporaryRoot,
        'solidity',
        'compiled',
        'build-manifest.json',
      );
      const originalManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const cases = [
        {
          mutate(manifest: any) {
            manifest.compilerInput.inputClosureSha256Hex = '0'.repeat(64);
          },
          expected: 'Solidity compiler input closure SHA-256 does not match the manifest',
        },
        {
          mutate(manifest: any) {
            manifest.compilerInput.sources = manifest.compilerInput.sources.slice(1);
          },
          expected: 'Solidity compiler sources must match the exact reviewed source closure',
        },
        {
          mutate(manifest: any) {
            manifest.compilerInput.sources.splice(
              1,
              0,
              structuredClone(manifest.compilerInput.sources[0]),
            );
          },
          expected: 'Solidity compiler sources must match the exact reviewed source closure',
        },
        {
          mutate(manifest: any) {
            manifest.compilerInput.sources[0].compilerInputSha256Hex = '0'.repeat(64);
          },
          expected:
            'Solidity compiler source @openzeppelin/contracts/access/Ownable.sol SHA-256 does not match the build manifest',
        },
      ];

      for (const testCase of cases) {
        const manifest = structuredClone(originalManifest);
        testCase.mutate(manifest);
        const declaration = writeBoundSolidityManifest(
          temporaryRoot,
          lock.solidityBuild,
          manifest,
        );
        expect(
          baseline.validateSolidityBuildClosureArtifacts(
            temporaryRoot,
            declaration,
          ).errors,
        ).toContain(testCase.expected);
      }
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('accepts exact immutable source bindings while preserving open trust boundaries', async () => {
    const baseline = await loadBaselineModule();
    expect(baseline, 'consensus-source-baseline module').toBeDefined();
    if (!baseline) return;

    const result = baseline.validateConsensusSourceLock(validLock, {
      frontierGitlinkCommit: frontier.commit,
      frontierSubmoduleUrl: frontier.repository,
      frontierPatchSha256: frontier.patchSha256,
      ergoPatchSha256: ergoNode.patchSha256,
    });

    expect(result.errors).toEqual([]);
  });

  it('rejects gitlink, patch, or trust-boundary drift', async () => {
    const baseline = await loadBaselineModule();
    expect(baseline, 'consensus-source-baseline module').toBeDefined();
    if (!baseline) return;

    const drifted = structuredClone(validLock);
    drifted.frontier.buildEnvironment.WASM_BUILD_WORKSPACE_HINT = '.';
    drifted.frontier.grandpaFinalityProofRpcImplemented = false;
    drifted.frontier.nativeGrandpaFinalityProofVerificationImplemented = false;
    drifted.frontier.grandpaAuthorityTransitionProofRpcImplemented = false;
    drifted.frontier.nativeGrandpaAuthorityTransitionVerificationImplemented = false;
    drifted.frontier.nativeHashLinkedGrandpaVerificationImplemented = false;
    drifted.frontier.nativeRuntimeCommitmentStateProofVerificationImplemented = false;
    drifted.frontier.nativeFinalizedCheckpointVerificationImplemented = false;
    drifted.frontier.nativeRpcProofCodecImplemented = false;
    drifted.boundaries.sidechainFinalityImplemented = false;
    drifted.boundaries.runtimeCommitmentProducerImplemented = false;
    drifted.boundaries.grandpaAuthorityTransitionVerificationImplemented = false;
    drifted.boundaries.hashLinkedGrandpaVerificationImplemented = false;
    drifted.boundaries.nativeRuntimeCommitmentStateVerificationImplemented = false;
    drifted.boundaries.nativeFinalizedCheckpointVerificationImplemented = false;
    drifted.boundaries.nativeRpcProofCodecImplemented = false;
    const result = baseline.validateConsensusSourceLock(drifted, {
      frontierGitlinkCommit: '9'.repeat(40),
      frontierSubmoduleUrl: frontier.repository,
      frontierPatchSha256: '0'.repeat(64),
      ergoPatchSha256: '8'.repeat(64),
    });

    expect(result.errors).toContain('Frontier gitlink commit does not match the source lock');
    expect(result.errors).toContain(
      'Frontier WASM build must resolve dependencies from the locked workspace root',
    );
    expect(result.errors).toContain('Ergo extension patch SHA-256 does not match the source lock');
    expect(result.errors).toContain(
      'Frontier runtime commitment patch SHA-256 does not match the source lock',
    );
    expect(result.errors).toContain(
      'runtime commitment production must be recorded after the canonical Frontier producer is implemented',
    );
    expect(result.errors).toContain(
      'Frontier source lock must record the implemented GRANDPA finality-proof RPC',
    );
    expect(result.errors).toContain(
      'Frontier source lock must record the native GRANDPA finality-proof verifier',
    );
    expect(result.errors).toContain(
      'Frontier source lock must record the GRANDPA authority-transition proof RPC',
    );
    expect(result.errors).toContain(
      'Frontier source lock must record native GRANDPA authority-transition verification',
    );
    expect(result.errors).toContain(
      'Frontier source lock must record hash-linked GRANDPA checkpoint verification',
    );
    expect(result.errors).toContain(
      'GRANDPA authority-transition verification must be recorded after implementation',
    );
    expect(result.errors).toContain(
      'hash-linked GRANDPA checkpoint verification must be recorded after implementation',
    );
    expect(result.errors).toContain(
      'Frontier source lock must record native runtime commitment state-proof verification',
    );
    expect(result.errors).toContain(
      'native runtime commitment state verification must be recorded after implementation',
    );
    expect(result.errors).toContain(
      'Frontier source lock must record the composed native finalized-checkpoint verifier',
    );
    expect(result.errors).toContain(
      'native finalized checkpoint verification must be recorded after implementation',
    );
    expect(result.errors).toContain(
      'sidechain finality verification must be recorded for reviewed GRANDPA trust anchors',
    );
  });

  it('accepts only the pinned Frontier base plus exact declared runtime patch', async () => {
    const baseline = await loadBaselineModule();
    expect(baseline, 'consensus-source-baseline module').toBeDefined();
    if (!baseline) return;

    const patchedBlobs = Object.fromEntries(
      frontier.files.map((file: any) => [file.path, file.patchedBlob]),
    );
    const expectedStatus = frontier.files
      .map((file: any) => file.status === 'added' ? `?? ${file.path}` : ` M ${file.path}`)
      .sort()
      .join('\n');
    const exact = baseline.validateFrontierCheckout(frontier, {
      head: frontier.commit,
      status: expectedStatus,
      blobs: {
        'Cargo.lock': frontier.cargoLockBlob,
        'rust-toolchain.toml': frontier.rustToolchainBlob,
        'template/node/Cargo.toml': frontier.nodeManifestBlob,
        'template/runtime/Cargo.toml': frontier.runtimeManifestBlob,
        ...patchedBlobs,
      },
    });
    expect(exact.errors).toEqual([]);

    const cleanUnpatched = baseline.validateFrontierCheckout(frontier, {
      head: frontier.commit,
      status: '',
      blobs: exact.observedBlobs,
    });
    expect(cleanUnpatched.errors).toContain(
      'Frontier checkout changes must exactly match the declared runtime patch files',
    );

    const extraChange = baseline.validateFrontierCheckout(frontier, {
      head: frontier.commit,
      status: `${expectedStatus}\n?? unexpected.txt`,
      blobs: exact.observedBlobs,
    });
    expect(extraChange.errors).toContain(
      'Frontier checkout changes must exactly match the declared runtime patch files',
    );
  });

  it('rejects unsafe, duplicate, and malformed Frontier patch declarations', async () => {
    const baseline = await loadBaselineModule();
    expect(baseline, 'consensus-source-baseline module').toBeDefined();
    if (!baseline) return;

    const malformed: any = structuredClone(validLock);
    malformed.frontier.files = [
      ...malformed.frontier.files,
      { ...malformed.frontier.files[0] },
      { path: '../escape.rs', status: 'added', patchedBlob: '4'.repeat(40) },
      { path: 'missing-status.rs', patchedBlob: '5'.repeat(40) },
    ];
    const result = baseline.validateConsensusSourceLock(malformed, {
      frontierGitlinkCommit: frontier.commit,
      frontierSubmoduleUrl: frontier.repository,
      frontierPatchSha256: frontier.patchSha256,
      ergoPatchSha256: ergoNode.patchSha256,
    });

    expect(result.errors).toContain('Frontier patch file paths must be unique');
    expect(result.errors).toContain(
      'Frontier patch file paths must be safe repository-relative paths',
    );
    expect(result.errors).toContain('Frontier patch file status must be modified or added');
  });

  it('accepts only the exact Ergo base plus the declared patch files', async () => {
    const baseline = await loadBaselineModule();
    expect(baseline, 'consensus-source-baseline module').toBeDefined();
    if (!baseline) return;

    const exact = baseline.validateErgoCheckout(ergoNode, {
      head: ergoNode.baseCommit,
      status: ergoNode.files.map((file: any) => ` M ${file.path}`).join('\n'),
      blobs: Object.fromEntries(ergoNode.files.map((file: any) => [file.path, file.patchedBlob])),
    });
    expect(exact.errors).toEqual([]);

    const extraChange = baseline.validateErgoCheckout(ergoNode, {
      head: ergoNode.baseCommit,
      status: `${exact.expectedStatus}\n M src/main/scala/Unexpected.scala`,
      blobs: exact.observedBlobs,
    });
    expect(extraChange.errors).toContain(
      'Ergo checkout changes must be limited to the declared patch files',
    );
  });

  it('drops Windows stat-only status noise only for raw or controlled CRLF-equivalent bytes', async () => {
    const baseline = await loadBaselineModule();
    expect(baseline, 'consensus-source-baseline module').toBeDefined();
    if (!baseline) return;

    const status = [
      ' M build.sbt',
      ' M src/main/scala/Patched.scala',
      '?? src/main/scala/Added.scala',
      'M  src/main/scala/Staged.scala',
    ].join('\n');
    const normalized = baseline.normalizeCheckoutStatus(
      status,
      (path: string) => path === 'build.sbt',
    );
    expect(normalized).toBe([
      ' M src/main/scala/Patched.scala',
      '?? src/main/scala/Added.scala',
      'M  src/main/scala/Staged.scala',
    ].join('\n'));

    expect(baseline.isRawOrControlledCrLfEquivalent(
      'build.sbt',
      Buffer.from('line one\r\nline two\r\n'),
      Buffer.from('line one\nline two\n'),
    )).toBe(true);
    expect(baseline.isRawOrControlledCrLfEquivalent(
      'build.sbt',
      Buffer.from('line one\r\nchanged\r\n'),
      Buffer.from('line one\nline two\n'),
    )).toBe(false);
    expect(baseline.isRawOrControlledCrLfEquivalent(
      'artifact.bin',
      Buffer.from('line one\r\n'),
      Buffer.from('line one\n'),
    )).toBe(false);
    expect(baseline.isRawOrControlledCrLfEquivalent(
      'Cargo.lock',
      Buffer.from('line one\r\n'),
      Buffer.from('line one\n'),
    )).toBe(true);
    expect(baseline.isRawOrControlledCrLfEquivalent(
      '.github/CODEOWNERS',
      Buffer.from('line one\r\n'),
      Buffer.from('line one\n'),
    )).toBe(true);
    expect(baseline.isRawOrControlledCrLfEquivalent(
      'LICENSE-APACHE2',
      Buffer.from('line one\r\n'),
      Buffer.from('line one\n'),
    )).toBe(true);
    expect(baseline.isRawOrControlledCrLfEquivalent(
      'contract.sol',
      Buffer.from('line one\r\n'),
      Buffer.from('line one\n'),
    )).toBe(true);
    expect(baseline.isRawOrControlledCrLfEquivalent(
      'build.sbt',
      Buffer.from('line one\r\n'),
      Buffer.from('line one\r\n'),
    )).toBe(true);
  });

  it('detects raw checkout and index drift even when a Git clean filter rewrites the blob identity', async () => {
    const baseline = await loadBaselineModule();
    expect(baseline, 'consensus-source-baseline module').toBeDefined();
    if (!baseline) return;

    const root = mkdtempSync(resolve(tmpdir(), 'bridge-raw-checkout-'));
    const originalGitIndexFile = process.env.GIT_INDEX_FILE;
    const git = (...args: string[]) => execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
      git('init', '--quiet');
      git('config', 'user.name', 'Bridge Test');
      git('config', 'user.email', 'bridge-test@example.invalid');
      writeFileSync(resolve(root, 'tracked.sbt'), 'original\n');
      writeFileSync(resolve(root, '.gitattributes'), 'tracked.sbt filter=hidechange\n');
      git('add', 'tracked.sbt', '.gitattributes');
      git('commit', '--quiet', '-m', 'fixture');
      git('config', 'filter.hidechange.clean', 'sed s/filter-hidden-change/original/');
      git('config', 'filter.hidechange.smudge', 'cat');
      git('config', 'filter.hidechange.required', 'true');

      writeFileSync(resolve(root, 'tracked.sbt'), 'filter-hidden-change\n');
      expect(git('hash-object', '--path=tracked.sbt', 'tracked.sbt').trim())
        .toBe(git('rev-parse', 'HEAD:tracked.sbt').trim());
      process.env.GIT_INDEX_FILE = resolve(root, 'attacker-controlled-index');
      const filtered = baseline.inspectRawCheckout(root, ['tracked.sbt']);
      expect(filtered.status).toBe(' M tracked.sbt');
      if (originalGitIndexFile === undefined) delete process.env.GIT_INDEX_FILE;
      else process.env.GIT_INDEX_FILE = originalGitIndexFile;

      writeFileSync(resolve(root, '.git', 'info', 'exclude'), 'hidden.txt\n');
      writeFileSync(resolve(root, 'hidden.txt'), 'must remain visible\n');
      expect(baseline.inspectRawCheckout(root, ['tracked.sbt']).status)
        .toContain('?? hidden.txt');

      writeFileSync(resolve(root, 'staged.txt'), 'staged index drift\n');
      git('add', 'staged.txt');
      const indexed = baseline.inspectRawCheckout(root, ['tracked.sbt']);
      expect(indexed.status).toContain(' M tracked.sbt');
      expect(indexed.status).toContain('!! INDEX DRIFT');
    } finally {
      if (originalGitIndexFile === undefined) delete process.env.GIT_INDEX_FILE;
      else process.env.GIT_INDEX_FILE = originalGitIndexFile;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('inspects the tracked lock without implying that source checkouts were built', async () => {
    const baseline = await loadBaselineModule();
    expect(baseline, 'consensus-source-baseline module').toBeDefined();
    if (!baseline) return;

    expect(baseline.inspectConsensusSourceBaseline).toBeTypeOf('function');
    if (typeof baseline.inspectConsensusSourceBaseline !== 'function') return;

    const report = baseline.inspectConsensusSourceBaseline({
      worktreeRoot: REPOSITORY_ROOT,
      bridgeRoot: BRIDGE_ROOT,
      requireFrontierCheckout: false,
      requireErgoCheckout: false,
    });

    expect(report.status).toBe('PASS');
    expect(report.checks.lockBindingsValidated).toBe(true);
    expect(report.checks.solidityBuildClosureArtifactsValidated).toBe(true);
    expect(report.checks.frontierCheckoutValidated).toBe(false);
    expect(report.checks.ergoCheckoutValidated).toBe(false);
    expect(report.sourceIdentity.frontierPatchSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(report.boundaries.runtimeCommitmentProducerImplemented).toBe(true);
    expect(report.boundaries.sidechainFinalityImplemented).toBe(true);
    expect(report.boundaries.grandpaAuthorityTransitionVerificationImplemented).toBe(true);
    expect(report.boundaries.hashLinkedGrandpaVerificationImplemented).toBe(true);
    expect(report.boundaries.nativeRuntimeCommitmentStateVerificationImplemented).toBe(true);
    expect(report.boundaries.nativeFinalizedCheckpointVerificationImplemented).toBe(true);
    expect(report.boundaries.nativeRpcProofCodecImplemented).toBe(true);
    expect(report.boundaries.gate5Closed).toBe(false);
  });

  it('inspects the same tracked source identity through the standalone path projection', async () => {
    const baseline = await loadBaselineModule();
    expect(baseline, 'consensus-source-baseline module').toBeDefined();
    if (!baseline) return;

    const report = baseline.inspectConsensusSourceBaseline({
      worktreeRoot: BRIDGE_ROOT,
      bridgeRoot: BRIDGE_ROOT,
      requireFrontierCheckout: false,
      requireErgoCheckout: false,
    });

    expect(report.status).toBe('PASS');
    expect(report.checks.lockBindingsValidated).toBe(true);
    expect(report.sourceIdentity.frontierCommit).toBe(
      '75329a2df49e2cc7981485392c31160929d1bd48',
    );
    expect(report.boundaries.gate5Closed).toBe(false);
  });

  it('exposes lock-only and full-checkout CLI modes with explicit boundaries', async () => {
    const cli = await loadCliModule();
    expect(cli, 'consensus source baseline CLI module').toBeDefined();
    if (!cli) return;

    const lockOnly = cli.parseConsensusSourceBaselineArgs(['--lock-only']);
    expect(lockOnly.requireFrontierCheckout).toBe(false);
    expect(lockOnly.requireErgoCheckout).toBe(false);
    expect(lockOnly.checkoutMode).toBe('lock-only');

    const ergoOnly = cli.parseConsensusSourceBaselineArgs([
      '--ergo-only',
      '--ergo-source',
      'ergo-checkout',
    ]);
    expect(ergoOnly.requireFrontierCheckout).toBe(false);
    expect(ergoOnly.requireErgoCheckout).toBe(true);
    expect(ergoOnly.checkoutMode).toBe('ergo-only');
    expect(ergoOnly.ergoSourcePath).toBe('ergo-checkout');

    expect(() => cli.parseConsensusSourceBaselineArgs(['--ergo-only'])).toThrow(
      '--ergo-only requires --ergo-source',
    );
    expect(() => cli.parseConsensusSourceBaselineArgs([
      '--ergo-only',
      '--frontier-source',
      'frontier-checkout',
      '--ergo-source',
      'ergo-checkout',
    ])).toThrow('--frontier-source cannot be combined with --ergo-only');

    const full = cli.parseConsensusSourceBaselineArgs([
      '--frontier-source',
      'frontier-checkout',
      '--ergo-source',
      'ergo-checkout',
    ]);
    expect(full.requireFrontierCheckout).toBe(true);
    expect(full.requireErgoCheckout).toBe(true);
    expect(full.checkoutMode).toBe('full');
    expect(full.frontierSourcePath).toBe('frontier-checkout');
    expect(full.ergoSourcePath).toBe('ergo-checkout');

    const markdown = cli.formatConsensusSourceBaselineReport({
      schemaVersion: 1,
      kind: 'bridge-consensus-source-baseline-report',
      status: 'PASS',
      errors: [],
      checks: {
        lockBindingsValidated: true,
        solidityBuildClosureArtifactsValidated: true,
        frontierCheckoutRequired: false,
        frontierCheckoutValidated: false,
        ergoCheckoutRequired: false,
        ergoCheckoutValidated: false,
      },
      sourceIdentity: {
        solidityBuildManifestSha256: solidityBuild.manifestSha256,
        frontierCommit: frontier.commit,
        frontierPatchSha256: frontier.patchSha256,
        ergoBaseCommit: ergoNode.baseCommit,
        ergoPatchSha256: ergoNode.patchSha256,
      },
      boundaries: validLock.boundaries,
    });
    expect(markdown).toContain('| Result | PASS |');
    expect(markdown).toContain('| Frontier checkout validated | no |');
    expect(markdown).toContain('| Frontier patch SHA-256 |');
    expect(markdown).toContain('| Runtime commitment producer implemented | yes |');
    expect(markdown).toContain('| GRANDPA authority-transition verification implemented | yes |');
    expect(markdown).toContain('| Hash-linked GRANDPA checkpoint verification implemented | yes |');
    expect(markdown).toContain('| Native runtime commitment state verification implemented | yes |');
    expect(markdown).toContain('| Native finalized checkpoint verification implemented | yes |');
    expect(markdown).toContain('| Native read-only RPC proof codec implemented | yes |');
    expect(markdown).toContain('| Gate 5 closed | no |');
  });

  it('tracks active-root CI coverage for both reproducible source builds', () => {
    const workflowPath = REPOSITORY_LAYOUT.mode === 'standalone'
      ? resolve(BRIDGE_ROOT, '.github', 'workflows', 'relayer-checks.yml')
      : resolve(
        REPOSITORY_ROOT,
        '.github',
        'workflows',
        'bridge-consensus-sources.yml',
      );
    const guidePath = resolve(BRIDGE_ROOT, 'docs', 'consensus-source-baseline.md');

    expect(existsSync(workflowPath), 'active-root source workflow').toBe(true);
    expect(existsSync(guidePath), 'clean-checkout source guide').toBe(true);
    if (!existsSync(workflowPath)) return;

    const workflow = readFileSync(workflowPath, 'utf8');
    expect(workflow).toContain('submodules: recursive');
    expect(workflow).toContain(
      REPOSITORY_LAYOUT.mode === 'standalone'
        ? 'solidity/package-lock.json'
        : 'ergo-sidechain-bridge/solidity/package-lock.json',
    );
    expect(workflow).toContain('Verify reproducible Solidity build closure');
    expect(workflow).toContain('npm audit --audit-level=high');
    expect(workflow).toContain('npm run sources:verify');
    expect(workflow).toContain('cargo build --locked --release -p frontier-template-node');
    expect(workflow).toContain('0001-bridge-runtime-commitment.patch');
    expect(workflow).toContain('cargo test --locked -p frontier-template-runtime bridge_commitment');
    expect(workflow).toContain('cargo test --locked -p bridge-finality-proof');
    expect(workflow).toContain('cargo test --locked -p bridge-state-proof');
    expect(workflow).toContain('https://github.com/ergoplatform/ergo.git');
    expect(workflow).toContain('2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1');
    expect(workflow).toContain('0001-sidechain-extension-fields.patch');
    expect(workflow).toContain('testOnly org.ergoplatform.mining.CandidateGeneratorSpec');
    expect(workflow).toContain('node-version: "24.14.0"');
    expect(workflow).toContain('distribution: microsoft');
    expect(workflow).toContain('java-version: "17.0.19+10"');
    const sourceJobStart = workflow.indexOf(
      REPOSITORY_LAYOUT.mode === 'standalone'
        ? '  consensus-sources:'
        : '  source-baseline:',
    );
    const sourceJobEnd = REPOSITORY_LAYOUT.mode === 'standalone'
      ? workflow.length
      : workflow.indexOf('  proof-bound-contract-vm:');
    const sourceJob = workflow.slice(sourceJobStart, sourceJobEnd);
    expect(sourceJob.indexOf('Apply tracked Frontier runtime commitment patch')).toBeLessThan(
      sourceJob.indexOf('Verify complete source checkouts'),
    );
    expect(sourceJob.indexOf('Verify reproducible Solidity build closure')).toBeLessThan(
      sourceJob.indexOf('Verify tracked source lock'),
    );
    expect(sourceJob.indexOf('Verify complete source checkouts')).toBeLessThan(
      sourceJob.indexOf('Test Frontier bridge commitment producer'),
    );
    expect(sourceJob.indexOf('Test Frontier bridge commitment producer')).toBeLessThan(
      sourceJob.indexOf('Test native GRANDPA finality proof verifier'),
    );
    expect(sourceJob.indexOf('Test native GRANDPA finality proof verifier')).toBeLessThan(
      sourceJob.indexOf('Test native finalized bridge state proof verifier'),
    );
    expect(sourceJob.indexOf('Test native finalized bridge state proof verifier')).toBeLessThan(
      sourceJob.indexOf('Build patched Frontier template node'),
    );

    if (REPOSITORY_LAYOUT.mode === 'superproject') {
      expect(workflow).toContain('Provision reviewed MinGit distribution');
      expect(workflow).toContain('$lock.gitDistributionUrl');
      expect(workflow).toContain('$lock.gitDistributionSha256');
      expect(workflow).toContain('$lock.gitExecutableSha256');
      expect(workflow).toContain('npm.cmd run compiler:runtime-bundle');
      expect(workflow).toContain('contracts:authenticated-v2:compiler-selfcheck');

      const windowsJob = workflow.slice(workflow.indexOf('  proof-bound-contract-vm:'));
      expect(windowsJob.indexOf('Apply tracked Frontier runtime commitment patch')).toBeLessThan(
        windowsJob.indexOf('Verify complete source checkouts'),
      );
      expect(windowsJob.indexOf('Provision reviewed MinGit distribution')).toBeLessThan(
        windowsJob.indexOf('Prepare pinned patched Ergo source'),
      );
      expect(windowsJob.indexOf('Verify complete source checkouts')).toBeLessThan(
        windowsJob.indexOf('Rebuild authenticated V2 compiler runtime bundle'),
      );
      expect(windowsJob.indexOf('Rebuild authenticated V2 compiler runtime bundle')).toBeLessThan(
        windowsJob.indexOf('Verify authenticated V2 source-to-bytecode derivation'),
      );
      expect(
        windowsJob.indexOf('Verify authenticated V2 source-to-bytecode derivation'),
      ).toBeLessThan(windowsJob.indexOf('Build patched Ergo node'));
    }
  });

  it('gates patched-devnet startup on the reproducible source cache', () => {
    const runner = readFileSync(
      resolve(BRIDGE_ROOT, 'scripts', 'run-patched-ergo-devnet.ps1'),
      'utf8',
    );
    const readiness = readFileSync(
      resolve(BRIDGE_ROOT, 'relayer', 'src', 'scripts', 'patched-devnet-readiness.ts'),
      'utf8',
    );

    expect(runner).toContain('.source-cache\\ergo-node');
    expect(runner).toContain('sources:verify -- --ergo-only --ergo-source');
    expect(runner).toContain('Get-Command sbt');
    expect(runner).toContain('[ValidateNotNullOrEmpty()]');
    expect(runner).toContain("$MiningTarget -notmatch '^(02|03)[0-9A-Fa-f]{64}$'");
    expect(runner).toContain('[string]$MiningMnemonicEnvironmentVariable = ""');
    expect(runner).toContain('[ValidateSet("primary", "witness")]');
    expect(runner).toContain('[string]$NodeRole = "primary"');
    expect(runner).toContain('[ValidateSet("fast", "standard")]');
    expect(runner).toContain('[string]$DevnetFeePolicy = "fast"');
    expect(runner).toContain('[string]$ConfigResource = ""');
    expect(runner).toContain('$DevnetFeePolicy -eq "standard"');
    expect(runner).toContain(
      'Standard devnet fee policy requires the canonical application.conf and devnet.conf resources',
    );
    expect(runner).toContain('$ConfigResource -ne "devnet.conf"');
    expect(runner).toContain(
      "$MiningMnemonicEnvironmentVariable -notmatch '^[A-Z][A-Z0-9_]{0,63}$'",
    );
    expect(runner).toContain('[Environment]::GetEnvironmentVariable(');
    expect(runner).toContain('[EnvironmentVariableTarget]::Process');
    expect(runner).toContain(
      "'ergo.wallet.testMnemonic = ${?' +",
    );
    expect(runner).toContain('ergo.wallet.testKeysQty = 1');
    expect(runner).not.toContain('Write-Host "  mining mnemonic:');
    expect(runner).not.toContain('node wallet default');
    expect(runner).toContain("$ApiKeyHash -notmatch '^[0-9A-Fa-f]{64}$'");
    expect(runner).toContain(
      '$Resource -notmatch \'^[A-Za-z0-9][A-Za-z0-9._/-]*$\'',
    );
    expect(runner).toContain(
      '(Join-Path ([System.IO.Path]::GetTempPath()) "ergo-sidechain-bridge")',
    );
    expect(runner).toContain('[System.IO.FileAttributes]::ReparsePoint');
    expect(runner).toContain('function Assert-NoReparsePointInTree');
    expect(runner).toContain('Get-ChildItem -LiteralPath $CurrentPath -Force -ErrorAction Stop');
    expect(runner).toContain('Assert-DataDirIsFresh -Path $DataDir');
    expect(runner.match(/Assert-DataDirIsFresh -Path \$DataDir/g)).toHaveLength(2);
    expect(runner).toContain('[switch]$ResumeExistingDataDir');
    expect(runner).toContain('[switch]$NonMiningResume');
    expect(runner).toContain('ResumeExistingDataDir requires an explicit DataDir');
    expect(runner).toContain('NonMiningResume requires ResumeExistingDataDir');
    expect(runner).toContain(
      'NonMiningResume forbids a mining mnemonic environment variable',
    );
    expect(
      runner.indexOf('NonMiningResume forbids a mining mnemonic environment variable'),
    ).toBeLessThan(runner.indexOf('[Environment]::GetEnvironmentVariable('));
    expect(runner.match(/Assert-DataDirIsResumable -Path \$DataDir/g)).toHaveLength(2);
    expect(runner).toContain('[System.IO.Directory]::Exists($Path)');
    expect(runner).toContain('[System.IO.File]::Exists($Path)');
    expect(runner).toContain('$DataDir.StartsWith(');
    expect(runner).toContain('[System.StringComparison]::OrdinalIgnoreCase');
    expect(runner).toContain(
      'DataDir must be a strict descendant of the dedicated runtime root',
    );
    expect(runner).toContain(
      'New-Item -ItemType Directory -Path $DataDir -ErrorAction Stop',
    );
    const sourceVerification = runner.indexOf(
      'sources:verify -- --ergo-only --ergo-source',
    );
    const firstFreshnessCheck = runner.indexOf('Assert-DataDirIsFresh -Path $DataDir');
    const secondFreshnessCheck = runner.indexOf(
      'Assert-DataDirIsFresh -Path $DataDir',
      firstFreshnessCheck + 1,
    );
    const freshDataDirCreation = runner.indexOf(
      'New-Item -ItemType Directory -Path $DataDir -ErrorAction Stop',
      secondFreshnessCheck,
    );
    const postCreationReparseCheck = runner.indexOf(
      'Assert-NoReparsePointInPath -Path $DataDir -Label "DataDir"',
      freshDataDirCreation,
    );
    expect(firstFreshnessCheck).toBeGreaterThan(-1);
    expect(firstFreshnessCheck).toBeLessThan(sourceVerification);
    expect(secondFreshnessCheck).toBeGreaterThan(sourceVerification);
    expect(freshDataDirCreation).toBeGreaterThan(secondFreshnessCheck);
    expect(postCreationReparseCheck).toBeGreaterThan(freshDataDirCreation);
    expect(runner.match(/Assert-NoReparsePointInTree -Path \$DataDir -Label "DataDir"/g))
      .toHaveLength(2);
    expect(runner).toContain('Assert-NoReparsePointInTree -Path $Path -Label "DataDir"');
    const freshGuard = runner.slice(
      runner.indexOf('function Assert-DataDirIsFresh'),
      runner.indexOf('function Assert-DataDirIsResumable'),
    );
    const resumeGuard = runner.slice(
      runner.indexOf('function Assert-DataDirIsResumable'),
      runner.indexOf("if ($MiningTarget -notmatch"),
    );
    expect(freshGuard).not.toContain('Assert-NoReparsePointInTree');
    expect(resumeGuard).toContain('Assert-NoReparsePointInTree -Path $Path');
    expect(runner).toContain('scorex.restApi.bindAddress = ""127.0.0.1:9051""');
    expect(runner).toContain('scorex.network.bindAddress = ""127.0.0.1:9021""');
    expect(runner).toContain('scorex.network.knownPeers = []');
    expect(runner).toContain(
      '"ergo.node.mining = $(if ($NonMiningResume) { \'false\' } else { \'true\' })"',
    );
    expect(runner).toContain(
      '"ergo.node.offlineGeneration = $(if ($NonMiningResume) { \'false\' } else { \'true\' })"',
    );
    expect(runner).toContain('scorex.restApi.bindAddress = ""127.0.0.1:9052""');
    expect(runner).toContain('scorex.network.bindAddress = ""127.0.0.1:9022""');
    expect(runner).toContain(
      'scorex.network.knownPeers = [""127.0.0.1:9021""]',
    );
    expect(runner).toContain('ergo.node.mining = false');
    expect(runner).toContain('ergo.node.offlineGeneration = false');
    expect(runner).toContain('ergo.chain.monetary.minerRewardDelay = 720');
    expect(runner).toContain('ergo.node.minimalFeeAmount = 1000000');
    expect(runner).toContain('ergo.node.minimalFeeAmount = 0');
    expect(runner).toContain('devnet fee policy: $DevnetFeePolicy');
    expect(runner).toContain(
      "execution mode: $(if ($NonMiningResume) { 'non-mining resume' } else { 'normal role policy' })",
    );
    expect(runner).toContain(
      'resume role binding: caller-selected; verify chain identity through the observer',
    );
    expect(runner).toContain('scorex.network.upnpEnabled = false');
    expect(runner).toContain('ergo.directory = ""$DataDirForConfig""');
    expect(runner).not.toContain('scorex.dataDir');
    expect(runner).not.toContain('scorex.logDir');
    expect(runner).toContain('$LogbackConfigPath = Join-Path $DataDir "logback.xml"');
    expect(runner).toContain(
      'Assert-NoReparsePointInPath -Path $LogbackConfigPath -Label "Logback config"',
    );
    expect(runner).toContain('-Dlogback.configurationFile=$LogbackConfigForJvm');
    expect(runner).toContain('ergo-patched-$NodeRole-$SessionId.conf');
    expect(runner).toContain('Remove-Item -LiteralPath $MergedConfigPath');
    expect(runner.lastIndexOf(
      'Assert-NoReparsePointInTree -Path $DataDir -Label "DataDir"',
    )).toBeLessThan(runner.indexOf('Push-Location $ErgoSourcePath'));
    const lastConfigInclude = runner.lastIndexOf('include classpath(');
    const explicitMiningTarget = runner.indexOf(
      '$configLines += "ergo.node.miningPubKeyHex',
    );
    const syntheticMiningSigner = runner.indexOf(
      "'ergo.wallet.testMnemonic = ${?' +",
    );
    const finalIsolationBlock = runner.indexOf(
      '# overrides so classpath content cannot relax runtime or network isolation.',
    );
    const loopbackRestOverride = runner.indexOf(
      'scorex.restApi.bindAddress = ""127.0.0.1:9051""',
    );
    expect(lastConfigInclude).toBeGreaterThan(-1);
    expect(explicitMiningTarget).toBeGreaterThan(lastConfigInclude);
    expect(syntheticMiningSigner).toBeGreaterThan(explicitMiningTarget);
    expect(finalIsolationBlock).toBeGreaterThan(syntheticMiningSigner);
    expect(loopbackRestOverride).toBeGreaterThan(finalIsolationBlock);
    expect(runner.indexOf('include classpath(', finalIsolationBlock)).toBe(-1);
    expect(runner).not.toMatch(/\b[A-Za-z]:\\/);
    expect(readiness).toContain("from '../consensus-source-baseline.js'");
    expect(readiness).toContain("'.source-cache', 'ergo-node'");
    expect(readiness).toContain('inspectConsensusSourceBaseline({');
    expect(readiness).not.toMatch(/\b[A-Za-z]:\\/);
  });
});

function createSolidityClosureFixture(includeInstalledImports = true): string {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'e2s-solidity-input-closure-'));
  const sourceRoot = resolve(BRIDGE_ROOT, 'solidity');
  const targetRoot = resolve(temporaryRoot, 'solidity');
  cpSync(sourceRoot, targetRoot, {
    recursive: true,
    filter: source => !source.includes(`${pathSeparator}node_modules${pathSeparator}`)
      && !source.endsWith(`${pathSeparator}node_modules`),
  });
  const manifest = JSON.parse(readFileSync(
    resolve(targetRoot, 'compiled', 'build-manifest.json'),
    'utf8',
  ));
  if (!includeInstalledImports) return temporaryRoot;
  for (const entry of manifest.compilerInput.sources) {
    if (!entry.path.startsWith('@openzeppelin/contracts/')) continue;
    const segments = entry.path.split('/');
    const sourcePath = resolve(sourceRoot, 'node_modules', ...segments);
    const targetPath = resolve(targetRoot, 'node_modules', ...segments);
    mkdirSync(dirname(targetPath), { recursive: true });
    cpSync(sourcePath, targetPath);
  }
  return temporaryRoot;
}

function writeBoundSolidityManifest(
  bridgeRoot: string,
  sourceDeclaration: any,
  manifest: any,
): any {
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  writeFileSync(
    resolve(bridgeRoot, 'solidity', 'compiled', 'build-manifest.json'),
    bytes,
  );
  const declaration = structuredClone(sourceDeclaration);
  declaration.manifestSha256 = createHash('sha256').update(bytes).digest('hex');
  return declaration;
}
