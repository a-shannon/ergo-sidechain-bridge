import { createHash } from 'node:crypto';
import { basename, dirname, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertFrontierLabApplicationOwnerClaimV1,
  assertFrontierLabApplicationOwnerRequestV1,
  bindFrontierLabApplicationOwnerRequestV1,
  claimFrontierLabApplicationOwnerRequestV1,
} from '../adapters/frontier-lab-application-owner-v1.js';
import { canonicalJson } from '../ergo-settlement-core/strict-json.js';
import {
  projectSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9,
} from '../relayer-core/substrate-federated-isolated-devnet-tracker-transport-managed-phase-v9.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
} from '../substrate-federated-isolated-devnet-frontier-lab-application-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_BASE_SUDO_ADDRESS_V2,
} from '../substrate-federated-isolated-devnet-frontier-lab-owner-binding-v2.js';
import {
  createSubstrateFederatedIsolatedDevnetBootstrapRequestOwnerSessionV1,
  type SubstrateFederatedIsolatedDevnetBootstrapRequestOwnerSessionV1,
} from './create-substrate-federated-isolated-devnet-bootstrap-request-v1.js';
import {
  runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFromArgumentsV11,
} from './run-substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-worker-v11.js';
import { runSubstrateFederatedIsolatedDevnetTrackerV2CampaignFromArguments }
  from './run-substrate-federated-isolated-devnet-tracker-v2-campaign.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_COMMAND_REQUEST_V1_SCHEMA,
  type BootstrapCommandRequestV1,
} from './substrate-federated-isolated-devnet-bootstrap-request-v1.js';

const io = vi.hoisted(() => ({
  build: vi.fn(),
  read: vi.fn(),
  sourcePreflight: vi.fn(),
  campaignPreflight: vi.fn(),
  files: new Map<string, Uint8Array>(),
  directories: new Set<string>(),
}));

vi.mock('./preflight-substrate-federated-isolated-devnet-campaign-v1.js', () => ({
  preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1: io.campaignPreflight,
}));

// External IO and campaign preflight are simulated. The request loader,
// request provenance, V11/V2 workers, campaign roots and owner adapter remain real.
vi.mock('node:fs', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs')>();
  return {
    ...original,
    mkdirSync: (path: string) => {
      if (dirname(path) !== at('journal') || io.directories.has(path)) {
        throw new Error('unexpected synthetic directory creation');
      }
      io.directories.add(path);
    },
    readdirSync: (path: string) => {
      if (!io.directories.has(path)) throw new Error('unexpected directory read');
      return [...io.directories].filter(entry => dirname(entry) === path).map(entry => basename(entry));
    },
    lstatSync: (path: string) => {
      if (!io.files.has(path) && !io.directories.has(path)) {
        throw Object.assign(new Error('synthetic path absent'), { code: 'ENOENT' });
      }
      return {
        isFile: () => io.files.has(path),
        isDirectory: () => io.directories.has(path),
        isSymbolicLink: () => false,
      };
    },
    realpathSync: Object.assign((path: string) => path, { native: (path: string) => path }),
  };
});
vi.mock('../bridge-repository-layout.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../bridge-repository-layout.js')>()),
  resolveBridgeRepositoryRootsFromCheckoutLayout: (bridgeRoot: string) =>
    Object.freeze({ bridgeRoot, worktreeRoot: bridgeRoot }),
}));
vi.mock('../create-only-out-of-repository-artifact.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../create-only-out-of-repository-artifact.js')>()),
  readBoundedRegularFile: io.read,
}));
vi.mock('../substrate-federated-isolated-devnet-ergo-node-build-v1.js', () => ({
  buildSubstrateFederatedIsolatedDevnetErgoNodeV1: io.build,
}));
vi.mock(
  '../apps/bridge-daemon/substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.js',
  async importOriginal => ({
    ...(await importOriginal<
      typeof import('../apps/bridge-daemon/substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.js')
    >()),
    preflightSubstrateFederatedIsolatedDevnetFrontierApplicationRunnerPlanV3: io.sourcePreflight,
  }),
);

const fixtureRoot = resolve('C:/e2s-fresh-owner-entry-fixture');
const at = (name: string): string => resolve(fixtureRoot, name);
const requestPath = at('request.json');
const missingCustody = 'LAB application request has no unclaimed live owner custody';
const sessions: Readonly<SubstrateFederatedIsolatedDevnetBootstrapRequestOwnerSessionV1>[] = [];
let useV2 = false;

beforeEach(() => {
  vi.resetAllMocks();
  io.files.clear();
  io.directories.clear();
  vi.stubEnv('CARGO_HOME', at('relayer-cargo'));
  for (const name of ['', 'temporary', 'frontier-cargo', 'journal', 'relayer-cargo', 'frontier', 'ergo']) {
    io.directories.add(at(name));
  }
  for (const name of ['git.exe', 'cargo.exe', 'rustc.exe', 'java.exe', 'sbt.jar', 'wasm-pack.exe']) {
    io.files.set(at(name), new Uint8Array());
  }
  io.files.set(at('base-spec.json'), Buffer.from('{"name":"synthetic"}\n'));
  io.read.mockImplementation((path: string, _label: string, maximumBytes: number) => {
    // No fallback to disk: only the two explicitly synthetic documents may be read.
    if (path !== requestPath && path !== at('base-spec.json')) {
      throw new Error('unexpected external read');
    }
    const bytes = io.files.get(path);
    if (bytes === undefined || bytes.length > maximumBytes) throw new Error('invalid fixture read');
    return { bytes: Uint8Array.from(bytes), canonicalPath: path };
  });
  io.sourcePreflight.mockImplementation(input => Object.freeze(input));
  io.campaignPreflight.mockImplementation((args: string[]) => {
    const request = JSON.parse(Buffer.from(io.files.get(requestPath)!).toString('utf8')) as BootstrapCommandRequestV1;
    if (`0x${args[7]}` !== request.sourceTarget.bridgeOwnerAddress) {
      throw new Error('synthetic V2 preflight recipient mismatch');
    }
    return Object.freeze({
      status: 'request_bound_lab_campaign_preflight_passed', requestSha256Hex: args[3],
      pegIn: { amountNanoErg: args[5], recipientAddressHex: args[7] },
      requestBindings: { expectedHeadCommitSha1Hex: request.relayer.expectedHeadCommitSha1Hex },
    });
  });
  io.build.mockImplementation(() => { throw new Error('unexpected build entry'); });
});

afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose();
  vi.unstubAllEnvs();
});

describe.each(['V11', 'V2'])('fresh-owner same-process entry through the real %s worker and root', version => {
  beforeEach(() => { useV2 = version === 'V2'; });
  it('claims the exact request owner before build and disposes it on build failure', async () => {
    const fixture = await createFixture();
    const unrelated = await createFixture(false);
    bindFrontierLabApplicationOwnerRequestV1(
      unrelated.session.owner, unrelated.bytes, unrelated.digest,
    );
    publish(fixture.request);
    const reachedBuild = new Error('synthetic post-claim build stop');
    expect(() => assertFrontierLabApplicationOwnerClaimV1(fixture.session.owner, fixture.digest))
      .toThrow('LAB application request owner is not claimed by its campaign');
    io.build.mockImplementation(input => {
      assertFrontierLabApplicationOwnerClaimV1(fixture.session.owner, fixture.digest);
      expect(() => claimFrontierLabApplicationOwnerRequestV1(fixture.digest)).toThrow(missingCustody);
      expect(() => assertFrontierLabApplicationOwnerClaimV1(unrelated.session.owner, unrelated.digest))
        .toThrow('LAB application request owner is not claimed by its campaign');
      expect(input.ergoSourcePath).toBe(fixture.request.ergoNode.ergoSourcePath);
      throw reachedBuild;
    });

    await expect(runWorker(fixture)).rejects.toBe(reachedBuild);
    expect(io.build).toHaveBeenCalledOnce();
    expect(io.sourcePreflight).toHaveBeenCalledOnce();
    expect(projectSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9(reachedBuild))
      .toBe(useV2 ? null : 'ergo node build');
    expect(() => assertFrontierLabApplicationOwnerRequestV1(fixture.session.owner, fixture.digest))
      .toThrow('LAB application owner lacks live process custody');
    expect(() => claimFrontierLabApplicationOwnerRequestV1(fixture.digest)).toThrow(missingCustody);
    expect(claimFrontierLabApplicationOwnerRequestV1(unrelated.digest)).toBe(unrelated.session.owner);
    // Give the retry a fresh synthetic journal so journal reuse cannot mask
    // missing custody. The real loader also issues fresh request provenance.
    for (const directory of io.directories) {
      if (dirname(directory) === at('journal')) io.directories.delete(directory);
    }
    await expectBeforeBuildFailure(runWorker(fixture), missingCustody, 1);
    expect(io.sourcePreflight).toHaveBeenCalledTimes(2);
  });

  it('rejects a public request without creator custody (child-process analogue) before build', async () => {
    const fixture = await createFixture(false);
    await expectBeforeBuildFailure(runWorker(fixture), missingCustody);
  });

  it('rejects disposed request-owner custody before build', async () => {
    const fixture = await createFixture();
    fixture.session.dispose();
    await expectBeforeBuildFailure(runWorker(fixture), missingCustody);
  });

  it('rejects a different canonical request while preserving the original owner binding', async () => {
    const fixture = await createFixture();
    const digest = publish({
      ...fixture.request,
      relayer: { ...fixture.request.relayer, expectedHeadCommitSha1Hex: 'ab'.repeat(20) },
    });
    expect(digest).not.toBe(fixture.digest);
    await expectBeforeBuildFailure(runWorker({ ...fixture, digest }), missingCustody);
    expect(claimFrontierLabApplicationOwnerRequestV1(fixture.digest)).toBe(fixture.session.owner);
  });

  it('rejects duplicate custody claim with freshly loaded request provenance before build', async () => {
    const fixture = await createFixture();
    expect(claimFrontierLabApplicationOwnerRequestV1(fixture.digest)).toBe(fixture.session.owner);
    assertFrontierLabApplicationOwnerClaimV1(fixture.session.owner, fixture.digest);
    await expectBeforeBuildFailure(runWorker(fixture), missingCustody);
    // Rejection must not dispose custody that this invocation did not acquire.
    assertFrontierLabApplicationOwnerClaimV1(fixture.session.owner, fixture.digest);
  });

  it('rejects recipient drift before source preflight, claim or build', async () => {
    const fixture = await createFixture();
    await expectBeforeBuildFailure(
      runWorker(fixture, 'cd'.repeat(20)),
      useV2 ? 'synthetic V2 preflight recipient mismatch'
        : 'canonical bootstrap request owner-mint probe differs from the V11 peg-in plan',
    );
    expect(io.sourcePreflight).not.toHaveBeenCalled();
    expect(claimFrontierLabApplicationOwnerRequestV1(fixture.digest)).toBe(fixture.session.owner);
  });

  it('rejects request byte/digest mismatch before source preflight, claim or build', async () => {
    const fixture = await createFixture();
    await expectBeforeBuildFailure(
      runWorker({ ...fixture, digest: '00'.repeat(32) }),
      'bootstrap request bytes changed after parent validation',
    );
    expect(io.sourcePreflight).not.toHaveBeenCalled();
    expect(claimFrontierLabApplicationOwnerRequestV1(fixture.digest)).toBe(fixture.session.owner);
  });
});

async function expectBeforeBuildFailure(
  result: Promise<unknown>, message: string, priorBuildCalls = 0,
): Promise<void> {
  const failure = await result.then(
    () => { throw new Error('worker unexpectedly completed'); },
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toBe(message);
  expect(projectSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9(failure))
    .toBeNull();
  expect(io.build).toHaveBeenCalledTimes(priorBuildCalls);
}

function publish(request: BootstrapCommandRequestV1): string {
  const bytes = Buffer.from(`${canonicalJson(request)}\n`, 'utf8');
  io.files.set(requestPath, bytes);
  return createHash('sha256').update(bytes).digest('hex');
}

async function createFixture(bind = true) {
  const session = await createSubstrateFederatedIsolatedDevnetBootstrapRequestOwnerSessionV1();
  sessions.push(session);
  const request: BootstrapCommandRequestV1 = {
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_COMMAND_REQUEST_V1_SCHEMA,
    version: 1,
    toolchain: {
      gitExecutablePath: at('git.exe'),
      cargoExecutablePath: at('cargo.exe'),
      rustcExecutablePath: at('rustc.exe'),
      javaExecutablePath: at('java.exe'),
      sbtLauncherJarPath: at('sbt.jar'),
      wasmPackExecutablePath: at('wasm-pack.exe'),
    },
    sourceTarget: {
      frontierSourcePath: at('frontier'),
      baseSpecPath: at('base-spec.json'),
      expectedChainId: '42',
      bridgeAddress: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
      tokenAddress: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
      bridgeOwnerAddress: session.owner.ownerAddressHex,
      expectedBaseSpecSha256Hex: createHash('sha256').update(io.files.get(at('base-spec.json'))!).digest('hex'),
      expectedFrontierCommit: '55'.repeat(20),
      expectedFrontierPatchSha256Hex: '66'.repeat(32),
      expectedRuntimeCodeSha256Hex: '77'.repeat(32),
      expectedSudoAddress: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_BASE_SUDO_ADDRESS_V2,
      expectedFrontierBinaryVersion: 'bridge-node 1.0.0',
      primaryRpcUrl: 'http://127.0.0.1:9944',
      witnessRpcUrl: 'http://127.0.0.1:9945',
      primaryP2pPort: 30333,
      witnessP2pPort: 30334,
      primaryPrometheusPort: 9615,
      witnessPrometheusPort: 9616,
      expectedNativeGenesisHashHex: `0x${'99'.repeat(32)}`,
      expectedNodeName: 'bridge-node',
      expectedNodeVersion: '1.0.0',
      signedLegacyOwnerMintTransactionHex: session.owner.signedLegacyOwnerMintTransactionHex,
    },
    ergoNode: { ergoSourcePath: at('ergo') },
    relayer: {
      expectedHeadCommitSha1Hex: '88'.repeat(20),
      artifactDestinationDirectory: at('artifacts'),
    },
  };
  const digest = publish(request);
  const bytes = io.files.get(requestPath)!;
  if (bind) bindFrontierLabApplicationOwnerRequestV1(session.owner, bytes, digest);
  return { session, request, bytes, digest };
}

function runWorker(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  recipient = fixture.session.owner.ownerAddressHex.slice(2),
) {
  const args = [
    '--request', requestPath,
    '--expected-request-sha256', fixture.digest,
    '--amount-nano-erg', '15000000',
    '--recipient-address-hex', recipient,
    '--frontier-temporary-root', at('temporary'),
    '--frontier-cargo-cache', at('frontier-cargo'),
    '--tracker-transport-journal-root', at('journal'),
  ];
  return useV2
    ? runSubstrateFederatedIsolatedDevnetTrackerV2CampaignFromArguments([
      ...args, '--relayer-cargo-cache', at('relayer-cargo'),
    ])
    : runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFromArgumentsV11(args);
}
