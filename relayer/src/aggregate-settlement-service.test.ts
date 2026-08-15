import { describe, expect, it, vi } from 'vitest';
import blakejs from 'blakejs';

import {
  AggregateSettlementService,
  resolveAggregateRecipientErgoTree,
} from './aggregate-settlement-service.js';
import {
  assertStableAggregateSettlementErgoObservationProvenance,
  type StableAggregateSettlementErgoObservation,
} from './aggregate-settlement-ergo-observation.js';
import {
  buildConfirmedErgoTransactionFixture,
  type ConfirmedErgoTransactionFixture,
} from './aggregate-settlement-ergo-fixture.test-helper.js';
import {
  validateAggregateSettlementPrebroadcastEvidenceRecord,
  validateAggregateSettlementTrustlessCandidateEvidenceRecord,
  validateAggregateSettlementTrustlessUnsignedTxEvidenceRecord,
} from './aggregate-settlement-evidence.js';
import { deriveAggregateBurnEventRoot, type BoxLike } from './aggregate-settlement-tx.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
  EMPTY_AVL_DIGEST,
} from './ergo-helpers.js';
import type { ParsedPegOut } from './sidechain-client.js';
import {
  encodeSpvTrackerAvlRegister,
  getEmptySpvTrackerDigest,
  getSpvTrackerDigest,
  toSpvTrackerHistoryEntry,
  type SpvTrackerEntry,
} from './spv-tracker.js';
import { deriveTrustlessBurnIdHex, encodeTrustlessBurnLeaf } from './trustless-burn-proof.js';
import type {
  AggregateSettlementAttempt,
  AggregateSettlementAttemptMode,
} from './state-tracker.js';

const fundsReleaseStateDigestHex = 'fe'.repeat(32);
const fundsExecutionAuthorityEpochHex = 'fd'.repeat(32);

function authorizeFundsRelease(expectedStateDigestHex?: string) {
  if (
    expectedStateDigestHex !== undefined
    && expectedStateDigestHex !== fundsReleaseStateDigestHex
  ) {
    throw new Error('local funds-release state changed before authorization');
  }
  return {
    open: false,
    incidentCount: 0,
    continuityStatus: 'established' as const,
    continuityRecoveryRequired: false,
    externalContinuityWitnessCurrent: true,
    retainedExecutionAuthority: false,
    stateDigestHex: fundsReleaseStateDigestHex,
    executionAuthorityEpochHex: fundsExecutionAuthorityEpochHex,
  };
}

const sidechainIdHex = '11'.repeat(32);
const recipientTreeHex = '0008cd02' + '44'.repeat(32);
const relayerPk = '02' + '99'.repeat(32);
const sidechainLogIndex = 7;
const committee = encodeSigmaPropRegister(relayerPk);
const stableErgoTipHeight = 330_200;
const stableErgoInclusionHeight = stableErgoTipHeight - 9;
const stableErgoTipHeaderIdHex = 'e1'.repeat(32);
const stableErgoInclusionHeaderIdHex = 'e2'.repeat(32);

function recipientTreeHashHex(ergoTreeHex: string): string {
  return Buffer.from(blakejs.blake2b(Buffer.from(ergoTreeHex, 'hex'), undefined, 32)).toString('hex');
}

function deployedState(): any {
  return {
    network: 'testnet',
    deployedAt: new Date(0).toISOString(),
    sideChainState: { nftId: '01'.repeat(32), boxId: '01'.repeat(32), address: 'scs', ergoTreeHex: '1000' },
    doubleUnlockPrevention: { nftId: '02'.repeat(32), boxId: '02'.repeat(32), address: 'dup', ergoTreeHex: '1001' },
    spvTracker: { nftId: 'aa'.repeat(32), boxId: '03'.repeat(32), address: 'spv', ergoTreeHex: '1002' },
    doubleUnlockPreventionAggregate: { nftId: 'bb'.repeat(32), boxId: '04'.repeat(32), address: 'agg-dup', ergoTreeHex: '1003' },
    mainChainLock: { address: 'lock', ergoTreeHex: '1004' },
    mainChainUnlock: { address: 'unlock', ergoTreeHex: '1005' },
    mainChainAggregateUnlock: { address: 'agg-unlock', ergoTreeHex: '1006' },
    mainChainAggregateUnlockTrustless: { address: 'trustless-agg-unlock', ergoTreeHex: '1007' },
    relayer: { address: 'relayer', publicKey: relayerPk },
  };
}

function entry(n: number, bridgeEventRootHex: string): SpvTrackerEntry {
  return {
    sidechainIdHex,
    sidechainHeight: BigInt(1000 + n),
    sidechainHeaderHashHex: n.toString(16).padStart(2, '0').repeat(32),
    bridgeEventRootHex,
    ergoAnchorHeight: 330000 + n,
  };
}

function box(
  boxId: string,
  ergoTree: string,
  registers: Record<string, string>,
  tokenId?: string,
  value = 2_100_000,
): BoxLike {
  return {
    boxId,
    value,
    ergoTree,
    assets: tokenId ? [{ tokenId, amount: 1 }] : [],
    additionalRegisters: registers,
    creationHeight: 330100,
    transactionId: boxId,
    index: 0,
  };
}

function setup() {
  const deployed = deployedState();
  const burnTxIdHex = '55'.repeat(32);
  const amount = 1_000_000n;
  const bridgeEventRootHex = deriveAggregateBurnEventRoot(burnTxIdHex, recipientTreeHex, amount);
  const accepted = entry(1, bridgeEventRootHex);
  const pegOut: ParsedPegOut = {
    user: '0x0000000000000000000000000000000000000001',
    amount,
    ergoRecipientAddress: recipientTreeHex,
    sidechainTxHash: burnTxIdHex,
    sidechainBlockNumber: Number(accepted.sidechainHeight),
    sidechainLogIndex,
  };

  const trackerBox = box('10'.repeat(32), deployed.spvTracker.ergoTreeHex, {
    R4: encodeLongRegister(0),
    R5: encodeSpvTrackerAvlRegister(getSpvTrackerDigest([toSpvTrackerHistoryEntry(accepted)])),
    R6: committee,
    R7: encodeLongRegister(Number(accepted.sidechainHeight)),
  }, deployed.spvTracker.nftId, 1_000_000);

  const aggregateDupBox = box('20'.repeat(32), deployed.doubleUnlockPreventionAggregate.ergoTreeHex, {
    R4: encodeLongRegister(0),
    R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
    R6: committee,
  }, deployed.doubleUnlockPreventionAggregate.nftId, 1_000_000);

  return {
    deployed,
    accepted,
    pegOut,
    trackerBox,
    aggregateDupBox,
    state: {
      assertFundsReleaseAuthorized: authorizeFundsRelease,
      startFundsReleaseTransport: (
        _stateDigestHex: string,
        _authorityEpochHex: string,
        startTransport: () => unknown,
      ) => startTransport(),
      getSpvTrackerHistory: () => [toSpvTrackerHistoryEntry(accepted)],
      getAllAvlKeys: () => [],
      getPegOutEventCountByTxHash: () => 1,
    },
  };
}

function confirmedTrackerRegisters(trackerEntries: SpvTrackerEntry[]): Record<string, string> {
  const trackerDigest = getSpvTrackerDigest(trackerEntries.map(toSpvTrackerHistoryEntry));
  return {
    R4: encodeLongRegister(1),
    R5: encodeSpvTrackerAvlRegister(trackerDigest),
  };
}

function vaultRegisters(sourceBoxId: string, amount: number): Record<string, string> {
  return {
    R4: encodeCollByteRegister(Buffer.from(sourceBoxId, 'hex')),
    R5: encodeCollByteRegister(Buffer.from('77'.repeat(20), 'hex')),
    R6: encodeLongRegister(amount),
    R7: encodeCollByteRegister(Buffer.from(recipientTreeHex, 'hex')),
  };
}

function trustlessSetup() {
  const deployed = deployedState();
  const burnTxIdHex = '55'.repeat(32);
  const amount = 1_000_000n;
  const base = entry(1, '00'.repeat(32));
  const duplicatePreventionKeyHex = deriveTrustlessBurnIdHex({
    sidechainIdHex,
    sidechainTxHashHex: burnTxIdHex,
    eventIndex: sidechainLogIndex,
  });
  const recipientErgoTreeHashHex = recipientTreeHashHex(recipientTreeHex);
  const leaf = encodeTrustlessBurnLeaf({
    sidechainIdHex,
    sidechainBlockHashHex: base.sidechainHeaderHashHex,
    burnIdHex: duplicatePreventionKeyHex,
    sidechainTxHashHex: burnTxIdHex,
    eventIndex: sidechainLogIndex,
    recipientErgoTreeHashHex,
    amountNanoErg: amount,
  });
  const accepted = entry(1, leaf.leafHashHex);
  const pegOut: ParsedPegOut = {
    user: '0x0000000000000000000000000000000000000001',
    amount,
    ergoRecipientAddress: recipientTreeHex,
    sidechainTxHash: burnTxIdHex,
    sidechainBlockNumber: Number(accepted.sidechainHeight),
    sidechainLogIndex,
  };

  const trackerBox = box('10'.repeat(32), deployed.spvTracker.ergoTreeHex, {
    R4: encodeLongRegister(0),
    R5: encodeSpvTrackerAvlRegister(getSpvTrackerDigest([toSpvTrackerHistoryEntry(accepted)])),
    R6: committee,
    R7: encodeLongRegister(Number(accepted.sidechainHeight)),
  }, deployed.spvTracker.nftId, 1_000_000);

  const aggregateDupBox = box('20'.repeat(32), deployed.doubleUnlockPreventionAggregate.ergoTreeHex, {
    R4: encodeLongRegister(0),
    R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
    R6: committee,
  }, deployed.doubleUnlockPreventionAggregate.nftId, 1_000_000);

  return {
    deployed,
    accepted,
    pegOut,
    trackerBox,
    aggregateDupBox,
    settlementIdentity: {
      source: 'trustless-burn-leaf' as const,
      duplicatePreventionKeyHex,
      bridgeEventRootHex: leaf.leafHashHex,
      recipientErgoTreeHashHex,
      amountNanoErg: amount,
    },
    state: {
      assertFundsReleaseAuthorized: authorizeFundsRelease,
      getSpvTrackerHistory: () => [toSpvTrackerHistoryEntry(accepted)],
      getAllAvlKeys: () => [],
      getPegOutEventCountByTxHash: () => 1,
    },
  };
}

async function confirmedAggregateTx(
  ctx: ReturnType<typeof setup>,
  payout: { ergoTree: string; value: number; assets: any[] } = {
    ergoTree: recipientTreeHex,
    value: Number(ctx.pegOut.amount),
    assets: [],
  },
  trackerEntries: SpvTrackerEntry[] = [],
): Promise<ConfirmedErgoTransactionFixture> {
  return buildConfirmedErgoTransactionFixture({
    outputs: [
      {
        ergoTree: ctx.deployed.spvTracker.ergoTreeHex,
        value: 1_000_000,
        assets: [{ tokenId: ctx.deployed.spvTracker.nftId, amount: 1 }],
        additionalRegisters: confirmedTrackerRegisters(trackerEntries),
      },
      {
        ergoTree: ctx.deployed.doubleUnlockPreventionAggregate.ergoTreeHex,
        value: 1_000_000,
        assets: [{ tokenId: ctx.deployed.doubleUnlockPreventionAggregate.nftId, amount: 1 }],
      },
      payout,
    ],
    inclusionHeight: stableErgoInclusionHeight,
    inclusionHeaderIdHex: stableErgoInclusionHeaderIdHex,
  });
}

async function confirmedBatchTx(
  deployed: any,
  payouts: Array<{ ergoTree: string; value: number; assets: any[] }> = [
    { ergoTree: recipientTreeHex, value: 1_000_000, assets: [] },
    { ergoTree: recipientTreeHex, value: 1_000_000, assets: [] },
  ],
  trackerEntries: SpvTrackerEntry[] = [],
): Promise<ConfirmedErgoTransactionFixture> {
  return buildConfirmedErgoTransactionFixture({
    outputs: [
      {
        ergoTree: deployed.spvTracker.ergoTreeHex,
        value: 1_000_000,
        assets: [{ tokenId: deployed.spvTracker.nftId, amount: 1 }],
        additionalRegisters: confirmedTrackerRegisters(trackerEntries),
      },
      {
        ergoTree: deployed.doubleUnlockPreventionAggregateBatch.ergoTreeHex,
        value: 1_000_000,
        assets: [{ tokenId: deployed.doubleUnlockPreventionAggregateBatch.nftId, amount: 1 }],
      },
      ...payouts,
    ],
    inclusionHeight: stableErgoInclusionHeight,
    inclusionHeaderIdHex: stableErgoInclusionHeaderIdHex,
  });
}

function policyBoundAttempt(input: {
  txId: string;
  burnTxHashes: string[];
  mode: AggregateSettlementAttemptMode;
  overrides?: Partial<AggregateSettlementAttempt>;
}): AggregateSettlementAttempt {
  return {
    id: 1,
    mode: input.mode,
    expectedTxId: input.txId,
    submittedTxId: input.txId,
    burnTxHashes: input.burnTxHashes,
    status: 'submitted',
    lifecycleVersion: 1,
    transportReservationDigest: '91'.repeat(32),
    fundsReleaseAuthorityEpochHex:
      fundsExecutionAuthorityEpochHex,
    transportStartedAt: '2026-05-17T00:00:00Z',
    transportCompletedAt: '2026-05-17T00:00:01Z',
    recoveryBindingStatus: 'policy_v1',
    recoveryPolicyVersion: 1,
    recoveryRequiredConfirmations: 10,
    ergoObservation: null,
    ergoObservationSourceCount: 0,
    ergoObservationConsensusDigest: null,
    recoveryQuarantine: null,
    createdAt: '2026-05-17T00:00:00Z',
    updatedAt: '2026-05-17T00:00:00Z',
    ...input.overrides,
    abandonmentReason: input.overrides?.abandonmentReason ?? null,
  };
}

function stableConfirmedErgoClient(
  transaction: Record<string, unknown> | null,
  options: {
    inclusionHeight?: number;
    transactionHeaderIdHex?: string;
    canonicalInclusionHeaderIdHex?: string;
    tipHeight?: number;
    tipHeaderIdsHex?: string[];
    events?: string[];
    onTransactionRead?: () => void;
  } = {},
) {
  const inclusionHeight = options.inclusionHeight ?? stableErgoInclusionHeight;
  const tipHeight = options.tipHeight ?? stableErgoTipHeight;
  const transactionHeaderIdHex = options.transactionHeaderIdHex ?? stableErgoInclusionHeaderIdHex;
  const canonicalInclusionHeaderIdHex = options.canonicalInclusionHeaderIdHex
    ?? stableErgoInclusionHeaderIdHex;
  const tipHeaderIdsHex = options.tipHeaderIdsHex ?? [
    stableErgoTipHeaderIdHex,
    stableErgoTipHeaderIdHex,
  ];
  const response = transaction === null
    ? null
    : {
      ...transaction,
      inclusionHeight,
      headerId: transactionHeaderIdHex,
    };
  let tipHeaderRead = 0;

  return {
    addressToTree: async () => {
      throw new Error('addressToTree should not be called for raw trees');
    },
    getCurrentHeight: async () => {
      options.events?.push('ergo:tip-height');
      return tipHeight;
    },
    getBlockHeaderHash: async (height: number) => {
      if (height === inclusionHeight) {
        options.events?.push('ergo:inclusion-header');
        return canonicalInclusionHeaderIdHex;
      }
      if (height === tipHeight) {
        options.events?.push('ergo:tip-header');
        const value = tipHeaderIdsHex[Math.min(tipHeaderRead, tipHeaderIdsHex.length - 1)];
        tipHeaderRead += 1;
        return value;
      }
      throw new Error(`unexpected Ergo header height ${height}`);
    },
    getTransaction: async () => {
      options.events?.push('ergo:transaction');
      options.onTransactionRead?.();
      return response;
    },
    hasUnconfirmedTransaction: async () => {
      options.events?.push('ergo:mempool');
      return false;
    },
  };
}

function submittedAggregateTx(
  txId: string,
  options: {
    burnTxHash?: string;
    mode?: Exclude<AggregateSettlementAttemptMode, 'batch'>;
    attemptOverrides?: Partial<AggregateSettlementAttempt>;
    confirm?: (...args: any[]) => boolean;
  } = {},
) {
  const burnTxHash = options.burnTxHash ?? '55'.repeat(32);
  const attempt = policyBoundAttempt({
    txId,
    burnTxHashes: [burnTxHash],
    mode: options.mode ?? 'single',
    overrides: options.attemptOverrides,
  });
  return {
    getSpvTrackerHistory: () => [],
    getSubmittedSettlementTxId: (_burnTxHash: string, expectedStatus: string) =>
      expectedStatus === 'aggregate_submitted' ? txId : null,
    getAggregateSettlementAttempt: (expectedTxId: string) => expectedTxId === txId ? attempt : null,
    confirmSubmittedSingleSettlementAttempt: options.confirm ?? (() => true),
  };
}

function submittedBatchTx(
  txId: string,
  burnTxHashes: string[] = ['55'.repeat(32), '66'.repeat(32)],
  options: {
    attemptOverrides?: Partial<AggregateSettlementAttempt>;
    confirm?: (...args: any[]) => boolean;
  } = {},
) {
  const attempt = policyBoundAttempt({
    txId,
    burnTxHashes,
    mode: 'batch',
    overrides: options.attemptOverrides,
  });
  return {
    getSpvTrackerHistory: () => [],
    getAggregateSettlementAttempt: (expectedTxId: string) => expectedTxId === txId
      ? attempt
      : null,
    getSubmittedSettlementTxId: (burnTxHash: string, expectedStatus: string) => {
      if (expectedStatus !== 'batch_submitted') return null;
      return txId;
    },
    confirmSubmittedBatchSettlementAttempt: options.confirm ?? (() => true),
  };
}

function expectFinalObservation(
  observation: StableAggregateSettlementErgoObservation,
  txId: string,
  confirmations = 10,
): void {
  assertStableAggregateSettlementErgoObservationProvenance(observation);
  expect(observation.record).toMatchObject({
    policyVersion: 1,
    requiredConfirmations: 10,
    status: 'confirmed_final',
    transactionIdHex: txId,
    inclusionHeight: stableErgoTipHeight - confirmations + 1,
    inclusionHeaderIdHex: stableErgoInclusionHeaderIdHex,
    observedTipHeight: stableErgoTipHeight,
    observedTipHeaderIdHex: stableErgoTipHeaderIdHex,
    confirmations,
  });
  expect(observation.transaction).toMatchObject({
    id: txId,
  });
}

describe('AggregateSettlementService', () => {
  it('resolves aggregate recipient ErgoTree from pubkeys, raw trees, or addresses', async () => {
    const pubKey = '02' + '12'.repeat(32);
    await expect(resolveAggregateRecipientErgoTree(pubKey, async () => {
      throw new Error('addressToTree should not be called for pubkeys');
    })).resolves.toBe(`0008cd${pubKey}`);

    await expect(resolveAggregateRecipientErgoTree(`0x0008cd${pubKey}`, async () => {
      throw new Error('addressToTree should not be called for raw trees');
    })).resolves.toBe(`0008cd${pubKey}`);

    await expect(resolveAggregateRecipientErgoTree('9fakeAddress', async (address) => {
      expect(address).toBe('9fakeAddress');
      return recipientTreeHex;
    })).resolves.toBe(recipientTreeHex);
  });

  it('prepares a signable single-claim aggregate settlement tx from live boxes', async () => {
    const ctx = setup();
    const unlockBox = box('30'.repeat(32), ctx.deployed.mainChainAggregateUnlock.ergoTreeHex, {}, undefined, 2_100_000);
    const ergo = {
      addressToTree: async () => { throw new Error('addressToTree should not be called for raw trees'); },
      getCurrentHeight: async () => 330200,
      findSingletonBox: async (tokenId: string) => {
        if (tokenId === ctx.deployed.spvTracker.nftId) return ctx.trackerBox;
        if (tokenId === ctx.deployed.doubleUnlockPreventionAggregate.nftId) return ctx.aggregateDupBox;
        throw new Error(`unexpected token ${tokenId}`);
      },
      getUnspentBoxesByAddress: async () => [unlockBox],
    };

    const service = new AggregateSettlementService({
      ergo,
      state: ctx.state,
      deployed: ctx.deployed,
    } as any);

    const prepared = await service.prepareSingleClaimNoIngest({
      pegOut: ctx.pegOut,
      trackerIdentity: {
        sidechainIdHex,
        sidechainHeight: ctx.accepted.sidechainHeight,
        sidechainHeaderHashHex: ctx.accepted.sidechainHeaderHashHex,
      },
    });

    expect(prepared.eip12Tx.inputs).toHaveLength(3);
    expect(prepared.eip12Tx.inputs[0].boxId).toBe(ctx.trackerBox.boxId);
    expect(prepared.eip12Tx.inputs[1].extension).toEqual(prepared.plan.dupV1Extension);
    expect(prepared.eip12Tx.inputs[2].extension['0']).toBeTruthy();
    expect(prepared.eip12Tx.outputs[0].assets[0].tokenId).toBe(ctx.deployed.spvTracker.nftId);
    expect(prepared.eip12Tx.outputs[1].assets[0].tokenId).toBe(ctx.deployed.doubleUnlockPreventionAggregate.nftId);
    expect(prepared.eip12Tx.outputs[2].ergoTree).toBe(recipientTreeHex);
    expect(prepared.eip12Tx.outputs[2].value).toBe(Number(ctx.pegOut.amount));
  });

  it('prepares a read-only trustless settlement candidate without selecting boxes or building a tx', async () => {
    const ctx = setup();
    const service = new AggregateSettlementService({
      ergo: {
        addressToTree: async () => { throw new Error('candidate must not resolve recipients'); },
        getCurrentHeight: async () => { throw new Error('candidate must not read current height'); },
        findSingletonBox: async () => { throw new Error('candidate must not select singleton boxes'); },
        getUnspentBoxesByAddress: async () => { throw new Error('candidate must not select unlock boxes'); },
      },
      state: ctx.state,
      deployed: ctx.deployed,
    } as any);

    const duplicatePreventionKeyHex = deriveTrustlessBurnIdHex({
      sidechainIdHex,
      sidechainTxHashHex: ctx.pegOut.sidechainTxHash,
      eventIndex: sidechainLogIndex,
    });
    const candidate = await service.prepareTrustlessSettlementCandidate({
      pegOut: ctx.pegOut,
      trackerIdentity: {
        sidechainIdHex,
        sidechainHeight: ctx.accepted.sidechainHeight,
        sidechainHeaderHashHex: ctx.accepted.sidechainHeaderHashHex,
      },
      settlementIdentity: {
        source: 'trustless-burn-leaf',
        duplicatePreventionKeyHex,
        bridgeEventRootHex: ctx.accepted.bridgeEventRootHex,
        recipientErgoTreeHashHex: '77'.repeat(32),
        amountNanoErg: ctx.pegOut.amount,
      },
      evidenceLabel: 'Unit trustless candidate',
      evidenceGeneratedAt: '2026-05-18T01:03:49.224Z',
    });

    expect(candidate.plan.contractCompatibility).toBe('candidate-only-trustless-v2-required');
    expect(candidate.plan.claims[0].duplicatePreventionKeyHex).toBe(duplicatePreventionKeyHex);
    expect(candidate.plan.claims[0].settlementIdentity.source).toBe('trustless-burn-leaf');
    expect(candidate.plan.claims[0].bridgeEventRootHex).toBe(ctx.accepted.bridgeEventRootHex);
    expect(candidate.evidence).toEqual({
      schemaVersion: 1,
      generatedAt: '2026-05-18T01:03:49.224Z',
      evidenceKind: 'trustless-settlement-candidate',
      label: 'Unit trustless candidate',
      stateTrackerMode: 'read-only',
      broadcast: 'no',
      boundary: {
        gate5Closure: 'no',
        prebroadcastEvidence: 'no',
        settlementReadiness: 'no',
        testnetProductionCandidateClaim: 'no',
        productionReadyClaim: 'no',
      },
      claimCount: 1,
      claims: [{
        legacySidechainTxHash: ctx.pegOut.sidechainTxHash,
        sidechainBlockHeight: ctx.pegOut.sidechainBlockNumber,
        trustlessBurnDerivation: {
          sidechainIdHex,
          sidechainLogIndex,
          derivedBurnIdHex: duplicatePreventionKeyHex,
        },
        settlementIdentity: {
          source: 'trustless-burn-leaf',
          duplicatePreventionKeyHex,
          bridgeEventRootHex: ctx.accepted.bridgeEventRootHex,
          recipientErgoTreeHashHex: '77'.repeat(32),
          amountNanoErg: ctx.pegOut.amount.toString(),
        },
      }],
      contractCompatibility: 'candidate-only-trustless-v2-required',
    });
    expect('transactionCheck' in candidate.evidence).toBe(false);
    expect('expectedTxId' in candidate.evidence).toBe(false);
    expect(validateAggregateSettlementTrustlessCandidateEvidenceRecord(candidate.evidence)).toEqual([]);
    expect(validateAggregateSettlementPrebroadcastEvidenceRecord(candidate.evidence)).toEqual(
      expect.arrayContaining([
        'aggregate settlement evidence record.evidenceKind: unsupported evidence field',
        'transactionCheck must be an object',
      ]),
    );
  });

  it('prepares a V2 trustless single-leaf unsigned tx with a compact guard-safe extension', async () => {
    const ctx = trustlessSetup();
    const unlockBox = box(
      '30'.repeat(32),
      ctx.deployed.mainChainAggregateUnlockTrustless.ergoTreeHex,
      vaultRegisters('31'.repeat(32), 2_100_000),
      undefined,
      2_100_000,
    );
    const selectedAddresses: string[] = [];
    const service = new AggregateSettlementService({
      ergo: {
        addressToTree: async () => { throw new Error('addressToTree should not be called for raw trees'); },
        getCurrentHeight: async () => 330200,
        findSingletonBox: async (tokenId: string) => {
          if (tokenId === ctx.deployed.spvTracker.nftId) return ctx.trackerBox;
          if (tokenId === ctx.deployed.doubleUnlockPreventionAggregate.nftId) return ctx.aggregateDupBox;
          throw new Error(`unexpected token ${tokenId}`);
        },
        getUnspentBoxesByAddress: async (address: string) => {
          selectedAddresses.push(address);
          return [unlockBox];
        },
      },
      state: ctx.state,
      deployed: ctx.deployed,
    } as any);

    const prepared = await service.prepareTrustlessSingleLeafUnsignedTx({
      pegOut: ctx.pegOut,
      trackerIdentity: {
        sidechainIdHex,
        sidechainHeight: ctx.accepted.sidechainHeight,
        sidechainHeaderHashHex: ctx.accepted.sidechainHeaderHashHex,
      },
      settlementIdentity: ctx.settlementIdentity,
      evidenceLabel: 'Unit trustless unsigned tx candidate',
      evidenceGeneratedAt: '2026-07-01T09:25:00.000Z',
    });

    expect(selectedAddresses).toEqual([ctx.deployed.mainChainAggregateUnlockTrustless.address]);
    expect(prepared.plan.contractCompatibility).toBe('candidate-only-trustless-v2-required');
    expect(prepared.unsignedTx.inputs).toHaveLength(3);
    expect(prepared.eip12Tx.inputs[2].extension).toEqual(prepared.unsignedTx.inputs[2].extension);
    expect(Object.keys(prepared.unsignedTx.inputs[2].extension)).toEqual(['0', '1', '2', '3']);
    expect(prepared.unsignedTx.outputs[0].assets[0].tokenId).toBe(ctx.deployed.spvTracker.nftId);
    expect(prepared.unsignedTx.outputs[1].assets[0].tokenId).toBe(ctx.deployed.doubleUnlockPreventionAggregate.nftId);
    expect(prepared.unsignedTx.outputs[2]).toMatchObject({
      value: Number(ctx.pegOut.amount),
      ergoTree: recipientTreeHex,
    });
    expect(prepared.contextExtensionGuard).toMatchObject({
      status: 'pass',
      reason: 'unsigned-source-boundary-only',
      signingPermitted: false,
      broadcastPermitted: false,
      effectiveThreshold: 4,
    });
    expect(prepared.contextExtensionGuard.offenders).toEqual([]);
    expect(prepared.evidence.boundary).toMatchObject({
      gate5Closure: 'no',
      prebroadcastEvidence: 'no',
      settlementReadiness: 'no',
      testnetProductionCandidateClaim: 'no',
      productionReadyClaim: 'no',
    });
    expect(validateAggregateSettlementTrustlessCandidateEvidenceRecord(prepared.evidence)).toEqual([]);
    expect(prepared.unsignedTxEvidence).toMatchObject({
      evidenceKind: 'trustless-single-leaf-unsigned-tx',
      label: 'Unit trustless unsigned tx candidate',
      stateTrackerMode: 'read-only',
      broadcast: 'no',
      boundary: {
        gate5Closure: 'no',
        prebroadcastEvidence: 'no',
        settlementReadiness: 'no',
        transactionCheck: 'no',
        expectedTxId: 'no',
        signing: 'no',
        submit: 'no',
        testnetProductionCandidateClaim: 'no',
        productionReadyClaim: 'no',
      },
      selectedBoxes: {
        trackerBoxId: ctx.trackerBox.boxId,
        aggregateDupBoxId: ctx.aggregateDupBox.boxId,
        unlockBoxId: unlockBox.boxId,
      },
      payoutBinding: {
        outputIndex: 2,
        recipientErgoTreeHex: recipientTreeHex,
        recipientErgoTreeHashHex: recipientTreeHashHex(recipientTreeHex),
        amountNanoErg: ctx.pegOut.amount.toString(),
        recipientHashEqualsProvedBurn: true,
        amountEqualsProvedBurn: true,
      },
      settlementShape: {
        inputCount: 3,
        outputCount: 4,
        contextExtensionKeyCounts: [0, 3, 4],
        contextExtensionKeyCountsCsv: '0,3,4',
      },
      contextExtensionGuard: {
        status: 'pass',
        reason: 'unsigned-source-boundary-only',
        effectiveThreshold: 4,
        offenderCount: 0,
        signingPermitted: false,
        broadcastPermitted: false,
      },
    });
    expect('transactionCheck' in prepared.unsignedTxEvidence).toBe(false);
    expect('expectedTxId' in prepared.unsignedTxEvidence).toBe(false);
    expect(validateAggregateSettlementTrustlessUnsignedTxEvidenceRecord(prepared.unsignedTxEvidence)).toEqual([]);
  });

  it('rejects read-only trustless settlement candidates without a trustless identity', async () => {
    const ctx = setup();
    const service = new AggregateSettlementService({
      ergo: {},
      state: ctx.state,
      deployed: ctx.deployed,
    } as any);

    await expect(service.prepareTrustlessSettlementCandidate({
      pegOut: ctx.pegOut,
      trackerIdentity: {
        sidechainIdHex,
        sidechainHeight: ctx.accepted.sidechainHeight,
        sidechainHeaderHashHex: ctx.accepted.sidechainHeaderHashHex,
      },
      settlementIdentity: {
        source: 'legacy-aggregate-root',
        duplicatePreventionKeyHex: ctx.pegOut.sidechainTxHash,
        bridgeEventRootHex: ctx.accepted.bridgeEventRootHex,
      },
    })).rejects.toThrow('trustless settlement candidate requires trustless-burn-leaf settlement identity');
  });

  it('rejects read-only trustless settlement candidates with log indexes outside uint32', async () => {
    const ctx = setup();
    const service = new AggregateSettlementService({
      ergo: {
        addressToTree: async () => { throw new Error('candidate must not resolve recipients'); },
        getCurrentHeight: async () => { throw new Error('candidate must not read current height'); },
        findSingletonBox: async () => { throw new Error('candidate must not select singleton boxes'); },
        getUnspentBoxesByAddress: async () => { throw new Error('candidate must not select unlock boxes'); },
      },
      state: ctx.state,
      deployed: ctx.deployed,
    } as any);

    await expect(service.prepareTrustlessSettlementCandidate({
      pegOut: {
        ...ctx.pegOut,
        sidechainLogIndex: 0x1_0000_0000,
      },
      trackerIdentity: {
        sidechainIdHex,
        sidechainHeight: ctx.accepted.sidechainHeight,
        sidechainHeaderHashHex: ctx.accepted.sidechainHeaderHashHex,
      },
      settlementIdentity: {
        source: 'trustless-burn-leaf',
        duplicatePreventionKeyHex: deriveTrustlessBurnIdHex({
          sidechainIdHex,
          sidechainTxHashHex: ctx.pegOut.sidechainTxHash,
          eventIndex: sidechainLogIndex,
        }),
        bridgeEventRootHex: ctx.accepted.bridgeEventRootHex,
        recipientErgoTreeHashHex: '77'.repeat(32),
        amountNanoErg: ctx.pegOut.amount,
      },
    })).rejects.toThrow('trustless settlement candidate sidechainLogIndex must fit uint32');
  });

  it('requires recipient and amount bindings for trustless candidate evidence', async () => {
    const ctx = setup();
    const service = new AggregateSettlementService({
      ergo: {},
      state: ctx.state,
      deployed: ctx.deployed,
    } as any);
    const duplicatePreventionKeyHex = deriveTrustlessBurnIdHex({
      sidechainIdHex,
      sidechainTxHashHex: ctx.pegOut.sidechainTxHash,
      eventIndex: sidechainLogIndex,
    });
    const baseInput = {
      pegOut: ctx.pegOut,
      trackerIdentity: {
        sidechainIdHex,
        sidechainHeight: ctx.accepted.sidechainHeight,
        sidechainHeaderHashHex: ctx.accepted.sidechainHeaderHashHex,
      },
    };

    await expect(service.prepareTrustlessSettlementCandidate({
      ...baseInput,
      settlementIdentity: {
        source: 'trustless-burn-leaf',
        duplicatePreventionKeyHex,
        bridgeEventRootHex: ctx.accepted.bridgeEventRootHex,
        amountNanoErg: ctx.pegOut.amount,
      } as any,
    })).rejects.toThrow('trustless settlement candidate evidence requires recipientErgoTreeHashHex');

    await expect(service.prepareTrustlessSettlementCandidate({
      ...baseInput,
      settlementIdentity: {
        source: 'trustless-burn-leaf',
        duplicatePreventionKeyHex,
        bridgeEventRootHex: ctx.accepted.bridgeEventRootHex,
        recipientErgoTreeHashHex: '77'.repeat(32),
      } as any,
    })).rejects.toThrow('trustless settlement candidate evidence requires amountNanoErg');
  });

  it('rejects stale SPV tracker local history before assembling settlement tx', async () => {
    const ctx = setup();
    const staleTrackerBox = box('10'.repeat(32), ctx.deployed.spvTracker.ergoTreeHex, {
      ...ctx.trackerBox.additionalRegisters,
      R5: encodeSpvTrackerAvlRegister(getEmptySpvTrackerDigest()),
    }, ctx.deployed.spvTracker.nftId, 1_000_000);
    const ergo = {
      addressToTree: async () => { throw new Error('addressToTree should not be called for raw trees'); },
      getCurrentHeight: async () => 330200,
      findSingletonBox: async (tokenId: string) => {
        if (tokenId === ctx.deployed.spvTracker.nftId) return staleTrackerBox;
        if (tokenId === ctx.deployed.doubleUnlockPreventionAggregate.nftId) return ctx.aggregateDupBox;
        throw new Error(`unexpected token ${tokenId}`);
      },
      getUnspentBoxesByAddress: async () => {
        throw new Error('liquidity boxes should not be fetched after tracker digest mismatch');
      },
    };

    const service = new AggregateSettlementService({
      ergo,
      state: ctx.state,
      deployed: ctx.deployed,
    } as any);

    await expect(service.prepareSingleClaimNoIngest({
      pegOut: ctx.pegOut,
      trackerIdentity: {
        sidechainIdHex,
        sidechainHeight: ctx.accepted.sidechainHeight,
        sidechainHeaderHashHex: ctx.accepted.sidechainHeaderHashHex,
      },
    })).rejects.toThrow(/SPV tracker input AVL digest mismatch/);
  });

  it('rejects stale aggregate DUP local history before assembling settlement tx', async () => {
    const ctx = setup();
    const ergo = {
      addressToTree: async () => { throw new Error('addressToTree should not be called for raw trees'); },
      getCurrentHeight: async () => 330200,
      findSingletonBox: async (tokenId: string) => {
        if (tokenId === ctx.deployed.spvTracker.nftId) return ctx.trackerBox;
        if (tokenId === ctx.deployed.doubleUnlockPreventionAggregate.nftId) return ctx.aggregateDupBox;
        throw new Error(`unexpected token ${tokenId}`);
      },
      getUnspentBoxesByAddress: async () => {
        throw new Error('liquidity boxes should not be fetched after DUP digest mismatch');
      },
    };

    const service = new AggregateSettlementService({
      ergo,
      state: {
        ...ctx.state,
        getAllAvlKeys: () => ['77'.repeat(32)],
      },
      deployed: ctx.deployed,
    } as any);

    await expect(service.prepareSingleClaimNoIngest({
      pegOut: ctx.pegOut,
      trackerIdentity: {
        sidechainIdHex,
        sidechainHeight: ctx.accepted.sidechainHeight,
        sidechainHeaderHashHex: ctx.accepted.sidechainHeaderHashHex,
      },
    })).rejects.toThrow(/Aggregate DUP input AVL digest mismatch/);
  });

  it('selects a pure-ERG aggregate unlock liquidity box that covers payout plus fee', async () => {
    const ctx = setup();
    const tokenBox = box('30'.repeat(32), ctx.deployed.mainChainAggregateUnlock.ergoTreeHex, {}, 'cc'.repeat(32), 5_000_000);
    const underfunded = box('31'.repeat(32), ctx.deployed.mainChainAggregateUnlock.ergoTreeHex, {}, undefined, 2_000_000);
    const funded = box('32'.repeat(32), ctx.deployed.mainChainAggregateUnlock.ergoTreeHex, {}, undefined, 2_100_000);
    const ergo = {
      addressToTree: async () => recipientTreeHex,
      getCurrentHeight: async () => 330200,
      findSingletonBox: async (tokenId: string) => tokenId === ctx.deployed.spvTracker.nftId
        ? ctx.trackerBox
        : ctx.aggregateDupBox,
      getUnspentBoxesByAddress: async () => [tokenBox, underfunded, funded],
    };

    const service = new AggregateSettlementService({
      ergo,
      state: ctx.state,
      deployed: ctx.deployed,
    } as any);

    const prepared = await service.prepareSingleClaimNoIngest({
      pegOut: ctx.pegOut,
      trackerIdentity: {
        sidechainIdHex,
        sidechainHeight: ctx.accepted.sidechainHeight,
        sidechainHeaderHashHex: ctx.accepted.sidechainHeaderHashHex,
      },
    });

    expect(prepared.unlockBox.boxId).toBe(funded.boxId);
  });

  it('rejects unsafe aggregate peg-out amounts before selecting liquidity', async () => {
    const ctx = setup();
    const unsafePegOut = {
      ...ctx.pegOut,
      amount: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
    };
    const ergo = {
      addressToTree: async () => recipientTreeHex,
      getCurrentHeight: async () => 330200,
      findSingletonBox: async (tokenId: string) => tokenId === ctx.deployed.spvTracker.nftId
        ? ctx.trackerBox
        : ctx.aggregateDupBox,
      getUnspentBoxesByAddress: async () => {
        throw new Error('liquidity boxes should not be fetched for unsafe amounts');
      },
    };

    const service = new AggregateSettlementService({
      ergo,
      state: ctx.state,
      deployed: ctx.deployed,
    } as any);

    await expect(service.prepareSingleClaimNoIngest({
      pegOut: unsafePegOut,
      trackerIdentity: {
        sidechainIdHex,
        sidechainHeight: ctx.accepted.sidechainHeight,
        sidechainHeaderHashHex: ctx.accepted.sidechainHeaderHashHex,
      },
    })).rejects.toThrow(/peg-out amount is outside JavaScript safe integer range/);
  });

  it('prepares a single-claim same-transaction tracker ingest settlement tx', async () => {
    const deployed = deployedState();
    const burnTxIdHex = '66'.repeat(32);
    const amount = 1_000_000n;
    const bridgeEventRootHex = deriveAggregateBurnEventRoot(burnTxIdHex, recipientTreeHex, amount);
    const newEntry = entry(2, bridgeEventRootHex);
    const pegOut: ParsedPegOut = {
      user: '0x0000000000000000000000000000000000000001',
      amount,
      ergoRecipientAddress: recipientTreeHex,
      sidechainTxHash: burnTxIdHex,
      sidechainBlockNumber: Number(newEntry.sidechainHeight),
    };
    const trackerBox = box('10'.repeat(32), deployed.spvTracker.ergoTreeHex, {
      R4: encodeLongRegister(0),
      R5: encodeSpvTrackerAvlRegister(getEmptySpvTrackerDigest()),
      R6: committee,
      R7: encodeLongRegister(0),
    }, deployed.spvTracker.nftId, 1_000_000);
    const aggregateDupBox = box('20'.repeat(32), deployed.doubleUnlockPreventionAggregate.ergoTreeHex, {
      R4: encodeLongRegister(0),
      R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
      R6: committee,
    }, deployed.doubleUnlockPreventionAggregate.nftId, 1_000_000);
    const unlockBox = box('30'.repeat(32), deployed.mainChainAggregateUnlock.ergoTreeHex, {}, undefined, 2_100_000);
    const ergo = {
      addressToTree: async () => recipientTreeHex,
      getCurrentHeight: async () => 330200,
      findSingletonBox: async (tokenId: string) => tokenId === deployed.spvTracker.nftId
        ? trackerBox
        : aggregateDupBox,
      getUnspentBoxesByAddress: async () => [unlockBox],
    };
    const service = new AggregateSettlementService({
      ergo,
      state: {
        getSpvTrackerHistory: () => [],
        getAllAvlKeys: () => [],
      },
      deployed,
    } as any);

    const prepared = await service.prepareSingleClaim({
      pegOut,
      trackerIdentity: {
        sidechainIdHex,
        sidechainHeight: newEntry.sidechainHeight,
        sidechainHeaderHashHex: newEntry.sidechainHeaderHashHex,
      },
      trackerIngest: newEntry,
    });

    expect(prepared.plan.trackerIngests).toHaveLength(1);
    expect(prepared.plan.claims[0].trackerTree).toBe('output');
    expect(prepared.eip12Tx.inputs[0].extension).toEqual(prepared.plan.trackerIngests[0].trackerExtension);
    expect(prepared.eip12Tx.inputs[2].extension['7']).toBe(encodeIntRegister(1));
    expect(prepared.eip12Tx.outputs[0].additionalRegisters.R7).toBe(encodeLongRegister(Number(newEntry.sidechainHeight)));
  });

  it('resolves tracker identity from stored SPV history when preparing from a PegOut', async () => {
    const ctx = setup();
    const unlockBox = box('30'.repeat(32), ctx.deployed.mainChainAggregateUnlock.ergoTreeHex, {}, undefined, 2_100_000);
    const state = {
      ...ctx.state,
      getSpvTrackerIdentityByHeight: (height: number | bigint, resolvedSidechainId: string) => {
        expect(BigInt(height)).toBe(ctx.accepted.sidechainHeight);
        return {
          sidechainIdHex: resolvedSidechainId,
          sidechainHeight: ctx.accepted.sidechainHeight,
          sidechainHeaderHashHex: ctx.accepted.sidechainHeaderHashHex,
        };
      },
    };
    const ergo = {
      addressToTree: async () => recipientTreeHex,
      getCurrentHeight: async () => 330200,
      findSingletonBox: async (tokenId: string) => tokenId === ctx.deployed.spvTracker.nftId
        ? ctx.trackerBox
        : ctx.aggregateDupBox,
      getUnspentBoxesByAddress: async () => [unlockBox],
    };

    const service = new AggregateSettlementService({
      ergo,
      state,
      deployed: ctx.deployed,
      sidechainIdHex,
    } as any);

    const prepared = await service.prepareSingleClaimNoIngestFromPegOut({
      pegOut: ctx.pegOut,
    });

    expect(prepared.plan.claims[0].trackerTree).toBe('input');
    expect(prepared.plan.claims[0].claim.trackerIdentity.sidechainHeaderHashHex)
      .toBe(ctx.accepted.sidechainHeaderHashHex);
  });

  it('rejects missing stored SPV tracker identity before selecting boxes', async () => {
    const ctx = setup();
    const service = new AggregateSettlementService({
      ergo: {
        findSingletonBox: async () => {
          throw new Error('singleton boxes should not be fetched without SPV identity');
        },
        getUnspentBoxesByAddress: async () => {
          throw new Error('liquidity boxes should not be fetched without SPV identity');
        },
      },
      state: {
        ...ctx.state,
        getSpvTrackerIdentityByHeight: () => null,
      },
      deployed: ctx.deployed,
      sidechainIdHex,
    } as any);

    await expect(service.prepareSingleClaimNoIngestFromPegOut({
      pegOut: ctx.pegOut,
    })).rejects.toThrow(/no SPV tracker entry/);
  });

  it('rejects missing aggregate deployment state', async () => {
    const ctx = setup();
    const service = new AggregateSettlementService({
      ergo: {} as any,
      state: ctx.state,
      deployed: { ...ctx.deployed, mainChainAggregateUnlock: undefined },
    } as any);

    await expect(service.prepareSingleClaimNoIngest({
      pegOut: ctx.pegOut,
      trackerIdentity: {
        sidechainIdHex,
        sidechainHeight: ctx.accepted.sidechainHeight,
        sidechainHeaderHashHex: ctx.accepted.sidechainHeaderHashHex,
      },
    })).rejects.toThrow(/mainChainAggregateUnlock/);
  });

  it('confirms a canonical aggregate settlement by committing the DUP key and final status', async () => {
    const ctx = setup();
    const confirmedTx = await confirmedAggregateTx(ctx);
    const txId = confirmedTx.id;
    const events: string[] = [];
    const reducerCalls: any[][] = [];
    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction, { events }),
      state: {
        ...submittedAggregateTx(txId, {
          confirm: (...args: any[]) => {
            reducerCalls.push(args);
            events.push('state:confirm');
            return true;
          },
        }),
      },
      deployed: ctx.deployed,
      verifySidechainBurn: async () => {
        events.push('sidechain:burn');
        return 'confirmed';
      },
    } as any);

    const confirmed = await service.confirmSingleClaimSettlement(ctx.pegOut, txId);

    expect(confirmed).toBe(true);
    expect(events[0]).toBe('sidechain:burn');
    expect(events.filter(event => event === 'sidechain:burn')).toHaveLength(2);
    expect(events.indexOf('ergo:tip-height')).toBeGreaterThan(events.indexOf('sidechain:burn'));
    expect(events.at(-1)).toBe('state:confirm');
    expect(reducerCalls).toHaveLength(1);
    expect(reducerCalls[0].slice(0, 4)).toEqual([
      txId,
      1,
      'single',
      ctx.pegOut.sidechainTxHash,
    ]);
    expectFinalObservation(reducerCalls[0][4], txId);
    expect(reducerCalls[0][5]).toBe(getSpvTrackerDigest([]));
    expect(reducerCalls[0][6]).toBeUndefined();
    expect(reducerCalls[0][7]).toEqual({
      burnTxHash: ctx.pegOut.sidechainTxHash,
      sidechainLogIndex: ctx.pegOut.sidechainLogIndex,
    });
  });

  it('rechecks the burn after Ergo observation and rejects a confirmation-time reorg', async () => {
    const ctx = setup();
    const confirmedTx = await confirmedAggregateTx(ctx);
    const events: string[] = [];
    const reducerCalls: any[][] = [];
    const statusUpdates: any[][] = [];
    const burnStatuses = ['confirmed', 'reverted'] as const;
    let burnRead = 0;
    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction, { events }),
      state: {
        ...submittedAggregateTx(confirmedTx.id, {
          confirm: (...args: any[]) => {
            reducerCalls.push(args);
            return true;
          },
        }),
        updatePegOutStatus: (...args: any[]) => statusUpdates.push(args),
      },
      deployed: ctx.deployed,
      verifySidechainBurn: async () => {
        events.push('sidechain:burn');
        return burnStatuses[Math.min(burnRead++, burnStatuses.length - 1)];
      },
    } as any);

    expect(await service.confirmSingleClaimSettlement(ctx.pegOut, confirmedTx.id)).toBe(false);
    expect(events.filter(event => event === 'sidechain:burn')).toHaveLength(2);
    expect(events.indexOf('ergo:transaction')).toBeGreaterThan(events.indexOf('sidechain:burn'));
    expect(events.lastIndexOf('sidechain:burn')).toBeGreaterThan(events.indexOf('ergo:transaction'));
    expect(reducerCalls).toEqual([]);
    expect(statusUpdates).toEqual([[
      {
        burnTxHash: ctx.pegOut.sidechainTxHash,
        sidechainLogIndex: ctx.pegOut.sidechainLogIndex,
      },
      'burn_reverted',
    ]]);
  });

  it('rejects a confirmation response whose transaction ID differs from the submitted identity', async () => {
    const ctx = setup();
    const txId = '97'.repeat(32);
    const observedTx = await confirmedAggregateTx(ctx);
    const reducerCalls: any[][] = [];
    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(observedTx.transaction),
      state: {
        ...submittedAggregateTx(txId, {
          confirm: (...args: any[]) => {
            reducerCalls.push(args);
            return true;
          },
        }),
      },
      deployed: ctx.deployed,
      verifySidechainBurn: async () => 'confirmed',
    } as any);

    await expect(service.confirmSingleClaimSettlement(ctx.pegOut, txId)).rejects.toThrow(
      /transaction ID does not match the journal/,
    );
    expect(reducerCalls).toEqual([]);
  });

  it('does not confirm a settlement with only nine Ergo confirmations', async () => {
    const ctx = setup();
    const confirmedTx = await confirmedAggregateTx(ctx);
    const txId = confirmedTx.id;
    const reducerCalls: any[][] = [];
    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction, {
        inclusionHeight: stableErgoTipHeight - 8,
      }),
      state: {
        ...submittedAggregateTx(txId, {
          confirm: (...args: any[]) => {
            reducerCalls.push(args);
            return true;
          },
        }),
      },
      deployed: ctx.deployed,
      verifySidechainBurn: async () => 'confirmed',
    } as any);

    expect(await service.confirmSingleClaimSettlement(ctx.pegOut, txId)).toBe(false);
    expect(reducerCalls).toEqual([]);
  });

  it('does not confirm an absent settlement transaction from a stable tip and mempool view', async () => {
    const ctx = setup();
    const txId = '97'.repeat(32);
    const ergoEvents: string[] = [];
    const reducerCalls: any[][] = [];
    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(null, { events: ergoEvents }),
      state: {
        ...submittedAggregateTx(txId, {
          confirm: (...args: any[]) => {
            reducerCalls.push(args);
            return true;
          },
        }),
      },
      deployed: ctx.deployed,
      verifySidechainBurn: async () => 'confirmed',
    } as any);

    expect(await service.confirmSingleClaimSettlement(ctx.pegOut, txId)).toBe(false);
    expect(ergoEvents.filter(event => event === 'ergo:transaction')).toHaveLength(2);
    expect(ergoEvents.filter(event => event === 'ergo:mempool')).toHaveLength(2);
    expect(ergoEvents.filter(event => event === 'ergo:tip-height')).toHaveLength(2);
    expect(ergoEvents.filter(event => event === 'ergo:tip-header')).toHaveLength(2);
    expect(reducerCalls).toEqual([]);
  });

  it('rejects an equal-height Ergo tip hash change without calling the reducer', async () => {
    const ctx = setup();
    const confirmedTx = await confirmedAggregateTx(ctx);
    const txId = confirmedTx.id;
    const reducerCalls: any[][] = [];
    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction, {
        tipHeaderIdsHex: ['e3'.repeat(32), 'e4'.repeat(32)],
      }),
      state: {
        ...submittedAggregateTx(txId, {
          confirm: (...args: any[]) => {
            reducerCalls.push(args);
            return true;
          },
        }),
      },
      deployed: ctx.deployed,
      verifySidechainBurn: async () => 'confirmed',
    } as any);

    await expect(service.confirmSingleClaimSettlement(ctx.pegOut, txId)).rejects.toThrow(
      /canonical tip changed/,
    );
    expect(reducerCalls).toEqual([]);
  });

  it('rejects a non-canonical Ergo inclusion header without calling the reducer', async () => {
    const ctx = setup();
    const confirmedTx = await confirmedAggregateTx(ctx);
    const txId = confirmedTx.id;
    const reducerCalls: any[][] = [];
    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction, {
        canonicalInclusionHeaderIdHex: 'e3'.repeat(32),
      }),
      state: {
        ...submittedAggregateTx(txId, {
          confirm: (...args: any[]) => {
            reducerCalls.push(args);
            return true;
          },
        }),
      },
      deployed: ctx.deployed,
      verifySidechainBurn: async () => 'confirmed',
    } as any);

    await expect(service.confirmSingleClaimSettlement(ctx.pegOut, txId)).rejects.toThrow(
      /inclusion block is not canonical/,
    );
    expect(reducerCalls).toEqual([]);
  });

  it.each([
    ['legacy-unbound recovery', {
      recoveryBindingStatus: 'legacy_unbound' as const,
      recoveryPolicyVersion: null,
      recoveryRequiredConfirmations: null,
    }],
    ['batch mode', { mode: 'batch' as const }],
    ['different burn identity', { burnTxHashes: ['56'.repeat(32)] }],
    ['different submitted transaction', { submittedTxId: '98'.repeat(32) }],
  ])('rejects a single confirmation with %s before observing Ergo', async (_label, attemptOverrides) => {
    const ctx = setup();
    const confirmedTx = await confirmedAggregateTx(ctx);
    const txId = confirmedTx.id;
    const ergoEvents: string[] = [];
    const reducerCalls: any[][] = [];
    let burnChecks = 0;
    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction, { events: ergoEvents }),
      state: {
        ...submittedAggregateTx(txId, {
          attemptOverrides,
          confirm: (...args: any[]) => {
            reducerCalls.push(args);
            return true;
          },
        }),
      },
      deployed: ctx.deployed,
      verifySidechainBurn: async () => {
        burnChecks += 1;
        return 'confirmed';
      },
    } as any);

    expect(await service.confirmSingleClaimSettlement(ctx.pegOut, txId)).toBe(false);
    expect(burnChecks).toBe(0);
    expect(ergoEvents).toEqual([]);
    expect(reducerCalls).toEqual([]);
  });

  it('marks reverted burns without reconciling aggregate settlement state', async () => {
    const ctx = setup();
    const confirmedTx = await confirmedAggregateTx(ctx);
    const statusUpdates: any[] = [];
    const ergoEvents: string[] = [];
    const reducerCalls: any[][] = [];
    const txId = confirmedTx.id;
    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction, { events: ergoEvents }),
      state: {
        ...submittedAggregateTx(txId, {
          confirm: (...args: any[]) => {
            reducerCalls.push(args);
            return true;
          },
        }),
        updatePegOutStatus: (...args: any[]) => statusUpdates.push(args),
      },
      deployed: ctx.deployed,
      verifySidechainBurn: async () => 'reverted',
    } as any);

    const confirmed = await service.confirmSingleClaimSettlement(ctx.pegOut, txId, ctx.accepted);

    expect(confirmed).toBe(false);
    expect(ergoEvents).toEqual([]);
    expect(reducerCalls).toEqual([]);
    expect(statusUpdates).toEqual([[
      {
        burnTxHash: ctx.pegOut.sidechainTxHash,
        sidechainLogIndex: ctx.pegOut.sidechainLogIndex,
      },
      'burn_reverted',
    ]]);
  });

  it('defers aggregate settlement reconciliation when burn verification is unavailable', async () => {
    const ctx = setup();
    const confirmedTx = await confirmedAggregateTx(ctx);
    const statusUpdates: any[] = [];
    const ergoEvents: string[] = [];
    const reducerCalls: any[][] = [];
    const txId = confirmedTx.id;
    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction, { events: ergoEvents }),
      state: {
        ...submittedAggregateTx(txId, {
          confirm: (...args: any[]) => {
            reducerCalls.push(args);
            return true;
          },
        }),
        updatePegOutStatus: (...args: any[]) => statusUpdates.push(args),
      },
      deployed: ctx.deployed,
      verifySidechainBurn: async () => 'unknown',
    } as any);

    const confirmed = await service.confirmSingleClaimSettlement(ctx.pegOut, txId);

    expect(confirmed).toBe(false);
    expect(ergoEvents).toEqual([]);
    expect(reducerCalls).toEqual([]);
    expect(statusUpdates).toEqual([]);
  });

  it('rejects a correct-looking aggregate confirmation when SQLite records a different submitted tx id', async () => {
    const ctx = setup();
    const confirmedTx = await confirmedAggregateTx(ctx);
    const txId = confirmedTx.id;
    let fetchedTx = false;
    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction, {
        onTransactionRead: () => { fetchedTx = true; },
      }),
      state: {
        ...submittedAggregateTx('98'.repeat(32)),
      },
      deployed: ctx.deployed,
    } as any);

    const confirmed = await service.confirmSingleClaimSettlement(ctx.pegOut, txId, ctx.accepted);

    expect(confirmed).toBe(false);
    expect(fetchedTx).toBe(false);
  });

  it('confirms a same-transaction ingest settlement by committing DUP and SPV history', async () => {
    const ctx = setup();
    const reducerCalls: any[][] = [];
    const confirmedTx = await confirmedAggregateTx(ctx, undefined, [ctx.accepted]);
    const txId = confirmedTx.id;
    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction),
      state: {
        ...submittedAggregateTx(txId, {
          mode: 'single-with-ingest',
          confirm: (...args: any[]) => {
            reducerCalls.push(args);
            return true;
          },
        }),
      },
      deployed: ctx.deployed,
      verifySidechainBurn: async () => 'confirmed',
    } as any);

    const confirmed = await service.confirmSingleClaimSettlement(
      ctx.pegOut,
      txId,
      ctx.accepted,
    );

    expect(confirmed).toBe(true);
    expect(reducerCalls).toHaveLength(1);
    expect(reducerCalls[0].slice(0, 4)).toEqual([
      txId,
      1,
      'single-with-ingest',
      ctx.pegOut.sidechainTxHash,
    ]);
    expectFinalObservation(reducerCalls[0][4], txId);
    expect(reducerCalls[0][5]).toBe(getSpvTrackerDigest([
      toSpvTrackerHistoryEntry(ctx.accepted),
    ]));
    expect(reducerCalls[0][6].keyHex).toHaveLength(64);
    expect(reducerCalls[0][6].valueHex).toHaveLength(72);
    expect(reducerCalls[0][6].sidechainHeight).toBe(ctx.accepted.sidechainHeight);
    expect(reducerCalls[0][6].sidechainHeaderHash).toBe(ctx.accepted.sidechainHeaderHashHex);
  });

  it('rejects tracker ingest that is not committed by the confirmed tracker successor R5', async () => {
    const ctx = setup();
    const confirmedTx = await confirmedAggregateTx(ctx);
    const reducerCalls: any[][] = [];
    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction),
      state: {
        ...submittedAggregateTx(confirmedTx.id, {
          mode: 'single-with-ingest',
          confirm: (...args: any[]) => {
            reducerCalls.push(args);
            return false;
          },
        }),
      },
      deployed: ctx.deployed,
      verifySidechainBurn: async () => 'confirmed',
    } as any);

    expect(await service.confirmSingleClaimSettlement(
      ctx.pegOut,
      confirmedTx.id,
      ctx.accepted,
    )).toBe(false);
    expect(reducerCalls).toHaveLength(1);
    expect(reducerCalls[0][5]).toBe(getSpvTrackerDigest([]));
    expect(reducerCalls[0][6]).toMatchObject({
      sidechainHeight: ctx.accepted.sidechainHeight,
      sidechainHeaderHash: ctx.accepted.sidechainHeaderHashHex,
    });
  });

  it('does not reconcile state for an unrelated confirmed transaction id', async () => {
    const ctx = setup();
    const confirmedTx = await confirmedAggregateTx(ctx);
    let fetchedTx = false;
    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction, {
        onTransactionRead: () => { fetchedTx = true; },
      }),
      state: {
        ...submittedAggregateTx('76'.repeat(32)),
      },
      deployed: ctx.deployed,
    } as any);

    const confirmed = await service.confirmSingleClaimSettlement(ctx.pegOut, confirmedTx.id);

    expect(confirmed).toBe(false);
    expect(fetchedTx).toBe(false);
  });

  it('does not reconcile a confirmed settlement when the payout value is too low', async () => {
    const ctx = setup();
    const reducerCalls: any[][] = [];
    const confirmedTx = await confirmedAggregateTx(ctx, {
      ergoTree: recipientTreeHex,
      value: Number(ctx.pegOut.amount) - 1,
      assets: [],
    });
    const txId = confirmedTx.id;
    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction),
      state: {
        ...submittedAggregateTx(txId, {
          confirm: (...args: any[]) => {
            reducerCalls.push(args);
            return true;
          },
        }),
      },
      deployed: ctx.deployed,
      verifySidechainBurn: async () => 'confirmed',
    } as any);

    const confirmed = await service.confirmSingleClaimSettlement(ctx.pegOut, txId);

    expect(confirmed).toBe(false);
    expect(reducerCalls).toEqual([]);
  });

  it('does not reconcile a confirmed settlement when the payout recipient is wrong', async () => {
    const ctx = setup();
    const reducerCalls: any[][] = [];
    const wrongRecipientTree = '0008cd02' + '66'.repeat(32);
    const confirmedTx = await confirmedAggregateTx(ctx, {
      ergoTree: wrongRecipientTree,
      value: Number(ctx.pegOut.amount),
      assets: [],
    });
    const txId = confirmedTx.id;
    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction),
      state: {
        ...submittedAggregateTx(txId, {
          confirm: (...args: any[]) => {
            reducerCalls.push(args);
            return true;
          },
        }),
      },
      deployed: ctx.deployed,
      verifySidechainBurn: async () => 'confirmed',
    } as any);

    const confirmed = await service.confirmSingleClaimSettlement(ctx.pegOut, txId);

    expect(confirmed).toBe(false);
    expect(reducerCalls).toEqual([]);
  });

  it('delegates confirmation replay to the atomic reducer without legacy mutations', async () => {
    const ctx = setup();
    const reducerCalls: any[][] = [];
    const confirmedTx = await confirmedAggregateTx(ctx);
    const txId = confirmedTx.id;
    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction),
      state: {
        ...submittedAggregateTx(txId, {
          attemptOverrides: { status: 'confirmed' },
          confirm: (...args: any[]) => {
            reducerCalls.push(args);
            return true;
          },
        }),
      },
      deployed: ctx.deployed,
      verifySidechainBurn: async () => 'confirmed',
    } as any);

    const confirmed = await service.confirmSingleClaimSettlement(ctx.pegOut, txId);

    expect(confirmed).toBe(true);
    expect(reducerCalls).toHaveLength(1);
    expectFinalObservation(reducerCalls[0][4], txId);
  });
});

describe('AggregateSettlementService — batch mode', () => {
  function batchDeployedState(): any {
    return {
      ...deployedState(),
      doubleUnlockPreventionAggregateBatch: {
        nftId: 'dd'.repeat(32),
        boxId: '05'.repeat(32),
        address: 'batch-dup',
        ergoTreeHex: '1013',
      },
      mainChainAggregateUnlockBatch: {
        address: 'batch-unlock',
        ergoTreeHex: '1014',
      },
    };
  }

  it('rejects batch preparation when batch DUP deployment is missing', async () => {
    const ctx = setup();
    const deployed = { ...ctx.deployed, doubleUnlockPreventionAggregateBatch: undefined };
    const service = new AggregateSettlementService({
      ergo: {} as any,
      state: ctx.state,
      deployed,
    } as any);

    await expect(service.prepareBatchClaims({
      claims: [
        { pegOut: ctx.pegOut, trackerIdentity: { sidechainIdHex, sidechainHeight: ctx.accepted.sidechainHeight, sidechainHeaderHashHex: ctx.accepted.sidechainHeaderHashHex } },
        { pegOut: { ...ctx.pegOut, sidechainTxHash: 'aa'.repeat(32) }, trackerIdentity: { sidechainIdHex, sidechainHeight: ctx.accepted.sidechainHeight, sidechainHeaderHashHex: ctx.accepted.sidechainHeaderHashHex } },
      ],
    })).rejects.toThrow(/doubleUnlockPreventionAggregateBatch/);
  });

  it('rejects batch preparation when batch unlock deployment is missing', async () => {
    const ctx = setup();
    const deployed = {
      ...ctx.deployed,
      doubleUnlockPreventionAggregateBatch: {
        nftId: 'dd'.repeat(32),
        boxId: '05'.repeat(32),
        address: 'batch-dup',
        ergoTreeHex: '1013',
      },
      mainChainAggregateUnlockBatch: undefined,
    };
    const service = new AggregateSettlementService({
      ergo: {} as any,
      state: ctx.state,
      deployed,
    } as any);

    await expect(service.prepareBatchClaims({
      claims: [
        { pegOut: ctx.pegOut, trackerIdentity: { sidechainIdHex, sidechainHeight: ctx.accepted.sidechainHeight, sidechainHeaderHashHex: ctx.accepted.sidechainHeaderHashHex } },
        { pegOut: { ...ctx.pegOut, sidechainTxHash: 'aa'.repeat(32) }, trackerIdentity: { sidechainIdHex, sidechainHeight: ctx.accepted.sidechainHeight, sidechainHeaderHashHex: ctx.accepted.sidechainHeaderHashHex } },
      ],
    })).rejects.toThrow(/mainChainAggregateUnlockBatch/);
  });

  it('prepares a 2-claim batch settlement TX from live boxes', async () => {
    const deployed = batchDeployedState();
    const burnTxIdHex1 = '55'.repeat(32);
    const burnTxIdHex2 = '66'.repeat(32);
    const amount = 1_000_000n;
    const root1 = deriveAggregateBurnEventRoot(burnTxIdHex1, recipientTreeHex, amount);
    const root2 = deriveAggregateBurnEventRoot(burnTxIdHex2, recipientTreeHex, amount);
    const e1 = entry(1, root1);
    const e2 = entry(2, root2);
    const spvHistory = [toSpvTrackerHistoryEntry(e1), toSpvTrackerHistoryEntry(e2)];

    const trackerBox = box('10'.repeat(32), deployed.spvTracker.ergoTreeHex, {
      R4: encodeLongRegister(0),
      R5: encodeSpvTrackerAvlRegister(getSpvTrackerDigest(spvHistory)),
      R6: committee,
      R7: encodeLongRegister(Number(e2.sidechainHeight)),
    }, deployed.spvTracker.nftId, 1_000_000);

    const batchDupBox = box('21'.repeat(32), deployed.doubleUnlockPreventionAggregateBatch.ergoTreeHex, {
      R4: encodeLongRegister(0),
      R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
      R6: committee,
    }, deployed.doubleUnlockPreventionAggregateBatch.nftId, 1_000_000);

    const unlockBox = box('30'.repeat(32), deployed.mainChainAggregateUnlockBatch.ergoTreeHex, {}, undefined, 3_100_000);

    const ergo = {
      addressToTree: async () => { throw new Error('should not be called'); },
      getCurrentHeight: async () => 330200,
      findSingletonBox: async (tokenId: string) => {
        if (tokenId === deployed.spvTracker.nftId) return trackerBox;
        if (tokenId === deployed.doubleUnlockPreventionAggregateBatch.nftId) return batchDupBox;
        throw new Error(`unexpected token ${tokenId}`);
      },
      getUnspentBoxesByAddress: async () => [unlockBox],
    };

    const service = new AggregateSettlementService({
      ergo,
      state: { getSpvTrackerHistory: () => spvHistory, getAllAvlKeys: () => [] },
      deployed,
    } as any);

    const prepared = await service.prepareBatchClaims({
      claims: [
        { pegOut: { user: '0x01', amount, ergoRecipientAddress: recipientTreeHex, sidechainTxHash: burnTxIdHex1, sidechainBlockNumber: Number(e1.sidechainHeight) }, trackerIdentity: { sidechainIdHex, sidechainHeight: e1.sidechainHeight, sidechainHeaderHashHex: e1.sidechainHeaderHashHex } },
        { pegOut: { user: '0x01', amount, ergoRecipientAddress: recipientTreeHex, sidechainTxHash: burnTxIdHex2, sidechainBlockNumber: Number(e2.sidechainHeight) }, trackerIdentity: { sidechainIdHex, sidechainHeight: e2.sidechainHeight, sidechainHeaderHashHex: e2.sidechainHeaderHashHex } },
      ],
    });

    expect(prepared.claimCount).toBe(2);
    expect(prepared.eip12Tx.inputs).toHaveLength(3);
    // 2 payouts
    const payoutOutputs = prepared.eip12Tx.outputs.filter((o: any) => o.ergoTree === recipientTreeHex);
    expect(payoutOutputs).toHaveLength(2);
    // tracker + DUP successors
    expect(prepared.eip12Tx.outputs[0].assets[0].tokenId).toBe(deployed.spvTracker.nftId);
    expect(prepared.eip12Tx.outputs[1].assets[0].tokenId).toBe(deployed.doubleUnlockPreventionAggregateBatch.nftId);
  });

  it('confirms a batch settlement by reconciling all DUP keys and statuses', async () => {
    const deployed = batchDeployedState();
    const confirmedTx = await confirmedBatchTx(deployed);
    const txId = confirmedTx.id;
    const events: string[] = [];
    const reducerCalls: any[][] = [];
    const pegOuts = [
      { user: '0x01', amount: 1_000_000n, ergoRecipientAddress: recipientTreeHex, sidechainTxHash: '55'.repeat(32), sidechainBlockNumber: 1001 },
      { user: '0x01', amount: 1_000_000n, ergoRecipientAddress: recipientTreeHex, sidechainTxHash: '66'.repeat(32), sidechainBlockNumber: 1002 },
    ];

    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction, { events }),
      state: {
        ...submittedBatchTx(txId, undefined, {
          confirm: (...args: any[]) => {
            reducerCalls.push(args);
            events.push('state:confirm');
            return true;
          },
        }),
      },
      deployed,
      verifySidechainBurn: async (pegOut: ParsedPegOut) => {
        events.push(`sidechain:burn:${pegOut.sidechainTxHash}`);
        return 'confirmed';
      },
    } as any);

    const confirmed = await service.confirmBatchSettlement(pegOuts as any, txId);
    expect(confirmed).toBe(true);
    expect(events.slice(0, 2)).toEqual([
      `sidechain:burn:${'55'.repeat(32)}`,
      `sidechain:burn:${'66'.repeat(32)}`,
    ]);
    expect(events.filter(event => event.startsWith('sidechain:burn:'))).toHaveLength(4);
    expect(events.indexOf('ergo:tip-height')).toBeGreaterThan(1);
    expect(events.at(-1)).toBe('state:confirm');
    expect(reducerCalls).toHaveLength(1);
    expect(reducerCalls[0].slice(0, 3)).toEqual([
      txId,
      1,
      ['55'.repeat(32), '66'.repeat(32)],
    ]);
    expectFinalObservation(reducerCalls[0][3], txId);
    expect(reducerCalls[0][4]).toBe(getSpvTrackerDigest([]));
    expect(reducerCalls[0][5]).toBeUndefined();
    expect(reducerCalls[0][6]).toEqual(['55'.repeat(32), '66'.repeat(32)]);
  });

  it('rechecks every batch burn after Ergo observation before the atomic reducer', async () => {
    const deployed = batchDeployedState();
    const confirmedTx = await confirmedBatchTx(deployed);
    const events: string[] = [];
    const reducerCalls: any[][] = [];
    const statusUpdates: any[][] = [];
    const burnStatuses = ['confirmed', 'confirmed', 'confirmed', 'reverted'] as const;
    let burnRead = 0;
    const pegOuts = [
      { user: '0x01', amount: 1_000_000n, ergoRecipientAddress: recipientTreeHex, sidechainTxHash: '55'.repeat(32), sidechainBlockNumber: 1001 },
      { user: '0x01', amount: 1_000_000n, ergoRecipientAddress: recipientTreeHex, sidechainTxHash: '66'.repeat(32), sidechainBlockNumber: 1002 },
    ];
    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction, { events }),
      state: {
        ...submittedBatchTx(confirmedTx.id, undefined, {
          confirm: (...args: any[]) => {
            reducerCalls.push(args);
            return true;
          },
        }),
        updatePegOutStatus: (...args: any[]) => statusUpdates.push(args),
      },
      deployed,
      verifySidechainBurn: async (pegOut: ParsedPegOut) => {
        events.push(`sidechain:burn:${pegOut.sidechainTxHash}`);
        return burnStatuses[Math.min(burnRead++, burnStatuses.length - 1)];
      },
    } as any);

    expect(await service.confirmBatchSettlement(pegOuts as any, confirmedTx.id)).toBe(false);
    expect(events.filter(event => event.startsWith('sidechain:burn:'))).toHaveLength(4);
    expect(events.indexOf('ergo:transaction')).toBeGreaterThan(1);
    expect(events.lastIndexOf(`sidechain:burn:${'66'.repeat(32)}`)).toBeGreaterThan(
      events.indexOf('ergo:transaction'),
    );
    expect(reducerCalls).toEqual([]);
    expect(statusUpdates).toEqual([['66'.repeat(32), 'burn_reverted']]);
  });

  it('rejects batch tracker ingest that is not committed by tracker output zero', async () => {
    const deployed = batchDeployedState();
    const confirmedTx = await confirmedBatchTx(deployed);
    const trackerIngest = entry(3, 'ab'.repeat(32));
    const reducerCalls: any[][] = [];
    const pegOuts = [
      { user: '0x01', amount: 1_000_000n, ergoRecipientAddress: recipientTreeHex, sidechainTxHash: '55'.repeat(32), sidechainBlockNumber: 1001 },
      { user: '0x01', amount: 1_000_000n, ergoRecipientAddress: recipientTreeHex, sidechainTxHash: '66'.repeat(32), sidechainBlockNumber: 1002 },
    ];
    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction),
      state: {
        ...submittedBatchTx(confirmedTx.id, undefined, {
          confirm: (...args: any[]) => {
            reducerCalls.push(args);
            return false;
          },
        }),
      },
      deployed,
      verifySidechainBurn: async () => 'confirmed',
    } as any);

    expect(await service.confirmBatchSettlement(
      pegOuts as any,
      confirmedTx.id,
      trackerIngest,
    )).toBe(false);
    expect(reducerCalls).toHaveLength(1);
    expect(reducerCalls[0][4]).toBe(getSpvTrackerDigest([]));
    expect(reducerCalls[0][5]).toMatchObject({
      sidechainHeight: trackerIngest.sidechainHeight,
      sidechainHeaderHash: trackerIngest.sidechainHeaderHashHex,
    });
  });

  it('rejects a batch confirmation response whose transaction ID drifts from the journal', async () => {
    const deployed = batchDeployedState();
    const txId = '93'.repeat(32);
    const observedTx = await confirmedBatchTx(deployed);
    const pegOuts = [
      { user: '0x01', amount: 1_000_000n, ergoRecipientAddress: recipientTreeHex, sidechainTxHash: '55'.repeat(32), sidechainBlockNumber: 1001 },
      { user: '0x01', amount: 1_000_000n, ergoRecipientAddress: recipientTreeHex, sidechainTxHash: '66'.repeat(32), sidechainBlockNumber: 1002 },
    ];
    const mutations: string[] = [];
    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(observedTx.transaction),
      state: {
        ...submittedBatchTx(txId, undefined, {
          confirm: () => {
            mutations.push('confirmed');
            return true;
          },
        }),
      },
      deployed,
      verifySidechainBurn: async () => 'confirmed',
    } as any);

    await expect(service.confirmBatchSettlement(pegOuts as any, txId)).rejects.toThrow(
      /transaction ID does not match the journal/,
    );
    expect(mutations).toEqual([]);
  });

  it('does not confirm a batch settlement with only nine Ergo confirmations', async () => {
    const deployed = batchDeployedState();
    const confirmedTx = await confirmedBatchTx(deployed);
    const txId = confirmedTx.id;
    const pegOuts = [
      { user: '0x01', amount: 1_000_000n, ergoRecipientAddress: recipientTreeHex, sidechainTxHash: '55'.repeat(32), sidechainBlockNumber: 1001 },
      { user: '0x01', amount: 1_000_000n, ergoRecipientAddress: recipientTreeHex, sidechainTxHash: '66'.repeat(32), sidechainBlockNumber: 1002 },
    ];
    const reducerCalls: any[][] = [];
    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction, {
        inclusionHeight: stableErgoTipHeight - 8,
      }),
      state: {
        ...submittedBatchTx(txId, undefined, {
          confirm: (...args: any[]) => {
            reducerCalls.push(args);
            return true;
          },
        }),
      },
      deployed,
      verifySidechainBurn: async () => 'confirmed',
    } as any);

    expect(await service.confirmBatchSettlement(pegOuts as any, txId)).toBe(false);
    expect(reducerCalls).toEqual([]);
  });

  it.each([
    ['legacy-unbound recovery', {
      recoveryBindingStatus: 'legacy_unbound' as const,
      recoveryPolicyVersion: null,
      recoveryRequiredConfirmations: null,
    }],
    ['single mode', { mode: 'single' as const }],
    ['different submitted transaction', { submittedTxId: '95'.repeat(32) }],
  ])('rejects a batch confirmation with %s before observing burns or Ergo', async (_label, attemptOverrides) => {
    const deployed = batchDeployedState();
    const confirmedTx = await confirmedBatchTx(deployed);
    const txId = confirmedTx.id;
    const pegOuts = [
      { user: '0x01', amount: 1_000_000n, ergoRecipientAddress: recipientTreeHex, sidechainTxHash: '55'.repeat(32), sidechainBlockNumber: 1001 },
      { user: '0x01', amount: 1_000_000n, ergoRecipientAddress: recipientTreeHex, sidechainTxHash: '66'.repeat(32), sidechainBlockNumber: 1002 },
    ];
    const ergoEvents: string[] = [];
    const reducerCalls: any[][] = [];
    let burnChecks = 0;
    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction, { events: ergoEvents }),
      state: {
        ...submittedBatchTx(txId, undefined, {
          attemptOverrides,
          confirm: (...args: any[]) => {
            reducerCalls.push(args);
            return true;
          },
        }),
      },
      deployed,
      verifySidechainBurn: async () => {
        burnChecks += 1;
        return 'confirmed';
      },
    } as any);

    expect(await service.confirmBatchSettlement(pegOuts as any, txId)).toBe(false);
    expect(burnChecks).toBe(0);
    expect(ergoEvents).toEqual([]);
    expect(reducerCalls).toEqual([]);
  });

  it('marks a reverted batch burn without reconciling any batch claim', async () => {
    const deployed = batchDeployedState();
    const confirmedTx = await confirmedBatchTx(deployed);
    const statusUpdates: any[] = [];
    const ergoEvents: string[] = [];
    const reducerCalls: any[][] = [];
    const txId = confirmedTx.id;
    const pegOuts = [
      { user: '0x01', amount: 1_000_000n, ergoRecipientAddress: recipientTreeHex, sidechainTxHash: '55'.repeat(32), sidechainBlockNumber: 1001 },
      { user: '0x01', amount: 1_000_000n, ergoRecipientAddress: recipientTreeHex, sidechainTxHash: '66'.repeat(32), sidechainBlockNumber: 1002 },
    ];

    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction, { events: ergoEvents }),
      state: {
        ...submittedBatchTx(txId, undefined, {
          confirm: (...args: any[]) => {
            reducerCalls.push(args);
            return true;
          },
        }),
        updatePegOutStatus: (...args: any[]) => statusUpdates.push(args),
      },
      deployed,
      verifySidechainBurn: async (pegOut: ParsedPegOut) =>
        pegOut.sidechainTxHash === '66'.repeat(32) ? 'reverted' : 'confirmed',
    } as any);

    const confirmed = await service.confirmBatchSettlement(pegOuts as any, txId);

    expect(confirmed).toBe(false);
    expect(ergoEvents).toEqual([]);
    expect(reducerCalls).toEqual([]);
    expect(statusUpdates).toEqual([['66'.repeat(32), 'burn_reverted']]);
  });

  it('observes every batch burn before applying a reverted-burn mutation', async () => {
    const deployed = batchDeployedState();
    const confirmedTx = await confirmedBatchTx(deployed);
    const txId = confirmedTx.id;
    const pegOuts = [
      { user: '0x01', amount: 1_000_000n, ergoRecipientAddress: recipientTreeHex, sidechainTxHash: '55'.repeat(32), sidechainBlockNumber: 1001 },
      { user: '0x01', amount: 1_000_000n, ergoRecipientAddress: recipientTreeHex, sidechainTxHash: '66'.repeat(32), sidechainBlockNumber: 1002 },
    ];
    const observations: string[] = [];
    const statusUpdates: any[] = [];
    const ergoEvents: string[] = [];
    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction, { events: ergoEvents }),
      state: {
        ...submittedBatchTx(txId, undefined, {
          confirm: () => {
            throw new Error('reverted burn must not reconcile batch state');
          },
        }),
        updatePegOutStatus: (...args: any[]) => {
          expect(observations).toEqual(['55'.repeat(32), '66'.repeat(32)]);
          statusUpdates.push(args);
        },
      },
      deployed,
      verifySidechainBurn: async (pegOut: ParsedPegOut) => {
        observations.push(pegOut.sidechainTxHash);
        return pegOut.sidechainTxHash === '55'.repeat(32) ? 'reverted' : 'confirmed';
      },
    } as any);

    expect(await service.confirmBatchSettlement(pegOuts as any, txId)).toBe(false);
    expect(ergoEvents).toEqual([]);
    expect(statusUpdates).toEqual([['55'.repeat(32), 'burn_reverted']]);
  });

  it('rejects a correct-looking batch confirmation when journal burn order differs', async () => {
    const deployed = batchDeployedState();
    const confirmedTx = await confirmedBatchTx(deployed);
    const txId = confirmedTx.id;
    let fetchedTx = false;
    let burnChecks = 0;
    const pegOuts = [
      { user: '0x01', amount: 1_000_000n, ergoRecipientAddress: recipientTreeHex, sidechainTxHash: '55'.repeat(32), sidechainBlockNumber: 1001 },
      { user: '0x01', amount: 1_000_000n, ergoRecipientAddress: recipientTreeHex, sidechainTxHash: '66'.repeat(32), sidechainBlockNumber: 1002 },
    ];

    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction, {
        onTransactionRead: () => { fetchedTx = true; },
      }),
      state: {
        ...submittedBatchTx(txId, ['66'.repeat(32), '55'.repeat(32)], {
          confirm: () => {
            throw new Error('journal-mismatched batch must not mutate');
          },
        }),
      },
      deployed,
      verifySidechainBurn: async () => {
        burnChecks += 1;
        return 'confirmed';
      },
    } as any);

    const confirmed = await service.confirmBatchSettlement(pegOuts as any, txId);

    expect(confirmed).toBe(false);
    expect(fetchedTx).toBe(false);
    expect(burnChecks).toBe(0);
  });

  it('rejects batch confirmation when two same-recipient claims share one payout output (multiset collision)', async () => {
    const deployed = batchDeployedState();
    const reducerCalls: any[][] = [];
    const confirmedTx = await confirmedBatchTx(deployed, [
      { ergoTree: recipientTreeHex, value: 1_000_000, assets: [] },
      { ergoTree: '1005d2e41400', value: 1_100_000, assets: [] },
    ]);
    const txId = confirmedTx.id;
    const pegOuts = [
      { user: '0x01', amount: 1_000_000n, ergoRecipientAddress: recipientTreeHex, sidechainTxHash: '55'.repeat(32), sidechainBlockNumber: 1001 },
      { user: '0x01', amount: 1_000_000n, ergoRecipientAddress: recipientTreeHex, sidechainTxHash: '66'.repeat(32), sidechainBlockNumber: 1002 },
    ];

    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction),
      state: {
        ...submittedBatchTx(txId, undefined, {
          confirm: (...args: any[]) => {
            reducerCalls.push(args);
            return true;
          },
        }),
      },
      deployed,
      verifySidechainBurn: async () => 'confirmed',
    } as any);

    const confirmed = await service.confirmBatchSettlement(pegOuts as any, txId);
    expect(confirmed).toBe(false);
    expect(reducerCalls).toEqual([]);
  });

  it('rejects partial batch confirmation without committing earlier successful claims', async () => {
    const deployed = batchDeployedState();
    const reducerCalls: any[][] = [];
    const wrongRecipientTree = '0008cd02' + '77'.repeat(32);
    const confirmedTx = await confirmedBatchTx(deployed, [
      { ergoTree: recipientTreeHex, value: 1_000_000, assets: [] },
      { ergoTree: wrongRecipientTree, value: 1_000_000, assets: [] },
    ]);
    const txId = confirmedTx.id;
    const pegOuts = [
      { user: '0x01', amount: 1_000_000n, ergoRecipientAddress: recipientTreeHex, sidechainTxHash: '55'.repeat(32), sidechainBlockNumber: 1001 },
      { user: '0x01', amount: 1_000_000n, ergoRecipientAddress: recipientTreeHex, sidechainTxHash: '66'.repeat(32), sidechainBlockNumber: 1002 },
    ];

    const service = new AggregateSettlementService({
      ergo: stableConfirmedErgoClient(confirmedTx.transaction),
      state: {
        ...submittedBatchTx(txId, undefined, {
          confirm: (...args: any[]) => {
            reducerCalls.push(args);
            return true;
          },
        }),
      },
      deployed,
      verifySidechainBurn: async () => 'confirmed',
    } as any);

    const confirmed = await service.confirmBatchSettlement(pegOuts as any, txId);
    expect(confirmed).toBe(false);
    expect(reducerCalls).toEqual([]);
  });

  it('does not introduce node wallet signing surface in the service', async () => {
    // Check that the production service module does not reference node wallet signing.
    // String is split to avoid triggering the node-wallet-isolation test.
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const sourceFile = path.resolve(currentDir, 'aggregate-settlement-service.ts');
    const source = fs.readFileSync(sourceFile, 'utf-8');
    const forbidden = '/wallet/transaction' + '/sign';
    expect(source).not.toContain(forbidden);
  });
});
