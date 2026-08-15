import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import { validateRecoveryObserveJsonReport } from './recovery-observe-json.js';

const EXPECTED_TX_ID = 'a'.repeat(64);
const BURN_TX_ID = 'b'.repeat(64);
const SINGLETON_ID = 'c'.repeat(64);
const PHASE1_BOX_ID = 'd'.repeat(64);

function baseBoundary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
    ...overrides,
  };
}

function baseSourceBindings(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
    ...overrides,
  };
}

function failedBroadcastReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    status: 'PASS',
    message: 'testnet recovery no-broadcast observation PASS',
    errors: [],
    kind: 'failed-broadcast-phantom-avl',
    observedAt: '2026-05-18T08:00:00.000Z',
    pegOutBurnTxId: BURN_TX_ID,
    expectedTxId: EXPECTED_TX_ID,
    node: {
      observedAt: '2026-05-18T08:00:00.000Z',
      nodeHeight: 123,
      nodeNetwork: 'testnet',
      expectedTxId: EXPECTED_TX_ID,
      confirmedChain: false,
      mempool: false,
    },
    state: {
      aggregateAttempt: {
        expectedTxId: EXPECTED_TX_ID,
        submittedTxId: EXPECTED_TX_ID,
        status: 'submitted',
        mode: 'single',
        burnTxHashes: [BURN_TX_ID],
      },
      pegOut: {
        burnTxHash: BURN_TX_ID,
        status: 'aggregate_submitted',
        phase1BoxId: null,
        phase2UnlockTxId: null,
        pendingAvlKey: null,
      },
      avlKeyPresent: false,
      pendingDupHeartbeatForTx: false,
    },
    sourceBindings: baseSourceBindings(),
    observationBoundary: baseBoundary(),
    lines: failedBroadcastLines(),
    ...overrides,
  };
}

function reorgReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    status: 'PASS',
    message: 'testnet recovery no-broadcast observation PASS',
    errors: [],
    kind: 'reorged-burn-stale-singleton',
    observedAt: '2026-05-18T08:00:00.000Z',
    pegOutBurnTxId: BURN_TX_ID,
    singletonInventoryId: SINGLETON_ID,
    node: {
      observedAt: '2026-05-18T08:00:00.000Z',
      nodeHeight: 123,
      nodeNetwork: 'testnet',
    },
    state: {
      avlKeyPresent: true,
      spvTrackerKeyPresent: true,
      pendingDupHeartbeatForTx: false,
      reorgCandidate: {
        burnTxHash: BURN_TX_ID,
        pendingAvlKey: BURN_TX_ID,
        status: 'burn_reverted',
        phase1BoxId: PHASE1_BOX_ID,
      },
    },
    sourceBindings: baseSourceBindings(),
    observationBoundary: baseBoundary(),
    lines: reorgLines(),
    ...overrides,
  };
}

function stateOf(report: Record<string, unknown>): Record<string, unknown> {
  const state = report.state;
  if (typeof state !== 'object' || state === null || Array.isArray(state)) {
    throw new Error('test report state must be an object');
  }
  return state as Record<string, unknown>;
}

function failedBroadcastLines(): string[] {
  return [
    'testnet recovery no-broadcast observation PASS',
    '- kind: failed-broadcast-phantom-avl',
    `- peg-out burn TX ID: ${BURN_TX_ID}`,
    `- Expected transaction ID: ${EXPECTED_TX_ID}`,
  ];
}

function reorgLines(): string[] {
  return [
    'testnet recovery no-broadcast observation PASS',
    '- kind: reorged-burn-stale-singleton',
    `- peg-out burn TX ID: ${BURN_TX_ID}`,
    `- singleton inventory identifier: ${SINGLETON_ID}`,
  ];
}

describe('recovery observe JSON validation', () => {
  it('accepts failed-broadcast observations that prove no tx, no phantom AVL, and read-only boundaries', () => {
    const result = validateRecoveryObserveJsonReport(failedBroadcastReport(), 'failed-broadcast-phantom-avl');

    expect(result.errors).toEqual([]);
    expect(result.kind).toBe('failed-broadcast-phantom-avl');
  });

  it('rejects weakened status, non-empty errors, and boundary escalation', () => {
    const result = validateRecoveryObserveJsonReport(failedBroadcastReport({
      status: 'BLOCKED',
      errors: ['still unsafe'],
      observationBoundary: baseBoundary({
        broadcastAuthorized: true,
        confirmationObserved: true,
        gate3ClosureAllowed: true,
        testnetProductionCandidateClaimAllowed: true,
      }),
    }));

    expect(result.errors).toContain('recovery-observe: JSON report status must be PASS');
    expect(result.errors).toContain('recovery-observe: JSON report errors must be empty');
    expect(result.errors).toContain('recovery-observe: observationBoundary.broadcastAuthorized must be false');
    expect(result.errors).toContain('recovery-observe: observationBoundary.confirmationObserved must be false');
    expect(result.errors).toContain('recovery-observe: observationBoundary.gate3ClosureAllowed must be false');
    expect(result.errors).toContain(
      'recovery-observe: observationBoundary.testnetProductionCandidateClaimAllowed must be false',
    );
  });

  it('rejects PASS messages contradicted by failure markers', () => {
    const result = validateRecoveryObserveJsonReport(failedBroadcastReport({
      message: 'testnet recovery no-broadcast observation PASS, but validation BLOCKED with 1 structural issue',
    }));

    expect(result.errors).toContain(
      'recovery-observe: JSON report message must identify internally positive PASS status',
    );
  });

  it('rejects transcript lines contradicted by failure markers', () => {
    const result = validateRecoveryObserveJsonReport(failedBroadcastReport({
      lines: [
        'recovery-observe JSON PASS exit code 0',
        'recovery-observe JSON BLOCKED: 1 structural issue(s)',
      ],
    }));

    expect(result.errors).toContain(
      'recovery-observe: JSON report lines must not include contradictory failure markers',
    );
  });

  it('rejects transcript lines with compatibility-normalized failure markers', () => {
    const marker = 'validation\uFF1A \uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue';
    const result = validateRecoveryObserveJsonReport(failedBroadcastReport({
      lines: [
        'recovery-observe JSON PASS exit code 0',
        `recovery-observe JSON ${marker}`,
      ],
    }));

    expect(result.errors).toContain(
      'recovery-observe: JSON report lines must not include contradictory failure markers',
    );
  });

  it('rejects transcript lines with structured failure fields', () => {
    const errors = validateRecoveryObserveJsonReport(failedBroadcastReport({
      lines: [
        ...failedBroadcastLines(),
        'recovery-observe JSON summary: {"errors":["state binding drift"]}',
      ],
    }));
    const count = validateRecoveryObserveJsonReport(failedBroadcastReport({
      lines: [
        ...failedBroadcastLines(),
        'recovery-observe JSON summary: errorCount: 1',
      ],
    }));
    const totals = validateRecoveryObserveJsonReport(failedBroadcastReport({
      lines: [
        ...failedBroadcastLines(),
        'recovery-observe JSON summary: errorsTotal=1; failures_total: 2',
      ],
    }));
    const success = validateRecoveryObserveJsonReport(failedBroadcastReport({
      lines: [
        ...failedBroadcastLines(),
        'recovery-observe JSON summary: {"errors":[]}',
        'recovery-observe JSON summary: errorCount: 0',
        'recovery-observe JSON summary: errorsTotal=0; failures_total: 0',
      ],
    }));

    expect(errors.errors).toContain(
      'recovery-observe: JSON report lines must not include contradictory failure markers',
    );
    expect(count.errors).toContain(
      'recovery-observe: JSON report lines must not include contradictory failure markers',
    );
    expect(totals.errors).toContain(
      'recovery-observe: JSON report lines must not include contradictory failure markers',
    );
    expect(success.errors).toEqual([]);
  });

  it('rejects transcript lines with remaining issue markers', () => {
    const result = validateRecoveryObserveJsonReport(failedBroadcastReport({
      lines: [
        'recovery-observe JSON PASS exit code 0',
        '- Remaining issues:',
        '  - unresolved recovery observation blocker',
      ],
    }));

    expect(result.errors).toContain(
      'recovery-observe: JSON report lines must not include remaining issues',
    );
  });

  it('rejects transcript lines with compatibility-normalized issue markers', () => {
    const result = validateRecoveryObserveJsonReport(failedBroadcastReport({
      lines: [
        'recovery-observe JSON PASS exit code 0',
        '- \uFF2F\uFF50\uFF45\uFF4E issues\uFF1A unresolved recovery observation blocker',
      ],
    }));

    expect(result.errors).toContain(
      'recovery-observe: JSON report lines must not include remaining issues',
    );
  });

  it('rejects transcript lines with open or known issue markers', () => {
    const openIssues = validateRecoveryObserveJsonReport(failedBroadcastReport({
      lines: [
        'recovery-observe JSON PASS exit code 0',
        '- Open issues: unresolved recovery observation blocker',
      ],
    }));
    const knownIssues = validateRecoveryObserveJsonReport(failedBroadcastReport({
      lines: [
        'recovery-observe JSON PASS exit code 0',
        '- Known issues: unresolved recovery observation blocker',
      ],
    }));

    expect(openIssues.errors).toContain(
      'recovery-observe: JSON report lines must not include remaining issues',
    );
    expect(knownIssues.errors).toContain(
      'recovery-observe: JSON report lines must not include remaining issues',
    );
  });

  it('allows transcript lines with explicit empty collection issue closures', () => {
    const result = validateRecoveryObserveJsonReport(failedBroadcastReport({
      lines: [
        ...failedBroadcastLines(),
        '- Open issues: []',
        '- Known findings: {}',
      ],
    }));

    expect(result.errors).toEqual([]);
  });

  it('rejects generic PASS transcript lines that omit recovery identity bindings', () => {
    const failedBroadcast = validateRecoveryObserveJsonReport(failedBroadcastReport({
      lines: ['testnet recovery no-broadcast observation PASS'],
    }));
    const reorg = validateRecoveryObserveJsonReport(reorgReport({
      lines: ['testnet recovery no-broadcast observation PASS'],
    }));

    expect(failedBroadcast.errors).toContain(
      'recovery-observe: JSON report lines must bind the recovery observation kind',
    );
    expect(failedBroadcast.errors).toContain('recovery-observe: JSON report lines must bind pegOutBurnTxId');
    expect(failedBroadcast.errors).toContain('recovery-observe: JSON report lines must bind expectedTxId');
    expect(reorg.errors).toContain('recovery-observe: JSON report lines must bind singletonInventoryId');
  });

  it('rejects transcript lines with boolean structured unresolved issue fields', () => {
    const result = validateRecoveryObserveJsonReport(failedBroadcastReport({
      lines: [
        'recovery-observe JSON PASS exit code 0',
        '- JSON summary: hasOpenIssues: true',
      ],
    }));

    expect(result.errors).toContain(
      'recovery-observe: JSON report lines must not include remaining issues',
    );
  });

  it('requires transcript lines to prove positive PASS output', () => {
    const result = validateRecoveryObserveJsonReport(failedBroadcastReport({
      lines: ['read-only testnet recovery observation captured'],
    }));

    expect(result.errors).toContain(
      'recovery-observe: JSON report lines must include internally positive PASS output',
    );
  });

  it('rejects failed-broadcast reports that still observe tx or phantom DUP state', () => {
    const report = failedBroadcastReport({
      node: {
        observedAt: '2026-05-18T08:00:00.000Z',
        nodeHeight: 123,
        nodeNetwork: 'testnet',
        expectedTxId: EXPECTED_TX_ID,
        confirmedChain: true,
        mempool: true,
      },
      state: {
        ...stateOf(failedBroadcastReport()),
        avlKeyPresent: true,
        pendingDupHeartbeatForTx: true,
      },
    });
    const result = validateRecoveryObserveJsonReport(report);

    expect(result.errors).toContain(
      'recovery-observe: failed-broadcast node observation must prove expectedTxId is absent from confirmed chain',
    );
    expect(result.errors).toContain(
      'recovery-observe: failed-broadcast node observation must prove expectedTxId is absent from mempool',
    );
    expect(result.errors).toContain('recovery-observe: failed-broadcast state must prove no DUP AVL key was inserted');
    expect(result.errors).toContain('recovery-observe: state.pendingDupHeartbeatForTx must be false');
  });

  it('rejects failed-broadcast reports without aggregate attempt or peg-out state bindings', () => {
    const result = validateRecoveryObserveJsonReport(failedBroadcastReport({
      state: {
        avlKeyPresent: false,
        pendingDupHeartbeatForTx: false,
      },
    }));

    expect(result.errors).toContain(
      'recovery-observe: failed-broadcast state must include aggregateAttempt for expectedTxId',
    );
    expect(result.errors).toContain('recovery-observe: failed-broadcast state must include pegOut for pegOutBurnTxId');
  });

  it('rejects failed-broadcast aggregate attempts whose status and submitted transaction binding drift', () => {
    const missingSubmittedId = validateRecoveryObserveJsonReport(failedBroadcastReport({
      state: {
        ...stateOf(failedBroadcastReport()),
        aggregateAttempt: {
          expectedTxId: EXPECTED_TX_ID,
          submittedTxId: null,
          status: 'submitted',
          mode: 'single',
          burnTxHashes: [BURN_TX_ID],
        },
      },
    }));
    const pendingWithSubmittedId = validateRecoveryObserveJsonReport(failedBroadcastReport({
      state: {
        ...stateOf(failedBroadcastReport()),
        aggregateAttempt: {
          expectedTxId: EXPECTED_TX_ID,
          submittedTxId: EXPECTED_TX_ID,
          status: 'pending',
          mode: 'single',
          burnTxHashes: [BURN_TX_ID],
        },
      },
    }));

    expect(missingSubmittedId.errors).toContain(
      'recovery-observe: failed-broadcast submitted aggregateAttempt must include submittedTxId matching expectedTxId',
    );
    expect(pendingWithSubmittedId.errors).toContain(
      'recovery-observe: failed-broadcast pending or abandoned aggregateAttempt must not include submittedTxId',
    );
  });

  it('accepts reorg observations with a recoverable stale singleton candidate', () => {
    const result = validateRecoveryObserveJsonReport(reorgReport(), 'reorged-burn-stale-singleton');

    expect(result.errors).toEqual([]);
    expect(result.kind).toBe('reorged-burn-stale-singleton');
  });

  it('rejects reorg observations without a recoverable candidate or singleton evidence', () => {
    const state = stateOf(reorgReport());
    const result = validateRecoveryObserveJsonReport(reorgReport({
      state: {
        ...state,
        spvTrackerKeyPresent: false,
        reorgCandidate: {
          burnTxHash: BURN_TX_ID,
          pendingAvlKey: null,
          status: 'phase2_unlocked',
          phase1BoxId: 'not-hex',
        },
      },
    }));

    expect(result.errors).toContain(
      'recovery-observe: reorg state must prove the singleton inventory key is present before recovery',
    );
    expect(result.errors).toContain('recovery-observe: reorg candidate pendingAvlKey must be 32-byte hex');
    expect(result.errors).toContain('recovery-observe: reorg candidate phase1BoxId must be 32-byte hex');
    expect(result.errors).toContain('recovery-observe: reorg candidate status must be phase1_created or burn_reverted');
  });

  it('rejects mainnet or negated-testnet network observations', () => {
    const mainnet = validateRecoveryObserveJsonReport(failedBroadcastReport({
      node: {
        observedAt: '2026-05-18T08:00:00.000Z',
        nodeHeight: 123,
        nodeNetwork: 'mainnet testnet',
        expectedTxId: EXPECTED_TX_ID,
        confirmedChain: false,
        mempool: false,
      },
    }));
    const negated = validateRecoveryObserveJsonReport(reorgReport({
      node: {
        observedAt: '2026-05-18T08:00:00.000Z',
        nodeHeight: 123,
        nodeNetwork: 'not testnet',
      },
    }));

    expect(mainnet.errors).toContain('recovery-observe: node.nodeNetwork must positively identify testnet');
    expect(negated.errors).toContain('recovery-observe: node.nodeNetwork must positively identify testnet');
  });

  it('rejects recovery observations whose node timestamp drifts from the report timestamp', () => {
    const result = validateRecoveryObserveJsonReport(failedBroadcastReport({
      observedAt: '2026-05-18T08:00:01.000Z',
    }));

    expect(result.errors).toContain('recovery-observe: node.observedAt must match the top-level observedAt');
  });

  it('requires recovery observation source bindings without runtime path serialization', () => {
    const missing = validateRecoveryObserveJsonReport(failedBroadcastReport({
      sourceBindings: undefined,
    }));
    const weakened = validateRecoveryObserveJsonReport(failedBroadcastReport({
      sourceBindings: baseSourceBindings({
        node: {
          sourceType: 'provided-json',
          readOnly: false,
          noAuthHeader: false,
          observedAt: '2026-05-18T08:01:00.000Z',
          nodeHeight: 124,
          nodeNetwork: 'not testnet',
          url: 'http://127.0.0.1:9052',
        },
        state: {
          sourceType: 'read-write-state-tracker',
          readOnly: false,
          runtimePathSerialized: true,
          targetClass: 'C:/tmp/bridge-state.sqlite',
        },
      }),
    }));

    expect(missing.errors).toContain('recovery-observe: sourceBindings object is required');
    expect(weakened.errors).toContain('recovery-observe: sourceBindings.node.sourceType must be live-read-only-node');
    expect(weakened.errors).toContain('recovery-observe: sourceBindings.node.readOnly must be true');
    expect(weakened.errors).toContain('recovery-observe: sourceBindings.node.noAuthHeader must be true');
    expect(weakened.errors).toContain('recovery-observe: sourceBindings.node.observedAt must match node.observedAt');
    expect(weakened.errors).toContain('recovery-observe: sourceBindings.node.nodeHeight must match node.nodeHeight');
    expect(weakened.errors).toContain('recovery-observe: sourceBindings.node.nodeNetwork must positively identify testnet');
    expect(weakened.errors).toContain('recovery-observe: sourceBindings.node.nodeNetwork must match node.nodeNetwork');
    expect(weakened.errors).toContain('recovery-observe: sourceBindings.node must not serialize URLs, local paths, runtime files, or secret-bearing material');
    expect(weakened.errors).toContain('recovery-observe: sourceBindings.state.sourceType must be read-only-state-tracker');
    expect(weakened.errors).toContain('recovery-observe: sourceBindings.state.readOnly must be true');
    expect(weakened.errors).toContain('recovery-observe: sourceBindings.state.runtimePathSerialized must be false');
    expect(weakened.errors).toContain('recovery-observe: sourceBindings.state.targetClass must be operator-provided-state-db');
    expect(weakened.errors).toContain('recovery-observe: sourceBindings.state must not serialize URLs, local paths, runtime files, or secret-bearing material');
  });

  it('rejects default runtime database source bindings', () => {
    const result = validateRecoveryObserveJsonReport(failedBroadcastReport({
      sourceBindings: baseSourceBindings({
        state: {
          sourceType: 'read-only-state-tracker',
          readOnly: true,
          runtimePathSerialized: false,
          targetClass: 'default-state-db',
        },
      }),
    }));

    expect(result.errors).toContain(
      'recovery-observe: sourceBindings.state.targetClass must be operator-provided-state-db',
    );
  });

  it('rejects recovery observation source binding operations that describe broadcast or repair work', () => {
    const sourceBindings = baseSourceBindings();
    (sourceBindings.node as Record<string, unknown>).operations = [
      'read-only node info query',
      'broadcast submitted transaction',
    ];
    (sourceBindings.state as Record<string, unknown>).operations = [
      'read-only peg-out state',
      'repair state tracker',
    ];

    const result = validateRecoveryObserveJsonReport(failedBroadcastReport({
      sourceBindings,
    }));

    expect(result.errors).toContain(
      'recovery-observe: sourceBindings.node.operations must not include signing, submission, broadcast, repair, reconciliation, or mutation operations',
    );
    expect(result.errors).toContain(
      'recovery-observe: sourceBindings.state.operations must not include signing, submission, broadcast, repair, reconciliation, or mutation operations',
    );
  });

  it('rejects recovery observation source bindings with auth or runtime payload keys', () => {
    const sourceBindings = baseSourceBindings();
    (sourceBindings.node as Record<string, unknown>).authHeader = 'redacted';
    (sourceBindings.state as Record<string, unknown>).runtimePath = 'bridge-state.json';

    const result = validateRecoveryObserveJsonReport(failedBroadcastReport({
      sourceBindings,
    }));

    expect(result.errors).toContain(
      'recovery-observe: sourceBindings.node must not serialize URLs, local paths, runtime files, or secret-bearing material',
    );
    expect(result.errors).toContain(
      'recovery-observe: sourceBindings.state must not serialize URLs, local paths, runtime files, or secret-bearing material',
    );
  });

  it('rejects recovery observation source bindings with shared secret-bearing provenance names', () => {
    const sourceBindings = baseSourceBindings();
    const nodeSecretName = 'signing-key';
    const stateSecretName = 'seed-phrase';
    (sourceBindings.node as Record<string, unknown>).provenanceLabel = nodeSecretName;
    (sourceBindings.state as Record<string, unknown>).provenanceLabel = stateSecretName;

    const result = validateRecoveryObserveJsonReport(failedBroadcastReport({
      sourceBindings,
    }));

    expect(result.errors).toContain(
      'recovery-observe: sourceBindings.node must not serialize URLs, local paths, runtime files, or secret-bearing material',
    );
    expect(result.errors).toContain(
      'recovery-observe: sourceBindings.state must not serialize URLs, local paths, runtime files, or secret-bearing material',
    );
    expect(result.errors.join('\n')).not.toContain(nodeSecretName);
    expect(result.errors.join('\n')).not.toContain(stateSecretName);
  });

  it('rejects recovery observation source bindings with punctuation-wrapped environment or runtime names', () => {
    for (const [nodeTarget, stateTarget] of [
      ['sourceTarget=(.env)', 'sourceTarget=(bridge-state.sqlite)'],
      ['sourceTarget=%28.env%29', 'sourceTarget=%28runtime%2Fbridge-state.sqlite%29'],
    ]) {
      const sourceBindings = baseSourceBindings();
      (sourceBindings.node as Record<string, unknown>).provenanceLabel = nodeTarget;
      (sourceBindings.state as Record<string, unknown>).provenanceLabel = stateTarget;

      const result = validateRecoveryObserveJsonReport(failedBroadcastReport({
        sourceBindings,
      }));

      expect(result.errors).toContain(
        'recovery-observe: sourceBindings.node must not serialize URLs, local paths, runtime files, or secret-bearing material',
      );
      expect(result.errors).toContain(
        'recovery-observe: sourceBindings.state must not serialize URLs, local paths, runtime files, or secret-bearing material',
      );
    }
  });

  it('rejects recovery observation source bindings with encoded local-only provenance labels', () => {
    const sourceBindings = baseSourceBindings();
    (sourceBindings.node as Record<string, unknown>).provenanceLabel = [
      'sourceTarget=',
      'file%3A%2F%2F%2F',
      'C%3A%2F',
      'tmp%2F',
      'recovery-node.json',
    ].join('');
    (sourceBindings.state as Record<string, unknown>).provenanceLabel = [
      'sourceTarget=%2F',
      'tmp%2F',
      'recovery-state.json',
    ].join('');

    const result = validateRecoveryObserveJsonReport(failedBroadcastReport({
      sourceBindings,
    }));

    expect(result.errors).toContain(
      'recovery-observe: sourceBindings.node must not serialize URLs, local paths, runtime files, or secret-bearing material',
    );
    expect(result.errors).toContain(
      'recovery-observe: sourceBindings.state must not serialize URLs, local paths, runtime files, or secret-bearing material',
    );
  });

  it('rejects transcript lines that serialize node URLs or runtime state targets', () => {
    const result = validateRecoveryObserveJsonReport(failedBroadcastReport({
      lines: [
        ...failedBroadcastLines(),
        'read-only node source http://127.0.0.1:9052',
        'state source bridge-state.sqlite',
      ],
    }));

    expect(result.errors).toContain(
      'recovery-observe: JSON report lines must not serialize URLs, local paths, runtime files, or secret-bearing material',
    );
  });

  it('blocks unsafe validator CLI JSON targets without leaking the requested path', () => {
    const target = '../operator/private-key-recovery-observe.json';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-recovery-observe-json.ts',
        target,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('<blocked JSON evidence target>: recovery-observe JSON BLOCKED:');
    expect(result.stdout).toContain(
      '<blocked JSON evidence target>: refusing to read secret-bearing or runtime-state JSON evidence',
    );
    expect(result.stdout).not.toContain(target);
    expect(result.stdout).not.toContain(process.cwd());
  });

  it('reports malformed validator CLI JSON without leaking parser stacks or local paths', () => {
    const tmpDir = mkdtempSync('.tmp-recovery-observe-validator-');
    const target = join(tmpDir, 'malformed-recovery-observe.json').replace(/\\/g, '/');

    try {
      writeFileSync(target, '{', 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/validate-recovery-observe-json.ts',
          target,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain(`${target}: recovery-observe JSON BLOCKED: 1 structural issue(s).`);
      expect(result.stdout).toContain(`${target}: JSON evidence could not be parsed`);
      expect(result.stdout).not.toContain('SyntaxError');
      expect(result.stdout).not.toContain('JSON.parse');
      expect(result.stdout).not.toContain(process.cwd());
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('reports validator CLI option errors without parser stacks or local paths', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-recovery-observe-json.ts',
        '--bad-option',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Unknown argument: --bad-option');
    expect(result.stderr).toContain('Usage:');
    expect(result.stderr).not.toContain('Error:');
    expect(result.stderr).not.toContain('src/scripts/validate-recovery-observe-json.ts');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('keeps the validator CLI read-only and away from signer or broadcast surfaces', () => {
    const source = readFileSync(join(process.cwd(), 'src/scripts/validate-recovery-observe-json.ts'), 'utf8');

    expect(source).toContain('readEvidenceJsonTarget');
    expect(source).toContain('validateRecoveryObserveJsonReport');
    expect(source).toContain("const { errors, label, json } = readEvidenceJsonTarget(args.target, '--recovery-observe-json');");
    expect(source).toContain('const validation = validateRecoveryObserveJsonReport(json, args.kind);');
    expect(source.indexOf("const { errors, label, json } = readEvidenceJsonTarget(args.target, '--recovery-observe-json');"))
      .toBeLessThan(source.indexOf('const validation = validateRecoveryObserveJsonReport(json, args.kind);'));
    expect(source).not.toContain('dotenv/config');
    expect(source).not.toContain('assertBroadcastAllowed');
    expect(source).not.toContain('submitTransaction');
    expect(source).not.toContain('signAndSubmit');
    expect(source).not.toContain('StateTracker');
    expect(source).not.toContain('ErgoClient');
  });
});
