import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  buildPooledReserveBurnTrackerV5AcceptanceFixture,
} from '../pooled-reserve-burn-tracker-v5-fixture.js';

const output = parseOutput(process.argv.slice(2));
const fixture = await buildPooledReserveBurnTrackerV5AcceptanceFixture();
const json = `${JSON.stringify(fixture, null, 2)}\n`;
const bytes = Buffer.from(json, 'ascii');
if (
  bytes.length === 0
  || bytes.includes(13)
  || bytes.some(byte => byte > 0x7f)
) {
  throw new Error('tracker acceptance fixture must be LF-only ASCII JSON');
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, bytes, { flag: 'wx' });
console.log(`fixture_path=${output}`);
console.log(
  `fixture_sha256=${createHash('sha256').update(bytes).digest('hex')}`,
);
console.log(`transaction_id=${fixture.unsignedTransactionIdHex}`);

function parseOutput(args: readonly string[]): string {
  if (args.length !== 2 || args[0] !== '--output' || args[1].length === 0) {
    throw new Error('usage: --output <new-json-path>');
  }
  return resolve(args[1]);
}
