import { describe, expect, it } from 'vitest';

import {
  collectFrontierReturnedReceiptBurnSetFromDistinctSources,
  type FrontierBurnProofProvider,
  type FrontierReturnedReceiptBurnSetAgreement,
} from './frontier-burn-proof-source.js';
import { FRONTIER_PEG_OUT_TOPIC } from './frontier-bridge-event-root.js';
import { sha256CanonicalJson } from './strict-json.js';
import {
  buildValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture,
} from './validity-application-pooled-reserve-historical-dup-lineage-v4-fixture.js';
import {
  assertValidityApplicationPooledReserveSourceAdmissionCandidateV4Provenance,
  buildValidityApplicationPooledReserveSourceAdmissionCandidateV4,
  validateValidityApplicationPooledReserveSourceAdmissionCandidateV4Bindings,
  VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_ADMISSION_CANDIDATE_V4_SCHEMA,
} from './validity-application-pooled-reserve-source-admission-candidate-v4.js';

const BLOCK_NUMBER = 77;
const BLOCK_HASH = `0x${'ab'.repeat(32)}`;
const SIDECHAIN_ID = `0x${'22'.repeat(32)}`;
const BRIDGE_ADDRESS = `0x${'33'.repeat(20)}`;
const RECIPIENT_TREE =
  '0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

describe('pooled-reserve V4 source-admission candidate', () => {
  it('binds returned Frontier events to the exact V4 statement, settlement, and replay lineage', async () => {
    const historicalJoin =
      await buildValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture();
    const burnSetAgreement = await buildAgreement();
    const first =
      buildValidityApplicationPooledReserveSourceAdmissionCandidateV4({
        historicalJoin,
        burnSetAgreement,
      });
    const second =
      buildValidityApplicationPooledReserveSourceAdmissionCandidateV4({
        historicalJoin,
        burnSetAgreement,
      });

    expect(second.candidateDigestHex).toBe(first.candidateDigestHex);
    expect(first.schema).toBe(
      VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_ADMISSION_CANDIDATE_V4_SCHEMA,
    );
    expect(first.status).toBe('non_authorizing_source_admission_candidate');
    expect(() =>
      assertValidityApplicationPooledReserveSourceAdmissionCandidateV4Provenance(
        first,
      )).not.toThrow();
    expect(first.application).toMatchObject({
      lineageProfileIdHex:
        historicalJoin.settlementFixture.compiledInstance.lineageProfileIdHex
          .slice(2),
      sidechainIdHex: SIDECHAIN_ID.slice(2),
      bridgeAddress: BRIDGE_ADDRESS,
      applicationBindingDigestHex:
        historicalJoin.bindings.applicationBindingDigestHex,
    });
    expect(first.checkpoint).toMatchObject({
      sidechainHeight: String(BLOCK_NUMBER),
      executionBlockHashHex: BLOCK_HASH.slice(2),
      bridgeEventRootHex: burnSetAgreement.view.bridgeEventRootHex,
      burnLeafCount: 3,
      extensionKeyHex: '0401',
    });
    expect(first.mappedBurn).toMatchObject({
      transactionIndex: 1,
      logIndex: 1,
      eventIndex: 1,
      burnIdHex: historicalJoin.bindings.burnIdHex,
      burnLeafHex: historicalJoin.bindings.burnLeafHex,
      recipientErgoTreeHex: RECIPIENT_TREE,
      amountNanoErg: '10000000',
      leafIndex: 1,
      leafCount: 3,
    });
    expect(first.settlement).toMatchObject({
      payoutBoxIdHex: historicalJoin.bindings.payoutBoxIdHex,
      settlementTransactionIdHex:
        historicalJoin.bindings.settlementTransactionIdHex,
    });
    expect(first.replay).toMatchObject({
      duplicatePreventionKeyHex: historicalJoin.bindings.burnIdHex,
      predecessorBoxIdHex:
        historicalJoin.bindings.duplicatePreventionPredecessorBoxIdHex,
      successorBoxIdHex:
        historicalJoin.bindings.duplicatePreventionSuccessorBoxIdHex,
    });
    expect(first.boundaries).toEqual({
      exactReturnedEventSetBound: true,
      exactApplicationStatementBound: true,
      exactCheckpointSemanticsBound: true,
      exactSettlementAndReplayLineageBound: true,
      distinctSourceInstancesVerified: true,
      receiptArrayCompletenessAuthenticated: false,
      eventApplicationRuntimeCodeAuthenticated: false,
      operationalIndependenceEstablished: false,
      canonicalEventMappingEstablished: false,
      sourceAdmissionEstablished: false,
      sidechainFinalityEstablished: false,
      proofSystemActivated: false,
      targetNodeAcceptanceEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
    });
  });

  it('rejects cloned producers and exact source/event mix-and-match', async () => {
    const historicalJoin =
      await buildValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture();
    const agreement = await buildAgreement();
    expect(() =>
      buildValidityApplicationPooledReserveSourceAdmissionCandidateV4({
        historicalJoin: structuredClone(historicalJoin),
        burnSetAgreement: agreement,
      })).toThrow(/must be built in this process/);
    expect(() =>
      buildValidityApplicationPooledReserveSourceAdmissionCandidateV4({
        historicalJoin,
        burnSetAgreement: structuredClone(agreement),
      })).toThrow(/provenance is missing/);

    const mismatches: readonly [
      Promise<Readonly<FrontierReturnedReceiptBurnSetAgreement>>,
      RegExp,
    ][] = [
      [buildAgreement({ sidechainIdHex: `0x${'99'.repeat(32)}` }), /sidechain ID/],
      [
        buildAgreement({
          bridgeAddress: `0x${'88'.repeat(20)}`,
          receiptBridgeAddress: `0x${'88'.repeat(20)}`,
        }),
        /bridge address/,
      ],
      [buildAgreement({ blockNumber: 78 }), /sidechain height/],
      [buildAgreement({ amounts: [1_000_000n, 9_000_000n, 1_000_000n] }), /bridge event root/],
    ];
    for (const [pendingAgreement, error] of mismatches) {
      const mismatchedAgreement = await pendingAgreement;
      expect(() =>
        buildValidityApplicationPooledReserveSourceAdmissionCandidateV4({
          historicalJoin,
          burnSetAgreement: mismatchedAgreement,
        })).toThrow(error);
    }

    const candidate =
      buildValidityApplicationPooledReserveSourceAdmissionCandidateV4({
        historicalJoin,
        burnSetAgreement: agreement,
      });
    expect(() =>
      assertValidityApplicationPooledReserveSourceAdmissionCandidateV4Provenance(
        structuredClone(candidate),
      )).toThrow(/must be built in this process/);

    const isolatedMutations: readonly [string, (value: any) => void][] = [
      ['token address', value => { value.application.tokenAddress = `0x${'77'.repeat(20)}`; }],
      ['bridge runtime code hash', value => {
        value.application.bridgeRuntimeCodeSha256Hex = '76'.repeat(32);
      }],
      ['token runtime code hash', value => {
        value.application.tokenRuntimeCodeSha256Hex = '75'.repeat(32);
      }],
      ['consensus block hash', value => {
        value.checkpoint.sidechainConsensusBlockHashHex = '74'.repeat(32);
      }],
      ['execution block hash', value => {
        value.checkpoint.executionBlockHashHex = '73'.repeat(32);
      }],
      ['checkpoint commitment', value => {
        value.checkpoint.checkpointCommitmentHex = '72'.repeat(32);
      }],
      ['tracker value', value => {
        value.settlement.trackerValueHex = `${value.settlement.trackerValueHex.slice(0, -2)}00`;
      }],
      ['settlement transaction', value => {
        value.settlement.settlementTransactionIdHex = '71'.repeat(32);
      }],
      ['burn recipient', value => {
        value.mappedBurn.recipientErgoTreeHex = `0008cd02${'70'.repeat(32)}`;
      }],
      ['DUP predecessor', value => {
        value.replay.predecessorBoxIdHex = '69'.repeat(32);
      }],
      ['DUP successor', value => {
        value.replay.successorBoxIdHex = '68'.repeat(32);
      }],
    ];
    for (const [label, mutate] of isolatedMutations) {
      const mutated = structuredClone(candidate) as any;
      mutate(mutated);
      expect(() =>
        validateValidityApplicationPooledReserveSourceAdmissionCandidateV4Bindings(
          { historicalJoin, burnSetAgreement: agreement },
          mutated,
        )).toThrow(new RegExp(label));
    }

    const selfConsistentForgeries: readonly ((value: any) => void)[] = [
      value => { value.boundaries.sourceAdmissionEstablished = true; },
      value => { value.boundaries.fundsAuthorityEstablished = true; },
      value => { value.mappedBurn.burnIdHex = '67'.repeat(32); },
      value => { value.mappedBurn.amountNanoErg = '9999999'; },
      value => { value.settlement.trackerKeyHex = '66'.repeat(32); },
      value => { value.settlement.payoutBoxIdHex = '65'.repeat(32); },
      value => { value.replay.duplicatePreventionKeyHex = '64'.repeat(32); },
      value => { value.replay.inputDigestHex = '63'.repeat(33); },
      value => { value.replay.outputDigestHex = '62'.repeat(33); },
      value => {
        value.replay.historicalTransitionContextDigestHex = '61'.repeat(32);
      },
    ];
    for (const mutate of selfConsistentForgeries) {
      const forged = structuredClone(candidate) as any;
      mutate(forged);
      const { candidateDigestHex: _discarded, ...binding } = forged;
      forged.candidateDigestHex = sha256CanonicalJson(
        binding,
        'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_ADMISSION_CANDIDATE_V4',
      );
      expect(() =>
        validateValidityApplicationPooledReserveSourceAdmissionCandidateV4Bindings(
          { historicalJoin, burnSetAgreement: agreement },
          forged,
        )).toThrow(/does not exactly match process-provenant producers/);
    }
  });
});

interface AgreementOverrides {
  readonly sidechainIdHex?: string;
  readonly bridgeAddress?: string;
  readonly receiptBridgeAddress?: string;
  readonly blockNumber?: number;
  readonly blockHash?: string;
  readonly amounts?: readonly [bigint, bigint, bigint];
}

async function buildAgreement(
  overrides: AgreementOverrides = {},
): Promise<Readonly<FrontierReturnedReceiptBurnSetAgreement>> {
  const blockNumber = overrides.blockNumber ?? BLOCK_NUMBER;
  const blockHash = overrides.blockHash ?? BLOCK_HASH;
  const bridgeAddress = overrides.bridgeAddress ?? BRIDGE_ADDRESS;
  const receipts = buildReceipts({
    blockNumber,
    blockHash,
    bridgeAddress: overrides.receiptBridgeAddress ?? BRIDGE_ADDRESS,
    amounts: overrides.amounts ?? [1_000_000n, 10_000_000n, 1_000_000n],
  });
  const primary = provider(blockNumber, blockHash, receipts);
  const witness = provider(blockNumber, blockHash, structuredClone(receipts));
  return collectFrontierReturnedReceiptBurnSetFromDistinctSources({
    primary: {
      provider: primary,
      sourceIdHex: `0x${'a1'.repeat(32)}`,
      sidechainIdHex: overrides.sidechainIdHex ?? SIDECHAIN_ID,
      executionBlockNumber: blockNumber,
      executionBlockHashHex: blockHash,
      bridgeAddress,
      maxBurns: 3,
    },
    witness: {
      provider: witness,
      sourceIdHex: `0x${'b2'.repeat(32)}`,
      sidechainIdHex: overrides.sidechainIdHex ?? SIDECHAIN_ID,
      executionBlockNumber: blockNumber,
      executionBlockHashHex: blockHash,
      bridgeAddress,
      maxBurns: 3,
    },
  });
}

function buildReceipts(input: {
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly bridgeAddress: string;
  readonly amounts: readonly [bigint, bigint, bigint];
}) {
  return input.amounts.map((amount, index) => ({
    status: '0x1',
    transactionIndex: `0x${index.toString(16)}`,
    transactionHash: `0x${String(index + 1).padStart(2, '0').repeat(32)}`,
    blockNumber: `0x${input.blockNumber.toString(16)}`,
    blockHash: input.blockHash,
    logs: [{
      address: input.bridgeAddress,
      logIndex: `0x${index.toString(16)}`,
      topics: [
        FRONTIER_PEG_OUT_TOPIC,
        `0x${'00'.repeat(12)}${String(index + 1).padStart(2, '0').repeat(20)}`,
      ],
      data: encodePegOutData(amount, RECIPIENT_TREE),
    }],
  }));
}

function provider(
  blockNumber: number,
  blockHash: string,
  receipts: ReturnType<typeof buildReceipts>,
): FrontierBurnProofProvider {
  return {
    async getBlock(number) {
      return number === blockNumber
        ? { number: blockNumber, hash: blockHash }
        : null;
    },
    async getBlockReceipts(number) {
      if (number !== blockNumber) {
        throw new Error('unexpected synthetic block number');
      }
      return receipts;
    },
  };
}

function encodePegOutData(amount: bigint, recipientErgoTreeHex: string): string {
  const amountWord = amount.toString(16).padStart(64, '0');
  const offsetWord = '40'.padStart(64, '0');
  const lengthWord = (recipientErgoTreeHex.length / 2)
    .toString(16)
    .padStart(64, '0');
  const recipientWord = recipientErgoTreeHex.padEnd(128, '0');
  return `0x${amountWord}${offsetWord}${lengthWord}${recipientWord}`;
}
