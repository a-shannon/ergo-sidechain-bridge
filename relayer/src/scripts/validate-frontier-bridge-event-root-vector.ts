import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  FRONTIER_PEG_OUT_EVENT,
  FRONTIER_PEG_OUT_TOPIC,
  extractFrontierBridgeEventRoot,
  type FrontierBridgeEventRootInput,
} from '../frontier-bridge-event-root.js';

interface FrontierBridgeEventRootVector {
  schema: string;
  format: {
    pegOutEvent: string;
    pegOutTopic: string;
  };
  claimBoundary: {
    deterministicExtractionOnly: boolean;
    finalityProven: boolean;
    onChainAcceptanceProven: boolean;
    gate5Closed: boolean;
  };
  input: FrontierBridgeEventRootInput;
  expected: {
    burnCount: number;
    eventIndexes: number[];
    burnIdHexes: string[];
    recipientErgoTreeHashHexes: string[];
    leafHashHexes: string[];
    bridgeEventRootHex: string;
  };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const vectorPath = resolve(__dirname, '../../test-vectors/frontier-bridge-event-root-v1.json');
const vector = JSON.parse(readFileSync(vectorPath, 'utf8')) as FrontierBridgeEventRootVector;

if (vector.schema !== 'e2s.frontier-bridge-event-root.vector.v1') {
  throw new Error('unexpected Frontier bridge event root vector schema');
}
if (
  vector.format?.pegOutEvent !== FRONTIER_PEG_OUT_EVENT ||
  vector.format?.pegOutTopic !== FRONTIER_PEG_OUT_TOPIC
) {
  throw new Error('Frontier PegOut format binding drift');
}
if (
  vector.claimBoundary?.deterministicExtractionOnly !== true ||
  vector.claimBoundary?.finalityProven !== false ||
  vector.claimBoundary?.onChainAcceptanceProven !== false ||
  vector.claimBoundary?.gate5Closed !== false
) {
  throw new Error('Frontier bridge event root vector claim boundary is missing or unsafe');
}

const hasWrongAddressDecoy = vector.input.receipts.some(receipt =>
  receipt.logs?.some(log =>
    log.address?.toLowerCase() !== vector.input.bridgeAddress.toLowerCase() &&
    log.topics?.[0]?.toLowerCase() === FRONTIER_PEG_OUT_TOPIC,
  ),
);
const hasRevertedMatchingLog = vector.input.receipts.some(receipt =>
  !receiptSucceeded(receipt.status) && receipt.logs?.some(log =>
    log.address?.toLowerCase() === vector.input.bridgeAddress.toLowerCase() &&
    log.topics?.[0]?.toLowerCase() === FRONTIER_PEG_OUT_TOPIC,
  ),
);
if (!hasWrongAddressDecoy || !hasRevertedMatchingLog) {
  throw new Error('Frontier vector must include a wrong-address decoy and a status-0 matching log');
}

const extracted = extractFrontierBridgeEventRoot(vector.input);
if (!extracted.commitment) {
  throw new Error('Frontier vector must produce a non-empty bridge event root commitment');
}
if (extracted.burns.length !== 3 || extracted.burns.length % 2 !== 1) {
  throw new Error('Frontier vector must contain exactly 3 burns for odd-width Merkle coverage');
}

assertEqual('burnCount', extracted.burns.length, vector.expected.burnCount);
assertEqual(
  'eventIndexes',
  extracted.burns.map(burn => burn.eventIndex),
  vector.expected.eventIndexes,
);
assertEqual(
  'burnIdHexes',
  extracted.burns.map(burn => burn.burnIdHex),
  vector.expected.burnIdHexes,
);
assertEqual(
  'recipientErgoTreeHashHexes',
  extracted.burns.map(burn => burn.recipientErgoTreeHashHex),
  vector.expected.recipientErgoTreeHashHexes,
);
assertEqual(
  'leafHashHexes',
  extracted.commitment.leaves.map(leaf => leaf.leafHashHex),
  vector.expected.leafHashHexes,
);
assertEqual(
  'bridgeEventRootHex',
  extracted.commitment.bridgeEventRootHex,
  vector.expected.bridgeEventRootHex,
);

console.log('Frontier bridge event root vector: PASS');
console.log('Mode: read-only local vector validation.');
console.log(`Burn leaves: ${extracted.burns.length}`);
console.log(`Event indexes: ${extracted.burns.map(burn => burn.eventIndex).join(', ')}`);
console.log(`bridgeEventRootHex: ${extracted.commitment.bridgeEventRootHex}`);
console.log(
  'Boundary: this vector does not prove finality, does not prove on-chain acceptance, and does not prove Gate 5 closure.',
);

function receiptSucceeded(status: number | string | bigint | null | undefined): boolean {
  if (typeof status === 'number') return status === 1;
  if (typeof status === 'bigint') return status === 1n;
  if (typeof status !== 'string') return false;
  return status.toLowerCase() === '1' || status.toLowerCase() === '0x1';
}

function assertEqual(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} drift: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
