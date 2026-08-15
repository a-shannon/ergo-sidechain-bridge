import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock(
  './validity-application-pooled-reserve-historical-replay-genesis-v4.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import(
        './validity-application-pooled-reserve-historical-replay-genesis-v4.js'
      )
    >(),
    assertValidityApplicationPooledReserveHistoricalReplayGenesisV4Provenance:
      vi.fn(),
  }),
);

import {
  encodeApplicationValiditySpvTrackerAvlRegister,
  getApplicationValiditySpvTrackerDigest,
} from './spv-tracker-validity-v2.js';
import {
  POOLED_RESERVE_BURN_TRACKER_V4_PROGRAM_ID_HEX,
  POOLED_RESERVE_BURN_TRACKER_V4_VERIFIER_PROFILE_ID_HEX,
} from './pooled-reserve-burn-profile-v4.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  getDupTreeDigest,
  getPooledReserveEmptyDigest,
} from './avl-bridge.js';
import {
  derivePegInPooledReserveLineageProfileV4,
  type PegInPooledReserveLineageProfileV4Semantics,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_COMMITMENT_DOMAIN,
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_KEY_LENGTH,
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
  VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
  VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_PROFILE_ID_V1_HEX,
  VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_SYSTEM_ID_V1_HEX,
  VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_DELAY_BLOCKS,
  compileValidityApplicationPooledReserveInstanceV4,
  createPinnedValidityApplicationPooledReserveCompilerV4,
  deriveValidityApplicationPooledReserveDepositStatePolicyIdV1Hex,
  deriveValidityApplicationPooledReserveErgoDepositFinalityPolicyIdV1Hex,
  deriveValidityApplicationPooledReserveSidechainFinalityPolicyIdV1Hex,
  deriveValidityApplicationPooledReserveSourceCommitmentPolicyIdV1Hex,
  type ValidityApplicationPooledReserveDepositStatePolicyV1,
  type ValidityApplicationPooledReserveErgoDepositFinalityPolicyV1,
  type ValidityApplicationPooledReserveInstanceV4Candidate,
  type ValidityApplicationPooledReserveSidechainFinalityPolicyV1,
  type ValidityApplicationPooledReserveSourceCommitmentPolicyV1,
} from './validity-application-pooled-reserve-instance-v4.js';
import {
  assertValidityApplicationPooledReserveProvisioningV4Packet,
  buildValidityApplicationPooledReserveProvisioningV4,
  type BuildValidityApplicationPooledReserveProvisioningV4Input,
} from './validity-application-pooled-reserve-provisioning-v4.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
  type MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';

const BRIDGE_ROOT = resolve(import.meta.dirname, '..', '..');
const TEMPLATES = Object.freeze({
  tracker: readFileSync(resolve(
    BRIDGE_ROOT,
    'contracts',
    'SPVTrackerPooledReserveBurnV4.es',
  ), 'utf8'),
  duplicatePrevention: readFileSync(resolve(
    BRIDGE_ROOT,
    'contracts',
    'DoubleUnlockPreventionPooledReserveV4.es',
  ), 'utf8'),
  sourceLock: readFileSync(resolve(
    BRIDGE_ROOT,
    'contracts',
    'MainChainLockPooledReserveV4.es',
  ), 'utf8'),
  pooledReserve: readFileSync(resolve(
    BRIDGE_ROOT,
    'contracts',
    'MainChainPooledReserveValidityApplicationV4.es',
  ), 'utf8'),
});
const COMPILER_BATCH_JSON = readFileSync(resolve(
  BRIDGE_ROOT,
  'relayer',
  'test-vectors',
  'validity-application-pooled-reserve-compiler-v4.json',
), 'utf8');

const BASE_INPUT: Eip12Box = {
  boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5',
  value: '300000000',
  ergoTree: `0008cd02${'22'.repeat(32)}`,
  assets: [],
  additionalRegisters: {},
  creationHeight: 110,
  transactionId:
    '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab',
  index: 0,
};
const GENESIS_TREE = `0008cd02${'11'.repeat(32)}`;
const TRACKER_NFT =
  '00e4ed6ac28c8ccd2a3476a39cb8ac33f7fdefefd0b88978841ed9bb9045a7e9';
const DUP_NFT =
  '667382038b0da5742442e04629d11ca4047a73ea98da1b21ba37e5bd8a4eb538';
const RESERVE_NFT =
  'b7ca9a5aaac5b702dc9e21d6f3de0f8f7d23e3932d3ac018fd64316071cb21f8';
const PROFILE_ID =
  '0xf0cd15e335996211353a2eb895b5bbdeaf7a5de4f10ec0f547a8f6e505a522f9';
const RUNTIME_BINDING = {
  sourceRuntimeCodeSha256Hex: `0x${'dd'.repeat(32)}`,
  sourceRuntimeCodeBytes: 8192,
  bridgeRuntimeCodeSha256Hex: `0x${'bb'.repeat(32)}`,
  bridgeRuntimeCodeBytes: 4096,
  tokenRuntimeCodeSha256Hex: `0x${'cc'.repeat(32)}`,
  tokenRuntimeCodeBytes: 2048,
  maxPendingBlocks: 20,
} as const;
const SIDECHAIN_FINALITY_POLICY:
  ValidityApplicationPooledReserveSidechainFinalityPolicyV1 = {
    proofSystemIdHex:
      VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_SYSTEM_ID_V1_HEX,
    proofProfileIdHex:
      VALIDITY_APPLICATION_POOLED_RESERVE_PROOF_PROFILE_ID_V1_HEX,
    approvedTrustAnchorDigestHex: `0x${'aa'.repeat(32)}`,
    programIdHex: `0x${POOLED_RESERVE_BURN_TRACKER_V4_PROGRAM_ID_HEX}`,
    verifierProfileIdHex:
      `0x${POOLED_RESERVE_BURN_TRACKER_V4_VERIFIER_PROFILE_ID_HEX}`,
  };
const ERGO_DEPOSIT_FINALITY_POLICY:
  ValidityApplicationPooledReserveErgoDepositFinalityPolicyV1 = {
    version: 1,
    requiredSuccessorDepth: 10,
    blockIdentityAndAncestryRequired: true,
    divergentRpcAction: 'hold',
    reorgAction: 'invalidate',
  };
const SOURCE_COMMITMENT_POLICY:
  ValidityApplicationPooledReserveSourceCommitmentPolicyV1 = {
    version: 1,
    refundDelayBlocks:
      VALIDITY_APPLICATION_POOLED_RESERVE_SOURCE_REFUND_DELAY_BLOCKS,
    pooledReserveInputIndex: 0,
    sourceLockInputIndex: 1,
    externalFeeInputIndex: 2,
    pooledReserveOutputIndex: 0,
    externalFeeOutputIndex: 1,
    sourceLockMustBeConsumed: true,
    externalFeeMustBeValueNeutral: true,
  };
const DEPOSIT_STATE_POLICY:
  ValidityApplicationPooledReserveDepositStatePolicyV1 = {
    version: 1,
    keyLength: VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_KEY_LENGTH,
    valueLength: VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
    operationFlags: VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
    keySource: 'source-lock-box-id',
    valueHash: 'blake2b256',
    commitmentDomain: VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_COMMITMENT_DOMAIN,
  };

let compiled: Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>;
let trackerGenesisInputBox: Eip12Box;
let duplicatePreventionGenesisInputBox: Eip12Box;
let settlementVaultGenesisInputBox: Eip12Box;

beforeAll(async () => {
  const funding = await materializeUnsignedTransaction({
    inputs: [{ ...BASE_INPUT, extension: {} }],
    dataInputs: [],
    outputs: [0, 1, 2].map(() => ({
      value: '100000000',
      ergoTree: GENESIS_TREE,
      assets: [],
      additionalRegisters: {},
      creationHeight: 111,
    })),
  }, 'pooled-reserve V4 provisioning genesis fixture');
  [
    trackerGenesisInputBox,
    duplicatePreventionGenesisInputBox,
    settlementVaultGenesisInputBox,
  ] = funding.outputs;

  const semantics: PegInPooledReserveLineageProfileV4Semantics = {
    sourceNetworkIdHex: `0x${'11'.repeat(32)}`,
    sidechainIdHex: `0x${'22'.repeat(32)}`,
    bridgeAddressHex: `0x${'33'.repeat(20)}`,
    tokenAddressHex: `0x${'44'.repeat(20)}`,
    settlementProfileIdHex: `0x${'55'.repeat(32)}`,
    sourceLockTemplateSha256Hex: `0x${sha256(TEMPLATES.sourceLock)}`,
    validityTrackerTemplateSha256Hex: `0x${sha256(TEMPLATES.tracker)}`,
    settlementVaultTemplateSha256Hex: `0x${sha256(TEMPLATES.pooledReserve)}`,
    duplicatePreventionTemplateSha256Hex:
      `0x${sha256(TEMPLATES.duplicatePrevention)}`,
    sidechainFinalityPolicyIdHex:
      deriveValidityApplicationPooledReserveSidechainFinalityPolicyIdV1Hex(
        SIDECHAIN_FINALITY_POLICY,
      ),
    ergoDepositFinalityPolicyIdHex:
      deriveValidityApplicationPooledReserveErgoDepositFinalityPolicyIdV1Hex(
        ERGO_DEPOSIT_FINALITY_POLICY,
      ),
    proofSystemIdHex: SIDECHAIN_FINALITY_POLICY.proofSystemIdHex,
    proofProfileIdHex: SIDECHAIN_FINALITY_POLICY.proofProfileIdHex,
    sourceCommitmentPolicyIdHex:
      deriveValidityApplicationPooledReserveSourceCommitmentPolicyIdV1Hex(
        SOURCE_COMMITMENT_POLICY,
      ),
    depositCommitmentStatePolicyIdHex:
      deriveValidityApplicationPooledReserveDepositStatePolicyIdV1Hex(
        DEPOSIT_STATE_POLICY,
      ),
    profileRevision: '1',
    activationHeight: '0',
  };
  const lineage = await derivePegInPooledReserveLineageProfileV4({
    trackerGenesisInputBox,
    duplicatePreventionGenesisInputBox,
    settlementVaultGenesisInputBox,
    semantics,
  });
  compiled = await compileValidityApplicationPooledReserveInstanceV4({
    lineageCandidate: lineage,
    templates: TEMPLATES,
    runtimeBinding: RUNTIME_BINDING,
    sidechainFinalityPolicy: SIDECHAIN_FINALITY_POLICY,
    ergoDepositFinalityPolicy: ERGO_DEPOSIT_FINALITY_POLICY,
    sourceCommitmentPolicy: SOURCE_COMMITMENT_POLICY,
    depositCommitmentStatePolicy: DEPOSIT_STATE_POLICY,
    compiler: createPinnedValidityApplicationPooledReserveCompilerV4(
      COMPILER_BATCH_JSON,
    ),
  });
});

describe('validity application pooled-reserve provisioning V4', () => {
  it('builds three deterministic singleton issuances with exact bindings', async () => {
    const first = await buildValidityApplicationPooledReserveProvisioningV4(
      buildInput(),
    );
    const second = await buildValidityApplicationPooledReserveProvisioningV4(
      buildInput(),
    );

    expect(compiled.lineageProfileIdHex).toBe(PROFILE_ID);
    expect(second).toEqual(first);
    expect(new Set(Object.values(first.transactions).map(tx => tx.txId)).size)
      .toBe(3);
    expect(Object.values(first.transactions).map(tx => tx.eip12Tx.inputs[0]?.boxId))
      .toEqual([TRACKER_NFT, DUP_NFT, RESERVE_NFT]);

    const profileRegister = encodeCollByteRegister(Buffer.from(
      PROFILE_ID.slice(2),
      'hex',
    ));
    assertSingletonIssuance(
      first.transactions.trackerIssuance,
      first.boxes.tracker,
      TRACKER_NFT,
      compiled.contracts.tracker.receipt.propositionHex,
      {
        R4: profileRegister,
        R5: encodeApplicationValiditySpvTrackerAvlRegister(
          getApplicationValiditySpvTrackerDigest([]),
        ),
        R6: encodeCollByteRegister(Buffer.from('22'.repeat(32), 'hex')),
        R7: encodeLongRegister(0),
        R8: encodeIntRegister(0),
        R9: encodeCollByteRegister(Buffer.from('aa'.repeat(32), 'hex')),
      },
    );
    expect(first.boxes.tracker.additionalRegisters.R4).toBe(profileRegister);
    expect(first.boxes.tracker.additionalRegisters.R4)
      .not.toBe(encodeLongRegister(0));
    assertSingletonIssuance(
      first.transactions.duplicatePreventionIssuance,
      first.boxes.duplicatePrevention,
      DUP_NFT,
      compiled.contracts.duplicatePrevention.receipt.propositionHex,
      {
        R4: profileRegister,
        R5: encodeAvlTreeRegister(Buffer.from(getDupTreeDigest([]), 'hex'), 1, 1),
      },
    );
    assertSingletonIssuance(
      first.transactions.pooledReserveIssuance,
      first.boxes.pooledReserve,
      RESERVE_NFT,
      compiled.contracts.pooledReserve.receipt.propositionHex,
      {
        R4: profileRegister,
        R5: encodeAvlTreeRegister(
          Buffer.from(getPooledReserveEmptyDigest(), 'hex'),
          1,
          32,
        ),
        R6: encodeLongRegister(0),
      },
    );
    expect(getPooledReserveEmptyDigest()).not.toBe(getDupTreeDigest([]));

    expect(first.boxes.duplicatePrevention.additionalRegisters.R5.slice(68, 70))
      .toBe('01');
    expect(first.boxes.duplicatePrevention.additionalRegisters.R5.endsWith('0101'))
      .toBe(true);
    expect(first.boxes.pooledReserve.additionalRegisters.R5.slice(68, 70))
      .toBe('01');
    expect(first.boxes.pooledReserve.additionalRegisters.R5.endsWith('0120'))
      .toBe(true);
    expect(first.boxes.pooledReserve.additionalRegisters.R6)
      .toBe(encodeLongRegister(0));
    expect(first.pooledReserveGenesisSeedNanoErg).toBe('2000000');
    expect(first.duplicatePreventionGenesis).toEqual({
      mode: 'empty-v4-lineage',
      historicalReplayGenesisPacketDigestHex: null,
      canonicalBurnIdCount: 0,
      digestHex: getDupTreeDigest([]),
    });
    expect(Object.values(first.invariants).every(Boolean)).toBe(true);
    expect(first.boundaries.setupTransactionsConstructed).toBe(true);
    expect(Object.entries(first.boundaries)
      .filter(([key]) => key !== 'setupTransactionsConstructed')
      .every(([, value]) => value === false)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.transactions.pooledReserveIssuance.eip12Tx.inputs))
      .toBe(true);
    expect(Object.isFrozen(first.boxes.pooledReserve.additionalRegisters)).toBe(true);
    expect(() => {
      (first.boxes.pooledReserve as { value: string }).value = '1';
    }).toThrow(TypeError);
    expect(() =>
      assertValidityApplicationPooledReserveProvisioningV4Packet(first)
    ).not.toThrow();
    expect(() =>
      assertValidityApplicationPooledReserveProvisioningV4Packet(
        structuredClone(first),
      )
    ).toThrow(/built in this process/);
  });

  it('binds the complete historical replay genesis into the DUP issuance', async () => {
    const canonicalBurnIdsHex = ['a1'.repeat(32), 'b2'.repeat(32)];
    const digestHex = getDupTreeDigest([...canonicalBurnIdsHex]);
    const registers = {
      R4: encodeCollByteRegister(Buffer.from(
        compiled.lineageProfileIdHex.slice(2),
        'hex',
      )),
      R5: encodeAvlTreeRegister(Buffer.from(digestHex, 'hex'), 1, 1),
    };
    const historicalReplayGenesis = {
      packetDigestHex: 'c3'.repeat(32),
      lineage: {
        lineageProfileIdHex: compiled.lineageProfileIdHex,
        encodedLineageProfileHex: compiled.encodedLineageProfileHex,
      },
      duplicatePreventionGenesis: {
        canonicalBurnIdsHex,
        digestHex,
        registers,
      },
    } as any;

    const packet = await buildValidityApplicationPooledReserveProvisioningV4({
      ...buildInput(),
      historicalReplayGenesis,
    });

    expect(packet.duplicatePreventionGenesis).toEqual({
      mode: 'historical-replay-genesis',
      historicalReplayGenesisPacketDigestHex:
        historicalReplayGenesis.packetDigestHex,
      canonicalBurnIdCount: canonicalBurnIdsHex.length,
      digestHex,
    });
    expect(packet.boxes.duplicatePrevention.additionalRegisters)
      .toEqual(registers);

    await expect(buildValidityApplicationPooledReserveProvisioningV4({
      ...buildInput(),
      historicalReplayGenesis: {
        ...historicalReplayGenesis,
        duplicatePreventionGenesis: {
          ...historicalReplayGenesis.duplicatePreventionGenesis,
          digestHex: 'ff'.repeat(33),
        },
      },
    })).rejects.toThrow(/exact V4 DUP genesis/);
  });

  it('rejects cloned, wrong, aliased, token-bearing, and register-bearing genesis inputs', async () => {
    await expect(buildValidityApplicationPooledReserveProvisioningV4({
      ...buildInput(),
      compiledInstance: structuredClone(compiled),
    })).rejects.toThrow(/same-process reviewed lineage candidate/);

    await expect(buildValidityApplicationPooledReserveProvisioningV4({
      ...buildInput(),
      trackerGenesisInputBox: duplicatePreventionGenesisInputBox,
    })).rejects.toThrow(/does not match.*lineage|pairwise distinct/);
    await expect(buildValidityApplicationPooledReserveProvisioningV4({
      ...buildInput(),
      settlementVaultGenesisInputBox: trackerGenesisInputBox,
    })).rejects.toThrow(/does not match.*lineage|pairwise distinct/);
    await expect(buildValidityApplicationPooledReserveProvisioningV4({
      ...buildInput(),
      trackerGenesisInputBox: {
        ...trackerGenesisInputBox,
        boxId: 'ff'.repeat(32),
      },
    })).rejects.toThrow(/EIP-12 box|boxId|serialized box contents/);

    const tokenBearing = await materializeGenesisVariant({
      assets: [{ tokenId: BASE_INPUT.boxId, amount: '1' }],
      additionalRegisters: {},
    });
    const registerBearing = await materializeGenesisVariant({
      assets: [],
      additionalRegisters: { R4: `0e20${'ab'.repeat(32)}` },
    });
    for (const field of [
      'trackerGenesisInputBox',
      'duplicatePreventionGenesisInputBox',
      'settlementVaultGenesisInputBox',
    ] as const) {
      await expect(buildValidityApplicationPooledReserveProvisioningV4({
        ...buildInput(),
        [field]: tokenBearing,
      })).rejects.toThrow(/must be pure ERG/);
      await expect(buildValidityApplicationPooledReserveProvisioningV4({
        ...buildInput(),
        [field]: registerBearing,
      })).rejects.toThrow(/must be register-free/);
    }
  });

  it('rejects underfunding, dust, fractional values, backwards heights, and unknown fields', async () => {
    await expect(buildValidityApplicationPooledReserveProvisioningV4({
      ...buildInput(),
      values: {
        ...buildInput().values,
        pooledReserveNanoErg: '99000000',
      },
    })).rejects.toThrow(/underfunded/);
    await expect(buildValidityApplicationPooledReserveProvisioningV4({
      ...buildInput(),
      values: {
        ...buildInput().values,
        trackerNanoErg: '98000000',
      },
    })).rejects.toThrow(/dust output/);
    await expect(buildValidityApplicationPooledReserveProvisioningV4({
      ...buildInput(),
      fees: {
        trackerIssuanceNanoErg: 1.5,
      },
    })).rejects.toThrow(/exact integer/);
    await expect(buildValidityApplicationPooledReserveProvisioningV4({
      ...buildInput(),
      creationHeights: {
        ...buildInput().creationHeights,
        duplicatePreventionIssuance:
          duplicatePreventionGenesisInputBox.creationHeight - 1,
      },
    })).rejects.toThrow(/predates its genesis input/);
    await expect(buildValidityApplicationPooledReserveProvisioningV4({
      ...buildInput(),
      unrecognizedAuthority: true,
    } as BuildValidityApplicationPooledReserveProvisioningV4Input))
      .rejects.toThrow(/unknown unrecognizedAuthority/);
    await expect(buildValidityApplicationPooledReserveProvisioningV4({
      ...buildInput(),
      authenticatedV2ReplayImport: {},
    } as any)).rejects.toThrow(/unknown authenticatedV2ReplayImport/);
  });
});

function buildInput(): BuildValidityApplicationPooledReserveProvisioningV4Input {
  return {
    compiledInstance: compiled,
    trackerGenesisInputBox,
    duplicatePreventionGenesisInputBox,
    settlementVaultGenesisInputBox,
    values: {
      trackerNanoErg: '2000000',
      duplicatePreventionNanoErg: '2000000',
      pooledReserveNanoErg: '2000000',
    },
    fees: {
      trackerIssuanceNanoErg: MINER_FEE,
      duplicatePreventionIssuanceNanoErg: MINER_FEE,
      pooledReserveIssuanceNanoErg: MINER_FEE,
    },
    creationHeights: {
      trackerIssuance: 112,
      duplicatePreventionIssuance: 112,
      pooledReserveIssuance: 112,
    },
  };
}

function assertSingletonIssuance(
  transaction: Readonly<MaterializedUnsignedTransaction>,
  box: Eip12Box,
  nftId: string,
  propositionHex: string,
  registers: Record<string, string>,
): void {
  expect(transaction.eip12Tx.inputs).toHaveLength(1);
  expect(transaction.eip12Tx.inputs[0]?.boxId).toBe(nftId);
  expect(transaction.eip12Tx.inputs[0]?.extension).toEqual({});
  expect(transaction.eip12Tx.dataInputs).toEqual([]);
  expect(transaction.eip12Tx.outputs).toHaveLength(3);
  expect(transaction.eip12Tx.outputs[0]).toMatchObject({
    value: '2000000',
    ergoTree: propositionHex,
    assets: [{ tokenId: nftId, amount: '1' }],
    additionalRegisters: registers,
    creationHeight: 112,
  });
  expect(transaction.eip12Tx.outputs[1]).toMatchObject({
    value: '96900000',
    ergoTree: GENESIS_TREE,
    assets: [],
    additionalRegisters: {},
    creationHeight: 112,
  });
  expect(transaction.eip12Tx.outputs[2]).toMatchObject({
    value: String(MINER_FEE),
    ergoTree: MINER_FEE_TREE,
    assets: [],
    additionalRegisters: {},
    creationHeight: 112,
  });
  expect(box).toEqual(expect.objectContaining({
    value: '2000000',
    ergoTree: propositionHex,
    assets: [{ tokenId: nftId, amount: '1' }],
    additionalRegisters: registers,
    creationHeight: 112,
  }));
}

async function materializeGenesisVariant(
  output: { assets: { tokenId: string; amount: string }[]; additionalRegisters: Record<string, string> },
): Promise<Eip12Box> {
  const funding = await materializeUnsignedTransaction({
    inputs: [{ ...BASE_INPUT, extension: {} }],
    dataInputs: [],
    outputs: [
      {
        value: '100000000',
        ergoTree: GENESIS_TREE,
        ...output,
        creationHeight: 111,
      },
      {
        value: '100000000',
        ergoTree: GENESIS_TREE,
        assets: [],
        additionalRegisters: {},
        creationHeight: 111,
      },
      {
        value: '100000000',
        ergoTree: GENESIS_TREE,
        assets: [],
        additionalRegisters: {},
        creationHeight: 111,
      },
    ],
  }, 'pooled-reserve V4 malformed provisioning genesis fixture');
  return funding.outputs[0];
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
