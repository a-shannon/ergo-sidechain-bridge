import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildAggregateSettlementPrebroadcastEvidenceRecord,
  type AggregateSettlementPrebroadcastEvidenceRecord,
} from './aggregate-settlement-evidence.js';
import { TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY } from './aggregate-settlement-evidence.test-helper.js';
import {
  prepareTestnetWindowPacket,
  validateTestnetWindowPrepReport,
} from './testnet-window-prep.js';
import { writeOfflineReportJson } from './offline-report-json.js';
import { gateTestnetOfflineRehearsalBundle } from './testnet-offline-rehearsal-gate.js';
import { LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE } from './legacy-aggregate-settlement-conservation.js';

const NOW = new Date('2026-05-17T18:30:00.000Z');
const PEG_OUT_BURN_TX_ID = '1'.repeat(64);
const PEG_OUT_BURN_TX_ID_B = '9'.repeat(64);
const SIDECHAIN_BLOCK_HASH = '2'.repeat(64);
const BRIDGE_EVENT_ROOT = '3'.repeat(64);
const EXPECTED_TX_ID = '4'.repeat(64);
const DEPLOYMENT_STATE_HASH = '5'.repeat(64);
const CONTRACT_ID = '6'.repeat(64);
const SINGLETON_ID = '7'.repeat(64);
const PEG_IN_EVENT_ID = '8'.repeat(64);
const FRESH_CHECKPOINT_ERGO_NODE_URL = 'http://localhost:9052';
const FRESH_CHECKPOINT_SIDECHAIN_RPC_URL = 'http://localhost:9945';
const LEGACY_V1_SUBMISSION_STATUS = `BLOCKED: ${LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE}`;

function aggregateEvidenceRecord(): AggregateSettlementPrebroadcastEvidenceRecord {
  return buildAggregateSettlementPrebroadcastEvidenceRecord({
    generatedAt: '2026-05-17T18:20:00.000Z',
    command: 'check-batch',
    label: 'Aggregate settlement testnet window fixture',
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

- Evidence package name: fresh-testnet-prebroadcast-2026-05-17
- Date: 2026-05-17
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
- Date: 2026-05-17
`;
}

function approvalFile(record: AggregateSettlementPrebroadcastEvidenceRecord): Record<string, unknown> {
  const burnTxHashes = record.claims.map(claim => claim.burnTxHash);
  const burnSet = burnTxHashes.join(',');
  const checkCommand = `npm run settle:aggregate -- check-batch ${burnTxHashes.join(' ')}`;
  return {
    version: 2,
    createdAt: '2026-05-17T18:00:00Z',
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
      approvedAt: '2026-05-17T18:05:00Z',
      expiresAt: '2026-05-17T19:05:00Z',
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

function writeFixture(dir: string): { prebroadcastTarget: string; approvalsPath: string } {
  mkdirSync(dir, { recursive: true });
  const record = aggregateEvidenceRecord();
  writeFileSync(join(dir, 'aggregate-check.json'), JSON.stringify(record, null, 2));
  writeFileSync(join(dir, 'completed.md'), completedPrebroadcastEvidence(record));
  writeFileSync(join(dir, 'approvals.json'), JSON.stringify(approvalFile(record), null, 2));
  return {
    prebroadcastTarget: `${basename(dir)}/completed.md`,
    approvalsPath: `${basename(dir)}/approvals.json`,
  };
}

function freshCheckpointArtifact() {
  const observedAt = new Date().toISOString();
  return {
    status: 'CREATED',
    message: 'fresh testnet non-broadcast checkpoint CREATED publication-blocker',
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
      sidechainHeaderHashHexes: [SIDECHAIN_BLOCK_HASH, 'a'.repeat(64)],
      ergoAnchorHeights: [100, 101],
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
          name: 'sideChainState',
          nftId: SINGLETON_ID,
          expectedBoxId: CONTRACT_ID,
          observedBoxId: CONTRACT_ID,
          expectedErgoTreeHex: '0e'.repeat(32),
          observedErgoTreeHex: '0e'.repeat(32),
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

describe('testnet window prep packet', () => {
  it('creates a read-only packet from matched prebroadcast and approval evidence', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-testnet-window-prep-'));
    try {
      const targets = writeFixture(dir);

      const report = prepareTestnetWindowPacket({
        ...targets,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        now: NOW,
      });

      expect(report.status).toBe('CREATED');
      expect(report.executionStatus).toBe('QUARANTINED');
      expect(report.errors).toEqual([]);
      expect(report.targetBindings).toEqual({
        prebroadcast: targets.prebroadcastTarget,
        approvals: targets.approvalsPath,
      });
      expect(report.networkScope).toEqual({
        environment: 'testnet',
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
      });
      expect(report.heightBoundary).toEqual({
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        maxPreflightErgoAnchorHeight: 101,
        maxPreflightSidechainBlockHeight: 201,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        packageDeployedStateHash: DEPLOYMENT_STATE_HASH,
      });
      expect(report.gateBoundary).toEqual({
        reportAuthorizesBroadcast: false,
        broadcastAuthorized: false,
        liveSubmitPerformed: false,
        confirmationObserved: false,
        reconciliationPerformed: false,
        gate3ClosureAllowed: false,
        productionReadyClaimAllowed: false,
        testnetProductionCandidateClaimAllowed: false,
      });
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
      expect(report.markdown).toContain('# Testnet Live Window Preparation Packet');
      expect(report.markdown).toContain('## Operator Handoff');
      expect(report.markdown).toContain(LEGACY_V1_SUBMISSION_STATUS);
      expect(report.markdown).toContain(`- Expected transaction ID: ${EXPECTED_TX_ID}`);
      expect(report.markdown).toContain(`- Ordered burn set: ${PEG_OUT_BURN_TX_ID},${PEG_OUT_BURN_TX_ID_B}`);
      expect(report.markdown).toContain('- Current Ergo height: 123');
      expect(report.markdown).toContain('- Current sidechain height: 456');
      expect(report.markdown).toContain('- Max preflight Ergo anchor height: 101');
      expect(report.markdown).toContain('- Max preflight sidechain block height: 201');
      expect(report.markdown).toContain(`- Current deployment-state hash: ${DEPLOYMENT_STATE_HASH}`);
      expect(report.markdown).toContain(`- Preflight deployment-state hash: ${DEPLOYMENT_STATE_HASH}`);
      expect(report.markdown).toContain('- Package 1 ergoAnchorHeights: 100,101');
      expect(report.markdown).toContain('- Package 1 sidechainBlockHeights: 200,201');
      expect(report.markdown).toContain(`- Package 1 sidechainHeaderHashHexes: ${SIDECHAIN_BLOCK_HASH},${'a'.repeat(64)}`);
      expect(report.markdown).toContain(`- Package 1 bridgeEventRoots: ${BRIDGE_EVENT_ROOT},${'b'.repeat(64)}`);
      expect(report.markdown).toContain('- Broadcast enabled: no');
      expect(report.markdown).toContain('- Gate 3 closure allowed: no');
      expect(report.markdown).toContain('- Production-ready claim allowed: no');
      expect(report.markdown).toContain('- Testnet production-candidate claim allowed: no');
      expect(report.markdown).toContain('does not authorize broadcast');
      expect(report.lines.join('\n')).toContain('testnet window prep CREATED');
      expect(report.lines.join('\n')).toContain(LEGACY_V1_SUBMISSION_STATUS);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows concrete window-prep audit targets that mention sample size or template removal', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-testnet-window-prep-'));
    try {
      writeFixture(dir);
      const targets = {
        prebroadcastTarget: `${basename(dir)}/template-removal-audit-prebroadcast.md`,
        approvalsPath: `${basename(dir)}/sample-size-analysis-approvals.json`,
      };
      writeFileSync(
        join(dir, 'template-removal-audit-prebroadcast.md'),
        readFileSync(join(dir, 'completed.md'), 'utf-8'),
      );
      writeFileSync(
        join(dir, 'sample-size-analysis-approvals.json'),
        readFileSync(join(dir, 'approvals.json'), 'utf-8'),
      );

      const report = prepareTestnetWindowPacket({
        ...targets,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        now: NOW,
      });

      expect(report.status).toBe('CREATED');
      expect(report.errors).toEqual([]);
      expect(report.targetBindings).toEqual({
        prebroadcast: targets.prebroadcastTarget,
        approvals: targets.approvalsPath,
      });
      expect(validateTestnetWindowPrepReport({ schemaVersion: 1, ...report }).errors).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks shell-unsafe target bindings without exposing them in the quarantined handoff', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-testnet-window prep-'));
    try {
      const targets = writeFixture(dir);
      const report = prepareTestnetWindowPacket({
        ...targets,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        now: NOW,
      });
      const serialized = JSON.stringify(report);

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'Window preparation targetBindings.prebroadcast: <blocked window-prep target> must not contain whitespace or shell metacharacters',
      );
      expect(report.errors).toContain(
        'Window preparation targetBindings.approvals: <blocked window-prep target> must not contain whitespace or shell metacharacters',
      );
      expect(report.targetBindings).toEqual({
        prebroadcast: '<blocked window-prep target>',
        approvals: '<blocked window-prep target>',
      });
      expect(report.nextHandoff.command).toBe(LEGACY_V1_SUBMISSION_STATUS);
      expect(serialized).not.toContain(basename(dir));
      expect(serialized).not.toContain(targets.prebroadcastTarget);
      expect(serialized).not.toContain(targets.approvalsPath);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes a structured CREATED report accepted by the offline gate', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-testnet-window-prep-'));
    try {
      const targets = writeFixture(dir);
      const report = prepareTestnetWindowPacket({
        ...targets,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        now: NOW,
      });
      const writeResult = writeOfflineReportJson(`${basename(dir)}/window-prep.json`, {
        schemaVersion: 1,
        ...report,
      });
      const saved = JSON.parse(readFileSync(join(dir, 'window-prep.json'), 'utf8'));
      const gate = gateTestnetOfflineRehearsalBundle({
        prebroadcast: {
          status: 'PASS',
          broadcastEnabled: false,
          ergoNodeNetwork: 'testnet',
          reports: [{
            linkedAggregateJsonSummaries: [{
              status: 'READ',
              command: 'check-batch',
              expectedTxId: EXPECTED_TX_ID,
            }],
          }],
        },
        rehearsalPreflight: { status: 'GO', broadcastEnabled: false, packages: saved.packages },
        windowPrep: saved,
        freshCheckpoint: freshCheckpointArtifact(),
      });

      expect(writeResult.errors).toEqual([]);
      expect(saved.status).toBe('CREATED');
      expect(saved.executionStatus).toBe('QUARANTINED');
      expect(saved.packages[0]).toMatchObject({
        mode: 'batch',
        expectedTxId: EXPECTED_TX_ID,
        burnTxHashes: [PEG_OUT_BURN_TX_ID, PEG_OUT_BURN_TX_ID_B],
        sidechainHeaderHashHexes: [SIDECHAIN_BLOCK_HASH, 'a'.repeat(64)],
        deployedStateHash: DEPLOYMENT_STATE_HASH,
      });
      expect(saved.lines.join('\n')).toContain('this report does not authorize broadcast');
      expect(saved.targetBindings).toEqual({
        prebroadcast: targets.prebroadcastTarget,
        approvals: targets.approvalsPath,
      });
      expect(saved.networkScope.broadcastEnabled).toBe(false);
      expect(saved.heightBoundary.currentDeployedStateHash).toBe(DEPLOYMENT_STATE_HASH);
      expect(saved.gateBoundary.reportAuthorizesBroadcast).toBe(false);
      expect(saved.nextHandoff.command).toBe(LEGACY_V1_SUBMISSION_STATUS);
      expect(validateTestnetWindowPrepReport(saved).errors).toEqual([]);
      expect(gate.errors).toEqual([]);
      expect(gate.status).toBe('PASS');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('validates structured report boundaries, synthetic target bindings, and deployment-state binding', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-testnet-window-prep-'));
    try {
      const targets = writeFixture(dir);
      const report = {
        schemaVersion: 1,
        ...prepareTestnetWindowPacket({
          ...targets,
          currentErgoHeight: 123,
          currentSidechainHeight: 456,
          currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
          ergoNodeNetwork: 'testnet',
          sidechainNetwork: 'patched-devnet',
          broadcastEnabled: false,
          now: NOW,
        }),
      };

      expect(validateTestnetWindowPrepReport(report).errors).toEqual([]);

      const markdownFailureMarkers: any = structuredClone(report);
      markdownFailureMarkers.markdown +=
        '\n- Validation summary: PASS exit code 0; validation BLOCKED with 1 structural issue';
      expect(validateTestnetWindowPrepReport(markdownFailureMarkers).errors).toContain(
        'window-prep: markdown must not include contradictory failure markers',
      );

      const lineFailureMarkers: any = structuredClone(report);
      lineFailureMarkers.lines.push(
        '- Validation summary: PASS exit code 0; validation BLOCKED with 1 structural issue',
      );
      expect(validateTestnetWindowPrepReport(lineFailureMarkers).errors).toContain(
        'window-prep: lines must not include contradictory failure markers',
      );

      const marker = 'validation\uFF1A \uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue';
      const markdownCompatibilityFailureMarkers: any = structuredClone(report);
      markdownCompatibilityFailureMarkers.markdown += `\n- Validation summary: PASS exit code 0; ${marker}`;
      expect(validateTestnetWindowPrepReport(markdownCompatibilityFailureMarkers).errors).toContain(
        'window-prep: markdown must not include contradictory failure markers',
      );

      const lineCompatibilityFailureMarkers: any = structuredClone(report);
      lineCompatibilityFailureMarkers.lines.push(`- Validation summary: PASS exit code 0; ${marker}`);
      expect(validateTestnetWindowPrepReport(lineCompatibilityFailureMarkers).errors).toContain(
        'window-prep: lines must not include contradictory failure markers',
      );

      const markdownStructuredFailureFields: any = structuredClone(report);
      markdownStructuredFailureFields.markdown += '\n- JSON summary: {"errors":["missing approval binding"]}';
      expect(validateTestnetWindowPrepReport(markdownStructuredFailureFields).errors).toContain(
        'window-prep: markdown must not include contradictory failure markers',
      );

      const lineStructuredFailureFields: any = structuredClone(report);
      lineStructuredFailureFields.lines.push('- JSON summary: errorCount: 1');
      expect(validateTestnetWindowPrepReport(lineStructuredFailureFields).errors).toContain(
        'window-prep: lines must not include contradictory failure markers',
      );

      const markdownStructuredTotalFailureFields: any = structuredClone(report);
      markdownStructuredTotalFailureFields.markdown += '\n- JSON summary: errorsTotal=1; failures_total: 2';
      expect(validateTestnetWindowPrepReport(markdownStructuredTotalFailureFields).errors).toContain(
        'window-prep: markdown must not include contradictory failure markers',
      );

      const lineStructuredTotalFailureFields: any = structuredClone(report);
      lineStructuredTotalFailureFields.lines.push('- JSON summary: errorsTotal=1; failures_total: 2');
      expect(validateTestnetWindowPrepReport(lineStructuredTotalFailureFields).errors).toContain(
        'window-prep: lines must not include contradictory failure markers',
      );

      const lineStructuredSuccessFields: any = structuredClone(report);
      lineStructuredSuccessFields.lines.push(
        '- JSON summary: errorCount: 0',
        '- JSON summary: errorsTotal=0; failures_total: 0',
        '- JSON summary: {"errors":[]}',
      );
      expect(validateTestnetWindowPrepReport(lineStructuredSuccessFields).errors).toEqual([]);

      const markdownRemainingIssues: any = structuredClone(report);
      markdownRemainingIssues.markdown += '\n- Remaining issues:\n  - unresolved window-prep blocker';
      expect(validateTestnetWindowPrepReport(markdownRemainingIssues).errors).toContain(
        'window-prep: markdown must not include remaining issues',
      );

      const lineRemainingIssues: any = structuredClone(report);
      lineRemainingIssues.lines.push('- Remaining issues:', '  - unresolved window-prep blocker');
      expect(validateTestnetWindowPrepReport(lineRemainingIssues).errors).toContain(
        'window-prep: lines must not include remaining issues',
      );

      const markdownCompatibilityIssues: any = structuredClone(report);
      markdownCompatibilityIssues.markdown +=
        '\n- \uFF2F\uFF50\uFF45\uFF4E issues\uFF1A unresolved window-prep blocker';
      expect(validateTestnetWindowPrepReport(markdownCompatibilityIssues).errors).toContain(
        'window-prep: markdown must not include remaining issues',
      );

      const lineCompatibilityIssues: any = structuredClone(report);
      lineCompatibilityIssues.lines.push(
        '- \uFF2F\uFF50\uFF45\uFF4E issues\uFF1A unresolved window-prep blocker',
      );
      expect(validateTestnetWindowPrepReport(lineCompatibilityIssues).errors).toContain(
        'window-prep: lines must not include remaining issues',
      );

      const markdownOpenIssues: any = structuredClone(report);
      markdownOpenIssues.markdown += '\n- Open issues: unresolved window-prep blocker';
      expect(validateTestnetWindowPrepReport(markdownOpenIssues).errors).toContain(
        'window-prep: markdown must not include remaining issues',
      );

      const lineKnownIssues: any = structuredClone(report);
      lineKnownIssues.lines.push('- Known issues: unresolved window-prep blocker');
      expect(validateTestnetWindowPrepReport(lineKnownIssues).errors).toContain(
        'window-prep: lines must not include remaining issues',
      );

      const escalatedBoundary: any = structuredClone(report);
      escalatedBoundary.gateBoundary.reportAuthorizesBroadcast = true;
      expect(validateTestnetWindowPrepReport(escalatedBoundary).errors).toContain(
        'window-prep: gateBoundary.reportAuthorizesBroadcast must be false',
      );

      const mismatchedHash: any = structuredClone(report);
      mismatchedHash.heightBoundary.currentDeployedStateHash = 'f'.repeat(64);
      expect(validateTestnetWindowPrepReport(mismatchedHash).errors).toContain(
        'window-prep: heightBoundary.currentDeployedStateHash must match package deployedStateHash',
      );

      const targetless: any = structuredClone(report);
      delete targetless.targetBindings.approvals;
      expect(validateTestnetWindowPrepReport(targetless).errors).toContain(
        'window-prep: targetBindings.approvals must be present',
      );

      const sensitiveTargets = [
        {
          field: 'prebroadcast',
          target: 'operator/seed-phrase-prebroadcast.json',
          error: 'window-prep: targetBindings.prebroadcast must be present',
        },
        {
          field: 'approvals',
          target: 'operator/signing-key-approvals.json',
          error: 'window-prep: targetBindings.approvals must be present',
        },
        {
          field: 'approvals',
          target: 'state/deployed_state.json',
          error: 'window-prep: targetBindings.approvals must be present',
        },
        {
          field: 'prebroadcast',
          target: 'sourceTarget=(.env)',
          error: 'window-prep: targetBindings.prebroadcast must be present',
        },
        {
          field: 'prebroadcast',
          target: 'sourceTarget=%28.env%29',
          error: 'window-prep: targetBindings.prebroadcast must be present',
        },
        {
          field: 'approvals',
          target: 'sourceTarget=(runtime/bridge-state.sqlite)',
          error: 'window-prep: targetBindings.approvals must be present',
        },
        {
          field: 'approvals',
          target: 'sourceTarget=%28runtime%2Fbridge-state.sqlite%29',
          error: 'window-prep: targetBindings.approvals must be present',
        },
      ] as const;
      for (const { field, target, error } of sensitiveTargets) {
        const sensitiveBinding: any = structuredClone(report);
        sensitiveBinding.targetBindings[field] = target;
        expect(validateTestnetWindowPrepReport(sensitiveBinding).errors).toContain(error);
      }

      const localTargets = [
        {
          field: 'prebroadcast',
          target: ['C:', 'tmp', 'completed-prebroadcast.md'].join('/'),
          error: 'window-prep: targetBindings.prebroadcast must be present',
        },
        {
          field: 'approvals',
          target: ['file:', '', '', 'C:', 'tmp', 'approvals.json'].join('/'),
          error: 'window-prep: targetBindings.approvals must be present',
        },
        {
          field: 'prebroadcast',
          target: '%2Ftmp%2Fcompleted-prebroadcast.md',
          error: 'window-prep: targetBindings.prebroadcast must be present',
        },
        {
          field: 'prebroadcast',
          target: 'sourceTarget=%2Ftmp%2Fcompleted-prebroadcast.md',
          error: 'window-prep: targetBindings.prebroadcast must be present',
        },
        {
          field: 'approvals',
          target: 'file%3A%2F%2F%2FC%3A%2Ftmp%2Fapprovals.json',
          error: 'window-prep: targetBindings.approvals must be present',
        },
        {
          field: 'approvals',
          target: 'sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Fapprovals.json',
          error: 'window-prep: targetBindings.approvals must be present',
        },
      ] as const;
      for (const { field, target, error } of localTargets) {
        const localBinding: any = structuredClone(report);
        localBinding.targetBindings[field] = target;
        expect(validateTestnetWindowPrepReport(localBinding).errors).toContain(error);
      }

      const nonConcreteTargets = [
        {
          field: 'prebroadcast',
          target: 'evidence/window/generic-prebroadcast.md',
          error: 'window-prep: targetBindings.prebroadcast must be present',
        },
        {
          field: 'prebroadcast',
          target: 'evidence/window/fixture-prebroadcast.md',
          error: 'window-prep: targetBindings.prebroadcast must be present',
        },
        {
          field: 'approvals',
          target: 'evidence/window/generic-approvals.json',
          error: 'window-prep: targetBindings.approvals must be present',
        },
        {
          field: 'approvals',
          target: 'evidence/window/testdata-approvals.json',
          error: 'window-prep: targetBindings.approvals must be present',
        },
      ] as const;
      for (const { field, target, error } of nonConcreteTargets) {
        const nonConcreteBinding: any = structuredClone(report);
        nonConcreteBinding.targetBindings[field] = target;
        expect(validateTestnetWindowPrepReport(nonConcreteBinding).errors).toContain(error);
      }

      const syntheticTargets = [
        {
          field: 'prebroadcast',
          target: 'evidence/window/completed-synthetic-prebroadcast.md',
          error: 'window-prep: targetBindings.prebroadcast must be present',
        },
        {
          field: 'approvals',
          target: 'evidence/window/completed-synthetic-approvals.json',
          error: 'window-prep: targetBindings.approvals must be present',
        },
      ] as const;
      for (const { field, target, error } of syntheticTargets) {
        const syntheticBinding: any = structuredClone(report);
        syntheticBinding.targetBindings[field] = target;
        expect(validateTestnetWindowPrepReport(syntheticBinding).errors).toContain(error);
      }

      const simulatedTargets = [
        {
          field: 'prebroadcast',
          target: 'evidence/window/completed-simulated-prebroadcast.md',
          error: 'window-prep: targetBindings.prebroadcast must be present',
        },
        {
          field: 'approvals',
          target: 'evidence/window/completed-simulated-approvals.json',
          error: 'window-prep: targetBindings.approvals must be present',
        },
      ] as const;
      for (const { field, target, error } of simulatedTargets) {
        const simulatedBinding: any = structuredClone(report);
        simulatedBinding.targetBindings[field] = target;
        expect(validateTestnetWindowPrepReport(simulatedBinding).errors).toContain(error);
      }

      const claimEscalatingTargets = [
        {
          field: 'prebroadcast',
          target: 'evidence/window/testnet-production-candidate-prebroadcast.md',
          error: 'window-prep: targetBindings.prebroadcast must be present',
        },
        {
          field: 'approvals',
          target: 'evidence/window/mainnet-production-approvals.json',
          error: 'window-prep: targetBindings.approvals must be present',
        },
      ] as const;
      for (const { field, target, error } of claimEscalatingTargets) {
        const claimEscalatingBinding: any = structuredClone(report);
        claimEscalatingBinding.targetBindings[field] = target;
        expect(validateTestnetWindowPrepReport(claimEscalatingBinding).errors).toContain(error);
      }

      const handoffTargetEscalation: any = structuredClone(report);
      handoffTargetEscalation.nextHandoff.targetBindings = { approvals: 'other/approvals.json' };
      expect(validateTestnetWindowPrepReport(handoffTargetEscalation).errors).toContain(
        'window-prep: nextHandoff must not carry live execution target bindings',
      );

      const handoffEscalation: any = structuredClone(report);
      handoffEscalation.nextHandoff.reportAuthorizesBroadcast = true;
      expect(validateTestnetWindowPrepReport(handoffEscalation).errors).toContain(
        'window-prep: nextHandoff.reportAuthorizesBroadcast must be false',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks shell-unsafe package targets before release-gate consumption', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-testnet-window-prep-'));
    try {
      const targets = writeFixture(dir);
      const report = {
        schemaVersion: 1,
        ...prepareTestnetWindowPacket({
          ...targets,
          currentErgoHeight: 123,
          currentSidechainHeight: 456,
          currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
          ergoNodeNetwork: 'testnet',
          sidechainNetwork: 'patched-devnet',
          broadcastEnabled: false,
          now: NOW,
        }),
      };
      const shellUnsafePackageTarget = 'evidence/window packages/aggregate-check.json';
      const forgedReport = structuredClone(report) as any;
      forgedReport.packages[0].target = shellUnsafePackageTarget;

      const validation = validateTestnetWindowPrepReport(forgedReport);

      expect(validation.errors).toContain(
        'window-prep: packages[0].target must not contain whitespace or shell metacharacters',
      );
      expect(validation.errors.join('\n')).not.toContain(shellUnsafePackageTarget);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks if broadcast is already enabled', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-testnet-window-prep-'));
    try {
      const targets = writeFixture(dir);

      const report = prepareTestnetWindowPacket({
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
      expect(report.errors).toContain('Broadcast policy: BRIDGE_BROADCAST_ENABLED must be false or unset for window preparation');
      expect(report.lines.join('\n')).toContain('keep broadcast disabled');

      const writeResult = writeOfflineReportJson(`${basename(dir)}/window-prep-blocked.json`, {
        schemaVersion: 1,
        ...report,
      });
      const saved = JSON.parse(readFileSync(join(dir, 'window-prep-blocked.json'), 'utf8'));
      expect(writeResult.errors).toEqual([]);
      expect(saved.status).toBe('BLOCKED');
      expect(saved.errors).toContain('Broadcast policy: BRIDGE_BROADCAST_ENABLED must be false or unset for window preparation');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks unsafe approval targets without echoing the target in report bindings or handoff', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-testnet-window-prep-'));
    try {
      const targets = writeFixture(dir);

      const report = prepareTestnetWindowPacket({
        prebroadcastTarget: targets.prebroadcastTarget,
        approvalsPath: '../.' + 'env',
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        now: NOW,
      });
      const serialized = JSON.stringify(report);

      expect(report.status).toBe('BLOCKED');
      expect(report.targetBindings.approvals).toBe('<blocked approval target>');
      expect(report.nextHandoff.command).toBe(LEGACY_V1_SUBMISSION_STATUS);
      expect(serialized).toContain('<blocked approval target>');
      expect(serialized).not.toContain('.' + 'env');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks unsafe CLI JSON output targets before preparing the live window packet', () => {
    const jsonOutTarget = '../operator/private-key-report.json';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-window-prep.ts',
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
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('blocks unsafe CLI Markdown output targets before preparing the live window packet', () => {
    const outTarget = '../operator/private-key-window.md';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-window-prep.ts',
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
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('keeps CLI output guards before live window packet construction', () => {
    const source = readFileSync(
      new URL('./scripts/testnet-window-prep.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain("import { resolveEvidenceOutputPath } from '../evidence-output-path.js'");
    expect(source).toContain('const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;');
    expect(source).toContain("import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js'");
    expect(source).toContain('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;');
    expect(source).toContain('let currentDeployedStateHash: string;');
    expect(source).toContain('const report = prepareTestnetWindowPacket({');
    expect(source.indexOf('const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;')).toBeLessThan(
      source.indexOf('let currentDeployedStateHash: string;'),
    );
    expect(source.indexOf('const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;')).toBeLessThan(
      source.indexOf('const report = prepareTestnetWindowPacket({'),
    );
    expect(source.indexOf('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;')).toBeLessThan(
      source.indexOf('let currentDeployedStateHash: string;'),
    );
    expect(source.indexOf('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;')).toBeLessThan(
      source.indexOf('const report = prepareTestnetWindowPacket({'),
    );
  });

  it('blocks non-testnet network evidence before creating a packet', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-testnet-window-prep-'));
    try {
      const targets = writeFixture(dir);

      const report = prepareTestnetWindowPacket({
        ...targets,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'mainnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain('Network scope: Ergo node network must positively identify testnet');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks if the current deployed_state hash no longer matches preflight evidence', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-testnet-window-prep-'));
    try {
      const targets = writeFixture(dir);

      const report = prepareTestnetWindowPacket({
        ...targets,
        currentErgoHeight: 123,
        currentSidechainHeight: 456,
        currentDeployedStateHash: 'a'.repeat(64),
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors.join('\n')).toContain('current deployed_state hash');
      expect(report.errors.join('\n')).toContain('does not match preflight/approval hash');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks stale live heights that are below the matched prebroadcast package', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-testnet-window-prep-'));
    try {
      const targets = writeFixture(dir);

      const report = prepareTestnetWindowPacket({
        ...targets,
        currentErgoHeight: 100,
        currentSidechainHeight: 200,
        currentDeployedStateHash: DEPLOYMENT_STATE_HASH,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        broadcastEnabled: false,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.markdown).toBeUndefined();
      expect(report.errors).toContain(
        'Current Ergo height: 100 must be greater than or equal to preflight Ergo anchor height 101',
      );
      expect(report.errors).toContain(
        'Current sidechain height: 200 must be greater than or equal to preflight sidechain block height 201',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
