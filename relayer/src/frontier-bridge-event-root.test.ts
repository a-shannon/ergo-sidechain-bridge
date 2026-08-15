import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { id } from 'ethers';
import { describe, expect, it } from 'vitest';

import {
  FRONTIER_PEG_OUT_TOPIC,
  extractFrontierBridgeEventRoot,
  type FrontierBlockReceiptLike,
  type FrontierBridgeEventRootInput,
  type FrontierReceiptLogLike,
} from './frontier-bridge-event-root.js';

const SIDECHAIN_ID = '11'.repeat(32);
const BLOCK_HASH = '22'.repeat(32);
const BRIDGE = '0x' + 'aa'.repeat(20);
const WRONG_BRIDGE = '0x' + 'bb'.repeat(20);
const USER_A = '0x' + '01'.repeat(20);
const USER_B = '0x' + '02'.repeat(20);
const TX_A = '31'.repeat(32);
const TX_B = '32'.repeat(32);
const TX_C = '33'.repeat(32);
const KEY_A = '02' + '41'.repeat(32);
const KEY_B = '03' + '42'.repeat(32);
const TREE_C = '0008cd02' + '43'.repeat(32);

function uint256Word(value: bigint): string {
  return value.toString(16).padStart(64, '0');
}

function pegOutData(amount: bigint, recipientHex: string): string {
  const recipient = recipientHex.replace(/^0x/, '');
  const paddedRecipient = recipient.padEnd(Math.ceil(recipient.length / 64) * 64, '0');
  return `0x${uint256Word(amount)}${uint256Word(64n)}${uint256Word(BigInt(recipient.length / 2))}${paddedRecipient}`;
}

function pegOutLog(options: {
  index: number;
  address?: string;
  user?: string;
  amount?: bigint;
  recipient?: string;
  topics?: string[];
  data?: string;
}): FrontierReceiptLogLike {
  const user = (options.user ?? USER_A).slice(2).padStart(64, '0');
  return {
    address: options.address ?? BRIDGE,
    topics: options.topics ?? [FRONTIER_PEG_OUT_TOPIC, `0x${user}`],
    data: options.data ?? pegOutData(options.amount ?? 1_000_000n, options.recipient ?? KEY_A),
    index: options.index,
  };
}

function receipt(options: {
  transactionIndex: number;
  transactionHash: string;
  status?: number | string | bigint;
  logs: FrontierReceiptLogLike[];
}): FrontierBlockReceiptLike {
  return {
    transactionIndex: options.transactionIndex,
    transactionHash: `0x${options.transactionHash}`,
    status: options.status ?? 1,
    logs: options.logs,
  };
}

function input(receipts: FrontierBlockReceiptLike[], maxBurns = 10): FrontierBridgeEventRootInput {
  return {
    sidechainIdHex: SIDECHAIN_ID,
    executionBlockHashHex: BLOCK_HASH,
    bridgeAddress: BRIDGE,
    maxBurns,
    receipts,
  };
}

describe('canonical Frontier bridge event root extraction', () => {
  it('uses the exact frozen PegOut topic', () => {
    expect(FRONTIER_PEG_OUT_TOPIC).toBe(id('PegOut(address,uint256,bytes)').toLowerCase());
  });

  it('orders receipts and logs canonically while counting every log globally', () => {
    const result = extractFrontierBridgeEventRoot(input([
      receipt({
        transactionIndex: 3,
        transactionHash: TX_C,
        logs: [
          pegOutLog({ index: 5, user: USER_B, amount: 3_000_000n, recipient: TREE_C }),
        ],
      }),
      receipt({
        transactionIndex: 0,
        transactionHash: TX_A,
        logs: [
          pegOutLog({ index: 1, amount: 1_000_000n, recipient: KEY_A }),
          pegOutLog({ index: 0, address: WRONG_BRIDGE }),
        ],
      }),
      receipt({
        transactionIndex: 1,
        transactionHash: TX_B,
        status: 0,
        logs: [pegOutLog({ index: 2, amount: 9_000_000n, recipient: KEY_B })],
      }),
      receipt({
        transactionIndex: 2,
        transactionHash: '34'.repeat(32),
        logs: [
          pegOutLog({ index: 4, topics: ['0x' + '99'.repeat(32)] }),
          pegOutLog({ index: 3, amount: 2_000_000n, recipient: KEY_B }),
        ],
      }),
    ]));

    expect(result.burns.map(burn => ({
      transactionIndex: burn.transactionIndex,
      logIndex: burn.logIndex,
      eventIndex: burn.eventIndex,
      amountNanoErg: burn.amountNanoErg,
      recipientErgoTreeHex: burn.recipientErgoTreeHex,
    }))).toEqual([
      { transactionIndex: 0, logIndex: 1, eventIndex: 1, amountNanoErg: '1000000', recipientErgoTreeHex: `0008cd${KEY_A}` },
      { transactionIndex: 2, logIndex: 3, eventIndex: 3, amountNanoErg: '2000000', recipientErgoTreeHex: `0008cd${KEY_B}` },
      { transactionIndex: 3, logIndex: 5, eventIndex: 5, amountNanoErg: '3000000', recipientErgoTreeHex: TREE_C },
    ]);
    expect(result.commitment?.leaves.map(leaf => leaf.eventIndex)).toEqual([1, 3, 5]);
    expect(result.commitment?.leaves).toHaveLength(3);
    expect(result.commitment?.bridgeEventRootHex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns no commitment when the block has zero valid burns', () => {
    const result = extractFrontierBridgeEventRoot(input([
      receipt({
        transactionIndex: 0,
        transactionHash: TX_A,
        logs: [pegOutLog({ index: 0, address: WRONG_BRIDGE })],
      }),
      receipt({
        transactionIndex: 1,
        transactionHash: TX_B,
        status: '0x0',
        logs: [pegOutLog({ index: 1 })],
      }),
    ]));

    expect(result).toEqual({ burns: [], commitment: null });
  });

  it('rejects malformed matching topics and non-canonical indexed addresses', () => {
    expect(() => extractFrontierBridgeEventRoot(input([
      receipt({
        transactionIndex: 0,
        transactionHash: TX_A,
        logs: [pegOutLog({ index: 0, topics: [FRONTIER_PEG_OUT_TOPIC] })],
      }),
    ]))).toThrow(/exactly 2 topics/);

    expect(() => extractFrontierBridgeEventRoot(input([
      receipt({
        transactionIndex: 0,
        transactionHash: TX_A,
        logs: [pegOutLog({
          index: 0,
          topics: [FRONTIER_PEG_OUT_TOPIC, '0x' + '01'.repeat(32)],
        })],
      }),
    ]))).toThrow(/zero-padded indexed address/);
  });

  it('rejects non-canonical ABI offset, length, padding, and trailing data', () => {
    const canonical = pegOutData(1n, KEY_A).slice(2);
    const cases = [
      `${canonical.slice(0, 64)}${uint256Word(96n)}${canonical.slice(128)}`,
      `${canonical.slice(0, 128)}${uint256Word(34n)}${canonical.slice(192)}`,
      `${canonical.slice(0, -2)}01`,
      `${canonical}00`,
    ];

    for (const data of cases) {
      expect(() => extractFrontierBridgeEventRoot(input([
        receipt({
          transactionIndex: 0,
          transactionHash: TX_A,
          logs: [pegOutLog({ index: 0, data: `0x${data}` })],
        }),
      ]))).toThrow(/PegOut ABI data/);
    }
  });

  it('rejects zero and amounts above the Ergo Long domain', () => {
    for (const amount of [0n, 1n << 63n]) {
      expect(() => extractFrontierBridgeEventRoot(input([
        receipt({
          transactionIndex: 0,
          transactionHash: TX_A,
          logs: [pegOutLog({ index: 0, amount })],
        }),
      ]))).toThrow(/amount/);
    }
  });

  it('rejects missing or non-binary receipt status', () => {
    for (const status of [undefined, null, 2, '0x2']) {
      expect(() => extractFrontierBridgeEventRoot(input([{
        transactionIndex: 0,
        transactionHash: `0x${TX_A}`,
        status,
        logs: [],
      }]))).toThrow(/status must be exactly 0 or 1/);
    }
  });

  it('rejects recipient payloads outside the compressed-key and canonical-tree forms', () => {
    for (const recipient of [
      '04' + '41'.repeat(32),
      '0008cd04' + '42'.repeat(32),
      '0009cd02' + '43'.repeat(32),
    ]) {
      expect(() => extractFrontierBridgeEventRoot(input([
        receipt({
          transactionIndex: 0,
          transactionHash: TX_A,
          logs: [pegOutLog({ index: 0, recipient })],
        }),
      ]))).toThrow(/recipient/);
    }
  });

  it('rejects duplicate canonical receipt and log identities', () => {
    expect(() => extractFrontierBridgeEventRoot(input([
      receipt({ transactionIndex: 0, transactionHash: TX_A, logs: [] }),
      receipt({ transactionIndex: 1, transactionHash: TX_A, logs: [] }),
    ]))).toThrow(/duplicate transaction hash/);

    expect(() => extractFrontierBridgeEventRoot(input([
      receipt({
        transactionIndex: 0,
        transactionHash: TX_A,
        logs: [pegOutLog({ index: 0 }), pegOutLog({ index: 0 })],
      }),
    ]))).toThrow(/duplicate log index/);
  });

  it('rejects omitted receipt or log indexes that would shift global eventIndex', () => {
    expect(() => extractFrontierBridgeEventRoot(input([
      receipt({ transactionIndex: 0, transactionHash: TX_A, logs: [] }),
      receipt({ transactionIndex: 2, transactionHash: TX_B, logs: [] }),
    ]))).toThrow(/contiguous from zero/);

    expect(() => extractFrontierBridgeEventRoot(input([
      receipt({
        transactionIndex: 0,
        transactionHash: TX_A,
        logs: [pegOutLog({ index: 0 }), pegOutLog({ index: 2, recipient: KEY_B })],
      }),
    ]))).toThrow(/contiguous from zero/);
  });

  it('accepts canonical Frontier JSON-RPC quantity indexes', () => {
    const result = extractFrontierBridgeEventRoot(input([{
      transactionIndex: '0x0',
      transactionHash: `0x${TX_A}`,
      status: '0x1',
      logs: [{ ...pegOutLog({ index: 0 }), index: undefined, logIndex: '0x0' }],
    }]));

    expect(result.burns).toHaveLength(1);
    expect(result.burns[0]).toMatchObject({ transactionIndex: 0, logIndex: 0, eventIndex: 0 });
  });

  it('rejects blocks with more valid burns than maxBurns', () => {
    expect(() => extractFrontierBridgeEventRoot(input([
      receipt({
        transactionIndex: 0,
        transactionHash: TX_A,
        logs: [pegOutLog({ index: 0 }), pegOutLog({ index: 1, recipient: KEY_B })],
      }),
    ], 1))).toThrow(/maxBurns/);
  });

  it('validates the checked-in odd-width vector and prints bounded claims', () => {
    const vector = JSON.parse(readFileSync(
      join(process.cwd(), 'test-vectors', 'frontier-bridge-event-root-v1.json'),
      'utf8',
    ));
    const extracted = extractFrontierBridgeEventRoot(vector.input);

    expect(extracted.burns).toHaveLength(3);
    expect(extracted.commitment?.bridgeEventRootHex).toBe(vector.expected.bridgeEventRootHex);
    expect(extracted.commitment?.leaves.map(leaf => leaf.leafHashHex)).toEqual(vector.expected.leafHashHexes);

    const cli = spawnSync(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'src/scripts/validate-frontier-bridge-event-root-vector.ts'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    expect(cli.status).toBe(0);
    expect(cli.stderr).toBe('');
    expect(cli.stdout).toContain('Frontier bridge event root vector: PASS');
    expect(cli.stdout).toContain('read-only');
    expect(cli.stdout).toContain('does not prove finality');
    expect(cli.stdout).toContain('does not prove on-chain acceptance');
    expect(cli.stdout).toContain('does not prove Gate 5 closure');
  });
});
