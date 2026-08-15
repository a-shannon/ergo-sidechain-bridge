import { describe, expect, it } from 'vitest';

import {
  encodeCollByteRegister,
  encodeLongRegister,
} from './ergo-settlement-core/ergo-encoding.js';
import {
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
} from './profiles/substrate-grandpa-v1/asset-profile.js';
import {
  assertExactCommittedVaultV1,
  inspectPegInCommitmentInclusionV1,
  resolveActivePegInDeploymentV1,
  sumCanonicalCommittedVaultBackingV1,
  type CanonicalCommittedVaultBackingBoxV1,
  type CanonicalCommittedVaultV1,
  type CanonicalPegInCommitmentV1,
  type PegInMintIntentV1,
} from './profiles/substrate-grandpa-v1/peg-in-committed-vault.js';
import {
  derivePegInEvmReplayIdentityV1,
  derivePegInMintReplayIdentityV1,
} from './profiles/substrate-grandpa-v1/peg-in-mint-identity.js';
import {
  derivePegInRuntimeRecordKeyV1Hex,
  deriveProcessedPegInRuntimeStorageKeyV1Hex,
} from './profiles/substrate-grandpa-v1/peg-in-runtime-state.js';

const sourceBoxId = '11'.repeat(32);
const transactionId = '22'.repeat(32);
const inclusionBlockId = '33'.repeat(32);
const vaultBoxId = '44'.repeat(32);
const targetH160 = '55'.repeat(20);
const depositorErgoTree = '0008cd02' + '66'.repeat(32);
const vaultErgoTree = '100204a00b08cd';

function intent(overrides: Partial<PegInMintIntentV1> = {}): PegInMintIntentV1 {
  return {
    assetProfileId: SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
    sourceBoxIdHex: sourceBoxId,
    targetH160Hex: targetH160,
    amountNanoErg: 5_000_000n,
    depositorErgoTreeHex: depositorErgoTree,
    ...overrides,
  };
}

function committedVault(
  overrides: Partial<CanonicalCommittedVaultV1> = {},
): CanonicalCommittedVaultV1 {
  return {
    boxIdHex: vaultBoxId,
    valueNanoErg: 5_000_000n,
    ergoTreeHex: vaultErgoTree,
    tokenCount: 0,
    registers: {
      R4: encodeCollByteRegister(Buffer.from(sourceBoxId, 'hex')),
      R5: encodeCollByteRegister(Buffer.from(targetH160, 'hex')),
      R6: encodeLongRegister(5_000_000),
      R7: encodeCollByteRegister(Buffer.from(depositorErgoTree, 'hex')),
    },
    ...overrides,
  };
}

function commitment(
  overrides: Partial<CanonicalPegInCommitmentV1> = {},
): CanonicalPegInCommitmentV1 {
  return {
    transactionIdHex: transactionId,
    inclusionBlockIdHex: inclusionBlockId,
    inclusionHeight: 100,
    inputBoxIdsHex: [sourceBoxId],
    ...overrides,
  };
}

function backingVault(
  overrides: Partial<CanonicalCommittedVaultBackingBoxV1> = {},
): CanonicalCommittedVaultBackingBoxV1 {
  const vault = committedVault();
  return {
    boxIdHex: vault.boxIdHex,
    valueNanoErg: vault.valueNanoErg,
    ergoTreeHex: vault.ergoTreeHex,
    tokenCount: vault.tokenCount,
    registers: {
      R4: vault.registers.R4!,
      R5: vault.registers.R5!,
      R6: vault.registers.R6!,
      R7: vault.registers.R7!,
    },
    ...overrides,
  };
}

describe('Substrate/GRANDPA V1 peg-in profile', () => {
  it('keeps the raw EVM key distinct from the domain-separated native identity', () => {
    const evm = derivePegInEvmReplayIdentityV1(`0x${sourceBoxId.toUpperCase()}`);
    expect(evm).toEqual({
      sourceBoxIdHex: sourceBoxId,
      evmProcessedPegInKeyHex: `0x${sourceBoxId}`,
    });

    const sidechainIdHex = `0x${'77'.repeat(32)}`;
    const identity = derivePegInMintReplayIdentityV1({
      sourceBoxIdHex: sourceBoxId,
      sidechainIdHex,
    });
    expect(identity.nativeRuntimeRecordKeyHex).toBe(
      derivePegInRuntimeRecordKeyV1Hex({
        sidechainIdHex,
        ergoBoxIdHex: evm.evmProcessedPegInKeyHex,
      }),
    );
    expect(identity.nativeProcessedRecordStorageKeyHex).toBe(
      deriveProcessedPegInRuntimeStorageKeyV1Hex({
        sidechainIdHex,
        ergoBoxIdHex: evm.evmProcessedPegInKeyHex,
      }),
    );
    expect(identity.nativeRuntimeRecordKeyHex).not.toBe(evm.evmProcessedPegInKeyHex);
    expect(() => derivePegInEvmReplayIdentityV1('11'.repeat(31))).toThrow(
      'source box id must be 32 bytes',
    );
  });

  it('binds commitment identity, source consumption, and inclusion coordinates', () => {
    expect(inspectPegInCommitmentInclusionV1({
      commitment: commitment(),
      expectedTransactionIdHex: transactionId,
      sourceBoxIdHex: sourceBoxId,
    })).toEqual({
      transactionIdHex: transactionId,
      inclusionBlockIdHex: inclusionBlockId,
      inclusionHeight: 100,
      inputBoxIdsHex: [sourceBoxId],
    });
  });

  it.each([
    [
      'another transaction',
      commitment({ transactionIdHex: '77'.repeat(32) }),
      /canonical transaction id does not match persisted commitment id/,
    ],
    [
      'another source input',
      commitment({ inputBoxIdsHex: ['77'.repeat(32)] }),
      /does not consume the persisted source deposit/,
    ],
    [
      'missing inclusion block',
      commitment({ inclusionBlockIdHex: '' }),
      /commit inclusion block id must be even-length hex/,
    ],
    [
      'invalid inclusion height',
      commitment({ inclusionHeight: -1 }),
      /missing a valid inclusion height/,
    ],
  ])('rejects commitment inclusion bound to %s', (_label, transaction, expected) => {
    expect(() => inspectPegInCommitmentInclusionV1({
      commitment: transaction,
      expectedTransactionIdHex: transactionId,
      sourceBoxIdHex: sourceBoxId,
    })).toThrow(expected);
  });

  it('accepts only the exact pure-ERG committed vault bindings', () => {
    expect(assertExactCommittedVaultV1(
      intent(),
      committedVault(),
      vaultErgoTree,
    )).toBe(vaultBoxId);
  });

  it('sums only exact canonical non-refundable vault backing', () => {
    expect(sumCanonicalCommittedVaultBackingV1([
      backingVault(),
      backingVault({
        boxIdHex: '45'.repeat(32),
        valueNanoErg: 7_000_000n,
        registers: {
          ...backingVault().registers,
          R4: encodeCollByteRegister(Buffer.from('12'.repeat(32), 'hex')),
          R6: encodeLongRegister(7_000_000),
        },
      }),
    ], vaultErgoTree)).toBe(12_000_000n);
  });

  it.each([
    ['wrong tree', [backingVault({ ergoTreeHex: '1009' })], /wrong ErgoTree/],
    ['token asset', [backingVault({ tokenCount: 1 })], /must be pure ERG/],
    [
      'extra register',
      [backingVault({ registers: { ...backingVault().registers, R8: '0e00' } })],
      /exactly R4-R7/,
    ],
    [
      'amount drift',
      [backingVault({ registers: { ...backingVault().registers, R6: encodeLongRegister(4_999_999) } })],
      /must equal its positive box value/,
    ],
    ['duplicate box', [backingVault(), backingVault()], /duplicates box/],
  ])('rejects %s from the backing sum', (_label, boxes, expected) => {
    expect(() => sumCanonicalCommittedVaultBackingV1(
      boxes as CanonicalCommittedVaultBackingBoxV1[],
      vaultErgoTree,
    )).toThrow(expected);
  });

  it.each([
    ['vault tree', committedVault({ ergoTreeHex: '1009' }), /wrong ErgoTree/],
    ['vault value', committedVault({ valueNanoErg: 4_999_999n }), /does not equal/],
    [
      'asset lane',
      committedVault({ tokenCount: 1 }),
      /must be pure ERG/,
    ],
    [
      'source box',
      committedVault({
        registers: {
          ...committedVault().registers,
          R4: encodeCollByteRegister(Buffer.from('77'.repeat(32), 'hex')),
        },
      }),
      /R4 binding mismatch/,
    ],
    [
      'target H160',
      committedVault({
        registers: {
          ...committedVault().registers,
          R5: encodeCollByteRegister(Buffer.from('77'.repeat(20), 'hex')),
        },
      }),
      /R5 binding mismatch/,
    ],
    [
      'amount register',
      committedVault({
        registers: {
          ...committedVault().registers,
          R6: encodeLongRegister(4_999_999),
        },
      }),
      /R6 binding mismatch/,
    ],
    [
      'depositor provenance',
      committedVault({
        registers: {
          ...committedVault().registers,
          R7: encodeCollByteRegister(Buffer.from('0008cd02' + '77'.repeat(32), 'hex')),
        },
      }),
      /R7 binding mismatch/,
    ],
  ])('rejects a committed vault with a mismatched %s', (_label, box, expected) => {
    expect(() => assertExactCommittedVaultV1(intent(), box, vaultErgoTree)).toThrow(expected);
  });

  it('requires depositor provenance before evaluating the committed vault', () => {
    expect(() => assertExactCommittedVaultV1(
      intent({ depositorErgoTreeHex: null }),
      committedVault(),
      vaultErgoTree,
    )).toThrow('missing persisted depositor ErgoTree provenance');
  });

  it('rejects an unknown committed-vault asset profile before evaluating funds', () => {
    expect(() => assertExactCommittedVaultV1(
      intent({ assetProfileId: 'e2s.substrate-grandpa-v1.asset.token.v1' }),
      committedVault(),
      vaultErgoTree,
    )).toThrow('unsupported Substrate/GRANDPA V1 asset profile');
  });

  it('selects only the explicitly versioned deployment bound to the exact vault tree', () => {
    const deployed = {
      mainChainLock: {
        address: 'mcl',
        ergoTreeHex: '1001',
        version: 'committed-vault-v3',
        settlementVaultErgoTreeHex: vaultErgoTree,
      },
      mainChainAggregateUnlockTrustless: {
        address: 'vault',
        ergoTreeHex: vaultErgoTree,
      },
    };
    expect(resolveActivePegInDeploymentV1(deployed)).toEqual({
      lockAddress: 'mcl',
      lockErgoTreeHex: '1001',
      vaultAddress: 'vault',
      vaultErgoTreeHex: vaultErgoTree,
    });
    expect(resolveActivePegInDeploymentV1({
      ...deployed,
      mainChainLock: {
        address: 'legacy',
        ergoTreeHex: '1000',
      },
    })).toBeNull();
    expect(() => resolveActivePegInDeploymentV1({
      ...deployed,
      mainChainLock: {
        ...deployed.mainChainLock,
        settlementVaultErgoTreeHex: '1009',
      },
    })).toThrow('does not match the deployed V2 vault');
  });
});
