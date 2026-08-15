import { createHash } from 'node:crypto';

import {
  assertFrontierMintTransitionDeploymentLineageJoinV2CandidateProvenance,
  type FrontierMintTransitionDeploymentLineageJoinV2Candidate,
} from './frontier-mint-transition-deployment-lineage-join-v2.js';
import {
  derivePegInFrontierContractStateStorageKeysV1,
} from './peg-in-frontier-contract-state-v1.js';
import {
  assertPegInRouteReconstructionProvenance,
  type PegInRouteReconstruction,
} from './peg-in-route-reconstruction.js';
import {
  PEG_IN_RUNTIME_RECORD_KEY_DOMAIN,
  derivePegInRuntimeRecordKeyV1Hex,
  deriveProcessedPegInRuntimeStorageKeyV1Hex,
} from './peg-in-runtime-state.js';
import {
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE,
} from './profiles/substrate-grandpa-v1/asset-profile.js';
import { sha256CanonicalJson } from './strict-json.js';

export const PEG_IN_COMMITTED_VAULT_MINT_ELIGIBILITY_PROFILE_V1_SCHEMA =
  'e2s.peg-in-committed-vault-mint-eligibility-profile.v1' as const;
export const PEG_IN_RUNTIME_RECORD_KEY_IDENTITY_V1_SCHEMA =
  'e2s.peg-in-runtime-record-key-identity.v1' as const;
export const PEG_IN_COMMITTED_VAULT_MINT_ELIGIBILITY_V1_SCHEMA =
  'e2s.peg-in-committed-vault-mint-eligibility-candidate.v1' as const;
export const PEG_IN_COMMITTED_VAULT_MINT_ELIGIBILITY_V1_STATUS =
  'non_authorizing_candidate' as const;
export const PEG_IN_COMMITTED_VAULT_MINT_ELIGIBILITY_V1_DIGEST_DOMAIN =
  'e2s.peg-in-committed-vault-mint-eligibility-candidate.digest.v1' as const;

const ZERO_ASSET_ID_HEX =
  `0x${SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE.assetIdHex}` as const;
const ELIGIBILITY_CANDIDATES = new WeakSet<object>();

export interface PegInCommittedVaultMintEligibilityProfileV1 {
  readonly schema: typeof PEG_IN_COMMITTED_VAULT_MINT_ELIGIBILITY_PROFILE_V1_SCHEMA;
  readonly profileId: string;
  readonly routeManifestSha256Hex: string;
  readonly ergoNetworkId: string;
  readonly routeProfile: 'committed-vault-v3';
  readonly settlementVaultProfileId:
    'main-chain-aggregate-unlock-trustless-v1-compatibility';
  readonly sidechainIdHex: string;
  readonly bridgeAddressHex: string;
  readonly tokenAddressHex: string;
  readonly sourceAsset: 'ERG';
  readonly sourceAssetIdHex: typeof ZERO_ASSET_ID_HEX;
  readonly amountUnit: 'nanoERG';
}

export interface PegInCommittedVaultMintEligibilityV1Candidate {
  readonly schema: typeof PEG_IN_COMMITTED_VAULT_MINT_ELIGIBILITY_V1_SCHEMA;
  readonly status: typeof PEG_IN_COMMITTED_VAULT_MINT_ELIGIBILITY_V1_STATUS;
  readonly profile: PegInCommittedVaultMintEligibilityProfileV1;
  readonly route: Readonly<{
    reconstructionDigestHex: string;
    observationDigestHex: string;
    observedAt: string;
    manifestId: string;
    sourceRevision: string;
    snapshotHeight: number;
    snapshotBlockIdHex: string;
    anchorHeight: number;
    anchorBlockIdHex: string;
    mainChainLockAddress: string;
    mainChainLockErgoTreeHex: string;
    settlementVaultAddress: string;
    settlementVaultErgoTreeHex: string;
    settlementVaultErgoTreeSha256Hex: string;
  }>;
  readonly asset: Readonly<{
    sourceAsset: 'ERG';
    sourceAssetIdHex: typeof ZERO_ASSET_ID_HEX;
    amountUnit: 'nanoERG';
    amountNanoErg: string;
  }>;
  readonly deposit: Readonly<{
    sourceBoxIdHex: string;
    creationTransactionIdHex: string;
    outputIndex: number;
    creationHeight: number;
    amountNanoErg: string;
    recipientAddressHex: string;
    depositorErgoTreeSha256Hex: string;
  }>;
  readonly commitment: Readonly<{
    spendingTransactionIdHex: string;
    inclusionHeight: number;
    inclusionBlockIdHex: string;
    confirmations: number;
    requiredConfirmations: number;
    vaultBoxIdHex: string;
    sourceRefundPathAbsentAtSnapshot: true;
    vaultSuccessorUnspentAtSnapshot: true;
  }>;
  readonly mintIdentity: Readonly<{
    schema: typeof PEG_IN_RUNTIME_RECORD_KEY_IDENTITY_V1_SCHEMA;
    domain: typeof PEG_IN_RUNTIME_RECORD_KEY_DOMAIN;
    identityHex: string;
    evmProcessedPegInKeyHex: string;
    nativeProcessedRecordStorageKeyHex: string;
    evmProcessedPegInStorageKeyHex: string;
  }>;
  readonly observedMint: Readonly<{
    mintTransitionV1LineageDigestHex: string;
    mintTransitionLineageDigestHex: string;
    mintTransitionRequestDigestHex: string;
    transactionHashHex: string;
    transactionIndex: number;
    globalEventIndex: number;
    nativeEventBlockHashHex: string;
    nativeEventHeight: string;
    executionBlockHashHex: string;
    executionHeight: string;
  }>;
  readonly checks: Readonly<{
    sameProcessCandidateProvenanceVerified: true;
    explicitVersionedProfileBound: true;
    exactStableDualSourceErgoViewBound: true;
    exactConfirmedDepositConsumptionObserved: true;
    sourceRefundPathAbsentAtSnapshot: true;
    exactCurrentVaultSuccessorObserved: true;
    exactAssetAmountAndRecipientBound: true;
    exactT20CMintTransitionBound: true;
    stableMintIdentityDerived: true;
    nativeAndEvmReplayStorageKeysBound: true;
  }>;
  readonly authority: Readonly<{
    routeManifestReviewApproved: false;
    ergoConsensusAuthenticated: false;
    ergoTransactionInclusionCryptographicallyProved: false;
    ergoCanonicalFinalityAccepted: false;
    sourceDepositSidechainBindingProved: false;
    crossChainConsumptionBeforeMintProved: false;
    nativeVerifierExecutionAuthenticated: false;
    sidechainFinalityAccepted: false;
    historicalMintAbsenceProved: false;
    committedVaultEligibilityAuthorized: false;
    mintAuthorized: false;
    daemonAdmissionAuthorized: false;
    reconciliationHoldReleaseAuthorized: false;
    signingAuthorized: false;
    submissionAuthorized: false;
    broadcastAuthorized: false;
    gate5Closed: false;
    productionReady: false;
  }>;
  readonly limitations: readonly string[];
  readonly candidateDigestHex: string;
}

/**
 * Join one process-branded Ergo route reconstruction to one process-branded
 * T20C mint transition. The result is deterministic evidence only; it is not a
 * mint-admission capability.
 */
export function buildPegInCommittedVaultMintEligibilityV1Candidate(input: {
  readonly profile: PegInCommittedVaultMintEligibilityProfileV1;
  readonly ergoRoute: PegInRouteReconstruction;
  readonly mintTransition: FrontierMintTransitionDeploymentLineageJoinV2Candidate;
}): PegInCommittedVaultMintEligibilityV1Candidate {
  assertPegInRouteReconstructionProvenance(input?.ergoRoute);
  assertFrontierMintTransitionDeploymentLineageJoinV2CandidateProvenance(
    input?.mintTransition,
  );
  const profile = normalizeProfile(input.profile);
  const route = input.ergoRoute;
  const mint = input.mintTransition;

  if (
    route.manifest.computedSha256Hex !== route.manifest.expectedSha256Hex
    || route.manifest.computedSha256Hex !== profile.routeManifestSha256Hex
    || route.manifest.profile !== profile.routeProfile
    || route.manifest.settlementVaultProfileId !== profile.settlementVaultProfileId
    || route.network.networkId !== profile.ergoNetworkId
  ) {
    throw new Error('peg-in eligibility profile does not match the exact Ergo route');
  }
  if (
    !route.decision.observationConditionMet
    || route.decision.blockers.length !== 0
  ) {
    throw new Error('peg-in eligibility requires an unblocked exact Ergo route observation');
  }
  if (
    mint.pegIn.sidechainIdHex !== profile.sidechainIdHex
    || mint.contracts.bridgeAddressHex !== profile.bridgeAddressHex
    || mint.contracts.tokenAddressHex !== profile.tokenAddressHex
  ) {
    throw new Error('peg-in eligibility profile does not match the exact T20C destination');
  }

  const sourceBoxIdHex = unprefixedFixedHex(
    mint.pegIn.ergoBoxIdHex,
    32,
    'T20C peg-in source box ID',
    true,
  );
  const matchingDeposits = route.activeHistory.filter(
    deposit => deposit.boxIdHex === sourceBoxIdHex,
  );
  if (matchingDeposits.length !== 1) {
    throw new Error('peg-in eligibility requires exactly one observed source deposit');
  }
  const deposit = matchingDeposits[0];
  const transition = deposit.transition;
  if (
    deposit.classification !== 'committed'
    || transition === null
    || transition.vaultBoxIdHex === null
  ) {
    throw new Error('peg-in eligibility source deposit is not one confirmed vault commitment');
  }
  if (
    deposit.spentTransactionIdHex !== transition.spendingTransactionIdHex
    || deposit.transactionIdHex === transition.spendingTransactionIdHex
    || transition.inclusionHeight < deposit.creationHeight
  ) {
    throw new Error('peg-in eligibility commitment transaction identity is inconsistent');
  }
  const expectedConfirmations = route.network.snapshot.fullHeight
    - transition.inclusionHeight
    + 1;
  if (
    transition.confirmations !== expectedConfirmations
    || transition.confirmations < route.routeBindings.commitConfirmations
  ) {
    throw new Error('peg-in eligibility commitment confirmation identity is insufficient');
  }
  if (route.activeCurrentBoxIdsHex.includes(sourceBoxIdHex)) {
    throw new Error('peg-in eligibility source refund path remains live at the observed snapshot');
  }
  if (count(route.vaultHistoryBoxIdsHex, transition.vaultBoxIdHex) !== 1) {
    throw new Error('peg-in eligibility exact vault successor is absent from vault history');
  }
  if (count(route.vaultCurrentBoxIdsHex, transition.vaultBoxIdHex) !== 1) {
    throw new Error('peg-in eligibility exact vault successor is not currently unspent');
  }
  if (
    deposit.valueNanoErg !== deposit.declaredAmountNanoErg
    || deposit.valueNanoErg !== mint.pegIn.amountNanoErg
  ) {
    throw new Error('peg-in eligibility amount differs across deposit, vault, and T20C mint');
  }
  const recipientAddressHex = prefixedFixedHex(
    deposit.targetEvmAddressHex,
    20,
    'Ergo deposit target recipient',
    true,
  );
  if (recipientAddressHex !== mint.pegIn.recipientHex) {
    throw new Error('peg-in eligibility recipient differs between Ergo deposit and T20C mint');
  }
  if (
    mint.pegIn.processedPegIn !== true
    || mint.transition.parentProcessedPegIn !== false
    || mint.transition.postProcessedPegIn !== true
    || mint.transition.tokenTotalSupplyDelta !== deposit.valueNanoErg
    || mint.transition.recipientBalanceDelta !== deposit.valueNanoErg
  ) {
    throw new Error('peg-in eligibility T20C replay or mint transition is inconsistent');
  }

  const depositorErgoTreeSha256Hex = sha256HexBytes(
    deposit.depositorErgoTreeHex,
    'depositor ErgoTree',
  );
  const settlementVaultErgoTreeSha256Hex = sha256HexBytes(
    route.routeBindings.settlementVaultErgoTreeHex,
    'settlement vault ErgoTree',
  );
  const evmProcessedPegInKeyHex = `0x${sourceBoxIdHex}`;
  const nativeRuntimeReplayKeyHex = derivePegInRuntimeRecordKeyV1Hex({
    sidechainIdHex: profile.sidechainIdHex,
    ergoBoxIdHex: evmProcessedPegInKeyHex,
  });
  const nativeProcessedRecordStorageKeyHex =
    deriveProcessedPegInRuntimeStorageKeyV1Hex({
      sidechainIdHex: profile.sidechainIdHex,
      ergoBoxIdHex: evmProcessedPegInKeyHex,
    });
  if (
    mint.transition.nativeProcessedRecordStorageKeyHex
    !== nativeProcessedRecordStorageKeyHex
  ) {
    throw new Error('peg-in eligibility native processed-record storage key drifted');
  }
  const evmProcessedPegInStorageKeyHex =
    derivePegInFrontierContractStateStorageKeysV1({
      bridgeAddressHex: profile.bridgeAddressHex,
      tokenAddressHex: profile.tokenAddressHex,
      ergoBoxIdHex: evmProcessedPegInKeyHex,
    }).processedPegInStorageKeyHex;
  if (
    mint.transition.evmProcessedPegInStorageKeyHex
    !== evmProcessedPegInStorageKeyHex
  ) {
    throw new Error('peg-in eligibility EVM processed-PegIn storage key drifted');
  }
  const mintIdentity = deepFreeze({
    schema: PEG_IN_RUNTIME_RECORD_KEY_IDENTITY_V1_SCHEMA,
    domain: PEG_IN_RUNTIME_RECORD_KEY_DOMAIN as typeof PEG_IN_RUNTIME_RECORD_KEY_DOMAIN,
    identityHex: nativeRuntimeReplayKeyHex,
    evmProcessedPegInKeyHex,
    nativeProcessedRecordStorageKeyHex,
    evmProcessedPegInStorageKeyHex,
  });
  const routeBinding = deepFreeze({
    reconstructionDigestHex: route.reconstructionDigestHex,
    observationDigestHex: route.observationDigestHex,
    observedAt: route.observedAt,
    manifestId: route.manifest.manifestId,
    sourceRevision: route.manifest.sourceRevision,
    snapshotHeight: route.network.snapshot.fullHeight,
    snapshotBlockIdHex: route.network.snapshot.tip.idHex,
    anchorHeight: route.network.anchorHeader.height,
    anchorBlockIdHex: route.network.anchorHeader.expectedIdHex,
    mainChainLockAddress: route.routeBindings.mainChainLockAddress,
    mainChainLockErgoTreeHex: route.routeBindings.mainChainLockErgoTreeHex,
    settlementVaultAddress: route.routeBindings.settlementVaultAddress,
    settlementVaultErgoTreeHex: route.routeBindings.settlementVaultErgoTreeHex,
    settlementVaultErgoTreeSha256Hex,
  });
  const depositBinding = deepFreeze({
    sourceBoxIdHex,
    creationTransactionIdHex: deposit.transactionIdHex,
    outputIndex: deposit.outputIndex,
    creationHeight: deposit.creationHeight,
    amountNanoErg: deposit.valueNanoErg,
    recipientAddressHex,
    depositorErgoTreeSha256Hex,
  });
  const asset = deepFreeze({
    sourceAsset: 'ERG' as const,
    sourceAssetIdHex: ZERO_ASSET_ID_HEX,
    amountUnit: 'nanoERG' as const,
    amountNanoErg: deposit.valueNanoErg,
  });
  const commitment = deepFreeze({
    spendingTransactionIdHex: transition.spendingTransactionIdHex,
    inclusionHeight: transition.inclusionHeight,
    inclusionBlockIdHex: transition.inclusionBlockIdHex,
    confirmations: transition.confirmations,
    requiredConfirmations: route.routeBindings.commitConfirmations,
    vaultBoxIdHex: transition.vaultBoxIdHex,
    sourceRefundPathAbsentAtSnapshot: true as const,
    vaultSuccessorUnspentAtSnapshot: true as const,
  });
  const observedMint = deepFreeze({
    mintTransitionV1LineageDigestHex: mint.v1CandidateDigestHex,
    mintTransitionLineageDigestHex: mint.candidateDigestHex,
    mintTransitionRequestDigestHex: mint.mintTransitionRequestDigestHex,
    transactionHashHex: mint.pegIn.transactionHashHex,
    transactionIndex: mint.pegIn.transactionIndex,
    globalEventIndex: mint.pegIn.globalEventIndex,
    nativeEventBlockHashHex: mint.target.eventNativeBlockHashHex,
    nativeEventHeight: mint.target.eventNativeHeight,
    executionBlockHashHex: mint.target.executionBlockHashHex,
    executionHeight: mint.target.executionHeight,
  });
  const checks = deepFreeze({
    sameProcessCandidateProvenanceVerified: true as const,
    explicitVersionedProfileBound: true as const,
    exactStableDualSourceErgoViewBound: true as const,
    exactConfirmedDepositConsumptionObserved: true as const,
    sourceRefundPathAbsentAtSnapshot: true as const,
    exactCurrentVaultSuccessorObserved: true as const,
    exactAssetAmountAndRecipientBound: true as const,
    exactT20CMintTransitionBound: true as const,
    stableMintIdentityDerived: true as const,
    nativeAndEvmReplayStorageKeysBound: true as const,
  });
  const authority = deepFreeze({
    routeManifestReviewApproved: false as const,
    ergoConsensusAuthenticated: false as const,
    ergoTransactionInclusionCryptographicallyProved: false as const,
    ergoCanonicalFinalityAccepted: false as const,
    sourceDepositSidechainBindingProved: false as const,
    crossChainConsumptionBeforeMintProved: false as const,
    nativeVerifierExecutionAuthenticated: false as const,
    sidechainFinalityAccepted: false as const,
    historicalMintAbsenceProved: false as const,
    committedVaultEligibilityAuthorized: false as const,
    mintAuthorized: false as const,
    daemonAdmissionAuthorized: false as const,
    reconciliationHoldReleaseAuthorized: false as const,
    signingAuthorized: false as const,
    submissionAuthorized: false as const,
    broadcastAuthorized: false as const,
    gate5Closed: false as const,
    productionReady: false as const,
  });
  const limitations = Object.freeze([
    'the exact two-origin Ergo view detects disagreement but is not a cryptographic consensus or transaction-inclusion proof',
    'the observed snapshot proves the refund path absent and vault successor current only at that snapshot, not historical ordering before the sidechain mint',
    'the V1 Ergo deposit does not encode the sidechain ID, so the explicit profile cannot prove source-chain intent',
    'the explicit profile is binding input but is not itself a reviewed or activated settlement authorization',
    'the T20C verifier report remains execution-unauthenticated and no daemon or funds path consumes this candidate',
  ]);
  const binding = {
    schema: PEG_IN_COMMITTED_VAULT_MINT_ELIGIBILITY_V1_SCHEMA,
    status: PEG_IN_COMMITTED_VAULT_MINT_ELIGIBILITY_V1_STATUS,
    profile,
    route: routeBinding,
    deposit: depositBinding,
    asset,
    commitment,
    mintIdentity,
    observedMint,
    checks,
    authority,
    limitations,
  } as const;
  const candidate = deepFreeze({
    ...binding,
    candidateDigestHex: `0x${sha256CanonicalJson(
      binding,
      PEG_IN_COMMITTED_VAULT_MINT_ELIGIBILITY_V1_DIGEST_DOMAIN,
    )}`,
  });
  ELIGIBILITY_CANDIDATES.add(candidate);
  return candidate;
}

export function assertPegInCommittedVaultMintEligibilityV1CandidateProvenance(
  value: unknown,
): asserts value is PegInCommittedVaultMintEligibilityV1Candidate {
  if (!value || typeof value !== 'object' || !ELIGIBILITY_CANDIDATES.has(value)) {
    throw new Error('peg-in committed-vault mint-eligibility candidate provenance is missing');
  }
}

function normalizeProfile(
  value: unknown,
): PegInCommittedVaultMintEligibilityProfileV1 {
  const raw = exactRecord(value, [
    'amountUnit',
    'bridgeAddressHex',
    'ergoNetworkId',
    'profileId',
    'routeManifestSha256Hex',
    'routeProfile',
    'schema',
    'settlementVaultProfileId',
    'sidechainIdHex',
    'sourceAsset',
    'sourceAssetIdHex',
    'tokenAddressHex',
  ], 'peg-in committed-vault mint-eligibility profile');
  if (raw.schema !== PEG_IN_COMMITTED_VAULT_MINT_ELIGIBILITY_PROFILE_V1_SCHEMA) {
    throw new Error('peg-in committed-vault mint-eligibility profile schema is unsupported');
  }
  if (raw.routeProfile !== 'committed-vault-v3') {
    throw new Error('peg-in committed-vault mint-eligibility route profile is unsupported');
  }
  if (
    raw.settlementVaultProfileId
    !== 'main-chain-aggregate-unlock-trustless-v1-compatibility'
  ) {
    throw new Error('peg-in committed-vault settlement-vault profile is unsupported');
  }
  if (raw.sourceAsset !== 'ERG' || raw.sourceAssetIdHex !== ZERO_ASSET_ID_HEX) {
    throw new Error('peg-in committed-vault mint-eligibility supports only native ERG V1');
  }
  if (raw.amountUnit !== 'nanoERG') {
    throw new Error('peg-in committed-vault mint-eligibility amount unit must be nanoERG');
  }
  return deepFreeze({
    schema: PEG_IN_COMMITTED_VAULT_MINT_ELIGIBILITY_PROFILE_V1_SCHEMA,
    profileId: slug(raw.profileId, 'peg-in mint-eligibility profile ID'),
    routeManifestSha256Hex: unprefixedFixedHex(
      raw.routeManifestSha256Hex,
      32,
      'peg-in route manifest SHA-256',
    ),
    ergoNetworkId: slug(raw.ergoNetworkId, 'peg-in Ergo network ID'),
    routeProfile: 'committed-vault-v3',
    settlementVaultProfileId:
      'main-chain-aggregate-unlock-trustless-v1-compatibility',
    sidechainIdHex: prefixedFixedHex(
      raw.sidechainIdHex,
      32,
      'peg-in sidechain ID',
      true,
    ),
    bridgeAddressHex: prefixedFixedHex(
      raw.bridgeAddressHex,
      20,
      'peg-in bridge address',
      true,
    ),
    tokenAddressHex: prefixedFixedHex(
      raw.tokenAddressHex,
      20,
      'peg-in token address',
      true,
    ),
    sourceAsset: 'ERG',
    sourceAssetIdHex: ZERO_ASSET_ID_HEX,
    amountUnit: 'nanoERG',
  });
}

function count(values: readonly string[], expected: string): number {
  return values.filter(value => value === expected).length;
}

function sha256HexBytes(value: unknown, label: string): string {
  const hex = unprefixedVariableHex(value, label);
  return createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex');
}

function unprefixedFixedHex(
  value: unknown,
  bytes: number,
  label: string,
  nonzero = false,
): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a hex string`);
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  if (normalized.length !== bytes * 2 || !/^[0-9a-f]+$/.test(normalized)) {
    throw new Error(`${label} must be ${bytes}-byte canonical lowercase hex`);
  }
  if (nonzero && /^0+$/.test(normalized)) throw new Error(`${label} must be nonzero`);
  return normalized;
}

function prefixedFixedHex(
  value: unknown,
  bytes: number,
  label: string,
  nonzero = false,
): string {
  return `0x${unprefixedFixedHex(value, bytes, label, nonzero)}`;
}

function unprefixedVariableHex(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a hex string`);
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  if (
    normalized.length === 0
    || normalized.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new Error(`${label} must be non-empty canonical lowercase even-length hex`);
  }
  return normalized;
}

function slug(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length < 3
    || value.length > 80
    || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(value)
  ) {
    throw new Error(`${label} must be a 3-80 character lowercase slug`);
  }
  return value;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const raw = value as Record<string, unknown>;
  const actual = Object.keys(raw).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} has unexpected fields`);
  }
  return raw;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
