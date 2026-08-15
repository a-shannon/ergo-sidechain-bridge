import { describe, expect, it, vi } from 'vitest';

import {
  encodeCollByteRegister,
  encodeLongRegister,
  MINER_FEE_TREE,
} from './ergo-encoding.js';

const assertDupProvenance = vi.hoisted(() => vi.fn());
vi.mock('./authenticated-v2-dup-reconstruction.js', async importOriginal => ({
  ...await importOriginal<typeof import('./authenticated-v2-dup-reconstruction.js')>(),
  assertAuthenticatedV2DupReconstructionProvenance: assertDupProvenance,
}));

import {
  assertAuthenticatedV2VaultReconstructionProvenance,
  reconstructAuthenticatedV2VaultForestFromDistinctSources,
  type AuthenticatedV2VaultChainSource,
} from './authenticated-v2-vault-reconstruction.js';

const importedWasm: any = await import('ergo-lib-wasm-nodejs');
const TEST_WASM = importedWasm.default ?? importedWasm;

const VAULT_TREE = `1008cd02${'11'.repeat(32)}`;
const OTHER_TREE = `1008cd02${'12'.repeat(32)}`;
const PAYOUT_TREE = `1008cd02${'13'.repeat(32)}`;
const ADDRESS = `9${'A'.repeat(50)}`;
const HEADER_ID = '21'.repeat(32);
const PARENT_ID = '22'.repeat(32);
const EXTENSION_ROOT = '23'.repeat(32);
const PARTIAL_TX_ID = '31'.repeat(32);
const EXACT_TX_ID = '32'.repeat(32);

function materializeBox(input: {
  transactionId: string;
  index: number;
  creationHeight: number;
  value: number;
  ergoTree: string;
  additionalRegisters?: Record<string, string>;
}): any {
  const value = TEST_WASM.BoxValue.from_i64(TEST_WASM.I64.from_str(String(input.value)));
  const tree = TEST_WASM.ErgoTree.from_base16_bytes(input.ergoTree);
  const contract = TEST_WASM.Contract.new(tree);
  const builder = new TEST_WASM.ErgoBoxCandidateBuilder(value, contract, input.creationHeight);
  try {
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

function vaultRegisters(seed: string): Record<string, string> {
  return {
    R4: encodeCollByteRegister(Buffer.from(seed.repeat(32), 'hex')),
    R5: encodeCollByteRegister(Buffer.from('41'.repeat(20), 'hex')),
    R6: encodeLongRegister(10_000_000),
    R7: encodeCollByteRegister(Buffer.from(`1008cd02${'42'.repeat(32)}`, 'hex')),
  };
}

function fixtures() {
  const rootA = materializeBox({
    transactionId: '51'.repeat(32),
    index: 0,
    creationHeight: 90,
    value: 10_000_000,
    ergoTree: VAULT_TREE,
    additionalRegisters: vaultRegisters('a1'),
  });
  const rootB = materializeBox({
    transactionId: '52'.repeat(32),
    index: 0,
    creationHeight: 91,
    value: 4_000_000,
    ergoTree: VAULT_TREE,
    additionalRegisters: vaultRegisters('b1'),
  });
  const rootC = materializeBox({
    transactionId: '53'.repeat(32),
    index: 0,
    creationHeight: 92,
    value: 3_000_000,
    ergoTree: VAULT_TREE,
    additionalRegisters: vaultRegisters('c1'),
  });
  const dupPartial = materializeBox({
    transactionId: PARTIAL_TX_ID,
    index: 0,
    creationHeight: 100,
    value: 2_000_000,
    ergoTree: OTHER_TREE,
  });
  const payoutPartial = materializeBox({
    transactionId: PARTIAL_TX_ID,
    index: 1,
    creationHeight: 100,
    value: 4_000_000,
    ergoTree: PAYOUT_TREE,
  });
  const successorA = materializeBox({
    transactionId: PARTIAL_TX_ID,
    index: 2,
    creationHeight: 100,
    value: 5_000_000,
    ergoTree: VAULT_TREE,
    additionalRegisters: vaultRegisters('a1'),
  });
  const feePartial = materializeBox({
    transactionId: PARTIAL_TX_ID,
    index: 3,
    creationHeight: 100,
    value: 1_000_000,
    ergoTree: MINER_FEE_TREE,
  });
  const dupExact = materializeBox({
    transactionId: EXACT_TX_ID,
    index: 0,
    creationHeight: 101,
    value: 2_000_000,
    ergoTree: OTHER_TREE,
  });
  const payoutExact = materializeBox({
    transactionId: EXACT_TX_ID,
    index: 1,
    creationHeight: 101,
    value: 3_000_000,
    ergoTree: PAYOUT_TREE,
  });
  const feeExact = materializeBox({
    transactionId: EXACT_TX_ID,
    index: 2,
    creationHeight: 101,
    value: 1_000_000,
    ergoTree: MINER_FEE_TREE,
  });
  const indexed = [
    { ...structuredClone(rootA), spentTransactionId: PARTIAL_TX_ID },
    { ...structuredClone(rootB), spentTransactionId: EXACT_TX_ID },
    { ...structuredClone(rootC), spentTransactionId: null },
    { ...structuredClone(successorA), spentTransactionId: null },
  ];
  const current = [structuredClone(rootC), structuredClone(successorA)];
  const transactions = new Map<string, any>([
    [PARTIAL_TX_ID, {
      id: PARTIAL_TX_ID,
      inputs: [{ boxId: '61'.repeat(32) }, { boxId: rootA.boxId }],
      dataInputs: [{ boxId: '62'.repeat(32) }],
      outputs: [dupPartial, payoutPartial, successorA, feePartial],
    }],
    [EXACT_TX_ID, {
      id: EXACT_TX_ID,
      inputs: [{ boxId: '63'.repeat(32) }, { boxId: rootB.boxId }],
      dataInputs: [{ boxId: '64'.repeat(32) }],
      outputs: [dupExact, payoutExact, feeExact],
    }],
  ]);
  const duplicatePrevention = {
    observationDigestHex: '71'.repeat(32),
    tipBoxIdHex: '72'.repeat(32),
    observedTip: {
      idHex: HEADER_ID,
      parentIdHex: PARENT_ID,
      height: 110,
      extensionRootHex: EXTENSION_ROOT,
    },
    transitions: [
      {
        burnIdHex: '73'.repeat(32),
        spendingTransactionIdHex: PARTIAL_TX_ID,
        vaultInputBoxIdHex: rootA.boxId,
        vaultSuccessorBoxIdHex: successorA.boxId,
        payoutBoxIdHex: payoutPartial.boxId,
        payoutValueNanoErg: '4000000',
        minerFeeNanoErg: '1000000',
      },
      {
        burnIdHex: '74'.repeat(32),
        spendingTransactionIdHex: EXACT_TX_ID,
        vaultInputBoxIdHex: rootB.boxId,
        vaultSuccessorBoxIdHex: null,
        payoutBoxIdHex: payoutExact.boxId,
        payoutValueNanoErg: '3000000',
        minerFeeNanoErg: '1000000',
      },
    ],
  } as any;
  return { rootA, rootB, rootC, successorA, indexed, current, transactions, duplicatePrevention };
}

async function binary(box: any): Promise<{ bytes: string }> {
  const parsed = TEST_WASM.ErgoBox.from_json(JSON.stringify(box));
  try {
    return { bytes: Buffer.from(parsed.sigma_serialize_bytes()).toString('hex') };
  } finally {
    parsed.free?.();
  }
}

function source(
  id: string,
  f: ReturnType<typeof fixtures>,
  options: {
    mutateIndexed?: (boxes: any[]) => void;
    mutateCurrent?: (boxes: any[]) => void;
    mutateTransaction?: (txId: string, tx: any) => void;
    driftSnapshot?: boolean;
    network?: string;
  } = {},
): AuthenticatedV2VaultChainSource {
  const indexed = structuredClone(f.indexed);
  const current = structuredClone(f.current);
  options.mutateIndexed?.(indexed);
  options.mutateCurrent?.(current);
  const transactions = new Map([...f.transactions].map(([txId, tx]) => {
    const clone = structuredClone(tx);
    options.mutateTransaction?.(txId, clone);
    return [txId, clone] as const;
  }));
  let heightCalls = 0;
  return {
    observationSourceId: id,
    beginAuthenticatedTrackerReconstruction: vi.fn(),
    endAuthenticatedTrackerReconstruction: vi.fn(),
    getInfo: vi.fn(async () => ({ network: options.network ?? 'testnet' })),
    getIndexedHeight: vi.fn(async () => {
      heightCalls += 1;
      const height = options.driftSnapshot && heightCalls > 1 ? 111 : 110;
      return { indexedHeight: height, fullHeight: height };
    }),
    getBestHeader: vi.fn(async () => ({
      id: options.driftSnapshot && heightCalls > 1 ? '24'.repeat(32) : HEADER_ID,
      parentId: PARENT_ID,
      height: options.driftSnapshot && heightCalls > 1 ? 111 : 110,
      extensionRoot: EXTENSION_ROOT,
    })),
    getIndexedBoxesByAddress: vi.fn(async () => structuredClone(indexed)),
    getUnspentBoxesByAddress: vi.fn(async () => structuredClone(current)),
    getIndexedBoxesByTokenId: vi.fn(async () => []),
    getTransaction: vi.fn(async txId => structuredClone(transactions.get(txId) ?? null)),
    getBlockHeaderById: vi.fn(async () => null),
    getBoxByIdOrNull: vi.fn(async boxId => (
      structuredClone(current.find(box => box.boxId === boxId) ?? null)
    )),
    getBoxBinaryByIdOrNull: vi.fn(async boxId => {
      const box = current.find(candidate => candidate.boxId === boxId);
      return box ? binary(box) : null;
    }),
  };
}

function input(
  f: ReturnType<typeof fixtures>,
  primary = source('https://primary.example.test', f),
  witness = source('https://witness.example.test', f),
) {
  return {
    primarySource: primary,
    witnessSource: witness,
    expectedNetwork: 'testnet',
    vaultAddress: ADDRESS,
    vaultErgoTreeHex: VAULT_TREE,
    duplicatePrevention: f.duplicatePrevention,
    now: () => new Date('2026-07-15T10:00:00.000Z'),
  };
}

describe('authenticated V2 settlement-vault reconstruction', () => {
  it('reconstructs multiple roots, partial successors, exact spends, and current binaries', async () => {
    const f = fixtures();
    const primary = source('https://primary.example.test', f);
    const witness = source('https://witness.example.test', f);

    const reconstruction = await reconstructAuthenticatedV2VaultForestFromDistinctSources(
      input(f, primary, witness),
    );

    expect(assertDupProvenance).toHaveBeenCalledWith(f.duplicatePrevention);
    expect(reconstruction.distinctSourceAgreement).toBe(true);
    expect(reconstruction.currentUnspentBoxIdsHex).toEqual(
      [f.rootC.boxId, f.successorA.boxId].sort(),
    );
    expect(reconstruction.rootBoxIdsHex).toEqual(
      [f.rootA.boxId, f.rootB.boxId, f.rootC.boxId].sort(),
    );
    expect(reconstruction.unresolvedRootProvenanceBoxIdsHex)
      .toEqual(reconstruction.rootBoxIdsHex);
    expect(reconstruction.transitions).toEqual([
      expect.objectContaining({
        inputBoxIdHex: f.rootA.boxId,
        successorBoxIdHex: f.successorA.boxId,
        payoutValueNanoErg: '4000000',
      }),
      expect.objectContaining({
        inputBoxIdHex: f.rootB.boxId,
        successorBoxIdHex: null,
        payoutValueNanoErg: '3000000',
      }),
    ]);
    expect(reconstruction.boxes.filter(box => box.currentUtxoBinaryMatched).map(box => box.boxIdHex))
      .toEqual([f.rootC.boxId, f.successorA.boxId].sort());
    expect(reconstruction.boundary.rootCreationProvenanceRequiresSeparateProof).toBe(true);
    expect(() => assertAuthenticatedV2VaultReconstructionProvenance(reconstruction)).not.toThrow();
    expect(primary.beginAuthenticatedTrackerReconstruction).toHaveBeenCalledOnce();
    expect(primary.endAuthenticatedTrackerReconstruction).toHaveBeenCalledOnce();
    expect(witness.beginAuthenticatedTrackerReconstruction).toHaveBeenCalledOnce();
    expect(witness.endAuthenticatedTrackerReconstruction).toHaveBeenCalledOnce();
  });

  it('fails closed on distinct-source, network, snapshot, and current-set disagreement', async () => {
    const f = fixtures();
    await expect(reconstructAuthenticatedV2VaultForestFromDistinctSources(input(
      f,
      source('same', f),
      source('same', f),
    ))).rejects.toThrow(/distinct configured source identities/i);

    await expect(reconstructAuthenticatedV2VaultForestFromDistinctSources(input(
      f,
      source('primary', f),
      source('witness', f, { network: 'devnet' }),
    ))).rejects.toThrow(/expected vault source network/i);

    await expect(reconstructAuthenticatedV2VaultForestFromDistinctSources(input(
      f,
      source('primary', f),
      source('witness', f, { driftSnapshot: true }),
    ))).rejects.toThrow(/snapshot changed/i);

    const mismatchedDupSnapshot = structuredClone(f.duplicatePrevention);
    mismatchedDupSnapshot.observedTip.idHex = '25'.repeat(32);
    await expect(reconstructAuthenticatedV2VaultForestFromDistinctSources({
      ...input(f),
      duplicatePrevention: mismatchedDupSnapshot,
    })).rejects.toThrow(/does not match authenticated DUP history/i);

    await expect(reconstructAuthenticatedV2VaultForestFromDistinctSources(input(
      f,
      source('primary', f),
      source('witness', f, { mutateCurrent: boxes => boxes.pop() }),
    ))).rejects.toThrow(/indexed vault tips and current UTXO set disagree/i);
  });

  it('rejects token-bearing or malformed vaults and canonical-binary disagreement', async () => {
    const f = fixtures();
    await expect(reconstructAuthenticatedV2VaultForestFromDistinctSources(input(
      f,
      source('primary', f, { mutateIndexed: boxes => { boxes[0].assets = [{
        tokenId: '81'.repeat(32), amount: 1,
      }]; } }),
      source('witness', f),
    ))).rejects.toThrow(/pure ERG/i);

    await expect(reconstructAuthenticatedV2VaultForestFromDistinctSources(input(
      f,
      source('primary', f, { mutateIndexed: boxes => { delete boxes[0].additionalRegisters.R7; } }),
      source('witness', f),
    ))).rejects.toThrow(/R4-R7 exactly/i);

    const primary = source('primary', f);
    const original = primary.getBoxBinaryByIdOrNull.bind(primary);
    primary.getBoxBinaryByIdOrNull = vi.fn(async boxId => {
      const response = await original(boxId) as any;
      return response ? { bytes: `${response.bytes.slice(0, -2)}00` } : null;
    });
    await expect(reconstructAuthenticatedV2VaultForestFromDistinctSources(input(
      f,
      primary,
      source('witness', f),
    ))).rejects.toThrow(/current canonical binary disagree/i);
  });

  it('rejects unbound spends, topology drift, and successor conservation failures', async () => {
    const f = fixtures();
    const missingTransition = {
      ...f.duplicatePrevention,
      transitions: f.duplicatePrevention.transitions.slice(0, 1),
    };
    await expect(reconstructAuthenticatedV2VaultForestFromDistinctSources({
      ...input(f),
      duplicatePrevention: missingTransition,
    })).rejects.toThrow(/spent-vault count/i);

    await expect(reconstructAuthenticatedV2VaultForestFromDistinctSources(input(
      f,
      source('primary', f, {
        mutateTransaction: (txId, tx) => {
          if (txId === PARTIAL_TX_ID) tx.inputs.reverse();
        },
      }),
      source('witness', f),
    ))).rejects.toThrow(/unsupported topology/i);

    await expect(reconstructAuthenticatedV2VaultForestFromDistinctSources(input(
      f,
      source('primary', f, {
        mutateTransaction: (txId, tx) => {
          if (txId === PARTIAL_TX_ID) tx.outputs[1].value += 1;
        },
      }),
      source('witness', f),
    ))).rejects.toThrow(/canonical transaction output|box ID is not derived/i);

    const badResidual = structuredClone(f.duplicatePrevention);
    badResidual.transitions[0].payoutValueNanoErg = '5000000';
    await expect(reconstructAuthenticatedV2VaultForestFromDistinctSources({
      ...input(f),
      duplicatePrevention: badResidual,
    })).rejects.toThrow(/payout does not match/i);
  });

  it('rejects forged reconstruction objects and closes source budgets after failures', async () => {
    expect(() => assertAuthenticatedV2VaultReconstructionProvenance({
      distinctSourceAgreement: true,
    } as any)).toThrow(/provenance is missing/i);

    const f = fixtures();
    const primary = source('primary', f, { mutateCurrent: boxes => boxes.pop() });
    const witness = source('witness', f);
    await expect(reconstructAuthenticatedV2VaultForestFromDistinctSources(input(
      f,
      primary,
      witness,
    ))).rejects.toThrow();
    expect(primary.endAuthenticatedTrackerReconstruction).toHaveBeenCalledOnce();
    expect(witness.endAuthenticatedTrackerReconstruction).toHaveBeenCalledOnce();
  });

  it('waits for both source observations before closing their reconstruction budgets', async () => {
    const f = fixtures();
    const primary = source('primary', f, { network: 'mainnet' });
    const witness = source('witness', f);
    const originalWitnessInfo = witness.getInfo.bind(witness);
    let witnessObservationFinished = false;
    witness.getInfo = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      const info = await originalWitnessInfo();
      witnessObservationFinished = true;
      return info;
    });

    await expect(reconstructAuthenticatedV2VaultForestFromDistinctSources(input(
      f,
      primary,
      witness,
    ))).rejects.toThrow(/explicitly non-mainnet/i);

    expect(witnessObservationFinished).toBe(true);
    expect(primary.endAuthenticatedTrackerReconstruction).toHaveBeenCalledOnce();
    expect(witness.endAuthenticatedTrackerReconstruction).toHaveBeenCalledOnce();
  });
});
