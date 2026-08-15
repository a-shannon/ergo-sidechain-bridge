import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { spawnSync } from 'child_process';
import { describe, expect, it } from 'vitest';

import {
  buildSpvTrackerObservationInput,
  formatSpvTrackerObservationReportMarkdown,
  observeTrustlessSpvTracker,
  parseSpvTrackerObservationJson,
} from './spv-tracker-observation.js';
import {
  deriveSpvTrackerKey,
  encodeSpvTrackerValue,
  getSpvTrackerDigest,
  toSpvTrackerHistoryEntry,
  type SpvTrackerEntry,
} from './spv-tracker.js';

const ENTRY: SpvTrackerEntry = {
  sidechainIdHex: '1'.repeat(64),
  sidechainHeight: 12345,
  sidechainHeaderHashHex: '2'.repeat(64),
  bridgeEventRootHex: '3089254893ba812d1703febf2372a55757ab8a1aa3cd86c2cdcbd39544427dcc',
  ergoAnchorHeight: 67890,
};
const ENTRY_SIDECHAIN_HEIGHT = Number(ENTRY.sidechainHeight);
const FINALITY_RULE = 'testnet rule: observedSidechainHeight - sidechainBlockHeight >= requiredConfirmations';

function observationJson(overrides: Record<string, unknown> = {}) {
  const history = [toSpvTrackerHistoryEntry(ENTRY)];
  return {
    sourceLabel: 'operator sanitized SPV tracker observation',
    network: 'testnet',
    nodeUrl: 'https://ergo-node.invalid',
    observedAt: '2026-07-02T12:00:00.000Z',
    trackerDigestHex: getSpvTrackerDigest(history),
    trackerBox: {
      boxId: '4'.repeat(64),
      nftId: '5'.repeat(64),
    },
    expectedEntry: ENTRY,
    sidechainFinality: {
      finalityRule: FINALITY_RULE,
      sidechainBlockHeight: ENTRY_SIDECHAIN_HEIGHT,
      observedSidechainHeight: ENTRY_SIDECHAIN_HEIGHT + 12,
      requiredConfirmations: 12,
    },
    history,
    ...overrides,
  };
}

describe('SPV tracker observation evidence', () => {
  it('builds a linked read-only observation report when history matches the observed tracker digest', () => {
    const parsed = parseSpvTrackerObservationJson(observationJson());
    expect(parsed.errors).toEqual([]);
    expect(parsed.input).toBeDefined();

    const report = observeTrustlessSpvTracker(buildSpvTrackerObservationInput(parsed.input!, {
      commandLine: 'npm run trustless:spv-tracker-observe -- --observation-json observation.json --json-out report.json',
      workingDirectory: 'ergo-sidechain-bridge/relayer',
    }));

    expect(report.status).toBe('LINKED');
    expect(report.command).toBe('trustless:spv-tracker-observe');
    expect(report.expectedKeyHex).toBe(deriveSpvTrackerKey(ENTRY));
    expect(report.expectedValueHex).toBe(encodeSpvTrackerValue(ENTRY));
    expect(report.observedValueHex).toBe(encodeSpvTrackerValue(ENTRY));
    expect(report.proofDigestHex).toBe(report.trackerDigestHex);
    expect(report.rebuiltTrackerDigestHex).toBe(report.trackerDigestHex);
    expect(report.decodedValue).toMatchObject({
      bridgeEventRootHex: ENTRY.bridgeEventRootHex,
      ergoAnchorHeight: ENTRY.ergoAnchorHeight,
    });
    expect(report.sidechainFinality).toMatchObject({
      finalityRule: FINALITY_RULE,
      sidechainBlockHeight: ENTRY_SIDECHAIN_HEIGHT,
      observedSidechainHeight: ENTRY_SIDECHAIN_HEIGHT + 12,
      requiredConfirmations: 12,
      observedConfirmations: 12,
      status: 'FINALIZED',
    });
    expect(report.boundary).toMatchObject({
      readOnly: true,
      publicObservationInputOnly: true,
      runtimeDatabaseOpened: false,
      deploymentStateOpened: false,
      secretOrEnvironmentFileRead: false,
      signingOrWalletMaterialRead: false,
      nodeOrRpcRequestPerformed: false,
      transactionBroadcastOrMutation: false,
      gate5Closure: false,
      settlementReadiness: false,
      productionClaimSupport: false,
      testnetProductionCandidateClaimSupport: false,
    });
  });

  it('blocks observations when the supplied tracker digest is stale', () => {
    const parsed = parseSpvTrackerObservationJson(observationJson({
      trackerDigestHex: '0'.repeat(64) + '01',
    }));

    expect(parsed.errors).toEqual([]);
    const report = observeTrustlessSpvTracker(parsed.input!);

    expect(report.status).toBe('BLOCKED');
    expect(report.reason).toContain('tracker digest does not match');
    expect(report.boundary.gate5Closure).toBe(false);
  });

  it('blocks observations when the sidechain block is not finalized', () => {
    const parsed = parseSpvTrackerObservationJson(observationJson({
      sidechainFinality: {
        finalityRule: FINALITY_RULE,
        sidechainBlockHeight: ENTRY_SIDECHAIN_HEIGHT,
        observedSidechainHeight: ENTRY_SIDECHAIN_HEIGHT + 4,
        requiredConfirmations: 12,
      },
    }));

    expect(parsed.errors).toEqual([]);
    const report = observeTrustlessSpvTracker(parsed.input!);

    expect(report.status).toBe('BLOCKED');
    expect(report.reason).toBe('sidechain finality depth is below required confirmations');
    expect(report.sidechainFinality).toMatchObject({
      observedConfirmations: 4,
      status: 'UNFINALIZED',
    });
    expect(report.boundary.gate5Closure).toBe(false);
  });

  it('blocks observations when sidechain finality is for a different block height', () => {
    const parsed = parseSpvTrackerObservationJson(observationJson({
      sidechainFinality: {
        finalityRule: FINALITY_RULE,
        sidechainBlockHeight: ENTRY_SIDECHAIN_HEIGHT + 1,
        observedSidechainHeight: ENTRY_SIDECHAIN_HEIGHT + 20,
        requiredConfirmations: 12,
      },
    }));

    expect(parsed.errors).toEqual([]);
    const report = observeTrustlessSpvTracker(parsed.input!);

    expect(report.status).toBe('BLOCKED');
    expect(report.reason).toBe('sidechain finality block height does not match expected tracker sidechain height');
    expect(report.boundary.gate5Closure).toBe(false);
  });

  it('formats operator-facing markdown without claiming Gate 5 closure', () => {
    const parsed = parseSpvTrackerObservationJson(observationJson());
    const report = observeTrustlessSpvTracker(parsed.input!);
    const markdown = formatSpvTrackerObservationReportMarkdown(report);

    expect(markdown).toContain('# Gate 5 SPV Tracker Observation Report');
    expect(markdown).toContain('| Result | LINKED |');
    expect(markdown).toContain('| Finality status | FINALIZED |');
    expect(markdown).toContain('| SPV tracker key/value proof checked | yes |');
    expect(markdown).toContain('| Sidechain finality binding checked | yes |');
    expect(markdown).toContain('| Gate 5 closure allowed | no |');
    expect(markdown).toContain('| Production-ready claim allowed | no |');
    expect(markdown).not.toContain('bridge-state.sqlite');
    expect(markdown).not.toContain('deployed_state');
  });

  it('exposes the observation command through npm scripts', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));

    expect(pkg.scripts['trustless:spv-tracker-observe']).toBe(
      'tsx src/scripts/trustless-spv-tracker-observe.ts',
    );
  });

  it('keeps the CLI independent from runtime state and secret-bearing inputs', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/scripts/trustless-spv-tracker-observe.ts'),
      'utf8',
    );

    expect(source).not.toMatch(/dotenv|better-sqlite3|axios|ErgoClient|deployed_state|bridge-state\.sqlite/i);
    expect(source).toContain('readEvidenceJsonTarget');
    expect(source).toContain('writeOfflineReportJson');
    expect(source).toContain("'wx'");
  });

  it('writes markdown and JSON reports from sanitized public observation JSON', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-spv-tracker-observe-'));
    const inputTarget = `${basename(outputDir)}/observation.json`;
    const markdownTarget = `${basename(outputDir)}/report.md`;
    const jsonTarget = `${basename(outputDir)}/report.json`;

    try {
      writeFileSync(join(process.cwd(), inputTarget), JSON.stringify(observationJson(), null, 2));

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/trustless-spv-tracker-observe.ts',
          '--observation-json',
          inputTarget,
          '--out',
          markdownTarget,
          '--json-out',
          jsonTarget,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('# Gate 5 SPV Tracker Observation Report');
      expect(result.stdout).toContain('| Result | LINKED |');
      expect(result.stdout).toContain('SPV tracker observation JSON report written');

      const jsonReport = JSON.parse(readFileSync(join(process.cwd(), jsonTarget), 'utf8'));
      expect(jsonReport.status).toBe('LINKED');
      expect(jsonReport.expectedEntry).toMatchObject(ENTRY);
      expect(jsonReport.sidechainFinality).toMatchObject({
        sidechainBlockHeight: ENTRY_SIDECHAIN_HEIGHT,
        observedConfirmations: 12,
        status: 'FINALIZED',
      });

      const markdownReport = readFileSync(join(process.cwd(), markdownTarget), 'utf8');
      expect(markdownReport).toContain('| Transaction broadcast, submit, deploy, or state mutation performed | no |');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
