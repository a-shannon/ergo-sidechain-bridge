import { describe, expect, it } from 'vitest';
import {
  spawnSync as nodeSpawnSync,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

import {
  REQUIRED_REHEARSAL_GATES,
  formatRehearsalValidationTranscriptLines,
  parseLifecycleGateRows,
  validateRehearsalEvidence,
} from './rehearsal-evidence.js';
import { TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY } from './aggregate-settlement-evidence.test-helper.js';
import { LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE } from './legacy-aggregate-settlement-conservation.js';
import { LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE } from './testnet-rehearsal-live-preflight.js';

const SETTLEMENT_TX_ID = 'a'.repeat(64);
const DIFFERENT_SETTLEMENT_TX_ID = 'b'.repeat(64);
const SETTLEMENT_OUTPUT_BOX_ID = 'c'.repeat(64);
const DUP_SUCCESSOR_BOX_ID = 'd'.repeat(64);
const SPV_SUCCESSOR_BOX_ID = 'e'.repeat(64);
const RECIPIENT_PAYOUT_BOX_ID = 'f'.repeat(64);
const RECIPIENT_PAYOUT_BOX_ID_B = '8'.repeat(64);
const SETTLEMENT_OUTPUT_BOX_IDS =
  `${SPV_SUCCESSOR_BOX_ID},${DUP_SUCCESSOR_BOX_ID},${RECIPIENT_PAYOUT_BOX_ID},${SETTLEMENT_OUTPUT_BOX_ID}`;
const PEG_IN_EVENT_ID = '7'.repeat(64);
const PEG_OUT_BURN_TX_ID = '1'.repeat(64);
const SIDECHAIN_BLOCK_HASH = '2'.repeat(64);
const BRIDGE_EVENT_ROOT = '3'.repeat(64);
const DEPLOYMENT_STATE_HASH = '4'.repeat(64);
const CONTRACT_ID = '5'.repeat(64);
const SINGLETON_ID = '6'.repeat(64);
const LIVE_PREFLIGHT_DEFAULT_TARGET = 'evidence/live-rehearsals/live-preflight.json';
const FAILED_RECOVERY_OBSERVE_DEFAULT_TARGET = 'artifact://rehearsal/failed-broadcast-observe.json';
const REORG_RECOVERY_OBSERVE_DEFAULT_TARGET = 'artifact://rehearsal/reorg-stale-singleton-observe.json';
const FRESH_CHECKPOINT_ERGO_NODE_URL = 'http://localhost:9052';
const FRESH_CHECKPOINT_SIDECHAIN_RPC_URL = 'http://localhost:9945';
const LEGACY_V1_SUBMISSION_STATUS = `BLOCKED: ${LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE}`;
const REHEARSAL_CHILD_PROCESS_TIMEOUT_MS = 20_000;
const REHEARSAL_PROCESS_TEST_TIMEOUT_MS = 30_000;

function spawnSync(
  command: string,
  args: readonly string[],
  options: SpawnSyncOptionsWithStringEncoding,
  timeoutMs = REHEARSAL_CHILD_PROCESS_TIMEOUT_MS,
): SpawnSyncReturns<string> {
  return nodeSpawnSync(command, args, { ...options, timeout: timeoutMs });
}

function expectLegacyV1LivePreflightQuarantine(result: { status: number | null; stdout: string }): void {
  expect(result.status).toBe(1);
  expect(result.stdout).toContain(LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE);
  expect(result.stdout).not.toContain('Rehearsal evidence PASS');
}

const LIVE_FRESH_CHECKPOINT_SOURCE_BINDINGS =
  `Fresh checkpoint sourceBindings: height=live-read-only-sources ` +
  `ergoNodeUrl=${FRESH_CHECKPOINT_ERGO_NODE_URL} ` +
  `sidechainRpcUrl=${FRESH_CHECKPOINT_SIDECHAIN_RPC_URL} ` +
  `readOnlyErgoNodeClient=true readOnlySidechainRpcClient=true nodeAuthHeader=not-used ` +
  `operations=/info,EVM getBlockNumber; singleton=live-read-only-node ` +
  `ergoNodeUrl=${FRESH_CHECKPOINT_ERGO_NODE_URL} readOnlyNodeClient=true ` +
  `nodeAuthHeader=not-used operations=/info,singleton boxes by token ID,` +
  `mempool/unconfirmed transaction lookup,confirmed transaction lookup; ` +
  `anchor=live-read-only-node ergoNodeUrl=${FRESH_CHECKPOINT_ERGO_NODE_URL} ` +
  `readOnlyNodeClient=true nodeAuthHeader=not-used operations=/info,` +
  `Ergo extension fields at aggregate anchor heights,0x0401 bridgeEventRoot matching`;
const PROVIDED_SINGLETON_FRESH_CHECKPOINT_SOURCE_BINDINGS =
  `Fresh checkpoint sourceBindings: height=live-read-only-sources ` +
  `ergoNodeUrl=${FRESH_CHECKPOINT_ERGO_NODE_URL} ` +
  `sidechainRpcUrl=${FRESH_CHECKPOINT_SIDECHAIN_RPC_URL} ` +
  `readOnlyErgoNodeClient=true readOnlySidechainRpcClient=true nodeAuthHeader=not-used ` +
  `operations=/info,EVM getBlockNumber; singleton=provided-json ` +
  `target=evidence/fresh/singleton-checkpoint.json readOnlyNodeClient=false ` +
  `nodeAuthHeader=not-applicable; anchor=live-read-only-node ` +
  `ergoNodeUrl=${FRESH_CHECKPOINT_ERGO_NODE_URL} readOnlyNodeClient=true ` +
  `nodeAuthHeader=not-used operations=/info,Ergo extension fields at aggregate anchor heights,` +
  `0x0401 bridgeEventRoot matching`;
const CLEAN_DEPLOYMENT_STATE_EVIDENCE =
  `artifact://preflight/clean-deployment-state clean deployment state ` +
  `deployment-state hash=${DEPLOYMENT_STATE_HASH}; contract IDs=${CONTRACT_ID}; ` +
  `singleton inventory=${SINGLETON_ID}`;
const PREFLIGHT_BROADCAST_POLICY_DISABLED_OUTPUT =
  'artifact://preflight/broadcast-policy Broadcast policy PASS: broadcast disabled by BRIDGE_BROADCAST_ENABLED=false';
const BROADCAST_POLICY_PASS_OUTPUT =
  'artifact://broadcast/broadcast-policy npm run demo:readiness output [PASS] Broadcast policy: PASS';
const LIVE_SETTLEMENT_PASS_OUTPUT =
  'artifact://broadcast/live-readiness npm run demo:readiness output [PASS] Live settlement signing: PASS';
const BROADCAST_NETWORK_RECONFIRMATION =
  'artifact://broadcast/network Node URL http://127.0.0.1:9053; Ergo node network testnet; Sidechain network patched-devnet';
const USER_BROADCAST_APPROVAL_EVIDENCE =
  `artifact://broadcast/user-approval user explicit live broadcast approval for Expected transaction ID ${SETTLEMENT_TX_ID}`;
const BROADCAST_SCOPED_SHELL_EVIDENCE =
  'artifact://broadcast/scoped-shell BRIDGE_BROADCAST_ENABLED=true yes; intended shell PowerShell process only';
const CONTEXT_EXTENSION_GUARD_EVIDENCE =
  'artifact://preflight/context-extension-guard ContextExtension guard PASS; sigma-rust/JVM conformance covered; fail-closed behavior active';
const CURRENT_ERGO_HEIGHT_EVIDENCE = '100 artifact://preflight/current-ergo-height node height sample';
const CURRENT_SIDECHAIN_HEIGHT_EVIDENCE =
  '200 artifact://preflight/current-sidechain-height sidechain height sample';
const TRANSACTIONS_CHECK_PASS_OUTPUT =
  'artifact://dry-run/transactions-check /transactions/check result PASS';
const DAEMON_APPROVAL_BINDING_EVIDENCE =
  `artifact://daemon/approvals.json versioned approval file version 2 mode single ` +
  `runtime context binding ergoNodeUrl http://127.0.0.1:9053 sidechainRpcUrl http://127.0.0.1:9945 ` +
  `sidechainWsUrl ws://127.0.0.1:9945 deployedStateHash ${DEPLOYMENT_STATE_HASH} ` +
  `active approval window approvedAt 2026-05-14T12:00:00Z expiresAt 2026-05-14T13:00:00Z ` +
  `non-mainnet networks checkCommand npm run settle:aggregate -- check ${PEG_OUT_BURN_TX_ID} ` +
  `checkEvidence artifact://daemon/check-output.log /transactions/check PASS ` +
  `distinct rehearsal:preflight transcript/report artifact://daemon/rehearsal-preflight.log ` +
  `npm run rehearsal:preflight -- --prebroadcast evidence/testnet-prebroadcast/completed.md ` +
  `--approvals evidence/testnet-prebroadcast/approvals.json package mode single ` +
  `preflight input target approvals file target ` +
  `completed approval evidence target artifact://daemon/operator-approval.json ` +
  `Expected transaction ID ${SETTLEMENT_TX_ID} burn hash ${PEG_OUT_BURN_TX_ID}`;

function rehearsalAssemblyEvidence(): string {
  return `
## Rehearsal Assembly Evidence

- Assembly status: post-submit evidence included
- Draft source target: artifact://assembly/completed-draft.md
- Live-preflight source target: artifact://assembly/completed-live-preflight.md
- Live-preflight artifact: PASS artifact://assembly/live-preflight.log
- Live-preflight Expected transaction ID: ${SETTLEMENT_TX_ID}
- Post-submit fragment: included
- Post-submit source target: artifact://assembly/completed-post-submit-observe.json
- Post-submit observe JSON report: artifact://assembly/completed-post-submit-observe.json
- Recovery row fragments: failed-broadcast, reorg-recovery
- Failed-broadcast source target: artifact://assembly/completed-failed-broadcast.md
- Reorg-recovery source target: artifact://assembly/completed-reorg-recovery.md
- Offline assembly scope: no signing, node query, submit, confirm, or broadcast command executed by this helper.
`;
}

function freshCheckpointAssemblyEvidence(): string {
  return `
## Rehearsal Assembly Evidence

- Assembly status: post-submit evidence included
- Draft source target: artifact://assembly/completed-draft.md
- Live-preflight source target: artifact://assembly/completed-live-preflight.md
- Live-preflight artifact: PASS artifact://assembly/live-preflight.log
- Live-preflight Expected transaction ID: ${SETTLEMENT_TX_ID}
- Post-submit fragment: included
- Post-submit source target: artifact://assembly/completed-post-submit-observe.json
- Post-submit observe JSON report: artifact://assembly/completed-post-submit-observe.json
- Fresh checkpoint: included
- Fresh checkpoint source target: artifact://assembly/completed-fresh-checkpoint.json
- ${LIVE_FRESH_CHECKPOINT_SOURCE_BINDINGS}
- Fresh checkpoint lifecycle status: publication blocker
- Fresh checkpoint Expected transaction ID: ${SETTLEMENT_TX_ID}
- Fresh checkpoint deployed-state hash: ${DEPLOYMENT_STATE_HASH}
- Fresh checkpoint singleton freshness: fresh ageSeconds=0 maxAgeSeconds=900
- Fresh checkpoint live anchor observations: live-read-only-node /info observedAt 2026-05-18T02:30:00.000Z nodeHeight 250 maxAgeSeconds=900 0x0401 bridgeEventRootHex matched at each Ergo anchor height count=1 heights=100 roots=${BRIDGE_EVENT_ROOT}
- Fresh checkpoint boundary: offline/non-broadcast; does not authorize broadcast, close Gate 3, replace live submit/confirmation/reconciliation, or support production-ready/testnet production-candidate claims.
- Recovery row fragments: failed-broadcast, reorg-recovery
- Failed-broadcast source target: artifact://assembly/completed-failed-broadcast.md
- Reorg-recovery source target: artifact://assembly/completed-reorg-recovery.md
- Offline assembly scope: no signing, node query, submit, confirm, or broadcast command executed by this helper.
`;
}

function freshCheckpointJsonArtifact(overrides: {
  aggregateEvidence?: string;
  checkpoint?: Record<string, unknown>;
} = {}) {
  const observedAt = new Date().toISOString();
  const aggregateEvidence = overrides.aggregateEvidence ?? 'evidence/live-rehearsals/aggregate-check.json';
  return {
    status: 'CREATED',
    message: 'fresh testnet non-broadcast checkpoint CREATED publication-blocker',
    errors: [],
    checkpoint: {
      aggregateEvidence,
      lifecycleGate: 'Fresh testnet lifecycle',
      lifecycleStatus: 'publication blocker',
      ergoNodeNetwork: 'testnet',
      sidechainNetwork: 'patched-devnet',
      currentErgoHeight: 250,
      currentSidechainHeight: 300,
      expectedTxId: SETTLEMENT_TX_ID,
      burnTxHashes: [PEG_OUT_BURN_TX_ID],
      sidechainBlockHeights: [200],
      sidechainHeaderHashHexes: [SIDECHAIN_BLOCK_HASH],
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
        headerIds: ['9'.repeat(64)],
        observedAt,
        nodeHeight: 250,
      }],
      singletonCheckpoint: {
        deployedStateHash: DEPLOYMENT_STATE_HASH,
        observedAt,
        nodeHeight: 250,
        nodeNetwork: 'testnet',
        expectedTxId: SETTLEMENT_TX_ID,
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
      aggregateEvidence,
      singletonCheckpoint: {
        mode: 'live-read-only-node',
        ergoNodeUrl: FRESH_CHECKPOINT_ERGO_NODE_URL,
        observedAt,
        nodeHeight: 250,
        expectedTxId: SETTLEMENT_TX_ID,
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
    },
  };
}

function livePreflightJsonArtifact(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    status: 'GO',
    message: 'testnet rehearsal live preflight GO',
    target: 'evidence/live-rehearsals/completed-live-rehearsal.md',
    approvalsTarget: 'evidence/live-rehearsals/aggregate-approvals-v2.json',
    transcriptTarget: 'artifact://live-rehearsal/live-preflight.log',
    runtimeBroadcastEnabled: false,
    targetBindings: {
      rehearsal: 'evidence/live-rehearsals/completed-live-rehearsal.md',
      approvals: 'evidence/live-rehearsals/aggregate-approvals-v2.json',
      transcript: 'artifact://live-rehearsal/live-preflight.log',
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
      expectedTxId: SETTLEMENT_TX_ID,
      burnTxHashes: [PEG_OUT_BURN_TX_ID],
      environment: 'testnet',
      ergoNodeNetwork: 'testnet',
      sidechainNetwork: 'patched-devnet',
      deployedStateHash: DEPLOYMENT_STATE_HASH,
    },
    expectedTxId: SETTLEMENT_TX_ID,
    errors: [],
    lines: ['testnet rehearsal live preflight GO'],
    ...overrides,
  };
}

function postSubmitObserveJsonArtifact(
  overrides: Record<string, unknown> = {},
  livePreflightTarget = LIVE_PREFLIGHT_DEFAULT_TARGET,
) {
  const report: Record<string, unknown> = {
    schemaVersion: 1,
    status: 'CREATED',
    errors: [],
    markdown: `
## Submit And Confirmation Evidence

- Submitted transaction ID: ${SETTLEMENT_TX_ID}
- Settlement submit evidence: submitted transaction ID ${SETTLEMENT_TX_ID} artifact://submit/live-submit.md
- Confirmation policy met: yes artifact://confirm/finality.md finality evidence artifact://confirm/live-confirm.md confirmationsRequired=3 confirmationsObserved=4 submitted transaction ID ${SETTLEMENT_TX_ID}

## Post-Submit Gate Binding

- Live-preflight JSON binding: ${livePreflightTarget} status GO Expected transaction ID ${SETTLEMENT_TX_ID} approved burn order ${PEG_OUT_BURN_TX_ID} runtimeBroadcastEnabled false pre-submit boundary preserved and authorization evidence linked.
`,
    observation: {
      txBinding: {
        expectedTxId: SETTLEMENT_TX_ID,
        submittedTxId: SETTLEMENT_TX_ID,
        idsMatch: true,
      },
      livePreflightBinding: {
        target: livePreflightTarget,
        status: 'GO',
        expectedTxId: SETTLEMENT_TX_ID,
        approvedBurnTxHashes: [PEG_OUT_BURN_TX_ID],
        runtimeBroadcastEnabled: false,
        preSubmitBoundaryPreserved: true,
        authorizationEvidenceLinked: true,
      },
      burnOrder: [PEG_OUT_BURN_TX_ID],
      settlementOutputs: {
        outputCount: 4,
        boxIds: [SPV_SUCCESSOR_BOX_ID, DUP_SUCCESSOR_BOX_ID, RECIPIENT_PAYOUT_BOX_ID, SETTLEMENT_OUTPUT_BOX_ID],
      },
      successors: {
        spvTracker: {
          outputIndex: 0,
          boxId: SPV_SUCCESSOR_BOX_ID,
        },
        aggregateDup: {
          outputIndex: 1,
          boxId: DUP_SUCCESSOR_BOX_ID,
        },
      },
      recipientPayouts: [{
        burnTxId: PEG_OUT_BURN_TX_ID,
        outputIndex: 2,
        boxId: RECIPIENT_PAYOUT_BOX_ID,
      }],
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
    report.sourceBindings = postSubmitObserveJsonSourceBindings(report.observation as Record<string, unknown>);
  }
  return report;
}

function postSubmitObserveJsonSourceBindings(observation: Record<string, unknown>) {
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

function recoveryObserveJsonArtifact(
  kind: 'failed-broadcast-phantom-avl' | 'reorged-burn-stale-singleton',
  overrides: Record<string, unknown> = {},
) {
  const common = {
    schemaVersion: 1,
    status: 'PASS',
    message: 'testnet recovery no-broadcast observation PASS',
    errors: [],
    kind,
    observedAt: '2026-05-18T08:00:00.000Z',
    pegOutBurnTxId: PEG_OUT_BURN_TX_ID,
    node: {
      observedAt: '2026-05-18T08:00:00.000Z',
      nodeHeight: 123,
      nodeNetwork: 'testnet',
    },
    observationBoundary: {
      readOnlyObservationOnly: true,
      nodeQueryPerformed: true,
      stateReadPerformed: true,
      signingPerformed: false,
      broadcastAuthorized: false,
      liveSubmitPerformed: false,
      confirmationObserved: false,
      nodeMutationPerformed: false,
      repairPerformed: false,
      stateMutationPerformed: false,
      reconciliationPerformed: false,
      gate3ClosureAllowed: false,
      productionReadyClaimAllowed: false,
      testnetProductionCandidateClaimAllowed: false,
    },
    sourceBindings: {
      node: {
        sourceType: 'live-read-only-node',
        readOnly: true,
        noAuthHeader: true,
        observedAt: '2026-05-18T08:00:00.000Z',
        nodeHeight: 123,
        nodeNetwork: 'testnet',
      },
      state: {
        sourceType: 'read-only-state-tracker',
        readOnly: true,
        runtimePathSerialized: false,
        targetClass: 'operator-provided-state-db',
      },
    },
    lines: recoveryObserveJsonLines(kind),
  };

  if (kind === 'failed-broadcast-phantom-avl') {
    return {
      ...common,
      expectedTxId: SETTLEMENT_TX_ID,
      node: {
        ...common.node,
        expectedTxId: SETTLEMENT_TX_ID,
        confirmedChain: false,
        mempool: false,
      },
      state: {
        aggregateAttempt: {
          expectedTxId: SETTLEMENT_TX_ID,
          submittedTxId: SETTLEMENT_TX_ID,
          status: 'submitted',
          mode: 'single',
          burnTxHashes: [PEG_OUT_BURN_TX_ID],
        },
        pegOut: {
          burnTxHash: PEG_OUT_BURN_TX_ID,
          status: 'aggregate_submitted',
          phase1BoxId: null,
          phase2UnlockTxId: null,
          pendingAvlKey: null,
        },
        avlKeyPresent: false,
        pendingDupHeartbeatForTx: false,
      },
      ...overrides,
    };
  }

  return {
    ...common,
    singletonInventoryId: SINGLETON_ID,
    state: {
      avlKeyPresent: true,
      spvTrackerKeyPresent: true,
      pendingDupHeartbeatForTx: false,
      reorgCandidate: {
        burnTxHash: PEG_OUT_BURN_TX_ID,
        pendingAvlKey: PEG_OUT_BURN_TX_ID,
        status: 'burn_reverted',
        phase1BoxId: CONTRACT_ID,
      },
    },
    ...overrides,
  };
}

function recoveryObserveJsonLines(kind: 'failed-broadcast-phantom-avl' | 'reorged-burn-stale-singleton'): string[] {
  const lines = [
    'testnet recovery no-broadcast observation PASS',
    `- kind: ${kind}`,
    `- peg-out burn TX ID: ${PEG_OUT_BURN_TX_ID}`,
  ];
  if (kind === 'failed-broadcast-phantom-avl') {
    lines.push(`- Expected transaction ID: ${SETTLEMENT_TX_ID}`);
  } else {
    lines.push(`- singleton inventory identifier: ${SINGLETON_ID}`);
  }
  return lines;
}

function assemblyReportJsonArtifact(
  markdown: string,
  targetBindingOverrides: Record<string, unknown> = {},
  reportOverrides: Record<string, unknown> = {},
) {
  const reportMarkdown = /\bFresh checkpoint lifecycle status:/i.test(markdown)
    ? markdown
    : `${markdown}\n${freshCheckpointAssemblyEvidence()}`;
  const validation = validateRehearsalEvidence(reportMarkdown);
  return {
    schemaVersion: 1,
    status: 'CREATED',
    message: 'testnet rehearsal assemble CREATED',
    errors: [],
    markdown: reportMarkdown,
    targetBindings: {
      draft: 'artifact://assembly/completed-draft.md',
      livePreflight: 'artifact://assembly/completed-live-preflight.md',
      postSubmitObserveJson: 'artifact://assembly/completed-post-submit-observe.json',
      freshCheckpoint: 'artifact://assembly/completed-fresh-checkpoint.json',
      failedBroadcast: 'artifact://assembly/completed-failed-broadcast.md',
      reorgRecovery: 'artifact://assembly/completed-reorg-recovery.md',
      ...targetBindingOverrides,
    },
    rehearsalValidation: validation,
    lines: [
      'assembly status: post-submit evidence included',
      `assembled rehearsal validation: ${validation.status}`,
    ],
    ...reportOverrides,
  };
}

function bindStructuredValidationTargets(
  markdown: string,
  targets: {
    livePreflightJson?: string;
    postSubmitObserveJson?: string;
    failedRecoveryObserveJson?: string;
    reorgRecoveryObserveJson?: string;
    freshCheckpointJson?: string;
  },
): string {
  let result = markdown;
  if (targets.livePreflightJson) {
    result = result.replaceAll(LIVE_PREFLIGHT_DEFAULT_TARGET, targets.livePreflightJson);
  }
  if (targets.postSubmitObserveJson) {
    result = result.replaceAll(
      'artifact://assembly/completed-post-submit-observe.json',
      `[post-submit observe JSON](${targets.postSubmitObserveJson})`,
    );
  }
  if (targets.failedRecoveryObserveJson) {
    result = result.replaceAll(
      FAILED_RECOVERY_OBSERVE_DEFAULT_TARGET,
      `[failed recovery observe JSON](${targets.failedRecoveryObserveJson})`,
    );
  }
  if (targets.reorgRecoveryObserveJson) {
    result = result.replaceAll(
      REORG_RECOVERY_OBSERVE_DEFAULT_TARGET,
      `[reorg recovery observe JSON](${targets.reorgRecoveryObserveJson})`,
    );
  }
  if (targets.freshCheckpointJson) {
    result = result.replaceAll(
      'artifact://assembly/completed-fresh-checkpoint.json',
      `[fresh-checkpoint source](${targets.freshCheckpointJson})`,
    );
  }
  return result;
}

function rehearsal(rows: string): string {
  return `
# Completed Rehearsal

## Lifecycle Gate Classification

| Release gate | Status | Evidence artifact | Blocking note | Required next evidence |
|---|---|---|---|---|
${rows}

## Preflight Evidence
`;
}

function completedRehearsal(
  rows: string,
  sessionOverrides: Record<string, string> = {},
  signoffOverrides: Record<string, string> = {},
  publicationOverrides: Record<string, string> = {},
): string {
  const session = {
    Date: '2026-05-14',
    Operator: 'operator-a',
    Reviewer: 'reviewer-a',
    Environment: 'testnet',
    'Git commit': 'abc1234',
    'Release level being evaluated': 'institutional reference',
    'Ergo node network': 'testnet',
    'Sidechain network': 'patched-devnet',
    'Broadcast mode at start': 'disabled',
    'Broadcast mode at end': 'disabled',
    ...sessionOverrides,
  };
  const signoff = {
    Classification: 'pass',
    'Publication blockers discovered': 'none',
    'Follow-up tests required': 'none',
    'Follow-up runbook changes required': 'none',
    Reviewer: 'reviewer-a',
    Date: '2026-05-14',
    ...signoffOverrides,
  };
  const publication = {
    'Release notes updated': 'yes',
    'Required release-note updates': 'artifact://publication/gate-3-release-notes.md completed Gate 3 rehearsal release-note update evidence; Production-ready claim allowed by this rehearsal: no; Testnet production-candidate claim allowed by this rehearsal: no',
    'Pending Evidence Register updated': 'yes',
    'Required checklist updates': 'artifact://publication/gate-3-checklist.md completed Gate 3 checklist update evidence; Production-ready claim allowed by this rehearsal: no; Testnet production-candidate claim allowed by this rehearsal: no',
    'Production-ready claim allowed by this rehearsal': 'no',
    'Testnet production-candidate claim allowed by this rehearsal': 'no',
    ...publicationOverrides,
  };

  return `
# Completed Rehearsal

${rehearsalAssemblyEvidence()}

## Session Metadata

${Object.entries(session).map(([key, value]) => `- ${key}: ${value}`).join('\n')}

## Lifecycle Gate Classification

| Release gate | Status | Evidence artifact | Blocking note | Required next evidence |
|---|---|---|---|---|
${rows}

## Preflight Evidence

- Clean-checkout checks passed: yes
- ContextExtension guard result: ${CONTEXT_EXTENSION_GUARD_EVIDENCE}
- Broadcast policy result: ${PREFLIGHT_BROADCAST_POLICY_DISABLED_OUTPUT}
- Deployed singleton status: artifact://preflight/singletons
- Clean deployment state evidence: ${CLEAN_DEPLOYMENT_STATE_EVIDENCE}
- Liquidity status: artifact://preflight/liquidity
- Current Ergo height: ${CURRENT_ERGO_HEIGHT_EVIDENCE}
- Current sidechain height: ${CURRENT_SIDECHAIN_HEIGHT_EVIDENCE}

## Dry-Run Settlement Evidence

- Peg-in event ID or TX ID: ${PEG_IN_EVENT_ID} artifact://dry-run/peg-in
- Peg-out burn TX ID: ${PEG_OUT_BURN_TX_ID} artifact://dry-run/peg-out-burn
- Sidechain block height: 200
- Sidechain block hash: ${SIDECHAIN_BLOCK_HASH} artifact://dry-run/sidechain-block
- Bridge event root: ${BRIDGE_EVENT_ROOT} artifact://dry-run/event-root
- Ergo anchor height: 100
- Aggregate claim count: 1
- Input count: 3
- Output count: 4
- ContextExtension key counts per input: 0,4,2
- \`/transactions/check\` result: ${TRANSACTIONS_CHECK_PASS_OUTPUT}
- Expected transaction ID: ${SETTLEMENT_TX_ID} artifact://dry-run/expected-tx
- Daemon approval evidence: N/A - explicit CLI submit workflow artifact://dry-run/daemon-approval-na

## Broadcast Enablement Evidence

- Reviewer approval recorded: artifact://broadcast/reviewer-approval reviewer-a explicit live broadcast approval for Expected transaction ID ${SETTLEMENT_TX_ID}
- User approval recorded: ${USER_BROADCAST_APPROVAL_EVIDENCE}
- \`BRIDGE_BROADCAST_ENABLED=true\` set only in the intended shell: ${BROADCAST_SCOPED_SHELL_EVIDENCE}
- Readiness command re-run after enabling broadcast: artifact://broadcast/readiness-command npm run demo:readiness PASS
- Broadcast policy reports \`PASS\`: ${BROADCAST_POLICY_PASS_OUTPUT}
- Live settlement readiness reports \`PASS\`: ${LIVE_SETTLEMENT_PASS_OUTPUT}
- Node URL and network re-confirmed: ${BROADCAST_NETWORK_RECONFIRMATION}

## Submit And Confirmation Evidence

- Submitted transaction ID: ${SETTLEMENT_TX_ID} artifact://submit/submitted-tx
- Submission timestamp: 2026-05-14T12:00:00Z
- First observed mempool height: 101
- Confirmation height: 102
- Confirmation count: 1
- Required confirmation count: 1
- Confirmation policy met: yes artifact://submit/confirmation-policy finality evidence confirmationsRequired=1 confirmationsObserved=1 ${SETTLEMENT_TX_ID}
- Settlement output box IDs: ${SETTLEMENT_OUTPUT_BOX_IDS} artifact://submit/settlement-output
- DUP successor box ID: ${DUP_SUCCESSOR_BOX_ID} artifact://submit/dup-successor
- SPV tracker successor box ID: ${SPV_SUCCESSOR_BOX_ID} artifact://submit/spv-successor
- Recipient payout box ID: ${RECIPIENT_PAYOUT_BOX_ID} artifact://submit/recipient-payout
- Miner fee output: artifact://submit/miner-fee feeNanoErg=1000000

## Reconciliation Evidence

- Peg-out status after reconciliation: confirmed artifact://reconciliation/peg-out-status ${SETTLEMENT_TX_ID}
- DUP history contains only confirmed keys: yes artifact://reconciliation/dup-history ${DUP_SUCCESSOR_BOX_ID}
- SPV tracker digest matches confirmed successor: yes artifact://reconciliation/spv-tracker ${SPV_SUCCESSOR_BOX_ID}
- No duplicate payout exists for the same burn: yes artifact://reconciliation/no-duplicate ${PEG_OUT_BURN_TX_ID} ${RECIPIENT_PAYOUT_BOX_ID}
- Failed-event queue: artifact://reconciliation/failed-event-queue
- Manual repair performed: no

## Post-Submit Gate Binding

- Fresh testnet lifecycle artifact cites submitted transaction ID ${SETTLEMENT_TX_ID}.
- Live-preflight JSON binding: ${LIVE_PREFLIGHT_DEFAULT_TARGET} status GO Expected transaction ID ${SETTLEMENT_TX_ID} approved burn order ${PEG_OUT_BURN_TX_ID} runtimeBroadcastEnabled false pre-submit boundary preserved and authorization evidence linked.
- Production-ready claim allowed by this rehearsal: no
- Testnet production-candidate claim allowed by this rehearsal: no

## Rollback And Cleanup

- Broadcast disabled in all shells: yes
- Runtime state files preserved but not staged: yes
- Logs archived: artifact://cleanup/logs
- Incident or regression issue opened if needed: artifact://cleanup/incident-or-regression
- Regression test or runbook update needed: no

## Publication Evidence

${Object.entries(publication).map(([key, value]) => `- ${key}: ${value}`).join('\n')}

## Reviewer Sign-Off

${Object.entries(signoff).map(([key, value]) => `- ${key}: ${value}`).join('\n')}
`;
}

function preBroadcastDryRunRehearsal(rows: string): string {
  return `
# Pre-Broadcast Testnet Dry Run

## Session Metadata

- Date: 2026-05-14
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
${rows}

## Preflight Evidence

- Clean-checkout checks passed: yes
- ContextExtension guard result: ${CONTEXT_EXTENSION_GUARD_EVIDENCE}
- Broadcast policy result: ${PREFLIGHT_BROADCAST_POLICY_DISABLED_OUTPUT}
- Deployed singleton status: artifact://preflight/singletons
- Clean deployment state evidence: ${CLEAN_DEPLOYMENT_STATE_EVIDENCE}
- Liquidity status: artifact://preflight/liquidity
- Current Ergo height: ${CURRENT_ERGO_HEIGHT_EVIDENCE}
- Current sidechain height: ${CURRENT_SIDECHAIN_HEIGHT_EVIDENCE}

## Dry-Run Settlement Evidence

- Peg-in event ID or TX ID: ${PEG_IN_EVENT_ID} artifact://dry-run/peg-in
- Peg-out burn TX ID: ${PEG_OUT_BURN_TX_ID} artifact://dry-run/peg-out-burn
- Sidechain block height: 200
- Sidechain block hash: ${SIDECHAIN_BLOCK_HASH} artifact://dry-run/sidechain-block
- Bridge event root: ${BRIDGE_EVENT_ROOT} artifact://dry-run/event-root
- Ergo anchor height: 100
- Aggregate claim count: 1
- Input count: 3
- Output count: 4
- ContextExtension key counts per input: 0,4,2
- \`/transactions/check\` result: ${TRANSACTIONS_CHECK_PASS_OUTPUT}
- Expected transaction ID: ${SETTLEMENT_TX_ID} artifact://dry-run/expected-tx
- Daemon approval evidence: N/A - daemon submit not planned artifact://dry-run/daemon-approval-na

## Broadcast Enablement Evidence

Not attempted. Broadcast remained disabled and no live broadcast approval was recorded.

## Submit And Confirmation Evidence

Not attempted. No settlement transaction was submitted or observed in mempool.

## Reconciliation Evidence

Not attempted. No submitted settlement transaction exists to reconcile.

## Rollback And Cleanup

- Broadcast disabled in all shells: yes
- Runtime state files preserved but not staged: yes
- Logs archived: artifact://cleanup/prebroadcast-logs
- Incident or regression issue opened if needed: artifact://cleanup/prebroadcast-none
- Regression test or runbook update needed: no

## Publication Evidence

- Release notes updated: yes
- Required release-note updates: artifact://publication/gate-3-release-notes.md completed Gate 3 rehearsal release-note update evidence; Production-ready claim allowed by this rehearsal: no; Testnet production-candidate claim allowed by this rehearsal: no
- Pending Evidence Register updated: yes
- Required checklist updates: artifact://publication/gate-3-checklist.md completed Gate 3 checklist update evidence; Production-ready claim allowed by this rehearsal: no; Testnet production-candidate claim allowed by this rehearsal: no
- Production-ready claim allowed by this rehearsal: no
- Testnet production-candidate claim allowed by this rehearsal: no

## Reviewer Sign-Off

- Classification: pass
- Publication blockers discovered: none
- Follow-up tests required: none
- Follow-up runbook changes required: none
- Reviewer: reviewer-a
- Date: 2026-05-14
`;
}

function artifactFor(gate: string): string {
  if (gate === 'Backup-restore or reconstructibility evidence') {
    return 'artifact://rehearsal/backup-restore-or-reconstructibility-evidence Backup Restore Evidence Template npm run backup:validate';
  }
  if (gate === 'Failed broadcast / phantom AVL evidence') {
    return (
      'artifact://rehearsal/failed-broadcast-phantom-avl-evidence failed broadcast phantom AVL ' +
      `structured recovery observation PASS evidence observation ${FAILED_RECOVERY_OBSERVE_DEFAULT_TARGET} ` +
      `recovery-observe validation target ${FAILED_RECOVERY_OBSERVE_DEFAULT_TARGET} ` +
      'npm run rehearsal:recovery-observe:validate command output: PASS recovery-observe JSON validation PASS ' +
      'npm run rehearsal:validate command output: PASS ' +
      `no phantom DUP AVL history inserted expected transaction ${SETTLEMENT_TX_ID} ` +
      `peg-out burn TX ID ${PEG_OUT_BURN_TX_ID}`
    );
  }
  if (gate === 'Reorged burn / stale singleton evidence') {
    return (
      'artifact://rehearsal/reorged-burn-stale-singleton-evidence reorged burn stale singleton detected recoverable ' +
      `structured recovery observation PASS evidence observation ${REORG_RECOVERY_OBSERVE_DEFAULT_TARGET} ` +
      `recovery-observe validation target ${REORG_RECOVERY_OBSERVE_DEFAULT_TARGET} ` +
      'npm run rehearsal:recovery-observe:validate command output: PASS recovery-observe JSON validation PASS ' +
      'npm run rehearsal:validate command output: PASS ' +
      `peg-out burn TX ID ${PEG_OUT_BURN_TX_ID} singleton inventory ${SINGLETON_ID}`
    );
  }
  if (gate === 'Peg-out burn evidence') {
    return `artifact://rehearsal/peg-out-burn-evidence peg-out burn TX ID ${PEG_OUT_BURN_TX_ID}`;
  }
  if (gate === 'Peg-in evidence') {
    return `artifact://rehearsal/peg-in-evidence peg-in event ID ${PEG_IN_EVENT_ID}`;
  }
  if (gate === 'Anchor evidence') {
    return (
      `artifact://rehearsal/anchor-evidence sidechain block hash ${SIDECHAIN_BLOCK_HASH} ` +
      `bridge event root ${BRIDGE_EVENT_ROOT} Ergo anchor height 100`
    );
  }
  if (gate === 'Settlement check evidence') {
    return `artifact://rehearsal/settlement-check-evidence expected transaction ${SETTLEMENT_TX_ID}`;
  }
  if (gate === 'Settlement submit evidence') {
    return `artifact://rehearsal/settlement-submit-evidence submitted transaction ${SETTLEMENT_TX_ID}`;
  }
  if (gate === 'Confirmation evidence') {
    return `artifact://rehearsal/confirmation-evidence submitted transaction ${SETTLEMENT_TX_ID}`;
  }
  if (gate === 'Fresh testnet lifecycle') {
    return (
      'artifact://rehearsal/fresh-testnet-lifecycle Ergo node network testnet ' +
      `peg-in event ID ${PEG_IN_EVENT_ID} ` +
      `peg-out burn TX ID ${PEG_OUT_BURN_TX_ID} ` +
      `sidechain block hash ${SIDECHAIN_BLOCK_HASH} ` +
      `bridge event root ${BRIDGE_EVENT_ROOT} ` +
      `expected transaction ${SETTLEMENT_TX_ID} ` +
      `submitted transaction ${SETTLEMENT_TX_ID}`
    );
  }
  return `artifact://rehearsal/${gate.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
}

function rehearsalValidationTargetOnlyLifecycleEvidence(gate: string): string {
  return (
    'npm run rehearsal:validate command output: artifact://rehearsal/rehearsal-validate.log ' +
    `PASS exit code 0 rehearsal validation target ${artifactFor(gate)} completed lifecycle evidence for ${gate}`
  );
}

function preBroadcastDryRunRows(): string {
  const blockedLiveNote =
    'pre-broadcast dry-run captured; live submit confirmation reconciliation pending explicit broadcast approval';
  const blockedLiveNext =
    'rerun live testnet rehearsal after explicit broadcast approval and capture submit confirmation reconciliation evidence';

  return REQUIRED_REHEARSAL_GATES
    .map(gate => {
      if (gate === 'Fresh local devnet lifecycle') {
        return '| Fresh local devnet lifecycle | not applicable | | scope deferred to dedicated local devnet rehearsal | |';
      }
      if (gate === 'Fresh testnet lifecycle') {
        return (
          '| Fresh testnet lifecycle | publication blocker | ' +
          'artifact://testnet-prebroadcast/fresh-testnet-dry-run Fresh testnet pre-broadcast dry-run evidence ' +
          `Ergo node network testnet peg-out burn TX ID ${PEG_OUT_BURN_TX_ID} ` +
          `sidechain block hash ${SIDECHAIN_BLOCK_HASH} expected transaction ${SETTLEMENT_TX_ID} | ` +
          `${blockedLiveNote} | ${blockedLiveNext} |`
        );
      }
      if (gate === 'Settlement submit evidence') {
        return (
          '| Settlement submit evidence | publication blocker | ' +
          'artifact://testnet-prebroadcast/settlement-submit-blocker settlement submit blocked before broadcast | ' +
          `${blockedLiveNote} | ${blockedLiveNext} |`
        );
      }
      if (gate === 'Confirmation evidence') {
        return (
          '| Confirmation evidence | publication blocker | ' +
          'artifact://testnet-prebroadcast/confirmation-blocker confirmation blocked pending submitted transaction | ' +
          `${blockedLiveNote} | ${blockedLiveNext} |`
        );
      }
      if (gate === 'Reconciliation evidence') {
        return (
          '| Reconciliation evidence | publication blocker | ' +
          'artifact://testnet-prebroadcast/reconciliation-blocker reconciliation blocked pending confirmed settlement | ' +
          `${blockedLiveNote} | ${blockedLiveNext} |`
        );
      }
      if (gate === 'Failed broadcast / phantom AVL evidence') {
        return (
          '| Failed broadcast / phantom AVL evidence | publication blocker | ' +
          'artifact://testnet-prebroadcast/failed-broadcast-phantom-avl-blocker failed-broadcast phantom-AVL drill pending; no phantom DUP AVL history inserted | ' +
          'pending failed-broadcast phantom-AVL drill evidence | run failed-broadcast drill and capture no phantom DUP AVL history evidence |'
        );
      }
      if (gate === 'Reorged burn / stale singleton evidence') {
        return (
          '| Reorged burn / stale singleton evidence | publication blocker | ' +
          'artifact://testnet-prebroadcast/reorged-burn-stale-singleton-blocker reorged-burn stale-singleton detection recoverability drill pending | ' +
          'pending reorged-burn stale-singleton recovery drill evidence | run reorg recovery drill and capture stale singleton recoverability evidence |'
        );
      }
      if (gate === 'Backup-restore or reconstructibility evidence') {
        return (
          '| Backup-restore or reconstructibility evidence | publication blocker | ' +
          'artifact://testnet-prebroadcast/backup-restore-blocker backup-restore reconstructibility drill pending Backup Restore Evidence Template npm run backup:validate | ' +
          'pending backup-restore reconstructibility drill evidence | run backup-restore drill and validate completed Backup Restore Evidence Template |'
        );
      }
      return `| ${gate} | pass | ${artifactFor(gate)} | | |`;
    })
    .join('\n');
}

const completePassingRows = REQUIRED_REHEARSAL_GATES
  .map(gate => {
    if (gate === 'Fresh local devnet lifecycle') {
      return '| Fresh local devnet lifecycle | not applicable | | scope deferred to dedicated local devnet rehearsal | |';
    }
    return `| ${gate} | pass | ${artifactFor(gate)} | | |`;
  })
  .join('\n');

const completeLocalDevnetRows = REQUIRED_REHEARSAL_GATES
  .map(gate => {
    if (gate === 'Fresh testnet lifecycle') {
      return '| Fresh testnet lifecycle | not applicable | | scope deferred to dedicated testnet rehearsal | |';
    }
    return `| ${gate} | pass | ${artifactFor(gate)} | | |`;
  })
  .join('\n');

describe('rehearsal evidence validation', () => {
  it('terminates a stuck validator subprocess at the child-process boundary', () => {
    const result = spawnSync(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 10_000)'],
      { cwd: process.cwd(), encoding: 'utf8' },
      100,
    );

    expect(result.status).toBeNull();
    expect((result.error as NodeJS.ErrnoException | undefined)?.code).toBe('ETIMEDOUT');
  });

  it('prints Gate 3 validation and claim boundaries in validator CLI help', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-rehearsal-evidence.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run rehearsal:validate');
    expect(result.stdout).toContain('completed Live Rehearsal Evidence Markdown');
    expect(result.stdout).toContain('release:gate');
    expect(result.stdout).toContain('rehearsal validation target');
    expect(result.stdout).toContain('command-specific completed rehearsal command output evidence');
    expect(result.stdout).toContain('Release gate structural issues = 0');
    expect(result.stdout).toContain('--transcript');
    expect(result.stdout).toContain('distinct validation artifact');
    expect(result.stdout).toContain('Production-ready claim allowed by this rehearsal: no');
    expect(result.stdout).toContain('Testnet production-candidate claim allowed by this rehearsal: no');
    expect(result.stdout).toContain('Broadcast mode at start disabled');
    expect(result.stdout).toContain('Broadcast mode at end disabled');
    expect(result.stdout).toContain('does not sign, submit, publish, push, broadcast, or open runtime databases');
  });

  it('writes a sanitized rehearsal validation blocker report with issue groups', () => {
    const reportDir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal-report-'));
    const reportPath = join(reportDir, 'blocked-report.md');
    const reportTarget = `${reportDir.slice(process.cwd().length + 1).replace(/\\/g, '/')}/blocked-report.md`;

    try {
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/validate-rehearsal-evidence.ts',
          '../docs/live-rehearsal-template.md',
          '--report-out',
          reportTarget,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('../docs/live-rehearsal-template.md: evidence target BLOCKED');
      expect(result.stdout).toContain('Wrote rehearsal validation report to --report-out target.');
      expect(existsSync(reportPath)).toBe(true);

      const report = readFileSync(reportPath, 'utf8');
      expect(report).toContain('# Rehearsal Evidence Validation Report');
      expect(report).toContain('| Result | BLOCKED |');
      expect(report).toContain('| Exit code | 1 |');
      expect(report).toContain('| Validated target | ../docs/live-rehearsal-template.md |');
      expect(report).toContain('| Session metadata |');
      expect(report).toContain('| Lifecycle rows |');
      expect(report).toContain('| Publication evidence |');
      expect(report).toContain('| Reviewer sign-off |');
      expect(report).toContain('| Rollback and cleanup |');
      expect(report).toContain(
        'does not authorize public claims, release claims, publishing, deployment, live submit, or transaction broadcast',
      );
      expect(report).toContain(
        '| Transaction broadcast, submit, deploy, signing, runtime database access, or state mutation performed | no |',
      );
      const windowsHomePrefix = ['C:', 'Users'].join(String.fromCharCode(92));
      expect(report).not.toContain(windowsHomePrefix);
      expect(report).not.toContain('privateKey');
      expect(report).not.toContain('mnemonic');
    } finally {
      rmSync(reportDir, { recursive: true, force: true });
    }
  });

  it('parses the lifecycle classification table', () => {
    const rows = parseLifecycleGateRows(rehearsal(
      '| Fresh local devnet lifecycle | pass | logs/devnet.md | | |',
    ));

    expect(rows).toEqual([
      {
        releaseGate: 'Fresh local devnet lifecycle',
        status: 'pass',
        evidenceArtifact: 'logs/devnet.md',
        blockingNote: '',
        requiredNextEvidence: '',
      },
    ]);
  });

  it('passes when every required lifecycle row has structured evidence', () => {
    const markdown = completedRehearsal(completePassingRows);
    const result = validateRehearsalEvidence(markdown);

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
    expect(result.rows).toHaveLength(REQUIRED_REHEARSAL_GATES.length);
    expect(result.message).toContain('12 lifecycle rows');
    expect(result.sessionMetadata).toMatchObject({
      date: '2026-05-14',
      reviewer: 'reviewer-a',
      environment: 'testnet',
      gitCommit: 'abc1234',
      ergoNodeNetwork: 'testnet',
      sidechainNetwork: 'patched-devnet',
      broadcastModeAtStart: 'disabled',
      broadcastModeAtEnd: 'disabled',
    });
    expect(result.publicationEvidence).toMatchObject({
      releaseNotesUpdated: 'yes',
      pendingEvidenceRegisterUpdated: 'yes',
      productionReadyClaimAllowed: 'no',
      testnetProductionCandidateClaimAllowed: 'no',
    });
    expect(result.reviewerSignoff).toMatchObject({
      classification: 'pass',
      reviewer: 'reviewer-a',
      date: '2026-05-14',
    });
  });

  it('rejects pass lifecycle rows that only cite rehearsal validation targets', () => {
    const markdown = completedRehearsal(completePassingRows.replace(
      `| Peg-in evidence | pass | ${artifactFor('Peg-in evidence')} | | |`,
      `| Peg-in evidence | pass | ${rehearsalValidationTargetOnlyLifecycleEvidence('Peg-in evidence')} | | |`,
    ));
    const result = validateRehearsalEvidence(markdown);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Peg-in evidence: pass evidence must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('requires completed testnet lifecycle evidence to include rehearsal assembly provenance', () => {
    const markdown = completedRehearsal(completePassingRows).replace(rehearsalAssemblyEvidence(), '');
    const result = validateRehearsalEvidence(markdown);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: completed testnet lifecycle requires assembly provenance',
    );
  });

  it('requires completed testnet lifecycle assembly provenance to include source targets', () => {
    const markdown = completedRehearsal(completePassingRows)
      .replace('- Draft source target: artifact://assembly/completed-draft.md\n', '')
      .replace('- Live-preflight source target: artifact://assembly/completed-live-preflight.md\n', '')
      .replace('- Post-submit source target: artifact://assembly/completed-post-submit-observe.json\n', '')
      .replace('- Failed-broadcast source target: artifact://assembly/completed-failed-broadcast.md\n', '')
      .replace('- Reorg-recovery source target: artifact://assembly/completed-reorg-recovery.md\n', '');
    const result = validateRehearsalEvidence(markdown);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Draft source target must cite completed non-template source evidence',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Live-preflight source target must cite completed non-template source evidence',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Post-submit source target must cite completed non-template source evidence',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Failed-broadcast source target must cite completed non-template source evidence',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Reorg-recovery source target must cite completed non-template source evidence',
    );
  });

  it('rejects template or uncompleted assembly provenance targets', () => {
    const markdown = completedRehearsal(completePassingRows)
      .replace('artifact://assembly/completed-draft.md', 'artifact://assembly/draft-template.md')
      .replace('artifact://assembly/completed-post-submit-observe.json', 'artifact://assembly/not-completed-post-submit-observe.json')
      .replace('artifact://assembly/completed-reorg-recovery.md', 'artifact://assembly/uncompleted-reorg-recovery.md')
      .replace('PASS artifact://assembly/live-preflight.log', 'PASS artifact://assembly/live-preflight-template.md');
    const result = validateRehearsalEvidence(markdown);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Draft source target must cite completed non-template source evidence',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Post-submit source target must cite completed non-template source evidence',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Reorg-recovery source target must cite completed non-template source evidence',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Live-preflight artifact must cite completed PASS output evidence',
    );
  });

  it('rejects contradictory live-preflight PASS assembly output', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        'PASS artifact://assembly/live-preflight.log',
        'PASS artifact://assembly/live-preflight.log validation BLOCKED with 1 structural issue',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Live-preflight artifact must cite internally positive PASS output evidence',
    );
  });

  it('requires completed testnet lifecycle assembly provenance to use the structured post-submit observe JSON as source', () => {
    const markdown = completedRehearsal(completePassingRows)
      .replace(
        '- Post-submit source target: artifact://assembly/completed-post-submit-observe.json',
        '- Post-submit source target: artifact://assembly/completed-post-submit.md',
      );
    const result = validateRehearsalEvidence(markdown);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Post-submit source target must cite completed structured post-submit observe JSON evidence',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Post-submit source target must match Post-submit observe JSON report',
    );
  });

  it('requires completed testnet lifecycle post-submit source target to match the observe JSON report target', () => {
    const markdown = completedRehearsal(completePassingRows)
      .replace(
        '- Post-submit source target: artifact://assembly/completed-post-submit-observe.json',
        '- Post-submit source target: artifact://assembly/completed-other-post-submit-observe.json',
      );
    const result = validateRehearsalEvidence(markdown);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Post-submit source target must match Post-submit observe JSON report',
    );
    expect(result.errors).not.toContain(
      'Rehearsal Assembly Evidence: Post-submit source target must cite completed structured post-submit observe JSON evidence',
    );
  });

  it('requires rehearsal assembly provenance to bind live-preflight and post-submit evidence', () => {
    const markdown = completedRehearsal(completePassingRows)
      .replace('Assembly status: post-submit evidence included', 'Assembly status: publication-blocker')
      .replace(`Live-preflight Expected transaction ID: ${SETTLEMENT_TX_ID}`, `Live-preflight Expected transaction ID: ${DIFFERENT_SETTLEMENT_TX_ID}`)
      .replace('Post-submit fragment: included', 'Post-submit fragment: not provided');
    const result = validateRehearsalEvidence(markdown);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Assembly status must be post-submit evidence included for completed testnet lifecycle',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Live-preflight Expected transaction ID must match Dry-Run Settlement Evidence Expected transaction ID',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Post-submit fragment must be included for completed testnet lifecycle',
    );
  });

  it('requires completed testnet lifecycle post-submit evidence to bind the live-preflight JSON report', () => {
    const result = validateRehearsalEvidence(completedRehearsal(completePassingRows)
      .replace(
        `- Live-preflight JSON binding: evidence/live-rehearsals/live-preflight.json status GO Expected transaction ID ${SETTLEMENT_TX_ID} approved burn order ${PEG_OUT_BURN_TX_ID} runtimeBroadcastEnabled false pre-submit boundary preserved and authorization evidence linked.\n`,
        '',
      ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Post-Submit Gate Binding: Live-preflight JSON binding is required for completed testnet lifecycle',
    );
  });

  it('accepts concrete post-submit JSON and live-preflight bindings that mention sample size or template removal', () => {
    const markdown = completedRehearsal(completePassingRows)
      .replaceAll(
        'artifact://assembly/completed-post-submit-observe.json',
        'artifact://assembly/sample-size-analysis-post-submit-observe.json',
      )
      .replace(
        `evidence/live-rehearsals/live-preflight.json status GO Expected transaction ID ${SETTLEMENT_TX_ID} approved burn order ${PEG_OUT_BURN_TX_ID} runtimeBroadcastEnabled false pre-submit boundary preserved and authorization evidence linked.`,
        `evidence/live-rehearsals/template-removal-audit-live-preflight.json status GO Expected transaction ID ${SETTLEMENT_TX_ID} approved burn order ${PEG_OUT_BURN_TX_ID} runtimeBroadcastEnabled false pre-submit boundary preserved and authorization evidence linked.`,
      );
    const result = validateRehearsalEvidence(markdown);

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  it('rejects stale or weak post-submit live-preflight JSON bindings', () => {
    const result = validateRehearsalEvidence(completedRehearsal(completePassingRows).replace(
      `evidence/live-rehearsals/live-preflight.json status GO Expected transaction ID ${SETTLEMENT_TX_ID} approved burn order ${PEG_OUT_BURN_TX_ID} runtimeBroadcastEnabled false pre-submit boundary preserved and authorization evidence linked.`,
      `evidence/live-rehearsals/live-preflight-template.json status BLOCKED Expected transaction ID ${DIFFERENT_SETTLEMENT_TX_ID} boundary unclear.`,
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Post-Submit Gate Binding: Live-preflight JSON binding must cite a concrete non-template JSON report',
    );
    expect(result.errors).toContain('Post-Submit Gate Binding: Live-preflight JSON binding must cite status GO');
    expect(result.errors).toContain(
      'Post-Submit Gate Binding: Live-preflight JSON binding must cite Dry-Run Expected transaction ID',
    );
    expect(result.errors).toContain(
      'Post-Submit Gate Binding: Live-preflight JSON binding must preserve the pre-submit boundary',
    );
    expect(result.errors).toContain(
      'Post-Submit Gate Binding: Live-preflight JSON binding must cite linked authorization evidence',
    );
  });

  it('rejects generic post-submit live-preflight JSON bindings', () => {
    const result = validateRehearsalEvidence(completedRehearsal(completePassingRows).replace(
      `evidence/live-rehearsals/live-preflight.json status GO Expected transaction ID ${SETTLEMENT_TX_ID} approved burn order ${PEG_OUT_BURN_TX_ID} runtimeBroadcastEnabled false pre-submit boundary preserved and authorization evidence linked.`,
      `evidence/live-rehearsals/generic-live-preflight.json status GO Expected transaction ID ${SETTLEMENT_TX_ID} approved burn order ${PEG_OUT_BURN_TX_ID} runtimeBroadcastEnabled false pre-submit boundary preserved and authorization evidence linked.`,
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Post-Submit Gate Binding: Live-preflight JSON binding must cite a concrete non-template JSON report',
    );
  });

  it('accepts fresh checkpoint assembly provenance when it remains publication-blocker evidence', () => {
    const markdown = completedRehearsal(completePassingRows)
      .replace(rehearsalAssemblyEvidence(), freshCheckpointAssemblyEvidence());
    const result = validateRehearsalEvidence(markdown);

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  it('accepts fresh checkpoint assembly provenance with a concrete provided-json singleton source target', () => {
    const markdown = completedRehearsal(completePassingRows)
      .replace(rehearsalAssemblyEvidence(), freshCheckpointAssemblyEvidence())
      .replace(
        LIVE_FRESH_CHECKPOINT_SOURCE_BINDINGS,
        PROVIDED_SINGLETON_FRESH_CHECKPOINT_SOURCE_BINDINGS,
      );
    const result = validateRehearsalEvidence(markdown);

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  it.each([
    'evidence/live-rehearsals/generic-singleton-checkpoint.json',
    'evidence/live-rehearsals/synthetic-singleton-checkpoint.json',
    'evidence/live-rehearsals/simulated-singleton-checkpoint.json',
  ])('rejects fresh checkpoint assembly provenance with non-concrete provided-json singleton target %s', singletonTarget => {
    const markdown = completedRehearsal(completePassingRows)
      .replace(rehearsalAssemblyEvidence(), freshCheckpointAssemblyEvidence())
      .replace(
        LIVE_FRESH_CHECKPOINT_SOURCE_BINDINGS,
        PROVIDED_SINGLETON_FRESH_CHECKPOINT_SOURCE_BINDINGS.replace(
          'target=evidence/fresh/singleton-checkpoint.json',
          `target=${singletonTarget}`,
        ),
      );
    const result = validateRehearsalEvidence(markdown);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings provided-json singleton source must cite a concrete non-template JSON target',
    );
  });

  it('rejects fresh checkpoint assembly provenance without concrete live endpoint bindings', () => {
    const markdown = completedRehearsal(completePassingRows)
      .replace(rehearsalAssemblyEvidence(), freshCheckpointAssemblyEvidence())
      .replace(
        LIVE_FRESH_CHECKPOINT_SOURCE_BINDINGS,
        'Fresh checkpoint sourceBindings: height=live-read-only-sources readOnlyErgoNodeClient=true readOnlySidechainRpcClient=true nodeAuthHeader=not-used operations=/info,EVM getBlockNumber; singleton=live-read-only-node readOnlyNodeClient=true nodeAuthHeader=not-used operations=/info,singleton boxes by token ID,mempool/unconfirmed transaction lookup,confirmed transaction lookup; anchor=live-read-only-node readOnlyNodeClient=true nodeAuthHeader=not-used operations=/info,Ergo extension fields at aggregate anchor heights,0x0401 bridgeEventRoot matching',
      );
    const result = validateRehearsalEvidence(markdown);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must cite read-only Ergo node URL for live height evidence',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must cite read-only sidechain RPC URL for live height evidence',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must cite read-only Ergo node URL for live singleton evidence',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must cite read-only Ergo node URL for live anchor evidence',
    );
  });

  it('rejects fresh checkpoint assembly provenance with generic live endpoint bindings', () => {
    const markdown = completedRehearsal(completePassingRows)
      .replace(rehearsalAssemblyEvidence(), freshCheckpointAssemblyEvidence())
      .replaceAll(FRESH_CHECKPOINT_ERGO_NODE_URL, 'https://generic-ergo-node.invalid')
      .replaceAll(FRESH_CHECKPOINT_SIDECHAIN_RPC_URL, 'https://node.invalid/generic-sidechain');
    const result = validateRehearsalEvidence(markdown);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must cite read-only Ergo node URL for live height evidence',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must cite read-only sidechain RPC URL for live height evidence',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must cite read-only Ergo node URL for live singleton evidence',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must cite read-only Ergo node URL for live anchor evidence',
    );
  });

  it('rejects fresh checkpoint assembly provenance with auth or runtime payloads', () => {
    const markdown = completedRehearsal(completePassingRows)
      .replace(rehearsalAssemblyEvidence(), freshCheckpointAssemblyEvidence())
      .replace(
        LIVE_FRESH_CHECKPOINT_SOURCE_BINDINGS,
        `${LIVE_FRESH_CHECKPOINT_SOURCE_BINDINGS} authHeader=Bearer-redacted runtimePath=bridge-state.json`,
      );
    const result = validateRehearsalEvidence(markdown);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must not serialize auth, secret, runtime, state, or database payloads',
    );
  });

  it('rejects fresh checkpoint assembly provenance with shared sensitive provided-json targets', () => {
    for (const target of [
      'operator/signing-key-singleton.json',
      'operator/api-key-singleton.json',
      'operator/seed-phrase-singleton.json',
      'state/deployed_state.json',
      'evidence/sourceTarget=%28.env%29/singleton.json',
      'evidence/sourceTarget=%28runtime%2Fbridge-state.sqlite%29/singleton.json',
    ]) {
      const markdown = completedRehearsal(completePassingRows)
        .replace(rehearsalAssemblyEvidence(), freshCheckpointAssemblyEvidence())
        .replace(
          LIVE_FRESH_CHECKPOINT_SOURCE_BINDINGS,
          `Fresh checkpoint sourceBindings: height=live-read-only-sources ` +
            `ergoNodeUrl=${FRESH_CHECKPOINT_ERGO_NODE_URL} ` +
            `sidechainRpcUrl=${FRESH_CHECKPOINT_SIDECHAIN_RPC_URL} ` +
            `readOnlyErgoNodeClient=true readOnlySidechainRpcClient=true nodeAuthHeader=not-used ` +
            `operations=/info,EVM getBlockNumber; singleton=provided-json target=${target} ` +
            `readOnlyNodeClient=false nodeAuthHeader=not-applicable; anchor=live-read-only-node ` +
            `ergoNodeUrl=${FRESH_CHECKPOINT_ERGO_NODE_URL} readOnlyNodeClient=true ` +
            `nodeAuthHeader=not-used operations=/info,Ergo extension fields at aggregate anchor heights,` +
            `0x0401 bridgeEventRoot matching`,
        );
      const result = validateRehearsalEvidence(markdown);

      expect(result.status, target).toBe('BLOCKED');
      expect(result.errors, target).toContain(
        'Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must not serialize auth, secret, runtime, state, or database payloads',
      );
      expect(result.errors, target).toContain(
        'Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings provided-json singleton source must cite a concrete non-template JSON target',
      );
    }
  });

  it('rejects fresh checkpoint assembly provenance with a targetless provided-json singleton source', () => {
    const markdown = completedRehearsal(completePassingRows)
      .replace(rehearsalAssemblyEvidence(), freshCheckpointAssemblyEvidence())
      .replace(
        LIVE_FRESH_CHECKPOINT_SOURCE_BINDINGS,
        `Fresh checkpoint sourceBindings: height=live-read-only-sources ` +
          `ergoNodeUrl=${FRESH_CHECKPOINT_ERGO_NODE_URL} ` +
          `sidechainRpcUrl=${FRESH_CHECKPOINT_SIDECHAIN_RPC_URL} ` +
          `readOnlyErgoNodeClient=true readOnlySidechainRpcClient=true nodeAuthHeader=not-used ` +
          `operations=/info,EVM getBlockNumber; singleton=provided-json ` +
          `readOnlyNodeClient=false nodeAuthHeader=not-applicable; anchor=live-read-only-node ` +
          `ergoNodeUrl=${FRESH_CHECKPOINT_ERGO_NODE_URL} readOnlyNodeClient=true ` +
          `nodeAuthHeader=not-used operations=/info,Ergo extension fields at aggregate anchor heights,` +
          `0x0401 bridgeEventRoot matching`,
      );
    const result = validateRehearsalEvidence(markdown);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings provided-json singleton source must cite a concrete non-template JSON target',
    );
  });

  it('rejects edited fresh checkpoint assembly provenance that weakens the non-broadcast boundary', () => {
    const markdown = completedRehearsal(completePassingRows)
      .replace(rehearsalAssemblyEvidence(), freshCheckpointAssemblyEvidence())
      .replace('artifact://assembly/completed-fresh-checkpoint.json', 'artifact://assembly/fresh-checkpoint-template.json')
      .replace('Fresh checkpoint lifecycle status: publication blocker', 'Fresh checkpoint lifecycle status: pass')
      .replace(
        `Fresh checkpoint Expected transaction ID: ${SETTLEMENT_TX_ID}`,
        `Fresh checkpoint Expected transaction ID: ${DIFFERENT_SETTLEMENT_TX_ID}`,
      )
      .replace(
        `Fresh checkpoint deployed-state hash: ${DEPLOYMENT_STATE_HASH}`,
        `Fresh checkpoint deployed-state hash: ${DIFFERENT_SETTLEMENT_TX_ID}`,
      )
      .replace('Fresh checkpoint singleton freshness: fresh ageSeconds=0 maxAgeSeconds=900', 'Fresh checkpoint singleton freshness: stale ageSeconds=901 maxAgeSeconds=900')
      .replace(
        LIVE_FRESH_CHECKPOINT_SOURCE_BINDINGS,
        'Fresh checkpoint sourceBindings: height=unspecified; singleton=unspecified; anchor=provided-json',
      )
      .replace(
        'Fresh checkpoint live anchor observations: live-read-only-node /info observedAt 2026-05-18T02:30:00.000Z nodeHeight 250 maxAgeSeconds=900 0x0401 bridgeEventRootHex matched at each Ergo anchor height count=1',
        'Fresh checkpoint live anchor observations: provided-json extension fields not matched count=1',
      )
      .replace(
        'Fresh checkpoint boundary: offline/non-broadcast; does not authorize broadcast, close Gate 3, replace live submit/confirmation/reconciliation, or support production-ready/testnet production-candidate claims.',
        'Fresh checkpoint boundary: broadcast authorized and Gate 3 closed.',
      );
    const result = validateRehearsalEvidence(markdown);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint source target must cite completed non-template source evidence',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint lifecycle status must remain publication blocker',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint Expected transaction ID must match Dry-Run Settlement Evidence Expected transaction ID',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint deployed-state hash must match Clean deployment state evidence',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint singleton freshness must be fresh',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must prove singleton source provenance',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must prove anchor live-read-only-node provenance',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must prove read-only anchor observation',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint live anchor observations must cite read-only source binding',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint live anchor observations must cite /info source binding',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint live anchor observations must cite observedAt freshness evidence',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint live anchor observations must cite nodeHeight freshness evidence',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint live anchor observations must cite maxAgeSeconds=900',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint live anchor observations must cite 0x0401',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint live anchor observations must cite bridgeEventRootHex',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint live anchor observations must prove matching anchor fields',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint live anchor observations must cover each Ergo anchor height',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint boundary must state it does not authorize broadcast',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint boundary must state it cannot replace live submit/confirmation/reconciliation',
    );
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint boundary must state it cannot support production-ready/testnet production-candidate claims',
    );
  });

  it('rejects fresh checkpoint anchor observations that claim matched without concrete roots', () => {
    const markdown = completedRehearsal(completePassingRows)
      .replace(rehearsalAssemblyEvidence(), freshCheckpointAssemblyEvidence())
      .replace(
        `Fresh checkpoint live anchor observations: live-read-only-node /info observedAt 2026-05-18T02:30:00.000Z nodeHeight 250 maxAgeSeconds=900 0x0401 bridgeEventRootHex matched at each Ergo anchor height count=1 heights=100 roots=${BRIDGE_EVENT_ROOT}`,
        'Fresh checkpoint live anchor observations: live-read-only-node /info observedAt 2026-05-18T02:30:00.000Z nodeHeight 250 maxAgeSeconds=900 0x0401 bridgeEventRootHex matched at each Ergo anchor height count=1 heights=100',
      );
    const result = validateRehearsalEvidence(markdown);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint live anchor observations must cite concrete observed bridgeEventRootHex roots',
    );
  });

  it('rejects fresh checkpoint anchor observations whose roots do not match the dry-run bridge event root', () => {
    const markdown = completedRehearsal(completePassingRows)
      .replace(rehearsalAssemblyEvidence(), freshCheckpointAssemblyEvidence())
      .replace(`roots=${BRIDGE_EVENT_ROOT}`, `roots=${DIFFERENT_SETTLEMENT_TX_ID}`);
    const result = validateRehearsalEvidence(markdown);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint live anchor observations roots must exactly match Dry-Run Settlement Evidence Bridge event root',
    );
  });

  it('rejects fresh checkpoint anchor observations that mix the dry-run root with an unrelated root', () => {
    const markdown = completedRehearsal(completePassingRows)
      .replace(rehearsalAssemblyEvidence(), freshCheckpointAssemblyEvidence())
      .replace(`roots=${BRIDGE_EVENT_ROOT}`, `roots=${BRIDGE_EVENT_ROOT},${DIFFERENT_SETTLEMENT_TX_ID}`);
    const result = validateRehearsalEvidence(markdown);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Rehearsal Assembly Evidence: Fresh checkpoint live anchor observations roots must exactly match Dry-Run Settlement Evidence Bridge event root',
    );
  });

  it('formats passing testnet rehearsal validation output with finality facts', () => {
    const target = 'artifact://evidence/live-rehearsals/completed-testnet-rehearsal.md';
    const markdown = completedRehearsal(completePassingRows);
    const result = validateRehearsalEvidence(markdown);
    const lines = formatRehearsalValidationTranscriptLines(target, markdown, result);

    expect(lines).toContain(`${target}: Rehearsal evidence PASS: 12 lifecycle rows are structured.`);
    expect(lines[1]).toContain(
      `npm run rehearsal:validate command output: PASS exit code 0 validated target ${target}`,
    );
    expect(lines[1]).toContain('confirmation policy met PASS confirmationsRequired=1 confirmationsObserved=1');
    expect(lines[1]).toContain(
      'observed confirmation count greater than or equal to required confirmation count',
    );
    expect(lines[1]).toContain(`expected transaction ID ${SETTLEMENT_TX_ID}`);
    expect(lines[1]).toContain(`submitted transaction ID ${SETTLEMENT_TX_ID}`);
    expect(lines[1]).toContain('completed finality evidence artifact://submit/confirmation-policy');
  });

  it('formats passing validation output with a distinct transcript target when provided', () => {
    const target = 'artifact://evidence/live-rehearsals/completed-testnet-rehearsal.md';
    const transcriptTarget = 'artifact://evidence/live-rehearsals/rehearsal-validate.log';
    const markdown = completedRehearsal(completePassingRows);
    const result = validateRehearsalEvidence(markdown);
    const lines = formatRehearsalValidationTranscriptLines(
      target,
      markdown,
      result,
      transcriptTarget,
    );

    expect(lines[1]).toContain(
      `npm run rehearsal:validate command output: ${transcriptTarget} PASS exit code 0 validated target ${target}`,
    );
    expect(lines[1].indexOf(transcriptTarget)).toBeLessThan(lines[1].indexOf(`validated target ${target}`));
  });

  it('validates transcript targets before reporting the legacy V1 quarantine', () => {
    const evidenceDir = join(process.cwd(), 'tmp-rehearsal-validator-test');
    const target = 'tmp-rehearsal-validator-test/completed-testnet-rehearsal.md';
    const assemblyReportTarget = 'tmp-rehearsal-validator-test/completed-assembly-report.json';
    const livePreflightTarget = 'tmp-rehearsal-validator-test/completed-live-preflight.json';
    const postSubmitObserveTarget = 'tmp-rehearsal-validator-test/completed-post-submit-observe.json';
    const failedRecoveryObserveTarget = 'tmp-rehearsal-validator-test/completed-failed-broadcast-observe.json';
    const reorgRecoveryObserveTarget = 'tmp-rehearsal-validator-test/completed-reorg-observe.json';
    const transcriptTarget = 'artifact://live-rehearsal/rehearsal-validate.log';
    const command = process.execPath;
    const scriptRunner = 'node_modules/tsx/dist/cli.mjs';
    const markdown = bindStructuredValidationTargets(completedRehearsal(completePassingRows), {
      livePreflightJson: livePreflightTarget,
      postSubmitObserveJson: postSubmitObserveTarget,
      failedRecoveryObserveJson: failedRecoveryObserveTarget,
      reorgRecoveryObserveJson: reorgRecoveryObserveTarget,
    });

    rmSync(evidenceDir, { recursive: true, force: true });
    mkdirSync(evidenceDir, { recursive: true });
    try {
      writeFileSync(join(evidenceDir, 'completed-testnet-rehearsal.md'), markdown);
      writeFileSync(
        join(evidenceDir, 'completed-live-preflight.json'),
        JSON.stringify(livePreflightJsonArtifact(), null, 2),
      );
      writeFileSync(
        join(evidenceDir, 'completed-post-submit-observe.json'),
        JSON.stringify(postSubmitObserveJsonArtifact({}, livePreflightTarget), null, 2),
      );
      writeFileSync(
        join(evidenceDir, 'completed-failed-broadcast-observe.json'),
        JSON.stringify(recoveryObserveJsonArtifact('failed-broadcast-phantom-avl'), null, 2),
      );
      writeFileSync(
        join(evidenceDir, 'completed-reorg-observe.json'),
        JSON.stringify(recoveryObserveJsonArtifact('reorged-burn-stale-singleton'), null, 2),
      );
      writeFileSync(
        join(evidenceDir, 'completed-assembly-report.json'),
        JSON.stringify(assemblyReportJsonArtifact(markdown, {
          postSubmitObserveJson: postSubmitObserveTarget,
        }), null, 2),
      );

      const missingTranscript = spawnSync(
        command,
        [scriptRunner, 'src/scripts/validate-rehearsal-evidence.ts', target],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expect(missingTranscript.status).toBe(1);
      expect(missingTranscript.stdout).toContain('--transcript is required for PASS output');
      expect(missingTranscript.stdout).not.toContain('Rehearsal evidence PASS');

      for (const localOnlyTranscriptTarget of [
        `[local](${['C:', 'tmp', 'rehearsal-validate.log'].join('/')})`,
        '[local](%2Ftmp%2Frehearsal-validate.log)',
        'artifact://live-rehearsal/sourceTarget=%2Ftmp%2Frehearsal-validate.log',
      ]) {
        const localOnlyTranscript = spawnSync(
          command,
          [
            scriptRunner,
            'src/scripts/validate-rehearsal-evidence.ts',
            '--transcript',
            localOnlyTranscriptTarget,
            target,
          ],
          { cwd: process.cwd(), encoding: 'utf8' },
        );
        expect(localOnlyTranscript.status).toBe(1);
        expect(localOnlyTranscript.stderr).toContain('--transcript must not reference a local-only path');
        expect(localOnlyTranscript.stdout).not.toContain('Rehearsal evidence PASS');
      }

      for (const sensitiveTranscriptTarget of [
        'artifact://live-rehearsal/operator/signing-key-validate.log',
        'artifact://live-rehearsal/operator/seed-phrase-validate.log',
        'artifact://live-rehearsal/sourceTarget=(.env)',
        'artifact://live-rehearsal/sourceTarget=(bridge-state.sqlite).log',
        'artifact://live-rehearsal/sourceTarget=%28.env%29',
        'artifact://live-rehearsal/sourceTarget=%28runtime%2Fbridge-state.sqlite%29.log',
      ]) {
        const sensitiveTranscript = spawnSync(
          command,
          [
            scriptRunner,
            'src/scripts/validate-rehearsal-evidence.ts',
            '--transcript',
            sensitiveTranscriptTarget,
            target,
          ],
          { cwd: process.cwd(), encoding: 'utf8' },
        );
        expect(sensitiveTranscript.status).toBe(1);
        expect(sensitiveTranscript.stderr).toContain('--transcript must not reference runtime or secret-bearing material');
        expect(sensitiveTranscript.stdout).not.toContain('Rehearsal evidence PASS');
        expect(sensitiveTranscript.stderr).not.toContain(sensitiveTranscriptTarget);
      }

      for (const nonConcreteTranscriptTarget of [
        'artifact://live-rehearsal/template-rehearsal-validate.log',
        'artifact://live-rehearsal/generic-rehearsal-validate.log',
        'artifact://live-rehearsal/fixture-rehearsal-validate.log',
        'artifact://live-rehearsal/sample-rehearsal-validate.log',
        'artifact://live-rehearsal/sample-proof-rehearsal-validate.log',
        'artifact://live-rehearsal/sample-artifact-rehearsal-validate.log',
        'artifact://live-rehearsal/sample-target-rehearsal-validate.log',
        'artifact://live-rehearsal/sample-log-rehearsal-validate.log',
        'artifact://live-rehearsal/sample-run-rehearsal-validate.log',
        'artifact://live-rehearsal/sample-check-rehearsal-validate.log',
        'artifact://live-rehearsal/sample-update-rehearsal-validate.log',
        'artifact://live-rehearsal/sample-lifecycle-rehearsal-validate.log',
        'artifact://live-rehearsal/sample-evidence-rehearsal-validate.log',
        'artifact://live-rehearsal/example-rehearsal-validate.log',
        'artifact://live-rehearsal/completed-synthetic-rehearsal-validate.log',
        'artifact://live-rehearsal/completed-simulated-rehearsal-validate.log',
        '[sample transcript](artifact://live-rehearsal/sample-target-rehearsal-validate.log)',
      ]) {
        const nonConcreteTranscript = spawnSync(
          command,
          [
            scriptRunner,
            'src/scripts/validate-rehearsal-evidence.ts',
            '--transcript',
            nonConcreteTranscriptTarget,
            '--assembly-report-json',
            assemblyReportTarget,
            '--live-preflight-json',
            livePreflightTarget,
            '--post-submit-observe-json',
            postSubmitObserveTarget,
            '--recovery-observe-json',
            failedRecoveryObserveTarget,
            '--recovery-observe-json',
            reorgRecoveryObserveTarget,
            target,
          ],
          { cwd: process.cwd(), encoding: 'utf8' },
        );
        expect(nonConcreteTranscript.status).toBe(1);
        expect(nonConcreteTranscript.stderr).toContain('--transcript must be a completed artifact target or non-template evidence link');
        expect(nonConcreteTranscript.stdout).not.toContain('Rehearsal evidence PASS');
      }

      for (const concreteAuditTranscriptTarget of [
        'artifact://live-rehearsal/sample-size-analysis-rehearsal-validate.log',
        '[template removal transcript](artifact://live-rehearsal/template-removal-audit-rehearsal-validate.log)',
      ]) {
        const concreteAuditTranscript = spawnSync(
          command,
          [
            scriptRunner,
            'src/scripts/validate-rehearsal-evidence.ts',
            '--transcript',
            concreteAuditTranscriptTarget,
            '--assembly-report-json',
            assemblyReportTarget,
            '--live-preflight-json',
            livePreflightTarget,
            '--post-submit-observe-json',
            postSubmitObserveTarget,
            '--recovery-observe-json',
            failedRecoveryObserveTarget,
            '--recovery-observe-json',
            reorgRecoveryObserveTarget,
            target,
          ],
          { cwd: process.cwd(), encoding: 'utf8' },
        );
        expectLegacyV1LivePreflightQuarantine(concreteAuditTranscript);
      }

      const validTranscript = spawnSync(
        command,
        [
          scriptRunner,
          'src/scripts/validate-rehearsal-evidence.ts',
          '--transcript',
          transcriptTarget,
          '--assembly-report-json',
          assemblyReportTarget,
          '--live-preflight-json',
          livePreflightTarget,
          '--post-submit-observe-json',
          postSubmitObserveTarget,
          '--recovery-observe-json',
          failedRecoveryObserveTarget,
          '--recovery-observe-json',
          reorgRecoveryObserveTarget,
          target,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expectLegacyV1LivePreflightQuarantine(validTranscript);

      const sameTargetTranscript = spawnSync(
        command,
        [scriptRunner, 'src/scripts/validate-rehearsal-evidence.ts', '--transcript', `[same](${target})`, target],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expect(sameTargetTranscript.status).toBe(1);
      expect(sameTargetTranscript.stdout).toContain('--transcript must be distinct from the completed rehearsal target');
      expect(sameTargetTranscript.stdout).not.toContain(`${target}: evidence target BLOCKED`);
    } finally {
      rmSync(evidenceDir, { recursive: true, force: true });
    }
  }, REHEARSAL_PROCESS_TEST_TIMEOUT_MS);

  it('rejects retired legacy V1 rehearsal JSON options', () => {
    const retiredOptions = [
      '--aggregate-prebroadcast-json',
      '--prep-bundle-json',
      '--preflight-json',
      '--window-prep-json',
    ];

    for (const option of retiredOptions) {
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/validate-rehearsal-evidence.ts',
          option,
          'artifact://historical-v1/report.json',
          'artifact://live-rehearsal/completed.md',
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`Unknown option: ${option}`);
    }
  });


  it('validates linked post-submit observe JSON before reporting the legacy V1 quarantine', () => {
    const evidenceDir = join(process.cwd(), 'tmp-rehearsal-validator-post-submit-test');
    const target = 'tmp-rehearsal-validator-post-submit-test/completed-testnet-rehearsal.md';
    const assemblyReportTarget = 'tmp-rehearsal-validator-post-submit-test/completed-assembly-report.json';
    const livePreflightTarget = 'tmp-rehearsal-validator-post-submit-test/completed-live-preflight.json';
    const postSubmitObserveTarget = 'tmp-rehearsal-validator-post-submit-test/completed-post-submit-observe.json';
    const otherPostSubmitObserveTarget = 'tmp-rehearsal-validator-post-submit-test/other-post-submit-observe.json';
    const failedRecoveryObserveTarget = 'tmp-rehearsal-validator-post-submit-test/completed-failed-broadcast-observe.json';
    const reorgRecoveryObserveTarget = 'tmp-rehearsal-validator-post-submit-test/completed-reorg-observe.json';
    const transcriptTarget = 'artifact://live-rehearsal/rehearsal-validate.log';
    const command = process.execPath;
    const scriptRunner = 'node_modules/tsx/dist/cli.mjs';
    const markdown = bindStructuredValidationTargets(completedRehearsal(completePassingRows), {
      livePreflightJson: livePreflightTarget,
      postSubmitObserveJson: postSubmitObserveTarget,
      failedRecoveryObserveJson: failedRecoveryObserveTarget,
      reorgRecoveryObserveJson: reorgRecoveryObserveTarget,
    });

    rmSync(evidenceDir, { recursive: true, force: true });
    mkdirSync(evidenceDir, { recursive: true });
    try {
      writeFileSync(join(evidenceDir, 'completed-testnet-rehearsal.md'), markdown);
      writeFileSync(
        join(evidenceDir, 'completed-live-preflight.json'),
        JSON.stringify(livePreflightJsonArtifact(), null, 2),
      );
      writeFileSync(
        join(evidenceDir, 'completed-post-submit-observe.json'),
        JSON.stringify(postSubmitObserveJsonArtifact({}, livePreflightTarget), null, 2),
      );
      writeFileSync(
        join(evidenceDir, 'other-post-submit-observe.json'),
        JSON.stringify(postSubmitObserveJsonArtifact({}, livePreflightTarget), null, 2),
      );
      writeFileSync(
        join(evidenceDir, 'completed-failed-broadcast-observe.json'),
        JSON.stringify(recoveryObserveJsonArtifact('failed-broadcast-phantom-avl'), null, 2),
      );
      writeFileSync(
        join(evidenceDir, 'completed-reorg-observe.json'),
        JSON.stringify(recoveryObserveJsonArtifact('reorged-burn-stale-singleton'), null, 2),
      );
      writeFileSync(
        join(evidenceDir, 'completed-assembly-report.json'),
        JSON.stringify(assemblyReportJsonArtifact(markdown, {
          postSubmitObserveJson: postSubmitObserveTarget,
        }), null, 2),
      );

      const missingPostSubmitObserve = spawnSync(
        command,
        [scriptRunner, 'src/scripts/validate-rehearsal-evidence.ts', '--transcript', transcriptTarget, target],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expect(missingPostSubmitObserve.status).toBe(1);
      expect(missingPostSubmitObserve.stdout).toContain(
        '--post-submit-observe-json is required when Rehearsal Assembly Evidence includes post-submit evidence',
      );

      const wrongPostSubmitObserve = spawnSync(
        command,
        [
          scriptRunner,
          'src/scripts/validate-rehearsal-evidence.ts',
          '--transcript',
          transcriptTarget,
          '--post-submit-observe-json',
          otherPostSubmitObserveTarget,
          target,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expect(wrongPostSubmitObserve.status).toBe(1);
      expect(wrongPostSubmitObserve.stdout).toContain('--post-submit-observe-json target must match Post-submit observe JSON report target');

      writeFileSync(
        join(evidenceDir, 'completed-post-submit-observe.json'),
        JSON.stringify(postSubmitObserveJsonArtifact({ status: 'BLOCKED' }, livePreflightTarget), null, 2),
      );
      const invalidPostSubmitObserve = spawnSync(
        command,
        [
          scriptRunner,
          'src/scripts/validate-rehearsal-evidence.ts',
          '--transcript',
          transcriptTarget,
          '--assembly-report-json',
          assemblyReportTarget,
          '--live-preflight-json',
          livePreflightTarget,
          '--post-submit-observe-json',
          postSubmitObserveTarget,
          '--recovery-observe-json',
          failedRecoveryObserveTarget,
          '--recovery-observe-json',
          reorgRecoveryObserveTarget,
          target,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expect(invalidPostSubmitObserve.status).toBe(1);
      expect(invalidPostSubmitObserve.stdout).toContain('post-submit: JSON observe report status must be CREATED');

      const otherApprovedBurnTxId = '9'.repeat(64);
      const mismatchedApprovedBurnReport = postSubmitObserveJsonArtifact({}, livePreflightTarget);
      const mismatchedApprovedBurnObservation =
        mismatchedApprovedBurnReport.observation as Record<string, unknown>;
      const mismatchedApprovedBurnBinding =
        mismatchedApprovedBurnObservation.livePreflightBinding as Record<string, unknown>;
      writeFileSync(
        join(evidenceDir, 'completed-post-submit-observe.json'),
        JSON.stringify({
          ...mismatchedApprovedBurnReport,
          markdown: (mismatchedApprovedBurnReport.markdown as string).replace(
            `approved burn order ${PEG_OUT_BURN_TX_ID}`,
            `approved burn order ${otherApprovedBurnTxId}`,
          ),
          observation: {
            ...mismatchedApprovedBurnObservation,
            burnOrder: [otherApprovedBurnTxId],
            livePreflightBinding: {
              ...mismatchedApprovedBurnBinding,
              approvedBurnTxHashes: [otherApprovedBurnTxId],
            },
          },
        }, null, 2),
      );
      const mismatchedApprovedBurn = spawnSync(
        command,
        [
          scriptRunner,
          'src/scripts/validate-rehearsal-evidence.ts',
          '--transcript',
          transcriptTarget,
          '--assembly-report-json',
          assemblyReportTarget,
          '--live-preflight-json',
          livePreflightTarget,
          '--post-submit-observe-json',
          postSubmitObserveTarget,
          '--recovery-observe-json',
          failedRecoveryObserveTarget,
          '--recovery-observe-json',
          reorgRecoveryObserveTarget,
          target,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expect(mismatchedApprovedBurn.status).toBe(1);
      expect(mismatchedApprovedBurn.stdout).toContain(
        'post-submit: JSON observe report livePreflightBinding.approvedBurnTxHashes must match the validated live-preflight approvalBinding.burnTxHashes',
      );

      const mismatchedLivePreflightReport = postSubmitObserveJsonArtifact({}, livePreflightTarget);
      const mismatchedObservation = mismatchedLivePreflightReport.observation as Record<string, unknown>;
      const mismatchedBinding = mismatchedObservation.livePreflightBinding as Record<string, unknown>;
      writeFileSync(
        join(evidenceDir, 'completed-post-submit-observe.json'),
        JSON.stringify({
          ...mismatchedLivePreflightReport,
          markdown: (mismatchedLivePreflightReport.markdown as string).replace(
            'evidence/live-rehearsals/live-preflight.json',
            'evidence/live-rehearsals/other-live-preflight.json',
          ),
          observation: {
            ...mismatchedObservation,
            livePreflightBinding: {
              ...mismatchedBinding,
              target: 'evidence/live-rehearsals/other-live-preflight.json',
            },
          },
        }, null, 2),
      );
      const mismatchedLivePreflight = spawnSync(
        command,
        [
          scriptRunner,
          'src/scripts/validate-rehearsal-evidence.ts',
          '--transcript',
          transcriptTarget,
          '--assembly-report-json',
          assemblyReportTarget,
          '--post-submit-observe-json',
          postSubmitObserveTarget,
          target,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expect(mismatchedLivePreflight.status).toBe(1);
      expect(mismatchedLivePreflight.stdout).toContain(
        'post-submit: JSON observe report livePreflightBinding.target must match the validated live-preflight JSON target',
      );

      writeFileSync(
        join(evidenceDir, 'completed-post-submit-observe.json'),
        JSON.stringify(postSubmitObserveJsonArtifact({}, livePreflightTarget), null, 2),
      );
      const validPostSubmitObserve = spawnSync(
        command,
        [
          scriptRunner,
          'src/scripts/validate-rehearsal-evidence.ts',
          '--transcript',
          transcriptTarget,
          '--assembly-report-json',
          assemblyReportTarget,
          '--live-preflight-json',
          livePreflightTarget,
          '--post-submit-observe-json',
          postSubmitObserveTarget,
          '--recovery-observe-json',
          failedRecoveryObserveTarget,
          '--recovery-observe-json',
          reorgRecoveryObserveTarget,
          target,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expectLegacyV1LivePreflightQuarantine(validPostSubmitObserve);
    } finally {
      rmSync(evidenceDir, { recursive: true, force: true });
    }
  }, REHEARSAL_PROCESS_TEST_TIMEOUT_MS);

  it('validates linked live-preflight JSON and quarantines legacy V1', () => {
    const evidenceDir = join(process.cwd(), 'tmp-rehearsal-validator-live-preflight-test');
    const target = 'tmp-rehearsal-validator-live-preflight-test/completed-testnet-rehearsal.md';
    const assemblyReportTarget = 'tmp-rehearsal-validator-live-preflight-test/completed-assembly-report.json';
    const livePreflightTarget = 'tmp-rehearsal-validator-live-preflight-test/completed-live-preflight.json';
    const otherLivePreflightTarget = 'tmp-rehearsal-validator-live-preflight-test/other-live-preflight.json';
    const postSubmitObserveTarget = 'tmp-rehearsal-validator-live-preflight-test/completed-post-submit-observe.json';
    const failedRecoveryObserveTarget = 'tmp-rehearsal-validator-live-preflight-test/completed-failed-broadcast-observe.json';
    const reorgRecoveryObserveTarget = 'tmp-rehearsal-validator-live-preflight-test/completed-reorg-observe.json';
    const transcriptTarget = 'artifact://live-rehearsal/rehearsal-validate.log';
    const command = process.execPath;
    const scriptRunner = 'node_modules/tsx/dist/cli.mjs';
    const markdown = bindStructuredValidationTargets(completedRehearsal(completePassingRows), {
      livePreflightJson: livePreflightTarget,
      postSubmitObserveJson: postSubmitObserveTarget,
      failedRecoveryObserveJson: failedRecoveryObserveTarget,
      reorgRecoveryObserveJson: reorgRecoveryObserveTarget,
    });

    rmSync(evidenceDir, { recursive: true, force: true });
    mkdirSync(evidenceDir, { recursive: true });
    try {
      writeFileSync(join(evidenceDir, 'completed-testnet-rehearsal.md'), markdown);
      writeFileSync(
        join(evidenceDir, 'completed-live-preflight.json'),
        JSON.stringify(livePreflightJsonArtifact(), null, 2),
      );
      writeFileSync(
        join(evidenceDir, 'other-live-preflight.json'),
        JSON.stringify(livePreflightJsonArtifact({
          approvalBinding: {
            command: 'check',
            mode: 'single',
            expectedTxId: SETTLEMENT_TX_ID,
            burnTxHashes: ['9'.repeat(64)],
          },
        }), null, 2),
      );
      writeFileSync(
        join(evidenceDir, 'completed-post-submit-observe.json'),
        JSON.stringify(postSubmitObserveJsonArtifact({}, livePreflightTarget), null, 2),
      );
      writeFileSync(
        join(evidenceDir, 'completed-failed-broadcast-observe.json'),
        JSON.stringify(recoveryObserveJsonArtifact('failed-broadcast-phantom-avl'), null, 2),
      );
      writeFileSync(
        join(evidenceDir, 'completed-reorg-observe.json'),
        JSON.stringify(recoveryObserveJsonArtifact('reorged-burn-stale-singleton'), null, 2),
      );
      writeFileSync(
        join(evidenceDir, 'completed-assembly-report.json'),
        JSON.stringify(assemblyReportJsonArtifact(markdown, {
          postSubmitObserveJson: postSubmitObserveTarget,
        }), null, 2),
      );

      const missingLivePreflight = spawnSync(
        command,
        [
          scriptRunner,
          'src/scripts/validate-rehearsal-evidence.ts',
          '--transcript',
          transcriptTarget,
          '--assembly-report-json',
          assemblyReportTarget,
          '--post-submit-observe-json',
          postSubmitObserveTarget,
          '--recovery-observe-json',
          failedRecoveryObserveTarget,
          '--recovery-observe-json',
          reorgRecoveryObserveTarget,
          target,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expect(missingLivePreflight.status).toBe(1);
      expect(missingLivePreflight.stdout).toContain(
        '--live-preflight-json is required when Post-Submit Gate Binding includes a live-preflight JSON binding',
      );

      const wrongLivePreflight = spawnSync(
        command,
        [
          scriptRunner,
          'src/scripts/validate-rehearsal-evidence.ts',
          '--transcript',
          transcriptTarget,
          '--assembly-report-json',
          assemblyReportTarget,
          '--live-preflight-json',
          otherLivePreflightTarget,
          '--post-submit-observe-json',
          postSubmitObserveTarget,
          '--recovery-observe-json',
          failedRecoveryObserveTarget,
          '--recovery-observe-json',
          reorgRecoveryObserveTarget,
          target,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expect(wrongLivePreflight.status).toBe(1);
      expect(wrongLivePreflight.stdout).toContain(
        '--live-preflight-json target must match Live-preflight JSON binding target',
      );
      expect(wrongLivePreflight.stdout).toContain(
        'post-submit: JSON observe report livePreflightBinding.target must match the validated live-preflight JSON target',
      );
      expect(wrongLivePreflight.stdout).toContain(
        'post-submit: JSON observe report livePreflightBinding.approvedBurnTxHashes must match the validated live-preflight approvalBinding.burnTxHashes',
      );

      writeFileSync(
        join(evidenceDir, 'completed-live-preflight.json'),
        JSON.stringify(livePreflightJsonArtifact({ status: 'BLOCKED' }), null, 2),
      );
      const invalidLivePreflight = spawnSync(
        command,
        [
          scriptRunner,
          'src/scripts/validate-rehearsal-evidence.ts',
          '--transcript',
          transcriptTarget,
          '--assembly-report-json',
          assemblyReportTarget,
          '--live-preflight-json',
          livePreflightTarget,
          '--post-submit-observe-json',
          postSubmitObserveTarget,
          '--recovery-observe-json',
          failedRecoveryObserveTarget,
          '--recovery-observe-json',
          reorgRecoveryObserveTarget,
          target,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expect(invalidLivePreflight.status).toBe(1);
      expect(invalidLivePreflight.stdout).toContain('live-preflight: JSON report status must be GO');

      writeFileSync(
        join(evidenceDir, 'completed-live-preflight.json'),
        JSON.stringify(livePreflightJsonArtifact(), null, 2),
      );
      const validLivePreflight = spawnSync(
        command,
        [
          scriptRunner,
          'src/scripts/validate-rehearsal-evidence.ts',
          '--transcript',
          transcriptTarget,
          '--assembly-report-json',
          assemblyReportTarget,
          '--live-preflight-json',
          livePreflightTarget,
          '--post-submit-observe-json',
          postSubmitObserveTarget,
          '--recovery-observe-json',
          failedRecoveryObserveTarget,
          '--recovery-observe-json',
          reorgRecoveryObserveTarget,
          target,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expectLegacyV1LivePreflightQuarantine(validLivePreflight);
    } finally {
      rmSync(evidenceDir, { recursive: true, force: true });
    }
  }, REHEARSAL_PROCESS_TEST_TIMEOUT_MS);

  it('validates linked recovery-observe JSON before reporting the legacy V1 quarantine', () => {
    const evidenceDir = join(process.cwd(), 'tmp-rehearsal-validator-recovery-observe-test');
    const target = 'tmp-rehearsal-validator-recovery-observe-test/completed-testnet-rehearsal.md';
    const assemblyReportTarget = 'tmp-rehearsal-validator-recovery-observe-test/completed-assembly-report.json';
    const livePreflightTarget = 'tmp-rehearsal-validator-recovery-observe-test/completed-live-preflight.json';
    const postSubmitObserveTarget = 'tmp-rehearsal-validator-recovery-observe-test/completed-post-submit-observe.json';
    const failedRecoveryObserveTarget = 'tmp-rehearsal-validator-recovery-observe-test/completed-failed-broadcast-observe.json';
    const otherFailedRecoveryObserveTarget = 'tmp-rehearsal-validator-recovery-observe-test/other-failed-broadcast-observe.json';
    const reorgRecoveryObserveTarget = 'tmp-rehearsal-validator-recovery-observe-test/completed-reorg-observe.json';
    const transcriptTarget = 'artifact://live-rehearsal/rehearsal-validate.log';
    const command = process.execPath;
    const scriptRunner = 'node_modules/tsx/dist/cli.mjs';
    const markdown = bindStructuredValidationTargets(completedRehearsal(completePassingRows), {
      livePreflightJson: livePreflightTarget,
      postSubmitObserveJson: postSubmitObserveTarget,
      failedRecoveryObserveJson: failedRecoveryObserveTarget,
      reorgRecoveryObserveJson: reorgRecoveryObserveTarget,
    });

    rmSync(evidenceDir, { recursive: true, force: true });
    mkdirSync(evidenceDir, { recursive: true });
    try {
      writeFileSync(join(evidenceDir, 'completed-testnet-rehearsal.md'), markdown);
      writeFileSync(
        join(evidenceDir, 'completed-live-preflight.json'),
        JSON.stringify(livePreflightJsonArtifact(), null, 2),
      );
      writeFileSync(
        join(evidenceDir, 'completed-post-submit-observe.json'),
        JSON.stringify(postSubmitObserveJsonArtifact({}, livePreflightTarget), null, 2),
      );
      writeFileSync(
        join(evidenceDir, 'completed-failed-broadcast-observe.json'),
        JSON.stringify(recoveryObserveJsonArtifact('failed-broadcast-phantom-avl'), null, 2),
      );
      writeFileSync(
        join(evidenceDir, 'other-failed-broadcast-observe.json'),
        JSON.stringify(recoveryObserveJsonArtifact('failed-broadcast-phantom-avl'), null, 2),
      );
      writeFileSync(
        join(evidenceDir, 'completed-reorg-observe.json'),
        JSON.stringify(recoveryObserveJsonArtifact('reorged-burn-stale-singleton'), null, 2),
      );
      writeFileSync(
        join(evidenceDir, 'completed-assembly-report.json'),
        JSON.stringify(assemblyReportJsonArtifact(markdown, {
          postSubmitObserveJson: postSubmitObserveTarget,
        }), null, 2),
      );

      const missingRecoveryObserve = spawnSync(
        command,
        [
          scriptRunner,
          'src/scripts/validate-rehearsal-evidence.ts',
          '--transcript',
          transcriptTarget,
          '--assembly-report-json',
          assemblyReportTarget,
          '--live-preflight-json',
          livePreflightTarget,
          '--post-submit-observe-json',
          postSubmitObserveTarget,
          target,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expect(missingRecoveryObserve.status).toBe(1);
      expect(missingRecoveryObserve.stdout).toContain(
        '--recovery-observe-json is required when Failed broadcast / phantom AVL evidence is pass',
      );

      const wrongRecoveryObserve = spawnSync(
        command,
        [
          scriptRunner,
          'src/scripts/validate-rehearsal-evidence.ts',
          '--transcript',
          transcriptTarget,
          '--assembly-report-json',
          assemblyReportTarget,
          '--live-preflight-json',
          livePreflightTarget,
          '--post-submit-observe-json',
          postSubmitObserveTarget,
          '--recovery-observe-json',
          otherFailedRecoveryObserveTarget,
          '--recovery-observe-json',
          reorgRecoveryObserveTarget,
          target,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expect(wrongRecoveryObserve.status).toBe(1);
      expect(wrongRecoveryObserve.stdout).toContain(
        '--recovery-observe-json target must match linked Failed broadcast / phantom AVL evidence recovery observe JSON report',
      );

      writeFileSync(
        join(evidenceDir, 'completed-failed-broadcast-observe.json'),
        JSON.stringify(recoveryObserveJsonArtifact('failed-broadcast-phantom-avl', { status: 'BLOCKED' }), null, 2),
      );
      const invalidRecoveryObserve = spawnSync(
        command,
        [
          scriptRunner,
          'src/scripts/validate-rehearsal-evidence.ts',
          '--transcript',
          transcriptTarget,
          '--assembly-report-json',
          assemblyReportTarget,
          '--live-preflight-json',
          livePreflightTarget,
          '--post-submit-observe-json',
          postSubmitObserveTarget,
          '--recovery-observe-json',
          failedRecoveryObserveTarget,
          '--recovery-observe-json',
          reorgRecoveryObserveTarget,
          target,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expect(invalidRecoveryObserve.status).toBe(1);
      expect(invalidRecoveryObserve.stdout).toContain('recovery-observe: JSON report status must be PASS');

      writeFileSync(
        join(evidenceDir, 'completed-failed-broadcast-observe.json'),
        JSON.stringify(recoveryObserveJsonArtifact('failed-broadcast-phantom-avl'), null, 2),
      );
      const validRecoveryObserve = spawnSync(
        command,
        [
          scriptRunner,
          'src/scripts/validate-rehearsal-evidence.ts',
          '--transcript',
          transcriptTarget,
          '--assembly-report-json',
          assemblyReportTarget,
          '--live-preflight-json',
          livePreflightTarget,
          '--post-submit-observe-json',
          postSubmitObserveTarget,
          '--recovery-observe-json',
          failedRecoveryObserveTarget,
          '--recovery-observe-json',
          reorgRecoveryObserveTarget,
          target,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expectLegacyV1LivePreflightQuarantine(validRecoveryObserve);
    } finally {
      rmSync(evidenceDir, { recursive: true, force: true });
    }
  }, REHEARSAL_PROCESS_TEST_TIMEOUT_MS);

  it('validates linked assembly report JSON before reporting the legacy V1 quarantine', () => {
    const evidenceDir = join(process.cwd(), 'tmp-rehearsal-validator-assembly-report-test');
    const target = 'tmp-rehearsal-validator-assembly-report-test/completed-testnet-rehearsal.md';
    const assemblyReportTarget = 'tmp-rehearsal-validator-assembly-report-test/completed-assembly-report.json';
    const livePreflightTarget = 'tmp-rehearsal-validator-assembly-report-test/completed-live-preflight.json';
    const postSubmitObserveTarget = 'tmp-rehearsal-validator-assembly-report-test/completed-post-submit-observe.json';
    const failedRecoveryObserveTarget = 'tmp-rehearsal-validator-assembly-report-test/completed-failed-broadcast-observe.json';
    const reorgRecoveryObserveTarget = 'tmp-rehearsal-validator-assembly-report-test/completed-reorg-observe.json';
    const transcriptTarget = 'artifact://live-rehearsal/rehearsal-validate.log';
    const command = process.execPath;
    const scriptRunner = 'node_modules/tsx/dist/cli.mjs';
    const markdown = bindStructuredValidationTargets(completedRehearsal(completePassingRows), {
      livePreflightJson: livePreflightTarget,
      postSubmitObserveJson: postSubmitObserveTarget,
      failedRecoveryObserveJson: failedRecoveryObserveTarget,
      reorgRecoveryObserveJson: reorgRecoveryObserveTarget,
    });

    rmSync(evidenceDir, { recursive: true, force: true });
    mkdirSync(evidenceDir, { recursive: true });
    try {
      writeFileSync(join(evidenceDir, 'completed-testnet-rehearsal.md'), markdown);
      writeFileSync(
        join(evidenceDir, 'completed-live-preflight.json'),
        JSON.stringify(livePreflightJsonArtifact(), null, 2),
      );
      writeFileSync(
        join(evidenceDir, 'completed-post-submit-observe.json'),
        JSON.stringify(postSubmitObserveJsonArtifact({}, livePreflightTarget), null, 2),
      );
      writeFileSync(
        join(evidenceDir, 'completed-failed-broadcast-observe.json'),
        JSON.stringify(recoveryObserveJsonArtifact('failed-broadcast-phantom-avl'), null, 2),
      );
      writeFileSync(
        join(evidenceDir, 'completed-reorg-observe.json'),
        JSON.stringify(recoveryObserveJsonArtifact('reorged-burn-stale-singleton'), null, 2),
      );

      const missingAssemblyReport = spawnSync(
        command,
        [
          scriptRunner,
          'src/scripts/validate-rehearsal-evidence.ts',
          '--transcript',
          transcriptTarget,
          '--post-submit-observe-json',
          postSubmitObserveTarget,
          target,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expect(missingAssemblyReport.status).toBe(1);
      expect(missingAssemblyReport.stdout).toContain(
        '--assembly-report-json is required when Rehearsal Assembly Evidence is present',
      );

      writeFileSync(
        join(evidenceDir, 'completed-assembly-report.json'),
        JSON.stringify(assemblyReportJsonArtifact(markdown, {
          postSubmitObserveJson: 'tmp-rehearsal-validator-assembly-report-test/other-post-submit-observe.json',
        }), null, 2),
      );
      const mismatchedAssemblyReport = spawnSync(
        command,
        [
          scriptRunner,
          'src/scripts/validate-rehearsal-evidence.ts',
          '--transcript',
          transcriptTarget,
          '--assembly-report-json',
          assemblyReportTarget,
          '--live-preflight-json',
          livePreflightTarget,
          '--post-submit-observe-json',
          postSubmitObserveTarget,
          '--recovery-observe-json',
          failedRecoveryObserveTarget,
          '--recovery-observe-json',
          reorgRecoveryObserveTarget,
          target,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expect(mismatchedAssemblyReport.status).toBe(1);
      expect(mismatchedAssemblyReport.stdout).toContain(
        'assembly report JSON targetBindings.postSubmitObserveJson must match Post-submit observe JSON report',
      );

      const assemblyReportWithoutStructuredValidation = assemblyReportJsonArtifact(markdown, {
        postSubmitObserveJson: postSubmitObserveTarget,
      });
      delete (assemblyReportWithoutStructuredValidation as Record<string, unknown>).rehearsalValidation;
      writeFileSync(
        join(evidenceDir, 'completed-assembly-report.json'),
        JSON.stringify(assemblyReportWithoutStructuredValidation, null, 2),
      );
      const missingStructuredAssemblyValidation = spawnSync(
        command,
        [
          scriptRunner,
          'src/scripts/validate-rehearsal-evidence.ts',
          '--transcript',
          transcriptTarget,
          '--assembly-report-json',
          assemblyReportTarget,
          '--live-preflight-json',
          livePreflightTarget,
          '--post-submit-observe-json',
          postSubmitObserveTarget,
          '--recovery-observe-json',
          failedRecoveryObserveTarget,
          '--recovery-observe-json',
          reorgRecoveryObserveTarget,
          target,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expect(missingStructuredAssemblyValidation.status).toBe(1);
      expect(missingStructuredAssemblyValidation.stdout).toContain(
        'assembly: rehearsalValidation object is required',
      );

      writeFileSync(
        join(evidenceDir, 'completed-assembly-report.json'),
        JSON.stringify(assemblyReportJsonArtifact(markdown, {
          postSubmitObserveJson: postSubmitObserveTarget,
        }, {
          rehearsalValidation: validateRehearsalEvidence(markdown),
        }), null, 2),
      );
      const validAssemblyReport = spawnSync(
        command,
        [
          scriptRunner,
          'src/scripts/validate-rehearsal-evidence.ts',
          '--transcript',
          transcriptTarget,
          '--assembly-report-json',
          assemblyReportTarget,
          '--live-preflight-json',
          livePreflightTarget,
          '--post-submit-observe-json',
          postSubmitObserveTarget,
          '--recovery-observe-json',
          failedRecoveryObserveTarget,
          '--recovery-observe-json',
          reorgRecoveryObserveTarget,
          target,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expectLegacyV1LivePreflightQuarantine(validAssemblyReport);
    } finally {
      rmSync(evidenceDir, { recursive: true, force: true });
    }
  }, REHEARSAL_PROCESS_TEST_TIMEOUT_MS);

  it('validates linked fresh checkpoint JSON before reporting the legacy V1 quarantine', () => {
    const evidenceDir = join(process.cwd(), 'tmp-rehearsal-validator-fresh-checkpoint-test');
    const target = 'tmp-rehearsal-validator-fresh-checkpoint-test/completed-testnet-rehearsal.md';
    const assemblyReportTarget = 'tmp-rehearsal-validator-fresh-checkpoint-test/completed-assembly-report.json';
    const livePreflightTarget = 'tmp-rehearsal-validator-fresh-checkpoint-test/completed-live-preflight.json';
    const postSubmitObserveTarget = 'tmp-rehearsal-validator-fresh-checkpoint-test/completed-post-submit-observe.json';
    const freshCheckpointTarget = 'tmp-rehearsal-validator-fresh-checkpoint-test/completed-fresh-checkpoint.json';
    const otherFreshCheckpointTarget = 'tmp-rehearsal-validator-fresh-checkpoint-test/other-fresh-checkpoint.json';
    const failedRecoveryObserveTarget = 'tmp-rehearsal-validator-fresh-checkpoint-test/completed-failed-broadcast-observe.json';
    const reorgRecoveryObserveTarget = 'tmp-rehearsal-validator-fresh-checkpoint-test/completed-reorg-observe.json';
    const transcriptTarget = 'artifact://live-rehearsal/rehearsal-validate.log';
    const markdown = bindStructuredValidationTargets(
      completedRehearsal(completePassingRows).replace(rehearsalAssemblyEvidence(), freshCheckpointAssemblyEvidence()),
      {
        livePreflightJson: livePreflightTarget,
        postSubmitObserveJson: postSubmitObserveTarget,
        failedRecoveryObserveJson: failedRecoveryObserveTarget,
        reorgRecoveryObserveJson: reorgRecoveryObserveTarget,
        freshCheckpointJson: freshCheckpointTarget,
      },
    );
    const baseArgs = [
      'node_modules/tsx/dist/cli.mjs',
      'src/scripts/validate-rehearsal-evidence.ts',
      '--transcript',
      transcriptTarget,
      '--assembly-report-json',
      assemblyReportTarget,
      '--live-preflight-json',
      livePreflightTarget,
      '--post-submit-observe-json',
      postSubmitObserveTarget,
      '--recovery-observe-json',
      failedRecoveryObserveTarget,
      '--recovery-observe-json',
      reorgRecoveryObserveTarget,
    ];

    rmSync(evidenceDir, { recursive: true, force: true });
    mkdirSync(evidenceDir, { recursive: true });
    try {
      writeFileSync(join(evidenceDir, 'completed-testnet-rehearsal.md'), markdown);
      writeFileSync(join(evidenceDir, 'completed-live-preflight.json'), JSON.stringify(livePreflightJsonArtifact(), null, 2));
      writeFileSync(
        join(evidenceDir, 'completed-post-submit-observe.json'),
        JSON.stringify(postSubmitObserveJsonArtifact({}, livePreflightTarget), null, 2),
      );
      writeFileSync(
        join(evidenceDir, 'completed-failed-broadcast-observe.json'),
        JSON.stringify(recoveryObserveJsonArtifact('failed-broadcast-phantom-avl'), null, 2),
      );
      writeFileSync(
        join(evidenceDir, 'completed-reorg-observe.json'),
        JSON.stringify(recoveryObserveJsonArtifact('reorged-burn-stale-singleton'), null, 2),
      );
      writeFileSync(join(evidenceDir, 'completed-fresh-checkpoint.json'), JSON.stringify(freshCheckpointJsonArtifact(), null, 2));
      writeFileSync(join(evidenceDir, 'other-fresh-checkpoint.json'), JSON.stringify(freshCheckpointJsonArtifact(), null, 2));
      writeFileSync(
        join(evidenceDir, 'completed-assembly-report.json'),
        JSON.stringify(assemblyReportJsonArtifact(markdown, {
          postSubmitObserveJson: postSubmitObserveTarget,
          freshCheckpoint: freshCheckpointTarget,
        }), null, 2),
      );

      const missingFreshCheckpoint = spawnSync(
        process.execPath,
        [...baseArgs, target],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expect(missingFreshCheckpoint.status).toBe(1);
      expect(missingFreshCheckpoint.stdout).toContain(
        '--fresh-checkpoint-json is required when Rehearsal Assembly Evidence includes a fresh checkpoint',
      );

      const wrongFreshCheckpoint = spawnSync(
        process.execPath,
        [...baseArgs, '--fresh-checkpoint-json', otherFreshCheckpointTarget, target],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expect(wrongFreshCheckpoint.status).toBe(1);
      expect(wrongFreshCheckpoint.stdout).toContain('--fresh-checkpoint-json target must match Fresh checkpoint source target');

      writeFileSync(
        join(evidenceDir, 'completed-fresh-checkpoint.json'),
        JSON.stringify(freshCheckpointJsonArtifact({
          checkpoint: { transactionCheckResult: 'FAIL', broadcast: 'yes' },
        }), null, 2),
      );
      const invalidFreshCheckpoint = spawnSync(
        process.execPath,
        [...baseArgs, '--fresh-checkpoint-json', freshCheckpointTarget, target],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expect(invalidFreshCheckpoint.status).toBe(1);
      expect(invalidFreshCheckpoint.stdout).toContain('freshCheckpoint: checkpoint.transactionCheckResult must be PASS');
      expect(invalidFreshCheckpoint.stdout).toContain('freshCheckpoint: checkpoint.broadcast must be no');

      writeFileSync(join(evidenceDir, 'completed-fresh-checkpoint.json'), JSON.stringify(freshCheckpointJsonArtifact(), null, 2));
      const validFreshCheckpoint = spawnSync(
        process.execPath,
        [...baseArgs, '--fresh-checkpoint-json', freshCheckpointTarget, target],
        { cwd: process.cwd(), encoding: 'utf8' },
      );
      expectLegacyV1LivePreflightQuarantine(validFreshCheckpoint);
    } finally {
      rmSync(evidenceDir, { recursive: true, force: true });
    }
  }, REHEARSAL_PROCESS_TEST_TIMEOUT_MS);


  it('formats blocked rehearsal validation output with structural issues', () => {
    const markdown = completedRehearsal(completePassingRows, { Environment: 'staging' });
    const result = validateRehearsalEvidence(markdown);
    const lines = formatRehearsalValidationTranscriptLines('completed.md', markdown, result);

    expect(lines[0]).toContain('completed.md: Rehearsal evidence BLOCKED:');
    expect(lines).toContain(
      '- Fresh testnet lifecycle: pass requires Session Metadata Environment to be testnet',
    );
    expect(lines.join('\n')).not.toContain('validated target completed.md confirmation policy met PASS');
  });

  it('rejects duplicate lifecycle rows', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      `${completePassingRows}\n| Fresh local devnet lifecycle | fail | artifact://duplicate-devnet | duplicate lifecycle status failed | rerun devnet rehearsal |`,
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Fresh local devnet lifecycle: duplicate lifecycle row');
  });

  it('rejects duplicate required list fields', () => {
    const duplicateFields = completedRehearsal(completePassingRows)
      .replace('- Date: 2026-05-14\n- Operator:', '- Date: 2026-05-14\n- Date: 2026-05-15\n- Operator:')
      .replace(
        '- Clean-checkout checks passed: yes\n- ContextExtension guard result:',
        '- Clean-checkout checks passed: yes\n- Clean-checkout checks passed: yes\n- ContextExtension guard result:',
      )
      .replace(
        '- Classification: pass\n- Publication blockers discovered:',
        '- Classification: pass\n- Classification: pass\n- Publication blockers discovered:',
      )
      .replace(
        '- Release notes updated: yes\n- Required release-note updates:',
        '- Release notes updated: yes\n- Release notes updated: yes\n- Required release-note updates:',
      );

    const result = validateRehearsalEvidence(duplicateFields);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Session Metadata: Date: duplicate required field');
    expect(result.errors).toContain('Preflight Evidence: Clean-checkout checks passed: duplicate required field');
    expect(result.errors).toContain('Reviewer Sign-Off: Classification: duplicate required field');
    expect(result.errors).toContain('Publication Evidence: Release notes updated: duplicate required field');
  });

  it('requires session and reviewer dates to use ISO calendar format', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      { Date: 'May 14 2026' },
      { Date: '2026-02-31' },
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Session Metadata: Date must use YYYY-MM-DD');
    expect(result.errors).toContain('Reviewer Sign-Off: Date must use YYYY-MM-DD');
  });

  it('requires reviewer sign-off dates to be on or after the session date', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      { Date: '2026-05-14' },
      { Date: '2026-05-13' },
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reviewer Sign-Off: Date must not be before Session Metadata Date');
  });

  it('requires session Git commits to use commit SHA format', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      { 'Git commit': 'main' },
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Session Metadata: Git commit must be a 7-40 character Git commit SHA');
  });

  it('keeps an explicit quarantined legacy profile structurally valid as historical evidence', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      {
        'Settlement profile ID': 'legacy-aggregate-v1',
        'Profile activation status': 'QUARANTINED',
        'Evidence purpose': 'historical-diagnostics',
        'Activation evidence target': 'none',
        'Activation ID': 'none',
      },
    ));

    expect(result.status).toBe('PASS');
    expect(result.sessionMetadata).toMatchObject({
      settlementProfileId: 'legacy-aggregate-v1',
      profileActivationStatus: 'QUARANTINED',
      evidencePurpose: 'historical-diagnostics',
      activationEvidenceTarget: 'none',
      activationId: 'none',
    });
  });

  it('rejects partial settlement profile metadata', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      { 'Settlement profile ID': 'authenticated-external-fee-v1' },
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toEqual(expect.arrayContaining([
      'Session Metadata settlement profile.profileActivationStatus is required',
      'Session Metadata settlement profile.evidencePurpose is required',
      'Session Metadata settlement profile.activationEvidenceTarget is required',
      'Session Metadata: Activation ID must be 32-byte hex for an activated settlement profile',
    ]));
  });

  it('requires submission timestamps to use ISO UTC format', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        '- Submission timestamp: 2026-05-14T12:00:00Z',
        '- Submission timestamp: 2026-02-31T12:00:00Z',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Submit And Confirmation Evidence: Submission timestamp must use YYYY-MM-DDTHH:mm:ssZ',
    );
  });

  it('requires submit and confirmation heights to be coherent', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace('- First observed mempool height: 101', '- First observed mempool height: 103')
        .replace('- Confirmation height: 102', '- Confirmation height: 102')
        .replace('- Confirmation count: 1', '- Confirmation count: 0'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Submit And Confirmation Evidence: Confirmation height must be greater than or equal to first observed mempool height',
    );
    expect(result.errors).toContain('Submit And Confirmation Evidence: Confirmation count must be greater than 0');
  });

  it('requires submit and confirmation heights to be numeric', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace('- First observed mempool height: 101', '- First observed mempool height: height-101')
        .replace('- Confirmation height: 102', '- Confirmation height: latest')
        .replace('- Confirmation count: 1', '- Confirmation count: one'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Submit And Confirmation Evidence: First observed mempool height must be a non-negative integer',
    );
    expect(result.errors).toContain(
      'Submit And Confirmation Evidence: Confirmation height must be a non-negative integer',
    );
    expect(result.errors).toContain(
      'Submit And Confirmation Evidence: Confirmation count must be a non-negative integer',
    );
  });

  it('requires fresh testnet confirmation policy evidence to meet the declared threshold', () => {
    const missingPolicy = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace('- Required confirmation count: 1\n', '')
        .replace(`- Confirmation policy met: yes artifact://submit/confirmation-policy finality evidence confirmationsRequired=1 confirmationsObserved=1 ${SETTLEMENT_TX_ID}\n`, ''),
    );
    const underConfirmed = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace('- Required confirmation count: 1', '- Required confirmation count: 2'),
    );
    const policyNotMet = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace(
          `- Confirmation policy met: yes artifact://submit/confirmation-policy finality evidence confirmationsRequired=1 confirmationsObserved=1 ${SETTLEMENT_TX_ID}`,
          `- Confirmation policy met: no artifact://submit/confirmation-policy finality evidence confirmationsRequired=1 confirmationsObserved=1 ${SETTLEMENT_TX_ID}`,
        ),
    );
    const targetlessPolicy = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace(
          `- Confirmation policy met: yes artifact://submit/confirmation-policy finality evidence confirmationsRequired=1 confirmationsObserved=1 ${SETTLEMENT_TX_ID}`,
          '- Confirmation policy met: yes',
        ),
    );
    const zeroRequired = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace('- Required confirmation count: 1', '- Required confirmation count: 0'),
    );
    const nonNumericRequired = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace('- Required confirmation count: 1', '- Required confirmation count: one'),
    );

    expect(missingPolicy.status).toBe('BLOCKED');
    expect(missingPolicy.errors).toContain(
      'Submit And Confirmation Evidence: Required confirmation count is required for Fresh testnet lifecycle pass',
    );
    expect(missingPolicy.errors).toContain(
      'Submit And Confirmation Evidence: Confirmation policy met is required for Fresh testnet lifecycle pass',
    );
    expect(underConfirmed.status).toBe('BLOCKED');
    expect(underConfirmed.errors).toContain(
      'Submit And Confirmation Evidence: Confirmation count must be greater than or equal to Required confirmation count for Fresh testnet lifecycle pass',
    );
    expect(policyNotMet.status).toBe('BLOCKED');
    expect(policyNotMet.errors).toContain(
      'Submit And Confirmation Evidence: Confirmation policy met must be yes for Fresh testnet lifecycle pass',
    );
    expect(targetlessPolicy.status).toBe('BLOCKED');
    expect(targetlessPolicy.errors).toContain(
      'Submit And Confirmation Evidence: Confirmation policy met must include a completed artifact marker or non-template evidence link for Fresh testnet lifecycle pass',
    );
    expect(zeroRequired.status).toBe('BLOCKED');
    expect(zeroRequired.errors).toContain(
      'Submit And Confirmation Evidence: Required confirmation count must be a positive integer',
    );
    expect(nonNumericRequired.status).toBe('BLOCKED');
    expect(nonNumericRequired.errors).toContain(
      'Submit And Confirmation Evidence: Required confirmation count must be a positive integer',
    );
  });

  it('requires fresh testnet confirmation policy evidence to link finality evidence', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- Confirmation policy met: yes artifact://submit/confirmation-policy finality evidence confirmationsRequired=1 confirmationsObserved=1 ${SETTLEMENT_TX_ID}`,
        `- Confirmation policy met: yes artifact://submit/confirmation-policy confirmationsRequired=1 confirmationsObserved=1 ${SETTLEMENT_TX_ID}`,
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Submit And Confirmation Evidence: Confirmation policy met must link completed finality evidence for Fresh testnet lifecycle pass',
    );
  });

  it('requires fresh testnet confirmation policy evidence to bind declared counts and submitted transaction', () => {
    const missingCounts = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- Confirmation policy met: yes artifact://submit/confirmation-policy finality evidence confirmationsRequired=1 confirmationsObserved=1 ${SETTLEMENT_TX_ID}`,
        `- Confirmation policy met: yes artifact://submit/confirmation-policy finality evidence ${SETTLEMENT_TX_ID}`,
      ),
    );
    const mismatchedCounts = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- Confirmation policy met: yes artifact://submit/confirmation-policy finality evidence confirmationsRequired=1 confirmationsObserved=1 ${SETTLEMENT_TX_ID}`,
        `- Confirmation policy met: yes artifact://submit/confirmation-policy finality evidence confirmationsRequired=2 confirmationsObserved=3 ${SETTLEMENT_TX_ID}`,
      ),
    );
    const missingSubmittedTx = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- Confirmation policy met: yes artifact://submit/confirmation-policy finality evidence confirmationsRequired=1 confirmationsObserved=1 ${SETTLEMENT_TX_ID}`,
        '- Confirmation policy met: yes artifact://submit/confirmation-policy finality evidence confirmationsRequired=1 confirmationsObserved=1',
      ),
    );

    expect(missingCounts.status).toBe('BLOCKED');
    expect(missingCounts.errors).toContain(
      'Submit And Confirmation Evidence: Confirmation policy met must cite confirmationsRequired',
    );
    expect(missingCounts.errors).toContain(
      'Submit And Confirmation Evidence: Confirmation policy met must cite confirmationsObserved',
    );
    expect(mismatchedCounts.status).toBe('BLOCKED');
    expect(mismatchedCounts.errors).toContain(
      'Submit And Confirmation Evidence: Confirmation policy met confirmationsRequired must match Required confirmation count',
    );
    expect(mismatchedCounts.errors).toContain(
      'Submit And Confirmation Evidence: Confirmation policy met confirmationsObserved must match Confirmation count',
    );
    expect(missingSubmittedTx.status).toBe('BLOCKED');
    expect(missingSubmittedTx.errors).toContain(
      'Submit And Confirmation Evidence: Confirmation policy met must cite submitted transaction ID',
    );
  });

  it('does not require fresh testnet confirmation policy fields outside a fresh testnet lifecycle pass', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(
        completeLocalDevnetRows,
        { Environment: 'local devnet' },
      )
        .replace('- Required confirmation count: 1\n', '')
        .replace(`- Confirmation policy met: yes artifact://submit/confirmation-policy finality evidence confirmationsRequired=1 confirmationsObserved=1 ${SETTLEMENT_TX_ID}\n`, ''),
    );

    expect(result.errors).not.toContain(
      'Submit And Confirmation Evidence: Required confirmation count is required for Fresh testnet lifecycle pass',
    );
    expect(result.errors).not.toContain(
      'Submit And Confirmation Evidence: Confirmation policy met is required for Fresh testnet lifecycle pass',
    );
  });

  it('requires expected transaction ID to be explicit', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace(
          `- Expected transaction ID: ${SETTLEMENT_TX_ID} artifact://dry-run/expected-tx`,
          '- Expected transaction ID: artifact://dry-run/expected-tx',
        )
        .replace(
          `- Submitted transaction ID: ${SETTLEMENT_TX_ID} artifact://submit/submitted-tx`,
          `- Submitted transaction ID: ${DIFFERENT_SETTLEMENT_TX_ID} artifact://submit/submitted-tx`,
        ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: Expected transaction ID must include exactly one 32-byte hex transaction ID',
    );
  });

  it('requires daemon approval evidence to be present in dry-run evidence', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        '- Daemon approval evidence: N/A - explicit CLI submit workflow artifact://dry-run/daemon-approval-na\n',
        '',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: Daemon approval evidence is required',
    );
  });

  it('blocks daemon-submit-not-planned N/A after submit or confirmation evidence passes', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        '- Daemon approval evidence: N/A - explicit CLI submit workflow artifact://dry-run/daemon-approval-na',
        '- Daemon approval evidence: N/A - daemon submit not planned artifact://dry-run/daemon-approval-na',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: Daemon approval evidence cannot be daemon-submit-not-planned or broadcast-not-approved when submit or confirmation evidence passes',
    );
  });

  it('keeps legacy broadcast-not-approved N/A compatible before live submit', () => {
    const result = validateRehearsalEvidence(
      preBroadcastDryRunRehearsal(preBroadcastDryRunRows()).replace(
        '- Daemon approval evidence: N/A - daemon submit not planned artifact://dry-run/daemon-approval-na',
        '- Daemon approval evidence: N/A - broadcast not approved artifact://dry-run/daemon-approval-na',
      ),
    );

    expect(result.status).toBe('PASS');
    expect(result.errors).toEqual([]);
  });

  it('requires daemon approval evidence to bind expected transaction ID and burn hash', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        '- Daemon approval evidence: N/A - explicit CLI submit workflow artifact://dry-run/daemon-approval-na',
        `- Daemon approval evidence: ${DAEMON_APPROVAL_BINDING_EVIDENCE
          .replace(SETTLEMENT_TX_ID, DIFFERENT_SETTLEMENT_TX_ID)
          .replaceAll(PEG_OUT_BURN_TX_ID, '7'.repeat(64))}`,
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite Expected transaction ID',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite peg-out burn TX ID or ordered batch burn set',
    );
  });

  it('requires daemon approval evidence to cite v2 runtime binding details', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        '- Daemon approval evidence: N/A - explicit CLI submit workflow artifact://dry-run/daemon-approval-na',
        `- Daemon approval evidence: artifact://daemon/approvals.json versioned approval file mode single ` +
          `Expected transaction ID ${SETTLEMENT_TX_ID} burn hash ${PEG_OUT_BURN_TX_ID}`,
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite approval file version 2',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite runtime context binding',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite deployedStateHash',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite non-broadcast aggregate check command',
    );
  });

  it('accepts daemon approval evidence with a rehearsal preflight transcript binding', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        '- Daemon approval evidence: N/A - explicit CLI submit workflow artifact://dry-run/daemon-approval-na',
        `- Daemon approval evidence: ${DAEMON_APPROVAL_BINDING_EVIDENCE}`,
      ),
    );

    expect(result.status).toBe('PASS');
    expect(result.errors).toEqual([]);
  });

  it('rejects contradictory daemon approval check PASS evidence', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        '- Daemon approval evidence: N/A - explicit CLI submit workflow artifact://dry-run/daemon-approval-na',
        `- Daemon approval evidence: ${DAEMON_APPROVAL_BINDING_EVIDENCE.replace(
          '/transactions/check PASS',
          '/transactions/check PASS validation BLOCKED with 1 structural issue',
        )}`,
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: Daemon approval evidence checkEvidence or /transactions/check PASS evidence must be internally positive',
    );
  });

  it('rejects daemon approval check PASS evidence with remaining issue markers', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        '- Daemon approval evidence: N/A - explicit CLI submit workflow artifact://dry-run/daemon-approval-na',
        `- Daemon approval evidence: ${DAEMON_APPROVAL_BINDING_EVIDENCE.replace(
          '/transactions/check PASS',
          '/transactions/check PASS; Remaining issues: unresolved daemon approval blocker',
        )}`,
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: Daemon approval evidence checkEvidence or /transactions/check PASS evidence must be internally positive',
    );
  });

  it('rejects daemon approval check PASS evidence with open or known issue markers', () => {
    for (const issueMarker of [
      'Open issues: unresolved daemon approval blocker',
      'Known issues: unresolved daemon approval blocker',
    ]) {
      const result = validateRehearsalEvidence(
        completedRehearsal(completePassingRows).replace(
          '- Daemon approval evidence: N/A - explicit CLI submit workflow artifact://dry-run/daemon-approval-na',
          `- Daemon approval evidence: ${DAEMON_APPROVAL_BINDING_EVIDENCE.replace(
            '/transactions/check PASS',
            `/transactions/check PASS; ${issueMarker}`,
          )}`,
        ),
      );

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Dry-Run Settlement Evidence: Daemon approval evidence checkEvidence or /transactions/check PASS evidence must be internally positive',
      );
    }
  });

  it('requires daemon approval evidence to cite rehearsal preflight output', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        '- Daemon approval evidence: N/A - explicit CLI submit workflow artifact://dry-run/daemon-approval-na',
        `- Daemon approval evidence: ${DAEMON_APPROVAL_BINDING_EVIDENCE
          .replace('distinct rehearsal:preflight transcript/report', 'operator note')
          .replace('npm run rehearsal:preflight -- --prebroadcast', 'npm run prebroadcast:doctor --')}`,
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite distinct rehearsal:preflight transcript/report',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite npm run rehearsal:preflight',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite --prebroadcast and --approvals targets',
    );
  });

  it('requires daemon batch approval evidence to cite check-batch command', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        '- Daemon approval evidence: N/A - explicit CLI submit workflow artifact://dry-run/daemon-approval-na',
        `- Daemon approval evidence: ${DAEMON_APPROVAL_BINDING_EVIDENCE
          .replace('mode single', 'mode batch')
          .replace('burn hash', 'ordered batch burn set')}`,
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: Daemon approval evidence for batch mode must cite check-batch command',
    );
  });

  it('rejects Windows npm.cmd broadcast-capable daemon approval commands', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        '- Daemon approval evidence: N/A - explicit CLI submit workflow artifact://dry-run/daemon-approval-na',
        `- Daemon approval evidence: ${DAEMON_APPROVAL_BINDING_EVIDENCE
          .replace('npm run settle:aggregate -- check', 'npm.cmd run settle:aggregate -- check')} ` +
          `then npm.cmd run settle:aggregate -- submit ${PEG_OUT_BURN_TX_ID} ${SETTLEMENT_TX_ID}`,
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: Daemon approval evidence must not cite broadcast-capable aggregate commands',
    );
    expect(result.errors).not.toContain(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite non-broadcast aggregate check command',
    );
  });

  it('requires dry-run hashes and burn transaction ID to be explicit 32-byte hex values', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace(
          `- Peg-in event ID or TX ID: ${PEG_IN_EVENT_ID} artifact://dry-run/peg-in`,
          '- Peg-in event ID or TX ID: artifact://dry-run/peg-in',
        )
        .replace(
          `- Peg-out burn TX ID: ${PEG_OUT_BURN_TX_ID} artifact://dry-run/peg-out-burn`,
          '- Peg-out burn TX ID: artifact://dry-run/peg-out-burn',
        )
        .replace(
          `- Sidechain block hash: ${SIDECHAIN_BLOCK_HASH} artifact://dry-run/sidechain-block`,
          `- Sidechain block hash: ${SIDECHAIN_BLOCK_HASH} ${PEG_OUT_BURN_TX_ID} artifact://dry-run/sidechain-block`,
        )
        .replace(
          `- Bridge event root: ${BRIDGE_EVENT_ROOT} artifact://dry-run/event-root`,
          '- Bridge event root: artifact://dry-run/event-root',
        ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: Peg-in event ID or TX ID must include exactly one 32-byte hex value',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: Peg-out burn TX ID must include exactly one 32-byte hex value',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: Sidechain block hash must include exactly one 32-byte hex value',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: Bridge event root must include exactly one 32-byte hex value',
    );
  });

  it('requires submitted transaction ID to match the dry-run transaction ID', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- Submitted transaction ID: ${SETTLEMENT_TX_ID} artifact://submit/submitted-tx`,
        `- Submitted transaction ID: ${DIFFERENT_SETTLEMENT_TX_ID} artifact://submit/submitted-tx`,
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Submit And Confirmation Evidence: Submitted transaction ID must match Expected transaction ID',
    );
  });

  it('requires submit and confirmation lifecycle artifacts to cite the submitted transaction ID', () => {
    const rowsWithoutSubmittedTxBindings = completePassingRows
      .replace(
        `| Settlement submit evidence | pass | ${artifactFor('Settlement submit evidence')} | | |`,
        '| Settlement submit evidence | pass | artifact://rehearsal/settlement-submit-evidence | | |',
      )
      .replace(
        `| Confirmation evidence | pass | ${artifactFor('Confirmation evidence')} | | |`,
        '| Confirmation evidence | pass | artifact://rehearsal/confirmation-evidence | | |',
      );

    const result = validateRehearsalEvidence(completedRehearsal(rowsWithoutSubmittedTxBindings));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Lifecycle Gate Classification: Settlement submit evidence must cite submitted transaction ID',
    );
    expect(result.errors).toContain(
      'Lifecycle Gate Classification: Confirmation evidence must cite submitted transaction ID',
    );
  });

  it('requires pre-broadcast lifecycle artifacts to cite dry-run identifiers', () => {
    const rowsWithoutDryRunBindings = completePassingRows
      .replace(
        `| Peg-in evidence | pass | ${artifactFor('Peg-in evidence')} | | |`,
        '| Peg-in evidence | pass | artifact://rehearsal/peg-in-evidence | | |',
      )
      .replace(
        `| Peg-out burn evidence | pass | ${artifactFor('Peg-out burn evidence')} | | |`,
        '| Peg-out burn evidence | pass | artifact://rehearsal/peg-out-burn-evidence | | |',
      )
      .replace(
        `| Anchor evidence | pass | ${artifactFor('Anchor evidence')} | | |`,
        '| Anchor evidence | pass | artifact://rehearsal/anchor-evidence | | |',
      )
      .replace(
        `| Settlement check evidence | pass | ${artifactFor('Settlement check evidence')} | | |`,
        '| Settlement check evidence | pass | artifact://rehearsal/settlement-check-evidence | | |',
      );

    const result = validateRehearsalEvidence(completedRehearsal(rowsWithoutDryRunBindings));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Lifecycle Gate Classification: Peg-in evidence must cite peg-in event ID or TX ID',
    );
    expect(result.errors).toContain(
      'Lifecycle Gate Classification: Peg-out burn evidence must cite peg-out burn TX ID',
    );
    expect(result.errors).toContain(
      'Lifecycle Gate Classification: Anchor evidence must cite sidechain block hash',
    );
    expect(result.errors).toContain(
      'Lifecycle Gate Classification: Anchor evidence must cite bridge event root',
    );
    expect(result.errors).toContain(
      'Lifecycle Gate Classification: Anchor evidence must cite Ergo anchor height',
    );
    expect(result.errors).toContain(
      'Lifecycle Gate Classification: Settlement check evidence must cite Expected transaction ID',
    );
  });

  it('accepts pre-broadcast testnet dry-run evidence without live submit evidence', () => {
    const result = validateRehearsalEvidence(preBroadcastDryRunRehearsal(preBroadcastDryRunRows()));

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          releaseGate: 'Fresh testnet lifecycle',
          status: 'publication blocker',
        }),
        expect.objectContaining({
          releaseGate: 'Settlement submit evidence',
          status: 'publication blocker',
        }),
        expect.objectContaining({
          releaseGate: 'Confirmation evidence',
          status: 'publication blocker',
        }),
        expect.objectContaining({
          releaseGate: 'Reconciliation evidence',
          status: 'publication blocker',
        }),
      ]),
    );
  });

  it('requires submit box ID fields to include concrete box IDs', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace(
          `- Settlement output box IDs: ${SETTLEMENT_OUTPUT_BOX_IDS} artifact://submit/settlement-output`,
          '- Settlement output box IDs: artifact://submit/settlement-output',
        )
        .replace(
          `- DUP successor box ID: ${DUP_SUCCESSOR_BOX_ID} artifact://submit/dup-successor`,
          '- DUP successor box ID: artifact://submit/dup-successor',
        )
        .replace(
          `- SPV tracker successor box ID: ${SPV_SUCCESSOR_BOX_ID} artifact://submit/spv-successor`,
          `- SPV tracker successor box ID: ${SPV_SUCCESSOR_BOX_ID} ${DUP_SUCCESSOR_BOX_ID} artifact://submit/spv-successor`,
        )
        .replace(
          `- Recipient payout box ID: ${RECIPIENT_PAYOUT_BOX_ID} artifact://submit/recipient-payout`,
          '- Recipient payout box ID: artifact://submit/recipient-payout',
        ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Submit And Confirmation Evidence: Settlement output box IDs must include at least one 32-byte hex box ID',
    );
    expect(result.errors).toContain(
      'Submit And Confirmation Evidence: DUP successor box ID must include exactly one 32-byte hex box ID',
    );
    expect(result.errors).toContain(
      'Submit And Confirmation Evidence: SPV tracker successor box ID must include exactly one 32-byte hex box ID',
    );
    expect(result.errors).toContain(
      'Submit And Confirmation Evidence: Recipient payout box ID must include exactly one 32-byte hex box ID',
    );
  });

  it('validates optional batch recipient payout box IDs when present', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace(
          '- Miner fee output: artifact://submit/miner-fee feeNanoErg=1000000',
          '- Recipient payout box IDs: artifact://submit/recipient-payouts\n- Miner fee output: artifact://submit/miner-fee feeNanoErg=1000000',
        ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Submit And Confirmation Evidence: Recipient payout box IDs must include at least one 32-byte hex box ID',
    );
  });

  it('requires batch burn and recipient payout counts to align one-to-one', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace(
          `- Peg-out burn TX ID: ${PEG_OUT_BURN_TX_ID} artifact://dry-run/peg-out-burn`,
          `- Peg-out burn TX ID: ${PEG_OUT_BURN_TX_ID},${'9'.repeat(64)} artifact://dry-run/peg-out-burn`,
        ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Submit And Confirmation Evidence: Peg-out burn TX ID count must match recipient payout box ID count',
    );
  });

  it('requires settlement outputs to contain successor and recipient payout boxes', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- Settlement output box IDs: ${SETTLEMENT_OUTPUT_BOX_IDS} artifact://submit/settlement-output`,
        `- Settlement output box IDs: ${SETTLEMENT_OUTPUT_BOX_ID} artifact://submit/settlement-output`,
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Submit And Confirmation Evidence: Settlement output box IDs must include DUP successor box ID',
    );
    expect(result.errors).toContain(
      'Submit And Confirmation Evidence: Settlement output box IDs must include SPV tracker successor box ID',
    );
    expect(result.errors).toContain(
      'Submit And Confirmation Evidence: Settlement output box IDs must include every recipient payout box ID',
    );
  });

  it('requires reconciliation evidence to cite every batch recipient payout box ID when listed', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace(
          '- Miner fee output: artifact://submit/miner-fee feeNanoErg=1000000',
          `- Recipient payout box IDs: ${RECIPIENT_PAYOUT_BOX_ID},${RECIPIENT_PAYOUT_BOX_ID_B} artifact://submit/recipient-payouts\n- Miner fee output: artifact://submit/miner-fee feeNanoErg=1000000`,
        ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reconciliation Evidence: No duplicate payout exists for the same burn must cite every recipient payout box ID',
    );
  });

  it('requires reconciliation evidence to cite submitted successor and burn values', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace(
          `- Peg-out burn TX ID: ${PEG_OUT_BURN_TX_ID} artifact://dry-run/peg-out-burn`,
          `- Peg-out burn TX ID: ${'6'.repeat(64)} artifact://dry-run/peg-out-burn`,
        )
        .replace(
          `- Submitted transaction ID: ${SETTLEMENT_TX_ID} artifact://submit/submitted-tx`,
          `- Submitted transaction ID: ${'5'.repeat(64)} artifact://submit/submitted-tx`,
        )
        .replace(
          `- DUP successor box ID: ${DUP_SUCCESSOR_BOX_ID} artifact://submit/dup-successor`,
          `- DUP successor box ID: ${'7'.repeat(64)} artifact://submit/dup-successor`,
        )
        .replace(
          `- SPV tracker successor box ID: ${SPV_SUCCESSOR_BOX_ID} artifact://submit/spv-successor`,
          `- SPV tracker successor box ID: ${'8'.repeat(64)} artifact://submit/spv-successor`,
        )
        .replace(
          `- Recipient payout box ID: ${RECIPIENT_PAYOUT_BOX_ID} artifact://submit/recipient-payout`,
          `- Recipient payout box ID: ${'9'.repeat(64)} artifact://submit/recipient-payout`,
        ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reconciliation Evidence: Peg-out status after reconciliation must cite submitted transaction ID',
    );
    expect(result.errors).toContain(
      'Reconciliation Evidence: DUP history contains only confirmed keys must cite submitted DUP successor box ID',
    );
    expect(result.errors).toContain(
      'Reconciliation Evidence: SPV tracker digest matches confirmed successor must cite submitted SPV tracker successor box ID',
    );
    expect(result.errors).toContain(
      'Reconciliation Evidence: No duplicate payout exists for the same burn must cite recipient payout box ID',
    );
    expect(result.errors).toContain(
      'Reconciliation Evidence: No duplicate payout exists for the same burn must cite peg-out burn TX ID',
    );
  });

  it('requires miner fee output to include a positive nanoERG amount', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        '- Miner fee output: artifact://submit/miner-fee feeNanoErg=1000000',
        '- Miner fee output: artifact://submit/miner-fee feeNanoErg=0',
      ),
    );
    const missingAmount = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        '- Miner fee output: artifact://submit/miner-fee feeNanoErg=1000000',
        '- Miner fee output: artifact://submit/miner-fee',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Submit And Confirmation Evidence: Miner fee output must include exactly one positive feeNanoErg amount',
    );
    expect(missingAmount.status).toBe('BLOCKED');
    expect(missingAmount.errors).toContain(
      'Submit And Confirmation Evidence: Miner fee output must include exactly one positive feeNanoErg amount',
    );
  });

  it('rejects duplicate miner fee amount fields even when one is positive', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        '- Miner fee output: artifact://submit/miner-fee feeNanoErg=1000000',
        '- Miner fee output: artifact://submit/miner-fee feeNanoErg=1000000 feeNanoErg=0',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Submit And Confirmation Evidence: Miner fee output must include exactly one positive feeNanoErg amount',
    );
  });

  it('rejects unsafe miner fee nanoERG amounts', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        '- Miner fee output: artifact://submit/miner-fee feeNanoErg=1000000',
        '- Miner fee output: artifact://submit/miner-fee feeNanoErg=9007199254740993',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Submit And Confirmation Evidence: Miner fee output feeNanoErg must be a positive safe integer',
    );
  });

  it('requires preflight and dry-run heights and counts to be numeric', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace('- Current Ergo height: 100', '- Current Ergo height: latest')
        .replace('- Current sidechain height: 200', '- Current sidechain height: tip')
        .replace('- Sidechain block height: 200', '- Sidechain block height: block-200')
        .replace('- Ergo anchor height: 100', '- Ergo anchor height: anchor')
        .replace('- Aggregate claim count: 1', '- Aggregate claim count: one')
        .replace('- Input count: 3', '- Input count: three')
        .replace('- Output count: 4', '- Output count: four'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Preflight Evidence: Current Ergo height must be a non-negative integer');
    expect(result.errors).toContain('Preflight Evidence: Current sidechain height must be a non-negative integer');
    expect(result.errors).toContain('Dry-Run Settlement Evidence: Sidechain block height must be a non-negative integer');
    expect(result.errors).toContain('Dry-Run Settlement Evidence: Ergo anchor height must be a non-negative integer');
    expect(result.errors).toContain('Dry-Run Settlement Evidence: Aggregate claim count must be a non-negative integer');
    expect(result.errors).toContain('Dry-Run Settlement Evidence: Input count must be a non-negative integer');
    expect(result.errors).toContain('Dry-Run Settlement Evidence: Output count must be a non-negative integer');
  });

  it('rejects unsafe preflight and dry-run heights and counts', () => {
    const unsafeCount = '9007199254740993';
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace(`- Current Ergo height: ${CURRENT_ERGO_HEIGHT_EVIDENCE}`, `- Current Ergo height: ${unsafeCount} artifact://preflight/current-ergo-height`)
        .replace(`- Current sidechain height: ${CURRENT_SIDECHAIN_HEIGHT_EVIDENCE}`, `- Current sidechain height: ${unsafeCount} artifact://preflight/current-sidechain-height`)
        .replace('- Sidechain block height: 200', `- Sidechain block height: ${unsafeCount}`)
        .replace('- Ergo anchor height: 100', `- Ergo anchor height: ${unsafeCount}`)
        .replace('- Aggregate claim count: 1', `- Aggregate claim count: ${unsafeCount}`)
        .replace('- Input count: 3', `- Input count: ${unsafeCount}`)
        .replace('- Output count: 4', `- Output count: ${unsafeCount}`)
        .replace('- ContextExtension key counts per input: 0,4,2', `- ContextExtension key counts per input: 0,${unsafeCount},2`),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Preflight Evidence: Current Ergo height must be a safe integer');
    expect(result.errors).toContain('Preflight Evidence: Current sidechain height must be a safe integer');
    expect(result.errors).toContain('Dry-Run Settlement Evidence: Sidechain block height must be a safe integer');
    expect(result.errors).toContain('Dry-Run Settlement Evidence: Ergo anchor height must be a safe integer');
    expect(result.errors).toContain('Dry-Run Settlement Evidence: Aggregate claim count must be a safe integer');
    expect(result.errors).toContain('Dry-Run Settlement Evidence: Input count must be a safe integer');
    expect(result.errors).toContain('Dry-Run Settlement Evidence: Output count must be a safe integer');
    expect(result.errors).toContain('Dry-Run Settlement Evidence: ContextExtension key counts per input must contain safe integers');
  });

  it('requires current preflight heights to include completed evidence targets', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace(`- Current Ergo height: ${CURRENT_ERGO_HEIGHT_EVIDENCE}`, '- Current Ergo height: 100')
        .replace(
          `- Current sidechain height: ${CURRENT_SIDECHAIN_HEIGHT_EVIDENCE}`,
          '- Current sidechain height: 200 npm run rehearsal:validate command output: PASS',
        ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Preflight Evidence: Current Ergo height must include a link, command, or artifact marker');
    expect(result.errors).toContain(
      'Preflight Evidence: Current sidechain height must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('requires ContextExtension key counts to match input count', () => {
    const malformed = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        '- ContextExtension key counts per input: 0,4,2',
        '- ContextExtension key counts per input: 0,four,2',
      ),
    );
    const mismatched = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        '- ContextExtension key counts per input: 0,4,2',
        '- ContextExtension key counts per input: 0,4',
      ),
    );

    expect(malformed.status).toBe('BLOCKED');
    expect(malformed.errors).toContain(
      'Dry-Run Settlement Evidence: ContextExtension key counts per input must be comma-separated non-negative integers',
    );
    expect(mismatched.status).toBe('BLOCKED');
    expect(mismatched.errors).toContain(
      'Dry-Run Settlement Evidence: ContextExtension key count entries must match Input count',
    );
  });

  it('requires /transactions/check result to link completed PASS output evidence', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- \`/transactions/check\` result: ${TRANSACTIONS_CHECK_PASS_OUTPUT}`,
        '- `/transactions/check` result: pass',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: `/transactions/check` result must include a link, command, or artifact marker',
    );
  });

  it('rejects contradictory /transactions/check PASS output evidence', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- \`/transactions/check\` result: ${TRANSACTIONS_CHECK_PASS_OUTPUT}`,
        `- \`/transactions/check\` result: ${TRANSACTIONS_CHECK_PASS_OUTPUT} validation BLOCKED with 1 structural issue`,
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: `/transactions/check` result must contain internally positive pass, passed, or ok evidence',
    );
  });

  it('rejects /transactions/check PASS output evidence with remaining issue markers', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- \`/transactions/check\` result: ${TRANSACTIONS_CHECK_PASS_OUTPUT}`,
        `- \`/transactions/check\` result: ${TRANSACTIONS_CHECK_PASS_OUTPUT}; Remaining issues: unresolved transaction check blocker`,
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: `/transactions/check` result must contain internally positive pass, passed, or ok evidence',
    );
  });

  it('rejects /transactions/check PASS output evidence with open or known issue markers', () => {
    for (const issueMarker of [
      'Open issues: unresolved transaction check blocker',
      'Known issues: unresolved transaction check blocker',
    ]) {
      const result = validateRehearsalEvidence(
        completedRehearsal(completePassingRows).replace(
          `- \`/transactions/check\` result: ${TRANSACTIONS_CHECK_PASS_OUTPUT}`,
          `- \`/transactions/check\` result: ${TRANSACTIONS_CHECK_PASS_OUTPUT}; ${issueMarker}`,
        ),
      );

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Dry-Run Settlement Evidence: `/transactions/check` result must contain internally positive pass, passed, or ok evidence',
      );
    }
  });

  it('requires ContextExtension guard evidence to identify conformance and fail-closed behavior', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- ContextExtension guard result: ${CONTEXT_EXTENSION_GUARD_EVIDENCE}`,
        '- ContextExtension guard result: artifact://preflight/context-extension',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Preflight Evidence: ContextExtension guard result must identify the ContextExtension guard',
    );
    expect(result.errors).toContain(
      'Preflight Evidence: ContextExtension guard result must cite sigma-rust/JVM conformance coverage',
    );
    expect(result.errors).toContain(
      'Preflight Evidence: ContextExtension guard result must cite fail-closed behavior',
    );
  });

  it('requires dry-run transaction shape counts to be greater than zero', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace('- Aggregate claim count: 1', '- Aggregate claim count: 0')
        .replace('- Input count: 3', '- Input count: 0')
        .replace('- Output count: 4', '- Output count: 0'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Dry-Run Settlement Evidence: Aggregate claim count must be greater than 0');
    expect(result.errors).toContain('Dry-Run Settlement Evidence: Input count must be greater than 0');
    expect(result.errors).toContain('Dry-Run Settlement Evidence: Output count must be greater than 0');
  });

  it('requires dry-run heights not to exceed current preflight heights', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace('- Sidechain block height: 200', '- Sidechain block height: 201')
        .replace('- Ergo anchor height: 100', '- Ergo anchor height: 101'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: Sidechain block height must not exceed Current sidechain height',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: Ergo anchor height must not exceed Current Ergo height',
    );
  });

  it('blocks an uncompleted template with blank statuses', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      REQUIRED_REHEARSAL_GATES
        .map(gate => `| ${gate} | | | | |`)
        .join('\n'),
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh local devnet lifecycle: status must be one of pass, fail, inconclusive, not applicable, publication blocker',
    );
  });

  it('requires blocking notes and next evidence for failed or inconclusive rows', () => {
    const result = validateRehearsalEvidence(completedRehearsal([
      '| Fresh local devnet lifecycle | fail | logs/devnet.md | | |',
      ...REQUIRED_REHEARSAL_GATES
        .filter(gate => gate !== 'Fresh local devnet lifecycle')
        .map(gate => `| ${gate} | pass | ${artifactFor(gate)} | | |`),
    ].join('\n')));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Fresh local devnet lifecycle: fail requires a blocking note');
    expect(result.errors).toContain('Fresh local devnet lifecycle: fail requires next evidence');
  });

  it('requires non-passing lifecycle rows to carry actionable blocker and next-evidence text', () => {
    const result = validateRehearsalEvidence(completedRehearsal([
      '| Fresh local devnet lifecycle | fail | artifact://devnet-failure | reviewed | later |',
      ...REQUIRED_REHEARSAL_GATES
        .filter(gate => gate !== 'Fresh local devnet lifecycle')
        .map(gate => `| ${gate} | pass | ${artifactFor(gate)} | | |`),
    ].join('\n')));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh local devnet lifecycle: fail blocking note must explain blocker, failure, pending evidence, mismatch, incident, or recovery condition',
    );
    expect(result.errors).toContain(
      'Fresh local devnet lifecycle: fail next evidence must state rerun, capture, link, validate, runbook, incident, confirmation, reconciliation, or restore action',
    );
  });

  it('requires lifecycle evidence artifacts to be structured markers', () => {
    const result = validateRehearsalEvidence(completedRehearsal([
      '| Fresh local devnet lifecycle | pass | logs saved locally | | |',
      '| Fresh testnet lifecycle | publication blocker | pending logs | testnet unavailable | rerun on testnet |',
      ...REQUIRED_REHEARSAL_GATES
        .filter(gate => gate !== 'Fresh local devnet lifecycle' && gate !== 'Fresh testnet lifecycle')
        .map(gate => `| ${gate} | pass | ${artifactFor(gate)} | | |`),
    ].join('\n')));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh local devnet lifecycle: pass evidence must be a link, command, or artifact marker',
    );
    expect(result.errors).toContain(
      'Fresh testnet lifecycle: publication blocker evidence must be a link, command, or artifact marker',
    );
  });

  it('rejects targetless command-output notes as lifecycle evidence artifacts', () => {
    const targetlessTestnetEvidence = (
      'npm run rehearsal:validate output PASS Ergo node network testnet ' +
      `peg-out burn TX ID ${PEG_OUT_BURN_TX_ID} ` +
      `sidechain block hash ${SIDECHAIN_BLOCK_HASH} ` +
      `expected transaction ${SETTLEMENT_TX_ID} ` +
      `submitted transaction ${SETTLEMENT_TX_ID}`
    );
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows.replace(artifactFor('Fresh testnet lifecycle'), targetlessTestnetEvidence),
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh testnet lifecycle: pass evidence must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it.each(['artifact://', 'artifact:// ', 'artifact:// completed', 'artifact://completed'])(
    'rejects targetless artifact marker %s as lifecycle evidence artifacts',
    targetlessArtifact => {
      const targetlessArtifactEvidence = (
        `${targetlessArtifact} Ergo node network testnet ` +
        `peg-in event ID ${PEG_IN_EVENT_ID} ` +
        `peg-out burn TX ID ${PEG_OUT_BURN_TX_ID} ` +
        `sidechain block hash ${SIDECHAIN_BLOCK_HASH} ` +
        `bridge event root ${BRIDGE_EVENT_ROOT} ` +
        `expected transaction ${SETTLEMENT_TX_ID} ` +
        `submitted transaction ${SETTLEMENT_TX_ID}`
      );

      const result = validateRehearsalEvidence(completedRehearsal(
        completePassingRows.replace(
          `| Fresh testnet lifecycle | pass | ${artifactFor('Fresh testnet lifecycle')} | | |`,
          `| Fresh testnet lifecycle | pass | ${targetlessArtifactEvidence} | | |`,
        ),
      ));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Fresh testnet lifecycle: pass evidence must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
    },
  );

  it('requires lifecycle evidence artifacts to identify the lifecycle gate', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows
        .replace(
          `| Peg-in evidence | pass | ${artifactFor('Peg-in evidence')} | | |`,
          '| Peg-in evidence | pass | artifact://rehearsal/reviewed.log | | |',
        )
        .replace(
          `| Confirmation evidence | pass | ${artifactFor('Confirmation evidence')} | | |`,
          '| Confirmation evidence | pass | artifact://rehearsal/reviewed.log | | |',
        ),
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Peg-in evidence: evidence artifact must identify peg-in evidence',
    );
    expect(result.errors).toContain(
      'Confirmation evidence: evidence artifact must identify confirmation evidence',
    );
  });

  it('rejects negated or mixed-network fresh testnet lifecycle artifacts', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows.replace(
        `| Fresh testnet lifecycle | pass | ${artifactFor('Fresh testnet lifecycle')} | | |`,
        '| Fresh testnet lifecycle | pass | artifact://fresh-testnet-lifecycle not a testnet lifecycle | | |',
      ),
    ));
    const withoutTestnet = validateRehearsalEvidence(completedRehearsal(
      completePassingRows.replace(
        `| Fresh testnet lifecycle | pass | ${artifactFor('Fresh testnet lifecycle')} | | |`,
        '| Fresh testnet lifecycle | pass | artifact://fresh-testnet-lifecycle without testnet lifecycle access | | |',
      ),
    ));
    const mainChain = validateRehearsalEvidence(completedRehearsal(
      completePassingRows.replace(
        `| Fresh testnet lifecycle | pass | ${artifactFor('Fresh testnet lifecycle')} | | |`,
        '| Fresh testnet lifecycle | pass | artifact://fresh-testnet-lifecycle on main chain rehearsal | | |',
      ),
    ));
    const mainchain = validateRehearsalEvidence(completedRehearsal(
      completePassingRows.replace(
        `| Fresh testnet lifecycle | pass | ${artifactFor('Fresh testnet lifecycle')} | | |`,
        '| Fresh testnet lifecycle | pass | artifact://fresh-testnet-lifecycle Ergo node network testnet mainchain rehearsal | | |',
      ),
    ));
    const notUsingTestnet = validateRehearsalEvidence(completedRehearsal(
      completePassingRows.replace(
        `| Fresh testnet lifecycle | pass | ${artifactFor('Fresh testnet lifecycle')} | | |`,
        '| Fresh testnet lifecycle | pass | artifact://fresh-testnet-lifecycle Ergo node network testnet not using testnet lifecycle | | |',
      ),
    ));
    const notConnectedToTestnet = validateRehearsalEvidence(completedRehearsal(
      completePassingRows.replace(
        `| Fresh testnet lifecycle | pass | ${artifactFor('Fresh testnet lifecycle')} | | |`,
        '| Fresh testnet lifecycle | pass | artifact://fresh-testnet-lifecycle Ergo node network testnet not connected to testnet lifecycle | | |',
      ),
    ));
    const notOnTheTestnet = validateRehearsalEvidence(completedRehearsal(
      completePassingRows.replace(
        `| Fresh testnet lifecycle | pass | ${artifactFor('Fresh testnet lifecycle')} | | |`,
        '| Fresh testnet lifecycle | pass | artifact://fresh-testnet-lifecycle Ergo node network testnet not on the testnet lifecycle | | |',
      ),
    ));
    const withoutTheTestnet = validateRehearsalEvidence(completedRehearsal(
      completePassingRows.replace(
        `| Fresh testnet lifecycle | pass | ${artifactFor('Fresh testnet lifecycle')} | | |`,
        '| Fresh testnet lifecycle | pass | artifact://fresh-testnet-lifecycle Ergo node network testnet without the testnet lifecycle | | |',
      ),
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh testnet lifecycle: evidence artifact must positively identify testnet lifecycle evidence',
    );
    expect(withoutTestnet.status).toBe('BLOCKED');
    expect(withoutTestnet.errors).toContain(
      'Fresh testnet lifecycle: evidence artifact must positively identify testnet lifecycle evidence',
    );
    expect(mainChain.status).toBe('BLOCKED');
    expect(mainChain.errors).toContain(
      'Fresh testnet lifecycle: evidence artifact must positively identify testnet lifecycle evidence',
    );
    expect(mainchain.status).toBe('BLOCKED');
    expect(mainchain.errors).toContain(
      'Fresh testnet lifecycle: evidence artifact must positively identify testnet lifecycle evidence',
    );
    expect(notUsingTestnet.status).toBe('BLOCKED');
    expect(notUsingTestnet.errors).toContain(
      'Fresh testnet lifecycle: evidence artifact must positively identify testnet lifecycle evidence',
    );
    expect(notConnectedToTestnet.status).toBe('BLOCKED');
    expect(notConnectedToTestnet.errors).toContain(
      'Fresh testnet lifecycle: evidence artifact must positively identify testnet lifecycle evidence',
    );
    expect(notOnTheTestnet.status).toBe('BLOCKED');
    expect(notOnTheTestnet.errors).toContain(
      'Fresh testnet lifecycle: evidence artifact must positively identify testnet lifecycle evidence',
    );
    expect(withoutTheTestnet.status).toBe('BLOCKED');
    expect(withoutTheTestnet.errors).toContain(
      'Fresh testnet lifecycle: evidence artifact must positively identify testnet lifecycle evidence',
    );
  });

  it('requires fresh testnet lifecycle artifacts to cite Ergo node network testnet', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows.replace(
        `| Fresh testnet lifecycle | pass | ${artifactFor('Fresh testnet lifecycle')} | | |`,
        '| Fresh testnet lifecycle | pass | artifact://fresh-testnet-lifecycle lifecycle pass | | |',
      ),
    ));
    const unboundTestnet = validateRehearsalEvidence(completedRehearsal(
      completePassingRows.replace(
        `| Fresh testnet lifecycle | pass | ${artifactFor('Fresh testnet lifecycle')} | | |`,
        '| Fresh testnet lifecycle | pass | artifact://fresh-testnet-lifecycle Ergo node network captured | | |',
      ),
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh testnet lifecycle: evidence artifact must cite Ergo node network testnet',
    );
    expect(unboundTestnet.status).toBe('BLOCKED');
    expect(unboundTestnet.errors).toContain(
      'Fresh testnet lifecycle: evidence artifact must cite Ergo node network testnet',
    );
  });

  it('requires fresh testnet lifecycle artifacts to bind the full run identifiers', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows.replace(
        `| Fresh testnet lifecycle | pass | ${artifactFor('Fresh testnet lifecycle')} | | |`,
        '| Fresh testnet lifecycle | pass | artifact://fresh-testnet-lifecycle Ergo node network testnet | | |',
      ),
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh testnet lifecycle: evidence artifact must cite peg-in event ID or TX ID',
    );
    expect(result.errors).toContain(
      'Fresh testnet lifecycle: evidence artifact must cite peg-out burn TX ID',
    );
    expect(result.errors).toContain(
      'Fresh testnet lifecycle: evidence artifact must cite sidechain block hash',
    );
    expect(result.errors).toContain(
      'Fresh testnet lifecycle: evidence artifact must cite bridge event root',
    );
    expect(result.errors).toContain(
      'Fresh testnet lifecycle: evidence artifact must cite Expected transaction ID',
    );
    expect(result.errors).toContain(
      'Fresh testnet lifecycle: evidence artifact must cite submitted transaction ID',
    );
  });

  it.each([
    [
      'pre-broadcast dry-run',
      'artifact://testnet-prebroadcast/fresh-testnet-dry-run Fresh testnet pre-broadcast dry-run evidence',
    ],
    [
      'non-broadcast dry-run',
      'artifact://testnet-non-broadcast-dry-run/fresh-testnet-check-only Fresh testnet non-broadcast dry-run evidence',
    ],
    [
      'check-only dry run',
      'artifact://testnet-check-only/fresh-testnet-lifecycle Fresh testnet check-only dry run evidence',
    ],
    [
      'pre-submit dry run',
      'artifact://testnet-pre-submit/fresh-testnet-lifecycle Fresh testnet pre-submit dry run evidence',
    ],
    [
      'no live submit',
      'artifact://testnet-dry-run/fresh-testnet-lifecycle Fresh testnet dry run evidence no live submit no mempool observed',
    ],
  ])('rejects %s artifacts as fresh testnet lifecycle pass evidence', (_label, artifactPrefix) => {
    const dryRunLifecycleEvidence = (
      `${artifactPrefix} Ergo node network testnet ` +
      `peg-in event ID ${PEG_IN_EVENT_ID} ` +
      `peg-out burn TX ID ${PEG_OUT_BURN_TX_ID} ` +
      `sidechain block hash ${SIDECHAIN_BLOCK_HASH} ` +
      `bridge event root ${BRIDGE_EVENT_ROOT} ` +
      `expected transaction ${SETTLEMENT_TX_ID} ` +
      `submitted transaction ${SETTLEMENT_TX_ID}`
    );

    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows.replace(
        `| Fresh testnet lifecycle | pass | ${artifactFor('Fresh testnet lifecycle')} | | |`,
        `| Fresh testnet lifecycle | pass | ${dryRunLifecycleEvidence} | | |`,
      ),
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh testnet lifecycle: pass evidence must be completed live testnet lifecycle evidence, not pre-broadcast dry-run evidence',
    );
  });

  it('rejects pre-broadcast dry-run artifacts as live submit, confirmation, or reconciliation pass evidence', () => {
    const rows = completePassingRows
      .replace(
        `| Settlement submit evidence | pass | ${artifactFor('Settlement submit evidence')} | | |`,
        `| Settlement submit evidence | pass | artifact://testnet-prebroadcast/settlement-submit-evidence settlement submit evidence submitted transaction ${SETTLEMENT_TX_ID} | | |`,
      )
      .replace(
        `| Confirmation evidence | pass | ${artifactFor('Confirmation evidence')} | | |`,
        `| Confirmation evidence | pass | artifact://testnet-prebroadcast/confirmation-evidence confirmation evidence submitted transaction ${SETTLEMENT_TX_ID} | | |`,
      )
      .replace(
        `| Reconciliation evidence | pass | ${artifactFor('Reconciliation evidence')} | | |`,
        '| Reconciliation evidence | pass | artifact://testnet-prebroadcast/reconciliation-evidence reconciliation evidence | | |',
      );

    const result = validateRehearsalEvidence(completedRehearsal(rows));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Settlement submit evidence: pass evidence must be completed live/recovery evidence, not pre-broadcast dry-run evidence',
    );
    expect(result.errors).toContain(
      'Confirmation evidence: pass evidence must be completed live/recovery evidence, not pre-broadcast dry-run evidence',
    );
    expect(result.errors).toContain(
      'Reconciliation evidence: pass evidence must be completed live/recovery evidence, not pre-broadcast dry-run evidence',
    );
  });

  it('rejects pre-broadcast dry-run artifacts as recovery drill pass evidence', () => {
    const rows = completePassingRows
      .replace(
        `| Failed broadcast / phantom AVL evidence | pass | ${artifactFor('Failed broadcast / phantom AVL evidence')} | | |`,
        (
          '| Failed broadcast / phantom AVL evidence | pass | ' +
          'artifact://testnet-prebroadcast/failed-broadcast-phantom-avl-evidence failed broadcast phantom AVL ' +
          `no phantom DUP AVL history inserted expected transaction ${SETTLEMENT_TX_ID} ` +
          `peg-out burn TX ID ${PEG_OUT_BURN_TX_ID} | | |`
        ),
      )
      .replace(
        `| Reorged burn / stale singleton evidence | pass | ${artifactFor('Reorged burn / stale singleton evidence')} | | |`,
        (
          '| Reorged burn / stale singleton evidence | pass | ' +
          'artifact://testnet-prebroadcast/reorged-burn-stale-singleton-evidence reorged burn stale singleton detected recoverable ' +
          `peg-out burn TX ID ${PEG_OUT_BURN_TX_ID} singleton inventory ${SINGLETON_ID} | | |`
        ),
      )
      .replace(
        `| Backup-restore or reconstructibility evidence | pass | ${artifactFor('Backup-restore or reconstructibility evidence')} | | |`,
        (
          '| Backup-restore or reconstructibility evidence | pass | ' +
          'artifact://testnet-prebroadcast/backup-restore-reconstructibility-evidence backup-restore reconstructibility evidence ' +
          'Backup Restore Evidence Template npm run backup:validate | | |'
        ),
      );

    const result = validateRehearsalEvidence(completedRehearsal(rows));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Failed broadcast / phantom AVL evidence: pass evidence must be completed live/recovery evidence, not pre-broadcast dry-run evidence',
    );
    expect(result.errors).toContain(
      'Reorged burn / stale singleton evidence: pass evidence must be completed live/recovery evidence, not pre-broadcast dry-run evidence',
    );
    expect(result.errors).toContain(
      'Backup-restore or reconstructibility evidence: pass evidence must be completed live/recovery evidence, not pre-broadcast dry-run evidence',
    );
  });

  it('requires composite lifecycle evidence artifacts to preserve every required sub-proof', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows
        .replace(
          `| Failed broadcast / phantom AVL evidence | pass | ${artifactFor('Failed broadcast / phantom AVL evidence')} | | |`,
          '| Failed broadcast / phantom AVL evidence | pass | artifact://rehearsal/failed-broadcast-evidence | | |',
        )
        .replace(
          `| Reorged burn / stale singleton evidence | pass | ${artifactFor('Reorged burn / stale singleton evidence')} | | |`,
          '| Reorged burn / stale singleton evidence | pass | artifact://rehearsal/reorged-burn-evidence | | |',
        )
        .replace(
          `| Backup-restore or reconstructibility evidence | pass | ${artifactFor('Backup-restore or reconstructibility evidence')} | | |`,
          '| Backup-restore or reconstructibility evidence | pass | artifact://rehearsal/backup-restore-reconstructibility-evidence | | |',
        ),
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Failed broadcast / phantom AVL evidence: evidence artifact must identify phantom-AVL evidence',
    );
    expect(result.errors).toContain(
      'Failed broadcast / phantom AVL evidence: evidence artifact must identify that no phantom DUP/AVL history was inserted',
    );
    expect(result.errors).toContain(
      'Reorged burn / stale singleton evidence: evidence artifact must identify stale-singleton evidence',
    );
    expect(result.errors).toContain(
      'Reorged burn / stale singleton evidence: evidence artifact must identify detection evidence',
    );
    expect(result.errors).toContain(
      'Reorged burn / stale singleton evidence: evidence artifact must identify recovery or recoverability evidence',
    );
    expect(result.errors).toContain(
      'Backup-restore or reconstructibility evidence: evidence artifact must identify the Backup Restore Evidence Template',
    );
    expect(result.errors).toContain(
      'Backup-restore or reconstructibility evidence: evidence artifact must identify backup validation',
    );
  });

  it('requires recovery drill evidence to cite rehearsal-specific transaction and singleton values', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows
        .replace(
          artifactFor('Failed broadcast / phantom AVL evidence'),
          'artifact://failed-broadcast-phantom-avl-evidence failed broadcast phantom AVL no phantom DUP AVL history inserted',
        )
        .replace(
          artifactFor('Reorged burn / stale singleton evidence'),
          'artifact://reorged-burn-stale-singleton-evidence reorged burn stale singleton detected recoverable',
        ),
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Failed broadcast / phantom AVL evidence: evidence artifact must cite Expected transaction ID',
    );
    expect(result.errors).toContain(
      'Failed broadcast / phantom AVL evidence: evidence artifact must cite peg-out burn TX ID',
    );
    expect(result.errors).toContain(
      'Reorged burn / stale singleton evidence: evidence artifact must cite peg-out burn TX ID',
    );
    expect(result.errors).toContain(
      'Reorged burn / stale singleton evidence: evidence artifact must cite singleton inventory identifier',
    );
  });

  it('requires recovery drill pass evidence to cite validation command or test artifact evidence', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows
        .replace(
          artifactFor('Failed broadcast / phantom AVL evidence'),
          (
            'artifact://rehearsal/failed-broadcast-phantom-avl-evidence failed broadcast phantom AVL ' +
            `no phantom DUP AVL history inserted expected transaction ${SETTLEMENT_TX_ID} ` +
            `peg-out burn TX ID ${PEG_OUT_BURN_TX_ID}`
          ),
        )
        .replace(
          artifactFor('Reorged burn / stale singleton evidence'),
          (
            'artifact://rehearsal/reorged-burn-stale-singleton-evidence reorged burn stale singleton detected recoverable ' +
            `peg-out burn TX ID ${PEG_OUT_BURN_TX_ID} singleton inventory ${SINGLETON_ID}`
          ),
        ),
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Failed broadcast / phantom AVL evidence: evidence artifact must identify rehearsal validation command evidence',
    );
    expect(result.errors).toContain(
      'Reorged burn / stale singleton evidence: evidence artifact must identify rehearsal validation or test artifact evidence',
    );
  });

  it('requires clean deployment state evidence before a fresh lifecycle can pass', () => {
    const missing = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `\n- Clean deployment state evidence: ${CLEAN_DEPLOYMENT_STATE_EVIDENCE}`,
        '',
      ),
    );
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- Clean deployment state evidence: ${CLEAN_DEPLOYMENT_STATE_EVIDENCE}`,
        '- Clean deployment state evidence: artifact://preflight/testnet-rehearsal',
      ),
    );

    expect(missing.status).toBe('BLOCKED');
    expect(missing.errors).toContain(
      'Preflight Evidence: Clean deployment state evidence is required when a fresh lifecycle passes',
    );
    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Preflight Evidence: Clean deployment state evidence must mention clean deployment state',
    );
    expect(result.errors).toContain(
      'Preflight Evidence: Clean deployment state evidence must mention deployment-state hash or digest',
    );
    expect(result.errors).toContain(
      'Preflight Evidence: Clean deployment state evidence must mention contract IDs',
    );
    expect(result.errors).toContain(
      'Preflight Evidence: Clean deployment state evidence must mention singleton inventory',
    );
  });

  it('requires clean deployment state evidence to include concrete identifiers', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- Clean deployment state evidence: ${CLEAN_DEPLOYMENT_STATE_EVIDENCE}`,
        '- Clean deployment state evidence: artifact://preflight/clean-deployment-state clean deployment state deployment-state hash contract IDs singleton inventory',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Preflight Evidence: Clean deployment state evidence must include a concrete 32-byte deployment-state hash or digest',
    );
    expect(result.errors).toContain(
      'Preflight Evidence: Clean deployment state evidence must include at least one concrete 32-byte contract ID',
    );
    expect(result.errors).toContain(
      'Preflight Evidence: Clean deployment state evidence must include at least one concrete 32-byte singleton inventory identifier',
    );
  });

  it('requires clean deployment state details before fresh local devnet lifecycle can pass', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(
        completeLocalDevnetRows,
        { Environment: 'local devnet' },
      ).replace(
        `- Clean deployment state evidence: ${CLEAN_DEPLOYMENT_STATE_EVIDENCE}`,
        '- Clean deployment state evidence: artifact://preflight/local-devnet-rehearsal',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Preflight Evidence: Clean deployment state evidence must mention clean deployment state',
    );
    expect(result.errors).toContain(
      'Preflight Evidence: Clean deployment state evidence must mention deployment-state hash or digest',
    );
    expect(result.errors).toContain(
      'Preflight Evidence: Clean deployment state evidence must mention contract IDs',
    );
    expect(result.errors).toContain(
      'Preflight Evidence: Clean deployment state evidence must mention singleton inventory',
    );
  });

  it('requires fresh testnet lifecycle pass to match testnet session metadata', () => {
    const localEnvironment = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      { Environment: 'local devnet' },
    ));
    const wrongErgoNetwork = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      { 'Ergo node network': 'mainnet' },
    ));
    const negatedErgoNetwork = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      { 'Ergo node network': 'not a testnet' },
    ).replace(
      BROADCAST_NETWORK_RECONFIRMATION,
      'artifact://broadcast/network Node URL http://127.0.0.1:9053; Ergo node network not a testnet; Sidechain network patched-devnet',
    ));
    const notOnErgoNetwork = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      { 'Ergo node network': 'not on testnet' },
    ).replace(
      BROADCAST_NETWORK_RECONFIRMATION,
      'artifact://broadcast/network Node URL http://127.0.0.1:9053; Ergo node network not on testnet; Sidechain network patched-devnet',
    ));
    const notOnTheErgoNetwork = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      { 'Ergo node network': 'testnet not on the testnet' },
    ).replace(
      BROADCAST_NETWORK_RECONFIRMATION,
      'artifact://broadcast/network Node URL http://127.0.0.1:9053; Ergo node network testnet not on the testnet; Sidechain network patched-devnet',
    ));
    const mainChainErgoNetwork = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      { 'Ergo node network': 'testnet mirror of main chain' },
    ).replace(
      BROADCAST_NETWORK_RECONFIRMATION,
      'artifact://broadcast/network Node URL http://127.0.0.1:9053; Ergo node network testnet mirror of main chain; Sidechain network patched-devnet',
    ));
    const compatibilityMainChainErgoNetwork = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      { 'Ergo node network': 'testnet mirror of \uFF4D\uFF41\uFF49\uFF4E \uFF43\uFF48\uFF41\uFF49\uFF4E' },
    ).replace(
      BROADCAST_NETWORK_RECONFIRMATION,
      'artifact://broadcast/network Node URL http://127.0.0.1:9053; Ergo node network testnet mirror of \uFF4D\uFF41\uFF49\uFF4E \uFF43\uFF48\uFF41\uFF49\uFF4E; Sidechain network patched-devnet',
    ));
    const mainnetSidechainNetwork = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      { 'Sidechain network': 'mainnet' },
    ).replace(
      BROADCAST_NETWORK_RECONFIRMATION,
      'artifact://broadcast/network Node URL http://127.0.0.1:9053; Ergo node network testnet; Sidechain network mainnet',
    ));
    const negatedSidechainNetwork = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      { 'Sidechain network': 'not connected to testnet' },
    ).replace(
      BROADCAST_NETWORK_RECONFIRMATION,
      'artifact://broadcast/network Node URL http://127.0.0.1:9053; Ergo node network testnet; Sidechain network not connected to testnet',
    ));

    expect(localEnvironment.status).toBe('BLOCKED');
    expect(localEnvironment.errors).toContain(
      'Fresh testnet lifecycle: pass requires Session Metadata Environment to be testnet',
    );
    expect(wrongErgoNetwork.status).toBe('BLOCKED');
    expect(wrongErgoNetwork.errors).toContain(
      'Fresh testnet lifecycle: pass requires Session Metadata Ergo node network to identify testnet',
    );
    expect(negatedErgoNetwork.status).toBe('BLOCKED');
    expect(negatedErgoNetwork.errors).toContain(
      'Fresh testnet lifecycle: pass requires Session Metadata Ergo node network to identify testnet',
    );
    expect(notOnErgoNetwork.status).toBe('BLOCKED');
    expect(notOnErgoNetwork.errors).toContain(
      'Fresh testnet lifecycle: pass requires Session Metadata Ergo node network to identify testnet',
    );
    expect(notOnTheErgoNetwork.status).toBe('BLOCKED');
    expect(notOnTheErgoNetwork.errors).toContain(
      'Fresh testnet lifecycle: pass requires Session Metadata Ergo node network to identify testnet',
    );
    expect(mainChainErgoNetwork.status).toBe('BLOCKED');
    expect(mainChainErgoNetwork.errors).toContain(
      'Fresh testnet lifecycle: pass requires Session Metadata Ergo node network to identify testnet',
    );
    expect(compatibilityMainChainErgoNetwork.status).toBe('BLOCKED');
    expect(compatibilityMainChainErgoNetwork.errors).toContain(
      'Fresh testnet lifecycle: pass requires Session Metadata Ergo node network to identify testnet',
    );
    expect(mainnetSidechainNetwork.status).toBe('BLOCKED');
    expect(mainnetSidechainNetwork.errors).toContain(
      'Fresh testnet lifecycle: pass requires Session Metadata Sidechain network to identify patched-devnet, testnet, or an explicit non-mainnet sidechain network',
    );
    expect(negatedSidechainNetwork.status).toBe('BLOCKED');
    expect(negatedSidechainNetwork.errors).toContain(
      'Fresh testnet lifecycle: pass requires Session Metadata Sidechain network to identify patched-devnet, testnet, or an explicit non-mainnet sidechain network',
    );
  });

  it('requires fresh local devnet lifecycle pass to match local-devnet session metadata', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completeLocalDevnetRows,
      { Environment: 'testnet' },
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh local devnet lifecycle: pass requires Session Metadata Environment to be local devnet',
    );
  });

  it('requires passing lifecycle rows to have passing prerequisite gates', () => {
    const result = validateRehearsalEvidence(completedRehearsal([
      '| Fresh local devnet lifecycle | pass | artifact://fresh-local-devnet-lifecycle | | |',
      '| Fresh testnet lifecycle | publication blocker | artifact://testnet-blocker | testnet evidence pending | rerun testnet rehearsal |',
      '| Peg-in evidence | pass | artifact://peg-in-evidence | | |',
      '| Peg-out burn evidence | pass | artifact://peg-out-burn-evidence | | |',
      '| Anchor evidence | pass | artifact://anchor-evidence | | |',
      '| Settlement check evidence | pass | artifact://settlement-check-evidence | | |',
      '| Settlement submit evidence | pass | artifact://settlement-submit-evidence | | |',
      '| Confirmation evidence | publication blocker | artifact://confirmation-blocker | confirmation missing | capture confirmation evidence |',
      '| Reconciliation evidence | pass | artifact://reconciliation-evidence | | |',
      `| Failed broadcast / phantom AVL evidence | pass | ${artifactFor('Failed broadcast / phantom AVL evidence')} | | |`,
      `| Reorged burn / stale singleton evidence | pass | ${artifactFor('Reorged burn / stale singleton evidence')} | | |`,
      '| Backup-restore or reconstructibility evidence | pass | artifact://backup-restore-or-reconstructibility-evidence | | |',
    ].join('\n')));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh local devnet lifecycle: pass requires Confirmation evidence to pass',
    );
    expect(result.errors).toContain(
      'Reconciliation evidence: pass requires Confirmation evidence to pass',
    );
  });

  it('requires settlement submit and confirmation pass states to follow the lifecycle order', () => {
    const result = validateRehearsalEvidence(completedRehearsal([
      '| Fresh local devnet lifecycle | publication blocker | artifact://devnet-blocker | settlement check pending | complete devnet rehearsal evidence |',
      '| Fresh testnet lifecycle | publication blocker | artifact://testnet-blocker | testnet evidence pending | rerun testnet rehearsal |',
      '| Peg-in evidence | pass | artifact://peg-in-evidence | | |',
      '| Peg-out burn evidence | pass | artifact://peg-out-burn-evidence | | |',
      '| Anchor evidence | publication blocker | artifact://anchor-blocker | anchor evidence missing | capture anchor evidence |',
      '| Settlement check evidence | pass | artifact://settlement-check-evidence | | |',
      '| Settlement submit evidence | pass | artifact://settlement-submit-evidence | | |',
      '| Confirmation evidence | pass | artifact://confirmation-evidence | | |',
      '| Reconciliation evidence | publication blocker | artifact://reconciliation-blocker | reconciliation pending | capture reconciliation evidence |',
      `| Failed broadcast / phantom AVL evidence | pass | ${artifactFor('Failed broadcast / phantom AVL evidence')} | | |`,
      `| Reorged burn / stale singleton evidence | pass | ${artifactFor('Reorged burn / stale singleton evidence')} | | |`,
      '| Backup-restore or reconstructibility evidence | pass | artifact://backup-restore-or-reconstructibility-evidence | | |',
    ].join('\n')));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Settlement check evidence: pass requires Anchor evidence to pass',
    );
  });

  it('rejects lifecycle and operational evidence that only points to templates or bare validator commands', () => {
    const templateOnlyEvidence = '[Live Rehearsal Evidence Template](live-rehearsal-template.md), `npm run rehearsal:validate`';
    const result = validateRehearsalEvidence(
      completedRehearsal(
        completeLocalDevnetRows.replace(
          `| Fresh local devnet lifecycle | pass | ${artifactFor('Fresh local devnet lifecycle')} | | |`,
          `| Fresh local devnet lifecycle | pass | ${templateOnlyEvidence} | | |`,
        ),
        { Environment: 'local devnet' },
      )
        .replace(
          `- ContextExtension guard result: ${CONTEXT_EXTENSION_GUARD_EVIDENCE}`,
          `- ContextExtension guard result: ${templateOnlyEvidence}`,
        )
        .replace(
          '- Readiness command re-run after enabling broadcast: artifact://broadcast/readiness-command npm run demo:readiness PASS',
          `- Readiness command re-run after enabling broadcast: ${templateOnlyEvidence}`,
        ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh local devnet lifecycle: pass evidence must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Preflight Evidence: ContextExtension guard result must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: Readiness command re-run after enabling broadcast must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects validation-target bindings as completed operational rehearsal evidence', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(
        completeLocalDevnetRows,
        { Environment: 'local devnet' },
        {},
        {
          'Required release-note updates':
            'validated target artifact://publication/gate-3-release-notes.md completed Gate 3 rehearsal release-note update evidence',
          'Required checklist updates':
            '[validated input](artifact://publication/gate-3-checklist.md) completed Gate 3 checklist update evidence',
        },
      )
        .replace(
          `- ContextExtension guard result: ${CONTEXT_EXTENSION_GUARD_EVIDENCE}`,
          '- ContextExtension guard result: [rehearsal validation target](artifact://preflight/context-extension-guard.log) ContextExtension guard sigma-rust/JVM conformance fail-closed behavior',
        ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Preflight Evidence: ContextExtension guard result must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates requires completed release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates requires completed checklist update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects artifact targets that point to templates or uncompleted evidence', () => {
    const artifactTemplateOnlyEvidence =
      'artifact://docs/live-rehearsal-template.md `npm run rehearsal:validate` PASS';
    const uncompletedPublicationEvidence =
      'artifact://publication/gate-3-release-notes-not-completed.md completed Gate 3 rehearsal release-note update evidence';
    const result = validateRehearsalEvidence(
      completedRehearsal(
        completeLocalDevnetRows.replace(
          `| Fresh local devnet lifecycle | pass | ${artifactFor('Fresh local devnet lifecycle')} | | |`,
          `| Fresh local devnet lifecycle | pass | ${artifactTemplateOnlyEvidence} | | |`,
        ),
        { Environment: 'local devnet' },
        {},
        { 'Required release-note updates': uncompletedPublicationEvidence },
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh local devnet lifecycle: pass evidence must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates requires completed release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects row-named generic artifact targets as completed lifecycle evidence', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(
        completeLocalDevnetRows
          .replace(
            `| Fresh local devnet lifecycle | pass | ${artifactFor('Fresh local devnet lifecycle')} | | |`,
            '| Fresh local devnet lifecycle | pass | artifact://rehearsal/generic-fresh-local-devnet-lifecycle completed local devnet lifecycle evidence | | |',
          )
          .replace(
            `| Peg-in evidence | pass | ${artifactFor('Peg-in evidence')} | | |`,
            `| Peg-in evidence | pass | [completed peg-in evidence](artifact://rehearsal/generic-peg-in-evidence.md) peg-in event ID ${PEG_IN_EVENT_ID} | | |`,
          ),
        { Environment: 'local devnet' },
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh local devnet lifecycle: pass evidence must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Peg-in evidence: pass evidence must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects sample-domain artifact targets as completed rehearsal evidence', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(
        completeLocalDevnetRows
          .replace(
            `| Fresh local devnet lifecycle | pass | ${artifactFor('Fresh local devnet lifecycle')} | | |`,
            '| Fresh local devnet lifecycle | pass | artifact://rehearsal/completed-sample-local-devnet-lifecycle.md completed local devnet lifecycle evidence | | |',
          )
          .replace(
            `| Peg-in evidence | pass | ${artifactFor('Peg-in evidence')} | | |`,
            `| Peg-in evidence | pass | [completed peg-in evidence](artifact://rehearsal/completed-sample-peg-in-evidence.md) peg-in event ID ${PEG_IN_EVENT_ID} | | |`,
          ),
        { Environment: 'local devnet' },
      ).replace(
        `- ContextExtension guard result: ${CONTEXT_EXTENSION_GUARD_EVIDENCE}`,
        '- ContextExtension guard result: artifact://preflight/completed-sample-context-extension-guard.log ContextExtension guard PASS; sigma-rust/JVM conformance covered; fail-closed behavior active',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh local devnet lifecycle: pass evidence must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Peg-in evidence: pass evidence must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Preflight Evidence: ContextExtension guard result must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects claim-escalating artifact targets for completed rehearsal evidence', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(
        completeLocalDevnetRows
          .replace(
            `| Fresh local devnet lifecycle | pass | ${artifactFor('Fresh local devnet lifecycle')} | | |`,
            '| Fresh local devnet lifecycle | pass | artifact://rehearsal/fresh-local-devnet-lifecycle-testnet-production-candidate.md completed local devnet lifecycle evidence | | |',
          )
          .replace(
            `| Peg-in evidence | pass | ${artifactFor('Peg-in evidence')} | | |`,
            `| Peg-in evidence | pass | [completed peg-in evidence](artifact://rehearsal/peg-in-evidence-production-ready-approved.md) peg-in event ID ${PEG_IN_EVENT_ID} | | |`,
          ),
        { Environment: 'local devnet' },
        {},
        {
          'Required release-note updates':
            'artifact://publication/gate-3-release-notes-mainnet-production-certified.md completed Gate 3 rehearsal release-note update evidence',
          'Required checklist updates':
            'artifact://publication/gate-3-checklist-production-ready-approved.md completed Gate 3 checklist update evidence',
        },
      )
        .replace(
          `- ContextExtension guard result: ${CONTEXT_EXTENSION_GUARD_EVIDENCE}`,
          '- ContextExtension guard result: artifact://preflight/context-extension-guard-production-ready-approved.log ContextExtension guard PASS; sigma-rust/JVM conformance covered; fail-closed behavior active',
        )
        .replace(
          'artifact://preflight/clean-deployment-state clean deployment state',
          'artifact://preflight/clean-deployment-state-mainnet-production-certified.log clean deployment state',
        )
        .replace(
          '- Readiness command re-run after enabling broadcast: artifact://broadcast/readiness-command npm run demo:readiness PASS',
          '- Readiness command re-run after enabling broadcast: artifact://broadcast/readiness-command-production-ready-approved.log npm run demo:readiness PASS',
        )
        .replace(
          '- Peg-out status after reconciliation: confirmed artifact://reconciliation/peg-out-status',
          '- Peg-out status after reconciliation: confirmed artifact://reconciliation/peg-out-status-production-ready-approved.log',
        )
        .replace(
          '- Logs archived: artifact://cleanup/logs',
          '- Logs archived: artifact://cleanup/logs-mainnet-production-certified.log',
        ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh local devnet lifecycle: pass evidence must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Peg-in evidence: pass evidence must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Preflight Evidence: ContextExtension guard result must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Preflight Evidence: Clean deployment state evidence must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: Readiness command re-run after enabling broadcast must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Reconciliation Evidence: Peg-out status after reconciliation must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Rollback And Cleanup: Logs archived must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates requires completed release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates requires completed checklist update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it.each([
    'artifact://rehearsal/placeholder-fresh-local-devnet-lifecycle',
    'artifact://rehearsal/todo-fresh-local-devnet-lifecycle',
    'artifact://rehearsal/tbd-fresh-local-devnet-lifecycle',
    'artifact://rehearsal/fixture-fresh-local-devnet-lifecycle',
    'artifact://rehearsal/mock-fresh-local-devnet-lifecycle',
    'artifact://rehearsal/dummy-fresh-local-devnet-lifecycle',
    'artifact://rehearsal/fake-fresh-local-devnet-lifecycle',
    'artifact://rehearsal/stub-fresh-local-devnet-lifecycle',
    'artifact://rehearsal/testdata-fresh-local-devnet-lifecycle',
    'artifact://rehearsal/synthetic-fresh-local-devnet-lifecycle',
    'artifact://rehearsal/simulated-fresh-local-devnet-lifecycle',
    'artifact://rehearsal/sample-evidence-fresh-local-devnet-lifecycle',
    'artifact://rehearsal/example-evidence-fresh-local-devnet-lifecycle',
    '[completed local devnet lifecycle](artifact://rehearsal/placeholder-fresh-local-devnet-lifecycle.md)',
    '[completed local devnet lifecycle](artifact://rehearsal/fixture-fresh-local-devnet-lifecycle.md)',
  ])(
    'rejects non-concrete lifecycle evidence target %s',
    target => {
      const result = validateRehearsalEvidence(
        completedRehearsal(
          completeLocalDevnetRows.replace(
            `| Fresh local devnet lifecycle | pass | ${artifactFor('Fresh local devnet lifecycle')} | | |`,
            `| Fresh local devnet lifecycle | pass | ${target} completed local devnet lifecycle evidence | | |`,
          ),
          { Environment: 'local devnet' },
        ),
      );

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Fresh local devnet lifecycle: pass evidence must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
    },
  );

  it.each([
    {
      variant: 'raw',
      tmpTarget: ['', 'tmp', 'fresh-local-devnet-lifecycle.md'].join('/'),
      driveTarget: ['C:', 'tmp', 'context-extension-guard.log'].join('/'),
      fileTarget: ['file:', '', '', 'C:', 'tmp', 'gate-3-release-notes.md'].join('/'),
      uncTarget: ['', '', 'share-name', 'gate-3-checklist.md'].join('/'),
    },
    {
      variant: 'encoded',
      tmpTarget: '%2Ftmp%2Ffresh-local-devnet-lifecycle.md',
      driveTarget: 'C%3A%2Ftmp%2Fcontext-extension-guard.log',
      fileTarget: 'file%3A%2F%2F%2FC%3A%2Ftmp%2Fgate-3-release-notes.md',
      uncTarget: '%2F%2Fshare-name%2Fgate-3-checklist.md',
    },
    {
      variant: 'embedded encoded',
      tmpTarget: 'artifact://rehearsal/sourceTarget=%2Ftmp%2Ffresh-local-devnet-lifecycle.md',
      driveTarget: 'artifact://rehearsal/sourceTarget=C%3A%2Ftmp%2Fcontext-extension-guard.log',
      fileTarget: 'artifact://rehearsal/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Fgate-3-release-notes.md',
      uncTarget: 'artifact://rehearsal/sourceTarget=%2F%2Fshare-name%2Fgate-3-checklist.md',
    },
  ])(
    'rejects $variant local-only evidence targets for completed rehearsal evidence',
    ({ tmpTarget, driveTarget, fileTarget, uncTarget }) => {
      const result = validateRehearsalEvidence(
        completedRehearsal(
          completeLocalDevnetRows.replace(
            `| Fresh local devnet lifecycle | pass | ${artifactFor('Fresh local devnet lifecycle')} | | |`,
            `| Fresh local devnet lifecycle | pass | [completed local devnet lifecycle evidence](${tmpTarget}) | | |`,
          ),
          { Environment: 'local devnet' },
          {},
          {
            'Required release-note updates':
              `[completed Gate 3 rehearsal release-note update evidence](${fileTarget})`,
            'Required checklist updates':
              `[completed Gate 3 checklist update evidence](${uncTarget})`,
          },
        ).replace(
          `- ContextExtension guard result: ${CONTEXT_EXTENSION_GUARD_EVIDENCE}`,
          `- ContextExtension guard result: [ContextExtension guard evidence](${driveTarget}) ContextExtension guard sigma-rust/JVM conformance fail-closed behavior`,
        ),
      );

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Fresh local devnet lifecycle: pass evidence must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
      expect(result.errors).toContain(
        'Preflight Evidence: ContextExtension guard result must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
      expect(result.errors).toContain(
        'Publication Evidence: Required release-note updates requires completed release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
      expect(result.errors).toContain(
        'Publication Evidence: Required checklist updates requires completed checklist update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
    },
  );

  it('rejects sensitive or runtime targets for completed rehearsal evidence', () => {
    for (const target of [
      'relayer/.env',
      'relayer/private-key.md',
      'relayer/wallet-mnemonic.md',
      'relayer/bridge-state.sqlite',
    ]) {
      const result = validateRehearsalEvidence(
        completedRehearsal(
          completeLocalDevnetRows.replace(
            `| Fresh local devnet lifecycle | pass | ${artifactFor('Fresh local devnet lifecycle')} | | |`,
            `| Fresh local devnet lifecycle | pass | [completed local devnet lifecycle evidence](${target}) | | |`,
          ),
          { Environment: 'local devnet' },
        ),
      );

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Fresh local devnet lifecycle: pass evidence must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
    }
  });

  it('accepts concrete lifecycle artifact names that mention sample size or template removal', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(
        completeLocalDevnetRows
          .replace(
            `| Fresh local devnet lifecycle | pass | ${artifactFor('Fresh local devnet lifecycle')} | | |`,
            '| Fresh local devnet lifecycle | pass | artifact://rehearsal/sample-size-analysis-local-devnet-lifecycle completed local devnet lifecycle evidence | | |',
          )
          .replace(
            `| Peg-in evidence | pass | ${artifactFor('Peg-in evidence')} | | |`,
            `| Peg-in evidence | pass | [template removal audit](artifact://rehearsal/template-removal-audit-peg-in-evidence.md) peg-in event ID ${PEG_IN_EVENT_ID} | | |`,
          ),
        { Environment: 'local devnet' },
      ),
    );

    expect(result.status).toBe('PASS');
  });

  it('rejects targetless command-output notes as operational evidence fields', () => {
    const targetlessContextExtension =
      'npm run rehearsal:validate command output: PASS ContextExtension guard sigma-rust/JVM conformance fail-closed behavior';
    const targetlessCleanDeploymentState =
      `npm run rehearsal:validate command output: PASS clean deployment state ` +
      `deployment-state hash=${DEPLOYMENT_STATE_HASH}; contract IDs=${CONTRACT_ID}; ` +
      `singleton inventory=${SINGLETON_ID}`;
    const targetlessBroadcastPolicy =
      'npm run demo:readiness command output: PASS Broadcast policy: PASS';
    const targetlessReconciliation =
      `confirmed npm run reconciliation:validate command output: PASS ${SETTLEMENT_TX_ID}`;
    const targetlessLogs = 'npm run rehearsal:validate command output: PASS logs archived';

    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace(
          `- ContextExtension guard result: ${CONTEXT_EXTENSION_GUARD_EVIDENCE}`,
          `- ContextExtension guard result: ${targetlessContextExtension}`,
        )
        .replace(
          `- Clean deployment state evidence: ${CLEAN_DEPLOYMENT_STATE_EVIDENCE}`,
          `- Clean deployment state evidence: ${targetlessCleanDeploymentState}`,
        )
        .replace(
          `- Broadcast policy reports \`PASS\`: ${BROADCAST_POLICY_PASS_OUTPUT}`,
          `- Broadcast policy reports \`PASS\`: ${targetlessBroadcastPolicy}`,
        )
        .replace(
          `- Peg-out status after reconciliation: confirmed artifact://reconciliation/peg-out-status ${SETTLEMENT_TX_ID}`,
          `- Peg-out status after reconciliation: ${targetlessReconciliation}`,
        )
        .replace(
          '- Logs archived: artifact://cleanup/logs',
          `- Logs archived: ${targetlessLogs}`,
        ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Preflight Evidence: ContextExtension guard result must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Preflight Evidence: Clean deployment state evidence must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: Broadcast policy reports `PASS` must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Reconciliation Evidence: Peg-out status after reconciliation must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Rollback And Cleanup: Logs archived must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('requires a scope note for not-applicable rows', () => {
    const result = validateRehearsalEvidence(completedRehearsal([
      '| Fresh testnet lifecycle | not applicable | | | |',
      ...REQUIRED_REHEARSAL_GATES
        .filter(gate => gate !== 'Fresh testnet lifecycle')
        .map(gate => `| ${gate} | pass | ${artifactFor(gate)} | | |`),
    ].join('\n')));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh testnet lifecycle: not applicable requires a blocking note explaining scope',
    );
  });

  it('requires not-applicable rows to explain scope explicitly', () => {
    const result = validateRehearsalEvidence(completedRehearsal([
      '| Fresh testnet lifecycle | not applicable | | reviewed | |',
      ...REQUIRED_REHEARSAL_GATES
        .filter(gate => gate !== 'Fresh testnet lifecycle')
        .map(gate => `| ${gate} | pass | ${artifactFor(gate)} | | |`),
    ].join('\n')));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh testnet lifecycle: not applicable blocking note must explain scope, blocker, missing evidence, incident, or deferred environment',
    );
  });

  it('requires completed session metadata with controlled values', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      {
        Date: '',
        Environment: 'mainnet',
        'Release level being evaluated': 'production',
        'Broadcast mode at start': 'maybe',
      },
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Session Metadata: Date is required');
    expect(result.errors).toContain('Session Metadata: Environment must be one of local devnet, staging, testnet');
    expect(result.errors).toContain(
      'Session Metadata: Release level being evaluated must be one of validated PoC, institutional reference, production deployment candidate',
    );
    expect(result.errors).toContain('Session Metadata: Broadcast mode at start must be disabled or enabled');
  });

  it('requires production deployment candidate rehearsals to be testnet-scoped', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      {
        Environment: 'staging',
        'Release level being evaluated': 'production deployment candidate',
      },
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Session Metadata: production deployment candidate requires Environment testnet',
    );
  });

  it('requires rehearsal evidence to start and finish with broadcast disabled', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      {
        'Broadcast mode at start': 'enabled',
        'Broadcast mode at end': 'enabled',
      },
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Session Metadata: Broadcast mode at start must be disabled before rehearsal evidence can pass',
    );
    expect(result.errors).toContain(
      'Session Metadata: Broadcast mode at end must be disabled before rehearsal evidence can pass',
    );
  });

  it('requires preflight broadcast policy evidence to prove non-broadcast state', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- Broadcast policy result: ${PREFLIGHT_BROADCAST_POLICY_DISABLED_OUTPUT}`,
        '- Broadcast policy result: artifact://preflight/broadcast-policy Broadcast policy PASS: broadcast disabled by BRIDGE_BROADCAST_ENABLED=false; hidden BRIDGE_BROADCAST_ENABLED=true in another shell',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Preflight Evidence: Broadcast policy result must not include enabled or approved broadcast indicators before the live broadcast window',
    );
  });

  it('blocks certification-family broadcast enablement indicators in preflight policy evidence', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- Broadcast policy result: ${PREFLIGHT_BROADCAST_POLICY_DISABLED_OUTPUT}`,
        '- Broadcast policy result: artifact://preflight/broadcast-policy Broadcast policy PASS: broadcast disabled by BRIDGE_BROADCAST_ENABLED=false; reviewer certifies live broadcast approval',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Preflight Evidence: Broadcast policy result must not include enabled or approved broadcast indicators before the live broadcast window',
    );
  });

  it('requires broadcast reviewer approval to name the session reviewer', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- Reviewer approval recorded: artifact://broadcast/reviewer-approval reviewer-a explicit live broadcast approval for Expected transaction ID ${SETTLEMENT_TX_ID}`,
        '- Reviewer approval recorded: artifact://broadcast/reviewer-approval',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: Reviewer approval recorded must name the Session Metadata Reviewer',
    );
  });

  it('requires broadcast reviewer approval to be explicit and tied to the expected transaction', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- Reviewer approval recorded: artifact://broadcast/reviewer-approval reviewer-a explicit live broadcast approval for Expected transaction ID ${SETTLEMENT_TX_ID}`,
        '- Reviewer approval recorded: artifact://broadcast/reviewer-approval reviewer-a approval',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: Reviewer approval recorded must state explicit live broadcast approval',
    );
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: Reviewer approval recorded must cite Expected transaction ID',
    );
  });

  it('rejects negated reviewer approval before a live broadcast window can pass', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- Reviewer approval recorded: artifact://broadcast/reviewer-approval reviewer-a explicit live broadcast approval for Expected transaction ID ${SETTLEMENT_TX_ID}`,
        `- Reviewer approval recorded: artifact://broadcast/reviewer-approval reviewer-a did not grant explicit live broadcast approval for Expected transaction ID ${SETTLEMENT_TX_ID}`,
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: Reviewer approval recorded must not negate explicit live broadcast approval',
    );
  });

  it('requires explicit user approval evidence before a live broadcast window can pass', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- User approval recorded: ${USER_BROADCAST_APPROVAL_EVIDENCE}\n`,
        '',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Broadcast Enablement Evidence: User approval recorded is required');
  });

  it('rejects generic user approval evidence for a live broadcast window', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- User approval recorded: ${USER_BROADCAST_APPROVAL_EVIDENCE}`,
        '- User approval recorded: artifact://broadcast/user-approval generic approval',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: User approval recorded must state explicit live broadcast approval',
    );
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: User approval recorded must cite Expected transaction ID',
    );
  });

  it('rejects negated user approval before a live broadcast window can pass', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- User approval recorded: ${USER_BROADCAST_APPROVAL_EVIDENCE}`,
        `- User approval recorded: artifact://broadcast/user-approval user did not grant explicit live broadcast approval for Expected transaction ID ${SETTLEMENT_TX_ID}`,
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: User approval recorded must not negate explicit live broadcast approval',
    );
  });

  it('requires broadcast network reconfirmation to match session networks', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- Node URL and network re-confirmed: ${BROADCAST_NETWORK_RECONFIRMATION}`,
        '- Node URL and network re-confirmed: artifact://broadcast/network',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: Node URL and network re-confirmed must cite Node URL',
    );
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: Node URL and network re-confirmed must name Session Metadata Ergo node network',
    );
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: Node URL and network re-confirmed must name Session Metadata Sidechain network',
    );
  });

  it('requires broadcast network reconfirmation to name the session network fields', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- Node URL and network re-confirmed: ${BROADCAST_NETWORK_RECONFIRMATION}`,
        '- Node URL and network re-confirmed: artifact://broadcast/network testnet patched-devnet',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: Node URL and network re-confirmed must cite Node URL',
    );
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: Node URL and network re-confirmed must name Session Metadata Ergo node network',
    );
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: Node URL and network re-confirmed must name Session Metadata Sidechain network',
    );
  });

  it('rejects negated testnet wording in broadcast network reconfirmation', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- Node URL and network re-confirmed: ${BROADCAST_NETWORK_RECONFIRMATION}`,
        '- Node URL and network re-confirmed: artifact://broadcast/network Node URL http://127.0.0.1:9053; Ergo node network testnet not using testnet; Sidechain network patched-devnet',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: Node URL and network re-confirmed must not include negated or mixed testnet network wording',
    );
  });

  it('requires scoped-shell broadcast enablement evidence, not a bare yes', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- \`BRIDGE_BROADCAST_ENABLED=true\` set only in the intended shell: ${BROADCAST_SCOPED_SHELL_EVIDENCE}`,
        '- `BRIDGE_BROADCAST_ENABLED=true` set only in the intended shell: yes',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: `BRIDGE_BROADCAST_ENABLED=true` set only in the intended shell must include a link, command, or artifact marker',
    );
  });

  it('requires scoped-shell broadcast enablement evidence to cite the exact env var', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- \`BRIDGE_BROADCAST_ENABLED=true\` set only in the intended shell: ${BROADCAST_SCOPED_SHELL_EVIDENCE}`,
        '- `BRIDGE_BROADCAST_ENABLED=true` set only in the intended shell: artifact://broadcast/scoped-shell yes; intended shell PowerShell process only',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: `BRIDGE_BROADCAST_ENABLED=true` set only in the intended shell must cite BRIDGE_BROADCAST_ENABLED=true',
    );
  });

  it('requires the post-enable readiness command evidence to cite demo readiness PASS output', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        '- Readiness command re-run after enabling broadcast: artifact://broadcast/readiness-command npm run demo:readiness PASS',
        '- Readiness command re-run after enabling broadcast: artifact://broadcast/readiness-command',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: Readiness command re-run after enabling broadcast must cite npm run demo:readiness',
    );
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: Readiness command re-run after enabling broadcast must contain PASS',
    );
  });

  it('requires broadcast policy and live-readiness PASS rows to cite demo-readiness check output', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace(
          `- Broadcast policy reports \`PASS\`: ${BROADCAST_POLICY_PASS_OUTPUT}`,
          '- Broadcast policy reports `PASS`: artifact://broadcast/broadcast-policy PASS',
        )
        .replace(
          `- Live settlement readiness reports \`PASS\`: ${LIVE_SETTLEMENT_PASS_OUTPUT}`,
          '- Live settlement readiness reports `PASS`: artifact://broadcast/live-readiness PASS',
        ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: Broadcast policy reports `PASS` must cite npm run demo:readiness',
    );
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: Broadcast policy reports `PASS` must cite Broadcast policy output',
    );
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: Live settlement readiness reports `PASS` must cite npm run demo:readiness',
    );
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: Live settlement readiness reports `PASS` must cite Live settlement signing output',
    );
  });

  it('still rejects bare PASS rows without completed output markers', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace(
          `- Broadcast policy reports \`PASS\`: ${BROADCAST_POLICY_PASS_OUTPUT}`,
          '- Broadcast policy reports `PASS`: PASS',
        )
        .replace(
          `- Live settlement readiness reports \`PASS\`: ${LIVE_SETTLEMENT_PASS_OUTPUT}`,
          '- Live settlement readiness reports `PASS`: PASS',
        ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: Broadcast policy reports `PASS` must include a link, command, or artifact marker',
    );
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: Live settlement readiness reports `PASS` must include a link, command, or artifact marker',
    );
  });

  it('requires named evidence fields in operational sections', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace(`- ContextExtension guard result: ${CONTEXT_EXTENSION_GUARD_EVIDENCE}`, '- ContextExtension guard result:')
        .replace(
          `- Reviewer approval recorded: artifact://broadcast/reviewer-approval reviewer-a explicit live broadcast approval for Expected transaction ID ${SETTLEMENT_TX_ID}`,
          '- Reviewer approval recorded:',
        )
        .replace(`- Submitted transaction ID: ${SETTLEMENT_TX_ID} artifact://submit/submitted-tx`, '- Submitted transaction ID:')
        .replace(
          `- DUP history contains only confirmed keys: yes artifact://reconciliation/dup-history ${DUP_SUCCESSOR_BOX_ID}`,
          '- DUP history contains only confirmed keys:',
        )
        .replace('- Broadcast disabled in all shells: yes', '- Broadcast disabled in all shells:'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Preflight Evidence: ContextExtension guard result is required');
    expect(result.errors).toContain('Broadcast Enablement Evidence: Reviewer approval recorded is required');
    expect(result.errors).toContain('Submit And Confirmation Evidence: Submitted transaction ID is required');
    expect(result.errors).toContain('Reconciliation Evidence: DUP history contains only confirmed keys is required');
    expect(result.errors).toContain('Rollback And Cleanup: Broadcast disabled in all shells is required');
  });

  it('requires chain-state evidence fields to use structured markers', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace(`- Peg-in event ID or TX ID: ${PEG_IN_EVENT_ID} artifact://dry-run/peg-in`, '- Peg-in event ID or TX ID: tx-peg-in')
        .replace(`- Submitted transaction ID: ${SETTLEMENT_TX_ID} artifact://submit/submitted-tx`, '- Submitted transaction ID: tx-submitted')
        .replace(`- DUP successor box ID: ${DUP_SUCCESSOR_BOX_ID} artifact://submit/dup-successor`, '- DUP successor box ID: box-dup')
        .replace('- Failed-event queue: artifact://reconciliation/failed-event-queue', '- Failed-event queue: empty')
        .replace(
          '- Incident or regression issue opened if needed: artifact://cleanup/incident-or-regression',
          '- Incident or regression issue opened if needed: not needed',
        ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Evidence: Peg-in event ID or TX ID must include a link, command, or artifact marker',
    );
    expect(result.errors).toContain(
      'Submit And Confirmation Evidence: Submitted transaction ID must include a link, command, or artifact marker',
    );
    expect(result.errors).toContain(
      'Submit And Confirmation Evidence: Submitted transaction ID must include exactly one 32-byte hex transaction ID',
    );
    expect(result.errors).toContain(
      'Submit And Confirmation Evidence: DUP successor box ID must include a link, command, or artifact marker',
    );
    expect(result.errors).toContain(
      'Reconciliation Evidence: Failed-event queue must include a link, command, or artifact marker',
    );
    expect(result.errors).toContain(
      'Rollback And Cleanup: Incident or regression issue opened if needed must include a link, command, or artifact marker',
    );
  });

  it('rejects ambiguous critical lifecycle outcomes', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace('- Clean-checkout checks passed: yes', '- Clean-checkout checks passed: looked ok')
        .replace(`- \`/transactions/check\` result: ${TRANSACTIONS_CHECK_PASS_OUTPUT}`, '- `/transactions/check` result: maybe')
        .replace(
          `- \`BRIDGE_BROADCAST_ENABLED=true\` set only in the intended shell: ${BROADCAST_SCOPED_SHELL_EVIDENCE}`,
          '- `BRIDGE_BROADCAST_ENABLED=true` set only in the intended shell: intended',
        )
        .replace(
          `- Broadcast policy reports \`PASS\`: ${BROADCAST_POLICY_PASS_OUTPUT}`,
          '- Broadcast policy reports `PASS`: accepted',
        )
        .replace(
          `- Live settlement readiness reports \`PASS\`: ${LIVE_SETTLEMENT_PASS_OUTPUT}`,
          '- Live settlement readiness reports `PASS`: accepted',
        )
        .replace('- Peg-out status after reconciliation: confirmed', '- Peg-out status after reconciliation: observed')
        .replace('- DUP history contains only confirmed keys: yes', '- DUP history contains only confirmed keys: probably')
        .replace('- SPV tracker digest matches confirmed successor: yes', '- SPV tracker digest matches confirmed successor: probably')
        .replace('- No duplicate payout exists for the same burn: yes', '- No duplicate payout exists for the same burn: probably')
        .replace('- Manual repair performed: no', '- Manual repair performed: none needed')
        .replace('- Broadcast disabled in all shells: yes', '- Broadcast disabled in all shells: probably')
        .replace(
          '- Runtime state files preserved but not staged: yes',
          '- Runtime state files preserved but not staged: not checked',
        )
        .replace('- Regression test or runbook update needed: no', '- Regression test or runbook update needed: n/a'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Preflight Evidence: Clean-checkout checks passed must be yes, pass, or passed');
    expect(result.errors).toContain('Dry-Run Settlement Evidence: `/transactions/check` result must contain pass, passed, or ok');
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: `BRIDGE_BROADCAST_ENABLED=true` set only in the intended shell must contain yes',
    );
    expect(result.errors).toContain(
      'Broadcast Enablement Evidence: `BRIDGE_BROADCAST_ENABLED=true` set only in the intended shell must cite BRIDGE_BROADCAST_ENABLED=true',
    );
    expect(result.errors).toContain('Broadcast Enablement Evidence: Broadcast policy reports `PASS` must contain PASS');
    expect(result.errors).toContain('Broadcast Enablement Evidence: Live settlement readiness reports `PASS` must contain PASS');
    expect(result.errors).toContain('Reconciliation Evidence: Peg-out status after reconciliation must be confirmed or settled');
    expect(result.errors).toContain('Reconciliation Evidence: DUP history contains only confirmed keys must be yes');
    expect(result.errors).toContain('Reconciliation Evidence: SPV tracker digest matches confirmed successor must be yes');
    expect(result.errors).toContain('Reconciliation Evidence: No duplicate payout exists for the same burn must be yes');
    expect(result.errors).toContain('Reconciliation Evidence: Manual repair performed must be yes or no');
    expect(result.errors).toContain('Rollback And Cleanup: Broadcast disabled in all shells must be yes');
    expect(result.errors).toContain('Rollback And Cleanup: Runtime state files preserved but not staged must be yes');
    expect(result.errors).toContain('Rollback And Cleanup: Regression test or runbook update needed must be yes or no');
  });

  it('requires reviewer sign-off classification and reviewer identity', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      {},
      {
        Classification: 'approved',
        Reviewer: '',
      },
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reviewer Sign-Off: Reviewer is required');
    expect(result.errors).toContain('Reviewer Sign-Off: Classification must be one of pass, fail, inconclusive');
  });

  it('requires reviewer sign-off identity to match session metadata', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      {},
      {
        Reviewer: 'reviewer-b',
      },
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reviewer Sign-Off: Reviewer must match Session Metadata Reviewer');
  });

  it('requires publication evidence before Gate 3 rehearsal evidence can pass', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      {},
      {},
      {
        'Release notes updated': 'no',
        'Required release-note updates': 'release notes reviewed',
        'Pending Evidence Register updated': 'no',
        'Required checklist updates': 'checklist reviewed',
      },
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Evidence: Release notes updated must be yes before rehearsal evidence can pass',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Pending Evidence Register updated must be yes before rehearsal evidence can pass',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates must include completed Gate 3 rehearsal release-note update evidence',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates must include completed Gate 3 checklist update evidence',
    );
  });

  it('rejects targetless command-output notes for Gate 3 publication update evidence', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      {},
      {},
      {
        'Required release-note updates':
          'completed Gate 3 rehearsal release-note update evidence: npm run rehearsal:validate command output: PASS',
        'Required checklist updates':
          'completed Gate 3 checklist update evidence: npm run rehearsal:validate command output: PASS',
      },
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates requires completed release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates requires completed checklist update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects Gate 3 publication update evidence kinds hidden inside longer labels', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      {},
      {},
      {
        'Required release-note updates':
          'artifact://publication/gate-3-release-notes.md draft completed Gate 3 rehearsal release-note update evidence; Production-ready claim allowed by this rehearsal: no; Testnet production-candidate claim allowed by this rehearsal: no',
        'Required checklist updates':
          'artifact://publication/gate-3-checklist.md candidate completed Gate 3 checklist update evidence; Production-ready claim allowed by this rehearsal: no; Testnet production-candidate claim allowed by this rehearsal: no',
      },
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates must include completed Gate 3 rehearsal release-note update evidence',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates must include completed Gate 3 checklist update evidence',
    );
  });

  it('accepts compatibility-normalized Gate 3 publication update evidence kinds', () => {
    const gateLabel = '\uFF27\uFF41\uFF54\uFF45';
    const gateNumber = '\uFF13';
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      {},
      {},
      {
        'Required release-note updates':
          `artifact://publication/gate-3-release-notes.md completed ${gateLabel} ${gateNumber} rehearsal release-note update evidence; Production-ready claim allowed by this rehearsal: no; Testnet production-candidate claim allowed by this rehearsal: no`,
        'Required checklist updates':
          `artifact://publication/gate-3-checklist.md completed ${gateLabel} ${gateNumber} checklist update evidence; Production-ready claim allowed by this rehearsal: no; Testnet production-candidate claim allowed by this rehearsal: no`,
      },
    ));

    expect(result.status).toBe('PASS');
  });

  it('requires distinct Gate 3 release-note and checklist publication evidence targets', () => {
    const reusedTarget =
      'artifact://publication/completed-gate-3-publication-update.md';
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      {},
      {},
      {
        'Required release-note updates':
          `${reusedTarget} completed Gate 3 rehearsal release-note update evidence`,
        'Required checklist updates':
          `${reusedTarget} completed Gate 3 checklist update evidence`,
      },
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note and checklist updates must use distinct completed Gate 3 publication evidence targets',
    );
  });

  it('rejects contradictory Gate 3 publication update evidence markers', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      {},
      {},
      {
        'Required release-note updates':
          'artifact://publication/gate-3-release-notes.md completed Gate 3 rehearsal release-note update evidence; rehearsal:validate PASS exit code 0; publication update follow-up FAIL exit code 1',
        'Required checklist updates':
          'artifact://publication/gate-3-checklist.md completed Gate 3 checklist update evidence; publication checklist validation PASS errors=1 structural issues=1',
      },
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates must not include contradictory rehearsal failure markers',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates must not include contradictory rehearsal failure markers',
    );

    const compatibilityResult = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      {},
      {},
      {
        'Required release-note updates':
          'artifact://publication/gate-3-release-notes.md completed Gate 3 rehearsal release-note update evidence; rehearsal:validate PASS exit code 0; validation\uFF1A \uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue',
        'Required checklist updates':
          'artifact://publication/gate-3-checklist.md completed Gate 3 checklist update evidence; publication checklist validation PASS exit code 0; validation\uFF1A \uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue',
      },
    ));

    expect(compatibilityResult.status).toBe('BLOCKED');
    expect(compatibilityResult.errors).toContain(
      'Publication Evidence: Required release-note updates must not include contradictory rehearsal failure markers',
    );
    expect(compatibilityResult.errors).toContain(
      'Publication Evidence: Required checklist updates must not include contradictory rehearsal failure markers',
    );
  });

  it('rejects Gate 3 publication update evidence with structured failure fields', () => {
    for (const marker of [
      'errors=[publication update drift]',
      'failureTotal=1',
    ]) {
      const result = validateRehearsalEvidence(completedRehearsal(
        completePassingRows,
        {},
        {},
        {
          'Required release-note updates':
            `artifact://publication/gate-3-release-notes.md completed Gate 3 rehearsal release-note update evidence; Production-ready claim allowed by this rehearsal: no; Testnet production-candidate claim allowed by this rehearsal: no; rehearsal:validate PASS exit code 0; ${marker}`,
          'Required checklist updates':
            `artifact://publication/gate-3-checklist.md completed Gate 3 checklist update evidence; Production-ready claim allowed by this rehearsal: no; Testnet production-candidate claim allowed by this rehearsal: no; publication checklist validation PASS exit code 0; ${marker}`,
        },
      ));

      expect(result.status, marker).toBe('BLOCKED');
      expect(result.errors, marker).toContain(
        'Publication Evidence: Required release-note updates must not include contradictory rehearsal failure markers',
      );
      expect(result.errors, marker).toContain(
        'Publication Evidence: Required checklist updates must not include contradictory rehearsal failure markers',
      );
    }

    const success = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      {},
      {},
      {
        'Required release-note updates':
          'artifact://publication/gate-3-release-notes.md completed Gate 3 rehearsal release-note update evidence; Production-ready claim allowed by this rehearsal: no; Testnet production-candidate claim allowed by this rehearsal: no; rehearsal:validate PASS exit code 0; errors=[] failureTotal=0',
        'Required checklist updates':
          'artifact://publication/gate-3-checklist.md completed Gate 3 checklist update evidence; Production-ready claim allowed by this rehearsal: no; Testnet production-candidate claim allowed by this rehearsal: no; publication checklist validation PASS exit code 0; errors=[] failureTotal=0',
      },
    ));

    expect(success.status).toBe('PASS');
  });

  it('rejects Gate 3 publication update evidence with open or known issue markers', () => {
    for (const issueMarker of [
      'Open issues: unresolved Gate 3 publication blocker',
      'Known issues: unresolved Gate 3 publication blocker',
      '\uFF2F\uFF50\uFF45\uFF4E issues\uFF1A unresolved Gate 3 publication blocker',
    ]) {
      const result = validateRehearsalEvidence(completedRehearsal(
        completePassingRows,
        {},
        {},
        {
          'Required release-note updates':
            `artifact://publication/gate-3-release-notes.md completed Gate 3 rehearsal release-note update evidence; rehearsal:validate PASS exit code 0; ${issueMarker}`,
          'Required checklist updates':
            `artifact://publication/gate-3-checklist.md completed Gate 3 checklist update evidence; publication checklist validation PASS exit code 0; ${issueMarker}`,
        },
      ));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Publication Evidence: Required release-note updates must not include contradictory rehearsal failure markers',
      );
      expect(result.errors).toContain(
        'Publication Evidence: Required checklist updates must not include contradictory rehearsal failure markers',
      );
    }
  });

  it('rejects hidden production-readiness claim markers in completed publication update prose', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace(
          '- Required release-note updates: artifact://publication/gate-3-release-notes.md completed Gate 3 rehearsal release-note update evidence',
          '- Required release-note updates: artifact://publication/gate-3-release-notes.md completed Gate 3 rehearsal release-note update evidence; Production-ready claim allowed by this rehearsal = yes',
        )
        .replace(
          '- Required checklist updates: artifact://publication/gate-3-checklist.md completed Gate 3 checklist update evidence',
          '- Required checklist updates: artifact://publication/gate-3-checklist.md completed Gate 3 checklist update evidence; Testnet production-candidate claim allowed by this rehearsal = yes',
        ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Evidence: Production-ready claim allowed by this rehearsal must appear exactly once as a dedicated field with value no',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Testnet production-candidate claim allowed by this rehearsal must appear exactly once as a dedicated field with value no',
    );
  });

  it('requires publication update evidence to preserve exact rehearsal claim denials', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replaceAll('; Production-ready claim allowed by this rehearsal: no', '')
        .replaceAll('; Testnet production-candidate claim allowed by this rehearsal: no', ''),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates must use exact Production-ready claim allowed by this rehearsal: no',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates must use exact Testnet production-candidate claim allowed by this rehearsal: no',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates must use exact Production-ready claim allowed by this rehearsal: no',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates must use exact Testnet production-candidate claim allowed by this rehearsal: no',
    );
  });

  it('blocks extra mainnet or production-ready wording in publication evidence even when claim fields are no', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows)
        .replace(
          '- Required release-note updates: artifact://publication/gate-3-release-notes.md completed Gate 3 rehearsal release-note update evidence',
          '- Required release-note updates: artifact://publication/gate-3-release-notes.md completed Gate 3 rehearsal release-note update evidence for mainnet go-live',
        )
        .replace(
          '- Required checklist updates: artifact://publication/gate-3-checklist.md completed Gate 3 checklist update evidence',
          '- Required checklist updates: artifact://publication/gate-3-checklist.md completed Gate 3 checklist update evidence for production-ready testnet release',
        ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Evidence: mainnet production-ready claims are forbidden; only testnet-scoped production-candidate claims can be evaluated',
    );
    expect(result.errors).toContain(
      'Publication Evidence: production claim wording is not allowed in Gate 3 publication evidence; claim fields must remain no',
    );
  });

  it('rejects hidden production-ready claim markers in lifecycle evidence prose', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `| Peg-in evidence | pass | ${artifactFor('Peg-in evidence')} | | |`,
        `| Peg-in evidence | pass | ${artifactFor('Peg-in evidence')}; Production-ready claim allowed by this rehearsal = yes | | |`,
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Evidence: Production-ready claim allowed by this rehearsal must appear exactly once as a dedicated field with value no',
    );
  });

  it('rejects hidden testnet production-candidate claim markers in preflight evidence prose', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        `- ContextExtension guard result: ${CONTEXT_EXTENSION_GUARD_EVIDENCE}`,
        `- ContextExtension guard result: ${CONTEXT_EXTENSION_GUARD_EVIDENCE}; Testnet production-candidate claim allowed by this rehearsal = yes`,
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Evidence: Testnet production-candidate claim allowed by this rehearsal must appear exactly once as a dedicated field with value no',
    );
  });

  it('rejects hidden production-ready claim markers in reviewer sign-off prose', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        '- Reviewer: reviewer-a\n- Date: 2026-05-14',
        '- Reviewer: reviewer-a\n- Reviewer note: Production-ready claim allowed by this rehearsal = yes\n- Date: 2026-05-14',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Evidence: Production-ready claim allowed by this rehearsal must appear exactly once as a dedicated field with value no',
    );
  });

  it('rejects direct production claim wording in reviewer sign-off prose', () => {
    const result = validateRehearsalEvidence(
      completedRehearsal(completePassingRows).replace(
        '- Reviewer: reviewer-a\n- Date: 2026-05-14',
        [
          '- Reviewer: reviewer-a',
          '- Reviewer note: production-ready release wording observed; mainnet production release wording observed.',
          '- Date: 2026-05-14',
        ].join('\n'),
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: notes must not contain mainnet production claim wording',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: notes must not contain production-ready claim wording',
    );
  });

  it('does not allow production-ready claims from a rehearsal alone', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      {},
      {},
      {
        'Production-ready claim allowed by this rehearsal': 'yes',
      },
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Evidence: Production-ready claim allowed by this rehearsal must be no',
    );
  });

  it('does not allow testnet production-candidate claims from a rehearsal alone', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      {},
      {},
      {
        'Testnet production-candidate claim allowed by this rehearsal': 'yes',
      },
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Evidence: Testnet production-candidate claim allowed by this rehearsal must be no',
    );
  });

  it('requires reviewer sign-off classification to pass before evidence can pass', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      {},
      {
        Classification: 'inconclusive',
      },
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reviewer Sign-Off: Classification must be pass before rehearsal evidence can pass');
  });

  it('blocks pass sign-off when reviewer leaves blockers or follow-ups open', () => {
    const result = validateRehearsalEvidence(completedRehearsal(
      completePassingRows,
      {},
      {
        'Publication blockers discovered': 'open testnet blocker',
        'Follow-up tests required': 'yes',
        'Follow-up runbook changes required': 'incident runbook update',
      },
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Publication blockers discovered must be none, no, or 0 before rehearsal evidence can pass',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Follow-up tests required must be none, no, or 0 before rehearsal evidence can pass',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Follow-up runbook changes required must be none, no, or 0 before rehearsal evidence can pass',
    );
  });

  it('fails loudly when the lifecycle table is missing', () => {
    expect(() => parseLifecycleGateRows('# Missing table')).toThrow(
      /Lifecycle Gate Classification table not found/,
    );
  });
});
