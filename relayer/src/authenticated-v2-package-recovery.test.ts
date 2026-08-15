import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ethers } from 'ethers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const validatePackage = vi.hoisted(() => vi.fn());
const bindPackage = vi.hoisted(() => vi.fn());
const authorizeCandidate = vi.hoisted(() => vi.fn());
const assertCacheRecovery = vi.hoisted(() => vi.fn());
const assertNativeCandidate = vi.hoisted(() => vi.fn());

vi.mock('./authenticated-v2-unsigned-settlement-package.js', async importOriginal => ({
  ...await importOriginal<typeof import('./authenticated-v2-unsigned-settlement-package.js')>(),
  validateAuthenticatedV2UnsignedSettlementPackage: validatePackage,
}));
vi.mock('./authenticated-v2-settlement-package-binding.js', async importOriginal => ({
  ...await importOriginal<typeof import('./authenticated-v2-settlement-package-binding.js')>(),
  bindAuthenticatedV2UnsignedSettlementPackage: bindPackage,
}));
vi.mock('./authenticated-v2-cache-recovery.js', async importOriginal => ({
  ...await importOriginal<typeof import('./authenticated-v2-cache-recovery.js')>(),
  assertAuthenticatedV2CacheRecoveryReportProvenance: assertCacheRecovery,
}));
vi.mock('./authenticated-settlement-candidate.js', async importOriginal => ({
  ...await importOriginal<typeof import('./authenticated-settlement-candidate.js')>(),
  authorizeNativeVerifiedAuthenticatedSettlementCandidate: authorizeCandidate,
  assertNativeVerifiedAuthenticatedSettlementCandidateProvenance: assertNativeCandidate,
}));

import { getDupTreeDigest } from './avl-bridge.js';
import {
  AGGREGATE_FINALITY_PROOF_SYSTEM_NATIVE_GRANDPA,
  deriveBridgeFinalityProgramIdHex,
} from './bridge-finality-proof.js';
import {
  AUTHENTICATED_V2_CACHE_RECOVERY_SCHEMA,
  type AuthenticatedV2CacheRecoveryReport,
} from './authenticated-v2-cache-recovery.js';
import {
  AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA,
  recoverAuthenticatedV2PreparedCandidate,
} from './authenticated-v2-package-recovery.js';
import {
  createAuthenticatedSettlementSidechainObservationSourcePair,
  destroyAuthenticatedSettlementSidechainObservationSourcePair,
  observeMatchingAuthenticatedSettlementStableSidechainViews,
  type AuthenticatedSettlementSidechainObservationSourcePair,
  type StableSidechainSource,
} from './authenticated-settlement-sidechain-view.js';
import {
  deriveAuthenticatedSpvTrackerKey,
  encodeAuthenticatedSpvTrackerValue,
} from './spv-tracker-authenticated.js';
import {
  AUTHENTICATED_SETTLEMENT_CANDIDATE_SCHEMA_VERSION,
} from './authenticated-settlement-candidate-schema.js';
import {
  recoverAuthenticatedV2PreparedCandidateLifecycle,
} from './relayer-core/authenticated-v2-prepared-candidate-recovery.js';
import {
  StateTracker,
  type AuthenticatedSettlementCandidateInput,
} from './state-tracker.js';
import {
  startStableSidechainJsonRpcFixture,
  type StableSidechainJsonRpcFixture,
} from './stable-sidechain-json-rpc.test-helper.js';
import { deriveTrustlessBurnIdHex } from './trustless-burn-proof.js';

const SIDECHAIN_ID = '10'.repeat(32);
const SIDECHAIN_TX_HASH = '11'.repeat(32);
const SIDECHAIN_BLOCK_HASH = '12'.repeat(32);
const TRACKER_BOX_ID = '13'.repeat(32);
const DUP_BOX_ID = '14'.repeat(32);
const VAULT_BOX_ID = '15'.repeat(32);
const PACKAGE_DIGEST = '16'.repeat(32);
const EXPECTED_TX_ID = '17'.repeat(32);
const UNSIGNED_TX_DIGEST = '18'.repeat(32);
const ERGO_TIP_ID = '19'.repeat(32);
const TRACKER_OBSERVATION_DIGEST = '2b'.repeat(32);
const SIDECHAIN_TIP_HASH = '33'.repeat(32);
const REPLACEMENT_BLOCK_HASH = '34'.repeat(32);
const BRIDGE_ADDRESS = '0x00000000000000000000000000000000000000b1';
const EVENT_INDEX = 3;
const SIDECHAIN_HEIGHT = 25n;
const ERGO_HEIGHT = 100;
const RECIPIENT_TREE = `0008cd02${'20'.repeat(32)}`;
const AMOUNT = 10_000_000n;
const bridgeInterface = new ethers.Interface([
  'event PegOut(address indexed user, uint256 amount, bytes ergoRecipientPubKey)',
]);

function trackerValue(): string {
  return encodeAuthenticatedSpvTrackerValue({
    bridgeEventRootHex: '21'.repeat(32),
    checkpointCommitmentHex: '22'.repeat(32),
    anchorHeaderIdHex: '23'.repeat(32),
    anchorHeaderHeight: 90,
    finalityProofSystemId: AGGREGATE_FINALITY_PROOF_SYSTEM_NATIVE_GRANDPA,
    finalityStatementDigestHex: '24'.repeat(32),
    finalityProgramIdHex: deriveBridgeFinalityProgramIdHex(),
    finalityVerifierProfileIdHex: '25'.repeat(32),
    finalityProofPayloadDigestHex: '26'.repeat(32),
    finalityProofDigestHex: '27'.repeat(32),
  });
}

function candidate(): AuthenticatedSettlementCandidateInput {
  const value = trackerValue();
  const trackerKey = deriveAuthenticatedSpvTrackerKey({
    sidechainIdHex: SIDECHAIN_ID,
    sidechainHeight: SIDECHAIN_HEIGHT,
    executionBlockHashHex: SIDECHAIN_BLOCK_HASH,
  });
  return {
    schemaVersion: AUTHENTICATED_SETTLEMENT_CANDIDATE_SCHEMA_VERSION,
    candidateId: '28'.repeat(32),
    burnId: deriveTrustlessBurnIdHex({
      sidechainIdHex: SIDECHAIN_ID,
      sidechainTxHashHex: SIDECHAIN_TX_HASH,
      eventIndex: EVENT_INDEX,
    }),
    burnTxHash: SIDECHAIN_TX_HASH,
    sidechainId: SIDECHAIN_ID,
    sidechainHeight: SIDECHAIN_HEIGHT,
    sidechainBlockHash: SIDECHAIN_BLOCK_HASH,
    sidechainLogIndex: EVENT_INDEX,
    trackerKey,
    trackerValue: value,
    trackerBoxId: TRACKER_BOX_ID,
    anchorHeaderId: '23'.repeat(32),
    anchorHeaderHeight: 90,
    dupInputBoxId: DUP_BOX_ID,
    dupInputDigest: getDupTreeDigest([]),
    vaultBoxId: VAULT_BOX_ID,
    unsignedTxDigest: UNSIGNED_TX_DIGEST,
    creationHeight: ERGO_HEIGHT,
    observedSidechainTip: 35n,
    observedErgoTip: ERGO_HEIGHT,
  };
}

function packageValue(value = candidate()) {
  return {
    packageDigestHex: PACKAGE_DIGEST,
    creationHeight: value.creationHeight,
    targetBurn: {
      burnIdHex: value.burnId,
      sidechainTxHashHex: value.burnTxHash,
      sidechainIdHex: value.sidechainId,
      sidechainHeight: value.sidechainHeight.toString(),
      executionBlockHashHex: value.sidechainBlockHash,
      eventIndex: value.sidechainLogIndex,
    },
    canonicalInputBytes: {
      trackerDataInput: { boxIdHex: value.trackerBoxId },
      duplicatePreventionInput: { boxIdHex: value.dupInputBoxId },
      vaultInput: { boxIdHex: value.vaultBoxId },
    },
    transaction: {
      eip12Sha256Hex: value.unsignedTxDigest,
      unsignedTransactionIdHex: EXPECTED_TX_ID,
    },
  };
}

function cacheRecovery(value = candidate()): AuthenticatedV2CacheRecoveryReport {
  return {
    schema: AUTHENTICATED_V2_CACHE_RECOVERY_SCHEMA,
    observedTip: {
      idHex: ERGO_TIP_ID,
      parentIdHex: '29'.repeat(32),
      height: ERGO_HEIGHT,
      extensionRootHex: '2a'.repeat(32),
    },
    reconstructionDigests: {
      tracker: TRACKER_OBSERVATION_DIGEST,
      duplicatePrevention: '2c'.repeat(32),
      vault: '2d'.repeat(32),
    },
    currentInputs: {
      trackerBoxIdHex: value.trackerBoxId,
      duplicatePreventionBoxIdHex: value.dupInputBoxId,
      vaultBoxIdsHex: [value.vaultBoxId],
    },
    replacement: {} as any,
    boundary: {
      dependencyOrderWasTrackerThenDupThenVault: true,
      localDatabaseIsReplaceableCache: true,
      noCandidateOrAttemptAuthorityCreated: true,
      noJvmCheckSignerSubmissionConfirmationOrBroadcastAuthority: true,
      distinctOriginsDetectDisagreementButDoNotProveConsensus: true,
    },
  };
}

function pegOut(value = candidate()) {
  return {
    user: `0x${'2e'.repeat(20)}`,
    amount: AMOUNT,
    ergoRecipientAddress: RECIPIENT_TREE,
    sidechainTxHash: value.burnTxHash,
    sidechainBlockNumber: Number(value.sidechainHeight),
    sidechainBlockHash: value.sidechainBlockHash,
    sidechainLogIndex: value.sidechainLogIndex,
  };
}

interface SidechainSourceOptions {
  heights?: number[];
  receipt?: unknown;
  canonicalBlockHash?: string;
  tipHashes?: string[];
}

function sidechainReceipt(value = candidate()) {
  const burn = pegOut(value);
  const encoded = bridgeInterface.encodeEventLog(
    bridgeInterface.getEvent('PegOut')!,
    [burn.user, burn.amount, `0x${burn.ergoRecipientAddress}`],
  );
  return {
    status: 1,
    hash: `0x${burn.sidechainTxHash}`,
    blockNumber: burn.sidechainBlockNumber,
    blockHash: `0x${burn.sidechainBlockHash}`,
    logs: [{
      address: BRIDGE_ADDRESS,
      topics: [...encoded.topics],
      data: encoded.data,
      transactionHash: `0x${burn.sidechainTxHash}`,
      blockNumber: burn.sidechainBlockNumber,
      blockHash: `0x${burn.sidechainBlockHash}`,
      logIndex: burn.sidechainLogIndex,
    }],
  };
}

function sidechainSource(
  value = candidate(),
  input: SidechainSourceOptions = {},
): StableSidechainSource {
  const defaultTip = Number(value.observedSidechainTip);
  const heights = [...(input.heights ?? [defaultTip, defaultTip])];
  const tipHashes = [...(input.tipHashes ?? [SIDECHAIN_TIP_HASH, SIDECHAIN_TIP_HASH])];
  return {
    getBlockNumber: vi.fn(async () => heights.shift() ?? defaultTip),
    getTransactionReceipt: vi.fn(async () => (
      Object.prototype.hasOwnProperty.call(input, 'receipt')
        ? input.receipt
        : sidechainReceipt(value)
    )),
    getBlock: vi.fn(async (blockNumber: number) => ({
      hash: blockNumber === Number(value.sidechainHeight)
        ? input.canonicalBlockHash ?? `0x${value.sidechainBlockHash}`
        : `0x${tipHashes.shift() ?? SIDECHAIN_TIP_HASH}`,
    })),
  };
}

const sidechainRpcFixtures: StableSidechainJsonRpcFixture[] = [];
const sidechainSourcePairs: AuthenticatedSettlementSidechainObservationSourcePair[] = [];

async function sidechainSourcePair(
  value = candidate(),
  input: { primary?: SidechainSourceOptions; witness?: SidechainSourceOptions } = {},
) {
  const primary = await startStableSidechainJsonRpcFixture(sidechainSource(value, input.primary));
  sidechainRpcFixtures.push(primary);
  const witness = await startStableSidechainJsonRpcFixture(sidechainSource(value, input.witness));
  sidechainRpcFixtures.push(witness);
  const pair = createAuthenticatedSettlementSidechainObservationSourcePair({
    primaryRpcUrl: primary.rpcUrl,
    witnessRpcUrl: witness.rpcUrl,
  });
  sidechainSourcePairs.push(pair);
  return pair;
}

async function recoveryInput(
  state: StateTracker,
  value = candidate(),
  report = cacheRecovery(value),
  sidechain: { primary?: SidechainSourceOptions; witness?: SidechainSourceOptions } = {},
) {
  return {
    state,
    cacheRecovery: report,
    packageValue: packageValue(value),
    expectedPackageDigestHex: PACKAGE_DIGEST,
    nativeAdmission: {} as any,
    prepared: {} as any,
    pegOut: pegOut(value),
    trackerIdentity: {
      sidechainIdHex: value.sidechainId,
      sidechainHeight: value.sidechainHeight,
      executionBlockHashHex: value.sidechainBlockHash,
    },
    observedSidechainTip: value.observedSidechainTip,
    sidechainSources: await sidechainSourcePair(value, sidechain),
    bridgeAddress: BRIDGE_ADDRESS,
    requiredSidechainConfirmations: 10,
  };
}

function configureRecoveredCaches(state: StateTracker, value = candidate()): void {
  vi.spyOn(state, 'getAuthenticatedSpvTrackerReconstructionState').mockReturnValue({
    sidechainIdHex: value.sidechainId,
    trackerNftIdHex: '30'.repeat(32),
    genesisBoxId: '31'.repeat(32),
    finalityAttestorSigmaPropRegisterHex: '00',
    tipBoxId: value.trackerBoxId,
    tipDigest: '32'.repeat(33),
    observationDigest: TRACKER_OBSERVATION_DIGEST,
    observedErgoTip: ERGO_HEIGHT,
    observedErgoTipId: ERGO_TIP_ID,
    observedErgoParentId: '29'.repeat(32),
    observedErgoExtensionRoot: '2a'.repeat(32),
  });
  vi.spyOn(state, 'getAuthenticatedSpvTrackerHistory').mockReturnValue([{
    key: value.trackerKey,
    value: value.trackerValue,
  }]);
  vi.spyOn(state, 'getAuthenticatedV2DupReconstructionState').mockReturnValue({
    tipBoxId: value.dupInputBoxId,
    tipDigest: value.dupInputDigest,
    observedErgoTip: ERGO_HEIGHT,
    observedErgoTipId: ERGO_TIP_ID,
  } as any);
  vi.spyOn(state, 'getAuthenticatedV2VaultReconstructionState').mockReturnValue({
    observedErgoTip: ERGO_HEIGHT,
    observedErgoTipIdHex: ERGO_TIP_ID,
  } as any);
  vi.spyOn(state, 'getAuthenticatedV2CurrentVaultBoxIds').mockReturnValue([
    value.vaultBoxId,
  ]);
}

async function withTempDatabase(run: (path: string) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'bridge-package-recovery-'));
  try {
    await run(join(directory, 'state.sqlite'));
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  const value = candidate();
  const pkg = packageValue(value);
  validatePackage.mockResolvedValue(pkg);
  bindPackage.mockResolvedValue({
    packageDigestHex: PACKAGE_DIGEST,
    expectedTxId: EXPECTED_TX_ID,
    prepared: {},
  });
  authorizeCandidate.mockReturnValue(value);
});

afterEach(async () => {
  for (const pair of sidechainSourcePairs.splice(0)) {
    destroyAuthenticatedSettlementSidechainObservationSourcePair(pair);
  }
  await Promise.all(sidechainRpcFixtures.splice(0).map(fixture => fixture.close()));
});

describe('authenticated V2 package recovery', () => {
  it('rebuilds only a prepared candidate in an empty database and survives restart', async () => {
    await withTempDatabase(async dbPath => {
      let persistedRecovery: {
        sidechainConsensusDigestHex: string;
        recoveryAdmissionDigestHex: string;
        sidechainTipHashHex: string;
      } | undefined;
      const state = new StateTracker(dbPath);
      const value = candidate();
      configureRecoveredCaches(state, value);
      try {
        const input = await recoveryInput(state, value);
        const first = await recoverAuthenticatedV2PreparedCandidate(input);
        const second = await recoverAuthenticatedV2PreparedCandidate(input);
        persistedRecovery = {
          sidechainConsensusDigestHex: first.sidechainConsensusDigestHex,
          recoveryAdmissionDigestHex: first.recoveryAdmissionDigestHex,
          sidechainTipHashHex: first.sidechainTipHashHex,
        };

        expect(first.schema).toBe(AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA);
        expect(second.recoveryAdmissionDigestHex).toBe(first.recoveryAdmissionDigestHex);
        expect(first.candidate).toEqual(expect.objectContaining({
          candidateId: value.candidateId,
          status: 'prepared',
          recoverySchema: AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA,
          recoverySidechainConsensusDigest: first.sidechainConsensusDigestHex,
          recoveryAdmissionDigest: first.recoveryAdmissionDigestHex,
          recoverySidechainTipHash: first.sidechainTipHashHex,
          recoverySidechainSourceCount: 2,
          checkExpectedTxId: null,
          checkUnsignedPackageDigest: null,
          checkSignedTransactionDigest: null,
          checkResponseDigest: null,
          checkSignerContextDigest: null,
          checkCheckerIdentityDigest: null,
          checkRevalidationDigest: null,
          checkNativeVerificationRequestDigest: null,
          checkTrustAnchorDigest: null,
          checkFinalityHorizonHash: null,
          checkFinalityHorizonHeight: null,
          checkFinalityStatementDigest: null,
          checkFinalityProgramId: null,
          checkFinalityProofSystemId: null,
          checkFinalityVerifierProfileId: null,
          checkFinalityProofPayloadDigest: null,
          checkFinalityProofDigest: null,
          checkStableErgoViewDigest: null,
          checkStableSidechainViewDigest: null,
          checkAdmissionDigest: null,
        }));
        expect(first.boundary).toEqual({
          externalPackageIsAuthorityByItself: false,
          freshChainRecoveryRequired: true,
          ergoCacheSnapshotRevalidatedAtomically: true,
          sidechainBurnViewReobserved: true,
          matchingSidechainSourcesReobserved: true,
          distinctOriginsDetectDisagreementButDoNotProveConsensus: true,
          nativeAdmissionRecollectedInsideRecovery: false,
          restoredCandidateStatus: 'prepared',
          checkPassedRestored: false,
          signerSubmitterOrBroadcastAuthorityRestored: false,
        });
        expect(state.getPegOutByBurnId(value.burnId)).toEqual(expect.objectContaining({
          status: 'detected',
          burn_id: value.burnId,
        }));
        expect(state.getRecoverableAggregateSettlementAttempts()).toEqual([]);
      } finally {
        state.close();
      }

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getAuthenticatedSettlementCandidate(value.candidateId)).toEqual(
          expect.objectContaining({
            status: 'prepared',
            recoverySchema: AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA,
            recoverySidechainConsensusDigest: persistedRecovery!.sidechainConsensusDigestHex,
            recoveryAdmissionDigest: persistedRecovery!.recoveryAdmissionDigestHex,
            recoverySidechainTipHash: persistedRecovery!.sidechainTipHashHex,
            recoverySidechainSourceCount: 2,
            checkAdmissionDigest: null,
          }),
        );
        expect(reopened.getRecoverableAggregateSettlementAttempts()).toEqual([]);
      } finally {
        reopened.close();
      }
    });
  });

  it('rejects sidechain RPC disagreement before candidate or burn persistence', async () => {
    await withTempDatabase(async dbPath => {
      const state = new StateTracker(dbPath);
      const value = candidate();
      configureRecoveredCaches(state, value);
      try {
        await expect(recoverAuthenticatedV2PreparedCandidate(await recoveryInput(
          state,
          value,
          cacheRecovery(value),
          { witness: { heights: [36, 36] } },
        ))).rejects.toThrow(/sources disagree/i);
        expect(state.getPegOutByBurnId(value.burnId)).toBeUndefined();
        expect(state.getActiveAuthenticatedSettlementCandidates()).toEqual([]);
      } finally {
        state.close();
      }
    });
  });

  it('rejects a core-branded admission with forged sidechain consensus provenance', async () => {
    await withTempDatabase(async dbPath => {
      const state = new StateTracker(dbPath);
      const value = candidate();
      configureRecoveredCaches(state, value);
      try {
        await expect(recoverAuthenticatedV2PreparedCandidateLifecycle(
          { packageId: 'forged-consensus' },
          {
            reconstruction: {
              reconstruct: async () => ({
                candidate: value,
                pegOut: pegOut(value),
                cacheRecovery: cacheRecovery(value),
                packageDigestHex: PACKAGE_DIGEST,
                expectedTxId: EXPECTED_TX_ID,
                cacheRecoveryDigestHex: '3a'.repeat(32),
              }),
            },
            sourceObservation: {
              observe: async () => ({
                view: {
                  candidateId: value.candidateId,
                  burnIdHex: value.burnId,
                  sidechainIdHex: value.sidechainId,
                  sidechainTxHashHex: value.burnTxHash,
                  sidechainHeight: value.sidechainHeight,
                  executionBlockHashHex: value.sidechainBlockHash,
                  eventIndex: value.sidechainLogIndex,
                  amountNanoErg: AMOUNT,
                  recipientErgoTreeHex: RECIPIENT_TREE,
                  observedTipHeight: value.observedSidechainTip,
                  observedTipHashHex: SIDECHAIN_TIP_HASH,
                  confirmations: 11n,
                  requiredConfirmations: 10n,
                },
                sourceCount: 2,
                consensusDigestHex: '3b'.repeat(32),
              }),
            },
            binding: {
              digest: () => '3c'.repeat(32),
            },
            journal: {
              record: admission =>
                state.recordRecoveredAuthenticatedSettlementCandidate(admission),
            },
          },
        )).rejects.toThrow(/sidechain view provenance is missing/i);
        expect(state.getPegOutByBurnId(value.burnId)).toBeUndefined();
        expect(state.getActiveAuthenticatedSettlementCandidates()).toEqual([]);
      } finally {
        state.close();
      }
    });
  });

  it('rejects valid source provenance collected for another candidate', async () => {
    await withTempDatabase(async dbPath => {
      const state = new StateTracker(dbPath);
      const observed = candidate();
      const mismatched = {
        ...observed,
        candidateId: '3d'.repeat(32),
      };
      configureRecoveredCaches(state, mismatched);
      try {
        const consensus = (
          await observeMatchingAuthenticatedSettlementStableSidechainViews({
            sources: await sidechainSourcePair(observed),
            bridgeAddress: BRIDGE_ADDRESS,
            sidechainIdHex: observed.sidechainId,
            requiredConfirmations: 10,
            candidate: observed,
            pegOut: pegOut(observed),
          })
        ).consensus;

        await expect(recoverAuthenticatedV2PreparedCandidateLifecycle(
          { packageId: 'mixed-candidate' },
          {
            reconstruction: {
              reconstruct: async () => ({
                candidate: mismatched,
                pegOut: pegOut(mismatched),
                cacheRecovery: cacheRecovery(mismatched),
                packageDigestHex: PACKAGE_DIGEST,
                expectedTxId: EXPECTED_TX_ID,
                cacheRecoveryDigestHex: '3a'.repeat(32),
              }),
            },
            sourceObservation: {
              observe: async () => consensus,
            },
            binding: {
              digest: () => '3c'.repeat(32),
            },
            journal: {
              record: admission =>
                state.recordRecoveredAuthenticatedSettlementCandidate(admission),
            },
          },
        )).rejects.toThrow(/does not match the candidate and payout/i);
        expect(state.getPegOutByBurnId(mismatched.burnId)).toBeUndefined();
        expect(state.getActiveAuthenticatedSettlementCandidates()).toEqual([]);
      } finally {
        state.close();
      }
    });
  });

  it('rejects a non-canonical recovery digest before SQLite persistence', async () => {
    await withTempDatabase(async dbPath => {
      const state = new StateTracker(dbPath);
      const value = candidate();
      configureRecoveredCaches(state, value);
      try {
        const consensus = (
          await observeMatchingAuthenticatedSettlementStableSidechainViews({
            sources: await sidechainSourcePair(value),
            bridgeAddress: BRIDGE_ADDRESS,
            sidechainIdHex: value.sidechainId,
            requiredConfirmations: 10,
            candidate: value,
            pegOut: pegOut(value),
          })
        ).consensus;

        await expect(recoverAuthenticatedV2PreparedCandidateLifecycle(
          { packageId: 'arbitrary-digest' },
          {
            reconstruction: {
              reconstruct: async () => ({
                candidate: value,
                pegOut: pegOut(value),
                cacheRecovery: cacheRecovery(value),
                packageDigestHex: PACKAGE_DIGEST,
                expectedTxId: EXPECTED_TX_ID,
                cacheRecoveryDigestHex: '3a'.repeat(32),
              }),
            },
            sourceObservation: {
              observe: async () => consensus,
            },
            binding: {
              digest: () => '3c'.repeat(32),
            },
            journal: {
              record: admission =>
                state.recordRecoveredAuthenticatedSettlementCandidate(admission),
            },
          },
        )).rejects.toThrow(/admission digest is inconsistent/i);
        expect(state.getPegOutByBurnId(value.burnId)).toBeUndefined();
        expect(state.getActiveAuthenticatedSettlementCandidates()).toEqual([]);
      } finally {
        state.close();
      }
    });
  });

  it('rejects a deep-reorged burn before candidate or burn persistence', async () => {
    await withTempDatabase(async dbPath => {
      const state = new StateTracker(dbPath);
      const value = candidate();
      configureRecoveredCaches(state, value);
      try {
        await expect(recoverAuthenticatedV2PreparedCandidate(await recoveryInput(
          state,
          value,
          cacheRecovery(value),
          { witness: { canonicalBlockHash: `0x${REPLACEMENT_BLOCK_HASH}` } },
        ))).rejects.toThrow(/not confirmed.*block hash/i);
        expect(state.getPegOutByBurnId(value.burnId)).toBeUndefined();
        expect(state.getActiveAuthenticatedSettlementCandidates()).toEqual([]);
      } finally {
        state.close();
      }
    });
  });

  it('rejects a matching sidechain view whose fresh tip differs from the candidate tip', async () => {
    await withTempDatabase(async dbPath => {
      const state = new StateTracker(dbPath);
      const value = candidate();
      configureRecoveredCaches(state, value);
      try {
        await expect(recoverAuthenticatedV2PreparedCandidate(await recoveryInput(
          state,
          value,
          cacheRecovery(value),
          { primary: { heights: [36, 36] }, witness: { heights: [36, 36] } },
        ))).rejects.toThrow(/candidate tip does not match.*freshly observed/i);
        expect(state.getPegOutByBurnId(value.burnId)).toBeUndefined();
        expect(state.getActiveAuthenticatedSettlementCandidates()).toEqual([]);
      } finally {
        state.close();
      }
    });
  });

  it('rejects package digest drift before candidate or burn persistence', async () => {
    await withTempDatabase(async dbPath => {
      const state = new StateTracker(dbPath);
      const value = candidate();
      configureRecoveredCaches(state, value);
      try {
        await expect(recoverAuthenticatedV2PreparedCandidate({
          ...(await recoveryInput(state, value)),
          expectedPackageDigestHex: 'ff'.repeat(32),
        })).rejects.toThrow(/explicitly expected digest/i);
        expect(state.getPegOutByBurnId(value.burnId)).toBeUndefined();
        expect(state.getActiveAuthenticatedSettlementCandidates()).toEqual([]);
        expect(authorizeCandidate).not.toHaveBeenCalled();
      } finally {
        state.close();
      }
    });
  });

  it('holds the SQLite write lock while rechecking reconstructed caches', async () => {
    await withTempDatabase(async dbPath => {
      const state = new StateTracker(dbPath);
      const contender = new StateTracker(dbPath);
      const value = candidate();
      configureRecoveredCaches(state, value);
      const contenderDb = (contender as any).db;
      contenderDb.pragma('busy_timeout = 0');
      contenderDb.exec('CREATE TABLE recovery_race_probe (id INTEGER PRIMARY KEY)');
      let competingWriteErrorCode: string | undefined;
      vi.mocked(state.getAuthenticatedSpvTrackerHistory).mockImplementation(() => {
        try {
          contenderDb.prepare('INSERT INTO recovery_race_probe (id) VALUES (1)').run();
        } catch (error) {
          competingWriteErrorCode = (error as { code?: string }).code;
        }
        return [{ key: value.trackerKey, value: value.trackerValue }];
      });
      try {
        await recoverAuthenticatedV2PreparedCandidate(await recoveryInput(state, value));
        expect(competingWriteErrorCode).toBe('SQLITE_BUSY');
        expect(contenderDb.prepare('SELECT COUNT(*) AS count FROM recovery_race_probe').get())
          .toEqual({ count: 0 });
      } finally {
        contender.close();
        state.close();
      }
    });
  });

  it('rejects a candidate whose selected vault is absent from fresh cache recovery', async () => {
    await withTempDatabase(async dbPath => {
      const state = new StateTracker(dbPath);
      const value = candidate();
      configureRecoveredCaches(state, value);
      const recovered = cacheRecovery(value);
      const report: AuthenticatedV2CacheRecoveryReport = {
        ...recovered,
        currentInputs: { ...recovered.currentInputs, vaultBoxIdsHex: [] },
      };
      try {
        await expect(recoverAuthenticatedV2PreparedCandidate(
          await recoveryInput(state, value, report),
        )).rejects.toThrow(/recovered current vault/i);
        expect(state.getPegOutByBurnId(value.burnId)).toBeUndefined();
        expect(state.getActiveAuthenticatedSettlementCandidates()).toEqual([]);
      } finally {
        state.close();
      }
    });
  });

  it('rejects when the reconstructed vault cache changes after the recovery report', async () => {
    await withTempDatabase(async dbPath => {
      const state = new StateTracker(dbPath);
      const value = candidate();
      configureRecoveredCaches(state, value);
      vi.mocked(state.getAuthenticatedV2CurrentVaultBoxIds).mockReturnValue([]);
      try {
        await expect(recoverAuthenticatedV2PreparedCandidate(await recoveryInput(state, value)))
          .rejects.toThrow(/reconstructed cache/i);
        expect(state.getPegOutByBurnId(value.burnId)).toBeUndefined();
        expect(state.getActiveAuthenticatedSettlementCandidates()).toEqual([]);
      } finally {
        state.close();
      }
    });
  });

  it('rejects when the tracker advances after the recovery report even if the old entry remains', async () => {
    await withTempDatabase(async dbPath => {
      const state = new StateTracker(dbPath);
      const value = candidate();
      configureRecoveredCaches(state, value);
      const current = state.getAuthenticatedSpvTrackerReconstructionState(value.sidechainId)!;
      vi.mocked(state.getAuthenticatedSpvTrackerReconstructionState).mockReturnValue({
        ...current,
        tipBoxId: 'ff'.repeat(32),
        observationDigest: 'fe'.repeat(32),
      });
      try {
        await expect(recoverAuthenticatedV2PreparedCandidate(await recoveryInput(state, value)))
          .rejects.toThrow(/exact current reconstructed cache input/i);
        expect(state.getPegOutByBurnId(value.burnId)).toBeUndefined();
        expect(state.getActiveAuthenticatedSettlementCandidates()).toEqual([]);
      } finally {
        state.close();
      }
    });
  });

  it('rejects a burn already present in reconstructed authenticated DUP history', async () => {
    await withTempDatabase(async dbPath => {
      const state = new StateTracker(dbPath);
      const value = candidate();
      configureRecoveredCaches(state, value);
      vi.spyOn(state, 'getAuthenticatedV2DupHistory').mockReturnValue([value.burnId]);
      try {
        await expect(recoverAuthenticatedV2PreparedCandidate(await recoveryInput(state, value)))
          .rejects.toThrow(/already present in authenticated DUP history/i);
        expect(state.getPegOutByBurnId(value.burnId)).toBeUndefined();
        expect(state.getActiveAuthenticatedSettlementCandidates()).toEqual([]);
      } finally {
        state.close();
      }
    });
  });

  it('rolls back the burn observation when candidate persistence fails', async () => {
    await withTempDatabase(async dbPath => {
      const state = new StateTracker(dbPath);
      const value = candidate();
      configureRecoveredCaches(state, value);
      vi.spyOn(state, 'recordAuthenticatedSettlementCandidate')
        .mockImplementationOnce(() => { throw new Error('forced candidate write failure'); });
      try {
        await expect(recoverAuthenticatedV2PreparedCandidate(await recoveryInput(state, value)))
          .rejects.toThrow(/forced candidate write failure/i);
        expect(state.getPegOutByBurnId(value.burnId)).toBeUndefined();
        expect(state.getActiveAuthenticatedSettlementCandidates()).toEqual([]);
      } finally {
        state.close();
      }
    });
  });

  it('rejects direct or cloned recovery admissions without process provenance', () => {
    const state = new StateTracker(':memory:');
    try {
      expect(() => state.recordRecoveredAuthenticatedSettlementCandidate({} as any))
        .toThrow(/recovery provenance/i);
      expect(() => state.recordRecoveredAuthenticatedSettlementCandidate(structuredClone({
        schema: AUTHENTICATED_V2_PACKAGE_RECOVERY_SCHEMA,
      }) as any)).toThrow(/recovery provenance/i);
    } finally {
      state.close();
    }
  });
});
