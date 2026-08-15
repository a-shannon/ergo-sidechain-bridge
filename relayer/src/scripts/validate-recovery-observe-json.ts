import { readEvidenceJsonTarget } from '../evidence-json-target-path.js';
import { validateRecoveryObserveJsonReport } from '../recovery-observe-json.js';
import type { TestnetRecoveryDrillKind } from '../testnet-recovery-drill-evidence.js';

interface Args {
  kind?: TestnetRecoveryDrillKind;
  target?: string;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--kind') {
      args.kind = requireChoice(requireValue(argv, index, arg), arg, [
        'failed-broadcast-phantom-avl',
        'reorged-burn-stale-singleton',
      ] as const);
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    if (args.target) {
      throw new Error('Only one recovery observe JSON target can be validated at a time');
    }
    args.target = arg;
  }
  return args;
}

function requireValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function requireChoice<T extends string>(value: string, option: string, choices: readonly T[]): T {
  if (!choices.includes(value as T)) {
    throw new Error(`${option} must be one of: ${choices.join(', ')}`);
  }
  return value as T;
}

function usage(): void {
  console.error([
    'Usage:',
    '  npm run rehearsal:recovery-observe:validate -- [--kind failed-broadcast-phantom-avl|reorged-burn-stale-singleton] <recovery-observe.json>',
    '',
    'This command reads one local repository-relative JSON evidence file and validates the read-only recovery observation boundary.',
  ].join('\n'));
}

let args: Args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error: any) {
  console.error(error?.message ?? String(error));
  usage();
  process.exit(1);
}

if (args.help || !args.target) {
  usage();
  process.exit(args.help ? 0 : 1);
}

const { errors, label, json } = readEvidenceJsonTarget(args.target, '--recovery-observe-json');
if (errors.length > 0) {
  console.log(`${label}: recovery-observe JSON BLOCKED: ${errors.length} structural issue(s).`);
  for (const error of errors) console.log(`- ${error}`);
  process.exit(1);
}

const validation = validateRecoveryObserveJsonReport(json, args.kind);
if (validation.errors.length > 0) {
  console.log(`${label}: recovery-observe JSON BLOCKED: ${validation.errors.length} structural issue(s).`);
  for (const error of validation.errors) console.log(`- ${error}`);
  process.exit(1);
}

console.log(`${label}: recovery-observe JSON PASS kind=${validation.kind}`);
