import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

import { AuthenticatedV2VaultReadOnlyNodeClient } from '../authenticated-v2-vault-read-only-node-client.js';
import {
  assessLegacyMcuCutover,
  LegacyMcuCutoverBlockedError,
  type LegacyMcuCutoverSource,
} from '../legacy-mcu-cutover.js';
import { parseLegacyMcuCutoverManifestSource } from '../legacy-mcu-cutover-manifest.js';
import { writeOfflineReportJson } from '../offline-report-json.js';

interface CliArgs {
  manifestPath?: string;
  expectedManifestSha256Hex?: string;
  primaryNodeUrl?: string;
  witnessNodeUrl?: string;
  jsonOut?: string;
  help: boolean;
}

export function parseLegacyMcuCutoverArgs(argv: string[]): CliArgs {
  const parsed: CliArgs = { help: false };
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--help' || option === '-h') {
      parsed.help = true;
      continue;
    }
    if (![
      '--manifest',
      '--expected-manifest-sha256',
      '--primary-node-url',
      '--witness-node-url',
      '--json-out',
    ].includes(option)) {
      throw new Error(`Unknown argument: ${option}`);
    }
    if (seen.has(option)) throw new Error(`${option} may be provided only once`);
    seen.add(option);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
    index += 1;
    if (option === '--manifest') parsed.manifestPath = value;
    else if (option === '--expected-manifest-sha256') parsed.expectedManifestSha256Hex = value;
    else if (option === '--primary-node-url') parsed.primaryNodeUrl = value;
    else if (option === '--witness-node-url') parsed.witnessNodeUrl = value;
    else parsed.jsonOut = value;
  }
  if (!parsed.help) {
    if (!parsed.manifestPath) throw new Error('--manifest is required');
    if (!parsed.expectedManifestSha256Hex) {
      throw new Error('--expected-manifest-sha256 is required');
    }
    if (!parsed.primaryNodeUrl) throw new Error('--primary-node-url is required');
    if (!parsed.witnessNodeUrl) throw new Error('--witness-node-url is required');
    if (!parsed.jsonOut) throw new Error('--json-out is required');
  }
  return parsed;
}

const USAGE = [
  'Usage:',
  '  npm run cutover:legacy-mcu-assess -- --manifest <manifest.json> --expected-manifest-sha256 <64-lowercase-hex> --primary-node-url <explicit-origin> --witness-node-url <distinct-origin> --json-out <new-report.json>',
  '',
  'This command is read-only. It never loads deployment state, runtime databases, signer material, or broadcast configuration.',
  'A successful run emits a non-authorizing two-origin observation under the exact expected manifest.',
  'It does not authenticate manifest review, source independence, or a cutover decision.',
];

export async function runLegacyMcuCutoverAssessCli(argv: string[]): Promise<number> {
  const args = parseLegacyMcuCutoverArgs(argv);
  if (args.help) {
    process.stdout.write(`${USAGE.join('\n')}\n`);
    return 0;
  }

  const manifest = parseLegacyMcuCutoverManifestSource(
    readFileSync(args.manifestPath!, 'utf8'),
  );
  const source = (nodeUrl: string): LegacyMcuCutoverSource => {
    const node = new AuthenticatedV2VaultReadOnlyNodeClient(nodeUrl);
    return {
      observationSourceId: node.observationSourceId,
      getInfo: node.getInfo.bind(node),
      getIndexedHeight: node.getIndexedHeight.bind(node),
      getBestHeader: node.getBestHeader.bind(node),
      getBlockHeaderIdsAtHeight: node.getBlockHeaderIdsAtHeight.bind(node),
      getUnspentBoxesByAddress: node.getUnspentBoxesByAddress.bind(node),
      getCurrentHeight: async (): Promise<number> => {
        throw new Error('manifest-bound observation assessment forbids standalone height reads');
      },
    };
  };
  const report = await assessLegacyMcuCutover({
    manifest,
    expectedManifestSha256Hex: args.expectedManifestSha256Hex!,
    primarySource: source(args.primaryNodeUrl!),
    witnessSource: source(args.witnessNodeUrl!),
  });
  const writeResult = writeOfflineReportJson(args.jsonOut!, report);
  if (writeResult.errors.length > 0) throw new Error(writeResult.errors.join('; '));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.decision.observationConditionMet ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runLegacyMcuCutoverAssessCli(process.argv.slice(2))
    .then(exitCode => {
      process.exitCode = exitCode;
    })
    .catch(error => {
      if (error instanceof LegacyMcuCutoverBlockedError) {
        console.error(`[${error.classification}] ${error.message}`);
      } else {
        console.error(error instanceof Error ? error.message : String(error));
      }
      console.error(USAGE.join('\n'));
      process.exitCode = 1;
    });
}
