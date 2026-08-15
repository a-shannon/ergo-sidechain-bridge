import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { tmpdir } from 'os';

import { describe, expect, it } from 'vitest';

import { writeOfflineReportJson } from './offline-report-json.js';
import {
  assembleTestnetRehearsalCandidate,
  validateTestnetRehearsalAssemblyReport,
} from './testnet-rehearsal-assemble.js';
import { LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE } from './testnet-rehearsal-live-preflight.js';
import { buildTestnetRecoveryDrillEvidence } from './testnet-recovery-drill-evidence.js';

const EXPECTED_TX_ID = 'a'.repeat(64);
const OTHER_TX_ID = 'b'.repeat(64);
const BURN_TX_ID = '1'.repeat(64);
const DUP_SUCCESSOR_BOX_ID = '2'.repeat(64);
const SPV_TRACKER_SUCCESSOR_BOX_ID = '3'.repeat(64);
const RECIPIENT_PAYOUT_BOX_ID = '4'.repeat(64);
const SETTLEMENT_OUTPUT_BOX_ID = '5'.repeat(64);
const SINGLETON_ID = '6'.repeat(64);
const DEPLOYED_STATE_HASH = '7'.repeat(64);
const CONTRACT_ID = '8'.repeat(64);
const SIDECHAIN_HEADER_HASH = '9'.repeat(64);
const BRIDGE_EVENT_ROOT = 'c'.repeat(64);
const SINGLETON_NFT_ID = 'd'.repeat(64);
const SINGLETON_BOX_ID = 'e'.repeat(64);
const SINGLETON_TREE = '1001'.repeat(8);
const FRESH_CHECKPOINT_ERGO_NODE_URL = 'http://localhost:9052';
const FRESH_CHECKPOINT_SIDECHAIN_RPC_URL = 'http://localhost:9945';
const FULLWIDTH_BLOCKED = '\uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24';
const FULLWIDTH_TRUE = '\uFF34\uFF32\uFF35\uFF25';

const livePreflightPass = [
  'testnet rehearsal live preflight GO',
  '- scope: offline Markdown-only live-submit preflight; this report does not authorize broadcast.',
  `npm run rehearsal:live-preflight command output: artifact://gate/live-preflight.log PASS exit code 0 ` +
    `live-preflight target evidence/live-rehearsal.md approvals file target evidence/approvals.json ` +
    `approval JSON binding matched Expected transaction ID ${EXPECTED_TX_ID} reviewer approval evidence linked ` +
    `user explicit live broadcast approval evidence linked scoped shell evidence ` +
    `BRIDGE_BROADCAST_ENABLED=true scope limited npm run demo:readiness PASS ` +
    `Broadcast policy PASS Live settlement signing PASS Node URL http://localhost:9053 ` +
    `Ergo node network testnet Sidechain network patched-devnet`,
  '- live preflight report written: evidence/live-rehearsals/live-preflight.json',
].join('\n');

const draftMarkdown = `# Testnet Live Rehearsal Draft

## Session Metadata

- Date: 2026-05-17
- Operator: operator-a
- Reviewer: reviewer-a
- Environment: testnet
- Git commit: abc1234
- Release level being evaluated: institutional reference
- Ergo node network: testnet
- Sidechain network: patched-devnet
- Broadcast mode at start: disabled
- Broadcast mode at end: disabled

## Lifecycle Gate Classification

| Release gate | Status | Evidence artifact | Blocking note | Required next evidence |
|---|---|---|---|---|
| Fresh local devnet lifecycle | not applicable | artifact://draft/not-local-devnet | This is a testnet rehearsal draft. | None for this testnet draft. |
| Fresh testnet lifecycle | publication blocker | artifact://draft/testnet-lifecycle.md | Live submit, confirmation, and reconciliation remain pending. | Complete live testnet rehearsal evidence and validate it. |
| Peg-in evidence | publication blocker | artifact://draft/peg-in.md | Peg-in evidence remains pending. | Link completed peg-in evidence. |
| Peg-out burn evidence | publication blocker | artifact://draft/peg-out-burn.md burnTxHash=${BURN_TX_ID} | Peg-out burn evidence remains pending. | Link completed peg-out burn evidence. |
| Anchor evidence | publication blocker | artifact://draft/anchor.md bridgeEventRoot=${BRIDGE_EVENT_ROOT} | Anchor evidence remains pending. | Link completed anchor evidence. |
| Settlement check evidence | publication blocker | artifact://draft/settlement-check.md Expected transaction ID ${EXPECTED_TX_ID} | Settlement check evidence remains pending. | Link completed settlement check evidence. |
| Settlement submit evidence | publication blocker | artifact://draft/settlement-submit.md | Settlement submit evidence remains pending. | Capture submitted transaction ID. |
| Confirmation evidence | publication blocker | artifact://draft/confirmation.md | Confirmation evidence remains pending. | Capture confirmation evidence. |
| Reconciliation evidence | publication blocker | artifact://draft/reconciliation.md | Reconciliation evidence remains pending. | Capture reconciliation evidence. |
| Failed broadcast / phantom AVL evidence | publication blocker | artifact://draft/failed-broadcast-phantom-avl.md | Recovery drill evidence remains pending. | Run and link failed-broadcast recovery evidence. |
| Reorged burn / stale singleton evidence | publication blocker | artifact://draft/reorg-stale-singleton.md | Reorg recovery evidence remains pending. | Run and link reorg recovery evidence. |
| Backup-restore or reconstructibility evidence | publication blocker | artifact://draft/backup-restore.md | Backup-restore drill evidence remains pending. | Run and link backup-restore validation evidence. |

## Preflight Evidence

- Clean-checkout checks passed: <completed npm run check evidence>
- ContextExtension guard result: <completed ContextExtension guard evidence>
- Broadcast policy result: <completed broadcast disabled/refused evidence>
- Deployed singleton status: <completed singleton status evidence>
- Clean deployment state evidence: deployment-state hash ${DEPLOYED_STATE_HASH} contract ID ${CONTRACT_ID} singleton inventory ${SINGLETON_ID} artifact://draft/deployment-state.md
- Liquidity status: <completed liquidity evidence>
- Current Ergo height: <height> <completed node height evidence>
- Current sidechain height: <height> <completed sidechain height evidence>
- Pre-broadcast package: artifact://draft/prebroadcast.md
- Pre-broadcast doctor transcript/report: artifact://draft/doctor.log
- Rehearsal preflight transcript/report: artifact://draft/rehearsal-preflight.log

## Dry-Run Settlement Evidence

- Package 1 mode: batch
- Package 1 non-broadcast check command: npm run settle:aggregate -- check-batch ${BURN_TX_ID}
- Package 1 peg-out burn TX ID: ${BURN_TX_ID}
- Package 1 sidechain block height: 200
- Package 1 sidechain block hash: ${SIDECHAIN_HEADER_HASH}
- Package 1 bridge event root: ${BRIDGE_EVENT_ROOT}
- Package 1 Ergo anchor height: 100
- Package 1 aggregate claim count: 1
- Package 1 input count: 4
- Package 1 output count: 4
- Package 1 ContextExtension key counts per input: 0,4,4,2
- Package 1 Expected transaction ID: ${EXPECTED_TX_ID}
- Expected transaction ID: ${EXPECTED_TX_ID}
- Peg-out burn TX ID: ${BURN_TX_ID}

## Live Preflight Gate Handoff

- Live-preflight transcript/report: <artifact://.../live-preflight.log>
- Authorization boundary: this draft does not approve or authorize broadcast.

## Broadcast Enablement Evidence

- Reviewer approval recorded: <pending reviewer explicit live broadcast approval evidence naming reviewer-a and citing Expected transaction ID ${EXPECTED_TX_ID}>
- User approval recorded: <pending user explicit live broadcast approval evidence citing Expected transaction ID ${EXPECTED_TX_ID}>
- \`BRIDGE_BROADCAST_ENABLED=true\` set only in the intended shell: <pending scoped-shell evidence>
- Readiness command re-run after enabling broadcast: <pending npm run demo:readiness PASS evidence from the scoped shell>
- Broadcast policy reports \`PASS\`: <pending Broadcast policy PASS evidence>
- Live settlement readiness reports \`PASS\`: <pending Live settlement signing PASS evidence>
- Node URL and network re-confirmed: <pending Ergo node network testnet and Sidechain network patched-devnet evidence>

## Submit And Confirmation Evidence

- Submitted transaction ID: <pending submitted transaction ID>
- Confirmation policy met: no <pending finality evidence>

## Reconciliation Evidence

- Peg-out status after reconciliation: <pending status plus submitted transaction ID>
- No duplicate payout exists for the same burn: <pending evidence>

## Rollback And Cleanup

- Broadcast disabled in all shells: <pending final disabled-broadcast evidence>
- Runtime state files preserved but not staged: <pending git status evidence>
- Logs archived: <pending log archive evidence>
- Incident or regression issue opened if needed: <pending yes/no>
- Regression test or runbook update needed: <pending yes/no>

## Publication Evidence

- Release notes updated: no
- Required release-note updates: completed Gate 3 rehearsal release-note update evidence: <pending>
- Pending Evidence Register updated: no
- Required checklist updates: completed Gate 3 checklist update evidence: <pending>
- Production-ready claim allowed by this rehearsal: no
- Testnet production-candidate claim allowed by this rehearsal: no

## Reviewer Sign-Off

- Classification: inconclusive
- Publication blockers discovered: live submit, confirmation, and reconciliation remain pending
- Follow-up tests required: live testnet rehearsal
- Follow-up runbook changes required: no
- Reviewer: reviewer-a
- Date: 2026-05-17
`;

const postSubmitFragment = `## Submit And Confirmation Evidence

- Submitted transaction ID: ${EXPECTED_TX_ID} artifact://submit/live-submit.md
- Submission timestamp: 2026-05-17T10:30:00Z artifact://submit/live-submit.md
- First observed mempool height: 100 artifact://submit/live-submit.md
- Confirmation height: 104 artifact://confirm/live-confirm.md
- Confirmation count: 4 artifact://confirm/live-confirm.md
- Required confirmation count: 3
- Confirmation policy met: yes artifact://confirm/finality.md finality evidence artifact://confirm/live-confirm.md confirmationsRequired=3 confirmationsObserved=4 submitted transaction ID ${EXPECTED_TX_ID}
- Settlement output box IDs: ${SPV_TRACKER_SUCCESSOR_BOX_ID},${DUP_SUCCESSOR_BOX_ID},${RECIPIENT_PAYOUT_BOX_ID},${SETTLEMENT_OUTPUT_BOX_ID} artifact://confirm/live-confirm.md
- DUP successor box ID: ${DUP_SUCCESSOR_BOX_ID} artifact://confirm/live-confirm.md
- SPV tracker successor box ID: ${SPV_TRACKER_SUCCESSOR_BOX_ID} artifact://confirm/live-confirm.md
- Recipient payout box ID: ${RECIPIENT_PAYOUT_BOX_ID} artifact://confirm/live-confirm.md
- Recipient payout box IDs: ${RECIPIENT_PAYOUT_BOX_ID} artifact://confirm/live-confirm.md
- Miner fee output: feeNanoErg=1000000 artifact://confirm/live-confirm.md

## Reconciliation Evidence

- Peg-out status after reconciliation: settled for submitted transaction ID ${EXPECTED_TX_ID} artifact://reconcile/live-reconcile.md
- DUP history contains only confirmed keys: yes submitted DUP successor box ID ${DUP_SUCCESSOR_BOX_ID} artifact://reconcile/live-reconcile.md
- SPV tracker digest matches confirmed successor: yes submitted SPV tracker successor box ID ${SPV_TRACKER_SUCCESSOR_BOX_ID} artifact://reconcile/live-reconcile.md
- No duplicate payout exists for the same burn: yes peg-out burn TX ID ${BURN_TX_ID} recipient payout box ID ${RECIPIENT_PAYOUT_BOX_ID} recipient payout box IDs ${RECIPIENT_PAYOUT_BOX_ID} artifact://reconcile/live-reconcile.md
- Failed-event queue: empty artifact://reconcile/live-reconcile.md
- Manual repair performed: no artifact://reconcile/live-reconcile.md

## Post-Submit Gate Binding

- Fresh testnet lifecycle artifact cites submitted transaction ID ${EXPECTED_TX_ID}.
- Live-preflight JSON binding: evidence/live-rehearsals/live-preflight.json status GO Expected transaction ID ${EXPECTED_TX_ID} approved burn order ${BURN_TX_ID} runtimeBroadcastEnabled false pre-submit boundary preserved and authorization evidence linked.
- Production-ready claim allowed by this rehearsal: no
- Testnet production-candidate claim allowed by this rehearsal: no
`;

function postSubmitObserveReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const report: Record<string, unknown> = {
    schemaVersion: 1,
    status: 'CREATED',
    errors: [],
    markdown: postSubmitFragment,
    observation: {
      txBinding: {
        expectedTxId: EXPECTED_TX_ID,
        submittedTxId: EXPECTED_TX_ID,
        idsMatch: true,
      },
      burnOrder: [BURN_TX_ID],
      settlementOutputs: {
        outputCount: 4,
        boxIds: [SPV_TRACKER_SUCCESSOR_BOX_ID, DUP_SUCCESSOR_BOX_ID, RECIPIENT_PAYOUT_BOX_ID, SETTLEMENT_OUTPUT_BOX_ID],
      },
      successors: {
        spvTracker: {
          outputIndex: 0,
          boxId: SPV_TRACKER_SUCCESSOR_BOX_ID,
        },
        aggregateDup: {
          outputIndex: 1,
          boxId: DUP_SUCCESSOR_BOX_ID,
        },
      },
      recipientPayouts: [{
        burnTxId: BURN_TX_ID,
        outputIndex: 2,
        boxId: RECIPIENT_PAYOUT_BOX_ID,
      }],
      livePreflightBinding: {
        target: 'evidence/live-rehearsals/live-preflight.json',
        status: 'GO',
        expectedTxId: EXPECTED_TX_ID,
        approvedBurnTxHashes: [BURN_TX_ID],
        runtimeBroadcastEnabled: false,
        preSubmitBoundaryPreserved: true,
        authorizationEvidenceLinked: true,
      },
      minerFee: {
        outputIndex: 3,
        boxId: SETTLEMENT_OUTPUT_BOX_ID,
        feeNanoErg: '1000000',
      },
      confirmation: {
        height: 104,
        count: 4,
        required: 3,
        policyMet: true,
        finalityEvidenceArtifact: 'artifact://confirm/finality.md',
      },
      boundaries: {
        readOnlyObservation: true,
        signs: false,
        submits: false,
        confirms: false,
        reconciles: false,
        authorizesBroadcast: false,
        gate3ClosureAllowed: false,
        productionReadyClaimAllowed: false,
        testnetProductionCandidateClaimAllowed: false,
      },
    },
    ...overrides,
  };
  if (!Object.prototype.hasOwnProperty.call(overrides, 'sourceBindings')) {
    report.sourceBindings = postSubmitObserveSourceBindings(report.observation as Record<string, unknown>);
  }
  return report;
}

function postSubmitObserveSourceBindings(observation: Record<string, unknown>) {
  const txBinding = observation.txBinding as Record<string, unknown>;
  return {
    node: {
      sourceType: 'live-read-only-node',
      readOnly: true,
      noAuthHeader: true,
      ergoNodeUrl: 'http://localhost:9053',
      observedAt: '2026-05-20T00:00:00Z',
      nodeHeight: 104,
      nodeNetwork: 'Ergo testnet',
      expectedTxId: txBinding.expectedTxId,
      submittedTxId: txBinding.submittedTxId,
      operations: ['read-only /info', 'read-only transaction lookup'],
    },
    state: {
      sourceType: 'read-only-state-tracker',
      readOnly: true,
      runtimePathSerialized: false,
      targetClass: 'operator-provided-state-db',
      burnOrder: observation.burnOrder,
      operations: ['read-only peg-out state lookup'],
    },
  };
}

const failedBroadcastRow = buildTestnetRecoveryDrillEvidence({
  kind: 'failed-broadcast-phantom-avl',
  evidenceArtifact: 'artifact://recovery/failed-broadcast-phantom-avl.md',
  validationArtifact: 'artifact://recovery/failed-broadcast-rehearsal-validate.log',
  observationArtifact: 'artifact://recovery/failed-broadcast-observe.json',
  expectedTxId: EXPECTED_TX_ID,
  pegOutBurnTxId: BURN_TX_ID,
}).markdown!;

const reorgRecoveryRow = buildTestnetRecoveryDrillEvidence({
  kind: 'reorged-burn-stale-singleton',
  evidenceArtifact: 'artifact://recovery/reorg-stale-singleton.md',
  validationArtifact: 'artifact://recovery/reorg-rehearsal-validate.log',
  observationArtifact: 'artifact://recovery/reorg-observe.json',
  pegOutBurnTxId: BURN_TX_ID,
  singletonInventoryId: SINGLETON_ID,
}).markdown!;

const reorgTestRecoveryRow = buildTestnetRecoveryDrillEvidence({
  kind: 'reorged-burn-stale-singleton',
  evidenceArtifact: 'artifact://recovery/reorg-stale-singleton.md',
  validationArtifact: 'artifact://recovery/reorg-recovery-test.log',
  observationArtifact: 'artifact://recovery/reorg-observe.json',
  pegOutBurnTxId: BURN_TX_ID,
  singletonInventoryId: SINGLETON_ID,
}).markdown!;

function freshCheckpointReport(overrides: {
  status?: string;
  checkpoint?: Record<string, unknown>;
  boundary?: Record<string, unknown>;
} = {}): Record<string, unknown> {
  const observedAt = new Date().toISOString();
  return {
    status: overrides.status ?? 'CREATED',
    message: 'fresh testnet non-broadcast checkpoint CREATED publication-blocker',
    errors: [],
    checkpoint: {
      aggregateEvidence: 'evidence/fresh/aggregate-check.json',
      lifecycleGate: 'Fresh testnet lifecycle',
      lifecycleStatus: 'publication blocker',
      ergoNodeNetwork: 'testnet',
      sidechainNetwork: 'patched-devnet',
      currentErgoHeight: 250,
      currentSidechainHeight: 300,
      expectedTxId: EXPECTED_TX_ID,
      burnTxHashes: [BURN_TX_ID],
      sidechainBlockHeights: [200],
      sidechainHeaderHashHexes: [SIDECHAIN_HEADER_HASH],
      ergoAnchorHeights: [100],
      bridgeEventRootHexes: [BRIDGE_EVENT_ROOT],
      transactionCheckResult: 'PASS',
      broadcast: 'no',
      anchorObservations: [{
        ergoAnchorHeight: 100,
        expectedBridgeEventRootHex: BRIDGE_EVENT_ROOT,
        observedBridgeEventRootHexes: [BRIDGE_EVENT_ROOT],
        matchingFieldFound: true,
        fieldCount: 1,
        headerIds: ['f'.repeat(64)],
        observedAt,
        nodeHeight: 250,
      }],
      singletonCheckpoint: {
        deployedStateHash: DEPLOYED_STATE_HASH,
        observedAt,
        nodeHeight: 250,
        nodeNetwork: 'testnet',
        expectedTxId: EXPECTED_TX_ID,
        expectedTxMempoolAbsent: true,
        expectedTxConfirmedAbsent: true,
        singletons: [{
          name: 'sideChainState',
          nftId: SINGLETON_NFT_ID,
          expectedBoxId: SINGLETON_BOX_ID,
          observedBoxId: SINGLETON_BOX_ID,
          expectedErgoTreeHex: SINGLETON_TREE,
          observedErgoTreeHex: SINGLETON_TREE,
          observedCount: 1,
        }],
      },
      heightEvidence: {
        observedAt,
        ergoNodeHeight: 250,
        sidechainBlockHeight: 300,
        sources: {
          ergo: 'read-only-no-auth /info',
          sidechain: 'read-only EVM getBlockNumber',
        },
        broadcastEnabled: false,
      },
      singletonObservationFreshness: {
        observedAt,
        checkedAt: observedAt,
        maxAgeSeconds: 900,
        maxAgeMinutes: 15,
        ageSeconds: 0,
        ageMs: 0,
        status: 'fresh',
      },
      ...(overrides.checkpoint ?? {}),
    },
    sourceBindings: {
      aggregateEvidence: 'evidence/fresh/aggregate-check.json',
      singletonCheckpoint: {
        mode: 'live-read-only-node',
        ergoNodeUrl: FRESH_CHECKPOINT_ERGO_NODE_URL,
        observedAt,
        nodeHeight: 250,
        expectedTxId: EXPECTED_TX_ID,
        deployedStateHash: DEPLOYED_STATE_HASH,
        singletonCount: 1,
        readOnlyNodeClient: true,
        nodeAuthHeader: 'not-used',
        operations: [
          '/info',
          'singleton boxes by token ID',
          'mempool/unconfirmed transaction lookup',
          'confirmed transaction lookup',
        ],
      },
      anchorObservations: {
        mode: 'live-read-only-node',
        ergoNodeUrl: FRESH_CHECKPOINT_ERGO_NODE_URL,
        observationCount: 1,
        ergoAnchorHeights: [100],
        bridgeEventRootHexes: [BRIDGE_EVENT_ROOT],
        observedAtValues: [observedAt],
        nodeHeights: [250],
        readOnlyNodeClient: true,
        nodeAuthHeader: 'not-used',
        operations: [
          '/info',
          'Ergo extension fields at aggregate anchor heights',
          '0x0401 bridgeEventRoot matching',
        ],
      },
      heightEvidence: {
        mode: 'live-read-only-sources',
        ergoNodeUrl: FRESH_CHECKPOINT_ERGO_NODE_URL,
        sidechainRpcUrl: FRESH_CHECKPOINT_SIDECHAIN_RPC_URL,
        observedAt,
        ergoNodeHeight: 250,
        sidechainBlockHeight: 300,
        broadcastEnabled: false,
        readOnlyErgoNodeClient: true,
        readOnlySidechainRpcClient: true,
        nodeAuthHeader: 'not-used',
        operations: ['/info', 'EVM getBlockNumber'],
      },
    },
    boundary: {
      lifecyclePassAllowed: false,
      broadcastAuthorized: false,
      liveSubmitPerformed: false,
      confirmationObserved: false,
      reconciliationPerformed: false,
      gate3ClosureAllowed: false,
      productionReadyClaimAllowed: false,
      testnetProductionCandidateClaimAllowed: false,
      ...(overrides.boundary ?? {}),
    },
  };
}

describe('assembleTestnetRehearsalCandidate', () => {
  it('blocks unsafe CLI JSON output targets before reading assembly inputs', () => {
    const jsonOutTarget = '../operator/private-key-report.json';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-rehearsal-assemble.ts',
        '--draft',
        'missing-draft.md',
        '--live-preflight',
        'missing-live-preflight.json',
        '--json-out',
        jsonOutTarget,
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
    expect(result.stderr).not.toContain('missing-draft.md');
    expect(result.stderr).not.toContain('missing-live-preflight.json');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('blocks unsafe CLI Markdown output targets before reading assembly inputs', () => {
    const outTarget = '../operator/private-key-candidate.md';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-rehearsal-assemble.ts',
        '--draft',
        'missing-draft.md',
        '--live-preflight',
        'missing-live-preflight.json',
        '--out',
        outTarget,
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
    expect(result.stderr).not.toContain('missing-draft.md');
    expect(result.stderr).not.toContain('missing-live-preflight.json');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('keeps CLI output guards before assembly input reads', () => {
    const source = readFileSync(
      new URL('./scripts/testnet-rehearsal-assemble.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain("import { resolveEvidenceOutputPath } from '../evidence-output-path.js'");
    expect(source).toContain('const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;');
    expect(source).toContain("import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js'");
    expect(source).toContain('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;');
    expect(source).toContain('const report = assembleTestnetRehearsalCandidate({');
    expect(source.indexOf('const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;')).toBeLessThan(
      source.indexOf('const report = assembleTestnetRehearsalCandidate({'),
    );
    expect(source.indexOf('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;')).toBeLessThan(
      source.indexOf('const report = assembleTestnetRehearsalCandidate({'),
    );
  });

  it('blocks a legacy V1 transcript before creating a publication-blocked candidate', () => {
    const dir = join(tmpdir(), `bridge-assemble-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const draft = 'draft.md';
    const livePreflight = 'live-preflight.log';
    writeFileSync(join(dir, draft), draftMarkdown, 'utf8');
    writeFileSync(join(dir, livePreflight), livePreflightPass, 'utf8');

    const report = assembleTestnetRehearsalCandidate({
      draft,
      livePreflight,
      workspaceRoot: dir,
      bridgeRoot: dir,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE);
    expect(report.markdown).toBeUndefined();
    expect(report.rehearsalValidation).toBeUndefined();
  });

  it('blocks candidate assembly from a quarantined legacy V1 live-preflight report', () => {
    const dir = join(tmpdir(), `bridge-assemble-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const draft = 'draft.md';
    const livePreflight = 'live-preflight.json';
    writeFileSync(join(dir, draft), draftMarkdown, 'utf8');
    writeFileSync(join(dir, livePreflight), JSON.stringify({
      schemaVersion: 1,
      status: 'GO',
      errors: [],
      expectedTxId: EXPECTED_TX_ID,
      runtimeBroadcastEnabled: false,
      targetBindings: {
        rehearsal: 'evidence/live-rehearsal.md',
        approvals: 'evidence/approvals.json',
        transcript: 'artifact://gate/live-preflight.log',
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
        expectedTxId: EXPECTED_TX_ID,
        burnTxHashes: [BURN_TX_ID],
        environment: 'testnet',
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedStateHash: DEPLOYED_STATE_HASH,
      },
      lines: livePreflightPass.split('\n'),
    }, null, 2), 'utf8');

    const report = assembleTestnetRehearsalCandidate({
      draft,
      livePreflight,
      workspaceRoot: dir,
      bridgeRoot: dir,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toContain(LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE);
    expect(report.targetBindings.livePreflight).toBe(livePreflight);
  });

  it('does not let a fresh checkpoint promote a legacy V1 transcript', () => {
    const dir = join(tmpdir(), `bridge-assemble-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const draft = 'draft.md';
    const livePreflight = 'live-preflight.log';
    const freshCheckpoint = 'fresh-checkpoint.json';
    writeFileSync(join(dir, draft), draftMarkdown, 'utf8');
    writeFileSync(join(dir, livePreflight), livePreflightPass, 'utf8');
    writeFileSync(join(dir, freshCheckpoint), JSON.stringify(freshCheckpointReport(), null, 2), 'utf8');

    const report = assembleTestnetRehearsalCandidate({
      draft,
      livePreflight,
      freshCheckpoint,
      workspaceRoot: dir,
      bridgeRoot: dir,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE);
    expect(report.errors.some(error => error.startsWith('fresh-checkpoint:'))).toBe(false);
    expect(report.markdown).toBeUndefined();
    expect(report.targetBindings.freshCheckpoint).toBe(freshCheckpoint);
  });

  it('fails closed when a fresh checkpoint omits concrete live endpoint provenance', () => {
    const checkpoint = freshCheckpointReport();
    const sourceBindings = checkpoint.sourceBindings as any;
    delete sourceBindings.heightEvidence.ergoNodeUrl;
    sourceBindings.heightEvidence.sidechainRpcUrl = '<sidechain-rpc-url>';
    sourceBindings.singletonCheckpoint.ergoNodeUrl = '<node-url>';
    delete sourceBindings.anchorObservations.ergoNodeUrl;

    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      freshCheckpoint: 'fresh-checkpoint.json',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') return livePreflightPass;
        return JSON.stringify(checkpoint);
      },
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'freshCheckpoint: sourceBindings.heightEvidence.ergoNodeUrl must cite a concrete read-only http(s) URL',
    );
    expect(report.errors).toContain(
      'freshCheckpoint: sourceBindings.heightEvidence.sidechainRpcUrl must cite a concrete non-template read-only http(s) URL',
    );
    expect(report.errors).toContain(
      'freshCheckpoint: sourceBindings.singletonCheckpoint.ergoNodeUrl must cite a concrete non-template read-only http(s) URL',
    );
    expect(report.errors).toContain(
      'freshCheckpoint: sourceBindings.anchorObservations.ergoNodeUrl must cite a concrete read-only http(s) URL',
    );
  });

  it('fails closed when a structured live-preflight JSON report is not GO', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.json',
      readFile: target => target === 'draft.md'
        ? draftMarkdown
        : JSON.stringify({
          schemaVersion: 1,
          status: 'BLOCKED',
          errors: ['missing approval binding'],
          expectedTxId: EXPECTED_TX_ID,
          lines: livePreflightPass.split('\n'),
        }),
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('live-preflight: JSON report status must be GO');
    expect(report.errors).toContain('live-preflight: JSON report errors must be empty');
  });

  it('fails closed when a structured live-preflight JSON report omits boundary bindings', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.json',
      readFile: target => target === 'draft.md'
        ? draftMarkdown
        : JSON.stringify({
          schemaVersion: 1,
          status: 'GO',
          errors: [],
          expectedTxId: EXPECTED_TX_ID,
          runtimeBroadcastEnabled: false,
          targetBindings: {
            rehearsal: 'evidence/live-rehearsal.md',
            approvals: '',
          },
          preSubmitBoundary: {
            reportAuthorizesBroadcast: true,
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
            approvalJsonBinding: 'blocked',
            releaseGateTranscriptLine: 'blocked',
          },
          lines: livePreflightPass.split('\n'),
        }),
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('live-preflight: JSON report targetBindings.approvals must be present');
    expect(report.errors).toContain('live-preflight: JSON report targetBindings.transcript must be present');
    expect(report.errors).toContain('live-preflight: JSON report preSubmitBoundary.reportAuthorizesBroadcast must be false');
    expect(report.errors).toContain('live-preflight: JSON report authorizationEvidence.approvalJsonBinding must be matched');
    expect(report.errors).toContain('live-preflight: JSON report authorizationEvidence.releaseGateTranscriptLine must be emitted');
  });

  it('fails closed when a structured live-preflight JSON report escalates claim boundaries', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.json',
      readFile: target => target === 'draft.md'
        ? draftMarkdown
        : JSON.stringify({
          schemaVersion: 1,
          status: 'GO',
          errors: [],
          expectedTxId: EXPECTED_TX_ID,
          runtimeBroadcastEnabled: false,
          targetBindings: {
            rehearsal: 'evidence/live-rehearsal.md',
            approvals: 'evidence/approvals.json',
            transcript: 'artifact://gate/live-preflight.log',
          },
          preSubmitBoundary: {
            reportAuthorizesBroadcast: false,
            liveSubmitPerformed: false,
            confirmationObserved: false,
            reconciliationPerformed: false,
            gate3ClosureAllowed: false,
            productionReadyClaimAllowed: true,
            testnetProductionCandidateClaimAllowed: true,
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
          lines: livePreflightPass.split('\n'),
        }),
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('live-preflight: JSON report preSubmitBoundary.productionReadyClaimAllowed must be false');
    expect(report.errors).toContain('live-preflight: JSON report preSubmitBoundary.testnetProductionCandidateClaimAllowed must be false');
  });

  it('fails closed when a fresh checkpoint boundary authorizes broadcast or Gate 3 closure', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      freshCheckpoint: 'fresh-checkpoint.json',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') return livePreflightPass;
        return JSON.stringify(freshCheckpointReport({
          boundary: {
            broadcastAuthorized: true,
            gate3ClosureAllowed: true,
          },
        }));
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('freshCheckpoint: boundary.broadcastAuthorized must be false');
    expect(report.errors).toContain('freshCheckpoint: boundary.gate3ClosureAllowed must be false');
  });

  it('fails closed when a fresh checkpoint is not a publication-blocker CREATED report', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      freshCheckpoint: 'fresh-checkpoint.json',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') return livePreflightPass;
        return JSON.stringify(freshCheckpointReport({
          status: 'BLOCKED',
          checkpoint: { lifecycleStatus: 'pass' },
        }));
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('freshCheckpoint: status must be CREATED');
    expect(report.errors).toContain('freshCheckpoint: checkpoint.lifecycleStatus must be publication blocker');
  });

  it('fails closed when a fresh checkpoint does not match draft identifiers', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      freshCheckpoint: 'fresh-checkpoint.json',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') return livePreflightPass;
        const checkpoint = freshCheckpointReport();
        (checkpoint.checkpoint as any).expectedTxId = OTHER_TX_ID;
        (checkpoint.checkpoint as any).burnTxHashes = [OTHER_TX_ID];
        (checkpoint.checkpoint as any).singletonCheckpoint.expectedTxId = OTHER_TX_ID;
        (checkpoint.checkpoint as any).singletonCheckpoint.deployedStateHash = OTHER_TX_ID;
        (checkpoint.sourceBindings as any).singletonCheckpoint.expectedTxId = OTHER_TX_ID;
        (checkpoint.sourceBindings as any).singletonCheckpoint.deployedStateHash = OTHER_TX_ID;
        return JSON.stringify(checkpoint);
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('fresh-checkpoint: Expected transaction ID must match draft Expected transaction ID');
    expect(report.errors).toContain('fresh-checkpoint: burnTxHashes must include draft peg-out burn TX ID');
    expect(report.errors).toContain('fresh-checkpoint: deployed-state hash must match draft clean deployment state evidence');
  });

  it('fails closed when a fresh checkpoint does not prove the expected transaction is absent from confirmed chain', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      freshCheckpoint: 'fresh-checkpoint.json',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') return livePreflightPass;
        return JSON.stringify(freshCheckpointReport({
          checkpoint: {
            singletonCheckpoint: {
              ...(freshCheckpointReport().checkpoint as any).singletonCheckpoint,
              expectedTxConfirmedAbsent: false,
            },
          },
        }));
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'freshCheckpoint: singleton checkpoint must prove Expected transaction ID is absent from confirmed chain',
    );
  });

  it('fails closed for unsafe fresh checkpoint targets', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      freshCheckpoint: '../runtime/fresh-checkpoint.sqlite',
      readFile: () => '',
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('fresh-checkpoint: <blocked rehearsal target> must have extension .json');
    expect(report.errors).toContain('fresh-checkpoint: <blocked rehearsal target> must not reference runtime or secret-bearing material');

    for (const target of [
      '../operator/signing-key-checkpoint.json',
      '../operator/api-key-checkpoint.json',
      '../operator/seed-phrase-checkpoint.json',
      '../evidence/sourceTarget=(.env)/fresh-checkpoint.json',
      '../evidence/sourceTarget=(runtime/bridge-state.sqlite)/fresh-checkpoint.json',
      '../evidence/sourceTarget=%28.env%29/fresh-checkpoint.json',
      '../evidence/sourceTarget=%28runtime%2Fbridge-state.sqlite%29/fresh-checkpoint.json',
      '../runtime/deployed_state.json',
    ]) {
      const secretReport = assembleTestnetRehearsalCandidate({
        draft: 'draft.md',
        livePreflight: 'live-preflight.log',
        freshCheckpoint: target,
        readFile: () => '',
        resolvePath: candidate => `/repo/${candidate}`,
      });

      expect(secretReport.status, target).toBe('BLOCKED');
      expect(secretReport.errors, target).toContain(
        'fresh-checkpoint: <blocked rehearsal target> must not reference runtime or secret-bearing material',
      );
    }
  });

  it('blocks local absolute artifact targets without leaking target filenames', () => {
    const localAbsoluteTarget = ['', 'tmp', 'fresh-checkpoint.json'].join('/');
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      freshCheckpoint: localAbsoluteTarget,
      readFile: target => {
        throw new Error(`${target} should not be read when artifact target validation fails`);
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'fresh-checkpoint: <blocked rehearsal target> must be a relative path inside the bridge repository',
    );
    expect(report.errors.join('\n')).not.toContain('fresh-checkpoint.json');
  });

  it('blocks shell-unsafe artifact targets before reading or exposing assembly bindings', () => {
    const targets = {
      draft: 'evidence/rehearsal draft.md',
      livePreflight: 'evidence/live preflight.log',
      postSubmit: 'evidence/post submit.json',
      freshCheckpoint: 'evidence/fresh checkpoint.json',
      failedBroadcast: 'evidence/failed broadcast.md',
      reorgRecovery: 'evidence/reorg recovery.md',
      out: 'evidence/assembled rehearsal.md',
    };
    const report = assembleTestnetRehearsalCandidate({
      ...targets,
      readFile: target => {
        throw new Error(`${target} should not be read when artifact target validation fails`);
      },
      resolvePath: target => `/repo/${target}`,
    });
    const serialized = JSON.stringify(report);

    expect(report.status).toBe('BLOCKED');
    for (const key of ['draft', 'live-preflight', 'post-submit', 'fresh-checkpoint', 'failed-broadcast', 'reorg-recovery', 'out']) {
      expect(report.errors).toContain(
        `${key}: <blocked rehearsal target> must not contain whitespace or shell metacharacters`,
      );
    }
    expect(report.targetBindings).toEqual({
      draft: '<blocked rehearsal target>',
      livePreflight: '<blocked rehearsal target>',
      postSubmitObserveJson: '<blocked rehearsal target>',
      freshCheckpoint: '<blocked rehearsal target>',
      failedBroadcast: '<blocked rehearsal target>',
      reorgRecovery: '<blocked rehearsal target>',
      out: '<blocked rehearsal target>',
    });
    expect(report.markdown).toBeUndefined();
    expect(serialized).toContain('<blocked rehearsal target>');
    for (const target of Object.values(targets)) {
      expect(serialized).not.toContain(target);
    }
  });

  it('blocks fresh checkpoint targets that resolve outside the bridge without leaking the target', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bridge-assemble-'));
    const external = mkdtempSync(join(tmpdir(), 'bridge-assemble-fresh-checkpoint-'));
    try {
      const draft = 'draft.md';
      const livePreflight = 'live-preflight.log';
      writeFileSync(join(dir, draft), draftMarkdown, 'utf8');
      writeFileSync(join(dir, livePreflight), livePreflightPass, 'utf8');
      writeFileSync(join(external, 'fresh-checkpoint.json'), JSON.stringify(freshCheckpointReport(), null, 2), 'utf8');
      symlinkSync(external, join(dir, 'link-out'), process.platform === 'win32' ? 'junction' : 'dir');

      const report = assembleTestnetRehearsalCandidate({
        draft,
        livePreflight,
        freshCheckpoint: 'link-out/fresh-checkpoint.json',
        workspaceRoot: dir,
        bridgeRoot: dir,
      });
      const serialized = JSON.stringify(report);

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'fresh-checkpoint: <blocked rehearsal target> must resolve inside the bridge repository',
      );
      expect(serialized).toContain('<blocked rehearsal target>');
      expect(serialized).not.toContain('link-out');
      expect(serialized).not.toContain('fresh-checkpoint.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });

  it('rejects post-submit Markdown-only assembly before reading companion evidence', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.md',
      postSubmit: 'post-submit.md',
      readFile: target => {
        throw new Error(`${target} should not be read when post-submit target validation fails`);
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('post-submit: post-submit.md must have extension .json');
    expect(report.markdown).toBeUndefined();
    expect(report.rehearsalValidation).toBeUndefined();
    expect(report.lines.join('\n')).toContain('fix local artifact evidence and rerun assembly');
    expect(report.lines.join('\n')).not.toContain('npm run rehearsal:validate command output: PASS');
  });

  it('validates structured post-submit observe JSON but blocks its legacy V1 preflight', () => {
    const dir = join(tmpdir(), `bridge-assemble-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const draft = 'draft.md';
    const livePreflight = 'live-preflight.md';
    const postSubmit = 'post-submit-observe.json';
    const freshCheckpoint = 'fresh-checkpoint.json';
    writeFileSync(join(dir, draft), draftMarkdown, 'utf8');
    writeFileSync(join(dir, livePreflight), livePreflightPass, 'utf8');
    writeFileSync(join(dir, postSubmit), JSON.stringify(postSubmitObserveReport(), null, 2), 'utf8');
    writeFileSync(join(dir, freshCheckpoint), JSON.stringify(freshCheckpointReport(), null, 2), 'utf8');

    const report = assembleTestnetRehearsalCandidate({
      draft,
      livePreflight,
      postSubmit,
      freshCheckpoint,
      workspaceRoot: dir,
      bridgeRoot: dir,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE);
    expect(report.errors.some(error => error.startsWith('post-submit:'))).toBe(false);
    expect(report.markdown).toBeUndefined();
    expect(report.targetBindings).toEqual({
      draft,
      livePreflight,
      postSubmitObserveJson: postSubmit,
      freshCheckpoint,
    });
    expect(report.rehearsalValidation).toBeUndefined();
  });

  it('rejects a JSON post-submit target that is not a structured observe report', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      postSubmit: 'post-submit-observe.json',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') return livePreflightPass;
        return postSubmitFragment;
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('post-submit: JSON observe report must be valid JSON');
  });

  it('fails closed when live-preflight PASS output cites row-named non-concrete targets', () => {
    const expectedNonConcreteTargetErrors = [
      'live-preflight: transcript target must be a completed artifact target or non-template link',
      'live-preflight: live-preflight target must cite a completed rehearsal artifact target or non-template link',
      'live-preflight: approvals file target must cite a concrete non-template JSON approvals target',
    ];

    const weakLivePreflightPass = livePreflightPass
      .replace('artifact://gate/live-preflight.log', 'artifact://gate/sample-live-preflight.log')
      .replace(
        'live-preflight target evidence/live-rehearsal.md approvals file target evidence/approvals.json',
        'live-preflight target evidence/sample-live-rehearsal.md approvals file target evidence/sample-approvals.json',
      );
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      readFile: target => target === 'draft.md' ? draftMarkdown : weakLivePreflightPass,
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toEqual(expect.arrayContaining(expectedNonConcreteTargetErrors));

    const genericLivePreflightPass = livePreflightPass
      .replace('artifact://gate/live-preflight.log', 'artifact://gate/sample-evidence-live-preflight.log')
      .replace(
        'live-preflight target evidence/live-rehearsal.md approvals file target evidence/approvals.json',
        'live-preflight target evidence/generic-live-rehearsal.md approvals file target evidence/generic-approvals.json',
      );
    const genericReport = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      readFile: target => target === 'draft.md' ? draftMarkdown : genericLivePreflightPass,
      resolvePath: target => `/repo/${target}`,
    });

    expect(genericReport.status).toBe('BLOCKED');
    expect(genericReport.errors).toEqual(expect.arrayContaining(expectedNonConcreteTargetErrors));

    const fixtureLivePreflightPass = livePreflightPass
      .replace('artifact://gate/live-preflight.log', 'artifact://gate/fixture-live-preflight.log')
      .replace(
        'live-preflight target evidence/live-rehearsal.md approvals file target evidence/approvals.json',
        'live-preflight target evidence/mock-live-rehearsal.md approvals file target evidence/testdata-approvals.json',
      );
    const fixtureReport = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      readFile: target => target === 'draft.md' ? draftMarkdown : fixtureLivePreflightPass,
      resolvePath: target => `/repo/${target}`,
    });

    expect(fixtureReport.status).toBe('BLOCKED');
    expect(fixtureReport.errors).toEqual(expect.arrayContaining(expectedNonConcreteTargetErrors));

    const syntheticLivePreflightPass = livePreflightPass
      .replace('artifact://gate/live-preflight.log', 'artifact://gate/completed-synthetic-live-preflight.log')
      .replace(
        'live-preflight target evidence/live-rehearsal.md approvals file target evidence/approvals.json',
        'live-preflight target evidence/completed-synthetic-live-rehearsal.md approvals file target evidence/completed-synthetic-approvals.json',
      );
    const syntheticReport = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      readFile: target => target === 'draft.md' ? draftMarkdown : syntheticLivePreflightPass,
      resolvePath: target => `/repo/${target}`,
    });

    expect(syntheticReport.status).toBe('BLOCKED');
    expect(syntheticReport.errors).toEqual(expect.arrayContaining(expectedNonConcreteTargetErrors));

    const simulatedLivePreflightPass = livePreflightPass
      .replace('artifact://gate/live-preflight.log', 'artifact://gate/completed-simulated-live-preflight.log')
      .replace(
        'live-preflight target evidence/live-rehearsal.md approvals file target evidence/approvals.json',
        'live-preflight target evidence/completed-simulated-live-rehearsal.md approvals file target evidence/completed-simulated-approvals.json',
      );
    const simulatedReport = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      readFile: target => target === 'draft.md' ? draftMarkdown : simulatedLivePreflightPass,
      resolvePath: target => `/repo/${target}`,
    });

    expect(simulatedReport.status).toBe('BLOCKED');
    expect(simulatedReport.errors).toEqual(expect.arrayContaining(expectedNonConcreteTargetErrors));
  });

  it('fails closed when live-preflight PASS output cites claim-escalating targets', () => {
    const claimEscalatingLivePreflightPass = livePreflightPass
      .replace('artifact://gate/live-preflight.log', 'artifact://gate/live-preflight-testnet-production-candidate.log')
      .replace(
        'live-preflight target evidence/live-rehearsal.md approvals file target evidence/approvals.json',
        'live-preflight target evidence/live-rehearsal-testnet-production-candidate.md approvals file target evidence/approvals-testnet-production-candidate.json',
      )
      .replace(
        'evidence/live-rehearsals/live-preflight.json',
        'evidence/live-rehearsals/live-preflight-testnet-production-candidate.json',
      );
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      readFile: target => target === 'draft.md' ? draftMarkdown : claimEscalatingLivePreflightPass,
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toEqual(expect.arrayContaining([
      'live-preflight: transcript target must be a completed artifact target or non-template link',
      'live-preflight: live-preflight target must cite a completed rehearsal artifact target or non-template link',
      'live-preflight: approvals file target must cite a concrete non-template JSON approvals target',
    ]));
  });

  it('recognizes concrete audit targets but still blocks the legacy V1 transcript', () => {
    const concreteLivePreflightPass = livePreflightPass
      .replace('artifact://gate/live-preflight.log', 'artifact://gate/template-removal-audit-live-preflight.log')
      .replace(
        'live-preflight target evidence/live-rehearsal.md approvals file target evidence/approvals.json',
        'live-preflight target evidence/template-removal-audit-live-rehearsal.md approvals file target evidence/sample-size-analysis-approvals.json',
      )
      .replace(
        'evidence/live-rehearsals/live-preflight.json',
        'evidence/live-rehearsals/template-removal-audit-live-preflight.json',
      );
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'template-removal-audit-live-preflight.log',
      readFile: target => target === 'draft.md' ? draftMarkdown : concreteLivePreflightPass,
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toEqual([LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE]);
    expect(report.markdown).toBeUndefined();
  });

  it('fails closed when live-preflight PASS output cites local-only evidence targets', () => {
    for (const [transcriptTarget, rehearsalTarget, approvalsTarget] of [
      [
        ['file:', '', '', 'C:', 'tmp', 'live-preflight.log'].join('/'),
        ['C:', 'tmp', 'live-rehearsal.md'].join('/'),
        ['', '', 'share-name', 'approvals.json'].join('/'),
      ],
      [
        'file%3A%2F%2F%2FC%3A%2Ftmp%2Flive-preflight.log',
        'C%3A%2Ftmp%2Flive-rehearsal.md',
        '%2F%2Fshare-name%2Fapprovals.json',
      ],
      [
        'artifact://gate/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Flive-preflight.log',
        'artifact://gate/sourceTarget=C%3A%2Ftmp%2Flive-rehearsal.md',
        'artifact://gate/sourceTarget=%2F%2Fshare-name%2Fapprovals.json',
      ],
    ]) {
      const localOnlyLivePreflightPass = livePreflightPass
        .replace('artifact://gate/live-preflight.log', transcriptTarget)
        .replace(
          'live-preflight target evidence/live-rehearsal.md approvals file target evidence/approvals.json',
          `live-preflight target ${rehearsalTarget} approvals file target ${approvalsTarget}`,
        );
      const report = assembleTestnetRehearsalCandidate({
        draft: 'draft.md',
        livePreflight: 'live-preflight.log',
        readFile: target => target === 'draft.md' ? draftMarkdown : localOnlyLivePreflightPass,
        resolvePath: target => `/repo/${target}`,
      });

      expect(report.status, transcriptTarget).toBe('BLOCKED');
      expect(report.errors, transcriptTarget).toEqual(expect.arrayContaining([
        'live-preflight: transcript target must be a completed artifact target or non-template link',
        'live-preflight: live-preflight target must cite a completed rehearsal artifact target or non-template link',
        'live-preflight: approvals file target must cite a concrete non-template JSON approvals target',
      ]));
    }
  });

  it('fails closed when structured post-submit observe JSON weakens observation boundaries', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      postSubmit: 'post-submit-observe.json',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') return livePreflightPass;
        return JSON.stringify(postSubmitObserveReport({
          observation: {
            ...(postSubmitObserveReport().observation as Record<string, unknown>),
            boundaries: {
              ...((postSubmitObserveReport().observation as any).boundaries),
              authorizesBroadcast: true,
              gate3ClosureAllowed: true,
            },
          },
        }));
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('post-submit: JSON observe report boundaries.authorizesBroadcast must be false');
    expect(report.errors).toContain('post-submit: JSON observe report boundaries.gate3ClosureAllowed must be false');
  });

  it('fails closed when structured post-submit observe transaction binding diverges from the draft', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      postSubmit: 'post-submit-observe.json',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') return livePreflightPass;
        const observeReport = postSubmitObserveReport({
          markdown: postSubmitFragment.replaceAll(EXPECTED_TX_ID, OTHER_TX_ID),
        });
        const observation = {
          ...(observeReport.observation as Record<string, unknown>),
          txBinding: {
            expectedTxId: OTHER_TX_ID,
            submittedTxId: OTHER_TX_ID,
            idsMatch: true,
          },
          livePreflightBinding: {
            ...((observeReport.observation as any).livePreflightBinding),
            expectedTxId: OTHER_TX_ID,
          },
        };
        return JSON.stringify({
          ...observeReport,
          observation,
          sourceBindings: postSubmitObserveSourceBindings(observation),
        });
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('post-submit: JSON observe report expectedTxId must match draft Expected transaction ID');
    expect(report.errors).toContain('post-submit: JSON observe report submittedTxId must match draft Expected transaction ID');
  });

  it('fails closed when structured post-submit observe burn order diverges from the draft', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      postSubmit: 'post-submit-observe.json',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') return livePreflightPass;
        const observeReport = postSubmitObserveReport();
        const observation = observeReport.observation as Record<string, unknown>;
        const recipientPayouts = observation.recipientPayouts as Array<Record<string, unknown>>;
        const livePreflightBinding = observation.livePreflightBinding as Record<string, unknown>;
        const driftedObservation = {
          ...observation,
          burnOrder: [OTHER_TX_ID],
          recipientPayouts: [{
            ...recipientPayouts[0],
            burnTxId: OTHER_TX_ID,
          }],
          livePreflightBinding: {
            ...livePreflightBinding,
            approvedBurnTxHashes: [OTHER_TX_ID],
          },
        };
        return JSON.stringify({
          ...observeReport,
          markdown: (observeReport.markdown as string).replace(
            `approved burn order ${BURN_TX_ID}`,
            `approved burn order ${OTHER_TX_ID}`,
          ),
          observation: driftedObservation,
          sourceBindings: postSubmitObserveSourceBindings(driftedObservation),
        });
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('post-submit: JSON observe report burnOrder must include draft peg-out burn TX ID');
  });

  it('validates recovery drill rows but does not assemble them through legacy V1', () => {
    const dir = join(tmpdir(), `bridge-assemble-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const draft = 'draft.md';
    const livePreflight = 'live-preflight.log';
    const failedBroadcast = 'failed-broadcast-row.md';
    const reorgRecovery = 'reorg-recovery-row.md';
    writeFileSync(join(dir, draft), draftMarkdown, 'utf8');
    writeFileSync(join(dir, livePreflight), livePreflightPass, 'utf8');
    writeFileSync(join(dir, failedBroadcast), failedBroadcastRow, 'utf8');
    writeFileSync(join(dir, reorgRecovery), reorgRecoveryRow, 'utf8');

    const report = assembleTestnetRehearsalCandidate({
      draft,
      livePreflight,
      failedBroadcast,
      reorgRecovery,
      workspaceRoot: dir,
      bridgeRoot: dir,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toEqual([LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE]);
    expect(report.markdown).toBeUndefined();
    expect(report.targetBindings.failedBroadcast).toBe(failedBroadcast);
    expect(report.targetBindings.reorgRecovery).toBe(reorgRecovery);
  });

  it('accepts the test-backed recovery row shape but blocks legacy V1 assembly', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      reorgRecovery: 'reorg-recovery-row.md',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') return livePreflightPass;
        return reorgTestRecoveryRow;
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toEqual([LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE]);
    expect(report.markdown).toBeUndefined();
  });

  it('fails closed when recovery drill rows do not match draft identifiers', () => {
    const mismatchedFailedBroadcastRow = buildTestnetRecoveryDrillEvidence({
      kind: 'failed-broadcast-phantom-avl',
      evidenceArtifact: 'artifact://recovery/failed-broadcast-phantom-avl.md',
      validationArtifact: 'artifact://recovery/failed-broadcast-rehearsal-validate.log',
      observationArtifact: 'artifact://recovery/failed-broadcast-observe.json',
      expectedTxId: OTHER_TX_ID,
      pegOutBurnTxId: OTHER_TX_ID,
    }).markdown!;
    const mismatchedReorgRecoveryRow = buildTestnetRecoveryDrillEvidence({
      kind: 'reorged-burn-stale-singleton',
      evidenceArtifact: 'artifact://recovery/reorg-stale-singleton.md',
      validationArtifact: 'artifact://recovery/reorg-rehearsal-validate.log',
      observationArtifact: 'artifact://recovery/reorg-observe.json',
      pegOutBurnTxId: OTHER_TX_ID,
      singletonInventoryId: SINGLETON_ID,
    }).markdown!;

    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      failedBroadcast: 'failed-broadcast-row.md',
      reorgRecovery: 'reorg-recovery-row.md',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') return livePreflightPass;
        if (target === 'failed-broadcast-row.md') return mismatchedFailedBroadcastRow;
        return mismatchedReorgRecoveryRow;
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('failed-broadcast: Expected transaction ID must match draft Expected transaction ID');
    expect(report.errors).toContain('failed-broadcast: peg-out burn TX ID must match draft peg-out burn TX ID');
    expect(report.errors).toContain('reorg-recovery: peg-out burn TX ID must match draft peg-out burn TX ID');
  });

  it('writes a structured quarantine report instead of a legacy V1 assembly', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-assemble-json-'));
    try {
      const report = assembleTestnetRehearsalCandidate({
        draft: 'draft.md',
        livePreflight: 'live-preflight.log',
        failedBroadcast: 'failed-broadcast-row.md',
        reorgRecovery: 'reorg-recovery-row.md',
        readFile: target => {
          if (target === 'draft.md') return draftMarkdown;
          if (target === 'live-preflight.log') return livePreflightPass;
          if (target === 'failed-broadcast-row.md') return failedBroadcastRow;
          return reorgRecoveryRow;
        },
        resolvePath: target => `/repo/${target}`,
      });

      const output = writeOfflineReportJson(`${basename(dir)}/assembly-report.json`, {
        schemaVersion: 1,
        ...report,
      });
      const saved = JSON.parse(readFileSync(join(dir, 'assembly-report.json'), 'utf8'));

      expect(output.errors).toEqual([]);
      expect(saved.schemaVersion).toBe(1);
      expect(saved.status).toBe('BLOCKED');
      expect(saved.message).toBe('testnet rehearsal assemble BLOCKED: 1 issue(s)');
      expect(saved.errors).toEqual([LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE]);
      expect(saved.markdown).toBeUndefined();
      expect(saved.targetBindings).toEqual({
        draft: 'draft.md',
        livePreflight: 'live-preflight.log',
        failedBroadcast: 'failed-broadcast-row.md',
        reorgRecovery: 'reorg-recovery-row.md',
      });
      expect(saved.rehearsalValidation).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('validates a completed structured assembly report for release-gate chaining', () => {
    const report = {
      schemaVersion: 1,
      status: 'CREATED',
      message: 'testnet rehearsal assemble CREATED',
      errors: [],
      markdown: [
        '## Dry-Run Settlement Evidence',
        '',
        `- Expected transaction ID: ${EXPECTED_TX_ID}`,
        '',
        '## Broadcast Enablement Evidence',
        '',
        '## Submit And Confirmation Evidence',
        '',
        `- Submitted transaction ID: ${EXPECTED_TX_ID} artifact://submit/live-submit.md`,
        '',
        '## Reconciliation Evidence',
        '',
        '## Rehearsal Assembly Evidence',
        '',
        '- Assembly status: post-submit evidence included',
        '- Post-submit fragment: included',
        '- Fresh checkpoint lifecycle status: publication blocker',
      ].join('\n\n'),
      targetBindings: {
        draft: 'draft.md',
        livePreflight: 'live-preflight.log',
        postSubmitObserveJson: 'post-submit-observe.json',
        freshCheckpoint: 'fresh-checkpoint.json',
      },
      lines: [
        'testnet rehearsal assemble CREATED',
        '- assembly status: post-submit evidence included',
        '- assembled rehearsal validation: PASS',
      ],
      rehearsalValidation: {
        status: 'PASS',
        errors: [],
      },
    };
    const result = validateTestnetRehearsalAssemblyReport(report);

    expect(result.errors).toEqual([]);
    expect(result.expectedTxId).toBe(EXPECTED_TX_ID);
    expect(result.submittedTxId).toBe(EXPECTED_TX_ID);
    expect(result.markdown).toContain('Assembly status: post-submit evidence included');

    const markdownFailureMarkers: any = structuredClone(report);
    markdownFailureMarkers.markdown +=
      '\n- Validation summary: PASS exit code 0; validation BLOCKED with 1 structural issue';
    expect(validateTestnetRehearsalAssemblyReport(markdownFailureMarkers).errors).toContain(
      'assembly: markdown must not include contradictory failure markers',
    );

    const lineFailureMarkers: any = structuredClone(report);
    lineFailureMarkers.lines.push(
      '- Validation summary: PASS exit code 0; validation BLOCKED with 1 structural issue',
    );
    expect(validateTestnetRehearsalAssemblyReport(lineFailureMarkers).errors).toContain(
      'assembly: lines must not include contradictory failure markers',
    );

    const markdownCompatibilityFailureMarkers: any = structuredClone(report);
    markdownCompatibilityFailureMarkers.markdown +=
      '\n- Validation summary: PASS exit code 0; validation\uFF1A \uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue';
    expect(validateTestnetRehearsalAssemblyReport(markdownCompatibilityFailureMarkers).errors).toContain(
      'assembly: markdown must not include contradictory failure markers',
    );

    const lineCompatibilityFailureMarkers: any = structuredClone(report);
    lineCompatibilityFailureMarkers.lines.push(
      '- Validation summary: PASS exit code 0; validation\uFF1A \uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue',
    );
    expect(validateTestnetRehearsalAssemblyReport(lineCompatibilityFailureMarkers).errors).toContain(
      'assembly: lines must not include contradictory failure markers',
    );

    const markdownStructuredFailureFields: any = structuredClone(report);
    markdownStructuredFailureFields.markdown += '\n- Validation summary: {"errors":["missing confirmation"]}';
    expect(validateTestnetRehearsalAssemblyReport(markdownStructuredFailureFields).errors).toContain(
      'assembly: markdown must not include contradictory failure markers',
    );

    const lineStructuredFailureFields: any = structuredClone(report);
    lineStructuredFailureFields.lines.push('- Validation summary: errorCount: 1');
    expect(validateTestnetRehearsalAssemblyReport(lineStructuredFailureFields).errors).toContain(
      'assembly: lines must not include contradictory failure markers',
    );

    const markdownStructuredTotalFailureFields: any = structuredClone(report);
    markdownStructuredTotalFailureFields.markdown += '\n- Validation summary: errorsTotal=1; failures_total: 2';
    expect(validateTestnetRehearsalAssemblyReport(markdownStructuredTotalFailureFields).errors).toContain(
      'assembly: markdown must not include contradictory failure markers',
    );

    const lineStructuredTotalFailureFields: any = structuredClone(report);
    lineStructuredTotalFailureFields.lines.push('- Validation summary: errorsTotal=1; failures_total: 2');
    expect(validateTestnetRehearsalAssemblyReport(lineStructuredTotalFailureFields).errors).toContain(
      'assembly: lines must not include contradictory failure markers',
    );

    const lineStructuredSuccessFields: any = structuredClone(report);
    lineStructuredSuccessFields.lines.push(
      '- Validation summary: errorCount: 0',
      '- Validation summary: errorsTotal=0; failures_total: 0',
      '- Validation summary: {"errors":[]}',
    );
    expect(validateTestnetRehearsalAssemblyReport(lineStructuredSuccessFields).errors).toEqual([]);

    const markdownRemainingIssues: any = structuredClone(report);
    markdownRemainingIssues.markdown += '\n- Remaining issues:\n  - unresolved assembly blocker';
    expect(validateTestnetRehearsalAssemblyReport(markdownRemainingIssues).errors).toContain(
      'assembly: markdown must not include remaining issues',
    );

    const lineRemainingIssues: any = structuredClone(report);
    lineRemainingIssues.lines.push('- Remaining issues:', '  - unresolved assembly blocker');
    expect(validateTestnetRehearsalAssemblyReport(lineRemainingIssues).errors).toContain(
      'assembly: lines must not include remaining issues',
    );

    const markdownCompatibilityIssues: any = structuredClone(report);
    markdownCompatibilityIssues.markdown += '\n- \uFF2F\uFF50\uFF45\uFF4E issues\uFF1A unresolved assembly blocker';
    expect(validateTestnetRehearsalAssemblyReport(markdownCompatibilityIssues).errors).toContain(
      'assembly: markdown must not include remaining issues',
    );

    const lineCompatibilityIssues: any = structuredClone(report);
    lineCompatibilityIssues.lines.push('- \uFF2F\uFF50\uFF45\uFF4E issues\uFF1A unresolved assembly blocker');
    expect(validateTestnetRehearsalAssemblyReport(lineCompatibilityIssues).errors).toContain(
      'assembly: lines must not include remaining issues',
    );

    const markdownOpenIssues: any = structuredClone(report);
    markdownOpenIssues.markdown += '\n- Open issues: unresolved assembly blocker';
    expect(validateTestnetRehearsalAssemblyReport(markdownOpenIssues).errors).toContain(
      'assembly: markdown must not include remaining issues',
    );

    const lineKnownIssues: any = structuredClone(report);
    lineKnownIssues.lines.push('- Known issues: unresolved assembly blocker');
    expect(validateTestnetRehearsalAssemblyReport(lineKnownIssues).errors).toContain(
      'assembly: lines must not include remaining issues',
    );

    const lineStructuredIssues: any = structuredClone(report);
    lineStructuredIssues.lines.push('- "openIssues": ["unresolved assembly blocker"]');
    expect(validateTestnetRehearsalAssemblyReport(lineStructuredIssues).errors).toContain(
      'assembly: lines must not include remaining issues',
    );

    const localTargetBindings = [
      { field: 'draft', target: ['C:', 'tmp', 'draft.md'].join('/') },
      { field: 'livePreflight', target: ['file:', '', '', 'C:', 'tmp', 'live-preflight.log'].join('/') },
      { field: 'postSubmitObserveJson', target: '%2Ftmp%2Fpost-submit-observe.json' },
      { field: 'freshCheckpoint', target: 'file%3A%2F%2F%2FC%3A%2Ftmp%2Ffresh-checkpoint.json' },
    ] as const;
    for (const { field, target } of localTargetBindings) {
      const localBinding: any = structuredClone(report);
      localBinding.targetBindings[field] = target;
      expect(validateTestnetRehearsalAssemblyReport(localBinding).errors).toContain(
        `assembly: targetBindings.${field} must not reference a local-only path`,
      );
    }
  });

  it('rejects publication-blocker assembly reports before release-gate chaining', () => {
    const result = validateTestnetRehearsalAssemblyReport({
      schemaVersion: 1,
      status: 'CREATED',
      message: 'testnet rehearsal assemble CREATED publication-blocker',
      errors: [],
      markdown: [
        draftMarkdown,
        '## Rehearsal Assembly Evidence',
        '',
        '- Assembly status: publication-blocker',
        '- Fresh checkpoint lifecycle status: publication blocker',
      ].join('\n\n'),
      targetBindings: {
        draft: 'draft.md',
        livePreflight: 'live-preflight.log',
        freshCheckpoint: 'fresh-checkpoint.json',
      },
      lines: [
        'testnet rehearsal assemble CREATED publication-blocker',
        '- assembly status: publication-blocker',
        '- assembled rehearsal validation: BLOCKED',
      ],
      rehearsalValidation: {
        status: 'BLOCKED',
        errors: ['post-submit evidence is still pending'],
      },
    });

    expect(result.errors).toContain('assembly: message must be testnet rehearsal assemble CREATED');
    expect(result.errors).toContain('assembly: lines must prove post-submit evidence included');
    expect(result.errors).toContain('assembly: targetBindings.postSubmitObserveJson must be present');
    expect(result.errors).toContain('assembly: rehearsalValidation.status must be PASS');
  });

  it('fails closed when a recovery row fragment targets the wrong lifecycle gate', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      failedBroadcast: 'failed-broadcast-row.md',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') return livePreflightPass;
        return reorgRecoveryRow;
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'failed-broadcast: fragment must include exactly one Failed broadcast / phantom AVL evidence lifecycle row',
    );
  });

  it('fails closed when a recovery row fragment is not pass evidence', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      reorgRecovery: 'reorg-recovery-row.md',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') return livePreflightPass;
        return reorgRecoveryRow.replace('| pass |', '| publication blocker |');
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'reorg-recovery: Reorged burn / stale singleton evidence row status must be pass',
    );
  });

  it('fails closed when a recovery row fragment reports failed rehearsal validation output', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      failedBroadcast: 'failed-broadcast-row.md',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') return livePreflightPass;
        return failedBroadcastRow.replace(
          'npm run rehearsal:validate command output: PASS',
          'npm run rehearsal:validate command output: FAILED',
        );
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('failed-broadcast: fragment must not contain BLOCKED/FAIL');
    expect(report.errors).toContain(
      'failed-broadcast: Failed broadcast / phantom AVL evidence row must cite rehearsal:validate PASS evidence',
    );
  });

  it('fails closed when a recovery row fragment uses compatibility-normalized failure markers', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      failedBroadcast: 'failed-broadcast-row.md',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') return livePreflightPass;
        return failedBroadcastRow.replace(
          'npm run rehearsal:validate command output: PASS',
          `npm run rehearsal:validate command output: ${FULLWIDTH_BLOCKED}`,
        );
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('failed-broadcast: fragment must not contain BLOCKED/FAIL');
  });

  it('fails closed when a recovery row fragment uses compatibility-normalized broadcast enablement', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      failedBroadcast: 'failed-broadcast-row.md',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') return livePreflightPass;
        return failedBroadcastRow.replace(
          'structured recovery observation PASS',
          `structured recovery observation PASS; BRIDGE_BROADCAST_ENABLED=${FULLWIDTH_TRUE};`,
        );
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('failed-broadcast: fragment must not enable broadcast');
  });

  it('fails closed when a recovery row fragment reports failed recovery-observe validation output', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      failedBroadcast: 'failed-broadcast-row.md',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') return livePreflightPass;
        return failedBroadcastRow.replace(
          'npm run rehearsal:recovery-observe:validate command output: PASS',
          'npm run rehearsal:recovery-observe:validate command output: FAILED',
        );
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('failed-broadcast: fragment must not contain BLOCKED/FAIL');
    expect(report.errors).toContain(
      'failed-broadcast: Failed broadcast / phantom AVL evidence row must cite recovery-observe JSON validation PASS evidence',
    );
  });

  it('fails closed when a recovery row fragment lacks recovery-observe validation target binding', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      failedBroadcast: 'failed-broadcast-row.md',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') return livePreflightPass;
        return failedBroadcastRow.replace(
          'recovery-observe validation target artifact://recovery/failed-broadcast-observe.json ',
          '',
        );
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'failed-broadcast: Failed broadcast / phantom AVL evidence row must cite recovery-observe JSON validation PASS evidence',
    );
  });

  it('fails closed when a recovery row fragment lacks structured observation evidence', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      failedBroadcast: 'failed-broadcast-row.md',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') return livePreflightPass;
        return failedBroadcastRow.replace(
          'structured recovery observation PASS observation artifact://recovery/failed-broadcast-observe.json ',
          '',
        );
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'failed-broadcast: Failed broadcast / phantom AVL evidence row must cite structured recovery observation PASS evidence',
    );
  });

  it('fails closed when live-preflight evidence is blocked', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.md',
      readFile: target => target === 'draft.md'
        ? draftMarkdown
        : 'testnet rehearsal live preflight BLOCKED\nartifact://gate/live-preflight.log',
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('live-preflight: artifact must not contain BLOCKED/FAIL');
  });

  it('fails closed for duplicate artifact targets', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'same.md',
      livePreflight: 'same.md',
      readFile: () => draftMarkdown,
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('Artifact targets must be distinct');
  });

  it('fails closed when post-submit observe JSON markdown indicates mainnet or missing broadcast approval', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      postSubmit: 'post-submit-observe.json',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') return livePreflightPass;
        return JSON.stringify(postSubmitObserveReport({ markdown: [
          '## Submit And Confirmation Evidence',
          '',
          `- Submitted transaction ID: ${EXPECTED_TX_ID}`,
          `- Confirmation policy met: yes artifact://confirm/finality.md finality evidence artifact://confirm/live-confirm.md confirmationsRequired=3 confirmationsObserved=4 submitted transaction ID ${EXPECTED_TX_ID}`,
          '- Network: mainnet',
          '- User approval recorded: live broadcast approval missing',
          '',
          '## Reconciliation Evidence',
          '',
          '- Peg-out status after reconciliation: settled artifact://reconcile/live-reconcile.md',
          '',
          '## Post-Submit Gate Binding',
          '',
          `- Live-preflight JSON binding: evidence/live-rehearsals/live-preflight.json status GO Expected transaction ID ${EXPECTED_TX_ID} approved burn order ${BURN_TX_ID} runtimeBroadcastEnabled false pre-submit boundary preserved and authorization evidence linked.`,
        ].join('\n') }));
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('post-submit: fragment must not indicate mainnet');
    expect(report.errors).toContain('post-submit: fragment must not indicate missing broadcast approval');
  });

  it('fails closed when post-submit evidence is not bound to the live-preflight JSON report', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      postSubmit: 'post-submit-observe.json',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') return livePreflightPass;
        return JSON.stringify(postSubmitObserveReport({ markdown: postSubmitFragment
          .replace(
            `- Live-preflight JSON binding: evidence/live-rehearsals/live-preflight.json status GO Expected transaction ID ${EXPECTED_TX_ID} approved burn order ${BURN_TX_ID} runtimeBroadcastEnabled false pre-submit boundary preserved and authorization evidence linked.\n`,
            '',
          ) }));
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'post-submit: JSON observe report markdown must include Live-preflight JSON binding',
    );
  });

  it('fails closed when structured post-submit live-preflight binding diverges from the live-preflight JSON source', () => {
    const observeReport = postSubmitObserveReport();
    const observation = observeReport.observation as Record<string, unknown>;
    const livePreflightBinding = observation.livePreflightBinding as Record<string, unknown>;
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'evidence/live-rehearsals/live-preflight.json',
      postSubmit: 'post-submit-observe.json',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'evidence/live-rehearsals/live-preflight.json') return livePreflightPass;
        return JSON.stringify({
          ...observeReport,
          observation: {
            ...observation,
            livePreflightBinding: {
              ...livePreflightBinding,
              target: 'evidence/live-rehearsals/other-live-preflight.json',
            },
          },
        });
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'post-submit: JSON observe report livePreflightBinding.target must match the validated live-preflight JSON target',
    );
  });

  it('fails closed when post-submit live-preflight binding diverges from a logged live-preflight JSON report target', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      postSubmit: 'post-submit-observe.json',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') {
          return livePreflightPass.replace(
            'evidence/live-rehearsals/live-preflight.json',
            'evidence/live-rehearsals/other-live-preflight.json',
          );
        }
        return JSON.stringify(postSubmitObserveReport());
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'post-submit: JSON observe report livePreflightBinding.target must match the validated live-preflight JSON target',
    );
  });

  it('fails closed when post-submit assembly has no live-preflight JSON report target', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      postSubmit: 'post-submit-observe.json',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') {
          return livePreflightPass.replace(
            '\n- live preflight report written: evidence/live-rehearsals/live-preflight.json',
            '',
          );
        }
        return JSON.stringify(postSubmitObserveReport());
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'post-submit: live-preflight artifact must cite live preflight report written JSON target',
    );
  });

  it('fails closed when post-submit live-preflight JSON binding is stale or weak', () => {
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      postSubmit: 'post-submit-observe.json',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') return livePreflightPass;
        return JSON.stringify(postSubmitObserveReport({ markdown: postSubmitFragment.replace(
          `evidence/live-rehearsals/live-preflight.json status GO Expected transaction ID ${EXPECTED_TX_ID} approved burn order ${BURN_TX_ID} runtimeBroadcastEnabled false pre-submit boundary preserved and authorization evidence linked.`,
          `evidence/live-rehearsals/live-preflight-template.json status BLOCKED Expected transaction ID ${OTHER_TX_ID} approved burn order ${OTHER_TX_ID} boundary unclear.`,
        ) }));
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'post-submit: JSON observe report markdown Live-preflight JSON binding must cite a concrete non-template JSON report',
    );
    expect(report.errors).toContain(
      'post-submit: JSON observe report markdown Live-preflight JSON binding must cite observation.livePreflightBinding.target',
    );
    expect(report.errors).toContain(
      'post-submit: JSON observe report markdown Live-preflight JSON binding must cite observation expectedTxId',
    );
    expect(report.errors).toContain('post-submit: JSON observe report markdown Live-preflight JSON binding must cite status GO');
    expect(report.errors).toContain(
      'post-submit: JSON observe report markdown Live-preflight JSON binding must preserve the pre-submit boundary',
    );
    expect(report.errors).toContain(
      'post-submit: JSON observe report markdown Live-preflight JSON binding must cite linked authorization evidence',
    );
  });

  it('fails closed when live-preflight and post-submit transaction IDs diverge from the draft', () => {
    const observeReport = postSubmitObserveReport();
    const observation = observeReport.observation as Record<string, unknown>;
    const livePreflightBinding = observation.livePreflightBinding as Record<string, unknown>;
    const report = assembleTestnetRehearsalCandidate({
      draft: 'draft.md',
      livePreflight: 'live-preflight.log',
      postSubmit: 'post-submit-observe.json',
      readFile: target => {
        if (target === 'draft.md') return draftMarkdown;
        if (target === 'live-preflight.log') return livePreflightPass.replace(EXPECTED_TX_ID, OTHER_TX_ID);
        return JSON.stringify(postSubmitObserveReport({
          markdown: postSubmitFragment.replaceAll(EXPECTED_TX_ID, OTHER_TX_ID),
          observation: {
            ...observation,
            txBinding: {
              expectedTxId: OTHER_TX_ID,
              submittedTxId: OTHER_TX_ID,
              idsMatch: true,
            },
            livePreflightBinding: {
              ...livePreflightBinding,
              expectedTxId: OTHER_TX_ID,
            },
          },
        }));
      },
      resolvePath: target => `/repo/${target}`,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('live-preflight: Expected transaction ID must match draft Expected transaction ID');
    expect(report.errors).toContain('post-submit: submitted transaction ID must match draft Expected transaction ID');
  });
});
