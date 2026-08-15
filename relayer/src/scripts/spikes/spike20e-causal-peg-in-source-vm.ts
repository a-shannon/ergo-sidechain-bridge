/**
 * WP-06T20E-B causal peg-in source-contract VM evaluation.
 *
 * The loopback node is used only to compile ErgoScript. All boxes, keys,
 * transactions and state context are synthetic and process-local. The script
 * does not read deployment state, environment files, a wallet, a database or
 * logs, and it never checks, submits or broadcasts a transaction.
 */
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import blakejs from 'blakejs';

import { buildAuthenticatedSettlementPlan } from '../../aggregate-settlement-builder.js';
import { buildCausalAuthenticatedSettlementTx } from '../../aggregate-settlement-tx.js';
import { getDupTreeDigest } from '../../avl-bridge.js';
import { buildBridgeCheckpointCommitmentV1 } from '../../bridge-checkpoint-commitment.js';
import { buildAggregateFinalityCommitmentV1 } from '../../bridge-finality-commitment.js';
import {
  buildAggregateFinalityProofV1,
  buildBridgeFinalityStatementV1,
} from '../../bridge-finality-proof.js';
import {
  createCommitteeConfig,
  injectCommitteePlaceholders,
} from '../../committee-config.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
  MINER_FEE,
} from '../../ergo-encoding.js';
import {
  buildPegInCausalCommitmentV2Tx,
  buildPegInCausalRefundV2Tx,
} from '../../peg-in-causal-commitment-v2.js';
import {
  derivePegInCausalAdmissionProfileIdV2Hex,
  encodePegInSourceIntentV2Hex,
} from '../../peg-in-causal-admission-v2.js';
import {
  buildAuthenticatedSpvTrackerGetProof,
  encodeAuthenticatedSpvTrackerAvlRegister,
  encodeAuthenticatedSpvTrackerValue,
} from '../../spv-tracker-authenticated.js';
import {
  deriveTrustlessBurnIdHex,
  encodeTrustlessBurnLeaf,
} from '../../trustless-burn-proof.js';
import { buildDeterministicSyntheticVmHeaderContext } from '../../authenticated-v2-offline-vm-fixture.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRACTS_DIR = resolve(__dirname, '../../../../contracts');
const CURRENT_HEIGHT = 100_000;
const TRACKER_NFT_ID = 'a1'.repeat(32);
const CAUSAL_DUP_NFT_ID = 'b2'.repeat(32);
const SOURCE_NETWORK_ID_HEX = hashHex('t20e-source-network');
const SIDECHAIN_ID_HEX = hashHex('t20e-sidechain');
const BRIDGE_ADDRESS_HEX = '33'.repeat(20);
const TOKEN_ADDRESS_HEX = '44'.repeat(20);
const SETTLEMENT_PROFILE_ID_HEX = hashHex('t20e-causal-vault-settlement-profile');
const FINALITY_POLICY_ID_HEX = hashHex('t20e-ergo-source-finality-policy');
const PROOF_SYSTEM_ID_HEX = hashHex('t20e-ergo-source-proof-system');
const PROOF_PROFILE_ID_HEX = hashHex('t20e-ergo-source-proof-profile');
const SOURCE_VALUE = 3_100_000;
const PAYOUT_VALUE = 1_000_000;
const MIN_BOX_VALUE = 1_000_000;
const FEE_BOX_VALUE = MINER_FEE + MIN_BOX_VALUE;
const ZERO_ASSET_ID = '00'.repeat(32);
const DUP_FLAGS = 0x0b;

interface KeyPair {
  privateKeyHex: string;
  pubKeyHex: string;
  p2pkTree: string;
  address: string;
}

interface CompiledTrees {
  causalVault: string;
  causalSourceLock: string;
  tracker: string;
  causalDuplicatePrevention: string;
  mismatchedCausalDuplicatePrevention: string;
}

interface SettlementFixture {
  unsignedTx: any;
  inputBoxes: any[];
  dataInputBoxes: any[];
  vaultBox: any;
  dupBox: any;
  trackerBox: any;
  signerPrivateKey: string;
  sourceIntentHex: string;
  sourceBoxIdHex: string;
}

let wasmModule: any;

async function getWasm(): Promise<any> {
  if (!wasmModule) {
    // @ts-ignore CommonJS/ESM interop in ergo-lib-wasm-nodejs.
    wasmModule = await import('ergo-lib-wasm-nodejs');
    if (wasmModule.default) wasmModule = wasmModule.default;
  }
  return wasmModule;
}

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

async function nodeJson(path: string, init?: RequestInit): Promise<any> {
  if (path !== '/script/p2sAddress' && !path.startsWith('/script/addressToTree/')) {
    throw new Error(`node route is outside the compile-only allowlist: ${path}`);
  }
  const response = await fetch(`${loopbackNodeEndpoint()}${path}`, {
    ...init,
    headers: {
      api_key: 'hello',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${path}: ${response.status} ${text}`);
  return JSON.parse(text);
}

async function compileContractSource(source: string): Promise<string> {
  if (/PLACEHOLDER/.test(source)) throw new Error('resolved ErgoScript still contains a placeholder');
  const compiled = await nodeJson('/script/p2sAddress', {
    method: 'POST',
    body: JSON.stringify({ source, treeVersion: 0 }),
  });
  const tree = await nodeJson(`/script/addressToTree/${compiled.address}`);
  if (typeof tree?.tree !== 'string' || !/^[0-9a-f]+$/i.test(tree.tree)) {
    throw new Error('compile-only node returned an invalid ErgoTree');
  }
  return tree.tree.toLowerCase();
}

async function compileLinkedTrees(committee: readonly KeyPair[]): Promise<CompiledTrees> {
  const causalVaultSource = readContract('MainChainCausalVaultV2.es')
    .replaceAll('TRACKER_NFT_ID_PLACEHOLDER', TRACKER_NFT_ID)
    .replaceAll('DUP_NFT_ID_PLACEHOLDER', CAUSAL_DUP_NFT_ID);
  const causalVault = await compileContractSource(causalVaultSource);
  const causalVaultHash = blake2b256(Buffer.from(causalVault, 'hex')).toString('hex');

  const duplicatePreventionSource = readContract('DoubleUnlockPreventionCausalV2.es')
    .replaceAll('TRACKER_NFT_ID_PLACEHOLDER', TRACKER_NFT_ID)
    .replaceAll('CAUSAL_VAULT_ERGOTREE_HASH_PLACEHOLDER', causalVaultHash);
  const causalDuplicatePrevention = await compileContractSource(duplicatePreventionSource);
  const mismatchedCausalDuplicatePrevention = await compileContractSource(
    readContract('DoubleUnlockPreventionCausalV2.es')
      .replaceAll('TRACKER_NFT_ID_PLACEHOLDER', TRACKER_NFT_ID)
      .replaceAll(
        'CAUSAL_VAULT_ERGOTREE_HASH_PLACEHOLDER',
        hashHex('t20e-mismatched-causal-vault'),
      ),
  );
  const tracker = await compileContractSource(readContract('SPVTrackerAuthenticated.es'));
  const causalSourceLock = await compileContractSource(
    injectCommitteePlaceholders(
      readContract('MainChainLockCausalV2.es'),
      createCommitteeConfig(committee.map(key => key.pubKeyHex), '2'),
    )
      .replaceAll('CAUSAL_SOURCE_NETWORK_ID_HEX_PLACEHOLDER', SOURCE_NETWORK_ID_HEX)
      .replaceAll('CAUSAL_SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER', causalVault),
  );
  return {
    causalVault,
    causalSourceLock,
    tracker,
    causalDuplicatePrevention,
    mismatchedCausalDuplicatePrevention,
  };
}

function readContract(name: string): string {
  return readFileSync(resolve(CONTRACTS_DIR, name), 'utf8');
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

async function syntheticBox(wasm: any, input: {
  value: number | string | bigint;
  ergoTree: string;
  assets?: any[];
  additionalRegisters: Record<string, string>;
  transactionByte: number;
  creationHeight: number;
}): Promise<any> {
  const box = {
    value: String(input.value),
    ergoTree: input.ergoTree,
    assets: input.assets ?? [],
    additionalRegisters: input.additionalRegisters,
    transactionId: input.transactionByte.toString(16).padStart(2, '0').repeat(32),
    index: 0,
    creationHeight: input.creationHeight,
  };
  return wasm.ErgoBoxes.from_boxes_json([box]).get(0).to_js_eip12();
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
  privateKeyHexes: string | readonly string[],
): Promise<any> {
  const keys = new wasm.SecretKeys();
  for (const privateKeyHex of Array.isArray(privateKeyHexes) ? privateKeyHexes : [privateKeyHexes]) {
    keys.add(wasm.SecretKey.dlog_from_bytes(Buffer.from(privateKeyHex, 'hex')));
  }
  const wallet = wasm.Wallet.from_secrets(keys);
  const signed = wallet.sign_transaction(
    stateContext,
    wasm.UnsignedTransaction.from_json(JSON.stringify(unsignedTx)),
    wasm.ErgoBoxes.from_boxes_json(inputBoxes),
    wasm.ErgoBoxes.from_boxes_json(dataInputBoxes),
  );
  return JSON.parse(signed.to_json());
}

async function expectSign(
  wasm: any,
  stateContext: any,
  label: string,
  unsignedTx: any,
  inputBoxes: any[],
  dataInputBoxes: any[],
  privateKeyHexes: string | readonly string[],
): Promise<void> {
  const signed = await signSyntheticTx(
    wasm,
    stateContext,
    unsignedTx,
    inputBoxes,
    dataInputBoxes,
    privateKeyHexes,
  );
  if (!/^[0-9a-f]{64}$/i.test(String(signed.id ?? ''))) {
    throw new Error(`${label}: signed transaction has no canonical ID`);
  }
  console.log(`PASS ${label}: ${String(signed.id).slice(0, 24)}...`);
}

async function expectReject(
  wasm: any,
  stateContext: any,
  label: string,
  unsignedTx: any,
  inputBoxes: any[],
  dataInputBoxes: any[],
  privateKeyHexes: string | readonly string[],
  expectedInputIndex?: number,
): Promise<void> {
  try {
    await signSyntheticTx(
      wasm,
      stateContext,
      unsignedTx,
      inputBoxes,
      dataInputBoxes,
      privateKeyHexes,
    );
  } catch (error) {
    const message = String((error as any)?.message ?? error);
    if (!message.includes('Prover error') && !message.includes('Script reduced to false')) throw error;
    if (expectedInputIndex !== undefined && !message.includes(`tx input index ${expectedInputIndex}`)) {
      throw new Error(`${label}: rejected at an unexpected input: ${message}`);
    }
    console.log(`PASS ${label}: rejected${expectedInputIndex === undefined ? '' : ` at input ${expectedInputIndex}`}`);
    return;
  }
  throw new Error(`${label}: invalid transaction unexpectedly signed`);
}

function outputCandidates(plan: { outputs: any[] }): any[] {
  return plan.outputs.map(output => ({ ...output, value: String(output.value) }));
}

function profileAndIntent(trees: CompiledTrees): {
  admissionProfileIdHex: string;
  sourceIntentHex: string;
} {
  const admissionProfileIdHex = derivePegInCausalAdmissionProfileIdV2Hex({
    formatVersion: 2,
    sourceNetworkIdHex: SOURCE_NETWORK_ID_HEX,
    sidechainIdHex: SIDECHAIN_ID_HEX,
    bridgeAddressHex: BRIDGE_ADDRESS_HEX,
    tokenAddressHex: TOKEN_ADDRESS_HEX,
    settlementProfileIdHex: SETTLEMENT_PROFILE_ID_HEX,
    sourceLockErgoTreeHashHex: blake2b256(Buffer.from(trees.causalSourceLock, 'hex')).toString('hex'),
    vaultErgoTreeHashHex: blake2b256(Buffer.from(trees.causalVault, 'hex')).toString('hex'),
    finalityPolicyIdHex: FINALITY_POLICY_ID_HEX,
    proofSystemIdHex: PROOF_SYSTEM_ID_HEX,
    proofProfileIdHex: PROOF_PROFILE_ID_HEX,
    profileRevision: 1,
    activationHeight: 1,
  }).slice(2);
  const sourceIntentHex = encodePegInSourceIntentV2Hex({
    formatVersion: 2,
    sourceNetworkIdHex: SOURCE_NETWORK_ID_HEX,
    sidechainIdHex: SIDECHAIN_ID_HEX,
    bridgeAddressHex: BRIDGE_ADDRESS_HEX,
    tokenAddressHex: TOKEN_ADDRESS_HEX,
    settlementProfileIdHex: SETTLEMENT_PROFILE_ID_HEX,
    admissionProfileIdHex,
    sourceAssetIdHex: ZERO_ASSET_ID,
    amountNanoErg: SOURCE_VALUE,
    recipientAddressHex: '99'.repeat(20),
  }).slice(2);
  return { admissionProfileIdHex, sourceIntentHex };
}

async function runSourceLockMatrix(
  wasm: any,
  stateContext: any,
  trees: CompiledTrees,
  committee: readonly KeyPair[],
): Promise<{ vaultBox: any; sourceIntentHex: string; admissionProfileIdHex: string }> {
  const feeSigner = await makeKeyPair(wasm);
  const depositor = await makeKeyPair(wasm);
  const { admissionProfileIdHex, sourceIntentHex } = profileAndIntent(trees);
  const sourceBox = await syntheticBox(wasm, {
    value: SOURCE_VALUE,
    ergoTree: trees.causalSourceLock,
    additionalRegisters: {
      R4: encodeCollByteRegister(Buffer.from(sourceIntentHex, 'hex')),
      R5: encodeCollByteRegister(Buffer.from(depositor.p2pkTree, 'hex')),
    },
    transactionByte: 0x31,
    creationHeight: CURRENT_HEIGHT - 1,
  });
  const feeBox = await syntheticBox(wasm, {
    value: FEE_BOX_VALUE,
    ergoTree: feeSigner.p2pkTree,
    additionalRegisters: {},
    transactionByte: 0x32,
    creationHeight: 1,
  });
  const commitPlan = buildPegInCausalCommitmentV2Tx({
    sourceLockBox: sourceBox,
    feeBox,
    causalVaultErgoTreeHex: trees.causalVault,
    expectedSourceLockErgoTreeHex: trees.causalSourceLock,
    expectedSourceNetworkIdHex: SOURCE_NETWORK_ID_HEX,
    expectedAdmissionProfileIdHex: admissionProfileIdHex,
    creationHeight: CURRENT_HEIGHT,
  });
  const commitTx = { ...commitPlan, outputs: outputCandidates(commitPlan) };
  const commitKeys = [committee[0].privateKeyHex, committee[1].privateKeyHex, feeSigner.privateKeyHex];
  await expectSign(wasm, stateContext, 'causal source commitment', commitTx, [sourceBox, feeBox], [], commitKeys);
  await expectReject(
    wasm,
    stateContext,
    'one-of-three source commitment quorum',
    commitTx,
    [sourceBox, feeBox],
    [],
    [committee[0].privateKeyHex, feeSigner.privateKeyHex],
    0,
  );

  const wrongSourceId = structuredClone(commitTx);
  wrongSourceId.outputs[0].additionalRegisters.R5 = encodeCollByteRegister(Buffer.from('ef'.repeat(32), 'hex'));
  await expectReject(wasm, stateContext, 'wrong committed source box ID', wrongSourceId, [sourceBox, feeBox], [], commitKeys, 0);
  const secondCommitSourceBox = await syntheticBox(wasm, {
    value: SOURCE_VALUE,
    ergoTree: trees.causalSourceLock,
    additionalRegisters: sourceBox.additionalRegisters,
    transactionByte: 0x37,
    creationHeight: CURRENT_HEIGHT - 1,
  });
  const sharedCommitment = structuredClone(commitTx);
  sharedCommitment.inputs.splice(1, 0, {
    boxId: secondCommitSourceBox.boxId,
    extension: {},
  });
  sharedCommitment.outputs.splice(sharedCommitment.outputs.length - 1, 0, {
    value: String(SOURCE_VALUE),
    ergoTree: feeSigner.p2pkTree,
    assets: [],
    additionalRegisters: {},
    creationHeight: CURRENT_HEIGHT,
  });
  await expectReject(
    wasm,
    stateContext,
    'two source locks sharing one commitment output',
    sharedCommitment,
    [sourceBox, secondCommitSourceBox, feeBox],
    [],
    commitKeys,
    1,
  );
  const reducedVault = structuredClone(commitTx);
  reducedVault.outputs[0].value = String(SOURCE_VALUE - 1);
  reducedVault.outputs[1].value = String(MIN_BOX_VALUE + 1);
  await expectReject(wasm, stateContext, 'reduced committed vault value', reducedVault, [sourceBox, feeBox], [], commitKeys, 0);
  const wrongVaultTree = structuredClone(commitTx);
  wrongVaultTree.outputs[0].ergoTree = feeSigner.p2pkTree;
  await expectReject(wasm, stateContext, 'wrong committed vault ErgoTree', wrongVaultTree, [sourceBox, feeBox], [], commitKeys, 0);

  const refundSourceBox = await syntheticBox(wasm, {
    value: SOURCE_VALUE,
    ergoTree: trees.causalSourceLock,
    additionalRegisters: sourceBox.additionalRegisters,
    transactionByte: 0x35,
    creationHeight: CURRENT_HEIGHT - 10_000,
  });
  const lateCommit = structuredClone(commitTx);
  lateCommit.inputs[0].boxId = refundSourceBox.boxId;
  lateCommit.outputs[0].additionalRegisters.R5 = encodeCollByteRegister(
    Buffer.from(refundSourceBox.boxId, 'hex'),
  );
  await expectReject(
    wasm,
    stateContext,
    'commit at the exact refund boundary',
    lateCommit,
    [refundSourceBox, feeBox],
    [],
    commitKeys,
    0,
  );

  const refundPlan = buildPegInCausalRefundV2Tx({
    sourceLockBox: refundSourceBox,
    feeBox,
    expectedSourceLockErgoTreeHex: trees.causalSourceLock,
    expectedSourceNetworkIdHex: SOURCE_NETWORK_ID_HEX,
    expectedAdmissionProfileIdHex: admissionProfileIdHex,
    creationHeight: CURRENT_HEIGHT,
  });
  const refundTx = { ...refundPlan, outputs: outputCandidates(refundPlan) };
  await expectSign(wasm, stateContext, 'exact-boundary source refund', refundTx, [refundSourceBox, feeBox], [], feeSigner.privateKeyHex);
  const wrongRefund = structuredClone(refundTx);
  wrongRefund.outputs[0].ergoTree = feeSigner.p2pkTree;
  await expectReject(wasm, stateContext, 'refund to wrong ErgoTree', wrongRefund, [refundSourceBox, feeBox], [], feeSigner.privateKeyHex, 0);
  const wrongRefundSource = structuredClone(refundTx);
  wrongRefundSource.outputs[0].additionalRegisters.R4 = encodeCollByteRegister(
    Buffer.from('ed'.repeat(32), 'hex'),
  );
  await expectReject(wasm, stateContext, 'refund with wrong source box ID', wrongRefundSource, [refundSourceBox, feeBox], [], feeSigner.privateKeyHex, 0);

  const secondRefundSourceBox = await syntheticBox(wasm, {
    value: SOURCE_VALUE,
    ergoTree: trees.causalSourceLock,
    additionalRegisters: sourceBox.additionalRegisters,
    transactionByte: 0x36,
    creationHeight: 1,
  });
  const sharedRefund = structuredClone(refundTx);
  sharedRefund.inputs.splice(1, 0, { boxId: secondRefundSourceBox.boxId, extension: {} });
  sharedRefund.outputs.splice(sharedRefund.outputs.length - 1, 0, {
    value: String(SOURCE_VALUE),
    ergoTree: feeSigner.p2pkTree,
    assets: [],
    additionalRegisters: {},
    creationHeight: CURRENT_HEIGHT,
  });
  await expectReject(
    wasm,
    stateContext,
    'two source locks sharing one refund output',
    sharedRefund,
    [refundSourceBox, secondRefundSourceBox, feeBox],
    [],
    feeSigner.privateKeyHex,
    1,
  );

  const youngSourceBox = await syntheticBox(wasm, {
    value: SOURCE_VALUE,
    ergoTree: trees.causalSourceLock,
    additionalRegisters: sourceBox.additionalRegisters,
    transactionByte: 0x33,
    creationHeight: CURRENT_HEIGHT - 1,
  });
  const prematureRefund = structuredClone(refundTx);
  prematureRefund.inputs[0].boxId = youngSourceBox.boxId;
  await expectReject(wasm, stateContext, 'premature source refund', prematureRefund, [youngSourceBox, feeBox], [], feeSigner.privateKeyHex, 0);

  const vaultOutput = commitPlan.outputs[0];
  const vaultBox = await syntheticBox(wasm, {
    value: vaultOutput.value,
    ergoTree: vaultOutput.ergoTree,
    additionalRegisters: vaultOutput.additionalRegisters,
    transactionByte: 0x34,
    creationHeight: CURRENT_HEIGHT,
  });
  const sourceBytes = Buffer.from(
    wasm.ErgoBox.from_json(JSON.stringify(sourceBox)).sigma_serialize_bytes(),
  ).length;
  const vaultBytes = Buffer.from(
    wasm.ErgoBox.from_json(JSON.stringify(vaultBox)).sigma_serialize_bytes(),
  ).length;
  if (sourceBytes >= 4096 || vaultBytes >= 4096) {
    throw new Error(`causal source/vault boxes exceed maxBoxSize: source=${sourceBytes} vault=${vaultBytes}`);
  }
  console.log(`PASS causal box sizes: source=${sourceBytes}B vault=${vaultBytes}B`);
  return { vaultBox, sourceIntentHex, admissionProfileIdHex };
}

async function buildSettlementFixture(
  wasm: any,
  trees: CompiledTrees,
  vaultBox: any,
  sourceIntentHex: string,
  admissionProfileIdHex: string,
): Promise<SettlementFixture> {
  const recipient = await makeKeyPair(wasm);
  const signer = await makeKeyPair(wasm);
  const finalityAttestor = await makeKeyPair(wasm);
  const bridgeCommittee = await makeKeyPair(wasm);
  const executionBlockHashHex = hashHex('t20e-execution-block');
  const sidechainTxHashHex = hashHex('t20e-burn-transaction');
  const eventIndex = 7;
  const sidechainHeight = 1_024;
  const burnIdHex = deriveTrustlessBurnIdHex({
    sidechainIdHex: SIDECHAIN_ID_HEX,
    sidechainTxHashHex,
    eventIndex,
  });
  const recipientHashHex = blake2b256(Buffer.from(recipient.p2pkTree, 'hex')).toString('hex');
  const leaf = encodeTrustlessBurnLeaf({
    sidechainIdHex: SIDECHAIN_ID_HEX,
    sidechainBlockHashHex: executionBlockHashHex,
    burnIdHex,
    sidechainTxHashHex,
    eventIndex,
    recipientErgoTreeHashHex: recipientHashHex,
    amountNanoErg: PAYOUT_VALUE,
    assetIdHex: ZERO_ASSET_ID,
  });
  const trackerIdentity = {
    sidechainIdHex: SIDECHAIN_ID_HEX,
    sidechainHeight,
    sidechainHeaderHashHex: executionBlockHashHex,
  };
  const trackerValue = canonicalTrackerValue(
    leaf.leafHashHex,
    executionBlockHashHex,
    sidechainHeight,
    CURRENT_HEIGHT - 10,
  );
  const trackerProof = buildAuthenticatedSpvTrackerGetProof(
    [{ key: deriveTrackerKey(trackerIdentity), value: trackerValue }],
    {
      sidechainIdHex: SIDECHAIN_ID_HEX,
      sidechainHeight,
      executionBlockHashHex,
    },
  );
  const plan = buildAuthenticatedSettlementPlan({
    spvHistory: [{ key: deriveTrackerKey(trackerIdentity), value: trackerValue }],
    dupHistoryKeys: [],
    claim: {
      pegOut: {
        user: `0x${'77'.repeat(20)}`,
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
        bridgeEventRootHex: leaf.leafHashHex,
        recipientErgoTreeHashHex: recipientHashHex,
        amountNanoErg: PAYOUT_VALUE,
        assetIdHex: ZERO_ASSET_ID,
        trustlessBurnProof: [],
      },
    },
  });
  if (trackerProof.digestHex !== plan.trackerInputDigestHex) {
    throw new Error('tracker proof digest differs from authenticated settlement plan');
  }
  const trackerBox = await syntheticBox(wasm, {
    value: MIN_BOX_VALUE,
    ergoTree: trees.tracker,
    assets: singleton(TRACKER_NFT_ID),
    additionalRegisters: {
      R4: encodeLongRegister(1),
      R5: encodeAuthenticatedSpvTrackerAvlRegister(plan.trackerInputDigestHex),
      R6: encodeCollByteRegister(Buffer.from(SIDECHAIN_ID_HEX, 'hex')),
      R7: encodeLongRegister(sidechainHeight),
      R8: encodeIntRegister(CURRENT_HEIGHT - 1),
      R9: encodeSigmaPropRegister(finalityAttestor.pubKeyHex),
    },
    transactionByte: 0x41,
    creationHeight: CURRENT_HEIGHT - 1,
  });
  const dupBox = await syntheticBox(wasm, {
    value: MIN_BOX_VALUE,
    ergoTree: trees.causalDuplicatePrevention,
    assets: singleton(CAUSAL_DUP_NFT_ID),
    additionalRegisters: {
      R4: encodeLongRegister(1),
      R5: encodeAvlTreeRegister(Buffer.from(getDupTreeDigest([]), 'hex'), DUP_FLAGS, 1),
      R6: encodeSigmaPropRegister(bridgeCommittee.pubKeyHex),
    },
    transactionByte: 0x42,
    creationHeight: CURRENT_HEIGHT - 1,
  });
  const deployed = {
    spvTrackerAuthenticated: {
      nftId: TRACKER_NFT_ID,
      ergoTreeHex: trees.tracker,
    },
    doubleUnlockPreventionCausalV2: {
      nftId: CAUSAL_DUP_NFT_ID,
      ergoTreeHex: trees.causalDuplicatePrevention,
    },
    mainChainCausalVaultV2: {
      ergoTreeHex: trees.causalVault,
    },
  };
  const unsignedTx = buildCausalAuthenticatedSettlementTx({
    deployed,
    plan,
    trackerBox,
    duplicatePreventionBox: dupBox,
    unlockBox: vaultBox,
    recipientErgoTreeHex: recipient.p2pkTree,
    expectedSourceNetworkIdHex: SOURCE_NETWORK_ID_HEX,
    expectedAdmissionProfileIdHex: admissionProfileIdHex,
    creationHeight: CURRENT_HEIGHT,
  });
  return {
    unsignedTx,
    inputBoxes: [dupBox, vaultBox],
    dataInputBoxes: [trackerBox],
    vaultBox,
    dupBox,
    trackerBox,
    signerPrivateKey: signer.privateKeyHex,
    sourceIntentHex,
    sourceBoxIdHex: vaultBox.additionalRegisters.R5,
  };
}

async function runCausalVaultMatrix(
  wasm: any,
  stateContext: any,
  fixture: SettlementFixture,
  trees: CompiledTrees,
): Promise<void> {
  await expectSign(
    wasm,
    stateContext,
    'causal-vault authenticated payout',
    fixture.unsignedTx,
    fixture.inputBoxes,
    fixture.dataInputBoxes,
    fixture.signerPrivateKey,
  );

  const mismatchedDupBox = await syntheticBox(wasm, {
    value: fixture.dupBox.value,
    ergoTree: trees.mismatchedCausalDuplicatePrevention,
    assets: fixture.dupBox.assets,
    additionalRegisters: fixture.dupBox.additionalRegisters,
    transactionByte: 0x47,
    creationHeight: fixture.dupBox.creationHeight,
  });
  const mismatchedDupTx = structuredClone(fixture.unsignedTx);
  mismatchedDupTx.inputs[0].boxId = mismatchedDupBox.boxId;
  mismatchedDupTx.outputs[0].ergoTree = trees.mismatchedCausalDuplicatePrevention;
  await expectReject(
    wasm,
    stateContext,
    'DUP bound to a different causal-vault hash',
    mismatchedDupTx,
    [mismatchedDupBox, fixture.vaultBox],
    fixture.dataInputBoxes,
    fixture.signerPrivateKey,
    0,
  );

  const wrongSuccessorIntent = structuredClone(fixture.unsignedTx);
  const wrongIntent = Buffer.from(fixture.sourceIntentHex, 'hex');
  wrongIntent[1] ^= 1;
  wrongSuccessorIntent.outputs[2].additionalRegisters.R4 = encodeCollByteRegister(wrongIntent);
  await expectReject(
    wasm,
    stateContext,
    'vault successor intent mutation',
    wrongSuccessorIntent,
    fixture.inputBoxes,
    fixture.dataInputBoxes,
    fixture.signerPrivateKey,
    1,
  );

  const wrongSuccessorSource = structuredClone(fixture.unsignedTx);
  wrongSuccessorSource.outputs[2].additionalRegisters.R5 = encodeCollByteRegister(Buffer.from('ef'.repeat(32), 'hex'));
  await expectReject(
    wasm,
    stateContext,
    'vault successor source-box mutation',
    wrongSuccessorSource,
    fixture.inputBoxes,
    fixture.dataInputBoxes,
    fixture.signerPrivateKey,
    1,
  );

  const nonErgIntent = Buffer.from(fixture.sourceIntentHex, 'hex');
  nonErgIntent[169] = 1;
  await expectMutatedVaultReject(
    wasm,
    stateContext,
    fixture,
    'source-intent sidechain mismatch',
    encodeCollByteRegister(mutateSourceIntentByte(fixture.sourceIntentHex, 33)),
    fixture.vaultBox.additionalRegisters.R5,
    0x43,
  );
  await expectMutatedVaultReject(
    wasm,
    stateContext,
    fixture,
    'non-ERG causal vault intent',
    encodeCollByteRegister(nonErgIntent),
    fixture.vaultBox.additionalRegisters.R5,
    0x44,
  );
  await expectMutatedVaultReject(
    wasm,
    stateContext,
    fixture,
    'zero causal source box ID',
    fixture.vaultBox.additionalRegisters.R4,
    encodeCollByteRegister(Buffer.alloc(32)),
    0x45,
  );

  const wrongTrackerSidechain = await syntheticBox(wasm, {
    value: Number(fixture.trackerBox.value),
    ergoTree: fixture.trackerBox.ergoTree,
    assets: fixture.trackerBox.assets,
    additionalRegisters: {
      ...fixture.trackerBox.additionalRegisters,
      R6: encodeCollByteRegister(Buffer.from('fe'.repeat(32), 'hex')),
    },
    transactionByte: 0x46,
    creationHeight: fixture.trackerBox.creationHeight,
  });
  const wrongTracker = structuredClone(fixture.unsignedTx);
  wrongTracker.dataInputs[0].boxId = wrongTrackerSidechain.boxId;
  await expectReject(
    wasm,
    stateContext,
    'tracker sidechain mismatch',
    wrongTracker,
    fixture.inputBoxes,
    [wrongTrackerSidechain],
    fixture.signerPrivateKey,
    1,
  );

  const swapped = structuredClone(fixture.unsignedTx);
  [swapped.inputs[0], swapped.inputs[1]] = [swapped.inputs[1], swapped.inputs[0]];
  await expectReject(
    wasm,
    stateContext,
    'causal settlement input-order drift',
    swapped,
    [fixture.vaultBox, fixture.dupBox],
    fixture.dataInputBoxes,
    fixture.signerPrivateKey,
  );
}

function mutateSourceIntentByte(sourceIntentHex: string, offset: number): Buffer {
  const bytes = Buffer.from(sourceIntentHex, 'hex');
  bytes[offset] ^= 1;
  return bytes;
}

async function expectMutatedVaultReject(
  wasm: any,
  stateContext: any,
  fixture: SettlementFixture,
  label: string,
  r4: string,
  r5: string,
  transactionByte: number,
): Promise<void> {
  const mutatedVault = await syntheticBox(wasm, {
    value: Number(fixture.vaultBox.value),
    ergoTree: fixture.vaultBox.ergoTree,
    additionalRegisters: { R4: r4, R5: r5 },
    transactionByte,
    creationHeight: fixture.vaultBox.creationHeight,
  });
  const tx = structuredClone(fixture.unsignedTx);
  tx.inputs[1].boxId = mutatedVault.boxId;
  tx.outputs[2].additionalRegisters = { R4: r4, R5: r5 };
  await expectReject(
    wasm,
    stateContext,
    label,
    tx,
    [fixture.dupBox, mutatedVault],
    fixture.dataInputBoxes,
    fixture.signerPrivateKey,
    1,
  );
}

function canonicalTrackerValue(
  bridgeEventRootHex: string,
  executionBlockHashHex: string,
  sidechainHeight: number,
  anchorHeight: number,
): string {
  const checkpoint = buildBridgeCheckpointCommitmentV1({
    sidechainIdHex: SIDECHAIN_ID_HEX,
    sidechainHeight,
    sidechainConsensusBlockHashHex: hashHex('t20e-consensus-block'),
    executionBlockHashHex,
    bridgeEventRootHex,
    burnLeafCount: 1,
    finalityAuthoritySetId: 7,
    finalityAuthoritySetHashHex: hashHex('t20e-finality-set'),
    finalityProofHashHex: hashHex('t20e-finality-proof'),
  });
  const statement = buildBridgeFinalityStatementV1({
    encodedCheckpointHex: checkpoint.encodedCheckpointHex,
    checkpointCommitmentHex: checkpoint.checkpointCommitmentHex,
    trustedAnchorDigestHex: hashHex('t20e-trusted-anchor'),
    finalityHorizonHeight: sidechainHeight,
    finalityHorizonHashHex: hashHex('t20e-finality-horizon'),
  });
  const proof = buildAggregateFinalityProofV1({
    verifierProfileIdHex: hashHex('t20e-finality-verifier'),
    encodedStatement: statement.encodedStatementHex,
    payload: Buffer.from('t20e-causal-vault-vm-proof', 'ascii'),
  });
  const commitment = buildAggregateFinalityCommitmentV1(proof);
  return encodeAuthenticatedSpvTrackerValue({
    bridgeEventRootHex,
    checkpointCommitmentHex: checkpoint.checkpointCommitmentHex,
    anchorHeaderIdHex: hashHex('t20e-ergo-anchor-header'),
    anchorHeaderHeight: anchorHeight,
    finalityProofSystemId: commitment.proofSystemId,
    finalityStatementDigestHex: commitment.statementDigestHex,
    finalityProgramIdHex: commitment.statement.programIdHex,
    finalityVerifierProfileIdHex: commitment.verifierProfileIdHex,
    finalityProofPayloadDigestHex: commitment.payloadDigestHex,
    finalityProofDigestHex: commitment.proofDigestHex,
  });
}

function deriveTrackerKey(identity: {
  sidechainIdHex: string;
  sidechainHeight: number;
  sidechainHeaderHashHex: string;
}): string {
  const height = Buffer.alloc(8);
  height.writeBigUInt64BE(BigInt(identity.sidechainHeight));
  return blake2b256(Buffer.concat([
    Buffer.from('E2S_SPV_V2', 'ascii'),
    Buffer.from(identity.sidechainIdHex, 'hex'),
    height,
    Buffer.from(identity.sidechainHeaderHashHex, 'hex'),
  ])).toString('hex');
}

function blake2b256(data: Buffer): Buffer {
  return Buffer.from(blakejs.blake2b(data, undefined, 32));
}

function hashHex(label: string): string {
  return blake2b256(Buffer.from(label, 'ascii')).toString('hex');
}

async function main(): Promise<void> {
  console.log('WP-06T20E-B causal peg-in source-contract VM evaluation');
  const wasm = await getWasm();
  const committee = [await makeKeyPair(wasm), await makeKeyPair(wasm), await makeKeyPair(wasm)];
  const trees = await compileLinkedTrees(committee);
  const synthetic = buildDeterministicSyntheticVmHeaderContext(wasm, {
    currentHeight: CURRENT_HEIGHT,
    anchorContextIndex: 0,
    anchorExtensionRootHex: hashHex('t20e-synthetic-extension-root'),
  });
  const source = await runSourceLockMatrix(wasm, synthetic.stateContext, trees, committee);
  const settlement = await buildSettlementFixture(
    wasm,
    trees,
    source.vaultBox,
    source.sourceIntentHex,
    source.admissionProfileIdHex,
  );
  await runCausalVaultMatrix(wasm, synthetic.stateContext, settlement, trees);
  console.log('PASS causal source lock, refund, committed vault payout, and eighteen fail-closed VM cases.');
  console.log(
    'BOUNDARY: synthetic headers and compile-only loopback RPC do not prove canonical inclusion, ' +
    'active profile registration, finality-proof execution, live node acceptance, mint authority, ' +
    'Gate 5 closure, deployment, broadcast, or production readiness.',
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main().catch(error => {
    console.error('FATAL:', error);
    process.exit(1);
  });
}
