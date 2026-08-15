import { vi } from 'vitest';

vi.mock('./authenticated-v2-dup-reconstruction.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./authenticated-v2-dup-reconstruction.js')
  >();
  return {
    ...actual,
    assertAuthenticatedV2DupReconstructionProvenance: vi.fn(),
  };
});

import { describe, expect, it } from 'vitest';

import {
  collectAuthenticatedV2HistoricalPayoutFromDistinctSources,
  assertAuthenticatedV2HistoricalPayoutAgreementProvenance,
  type AuthenticatedV2HistoricalPayoutChainSource,
} from './authenticated-v2-historical-payout-evidence.js';
import type {
  AuthenticatedV2DupReconstruction,
} from './authenticated-v2-dup-reconstruction.js';
import { MINER_FEE_TREE } from './ergo-encoding.js';
import {
  computeErgoBlockTransactionsRoot,
} from './ergo-settlement-core/ergo-block-transactions-root.js';
import {
  computeErgoHeaderId,
} from './ergo-settlement-core/ergo-header-id.js';

const importedWasm: any = await import('ergo-lib-wasm-nodejs');
const TEST_WASM = importedWasm.default ?? importedWasm;

const LEGACY_KEY = '51'.repeat(32);
const RECONSTRUCTION_DIGEST = '61'.repeat(32);
const PAYOUT_TREE =
  '0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const SUCCESSOR_TREE =
  '0008cd02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5';
const INPUT_TREE = PAYOUT_TREE;
const HEIGHT = 101;

describe('authenticated V2 historical payout evidence', () => {
  it('binds an exact payout to canonical signed bytes and a full block transaction root', async () => {
    const fixture = buildFixture();
    const agreement =
      await collectAuthenticatedV2HistoricalPayoutFromDistinctSources({
        primarySource: source(fixture),
        primarySourceIdHex: '71'.repeat(32),
        witnessSource: source(fixture),
        witnessSourceIdHex: '72'.repeat(32),
        authenticatedV2Reconstruction: fixture.reconstruction,
        legacyHistoryKeyHex: LEGACY_KEY,
      });

    expect(agreement.view).toMatchObject({
      authenticatedV2ReconstructionDigestHex: RECONSTRUCTION_DIGEST,
      legacyHistoryKeyHex: LEGACY_KEY,
      historyIndex: 0,
      ergoSettlementTransactionIdHex: fixture.transaction.id,
      ergoSettlementBlockIdHex: fixture.block.header.id,
      ergoSettlementInclusionHeight: HEIGHT,
      payoutOutputIndex: 1,
      payoutBoxIdHex: fixture.transaction.outputs[1].boxId,
      payoutValueNanoErg: '3900000',
      payoutErgoTreeHex: PAYOUT_TREE,
      transactionIndexInBlock: 0,
      transactionCountInBlock: 1,
    });
    expect(agreement.boundary).toEqual({
      distinctSourceInstancesVerified: true,
      exactHistoricalPayoutAgreementVerified: true,
      operationalIndependenceEstablished: false,
      ergoPowAuthenticated: false,
      canonicalChainMembershipEstablished: false,
      payoutAuthorized: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    });
    expect(() =>
      assertAuthenticatedV2HistoricalPayoutAgreementProvenance(
        agreement,
        {
          authenticatedV2Reconstruction: fixture.reconstruction,
          legacyHistoryKeyHex: LEGACY_KEY,
        },
      )
    ).not.toThrow();
    expect(() =>
      assertAuthenticatedV2HistoricalPayoutAgreementProvenance(
        structuredClone(agreement),
      )
    ).toThrow(/provenance/);
  });

  it('rejects an altered historical transaction body that retains the claimed ID', async () => {
    const fixture = buildFixture();
    const alteredTransaction = structuredClone(fixture.transaction);
    alteredTransaction.outputs[1].value = '3900001';
    const altered = {
      ...fixture,
      transaction: alteredTransaction,
    };

    await expect(
      collectAuthenticatedV2HistoricalPayoutFromDistinctSources({
        primarySource: source(altered),
        primarySourceIdHex: '73'.repeat(32),
        witnessSource: source(fixture),
        witnessSourceIdHex: '74'.repeat(32),
        authenticatedV2Reconstruction: fixture.reconstruction,
        legacyHistoryKeyHex: LEGACY_KEY,
      }),
    ).rejects.toThrow(
      /not canonical signed Ergo transaction JSON|claimed ID does not match canonical bytes/,
    );
  });

  it('rejects missing evidence and reused source identities', async () => {
    const fixture = buildFixture();
    const primary = source(fixture);
    const missingTransaction: AuthenticatedV2HistoricalPayoutChainSource = {
      async getTransaction() {
        return null;
      },
      async getBlockByHeaderId() {
        return structuredClone(fixture.block);
      },
    };

    await expect(
      collectAuthenticatedV2HistoricalPayoutFromDistinctSources({
        primarySource: missingTransaction,
        primarySourceIdHex: '75'.repeat(32),
        witnessSource: source(fixture),
        witnessSourceIdHex: '76'.repeat(32),
        authenticatedV2Reconstruction: fixture.reconstruction,
        legacyHistoryKeyHex: LEGACY_KEY,
      }),
    ).rejects.toThrow(/transaction is unavailable/);

    await expect(
      collectAuthenticatedV2HistoricalPayoutFromDistinctSources({
        primarySource: primary,
        primarySourceIdHex: '77'.repeat(32),
        witnessSource: source(fixture),
        witnessSourceIdHex: '77'.repeat(32),
        authenticatedV2Reconstruction: fixture.reconstruction,
        legacyHistoryKeyHex: LEGACY_KEY,
      }),
    ).rejects.toThrow(/distinct source instances and identities/);
  });
});

function source(
  fixture: ReturnType<typeof buildFixture>,
): AuthenticatedV2HistoricalPayoutChainSource {
  return {
    async getTransaction(transactionIdHex) {
      return transactionIdHex === fixture.transaction.id
        ? structuredClone(fixture.transaction)
        : null;
    },
    async getBlockByHeaderId(headerIdHex) {
      return headerIdHex === fixture.block.header.id
        ? structuredClone(fixture.block)
        : null;
    },
  };
}

function buildFixture() {
  const inputBox = materializeBox({
    transactionIdHex: '11'.repeat(32),
    outputIndex: 0,
    valueNanoErg: 7_000_000,
    ergoTreeHex: INPUT_TREE,
    creationHeight: 100,
  });
  const unsignedJson = {
    inputs: [{
      boxId: inputBox.boxId,
      extension: {},
    }],
    dataInputs: [],
    outputs: [
      outputCandidate(2_000_000, SUCCESSOR_TREE),
      outputCandidate(3_900_000, PAYOUT_TREE),
      outputCandidate(1_100_000, MINER_FEE_TREE),
    ],
  };
  const unsigned = TEST_WASM.UnsignedTransaction.from_json(
    JSON.stringify(unsignedJson),
  );
  const signed = TEST_WASM.Transaction.from_unsigned_tx(
    unsigned,
    [new Uint8Array()],
  );
  const transaction = signed.to_js_eip12() as Record<string, any>;
  signed.free?.();
  const transactionsRootHex = computeErgoBlockTransactionsRoot({
    blockVersion: 2,
    transactions: [{
      transactionId: Buffer.from(transaction.id, 'hex'),
      spendingProofs: transaction.inputs.map(
        (input: Record<string, any>) =>
          Buffer.from(input.spendingProof.proofBytes, 'hex'),
      ),
    }],
  }).toString('hex');
  const headerFields = {
    version: 2,
    parentId: Buffer.from('21'.repeat(32), 'hex'),
    adProofsRoot: Buffer.from('22'.repeat(32), 'hex'),
    stateRoot: Buffer.from(`00${'23'.repeat(32)}`, 'hex'),
    transactionsRoot: Buffer.from(transactionsRootHex, 'hex'),
    timestamp: 1_720_000_000_101n,
    nBits: 117_440_511,
    height: HEIGHT,
    extensionHash: Buffer.from('24'.repeat(32), 'hex'),
    votes: Buffer.from('000000', 'hex'),
    powSolution: {
      publicKey: Buffer.from(
        '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
        'hex',
      ),
      nonce: Buffer.from('0000000000000065', 'hex'),
    },
  } as const;
  const headerIdHex = computeErgoHeaderId(headerFields).toString('hex');
  const block = {
    header: {
      id: headerIdHex,
      parentId: headerFields.parentId.toString('hex'),
      height: HEIGHT,
      version: 2,
      adProofsRoot: headerFields.adProofsRoot.toString('hex'),
      stateRoot: headerFields.stateRoot.toString('hex'),
      transactionsRoot: transactionsRootHex,
      timestamp: Number(headerFields.timestamp),
      nBits: headerFields.nBits,
      extensionHash: headerFields.extensionHash.toString('hex'),
      powSolutions: {
        pk: headerFields.powSolution.publicKey.toString('hex'),
        w:
          '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
        n: headerFields.powSolution.nonce.toString('hex'),
        d: '0',
      },
      votes: headerFields.votes.toString('hex'),
    },
    blockTransactions: {
      headerId: headerIdHex,
      blockVersion: 2,
      transactions: [transaction],
    },
  };
  const reconstruction = {
    observationDigestHex: RECONSTRUCTION_DIGEST,
    historyKeys: [LEGACY_KEY],
    transitions: [{
      burnIdHex: LEGACY_KEY,
      spendingTransactionIdHex: transaction.id,
      spendingBlockIdHex: headerIdHex,
      spendingInclusionHeight: HEIGHT,
      dupInputBoxIdHex: '31'.repeat(32),
      dupSuccessorBoxIdHex: '32'.repeat(32),
      vaultInputBoxIdHex: '33'.repeat(32),
      vaultSuccessorBoxIdHex: null,
      payoutBoxIdHex: transaction.outputs[1].boxId,
      payoutValueNanoErg: transaction.outputs[1].value,
      minerFeeNanoErg: transaction.outputs[2].value,
      successorDigestHex: `01${'34'.repeat(32)}`,
    }],
    distinctSourceAgreement: true,
  } as unknown as AuthenticatedV2DupReconstruction;
  return { transaction, block, reconstruction };
}

function outputCandidate(valueNanoErg: number, ergoTreeHex: string) {
  return {
    value: String(valueNanoErg),
    ergoTree: ergoTreeHex,
    assets: [],
    additionalRegisters: {},
    creationHeight: HEIGHT,
  };
}

function materializeBox(input: {
  readonly transactionIdHex: string;
  readonly outputIndex: number;
  readonly valueNanoErg: number;
  readonly ergoTreeHex: string;
  readonly creationHeight: number;
}) {
  const value = TEST_WASM.BoxValue.from_i64(
    TEST_WASM.I64.from_str(String(input.valueNanoErg)),
  );
  const tree = TEST_WASM.ErgoTree.from_base16_bytes(input.ergoTreeHex);
  const contract = TEST_WASM.Contract.new(tree);
  const builder = new TEST_WASM.ErgoBoxCandidateBuilder(
    value,
    contract,
    input.creationHeight,
  );
  const candidate = builder.build();
  const transactionId = TEST_WASM.TxId.from_str(input.transactionIdHex);
  const box = TEST_WASM.ErgoBox.from_box_candidate(
    candidate,
    transactionId,
    input.outputIndex,
  );
  try {
    return box.to_js_eip12() as Record<string, any>;
  } finally {
    box.free?.();
    transactionId.free?.();
    candidate.free?.();
    builder.free?.();
  }
}
