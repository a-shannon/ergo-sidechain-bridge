import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import blakejs from 'blakejs';
import { beforeAll, describe, expect, it } from 'vitest';

import { tracker_application_v2_empty_digest } from '../../wasm-avl/pkg/bridge_avl.js';
import {
  buildBridgeValidityTrackerCanonicalHeaderContextV1,
  buildBridgeValidityTrackerObservedHeaderContextV1,
} from './bridge-validity-tracker-header-context-v1.js';
import {
  encodeAvlTreeRegister, encodeCollByteRegister, encodeIntRegister, encodeLongRegister,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import { buildErgoExtensionMembershipProof } from './ergo-settlement-core/ergo-extension-membership.js';
import {
  buildSubstrateFederatedCheckpointProfileV1,
  buildSubstrateFederatedCheckpointStatementV1,
  encodeSubstrateFederatedCheckpointExtensionValueV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  assertSubstrateFederatedGenesisObservationV1Provenance,
  buildSubstrateFederatedGenesisTargetProfileV1,
  observeSubstrateFederatedGenesisV1,
} from './substrate-federated-genesis-observation-v1.js';
import { buildSubstrateFederatedTrackerCompilerRequestV1 } from './substrate-federated-tracker-compiler-v1.js';
import { buildSubstrateFederatedTrackerCompilerRequestV2 } from './substrate-federated-tracker-compiler-v2.js';
import { compileSubstrateFederatedTrackerWithPinnedJvmV1 } from './substrate-federated-tracker-jvm-compiler-v1.js';
import { compileSubstrateFederatedTrackerWithPinnedJvmV2 } from './substrate-federated-tracker-jvm-compiler-v2.js';
import { buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context } from './substrate-federated-tracker-v2.js';
import { buildSubstrateFederatedTrackerV2ExternalFeeTransaction } from './substrate-federated-tracker-v2-external-fee.js';
import {
  assertSubstrateFederatedTrackerV2Genesis,
  buildSubstrateFederatedTrackerV2Genesis as build,
} from './substrate-federated-tracker-v2-genesis.js';
import { ORIGINAL_NODE_OPTIONS } from './test-node-env.js';
import type { Eip12Box } from './unsigned-ergo-transaction.js';

const vector = JSON.parse(readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-tracker-admission.json', import.meta.url,
), 'utf8'));
const identity = JSON.parse(readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-tracker-contract.json', import.meta.url,
), 'utf8'));
const profile = buildSubstrateFederatedCheckpointProfileV1(vector.input.profile);
const statement = buildSubstrateFederatedCheckpointStatementV1({ ...vector.input.statement, profile });
const template = {
  relativePath: 'contracts/SPVTrackerSubstrateFederatedV2.es',
  source: readFileSync(new URL('../../contracts/SPVTrackerSubstrateFederatedV2.es', import.meta.url), 'utf8'),
};
const PUBLIC_KEY = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const FUNDING_TREE = `0008cd${PUBLIC_KEY}`;
const GENESIS_HEADER_ID = '91'.repeat(32);
const TIP_HEADER_ID = '92'.repeat(32);
const OBSERVED_AT = '2026-08-12T12:00:00.000Z';
const TIP_HEIGHT = 999;
const CURRENT_HEIGHT = 1_030;
const TRACKER_VALUE = 10_000_000n;
const FEE = 1_100_000n;
const MAX_INT = 2_147_483_647;
const FALSE_BOUNDARIES = [
  'nodeCheckPerformed', 'targetNodeAcceptanceEstablished', 'signingPerformed',
  'submissionPerformed', 'broadcastPerformed', 'profileActivated',
  'fundsAuthorityEstablished', 'gate5Closed', 'trustlessStatusEstablished',
] as const;
const EXTRA_INPUT_FIELDS: readonly (readonly [string, unknown])[] = [
  ...FALSE_BOUNDARIES.map(field => [field, true] as const),
  ['options', {}], ['fee', 0n], ['creationHeight', 1], ['trackerValue', 1n],
];
type BuildInput = Parameters<typeof build>[0];
type Genesis = Awaited<ReturnType<typeof build>>;
type CompilerRequest = ReturnType<typeof buildSubstrateFederatedTrackerCompilerRequestV2>;
type CompilerReceipt = Awaited<ReturnType<typeof compileSubstrateFederatedTrackerWithPinnedJvmV2>>;
type Candidate = Pick<Eip12Box, 'value' | 'ergoTree' | 'assets' | 'additionalRegisters' | 'creationHeight'>;
let wasm: any;
let fundingBox: Eip12Box;
let input: BuildInput;
let genesis: Genesis;
let receiptV1: Awaited<ReturnType<typeof compileSubstrateFederatedTrackerWithPinnedJvmV1>>;
const compilerCache = new Map<string, Promise<{
  compilerRequest: CompilerRequest; compilerReceipt: CompilerReceipt;
}>>();

// Both nodes and their declared identities are synthetic; agreement is not chain authority.
async function observeFunding(
  tracker: Eip12Box,
  tipHeight = TIP_HEIGHT,
  profileIdHex = profile.profileIdHex,
) {
  const boxes = [tracker, fundingCandidate('100000000'), fundingCandidate('150000000')];
  const json = new Map(boxes.map(box => [box.boxId, box]));
  const sigma = new Map(boxes.map(box => [box.boxId, sigmaBytes(box)]));
  const servers: Server[] = [];
  const methods: string[] = [];
  const unexpected: string[] = [];
  const start = async (): Promise<string> => {
    const server = createServer((request, response) => {
      const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      methods.push(request.method ?? '');
      let body: unknown;
      if (request.method === 'GET') {
        if (path === '/info') body = { network: 'devnet', fullHeight: tipHeight };
        else if (path === '/blocks/lastHeaders/1') body = [{ id: TIP_HEADER_ID, height: tipHeight }];
        else if (path === '/blocks/at/1') body = [GENESIS_HEADER_ID];
        else {
          const binary = path.match(/^\/utxo\/byIdBinary\/([0-9a-f]{64})$/);
          const byId = path.match(/^\/utxo\/byId\/([0-9a-f]{64})$/);
          if (binary && sigma.has(binary[1]!)) body = { bytes: sigma.get(binary[1]!) };
          else if (byId) body = json.get(byId[1]!);
        }
      }
      if (body === undefined) unexpected.push(`${request.method} ${path}`);
      response.writeHead(body === undefined ? 404 : 200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body ?? {}));
    });
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };
  try {
    const primaryNodeOrigin = await start();
    const witnessNodeOrigin = await start();
    const targetProfile = buildSubstrateFederatedGenesisTargetProfileV1({
      profileIdHex, environment: 'patched-devnet', expectedNetwork: 'devnet',
      expectedGenesisHeaderIdHex: GENESIS_HEADER_ID,
      primaryNodeOrigin, primaryNodeIdentityDigestHex: '11'.repeat(32),
      primaryAdministrationIdentityDigestHex: '12'.repeat(32),
      witnessNodeOrigin, witnessNodeIdentityDigestHex: '13'.repeat(32),
      witnessAdministrationIdentityDigestHex: '14'.repeat(32),
      trackerGenesisBoxIdHex: tracker.boxId,
      duplicatePreventionGenesisBoxIdHex: boxes[1]!.boxId,
      pooledReserveGenesisBoxIdHex: boxes[2]!.boxId,
    });
    const observation = await observeSubstrateFederatedGenesisV1(targetProfile, {
      now: () => new Date(OBSERVED_AT),
    });
    assertSubstrateFederatedGenesisObservationV1Provenance(targetProfile, observation);
    expect(methods.length).toBeGreaterThan(0);
    expect(new Set(methods)).toEqual(new Set(['GET']));
    expect(unexpected).toEqual([]);
    return { targetProfile, observation };
  } finally {
    for (const server of servers) {
      if (!server.listening) continue;
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    }
  }
}

async function inCompilerHarness<T>(compile: () => Promise<T>): Promise<T> {
  if (ORIGINAL_NODE_OPTIONS !== undefined || process.env.NODE_OPTIONS !== '--no-deprecation') {
    throw new Error('Vitest parent NODE_OPTIONS is not the reviewed harness value');
  }
  const testNodeOptions = process.env.NODE_OPTIONS;
  delete process.env.NODE_OPTIONS;
  try { return await compile(); }
  finally { process.env.NODE_OPTIONS = testNodeOptions; }
}

function compilerFor(box: Eip12Box) {
  let cached = compilerCache.get(box.boxId);
  if (!cached) {
    cached = (async () => {
      const compilerRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
        trackerGenesisInputBoxIdHex: box.boxId, profile, application: identity.application, template,
      });
      const compilerReceipt = await inCompilerHarness(() =>
        compileSubstrateFederatedTrackerWithPinnedJvmV2(compilerRequest));
      return { compilerRequest, compilerReceipt };
    })();
    compilerCache.set(box.boxId, cached);
  }
  return cached;
}

describe('V2 tracker genesis construction from synthetic genuine observations', () => {
  beforeAll(async () => {
    const module = await import('ergo-lib-wasm-nodejs');
    wasm = module.default ?? module;
    fundingBox = fundingCandidate('50000000');
    input = { ...await observeFunding(fundingBox), ...await compilerFor(fundingBox) };
    const requestV1 = buildSubstrateFederatedTrackerCompilerRequestV1({
      trackerGenesisInputBoxIdHex: fundingBox.boxId, profile, application: identity.application,
      template: {
        relativePath: 'contracts/SPVTrackerSubstrateFederatedV1.es',
        source: readFileSync(new URL('../../contracts/SPVTrackerSubstrateFederatedV1.es', import.meta.url), 'utf8'),
      },
    });
    receiptV1 = await inCompilerHarness(() => compileSubstrateFederatedTrackerWithPinnedJvmV1(requestV1));
    genesis = await build(input);
  }, 90_000);

  it('binds the exact compiler, observation, target and singleton without granting authority', () => {
    expect(Object.keys(genesis).sort()).toEqual([
      'schema', 'version', 'anchorSelector', 'compilerRequestDigestHex', 'compilerReceiptDigestHex',
      'targetProfileDigestHex', 'observationDigestHex', 'genesisInputBoxIdHex', 'trackerNftIdHex',
      'contract', 'target', 'transaction', 'trackerBox', 'trackerBoxSigmaHex', 'genesisInputBoxSigmaHex',
      'boundaries',
    ].sort());
    expect(genesis).toMatchObject({
      schema: 'e2s.substrate-federated-tracker-v2-genesis', version: 2,
      anchorSelector: 'absolute-ergo-header-height',
      compilerRequestDigestHex: input.compilerRequest.requestDigestHex,
      compilerReceiptDigestHex: input.compilerReceipt.receiptDigestHex,
      targetProfileDigestHex: input.targetProfile.profileDigestHex,
      observationDigestHex: input.observation.reportDigestHex,
      genesisInputBoxIdHex: fundingBox.boxId, trackerNftIdHex: input.compilerRequest.trackerNftIdHex,
    });
    expect(genesis.contract).toEqual(input.compilerReceipt.contract);
    expect(genesis.contract.propositionHex).not.toBe(receiptV1.contract.propositionHex);
    expect(genesis.target).toEqual(input.observation.target);
    expect(genesis.trackerBox).toBe(genesis.transaction.outputs[0]);
    expect(genesis.trackerNftIdHex).toBe(fundingBox.boxId);
    expect(genesis.genesisInputBoxSigmaHex).toBe(input.observation.boxes.tracker.sigmaSerializedHex);
    expect(genesis.boundaries).toEqual({
      ...Object.fromEntries(FALSE_BOUNDARIES.map(field => [field, false])),
      genesisObservationRevalidated: true, constructionOnly: true, revalidationRequiredBeforeSigning: true,
    });
    expect(input.observation.observedAt).toBe(OBSERVED_AT);
    expect(Object.values(input.observation.authorization)).toEqual(Array(10).fill(false));
    expect(() => assertSubstrateFederatedTrackerV2Genesis(genesis)).not.toThrow();
    expectDeepFrozen(genesis);
  });

  it('issues one NFT with exact registers, change, fee, conservation and canonical box identities', () => {
    const { transaction, trackerBox } = genesis;
    expect(transaction.eip12Tx.inputs).toEqual([{ ...fundingBox, extension: {} }]);
    expect(transaction.eip12Tx.dataInputs).toEqual([]);
    expect(transaction.outputs).toHaveLength(3);
    expect(transaction.eip12Tx.outputs).toEqual(transaction.outputs.map(candidateFromBox));
    expect(candidateFromBox(trackerBox)).toEqual({
      value: String(TRACKER_VALUE), ergoTree: input.compilerReceipt.contract.propositionHex,
      assets: [{ tokenId: fundingBox.boxId, amount: '1' }], creationHeight: TIP_HEIGHT + 1,
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from(profile.profileIdHex, 'hex')),
        R5: encodeAvlTreeRegister(Buffer.from(tracker_application_v2_empty_digest(), 'hex'), 1, 370),
        R6: encodeCollByteRegister(Buffer.from(statement.sidechainIdHex, 'hex')),
        R7: encodeLongRegister(0n), R8: encodeIntRegister(0),
        R9: encodeCollByteRegister(Buffer.from(profile.ergoAdmissionKeySetDigestHex, 'hex')),
      },
    });
    expect(Buffer.from(trackerBox.additionalRegisters.R5!, 'hex')[35]).toBe(32);
    expect(candidateFromBox(transaction.outputs[1]!)).toEqual({
      value: '38900000', ergoTree: FUNDING_TREE, assets: [], additionalRegisters: {},
      creationHeight: TIP_HEIGHT + 1,
    });
    expect(candidateFromBox(transaction.outputs[2]!)).toEqual({
      value: String(FEE), ergoTree: MINER_FEE_TREE, assets: [], additionalRegisters: {},
      creationHeight: TIP_HEIGHT + 1,
    });
    expect(transaction.outputs.reduce((sum, box) => sum + BigInt(box.value), 0n)).toBe(BigInt(fundingBox.value));
    expect(transaction.outputs.flatMap(box => box.assets)).toEqual([{ tokenId: fundingBox.boxId, amount: '1' }]);
    for (const [index, box] of transaction.outputs.entries()) {
      expect(box.transactionId).toBe(transaction.txId);
      expect(box.index).toBe(index);
    }
    expect(sigmaBytes(fundingBox)).toBe(genesis.genesisInputBoxSigmaHex);
    expect(sigmaBytes(trackerBox)).toBe(genesis.trackerBoxSigmaHex);
    expectUnsignedRoundTrip(genesis);
  });

  it('composes the resulting exact tracker box through observed V2 admission and external fee funding', async () => {
    const context = await buildObservedAnchorCompilerBoundSubstrateFederatedTrackerV2Context({
      compilerRequest: input.compilerRequest, compilerReceipt: input.compilerReceipt,
      trackerInputBox: genesis.trackerBox, encodedStatementHex: statement.encodedStatementHex,
      ...anchorInput(),
    });
    const feeInputBox = fundingCandidate(String(FEE));
    const composed = await buildSubstrateFederatedTrackerV2ExternalFeeTransaction({
      trackerContext: context, trackerInputBox: genesis.trackerBox,
      feeInputBox, feePayerPublicKeyHex: PUBLIC_KEY,
    });
    expect(context.inputBoxSigmaHex).toBe(genesis.trackerBoxSigmaHex);
    expect(context.compilerRequestDigestHex).toBe(genesis.compilerRequestDigestHex);
    expect(context.compilerReceiptDigestHex).toBe(genesis.compilerReceiptDigestHex);
    expect(context.trackerTransition.inputRegisters).toEqual(genesis.trackerBox.additionalRegisters);
    expect(context.contextExtension.eip12Values['2']).toBe(encodeIntRegister(1_028));
    expect(composed.inputBoxes).toEqual([genesis.trackerBox, feeInputBox]);
    expect(composed.inputBoxSigmaHex[0]).toBe(genesis.trackerBoxSigmaHex);
    const tx = composed.eip12UnsignedTransaction;
    expect(tx.inputs).toEqual([
      { ...genesis.trackerBox, extension: context.contextExtension.eip12Values },
      { ...feeInputBox, extension: {} },
    ]);
    expect(tx.dataInputs).toEqual([]);
    const expectedSuccessor = (context.eip12UnsignedTransaction.outputs as unknown[])[0];
    expect(tx.outputs).toEqual([
      expectedSuccessor,
      { value: String(FEE), ergoTree: MINER_FEE_TREE, assets: [], additionalRegisters: {},
        creationHeight: CURRENT_HEIGHT },
    ]);
    expect(tx.outputs[0]).toBe(expectedSuccessor);
    expect(tx.outputs[0]!.value).toBe(genesis.trackerBox.value);
    expect(tx.outputs[0]!.assets).toEqual(genesis.trackerBox.assets);
    expect(tx.inputs.reduce((sum, box) => sum + BigInt(box.value), 0n))
      .toBe(tx.outputs.reduce((sum, box) => sum + BigInt(box.value), 0n));
    expect(composed.boundaries.feesIncluded).toBe(true);
    for (const field of FALSE_BOUNDARIES) expect(composed.boundaries[field], field).toBe(false);
  });

  it.each(['targetProfile', 'observation', 'compilerRequest', 'compilerReceipt'] as const)(
    'rejects copied ingress provenance independently: %s', async field => {
      await expect(build({ ...input, [field]: structuredClone(input[field]) })).rejects.toThrow(/provenance/i);
    },
  );

  it('rejects a genuine observation paired with a different genuine target profile', async () => {
    const other = await observeFunding(fundingBox, TIP_HEIGHT, 'ee'.repeat(32));
    expect(other.targetProfile.profileDigestHex).not.toBe(input.targetProfile.profileDigestHex);
    await expect(build({ ...input, targetProfile: other.targetProfile })).rejects.toThrow(/provenance|profile/i);
  });

  it('rejects a genuine compiler request paired with a receipt from another request', async () => {
    const compilerRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
      trackerGenesisInputBoxIdHex: fundingBox.boxId, application: identity.application, template,
      profile: buildSubstrateFederatedCheckpointProfileV1({ ...vector.input.profile, federationEpoch: '8' }),
    });
    expect(compilerRequest.requestDigestHex).not.toBe(input.compilerRequest.requestDigestHex);
    await expect(build({ ...input, compilerRequest })).rejects.toThrow(/binding|profile|request/i);
  });

  it('rejects a genuine matching compiler pair whose NFT is not the observed genesis box', async () => {
    const other = await compilerFor(fundingCandidate('11100000'));
    expect(other.compilerRequest.trackerNftIdHex).not.toBe(fundingBox.boxId);
    await expect(build({ ...input, ...other })).rejects.toThrow(/NFT|genesis|box ID/i);
  }, 90_000);

  it('rejects a genuine V1 JVM receipt without granting V2 provenance', async () => {
    await expect(Reflect.apply(build, undefined, [{ ...input, compilerReceipt: receiptV1 }]))
      .rejects.toThrow(/provenance/i);
  });

  it('rejects a V1 receipt relabelled with the genuine V2 envelope', async () => {
    const relabelled = { ...receiptV1, schema: input.compilerReceipt.schema,
      version: 2, anchorSelector: 'absolute-ergo-header-height',
      receiptDigestHex: input.compilerReceipt.receiptDigestHex };
    await expect(Reflect.apply(build, undefined, [{ ...input, compilerReceipt: relabelled }]))
      .rejects.toThrow(/provenance/i);
  });

  it.each(EXTRA_INPUT_FIELDS)('rejects an extra caller-controlled field independently: %s', async (field, value) => {
    await expect(Reflect.apply(build, undefined, [{ ...input, [String(field)]: value }])).rejects.toThrow();
  });

  it.each(['spread', 'clone', 'frozen copy', 'cross-version'] as const)(
    'rejects manufactured result provenance: %s', mode => {
      const value = mode === 'clone' ? structuredClone(genesis)
        : mode === 'frozen copy' ? Object.freeze({ ...genesis })
          : mode === 'cross-version' ? { ...genesis, version: 1 } : { ...genesis };
      expect(() => assertSubstrateFederatedTrackerV2Genesis(value)).toThrow(/provenance/i);
    },
  );

  it.each([
    ['underfunded', '11099999', /underfund/i],
    ['one-nanoERG dust', '11100001', /dust/i],
  ] as const)('rejects genuine funding independently: %s', async (_label, value, error) => {
    const box = fundingCandidate(value);
    const candidate = { ...await observeFunding(box), ...await compilerFor(box) };
    await expect(build(candidate)).rejects.toThrow(error);
  }, 90_000);

  it.each([
    ['no change', '11100000', 2, undefined],
    ['minimum change', '12100000', 3, '1000000'],
  ] as const)('accepts genuine funding at the boundary: %s', async (_label, value, count, change) => {
    const box = fundingCandidate(value);
    const candidate = { ...await observeFunding(box), ...await compilerFor(box) };
    const built = await build(candidate);
    expect(built.transaction.outputs).toHaveLength(count);
    expect(built.transaction.outputs[0]!.value).toBe(String(TRACKER_VALUE));
    expect(built.transaction.outputs[0]!.assets).toEqual([{ tokenId: box.boxId, amount: '1' }]);
    expect(built.transaction.outputs.at(-1)!.value).toBe(String(FEE));
    expect(built.transaction.outputs.at(-1)!.ergoTree).toBe(MINER_FEE_TREE);
    if (change !== undefined) expect(candidateFromBox(built.transaction.outputs[1]!)).toEqual({
      value: change, ergoTree: FUNDING_TREE, assets: [], additionalRegisters: {}, creationHeight: TIP_HEIGHT + 1,
    });
    expect(built.transaction.outputs.reduce((sum, output) => sum + BigInt(output.value), 0n)).toBe(BigInt(value));
    expectUnsignedRoundTrip(built);
  }, 90_000);

  it('accepts the maximum signed-Int creation height from a genuine observation', async () => {
    const observed = await observeFunding(fundingBox, MAX_INT - 1);
    const built = await build({ ...input, ...observed });
    expect(built.transaction.outputs.every(box => box.creationHeight === MAX_INT)).toBe(true);
    expect(built.target).toEqual(observed.observation.target);
    expectUnsignedRoundTrip(built);
  });

  it('rejects tip plus one overflowing signed Int without wrapping', async () => {
    const observed = await observeFunding(fundingBox, MAX_INT);
    await expect(build({ ...input, ...observed })).rejects.toThrow(/height|Int|range/i);
  });

  it.each(['targetProfile', 'observation', 'compilerRequest', 'compilerReceipt'] as const)(
    'snapshots the ingress reference before awaiting independently: %s', async field => {
      const caller = { ...input };
      const pending = build(caller);
      Object.assign(caller, { [field]: structuredClone(input[field]) });
      expect(await pending).toEqual(genesis);
    },
  );
});

function anchorInput() {
  const key = Buffer.from('0401', 'hex');
  const membership = buildErgoExtensionMembershipProof([
    { key: Buffer.from('0100', 'hex'), value: Buffer.from('synthetic-v2-genesis', 'ascii') },
    { key, value: Buffer.from(encodeSubstrateFederatedCheckpointExtensionValueV1(statement.encodedStatementHex), 'hex') },
  ], key);
  const synthetic = buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
    currentHeight: CURRENT_HEIGHT, anchorContextIndex: 1,
    anchorExtensionRootHex: membership.root.toString('hex'),
  });
  return {
    extensionMembershipProofHex: membership.proof.toString('hex'),
    observedHeaderContext: buildBridgeValidityTrackerObservedHeaderContextV1(wasm, {
      rawHeaders: synthetic.headers.map(header => header.raw), anchorContextIndex: 1,
      expectedAnchorHeaderIdHex: synthetic.anchorHeader.id,
      expectedAnchorExtensionRootHex: synthetic.anchorHeader.extensionRootHex,
    }),
  };
}

function fundingCandidate(value: string): Eip12Box {
  const unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify({
    inputs: [{ boxId: '67'.repeat(32), extension: {} }], dataInputs: [],
    outputs: [{ value, ergoTree: FUNDING_TREE, assets: [], additionalRegisters: {}, creationHeight: 110 }],
  }));
  const id = unsigned.id();
  const candidates = unsigned.output_candidates();
  const candidate = candidates.get(0);
  let box: any;
  try {
    box = wasm.ErgoBox.from_box_candidate(candidate, id, 0);
    return box.to_js_eip12() as Eip12Box;
  } finally {
    box?.free?.(); candidate.free?.(); candidates.free?.(); id.free?.(); unsigned.free?.();
  }
}

function candidateFromBox(box: Eip12Box): Candidate {
  return { value: box.value, ergoTree: box.ergoTree, assets: box.assets,
    additionalRegisters: box.additionalRegisters, creationHeight: box.creationHeight };
}

function sigmaBytes(box: Eip12Box): string {
  const parsed = wasm.ErgoBox.from_json(JSON.stringify(box));
  let roundTrip: any;
  try {
    const bytes = parsed.sigma_serialize_bytes();
    roundTrip = wasm.ErgoBox.sigma_parse_bytes(bytes);
    expect(roundTrip.to_js_eip12()).toEqual(box);
    return Buffer.from(bytes).toString('hex');
  } finally { roundTrip?.free?.(); parsed.free?.(); }
}

function expectUnsignedRoundTrip(value: Genesis): void {
  const { transaction } = value;
  const expected = {
    inputs: transaction.eip12Tx.inputs.map(box => ({ boxId: box.boxId, extension: box.extension })),
    dataInputs: [], outputs: transaction.eip12Tx.outputs,
  };
  let unsigned: any;
  let id: any;
  let candidates: any;
  let proofless: any;
  let roundTrip: any;
  try {
    unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify(transaction.eip12Tx));
    expect(unsigned.to_js_eip12()).toEqual(expected);
    id = unsigned.id();
    expect(id.to_str()).toBe(transaction.txId);
    candidates = unsigned.output_candidates();
    for (const [index, expectedBox] of transaction.outputs.entries()) {
      const candidate = candidates.get(index);
      let box: any;
      try {
        box = wasm.ErgoBox.from_box_candidate(candidate, id, index);
        expect(box.to_js_eip12()).toEqual(expectedBox);
      } finally { box?.free?.(); candidate.free?.(); }
    }
    const consumed = unsigned;
    unsigned = undefined;
    proofless = wasm.Transaction.from_unsigned_tx(consumed, [new Uint8Array()]);
    const bytes = Buffer.from(proofless.sigma_serialize_bytes());
    expect(Buffer.from(blakejs.blake2b(bytes, undefined, 32)).toString('hex')).toBe(transaction.txId);
    const json = proofless.to_js_eip12();
    expect(json.inputs.map((box: any) => box.spendingProof)).toEqual([{ proofBytes: '', extension: {} }]);
    roundTrip = wasm.Transaction.from_json(JSON.stringify(json));
    expect(Buffer.from(roundTrip.sigma_serialize_bytes())).toEqual(bytes);
  } finally {
    roundTrip?.free?.(); proofless?.free?.(); candidates?.free?.(); id?.free?.(); unsigned?.free?.();
  }
}

function expectDeepFrozen(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) expectDeepFrozen(child);
  }
}
