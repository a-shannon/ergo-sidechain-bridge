import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';

import { describe, expect, it } from 'vitest';

import {
  gateTestnetOfflineRehearsalBundle,
  readAndGateTestnetOfflineRehearsalBundle,
  validateFreshCheckpointArtifact,
  validateTestnetOfflineRehearsalGateReport,
} from './testnet-offline-rehearsal-gate.js';
import { writeOfflineReportJson } from './offline-report-json.js';
import { LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE } from './legacy-aggregate-settlement-conservation.js';

const expectedTxId = 'a'.repeat(64);
const burnTxHash = 'b'.repeat(64);
const deployedStateHash = 'c'.repeat(64);
const bridgeEventRootHex = 'd'.repeat(64);
const sidechainHeaderHashHex = 'e'.repeat(64);
const singletonNftId = '1'.repeat(64);
const singletonBoxId = '2'.repeat(64);
const singletonTree = '1001'.repeat(8);
const ergoNodeUrl = 'http://localhost:9052';
const sidechainRpcUrl = 'http://localhost:9945';
const freshObservedAt = () => new Date().toISOString();
const staleObservedAt = () => new Date(Date.now() - (16 * 60 * 1000)).toISOString();
const futureObservedAt = () => new Date(Date.now() + 1000).toISOString();
const legacyV1SubmissionStatus = `BLOCKED: ${LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE}`;

const passingPackage = {
  target: 'artifact://prebroadcast/aggregate-check.json',
  command: 'check',
  mode: 'single',
  expectedTxId,
  burnTxHashes: [burnTxHash],
  sidechainBlockHeights: [200],
  sidechainHeaderHashHexes: [sidechainHeaderHashHex],
  ergoAnchorHeights: [100],
  bridgeEventRootHexes: [bridgeEventRootHex],
  deployedStateHash,
};

const passingPrebroadcast = {
  status: 'PASS',
  message: 'prebroadcast package doctor PASS',
  broadcastEnabled: false,
  ergoNodeNetwork: 'testnet',
  sidechainNetwork: 'patched-devnet',
  submitCommandAttempted: false,
  mempoolTransactionObserved: false,
  reports: [{
    linkedAggregateJsonSummaries: [{
      status: 'READ',
      command: passingPackage.command,
      expectedTxId: passingPackage.expectedTxId,
    }],
  }],
};

const passingPreflight = {
  status: 'GO',
  message: 'testnet rehearsal preflight GO',
  broadcastEnabled: false,
  packages: [
    passingPackage,
  ],
};

const passingWindowPrep = {
  schemaVersion: 1,
  status: 'CREATED',
  executionStatus: 'QUARANTINED',
  message: 'testnet window prep CREATED - execution QUARANTINED',
  errors: [],
  broadcastEnabled: false,
  ergoNodeNetwork: 'testnet',
  sidechainNetwork: 'non-mainnet patched-devnet',
  targetBindings: {
    prebroadcast: 'evidence/prebroadcast/completed.md',
    approvals: 'evidence/approvals/approvals.json',
  },
  networkScope: {
    environment: 'testnet',
    ergoNodeNetwork: 'testnet',
    sidechainNetwork: 'non-mainnet patched-devnet',
    broadcastEnabled: false,
  },
  heightBoundary: {
    currentErgoHeight: 250,
    currentSidechainHeight: 300,
    maxPreflightErgoAnchorHeight: 100,
    maxPreflightSidechainBlockHeight: 200,
    currentDeployedStateHash: deployedStateHash,
    packageDeployedStateHash: deployedStateHash,
  },
  gateBoundary: {
    reportAuthorizesBroadcast: false,
    broadcastAuthorized: false,
    liveSubmitPerformed: false,
    confirmationObserved: false,
    reconciliationPerformed: false,
    gate3ClosureAllowed: false,
    productionReadyClaimAllowed: false,
    testnetProductionCandidateClaimAllowed: false,
  },
  nextHandoff: {
    label: 'external-fee-profile-activation-prerequisites',
    phase: 'blocked-live-settlement',
    command: legacyV1SubmissionStatus,
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
  },
  packages: [
    passingPackage,
  ],
  markdown: [
    '# Testnet Live Window Preparation Packet',
    '',
    'This packet does not authorize broadcast.',
    '- Broadcast enabled: no',
    '- Live submit performed: no',
    '- Confirmation observed: no',
    '- Reconciliation performed: no',
    '- Production-ready claim allowed: no',
    '- Mainnet production-ready claim allowed: no',
  ].join('\n'),
  lines: [
    `testnet window prep CREATED - execution QUARANTINED; ${legacyV1SubmissionStatus}`,
    '- scope: read-only testnet live-window preparation; this report does not authorize broadcast or lift the legacy V1 quarantine.',
  ],
};

const passingAnchorObservedAt = freshObservedAt();
const passingSingletonObservedAt = freshObservedAt();
const passingHeightObservedAt = freshObservedAt();

const passingFreshCheckpoint = {
  status: 'CREATED',
  message: 'fresh testnet non-broadcast checkpoint CREATED publication-blocker',
  checkpoint: {
    aggregateEvidence: 'aggregate-check.json',
    lifecycleGate: 'Fresh testnet lifecycle',
    lifecycleStatus: 'publication blocker',
    ergoNodeNetwork: 'testnet',
    sidechainNetwork: 'non-mainnet patched-devnet',
    currentErgoHeight: 250,
    currentSidechainHeight: 300,
    expectedTxId,
    burnTxHashes: [burnTxHash],
    sidechainBlockHeights: [200],
    sidechainHeaderHashHexes: [sidechainHeaderHashHex],
    ergoAnchorHeights: [100],
    bridgeEventRootHexes: [bridgeEventRootHex],
    transactionCheckResult: 'PASS',
    broadcast: 'no',
    anchorObservations: [{
      ergoAnchorHeight: 100,
      expectedBridgeEventRootHex: bridgeEventRootHex,
      observedBridgeEventRootHexes: [bridgeEventRootHex],
      matchingFieldFound: true,
      fieldCount: 1,
      headerIds: ['f'.repeat(64)],
      observedAt: passingAnchorObservedAt,
      nodeHeight: 250,
    }],
    singletonCheckpoint: {
      deployedStateHash,
      observedAt: passingSingletonObservedAt,
      nodeHeight: 250,
      nodeNetwork: 'testnet',
      expectedTxId,
      expectedTxMempoolAbsent: true,
      expectedTxConfirmedAbsent: true,
      singletons: [{
        name: 'sideChainState',
        nftId: singletonNftId,
        expectedBoxId: singletonBoxId,
        observedBoxId: singletonBoxId,
        expectedErgoTreeHex: singletonTree,
        observedErgoTreeHex: singletonTree,
        observedCount: 1,
      }],
    },
    heightEvidence: {
      observedAt: passingHeightObservedAt,
      ergoNodeHeight: 250,
      sidechainBlockHeight: 300,
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
      observedAt: passingSingletonObservedAt,
      nodeHeight: 250,
      expectedTxId,
      deployedStateHash,
      singletonCount: 1,
      ergoNodeUrl,
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
      observationCount: 1,
      ergoAnchorHeights: [100],
      bridgeEventRootHexes: [bridgeEventRootHex],
      observedAtValues: [passingAnchorObservedAt],
      nodeHeights: [250],
      ergoNodeUrl,
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
      observedAt: passingHeightObservedAt,
      ergoNodeHeight: 250,
      sidechainBlockHeight: 300,
      broadcastEnabled: false,
      ergoNodeUrl,
      sidechainRpcUrl,
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

describe('gateTestnetOfflineRehearsalBundle', () => {
  it('blocks a testnet rehearsal bundle without a fresh checkpoint', () => {
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('freshCheckpoint: required artifact is missing');
    expect(report.stages.map(stage => stage.name)).toEqual([
      'prebroadcast',
      'rehearsalPreflight',
      'windowPrep',
      'freshCheckpoint',
    ]);
  });

  it('passes when a fresh checkpoint matches the offline package binding', () => {
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: passingFreshCheckpoint,
    });

    expect(report.status).toBe('PASS');
    expect(report.errors).toEqual([]);
    expect(report.stages.map(stage => stage.name)).toEqual([
      'prebroadcast',
      'rehearsalPreflight',
      'windowPrep',
      'freshCheckpoint',
    ]);
  });

  it('fails closed when a pass-equivalent stage artifact has a malformed errors field', () => {
    const malformedPreflight: any = structuredClone(passingPreflight);
    malformedPreflight.errors = 'validation BLOCKED with 1 structural issue';

    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: malformedPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: passingFreshCheckpoint,
    });

    expect(report.errors).toContain(
      'rehearsalPreflight: artifact errors must be an empty array when present',
    );
  });

  it('fails closed when pass-equivalent stage lines include contradictory failure markers', () => {
    const contradictoryPrebroadcast: any = structuredClone(passingPrebroadcast);
    contradictoryPrebroadcast.lines = [
      'completed-testnet-prebroadcast-evidence.md: prebroadcast package doctor PASS',
      '- linkedAggregateJson: 1 local record(s)',
      '- Remaining issues:',
      '  - validation BLOCKED with 1 structural issue',
    ];

    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: contradictoryPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: passingFreshCheckpoint,
    });

    expect(report.errors).toContain(
      'prebroadcast: artifact lines must not include contradictory failure markers',
    );
  });

  it('fails closed when pass-equivalent stage lines include compatibility-normalized failure markers', () => {
    const marker = 'validation\uFF1A \uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue';
    const contradictoryPrebroadcast: any = structuredClone(passingPrebroadcast);
    contradictoryPrebroadcast.lines = [
      'completed-testnet-prebroadcast-evidence.md: prebroadcast package doctor PASS',
      '- linkedAggregateJson: 1 local record(s)',
      `- Validation summary: PASS exit code 0; ${marker}`,
    ];

    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: contradictoryPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: passingFreshCheckpoint,
    });

    expect(report.errors).toContain(
      'prebroadcast: artifact lines must not include contradictory failure markers',
    );
  });

  it('fails closed when pass-equivalent stage lines include remaining issue markers', () => {
    const remainingIssuePrebroadcast: any = structuredClone(passingPrebroadcast);
    remainingIssuePrebroadcast.lines = [
      'completed-testnet-prebroadcast-evidence.md: prebroadcast package doctor PASS',
      '- linkedAggregateJson: 1 local record(s)',
      '- Remaining issues:',
      '  - unresolved prebroadcast blocker',
    ];

    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: remainingIssuePrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: passingFreshCheckpoint,
    });

    expect(report.errors).toContain(
      'prebroadcast: artifact lines must not include remaining issues',
    );
  });

  it('fails closed when pass-equivalent stage lines include compatibility-normalized issue markers', () => {
    const issuePrebroadcast: any = structuredClone(passingPrebroadcast);
    issuePrebroadcast.lines = [
      'completed-testnet-prebroadcast-evidence.md: prebroadcast package doctor PASS',
      '- linkedAggregateJson: 1 local record(s)',
      '- \uFF2F\uFF50\uFF45\uFF4E issues\uFF1A unresolved prebroadcast blocker',
    ];

    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: issuePrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: passingFreshCheckpoint,
    });

    expect(report.errors).toContain(
      'prebroadcast: artifact lines must not include remaining issues',
    );
  });

  it('fails closed when pass-equivalent stage lines include open or known issue markers', () => {
    for (const line of [
      '- Open issues: unresolved prebroadcast blocker',
      '- Known issues: unresolved prebroadcast blocker',
    ]) {
      const issuePrebroadcast: any = structuredClone(passingPrebroadcast);
      issuePrebroadcast.lines = [
        'completed-testnet-prebroadcast-evidence.md: prebroadcast package doctor PASS',
        '- linkedAggregateJson: 1 local record(s)',
        line,
      ];

      const report = gateTestnetOfflineRehearsalBundle({
        prebroadcast: issuePrebroadcast,
        rehearsalPreflight: passingPreflight,
        windowPrep: passingWindowPrep,
        freshCheckpoint: passingFreshCheckpoint,
      });

      expect(report.errors).toContain(
        'prebroadcast: artifact lines must not include remaining issues',
      );
    }
  });

  it('fails closed when pass-equivalent stage lines serialize runtime state material', () => {
    const runtimePrebroadcast: any = structuredClone(passingPrebroadcast);
    runtimePrebroadcast.lines = [
      'completed-testnet-prebroadcast-evidence.md: prebroadcast package doctor PASS',
      '- linkedAggregateJson: 1 local record(s)',
      '- State source: sourceTarget=C:/tmp/bridge-state.sqlite',
    ];

    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: runtimePrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: passingFreshCheckpoint,
    });

    expect(report.errors).toContain(
      'prebroadcast: artifact lines must not serialize auth, secret, runtime, state, or database payloads',
    );
  });

  it('fails closed when a fresh checkpoint is older than the prepared testnet window heights', () => {
    const newerWindowPrep = structuredClone(passingWindowPrep);
    newerWindowPrep.heightBoundary.currentErgoHeight = 251;
    newerWindowPrep.heightBoundary.currentSidechainHeight = 301;
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: newerWindowPrep,
      freshCheckpoint: passingFreshCheckpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'offline window binding: freshCheckpoint currentErgoHeight must be greater than or equal to windowPrep currentErgoHeight',
    );
    expect(report.errors).toContain(
      'offline window binding: freshCheckpoint currentSidechainHeight must be greater than or equal to windowPrep currentSidechainHeight',
    );
  });

  it('fails closed when a fresh checkpoint network scope diverges from the prepared testnet window', () => {
    const mismatchedCheckpoint = structuredClone(passingFreshCheckpoint);
    mismatchedCheckpoint.checkpoint.ergoNodeNetwork = 'testnet fork';
    mismatchedCheckpoint.checkpoint.sidechainNetwork = 'testnet sidechain';
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: mismatchedCheckpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'offline window binding: freshCheckpoint ergoNodeNetwork must match windowPrep networkScope.ergoNodeNetwork',
    );
    expect(report.errors).toContain(
      'offline window binding: freshCheckpoint sidechainNetwork must match windowPrep networkScope.sidechainNetwork',
    );
  });

  it('fails closed when a fresh checkpoint JSON omits explicit checkpoint network scope', () => {
    const missingNetwork = structuredClone(passingFreshCheckpoint);
    delete (missingNetwork.checkpoint as Record<string, unknown>).ergoNodeNetwork;
    delete (missingNetwork.checkpoint as Record<string, unknown>).sidechainNetwork;

    expect(validateFreshCheckpointArtifact(missingNetwork)).toEqual(expect.arrayContaining([
      'freshCheckpoint: checkpoint.ergoNodeNetwork must positively identify testnet',
      'freshCheckpoint: checkpoint.sidechainNetwork must identify patched-devnet, testnet, or non-mainnet',
    ]));
  });

  it('fails closed when fresh checkpoint report lines include contradictory failure markers', () => {
    const contradictoryLines: any = structuredClone(passingFreshCheckpoint);
    contradictoryLines.lines = [
      'fresh testnet non-broadcast checkpoint CREATED publication-blocker',
      '- scope: offline non-broadcast checkpoint only; no signing, submit, confirmation, reconciliation, node mutation, or broadcast command executed.',
    ];
    contradictoryLines.lines.push(
      '- Validation summary: PASS exit code 0; validation BLOCKED with 1 structural issue',
    );

    expect(validateFreshCheckpointArtifact(contradictoryLines)).toContain(
      'freshCheckpoint: lines must not include contradictory failure markers',
    );
  });

  it('fails closed when fresh checkpoint report lines include compatibility-normalized failure markers', () => {
    const marker = 'validation\uFF1A \uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue';
    const contradictoryLines: any = structuredClone(passingFreshCheckpoint);
    contradictoryLines.lines = [
      'fresh testnet non-broadcast checkpoint CREATED publication-blocker',
      '- scope: offline non-broadcast checkpoint only; no signing, submit, confirmation, reconciliation, node mutation, or broadcast command executed.',
      `- Validation summary: PASS exit code 0; ${marker}`,
    ];

    expect(validateFreshCheckpointArtifact(contradictoryLines)).toContain(
      'freshCheckpoint: lines must not include contradictory failure markers',
    );
  });

  it('fails closed when fresh checkpoint report lines include remaining issue markers', () => {
    const remainingIssueLines: any = structuredClone(passingFreshCheckpoint);
    remainingIssueLines.lines = [
      'fresh testnet non-broadcast checkpoint CREATED publication-blocker',
      '- scope: offline non-broadcast checkpoint only; no signing, submit, confirmation, reconciliation, node mutation, or broadcast command executed.',
      '- Remaining issues:',
      '  - unresolved fresh checkpoint blocker',
    ];

    expect(validateFreshCheckpointArtifact(remainingIssueLines)).toContain(
      'freshCheckpoint: lines must not include remaining issues',
    );
  });

  it('fails closed when fresh checkpoint report lines include compatibility-normalized issue markers', () => {
    const issueLines: any = structuredClone(passingFreshCheckpoint);
    issueLines.lines = [
      'fresh testnet non-broadcast checkpoint CREATED publication-blocker',
      '- scope: offline non-broadcast checkpoint only; no signing, submit, confirmation, reconciliation, node mutation, or broadcast command executed.',
      '- \uFF2F\uFF50\uFF45\uFF4E issues\uFF1A unresolved fresh checkpoint blocker',
    ];

    expect(validateFreshCheckpointArtifact(issueLines)).toContain(
      'freshCheckpoint: lines must not include remaining issues',
    );
  });

  it('fails closed when fresh checkpoint report lines include open or known issue markers', () => {
    for (const line of [
      '- Open issues: unresolved checkpoint blocker',
      '- Known issues: unresolved checkpoint blocker',
    ]) {
      const issueLines: any = structuredClone(passingFreshCheckpoint);
      issueLines.lines = [
        'fresh testnet non-broadcast checkpoint CREATED publication-blocker',
        '- scope: offline non-broadcast checkpoint only; no signing, submit, confirmation, reconciliation, node mutation, or broadcast command executed.',
        line,
      ];

      expect(validateFreshCheckpointArtifact(issueLines)).toContain(
        'freshCheckpoint: lines must not include remaining issues',
      );
    }
  });

  it('fails closed when window-prep JSON lacks structured boundaries', () => {
    const unstructuredWindowPrep = {
      status: 'CREATED',
      message: 'testnet window prep CREATED',
      errors: [],
      packages: [passingPackage],
    };
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: unstructuredWindowPrep,
      freshCheckpoint: passingFreshCheckpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('window-prep: targetBindings.prebroadcast must be present');
    expect(report.errors).toContain('window-prep: gateBoundary.reportAuthorizesBroadcast must be false');
  });

  it('fails closed when window-prep JSON escalates the pre-submit boundary', () => {
    const windowPrep = structuredClone(passingWindowPrep);
    windowPrep.gateBoundary.broadcastAuthorized = true;
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep,
      freshCheckpoint: passingFreshCheckpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('window-prep: gateBoundary.broadcastAuthorized must be false');
  });

  it('fails closed when a fresh checkpoint omits live singleton observations', () => {
    const checkpointWithoutSingletons = {
      ...passingFreshCheckpoint,
      checkpoint: {
        ...passingFreshCheckpoint.checkpoint,
        singletonCheckpoint: undefined,
      },
    };
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: checkpointWithoutSingletons,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('freshCheckpoint: checkpoint.singletonCheckpoint is required');
  });

  it('fails closed when a fresh checkpoint omits live anchor observations', () => {
    const checkpointWithoutAnchors = structuredClone(passingFreshCheckpoint);
    delete (checkpointWithoutAnchors.checkpoint as any).anchorObservations;
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: checkpointWithoutAnchors,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('freshCheckpoint: checkpoint.anchorObservations is required');
  });

  it('fails closed when a fresh checkpoint anchor observation does not match the event root', () => {
    const checkpoint = structuredClone(passingFreshCheckpoint);
    checkpoint.checkpoint.anchorObservations[0].observedBridgeEventRootHexes = ['9'.repeat(64)];
    checkpoint.checkpoint.anchorObservations[0].matchingFieldFound = false;
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: checkpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('freshCheckpoint: anchor observation 1 must prove a matching 0x0401 field was found');
    expect(report.errors).toContain(
      'freshCheckpoint: anchor observation 1 observed bridge event roots must include checkpoint.bridgeEventRootHexes',
    );
  });

  it('fails closed when a fresh checkpoint anchor observation lacks read-only source binding', () => {
    const checkpoint = structuredClone(passingFreshCheckpoint);
    delete (checkpoint as any).sourceBindings;
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: checkpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('freshCheckpoint: sourceBindings.anchorObservations is required');
  });

  it('fails closed when a fresh checkpoint singleton observation lacks read-only source binding', () => {
    const checkpoint = structuredClone(passingFreshCheckpoint);
    delete (checkpoint.sourceBindings as any).singletonCheckpoint;
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: checkpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('freshCheckpoint: sourceBindings.singletonCheckpoint is required');
  });

  it('accepts a provided-json singleton source binding when it cites a concrete JSON target', () => {
    const checkpoint = structuredClone(passingFreshCheckpoint);
    (checkpoint.sourceBindings as any).singletonCheckpoint = {
      ...checkpoint.sourceBindings.singletonCheckpoint,
      mode: 'provided-json',
      target: 'evidence/fresh/singleton-checkpoint.json',
      readOnlyNodeClient: false,
      nodeAuthHeader: 'not-applicable',
      operations: [],
    };
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: checkpoint,
    });

    expect(report.status).toBe('PASS');
    expect(report.errors).toEqual([]);
  });

  it('fails closed when a provided-json singleton source binding lacks a concrete JSON target', () => {
    const missingTarget = structuredClone(passingFreshCheckpoint);
    (missingTarget.sourceBindings as any).singletonCheckpoint = {
      ...missingTarget.sourceBindings.singletonCheckpoint,
      mode: 'provided-json',
      readOnlyNodeClient: false,
      nodeAuthHeader: 'not-applicable',
      operations: [],
    };
    delete (missingTarget.sourceBindings.singletonCheckpoint as any).target;
    const templateTarget = structuredClone(missingTarget);
    (templateTarget.sourceBindings.singletonCheckpoint as any).target = 'evidence/fresh/singleton-checkpoint-template.json';

    const missingTargetReport = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: missingTarget,
    });
    const templateTargetReport = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: templateTarget,
    });

    expect(missingTargetReport.status).toBe('BLOCKED');
    expect(missingTargetReport.errors).toContain(
      'freshCheckpoint: sourceBindings.singletonCheckpoint.target must cite a concrete non-template singleton checkpoint JSON target when mode is provided-json',
    );
    expect(templateTargetReport.status).toBe('BLOCKED');
    expect(templateTargetReport.errors).toContain(
      'freshCheckpoint: sourceBindings.singletonCheckpoint.target must cite a concrete non-template singleton checkpoint JSON target when mode is provided-json',
    );
  });

  it('fails closed when a fresh checkpoint is not bound to its aggregate evidence target', () => {
    const missing = structuredClone(passingFreshCheckpoint);
    delete (missing as any).sourceBindings.aggregateEvidence;
    const mismatched = structuredClone(passingFreshCheckpoint);
    (mismatched as any).sourceBindings.aggregateEvidence = 'other-aggregate-check.json';
    const unsafe = structuredClone(passingFreshCheckpoint);
    unsafe.checkpoint.aggregateEvidence = 'artifact://fresh/aggregate-check.json';
    const missingReport = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: missing,
    });
    const mismatchedReport = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: mismatched,
    });
    const unsafeReport = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: unsafe,
    });

    expect(missingReport.status).toBe('BLOCKED');
    expect(missingReport.errors).toContain(
      'freshCheckpoint: sourceBindings.aggregateEvidence must cite a concrete non-template aggregate evidence JSON target',
    );
    expect(mismatchedReport.status).toBe('BLOCKED');
    expect(mismatchedReport.errors).toContain(
      'freshCheckpoint: sourceBindings.aggregateEvidence must match checkpoint.aggregateEvidence',
    );
    expect(unsafeReport.status).toBe('BLOCKED');
    expect(unsafeReport.errors).toContain(
      'freshCheckpoint: checkpoint.aggregateEvidence must cite a concrete non-template aggregate evidence JSON target',
    );
  });

  it('fails closed when a fresh checkpoint anchor observation is stale or not height-bound', () => {
    const stale = structuredClone(passingFreshCheckpoint);
    stale.checkpoint.anchorObservations[0].observedAt = staleObservedAt();
    const staleReport = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: stale,
    });
    const heightMismatch = structuredClone(passingFreshCheckpoint);
    heightMismatch.checkpoint.anchorObservations[0].nodeHeight = 249;
    const heightReport = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: heightMismatch,
    });
    const behindAnchor = structuredClone(passingFreshCheckpoint);
    behindAnchor.checkpoint.currentErgoHeight = 99;
    behindAnchor.checkpoint.anchorObservations[0].nodeHeight = 99;
    const behindReport = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: behindAnchor,
    });

    expect(staleReport.status).toBe('BLOCKED');
    expect(staleReport.errors).toContain(
      'freshCheckpoint: anchor observation 1 observedAt must be no older than 15 minutes',
    );
    expect(heightReport.status).toBe('BLOCKED');
    expect(heightReport.errors).toContain(
      'freshCheckpoint: anchor observation 1 nodeHeight must match checkpoint.currentErgoHeight',
    );
    expect(behindReport.status).toBe('BLOCKED');
    expect(behindReport.errors).toContain(
      'freshCheckpoint: anchor observation 1 nodeHeight must be greater than or equal to Ergo anchor height',
    );
  });

  it('fails closed when anchor source binding omits node /info', () => {
    const checkpoint = structuredClone(passingFreshCheckpoint);
    checkpoint.sourceBindings.anchorObservations.operations = [
      'Ergo extension fields at aggregate anchor heights',
      '0x0401 bridgeEventRoot matching',
    ];
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: checkpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'freshCheckpoint: sourceBindings.anchorObservations.operations must cite /info, extension fields, and 0x0401 matching',
    );
  });

  it('fails closed when fresh checkpoint source operation entries are not strings', () => {
    const checkpoint = structuredClone(passingFreshCheckpoint);
    checkpoint.sourceBindings.heightEvidence.operations = [
      ...checkpoint.sourceBindings.heightEvidence.operations,
      { operation: 'EVM getBlockNumber' },
    ] as unknown as typeof checkpoint.sourceBindings.heightEvidence.operations;
    checkpoint.sourceBindings.singletonCheckpoint.operations = [
      ...checkpoint.sourceBindings.singletonCheckpoint.operations,
      123,
    ] as unknown as typeof checkpoint.sourceBindings.singletonCheckpoint.operations;
    checkpoint.sourceBindings.anchorObservations.operations = [
      ...checkpoint.sourceBindings.anchorObservations.operations,
      { operation: '0x0401 bridgeEventRoot matching' },
    ] as unknown as typeof checkpoint.sourceBindings.anchorObservations.operations;

    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: checkpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'freshCheckpoint: sourceBindings.heightEvidence.operations entries must be strings',
    );
    expect(report.errors).toContain(
      'freshCheckpoint: sourceBindings.singletonCheckpoint.operations entries must be strings',
    );
    expect(report.errors).toContain(
      'freshCheckpoint: sourceBindings.anchorObservations.operations entries must be strings',
    );
  });

  it('fails closed when fresh checkpoint source bindings serialize auth or runtime payloads', () => {
    const checkpoint = structuredClone(passingFreshCheckpoint);
    (checkpoint.sourceBindings.heightEvidence as any).authHeader = 'Bearer redacted';
    (checkpoint.sourceBindings.singletonCheckpoint as any).runtimePath = 'bridge-state.sqlite';
    (checkpoint.sourceBindings.anchorObservations as any).statePath = 'bridge-state.json';

    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: checkpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'freshCheckpoint: sourceBindings must not serialize auth, secret, runtime, state, or database payloads',
    );
  });

  it('fails closed when fresh checkpoint source bindings cite shared sensitive artifact targets', () => {
    for (const target of [
      'operator/signing-key-source.json',
      'operator/api-key-source.json',
      'operator/seed-phrase-source.json',
      'state/deployed_state.json',
      'sourceTarget=%28.env%29',
      'sourceTarget=%28runtime%2Fbridge-state.sqlite%29',
    ]) {
      const checkpoint = structuredClone(passingFreshCheckpoint);
      (checkpoint.sourceBindings.heightEvidence as any).sourceTarget = target;

      const report = gateTestnetOfflineRehearsalBundle({
        prebroadcast: passingPrebroadcast,
        rehearsalPreflight: passingPreflight,
        windowPrep: passingWindowPrep,
        freshCheckpoint: checkpoint,
      });

      expect(report.status, target).toBe('BLOCKED');
      expect(report.errors, target).toContain(
        'freshCheckpoint: sourceBindings must not serialize auth, secret, runtime, state, or database payloads',
      );
    }
  });

  it('fails closed when fresh checkpoint source bindings cite encoded local-only targets', () => {
    for (const target of [
      'sourceTarget=%2Ftmp%2Ffresh-checkpoint.json',
      'sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Ffresh-checkpoint.json',
    ]) {
      const checkpoint = structuredClone(passingFreshCheckpoint);
      (checkpoint.sourceBindings.heightEvidence as any).sourceTarget = target;

      const report = gateTestnetOfflineRehearsalBundle({
        prebroadcast: passingPrebroadcast,
        rehearsalPreflight: passingPreflight,
        windowPrep: passingWindowPrep,
        freshCheckpoint: checkpoint,
      });

      expect(report.status, target).toBe('BLOCKED');
      expect(report.errors, target).toContain(
        'freshCheckpoint: sourceBindings must not serialize auth, secret, runtime, state, or database payloads',
      );
    }
  });

  it('fails closed when live source bindings omit concrete read-only endpoints', () => {
    const checkpoint = structuredClone(passingFreshCheckpoint);
    delete (checkpoint.sourceBindings.heightEvidence as any).ergoNodeUrl;
    checkpoint.sourceBindings.heightEvidence.sidechainRpcUrl = 'http://user:pass@localhost:9945';
    checkpoint.sourceBindings.singletonCheckpoint.ergoNodeUrl = '<node-url>';
    delete (checkpoint.sourceBindings.anchorObservations as any).ergoNodeUrl;

    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: checkpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'freshCheckpoint: sourceBindings.heightEvidence.ergoNodeUrl must cite a concrete read-only http(s) URL',
    );
    expect(report.errors).toContain(
      'freshCheckpoint: sourceBindings.heightEvidence.sidechainRpcUrl must not include credentials or credential query parameters',
    );
    expect(report.errors).toContain(
      'freshCheckpoint: sourceBindings.singletonCheckpoint.ergoNodeUrl must cite a concrete non-template read-only http(s) URL',
    );
    expect(report.errors).toContain(
      'freshCheckpoint: sourceBindings.anchorObservations.ergoNodeUrl must cite a concrete read-only http(s) URL',
    );
  });

  it('fails closed when live source bindings cite generic read-only endpoints', () => {
    const checkpoint = structuredClone(passingFreshCheckpoint);
    checkpoint.sourceBindings.heightEvidence.ergoNodeUrl = 'https://generic-height-node.invalid';
    checkpoint.sourceBindings.heightEvidence.sidechainRpcUrl = 'https://node.invalid/generic-sidechain';
    checkpoint.sourceBindings.singletonCheckpoint.ergoNodeUrl = 'https://generic-ergo-node.invalid';
    checkpoint.sourceBindings.anchorObservations.ergoNodeUrl = 'https://node.invalid/generic-anchor';

    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: checkpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'freshCheckpoint: sourceBindings.heightEvidence.ergoNodeUrl must cite a concrete non-template read-only http(s) URL',
    );
    expect(report.errors).toContain(
      'freshCheckpoint: sourceBindings.heightEvidence.sidechainRpcUrl must cite a concrete non-template read-only http(s) URL',
    );
    expect(report.errors).toContain(
      'freshCheckpoint: sourceBindings.singletonCheckpoint.ergoNodeUrl must cite a concrete non-template read-only http(s) URL',
    );
    expect(report.errors).toContain(
      'freshCheckpoint: sourceBindings.anchorObservations.ergoNodeUrl must cite a concrete non-template read-only http(s) URL',
    );
  });

  it('fails closed when fresh checkpoint source bindings do not match live observation facts', () => {
    const mismatchedAnchor = structuredClone(passingFreshCheckpoint);
    mismatchedAnchor.sourceBindings.anchorObservations.bridgeEventRootHexes = ['0'.repeat(64)];
    const missingAnchorCount = structuredClone(passingFreshCheckpoint);
    delete (missingAnchorCount.sourceBindings.anchorObservations as any).observationCount;
    const mismatchedSingleton = structuredClone(passingFreshCheckpoint);
    mismatchedSingleton.sourceBindings.singletonCheckpoint.expectedTxId = '0'.repeat(64);
    const mismatchedSingletonCount = structuredClone(passingFreshCheckpoint);
    mismatchedSingletonCount.sourceBindings.singletonCheckpoint.singletonCount = 2;

    const anchorReport = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: mismatchedAnchor,
    });
    const missingAnchorCountReport = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: missingAnchorCount,
    });
    const singletonReport = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: mismatchedSingleton,
    });
    const singletonCountReport = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: mismatchedSingletonCount,
    });

    expect(anchorReport.status).toBe('BLOCKED');
    expect(anchorReport.errors).toContain(
      'freshCheckpoint: sourceBindings.anchorObservations.bridgeEventRootHexes must match checkpoint.bridgeEventRootHexes',
    );
    expect(missingAnchorCountReport.status).toBe('BLOCKED');
    expect(missingAnchorCountReport.errors).toContain(
      'freshCheckpoint: sourceBindings.anchorObservations.observationCount must match checkpoint.anchorObservations',
    );
    expect(singletonReport.status).toBe('BLOCKED');
    expect(singletonReport.errors).toContain(
      'freshCheckpoint: sourceBindings.singletonCheckpoint.expectedTxId must match checkpoint.expectedTxId',
    );
    expect(singletonCountReport.status).toBe('BLOCKED');
    expect(singletonCountReport.errors).toContain(
      'freshCheckpoint: sourceBindings.singletonCheckpoint.singletonCount must match checkpoint.singletonCheckpoint.singletons',
    );
  });

  it('fails closed when a fresh checkpoint lacks read-only height evidence', () => {
    const checkpoint = structuredClone(passingFreshCheckpoint);
    delete (checkpoint.checkpoint as any).heightEvidence;
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: checkpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('freshCheckpoint: checkpoint.heightEvidence is required');
  });

  it('fails closed when fresh checkpoint height evidence lacks source binding', () => {
    const checkpoint = structuredClone(passingFreshCheckpoint);
    delete (checkpoint.sourceBindings as any).heightEvidence;
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: checkpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('freshCheckpoint: sourceBindings.heightEvidence is required');
  });

  it('fails closed when fresh checkpoint height evidence is stale or mismatched', () => {
    const stale = structuredClone(passingFreshCheckpoint);
    stale.checkpoint.heightEvidence.observedAt = staleObservedAt();
    const mismatched = structuredClone(passingFreshCheckpoint);
    mismatched.checkpoint.heightEvidence.ergoNodeHeight = 249;
    mismatched.checkpoint.heightEvidence.sidechainBlockHeight = 299;
    const staleReport = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: stale,
    });
    const mismatchReport = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: mismatched,
    });

    expect(staleReport.status).toBe('BLOCKED');
    expect(staleReport.errors).toContain(
      'freshCheckpoint: heightEvidence.observedAt must be no older than 15 minutes',
    );
    expect(mismatchReport.status).toBe('BLOCKED');
    expect(mismatchReport.errors).toContain(
      'freshCheckpoint: heightEvidence.ergoNodeHeight must match checkpoint.currentErgoHeight',
    );
    expect(mismatchReport.errors).toContain(
      'freshCheckpoint: heightEvidence.sidechainBlockHeight must match checkpoint.currentSidechainHeight',
    );
  });

  it('fails closed when fresh checkpoint height evidence is not read-only and non-broadcast', () => {
    const checkpoint = structuredClone(passingFreshCheckpoint);
    checkpoint.checkpoint.heightEvidence.sources.ergo = 'authenticated /info';
    checkpoint.checkpoint.heightEvidence.sources.sidechain = 'ethers JsonRpcProvider';
    checkpoint.checkpoint.heightEvidence.broadcastEnabled = true;
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: checkpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'freshCheckpoint: heightEvidence.sources.ergo must be read-only-no-auth /info',
    );
    expect(report.errors).toContain(
      'freshCheckpoint: heightEvidence.sources.sidechain must be read-only EVM getBlockNumber',
    );
    expect(report.errors).toContain('freshCheckpoint: heightEvidence.broadcastEnabled must be false');
  });

  it('fails closed when a fresh checkpoint singleton mempool proof is bound to another transaction', () => {
    const checkpoint = structuredClone(passingFreshCheckpoint);
    checkpoint.checkpoint.singletonCheckpoint.expectedTxId = '3'.repeat(64);
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: checkpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'freshCheckpoint: singleton checkpoint Expected transaction ID must match checkpoint.expectedTxId',
    );
  });

  it('fails closed when a fresh checkpoint does not prove the expected transaction is absent from confirmed chain', () => {
    const checkpoint = structuredClone(passingFreshCheckpoint);
    checkpoint.checkpoint.singletonCheckpoint.expectedTxConfirmedAbsent = false;
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: checkpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'freshCheckpoint: singleton checkpoint must prove Expected transaction ID is absent from confirmed chain',
    );
  });

  it('fails closed when a fresh checkpoint singleton observation timestamp is missing', () => {
    const checkpoint = structuredClone(passingFreshCheckpoint);
    delete (checkpoint.checkpoint.singletonCheckpoint as any).observedAt;
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: checkpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'freshCheckpoint: singleton checkpoint observedAt must be an ISO UTC timestamp',
    );
  });

  it('fails closed when a fresh checkpoint singleton observation timestamp is not ISO UTC', () => {
    const checkpoint = structuredClone(passingFreshCheckpoint);
    checkpoint.checkpoint.singletonCheckpoint.observedAt = '2026-05-18 02:30:00';
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: checkpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'freshCheckpoint: singleton checkpoint observedAt must be an ISO UTC timestamp',
    );
  });

  it('fails closed when a fresh checkpoint singleton observation timestamp is stale', () => {
    const checkpoint = structuredClone(passingFreshCheckpoint);
    checkpoint.checkpoint.singletonCheckpoint.observedAt = staleObservedAt();
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: checkpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'freshCheckpoint: singleton checkpoint observedAt must be no older than 15 minutes',
    );
  });

  it('fails closed when a fresh checkpoint singleton observation timestamp is in the future', () => {
    const checkpoint = structuredClone(passingFreshCheckpoint);
    checkpoint.checkpoint.singletonCheckpoint.observedAt = futureObservedAt();
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: checkpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'freshCheckpoint: singleton checkpoint observedAt must not be in the future',
    );
  });

  it('fails closed when a fresh checkpoint singleton node height is missing or mismatched', () => {
    const missing = structuredClone(passingFreshCheckpoint);
    delete (missing.checkpoint.singletonCheckpoint as any).nodeHeight;
    const mismatched = structuredClone(passingFreshCheckpoint);
    mismatched.checkpoint.singletonCheckpoint.nodeHeight = 249;
    const missingReport = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: missing,
    });
    const mismatchedReport = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: mismatched,
    });

    expect(missingReport.status).toBe('BLOCKED');
    expect(missingReport.errors).toContain(
      'freshCheckpoint: singleton checkpoint nodeHeight must be a non-negative safe integer',
    );
    expect(mismatchedReport.status).toBe('BLOCKED');
    expect(mismatchedReport.errors).toContain(
      'freshCheckpoint: singleton checkpoint nodeHeight must match checkpoint.currentErgoHeight',
    );
  });

  it('fails closed when a fresh checkpoint singleton observation points at a different box', () => {
    const checkpoint = structuredClone(passingFreshCheckpoint);
    checkpoint.checkpoint.singletonCheckpoint.singletons[0].observedBoxId = '4'.repeat(64);
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: checkpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'freshCheckpoint: singleton checkpoint observation 1 observed box ID must match deployed_state',
    );
  });

  it('fails closed when a fresh checkpoint singleton observation lacks live testnet node identity', () => {
    const checkpoint = structuredClone(passingFreshCheckpoint);
    checkpoint.checkpoint.singletonCheckpoint.nodeNetwork = 'testnet not connected';
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: checkpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'freshCheckpoint: singleton checkpoint node network must positively identify testnet',
    );
  });

  it('fails closed when a required stage is missing', () => {
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('windowPrep: required artifact is missing');
  });

  it('fails closed when any stage reports broadcast enablement', () => {
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: {
        ...passingPreflight,
        broadcastEnabled: true,
      },
      windowPrep: passingWindowPrep,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('rehearsalPreflight: broadcast must be disabled');
  });

  it('fails closed when any stage includes certification-family live broadcast approval wording', () => {
    for (const phrase of [
      'live broadcast approval certified',
      'certifies live broadcast approval',
      'broadcast endorsed',
    ]) {
      const report = gateTestnetOfflineRehearsalBundle({
        prebroadcast: passingPrebroadcast,
        rehearsalPreflight: {
          ...passingPreflight,
          message: `testnet rehearsal preflight GO; ${phrase}`,
        },
        windowPrep: passingWindowPrep,
        freshCheckpoint: passingFreshCheckpoint,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain('rehearsalPreflight: broadcast must be disabled');
    }
  });

  it('fails closed when any stage targets mainnet', () => {
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: {
        ...passingWindowPrep,
        ergoNodeNetwork: 'mainnet',
      },
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('windowPrep: mainnet is forbidden for offline rehearsal gating');
  });

  it('detects mainnet targets in embedded Markdown without blocking negative claim-control wording', () => {
    const claimControl = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: passingFreshCheckpoint,
    });
    const mainnetTarget = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: {
        ...passingWindowPrep,
        markdown: [
          '# Testnet Live Window Preparation Packet',
          '- Ergo node network: mainnet',
          '- Mainnet production-ready claim allowed: no',
        ].join('\n'),
      },
      freshCheckpoint: passingFreshCheckpoint,
    });

    expect(claimControl.status).toBe('PASS');
    expect(mainnetTarget.status).toBe('BLOCKED');
    expect(mainnetTarget.errors).toContain('windowPrep: mainnet is forbidden for offline rehearsal gating');
  });

  it('fails closed when any stage has a non-pass status', () => {
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: {
        ...passingPrebroadcast,
        status: 'BLOCKED',
      },
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: passingFreshCheckpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('prebroadcast: status must be PASS-equivalent, got BLOCKED');
  });

  it('fails closed when preflight and window-prep package bindings diverge', () => {
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: {
        ...passingWindowPrep,
        packages: [{
          ...passingPackage,
          expectedTxId: 'e'.repeat(64),
          burnTxHashes: ['f'.repeat(64)],
          sidechainHeaderHashHexes: ['2'.repeat(64)],
          bridgeEventRootHexes: ['1'.repeat(64)],
        }],
      },
      freshCheckpoint: passingFreshCheckpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'offline package binding: rehearsalPreflight package 1 expectedTxId must match windowPrep package 1',
    );
    expect(report.errors).toContain(
      'offline package binding: rehearsalPreflight package 1 burnTxHashes must match windowPrep package 1',
    );
    expect(report.errors).toContain(
      'offline package binding: rehearsalPreflight package 1 sidechainHeaderHashHexes must match windowPrep package 1',
    );
    expect(report.errors).toContain(
      'offline package binding: rehearsalPreflight package 1 bridgeEventRootHexes must match windowPrep package 1',
    );
  });

  it('fails closed when prebroadcast and preflight package bindings diverge', () => {
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: {
        ...passingPrebroadcast,
        reports: [{
          linkedAggregateJsonSummaries: [{
            status: 'READ',
            command: 'check-batch',
            expectedTxId: '3'.repeat(64),
          }],
        }],
      },
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: passingFreshCheckpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'offline package binding: prebroadcast linked JSON 1 command must match rehearsalPreflight package 1',
    );
    expect(report.errors).toContain(
      'offline package binding: prebroadcast linked JSON 1 expectedTxId must match rehearsalPreflight package 1',
    );
  });

  it('fails closed when the fresh checkpoint package binding diverges', () => {
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: {
        ...passingFreshCheckpoint,
        checkpoint: {
          ...passingFreshCheckpoint.checkpoint,
          sidechainHeaderHashHexes: ['2'.repeat(64)],
        },
      },
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'offline package binding: freshCheckpoint package 1 sidechainHeaderHashHexes must match rehearsalPreflight package 1',
    );
  });

  it('fails closed when the fresh checkpoint deployed-state hash diverges', () => {
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: {
        ...passingFreshCheckpoint,
        checkpoint: {
          ...passingFreshCheckpoint.checkpoint,
          singletonCheckpoint: {
            ...passingFreshCheckpoint.checkpoint.singletonCheckpoint,
            deployedStateHash: '3'.repeat(64),
          },
        },
        sourceBindings: {
          ...passingFreshCheckpoint.sourceBindings,
          singletonCheckpoint: {
            ...passingFreshCheckpoint.sourceBindings.singletonCheckpoint,
            deployedStateHash: '3'.repeat(64),
          },
        },
      },
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'offline package binding: freshCheckpoint package 1 deployedStateHash must match rehearsalPreflight package 1',
    );
  });

  it('fails closed when the fresh checkpoint claims lifecycle pass or broadcast authority', () => {
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: {
        ...passingFreshCheckpoint,
        checkpoint: {
          ...passingFreshCheckpoint.checkpoint,
          lifecycleStatus: 'pass',
        },
        boundary: {
          ...passingFreshCheckpoint.boundary,
          broadcastAuthorized: true,
          lifecyclePassAllowed: true,
        },
      },
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('freshCheckpoint: checkpoint.lifecycleStatus must be publication blocker');
    expect(report.errors).toContain('freshCheckpoint: boundary.broadcastAuthorized must be false');
    expect(report.errors).toContain('freshCheckpoint: boundary.lifecyclePassAllowed must be false');
  });

  it('fails closed when a fresh checkpoint does not prove check PASS and non-broadcast scope', () => {
    const checkpoint = structuredClone(passingFreshCheckpoint);
    checkpoint.checkpoint.transactionCheckResult = 'FAIL';
    checkpoint.checkpoint.broadcast = 'yes';
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: passingWindowPrep,
      freshCheckpoint: checkpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('freshCheckpoint: checkpoint.transactionCheckResult must be PASS');
    expect(report.errors).toContain('freshCheckpoint: checkpoint.broadcast must be no');
  });

  it('fails closed when a structured window-prep report omits packages', () => {
    const { packages, ...windowPrepWithoutPackages } = passingWindowPrep;
    const report = gateTestnetOfflineRehearsalBundle({
      prebroadcast: passingPrebroadcast,
      rehearsalPreflight: passingPreflight,
      windowPrep: windowPrepWithoutPackages,
      freshCheckpoint: passingFreshCheckpoint,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('windowPrep: packages array is required');
  });
});

describe('readAndGateTestnetOfflineRehearsalBundle', () => {
  it('loads JSON artifacts without executing live commands', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-offline-gate-read-'));
    try {
      const prebroadcastPath = join(dir, 'prebroadcast.json');
      const preflightPath = join(dir, 'preflight.json');
      const windowPrepPath = join(dir, 'window-prep.json');
      const freshCheckpointPath = join(dir, 'fresh-checkpoint.json');
      writeFileSync(prebroadcastPath, JSON.stringify(passingPrebroadcast), 'utf8');
      writeFileSync(preflightPath, JSON.stringify(passingPreflight), 'utf8');
      writeFileSync(windowPrepPath, JSON.stringify(passingWindowPrep), 'utf8');
      writeFileSync(freshCheckpointPath, JSON.stringify(passingFreshCheckpoint), 'utf8');

      const report = readAndGateTestnetOfflineRehearsalBundle({
        prebroadcast: `${basename(dir)}/prebroadcast.json`,
        rehearsalPreflight: `${basename(dir)}/preflight.json`,
        windowPrep: `${basename(dir)}/window-prep.json`,
        freshCheckpoint: `${basename(dir)}/fresh-checkpoint.json`,
      });

      expect(report.status).toBe('PASS');
      expect(report.stages.map(stage => stage.name)).toContain('freshCheckpoint');
      expect(report.lines).toContain('- offline scope: artifact validation only; no broadcast command executed.');

      const paddedReport = readAndGateTestnetOfflineRehearsalBundle({
        prebroadcast: `  ${basename(dir)}/prebroadcast.json  `,
        rehearsalPreflight: `  ${basename(dir)}/preflight.json  `,
        windowPrep: `  ${basename(dir)}/window-prep.json  `,
        freshCheckpoint: `  ${basename(dir)}/fresh-checkpoint.json  `,
      });

      expect(paddedReport.status).toBe('PASS');
      expect(paddedReport.sourceBindings.prebroadcast?.target).toBe(`${basename(dir)}/prebroadcast.json`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    for (const target of [
      'operator/signing-key-offline-gate.json',
      'operator/api-key-offline-gate.json',
      'operator/seed-phrase-offline-gate.json',
      'evidence/sourceTarget=(.env)/offline-gate.json',
      'evidence/sourceTarget=(runtime/bridge-state.sqlite)/offline-gate.json',
      'evidence/sourceTarget=%28.env%29/offline-gate.json',
      'evidence/sourceTarget=%28runtime%2Fbridge-state.sqlite%29/offline-gate.json',
    ]) {
      const secretReport = readAndGateTestnetOfflineRehearsalBundle({
        prebroadcast: target,
        rehearsalPreflight: 'rehearsal-preflight.json',
        windowPrep: 'window-prep.json',
      });
      const serialized = JSON.stringify(secretReport);

      expect(secretReport.status, target).toBe('BLOCKED');
      const targetsRuntimeArtifact =
        target.includes('runtime/bridge-state.sqlite') || target.includes('runtime%2Fbridge-state.sqlite');
      const expectedError = targetsRuntimeArtifact
        ? 'prebroadcast: refusing to read runtime artifact path <blocked artifact target>'
        : 'prebroadcast: refusing to read sensitive artifact path <blocked artifact target>';
      expect(secretReport.errors, target).toContain(expectedError);
      expect(serialized, target).toContain('<blocked artifact target>');
      expect(serialized, target).not.toContain(target);
    }
  });

  it('blocks unsafe CLI JSON output targets before reading offline gate artifacts', () => {
    const jsonOutTarget = '../operator/private-key-report.json';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-offline-rehearsal-gate.ts',
        '--prebroadcast',
        'missing-prebroadcast.json',
        '--preflight',
        'missing-preflight.json',
        '--window-prep',
        'missing-window-prep.json',
        '--fresh-checkpoint',
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
    expect(result.stderr).not.toContain('missing-prebroadcast.json');
    expect(result.stderr).not.toContain('missing-preflight.json');
    expect(result.stderr).not.toContain('missing-window-prep.json');
    expect(result.stderr).not.toContain('missing-fresh-checkpoint.json');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('keeps CLI JSON output guard before offline gate artifact reads', () => {
    const source = readFileSync(
      new URL('./scripts/testnet-offline-rehearsal-gate.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain("import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js'");
    expect(source).toContain('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;');
    expect(source).toContain('const report = readAndGateTestnetOfflineRehearsalBundle({');
    expect(source.indexOf('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;')).toBeLessThan(
      source.indexOf('const report = readAndGateTestnetOfflineRehearsalBundle({'),
    );
  });

  it('blocks local absolute and repo-escape artifact paths before reading them', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-offline-gate-read-'));
    try {
      const absolutePrebroadcastPath = join(dir, 'prebroadcast.json');
      writeFileSync(absolutePrebroadcastPath, JSON.stringify(passingPrebroadcast), 'utf8');

      const absoluteReport = readAndGateTestnetOfflineRehearsalBundle({
        prebroadcast: absolutePrebroadcastPath,
        rehearsalPreflight: `${basename(dir)}/missing-preflight.json`,
        windowPrep: `${basename(dir)}/missing-window-prep.json`,
        freshCheckpoint: `${basename(dir)}/missing-fresh-checkpoint.json`,
      });
      const escapeReport = readAndGateTestnetOfflineRehearsalBundle({
        prebroadcast: '../../outside-prebroadcast.json',
        rehearsalPreflight: `${basename(dir)}/missing-preflight.json`,
        windowPrep: `${basename(dir)}/missing-window-prep.json`,
        freshCheckpoint: `${basename(dir)}/missing-fresh-checkpoint.json`,
      });
      const fileUrlReport = readAndGateTestnetOfflineRehearsalBundle({
        prebroadcast: `file:///${absolutePrebroadcastPath.replace(/\\/g, '/')}`,
        rehearsalPreflight: `${basename(dir)}/missing-preflight.json`,
        windowPrep: `${basename(dir)}/missing-window-prep.json`,
        freshCheckpoint: `${basename(dir)}/missing-fresh-checkpoint.json`,
      });
      const serializedAbsoluteReport = JSON.stringify(absoluteReport);

      expect(absoluteReport.status).toBe('BLOCKED');
      expect(absoluteReport.errors).toContain(
        'prebroadcast: refusing to read local absolute artifact path <blocked artifact target>',
      );
      expect(absoluteReport.errors.join('\n')).not.toContain(absolutePrebroadcastPath);
      expect(serializedAbsoluteReport).toContain('<blocked artifact target>');
      expect(serializedAbsoluteReport).not.toContain('prebroadcast.json');
      expect(escapeReport.status).toBe('BLOCKED');
      expect(escapeReport.errors).toContain(
        'prebroadcast: refusing to read artifact path outside the bridge repository',
      );
      expect(fileUrlReport.status).toBe('BLOCKED');
      expect(fileUrlReport.errors).toContain(
        'prebroadcast: refusing to read local file URL artifact path <blocked artifact target>',
      );
      expect(fileUrlReport.errors.join('\n')).not.toContain(absolutePrebroadcastPath);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('redacts artifact labels when a repository-local path resolves outside the bridge', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-offline-gate-read-'));
    const external = mkdtempSync(join(tmpdir(), 'offline-gate-prebroadcast-'));
    try {
      writeFileSync(join(external, 'prebroadcast.json'), JSON.stringify(passingPrebroadcast), 'utf8');
      symlinkSync(external, join(dir, 'link-out'), process.platform === 'win32' ? 'junction' : 'dir');

      const report = readAndGateTestnetOfflineRehearsalBundle({
        prebroadcast: `${basename(dir)}/link-out/prebroadcast.json`,
        rehearsalPreflight: `${basename(dir)}/missing-preflight.json`,
        windowPrep: `${basename(dir)}/missing-window-prep.json`,
        freshCheckpoint: `${basename(dir)}/missing-fresh-checkpoint.json`,
      });
      const serialized = JSON.stringify(report);

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'prebroadcast: refusing to read artifact path outside the bridge repository',
      );
      expect(serialized).toContain('<blocked artifact target>');
      expect(serialized).not.toContain('link-out');
      expect(serialized).not.toContain('prebroadcast.json');
      expect(serialized).not.toContain(external);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });

  it('writes a structured PASS offline gate report from JSON artifacts', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-offline-gate-report-'));
    try {
      const prebroadcastPath = join(dir, 'prebroadcast.json');
      const preflightPath = join(dir, 'preflight.json');
      const windowPrepPath = join(dir, 'window-prep.json');
      const freshCheckpointPath = join(dir, 'fresh-checkpoint.json');
      writeFileSync(prebroadcastPath, JSON.stringify(passingPrebroadcast), 'utf8');
      writeFileSync(preflightPath, JSON.stringify(passingPreflight), 'utf8');
      writeFileSync(windowPrepPath, JSON.stringify(passingWindowPrep), 'utf8');
      writeFileSync(freshCheckpointPath, JSON.stringify(passingFreshCheckpoint), 'utf8');

      const report = readAndGateTestnetOfflineRehearsalBundle({
        prebroadcast: `${basename(dir)}/prebroadcast.json`,
        rehearsalPreflight: `${basename(dir)}/preflight.json`,
        windowPrep: `${basename(dir)}/window-prep.json`,
        freshCheckpoint: `${basename(dir)}/fresh-checkpoint.json`,
      });
      const writeResult = writeOfflineReportJson(`${basename(dir)}/offline-gate.json`, {
        schemaVersion: 1,
        ...report,
        targetBindings: {
          offlineGate: `${basename(dir)}/offline-gate.json`,
        },
      });
      const saved = JSON.parse(readFileSync(join(dir, 'offline-gate.json'), 'utf8'));

      expect(writeResult.errors).toEqual([]);
      expect(saved.status).toBe('PASS');
      expect(saved.stages.map((stage: { name: string }) => stage.name)).toEqual([
        'prebroadcast',
        'rehearsalPreflight',
        'windowPrep',
        'freshCheckpoint',
      ]);
      expect(saved.stages.map((stage: { target?: string }) => stage.target)).toEqual([
        `${basename(dir)}/prebroadcast.json`,
        `${basename(dir)}/preflight.json`,
        `${basename(dir)}/window-prep.json`,
        `${basename(dir)}/fresh-checkpoint.json`,
      ]);
      expect(saved.sourceBindings).toEqual({
        prebroadcast: { source: 'path', target: `${basename(dir)}/prebroadcast.json` },
        rehearsalPreflight: { source: 'path', target: `${basename(dir)}/preflight.json` },
        windowPrep: { source: 'path', target: `${basename(dir)}/window-prep.json` },
        freshCheckpoint: { source: 'path', target: `${basename(dir)}/fresh-checkpoint.json` },
      });
      expect(saved.targetBindings).toEqual({
        offlineGate: `${basename(dir)}/offline-gate.json`,
      });
      expect(saved.lines.join('\n')).toContain(`target=${basename(dir)}/fresh-checkpoint.json`);
      expect(validateTestnetOfflineRehearsalGateReport(saved).errors).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('validates structured offline gate reports before release-gate chaining', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-offline-gate-validation-'));
    try {
      writeFileSync(join(dir, 'prebroadcast.json'), JSON.stringify(passingPrebroadcast), 'utf8');
      writeFileSync(join(dir, 'preflight.json'), JSON.stringify(passingPreflight), 'utf8');
      writeFileSync(join(dir, 'window-prep.json'), JSON.stringify(passingWindowPrep), 'utf8');
      writeFileSync(join(dir, 'fresh-checkpoint.json'), JSON.stringify(passingFreshCheckpoint), 'utf8');

      const validReport = {
        schemaVersion: 1,
        ...readAndGateTestnetOfflineRehearsalBundle({
          prebroadcast: `${basename(dir)}/prebroadcast.json`,
          rehearsalPreflight: `${basename(dir)}/preflight.json`,
          windowPrep: `${basename(dir)}/window-prep.json`,
          freshCheckpoint: `${basename(dir)}/fresh-checkpoint.json`,
        }),
        targetBindings: {
          offlineGate: `${basename(dir)}/offline-gate.json`,
        },
      };

      expect(validateTestnetOfflineRehearsalGateReport(validReport).errors).toEqual([]);

      const concreteAuditTargets: any = structuredClone(validReport);
      concreteAuditTargets.targetBindings.offlineGate = `${basename(dir)}/template-removal-audit-offline-gate.json`;
      const concreteStageTargets: Record<string, string> = {
        prebroadcast: `${basename(dir)}/sample-size-analysis-prebroadcast.json`,
        rehearsalPreflight: `${basename(dir)}/template-removal-audit-preflight.json`,
        windowPrep: `${basename(dir)}/sample-size-analysis-window-prep.json`,
        freshCheckpoint: `${basename(dir)}/template-removal-audit-fresh-checkpoint.json`,
      };
      for (const stage of concreteAuditTargets.stages) {
        stage.target = concreteStageTargets[stage.name];
        concreteAuditTargets.sourceBindings[stage.name].target = concreteStageTargets[stage.name];
      }

      expect(validateTestnetOfflineRehearsalGateReport(concreteAuditTargets).errors).toEqual([]);

      const contradictoryLines: any = structuredClone(validReport);
      contradictoryLines.lines.push(
        '- Validation summary: PASS exit code 0; validation BLOCKED with 1 structural issue',
      );
      expect(validateTestnetOfflineRehearsalGateReport(contradictoryLines).errors).toContain(
        'offline-gate: lines must not include contradictory failure markers',
      );

      const compatibilityFailureLines: any = structuredClone(validReport);
      compatibilityFailureLines.lines.push(
        '- Validation summary: PASS exit code 0; validation\uFF1A \uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue',
      );
      expect(validateTestnetOfflineRehearsalGateReport(compatibilityFailureLines).errors).toContain(
        'offline-gate: lines must not include contradictory failure markers',
      );

      const structuredFailureLines: any = structuredClone(validReport);
      structuredFailureLines.lines.push('- Validation summary: {"errors":["fresh checkpoint missing"]}');
      expect(validateTestnetOfflineRehearsalGateReport(structuredFailureLines).errors).toContain(
        'offline-gate: lines must not include contradictory failure markers',
      );

      const structuredCountFailureLines: any = structuredClone(validReport);
      structuredCountFailureLines.lines.push('- Validation summary: errorCount: 1');
      expect(validateTestnetOfflineRehearsalGateReport(structuredCountFailureLines).errors).toContain(
        'offline-gate: lines must not include contradictory failure markers',
      );

      const structuredTotalFailureLines: any = structuredClone(validReport);
      structuredTotalFailureLines.lines.push('- Validation summary: errorsTotal=1; failures_total: 2');
      expect(validateTestnetOfflineRehearsalGateReport(structuredTotalFailureLines).errors).toContain(
        'offline-gate: lines must not include contradictory failure markers',
      );

      const structuredSuccessLines: any = structuredClone(validReport);
      structuredSuccessLines.lines.push(
        '- Validation summary: errorCount: 0',
        '- Validation summary: errorsTotal=0; failures_total: 0',
        '- Validation summary: {"errors":[]}',
      );
      expect(validateTestnetOfflineRehearsalGateReport(structuredSuccessLines).errors).toEqual([]);

      const openIssueLines: any = structuredClone(validReport);
      openIssueLines.lines.push('- Open issues: unresolved offline-gate blocker');
      expect(validateTestnetOfflineRehearsalGateReport(openIssueLines).errors).toContain(
        'offline-gate: PASS report lines must not contain remaining issues',
      );

      const compatibilityIssueLines: any = structuredClone(validReport);
      compatibilityIssueLines.lines.push('- \uFF2F\uFF50\uFF45\uFF4E issues\uFF1A unresolved offline-gate blocker');
      expect(validateTestnetOfflineRehearsalGateReport(compatibilityIssueLines).errors).toContain(
        'offline-gate: PASS report lines must not contain remaining issues',
      );

      const knownIssueLines: any = structuredClone(validReport);
      knownIssueLines.lines.push('- Known issues: unresolved offline-gate blocker');
      expect(validateTestnetOfflineRehearsalGateReport(knownIssueLines).errors).toContain(
        'offline-gate: PASS report lines must not contain remaining issues',
      );

      const runtimePayloadLines: any = structuredClone(validReport);
      runtimePayloadLines.lines.push('- State source: runtime/bridge-state.sqlite');
      expect(validateTestnetOfflineRehearsalGateReport(runtimePayloadLines).errors).toContain(
        'offline-gate: lines must not serialize auth, secret, runtime, state, or database payloads',
      );

      const blockedReport: any = structuredClone(validReport);
      blockedReport.status = 'BLOCKED';
      blockedReport.errors = ['prebroadcast: broadcast must be disabled'];

      expect(validateTestnetOfflineRehearsalGateReport(blockedReport).errors).toContain(
        'offline-gate: status must be PASS',
      );
      expect(validateTestnetOfflineRehearsalGateReport(blockedReport).errors).toContain(
        'offline-gate: errors must be empty',
      );

      const missingFreshCheckpoint: any = structuredClone(validReport);
      missingFreshCheckpoint.stages = missingFreshCheckpoint.stages.filter(
        (stage: { name: string }) => stage.name !== 'freshCheckpoint',
      );

      expect(validateTestnetOfflineRehearsalGateReport(missingFreshCheckpoint).errors).toContain(
        'offline-gate: stage freshCheckpoint must be present',
      );

      const escalatedStage: any = structuredClone(validReport);
      escalatedStage.stages[1].passEquivalent = false;

      expect(validateTestnetOfflineRehearsalGateReport(escalatedStage).errors).toContain(
        'offline-gate: stage rehearsalPreflight passEquivalent must be true',
      );

      const missingStageTarget: any = structuredClone(validReport);
      delete missingStageTarget.stages[0].target;

      expect(validateTestnetOfflineRehearsalGateReport(missingStageTarget).errors).toContain(
        'offline-gate: stage prebroadcast target must cite a concrete .json artifact',
      );

      const templateStageTarget: any = structuredClone(validReport);
      templateStageTarget.stages[2].target = 'evidence/template-window-prep.json';

      expect(validateTestnetOfflineRehearsalGateReport(templateStageTarget).errors).toContain(
        'offline-gate: stage windowPrep target must cite a concrete .json artifact',
      );

      const genericStageTarget: any = structuredClone(validReport);
      genericStageTarget.stages[2].target = 'evidence/generic-window-prep.json';

      expect(validateTestnetOfflineRehearsalGateReport(genericStageTarget).errors).toContain(
        'offline-gate: stage windowPrep target must cite a concrete .json artifact',
      );

      const sampleEvidenceStageTarget: any = structuredClone(validReport);
      sampleEvidenceStageTarget.stages[2].target = 'evidence/sample-evidence-window-prep.json';

      expect(validateTestnetOfflineRehearsalGateReport(sampleEvidenceStageTarget).errors).toContain(
        'offline-gate: stage windowPrep target must cite a concrete .json artifact',
      );

      const syntheticStageTarget: any = structuredClone(validReport);
      syntheticStageTarget.stages[2].target = 'evidence/completed-synthetic-window-prep.json';

      expect(validateTestnetOfflineRehearsalGateReport(syntheticStageTarget).errors).toContain(
        'offline-gate: stage windowPrep target must cite a concrete .json artifact',
      );

      const simulatedStageTarget: any = structuredClone(validReport);
      simulatedStageTarget.stages[2].target = 'evidence/completed-simulated-window-prep.json';

      expect(validateTestnetOfflineRehearsalGateReport(simulatedStageTarget).errors).toContain(
        'offline-gate: stage windowPrep target must cite a concrete .json artifact',
      );

      const shellUnsafeStageTarget = 'evidence/offline gate/window-prep.json';
      const shellUnsafeStageTargetReport: any = structuredClone(validReport);
      shellUnsafeStageTargetReport.stages[2].target = shellUnsafeStageTarget;

      const shellUnsafeStageTargetErrors = validateTestnetOfflineRehearsalGateReport(
        shellUnsafeStageTargetReport,
      ).errors;
      expect(shellUnsafeStageTargetErrors).toContain(
        'offline-gate: stage windowPrep target must not contain whitespace or shell metacharacters',
      );
      expect(shellUnsafeStageTargetErrors.join('\n')).not.toContain(shellUnsafeStageTarget);

      const missingSourceBinding: any = structuredClone(validReport);
      delete missingSourceBinding.sourceBindings.rehearsalPreflight;

      expect(validateTestnetOfflineRehearsalGateReport(missingSourceBinding).errors).toContain(
        'offline-gate: sourceBindings.rehearsalPreflight must be present',
      );

      const templateSourceBinding: any = structuredClone(validReport);
      templateSourceBinding.sourceBindings.windowPrep.target = 'evidence/template-window-prep.json';

      expect(validateTestnetOfflineRehearsalGateReport(templateSourceBinding).errors).toContain(
        'offline-gate: sourceBindings.windowPrep.target must cite a concrete .json artifact',
      );

      const genericSourceBinding: any = structuredClone(validReport);
      genericSourceBinding.sourceBindings.windowPrep.target = 'evidence/generic-window-prep.json';

      expect(validateTestnetOfflineRehearsalGateReport(genericSourceBinding).errors).toContain(
        'offline-gate: sourceBindings.windowPrep.target must cite a concrete .json artifact',
      );

      const sampleEvidenceSourceBinding: any = structuredClone(validReport);
      sampleEvidenceSourceBinding.sourceBindings.windowPrep.target = 'evidence/sample-evidence-window-prep.json';

      expect(validateTestnetOfflineRehearsalGateReport(sampleEvidenceSourceBinding).errors).toContain(
        'offline-gate: sourceBindings.windowPrep.target must cite a concrete .json artifact',
      );

      const syntheticSourceBinding: any = structuredClone(validReport);
      syntheticSourceBinding.sourceBindings.windowPrep.target = 'evidence/completed-synthetic-window-prep.json';

      expect(validateTestnetOfflineRehearsalGateReport(syntheticSourceBinding).errors).toContain(
        'offline-gate: sourceBindings.windowPrep.target must cite a concrete .json artifact',
      );

      const simulatedSourceBinding: any = structuredClone(validReport);
      simulatedSourceBinding.sourceBindings.windowPrep.target = 'evidence/completed-simulated-window-prep.json';

      expect(validateTestnetOfflineRehearsalGateReport(simulatedSourceBinding).errors).toContain(
        'offline-gate: sourceBindings.windowPrep.target must cite a concrete .json artifact',
      );

      const shellUnsafeSourceBindingTarget = 'evidence/offline gate/window-prep.json';
      const shellUnsafeSourceBinding: any = structuredClone(validReport);
      shellUnsafeSourceBinding.sourceBindings.windowPrep.target = shellUnsafeSourceBindingTarget;

      const shellUnsafeSourceBindingErrors = validateTestnetOfflineRehearsalGateReport(
        shellUnsafeSourceBinding,
      ).errors;
      expect(shellUnsafeSourceBindingErrors).toContain(
        'offline-gate: sourceBindings.windowPrep.target must not contain whitespace or shell metacharacters',
      );
      expect(shellUnsafeSourceBindingErrors.join('\n')).not.toContain(shellUnsafeSourceBindingTarget);

      const payloadLeakingSourceBinding: any = structuredClone(validReport);
      payloadLeakingSourceBinding.sourceBindings.prebroadcast.authHeader = 'Bearer redacted';
      payloadLeakingSourceBinding.sourceBindings.windowPrep.runtimePath = 'bridge-state.sqlite';
      payloadLeakingSourceBinding.sourceBindings.freshCheckpoint.statePath = 'bridge-state.json';

      expect(validateTestnetOfflineRehearsalGateReport(payloadLeakingSourceBinding).errors).toContain(
        'offline-gate: sourceBindings must not serialize auth, secret, runtime, state, or database payloads',
      );

      for (const target of [
        'operator/signing-key-source.json',
        'operator/api-key-source.json',
        'operator/seed-phrase-source.json',
        'state/deployed_state.json',
        'sourceTarget=%28.env%29',
        'sourceTarget=%28runtime%2Fbridge-state.sqlite%29',
      ]) {
        const sensitiveTargetSourceBinding: any = structuredClone(validReport);
        sensitiveTargetSourceBinding.sourceBindings.prebroadcast.sourceTarget = target;

        expect(
          validateTestnetOfflineRehearsalGateReport(sensitiveTargetSourceBinding).errors,
          target,
        ).toContain(
          'offline-gate: sourceBindings must not serialize auth, secret, runtime, state, or database payloads',
        );
      }

      const missingTargetBinding: any = structuredClone(validReport);
      delete missingTargetBinding.targetBindings.offlineGate;

      expect(validateTestnetOfflineRehearsalGateReport(missingTargetBinding).errors).toContain(
        'offline-gate: targetBindings.offlineGate must cite a concrete .json artifact',
      );

      const genericTargetBindingReport: any = structuredClone(validReport);
      genericTargetBindingReport.targetBindings.offlineGate = 'evidence/generic-offline-gate.json';

      expect(validateTestnetOfflineRehearsalGateReport(genericTargetBindingReport).errors).toContain(
        'offline-gate: targetBindings.offlineGate must cite a concrete .json artifact',
      );

      const syntheticTargetBindingReport: any = structuredClone(validReport);
      syntheticTargetBindingReport.targetBindings.offlineGate = 'evidence/completed-synthetic-offline-gate.json';

      expect(validateTestnetOfflineRehearsalGateReport(syntheticTargetBindingReport).errors).toContain(
        'offline-gate: targetBindings.offlineGate must cite a concrete .json artifact',
      );

      const simulatedTargetBindingReport: any = structuredClone(validReport);
      simulatedTargetBindingReport.targetBindings.offlineGate = 'evidence/completed-simulated-offline-gate.json';

      expect(validateTestnetOfflineRehearsalGateReport(simulatedTargetBindingReport).errors).toContain(
        'offline-gate: targetBindings.offlineGate must cite a concrete .json artifact',
      );

      const shellUnsafeTargetBinding = 'evidence/offline gate/offline-gate.json';
      const shellUnsafeTargetBindingReport: any = structuredClone(validReport);
      shellUnsafeTargetBindingReport.targetBindings.offlineGate = shellUnsafeTargetBinding;

      const shellUnsafeTargetBindingErrors = validateTestnetOfflineRehearsalGateReport(
        shellUnsafeTargetBindingReport,
      ).errors;
      expect(shellUnsafeTargetBindingErrors).toContain(
        'offline-gate: targetBindings.offlineGate must not contain whitespace or shell metacharacters',
      );
      expect(shellUnsafeTargetBindingErrors.join('\n')).not.toContain(shellUnsafeTargetBinding);

      const targetlessObjectReport = {
        schemaVersion: 1,
        ...gateTestnetOfflineRehearsalBundle({
          prebroadcast: passingPrebroadcast,
          rehearsalPreflight: passingPreflight,
          windowPrep: passingWindowPrep,
          freshCheckpoint: passingFreshCheckpoint,
        }),
      };

      expect(validateTestnetOfflineRehearsalGateReport(targetlessObjectReport).errors).toContain(
        'offline-gate: stage prebroadcast source must be path',
      );
      expect(validateTestnetOfflineRehearsalGateReport(targetlessObjectReport).errors).toContain(
        'offline-gate: stage prebroadcast target must cite a concrete .json artifact',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes a structured BLOCKED offline gate report', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-offline-gate-report-'));
    try {
      const report = gateTestnetOfflineRehearsalBundle({
        prebroadcast: passingPrebroadcast,
        rehearsalPreflight: {
          ...passingPreflight,
          broadcastEnabled: true,
        },
        windowPrep: passingWindowPrep,
      });
      const writeResult = writeOfflineReportJson(`${basename(dir)}/offline-gate-blocked.json`, {
        schemaVersion: 1,
        ...report,
      });
      const saved = JSON.parse(readFileSync(join(dir, 'offline-gate-blocked.json'), 'utf8'));

      expect(writeResult.errors).toEqual([]);
      expect(saved.status).toBe('BLOCKED');
      expect(saved.errors).toContain('rehearsalPreflight: broadcast must be disabled');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('redacts sensitive artifact path labels before reporting path errors', () => {
    const envFileName = '.' + 'env';
    const secretDlogFileName = `secrets.${'dlog'}`;

    const report = readAndGateTestnetOfflineRehearsalBundle({
      prebroadcast: envFileName,
      rehearsalPreflight: secretDlogFileName,
      windowPrep: 'window-prep.json',
    });
    const rendered = report.errors.join('\n');

    expect(report.status).toBe('BLOCKED');
    expect(rendered).toContain('<blocked artifact target>');
    expect(rendered).not.toContain(envFileName);
    expect(rendered).not.toContain(secretDlogFileName);

    const dir = mkdtempSync(join(process.cwd(), '.tmp-offline-gate-report-'));
    try {
      const writeResult = writeOfflineReportJson(`${basename(dir)}/redacted-offline-gate.json`, {
        schemaVersion: 1,
        ...report,
      });
      const savedText = readFileSync(join(dir, 'redacted-offline-gate.json'), 'utf8');
      expect(writeResult.errors).toEqual([]);
      expect(savedText).toContain('<blocked artifact target>');
      expect(savedText).not.toContain(envFileName);
      expect(savedText).not.toContain(secretDlogFileName);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks runtime-state artifact paths before reading them', () => {
    const report = readAndGateTestnetOfflineRehearsalBundle({
      prebroadcast: 'runtime/bridge.sqlite',
      rehearsalPreflight: 'contracts/deployed_state.json',
      windowPrep: 'window-prep.json',
      freshCheckpoint: 'fresh-checkpoint.json',
    });
    const rendered = report.errors.join('\n');

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'prebroadcast: refusing to read runtime artifact path <blocked artifact target>',
    );
    expect(report.errors).toContain(
      'rehearsalPreflight: refusing to read runtime artifact path <blocked artifact target>',
    );
    expect(rendered).not.toContain('runtime/bridge.sqlite');
    expect(rendered).not.toContain('contracts/deployed_state.json');
  });
});
