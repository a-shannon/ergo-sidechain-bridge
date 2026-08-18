/**
 * Hybrid Signer — Fleet SDK (P2PK) + ergo-lib-wasm (Contract Scripts)
 *
 * ARCHITECTURE (Phase 006 → Phase 010 Ready):
 *   Fleet SDK's Prover generates Schnorr proofs with a hardcoded P2PK
 *   Sigma tree (commitment prefix `010027100108cd`). This works perfectly
 *   for simple P2PK addresses but FAILS for register-based proveDlog
 *   contracts like `proveDlog(decodePoint(R6))` because the Fiat-Shamir
 *   challenge hash is computed over the wrong proposition tree.
 *
 *   For contract-guarded inputs, we use ergo-lib-wasm-nodejs which embeds
 *   the full sigma-rust interpreter and correctly evaluates the proposition
 *   tree before generating the Schnorr proof.
 *
 * SIGNING FLOW:
 *   1. Build unsigned TX in EIP-12 format (Fleet SDK for construction)
 *   2. Convert to WASM types (UnsignedTransaction, ErgoBoxes)
 *   3. Sign with Wallet.sign_transaction() (full Sigma interpreter)
 *   4. Hand the exact signed TX to a separately authorized submitter
 *
 * ON-CHAIN MULTISIG READINESS (Phase 010a):
 *   `atLeast(m, Coll(pk1..pkN))` remains regular ErgoScript evaluation from
 *   this signer's perspective. Each committee signer can use the same local
 *   WASM path independently; FROST is deferred to Phase 015.
 *
 * The node wallet address stays EMPTY — it is NEVER used for signing.
 */

import { createHash } from 'crypto';
import { ErgoHDKey } from '@fleet-sdk/wallet';
import { ErgoAddress } from '@fleet-sdk/core';
import { assertContextExtensionSafe } from './context-extension-guard.js';
import {
  ERGO_NODE_CHECKER_PROFILE,
  ERGO_NODE_CHECK_SOURCE_ADAPTER_PROFILE,
  LOCAL_WASM_CHECK_SIGNER_PROFILE,
  LOCAL_WASM_SIGNED_CHECK_CANDIDATE_PROFILE,
} from './ergo-check-profiles.js';
import { buildWasmSimplifiedUpcomingPreHeaderCarrier } from './ergo-upcoming-state-context.js';
import {
  assertEip12CreationHeights,
  deriveUnsignedTransactionId,
  toUnsignedTransactionJson,
} from './ergo-unsigned-transaction.js';

export {
  assertEip12CreationHeights,
  deriveUnsignedTransactionId,
} from './ergo-unsigned-transaction.js';
export {
  ERGO_NODE_CHECKER_PROFILE,
  ERGO_NODE_CHECK_SOURCE_ADAPTER_PROFILE,
  LOCAL_WASM_CHECK_SIGNER_PROFILE,
  LOCAL_WASM_SIGNED_CHECK_CANDIDATE_PROFILE,
} from './ergo-check-profiles.js';

// ergo-lib-wasm-nodejs is a CJS module — dynamic import in ESM
let _wasm: any = null;
async function getWasm(): Promise<any> {
  if (!_wasm) {
    // @ts-ignore — CJS/ESM interop
    _wasm = await import('ergo-lib-wasm-nodejs');
    if (_wasm.default) _wasm = _wasm.default; // handle default export wrapper
  }
  return _wasm;
}

const SIGNER_SECRET_FIELD_PATTERN = new RegExp(
  [
    'WALLET_MNEMONIC',
    'mnemonic',
    ['private', 'Key', 'Hex'].join(''),
    ['private', 'Key'].join(''),
    ['secrets', 'dlog'].join('\\.'),
  ].join('|').replace(/^/, '\\b(').replace(/$/, ')\\b\\s*[:=]\\s*[\'"]?[^\'"\\s,)]+'),
  'gi',
);
const WINDOWS_USER_PATH_PATTERN = new RegExp(
  `${['C:', 'Users'].join('\\\\')}\\\\[^\\r\\n)]+`,
  'gi',
);

export interface SignerKeys {
  address: string;      // Testnet P2PK address (deriveChild(0))
  ergoTree: string;     // ErgoTree hex for outputs
  pubKeyHex: string;    // Compressed public key (33 bytes hex)
  privateKeyHex: string; // Private key hex (for reference/debugging)
  childKey?: ErgoHDKey; // Present only for the legacy Fleet child-0 derivation
  networkPrefix: number;
}

export interface SignedSubmitResult {
  txId: string;
  signedTx: any;
}

interface InterpretedCheckResult {
  txId: string;
  signedTx: any;
  checkResult: unknown;
}

export interface SignedCheckSignerContext {
  profile: typeof LOCAL_WASM_CHECK_SIGNER_PROFILE;
  pubKeyHex: string;
  ergoTreeHex: string;
  networkPrefix: number;
  stateContextTipHeight: number;
  stateContextTipIdHex: string;
}

export interface SignedCheckNodeIdentity {
  profile: typeof ERGO_NODE_CHECKER_PROFILE;
  sourceAdapterProfile: typeof ERGO_NODE_CHECK_SOURCE_ADAPTER_PROFILE;
  nodeOrigin: string;
  path: '/transactions/check';
  method: 'POST';
  transportPolicy: 'no-redirect-no-proxy';
}

export interface SignedCheckResult {
  txId: string;
  checkResult: unknown;
  signedTransactionDigestHex: string;
  signedTransactionBytesSha256Hex?: string;
  signedTransactionBytesLength?: number;
  signerContext: SignedCheckSignerContext;
  checkerIdentity: SignedCheckNodeIdentity;
}

export interface LocalWasmSignedCheckCandidate {
  profile: typeof LOCAL_WASM_SIGNED_CHECK_CANDIDATE_PROFILE;
  txId: string;
  signedTransactionDigestHex: string;
  signedTransactionBytesSha256Hex?: string;
  signedTransactionBytesLength?: number;
  nodeOrigin: string;
  signerContext: SignedCheckSignerContext;
}

export interface LocalWasmExactBytesSignedCheckCandidate
  extends LocalWasmSignedCheckCandidate {
  signedTransactionBytesSha256Hex: string;
  signedTransactionBytesLength: number;
}

export type LocalWasmOpaqueCheckResult = SignedCheckResult;

export const LOCAL_WASM_CHECKED_SUBMISSION_HANDLE_V1_PROFILE =
  'e2s.local-wasm-checked-submission-handle.v1' as const;

export interface LocalWasmCheckedSubmissionHandleV1 {
  readonly profile: typeof LOCAL_WASM_CHECKED_SUBMISSION_HANDLE_V1_PROFILE;
  readonly txId: string;
  readonly nodeOrigin: string;
  readonly signedTransactionDigestHex: string;
  readonly signedTransactionBytesSha256Hex: string;
  readonly signedTransactionBytesLength: number;
  readonly checkResponseDigestHex: string;
  readonly checkerIdentity: SignedCheckNodeIdentity;
}

export interface LocalWasmCheckedSubmissionAcceptanceV1 {
  readonly checked: Readonly<LocalWasmOpaqueCheckResult>;
  readonly submissionHandle: Readonly<LocalWasmCheckedSubmissionHandleV1>;
}

export interface LocalWasmSubmissionExecutionBindingV1 {
  readonly processBindingDigestHex: string;
  readonly executionTargetIdentityDigestHex: string;
}

interface LocalWasmSignedCheckMaterial {
  readonly signedTx: Readonly<Record<string, unknown>>;
  readonly signedTransactionBytesHex: string;
}

const LOCAL_WASM_SIGNED_CHECK_CANDIDATES = new WeakSet<object>();
const LOCAL_WASM_SIGNED_CHECK_MATERIAL =
  new WeakMap<object, LocalWasmSignedCheckMaterial>();
const LOCAL_WASM_CHECK_RESULTS = new WeakMap<
  object,
  LocalWasmExactBytesSignedCheckCandidate
>();
const LOCAL_WASM_PROMOTED_SUBMISSION_CANDIDATES = new WeakSet<object>();
const LOCAL_WASM_CHECKED_SUBMISSION_HANDLES = new WeakSet<object>();
const LOCAL_WASM_CHECKED_SUBMISSION_MATERIAL = new WeakMap<
  object,
  Readonly<{
    signedCandidate: LocalWasmExactBytesSignedCheckCandidate;
    checkResponseDigestHex: string;
    executionBinding: Readonly<LocalWasmSubmissionExecutionBindingV1>;
  }>
>();
const CONSUMED_LOCAL_WASM_CHECKED_SUBMISSION_HANDLES = new WeakSet<object>();

export interface LocalWasmCheckCandidate {
  role: string;
  eip12Tx: any;
  expectedTxId: string;
}

export interface LocalWasmCheckAcceptance {
  role: string;
  expectedTxId: string;
  signedTxId: string;
  nodeTxId: string;
  checkResponseSha256Hex: string;
}

export interface PreparedLocalWasmCheckSigner {
  pubKeyHex: string;
  ergoTreeHex: string;
  stateContextTipHeight: number;
  stateContextTipIdHex: string;
  checkTransactions(
    candidates: readonly LocalWasmCheckCandidate[],
    checkNode: (signedTransaction: unknown) => Promise<unknown>,
  ): Promise<LocalWasmCheckAcceptance[]>;
}

export interface PreparedLocalWasmRootCheckBatch {
  readonly derivation: 'wasm-root';
  readonly pubKeyHex: string;
  readonly ergoTreeHex: string;
  readonly stateContextTipHeight: number;
  readonly stateContextTipIdHex: string;
  readonly candidates: readonly Readonly<{
    readonly role: string;
    readonly expectedTxId: string;
    readonly signedCandidate: LocalWasmExactBytesSignedCheckCandidate;
  }>[];
}

type NodeGet = (path: string) => Promise<any>;

let _cachedKeys: SignerKeys | null = null;

/**
 * Derive signing keys from WALLET_MNEMONIC.
 * Cached after first call — safe to call repeatedly.
 */
export async function getSignerKeys(): Promise<SignerKeys> {
  if (_cachedKeys) return _cachedKeys;

  const mnemonic = process.env.WALLET_MNEMONIC?.trim();
  if (!mnemonic) {
    throw new Error('WALLET_MNEMONIC is not set in the process environment');
  }

  // 🚨 FIX (Finding #37): Network prefix MUST match the target network.
  // Testnet = 16, Mainnet = 0. If wrong, all addresses and ErgoTrees
  // are derived for the wrong network → node rejects every TX.
  // Default to testnet (16) for backward compatibility.
  const networkPrefix = parseInt(process.env.ERGO_NETWORK_PREFIX ?? '16', 10);
  _cachedKeys = await deriveSignerKeysFromMnemonic(mnemonic, networkPrefix);
  return _cachedKeys;
}

async function deriveSignerKeysFromMnemonic(
  mnemonic: string,
  networkPrefix: number,
): Promise<SignerKeys> {
  if (!mnemonic.trim()) throw new Error('signer mnemonic must not be empty');
  if (!Number.isSafeInteger(networkPrefix) || networkPrefix < 0 || networkPrefix > 255) {
    throw new Error('signer network prefix must be an unsigned byte');
  }
  const masterKey = await ErgoHDKey.fromMnemonic(mnemonic);
  const childKey = masterKey.deriveChild(0);
  const address = childKey.address.toString(networkPrefix);
  const ergoTree = ErgoAddress.fromBase58(address).ergoTree;
  const pubKeyHex = Buffer.from(childKey.publicKey).toString('hex');
  const privateKeyHex = Buffer.from(childKey.privateKey!).toString('hex');

  return { address, ergoTree, pubKeyHex, privateKeyHex, childKey, networkPrefix };
}

async function deriveRootSignerKeysFromMnemonic(
  mnemonic: string,
  networkPrefix: number,
  wasm: any,
): Promise<SignerKeys> {
  if (!mnemonic.trim()) throw new Error('signer mnemonic must not be empty');
  if (!Number.isSafeInteger(networkPrefix) || networkPrefix < 0 || networkPrefix > 255) {
    throw new Error('signer network prefix must be an unsigned byte');
  }

  const seed = wasm.Mnemonic.to_seed(mnemonic, '');
  const root = wasm.ExtSecretKey.derive_master(seed);
  const publicKey = root.public_key();
  const address = wasm.Address.p2pk_from_pk_bytes(publicKey.pub_key_bytes());
  const ergoTree = address.to_ergo_tree();
  try {
    return {
      address: address.to_base58(networkPrefix),
      ergoTree: Buffer.from(ergoTree.sigma_serialize_bytes()).toString('hex'),
      pubKeyHex: Buffer.from(publicKey.pub_key_bytes()).toString('hex'),
      privateKeyHex: Buffer.from(root.secret_key_bytes()).toString('hex'),
      networkPrefix,
    };
  } finally {
    ergoTree.free?.();
    address.free?.();
    publicKey.free?.();
    root.free?.();
  }
}

/**
 * Select the header with the maximum numeric height from an array of headers.
 * Does NOT rely on API ordering -- always picks the true chain tip.
 *
 * Exported for unit testing.
 */
export function selectLatestHeader(
  headers: Array<{ height: number; [k: string]: any }>,
): { index: number; header: { height: number; [k: string]: any } } {
  if (headers.length === 0) throw new Error('selectLatestHeader: empty headers array');
  let maxIdx = 0;
  for (let i = 1; i < headers.length; i++) {
    if (headers[i].height > headers[maxIdx].height) maxIdx = i;
  }
  return { index: maxIdx, header: headers[maxIdx] };
}

/**
 * Build the same upcoming ErgoStateContext shape used by node transaction
 * validation: a predicted H+1 preheader over mined headers H..H-9.
 * Required by ergo-lib-wasm Wallet.sign_transaction().
 *
 * We select the mined tip by height rather than relying on API ordering.
 */
async function buildStateContext(
  wasm: any,
  getNode: NodeGet,
): Promise<any> {
  const headers = await getNode(`/blocks/lastHeaders/10`);
  return buildStateContextFromHeaders(wasm, headers).stateContext;
}

function buildStateContextFromHeaders(
  wasm: any,
  headers: unknown,
): { stateContext: any; tipHeight: number; tipIdHex: string } {
  if (!Array.isArray(headers) || headers.length !== 10) {
    throw new Error('local WASM signing requires exactly 10 mined context headers');
  }

  // Find the header with the highest height (order-independent)
  const { index: latestIdx } = selectLatestHeader(headers);
  const tipHeight = headers[latestIdx]?.height;
  const tipIdHex = String(headers[latestIdx]?.id ?? '').toLowerCase();
  if (!Number.isSafeInteger(tipHeight) || tipHeight <= 0) {
    throw new Error('local WASM signing context tip height must be a positive safe integer');
  }
  if (!/^[0-9a-f]{64}$/.test(tipIdHex)) {
    throw new Error('local WASM signing context tip ID must be canonical 32-byte hex');
  }
  const sorted = headers
    .map((h: any) => ({ h }))
    .sort((a: any, b: any) => b.h.height - a.h.height);
  const contextHeaders = sorted.map(({ h }: any) => h as Record<string, unknown>);
  for (let index = 0; index < contextHeaders.length; index += 1) {
    const expectedHeight = Number(tipHeight) - index;
    const id = String(contextHeaders[index].id ?? '').toLowerCase();
    if (Number(contextHeaders[index].height) !== expectedHeight || !/^[0-9a-f]{64}$/.test(id)) {
      throw new Error('local WASM signing headers must be height-contiguous from the mined tip');
    }
    if (index > 0) {
      const expectedId = String(contextHeaders[index - 1].parentId ?? '').toLowerCase();
      if (id !== expectedId) {
        throw new Error('local WASM signing headers must be parent-linked from the mined tip');
      }
    }
  }
  const firstContextHeader = wasm.BlockHeader.from_json(JSON.stringify(contextHeaders[0]));
  const blockHeaders = new wasm.BlockHeaders(firstContextHeader);
  for (let index = 1; index < contextHeaders.length; index += 1) {
    blockHeaders.add(wasm.BlockHeader.from_json(JSON.stringify(contextHeaders[index])));
  }

  const preHeaderCarrier = wasm.BlockHeader.from_json(JSON.stringify(
    buildWasmSimplifiedUpcomingPreHeaderCarrier(contextHeaders[0]),
  ));
  const preHeader = wasm.PreHeader.from_block_header(preHeaderCarrier);
  const params = wasm.Parameters.default_parameters();

  return {
    stateContext: new wasm.ErgoStateContext(preHeader, blockHeaders, params),
    tipHeight,
    tipIdHex,
  };
}

/**
 * Convert an EIP-12 unsigned TX into WASM-compatible format and sign it
 * using ergo-lib-wasm-nodejs Wallet (full sigma-rust interpreter).
 *
 * This handles ALL contract types including register-based proveDlog,
 * AVL tree operations, and multi-script atomic TXs.
 */
async function wasmSign(
  eip12Tx: any,
  keys: SignerKeys,
  getNode: NodeGet,
): Promise<any> {
  const wasm = await getWasm();
  const stateCtx = await buildStateContext(wasm, getNode);
  return wasmSignWithStateContext(eip12Tx, keys, wasm, stateCtx);
}

async function wasmSignWithStateContext(
  eip12Tx: any,
  keys: SignerKeys,
  wasm: any,
  stateCtx: any,
): Promise<any> {

  // 1. Build WASM Wallet from private key
  const secretKey = wasm.SecretKey.dlog_from_bytes(
    Buffer.from(keys.privateKeyHex, 'hex')
  );
  const secretKeys = new wasm.SecretKeys();
  secretKeys.add(secretKey);
  const wallet = wasm.Wallet.from_secrets(secretKeys);

  // 2. Convert inputs to WASM ErgoBoxes
  // EIP-12 inputs have full box data; WASM needs ErgoBox objects
  const inputBoxesJson = eip12Tx.inputs.map((input: any) => {
    // WASM ErgoBox.from_json expects a specific format:
    // { boxId, value (as string), ergoTree, assets, additionalRegisters,
    //   transactionId, index, creationHeight }
    return {
      boxId: input.boxId,
      value: typeof input.value === 'bigint' ? input.value.toString() : String(input.value),
      ergoTree: input.ergoTree,
      assets: (input.assets || []).map((a: any) => ({
        tokenId: a.tokenId,
        amount: typeof a.amount === 'bigint' ? a.amount.toString() : String(a.amount),
      })),
      additionalRegisters: input.additionalRegisters || {},
      transactionId: input.transactionId,
      index: typeof input.index === 'number' ? input.index : 0,
      creationHeight: input.creationHeight,
    };
  });
  // BigInt-safe converter for WASM JSON parsing
  // WASM from_boxes_json takes a JS array (NOT a JSON string)
  const numericValue = (v: any) => typeof v === 'bigint' ? v.toString() : String(v);
  const inputBoxes = wasm.ErgoBoxes.from_boxes_json(inputBoxesJson);

  // 4. Convert data inputs
  const dataInputBoxes = wasm.ErgoBoxes.empty();
  if (eip12Tx.dataInputs?.length > 0) {
    const dataJson = eip12Tx.dataInputs.map((di: any) => ({
      boxId: di.boxId,
      value: typeof di.value === 'bigint' ? di.value.toString() : String(di.value),
      ergoTree: di.ergoTree,
      assets: (di.assets || []).map((a: any) => ({
        tokenId: a.tokenId,
        amount: typeof a.amount === 'bigint' ? a.amount.toString() : String(a.amount),
      })),
      additionalRegisters: di.additionalRegisters || {},
      transactionId: di.transactionId,
      index: typeof di.index === 'number' ? di.index : 0,
      creationHeight: di.creationHeight,
    }));
    const dbis = wasm.ErgoBoxes.from_boxes_json(dataJson);
    for (let i = 0; i < dbis.len(); i++) dataInputBoxes.add(dbis.get(i));
  }

  // 5. Build unsigned TX in WASM format.
  const unsignedTx = wasm.UnsignedTransaction.from_json(
    JSON.stringify(toUnsignedTransactionJson(eip12Tx)),
  );

  // 6. Sign with full sigma-rust interpreter
  const signedTx = wallet.sign_transaction(stateCtx, unsignedTx, inputBoxes, dataInputBoxes);

  // 7. Return as JSON for node submission
  return JSON.parse(signedTx.to_json());
}

/**
 * Prepare a non-persistable local signer around an explicit header context.
 * Secret material and signed transaction bytes stay inside the returned
 * closure; callers receive only public identity and check-result digests.
 */
export async function prepareLocalWasmCheckSigner(input: {
  mnemonic: string;
  networkPrefix: number;
  headers: unknown;
  derivation?: 'fleet-child-0' | 'wasm-root';
}): Promise<PreparedLocalWasmCheckSigner> {
  const wasm = await getWasm();
  const context = buildStateContextFromHeaders(wasm, input.headers);
  let keys: SignerKeys;
  try {
    keys = input.derivation === 'wasm-root'
      ? await deriveRootSignerKeysFromMnemonic(
        input.mnemonic,
        input.networkPrefix,
        wasm,
      )
      : await deriveSignerKeysFromMnemonic(input.mnemonic, input.networkPrefix);
  } catch {
    throw new Error('local WASM signer preparation failed');
  }
  const publicIdentity = {
    pubKeyHex: keys.pubKeyHex.toLowerCase(),
    ergoTreeHex: keys.ergoTree.toLowerCase(),
    stateContextTipHeight: context.tipHeight,
    stateContextTipIdHex: context.tipIdHex,
  };
  return {
    ...publicIdentity,
    async checkTransactions(candidates, checkNode) {
      if (!Array.isArray(candidates) || candidates.length === 0) {
        throw new Error('local WASM check requires at least one candidate');
      }
      const roles = new Set<string>();
      const signedCandidates: Array<{
        role: string;
        expectedTxId: string;
        signed: any;
      }> = [];
      for (const candidate of candidates) {
        if (!candidate.role || roles.has(candidate.role)) {
          throw new Error('local WASM check candidate roles must be non-empty and distinct');
        }
        roles.add(candidate.role);
        assertContextExtensionSafe(candidate.eip12Tx?.inputs ?? [], candidate.role);
        assertEip12CreationHeights(candidate.role, candidate.eip12Tx);
        let signed: any;
        try {
          signed = await wasmSignWithStateContext(
            candidate.eip12Tx,
            keys,
            wasm,
            context.stateContext,
          );
        } catch {
          throw new Error(`${candidate.role}: local WASM signing failed`);
        }
        assertSignedTransactionIdMatchesExpected(candidate.role, signed, candidate.expectedTxId);
        signedCandidates.push({
          role: candidate.role,
          expectedTxId: normalizeTransactionId(candidate.expectedTxId),
          signed,
        });
      }

      const accepted: LocalWasmCheckAcceptance[] = [];
      for (const candidate of signedCandidates) {
        const result = await checkNode(candidate.signed);
        const interpreted = interpretCheckResult(candidate.role, candidate.signed, result);
        if (!interpreted) throw new Error(`${candidate.role}: /transactions/check failed`);
        accepted.push({
          role: candidate.role,
          expectedTxId: candidate.expectedTxId,
          signedTxId: interpreted.txId,
          nodeTxId: interpreted.txId,
          checkResponseSha256Hex: createHash('sha256')
            .update(JSON.stringify(result), 'utf8')
            .digest('hex'),
        });
      }
      return accepted;
    },
  };
}

export async function prepareLocalWasmRootCheckSigner(input: {
  mnemonic: string;
  networkPrefix: number;
  headers: unknown;
}): Promise<PreparedLocalWasmCheckSigner> {
  return prepareLocalWasmCheckSigner({
    ...input,
    derivation: 'wasm-root',
  });
}

/**
 * Root-sign a complete check-only batch without exposing signed bytes.
 *
 * Every candidate is signed before any opaque handle is returned. The handles
 * can only be consumed by the separate process-bound /transactions/check
 * capability below; callers never receive the signed transaction objects.
 */
export async function prepareLocalWasmRootCheckCandidates(input: {
  mnemonic: string;
  networkPrefix: number;
  headers: unknown;
  nodeOrigin: string;
  candidates: readonly LocalWasmCheckCandidate[];
}): Promise<PreparedLocalWasmRootCheckBatch> {
  if (!Array.isArray(input.candidates) || input.candidates.length === 0) {
    throw new Error('local WASM root check requires at least one candidate');
  }
  const wasm = await getWasm();
  const context = buildStateContextFromHeaders(wasm, input.headers);
  const nodeOrigin = normalizeNodeOrigin(input.nodeOrigin);
  let keys: SignerKeys;
  try {
    keys = await deriveRootSignerKeysFromMnemonic(
      input.mnemonic,
      input.networkPrefix,
      wasm,
    );
  } catch {
    throw new Error('local WASM root signer preparation failed');
  }
  const signerContext: SignedCheckSignerContext = Object.freeze({
    profile: LOCAL_WASM_CHECK_SIGNER_PROFILE,
    pubKeyHex: keys.pubKeyHex.toLowerCase(),
    ergoTreeHex: keys.ergoTree.toLowerCase(),
    networkPrefix: keys.networkPrefix,
    stateContextTipHeight: context.tipHeight,
    stateContextTipIdHex: context.tipIdHex,
  });
  const roles = new Set<string>();
  const signed: Array<{
    role: string;
    expectedTxId: string;
    signedTx: unknown;
  }> = [];
  for (const candidate of input.candidates) {
    if (!candidate.role || roles.has(candidate.role)) {
      throw new Error('local WASM root check candidate roles must be non-empty and distinct');
    }
    roles.add(candidate.role);
    assertContextExtensionSafe(candidate.eip12Tx?.inputs ?? [], candidate.role);
    assertEip12CreationHeights(candidate.role, candidate.eip12Tx);
    let signedTx: unknown;
    try {
      signedTx = await wasmSignWithStateContext(
        candidate.eip12Tx,
        keys,
        wasm,
        context.stateContext,
      );
    } catch {
      throw new Error(`${candidate.role}: local WASM root signing failed`);
    }
    assertSignedTransactionIdMatchesExpected(
      candidate.role,
      signedTx,
      candidate.expectedTxId,
    );
    signed.push({
      role: candidate.role,
      expectedTxId: normalizeTransactionId(candidate.expectedTxId),
      signedTx,
    });
  }

  const candidates = Object.freeze(signed.map(candidate => Object.freeze({
    role: candidate.role,
    expectedTxId: candidate.expectedTxId,
    signedCandidate: registerLocalWasmSignedCheckCandidate({
      txId: candidate.expectedTxId,
      signedTx: candidate.signedTx,
      wasm,
      nodeOrigin,
      signerContext,
    }),
  })));
  return Object.freeze({
    derivation: 'wasm-root' as const,
    pubKeyHex: signerContext.pubKeyHex,
    ergoTreeHex: signerContext.ergoTreeHex,
    stateContextTipHeight: signerContext.stateContextTipHeight,
    stateContextTipIdHex: signerContext.stateContextTipIdHex,
    candidates,
  });
}

/**
 * Read the exact signing context from one fixed node and root-sign a check-only
 * batch. Network access remains inside the signer/checker boundary.
 */
export async function prepareLocalWasmRootCheckCandidatesFromNode(input: {
  mnemonic: string;
  networkPrefix: number;
  nodeOrigin: string;
  candidates: readonly LocalWasmCheckCandidate[];
}): Promise<PreparedLocalWasmRootCheckBatch> {
  const { ngetDirect } = await import('./ergo-helpers.js');
  const nodeOrigin = normalizeNodeOrigin(input.nodeOrigin);
  return prepareLocalWasmRootCheckCandidates({
    ...input,
    nodeOrigin,
    headers: await ngetDirect('/blocks/lastHeaders/10', nodeOrigin),
  });
}

/**
 * Sign one exact EIP-12 transaction for a separately authorized submitter.
 *
 * This function has no broadcast capability. Callers provide the exact
 * credential-free node origin used to collect the signing context, and must
 * independently authorize any later submission of the returned signed object.
 */
export async function signTransactionForSubmission(
  eip12Tx: any,
  label: string,
  expectedTxId: string,
  nodeOrigin: string,
): Promise<SignedSubmitResult | null> {
  try {
    const { ngetDirect } = await import('./ergo-helpers.js');
    const signerNodeOrigin = normalizeNodeOrigin(nodeOrigin);
    assertContextExtensionSafe(eip12Tx.inputs ?? [], label);
    assertEip12CreationHeights(label, eip12Tx);
    const keys = await getSignerKeys();
    const signed = await wasmSign(
      eip12Tx,
      keys,
      path => ngetDirect(path, signerNodeOrigin),
    );
    assertSignedTransactionIdMatchesExpected(label, signed, expectedTxId);
    return {
      txId: normalizeTransactionId(String(signed.id)),
      signedTx: signed,
    };
  } catch (err: any) {
    console.error(`   ${label} signing failed: ${sanitizeSignerErrorText(err.message || err)}`);
    if (err.stack) {
      console.error(
        '   Stack:',
        sanitizeSignerErrorText(err.stack.split('\n').slice(0, 5).join('\n')),
      );
    }
    return null;
  }
}

function normalizeTransactionId(value: string): string {
  const trimmed = value.trim();
  return (trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed).toLowerCase();
}

export function assertSignedTransactionIdMatchesExpected(
  label: string,
  signed: any,
  expectedTxId?: string,
): void {
  if (expectedTxId === undefined) return;

  const signedTxId = normalizeTransactionId(String(signed?.id ?? ''));
  const expected = normalizeTransactionId(expectedTxId);
  if (!signedTxId || signedTxId !== expected) {
    throw new Error(
      `${label}: signed transaction ID ${signedTxId || '<missing>'} does not match approved expectedTxId ${expected}`,
    );
  }
}

export function interpretCheckResult(
  label: string,
  signed: any,
  result: unknown,
): InterpretedCheckResult | null {
  if (result === null || result === undefined) {
    console.error(`   ${label}: signed locally but REJECTED by /transactions/check (see [node] ERROR above)`);
    return null;
  }

  if (typeof result !== 'string') {
    console.error(`   ${label}: /transactions/check returned a non-transaction-ID response`);
    return null;
  }
  const signedTxId = normalizeTransactionId(String(signed?.id ?? ''));
  const nodeTxId = normalizeTransactionId(result);
  if (!signedTxId || signedTxId !== nodeTxId) {
    console.error(`   ${label}: /transactions/check transaction ID does not match the signed candidate`);
    return null;
  }
  return {
    txId: signedTxId,
    signedTx: signed,
    checkResult: result,
  };
}

export function sanitizeSignerErrorText(value: unknown): string {
  return String(value)
    .replace(WINDOWS_USER_PATH_PATTERN, '<local-path>')
    .replace(SIGNER_SECRET_FIELD_PATTERN, '$1=<redacted>');
}

/**
 * Sign an EIP-12 unsigned transaction for the check-only lifecycle.
 *
 * This capability cannot call the checker or a submission endpoint. The exact
 * signed object and signing-context identity remain process-bound so a later
 * checker must consume the same candidate rather than reconstructing it.
 */
export async function signTransactionForCheck(
  eip12Tx: any,
  label: string,
  expectedTxId: string,
  nodeOrigin: string,
): Promise<LocalWasmExactBytesSignedCheckCandidate | null> {
  try {
    const { ngetDirect } = await import('./ergo-helpers.js');
    assertContextExtensionSafe(eip12Tx.inputs ?? [], label);
    assertEip12CreationHeights(label, eip12Tx);

    const signerNodeOrigin = normalizeNodeOrigin(nodeOrigin);
    const wasm = await getWasm();
    const context = buildStateContextFromHeaders(
      wasm,
      await ngetDirect('/blocks/lastHeaders/10', signerNodeOrigin),
    );
    const keys = await getSignerKeys();
    const signed = await wasmSignWithStateContext(
      eip12Tx,
      keys,
      wasm,
      context.stateContext,
    );
    assertSignedTransactionIdMatchesExpected(label, signed, expectedTxId);
    return registerLocalWasmSignedCheckCandidate({
      txId: normalizeTransactionId(String(signed.id)),
      signedTx: signed,
      wasm,
      nodeOrigin: signerNodeOrigin,
      signerContext: {
        profile: LOCAL_WASM_CHECK_SIGNER_PROFILE,
        pubKeyHex: keys.pubKeyHex.toLowerCase(),
        ergoTreeHex: keys.ergoTree.toLowerCase(),
        networkPrefix: keys.networkPrefix,
        stateContextTipHeight: context.tipHeight,
        stateContextTipIdHex: context.tipIdHex,
      },
    });
  } catch (err: any) {
    console.error(`   ${label} check signing failed: ${sanitizeSignerErrorText(err.message || err)}`);
    if (err.stack) {
      console.error(
        '   Stack:',
        sanitizeSignerErrorText(err.stack.split('\n').slice(0, 5).join('\n')),
      );
    }
    return null;
  }
}

export function assertLocalWasmSignedCheckCandidateProvenance(
  candidate: unknown,
): asserts candidate is LocalWasmSignedCheckCandidate {
  if (
    typeof candidate !== 'object'
    || candidate === null
    || !LOCAL_WASM_SIGNED_CHECK_CANDIDATES.has(candidate)
  ) {
    throw new Error('local WASM signed check candidate provenance is missing');
  }
  const signed = candidate as LocalWasmSignedCheckCandidate;
  const material = LOCAL_WASM_SIGNED_CHECK_MATERIAL.get(signed);
  if (
    !material
    || signed.profile !== LOCAL_WASM_SIGNED_CHECK_CANDIDATE_PROFILE
    || !Object.isFrozen(signed)
    || !Object.isFrozen(signed.signerContext)
    || normalizeNodeOrigin(signed.nodeOrigin) !== signed.nodeOrigin
    || normalizeTransactionId(String(material.signedTx.id ?? '')) !== signed.txId
    || digestSignedCheckTransaction(material.signedTx)
      !== signed.signedTransactionDigestHex
    || material.signedTransactionBytesHex.length
      !== Number(signed.signedTransactionBytesLength) * 2
    || sha256Hex(Buffer.from(material.signedTransactionBytesHex, 'hex'))
      !== signed.signedTransactionBytesSha256Hex
  ) {
    throw new Error('local WASM signed check candidate binding is invalid');
  }
}

/**
 * Check one exact process-bound signed candidate via /transactions/check.
 *
 * This capability cannot sign, submit, or authorize broadcast. The checker
 * origin must equal the origin whose headers formed the signing context.
 */
export async function checkSignedTransaction(
  candidate: LocalWasmSignedCheckCandidate,
  label: string,
  nodeOrigin: string,
): Promise<LocalWasmOpaqueCheckResult | null> {
  try {
    const { ncheck } = await import('./ergo-helpers.js');
    assertLocalWasmSignedCheckCandidateProvenance(candidate);
    const material = requireLocalWasmSignedCheckMaterial(candidate);
    const checkerNodeOrigin = normalizeNodeOrigin(nodeOrigin);
    if (checkerNodeOrigin !== candidate.nodeOrigin) {
      throw new Error('checker node origin does not match the signed candidate context');
    }
    const result = await ncheck(
      '/transactions/check',
      material.signedTx,
      checkerNodeOrigin,
      { redactResponseBodyOnError: true },
    );
    const interpreted = interpretCheckResult(
      label,
      material.signedTx,
      result,
    );
    if (!interpreted) return null;
    const checked = Object.freeze({
      txId: interpreted.txId,
      checkResult: interpreted.checkResult,
      signedTransactionDigestHex: candidate.signedTransactionDigestHex,
      signedTransactionBytesSha256Hex:
        candidate.signedTransactionBytesSha256Hex,
      signedTransactionBytesLength: candidate.signedTransactionBytesLength,
      signerContext: candidate.signerContext,
      checkerIdentity: Object.freeze({
        profile: ERGO_NODE_CHECKER_PROFILE,
        sourceAdapterProfile: ERGO_NODE_CHECK_SOURCE_ADAPTER_PROFILE,
        nodeOrigin: checkerNodeOrigin,
        path: '/transactions/check',
        method: 'POST',
        transportPolicy: 'no-redirect-no-proxy',
      }),
    });
    LOCAL_WASM_CHECK_RESULTS.set(
      checked,
      candidate as LocalWasmExactBytesSignedCheckCandidate,
    );
    return checked;
  } catch (err: any) {
    console.error(`   ${label} check failed: ${sanitizeSignerErrorText(err.message || err)}`);
    if (err.stack) {
      console.error(
        '   Stack:',
        sanitizeSignerErrorText(err.stack.split('\n').slice(0, 5).join('\n')),
      );
    }
    return null;
  }
}

/**
 * Compatibility-only entry point for legacy check commands.
 *
 * The authenticated execution lifecycle rejects acceptances produced through
 * this combined route. New funds-facing composition must use the opaque split
 * signer and checker capabilities.
 */
export async function signAndCheck(
  eip12Tx: any,
  label: string,
  expectedTxId?: string,
): Promise<SignedCheckResult | null> {
  const { NODE } = await import('./ergo-helpers.js');
  const nodeOrigin = normalizeNodeOrigin(NODE);
  const signed = await signTransactionForCheck(
    eip12Tx,
    label,
    expectedTxId ?? await deriveUnsignedTransactionId(eip12Tx),
    nodeOrigin,
  );
  if (!signed) return null;
  const checked = await checkSignedTransaction(signed, label, nodeOrigin);
  return checked;
}

function registerLocalWasmSignedCheckCandidate(input: {
  txId: string;
  signedTx: unknown;
  wasm: any;
  nodeOrigin: string;
  signerContext: SignedCheckSignerContext;
}): LocalWasmExactBytesSignedCheckCandidate {
  const txId = normalizeTransactionId(input.txId);
  if (!/^[0-9a-f]{64}$/.test(txId)) {
    throw new Error('signed check transaction ID must be canonical 32-byte hex');
  }
  const signedTx = snapshotSignedCheckTransaction(input.signedTx);
  const signedTransactionBytesHex = canonicalHex(
    serializeSignedCheckTransactionHex(input.wasm, signedTx),
    'signed check transaction bytes',
  );
  if (normalizeTransactionId(String(signedTx.id ?? '')) !== txId) {
    throw new Error('signed check transaction does not match its transaction ID');
  }
  const candidate = Object.freeze({
    profile: LOCAL_WASM_SIGNED_CHECK_CANDIDATE_PROFILE,
    txId,
    signedTransactionDigestHex: digestSignedCheckTransaction(signedTx),
    signedTransactionBytesSha256Hex: sha256Hex(
      Buffer.from(signedTransactionBytesHex, 'hex'),
    ),
    signedTransactionBytesLength: signedTransactionBytesHex.length / 2,
    nodeOrigin: normalizeNodeOrigin(input.nodeOrigin),
    signerContext: Object.freeze({ ...input.signerContext }),
  });
  LOCAL_WASM_SIGNED_CHECK_CANDIDATES.add(candidate);
  LOCAL_WASM_SIGNED_CHECK_MATERIAL.set(candidate, Object.freeze({
    signedTx,
    signedTransactionBytesHex,
  }));
  return candidate;
}

function serializeSignedCheckTransactionHex(wasm: any, value: unknown): string {
  let transaction: any;
  try {
    transaction = wasm.Transaction.from_json(JSON.stringify(value));
    const bytes = Buffer.from(transaction.sigma_serialize_bytes());
    if (bytes.length === 0) {
      throw new Error('signed check transaction bytes are empty');
    }
    return bytes.toString('hex');
  } finally {
    transaction?.free?.();
  }
}

/**
 * Check one exact signed candidate and mint a distinct one-shot submission
 * handle. The ordinary check-only API never creates this capability.
 */
export async function checkSignedTransactionForSubmissionV1(
  candidate: LocalWasmExactBytesSignedCheckCandidate,
  label: string,
  nodeOrigin: string,
  executionBinding: Readonly<LocalWasmSubmissionExecutionBindingV1>,
): Promise<Readonly<LocalWasmCheckedSubmissionAcceptanceV1> | null> {
  const checked = await checkSignedTransaction(candidate, label, nodeOrigin);
  if (checked === null) return null;
  return promoteLocalWasmCheckedTransactionForSubmissionV1(
    candidate,
    checked,
    executionBinding,
  );
}

/**
 * Mint one submission handle from the exact process-local result of an already
 * completed node check. A copied or caller-authored check receipt is rejected.
 */
export function promoteLocalWasmCheckedTransactionForSubmissionV1(
  candidate: LocalWasmExactBytesSignedCheckCandidate,
  checked: Readonly<LocalWasmOpaqueCheckResult>,
  executionBinding: Readonly<LocalWasmSubmissionExecutionBindingV1>,
): Readonly<LocalWasmCheckedSubmissionAcceptanceV1> {
  assertLocalWasmSignedCheckCandidateProvenance(candidate);
  if (LOCAL_WASM_CHECK_RESULTS.get(checked) !== candidate) {
    throw new Error('checked submission result lacks exact process provenance');
  }
  if (LOCAL_WASM_PROMOTED_SUBMISSION_CANDIDATES.has(candidate)) {
    LOCAL_WASM_CHECK_RESULTS.delete(checked);
    throw new Error('signed submission candidate is already promoted');
  }
  if (
    checked.signedTransactionBytesSha256Hex
      !== candidate.signedTransactionBytesSha256Hex
    || checked.signedTransactionBytesLength
      !== candidate.signedTransactionBytesLength
  ) {
    throw new Error('checked submission bytes differ from the signed candidate');
  }
  const frozenChecked = checked;
  const checkResponseDigestHex = digestCheckedSubmissionResponseV1(
    frozenChecked,
  );
  if (candidate.nodeOrigin !== frozenChecked.checkerIdentity.nodeOrigin) {
    throw new Error('checked submission origin differs from its signed context');
  }
  const frozenExecutionBinding = snapshotSubmissionExecutionBindingV1(
    executionBinding,
  );
  LOCAL_WASM_CHECK_RESULTS.delete(checked);
  LOCAL_WASM_PROMOTED_SUBMISSION_CANDIDATES.add(candidate);
  const submissionHandle = Object.freeze({
    profile: LOCAL_WASM_CHECKED_SUBMISSION_HANDLE_V1_PROFILE,
    txId: candidate.txId,
    nodeOrigin: candidate.nodeOrigin,
    signedTransactionDigestHex: candidate.signedTransactionDigestHex,
    signedTransactionBytesSha256Hex:
      candidate.signedTransactionBytesSha256Hex,
    signedTransactionBytesLength: candidate.signedTransactionBytesLength,
    checkResponseDigestHex,
    checkerIdentity: frozenChecked.checkerIdentity,
  });
  LOCAL_WASM_CHECKED_SUBMISSION_HANDLES.add(submissionHandle);
  LOCAL_WASM_CHECKED_SUBMISSION_MATERIAL.set(submissionHandle, Object.freeze({
    signedCandidate: candidate,
    checkResponseDigestHex,
    executionBinding: frozenExecutionBinding,
  }));
  return Object.freeze({
    checked: frozenChecked,
    submissionHandle,
  });
}

export function assertLocalWasmCheckedSubmissionHandleV1Provenance(
  value: unknown,
): asserts value is Readonly<LocalWasmCheckedSubmissionHandleV1> {
  if (
    value === null
    || typeof value !== 'object'
    || !LOCAL_WASM_CHECKED_SUBMISSION_HANDLES.has(value)
  ) {
    throw new Error('local WASM checked submission handle provenance is missing');
  }
  if (CONSUMED_LOCAL_WASM_CHECKED_SUBMISSION_HANDLES.has(value)) {
    throw new Error('local WASM checked submission handle is already consumed');
  }
  const handle = value as Readonly<LocalWasmCheckedSubmissionHandleV1>;
  const material = LOCAL_WASM_CHECKED_SUBMISSION_MATERIAL.get(handle);
  if (!material) {
    throw new Error('local WASM checked submission material is unavailable');
  }
  assertLocalWasmSignedCheckCandidateProvenance(material.signedCandidate);
  if (
    handle.profile !== LOCAL_WASM_CHECKED_SUBMISSION_HANDLE_V1_PROFILE
    || !Object.isFrozen(handle)
    || handle.txId !== material.signedCandidate.txId
    || handle.nodeOrigin !== material.signedCandidate.nodeOrigin
    || handle.signedTransactionDigestHex
      !== material.signedCandidate.signedTransactionDigestHex
    || handle.signedTransactionBytesSha256Hex
      !== material.signedCandidate.signedTransactionBytesSha256Hex
    || handle.signedTransactionBytesLength
      !== material.signedCandidate.signedTransactionBytesLength
    || handle.checkResponseDigestHex !== material.checkResponseDigestHex
    || !Object.isFrozen(handle.checkerIdentity)
    || handle.checkerIdentity.profile !== ERGO_NODE_CHECKER_PROFILE
    || handle.checkerIdentity.sourceAdapterProfile
      !== ERGO_NODE_CHECK_SOURCE_ADAPTER_PROFILE
    || handle.checkerIdentity.nodeOrigin !== handle.nodeOrigin
    || handle.checkerIdentity.path !== '/transactions/check'
    || handle.checkerIdentity.method !== 'POST'
    || handle.checkerIdentity.transportPolicy !== 'no-redirect-no-proxy'
  ) {
    throw new Error('local WASM checked submission handle binding is invalid');
  }
}

export function assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding(
  handle: Readonly<LocalWasmCheckedSubmissionHandleV1>,
  executionBinding: Readonly<LocalWasmSubmissionExecutionBindingV1>,
): void {
  assertLocalWasmCheckedSubmissionHandleV1Provenance(handle);
  const material = LOCAL_WASM_CHECKED_SUBMISSION_MATERIAL.get(handle);
  const expected = snapshotSubmissionExecutionBindingV1(executionBinding);
  if (
    material === undefined
    || material.executionBinding.processBindingDigestHex
      !== expected.processBindingDigestHex
    || material.executionBinding.executionTargetIdentityDigestHex
      !== expected.executionTargetIdentityDigestHex
  ) {
    throw new Error('checked submission handle execution binding changed');
  }
}

/**
 * Give the exact signed object to one reviewed transport callback, once.
 * Callers cannot recover the object from the handle or invoke the callback a
 * second time, including after a transport exception or timeout.
 */
export async function consumeLocalWasmCheckedSubmissionHandleV1<T>(
  handle: Readonly<LocalWasmCheckedSubmissionHandleV1>,
  signedCandidate: LocalWasmExactBytesSignedCheckCandidate,
  consume: (
    signedTransaction: Readonly<Record<string, unknown>>,
  ) => Promise<T>,
): Promise<T> {
  assertLocalWasmCheckedSubmissionHandleV1Provenance(handle);
  const material = LOCAL_WASM_CHECKED_SUBMISSION_MATERIAL.get(handle);
  if (!material || material.signedCandidate !== signedCandidate) {
    throw new Error('checked submission handle differs from its signed candidate');
  }
  if (typeof consume !== 'function') {
    throw new Error('checked submission consumer must be a function');
  }
  CONSUMED_LOCAL_WASM_CHECKED_SUBMISSION_HANDLES.add(handle);
  const signedMaterial = requireLocalWasmSignedCheckMaterial(signedCandidate);
  return await consume(signedMaterial.signedTx);
}

function requireLocalWasmSignedCheckMaterial(
  candidate: LocalWasmSignedCheckCandidate,
): LocalWasmSignedCheckMaterial {
  const material = LOCAL_WASM_SIGNED_CHECK_MATERIAL.get(candidate);
  if (!material) {
    throw new Error('local WASM signed check material is unavailable');
  }
  return material;
}

function snapshotSubmissionExecutionBindingV1(
  value: Readonly<LocalWasmSubmissionExecutionBindingV1>,
): Readonly<LocalWasmSubmissionExecutionBindingV1> {
  if (
    value === null
    || typeof value !== 'object'
    || Object.keys(value).sort().join(',')
      !== 'executionTargetIdentityDigestHex,processBindingDigestHex'
    || !/^[0-9a-f]{64}$/u.test(value.processBindingDigestHex)
    || !/^[0-9a-f]{64}$/u.test(value.executionTargetIdentityDigestHex)
  ) {
    throw new Error('checked submission execution binding is invalid');
  }
  return Object.freeze({
    processBindingDigestHex: value.processBindingDigestHex,
    executionTargetIdentityDigestHex: value.executionTargetIdentityDigestHex,
  });
}

function snapshotSignedCheckTransaction(
  value: unknown,
): Readonly<Record<string, unknown>> {
  const json = JSON.stringify(
    value,
    (_key, child) => typeof child === 'bigint' ? child.toString() : child,
  );
  if (typeof json !== 'string') {
    throw new Error('signed check transaction must be JSON serializable');
  }
  const snapshot = JSON.parse(json) as Record<string, unknown>;
  return deepFreezeSignedCheckValue(snapshot);
}

function digestSignedCheckTransaction(value: unknown): string {
  return createHash('sha256')
    .update(canonicalSignedCheckJson(value), 'utf8')
    .digest('hex');
}

function digestCheckedSubmissionResponseV1(
  checked: Readonly<LocalWasmOpaqueCheckResult>,
): string {
  return createHash('sha256')
    .update('E2S_LOCAL_WASM_CHECKED_SUBMISSION_RESPONSE_V1\0', 'utf8')
    .update(canonicalSignedCheckJson({
      txId: checked.txId,
      checkResult: checked.checkResult,
      signedTransactionDigestHex: checked.signedTransactionDigestHex,
      signedTransactionBytesSha256Hex:
        checked.signedTransactionBytesSha256Hex,
      signedTransactionBytesLength: checked.signedTransactionBytesLength,
      checkerIdentity: checked.checkerIdentity,
    }), 'utf8')
    .digest('hex');
}

function sha256Hex(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be non-empty lowercase hex`);
  }
  return value;
}

function canonicalSignedCheckJson(value: unknown): string {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || typeof value === 'number'
  ) {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('signed check transaction cannot contain non-finite numbers');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalSignedCheckJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key =>
        `${JSON.stringify(key)}:${canonicalSignedCheckJson(record[key])}`)
      .join(',')}}`;
  }
  throw new Error(`signed check transaction cannot serialize ${typeof value}`);
}

function deepFreezeSignedCheckValue<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreezeSignedCheckValue(child);
    }
    Object.freeze(value);
  }
  return value;
}

export function normalizeNodeOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Ergo checker node must be an absolute HTTP(S) base URL');
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
  ) {
    throw new Error('Ergo checker node must be a credential-free HTTP(S) origin');
  }
  return parsed.origin.toLowerCase();
}
