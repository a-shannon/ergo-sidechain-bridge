import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js';
import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import { computeDeployedStateHash, ERGO_CONFIG, loadDeployedState, SUBSTRATE_CONFIG } from '../config.js';
import { ErgoClient } from '../ergo-client.js';
import {
  createReadOnlyEvmHeightClient,
  validateReadOnlyEvmRpcUrl,
} from '../read-only-evm-height-client.js';
import {
  buildFreshTestnetCheckpoint,
  collectFreshTestnetAnchorObservations,
  collectFreshTestnetHeightEvidence,
  collectFreshTestnetSingletonCheckpoint,
  readFreshTestnetAggregateEvidenceRecord,
  readFreshTestnetAggregateExpectedTxId,
  readFreshTestnetHeightEvidenceJson,
  readFreshTestnetSingletonCheckpointJson,
  validateFreshCheckpointBroadcastDisabled,
  validateFreshCheckpointReadOnlyNodeUrl,
  type FreshTestnetHeightEvidenceSource,
  type FreshTestnetSingletonCheckpointSource,
} from '../testnet-fresh-checkpoint.js';

interface CliArgs {
  aggregateEvidence?: string;
  singletonCheckpoint?: string;
  heightEvidence?: string;
  currentDeployedStateHash?: string;
  nodeUrl?: string;
  currentErgoHeight?: string;
  currentSidechainHeight?: string;
  ergoNodeNetwork?: string;
  sidechainNetwork?: string;
  autoHeights: boolean;
  out?: string;
  jsonOut?: string;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { autoHeights: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--aggregate-evidence') {
      args.aggregateEvidence = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--singleton-checkpoint') {
      args.singletonCheckpoint = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--height-evidence') {
      args.heightEvidence = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--current-deployed-state-hash') {
      args.currentDeployedStateHash = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--node-url') {
      args.nodeUrl = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--ergo-node-network') {
      args.ergoNodeNetwork = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--current-ergo-height') {
      args.currentErgoHeight = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--current-sidechain-height') {
      args.currentSidechainHeight = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--sidechain-network') {
      args.sidechainNetwork = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--auto-heights') {
      args.autoHeights = true;
      continue;
    }
    if (arg === '--out') {
      args.out = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--json-out') {
      args.jsonOut = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
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

function usage(): void {
  console.error([
    'Usage:',
    '  npm run rehearsal:fresh-testnet-check -- --aggregate-evidence <aggregate-check.json> (--auto-heights | --height-evidence <height-evidence.json> --current-ergo-height <height> --current-sidechain-height <height>) --ergo-node-network testnet --sidechain-network <patched-devnet|testnet|non-mainnet> [--node-url <http://...>] [--singleton-checkpoint <singleton-checkpoint.json> --current-deployed-state-hash <64hex>] [--out <checkpoint.md>] [--json-out <checkpoint.json>]',
    '',
    'This command only assembles an offline non-broadcast checkpoint from an aggregate /transactions/check JSON report, read-only height evidence, read-only singleton observations, and read-only 0x0401 anchor observations at each aggregate Ergo anchor height. Live collection uses read-only/no-auth node clients for /info, getBlockNumber, singleton boxes, mempool/unconfirmed transactions, confirmed transaction lookup, and extension fields at aggregate anchor heights. Explicit height mode requires a concrete non-template height evidence JSON whose observed heights match --current-ergo-height and --current-sidechain-height. Supplying --singleton-checkpoint requires the sanitized --current-deployed-state-hash binding and avoids reading local deployed_state.json; omitting --singleton-checkpoint collects singleton observations from local deployed_state.json. Height, singleton, and anchor observation observedAt values must be ISO UTC timestamps no older than 15 minutes, anchor nodeHeight must match Current Ergo height, and the report includes computed ageSeconds/maxAgeSeconds freshness evidence. It never signs, submits, confirms, reconciles, mutates nodes, or broadcasts transactions.',
  ].join('\n'));
}

let args: CliArgs;
try {
  args = parseArgs(process.argv.slice(2));
} catch (err: any) {
  console.error(err?.message ?? String(err));
  usage();
  process.exit(1);
}

if (
  args.help ||
  !args.aggregateEvidence ||
  (!args.autoHeights && (!args.heightEvidence || !args.currentErgoHeight || !args.currentSidechainHeight)) ||
  !args.ergoNodeNetwork ||
  !args.sidechainNetwork
) {
  usage();
  process.exit(args.help ? 0 : 1);
}

if (args.autoHeights && args.heightEvidence) {
  console.error('--auto-heights and --height-evidence are mutually exclusive');
  usage();
  process.exit(1);
}
if (args.singletonCheckpoint && !args.currentDeployedStateHash) {
  console.error('--current-deployed-state-hash is required when --singleton-checkpoint is provided');
  usage();
  process.exit(1);
}
if (args.currentDeployedStateHash && !/^[0-9a-f]{64}$/i.test(args.currentDeployedStateHash)) {
  console.error('--current-deployed-state-hash must be a 32-byte hex digest');
  process.exit(1);
}

const broadcastErrors = validateFreshCheckpointBroadcastDisabled();
if (broadcastErrors.length > 0) {
  for (const error of broadcastErrors) console.error(error);
  process.exit(1);
}
const nodeUrlErrors = validateFreshCheckpointReadOnlyNodeUrl(args.nodeUrl);
if (nodeUrlErrors.length > 0) {
  for (const error of nodeUrlErrors) console.error(error);
  process.exit(1);
}
const sidechainRpcUrlErrors = validateReadOnlyEvmRpcUrl(SUBSTRATE_CONFIG.evmRpcUrl);
if (sidechainRpcUrlErrors.length > 0) {
  for (const error of sidechainRpcUrlErrors) console.error(error);
  process.exit(1);
}

const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;
if (outputTarget?.errors.length) {
  for (const error of outputTarget.errors) console.error(error);
  process.exit(1);
}
const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;
if (jsonOutputTarget?.errors.length) {
  for (const error of jsonOutputTarget.errors) console.error(error);
  process.exit(1);
}

const ergoNodeUrl = args.nodeUrl ?? ERGO_CONFIG.nodeUrl;
const sidechainRpcUrl = SUBSTRATE_CONFIG.evmRpcUrl;
const readOnlyErgo = new ErgoClient(ergoNodeUrl, { readOnly: true });
let heightEvidence: Awaited<ReturnType<typeof collectFreshTestnetHeightEvidence>> | undefined;
let heightEvidenceSource: FreshTestnetHeightEvidenceSource | undefined;
if (args.autoHeights) {
  heightEvidence = await collectFreshTestnetHeightEvidence({
    ergo: readOnlyErgo,
    sidechain: createReadOnlyEvmHeightClient(sidechainRpcUrl),
  });
  args.currentErgoHeight = String(heightEvidence.ergoNodeHeight);
  args.currentSidechainHeight = String(heightEvidence.sidechainBlockHeight);
  heightEvidenceSource = {
    mode: 'live-read-only-sources',
    ergoNodeUrl,
    sidechainRpcUrl,
  };
} else if (args.heightEvidence) {
  const heightRead = readFreshTestnetHeightEvidenceJson(args.heightEvidence);
  if (heightRead.errors.length > 0 || !heightRead.heightEvidence) {
    for (const error of heightRead.errors) console.error(error);
    process.exit(1);
  }
  heightEvidence = heightRead.heightEvidence;
  heightEvidenceSource = {
    mode: 'provided-json',
    target: heightRead.targetLabel,
  };
}

const aggregateRead = readFreshTestnetAggregateEvidenceRecord(args.aggregateEvidence);
if (aggregateRead.errors.length > 0 || !aggregateRead.record) {
  for (const error of aggregateRead.errors) console.error(error);
  process.exit(1);
}
const anchorObservations = await collectFreshTestnetAnchorObservations({
  ergo: readOnlyErgo,
  aggregateEvidence: aggregateRead.record,
});

let singletonCheckpoint: any;
let singletonCheckpointSource: FreshTestnetSingletonCheckpointSource;
let deployedState: ReturnType<typeof loadDeployedState> | undefined;
let deployedStateHash = args.currentDeployedStateHash;
if (args.singletonCheckpoint) {
  const singletonRead = readFreshTestnetSingletonCheckpointJson(args.singletonCheckpoint);
  if (singletonRead.errors.length > 0 || !singletonRead.checkpoint) {
    for (const error of singletonRead.errors) console.error(error);
    process.exit(1);
  }
  singletonCheckpoint = singletonRead.checkpoint;
  singletonCheckpointSource = {
    mode: 'provided-json',
    target: singletonRead.targetLabel,
  };
} else {
  deployedState = loadDeployedState();
  const computedDeployedStateHash = computeDeployedStateHash();
  if (
    deployedStateHash &&
    deployedStateHash.toLowerCase() !== computedDeployedStateHash.toLowerCase()
  ) {
    console.error('--current-deployed-state-hash must match computed deployed_state.json hash when collecting live singleton observations');
    process.exit(1);
  }
  deployedStateHash = computedDeployedStateHash;
  const expected = readFreshTestnetAggregateExpectedTxId(args.aggregateEvidence);
  if (expected.errors.length > 0 || !expected.expectedTxId) {
    for (const error of expected.errors) console.error(error);
    process.exit(1);
  }
  singletonCheckpoint = await collectFreshTestnetSingletonCheckpoint({
    ergo: readOnlyErgo,
    deployedState,
    deployedStateHash,
    expectedTxId: expected.expectedTxId,
  });
  singletonCheckpointSource = { mode: 'live-read-only-node', ergoNodeUrl };
}

const report = buildFreshTestnetCheckpoint({
  aggregateEvidence: args.aggregateEvidence,
  currentErgoHeight: args.currentErgoHeight!,
  currentSidechainHeight: args.currentSidechainHeight!,
  ergoNodeNetwork: args.ergoNodeNetwork,
  sidechainNetwork: args.sidechainNetwork,
  deployedState,
  deployedStateHash,
  singletonCheckpoint,
  singletonCheckpointSource,
  anchorObservationSource: { mode: 'live-read-only-node', ergoNodeUrl },
  anchorObservations,
  heightEvidence,
  heightEvidenceSource,
});

for (const line of report.lines) console.log(line);
if (args.jsonOut) {
  const output = writeOfflineReportJson(args.jsonOut, {
    schemaVersion: 1,
    ...report,
  });
  if (output.errors.length > 0) {
    for (const error of output.errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log(formatOfflineReportJsonWriteLine('fresh testnet checkpoint report', args.jsonOut));
  }
}

if (report.status === 'BLOCKED') {
  process.exitCode = 1;
} else if (args.out && report.markdown) {
  const outputPath = outputTarget!.path!;
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${report.markdown.trimEnd()}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  console.log(`- fresh testnet checkpoint written: ${args.out}`);
} else if (report.markdown) {
  console.log('');
  console.log(report.markdown.trimEnd());
}
