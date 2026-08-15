/**
 * Spike 14: authenticated V2 settlement full-transaction VM evaluation.
 *
 * Both modes derive the exact current linked trees with the pinned JVM
 * compiler. The default mode restricts the loopback node to /info and ten
 * mined headers, then derives the H+1 preheader used by node checks.
 * With `--jvm-conformance`, it verifies every input of the exact signed
 * transaction in the pinned JVM interpreter. A generic `--synthetic-context`
 * remains sigma-rust-only; the source-bound WP-06 entry point instead consumes
 * one process-local, JVM-canonical synthetic chain and replays the exact signed
 * transaction in the pinned JVM. Boxes, keys, and proofs are ephemeral. The
 * JVM adapter writes the secret-free fixture to an isolated per-run directory
 * under the pinned tool target and deletes it after execution. The tracker is a
 * read-only data input; no wallet, transaction check/submit/broadcast,
 * deployment state, runtime database, environment, log, or secret state is read.
 */
import { dirname, isAbsolute, resolve } from 'path';
import { fileURLToPath } from 'url';
import { isDeepStrictEqual } from 'util';

import blakejs from 'blakejs';

import {
  buildAuthenticatedSettlementPlan,
  type AuthenticatedSettlementPlan,
} from '../../aggregate-settlement-builder.js';
import { AUTHENTICATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS } from '../../aggregate-settlement-limits.js';
import { buildAuthenticatedSettlementTx } from '../../aggregate-settlement-tx.js';
import { getDupTreeDigest } from '../../avl-bridge.js';
import { buildBridgeCheckpointCommitmentV1 } from '../../bridge-checkpoint-commitment.js';
import { buildAggregateFinalityCommitmentV1 } from '../../bridge-finality-commitment.js';
import {
  buildAggregateFinalityProofV1,
  buildBridgeFinalityStatementV1,
} from '../../bridge-finality-proof.js';
import {
  decodeCollByteRegister,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
  MINER_FEE,
  MINER_FEE_TREE,
} from '../../ergo-encoding.js';
import {
  buildAuthenticatedSpvTrackerGetProof,
  decodeAuthenticatedSpvTrackerValue,
  encodeAuthenticatedSpvTrackerAvlRegister,
  encodeAuthenticatedSpvTrackerValue,
  type AuthenticatedSpvTrackerHistoryEntry,
} from '../../spv-tracker-authenticated.js';
import {
  buildTrustlessBurnInclusionProof,
  deriveTrustlessBurnIdHex,
  type TrustlessBurnLeafInput,
  type TrustlessBurnMerkleProofStep,
} from '../../trustless-burn-proof.js';
import {
  buildDeterministicSyntheticVmHeaderContext,
  compilePinnedAuthenticatedV2VmTrees,
  type PinnedAuthenticatedV2VmTrees,
} from '../../authenticated-v2-offline-vm-fixture.js';
import {
  buildWp06SourceBoundSettlementPlan,
  type Wp06SourceBoundSettlementPlan,
} from '../../wp06-source-bound-settlement.js';
import {
  assertWp06SourceToTrackerVmResultProvenance,
  type Wp06SourceToTrackerVmResult,
} from './spike15-wp06-source-to-tracker-vm.js';
import {
  buildAuthenticatedV2JvmVmFixture,
  verifyAuthenticatedV2JvmVmFixture,
} from '../../authenticated-v2-jvm-vm-conformance.js';
import type {
  AuthenticatedV2JvmVmConformanceReport,
} from '../../authenticated-v2-source-tree-conformance.js';
import { parseNodeJsonPreservingPowDistance } from '../../ergo-node-json.js';
import {
  buildWasmSimplifiedUpcomingPreHeaderCarrier,
  deriveSimplifiedUpcomingPreHeader,
  orderAndValidateMinedHeaderWindow,
} from '../../ergo-upcoming-state-context.js';
import {
  bridge_generate_proofs,
  bridge_lookup_membership,
} from '../../../../wasm-avl/pkg/bridge_avl.js';
import {
  assertWp06CanonicalJvmFixtureHeaderBinding,
  assertWp06CanonicalJvmHeaderVectorProvenance,
  getWp06CanonicalJvmHeaderWindow,
  loadWp06CanonicalJvmHeaderVector,
  WP06_CANONICAL_JVM_HEADER_CONTEXT_PROVENANCE,
} from '../../wp06-canonical-jvm-header-chain.js';
import {
  assertExactExecutableErgoTree,
  assertWp06SettlementJvmReplayReport,
  deriveWp06JvmReplayBinding,
  type Wp06JvmReplayBinding,
} from '../../wp06-source-bound-jvm-validation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRIDGE_ROOT = resolve(__dirname, '../../../..');
const WORKTREE_ROOT = resolve(BRIDGE_ROOT, '..');
const NODE_ENDPOINT = loopbackNodeEndpoint();
const NODE_API_KEY = 'hello';
const MIN_BOX_VALUE = 1_000_000;
const PAYOUT_VALUE = 1_000_000;
const VAULT_VALUE = PAYOUT_VALUE + MINER_FEE + MIN_BOX_VALUE;
const DUP_FLAGS = 0x0b;
const TRACKER_NFT_ID = 'a1'.repeat(32);
const DUP_NFT_ID = 'b2'.repeat(32);
const WRONG_TRACKER_NFT_ID = 'c3'.repeat(32);
const ZERO_ASSET_ID = '00'.repeat(32);
const BURN_LEAF_DOMAIN = Buffer.from('E2S_TRUSTLESS_BURN_LEAF_V1', 'ascii');
const BURN_NODE_DOMAIN = Buffer.from('E2S_TRUSTLESS_BURN_NODE_V1', 'ascii');

interface KeyPair {
  privateKeyHex: string;
  pubKeyHex: string;
  p2pkTree: string;
  address: string;
}

interface EvalFixture {
  unsignedTx: any;
  inputBoxes: any[];
  dataInputBoxes: any[];
  trackerBox: any;
  dupBox: any;
  unlockBox: any;
  trackerTree: string;
  dupTree: string;
  unlockTree: string;
  finalityAttestorRegister: string;
  bridgeCommitteeRegister: string;
  plan: AuthenticatedSettlementPlan;
  spvHistory: AuthenticatedSpvTrackerHistoryEntry[];
  dupHistoryKeys: string[];
  burnProof: TrustlessBurnMerkleProofStep[];
  signerPrivateKey: string;
  wrongRecipientErgoTree: string;
  height: number;
  wrongBindingUnlockTree: string;
}

interface EvalCase {
  unsignedTx: any;
  inputBoxes: any[];
  dataInputBoxes: any[];
}

interface ExactSignedSyntheticTx {
  transaction: any;
  bytes: Uint8Array;
}

export interface RunWp06SourceBoundSettlementVmInput {
  ergoSourcePath: string;
  sourceToTrackerHandoff: Wp06SourceToTrackerVmResult;
}

export interface Wp06SourceBoundSettlementVmResult {
  sourceToTrackerHandoff: Wp06SourceToTrackerVmResult;
  settlementPlan: AuthenticatedSettlementPlan;
  signedTransaction: Readonly<Record<string, unknown>>;
  trackerDataInputBoxId: string;
  duplicatePreventionKeyHex: string;
  recipientErgoTreeHex: string;
  payoutAmountNanoErg: string;
  settlementHeight: number;
  jvmConformanceReport: Readonly<AuthenticatedV2JvmVmConformanceReport>;
  jvmReplayBinding: Readonly<Wp06JvmReplayBinding>;
  negativeCases: readonly string[];
  boundary: {
    sourceSpecificTrackerSuccessorConsumed: true;
    trackerBoxReconstructed: false;
    exactTrackerAnchorContinued: true;
    chainRpcAccessEnabled: false;
    chainRpcWritesEnabled: false;
    ephemeralInMemorySigningUsed: true;
    externalWalletStateAccessed: false;
    nodeStatefulAcceptanceVerified: false;
    sourceBoundPinnedJvmReplayVerified: true;
    r9FinalityAuthority: true;
    gate5Closed: false;
    submitOrBroadcastEnabled: false;
  };
}

const WP06_SOURCE_BOUND_SETTLEMENT_RESULTS = new WeakSet<object>();

export const AUTHENTICATED_SETTLEMENT_NEGATIVE_CASES = Object.freeze([
  'wrong payout recipient',
  'wrong payout amount',
  'same tracker-attestor and bridge-committee proposition',
  'wrong tracker value/root with matching V2 proof',
  'wrong tracker NFT',
  'duplicate burn already present with membership proof',
  'wrong DUP key with valid consistent proofs',
  'malformed non-empty tracker proof',
  'malformed non-empty DUP proof in both inputs',
  'input order drift',
  'successor order drift',
  'insufficient Ergo anchor depth below 10',
  'wrong unlock-contract binding for DUP',
  'wrong sidechain ID with recomputed leaf root and matching V2 proof',
  'wrong block identity with recomputed leaf root and matching V2 proof',
  'wrong asset with recomputed leaf root and matching V2 proof',
] as const);

let wasmModule: any;

function loopbackNodeEndpoint(): string {
  const optionIndex = process.argv.indexOf('--node');
  const raw = optionIndex === -1 ? 'http://127.0.0.1:9051' : process.argv[optionIndex + 1];
  if (!raw) throw new Error('--node requires a loopback HTTP endpoint');
  const parsed = new URL(raw);
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
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
  const permitted =
    path === '/info' ||
    path === '/blocks/lastHeaders/10';
  if (!permitted) throw new Error(`read-only node route is not permitted: ${path}`);
  const response = await fetch(`${NODE_ENDPOINT}${path}`, {
    method: 'GET',
    headers: { api_key: NODE_API_KEY },
  });
  if (!response.ok) throw new Error(`GET ${path}: ${response.status} ${await response.text()}`);
  return parseNodeJsonPreservingPowDistance(await response.text());
}

async function buildStateContext(wasm: any): Promise<{
  stateContext: any;
  height: number;
  jvmHeaderContext: {
    preHeader: Record<string, unknown>;
    headers: Record<string, unknown>[];
  };
}> {
  const raw = await readNodeJson('/blocks/lastHeaders/10');
  if (!Array.isArray(raw) || raw.length !== 10) {
    throw new Error(`ten mined headers required for the upcoming state context, got ${String(raw?.length ?? 'invalid')}`);
  }
  const headers = orderAndValidateMinedHeaderWindow(raw);
  const preHeader = deriveSimplifiedUpcomingPreHeader(headers[0]);
  const latest = wasm.BlockHeader.from_json(JSON.stringify(headers[0]));
  const preHeaderCarrier = wasm.BlockHeader.from_json(JSON.stringify(
    buildWasmSimplifiedUpcomingPreHeaderCarrier(headers[0]),
  ));
  const blockHeaders = new wasm.BlockHeaders(latest);
  for (let index = 1; index < headers.length; index++) {
    blockHeaders.add(wasm.BlockHeader.from_json(JSON.stringify(headers[index])));
  }
  return {
    stateContext: new wasm.ErgoStateContext(
      wasm.PreHeader.from_block_header(preHeaderCarrier),
      blockHeaders,
      wasm.Parameters.default_parameters(),
    ),
    height: preHeader.height,
    jvmHeaderContext: { preHeader, headers },
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

async function syntheticBox(wasm: any, input: {
  value: number;
  ergoTree: string;
  assets?: any[];
  additionalRegisters: Record<string, string>;
  transactionByte: number;
  creationHeight: number;
}): Promise<any> {
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

function singleton(tokenId: string): Array<{ tokenId: string; amount: string }> {
  return [{ tokenId, amount: '1' }];
}

async function signSyntheticTx(
  wasm: any,
  stateContext: any,
  unsignedTx: any,
  inputBoxes: any[],
  dataInputBoxes: any[],
  privateKeyHex: string,
): Promise<any> {
  return (await signSyntheticTxWithExactBytes(
    wasm,
    stateContext,
    unsignedTx,
    inputBoxes,
    dataInputBoxes,
    privateKeyHex,
  )).transaction;
}

async function signSyntheticTxWithExactBytes(
  wasm: any,
  stateContext: any,
  unsignedTx: any,
  inputBoxes: any[],
  dataInputBoxes: any[],
  privateKeyHex: string,
): Promise<ExactSignedSyntheticTx> {
  const keys = new wasm.SecretKeys();
  keys.add(wasm.SecretKey.dlog_from_bytes(Buffer.from(privateKeyHex, 'hex')));
  const wallet = wasm.Wallet.from_secrets(keys);
  const signed = wallet.sign_transaction(
    stateContext,
    wasm.UnsignedTransaction.from_json(JSON.stringify(unsignedTx)),
    wasm.ErgoBoxes.from_boxes_json(inputBoxes),
    wasm.ErgoBoxes.from_boxes_json(dataInputBoxes),
  );
  return {
    transaction: JSON.parse(signed.to_json()),
    bytes: Uint8Array.from(signed.sigma_serialize_bytes()),
  };
}

async function expectIndexedReject(
  wasm: any,
  stateContext: any,
  name: string,
  scenario: EvalCase,
  privateKeyHex: string,
  inputIndex: 0 | 1,
): Promise<void> {
  try {
    await signSyntheticTx(
      wasm,
      stateContext,
      scenario.unsignedTx,
      scenario.inputBoxes,
      scenario.dataInputBoxes,
      privateKeyHex,
    );
  } catch (error) {
    const errorName = String((error as any)?.name ?? '');
    const message = String((error as any)?.message ?? error);
    const prefix = `Transaction signing error: Prover error (tx input index ${inputIndex}):`;
    if (errorName !== 'WalletError' || !message.startsWith(prefix)) throw error;
    console.log(`PASS ${name}: rejected at spent input ${inputIndex}`);
    return;
  }
  throw new Error(`${name}: invalid transaction unexpectedly signed`);
}

async function expectOrderingReject(
  wasm: any,
  stateContext: any,
  name: string,
  scenario: EvalCase,
  privateKeyHex: string,
): Promise<void> {
  try {
    await signSyntheticTx(
      wasm,
      stateContext,
      scenario.unsignedTx,
      scenario.inputBoxes,
      scenario.dataInputBoxes,
      privateKeyHex,
    );
  } catch (error) {
    const errorName = String((error as any)?.name ?? '');
    const message = String((error as any)?.message ?? error);
    if (
      (errorName === 'WalletError' && message.includes('Prover error (tx input index 0)')) ||
      (errorName === 'RuntimeError' && message === 'unreachable')
    ) {
      console.log(`PASS ${name}: rejected before any valid two-input evaluation`);
      return;
    }
    throw error;
  }
  throw new Error(`${name}: invalid transaction unexpectedly signed`);
}

function blake2b256(data: Buffer): Buffer {
  return Buffer.from(blakejs.blake2b(data, undefined, 32));
}

function hashHex(label: string): string {
  return blake2b256(Buffer.from(label, 'ascii')).toString('hex');
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

function corruptProofHex(hex: string): string {
  const proof = Buffer.from(hex, 'hex');
  if (proof.length === 0) throw new Error('cannot corrupt an empty proof');
  proof[proof.length - 1] ^= 0x01;
  return proof.toString('hex');
}

function replaceDupLookupInBundle(bundleRegister: string, lookupHex: string): string {
  const bundle = Buffer.from(decodeCollByteRegister(bundleRegister), 'hex');
  const burnNodeCount = Number(bundle.readBigUInt64BE(8));
  const oldLookupLength = Number(bundle.readBigUInt64BE(16));
  const burnProofEnd = 24 + burnNodeCount * 33;
  const insertProof = bundle.subarray(burnProofEnd + oldLookupLength);
  const lookup = Buffer.from(lookupHex, 'hex');
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(lookup.length));
  return encodeCollByteRegister(Buffer.concat([
    bundle.subarray(0, 16),
    length,
    bundle.subarray(24, burnProofEnd),
    lookup,
    insertProof,
  ]));
}

function trackerValue(
  rootHex: string,
  anchorHeight: number,
  identity: {
    sidechainIdHex: string;
    sidechainHeight: string | number | bigint;
    sidechainHeaderHashHex: string;
  },
): string {
  const checkpoint = buildBridgeCheckpointCommitmentV1({
    sidechainIdHex: identity.sidechainIdHex,
    sidechainHeight: identity.sidechainHeight,
    sidechainConsensusBlockHashHex: hashHex(
      `spike14-consensus-${identity.sidechainHeight}`,
    ),
    executionBlockHashHex: identity.sidechainHeaderHashHex,
    bridgeEventRootHex: rootHex,
    burnLeafCount: 1,
    finalityAuthoritySetId: 7,
    finalityAuthoritySetHashHex: hashHex('spike14-authority-set'),
    finalityProofHashHex: hashHex(`spike14-finality-${identity.sidechainHeight}`),
  });
  const statement = buildBridgeFinalityStatementV1({
    encodedCheckpointHex: checkpoint.encodedCheckpointHex,
    checkpointCommitmentHex: checkpoint.checkpointCommitmentHex,
    trustedAnchorDigestHex: hashHex('spike14-trusted-anchor'),
    finalityHorizonHeight: identity.sidechainHeight,
    finalityHorizonHashHex: hashHex(`spike14-horizon-${identity.sidechainHeight}`),
  });
  const proof = buildAggregateFinalityProofV1({
    verifierProfileIdHex: hashHex('spike14-verifier-profile'),
    encodedStatement: statement.encodedStatementHex,
    payload: Buffer.from(`spike14-proof-${identity.sidechainHeight}`, 'ascii'),
  });
  const commitment = buildAggregateFinalityCommitmentV1(proof);
  return encodeAuthenticatedSpvTrackerValue({
    bridgeEventRootHex: rootHex,
    checkpointCommitmentHex: checkpoint.checkpointCommitmentHex,
    anchorHeaderIdHex: hashHex('spike14-anchor-header'),
    anchorHeaderHeight: anchorHeight,
    finalityProofSystemId: commitment.proofSystemId,
    finalityStatementDigestHex: commitment.statementDigestHex,
    finalityProgramIdHex: commitment.statement.programIdHex,
    finalityVerifierProfileIdHex: commitment.verifierProfileIdHex,
    finalityProofPayloadDigestHex: commitment.payloadDigestHex,
    finalityProofDigestHex: commitment.proofDigestHex,
  });
}

function mutateConsumedTrackerValue(
  originalValueHex: string,
  mutation: {
    bridgeEventRootHex?: string;
    anchorHeaderHeight?: number;
  },
): string {
  const original = decodeAuthenticatedSpvTrackerValue(originalValueHex);
  return encodeAuthenticatedSpvTrackerValue({
    ...original,
    bridgeEventRootHex: mutation.bridgeEventRootHex ?? original.bridgeEventRootHex,
    anchorHeaderHeight: mutation.anchorHeaderHeight ?? original.anchorHeaderHeight,
  });
}

async function rebindTracker(
  wasm: any,
  fixture: EvalFixture,
  unsignedTx: any,
  valueHex: string,
  tokenId: string,
  transactionByte: number,
): Promise<EvalCase> {
  const targetKey = fixture.plan.claims[0].trackerKeyHex;
  const history = fixture.spvHistory.map(entry => entry.key === targetKey
    ? { key: entry.key, value: valueHex }
    : entry);
  const proof = buildAuthenticatedSpvTrackerGetProof(history, {
    sidechainIdHex: fixture.plan.claims[0].claim.trackerIdentity.sidechainIdHex,
    sidechainHeight: fixture.plan.claims[0].claim.trackerIdentity.sidechainHeight,
    executionBlockHashHex: fixture.plan.claims[0].claim.trackerIdentity.sidechainHeaderHashHex,
  });
  const box = await syntheticBox(wasm, {
    value: MIN_BOX_VALUE,
    ergoTree: fixture.trackerTree,
    assets: singleton(tokenId),
    additionalRegisters: {
      R4: encodeLongRegister(4),
      R5: encodeAuthenticatedSpvTrackerAvlRegister(proof.digestHex),
      R6: encodeCollByteRegister(Buffer.from(
        fixture.plan.claims[0].claim.trackerIdentity.sidechainIdHex,
        'hex',
      )),
      R7: encodeLongRegister(1_024),
      R8: encodeIntRegister(fixture.height - 1),
      R9: fixture.finalityAttestorRegister,
    },
    transactionByte,
    creationHeight: fixture.height - 1,
  });
  const rebound = structuredClone(unsignedTx);
  rebound.dataInputs[0].boxId = box.boxId;
  rebound.inputs[1].extension['1'] = encodeCollByteRegister(Buffer.from(proof.getProofHex, 'hex'));
  return { unsignedTx: rebound, inputBoxes: fixture.inputBoxes, dataInputBoxes: [box] };
}

async function buildFixture(
  wasm: any,
  height: number,
  compiledTrees: PinnedAuthenticatedV2VmTrees['trees'],
  wrongBindingUnlockTree: string,
): Promise<EvalFixture> {
  if (height < 11) throw new Error(`VM fixture requires Ergo height >= 11, got ${height}`);
  const recipient = await makeKeyPair(wasm);
  const decoyRecipient = await makeKeyPair(wasm);
  const finalityAttestorKey = await makeKeyPair(wasm);
  const bridgeCommitteeKey = await makeKeyPair(wasm);

  const trackerTree = compiledTrees.tracker;
  const unlockTree = compiledTrees.unlock;
  const dupTree = compiledTrees.duplicatePrevention;

  const sidechainIdHex = hashHex('spike14-sidechain');
  const executionBlockHashHex = hashHex('spike14-execution-block');
  const sidechainHeight = 1_024;
  const sidechainTxHashHex = hashHex('spike14-target-burn');
  const eventIndex = 7;
  const burnIdHex = deriveTrustlessBurnIdHex({ sidechainIdHex, sidechainTxHashHex, eventIndex });
  if (
    Buffer.from(decoyRecipient.p2pkTree, 'hex').length !== 36
    || decoyRecipient.p2pkTree === recipient.p2pkTree
  ) {
    throw new Error('wrong-recipient fixture must use a distinct 36-byte P2PK proposition');
  }
  const recipientHashHex = blake2b256(Buffer.from(recipient.p2pkTree, 'hex')).toString('hex');
  const decoyTxHashHex = hashHex('spike14-decoy-burn');
  const leaves: TrustlessBurnLeafInput[] = [
    {
      sidechainIdHex,
      sidechainBlockHashHex: executionBlockHashHex,
      burnIdHex: deriveTrustlessBurnIdHex({
        sidechainIdHex,
        sidechainTxHashHex: decoyTxHashHex,
        eventIndex: eventIndex + 1,
      }),
      sidechainTxHashHex: decoyTxHashHex,
      eventIndex: eventIndex + 1,
      recipientErgoTreeHashHex: blake2b256(Buffer.from(decoyRecipient.p2pkTree, 'hex')).toString('hex'),
      amountNanoErg: PAYOUT_VALUE + 1,
      assetIdHex: ZERO_ASSET_ID,
    },
    {
      sidechainIdHex,
      sidechainBlockHashHex: executionBlockHashHex,
      burnIdHex,
      sidechainTxHashHex,
      eventIndex,
      recipientErgoTreeHashHex: recipientHashHex,
      amountNanoErg: PAYOUT_VALUE,
      assetIdHex: ZERO_ASSET_ID,
    },
  ];
  const inclusion = buildTrustlessBurnInclusionProof(leaves, burnIdHex);
  if (inclusion.proof.length === 0) throw new Error('burn Merkle proof must be non-empty');

  const trackerIdentity = {
    sidechainIdHex,
    sidechainHeight,
    sidechainHeaderHashHex: executionBlockHashHex,
  };
  const targetKey = hashAuthenticatedTrackerKey(trackerIdentity);
  const spvHistory: AuthenticatedSpvTrackerHistoryEntry[] = [
    {
      key: hashAuthenticatedTrackerKey({
        sidechainIdHex,
        sidechainHeight: sidechainHeight - 1,
        sidechainHeaderHashHex: hashHex('spike14-prior-block'),
      }),
      value: trackerValue(hashHex('spike14-prior-root'), height - 11, {
        sidechainIdHex,
        sidechainHeight: sidechainHeight - 1,
        sidechainHeaderHashHex: hashHex('spike14-prior-block'),
      }),
    },
    {
      key: targetKey,
      value: trackerValue(inclusion.bridgeEventRootHex, height - 10, trackerIdentity),
    },
    {
      key: hashAuthenticatedTrackerKey({
        sidechainIdHex,
        sidechainHeight: sidechainHeight + 1,
        sidechainHeaderHashHex: hashHex('spike14-later-block'),
      }),
      value: trackerValue(hashHex('spike14-later-root'), height - 10, {
        sidechainIdHex,
        sidechainHeight: sidechainHeight + 1,
        sidechainHeaderHashHex: hashHex('spike14-later-block'),
      }),
    },
  ];
  if (spvHistory.some(entry => Buffer.from(entry.value, 'hex').length !== 264)) {
    throw new Error('authenticated tracker history values must use the 264-byte V2 encoding');
  }
  const dupHistoryKeys = [
    hashHex('spike14-prior-dup-1'),
    hashHex('spike14-prior-dup-2'),
    hashHex('spike14-prior-dup-3'),
  ];
  const plan = buildAuthenticatedSettlementPlan({
    spvHistory,
    dupHistoryKeys,
    claim: {
      pegOut: {
        user: `0x${'44'.repeat(20)}`,
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
    },
  });
  const trackerProofBytes = Buffer.from(plan.claims[0].trackerProofHex, 'hex').length;
  const dupLookupBytes = Buffer.from(plan.claims[0].dupLookupProofHex, 'hex').length;
  const dupInsertBytes = Buffer.from(plan.dupProofs.insert_proof_hex, 'hex').length;
  if (trackerProofBytes === 0 || dupLookupBytes === 0 || dupInsertBytes === 0) {
    throw new Error('tracker lookup and DUP lookup/insert proofs must be non-empty');
  }

  const finalityAttestorRegister = encodeSigmaPropRegister(
    finalityAttestorKey.pubKeyHex,
  );
  const bridgeCommitteeRegister = encodeSigmaPropRegister(
    bridgeCommitteeKey.pubKeyHex,
  );
  const trackerBox = await syntheticBox(wasm, {
    value: MIN_BOX_VALUE,
    ergoTree: trackerTree,
    assets: singleton(TRACKER_NFT_ID),
    additionalRegisters: {
      R4: encodeLongRegister(4),
      R5: encodeAuthenticatedSpvTrackerAvlRegister(plan.trackerInputDigestHex),
      R6: encodeCollByteRegister(Buffer.from(sidechainIdHex, 'hex')),
      R7: encodeLongRegister(sidechainHeight),
      R8: encodeIntRegister(height - 1),
      R9: finalityAttestorRegister,
    },
    transactionByte: 0x61,
    creationHeight: height - 1,
  });
  const dupBox = await syntheticBox(wasm, {
    value: MIN_BOX_VALUE,
    ergoTree: dupTree,
    assets: singleton(DUP_NFT_ID),
    additionalRegisters: {
      R4: encodeLongRegister(9),
      R5: encodeAvlTreeRegister(Buffer.from(getDupTreeDigest(dupHistoryKeys), 'hex'), DUP_FLAGS, 1),
      R6: bridgeCommitteeRegister,
    },
    transactionByte: 0x62,
    creationHeight: height - 1,
  });
  const unlockBox = await syntheticBox(wasm, {
    value: VAULT_VALUE,
    ergoTree: unlockTree,
    additionalRegisters: {
      R4: encodeCollByteRegister(Buffer.from(hashHex('spike14-vault-deposit'), 'hex')),
      R5: encodeCollByteRegister(Buffer.from('55'.repeat(20), 'hex')),
      R6: encodeLongRegister(PAYOUT_VALUE),
      R7: encodeCollByteRegister(Buffer.from(recipient.p2pkTree, 'hex')),
    },
    transactionByte: 0x63,
    creationHeight: height - 1,
  });
  const deployed = {
    spvTrackerAuthenticated: {
      nftId: TRACKER_NFT_ID,
      boxId: trackerBox.boxId,
      address: 'synthetic-authenticated-tracker',
      ergoTreeHex: trackerTree,
    },
    doubleUnlockPreventionAuthenticated: {
      nftId: DUP_NFT_ID,
      boxId: dupBox.boxId,
      address: 'synthetic-authenticated-dup',
      ergoTreeHex: dupTree,
    },
    mainChainAggregateUnlockAuthenticated: {
      address: 'synthetic-authenticated-vault',
      ergoTreeHex: unlockTree,
    },
  };
  const unsignedTx = buildAuthenticatedSettlementTx({
    deployed,
    plan,
    trackerBox,
    duplicatePreventionBox: dupBox,
    unlockBox,
    recipientErgoTreeHex: recipient.p2pkTree,
    creationHeight: height,
  });
  if (
    unsignedTx.inputs.length !== 2 ||
    unsignedTx.inputs[0].boxId !== dupBox.boxId ||
    unsignedTx.inputs[1].boxId !== unlockBox.boxId ||
    unsignedTx.dataInputs.length !== 1 ||
    unsignedTx.dataInputs[0].boxId !== trackerBox.boxId ||
    unsignedTx.outputs.length !== 4 ||
    unsignedTx.outputs[0].ergoTree !== dupTree ||
    unsignedTx.outputs[1].ergoTree !== recipient.p2pkTree ||
    unsignedTx.outputs[2].ergoTree !== unlockTree ||
    unsignedTx.outputs.at(-1).ergoTree !== MINER_FEE_TREE
  ) {
    throw new Error('authenticated V2 transaction shape drifted from the required positional ABI');
  }
  console.log(
    `Proof sizes: burnNodes=${inclusion.proof.length} tracker=${trackerProofBytes}B ` +
    `dupLookup=${dupLookupBytes}B dupInsert=${dupInsertBytes}B`,
  );
  console.log(`Ergo anchor depth only: ${height - plan.claims[0].ergoAnchorHeight} blocks`);
  return {
    unsignedTx,
    inputBoxes: [dupBox, unlockBox],
    dataInputBoxes: [trackerBox],
    trackerBox,
    dupBox,
    unlockBox,
    trackerTree,
    dupTree,
    unlockTree,
    finalityAttestorRegister,
    bridgeCommitteeRegister,
    plan,
    spvHistory,
    dupHistoryKeys,
    burnProof: inclusion.proof,
    signerPrivateKey: recipient.privateKeyHex,
    wrongRecipientErgoTree: decoyRecipient.p2pkTree,
    height,
    wrongBindingUnlockTree,
  };
}

async function buildWp06SourceBoundFixture(
  wasm: any,
  height: number,
  compiledTrees: PinnedAuthenticatedV2VmTrees['trees'],
  wrongBindingUnlockTree: string,
  bound: Wp06SourceBoundSettlementPlan,
  handoff: Wp06SourceToTrackerVmResult,
  dupHistoryKeys: string[],
): Promise<EvalFixture> {
  if (height < bound.minimumSettlementHeight) {
    throw new Error(
      `WP-06 settlement VM requires height >= ${bound.minimumSettlementHeight}, got ${height}`,
    );
  }
  if (handoff.trackerTree !== compiledTrees.tracker) {
    throw new Error('WP-06 admitted tracker successor tree differs from the linked settlement tree');
  }
  const trackerBox = bound.trackerBox as any;
  if (trackerBox !== handoff.admittedTrackerSuccessor) {
    throw new Error('WP-06 settlement VM must consume the exact admitted tracker successor object');
  }

  const evaluationSigner = await makeKeyPair(wasm);
  const wrongRecipient = await makeKeyPair(wasm);
  const bridgeCommitteeKey = await makeKeyPair(wasm);
  const finalityAttestorRegister = trackerBox.additionalRegisters?.R9;
  if (typeof finalityAttestorRegister !== 'string') {
    throw new Error('WP-06 admitted tracker successor is missing R9 finality authority');
  }
  const bridgeCommitteeRegister = encodeSigmaPropRegister(bridgeCommitteeKey.pubKeyHex);
  if (bridgeCommitteeRegister === finalityAttestorRegister) {
    throw new Error('WP-06 settlement VM requires distinct ephemeral authority propositions');
  }

  const payoutValueBigInt = BigInt(bound.payoutAmountNanoErg);
  if (payoutValueBigInt <= 0n || payoutValueBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('WP-06 payout amount must fit a positive safe integer for the VM fixture');
  }
  const payoutValue = Number(payoutValueBigInt);
  const vaultValue = payoutValue + MINER_FEE + MIN_BOX_VALUE;
  const dupTree = compiledTrees.duplicatePrevention;
  const unlockTree = compiledTrees.unlock;
  assertExactExecutableErgoTree(
    wasm,
    bound.recipientErgoTreeHex,
    'WP-06 payout recipient',
  );

  const dupBox = await syntheticBox(wasm, {
    value: MIN_BOX_VALUE,
    ergoTree: dupTree,
    assets: singleton(DUP_NFT_ID),
    additionalRegisters: {
      R4: encodeLongRegister(9),
      R5: encodeAvlTreeRegister(
        Buffer.from(getDupTreeDigest(dupHistoryKeys), 'hex'),
        DUP_FLAGS,
        1,
      ),
      R6: bridgeCommitteeRegister,
    },
    transactionByte: 0x72,
    creationHeight: height - 1,
  });
  const unlockBox = await syntheticBox(wasm, {
    value: vaultValue,
    ergoTree: unlockTree,
    additionalRegisters: {
      R4: encodeCollByteRegister(Buffer.from(hashHex('wp06-source-bound-vault-deposit'), 'hex')),
      R5: encodeCollByteRegister(Buffer.from('56'.repeat(20), 'hex')),
      R6: encodeLongRegister(payoutValue),
      R7: encodeCollByteRegister(Buffer.from(bound.recipientErgoTreeHex, 'hex')),
    },
    transactionByte: 0x73,
    creationHeight: height - 1,
  });
  const deployed = {
    spvTrackerAuthenticated: {
      nftId: bound.bindings.trackerSuccessor.nftIdHex,
      boxId: trackerBox.boxId,
      address: 'wp06-source-bound-tracker',
      ergoTreeHex: compiledTrees.tracker,
    },
    doubleUnlockPreventionAuthenticated: {
      nftId: DUP_NFT_ID,
      boxId: dupBox.boxId,
      address: 'synthetic-authenticated-dup',
      ergoTreeHex: dupTree,
    },
    mainChainAggregateUnlockAuthenticated: {
      address: 'synthetic-authenticated-vault',
      ergoTreeHex: unlockTree,
    },
  };
  const unsignedTx = buildAuthenticatedSettlementTx({
    deployed,
    plan: bound.plan,
    trackerBox,
    duplicatePreventionBox: dupBox,
    unlockBox,
    recipientErgoTreeHex: bound.recipientErgoTreeHex,
    creationHeight: height,
  });
  if (
    unsignedTx.inputs.length !== 2
    || unsignedTx.inputs[0].boxId !== dupBox.boxId
    || unsignedTx.inputs[1].boxId !== unlockBox.boxId
    || unsignedTx.dataInputs.length !== 1
    || unsignedTx.dataInputs[0].boxId !== trackerBox.boxId
    || unsignedTx.outputs.length !== 4
    || unsignedTx.outputs[0].ergoTree !== dupTree
    || unsignedTx.outputs[1].ergoTree !== bound.recipientErgoTreeHex
    || unsignedTx.outputs[1].value !== payoutValue
    || unsignedTx.outputs[2].ergoTree !== unlockTree
    || unsignedTx.outputs.at(-1).ergoTree !== MINER_FEE_TREE
  ) {
    throw new Error('WP-06 source-bound settlement transaction drifted from the positional ABI');
  }

  return {
    unsignedTx,
    inputBoxes: [dupBox, unlockBox],
    dataInputBoxes: [trackerBox],
    trackerBox,
    dupBox,
    unlockBox,
    trackerTree: compiledTrees.tracker,
    dupTree,
    unlockTree,
    finalityAttestorRegister,
    bridgeCommitteeRegister,
    plan: bound.plan,
    spvHistory: bound.trackerHistory.map(entry => ({ key: entry.key, value: entry.value })),
    dupHistoryKeys,
    burnProof: [...handoff.burnProofBundle.proof.proof],
    signerPrivateKey: evaluationSigner.privateKeyHex,
    wrongRecipientErgoTree: wrongRecipient.p2pkTree,
    height,
    wrongBindingUnlockTree,
  };
}

function hashAuthenticatedTrackerKey(identity: {
  sidechainIdHex: string;
  sidechainHeight: number;
  sidechainHeaderHashHex: string;
}): string {
  const heightBytes = Buffer.alloc(8);
  heightBytes.writeBigUInt64BE(BigInt(identity.sidechainHeight));
  return blake2b256(Buffer.concat([
    Buffer.from('E2S_SPV_V2', 'ascii'),
    Buffer.from(identity.sidechainIdHex, 'hex'),
    heightBytes,
    Buffer.from(identity.sidechainHeaderHashHex, 'hex'),
  ])).toString('hex');
}

async function runNegativeMatrix(wasm: any, stateContext: any, f: EvalFixture): Promise<void> {
  const base = (): EvalCase => ({
    unsignedTx: structuredClone(f.unsignedTx),
    inputBoxes: f.inputBoxes,
    dataInputBoxes: f.dataInputBoxes,
  });

  const wrongRecipient = base();
  wrongRecipient.unsignedTx.outputs[1].ergoTree = f.wrongRecipientErgoTree;
  await expectIndexedReject(wasm, stateContext, 'wrong recipient', wrongRecipient, f.signerPrivateKey, 1);

  const wrongAmount = base();
  wrongAmount.unsignedTx.outputs[1].value -= 1;
  wrongAmount.unsignedTx.outputs.at(-1).value += 1;
  await expectIndexedReject(wasm, stateContext, 'wrong amount', wrongAmount, f.signerPrivateKey, 1);

  const sameAuthorityDupBox = await syntheticBox(wasm, {
    value: MIN_BOX_VALUE,
    ergoTree: f.dupTree,
    assets: singleton(DUP_NFT_ID),
    additionalRegisters: {
      R4: encodeLongRegister(9),
      R5: encodeAvlTreeRegister(
        Buffer.from(getDupTreeDigest(f.dupHistoryKeys), 'hex'),
        DUP_FLAGS,
        1,
      ),
      R6: f.finalityAttestorRegister,
    },
    transactionByte: 0x6d,
    creationHeight: f.height - 1,
  });
  const sameAuthority = base();
  sameAuthority.unsignedTx.inputs[0].boxId = sameAuthorityDupBox.boxId;
  sameAuthority.unsignedTx.outputs[0].additionalRegisters.R6 =
    f.finalityAttestorRegister;
  sameAuthority.inputBoxes = [sameAuthorityDupBox, f.unlockBox];
  await expectIndexedReject(
    wasm,
    stateContext,
    'same tracker-attestor and bridge-committee proposition',
    sameAuthority,
    f.signerPrivateKey,
    1,
  );

  const wrongRoot = await rebindTracker(
    wasm,
    f,
    f.unsignedTx,
    mutateConsumedTrackerValue(f.plan.claims[0].trackerValueHex, {
      bridgeEventRootHex: hashHex('spike14-wrong-root'),
    }),
    TRACKER_NFT_ID,
    0x64,
  );
  await expectIndexedReject(wasm, stateContext, 'wrong tracker value/root with matching V2 proof', wrongRoot, f.signerPrivateKey, 1);

  const wrongTrackerNft = await rebindTracker(
    wasm,
    f,
    f.unsignedTx,
    f.plan.claims[0].trackerValueHex,
    WRONG_TRACKER_NFT_ID,
    0x65,
  );
  await expectIndexedReject(wasm, stateContext, 'wrong tracker NFT', wrongTrackerNft, f.signerPrivateKey, 0);

  const duplicateHistory = [...f.dupHistoryKeys, f.plan.claims[0].duplicatePreventionKeyHex];
  const membership = JSON.parse(bridge_lookup_membership(
    JSON.stringify(duplicateHistory),
    f.plan.claims[0].duplicatePreventionKeyHex,
  ));
  const duplicateBox = await syntheticBox(wasm, {
    value: MIN_BOX_VALUE,
    ergoTree: f.dupTree,
    assets: singleton(DUP_NFT_ID),
    additionalRegisters: {
      R4: encodeLongRegister(9),
      R5: encodeAvlTreeRegister(Buffer.from(membership.digest_hex, 'hex'), DUP_FLAGS, 1),
      R6: f.bridgeCommitteeRegister,
    },
    transactionByte: 0x66,
    creationHeight: f.height - 1,
  });
  const duplicate = base();
  duplicate.unsignedTx.inputs[0].boxId = duplicateBox.boxId;
  duplicate.unsignedTx.inputs[0].extension['0'] = encodeCollByteRegister(Buffer.from(membership.lookup_proof_hex, 'hex'));
  duplicate.unsignedTx.inputs[1].extension['3'] = replaceDupLookupInBundle(
    duplicate.unsignedTx.inputs[1].extension['3'],
    membership.lookup_proof_hex,
  );
  duplicate.unsignedTx.outputs[0].additionalRegisters.R5 = encodeAvlTreeRegister(
    Buffer.from(membership.digest_hex, 'hex'),
    DUP_FLAGS,
    1,
  );
  duplicate.inputBoxes = [duplicateBox, f.unlockBox];
  await expectIndexedReject(wasm, stateContext, 'duplicate burn already present with membership proof', duplicate, f.signerPrivateKey, 0);

  const wrongDupKey = base();
  const wrongDupKeyHex = hashHex('spike14-wrong-dup-key');
  const wrongDupProofs = JSON.parse(bridge_generate_proofs(JSON.stringify(f.dupHistoryKeys), wrongDupKeyHex));
  wrongDupKey.unsignedTx.inputs[0].extension['0'] = encodeCollByteRegister(Buffer.from(wrongDupProofs.lookup_proof_hex, 'hex'));
  wrongDupKey.unsignedTx.inputs[0].extension['1'] = encodeCollByteRegister(Buffer.from(wrongDupKeyHex, 'hex'));
  wrongDupKey.unsignedTx.inputs[0].extension['2'] = encodeCollByteRegister(Buffer.from(wrongDupProofs.insert_proof_hex, 'hex'));
  wrongDupKey.unsignedTx.inputs[1].extension['3'] = replaceDupLookupInBundle(
    wrongDupKey.unsignedTx.inputs[1].extension['3'],
    wrongDupProofs.lookup_proof_hex,
  );
  wrongDupKey.unsignedTx.outputs[0].additionalRegisters.R5 = encodeAvlTreeRegister(
    Buffer.from(wrongDupProofs.new_digest_hex, 'hex'),
    DUP_FLAGS,
    1,
  );
  await expectIndexedReject(wasm, stateContext, 'wrong DUP key with valid consistent proofs', wrongDupKey, f.signerPrivateKey, 1);

  const malformedTracker = base();
  const trackerProofHex = decodeCollByteRegister(malformedTracker.unsignedTx.inputs[1].extension['1']);
  malformedTracker.unsignedTx.inputs[1].extension['1'] = encodeCollByteRegister(Buffer.from(corruptProofHex(trackerProofHex), 'hex'));
  await expectIndexedReject(wasm, stateContext, 'malformed non-empty tracker proof', malformedTracker, f.signerPrivateKey, 1);

  const malformedDup = base();
  const dupProofHex = decodeCollByteRegister(malformedDup.unsignedTx.inputs[0].extension['0']);
  const corruptedDupProofHex = corruptProofHex(dupProofHex);
  malformedDup.unsignedTx.inputs[0].extension['0'] = encodeCollByteRegister(Buffer.from(corruptedDupProofHex, 'hex'));
  malformedDup.unsignedTx.inputs[1].extension['3'] = replaceDupLookupInBundle(
    malformedDup.unsignedTx.inputs[1].extension['3'],
    corruptedDupProofHex,
  );
  await expectIndexedReject(wasm, stateContext, 'malformed non-empty DUP proof in both inputs', malformedDup, f.signerPrivateKey, 0);

  const inputOrder = base();
  [inputOrder.unsignedTx.inputs[0], inputOrder.unsignedTx.inputs[1]] = [
    inputOrder.unsignedTx.inputs[1],
    inputOrder.unsignedTx.inputs[0],
  ];
  inputOrder.inputBoxes = [f.unlockBox, f.dupBox];
  await expectOrderingReject(wasm, stateContext, 'input order drift', inputOrder, f.signerPrivateKey);

  const successorOrder = base();
  [successorOrder.unsignedTx.outputs[0], successorOrder.unsignedTx.outputs[1]] = [
    successorOrder.unsignedTx.outputs[1],
    successorOrder.unsignedTx.outputs[0],
  ];
  await expectIndexedReject(wasm, stateContext, 'successor order drift', successorOrder, f.signerPrivateKey, 0);

  const staleAnchor = await rebindTracker(
    wasm,
    f,
    f.unsignedTx,
    mutateConsumedTrackerValue(f.plan.claims[0].trackerValueHex, {
      anchorHeaderHeight: f.height - 9,
    }),
    TRACKER_NFT_ID,
    0x67,
  );
  await expectIndexedReject(
    wasm,
    stateContext,
    'insufficient Ergo anchor depth below 10',
    staleAnchor,
    f.signerPrivateKey,
    1,
  );

  const alternateUnlockTree = f.wrongBindingUnlockTree;
  const alternateUnlockBox = await syntheticBox(wasm, {
    value: VAULT_VALUE,
    ergoTree: alternateUnlockTree,
    additionalRegisters: f.unlockBox.additionalRegisters,
    transactionByte: 0x68,
    creationHeight: f.height - 1,
  });
  const wrongBinding = base();
  wrongBinding.unsignedTx.inputs[1].boxId = alternateUnlockBox.boxId;
  wrongBinding.unsignedTx.outputs[2].ergoTree = alternateUnlockTree;
  wrongBinding.inputBoxes = [f.dupBox, alternateUnlockBox];
  await expectIndexedReject(wasm, stateContext, 'wrong unlock-contract binding for DUP', wrongBinding, f.signerPrivateKey, 0);

  const semanticMutations = [
    ['wrong sidechain ID with recomputed leaf root and matching V2 proof', 1, 0x69],
    ['wrong block identity with recomputed leaf root and matching V2 proof', 33, 0x6a],
    ['wrong asset with recomputed leaf root and matching V2 proof', 173, 0x6b],
  ] as const;
  for (const [name, offset, transactionByte] of semanticMutations) {
    const mutated = structuredClone(f.unsignedTx);
    const leaf = Buffer.from(decodeCollByteRegister(mutated.inputs[1].extension['2']), 'hex');
    leaf[offset] ^= 0x01;
    mutated.inputs[1].extension['2'] = encodeCollByteRegister(leaf);
    const scenario = await rebindTracker(
      wasm,
      f,
      mutated,
      mutateConsumedTrackerValue(f.plan.claims[0].trackerValueHex, {
        bridgeEventRootHex: resolveBurnRootHex(leaf, f.burnProof),
      }),
      TRACKER_NFT_ID,
      transactionByte,
    );
    await expectIndexedReject(wasm, stateContext, name, scenario, f.signerPrivateKey, 1);
  }
}

export function assertWp06SourceBoundSettlementVmResultProvenance(
  value: unknown,
): asserts value is Wp06SourceBoundSettlementVmResult {
  if (
    typeof value !== 'object'
    || value === null
    || !WP06_SOURCE_BOUND_SETTLEMENT_RESULTS.has(value)
    || !isDeepFrozen(value)
  ) {
    throw new Error('WP-06 source-bound settlement VM provenance is missing');
  }
  const result = value as Wp06SourceBoundSettlementVmResult;
  assertWp06SourceToTrackerVmResultProvenance(result.sourceToTrackerHandoff);
  if (
    result.trackerDataInputBoxId
      !== result.sourceToTrackerHandoff.admittedTrackerSuccessor.boxId
    || result.duplicatePreventionKeyHex
      !== result.sourceToTrackerHandoff.sourceBindings.burnIdHex
    || result.recipientErgoTreeHex
      !== result.sourceToTrackerHandoff.targetBurn.recipientErgoTreeHex
    || result.payoutAmountNanoErg
      !== result.sourceToTrackerHandoff.targetBurn.amountNanoErg
    || result.negativeCases.length !== AUTHENTICATED_SETTLEMENT_NEGATIVE_CASES.length
    || result.boundary.sourceSpecificTrackerSuccessorConsumed !== true
    || result.boundary.trackerBoxReconstructed !== false
    || result.boundary.exactTrackerAnchorContinued !== true
    || result.boundary.sourceBoundPinnedJvmReplayVerified !== true
    || result.jvmConformanceReport.transactionIdHex
      !== String(result.signedTransaction.id)
    || result.jvmConformanceReport.contextSha256Hex.length !== 64
    || result.jvmConformanceReport.inputCount !== 2
    || result.jvmConformanceReport.dataInputCount !== 1
    || result.jvmConformanceReport.headerCount !== 10
    || result.jvmConformanceReport.allInputsAccepted !== true
    || result.jvmConformanceReport.nodeStatefulAcceptance !== false
    || result.jvmConformanceReport.broadcastPerformed !== false
    || result.jvmConformanceReport.gate5Closed !== false
    || result.jvmConformanceReport.canonicalCompilation.compilerIdentityDigestHex
      !== result.sourceToTrackerHandoff.trackerAdmissionJvmConformanceReport
        .canonicalCompilation.compilerIdentityDigestHex
    || result.jvmConformanceReport.canonicalCompilation.sourceBaselineDigestHex
      !== result.sourceToTrackerHandoff.trackerAdmissionJvmConformanceReport
        .canonicalCompilation.sourceBaselineDigestHex
    || result.boundary.r9FinalityAuthority !== true
    || result.boundary.gate5Closed !== false
    || result.boundary.submitOrBroadcastEnabled !== false
  ) {
    throw new Error('WP-06 source-bound settlement VM result is internally inconsistent');
  }
}

export async function runWp06SourceBoundAuthenticatedSettlementVm(
  input: RunWp06SourceBoundSettlementVmInput,
): Promise<Wp06SourceBoundSettlementVmResult> {
  if (!isAbsolute(input?.ergoSourcePath ?? '')) {
    throw new Error('WP-06 source-bound settlement VM requires an absolute Ergo source path');
  }
  const handoff = input.sourceToTrackerHandoff;
  assertWp06SourceToTrackerVmResultProvenance(handoff);

  const dupHistoryKeys = [
    hashHex('wp06-source-bound-prior-dup-1'),
    hashHex('wp06-source-bound-prior-dup-2'),
    hashHex('wp06-source-bound-prior-dup-3'),
  ];
  const bound = buildWp06SourceBoundSettlementPlan({
    sourceToTrackerHandoff: handoff,
    dupHistoryKeys,
  });
  if (bound.bindings.trackerSuccessor.nftIdHex !== TRACKER_NFT_ID) {
    throw new Error('WP-06 tracker successor NFT differs from the linked settlement profile');
  }

  console.log('WP-06T2 source-bound authenticated settlement VM evaluation');
  const wasm = await getWasm();
  const ergoSourcePath = resolve(input.ergoSourcePath);
  const compiledTrees = await compilePinnedAuthenticatedV2VmTrees({
    bridgeRoot: BRIDGE_ROOT,
    worktreeRoot: WORKTREE_ROOT,
    ergoSourcePath,
    trackerNftId: TRACKER_NFT_ID,
    duplicatePreventionNftId: DUP_NFT_ID,
  });
  const wrongBindingTrees = await compilePinnedAuthenticatedV2VmTrees({
    bridgeRoot: BRIDGE_ROOT,
    worktreeRoot: WORKTREE_ROOT,
    ergoSourcePath,
    trackerNftId: WRONG_TRACKER_NFT_ID,
    duplicatePreventionNftId: DUP_NFT_ID,
  });
  if (compiledTrees.trees.tracker !== handoff.trackerTree) {
    throw new Error('WP-06 source-to-tracker handoff does not use the linked settlement tracker tree');
  }

  const retainedHeaderContext = handoff.trackerAdmissionHeaderContext;
  const context = buildWp06CanonicalContinuedHeaderContext(wasm, handoff);
  const anchorDepth = context.currentHeight - retainedHeaderContext.anchorHeader.height;
  if (
    anchorDepth !== AUTHENTICATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS
    || context.anchorContextIndex !== AUTHENTICATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS - 1
    || context.anchorHeader !== retainedHeaderContext.anchorHeader
    || context.headers[context.anchorContextIndex] !== retainedHeaderContext.anchorHeader
    || context.anchorHeader.id !== handoff.trackerAdmission.anchorHeader.idHex
    || context.anchorHeader.height !== handoff.trackerAdmission.anchorHeader.height
    || context.anchorHeader.extensionRootHex !== handoff.sourceBindings.extensionRootHex
  ) {
    throw new Error(
      'WP-06 source-bound settlement must continue the exact tracker anchor at ten confirmations',
    );
  }
  const fixture = await buildWp06SourceBoundFixture(
    wasm,
    context.currentHeight,
    compiledTrees.trees,
    wrongBindingTrees.trees.unlock,
    bound,
    handoff,
    dupHistoryKeys,
  );

  assertWp06SourceToTrackerVmResultProvenance(handoff);
  const started = performance.now();
  const exactSigned = await signSyntheticTxWithExactBytes(
    wasm,
    context.stateContext,
    fixture.unsignedTx,
    fixture.inputBoxes,
    fixture.dataInputBoxes,
    fixture.signerPrivateKey,
  );
  const signed = exactSigned.transaction;
  assertWp06SourceToTrackerVmResultProvenance(handoff);
  if (!/^[0-9a-f]{64}$/i.test(String(signed.id ?? ''))) {
    throw new Error('WP-06 source-bound settlement did not produce a signed transaction id');
  }
  console.log(
    `PASS exact admitted tracker successor -> payout/DUP settlement: `
    + `${String(signed.id).slice(0, 24)}... eval=${(performance.now() - started).toFixed(1)}ms`,
  );

  const jvmFixture = buildAuthenticatedV2JvmVmFixture({
    wasm,
    mode: 'settlement',
    signedTransaction: signed,
    signedTransactionBytes: exactSigned.bytes,
    unsignedTransaction: fixture.unsignedTx,
    inputBoxes: fixture.inputBoxes,
    dataInputBoxes: fixture.dataInputBoxes,
    contractBindings: {
      inputs: [
        { role: 'duplicatePrevention', ergoTreeHex: compiledTrees.trees.duplicatePrevention },
        { role: 'unlock', ergoTreeHex: compiledTrees.trees.unlock },
      ],
      dataInputs: [{ role: 'tracker', ergoTreeHex: compiledTrees.trees.tracker }],
    },
    canonicalContractTrees: compiledTrees.trees,
    preHeader: { raw: deriveSimplifiedUpcomingPreHeader(context.headers[0].raw) },
    headers: context.headers.map(header => ({ raw: header.raw, id: header.id })),
  });
  const jvmVector = loadWp06CanonicalJvmHeaderVector();
  assertWp06CanonicalJvmHeaderVectorProvenance(jvmVector);
  assertWp06CanonicalJvmFixtureHeaderBinding(
    getWp06CanonicalJvmHeaderWindow(jvmVector, 'settlement'),
    jvmFixture,
  );
  const jvmReplayBinding = deriveWp06JvmReplayBinding(jvmFixture);
  assertWp06SourceToTrackerVmResultProvenance(handoff);
  const jvmConformanceReport = await verifyAuthenticatedV2JvmVmFixture({
    bridgeRoot: BRIDGE_ROOT,
    worktreeRoot: WORKTREE_ROOT,
    ergoSourcePath,
    trackerNftId: TRACKER_NFT_ID,
    duplicatePreventionNftId: DUP_NFT_ID,
    fixture: jvmFixture,
  });
  assertWp06SourceToTrackerVmResultProvenance(handoff);
  const trackerJvmReport = handoff.trackerAdmissionJvmConformanceReport;
  assertWp06SettlementJvmReplayReport({
    report: jvmConformanceReport,
    binding: jvmReplayBinding,
    signedTransactionIdHex: String(signed.id),
    trackerNftId: TRACKER_NFT_ID,
    duplicatePreventionNftId: DUP_NFT_ID,
    compiledTrees,
    trackerReport: trackerJvmReport,
  });
  console.log(
    `PASS exact source-bound settlement in pinned JVM: `
    + `tx=${jvmConformanceReport.transactionIdHex.slice(0, 24)}... `
    + `inputs=${jvmConformanceReport.inputCount} `
    + `context=${jvmConformanceReport.contextSha256Hex.slice(0, 24)}...`,
  );

  await runNegativeMatrix(wasm, context.stateContext, fixture);
  if (AUTHENTICATED_SETTLEMENT_NEGATIVE_CASES.length !== 16) {
    throw new Error('WP-06 source-bound settlement negative matrix must remain sixteen cases');
  }
  console.log('PASS source-bound payout/DUP VM acceptance and sixteen-case negative matrix.');
  console.log(
    'BOUNDARY: one process-local immutable source-to-tracker capability and its exact signed tracker '
    + 'successor feed matching offline sigma-rust and pinned-JVM settlement replays. DUP, vault, '
    + 'context, and evaluation key are synthetic and ephemeral; the secret-free JVM fixture is '
    + 'deleted after isolated per-run execution. No serialized handoff rehydration, chain RPC, external wallet state, '
    + '/transactions/check, submit, broadcast, deployment, or runtime database is used. R9 remains '
    + 'the finality authority; node stateful acceptance, committee-bypass prevention, Gate 5 closure, '
    + 'trustless operation, and production readiness remain false.',
  );

  const result = deepFreeze({
    sourceToTrackerHandoff: handoff,
    settlementPlan: bound.plan,
    signedTransaction: structuredClone(signed),
    trackerDataInputBoxId: String(handoff.admittedTrackerSuccessor.boxId),
    duplicatePreventionKeyHex: bound.duplicatePreventionKeyHex,
    recipientErgoTreeHex: bound.recipientErgoTreeHex,
    payoutAmountNanoErg: bound.payoutAmountNanoErg,
    settlementHeight: context.currentHeight,
    jvmConformanceReport: structuredClone(jvmConformanceReport),
    jvmReplayBinding: structuredClone(jvmReplayBinding),
    negativeCases: [...AUTHENTICATED_SETTLEMENT_NEGATIVE_CASES],
    boundary: {
      sourceSpecificTrackerSuccessorConsumed: true as const,
      trackerBoxReconstructed: false as const,
      exactTrackerAnchorContinued: true as const,
      chainRpcAccessEnabled: false as const,
      chainRpcWritesEnabled: false as const,
      ephemeralInMemorySigningUsed: true as const,
      externalWalletStateAccessed: false as const,
      nodeStatefulAcceptanceVerified: false as const,
      sourceBoundPinnedJvmReplayVerified: true as const,
      r9FinalityAuthority: true as const,
      gate5Closed: false as const,
      submitOrBroadcastEnabled: false as const,
    },
  });
  WP06_SOURCE_BOUND_SETTLEMENT_RESULTS.add(result);
  assertWp06SourceBoundSettlementVmResultProvenance(result);
  return result;
}

function buildWp06CanonicalContinuedHeaderContext(
  wasm: any,
  handoff: Wp06SourceToTrackerVmResult,
): {
  stateContext: any;
  currentHeight: number;
  anchorHeader: Wp06SourceToTrackerVmResult['trackerAdmissionHeaderContext']['anchorHeader'];
  anchorContextIndex: number;
  headers: Array<Wp06SourceToTrackerVmResult['trackerAdmissionHeaderContext']['anchorHeader']>;
  provenance: typeof WP06_CANONICAL_JVM_HEADER_CONTEXT_PROVENANCE;
} {
  assertWp06SourceToTrackerVmResultProvenance(handoff);
  const vector = loadWp06CanonicalJvmHeaderVector();
  assertWp06CanonicalJvmHeaderVectorProvenance(vector);
  if (
    vector.fileSha256Hex !== handoff.canonicalHeaderVector.fileSha256Hex
    || vector.anchorIdHex !== handoff.canonicalHeaderVector.anchorIdHex
    || vector.anchorHeight !== handoff.canonicalHeaderVector.anchorHeight
    || vector.anchorExtensionRootHex !== handoff.canonicalHeaderVector.anchorExtensionRootHex
    || vector.anchorExtensionRootHex !== handoff.sourceBindings.extensionRootHex
  ) {
    throw new Error('WP-06 settlement canonical header vector differs from the T1 capability');
  }
  const target = getWp06CanonicalJvmHeaderWindow(vector, 'settlement');
  const prior = handoff.trackerAdmissionHeaderContext;
  const retainedByHeight = new Map(prior.headers.map(header => [header.height, header]));
  const headers = target.headers.map((canonical, index) => {
    const retained = retainedByHeight.get(canonical.height);
    if (!retained) return canonical;
    if (
      retained.id !== canonical.id
      || retained.parentId !== canonical.parentId
      || retained.height !== canonical.height
      || retained.extensionRootHex !== canonical.extensionRootHex
      || !isDeepStrictEqual(retained.raw, canonical.raw)
    ) {
      throw new Error(`WP-06 retained T1 header ${canonical.height} differs from the canonical chain`);
    }
    return retained;
  }) as Array<Wp06SourceToTrackerVmResult['trackerAdmissionHeaderContext']['anchorHeader']>;
  const anchorHeader = headers[target.anchorContextIndex];
  if (
    !anchorHeader
    || anchorHeader !== prior.anchorHeader
    || anchorHeader.id !== vector.anchorIdHex
    || anchorHeader.height !== vector.anchorHeight
    || anchorHeader.extensionRootHex !== vector.anchorExtensionRootHex
  ) {
    throw new Error('WP-06 settlement did not retain the exact T1 anchor object');
  }
  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index];
    if (
      header.height !== target.currentHeight - index - 1
      || (index + 1 < headers.length && header.parentId !== headers[index + 1].id)
    ) {
      throw new Error(`WP-06 canonical settlement header ${index} is discontinuous`);
    }
  }
  const parsed = headers.map((header, index) => {
    const value = wasm.BlockHeader.from_json(JSON.stringify(header.raw));
    if (!value.id().equals(wasm.BlockId.from_str(header.id))) {
      throw new Error(`sigma-rust changed WP-06 settlement header ${index} identity`);
    }
    return value;
  });
  const blockHeaders = new wasm.BlockHeaders(parsed[0]);
  for (let index = 1; index < parsed.length; index += 1) blockHeaders.add(parsed[index]);
  const carrier = wasm.BlockHeader.from_json(JSON.stringify(
    buildWasmSimplifiedUpcomingPreHeaderCarrier(headers[0].raw),
  ));
  assertWp06SourceToTrackerVmResultProvenance(handoff);
  return {
    stateContext: new wasm.ErgoStateContext(
      wasm.PreHeader.from_block_header(carrier),
      blockHeaders,
      wasm.Parameters.default_parameters(),
    ),
    currentHeight: target.currentHeight,
    anchorHeader,
    anchorContextIndex: target.anchorContextIndex,
    headers,
    provenance: WP06_CANONICAL_JVM_HEADER_CONTEXT_PROVENANCE,
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  if (ArrayBuffer.isView(value)) {
    throw new Error('WP-06 source-bound settlement VM results must not retain mutable binary views');
  }
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  return Object.isFrozen(value)
    && Object.values(value as Record<string, unknown>).every(isDeepFrozen);
}

async function main(): Promise<void> {
  const syntheticContext = process.argv.includes('--synthetic-context');
  const jvmConformance = process.argv.includes('--jvm-conformance');
  if (syntheticContext && jvmConformance) {
    throw new Error('--jvm-conformance requires a canonical mined-header context');
  }
  console.log(
    syntheticContext
      ? 'Authenticated V2 settlement deterministic offline ErgoScript VM evaluation'
      : 'Authenticated V2 settlement full-transaction ErgoScript VM evaluation',
  );
  const wasm = await getWasm();
  const ergoSourcePath = resolve(process.cwd(), requiredOption('--ergo-source'));
  const compiledTrees = await compilePinnedAuthenticatedV2VmTrees({
    bridgeRoot: BRIDGE_ROOT,
    worktreeRoot: WORKTREE_ROOT,
    ergoSourcePath,
    trackerNftId: TRACKER_NFT_ID,
    duplicatePreventionNftId: DUP_NFT_ID,
  });
  const wrongBindingTrees = await compilePinnedAuthenticatedV2VmTrees({
    bridgeRoot: BRIDGE_ROOT,
    worktreeRoot: WORKTREE_ROOT,
    ergoSourcePath,
    trackerNftId: WRONG_TRACKER_NFT_ID,
    duplicatePreventionNftId: DUP_NFT_ID,
  });
  console.log(
    `Pinned trees: tracker=${compiledTrees.treeSha256.tracker} ` +
    `unlock=${compiledTrees.treeSha256.unlock} ` +
    `dup=${compiledTrees.treeSha256.duplicatePrevention}`,
  );
  let stateContext: any;
  let height: number;
  let jvmHeaderContext: {
    preHeader: Record<string, unknown>;
    headers: Record<string, unknown>[];
  } | undefined;
  if (syntheticContext) {
    const synthetic = buildDeterministicSyntheticVmHeaderContext(wasm, {
      currentHeight: 100_000,
      anchorContextIndex: 0,
      anchorExtensionRootHex: hashHex('spike14-synthetic-extension-root'),
    });
    stateContext = synthetic.stateContext;
    height = synthetic.currentHeight;
    console.log(`Deterministic synthetic header context: height=${height}`);
  } else {
    const nodeInfo = await readNodeJson('/info');
    ({ stateContext, height, jvmHeaderContext } = await buildStateContext(wasm));
    console.log(`Read-only node context: ${String(nodeInfo?.network ?? 'unknown')} height=${height}`);
  }
  const fixture = await buildFixture(
    wasm,
    height,
    compiledTrees.trees,
    wrongBindingTrees.trees.unlock,
  );
  const started = performance.now();
  const exactSigned = await signSyntheticTxWithExactBytes(
    wasm,
    stateContext,
    fixture.unsignedTx,
    fixture.inputBoxes,
    fixture.dataInputBoxes,
    fixture.signerPrivateKey,
  );
  const signed = exactSigned.transaction;
  if (!/^[0-9a-f]{64}$/i.test(String(signed.id ?? ''))) {
    throw new Error('positive case did not produce a signed transaction id');
  }
  console.log(
    `PASS valid authenticated settlement: ${String(signed.id).slice(0, 24)}... ` +
    `eval=${(performance.now() - started).toFixed(1)}ms`,
  );
  if (jvmConformance) {
    if (!jvmHeaderContext) throw new Error('JVM conformance requires retained mined-header data');
    const report = await verifyAuthenticatedV2JvmVmFixture({
      bridgeRoot: BRIDGE_ROOT,
      worktreeRoot: WORKTREE_ROOT,
      ergoSourcePath,
      trackerNftId: TRACKER_NFT_ID,
      duplicatePreventionNftId: DUP_NFT_ID,
      fixture: buildAuthenticatedV2JvmVmFixture({
        wasm,
        mode: 'settlement',
        signedTransaction: signed,
        signedTransactionBytes: exactSigned.bytes,
        unsignedTransaction: fixture.unsignedTx,
        inputBoxes: fixture.inputBoxes,
        dataInputBoxes: fixture.dataInputBoxes,
        contractBindings: {
          inputs: [
            { role: 'duplicatePrevention', ergoTreeHex: compiledTrees.trees.duplicatePrevention },
            { role: 'unlock', ergoTreeHex: compiledTrees.trees.unlock },
          ],
          dataInputs: [{ role: 'tracker', ergoTreeHex: compiledTrees.trees.tracker }],
        },
        canonicalContractTrees: compiledTrees.trees,
        preHeader: { raw: jvmHeaderContext.preHeader },
        headers: jvmHeaderContext.headers.map(raw => ({ raw })),
      }),
    });
    console.log(
      `PASS pinned JVM settlement proof and serialization conformance: ` +
      `tx=${report.transactionIdHex.slice(0, 24)}... inputs=${report.inputCount} ` +
      `compiler-binding=${report.canonicalCompilation.bindingDigestHex.slice(0, 24)}...`,
    );
  }
  await runNegativeMatrix(wasm, stateContext, fixture);
  console.log('PASS authenticated V2 full local VM acceptance and sixteen-case negative matrix.');
  console.log(
    `BOUNDARY: ${syntheticContext
      ? 'deterministic synthetic headers are VM inputs, not mined-header evidence; '
      : ''}` +
    'this proves full local VM acceptance relative to a proof-bound tracker whose ' +
    'finality admission remains R9 attestor-authorized. Settlement reads the committed identity ' +
    'but does not verify the proof payload. This does NOT prove trustless proof acceptance, ' +
    'organizational independence, Gate 5 closure, node stateful acceptance, deployment, or production readiness.',
  );
}

function requiredOption(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main().catch(error => {
    console.error('FATAL:', error);
    process.exit(1);
  });
}
