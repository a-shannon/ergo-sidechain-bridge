import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  spawnSync: vi.fn(),
  applicationPreflight: vi.fn(),
  inspectBuildLock: vi.fn(),
  inspectProtoc: vi.fn(),
  inspectRustSrc: vi.fn(),
  buildChainSpec: vi.fn(),
  assertReceiptDataSafe: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: mocks.spawnSync,
}));

vi.mock(
  '../substrate-federated-isolated-devnet-frontier-application-preflight-v1.js',
  () => ({
    preflightSubstrateFederatedIsolatedDevnetFrontierApplicationV1:
      mocks.applicationPreflight,
  }),
);

vi.mock(
  '../substrate-federated-isolated-devnet-ergo-node-build-v1.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import('../substrate-federated-isolated-devnet-ergo-node-build-v1.js')
    >(),
    inspectSubstrateFederatedIsolatedDevnetErgoNodeBuildLockV1:
      mocks.inspectBuildLock,
  }),
);

vi.mock(
  '../substrate-federated-authority-safe-devnet-protoc-v1.js',
  () => ({
    inspectSubstrateFederatedAuthoritySafePinnedProtocV1:
      mocks.inspectProtoc,
  }),
);

vi.mock(
  '../substrate-federated-authority-safe-devnet-rust-src-v1.js',
  () => ({
    inspectSubstrateFederatedAuthoritySafePinnedRustSrcV1:
      mocks.inspectRustSrc,
  }),
);

vi.mock(
  '../substrate-federated-authority-safe-devnet-chain-spec-v1.js',
  () => ({
    buildSubstrateFederatedAuthoritySafeDevnetChainSpecV1:
      mocks.buildChainSpec,
  }),
);

vi.mock(
  '../relayer-core/substrate-federated-isolated-devnet-receipt-data-safety-v1.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1:
      mocks.assertReceiptDataSafe,
  }),
);

import {
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_OWNER_ADDRESS_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
} from '../substrate-federated-isolated-devnet-frontier-lab-application-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetBootstrapRequestFromArgumentsV1,
} from './create-substrate-federated-isolated-devnet-bootstrap-request-v1.js';
import {
  preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CAMPAIGN_PREFLIGHT_V1_PHASES,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CAMPAIGN_PREFLIGHT_V1_SCHEMA,
  type SubstrateFederatedIsolatedDevnetCampaignPreflightV1Phase,
} from './preflight-substrate-federated-isolated-devnet-campaign-v1.js';

const roots: string[] = [];
const EXPECTED_HEAD = 'a'.repeat(40);
const RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CAMPAIGN_PREFLIGHT_V1';
const FIXTURE_GIT_BYTES = Buffer.from('fixture-git', 'utf8');
const FIXTURE_GIT_SHA256 = createHash('sha256')
  .update(FIXTURE_GIT_BYTES)
  .digest('hex');
const SIGNED_LAB_OWNER_MINT_TRANSACTION =
  '0xf8c78001830f424094970951a12f975e6762482aca81e57d5a2a4e73f480b864'
  + 'f28ee187000000000000000000000000f24ff3a9cf04c71dbc94d0b566f7a27b'
  + '94566cac0000000000000000000000000000000000000000000000000000000000'
  + 'e4e1c0111111111111111111111111111111111111111111111111111111111111'
  + '111182f4f6a0fa641f8c5f81386dcf8913566ae9af37878a0f2599557c8543da'
  + 'a63f2e6a4461a0757c09b0c4cff077e8212ddac96fb05690d5c82e5cdd293dd8'
  + 'f3ac2538d6cce6';

beforeEach(() => {
  mocks.spawnSync.mockReset().mockImplementation(
    (_executable: string, args: readonly string[]) =>
      args[0] === '-C'
        ? {
            status: 0,
            signal: null,
            stdout: `# branch.oid ${EXPECTED_HEAD}\n# branch.head main\n`,
            stderr: '',
          }
        : {
            status: 0,
            signal: null,
            stdout: '',
            stderr: '',
          },
  );
  mocks.applicationPreflight.mockReset().mockImplementation(input => input);
  mocks.inspectBuildLock.mockReset().mockReturnValue({
    gitExecutableSha256Hex: FIXTURE_GIT_SHA256,
  });
  mocks.inspectProtoc.mockReset().mockReturnValue({
    executablePath: 'fixture-protoc',
    platformKey: 'win32-x64',
    version: 'libprotoc fixture',
    sha256Hex: '1'.repeat(64),
  });
  mocks.inspectRustSrc.mockReset().mockImplementation(
    (input: { rustcExecutablePath: string }) =>
      rustSrcObservation(input.rustcExecutablePath),
  );
  mocks.buildChainSpec.mockReset().mockReturnValue({});
  mocks.assertReceiptDataSafe.mockReset().mockImplementation(() => undefined);
});

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('isolated campaign pure preflight V1', () => {
  it('binds the request, active HEAD, LAB application, roots and runner preflight without launching a campaign', () => {
    const fixture = createFixture();
    const request = createRequest(fixture);
    const before = inventory(fixture.root);
    const phases: string[] = [];
    const receipt =
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
        preflightArguments(fixture, request.requestSha256Hex),
        phase => phases.push(phase),
      );

    expect(receipt).toMatchObject({
      schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CAMPAIGN_PREFLIGHT_V1_SCHEMA,
      version: 1,
      status: 'request_bound_lab_campaign_preflight_passed',
      requestSha256Hex: request.requestSha256Hex,
      requestBindings: {
        expectedHeadCommitSha1Hex: EXPECTED_HEAD,
        expectedBaseSpecSha256Hex: fixture.baseSpecSha256Hex,
      },
      pegIn: {
        amountNanoErg: '15000000',
        recipientAddressHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_OWNER_ADDRESS_V1
            .slice(2),
      },
      checks: {
        canonicalRequestDigestBound: true,
        pinnedGitExecutableBound: true,
        exactBridgeHeadObserved: true,
        trackedWorktreeClean: true,
        exactBaseSpecBytesBound: true,
        deterministicLabApplicationBound: true,
        distinctLoopbackSourceTopologyBound: true,
        freshArtifactDestinationBound: true,
        externalRootsDisjointAndOutsideWorktree: true,
        exactPegInPlanBound: true,
        visualStudioAndOfflineFrontierPreflightPassed: true,
        workerNodeAndCampaignLaunchAbsent: true,
      },
      boundaries: {
        localPreflightOnly: true,
        sourceConsensusAuthenticated: false,
        ergoConsensusAuthenticated: false,
        targetNodeAcceptanceEstablished: false,
        signingAuthorized: false,
        submissionAuthorized: false,
        broadcastAuthorized: false,
        trackerAdmissionEstablished: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
        hostileSameUserMutationResistanceEstablished: false,
      },
    });
    expect(phases).toEqual(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CAMPAIGN_PREFLIGHT_V1_PHASES,
    );
    const { receiptDigestHex, ...body } = receipt;
    expect(receiptDigestHex).toBe(
      sha256CanonicalJson(body, RECEIPT_DIGEST_DOMAIN),
    );
    expect(mocks.spawnSync).toHaveBeenCalledTimes(3);
    expect(mocks.buildChainSpec).toHaveBeenCalledTimes(1);
    expect(mocks.buildChainSpec).toHaveBeenCalledWith({
      bridgeRoot: resolve(process.cwd(), '..'),
      baseSpecBytes: Buffer.from('{"name":"base"}\n', 'utf8'),
      expectedChainId: 31337n,
      bridgeAddress:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
      tokenAddress:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
      bridgeOwnerAddress:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_OWNER_ADDRESS_V1,
      expectedBaseSpecSha256Hex: fixture.baseSpecSha256Hex,
      expectedFrontierCommit: '5'.repeat(40),
      expectedFrontierPatchSha256Hex: '6'.repeat(64),
      expectedRuntimeCodeSha256Hex: '7'.repeat(64),
      expectedSudoAddress:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_OWNER_ADDRESS_V1,
    });
    expect(mocks.spawnSync).toHaveBeenNthCalledWith(
      2,
      fixture.toolchain.cargo,
      ['fetch', '--locked', '--offline'],
      expect.objectContaining({
        cwd: fixture.frontierSource,
        env: expect.objectContaining({
          CARGO_HOME: fixture.frontierCargoCache,
        }),
        maxBuffer: 1024 * 1024,
        shell: false,
        timeout: 120_000,
        windowsHide: true,
      }),
    );
    expect(mocks.spawnSync).toHaveBeenNthCalledWith(
      3,
      fixture.toolchain.cargo,
      [
        'fetch',
        '--locked',
        '--offline',
        '--manifest-path',
        join(
          fixture.root,
          'rust-toolchain',
          'lib',
          'rustlib',
          'src',
          'rust',
          'library',
          'Cargo.toml',
        ),
      ],
      expect.objectContaining({
        cwd: join(
          fixture.root,
          'rust-toolchain',
          'lib',
          'rustlib',
          'src',
          'rust',
          'library',
        ),
        env: expect.objectContaining({ RUSTC_BOOTSTRAP: '1' }),
      }),
    );
    expect(mocks.applicationPreflight).toHaveBeenCalledTimes(1);
    expect(mocks.inspectProtoc).toHaveBeenCalledTimes(1);
    expect(mocks.inspectRustSrc).toHaveBeenCalledTimes(2);
    expect(mocks.applicationPreflight).toHaveBeenCalledWith({
      frontierSourceDirectory: fixture.frontierSource,
      temporaryDirectoryRoot: fixture.frontierTemporaryRoot,
      cargoDependencyCacheDirectory: fixture.frontierCargoCache,
      cargoExecutablePath: fixture.toolchain.cargo,
      rustcExecutablePath: fixture.toolchain.rustc,
      gitExecutablePath: fixture.toolchain.git,
      offline: true,
    });
    expect(inventory(fixture.root)).toEqual(before);
  });

  it('preserves the exact successful receipt bytes when phase observation is enabled', () => {
    const fixture = createFixture();
    const request = createRequest(fixture);
    const args = preflightArguments(fixture, request.requestSha256Hex);
    const withoutObserver =
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(args);
    const withObserver =
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
        args,
        () => undefined,
      );

    expect(canonicalJson(withObserver)).toBe(canonicalJson(withoutObserver));
  });

  it('isolates Git from external Cargo configuration and pins both Cargo checks', () => {
    const fixture = createFixture();
    const request = createRequest(fixture);
    const originalCargoHome = process.env.CARGO_HOME;
    const ambientCargoHome = join(fixture.root, 'ambient-cargo-home');
    mkdirSync(ambientCargoHome);
    process.env.CARGO_HOME = ambientCargoHome;
    try {
      const receipt =
        preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
          preflightArguments(fixture, request.requestSha256Hex),
        );

      expect(receipt.status).toBe('request_bound_lab_campaign_preflight_passed');
      expect(mocks.spawnSync).toHaveBeenNthCalledWith(
        1,
        fixture.toolchain.git,
        expect.any(Array),
        expect.objectContaining({
          env: expect.not.objectContaining({ CARGO_HOME: expect.anything() }),
        }),
      );
      expect(mocks.spawnSync).toHaveBeenNthCalledWith(
        2,
        fixture.toolchain.cargo,
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            CARGO_HOME: fixture.frontierCargoCache,
          }),
        }),
      );
      expect(mocks.spawnSync).toHaveBeenNthCalledWith(
        3,
        fixture.toolchain.cargo,
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            CARGO_HOME: fixture.frontierCargoCache,
            RUSTC_BOOTSTRAP: '1',
          }),
        }),
      );
    } finally {
      if (originalCargoHome === undefined) delete process.env.CARGO_HOME;
      else process.env.CARGO_HOME = originalCargoHome;
    }
  });

  const phaseFailureCases: readonly Readonly<[
    SubstrateFederatedIsolatedDevnetCampaignPreflightV1Phase,
    (
      observe: (
        phase: SubstrateFederatedIsolatedDevnetCampaignPreflightV1Phase,
      ) => void,
    ) => void,
  ]>[] = [
    [
      'arguments and platform',
      observe => {
        preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
          [],
          observe,
        );
      },
    ],
    [
      'canonical request loading',
      observe => {
        const fixture = createFixture();
        const request = createRequest(fixture);
        const args = preflightArguments(fixture, request.requestSha256Hex);
        args[1] = join(fixture.root, 'missing-request.json');
        preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
          args,
          observe,
        );
      },
    ],
    [
      'pinned Git and bridge checkout',
      observe => {
        const fixture = createFixture();
        const request = createRequest(fixture);
        mocks.inspectBuildLock.mockReturnValueOnce({
          gitExecutableSha256Hex: 'f'.repeat(64),
        });
        preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
          preflightArguments(fixture, request.requestSha256Hex),
          observe,
        );
      },
    ],
    [
      'base spec application and topology',
      observe => {
        const fixture = createFixture();
        const request = createRequest(fixture);
        preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
          preflightArguments(fixture, request.requestSha256Hex, {
            recipientAddressHex: 'cd'.repeat(20),
          }),
          observe,
        );
      },
    ],
    [
      'external root binding',
      observe => {
        const fixture = createFixture();
        const request = createRequest(fixture);
        preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
          preflightArguments(fixture, request.requestSha256Hex, {
            relayerCargoCache: fixture.frontierCargoCache,
          }),
          observe,
        );
      },
    ],
    [
      'Ergo node build output readiness',
      observe => {
        const fixture = createFixture();
        const request = createRequest(fixture);
        const assemblyDirectory = join(
          fixture.ergoSource,
          'target',
          'scala-2.12',
        );
        mkdirSync(assemblyDirectory, { recursive: true });
        writeFileSync(join(assemblyDirectory, 'ergo-stale.jar'), 'stale');
        preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
          preflightArguments(fixture, request.requestSha256Hex),
          observe,
        );
      },
    ],
    [
      'Frontier native host preflight',
      observe => {
        const fixture = createFixture();
        const request = createRequest(fixture);
        mocks.applicationPreflight.mockImplementationOnce(() => {
          throw new Error('native host sentinel');
        });
        preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
          preflightArguments(fixture, request.requestSha256Hex),
          observe,
        );
      },
    ],
    [
      'pinned Protobuf compiler',
      observe => {
        const fixture = createFixture();
        const request = createRequest(fixture);
        mocks.inspectProtoc.mockImplementationOnce(() => {
          throw new Error('Protobuf sentinel');
        });
        preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
          preflightArguments(fixture, request.requestSha256Hex),
          observe,
        );
      },
    ],
    [
      'pinned Rust source before closure',
      observe => {
        const fixture = createFixture();
        const request = createRequest(fixture);
        mocks.inspectRustSrc.mockImplementationOnce(() => {
          throw new Error('Rust source before sentinel');
        });
        preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
          preflightArguments(fixture, request.requestSha256Hex),
          observe,
        );
      },
    ],
    [
      'offline Frontier dependency closure',
      observe => {
        const fixture = createFixture();
        const request = createRequest(fixture);
        mocks.spawnSync
          .mockImplementationOnce(() => ({
            status: 0,
            signal: null,
            stdout: `# branch.oid ${EXPECTED_HEAD}\n# branch.head main\n`,
            stderr: '',
          }))
          .mockImplementationOnce(() => ({
            status: 101,
            signal: null,
            stdout: '',
            stderr: 'dependency sentinel',
          }));
        preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
          preflightArguments(fixture, request.requestSha256Hex),
          observe,
        );
      },
    ],
    [
      'pinned Rust source after closure',
      observe => {
        const fixture = createFixture();
        const request = createRequest(fixture);
        mocks.inspectRustSrc
          .mockReturnValueOnce(rustSrcObservation(fixture.toolchain.rustc))
          .mockImplementationOnce(() => {
            throw new Error('Rust source after sentinel');
          });
        preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
          preflightArguments(fixture, request.requestSha256Hex),
          observe,
        );
      },
    ],
    [
      'receipt finalization',
      observe => {
        const fixture = createFixture();
        const request = createRequest(fixture);
        mocks.assertReceiptDataSafe.mockImplementationOnce(() => {
          throw new Error('receipt finalization sentinel');
        });
        preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
          preflightArguments(fixture, request.requestSha256Hex),
          observe,
        );
      },
    ],
  ];

  it.each(phaseFailureCases)(
    'attributes an underlying %s operation failure',
    (expectedPhase, execute) => {
      const observed: SubstrateFederatedIsolatedDevnetCampaignPreflightV1Phase[] = [];

      expect(() => execute(phase => observed.push(phase))).toThrow();
      expect(observed.at(-1)).toBe(expectedPhase);
    },
  );

  it('rejects request digest, active HEAD, LAB identity and base-spec drift independently', () => {
    const digestFixture = createFixture();
    const digestRequest = createRequest(digestFixture);
    expect(() =>
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
        preflightArguments(digestFixture, 'f'.repeat(64)),
      )).toThrow(/bytes changed after parent validation/i);
    expect(mocks.applicationPreflight).not.toHaveBeenCalled();

    const headFixture = createFixture();
    const headRequest = createRequest(headFixture);
    mocks.spawnSync.mockImplementationOnce(() => ({
      status: 0,
      signal: null,
      stdout: `# branch.oid ${'b'.repeat(40)}\n# branch.head main\n`,
      stderr: '',
    }));
    expect(() =>
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
        preflightArguments(headFixture, headRequest.requestSha256Hex),
      )).toThrow(/differs from the active bridge HEAD/i);

    const labFixture = createFixture();
    expect(() =>
      createRequest(labFixture, {
        tokenAddress: `0x${'c'.repeat(40)}`,
      })).toThrow(/differs from the deterministic deployment/i);

    const bridgeFixture = createFixture();
    expect(() =>
      createRequest(bridgeFixture, {
        bridgeAddress: `0x${'d'.repeat(40)}`,
      })).toThrow(/differs from the deterministic deployment/i);

    const ownerFixture = createFixture();
    expect(() =>
      createRequest(ownerFixture, {
        bridgeOwnerAddress: `0x${'e'.repeat(40)}`,
      })).toThrow(/transaction signer is not the exact bridge owner/i);

    const baseSpecFixture = createFixture();
    const baseSpecRequest = createRequest(baseSpecFixture, {
      expectedBaseSpecSha256Hex: 'd'.repeat(64),
    });
    expect(() =>
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
        preflightArguments(baseSpecFixture, baseSpecRequest.requestSha256Hex),
      )).toThrow(/base spec bytes differ/i);
    expect(mocks.applicationPreflight).not.toHaveBeenCalled();
    expect(digestRequest.requestSha256Hex).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('rejects base-spec target identity drift before native preflight', () => {
    const fixture = createFixture();
    const request = createRequest(fixture);
    mocks.buildChainSpec.mockImplementationOnce(() => {
      throw new Error('base Frontier chain ID differs from the explicit target');
    });

    expect(() =>
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
        preflightArguments(fixture, request.requestSha256Hex),
      )).toThrow(/base Frontier chain ID differs/u);
    expect(mocks.spawnSync).toHaveBeenCalledTimes(1);
    expect(mocks.applicationPreflight).not.toHaveBeenCalled();
    expect(mocks.inspectProtoc).not.toHaveBeenCalled();
    expect(mocks.inspectRustSrc).not.toHaveBeenCalled();
  });

  it('rejects invalid peg-in values, overlapping roots and non-loopback topology', () => {
    const pegInFixture = createFixture();
    const pegInRequest = createRequest(pegInFixture);
    expect(() =>
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
        preflightArguments(
          pegInFixture,
          pegInRequest.requestSha256Hex,
          { amountNanoErg: '0' },
        ),
      )).toThrow(/peg-in plan is invalid/i);

    const amountBindingFixture = createFixture();
    const amountBindingRequest = createRequest(amountBindingFixture);
    expect(() =>
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
        preflightArguments(
          amountBindingFixture,
          amountBindingRequest.requestSha256Hex,
          { amountNanoErg: '15000001' },
        ),
      )).toThrow(/owner-mint rejection probe differs from the peg-in plan/i);

    const rootsFixture = createFixture();
    const rootsRequest = createRequest(rootsFixture);
    expect(() =>
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
        preflightArguments(
          rootsFixture,
          rootsRequest.requestSha256Hex,
          { relayerCargoCache: rootsFixture.frontierCargoCache },
        ),
      )).toThrow(/roots must be disjoint/i);

    const ergoWorktreeFixture = createFixture();
    const ergoWorktreeRequest = createRequest(ergoWorktreeFixture, {
      ergoSource: process.cwd(),
    });
    expect(() =>
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
        preflightArguments(
          ergoWorktreeFixture,
          ergoWorktreeRequest.requestSha256Hex,
        ),
      )).toThrow(/roots must be disjoint, external and source-containing/i);

    const ergoOverlapFixture = createFixture();
    const ergoOverlapRequest = createRequest(ergoOverlapFixture, {
      ergoSource: ergoOverlapFixture.frontierCargoCache,
    });
    expect(() =>
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
        preflightArguments(
          ergoOverlapFixture,
          ergoOverlapRequest.requestSha256Hex,
        ),
      )).toThrow(/roots must be disjoint, external and source-containing/i);

    const topologyFixture = createFixture();
    const topologyRequest = createRequest(topologyFixture, {
      primaryRpcUrl: 'http://localhost:9944',
    });
    expect(() =>
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
        preflightArguments(topologyFixture, topologyRequest.requestSha256Hex),
      )).toThrow(/loopback HTTP origin/i);

    const portFixture = createFixture();
    const portRequest = createRequest(portFixture, {
      witnessP2pPort: '9944',
    });
    expect(() =>
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
        preflightArguments(portFixture, portRequest.requestSha256Hex),
      )).toThrow(/topology must use distinct ports/i);
  });

  it('rejects an unpinned Git executable and a dirty tracked worktree before runner preflight', () => {
    const gitFixture = createFixture();
    const gitRequest = createRequest(gitFixture);
    mocks.inspectBuildLock.mockReturnValueOnce({
      gitExecutableSha256Hex: 'f'.repeat(64),
    });
    expect(() =>
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
        preflightArguments(gitFixture, gitRequest.requestSha256Hex),
      )).toThrow(/Git executable differs from the build lock/i);
    expect(mocks.spawnSync).not.toHaveBeenCalled();
    expect(mocks.applicationPreflight).not.toHaveBeenCalled();

    const dirtyFixture = createFixture();
    const dirtyRequest = createRequest(dirtyFixture);
    mocks.spawnSync.mockImplementationOnce(() => ({
      status: 0,
      signal: null,
      stdout:
        `# branch.oid ${EXPECTED_HEAD}\n# branch.head main\n`
        + '1 .M N... 100644 100644 100644 a b src/example.ts\n',
      stderr: '',
    }));
    expect(() =>
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
        preflightArguments(dirtyFixture, dirtyRequest.requestSha256Hex),
      )).toThrow(/requires a clean tracked worktree/i);
    expect(mocks.applicationPreflight).not.toHaveBeenCalled();
  });

  it('rejects pinned Git executable drift during the checkout snapshot', () => {
    const fixture = createFixture();
    const request = createRequest(fixture);
    mocks.spawnSync.mockImplementationOnce(() => {
      writeFileSync(fixture.toolchain.git, 'mutated-git', 'utf8');
      return {
        status: 0,
        signal: null,
        stdout: `# branch.oid ${EXPECTED_HEAD}\n# branch.head main\n`,
        stderr: '',
      };
    });
    expect(() =>
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
        preflightArguments(fixture, request.requestSha256Hex),
      )).toThrow(/Git executable differs from the build lock/i);
    expect(mocks.applicationPreflight).not.toHaveBeenCalled();
  });

  it('rejects a missing or drifting Protobuf compiler before Cargo closure', () => {
    const fixture = createFixture();
    const request = createRequest(fixture);
    const phases: string[] = [];
    mocks.inspectProtoc.mockImplementationOnce(() => {
      throw new Error('authority-safe Frontier Protobuf compiler differs from its pin');
    });

    expect(() =>
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
        preflightArguments(fixture, request.requestSha256Hex),
        phase => phases.push(phase),
      )).toThrow(/Protobuf compiler differs from its pin/i);
    expect(phases.at(-1)).toBe('pinned Protobuf compiler');
    expect(mocks.spawnSync).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'process error',
      {
        error: new Error('private local dependency-cache process error'),
        status: null,
        signal: null,
        stdout: '',
        stderr: '',
      },
    ],
    [
      'nonzero exit',
      {
        status: 101,
        signal: null,
        stdout: '',
        stderr: 'private local dependency-cache exit diagnostic',
      },
    ],
    [
      'termination signal',
      {
        status: null,
        signal: 'SIGTERM',
        stdout: '',
        stderr: 'private local dependency-cache signal diagnostic',
      },
    ],
  ] as const)(
    'rejects an incomplete offline Cargo dependency closure after %s without leaking its diagnostic',
    (_case, cargoResult) => {
      const fixture = createFixture();
      const request = createRequest(fixture);
      mocks.spawnSync
        .mockImplementationOnce(() => ({
          status: 0,
          signal: null,
          stdout: `# branch.oid ${EXPECTED_HEAD}\n# branch.head main\n`,
          stderr: '',
        }))
        .mockImplementationOnce(() => cargoResult);

      let failure: unknown;
      try {
        preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
          preflightArguments(fixture, request.requestSha256Hex),
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toBe(
        'Frontier offline Cargo dependency closure is incomplete',
      );
      expect((failure as Error).message).not.toContain(
        'private local dependency-cache',
      );
    },
  );

  it('rejects an incomplete offline Rust standard-library dependency closure', () => {
    const fixture = createFixture();
    const request = createRequest(fixture);
    mocks.spawnSync
      .mockImplementationOnce(() => ({
        status: 0,
        signal: null,
        stdout: `# branch.oid ${EXPECTED_HEAD}\n# branch.head main\n`,
        stderr: '',
      }))
      .mockImplementationOnce(() => ({
        status: 0,
        signal: null,
        stdout: '',
        stderr: '',
      }))
      .mockImplementationOnce(() => ({
        status: 101,
        signal: null,
        stdout: '',
        stderr: 'private local rust-src dependency diagnostic',
      }));

    expect(() =>
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
        preflightArguments(fixture, request.requestSha256Hex),
      )).toThrow('Frontier offline Cargo dependency closure is incomplete');
  });

  it('rejects Rust standard-library source drift after offline closure', () => {
    const fixture = createFixture();
    const request = createRequest(fixture);
    const before = rustSrcObservation(fixture.toolchain.rustc);
    mocks.inspectRustSrc
      .mockReset()
      .mockReturnValueOnce(before)
      .mockReturnValueOnce({
        ...before,
        cargoLockSha256Hex: '2'.repeat(64),
      });

    expect(() =>
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
        preflightArguments(fixture, request.requestSha256Hex),
      )).toThrow(/Rust standard-library source changed during offline closure/);
  });

  it('keeps CLI failure output finite and imports no campaign or node launcher', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/scripts/preflight-substrate-federated-isolated-devnet-campaign-v1.ts',
      ),
      'utf8',
    );
    expect(source).toContain(
      '`isolated campaign preflight failed during ${phase}\\n`',
    );
    expect(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CAMPAIGN_PREFLIGHT_V1_PHASES,
    ).toHaveLength(12);
    for (const phase of
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CAMPAIGN_PREFLIGHT_V1_PHASES) {
      expect(phase).toMatch(/^[A-Za-z ]+$/u);
    }
    expect(source).not.toMatch(
      /runSubstrateFederatedIsolatedDevnet.*(?:Campaign|BootstrapRoot|NodeProcess)|node-wallet|signer|submitter|broadcaster/iu,
    );
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(packageJson.scripts['federated:isolated:campaign:preflight'])
      .toBe(
        'npm run node:guard && tsx src/scripts/preflight-substrate-federated-isolated-devnet-campaign-v1.ts',
      );
  });

  it('executes the CLI failure path without relaying raw arguments or paths', async () => {
    const childProcess = await vi.importActual<
      typeof import('node:child_process')
    >('node:child_process');
    const sentinel = 'C:\\private\\preflight-secret-sentinel';
    const result = childProcess.spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        resolve(
          process.cwd(),
          'src/scripts/preflight-substrate-federated-isolated-devnet-campaign-v1.ts',
        ),
        '--request',
        sentinel,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.replace(/\r\n/gu, '\n')).toBe(
      'isolated campaign preflight failed during arguments and platform\n',
    );
    expect(result.stderr).not.toContain(sentinel);
  });
});

interface Fixture {
  readonly root: string;
  readonly requestPath: string;
  readonly artifactDestination: string;
  readonly frontierTemporaryRoot: string;
  readonly frontierSource: string;
  readonly frontierCargoCache: string;
  readonly relayerCargoCache: string;
  readonly ergoSource: string;
  readonly baseSpec: string;
  readonly baseSpecSha256Hex: string;
  readonly toolchain: Readonly<{
    git: string;
    cargo: string;
    rustc: string;
    java: string;
    sbt: string;
    wasmPack: string;
  }>;
}

function rustSrcObservation(rustcExecutablePath: string): Readonly<{
  libraryPath: string;
  cargoManifestPath: string;
  cargoLockPath: string;
  cargoManifestSha256Hex: string;
  cargoLockSha256Hex: string;
  rustSrcLockSha256Hex: string;
}> {
  const libraryPath = join(
    dirname(dirname(rustcExecutablePath)),
    'lib',
    'rustlib',
    'src',
    'rust',
    'library',
  );
  return Object.freeze({
    libraryPath,
    cargoManifestPath: join(libraryPath, 'Cargo.toml'),
    cargoLockPath: join(libraryPath, 'Cargo.lock'),
    cargoManifestSha256Hex: '3'.repeat(64),
    cargoLockSha256Hex: '4'.repeat(64),
    rustSrcLockSha256Hex: '5'.repeat(64),
  });
}

function createFixture(): Readonly<Fixture> {
  const root = mkdtempSync(join(tmpdir(), 'e2s-campaign-preflight-'));
  roots.push(root);
  const frontierTemporaryRoot = join(root, 'frontier-temporary');
  const frontierSource = join(frontierTemporaryRoot, 'frontier-source');
  const frontierCargoCache = join(root, 'frontier-cache');
  const relayerCargoCache = join(root, 'relayer-cache');
  const ergoSource = join(root, 'ergo-source');
  const rustToolDirectory = join(root, 'rust-toolchain', 'bin');
  const rustLibraryDirectory = join(
    root,
    'rust-toolchain',
    'lib',
    'rustlib',
    'src',
    'rust',
    'library',
  );
  for (const path of [
    frontierTemporaryRoot,
    frontierSource,
    frontierCargoCache,
    relayerCargoCache,
    ergoSource,
    rustToolDirectory,
    rustLibraryDirectory,
  ]) mkdirSync(path, { recursive: true });
  const toolchain = {
    git: join(root, 'git.exe'),
    cargo: join(rustToolDirectory, 'cargo.exe'),
    rustc: join(rustToolDirectory, 'rustc.exe'),
    java: join(root, 'java.exe'),
    sbt: join(root, 'sbt-launch.jar'),
    wasmPack: join(root, 'wasm-pack.exe'),
  } as const;
  for (const path of Object.values(toolchain)) {
    writeFileSync(
      path,
      path === toolchain.git ? FIXTURE_GIT_BYTES : Buffer.from('fixture', 'utf8'),
    );
  }
  writeFileSync(join(rustLibraryDirectory, 'Cargo.toml'), '[workspace]\n');
  const baseSpec = join(root, 'base-spec.json');
  const baseSpecBytes = Buffer.from('{"name":"base"}\n', 'utf8');
  writeFileSync(baseSpec, baseSpecBytes);
  return Object.freeze({
    root,
    requestPath: join(root, 'bootstrap-request.v1.json'),
    artifactDestination: join(root, 'relayer-artifacts'),
    frontierTemporaryRoot,
    frontierSource,
    frontierCargoCache,
    relayerCargoCache,
    ergoSource,
    baseSpec,
    baseSpecSha256Hex: createHash('sha256').update(baseSpecBytes).digest('hex'),
    toolchain,
  });
}

function createRequest(
  fixture: Readonly<Fixture>,
  overrides: Readonly<{
    bridgeAddress?: string;
    bridgeOwnerAddress?: string;
    tokenAddress?: string;
    expectedBaseSpecSha256Hex?: string;
    primaryRpcUrl?: string;
    witnessP2pPort?: string;
    ergoSource?: string;
  }> = {},
) {
  return createSubstrateFederatedIsolatedDevnetBootstrapRequestFromArgumentsV1([
    '--git-executable', fixture.toolchain.git,
    '--cargo-executable', fixture.toolchain.cargo,
    '--rustc-executable', fixture.toolchain.rustc,
    '--java-executable', fixture.toolchain.java,
    '--sbt-launcher-jar', fixture.toolchain.sbt,
    '--wasm-pack-executable', fixture.toolchain.wasmPack,
    '--frontier-source', fixture.frontierSource,
    '--base-spec', fixture.baseSpec,
    '--expected-chain-id', '31337',
    '--bridge-address',
    overrides.bridgeAddress
      ?? SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
    '--token-address', overrides.tokenAddress
      ?? SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
    '--bridge-owner-address', overrides.bridgeOwnerAddress
      ?? SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_OWNER_ADDRESS_V1,
    '--expected-base-spec-sha256',
    overrides.expectedBaseSpecSha256Hex ?? fixture.baseSpecSha256Hex,
    '--expected-frontier-commit', '5'.repeat(40),
    '--expected-frontier-patch-sha256', '6'.repeat(64),
    '--expected-runtime-code-sha256', '7'.repeat(64),
    '--expected-sudo-address',
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_OWNER_ADDRESS_V1,
    '--expected-frontier-binary-version', 'bridge-node 1.0.0',
    '--primary-rpc-url', overrides.primaryRpcUrl ?? 'http://127.0.0.1:9944',
    '--witness-rpc-url', 'http://127.0.0.1:9945',
    '--primary-p2p-port', '30333',
    '--witness-p2p-port', overrides.witnessP2pPort ?? '30334',
    '--primary-prometheus-port', '9615',
    '--witness-prometheus-port', '9616',
    '--expected-native-genesis-hash', `0x${'9'.repeat(64)}`,
    '--expected-node-name', 'bridge-node',
    '--expected-node-version', '1.0.0',
    '--signed-legacy-owner-mint-transaction',
    SIGNED_LAB_OWNER_MINT_TRANSACTION,
    '--ergo-source', overrides.ergoSource ?? fixture.ergoSource,
    '--expected-head', EXPECTED_HEAD,
    '--artifact-destination', fixture.artifactDestination,
    '--output', fixture.requestPath,
  ]);
}

function preflightArguments(
  fixture: Readonly<Fixture>,
  requestSha256Hex: string,
  overrides: Readonly<{
    amountNanoErg?: string;
    recipientAddressHex?: string;
    relayerCargoCache?: string;
  }> = {},
): string[] {
  return [
    '--request', fixture.requestPath,
    '--expected-request-sha256', requestSha256Hex,
    '--amount-nano-erg', overrides.amountNanoErg ?? '15000000',
    '--recipient-address-hex',
    overrides.recipientAddressHex
      ?? SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_OWNER_ADDRESS_V1
        .slice(2),
    '--frontier-temporary-root', fixture.frontierTemporaryRoot,
    '--frontier-cargo-cache', fixture.frontierCargoCache,
    '--relayer-cargo-cache',
    overrides.relayerCargoCache ?? fixture.relayerCargoCache,
  ];
}

function inventory(root: string): string[] {
  return readdirSync(root, { recursive: true })
    .map(value => value.toString())
    .sort();
}
