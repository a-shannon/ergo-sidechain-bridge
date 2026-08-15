import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  validateAuthenticatedV2PreSetupFundingRevalidationReport,
} from '../authenticated-v2-pre-setup-funding-revalidation.js';
import {
  resolveProvisioningInputPath,
  type AuthenticatedV2PathResolutionOptions,
} from '../authenticated-v2-sanitized-io.js';
import {
  hydrateAuthenticatedV2ProvisioningInput,
} from './plan-authenticated-v2-provisioning.js';

interface CliArgs {
  input?: string;
  report?: string;
  expectedPackageDigest?: string;
  expectedFreshObservationDigest?: string;
  help: boolean;
  errors: string[];
}

const valueOptions = [
  '--input',
  '--report',
  '--expected-package-digest',
  '--expected-fresh-observation-digest',
] as const;

const usage = [
  'Usage: npm run settle:authenticated:pre-setup-validate -- --input <provisioning-v4.json> --report <pre-setup-report.json> --expected-package-digest <64hex> --expected-fresh-observation-digest <64hex>',
  'Validates one retained pre-setup report against the complete V2 input and two digests captured outside that report.',
  'The fresh-observation digest must come from the original command transcript or another separately retained capture binding; reading it back from the report defeats tamper detection.',
  'This offline command performs no node request, configuration read, signing, transaction check, setup, submit, deploy, Gate 5 closure, or broadcast action.',
];

export async function runAuthenticatedV2PreSetupFundingValidationCli(
  argv: string[],
  options: AuthenticatedV2PathResolutionOptions = {},
): Promise<void> {
  const args = parseAuthenticatedV2PreSetupFundingValidationArgs(argv);
  if (args.help) {
    console.log(usage.join('\n'));
    return;
  }
  if (args.errors.length > 0) throw new Error(args.errors.join('\n'));

  const cwd = resolve(options.cwd ?? process.cwd());
  const inputPath = resolveProvisioningInputPath(requireArg(args.input, '--input'), {
    cwd,
    bridgeRoot: options.bridgeRoot,
  });
  const reportPath = resolveProvisioningInputPath(requireArg(args.report, '--report'), {
    cwd,
    bridgeRoot: options.bridgeRoot,
  });
  const input = parseJsonObject(readFileSync(inputPath, 'utf8'), '--input');
  const report = parseJsonObject(readFileSync(reportPath, 'utf8'), '--report');
  const provisioningInput = await hydrateAuthenticatedV2ProvisioningInput(input);
  const validated = await validateAuthenticatedV2PreSetupFundingRevalidationReport(
    report,
    provisioningInput,
    requireArg(args.expectedPackageDigest, '--expected-package-digest'),
    requireArg(
      args.expectedFreshObservationDigest,
      '--expected-fresh-observation-digest',
    ),
  );
  console.log('Authenticated V2 pre-setup funding revalidation: PASS');
  console.log(`Report digest: ${validated.reportDigestHex}`);
  console.log(`Fresh observation digest: ${validated.observations.fresh.reportDigestHex}`);
  console.log('Boundary: offline evidence validation only; no setup or execution authority.');
}

export function parseAuthenticatedV2PreSetupFundingValidationArgs(argv: string[]): CliArgs {
  const result: CliArgs = { help: false, errors: [] };
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      result.help = true;
      continue;
    }
    if (!(valueOptions as readonly string[]).includes(argument)) {
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
    else if (argument === '--report') result.report = value;
    else if (argument === '--expected-package-digest') result.expectedPackageDigest = value;
    else result.expectedFreshObservationDigest = value;
  }
  if (!result.help) {
    if (!result.input) result.errors.push('--input is required');
    if (!result.report) result.errors.push('--report is required');
    if (!result.expectedPackageDigest) result.errors.push('--expected-package-digest is required');
    if (!result.expectedFreshObservationDigest) {
      result.errors.push('--expected-fresh-observation-digest is required');
    }
  }
  return result;
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

function requireArg(value: string | undefined, optionName: string): string {
  if (!value) throw new Error(`${optionName} is required`);
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runAuthenticatedV2PreSetupFundingValidationCli(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage.join('\n'));
    process.exitCode = 1;
  });
}
