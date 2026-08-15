import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js';
import { buildLocalGate5SpvTrackerObservation } from '../spv-tracker-local-observation.js';

interface CliArgs {
  observedAt?: string;
  bridgeEventRootHex?: string;
  out?: string;
}

const usage = [
  'Usage: npm run trustless:spv-tracker:local-observation -- --observed-at <ISO> [--bridge-event-root <64hex>] --out <spv-tracker-observation.json>',
  '',
  'Builds sanitized public local SPV tracker observation JSON for the Gate 5 commitment bindings.',
  'By default it uses the current checked-in local Gate 5 fixture root; --bridge-event-root binds the observation to a specific public proof-vector root.',
  'Boundary: this command does not load environment files, query nodes, read runtime databases, read deployment state, sign, check, approve, submit, reconcile, mutate state, broadcast, or authorize claims.',
  'The generated JSON is prerequisite observation input only; run npm run trustless:spv-tracker-observe to validate it. It is not Gate 5 closure, not proof acceptance evidence, not settlement readiness, not signing authorization, and not a production-readiness claim.',
].join('\n');

export function parseSpvTrackerLocalObservationArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      console.log(usage);
      process.exit(0);
    }

    const next = argv[index + 1];
    const setValue = (key: keyof CliArgs): void => {
      if (!next) throw new Error(`${arg} requires a value`);
      args[key] = next;
      index += 1;
    };

    if (arg === '--observed-at') {
      setValue('observedAt');
    } else if (arg === '--bridge-event-root') {
      setValue('bridgeEventRootHex');
    } else if (arg === '--out') {
      setValue('out');
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

export function runSpvTrackerLocalObservationCli(argv: string[]): void {
  const args = parseSpvTrackerLocalObservationArgs(argv);
  const observedAt = requireArg(args.observedAt, '--observed-at');
  const out = requireArg(args.out, '--out');
  const resolved = resolveEvidenceJsonOutputPath(out, { optionName: '--out' });
  if (resolved.errors.length > 0 || !resolved.path) {
    for (const error of resolved.errors) console.error(error);
    process.exit(1);
  }

  const observation = buildLocalGate5SpvTrackerObservation({
    observedAt,
    bridgeEventRootHex: args.bridgeEventRootHex,
  });
  mkdirSync(dirname(resolved.path), { recursive: true });
  writeFileSync(resolved.path, `${JSON.stringify(observation, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });

  console.log('SPV tracker observation JSON: written');
  console.log(`sourceLabel: ${observation.sourceLabel}`);
  console.log(`network: ${observation.network}`);
  console.log(`bridgeEventRootHex: ${observation.expectedEntry.bridgeEventRootHex}`);
  console.log(`sidechainFinality.requiredConfirmations: ${observation.sidechainFinality.requiredConfirmations}`);
  console.log(`sidechainFinality.observedSidechainHeight: ${observation.sidechainFinality.observedSidechainHeight}`);
  console.log(`trackerDigestHex: ${observation.trackerDigestHex}`);
  console.log(`history entries: ${observation.history.length}`);
  console.log('Boundary: no environment files, nodes, runtime databases, deployed state, signing, check, submit, reconcile, state mutation, broadcast, or claim authorization were used.');
}

function requireArg(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    runSpvTrackerLocalObservationCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage);
    process.exit(1);
  }
}
