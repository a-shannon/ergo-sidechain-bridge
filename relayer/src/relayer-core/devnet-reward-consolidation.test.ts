import { describe, expect, it, vi } from 'vitest';

import {
  buildDevnetRewardConsolidationPlan,
  DEVNET_REWARD_CONSOLIDATION_CHAIN_ANCHOR_HEIGHT,
  devnetRewardConsolidationSessionIdentityDigestHex,
  deriveDevnetRewardErgoTreeHex,
  deriveDevnetRewardErgoTreeHexForDelay,
  executeDevnetRewardConsolidation,
  revalidateDevnetRewardConsolidationPlan,
  type DevnetRewardConsolidationExecutionPorts,
  type DevnetRewardConsolidationPlan,
} from './devnet-reward-consolidation.js';

const PUBLIC_KEY = `02${'11'.repeat(32)}`;
const REWARD_TREE = deriveDevnetRewardErgoTreeHex(PUBLIC_KEY);
const DESTINATION_TREE = `0008cd${PUBLIC_KEY}`;
const NODE_ORIGIN = 'http://127.0.0.1:9051';
const CHAIN_ANCHOR = 'ab'.repeat(32);

function rewardBox(
  marker: string,
  creationHeight: number,
  value: string = '6000000000',
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    boxId: marker.repeat(64),
    value,
    ergoTree: REWARD_TREE,
    assets: [],
    additionalRegisters: {},
    transactionId: marker.toUpperCase().repeat(64),
    index: 1,
    creationHeight,
    ...overrides,
  };
}

function plan(
  rewardBoxes: readonly unknown[] = [rewardBox('1', 90), rewardBox('2', 91)],
): DevnetRewardConsolidationPlan {
  const result = buildDevnetRewardConsolidationPlan({
    nodeOrigin: NODE_ORIGIN,
    nodeNetwork: 'devnet',
    chainAnchorHeight: DEVNET_REWARD_CONSOLIDATION_CHAIN_ANCHOR_HEIGHT,
    chainAnchorHeaderIdHex: CHAIN_ANCHOR,
    addressNetworkPrefix: 16,
    currentHeight: 100,
    signerPublicKeyHex: PUBLIC_KEY,
    rewardErgoTreeHex: REWARD_TREE,
    destinationErgoTreeHex: DESTINATION_TREE,
    rewardBoxes,
  });
  if (!result) throw new Error('fixture did not produce a plan');
  return result;
}

function revalidation(
  candidate: DevnetRewardConsolidationPlan,
  observedAtHeight: number,
  observationDigestHex: string,
) {
  return {
    sourceSetDigestHex: candidate.sourceSetDigestHex,
    observedAtHeight,
    observationDigestHex,
  };
}

describe('devnet reward consolidation plan', () => {
  it('preserves the fast reward tree and derives the exact standard-delay tree', () => {
    expect(deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY, 1))
      .toBe(deriveDevnetRewardErgoTreeHex(PUBLIC_KEY));
    expect(deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY, 720)).toBe(
      `100204a00b08cd${PUBLIC_KEY}ea02d192a39a8cc7a70173007301`,
    );
    expect(() => deriveDevnetRewardErgoTreeHexForDelay(
      PUBLIC_KEY,
      2 as 1,
    )).toThrow(/exactly 1 or 720 blocks/);
  });

  it('selects deterministic mature pure-ERG inputs and conserves their full value', () => {
    const candidate = plan([
      rewardBox('3', 99),
      rewardBox('2', 91, '6000000000'),
      rewardBox('4', 90, '1', { assets: [{ tokenId: 'aa'.repeat(32), amount: '1' }] }),
      rewardBox('1', 90, '6000000000'),
    ]);

    expect(candidate.inputBoxIds).toEqual(['1'.repeat(64), '2'.repeat(64)]);
    expect(candidate.observedBoxCount).toBe(4);
    expect(candidate.eligibleBoxCount).toBe(2);
    expect(candidate.ignoredBoxCount).toBe(2);
    expect(candidate.selectedValueNanoErg).toBe('12000000000');
    expect(candidate.unsignedTransaction.outputs).toEqual([{
      value: 12_000_000_000,
      ergoTree: DESTINATION_TREE,
      assets: [],
      additionalRegisters: {},
      creationHeight: 100,
    }]);
    expect(candidate.unsignedTransaction.inputs).toHaveLength(2);
    expect(candidate.unsignedTransaction.dataInputs).toEqual([]);
    expect(candidate.sessionIdentityDigestHex).toBe(
      devnetRewardConsolidationSessionIdentityDigestHex({
        nodeOrigin: NODE_ORIGIN,
        nodeNetwork: 'devnet',
        chainAnchorHeight: DEVNET_REWARD_CONSOLIDATION_CHAIN_ANCHOR_HEIGHT,
        chainAnchorHeaderIdHex: CHAIN_ANCHOR,
        addressNetworkPrefix: 16,
        signerPublicKeyHex: PUBLIC_KEY,
        destinationErgoTreeHex: DESTINATION_TREE,
      }),
    );
  });

  it('returns no plan when no exact reward input is mature and pure ERG', () => {
    expect(buildDevnetRewardConsolidationPlan({
      nodeOrigin: NODE_ORIGIN,
      nodeNetwork: 'devnet',
      chainAnchorHeight: DEVNET_REWARD_CONSOLIDATION_CHAIN_ANCHOR_HEIGHT,
      chainAnchorHeaderIdHex: CHAIN_ANCHOR,
      addressNetworkPrefix: 16,
      currentHeight: 100,
      signerPublicKeyHex: PUBLIC_KEY,
      rewardErgoTreeHex: REWARD_TREE,
      destinationErgoTreeHex: DESTINATION_TREE,
      rewardBoxes: [rewardBox('1', 99)],
    })).toBeNull();
  });

  it.each([
    ['a remote endpoint', { nodeOrigin: 'https://example.com' }, /local patched-devnet HTTP origin/i],
    ['another loopback port', { nodeOrigin: 'http://127.0.0.1:9052' }, /port 9051/i],
    ['mainnet', { nodeNetwork: 'mainnet' }, /devnet identity/i],
    ['testnet', { nodeNetwork: 'testnet' }, /devnet identity/i],
    ['a mainnet prefix', { addressNetworkPrefix: 0 }, /network prefix 16/i],
    ['a mutated reward proposition', {
      rewardErgoTreeHex: `${REWARD_TREE.slice(0, -2)}00`,
    }, /exact patched-devnet reward proposition/i],
    ['a foreign reward tree', {
      rewardBoxes: [rewardBox('1', 90, '1', { ergoTree: '00aa' })],
    }, /discovered reward ErgoTree/i],
  ])('rejects %s', (_name, overrides, expected) => {
    expect(() => buildDevnetRewardConsolidationPlan({
      nodeOrigin: NODE_ORIGIN,
      nodeNetwork: 'devnet',
      chainAnchorHeight: DEVNET_REWARD_CONSOLIDATION_CHAIN_ANCHOR_HEIGHT,
      chainAnchorHeaderIdHex: CHAIN_ANCHOR,
      addressNetworkPrefix: 16,
      currentHeight: 100,
      signerPublicKeyHex: PUBLIC_KEY,
      rewardErgoTreeHex: REWARD_TREE,
      destinationErgoTreeHex: DESTINATION_TREE,
      rewardBoxes: [rewardBox('1', 90)],
      ...overrides,
    })).toThrow(expected);
  });

  it('rejects duplicate source IDs before transaction construction', () => {
    expect(() => plan([rewardBox('1', 90), rewardBox('1', 91)]))
      .toThrow(/duplicate box IDs/i);
  });

  it.each([
    ['assets', { assets: undefined }, /assets must be an array/i],
    ['registers', { additionalRegisters: undefined }, /registers must be a plain object/i],
    ['output index', { index: -1 }, /output index must be an integer between 0/i],
  ])('rejects a reward observation without canonical %s', (_name, overrides, expected) => {
    expect(() => plan([rewardBox('1', 90, '6000000000', overrides)]))
      .toThrow(expected);
  });
});

describe('devnet reward consolidation revalidation', () => {
  it('accepts the exact selected source set in any response order', () => {
    const candidate = plan();
    const result = revalidateDevnetRewardConsolidationPlan({
      plan: candidate,
      nodeOrigin: NODE_ORIGIN,
      nodeNetwork: 'devnet',
      chainAnchorHeight: DEVNET_REWARD_CONSOLIDATION_CHAIN_ANCHOR_HEIGHT,
      chainAnchorHeaderIdHex: CHAIN_ANCHOR,
      addressNetworkPrefix: 16,
      observedAtHeight: 101,
      boxes: [rewardBox('2', 91), rewardBox('1', 90)],
    });
    expect(result.sourceSetDigestHex).toBe(candidate.sourceSetDigestHex);
    expect(result.observedAtHeight).toBe(101);
  });

  it.each([
    ['missing input', [rewardBox('1', 90)], /every selected input/i],
    ['value drift', [rewardBox('1', 90), rewardBox('2', 91, '6000000001')], /changed after planning/i],
    ['token injection', [
      rewardBox('1', 90),
      rewardBox('2', 91, '6000000000', {
        assets: [{ tokenId: 'aa'.repeat(32), amount: '1' }],
      }),
    ], /no longer an eligible pure-ERG/i],
  ])('rejects %s', (_name, boxes, expected) => {
    const candidate = plan();
    expect(() => revalidateDevnetRewardConsolidationPlan({
      plan: candidate,
      nodeOrigin: NODE_ORIGIN,
      nodeNetwork: 'devnet',
      chainAnchorHeight: DEVNET_REWARD_CONSOLIDATION_CHAIN_ANCHOR_HEIGHT,
      chainAnchorHeaderIdHex: CHAIN_ANCHOR,
      addressNetworkPrefix: 16,
      observedAtHeight: 101,
      boxes,
    })).toThrow(expected);
  });

  it('rejects node identity drift during revalidation', () => {
    const candidate = plan();
    expect(() => revalidateDevnetRewardConsolidationPlan({
      plan: candidate,
      nodeOrigin: 'http://localhost:9051',
      nodeNetwork: 'devnet',
      chainAnchorHeight: DEVNET_REWARD_CONSOLIDATION_CHAIN_ANCHOR_HEIGHT,
      chainAnchorHeaderIdHex: CHAIN_ANCHOR,
      addressNetworkPrefix: 16,
      observedAtHeight: 101,
      boxes: [rewardBox('1', 90), rewardBox('2', 91)],
    })).toThrow(/node identity changed/i);
  });

  it('rejects chain-anchor drift during revalidation', () => {
    const candidate = plan();
    expect(() => revalidateDevnetRewardConsolidationPlan({
      plan: candidate,
      nodeOrigin: NODE_ORIGIN,
      nodeNetwork: 'devnet',
      chainAnchorHeight: DEVNET_REWARD_CONSOLIDATION_CHAIN_ANCHOR_HEIGHT,
      chainAnchorHeaderIdHex: 'ac'.repeat(32),
      addressNetworkPrefix: 16,
      observedAtHeight: 101,
      boxes: [rewardBox('1', 90), rewardBox('2', 91)],
    })).toThrow(/node identity changed/i);
  });
});

describe('devnet reward consolidation execution lifecycle', () => {
  function ports(
    candidate: DevnetRewardConsolidationPlan,
    calls: string[],
    overrides: Partial<{
      check: DevnetRewardConsolidationExecutionPorts['checker']['check'];
      revalidate: DevnetRewardConsolidationExecutionPorts['revalidator']['revalidate'];
      submit: DevnetRewardConsolidationExecutionPorts['transport']['submit'];
      observe: DevnetRewardConsolidationExecutionPorts['confirmationObserver']['observe'];
    }> = {},
  ): DevnetRewardConsolidationExecutionPorts {
    return {
      signer: {
        sign: vi.fn(async () => {
          calls.push('sign');
          return {
            signedTransactionDigestHex: '11'.repeat(32),
            signerArtifact: {},
          };
        }),
      },
      checker: {
        check: overrides.check ?? vi.fn(async () => {
          calls.push('check');
          return {
            checkResponseDigestHex: '22'.repeat(32),
            checkerArtifact: {},
          };
        }),
      },
      revalidator: {
        revalidate: overrides.revalidate ?? vi.fn(async (_checked, phase) => {
          calls.push(`revalidate:${phase}`);
          return revalidation(
            candidate,
            phase === 'post-check' ? 101 : 102,
            phase === 'post-check' ? '33'.repeat(32) : '34'.repeat(32),
          );
        }),
      },
      broadcastAuthorizer: {
        authorize: vi.fn(() => {
          calls.push('authorize');
          return {
            authorizationDigestHex: '44'.repeat(32),
            authorizationArtifact: {},
          };
        }),
      },
      journal: {
        reserve: vi.fn(() => {
          calls.push('reserve');
          return {
            durableAttemptDigestHex: '45'.repeat(32),
            durableArtifact: {},
          };
        }),
        finalize: vi.fn(({ submission }) => {
          calls.push(`finalize:${submission.status}`);
          return {
            status: submission.status,
            journalDigestHex: '46'.repeat(32),
          };
        }),
        confirm: vi.fn(() => {
          calls.push('journal:confirm');
        }),
      },
      transport: {
        submit: overrides.submit ?? vi.fn(async () => {
          calls.push('submit');
          return {
            status: 'accepted' as const,
            submittedTxId: 'aa'.repeat(32),
            responseDigestHex: '55'.repeat(32),
          };
        }),
      },
      confirmationObserver: {
        observe: overrides.observe ?? vi.fn(async () => {
          calls.push('confirm');
          return {
            status: 'confirmed' as const,
            confirmations: 10,
            observedAtHeight: 112,
            observationDigestHex: '66'.repeat(32),
            confirmationHeight: 103,
            confirmationHeaderIdHex: '67'.repeat(32),
          };
        }),
      },
    };
  }

  it('orders sign, check, two source revalidations, authorization, transport and observation', async () => {
    const candidate = plan();
    const calls: string[] = [];
    const result = await executeDevnetRewardConsolidation({
      plan: candidate,
      expectedTxId: 'aa'.repeat(32),
    }, ports(candidate, calls));

    expect(calls).toEqual([
      'sign',
      'check',
      'revalidate:post-check',
      'revalidate:pre-transport',
      'authorize',
      'reserve',
      'submit',
      'finalize:accepted',
      'confirm',
      'journal:confirm',
    ]);
    expect(result).toMatchObject({
      status: 'accepted',
      submittedTxId: 'aa'.repeat(32),
      confirmationStatus: 'confirmed',
      transportAttempted: true,
    });
  });

  it('stops before revalidation and transport when the node check rejects', async () => {
    const candidate = plan();
    const calls: string[] = [];
    const dependencies = ports(candidate, calls, {
      check: vi.fn(async () => {
        calls.push('check');
        return null;
      }),
    });

    await expect(executeDevnetRewardConsolidation({
      plan: candidate,
      expectedTxId: 'aa'.repeat(32),
    }, dependencies)).resolves.toEqual({
      status: 'check_rejected',
      expectedTxId: 'aa'.repeat(32),
      transportAttempted: false,
    });
    expect(calls).toEqual(['sign', 'check']);
  });

  it('rejects pre-transport source drift without calling transport', async () => {
    const candidate = plan();
    const calls: string[] = [];
    const submit = vi.fn(async () => null);
    const dependencies = ports(candidate, calls, {
      revalidate: vi.fn(async (_checked, phase) => {
        calls.push(`revalidate:${phase}`);
        const result = revalidation(
          candidate,
          phase === 'post-check' ? 101 : 102,
          phase === 'post-check' ? '33'.repeat(32) : '34'.repeat(32),
        );
        return phase === 'pre-transport'
          ? { ...result, sourceSetDigestHex: 'ff'.repeat(32) }
          : result;
      }),
      submit,
    });

    await expect(executeDevnetRewardConsolidation({
      plan: candidate,
      expectedTxId: 'aa'.repeat(32),
    }, dependencies)).rejects.toThrow(/changed the source set/i);
    expect(submit).not.toHaveBeenCalled();
  });

  it('rejects a node response for a different submitted transaction', async () => {
    const candidate = plan();
    const dependencies = ports(candidate, [], {
      submit: vi.fn(async () => ({
        status: 'accepted' as const,
        submittedTxId: 'bb'.repeat(32),
        responseDigestHex: '55'.repeat(32),
      })),
    });
    await expect(executeDevnetRewardConsolidation({
      plan: candidate,
      expectedTxId: 'aa'.repeat(32),
    }, dependencies)).rejects.toThrow(/another transaction ID/i);
  });

  it('rejects a confirmation claim below the final-depth policy', async () => {
    const candidate = plan();
    const dependencies = ports(candidate, [], {
      observe: vi.fn(async () => ({
        status: 'confirmed' as const,
        confirmations: 1,
        observedAtHeight: 103,
        observationDigestHex: '66'.repeat(32),
        confirmationHeight: 103,
        confirmationHeaderIdHex: '67'.repeat(32),
      })),
    });
    await expect(executeDevnetRewardConsolidation({
      plan: candidate,
      expectedTxId: 'aa'.repeat(32),
    }, dependencies)).rejects.toThrow(/lacks final depth/i);
  });

  it('rejects a claimed final count inconsistent with observed canonical depth', async () => {
    const candidate = plan();
    const dependencies = ports(candidate, [], {
      observe: vi.fn(async () => ({
        status: 'confirmed' as const,
        confirmations: 10,
        observedAtHeight: 103,
        observationDigestHex: '66'.repeat(32),
        confirmationHeight: 103,
        confirmationHeaderIdHex: '67'.repeat(32),
      })),
    });
    await expect(executeDevnetRewardConsolidation({
      plan: candidate,
      expectedTxId: 'aa'.repeat(32),
    }, dependencies)).rejects.toThrow(/depth is inconsistent/i);
  });

  it('keeps a thrown transport outcome ambiguous and still observes the expected ID', async () => {
    const candidate = plan();
    const dependencies = ports(candidate, [], {
      submit: vi.fn(async () => {
        throw new Error('timeout');
      }),
      observe: vi.fn(async () => ({
        status: 'not_found' as const,
        confirmations: 0,
        observedAtHeight: 103,
        observationDigestHex: '66'.repeat(32),
        confirmationHeight: null,
        confirmationHeaderIdHex: null,
      })),
    });
    await expect(executeDevnetRewardConsolidation({
      plan: candidate,
      expectedTxId: 'aa'.repeat(32),
    }, dependencies)).resolves.toMatchObject({
      status: 'ambiguous',
      submittedTxId: null,
      confirmationStatus: 'not_found',
      transportAttempted: true,
    });
  });

  it('reconciles an ambiguous transport when the exact transaction is confirmed', async () => {
    const candidate = plan();
    const calls: string[] = [];
    const dependencies = ports(candidate, calls, {
      submit: vi.fn(async () => {
        calls.push('submit');
        throw new Error('timeout');
      }),
    });
    await expect(executeDevnetRewardConsolidation({
      plan: candidate,
      expectedTxId: 'aa'.repeat(32),
    }, dependencies)).resolves.toMatchObject({
      status: 'reconciled',
      submittedTxId: 'aa'.repeat(32),
      confirmationStatus: 'confirmed',
      durableAttemptRecorded: true,
    });
    expect(calls).toContain('journal:confirm');
  });
});
