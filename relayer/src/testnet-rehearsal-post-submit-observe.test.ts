import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

import {
  LEGACY_V1_POST_SUBMIT_QUARANTINE,
} from './testnet-rehearsal-post-submit.js';
import {
  observeTestnetRehearsalPostSubmitEvidence,
  type TestnetRehearsalPostSubmitObserveInput,
} from './testnet-rehearsal-post-submit-observe.js';
import { LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE } from './testnet-rehearsal-live-preflight.js';
import { MINER_FEE_TREE } from './ergo-helpers.js';

const SUBMITTED_TX_ID = '1'.repeat(64);
const BURN_TX_ID = '2'.repeat(64);
const SPV_TRACKER_NFT_ID = '3'.repeat(64);
const AGGREGATE_DUP_NFT_ID = '4'.repeat(64);
const SPV_SUCCESSOR_BOX_ID = '5'.repeat(64);
const DUP_SUCCESSOR_BOX_ID = '6'.repeat(64);
const PAYOUT_BOX_ID = '7'.repeat(64);
const FEE_BOX_ID = '8'.repeat(64);
const BURN_TX_ID_B = '9'.repeat(64);
const PAYOUT_BOX_ID_B = 'a'.repeat(64);
const CHANGE_BOX_ID = 'b'.repeat(64);
const RECIPIENT_TREE = '00'.repeat(16);
const RECIPIENT_TREE_B = 'aa'.repeat(16);
const AGGREGATE_UNLOCK_TREE = 'bb'.repeat(16);
const FINALITY_EVIDENCE_ARTIFACT = 'artifact://live-rehearsal/finality.log';
const ERGO_NODE_URL = 'http://127.0.0.1:9053';

function livePreflightReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    status: 'GO',
    errors: [],
    expectedTxId: SUBMITTED_TX_ID,
    runtimeBroadcastEnabled: false,
    targetBindings: {
      rehearsal: 'evidence/live-rehearsals/live-window.md',
      approvals: 'evidence/testnet-prebroadcast/aggregate-approvals-v2.json',
      transcript: 'artifact://live/live-preflight.log',
    },
    preSubmitBoundary: {
      reportAuthorizesBroadcast: false,
      liveSubmitPerformed: false,
      confirmationObserved: false,
      reconciliationPerformed: false,
      gate3ClosureAllowed: false,
      productionReadyClaimAllowed: false,
      testnetProductionCandidateClaimAllowed: false,
    },
    authorizationEvidence: {
      reviewerApproval: 'linked',
      userApproval: 'linked',
      scopedBroadcastShell: 'linked',
      readinessAfterEnable: 'linked',
      broadcastPolicyPass: 'linked',
      liveSettlementReadinessPass: 'linked',
      networkReconfirmation: 'linked',
      approvalJsonBinding: 'matched',
      releaseGateTranscriptLine: 'emitted',
    },
    approvalBinding: {
      command: 'check',
      mode: 'single',
      expectedTxId: SUBMITTED_TX_ID,
      burnTxHashes: [BURN_TX_ID],
      environment: 'testnet',
      ergoNodeNetwork: 'testnet',
      sidechainNetwork: 'patched-devnet',
      deployedStateHash: 'e'.repeat(64),
    },
    lines: [
      `npm run rehearsal:live-preflight command output: artifact://live/live-preflight.log PASS exit code 0 Expected transaction ID ${SUBMITTED_TX_ID}`,
    ],
    ...overrides,
  };
}

function batchLivePreflightReport(): Record<string, unknown> {
  return livePreflightReport({
    approvalBinding: {
      command: 'check-batch',
      mode: 'batch',
      expectedTxId: SUBMITTED_TX_ID,
      burnTxHashes: [BURN_TX_ID, BURN_TX_ID_B],
      bridgeEventRootHexes: ['c'.repeat(64), 'd'.repeat(64)],
      environment: 'testnet',
      ergoNodeNetwork: 'testnet',
      sidechainNetwork: 'patched-devnet',
      deployedStateHash: 'e'.repeat(64),
    },
  });
}

function validInput(overrides: Partial<TestnetRehearsalPostSubmitObserveInput> = {}): TestnetRehearsalPostSubmitObserveInput {
  return {
    expectedTxId: SUBMITTED_TX_ID,
    submittedTxId: SUBMITTED_TX_ID,
    tx: {
      id: SUBMITTED_TX_ID,
      inclusionHeight: 100,
      outputs: [
        output(SPV_SUCCESSOR_BOX_ID, 2_000_000, '11', [{ tokenId: SPV_TRACKER_NFT_ID, amount: '1' }]),
        output(DUP_SUCCESSOR_BOX_ID, 2_000_000, '22', [{ tokenId: AGGREGATE_DUP_NFT_ID, amount: '1' }]),
        output(PAYOUT_BOX_ID, 10_000_000, RECIPIENT_TREE),
        output(FEE_BOX_ID, 1_100_000, MINER_FEE_TREE),
      ],
    },
    pegOutRows: [{
      burnTxId: BURN_TX_ID,
      status: 'phase2_unlocked',
      phase2UnlockTxId: SUBMITTED_TX_ID,
      pendingAvlKey: BURN_TX_ID,
      amountNanoErg: '10000000',
      recipientErgoTreeHex: RECIPIENT_TREE,
    }],
    currentErgoHeight: 104,
    firstObservedMempoolHeight: 99,
    confirmationsRequired: 3,
    nodeUrl: ERGO_NODE_URL,
    observedAt: '2026-05-20T00:00:00Z',
    nodeNetwork: 'Ergo testnet',
    stateTargetClass: 'operator-provided-state-db',
    submissionArtifact: 'artifact://live-rehearsal/submit.log',
    confirmationArtifact: 'artifact://live-rehearsal/confirmation.log',
    finalityEvidenceArtifact: FINALITY_EVIDENCE_ARTIFACT,
    reconciliationArtifact: 'artifact://live-rehearsal/reconciliation.log',
    submissionTimestamp: '2026-05-17T14:45:00Z',
    spvTrackerNftId: SPV_TRACKER_NFT_ID,
    aggregateDupNftId: AGGREGATE_DUP_NFT_ID,
    feeNanoErg: '1100000',
    failedEventQueue: 'empty',
    manualRepairPerformed: 'no',
    livePreflightReport: livePreflightReport(),
    livePreflightReportTarget: 'evidence/live-rehearsals/live-preflight.json',
    ...overrides,
  };
}

function output(
  boxId: string,
  value: string | number | bigint,
  ergoTree: string,
  assets: Array<{ tokenId: string; amount: string }> = [],
) {
  return {
    boxId,
    value,
    ergoTree,
    creationHeight: 100,
    assets,
  };
}

describe('testnet rehearsal post-submit observe', () => {
  it('blocks new post-submit evidence from a quarantined legacy V1 observation', () => {
    const report = observeTestnetRehearsalPostSubmitEvidence(validInput());

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.observation).toBeUndefined();
    expect(report.errors).toContain(LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE);
    expect(report.errors).toContain(LEGACY_V1_POST_SUBMIT_QUARANTINE);
  });

  it('blocks observation when the submitted transaction ID differs from the expected transaction ID', () => {
    const report = observeTestnetRehearsalPostSubmitEvidence(validInput({
      submittedTxId: 'f'.repeat(64),
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('Submitted transaction ID must match Expected transaction ID');
  });

  it('blocks observation when the peg-out row is not reconciled', () => {
    const report = observeTestnetRehearsalPostSubmitEvidence(validInput({
      pegOutRows: [{
        burnTxId: BURN_TX_ID,
        status: 'batch_submitted',
        phase2UnlockTxId: null,
        pendingAvlKey: BURN_TX_ID,
        amountNanoErg: '10000000',
        recipientErgoTreeHex: RECIPIENT_TREE,
      }],
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('Peg-out row 1 must already be reconciled to phase2_unlocked');
  });

  it('blocks observation when successor token outputs are missing', () => {
    const input = validInput({
      tx: {
        id: SUBMITTED_TX_ID,
        inclusionHeight: 100,
        outputs: [output(PAYOUT_BOX_ID, 10_000_000, RECIPIENT_TREE)],
      },
    });
    const report = observeTestnetRehearsalPostSubmitEvidence(input);

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('SPV tracker successor output must be OUTPUTS(0) with the expected NFT amount 1');
    expect(report.errors).toContain('Aggregate DUP successor output must be OUTPUTS(1) with the expected NFT amount 1');
    expect(report.errors).toContain('Observed transaction must contain exactly one SPV tracker successor NFT');
    expect(report.errors).toContain('Observed transaction must contain exactly one aggregate DUP successor NFT');
  });

  it('blocks observation when successor NFTs are not in the required positions', () => {
    const report = observeTestnetRehearsalPostSubmitEvidence(validInput({
      tx: {
        id: SUBMITTED_TX_ID,
        inclusionHeight: 100,
        outputs: [
          output(PAYOUT_BOX_ID, 10_000_000, RECIPIENT_TREE),
          output(DUP_SUCCESSOR_BOX_ID, 2_000_000, '22', [{ tokenId: AGGREGATE_DUP_NFT_ID, amount: '1' }]),
          output(SPV_SUCCESSOR_BOX_ID, 2_000_000, '11', [{ tokenId: SPV_TRACKER_NFT_ID, amount: '1' }]),
          output(FEE_BOX_ID, 1_100_000, MINER_FEE_TREE),
        ],
      },
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('SPV tracker successor output must be OUTPUTS(0) with the expected NFT amount 1');
    expect(report.errors).toContain(`Payout output at position 2 must match burn TX ID ${BURN_TX_ID} recipient and amount`);
  });

  it('blocks a correctly ordered legacy V1 batch after quarantine', () => {
    const report = observeTestnetRehearsalPostSubmitEvidence(validInput({
      tx: {
        id: SUBMITTED_TX_ID,
        inclusionHeight: 100,
        outputs: [
          output(SPV_SUCCESSOR_BOX_ID, 2_000_000, '11', [{ tokenId: SPV_TRACKER_NFT_ID, amount: '1' }]),
          output(DUP_SUCCESSOR_BOX_ID, 2_000_000, '22', [{ tokenId: AGGREGATE_DUP_NFT_ID, amount: '1' }]),
          output(PAYOUT_BOX_ID, 10_000_000, RECIPIENT_TREE),
          output(PAYOUT_BOX_ID_B, 20_000_000, RECIPIENT_TREE_B),
          output(FEE_BOX_ID, 1_100_000, MINER_FEE_TREE),
        ],
      },
      pegOutRows: [
        validInput().pegOutRows[0],
        {
          burnTxId: BURN_TX_ID_B,
          status: 'phase2_unlocked',
          phase2UnlockTxId: SUBMITTED_TX_ID,
          pendingAvlKey: BURN_TX_ID_B,
          amountNanoErg: '20000000',
          recipientErgoTreeHex: RECIPIENT_TREE_B,
        },
      ],
      livePreflightReport: batchLivePreflightReport(),
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.observation).toBeUndefined();
    expect(report.errors).toContain(LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE);
  });

  it('blocks batch observation when the observed burn order differs from live-preflight approval order', () => {
    const report = observeTestnetRehearsalPostSubmitEvidence(validInput({
      tx: {
        id: SUBMITTED_TX_ID,
        inclusionHeight: 100,
        outputs: [
          output(SPV_SUCCESSOR_BOX_ID, 2_000_000, '11', [{ tokenId: SPV_TRACKER_NFT_ID, amount: '1' }]),
          output(DUP_SUCCESSOR_BOX_ID, 2_000_000, '22', [{ tokenId: AGGREGATE_DUP_NFT_ID, amount: '1' }]),
          output(PAYOUT_BOX_ID_B, 20_000_000, RECIPIENT_TREE_B),
          output(PAYOUT_BOX_ID, 10_000_000, RECIPIENT_TREE),
          output(FEE_BOX_ID, 1_100_000, MINER_FEE_TREE),
        ],
      },
      pegOutRows: [
        {
          burnTxId: BURN_TX_ID_B,
          status: 'phase2_unlocked',
          phase2UnlockTxId: SUBMITTED_TX_ID,
          pendingAvlKey: BURN_TX_ID_B,
          amountNanoErg: '20000000',
          recipientErgoTreeHex: RECIPIENT_TREE_B,
        },
        validInput().pegOutRows[0],
      ],
      livePreflightReport: batchLivePreflightReport(),
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'Live-preflight report approvalBinding.burnTxHashes must match post-submit peg-out burn TX IDs in order',
    );
  });

  it('blocks single-claim observation when the observed burn differs from live-preflight approval', () => {
    const report = observeTestnetRehearsalPostSubmitEvidence(validInput({
      tx: {
        id: SUBMITTED_TX_ID,
        inclusionHeight: 100,
        outputs: [
          output(SPV_SUCCESSOR_BOX_ID, 2_000_000, '11', [{ tokenId: SPV_TRACKER_NFT_ID, amount: '1' }]),
          output(DUP_SUCCESSOR_BOX_ID, 2_000_000, '22', [{ tokenId: AGGREGATE_DUP_NFT_ID, amount: '1' }]),
          output(PAYOUT_BOX_ID_B, 20_000_000, RECIPIENT_TREE_B),
          output(FEE_BOX_ID, 1_100_000, MINER_FEE_TREE),
        ],
      },
      pegOutRows: [{
        burnTxId: BURN_TX_ID_B,
        status: 'phase2_unlocked',
        phase2UnlockTxId: SUBMITTED_TX_ID,
        pendingAvlKey: BURN_TX_ID_B,
        amountNanoErg: '20000000',
        recipientErgoTreeHex: RECIPIENT_TREE_B,
      }],
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'Live-preflight report approvalBinding.burnTxHashes must match post-submit peg-out burn TX IDs in order',
    );
  });

  it('blocks batch observation when payout outputs are reordered', () => {
    const report = observeTestnetRehearsalPostSubmitEvidence(validInput({
      tx: {
        id: SUBMITTED_TX_ID,
        inclusionHeight: 100,
        outputs: [
          output(SPV_SUCCESSOR_BOX_ID, 2_000_000, '11', [{ tokenId: SPV_TRACKER_NFT_ID, amount: '1' }]),
          output(DUP_SUCCESSOR_BOX_ID, 2_000_000, '22', [{ tokenId: AGGREGATE_DUP_NFT_ID, amount: '1' }]),
          output(PAYOUT_BOX_ID_B, 20_000_000, RECIPIENT_TREE_B),
          output(PAYOUT_BOX_ID, 10_000_000, RECIPIENT_TREE),
          output(FEE_BOX_ID, 1_100_000, MINER_FEE_TREE),
        ],
      },
      pegOutRows: [
        validInput().pegOutRows[0],
        {
          burnTxId: BURN_TX_ID_B,
          status: 'phase2_unlocked',
          phase2UnlockTxId: SUBMITTED_TX_ID,
          pendingAvlKey: BURN_TX_ID_B,
          amountNanoErg: '20000000',
          recipientErgoTreeHex: RECIPIENT_TREE_B,
        },
      ],
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(`Payout output at position 2 must match burn TX ID ${BURN_TX_ID} recipient and amount`);
    expect(report.errors).toContain(`Payout output at position 3 must match burn TX ID ${BURN_TX_ID_B} recipient and amount`);
  });

  it('does not emit evidence for same-recipient legacy V1 payouts after quarantine', () => {
    const report = observeTestnetRehearsalPostSubmitEvidence(validInput({
      tx: {
        id: SUBMITTED_TX_ID,
        inclusionHeight: 100,
        outputs: [
          output(SPV_SUCCESSOR_BOX_ID, 2_000_000, '11', [{ tokenId: SPV_TRACKER_NFT_ID, amount: '1' }]),
          output(DUP_SUCCESSOR_BOX_ID, 2_000_000, '22', [{ tokenId: AGGREGATE_DUP_NFT_ID, amount: '1' }]),
          output(PAYOUT_BOX_ID, 10_000_000, RECIPIENT_TREE),
          output(PAYOUT_BOX_ID_B, 10_000_000, RECIPIENT_TREE),
          output(FEE_BOX_ID, 1_100_000, MINER_FEE_TREE),
        ],
      },
      pegOutRows: [
        validInput().pegOutRows[0],
        {
          burnTxId: BURN_TX_ID_B,
          status: 'phase2_unlocked',
          phase2UnlockTxId: SUBMITTED_TX_ID,
          pendingAvlKey: BURN_TX_ID_B,
          amountNanoErg: '10000000',
          recipientErgoTreeHex: RECIPIENT_TREE,
        },
      ],
      livePreflightReport: batchLivePreflightReport(),
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.observation).toBeUndefined();
    expect(report.errors).toContain(LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE);
  });

  it('blocks batch observation when payout output box IDs are duplicated', () => {
    const report = observeTestnetRehearsalPostSubmitEvidence(validInput({
      tx: {
        id: SUBMITTED_TX_ID,
        inclusionHeight: 100,
        outputs: [
          output(SPV_SUCCESSOR_BOX_ID, 2_000_000, '11', [{ tokenId: SPV_TRACKER_NFT_ID, amount: '1' }]),
          output(DUP_SUCCESSOR_BOX_ID, 2_000_000, '22', [{ tokenId: AGGREGATE_DUP_NFT_ID, amount: '1' }]),
          output(PAYOUT_BOX_ID, 10_000_000, RECIPIENT_TREE),
          output(PAYOUT_BOX_ID, 10_000_000, RECIPIENT_TREE),
          output(FEE_BOX_ID, 1_100_000, MINER_FEE_TREE),
        ],
      },
      pegOutRows: [
        validInput().pegOutRows[0],
        {
          burnTxId: BURN_TX_ID_B,
          status: 'phase2_unlocked',
          phase2UnlockTxId: SUBMITTED_TX_ID,
          pendingAvlKey: BURN_TX_ID_B,
          amountNanoErg: '10000000',
          recipientErgoTreeHex: RECIPIENT_TREE,
        },
      ],
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('Recipient payout output box IDs must be unique within a post-submit observation');
  });

  it('blocks observation when the final miner fee output is not canonical', () => {
    const report = observeTestnetRehearsalPostSubmitEvidence(validInput({
      tx: {
        id: SUBMITTED_TX_ID,
        inclusionHeight: 100,
        outputs: [
          output(SPV_SUCCESSOR_BOX_ID, 2_000_000, '11', [{ tokenId: SPV_TRACKER_NFT_ID, amount: '1' }]),
          output(DUP_SUCCESSOR_BOX_ID, 2_000_000, '22', [{ tokenId: AGGREGATE_DUP_NFT_ID, amount: '1' }]),
          output(PAYOUT_BOX_ID, 10_000_000, RECIPIENT_TREE),
          output(FEE_BOX_ID, 1_100_001, '33'),
        ],
      },
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('Final miner fee output must use the canonical miner fee ErgoTree');
    expect(report.errors).toContain('Final miner fee output value must match feeNanoErg');
  });

  it('blocks observation evidence when the miner fee amount is unsafe', () => {
    const unsafeFee = '9007199254740993';
    const report = observeTestnetRehearsalPostSubmitEvidence(validInput({
      feeNanoErg: unsafeFee,
      tx: {
        id: SUBMITTED_TX_ID,
        inclusionHeight: 100,
        outputs: [
          output(SPV_SUCCESSOR_BOX_ID, 2_000_000, '11', [{ tokenId: SPV_TRACKER_NFT_ID, amount: '1' }]),
          output(DUP_SUCCESSOR_BOX_ID, 2_000_000, '22', [{ tokenId: AGGREGATE_DUP_NFT_ID, amount: '1' }]),
          output(PAYOUT_BOX_ID, 10_000_000, RECIPIENT_TREE),
          output(FEE_BOX_ID, unsafeFee, MINER_FEE_TREE),
        ],
      },
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.observation).toBeUndefined();
    expect(report.errors).toContain('Miner fee output feeNanoErg must be a positive safe integer');
  });

  it('validates change-output shape but still blocks legacy V1 evidence after quarantine', () => {
    const withoutChangeTree = observeTestnetRehearsalPostSubmitEvidence(validInput({
      tx: {
        id: SUBMITTED_TX_ID,
        inclusionHeight: 100,
        outputs: [
          output(SPV_SUCCESSOR_BOX_ID, 2_000_000, '11', [{ tokenId: SPV_TRACKER_NFT_ID, amount: '1' }]),
          output(DUP_SUCCESSOR_BOX_ID, 2_000_000, '22', [{ tokenId: AGGREGATE_DUP_NFT_ID, amount: '1' }]),
          output(PAYOUT_BOX_ID, 10_000_000, RECIPIENT_TREE),
          output(CHANGE_BOX_ID, 2_000_000, AGGREGATE_UNLOCK_TREE),
          output(FEE_BOX_ID, 1_100_000, MINER_FEE_TREE),
        ],
      },
    }));
    const withChangeTree = observeTestnetRehearsalPostSubmitEvidence(validInput({
      aggregateUnlockErgoTreeHex: AGGREGATE_UNLOCK_TREE,
      tx: {
        id: SUBMITTED_TX_ID,
        inclusionHeight: 100,
        outputs: [
          output(SPV_SUCCESSOR_BOX_ID, 2_000_000, '11', [{ tokenId: SPV_TRACKER_NFT_ID, amount: '1' }]),
          output(DUP_SUCCESSOR_BOX_ID, 2_000_000, '22', [{ tokenId: AGGREGATE_DUP_NFT_ID, amount: '1' }]),
          output(PAYOUT_BOX_ID, 10_000_000, RECIPIENT_TREE),
          output(CHANGE_BOX_ID, 2_000_000, AGGREGATE_UNLOCK_TREE),
          output(FEE_BOX_ID, 1_100_000, MINER_FEE_TREE),
        ],
      },
    }));

    expect(withoutChangeTree.status).toBe('BLOCKED');
    expect(withoutChangeTree.errors).toContain('Aggregate unlock ErgoTree is required when an aggregate unlock change output is present');
    expect(withChangeTree.status).toBe('BLOCKED');
    expect(withChangeTree.markdown).toBeUndefined();
    expect(withChangeTree.observation).toBeUndefined();
    expect(withChangeTree.errors).toContain(LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE);
  });

  it('keeps the observe implementation off signer, broadcast, and SQLite mutation surfaces', () => {
    const source = [
      readFileSync(new URL('./testnet-rehearsal-post-submit-observe.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('./scripts/testnet-rehearsal-post-submit-observe.ts', import.meta.url), 'utf8'),
    ].join('\n');

    for (const forbidden of [
      'dotenv/config',
      'signAndCheck',
      'signAndSubmit',
      'assertBroadcastAllowed',
      'BRIDGE_BROADCAST_ENABLED=true',
      'updatePegOutStatus',
      'insertAvlKey',
      'insertSpvTrackerEntry',
      'confirmSingleClaimSettlement',
      'confirmBatchSettlement',
      'submitSingleClaim',
      'submitBatchClaims',
      'SidechainClient',
    ]) {
      expect(source).not.toContain(forbidden);
    }

    expect(source).toContain('--json-out');
    expect(source).toContain('--finality-evidence-artifact');
    expect(source).toContain("import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js'");
    expect(source).toContain('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;');
    expect(source).toContain('writeOfflineReportJson');
    expect(source).toContain('post-submit observe report');
    expect(source).toContain('validateReadOnlyNodeUrl');
    expect(source).toContain('resolvePostSubmitObserveStateDbPath(args.stateDb)');
    expect(source).toContain('new ErgoClient(args.nodeUrl, { readOnly: true })');
    expect(source).toContain("stateTargetClass: 'operator-provided-state-db'");
    expect(source).not.toContain("stateDb: 'bridge-state.sqlite'");
    expect(source).not.toContain("args.stateDb === 'bridge-state.sqlite'");
    expect(source).not.toContain('loadDeployedState');
    expect(source.indexOf('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;')).toBeLessThan(
      source.indexOf('resolvePostSubmitObserveStateDbPath(args.stateDb)'),
    );
    expect(source.indexOf('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;')).toBeLessThan(
      source.indexOf('new ErgoClient(args.nodeUrl, { readOnly: true })'),
    );
  });

  it('blocks unsafe CLI state database targets before opening local files', () => {
    const stateDbTarget = '../operator/private-key.sqlite';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-rehearsal-post-submit-observe.ts',
        ...postSubmitObserveCliArgs(stateDbTarget),
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'testnet rehearsal post-submit observe: --state-db <blocked state-db target> must not target secret-bearing material',
    );
    expect(result.stderr).not.toContain(stateDbTarget);
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('blocks unsafe CLI JSON output targets before opening live observation inputs', () => {
    const jsonOutTarget = '../operator/private-key-report.json';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-rehearsal-post-submit-observe.ts',
        ...postSubmitObserveCliArgs('missing-post-submit-state.sqlite', ['--json-out', jsonOutTarget]),
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--json-out <blocked output target> must not target runtime or secret-bearing material');
    expect(result.stderr).not.toContain(jsonOutTarget);
    expect(result.stderr).not.toContain('JSON evidence file could not be read');
    expect(result.stderr).not.toContain('--state-db could not be read in read-only mode');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('blocks unsafe CLI Markdown output targets before opening live observation inputs', () => {
    const outTarget = '../operator/private-key-evidence.md';
    const stateDbTarget = 'missing-post-submit-state.sqlite';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-rehearsal-post-submit-observe.ts',
        ...postSubmitObserveCliArgs(stateDbTarget, ['--out', outTarget]),
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--out <blocked output target> must not target runtime or secret-bearing material');
    expect(result.stderr).not.toContain(outTarget);
    expect(result.stderr).not.toContain('--state-db could not be read in read-only mode');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('fails closed when CLI post-submit observation targets a missing state database', () => {
    const stateDbTarget = 'missing-post-submit-state.sqlite';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-rehearsal-post-submit-observe.ts',
        ...postSubmitObserveCliArgs(stateDbTarget),
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'testnet rehearsal post-submit observe: --state-db could not be read in read-only mode',
    );
    expect(result.stderr).not.toContain(stateDbTarget);
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('requires explicit CLI state database target before opening local files', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-rehearsal-post-submit-observe.ts',
        ...postSubmitObserveCliArgs(undefined),
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'testnet rehearsal post-submit observe: --state-db is required for read-only state observation; no default runtime database is opened',
    );
    expect(result.stderr).not.toContain('bridge-state.sqlite');
    expect(result.stderr).not.toContain('could not be read in read-only mode');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('requires singleton NFT IDs as explicit CLI inputs instead of reading deployed-state defaults', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-rehearsal-post-submit-observe.ts',
        ...postSubmitObserveCliArgs('missing-post-submit-state.sqlite', [], {
          includeSingletonIds: false,
        }),
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Missing required option(s): --spv-tracker-nft-id, --aggregate-dup-nft-id');
    expect(result.stderr).not.toContain('deployed_state');
    expect(result.stderr).not.toContain('missing-post-submit-state.sqlite');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('keeps CLI singleton NFT IDs explicit instead of bound to deployed_state defaults', () => {
    const source = readFileSync(
      new URL('./scripts/testnet-rehearsal-post-submit-observe.ts', import.meta.url),
      'utf8',
    );

    expect(source).not.toContain('loadDeployedState');
    expect(source).not.toContain('deployed.spvTracker?.nftId');
    expect(source).not.toContain('deployed.doubleUnlockPreventionAggregate?.nftId');
    expect(source).not.toContain('deployed.doubleUnlockPreventionAggregateBatch?.nftId');
    expect(source).toContain('SPV tracker and aggregate DUP NFT IDs must be supplied explicitly');
  });

  it('keeps CLI Markdown output guard before live observation inputs', () => {
    const source = readFileSync(
      new URL('./scripts/testnet-rehearsal-post-submit-observe.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain('const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;');
    expect(source).toContain('const stateDbTarget = resolvePostSubmitObserveStateDbPath(args.stateDb);');
    expect(source).toContain('new ErgoClient(args.nodeUrl, { readOnly: true })');
    expect(source.indexOf('const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;')).toBeLessThan(
      source.indexOf('const stateDbTarget = resolvePostSubmitObserveStateDbPath(args.stateDb);'),
    );
    expect(source.indexOf('const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;')).toBeLessThan(
      source.indexOf('new ErgoClient(args.nodeUrl, { readOnly: true })'),
    );
  });
});

function postSubmitObserveCliArgs(
  stateDbTarget: string | undefined,
  extraArgs: string[] = [],
  options: { includeSingletonIds?: boolean } = {},
): string[] {
  const args = [
    '--expected-tx-id',
    SUBMITTED_TX_ID,
    '--submitted-tx-id',
    SUBMITTED_TX_ID,
    '--burn-tx-id',
    BURN_TX_ID,
    '--submission-artifact',
    'artifact://live-rehearsal/submit.log',
    '--confirmation-artifact',
    'artifact://live-rehearsal/confirmation.log',
    '--finality-evidence-artifact',
    FINALITY_EVIDENCE_ARTIFACT,
    '--reconciliation-artifact',
    'artifact://live-rehearsal/reconciliation.log',
    '--submission-timestamp',
    '2026-05-17T14:45:00Z',
    '--first-observed-mempool-height',
    '99',
    '--confirmations-required',
    '3',
    '--fee-nanoerg',
    '1100000',
    '--failed-event-queue',
    'empty',
    '--manual-repair-performed',
    'no',
    '--live-preflight-report',
    'tmp-post-submit-observe/live-preflight.json',
  ];
  if (options.includeSingletonIds !== false) {
    args.push('--spv-tracker-nft-id', SPV_TRACKER_NFT_ID, '--aggregate-dup-nft-id', AGGREGATE_DUP_NFT_ID);
  }
  if (stateDbTarget !== undefined) {
    args.push('--state-db', stateDbTarget);
  }
  args.push(...extraArgs);
  return args;
}
