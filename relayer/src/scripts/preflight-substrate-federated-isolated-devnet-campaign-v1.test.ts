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
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  spawnSync: vi.fn(),
  applicationPreflight: vi.fn(),
  inspectBuildLock: vi.fn(),
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
  () => ({
    inspectSubstrateFederatedIsolatedDevnetErgoNodeBuildLockV1:
      mocks.inspectBuildLock,
  }),
);

import { sha256CanonicalJson } from '../ergo-settlement-core/strict-json.js';
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
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CAMPAIGN_PREFLIGHT_V1_SCHEMA,
} from './preflight-substrate-federated-isolated-devnet-campaign-v1.js';

const roots: string[] = [];
const EXPECTED_HEAD = 'a'.repeat(40);
const RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CAMPAIGN_PREFLIGHT_V1';
const FIXTURE_GIT_BYTES = Buffer.from('fixture-git', 'utf8');
const FIXTURE_GIT_SHA256 = createHash('sha256')
  .update(FIXTURE_GIT_BYTES)
  .digest('hex');

beforeEach(() => {
  mocks.spawnSync.mockReset().mockImplementation(
    () => ({
      status: 0,
      signal: null,
      stdout: `# branch.oid ${EXPECTED_HEAD}\n# branch.head main\n`,
      stderr: '',
    }),
  );
  mocks.applicationPreflight.mockReset().mockImplementation(input => input);
  mocks.inspectBuildLock.mockReset().mockReturnValue({
    gitExecutableSha256Hex: FIXTURE_GIT_SHA256,
  });
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
    const receipt =
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
        preflightArguments(fixture, request.requestSha256Hex),
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
    const { receiptDigestHex, ...body } = receipt;
    expect(receiptDigestHex).toBe(
      sha256CanonicalJson(body, RECEIPT_DIGEST_DOMAIN),
    );
    expect(mocks.spawnSync).toHaveBeenCalledTimes(1);
    expect(mocks.applicationPreflight).toHaveBeenCalledTimes(1);
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
    const labRequest = createRequest(labFixture, {
      tokenAddress: `0x${'c'.repeat(40)}`,
    });
    expect(() =>
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
        preflightArguments(labFixture, labRequest.requestSha256Hex),
      )).toThrow(/differs from the deterministic deployment/i);

    const bridgeFixture = createFixture();
    const bridgeRequest = createRequest(bridgeFixture, {
      bridgeAddress: `0x${'d'.repeat(40)}`,
    });
    expect(() =>
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
        preflightArguments(bridgeFixture, bridgeRequest.requestSha256Hex),
      )).toThrow(/differs from the deterministic deployment/i);

    const ownerFixture = createFixture();
    const ownerRequest = createRequest(ownerFixture, {
      bridgeOwnerAddress: `0x${'e'.repeat(40)}`,
    });
    expect(() =>
      preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1(
        preflightArguments(ownerFixture, ownerRequest.requestSha256Hex),
      )).toThrow(/owner or recipient differs from the deterministic deployment/i);

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

  it('keeps CLI failure output generic and imports no campaign or node launcher', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/scripts/preflight-substrate-federated-isolated-devnet-campaign-v1.ts',
      ),
      'utf8',
    );
    expect(source).toContain(
      "process.stderr.write('isolated campaign preflight failed\\n')",
    );
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

function createFixture(): Readonly<Fixture> {
  const root = mkdtempSync(join(tmpdir(), 'e2s-campaign-preflight-'));
  roots.push(root);
  const frontierTemporaryRoot = join(root, 'frontier-temporary');
  const frontierSource = join(frontierTemporaryRoot, 'frontier-source');
  const frontierCargoCache = join(root, 'frontier-cache');
  const relayerCargoCache = join(root, 'relayer-cache');
  const ergoSource = join(root, 'ergo-source');
  for (const path of [
    frontierTemporaryRoot,
    frontierSource,
    frontierCargoCache,
    relayerCargoCache,
    ergoSource,
  ]) mkdirSync(path);
  const toolchain = {
    git: join(root, 'git.exe'),
    cargo: join(root, 'cargo.exe'),
    rustc: join(root, 'rustc.exe'),
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
    '--expected-sudo-address', `5${'8'.repeat(47)}`,
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
    '--signed-legacy-owner-mint-transaction', '0x01020304',
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
    relayerCargoCache?: string;
  }> = {},
): string[] {
  return [
    '--request', fixture.requestPath,
    '--expected-request-sha256', requestSha256Hex,
    '--amount-nano-erg', overrides.amountNanoErg ?? '15000000',
    '--recipient-address-hex',
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_OWNER_ADDRESS_V1.slice(2),
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
