import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({
  preflight: vi.fn(), load: vi.fn(), run: vi.fn(), assertReceipt: vi.fn(),
}));
vi.mock('./preflight-substrate-federated-isolated-devnet-campaign-v1.js', () => ({
  preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1: io.preflight,
}));
vi.mock('./run-substrate-federated-isolated-devnet-bootstrap-worker-v1.js', () => ({
  loadCanonicalBootstrapRequestBoundWithProvenanceV1: io.load,
}));
vi.mock('../apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-v2-campaign-root.js', () => ({
  runSubstrateFederatedIsolatedDevnetTrackerV2CampaignRoot: io.run,
  assertSubstrateFederatedIsolatedDevnetTrackerV2CampaignReceipt: io.assertReceipt,
}));

import { runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments }
  from './run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.js';
import { runSubstrateFederatedIsolatedDevnetTrackerV2CampaignFromArguments }
  from './run-substrate-federated-isolated-devnet-tracker-v2-campaign.js';

const digest = '12'.repeat(32);
const head = '34'.repeat(20);
const recipient = '56'.repeat(20);
const receipt = Object.freeze({ requestSha256Hex: digest });
const binding = Object.freeze({});
let build: Readonly<{ exactBuildInput: true; ergoSourcePath: string }>;
let lifecycle: ReturnType<typeof lifecycleFixture>;
function lifecycleFixture(root: string) { return Object.freeze({
  relayerArtifacts: Object.freeze({ expectedHeadCommitSha1Hex: head, destinationDirectory: join(root, 'artifacts') }),
  sourceHistory: Object.freeze({ acceptance: Object.freeze({
    frontierSourcePath: 'selected-source', cargoExecutablePath: 'selected-cargo',
    rustcExecutablePath: 'selected-rustc', gitExecutablePath: 'selected-git',
  }) }),
}); }
let root: string;
let args: string[];

beforeEach(() => {
  vi.resetAllMocks();
  root = mkdtempSync(join(tmpdir(), 'e2s-tracker-v2-worker-'));
  build = Object.freeze({ exactBuildInput: true, ergoSourcePath: join(root, 'ergo-source') });
  lifecycle = lifecycleFixture(root);
  for (const name of ['temporary', 'frontier-cargo', 'journal', 'relayer-cargo']) mkdirSync(join(root, name));
  writeFileSync(join(root, 'request.json'), '{}\n');
  vi.stubEnv('CARGO_HOME', join(root, 'relayer-cargo'));
  args = [
    '--request', join(root, 'request.json'), '--expected-request-sha256', digest,
    '--amount-nano-erg', '15000000', '--recipient-address-hex', recipient,
    '--frontier-temporary-root', join(root, 'temporary'),
    '--frontier-cargo-cache', join(root, 'frontier-cargo'),
    '--tracker-transport-journal-root', join(root, 'journal'),
    '--relayer-cargo-cache', join(root, 'relayer-cargo'),
  ];
  io.preflight.mockImplementation(() => Object.freeze({
    status: 'request_bound_lab_campaign_preflight_passed', requestSha256Hex: digest,
    pegIn: { amountNanoErg: '15000000', recipientAddressHex: recipient },
    requestBindings: { expectedHeadCommitSha1Hex: head },
  }));
  io.load.mockReturnValue({ input: { build, lifecycle }, requestBinding: binding });
  io.run.mockResolvedValue({ receipt });
  io.assertReceipt.mockImplementation(value => {
    if (value !== receipt) throw new Error('synthetic receipt provenance rejected');
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe('fixed in-process tracker V2 campaign worker', () => {
  it('preflights the exact request and returns the original V2 receipt without a legacy envelope', async () => {
    await expect(runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments(args)).resolves.toBe(receipt);
    expect(io.preflight).toHaveBeenCalledExactlyOnceWith([
      ...args.slice(0, 12), ...args.slice(14),
    ]);
    expect(io.load.mock.invocationCallOrder[0]).toBeLessThan(io.preflight.mock.invocationCallOrder[0]!);
    expect(io.preflight.mock.invocationCallOrder[0]).toBeLessThan(io.run.mock.invocationCallOrder[0]!);
    expect(io.run).toHaveBeenCalledExactlyOnceWith({
      build, lifecycle, requestBinding: binding,
      pegIn: { amountNanoErg: '15000000', recipientAddressHex: recipient },
      frontierApplicationRunner: {
        frontierSourceDirectory: 'selected-source', temporaryDirectoryRoot: join(root, 'temporary'),
        cargoDependencyCacheDirectory: join(root, 'frontier-cargo'),
        cargoExecutablePath: 'selected-cargo', rustcExecutablePath: 'selected-rustc',
        gitExecutablePath: 'selected-git', offline: true,
      }, trackerTransportJournalRoot: join(root, 'journal'),
    });
    const input = io.run.mock.calls[0]![0];
    expect(input.build).toBe(build);
    expect(input.lifecycle).toBe(lifecycle);
    expect(input.requestBinding).toBe(binding);
    expect(io.assertReceipt).toHaveBeenCalledExactlyOnceWith(receipt);
  });

  it('snapshots command arguments before its asynchronous module load', async () => {
    const run = runSubstrateFederatedIsolatedDevnetTrackerV2CampaignFromArguments(args);
    args[5] = '999';
    args[3] = 'ff'.repeat(32);
    await expect(run).resolves.toBe(receipt);
    expect(io.preflight.mock.calls[0]![0][5]).toBe('15000000');
    expect(io.load.mock.calls[0]![3]).toBe(digest);
  });

  it.each([
    [3, 'ab'.repeat(31)], [3, 'AB'.repeat(32)], [5, '0'], [5, '-1'], [5, '1.5'],
    [5, '01'], [5, '9223372036854775808'], [5, '9'.repeat(100)],
    [7, '00'.repeat(20)], [7, 'AB'.repeat(20)], [7, 'ab'.repeat(19)],
    [1, ''], [9, '--arbitrary'], [14, '--unknown'],
  ] as const)('rejects malformed argument %i = %s before preflight', async (index, value) => {
    args[index] = value;
    await expect(runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments(args)).rejects.toThrow('arguments are invalid');
    expect(io.preflight).not.toHaveBeenCalled();
    expect(io.run).not.toHaveBeenCalled();
  });

  it.each(['extra', 'missing', 'reordered', 'legacy'])('rejects %s command grammar', async mode => {
    if (mode === 'extra') args.push('--fallback', 'v11');
    if (mode === 'missing') args.pop();
    if (mode === 'reordered') [args[0], args[2]] = [args[2]!, args[0]!];
    if (mode === 'legacy') args.splice(14);
    await expect(runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments(args)).rejects.toThrow('arguments are invalid');
    expect(io.preflight).not.toHaveBeenCalled();
  });

  it.each([[9, 11], [9, 13], [9, 15], [11, 13], [11, 15], [13, 15]])(
    'rejects overlapping runtime roots %i/%i', async (left, right) => {
      args[left] = args[right]!;
      await expect(runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments(args)).rejects.toThrow('must be disjoint');
      expect(io.preflight).not.toHaveBeenCalled();
      expect(io.run).not.toHaveBeenCalled();
    },
  );
  it('rejects a runtime directory containing the request', async () => {
    args[9] = root;
    await expect(runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments(args)).rejects.toThrow('exclude the worktree and request');
    expect(io.preflight).not.toHaveBeenCalled();
  });
  it('rejects nested runtime directories', async () => {
    const nested = join(root, 'temporary', 'nested');
    mkdirSync(nested);
    args[13] = nested;
    await expect(runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments(args)).rejects.toThrow('must be disjoint');
    expect(io.preflight).not.toHaveBeenCalled();
  });
  it('rejects a request inside the worktree', async () => {
    args[1] = fileURLToPath(new URL('./run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.ts', import.meta.url));
    await expect(runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments(args)).rejects.toThrow('request must remain outside');
    expect(io.preflight).not.toHaveBeenCalled();
  });
  it('rejects a runtime root inside the worktree', async () => {
    args[13] = fileURLToPath(new URL('.', import.meta.url));
    await expect(runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments(args)).rejects.toThrow('exclude the worktree and request');
    expect(io.preflight).not.toHaveBeenCalled();
  });
  it.each(['platform', 'node'])('rejects an unsupported %s before preflight', async field => {
    vi.stubGlobal('process', field === 'platform'
      ? { ...process, platform: 'linux' }
      : { ...process, versions: { ...process.versions, node: '22.0.0' } });
    await expect(runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments(args)).rejects.toThrow('requires Windows and Node 24');
    expect(io.preflight).not.toHaveBeenCalled();
    expect(io.run).not.toHaveBeenCalled();
  });
  it('rejects an ambient Cargo cache different from the selected cache', async () => {
    vi.stubEnv('CARGO_HOME', join(root, 'frontier-cargo'));
    await expect(runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments(args)).rejects.toThrow('CARGO_HOME differs');
    expect(io.preflight).not.toHaveBeenCalled();
  });
  it.each(['artifact descendant', 'artifact ancestor', 'Ergo source'])('rejects journal overlap with %s before preflight or build', async collision => {
    const input = { build, lifecycle };
    if (collision === 'Ergo source') {
      input.build = { ...build, ergoSourcePath: join(root, 'journal', 'ergo-source') };
    } else {
      input.lifecycle = { ...lifecycle, relayerArtifacts: {
        ...lifecycle.relayerArtifacts,
        destinationDirectory: collision === 'artifact descendant'
          ? join(root, 'journal', 'tracker-transport-attempt') : root,
      } };
    }
    io.load.mockReturnValue({ input, requestBinding: binding });
    await expect(runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments(args)).rejects.toThrow('journal overlaps request-bound source or artifact');
    expect(io.preflight).not.toHaveBeenCalled();
    expect(io.run).not.toHaveBeenCalled();
  });
  it.each(['status', 'digest', 'amount', 'recipient', 'head'])('rejects preflight %s drift before campaign entry', async field => {
    const original = io.preflight.getMockImplementation()!;
    io.preflight.mockImplementation(() => {
      const value = structuredClone(original());
      if (field === 'status') value.status = 'not-executed';
      if (field === 'digest') value.requestSha256Hex = 'ff'.repeat(32);
      if (field === 'amount') value.pegIn.amountNanoErg = '1';
      if (field === 'recipient') value.pegIn.recipientAddressHex = 'ff'.repeat(20);
      if (field === 'head') value.requestBindings.expectedHeadCommitSha1Hex = 'ff'.repeat(20);
      return value;
    });
    await expect(runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments(args)).rejects.toThrow('preflight differs');
    expect(io.run).not.toHaveBeenCalled();
  });
  it.each(['preflight', 'load', 'run'] as const)('stops on %s failure without fallback or retry', async phase => {
    const failure = new Error('synthetic failure');
    io[phase].mockImplementation(() => { throw failure; });
    await expect(runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments(args)).rejects.toBe(failure);
    expect(io[phase]).toHaveBeenCalledOnce();
    if (phase !== 'run') expect(io.run).not.toHaveBeenCalled();
    expect(io.assertReceipt).not.toHaveBeenCalled();
  });
  it('withholds a copied root receipt', async () => {
    io.run.mockResolvedValue({ receipt: { ...receipt } });
    await expect(runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments(args)).rejects.toThrow('provenance rejected');
  });
  it('withholds a root receipt for another request even after provenance accepts', async () => {
    io.run.mockResolvedValue({ receipt: { ...receipt, requestSha256Hex: 'ff'.repeat(32) } });
    io.assertReceipt.mockImplementation(() => undefined);
    await expect(runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments(args)).rejects.toThrow('different request');
  });
});
