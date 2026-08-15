import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

import { writeOfflineReportJson } from '../offline-report-json.js';
import {
  assessPegInRouteObservation,
  PegInRouteObservationBlockedError,
} from '../peg-in-route-observation.js';
import { parsePegInRouteManifestSource } from '../peg-in-route-manifest.js';
import { PegInRouteReadOnlyNodeClient } from '../peg-in-route-read-only-node-client.js';

interface CliArgs {
  manifestPath?: string;
  expectedManifestSha256Hex?: string;
  mainChainLockSourcePath?: string;
  settlementVaultSourcePath?: string;
  primaryNodeUrl?: string;
  witnessNodeUrl?: string;
  jsonOut?: string;
  help: boolean;
}

const VALUE_OPTIONS = [
  '--manifest',
  '--expected-manifest-sha256',
  '--main-chain-lock-source',
  '--settlement-vault-source',
  '--primary-node-url',
  '--witness-node-url',
  '--json-out',
] as const;

export function parsePegInRouteObserveArgs(argv: string[]): CliArgs {
  const parsed: CliArgs = { help: false };
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--help' || option === '-h') {
      parsed.help = true;
      continue;
    }
    if (!VALUE_OPTIONS.includes(option as typeof VALUE_OPTIONS[number])) {
      throw new Error(`Unknown argument: ${option}`);
    }
    if (seen.has(option)) throw new Error(`${option} may be provided only once`);
    seen.add(option);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
    index += 1;
    if (option === '--manifest') parsed.manifestPath = value;
    else if (option === '--expected-manifest-sha256') {
      parsed.expectedManifestSha256Hex = value;
    } else if (option === '--main-chain-lock-source') {
      parsed.mainChainLockSourcePath = value;
    } else if (option === '--settlement-vault-source') {
      parsed.settlementVaultSourcePath = value;
    } else if (option === '--primary-node-url') parsed.primaryNodeUrl = value;
    else if (option === '--witness-node-url') parsed.witnessNodeUrl = value;
    else parsed.jsonOut = value;
  }
  if (!parsed.help) {
    if (!parsed.manifestPath) throw new Error('--manifest is required');
    if (!parsed.expectedManifestSha256Hex) {
      throw new Error('--expected-manifest-sha256 is required');
    }
    if (!parsed.mainChainLockSourcePath) throw new Error('--main-chain-lock-source is required');
    if (!parsed.settlementVaultSourcePath) {
      throw new Error('--settlement-vault-source is required');
    }
    if (!parsed.primaryNodeUrl) throw new Error('--primary-node-url is required');
    if (!parsed.witnessNodeUrl) throw new Error('--witness-node-url is required');
    if (!parsed.jsonOut) throw new Error('--json-out is required');
  }
  return parsed;
}

const USAGE = [
  'Usage:',
  '  npm run pegin:route-observe -- --manifest <manifest.json> --expected-manifest-sha256 <64-lowercase-hex> --main-chain-lock-source <MainChainLock.es> --settlement-vault-source <MainChainAggregateUnlockTrustless.es> --primary-node-url <explicit-origin> --witness-node-url <distinct-origin> --json-out <new-report.json>',
  '',
  'This command never loads deployment state, runtime databases, signer material, or broadcast configuration.',
  'Its only POST operations are bounded address-index reads and deterministic P2S compilation.',
  'A successful report is non-authorizing and does not authenticate manifest review, source independence, routing activation, EVM mint timing, or cutover approval.',
];

export async function runPegInRouteObserveCli(argv: string[]): Promise<number> {
  const args = parsePegInRouteObserveArgs(argv);
  if (args.help) {
    process.stdout.write(`${USAGE.join('\n')}\n`);
    return 0;
  }
  const manifest = parsePegInRouteManifestSource(readFileSync(args.manifestPath!, 'utf8'));
  const templateSource = readFileSync(args.mainChainLockSourcePath!, 'utf8');
  const settlementVaultTemplateSource = readFileSync(
    args.settlementVaultSourcePath!,
    'utf8',
  );
  const report = await assessPegInRouteObservation({
    manifest,
    expectedManifestSha256Hex: args.expectedManifestSha256Hex!,
    mainChainLockTemplateSource: templateSource,
    settlementVaultTemplateSource,
    primarySource: new PegInRouteReadOnlyNodeClient(args.primaryNodeUrl!),
    witnessSource: new PegInRouteReadOnlyNodeClient(args.witnessNodeUrl!),
  });
  const writeResult = writeOfflineReportJson(args.jsonOut!, report);
  if (writeResult.errors.length > 0) throw new Error(writeResult.errors.join('; '));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.decision.observationConditionMet ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runPegInRouteObserveCli(process.argv.slice(2))
    .then(exitCode => {
      process.exitCode = exitCode;
    })
    .catch(error => {
      if (error instanceof PegInRouteObservationBlockedError) {
        console.error(`[${error.classification}] ${error.message}`);
      } else {
        console.error(error instanceof Error ? error.message : String(error));
      }
      console.error(USAGE.join('\n'));
      process.exitCode = 1;
    });
}
