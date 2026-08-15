import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AuthenticatedV2VaultChainSource } from '../authenticated-v2-vault-reconstruction.js';
import { AuthenticatedV2VaultReadOnlyNodeClient } from '../authenticated-v2-vault-read-only-node-client.js';
import {
  resolveProvisioningOutputPath,
  resolveProvisioningRepositoryInputPath,
} from '../authenticated-v2-sanitized-io.js';
import { parseStrictJson } from '../strict-json.js';
import {
  assertValidityApplicationPooledReserveErgoCutoverObservationV4Provenance,
  observeValidityApplicationPooledReserveErgoCutoverV4,
  validateValidityApplicationPooledReserveErgoCutoverObservationV4Report,
} from '../validity-application-pooled-reserve-ergo-cutover-observation-v4.js';
import {
  buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4,
  type BuildValidityApplicationPooledReserveErgoLegacyRouteProfileV4Input,
} from '../validity-application-pooled-reserve-ergo-legacy-route-profile-v4.js';

export interface ErgoCutoverObservationCliArgs {
  profile?: string;
  expectedProfileDigest?: string;
  primaryNodeUrl?: string;
  witnessNodeUrl?: string;
  out?: string;
  help: boolean;
  errors: string[];
}

interface CliOptions {
  cwd?: string;
  bridgeRoot?: string;
  createSource?: (origin: string) => AuthenticatedV2VaultChainSource;
  now?: () => Date;
}

const valueOptions = [
  '--profile',
  '--expected-profile-digest',
  '--primary-node-url',
  '--witness-node-url',
  '--out',
] as const;

const usage = [
  'Usage: npm run p1:ergo-cutover:observe -- --profile <repository-local-profile-input.json> --expected-profile-digest <64-lowercase-hex> --primary-node-url <origin> --witness-node-url <distinct-origin> --out <new-report.json>',
  'Rebuilds one explicit non-mainnet route profile in process, reconstructs every profiled historical DUP lineage, and joins them to the exact two-source Ergo route inventory while applying one aggregate pair of budget hooks and requiring one stable snapshot.',
  'Address history uses bounded read-only node operations; HTTP POST on node index routes does not grant transaction, wallet, signing, check, submission, deployment, or broadcast capability.',
  'The orchestrator reads no bridge configuration, environment credentials, deployment state, or runtime database. Source-identity digests are pseudonymous and may be dictionary-recoverable, so the raw report stays local/private and requires a separately reviewed redacted export before publication.',
  'The result does not authenticate source independence, Ergo consensus, profile review, deployment lineage, event mappings, source admission, replay genesis, retirement, activation, funds authority, Gate 5 closure, trustless status, or production readiness.',
];

export async function runErgoCutoverObservationCli(
  argv: string[],
  options: CliOptions = {},
): Promise<void> {
  const args = parseErgoCutoverObservationArgs(argv);
  if (args.help) {
    console.log(usage.join('\n'));
    return;
  }
  if (args.errors.length > 0) throw new Error(args.errors.join('\n'));

  const cwd = resolve(options.cwd ?? process.cwd());
  const bridgeRoot = options.bridgeRoot;
  const profilePath = resolveProvisioningRepositoryInputPath(
    requireArg(args.profile, '--profile'),
    { cwd, bridgeRoot },
  );
  const outputPath = resolveProvisioningOutputPath(
    requireArg(args.out, '--out'),
    { cwd, bridgeRoot },
  );
  const profileInput = parseStrictJson(
    readFileSync(profilePath, 'utf8'),
    'Ergo cutover route profile input',
  ) as BuildValidityApplicationPooledReserveErgoLegacyRouteProfileV4Input;
  const profile = buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(
    profileInput,
  );
  if (profile.network.networkId !== 'ergo-testnet') {
    throw new Error('Ergo cutover observation accepts only a non-mainnet profile');
  }
  const expectedProfileDigestHex = requireArg(
    args.expectedProfileDigest,
    '--expected-profile-digest',
  );
  if (!/^[0-9a-f]{64}$/.test(expectedProfileDigestHex)) {
    throw new Error('--expected-profile-digest must be 32 bytes of lowercase hex');
  }
  if (profile.profileDigestHex !== expectedProfileDigestHex) {
    throw new Error('Ergo cutover profile digest differs from the explicit expected digest');
  }

  const createSource = options.createSource
    ?? ((origin: string) => new AuthenticatedV2VaultReadOnlyNodeClient(origin));
  const report = await observeValidityApplicationPooledReserveErgoCutoverV4({
    profile,
    expectedProfileDigestHex,
    primarySource: createSource(requireArg(args.primaryNodeUrl, '--primary-node-url')),
    witnessSource: createSource(requireArg(args.witnessNodeUrl, '--witness-node-url')),
    ...(options.now === undefined ? {} : { observedAt: options.now }),
  });
  assertValidityApplicationPooledReserveErgoCutoverObservationV4Provenance(report);
  validateValidityApplicationPooledReserveErgoCutoverObservationV4Report(report);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  console.log(`Ergo cutover observation written: ${relative(cwd, outputPath)}`);
  console.log(`Profile digest: ${report.profile.profileDigestHex}`);
  console.log(`Stable Ergo snapshot: ${report.observation.stableSnapshot.bestHeader.height} ${report.observation.stableSnapshot.bestHeader.idHex}`);
  console.log(`Historical DUP lineages: ${report.summary.historicalDupLineageCount}`);
  console.log(`Report digest: ${report.reportDigestHex}`);
  console.log('Boundary: blocking read-only observation only; no route retirement, activation, funds authority, Gate 5 closure, trustless status, or production readiness follows.');
}

export function parseErgoCutoverObservationArgs(
  argv: string[],
): ErgoCutoverObservationCliArgs {
  const result: ErgoCutoverObservationCliArgs = {
    help: false,
    errors: [],
  };
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
    if (argument === '--profile') result.profile = value;
    else if (argument === '--expected-profile-digest') {
      result.expectedProfileDigest = value;
    } else if (argument === '--primary-node-url') result.primaryNodeUrl = value;
    else if (argument === '--witness-node-url') result.witnessNodeUrl = value;
    else result.out = value;
  }
  if (!result.help) {
    if (!result.profile) result.errors.push('--profile is required');
    if (!result.expectedProfileDigest) {
      result.errors.push('--expected-profile-digest is required');
    }
    if (!result.primaryNodeUrl) result.errors.push('--primary-node-url is required');
    if (!result.witnessNodeUrl) result.errors.push('--witness-node-url is required');
    if (!result.out) result.errors.push('--out is required');
  }
  return result;
}

function requireArg(value: string | undefined, optionName: string): string {
  if (!value) throw new Error(`${optionName} is required`);
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runErgoCutoverObservationCli(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage.join('\n'));
    process.exitCode = 1;
  });
}
