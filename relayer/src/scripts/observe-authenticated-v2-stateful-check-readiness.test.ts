import { createECDH } from 'crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, expect, it, vi } from 'vitest';

import {
  parseAuthenticatedV2StatefulCheckReadinessArgs,
  runAuthenticatedV2StatefulCheckReadinessCli,
} from './observe-authenticated-v2-stateful-check-readiness.js';
import { validateAuthenticatedV2StatefulCheckReadinessReport } from '../authenticated-v2-stateful-check-readiness.js';
import type { AuthenticatedSpvTrackerNodeSource } from '../authenticated-spv-tracker-read-only-node-client.js';
import {
  EMPTY_AVL_DIGEST,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
} from '../ergo-encoding.js';
import {
  encodeAuthenticatedSpvTrackerAvlRegister,
  getAuthenticatedSpvTrackerDigest,
} from '../spv-tracker-authenticated.js';

const SIDECHAIN_ID = '11'.repeat(32);
const TRACKER_NFT_ID = '12'.repeat(32);
const TRACKER_TREE = `1008cd02${'13'.repeat(32)}`;
const DUP_NFT_ID = '23'.repeat(32);
const DUP_TREE = `1008cd02${'24'.repeat(32)}`;
const VAULT_TREE = `1008cd02${'26'.repeat(32)}`;
const importedWasm: any = await import('ergo-lib-wasm-nodejs');
const TEST_WASM = importedWasm.default ?? importedWasm;

function sigmaProp(privateKeyByte: number): string {
  const ecdh = createECDH('secp256k1');
  const key = Buffer.alloc(32);
  key[31] = privateKeyByte;
  ecdh.setPrivateKey(key);
  return encodeSigmaPropRegister(ecdh.getPublicKey(undefined, 'compressed').toString('hex'));
}

function materializeBox(input: {
  transactionId: string;
  index: number;
  creationHeight: number;
  value: number;
  ergoTree: string;
  assets: Array<{ tokenId: string; amount: number }>;
  additionalRegisters: Record<string, string>;
}): any {
  const value = TEST_WASM.BoxValue.from_i64(TEST_WASM.I64.from_str(String(input.value)));
  const tree = TEST_WASM.ErgoTree.from_base16_bytes(input.ergoTree);
  const contract = TEST_WASM.Contract.new(tree);
  const builder = new TEST_WASM.ErgoBoxCandidateBuilder(value, contract, input.creationHeight);
  try {
    for (const asset of input.assets) {
      builder.add_token(
        TEST_WASM.TokenId.from_str(asset.tokenId),
        TEST_WASM.TokenAmount.from_i64(TEST_WASM.I64.from_str(String(asset.amount))),
      );
    }
    for (const [name, encoded] of Object.entries(input.additionalRegisters)) {
      builder.set_register_value(
        TEST_WASM.NonMandatoryRegisterId[name],
        TEST_WASM.Constant.decode_from_base16(encoded),
      );
    }
    const candidate = builder.build();
    const transactionId = TEST_WASM.TxId.from_str(input.transactionId);
    const box = TEST_WASM.ErgoBox.from_box_candidate(candidate, transactionId, input.index);
    try {
      return box.to_js_eip12();
    } finally {
      box.free?.();
      transactionId.free?.();
      candidate.free?.();
    }
  } finally {
    builder.free?.();
  }
}

const TRACKER_TEMPLATE = materializeBox({
  transactionId: '41'.repeat(32),
  index: 0,
  creationHeight: 100,
  value: 2_000_000,
  ergoTree: TRACKER_TREE,
  assets: [{ tokenId: TRACKER_NFT_ID, amount: 1 }],
  additionalRegisters: {
    R4: encodeLongRegister(0),
    R5: encodeAuthenticatedSpvTrackerAvlRegister(getAuthenticatedSpvTrackerDigest([])),
    R6: encodeCollByteRegister(Buffer.from(SIDECHAIN_ID, 'hex')),
    R7: encodeLongRegister(0),
    R8: encodeIntRegister(0),
    R9: sigmaProp(1),
  },
});
const DUP_TEMPLATE = materializeBox({
  transactionId: '42'.repeat(32),
  index: 1,
  creationHeight: 101,
  value: 2_000_000,
  ergoTree: DUP_TREE,
  assets: [{ tokenId: DUP_NFT_ID, amount: 1 }],
  additionalRegisters: {
    R4: encodeLongRegister(0),
    R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
    R6: sigmaProp(2),
  },
});
const VAULT_TEMPLATE = materializeBox({
  transactionId: '43'.repeat(32),
  index: 2,
  creationHeight: 101,
  value: 5_000_000,
  ergoTree: VAULT_TREE,
  assets: [],
  additionalRegisters: {
    R4: encodeCollByteRegister(Buffer.from('51'.repeat(32), 'hex')),
    R5: encodeCollByteRegister(Buffer.from('52'.repeat(20), 'hex')),
    R6: encodeLongRegister(3_100_000),
    R7: encodeCollByteRegister(Buffer.from(`1008cd02${'53'.repeat(32)}`, 'hex')),
  },
});
const TRACKER_BOX_ID = TRACKER_TEMPLATE.boxId;
const DUP_BOX_ID = DUP_TEMPLATE.boxId;
const VAULT_BOX_ID = VAULT_TEMPLATE.boxId;

async function binaryResponse(box: any): Promise<{ bytes: string }> {
  const parsed = TEST_WASM.ErgoBox.from_json(JSON.stringify(box));
  try {
    return { bytes: Buffer.from(parsed.sigma_serialize_bytes()).toString('hex') };
  } finally {
    parsed.free?.();
  }
}

function nodeSource(): AuthenticatedSpvTrackerNodeSource {
  const tracker = {
    ...structuredClone(TRACKER_TEMPLATE),
    inclusionHeight: 100,
    spentTransactionId: null,
    spendingProof: null,
  };
  const dup = {
    ...structuredClone(DUP_TEMPLATE),
    spentTransactionId: null,
    spendingProof: null,
  };
  const vault = {
    ...structuredClone(VAULT_TEMPLATE),
    spentTransactionId: null,
    spendingProof: null,
  };
  return {
    beginAuthenticatedTrackerReconstruction: vi.fn(),
    endAuthenticatedTrackerReconstruction: vi.fn(),
    getInfo: vi.fn(async () => ({ network: 'testnet' })),
    getIndexedHeight: vi.fn(async () => ({ indexedHeight: 120, fullHeight: 120 })),
    getBestHeader: vi.fn(async () => ({
      id: '31'.repeat(32),
      parentId: '32'.repeat(32),
      height: 120,
      extensionHash: '33'.repeat(32),
    })),
    getIndexedBoxesByTokenId: vi.fn(async () => [tracker]),
    getTransaction: vi.fn(async () => null),
    getBlockHeaderById: vi.fn(async () => null),
    getBoxByIdOrNull: vi.fn(async (boxId: string) => {
      if (boxId === TRACKER_BOX_ID) return tracker;
      if (boxId === DUP_BOX_ID) return dup;
      if (boxId === VAULT_BOX_ID) return vault;
      return null;
    }),
    getBoxBinaryByIdOrNull: vi.fn(async (boxId: string) => {
      if (boxId === TRACKER_BOX_ID) return binaryResponse(tracker);
      if (boxId === DUP_BOX_ID) return binaryResponse(dup);
      if (boxId === VAULT_BOX_ID) return binaryResponse(vault);
      return null;
    }),
  };
}

function argv(out = 'evidence/stateful-check-readiness.json'): string[] {
  return [
    '--environment', 'testnet',
    '--primary-node-url', 'http://127.0.0.1:9053',
    '--witness-node-url', 'http://127.0.0.1:9054',
    '--tracker-nft-id', TRACKER_NFT_ID,
    '--tracker-genesis-box-id', TRACKER_BOX_ID,
    '--tracker-ergo-tree', TRACKER_TREE,
    '--sidechain-id', SIDECHAIN_ID,
    '--dup-box-id', DUP_BOX_ID,
    '--dup-nft-id', DUP_NFT_ID,
    '--dup-ergo-tree', DUP_TREE,
    '--vault-box-id', VAULT_BOX_ID,
    '--vault-ergo-tree', VAULT_TREE,
    '--burn-id', '27'.repeat(32),
    '--payout-amount-nanoerg', '3100000',
    '--miner-fee-nanoerg', '1100000',
    '--out', out,
  ];
}

describe('authenticated V2 stateful-check readiness CLI', () => {
  it('parses every operational input explicitly and keeps output path CLI-only', () => {
    expect(parseAuthenticatedV2StatefulCheckReadinessArgs(argv())).toEqual({
      environment: 'testnet',
      primaryNodeUrl: 'http://127.0.0.1:9053',
      witnessNodeUrl: 'http://127.0.0.1:9054',
      trackerNftId: TRACKER_NFT_ID,
      trackerGenesisBoxId: TRACKER_BOX_ID,
      trackerErgoTree: TRACKER_TREE,
      sidechainId: SIDECHAIN_ID,
      duplicatePreventionBoxId: DUP_BOX_ID,
      duplicatePreventionNftId: DUP_NFT_ID,
      duplicatePreventionErgoTree: DUP_TREE,
      vaultBoxId: VAULT_BOX_ID,
      vaultErgoTree: VAULT_TREE,
      burnId: '27'.repeat(32),
      payoutAmountNanoErg: '3100000',
      minerFeeNanoErg: '1100000',
      out: 'evidence/stateful-check-readiness.json',
      help: false,
      errors: [],
    });
  });

  it('rejects missing, duplicate, and unknown arguments without reading defaults', () => {
    const parsed = parseAuthenticatedV2StatefulCheckReadinessArgs([
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
      '--dup-box-id is required',
      '--dup-nft-id is required',
      '--dup-ergo-tree is required',
      '--vault-box-id is required',
      '--vault-ergo-tree is required',
      '--burn-id is required',
      '--payout-amount-nanoerg is required',
      '--miner-fee-nanoerg is required',
      '--out is required',
    ]));
  });

  it('shows help without requiring operational arguments', () => {
    expect(parseAuthenticatedV2StatefulCheckReadinessArgs(['--help'])).toEqual({
      help: true,
      errors: [],
    });
  });

  it('writes one validated repository-local report with wx and prints the bounded claim', async () => {
    const bridgeRoot = mkdtempSync(join(tmpdir(), 'wp06-stateful-readiness-'));
    const output = join(bridgeRoot, 'evidence', 'stateful-check-readiness.json');
    const sources = [nodeSource(), nodeSource()];
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await runAuthenticatedV2StatefulCheckReadinessCli(argv(), {
        cwd: bridgeRoot,
        bridgeRoot,
        createSource: () => sources.shift()!,
        now: () => new Date('2026-07-14T14:00:00.000Z'),
      });

      expect(existsSync(output)).toBe(true);
      const report = await validateAuthenticatedV2StatefulCheckReadinessReport(
        JSON.parse(readFileSync(output, 'utf8')),
      );
      expect(report.status).toBe('AGREED');
      expect(report.duplicatePrevention.box.boxIdHex).toBe(DUP_BOX_ID);
      expect(report.vault.box.boxIdHex).toBe(VAULT_BOX_ID);
      expect(log.mock.calls.flat().join('\n')).toMatch(/R9 remains.*Gate 5 remains open.*not production-ready/i);

      await expect(runAuthenticatedV2StatefulCheckReadinessCli(argv(), {
        cwd: bridgeRoot,
        bridgeRoot,
        createSource: () => nodeSource(),
      })).rejects.toThrow(/new file/i);
    } finally {
      log.mockRestore();
      rmSync(bridgeRoot, { recursive: true, force: true });
    }
  });
});
