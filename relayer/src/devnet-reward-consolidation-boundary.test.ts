import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const scriptPath = fileURLToPath(
  new URL('./scripts/devnet-consolidate-rewards.ts', import.meta.url),
);
const corePath = fileURLToPath(
  new URL('./relayer-core/devnet-reward-consolidation.ts', import.meta.url),
);

function readSource(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

describe('devnet reward consolidation capability boundary', () => {
  it('uses the split checked lifecycle instead of the generic sign-and-submit facade', () => {
    const source = readSource(scriptPath);
    expect(source).not.toContain('signAndSubmitDetailed');
    expect(source).not.toContain('signAndSubmit(');
    expect(source).toContain('deriveUnsignedTransactionId');
    expect(source).toContain('signTransactionForSubmission');
    expect(source).toContain("ncheck(\n          '/transactions/check'");
    expect(source).toContain('revalidateDevnetRewardConsolidationPlan');
    expect(source).toContain('assertBroadcastAllowed(`${LABEL} authorization`)');
    expect(source).toContain('assertBroadcastAllowed(`${LABEL} transport`)');
    expect(source).toContain("npostDirect(\n          '/transactions'");
    expect(source).toContain('confirmationObserver');
    expect(source).toContain('PATCHED_ERGO_CHAIN_ANCHOR_ID');
    expect(source).toContain('deriveDevnetRewardErgoTreeHex');
    expect(source).toContain('reserveErgoOperationalTransactionAttempt');
    expect(source).toContain('reconcileConfirmedRewardConsolidations');
    expect(source).toContain('getActiveErgoOperationalTransactionAttempts');
    expect(source.indexOf('await reconcileConfirmedRewardConsolidations('))
      .toBeLessThan(source.indexOf('await runFreshConsolidation('));
    expect(source.indexOf('reserveErgoOperationalTransactionAttempt'))
      .toBeLessThan(source.indexOf("npostDirect(\n          '/transactions'"));
  });

  it('keeps network, environment, signing and transport capabilities out of relayer-core', () => {
    const source = readSource(corePath);
    expect(source).not.toContain("from 'axios'");
    expect(source).not.toContain('process.env');
    expect(source).not.toContain('WALLET_MNEMONIC');
    expect(source).not.toContain('npostDirect');
    expect(source).not.toContain('signTransactionForSubmission');
    expect(source).not.toContain('/wallet/');
    expect(source).not.toContain('StateTracker');
    expect(source).toContain("DEVNET_REWARD_CONSOLIDATION_NODE_NETWORK = 'devnet'");
    expect(source).toContain('rewardErgoTreeHex !== deriveDevnetRewardErgoTreeHex');
  });
});
