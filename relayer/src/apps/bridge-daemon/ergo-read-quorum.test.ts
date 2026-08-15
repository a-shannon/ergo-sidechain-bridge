import { describe, expect, it, vi } from 'vitest';

import {
  createErgoReadQuorumSources,
  type ErgoReadQuorumClient,
} from '../../adapters/ergo-read-quorum.js';
import { ErgoReadQuorumSupervisor } from '../../relayer-core/ergo-read-quorum-supervisor.js';
import {
  requireErgoReadQuorumDecisionObservation,
  runErgoReadQuorumGate,
} from './ergo-read-quorum.js';

const hex = (byte: string): string => byte.repeat(32);

function stableClient(input: Readonly<{ unavailable?: () => boolean }> = {}): ErgoReadQuorumClient {
  return {
    async getCurrentHeight(): Promise<number> {
      if (input.unavailable?.()) throw new Error('unavailable');
      return 42;
    },
    async getBlockHeaderHash(): Promise<string> {
      if (input.unavailable?.()) throw new Error('unavailable');
      return hex('03');
    },
  };
}

function sources(input: Readonly<{
  primary?: ErgoReadQuorumClient;
  witness?: ErgoReadQuorumClient;
}> = {}) {
  return createErgoReadQuorumSources({
    primaryClient: input.primary ?? stableClient(),
    primaryNodeUrl: 'https://reader-one.example',
    primaryNodeIdentityDigestHex: hex('01'),
    primaryAdministrationIdentityDigestHex: hex('02'),
    witnessClient: input.witness ?? stableClient(),
    witnessNodeUrl: 'https://reader-two.example',
    witnessNodeIdentityDigestHex: hex('03'),
    witnessAdministrationIdentityDigestHex: hex('04'),
    maxProbeDurationMs: 100,
  });
}

function clock(now = 10) {
  return { now: () => now };
}

describe('Ergo read-quorum daemon composition', () => {
  it('permits a read cycle only after a fresh, proven dual-source observation', async () => {
    const supervisor = new ErgoReadQuorumSupervisor({ maxAgeMs: 100 });
    const pair = sources();

    const decision = await runErgoReadQuorumGate({
      supervisor,
      sources: pair,
      clock: clock(),
    });
    expect(decision).toMatchObject({
      decision: 'allow_read_cycle',
      tip: {
        height: 42,
        headerIdHex: hex('03'),
      },
      snapshot: { fundsReleaseHeld: false, state: 'closed' },
    });
    expect(requireErgoReadQuorumDecisionObservation(pair, decision)).toMatchObject({
      tipHeight: 42,
      tipHeaderIdHex: hex('03'),
      observationDigestHex: decision.tip?.observationDigestHex,
    });
    expect(() => requireErgoReadQuorumDecisionObservation(pair, {
      ...decision,
    })).toThrow(/invalid_response|observation failed/i);
  });

  it('holds when sources are null, unbranded, or unhealthy', async () => {
    const logger = { warn: vi.fn() };
    const nullSupervisor = new ErgoReadQuorumSupervisor({ maxAgeMs: 100 });
    await expect(runErgoReadQuorumGate({
      supervisor: nullSupervisor,
      sources: null,
      clock: clock(),
      logger,
    })).resolves.toMatchObject({
      decision: 'hold_read_cycle',
      tip: null,
      snapshot: { lastFailureCode: 'not_configured' },
    });

    const singleSupervisor = new ErgoReadQuorumSupervisor({ maxAgeMs: 100 });
    await expect(runErgoReadQuorumGate({
      supervisor: singleSupervisor,
      sources: { sourceIdsHex: [hex('01'), hex('02')] } as never,
      clock: clock(),
      logger,
    })).resolves.toMatchObject({
      decision: 'hold_read_cycle',
      tip: null,
      snapshot: { fundsReleaseHeld: true },
    });

    const unhealthySupervisor = new ErgoReadQuorumSupervisor({ maxAgeMs: 100 });
    await expect(runErgoReadQuorumGate({
      supervisor: unhealthySupervisor,
      sources: sources({ witness: stableClient({ unavailable: () => true }) }),
      clock: clock(),
      logger,
    })).resolves.toMatchObject({
      decision: 'hold_read_cycle',
      tip: null,
      snapshot: { lastFailureCode: 'source_unavailable' },
    });
    expect(logger.warn).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('reader-one.example');
  });

  it('requires a fresh dual-source probe before recovery can allow another read cycle', async () => {
    let unavailable = true;
    const primary = stableClient({ unavailable: () => unavailable });
    const witness = stableClient({ unavailable: () => unavailable });
    const pair = sources({ primary, witness });
    const supervisor = new ErgoReadQuorumSupervisor({ maxAgeMs: 100 });

    await expect(runErgoReadQuorumGate({
      supervisor,
      sources: pair,
      clock: clock(10),
    })).resolves.toMatchObject({
      decision: 'hold_read_cycle',
      snapshot: { state: 'open', lastFailureCode: 'source_unavailable' },
    });

    unavailable = false;
    await expect(runErgoReadQuorumGate({
      supervisor,
      sources: pair,
      clock: clock(20),
    })).resolves.toMatchObject({
      decision: 'allow_read_cycle',
      tip: { height: 42, headerIdHex: hex('03') },
      snapshot: { state: 'closed', consecutiveFailures: 0 },
    });
  });

  it('holds every overlapping gate invocation and invalidates the active generation', async () => {
    let release: (() => void) | undefined;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const delayedClient = (): ErgoReadQuorumClient => ({
      async getCurrentHeight(): Promise<number> {
        await barrier;
        return 42;
      },
      async getBlockHeaderHash(): Promise<string> {
        return hex('03');
      },
    });
    const supervisor = new ErgoReadQuorumSupervisor({ maxAgeMs: 100 });
    const superseded = runErgoReadQuorumGate({
      supervisor,
      sources: sources({
        primary: delayedClient(),
        witness: delayedClient(),
      }),
      clock: clock(10),
    });

    await expect(runErgoReadQuorumGate({
      supervisor,
      sources: sources(),
      clock: clock(20),
    })).resolves.toMatchObject({
      decision: 'hold_read_cycle',
      snapshot: {
        state: 'open',
        fundsReleaseHeld: true,
        lastFailureCode: 'probe_stale',
      },
    });

    release?.();
    await expect(superseded).resolves.toMatchObject({
      decision: 'hold_read_cycle',
      snapshot: {
        state: 'open',
        fundsReleaseHeld: true,
        lastFailureCode: 'probe_stale',
      },
    });
    expect(supervisor.getReadCycleDecision(20).decision).toBe('hold_read_cycle');

    await expect(runErgoReadQuorumGate({
      supervisor,
      sources: sources(),
      clock: clock(21),
    })).resolves.toMatchObject({
      decision: 'allow_read_cycle',
      snapshot: { state: 'closed', fundsReleaseHeld: false },
    });
  });
});
