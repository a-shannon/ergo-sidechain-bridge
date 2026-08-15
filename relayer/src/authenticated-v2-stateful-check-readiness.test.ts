import { createECDH, createHash } from 'crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  observeAuthenticatedV2StatefulCheckReadiness,
  validateAuthenticatedV2StatefulCheckReadinessReport,
  type AuthenticatedV2StatefulCheckReadinessRequest,
} from './authenticated-v2-stateful-check-readiness.js';
import type { AuthenticatedSpvTrackerNodeSource } from './authenticated-spv-tracker-read-only-node-client.js';
import {
  EMPTY_AVL_DIGEST,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
} from './ergo-encoding.js';
import {
  encodeAuthenticatedSpvTrackerAvlRegister,
  getAuthenticatedSpvTrackerDigest,
} from './spv-tracker-authenticated.js';

const SIDECHAIN_ID = '11'.repeat(32);
const TRACKER_NFT_ID = '12'.repeat(32);
const TRACKER_TREE = `1008cd02${'13'.repeat(32)}`;
const DUP_NFT_ID = '23'.repeat(32);
const DUP_TREE = `1008cd02${'24'.repeat(32)}`;
const VAULT_TREE = `1008cd02${'26'.repeat(32)}`;
const BEST_HEADER_ID = '31'.repeat(32);
const TRACKER_AUTHORITY = sigmaProp(1);
const DUP_AUTHORITY = sigmaProp(2);
const importedWasm: any = await import('ergo-lib-wasm-nodejs');
const TEST_WASM = importedWasm.default ?? importedWasm;

interface SourceOptions {
  network?: string;
  missingDup?: boolean;
  missingVault?: boolean;
  spentDup?: boolean;
  spentVault?: boolean;
  driftTipAfterUtxoReads?: boolean;
  driftIndexAfterUtxoReads?: boolean;
  driftParentAfterTracker?: boolean;
  driftExtensionAfterTracker?: boolean;
  conflictingExtensionAliases?: boolean;
  mutateTracker?: (box: any) => void;
  mutateDup?: (box: any) => void;
  mutateVault?: (box: any) => void;
  mutateTrackerBinaryHex?: (hex: string) => string;
  mutateDupBinaryHex?: (hex: string) => string;
  mutateVaultBinaryHex?: (hex: string) => string;
}

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
  const builder = new TEST_WASM.ErgoBoxCandidateBuilder(
    value,
    contract,
    input.creationHeight,
  );
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
    R9: TRACKER_AUTHORITY,
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
    R6: DUP_AUTHORITY,
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

function trackerBox(): any {
  return {
    ...structuredClone(TRACKER_TEMPLATE),
    inclusionHeight: 100,
    spentTransactionId: null,
    spendingProof: null,
  };
}

function dupBox(): any {
  return {
    ...structuredClone(DUP_TEMPLATE),
    spentTransactionId: null,
    spendingProof: null,
  };
}

function vaultBox(): any {
  return {
    ...structuredClone(VAULT_TEMPLATE),
    spentTransactionId: null,
    spendingProof: null,
  };
}

async function binaryResponse(box: any): Promise<{ bytes: string }> {
  const parsed = TEST_WASM.ErgoBox.from_json(JSON.stringify(box));
  try {
    return { bytes: Buffer.from(parsed.sigma_serialize_bytes()).toString('hex') };
  } finally {
    parsed.free?.();
  }
}

async function mutatedBinaryResponse(
  box: any,
  mutate?: (hex: string) => string,
): Promise<{ bytes: string }> {
  const response = await binaryResponse(box);
  return { bytes: mutate ? mutate(response.bytes) : response.bytes };
}

function flipLastSerializedByte(hex: string): string {
  return `${hex.slice(0, -2)}${hex.endsWith('00') ? '01' : '00'}`;
}

function source(options: SourceOptions = {}): AuthenticatedSpvTrackerNodeSource {
  const tracker = trackerBox();
  const dup = dupBox();
  const vault = vaultBox();
  const trackerBinary = structuredClone(tracker);
  const dupBinary = structuredClone(dup);
  const vaultBinary = structuredClone(vault);
  options.mutateTracker?.(tracker);
  options.mutateDup?.(dup);
  options.mutateVault?.(vault);
  if (options.spentDup) dup.spentTransactionId = '61'.repeat(32);
  if (options.spentVault) vault.spentTransactionId = '62'.repeat(32);
  let indexedHeightCalls = 0;
  let bestHeaderCalls = 0;

  return {
    beginAuthenticatedTrackerReconstruction: vi.fn(),
    endAuthenticatedTrackerReconstruction: vi.fn(),
    getInfo: vi.fn(async () => ({ network: options.network ?? 'testnet' })),
    getIndexedHeight: vi.fn(async () => {
      indexedHeightCalls += 1;
      const drift = options.driftIndexAfterUtxoReads && indexedHeightCalls >= 4;
      return {
        indexedHeight: drift ? 121 : 120,
        fullHeight: drift ? 121 : 120,
      };
    }),
    getBestHeader: vi.fn(async () => {
      bestHeaderCalls += 1;
      const indexDrift = options.driftIndexAfterUtxoReads && bestHeaderCalls >= 4;
      const tipDrift = options.driftTipAfterUtxoReads && bestHeaderCalls >= 4;
      const parentDrift = options.driftParentAfterTracker && bestHeaderCalls >= 3;
      const extensionDrift = options.driftExtensionAfterTracker && bestHeaderCalls >= 3;
      return {
        id: tipDrift || indexDrift ? '32'.repeat(32) : BEST_HEADER_ID,
        parentId: parentDrift ? '36'.repeat(32) : '33'.repeat(32),
        height: indexDrift ? 121 : 120,
        extensionHash: extensionDrift ? '37'.repeat(32) : '34'.repeat(32),
        ...(options.conflictingExtensionAliases ? { extensionRoot: '35'.repeat(32) } : {}),
      };
    }),
    getIndexedBoxesByTokenId: vi.fn(async () => [tracker]),
    getTransaction: vi.fn(async () => null),
    getBlockHeaderById: vi.fn(async () => null),
    getBoxByIdOrNull: vi.fn(async (boxId: string) => {
      if (boxId === TRACKER_BOX_ID) return tracker;
      if (boxId === DUP_BOX_ID) return options.missingDup ? null : dup;
      if (boxId === VAULT_BOX_ID) return options.missingVault ? null : vault;
      return null;
    }),
    getBoxBinaryByIdOrNull: vi.fn(async (boxId: string) => {
      if (boxId === TRACKER_BOX_ID) {
        return mutatedBinaryResponse(trackerBinary, options.mutateTrackerBinaryHex);
      }
      if (boxId === DUP_BOX_ID) {
        return options.missingDup
          ? null
          : mutatedBinaryResponse(dupBinary, options.mutateDupBinaryHex);
      }
      if (boxId === VAULT_BOX_ID) {
        return options.missingVault
          ? null
          : mutatedBinaryResponse(vaultBinary, options.mutateVaultBinaryHex);
      }
      return null;
    }),
  };
}

function request(
  overrides: Partial<AuthenticatedV2StatefulCheckReadinessRequest> = {},
): AuthenticatedV2StatefulCheckReadinessRequest {
  return {
    environment: 'testnet',
    primaryNodeUrl: 'http://127.0.0.1:9053',
    witnessNodeUrl: 'http://127.0.0.1:9054',
    trackerNftIdHex: TRACKER_NFT_ID,
    trackerGenesisBoxIdHex: TRACKER_BOX_ID,
    trackerErgoTreeHex: TRACKER_TREE,
    sidechainIdHex: SIDECHAIN_ID,
    duplicatePreventionBoxIdHex: DUP_BOX_ID,
    duplicatePreventionNftIdHex: DUP_NFT_ID,
    duplicatePreventionErgoTreeHex: DUP_TREE,
    vaultBoxIdHex: VAULT_BOX_ID,
    vaultErgoTreeHex: VAULT_TREE,
    burnIdHex: '27'.repeat(32),
    payoutAmountNanoErg: 3_100_000,
    minerFeeNanoErg: 1_100_000,
    ...overrides,
  };
}

async function observe(
  primary = source(),
  witness = source(),
  input = request(),
) {
  const sources = [primary, witness];
  return observeAuthenticatedV2StatefulCheckReadiness(input, {
    createSource: () => sources.shift()!,
    now: () => new Date('2026-07-14T14:00:00.000Z'),
  });
}

describe('authenticated V2 stateful-check readiness observer', () => {
  it('binds one complete dual tracker reconstruction and exact agreed unspent DUP/vault inputs', async () => {
    const report = await observe();

    expect(await validateAuthenticatedV2StatefulCheckReadinessReport(report)).toBe(report);
    expect(report).toEqual(expect.objectContaining({
      status: 'AGREED',
      trackerObservation: expect.objectContaining({
        status: 'AGREED',
        tracker: expect.objectContaining({ tipBoxIdHex: TRACKER_BOX_ID }),
      }),
      trackerInput: expect.objectContaining({
        box: expect.objectContaining({ boxIdHex: TRACKER_BOX_ID }),
        sigmaSerializedSha256Hex: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
      duplicatePrevention: expect.objectContaining({
        box: expect.objectContaining({ boxIdHex: DUP_BOX_ID, valueNanoErg: 2_000_000 }),
        counter: '0',
        avl: expect.objectContaining({ insertEnabled: true, keyLength: 32, valueLength: 1 }),
      }),
      vault: expect.objectContaining({
        box: expect.objectContaining({ boxIdHex: VAULT_BOX_ID, valueNanoErg: 5_000_000 }),
        amountNanoErg: '3100000',
      }),
      agreement: expect.objectContaining({
        exactNormalizedInputsMatched: true,
        exactCanonicalInputBytesMatched: true,
        inputCreationHeightsWithinSnapshot: true,
        stableSnapshotAcrossExtraUtxoReads: true,
      }),
      boundary: expect.objectContaining({
        configurationRead: false,
        environmentCredentialRead: false,
        transactionConstructed: false,
        transactionCheckPerformed: false,
        settlementCandidateValidated: false,
        grandpaOrStarkVerifiedByErgo: false,
        r9RemainsFinalityAuthority: true,
        gate5Closed: false,
        productionReady: false,
      }),
      authorization: {
        build: false,
        check: false,
        sign: false,
        submit: false,
        broadcast: false,
        deploy: false,
      },
    }));
    expect(report.reportDigestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(report.request).toEqual(expect.objectContaining({
      burnIdHex: '27'.repeat(32),
      payoutAmountNanoErg: 3_100_000,
      minerFeeNanoErg: 1_100_000,
      minimumRequiredVaultValueNanoErg: 4_200_000,
    }));
  });

  it('rejects the same primary and witness origin', async () => {
    await expect(observe(source(), source(), request({
      witnessNodeUrl: 'http://127.0.0.1:9053/',
    }))).rejects.toThrow(/distinct node origins/i);
  });

  it.each([
    ['tracker tip and DUP', { duplicatePreventionBoxIdHex: TRACKER_BOX_ID }],
    ['tracker tip and vault', { vaultBoxIdHex: TRACKER_BOX_ID }],
    ['DUP and vault', { vaultBoxIdHex: DUP_BOX_ID }],
  ])('rejects reused %s box IDs before extra UTXO classification', async (_label, overrides) => {
    await expect(observe(source(), source(), request(overrides)))
      .rejects.toThrow(/tracker tip, DUP, and vault box IDs must all be distinct/i);
  });

  it.each([
    ['mainnet', source({ network: 'mainnet' }), /non-mainnet/i],
    ['wrong explicit network', source({ network: 'devnet' }), /expected Ergo node network testnet/i],
  ])('rejects %s', async (_label, primary, error) => {
    const witness = _label === 'wrong explicit network'
      ? source({ network: 'devnet' })
      : source();
    await expect(observe(primary, witness)).rejects.toThrow(error);
  });

  it.each([
    ['missing DUP', source({ missingDup: true }), /DUP box.*unspent UTXO/i],
    ['spent DUP', source({ spentDup: true }), /DUP box.*currently unspent/i],
    ['missing vault', source({ missingVault: true }), /vault box.*unspent UTXO/i],
    ['spent vault', source({ spentVault: true }), /vault box.*currently unspent/i],
  ])('rejects %s', async (_label, primary, error) => {
    await expect(observe(primary, source())).rejects.toThrow(error);
  });

  it('rejects a DUP NFT amount other than one', async () => {
    await expect(observe(source({ mutateDup: box => { box.assets[0].amount = 2; } }), source()))
      .rejects.toThrow(/DUP box.*NFT amount must be 1/i);
  });

  it('rejects a DUP input carrying any token beyond the singleton NFT', async () => {
    await expect(observe(source({ mutateDup: box => {
      box.assets.push({ tokenId: '28'.repeat(32), amount: 1 });
    } }), source())).rejects.toThrow(/exactly one expected NFT/i);
  });

  it('rejects the wrong DUP NFT identity independently', async () => {
    await expect(observe(source({ mutateDup: box => {
      box.assets[0].tokenId = '29'.repeat(32);
    } }), source())).rejects.toThrow(/DUP box.*NFT ID/i);
  });

  it('rejects a tracker input carrying any token beyond the singleton NFT', async () => {
    await expect(observe(source({ mutateTracker: box => {
      box.assets.push({ tokenId: '2a'.repeat(32), amount: 1 });
    } }), source())).rejects.toThrow(/exactly one tracker NFT/i);
  });

  it.each([
    ['transaction ID', source({ mutateDup: box => { box.transactionId = 'AA'.repeat(32); } }), /transaction id.*canonical lowercase hex/i],
    ['output index', source({ mutateDup: box => { box.index = -1; } }), /output index.*nonnegative safe integer/i],
    ['creation height', source({ mutateDup: box => { box.creationHeight = -1; } }), /creation height.*nonnegative safe integer/i],
  ])('rejects noncanonical DUP %s metadata', async (_label, primary, error) => {
    await expect(observe(primary, source())).rejects.toThrow(error);
  });

  it('rejects an input whose creation height is above the stable node snapshot', async () => {
    await expect(observe(source({ mutateVault: box => { box.creationHeight = 121; } }), source()))
      .rejects.toThrow(/vault box creation height exceeds the stable snapshot height/i);
  });

  it.each([
    ['nonpositive value', source({ mutateDup: box => { box.value = 0; } }), /DUP box value.*positive safe integer/i],
    ['negative R4 counter', source({ mutateDup: box => {
      box.additionalRegisters.R4 = encodeLongRegister(-1);
    } }), /DUP box R4 counter must be nonnegative/i],
    ['unexpected deciding register', source({ mutateDup: box => {
      box.additionalRegisters.R7 = encodeLongRegister(1);
    } }), /DUP box registers.*canonical schema/i],
  ])('rejects DUP %s', async (_label, primary, error) => {
    await expect(observe(primary, source())).rejects.toThrow(error);
  });

  it.each([
    ['DUP', source({ mutateDup: box => { box.ergoTree = `1008cd02${'71'.repeat(32)}`; } }), /DUP box ErgoTree/i],
    ['vault', source({ mutateVault: box => { box.ergoTree = `1008cd02${'72'.repeat(32)}`; } }), /vault box ErgoTree/i],
  ])('rejects the wrong %s tree', async (_label, primary, error) => {
    await expect(observe(primary, source())).rejects.toThrow(error);
  });

  it.each([
    ['malformed', source({ mutateDup: box => { box.additionalRegisters.R5 = '64aa'; } }), /canonical AvlTree/i],
    ['non-insert', source({ mutateDup: box => {
      box.additionalRegisters.R5 = encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x02, 1);
    } }), /permit.*inserts/i],
    ['wrong key length', source({ mutateDup: box => {
      const register = encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1);
      box.additionalRegisters.R5 = `${register.slice(0, 70)}1f${register.slice(72)}`;
    } }), /32-byte keys/i],
    ['wrong value length', source({ mutateDup: box => {
      box.additionalRegisters.R5 = encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 2);
    } }), /one-byte values/i],
  ])('rejects a %s DUP AVL register', async (_label, primary, error) => {
    await expect(observe(primary, source())).rejects.toThrow(error);
  });

  it.each([
    ['malformed', source({ mutateDup: box => { box.additionalRegisters.R6 = '08cd'; } }), /DUP box R6.*proveDlog/i],
    ['equal to tracker R9', source({ mutateDup: box => { box.additionalRegisters.R6 = TRACKER_AUTHORITY; } }), /distinct from tracker R9/i],
  ])('rejects a DUP R6 authority that is %s', async (_label, primary, error) => {
    const witness = _label === 'equal to tracker R9'
      ? source({ mutateDup: box => { box.additionalRegisters.R6 = TRACKER_AUTHORITY; } })
      : source();
    await expect(observe(primary, witness)).rejects.toThrow(error);
  });

  it('rejects vault assets', async () => {
    await expect(observe(source({ mutateVault: box => {
      box.assets = [{ tokenId: '73'.repeat(32), amount: 1 }];
    } }), source())).rejects.toThrow(/vault box must be pure ERG/i);
  });

  it('rejects unexpected vault deciding registers', async () => {
    await expect(observe(source({ mutateVault: box => {
      box.additionalRegisters.R8 = encodeLongRegister(1);
    } }), source())).rejects.toThrow(/vault box registers.*canonical schema/i);
  });

  it.each([
    ['R4', source({ mutateVault: box => {
      box.additionalRegisters.R4 = encodeCollByteRegister(Buffer.from('74'.repeat(31), 'hex'));
    } }), /vault box R4.*32 bytes/i],
    ['R5', source({ mutateVault: box => {
      box.additionalRegisters.R5 = encodeCollByteRegister(Buffer.from('75'.repeat(19), 'hex'));
    } }), /vault box R5.*20 bytes/i],
    ['R6', source({ mutateVault: box => { box.additionalRegisters.R6 = encodeLongRegister(0); } }), /vault box R6.*positive/i],
    ['R7', source({ mutateVault: box => {
      box.additionalRegisters.R7 = encodeCollByteRegister(Buffer.alloc(0));
    } }), /vault box R7.*nonempty/i],
  ])('rejects malformed vault %s', async (_label, primary, error) => {
    await expect(observe(primary, source())).rejects.toThrow(error);
  });

  it('rejects vault R7 above the explicit byte bound', async () => {
    await expect(observe(source({ mutateVault: box => {
      box.additionalRegisters.R7 = encodeCollByteRegister(Buffer.alloc(4 * 1024 + 1, 0x01));
    } }), source())).rejects.toThrow(/vault box R7.*4096-byte payload bound/i);
  });

  it('rejects an underfunded vault', async () => {
    await expect(observe(source(), source(), request({
      payoutAmountNanoErg: 4_100_001,
      minerFeeNanoErg: 1_100_000,
    }))).rejects.toThrow(/below the requested minimum/i);
  });

  it('rejects an operator fee that differs from the authenticated V2 builder fee', async () => {
    await expect(observe(source(), source(), request({ minerFeeNanoErg: 900_000 })))
      .rejects.toThrow(/must match the authenticated V2 builder fee 1100000/i);
  });

  it('rejects a payout plus miner fee outside the safe integer range', async () => {
    await expect(observe(source(), source(), request({
      payoutAmountNanoErg: Number.MAX_SAFE_INTEGER,
      minerFeeNanoErg: 1_100_000,
    }))).rejects.toThrow(/payout amount plus miner fee/i);
  });

  it.each([
    ['tracker', source({ mutateTrackerBinaryHex: flipLastSerializedByte })],
    ['DUP', source({ mutateDupBinaryHex: flipLastSerializedByte })],
    ['vault', source({ mutateVaultBinaryHex: flipLastSerializedByte })],
  ])('rejects %s JSON that does not match the canonical Sigma box bytes', async (_label, primary) => {
    await expect(observe(primary, source()))
      .rejects.toThrow(/JSON and canonical binary observations do not match/i);
  });

  it('rejects conflicting extension-root aliases before accepting a stable snapshot', async () => {
    await expect(observe(
      source({ conflictingExtensionAliases: true }),
      source({ conflictingExtensionAliases: true }),
    )).rejects.toThrow(/extension aliases disagree/i);
  });

  it.each([
    ['parent ID', { driftParentAfterTracker: true }],
    ['extension root', { driftExtensionAfterTracker: true }],
  ])('binds the nested tracker snapshot %s into the outer readiness snapshot', async (_label, options) => {
    await expect(observe(source(options), source(options)))
      .rejects.toThrow(/tracker reconstruction snapshot does not match/i);
  });

  it('rejects a source-side vault mutation before it can become normalized agreement', async () => {
    const witness = source({ mutateVault: box => {
      box.additionalRegisters.R6 = encodeLongRegister(3_100_001);
    } });
    await expect(observe(source(), witness))
      .rejects.toThrow(/valid derived box ID|canonical binary observations do not match/i);
  });

  it.each([
    ['best-header tip', source({ driftTipAfterUtxoReads: true }), /snapshot changed.*UTXO reads/i],
    ['indexed/full height', source({ driftIndexAfterUtxoReads: true }), /snapshot changed.*UTXO reads/i],
  ])('rejects %s drift around the extra UTXO reads', async (_label, primary, error) => {
    const witness = _label === 'best-header tip'
      ? source({ driftTipAfterUtxoReads: true })
      : source({ driftIndexAfterUtxoReads: true });
    await expect(observe(primary, witness)).rejects.toThrow(error);
  });

  it('rejects report tampering and unknown fields', async () => {
    const report = await observe();
    const tampered = structuredClone(report) as any;
    tampered.vault.box.valueNanoErg += 1;
    await expect(validateAuthenticatedV2StatefulCheckReadinessReport(tampered))
      .rejects.toThrow(/report digest|vault/i);

    const mismatchedBytes = structuredClone(report) as any;
    mismatchedBytes.vault.sigmaSerializedHex = report.duplicatePrevention.sigmaSerializedHex;
    mismatchedBytes.vault.sigmaSerializedSha256Hex = createHash('sha256')
      .update(Buffer.from(mismatchedBytes.vault.sigmaSerializedHex, 'hex'))
      .digest('hex');
    await expect(validateAuthenticatedV2StatefulCheckReadinessReport(mismatchedBytes))
      .rejects.toThrow(/JSON and canonical binary observations do not match/i);

    const extended = structuredClone(report) as any;
    extended.unexpected = true;
    await expect(validateAuthenticatedV2StatefulCheckReadinessReport(extended))
      .rejects.toThrow(/canonical schema/i);
  });
});
