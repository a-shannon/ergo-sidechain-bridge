import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import {
  SPV_TRACKER_DOMAIN,
  SPV_TRACKER_KEY_LENGTH,
  SPV_TRACKER_VALUE_LENGTH,
  buildSpvTrackerGetProof,
  buildSpvTrackerInsertProof,
  decodeSpvTrackerValue,
  deriveSpvTrackerKey,
  encodeSpvTrackerAvlRegister,
  encodeSpvTrackerValue,
  getEmptySpvTrackerDigest,
  getSpvTrackerDigest,
  type SpvTrackerEntry,
  type SpvTrackerHistoryEntry,
} from '../spv-tracker.js';

const PUBLIC_BOUNDARY_FLAG = '--public-boundary';
const COMMAND_LABEL = 'npm run trustless:spv-tracker-boundary --';

type Check = {
  name: string;
  pass: boolean;
  detail: string;
};

type CliArgs = {
  publicBoundary: boolean;
  out?: string;
};

const SAMPLE_ENTRY: SpvTrackerEntry = {
  sidechainIdHex: '11'.repeat(32),
  sidechainHeight: 12345,
  sidechainHeaderHashHex: '22'.repeat(32),
  bridgeEventRootHex: '33'.repeat(32),
  ergoAnchorHeight: 987654,
};

const MISSING_ENTRY = {
  ...SAMPLE_ENTRY,
  sidechainHeaderHashHex: '44'.repeat(32),
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { publicBoundary: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: npm run trustless:spv-tracker-boundary -- --public-boundary [--out <report.md>]',
        '',
        'Runs a bounded SPV tracker key/value/proof prerequisite report.',
        '--public-boundary uses deterministic in-memory sample data only.',
      ].join('\n'));
      process.exit(0);
    }
    if (arg === PUBLIC_BOUNDARY_FLAG) {
      args.publicBoundary = true;
      continue;
    }
    if (arg === '--out') {
      const value = argv[index + 1];
      if (!value) throw new Error('--out requires a report path');
      args.out = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function commandLabel(args: CliArgs): string {
  const parts = [COMMAND_LABEL];
  if (args.publicBoundary) parts.push(PUBLIC_BOUNDARY_FLAG);
  if (args.out) parts.push('--out <report.md>');
  return parts.join(' ');
}

function shortHex(hex: string): string {
  return `${hex.slice(0, 16)}...${hex.slice(-16)} (${hex.length / 2} bytes)`;
}

function expectThrows(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

function runSpvTrackerSimulation(): Check[] {
  const expectedKeyHex = deriveSpvTrackerKey(SAMPLE_ENTRY);
  const expectedValueHex = encodeSpvTrackerValue(SAMPLE_ENTRY);
  const decodedValue = decodeSpvTrackerValue(expectedValueHex);
  const emptyDigestHex = getEmptySpvTrackerDigest();
  const insertProof = buildSpvTrackerInsertProof([], SAMPLE_ENTRY);
  const history: SpvTrackerHistoryEntry[] = [{
    key: insertProof.keyHex,
    value: insertProof.valueHex,
  }];
  const getProof = buildSpvTrackerGetProof(history, SAMPLE_ENTRY);
  const historyDigestHex = getSpvTrackerDigest(history);
  const successorRegister = encodeSpvTrackerAvlRegister(insertProof.newDigestHex);
  const missingIdentityRejected = expectThrows(() => buildSpvTrackerGetProof(history, MISSING_ENTRY));

  return [
    {
      name: 'SPV tracker domain and fixed sizes are exposed',
      pass: SPV_TRACKER_DOMAIN === 'E2S_SPV_V1' &&
        SPV_TRACKER_KEY_LENGTH === 32 &&
        SPV_TRACKER_VALUE_LENGTH === 36,
      detail: `domain=${SPV_TRACKER_DOMAIN} keyBytes=${SPV_TRACKER_KEY_LENGTH} valueBytes=${SPV_TRACKER_VALUE_LENGTH}`,
    },
    {
      name: 'Tracker key derives from sidechain identity fields',
      pass: insertProof.keyHex === expectedKeyHex &&
        /^[0-9a-f]{64}$/.test(insertProof.keyHex),
      detail: `key=${shortHex(insertProof.keyHex)}`,
    },
    {
      name: 'Tracker value decodes to bridgeEventRoot and Ergo anchor height',
      pass: insertProof.valueHex === expectedValueHex &&
        decodedValue.bridgeEventRootHex === SAMPLE_ENTRY.bridgeEventRootHex &&
        decodedValue.ergoAnchorHeight === SAMPLE_ENTRY.ergoAnchorHeight,
      detail: `value=${shortHex(insertProof.valueHex)} anchorHeight=${decodedValue.ergoAnchorHeight}`,
    },
    {
      name: 'Insert proof advances the empty SPV tracker AVL digest',
      pass: /^[0-9a-f]{66}$/.test(emptyDigestHex) &&
        /^[0-9a-f]{66}$/.test(insertProof.newDigestHex) &&
        insertProof.newDigestHex !== emptyDigestHex &&
        insertProof.insertProofHex.length > 0,
      detail: `emptyDigest=${shortHex(emptyDigestHex)} newDigest=${shortHex(insertProof.newDigestHex)} insertProofBytes=${insertProof.insertProofHex.length / 2}`,
    },
    {
      name: 'Get proof returns the inserted tracker value',
      pass: getProof.keyHex === insertProof.keyHex &&
        getProof.valueHex === insertProof.valueHex &&
        getProof.getProofHex.length > 0,
      detail: `digest=${shortHex(getProof.digestHex)} getProofBytes=${getProof.getProofHex.length / 2}`,
    },
    {
      name: 'History digest matches insert and get proof digests',
      pass: historyDigestHex === insertProof.newDigestHex &&
        getProof.digestHex === insertProof.newDigestHex,
      detail: `historyDigest=${shortHex(historyDigestHex)}`,
    },
    {
      name: 'AVL register can encode the successor digest',
      pass: successorRegister.length > 0,
      detail: `registerBytes=${successorRegister.length / 2}`,
    },
    {
      name: 'Missing sidechain identity is rejected by proof lookup',
      pass: missingIdentityRejected,
      detail: 'wrong header hash does not return the sample tracker value',
    },
  ];
}

function formatBoundaryReport(args: CliArgs, checks: Check[]): string {
  const allPass = checks.every(check => check.pass);
  return [
    '# Gate 5 SPV Tracker Public Boundary Report',
    '',
    'This report records an offline SPV tracker key/value/proof-shape simulation only.',
    'This is prerequisite evidence only. It does not prove live SPV relay operation,',
    'mined-block anchoring, on-chain proof acceptance, Gate 5 closure, settlement',
    'readiness, broadcast authorization, or production-ready, mainnet, or testnet',
    'production-candidate claims.',
    '',
    '## Command Result',
    '',
    '| Field | Value |',
    '|---|---|',
    `| Command | ${commandLabel(args)} |`,
    `| Result | ${allPass ? 'BOUNDARY_ONLY' : 'BLOCKED'} |`,
    '| Exit code | 0 |',
    '',
    '## Simulation Checks',
    '',
    '| Check | Result | Detail |',
    '|---|---|---|',
    ...checks.map(check =>
      `| ${check.name} | ${check.pass ? 'PASS' : 'FAIL'} | ${check.detail} |`,
    ),
    '',
    '## Boundary',
    '',
    '| Boundary | Value |',
    '|---|---|',
    '| SPV tracker key/value/proof shape checked | yes |',
    '| Local source checkout read | no |',
    '| Runtime database opened | no |',
    '| Deployment state opened | no |',
    '| Secret or environment file read | no |',
    '| Node, RPC, or explorer request performed | no |',
    '| Transaction broadcast, submit, deploy, or state mutation performed | no |',
    '| SPV relay or tracker evidence completed | no |',
    '| On-chain proof acceptance evidence completed | no |',
    '| Gate 5 closure allowed | no |',
    '| Production-ready claim allowed | no |',
    '| Mainnet deployment claim allowed | no |',
    '| Testnet production-candidate claim allowed | no |',
    '',
  ].join('\n');
}

function writeBoundaryReport(out: string | undefined, markdown: string): void {
  if (!out) return;
  const resolved = resolveEvidenceOutputPath(out);
  if (resolved.errors.length > 0 || !resolved.path) {
    for (const error of resolved.errors) console.error(error);
    process.exit(1);
  }
  mkdirSync(dirname(resolved.path), { recursive: true });
  writeFileSync(resolved.path, markdown, { encoding: 'utf8', flag: 'wx' });
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!args.publicBoundary) {
    throw new Error('--public-boundary is required for this prerequisite evidence command');
  }

  const checks = runSpvTrackerSimulation();
  const markdown = formatBoundaryReport(args, checks);
  console.log(markdown);
  writeBoundaryReport(args.out, markdown);
  if (!checks.every(check => check.pass)) process.exit(1);
}

main();
