import { beforeAll, describe, expect, it } from 'vitest';

import {
  assertMatchingAggregateSettlementErgoObservationConsensusProvenance,
  assertStableAggregateSettlementErgoObservationProvenance,
  createMatchingAggregateSettlementErgoObservationSources,
  observeMatchingAggregateSettlementErgoTransaction,
  observeStableAggregateSettlementErgoTransaction,
} from './aggregate-settlement-ergo-observation.js';
import {
  createAggregateSettlementErgoObservationRecord,
  DEFAULT_AGGREGATE_SETTLEMENT_ERGO_FINALITY_POLICY,
  normalizeAggregateSettlementErgoObservationRecord,
} from './aggregate-settlement-ergo-finality-policy.js';
import { createAggregateSettlementErgoWitness } from './aggregate-settlement-recovery.js';
import { buildConfirmedErgoTransactionFixture } from './aggregate-settlement-ergo-fixture.test-helper.js';

let TX_ID = '';
const TIP_HEADER = '22'.repeat(32);
const INCLUSION_HEADER = '33'.repeat(32);
const TEST_SOURCE_IDENTITIES = {
  primaryNodeIdentityDigestHex: '41'.repeat(32),
  primaryAdministrationIdentityDigestHex: '42'.repeat(32),
  witnessNodeIdentityDigestHex: '51'.repeat(32),
  witnessAdministrationIdentityDigestHex: '52'.repeat(32),
} as const;
let BASE_TRANSACTION: Record<string, unknown>;

beforeAll(async () => {
  const fixture = await buildConfirmedErgoTransactionFixture({
    outputs: [{
      value: 1_000_000,
      ergoTree: '10010100d17300',
      creationHeight: 100,
    }],
    inclusionHeight: 111,
    inclusionHeaderIdHex: INCLUSION_HEADER,
  });
  TX_ID = fixture.id;
  BASE_TRANSACTION = fixture.transaction;
});

function confirmedTransaction(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...structuredClone(BASE_TRANSACTION),
    ...overrides,
  };
}

function source(overrides: Record<string, unknown> = {}): any {
  return {
    getCurrentHeight: async () => 120,
    getBlockHeaderHash: async (height: number) => (
      height === 111 ? INCLUSION_HEADER : TIP_HEADER
    ),
    getTransaction: async () => confirmedTransaction(),
    hasUnconfirmedTransaction: async () => false,
    ...overrides,
  };
}

describe('stable aggregate settlement Ergo observation', () => {
  it('accepts an exact canonical transaction only at the versioned finality depth', async () => {
    const observation = await observeStableAggregateSettlementErgoTransaction({
      ergo: source(),
      transactionId: TX_ID,
    });

    expect(observation.record).toMatchObject({
      policyVersion: 1,
      requiredConfirmations: 10,
      status: 'confirmed_final',
      transactionIdHex: TX_ID,
      inclusionHeight: 111,
      inclusionHeaderIdHex: INCLUSION_HEADER,
      observedTipHeight: 120,
      observedTipHeaderIdHex: TIP_HEADER,
      confirmations: 10,
    });
    expect(observation.record.transactionDigestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(observation.record.observationDigestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(() => assertStableAggregateSettlementErgoObservationProvenance(observation)).not.toThrow();
  });

  it('records a canonical transaction below depth as pre-finality', async () => {
    const observation = await observeStableAggregateSettlementErgoTransaction({
      ergo: source({ getCurrentHeight: async () => 119 }),
      transactionId: TX_ID,
    });

    expect(observation.record.status).toBe('confirmed_pre_finality');
    expect(observation.record.confirmations).toBe(9);
  });

  it.each([
    [false, 'absent'],
    [true, 'mempool'],
  ] as const)('binds stable non-confirmed state mempool=%s as %s', async (mempool, status) => {
    const observation = await observeStableAggregateSettlementErgoTransaction({
      ergo: source({
        getTransaction: async () => null,
        hasUnconfirmedTransaction: async () => mempool,
      }),
      transactionId: TX_ID,
    });

    expect(observation.record).toMatchObject({
      status,
      transactionIdHex: TX_ID,
      transactionDigestHex: null,
      inclusionHeight: null,
      inclusionHeaderIdHex: null,
      confirmations: 0,
    });
    expect(observation.transaction).toBeNull();
  });

  it('rejects an inclusion block that is no longer canonical', async () => {
    await expect(observeStableAggregateSettlementErgoTransaction({
      ergo: source({
        getBlockHeaderHash: async (height: number) => (
          height === 111 ? '66'.repeat(32) : TIP_HEADER
        ),
      }),
      transactionId: TX_ID,
    })).rejects.toThrow(/inclusion block is not canonical/);
  });

  it('rejects a same-height Ergo tip replacement', async () => {
    let tipReads = 0;
    await expect(observeStableAggregateSettlementErgoTransaction({
      ergo: source({
        getBlockHeaderHash: async (height: number) => {
          if (height === 111) return INCLUSION_HEADER;
          tipReads += 1;
          return tipReads === 1 ? TIP_HEADER : '77'.repeat(32);
        },
      }),
      transactionId: TX_ID,
    })).rejects.toThrow(/canonical tip changed/);
  });

  it('rejects a tip-height change during observation', async () => {
    let heightReads = 0;
    await expect(observeStableAggregateSettlementErgoTransaction({
      ergo: source({
        getCurrentHeight: async () => 120 + heightReads++,
      }),
      transactionId: TX_ID,
    })).rejects.toThrow(/canonical tip changed/);
  });

  it('rejects transaction content drift under an unchanged tip', async () => {
    const drifted = await buildConfirmedErgoTransactionFixture({
      outputs: [{
        value: 1_000_001,
        ergoTree: '10010100d17300',
        creationHeight: 100,
      }],
      inclusionHeight: 111,
      inclusionHeaderIdHex: INCLUSION_HEADER,
    });
    let transactionReads = 0;
    await expect(observeStableAggregateSettlementErgoTransaction({
      ergo: source({
        getTransaction: async () => transactionReads++ === 0
          ? confirmedTransaction()
          : { ...drifted.transaction, id: TX_ID },
      }),
      transactionId: TX_ID,
    })).rejects.toThrow(/not canonical Ergo transaction JSON|canonical bytes do not match/);
  });

  it('normalizes equivalent node JSON before comparing canonical transaction bytes', async () => {
    let transactionReads = 0;
    const observation = await observeStableAggregateSettlementErgoTransaction({
      ergo: source({
        getTransaction: async () => {
          const transaction = confirmedTransaction();
          if (transactionReads++ > 0) {
            (transaction.outputs as Array<Record<string, unknown>>)[0].value = 1_000_000;
          }
          return transaction;
        },
      }),
      transactionId: TX_ID,
    });

    expect(observation.record.status).toBe('confirmed_final');
    expect(observation.record.transactionIdHex).toBe(TX_ID);
  });

  it('rejects a transaction that confirms during absence observation', async () => {
    let transactionReads = 0;
    await expect(observeStableAggregateSettlementErgoTransaction({
      ergo: source({
        getTransaction: async () => transactionReads++ === 0 ? null : confirmedTransaction(),
      }),
      transactionId: TX_ID,
    })).rejects.toThrow(/confirmed while absence was observed/);
  });

  it('rejects mempool disagreement during absence observation', async () => {
    let mempoolReads = 0;
    await expect(observeStableAggregateSettlementErgoTransaction({
      ergo: source({
        getTransaction: async () => null,
        hasUnconfirmedTransaction: async () => mempoolReads++ === 0,
      }),
      transactionId: TX_ID,
    })).rejects.toThrow(/mempool presence changed/);
  });

  it('rejects a policy that weakens the ten-confirmation floor', async () => {
    await expect(observeStableAggregateSettlementErgoTransaction({
      ergo: source(),
      transactionId: TX_ID,
      policy: { version: 1, requiredConfirmations: 9 },
    })).rejects.toThrow(/at least 10 confirmations/);
  });

  it('rejects forged provenance and tampered persisted observation fields', async () => {
    const observation = await observeStableAggregateSettlementErgoTransaction({
      ergo: source(),
      transactionId: TX_ID,
    });
    expect(() => assertStableAggregateSettlementErgoObservationProvenance({
      ...observation,
    })).toThrow(/provenance is missing/);

    expect(() => normalizeAggregateSettlementErgoObservationRecord({
      ...observation.record,
      observedTipHeaderIdHex: 'aa'.repeat(32),
    })).toThrow(/digest does not match/);
  });

  it('rejects a final record whose depth does not meet its policy', () => {
    expect(() => createAggregateSettlementErgoObservationRecord({
      policyVersion: DEFAULT_AGGREGATE_SETTLEMENT_ERGO_FINALITY_POLICY.version,
      requiredConfirmations: DEFAULT_AGGREGATE_SETTLEMENT_ERGO_FINALITY_POLICY.requiredConfirmations,
      status: 'confirmed_final',
      transactionIdHex: TX_ID,
      transactionDigestHex: '99'.repeat(32),
      inclusionHeight: 112,
      inclusionHeaderIdHex: INCLUSION_HEADER,
      observedTipHeight: 120,
      observedTipHeaderIdHex: TIP_HEADER,
      confirmations: 9,
    })).toThrow(/does not satisfy/);
  });

  it('creates destructive-recovery consensus only from matching distinct sources', async () => {
    const { primarySource, witnessSource } = createMatchingAggregateSettlementErgoObservationSources({
      ...TEST_SOURCE_IDENTITIES,
      primaryErgo: source({ getTransaction: async () => null }),
      primaryNodeUrl: 'http://primary.example:9052',
      witnessErgo: source({ getTransaction: async () => null }),
      witnessNodeUrl: 'http://witness.example:9052',
    });
    const observed = await observeMatchingAggregateSettlementErgoTransaction({
      primary: primarySource,
      witness: witnessSource,
      transactionId: TX_ID,
    });
    const { consensus } = observed;

    expect(consensus).toMatchObject({
      sourceCount: 2,
      sourceIdsHex: [primarySource.sourceIdHex, witnessSource.sourceIdHex].sort(),
      record: { status: 'absent' },
    });
    expect(() => assertMatchingAggregateSettlementErgoObservationConsensusProvenance(
      consensus,
    )).not.toThrow();
  });

  it('rejects duplicate source identities and source disagreement', async () => {
    expect(() => createMatchingAggregateSettlementErgoObservationSources({
      ...TEST_SOURCE_IDENTITIES,
      primaryErgo: source({ getTransaction: async () => null }),
      primaryNodeUrl: 'http://primary.example:9052',
      witnessErgo: source({ getTransaction: async () => null }),
      witnessNodeUrl: 'http://primary.example:9052',
    })).toThrow(/distinct Ergo node origins/);

    const disagreeing = createMatchingAggregateSettlementErgoObservationSources({
      ...TEST_SOURCE_IDENTITIES,
      primaryErgo: source({ getTransaction: async () => null }),
      primaryNodeUrl: 'http://primary.example:9052',
      witnessErgo: source({
        getTransaction: async () => null,
        hasUnconfirmedTransaction: async () => true,
      }),
      witnessNodeUrl: 'http://witness.example:9052',
    });

    await expect(observeMatchingAggregateSettlementErgoTransaction({
      primary: disagreeing.primarySource,
      witness: disagreeing.witnessSource,
      transactionId: TX_ID,
    })).rejects.toThrow(/disagree/);
    await expect(observeMatchingAggregateSettlementErgoTransaction({
      primary: disagreeing.primarySource,
      witness: disagreeing.primarySource,
      transactionId: TX_ID,
    })).rejects.toThrow(/distinct Ergo clients/);

    const otherPair = createMatchingAggregateSettlementErgoObservationSources({
      ...TEST_SOURCE_IDENTITIES,
      primaryErgo: source({ getTransaction: async () => null }),
      primaryNodeUrl: 'http://other-primary.example:9052',
      witnessErgo: source({ getTransaction: async () => null }),
      witnessNodeUrl: 'http://other-witness.example:9052',
    });
    await expect(observeMatchingAggregateSettlementErgoTransaction({
      primary: disagreeing.primarySource,
      witness: otherPair.witnessSource,
      transactionId: TX_ID,
    })).rejects.toThrow(/one bound source pair/);
  });

  it('binds witness authority to distinct client instances and canonical node origins', () => {
    const primary = source();
    const witness = source();
    const bound = createAggregateSettlementErgoWitness({
      ...TEST_SOURCE_IDENTITIES,
      primaryErgo: primary,
      primaryNodeUrl: 'http://primary.example:9052',
      witnessErgo: witness,
      witnessNodeUrl: 'https://witness.example:443',
    });

    expect(bound.primarySource.ergo).toBe(primary);
    expect(bound.witnessSource.ergo).toBe(witness);
    expect(bound.primarySource.sourceIdHex).toMatch(/^[0-9a-f]{64}$/);
    expect(bound.witnessSource.sourceIdHex).toMatch(/^[0-9a-f]{64}$/);
    expect(bound.primarySource.sourceIdHex).not.toBe(bound.witnessSource.sourceIdHex);
    expect(() => createAggregateSettlementErgoWitness({
      ...TEST_SOURCE_IDENTITIES,
      primaryErgo: primary,
      primaryNodeUrl: 'http://primary.example:9052',
      witnessErgo: primary,
      witnessNodeUrl: 'http://witness.example:9052',
    })).toThrow(/distinct Ergo client instances/);
    expect(() => createAggregateSettlementErgoWitness({
      ...TEST_SOURCE_IDENTITIES,
      primaryErgo: source(),
      primaryNodeUrl: 'http://PRIMARY.example:9052',
      witnessErgo: source(),
      witnessNodeUrl: 'http://primary.example:9052/',
    })).toThrow(/distinct Ergo node origins/);
  });

  it('rejects URL aliases that reuse a pinned node identity', () => {
    expect(() => createMatchingAggregateSettlementErgoObservationSources({
      ...TEST_SOURCE_IDENTITIES,
      primaryErgo: source(),
      primaryNodeUrl: 'http://localhost:9052',
      witnessErgo: source(),
      witnessNodeUrl: 'http://127.0.0.1:9052',
      witnessNodeIdentityDigestHex: TEST_SOURCE_IDENTITIES.primaryNodeIdentityDigestHex,
    })).toThrow(/distinct pinned node identities/);
  });

  it('rejects sources under one administration and malformed identity pins', () => {
    expect(() => createMatchingAggregateSettlementErgoObservationSources({
      ...TEST_SOURCE_IDENTITIES,
      primaryErgo: source(),
      primaryNodeUrl: 'http://primary.example:9052',
      witnessErgo: source(),
      witnessNodeUrl: 'http://witness.example:9052',
      witnessAdministrationIdentityDigestHex:
        TEST_SOURCE_IDENTITIES.primaryAdministrationIdentityDigestHex,
    })).toThrow(/distinct administration identities/);

    expect(() => createMatchingAggregateSettlementErgoObservationSources({
      ...TEST_SOURCE_IDENTITIES,
      primaryErgo: source(),
      primaryNodeUrl: 'http://primary.example:9052',
      primaryNodeIdentityDigestHex: 'not-a-digest',
      witnessErgo: source(),
      witnessNodeUrl: 'http://witness.example:9052',
    })).toThrow(/32 bytes of hex/);
  });
});
