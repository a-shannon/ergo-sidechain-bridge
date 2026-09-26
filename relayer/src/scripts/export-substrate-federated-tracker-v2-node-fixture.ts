import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertContextExtensionSafe } from '../context-extension-guard.js';

const args = process.argv.slice(2);
if (args.length !== 4) {
  throw new Error('usage: <context-json> <signed-json> <signed-sha256> <new-wire-json>');
}
const paths = [args[0], args[1], args[3]].map(path => resolve(path));
if (new Set(paths.map(path => path.toLowerCase())).size !== 3) {
  throw new Error('fixture input and output paths must be distinct');
}
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const contextBytes = readFileSync(paths[0]);
const contextHash = sha256(contextBytes);
if (contextHash !== '416300485667d83a62b13826cb6514f0969df0faad4ced9b2cdbadb58aee266b') {
  throw new Error('unexpected V154 deterministic fixture');
}
const packetBytes = readFileSync(paths[1]);
if (!/^[0-9a-f]{64}$/.test(args[2]) || sha256(packetBytes) !== args[2]) {
  throw new Error('signed packet digest mismatch');
}
const packet = JSON.parse(packetBytes.toString('ascii'));
if (packet.schema !== 'e2s.substrate-federated-tracker-v2-synthetic-wasm-signature'
  || packet.version !== 2 || packet.fixtureSha256Hex !== contextHash
  || typeof packet.feeFundedSignedTransactionHex !== 'string'
  || !/^(?:[0-9a-f]{2})+$/.test(packet.feeFundedSignedTransactionHex)) {
  throw new Error('unexpected synthetic signed packet');
}
const context = JSON.parse(contextBytes.toString('ascii'));
const bytes = Buffer.from(packet.feeFundedSignedTransactionHex, 'hex');
const wasm = await import('ergo-lib-wasm-nodejs').then(module => module.default ?? module);
const transaction = wasm.Transaction.sigma_parse_bytes(bytes);
try {
  const id = transaction.id();
  try {
    if (id.to_str() !== context.feeFundedContext.unsignedTransactionIdHex) {
      throw new Error('signed transaction identity differs from V154 construction');
    }
  } finally { id.free(); }
  if (!Buffer.from(transaction.sigma_serialize_bytes()).equals(bytes)) {
    throw new Error('WASM binary reparse changed the signed bytes');
  }
  const wire = JSON.parse(transaction.to_json());
  assertContextExtensionSafe(wire.inputs.map((input: {
    spendingProof: { extension: Record<string, string> };
  }) => ({ extension: input.spendingProof.extension })), 'V2 node fixture', 3);
  const roundTrip = wasm.Transaction.from_json(JSON.stringify(wire));
  try {
    if (!Buffer.from(roundTrip.sigma_serialize_bytes()).equals(bytes)) {
      throw new Error('WASM JSON export changed the signed bytes');
    }
  } finally { roundTrip.free(); }
  const output = Buffer.from(`${JSON.stringify({
    schema: 'e2s.substrate-federated-tracker-v2-node-wire-fixture',
    version: 2,
    contextFixtureSha256Hex: contextHash,
    signedFixtureSha256Hex: args[2],
    feeFundedSignedTransactionHex: packet.feeFundedSignedTransactionHex,
    feeFundedSignedTransactionJson: wire,
  }, null, 2)}\n`, 'ascii');
  writeFileSync(paths[2], output, { flag: 'wx' });
  console.log(`wire_fixture_sha256=${sha256(output)}`);
  console.log('signing_performed=false');
  console.log('network_performed=false');
} finally { transaction.free(); }
