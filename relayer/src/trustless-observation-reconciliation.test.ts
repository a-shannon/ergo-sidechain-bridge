import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  formatTrustlessObservationReconciliationMarkdown,
  reconcileTrustlessObservationReports,
} from './trustless-observation-reconciliation.js';

const BRIDGE_EVENT_ROOT = '1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb';
const ERGO_ANCHOR_HEIGHT = 67890;

function anchorReport(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    command: 'trustless:anchor-observe',
    status: 'LINKED',
    reason: 'matching 0x0401 bridgeEventRoot observed',
    bridgeEventRootHex: BRIDGE_EVENT_ROOT,
    extensionKey: '0401',
    minHeight: ERGO_ANCHOR_HEIGHT,
    maxHeight: ERGO_ANCHOR_HEIGHT,
    observedAt: '2026-07-02T13:00:00.000Z',
    sourceLabel: 'sanitized public extension observation JSON',
    network: 'testnet',
    commandLine: 'npm run trustless:anchor-observe -- --bridge-event-root <root> --observations-json <observations.json> --json-out <report.json>',
    workingDirectory: 'ergo-sidechain-bridge/relayer',
    heightsScanned: 1,
    extensionReadsSucceeded: 1,
    extensionReadsFailed: 0,
    linkedAnchor: {
      key: '0401',
      bridgeEventRootHex: BRIDGE_EVENT_ROOT,
      ergoAnchorHeight: ERGO_ANCHOR_HEIGHT,
      headerId: 'a'.repeat(64),
    },
    readFailures: [],
    boundary: {
      readOnly: true,
      publicObservationInputOnly: true,
      deploymentStateOpened: false,
      runtimeDatabaseOpened: false,
      secretOrEnvironmentFileRead: false,
      signingOrWalletMaterialRead: false,
      transactionBroadcastOrMutation: false,
      gate5Closure: false,
      settlementReadiness: false,
      productionClaimSupport: false,
      testnetProductionCandidateClaimSupport: false,
    },
    ...overrides,
  };
}

function spvTrackerReport(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    command: 'trustless:spv-tracker-observe',
    status: 'LINKED',
    reason: 'SPV tracker history contains expected sidechain commitment entry',
    observedAt: '2026-07-02T13:00:00.000Z',
    sourceLabel: 'sanitized public SPV tracker observation JSON',
    network: 'testnet',
    commandLine: 'npm run trustless:spv-tracker-observe -- --observation-json <observation.json> --json-out <report.json>',
    workingDirectory: 'ergo-sidechain-bridge/relayer',
    expectedEntry: {
      sidechainIdHex: '1'.repeat(64),
      sidechainHeight: 12345,
      sidechainHeaderHashHex: '2'.repeat(64),
      bridgeEventRootHex: BRIDGE_EVENT_ROOT,
      ergoAnchorHeight: ERGO_ANCHOR_HEIGHT,
    },
    historyLength: 1,
    trackerDigestHex: 'abc64a32910eb985c7ca95eefc6088c5ae841b74a892beffc9e190db42bae0e301',
    rebuiltTrackerDigestHex: 'abc64a32910eb985c7ca95eefc6088c5ae841b74a892beffc9e190db42bae0e301',
    expectedKeyHex: '46bfd6977e3c170fa567da9fd95d79d3e0232c3da99a4dc4194910328789dbdb',
    expectedValueHex: `${BRIDGE_EVENT_ROOT}00010932`,
    observedValueHex: `${BRIDGE_EVENT_ROOT}00010932`,
    proofDigestHex: 'abc64a32910eb985c7ca95eefc6088c5ae841b74a892beffc9e190db42bae0e301',
    getProofHex: 'ab',
    decodedValue: {
      bridgeEventRootHex: BRIDGE_EVENT_ROOT,
      ergoAnchorHeight: ERGO_ANCHOR_HEIGHT,
    },
    boundary: {
      readOnly: true,
      publicObservationInputOnly: true,
      deploymentStateOpened: false,
      runtimeDatabaseOpened: false,
      secretOrEnvironmentFileRead: false,
      signingOrWalletMaterialRead: false,
      nodeOrRpcRequestPerformed: false,
      transactionBroadcastOrMutation: false,
      gate5Closure: false,
      settlementReadiness: false,
      productionClaimSupport: false,
      testnetProductionCandidateClaimSupport: false,
    },
    ...overrides,
  };
}

function reconcile(overrides: {
  anchor?: Record<string, unknown>;
  spv?: Record<string, unknown>;
  anchorTarget?: string;
  spvTarget?: string;
} = {}) {
  return reconcileTrustlessObservationReports({
    anchorObservationReportTarget: overrides.anchorTarget ?? '../evidence/trustless-burn/completed-anchor-observation-report.json',
    spvTrackerObservationReportTarget: overrides.spvTarget ?? '../evidence/trustless-burn/completed-spv-tracker-observation-report.json',
    anchorObservationReport: anchorReport(overrides.anchor),
    spvTrackerObservationReport: spvTrackerReport(overrides.spv),
    observedAt: '2026-07-02T13:30:00.000Z',
    commandLine:
      'npm run trustless:observation-reconcile -- --anchor-report-json <anchor-report.json> --spv-tracker-report-json <spv-report.json> --json-out <report.json>',
    workingDirectory: 'ergo-sidechain-bridge/relayer',
  });
}

describe('trustless observation reconciliation', () => {
  it('links anchor and SPV tracker observation reports that share root and height', () => {
    const report = reconcile();
    const markdown = formatTrustlessObservationReconciliationMarkdown(report);

    expect(report.status).toBe('LINKED');
    expect(report.reconciledBridgeEventRootHex).toBe(BRIDGE_EVENT_ROOT);
    expect(report.reconciledErgoAnchorHeight).toBe(ERGO_ANCHOR_HEIGHT);
    expect(report.checks.every(check => check.status === 'PASS')).toBe(true);
    expect(report.boundary).toMatchObject({
      readOnly: true,
      publicObservationInputsOnly: true,
      anchorObservationJsonReused: true,
      spvTrackerObservationJsonReused: true,
      gate5Closure: false,
      transactionBroadcastOrMutation: false,
    });
    expect(markdown).toContain('| Result | LINKED |');
    expect(markdown).toContain('| Reconciled bridgeEventRoot | 1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb |');
    expect(markdown).toContain('| Reconciled Ergo height | 67890 |');
    expect(markdown).toContain('| Gate 5 closure allowed | no |');
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('blocks reconciliation when anchor and SPV tracker heights diverge', () => {
    const report = reconcile({
      anchor: {
        linkedAnchor: {
          key: '0401',
          bridgeEventRootHex: BRIDGE_EVENT_ROOT,
          ergoAnchorHeight: ERGO_ANCHOR_HEIGHT + 1,
          headerId: 'a'.repeat(64),
        },
      },
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.reconciledBridgeEventRootHex).toBe(BRIDGE_EVENT_ROOT);
    expect(report.reconciledErgoAnchorHeight).toBeUndefined();
    expect(report.checks).toContainEqual({
      name: 'Ergo anchor height identity',
      status: 'BLOCKED',
      detail:
        'anchor linkedAnchor.ergoAnchorHeight, SPV expectedEntry.ergoAnchorHeight, and SPV decodedValue.ergoAnchorHeight must all be present and equal',
    });
  });

  it('keeps current Gate 5 anchor-blocked observations from becoming linked evidence', () => {
    const report = reconcile({
      anchor: {
        status: 'BLOCKED',
        reason: 'no matching 0x0401 bridgeEventRoot observed in readable extension observations',
        linkedAnchor: undefined,
        minHeight: 425304,
        maxHeight: 425423,
      },
      spv: {
        network: 'local offline',
        expectedEntry: {
          sidechainIdHex: '1'.repeat(64),
          sidechainHeight: 12345,
          sidechainHeaderHashHex: '2'.repeat(64),
          bridgeEventRootHex: BRIDGE_EVENT_ROOT,
          ergoAnchorHeight: 987654,
        },
        decodedValue: {
          bridgeEventRootHex: BRIDGE_EVENT_ROOT,
          ergoAnchorHeight: 987654,
        },
      },
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.reason).toBe('anchor report status must be LINKED; observed BLOCKED');
    expect(report.reconciledBridgeEventRootHex).toBeUndefined();
    expect(report.reconciledErgoAnchorHeight).toBeUndefined();
    expect(report.checks).toContainEqual({
      name: 'Anchor observation linked',
      status: 'BLOCKED',
      detail: 'anchor report status must be LINKED; observed BLOCKED',
    });
  });

  it('exposes the reconciliation command through npm scripts', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));

    expect(pkg.scripts['trustless:observation-reconcile']).toBe(
      'tsx src/scripts/trustless-observation-reconcile.ts',
    );
  });

  it('keeps the reconciliation CLI independent from runtime state and secret-bearing inputs', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/scripts/trustless-observation-reconcile.ts'),
      'utf8',
    );

    expect(source).not.toMatch(/dotenv|better-sqlite3|axios|ErgoClient|deployed_state|bridge-state\.sqlite/i);
    expect(source).toContain('readEvidenceJsonTarget');
    expect(source).toContain('writeOfflineReportJson');
    expect(source).toContain("'wx'");
  });

  it('writes linked Markdown and JSON reports from sanitized public observation reports', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-observation-reconcile-'));
    const anchorTarget = `${basename(outputDir)}/anchor-report.json`;
    const spvTarget = `${basename(outputDir)}/spv-report.json`;
    const markdownTarget = `${basename(outputDir)}/reconciliation.md`;
    const jsonTarget = `${basename(outputDir)}/reconciliation.json`;

    try {
      writeFileSync(join(process.cwd(), anchorTarget), JSON.stringify(anchorReport(), null, 2));
      writeFileSync(join(process.cwd(), spvTarget), JSON.stringify(spvTrackerReport(), null, 2));

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/trustless-observation-reconcile.ts',
          '--anchor-report-json',
          anchorTarget,
          '--spv-tracker-report-json',
          spvTarget,
          '--observed-at',
          '2026-07-02T13:30:00.000Z',
          '--out',
          markdownTarget,
          '--json-out',
          jsonTarget,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('# Gate 5 Observation Reconciliation Report');
      expect(result.stdout).toContain('- trustless observation reconciliation JSON report written:');
      expect(existsSync(join(process.cwd(), markdownTarget))).toBe(true);
      expect(existsSync(join(process.cwd(), jsonTarget))).toBe(true);
      const written = JSON.parse(readFileSync(join(process.cwd(), jsonTarget), 'utf8'));
      expect(written.status).toBe('LINKED');
      expect(written.reconciledBridgeEventRootHex).toBe(BRIDGE_EVENT_ROOT);
      expect(written.reconciledErgoAnchorHeight).toBe(ERGO_ANCHOR_HEIGHT);
      expect(JSON.stringify(written)).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
