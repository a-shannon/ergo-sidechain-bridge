import { readFileSync, realpathSync, statSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

import { runAuthenticatedV2SourceTreeConformance } from '../authenticated-v2-source-tree-conformance.js';
import {
  hydrateAuthenticatedV2ProvisioningInput,
  resolveProvisioningInputPath,
  resolveProvisioningOutputPath,
} from './plan-authenticated-v2-provisioning.js';

interface CliArgs {
  input?: string;
  expectedPackageDigest?: string;
  ergoSource?: string;
  out?: string;
  help: boolean;
  errors: string[];
}

interface CliOptions {
  cwd?: string;
  bridgeRoot?: string;
  worktreeRoot?: string;
}

const usage = [
  'Usage: npm run contracts:authenticated-v2:conformance -- --input <sanitized-provisioning-input.json> --expected-package-digest <sha256> --ergo-source <pinned-ergo-checkout> --out <new-report.json>',
  'Rebuilds the provisioning package, resolves its exact authenticated V2 sources, compiles them with the locked resolver-free JVM tool, and compares complete ErgoTree bytes.',
  'The report never authorizes setup, signing, JVM transaction checking, submission, deployment, Gate 5 closure, or broadcast.',
];

export async function runAuthenticatedV2SourceTreeConformanceCli(
  argv: string[],
  options: CliOptions = {},
): Promise<void> {
  const args = parseAuthenticatedV2SourceTreeConformanceArgs(argv);
  if (args.help) {
    console.log(usage.join('\n'));
    return;
  }
  if (args.errors.length > 0) throw new Error(args.errors.join('\n'));

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const bridgeRoot = realpathSync(resolve(options.bridgeRoot ?? resolve(scriptDir, '..', '..', '..')));
  const worktreeRoot = realpathSync(resolve(options.worktreeRoot ?? resolve(bridgeRoot, '..')));
  const cwd = resolve(options.cwd ?? process.cwd());
  const inputPath = resolveProvisioningInputPath(requireArg(args.input, '--input'), { cwd, bridgeRoot });
  const outputPath = resolveProvisioningOutputPath(requireArg(args.out, '--out'), { cwd, bridgeRoot });
  const ergoSourcePath = realpathSync(resolve(cwd, requireArg(args.ergoSource, '--ergo-source')));
  if (!statSync(ergoSourcePath).isDirectory()) throw new Error('--ergo-source must be a directory');
  const parsed = parseJsonObject(readFileSync(inputPath, 'utf8'), '--input');
  const provisioningInput = await hydrateAuthenticatedV2ProvisioningInput(parsed);
  const report = await runAuthenticatedV2SourceTreeConformance({
    provisioningInput,
    expectedProvisioningPackageDigestHex: requireArg(
      args.expectedPackageDigest,
      '--expected-package-digest',
    ),
    bridgeRoot,
    worktreeRoot,
    ergoSourcePath,
  });

  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  console.log(`Authenticated V2 source-to-tree report written: ${relative(cwd, outputPath)}`);
  console.log(`Result: ${report.status}`);
  console.log(`Report digest: ${report.reportDigestHex}`);
  console.log('Authority: reproducible local result only; consumers must rerun the verifier instead of trusting retained JSON.');
  console.log('Boundary: compiler conformance only; no setup, sign, check, submit, deploy, Gate 5 closure, or broadcast.');
  if (report.status !== 'PASS') process.exitCode = 1;
}

export function parseAuthenticatedV2SourceTreeConformanceArgs(argv: string[]): CliArgs {
  const result: CliArgs = { help: false, errors: [] };
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      result.help = true;
      continue;
    }
    if (!['--input', '--expected-package-digest', '--ergo-source', '--out'].includes(argument)) {
      result.errors.push(`unknown option: ${argument}`);
      continue;
    }
    if (seen.has(argument)) {
      result.errors.push(`${argument} may be provided only once`);
      index += 1;
      continue;
    }
    seen.add(argument);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      result.errors.push(`${argument} requires a value`);
      continue;
    }
    index += 1;
    if (argument === '--input') result.input = value;
    else if (argument === '--expected-package-digest') result.expectedPackageDigest = value;
    else if (argument === '--ergo-source') result.ergoSource = value;
    else result.out = value;
  }
  if (!result.help) {
    if (!result.input) result.errors.push('--input is required');
    if (!result.expectedPackageDigest) result.errors.push('--expected-package-digest is required');
    if (!result.ergoSource) result.errors.push('--ergo-source is required');
    if (!result.out) result.errors.push('--out is required');
  }
  return result;
}

function parseJsonObject(source: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function requireArg(value: string | undefined, option: string): string {
  if (!value) throw new Error(`${option} is required`);
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runAuthenticatedV2SourceTreeConformanceCli(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage.join('\n'));
    process.exitCode = 1;
  });
}
