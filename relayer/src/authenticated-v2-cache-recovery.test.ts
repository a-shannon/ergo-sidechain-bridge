import { createHash } from 'crypto';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const reconstructTracker = vi.hoisted(() => vi.fn());
const reconstructDup = vi.hoisted(() => vi.fn());
const reconstructVault = vi.hoisted(() => vi.fn());

vi.mock('./authenticated-spv-tracker-reconstruction.js', async importOriginal => ({
  ...await importOriginal<typeof import('./authenticated-spv-tracker-reconstruction.js')>(),
  reconstructAuthenticatedSpvTrackerHistoryFromIndependentSources: reconstructTracker,
  assertAuthenticatedSpvTrackerReconstructionProvenance: vi.fn(),
}));
vi.mock('./authenticated-v2-dup-reconstruction.js', async importOriginal => ({
  ...await importOriginal<typeof import('./authenticated-v2-dup-reconstruction.js')>(),
  reconstructAuthenticatedV2DupHistoryFromDistinctSources: reconstructDup,
  assertAuthenticatedV2DupReconstructionProvenance: vi.fn(),
}));
vi.mock('./authenticated-v2-vault-reconstruction.js', async importOriginal => ({
  ...await importOriginal<typeof import('./authenticated-v2-vault-reconstruction.js')>(),
  reconstructAuthenticatedV2VaultForestFromDistinctSources: reconstructVault,
  assertAuthenticatedV2VaultReconstructionProvenance: vi.fn(),
}));
vi.mock('./authenticated-settlement-candidate.js', () => ({
  assertNativeVerifiedAuthenticatedSettlementCandidateProvenance: vi.fn(),
}));
vi.mock('./authenticated-settlement-jvm-check.js', () => ({
  assertAuthenticatedSettlementJvmCheckAcceptanceProvenance: vi.fn(),
}));

import { getDupTreeDigest } from './avl-bridge.js';
import { buildBridgeCheckpointCommitmentV1 } from './bridge-checkpoint-commitment.js';
import { buildAggregateFinalityCommitmentV1 } from './bridge-finality-commitment.js';
import { AUTHENTICATED_SETTLEMENT_CANDIDATE_SCHEMA_VERSION } from './authenticated-settlement-candidate-schema.js';
import {
  buildAggregateFinalityProofV1,
  buildBridgeFinalityStatementV1,
} from './bridge-finality-proof.js';
import {
  AUTHENTICATED_V2_CACHE_RECOVERY_SCHEMA,
  AUTHENTICATED_V2_READ_ONLY_RECONSTRUCTION_SCHEMA,
  assertAuthenticatedV2CacheRecoveryReportProvenance,
  assertAuthenticatedV2ReadOnlyReconstructionProvenance,
  recoverAuthenticatedV2Caches,
  reconstructAuthenticatedV2ReadOnly,
} from './authenticated-v2-cache-recovery.js';
import {
  deriveAuthenticatedSpvTrackerKey,
  encodeAuthenticatedSpvTrackerValue,
} from './spv-tracker-authenticated.js';
import { deriveTrustlessBurnIdHex } from './trustless-burn-proof.js';
import {
  StateTracker,
  type AuthenticatedSettlementCandidateInput,
  type AuthenticatedSpvTrackerHistoryEntry,
} from './state-tracker.js';

const SIDECHAIN_ID = '10'.repeat(32);
const TRACKER_NFT_ID = '11'.repeat(32);
const TRACKER_TREE = `1008cd02${'12'.repeat(32)}`;
const TRACKER_GENESIS_ID = '13'.repeat(32);
const DUP_NFT_ID = '14'.repeat(32);
const DUP_TREE = `1008cd02${'15'.repeat(32)}`;
const DUP_GENESIS_ID = '16'.repeat(32);
const VAULT_ADDRESS = `9${'A'.repeat(50)}`;
const VAULT_TREE = `1008cd02${'17'.repeat(32)}`;
const HISTORY_KEY = '18'.repeat(32);
const DUP_INPUT_ID = '19'.repeat(32);
const DUP_SUCCESSOR_ID = '1a'.repeat(32);
const VAULT_INPUT_ID = '1b'.repeat(32);
const SETTLEMENT_TX_ID = '1c'.repeat(32);

type RecoverySnapshot = Readonly<{
  idHex: string;
  parentIdHex: string;
  height: number;
  extensionRootHex: string;
}>;

const SNAPSHOT: RecoverySnapshot = Object.freeze({
  idHex: '21'.repeat(32),
  parentIdHex: '22'.repeat(32),
  height: 100,
  extensionRootHex: '23'.repeat(32),
});

function withTempDatabase(run: (dbPath: string) => Promise<void> | void): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'bridge-v2-cache-recovery-'));
  return Promise.resolve().then(() => run(join(directory, 'state.sqlite'))).finally(() => {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });
}

function trackerEntry(): AuthenticatedSpvTrackerHistoryEntry {
  const checkpoint = buildBridgeCheckpointCommitmentV1({
    sidechainIdHex: SIDECHAIN_ID,
    sidechainHeight: 25n,
    sidechainConsensusBlockHashHex: '31'.repeat(32),
    executionBlockHashHex: '32'.repeat(32),
    bridgeEventRootHex: '33'.repeat(32),
    burnLeafCount: 1,
    finalityAuthoritySetId: 7,
    finalityAuthoritySetHashHex: '34'.repeat(32),
    finalityProofHashHex: '35'.repeat(32),
  });
  const statement = buildBridgeFinalityStatementV1({
    encodedCheckpointHex: checkpoint.encodedCheckpointHex,
    checkpointCommitmentHex: checkpoint.checkpointCommitmentHex,
    trustedAnchorDigestHex: '36'.repeat(32),
    finalityHorizonHeight: 25n,
    finalityHorizonHashHex: '37'.repeat(32),
  });
  const proof = buildAggregateFinalityProofV1({
    verifierProfileIdHex: '38'.repeat(32),
    encodedStatement: statement.encodedStatementHex,
    payload: Buffer.from('authenticated-cache-recovery-test', 'ascii'),
  });
  const commitment = buildAggregateFinalityCommitmentV1(proof);
  const entry = {
    sidechainId: SIDECHAIN_ID,
    sidechainHeight: 25n,
    executionBlockHash: '32'.repeat(32),
    bridgeEventRoot: '33'.repeat(32),
    checkpointCommitment: checkpoint.checkpointCommitmentHex,
    anchorHeaderId: '39'.repeat(32),
    anchorHeaderHeight: 90,
  };
  return {
    ...entry,
    keyHex: deriveAuthenticatedSpvTrackerKey({
      sidechainIdHex: entry.sidechainId,
      sidechainHeight: entry.sidechainHeight,
      executionBlockHashHex: entry.executionBlockHash,
    }),
    valueHex: encodeAuthenticatedSpvTrackerValue({
      bridgeEventRootHex: entry.bridgeEventRoot,
      checkpointCommitmentHex: entry.checkpointCommitment,
      anchorHeaderIdHex: entry.anchorHeaderId,
      anchorHeaderHeight: entry.anchorHeaderHeight,
      finalityProofSystemId: commitment.proofSystemId,
      finalityStatementDigestHex: commitment.statementDigestHex,
      finalityProgramIdHex: commitment.statement.programIdHex,
      finalityVerifierProfileIdHex: commitment.verifierProfileIdHex,
      finalityProofPayloadDigestHex: commitment.payloadDigestHex,
      finalityProofDigestHex: commitment.proofDigestHex,
    }),
  };
}

function trackerReconstruction(input: {
  withHistory?: boolean;
  snapshot?: RecoverySnapshot;
  observationDigest?: string;
} = {}) {
  const entry = trackerEntry();
  return {
    sidechainIdHex: SIDECHAIN_ID,
    trackerNftIdHex: TRACKER_NFT_ID,
    genesisBoxId: TRACKER_GENESIS_ID,
    finalityAttestorSigmaPropRegisterHex: '00',
    tipBoxId: '3a'.repeat(32),
    tipDigestHex: '3b'.repeat(33),
    observationDigestHex: input.observationDigest ?? '3c'.repeat(32),
    entries: input.withHistory === false ? [] : [entry],
    observedTip: input.snapshot ?? SNAPSHOT,
    independentObservationAgreement: true,
  } as any;
}

function dupReconstruction(input: {
  withHistory?: boolean;
  snapshot?: RecoverySnapshot;
  observationDigest?: string;
} = {}) {
  const withHistory = input.withHistory !== false;
  const tipDigest = getDupTreeDigest(withHistory ? [HISTORY_KEY] : []);
  return {
    duplicatePreventionNftIdHex: DUP_NFT_ID,
    duplicatePreventionErgoTreeHex: DUP_TREE,
    genesisBoxIdHex: DUP_GENESIS_ID,
    tipBoxIdHex: withHistory ? DUP_SUCCESSOR_ID : DUP_GENESIS_ID,
    tipDigestHex: tipDigest,
    tipCounter: withHistory ? '1' : '0',
    authoritySigmaPropRegisterHex: '00',
    historyKeys: withHistory ? [HISTORY_KEY] : [],
    transitions: withHistory ? [{
      burnIdHex: HISTORY_KEY,
      spendingTransactionIdHex: SETTLEMENT_TX_ID,
      spendingBlockIdHex: '3d'.repeat(32),
      spendingInclusionHeight: 95,
      dupInputBoxIdHex: DUP_INPUT_ID,
      dupSuccessorBoxIdHex: DUP_SUCCESSOR_ID,
      vaultInputBoxIdHex: VAULT_INPUT_ID,
      vaultSuccessorBoxIdHex: null,
      payoutBoxIdHex: '3e'.repeat(32),
      payoutValueNanoErg: '3000000',
      minerFeeNanoErg: '1000000',
      successorDigestHex: tipDigest,
    }] : [],
    tipSigmaSerializedHex: '3f',
    tipSigmaSerializedSha256Hex: '40'.repeat(32),
    observedTip: input.snapshot ?? SNAPSHOT,
    indexedHeight: (input.snapshot ?? SNAPSHOT).height,
    fullHeight: (input.snapshot ?? SNAPSHOT).height,
    observationDigestHex: input.observationDigest ?? '41'.repeat(32),
    distinctSourceAgreement: true,
  } as any;
}

function vaultReconstruction(duplicatePrevention: ReturnType<typeof dupReconstruction>, input: {
  withHistory?: boolean;
  snapshot?: RecoverySnapshot;
  observationDigest?: string;
} = {}) {
  const withHistory = input.withHistory !== false;
  const sigmaSerializedHex = 'f0';
  const boxes = withHistory ? [{
    boxIdHex: VAULT_INPUT_ID,
    transactionIdHex: '42'.repeat(32),
    outputIndex: 0,
    creationHeight: 80,
    valueNanoErg: '5000000',
    ergoTreeHex: VAULT_TREE,
    assets: [],
    additionalRegisters: {
      R4: `0e20${'43'.repeat(32)}`,
      R5: `0e14${'44'.repeat(20)}`,
      R6: '05a0c21e',
      R7: `0e22${`1008cd02${'45'.repeat(32)}`}`,
    },
    depositIdHex: '43'.repeat(32),
    targetEvmAddressHex: '44'.repeat(20),
    originalAmountNanoErg: '5000000',
    provenanceHex: `1008cd02${'45'.repeat(32)}`,
    spentTransactionIdHex: SETTLEMENT_TX_ID,
    sigmaSerializedHex,
    sigmaSerializedSha256Hex: createHash('sha256')
      .update(Buffer.from(sigmaSerializedHex, 'hex'))
      .digest('hex'),
    currentUtxoBinaryMatched: false,
  }] : [];
  const transitions = withHistory ? [{
    burnIdHex: HISTORY_KEY,
    spendingTransactionIdHex: SETTLEMENT_TX_ID,
    inputBoxIdHex: VAULT_INPUT_ID,
    successorBoxIdHex: null,
    payoutBoxIdHex: '3e'.repeat(32),
    payoutValueNanoErg: '3000000',
    minerFeeNanoErg: '1000000',
  }] : [];
  const snapshot = input.snapshot ?? SNAPSHOT;
  return {
    schema: 'e2s.authenticated-v2-vault-reconstruction.v1',
    network: 'testnet',
    vaultAddress: VAULT_ADDRESS,
    vaultErgoTreeHex: VAULT_TREE,
    duplicatePreventionObservationDigestHex: duplicatePrevention.observationDigestHex,
    duplicatePreventionTipBoxIdHex: duplicatePrevention.tipBoxIdHex,
    stableSnapshot: {
      indexedHeight: snapshot.height,
      fullHeight: snapshot.height,
      bestHeader: snapshot,
    },
    boxes,
    currentUnspentBoxIdsHex: [],
    rootBoxIdsHex: withHistory ? [VAULT_INPUT_ID] : [],
    unresolvedRootProvenanceBoxIdsHex: withHistory ? [VAULT_INPUT_ID] : [],
    transitions,
    observationDigestHex: input.observationDigest ?? '46'.repeat(32),
    observedAt: '2026-07-15T10:00:00.000Z',
    sources: { primary: 'primary', witness: 'witness' },
    distinctSourceAgreement: true,
    boundary: {
      completeIndexedAddressHistoryMatched: true,
      currentUtxoSetAndCanonicalBinaryMatched: true,
      duplicatePreventionLineageBoundEverySpend: true,
      sameErgoSnapshotAsDuplicatePreventionHistory: true,
      rootCreationProvenanceRequiresSeparateProof: true,
      localPersistenceIsNotAuthority: true,
      noCandidateCheckSignatureSubmissionOrBroadcastAuthority: true,
      distinctOriginsDoNotProveIndependentOperation: true,
    },
  } as any;
}

function recoveryInput(stateTracker: StateTracker) {
  return {
    stateTracker,
    primarySource: { observationSourceId: 'primary' } as any,
    witnessSource: { observationSourceId: 'witness' } as any,
    trackerNftIdHex: TRACKER_NFT_ID,
    trackerErgoTreeHex: TRACKER_TREE,
    expectedSidechainIdHex: SIDECHAIN_ID,
    expectedTrackerGenesisBoxIdHex: TRACKER_GENESIS_ID,
    duplicatePreventionNftIdHex: DUP_NFT_ID,
    duplicatePreventionErgoTreeHex: DUP_TREE,
    expectedNetwork: 'testnet',
    vaultAddress: VAULT_ADDRESS,
    vaultErgoTreeHex: VAULT_TREE,
    now: () => new Date('2026-07-15T10:00:00.000Z'),
  };
}

function candidate(): AuthenticatedSettlementCandidateInput {
  const entry = trackerEntry();
  const burnTxHash = '47'.repeat(32);
  const sidechainLogIndex = 7;
  return {
    schemaVersion: AUTHENTICATED_SETTLEMENT_CANDIDATE_SCHEMA_VERSION,
    candidateId: '48'.repeat(32),
    burnId: deriveTrustlessBurnIdHex({
      sidechainIdHex: SIDECHAIN_ID,
      sidechainTxHashHex: burnTxHash,
      eventIndex: sidechainLogIndex,
    }),
    burnTxHash,
    sidechainId: SIDECHAIN_ID,
    sidechainHeight: entry.sidechainHeight,
    sidechainBlockHash: entry.executionBlockHash,
    sidechainLogIndex,
    trackerKey: entry.keyHex,
    trackerValue: entry.valueHex,
    trackerBoxId: '49'.repeat(32),
    anchorHeaderId: entry.anchorHeaderId,
    anchorHeaderHeight: entry.anchorHeaderHeight,
    dupInputBoxId: DUP_INPUT_ID,
    dupInputDigest: getDupTreeDigest([]),
    vaultBoxId: VAULT_INPUT_ID,
    unsignedTxDigest: '4a'.repeat(32),
    creationHeight: 95,
    observedSidechainTip: 30n,
    observedErgoTip: 100,
  };
}

function seedAuthorityRows(stateTracker: StateTracker) {
  const settlementCandidate = candidate();
  const expectedTxId = '4d'.repeat(32);
  stateTracker.insertPegOut(
    settlementCandidate.burnTxHash,
    `02${'4b'.repeat(32)}`,
    1_000_000n,
    Number(settlementCandidate.sidechainHeight),
    {
      user: `0x${'4c'.repeat(20)}`,
      sidechainId: settlementCandidate.sidechainId,
      sidechainBlockHash: settlementCandidate.sidechainBlockHash,
      sidechainLogIndex: settlementCandidate.sidechainLogIndex,
    },
  );
  stateTracker.recordAuthenticatedSettlementCandidate(settlementCandidate);
  stateTracker.recordAggregateSettlementAttempt(
    'single',
    [settlementCandidate.burnTxHash],
    expectedTxId,
  );
  return { settlementCandidate, expectedTxId };
}

function configureReconstructions(input: {
  tracker?: ReturnType<typeof trackerReconstruction>;
  duplicatePrevention?: ReturnType<typeof dupReconstruction>;
  vault?: ReturnType<typeof vaultReconstruction>;
  order?: string[];
} = {}) {
  const tracker = input.tracker ?? trackerReconstruction();
  const duplicatePrevention = input.duplicatePrevention ?? dupReconstruction();
  const vault = input.vault ?? vaultReconstruction(duplicatePrevention);
  reconstructTracker.mockImplementation(async () => {
    input.order?.push('tracker');
    return tracker;
  });
  reconstructDup.mockImplementation(async () => {
    input.order?.push('dup');
    return duplicatePrevention;
  });
  reconstructVault.mockImplementation(async (request: any) => {
    input.order?.push('vault');
    expect(request.duplicatePrevention).toBe(duplicatePrevention);
    return vault;
  });
  return { tracker, duplicatePrevention, vault };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('authenticated V2 cache recovery', () => {
  it('reconstructs the complete read-only tracker, DUP, and vault bundle without persistence', async () => {
    const order: string[] = [];
    const reconstructions = configureReconstructions({ order });
    const { stateTracker: _stateTracker, ...input } = recoveryInput({} as StateTracker);

    const bundle = await reconstructAuthenticatedV2ReadOnly(input);

    expect(order).toEqual(['tracker', 'dup', 'vault']);
    expect(bundle.schema).toBe(AUTHENTICATED_V2_READ_ONLY_RECONSTRUCTION_SCHEMA);
    expect(bundle.tracker).toBe(reconstructions.tracker);
    expect(bundle.duplicatePrevention).toBe(reconstructions.duplicatePrevention);
    expect(bundle.vault).toBe(reconstructions.vault);
    expect(bundle.observedTip).toEqual(SNAPSHOT);
    expect(bundle.reconstructionDigests).toEqual({
      tracker: reconstructions.tracker.observationDigestHex,
      duplicatePrevention: reconstructions.duplicatePrevention.observationDigestHex,
      vault: reconstructions.vault.observationDigestHex,
    });
    expect(bundle.boundary).toEqual({
      dependencyOrderWasTrackerThenDupThenVault: true,
      sameStableErgoSnapshotVerified: true,
      localPersistenceWasNotReadOrWritten: true,
      noCandidateOrAttemptAuthorityCreated: true,
      noJvmCheckSignerSubmissionConfirmationOrBroadcastAuthority: true,
      distinctOriginsDetectDisagreementButDoNotProveConsensus: true,
    });
    expect(Object.isFrozen(bundle)).toBe(true);
    expect(() => assertAuthenticatedV2ReadOnlyReconstructionProvenance(bundle)).not.toThrow();
    expect(() => assertAuthenticatedV2ReadOnlyReconstructionProvenance(
      structuredClone(bundle),
    )).toThrow(/read-only reconstruction provenance/i);
  });

  it('recovers only chain-derived caches after complete DB loss and survives restart', async () => {
    await withTempDatabase(async (dbPath) => {
      const lost = new StateTracker(dbPath);
      try {
        seedAuthorityRows(lost);
        expect(lost.getActiveAuthenticatedSettlementCandidates()).toHaveLength(1);
        expect(lost.getRecoverableAggregateSettlementAttempts()).toHaveLength(1);
      } finally {
        lost.close();
      }
      for (const suffix of ['', '-wal', '-shm']) {
        const path = `${dbPath}${suffix}`;
        if (existsSync(path)) rmSync(path, { force: true });
      }

      const order: string[] = [];
      const reconstructions = configureReconstructions({ order });
      const recovered = new StateTracker(dbPath);
      try {
        const report = await recoverAuthenticatedV2Caches(recoveryInput(recovered));

        expect(order).toEqual(['tracker', 'dup', 'vault']);
        expect(report.schema).toBe(AUTHENTICATED_V2_CACHE_RECOVERY_SCHEMA);
        expect(report.reconstructionDigests).toEqual({
          tracker: reconstructions.tracker.observationDigestHex,
          duplicatePrevention: reconstructions.duplicatePrevention.observationDigestHex,
          vault: reconstructions.vault.observationDigestHex,
        });
        expect(report.currentInputs).toEqual({
          trackerBoxIdHex: reconstructions.tracker.tipBoxId,
          duplicatePreventionBoxIdHex: reconstructions.duplicatePrevention.tipBoxIdHex,
          vaultBoxIdsHex: [],
        });
        expect(report.replacement).toEqual(expect.objectContaining({
          activeCandidatesBefore: 0,
          activeCandidatesAfter: 0,
          recoverableAttemptsBefore: 0,
          recoverableAttemptsAfter: 0,
        }));
        expect(report.boundary.noCandidateOrAttemptAuthorityCreated).toBe(true);
        expect(Object.isFrozen(report)).toBe(true);
        expect(() => assertAuthenticatedV2CacheRecoveryReportProvenance(report)).not.toThrow();
        expect(() => assertAuthenticatedV2CacheRecoveryReportProvenance(
          structuredClone(report),
        )).toThrow(/recovery report provenance/i);
        expect(recovered.getAuthenticatedSpvTrackerReconstructionState(SIDECHAIN_ID))
          .toEqual(expect.objectContaining({
            tipBoxId: reconstructions.tracker.tipBoxId,
            tipDigest: reconstructions.tracker.tipDigestHex,
            observationDigest: reconstructions.tracker.observationDigestHex,
            observedErgoTipId: reconstructions.tracker.observedTip.idHex,
          }));
        expect(recovered.getActiveAuthenticatedSettlementCandidates()).toEqual([]);
        expect(recovered.getRecoverableAggregateSettlementAttempts()).toEqual([]);
      } finally {
        recovered.close();
      }

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getAuthenticatedSpvTrackerHistory(SIDECHAIN_ID)).toHaveLength(1);
        expect(reopened.getAuthenticatedSpvTrackerReconstructionState(SIDECHAIN_ID))
          .toEqual(expect.objectContaining({
            tipBoxId: reconstructions.tracker.tipBoxId,
            observationDigest: reconstructions.tracker.observationDigestHex,
          }));
        expect(reopened.getAuthenticatedV2DupHistory()).toEqual([HISTORY_KEY]);
        expect(reopened.getAuthenticatedV2VaultHistory()).toEqual([
          expect.objectContaining({ boxIdHex: VAULT_INPUT_ID, currentUtxoBinaryMatched: false }),
        ]);
        expect(reopened.getActiveAuthenticatedSettlementCandidates()).toEqual([]);
        expect(reopened.getRecoverableAggregateSettlementAttempts()).toEqual([]);
      } finally {
        reopened.close();
      }
    });
  });

  it.each(['tracker', 'DUP', 'vault'] as const)(
    'rejects divergent %s source observations before cache mutation',
    async (stage) => {
    await withTempDatabase(async (dbPath) => {
      const tracker = new StateTracker(dbPath);
      const replace = vi.spyOn(tracker, 'replaceAuthenticatedV2RecoveryCaches');
      configureReconstructions();
      const reconstruction = stage === 'tracker'
        ? reconstructTracker
        : stage === 'DUP'
          ? reconstructDup
          : reconstructVault;
      reconstruction.mockRejectedValueOnce(new Error(`independent ${stage} observations disagree`));
      await expect(recoverAuthenticatedV2Caches(recoveryInput(tracker)))
        .rejects.toThrow(/observations disagree/i);
      if (stage === 'tracker') expect(reconstructDup).not.toHaveBeenCalled();
      if (stage !== 'vault') expect(reconstructVault).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
      expect(tracker.getAuthenticatedSpvTrackerHistory(SIDECHAIN_ID)).toEqual([]);
      expect(tracker.getAuthenticatedV2DupReconstructionState()).toBeNull();
      expect(tracker.getAuthenticatedV2VaultReconstructionState()).toBeNull();
      tracker.close();
    });
  });

  it.each([
    ['tip ID', { idHex: '4e'.repeat(32) }],
    ['parent ID', { parentIdHex: '4f'.repeat(32) }],
    ['height', { height: 101 }],
    ['extension root', { extensionRootHex: '50'.repeat(32) }],
  ])('rejects cross-stage %s drift before vault observation', async (_label, change) => {
    await withTempDatabase(async (dbPath) => {
      const stateTracker = new StateTracker(dbPath);
      configureReconstructions({
        tracker: trackerReconstruction(),
        duplicatePrevention: dupReconstruction({ snapshot: { ...SNAPSHOT, ...change } }),
      });
      await expect(recoverAuthenticatedV2Caches(recoveryInput(stateTracker)))
        .rejects.toThrow(/captured out of order/i);
      expect(reconstructVault).not.toHaveBeenCalled();
      expect(stateTracker.getAuthenticatedSpvTrackerHistory(SIDECHAIN_ID)).toEqual([]);
      expect(stateTracker.getAuthenticatedV2DupReconstructionState()).toBeNull();
      expect(stateTracker.getAuthenticatedV2VaultReconstructionState()).toBeNull();
      stateTracker.close();
    });
  });

  it.each([
    ['tip ID', (_dup: any, vault: any) => {
      vault.stableSnapshot.bestHeader = { ...SNAPSHOT, idHex: '51'.repeat(32) };
    }],
    ['parent ID', (_dup: any, vault: any) => {
      vault.stableSnapshot.bestHeader = { ...SNAPSHOT, parentIdHex: '52'.repeat(32) };
    }],
    ['header height', (_dup: any, vault: any) => {
      vault.stableSnapshot.bestHeader = { ...SNAPSHOT, height: 101 };
    }],
    ['extension root', (_dup: any, vault: any) => {
      vault.stableSnapshot.bestHeader = { ...SNAPSHOT, extensionRootHex: '53'.repeat(32) };
    }],
    ['indexed height', (dup: any, vault: any) => { vault.stableSnapshot.indexedHeight += 1; }],
    ['full height', (dup: any, vault: any) => { vault.stableSnapshot.fullHeight += 1; }],
    ['DUP digest', (dup: any, vault: any) => {
      vault.duplicatePreventionObservationDigestHex = '54'.repeat(32);
    }],
    ['DUP tip box', (dup: any, vault: any) => {
      vault.duplicatePreventionTipBoxIdHex = '55'.repeat(32);
    }],
  ])('rejects vault %s drift before persistence', async (_label, mutate) => {
    await withTempDatabase(async (dbPath) => {
      const stateTracker = new StateTracker(dbPath);
      const duplicatePrevention = dupReconstruction();
      const vault = vaultReconstruction(duplicatePrevention);
      mutate(duplicatePrevention, vault);
      configureReconstructions({ duplicatePrevention, vault });
      await expect(recoverAuthenticatedV2Caches(recoveryInput(stateTracker)))
        .rejects.toThrow(/captured out of order|does not bind/i);
      expect(stateTracker.getAuthenticatedSpvTrackerHistory(SIDECHAIN_ID)).toEqual([]);
      expect(stateTracker.getAuthenticatedV2DupReconstructionState()).toBeNull();
      expect(stateTracker.getAuthenticatedV2VaultReconstructionState()).toBeNull();
      stateTracker.close();
    });
  });

  it('rolls back caches and candidate invalidation when the vault replacement fails', async () => {
    await withTempDatabase((dbPath) => {
      const stateTracker = new StateTracker(dbPath);
      const tracker = trackerReconstruction();
      const duplicatePrevention = dupReconstruction();
      const vault = vaultReconstruction(duplicatePrevention);
      const authority = seedAuthorityRows(stateTracker);
      const candidateBefore = stateTracker.getAuthenticatedSettlementCandidate(
        authority.settlementCandidate.candidateId,
      );
      const attemptsBefore = stateTracker.getRecoverableAggregateSettlementAttempts();
      try {
        expect(() => stateTracker.replaceAuthenticatedV2RecoveryCaches({
          trackerReconstruction: tracker,
          duplicatePreventionReconstruction: duplicatePrevention,
          duplicatePreventionIdentity: {
            duplicatePreventionNftIdHex: DUP_NFT_ID,
            duplicatePreventionErgoTreeHex: DUP_TREE,
          },
          vaultReconstruction: vault,
          vaultIdentity: {
            vaultAddress: VAULT_ADDRESS,
            vaultErgoTreeHex: `1008cd02${'56'.repeat(32)}`,
          },
        })).toThrow(/vault identity/i);
        expect(stateTracker.getAuthenticatedSpvTrackerHistory(SIDECHAIN_ID)).toEqual([]);
        expect(stateTracker.getAuthenticatedV2DupHistory()).toEqual([]);
        expect(stateTracker.getAuthenticatedV2DupReconstructionState()).toBeNull();
        expect(stateTracker.getAuthenticatedV2VaultReconstructionState()).toBeNull();
        expect(stateTracker.getAuthenticatedSettlementCandidate(
          authority.settlementCandidate.candidateId,
        )).toEqual(candidateBefore);
        expect(stateTracker.getRecoverableAggregateSettlementAttempts()).toEqual(attemptsBefore);
      } finally {
        stateTracker.close();
      }

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getAuthenticatedSettlementCandidate(
          authority.settlementCandidate.candidateId,
        )).toEqual(candidateBefore);
        expect(reopened.getRecoverableAggregateSettlementAttempts()).toEqual(attemptsBefore);
        expect(reopened.getAuthenticatedSpvTrackerHistory(SIDECHAIN_ID)).toEqual([]);
        expect(reopened.getAuthenticatedV2DupReconstructionState()).toBeNull();
        expect(reopened.getAuthenticatedV2VaultReconstructionState()).toBeNull();
      } finally {
        reopened.close();
      }
    });
  });

  it.each(['candidate', 'attempt'] as const)(
    'rejects same-ID %s authority promotion during cache replacement',
    async (authorityKind) => {
      await withTempDatabase((dbPath) => {
        const stateTracker = new StateTracker(dbPath);
        const tracker = trackerReconstruction();
        const duplicatePrevention = dupReconstruction();
        const vault = vaultReconstruction(duplicatePrevention);
        if (authorityKind === 'candidate') {
          vi.spyOn(stateTracker, 'getActiveAuthenticatedSettlementCandidates')
            .mockReturnValueOnce([{ candidateId: '57'.repeat(32), status: 'prepared' } as any])
            .mockReturnValueOnce([{ candidateId: '57'.repeat(32), status: 'check_passed' } as any]);
        } else {
          vi.spyOn(stateTracker, 'getRecoverableAggregateSettlementAttempts')
            .mockReturnValueOnce([{
              expectedTxId: '58'.repeat(32),
              status: 'pending',
            } as any])
            .mockReturnValueOnce([{
              expectedTxId: '58'.repeat(32),
              status: 'submitted',
            } as any]);
        }
        expect(() => stateTracker.replaceAuthenticatedV2RecoveryCaches({
          trackerReconstruction: tracker,
          duplicatePreventionReconstruction: duplicatePrevention,
          duplicatePreventionIdentity: {
            duplicatePreventionNftIdHex: DUP_NFT_ID,
            duplicatePreventionErgoTreeHex: DUP_TREE,
          },
          vaultReconstruction: vault,
          vaultIdentity: { vaultAddress: VAULT_ADDRESS, vaultErgoTreeHex: VAULT_TREE },
        })).toThrow(new RegExp(`created or changed settlement ${authorityKind} authority`, 'i'));
        expect(stateTracker.getAuthenticatedSpvTrackerHistory(SIDECHAIN_ID)).toEqual([]);
        expect(stateTracker.getAuthenticatedV2DupReconstructionState()).toBeNull();
        expect(stateTracker.getAuthenticatedV2VaultReconstructionState()).toBeNull();
        stateTracker.close();
      });
    },
  );

  it('replaces all three caches with a shorter canonical rollback view', async () => {
    await withTempDatabase(async (dbPath) => {
      const stateTracker = new StateTracker(dbPath);
      configureReconstructions();
      await recoverAuthenticatedV2Caches(recoveryInput(stateTracker));
      expect(stateTracker.getAuthenticatedSpvTrackerHistory(SIDECHAIN_ID)).toHaveLength(1);
      expect(stateTracker.getAuthenticatedV2DupHistory()).toEqual([HISTORY_KEY]);
      expect(stateTracker.getAuthenticatedV2VaultHistory()).toHaveLength(1);

      vi.clearAllMocks();
      const rollbackSnapshot = {
        idHex: '50'.repeat(32),
        parentIdHex: '51'.repeat(32),
        height: 99,
        extensionRootHex: '52'.repeat(32),
      } satisfies RecoverySnapshot;
      const rollbackTracker = trackerReconstruction({
        withHistory: false,
        snapshot: rollbackSnapshot,
        observationDigest: '53'.repeat(32),
      });
      const rollbackDup = dupReconstruction({
        withHistory: false,
        snapshot: rollbackSnapshot,
        observationDigest: '54'.repeat(32),
      });
      const rollbackVault = vaultReconstruction(rollbackDup, {
        withHistory: false,
        snapshot: rollbackSnapshot,
        observationDigest: '55'.repeat(32),
      });
      configureReconstructions({
        tracker: rollbackTracker,
        duplicatePrevention: rollbackDup,
        vault: rollbackVault,
      });
      const report = await recoverAuthenticatedV2Caches(recoveryInput(stateTracker));

      expect(report.replacement.tracker.changed).toBe(true);
      expect(report.replacement.duplicatePrevention.changed).toBe(true);
      expect(report.replacement.vault.changed).toBe(true);
      expect(stateTracker.getAuthenticatedSpvTrackerHistory(SIDECHAIN_ID)).toEqual([]);
      expect(stateTracker.getAuthenticatedV2DupHistory()).toEqual([]);
      expect(stateTracker.getAuthenticatedV2VaultHistory()).toEqual([]);
      expect(stateTracker.getActiveAuthenticatedSettlementCandidates()).toEqual([]);
      expect(stateTracker.getRecoverableAggregateSettlementAttempts()).toEqual([]);
      stateTracker.close();
    });
  });
});
