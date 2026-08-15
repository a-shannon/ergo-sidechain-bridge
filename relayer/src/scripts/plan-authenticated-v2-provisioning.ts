import {
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'fs';
import { dirname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  buildAuthenticatedV2ProvisioningPlan,
  type AuthenticatedV2ProvisioningInput,
} from '../authenticated-v2-provisioning-plan.js';
import { initialBindingRequestFromFundingObservation } from '../authenticated-v2-funding-observation.js';
import { validateAuthenticatedV2InitialBindingReport } from '../authenticated-v2-initial-binding.js';
import {
  loadCanonicalAuthenticatedV2ContractTemplates,
} from '../authenticated-v2-canonical-contracts.js';
import {
  AUTHENTICATED_V2_PROVISIONING_INPUT_SCHEMA,
} from '../authenticated-v2-provisioning-schema.js';
import {
  resolveProvisioningInputPath,
  resolveProvisioningOutputPath,
  type AuthenticatedV2PathResolutionOptions,
} from '../authenticated-v2-sanitized-io.js';

export { AUTHENTICATED_V2_PROVISIONING_INPUT_SCHEMA } from '../authenticated-v2-provisioning-schema.js';
export { AUTHENTICATED_V2_CANONICAL_TEMPLATE_SHA256 } from '../authenticated-v2-canonical-contracts.js';

const bridgeRoot = realpathSync(fileURLToPath(new URL('../../../', import.meta.url)));
interface CliArgs {
  input?: string;
  out?: string;
  help: boolean;
  errors: string[];
}

type PathResolutionOptions = AuthenticatedV2PathResolutionOptions;

export {
  resolveProvisioningInputPath,
  resolveProvisioningOutputPath,
} from '../authenticated-v2-sanitized-io.js';

const usage = [
  'Usage: npm run settle:authenticated:provision-plan -- --input <sanitized-input.json> --out <new-plan.json>',
  'Builds a deterministic authenticated V2 setup, tracker-admission, and settlement-preview package.',
  `The input must use schema ${AUTHENTICATED_V2_PROVISIONING_INPUT_SCHEMA} and embed the complete funding-observation and initial-binding reports.`,
  'Funding boxes and contract pins are derived from those validated reports; duplicate caller-supplied fragments are rejected.',
  'The output must be a new JSON file inside the bridge repository.',
  'This command does not read configuration or deployment state, contact a node, sign, run /transactions/check, submit, deploy, close Gate 5, or broadcast.',
];

export async function runAuthenticatedV2ProvisioningPlanCli(
  argv: string[],
  options: PathResolutionOptions = {},
): Promise<void> {
  const args = parseAuthenticatedV2ProvisioningArgs(argv);
  if (args.help) {
    console.log(usage.join('\n'));
    return;
  }
  if (args.errors.length > 0) throw new Error(args.errors.join('\n'));

  const inputPath = resolveProvisioningInputPath(requireArg(args.input, '--input'), options);
  const outputPath = resolveProvisioningOutputPath(requireArg(args.out, '--out'), options);
  const parsed = parseJsonObject(readFileSync(inputPath, 'utf8'), '--input');
  const input = await hydrateAuthenticatedV2ProvisioningInput(parsed);
  const plan = await buildAuthenticatedV2ProvisioningPlan(input);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });

  console.log(`Authenticated V2 provisioning plan written: ${relative(options.cwd ?? process.cwd(), outputPath)}`);
  console.log(`Package digest: ${plan.packageDigestHex}`);
  console.log(`Predicted settlement preview transaction ID: ${plan.settlement.predictedTxId}`);
  console.log('Boundary: offline deterministic plan only; no sign, check, submit, deploy, Gate 5 closure, or broadcast.');
}

export function parseAuthenticatedV2ProvisioningArgs(argv: string[]): CliArgs {
  const result: CliArgs = { help: false, errors: [] };
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      result.help = true;
      continue;
    }
    if (argument !== '--input' && argument !== '--out') {
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
    else result.out = value;
  }
  if (!result.help) {
    if (!result.input) result.errors.push('--input is required');
    if (!result.out) result.errors.push('--out is required');
  }
  return result;
}

export async function hydrateAuthenticatedV2ProvisioningInput(
  value: Record<string, unknown>,
): Promise<AuthenticatedV2ProvisioningInput> {
  assertExactKeys(value, [
    'schema',
    'fundingObservation',
    'initialBinding',
    'provisioningCreationHeight',
    'settlementCreationHeight',
    'sidechainIdHex',
    'committeePubKeyHex',
    'trackerFinalityAttestorPubKeyHex',
    'values',
    'vault',
    'checkpoint',
    'settlement',
  ], '--input');
  if (value.schema !== AUTHENTICATED_V2_PROVISIONING_INPUT_SCHEMA) {
    throw new Error(`--input schema must be ${AUTHENTICATED_V2_PROVISIONING_INPUT_SCHEMA}`);
  }
  const templates = loadCanonicalAuthenticatedV2ContractTemplates(bridgeRoot);
  const funding = await initialBindingRequestFromFundingObservation(value.fundingObservation);
  const initialBinding = validateAuthenticatedV2InitialBindingReport(
    value.initialBinding,
    funding,
    templates,
  );

  return {
    environment: funding.request.environment,
    provenance: {
      fundingObservation: {
        reportDigestHex: funding.binding.reportDigestHex,
        snapshotDigestHex: funding.binding.snapshotDigestHex,
        observedAt: funding.binding.observedAt,
        nodeNetwork: funding.binding.nodeNetwork,
        tipHeight: funding.binding.tipHeight,
        tipIdHex: funding.binding.tipIdHex,
      },
      initialBinding: initialBinding.provenance,
      revalidationRequiredBeforeSetup: true,
    },
    provisioningCreationHeight: value.provisioningCreationHeight as number,
    settlementCreationHeight: value.settlementCreationHeight as number,
    sidechainIdHex: value.sidechainIdHex as string,
    committeePubKeyHex: value.committeePubKeyHex as string,
    trackerFinalityAttestorPubKeyHex:
      value.trackerFinalityAttestorPubKeyHex as string,
    trackerFundingBox: funding.provisioningFundingBoxes.trackerFundingBox,
    dupVaultFundingBox: funding.provisioningFundingBoxes.dupVaultFundingBox,
    contracts: initialBinding.contracts,
    values: value.values as AuthenticatedV2ProvisioningInput['values'],
    vault: value.vault as AuthenticatedV2ProvisioningInput['vault'],
    checkpoint: value.checkpoint as AuthenticatedV2ProvisioningInput['checkpoint'],
    settlement: value.settlement as AuthenticatedV2ProvisioningInput['settlement'],
  };
}

function parseJsonObject(source: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error: any) {
    throw new Error(`${label} is not valid JSON: ${error?.message ?? String(error)}`);
  }
  return requireRecord(parsed, label);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
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
  runAuthenticatedV2ProvisioningPlanCli(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage.join('\n'));
    process.exitCode = 1;
  });
}
