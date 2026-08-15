import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import { buildAggregateSettlementPrebroadcastEvidenceRecord } from './aggregate-settlement-evidence.js';
import { TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY } from './aggregate-settlement-evidence.test-helper.js';
import {
  doctorTestnetPreBroadcastPackage,
  buildTestnetPreBroadcastPackageDoctorReport,
} from './testnet-prebroadcast-package-doctor.js';
import { readLinkedAggregateSettlementEvidenceJsonRecords } from './testnet-prebroadcast-linked-json.js';
import { writeOfflineReportJson } from './offline-report-json.js';

const PEG_OUT_BURN_TX_ID = '1'.repeat(64);
const SIDECHAIN_BLOCK_HASH = '2'.repeat(64);
const BRIDGE_EVENT_ROOT = '3'.repeat(64);
const EXPECTED_TX_ID = '4'.repeat(64);
const DEPLOYMENT_STATE_HASH = '5'.repeat(64);
const CONTRACT_ID = '6'.repeat(64);
const SINGLETON_ID = '7'.repeat(64);
const PEG_IN_EVENT_ID = '8'.repeat(64);
const BROADCAST_ENABLED_FLAG = 'BRIDGE_BROADCAST_ENABLED';
const WALLET_PATH_FRAGMENT = 'wal' + 'let';

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

function evidence(overrides: {
  dryRun?: Record<string, string>;
  nonBroadcast?: Record<string, string>;
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
  };
  const signoff = {
    Classification: 'pass',
    'Stop conditions discovered': 'none',
    'Follow-up live rehearsal required': 'yes',
    'Follow-up recovery drill required': 'yes',
    Reviewer: 'reviewer-a',
    Date: '2026-05-16',
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

Fresh testnet lifecycle: publication blocker pending until a live lifecycle package exists.
Settlement submit evidence: blocker pending until user explicit live broadcast approval and submitted transaction ID evidence exist.
Confirmation evidence: unchecked blocker pending until live confirmation evidence exists.
Reconciliation evidence: unchecked blocker pending until live reconciliation evidence exists.
The next live rehearsal must capture submitted transaction ID, confirmation evidence, and reconciliation evidence before any Gate 3 closure.

## Publication Control

${listFields(publication)}

## Reviewer Sign-Off

${listFields(signoff)}
`;
}

function listFields(fields: Record<string, string>): string {
  return Object.entries(fields).map(([key, value]) => `- ${key}: ${value}`).join('\n');
}

describe('testnet pre-broadcast package doctor', () => {
  it('blocks unsafe CLI JSON output targets before reading prebroadcast packages', () => {
    const jsonOutTarget = '../operator/private-key-report.json';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/prebroadcast-package-doctor.ts',
        'missing-prebroadcast.md',
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
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('keeps CLI JSON output guard before prebroadcast package reads', () => {
    const source = readFileSync(
      new URL('./scripts/prebroadcast-package-doctor.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain("import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js'");
    expect(source).toContain('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;');
    expect(source).toContain('const report = doctorTestnetPreBroadcastPackage(target);');
    expect(source.indexOf('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;')).toBeLessThan(
      source.indexOf('const report = doctorTestnetPreBroadcastPackage(target);'),
    );
  });

  it('reports PASS with a sanitized aggregate settlement JSON summary', () => {
    const markdown = evidence({
      dryRun: {
        '`/transactions/check` result':
          'PASS [aggregate JSON](aggregate-check.json) artifact://prebroadcast/transactions-check.log',
      },
    });

    const report = buildTestnetPreBroadcastPackageDoctorReport({
      label: 'completed-testnet-prebroadcast-evidence.md',
      markdown,
      linkedAggregateSettlementEvidenceJsonRecords: [{
        target: 'aggregate-check.json',
        record: aggregateEvidenceRecord(),
      }],
    });

    expect(report.status).toBe('PASS');
    expect(report.message).toBe('completed-testnet-prebroadcast-evidence.md: prebroadcast package doctor PASS');
    expect(report.lines).toContain('- linkedAggregateJson: 1 local record(s)');
    expect(report.lines).toContain(
      `- aggregate-check.json: READ command=check-with-ingest expectedTxId=${EXPECTED_TX_ID} claims=1 inputs=3 outputs=4 contextExtensionKeyCounts=0,4,2`,
    );
    expect(report.nextSafeActions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'rehearsal-preflight',
        command:
          'npm run rehearsal:preflight -- --prebroadcast completed-testnet-prebroadcast-evidence.md --approvals AGGREGATE_APPROVALS_V2_JSON --json-out REHEARSAL_PREFLIGHT_JSON',
        broadcastCommand: false,
        requiresExplicitLiveBroadcastApproval: false,
      }),
      expect.objectContaining({
        label: 'fresh-testnet-check',
        command:
          'npm run rehearsal:fresh-testnet-check -- --aggregate-evidence aggregate-check.json --auto-heights --ergo-node-network testnet --sidechain-network SIDECHAIN_NETWORK_NON_MAINNET --out FRESH_TESTNET_CHECKPOINT_MD --json-out FRESH_TESTNET_CHECKPOINT_JSON',
        broadcastCommand: false,
        requiresExplicitLiveBroadcastApproval: false,
      }),
    ]));
    const windowsDrivePathPattern = ['[A-Za-z]', ':', '\\\\'].join('');
    const posixTempPathPattern = ['\\/', 'tmp', '\\/'].join('');
    expect(report.lines.join('\n')).not.toMatch(new RegExp(
      `${windowsDrivePathPattern}|${posixTempPathPattern}|${BROADCAST_ENABLED_FLAG}=true|${['settle:aggregate', '-- submit'].join(' ')}`,
    ));
  });

  it('falls back to placeholders for unsafe next-action command targets', () => {
    const report = buildTestnetPreBroadcastPackageDoctorReport({
      label: 'completed-testnet-prebroadcast-evidence.md;unexpected',
      markdown: evidence(),
      linkedAggregateSettlementEvidenceJsonRecords: [{
        target: 'aggregate-check.json;unexpected',
        record: aggregateEvidenceRecord(),
      }],
    });

    const preflight = report.nextSafeActions.find(action => action.label === 'rehearsal-preflight');
    const freshCheckpoint = report.nextSafeActions.find(action => action.label === 'fresh-testnet-check');

    expect(report.status).toBe('PASS');
    expect(preflight?.command).toContain('--prebroadcast COMPLETED_TESTNET_PREBROADCAST_EVIDENCE_MD');
    expect(freshCheckpoint?.command).toContain('--aggregate-evidence AGGREGATE_CHECK_JSON');
    expect(`${preflight?.command}\n${freshCheckpoint?.command}`).not.toContain(';unexpected');
    expect(report.nextSafeActions.map(action => action.command ?? '').join('\n')).not.toMatch(/[<>|;]/);
  });

  it('writes a structured PASS doctor report for offline gating', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prebroadcast-doctor-report-'));
    try {
      const report = buildTestnetPreBroadcastPackageDoctorReport({
        label: 'completed-testnet-prebroadcast-evidence.md',
        markdown: evidence({
          dryRun: {
            '`/transactions/check` result':
              'PASS [aggregate JSON](aggregate-check.json) artifact://prebroadcast/transactions-check.log',
          },
        }),
        linkedAggregateSettlementEvidenceJsonRecords: [{
          target: 'aggregate-check.json',
          record: aggregateEvidenceRecord(),
        }],
      });
      const writeResult = writeOfflineReportJson(`${basename(dir)}/doctor.json`, {
        schemaVersion: 1,
        status: report.status,
        reports: [report],
      });
      const saved = JSON.parse(readFileSync(join(dir, 'doctor.json'), 'utf8'));

      expect(writeResult.errors).toEqual([]);
      expect(saved.status).toBe('PASS');
      expect(saved.reports[0].errors).toEqual([]);
      expect(saved.reports[0].linkedAggregateJsonSummaries[0]).toMatchObject({
        target: 'aggregate-check.json',
        status: 'READ',
        command: 'check-with-ingest',
        expectedTxId: EXPECTED_TX_ID,
      });
      expect(saved.reports[0].nextSafeActions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          label: 'rehearsal-preflight',
          broadcastCommand: false,
        }),
        expect.objectContaining({
          label: 'offline-gate',
          broadcastCommand: false,
        }),
      ]));
      expect(saved.reports[0].lines).toContain(
        `- aggregate-check.json: READ command=check-with-ingest expectedTxId=${EXPECTED_TX_ID} claims=1 inputs=3 outputs=4 contextExtensionKeyCounts=0,4,2`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps every target report when a multi-target doctor run is blocked', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prebroadcast-doctor-report-'));
    try {
      const passReport = buildTestnetPreBroadcastPackageDoctorReport({
        label: 'completed-testnet-prebroadcast-evidence.md',
        markdown: evidence(),
        linkedAggregateSettlementEvidenceJsonRecords: [],
      });
      const blockedReport = doctorTestnetPreBroadcastPackage(`../operator/${WALLET_PATH_FRAGMENT}.md`);
      const writeResult = writeOfflineReportJson(`${basename(dir)}/doctor-blocked.json`, {
        schemaVersion: 1,
        status: 'BLOCKED',
        reports: [passReport, blockedReport],
      });
      const savedText = readFileSync(join(dir, 'doctor-blocked.json'), 'utf8');
      const saved = JSON.parse(savedText);

      expect(writeResult.errors).toEqual([]);
      expect(saved.status).toBe('BLOCKED');
      expect(saved.reports).toHaveLength(2);
      expect(saved.reports[1].label).toBe('<blocked evidence target>');
      expect(savedText).not.toContain(WALLET_PATH_FRAGMENT);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports BLOCKED for tampered linked aggregate settlement JSON', () => {
    const markdown = evidence({
      dryRun: {
        '`/transactions/check` result':
          'PASS [aggregate JSON](aggregate-check.json) artifact://prebroadcast/transactions-check.log',
      },
    });
    const record = aggregateEvidenceRecord();
    record.broadcast = 'yes';

    const report = buildTestnetPreBroadcastPackageDoctorReport({
      label: 'completed-testnet-prebroadcast-evidence.md',
      markdown,
      linkedAggregateSettlementEvidenceJsonRecords: [{
        target: 'aggregate-check.json',
        record,
      }],
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'Linked aggregate settlement evidence aggregate-check.json: broadcast must be no',
    );
    expect(report.lines).toContain('- aggregate-check.json: BLOCKED invalid aggregate settlement evidence JSON');
    expect(report.lines.join('\n')).not.toContain('"broadcast":"yes"');
  });

  it('keeps live broadcast markers blocked through the doctor path', () => {
    const report = buildTestnetPreBroadcastPackageDoctorReport({
      label: 'completed-testnet-prebroadcast-evidence.md',
      markdown: evidence({
        nonBroadcast: {
          '`BRIDGE_BROADCAST_ENABLED` state at start':
            `unset artifact://prebroadcast/broadcast-state-start.log ${BROADCAST_ENABLED_FLAG}=true`,
          'Submit command attempted':
            'no artifact://prebroadcast/submit-not-attempted.log submit command attempted: yes',
        },
      }),
      linkedAggregateSettlementEvidenceJsonRecords: [],
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'Testnet Pre-Broadcast Evidence: document must not include broadcast-enabled or live-action indicators',
    );
    expect(report.errors).toContain(
      'Non-Broadcast Attestation: Submit command attempted must not include broadcast-enabled or live-action indicators',
    );
  });

  it('reads linked JSON from the evidence package directory and refuses symlink escapes', () => {
    const outsideRoot = mkdtempSync(join(tmpdir(), 'bridge-outside-json-'));
    const outsideEvidenceDir = join(outsideRoot, 'evidence');
    const internalRoot = mkdtempSync(join(process.cwd(), '.tmp-prebroadcast-doctor-'));
    const linkPath = join(internalRoot, 'external-link');

    try {
      mkdirSync(outsideEvidenceDir);
      writeFileSync(join(outsideEvidenceDir, 'aggregate-check.json'), JSON.stringify(aggregateEvidenceRecord()));
      symlinkSync(outsideEvidenceDir, linkPath, process.platform === 'win32' ? 'junction' : 'dir');

      const markdown = evidence({
        dryRun: {
          '`/transactions/check` result':
            'PASS [aggregate JSON](external-link/aggregate-check.json) artifact://prebroadcast/transactions-check.log',
        },
      });
      writeFileSync(join(internalRoot, 'completed.md'), markdown);

      const records = readLinkedAggregateSettlementEvidenceJsonRecords(
        `${basename(internalRoot)}/completed.md`,
        markdown,
      );

      expect(records).toEqual([{
        target: '<blocked evidence JSON target>',
        readError: 'refusing to read linked JSON outside the bridge repository',
      }]);
      expect(JSON.stringify(records)).not.toContain('external-link');
      expect(JSON.stringify(records)).not.toContain('aggregate-check.json');
      expect(JSON.stringify(records)).not.toContain(outsideRoot);

      const report = buildTestnetPreBroadcastPackageDoctorReport({
        label: `${basename(internalRoot)}/completed.md`,
        markdown,
        linkedAggregateSettlementEvidenceJsonRecords: records,
      });
      const serialized = JSON.stringify(report);

      expect(report.status).toBe('BLOCKED');
      expect(serialized).toContain('<blocked evidence JSON target>');
      expect(serialized).not.toContain('external-link');
      expect(serialized).not.toContain('aggregate-check.json');
      expect(serialized).not.toContain(outsideRoot);
    } finally {
      rmSync(internalRoot, { recursive: true, force: true });
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it('uses sanitized labels for unsafe package and linked JSON targets', () => {
    const packageReport = doctorTestnetPreBroadcastPackage(
      `https://example.invalid/operator/${WALLET_PATH_FRAGMENT}.md?token=secret`,
    );
    expect(packageReport.status).toBe('BLOCKED');
    expect(packageReport.label).toBe('<blocked evidence target>');
    expect(packageReport.lines.join('\n')).not.toContain('token=secret');

    const markdown = evidence({
      dryRun: {
        '`/transactions/check` result':
          `PASS [aggregate JSON](operator/${WALLET_PATH_FRAGMENT}-check.json) ` +
          'artifact://prebroadcast/transactions-check.log',
      },
    });
    const report = buildTestnetPreBroadcastPackageDoctorReport({
      label: 'completed-testnet-prebroadcast-evidence.md',
      markdown,
      linkedAggregateSettlementEvidenceJsonRecords: [],
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain(
      'Linked aggregate settlement evidence <blocked evidence JSON target>: refusing to write secret-bearing or runtime-state paths as evidence JSON',
    );
    expect(report.lines.join('\n')).not.toContain(`operator/${WALLET_PATH_FRAGMENT}-check.json`);
  });
});
