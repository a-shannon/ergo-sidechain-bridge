import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Interface, Transaction } from 'ethers';
import blakejs from 'blakejs';
import { assertNoDuplicateJsonKeys, canonicalJson } from '../ergo-settlement-core/strict-json.js';

const PRIMARY = 'http://127.0.0.1:19955';
const WITNESS = 'http://127.0.0.1:19956';
const ATTEMPT_FILE = 'native-reservation-attempt.json';
const MAX_RESPONSE_BYTES = 34 * 1024 * 1024;
const attempts = new WeakMap<object, {
  directory: string; bytes: string; submitted: boolean; accepted: boolean; sealed: boolean; blockHash?: string;
}>();

export interface FederatedNativeReservationAttemptV1 {
  readonly genesisHashHex: string;
  readonly extrinsicHashHex: string;
  readonly signedExtrinsicHex: string;
}

type ReservationObservation = Parameters<typeof observeFederatedNativeReservationInclusionV1>[0];
export interface FederatedNativeMintContextV1 {
  readonly reservation: Readonly<ReservationObservation>;
  readonly bridgeAddressHex: string;
  readonly tokenAddressHex: string;
  readonly recipientAddressHex: string;
  readonly amountNanoErg: string;
  readonly mintIdentityHex: string;
  readonly bridgeCodeSha256Hex: string;
  readonly bridgeCodeBytes: number;
  readonly tokenCodeSha256Hex: string;
  readonly tokenCodeBytes: number;
}
interface MintAttempt {
  readonly transactionHashHex: string;
  readonly signedTransactionHex: string;
  readonly nativeExtrinsicHex: string;
}
const MINT_FILE = 'native-mint-attempt.json';
const mintAttempts = new WeakMap<object, { directory: string; bytes: string; context: Readonly<FederatedNativeMintContextV1>;
  submitted: boolean; accepted: boolean; sealed: boolean; blockHash?: string; ethereumBlockHash?: string }>();
const applicationAbi = new Interface([
  'function mintSERG(address,uint256,bytes32)', 'function owner() view returns(address)',
  'function sergToken() view returns(address)', 'function paused() view returns(bool)',
  'function totalSupply() view returns(uint256)', 'function balanceOf(address) view returns(uint256)',
  'function processedPegIns(bytes32) view returns(bool)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
  'event PegIn(address indexed to,uint256 amount,bytes32 ergoBoxId)',
]);

/** A fresh parent observation, not a transferable mint authorization. */
export async function observeFederatedNativeMintParentV1(input: Readonly<FederatedNativeMintContextV1>, assertCurrent: () => void) {
  const context = captureMintContext(input);
  await observeFederatedNativeReservationInclusionV1(context.reservation, assertCurrent);
  await checkMintParent(context, assertCurrent);
  return Object.freeze({ nonce: 1 as const });
}

/** Keep Ethereum and native attempt identities separate; neither journal grants authority. */
export function reserveFederatedNativeMintAttemptV1(directory: string, input: Readonly<FederatedNativeMintContextV1>,
  signed: Readonly<MintAttempt>): Readonly<MintAttempt> {
  const context = captureMintContext(input);
  exact(signed, ['transactionHashHex', 'signedTransactionHex', 'nativeExtrinsicHex']);
  hash(signed.transactionHashHex);
  if (typeof signed.signedTransactionHex !== 'string' || !/^0x(?:[0-9a-f]{2}){100,1024}$/.test(signed.signedTransactionHex)
    || typeof signed.nativeExtrinsicHex !== 'string' || !/^0x(?:[0-9a-f]{2}){100,2048}$/.test(signed.nativeExtrinsicHex)) {
    throw new Error('native mint transaction encoding is malformed');
  }
  const tx = Transaction.from(signed.signedTransactionHex);
  if (tx.serialized !== signed.signedTransactionHex || tx.hash !== signed.transactionHashHex
    || tx.type !== 0 || tx.chainId !== 4242n || tx.nonce !== 1 || tx.value !== 0n
    || tx.gasPrice !== 1_000_000_000n || tx.gasLimit !== 5_000_000n
    || tx.from?.toLowerCase() !== context.recipientAddressHex || tx.to?.toLowerCase() !== context.bridgeAddressHex
    || tx.data !== applicationAbi.encodeFunctionData('mintSERG', [context.recipientAddressHex, context.amountNanoErg, context.mintIdentityHex])) {
    throw new Error('native mint bytes differ from the reserved application');
  }
  if (typeof directory !== 'string' || !isAbsolute(directory) || !lstatSync(directory).isDirectory()
    || lstatSync(directory).isSymbolicLink() || resolve(realpathSync(directory)) !== resolve(directory)) {
    throw new Error('native mint requires a direct existing attempt directory');
  }
  const attempt = Object.freeze({ ...signed });
  const bytes = JSON.stringify({ schema: 'e2s.fed-native-mint-attempt.v1', status: 'reserved',
    parentBlockHashHex: context.reservation.blockHashHex, mintIdentityHex: context.mintIdentityHex, ...attempt });
  const fd = openSync(join(directory, MINT_FILE), 'wx');
  try { writeFileSync(fd, bytes, 'utf8'); fsyncSync(fd); } finally { closeSync(fd); }
  mintAttempts.set(attempt, { directory, bytes, context, submitted: false, accepted: false, sealed: false });
  assertMintAttempt(attempt);
  return attempt;
}

export async function submitFederatedNativeMintV1(attempt: Readonly<MintAttempt>, authorize: () => void): Promise<void> {
  const state = assertMintAttempt(attempt);
  if (state.submitted || typeof authorize !== 'function') throw new Error('native mint submission is consumed or unauthorized');
  state.submitted = true;
  await observeFederatedNativeMintParentV1(state.context, authorize);
  authorize(); assertMintAttempt(attempt);
  if (await rpc(PRIMARY, 'eth_sendRawTransaction', [attempt.signedTransactionHex]) !== attempt.transactionHashHex) {
    throw new Error('native mint submission is ambiguous; attempt remains held');
  }
  state.accepted = true;
}

export async function sealFederatedNativeMintV1(attempt: Readonly<MintAttempt>, authorize: () => void): Promise<string> {
  const state = assertMintAttempt(attempt);
  if (!state.accepted || state.sealed || typeof authorize !== 'function') throw new Error('native mint sealing is not available');
  state.sealed = true;
  await checkMintParent(state.context, authorize, attempt.nativeExtrinsicHex);
  authorize(); assertMintAttempt(attempt);
  const result = record(await rpc(PRIMARY, 'engine_createBlock', [false, false, state.context.reservation.blockHashHex]));
  hash(result.hash);
  if ([state.context.reservation.blockHashHex, state.context.reservation.attempt.genesisHashHex].includes(result.hash)) {
    throw new Error('native mint seal returned a predecessor');
  }
  state.blockHash = result.hash;
  return result.hash;
}

/** Check both execution views and token deltas. The app separately binds the exact consumed V4 record. */
export async function observeFederatedNativeMintInclusionV1(attempt: Readonly<MintAttempt>, assertCurrent: () => void) {
  const state = assertMintAttempt(attempt);
  if (!state.sealed || !state.blockHash || typeof assertCurrent !== 'function') throw new Error('native mint was not sealed');
  let agreed: string | undefined, agreedEthereum: string | undefined;
  for (const url of [PRIMARY, WITNESS]) {
    for (let probe = 0; ; probe++) {
      assertCurrent(); assertMintAttempt(attempt);
      const found = await rpc(url, 'chain_getBlockHash', [2]);
      if (found === state.blockHash) break;
      if (url !== WITNESS || found !== null || probe === 19) throw new Error('native mint child block is absent or divergent');
      await new Promise(resolveWait => setTimeout(resolveWait, 100));
    }
    const block = record(record(await rpc(url, 'chain_getBlock', [state.blockHash])).block);
    const header = record(block.header);
    exact(header, ['parentHash', 'number', 'stateRoot', 'extrinsicsRoot', 'digest']);
    hash(header.stateRoot); hash(header.extrinsicsRoot); exact(header.digest, ['logs']);
    const logs = record(header.digest).logs;
    if (header.parentHash !== state.context.reservation.blockHashHex || header.number !== '0x2'
      || !Array.isArray(logs) || logs.length > 32 || logs.some(log => typeof log !== 'string' || !/^0x(?:[0-9a-f]{2}){1,16384}$/.test(log))
      || !Array.isArray(block.extrinsics) || block.extrinsics.length !== 2
      || !isTimestampInherent(block.extrinsics[0]) || block.extrinsics[1] !== attempt.nativeExtrinsicHex) {
      throw new Error('native mint block differs from the exact child call');
    }
    const encoded = canonicalJson({ header, extrinsics: block.extrinsics });
    if (agreed !== undefined && agreed !== encoded) throw new Error('native mint nodes disagree on child block');
    agreed = encoded;
    let ethereum: Record<string, unknown>;
    for (let probe = 0; ; probe++) {
      assertCurrent(); assertMintAttempt(attempt);
      const found = await rpc(url, 'eth_getBlockByNumber', ['0x2', false]);
      if (found !== null) { ethereum = record(found); break; }
      if (probe === 19) throw new Error('native mint Ethereum indexing is absent');
      await new Promise(resolveWait => setTimeout(resolveWait, 100));
    }
    hash(ethereum.hash);
    if (ethereum.number !== '0x2' || !Array.isArray(ethereum.transactions)
      || ethereum.transactions.length !== 1 || ethereum.transactions[0] !== attempt.transactionHashHex
      || agreedEthereum !== undefined && agreedEthereum !== ethereum.hash) throw new Error('native mint Ethereum inclusion disagrees');
    agreedEthereum = ethereum.hash;
    await waitForEthereumHash(url, ethereum.hash, '0x2', [attempt.transactionHashHex], assertCurrent);
    const receipt = record(await waitForIndexedResult(url, 'eth_getTransactionReceipt', [attempt.transactionHashHex], assertCurrent));
    const { context } = state;
    if (receipt.transactionHash !== attempt.transactionHashHex || receipt.blockHash !== ethereum.hash || receipt.blockNumber !== '0x2'
      || receipt.transactionIndex !== '0x0' || receipt.status !== '0x1' || receipt.from !== context.recipientAddressHex
      || receipt.to !== context.bridgeAddressHex || !Array.isArray(receipt.logs) || receipt.logs.length !== 2) {
      throw new Error('native mint receipt differs from the signed call');
    }
    const expectedLogs = [
      { address: context.tokenAddressHex, ...applicationAbi.encodeEventLog(applicationAbi.getEvent('Transfer')!,
        [`0x${'00'.repeat(20)}`, context.recipientAddressHex, context.amountNanoErg]) },
      { address: context.bridgeAddressHex, ...applicationAbi.encodeEventLog(applicationAbi.getEvent('PegIn')!,
        [context.recipientAddressHex, context.amountNanoErg, context.mintIdentityHex]) },
    ];
    for (const [index, expected] of expectedLogs.entries()) {
      const log = record(receipt.logs[index]);
      if (log.address !== expected.address || log.data !== expected.data || canonicalJson(log.topics) !== canonicalJson(expected.topics)
        || log.blockHash !== ethereum.hash || log.blockNumber !== '0x2' || log.transactionHash !== attempt.transactionHashHex
        || log.transactionIndex !== '0x0' || log.logIndex !== `0x${index}` || log.removed !== false) {
        throw new Error('native mint event differs from the reserved identity or amount');
      }
    }
    await checkApplication(url, state.context, ethereum.hash, true, assertCurrent);
  }
  await checkMintHead(attempt, assertCurrent);
  state.ethereumBlockHash = agreedEthereum!;
  return Object.freeze({ blockHashHex: state.blockHash, ethereumBlockHashHex: agreedEthereum!, blockHeight: 2 as const,
    transactionHashHex: attempt.transactionHashHex, transactionIndex: 0 as const, eventIndex: 1 as const });
}

export async function observeFederatedNativeMintStateV1(attempt: Readonly<MintAttempt>, expectedStorage: Readonly<Record<string, string | null>>,
  assertCurrent: () => void): Promise<void> {
  const state = assertMintAttempt(attempt);
  if (!state.ethereumBlockHash || typeof assertCurrent !== 'function') throw new Error('native mint inclusion has not been observed');
  const storage = captureStorage(expectedStorage);
  for (const url of [PRIMARY, WITNESS]) for (const [key, expected] of Object.entries(storage)) {
    assertCurrent(); assertMintAttempt(attempt);
    if (await rpc(url, 'state_getStorage', [key, state.blockHash]) !== expected) throw new Error('native mint terminal reservation state differs');
  }
  await checkMintHead(attempt, assertCurrent);
}

function captureMintContext(input: Readonly<FederatedNativeMintContextV1>): Readonly<FederatedNativeMintContextV1> {
  exact(input, ['reservation', 'bridgeAddressHex', 'tokenAddressHex', 'recipientAddressHex', 'amountNanoErg', 'mintIdentityHex',
    'bridgeCodeSha256Hex', 'bridgeCodeBytes', 'tokenCodeSha256Hex', 'tokenCodeBytes']);
  exact(input.reservation, ['attempt', 'blockHashHex', 'expectedStorage', 'operatorStorageKeyHex', 'originalOperatorAccountHex']);
  const reservation = Object.freeze({ ...input.reservation, expectedStorage: captureStorage(input.reservation.expectedStorage) });
  const state = assertAttempt(reservation.attempt);
  if (!state.sealed || state.blockHash !== reservation.blockHashHex) throw new Error('native mint parent reservation is not original');
  const addresses = [input.bridgeAddressHex, input.tokenAddressHex, input.recipientAddressHex];
  if (new Set(addresses).size !== 3 || addresses.some(value => typeof value !== 'string' || !/^0x[0-9a-f]{40}$/.test(value) || /^0x0+$/.test(value))
    || typeof input.amountNanoErg !== 'string' || !/^[1-9][0-9]{0,18}$/.test(input.amountNanoErg)
    || BigInt(input.amountNanoErg) > 0x7fff_ffff_ffff_ffffn
    || [input.bridgeCodeBytes, input.tokenCodeBytes].some(value => !Number.isSafeInteger(value) || value < 1 || value > 24576)
    || [input.bridgeCodeSha256Hex, input.tokenCodeSha256Hex].some(value => typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value))) {
    throw new Error('native mint application scope is malformed');
  }
  hash(input.mintIdentityHex);
  return Object.freeze({ ...input, reservation });
}

async function checkMintParent(context: Readonly<FederatedNativeMintContextV1>, assertCurrent: () => void, poolExtrinsic?: string) {
  let agreed: string | undefined;
  for (const url of [PRIMARY, WITNESS]) {
    assertCurrent(); assertAttempt(context.reservation.attempt);
    const block = record(await rpc(url, 'eth_getBlockByNumber', ['0x1', false])); hash(block.hash);
    if (block.number !== '0x1' || !Array.isArray(block.transactions) || block.transactions.length !== 0
      || agreed !== undefined && agreed !== block.hash) throw new Error('native mint Ethereum parent differs');
    agreed = block.hash;
    await waitForEthereumHash(url, block.hash, '0x1', [], assertCurrent);
    await checkApplication(url, context, block.hash, false, assertCurrent);
    for (const [key, expected] of Object.entries(context.reservation.expectedStorage)) {
      assertCurrent();
      if (await rpc(url, 'state_getStorage', [key, context.reservation.blockHashHex]) !== expected) throw new Error('native mint pending parent differs');
    }
    const account = await rpc(url, 'state_getStorage', [context.reservation.operatorStorageKeyHex, context.reservation.blockHashHex]);
    if (typeof account !== 'string' || !/^0x[0-9a-f]{160}$/.test(account) || Buffer.from(account.slice(2), 'hex').readUInt32LE() !== 1) {
      throw new Error('native mint parent native nonce differs');
    }
  }
  for (const url of [PRIMARY, WITNESS]) {
    assertCurrent(); assertAttempt(context.reservation.attempt);
    const pool = await rpc(url, 'author_pendingExtrinsics', []);
    if (!Array.isArray(pool) || (!poolExtrinsic && pool.length !== 0) || poolExtrinsic && (pool.length > 1
      || url === PRIMARY && pool.length !== 1 || pool.some(value => value !== poolExtrinsic))
      || await rpc(url, 'chain_getBlockHash', [0]) !== context.reservation.attempt.genesisHashHex
      || await rpc(url, 'chain_getBlockHash', [1]) !== context.reservation.blockHashHex
      || await rpc(url, 'chain_getBlockHash', []) !== context.reservation.blockHashHex) throw new Error('native mint parent or pool changed');
  }
  assertCurrent();
}

async function checkApplication(url: string, context: Readonly<FederatedNativeMintContextV1>, blockHash: string,
  minted: boolean, assertCurrent: () => void) {
  const block = { blockHash, requireCanonical: true };
  assertCurrent();
  if (await rpc(url, 'eth_chainId', []) !== '0x1092'
    || await rpc(url, 'eth_getTransactionCount', [context.recipientAddressHex, block]) !== (minted ? '0x2' : '0x1')) {
    throw new Error('native mint EVM chain or nonce differs');
  }
  for (const [address, digest, length] of [[context.bridgeAddressHex, context.bridgeCodeSha256Hex, context.bridgeCodeBytes],
    [context.tokenAddressHex, context.tokenCodeSha256Hex, context.tokenCodeBytes]] as const) {
    assertCurrent();
    const code = await rpc(url, 'eth_getCode', [address, block]);
    if (typeof code !== 'string' || !/^0x(?:[0-9a-f]{2})+$/.test(code) || (code.length - 2) / 2 !== length
      || createHash('sha256').update(Buffer.from(code.slice(2), 'hex')).digest('hex') !== digest) throw new Error('native mint application code differs');
  }
  const amount = minted ? BigInt(context.amountNanoErg) : 0n;
  for (const [address, method, args, expected] of [
    [context.bridgeAddressHex, 'owner', [], context.recipientAddressHex],
    [context.bridgeAddressHex, 'sergToken', [], context.tokenAddressHex],
    [context.bridgeAddressHex, 'paused', [], false],
    [context.tokenAddressHex, 'owner', [], context.bridgeAddressHex],
    [context.tokenAddressHex, 'totalSupply', [], amount],
    [context.tokenAddressHex, 'balanceOf', [context.recipientAddressHex], amount],
    [context.bridgeAddressHex, 'processedPegIns', [context.mintIdentityHex], minted],
  ] as const) {
    assertCurrent();
    const result = await rpc(url, 'eth_call', [{ to: address, data: applicationAbi.encodeFunctionData(method, args) }, block]);
    if (result !== applicationAbi.encodeFunctionResult(method, [expected])) throw new Error('native mint application state differs');
  }
  assertCurrent();
}

async function checkMintHead(attempt: Readonly<MintAttempt>, assertCurrent: () => void) {
  const state = assertMintAttempt(attempt);
  for (const url of [PRIMARY, WITNESS]) {
    assertCurrent(); assertMintAttempt(attempt);
    const pool = await rpc(url, 'author_pendingExtrinsics', []);
    const account = await rpc(url, 'state_getStorage', [state.context.reservation.operatorStorageKeyHex, state.blockHash]);
    if (!Array.isArray(pool) || pool.length !== 0 || typeof account !== 'string' || !/^0x[0-9a-f]{160}$/.test(account)
      || Buffer.from(account.slice(2), 'hex').readUInt32LE() !== 2
      || await rpc(url, 'chain_getBlockHash', [0]) !== state.context.reservation.attempt.genesisHashHex
      || await rpc(url, 'chain_getBlockHash', [1]) !== state.context.reservation.blockHashHex
      || await rpc(url, 'chain_getBlockHash', [2]) !== state.blockHash
      || await rpc(url, 'chain_getBlockHash', []) !== state.blockHash) throw new Error('native mint target changed during observation');
  }
  assertCurrent(); assertMintAttempt(attempt);
}

function assertMintAttempt(attempt: Readonly<MintAttempt>) {
  const state = mintAttempts.get(attempt);
  if (!state) throw new Error('native mint attempt is not original');
  assertAttempt(state.context.reservation.attempt);
  const path = join(state.directory, MINT_FILE), stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== Buffer.byteLength(state.bytes)
    || resolve(realpathSync(state.directory)) !== resolve(state.directory)
    || readFileSync(path, 'utf8') !== state.bytes) throw new Error('native mint durable hold changed');
  return state;
}

/** An exclusive durable hold, never authorization to submit or mint. No restart replay. */
export function reserveFederatedNativeReservationAttemptV1(
  directory: string, candidate: Readonly<FederatedNativeReservationAttemptV1>,
): Readonly<FederatedNativeReservationAttemptV1> {
  exact(candidate, ['genesisHashHex', 'extrinsicHashHex', 'signedExtrinsicHex']);
  const { genesisHashHex, extrinsicHashHex, signedExtrinsicHex } = candidate;
  hash(genesisHashHex); hash(extrinsicHashHex);
  if (typeof signedExtrinsicHex !== 'string' || !/^0x(?:[0-9a-f]{2}){100,70000}$/.test(signedExtrinsicHex)
    || `0x${Buffer.from(blakejs.blake2b(Buffer.from(signedExtrinsicHex.slice(2), 'hex'), undefined, 32)).toString('hex')}` !== extrinsicHashHex) {
    throw new Error('native reservation attempt has different extrinsic bytes');
  }
  if (typeof directory !== 'string' || !isAbsolute(directory) || !lstatSync(directory).isDirectory()
    || lstatSync(directory).isSymbolicLink() || resolve(realpathSync(directory)) !== resolve(directory)) {
    throw new Error('native reservation requires a direct existing attempt directory');
  }
  const attempt = Object.freeze({ genesisHashHex, extrinsicHashHex, signedExtrinsicHex });
  const bytes = JSON.stringify({ schema: 'e2s.fed-native-reservation-attempt.v1', status: 'reserved', ...attempt });
  const fd = openSync(join(directory, ATTEMPT_FILE), 'wx');
  try { writeFileSync(fd, bytes, 'utf8'); fsyncSync(fd); } finally { closeSync(fd); }
  attempts.set(attempt, { directory, bytes, submitted: false, accepted: false, sealed: false });
  assertAttempt(attempt);
  return attempt;
}

/** The app revalidates custody and explicitly authorizes this exact one-shot transport. */
export async function submitFederatedNativeReservationV1(
  attempt: Readonly<FederatedNativeReservationAttemptV1>, authorize: () => void,
): Promise<void> {
  const state = assertAttempt(attempt);
  if (state.submitted || typeof authorize !== 'function') throw new Error('native reservation submission is consumed or unauthorized');
  state.submitted = true;
  authorize();
  assertAttempt(attempt);
  if (await rpc(PRIMARY, 'author_submitExtrinsic', [attempt.signedExtrinsicHex]) !== attempt.extrinsicHashHex) {
    throw new Error('native reservation submission did not return the exact extrinsic hash; attempt remains held');
  }
  state.accepted = true;
}

/** Seal only the submitted reservation on the owned genesis parent; no GRANDPA finalization. */
export async function sealFederatedNativeReservationV1(
  attempt: Readonly<FederatedNativeReservationAttemptV1>, authorize: () => void,
): Promise<string> {
  const state = assertAttempt(attempt);
  if (!state.accepted || state.sealed || typeof authorize !== 'function') throw new Error('native reservation sealing is not available');
  state.sealed = true;
  for (const url of [PRIMARY, WITNESS]) {
    authorize();
    if (await rpc(url, 'chain_getBlockHash', [0]) !== attempt.genesisHashHex
      || record(await rpc(url, 'chain_getHeader', [])).number !== '0x0') {
      throw new Error('native reservation parent changed before sealing');
    }
    const pool = await rpc(url, 'author_pendingExtrinsics', []);
    if (!Array.isArray(pool) || pool.length > 1 || (url === PRIMARY && pool.length !== 1)
      || pool.some(value => value !== attempt.signedExtrinsicHex)) throw new Error('native reservation pool is not exclusive');
  }
  authorize(); assertAttempt(attempt);
  const result = record(await rpc(PRIMARY, 'engine_createBlock', [false, false, attempt.genesisHashHex]));
  hash(result.hash);
  if (result.hash === attempt.genesisHashHex) throw new Error('native reservation seal returned its parent');
  state.blockHash = result.hash;
  return result.hash as string;
}

/** Exact paired local inclusion/state observation. Not finality or mint authority. */
export async function observeFederatedNativeReservationInclusionV1(input: Readonly<{
  attempt: Readonly<FederatedNativeReservationAttemptV1>;
  blockHashHex: string;
  expectedStorage: Readonly<Record<string, string | null>>;
  operatorStorageKeyHex: string;
  originalOperatorAccountHex: string;
}>, assertCurrent: () => void) {
  exact(input, ['attempt', 'blockHashHex', 'expectedStorage', 'operatorStorageKeyHex', 'originalOperatorAccountHex']);
  const { attempt, blockHashHex, operatorStorageKeyHex, originalOperatorAccountHex } = input;
  const state = assertAttempt(attempt);
  if (!state.sealed || state.blockHash !== blockHashHex || typeof assertCurrent !== 'function') throw new Error('native reservation was not sealed');
  hash(blockHashHex);
  const storage = captureStorage(input.expectedStorage);
  if (typeof operatorStorageKeyHex !== 'string' || !/^0x[0-9a-f]{136}$/.test(operatorStorageKeyHex)
    || typeof originalOperatorAccountHex !== 'string' || !/^0x[0-9a-f]{160}$/.test(originalOperatorAccountHex)) {
    throw new Error('native reservation operator state is malformed');
  }
  const original = Buffer.from(originalOperatorAccountHex.slice(2), 'hex');
  if (original.readUInt32LE(0) !== 0) throw new Error('native reservation original nonce must be zero');
  let agreed: string | undefined;
  let agreedAccount: string | undefined;
  for (const url of [PRIMARY, WITNESS]) {
    // Only witness propagation may lag. No resubmission or second sealing attempt.
    for (let probe = 0; ; probe++) {
      assertCurrent(); assertAttempt(attempt);
      const found = await rpc(url, 'chain_getBlockHash', [1]);
      if (found === blockHashHex) break;
      if (url !== WITNESS || found !== null || probe === 19) throw new Error('native reservation inclusion block is absent or divergent');
      await new Promise(resolveWait => setTimeout(resolveWait, 100));
    }
    const block = record(record(await rpc(url, 'chain_getBlock', [blockHashHex])).block);
    const header = record(block.header);
    exact(header, ['parentHash', 'number', 'stateRoot', 'extrinsicsRoot', 'digest']);
    hash(header.parentHash); hash(header.stateRoot); hash(header.extrinsicsRoot);
    exact(header.digest, ['logs']);
    const logs = record(header.digest).logs;
    if (!Array.isArray(logs) || logs.length > 32 || logs.some(value => typeof value !== 'string'
      || !/^0x(?:[0-9a-f]{2}){1,16384}$/.test(value))
      || header.number !== '0x1' || header.parentHash !== attempt.genesisHashHex) {
      throw new Error('native reservation header differs from the selected first block');
    }
    const extrinsics = block.extrinsics;
    if (!Array.isArray(extrinsics) || extrinsics.length !== 2 || extrinsics[1] !== attempt.signedExtrinsicHex
      || !isTimestampInherent(extrinsics[0])) throw new Error('native reservation block does not contain the exact exclusive call');
    const encoded = canonicalJson({ header, extrinsics });
    if (agreed !== undefined && agreed !== encoded) throw new Error('native reservation nodes disagree on block contents');
    agreed = encoded;
    for (const [key, value] of Object.entries(storage)) {
      assertCurrent();
      if (await rpc(url, 'state_getStorage', [key, blockHashHex]) !== value) throw new Error('native reservation state differs from the original proof');
    }
    const accountHex = await rpc(url, 'state_getStorage', [operatorStorageKeyHex, blockHashHex]);
    if (typeof accountHex !== 'string' || !/^0x[0-9a-f]{160}$/.test(accountHex)) throw new Error('native reservation operator account is absent');
    const account = Buffer.from(accountHex.slice(2), 'hex');
    const free = (bytes: Buffer) => bytes.readBigUInt64LE(16) + (bytes.readBigUInt64LE(24) << 64n);
    if (account.readUInt32LE(0) !== 1 || !account.subarray(4, 16).equals(original.subarray(4, 16))
      || !account.subarray(32).equals(original.subarray(32)) || free(account) === 0n || free(account) > free(original)) {
      throw new Error('native reservation operator nonce or funding differs after inclusion');
    }
    if (agreedAccount !== undefined && agreedAccount !== accountHex) throw new Error('native reservation operator state disagrees');
    agreedAccount = accountHex;
  }
  for (const url of [PRIMARY, WITNESS]) {
    assertCurrent(); assertAttempt(attempt);
    const pool = await rpc(url, 'author_pendingExtrinsics', []);
    if (!Array.isArray(pool) || pool.length !== 0 || await rpc(url, 'chain_getBlockHash', [0]) !== attempt.genesisHashHex
      || await rpc(url, 'chain_getBlockHash', [1]) !== blockHashHex
      || await rpc(url, 'chain_getBlockHash', []) !== blockHashHex) throw new Error('native reservation target changed during inclusion observation');
  }
  assertCurrent(); assertAttempt(attempt);
  return Object.freeze({ blockHashHex, blockHeight: 1 as const, extrinsicIndex: 1 as const,
    extrinsicHashHex: attempt.extrinsicHashHex, sourceFinalityEstablished: false as const, mintAuthorized: false as const });
}

function assertAttempt(attempt: Readonly<FederatedNativeReservationAttemptV1>) {
  const state = attempts.get(attempt);
  if (!state) throw new Error('native reservation attempt is not original');
  const path = join(state.directory, ATTEMPT_FILE);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== Buffer.byteLength(state.bytes)
    || resolve(realpathSync(state.directory)) !== resolve(state.directory)
    || readFileSync(path, 'utf8') !== state.bytes) throw new Error('native reservation durable hold changed');
  return state;
}

function captureStorage(input: Readonly<Record<string, string | null>>) {
  const fields = Object.getOwnPropertyNames(record(input));
  exact(input, fields);
  if (fields.length < 7 || fields.length > 16 || fields.some(key => !/^0x(?:[0-9a-f]{2}){1,128}$/.test(key)
    || input[key] !== null && (typeof input[key] !== 'string' || !/^0x(?:[0-9a-f]{2})*$/.test(input[key]!)))) {
    throw new Error('native reservation expected storage is malformed');
  }
  return Object.freeze(Object.fromEntries(fields.map(key => [key, input[key]])));
}

function exact(value: unknown, fields: readonly string[]): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== fields.length || fields.some(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value');
    })) throw new Error('native reservation requires exact own-data fields');
}
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('native reservation RPC object required');
  return value as Record<string, unknown>;
}
function hash(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value) || /^0x0+$/.test(value)) throw new Error('native reservation hash is malformed');
}

function isTimestampInherent(value: unknown): boolean {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-f]{2}){5,16}$/.test(value)) return false;
  const bytes = Buffer.from(value.slice(2), 'hex');
  // Pinned SDK new_bare: short SCALE body, v5, Timestamp pallet 1 / set call 0.
  if (bytes[0] !== (bytes.length - 1) * 4 || bytes.subarray(1, 4).toString('hex') !== '050100') return false;
  const moment = bytes.subarray(4);
  const mode = moment[0]! & 3;
  const length = mode === 3 ? (moment[0]! >>> 2) + 4 : [1, 2, 4][mode]!;
  if (mode === 3) return length <= 8 && moment.length === length + 1 && moment[length] !== 0
    && (length > 4 || moment[4]! >= 0x40);
  if (moment.length !== length) return false;
  const number = mode === 0 ? moment[0]! >>> 2 : mode === 1 ? moment.readUInt16LE() >>> 2 : moment.readUInt32LE() >>> 2;
  return number >= [1, 64, 16384][mode]!;
}

async function waitForIndexedResult(url: string, method: string, params: readonly unknown[], assertCurrent: () => void) {
  // Read-only Frontier mapping lag. A conflicting non-null result never gets retried.
  for (let probe = 0; ; probe++) {
    assertCurrent();
    const result = await rpc(url, method, params);
    assertCurrent();
    if (result !== null) return result;
    if (probe === 59) throw new Error('native mint Ethereum index readiness timed out');
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
  }
}

async function waitForEthereumHash(url: string, blockHash: string, number: string, transactions: readonly string[], assertCurrent: () => void) {
  const indexed = record(await waitForIndexedResult(url, 'eth_getBlockByHash', [blockHash, false], assertCurrent));
  if (indexed.hash !== blockHash || indexed.number !== number || canonicalJson(indexed.transactions) !== canonicalJson(transactions)) {
    throw new Error('native mint indexed Ethereum block differs');
  }
}

async function rpc(url: string, method: string, params: readonly unknown[]): Promise<unknown> {
  const response = await fetch(url, { method: 'POST', redirect: 'error',
    headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (response.status !== 200 || !response.body) {
    await response.body?.cancel(); throw new Error('native reservation RPC failed; attempt remains held');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) throw new Error('native reservation RPC exceeds byte limit');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  finally { reader.releaseLock(); }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  assertNoDuplicateJsonKeys(text);
  const payload = record(JSON.parse(text));
  exact(payload, ['jsonrpc', 'id', 'result']);
  if (payload.jsonrpc !== '2.0' || payload.id !== 1) throw new Error('native reservation RPC envelope mismatch');
  return payload.result;
}
