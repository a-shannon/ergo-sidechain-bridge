import { existsSync } from 'fs';

import {
  ERGO_CONFIG,
  getAggregateSettlementRecoverySourceIdentityConfig,
} from './config.js';
import { ErgoClient } from './ergo-client.js';
import { resolveStateDbPath } from './post-submit-observe-paths.js';
import { StateTracker } from './state-tracker.js';
import {
  abandonAggregateSettlementAttempt,
  createAggregateSettlementErgoWitness,
  recoverAggregateSettlementAttempts,
  scanAggregateSettlementAttempts,
  type AggregateSettlementErgoWitness,
  type AggregateSettlementRecoveryScanRow,
} from './aggregate-settlement-recovery.js';

export interface RecoveryCliArgs {
  command: 'scan' | 'apply' | 'abandon';
  expectedTxId?: string;
  stateDbPath: string;
  json: boolean;
}

export function recoveryCliUsage(): string {
  return [
    'Usage:',
    '  npm run settle:aggregate:recover -- scan [--state-db <path>] [--json]',
    '  npm run settle:aggregate:recover -- apply [--state-db <path>] [--json]',
    '  npm run settle:aggregate:recover -- abandon <expectedTxId> [--state-db <path>] [--json]',
    '',
    'scan opens SQLite read-only and only observes journaled attempts.',
    'apply restores submitted aggregate states from canonical node observations.',
    'abandon requires two matching stable absences from distinct primary and witness Ergo node origins,',
    'pinned node and administration identities, and a recovery window with the first tip still canonical.',
    'The first call records only; a retry after a committed retirement reports already_retired.',
  ].join('\n');
}

export function parseRecoveryCliArgs(argv: string[]): RecoveryCliArgs {
  const [commandRaw, ...rest] = argv;
  if (commandRaw !== 'scan' && commandRaw !== 'apply' && commandRaw !== 'abandon') {
    throw new Error(recoveryCliUsage());
  }

  let stateDbPath = './bridge-state.sqlite';
  let json = false;
  let expectedTxId: string | undefined;
  let optionStart = 0;
  if (commandRaw === 'abandon') {
    expectedTxId = rest[0];
    if (!expectedTxId || expectedTxId.startsWith('--')) {
      throw new Error('abandon requires an expected transaction id');
    }
    optionStart = 1;
  }

  for (let i = optionStart; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--state-db') {
      const value = rest[++i];
      if (!value) throw new Error('--state-db requires a path');
      stateDbPath = value;
      continue;
    }
    throw new Error(`unknown option: ${arg}`);
  }

  return commandRaw === 'abandon'
    ? { command: commandRaw, expectedTxId, stateDbPath, json }
    : { command: commandRaw, stateDbPath, json };
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function formatRecoveryScanRow(row: AggregateSettlementRecoveryScanRow): string {
  const inclusion = row.inclusionHeight === null
    ? 'none'
    : `${row.inclusionHeight}@${row.inclusionHeaderId}`;
  return `${row.status} ${row.mode} expected=${row.expectedTxId} observation=${row.observationStatus} confirmations=${row.confirmations}/${row.requiredConfirmations} inclusion=${inclusion} tip=${row.observedTipHeight}@${row.observedTipHeaderId} mempool=${row.mempool ? 'yes' : 'no'} burns=${row.burnTxHashes.join(',')}`;
}

function createRecoveryErgoClients(): {
  ergo: ErgoClient;
  witness: AggregateSettlementErgoWitness | undefined;
} {
  const ergo = new ErgoClient(ERGO_CONFIG.nodeUrl, { readOnly: true, direct: true });
  const witnessNodeUrl = ERGO_CONFIG.aggregateSettlementWitnessNodeUrl;
  if (!witnessNodeUrl) return { ergo, witness: undefined };
  const sourceIdentity = getAggregateSettlementRecoverySourceIdentityConfig();
  if (!sourceIdentity) {
    throw new Error('aggregate settlement recovery witness source identities are unavailable');
  }
  const witnessErgo = new ErgoClient(witnessNodeUrl, { readOnly: true, direct: true });
  return {
    ergo,
    witness: createAggregateSettlementErgoWitness({
      primaryErgo: ergo,
      primaryNodeUrl: ERGO_CONFIG.nodeUrl,
      primaryNodeIdentityDigestHex: sourceIdentity.primaryNodeIdentityDigestHex,
      primaryAdministrationIdentityDigestHex:
        sourceIdentity.primaryAdministrationIdentityDigestHex,
      witnessErgo,
      witnessNodeUrl,
      witnessNodeIdentityDigestHex: sourceIdentity.witnessNodeIdentityDigestHex,
      witnessAdministrationIdentityDigestHex:
        sourceIdentity.witnessAdministrationIdentityDigestHex,
    }),
  };
}

export async function runAggregateSettlementRecoveryCli(argv: string[]): Promise<void> {
  const args = parseRecoveryCliArgs(argv);
  const stateDbTarget = resolveRecoveryCliStateDbPath(args.stateDbPath);
  if (stateDbTarget.errors.length > 0) {
    throw new Error(stateDbTarget.errors.join('\n'));
  }
  const state = new StateTracker(stateDbTarget.path!, { readOnly: args.command === 'scan' });
  try {
    const { ergo, witness } = createRecoveryErgoClients();
    if (args.command === 'scan') {
      const rows = await scanAggregateSettlementAttempts({ state, ergo, witness });
      if (args.json) {
        printJson({ command: args.command, recoverableAttempts: rows });
      } else {
        console.log(`Recoverable aggregate settlement attempts: ${rows.length}`);
        for (const row of rows) {
          console.log(formatRecoveryScanRow(row));
        }
      }
      return;
    }

    if (args.command === 'abandon') {
      const result = await abandonAggregateSettlementAttempt({
        state,
        ergo,
        witness,
        expectedTxId: args.expectedTxId!,
      });
      if (args.json) {
        printJson({ command: args.command, result });
      } else {
        const outcome = result.outcome === 'retired'
          ? 'Aggregate settlement attempt retired'
          : result.outcome === 'already_retired'
            ? 'Aggregate settlement attempt was already retired'
            : result.outcome === 'evidence_recorded'
              ? 'Aggregate settlement attempt retained; absence evidence recorded'
              : 'Aggregate settlement attempt was already abandoned by another cause';
        console.log(`${outcome}: ${JSON.stringify(result)}`);
      }
      return;
    }

    const result = await recoverAggregateSettlementAttempts({
      state,
      ergo,
      witness,
      log: (level, msg, data) => {
        if (args.json) return;
        console.log(`${level.toUpperCase()}: ${msg}${data ? ` ${JSON.stringify(data)}` : ''}`);
      },
    });
    if (args.json) {
      printJson({ command: args.command, result });
    } else {
      console.log(`Aggregate settlement recovery applied: ${JSON.stringify(result)}`);
    }
  } finally {
    state.close();
  }
}

function resolveRecoveryCliStateDbPath(target: string): { path?: string; errors: string[] } {
  const resolved = resolveStateDbPath(target);
  if (resolved.errors.length > 0) {
    return { errors: resolved.errors.map(error => `aggregate settlement recovery: ${error}`) };
  }
  if (!resolved.path || !existsSync(resolved.path)) {
    return { errors: ['aggregate settlement recovery: --state-db must reference an existing SQLite database'] };
  }
  return { path: resolved.path, errors: [] };
}
