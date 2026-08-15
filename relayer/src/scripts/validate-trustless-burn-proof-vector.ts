import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js';
import { validateTrustlessBurnProofVectorTarget } from '../trustless-burn-proof-vector.js';

interface CliArgs {
  targets: string[];
  jsonOut?: string;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { targets: [], help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--json-out') {
      args.jsonOut = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    args.targets.push(arg);
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

const usageLines = [
  'Usage: npm run trustless:proof-vector:validate -- <trustless-burn-proof-vector.json> [...] [--json-out <report.json>]',
  'This command validates read-only local proof-core evidence and can write a bounded structured report with --json-out.',
  'When --json-out is provided, exactly one proof-vector target is allowed so Gate 5 can bind one report result to one embedded Local Proof Vector.',
  'Boundary: proof-vector validation is not Gate 5 closure, not settlement readiness, not broadcast authorization, and not production or testnet production-candidate claim support.',
  'This command is proof-vector validation only; it does not sign, approve, submit, publish, push, broadcast, or open runtime databases.',
];

function usage(stream: 'stdout' | 'stderr' = 'stderr'): void {
  const text = usageLines.join('\n');
  if (stream === 'stdout') console.log(text);
  else console.error(text);
}

let args: CliArgs;
try {
  args = parseArgs(process.argv.slice(2));
} catch (err: any) {
  console.error(err?.message ?? String(err));
  usage();
  process.exit(1);
}

if (args.help || args.targets.length === 0) {
  usage(args.help ? 'stdout' : 'stderr');
  process.exit(args.help ? 0 : 1);
}

if (args.jsonOut && args.targets.length !== 1) {
  console.error(
    '--json-out requires exactly one proof-vector target so Gate 5 can bind one report result to one embedded Local Proof Vector',
  );
  usage();
  process.exit(1);
}

const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;
if (jsonOutputTarget?.errors.length) {
  for (const error of jsonOutputTarget.errors) console.error(error);
  process.exit(1);
}

let blocked = false;
const reports = [];

for (const target of args.targets) {
  const result = validateTrustlessBurnProofVectorTarget(target);
  reports.push(result);
  console.log(`${result.label}: ${result.message}`);
  if (result.bridgeEventRootHex) console.log(`- bridgeEventRootHex: ${result.bridgeEventRootHex}`);
  if (result.leafHashHex) console.log(`- leafHashHex: ${result.leafHashHex}`);
  if (result.leafCount !== undefined) console.log(`- leafCount: ${result.leafCount}`);
  if (result.proofNodeCount !== undefined) console.log(`- proofNodes: ${result.proofNodeCount}`);
  for (const error of result.errors) console.log(`- ${error}`);
  if (result.status === 'BLOCKED') blocked = true;
}

if (args.jsonOut) {
  const output = writeOfflineReportJson(args.jsonOut, {
    schemaVersion: 1,
    command: 'trustless:proof-vector:validate',
    status: blocked ? 'BLOCKED' : 'PASS',
    errors: reports.flatMap(report => report.errors),
    boundary: {
      readOnly: true,
      localProofCoreOnly: true,
      gate5Closure: false,
      settlementReadiness: false,
      broadcastAuthorization: false,
      productionClaimSupport: false,
      testnetProductionCandidateClaimSupport: false,
    },
    reports,
  });
  if (output.errors.length > 0) {
    for (const error of output.errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log(formatOfflineReportJsonWriteLine('trustless burn proof-vector report', args.jsonOut));
  }
}

if (blocked) {
  process.exitCode = 1;
}
