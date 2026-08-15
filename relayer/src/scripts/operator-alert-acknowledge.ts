import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  Ed25519OperatorAlertAcknowledgementVerifier,
} from '../adapters/operator-alert-acknowledgement-verifier.js';
import {
  SqliteOperatorAlertAcknowledgementState,
} from '../adapters/operator-alert-acknowledgement-state.js';
import {
  SqliteOperatorAlertExternalOutbox,
} from '../adapters/operator-alert-external-outbox.js';
import {
  recordOperatorAlertAcknowledgement,
} from '../apps/operator-alert-worker/operator-alert-worker.js';
import { parseStrictJson } from '../strict-json.js';

const usage = [
  'Usage: npm run operator:alerts:acknowledge -- --outbox <sqlite-path> --acknowledgement <signed-json> --key-registry <reviewed-json>',
  'Verifies one Ed25519 acknowledgement against the exact delivered alert and receipt, then stores audit metadata only.',
  'Acknowledgement never clears a hold or grants checking, signing, authorization, submission, broadcast, or funds authority.',
] as const;

interface Args {
  readonly outbox?: string;
  readonly acknowledgement?: string;
  readonly keyRegistry?: string;
  readonly help: boolean;
  readonly errors: readonly string[];
}

export function parseOperatorAlertAcknowledgementArgs(
  argv: readonly string[],
): Args {
  const values: Record<string, string> = {};
  const errors: string[] = [];
  let help = false;
  const known = new Set(['--outbox', '--acknowledgement', '--key-registry']);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      help = true;
      continue;
    }
    if (!known.has(argument)) {
      errors.push(`unknown option: ${argument}`);
      continue;
    }
    if (Object.hasOwn(values, argument)) {
      errors.push(`${argument} may be provided only once`);
      index += 1;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      errors.push(`${argument} requires a value`);
      continue;
    }
    values[argument] = value;
    index += 1;
  }
  if (!help) {
    for (const option of known) {
      if (!values[option]) errors.push(`${option} is required`);
    }
  }
  return Object.freeze({
    outbox: values['--outbox'],
    acknowledgement: values['--acknowledgement'],
    keyRegistry: values['--key-registry'],
    help,
    errors: Object.freeze(errors),
  });
}

export function runOperatorAlertAcknowledgementCli(
  argv: readonly string[],
): void {
  const args = parseOperatorAlertAcknowledgementArgs(argv);
  if (args.help) {
    console.log(usage.join('\n'));
    return;
  }
  if (args.errors.length > 0) throw new Error(args.errors.join('\n'));
  for (const path of [args.outbox!, args.acknowledgement!, args.keyRegistry!]) {
    if (!existsSync(path)) throw new Error('required operator alert input is absent');
  }
  const acknowledgement = parseStrictJson(
    readFileSync(args.acknowledgement!, 'utf8'),
    'operator alert acknowledgement',
  );
  const registry = parseStrictJson(
    readFileSync(args.keyRegistry!, 'utf8'),
    'operator alert acknowledgement key registry',
  );
  const outbox = new SqliteOperatorAlertExternalOutbox(args.outbox!);
  const state = new SqliteOperatorAlertAcknowledgementState(
    args.outbox!,
    outbox,
  );
  try {
    const parsed = acknowledgement as { alertIdHex?: unknown };
    const outcome = recordOperatorAlertAcknowledgement({
      acknowledgement,
      verifier: new Ed25519OperatorAlertAcknowledgementVerifier(registry),
      store: state,
      verifiedAtMs: Date.now(),
    });
    console.log(JSON.stringify({
      status: outcome,
      alertIdHex:
        typeof parsed.alertIdHex === 'string'
          ? parsed.alertIdHex
          : null,
    }));
  } finally {
    state.close();
    outbox.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    runOperatorAlertAcknowledgementCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage.join('\n'));
    process.exitCode = 1;
  }
}
