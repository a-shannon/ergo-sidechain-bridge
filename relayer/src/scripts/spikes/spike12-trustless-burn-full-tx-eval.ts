/**
 * Spike 12: proof-bound burn full-transaction VM evaluation.
 *
 * Compiles and evaluates the production SPVTracker,
 * DoubleUnlockPreventionAggregate, and MainChainAggregateUnlockTrustless
 * scripts in one synthetic transaction. All boxes, keys, and signatures are
 * ephemeral and in memory. The local node is used only for ErgoScript
 * compilation and ten mined headers plus a derived upcoming preheader; this program has no submission
 * endpoint and never reads wallet, deployment, relayer database, or secret
 * state. Only loopback node info, headers, and compiler routes are read.
 *
 * This closes only the supplied-root proof-binding boundary. SPVTracker is
 * still committee accepted, so this is not authenticated sidechain finality,
 * Gate 5 closure, or a trustless/production-ready claim.
 */
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import blakejs from 'blakejs';

import {
  buildAggregateSettlementPlan,
  type AggregateSettlementPlan,
} from '../../aggregate-settlement-builder.js';
import { parseNodeJsonPreservingPowDistance } from '../../ergo-node-json.js';
import { buildWasmSimplifiedUpcomingPreHeaderCarrier } from '../../ergo-upcoming-state-context.js';
import { buildTrustlessSingleLeafAggregateSettlementTx } from '../../aggregate-settlement-tx.js';
import {
  getDupTreeDigest,
} from '../../avl-bridge.js';
import {
  createCommitteeConfig,
  injectCommitteePlaceholders,
} from '../../committee-config.js';
import {
  decodeCollByteRegister,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
  MINER_FEE,
} from '../../ergo-encoding.js';
import {
  buildSpvTrackerGetProof,
  encodeSpvTrackerAvlRegister,
  encodeSpvTrackerValue,
  toSpvTrackerHistoryEntry,
  type SpvTrackerHistoryEntry,
  type SpvTrackerIdentity,
} from '../../spv-tracker.js';
import {
  buildTrustlessBurnInclusionProof,
  deriveTrustlessBurnIdHex,
  type TrustlessBurnLeafInput,
  type TrustlessBurnMerkleProofStep,
} from '../../trustless-burn-proof.js';
import {
  bridge_generate_proofs,
  bridge_lookup_membership,
} from '../../../../wasm-avl/pkg/bridge_avl.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRACTS_DIR = resolve(__dirname, '../../../../contracts');
const NODE_ENDPOINT = loopbackNodeEndpoint();
const NODE_API_KEY = 'hello';
const MIN_BOX_VALUE = 1_000_000;
const PAYOUT_VALUE = 1_000_000;
const DUP_FLAGS = 0x0b;
const TRACKER_NFT_ID = '11'.repeat(32);
const DUP_NFT_ID = '22'.repeat(32);
const ZERO_ASSET_ID = '00'.repeat(32);
const BURN_LEAF_DOMAIN = Buffer.from('E2S_TRUSTLESS_BURN_LEAF_V1', 'ascii');
const BURN_NODE_DOMAIN = Buffer.from('E2S_TRUSTLESS_BURN_NODE_V1', 'ascii');

type ExpectedRejection =
  | { kind: 'avl-trap' }
  | {
      kind: 'script-false' | 'tree-proof' | 'evaluation-error';
      inputIndex: 0 | 1 | 2;
    };

interface KeyPair {
  privateKeyHex: string;
  pubKeyHex: string;
  p2pkTree: string;
  address: string;
}

interface EvalFixture {
  unsignedTx: any;
  inputBoxes: any[];
  trackerBox: any;
  dupBox: any;
  unlockBox: any;
  trackerTree: string;
  dupTree: string;
  committeeRegister: string;
  trackerLatestSidechainHeight: number;
  plan: AggregateSettlementPlan;
  spvHistory: SpvTrackerHistoryEntry[];
  trackerIdentity: SpvTrackerIdentity;
  dupHistoryKeys: string[];
  burnProof: TrustlessBurnMerkleProofStep[];
  signerPrivateKeys: string[];
  height: number;
}

interface EvalCase {
  unsignedTx: any;
  inputBoxes: any[];
}

let wasmModule: any;

function loopbackNodeEndpoint(): string {
  const optionIndex = process.argv.indexOf('--node');
  const raw = optionIndex === -1 ? 'http://127.0.0.1:9051' : process.argv[optionIndex + 1];
  if (!raw) throw new Error('--node requires a loopback HTTP endpoint');
  const parsed = new URL(raw);
  if (
    parsed.protocol !== 'http:' ||
    (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost')
  ) {
    throw new Error('--node must use http://127.0.0.1 or http://localhost');
  }
  return raw.replace(/\/$/, '');
}

async function getWasm(): Promise<any> {
  if (!wasmModule) {
    // @ts-ignore CommonJS/ESM interop in ergo-lib-wasm-nodejs.
    wasmModule = await import('ergo-lib-wasm-nodejs');
    if (wasmModule.default) wasmModule = wasmModule.default;
  }
  return wasmModule;
}

async function readNodeJson(path: string): Promise<any> {
  if (
    path !== '/info' &&
    path !== '/blocks/lastHeaders/10' &&
    !path.startsWith('/script/addressToTree/')
  ) {
    throw new Error(`read-only node route is not permitted: ${path}`);
  }
  const response = await fetch(`${NODE_ENDPOINT}${path}`, {
    headers: { api_key: NODE_API_KEY },
  });
  if (!response.ok) {
    throw new Error(`GET ${path}: ${response.status} ${await response.text()}`);
  }
  return parseNodeJsonPreservingPowDistance(await response.text());
}

async function compileContract(name: string, source: string): Promise<string> {
  const response = await fetch(`${NODE_ENDPOINT}/script/p2sAddress`, {
    method: 'POST',
    headers: { api_key: NODE_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, treeVersion: 0 }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || typeof data?.address !== 'string') {
    throw new Error(`${name} compile failed: ${response.status} ${JSON.stringify(data)}`);
  }
  const tree = await readNodeJson(`/script/addressToTree/${data.address}`);
  if (typeof tree?.tree !== 'string') {
    throw new Error(`${name} compiler response did not contain an ErgoTree`);
  }
  console.log(`${name}: ${tree.tree.length / 2} compiled bytes`);
  return tree.tree;
}

async function buildStateContext(wasm: any): Promise<{ stateContext: any; height: number }> {
  const observed = await readNodeJson('/blocks/lastHeaders/10');
  if (!Array.isArray(observed) || observed.length !== 10) {
    throw new Error(`ten mined headers required for the upcoming state context, got ${String(observed?.length ?? 'invalid')}`);
  }
  const headers = [...observed].sort((a: any, b: any) => Number(b.height) - Number(a.height));
  for (let index = 0; index < headers.length - 1; index++) {
    if (
      Number(headers[index].height) !== Number(headers[index + 1].height) + 1
      || String(headers[index].parentId).toLowerCase() !== String(headers[index + 1].id).toLowerCase()
    ) {
      throw new Error('mined context headers must be contiguous and parent-linked newest-first');
    }
  }
  const latestMined = wasm.BlockHeader.from_json(JSON.stringify(headers[0]));
  const preHeaderCarrier = wasm.BlockHeader.from_json(JSON.stringify(
    buildWasmSimplifiedUpcomingPreHeaderCarrier(headers[0]),
  ));
  const blockHeaders = new wasm.BlockHeaders(latestMined);
  for (let index = 1; index < headers.length; index++) {
    blockHeaders.add(wasm.BlockHeader.from_json(JSON.stringify(headers[index])));
  }
  return {
    stateContext: new wasm.ErgoStateContext(
      wasm.PreHeader.from_block_header(preHeaderCarrier),
      blockHeaders,
      wasm.Parameters.default_parameters(),
    ),
    height: Number(headers[0].height) + 1,
  };
}

async function makeKeyPair(wasm: any): Promise<KeyPair> {
  const secretKey = wasm.SecretKey.random_dlog();
  const address = secretKey.get_address();
  return {
    privateKeyHex: Buffer.from(secretKey.to_bytes()).toString('hex'),
    pubKeyHex: Buffer.from(address.content_bytes()).toString('hex'),
    p2pkTree: address.to_ergo_tree().to_base16_bytes(),
    address: address.to_base58(16),
  };
}

async function normalizeBox(wasm: any, box: any): Promise<any> {
  return wasm.ErgoBoxes.from_boxes_json([box]).get(0).to_js_eip12();
}

function token(tokenId: string): Array<{ tokenId: string; amount: string }> {
  return [{ tokenId, amount: '1' }];
}

async function syntheticBox(
  wasm: any,
  input: {
    value: number;
    ergoTree: string;
    assets?: any[];
    additionalRegisters: Record<string, string>;
    transactionByte: number;
    creationHeight: number;
  },
): Promise<any> {
  return normalizeBox(wasm, {
    value: String(input.value),
    ergoTree: input.ergoTree,
    assets: input.assets ?? [],
    additionalRegisters: input.additionalRegisters,
    transactionId: input.transactionByte.toString(16).padStart(2, '0').repeat(32),
    index: 0,
    creationHeight: input.creationHeight,
  });
}

async function signSyntheticTx(
  wasm: any,
  stateContext: any,
  unsignedTx: any,
  inputBoxes: any[],
  privateKeyHexes: readonly string[],
): Promise<any> {
  const secretKeys = new wasm.SecretKeys();
  for (const privateKeyHex of privateKeyHexes) {
    secretKeys.add(wasm.SecretKey.dlog_from_bytes(Buffer.from(privateKeyHex, 'hex')));
  }
  const wallet = wasm.Wallet.from_secrets(secretKeys);
  const unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify(unsignedTx));
  return JSON.parse(wallet.sign_transaction(
    stateContext,
    unsigned,
    wasm.ErgoBoxes.from_boxes_json(inputBoxes),
    wasm.ErgoBoxes.empty(),
  ).to_json());
}

function rejectionReason(error: unknown, expected: ExpectedRejection): string | null {
  const name = String((error as any)?.name ?? '');
  const message = String((error as any)?.message ?? error);
  if (expected.kind === 'avl-trap') {
    return name === 'RuntimeError' && message === 'unreachable'
      ? 'AVL verifier trap'
      : null;
  }

  const prefix = `Transaction signing error: Prover error (tx input index ${expected.inputIndex}):`;
  if (name !== 'WalletError' || !message.startsWith(prefix)) return null;
  if (expected.kind === 'script-false') {
    return message.startsWith(`${prefix} Script reduced to false.`)
      ? 'Script reduced to false'
      : null;
  }
  if (expected.kind === 'tree-proof') {
    if (message.includes('Tree proof is incorrect')) return 'Tree proof is incorrect';
    return message.includes('starting_digest.starts_with') ? 'AVL starting-digest mismatch' : null;
  }
  return message.includes('Evaluation error: eval error:')
    ? 'indexed evaluation error'
    : null;
}

async function expectReject(
  wasm: any,
  stateContext: any,
  name: string,
  unsignedTx: any,
  inputBoxes: any[],
  privateKeyHexes: readonly string[],
  expected: ExpectedRejection,
): Promise<void> {
  try {
    await signSyntheticTx(wasm, stateContext, unsignedTx, inputBoxes, privateKeyHexes);
  } catch (error) {
    const reason = rejectionReason(error, expected);
    if (!reason) throw error;
    console.log(`PASS ${name}: ${reason}`);
    return;
  }
  throw new Error(`${name}: invalid transaction unexpectedly signed`);
}

function blake2b256(data: Buffer): Buffer {
  return Buffer.from(blakejs.blake2b(data, undefined, 32));
}

function blake2b256Hex(data: Buffer | string): string {
  const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return blake2b256(bytes).toString('hex');
}

function resolveBurnRootHex(
  encodedLeaf: Buffer,
  proof: readonly TrustlessBurnMerkleProofStep[],
): string {
  let current = blake2b256(Buffer.concat([BURN_LEAF_DOMAIN, encodedLeaf]));
  for (const step of proof) {
    const sibling = Buffer.from(step.hashHex, 'hex');
    current = step.side === 'left'
      ? blake2b256(Buffer.concat([BURN_NODE_DOMAIN, sibling, current]))
      : blake2b256(Buffer.concat([BURN_NODE_DOMAIN, current, sibling]));
  }
  return current.toString('hex');
}

function injectCommittee(source: string, pubKeys: readonly string[]): string {
  return injectCommitteePlaceholders(source, createCommitteeConfig(pubKeys, '2'));
}

function corruptProofHex(proofHex: string): string {
  const proof = Buffer.from(proofHex, 'hex');
  if (proof.length === 0) throw new Error('cannot corrupt an empty proof');
  proof[proof.length - 1] ^= 0x01;
  return proof.toString('hex');
}

function replaceDupLookupInBundle(bundleRegister: string, replacementLookupHex: string): string {
  const bundle = Buffer.from(decodeCollByteRegister(bundleRegister), 'hex');
  const nodeCount = Number(bundle.readBigUInt64BE(8));
  const lookupLength = Number(bundle.readBigUInt64BE(16));
  const burnProofEnd = 24 + nodeCount * 33;
  const insertProof = bundle.subarray(burnProofEnd + lookupLength);
  const replacement = Buffer.from(replacementLookupHex, 'hex');
  const replacementLength = Buffer.alloc(8);
  replacementLength.writeBigUInt64BE(BigInt(replacement.length));
  return encodeCollByteRegister(Buffer.concat([
    bundle.subarray(0, 16),
    replacementLength,
    bundle.subarray(24, burnProofEnd),
    replacement,
    insertProof,
  ]));
}

async function bindTrackerRoot(
  wasm: any,
  fixture: EvalFixture,
  unsignedTx: any,
  bridgeEventRootHex: string,
  transactionByte: number,
): Promise<EvalCase> {
  const targetKey = fixture.plan.claims[0].trackerKeyHex;
  const alternateHistory = fixture.spvHistory.map(entry => entry.key === targetKey
    ? {
        ...entry,
        value: encodeSpvTrackerValue({
          bridgeEventRootHex,
          ergoAnchorHeight: fixture.plan.claims[0].ergoAnchorHeight,
        }),
      }
    : entry);
  const trackerProof = buildSpvTrackerGetProof(alternateHistory, fixture.trackerIdentity);
  const trackerBox = await syntheticBox(wasm, {
    value: MIN_BOX_VALUE,
    ergoTree: fixture.trackerTree,
    assets: token(TRACKER_NFT_ID),
    additionalRegisters: {
      R4: encodeLongRegister(3),
      R5: encodeSpvTrackerAvlRegister(trackerProof.digestHex),
      R6: fixture.committeeRegister,
      R7: encodeLongRegister(fixture.trackerLatestSidechainHeight),
      R8: encodeIntRegister(fixture.height - 1),
    },
    transactionByte,
    creationHeight: fixture.height - 1,
  });
  const rebound = structuredClone(unsignedTx);
  rebound.inputs[0].boxId = trackerBox.boxId;
  rebound.inputs[2].extension['1'] = encodeCollByteRegister(
    Buffer.from(trackerProof.getProofHex, 'hex'),
  );
  rebound.outputs[0].additionalRegisters.R5 = encodeSpvTrackerAvlRegister(
    trackerProof.digestHex,
  );
  return {
    unsignedTx: rebound,
    inputBoxes: [trackerBox, fixture.dupBox, fixture.unlockBox],
  };
}

async function mutateLeafWithMatchingRoot(
  wasm: any,
  fixture: EvalFixture,
  offset: number,
  transactionByte: number,
): Promise<EvalCase> {
  const mutated = structuredClone(fixture.unsignedTx);
  const extension = mutated.inputs[2].extension as Record<string, string>;
  const leaf = Buffer.from(decodeCollByteRegister(extension['2']), 'hex');
  leaf[offset] ^= 0x01;
  extension['2'] = encodeCollByteRegister(leaf);
  return bindTrackerRoot(
    wasm,
    fixture,
    mutated,
    resolveBurnRootHex(leaf, fixture.burnProof),
    transactionByte,
  );
}

async function buildFixture(wasm: any, height: number): Promise<EvalFixture> {
  if (height < 12) {
    throw new Error(`VM fixture requires Ergo height >= 12, got ${height}`);
  }

  const committee = [
    await makeKeyPair(wasm),
    await makeKeyPair(wasm),
    await makeKeyPair(wasm),
  ];
  const recipient = await makeKeyPair(wasm);
  const alternateRecipient = await makeKeyPair(wasm);
  const committeePubKeys = committee.map(member => member.pubKeyHex);

  const trackerTree = await compileContract(
    'SPVTracker',
    readFileSync(resolve(CONTRACTS_DIR, 'SPVTracker.es'), 'utf8'),
  );
  const dupTree = await compileContract(
    'DoubleUnlockPreventionAggregate',
    injectCommittee(
      readFileSync(resolve(CONTRACTS_DIR, 'DoubleUnlockPreventionAggregate.es'), 'utf8'),
      committeePubKeys,
    ),
  );
  const unlockTree = await compileContract(
    'MainChainAggregateUnlockTrustless',
    readFileSync(resolve(CONTRACTS_DIR, 'MainChainAggregateUnlockTrustless.es'), 'utf8')
      .replaceAll('TRACKER_NFT_ID_PLACEHOLDER', TRACKER_NFT_ID)
      .replaceAll('DUP_NFT_ID_PLACEHOLDER', DUP_NFT_ID),
  );

  const sidechainIdHex = blake2b256Hex('spike12-sidechain');
  const sidechainBlockHashHex = blake2b256Hex('spike12-sidechain-block');
  const sidechainHeight = 1_024;
  const sidechainTxHashHex = blake2b256Hex('spike12-target-burn-tx');
  const eventIndex = 7;
  const burnIdHex = deriveTrustlessBurnIdHex({ sidechainIdHex, sidechainTxHashHex, eventIndex });
  const recipientHashHex = blake2b256Hex(Buffer.from(recipient.p2pkTree, 'hex'));

  const decoyTxHashHex = blake2b256Hex('spike12-decoy-burn-tx');
  const decoyEventIndex = 8;
  const burnLeaves: TrustlessBurnLeafInput[] = [
    {
      sidechainIdHex,
      sidechainBlockHashHex,
      burnIdHex: deriveTrustlessBurnIdHex({
        sidechainIdHex,
        sidechainTxHashHex: decoyTxHashHex,
        eventIndex: decoyEventIndex,
      }),
      sidechainTxHashHex: decoyTxHashHex,
      eventIndex: decoyEventIndex,
      recipientErgoTreeHashHex: blake2b256Hex(Buffer.from(alternateRecipient.p2pkTree, 'hex')),
      amountNanoErg: PAYOUT_VALUE + 1,
      assetIdHex: ZERO_ASSET_ID,
    },
    {
      sidechainIdHex,
      sidechainBlockHashHex,
      burnIdHex,
      sidechainTxHashHex,
      eventIndex,
      recipientErgoTreeHashHex: recipientHashHex,
      amountNanoErg: PAYOUT_VALUE,
      assetIdHex: ZERO_ASSET_ID,
    },
  ];
  const inclusion = buildTrustlessBurnInclusionProof(burnLeaves, burnIdHex);
  if (inclusion.proof.length === 0) {
    throw new Error('burn inclusion proof must be non-empty');
  }

  const trackerIdentity: SpvTrackerIdentity = {
    sidechainIdHex,
    sidechainHeight,
    sidechainHeaderHashHex: sidechainBlockHashHex,
  };
  const targetTrackerEntry = {
    ...trackerIdentity,
    bridgeEventRootHex: inclusion.bridgeEventRootHex,
    ergoAnchorHeight: height - 10,
  };
  const spvHistory = [
    toSpvTrackerHistoryEntry({
      sidechainIdHex,
      sidechainHeight: sidechainHeight - 1,
      sidechainHeaderHashHex: blake2b256Hex('spike12-prior-header'),
      bridgeEventRootHex: blake2b256Hex('spike12-prior-root'),
      ergoAnchorHeight: height - 11,
    }),
    toSpvTrackerHistoryEntry(targetTrackerEntry),
    toSpvTrackerHistoryEntry({
      sidechainIdHex,
      sidechainHeight: sidechainHeight + 1,
      sidechainHeaderHashHex: blake2b256Hex('spike12-later-header'),
      bridgeEventRootHex: blake2b256Hex('spike12-later-root'),
      ergoAnchorHeight: height - 9,
    }),
  ];
  const dupHistoryKeys = [
    blake2b256Hex('spike12-prior-dup-1'),
    blake2b256Hex('spike12-prior-dup-2'),
    blake2b256Hex('spike12-prior-dup-3'),
  ];

  const plan = buildAggregateSettlementPlan({
    spvHistory,
    dupHistoryKeys,
    claims: [{
      pegOut: {
        user: '0x' + '44'.repeat(20),
        amount: BigInt(PAYOUT_VALUE),
        ergoRecipientAddress: recipient.address,
        sidechainTxHash: sidechainTxHashHex,
        sidechainBlockNumber: sidechainHeight,
        sidechainLogIndex: eventIndex,
      },
      trackerIdentity,
      settlementIdentity: {
        source: 'trustless-burn-leaf',
        duplicatePreventionKeyHex: burnIdHex,
        bridgeEventRootHex: inclusion.bridgeEventRootHex,
        recipientErgoTreeHashHex: recipientHashHex,
        amountNanoErg: PAYOUT_VALUE,
        assetIdHex: ZERO_ASSET_ID,
        trustlessBurnProof: inclusion.proof,
      },
    }],
  });

  const trackerProofBytes = Buffer.from(plan.claims[0].trackerProofHex, 'hex').length;
  const dupLookupBytes = Buffer.from(plan.claims[0].dupLookupProofHex, 'hex').length;
  const dupInsertBytes = Buffer.from(plan.dupProofs.insert_proof_hex, 'hex').length;
  if (trackerProofBytes === 0 || dupLookupBytes === 0 || dupInsertBytes === 0) {
    throw new Error('tracker lookup and DUP lookup/insert proofs must all be non-empty');
  }

  const committeeRegister = encodeSigmaPropRegister(committee[0].pubKeyHex);
  const trackerLatestSidechainHeight = sidechainHeight + 1;
  const trackerBox = await syntheticBox(wasm, {
    value: MIN_BOX_VALUE,
    ergoTree: trackerTree,
    assets: token(TRACKER_NFT_ID),
    additionalRegisters: {
      R4: encodeLongRegister(3),
      R5: encodeSpvTrackerAvlRegister(plan.trackerInputDigestHex),
      R6: committeeRegister,
      R7: encodeLongRegister(trackerLatestSidechainHeight),
      R8: encodeIntRegister(height - 1),
    },
    transactionByte: 0x31,
    creationHeight: height - 1,
  });
  const dupBox = await syntheticBox(wasm, {
    value: MIN_BOX_VALUE,
    ergoTree: dupTree,
    assets: token(DUP_NFT_ID),
    additionalRegisters: {
      R4: encodeLongRegister(9),
      R5: encodeAvlTreeRegister(Buffer.from(getDupTreeDigest(dupHistoryKeys), 'hex'), DUP_FLAGS, 1),
      R6: committeeRegister,
    },
    transactionByte: 0x32,
    creationHeight: height - 1,
  });
  const unlockBox = await syntheticBox(wasm, {
    value: PAYOUT_VALUE + MINER_FEE,
    ergoTree: unlockTree,
    additionalRegisters: {
      R4: encodeCollByteRegister(Buffer.from(blake2b256Hex('spike12-vault-deposit'), 'hex')),
      R5: encodeCollByteRegister(Buffer.from('55'.repeat(20), 'hex')),
      R6: encodeLongRegister(PAYOUT_VALUE),
      R7: encodeCollByteRegister(Buffer.from(recipient.p2pkTree, 'hex')),
    },
    transactionByte: 0x33,
    creationHeight: height - 1,
  });

  const deployed = {
    spvTracker: {
      nftId: TRACKER_NFT_ID,
      boxId: trackerBox.boxId,
      address: 'synthetic-spv-tracker',
      ergoTreeHex: trackerTree,
    },
    doubleUnlockPreventionAggregate: {
      nftId: DUP_NFT_ID,
      boxId: dupBox.boxId,
      address: 'synthetic-aggregate-dup',
      ergoTreeHex: dupTree,
    },
    mainChainAggregateUnlockTrustless: {
      address: 'synthetic-proof-bound-vault',
      ergoTreeHex: unlockTree,
    },
  };
  const unsignedTx = buildTrustlessSingleLeafAggregateSettlementTx({
    deployed,
    plan,
    trackerBox,
    aggregateDupBox: dupBox,
    unlockBox,
    recipientErgoTreeHex: recipient.p2pkTree,
    creationHeight: height,
  });

  console.log(
    `Proof sizes: burnNodes=${inclusion.proof.length} tracker=${trackerProofBytes}B ` +
    `dupLookup=${dupLookupBytes}B dupInsert=${dupInsertBytes}B`,
  );

  return {
    unsignedTx,
    inputBoxes: [trackerBox, dupBox, unlockBox],
    trackerBox,
    dupBox,
    unlockBox,
    trackerTree,
    dupTree,
    committeeRegister,
    trackerLatestSidechainHeight,
    plan,
    spvHistory,
    trackerIdentity,
    dupHistoryKeys,
    burnProof: inclusion.proof,
    signerPrivateKeys: [committee[0].privateKeyHex, committee[1].privateKeyHex],
    height,
  };
}

async function runNegativeMatrix(wasm: any, stateContext: any, fixture: EvalFixture): Promise<void> {
  const { unsignedTx, inputBoxes, signerPrivateKeys } = fixture;

  const wrongRecipient = structuredClone(unsignedTx);
  wrongRecipient.outputs[2].ergoTree = inputBoxes[0].ergoTree;
  await expectReject(
    wasm,
    stateContext,
    'wrong recipient',
    wrongRecipient,
    inputBoxes,
    signerPrivateKeys,
    { kind: 'script-false', inputIndex: 2 },
  );

  const wrongAmount = structuredClone(unsignedTx);
  wrongAmount.outputs[2].value = Number(wrongAmount.outputs[2].value) - 1;
  wrongAmount.outputs[wrongAmount.outputs.length - 1].value =
    Number(wrongAmount.outputs[wrongAmount.outputs.length - 1].value) + 1;
  await expectReject(
    wasm,
    stateContext,
    'wrong amount',
    wrongAmount,
    inputBoxes,
    signerPrivateKeys,
    { kind: 'script-false', inputIndex: 2 },
  );

  const semanticMutations = [
    ['wrong asset', 173, 0x40],
    ['wrong sidechain ID', 1, 0x41],
    ['wrong block identity', 33, 0x42],
    ['wrong event index', 132, 0x43],
    ['wrong burn ID', 65, 0x44],
  ] as const;
  for (const [name, offset, transactionByte] of semanticMutations) {
    const scenario = await mutateLeafWithMatchingRoot(wasm, fixture, offset, transactionByte);
    await expectReject(
      wasm,
      stateContext,
      name,
      scenario.unsignedTx,
      scenario.inputBoxes,
      signerPrivateKeys,
      { kind: 'script-false', inputIndex: 2 },
    );
  }

  const wrongDupKey = structuredClone(unsignedTx);
  const wrongDupKeyHex = blake2b256Hex('spike12-wrong-dup-key');
  const wrongDupProofs = JSON.parse(bridge_generate_proofs(
    JSON.stringify(fixture.dupHistoryKeys),
    wrongDupKeyHex,
  ));
  wrongDupKey.inputs[1].extension['0'] = encodeCollByteRegister(
    Buffer.from(wrongDupProofs.lookup_proof_hex, 'hex'),
  );
  wrongDupKey.inputs[1].extension['1'] = encodeCollByteRegister(
    Buffer.from(wrongDupKeyHex, 'hex'),
  );
  wrongDupKey.inputs[1].extension['2'] = encodeCollByteRegister(
    Buffer.from(wrongDupProofs.insert_proof_hex, 'hex'),
  );
  await expectReject(
    wasm,
    stateContext,
    'wrong DUP key with valid proofs',
    wrongDupKey,
    inputBoxes,
    signerPrivateKeys,
    { kind: 'script-false', inputIndex: 1 },
  );

  const corruptTrackerProof = structuredClone(unsignedTx);
  const trackerProofHex = decodeCollByteRegister(corruptTrackerProof.inputs[2].extension['1']);
  corruptTrackerProof.inputs[2].extension['1'] = encodeCollByteRegister(
    Buffer.from(corruptProofHex(trackerProofHex), 'hex'),
  );
  await expectReject(
    wasm,
    stateContext,
    'malformed non-empty tracker proof',
    corruptTrackerProof,
    inputBoxes,
    signerPrivateKeys,
    { kind: 'tree-proof', inputIndex: 2 },
  );

  const corruptDupProof = structuredClone(unsignedTx);
  const dupLookupHex = decodeCollByteRegister(corruptDupProof.inputs[1].extension['0']);
  const corruptedDupLookupHex = corruptProofHex(dupLookupHex);
  corruptDupProof.inputs[1].extension['0'] = encodeCollByteRegister(Buffer.from(corruptedDupLookupHex, 'hex'));
  corruptDupProof.inputs[2].extension['3'] = replaceDupLookupInBundle(
    corruptDupProof.inputs[2].extension['3'],
    corruptedDupLookupHex,
  );
  await expectReject(
    wasm,
    stateContext,
    'malformed non-empty DUP proof',
    corruptDupProof,
    inputBoxes,
    signerPrivateKeys,
    { kind: 'tree-proof', inputIndex: 1 },
  );

  const reorderedInputs = structuredClone(unsignedTx);
  [reorderedInputs.inputs[0], reorderedInputs.inputs[1]] = [reorderedInputs.inputs[1], reorderedInputs.inputs[0]];
  await expectReject(
    wasm,
    stateContext,
    'input ordering drift',
    reorderedInputs,
    [inputBoxes[1], inputBoxes[0], inputBoxes[2]],
    signerPrivateKeys,
    { kind: 'avl-trap' },
  );

  const reorderedSuccessors = structuredClone(unsignedTx);
  [reorderedSuccessors.outputs[0], reorderedSuccessors.outputs[1]] = [
    reorderedSuccessors.outputs[1],
    reorderedSuccessors.outputs[0],
  ];
  await expectReject(
    wasm,
    stateContext,
    'successor ordering drift',
    reorderedSuccessors,
    inputBoxes,
    signerPrivateKeys,
    { kind: 'evaluation-error', inputIndex: 0 },
  );

  const alternateRoot = blake2b256Hex('spike12-wrong-supplied-tracker-root');
  const wrongTrackerValue = await bindTrackerRoot(
    wasm,
    fixture,
    unsignedTx,
    alternateRoot,
    0x45,
  );
  await expectReject(
    wasm,
    stateContext,
    'wrong supplied tracker value with matching AVL proof',
    wrongTrackerValue.unsignedTx,
    wrongTrackerValue.inputBoxes,
    signerPrivateKeys,
    { kind: 'script-false', inputIndex: 2 },
  );

  const duplicateHistory = [...fixture.dupHistoryKeys, fixture.plan.claims[0].duplicatePreventionKeyHex];
  const duplicateMembership = JSON.parse(bridge_lookup_membership(
    JSON.stringify(duplicateHistory),
    fixture.plan.claims[0].duplicatePreventionKeyHex,
  ));
  const duplicateDupBox = await syntheticBox(wasm, {
    value: MIN_BOX_VALUE,
    ergoTree: fixture.dupTree,
    assets: token(DUP_NFT_ID),
    additionalRegisters: {
      R4: encodeLongRegister(9),
      R5: encodeAvlTreeRegister(Buffer.from(duplicateMembership.digest_hex, 'hex'), DUP_FLAGS, 1),
      R6: fixture.committeeRegister,
    },
    transactionByte: 0x35,
    creationHeight: fixture.height - 1,
  });
  const duplicateSpend = structuredClone(unsignedTx);
  duplicateSpend.inputs[1].boxId = duplicateDupBox.boxId;
  duplicateSpend.inputs[1].extension['0'] = encodeCollByteRegister(
    Buffer.from(duplicateMembership.lookup_proof_hex, 'hex'),
  );
  duplicateSpend.inputs[2].extension['3'] = replaceDupLookupInBundle(
    duplicateSpend.inputs[2].extension['3'],
    duplicateMembership.lookup_proof_hex,
  );
  duplicateSpend.outputs[1].additionalRegisters.R5 = encodeAvlTreeRegister(
    Buffer.from(duplicateMembership.digest_hex, 'hex'),
    DUP_FLAGS,
    1,
  );
  await expectReject(
    wasm,
    stateContext,
    'duplicate burn already present in DUP',
    duplicateSpend,
    [fixture.trackerBox, duplicateDupBox, fixture.unlockBox],
    signerPrivateKeys,
    { kind: 'script-false', inputIndex: 1 },
  );
}

async function main(): Promise<void> {
  console.log('WP-04 proof-bound full-transaction ErgoScript VM evaluation');
  const nodeInfo = await readNodeJson('/info');
  const wasm = await getWasm();
  const { stateContext, height } = await buildStateContext(wasm);
  console.log(`Read-only node context: ${String(nodeInfo.network)} height=${height}`);

  const fixture = await buildFixture(wasm, height);
  const started = performance.now();
  const signed = await signSyntheticTx(
    wasm,
    stateContext,
    fixture.unsignedTx,
    fixture.inputBoxes,
    fixture.signerPrivateKeys,
  );
  console.log(
    `PASS valid full transaction: ${String(signed.id).slice(0, 24)}... ` +
    `eval=${(performance.now() - started).toFixed(1)}ms`,
  );

  await runNegativeMatrix(wasm, stateContext, fixture);
  console.log('PASS WP-04 supplied-root proof-binding matrix.');
  console.log('BOUNDARY: tracker-root authentication, sidechain finality, Gate 5 closure, and production readiness remain open.');
}

main().catch(error => {
  console.error('FATAL:', error);
  process.exit(1);
});
