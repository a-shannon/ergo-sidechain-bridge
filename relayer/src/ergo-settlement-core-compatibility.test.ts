import { describe, expect, it } from 'vitest';

import * as legacyEncoding from './ergo-encoding.js';
import * as legacyExtensionMembership from './ergo-extension-membership.js';
import * as legacyTransactionBalance from './tx-balance.js';
import * as coreEncoding from './ergo-settlement-core/ergo-encoding.js';
import * as coreExtensionMembership from './ergo-settlement-core/ergo-extension-membership.js';
import * as coreTransactionBalance from './ergo-settlement-core/tx-balance.js';
import type {
  AggregateSettlementUnsignedTx as CoreAggregateSettlementUnsignedTx,
  BoxLike as CoreBoxLike,
} from './ergo-settlement-core/settlement-transaction.js';
import type {
  AggregateSettlementUnsignedTx,
  BoxLike,
} from './aggregate-settlement-tx.js';
import type {
  BigIntChangePlan,
  ChangePlan,
} from './tx-balance.js';
import type {
  ErgoExtensionMembershipProof,
  ErgoExtensionMembershipProofStep,
  ErgoExtensionMembershipProofValidation,
  ErgoExtensionMerkleField,
  ErgoExtensionMerkleSide,
} from './ergo-extension-membership.js';

type LegacyTypeSurface = [
  BigIntChangePlan,
  ChangePlan,
  ErgoExtensionMembershipProof,
  ErgoExtensionMembershipProofStep,
  ErgoExtensionMembershipProofValidation,
  ErgoExtensionMerkleField,
  ErgoExtensionMerkleSide,
  AggregateSettlementUnsignedTx,
  BoxLike,
  CoreAggregateSettlementUnsignedTx,
  CoreBoxLike,
];

const legacyTypeSurfaceCompileCheck: LegacyTypeSurface | null = null;
void legacyTypeSurfaceCompileCheck;

function expectCompatibilityExports(
  legacy: Record<string, unknown>,
  core: Record<string, unknown>,
): void {
  for (const [name, value] of Object.entries(core)) {
    expect(legacy[name], `legacy export ${name}`).toBe(value);
  }
}

describe('ergo-settlement-core compatibility surface', () => {
  it('retains every extracted export at its legacy import path', () => {
    expectCompatibilityExports(legacyEncoding, coreEncoding);
    expectCompatibilityExports(legacyExtensionMembership, coreExtensionMembership);
    expectCompatibilityExports(legacyTransactionBalance, coreTransactionBalance);
  });

  it('pins the legacy runtime export names', () => {
    expect(Object.keys(legacyEncoding).sort()).toEqual([
      'EMPTY_AVL_DIGEST',
      'MINER_FEE',
      'MINER_FEE_TREE',
      'decodeAvlTreeRegisterDigest',
      'decodeBoundedCollByteRegister',
      'decodeCanonicalDlogSigmaPropRegister',
      'decodeCanonicalIntRegister',
      'decodeCanonicalLongRegister',
      'decodeCollByteRegister',
      'encodeAvlTreeRegister',
      'encodeCollByteRegister',
      'encodeIntRegister',
      'encodeLongRegister',
      'encodeSigmaPropRegister',
      'ensureSizeBit',
      'vlq',
    ]);
    expect(Object.keys(legacyExtensionMembership).sort()).toEqual([
      'ERGO_EXTENSION_MERKLE_DIGEST_SIZE',
      'ERGO_EXTENSION_MERKLE_INTERNAL_PREFIX',
      'ERGO_EXTENSION_MERKLE_LEAF_PREFIX',
      'ERGO_EXTENSION_MERKLE_LEVEL_SIZE',
      'ERGO_EXTENSION_MERKLE_MAX_DEPTH',
      'ERGO_EXTENSION_MERKLE_MIN_DEPTH',
      'ERGO_EXTENSION_MERKLE_SIDE_LEFT',
      'ERGO_EXTENSION_MERKLE_SIDE_LEFT_EMPTY',
      'ERGO_EXTENSION_MERKLE_SIDE_RIGHT',
      'ERGO_EXTENSION_MERKLE_SIDE_RIGHT_EMPTY',
      'buildErgoExtensionMembershipProof',
      'encodeErgoExtensionLeafData',
      'hashErgoExtensionInternal',
      'hashErgoExtensionLeaf',
      'parseErgoExtensionMembershipProof',
      'validateErgoExtensionMembershipProof',
      'verifyErgoExtensionMembership',
    ]);
    expect(Object.keys(legacyTransactionBalance).sort()).toEqual([
      'planChangeOrFee',
      'planChangeOrFeeBigInt',
      'safeNanoErgNumber',
    ]);
  });

  it('keeps compatibility/profile, policy and broad-crypto surfaces outside the core', () => {
    expect(legacyEncoding.EMPTY_AVL_DIGEST).toBe(
      '6aaafd25f895a30bc9cc00e6cc67a817f8e265e48cbfc700a1635bb002e62eb900',
    );
    expect(legacyEncoding.MINER_FEE).toBe(1_100_000);
    expect(legacyEncoding.MINER_FEE_TREE).toBe(
      '1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304',
    );

    expect('EMPTY_AVL_DIGEST' in coreEncoding).toBe(false);
    expect('MINER_FEE' in coreEncoding).toBe(false);
    expect('MINER_FEE_TREE' in coreEncoding).toBe(false);
    expect('decodeCanonicalDlogSigmaPropRegister' in coreEncoding).toBe(false);
  });
});
