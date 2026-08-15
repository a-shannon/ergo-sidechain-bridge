import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  createHttpsOperatorAlertExternalDelivery,
} from '../adapters/operator-alert-external-delivery.js';
import {
  SqliteOperatorAlertExternalOutbox,
} from '../adapters/operator-alert-external-outbox.js';
import {
  runOperatorAlertExternalWorker,
} from '../apps/operator-alert-worker/operator-alert-worker.js';

const usage = [
  'Usage: npm run operator:alerts:worker -- --outbox <sqlite-path> --endpoint <credential-free-https-url> [--timeout-ms <1..30000>] [--max-response-bytes <1..65536>]',
  'Reads at most one due immutable alert from the reconstructible outbox and delivers it with alertId idempotency.',
  'Optional HTTP authorization requires both OPERATOR_ALERT_WEBHOOK_AUTHORIZATION and its exact OPERATOR_ALERT_WEBHOOK_AUTHORIZATION_ENDPOINT_DIGEST binding; neither is persisted or logged.',
  'This worker cannot clear holds, mutate bridge lifecycle, check, sign, authorize, submit, broadcast, or establish funds authority.',
] as const;

export interface OperatorAlertExternalWorkerArgs {
  readonly outbox?: string;
  readonly endpoint?: string;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
  readonly help: boolean;
  readonly errors: readonly string[];
}

export function parseOperatorAlertExternalWorkerArgs(
  argv: readonly string[],
): OperatorAlertExternalWorkerArgs {
  const values: Record<string, string> = {};
  const errors: string[] = [];
  let help = false;
  const known = new Set([
    '--outbox',
    '--endpoint',
    '--timeout-ms',
    '--max-response-bytes',
  ]);
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
    if (!values['--outbox']) errors.push('--outbox is required');
    if (!values['--endpoint']) errors.push('--endpoint is required');
  }
  return Object.freeze({
    outbox: values['--outbox'],
    endpoint: values['--endpoint'],
    timeoutMs: optionalBoundedInteger(
      values['--timeout-ms'],
      30_000,
      '--timeout-ms',
      errors,
    ),
    maxResponseBytes: optionalBoundedInteger(
      values['--max-response-bytes'],
      65_536,
      '--max-response-bytes',
      errors,
    ),
    help,
    errors: Object.freeze(errors),
  });
}

export async function runOperatorAlertExternalWorkerCli(
  argv: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<void> {
  const args = parseOperatorAlertExternalWorkerArgs(argv);
  if (args.help) {
    console.log(usage.join('\n'));
    return;
  }
  if (args.errors.length > 0) throw new Error(args.errors.join('\n'));
  if (!args.outbox || !existsSync(args.outbox)) {
    throw new Error('operator alert outbox database does not exist');
  }
  const outbox = new SqliteOperatorAlertExternalOutbox(args.outbox);
  try {
    const outcome = await runOperatorAlertExternalWorker({
      outbox,
      transport: createHttpsOperatorAlertExternalDelivery({
        endpoint: args.endpoint!,
        authorizationHeader:
          environment.OPERATOR_ALERT_WEBHOOK_AUTHORIZATION,
        authorizationEndpointIdentityDigestHex:
          environment.OPERATOR_ALERT_WEBHOOK_AUTHORIZATION_ENDPOINT_DIGEST,
        ...(args.timeoutMs === undefined ? {} : { timeoutMs: args.timeoutMs }),
        ...(args.maxResponseBytes === undefined
          ? {}
          : { maxResponseBytes: args.maxResponseBytes }),
      }),
      nowMs: Date.now(),
    });
    console.log(JSON.stringify(outcome));
  } finally {
    outbox.close();
  }
}

function optionalBoundedInteger(
  value: string | undefined,
  maximum: number,
  option: string,
  errors: string[],
): number | undefined {
  if (value === undefined) return undefined;
  if (!/^[1-9][0-9]*$/.test(value)) {
    errors.push(`${option} must be a positive integer`);
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    errors.push(`${option} exceeds its maximum of ${maximum}`);
    return undefined;
  }
  return parsed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runOperatorAlertExternalWorkerCli(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage.join('\n'));
    process.exitCode = 1;
  });
}
