import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  buildValidityApplicationPooledReserveBurnFamilyV6CompilerFixture,
} from '../validity-application-pooled-reserve-burn-family-v6-fixture.js';

const output = parseOutput(process.argv.slice(2));
const fixture =
  await buildValidityApplicationPooledReserveBurnFamilyV6CompilerFixture();
const bytes = Buffer.from(`${JSON.stringify(fixture, null, 2)}\n`, 'ascii');
if (
  bytes.length === 0
  || bytes.includes(13)
  || bytes.some(byte => byte > 0x7f)
) {
  throw new Error('burn-family V6 compiler fixture must be LF-only ASCII JSON');
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, bytes, { flag: 'wx' });
console.log(`fixture_path=${output}`);
console.log(
  `fixture_sha256=${createHash('sha256').update(bytes).digest('hex')}`,
);
console.log(`settlement_lineage_profile_id=${fixture.lineage.profileIdHex}`);
console.log(
  `source_runtime_profile_id=${fixture.sourceRuntime.profileIdHex}`,
);
console.log(
  `source_runtime_lineage_profile_id=${fixture.sourceRuntime.lineageProfileIdHex}`,
);
console.log(
  `application_binding_prefix=${fixture.bindings.applicationBindingPrefixHex}`,
);

function parseOutput(args: readonly string[]): string {
  if (args.length !== 2 || args[0] !== '--output' || args[1].length === 0) {
    throw new Error('usage: --output <new-json-path>');
  }
  return resolve(args[1]);
}
