import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  buildSubstrateFederatedSettlementFamilyV1CompilerFixture,
} from '../substrate-federated-settlement-family-v1-fixture.js';

const output = parseOutput(process.argv.slice(2));
const fixture =
  buildSubstrateFederatedSettlementFamilyV1CompilerFixture();
const bytes = Buffer.from(`${JSON.stringify(fixture, null, 2)}\n`, 'ascii');
if (
  bytes.length === 0
  || bytes.includes(13)
  || bytes.some(byte => byte > 0x7f)
) {
  throw new Error('federated settlement compiler fixture must be LF-only ASCII JSON');
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, bytes, { flag: 'wx' });
console.log(`fixture_path=${output}`);
console.log(
  `fixture_sha256=${createHash('sha256').update(bytes).digest('hex')}`,
);
console.log(`settlement_family_id=${fixture.profile.familyIdHex}`);
console.log(
  `duplicate_prevention_nft_id=${fixture.profile.duplicatePreventionNftIdHex}`,
);
console.log(
  `pooled_reserve_nft_id=${fixture.profile.pooledReserveNftIdHex}`,
);

function parseOutput(args: readonly string[]): string {
  if (args.length !== 2 || args[0] !== '--output' || args[1].length === 0) {
    throw new Error('usage: --output <new-json-path>');
  }
  return resolve(args[1]);
}
