import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { spawnSync } from 'child_process';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildSpvTrackerObservationInput,
  observeTrustlessSpvTracker,
  parseSpvTrackerObservationJson,
} from './spv-tracker-observation.js';
import {
  buildLocalGate5SpvTrackerObservation,
  localGate5SpvTrackerEntry,
} from './spv-tracker-local-observation.js';
import {
  deriveSpvTrackerKey,
  encodeSpvTrackerValue,
} from './spv-tracker.js';

const gate5RecipientTreeRoot = '701fbd1ae0ca10d0687281f2b5a136e4f784dd96a87814f44a092b0c4eb6ffc9';

describe('local Gate 5 SPV tracker observation producer', () => {
  it('builds sanitized public observation JSON that links the expected tracker key/value', () => {
    const observation = buildLocalGate5SpvTrackerObservation({
      observedAt: '2026-07-02T12:30:00.000Z',
    });

    expect(observation).toMatchObject({
      sourceLabel: 'local public Gate 5 SPV tracker observation input',
      network: 'local offline',
      observedAt: '2026-07-02T12:30:00.000Z',
      expectedEntry: localGate5SpvTrackerEntry,
      trackerBox: {
        boxId: '44'.repeat(32),
        nftId: '55'.repeat(32),
      },
      sidechainFinality: {
        finalityRule: 'local offline rule: observedSidechainHeight - sidechainBlockHeight >= requiredConfirmations',
        sidechainBlockHeight: Number(localGate5SpvTrackerEntry.sidechainHeight),
        observedSidechainHeight: Number(localGate5SpvTrackerEntry.sidechainHeight) + 12,
        requiredConfirmations: 12,
      },
    });
    expect(observation.history).toEqual([{
      key: deriveSpvTrackerKey(localGate5SpvTrackerEntry),
      value: encodeSpvTrackerValue(localGate5SpvTrackerEntry),
    }]);

    const parsed = parseSpvTrackerObservationJson(observation);
    expect(parsed.errors).toEqual([]);
    const report = observeTrustlessSpvTracker(buildSpvTrackerObservationInput(parsed.input!));
    expect(report.status).toBe('LINKED');
    expect(report.sidechainFinality).toMatchObject({
      observedConfirmations: 12,
      status: 'FINALIZED',
    });
    expect(report.boundary).toMatchObject({
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
    });
  });

  it('binds the local observation to an explicit proof-vector bridge event root', () => {
    const observation = buildLocalGate5SpvTrackerObservation({
      observedAt: '2026-07-06T12:00:00.000Z',
      bridgeEventRootHex: gate5RecipientTreeRoot,
    });

    const expectedEntry = {
      ...localGate5SpvTrackerEntry,
      bridgeEventRootHex: gate5RecipientTreeRoot,
    };
    expect(observation.expectedEntry).toEqual(expectedEntry);
    expect(observation.history).toEqual([{
      key: deriveSpvTrackerKey(expectedEntry),
      value: encodeSpvTrackerValue(expectedEntry),
    }]);

    const parsed = parseSpvTrackerObservationJson(observation);
    expect(parsed.errors).toEqual([]);
    const report = observeTrustlessSpvTracker(buildSpvTrackerObservationInput(parsed.input!));
    expect(report.status).toBe('LINKED');
    expect(report.decodedValue).toMatchObject({
      bridgeEventRootHex: gate5RecipientTreeRoot,
      ergoAnchorHeight: localGate5SpvTrackerEntry.ergoAnchorHeight,
    });
  });

  it('prints producer claim boundaries in CLI help', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/trustless-spv-tracker-local-observation.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run trustless:spv-tracker:local-observation');
    expect(result.stdout).toContain('--bridge-event-root');
    expect(result.stdout).toContain('does not load environment files');
    expect(result.stdout).toContain('not Gate 5 closure');
    expect(result.stdout).toContain('not proof acceptance evidence');
    expect(result.stdout).toContain('not settlement readiness');
    expect(result.stdout).toContain('not signing authorization');
  });

  it('writes observation JSON accepted by the SPV tracker observer CLI', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-spv-tracker-local-observation-'));
    try {
      const observationTarget = join(basename(dir), 'observation.json');
      const reportTarget = join(basename(dir), 'report.json');
      const producer = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/trustless-spv-tracker-local-observation.ts',
          '--observed-at',
          '2026-07-02T12:30:00.000Z',
          '--bridge-event-root',
          gate5RecipientTreeRoot,
          '--out',
          observationTarget,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(producer.status).toBe(0);
      expect(producer.stderr).toBe('');
      expect(producer.stdout).toContain('SPV tracker observation JSON: written');
      expect(producer.stdout).toContain(`bridgeEventRootHex: ${gate5RecipientTreeRoot}`);
      expect(producer.stdout).toContain('sidechainFinality.requiredConfirmations: 12');
      expect(producer.stdout).toContain('history entries: 1');

      const observer = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/trustless-spv-tracker-observe.ts',
          '--observation-json',
          observationTarget,
          '--observed-at',
          '2026-07-02T12:30:00.000Z',
          '--json-out',
          reportTarget,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(observer.status).toBe(0);
      expect(observer.stderr).toBe('');
      expect(observer.stdout).toContain('| Result | LINKED |');
      expect(observer.stdout).toContain('| Finality status | FINALIZED |');

      const report = JSON.parse(readFileSync(join(process.cwd(), reportTarget), 'utf8'));
      expect(report.status).toBe('LINKED');
      expect(report.expectedEntry).toMatchObject({
        ...localGate5SpvTrackerEntry,
        bridgeEventRootHex: gate5RecipientTreeRoot,
      });
      expect(report.sidechainFinality).toMatchObject({
        observedConfirmations: 12,
        status: 'FINALIZED',
      });
      expect(report.boundary.gate5Closure).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects unsafe output targets before writing observation JSON', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/trustless-spv-tracker-local-observation.ts',
        '--observed-at',
        '2026-07-02T12:30:00.000Z',
        '--out',
        '../operator/private-key-spv-tracker-observation.json',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--out <blocked output target> must not target runtime or secret-bearing material');
  });
});
