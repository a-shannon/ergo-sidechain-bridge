import { createHash } from 'node:crypto';
import { Interface, Transaction } from 'ethers';
import blakejs from 'blakejs';

import { encodeFederatedNativeMintExtrinsicV1Hex }
  from '../federated-native-mint-runtime-state-v1.js';
import { encodePooledReserveMintReservationPendingV4ScaleHex }
  from '../pooled-reserve-mint-reservation-runtime-state-v4.js';
import { derivePooledReserveMintReservationRuntimeStorageKeysV4 }
  from '../pooled-reserve-mint-reservation-runtime-state-v4.js';

type NativeProof = Readonly<{
  runtimeProfileIdHex: string;
  mintReservationStatementIdHex: string;
  mintIdentityHex: string;
  sourceProofProfileIdHex: string;
  requestDigestHex: string;
  sourceProofEnvelopeScaleHex: string;
  request: Readonly<{
    statementHex: string;
    runtimeProfile: Readonly<{ sourceProofSystemIdHex: string }>;
  }>;
  result: Readonly<{
    issuedAtNativeHeight: string | number | bigint;
    expiresAtNativeHeight: string | number | bigint;
  }>;
  signatureVerification: Readonly<{ resultIdHex: string; signatureSetDigestHex: string }>;
}>;

type NativeOperator = Readonly<{
  addressHex: string;
  nativeFunding: Readonly<{ storageKeyHex: string; accountInfoScaleHex: string }>;
}>;

export interface NativeContinuationRpcFixtureV1Input {
  readonly operator: NativeOperator;
  readonly firstProof: NativeProof;
  readonly runtimeProfileScaleHex: string;
  readonly sourceRuntimeCodeHex: string;
  readonly sidechainIdHex: string;
  readonly bridgeAddressHex: string;
  readonly tokenAddressHex: string;
  readonly ergoRecipientTreeHex: string;
  readonly mintAmountNanoErg: bigint;
  readonly burnGrossAmountNanoErg: bigint;
  readonly evmChainId: bigint;
}

export function createNativeContinuationRpcFixtureV1(input: NativeContinuationRpcFixtureV1Input) {
  const raw = (hex: string) => Buffer.from(hex.replace(/^0x/, ''), 'hex');
  const digest = (value: Uint8Array) =>
    `0x${Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex')}`;
  const u64 = (value: bigint, size = 8) => {
    const result = Buffer.alloc(size);
    result.writeBigUInt64LE(value);
    return result;
  };
  const compact = (size: number) => size < 64
    ? Buffer.from([size * 4])
    : Buffer.from([(size * 4 + 1) & 255, (size * 4 + 1) >>> 8]);
  const bridge = `0x${input.bridgeAddressHex.replace(/^0x/, '')}`;
  const token = `0x${input.tokenAddressHex.replace(/^0x/, '')}`;
  const recipient = `0x${input.operator.addressHex.replace(/^0x/, '')}`;
  const ergoRecipient = `0x${input.ergoRecipientTreeHex.replace(/^0x/, '')}`;
  const abi = new Interface([
    'function owner() view returns(address)',
    'function sergToken() view returns(address)',
    'function paused() view returns(bool)',
    'function totalSupply() view returns(uint256)',
    'function balanceOf(address) view returns(uint256)',
    'function processedPegIns(bytes32) view returns(bool)',
    'function mintSERG(address,uint256,bytes32)',
    'function approve(address,uint256)',
    'function pegOut(uint256,bytes)',
    'function allowance(address,address) view returns(uint256)',
    'function accumulatedFees() view returns(uint256)',
    'event Approval(address indexed owner,address indexed spender,uint256 value)',
    'event PegOut(address indexed from,uint256 amount,bytes ergoRecipientPubKey)',
    'event Transfer(address indexed from,address indexed to,uint256 value)',
    'event PegIn(address indexed to,uint256 amount,bytes32 ergoBoxId)',
  ]);
  const expectedGenesisHashHex = `0x${'94'.repeat(32)}`;
  const nativeBlocks = [expectedGenesisHashHex, `0x${'a1'.repeat(32)}`, `0x${'a2'.repeat(32)}`,
    `0x${'b3'.repeat(32)}`, `0x${'b4'.repeat(32)}`, `0x${'b5'.repeat(32)}`,
    `0x${'b6'.repeat(32)}`, `0x${'b7'.repeat(32)}`, `0x${'b8'.repeat(32)}`] as const;
  const ethBlocks = ['', `0x${'a3'.repeat(32)}`, `0x${'a4'.repeat(32)}`,
    `0x${'c3'.repeat(32)}`, `0x${'c4'.repeat(32)}`, `0x${'c5'.repeat(32)}`,
    `0x${'c6'.repeat(32)}`, `0x${'c7'.repeat(32)}`, `0x${'c8'.repeat(32)}`] as const;
  const firstKeys = derivePooledReserveMintReservationRuntimeStorageKeysV4(input.firstProof.mintIdentityHex);
  const expectedStorage: Record<string, string> = {
    '0x3a636f6465': `0x${input.sourceRuntimeCodeHex.replace(/^0x/, '')}`,
    '0xaf86fef4216ac2bcd1c592b204011ad0710f901342def5945398fc0e02473bde': input.runtimeProfileScaleHex,
    '0xaf86fef4216ac2bcd1c592b204011ad04e000f8baeaa137cf901a9235d7de9a1': '0x01',
    [input.operator.nativeFunding.storageKeyHex]: input.operator.nativeFunding.accountInfoScaleHex,
  };
  const calls: Array<Readonly<{ method: string; params: readonly unknown[] }>> = [];
  const nativeCalls: string[] = [];
  const transactionHashes: string[] = [];
  let currentProof: NativeProof | undefined;
  let currentKeys: ReturnType<typeof derivePooledReserveMintReservationRuntimeStorageKeysV4> | undefined;
  let currentPendingScaleHex: string | undefined;
  let firstConsumedScaleHex: string | undefined;
  let currentConsumedScaleHex: string | undefined;
  let height = 0;

  const pending = (proof: NativeProof, reservedAtNativeHeight: string) =>
    encodePooledReserveMintReservationPendingV4ScaleHex({
      profileIdHex: proof.runtimeProfileIdHex,
      statementHex: proof.request.statementHex,
      statementIdHex: proof.mintReservationStatementIdHex,
      mintIdentityHex: proof.mintIdentityHex,
      sourceStatementBytesDigestHex: digest(raw(proof.request.statementHex)),
      sourceProofSystemIdHex: proof.request.runtimeProfile.sourceProofSystemIdHex,
      sourceProofProfileIdHex: proof.sourceProofProfileIdHex,
      sourceProofIssuedAtNativeHeight: proof.result.issuedAtNativeHeight,
      sourceProofRequestDigestHex: proof.requestDigestHex,
      sourceProofResultIdHex: proof.signatureVerification.resultIdHex,
      sourceProofDigestHex: digest(Buffer.concat([
        Buffer.from('E2S_POOLED_RESERVE_FEDERATED_SOURCE_PROOF_ENVELOPE_V1', 'ascii'),
        raw(proof.signatureVerification.resultIdHex),
        raw(proof.signatureVerification.signatureSetDigestHex),
      ])),
      reservedAtNativeHeight,
      expiresAtNativeHeight: proof.result.expiresAtNativeHeight,
    });
  const firstPendingScaleHex = pending(input.firstProof, '1');

  const consumed = (proof: NativeProof, at: number) => {
    const heightBytes = Buffer.alloc(8);
    heightBytes.writeBigUInt64LE(BigInt(at));
    const eventBytes = Buffer.alloc(4);
    eventBytes.writeUInt32LE(1);
    return `0x${Buffer.concat([
      Buffer.from([4]), raw(proof.runtimeProfileIdHex), raw(proof.mintReservationStatementIdHex),
      raw(proof.mintIdentityHex), heightBytes, raw(ethBlocks[at]!), raw(transactionHashes[at]!), eventBytes,
    ]).toString('hex')}`;
  };

  const commitmentStorage = (burnHeight: 4 | 8): Record<string, string> => {
    const commitmentKey = '0xaf86fef4216ac2bcd1c592b204011ad00d2d4fb825af1fcd4c2be9f955a780c5';
    const leavesKey = '0xaf86fef4216ac2bcd1c592b204011ad08ba92642ec2dee14a0170da020901c7f';
    const eventsKey = '0x26aa394eea5630e07c48ae0c9558cef780d41e5e16056765bc8461851072c9d7';
    const sidechain = raw(input.sidechainIdHex);
    const eventIndex = Buffer.from('00000002', 'hex');
    const net = input.burnGrossAmountNanoErg - 5_000_000n;
    const netBytes = Buffer.alloc(8);
    netBytes.writeBigUInt64BE(net);
    const burnId = raw(digest(Buffer.concat([
      Buffer.from('E2S_TRUSTLESS_BURN_ID_V1'), sidechain, raw(transactionHashes[burnHeight]!), eventIndex,
    ])));
    const leaf = Buffer.concat([
      Buffer.from([1]), sidechain, raw(ethBlocks[burnHeight]!), burnId, raw(transactionHashes[burnHeight]!),
      eventIndex, raw(digest(raw(ergoRecipient))), netBytes, Buffer.alloc(32),
    ]);
    const root = raw(digest(Buffer.concat([Buffer.from('E2S_TRUSTLESS_BURN_LEAF_V1'), leaf])));
    const commitment = Buffer.concat([
      Buffer.from([1]), sidechain, u64(BigInt(burnHeight)), raw(ethBlocks[burnHeight]!), root,
      Buffer.from('01000000', 'hex'),
    ]);
    const apply = (index: number) => Buffer.from([0, index, 0, 0, 0]);
    const event = (phase: Buffer, pallet: number, variant: number, ...fields: Buffer[]) =>
      Buffer.concat([phase, Buffer.from([pallet, variant]), ...fields, Buffer.from([0])]);
    const phase = apply(1);
    const operatorBytes = raw(recipient);
    const signedFeeBound = burnHeight === 8 ? 11_403_486_740_000_000n : 7_119_140_625_000_000n;
    const records = [
      event(apply(0), 0, 0, Buffer.from([0, 0, 2, 0])),
      event(phase, 4, 8, operatorBytes, u64(signedFeeBound, 16)),
      event(phase, 4, 7, operatorBytes, u64(7_000_000_000_000_000n, 16)),
      event(phase, 4, 7, Buffer.alloc(20), u64(0n, 16)),
    ];
    const logs = [
      { address: token, ...abi.encodeEventLog(abi.getEvent('Transfer')!, [recipient, `0x${'00'.repeat(20)}`, net]) },
      { address: token, ...abi.encodeEventLog(abi.getEvent('Transfer')!, [recipient, bridge, 5_000_000n]) },
      { address: bridge, ...abi.encodeEventLog(abi.getEvent('PegOut')!, [recipient, net, ergoRecipient]) },
    ];
    for (const log of logs) records.push(event(
      phase, 8, 0, raw(log.address), compact(log.topics.length), ...log.topics.map(raw),
      compact(raw(log.data).length), raw(log.data),
    ));
    records.push(
      event(phase, 7, 0, operatorBytes, raw(bridge), raw(transactionHashes[burnHeight]!), Buffer.from([0, 0, 0])),
      event(phase, 0, 0, Buffer.from([0, 0, 0, 1])),
      event(Buffer.from([1]), 12, 1, Buffer.from([1]), raw(ethBlocks[burnHeight]!), root, Buffer.from('01000000', 'hex')),
    );
    return {
      [commitmentKey]: `0x${commitment.toString('hex')}`,
      [leavesKey]: `0x04${root.toString('hex')}`,
      [eventsKey]: `0x${Buffer.concat([compact(records.length), ...records]).toString('hex')}`,
    };
  };

  const fetch = async (_url: unknown, init: RequestInit) => {
    const request = JSON.parse(String(init.body)) as { method: string; params: unknown[] };
    const { method, params } = request;
    calls.push(Object.freeze({ method, params: Object.freeze([...params]) }));
    let result: unknown;
    if (method === 'author_submitExtrinsic') {
      nativeCalls[height + 1] = String(params[0]);
      result = digest(raw(String(params[0])));
    } else if (method === 'eth_sendRawTransaction') {
      const tx = Transaction.from(String(params[0]));
      if (tx.chainId !== input.evmChainId || tx.nonce !== height || tx.from?.toLowerCase() !== recipient.toLowerCase()) {
        throw new Error('native continuation RPC fixture received a transaction for a foreign chain, nonce or operator');
      }
      const proof = height === 1 ? input.firstProof : currentProof;
      if ((height === 1 || height === 5) && (!proof || tx.data !== abi.encodeFunctionData(
        'mintSERG', [recipient, input.mintAmountNanoErg, proof.mintIdentityHex],
      ))) throw new Error('native continuation RPC fixture received an unexpected mint call');
      if ((height === 2 || height === 6) && tx.data !== abi.encodeFunctionData(
        'approve', [bridge, input.burnGrossAmountNanoErg],
      )) throw new Error('native continuation RPC fixture received an unexpected approval call');
      if ((height === 3 || height === 7) && tx.data !== abi.encodeFunctionData(
        'pegOut', [input.burnGrossAmountNanoErg, ergoRecipient],
      )) throw new Error('native continuation RPC fixture received an unexpected burn call');
      nativeCalls[height + 1] = encodeFederatedNativeMintExtrinsicV1Hex(String(params[0]));
      transactionHashes[height + 1] = tx.hash!;
      result = tx.hash!;
    } else if (method === 'engine_createBlock') {
      if (JSON.stringify(params) !== JSON.stringify([false, false, nativeBlocks[height]])) {
        throw new Error('native continuation RPC fixture received an unexpected block parent');
      }
      height++;
      result = { hash: nativeBlocks[height] };
      if (height === 2) firstConsumedScaleHex = consumed(input.firstProof, 2);
      if (height === 6) currentConsumedScaleHex = consumed(currentProof!, 6);
    } else if (method === 'author_pendingExtrinsics') {
      result = nativeCalls[height + 1] ? [nativeCalls[height + 1]] : [];
    } else if (height === 0 && method === 'chain_getBlockHash') result = expectedGenesisHashHex;
    else if (height === 0 && method === 'chain_getHeader') result = { number: '0x0' };
    else if (height === 0 && method === 'state_getStorage') result = expectedStorage[String(params[0])] ?? null;
    else if (method === 'chain_getBlockHash') result = nativeBlocks[params.length === 0 ? height : Number(params[0])];
    else if (method === 'chain_getHeader') result = { number: `0x${height}` };
    else if (method === 'chain_getBlock') {
      const at = nativeBlocks.indexOf(String(params[0]) as typeof nativeBlocks[number]);
      result = { block: { header: { parentHash: nativeBlocks[at - 1], number: `0x${at}`,
        stateRoot: `0x${'a5'.repeat(32)}`, extrinsicsRoot: `0x${'a6'.repeat(32)}`, digest: { logs: [] } },
        extrinsics: ['0x1005010028', nativeCalls[at]] } };
    } else if (method === 'state_getStorage') {
      const at = nativeBlocks.indexOf(String(params[1]) as typeof nativeBlocks[number]);
      const account = raw(input.operator.nativeFunding.accountInfoScaleHex);
      account.writeUInt32LE(at, 0);
      const commitment = [4, 8].includes(at) ? commitmentStorage(at as 4 | 8) : {};
      result = commitment[String(params[0])]
        ?? (String(params[0]) === input.operator.nativeFunding.storageKeyHex ? `0x${account.toString('hex')}`
          : at >= 5 && currentKeys && String(params[0]) === currentKeys.pendingKeysStorageKeyHex
            ? at === 5 ? `0x04${currentProof!.mintIdentityHex.slice(2)}` : '0x00'
            : at >= 5 && currentKeys && String(params[0]) === currentKeys.pendingReservationStorageKeyHex
              ? at === 5 ? currentPendingScaleHex! : null
              : at >= 5 && currentKeys && String(params[0]) === currentKeys.consumedReservationStorageKeyHex
                ? at >= 6 ? currentConsumedScaleHex! : null
                : at >= 1 && String(params[0]) === firstKeys.pendingKeysStorageKeyHex
                  ? at === 1 ? `0x04${input.firstProof.mintIdentityHex.slice(2)}` : '0x00'
                  : at >= 1 && String(params[0]) === firstKeys.pendingReservationStorageKeyHex
                    ? at === 1 ? firstPendingScaleHex : null
                    : at >= 2 && String(params[0]) === firstKeys.consumedReservationStorageKeyHex
                      ? firstConsumedScaleHex! : expectedStorage[String(params[0])] ?? null);
    } else if (method === 'eth_chainId') result = `0x${input.evmChainId.toString(16)}`;
    else if (method === 'eth_getBlockByNumber') {
      const at = Number(params[0]);
      const ceiling = at === 5 ? 1_802_032_472n : at === 6 ? 2_027_286_531n : at === 7 ? 2_280_697_348n : 1_125_000_000n;
      result = { number: params[0], hash: ethBlocks[at], parentHash: ethBlocks[at - 1],
        baseFeePerGas: `0x${(ceiling * 8n / 9n).toString(16)}`,
        transactions: transactionHashes[at] ? [transactionHashes[at]] : [] };
    } else if (method === 'eth_getBlockByHash') {
      const at = ethBlocks.indexOf(String(params[0]) as typeof ethBlocks[number]);
      result = { number: `0x${at.toString(16)}`, hash: params[0],
        transactions: transactionHashes[at] ? [transactionHashes[at]] : [] };
    } else if (method === 'eth_getTransactionCount') {
      result = `0x${ethBlocks.indexOf((params[1] as { blockHash: typeof ethBlocks[number] }).blockHash).toString(16)}`;
    } else if (method === 'eth_getCode') result = `0x${'60'.repeat(String(params[0]).toLowerCase() === bridge.toLowerCase() ? 100 : 200)}`;
    else if (method === 'eth_call') {
      const call = abi.parseTransaction({ data: (params[0] as { data: string }).data })!;
      const at = ethBlocks.indexOf((params[1] as { blockHash: typeof ethBlocks[number] }).blockHash);
      const firstMinted = at >= 2;
      const secondMinted = at >= 6;
      let value: string | boolean | bigint;
      if (call.name === 'owner') value = (params[0] as { to: string }).to.toLowerCase() === bridge.toLowerCase() ? recipient : bridge;
      else if (call.name === 'sergToken') value = token;
      else if (call.name === 'paused') value = false;
      else if (call.name === 'processedPegIns') value = call.args[0] === input.firstProof.mintIdentityHex ? firstMinted : secondMinted;
      else if (call.name === 'allowance') value = at === 2 ? 0n : at === 3 ? input.burnGrossAmountNanoErg
        : at < 7 ? input.burnGrossAmountNanoErg - 5_000_000n
          : at === 7 ? input.burnGrossAmountNanoErg : input.burnGrossAmountNanoErg - 5_000_000n;
      else if (call.name === 'accumulatedFees') value = at >= 8 ? 10_000_000n : at >= 4 ? 5_000_000n : 0n;
      else if (call.name === 'balanceOf' && call.args[0].toLowerCase() === bridge.toLowerCase()) value = at >= 8 ? 10_000_000n : at >= 4 ? 5_000_000n : 0n;
      else if (call.name === 'totalSupply') value = at >= 8
        ? input.mintAmountNanoErg * 2n - (input.burnGrossAmountNanoErg - 5_000_000n) * 2n
        : at >= 6 ? input.mintAmountNanoErg * 2n - (input.burnGrossAmountNanoErg - 5_000_000n)
          : at >= 4 ? input.mintAmountNanoErg - (input.burnGrossAmountNanoErg - 5_000_000n)
            : firstMinted ? input.mintAmountNanoErg : 0n;
      else value = at >= 8
        ? input.mintAmountNanoErg * 2n - input.burnGrossAmountNanoErg * 2n
        : at >= 6 ? input.mintAmountNanoErg * 2n - input.burnGrossAmountNanoErg
          : at >= 4 ? input.mintAmountNanoErg - input.burnGrossAmountNanoErg
            : firstMinted ? input.mintAmountNanoErg : 0n;
      result = abi.encodeFunctionResult(call.name, [value]);
    } else if (method === 'eth_getTransactionReceipt') {
      const at = transactionHashes.indexOf(String(params[0]));
      const proof = at === 2 ? input.firstProof : currentProof!;
      const logs = at === 2 || at === 6
        ? [{ address: token, ...abi.encodeEventLog(abi.getEvent('Transfer')!, [`0x${'00'.repeat(20)}`, recipient, input.mintAmountNanoErg]) },
          { address: bridge, ...abi.encodeEventLog(abi.getEvent('PegIn')!, [recipient, input.mintAmountNanoErg, proof.mintIdentityHex]) }]
        : at === 3 || at === 7
          ? [{ address: token, ...abi.encodeEventLog(abi.getEvent('Approval')!, [recipient, bridge, input.burnGrossAmountNanoErg]) }]
          : [{ address: token, ...abi.encodeEventLog(abi.getEvent('Transfer')!, [recipient, `0x${'00'.repeat(20)}`,
            input.burnGrossAmountNanoErg - 5_000_000n]) },
          { address: token, ...abi.encodeEventLog(abi.getEvent('Transfer')!, [recipient, bridge, 5_000_000n]) },
          { address: bridge, ...abi.encodeEventLog(abi.getEvent('PegOut')!, [recipient,
            input.burnGrossAmountNanoErg - 5_000_000n, ergoRecipient]) }];
      result = { transactionHash: params[0], blockHash: ethBlocks[at], blockNumber: `0x${at}`,
        transactionIndex: '0x0', status: '0x1', from: recipient, to: at === 3 || at === 7 ? token : bridge,
        logs: logs.map((log, index) => ({ ...log, transactionHash: params[0], blockHash: ethBlocks[at],
          blockNumber: `0x${at}`, transactionIndex: '0x0', logIndex: `0x${index}`, removed: false })) };
    } else throw new Error(`unexpected native continuation RPC fixture method ${method}`);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
  };

  return Object.freeze({
    fetch,
    expectedGenesisHashHex,
    expectedStorage: Object.freeze({ ...expectedStorage }),
    nativeBlocks,
    ethBlocks,
    calls,
    attachCurrentProof(proof: NativeProof) {
      if (currentProof !== undefined) throw new Error('native continuation RPC fixture current proof is already attached');
      currentProof = proof;
      currentKeys = derivePooledReserveMintReservationRuntimeStorageKeysV4(proof.mintIdentityHex);
      currentPendingScaleHex = pending(proof, '5');
      return currentPendingScaleHex;
    },
    snapshot() {
      return Object.freeze({ height, transactionHashes: Object.freeze([...transactionHashes]),
        firstConsumedScaleHex, currentConsumedScaleHex, currentPendingScaleHex });
    },
  });
}
