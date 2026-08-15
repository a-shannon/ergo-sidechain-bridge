import { spawnSync } from 'child_process';

import { describe, expect, it } from 'vitest';

import { buildAggregateSettlementPrebroadcastEvidenceRecord } from './aggregate-settlement-evidence.js';
import { TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY } from './aggregate-settlement-evidence.test-helper.js';
import {
  findLocalAggregateSettlementEvidenceJsonTargets,
  validateTestnetPreBroadcastEvidence,
} from './testnet-prebroadcast-evidence.js';

const PEG_OUT_BURN_TX_ID = '1'.repeat(64);
const SIDECHAIN_BLOCK_HASH = '2'.repeat(64);
const BRIDGE_EVENT_ROOT = '3'.repeat(64);
const BRIDGE_EVENT_ROOT_B = '9'.repeat(64);
const EXPECTED_TX_ID = '4'.repeat(64);
const DEPLOYMENT_STATE_HASH = '5'.repeat(64);
const CONTRACT_ID = '6'.repeat(64);
const SINGLETON_ID = '7'.repeat(64);
const PEG_IN_EVENT_ID = '8'.repeat(64);
const DAEMON_APPROVAL_PREPARATION =
  `artifact://prebroadcast/aggregate-approvals.json versioned approval file version 2 mode single ` +
  `runtime context binding ergoNodeUrl http://127.0.0.1:9053 sidechainRpcUrl http://127.0.0.1:9945 ` +
  `sidechainWsUrl ws://127.0.0.1:9945 deployedStateHash ${DEPLOYMENT_STATE_HASH} ` +
  `active approval window approvedAt 2026-05-16T12:00:00Z expiresAt 2026-05-16T13:00:00Z ` +
  `non-mainnet networks checkCommand npm run settle:aggregate -- check ${PEG_OUT_BURN_TX_ID} ` +
  `checkEvidence artifact://prebroadcast/transactions-check.log /transactions/check PASS ` +
  `completed approval evidence target artifact://prebroadcast/operator-approval.json ` +
  `Expected transaction ID ${EXPECTED_TX_ID} burn hash ${PEG_OUT_BURN_TX_ID}`;

function aggregateEvidenceRecord(): Record<string, any> {
  return buildAggregateSettlementPrebroadcastEvidenceRecord({
    generatedAt: '2026-05-17T10:30:00.000Z',
    command: 'check-with-ingest',
    label: 'Aggregate same-TX ingest settlement',
    expectedTxId: EXPECTED_TX_ID,
    transactionCheckResponse: '',
    checkerIdentity: TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY,
    settlementShape: {
      inputCount: 3,
      outputCount: 4,
      contextExtensionKeyCounts: [0, 4, 2],
      contextExtensionKeyCountsCsv: '0,4,2',
    },
    claims: [{
      burnTxHash: PEG_OUT_BURN_TX_ID,
      sidechainBlockHeight: 200,
      sidechainHeaderHashHex: SIDECHAIN_BLOCK_HASH,
      bridgeEventRootHex: BRIDGE_EVENT_ROOT,
      ergoAnchorHeight: 100,
    }],
  });
}

function batchAggregateEvidenceRecord(): Record<string, any> {
  const record = aggregateEvidenceRecord();
  record.command = 'check-batch';
  record.claimCount = 2;
  record.claims = [
    record.claims[0],
    {
      ...record.claims[0],
      burnTxHash: 'a'.repeat(64),
      bridgeEventRootHex: BRIDGE_EVENT_ROOT_B,
    },
  ];
  return record;
}

function evidence(overrides: {
  scope?: Record<string, string>;
  commands?: Record<string, string>;
  dryRun?: Record<string, string>;
  nonBroadcast?: Record<string, string>;
  lifecycleGuidance?: string;
  publication?: Record<string, string>;
  signoff?: Record<string, string>;
} = {}): string {
  const scope = {
    'Evidence package name': 'fresh-testnet-prebroadcast-2026-05-16',
    Date: '2026-05-16',
    Operator: 'operator-a',
    Reviewer: 'reviewer-a',
    'Git commit': 'abc1234',
    Environment: 'testnet',
    'Ergo node network': 'testnet',
    'Sidechain network': 'patched-devnet',
    'Broadcast mode at start': 'disabled',
    'Broadcast mode at end': 'disabled',
    'Gate 3 closure claimed': 'no',
    'Testnet production-candidate claim allowed': 'no',
    'Mainnet production-ready claim allowed': 'no',
    ...overrides.scope,
  };
  const commands = {
    '`npm run check` artifact': 'artifact://prebroadcast/check.log',
    '`npm run wasm:test` artifact': 'artifact://prebroadcast/wasm-test.log',
    '`npm run demo:readiness` artifact': 'artifact://prebroadcast/demo-readiness.log',
    '`npm run status` artifact': 'artifact://prebroadcast/status.log',
    'ContextExtension guard result':
      'artifact://prebroadcast/context-extension-guard.log ContextExtension guard sigma-rust/JVM conformance fail-closed behavior',
    'Broadcast policy result':
      'artifact://prebroadcast/broadcast-policy.log Broadcast policy PASS: broadcast disabled by BRIDGE_BROADCAST_ENABLED=false',
    'Clean deployment state evidence':
      `artifact://prebroadcast/clean-deployment-state.json clean deployment state ` +
      `deployment-state hash=${DEPLOYMENT_STATE_HASH}; contract IDs=${CONTRACT_ID}; singleton inventory=${SINGLETON_ID}`,
    'Current Ergo height': '100 artifact://prebroadcast/current-ergo-height.log',
    'Current sidechain height': '200 artifact://prebroadcast/current-sidechain-height.log',
    ...overrides.commands,
  };
  const dryRun = {
    'Peg-in event ID or TX ID': `${PEG_IN_EVENT_ID} artifact://prebroadcast/peg-in-event.log`,
    'Peg-out burn TX ID': `${PEG_OUT_BURN_TX_ID} artifact://prebroadcast/peg-out-burn.log`,
    'Sidechain block height': '200',
    'Sidechain block hash': `${SIDECHAIN_BLOCK_HASH} artifact://prebroadcast/sidechain-block.log`,
    'Bridge event root': `${BRIDGE_EVENT_ROOT} artifact://prebroadcast/bridge-event-root.log`,
    'Ergo anchor height': '100',
    'Aggregate claim count': '1',
    'Input count': '3',
    'Output count': '4',
    'ContextExtension key counts per input': '0,4,2',
    '`/transactions/check` result': 'PASS artifact://prebroadcast/transactions-check.log',
    'Expected transaction ID': `${EXPECTED_TX_ID} artifact://prebroadcast/expected-tx.log`,
    'Daemon approval preparation': 'N/A - explicit CLI submit workflow artifact://prebroadcast/daemon-approval-na.log',
    ...overrides.dryRun,
  };
  const nonBroadcast = {
    '`BRIDGE_BROADCAST_ENABLED` state at start': 'unset artifact://prebroadcast/broadcast-state-start.log',
    '`BRIDGE_BROADCAST_ENABLED` state at end': 'false artifact://prebroadcast/broadcast-state-end.log',
    'Live broadcast approval recorded': 'no artifact://prebroadcast/live-approval-absent.log',
    'Submit command attempted': 'no artifact://prebroadcast/submit-not-attempted.log',
    'Mempool transaction observed': 'no artifact://prebroadcast/mempool-absence.log',
    'Local DUP confirmed-history mutation performed': 'no artifact://prebroadcast/dup-history-no-mutation.log',
    'Local SPV/AVL confirmed-history mutation performed': 'no artifact://prebroadcast/spv-avl-history-no-mutation.log',
    'Runtime state files staged': 'no artifact://prebroadcast/git-status-runtime-not-staged.log',
    ...overrides.nonBroadcast,
  };
  const publication = {
    'Release notes updated for this dry-run package': 'yes',
    'Pending Evidence Register updated for this dry-run package': 'yes',
    'Gate 3 checklist row closed by this package': 'no',
    'Production-ready claim allowed by this package': 'no',
    'Testnet production-candidate claim allowed by this package': 'no',
    ...overrides.publication,
  };
  const signoff = {
    Classification: 'pass',
    'Stop conditions discovered': 'none',
    'Follow-up live rehearsal required': 'yes',
    'Follow-up recovery drill required': 'yes',
    Reviewer: 'reviewer-a',
    Date: '2026-05-16',
    ...overrides.signoff,
  };

  return `
# Completed Testnet Pre-Broadcast Dry Run

## Scope Statement

${listFields(scope)}

## Required Command Artifacts

${listFields(commands)}

## Dry-Run Settlement Shape

${listFields(dryRun)}

## Non-Broadcast Attestation

${listFields(nonBroadcast)}

## Lifecycle Linkage Guidance

${overrides.lifecycleGuidance ?? [
    'Fresh testnet lifecycle: publication blocker pending until a live lifecycle package exists.',
    'Settlement submit evidence: blocker pending until user explicit live broadcast approval and submitted transaction ID evidence exist.',
    'Confirmation evidence: unchecked blocker pending until live confirmation evidence exists.',
    'Reconciliation evidence: unchecked blocker pending until live reconciliation evidence exists.',
    'The next live rehearsal must capture submitted transaction ID, confirmation evidence, and reconciliation evidence before any Gate 3 closure.',
  ].join('\n')}

## Publication Control

${listFields(publication)}

## Reviewer Sign-Off

${listFields(signoff)}
`;
}

function listFields(fields: Record<string, string>): string {
  return Object.entries(fields).map(([key, value]) => `- ${key}: ${value}`).join('\n');
}

describe('testnet pre-broadcast dry-run evidence validation', () => {
  it('prints no-broadcast and claim boundaries in validator CLI help', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-testnet-prebroadcast-evidence.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run prebroadcast:validate');
    expect(result.stdout).toContain('completed Testnet Pre-Broadcast Evidence Markdown');
    expect(result.stdout).toContain('Release-gate use requires a prebroadcast validation target');
    expect(result.stdout).toContain('command-specific completed prebroadcast command output evidence');
    expect(result.stdout).toContain('Release gate structural issues = 0');
    expect(result.stdout).toContain('Gate 3 closure claimed: no');
    expect(result.stdout).toContain('Testnet production-candidate claim allowed: no');
    expect(result.stdout).toContain('Mainnet production-ready claim allowed: no');
    expect(result.stdout).toContain('BRIDGE_BROADCAST_ENABLED');
    expect(result.stdout).toContain('Production-ready claim allowed by this package: no');
    expect(result.stdout).toContain('Testnet production-candidate claim allowed by this package: no');
    expect(result.stdout).toContain('does not sign, submit, publish, push, broadcast, or open runtime databases');
  });

  it('accepts a structured non-broadcast testnet preparation package', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence());

    expect(result.status).toBe('PASS');
    expect(result.errors).toEqual([]);
  });

  it('validates linked local aggregate settlement JSON records when present', () => {
    const markdown = evidence({
      dryRun: {
        '`/transactions/check` result':
          'PASS [aggregate JSON](aggregate-check.json) artifact://prebroadcast/transactions-check.log',
      },
    });
    const result = validateTestnetPreBroadcastEvidence(markdown, {
      linkedAggregateSettlementEvidenceJsonRecords: [{
        target: 'aggregate-check.json',
        record: aggregateEvidenceRecord(),
      }],
    });

    expect(findLocalAggregateSettlementEvidenceJsonTargets(markdown)).toEqual(['aggregate-check.json']);
    expect(result.status).toBe('PASS');
    expect(result.errors).toEqual([]);
  });

  it('accepts ordered batch bridge event roots when they match linked aggregate JSON', () => {
    const markdown = evidence({
      dryRun: {
        'Aggregate claim count': '2',
        'Bridge event roots': `${BRIDGE_EVENT_ROOT},${BRIDGE_EVENT_ROOT_B} artifact://prebroadcast/bridge-event-roots.log`,
        '`/transactions/check` result':
          'PASS [aggregate JSON](aggregate-check.json) artifact://prebroadcast/transactions-check.log',
      },
    });
    const result = validateTestnetPreBroadcastEvidence(markdown, {
      linkedAggregateSettlementEvidenceJsonRecords: [{
        target: 'aggregate-check.json',
        record: batchAggregateEvidenceRecord(),
      }],
    });

    expect(result.status).toBe('PASS');
    expect(result.errors).toEqual([]);
  });

  it('rejects contradictory /transactions/check PASS evidence', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      dryRun: {
        '`/transactions/check` result':
          'PASS artifact://prebroadcast/transactions-check.log validation BLOCKED with 1 structural issue',
        'Daemon approval preparation': DAEMON_APPROVAL_PREPARATION.replace(
          '/transactions/check PASS',
          '/transactions/check PASS validation BLOCKED with 1 structural issue',
        ),
      },
    }));

    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: `/transactions/check` result must contain internally positive PASS evidence',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Daemon approval preparation checkEvidence or /transactions/check PASS evidence must be internally positive',
    );
  });

  it('rejects /transactions/check PASS evidence with remaining issue markers', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      dryRun: {
        '`/transactions/check` result':
          'PASS artifact://prebroadcast/transactions-check.log Remaining issues: unresolved transaction check blocker',
        'Daemon approval preparation': DAEMON_APPROVAL_PREPARATION.replace(
          '/transactions/check PASS',
          '/transactions/check PASS Remaining issues: unresolved daemon approval blocker',
        ),
      },
    }));

    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: `/transactions/check` result must contain internally positive PASS evidence',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Daemon approval preparation checkEvidence or /transactions/check PASS evidence must be internally positive',
    );
  });

  it('rejects /transactions/check PASS evidence with singular remaining issue markers', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      dryRun: {
        '`/transactions/check` result':
          'PASS artifact://prebroadcast/transactions-check.log Remaining issue: follow-up pending',
        'Daemon approval preparation': DAEMON_APPROVAL_PREPARATION.replace(
          '/transactions/check PASS',
          '/transactions/check PASS Remaining issue: follow-up pending',
        ),
      },
    }));

    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: `/transactions/check` result must contain internally positive PASS evidence',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Daemon approval preparation checkEvidence or /transactions/check PASS evidence must be internally positive',
    );
  });

  it('rejects /transactions/check PASS evidence with compatibility-normalized failure markers', () => {
    const marker = 'validation\uFF1A \uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue';
    const result = validateTestnetPreBroadcastEvidence(evidence({
      dryRun: {
        '`/transactions/check` result':
          `PASS artifact://prebroadcast/transactions-check.log ${marker}`,
        'Daemon approval preparation': DAEMON_APPROVAL_PREPARATION.replace(
          '/transactions/check PASS',
          `/transactions/check PASS ${marker}`,
        ),
      },
    }));

    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: `/transactions/check` result must contain internally positive PASS evidence',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Daemon approval preparation checkEvidence or /transactions/check PASS evidence must be internally positive',
    );
  });

  it('rejects /transactions/check PASS evidence with structured failure fields', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      dryRun: {
        '`/transactions/check` result':
          'PASS artifact://prebroadcast/transactions-check.log {"errors":["transaction check drift"]} failures_total: 2',
        'Daemon approval preparation': DAEMON_APPROVAL_PREPARATION.replace(
          '/transactions/check PASS',
          '/transactions/check PASS errorCount: 1 errorsTotal=1',
        ),
      },
    }));

    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: `/transactions/check` result must contain internally positive PASS evidence',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Daemon approval preparation checkEvidence or /transactions/check PASS evidence must be internally positive',
    );

    const totals = validateTestnetPreBroadcastEvidence(evidence({
      dryRun: {
        '`/transactions/check` result':
          'PASS artifact://prebroadcast/transactions-check.log failures_total: 2',
        'Daemon approval preparation': DAEMON_APPROVAL_PREPARATION.replace(
          '/transactions/check PASS',
          '/transactions/check PASS errorsTotal=1',
        ),
      },
    }));
    expect(totals.errors).toContain(
      'Dry-Run Settlement Shape: `/transactions/check` result must contain internally positive PASS evidence',
    );
    expect(totals.errors).toContain(
      'Dry-Run Settlement Shape: Daemon approval preparation checkEvidence or /transactions/check PASS evidence must be internally positive',
    );

    const success = validateTestnetPreBroadcastEvidence(evidence({
      dryRun: {
        '`/transactions/check` result':
          'PASS artifact://prebroadcast/transactions-check.log {"errors":[]} failures_total: 0',
        'Daemon approval preparation': DAEMON_APPROVAL_PREPARATION.replace(
          '/transactions/check PASS',
          '/transactions/check PASS errorCount: 0 errorsTotal=0',
        ),
      },
    }));
    expect(success.errors).toEqual([]);
  });

  it('rejects /transactions/check PASS evidence with open or known issue markers', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      dryRun: {
        '`/transactions/check` result':
          'PASS artifact://prebroadcast/transactions-check.log Open issues: unresolved transaction check blocker',
        'Daemon approval preparation': DAEMON_APPROVAL_PREPARATION.replace(
          '/transactions/check PASS',
          '/transactions/check PASS Known issues: unresolved daemon approval blocker',
        ),
      },
    }));

    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: `/transactions/check` result must contain internally positive PASS evidence',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Daemon approval preparation checkEvidence or /transactions/check PASS evidence must be internally positive',
    );
  });

  it('allows /transactions/check PASS evidence with explicit no issue markers', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      dryRun: {
        '`/transactions/check` result':
          'PASS artifact://prebroadcast/transactions-check.log Open issues: 0',
        'Daemon approval preparation': DAEMON_APPROVAL_PREPARATION.replace(
          '/transactions/check PASS',
          '/transactions/check PASS Known issues: none',
        ),
      },
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).toEqual([]);
  });

  it('blocks batch dry-run evidence without ordered bridge event roots', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      dryRun: {
        'Aggregate claim count': '2',
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Bridge event roots are required for batch dry-run evidence',
    );
  });

  it('blocks ordered batch bridge event roots that do not match linked aggregate JSON', () => {
    const markdown = evidence({
      dryRun: {
        'Aggregate claim count': '2',
        'Bridge event roots': `${BRIDGE_EVENT_ROOT_B},${BRIDGE_EVENT_ROOT} artifact://prebroadcast/bridge-event-roots.log`,
        '`/transactions/check` result':
          'PASS [aggregate JSON](aggregate-check.json) artifact://prebroadcast/transactions-check.log',
      },
    });
    const result = validateTestnetPreBroadcastEvidence(markdown, {
      linkedAggregateSettlementEvidenceJsonRecords: [{
        target: 'aggregate-check.json',
        record: batchAggregateEvidenceRecord(),
      }],
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Bridge event root must match the first ordered Bridge event roots value',
    );
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: Bridge event roots must match JSON claim bridgeEventRootHex values in order',
    );
  });

  it('blocks tampered linked aggregate settlement JSON records', () => {
    const markdown = evidence({
      dryRun: {
        '`/transactions/check` result':
          'PASS [aggregate JSON](aggregate-check.json) artifact://prebroadcast/transactions-check.log',
      },
    });
    const record = aggregateEvidenceRecord();
    record.broadcast = 'yes';
    record.transactionCheck.result = 'FAIL';

    const result = validateTestnetPreBroadcastEvidence(markdown, {
      linkedAggregateSettlementEvidenceJsonRecords: [{
        target: 'aggregate-check.json',
        record,
      }],
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: broadcast must be no',
    );
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: transactionCheck.result must be PASS',
    );
  });

  it('blocks batch aggregate JSON records without claim-level root and anchor evidence', () => {
    const markdown = evidence({
      dryRun: {
        'Aggregate claim count': '2',
        '`/transactions/check` result':
          'PASS [aggregate JSON](aggregate-check.json) artifact://prebroadcast/transactions-check.log',
      },
    });
    const record = aggregateEvidenceRecord();
    record.command = 'check-batch';
    record.claimCount = 2;
    record.claims = [
      record.claims[0],
      {
        ...record.claims[0],
        burnTxHash: '9'.repeat(64),
      },
    ];
    for (const claim of record.claims) {
      delete claim.bridgeEventRootHex;
      delete claim.ergoAnchorHeight;
    }

    const result = validateTestnetPreBroadcastEvidence(markdown, {
      linkedAggregateSettlementEvidenceJsonRecords: [{
        target: 'aggregate-check.json',
        record,
      }],
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: claims[0].bridgeEventRootHex must be 32-byte hex',
    );
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: claims[0].ergoAnchorHeight must be a non-negative safe integer',
    );
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: claims[1].bridgeEventRootHex must be 32-byte hex',
    );
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: claims[1].ergoAnchorHeight must be a non-negative safe integer',
    );
  });

  it('blocks single-claim aggregate JSON records without claim-level root and anchor evidence', () => {
    const markdown = evidence({
      dryRun: {
        '`/transactions/check` result':
          'PASS [aggregate JSON](aggregate-check.json) artifact://prebroadcast/transactions-check.log',
      },
    });
    const record = aggregateEvidenceRecord();
    record.command = 'check';
    delete record.claims[0].sidechainHeaderHashHex;
    delete record.claims[0].bridgeEventRootHex;
    delete record.claims[0].ergoAnchorHeight;

    const result = validateTestnetPreBroadcastEvidence(markdown, {
      linkedAggregateSettlementEvidenceJsonRecords: [{
        target: 'aggregate-check.json',
        record,
      }],
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: Sidechain block hash must match a JSON claim sidechainHeaderHashHex',
    );
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: Bridge event root must match a JSON claim bridgeEventRootHex',
    );
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: Ergo anchor height must match a JSON claim ergoAnchorHeight',
    );
  });

  it('blocks linked aggregate settlement JSON records that do not match dry-run identifiers', () => {
    const markdown = evidence({
      dryRun: {
        '`/transactions/check` result':
          'PASS [aggregate JSON](aggregate-check.json) artifact://prebroadcast/transactions-check.log',
      },
    });
    const record = aggregateEvidenceRecord();
    record.transactionCheck.expectedTxId = '9'.repeat(64);
    record.claims[0].burnTxHash = 'a'.repeat(64);
    record.claims[0].sidechainBlockHeight = 199;
    record.claims[0].sidechainHeaderHashHex = 'b'.repeat(64);
    record.claims[0].bridgeEventRootHex = 'c'.repeat(64);
    record.claims[0].ergoAnchorHeight = 99;

    const result = validateTestnetPreBroadcastEvidence(markdown, {
      linkedAggregateSettlementEvidenceJsonRecords: [{
        target: 'aggregate-check.json',
        record,
      }],
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: Expected transaction ID must match JSON transactionCheck.expectedTxId',
    );
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: Peg-out burn TX ID must match a JSON claim burnTxHash',
    );
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: Sidechain block height must match a JSON claim sidechainBlockHeight',
    );
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: Sidechain block hash must match a JSON claim sidechainHeaderHashHex',
    );
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: Bridge event root must match a JSON claim bridgeEventRootHex',
    );
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: Ergo anchor height must match a JSON claim ergoAnchorHeight',
    );
  });

  it('blocks linked aggregate settlement JSON records that do not match dry-run counts', () => {
    const markdown = evidence({
      dryRun: {
        '`/transactions/check` result':
          'PASS [aggregate JSON](aggregate-check.json) artifact://prebroadcast/transactions-check.log',
      },
    });
    const record = aggregateEvidenceRecord();
    record.command = 'check-batch';
    record.claimCount = 2;
    record.claims = [
      record.claims[0],
      {
        ...record.claims[0],
        burnTxHash: '9'.repeat(64),
      },
    ];
    record.settlementShape = {
      inputCount: 4,
      outputCount: 5,
      contextExtensionKeyCounts: [0, 4, 2, 1],
      contextExtensionKeyCountsCsv: '0,4,2,1',
    };

    const result = validateTestnetPreBroadcastEvidence(markdown, {
      linkedAggregateSettlementEvidenceJsonRecords: [{
        target: 'aggregate-check.json',
        record,
      }],
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: Aggregate claim count must match JSON claimCount',
    );
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: Input count must match JSON settlementShape.inputCount',
    );
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: Output count must match JSON settlementShape.outputCount',
    );
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: ContextExtension key counts per input must match JSON settlementShape.contextExtensionKeyCountsCsv',
    );
  });

  it('blocks batch JSON where claim-scoped dry-run fields match different claims', () => {
    const markdown = evidence({
      dryRun: {
        'Aggregate claim count': '2',
        '`/transactions/check` result':
          'PASS [aggregate JSON](aggregate-check.json) artifact://prebroadcast/transactions-check.log',
      },
    });
    const record = aggregateEvidenceRecord();
    record.command = 'check-batch';
    record.claimCount = 2;
    record.claims = [
      {
        ...record.claims[0],
        sidechainBlockHeight: 199,
        sidechainHeaderHashHex: 'a'.repeat(64),
        bridgeEventRootHex: 'b'.repeat(64),
        ergoAnchorHeight: 99,
      },
      {
        ...record.claims[0],
        burnTxHash: '9'.repeat(64),
      },
    ];

    const result = validateTestnetPreBroadcastEvidence(markdown, {
      linkedAggregateSettlementEvidenceJsonRecords: [{
        target: 'aggregate-check.json',
        record,
      }],
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: Sidechain block height must match a JSON claim sidechainBlockHeight',
    );
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: Sidechain block hash must match a JSON claim sidechainHeaderHashHex',
    );
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: Bridge event root must match a JSON claim bridgeEventRootHex',
    );
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: Ergo anchor height must match a JSON claim ergoAnchorHeight',
    );
  });

  it('blocks unread linked aggregate settlement JSON records during package validation', () => {
    const markdown = evidence({
      dryRun: {
        '`/transactions/check` result':
          'PASS [aggregate JSON](aggregate-check.json) artifact://prebroadcast/transactions-check.log',
      },
    });
    const result = validateTestnetPreBroadcastEvidence(markdown, {
      linkedAggregateSettlementEvidenceJsonRecords: [],
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: JSON link was not read',
    );
  });

  it('ignores non-aggregate JSON links outside the dry-run check fields', () => {
    const markdown = evidence({
      commands: {
        'Clean deployment state evidence':
          `[clean deployment](clean-deployment-state.json) clean deployment state ` +
          `deployment-state hash=${DEPLOYMENT_STATE_HASH}; contract IDs=${CONTRACT_ID}; ` +
          `singleton inventory=${SINGLETON_ID}`,
      },
      dryRun: {
        '`/transactions/check` result': 'PASS artifact://prebroadcast/aggregate-check.json',
      },
    });

    expect(findLocalAggregateSettlementEvidenceJsonTargets(markdown)).toEqual([]);
  });

  it('normalizes local aggregate JSON links with query, fragments, and Markdown titles', () => {
    const markdown = evidence({
      dryRun: {
        '`/transactions/check` result':
          'PASS [aggregate JSON](aggregate-check.json?sha=abc#record "Aggregate record") artifact://prebroadcast/transactions-check.log',
        'Expected transaction ID':
          `${EXPECTED_TX_ID} [expected tx JSON](nested/expected-tx.json#record) ` +
          '[angle JSON](<angle-check.json>) artifact://prebroadcast/expected-tx.log',
      },
    });

    expect(findLocalAggregateSettlementEvidenceJsonTargets(markdown)).toEqual([
      'aggregate-check.json',
      'nested/expected-tx.json',
      'angle-check.json',
    ]);
  });

  it('blocks unsupported aggregate JSON link targets instead of silently accepting them', () => {
    for (const [target, expectedError] of [
      [
        'https://example.invalid/aggregate-check.json',
        'Linked aggregate settlement evidence <blocked evidence JSON target>: JSON link must be a local relative path',
      ],
      [
        'artifact://prebroadcast/aggregate-check.json',
        'Linked aggregate settlement evidence <blocked evidence JSON target>: JSON link must be a local relative path',
      ],
      [
        ['file:', '', '', 'C:', 'tmp', 'aggregate-check.json'].join('/'),
        'Linked aggregate settlement evidence <blocked evidence JSON target>: JSON link must be a local relative path',
      ],
      [
        ['', 'tmp', 'aggregate-check.json'].join('/'),
        'Linked aggregate settlement evidence <blocked evidence JSON target>: JSON link must be a local relative path',
      ],
      [
        ['C:', 'tmp', 'aggregate-check.json'].join('/'),
        'Linked aggregate settlement evidence <blocked evidence JSON target>: JSON link must be a local relative path',
      ],
      [
        '../aggregate-check.json',
        'Linked aggregate settlement evidence ../aggregate-check.json: JSON link must not use parent directory segments',
      ],
      [
        '.env.aggregate-check.json',
        'Linked aggregate settlement evidence <blocked evidence JSON target>: refusing to write environment files as evidence JSON',
      ],
      [
        'operator/mnemonic-check.json',
        'Linked aggregate settlement evidence <blocked evidence JSON target>: refusing to write secret-bearing or runtime-state paths as evidence JSON',
      ],
    ] as const) {
      const markdown = evidence({
        dryRun: {
          '`/transactions/check` result':
            `PASS [aggregate JSON](${target}) artifact://prebroadcast/transactions-check.log`,
        },
      });
      const result = validateTestnetPreBroadcastEvidence(markdown, {
        linkedAggregateSettlementEvidenceJsonRecords: [],
      });

      expect(result.status, target).toBe('BLOCKED');
      expect(result.errors, target).toContain(expectedError);
    }
  });

  it('accepts daemon approval v2 preparation when it is bound to the dry-run identifiers', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      dryRun: {
        'Daemon approval preparation': DAEMON_APPROVAL_PREPARATION,
      },
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).toEqual([]);
  });

  it('requires daemon approval preparation to cite a completed approval evidence target exactly', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      dryRun: {
        'Daemon approval preparation': DAEMON_APPROVAL_PREPARATION.replace(
          'completed approval evidence target',
          'operator approval evidence',
        ),
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Daemon approval preparation must cite completed approval evidence target',
    );
  });

  it('rejects negated daemon approval preparation completed-target wording', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      dryRun: {
        'Daemon approval preparation': DAEMON_APPROVAL_PREPARATION.replace(
          'completed approval evidence target',
          'not completed approval evidence target',
        ),
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Daemon approval preparation must cite completed approval evidence target',
    );
  });

  it('blocks broadcast attempts and Gate 3 or production claim closure', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      scope: {
        'Gate 3 closure claimed': 'yes',
        'Testnet production-candidate claim allowed': 'yes',
        'Mainnet production-ready claim allowed': 'yes',
      },
      nonBroadcast: {
        '`BRIDGE_BROADCAST_ENABLED` state at start': 'true',
        'Live broadcast approval recorded': 'yes',
        'Submit command attempted': 'yes',
        'Mempool transaction observed': 'yes',
        'Local DUP confirmed-history mutation performed': 'yes',
      },
      publication: {
        'Gate 3 checklist row closed by this package': 'yes',
        'Production-ready claim allowed by this package': 'yes',
        'Testnet production-candidate claim allowed by this package': 'yes',
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Scope Statement: Gate 3 closure claimed must be no');
    expect(result.errors).toContain('Scope Statement: Testnet production-candidate claim allowed must be no');
    expect(result.errors).toContain('Scope Statement: Mainnet production-ready claim allowed must be no');
    expect(result.errors).toContain('Non-Broadcast Attestation: `BRIDGE_BROADCAST_ENABLED` state at start must be false or unset');
    expect(result.errors).toContain('Non-Broadcast Attestation: Live broadcast approval recorded must be no');
    expect(result.errors).toContain('Non-Broadcast Attestation: Submit command attempted must be no');
    expect(result.errors).toContain('Non-Broadcast Attestation: Mempool transaction observed must be no');
    expect(result.errors).toContain('Non-Broadcast Attestation: Local DUP confirmed-history mutation performed must be no');
    expect(result.errors).toContain('Publication Control: Gate 3 checklist row closed by this package must be no');
    expect(result.errors).toContain('Publication Control: Production-ready claim allowed by this package must be no');
    expect(result.errors).toContain('Publication Control: Testnet production-candidate claim allowed by this package must be no');
  });

  it('rejects hidden production claim and broadcast-enabled markers', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      commands: {
        'Broadcast policy result':
          'artifact://prebroadcast/broadcast-policy.log Broadcast policy PASS: broadcast disabled by BRIDGE_BROADCAST_ENABLED=false; BRIDGE_BROADCAST_ENABLED=true observed in another shell',
      },
      lifecycleGuidance: [
        'Fresh testnet lifecycle: publication blocker pending until a live lifecycle package exists.',
        'Settlement submit evidence: blocker pending until user explicit live broadcast approval and submitted transaction ID evidence exist.',
        'Confirmation evidence: unchecked blocker pending until live confirmation evidence exists.',
        'Reconciliation evidence: unchecked blocker pending until live reconciliation evidence exists.',
        'The next live rehearsal must capture submitted transaction ID, confirmation evidence, and reconciliation evidence before any Gate 3 closure.',
        'Testnet production-candidate claim allowed = yes',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Command Artifacts: Broadcast policy result must not include enabled or approved broadcast indicators',
    );
    expect(result.errors).toContain(
      'Claim Boundary: Testnet production-candidate claim allowed must appear exactly once as a dedicated field with value no',
    );
  });

  it('rejects certification-family broadcast approval markers in command artifacts', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      commands: {
        'Broadcast policy result':
          'artifact://prebroadcast/broadcast-policy.log Broadcast policy PASS: broadcast disabled by BRIDGE_BROADCAST_ENABLED=false; reviewer certifies live broadcast approval',
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Command Artifacts: Broadcast policy result must not include enabled or approved broadcast indicators',
    );
  });

  it('rejects prose that implies testnet production-candidate readiness', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      lifecycleGuidance: [
        'Fresh testnet lifecycle: publication blocker pending until a live lifecycle package exists.',
        'Settlement submit evidence: blocker pending until user explicit live broadcast approval and submitted transaction ID evidence exist.',
        'Confirmation evidence: unchecked blocker pending until live confirmation evidence exists.',
        'Reconciliation evidence: unchecked blocker pending until live reconciliation evidence exists.',
        'The next live rehearsal must capture submitted transaction ID, confirmation evidence, and reconciliation evidence before any Gate 3 closure.',
        'This dry-run package is testnet production-candidate ready for exchange integration.',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Testnet Pre-Broadcast Evidence: document must not imply testnet production-candidate readiness',
    );
  });

  it('rejects direct production claim wording in pre-broadcast package prose', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      lifecycleGuidance: [
        'Fresh testnet lifecycle: publication blocker pending until a live lifecycle package exists.',
        'Settlement submit evidence: blocker pending until user explicit live broadcast approval and submitted transaction ID evidence exist.',
        'Confirmation evidence: unchecked blocker pending until live confirmation evidence exists.',
        'Reconciliation evidence: unchecked blocker pending until live reconciliation evidence exists.',
        'The next live rehearsal must capture submitted transaction ID, confirmation evidence, and reconciliation evidence before any Gate 3 closure.',
        'Reviewer observation: production-ready release wording observed; mainnet production release wording observed.',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Testnet Pre-Broadcast Evidence: document must not contain mainnet production claim wording',
    );
    expect(result.errors).toContain(
      'Testnet Pre-Broadcast Evidence: document must not contain production-ready claim wording',
    );
  });

  it('requires lifecycle linkage guidance to preserve live-testnet blockers', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      lifecycleGuidance: 'Dry-run package linked. Follow normal release process later.',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Lifecycle Linkage Guidance: must mention Fresh testnet lifecycle');
    expect(result.errors).toContain('Lifecycle Linkage Guidance: must mention Settlement submit evidence');
    expect(result.errors).toContain('Lifecycle Linkage Guidance: must mention Confirmation evidence');
    expect(result.errors).toContain('Lifecycle Linkage Guidance: must mention Reconciliation evidence');
    expect(result.errors).toContain(
      'Lifecycle Linkage Guidance: must state incomplete live lifecycle rows remain publication blockers',
    );
    expect(result.errors).toContain(
      'Lifecycle Linkage Guidance: must require explicit broadcast approval before live submit evidence',
    );
    expect(result.errors).toContain('Lifecycle Linkage Guidance: must require submitted transaction ID evidence');
    expect(result.errors).toContain('Lifecycle Linkage Guidance: must require confirmation evidence');
    expect(result.errors).toContain('Lifecycle Linkage Guidance: must require reconciliation evidence');
  });

  it('requires each live lifecycle item to remain an explicit blocker or pending item', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      lifecycleGuidance: [
        'Fresh testnet lifecycle must wait for a separate live package.',
        'Settlement submit evidence requires user explicit live broadcast approval and submitted transaction ID evidence.',
        'Confirmation evidence requires confirmation evidence after submit.',
        'Reconciliation evidence requires reconciliation evidence after confirmation.',
        'Incomplete live lifecycle rows remain publication blockers.',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Lifecycle Linkage Guidance: Fresh testnet lifecycle must remain explicitly blocker, unchecked, or pending',
    );
    expect(result.errors).toContain(
      'Lifecycle Linkage Guidance: Settlement submit evidence must remain explicitly blocker, unchecked, or pending',
    );
    expect(result.errors).toContain(
      'Lifecycle Linkage Guidance: Confirmation evidence must remain explicitly blocker, unchecked, or pending',
    );
    expect(result.errors).toContain(
      'Lifecycle Linkage Guidance: Reconciliation evidence must remain explicitly blocker, unchecked, or pending',
    );
  });

  it('requires daemon approval preparation to bind v2 context and dry-run identifiers', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      dryRun: {
        'Daemon approval preparation':
          `artifact://prebroadcast/aggregate-approvals.json versioned approval file mode single ` +
          `Expected transaction ID ${'8'.repeat(64)} burn hash ${'9'.repeat(64)}`,
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Daemon approval preparation must cite approval file version 2',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Daemon approval preparation must cite runtime context binding',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Daemon approval preparation must cite deployedStateHash',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Daemon approval preparation must cite non-broadcast aggregate check command',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Daemon approval preparation must cite Expected transaction ID',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Daemon approval preparation must cite peg-out burn TX ID or ordered batch burn set',
    );
  });

  it('requires daemon batch approval preparation to cite check-batch command', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      dryRun: {
        'Daemon approval preparation': DAEMON_APPROVAL_PREPARATION
          .replace('mode single', 'mode batch')
          .replace('burn hash', 'ordered batch burn set'),
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Daemon approval preparation for batch mode must cite check-batch command',
    );
  });

  it('requires daemon approval preparation N/A to name the intended non-daemon workflow', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      dryRun: {
        'Daemon approval preparation': 'N/A artifact://prebroadcast/daemon-approval-na.log',
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Daemon approval preparation N/A must identify explicit CLI submit workflow or daemon submit not planned',
    );
  });

  it('accepts canonical daemon-submit-not-planned N/A preparation evidence', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      dryRun: {
        'Daemon approval preparation': 'N/A - daemon submit not planned artifact://prebroadcast/daemon-approval-na.log',
      },
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).toEqual([]);
  });

  it('requires reviewer sign-off date to be on or after the scope date', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      signoff: {
        Date: '2026-05-15',
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reviewer Sign-Off: Date must not be before Scope Statement Date');
  });

  it('rejects impossible scope and sign-off calendar dates', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      scope: {
        Date: '2026-02-31',
      },
      signoff: {
        Date: '2026-13-01',
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Scope Statement: Date must use YYYY-MM-DD');
    expect(result.errors).toContain('Reviewer Sign-Off: Date must use YYYY-MM-DD');
  });

  it('rejects lifecycle guidance that marks live lifecycle blockers as completed or linked', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      lifecycleGuidance: [
        'Fresh testnet lifecycle: PASS linked by the prebroadcast package.',
        'Settlement submit evidence: blocker checked after dry-run validation with explicit broadcast approval and submitted transaction ID evidence pending.',
        'Confirmation evidence: blocker complete; confirmation evidence pending.',
        'Reconciliation evidence: blocker satisfied; reconciliation evidence pending.',
        'Incomplete live lifecycle rows remain publication blockers.',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Lifecycle Linkage Guidance: Fresh testnet lifecycle must not be marked pass, complete, checked, satisfied, linked, resolved, or closed',
    );
    expect(result.errors).toContain(
      'Lifecycle Linkage Guidance: Settlement submit evidence must not be marked pass, complete, checked, satisfied, linked, resolved, or closed',
    );
    expect(result.errors).toContain(
      'Lifecycle Linkage Guidance: Confirmation evidence must not be marked pass, complete, checked, satisfied, linked, resolved, or closed',
    );
    expect(result.errors).toContain(
      'Lifecycle Linkage Guidance: Reconciliation evidence must not be marked pass, complete, checked, satisfied, linked, resolved, or closed',
    );
  });

  it.each([
    'resolved by the pre-broadcast dry-run package',
    'closed by the pre-broadcast dry-run package',
  ])('rejects lifecycle guidance that marks a live lifecycle blocker as %s', status => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      lifecycleGuidance: [
        `Fresh testnet lifecycle: publication blocker pending, but ${status}.`,
        'Settlement submit evidence: blocker pending until user explicit live broadcast approval and submitted transaction ID evidence exist.',
        'Confirmation evidence: unchecked blocker pending until live confirmation evidence exists.',
        'Reconciliation evidence: unchecked blocker pending until live reconciliation evidence exists.',
        'Incomplete live lifecycle rows remain publication blockers.',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Lifecycle Linkage Guidance: Fresh testnet lifecycle must not be marked pass, complete, checked, satisfied, linked, resolved, or closed',
    );
  });

  it('rejects targetless command-output notes as completed pre-broadcast evidence', () => {
    const targetless = 'npm run demo:readiness command output: PASS';
    const result = validateTestnetPreBroadcastEvidence(evidence({
      commands: {
        '`npm run check` artifact': 'npm run check command output: PASS',
        '`npm run wasm:test` artifact': 'artifact://completed wasm test log',
        'Broadcast policy result': `${targetless} Broadcast policy PASS`,
        'Current Ergo height': '100',
        'Current sidechain height': '200 npm run status command output: PASS',
      },
      dryRun: {
        '`/transactions/check` result': 'npm run rehearsal:validate command output: PASS',
        'Expected transaction ID': `${EXPECTED_TX_ID} artifact:// `,
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Command Artifacts: `npm run check` artifact must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Required Command Artifacts: `npm run wasm:test` artifact must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Required Command Artifacts: Broadcast policy result must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Required Command Artifacts: Broadcast policy result must prove broadcast is disabled or refused for this dry-run package',
    );
    expect(result.errors).toContain(
      'Required Command Artifacts: Current Ergo height must include a link, command, or artifact marker',
    );
    expect(result.errors).toContain(
      'Required Command Artifacts: Current sidechain height must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: `/transactions/check` result must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Expected transaction ID must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects validation-target bindings as completed pre-broadcast evidence', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      commands: {
        '`npm run check` artifact':
          '[prebroadcast validation target](artifact://prebroadcast/completed-check.log) npm run check PASS',
      },
      dryRun: {
        '`/transactions/check` result':
          'PASS validated target artifact://prebroadcast/completed-transactions-check.log',
      },
      nonBroadcast: {
        'Mempool transaction observed':
          'no [validated input](artifact://prebroadcast/completed-mempool-absence.log)',
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Command Artifacts: `npm run check` artifact must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: `/transactions/check` result must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Non-Broadcast Attestation: Mempool transaction observed must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects sensitive or runtime targets for completed pre-broadcast evidence', () => {
    for (const target of [
      'relayer/.env',
      'relayer/private-key.md',
      'relayer/wallet-mnemonic.md',
      'relayer/bridge-state.sqlite',
    ]) {
      const result = validateTestnetPreBroadcastEvidence(evidence({
        commands: {
          '`npm run check` artifact': `[completed check evidence](${target}) npm run check PASS`,
        },
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Command Artifacts: `npm run check` artifact must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
    }
  });

  it.each([
    {
      variant: 'raw',
      currentErgoHeightTarget: ['', 'tmp', 'current-ergo-height.log'].join('/'),
      runtimeStateTarget: ['file:', '', '', 'C:', 'tmp', 'git-status-runtime-not-staged.log'].join('/'),
    },
    {
      variant: 'encoded',
      currentErgoHeightTarget: '%2Ftmp%2Fcurrent-ergo-height.log',
      runtimeStateTarget: 'file%3A%2F%2F%2FC%3A%2Ftmp%2Fgit-status-runtime-not-staged.log',
    },
    {
      variant: 'embedded encoded',
      currentErgoHeightTarget:
        'artifact://prebroadcast/sourceTarget=%2Ftmp%2Fcurrent-ergo-height.log',
      runtimeStateTarget:
        'artifact://prebroadcast/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Fgit-status-runtime-not-staged.log',
    },
  ])('rejects $variant non-concrete evidence targets for pre-broadcast evidence', ({
    currentErgoHeightTarget,
    runtimeStateTarget,
  }) => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      commands: {
        '`npm run check` artifact': 'artifact://prebroadcast/placeholder-check.log',
        '`npm run wasm:test` artifact': '[todo wasm evidence](docs/todo-wasm-test.log)',
        'Broadcast policy result':
          '[sample policy evidence](docs/sample-evidence-broadcast-policy.log) Broadcast policy PASS: broadcast disabled by BRIDGE_BROADCAST_ENABLED=false',
        'Current Ergo height': `100 [local height evidence](${currentErgoHeightTarget})`,
        'Current sidechain height': '200 [generic height evidence](docs/generic-current-sidechain-height.log)',
      },
      dryRun: {
        '`/transactions/check` result': 'PASS artifact://prebroadcast/example-evidence-transactions-check.log',
        'Expected transaction ID': `${EXPECTED_TX_ID} [placeholder tx evidence](docs/placeholder-expected-tx.log)`,
      },
      nonBroadcast: {
        'Mempool transaction observed': 'no artifact://prebroadcast/tbd-mempool-absence.log',
        'Local DUP confirmed-history mutation performed': 'no [todo DUP evidence](docs/todo-dup-history-no-mutation.log)',
        'Runtime state files staged':
          `no [local hygiene evidence](${runtimeStateTarget})`,
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Command Artifacts: `npm run check` artifact must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Required Command Artifacts: `npm run wasm:test` artifact must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Required Command Artifacts: Broadcast policy result must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Required Command Artifacts: Current Ergo height must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Required Command Artifacts: Current sidechain height must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: `/transactions/check` result must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Expected transaction ID must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Non-Broadcast Attestation: Mempool transaction observed must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Non-Broadcast Attestation: Local DUP confirmed-history mutation performed must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Non-Broadcast Attestation: Runtime state files staged must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects sample-domain artifact targets for pre-broadcast evidence', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      commands: {
        '`npm run check` artifact': 'artifact://prebroadcast/sample-prebroadcast-check.log',
        'Broadcast policy result':
          'artifact://prebroadcast/sample-broadcast-policy.log Broadcast policy PASS: broadcast disabled by BRIDGE_BROADCAST_ENABLED=false',
        'Current Ergo height': '100 artifact://prebroadcast/sample-ergo-height.log',
      },
      dryRun: {
        '`/transactions/check` result': 'PASS artifact://prebroadcast/sample-aggregate-transaction-check.log',
        'Expected transaction ID': `${EXPECTED_TX_ID} artifact://prebroadcast/sample-expected-tx.log`,
      },
      nonBroadcast: {
        'Mempool transaction observed': 'no artifact://prebroadcast/sample-nonbroadcast-mempool-absence.log',
        'Runtime state files staged': 'no artifact://prebroadcast/sample-runtime-git-status.log',
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Command Artifacts: `npm run check` artifact must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Required Command Artifacts: Broadcast policy result must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Required Command Artifacts: Current Ergo height must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: `/transactions/check` result must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Expected transaction ID must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Non-Broadcast Attestation: Mempool transaction observed must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Non-Broadcast Attestation: Runtime state files staged must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects claim-escalating artifact targets for completed pre-broadcast evidence', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      commands: {
        '`npm run check` artifact':
          'artifact://prebroadcast/check-mainnet-production-certified.log',
        '`npm run wasm:test` artifact':
          '[wasm evidence](artifact://prebroadcast/wasm-test-testnet-production-candidate-approved.log)',
        'Broadcast policy result':
          'artifact://prebroadcast/broadcast-policy-mainnet-production-certified.log Broadcast policy PASS: broadcast disabled by BRIDGE_BROADCAST_ENABLED=false',
        'Current Ergo height':
          '100 artifact://prebroadcast/current-ergo-height-production-ready-approved.log',
        'Current sidechain height':
          '200 artifact://prebroadcast/current-sidechain-height-mainnet-production-certified.log',
      },
      dryRun: {
        '`/transactions/check` result':
          'PASS artifact://prebroadcast/transactions-check-production-ready-approved.log',
        'Expected transaction ID':
          `${EXPECTED_TX_ID} artifact://prebroadcast/expected-tx-mainnet-production-certified.log`,
      },
      nonBroadcast: {
        'Mempool transaction observed':
          'no artifact://prebroadcast/mempool-absence-production-ready-approved.log',
        'Local DUP confirmed-history mutation performed':
          'no artifact://prebroadcast/dup-history-no-mutation-mainnet-production-certified.log',
        'Runtime state files staged':
          'no artifact://prebroadcast/git-status-runtime-not-staged-production-ready-approved.log',
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Command Artifacts: `npm run check` artifact must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Required Command Artifacts: `npm run wasm:test` artifact must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Required Command Artifacts: Broadcast policy result must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Required Command Artifacts: Current Ergo height must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Required Command Artifacts: Current sidechain height must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: `/transactions/check` result must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Expected transaction ID must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Non-Broadcast Attestation: Mempool transaction observed must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Non-Broadcast Attestation: Local DUP confirmed-history mutation performed must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Non-Broadcast Attestation: Runtime state files staged must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('allows concrete pre-broadcast evidence targets that mention sample size', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      commands: {
        '`npm run check` artifact': 'artifact://prebroadcast/sample-size-analysis-check.log',
        'Broadcast policy result':
          'artifact://prebroadcast/sample-size-analysis-broadcast-policy.log Broadcast policy PASS: broadcast disabled by BRIDGE_BROADCAST_ENABLED=false',
      },
      dryRun: {
        '`/transactions/check` result': 'PASS artifact://prebroadcast/sample-size-analysis-transactions-check.log',
        'Expected transaction ID': `${EXPECTED_TX_ID} artifact://prebroadcast/sample-size-analysis-expected-tx.log`,
      },
    }));

    expect(result.status).toBe('PASS');
  });

  it.each([
    'artifact://prebroadcast/fixture-check.log',
    'artifact://prebroadcast/mock-check.log',
    'artifact://prebroadcast/dummy-check.log',
    'artifact://prebroadcast/fake-check.log',
    'artifact://prebroadcast/stub-check.log',
    'artifact://prebroadcast/testdata-check.log',
    'artifact://prebroadcast/completed-synthetic-check.log',
    'artifact://prebroadcast/completed-simulated-check.log',
    '[check fixture](docs/fixture-check.log)',
    '[check synthetic](docs/completed-synthetic-check.log)',
    '[check simulated](docs/completed-simulated-check.log)',
  ])('rejects fixture-style target %s for pre-broadcast command evidence', target => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      commands: {
        '`npm run check` artifact': target,
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Command Artifacts: `npm run check` artifact must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('requires current chain heights to start with numeric values', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      commands: {
        'Current Ergo height': 'latest artifact://prebroadcast/current-ergo-height.log',
        'Current sidechain height': 'tip artifact://prebroadcast/current-sidechain-height.log',
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Command Artifacts: Current Ergo height must be a non-negative integer');
    expect(result.errors).toContain('Required Command Artifacts: Current sidechain height must be a non-negative integer');
  });

  it('rejects unsafe chain heights and dry-run settlement counts', () => {
    const unsafeCount = '9007199254740993';
    const result = validateTestnetPreBroadcastEvidence(evidence({
      commands: {
        'Current Ergo height': `${unsafeCount} artifact://prebroadcast/current-ergo-height.log`,
        'Current sidechain height': `${unsafeCount} artifact://prebroadcast/current-sidechain-height.log`,
      },
      dryRun: {
        'Sidechain block height': unsafeCount,
        'Ergo anchor height': unsafeCount,
        'Aggregate claim count': unsafeCount,
        'Input count': unsafeCount,
        'Output count': unsafeCount,
        'ContextExtension key counts per input': `0,${unsafeCount},2`,
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Command Artifacts: Current Ergo height must be a safe integer');
    expect(result.errors).toContain('Required Command Artifacts: Current sidechain height must be a safe integer');
    expect(result.errors).toContain('Dry-Run Settlement Shape: Sidechain block height must be a safe integer');
    expect(result.errors).toContain('Dry-Run Settlement Shape: Ergo anchor height must be a safe integer');
    expect(result.errors).toContain('Dry-Run Settlement Shape: Aggregate claim count must be a safe integer');
    expect(result.errors).toContain('Dry-Run Settlement Shape: Input count must be a safe integer');
    expect(result.errors).toContain('Dry-Run Settlement Shape: Output count must be a safe integer');
    expect(result.errors).toContain('Dry-Run Settlement Shape: ContextExtension key counts per input must contain safe integers');
  });

  it('requires dry-run heights to stay within current chain heights', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      dryRun: {
        'Sidechain block height': '201',
        'Ergo anchor height': '101',
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Dry-Run Settlement Shape: Sidechain block height must not exceed Current sidechain height');
    expect(result.errors).toContain('Dry-Run Settlement Shape: Ergo anchor height must not exceed Current Ergo height');
  });

  it('requires non-broadcast attestations to include completed evidence targets', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      nonBroadcast: {
        '`BRIDGE_BROADCAST_ENABLED` state at start': 'unset',
        'Live broadcast approval recorded': 'no',
        'Mempool transaction observed': 'no npm run status command output: PASS',
        'Local DUP confirmed-history mutation performed': 'no npm run status command output: PASS',
        'Local SPV/AVL confirmed-history mutation performed': 'no',
        'Runtime state files staged': 'no',
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Non-Broadcast Attestation: `BRIDGE_BROADCAST_ENABLED` state at start must include a link, command, or artifact marker',
    );
    expect(result.errors).toContain(
      'Non-Broadcast Attestation: Live broadcast approval recorded must include a link, command, or artifact marker',
    );
    expect(result.errors).toContain(
      'Non-Broadcast Attestation: Mempool transaction observed must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Non-Broadcast Attestation: Local DUP confirmed-history mutation performed must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Non-Broadcast Attestation: Local SPV/AVL confirmed-history mutation performed must include a link, command, or artifact marker',
    );
    expect(result.errors).toContain(
      'Non-Broadcast Attestation: Runtime state files staged must include a link, command, or artifact marker',
    );
  });

  it('rejects contradictory broadcast-positive markers hidden in non-broadcast attestations', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      nonBroadcast: {
        '`BRIDGE_BROADCAST_ENABLED` state at start':
          'unset artifact://prebroadcast/broadcast-state-start.log BRIDGE_BROADCAST_ENABLED=true observed later',
        'Live broadcast approval recorded':
          'no artifact://prebroadcast/live-approval-absent.log live broadcast approval recorded yes',
        'Submit command attempted':
          'no artifact://prebroadcast/submit-not-attempted.log submit command attempted: yes in another shell',
        'Mempool transaction observed':
          'no artifact://prebroadcast/mempool-absence.log mempool transaction observed: yes',
        'Local DUP confirmed-history mutation performed':
          'no artifact://prebroadcast/dup-history-no-mutation.log local DUP confirmed-history mutation performed: yes',
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Non-Broadcast Attestation: `BRIDGE_BROADCAST_ENABLED` state at start must not include broadcast-enabled or live-action indicators',
    );
    expect(result.errors).toContain(
      'Non-Broadcast Attestation: Live broadcast approval recorded must not include broadcast-enabled or live-action indicators',
    );
    expect(result.errors).toContain(
      'Non-Broadcast Attestation: Submit command attempted must not include broadcast-enabled or live-action indicators',
    );
    expect(result.errors).toContain(
      'Non-Broadcast Attestation: Mempool transaction observed must not include broadcast-enabled or live-action indicators',
    );
    expect(result.errors).toContain(
      'Non-Broadcast Attestation: Local DUP confirmed-history mutation performed must not include broadcast-enabled or live-action indicators',
    );
  });

  it('rejects certification-family broadcast approval markers in non-broadcast attestations', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      nonBroadcast: {
        'Live broadcast approval recorded':
          'no artifact://prebroadcast/live-approval-absent.log live broadcast approval certified',
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Non-Broadcast Attestation: Live broadcast approval recorded must not include broadcast-enabled or live-action indicators',
    );
  });

  it('rejects broadcast-positive markers hidden outside non-broadcast attestations', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      dryRun: {
        'Daemon approval preparation':
          'N/A - explicit CLI submit workflow artifact://prebroadcast/daemon-approval-na.log live broadcast approval recorded yes',
      },
      signoff: {
        Classification: 'inconclusive',
        'Stop conditions discovered':
          'none artifact://prebroadcast/reviewer-stop.log mempool transaction observed yes',
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Daemon approval preparation must not include broadcast-enabled or live-action indicators',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Stop conditions discovered must not include broadcast-enabled or live-action indicators',
    );
  });

  it('rejects broadcast policy artifacts that do not prove broadcast is disabled or refused', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      commands: {
        'Broadcast policy result': 'artifact://prebroadcast/broadcast-policy.log Broadcast policy PASS',
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Command Artifacts: Broadcast policy result must prove broadcast is disabled or refused for this dry-run package',
    );
  });

  it('rejects live broadcast-capable command surfaces in pre-broadcast artifact fields', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      commands: {
        '`npm run status` artifact':
          'artifact://prebroadcast/status.log accidentally ran npm run e2e:aggregate -- trigger 0x1234; ' +
          'operator also cited npm run e2e:aggregate -- submit 0x1234',
      },
      dryRun: {
        'Peg-in event ID or TX ID':
          'artifact://prebroadcast/peg-in-event.log cited npm run e2e:aggregate -- confirm 0x1234 0x5678 100',
        '`/transactions/check` result':
          'PASS artifact://prebroadcast/transactions-check.log followed by npm run settle:aggregate -- submit 0x1234; ' +
          'then npm run settle:aggregate -- confirm-with-ingest 0x1234 0x5678 0xaaaa 0xbbbb 100; ' +
          'then npm run settle:aggregate -- submit-batch 0xaaaa 0xbbbb 0xcccc',
        'Daemon approval preparation':
          `${DAEMON_APPROVAL_PREPARATION} followed by npm run settle:aggregate -- submit ${PEG_OUT_BURN_TX_ID} ${EXPECTED_TX_ID}; ` +
          `then npm run settle:aggregate -- confirm-batch ${EXPECTED_TX_ID} ${PEG_OUT_BURN_TX_ID} ${'ab'.repeat(32)}`,
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Command Artifacts: `npm run status` artifact must not cite live broadcast-capable command surface: npm run e2e:aggregate -- trigger',
    );
    expect(result.errors).toContain(
      'Required Command Artifacts: `npm run status` artifact must not cite live broadcast-capable command surface: npm run e2e:aggregate -- submit',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Peg-in event ID or TX ID must not cite live broadcast-capable command surface: npm run e2e:aggregate -- confirm',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: `/transactions/check` result must not cite live broadcast-capable command surface: npm run settle:aggregate -- submit',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: `/transactions/check` result must not cite live broadcast-capable command surface: npm run settle:aggregate -- confirm-with-ingest',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: `/transactions/check` result must not cite live broadcast-capable command surface: npm run settle:aggregate -- submit-batch',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Daemon approval preparation must not cite live broadcast-capable command surface: npm run settle:aggregate -- submit',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Daemon approval preparation must not cite live broadcast-capable command surface: npm run settle:aggregate -- confirm-batch',
    );
  });

  it('rejects Windows npm.cmd live broadcast-capable command surfaces', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      commands: {
        '`npm run status` artifact':
          'artifact://prebroadcast/status.log cited npm.cmd run e2e:aggregate -- submit 0x1234; ' +
          'then npm.cmd run deploy:sidechain',
      },
      dryRun: {
        '`/transactions/check` result':
          'PASS artifact://prebroadcast/transactions-check.log followed by npm.cmd run settle:aggregate -- submit 0x1234',
        'Daemon approval preparation':
          `${DAEMON_APPROVAL_PREPARATION
            .replace('npm run settle:aggregate -- check', 'npm.cmd run settle:aggregate -- check')} ` +
          `then npm.cmd run settle:aggregate -- submit ${PEG_OUT_BURN_TX_ID} ${EXPECTED_TX_ID}`,
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Command Artifacts: `npm run status` artifact must not cite live broadcast-capable command surface: npm.cmd run e2e:aggregate -- submit',
    );
    expect(result.errors).toContain(
      'Required Command Artifacts: `npm run status` artifact must not cite live broadcast-capable command surface: npm.cmd run deploy:sidechain',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: `/transactions/check` result must not cite live broadcast-capable command surface: npm.cmd run settle:aggregate -- submit',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Daemon approval preparation must not cite live broadcast-capable command surface: npm.cmd run settle:aggregate -- submit',
    );
  });

  it('rejects deploy and direct tsx live broadcast-capable command surfaces', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      commands: {
        '`npm run status` artifact':
          'artifact://prebroadcast/status.log cited npm run deploy and npm run deploy:aggregate -- --batch; ' +
          'then tsx src/scripts/deploy-aggregate.ts --batch',
      },
      dryRun: {
        'Peg-in event ID or TX ID':
          'artifact://prebroadcast/peg-in-event.log cited tsx src/scripts/e2e-aggregate-settlement.ts trigger',
        '`/transactions/check` result':
          'PASS artifact://prebroadcast/transactions-check.log followed by tsx src/scripts/aggregate-settlement.ts submit 0x1234; ' +
          'then tsx src/scripts/aggregate-settlement.ts submit-batch 0xaaaa 0xbbbb 0xcccc',
        'Daemon approval preparation':
          `${DAEMON_APPROVAL_PREPARATION} followed by npx tsx src/scripts/aggregate-settlement.ts confirm ${PEG_OUT_BURN_TX_ID} ${EXPECTED_TX_ID}; ` +
          `then npx tsx src/scripts/aggregate-settlement.ts confirm-batch ${EXPECTED_TX_ID} ${PEG_OUT_BURN_TX_ID} ${'ab'.repeat(32)}`,
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Command Artifacts: `npm run status` artifact must not cite live broadcast-capable command surface: npm run deploy',
    );
    expect(result.errors).toContain(
      'Required Command Artifacts: `npm run status` artifact must not cite live broadcast-capable command surface: npm run deploy:aggregate',
    );
    expect(result.errors).toContain(
      'Required Command Artifacts: `npm run status` artifact must not cite live broadcast-capable command surface: tsx src/scripts/deploy-aggregate.ts',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Peg-in event ID or TX ID must not cite live broadcast-capable command surface: tsx src/scripts/e2e-aggregate-settlement.ts trigger',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: `/transactions/check` result must not cite live broadcast-capable command surface: tsx src/scripts/aggregate-settlement.ts submit',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: `/transactions/check` result must not cite live broadcast-capable command surface: tsx src/scripts/aggregate-settlement.ts submit-batch',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Daemon approval preparation must not cite live broadcast-capable command surface: npx tsx src/scripts/aggregate-settlement.ts confirm',
    );
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: Daemon approval preparation must not cite live broadcast-capable command surface: npx tsx src/scripts/aggregate-settlement.ts confirm-batch',
    );
  });

  it('rejects hidden live broadcast-capable command surfaces anywhere in the package', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      lifecycleGuidance: [
        'Fresh testnet lifecycle: publication blocker pending until a live lifecycle package exists.',
        'Settlement submit evidence: blocker pending until user explicit live broadcast approval and submitted transaction ID evidence exist.',
        'Confirmation evidence: unchecked blocker pending until live confirmation evidence exists.',
        'Reconciliation evidence: unchecked blocker pending until live reconciliation evidence exists.',
        'Incomplete live lifecycle rows remain publication blockers.',
        'The next live rehearsal must capture submitted transaction ID, confirmation evidence, and reconciliation evidence before any Gate 3 closure.',
        'Operator scratch note: npm run settle:aggregate -- submit 1111 expectedTxId.',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Testnet Pre-Broadcast Evidence: document must not cite live broadcast-capable command surface: npm run settle:aggregate -- submit',
    );
  });

  it('rejects hidden broadcast-enabled markers anywhere in the package', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      signoff: {
        'Stop conditions discovered':
          'operator note kept for follow-up: BRIDGE_BROADCAST_ENABLED=true was discussed but not approved',
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Testnet Pre-Broadcast Evidence: document must not include broadcast-enabled or live-action indicators',
    );
  });

  it('requires lifecycle guidance to call for user explicit live broadcast approval before live submit', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      lifecycleGuidance: [
        'Fresh testnet lifecycle: publication blocker pending until a live lifecycle package exists.',
        'Settlement submit evidence: blocker pending until explicit broadcast approval and submitted transaction ID evidence exist.',
        'Confirmation evidence: unchecked blocker pending until live confirmation evidence exists.',
        'Reconciliation evidence: unchecked blocker pending until live reconciliation evidence exists.',
        'Incomplete live lifecycle rows remain publication blockers.',
        'The next live rehearsal must capture submitted transaction ID, confirmation evidence, and reconciliation evidence before any Gate 3 closure.',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Lifecycle Linkage Guidance: must require user explicit live broadcast approval before live submit evidence',
    );
  });

  it('requires concrete dry-run identifiers and positive testnet metadata', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      scope: {
        Environment: 'mainnet',
        'Ergo node network': 'not testnet',
        'Git commit': 'not-a-sha',
      },
      commands: {
        'Clean deployment state evidence': 'artifact://prebroadcast/clean-deployment-state.json clean deployment state',
      },
      dryRun: {
        'Peg-out burn TX ID': 'artifact://prebroadcast/peg-out-burn.log',
        'Peg-in event ID or TX ID': 'artifact://prebroadcast/peg-in-event.log',
        'Sidechain block hash': `${SIDECHAIN_BLOCK_HASH} ${EXPECTED_TX_ID} artifact://prebroadcast/sidechain-block.log`,
        'Bridge event root': 'artifact://prebroadcast/bridge-event-root.log',
        'Expected transaction ID': 'artifact://prebroadcast/expected-tx.log',
        'Input count': '3',
        'ContextExtension key counts per input': '0,4',
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Scope Statement: Git commit must be a 7-40 character Git commit SHA');
    expect(result.errors).toContain('Scope Statement: Environment must be testnet');
    expect(result.errors).toContain('Scope Statement: Ergo node network must positively identify testnet');
    expect(result.errors).toContain('Required Command Artifacts: Clean deployment state evidence must include a concrete 32-byte deployment-state hash or digest');
    expect(result.errors).toContain('Required Command Artifacts: Clean deployment state evidence must include at least one concrete 32-byte contract ID');
    expect(result.errors).toContain('Required Command Artifacts: Clean deployment state evidence must include at least one concrete 32-byte singleton inventory identifier');
    expect(result.errors).toContain('Dry-Run Settlement Shape: Peg-in event ID or TX ID must include exactly one 32-byte hex value');
    expect(result.errors).toContain('Dry-Run Settlement Shape: Peg-out burn TX ID must include exactly one 32-byte hex value');
    expect(result.errors).toContain('Dry-Run Settlement Shape: Sidechain block hash must include exactly one 32-byte hex value');
    expect(result.errors).toContain('Dry-Run Settlement Shape: Bridge event root must include exactly one 32-byte hex value');
    expect(result.errors).toContain('Dry-Run Settlement Shape: Expected transaction ID must include exactly one 32-byte hex value');
    expect(result.errors).toContain('Dry-Run Settlement Shape: ContextExtension key counts per input must have one entry per input');
  });

  it('rejects negated or mixed testnet network wording in scope', () => {
    for (const ergoNodeNetwork of [
      'Ergo node network testnet not using testnet',
      'Ergo node network testnet not connected to testnet',
      'Ergo node network testnet mainchain',
    ]) {
      const result = validateTestnetPreBroadcastEvidence(evidence({
        scope: {
          'Ergo node network': ergoNodeNetwork,
        },
      }));

      expect(result.status, ergoNodeNetwork).toBe('BLOCKED');
      expect(result.errors, ergoNodeNetwork).toContain(
        'Scope Statement: Ergo node network must positively identify testnet',
      );
    }
  });

  it('requires sidechain network to be explicit non-mainnet testnet scope', () => {
    for (const sidechainNetwork of [
      'patched-devnet',
      'testnet',
      'non-mainnet sidechain devnet',
      'local development sidechain, non-mainnet',
    ]) {
      const result = validateTestnetPreBroadcastEvidence(evidence({
        scope: {
          'Sidechain network': sidechainNetwork,
        },
      }));

      expect(result.status, sidechainNetwork).toBe('PASS');
      expect(result.errors, sidechainNetwork).not.toContain(
        'Scope Statement: Sidechain network must identify patched-devnet, testnet, or an explicit non-mainnet sidechain network',
      );
    }

    for (const sidechainNetwork of [
      '',
      'sidechain',
      'mainnet',
      'main network',
      'main chain',
      'mainchain',
      'mixed mainnet and testnet',
      'not testnet',
      'not connected to testnet',
    ]) {
      const result = validateTestnetPreBroadcastEvidence(evidence({
        scope: {
          'Sidechain network': sidechainNetwork,
        },
      }));

      expect(result.status, sidechainNetwork).toBe('BLOCKED');
      expect(result.errors, sidechainNetwork).toContain(
        'Scope Statement: Sidechain network must identify patched-devnet, testnet, or an explicit non-mainnet sidechain network',
      );
    }
  });

  it('requires dry-run 32-byte identifiers to be distinct', () => {
    const result = validateTestnetPreBroadcastEvidence(evidence({
      dryRun: {
        'Expected transaction ID': `${PEG_OUT_BURN_TX_ID} artifact://prebroadcast/expected-tx.log`,
      },
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dry-Run Settlement Shape: dry-run 32-byte identifiers must be distinct across Peg-in event ID or TX ID, Peg-out burn TX ID, Sidechain block hash, Bridge event root, and Expected transaction ID',
    );
  });
});
