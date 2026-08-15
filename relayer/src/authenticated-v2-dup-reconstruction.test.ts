import { createECDH } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import { insertLockRecord } from './avl-bridge.js';
import {
  assertAuthenticatedV2DupReconstructionProvenance,
  reconstructAuthenticatedV2DupHistory,
  reconstructAuthenticatedV2DupHistoryFromDistinctSources,
  type AuthenticatedV2DupChainSource,
} from './authenticated-v2-dup-reconstruction.js';
import {
  EMPTY_AVL_DIGEST,
  MINER_FEE_TREE,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
} from './ergo-encoding.js';
import { StateTracker } from './state-tracker.js';

const importedWasm: any = await import('ergo-lib-wasm-nodejs');
const TEST_WASM = importedWasm.default ?? importedWasm;

const DUP_NFT_ID = '11'.repeat(32);
const DUP_TREE = `1008cd02${'12'.repeat(32)}`;
const PAYOUT_TREE = `1008cd02${'13'.repeat(32)}`;
const TRACKER_BOX_ID = '14'.repeat(32);
const VAULT_BOX_ID = '15'.repeat(32);
const SETUP_TX_ID = '21'.repeat(32);
const SETTLEMENT_TX_ID = '22'.repeat(32);
const SETUP_BLOCK_ID = '31'.repeat(32);
const SETTLEMENT_BLOCK_ID = '32'.repeat(32);
const BEST_HEADER_ID = '41'.repeat(32);
const BEST_PARENT_ID = '42'.repeat(32);
const EXTENSION_ROOT = '43'.repeat(32);
const BURN_ID = '51'.repeat(32);
const AUTHORITY = sigmaProp(7);
const DUP_IDENTITY = Object.freeze({
  duplicatePreventionNftIdHex: DUP_NFT_ID,
  duplicatePreventionErgoTreeHex: DUP_TREE,
});

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
  assets?: Array<{ tokenId: string; amount: number }>;
  additionalRegisters?: Record<string, string>;
}): any {
  const value = TEST_WASM.BoxValue.from_i64(TEST_WASM.I64.from_str(String(input.value)));
  const tree = TEST_WASM.ErgoTree.from_base16_bytes(input.ergoTree);
  const contract = TEST_WASM.Contract.new(tree);
  const builder = new TEST_WASM.ErgoBoxCandidateBuilder(value, contract, input.creationHeight);
  try {
    for (const asset of input.assets ?? []) {
      builder.add_token(
        TEST_WASM.TokenId.from_str(asset.tokenId),
        TEST_WASM.TokenAmount.from_i64(TEST_WASM.I64.from_str(String(asset.amount))),
      );
    }
    for (const [name, encoded] of Object.entries(input.additionalRegisters ?? {})) {
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

async function binaryResponse(box: any): Promise<{ bytes: string }> {
  const parsed = TEST_WASM.ErgoBox.from_json(JSON.stringify(box));
  try {
    return { bytes: Buffer.from(parsed.sigma_serialize_bytes()).toString('hex') };
  } finally {
    parsed.free?.();
  }
}

interface Fixture {
  source: AuthenticatedV2DupChainSource;
  root: any;
  tip: any;
  setup: any;
  settlement: any;
  currentTip: any;
  proof: ReturnType<typeof insertLockRecord>;
}

function fixture(): Fixture {
  const proof = insertLockRecord([], BURN_ID);
  const context = {
    '0': encodeCollByteRegister(Buffer.from(proof.lookup_proof_hex, 'hex')),
    '1': encodeCollByteRegister(Buffer.from(BURN_ID, 'hex')),
    '2': encodeCollByteRegister(Buffer.from(proof.insert_proof_hex, 'hex')),
  };
  const rootTemplate = materializeBox({
    transactionId: SETUP_TX_ID,
    index: 0,
    creationHeight: 100,
    value: 2_000_000,
    ergoTree: DUP_TREE,
    assets: [{ tokenId: DUP_NFT_ID, amount: 1 }],
    additionalRegisters: {
      R4: encodeLongRegister(0),
      R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
      R6: AUTHORITY,
    },
  });
  const tipTemplate = materializeBox({
    transactionId: SETTLEMENT_TX_ID,
    index: 0,
    creationHeight: 101,
    value: 2_000_000,
    ergoTree: DUP_TREE,
    assets: [{ tokenId: DUP_NFT_ID, amount: 1 }],
    additionalRegisters: {
      R4: encodeLongRegister(1),
      R5: encodeAvlTreeRegister(Buffer.from(proof.new_digest_hex, 'hex'), 0x0b, 1),
      R6: AUTHORITY,
    },
  });
  const setupVault = materializeBox({
    transactionId: SETUP_TX_ID,
    index: 1,
    creationHeight: 100,
    value: 5_000_000,
    ergoTree: PAYOUT_TREE,
  });
  const payout = materializeBox({
    transactionId: SETTLEMENT_TX_ID,
    index: 1,
    creationHeight: 101,
    value: 3_900_000,
    ergoTree: PAYOUT_TREE,
  });
  const fee = materializeBox({
    transactionId: SETTLEMENT_TX_ID,
    index: 2,
    creationHeight: 101,
    value: 1_100_000,
    ergoTree: MINER_FEE_TREE,
  });
  const root = {
    ...structuredClone(rootTemplate),
    inclusionHeight: 100,
    spentTransactionId: SETTLEMENT_TX_ID,
    spendingProof: { proofBytes: '', extension: { ...context } },
  };
  const tip = {
    ...structuredClone(tipTemplate),
    inclusionHeight: 101,
    spentTransactionId: null,
    spendingProof: null,
  };
  const setup = {
    id: SETUP_TX_ID,
    blockId: SETUP_BLOCK_ID,
    inclusionHeight: 100,
    inputs: [{ boxId: DUP_NFT_ID, spendingProof: { proofBytes: '', extension: {} } }],
    dataInputs: [],
    outputs: [structuredClone(rootTemplate), setupVault],
  };
  const settlement = {
    id: SETTLEMENT_TX_ID,
    blockId: SETTLEMENT_BLOCK_ID,
    inclusionHeight: 101,
    inputs: [
      { boxId: rootTemplate.boxId, spendingProof: { proofBytes: '', extension: { ...context } } },
      { boxId: VAULT_BOX_ID, spendingProof: { proofBytes: '', extension: {} } },
    ],
    dataInputs: [{ boxId: TRACKER_BOX_ID }],
    outputs: [structuredClone(tipTemplate), payout, fee],
  };
  const currentTip = structuredClone(tipTemplate);
  const source: AuthenticatedV2DupChainSource = {
    observationSourceId: 'fixture://primary',
    async getIndexedHeight() {
      return { indexedHeight: 120, fullHeight: 120 };
    },
    async getBestHeader() {
      return {
        id: BEST_HEADER_ID,
        parentId: BEST_PARENT_ID,
        height: 120,
        extensionRoot: EXTENSION_ROOT,
      };
    },
    async getIndexedBoxesByTokenId() {
      return [structuredClone(root), structuredClone(tip)];
    },
    async getTransaction(txId: string) {
      if (txId === SETUP_TX_ID) return structuredClone(setup);
      if (txId === SETTLEMENT_TX_ID) return structuredClone(settlement);
      return null;
    },
    async getBlockHeaderById(headerId: string) {
      return headerId === SETTLEMENT_BLOCK_ID ? {
        id: SETTLEMENT_BLOCK_ID,
        parentId: SETUP_BLOCK_ID,
        height: 101,
        extensionRoot: EXTENSION_ROOT,
      } : null;
    },
    async getBoxByIdOrNull(boxId: string) {
      return boxId === currentTip.boxId ? structuredClone(currentTip) : null;
    },
    async getBoxBinaryByIdOrNull(boxId: string) {
      return boxId === currentTip.boxId ? binaryResponse(currentTip) : null;
    },
  };
  return { source, root, tip, setup, settlement, currentTip, proof };
}

function clonedSource(
  f: Fixture,
  observationSourceId = 'fixture://witness',
): AuthenticatedV2DupChainSource {
  return {
    observationSourceId,
    getIndexedHeight: () => f.source.getIndexedHeight(),
    getBestHeader: () => f.source.getBestHeader(),
    getIndexedBoxesByTokenId: id => f.source.getIndexedBoxesByTokenId(id),
    getTransaction: id => f.source.getTransaction(id),
    getBlockHeaderById: id => f.source.getBlockHeaderById(id),
    getBoxByIdOrNull: id => f.source.getBoxByIdOrNull(id),
    getBoxBinaryByIdOrNull: id => f.source.getBoxBinaryByIdOrNull(id),
  };
}

function emptyLineageSource(
  f: Fixture,
  observationSourceId: string,
): AuthenticatedV2DupChainSource {
  const current = structuredClone(f.setup.outputs[0]);
  const indexed = {
    ...structuredClone(current),
    inclusionHeight: 100,
    spentTransactionId: null,
    spendingProof: null,
  };
  return {
    observationSourceId,
    async getIndexedHeight() {
      return { indexedHeight: 120, fullHeight: 120 };
    },
    async getBestHeader() {
      return {
        id: BEST_HEADER_ID,
        parentId: BEST_PARENT_ID,
        height: 120,
        extensionRoot: EXTENSION_ROOT,
      };
    },
    async getIndexedBoxesByTokenId() {
      return [structuredClone(indexed)];
    },
    async getTransaction(txId: string) {
      return txId === SETUP_TX_ID ? structuredClone(f.setup) : null;
    },
    async getBlockHeaderById() {
      return null;
    },
    async getBoxByIdOrNull(boxId: string) {
      return boxId === current.boxId ? structuredClone(current) : null;
    },
    async getBoxBinaryByIdOrNull(boxId: string) {
      return boxId === current.boxId ? binaryResponse(current) : null;
    },
  };
}

describe('authenticated V2 DUP reconstruction', () => {
  it('replays the singleton lineage and brands only agreeing dual-source results', async () => {
    const f = fixture();
    const single = await reconstructAuthenticatedV2DupHistory({
      source: f.source,
      duplicatePreventionNftIdHex: DUP_NFT_ID,
      duplicatePreventionErgoTreeHex: DUP_TREE,
    });
    expect(single.historyKeys).toEqual([BURN_ID]);
    expect(single.tipDigestHex).toBe(f.proof.new_digest_hex);
    expect(single.tipCounter).toBe('1');
    expect(single.transitions).toEqual([
      expect.objectContaining({
        burnIdHex: BURN_ID,
        dupInputBoxIdHex: f.root.boxId,
        dupSuccessorBoxIdHex: f.tip.boxId,
        vaultInputBoxIdHex: VAULT_BOX_ID,
        vaultSuccessorBoxIdHex: null,
      }),
    ]);
    expect(() => assertAuthenticatedV2DupReconstructionProvenance(single as any)).toThrow(
      /provenance is missing/,
    );

    const dual = await reconstructAuthenticatedV2DupHistoryFromDistinctSources({
      primarySource: f.source,
      witnessSource: clonedSource(f),
      duplicatePreventionNftIdHex: DUP_NFT_ID,
      duplicatePreventionErgoTreeHex: DUP_TREE,
    });
    expect(() => assertAuthenticatedV2DupReconstructionProvenance(dual)).not.toThrow();
    expect(dual.observationDigestHex).toBe(single.observationDigestHex);
  });

  it('is deterministic across repeated fresh observations', async () => {
    const first = fixture();
    const second = fixture();
    const left = await reconstructAuthenticatedV2DupHistory({
      source: first.source,
      duplicatePreventionNftIdHex: DUP_NFT_ID,
      duplicatePreventionErgoTreeHex: DUP_TREE,
    });
    const right = await reconstructAuthenticatedV2DupHistory({
      source: second.source,
      duplicatePreventionNftIdHex: DUP_NFT_ID,
      duplicatePreventionErgoTreeHex: DUP_TREE,
    });
    expect(right).toEqual(left);
  });

  it('rejects same-instance or divergent dual observations', async () => {
    const same = fixture();
    await expect(reconstructAuthenticatedV2DupHistoryFromDistinctSources({
      primarySource: same.source,
      witnessSource: same.source,
      duplicatePreventionNftIdHex: DUP_NFT_ID,
      duplicatePreventionErgoTreeHex: DUP_TREE,
    })).rejects.toThrow(/two distinct source identities/);

    await expect(reconstructAuthenticatedV2DupHistoryFromDistinctSources({
      primarySource: same.source,
      witnessSource: clonedSource(same, same.source.observationSourceId),
      duplicatePreventionNftIdHex: DUP_NFT_ID,
      duplicatePreventionErgoTreeHex: DUP_TREE,
    })).rejects.toThrow(/two distinct source identities/);

    const primary = fixture();
    const witness = fixture();
    const original = witness.source.getBestHeader.bind(witness.source);
    witness.source.getBestHeader = async () => ({
      ...await original() as any,
      extensionRoot: '99'.repeat(32),
    });
    await expect(reconstructAuthenticatedV2DupHistoryFromDistinctSources({
      primarySource: primary.source,
      witnessSource: clonedSource(witness, 'fixture://divergent-witness'),
      duplicatePreventionNftIdHex: DUP_NFT_ID,
      duplicatePreventionErgoTreeHex: DUP_TREE,
    })).rejects.toThrow(/reconstructions disagree/);
  });

  it('closes both bounded source sessions when either reconstruction fails', async () => {
    const primary = fixture();
    const witness = clonedSource(fixture(), 'fixture://bounded-witness');
    let primaryEnded = 0;
    let witnessEnded = 0;
    primary.source.beginAuthenticatedTrackerReconstruction = () => {};
    primary.source.endAuthenticatedTrackerReconstruction = () => { primaryEnded += 1; };
    witness.beginAuthenticatedTrackerReconstruction = () => {};
    witness.endAuthenticatedTrackerReconstruction = () => { witnessEnded += 1; };
    primary.source.getIndexedBoxesByTokenId = async () => {
      throw new Error('primary reconstruction failed');
    };

    await expect(reconstructAuthenticatedV2DupHistoryFromDistinctSources({
      primarySource: primary.source,
      witnessSource: witness,
      duplicatePreventionNftIdHex: DUP_NFT_ID,
      duplicatePreventionErgoTreeHex: DUP_TREE,
    })).rejects.toThrow(/primary reconstruction failed/);
    expect(primaryEnded).toBe(1);
    expect(witnessEnded).toBe(1);
  });

  it.each([
    ['wrong setup minting input', (f: Fixture) => {
      f.setup.inputs[0].boxId = '91'.repeat(32);
    }, /NFT id must equal/],
    ['wrong transaction topology', (f: Fixture) => {
      f.settlement.inputs.reverse();
    }, /must be settlement input 0/],
    ['counter drift', (f: Fixture) => {
      f.tip.additionalRegisters.R4 = encodeLongRegister(2);
      f.settlement.outputs[0].additionalRegisters.R4 = f.tip.additionalRegisters.R4;
      f.currentTip.additionalRegisters.R4 = f.tip.additionalRegisters.R4;
    }, /counter does not advance/],
    ['authority drift', (f: Fixture) => {
      f.tip.additionalRegisters.R6 = sigmaProp(8);
      f.settlement.outputs[0].additionalRegisters.R6 = f.tip.additionalRegisters.R6;
      f.currentTip.additionalRegisters.R6 = f.tip.additionalRegisters.R6;
    }, /authorization metadata/],
    ['successor digest drift', (f: Fixture) => {
      f.tip.additionalRegisters.R5 = encodeAvlTreeRegister(
        Buffer.from(EMPTY_AVL_DIGEST, 'hex'),
        0x0b,
        1,
      );
      f.settlement.outputs[0].additionalRegisters.R5 = f.tip.additionalRegisters.R5;
      f.currentTip.additionalRegisters.R5 = f.tip.additionalRegisters.R5;
    }, /successor digest/],
    ['proof drift', (f: Fixture) => {
      f.root.spendingProof.extension['0'] = encodeCollByteRegister(Buffer.from('00', 'hex'));
      f.settlement.inputs[0].spendingProof.extension['0'] = f.root.spendingProof.extension['0'];
    }, /proofs do not replay/],
    ['oversized ContextExtension schema', (f: Fixture) => {
      f.root.spendingProof.extension['3'] = '01';
      f.settlement.inputs[0].spendingProof.extension['3'] = '01';
    }, /exceeds the three-variable DUP schema/],
    ['missing historical block header', (f: Fixture) => {
      f.source.getBlockHeaderById = async () => null;
    }, /block header is unavailable/],
    ['historical block height drift', (f: Fixture) => {
      f.source.getBlockHeaderById = async () => ({
        id: SETTLEMENT_BLOCK_ID,
        parentId: SETUP_BLOCK_ID,
        height: 102,
        extensionRoot: EXTENSION_ROOT,
      });
    }, /does not match its observed block header/],
    ['missing canonical tip', (f: Fixture) => {
      f.source.getBoxByIdOrNull = async () => null;
    }, /not present in the canonical UTXO set/],
  ])('rejects %s', async (_label, mutate, expected) => {
    const f = fixture();
    mutate(f);
    await expect(reconstructAuthenticatedV2DupHistory({
      source: f.source,
      duplicatePreventionNftIdHex: DUP_NFT_ID,
      duplicatePreventionErgoTreeHex: DUP_TREE,
    })).rejects.toThrow(expected);
  });

  it('rejects disconnected and multiple-tip singleton histories', async () => {
    const f = fixture();
    f.root.spentTransactionId = null;
    f.root.spendingProof = null;
    await expect(reconstructAuthenticatedV2DupHistory({
      source: f.source,
      duplicatePreventionNftIdHex: DUP_NFT_ID,
      duplicatePreventionErgoTreeHex: DUP_TREE,
    })).rejects.toThrow(/exactly one unspent tip/);
  });

  it('atomically restores a separate authenticated DUP cache across DB loss and rollback', async () => {
    const f = fixture();
    const reconstruction = await reconstructAuthenticatedV2DupHistoryFromDistinctSources({
      primarySource: f.source,
      witnessSource: clonedSource(f),
      duplicatePreventionNftIdHex: DUP_NFT_ID,
      duplicatePreventionErgoTreeHex: DUP_TREE,
    });
    const dir = mkdtempSync(join(process.cwd(), '.authenticated-dup-recovery-'));
    const dbPath = join(dir, 'state.sqlite');
    try {
      const state = new StateTracker(dbPath);
      state.insertAvlKey('61'.repeat(32));
      expect(state.replaceAuthenticatedV2DupHistory(reconstruction, DUP_IDENTITY)).toEqual({
        changed: true,
        previousEntries: 0,
        currentEntries: 1,
        invalidatedCandidates: 0,
      });
      expect(state.getAuthenticatedV2DupHistory()).toEqual([BURN_ID]);
      expect(state.getAllAvlKeys()).toEqual(['61'.repeat(32)]);
      expect(state.getAuthenticatedV2DupReconstructionState()).toEqual({
        duplicatePreventionNftIdHex: DUP_NFT_ID,
        duplicatePreventionErgoTreeHex: DUP_TREE,
        genesisBoxId: f.root.boxId,
        tipBoxId: f.tip.boxId,
        tipDigest: f.proof.new_digest_hex,
        observationDigest: reconstruction.observationDigestHex,
        observedErgoTip: 120,
        observedErgoTipId: BEST_HEADER_ID,
        observedErgoParentId: BEST_PARENT_ID,
        observedErgoExtensionRoot: EXTENSION_ROOT,
      });
      expect(state.replaceAuthenticatedV2DupHistory(reconstruction, DUP_IDENTITY)).toEqual({
        changed: false,
        previousEntries: 1,
        currentEntries: 1,
        invalidatedCandidates: 0,
      });
      expect(() => state.replaceAuthenticatedV2DupHistory(
        { ...reconstruction } as any,
        DUP_IDENTITY,
      )).toThrow(
        /provenance is missing/,
      );
      expect(() => state.replaceAuthenticatedV2DupHistory(reconstruction, {
        ...DUP_IDENTITY,
        duplicatePreventionNftIdHex: 'ff'.repeat(32),
      })).toThrow(/does not match the configured cache identity/);
      state.close();

      const reopened = new StateTracker(dbPath);
      expect(reopened.getAuthenticatedV2DupHistory()).toEqual([BURN_ID]);
      const emptyPrimary = emptyLineageSource(f, 'fixture://empty-primary');
      const emptyReconstruction = await reconstructAuthenticatedV2DupHistoryFromDistinctSources({
        primarySource: emptyPrimary,
        witnessSource: emptyLineageSource(f, 'fixture://empty-witness'),
        duplicatePreventionNftIdHex: DUP_NFT_ID,
        duplicatePreventionErgoTreeHex: DUP_TREE,
      });
      expect(reopened.replaceAuthenticatedV2DupHistory(emptyReconstruction, DUP_IDENTITY)).toEqual({
        changed: true,
        previousEntries: 1,
        currentEntries: 0,
        invalidatedCandidates: 0,
      });
      expect(reopened.getAuthenticatedV2DupHistory()).toEqual([]);
      expect(reopened.getAllAvlKeys()).toEqual(['61'.repeat(32)]);
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });
});
