import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

import { loadCanonicalAuthenticatedV2ContractTemplates } from '../authenticated-v2-canonical-contracts.js';
import {
  AUTHENTICATED_V2_FUNDING_OBSERVATION_SCHEMA,
} from '../authenticated-v2-funding-observation.js';
import {
  resolveProvisioningInputPath,
  resolveProvisioningOutputPath,
} from '../authenticated-v2-sanitized-io.js';
import {
  AUTHENTICATED_V2_INITIAL_BINDING_INPUT_SCHEMA,
  deriveAuthenticatedV2InitialBinding,
  deriveAuthenticatedV2InitialBindingFromFundingObservation,
  initialBindingCompilerRunFromPinnedJvm,
  type AuthenticatedV2InitialBindingCompiler,
  type AuthenticatedV2InitialBindingRequest,
} from '../authenticated-v2-initial-binding.js';
import { compileResolvedAuthenticatedV2SourcesWithPinnedJvm } from '../authenticated-v2-source-tree-conformance.js';

interface CliArgs {
  input?: string;
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
  'Usage: npm run contracts:authenticated-v2:derive-initial-binding -- --input <funding-observation-or-sanitized-identities.json> --ergo-source <pinned-ergo-checkout> --out <new-report.json>',
  `The preferred input schema is ${AUTHENTICATED_V2_FUNDING_OBSERVATION_SCHEMA}; ${AUTHENTICATED_V2_INITIAL_BINDING_INPUT_SCHEMA} remains available for offline compiler self-checks.`,
  'The command compiles the checked-in authenticated V2 contracts three times and emits only a fixed-point source/tree binding report.',
  'Funding-box existence, network, value, token contents, canonicality, and unspent status must be revalidated separately before provisioning.',
  'The command does not build transactions, contact a node, sign, check, submit, deploy, close Gate 5, or broadcast.',
];

export async function runAuthenticatedV2InitialBindingCli(
  argv: string[],
  options: CliOptions = {},
): Promise<void> {
  const args = parseAuthenticatedV2InitialBindingArgs(argv);
  if (args.help) {
    console.log(usage.join('\n'));
    return;
  }
  if (args.errors.length > 0) throw new Error(args.errors.join('\n'));

  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const bridgeRoot = realpathSync(resolve(options.bridgeRoot ?? resolve(scriptDirectory, '..', '..', '..')));
  const worktreeRoot = realpathSync(resolve(options.worktreeRoot ?? resolve(bridgeRoot, '..')));
  const cwd = resolve(options.cwd ?? process.cwd());
  const inputPath = resolveProvisioningInputPath(requireArg(args.input, '--input'), { cwd, bridgeRoot });
  const outputPath = resolveProvisioningOutputPath(requireArg(args.out, '--out'), { cwd, bridgeRoot });
  const ergoSourcePath = realpathSync(resolve(cwd, requireArg(args.ergoSource, '--ergo-source')));
  if (!statSync(ergoSourcePath).isDirectory()) throw new Error('--ergo-source must be a directory');
  const parsedInput = parseJsonObject(readFileSync(inputPath, 'utf8'), '--input');
  const templates = loadCanonicalAuthenticatedV2ContractTemplates(bridgeRoot);
  const compile: AuthenticatedV2InitialBindingCompiler = async resolved =>
    initialBindingCompilerRunFromPinnedJvm(
      await compileResolvedAuthenticatedV2SourcesWithPinnedJvm({
        resolved,
        bridgeRoot,
        worktreeRoot,
        ergoSourcePath,
      }),
    );
  const derivationOptions = {
    templates,
    compile,
  };
  const report = parsedInput.schema === AUTHENTICATED_V2_FUNDING_OBSERVATION_SCHEMA
    ? await deriveAuthenticatedV2InitialBindingFromFundingObservation(
        parsedInput,
        derivationOptions,
      )
    : await deriveAuthenticatedV2InitialBinding(
        hydrateAuthenticatedV2InitialBindingRequest(parsedInput),
        derivationOptions,
      );

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  console.log(`Authenticated V2 initial binding report written: ${relative(cwd, outputPath)}`);
  console.log(`Result: ${report.status}`);
  console.log(`Report digest: ${report.reportDigestHex}`);
  console.log(report.fundingObservation.status === 'bound'
    ? 'Boundary: the exact funding observation digest is bound, but the UTXOs must be revalidated before setup and no transaction, sign, check, submit, deploy, Gate 5 closure, or broadcast is authorized.'
    : 'Boundary: ID-to-contract derivation only; funding boxes remain unobserved and no transaction, sign, check, submit, deploy, Gate 5 closure, or broadcast is authorized.');
}

export function parseAuthenticatedV2InitialBindingArgs(argv: string[]): CliArgs {
  const result: CliArgs = { help: false, errors: [] };
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      result.help = true;
      continue;
    }
    if (!['--input', '--ergo-source', '--out'].includes(argument)) {
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
    else if (argument === '--ergo-source') result.ergoSource = value;
    else result.out = value;
  }
  if (!result.help) {
    if (!result.input) result.errors.push('--input is required');
    if (!result.ergoSource) result.errors.push('--ergo-source is required');
    if (!result.out) result.errors.push('--out is required');
  }
  return result;
}

export function hydrateAuthenticatedV2InitialBindingRequest(
  value: Record<string, unknown>,
): AuthenticatedV2InitialBindingRequest {
  assertExactKeys(value, [
    'schema',
    'environment',
    'trackerFundingBoxId',
    'dupVaultFundingBoxId',
  ], '--input');
  if (value.schema !== AUTHENTICATED_V2_INITIAL_BINDING_INPUT_SCHEMA) {
    throw new Error(`--input schema must be ${AUTHENTICATED_V2_INITIAL_BINDING_INPUT_SCHEMA}`);
  }
  return {
    environment: value.environment as string,
    trackerFundingBoxId: value.trackerFundingBoxId as string,
    dupVaultFundingBoxId: value.dupVaultFundingBoxId as string,
  };
}

function parseJsonObject(source: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error: any) {
    throw new Error(`${label} is not valid JSON: ${error?.message ?? String(error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function assertExactKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} must contain exactly: ${wanted.join(', ')}`);
  }
}

function requireArg(value: string | undefined, optionName: string): string {
  if (!value) throw new Error(`${optionName} is required`);
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runAuthenticatedV2InitialBindingCli(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage.join('\n'));
    process.exitCode = 1;
  });
}
