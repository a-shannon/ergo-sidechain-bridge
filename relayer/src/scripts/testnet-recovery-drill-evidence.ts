import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js';
import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import { readEvidenceJsonTarget } from '../evidence-json-target-path.js';
import {
  buildTestnetRecoveryDrillEvidence,
  type TestnetRecoveryDrillEvidenceInput,
  type TestnetRecoveryDrillKind,
} from '../testnet-recovery-drill-evidence.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import { validateRecoveryObserveJsonReport } from '../recovery-observe-json.js';

interface CliArgs {
  kind?: TestnetRecoveryDrillKind;
  evidenceArtifact?: string;
  validationArtifact?: string;
  observationArtifact?: string;
  observationJson?: string;
  expectedTxId?: string;
  pegOutBurnTxId?: string;
  singletonInventoryId?: string;
  out?: string;
  jsonOut?: string;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { help: false };
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
    if (arg === '--evidence-artifact') {
      args.evidenceArtifact = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--validation-artifact') {
      args.validationArtifact = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--observation-artifact') {
      args.observationArtifact = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--observation-json') {
      args.observationJson = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--expected-tx-id') {
      args.expectedTxId = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--peg-out-burn-tx-id') {
      args.pegOutBurnTxId = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--singleton-inventory-id') {
      args.singletonInventoryId = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--out') {
      args.out = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--json-out') {
      args.jsonOut = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
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
    '  npm run rehearsal:recovery-drill -- --kind failed-broadcast-phantom-avl --evidence-artifact <artifact://...> --validation-artifact <artifact://.../rehearsal-validate.log> --observation-artifact <artifact://.../recovery-observe.json> --observation-json <recovery-observe.json> --expected-tx-id <64hex> --peg-out-burn-tx-id <64hex> [--out <row.md>] [--json-out <report.json>]',
    '  npm run rehearsal:recovery-drill -- --kind reorged-burn-stale-singleton --evidence-artifact <artifact://...> --validation-artifact <artifact://.../rehearsal-validate.log> --observation-artifact <artifact://.../recovery-observe.json> --observation-json <recovery-observe.json> --peg-out-burn-tx-id <64hex> --singleton-inventory-id <64hex> [--out <row.md>] [--json-out <report.json>]',
    '',
    'This command assembles offline evidence rows only. It never signs, queries nodes, submits, confirms, reconciles, repairs, or broadcasts transactions.',
  ].join('\n'));
}

function requireInput(args: CliArgs): TestnetRecoveryDrillEvidenceInput {
  const missing: string[] = [];
  if (!args.kind) missing.push('--kind');
  if (!args.evidenceArtifact) missing.push('--evidence-artifact');
  if (!args.validationArtifact) missing.push('--validation-artifact');
  if (!args.observationArtifact) missing.push('--observation-artifact');
  if (!args.observationJson) missing.push('--observation-json');
  if (!args.pegOutBurnTxId) missing.push('--peg-out-burn-tx-id');
  if (args.kind === 'failed-broadcast-phantom-avl' && !args.expectedTxId) missing.push('--expected-tx-id');
  if (args.kind === 'reorged-burn-stale-singleton' && !args.singletonInventoryId) {
    missing.push('--singleton-inventory-id');
  }
  if (missing.length > 0) throw new Error(`Missing required option(s): ${missing.join(', ')}`);

  return {
    kind: args.kind!,
    evidenceArtifact: args.evidenceArtifact!,
    validationArtifact: args.validationArtifact!,
    observationArtifact: args.observationArtifact!,
    expectedTxId: args.expectedTxId,
    pegOutBurnTxId: args.pegOutBurnTxId!,
    singletonInventoryId: args.singletonInventoryId,
  };
}

let args: CliArgs;
try {
  args = parseArgs(process.argv.slice(2));
} catch (err: any) {
  console.error(err?.message ?? String(err));
  usage();
  process.exit(1);
}

if (args.help) {
  usage();
  process.exit(0);
}

let input: TestnetRecoveryDrillEvidenceInput;
try {
  input = requireInput(args);
} catch (err: any) {
  console.error(err?.message ?? String(err));
  usage();
  process.exit(1);
}

const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;
if (outputTarget?.errors.length) {
  for (const error of outputTarget.errors) console.error(error);
  process.exit(1);
}
const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;
if (jsonOutputTarget?.errors.length) {
  for (const error of jsonOutputTarget.errors) console.error(error);
  process.exit(1);
}

const observationJson = readEvidenceJsonTarget(args.observationJson!, '--observation-json');
if (observationJson.errors.length > 0) {
  for (const error of observationJson.errors) console.error(error);
  process.exit(1);
}
const observationValidation = validateRecoveryObserveJsonReport(observationJson.json, input.kind);
if (observationValidation.errors.length > 0) {
  console.error(`${observationJson.label}: recovery-observe JSON validation BLOCKED: ${observationValidation.errors.length} issue(s)`);
  for (const error of observationValidation.errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`${observationJson.label}: recovery-observe JSON validation PASS`);

const report = buildTestnetRecoveryDrillEvidence(input);
for (const line of report.lines) console.log(line);

if (args.jsonOut) {
  const result = writeOfflineReportJson(args.jsonOut, {
    schemaVersion: 1,
    ...report,
  });
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log(formatOfflineReportJsonWriteLine('recovery drill report', args.jsonOut));
  }
}

if (report.status === 'BLOCKED') {
  process.exitCode = 1;
} else if (args.out && report.markdown) {
  const outputPath = outputTarget!.path!;
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${report.markdown.trimEnd()}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  console.log(`- recovery drill evidence row written: ${args.out}`);
} else if (report.markdown) {
  console.log('');
  console.log(report.markdown.trimEnd());
}
