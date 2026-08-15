import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./peg-in-joined-cache-recovery.js', () => ({
  assertPegInJoinedCacheRecoveryReportProvenance: vi.fn(),
  recoverPegInJoinedCache: vi.fn(),
}));

import {
  assertPegInJoinedCacheRecoveryReportProvenance,
  type PegInJoinedCacheRecoveryReport,
} from './peg-in-joined-cache-recovery.js';
import {
  assertPegInRuntimeManifestDeploymentBinding,
  assertPegInRuntimeProfileDeploymentBinding,
  loadPegInRuntimeReconciliationFromEnvironment,
  PegInRuntimeReconciliationPass,
  type PegInRuntimeDeploymentBinding,
  type PegInRuntimeReconciliationState,
} from './peg-in-runtime-reconciliation.js';
import type { PegInRouteManifestV1 } from './peg-in-route-manifest.js';
import {
  PEG_IN_SIDECHAIN_PROFILE_SCHEMA,
  type PegInSidechainProfileV1,
} from './peg-in-sidechain-reconstruction.js';
import type {
  PegInEvent,
  RecordPegInReconciliationResult,
  StateTracker,
} from './state-tracker.js';
import { pegInLifecycleDigestHex } from './state-tracker.js';

const DIGEST = '11'.repeat(32);

beforeEach(() => vi.clearAllMocks());

function candidate(id: number, byte: string): PegInEvent {
  return {
    id,
    ergoLockBoxId: byte.repeat(64),
    targetEvmAddress: `0x${'22'.repeat(20)}`,
    amountNanoErg: 10_000_000n,
    ergoLockHeight: 100 + id,
    status: 'detected',
    sourceClassification: 'active_committed_vault',
    depositorErgoTreeHex: null,
    commitTxId: null,
    committedVaultBoxId: null,
    commitInclusionHeight: null,
    commitInclusionHeaderId: null,
    commitmentReceipt: null,
    commitmentReceiptDigestHex: null,
    commitFailure: null,
    sidechainMintTxHash: null,
    createdAt: '2026-07-16 10:00:00',
    updatedAt: '2026-07-16 10:00:00',
  };
}

function recoveryReport(): PegInJoinedCacheRecoveryReport {
  return {
    reconstructionDigestHex: DIGEST,
    boundary: {
      pegInLifecycleRowsCreatedOrChanged: false,
      settlementAuthorityRowsCreatedOrChanged: false,
      mintEligibilityRestored: false,
      grandpaFinalityRestored: false,
      checkerSignerSubmitterOrBroadcastAuthorityCreated: false,
    },
  } as PegInJoinedCacheRecoveryReport;
}

function recorded(appended: boolean): RecordPegInReconciliationResult {
  return {
    appended,
    lifecycleRowsCreatedOrChanged: 0,
    settlementAuthorityRowsCreatedOrChanged: 0,
  } as RecordPegInReconciliationResult;
}

function statePort(candidates: PegInEvent[]): PegInRuntimeReconciliationState & {
  recordedInputs: Array<{
    ergoLockBoxId: string;
    expectedLifecycleDigestHex: string;
    expectedJoinedReconstructionDigestHex: string;
  }>;
} {
  const recordedInputs: Array<{
    ergoLockBoxId: string;
    expectedLifecycleDigestHex: string;
    expectedJoinedReconstructionDigestHex: string;
  }> = [];
  return {
    recordedInputs,
    hasPegInRuntimeReconciliationLifecycleRows: vi.fn(() => candidates.length > 0),
    getPegInRuntimeReconciliationCandidates: vi.fn(() => ({
      candidates,
      remainingCandidates: false,
    })),
    recordPegInReconciliationFromJoinedCache: vi.fn(input => {
      recordedInputs.push(input);
      return recorded(recordedInputs.length === 1);
    }),
  };
}

describe('PegInRuntimeReconciliationPass', () => {
  it('does no network recollection when no existing lifecycle row needs a hold', async () => {
    const state = statePort([]);
    const collect = vi.fn(async () => recoveryReport());
    const report = await new PegInRuntimeReconciliationPass(state, collect).run();

    expect(collect).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      status: 'no_candidates',
      candidatesObserved: 0,
      lifecycleSelectionAuthorized: false,
      nativeGrandpaFinalityAccepted: false,
      lifecycleRowsCreatedOrPromoted: 0,
      mintRetryOrHoldReleasePerformed: false,
    });
  });

  it('recollects once and records exact CAS-bound holds for every bounded row', async () => {
    const rows = [candidate(1, 'a'), candidate(2, 'b')];
    const state = statePort(rows);
    const collect = vi.fn(async () => recoveryReport());
    const report = await new PegInRuntimeReconciliationPass(state, collect, 2).run();

    expect(collect).toHaveBeenCalledTimes(1);
    expect(assertPegInJoinedCacheRecoveryReportProvenance).toHaveBeenCalledTimes(1);
    expect(state.recordedInputs).toEqual(rows.map(row => ({
      ergoLockBoxId: row.ergoLockBoxId,
      expectedLifecycleDigestHex: pegInLifecycleDigestHex(row),
      expectedJoinedReconstructionDigestHex: DIGEST,
    })));
    expect(report).toMatchObject({
      status: 'holds_recorded',
      candidatesObserved: 2,
      remainingCandidates: false,
      journalEntriesAppended: 1,
      currentHoldsConfirmed: 2,
      joinedReconstructionDigestHex: DIGEST,
      lifecycleSelectionAuthorized: false,
      nativeGrandpaFinalityAccepted: false,
    });
  });

  it('fails before journal mutation when fresh joined recollection fails', async () => {
    const state = statePort([candidate(1, 'a')]);
    const pass = new PegInRuntimeReconciliationPass(
      state,
      async () => { throw new Error('distinct Frontier sources disagree'); },
    );

    await expect(pass.run()).rejects.toThrow('distinct Frontier sources disagree');
    expect(state.recordedInputs).toEqual([]);
  });

  it('rejects a collector that crosses any non-authorizing recovery boundary', async () => {
    const state = statePort([candidate(1, 'a')]);
    const unsafe = recoveryReport() as unknown as {
      boundary: { mintEligibilityRestored: boolean };
    };
    unsafe.boundary.mintEligibilityRestored = true;
    const pass = new PegInRuntimeReconciliationPass(
      state,
      async () => unsafe as PegInJoinedCacheRecoveryReport,
    );

    await expect(pass.run()).rejects.toThrow('crossed its non-authorizing boundary');
    expect(state.recordedInputs).toEqual([]);
  });

  it('rejects an oversized pass before any collector can run', () => {
    const collect = vi.fn(async () => recoveryReport());
    expect(() => new PegInRuntimeReconciliationPass(statePort([]), collect, 1_001))
      .toThrow('must be between 1 and 1000');
    expect(collect).not.toHaveBeenCalled();
  });
});

describe('peg-in runtime reconciliation environment boundary', () => {
  it('is absent by default and accepts only an exact enable switch', () => {
    const stateTracker = {} as StateTracker;
    expect(loadPegInRuntimeReconciliationFromEnvironment({
      stateTracker,
      environment: {},
    })).toBeNull();
    expect(loadPegInRuntimeReconciliationFromEnvironment({
      stateTracker,
      environment: { PEG_IN_RUNTIME_RECONCILIATION_ENABLED: 'false' },
    })).toBeNull();
    expect(() => loadPegInRuntimeReconciliationFromEnvironment({
      stateTracker,
      environment: { PEG_IN_RUNTIME_RECONCILIATION_ENABLED: 'TRUE' },
    })).toThrow('must be exactly true or false');
  });

  it('rejects enabled runtime wiring until every explicit source and profile field exists', () => {
    expect(() => loadPegInRuntimeReconciliationFromEnvironment({
      stateTracker: {} as StateTracker,
      environment: { PEG_IN_RUNTIME_RECONCILIATION_ENABLED: 'true' },
    })).toThrow(
      'PEG_IN_RUNTIME_ROUTE_MANIFEST_PATH, PEG_IN_RUNTIME_ROUTE_MANIFEST_SHA256',
    );
  });

  it('rejects aliased Ergo or Frontier origins before reading configured files', () => {
    const environment = completeEnvironment();
    environment.PEG_IN_RUNTIME_ERGO_WITNESS_NODE_URL =
      environment.PEG_IN_RUNTIME_ERGO_PRIMARY_NODE_URL;
    expect(() => loadPegInRuntimeReconciliationFromEnvironment({
      stateTracker: {} as StateTracker,
      deploymentBinding: runtimeDeploymentBinding(),
      environment,
    })).toThrow('requires distinct Ergo node origins');

    const frontierAliased = completeEnvironment();
    frontierAliased.PEG_IN_RUNTIME_FRONTIER_WITNESS_RPC_URL =
      frontierAliased.PEG_IN_RUNTIME_FRONTIER_PRIMARY_RPC_URL;
    expect(() => loadPegInRuntimeReconciliationFromEnvironment({
      stateTracker: {} as StateTracker,
      deploymentBinding: runtimeDeploymentBinding(),
      environment: frontierAliased,
    })).toThrow('requires distinct Frontier origins');
  });

  it('rejects a sidechain profile that differs from the active deployment', () => {
    const environment = completeEnvironment();
    environment.PEG_IN_RUNTIME_SIDECHAIN_ID_HEX = '44'.repeat(32);
    expect(() => loadPegInRuntimeReconciliationFromEnvironment({
      stateTracker: {} as StateTracker,
      deploymentBinding: runtimeDeploymentBinding(),
      environment,
    })).toThrow('sidechain profile differs from active deployment: sidechainIdHex');
  });
});

describe('peg-in runtime active deployment binding', () => {
  it('isolates every sidechain profile field consumed from active configuration', () => {
    const binding = runtimeDeploymentBinding();
    const base = runtimeProfile();
    expect(() => assertPegInRuntimeProfileDeploymentBinding(base, binding)).not.toThrow();

    for (const [field, mutate] of [
      ['sidechainIdHex', (value: PegInSidechainProfileV1) => ({
        ...value,
        sidechainIdHex: '44'.repeat(32),
      })],
      ['bridgeAddress', (value: PegInSidechainProfileV1) => ({
        ...value,
        bridgeAddress: `0x${'55'.repeat(20)}`,
      })],
      ['evmChainId', (value: PegInSidechainProfileV1) => ({
        ...value,
        evmChainId: '31338',
      })],
      ['deploymentBlock', (value: PegInSidechainProfileV1) => ({
        ...value,
        deploymentBlock: 1,
      })],
      ['requiredConfirmations', (value: PegInSidechainProfileV1) => ({
        ...value,
        requiredConfirmations: 11,
      })],
    ] as const) {
      expect(() => assertPegInRuntimeProfileDeploymentBinding(mutate(base), binding))
        .toThrow(field);
    }
  });

  it('rejects a runtime primary Frontier origin that differs from the daemon RPC', () => {
    const binding = {
      ...runtimeDeploymentBinding(),
      frontierPrimaryRpcUrl: 'http://another-frontier.invalid:9945',
    };
    expect(() => loadPegInRuntimeReconciliationFromEnvironment({
      stateTracker: {} as StateTracker,
      deploymentBinding: binding,
      environment: completeEnvironment(),
    })).toThrow('differs from the operational daemon RPC');
  });

  it('isolates every route field consumed from the active MCL and vault deployment', () => {
    const binding = runtimeDeploymentBinding();
    const base = runtimeManifestBinding();
    expect(() => assertPegInRuntimeManifestDeploymentBinding(base, binding)).not.toThrow();

    const mutations: Array<[string, (value: PegInRouteManifestV1) => void]> = [
      ['mainChainLock.address', value => { (value as any).route.mainChainLock.address = '9hOther'; }],
      ['mainChainLock.ergoTreeHex', value => { (value as any).route.mainChainLock.ergoTreeHex = '02'; }],
      ['settlementVault.address', value => { (value as any).route.settlementVault.address = '9hOther'; }],
      ['settlementVault.ergoTreeHex', value => { (value as any).route.settlementVault.ergoTreeHex = '03'; }],
      ['commitConfirmations', value => { (value as any).route.commitConfirmations = 11; }],
    ];
    for (const [field, mutate] of mutations) {
      const value = JSON.parse(JSON.stringify(base)) as PegInRouteManifestV1;
      mutate(value);
      expect(() => assertPegInRuntimeManifestDeploymentBinding(value, binding))
        .toThrow(field);
    }
  });
});

function completeEnvironment(): NodeJS.ProcessEnv {
  return {
    PEG_IN_RUNTIME_RECONCILIATION_ENABLED: 'true',
    PEG_IN_RUNTIME_ROUTE_MANIFEST_PATH: 'not-read-manifest.json',
    PEG_IN_RUNTIME_ROUTE_MANIFEST_SHA256: '11'.repeat(32),
    PEG_IN_RUNTIME_MAIN_CHAIN_LOCK_SOURCE_PATH: 'not-read-mcl.es',
    PEG_IN_RUNTIME_SETTLEMENT_VAULT_SOURCE_PATH: 'not-read-vault.es',
    PEG_IN_RUNTIME_ERGO_PRIMARY_NODE_URL: 'http://ergo-primary.invalid:9052',
    PEG_IN_RUNTIME_ERGO_WITNESS_NODE_URL: 'http://ergo-witness.invalid:9052',
    PEG_IN_RUNTIME_FRONTIER_PRIMARY_RPC_URL: 'http://frontier-primary.invalid:9945',
    PEG_IN_RUNTIME_FRONTIER_WITNESS_RPC_URL: 'http://frontier-witness.invalid:9945',
    PEG_IN_RUNTIME_SIDECHAIN_ID_HEX: '22'.repeat(32),
    PEG_IN_RUNTIME_EVM_CHAIN_ID: '31337',
    PEG_IN_RUNTIME_BRIDGE_ADDRESS: `0x${'33'.repeat(20)}`,
    PEG_IN_RUNTIME_DEPLOYMENT_BLOCK: '0',
    PEG_IN_RUNTIME_REQUIRED_CONFIRMATIONS: '10',
    PEG_IN_RUNTIME_MAX_EVENTS: '100',
  };
}

function runtimeDeploymentBinding(): PegInRuntimeDeploymentBinding {
  return {
    lockAddress: '9hMCL',
    lockErgoTreeHex: '00',
    vaultAddress: '9hVault',
    vaultErgoTreeHex: '01',
    sidechainIdHex: '22'.repeat(32),
    bridgeAddress: `0x${'33'.repeat(20)}`,
    frontierPrimaryRpcUrl: 'http://frontier-primary.invalid:9945',
    evmChainId: '31337',
    bridgeDeploymentBlock: 0,
    ergoCommitConfirmations: 10,
    frontierRequiredConfirmations: 10,
  };
}

function runtimeProfile(): PegInSidechainProfileV1 {
  return {
    schema: PEG_IN_SIDECHAIN_PROFILE_SCHEMA,
    sidechainIdHex: '22'.repeat(32),
    evmChainId: '31337',
    bridgeAddress: `0x${'33'.repeat(20)}`,
    deploymentBlock: 0,
    requiredConfirmations: 10,
    maxEvents: 100,
  };
}

function runtimeManifestBinding(): PegInRouteManifestV1 {
  return {
    route: {
      commitConfirmations: 10,
      mainChainLock: {
        address: '9hMCL',
        ergoTreeHex: '00',
      },
      settlementVault: {
        address: '9hVault',
        ergoTreeHex: '01',
      },
    },
  } as PegInRouteManifestV1;
}
