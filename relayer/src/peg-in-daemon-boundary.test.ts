import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

describe('relayer daemon committed-vault peg-in boundary', () => {
  const source = readFileSync(
    join(process.cwd(), 'src', 'relayer-daemon.ts'),
    'utf8',
  ).replace(/\r\n/g, '\n');
  const frontierBackingAgreementSource = readFileSync(
    join(
      process.cwd(),
      'src',
      'adapters',
      'frontier-backing-read-agreement.ts',
    ),
    'utf8',
  ).replace(/\r\n/g, '\n');
  const databaseLossRecoverySource = readFileSync(
    join(
      process.cwd(),
      'src',
      'apps',
      'bridge-daemon',
      'substrate-federated-database-loss-recovery-v1.ts',
    ),
    'utf8',
  ).replace(/\r\n/g, '\n');

  it('keeps new deposits refundable while retaining historical reconciliation', () => {
    const start = source.indexOf('private async processPegIns');
    const end = source.indexOf('//  B. PEG-OUT', start);
    const method = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(method).not.toContain('this.pegInCoordinator.submitDetected');
    expect(method).toContain('this.pegInCoordinator.advance');
    expect(method).toContain("sourceClassification !== 'active_committed_vault'");
    expect(method).toContain(
      'Peg-in deposit remains refundable while authenticated V4 mint authority is unavailable',
    );
    expect(method).toContain('if (this.cycleCount % 100 === 1)');
    expect(method).not.toContain('peg-in commitment signer loading');
    expect(method).not.toContain('peg-in commitment fee selection');
    expect(method).not.toContain('this.sidechain.mintSERG(');
    expect(method).not.toContain("updatePegInStatus(pegIn.boxId, 'minting'");
  });

  it('fails closed when the active MCL is not explicitly marked committed-vault-v3', () => {
    expect(source).toContain('resolveActivePegInDeployment(this.deployed)');
    expect(source).toContain('Peg-in minting disabled: committed-vault-v3 deployment metadata is absent');
    expect(source).toContain('legacy_minted_requires_migration');
    expect(source).toContain('this.fundsReleaseHoldOpen = true');
  });

  it('restores the peg-in circuit breaker from persisted incidents after restart', () => {
    expect(source).toContain(
      'this.fundsReleaseHoldOpen = this.state.getPegInCircuitBreakerState().open',
    );
    expect(source).toContain('this.state.recordPegInSolvencyDeficitIncident({');
  });

  it('does not select a signer, fee box, or submission path for a new deposit', () => {
    const start = source.indexOf('private async processPegIns');
    const end = source.indexOf('//  B. PEG-OUT', start);
    const method = source.slice(start, end);
    expect(method).not.toContain('loadSigner(');
    expect(method).not.toContain('getUnspentBoxesByAddress(');
    expect(method).not.toContain('submitDetected(');
    expect(method).not.toContain('submitPegInCommittedVaultTransition');
  });

  it('stops the pending-row snapshot immediately after an advance incident', () => {
    const start = source.indexOf('private async processPegIns');
    const end = source.indexOf('//  B. PEG-OUT', start);
    const method = source.slice(start, end);
    const advance = method.indexOf(
      'const result = await this.pegInCoordinator.advance',
    );
    const incidentLatch = method.indexOf(
      "} else if (result.status === 'incident') {",
      advance,
    );
    const incidentBreak = method.indexOf(
      "if (result.status === 'incident') {",
      incidentLatch + "} else if (result.status === 'incident') {".length,
    );

    expect(advance).toBeGreaterThan(-1);
    expect(incidentLatch).toBeGreaterThan(advance);
    expect(method.slice(incidentLatch, incidentBreak))
      .toContain('this.fundsReleaseHoldOpen = true');
    expect(method.slice(incidentBreak)).toContain('break;');
  });

  it('latches coordinator incident-journal failures before lifecycle selection can continue', () => {
    const start = source.indexOf('private async processPegIns');
    const end = source.indexOf('//  B. PEG-OUT', start);
    const method = source.slice(start, end);
    const persistenceFailure = method.indexOf(
      'error instanceof PegInIncidentPersistenceError',
    );
    const latch = method.indexOf(
      'this.fundsReleaseHoldOpen = true',
      persistenceFailure,
    );
    const stop = method.indexOf('break;', latch);

    expect(persistenceFailure).toBeGreaterThan(-1);
    expect(latch).toBeGreaterThan(persistenceFailure);
    expect(stop).toBeGreaterThan(latch);
    expect(method.slice(latch, stop)).toContain(
      'LOCAL FUNDS-RELEASE HOLD: lifecycle incident persistence failed',
    );
  });

  it('latches unsafe legacy evidence before either lifecycle mutation can fail', () => {
    const start = source.indexOf('private async processPegIns');
    const end = source.indexOf('//  B. PEG-OUT', start);
    const method = source.slice(start, end);
    const legacyBranch = method.indexOf(
      "if (classification === 'legacy_minted_requires_migration')",
    );
    const latch = method.indexOf('this.fundsReleaseHoldOpen = true', legacyBranch);
    const classificationPersistence = method.indexOf(
      'this.state.updatePegInClassification',
      legacyBranch,
    );
    const incidentPersistence = method.indexOf(
      'this.state.markPegInIncident',
      legacyBranch,
    );

    expect(legacyBranch).toBeGreaterThan(-1);
    expect(latch).toBeGreaterThan(legacyBranch);
    expect(classificationPersistence).toBeGreaterThan(latch);
    expect(incidentPersistence).toBeGreaterThan(classificationPersistence);
  });

  it('holds startup and reorg lifecycle selection until exhaustive reconciliation is conclusive', () => {
    expect(source).toContain('private pegInReorgReconciliationPending = true');
    expect(source).toContain('await this.reconcilePegIns(newHeight, true)');
    expect(source).toContain(
      'this.state.getPegInsRequiringPostSubmissionReconciliation()',
    );
    expect(source).toContain('let allConclusive = true');
    expect(source).toContain('this.pegInReorgReconciliationPending = !(');
    expect(source).toContain('} else if (this.pegInReorgReconciliationPending) {');
    expect(source).toContain('if (this.pegInReorgReconciliationPending) {');
    expect(source).toContain(
      'Peg-in lifecycle selection held until every mint-submitted row is conclusively reconciled after startup or an Ergo reorg',
    );
  });

  it('never reclassifies an active minted row when its coordinator is unavailable', () => {
    const start = source.indexOf('private async reconcilePegIns');
    const end = source.indexOf('//  CONSERVATIVE BACKING ALARM', start);
    const method = source.slice(start, end);
    const activeBranch = method.indexOf(
      "if (pi.sourceClassification === 'active_committed_vault')",
    );
    const unavailableBranch = method.indexOf(
      'if (!this.pegInCoordinator)',
      activeBranch,
    );
    const hold = method.indexOf('allConclusive = false', unavailableBranch);
    const legacyMutation = method.indexOf(
      'this.state.updatePegInClassification',
      unavailableBranch,
    );

    expect(activeBranch).toBeGreaterThan(-1);
    expect(unavailableBranch).toBeGreaterThan(activeBranch);
    expect(hold).toBeGreaterThan(unavailableBranch);
    expect(method.slice(hold, legacyMutation)).toContain('continue;');
    expect(legacyMutation).toBeGreaterThan(hold);
  });

  it('latches periodic reconciliation when incident persistence fails', () => {
    const start = source.indexOf('private async reconcilePegIns');
    const end = source.indexOf('//  CONSERVATIVE BACKING ALARM', start);
    const method = source.slice(start, end);
    const persistenceFailure = method.indexOf(
      'err instanceof PegInIncidentPersistenceError',
    );
    const failureLatch = method.indexOf(
      'this.fundsReleaseHoldOpen = true',
      persistenceFailure,
    );
    const cursorAdvance = method.indexOf(
      'this.state.advancePegInReconciliationCursor',
    );
    const legacyBranch = method.indexOf(
      "if (classification === 'legacy_minted_requires_migration')",
    );
    const legacyLatch = method.indexOf(
      'this.fundsReleaseHoldOpen = true',
      legacyBranch,
    );
    const classificationPersistence = method.indexOf(
      'this.state.updatePegInClassification',
      legacyBranch,
    );
    const legacyPersistence = method.indexOf(
      'this.state.markPegInIncident',
      legacyBranch,
    );

    expect(persistenceFailure).toBeGreaterThan(-1);
    expect(failureLatch).toBeGreaterThan(persistenceFailure);
    expect(cursorAdvance).toBeGreaterThan(failureLatch);
    expect(legacyLatch).toBeGreaterThan(legacyBranch);
    expect(classificationPersistence).toBeGreaterThan(legacyLatch);
    expect(legacyPersistence).toBeGreaterThan(classificationPersistence);
    expect(method).toContain(
      'LOCAL FUNDS-RELEASE HOLD: reconciliation incident persistence failed',
    );
  });

  it('opens the shared durable solvency hold before attempting incident persistence', () => {
    const start = source.indexOf('private async checkSolvencyInvariant');
    const method = source.slice(start);
    const deficitBranch = method.indexOf(
      'if (projection.deficitNanoErg > 0n)',
    );
    const latch = method.indexOf('this.fundsReleaseHoldOpen = true', deficitBranch);
    const durableHold = method.indexOf(
      'this.state.holdFundsReleaseForOperatorReview(reason)',
      deficitBranch,
    );
    const persistence = method.indexOf(
      'this.state.recordPegInSolvencyDeficitIncident',
      deficitBranch,
    );

    expect(deficitBranch).toBeGreaterThan(-1);
    expect(latch).toBeGreaterThan(deficitBranch);
    expect(durableHold).toBeGreaterThan(latch);
    expect(persistence).toBeGreaterThan(durableHold);
    expect(method).toContain(
      'backing deficit observed before peg-out candidate advancement',
    );
    expect(method).toContain(
      'LOCAL FUNDS-RELEASE HOLD remains externally latched but the durable solvency incident could not be recorded',
    );
  });

  it('excludes refundable staging from eligible sERG backing', () => {
    const start = source.indexOf('private async checkSolvencyInvariant');
    const end = source.indexOf('// ─── Helpers', start);
    const method = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(method).toContain('requireErgoReadQuorumDecisionObservation(');
    expect(method).toContain('observeErgoReadQuorumAddressBoxes(');
    expect(method).toContain('assertErgoReadQuorumAddressBoxSnapshotProvenance(');
    expect(method).toContain("'quorum-bound vault backing inventory'");
    expect(method).not.toContain('this.ergo.getUnspentBoxesByAddress(');
    expect(method).toContain('this.pegInDeployment.vaultAddress');
    expect(method).not.toContain('this.pegInDeployment.lockAddress');
    expect(method).toContain('normalizeErgoEip12BoxSnapshot(');
    expect(method).toContain('sumCanonicalCommittedVaultBackingV1(');
    expect(method).toContain('this.pegInDeployment.vaultErgoTreeHex');
    expect(method).toContain('committed-vault-v3 backing profile unavailable');
  });

  it('requires branded terminal payout reconstruction before excluding a liability', () => {
    const start = source.indexOf('private async checkSolvencyInvariant');
    const end = source.indexOf('// ─── Helpers', start);
    const method = source.slice(start, end);
    const reconstruction = method.indexOf(
      'reconstructPegOutTerminalLiabilities({',
    );
    const observations = method.indexOf(
      'this.state.getOutstandingPegOutLiabilityObservations()',
      reconstruction,
    );
    const aggregateAttempts = method.indexOf(
      'this.state.getRecoverableAggregateSettlementAttempts()',
      reconstruction,
    );
    const projection = method.indexOf(
      'projectCrossLedgerBackingAlarmFromTerminalLiabilityResolution({',
      reconstruction,
    );

    expect(reconstruction).toBeGreaterThan(-1);
    expect(observations).toBeGreaterThan(reconstruction);
    expect(aggregateAttempts).toBeGreaterThan(observations);
    expect(projection).toBeGreaterThan(reconstruction);
    expect(method).toContain(
      'this.state.getActiveAuthenticatedSettlementCandidates()',
    );
    expect(method).toContain(
      'this.state.getRecoverableAuthenticatedSettlementSubmissionAttempts()',
    );
    expect(method).toContain('authenticatedSettlementBindings,');
    expect(method).toContain('this.authenticatedTrackerSources');
    expect(method).toContain('this.deployed.doubleUnlockPreventionAuthenticated');
    expect(method).toContain('this.aggregateSettlementRecoveryWitness');
    expect(method).toContain('sidechainBackingSnapshot,');
    expect(method).toContain('resolution: terminalLiabilityResolution');
  });

  it('holds funds release when the backing alarm is unavailable', () => {
    const start = source.indexOf('private async checkSolvencyInvariant');
    const helperStart = source.indexOf(
      'private holdFundsReleaseForUnavailableBackingAlarm',
      start,
    );
    const end = source.indexOf('// ─── Helpers', helperStart);
    const method = source.slice(start, helperStart);
    const helper = source.slice(helperStart, end);
    const catchBranch = method.lastIndexOf('} catch (err: any) {');
    const hold = helper.indexOf('this.fundsReleaseHoldOpen = true');
    const unavailable = helper.indexOf("this.solvencyHealthState = 'unavailable'");

    expect(catchBranch).toBeGreaterThan(-1);
    expect(method.slice(catchBranch)).toContain(
      'this.holdFundsReleaseForUnavailableBackingAlarm(',
    );
    expect(hold).toBeGreaterThan(-1);
    expect(unavailable).toBeGreaterThan(hold);
    expect(helper).toContain('this.state.holdFundsReleaseForOperatorReview(reason)');
    expect(helper).toContain('LOCAL FUNDS-RELEASE HOLD: backing alarm unavailable');
  });

  it('opens the same durable hold when the complete burn inventory is unavailable', () => {
    const start = source.indexOf('private async processPegOuts');
    const end = source.indexOf('private async findAnchoredTrackerIngest', start);
    const method = source.slice(start, end);

    expect(method.match(
      /this\.holdFundsReleaseForUnavailableBackingAlarm\(/g,
    )).toHaveLength(3);
    expect(method).toContain('complete peg-out backing observation failed');
    expect(method).toContain('complete peg-out inventory reconciliation failed');
    expect(method).toContain('Frontier backing pin revalidation failed');
    expect(method).toContain(
      'projectSubstrateFederatedDatabaseLossInventoryObservationV1({',
    );
  });

  it('statically binds a distinct Frontier witness through bounded identity reads', () => {
    const constructorStart = source.indexOf('constructor()');
    const constructorEnd = source.indexOf('\n  async start()', constructorStart);
    const constructor = source.slice(constructorStart, constructorEnd);
    const startMethodEnd = source.indexOf('\n  private async stop', constructorEnd);
    const startMethod = source.slice(constructorEnd, startMethodEnd);

    expect(constructor).toContain('getSidechainBackingSourceIdentityConfig()');
    expect(constructor).toContain(
      'createFrontierBackingReadAgreementSources({',
    );
    expect(constructor).toContain(
      'primaryClient: createBoundedFrontierBackingReadClient(',
    );
    expect(constructor).toContain(
      'witnessClient: createBoundedFrontierBackingReadClient(',
    );
    expect(constructor).not.toContain('primaryClient: this.sidechain');
    expect(constructor).not.toContain(
      'witnessClient: this.sidechainBackingWitness',
    );
    expect(constructor).not.toContain('this.sidechainBackingWitness');
    expect(constructor).toContain(
      'loadReviewedPegInMintRuntimeIdentity(',
    );
    expect(constructor).toContain(
      'expectedBridgeCodeHashHex: runtimeIdentity.bridgeCodeHashHex',
    );
    expect(constructor).toContain(
      'expectedSergCodeHashHex: runtimeIdentity.sergCodeHashHex',
    );
    expect(startMethod).toContain('await this.sidechain.init()');
    expect(startMethod).not.toContain('sidechainBackingWitness');
  });

  it('evaluates cross-ledger backing after a complete burn scan and before candidate selection', () => {
    const start = source.indexOf('private async processPegOuts');
    const end = source.indexOf('private async findAnchoredTrackerIngest', start);
    const method = source.slice(start, end);
    const projection = method.indexOf(
      'projectSubstrateFederatedDatabaseLossInventoryObservationV1({',
    );
    const observation = method.indexOf(
      'reconcileCompletePegOutBackingInventory({',
      projection,
    );
    const backingDecision = method.indexOf(
      'await this.checkSolvencyInvariant(',
      observation,
    );
    const hold = method.indexOf('if (this.isFundsReleaseHeld())', backingDecision);
    const pendingSelection = method.indexOf('const pendingPhase1', hold);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(projection).toBeGreaterThan(-1);
    expect(observation).toBeGreaterThan(projection);
    expect(backingDecision).toBeGreaterThan(observation);
    expect(hold).toBeGreaterThan(backingDecision);
    expect(pendingSelection).toBeGreaterThan(hold);
    expect(method.slice(backingDecision, hold)).toContain('sidechainBackingSnapshot');
    expect(source.match(/await this\.checkSolvencyInvariant\(/g)).toHaveLength(1);
  });

  it('revalidates every complete inventory entry before the backing alarm', () => {
    const start = source.indexOf('private async processPegOuts');
    const end = source.indexOf('private async findAnchoredTrackerIngest', start);
    const method = source.slice(start, end);
    const persistence = method.indexOf('reconcileCompletePegOutBackingInventory({');
    const stateAdapter = method.indexOf(
      'createPegOutBackingInventoryPersistence(this.state)',
      persistence,
    );
    const backingDecision = method.indexOf(
      'await this.checkSolvencyInvariant(',
      stateAdapter,
    );

    expect(persistence).toBeGreaterThan(-1);
    expect(stateAdapter).toBeGreaterThan(persistence);
    expect(backingDecision).toBeGreaterThan(stateAdapter);
    expect(method).not.toContain('if (existing) continue');
  });

  it('binds dual-reader burn inventory and supply to one stable pin before the alarm', () => {
    const start = source.indexOf('private async processPegOuts');
    const end = source.indexOf('private async findAnchoredTrackerIngest', start);
    const method = source.slice(start, end);
    const agreement = method.indexOf(
      'backingReadAgreement = await observeFrontierBackingReadAgreement({',
    );
    const projection = method.indexOf(
      'projectSubstrateFederatedDatabaseLossInventoryObservationV1({',
      agreement,
    );
    const persistence = method.indexOf(
      'reconcileCompletePegOutBackingInventory({',
      projection,
    );
    const pinRevalidation = method.indexOf(
      'await revalidateFrontierBackingReadAgreementPin(',
      persistence,
    );
    const stableSnapshot = method.indexOf(
      'const sidechainBackingSnapshot = createCompleteSidechainBackingSnapshot({',
      pinRevalidation,
    );
    const alarm = method.indexOf(
      'await this.checkSolvencyInvariant(',
      stableSnapshot,
    );

    expect(agreement).toBeGreaterThan(-1);
    expect(projection).toBeGreaterThan(agreement);
    expect(persistence).toBeGreaterThan(projection);
    expect(pinRevalidation).toBeGreaterThan(persistence);
    expect(stableSnapshot).toBeGreaterThan(pinRevalidation);
    expect(alarm).toBeGreaterThan(stableSnapshot);
    expect(databaseLossRecoverySource).toContain(
      'assertFrontierBackingReadAgreementProvenance(',
    );
    expect(method).not.toContain('this.sidechain.scanForPegOuts(');
    expect(method).not.toContain('this.sidechain.getTotalSERGSupplyAtBlock(');
  });

  it('reconstructs the complete burn inventory through both readers instead of trusting the SQLite cursor', () => {
    const start = source.indexOf('private async processPegOuts');
    const end = source.indexOf('private async findAnchoredTrackerIngest', start);
    const method = source.slice(start, end);
    const agreement = method.indexOf(
      'backingReadAgreement = await observeFrontierBackingReadAgreement({',
    );
    const persistence = method.indexOf(
      'reconcileCompletePegOutBackingInventory({',
      agreement,
    );
    const backingDecision = method.indexOf(
      'await this.checkSolvencyInvariant(',
      persistence,
    );

    expect(agreement).toBeGreaterThan(-1);
    expect(persistence).toBeGreaterThan(agreement);
    expect(backingDecision).toBeGreaterThan(persistence);
    expect(method).not.toContain('fromBlock = sync.latestSidechainHeight');
    expect(method).not.toContain('pinnedHeight: sidechainHeight');
    expect(frontierBackingAgreementSource).toContain('let fromBlock = 0;');
    expect(frontierBackingAgreementSource).toContain(
      'source.client.scanForPegOuts(fromBlock, toBlock)',
    );
    expect(frontierBackingAgreementSource).toContain(
      'const primaryTipHeight = await readCurrentTipHeight(pair.primary.client);',
    );
    expect(frontierBackingAgreementSource).toContain(
      'const witnessTipHeight = await readCurrentTipHeight(pair.witness.client);',
    );
    expect(frontierBackingAgreementSource).toContain(
      'const pinnedHeight = readerTipFloorHeight;',
    );
    expect(frontierBackingAgreementSource).toContain(
      'const primary = await observeSourceView(pair.primary, observation);',
    );
    expect(frontierBackingAgreementSource).toContain(
      'const witness = await observeSourceView(pair.witness, observation);',
    );
    expect(frontierBackingAgreementSource).not.toContain(
      'Promise.all([\n    observeSourceView(',
    );
  });

  it('persists only the lower reader tip as a complete peg-out observation', () => {
    const tickStart = source.indexOf('private async tick()');
    const tickEnd = source.indexOf(
      '//  A. PEG-IN: Detect MCL deposits',
      tickStart,
    );
    const tick = source.slice(tickStart, tickEnd);
    const observation = tick.indexOf(
      'completePegOutInventory = await this.processPegOuts(',
    );
    const persistence = tick.indexOf(
      'persistPegOutObservationCursor(this.state, {',
      observation,
    );

    expect(observation).toBeGreaterThan(-1);
    expect(persistence).toBeGreaterThan(observation);
    expect(tick.slice(persistence)).toContain(
      'completePegOutInventory?.pinnedHeight ?? sidechainHeight',
    );
    expect(tick.slice(persistence)).toContain(
      'observationComplete: completePegOutInventory !== null',
    );

    const processStart = source.indexOf('private async processPegOuts');
    const processEnd = source.indexOf(
      'private async findAnchoredTrackerIngest',
      processStart,
    );
    const process = source.slice(processStart, processEnd);
    expect(process).toContain(
      '): Promise<Readonly<CompletePegOutBackingInventoryResult> | null>',
    );
    expect(process).toContain('return inventoryResult;');
    expect(process).not.toContain('return true;');
  });

  it('joins the read agreement to the exact snapshot consumed by the backing decision', () => {
    const start = source.indexOf('private async checkSolvencyInvariant');
    const end = source.indexOf(
      'private holdFundsReleaseForUnavailableBackingAlarm',
      start,
    );
    const method = source.slice(start, end);
    const provenance = method.indexOf(
      'assertFrontierBackingReadAgreementProvenance(',
    );
    const join = method.indexOf(
      'assertFrontierBackingAgreementSnapshotJoin(',
      provenance,
    );
    const reconstruction = method.indexOf(
      'await reconstructPegOutTerminalLiabilities({',
      join,
    );
    const finalPinCheck = method.indexOf(
      'await revalidateFrontierBackingReadAgreementPin(',
      reconstruction,
    );
    const decision = method.indexOf(
      "'quorum-bound backing alarm decision'",
      finalPinCheck,
    );

    expect(provenance).toBeGreaterThan(-1);
    expect(join).toBeGreaterThan(provenance);
    expect(reconstruction).toBeGreaterThan(join);
    expect(finalPinCheck).toBeGreaterThan(reconstruction);
    expect(decision).toBeGreaterThan(finalPinCheck);
    expect(source).toContain(
      'complete sidechain backing snapshot does not match its Frontier read agreement',
    );
  });

  it('requires a canonical block hash on every projected burn before persistence', () => {
    const start = source.indexOf('private async processPegOuts');
    const end = source.indexOf('private async findAnchoredTrackerIngest', start);
    const method = source.slice(start, end);
    const projection = method.indexOf(
      'projectSubstrateFederatedDatabaseLossInventoryObservationV1({',
    );
    const persistence = method.indexOf(
      'reconcileCompletePegOutBackingInventory({',
      projection,
    );

    expect(projection).toBeGreaterThan(-1);
    expect(persistence).toBeGreaterThan(projection);
    expect(databaseLossRecoverySource).toContain(
      "'database-loss inventory burn block hash'",
    );
    expect(databaseLossRecoverySource).toContain(
      'sidechainBurnHeight === pinnedHeight',
    );
  });

  it('uses one fail-closed hold for persisted incidents and pending reorg reconciliation', () => {
    const start = source.indexOf('private isFundsReleaseHeld');
    const end = source.indexOf('private async tick', start);
    const method = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(method).toContain(
      'this.fundsReleaseHoldOpen || this.pegInReorgReconciliationPending',
    );
    expect(method).toContain('this.state.getPegInCircuitBreakerState().open');
    expect(method).toContain('this.fundsReleaseHoldOpen = true');
    expect(method).toContain(
      'LOCAL FUNDS-RELEASE HOLD: durable safety state is unreadable',
    );
  });

  it('retains execution authority when forced shutdown cannot drain an active tick', () => {
    const start = source.indexOf('const shutdownHandler = async');
    const end = source.indexOf('// Main event loop', start);
    const handler = source.slice(start, end);
    const forced = handler.indexOf('if (this.tickInProgress) {');
    const forcedExit = handler.indexOf('process.exit(1);', forced);
    const cleanClose = handler.indexOf('this.state.close();', forced);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(forced).toBeGreaterThan(-1);
    expect(forcedExit).toBeGreaterThan(forced);
    expect(handler.slice(forced, forcedExit)).toContain(
      'retaining funds execution authority for reviewed recovery',
    );
    expect(cleanClose).toBeGreaterThan(forcedExit);
  });

  it('fails closed when clean shutdown cannot release execution authority', () => {
    const start = source.indexOf('const shutdownHandler = async');
    const end = source.indexOf('// Main event loop', start);
    const handler = source.slice(start, end);
    const closeTry = handler.indexOf('try {', handler.indexOf('process.exit(1);'));
    const close = handler.indexOf('this.state.close();', closeTry);
    const closeFailure = handler.indexOf(
      'State close retained funds execution authority for reviewed recovery',
      close,
    );
    const failureExit = handler.indexOf('process.exit(1);', closeFailure);
    const cleanExit = handler.indexOf('process.exit(0);', failureExit);

    expect(closeTry).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(closeTry);
    expect(closeFailure).toBeGreaterThan(close);
    expect(failureExit).toBeGreaterThan(closeFailure);
    expect(cleanExit).toBeGreaterThan(failureExit);
  });

  it('records burns but stops every new peg-out candidate before settlement preparation', () => {
    const start = source.indexOf('private async processPegOuts');
    const end = source.indexOf('private async findAnchoredTrackerIngest', start);
    const method = source.slice(start, end);
    const observation = method.indexOf('reconcileCompletePegOutBackingInventory({');
    const backingDecision = method.indexOf(
      'await this.checkSolvencyInvariant(',
      observation,
    );
    const hold = method.indexOf('if (this.isFundsReleaseHeld())', backingDecision);
    const pendingSelection = method.indexOf('const pendingPhase1', hold);
    const authenticatedPreparation = method.indexOf(
      'prepareAuthenticatedSettlementUnsignedTx',
      hold,
    );

    expect(observation).toBeGreaterThan(-1);
    expect(backingDecision).toBeGreaterThan(observation);
    expect(hold).toBeGreaterThan(backingDecision);
    expect(pendingSelection).toBeGreaterThan(hold);
    expect(authenticatedPreparation).toBeGreaterThan(hold);
    expect(method.slice(hold, pendingSelection)).toContain(
      'return inventoryResult;',
    );
  });

  it('removes the SCS mutation and keeps maintenance observation-only', () => {
    const oracleStart = source.indexOf('private async updateSCSOracle');
    const oracleEnd = source.indexOf('private async processPhase2Unlocks', oracleStart);
    expect(oracleStart).toBeGreaterThan(-1);
    expect(oracleEnd).toBeGreaterThan(oracleStart);
    const oracle = source.slice(oracleStart, oracleEnd);
    expect(oracle).toContain('requestSubstrateFinalizedHeadHash(');
    expect(oracle).toContain(
      'SCS oracle mutation is retired; finalized sidechain state is observation-only',
    );
    expect(oracle).not.toContain('submitScsOracleUpdate({');
    expect(oracle).not.toContain('this.ergoSigner.loadSigner(');

    expect(source).not.toContain('private async touchDUPSingleton');
    expect(source).not.toContain('private async utxoConsolidationSweep');
    const observationStart = source.indexOf(
      'private async observeMainChainLockFragmentation',
    );
    const observationEnd = source.indexOf(
      'const daemon = new BridgeRelayerDaemon()',
      observationStart,
    );
    const observation = source.slice(observationStart, observationEnd);
    expect(observationStart).toBeGreaterThan(-1);
    expect(observationEnd).toBeGreaterThan(observationStart);
    expect(observation).not.toContain('getSignerKeys(');
    expect(observation).not.toContain('submit');
    expect(observation).not.toContain('broadcast(');
    expect(observation).toContain('broadcastPerformed: false');

    const confirmationStart = source.indexOf('private async processPhase2Unlocks');
    const confirmationEnd = source.indexOf('private async handleErgoReorg', confirmationStart);
    expect(source.slice(confirmationStart, confirmationEnd))
      .not.toContain('if (this.isFundsReleaseHeld())');
  });

  it('runs joined recollection before any lifecycle selection and keeps selection disabled', () => {
    const start = source.indexOf('private async processPegIns');
    const end = source.indexOf('//  B. PEG-OUT', start);
    const method = source.slice(start, end);
    const reconciliationCall = method.indexOf(
      'await this.reconcilePegInsBeforeLifecycleSelection()',
    );
    const firstLifecycleSelection = method.indexOf('this.state.getPendingPegIns()');

    expect(source).toContain('loadPegInRuntimeReconciliationFromEnvironment');
    expect(reconciliationCall).toBeGreaterThan(-1);
    expect(firstLifecycleSelection).toBeGreaterThan(reconciliationCall);
    expect(method).toContain('if (!reconciliationBoundary.lifecycleSelectionAuthorized) return');
    expect(source).toContain(
      'Peg-in lifecycle selection disabled: runtime joined recollection is not configured',
    );
    expect(source).toContain('Peg-in runtime reconciliation failed closed');
  });

  it('constructs runtime recollection only after binding the active deployment', () => {
    const deployed = source.indexOf('this.deployed = loadDeployedState()');
    const active = source.indexOf('this.pegInDeployment = resolveActivePegInDeployment');
    const runtime = source.indexOf(
      'this.pegInRuntimeReconciliation = loadPegInRuntimeReconciliationFromEnvironment',
    );

    expect(deployed).toBeGreaterThan(-1);
    expect(active).toBeGreaterThan(deployed);
    expect(runtime).toBeGreaterThan(active);
    expect(source).toContain('sidechainIdHex: SUBSTRATE_CONFIG.spvSidechainIdHex');
    expect(source).toContain('bridgeAddress: this.deployed.solidity.bridgeAddress');
    expect(source).toContain('frontierPrimaryRpcUrl: SUBSTRATE_CONFIG.evmRpcUrl');
    expect(source).toContain('evmChainId: this.deployed.solidity.evmChainId');
    expect(source).toContain(
      'bridgeDeploymentBlock: this.deployed.solidity.bridgeDeploymentBlock',
    );
    expect(source).toContain('ergoCommitConfirmations: PROTOCOL_PARAMS.pegInCommitConfirmations');
    expect(source).toContain('frontierRequiredConfirmations: PROTOCOL_PARAMS.confirmationDepth');
  });

  it('uses and advances the persisted reconciliation cursor', () => {
    expect(source).toContain('this.state.getPegInReconciliationBatch(50)');
    expect(source).toContain('this.state.advancePegInReconciliationCursor');
    expect(source).not.toContain('mintedPegIns.slice(-50)');
  });
});
