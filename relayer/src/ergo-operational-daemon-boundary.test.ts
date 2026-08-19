import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const daemon = readFileSync(
  join(process.cwd(), 'src', 'relayer-daemon.ts'),
  'utf8',
).replace(/\r\n?/g, '\n');
const stateTracker = readFileSync(
  join(process.cwd(), 'src', 'state-tracker.ts'),
  'utf8',
).replace(/\r\n?/g, '\n');

function methodSource(startMarker: string, endMarker: string): string {
  const start = daemon.indexOf(startMarker);
  const end = daemon.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return daemon.slice(start, end);
}

describe('active Ergo operational daemon boundaries', () => {
  it('reconciles historical SCS IDs without retaining a new mutation path', () => {
    const source = methodSource(
      'private async updateSCSOracle',
      '//  D. SETTLEMENT CONFIRMATION',
    );
    const reconciliationIndex = source.indexOf(
      'reconcileHistoricalScsAttempts({',
    );
    const observationBoundaryIndex = source.indexOf(
      'if (reconciliation.reconciliationPending) return;',
    );
    const observationOnlySource = source.slice(observationBoundaryIndex);

    expect(daemon).not.toContain('scsPendingTxId');
    expect(daemon).not.toContain('scsPendingAtHeight');
    expect(daemon).not.toContain("'mempool-orphan'");
    expect(reconciliationIndex).toBeGreaterThan(-1);
    expect(observationBoundaryIndex).toBeGreaterThan(reconciliationIndex);
    expect(source).not.toContain('submitScsOracleUpdate({');
    expect(source).toContain('getAttempt: expectedTxId =>');
    expect(source).toContain('getSourceBox: sourceBoxId =>');
    expect(source).toContain(
      'getReconcilableErgoOperationalTransactionAttempts(',
    );
    expect(source).toContain('abandonErgoOperationalTransactionAttempt(');
    expect(observationOnlySource).toContain('`0x${finalizedHeadHash}`');
    expect(observationOnlySource).toContain(
      'requestSubstrateFinalizedHeadHash(',
    );
    expect(observationOnlySource).toContain(
      'SCS oracle mutation is retired; finalized sidechain state is observation-only',
    );
    expect(observationOnlySource).not.toContain('this.state.');
    expect(observationOnlySource).not.toContain('runErgoOperationalTransaction');
    expect(observationOnlySource).not.toContain('submit');
    expect(source).not.toContain('this.ergoSigner.loadSigner(');
    expect(source).not.toContain('this.ergo.getUnspentBoxesByAddress(');
    expect(source).not.toContain('this.ergo.findSingletonBox(');
  });

  it('does not commit a DUP heartbeat key before ten confirmations', () => {
    const source = methodSource(
      'private async observeOperationalInclusion',
      'private async storageRentCheck',
    );
    const confirmationGuard = source.indexOf(
      'confirmations < ERGO_OPERATIONAL_FINAL_CONFIRMATIONS',
    );
    const confirmIndex = source.indexOf(
      'this.state.confirmErgoOperationalTransactionAttempt({',
    );

    expect(confirmationGuard).toBeGreaterThan(-1);
    expect(confirmIndex).toBeGreaterThan(confirmationGuard);
    expect(source).toContain('attempt.expectedTxId');
    expect(source).toContain('attempt.sourceBoxId');
    expect(source).toContain('abandonErgoOperationalTransactionAttempt(');
    expect(source).toContain('quarantineErgoOperationalTransactionAttempt(');
    expect(source).not.toContain('this.state.insertAvlKey(');
    expect(stateTracker).toContain(
      'INSERT OR IGNORE INTO avl_tree_history (key_hex, value_hex)',
    );
    expect(source).toContain('?? currentHeight - confirmations,');
    expect(source).not.toContain('currentHeight - confirmations + 1');
  });

  it('reopens or rebinds confirmed operational history after reorg', () => {
    const source = methodSource(
      'private async reconcileConfirmedOperationalTransactionsAfterReorg',
      'private async reconcilePegIns',
    );
    const observeIndex = source.indexOf(
      'this.ergo.getTransaction(attempt.expectedTxId)',
    );
    const canonicalHeaderIndex = source.indexOf(
      'await this.ergo.getBlockHeaderHash(attempt.confirmationHeight)',
    );
    const reopenAfterHeaderIndex = source.indexOf(
      'this.state.reopenConfirmedErgoOperationalTransactionAttempt(',
      canonicalHeaderIndex,
    );

    expect(observeIndex).toBeGreaterThan(-1);
    expect(source).toContain(
      'reopenConfirmedErgoOperationalTransactionAttempt(',
    );
    expect(source).toContain(
      'rebindConfirmedErgoOperationalTransactionAttempt({',
    );
    expect(canonicalHeaderIndex).toBeGreaterThan(observeIndex);
    expect(reopenAfterHeaderIndex).toBeGreaterThan(canonicalHeaderIndex);
    expect(source).toContain(
      'currentHeight - attempt.confirmationHeight\n          < ERGO_OPERATIONAL_FINAL_CONFIRMATIONS',
    );
    expect(source).not.toContain(
      'currentHeight - attempt.confirmationHeight + 1',
    );
    expect(source).not.toContain('this.state.removeAvlKey(');
    expect(source).not.toContain('submitDupHeartbeatTouch');
    expect(source).not.toContain('npostDirect');
  });

  it('keeps storage-rent monitoring parameter-bound, byte-exact, and observation-only', () => {
    const monitor = methodSource(
      'private async storageRentCheck',
      'private async projectStorageRentBox',
    );
    const projection = methodSource(
      'private async projectStorageRentBox',
      'private reportStorageRentProjection',
    );

    expect(monitor).toContain('await observeErgoStorageRentParameters(');
    expect(monitor).toContain('requireErgoReadQuorumDecisionObservation(');
    expect(monitor).toContain('this.ergoReadQuorumSources');
    expect(monitor).toContain('readQuorumDecision');
    expect(monitor).toContain('getUnspentBoxesByAddressPage(');
    expect(monitor).toContain('limit: 129');
    expect(monitor).not.toContain('getUnspentBoxesByAddress(');
    for (const surfaceId of [
      'side-chain-state-v1',
      'double-unlock-prevention-v1',
      'double-unlock-prevention-aggregate-v1',
      'substrate-grandpa-authenticated-spv-tracker-v2',
      'double-unlock-prevention-authenticated-v2',
      'double-unlock-prevention-aggregate-batch-v1',
    ]) {
      expect(monitor).toContain(surfaceId);
    }
    expect(monitor).toContain('LEGACY_SPV_TRACKER_STORAGE_RENT_PROFILE');
    expect(projection).toContain('assertStorageRentSurfaceTree({');
    expect(projection).toContain('this.storageRentErgo.getBoxByIdBinary(');
    expect(daemon).toContain(
      'maxResponseBytes: STORAGE_RENT_MONITOR_MAX_RESPONSE_BYTES',
    );
    expect(projection).toContain('serializedBoxSizeBytesFromHex(serializedBoxHex)');
    expect(projection).toContain('parameters.expectedTipHeight');
    expect(projection).toContain(
      'storageFeeFactorNanoErgPerByte: parameters.storageFeeFactorNanoErgPerByte',
    );
    expect(`${monitor}\n${projection}`).not.toContain(
      'buildLegacySpvTrackerMaintenanceCandidate',
    );
    expect(`${monitor}\n${projection}`).not.toContain('getSignerKeys(');
    expect(`${monitor}\n${projection}`).not.toContain('submit');
    expect(`${monitor}\n${projection}`).not.toContain('broadcast(');
  });

  it('preserves the prior reorg baseline when header verification is unavailable', () => {
    const source = methodSource(
      'private async tick(): Promise<void>',
      'private async processPegIns',
    );
    const currentTipHoldIndex = source.indexOf(
      'Ergo read quorum is unavailable; holding this cycle fail-closed',
    );
    const unavailableIndex = source.indexOf(
      'ergoReorgCheckUnavailable = true',
    );
    const holdIndex = source.indexOf(
      'preserving the prior baseline and holding this cycle fail-closed',
    );
    const returnIndex = source.indexOf('return;', holdIndex);
    const baselineUpdateIndex = source.indexOf(
      'this.lastErgoHeight = ergoHeight',
    );

    expect(currentTipHoldIndex).toBeGreaterThan(-1);
    expect(source.indexOf('return;', currentTipHoldIndex)).toBeGreaterThan(
      currentTipHoldIndex,
    );
    expect(unavailableIndex).toBeGreaterThan(-1);
    expect(holdIndex).toBeGreaterThan(unavailableIndex);
    expect(returnIndex).toBeGreaterThan(holdIndex);
    expect(baselineUpdateIndex).toBeGreaterThan(returnIndex);
    expect(source).toContain(
      'this.lastErgoHeaderId = currentErgoHeaderId',
    );
    expect(source).not.toContain('this.lastErgoHeaderId = null');
  });

  it('does not start watcher execution without an exact Ergo baseline', () => {
    const source = methodSource(
      'async start(): Promise<void>',
      'private async tick(): Promise<void>',
    );
    const quorumIndex = source.indexOf(
      "'startup reorg baseline'",
    );
    const broadcastDisabledIndex = source.indexOf(
      'assertObservationOnlyDaemonBroadcastDisabled()',
    );
    const sidechainInitIndex = source.indexOf('await this.sidechain.init()');
    const headerBindingIndex = source.indexOf(
      'const ergoHeaderId = startupReadQuorum.tip.headerIdHex',
    );
    const baselineDecisionIndex = source.indexOf(
      "'startup baseline mutation'",
    );
    const baselineIndex = source.indexOf(
      'this.lastErgoHeaderId = ergoHeaderId',
    );
    const runningIndex = source.indexOf('this.running = true');

    expect(broadcastDisabledIndex).toBeGreaterThan(-1);
    expect(sidechainInitIndex).toBeGreaterThan(broadcastDisabledIndex);
    expect(quorumIndex).toBeGreaterThan(broadcastDisabledIndex);
    expect(headerBindingIndex).toBeGreaterThan(quorumIndex);
    expect(baselineDecisionIndex).toBeGreaterThan(headerBindingIndex);
    expect(baselineIndex).toBeGreaterThan(baselineDecisionIndex);
    expect(runningIndex).toBeGreaterThan(baselineIndex);
    expect(source).not.toContain('this.ergo.getCurrentHeight()');
    expect(source).not.toContain('this.ergo.getBlockHeaderHash(');
    expect(source).not.toContain('this.lastErgoHeaderId = null');
    expect(source).not.toContain('assertBroadcastStartupReadiness');
  });

  it('keeps storage-rent maintenance and committed-vault submission outside the daemon', () => {
    expect(daemon).not.toContain('submitPegInCommittedVaultTransition({');
    expect(daemon).not.toContain('ergo-operational-transaction-compatibility');
    expect(daemon).not.toContain('submitScsOracleUpdate({');
    expect(daemon).not.toContain('submitDupHeartbeatTouch({');
    expect(daemon).not.toContain('touchDUPSingleton(');
    expect(daemon).not.toContain('utxoConsolidationSweep(');
    expect(daemon).toContain('await this.observeMainChainLockFragmentation();');
    expect(daemon).toContain("requiredTransition: 'contract-defined-commit-or-refund'");
    expect(daemon).not.toContain('signAndSubmit');
  });
});
