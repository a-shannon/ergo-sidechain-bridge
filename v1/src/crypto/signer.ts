import * as wasm from 'ergo-lib-wasm-nodejs';
import { bytesToHex, hexToBytes } from '../core/codecs.js';

export interface ErgoBoxJson {
  boxId: string;
  transactionId: string;
  index: number;
  value: string | number;
  ergoTree: string;
  creationHeight: number;
  assets: Array<{ tokenId: string; amount: string | number }>;
  additionalRegisters: Record<string, string>;
}

export interface UnsignedInputJson {
  boxId: string;
  extension: Record<string, string>;
}

export interface UnsignedOutputJson {
  value: string;
  ergoTree: string;
  creationHeight: number;
  assets: Array<{ tokenId: string; amount: string }>;
  additionalRegisters: Record<string, string>;
}

export interface UnsignedTxJson {
  inputs: UnsignedInputJson[];
  dataInputs: Array<{ boxId: string }>;
  outputs: UnsignedOutputJson[];
}

export interface SignedTxResult {
  txId: string;
  signedTxJson: Record<string, unknown>;
  txBytesHex: string;
  inputBoxesBytesHex: string[];
  dataBoxesBytesHex: string[];
}

export interface MinimalHeaderJson {
  id: string;
  version: number;
  parentId: string;
  adProofsRoot: string;
  stateRoot: string;
  transactionsRoot: string;
  timestamp: number;
  nBits: number;
  height: number;
  extensionHash: string;
  votes: string;
  powSolutions: {
    pk: string;
    w: string;
    n: string;
    d: string;
  };
}

// ============================================================================
// BigInt-Safe JSON Helpers (avoid IEEE-754 precision loss above 2^53 - 1 [M-1])
// ============================================================================

const RAW_BIGINT_MARKER = '__BIGINT_RAW__:';

function rawBigIntMarker(v: string | number | bigint): string {
  const s = typeof v === 'bigint' ? v.toString() : String(v);
  if (!/^\d+$/.test(s)) {
    throw new Error(`Invalid unsigned integer value: ${s}`);
  }
  return `${RAW_BIGINT_MARKER}${s}`;
}

function stringifyWithRawBigInts(obj: unknown): string {
  return JSON.stringify(obj).replace(/"__BIGINT_RAW__:(\d+)"/g, '$1');
}

function parseJsonPreservingLargeInts<T>(raw: string): T {
  return JSON.parse(raw, (key, value, context?: { source?: string }) => {
    if ((key === 'value' || key === 'amount') && typeof value === 'number' && context?.source) {
      return context.source;
    }
    return value;
  }) as T;
}

// ============================================================================
// Key & Address Utilities (ergo-lib-wasm-nodejs / sigma-rust)
// ============================================================================

export function generateRandomSecretKeyHex(): string {
  const sk = wasm.SecretKey.random_dlog();
  return bytesToHex(sk.to_bytes());
}

export function deriveKeyPairFromSecretHex(secretHex: string, networkPrefix: 0 | 16 = 16): {
  secretHex: string;
  pubKeyHex: string;
  p2pkErgoTreeHex: string;
  address: string;
} {
  const sk = wasm.SecretKey.dlog_from_bytes(hexToBytes(secretHex, 32));
  const addr = sk.get_address();
  const net = networkPrefix === 0 ? wasm.NetworkPrefix.Mainnet : wasm.NetworkPrefix.Testnet;
  const ergoTree = addr.to_ergo_tree();
  const p2pkErgoTreeHex = bytesToHex(ergoTree.sigma_serialize_bytes());
  if (!p2pkErgoTreeHex.startsWith('0008cd') || p2pkErgoTreeHex.length !== 72) {
    throw new Error(`Unexpected P2PK ErgoTree: ${p2pkErgoTreeHex}`);
  }
  return {
    secretHex: secretHex.toLowerCase(),
    pubKeyHex: p2pkErgoTreeHex.slice(6),
    p2pkErgoTreeHex,
    address: addr.to_base58(net),
  };
}

export function p2sAddressFromErgoTreeHex(ergoTreeHex: string, networkPrefix: 0 | 16 = 16): string {
  const tree = wasm.ErgoTree.from_base16_bytes(ergoTreeHex);
  const addr = wasm.Address.recreate_from_ergo_tree(tree);
  const net = networkPrefix === 0 ? wasm.NetworkPrefix.Mainnet : wasm.NetworkPrefix.Testnet;
  return addr.to_base58(net);
}

export function ergoTreeHexFromAddress(address: string): string {
  const addr = wasm.Address.from_base58(address);
  return bytesToHex(addr.to_ergo_tree().sigma_serialize_bytes());
}

/**
 * Construct an exact canonical ErgoBox via ErgoBoxCandidateBuilder (BigInt-safe via I64.from_str).
 */
export function makeSyntheticErgoBox(params: {
  txIdHex: string;
  index: number;
  value: bigint;
  ergoTreeHex: string;
  creationHeight: number;
  assets?: Array<{ tokenId: string; amount: bigint }>;
  additionalRegisters?: Record<string, string>;
}): ErgoBoxJson {
  const tree = wasm.ErgoTree.from_base16_bytes(params.ergoTreeHex);
  const builder = new wasm.ErgoBoxCandidateBuilder(
    wasm.BoxValue.from_i64(wasm.I64.from_str(params.value.toString())),
    wasm.Contract.new(tree),
    params.creationHeight,
  );
  for (const a of params.assets ?? []) {
    builder.add_token(
      wasm.TokenId.from_str(a.tokenId),
      wasm.TokenAmount.from_i64(wasm.I64.from_str(a.amount.toString())),
    );
  }
  const regMap: Record<string, number> = {
    R4: wasm.NonMandatoryRegisterId.R4,
    R5: wasm.NonMandatoryRegisterId.R5,
    R6: wasm.NonMandatoryRegisterId.R6,
    R7: wasm.NonMandatoryRegisterId.R7,
    R8: wasm.NonMandatoryRegisterId.R8,
    R9: wasm.NonMandatoryRegisterId.R9,
  };
  for (const [k, hex] of Object.entries(params.additionalRegisters ?? {})) {
    const regId = regMap[k];
    if (regId === undefined) throw new Error(`Unsupported register ${k}`);
    builder.set_register_value(regId, wasm.Constant.decode_from_base16(hex));
  }
  const builtCandidate = builder.build();
  const realBox = wasm.ErgoBox.from_box_candidate(
    builtCandidate,
    wasm.TxId.from_str(params.txIdHex),
    params.index,
  );
  return parseJsonPreservingLargeInts<ErgoBoxJson>(realBox.to_json());
}

/**
 * Convert an ErgoBoxJson into a wasm.ErgoBox without IEEE-754 Number precision loss (> 2^53).
 */
function boxJsonToWasmErgoBox(box: ErgoBoxJson): wasm.ErgoBox {
  const rawJson = stringifyWithRawBigInts({
    boxId: box.boxId,
    transactionId: box.transactionId,
    index: box.index,
    value: rawBigIntMarker(box.value),
    ergoTree: box.ergoTree,
    creationHeight: box.creationHeight,
    assets: (box.assets ?? []).map((a) => ({
      tokenId: a.tokenId,
      amount: rawBigIntMarker(a.amount),
    })),
    additionalRegisters: box.additionalRegisters ?? {},
  });
  return wasm.ErgoBox.from_json(rawJson);
}

export function serializeBoxJsonToHex(box: ErgoBoxJson): string {
  return bytesToHex(boxJsonToWasmErgoBox(box).sigma_serialize_bytes());
}

// ============================================================================
// State Context Builder (stock Ergo headers or synthetic height for offline/JVM)
// ============================================================================

export function buildStateContext(height: number, lastHeaders?: MinimalHeaderJson[]): wasm.ErgoStateContext {
  const rawHeaders: MinimalHeaderJson[] =
    lastHeaders && lastHeaders.length >= 10
      ? lastHeaders.slice(0, 10)
      : Array.from({ length: 10 }, (_, idx) => {
          const h = Math.max(1, height - idx);
          const idByte = ((h % 250) + 1).toString(16).padStart(2, '0');
          const parentByte = ((((h - 1) % 250) + 250) % 250 + 1).toString(16).padStart(2, '0');
          return {
            id: idByte.repeat(32),
            version: 3,
            parentId: parentByte.repeat(32),
            adProofsRoot: '00'.repeat(32),
            stateRoot: '00'.repeat(33),
            transactionsRoot: '00'.repeat(32),
            timestamp: 1_700_000_000_000 + h * 120_000,
            nBits: 117_440_512,
            height: h,
            extensionHash: '00'.repeat(32),
            votes: '000000',
            powSolutions: {
              pk: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
              w: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
              n: '0000000000000000',
              d: '0',
            },
          };
        });

  const blockHeaders = wasm.BlockHeaders.from_json(rawHeaders);
  const nextPreHeader =
    lastHeaders && lastHeaders.length >= 10
      ? wasm.PreHeader.from_block_header(
          wasm.BlockHeader.from_json(
            JSON.stringify({
              ...rawHeaders[0],
              height: Math.max(height, rawHeaders[0].height),
            }),
          ),
        )
      : wasm.PreHeader.from_block_header(blockHeaders.get(0));

  return new wasm.ErgoStateContext(
    nextPreHeader,
    blockHeaders,
    wasm.Parameters.default_parameters(),
  );
}

function buildWasmInputsAndTx(
  unsignedTx: UnsignedTxJson,
  inputBoxes: ErgoBoxJson[],
  dataBoxes: ErgoBoxJson[],
): {
  unsignedWasm: wasm.UnsignedTransaction;
  inBoxesWasm: wasm.ErgoBoxes;
  dataBoxesWasm: wasm.ErgoBoxes;
  inputBoxesBytesHex: string[];
  dataBoxesBytesHex: string[];
} {
  const inBoxesWasm = wasm.ErgoBoxes.empty();
  const inputBoxesBytesHex: string[] = [];
  for (const b of inputBoxes) {
    const wb = boxJsonToWasmErgoBox(b);
    inBoxesWasm.add(wb);
    inputBoxesBytesHex.push(bytesToHex(wb.sigma_serialize_bytes()));
  }

  const dataBoxesWasm = wasm.ErgoBoxes.empty();
  const dataBoxesBytesHex: string[] = [];
  for (const b of dataBoxes) {
    const wb = boxJsonToWasmErgoBox(b);
    dataBoxesWasm.add(wb);
    dataBoxesBytesHex.push(bytesToHex(wb.sigma_serialize_bytes()));
  }

  const rawTxJson = stringifyWithRawBigInts({
    inputs: unsignedTx.inputs,
    dataInputs: unsignedTx.dataInputs,
    outputs: unsignedTx.outputs.map((o) => ({
      value: rawBigIntMarker(o.value),
      ergoTree: o.ergoTree,
      creationHeight: o.creationHeight,
      assets: o.assets.map((a) => ({ tokenId: a.tokenId, amount: rawBigIntMarker(a.amount) })),
      additionalRegisters: o.additionalRegisters,
    })),
  });
  const unsignedWasm = wasm.UnsignedTransaction.from_json(rawTxJson);

  return {
    unsignedWasm,
    inBoxesWasm,
    dataBoxesWasm,
    inputBoxesBytesHex,
    dataBoxesBytesHex,
  };
}

// ============================================================================
// Standard Single/Multi-Key Signing via sigma-rust Wallet
// ============================================================================

export function signTransaction(params: {
  unsignedTx: UnsignedTxJson;
  inputBoxes: ErgoBoxJson[];
  dataBoxes?: ErgoBoxJson[];
  secretKeysHex: string[];
  height: number;
  lastHeaders?: MinimalHeaderJson[];
}): SignedTxResult {
  const dataBoxes = params.dataBoxes ?? [];
  const stateCtx = buildStateContext(params.height, params.lastHeaders);
  const { unsignedWasm, inBoxesWasm, dataBoxesWasm, inputBoxesBytesHex, dataBoxesBytesHex } =
    buildWasmInputsAndTx(params.unsignedTx, params.inputBoxes, dataBoxes);

  const secrets = new wasm.SecretKeys();
  for (const hex of params.secretKeysHex) {
    secrets.add(wasm.SecretKey.dlog_from_bytes(hexToBytes(hex, 32)));
  }
  const wallet = wasm.Wallet.from_secrets(secrets);
  const signed = wallet.sign_transaction(stateCtx, unsignedWasm, inBoxesWasm, dataBoxesWasm);
  const signedJson = parseJsonPreservingLargeInts<Record<string, unknown>>(signed.to_json());
  const txBytesHex = bytesToHex(signed.sigma_serialize_bytes());
  return {
    txId: signed.id().to_str(),
    signedTxJson: signedJson,
    txBytesHex,
    inputBoxesBytesHex,
    dataBoxesBytesHex,
  };
}

// ============================================================================
// Serializable Multi-Host Committee Ceremony Primitives ([H-4], [L-8])
// Each committee host holds ONLY its own secret key and private commitments.
// ONLY sanitized public JSON TransactionHintsBag strings (zero secret nonces,
// zero cmtWithSecret; Round 1 uses cmtReal only, Round 2 adds public proofReal)
// are exchanged across hosts.
// ============================================================================

interface RawHintsBagObj {
  secretHints: Record<string, Array<Record<string, unknown>>>;
  publicHints: Record<string, Array<Record<string, unknown>>>;
}

function hintsBagToObject(bag: wasm.TransactionHintsBag): RawHintsBagObj {
  const raw: unknown = bag.to_json();
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Unexpected TransactionHintsBag.to_json() output');
  }
  const obj = parsed as Record<string, unknown>;
  const secretHints =
    obj.secretHints && typeof obj.secretHints === 'object'
      ? (obj.secretHints as Record<string, Array<Record<string, unknown>>>)
      : {};
  const publicHints =
    obj.publicHints && typeof obj.publicHints === 'object'
      ? (obj.publicHints as Record<string, Array<Record<string, unknown>>>)
      : {};
  return { secretHints, publicHints };
}

function stripHintSecret(entry: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entry)) {
    if (k === 'secret') continue;
    cleaned[k] = v;
  }
  if (cleaned.hint === 'cmtWithSecret') {
    cleaned.hint = 'cmtReal';
  }
  return cleaned;
}

function serializeInputPrivateHints(bag: wasm.TransactionHintsBag, inputIndex: number): string {
  const key = String(inputIndex);
  const { secretHints, publicHints } = hintsBagToObject(bag);
  const out: RawHintsBagObj = {
    secretHints: secretHints[key] ? { [key]: secretHints[key] } : {},
    publicHints: publicHints[key] ? { [key]: publicHints[key] } : {},
  };
  return JSON.stringify(out);
}

const ALLOWED_PUBLIC_HINT_KINDS = new Set([
  'cmtReal',
  'cmtSimulated',
  'proofReal',
  'proofSimulated',
]);

function serializeInputPublicHints(bag: wasm.TransactionHintsBag, inputIndex: number): string {
  const key = String(inputIndex);
  const { secretHints, publicHints } = hintsBagToObject(bag);

  // In Ergo's TransactionHintsBag JSON schema:
  // - `secretHints[idx]` holds `proofReal` (public Schnorr (challenge, proof), NO secret key/nonce!)
  // - `publicHints[idx]` holds `cmtReal`, `cmtSimulated`, `proofSimulated`, AND `cmtWithSecret` (SECRET nonce!)
  // We allowlist ONLY public hint kinds and strip/drop `cmtWithSecret` & any `"secret"` property.
  const outSecret: Array<Record<string, unknown>> = [];
  const seenSecret = new Set<string>();
  for (const entry of secretHints[key] ?? []) {
    if (entry.hint === 'cmtWithSecret' || 'secret' in entry) continue;
    if (typeof entry.hint !== 'string' || !ALLOWED_PUBLIC_HINT_KINDS.has(entry.hint)) continue;
    const dedup = JSON.stringify(entry);
    if (!seenSecret.has(dedup)) {
      seenSecret.add(dedup);
      outSecret.push(entry);
    }
  }

  const outPublic: Array<Record<string, unknown>> = [];
  const seenPublic = new Set<string>();
  for (const entry of publicHints[key] ?? []) {
    const cleaned = entry.hint === 'cmtWithSecret' ? stripHintSecret(entry) : entry;
    if ('secret' in cleaned) continue;
    if (typeof cleaned.hint !== 'string' || !ALLOWED_PUBLIC_HINT_KINDS.has(cleaned.hint)) continue;
    const dedup = JSON.stringify(cleaned);
    if (!seenPublic.has(dedup)) {
      seenPublic.add(dedup);
      outPublic.push(cleaned);
    }
  }

  const publicJson = JSON.stringify({
    secretHints: outSecret.length > 0 ? { [key]: outSecret } : {},
    publicHints: outPublic.length > 0 ? { [key]: outPublic } : {},
  });
  if (publicJson.includes('cmtWithSecret') || publicJson.includes('"secret"')) {
    throw new Error('Refusing to emit public hints JSON containing secret Schnorr nonce material');
  }
  return publicJson;
}

function assertPublicHintsJsonClean(publicHintsJson: string): RawHintsBagObj {
  if (publicHintsJson.includes('cmtWithSecret') || publicHintsJson.includes('"secret"')) {
    throw new Error('Rejected peer public hints JSON containing secret Schnorr nonce material');
  }
  const parsed = JSON.parse(publicHintsJson) as Partial<RawHintsBagObj>;
  const secretHints = parsed.secretHints ?? {};
  const publicHints = parsed.publicHints ?? {};
  for (const bucket of [secretHints, publicHints]) {
    for (const entries of Object.values(bucket)) {
      for (const entry of entries ?? []) {
        if (
          !entry ||
          typeof entry.hint !== 'string' ||
          !ALLOWED_PUBLIC_HINT_KINDS.has(entry.hint) ||
          'secret' in entry
        ) {
          throw new Error(
            `Rejected peer hints JSON containing non-public hint kind: ${String(entry?.hint)}`,
          );
        }
      }
    }
  }
  return { secretHints, publicHints };
}

/**
 * Round 1 (runs independently on each participating committee signer host for
 * `inputIndex = 0`, and on the coordinator/fee-payer host for
 * `inputIndex = inputBoxes.length - 1`):
 * - `privateCommitmentsJson` MUST stay strictly local on this host.
 * - `publicCommitmentsJson` contains ONLY public commitments for `inputIndex`
 *   (`cmtReal`, zero `"secret"`, empty `secretHints`) and is safe to broadcast.
 */
export function committeeGenerateCommitmentsJson(params: {
  unsignedTx: UnsignedTxJson;
  inputBoxes: ErgoBoxJson[];
  dataBoxes?: ErgoBoxJson[];
  memberSecretHex: string;
  inputIndex?: number;
  height: number;
  lastHeaders?: MinimalHeaderJson[];
}): { pubKeyHex: string; privateCommitmentsJson: string; publicCommitmentsJson: string } {
  const inputIndex = params.inputIndex ?? 0;
  if (!Number.isInteger(inputIndex) || inputIndex < 0 || inputIndex >= params.inputBoxes.length) {
    throw new Error(`Invalid commitment inputIndex ${inputIndex}`);
  }
  const stateCtx = buildStateContext(params.height, params.lastHeaders);
  const { unsignedWasm, inBoxesWasm, dataBoxesWasm } = buildWasmInputsAndTx(
    params.unsignedTx,
    params.inputBoxes,
    params.dataBoxes ?? [],
  );
  const sks = new wasm.SecretKeys();
  sks.add(wasm.SecretKey.dlog_from_bytes(hexToBytes(params.memberSecretHex, 32)));
  const wallet = wasm.Wallet.from_secrets(sks);
  const bag = wallet.generate_commitments(stateCtx, unsignedWasm, inBoxesWasm, dataBoxesWasm);
  return {
    pubKeyHex: deriveKeyPairFromSecretHex(params.memberSecretHex).pubKeyHex,
    privateCommitmentsJson: serializeInputPrivateHints(bag, inputIndex),
    publicCommitmentsJson: serializeInputPublicHints(bag, inputIndex),
  };
}

/**
 * Round 2 (runs sequentially across the `threshold` committee signer hosts):
 * Combines this host's local `ownPrivateCommitmentsJson` (input 0) with peers'
 * public commitments (input 0), the coordinator's public fee commitment
 * (`feeInputIdx`), and prior signers' extracted public hints (input 0),
 * produces this host's partial Schnorr share, and returns ONLY sanitized public
 * hints JSON for input 0.
 *
 * For `atLeast(t, n)`, pass `simulatedPubKeysHex` (the `n - t` non-participating
 * pubkeys) to the FIRST signer so its simulated threshold polynomial is locked
 * into its extracted public hints, and pass `[]` to subsequent signers.
 */
export function committeePartialSignAndExtractHintsJson(params: {
  unsignedTx: UnsignedTxJson;
  inputBoxes: ErgoBoxJson[];
  dataBoxes?: ErgoBoxJson[];
  memberSecretHex: string;
  ownPrivateCommitmentsJson: string;
  publicHintsJsonList: string[];
  simulatedPubKeysHex: string[];
  height: number;
  lastHeaders?: MinimalHeaderJson[];
}): string {
  const stateCtx = buildStateContext(params.height, params.lastHeaders);
  const { unsignedWasm, inBoxesWasm, dataBoxesWasm } = buildWasmInputsAndTx(
    params.unsignedTx,
    params.inputBoxes,
    params.dataBoxes ?? [],
  );
  const sks = new wasm.SecretKeys();
  sks.add(wasm.SecretKey.dlog_from_bytes(hexToBytes(params.memberSecretHex, 32)));
  const wallet = wasm.Wallet.from_secrets(sks);
  const pubKeyHex = deriveKeyPairFromSecretHex(params.memberSecretHex).pubKeyHex;

  const merged = wasm.TransactionHintsBag.empty();
  const ownBag = wasm.TransactionHintsBag.from_json(params.ownPrivateCommitmentsJson);
  merged.add_hints_for_input(0, ownBag.all_hints_for_input(0));
  for (const pubJson of params.publicHintsJsonList) {
    const parsed = assertPublicHintsJsonClean(pubJson);
    const peerBag = wasm.TransactionHintsBag.from_json(pubJson);
    const inputKeys = new Set([
      ...Object.keys(parsed.publicHints),
      ...Object.keys(parsed.secretHints),
    ]);
    for (const idxKey of inputKeys) {
      const idx = Number(idxKey);
      if (Number.isInteger(idx) && idx >= 0 && idx < params.inputBoxes.length) {
        merged.add_hints_for_input(idx, peerBag.all_hints_for_input(idx));
      }
    }
  }

  const partialTx = wallet.sign_transaction_multi(
    stateCtx,
    unsignedWasm,
    inBoxesWasm,
    dataBoxesWasm,
    merged,
  );
  const realProps = new wasm.Propositions();
  realProps.add_proposition_from_byte(hexToBytes(`cd${pubKeyHex.toLowerCase()}`, 34));
  const simProps = new wasm.Propositions();
  for (const pk of params.simulatedPubKeysHex) {
    simProps.add_proposition_from_byte(hexToBytes(`cd${pk.toLowerCase()}`, 34));
  }
  const extracted = wasm.extract_hints(
    partialTx,
    stateCtx,
    inBoxesWasm,
    dataBoxesWasm,
    realProps,
    simProps,
  );
  return serializeInputPublicHints(extracted, 0);
}

/**
 * Round 3 (runs on the coordinator / fee-payer host):
 * Combines ONLY public hints JSON strings collected from the committee hosts
 * for input 0 (Round-1 public commitments + Round-2 extracted public hints)
 * and signs the fee input (`inputBoxes.length - 1`) without ever touching any
 * committee secret.
 */
export function finalizeDistributedCommitteeTx(params: {
  unsignedTx: UnsignedTxJson;
  inputBoxes: ErgoBoxJson[];
  dataBoxes?: ErgoBoxJson[];
  publicHintsJsonList: string[];
  feePayerSecretHex: string;
  feePrivateCommitmentsJson?: string;
  height: number;
  lastHeaders?: MinimalHeaderJson[];
}): SignedTxResult {
  const dataBoxes = params.dataBoxes ?? [];
  const stateCtx = buildStateContext(params.height, params.lastHeaders);
  const { unsignedWasm, inBoxesWasm, dataBoxesWasm, inputBoxesBytesHex, dataBoxesBytesHex } =
    buildWasmInputsAndTx(params.unsignedTx, params.inputBoxes, dataBoxes);

  const merged = wasm.TransactionHintsBag.empty();
  for (const pubJson of params.publicHintsJsonList) {
    assertPublicHintsJsonClean(pubJson);
    const bag = wasm.TransactionHintsBag.from_json(pubJson);
    merged.add_hints_for_input(0, bag.all_hints_for_input(0));
  }

  const feeInputIdx = params.inputBoxes.length - 1;
  const feeWalletSecrets = new wasm.SecretKeys();
  feeWalletSecrets.add(wasm.SecretKey.dlog_from_bytes(hexToBytes(params.feePayerSecretHex, 32)));
  const feeWallet = wasm.Wallet.from_secrets(feeWalletSecrets);
  if (feeInputIdx > 0) {
    if (params.feePrivateCommitmentsJson) {
      const feeBag = wasm.TransactionHintsBag.from_json(params.feePrivateCommitmentsJson);
      merged.add_hints_for_input(feeInputIdx, feeBag.all_hints_for_input(feeInputIdx));
    } else {
      const feeBag = feeWallet.generate_commitments(
        stateCtx,
        unsignedWasm,
        inBoxesWasm,
        dataBoxesWasm,
      );
      merged.add_hints_for_input(feeInputIdx, feeBag.all_hints_for_input(feeInputIdx));
    }
  }

  const finalTx = feeWallet.sign_transaction_multi(
    stateCtx,
    unsignedWasm,
    inBoxesWasm,
    dataBoxesWasm,
    merged,
  );
  return {
    txId: finalTx.id().to_str(),
    signedTxJson: parseJsonPreservingLargeInts<Record<string, unknown>>(finalTx.to_json()),
    txBytesHex: bytesToHex(finalTx.sigma_serialize_bytes()),
    inputBoxesBytesHex,
    dataBoxesBytesHex,
  };
}

// ============================================================================
// True Distributed Multi-Party Signing for `atLeast(t, n)` Committee Ceremony
// Fixed for [H-4]:
//   - Requires/selects EXACTLY `threshold` distinct committee members (never
//     crashes if caller supplies > threshold secrets!)
//   - Merges feePayer commitments ONLY onto the fee input index, never input 0
//     (never crashes if feePayer happens to be a simulated committee key!)
// ============================================================================

export function signTransactionDistributedCommittee(params: {
  unsignedTx: UnsignedTxJson;
  inputBoxes: ErgoBoxJson[];
  dataBoxes?: ErgoBoxJson[];
  committeeMemberSecretsHex: string[];
  allCommitteePubKeysHex: string[];
  threshold?: number;
  feePayerSecretHex: string;
  height: number;
  lastHeaders?: MinimalHeaderJson[];
}): SignedTxResult {
  const committeeSet = new Set(params.allCommitteePubKeysHex.map((pk) => pk.toLowerCase()));
  // Deduplicate and retain ONLY valid committee members
  const uniqueMembers: Array<{
    secretHex: string;
    pubKeyHex: string;
    wallet: wasm.Wallet;
  }> = [];
  const seenPubKeys = new Set<string>();
  for (const sec of params.committeeMemberSecretsHex) {
    const pubKeyHex = deriveKeyPairFromSecretHex(sec).pubKeyHex.toLowerCase();
    if (!committeeSet.has(pubKeyHex) || seenPubKeys.has(pubKeyHex)) continue;
    seenPubKeys.add(pubKeyHex);
    const sks = new wasm.SecretKeys();
    sks.add(wasm.SecretKey.dlog_from_bytes(hexToBytes(sec, 32)));
    uniqueMembers.push({
      secretHex: sec,
      pubKeyHex,
      wallet: wasm.Wallet.from_secrets(sks),
    });
  }

  const effectiveThreshold = params.threshold ?? uniqueMembers.length;
  if (effectiveThreshold < 1 || effectiveThreshold > params.allCommitteePubKeysHex.length) {
    throw new Error(`Invalid committee threshold ${effectiveThreshold}`);
  }
  if (uniqueMembers.length < effectiveThreshold) {
    throw new Error(
      `Insufficient distinct committee signers: have ${uniqueMembers.length}, need ${effectiveThreshold}`,
    );
  }
  // CTHRESHOLD(t, n) requires EXACTLY t real signers and (n - t) simulated branches!
  const activeMembers = uniqueMembers.slice(0, effectiveThreshold);

  const dataBoxes = params.dataBoxes ?? [];
  const stateCtx = buildStateContext(params.height, params.lastHeaders);
  const { unsignedWasm, inBoxesWasm, dataBoxesWasm, inputBoxesBytesHex, dataBoxesBytesHex } =
    buildWasmInputsAndTx(params.unsignedTx, params.inputBoxes, dataBoxes);

  // Round 1: each active committee member generates public commitments for input 0 (tracker)
  const mergedHints = wasm.TransactionHintsBag.empty();
  for (const member of activeMembers) {
    const bag = member.wallet.generate_commitments(
      stateCtx,
      unsignedWasm,
      inBoxesWasm,
      dataBoxesWasm,
    );
    mergedHints.add_hints_for_input(0, bag.all_hints_for_input(0));
  }

  // Fee payer commitments apply ONLY to the fee input index (never input 0!)
  const feeInputIdx = params.inputBoxes.length - 1;
  const feeWalletSecrets = new wasm.SecretKeys();
  feeWalletSecrets.add(wasm.SecretKey.dlog_from_bytes(hexToBytes(params.feePayerSecretHex, 32)));
  const feeWallet = wasm.Wallet.from_secrets(feeWalletSecrets);
  if (feeInputIdx > 0) {
    const feeBag = feeWallet.generate_commitments(
      stateCtx,
      unsignedWasm,
      inBoxesWasm,
      dataBoxesWasm,
    );
    mergedHints.add_hints_for_input(feeInputIdx, feeBag.all_hints_for_input(feeInputIdx));
  }

  // Round 2: active committee members produce partial proofs and extract ONLY public hints for input 0
  const participatingPubKeys = new Set(activeMembers.map((m) => m.pubKeyHex));
  const simulatedPubKeys = params.allCommitteePubKeysHex
    .map((pk) => pk.toLowerCase())
    .filter((pk) => !participatingPubKeys.has(pk));

  const simulatedProps = new wasm.Propositions();
  for (const pk of simulatedPubKeys) {
    simulatedProps.add_proposition_from_byte(hexToBytes(`cd${pk}`, 34));
  }

  for (let mIdx = 0; mIdx < activeMembers.length; mIdx++) {
    const member = activeMembers[mIdx];
    const partialTx = member.wallet.sign_transaction_multi(
      stateCtx,
      unsignedWasm,
      inBoxesWasm,
      dataBoxesWasm,
      mergedHints,
    );
    const realProps = new wasm.Propositions();
    realProps.add_proposition_from_byte(hexToBytes(`cd${member.pubKeyHex}`, 34));
    const extracted = wasm.extract_hints(
      partialTx,
      stateCtx,
      inBoxesWasm,
      dataBoxesWasm,
      realProps,
      mIdx === 0 ? simulatedProps : new wasm.Propositions(),
    );
    mergedHints.add_hints_for_input(0, extracted.all_hints_for_input(0));
  }

  // Final round: feeWallet signs the fee input while preserving the completed tracker proof on input 0
  const finalTx = feeWallet.sign_transaction_multi(
    stateCtx,
    unsignedWasm,
    inBoxesWasm,
    dataBoxesWasm,
    mergedHints,
  );
  return {
    txId: finalTx.id().to_str(),
    signedTxJson: parseJsonPreservingLargeInts<Record<string, unknown>>(finalTx.to_json()),
    txBytesHex: bytesToHex(finalTx.sigma_serialize_bytes()),
    inputBoxesBytesHex,
    dataBoxesBytesHex,
  };
}
