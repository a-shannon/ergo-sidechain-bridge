import { createECDH, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  buildSubstrateFederatedCheckpointProfileV1,
  buildSubstrateFederatedCheckpointStatementV1,
  encodeSubstrateFederatedCheckpointExtensionValueV1,
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
import { buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context } from '../substrate-federated-tracker-v2.js';
import {
  buildBridgeValidityTrackerCanonicalHeaderContextV1,
  buildBridgeValidityTrackerObservedHeaderContextV1,
} from '../bridge-validity-tracker-header-context-v1.js';
import { buildErgoExtensionMembershipProof } from '../ergo-settlement-core/ergo-extension-membership.js';
import { encodeCollByteRegister, encodeIntRegister } from '../ergo-encoding.js';
import { assertContextExtensionSafe } from '../context-extension-guard.js';
import { buildWasmSimplifiedUpcomingPreHeaderCarrier } from '../ergo-upcoming-state-context.js';
import { buildSubstrateFederatedTrackerV2ExternalFeeTransaction } from '../substrate-federated-tracker-v2-external-fee.js';

const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== '--output' || !args[1]
  || args[2] !== '--signed-output' || !args[3] || resolve(args[1]) === resolve(args[3])) {
  throw new Error('usage: --output <new-json-path> --signed-output <new-signed-json-path>');
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
const wasm = await import('ergo-lib-wasm-nodejs').then(module => module.default ?? module);
const currentHeight = baseContext.trackerTransition.currentErgoHeight;
const extensionProof = buildErgoExtensionMembershipProof([
  { key: Buffer.from('0401', 'hex'), value: Buffer.from(
    encodeSubstrateFederatedCheckpointExtensionValueV1(statement.encodedStatementHex), 'hex',
  ) },
], Buffer.from('0401', 'hex'));
const headers = buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
  currentHeight,
  anchorContextIndex: baseContext.trackerTransition.anchorContextIndex,
  anchorExtensionRootHex: extensionProof.root.toString('hex'),
});
const observedHeaders = buildBridgeValidityTrackerObservedHeaderContextV1(wasm, {
  rawHeaders: headers.headers.map(header => header.raw),
  anchorContextIndex: headers.anchorContextIndex,
  expectedAnchorHeaderIdHex: headers.anchorHeader.id,
  expectedAnchorExtensionRootHex: headers.anchorHeader.extensionRootHex,
});
const genesisBox = syntheticGenesisBox();
const wasmContext = await buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context({
  compilerRequest,
  compilerReceipt,
  trackerInputBox: genesisBox,
  encodedStatementHex: statement.encodedStatementHex,
  observedHeaderContext: observedHeaders,
  extensionMembershipProofHex: extensionProof.proof.toString('hex'),
});
const feeKey = createECDH('secp256k1');
const feeScalar = Buffer.alloc(32);
feeScalar.writeUInt32BE(7, 28);
feeKey.setPrivateKey(feeScalar);
const feePayerPublicKeyHex = feeKey.getPublicKey('hex', 'compressed');
const feeBox = syntheticBox({
  value: '1100000', ergoTree: `0008cd${feePayerPublicKeyHex}`,
  assets: [], additionalRegisters: {}, creationHeight: currentHeight - 2,
}, '77'.repeat(32));
const feeFundedContext = await buildSubstrateFederatedTrackerV2ExternalFeeTransaction({
  trackerContext: wasmContext, trackerInputBox: genesisBox,
  feeInputBox: feeBox, feePayerPublicKeyHex,
});
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
  wasmContext,
  feeFundedContext,
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
const fixtureSha256Hex = createHash('sha256').update(bytes).digest('hex');
console.log(`fixture_sha256=${fixtureSha256Hex}`);
const signed = signSyntheticWasmTransaction(
  wasmContext.eip12UnsignedTransaction, [genesisBox], wasmContext.unsignedTransactionIdHex, [1, 2],
);
const feeSigned = signSyntheticWasmTransaction(
  feeFundedContext.eip12UnsignedTransaction, [genesisBox, feeBox],
  feeFundedContext.unsignedTransactionIdHex, [1, 2, 7],
);
const signedBytes = Buffer.from(`${JSON.stringify({
  schema: 'e2s.substrate-federated-tracker-v2-synthetic-wasm-signature',
  version: 2,
  fixtureSha256Hex,
  unsignedTransactionIdHex: wasmContext.unsignedTransactionIdHex,
  signedTransactionHex: signed,
  feeFundedSignedTransactionHex: feeSigned,
  boundaries: { syntheticSigningOnly: true, nodeCheckPerformed: false, broadcastPerformed: false },
}, null, 2)}\n`, 'ascii');
const signedOutput = resolve(args[3]);
mkdirSync(dirname(signedOutput), { recursive: true });
writeFileSync(signedOutput, signedBytes, { flag: 'wx' });
console.log(`signed_fixture_sha256=${createHash('sha256').update(signedBytes).digest('hex')}`);

function syntheticGenesisBox() {
  return syntheticBox({
    value: '10000000',
    ergoTree: compilerReceipt.contract.propositionHex,
    assets: [{ tokenId: compilerRequest.trackerNftIdHex, amount: '1' }],
    additionalRegisters: {
      ...baseContext.trackerTransition.inputRegisters,
      R4: encodeCollByteRegister(Buffer.from(profile.profileIdHex, 'hex')),
      R8: encodeIntRegister(0),
      R9: encodeCollByteRegister(Buffer.from(profile.ergoAdmissionKeySetDigestHex, 'hex')),
    },
    creationHeight: currentHeight - 2,
  }, compilerRequest.trackerNftIdHex);
}

function syntheticBox(candidateJson: unknown, sourceBoxId: string) {
  const setup = wasm.UnsignedTransaction.from_json(JSON.stringify({
    inputs: [{ boxId: sourceBoxId, extension: {} }],
    dataInputs: [],
    outputs: [candidateJson],
  }));
  const txId = setup.id();
  const candidates = setup.output_candidates();
  const candidate = candidates.get(0);
  const box = wasm.ErgoBox.from_box_candidate(candidate, txId, 0);
  try {
    return box.to_js_eip12();
  } finally {
    box.free(); candidate.free(); candidates.free(); txId.free(); setup.free();
  }
}

function signSyntheticWasmTransaction(
  transaction: unknown, inputBoxes: readonly unknown[], expectedId: string, scalars: readonly number[],
): string {
  assertContextExtensionSafe(
    (transaction as { inputs: Array<{ extension: Record<string, string> }> }).inputs,
    'synthetic V2 WASM signing', 3,
  );
  const blockHeaders = wasm.BlockHeaders.from_json(headers.headers.map(header => header.raw));
  const carrier = wasm.BlockHeader.from_json(JSON.stringify(
    buildWasmSimplifiedUpcomingPreHeaderCarrier(headers.headers[0].raw),
  ));
  const preHeader = wasm.PreHeader.from_block_header(carrier);
  const state = new wasm.ErgoStateContext(preHeader, blockHeaders, wasm.Parameters.default_parameters());
  const keys = new wasm.SecretKeys();
  for (const value of scalars) {
    const scalar = Buffer.alloc(32);
    scalar.writeUInt32BE(value, 28);
    const key = wasm.SecretKey.dlog_from_bytes(scalar);
    keys.add(key);
    key.free();
  }
  const wallet = wasm.Wallet.from_secrets(keys);
  const unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify(transaction));
  const inputs = wasm.ErgoBoxes.from_boxes_json([...inputBoxes]);
  const dataInputs = wasm.ErgoBoxes.from_boxes_json([]);
  let signed: InstanceType<typeof wasm.Transaction> | undefined;
  try {
    signed = wallet.sign_transaction(state, unsigned, inputs, dataInputs);
    const id = signed.id();
    try {
      if (id.to_str() !== expectedId) {
        throw new Error('synthetic V2 WASM signing changed the transaction identity');
      }
    } finally { id.free(); }
    for (let index = 0; index < inputBoxes.length; index += 1) {
      if (!wasm.verify_tx_input_proof(index, state, signed, inputs, dataInputs)) {
        throw new Error(`synthetic V2 WASM proof ${index} did not verify`);
      }
    }
    return Buffer.from(signed.sigma_serialize_bytes()).toString('hex');
  } finally {
    signed?.free(); dataInputs.free(); inputs.free(); unsigned.free();
    wallet.free(); keys.free(); state.free();
  }
}
