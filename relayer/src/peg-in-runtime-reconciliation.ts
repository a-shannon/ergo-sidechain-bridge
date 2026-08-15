/**
 * Runtime-only peg-in recollection boundary.
 *
 * This pass can append defer/quarantine holds for existing lifecycle rows. It
 * deliberately cannot authorize lifecycle selection while native GRANDPA
 * finality is unavailable.
 */

import { readFileSync } from 'fs';

import {
  assertPegInJoinedCacheRecoveryReportProvenance,
  recoverPegInJoinedCache,
  type PegInJoinedCacheRecoveryReport,
} from './peg-in-joined-cache-recovery.js';
import { PegInRouteReadOnlyNodeClient } from './peg-in-route-read-only-node-client.js';
import {
  parsePegInRouteManifestSource,
  type PegInRouteManifestV1,
} from './peg-in-route-manifest.js';
import {
  createReadOnlyFrontierPegInSource,
  PEG_IN_SIDECHAIN_PROFILE_SCHEMA,
  type PegInSidechainProfileV1,
} from './peg-in-sidechain-reconstruction.js';
import { canonicalNodeOrigin } from './ergo-node-endpoint-alignment.js';
import type {
  PegInRuntimeReconciliationCandidatePage,
  RecordPegInReconciliationResult,
  StateTracker,
} from './state-tracker.js';
import { pegInLifecycleDigestHex } from './state-tracker.js';

export const PEG_IN_RUNTIME_RECONCILIATION_SCHEMA =
  'e2s.peg-in-runtime-reconciliation.v1';
export const DEFAULT_PEG_IN_RUNTIME_RECONCILIATION_MAX_ROWS = 50;
export const MAX_PEG_IN_RUNTIME_RECONCILIATION_ROWS = 1_000;

export interface PegInRuntimeDeploymentBinding {
  readonly lockAddress: string;
  readonly lockErgoTreeHex: string;
  readonly vaultAddress: string;
  readonly vaultErgoTreeHex: string;
  readonly sidechainIdHex: string;
  readonly bridgeAddress: string;
  readonly frontierPrimaryRpcUrl: string;
  readonly evmChainId: string;
  readonly bridgeDeploymentBlock: number;
  readonly ergoCommitConfirmations: number;
  readonly frontierRequiredConfirmations: number;
}

export interface PegInRuntimeReconciliationState {
  hasPegInRuntimeReconciliationLifecycleRows(): boolean;
  getPegInRuntimeReconciliationCandidates(
    joinedReconstructionDigestHex: string,
    maxRows: number,
  ): PegInRuntimeReconciliationCandidatePage;
  recordPegInReconciliationFromJoinedCache(input: {
    ergoLockBoxId: string;
    expectedLifecycleDigestHex: string;
    expectedJoinedReconstructionDigestHex: string;
  }): RecordPegInReconciliationResult;
}

export interface PegInRuntimeReconciliationReport {
  readonly schema: typeof PEG_IN_RUNTIME_RECONCILIATION_SCHEMA;
  readonly status: 'no_candidates' | 'holds_current' | 'holds_recorded';
  readonly candidatesObserved: number;
  readonly remainingCandidates: boolean;
  readonly journalEntriesAppended: number;
  readonly currentHoldsConfirmed: number;
  readonly joinedReconstructionDigestHex: string | null;
  readonly lifecycleSelectionAuthorized: false;
  readonly nativeGrandpaFinalityAccepted: false;
  readonly lifecycleRowsCreatedOrPromoted: 0;
  readonly mintRetryOrHoldReleasePerformed: false;
}

export class PegInRuntimeReconciliationPass {
  constructor(
    private readonly state: PegInRuntimeReconciliationState,
    private readonly collectJoinedCache: () => Promise<PegInJoinedCacheRecoveryReport>,
    private readonly maxRows = DEFAULT_PEG_IN_RUNTIME_RECONCILIATION_MAX_ROWS,
  ) {
    assertMaxRows(maxRows);
  }

  async run(): Promise<PegInRuntimeReconciliationReport> {
    if (!this.state.hasPegInRuntimeReconciliationLifecycleRows()) {
      return frozenReport({
        status: 'no_candidates',
        candidatesObserved: 0,
        remainingCandidates: false,
        journalEntriesAppended: 0,
        currentHoldsConfirmed: 0,
        joinedReconstructionDigestHex: null,
      });
    }

    const recovery = await this.collectJoinedCache();
    assertPegInJoinedCacheRecoveryReportProvenance(recovery);
    if (
      recovery.boundary.pegInLifecycleRowsCreatedOrChanged
      || recovery.boundary.settlementAuthorityRowsCreatedOrChanged
      || recovery.boundary.mintEligibilityRestored
      || recovery.boundary.grandpaFinalityRestored
      || recovery.boundary.checkerSignerSubmitterOrBroadcastAuthorityCreated
    ) {
      throw new Error('peg-in runtime recollection crossed its non-authorizing boundary');
    }

    const page = this.state.getPegInRuntimeReconciliationCandidates(
      recovery.reconstructionDigestHex,
      this.maxRows,
    );
    const candidates = page.candidates;

    let appended = 0;
    for (const candidate of candidates) {
      const lifecycleDigestHex = pegInLifecycleDigestHex(candidate);
      const result = this.state.recordPegInReconciliationFromJoinedCache({
        ergoLockBoxId: candidate.ergoLockBoxId,
        expectedLifecycleDigestHex: lifecycleDigestHex,
        expectedJoinedReconstructionDigestHex: recovery.reconstructionDigestHex,
      });
      if (
        result.lifecycleRowsCreatedOrChanged !== 0
        || result.settlementAuthorityRowsCreatedOrChanged !== 0
      ) {
        throw new Error('peg-in runtime reconciliation changed settlement authority');
      }
      if (result.appended) appended += 1;
    }

    return frozenReport({
      status: candidates.length === 0 ? 'holds_current' : 'holds_recorded',
      candidatesObserved: candidates.length,
      remainingCandidates: page.remainingCandidates,
      journalEntriesAppended: appended,
      currentHoldsConfirmed: candidates.length,
      joinedReconstructionDigestHex: recovery.reconstructionDigestHex,
    });
  }
}

export function loadPegInRuntimeReconciliationFromEnvironment(input: {
  stateTracker: StateTracker;
  deploymentBinding?: PegInRuntimeDeploymentBinding | null;
  environment?: NodeJS.ProcessEnv;
}): PegInRuntimeReconciliationPass | null {
  const environment = input.environment ?? process.env;
  const enabled = environment.PEG_IN_RUNTIME_RECONCILIATION_ENABLED;
  if (enabled === undefined || enabled === 'false') return null;
  if (enabled !== 'true') {
    throw new Error('PEG_IN_RUNTIME_RECONCILIATION_ENABLED must be exactly true or false');
  }

  const requiredNames = [
    'PEG_IN_RUNTIME_ROUTE_MANIFEST_PATH',
    'PEG_IN_RUNTIME_ROUTE_MANIFEST_SHA256',
    'PEG_IN_RUNTIME_MAIN_CHAIN_LOCK_SOURCE_PATH',
    'PEG_IN_RUNTIME_SETTLEMENT_VAULT_SOURCE_PATH',
    'PEG_IN_RUNTIME_ERGO_PRIMARY_NODE_URL',
    'PEG_IN_RUNTIME_ERGO_WITNESS_NODE_URL',
    'PEG_IN_RUNTIME_FRONTIER_PRIMARY_RPC_URL',
    'PEG_IN_RUNTIME_FRONTIER_WITNESS_RPC_URL',
    'PEG_IN_RUNTIME_SIDECHAIN_ID_HEX',
    'PEG_IN_RUNTIME_EVM_CHAIN_ID',
    'PEG_IN_RUNTIME_BRIDGE_ADDRESS',
    'PEG_IN_RUNTIME_DEPLOYMENT_BLOCK',
    'PEG_IN_RUNTIME_REQUIRED_CONFIRMATIONS',
    'PEG_IN_RUNTIME_MAX_EVENTS',
  ] as const;
  const missing = requiredNames.filter(name => !environment[name]);
  if (missing.length > 0) {
    throw new Error(
      `enabled peg-in runtime reconciliation requires: ${missing.join(', ')}`,
    );
  }
  if (!input.deploymentBinding) {
    throw new Error(
      'enabled peg-in runtime reconciliation requires an active deployment binding',
    );
  }

  const value = (name: typeof requiredNames[number]): string => environment[name]!;
  const primaryErgoOrigin = canonicalNodeOrigin(
    value('PEG_IN_RUNTIME_ERGO_PRIMARY_NODE_URL'),
    'peg-in runtime primary Ergo node URL',
  );
  const witnessErgoOrigin = canonicalNodeOrigin(
    value('PEG_IN_RUNTIME_ERGO_WITNESS_NODE_URL'),
    'peg-in runtime witness Ergo node URL',
  );
  if (primaryErgoOrigin === witnessErgoOrigin) {
    throw new Error('peg-in runtime reconciliation requires distinct Ergo node origins');
  }
  const primaryFrontierOrigin = canonicalNodeOrigin(
    value('PEG_IN_RUNTIME_FRONTIER_PRIMARY_RPC_URL'),
    'peg-in runtime primary Frontier RPC URL',
  );
  const witnessFrontierOrigin = canonicalNodeOrigin(
    value('PEG_IN_RUNTIME_FRONTIER_WITNESS_RPC_URL'),
    'peg-in runtime witness Frontier RPC URL',
  );
  if (primaryFrontierOrigin === witnessFrontierOrigin) {
    throw new Error('peg-in runtime reconciliation requires distinct Frontier origins');
  }
  const operationalFrontierOrigin = canonicalNodeOrigin(
    input.deploymentBinding.frontierPrimaryRpcUrl,
    'operational Frontier RPC URL',
  );
  if (primaryFrontierOrigin !== operationalFrontierOrigin) {
    throw new Error(
      'peg-in runtime primary Frontier origin differs from the operational daemon RPC',
    );
  }

  const expectedManifestSha256Hex = fixedLowerHex(
    value('PEG_IN_RUNTIME_ROUTE_MANIFEST_SHA256'),
    32,
    'peg-in runtime route manifest SHA-256',
  );
  const profile: PegInSidechainProfileV1 = {
    schema: PEG_IN_SIDECHAIN_PROFILE_SCHEMA,
    sidechainIdHex: fixedLowerHex(
      value('PEG_IN_RUNTIME_SIDECHAIN_ID_HEX'),
      32,
      'peg-in runtime sidechain ID',
    ),
    evmChainId: canonicalPositiveDecimal(
      value('PEG_IN_RUNTIME_EVM_CHAIN_ID'),
      'peg-in runtime EVM chain ID',
    ),
    bridgeAddress: canonicalH160(
      value('PEG_IN_RUNTIME_BRIDGE_ADDRESS'),
      'peg-in runtime bridge address',
    ),
    deploymentBlock: nonnegativeSafeInteger(
      value('PEG_IN_RUNTIME_DEPLOYMENT_BLOCK'),
      'peg-in runtime deployment block',
    ),
    requiredConfirmations: positiveSafeInteger(
      value('PEG_IN_RUNTIME_REQUIRED_CONFIRMATIONS'),
      'peg-in runtime required confirmations',
    ),
    maxEvents: positiveSafeInteger(
      value('PEG_IN_RUNTIME_MAX_EVENTS'),
      'peg-in runtime max events',
    ),
  };
  assertPegInRuntimeProfileDeploymentBinding(profile, input.deploymentBinding);
  const maxRows = environment.PEG_IN_RUNTIME_MAX_LIFECYCLE_ROWS === undefined
    ? DEFAULT_PEG_IN_RUNTIME_RECONCILIATION_MAX_ROWS
    : positiveSafeInteger(
      environment.PEG_IN_RUNTIME_MAX_LIFECYCLE_ROWS,
      'peg-in runtime max lifecycle rows',
    );
  assertMaxRows(maxRows);

  const manifest = parsePegInRouteManifestSource(readFileSync(
    value('PEG_IN_RUNTIME_ROUTE_MANIFEST_PATH'),
    'utf8',
  ));
  assertPegInRuntimeManifestDeploymentBinding(manifest, input.deploymentBinding);
  const mainChainLockTemplateSource = readFileSync(
    value('PEG_IN_RUNTIME_MAIN_CHAIN_LOCK_SOURCE_PATH'),
    'utf8',
  );
  const settlementVaultTemplateSource = readFileSync(
    value('PEG_IN_RUNTIME_SETTLEMENT_VAULT_SOURCE_PATH'),
    'utf8',
  );

  const ergoRouteObservation = {
    manifest,
    expectedManifestSha256Hex,
    mainChainLockTemplateSource,
    settlementVaultTemplateSource,
    primarySource: new PegInRouteReadOnlyNodeClient(primaryErgoOrigin),
    witnessSource: new PegInRouteReadOnlyNodeClient(witnessErgoOrigin),
  };
  const primaryFrontierSource = createReadOnlyFrontierPegInSource(primaryFrontierOrigin);
  const witnessFrontierSource = createReadOnlyFrontierPegInSource(witnessFrontierOrigin);

  return new PegInRuntimeReconciliationPass(
    input.stateTracker,
    () => recoverPegInJoinedCache({
      stateTracker: input.stateTracker,
      ergoRouteObservation,
      profile,
      primaryFrontierSource,
      witnessFrontierSource,
      observedAt: new Date().toISOString(),
    }),
    maxRows,
  );
}

function frozenReport(input: Omit<
  PegInRuntimeReconciliationReport,
  | 'schema'
  | 'lifecycleSelectionAuthorized'
  | 'nativeGrandpaFinalityAccepted'
  | 'lifecycleRowsCreatedOrPromoted'
  | 'mintRetryOrHoldReleasePerformed'
>): PegInRuntimeReconciliationReport {
  return Object.freeze({
    schema: PEG_IN_RUNTIME_RECONCILIATION_SCHEMA,
    ...input,
    lifecycleSelectionAuthorized: false,
    nativeGrandpaFinalityAccepted: false,
    lifecycleRowsCreatedOrPromoted: 0,
    mintRetryOrHoldReleasePerformed: false,
  });
}

function assertMaxRows(value: number): void {
  if (
    !Number.isSafeInteger(value)
    || value < 1
    || value > MAX_PEG_IN_RUNTIME_RECONCILIATION_ROWS
  ) {
    throw new Error(
      `peg-in runtime reconciliation max rows must be between 1 and ${MAX_PEG_IN_RUNTIME_RECONCILIATION_ROWS}`,
    );
  }
}

export function assertPegInRuntimeProfileDeploymentBinding(
  profile: PegInSidechainProfileV1,
  binding: PegInRuntimeDeploymentBinding,
): void {
  const mismatches: string[] = [];
  if (
    profile.sidechainIdHex
    !== fixedLowerHex(binding.sidechainIdHex, 32, 'active deployment sidechain ID')
  ) {
    mismatches.push('sidechainIdHex');
  }
  if (
    profile.bridgeAddress
    !== normalizedH160(binding.bridgeAddress, 'active deployment bridge address')
  ) {
    mismatches.push('bridgeAddress');
  }
  if (
    profile.evmChainId
    !== canonicalPositiveDecimal(
      binding.evmChainId,
      'active deployment EVM chain ID',
    )
  ) {
    mismatches.push('evmChainId');
  }
  if (
    profile.deploymentBlock
    !== boundedNonnegativeSafeInteger(
      binding.bridgeDeploymentBlock,
      'active deployment bridge block',
    )
  ) {
    mismatches.push('deploymentBlock');
  }
  if (
    profile.requiredConfirmations
    !== boundedPositiveSafeInteger(
      binding.frontierRequiredConfirmations,
      'active deployment Frontier confirmation policy',
    )
  ) {
    mismatches.push('requiredConfirmations');
  }
  if (mismatches.length > 0) {
    throw new Error(
      `peg-in runtime sidechain profile differs from active deployment: ${mismatches.join(', ')}`,
    );
  }
}

export function assertPegInRuntimeManifestDeploymentBinding(
  manifest: PegInRouteManifestV1,
  binding: PegInRuntimeDeploymentBinding,
): void {
  const mismatches: string[] = [];
  if (manifest.route.mainChainLock.address !== binding.lockAddress) {
    mismatches.push('mainChainLock.address');
  }
  if (
    manifest.route.mainChainLock.ergoTreeHex
    !== normalizedEvenHex(binding.lockErgoTreeHex, 'active deployment MCL ErgoTree')
  ) {
    mismatches.push('mainChainLock.ergoTreeHex');
  }
  if (manifest.route.settlementVault.address !== binding.vaultAddress) {
    mismatches.push('settlementVault.address');
  }
  if (
    manifest.route.settlementVault.ergoTreeHex
    !== normalizedEvenHex(binding.vaultErgoTreeHex, 'active deployment vault ErgoTree')
  ) {
    mismatches.push('settlementVault.ergoTreeHex');
  }
  if (
    manifest.route.commitConfirmations
    !== boundedPositiveSafeInteger(
      binding.ergoCommitConfirmations,
      'active deployment Ergo commit confirmation policy',
    )
  ) {
    mismatches.push('commitConfirmations');
  }
  if (mismatches.length > 0) {
    throw new Error(
      `peg-in runtime route manifest differs from active deployment: ${mismatches.join(', ')}`,
    );
  }
}

function positiveSafeInteger(value: string, label: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be a canonical positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} exceeds the safe integer range`);
  return parsed;
}

function nonnegativeSafeInteger(value: string, label: string): number {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical nonnegative integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} exceeds the safe integer range`);
  return parsed;
}

function boundedPositiveSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function boundedNonnegativeSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return value;
}

function canonicalPositiveDecimal(value: string, label: string): string {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be a canonical positive decimal string`);
  }
  return BigInt(value).toString();
}

function fixedLowerHex(value: string, bytes: number, label: string): string {
  if (!new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`${label} must be exactly ${bytes * 2} lowercase hex characters`);
  }
  return value;
}

function canonicalH160(value: string, label: string): string {
  if (!/^0x[0-9a-f]{40}$/.test(value)) {
    throw new Error(`${label} must be a canonical lowercase 0x-prefixed H160`);
  }
  return value;
}

function normalizedH160(value: string, label: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${label} must be a 0x-prefixed H160`);
  }
  return value.toLowerCase();
}

function normalizedEvenHex(value: string, label: string): string {
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  return normalized.toLowerCase();
}
