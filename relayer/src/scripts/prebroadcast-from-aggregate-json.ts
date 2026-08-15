import { existsSync, readFileSync } from 'fs';
import { basename } from 'path';

import {
  resolveAggregateSettlementEvidenceJsonPath,
} from '../aggregate-settlement-evidence.js';
import {
  buildTestnetPrebroadcastDryRunFieldSummary,
} from '../testnet-prebroadcast-from-aggregate-json.js';

const args = process.argv.slice(2);
const usageText =
  'Usage: npm run prebroadcast:from-json -- <aggregate-evidence.json> [--link-target <local-relative-json-link>] [--peg-in <32-byte-peg-in-id-plus-evidence-target>]';

if (args.length === 0) {
  console.error(usageText);
  process.exit(1);
}

const jsonPath = args[0];
let aggregateJsonLinkTarget = basename(jsonPath.replace(/\\/g, '/'));
let pegInEventIdOrTxId: string | undefined;

try {
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--link-target') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--link-target requires a local relative JSON link target');
      }
      aggregateJsonLinkTarget = value;
      index += 1;
      continue;
    }
    if (arg === '--peg-in') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--peg-in requires the peg-in value plus evidence target');
      }
      pegInEventIdOrTxId = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown option: ${arg}`);
  }
} catch (error: any) {
  console.error(error?.message ?? String(error));
  console.error(usageText);
  process.exit(1);
}

const readPathTarget = resolveAggregateSettlementEvidenceJsonPath(jsonPath);
const readPathLabel = readPathTarget.label;
if (readPathTarget.errors.length > 0) {
  console.error(`${readPathLabel}: aggregate evidence JSON input BLOCKED: ${readPathTarget.errors.length} structural issue(s).`);
  for (const error of readPathTarget.errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}
if (!readPathTarget.path || !existsSync(readPathTarget.path)) {
  console.error(`${readPathLabel}: aggregate evidence JSON input could not be read in read-only mode.`);
  process.exit(1);
}

let record: unknown;
try {
  record = JSON.parse(readFileSync(readPathTarget.path!, 'utf8'));
} catch {
  console.error(`${readPathLabel}: aggregate evidence JSON input could not be read or parsed.`);
  process.exit(1);
}
const summary = buildTestnetPrebroadcastDryRunFieldSummary({
  record,
  aggregateJsonLinkTarget,
  pegInEventIdOrTxId,
});

console.log(summary.lines.join('\n'));
