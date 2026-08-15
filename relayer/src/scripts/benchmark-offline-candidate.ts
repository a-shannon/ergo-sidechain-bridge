import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  defaultBenchmarkOfflineCandidateArtifacts,
  formatGate7OfflineStructuredCandidate,
  parseCompletedOfflineBenchmarkMetricRowsReport,
  type OfflineBenchmarkMetricSnapshot,
} from '../benchmark-offline-candidate.js';
import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';

export interface CliArgs {
  artifactSuffix?: string;
  current?: boolean;
  date?: string;
  gitCommit?: string;
  machineProfile?: string;
  metricRows?: string;
  nodeVersion?: string;
  out?: string;
  reviewer?: string;
  rustVersion?: string;
  wasmPackVersion?: string;
}

export interface BenchmarkOfflineCandidateMetadata {
  artifactSuffix: string;
  date: string;
  gitCommit: string;
  nodeVersion: string;
  rustVersion: string;
  wasmPackVersion: string;
}

const usage = [
  'Usage: npm run benchmark:offline-candidate -- (--current | --git-commit <sha> --date <YYYY-MM-DD> --node-version <version> --rust-version <version> --wasm-pack-version <version> --artifact-suffix <date-sha>) [--metric-rows <completed-metric-rows.md>] --out <packet.md>',
  '',
  'Builds a Gate 7 offline benchmark structure candidate from deterministic offline benchmark rows.',
  '--current fills missing commit/date/toolchain metadata from the local checkout and installed toolchain.',
  'Boundary: this command does not query nodes, read runtime databases, read deployment state, load environment files, sign, submit, deploy, rotate keys, publish, or broadcast transactions.',
  'The generated packet intentionally keeps live batch settlement, publication closure, and reviewer approvals blocked until real evidence exists.',
].join('\n');

export function parseBenchmarkOfflineCandidateArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      console.log(usage);
      process.exit(0);
    }

    const next = argv[index + 1];
    const setValue = (key: Exclude<keyof CliArgs, 'current'>): void => {
      if (!next) throw new Error(`${arg} requires a value`);
      args[key] = next;
      index += 1;
    };

    if (arg === '--artifact-suffix') {
      setValue('artifactSuffix');
    } else if (arg === '--current') {
      args.current = true;
    } else if (arg === '--date') {
      setValue('date');
    } else if (arg === '--git-commit') {
      setValue('gitCommit');
    } else if (arg === '--machine-profile') {
      setValue('machineProfile');
    } else if (arg === '--metric-rows') {
      setValue('metricRows');
    } else if (arg === '--node-version') {
      setValue('nodeVersion');
    } else if (arg === '--out') {
      setValue('out');
    } else if (arg === '--reviewer') {
      setValue('reviewer');
    } else if (arg === '--rust-version') {
      setValue('rustVersion');
    } else if (arg === '--wasm-pack-version') {
      setValue('wasmPackVersion');
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function requireArg(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function resolveBenchmarkOfflineCandidateMetadata(
  args: CliArgs,
  current?: Omit<BenchmarkOfflineCandidateMetadata, 'artifactSuffix'>,
): BenchmarkOfflineCandidateMetadata {
  const date = args.date ?? current?.date;
  const gitCommit = args.gitCommit ?? current?.gitCommit;
  const nodeVersion = args.nodeVersion ?? current?.nodeVersion;
  const rustVersion = args.rustVersion ?? current?.rustVersion;
  const wasmPackVersion = args.wasmPackVersion ?? current?.wasmPackVersion;

  const resolvedDate = requireArg(date, '--date');
  const resolvedGitCommit = requireArg(gitCommit, '--git-commit');
  const artifactSuffix = args.artifactSuffix ?? (args.current
    ? `${resolvedDate}-${resolvedGitCommit.replace(/^0x/i, '').slice(0, 8)}`
    : requireArg(undefined, '--artifact-suffix'));
  return {
    artifactSuffix,
    date: resolvedDate,
    gitCommit: resolvedGitCommit,
    nodeVersion: requireArg(nodeVersion, '--node-version'),
    rustVersion: requireArg(rustVersion, '--rust-version'),
    wasmPackVersion: requireArg(wasmPackVersion, '--wasm-pack-version'),
  };
}

export function runBenchmarkOfflineCandidateCli(argv: string[]): void {
  const args = parseBenchmarkOfflineCandidateArgs(argv);
  const metadata = resolveBenchmarkOfflineCandidateMetadata(
    args,
    args.current ? collectCurrentBenchmarkOfflineCandidateMetadata() : undefined,
  );
  const out = requireArg(args.out, '--out');
  const metricRows = args.metricRows ? loadMetricRows(args.metricRows) : undefined;
  const resolved = resolveEvidenceOutputPath(out);
  if (resolved.errors.length > 0 || !resolved.path) {
    for (const error of resolved.errors) console.error(error);
    process.exit(1);
  }

  const markdown = formatGate7OfflineStructuredCandidate({
    gitCommit: metadata.gitCommit,
    date: metadata.date,
    nodeVersion: metadata.nodeVersion,
    rustVersion: metadata.rustVersion,
    wasmPackVersion: metadata.wasmPackVersion,
    machineProfile: args.machineProfile,
    reviewer: args.reviewer,
    artifacts: defaultBenchmarkOfflineCandidateArtifacts(metadata.artifactSuffix),
    ...(metricRows ? { metrics: metricRows.metrics, metricRowsTarget: metricRows.target } : {}),
  });

  mkdirSync(dirname(resolved.path), { recursive: true });
  writeFileSync(resolved.path, markdown, { encoding: 'utf8', flag: 'wx' });
  console.log(`Wrote Gate 7 offline benchmark candidate to ${out}`);
  console.log('Boundary: no nodes, runtime databases, deployment state, signing, submission, deployment, publication, or broadcast were used.');
}

function collectCurrentBenchmarkOfflineCandidateMetadata(): Omit<BenchmarkOfflineCandidateMetadata, 'artifactSuffix'> {
  return {
    date: new Date().toISOString().slice(0, 10),
    gitCommit: commandOutput('git', ['rev-parse', '--short=8', 'HEAD'], 'current git commit'),
    nodeVersion: process.version,
    rustVersion: commandOutput('rustc', ['--version'], 'Rust compiler version'),
    wasmPackVersion: commandOutput('wasm-pack', ['--version'], 'wasm-pack version'),
  };
}

function commandOutput(command: string, args: string[], label: string): string {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    throw new Error(`${label} could not be detected; pass it explicitly or install the tool before using --current`);
  }
}

function loadMetricRows(target: string): {
  metrics: OfflineBenchmarkMetricSnapshot;
  target: string;
} {
  const read = readEvidenceMarkdownTarget(target);
  if (read.errors.length > 0) {
    for (const error of read.errors) console.error(error);
    process.exit(1);
  }
  try {
    return {
      metrics: parseCompletedOfflineBenchmarkMetricRowsReport(read.markdown),
      target: read.label,
    };
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    runBenchmarkOfflineCandidateCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage);
    process.exit(1);
  }
}
