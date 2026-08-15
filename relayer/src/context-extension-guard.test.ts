import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import blakejs from 'blakejs';
import {
  assertContextExtensionSafe,
  ContextExtensionDivergenceError,
  ContextExtensionKeyRangeError,
  MAX_SAFE_CONTEXT_EXTENSION_VARS,
  EFFECTIVE_MAX_CONTEXT_EXTENSION_VARS,
  resolveEffectiveLimit,
  isLoopbackUrl,
} from './context-extension-guard.js';
import {
  buildSingleClaimAggregateSettlementTx,
  buildTrustlessSingleLeafAggregateSettlementTx,
  buildBatchAggregateSettlementTx,
  deriveAggregateBurnEventRoot,
} from './aggregate-settlement-tx.js';
import { buildAggregateSettlementPlan, buildBatchSettlementPlan } from './aggregate-settlement-builder.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
  EMPTY_AVL_DIGEST,
} from './ergo-helpers.js';
import { toSpvTrackerHistoryEntry, type SpvTrackerEntry } from './spv-tracker.js';
import { deriveTrustlessBurnIdHex, encodeTrustlessBurnLeaf } from './trustless-burn-proof.js';

// Helper: valid patched env bag (both URLs set, loopback, same origin)
const PATCHED_ENV = {
  PATCHED_STACK_MODE: 'true',
  ERGO_NODE_URL: 'http://127.0.0.1:9051',
  ERGO_NODE: 'http://127.0.0.1:9051',
};

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('context extension guard -- threshold checks', () => {
  it('passes with 0 Vars (empty extension)', () => {
    expect(() => assertContextExtensionSafe(
      [{ extension: {} }],
      'test-0-vars',
    )).not.toThrow();
  });

  it('passes with 0 Vars (undefined extension)', () => {
    expect(() => assertContextExtensionSafe(
      [{ extension: undefined }],
      'test-undef',
    )).not.toThrow();
  });

  it('passes with 3 Vars', () => {
    expect(() => assertContextExtensionSafe(
      [{ extension: { '0': 'a', '1': 'b', '2': 'c' } }],
      'test-3-vars',
    )).not.toThrow();
  });

  it('passes with exactly 4 Vars (temporary policy boundary)', () => {
    expect(() => assertContextExtensionSafe(
      [{ extension: { '0': 'a', '1': 'b', '2': 'c', '3': 'd' } }],
      'test-4-vars',
    )).not.toThrow();
  });

  it('fails with 5 Vars', () => {
    expect(() => assertContextExtensionSafe(
      [{ extension: { '0': 'a', '1': 'b', '2': 'c', '3': 'd', '4': 'e' } }],
      'test-5-vars',
    )).toThrow(ContextExtensionDivergenceError);
  });

  it('fails with 8 Vars and reports correct details', () => {
    const ext: Record<string, string> = {};
    for (let i = 0; i < 8; i++) ext[String(i)] = 'val';

    try {
      assertContextExtensionSafe([{ extension: ext }], 'test-8-vars');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ContextExtensionDivergenceError);
      const e = err as ContextExtensionDivergenceError;
      expect(e.offenders).toHaveLength(1);
      expect(e.offenders[0].inputIndex).toBe(0);
      expect(e.offenders[0].varCount).toBe(8);
      expect(e.offenders[0].keys).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(e.inputIndex).toBe(0);
      expect(e.varCount).toBe(8);
      expect(e.keys).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(e.message).toContain('input[0]');
      expect(e.message).toContain('8 Vars');
      expect(e.message).toContain('serialization conformance');
      expect(e.effectiveThreshold).toBe(4);
      expect(e.message).toContain('threshold of 4');
    }
  });

  it('collects all offending inputs across multiple inputs', () => {
    const inputs = [
      { extension: { '0': 'a', '1': 'b' } },
      { extension: { '0': 'a', '1': 'b', '2': 'c', '3': 'd', '4': 'e', '5': 'f' } },
      { extension: { '0': 'a', '1': 'b', '2': 'c', '3': 'd', '4': 'e', '5': 'f', '6': 'g', '7': 'h' } },
    ];

    try {
      assertContextExtensionSafe(inputs, 'test-multi-offender');
      expect.unreachable('should have thrown');
    } catch (err) {
      const e = err as ContextExtensionDivergenceError;
      expect(e.offenders).toHaveLength(2);
      expect(e.offenders[0]).toEqual({ inputIndex: 1, varCount: 6, keys: [0, 1, 2, 3, 4, 5] });
      expect(e.offenders[1]).toEqual({ inputIndex: 2, varCount: 8, keys: [0, 1, 2, 3, 4, 5, 6, 7] });
      expect(e.inputIndex).toBe(1);
      expect(e.varCount).toBe(6);
      expect(e.message).toContain('2 input(s)');
    }
  });

  it('passes when all inputs are within threshold', () => {
    const inputs = [
      { extension: { '0': 'a', '1': 'b', '2': 'c', '3': 'd' } },
      { extension: { '0': 'x', '1': 'y', '2': 'z' } },
      { extension: {} },
    ];
    expect(() => assertContextExtensionSafe(inputs, 'all-allowed')).not.toThrow();
  });

  it('exports the temporary policy threshold as 4', () => {
    expect(MAX_SAFE_CONTEXT_EXTENSION_VARS).toBe(4);
  });
});

// -- Integration tests: real TX builders hit the guard -------------------------

const sidechainIdHex = '11'.repeat(32);
const recipientTreeHex = '0008cd02' + '44'.repeat(32);
const relayerPk = '02' + '99'.repeat(32);
const committee = encodeSigmaPropRegister(relayerPk);

function recipientTreeHashHex(ergoTreeHex: string): string {
  return Buffer.from(blakejs.blake2b(Buffer.from(ergoTreeHex, 'hex'), undefined, 32)).toString('hex');
}

function testEntry(n: number, bridgeEventRootHex: string): SpvTrackerEntry {
  return {
    sidechainIdHex,
    sidechainHeight: BigInt(1000 + n),
    sidechainHeaderHashHex: n.toString(16).padStart(2, '0').repeat(32),
    bridgeEventRootHex,
    ergoAnchorHeight: 330000 + n,
  };
}

describe('context extension guard -- V1 single-claim aggregate TX', () => {
  it('fails because INPUTS(2) has 8 Vars (unlock extension)', () => {
    const burnTxIdHex = 'cc'.repeat(32);
    const amount = 1_000_000n;
    const root = deriveAggregateBurnEventRoot(burnTxIdHex, recipientTreeHex, amount);
    const accepted = testEntry(1, root);

    const plan = buildAggregateSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry(accepted)],
      dupHistoryKeys: [],
      claims: [{
        pegOut: {
          user: '0x01', amount,
          ergoRecipientAddress: recipientTreeHex,
          sidechainTxHash: burnTxIdHex,
          sidechainBlockNumber: Number(accepted.sidechainHeight),
        },
        trackerIdentity: {
          sidechainIdHex,
          sidechainHeight: accepted.sidechainHeight,
          sidechainHeaderHashHex: accepted.sidechainHeaderHashHex,
        },
      }],
    });

    const tx = buildSingleClaimAggregateSettlementTx({
      deployed: {
        spvTracker: { nftId: 'aa'.repeat(32), boxId: '01'.repeat(32), address: 'spv', ergoTreeHex: '1001' },
        doubleUnlockPreventionAggregate: { nftId: 'bb'.repeat(32), boxId: '02'.repeat(32), address: 'dup', ergoTreeHex: '1002' },
        mainChainAggregateUnlock: { address: 'unlock', ergoTreeHex: '1003' },
      },
      plan,
      trackerBox: {
        boxId: '10'.repeat(32), value: 1_000_000, ergoTree: '1001',
        assets: [{ tokenId: 'aa'.repeat(32), amount: 1 }],
        additionalRegisters: {
          R4: encodeLongRegister(0),
          R5: '64' + plan.trackerInputDigestHex + '07200124',
          R6: committee,
          R7: encodeLongRegister(Number(accepted.sidechainHeight)),
        },
        creationHeight: 330100,
      },
      aggregateDupBox: {
        boxId: '20'.repeat(32), value: 1_000_000, ergoTree: '1002',
        assets: [{ tokenId: 'bb'.repeat(32), amount: 1 }],
        additionalRegisters: {
          R4: encodeLongRegister(0),
          R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
          R6: committee,
        },
        creationHeight: 330100,
      },
      unlockBox: {
        boxId: '30'.repeat(32), value: 2_100_000, ergoTree: '1003',
        assets: [], additionalRegisters: {}, creationHeight: 330100,
      },
      recipientErgoTreeHex: recipientTreeHex,
      creationHeight: 330120,
    });

    expect(Object.keys(tx.inputs[2].extension)).toHaveLength(8);

    try {
      assertContextExtensionSafe(tx.inputs, 'V1-aggregate-settlement');
      expect.unreachable('should have thrown');
    } catch (err) {
      const e = err as ContextExtensionDivergenceError;
      expect(e.offenders).toHaveLength(1);
      expect(e.offenders[0].inputIndex).toBe(2);
      expect(e.offenders[0].varCount).toBe(8);
      expect(e.offenders[0].keys).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    }
  });
});

describe('context extension guard -- V2 trustless single-leaf aggregate TX', () => {
  it('passes because INPUTS(2) uses the compact 4-Var trustless unlock extension', () => {
    const burnTxIdHex = '55'.repeat(32);
    const sidechainLogIndex = 7;
    const amount = 1_000_000n;
    const recipientErgoTreeHashHex = recipientTreeHashHex(recipientTreeHex);
    const burnIdHex = deriveTrustlessBurnIdHex({
      sidechainIdHex,
      sidechainTxHashHex: burnTxIdHex,
      eventIndex: sidechainLogIndex,
    });
    const base = testEntry(1, '00'.repeat(32));
    const leaf = encodeTrustlessBurnLeaf({
      sidechainIdHex,
      sidechainBlockHashHex: base.sidechainHeaderHashHex,
      burnIdHex,
      sidechainTxHashHex: burnTxIdHex,
      eventIndex: sidechainLogIndex,
      recipientErgoTreeHashHex,
      amountNanoErg: amount,
    });
    const accepted = testEntry(1, leaf.leafHashHex);
    const plan = buildAggregateSettlementPlan({
      spvHistory: [toSpvTrackerHistoryEntry(accepted)],
      dupHistoryKeys: [],
      claims: [{
        pegOut: {
          user: '0x01',
          amount,
          ergoRecipientAddress: recipientTreeHex,
          sidechainTxHash: burnTxIdHex,
          sidechainBlockNumber: Number(accepted.sidechainHeight),
          sidechainLogIndex,
        },
        trackerIdentity: {
          sidechainIdHex,
          sidechainHeight: accepted.sidechainHeight,
          sidechainHeaderHashHex: accepted.sidechainHeaderHashHex,
        },
        settlementIdentity: {
          source: 'trustless-burn-leaf',
          duplicatePreventionKeyHex: burnIdHex,
          bridgeEventRootHex: leaf.leafHashHex,
          recipientErgoTreeHashHex,
          amountNanoErg: amount,
        },
      }],
    });

    const tx = buildTrustlessSingleLeafAggregateSettlementTx({
      deployed: {
        spvTracker: { nftId: 'aa'.repeat(32), boxId: '01'.repeat(32), address: 'spv', ergoTreeHex: '1001' },
        doubleUnlockPreventionAggregate: { nftId: 'bb'.repeat(32), boxId: '02'.repeat(32), address: 'dup', ergoTreeHex: '1002' },
        mainChainAggregateUnlockTrustless: { address: 'trustless-unlock', ergoTreeHex: '1023' },
      },
      plan,
      trackerBox: {
        boxId: '10'.repeat(32), value: 1_000_000, ergoTree: '1001',
        assets: [{ tokenId: 'aa'.repeat(32), amount: 1 }],
        additionalRegisters: {
          R4: encodeLongRegister(0),
          R5: '64' + plan.trackerInputDigestHex + '07200124',
          R6: committee,
          R7: encodeLongRegister(Number(accepted.sidechainHeight)),
        },
        creationHeight: 330100,
      },
      aggregateDupBox: {
        boxId: '20'.repeat(32), value: 1_000_000, ergoTree: '1002',
        assets: [{ tokenId: 'bb'.repeat(32), amount: 1 }],
        additionalRegisters: {
          R4: encodeLongRegister(0),
          R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
          R6: committee,
        },
        creationHeight: 330100,
      },
      unlockBox: {
        boxId: '30'.repeat(32), value: 2_100_000, ergoTree: '1023',
        assets: [],
        additionalRegisters: {
          R4: encodeCollByteRegister(Buffer.from('31'.repeat(32), 'hex')),
          R5: encodeCollByteRegister(Buffer.from('32'.repeat(20), 'hex')),
          R6: encodeLongRegister(2_100_000),
          R7: encodeCollByteRegister(Buffer.from(recipientTreeHex, 'hex')),
        },
        creationHeight: 330100,
      },
      recipientErgoTreeHex: recipientTreeHex,
      creationHeight: 330120,
    });

    expect(Object.keys(tx.inputs[2].extension)).toEqual(['0', '1', '2', '3']);
    expect(() => assertContextExtensionSafe(tx.inputs, 'V2-trustless-single-leaf')).not.toThrow();
  });
});

describe('context extension guard -- batch N=2 TX', () => {
  it('collects both offending inputs: DUP (6 Vars) and unlock (8 Vars)', () => {
    const claimCount = 2;
    const entries: SpvTrackerEntry[] = [];
    const claims: any[] = [];
    const recipientTrees: string[] = [];

    for (let i = 0; i < claimCount; i++) {
      const burnTxIdHex = (0x40 + i).toString(16).padStart(2, '0').repeat(32);
      const amount = 1_000_000n;
      const root = deriveAggregateBurnEventRoot(burnTxIdHex, recipientTreeHex, amount);
      const e = testEntry(i + 1, root);
      entries.push(e);
      claims.push({
        pegOut: {
          user: '0x01', amount,
          ergoRecipientAddress: recipientTreeHex,
          sidechainTxHash: burnTxIdHex,
          sidechainBlockNumber: Number(e.sidechainHeight),
        },
        trackerIdentity: {
          sidechainIdHex,
          sidechainHeight: e.sidechainHeight,
          sidechainHeaderHashHex: e.sidechainHeaderHashHex,
        },
      });
      recipientTrees.push(recipientTreeHex);
    }

    const spvHistory = entries.map(toSpvTrackerHistoryEntry);
    const plan = buildBatchSettlementPlan({
      spvHistory,
      dupHistoryKeys: [],
      claims,
      recipientErgoTreeHexes: recipientTrees,
    });

    const deployed = {
      spvTracker: { nftId: 'aa'.repeat(32), boxId: '01'.repeat(32), address: 'spv', ergoTreeHex: '1001' },
      doubleUnlockPreventionAggregateBatch: { nftId: 'cc'.repeat(32), boxId: '02'.repeat(32), address: 'dup-batch', ergoTreeHex: '1012' },
      mainChainAggregateUnlockBatch: { address: 'unlock-batch', ergoTreeHex: '1013' },
    };

    const tx = buildBatchAggregateSettlementTx({
      deployed,
      plan,
      trackerBox: {
        boxId: '10'.repeat(32), value: 1_000_000, ergoTree: '1001',
        assets: [{ tokenId: deployed.spvTracker.nftId, amount: 1 }],
        additionalRegisters: {
          R4: encodeLongRegister(0),
          R5: '64' + plan.trackerInputDigestHex + '07200124',
          R6: committee,
          R7: encodeLongRegister(Number(entries[entries.length - 1].sidechainHeight)),
        },
        creationHeight: 330100,
      },
      aggregateDupBox: {
        boxId: '20'.repeat(32), value: 1_000_000, ergoTree: '1012',
        assets: [{ tokenId: deployed.doubleUnlockPreventionAggregateBatch.nftId, amount: 1 }],
        additionalRegisters: {
          R4: encodeLongRegister(0),
          R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
          R6: committee,
        },
        creationHeight: 330100,
      },
      unlockBox: {
        boxId: '30'.repeat(32), value: 4_100_000, ergoTree: '1013',
        assets: [], additionalRegisters: {}, creationHeight: 330100,
      },
      creationHeight: 330120,
    });

    const dupVarCount = Object.keys(tx.inputs[1].extension).length;
    expect(dupVarCount).toBe(6);
    const unlockVarCount = Object.keys(tx.inputs[2].extension).length;
    expect(unlockVarCount).toBe(8);

    try {
      assertContextExtensionSafe(tx.inputs, 'batch-N2');
      expect.unreachable('should have thrown');
    } catch (err) {
      const e = err as ContextExtensionDivergenceError;
      expect(e.offenders).toHaveLength(2);
      expect(e.offenders[0]).toMatchObject({ inputIndex: 1, varCount: 6 });
      expect(e.offenders[1]).toMatchObject({ inputIndex: 2, varCount: 8 });
      expect(e.message).toContain('2 input(s)');
      expect(e.message).toContain('batch-N2');
      expect(e.message).toContain('serialization conformance');
    }
  });
});

// -- isLoopbackUrl tests -------------------------------------------------------

describe('isLoopbackUrl -- URL parsing guard', () => {
  // Accepted
  it('accepts http://127.0.0.1:9051', () => {
    expect(isLoopbackUrl('http://127.0.0.1:9051')).toBe(true);
  });
  it('accepts http://localhost:9051', () => {
    expect(isLoopbackUrl('http://localhost:9051')).toBe(true);
  });
  it('accepts http://[::1]:9051 (IPv6 loopback)', () => {
    expect(isLoopbackUrl('http://[::1]:9051')).toBe(true);
  });
  it('accepts http://127.0.0.1 (no port)', () => {
    expect(isLoopbackUrl('http://127.0.0.1')).toBe(true);
  });
  it('accepts https://localhost:9051', () => {
    expect(isLoopbackUrl('https://localhost:9051')).toBe(true);
  });

  // Subdomain spoofing
  it('rejects http://localhost.evil.com:9051', () => {
    expect(isLoopbackUrl('http://localhost.evil.com:9051')).toBe(false);
  });
  it('rejects http://127.0.0.1.evil.com:9051', () => {
    expect(isLoopbackUrl('http://127.0.0.1.evil.com:9051')).toBe(false);
  });
  it('rejects http://example.com/localhost', () => {
    expect(isLoopbackUrl('http://example.com/localhost')).toBe(false);
  });
  it('rejects http://testnet.ergoplatform.com:9052', () => {
    expect(isLoopbackUrl('http://testnet.ergoplatform.com:9052')).toBe(false);
  });

  // Scheme restrictions
  it('rejects file:///localhost', () => {
    expect(isLoopbackUrl('file:///localhost')).toBe(false);
  });
  it('rejects ftp://127.0.0.1:9051', () => {
    expect(isLoopbackUrl('ftp://127.0.0.1:9051')).toBe(false);
  });

  // Malformed
  it('rejects empty string', () => {
    expect(isLoopbackUrl('')).toBe(false);
  });
  it('rejects malformed URL', () => {
    expect(isLoopbackUrl('not-a-url')).toBe(false);
  });
  it('rejects missing protocol', () => {
    expect(isLoopbackUrl('127.0.0.1:9051')).toBe(false);
  });
});

// -- resolveEffectiveLimit tests (dual-URL, scheme, origin) --------------------

describe('context extension guard -- resolveEffectiveLimit', () => {
  it('returns 4 when PATCHED_STACK_MODE is absent', () => {
    expect(resolveEffectiveLimit({})).toBe(4);
  });

  it('returns 4 when PATCHED_STACK_MODE is "false"', () => {
    expect(resolveEffectiveLimit({ PATCHED_STACK_MODE: 'false' })).toBe(4);
  });

  it('returns 128 with valid loopback env (127.0.0.1)', () => {
    expect(resolveEffectiveLimit(PATCHED_ENV)).toBe(128);
  });

  it('returns 128 with localhost', () => {
    expect(resolveEffectiveLimit({
      PATCHED_STACK_MODE: 'true',
      ERGO_NODE_URL: 'http://localhost:9051',
      ERGO_NODE: 'http://localhost:9051',
    })).toBe(128);
  });

  it('returns 128 with [::1]', () => {
    expect(resolveEffectiveLimit({
      PATCHED_STACK_MODE: 'true',
      ERGO_NODE_URL: 'http://[::1]:9051',
      ERGO_NODE: 'http://[::1]:9051',
    })).toBe(128);
  });

  // Missing URLs
  it('throws when ERGO_NODE_URL is missing', () => {
    expect(() => resolveEffectiveLimit({
      PATCHED_STACK_MODE: 'true',
      ERGO_NODE: 'http://127.0.0.1:9051',
    })).toThrow('missing');
  });

  it('throws when ERGO_NODE is missing', () => {
    expect(() => resolveEffectiveLimit({
      PATCHED_STACK_MODE: 'true',
      ERGO_NODE_URL: 'http://127.0.0.1:9051',
    })).toThrow('missing');
  });

  it('throws when both URLs are empty', () => {
    expect(() => resolveEffectiveLimit({
      PATCHED_STACK_MODE: 'true',
      ERGO_NODE_URL: '',
      ERGO_NODE: '',
    })).toThrow('missing');
  });

  // Remote URLs
  it('throws when ERGO_NODE_URL is remote', () => {
    expect(() => resolveEffectiveLimit({
      PATCHED_STACK_MODE: 'true',
      ERGO_NODE_URL: 'http://testnet.ergoplatform.com:9052',
      ERGO_NODE: 'http://127.0.0.1:9051',
    })).toThrow('not loopback');
  });

  it('throws when ERGO_NODE is remote', () => {
    expect(() => resolveEffectiveLimit({
      PATCHED_STACK_MODE: 'true',
      ERGO_NODE_URL: 'http://127.0.0.1:9051',
      ERGO_NODE: 'http://testnet.ergoplatform.com:9052',
    })).toThrow('not loopback');
  });

  // Spoofing
  it('throws for localhost.evil.com in ERGO_NODE_URL', () => {
    expect(() => resolveEffectiveLimit({
      PATCHED_STACK_MODE: 'true',
      ERGO_NODE_URL: 'http://localhost.evil.com:9051',
      ERGO_NODE: 'http://127.0.0.1:9051',
    })).toThrow('not loopback');
  });

  it('throws for 127.0.0.1.evil.com in ERGO_NODE', () => {
    expect(() => resolveEffectiveLimit({
      PATCHED_STACK_MODE: 'true',
      ERGO_NODE_URL: 'http://127.0.0.1:9051',
      ERGO_NODE: 'http://127.0.0.1.evil.com:9051',
    })).toThrow('not loopback');
  });

  // Origin mismatch
  it('throws when both loopback but different ports', () => {
    expect(() => resolveEffectiveLimit({
      PATCHED_STACK_MODE: 'true',
      ERGO_NODE_URL: 'http://127.0.0.1:9051',
      ERGO_NODE: 'http://127.0.0.1:9052',
    })).toThrow('different origins');
  });

  it('throws when both loopback but different hostnames', () => {
    expect(() => resolveEffectiveLimit({
      PATCHED_STACK_MODE: 'true',
      ERGO_NODE_URL: 'http://127.0.0.1:9051',
      ERGO_NODE: 'http://localhost:9051',
    })).toThrow('different origins');
  });

  // Scheme restrictions
  it('throws for file:// URL', () => {
    expect(() => resolveEffectiveLimit({
      PATCHED_STACK_MODE: 'true',
      ERGO_NODE_URL: 'file:///127.0.0.1',
      ERGO_NODE: 'http://127.0.0.1:9051',
    })).toThrow('not loopback');
  });

  it('throws for malformed URL', () => {
    expect(() => resolveEffectiveLimit({
      PATCHED_STACK_MODE: 'true',
      ERGO_NODE_URL: 'not-a-url',
      ERGO_NODE: 'http://127.0.0.1:9051',
    })).toThrow('not loopback');
  });

  // Module-level constant
  it('EFFECTIVE_MAX_CONTEXT_EXTENSION_VARS equals 4 in normal test env', () => {
    expect(EFFECTIVE_MAX_CONTEXT_EXTENSION_VARS).toBe(4);
  });

  it('MAX_SAFE_CONTEXT_EXTENSION_VARS is always 4 regardless of mode', () => {
    expect(MAX_SAFE_CONTEXT_EXTENSION_VARS).toBe(4);
  });
});

// -- Patched-mode guard behavior via limitOverride -----------------------------

describe('context extension guard -- patched-mode behavior via limitOverride', () => {
  it('allows 8-Var input when limit is 128 (simulates patched mode)', () => {
    const ext: Record<string, string> = {};
    for (let i = 0; i < 8; i++) ext[String(i)] = 'val';

    expect(() => assertContextExtensionSafe(
      [{ extension: ext }],
      'test-patched-8-vars',
      128,
    )).not.toThrow();
  });

  it('allows 127-Var input when limit is 128', () => {
    const ext: Record<string, string> = {};
    for (let i = 0; i < 127; i++) ext[String(i)] = 'val';

    expect(() => assertContextExtensionSafe(
      [{ extension: ext }],
      'test-patched-127-vars',
      128,
    )).not.toThrow();
  });

  it('rejects 129-Var input when limit is 128 (key-range fires first for keys >127)', () => {
    const ext: Record<string, string> = {};
    for (let i = 0; i < 129; i++) ext[String(i)] = 'val';

    // Keys 128 is outside [0..127], so key-range check fires before var-count.
    try {
      assertContextExtensionSafe([{ extension: ext }], 'test-patched-129-vars', 128);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ContextExtensionKeyRangeError);
      const e = err as ContextExtensionKeyRangeError;
      expect(e.invalidKeys).toContain(128);
      expect(e.message).toContain('[0..127]');
    }
  });

  it('still rejects 8-Var input with default limit (no override)', () => {
    const ext: Record<string, string> = {};
    for (let i = 0; i < 8; i++) ext[String(i)] = 'val';

    expect(() => assertContextExtensionSafe(
      [{ extension: ext }],
      'test-default-8-vars',
    )).toThrow(ContextExtensionDivergenceError);
  });
});

// -- Module-level env tests (vi.resetModules + dynamic import) -----------------

describe('context extension guard -- module-level env integration', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('patched env: module exports EFFECTIVE=128 and 8-Var passes', async () => {
    vi.stubEnv('PATCHED_STACK_MODE', 'true');
    vi.stubEnv('ERGO_NODE_URL', 'http://127.0.0.1:9051');
    vi.stubEnv('ERGO_NODE', 'http://127.0.0.1:9051');

    const mod = await import('./context-extension-guard.js');

    expect(mod.EFFECTIVE_MAX_CONTEXT_EXTENSION_VARS).toBe(128);

    // 8-Var input passes with no override -- uses the module-level 128
    const ext: Record<string, string> = {};
    for (let i = 0; i < 8; i++) ext[String(i)] = 'val';
    expect(() => mod.assertContextExtensionSafe(
      [{ extension: ext }],
      'patched-env-8-vars',
    )).not.toThrow();

    vi.unstubAllEnvs();
  });

  it('patched env with remote ERGO_NODE: module import throws', async () => {
    vi.stubEnv('PATCHED_STACK_MODE', 'true');
    vi.stubEnv('ERGO_NODE_URL', 'http://127.0.0.1:9051');
    vi.stubEnv('ERGO_NODE', 'http://testnet.ergoplatform.com:9052');

    await expect(import('./context-extension-guard.js'))
      .rejects.toThrow('not loopback');

    vi.unstubAllEnvs();
  });

  it('default env: module exports EFFECTIVE=4 and 8-Var is rejected', async () => {
    // No PATCHED_STACK_MODE set -- default behavior.
    const mod = await import('./context-extension-guard.js');

    expect(mod.EFFECTIVE_MAX_CONTEXT_EXTENSION_VARS).toBe(4);

    const ext: Record<string, string> = {};
    for (let i = 0; i < 8; i++) ext[String(i)] = 'val';
    expect(() => mod.assertContextExtensionSafe(
      [{ extension: ext }],
      'default-env-8-vars',
    )).toThrow(mod.ContextExtensionDivergenceError);
  });
});

// -- Key-range validation tests [0..127] --------------------------------------

describe('context extension guard -- key-range validation [0..127]', () => {
  it('passes with keys in valid range [0..3]', () => {
    expect(() => assertContextExtensionSafe(
      [{ extension: { '0': 'a', '1': 'b', '2': 'c', '3': 'd' } }],
      'valid-keys',
    )).not.toThrow();
  });

  it('passes with key 127 (upper bound)', () => {
    expect(() => assertContextExtensionSafe(
      [{ extension: { '0': 'a', '127': 'b' } }],
      'key-127',
    )).not.toThrow();
  });

  it('rejects key 128 (outside valid range)', () => {
    try {
      assertContextExtensionSafe(
        [{ extension: { '0': 'a', '128': 'b' } }],
        'key-128',
      );
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ContextExtensionKeyRangeError);
      const e = err as ContextExtensionKeyRangeError;
      expect(e.inputIndex).toBe(0);
      expect(e.invalidKeys).toEqual([128]);
      expect(e.message).toContain('[0..127]');
      expect(e.message).toContain('128');
    }
  });

  it('rejects key 200', () => {
    expect(() => assertContextExtensionSafe(
      [{ extension: { '0': 'a', '200': 'b' } }],
      'key-200',
    )).toThrow(ContextExtensionKeyRangeError);
  });

  it('rejects negative key "-1" (non-canonical)', () => {
    try {
      assertContextExtensionSafe(
        [{ extension: { '-1': 'a', '0': 'b' } }],
        'key-negative',
      );
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ContextExtensionKeyRangeError);
      const e = err as ContextExtensionKeyRangeError;
      // '-1' fails the canonical regex, reported as the raw string
      expect(e.invalidKeys).toEqual(['-1']);
    }
  });

  it('rejects non-numeric key "abc"', () => {
    expect(() => assertContextExtensionSafe(
      [{ extension: { 'abc': 'a', '0': 'b' } }],
      'key-abc',
    )).toThrow(ContextExtensionKeyRangeError);
  });

  it('rejects partial numeric key "1abc" (parseInt would accept as 1)', () => {
    try {
      assertContextExtensionSafe(
        [{ extension: { '1abc': 'a', '0': 'b' } }],
        'key-1abc',
      );
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ContextExtensionKeyRangeError);
      const e = err as ContextExtensionKeyRangeError;
      expect(e.invalidKeys).toEqual(['1abc']);
    }
  });

  it('rejects fractional key "1.5" (parseInt would accept as 1)', () => {
    try {
      assertContextExtensionSafe(
        [{ extension: { '1.5': 'a', '0': 'b' } }],
        'key-fractional',
      );
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ContextExtensionKeyRangeError);
      const e = err as ContextExtensionKeyRangeError;
      expect(e.invalidKeys).toEqual(['1.5']);
    }
  });

  it('rejects leading-zero key "01" (parseInt would accept as 1)', () => {
    try {
      assertContextExtensionSafe(
        [{ extension: { '01': 'a', '0': 'b' } }],
        'key-leading-zero',
      );
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ContextExtensionKeyRangeError);
      const e = err as ContextExtensionKeyRangeError;
      expect(e.invalidKeys).toEqual(['01']);
    }
  });

  it('rejects empty string key', () => {
    try {
      assertContextExtensionSafe(
        [{ extension: { '': 'a', '0': 'b' } }],
        'key-empty',
      );
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ContextExtensionKeyRangeError);
      const e = err as ContextExtensionKeyRangeError;
      expect(e.invalidKeys).toEqual(['']);
    }
  });

  it('key-range check fires before var-count check', () => {
    // 3 keys (within limit 4) but one key is out of range -- should still throw
    expect(() => assertContextExtensionSafe(
      [{ extension: { '0': 'a', '1': 'b', '200': 'c' } }],
      'range-before-count',
    )).toThrow(ContextExtensionKeyRangeError);
  });

  it('reports multiple invalid keys (mixed types)', () => {
    try {
      assertContextExtensionSafe(
        [{ extension: { '-1': 'a', '0': 'b', '128': 'c', '255': 'd' } }],
        'multi-invalid',
      );
      expect.unreachable('should have thrown');
    } catch (err) {
      const e = err as ContextExtensionKeyRangeError;
      // '-1' fails regex (reported as string), 128 and 255 pass regex but fail range (reported as numbers)
      expect(e.invalidKeys).toContain('-1');
      expect(e.invalidKeys).toContain(128);
      expect(e.invalidKeys).toContain(255);
      expect(e.inputIndex).toBe(0);
    }
  });
});
