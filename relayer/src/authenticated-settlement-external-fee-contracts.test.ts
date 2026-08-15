import { createHash } from 'crypto';
import { readFileSync } from 'fs';

import { describe, expect, it } from 'vitest';

const unlockSource = readFileSync(
  new URL(
    '../../contracts/MainChainAggregateUnlockAuthenticatedExternalFeeV1.es',
    import.meta.url,
  ),
  'utf8',
);
const duplicatePreventionSource = readFileSync(
  new URL(
    '../../contracts/DoubleUnlockPreventionAuthenticatedExternalFeeV1.es',
    import.meta.url,
  ),
  'utf8',
);
const legacyUnlockSource = readFileSync(
  new URL('../../contracts/MainChainAggregateUnlockAuthenticated.es', import.meta.url),
  'utf8',
);
const legacyDuplicatePreventionSource = readFileSync(
  new URL('../../contracts/DoubleUnlockPreventionAuthenticated.es', import.meta.url),
  'utf8',
);

function normalizedSourceSha256(source: string): string {
  return createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex');
}

describe('authenticated external-fee settlement contract boundary', () => {
  it('preserves the frozen authenticated V2 proof, burn, tracker, and authority semantics', () => {
    expect(unlockSource).toContain('4532535f5350565f5632');
    expect(unlockSource).toContain(
      '4532535f54525553544c4553535f4255524e5f4c4541465f5631',
    );
    expect(unlockSource).toContain(
      '4532535f54525553544c4553535f4255524e5f4e4f44455f5631',
    );
    expect(unlockSource).toContain(
      '4532535f54525553544c4553535f4255524e5f49445f5631',
    );
    expect(unlockSource).toContain('encodedLeaf.size == 205');
    expect(unlockSource).toContain('trackerValue.size == 264');
    expect(unlockSource).toContain('expectedBurnId == burnId');
    expect(unlockSource).toContain('expectedTrackerKey == trackerKey');
    expect(unlockSource).toContain('eventRoot == merkleRoot');
    expect(unlockSource).toContain(
      'recipientHash == blake2b256(payoutOut.propositionBytes)',
    );
    expect(unlockSource).toContain('assetId == zero32');
    expect(unlockSource).toContain(
      'trackerFinalityAttestor != bridgeCommitteeMetadata',
    );
    expect(unlockSource).not.toContain('committeeOk');
  });

  it('requires the exact three-input external-fee topology and neutral miner fee', () => {
    expect(unlockSource).toContain('INPUTS.size == 3');
    expect(unlockSource).toContain('SELF.id == INPUTS(1).id');
    expect(unlockSource).toContain('val externalFeeIn = INPUTS(2)');
    expect(unlockSource).toContain('externalFeeIn.tokens.size == 0');
    expect(unlockSource).toContain('minerFeeOut.tokens.size == 0');
    expect(unlockSource).toContain('externalFeeIn.value == minerFeeOut.value');
    expect(unlockSource).toContain('minerFeeOut.propositionBytes == minerFeeTree');
    expect(unlockSource).toContain('minerFeeOut.value >= 1000000L');
    expect(unlockSource).toContain('minerFeeOut.value <= 2100000L');
  });

  it('decreases the vault by the burn amount only and rejects positive dust', () => {
    expect(unlockSource).toContain(
      'val remainingVaultValue = SELF.value - amount',
    );
    expect(unlockSource).not.toContain(
      'SELF.value - amount - minerFeeOut.value',
    );
    expect(unlockSource).toContain(
      'remainingVaultValue == 0L && OUTPUTS.size == 3',
    );
    expect(unlockSource).toContain(
      'remainingVaultValue >= 1000000L && OUTPUTS.size == 4',
    );
    expect(unlockSource).toContain(
      'vaultSuccessor.value == remainingVaultValue',
    );
    expect(unlockSource).toContain(
      'vaultSuccessor.propositionBytes == SELF.propositionBytes',
    );
    expect(unlockSource).toContain(
      'vaultSuccessor.R7[Coll[Byte]].get == SELF.R7[Coll[Byte]].get',
    );
  });

  it('binds replay protection to the new unlock tree and independently checks fee neutrality', () => {
    expect(duplicatePreventionSource).toContain(
      'AUTHENTICATED_EXTERNAL_FEE_UNLOCK_HASH_PLACEHOLDER',
    );
    expect(duplicatePreventionSource).not.toContain(
      '"AUTHENTICATED_UNLOCK_HASH_PLACEHOLDER"',
    );
    expect(duplicatePreventionSource).toContain('INPUTS.size == 3');
    expect(duplicatePreventionSource).toContain('SELF.id == INPUTS(0).id');
    expect(duplicatePreventionSource).toContain(
      'blake2b256(INPUTS(1).propositionBytes) == unlockErgoTreeHash',
    );
    expect(duplicatePreventionSource).toContain(
      'val externalFeeIn = INPUTS(2)',
    );
    expect(duplicatePreventionSource).toContain(
      '(OUTPUTS.size == 3 || OUTPUTS.size == 4)',
    );
    expect(duplicatePreventionSource).toContain(
      'externalFeeIn.tokens.size == 0',
    );
    expect(duplicatePreventionSource).toContain(
      'minerFeeOut.tokens.size == 0',
    );
    expect(duplicatePreventionSource).toContain(
      'externalFeeIn.value == minerFeeOut.value',
    );
    expect(duplicatePreventionSource).toContain(
      'minerFeeOut.propositionBytes == minerFeeTree',
    );
    expect(duplicatePreventionSource).toContain(
      'minerFeeOut.value >= 1000000L',
    );
    expect(duplicatePreventionSource).toContain(
      'minerFeeOut.value <= 2100000L',
    );
    expect(duplicatePreventionSource).toContain(
      'val preserveValue = successor.value == SELF.value',
    );
    expect(duplicatePreventionSource).toContain(
      'successor.R5[AvlTree].get == modifiedTree',
    );
  });

  it('keeps the legacy authenticated V2 source frozen and fee-from-vault', () => {
    expect(normalizedSourceSha256(legacyUnlockSource)).toBe(
      'a90cffcc26373c2861524b81368834a803372d705fd33c16913b22b79c08e82e',
    );
    expect(normalizedSourceSha256(legacyDuplicatePreventionSource)).toBe(
      'c4947b034b40ebf8c6385d48da1e8c109a98958cb9c1d5431b9714853ad24a33',
    );
    expect(legacyUnlockSource).toContain('INPUTS.size == 2');
    expect(legacyUnlockSource).toContain(
      'SELF.value - amount - minerFeeOut.value',
    );
    expect(legacyDuplicatePreventionSource).toContain('INPUTS.size == 2');
    expect(legacyDuplicatePreventionSource).toContain(
      'val preserveValue = successor.value >= SELF.value',
    );
    expect(legacyDuplicatePreventionSource).not.toContain(
      'AUTHENTICATED_EXTERNAL_FEE_UNLOCK_HASH_PLACEHOLDER',
    );
  });
});
