import { readFileSync } from 'fs';

import { describe, expect, it } from 'vitest';

const unlockSource = readFileSync(
  new URL('../../contracts/MainChainAggregateUnlockAuthenticated.es', import.meta.url),
  'utf8',
);
const duplicatePreventionSource = readFileSync(
  new URL('../../contracts/DoubleUnlockPreventionAuthenticated.es', import.meta.url),
  'utf8',
);

describe('authenticated V2 settlement contract boundary', () => {
  it('uses the authenticated V2 tracker as a read-only data input', () => {
    expect(unlockSource).toContain('CONTEXT.dataInputs.size == 1');
    expect(unlockSource).toContain('CONTEXT.dataInputs(0)');
    expect(unlockSource).toContain('4532535f5350565f5632');
    expect(unlockSource).toContain('trackerValue.size == 264');
    expect(unlockSource).toContain('HEIGHT.toLong - anchorHeight >= minAnchorConfirmations');
    expect(unlockSource).not.toContain('committeeOk');
    expect(unlockSource).not.toContain('&& committee');
  });

  it('binds the burn leaf, payout, exact DUP update, and pooled vault atomically', () => {
    expect(unlockSource).toContain('expectedBurnId == burnId');
    expect(unlockSource).toContain('expectedTrackerKey == trackerKey');
    expect(unlockSource).toContain('eventRoot == merkleRoot');
    expect(unlockSource).toContain('recipientHash == blake2b256(payoutOut.propositionBytes)');
    expect(unlockSource).toContain('payoutOut.value == amount');
    expect(unlockSource).toContain('assetId == zero32');
    expect(unlockSource).toContain('dupOut.R5[AvlTree].get == dupModified');
    expect(unlockSource).toContain('SELF.id == INPUTS(1).id');
    expect(unlockSource).toContain('(exactSpend || partialSpend)');
  });

  it('rejects the legacy same-proposition tracker and bridge committee shape', () => {
    expect(unlockSource).toContain('trackerIn.R9[SigmaProp].get');
    expect(unlockSource).toContain('dupIn.R6[SigmaProp].get');
    expect(unlockSource).toContain(
      'trackerFinalityAttestor != bridgeCommitteeMetadata',
    );
    expect(unlockSource).toContain('authoritySeparationOk &&');
  });

  it('requires the replay singleton to agree with the exact settlement contract', () => {
    expect(duplicatePreventionSource).toContain('AUTHENTICATED_UNLOCK_HASH_PLACEHOLDER');
    expect(duplicatePreventionSource).toContain(
      'blake2b256(INPUTS(1).propositionBytes) == unlockErgoTreeHash',
    );
    expect(duplicatePreventionSource).toContain('SELF.id == INPUTS(0).id');
    expect(duplicatePreventionSource).toContain('CONTEXT.dataInputs.size == 1');
    expect(duplicatePreventionSource).toContain('successor.R5[AvlTree].get == modifiedTree');
    expect(duplicatePreventionSource).not.toContain('committeeOk');
    expect(duplicatePreventionSource).not.toContain('&& committee');
  });
});
