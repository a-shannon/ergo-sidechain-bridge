import { createECDH, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  buildSubstrateFederatedCheckpointProfileV1,
  buildSubstrateFederatedCheckpointStatementV1,
  type SubstrateFederatedCheckpointProfileV1Input,
  type SubstrateFederatedCheckpointStatementV1Input,
} from '../profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  buildSubstrateFederatedTrackerV1AcceptanceFixture,
} from '../substrate-federated-tracker-v1-fixture.js';
import {
  buildSubstrateFederatedTrackerCompilerRequestV2,
} from '../substrate-federated-tracker-compiler-v2.js';
import {
  compileSubstrateFederatedTrackerWithPinnedJvmV2,
} from '../substrate-federated-tracker-jvm-compiler-v2.js';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--output' || !args[1]) {
  throw new Error('usage: --output <new-json-path>');
}
const vector = JSON.parse(readFileSync(new URL(
  '../../test-vectors/substrate-federated-v1-tracker-admission.json',
  import.meta.url,
), 'utf8')) as {
  input: {
    profile: SubstrateFederatedCheckpointProfileV1Input;
    statement: Omit<SubstrateFederatedCheckpointStatementV1Input, 'profile'>;
  };
};

// Public test actors only: the matching JVM prover derives scalars 1, 2 and 3.
const publicKeys = [1, 2, 3].map(value => {
  const key = createECDH('secp256k1');
  const scalar = Buffer.alloc(32);
  scalar.writeUInt32BE(value, 28);
  key.setPrivateKey(scalar);
  return key.getPublicKey('hex', 'compressed');
}).sort();
const profileInput = {
  ...vector.input.profile,
  ergoAdmissionPublicKeysHex: publicKeys,
};
const profile = buildSubstrateFederatedCheckpointProfileV1(profileInput);
const statementInput = vector.input.statement;
const statement = buildSubstrateFederatedCheckpointStatementV1({
  ...statementInput,
  profile,
});
const baseContext = await buildSubstrateFederatedTrackerV1AcceptanceFixture();
const compilerRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
  template: {
    relativePath: 'contracts/SPVTrackerSubstrateFederatedV2.es',
    source: readFileSync(new URL('../../../contracts/SPVTrackerSubstrateFederatedV2.es', import.meta.url), 'utf8'),
  },
  trackerGenesisInputBoxIdHex: baseContext.contract.trackerNftIdHex,
  application: baseContext.contract.application,
  profile,
});
const compilerReceipt = await compileSubstrateFederatedTrackerWithPinnedJvmV2(compilerRequest);
const fixture = {
  schema: 'e2s.substrate-federated-tracker-v2-anchor-prototype',
  version: 2,
  trustModel: 'federated_non_trustless',
  profileInput,
  statementInput,
  profile,
  statement,
  compilerRequest,
  compilerReceipt,
  // V1 supplies only headers and empty AVL setup, never V2 compiler authority.
  // The serialized V2 receipt is observation data, not same-process provenance.
  baseContext,
  boundaries: {
    runtimeProfileActivated: false,
    sourceAttestationsVerified: false,
    targetNodeAccepted: false,
    fundsAuthorityEstablished: false,
  },
};
const bytes = Buffer.from(`${JSON.stringify(fixture, null, 2)}\n`, 'ascii');
if (!bytes.length || bytes.includes(13) || bytes.some(byte => byte > 0x7f)) {
  throw new Error('tracker V2 prototype fixture must be LF-only ASCII JSON');
}
const output = resolve(args[1]);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, bytes, { flag: 'wx' });
console.log(`fixture_sha256=${createHash('sha256').update(bytes).digest('hex')}`);
