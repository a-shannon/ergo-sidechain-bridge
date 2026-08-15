import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildAggregateSettlementPrebroadcastEvidenceRecord,
  type AggregateSettlementPrebroadcastEvidenceRecord,
} from './aggregate-settlement-evidence.js';
import { TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY } from './aggregate-settlement-evidence.test-helper.js';
import { writeOfflineReportJson } from './offline-report-json.js';
import { LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE } from './legacy-aggregate-settlement-conservation.js';
import { buildTestnetRecoveryDrillEvidence } from './testnet-recovery-drill-evidence.js';
import {
  buildTestnetRehearsalPrepBundle,
  validateTestnetRehearsalPrepBundleReport,
} from './testnet-rehearsal-prep-bundle.js';

const NOW = new Date('2026-05-18T00:10:00.000Z');
const PEG_OUT_BURN_TX_ID = '1'.repeat(64);
const PEG_OUT_BURN_TX_ID_B = '9'.repeat(64);
const SIDECHAIN_BLOCK_HASH = '2'.repeat(64);
const BRIDGE_EVENT_ROOT = '3'.repeat(64);
const EXPECTED_TX_ID = '4'.repeat(64);
const DEPLOYMENT_STATE_HASH = '5'.repeat(64);
const CONTRACT_ID = '6'.repeat(64);
const SINGLETON_ID = '7'.repeat(64);
const PEG_IN_EVENT_ID = '8'.repeat(64);
const SINGLETON_BOX_ID = 'a'.repeat(64);
const SINGLETON_TREE = '100204';
const FRESH_CHECKPOINT_ERGO_NODE_URL = 'http://localhost:9052';
const FRESH_CHECKPOINT_SIDECHAIN_RPC_URL = 'http://localhost:9945';
const FULLWIDTH_BLOCKED = '\uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24';
const FULLWIDTH_TRUE = '\uFF34\uFF32\uFF35\uFF25';
const LEGACY_V1_SUBMISSION_STATUS = `BLOCKED: ${LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE}`;

function aggregateEvidenceRecord(): AggregateSettlementPrebroadcastEvidenceRecord {
  return buildAggregateSettlementPrebroadcastEvidenceRecord({
    generatedAt: '2026-05-18T00:00:00.000Z',
    command: 'check-batch',
    label: 'Aggregate settlement prep bundle fixture',
    expectedTxId: EXPECTED_TX_ID,
    transactionCheckResponse: '',
    checkerIdentity: {
      ...TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY,
      nodeOrigin: 'http://localhost:9053',
    },
    settlementShape: {
      inputCount: 4,
      outputCount: 4,
      contextExtensionKeyCounts: [0, 4, 4, 2],
      contextExtensionKeyCountsCsv: '0,4,4,2',
    },
    claims: [
      {
        burnTxHash: PEG_OUT_BURN_TX_ID,
        sidechainBlockHeight: 200,
        sidechainHeaderHashHex: SIDECHAIN_BLOCK_HASH,
        bridgeEventRootHex: BRIDGE_EVENT_ROOT,
        ergoAnchorHeight: 100,
      },
      {
        burnTxHash: PEG_OUT_BURN_TX_ID_B,
        sidechainBlockHeight: 201,
        sidechainHeaderHashHex: 'a'.repeat(64),
        bridgeEventRootHex: 'b'.repeat(64),
        ergoAnchorHeight: 101,
      },
    ],
  });
}

function completedPrebroadcastEvidence(
  record: AggregateSettlementPrebroadcastEvidenceRecord,
  jsonTarget = 'aggregate-check.json',
): string {
  const selectedClaim = record.claims[0];
  const burnSet = record.claims.map(claim => claim.burnTxHash).join(',');
  return `
# Completed Testnet Pre-Broadcast Dry Run

## Scope Statement

- Evidence package name: fresh-testnet-prebroadcast-2026-05-18
- Date: 2026-05-18
- Operator: operator-a
- Reviewer: reviewer-a
- Git commit: abc1234
- Environment: testnet
- Ergo node network: testnet
- Sidechain network: patched-devnet
- Broadcast mode at start: disabled
- Broadcast mode at end: disabled
- Gate 3 closure claimed: no
- Testnet production-candidate claim allowed: no
- Mainnet production-ready claim allowed: no

## Required Command Artifacts

- \`npm run check\` artifact: artifact://prebroadcast/check.log
- \`npm run wasm:test\` artifact: artifact://prebroadcast/wasm-test.log
- \`npm run demo:readiness\` artifact: artifact://prebroadcast/demo-readiness.log
- \`npm run status\` artifact: artifact://prebroadcast/status.log
- ContextExtension guard result: artifact://prebroadcast/context-extension-guard.log ContextExtension guard sigma-rust/JVM conformance fail-closed behavior
- Broadcast policy result: artifact://prebroadcast/broadcast-policy.log Broadcast policy PASS: broadcast disabled by BRIDGE_BROADCAST_ENABLED=false
- Clean deployment state evidence: artifact://prebroadcast/clean-deployment-state.json clean deployment state deployment-state hash=${DEPLOYMENT_STATE_HASH}; contract IDs=${CONTRACT_ID}; singleton inventory=${SINGLETON_ID}
- Current Ergo height: 100 artifact://prebroadcast/current-ergo-height.log
- Current sidechain height: 201 artifact://prebroadcast/current-sidechain-height.log

## Dry-Run Settlement Shape

- Peg-in event ID or TX ID: ${PEG_IN_EVENT_ID} artifact://prebroadcast/peg-in-event.log
- Peg-out burn TX ID: ${selectedClaim.burnTxHash} artifact://prebroadcast/peg-out-burn.log
- Sidechain block height: ${selectedClaim.sidechainBlockHeight}
- Sidechain block hash: ${selectedClaim.sidechainHeaderHashHex ?? SIDECHAIN_BLOCK_HASH} artifact://prebroadcast/sidechain-block.log
- Bridge event root: ${selectedClaim.bridgeEventRootHex ?? BRIDGE_EVENT_ROOT} artifact://prebroadcast/bridge-event-root.log
- Bridge event roots: ${record.claims.map(claim => claim.bridgeEventRootHex).join(',')} artifact://prebroadcast/bridge-event-roots.log
- Ergo anchor height: ${selectedClaim.ergoAnchorHeight ?? 100}
- Aggregate claim count: ${record.claimCount}
- Input count: ${record.settlementShape.inputCount}
- Output count: ${record.settlementShape.outputCount}
- ContextExtension key counts per input: ${record.settlementShape.contextExtensionKeyCountsCsv}
- \`/transactions/check\` result: PASS [aggregate JSON](${jsonTarget}) artifact://prebroadcast/transactions-check.log
- Expected transaction ID: ${record.transactionCheck.expectedTxId} artifact://prebroadcast/expected-tx.log
- Daemon approval preparation: artifact://prebroadcast/daemon-approval-prep.log approval file version 2 runtime context binding ergoNodeUrl sidechainRpcUrl sidechainWsUrl deployedStateHash mode batch active approval window non-mainnet networks npm run settle:aggregate -- check-batch ${record.claims.map(claim => claim.burnTxHash).join(' ')} checkEvidence artifact://prebroadcast/check.log completed approval evidence target Expected transaction ID ${record.transactionCheck.expectedTxId} ordered burn set ${burnSet}

## Non-Broadcast Attestation

- \`BRIDGE_BROADCAST_ENABLED\` state at start: unset artifact://prebroadcast/broadcast-state-start.log
- \`BRIDGE_BROADCAST_ENABLED\` state at end: false artifact://prebroadcast/broadcast-state-end.log
- Live broadcast approval recorded: no artifact://prebroadcast/live-approval-absent.log
- Submit command attempted: no artifact://prebroadcast/submit-not-attempted.log
- Mempool transaction observed: no artifact://prebroadcast/mempool-absence.log
- Local DUP confirmed-history mutation performed: no artifact://prebroadcast/dup-history-no-mutation.log
- Local SPV/AVL confirmed-history mutation performed: no artifact://prebroadcast/spv-avl-history-no-mutation.log
- Runtime state files staged: no artifact://prebroadcast/git-status-runtime-not-staged.log

## Lifecycle Linkage Guidance

Fresh testnet lifecycle: publication blocker pending until a live lifecycle package exists.
Settlement submit evidence: blocker pending until user explicit live broadcast approval and submitted transaction ID evidence exist.
Confirmation evidence: unchecked blocker pending until live confirmation evidence exists.
Reconciliation evidence: unchecked blocker pending until live reconciliation evidence exists.
The next live rehearsal must capture submitted transaction ID, confirmation evidence, and reconciliation evidence before any Gate 3 closure.

## Publication Control

- Release notes updated for this dry-run package: yes
- Pending Evidence Register updated for this dry-run package: yes
- Gate 3 checklist row closed by this package: no
- Production-ready claim allowed by this package: no
- Testnet production-candidate claim allowed by this package: no

## Reviewer Sign-Off

- Classification: pass
- Stop conditions discovered: none
- Follow-up live rehearsal required: yes
- Follow-up recovery drill required: yes
- Reviewer: reviewer-a
- Date: 2026-05-18
`;
}

function approvalFile(record: AggregateSettlementPrebroadcastEvidenceRecord): Record<string, unknown> {
  const burnTxHashes = record.claims.map(claim => claim.burnTxHash);
  const burnSet = burnTxHashes.join(',');
  const checkCommand = `npm run settle:aggregate -- check-batch ${burnTxHashes.join(' ')}`;
  return {
    version: 2,
    createdAt: '2026-05-18T00:00:00Z',
    environment: 'testnet',
    ergoNodeNetwork: 'testnet',
    ergoNodeUrl: 'http://localhost:9053',
    sidechainNetwork: 'patched-devnet',
    sidechainRpcUrl: 'http://localhost:8545',
    sidechainWsUrl: 'ws://localhost:9944',
    deployedStateHash: DEPLOYMENT_STATE_HASH,
    approvals: [{
      mode: 'batch',
      burnTxHashes,
      bridgeEventRootHexes: record.claims.map(claim => claim.bridgeEventRootHex),
      expectedTxId: EXPECTED_TX_ID,
      approvedAt: '2026-05-18T00:01:00Z',
      expiresAt: '2026-05-18T01:01:00Z',
      evidence:
        `artifact://approval/reviewer.log completed approval evidence target mode batch ` +
        `non-broadcast Expected transaction ID ${EXPECTED_TX_ID} ordered burn set ${burnSet}`,
      checkEvidence:
        `artifact://prebroadcast/check.log ${checkCommand} mode batch non-broadcast PASS ` +
        `Expected transaction ID ${EXPECTED_TX_ID} ordered burn set ${burnSet}`,
      checkEvidenceJson: 'aggregate-check.json',
      checkCommand,
    }],
  };
}

function freshCheckpointReport(): Record<string, unknown> {
  const observedAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    status: 'CREATED',
    message: 'fresh testnet non-broadcast checkpoint CREATED publication-blocker',
    errors: [],
    checkpoint: {
      aggregateEvidence: 'aggregate-check.json',
      lifecycleGate: 'Fresh testnet lifecycle',
      lifecycleStatus: 'publication blocker',
      ergoNodeNetwork: 'testnet',
      sidechainNetwork: 'patched-devnet',
      currentErgoHeight: 123,
      currentSidechainHeight: 456,
      expectedTxId: EXPECTED_TX_ID,
      burnTxHashes: [PEG_OUT_BURN_TX_ID, PEG_OUT_BURN_TX_ID_B],
      sidechainBlockHeights: [200, 201],
      ergoAnchorHeights: [100, 101],
      sidechainHeaderHashHexes: [SIDECHAIN_BLOCK_HASH, 'a'.repeat(64)],
      bridgeEventRootHexes: [BRIDGE_EVENT_ROOT, 'b'.repeat(64)],
      transactionCheckResult: 'PASS',
      broadcast: 'no',
      anchorObservations: [{
        ergoAnchorHeight: 100,
        expectedBridgeEventRootHex: BRIDGE_EVENT_ROOT,
        observedBridgeEventRootHexes: [BRIDGE_EVENT_ROOT],
        matchingFieldFound: true,
        fieldCount: 1,
        headerIds: ['c'.repeat(64)],
        observedAt,
        nodeHeight: 123,
      }, {
        ergoAnchorHeight: 101,
        expectedBridgeEventRootHex: 'b'.repeat(64),
        observedBridgeEventRootHexes: ['b'.repeat(64)],
        matchingFieldFound: true,
        fieldCount: 1,
        headerIds: ['d'.repeat(64)],
        observedAt,
        nodeHeight: 123,
      }],
      singletonCheckpoint: {
        deployedStateHash: DEPLOYMENT_STATE_HASH,
        observedAt,
        nodeHeight: 123,
        nodeNetwork: 'testnet',
        expectedTxId: EXPECTED_TX_ID,
        expectedTxMempoolAbsent: true,
        expectedTxConfirmedAbsent: true,
        singletons: [{
          name: 'SidechainState',
          nftId: SINGLETON_ID,
          expectedBoxId: SINGLETON_BOX_ID,
          observedBoxId: SINGLETON_BOX_ID,
          expectedErgoTreeHex: SINGLETON_TREE,
          observedErgoTreeHex: SINGLETON_TREE,
          observedCount: 1,
        }],
      },
      heightEvidence: {
        observedAt,
        ergoNodeHeight: 123,
        sidechainBlockHeight: 456,
        sources: {
          ergo: 'read-only-no-auth /info',
          sidechain: 'read-only EVM getBlockNumber',
        },
        broadcastEnabled: false,
      },
    },
    sourceBindings: {
      aggregateEvidence: 'aggregate-check.json',
      singletonCheckpoint: {
        mode: 'live-read-only-node',
        ergoNodeUrl: FRESH_CHECKPOINT_ERGO_NODE_URL,
        observedAt,
        nodeHeight: 123,
        expectedTxId: EXPECTED_TX_ID,
        deployedStateHash: DEPLOYMENT_STATE_HASH,
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
        observationCount: 2,
        ergoAnchorHeights: [100, 101],
        bridgeEventRootHexes: [BRIDGE_EVENT_ROOT, 'b'.repeat(64)],
        observedAtValues: [observedAt, observedAt],
        nodeHeights: [123, 123],
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
        ergoNodeHeight: 123,
        sidechainBlockHeight: 456,
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
    },
  };
}

function writeFixture(dir: string): {
  prebroadcastTarget: string;
  approvalsPath: string;
  freshCheckpoint: string;
  failedBroadcast: string;
  reorgRecovery: string;
} {
  mkdirSync(dir, { recursive: true });
  const record = aggregateEvidenceRecord();
  const failed = buildTestnetRecoveryDrillEvidence({
    kind: 'failed-broadcast-phantom-avl',
    evidenceArtifact: 'artifact://recovery/failed-broadcast-phantom-avl.md',
    validationArtifact: 'artifact://recovery/failed-broadcast-rehearsal-validate.log',
    observationArtifact: 'artifact://recovery/failed-broadcast-observe.json',
    expectedTxId: EXPECTED_TX_ID,
    pegOutBurnTxId: PEG_OUT_BURN_TX_ID,
  }).markdown!;
  const reorg = buildTestnetRecoveryDrillEvidence({
    kind: 'reorged-burn-stale-singleton',
    evidenceArtifact: 'artifact://recovery/reorg-stale-singleton.md',
    validationArtifact: 'artifact://recovery/reorg-rehearsal-validate.log',
    observationArtifact: 'artifact://recovery/reorg-observe.json',
    pegOutBurnTxId: PEG_OUT_BURN_TX_ID,
    singletonInventoryId: SINGLETON_ID,
  }).markdown!;
  writeFileSync(join(dir, 'aggregate-check.json'), JSON.stringify(record, null, 2));
  writeFileSync(join(dir, 'completed.md'), completedPrebroadcastEvidence(record));
  writeFileSync(join(dir, 'approvals.json'), JSON.stringify(approvalFile(record), null, 2));
  writeFileSync(join(dir, 'fresh-checkpoint.json'), JSON.stringify(freshCheckpointReport(), null, 2));
  writeFileSync(join(dir, 'failed-broadcast-row.md'), failed);
  writeFileSync(join(dir, 'reorg-row.md'), reorg);
  return {
    prebroadcastTarget: `${basename(dir)}/completed.md`,
    approvalsPath: `${basename(dir)}/approvals.json`,
    freshCheckpoint: `${basename(dir)}/fresh-checkpoint.json`,
    failedBroadcast: `${basename(dir)}/failed-broadcast-row.md`,
    reorgRecovery: `${basename(dir)}/reorg-row.md`,
  };
}

function setPreparedCommand(
  report: Record<string, any>,
  label: string,
  command: string | ((current: string) => string),
): void {
  const prepared = (report.preparedCommands as Array<{ label: string; command: string }>)
    .find(entry => entry.label === label);
  if (!prepared) throw new Error(`Missing prepared command ${label}`);
  prepared.command = typeof command === 'function' ? command(prepared.command) : command;
}

describe('testnet rehearsal prep bundle', () => {
  it('creates a read-only preparation bundle with a required fresh checkpoint and optional recovery rows', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prep-bundle-'));
    try {
      const targets = writeFixture(dir);

      const report = buildTestnetRehearsalPrepBundle({
        ...targets,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        doctorArtifact: 'prep/doctor.json',
        preflightArtifact: 'prep/preflight.json',
        windowPrepArtifact: 'prep/window-prep.json',
        offlineGateArtifact: 'prep/offline-gate.json',
        freshCheckpointArtifact: targets.freshCheckpoint,
        operator: 'operator-a',
        reviewer: 'reviewer-a',
        gitCommit: 'abc1234',
        now: NOW,
      });

      expect(report.status).toBe('CREATED');
      expect(report.executionStatus).toBe('QUARANTINED');
      expect(report.errors).toEqual([]);
      expect(report.gateBoundary).toEqual({
        gate3ClosureAllowed: false,
        productionReadyClaimAllowed: false,
        testnetProductionCandidateClaimAllowed: false,
        broadcastAuthorized: false,
        signingPerformed: false,
        liveSubmitPerformed: false,
        confirmationObserved: false,
        reconciliationPerformed: false,
        nodeMutationPerformed: false,
      });
      expect(report.artifactTargets).toEqual({
        prebroadcast: targets.prebroadcastTarget,
        approvals: targets.approvalsPath,
        doctor: 'prep/doctor.json',
        preflight: 'prep/preflight.json',
        windowPrep: 'prep/window-prep.json',
        offlineGate: 'prep/offline-gate.json',
        freshCheckpoint: targets.freshCheckpoint,
        failedBroadcast: targets.failedBroadcast,
        reorgRecovery: targets.reorgRecovery,
      });
      expect(report.sourceBindings).toEqual({
        freshCheckpoint: {
          source: 'prepared-command',
          commandLabel: 'fresh-testnet-check',
          target: targets.freshCheckpoint,
        },
        offlineGate: {
          source: 'prepared-command',
          commandLabel: 'offline-gate',
          target: 'prep/offline-gate.json',
          inputs: {
            prebroadcast: 'prep/doctor.json',
            rehearsalPreflight: 'prep/preflight.json',
            windowPrep: 'prep/window-prep.json',
            freshCheckpoint: targets.freshCheckpoint,
          },
        },
      });
      expect(report.preparedCommands).toEqual([
        {
          label: 'prebroadcast-doctor',
          phase: 'offline-preparation',
          command: `npm run prebroadcast:doctor -- ${targets.prebroadcastTarget} --json-out prep/doctor.json`,
          broadcastCommand: false,
          requiresExplicitLiveBroadcastApproval: false,
        },
        {
          label: 'rehearsal-preflight',
          phase: 'offline-preparation',
          command: `npm run rehearsal:preflight -- --prebroadcast ${targets.prebroadcastTarget} --approvals ${targets.approvalsPath} --json-out prep/preflight.json`,
          broadcastCommand: false,
          requiresExplicitLiveBroadcastApproval: false,
        },
        {
          label: 'testnet-window-prep',
          phase: 'offline-preparation',
          command: `npm run rehearsal:testnet-window-prep -- --prebroadcast ${targets.prebroadcastTarget} --approvals ${targets.approvalsPath} --current-ergo-height 123 --current-sidechain-height 456 --current-deployed-state-hash ${DEPLOYMENT_STATE_HASH} --ergo-node-network testnet --sidechain-network patched-devnet --out TESTNET_WINDOW_PREP_MD --json-out prep/window-prep.json`,
          broadcastCommand: false,
          requiresExplicitLiveBroadcastApproval: false,
        },
        {
          label: 'fresh-testnet-check',
          phase: 'offline-preparation',
          command: `npm run rehearsal:fresh-testnet-check -- --aggregate-evidence aggregate-check.json --auto-heights --current-deployed-state-hash ${DEPLOYMENT_STATE_HASH} --ergo-node-network testnet --sidechain-network patched-devnet --out FRESH_TESTNET_CHECKPOINT_MD --json-out ${targets.freshCheckpoint}`,
          broadcastCommand: false,
          requiresExplicitLiveBroadcastApproval: false,
        },
        {
          label: 'offline-gate',
          phase: 'offline-preparation',
          command: `npm run rehearsal:offline-gate -- --prebroadcast prep/doctor.json --preflight prep/preflight.json --window-prep prep/window-prep.json --fresh-checkpoint ${targets.freshCheckpoint} --json-out prep/offline-gate.json`,
          broadcastCommand: false,
          requiresExplicitLiveBroadcastApproval: false,
        },
        {
          label: 'live-rehearsal-draft',
          phase: 'offline-preparation',
          command: `npm run rehearsal:draft -- --prebroadcast ${targets.prebroadcastTarget} --approvals ${targets.approvalsPath} --out QUARANTINED_REHEARSAL_DRAFT_MD`,
          broadcastCommand: false,
          requiresExplicitLiveBroadcastApproval: false,
        },
        {
          label: 'legacy-v1-live-preflight-quarantine',
          phase: 'blocked-live-settlement',
          command: LEGACY_V1_SUBMISSION_STATUS,
          broadcastCommand: false,
          requiresExplicitLiveBroadcastApproval: false,
        },
      ]);
      expect(report.preparedCommands.map(command => command.command).join('\n')).not.toMatch(/[<>|;]/);
      expect(report.nextHandoff).toEqual({
        label: 'external-fee-profile-activation-prerequisites',
        phase: 'blocked-live-settlement',
        command: LEGACY_V1_SUBMISSION_STATUS,
        requiresExplicitLiveBroadcastApproval: false,
        broadcastCommand: false,
        reportAuthorizesBroadcast: false,
        requiredEvidenceBeforeUse: [
          'reviewed separately versioned external-fee profile identity',
          'exact target-node acceptance evidence',
          'on-chain funds-authority transition evidence',
          'legacy route and vault retirement evidence',
          'cross-profile replay-lineage and cutover evidence',
        ],
        forbiddenBeforeUse: [
          'legacy V1 signing',
          'legacy V1 broadcast',
          'legacy V1 submit',
          'approval as funds authority',
          'diagnostic Expected transaction ID as funds authority',
          'Gate 3 closure',
          'claim escalation',
        ],
      });
      expect(report.stageStatuses).toEqual({
        preflight: 'GO',
        windowPrep: 'CREATED',
        draft: 'CREATED',
        freshCheckpoint: 'LINKED',
        recoveryRows: 'PASS',
      });
      expect(report.recoveryRows).toEqual([
        {
          label: 'failed-broadcast',
          target: targets.failedBroadcast,
          gate: 'Failed broadcast / phantom AVL evidence',
          status: 'linked',
        },
        {
          label: 'reorg-recovery',
          target: targets.reorgRecovery,
          gate: 'Reorged burn / stale singleton evidence',
          status: 'linked',
        },
      ]);
      expect(report.packages[0]).toMatchObject({
        command: 'check-batch',
        mode: 'batch',
        expectedTxId: EXPECTED_TX_ID,
        burnTxHashes: [PEG_OUT_BURN_TX_ID, PEG_OUT_BURN_TX_ID_B],
      });
      expect(report.markdown).toContain('# Testnet Rehearsal Preparation Bundle');
      expect(report.markdown).toContain('npm run rehearsal:fresh-testnet-check');
      expect(report.markdown).toContain('npm run rehearsal:offline-gate');
      expect(report.markdown).toContain('legacy-v1-live-preflight-quarantine');
      expect(report.markdown).toContain('## Operator Handoff');
      expect(report.markdown).toContain(LEGACY_V1_SUBMISSION_STATUS);
      expect(report.markdown).toContain('Requires explicit live broadcast approval: no; approval cannot override this quarantine');
      expect(report.markdown).toContain(`--fresh-checkpoint ${targets.freshCheckpoint}`);
      expect(report.markdown).toContain('Failed broadcast / phantom AVL evidence: linked');
      expect(report.markdown).toContain('Reorged burn / stale singleton evidence: linked');
      expect(report.markdown).toContain('- Gate 3 closure allowed: no');
      expect(report.markdown).toContain('contains no executable live-preflight or submit handoff');
      expect(report.lines.join('\n')).toContain('no signing, submit, confirm, node mutation, or broadcast command executed');
      expect(report.lines.join('\n')).toContain(LEGACY_V1_SUBMISSION_STATUS);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes a structured preparation bundle report', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prep-bundle-'));
    try {
      const targets = writeFixture(dir);
      const report = buildTestnetRehearsalPrepBundle({
        ...targets,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        doctorArtifact: 'prep/doctor.json',
        preflightArtifact: 'prep/preflight.json',
        windowPrepArtifact: 'prep/window-prep.json',
        offlineGateArtifact: 'prep/offline-gate.json',
        freshCheckpointArtifact: targets.freshCheckpoint,
        now: NOW,
      });
      const writeResult = writeOfflineReportJson(`${basename(dir)}/prep-bundle.json`, {
        schemaVersion: 1,
        ...report,
      });
      const saved = JSON.parse(readFileSync(join(dir, 'prep-bundle.json'), 'utf8'));

      expect(writeResult.errors).toEqual([]);
      expect(saved.status).toBe('CREATED');
      expect(saved.executionStatus).toBe('QUARANTINED');
      expect(saved.gateBoundary.broadcastAuthorized).toBe(false);
      expect(saved.gateBoundary.productionReadyClaimAllowed).toBe(false);
      expect(saved.artifactTargets.prebroadcast).toBe(targets.prebroadcastTarget);
      expect(saved.artifactTargets.approvals).toBe(targets.approvalsPath);
      expect(saved.artifactTargets.freshCheckpoint).toBe(targets.freshCheckpoint);
      expect(saved.preparedCommands).toContainEqual(expect.objectContaining({
        label: 'legacy-v1-live-preflight-quarantine',
        phase: 'blocked-live-settlement',
        broadcastCommand: false,
        requiresExplicitLiveBroadcastApproval: false,
      }));
      expect(saved.nextHandoff.command).toBe(LEGACY_V1_SUBMISSION_STATUS);
      expect(saved.nextHandoff.reportAuthorizesBroadcast).toBe(false);
      expect(saved.stageStatuses).toEqual({
        preflight: 'GO',
        windowPrep: 'CREATED',
        draft: 'CREATED',
        freshCheckpoint: 'LINKED',
        recoveryRows: 'PASS',
      });
      expect(saved.recoveryRows).toHaveLength(2);
      expect(saved.packages[0].expectedTxId).toBe(EXPECTED_TX_ID);
      expect(saved.markdown).toContain('Testnet Rehearsal Preparation Bundle');
      expect(validateTestnetRehearsalPrepBundleReport(saved).errors).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('normalizes whitespace-padded preparation artifact targets before exposing commands', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prep-bundle-'));
    try {
      const targets = writeFixture(dir);
      const report = buildTestnetRehearsalPrepBundle({
        prebroadcastTarget: `  ${targets.prebroadcastTarget}  `,
        approvalsPath: `  ${targets.approvalsPath}  `,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        doctorArtifact: '  prep/doctor.json  ',
        preflightArtifact: '  prep/preflight.json  ',
        windowPrepArtifact: '  prep/window-prep.json  ',
        offlineGateArtifact: '  prep/offline-gate.json  ',
        freshCheckpointArtifact: `  ${targets.freshCheckpoint}  `,
        heightEvidenceArtifact: '  prep/heights.json  ',
        now: NOW,
      });
      const preparedCommandText = report.preparedCommands.map(command => command.command).join('\n');

      expect(report.status).toBe('CREATED');
      expect(report.executionStatus).toBe('QUARANTINED');
      expect(report.errors).toEqual([]);
      expect(report.artifactTargets).toMatchObject({
        prebroadcast: targets.prebroadcastTarget,
        approvals: targets.approvalsPath,
        doctor: 'prep/doctor.json',
        preflight: 'prep/preflight.json',
        windowPrep: 'prep/window-prep.json',
        offlineGate: 'prep/offline-gate.json',
        freshCheckpoint: targets.freshCheckpoint,
        heightEvidence: 'prep/heights.json',
      });
      expect(report.sourceBindings.offlineGate.inputs).toEqual({
        prebroadcast: 'prep/doctor.json',
        rehearsalPreflight: 'prep/preflight.json',
        windowPrep: 'prep/window-prep.json',
        freshCheckpoint: targets.freshCheckpoint,
      });
      expect(report.nextHandoff.command).toBe(LEGACY_V1_SUBMISSION_STATUS);
      expect(preparedCommandText).toContain(`--fresh-checkpoint ${targets.freshCheckpoint}`);
      expect(preparedCommandText).toContain('--height-evidence prep/heights.json');
      expect(JSON.stringify(report)).not.toContain(`  ${targets.freshCheckpoint}  `);
      expect(validateTestnetRehearsalPrepBundleReport({ schemaVersion: 1, ...report }).errors).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks unsafe CLI JSON output targets before building preparation evidence', () => {
    const jsonOutTarget = '../operator/private-key-report.json';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-rehearsal-prep-bundle.ts',
        '--prebroadcast',
        'missing-prebroadcast.md',
        '--approvals',
        'missing-approvals.json',
        '--current-ergo-height',
        '123',
        '--current-sidechain-height',
        '456',
        '--current-deployed-state-hash',
        DEPLOYMENT_STATE_HASH,
        '--ergo-node-network',
        'testnet',
        '--sidechain-network',
        'patched-devnet',
        '--fresh-checkpoint-artifact',
        'missing-fresh-checkpoint.json',
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
    expect(result.stderr).not.toContain('missing-prebroadcast.md');
    expect(result.stderr).not.toContain('missing-approvals.json');
    expect(result.stderr).not.toContain('missing-fresh-checkpoint.json');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('blocks unsafe CLI Markdown output targets before building preparation evidence', () => {
    const outTarget = '../operator/private-key-prep-bundle.md';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-rehearsal-prep-bundle.ts',
        '--prebroadcast',
        'missing-prebroadcast.md',
        '--approvals',
        'missing-approvals.json',
        '--current-ergo-height',
        '123',
        '--current-sidechain-height',
        '456',
        '--current-deployed-state-hash',
        DEPLOYMENT_STATE_HASH,
        '--ergo-node-network',
        'testnet',
        '--sidechain-network',
        'patched-devnet',
        '--fresh-checkpoint-artifact',
        'missing-fresh-checkpoint.json',
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
    expect(result.stderr).not.toContain('missing-prebroadcast.md');
    expect(result.stderr).not.toContain('missing-approvals.json');
    expect(result.stderr).not.toContain('missing-fresh-checkpoint.json');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('keeps CLI output guards before preparation bundle construction', () => {
    const source = readFileSync(
      new URL('./scripts/testnet-rehearsal-prep-bundle.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain("import { resolveEvidenceOutputPath } from '../evidence-output-path.js'");
    expect(source).toContain('const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;');
    expect(source).toContain("import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js'");
    expect(source).toContain('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;');
    expect(source).toContain('const report = buildTestnetRehearsalPrepBundle({');
    expect(source.indexOf('const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;')).toBeLessThan(
      source.indexOf('const report = buildTestnetRehearsalPrepBundle({'),
    );
    expect(source.indexOf('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;')).toBeLessThan(
      source.indexOf('const report = buildTestnetRehearsalPrepBundle({'),
    );
  });

  it('binds explicit height evidence into the prepared fresh checkpoint command when provided', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prep-bundle-'));
    try {
      const targets = writeFixture(dir);
      writeFileSync(join(dir, 'height-evidence.json'), JSON.stringify({
        observedAt: '2026-05-18T00:05:00.000Z',
        ergoNodeHeight: 123,
        sidechainBlockHeight: 456,
        sources: {
          ergo: 'read-only-no-auth /info',
          sidechain: 'read-only EVM getBlockNumber',
        },
        broadcastEnabled: false,
      }, null, 2));
      const heightEvidenceArtifact = `${basename(dir)}/height-evidence.json`;

      const report = {
        schemaVersion: 1,
        ...buildTestnetRehearsalPrepBundle({
          ...targets,
          currentErgoHeight: 123,
          currentSidechainHeight: 456,
          currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
          ergoNodeNetwork: 'testnet',
          sidechainNetwork: 'patched-devnet',
          broadcastEnabled: false,
          doctorArtifact: 'prep/doctor.json',
          preflightArtifact: 'prep/preflight.json',
          windowPrepArtifact: 'prep/window-prep.json',
          offlineGateArtifact: 'prep/offline-gate.json',
          freshCheckpointArtifact: targets.freshCheckpoint,
          heightEvidenceArtifact,
          now: NOW,
        }),
      };

      expect(report.status).toBe('CREATED');
      expect(report.executionStatus).toBe('QUARANTINED');
      expect(report.artifactTargets.heightEvidence).toBe(heightEvidenceArtifact);
      expect(report.preparedCommands).toContainEqual({
        label: 'fresh-testnet-check',
        phase: 'offline-preparation',
        command: `npm run rehearsal:fresh-testnet-check -- --aggregate-evidence aggregate-check.json --height-evidence ${heightEvidenceArtifact} --current-ergo-height 123 --current-sidechain-height 456 --current-deployed-state-hash ${DEPLOYMENT_STATE_HASH} --ergo-node-network testnet --sidechain-network patched-devnet --out FRESH_TESTNET_CHECKPOINT_MD --json-out ${targets.freshCheckpoint}`,
        broadcastCommand: false,
        requiresExplicitLiveBroadcastApproval: false,
      });
      expect(validateTestnetRehearsalPrepBundleReport(report).errors).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('validates command and gate boundaries in structured preparation bundle reports', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prep-bundle-'));
    try {
      const targets = writeFixture(dir);
      const report = {
        schemaVersion: 1,
        ...buildTestnetRehearsalPrepBundle({
          ...targets,
          currentErgoHeight: 123,
          currentSidechainHeight: 456,
          currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
          ergoNodeNetwork: 'testnet',
          sidechainNetwork: 'patched-devnet',
          broadcastEnabled: false,
          doctorArtifact: 'prep/doctor.json',
          preflightArtifact: 'prep/preflight.json',
          windowPrepArtifact: 'prep/window-prep.json',
          offlineGateArtifact: 'prep/offline-gate.json',
          freshCheckpointArtifact: targets.freshCheckpoint,
          now: NOW,
        }),
      };

      expect(validateTestnetRehearsalPrepBundleReport(report).errors).toEqual([]);

      const markdownFailureMarkers: any = structuredClone(report);
      markdownFailureMarkers.markdown +=
        '\n- Validation summary: PASS exit code 0; validation BLOCKED with 1 structural issue';
      expect(validateTestnetRehearsalPrepBundleReport(markdownFailureMarkers).errors).toContain(
        'prep bundle JSON markdown must not include contradictory failure markers',
      );

      const lineFailureMarkers: any = structuredClone(report);
      lineFailureMarkers.lines.push(
        '- Validation summary: PASS exit code 0; validation BLOCKED with 1 structural issue',
      );
      expect(validateTestnetRehearsalPrepBundleReport(lineFailureMarkers).errors).toContain(
        'prep bundle JSON lines must not include contradictory failure markers',
      );

      const marker = 'validation\uFF1A \uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue';
      const markdownCompatibilityFailureMarkers: any = structuredClone(report);
      markdownCompatibilityFailureMarkers.markdown += `\n- Validation summary: PASS exit code 0; ${marker}`;
      expect(validateTestnetRehearsalPrepBundleReport(markdownCompatibilityFailureMarkers).errors).toContain(
        'prep bundle JSON markdown must not include contradictory failure markers',
      );

      const lineCompatibilityFailureMarkers: any = structuredClone(report);
      lineCompatibilityFailureMarkers.lines.push(`- Validation summary: PASS exit code 0; ${marker}`);
      expect(validateTestnetRehearsalPrepBundleReport(lineCompatibilityFailureMarkers).errors).toContain(
        'prep bundle JSON lines must not include contradictory failure markers',
      );

      const markdownStructuredFailureFields: any = structuredClone(report);
      markdownStructuredFailureFields.markdown += '\n- JSON summary: {"errors":["missing fresh checkpoint"]}';
      expect(validateTestnetRehearsalPrepBundleReport(markdownStructuredFailureFields).errors).toContain(
        'prep bundle JSON markdown must not include contradictory failure markers',
      );

      const lineStructuredFailureFields: any = structuredClone(report);
      lineStructuredFailureFields.lines.push('- JSON summary: errorCount: 1');
      expect(validateTestnetRehearsalPrepBundleReport(lineStructuredFailureFields).errors).toContain(
        'prep bundle JSON lines must not include contradictory failure markers',
      );

      const markdownStructuredTotalFailureFields: any = structuredClone(report);
      markdownStructuredTotalFailureFields.markdown += '\n- JSON summary: errorsTotal=1; failures_total: 2';
      expect(validateTestnetRehearsalPrepBundleReport(markdownStructuredTotalFailureFields).errors).toContain(
        'prep bundle JSON markdown must not include contradictory failure markers',
      );

      const lineStructuredTotalFailureFields: any = structuredClone(report);
      lineStructuredTotalFailureFields.lines.push('- JSON summary: errorsTotal=1; failures_total: 2');
      expect(validateTestnetRehearsalPrepBundleReport(lineStructuredTotalFailureFields).errors).toContain(
        'prep bundle JSON lines must not include contradictory failure markers',
      );

      const lineStructuredSuccessFields: any = structuredClone(report);
      lineStructuredSuccessFields.lines.push(
        '- JSON summary: errorCount: 0',
        '- JSON summary: errorsTotal=0; failures_total: 0',
        '- JSON summary: {"errors":[]}',
      );
      expect(validateTestnetRehearsalPrepBundleReport(lineStructuredSuccessFields).errors).toEqual([]);

      const markdownRemainingIssues: any = structuredClone(report);
      markdownRemainingIssues.markdown += '\n- Remaining issues:\n  - unresolved prep-bundle blocker';
      expect(validateTestnetRehearsalPrepBundleReport(markdownRemainingIssues).errors).toContain(
        'prep bundle JSON markdown must not include remaining issues',
      );

      const lineRemainingIssues: any = structuredClone(report);
      lineRemainingIssues.lines.push('- Remaining issues:', '  - unresolved prep-bundle blocker');
      expect(validateTestnetRehearsalPrepBundleReport(lineRemainingIssues).errors).toContain(
        'prep bundle JSON lines must not include remaining issues',
      );

      const markdownCompatibilityIssues: any = structuredClone(report);
      markdownCompatibilityIssues.markdown +=
        '\n- \uFF2F\uFF50\uFF45\uFF4E issues\uFF1A unresolved prep-bundle blocker';
      expect(validateTestnetRehearsalPrepBundleReport(markdownCompatibilityIssues).errors).toContain(
        'prep bundle JSON markdown must not include remaining issues',
      );

      const lineCompatibilityIssues: any = structuredClone(report);
      lineCompatibilityIssues.lines.push(
        '- \uFF2F\uFF50\uFF45\uFF4E issues\uFF1A unresolved prep-bundle blocker',
      );
      expect(validateTestnetRehearsalPrepBundleReport(lineCompatibilityIssues).errors).toContain(
        'prep bundle JSON lines must not include remaining issues',
      );

      const markdownOpenIssues: any = structuredClone(report);
      markdownOpenIssues.markdown += '\n- Open issues: unresolved prep-bundle blocker';
      expect(validateTestnetRehearsalPrepBundleReport(markdownOpenIssues).errors).toContain(
        'prep bundle JSON markdown must not include remaining issues',
      );

      const lineKnownIssues: any = structuredClone(report);
      lineKnownIssues.lines.push('- Known issues: unresolved prep-bundle blocker');
      expect(validateTestnetRehearsalPrepBundleReport(lineKnownIssues).errors).toContain(
        'prep bundle JSON lines must not include remaining issues',
      );

      const markdownRuntimePayload: any = structuredClone(report);
      markdownRuntimePayload.markdown += '\n- State source: sourceTarget=C:/tmp/bridge-state.sqlite';
      expect(validateTestnetRehearsalPrepBundleReport(markdownRuntimePayload).errors).toContain(
        'prep bundle JSON markdown must not serialize auth, secret, runtime, state, or database payloads',
      );

      const lineRuntimePayload: any = structuredClone(report);
      lineRuntimePayload.lines.push('- State source: runtime/bridge-state.sqlite');
      expect(validateTestnetRehearsalPrepBundleReport(lineRuntimePayload).errors).toContain(
        'prep bundle JSON lines must not serialize auth, secret, runtime, state, or database payloads',
      );

      const broadcastCommand: any = structuredClone(report);
      broadcastCommand.preparedCommands[0].broadcastCommand = true;
      expect(validateTestnetRehearsalPrepBundleReport(broadcastCommand).errors).toContain(
        'prep bundle JSON preparedCommands.prebroadcast-doctor broadcastCommand must be false',
      );

      const quarantineApprovalEscalation = structuredClone(report);
      quarantineApprovalEscalation.preparedCommands
        .find(command => command.label === 'legacy-v1-live-preflight-quarantine')!
        .requiresExplicitLiveBroadcastApproval = true;
      expect(validateTestnetRehearsalPrepBundleReport(quarantineApprovalEscalation).errors).toContain(
        'prep bundle JSON preparedCommands.legacy-v1-live-preflight-quarantine must not require live broadcast approval',
      );

      const extraApproval: any = structuredClone(report);
      extraApproval.preparedCommands[0].requiresExplicitLiveBroadcastApproval = true;
      expect(validateTestnetRehearsalPrepBundleReport(extraApproval).errors).toContain(
        'prep bundle JSON preparedCommands.prebroadcast-doctor must not require live broadcast approval',
      );

      const gateEscalation: any = structuredClone(report);
      gateEscalation.gateBoundary.broadcastAuthorized = true;
      expect(validateTestnetRehearsalPrepBundleReport(gateEscalation).errors).toContain(
        'prep bundle JSON gateBoundary.broadcastAuthorized must be false',
      );

      const sensitiveTarget = structuredClone(report);
      sensitiveTarget.artifactTargets.doctor = '<blocked prep-bundle target>';
      expect(validateTestnetRehearsalPrepBundleReport(sensitiveTarget).errors).toContain(
        'prep bundle JSON artifactTargets.doctor must be a concrete non-sensitive preparation target',
      );

      const missingSourceBindings: any = structuredClone(report);
      delete missingSourceBindings.sourceBindings;
      expect(validateTestnetRehearsalPrepBundleReport(missingSourceBindings).errors).toContain(
        'prep bundle JSON sourceBindings must be present',
      );

      const wrongFreshCheckpointSourceBinding: any = structuredClone(report);
      wrongFreshCheckpointSourceBinding.sourceBindings.freshCheckpoint.target =
        'other/fresh-checkpoint.json';
      expect(validateTestnetRehearsalPrepBundleReport(wrongFreshCheckpointSourceBinding).errors).toContain(
        'prep bundle JSON sourceBindings.freshCheckpoint.target must match artifactTargets.freshCheckpoint',
      );

      const wrongOfflineGateFreshInput: any = structuredClone(report);
      wrongOfflineGateFreshInput.sourceBindings.offlineGate.inputs.freshCheckpoint =
        'other/fresh-checkpoint.json';
      expect(validateTestnetRehearsalPrepBundleReport(wrongOfflineGateFreshInput).errors).toContain(
        'prep bundle JSON sourceBindings.offlineGate.inputs.freshCheckpoint must match artifactTargets.freshCheckpoint',
      );

      const payloadLeakingSourceBinding: any = structuredClone(report);
      payloadLeakingSourceBinding.sourceBindings.freshCheckpoint.authHeader = 'Bearer redacted';
      payloadLeakingSourceBinding.sourceBindings.offlineGate.runtimePath = 'bridge-state.sqlite';
      payloadLeakingSourceBinding.sourceBindings.offlineGate.inputs.statePath = 'bridge-state.json';
      expect(validateTestnetRehearsalPrepBundleReport(payloadLeakingSourceBinding).errors).toContain(
        'prep bundle JSON sourceBindings must not serialize auth, secret, runtime, state, or database payloads',
      );

      for (const target of [
        'operator/api-key-source.json',
        'operator/signing-key-source.json',
        'operator/seed-phrase-source.json',
        'state/deployed_state.json',
        'sourceTarget=(operator/.env)',
        'sourceTarget=(runtime/bridge-state.sqlite)',
        'sourceTarget=%28operator%2F.env%29',
        'sourceTarget=%28runtime%2Fbridge-state.sqlite%29',
      ]) {
        const sensitiveSourceValue: any = structuredClone(report);
        sensitiveSourceValue.sourceBindings.freshCheckpoint.observationTarget = target;
        expect(validateTestnetRehearsalPrepBundleReport(sensitiveSourceValue).errors).toContain(
          'prep bundle JSON sourceBindings must not serialize auth, secret, runtime, state, or database payloads',
        );
      }

      for (const target of [
        ['C:', 'tmp', 'prep-bundle-source.json'].join('/'),
        ['file:', '', '', 'C:', 'tmp', 'prep-bundle-source.json'].join('/'),
        ['', 'tmp', 'prep-bundle-source.json'].join('/'),
        '%2Ftmp%2Fprep-bundle-source.json',
        'file%3A%2F%2F%2FC%3A%2Ftmp%2Fprep-bundle-source.json',
        'sourceTarget=%2Ftmp%2Fprep-bundle-source.json',
        'sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Fprep-bundle-source.json',
      ]) {
        const localSourceValue: any = structuredClone(report);
        localSourceValue.sourceBindings.freshCheckpoint.observationTarget = target;
        expect(validateTestnetRehearsalPrepBundleReport(localSourceValue).errors).toContain(
          'prep bundle JSON sourceBindings must not serialize auth, secret, runtime, state, or database payloads',
        );
      }

      for (const target of [
        'operator/signing_key-prep.json',
        'operator/seed-phrase-prep.json',
        'state/deployed_state.json',
      ]) {
        const sensitiveCommand: any = structuredClone(report);
        setPreparedCommand(
          sensitiveCommand,
          'prebroadcast-doctor',
          command => `${command} --note ${target}`,
        );
        expect(validateTestnetRehearsalPrepBundleReport(sensitiveCommand).errors).toContain(
          'prep bundle JSON preparedCommands.prebroadcast-doctor command must not expose secret, runtime, or broadcast material',
        );
      }

      const wrongDoctorTarget: any = structuredClone(report);
      setPreparedCommand(
        wrongDoctorTarget,
        'prebroadcast-doctor',
        'npm run prebroadcast:doctor -- other/completed.md --json-out prep/doctor.json',
      );
      expect(validateTestnetRehearsalPrepBundleReport(wrongDoctorTarget).errors).toContain(
        'prep bundle JSON preparedCommands.prebroadcast-doctor command must be "npm run prebroadcast:doctor -- <artifactTargets.prebroadcast> --json-out <artifactTargets.doctor>"',
      );

      const wrongWindowNetwork: any = structuredClone(report);
      setPreparedCommand(
        wrongWindowNetwork,
        'testnet-window-prep',
        command => command.replace('--ergo-node-network testnet', '--ergo-node-network mainnet'),
      );
      expect(validateTestnetRehearsalPrepBundleReport(wrongWindowNetwork).errors).toContain(
        'prep bundle JSON preparedCommands.testnet-window-prep command must use --ergo-node-network testnet',
      );

      const wrongWindowDeploymentHash: any = structuredClone(report);
      setPreparedCommand(
        wrongWindowDeploymentHash,
        'testnet-window-prep',
        command => command.replace(DEPLOYMENT_STATE_HASH, 'f'.repeat(64)),
      );
      expect(validateTestnetRehearsalPrepBundleReport(wrongWindowDeploymentHash).errors).toContain(
        'prep bundle JSON preparedCommands.testnet-window-prep command --current-deployed-state-hash must match prepared package deployedStateHash',
      );

      const missingFreshCheckpointBinding: any = structuredClone(report);
      setPreparedCommand(
        missingFreshCheckpointBinding,
        'fresh-testnet-check',
        command => command.replace(`--json-out ${targets.freshCheckpoint}`, '--json-out other/fresh-checkpoint.json'),
      );
      expect(validateTestnetRehearsalPrepBundleReport(missingFreshCheckpointBinding).errors).toContain(
        'prep bundle JSON preparedCommands.fresh-testnet-check command must bind package aggregate evidence, safe height evidence mode, testnet/non-mainnet network scope, and artifactTargets.freshCheckpoint',
      );

      const wrongFreshAggregateEvidenceBinding: any = structuredClone(report);
      setPreparedCommand(
        wrongFreshAggregateEvidenceBinding,
        'fresh-testnet-check',
        command => command.replace('--aggregate-evidence aggregate-check.json', '--aggregate-evidence other/aggregate-check.json'),
      );
      expect(validateTestnetRehearsalPrepBundleReport(wrongFreshAggregateEvidenceBinding).errors).toContain(
        'prep bundle JSON preparedCommands.fresh-testnet-check command must bind package aggregate evidence, safe height evidence mode, testnet/non-mainnet network scope, and artifactTargets.freshCheckpoint',
      );

      const explicitHeightsWithoutEvidence: any = structuredClone(report);
      setPreparedCommand(
        explicitHeightsWithoutEvidence,
        'fresh-testnet-check',
        `npm run rehearsal:fresh-testnet-check -- --aggregate-evidence aggregate-check.json --height-evidence prep/height-evidence.json --current-ergo-height 123 --current-sidechain-height 456 --current-deployed-state-hash ${DEPLOYMENT_STATE_HASH} --ergo-node-network testnet --sidechain-network patched-devnet --out FRESH_TESTNET_CHECKPOINT_MD --json-out ${targets.freshCheckpoint}`,
      );
      expect(validateTestnetRehearsalPrepBundleReport(explicitHeightsWithoutEvidence).errors).toContain(
        'prep bundle JSON preparedCommands.fresh-testnet-check explicit height mode requires artifactTargets.heightEvidence',
      );

      const heightEvidenceTargetWithoutBinding: any = structuredClone(report);
      heightEvidenceTargetWithoutBinding.artifactTargets.heightEvidence = 'prep/height-evidence.json';
      expect(validateTestnetRehearsalPrepBundleReport(heightEvidenceTargetWithoutBinding).errors).toContain(
        'prep bundle JSON preparedCommands.fresh-testnet-check command must use --height-evidence when artifactTargets.heightEvidence is present',
      );

      const wrongFreshNetwork: any = structuredClone(report);
      setPreparedCommand(
        wrongFreshNetwork,
        'fresh-testnet-check',
        command => command.replace('--sidechain-network patched-devnet', '--sidechain-network mainnet'),
      );
      expect(validateTestnetRehearsalPrepBundleReport(wrongFreshNetwork).errors).toContain(
        'prep bundle JSON preparedCommands.fresh-testnet-check command must use --sidechain-network patched-devnet, testnet, or non-mainnet',
      );

      const wrongFreshDeploymentHash: any = structuredClone(report);
      setPreparedCommand(
        wrongFreshDeploymentHash,
        'fresh-testnet-check',
        command => command.replace(DEPLOYMENT_STATE_HASH, 'f'.repeat(64)),
      );
      expect(validateTestnetRehearsalPrepBundleReport(wrongFreshDeploymentHash).errors).toContain(
        'prep bundle JSON preparedCommands.fresh-testnet-check command --current-deployed-state-hash must match prepared package deployedStateHash',
      );

      const wrongQuarantineCommand: any = structuredClone(report);
      setPreparedCommand(
        wrongQuarantineCommand,
        'legacy-v1-live-preflight-quarantine',
        'run the legacy aggregate submit after approval',
      );
      expect(validateTestnetRehearsalPrepBundleReport(wrongQuarantineCommand).errors).toContain(
        'prep bundle JSON preparedCommands.legacy-v1-live-preflight-quarantine command must be the standard legacy V1 quarantine status',
      );

      const nextHandoffTargetEscalation: any = structuredClone(report);
      nextHandoffTargetEscalation.nextHandoff.targetBindings = {
        approvals: 'other/approvals.json',
      };
      expect(validateTestnetRehearsalPrepBundleReport(nextHandoffTargetEscalation).errors).toContain(
        'prep bundle JSON nextHandoff must not carry live execution target bindings',
      );

      const nextHandoffCommandDrift: any = structuredClone(report);
      nextHandoffCommandDrift.nextHandoff.command =
        'run the legacy aggregate submit after approval';
      expect(validateTestnetRehearsalPrepBundleReport(nextHandoffCommandDrift).errors).toContain(
        'prep bundle JSON nextHandoff.command must match preparedCommands.legacy-v1-live-preflight-quarantine',
      );

      const nextHandoffEscalation: any = structuredClone(report);
      nextHandoffEscalation.nextHandoff.reportAuthorizesBroadcast = true;
      expect(validateTestnetRehearsalPrepBundleReport(nextHandoffEscalation).errors).toContain(
        'prep bundle JSON nextHandoff.reportAuthorizesBroadcast must be false',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks a preparation bundle without a fresh checkpoint artifact', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prep-bundle-'));
    try {
      const targets = writeFixture(dir);
      const report = buildTestnetRehearsalPrepBundle({
        ...targets,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.markdown).toBeUndefined();
      expect(report.stageStatuses.freshCheckpoint).toBe('NOT_PROVIDED');
      expect(report.errors).toContain('freshCheckpoint: fresh testnet checkpoint JSON artifact is required');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks when broadcast is enabled before bundle preparation', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prep-bundle-'));
    try {
      const targets = writeFixture(dir);
      const report = buildTestnetRehearsalPrepBundle({
        ...targets,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: true,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.markdown).toBeUndefined();
      expect(report.gateBoundary.broadcastAuthorized).toBe(false);
      expect(report.gateBoundary.liveSubmitPerformed).toBe(false);
      expect(report.stageStatuses).toEqual({
        preflight: 'GO',
        windowPrep: 'BLOCKED',
        draft: 'CREATED',
        freshCheckpoint: 'NOT_PROVIDED',
        recoveryRows: 'PASS',
      });
      expect(report.artifactTargets.failedBroadcast).toBe(targets.failedBroadcast);
      expect(report.errors).toContain(
        'window-prep: Broadcast policy: BRIDGE_BROADCAST_ENABLED must be false or unset for window preparation',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks invalid recovery rows without closing the bundle', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prep-bundle-'));
    try {
      const targets = writeFixture(dir);
      writeFileSync(join(dir, 'failed-broadcast-row.md'), '| Failed broadcast / phantom AVL evidence | publication blocker | artifact://recovery/pending.md | pending | |');

      const report = buildTestnetRehearsalPrepBundle({
        ...targets,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.recoveryRows).toEqual([
        {
          label: 'reorg-recovery',
          target: targets.reorgRecovery,
          gate: 'Reorged burn / stale singleton evidence',
          status: 'linked',
        },
      ]);
      expect(report.stageStatuses.recoveryRows).toBe('BLOCKED');
      expect(report.errors).toContain(
        'failed-broadcast: Failed broadcast / phantom AVL evidence row status must be pass',
      );
      expect(report.errors).toContain(
        'failed-broadcast: Failed broadcast / phantom AVL evidence row must cite rehearsal:validate PASS evidence',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks recovery rows with compatibility-normalized failure markers', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prep-bundle-'));
    try {
      const targets = writeFixture(dir);
      const row = readFileSync(join(dir, 'failed-broadcast-row.md'), 'utf8');
      writeFileSync(
        join(dir, 'failed-broadcast-row.md'),
        row.replace(
          'npm run rehearsal:validate command output: PASS',
          `npm run rehearsal:validate command output: ${FULLWIDTH_BLOCKED}`,
        ),
      );

      const report = buildTestnetRehearsalPrepBundle({
        ...targets,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.stageStatuses.recoveryRows).toBe('BLOCKED');
      expect(report.errors).toContain(
        'failed-broadcast: Failed broadcast / phantom AVL evidence row must not contain BLOCKED/FAIL',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks recovery rows with certification-family broadcast approval wording', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prep-bundle-'));
    try {
      const targets = writeFixture(dir);
      const row = readFileSync(join(dir, 'failed-broadcast-row.md'), 'utf8');
      writeFileSync(
        join(dir, 'failed-broadcast-row.md'),
        row.replace(
          'structured recovery observation PASS',
          'structured recovery observation PASS; reviewer certifies live broadcast approval;',
        ),
      );

      const report = buildTestnetRehearsalPrepBundle({
        ...targets,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.stageStatuses.recoveryRows).toBe('BLOCKED');
      expect(report.errors).toContain(
        'failed-broadcast: Failed broadcast / phantom AVL evidence row must not enable broadcast',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks recovery rows with compatibility-normalized broadcast enablement', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prep-bundle-'));
    try {
      const targets = writeFixture(dir);
      const row = readFileSync(join(dir, 'failed-broadcast-row.md'), 'utf8');
      writeFileSync(
        join(dir, 'failed-broadcast-row.md'),
        row.replace(
          'structured recovery observation PASS',
          `structured recovery observation PASS; BRIDGE_BROADCAST_ENABLED=${FULLWIDTH_TRUE};`,
        ),
      );

      const report = buildTestnetRehearsalPrepBundle({
        ...targets,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.stageStatuses.recoveryRows).toBe('BLOCKED');
      expect(report.errors).toContain(
        'failed-broadcast: Failed broadcast / phantom AVL evidence row must not enable broadcast',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks recovery rows without a structured recovery observation artifact', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prep-bundle-'));
    try {
      const targets = writeFixture(dir);
      const withoutObservation = readFileSync(join(dir, 'failed-broadcast-row.md'), 'utf8').replace(
        'structured recovery observation PASS observation artifact://recovery/failed-broadcast-observe.json ',
        '',
      );
      writeFileSync(join(dir, 'failed-broadcast-row.md'), withoutObservation);

      const report = buildTestnetRehearsalPrepBundle({
        ...targets,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.stageStatuses.recoveryRows).toBe('BLOCKED');
      expect(report.errors).toContain(
        'failed-broadcast: Failed broadcast / phantom AVL evidence row must cite structured recovery observation PASS evidence',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks a referenced fresh checkpoint without singleton observations', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prep-bundle-'));
    try {
      const targets = writeFixture(dir);
      const invalidFreshCheckpoint = freshCheckpointReport();
      const checkpoint = invalidFreshCheckpoint.checkpoint as Record<string, unknown>;
      delete checkpoint.singletonCheckpoint;
      writeFileSync(join(dir, 'fresh-checkpoint.json'), JSON.stringify(invalidFreshCheckpoint, null, 2));

      const report = buildTestnetRehearsalPrepBundle({
        ...targets,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        freshCheckpointArtifact: targets.freshCheckpoint,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.markdown).toBeUndefined();
      expect(report.stageStatuses.freshCheckpoint).toBe('BLOCKED');
      expect(report.errors).toContain('freshCheckpoint: checkpoint.singletonCheckpoint is required');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks a referenced fresh checkpoint with mismatched singleton box evidence', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prep-bundle-'));
    try {
      const targets = writeFixture(dir);
      const invalidFreshCheckpoint = freshCheckpointReport();
      const checkpoint = invalidFreshCheckpoint.checkpoint as Record<string, any>;
      checkpoint.singletonCheckpoint.singletons[0].observedBoxId = 'c'.repeat(64);
      writeFileSync(join(dir, 'fresh-checkpoint.json'), JSON.stringify(invalidFreshCheckpoint, null, 2));

      const report = buildTestnetRehearsalPrepBundle({
        ...targets,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        freshCheckpointArtifact: targets.freshCheckpoint,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.stageStatuses.freshCheckpoint).toBe('BLOCKED');
      expect(report.errors).toContain(
        'freshCheckpoint: singleton checkpoint observation 1 observed box ID must match deployed_state',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks secret-bearing artifact targets without serializing the raw target', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prep-bundle-'));
    try {
      const targets = writeFixture(dir);
      const sensitivePreflightArtifact = ['C:', 'Users', 'operator', 'wallet', 'private-key.json'].join('/');
      const sensitivePreflightDirectory = ['C:', 'Users', 'operator', 'wallet'].join('/');
      const report = buildTestnetRehearsalPrepBundle({
        ...targets,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        doctorArtifact: 'operator/.env',
        preflightArtifact: sensitivePreflightArtifact,
        windowPrepArtifact: 'runtime/deployed_state.json',
        offlineGateArtifact: 'prep/offline&gate.json',
        freshCheckpointArtifact: 'runtime/fresh-testnet-checkpoint.sqlite',
        heightEvidenceArtifact: 'runtime/height-evidence.sqlite',
        now: NOW,
      });
      const serialized = JSON.stringify(report);

      expect(report.status).toBe('BLOCKED');
      expect(report.markdown).toBeUndefined();
      expect(report.artifactTargets.doctor).toBe('<blocked prep-bundle target>');
      expect(report.artifactTargets.preflight).toBe('<blocked prep-bundle target>');
      expect(report.artifactTargets.windowPrep).toBe('<blocked prep-bundle target>');
      expect(report.artifactTargets.offlineGate).toBe('<blocked prep-bundle target>');
      expect(report.artifactTargets.freshCheckpoint).toBe('fresh-testnet-checkpoint.sqlite');
      expect(report.artifactTargets.heightEvidence).toBe('height-evidence.sqlite');
      expect(report.errors).toContain(
        'artifactTargets.doctor: <blocked prep-bundle target> must not be an environment file',
      );
      expect(report.errors.join('\n')).toContain('artifactTargets.preflight: <blocked prep-bundle target>');
      expect(report.errors).toContain(
        'artifactTargets.windowPrep: <blocked prep-bundle target> must not reference secret-bearing or runtime-state material',
      );
      expect(report.errors).toContain(
        'artifactTargets.offlineGate: <blocked prep-bundle target> must not contain whitespace or shell metacharacters',
      );
      expect(report.errors).toContain(
        'artifactTargets.freshCheckpoint: fresh-testnet-checkpoint.sqlite must not reference runtime database material',
      );
      expect(report.errors).toContain(
        'artifactTargets.heightEvidence: height-evidence.sqlite must not reference runtime database material',
      );
      expect(serialized).not.toContain('operator/.env');
      expect(serialized).not.toContain('private-key.json');
      expect(serialized).not.toContain('deployed_state.json');
      expect(serialized).not.toContain(sensitivePreflightDirectory);
      expect(serialized).not.toContain('runtime/deployed_state');
      expect(serialized).not.toContain('offline&gate');
      expect(serialized).toContain('<blocked prep-bundle target>');

      for (const target of [
        'operator/signing-key-doctor.json',
        'operator/api-key-doctor.json',
        'operator/seed-phrase-doctor.json',
        'runtime/deployed_state.json',
      ]) {
        const secretReport = buildTestnetRehearsalPrepBundle({
          ...targets,
          currentErgoHeight: 123,
          currentSidechainHeight: 456,
          currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
          ergoNodeNetwork: 'testnet',
          sidechainNetwork: 'patched-devnet',
          broadcastEnabled: false,
          doctorArtifact: target,
          now: NOW,
        });

        expect(secretReport.status, target).toBe('BLOCKED');
        expect(secretReport.artifactTargets.doctor, target).toBe('<blocked prep-bundle target>');
        expect(secretReport.errors, target).toContain(
          'artifactTargets.doctor: <blocked prep-bundle target> must not reference secret-bearing or runtime-state material',
        );
        expect(JSON.stringify(secretReport), target).not.toContain(target);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks local absolute artifact targets without serializing target filenames', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prep-bundle-'));
    try {
      const targets = writeFixture(dir);
      const localDoctorArtifact = ['', 'tmp', 'prep-doctor.json'].join('/');
      const localPreflightArtifact = ['', 'tmp', 'rehearsal-preflight.json'].join('/');
      const report = buildTestnetRehearsalPrepBundle({
        ...targets,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        doctorArtifact: localDoctorArtifact,
        preflightArtifact: localPreflightArtifact,
        freshCheckpointArtifact: targets.freshCheckpoint,
        now: NOW,
      });
      const serialized = JSON.stringify(report);

      expect(report.status).toBe('BLOCKED');
      expect(report.markdown).toBeUndefined();
      expect(report.artifactTargets.doctor).toBe('<blocked prep-bundle target>');
      expect(report.artifactTargets.preflight).toBe('<blocked prep-bundle target>');
      expect(report.errors).toContain(
        'artifactTargets.doctor: <blocked prep-bundle target> must be a relative non-secret evidence target',
      );
      expect(report.errors).toContain(
        'artifactTargets.preflight: <blocked prep-bundle target> must be a relative non-secret evidence target',
      );
      expect(serialized).toContain('<blocked prep-bundle target>');
      expect(serialized).not.toContain('prep-doctor.json');
      expect(serialized).not.toContain('rehearsal-preflight.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks prebroadcast targets that resolve outside the bridge without serializing the raw target', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prep-bundle-'));
    const external = mkdtempSync(join(tmpdir(), 'prep-bundle-prebroadcast-'));
    try {
      const targets = writeFixture(dir);
      writeFixture(external);
      symlinkSync(external, join(dir, 'link-out'), process.platform === 'win32' ? 'junction' : 'dir');

      const report = buildTestnetRehearsalPrepBundle({
        ...targets,
        prebroadcastTarget: `${basename(dir)}/link-out/completed.md`,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        freshCheckpointArtifact: targets.freshCheckpoint,
        now: NOW,
      });
      const serialized = JSON.stringify(report);

      expect(report.status).toBe('BLOCKED');
      expect(report.artifactTargets.prebroadcast).toBe('<blocked evidence target>');
      expect(report.errors).toContain(
        'preflight: <blocked evidence target>: refusing to read evidence paths outside the bridge repository',
      );
      expect(serialized).toContain('<blocked evidence target>');
      expect(serialized).not.toContain('link-out');
      expect(serialized).not.toContain('completed.md');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });

  it('blocks fresh checkpoint targets that resolve outside the bridge without serializing the raw target', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prep-bundle-'));
    const external = mkdtempSync(join(tmpdir(), 'prep-bundle-fresh-checkpoint-'));
    try {
      const targets = writeFixture(dir);
      writeFileSync(join(external, 'fresh-checkpoint.json'), JSON.stringify(freshCheckpointReport(), null, 2));
      symlinkSync(external, join(dir, 'link-out'), process.platform === 'win32' ? 'junction' : 'dir');

      const report = buildTestnetRehearsalPrepBundle({
        ...targets,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        freshCheckpointArtifact: `${basename(dir)}/link-out/fresh-checkpoint.json`,
        now: NOW,
      });
      const serialized = JSON.stringify(report);

      expect(report.status).toBe('BLOCKED');
      expect(report.stageStatuses.freshCheckpoint).toBe('BLOCKED');
      expect(report.errors).toContain(
        'freshCheckpoint: <blocked prep-bundle target> must resolve inside the bridge repository',
      );
      expect(serialized).toContain('<blocked prep-bundle target>');
      expect(serialized).not.toContain('link-out');
      expect(serialized).not.toContain('fresh-checkpoint.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });

  it('requires generated preparation artifact targets to be JSON reports', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prep-bundle-'));
    try {
      const targets = writeFixture(dir);
      const report = buildTestnetRehearsalPrepBundle({
        ...targets,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        doctorArtifact: 'prep/doctor.md',
        preflightArtifact: 'prep/preflight.log',
        windowPrepArtifact: 'prep/window-prep.txt',
        offlineGateArtifact: 'prep/offline-gate.md',
        heightEvidenceArtifact: 'prep/height-evidence.txt',
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.markdown).toBeUndefined();
      expect(report.errors).toContain('artifactTargets.doctor: prep/doctor.md must be a .json preparation artifact');
      expect(report.errors).toContain('artifactTargets.preflight: prep/preflight.log must be a .json preparation artifact');
      expect(report.errors).toContain('artifactTargets.windowPrep: prep/window-prep.txt must be a .json preparation artifact');
      expect(report.errors).toContain('artifactTargets.offlineGate: prep/offline-gate.md must be a .json preparation artifact');
      expect(report.errors).toContain('artifactTargets.heightEvidence: prep/height-evidence.txt must be a .json preparation artifact');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects fixture-style, synthetic, and simulated preparation artifact targets', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prep-bundle-'));
    try {
      const targets = writeFixture(dir);
      writeFileSync(join(dir, 'fixture-completed.md'), readFileSync(join(dir, 'completed.md'), 'utf-8'));
      writeFileSync(join(dir, 'mock-approvals.json'), readFileSync(join(dir, 'approvals.json'), 'utf-8'));

      const report = buildTestnetRehearsalPrepBundle({
        ...targets,
        prebroadcastTarget: `${basename(dir)}/fixture-completed.md`,
        approvalsPath: `${basename(dir)}/mock-approvals.json`,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        doctorArtifact: 'prep/dummy-doctor.json',
        preflightArtifact: 'prep/fake-preflight.json',
        windowPrepArtifact: 'prep/stub-window-prep.json',
        offlineGateArtifact: 'prep/testdata-offline-gate.json',
        heightEvidenceArtifact: 'prep/fixture-height-evidence.json',
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.markdown).toBeUndefined();
      expect(report.errors).toContain(
        `artifactTargets.prebroadcast: ${basename(dir)}/fixture-completed.md must not be a template, placeholder, or non-concrete target`,
      );
      expect(report.errors).toContain(
        `artifactTargets.approvals: ${basename(dir)}/mock-approvals.json must not be a template, placeholder, or non-concrete target`,
      );
      expect(report.errors).toContain(
        'artifactTargets.doctor: prep/dummy-doctor.json must not be a template, placeholder, or non-concrete target',
      );
      expect(report.errors).toContain(
        'artifactTargets.preflight: prep/fake-preflight.json must not be a template, placeholder, or non-concrete target',
      );
      expect(report.errors).toContain(
        'artifactTargets.windowPrep: prep/stub-window-prep.json must not be a template, placeholder, or non-concrete target',
      );
      expect(report.errors).toContain(
        'artifactTargets.offlineGate: prep/testdata-offline-gate.json must not be a template, placeholder, or non-concrete target',
      );
      expect(report.errors).toContain(
        'artifactTargets.heightEvidence: prep/fixture-height-evidence.json must not be a template, placeholder, or non-concrete target',
      );

      writeFileSync(join(dir, 'completed-synthetic.md'), readFileSync(join(dir, 'completed.md'), 'utf-8'));
      writeFileSync(join(dir, 'completed-synthetic-approvals.json'), readFileSync(join(dir, 'approvals.json'), 'utf-8'));

      const syntheticReport = buildTestnetRehearsalPrepBundle({
        ...targets,
        prebroadcastTarget: `${basename(dir)}/completed-synthetic.md`,
        approvalsPath: `${basename(dir)}/completed-synthetic-approvals.json`,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        doctorArtifact: 'prep/completed-synthetic-doctor.json',
        preflightArtifact: 'prep/completed-synthetic-preflight.json',
        windowPrepArtifact: 'prep/completed-synthetic-window-prep.json',
        offlineGateArtifact: 'prep/completed-synthetic-offline-gate.json',
        heightEvidenceArtifact: 'prep/completed-synthetic-height-evidence.json',
        now: NOW,
      });

      expect(syntheticReport.status).toBe('BLOCKED');
      expect(syntheticReport.markdown).toBeUndefined();
      expect(syntheticReport.errors).toContain(
        `artifactTargets.prebroadcast: ${basename(dir)}/completed-synthetic.md must not be a template, placeholder, or non-concrete target`,
      );
      expect(syntheticReport.errors).toContain(
        `artifactTargets.approvals: ${basename(dir)}/completed-synthetic-approvals.json must not be a template, placeholder, or non-concrete target`,
      );
      expect(syntheticReport.errors).toContain(
        'artifactTargets.doctor: prep/completed-synthetic-doctor.json must not be a template, placeholder, or non-concrete target',
      );
      expect(syntheticReport.errors).toContain(
        'artifactTargets.preflight: prep/completed-synthetic-preflight.json must not be a template, placeholder, or non-concrete target',
      );
      expect(syntheticReport.errors).toContain(
        'artifactTargets.windowPrep: prep/completed-synthetic-window-prep.json must not be a template, placeholder, or non-concrete target',
      );
      expect(syntheticReport.errors).toContain(
        'artifactTargets.offlineGate: prep/completed-synthetic-offline-gate.json must not be a template, placeholder, or non-concrete target',
      );
      expect(syntheticReport.errors).toContain(
        'artifactTargets.heightEvidence: prep/completed-synthetic-height-evidence.json must not be a template, placeholder, or non-concrete target',
      );

      writeFileSync(join(dir, 'completed-simulated.md'), readFileSync(join(dir, 'completed.md'), 'utf-8'));
      writeFileSync(join(dir, 'completed-simulated-approvals.json'), readFileSync(join(dir, 'approvals.json'), 'utf-8'));

      const simulatedReport = buildTestnetRehearsalPrepBundle({
        ...targets,
        prebroadcastTarget: `${basename(dir)}/completed-simulated.md`,
        approvalsPath: `${basename(dir)}/completed-simulated-approvals.json`,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        doctorArtifact: 'prep/completed-simulated-doctor.json',
        preflightArtifact: 'prep/completed-simulated-preflight.json',
        windowPrepArtifact: 'prep/completed-simulated-window-prep.json',
        offlineGateArtifact: 'prep/completed-simulated-offline-gate.json',
        heightEvidenceArtifact: 'prep/completed-simulated-height-evidence.json',
        now: NOW,
      });

      expect(simulatedReport.status).toBe('BLOCKED');
      expect(simulatedReport.markdown).toBeUndefined();
      expect(simulatedReport.errors).toContain(
        `artifactTargets.prebroadcast: ${basename(dir)}/completed-simulated.md must not be a template, placeholder, or non-concrete target`,
      );
      expect(simulatedReport.errors).toContain(
        `artifactTargets.approvals: ${basename(dir)}/completed-simulated-approvals.json must not be a template, placeholder, or non-concrete target`,
      );
      expect(simulatedReport.errors).toContain(
        'artifactTargets.doctor: prep/completed-simulated-doctor.json must not be a template, placeholder, or non-concrete target',
      );
      expect(simulatedReport.errors).toContain(
        'artifactTargets.preflight: prep/completed-simulated-preflight.json must not be a template, placeholder, or non-concrete target',
      );
      expect(simulatedReport.errors).toContain(
        'artifactTargets.windowPrep: prep/completed-simulated-window-prep.json must not be a template, placeholder, or non-concrete target',
      );
      expect(simulatedReport.errors).toContain(
        'artifactTargets.offlineGate: prep/completed-simulated-offline-gate.json must not be a template, placeholder, or non-concrete target',
      );
      expect(simulatedReport.errors).toContain(
        'artifactTargets.heightEvidence: prep/completed-simulated-height-evidence.json must not be a template, placeholder, or non-concrete target',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects claim-escalating preparation artifact targets', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prep-bundle-'));
    try {
      const targets = writeFixture(dir);
      const report = buildTestnetRehearsalPrepBundle({
        ...targets,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        doctorArtifact: 'prep/production-ready-doctor.json',
        preflightArtifact: 'prep/testnet-production-candidate-preflight.json',
        windowPrepArtifact: 'prep/production-ready-window-prep.json',
        offlineGateArtifact: 'prep/mainnet-production-offline-gate.json',
        freshCheckpointArtifact: targets.freshCheckpoint,
        heightEvidenceArtifact: 'prep/production-ready-heights.json',
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.markdown).toBeUndefined();
      expect(report.errors).toContain(
        'artifactTargets.doctor: prep/production-ready-doctor.json must not use production claim wording',
      );
      expect(report.errors).toContain(
        'artifactTargets.preflight: prep/testnet-production-candidate-preflight.json must not use production claim wording',
      );
      expect(report.errors).toContain(
        'artifactTargets.windowPrep: prep/production-ready-window-prep.json must not use production claim wording',
      );
      expect(report.errors).toContain(
        'artifactTargets.offlineGate: prep/mainnet-production-offline-gate.json must not use production claim wording',
      );
      expect(report.errors).toContain(
        'artifactTargets.heightEvidence: prep/production-ready-heights.json must not use production claim wording',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows concrete preparation audit targets with template or sample in the finding name', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prep-bundle-'));
    try {
      const targets = writeFixture(dir);
      const concretePrebroadcastTarget = `${basename(dir)}/template-removal-audit-completed.md`;
      const concreteApprovalsPath = `${basename(dir)}/sample-size-analysis-approvals.json`;
      writeFileSync(
        join(dir, 'template-removal-audit-completed.md'),
        readFileSync(join(dir, 'completed.md'), 'utf-8'),
      );
      writeFileSync(
        join(dir, 'sample-size-analysis-approvals.json'),
        readFileSync(join(dir, 'approvals.json'), 'utf-8'),
      );

      const report = buildTestnetRehearsalPrepBundle({
        ...targets,
        prebroadcastTarget: concretePrebroadcastTarget,
        approvalsPath: concreteApprovalsPath,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        doctorArtifact: 'prep/template-removal-audit-doctor.json',
        preflightArtifact: 'prep/sample-size-analysis-preflight.json',
        windowPrepArtifact: 'prep/template-removal-audit-window-prep.json',
        offlineGateArtifact: 'prep/sample-size-analysis-offline-gate.json',
        freshCheckpointArtifact: targets.freshCheckpoint,
        heightEvidenceArtifact: 'prep/template-removal-audit-heights.json',
        now: NOW,
      });

      expect(report.status).toBe('CREATED');
      expect(report.executionStatus).toBe('QUARANTINED');
      expect(report.errors).toEqual([]);
      expect(report.artifactTargets).toMatchObject({
        prebroadcast: concretePrebroadcastTarget,
        approvals: concreteApprovalsPath,
        doctor: 'prep/template-removal-audit-doctor.json',
        preflight: 'prep/sample-size-analysis-preflight.json',
        windowPrep: 'prep/template-removal-audit-window-prep.json',
        offlineGate: 'prep/sample-size-analysis-offline-gate.json',
        heightEvidence: 'prep/template-removal-audit-heights.json',
      });
      expect(report.nextHandoff.command).toBe(LEGACY_V1_SUBMISSION_STATUS);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('requires concrete preparation artifact targets to be distinct', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prep-bundle-'));
    try {
      const targets = writeFixture(dir);
      const report = buildTestnetRehearsalPrepBundle({
        ...targets,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        doctorArtifact: 'prep/shared.json',
        preflightArtifact: 'prep/shared.json',
        offlineGateArtifact: targets.freshCheckpoint,
        freshCheckpointArtifact: targets.freshCheckpoint,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.markdown).toBeUndefined();
      expect(report.errors).toContain(
        'artifactTargets must be distinct: artifactTargets.doctor and artifactTargets.preflight both use prep/shared.json',
      );
      expect(report.errors).toContain(
        `artifactTargets must be distinct: artifactTargets.offlineGate and artifactTargets.freshCheckpoint both use ${targets.freshCheckpoint}`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
