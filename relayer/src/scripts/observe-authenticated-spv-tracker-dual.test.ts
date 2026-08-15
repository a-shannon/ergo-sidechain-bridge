import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, expect, it, vi } from 'vitest';

import {
  parseAuthenticatedSpvTrackerDualObservationArgs,
  runAuthenticatedSpvTrackerDualObservationCli,
} from './observe-authenticated-spv-tracker-dual.js';
import type {
  AuthenticatedSpvTrackerNodeSource,
} from '../authenticated-spv-tracker-read-only-node-client.js';
import {
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
} from '../ergo-encoding.js';
import {
  encodeAuthenticatedSpvTrackerAvlRegister,
  getAuthenticatedSpvTrackerDigest,
} from '../spv-tracker-authenticated.js';

const SIDECHAIN_ID = '11'.repeat(32);
const TRACKER_NFT_ID = '12'.repeat(32);
const TRACKER_TREE = `1008cd02${'13'.repeat(32)}`;
const TRACKER_BOX_ID = '21'.repeat(32);
const FINALITY_ATTESTOR =
  '08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

function emptyTrackerSource(): AuthenticatedSpvTrackerNodeSource {
  const box = {
    boxId: TRACKER_BOX_ID,
    transactionId: '22'.repeat(32),
    index: 0,
    inclusionHeight: 100,
    ergoTree: TRACKER_TREE,
    assets: [{ tokenId: TRACKER_NFT_ID, amount: 1 }],
    additionalRegisters: {
      R4: encodeLongRegister(0),
      R5: encodeAuthenticatedSpvTrackerAvlRegister(getAuthenticatedSpvTrackerDigest([])),
      R6: encodeCollByteRegister(Buffer.from(SIDECHAIN_ID, 'hex')),
      R7: encodeLongRegister(0),
      R8: encodeIntRegister(0),
      R9: FINALITY_ATTESTOR,
    },
    spentTransactionId: null,
    spendingProof: null,
  };
  return {
    getInfo: vi.fn(async () => ({ network: 'testnet' })),
    getIndexedHeight: vi.fn(async () => ({ indexedHeight: 120, fullHeight: 120 })),
    getBestHeader: vi.fn(async () => ({
      id: '31'.repeat(32),
      parentId: '32'.repeat(32),
      height: 120,
      extensionHash: '33'.repeat(32),
    })),
    getIndexedBoxesByTokenId: vi.fn(async () => [box]),
    getTransaction: vi.fn(async () => null),
    getBlockHeaderById: vi.fn(async () => null),
    getBoxByIdOrNull: vi.fn(async (boxId: string) => boxId === TRACKER_BOX_ID ? box : null),
  };
}

describe('authenticated tracker dual-source observation CLI', () => {
  it('parses the complete explicit non-mainnet request', () => {
    expect(parseAuthenticatedSpvTrackerDualObservationArgs([
      '--environment', 'testnet',
      '--primary-node-url', 'http://127.0.0.1:9053',
      '--witness-node-url', 'http://127.0.0.1:9054',
      '--tracker-nft-id', '11'.repeat(32),
      '--tracker-genesis-box-id', '33'.repeat(32),
      '--tracker-ergo-tree', '10010100d17300',
      '--sidechain-id', '22'.repeat(32),
      '--out', '../evidence/trustless-burn/artifacts/dual-observation.json',
    ])).toEqual({
      environment: 'testnet',
      primaryNodeUrl: 'http://127.0.0.1:9053',
      witnessNodeUrl: 'http://127.0.0.1:9054',
      trackerNftId: '11'.repeat(32),
      trackerGenesisBoxId: '33'.repeat(32),
      trackerErgoTree: '10010100d17300',
      sidechainId: '22'.repeat(32),
      out: '../evidence/trustless-burn/artifacts/dual-observation.json',
      help: false,
      errors: [],
    });
  });

  it('rejects missing, duplicate, and unknown arguments without reading defaults', () => {
    const parsed = parseAuthenticatedSpvTrackerDualObservationArgs([
      '--environment', 'testnet',
      '--environment', 'devnet',
      '--unknown', 'value',
    ]);

    expect(parsed.errors).toEqual(expect.arrayContaining([
      '--environment may be provided only once',
      'unknown option: --unknown',
      'unknown option: value',
      '--primary-node-url is required',
      '--witness-node-url is required',
      '--tracker-nft-id is required',
      '--tracker-genesis-box-id is required',
      '--tracker-ergo-tree is required',
      '--sidechain-id is required',
      '--out is required',
    ]));
  });

  it('shows help without requiring operational arguments', () => {
    expect(parseAuthenticatedSpvTrackerDualObservationArgs(['--help'])).toEqual({
      help: true,
      errors: [],
    });
  });

  it('writes one validated repository-local report and refuses to overwrite it', async () => {
    const bridgeRoot = mkdtempSync(join(tmpdir(), 'wp06-dual-observe-'));
    const output = join(bridgeRoot, 'evidence', 'dual-observation.json');
    const argv = [
      '--environment', 'testnet',
      '--primary-node-url', 'http://127.0.0.1:9053',
      '--witness-node-url', 'http://127.0.0.1:9054',
      '--tracker-nft-id', TRACKER_NFT_ID,
      '--tracker-genesis-box-id', TRACKER_BOX_ID,
      '--tracker-ergo-tree', TRACKER_TREE,
      '--sidechain-id', SIDECHAIN_ID,
      '--out', 'evidence/dual-observation.json',
    ];
    const sources = [emptyTrackerSource(), emptyTrackerSource()];
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await runAuthenticatedSpvTrackerDualObservationCli(argv, {
        cwd: bridgeRoot,
        bridgeRoot,
        createSource: () => sources.shift()!,
        now: () => new Date('2026-07-14T12:00:00.000Z'),
      });

      expect(existsSync(output)).toBe(true);
      const report = JSON.parse(readFileSync(output, 'utf8'));
      expect(report).toEqual(expect.objectContaining({
        status: 'AGREED',
        entries: [],
        boundary: expect.objectContaining({
          reportDigestAuthenticatesSource: false,
          gate5Closed: false,
        }),
      }));
      await expect(runAuthenticatedSpvTrackerDualObservationCli(argv, {
        cwd: bridgeRoot,
        bridgeRoot,
        createSource: () => emptyTrackerSource(),
      })).rejects.toThrow(/new file/i);
    } finally {
      log.mockRestore();
      rmSync(bridgeRoot, { recursive: true, force: true });
    }
  });
});
