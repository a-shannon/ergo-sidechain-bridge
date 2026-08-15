import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildAggregateSettlementPrebroadcastEvidenceRecord,
  type AggregateSettlementPrebroadcastClaimEvidence,
  type AggregateSettlementPrebroadcastEvidenceRecord,
} from './aggregate-settlement-evidence.js';
import { TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY } from './aggregate-settlement-evidence.test-helper.js';
import {
  preflightTestnetRehearsal,
  validateTestnetRehearsalPreflightReport,
} from './testnet-rehearsal-preflight.js';
import { writeOfflineReportJson } from './offline-report-json.js';

const NOW = new Date('2026-05-17T10:30:00.000Z');
const PEG_OUT_BURN_TX_ID = '1'.repeat(64);
const PEG_OUT_BURN_TX_ID_B = '9'.repeat(64);
const SIDECHAIN_BLOCK_HASH = '2'.repeat(64);
const SIDECHAIN_BLOCK_HASH_B = 'a'.repeat(64);
const BRIDGE_EVENT_ROOT = '3'.repeat(64);
const EXPECTED_TX_ID = '4'.repeat(64);
const OTHER_EXPECTED_TX_ID = 'b'.repeat(64);
const DEPLOYMENT_STATE_HASH = '5'.repeat(64);
const OTHER_DEPLOYMENT_STATE_HASH = 'c'.repeat(64);
const CONTRACT_ID = '6'.repeat(64);
const SINGLETON_ID = '7'.repeat(64);
const PEG_IN_EVENT_ID = '8'.repeat(64);

function aggregateEvidenceRecord(
  command = 'check-with-ingest',
  claims: AggregateSettlementPrebroadcastClaimEvidence[] = [{
    burnTxHash: PEG_OUT_BURN_TX_ID,
    sidechainBlockHeight: 200,
    sidechainHeaderHashHex: SIDECHAIN_BLOCK_HASH,
    bridgeEventRootHex: BRIDGE_EVENT_ROOT,
    ergoAnchorHeight: 100,
  }],
  expectedTxId = EXPECTED_TX_ID,
): AggregateSettlementPrebroadcastEvidenceRecord {
  return buildAggregateSettlementPrebroadcastEvidenceRecord({
    generatedAt: '2026-05-17T10:20:00.000Z',
    command,
    label: 'Aggregate settlement preflight fixture',
    expectedTxId,
    transactionCheckResponse: '',
    checkerIdentity: {
      ...TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY,
      nodeOrigin: 'http://localhost:9053',
    },
    settlementShape: {
      inputCount: command === 'check-batch' ? 4 : 3,
      outputCount: 4,
      contextExtensionKeyCounts: command === 'check-batch' ? [0, 4, 4, 2] : [0, 4, 2],
      contextExtensionKeyCountsCsv: command === 'check-batch' ? '0,4,4,2' : '0,4,2',
    },
    claims,
  });
}

function completedPrebroadcastEvidence(
  record: AggregateSettlementPrebroadcastEvidenceRecord,
  jsonTarget = 'aggregate-check.json',
): string {
  const selectedClaim = record.claims[0];
  const scope = {
    'Evidence package name': 'fresh-testnet-prebroadcast-2026-05-17',
    Date: '2026-05-17',
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
    'Peg-out burn TX ID': `${selectedClaim.burnTxHash} artifact://prebroadcast/peg-out-burn.log`,
    'Sidechain block height': `${selectedClaim.sidechainBlockHeight}`,
    'Sidechain block hash': `${selectedClaim.sidechainHeaderHashHex ?? SIDECHAIN_BLOCK_HASH} artifact://prebroadcast/sidechain-block.log`,
    'Bridge event root': `${selectedClaim.bridgeEventRootHex ?? BRIDGE_EVENT_ROOT} artifact://prebroadcast/bridge-event-root.log`,
    ...(record.claimCount > 1 ? {
      'Bridge event roots': `${record.claims.map(claim => claim.bridgeEventRootHex).join(',')} artifact://prebroadcast/bridge-event-roots.log`,
    } : {}),
    'Ergo anchor height': `${selectedClaim.ergoAnchorHeight ?? 100}`,
    'Aggregate claim count': `${record.claimCount}`,
    'Input count': `${record.settlementShape.inputCount}`,
    'Output count': `${record.settlementShape.outputCount}`,
    'ContextExtension key counts per input': record.settlementShape.contextExtensionKeyCountsCsv,
    '`/transactions/check` result':
      `PASS [aggregate JSON](${jsonTarget}) artifact://prebroadcast/transactions-check.log`,
    'Expected transaction ID': `${record.transactionCheck.expectedTxId} artifact://prebroadcast/expected-tx.log`,
    'Daemon approval preparation': daemonApprovalPreparation(record),
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
    Date: '2026-05-17',
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

function approvalFile(approval: Record<string, unknown>): Record<string, unknown> {
  const finalApproval = {
    expectedTxId: EXPECTED_TX_ID,
    approvedAt: '2026-05-17T10:05:00Z',
    expiresAt: '2026-05-17T11:05:00Z',
    ...approval,
  } as Record<string, any>;
  const burnTxHashes = Array.isArray(finalApproval.burnTxHashes)
    ? finalApproval.burnTxHashes
    : [finalApproval.burnTxHash];
  const burnSet = burnTxHashes.join(',');
  if (finalApproval.mode === 'batch' && !Array.isArray(finalApproval.bridgeEventRootHexes)) {
    finalApproval.bridgeEventRootHexes = [BRIDGE_EVENT_ROOT, 'b'.repeat(64)];
  }
  finalApproval.evidence =
    `artifact://approval/reviewer.log completed approval evidence target mode ${finalApproval.mode} ` +
    `non-broadcast Expected transaction ID ${finalApproval.expectedTxId} ordered burn set ${burnSet}`;
  finalApproval.checkEvidence =
    `artifact://prebroadcast/check.log ${finalApproval.checkCommand} mode ${finalApproval.mode} non-broadcast PASS ` +
    `Expected transaction ID ${finalApproval.expectedTxId} ordered burn set ${burnSet}`;
  finalApproval.checkEvidenceJson = 'aggregate-check.json';
  return {
    version: 2,
    createdAt: '2026-05-17T10:00:00Z',
    environment: 'testnet',
    ergoNodeNetwork: 'testnet',
    ergoNodeUrl: 'http://localhost:9053',
    sidechainNetwork: 'patched-devnet',
    sidechainRpcUrl: 'http://localhost:8545',
    sidechainWsUrl: 'ws://localhost:9944',
    deployedStateHash: DEPLOYMENT_STATE_HASH,
    approvals: [finalApproval],
  };
}

function daemonApprovalPreparation(record: AggregateSettlementPrebroadcastEvidenceRecord): string {
  const mode = record.command === 'check-batch'
    ? 'batch'
    : record.command === 'check'
      ? 'single'
      : 'single-with-ingest';
  const burnSet = record.claims.map(claim => claim.burnTxHash).join(',');
  const command = mode === 'batch'
    ? `npm run settle:aggregate -- check-batch ${record.claims.map(claim => claim.burnTxHash).join(' ')}`
    : `npm run settle:aggregate -- ${record.command} ${record.claims[0].burnTxHash}`;
  const burnBinding = mode === 'batch'
    ? `ordered burn set ${burnSet}`
    : `peg-out burn TX ID ${record.claims[0].burnTxHash}`;

  return (
    'artifact://prebroadcast/daemon-approval-prep.log approval file version 2 runtime context binding ' +
    'ergoNodeUrl sidechainRpcUrl sidechainWsUrl deployedStateHash ' +
    `mode ${mode} active approval window non-mainnet networks ${command} ` +
    `checkEvidence artifact://prebroadcast/check.log completed approval evidence target ` +
    `Expected transaction ID ${record.transactionCheck.expectedTxId} ${burnBinding}`
  );
}

function listFields(fields: Record<string, string>): string {
  return Object.entries(fields).map(([key, value]) => `- ${key}: ${value}`).join('\n');
}

function writeFixture(
  dir: string,
  record: AggregateSettlementPrebroadcastEvidenceRecord,
  approvals?: Record<string, unknown>,
): { prebroadcastTarget: string; approvalsPath?: string } {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'aggregate-check.json'), JSON.stringify(record, null, 2));
  writeFileSync(join(dir, 'completed.md'), completedPrebroadcastEvidence(record));
  if (approvals) {
    writeFileSync(join(dir, 'approvals.json'), JSON.stringify(approvals, null, 2));
  }
  return {
    prebroadcastTarget: `${basename(dir)}/completed.md`,
    approvalsPath: approvals ? `${basename(dir)}/approvals.json` : undefined,
  };
}

describe('testnet rehearsal preflight', () => {
  it('blocks unsafe CLI JSON output targets before reading preflight inputs', () => {
    const jsonOutTarget = '../operator/private-key-report.json';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-rehearsal-preflight.ts',
        '--prebroadcast',
        'missing-prebroadcast.md',
        '--approvals',
        'missing-approvals.json',
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

  it('keeps CLI JSON output guard before preflight input reads', () => {
    const source = readFileSync(
      new URL('./scripts/testnet-rehearsal-preflight.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain("import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js'");
    expect(source).toContain('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;');
    expect(source).toContain('const report = preflightTestnetRehearsal({');
    expect(source.indexOf('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;')).toBeLessThan(
      source.indexOf('const report = preflightTestnetRehearsal({'),
    );
  });

  it('returns GO only when prebroadcast evidence and daemon approval bindings match exactly', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal-preflight-'));
    try {
      const record = aggregateEvidenceRecord();
      const targets = writeFixture(dir, record, approvalFile({
        mode: 'single-with-ingest',
        burnTxHash: PEG_OUT_BURN_TX_ID,
        checkCommand: `npm run settle:aggregate -- check-with-ingest ${PEG_OUT_BURN_TX_ID} ${SIDECHAIN_BLOCK_HASH} ${BRIDGE_EVENT_ROOT} 100`,
      }));

      const report = preflightTestnetRehearsal({ ...targets, now: NOW });

      expect(report.status, report.errors.join('\n')).toBe('GO');
      expect(report.errors).toEqual([]);
      expect(report.packages).toEqual([{
        target: 'aggregate-check.json',
        command: 'check-with-ingest',
        mode: 'single-with-ingest',
        expectedTxId: EXPECTED_TX_ID,
        burnTxHashes: [PEG_OUT_BURN_TX_ID],
        sidechainBlockHeights: [200],
        sidechainHeaderHashHexes: [SIDECHAIN_BLOCK_HASH],
        ergoAnchorHeights: [100],
        bridgeEventRootHexes: [BRIDGE_EVENT_ROOT],
        deployedStateHash: DEPLOYMENT_STATE_HASH,
      }]);
      expect(report.lines).toContain('- approvals: 1 matched binding(s) from ' + targets.approvalsPath);
      expect(report.lines.join('\n')).toContain('sidechainBlockHeights=200');
      expect(report.lines.join('\n')).toContain(`sidechainHeaderHashHexes=${SIDECHAIN_BLOCK_HASH}`);
      expect(report.lines.join('\n')).toContain('ergoAnchorHeights=100');
      expect(report.lines.join('\n')).toContain(`bridgeEventRoots=${BRIDGE_EVENT_ROOT}`);
      expect(report.lines.join('\n')).toContain('this preflight does not authorize broadcast');
      expect(report.lines.join('\n')).toContain('Legacy V1 submission quarantine:');
      expect(report.lines.join('\n')).toContain('approval does not lift this quarantine');

      const paddedReport = preflightTestnetRehearsal({
        prebroadcastTarget: `  ${targets.prebroadcastTarget}  `,
        approvalsPath: `  ${targets.approvalsPath}  `,
        now: NOW,
      });
      expect(paddedReport.status).toBe('GO');
      expect(paddedReport.targetBindings).toEqual({
        prebroadcast: targets.prebroadcastTarget,
        approvals: targets.approvalsPath,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes a structured GO preflight report with exact package bindings', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal-preflight-'));
    try {
      const record = aggregateEvidenceRecord();
      const targets = writeFixture(dir, record, approvalFile({
        mode: 'single-with-ingest',
        burnTxHash: PEG_OUT_BURN_TX_ID,
        checkCommand: `npm run settle:aggregate -- check-with-ingest ${PEG_OUT_BURN_TX_ID} ${SIDECHAIN_BLOCK_HASH} ${BRIDGE_EVENT_ROOT} 100`,
      }));
      const report = preflightTestnetRehearsal({ ...targets, now: NOW });
      const writeResult = writeOfflineReportJson(`${basename(dir)}/preflight.json`, {
        schemaVersion: 1,
        ...report,
      });
      const saved = JSON.parse(readFileSync(join(dir, 'preflight.json'), 'utf8'));

      expect(writeResult.errors).toEqual([]);
      expect(saved.status).toBe('GO');
      expect(saved.packages[0]).toEqual({
        target: 'aggregate-check.json',
        command: 'check-with-ingest',
        mode: 'single-with-ingest',
        expectedTxId: EXPECTED_TX_ID,
        burnTxHashes: [PEG_OUT_BURN_TX_ID],
        sidechainBlockHeights: [200],
        sidechainHeaderHashHexes: [SIDECHAIN_BLOCK_HASH],
        ergoAnchorHeights: [100],
        bridgeEventRootHexes: [BRIDGE_EVENT_ROOT],
        deployedStateHash: DEPLOYMENT_STATE_HASH,
      });
      expect(saved.lines.join('\n')).toContain('this preflight does not authorize broadcast');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    {
      variant: 'raw',
      localMarkdownTarget: ['C:', 'tmp', 'completed.md'].join('/'),
      localJsonTarget: ['file:', '', '', 'C:', 'tmp', 'approvals.json'].join('/'),
      localPackageTarget: ['C:', 'tmp', 'aggregate-check.json'].join('/'),
    },
    {
      variant: 'encoded',
      localMarkdownTarget: '%2Ftmp%2Fcompleted.md',
      localJsonTarget: 'file%3A%2F%2F%2FC%3A%2Ftmp%2Fapprovals.json',
      localPackageTarget: '%2Ftmp%2Faggregate-check.json',
    },
    {
      variant: 'embedded encoded',
      localMarkdownTarget: 'artifact://preflight/sourceTarget=%2Ftmp%2Fcompleted.md',
      localJsonTarget: 'artifact://preflight/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Fapprovals.json',
      localPackageTarget: 'artifact://preflight/sourceTarget=%2Ftmp%2Faggregate-check.json',
    },
  ])('blocks structured GO preflight reports with $variant local-only evidence bindings', ({
    localMarkdownTarget,
    localJsonTarget,
    localPackageTarget,
  }) => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal-preflight-'));
    try {
      const record = aggregateEvidenceRecord();
      const targets = writeFixture(dir, record, approvalFile({
        mode: 'single-with-ingest',
        burnTxHash: PEG_OUT_BURN_TX_ID,
        checkCommand: `npm run settle:aggregate -- check-with-ingest ${PEG_OUT_BURN_TX_ID} ${SIDECHAIN_BLOCK_HASH} ${BRIDGE_EVENT_ROOT} 100`,
      }));
      const report = preflightTestnetRehearsal({ ...targets, now: NOW });
      const validation = validateTestnetRehearsalPreflightReport({
        schemaVersion: 1,
        ...report,
        targetBindings: {
          prebroadcast: localMarkdownTarget,
          approvals: localJsonTarget,
        },
        packages: report.packages.map(pkg => ({
          ...pkg,
          target: localPackageTarget,
        })),
      });

      expect(validation.errors).toContain('rehearsal-preflight: targetBindings.prebroadcast must be present');
      expect(validation.errors).toContain('rehearsal-preflight: targetBindings.approvals must be a JSON target');
      expect(validation.errors).toContain('rehearsal-preflight: packages[0].target must be a JSON target');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks structured GO preflight reports with non-concrete evidence bindings', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal-preflight-'));
    try {
      const record = aggregateEvidenceRecord();
      const targets = writeFixture(dir, record, approvalFile({
        mode: 'single-with-ingest',
        burnTxHash: PEG_OUT_BURN_TX_ID,
        checkCommand: `npm run settle:aggregate -- check-with-ingest ${PEG_OUT_BURN_TX_ID} ${SIDECHAIN_BLOCK_HASH} ${BRIDGE_EVENT_ROOT} 100`,
      }));
      const report = preflightTestnetRehearsal({ ...targets, now: NOW });
      const targetSets = [
        {
          prebroadcast: 'evidence/prebroadcast/generic-prebroadcast.md',
          approvals: 'evidence/preflight/generic-approvals.json',
          packageTarget: 'artifact://preflight/generic-aggregate-check.json',
        },
        {
          prebroadcast: 'evidence/prebroadcast/fixture-prebroadcast.md',
          approvals: 'evidence/preflight/mock-approvals.json',
          packageTarget: 'artifact://preflight/testdata-aggregate-check.json',
        },
        {
          prebroadcast: 'evidence/prebroadcast/completed-synthetic-prebroadcast.md',
          approvals: 'evidence/preflight/completed-synthetic-approvals.json',
          packageTarget: 'artifact://preflight/completed-synthetic-aggregate-check.json',
        },
        {
          prebroadcast: 'evidence/prebroadcast/completed-simulated-prebroadcast.md',
          approvals: 'evidence/preflight/completed-simulated-approvals.json',
          packageTarget: 'artifact://preflight/completed-simulated-aggregate-check.json',
        },
      ];

      for (const { prebroadcast, approvals, packageTarget } of targetSets) {
        const validation = validateTestnetRehearsalPreflightReport({
          schemaVersion: 1,
          ...report,
          targetBindings: {
            prebroadcast,
            approvals,
          },
          packages: report.packages.map(pkg => ({
            ...pkg,
            target: packageTarget,
          })),
        });

        expect(validation.errors).toContain('rehearsal-preflight: targetBindings.prebroadcast must be present');
        expect(validation.errors).toContain('rehearsal-preflight: targetBindings.approvals must be a JSON target');
        expect(validation.errors).toContain('rehearsal-preflight: packages[0].target must be a JSON target');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks structured GO preflight reports with claim-escalating evidence bindings', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal-preflight-'));
    try {
      const record = aggregateEvidenceRecord();
      const targets = writeFixture(dir, record, approvalFile({
        mode: 'single-with-ingest',
        burnTxHash: PEG_OUT_BURN_TX_ID,
        checkCommand: `npm run settle:aggregate -- check-with-ingest ${PEG_OUT_BURN_TX_ID} ${SIDECHAIN_BLOCK_HASH} ${BRIDGE_EVENT_ROOT} 100`,
      }));
      const report = preflightTestnetRehearsal({ ...targets, now: NOW });
      const validation = validateTestnetRehearsalPreflightReport({
        schemaVersion: 1,
        ...report,
        targetBindings: {
          prebroadcast: 'evidence/prebroadcast/testnet-production-candidate-prebroadcast.md',
          approvals: 'evidence/preflight/production-ready-approvals.json',
        },
        packages: report.packages.map(pkg => ({
          ...pkg,
          target: 'artifact://preflight/production-ready-aggregate-check.json',
        })),
      });

      expect(validation.errors).toContain('rehearsal-preflight: targetBindings.prebroadcast must be present');
      expect(validation.errors).toContain('rehearsal-preflight: targetBindings.approvals must be a JSON target');
      expect(validation.errors).toContain('rehearsal-preflight: packages[0].target must be a JSON target');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows concrete preflight audit targets with template or sample in the finding name', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal-preflight-'));
    try {
      const record = aggregateEvidenceRecord();
      const targets = writeFixture(dir, record, approvalFile({
        mode: 'single-with-ingest',
        burnTxHash: PEG_OUT_BURN_TX_ID,
        checkCommand: `npm run settle:aggregate -- check-with-ingest ${PEG_OUT_BURN_TX_ID} ${SIDECHAIN_BLOCK_HASH} ${BRIDGE_EVENT_ROOT} 100`,
      }));
      const concretePrebroadcastTarget = `${basename(dir)}/template-removal-audit-prebroadcast.md`;
      const concreteApprovalsPath = `${basename(dir)}/sample-size-analysis-approvals.json`;
      const concretePackageTarget = 'artifact://preflight/template-removal-audit-aggregate-check.json';
      writeFileSync(
        join(dir, 'template-removal-audit-prebroadcast.md'),
        readFileSync(join(dir, 'completed.md'), 'utf-8'),
      );
      writeFileSync(
        join(dir, 'sample-size-analysis-approvals.json'),
        readFileSync(join(dir, 'approvals.json'), 'utf-8'),
      );

      const report = preflightTestnetRehearsal({
        prebroadcastTarget: concretePrebroadcastTarget,
        approvalsPath: concreteApprovalsPath,
        now: NOW,
      });
      const validation = validateTestnetRehearsalPreflightReport({
        schemaVersion: 1,
        ...report,
        packages: report.packages.map(pkg => ({
          ...pkg,
          target: concretePackageTarget,
        })),
      });

      expect(report.status).toBe('GO');
      expect(report.targetBindings).toEqual({
        prebroadcast: concretePrebroadcastTarget,
        approvals: concreteApprovalsPath,
      });
      expect(validation.errors).toEqual([]);

      const authorityEscalatingValidation = validateTestnetRehearsalPreflightReport({
        schemaVersion: 1,
        ...report,
        lines: report.lines.filter(line =>
          !line.includes('Legacy V1 submission quarantine:') &&
          !line.includes('separately versioned external-fee settlement profile')),
        packages: report.packages.map(pkg => ({
          ...pkg,
          target: concretePackageTarget,
        })),
      });
      expect(authorityEscalatingValidation.errors).toEqual(expect.arrayContaining([
        'rehearsal-preflight: lines must state the exact legacy V1 submission quarantine',
        'rehearsal-preflight: lines must require the separately versioned external-fee settlement profile',
      ]));

      const contradictoryLinesValidation = validateTestnetRehearsalPreflightReport({
        schemaVersion: 1,
        ...report,
        lines: [
          ...report.lines,
          '- Validation summary: PASS exit code 0; validation BLOCKED with 1 structural issue',
        ],
        packages: report.packages.map(pkg => ({
          ...pkg,
          target: concretePackageTarget,
        })),
      });
      expect(contradictoryLinesValidation.errors).toContain(
        'rehearsal-preflight: lines must not include contradictory failure markers',
      );

      const compatibilityContradictoryLinesValidation = validateTestnetRehearsalPreflightReport({
        schemaVersion: 1,
        ...report,
        lines: [
          ...report.lines,
          '- Validation summary: PASS exit code 0; validation\uFF1A \uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue',
        ],
        packages: report.packages.map(pkg => ({
          ...pkg,
          target: concretePackageTarget,
        })),
      });
      expect(compatibilityContradictoryLinesValidation.errors).toContain(
        'rehearsal-preflight: lines must not include contradictory failure markers',
      );

      const structuredFailureLinesValidation = validateTestnetRehearsalPreflightReport({
        schemaVersion: 1,
        ...report,
        lines: [
          ...report.lines,
          '- Validation summary: {"errors":["approval binding missing"]}',
        ],
        packages: report.packages.map(pkg => ({
          ...pkg,
          target: concretePackageTarget,
        })),
      });
      expect(structuredFailureLinesValidation.errors).toContain(
        'rehearsal-preflight: lines must not include contradictory failure markers',
      );

      const structuredCountFailureLinesValidation = validateTestnetRehearsalPreflightReport({
        schemaVersion: 1,
        ...report,
        lines: [
          ...report.lines,
          '- Validation summary: errorCount: 1',
        ],
        packages: report.packages.map(pkg => ({
          ...pkg,
          target: concretePackageTarget,
        })),
      });
      expect(structuredCountFailureLinesValidation.errors).toContain(
        'rehearsal-preflight: lines must not include contradictory failure markers',
      );

      const structuredTotalFailureLinesValidation = validateTestnetRehearsalPreflightReport({
        schemaVersion: 1,
        ...report,
        lines: [
          ...report.lines,
          '- Validation summary: errorsTotal=1; failures_total: 2',
        ],
        packages: report.packages.map(pkg => ({
          ...pkg,
          target: concretePackageTarget,
        })),
      });
      expect(structuredTotalFailureLinesValidation.errors).toContain(
        'rehearsal-preflight: lines must not include contradictory failure markers',
      );

      const structuredSuccessLinesValidation = validateTestnetRehearsalPreflightReport({
        schemaVersion: 1,
        ...report,
        lines: [
          ...report.lines,
          '- Validation summary: errorCount: 0',
          '- Validation summary: errorsTotal=0; failures_total: 0',
          '- Validation summary: {"errors":[]}',
        ],
        packages: report.packages.map(pkg => ({
          ...pkg,
          target: concretePackageTarget,
        })),
      });
      expect(structuredSuccessLinesValidation.errors).toEqual([]);

      const openIssueLinesValidation = validateTestnetRehearsalPreflightReport({
        schemaVersion: 1,
        ...report,
        lines: [
          ...report.lines,
          '- Open issues: unresolved approval blocker',
        ],
        packages: report.packages.map(pkg => ({
          ...pkg,
          target: concretePackageTarget,
        })),
      });
      expect(openIssueLinesValidation.errors).toContain(
        'rehearsal-preflight: GO lines must not contain remaining issues',
      );

      const compatibilityOpenIssueLinesValidation = validateTestnetRehearsalPreflightReport({
        schemaVersion: 1,
        ...report,
        lines: [
          ...report.lines,
          '- \uFF2F\uFF50\uFF45\uFF4E issues\uFF1A unresolved approval blocker',
        ],
        packages: report.packages.map(pkg => ({
          ...pkg,
          target: concretePackageTarget,
        })),
      });
      expect(compatibilityOpenIssueLinesValidation.errors).toContain(
        'rehearsal-preflight: GO lines must not contain remaining issues',
      );

      const knownIssueLinesValidation = validateTestnetRehearsalPreflightReport({
        schemaVersion: 1,
        ...report,
        lines: [
          ...report.lines,
          '- Known issues: unresolved approval blocker',
        ],
        packages: report.packages.map(pkg => ({
          ...pkg,
          target: concretePackageTarget,
        })),
      });
      expect(knownIssueLinesValidation.errors).toContain(
        'rehearsal-preflight: GO lines must not contain remaining issues',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks shell-unsafe preflight JSON target bindings before release-gate consumption', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal-preflight-'));
    try {
      const record = aggregateEvidenceRecord();
      const targets = writeFixture(dir, record, approvalFile({
        mode: 'single-with-ingest',
        burnTxHash: PEG_OUT_BURN_TX_ID,
        checkCommand: `npm run settle:aggregate -- check-with-ingest ${PEG_OUT_BURN_TX_ID} ${SIDECHAIN_BLOCK_HASH} ${BRIDGE_EVENT_ROOT} 100`,
      }));
      const report = preflightTestnetRehearsal({ ...targets, now: NOW });
      const shellUnsafePrebroadcastTarget = 'evidence/prebroadcast packages/completed.md';
      const shellUnsafeApprovalsTarget = 'evidence/preflight approvals/approvals file.json';
      const shellUnsafePackageTarget = 'artifact://preflight/aggregate check.json';
      const validation = validateTestnetRehearsalPreflightReport({
        schemaVersion: 1,
        ...report,
        targetBindings: {
          prebroadcast: shellUnsafePrebroadcastTarget,
          approvals: shellUnsafeApprovalsTarget,
        },
        packages: report.packages.map(pkg => ({
          ...pkg,
          target: shellUnsafePackageTarget,
        })),
      });

      expect(validation.errors).toEqual(expect.arrayContaining([
        'rehearsal-preflight: targetBindings.prebroadcast must not contain whitespace or shell metacharacters',
        'rehearsal-preflight: targetBindings.approvals must not contain whitespace or shell metacharacters',
        'rehearsal-preflight: packages[0].target must not contain whitespace or shell metacharacters',
      ]));
      expect(validation.errors.join('\n')).not.toContain(shellUnsafePrebroadcastTarget);
      expect(validation.errors.join('\n')).not.toContain(shellUnsafeApprovalsTarget);
      expect(validation.errors.join('\n')).not.toContain(shellUnsafePackageTarget);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks when the approval file is missing', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal-preflight-'));
    try {
      const targets = writeFixture(dir, aggregateEvidenceRecord());

      const report = preflightTestnetRehearsal({ ...targets, now: NOW });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'Approvals: --approvals is required to prove daemon Expected transaction ID binding',
      );
      expect(report.lines.join('\n')).toContain('keep broadcast disabled');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes a structured BLOCKED preflight report when approvals are missing', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal-preflight-'));
    try {
      const targets = writeFixture(dir, aggregateEvidenceRecord());
      const report = preflightTestnetRehearsal({ ...targets, now: NOW });
      const writeResult = writeOfflineReportJson(`${basename(dir)}/preflight-missing-approvals.json`, {
        schemaVersion: 1,
        ...report,
      });
      const saved = JSON.parse(readFileSync(join(dir, 'preflight-missing-approvals.json'), 'utf8'));

      expect(writeResult.errors).toEqual([]);
      expect(saved.status).toBe('BLOCKED');
      expect(saved.errors).toContain(
        'Approvals: --approvals is required to prove daemon Expected transaction ID binding',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks approval modes that do not match the prepared aggregate command', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal-preflight-'));
    try {
      const targets = writeFixture(dir, aggregateEvidenceRecord(), approvalFile({
        mode: 'single',
        burnTxHash: PEG_OUT_BURN_TX_ID,
        checkCommand: `npm run settle:aggregate -- check ${PEG_OUT_BURN_TX_ID}`,
      }));

      const report = preflightTestnetRehearsal({ ...targets, now: NOW });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'Approvals: approval[0].checkEvidenceJson command must match approval checkCommand',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks batch approvals that reorder the prepared burn set', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal-preflight-'));
    try {
      const record = aggregateEvidenceRecord('check-batch', [
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
          sidechainHeaderHashHex: SIDECHAIN_BLOCK_HASH_B,
          bridgeEventRootHex: 'b'.repeat(64),
          ergoAnchorHeight: 101,
        },
      ]);
      const targets = writeFixture(dir, record, approvalFile({
        mode: 'batch',
        burnTxHashes: [PEG_OUT_BURN_TX_ID_B, PEG_OUT_BURN_TX_ID],
        checkCommand: `npm run settle:aggregate -- check-batch ${PEG_OUT_BURN_TX_ID_B} ${PEG_OUT_BURN_TX_ID}`,
      }));

      const report = preflightTestnetRehearsal({ ...targets, now: NOW });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'Approvals: approval[0].checkEvidenceJson burnTxHashes must match approval burnTxHashes in order',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks batch preflight packages missing claim-level root and anchor evidence', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal-preflight-'));
    try {
      const record = aggregateEvidenceRecord('check-batch', [
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
          sidechainHeaderHashHex: SIDECHAIN_BLOCK_HASH_B,
          bridgeEventRootHex: 'b'.repeat(64),
          ergoAnchorHeight: 101,
        },
      ]);
      for (const claim of record.claims) {
        delete claim.bridgeEventRootHex;
        delete claim.ergoAnchorHeight;
      }
      const targets = writeFixture(dir, record, approvalFile({
        mode: 'batch',
        burnTxHashes: [PEG_OUT_BURN_TX_ID, PEG_OUT_BURN_TX_ID_B],
        checkCommand: `npm run settle:aggregate -- check-batch ${PEG_OUT_BURN_TX_ID} ${PEG_OUT_BURN_TX_ID_B}`,
      }));

      const report = preflightTestnetRehearsal({ ...targets, now: NOW });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'Linked aggregate settlement evidence aggregate-check.json: claims[0].bridgeEventRootHex must be 32-byte hex',
      );
      expect(report.errors).toContain(
        'Linked aggregate settlement evidence aggregate-check.json: claims[0].ergoAnchorHeight must be a non-negative safe integer',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks approval files bound to a different deployment-state hash', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal-preflight-'));
    try {
      const approvals = approvalFile({
        mode: 'single-with-ingest',
        burnTxHash: PEG_OUT_BURN_TX_ID,
        checkCommand: `npm run settle:aggregate -- check-with-ingest ${PEG_OUT_BURN_TX_ID} ${SIDECHAIN_BLOCK_HASH} ${BRIDGE_EVENT_ROOT} 100`,
      });
      approvals.deployedStateHash = OTHER_DEPLOYMENT_STATE_HASH;
      const targets = writeFixture(dir, aggregateEvidenceRecord(), approvals);

      const report = preflightTestnetRehearsal({ ...targets, now: NOW });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors.join('\n')).toContain(
        'aggregate settlement approvals file deployedStateHash must match runtime context',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks approval files bound to a different sidechain network', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal-preflight-'));
    try {
      const approvals = approvalFile({
        mode: 'single-with-ingest',
        burnTxHash: PEG_OUT_BURN_TX_ID,
        checkCommand: `npm run settle:aggregate -- check-with-ingest ${PEG_OUT_BURN_TX_ID} ${SIDECHAIN_BLOCK_HASH} ${BRIDGE_EVENT_ROOT} 100`,
      });
      approvals.sidechainNetwork = 'other-devnet';
      const targets = writeFixture(dir, aggregateEvidenceRecord(), approvals);

      const report = preflightTestnetRehearsal({ ...targets, now: NOW });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors.join('\n')).toContain(
        'aggregate settlement approvals file sidechainNetwork must match runtime context',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks expired approval files before any live action can be prepared', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal-preflight-'));
    try {
      const expired = approvalFile({
        mode: 'single-with-ingest',
        burnTxHash: PEG_OUT_BURN_TX_ID,
        expiresAt: '2026-05-17T10:10:00Z',
        checkCommand: `npm run settle:aggregate -- check-with-ingest ${PEG_OUT_BURN_TX_ID} ${SIDECHAIN_BLOCK_HASH} ${BRIDGE_EVENT_ROOT} 100`,
      });
      const targets = writeFixture(dir, aggregateEvidenceRecord(), expired);

      const report = preflightTestnetRehearsal({ ...targets, now: NOW });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors.join('\n')).toContain('expiresAt must be in the future');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses sensitive approval targets without echoing the target', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal-preflight-'));
    try {
      const targets = writeFixture(dir, aggregateEvidenceRecord());

      const report = preflightTestnetRehearsal({
        prebroadcastTarget: targets.prebroadcastTarget,
        approvalsPath: '../.' + 'env',
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors.join('\n')).toContain('<blocked approval target>');
      expect(report.lines.join('\n')).not.toContain('.' + 'env');

      const writeResult = writeOfflineReportJson(`${basename(dir)}/redacted-preflight.json`, {
        schemaVersion: 1,
        ...report,
      });
      const savedText = readFileSync(join(dir, 'redacted-preflight.json'), 'utf8');
      expect(writeResult.errors).toEqual([]);
      expect(savedText).toContain('<blocked approval target>');
      expect(savedText).not.toContain('.' + 'env');

      for (const target of [
        'operator/signing-key-approval.json',
        'operator/api-key-approval.json',
        'operator/seed-phrase-approval.json',
        'runtime/deployed_state.json',
        'evidence/sourceTarget=(.env)/approvals.json',
        'evidence/sourceTarget=(runtime/bridge-state.sqlite)/approvals.json',
        'evidence/sourceTarget=%28.env%29/approvals.json',
        'evidence/sourceTarget=%28runtime%2Fbridge-state.sqlite%29/approvals.json',
      ]) {
        const secretReport = preflightTestnetRehearsal({
          prebroadcastTarget: targets.prebroadcastTarget,
          approvalsPath: target,
          now: NOW,
        });
        const serialized = JSON.stringify(secretReport);

        expect(secretReport.status, target).toBe('BLOCKED');
        expect(secretReport.targetBindings.approvals, target).toBe('<blocked approval target>');
        const expectedApprovalError = target.includes('.env')
          ? 'Approvals: <blocked approval target> must not be an environment file'
          : 'Approvals: <blocked approval target> must not be a secret-bearing or runtime-state path';
        expect(secretReport.errors, target).toContain(expectedApprovalError);
        expect(serialized, target).not.toContain(target);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses local absolute approval targets without echoing target filenames', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal-preflight-'));
    try {
      const targets = writeFixture(dir, aggregateEvidenceRecord());
      const localApprovalTarget = ['', 'absolute', 'local-approval-binding.json'].join('/');

      const report = preflightTestnetRehearsal({
        prebroadcastTarget: targets.prebroadcastTarget,
        approvalsPath: localApprovalTarget,
        now: NOW,
      });
      const serialized = JSON.stringify(report);

      expect(report.status).toBe('BLOCKED');
      expect(report.targetBindings.approvals).toBe('<blocked approval target>');
      expect(report.errors).toContain(
        'Approvals: <blocked approval target> must be a relative path inside the bridge repository',
      );
      expect(report.lines.join('\n')).toContain('<blocked approval target>');
      expect(serialized).toContain('<blocked approval target>');
      expect(serialized).not.toContain('local-approval-binding.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses prebroadcast targets that resolve outside the bridge without echoing the target', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal-preflight-'));
    const external = mkdtempSync(join(tmpdir(), 'rehearsal-preflight-prebroadcast-'));
    try {
      writeFixture(external, aggregateEvidenceRecord());
      symlinkSync(external, join(dir, 'link-out'), process.platform === 'win32' ? 'junction' : 'dir');

      const report = preflightTestnetRehearsal({
        prebroadcastTarget: `${basename(dir)}/link-out/completed.md`,
        now: NOW,
      });
      const serialized = JSON.stringify(report);

      expect(report.status).toBe('BLOCKED');
      expect(report.targetBindings.prebroadcast).toBe('<blocked evidence target>');
      expect(report.errors).toContain(
        '<blocked evidence target>: refusing to read evidence paths outside the bridge repository',
      );
      expect(serialized).toContain('<blocked evidence target>');
      expect(serialized).not.toContain('link-out');
      expect(serialized).not.toContain('completed.md');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });

  it('refuses approval targets that resolve outside the bridge without echoing the target', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal-preflight-'));
    const external = mkdtempSync(join(tmpdir(), 'rehearsal-preflight-approvals-'));
    try {
      const targets = writeFixture(dir, aggregateEvidenceRecord());
      writeFileSync(join(external, 'approvals.json'), JSON.stringify(approvalFile({
        mode: 'single-with-ingest',
        burnTxHash: PEG_OUT_BURN_TX_ID,
        checkCommand: `npm run settle:aggregate -- check-with-ingest ${PEG_OUT_BURN_TX_ID} ${SIDECHAIN_BLOCK_HASH} ${BRIDGE_EVENT_ROOT} 100`,
      }), null, 2));
      symlinkSync(external, join(dir, 'link-out'), process.platform === 'win32' ? 'junction' : 'dir');

      const report = preflightTestnetRehearsal({
        prebroadcastTarget: targets.prebroadcastTarget,
        approvalsPath: `${basename(dir)}/link-out/approvals.json`,
        now: NOW,
      });
      const serialized = JSON.stringify(report);

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'Approvals: <blocked approval target> must resolve inside the bridge repository',
      );
      expect(serialized).toContain('<blocked approval target>');
      expect(serialized).not.toContain('link-out');
      expect(serialized).not.toContain('approvals.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });
});
