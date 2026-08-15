import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, relative } from 'path';
import { fileURLToPath } from 'url';

import {
  buildAuthenticatedV2AdmissionStagePlan,
  buildAuthenticatedV2SettlementStagePlan,
  type AuthenticatedV2AdmissionStagePlan,
  type AuthenticatedV2CanonicalAnchorObservation,
  type AuthenticatedV2ConfirmedBoxObservation,
  type AuthenticatedV2FreshHeaderContext,
} from '../authenticated-v2-stage-rebuild.js';
import {
  hydrateAuthenticatedV2ProvisioningInput,
  parseAuthenticatedV2ProvisioningArgs,
  resolveProvisioningInputPath,
  resolveProvisioningOutputPath,
} from './plan-authenticated-v2-provisioning.js';

export const AUTHENTICATED_V2_STAGE_REBUILD_INPUT_SCHEMA =
  'e2s.authenticated-v2-stage-rebuild-input.v2';

interface PathResolutionOptions {
  cwd?: string;
  bridgeRoot?: string;
}

const usage = [
  'Usage: npm run settle:authenticated:stage-plan -- --input <sanitized-input.json> --out <new-plan.json>',
  `Input schema: ${AUTHENTICATED_V2_STAGE_REBUILD_INPUT_SCHEMA}; stage must be admission or settlement.`,
  'Admission rebuilds from exact confirmed tracker-setup outputs, ten mined headers from lastHeaders/10, and the derived node simplifiedUpcoming preheader.',
  'Settlement rebuilds from the confirmed admission output, initial DUP/vault outputs, and a canonical anchor observation.',
  'This command consumes explicit sanitized observations only. It does not contact a node, sign, check, submit, deploy, close Gate 5, or broadcast.',
];

export async function runAuthenticatedV2StageRebuildCli(
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
  const plan = await hydrateAndBuildStage(parsed);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  console.log(`Authenticated V2 ${parsed.stage} stage plan written: ${relative(options.cwd ?? process.cwd(), outputPath)}`);
  console.log(`Stage digest: ${plan.stageDigestHex}`);
  console.log(`Unsigned transaction ID: ${plan.operation.txId}`);
  console.log('Boundary: sanitized operator observations only; no sign, check, submit, deploy, Gate 5 closure, or broadcast.');
}

export async function hydrateAndBuildStage(value: Record<string, unknown>) {
  if (value.schema !== AUTHENTICATED_V2_STAGE_REBUILD_INPUT_SCHEMA) {
    throw new Error(`--input schema must be ${AUTHENTICATED_V2_STAGE_REBUILD_INPUT_SCHEMA}`);
  }
  const stage = value.stage;
  const provisioning = await hydrateAuthenticatedV2ProvisioningInput(
    requireRecord(value.provisioning, '--input provisioning'),
  );
  if (stage === 'admission') {
    assertExactKeys(value, [
      'schema',
      'stage',
      'provisioning',
      'expectedProvisioningPackageDigestHex',
      'trackerSetupObservation',
      'admissionFeeObservation',
      'stateContext',
    ], '--input admission stage');
    return buildAuthenticatedV2AdmissionStagePlan({
      provisioning,
      expectedProvisioningPackageDigestHex: value.expectedProvisioningPackageDigestHex as string,
      trackerSetupObservation: value.trackerSetupObservation as AuthenticatedV2ConfirmedBoxObservation,
      admissionFeeObservation: value.admissionFeeObservation as AuthenticatedV2ConfirmedBoxObservation,
      stateContext: value.stateContext as AuthenticatedV2FreshHeaderContext,
    });
  }
  if (stage === 'settlement') {
    assertExactKeys(value, [
      'schema',
      'stage',
      'provisioning',
      'expectedProvisioningPackageDigestHex',
      'admissionStage',
      'populatedTrackerObservation',
      'duplicatePreventionObservation',
      'settlementVaultObservation',
      'stateContext',
      'anchorObservation',
    ], '--input settlement stage');
    return buildAuthenticatedV2SettlementStagePlan({
      provisioning,
      expectedProvisioningPackageDigestHex: value.expectedProvisioningPackageDigestHex as string,
      admissionStage: value.admissionStage as AuthenticatedV2AdmissionStagePlan,
      populatedTrackerObservation: value.populatedTrackerObservation as AuthenticatedV2ConfirmedBoxObservation,
      duplicatePreventionObservation: value.duplicatePreventionObservation as AuthenticatedV2ConfirmedBoxObservation,
      settlementVaultObservation: value.settlementVaultObservation as AuthenticatedV2ConfirmedBoxObservation,
      stateContext: value.stateContext as AuthenticatedV2FreshHeaderContext,
      anchorObservation: value.anchorObservation as AuthenticatedV2CanonicalAnchorObservation,
    });
  }
  throw new Error('--input stage must be admission or settlement');
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
  runAuthenticatedV2StageRebuildCli(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage.join('\n'));
    process.exitCode = 1;
  });
}
