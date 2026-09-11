import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Interface, SigningKey, Transaction } from 'ethers';
import blakejs from 'blakejs';
import { assertNoDuplicateJsonKeys, canonicalJson } from '../ergo-settlement-core/strict-json.js';
import { buildTrustlessBurnInclusionProof, deriveTrustlessBurnIdHex } from '../profiles/substrate-grandpa-v1/trustless-burn-proof.js';

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
interface NativeWithdrawalReceipt {
  readonly logs: readonly { readonly address: string; readonly topics: readonly string[]; readonly data: string }[];
}
const MINT_FILE = 'native-mint-attempt.json';
const mintAttempts = new WeakMap<object, { directory: string; bytes: string; context: Readonly<FederatedNativeMintContextV1>;
  submitted: boolean; accepted: boolean; sealed: boolean; blockHash?: string; ethereumBlockHash?: string;
  confirmedStorage?: Readonly<Record<string, string | null>>; approvalClaimed?: boolean; burnClaimed?: boolean }>();
const applicationAbi = new Interface([
  'function mintSERG(address,uint256,bytes32)', 'function owner() view returns(address)',
  'function sergToken() view returns(address)', 'function paused() view returns(bool)',
  'function totalSupply() view returns(uint256)', 'function balanceOf(address) view returns(uint256)',
  'function processedPegIns(bytes32) view returns(bool)',
  'function approve(address,uint256)', 'function pegOut(uint256,bytes)',
  'function allowance(address,address) view returns(uint256)', 'function accumulatedFees() view returns(uint256)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
  'event PegIn(address indexed to,uint256 amount,bytes32 ergoBoxId)',
  'event Approval(address indexed owner,address indexed spender,uint256 value)',
  'event PegOut(address indexed from,uint256 amount,bytes ergoRecipientPubKey)',
]);

export interface FederatedNativeWithdrawalContextV1 {
  readonly mintAttempt: Readonly<MintAttempt>;
  readonly approvalAttempt: Readonly<MintAttempt> | null;
  readonly grossAmountNanoErg: string;
  readonly recipientErgoTreeHex: string;
}
const withdrawals = new WeakMap<object, { context: Readonly<FederatedNativeWithdrawalContextV1>;
  phase: 'approve' | 'burn'; directory: string; bytes: string; submitted: boolean; accepted: boolean;
  sealed: boolean; observed: boolean; blockHash?: string; ethereumBlockHash?: string;
  observedReceipt?: NativeWithdrawalReceipt }>();

/** Fresh paired parent observation, not authority to release Ergo funds. */
export async function observeFederatedNativeWithdrawalParentV1(input: Readonly<FederatedNativeWithdrawalContextV1>, authorize: () => void) {
  const context = captureWithdrawal(input);
  await checkWithdrawalParent(context, authorize);
  return Object.freeze({ nonce: context.approvalAttempt === null ? 2 as const : 3 as const,
    parentNativeHeight: context.approvalAttempt === null ? 2 as const : 3 as const });
}

export function reserveFederatedNativeWithdrawalAttemptV1(input: Readonly<FederatedNativeWithdrawalContextV1>, signed: Readonly<MintAttempt>) {
  const context = captureWithdrawal(input), mint = assertMintAttempt(context.mintAttempt);
  const phase = context.approvalAttempt === null ? 'approve' : 'burn';
  exact(signed, ['transactionHashHex', 'signedTransactionHex', 'nativeExtrinsicHex']);
  const candidate = Object.freeze({ ...signed });
  hash(candidate.transactionHashHex);
  if (typeof candidate.signedTransactionHex !== 'string' || !/^0x(?:[0-9a-f]{2}){100,1024}$/.test(candidate.signedTransactionHex)
    || typeof candidate.nativeExtrinsicHex !== 'string' || !/^0x(?:[0-9a-f]{2}){100,2048}$/.test(candidate.nativeExtrinsicHex)) {
    throw new Error('native withdrawal encoding is malformed');
  }
  const tx = Transaction.from(candidate.signedTransactionHex), app = mint.context;
  const data = phase === 'approve' ? applicationAbi.encodeFunctionData('approve', [app.bridgeAddressHex, context.grossAmountNanoErg])
    : applicationAbi.encodeFunctionData('pegOut', [context.grossAmountNanoErg, context.recipientErgoTreeHex]);
  if (tx.serialized !== candidate.signedTransactionHex || tx.hash !== candidate.transactionHashHex || tx.type !== 0
    || tx.chainId !== 4242n || tx.nonce !== (phase === 'approve' ? 2 : 3) || tx.value !== 0n
    || tx.gasPrice !== (phase === 'approve' ? 1_265_625_000n : 1_423_828_125n) || tx.gasLimit !== 5_000_000n
    || tx.from?.toLowerCase() !== app.recipientAddressHex || tx.to?.toLowerCase() !== (phase === 'approve' ? app.tokenAddressHex : app.bridgeAddressHex)
    || tx.data !== data) throw new Error('native withdrawal bytes differ from the retained application');
  assertWithdrawalExtrinsic(tx, candidate.nativeExtrinsicHex);
  const slot = phase === 'approve' ? 'approvalClaimed' : 'burnClaimed';
  // Input inspection can invoke Proxy traps; claim only after rechecking the original lineage.
  captureWithdrawal(context);
  if (mint[slot]) throw new Error('native withdrawal attempt is already claimed');
  mint[slot] = true;
  const parent = withdrawalParent(context);
  const bytes = JSON.stringify({ schema: 'e2s.fed-native-withdrawal-attempt.v1', status: 'reserved', phase,
    parentBlockHashHex: parent.native, mintIdentityHex: app.mintIdentityHex,
    grossAmountNanoErg: context.grossAmountNanoErg, recipientErgoTreeHex: context.recipientErgoTreeHex, ...candidate });
  const fd = openSync(join(mint.directory, `native-${phase}-attempt.json`), 'wx');
  try { writeFileSync(fd, bytes, 'utf8'); fsyncSync(fd); } finally { closeSync(fd); }
  withdrawals.set(candidate, { context, phase, directory: mint.directory, bytes,
    submitted: false, accepted: false, sealed: false, observed: false });
  assertWithdrawal(candidate);
  return candidate;
}

function assertWithdrawalExtrinsic(tx: Transaction, nativeExtrinsicHex: string): void {
  // Independent fixed-call equality check against the pinned SDK's bare-v5 layout.
  // The composition's general RLP encoder is not an adapter dependency or authority.
  const le = (value: bigint, size: number) => Buffer.from(value.toString(16).padStart(size * 2, '0'), 'hex').reverse();
  const compact = (length: number) => {
    if (length < 64 || length >= 16384) throw new Error('native withdrawal SCALE length is outside the fixed call shape');
    return le(BigInt(length * 4 + 1), 2);
  };
  if (!tx.signature || tx.signature.networkV === null) throw new Error('native withdrawal requires a chain-bound signature');
  const data = Buffer.from(tx.data.slice(2), 'hex');
  const body = Buffer.concat([Buffer.from([5, 7, 0, 0]), le(BigInt(tx.nonce), 32), le(tx.gasPrice!, 32), le(tx.gasLimit, 32),
    Buffer.from([0]), Buffer.from(tx.to!.slice(2), 'hex'), le(tx.value, 32), compact(data.length), data,
    le(tx.signature.networkV, 8), Buffer.from(tx.signature.r.slice(2), 'hex'), Buffer.from(tx.signature.s.slice(2), 'hex')]);
  if (nativeExtrinsicHex !== `0x${Buffer.concat([compact(body.length), body]).toString('hex')}`) {
    throw new Error('native withdrawal extrinsic differs from the signed transaction');
  }
}

export async function submitFederatedNativeWithdrawalV1(attempt: Readonly<MintAttempt>, authorize: () => void): Promise<void> {
  const state = assertWithdrawal(attempt);
  if (state.submitted || typeof authorize !== 'function') throw new Error('native withdrawal submission is consumed or unauthorized');
  state.submitted = true;
  await checkWithdrawalParent(state.context, authorize);
  authorize(); assertWithdrawal(attempt);
  if (await rpc(PRIMARY, 'eth_sendRawTransaction', [attempt.signedTransactionHex]) !== attempt.transactionHashHex) {
    throw new Error('native withdrawal submission is ambiguous; attempt remains held');
  }
  state.accepted = true;
}

export async function sealFederatedNativeWithdrawalV1(attempt: Readonly<MintAttempt>, authorize: () => void): Promise<string> {
  const state = assertWithdrawal(attempt);
  if (!state.accepted || state.sealed || typeof authorize !== 'function') throw new Error('native withdrawal sealing is not available');
  state.sealed = true;
  await checkWithdrawalParent(state.context, authorize, attempt.nativeExtrinsicHex);
  const parent = withdrawalParent(state.context);
  authorize(); assertWithdrawal(attempt);
  const result = record(await rpc(PRIMARY, 'engine_createBlock', [false, false, parent.native]));
  hash(result.hash);
  const mint = assertMintAttempt(state.context.mintAttempt);
  if ([parent.native, mint.blockHash, mint.context.reservation.blockHashHex, mint.context.reservation.attempt.genesisHashHex].includes(result.hash)) {
    throw new Error('native withdrawal seal returned a predecessor');
  }
  state.blockHash = result.hash;
  return result.hash;
}

/** Confirms exact local execution and token deltas, not a source-finality proof or checkpoint. */
export async function observeFederatedNativeWithdrawalInclusionV1(attempt: Readonly<MintAttempt>, authorize: () => void) {
  const state = assertWithdrawal(attempt);
  if (!state.sealed || !state.blockHash || typeof authorize !== 'function') throw new Error('native withdrawal was not sealed');
  const parent = withdrawalParent(state.context), height = parent.height + 1, number = `0x${height}`;
  const app = assertMintAttempt(state.context.mintAttempt).context;
  const gross = BigInt(state.context.grossAmountNanoErg), net = gross - 5_000_000n;
  let agreed: string | undefined, ethereumHash: string | undefined;
  let observedReceipt: NativeWithdrawalReceipt | undefined;
  for (const url of [PRIMARY, WITNESS]) {
    const check = () => { authorize(); assertWithdrawal(attempt); };
    const found = await waitForIndexedResult(url, 'chain_getBlockHash', [height], check);
    if (found !== state.blockHash) throw new Error('native withdrawal child is absent or divergent');
    const block = record(record(await rpc(url, 'chain_getBlock', [state.blockHash])).block), header = record(block.header);
    exact(header, ['parentHash', 'number', 'stateRoot', 'extrinsicsRoot', 'digest']);
    hash(header.stateRoot); hash(header.extrinsicsRoot); exact(header.digest, ['logs']);
    const digest = record(header.digest).logs;
    if (header.parentHash !== parent.native || header.number !== number || !Array.isArray(digest) || digest.length > 32
      || digest.some(log => typeof log !== 'string' || !/^0x(?:[0-9a-f]{2}){1,16384}$/.test(log))
      || !Array.isArray(block.extrinsics) || block.extrinsics.length !== 2 || !isTimestampInherent(block.extrinsics[0])
      || block.extrinsics[1] !== attempt.nativeExtrinsicHex) throw new Error('native withdrawal child call differs');
    const encoded = canonicalJson(block);
    if (agreed !== undefined && agreed !== encoded) throw new Error('native withdrawal nodes disagree on child block');
    agreed = encoded;
    const ethereum = record(await waitForIndexedResult(url, 'eth_getBlockByNumber', [number, false], check)); hash(ethereum.hash);
    if (ethereum.number !== number || ethereum.parentHash !== parent.ethereum || !Array.isArray(ethereum.transactions)
      || ethereum.transactions.length !== 1 || ethereum.transactions[0] !== attempt.transactionHashHex
      || ethereumHash !== undefined && ethereumHash !== ethereum.hash) throw new Error('native withdrawal Ethereum inclusion disagrees');
    ethereumHash = ethereum.hash;
    await waitForEthereumHash(url, ethereumHash, number, [attempt.transactionHashHex], check);
    const receipt = record(await waitForIndexedResult(url, 'eth_getTransactionReceipt', [attempt.transactionHashHex], check));
    const expectedLogs = state.phase === 'approve'
      ? [{ address: app.tokenAddressHex, ...applicationAbi.encodeEventLog(applicationAbi.getEvent('Approval')!,
        [app.recipientAddressHex, app.bridgeAddressHex, gross]) }]
      : [{ address: app.tokenAddressHex, ...applicationAbi.encodeEventLog(applicationAbi.getEvent('Transfer')!,
        [app.recipientAddressHex, `0x${'00'.repeat(20)}`, net]) },
      { address: app.tokenAddressHex, ...applicationAbi.encodeEventLog(applicationAbi.getEvent('Transfer')!,
        [app.recipientAddressHex, app.bridgeAddressHex, 5_000_000n]) },
      { address: app.bridgeAddressHex, ...applicationAbi.encodeEventLog(applicationAbi.getEvent('PegOut')!,
        [app.recipientAddressHex, net, state.context.recipientErgoTreeHex]) }];
    if (receipt.transactionHash !== attempt.transactionHashHex || receipt.blockHash !== ethereumHash || receipt.blockNumber !== number
      || receipt.transactionIndex !== '0x0' || receipt.status !== '0x1' || receipt.from !== app.recipientAddressHex
      || receipt.to !== (state.phase === 'approve' ? app.tokenAddressHex : app.bridgeAddressHex)
      || !Array.isArray(receipt.logs) || receipt.logs.length !== expectedLogs.length) throw new Error('native withdrawal receipt differs');
    for (const [index, expected] of expectedLogs.entries()) {
      const log = record(receipt.logs[index]);
      if (log.address !== expected.address || log.data !== expected.data || canonicalJson(log.topics) !== canonicalJson(expected.topics)
        || log.blockHash !== ethereumHash || log.blockNumber !== number || log.transactionHash !== attempt.transactionHashHex
        || log.transactionIndex !== '0x0' || log.logIndex !== `0x${index}` || log.removed !== false) {
        throw new Error('native withdrawal event differs');
      }
    }
    await checkWithdrawalApplication(url, state.context, ethereumHash, height, check);
    await checkWithdrawalHead(url, state.context, state.blockHash, height, check);
    observedReceipt = receipt as unknown as NativeWithdrawalReceipt;
  }
  authorize(); assertWithdrawal(attempt);
  state.ethereumBlockHash = ethereumHash!; state.observed = true;
  state.observedReceipt = freezeBurnCollection(observedReceipt!);
  return Object.freeze({ phase: state.phase, blockHashHex: state.blockHash, ethereumBlockHashHex: ethereumHash!, blockHeight: height,
    transactionHashHex: attempt.transactionHashHex, transactionIndex: 0 as const, eventIndex: state.phase === 'burn' ? 2 : 0,
    grossAmountNanoErg: String(gross), netAmountNanoErg: String(net), recipientErgoTreeHex: state.context.recipientErgoTreeHex,
    sourceFinalityEstablished: false as const, trustless: false as const });
}

const BURN_COMMITMENT_KEY = '0xaf86fef4216ac2bcd1c592b204011ad00d2d4fb825af1fcd4c2be9f955a780c5';
const BURN_LEAVES_KEY = '0xaf86fef4216ac2bcd1c592b204011ad08ba92642ec2dee14a0170da020901c7f';
const SYSTEM_EVENTS_KEY = '0x26aa394eea5630e07c48ae0c9558cef780d41e5e16056765bc8461851072c9d7';

/** Observes the original block-four burn and its runtime commitment; this is not finality or payout authority. */
export async function collectFederatedNativeBurnCommitmentV1(attempt: Readonly<MintAttempt>,
  expectedSidechainIdHex: string, assertCurrent: () => void) {
  const state = assertWithdrawal(attempt);
  hash(expectedSidechainIdHex);
  if (state.phase !== 'burn' || !state.observed || typeof assertCurrent !== 'function') {
    throw new Error('native commitment collection requires the original observed burn');
  }
  const check = () => { assertCurrent(); assertWithdrawal(attempt); };
  check();
  const inclusion = await observeFederatedNativeWithdrawalInclusionV1(attempt, check);
  check();
  if (inclusion.blockHeight !== 4 || inclusion.eventIndex !== 2 || !state.observedReceipt) {
    throw new Error('native commitment collection requires the fixed block-four burn');
  }
  const mint = assertMintAttempt(state.context.mintAttempt);
  // Inclusion checked the complete one-transaction block and every log before retaining this receipt.
  // Its two Transfer logs precede the sole PegOut, so the runtime global event index is exactly two.
  const burnIdHex = deriveTrustlessBurnIdHex({ sidechainIdHex: expectedSidechainIdHex,
    sidechainTxHashHex: attempt.transactionHashHex, eventIndex: 2 });
  const recipientErgoTreeHex = state.context.recipientErgoTreeHex.slice(2);
  const recipientErgoTreeHashHex = Buffer.from(blakejs.blake2b(Buffer.from(recipientErgoTreeHex, 'hex'), undefined, 32)).toString('hex');
  const burnEvent = { transactionIndex: 0, logIndex: 2, eventIndex: 2,
    sidechainTxHashHex: attempt.transactionHashHex.slice(2), burnIdHex,
    userAddress: mint.context.recipientAddressHex, amountNanoErg: inclusion.netAmountNanoErg,
    recipientErgoTreeHex, recipientErgoTreeHashHex };
  const burnProof = buildTrustlessBurnInclusionProof([{ sidechainIdHex: expectedSidechainIdHex,
    sidechainBlockHashHex: inclusion.ethereumBlockHashHex, burnIdHex,
    sidechainTxHashHex: attempt.transactionHashHex, eventIndex: 2, recipientErgoTreeHashHex,
    amountNanoErg: inclusion.netAmountNanoErg }], burnIdHex);
  const root = `0x${burnProof.bridgeEventRootHex}`;
  // BridgeEventCommitment v1 SCALE: version, sidechain, u64 height, Ethereum hash, root, u32 count.
  const expectedCommitment = Buffer.alloc(109);
  expectedCommitment[0] = 1; Buffer.from(expectedSidechainIdHex.slice(2), 'hex').copy(expectedCommitment, 1);
  expectedCommitment.writeBigUInt64LE(4n, 33);
  Buffer.from(inclusion.ethereumBlockHashHex.slice(2), 'hex').copy(expectedCommitment, 41);
  Buffer.from(root.slice(2), 'hex').copy(expectedCommitment, 73); expectedCommitment.writeUInt32LE(1, 105);
  const commitmentScaleHex = `0x${expectedCommitment.toString('hex')}`;
  const leafHashesScaleHex = `0x04${burnProof.leaf.leafHashHex}`;
  let systemEventsScaleHex: string | undefined;
  for (const url of [PRIMARY, WITNESS]) {
    await checkWithdrawalHead(url, state.context, inclusion.blockHashHex, 4, check); check();
    for (const [key, expected] of [[BURN_COMMITMENT_KEY, commitmentScaleHex], [BURN_LEAVES_KEY, leafHashesScaleHex]]) {
      check(); const value = await rpc(url, 'state_getStorage', [key, inclusion.blockHashHex]); check();
      if (value !== expected) throw new Error('native burn runtime commitment or leaves differ');
    }
    check(); const events = await rpc(url, 'state_getStorage', [SYSTEM_EVENTS_KEY, inclusion.blockHashHex]); check();
    assertNativeBurnSystemEvents(events, state.observedReceipt, attempt, mint.context, inclusion.ethereumBlockHashHex, root);
    if (systemEventsScaleHex !== undefined && events !== systemEventsScaleHex) throw new Error('native burn runtime events disagree');
    systemEventsScaleHex = events as string;
  }
  for (const url of [PRIMARY, WITNESS]) {
    await checkWithdrawalHead(url, state.context, inclusion.blockHashHex, 4, check); check();
  }
  check();
  return freezeBurnCollection({ sidechainIdHex: expectedSidechainIdHex,
    nativeGenesisHashHex: mint.context.reservation.attempt.genesisHashHex,
    blockHashHex: inclusion.blockHashHex, ethereumBlockHashHex: inclusion.ethereumBlockHashHex,
    blockHeight: 4 as const, transactionHashHex: attempt.transactionHashHex, eventIndex: 2 as const,
    bridgeEventRootHex: root, burnLeafCount: 1 as const, commitmentScaleHex, leafHashesScaleHex,
    systemEventsScaleHex: systemEventsScaleHex!, burnEvent, burnProof,
    sourceFinalityEstablished: false as const, trustless: false as const });
}

function freezeBurnCollection<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeBurnCollection(child);
    Object.freeze(value);
  }
  return value;
}

function assertNativeBurnSystemEvents(value: unknown, receipt: NativeWithdrawalReceipt, attempt: Readonly<MintAttempt>,
  app: Readonly<FederatedNativeMintContextV1>, ethereumHash: string, root: string): void {
  // Pinned SDK bbc435c / Frontier: EventRecord(Phase, RuntimeEvent, Vec<H256>).
  // Only the two fixed extrinsics, their native fee events, three EVM logs and finalization root are admitted.
  if (typeof value !== 'string' || !/^0x(?:[0-9a-f]{2}){1,4096}$/.test(value)) throw new Error('native burn runtime events are malformed');
  const bytes = Buffer.from(value.slice(2), 'hex'); let offset = 0;
  const take = (length: number) => {
    if (length < 0 || offset + length > bytes.length) throw new Error('native burn runtime events are truncated');
    const part = bytes.subarray(offset, offset += length); return part;
  };
  const byte = () => take(1)[0]!;
  const compact = (maximum: bigint): bigint => {
    const first = byte(), mode = first & 3;
    let result: bigint;
    if (mode === 0) result = BigInt(first >>> 2);
    else if (mode < 3) {
      const tail = take(mode === 1 ? 1 : 3); let encoded = BigInt(first);
      for (let index = 0; index < tail.length; index++) encoded |= BigInt(tail[index]!) << BigInt((index + 1) * 8);
      result = encoded >> 2n;
      if (result < (mode === 1 ? 64n : 16384n)) throw new Error('native burn runtime events contain noncanonical SCALE');
    } else {
      const length = (first >>> 2) + 4;
      if (length > 8) throw new Error('native burn runtime events exceed the SCALE bound');
      const tail = take(length); result = 0n;
      for (let index = 0; index < length; index++) result |= BigInt(tail[index]!) << BigInt(index * 8);
      if (tail[length - 1] === 0 || result < 1073741824n) throw new Error('native burn runtime events contain noncanonical SCALE');
    }
    if (result > maximum) throw new Error('native burn runtime events exceed the SCALE bound');
    return result;
  };
  const equal = (expected: string) => {
    if (take(expected.length / 2).toString('hex') !== expected) throw new Error('native burn runtime event identity differs');
  };
  const count = Number(compact(16n)); let stage = 0, logs = 0, withdrawalsSeen = 0, deposits = 0, newAccounts = 0, endowments = 0;
  for (let index = 0; index < count; index++) {
    const phase = byte(), extrinsic = phase === 0 ? take(4).readUInt32LE() : -1;
    const pallet = byte(), event = byte();
    if (pallet === 0 && event === 0) {
      if (phase !== 0 || (stage === 0 ? extrinsic !== 0 : stage !== 3 || extrinsic !== 1)) throw new Error('native burn success event order differs');
      compact(0xffff_ffff_ffff_ffffn); compact(0xffff_ffff_ffff_ffffn);
      if (byte() !== (stage === 0 ? 2 : 0) || byte() !== (stage === 0 ? 0 : 1)) throw new Error('native burn dispatch classification differs');
      stage = stage === 0 ? 1 : 4;
    } else if (stage === 1 && phase === 0 && extrinsic === 1 && pallet === 0 && event === 3) {
      if (++newAccounts > 1 || logs !== 0) throw new Error('native burn fee account event differs');
      take(20);
    } else if (stage === 1 && phase === 0 && extrinsic === 1 && pallet === 4 && [0, 7, 8].includes(event)) {
      if (logs !== 0) throw new Error('native burn fee event order differs');
      const account = `0x${take(20).toString('hex')}`; const amountBytes = take(16);
      const amount = BigInt(`0x${Buffer.from(amountBytes).reverse().toString('hex')}`);
      if (amount > 7_119_140_625_000_000n) throw new Error('native burn fee event exceeds the signed fee bound');
      if (event === 8 && (++withdrawalsSeen !== 1 || account !== app.recipientAddressHex)) throw new Error('native burn fee withdrawal differs');
      if (event === 7 && ++deposits > 2 || event === 0 && ++endowments > 1) throw new Error('native burn fee event count differs');
    } else if (stage === 1 && phase === 0 && extrinsic === 1 && pallet === 8 && event === 0) {
      const log = receipt.logs?.[logs++];
      if (!log || logs > 3 || withdrawalsSeen !== 1 || deposits < 1) throw new Error('native burn EVM event order differs');
      equal(log.address!.slice(2));
      if (compact(4n) !== BigInt(log.topics!.length)) throw new Error('native burn EVM topics differ');
      for (const topic of log.topics!) equal(topic.slice(2));
      if (compact(160n) !== BigInt((log.data!.length - 2) / 2)) throw new Error('native burn EVM data length differs');
      equal(log.data!.slice(2)); if (logs === 3) stage = 2;
    } else if (stage === 2 && phase === 0 && extrinsic === 1 && pallet === 7 && event === 0) {
      equal(app.recipientAddressHex.slice(2)); equal(app.bridgeAddressHex.slice(2)); equal(attempt.transactionHashHex.slice(2));
      if (byte() !== 0 || byte() > 1 || compact(30n) !== 0n) throw new Error('native burn Ethereum execution failed');
      stage = 3;
    } else if (stage === 4 && phase === 1 && pallet === 12 && event === 1 && index === count - 1) {
      equal(`01${ethereumHash.slice(2)}${root.slice(2)}01000000`); stage = 5;
    } else throw new Error('native burn runtime event is unknown or out of order');
    if (compact(0n) !== 0n) throw new Error('native burn runtime event topics differ');
  }
  if (stage !== 5 || offset !== bytes.length) throw new Error('native burn runtime events are incomplete or trailing');
}

function captureWithdrawal(input: Readonly<FederatedNativeWithdrawalContextV1>) {
  exact(input, ['mintAttempt', 'approvalAttempt', 'grossAmountNanoErg', 'recipientErgoTreeHex']);
  const context = Object.freeze({ ...input }), mint = assertMintAttempt(context.mintAttempt);
  if (!mint.confirmedStorage || !mint.ethereumBlockHash || !mint.blockHash) throw new Error('native withdrawal requires confirmed mint state');
  if (typeof context.grossAmountNanoErg !== 'string' || !/^[1-9][0-9]{0,18}$/.test(context.grossAmountNanoErg)
    || BigInt(context.grossAmountNanoErg) < 15_000_000n || BigInt(context.grossAmountNanoErg) > BigInt(mint.context.amountNanoErg)
    || typeof context.recipientErgoTreeHex !== 'string' || !/^0x0008cd0[23][0-9a-f]{64}$/.test(context.recipientErgoTreeHex)) {
    throw new Error('native withdrawal amount or recipient is malformed');
  }
  SigningKey.computePublicKey(`0x${context.recipientErgoTreeHex.slice(8)}`, true);
  if (context.approvalAttempt !== null) {
    const approval = assertWithdrawal(context.approvalAttempt);
    if (approval.phase !== 'approve' || !approval.observed || !approval.ethereumBlockHash || !approval.blockHash
      || approval.context.mintAttempt !== context.mintAttempt || approval.context.grossAmountNanoErg !== context.grossAmountNanoErg
      || approval.context.recipientErgoTreeHex !== context.recipientErgoTreeHex) throw new Error('native burn approval lineage differs');
  }
  return context;
}

function assertWithdrawal(attempt: Readonly<MintAttempt>) {
  const state = withdrawals.get(attempt);
  if (!state) throw new Error('native withdrawal attempt is not original');
  assertMintAttempt(state.context.mintAttempt);
  if (state.context.approvalAttempt !== null) assertWithdrawal(state.context.approvalAttempt);
  const path = join(state.directory, `native-${state.phase}-attempt.json`), stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== Buffer.byteLength(state.bytes)
    || resolve(realpathSync(state.directory)) !== resolve(state.directory) || readFileSync(path, 'utf8') !== state.bytes) {
    throw new Error('native withdrawal durable hold changed');
  }
  return state;
}

function withdrawalParent(context: Readonly<FederatedNativeWithdrawalContextV1>) {
  const mint = assertMintAttempt(context.mintAttempt);
  const state = context.approvalAttempt === null ? mint : assertWithdrawal(context.approvalAttempt);
  if (!state.blockHash || !state.ethereumBlockHash) throw new Error('native withdrawal predecessor is absent');
  return { native: state.blockHash, ethereum: state.ethereumBlockHash, height: context.approvalAttempt === null ? 2 : 3 };
}

async function checkWithdrawalParent(context: Readonly<FederatedNativeWithdrawalContextV1>, authorize: () => void, poolExtrinsic?: string) {
  if (typeof authorize !== 'function') throw new Error('native withdrawal authorization is absent');
  captureWithdrawal(context);
  const parent = withdrawalParent(context), price = context.approvalAttempt === null ? 1_265_625_000n : 1_423_828_125n;
  for (const url of [PRIMARY, WITNESS]) {
    authorize();
    const ethereum = record(await rpc(url, 'eth_getBlockByNumber', [`0x${parent.height}`, false]));
    const transaction = context.approvalAttempt ?? context.mintAttempt;
    if (ethereum.hash !== parent.ethereum || ethereum.number !== `0x${parent.height}`
      || canonicalJson(ethereum.transactions) !== canonicalJson([transaction.transactionHashHex])
      || typeof ethereum.baseFeePerGas !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/.test(ethereum.baseFeePerGas)
      || (BigInt(ethereum.baseFeePerGas) * 9n + 7n) / 8n > price) throw new Error('native withdrawal parent or fee bound differs');
    await waitForEthereumHash(url, parent.ethereum, `0x${parent.height}`, [transaction.transactionHashHex], authorize);
    await checkWithdrawalApplication(url, context, parent.ethereum, parent.height, authorize);
  }
  for (const url of [PRIMARY, WITNESS]) await checkWithdrawalHead(url, context, parent.native, parent.height, authorize, poolExtrinsic);
  authorize(); captureWithdrawal(context);
}

async function checkWithdrawalApplication(url: string, context: Readonly<FederatedNativeWithdrawalContextV1>, ethereum: string,
  height: number, authorize: () => void) {
  const app = assertMintAttempt(context.mintAttempt).context, block = { blockHash: ethereum, requireCanonical: true };
  authorize();
  if (await rpc(url, 'eth_chainId', []) !== '0x1092'
    || await rpc(url, 'eth_getTransactionCount', [app.recipientAddressHex, block]) !== `0x${height}`) throw new Error('native withdrawal chain or nonce differs');
  for (const [address, digest, length] of [[app.bridgeAddressHex, app.bridgeCodeSha256Hex, app.bridgeCodeBytes],
    [app.tokenAddressHex, app.tokenCodeSha256Hex, app.tokenCodeBytes]] as const) {
    authorize();
    const code = await rpc(url, 'eth_getCode', [address, block]);
    if (typeof code !== 'string' || !/^0x(?:[0-9a-f]{2})+$/.test(code) || (code.length - 2) / 2 !== length
      || createHash('sha256').update(Buffer.from(code.slice(2), 'hex')).digest('hex') !== digest) throw new Error('native withdrawal application code differs');
  }
  const gross = BigInt(context.grossAmountNanoErg), minted = BigInt(app.amountNanoErg), burned = height === 4;
  for (const [address, method, args, expected] of [
    [app.bridgeAddressHex, 'owner', [], app.recipientAddressHex], [app.bridgeAddressHex, 'sergToken', [], app.tokenAddressHex],
    [app.bridgeAddressHex, 'paused', [], false], [app.tokenAddressHex, 'owner', [], app.bridgeAddressHex],
    [app.tokenAddressHex, 'totalSupply', [], minted - (burned ? gross - 5_000_000n : 0n)],
    [app.tokenAddressHex, 'balanceOf', [app.recipientAddressHex], minted - (burned ? gross : 0n)],
    [app.tokenAddressHex, 'balanceOf', [app.bridgeAddressHex], burned ? 5_000_000n : 0n],
    [app.tokenAddressHex, 'allowance', [app.recipientAddressHex, app.bridgeAddressHex], height === 2 ? 0n : gross - (burned ? 5_000_000n : 0n)],
    [app.bridgeAddressHex, 'accumulatedFees', [], burned ? 5_000_000n : 0n],
    [app.bridgeAddressHex, 'processedPegIns', [app.mintIdentityHex], true],
  ] as const) {
    authorize();
    if (await rpc(url, 'eth_call', [{ to: address, data: applicationAbi.encodeFunctionData(method, args) }, block])
      !== applicationAbi.encodeFunctionResult(method, [expected])) throw new Error('native withdrawal application state differs');
  }
}

async function checkWithdrawalHead(url: string, context: Readonly<FederatedNativeWithdrawalContextV1>, native: string,
  height: number, authorize: () => void, poolExtrinsic?: string) {
  const mint = assertMintAttempt(context.mintAttempt);
  for (const [key, expected] of Object.entries(mint.confirmedStorage!)) {
    authorize();
    if (await rpc(url, 'state_getStorage', [key, native]) !== expected) throw new Error('native withdrawal consumed mint state differs');
  }
  authorize();
  const account = await rpc(url, 'state_getStorage', [mint.context.reservation.operatorStorageKeyHex, native]);
  const pool = await rpc(url, 'author_pendingExtrinsics', []);
  if (typeof account !== 'string' || !/^0x[0-9a-f]{160}$/.test(account) || Buffer.from(account.slice(2), 'hex').readUInt32LE() !== height
    || !Array.isArray(pool) || (poolExtrinsic === undefined ? pool.length !== 0
      : pool.length > 1 || url === PRIMARY && pool.length !== 1 || pool.some(value => value !== poolExtrinsic))
    || await rpc(url, 'chain_getBlockHash', [0]) !== mint.context.reservation.attempt.genesisHashHex
    || await rpc(url, 'chain_getBlockHash', [1]) !== mint.context.reservation.blockHashHex
    || await rpc(url, 'chain_getBlockHash', [2]) !== mint.blockHash
    || context.approvalAttempt !== null && await rpc(url, 'chain_getBlockHash', [3]) !== assertWithdrawal(context.approvalAttempt).blockHash
    || await rpc(url, 'chain_getBlockHash', [height]) !== native || await rpc(url, 'chain_getBlockHash', []) !== native) {
    throw new Error('native withdrawal target or pool changed');
  }
  authorize(); captureWithdrawal(context);
}

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
    || tx.gasPrice !== 1_125_000_000n || tx.gasLimit !== 5_000_000n
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
  state.confirmedStorage = Object.freeze({ ...storage });
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
  const hasError = Object.hasOwn(payload, 'error');
  exact(payload, ['jsonrpc', 'id', hasError ? 'error' : 'result']);
  if (payload.jsonrpc !== '2.0' || payload.id !== 1) throw new Error('native reservation RPC envelope mismatch');
  if (hasError) {
    const error = record(payload.error);
    exact(error, Object.hasOwn(error, 'data') ? ['code', 'message', 'data'] : ['code', 'message']);
    if (typeof error.code !== 'number' || !Number.isInteger(error.code)
      || error.code < -0x80000000 || error.code > 0x7fffffff || typeof error.message !== 'string') {
      throw new Error('native reservation RPC error is malformed');
    }
    // Preserve the node's error code, never its arbitrary message/data or request bytes.
    throw new Error(`native reservation RPC ${method} rejected (code ${error.code}); attempt remains held`);
  }
  return payload.result;
}
