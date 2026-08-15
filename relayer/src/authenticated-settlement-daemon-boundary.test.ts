import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const daemon = readFileSync(join(process.cwd(), 'src', 'relayer-daemon.ts'), 'utf8');
const authenticatedTrackerReadOnlyClient = readFileSync(
  join(process.cwd(), 'src', 'authenticated-spv-tracker-read-only-node-client.ts'),
  'utf8',
);
const candidateReconciliationCore = readFileSync(
  join(
    process.cwd(),
    'src',
    'relayer-core',
    'authenticated-settlement-candidate-reconciliation.ts',
  ),
  'utf8',
);
const candidateReconciliationJournal = readFileSync(
  join(
    process.cwd(),
    'src',
    'adapters',
    'authenticated-settlement-candidate-journal.ts',
  ),
  'utf8',
);
const candidateReconciliationObservation = readFileSync(
  join(
    process.cwd(),
    'src',
    'adapters',
    'authenticated-settlement-candidate-observation.ts',
  ),
  'utf8',
);
const backingInventoryAdapter = readFileSync(
  join(
    process.cwd(),
    'src',
    'adapters',
    'peg-out-backing-inventory-state.ts',
  ),
  'utf8',
);
const databaseLossRecovery = readFileSync(
  join(
    process.cwd(),
    'src',
    'apps',
    'bridge-daemon',
    'substrate-federated-database-loss-recovery-v1.ts',
  ),
  'utf8',
);
const candidateReconciliationApp = readFileSync(
  join(
    process.cwd(),
    'src',
    'apps',
    'bridge-daemon',
    'authenticated-settlement-candidate-reconciliation.ts',
  ),
  'utf8',
);

describe('authenticated settlement daemon boundary', () => {
  it('rechecks canonical burn coordinates and configured sidechain finality before settlement', () => {
    expect(daemon).toContain(
      'currentSidechainHeight = await this.sidechain.getCurrentBlockNumber()',
    );
    expect(daemon).toContain(
      'const canonicalBlock = await this.sidechain.getBlock(receipt.blockNumber)',
    );
    expect(daemon).toContain('canonicalBlockHash,');
    expect(daemon).toContain('requiredSidechainConfirmations: PROTOCOL_PARAMS.confirmationDepth');
    expect(daemon).toContain('classifyPegOutBurnForSettlement(result)');
  });

  it('separates the sidechain high-water mark from the completed peg-out scan cursor', () => {
    expect(daemon).toContain('const sidechainRollback = evaluateSidechainRollback(');
    expect(daemon).toContain('this.lastSidechainHeight = sidechainRollback.highWaterHeight');
    expect(daemon).toContain('if (sidechainRollback.pegOutProcessingAllowed) {');
    expect(daemon).toContain(
      'let completePegOutInventory:',
    );
    expect(daemon).toContain(
      'completePegOutInventory = await this.processPegOuts(',
    );
    expect(daemon).toMatch(
      /persistPegOutObservationCursor\(this\.state, \{[\s\S]*observedSidechainHeight:[\s\S]*completePegOutInventory\?\.pinnedHeight \?\? sidechainHeight,[\s\S]*observationComplete: completePegOutInventory !== null/,
    );
    const syncMutation = daemon.slice(daemon.indexOf('persistPegOutObservationCursor('));
    expect(syncMutation.slice(0, syncMutation.indexOf('\n  }')))
      .not.toContain('this.lastSidechainHeight');
  });

  it('preserves the scan cursor after RPC or inventory-projection failure', () => {
    const start = daemon.indexOf('private async processPegOuts(');
    const end = daemon.indexOf('private async findAnchoredTrackerIngest', start);
    const processPegOuts = daemon.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(processPegOuts).toContain(
      '): Promise<Readonly<CompletePegOutBackingInventoryResult> | null> {',
    );
    expect(processPegOuts).toContain(
      'Peg-out backing observation failed; preserving the prior scan cursor',
    );
    expect(processPegOuts).toMatch(
      /catch \(error\) \{[\s\S]*preserving the prior scan cursor[\s\S]*return null;/,
    );
    expect(processPegOuts).toContain(
      'projectSubstrateFederatedDatabaseLossInventoryObservationV1({',
    );
    expect(databaseLossRecovery).toContain(
      'assertFrontierBackingReadAgreementProvenance(',
    );
  });

  it('invalidates active V2 candidates on Ergo or sidechain reorgs', () => {
    expect(daemon.match(/invalidateActiveAuthenticatedSettlementCandidates\(/g)).toHaveLength(3);
    expect(daemon).toContain('Invalidated authenticated settlement candidates after Ergo reorg');
    expect(daemon).toContain('Invalidated authenticated settlement candidates after sidechain rollback');
    expect(daemon).toContain('markPegOutBurnRevertedAndInvalidateCandidates(');
  });

  it('reconstructs tracker history from two read-only Ergo observations before using the local cache', () => {
    expect(daemon).toContain('await this.refreshAuthenticatedSpvTrackerHistory()');
    expect(daemon).toContain('reconstructAuthenticatedSpvTrackerHistoryFromIndependentSources({');
    expect(daemon).toContain('expectedGenesisBoxIdHex: tracker.genesisBoxId');
    expect(daemon).toContain('requires an immutable deployed genesisBoxId');
    expect(daemon.match(/readMatchingAuthenticatedSpvTrackerNodeNetwork\(/g)).toHaveLength(3);
    expect(daemon).toContain('observedNetworkBefore !== observedNetworkAfter');
    expect(daemon).toContain('observeAuthenticatedSpvTrackerTipCurrentOnIndependentSources({');
    expect(daemon).toContain('this.commitmentObservedErgoHeight = current.observedErgoHeight');
    expect(daemon).toContain('ERGO_AUTHENTICATED_TRACKER_WITNESS_NODE_URL');
    expect(daemon.match(
      /createBoundedAuthenticatedSpvTrackerReadOnlySource\((?:ERGO_CONFIG\.nodeUrl|witnessNodeUrl)\)/g,
    )).toHaveLength(2);
    expect(authenticatedTrackerReadOnlyClient)
      .toContain('maxContentLength: AUTHENTICATED_TRACKER_NODE_MAX_RESPONSE_BYTES');
    expect(authenticatedTrackerReadOnlyClient)
      .toContain('total > AUTHENTICATED_SPV_TRACKER_MAX_LINEAGE_BOXES');
    expect(authenticatedTrackerReadOnlyClient)
      .toContain('this.maxLineageBytes - accumulatedBytes');
    expect(authenticatedTrackerReadOnlyClient).toContain('maxRedirects: 0');
    expect(authenticatedTrackerReadOnlyClient).toContain('proxy: false');
    expect(authenticatedTrackerReadOnlyClient).not.toContain('post(');
    expect(authenticatedTrackerReadOnlyClient).not.toContain('api_key');
    expect(daemon).toContain('primary and witness observations must use distinct node origins');
    expect(daemon).toContain('this.state.replaceAuthenticatedSpvTrackerHistory(reconstruction)');
    expect(daemon).toContain('this.authenticatedTrackerHistoryReady = false');
    expect(daemon).toContain('Authenticated V2 settlement waiting for chain-reconstructed tracker history');
    expect(daemon).toMatch(
      /refreshAuthenticatedSpvTrackerHistory\(\)[\s\S]*if \(authenticatedTrackerHistoryReady\) \{[\s\S]*reconcileAuthenticatedSettlementCandidates\(\)/,
    );
    expect(daemon).toMatch(
      /if \(this\.authenticatedSettlement\) \{[\s\S]*await this\.refreshAuthenticatedSpvTrackerHistory\(\)[\s\S]*getAuthenticatedSpvTrackerIdentityByHeight/,
    );
    expect(daemon).toMatch(
      /prepareAuthenticatedSettlementUnsignedTx\(\{[\s\S]*preparedTrackerBoxId[\s\S]*await this\.refreshAuthenticatedSpvTrackerHistory\(\)[\s\S]*preparedTrackerBoxId !== this\.authenticatedTrackerTipBoxId[\s\S]*recordNativeVerifiedAuthenticatedSettlementCandidate\(\{/,
    );
  });

  it('recollects native proof and rebuilds the exact transaction after restart', () => {
    expect(daemon).toContain('await this.reconcileAuthenticatedSettlementCandidates()');
    expect(daemon).toContain('runAuthenticatedSettlementCandidateReconciliation({');
    expect(candidateReconciliationJournal)
      .toContain('state.getActiveAuthenticatedSettlementCandidates()');
    expect(candidateReconciliationObservation)
      .toContain('deps.ergo.getBlockHeaderHash(candidate.anchorHeaderHeight)');
    expect(candidateReconciliationObservation)
      .toContain('deps.ergo.getBoxByIdOrNull(candidate.trackerBoxId)');
    expect(candidateReconciliationObservation)
      .toContain('deps.ergo.getBoxByIdOrNull(candidate.dupInputBoxId)');
    expect(candidateReconciliationObservation)
      .toContain('deps.ergo.getBoxByIdOrNull(candidate.vaultBoxId)');
    expect(candidateReconciliationApp)
      .toContain('reconcileAuthenticatedSettlementCandidates({');
    expect(daemon).toContain('recollectAndRevalidateAuthenticatedSettlementCandidate({');
    expect(daemon).toContain('nativeCheckpointSource: this.nativeCheckpointSettlementSource');
    expect(daemon).toContain('settlementService: this.authenticatedSettlement');
    expect(candidateReconciliationCore)
      .toContain('Revalidated exact authenticated settlement candidate after restart');
    expect(candidateReconciliationJournal)
      .toContain('state.invalidateAuthenticatedSettlementCandidate(candidateId, reason)');
  });

  it('revokes process-local revalidation whenever a required remote view is unavailable', () => {
    expect(daemon).toContain(
      'AuthenticatedSettlementPreparationFacade | null',
    );
    expect(daemon).toContain(
      'createAuthenticatedSettlementPreparationFacade(settlementService)',
    );
    expect(daemon).not.toMatch(
      /this\.authenticatedSettlement\s*=\s*authenticatedSettlementDeployed\s*\?\s*settlementService/,
    );
    expect(candidateReconciliationCore).toMatch(
      /if \(burnStatus === 'unknown'\) \{\s*ports\.revalidations\.delete\(candidate\.candidateId\);/,
    );
    expect(candidateReconciliationCore)
      .toContain('const burnStatus = await ports.observations.observeBurn(pegOut)');
    expect(candidateReconciliationCore)
      .not.toContain('candidate burn observation unavailable');
    const trackerReadyIndex = daemon.indexOf(
      'if (authenticatedTrackerHistoryReady) {',
    );
    const candidateBoundaryIndex = daemon.indexOf(
      "'authenticated settlement candidate reconciliation'",
      trackerReadyIndex,
    );
    const candidateReconciliationIndex = daemon.indexOf(
      'await this.reconcileAuthenticatedSettlementCandidates();',
      candidateBoundaryIndex,
    );
    const pegInPendingIndex = daemon.indexOf(
      'if (this.pegInReorgReconciliationPending) {',
      candidateReconciliationIndex,
    );
    const pegInBoundaryIndex = daemon.indexOf(
      "'peg-in lifecycle selection'",
      pegInPendingIndex,
    );
    const pegInIndex = daemon.indexOf(
      'await this.processPegIns(ergoHeight);',
      pegInBoundaryIndex,
    );
    expect(trackerReadyIndex).toBeGreaterThanOrEqual(0);
    expect(candidateBoundaryIndex).toBeGreaterThan(trackerReadyIndex);
    expect(candidateReconciliationIndex).toBeGreaterThan(candidateBoundaryIndex);
    expect(pegInPendingIndex).toBeGreaterThan(candidateReconciliationIndex);
    expect(pegInBoundaryIndex).toBeGreaterThan(pegInPendingIndex);
    expect(pegInIndex).toBeGreaterThan(pegInBoundaryIndex);
    expect(candidateReconciliationCore).toMatch(
      /catch \(error: unknown\) \{\s*ports\.revalidations\.delete\(candidate\.candidateId\);[\s\S]*Authenticated settlement candidate reconciliation unavailable/,
    );
    expect(daemon).toMatch(
      /if \(!this\.authenticatedSettlement \|\| !this\.nativeCheckpointSettlementSource\) \{[\s\S]*return null;/,
    );
    expect(daemon).toMatch(
      /if \(!trackerIdentity \|\| !bridgeAddress\) \{[\s\S]*return null;/,
    );
    expect(candidateReconciliationCore).toMatch(
      /const revalidated = await ports\.revalidator\.recollect[\s\S]*catch \(error: unknown\) \{\s*ports\.revalidations\.delete\(candidate\.candidateId\);[\s\S]*Authenticated settlement candidate restart revalidation remains fail-closed/,
    );
  });

  it('verifies native finality and exact cross-layer bindings before journaling a V2 candidate', () => {
    expect(daemon).toContain('loadNativeVerifierExecutionAuthorityFromEnvironment()');
    expect(daemon).toContain('loadNativeCheckpointSettlementSourceFromEnvironment(');
    expect(daemon).toMatch(
      /loadNativeVerifierExecutionAuthorityFromEnvironment\(\)[\s\S]*loadNativeCheckpointSettlementSourceFromEnvironment\([\s\S]*nativeExecutionAuthority \?\? undefined/,
    );
    expect(daemon).toContain('Authenticated V2 settlement waiting for native checkpoint verification configuration');
    expect(daemon).toContain('collectForSettlement({');
    expect(daemon).toContain('collectFrontierBurnProofForPegOut({');
    expect(daemon).toContain('bindNativeCheckpointToAuthenticatedSettlement({');
    expect(daemon).toContain('prepareAuthenticatedSettlementUnsignedTx({');
    expect(daemon).toContain('recordNativeVerifiedAuthenticatedSettlementCandidate({');
    expect(daemon).toContain('Authenticated V2 candidate journal holds peg-outs fail-closed');
    expect(daemon).toMatch(
      /if \(this\.authenticatedSettlement\) \{[\s\S]*collectForSettlement\([\s\S]*collectFrontierBurnProofForPegOut\([\s\S]*bindNativeCheckpointToAuthenticatedSettlement\([\s\S]*prepareAuthenticatedSettlementUnsignedTx\([\s\S]*recordNativeVerifiedAuthenticatedSettlementCandidate\([\s\S]*return inventoryResult;[\s\S]*New V1 payout execution is absent/,
    );
  });

  it('persists and reconciles V2 burns by event identity rather than transaction hash alone', () => {
    expect(databaseLossRecovery).toContain('deriveTrustlessBurnIdHex({');
    expect(databaseLossRecovery).toContain('burnIdHex: deriveTrustlessBurnIdHex({');
    expect(databaseLossRecovery).toContain('sidechainIdHex,');
    expect(daemon).toContain('createPegOutBackingInventoryPersistence(this.state)');
    expect(backingInventoryAdapter)
      .toContain('state.getPegOutByBurnId(entry.burnIdHex)');
    expect(backingInventoryAdapter).toContain('sidechainId: entry.sidechainIdHex');
    expect(candidateReconciliationCore)
      .toContain('ports.journal.findPegOutByBurnId(candidate.burnId)');
    expect(candidateReconciliationCore)
      .toContain('candidate.burnId,');
    expect(candidateReconciliationJournal)
      .toContain('state.getPegOutByBurnId(burnId)');
    expect(candidateReconciliationJournal)
      .toContain('{ burnId }, reason');
  });

  it('requires a global event index and derives one identity per burn event', () => {
    expect(databaseLossRecovery).toContain(
      "'database-loss inventory burn log index'",
    );
    expect(databaseLossRecovery).toContain('eventIndex: sidechainLogIndex');
    expect(backingInventoryAdapter)
      .toContain('state.getPegOutByBurnId(entry.burnIdHex)');
    expect(databaseLossRecovery).toMatch(
      /const sidechainLogIndex = nonnegativeSafeInteger\([\s\S]*deriveTrustlessBurnIdHex\([\s\S]*eventIndex: sidechainLogIndex/,
    );
  });

  it('does not add an authenticated signer, submitter, or broadcast route', () => {
    expect(daemon).not.toContain('submitAuthenticatedSettlement');
    expect(daemon).not.toContain('signAuthenticatedSettlement');
    expect(daemon).not.toContain('checkRevalidatedAuthenticatedSettlementCandidate(');
    expect(daemon).toContain('Prepared authenticated V2 settlement candidate without signing');
  });
});
