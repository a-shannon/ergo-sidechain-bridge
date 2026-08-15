import { createHash } from 'crypto';

import blakejs from 'blakejs';

import { getDupTreeDigest } from './avl-bridge.js';
import {
  prepareAuthenticatedSettlementUnsignedTxPure,
  type AuthenticatedSettlementContractIdentities,
  type PreparedAuthenticatedSettlementUnsignedTxPayload,
} from './aggregate-settlement-service.js';
import type { BoxLike } from './aggregate-settlement-tx.js';
import {
  AUTHENTICATED_V2_STATEFUL_CHECK_READINESS_SCHEMA,
  validateAuthenticatedV2StatefulCheckReadinessReport,
  type AuthenticatedV2CanonicalBox,
  type AuthenticatedV2CanonicalBoxObservation,
  type AuthenticatedV2StatefulCheckReadinessReport,
} from './authenticated-v2-stateful-check-readiness.js';
import { AUTHENTICATED_SPV_TRACKER_MAX_LINEAGE_BOXES } from './authenticated-spv-tracker-reconstruction.js';
import { decodeAvlTreeRegisterDigest } from './ergo-encoding.js';
import {
  decodeAuthenticatedSpvTrackerValue,
  deriveAuthenticatedSpvTrackerKey,
  encodeAuthenticatedSpvTrackerAvlRegister,
  getAuthenticatedSpvTrackerDigest,
  type AuthenticatedSpvTrackerHistoryEntry,
} from './spv-tracker-authenticated.js';
import {
  deriveTrustlessBurnIdHex,
  encodeTrustlessBurnLeaf,
  validateTrustlessBurnInclusionProofEnvelope,
  type TrustlessBurnMerkleProofStep,
} from './trustless-burn-proof.js';
import {
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE,
} from './profiles/substrate-grandpa-v1/asset-profile.js';

export const AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_COMPANION_SCHEMA =
  'e2s.authenticated-v2-unsigned-settlement-companion.v1';
export const AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_PACKAGE_SCHEMA =
  'e2s.authenticated-v2-unsigned-settlement-package.v1';
export const AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_MAX_DUP_HISTORY_KEYS = 50_000;

const MAX_ERGO_TREE_BYTES = 32 * 1024;
const MAX_SERIALIZED_BOX_BYTES = 1024 * 1024;
const NON_MAINNET_ENVIRONMENTS = new Set([
  'local', 'development', 'devnet', 'patched-devnet', 'testnet',
]);

export interface AuthenticatedV2UnsignedSettlementCompanion {
  schema: typeof AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_COMPANION_SCHEMA;
  companionDigestHex: string;
  creationHeight: number;
  targetBurn: {
    sidechainTxHashHex: string;
    sidechainHeight: string;
    executionBlockHashHex: string;
    eventIndex: number;
    recipientErgoTreeHex: string;
    inclusion: {
      leafIndex: number;
      leafCount: number;
      proof: TrustlessBurnMerkleProofStep[];
    };
  };
  dupHistoryKeys: string[];
}

export interface AuthenticatedV2UnsignedSettlementPackage {
  schema: typeof AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_PACKAGE_SCHEMA;
  packageDigestHex: string;
  source: {
    readinessSchema: typeof AUTHENTICATED_V2_STATEFUL_CHECK_READINESS_SCHEMA;
    readinessReportDigestHex: string;
    companionSchema: typeof AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_COMPANION_SCHEMA;
    companionDigestHex: string;
    environment: string;
    observedAt: string;
  };
  creationHeight: number;
  targetBurn: {
    trackerEntryIndex: number;
    sidechainIdHex: string;
    sidechainTxHashHex: string;
    sidechainHeight: string;
    executionBlockHashHex: string;
    eventIndex: number;
    burnIdHex: string;
    amountNanoErg: string;
    recipientErgoTreeHex: string;
    recipientErgoTreeHashHex: string;
    assetIdHex: string;
    bridgeEventRootHex: string;
    inclusion: {
      leafIndex: number;
      leafCount: number;
      proof: TrustlessBurnMerkleProofStep[];
    };
  };
  contracts: AuthenticatedSettlementContractIdentities;
  trackerHistory: AuthenticatedSpvTrackerHistoryEntry[];
  duplicatePrevention: {
    historyKeys: string[];
    currentDigestHex: string;
  };
  canonicalInputBytes: {
    trackerDataInput: CanonicalInputBytes;
    duplicatePreventionInput: CanonicalInputBytes;
    vaultInput: CanonicalInputBytes;
  };
  transaction: {
    eip12: PreparedAuthenticatedSettlementUnsignedTxPayload['eip12Tx'];
    eip12Sha256Hex: string;
    unsignedTransactionIdHex: string;
    contextExtensionGuard: {
      status: 'pass' | 'blocked';
      reason: 'unsigned-source-boundary-only' | 'context-extension-serialization-conformance';
      effectiveThreshold: number;
      offenderCount: number;
      signingPermitted: false;
      broadcastPermitted: false;
    };
  };
  boundary: {
    transactionConstructed: true;
    transactionCheckPerformed: false;
    transactionSigned: false;
    transactionSubmitted: false;
    transactionBroadcast: false;
    deploymentPerformed: false;
    packageDigestAuthenticatesSources: false;
    gate5Closed: false;
    trustlessSettlementClaim: false;
    productionReady: false;
    r9RemainsFinalityAuthority: true;
  };
}

interface CanonicalInputBytes {
  boxIdHex: string;
  sigmaSerializedHex: string;
  sigmaSerializedSha256Hex: string;
}

type CompanionWithoutDigest = Omit<AuthenticatedV2UnsignedSettlementCompanion, 'companionDigestHex'>;

export function createAuthenticatedV2UnsignedSettlementCompanion(
  input: Omit<CompanionWithoutDigest, 'schema'>,
): AuthenticatedV2UnsignedSettlementCompanion {
  const withoutDigest: CompanionWithoutDigest = {
    schema: AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_COMPANION_SCHEMA,
    ...structuredClone(input),
  };
  return validateAuthenticatedV2UnsignedSettlementCompanion({
    ...withoutDigest,
    companionDigestHex: sha256Canonical(withoutDigest),
  });
}

export function validateAuthenticatedV2UnsignedSettlementCompanion(
  value: unknown,
): AuthenticatedV2UnsignedSettlementCompanion {
  const companion = record(value, 'authenticated V2 unsigned settlement companion');
  exactKeys(companion, [
    'schema', 'companionDigestHex', 'creationHeight', 'targetBurn', 'dupHistoryKeys',
  ], 'authenticated V2 unsigned settlement companion');
  if (companion.schema !== AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_COMPANION_SCHEMA) {
    throw new Error(
      `unsigned settlement companion schema must be ${AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_COMPANION_SCHEMA}`,
    );
  }
  const companionDigestHex = fixedHex(companion.companionDigestHex, 32, 'companion digest');
  const creationHeight = nonnegativeSafeInteger(companion.creationHeight, 'companion creation height');
  const target = record(companion.targetBurn, 'companion target burn');
  exactKeys(target, [
    'sidechainTxHashHex',
    'sidechainHeight',
    'executionBlockHashHex',
    'eventIndex',
    'recipientErgoTreeHex',
    'inclusion',
  ], 'companion target burn');
  const inclusion = validateInclusion(target.inclusion, 'companion target burn inclusion');
  if (!Array.isArray(companion.dupHistoryKeys)) {
    throw new Error('companion DUP history keys must be an array');
  }
  if (
    companion.dupHistoryKeys.length
    > AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_MAX_DUP_HISTORY_KEYS
  ) {
    throw new Error(
      `companion DUP history keys must not exceed ${AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_MAX_DUP_HISTORY_KEYS}`,
    );
  }
  const dupHistoryKeys = companion.dupHistoryKeys.map((key: unknown, index: number) =>
    fixedHex(key, 32, `companion DUP history key ${index}`));
  if (new Set(dupHistoryKeys).size !== dupHistoryKeys.length) {
    throw new Error('companion DUP history keys must not contain duplicates');
  }
  const normalized: AuthenticatedV2UnsignedSettlementCompanion = {
    schema: AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_COMPANION_SCHEMA,
    companionDigestHex,
    creationHeight,
    targetBurn: {
      sidechainTxHashHex: fixedHex(target.sidechainTxHashHex, 32, 'target sidechain transaction hash'),
      sidechainHeight: canonicalUint64String(target.sidechainHeight, 'target sidechain height'),
      executionBlockHashHex: fixedHex(target.executionBlockHashHex, 32, 'target execution block hash'),
      eventIndex: uint32(target.eventIndex, 'target event index'),
      recipientErgoTreeHex: fixedHex(target.recipientErgoTreeHex, 36, 'target recipient ErgoTree'),
      inclusion,
    },
    dupHistoryKeys,
  };
  const { companionDigestHex: _discarded, ...withoutDigest } = normalized;
  if (sha256Canonical(withoutDigest) !== companionDigestHex) {
    throw new Error('unsigned settlement companion content does not match its digest');
  }
  return deepFreeze(normalized);
}

export async function buildAuthenticatedV2UnsignedSettlementPackage(input: {
  readinessReport: unknown;
  companion: unknown;
}): Promise<AuthenticatedV2UnsignedSettlementPackage> {
  const report = await validateAuthenticatedV2StatefulCheckReadinessReport(input.readinessReport);
  const companion = validateAuthenticatedV2UnsignedSettlementCompanion(input.companion);
  if (companion.creationHeight !== report.stableSnapshot.fullHeight) {
    throw new Error('settlement creation height must equal the T9 stable full/header height');
  }

  const target = deriveTargetBinding(report, companion);
  const trackerHistory = report.trackerObservation.entries.map(entry => ({
    key: entry.keyHex,
    value: entry.valueHex,
  }));
  const dupCurrentDigestHex = getDupTreeDigest(companion.dupHistoryKeys);
  if (dupCurrentDigestHex !== report.duplicatePrevention.avl.digestHex) {
    throw new Error('complete DUP history keys do not reproduce the observed current DUP R5 digest');
  }

  const contracts: AuthenticatedSettlementContractIdentities = {
    tracker: {
      nftId: report.request.trackerNftIdHex,
      ergoTreeHex: report.request.trackerErgoTreeHex,
    },
    duplicatePrevention: {
      nftId: report.request.duplicatePreventionNftIdHex,
      ergoTreeHex: report.request.duplicatePreventionErgoTreeHex,
    },
    vault: { ergoTreeHex: report.request.vaultErgoTreeHex },
  };
  const trackerBox = canonicalBoxToBoxLike(report.trackerInput.box);
  const authenticatedDupBox = canonicalBoxToBoxLike(report.duplicatePrevention.box);
  const unlockBox = canonicalBoxToBoxLike(report.vault.box);
  const prepared = prepareAuthenticatedSettlementUnsignedTxPure({
    contractIdentities: contracts,
    trackerBox,
    authenticatedDupBox,
    unlockBox,
    trackerHistory,
    dupHistoryKeys: companion.dupHistoryKeys,
    pegOut: target.pegOut,
    trackerIdentity: target.trackerIdentity,
    settlementIdentity: target.settlementIdentity,
    recipientErgoTreeHex: target.packageTarget.recipientErgoTreeHex,
    creationHeight: companion.creationHeight,
  });
  assertPreparedBoxesRetainT9Identity(prepared, report);

  const eip12 = toJsonSafe(
    prepared.eip12Tx,
  ) as PreparedAuthenticatedSettlementUnsignedTxPayload['eip12Tx'];
  const eip12Sha256Hex = sha256Canonical(eip12);
  const unsignedTransactionIdHex = await deriveUnsignedTransactionId(eip12);
  const withoutDigest: Omit<AuthenticatedV2UnsignedSettlementPackage, 'packageDigestHex'> = {
    schema: AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_PACKAGE_SCHEMA,
    source: {
      readinessSchema: AUTHENTICATED_V2_STATEFUL_CHECK_READINESS_SCHEMA,
      readinessReportDigestHex: report.reportDigestHex,
      companionSchema: AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_COMPANION_SCHEMA,
      companionDigestHex: companion.companionDigestHex,
      environment: report.request.environment,
      observedAt: report.observedAt,
    },
    creationHeight: companion.creationHeight,
    targetBurn: target.packageTarget,
    contracts,
    trackerHistory,
    duplicatePrevention: {
      historyKeys: companion.dupHistoryKeys,
      currentDigestHex: dupCurrentDigestHex,
    },
    canonicalInputBytes: {
      trackerDataInput: canonicalBytes(report.trackerInput),
      duplicatePreventionInput: canonicalBytes(report.duplicatePrevention),
      vaultInput: canonicalBytes(report.vault),
    },
    transaction: {
      eip12,
      eip12Sha256Hex,
      unsignedTransactionIdHex,
      contextExtensionGuard: summarizeContextExtensionGuard(prepared),
    },
    boundary: {
      transactionConstructed: true,
      transactionCheckPerformed: false,
      transactionSigned: false,
      transactionSubmitted: false,
      transactionBroadcast: false,
      deploymentPerformed: false,
      packageDigestAuthenticatesSources: false,
      gate5Closed: false,
      trustlessSettlementClaim: false,
      productionReady: false,
      r9RemainsFinalityAuthority: true,
    },
  };
  return validateAuthenticatedV2UnsignedSettlementPackage({
    ...withoutDigest,
    packageDigestHex: sha256Canonical(withoutDigest),
  });
}

export async function validateAuthenticatedV2UnsignedSettlementPackage(
  value: unknown,
): Promise<AuthenticatedV2UnsignedSettlementPackage> {
  const pkg = record(value, 'authenticated V2 unsigned settlement package');
  exactKeys(pkg, [
    'schema',
    'packageDigestHex',
    'source',
    'creationHeight',
    'targetBurn',
    'contracts',
    'trackerHistory',
    'duplicatePrevention',
    'canonicalInputBytes',
    'transaction',
    'boundary',
  ], 'authenticated V2 unsigned settlement package');
  if (pkg.schema !== AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_PACKAGE_SCHEMA) {
    throw new Error(`unsigned settlement package schema must be ${AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_PACKAGE_SCHEMA}`);
  }
  const packageDigestHex = fixedHex(pkg.packageDigestHex, 32, 'package digest');
  validatePackageSource(pkg.source);
  const creationHeight = nonnegativeSafeInteger(pkg.creationHeight, 'package creation height');
  const target = validatePackageTarget(pkg.targetBurn);
  const targetSidechainBlockNumber = safeSidechainBlockNumber(target.sidechainHeight);
  const contracts = validateContractIdentities(pkg.contracts);
  const trackerHistory = validateTrackerHistory(pkg.trackerHistory);
  const duplicatePrevention = validateDuplicatePrevention(pkg.duplicatePrevention);
  const canonicalInputBytes = validateCanonicalInputBytes(pkg.canonicalInputBytes);
  const transaction = validateTransactionShape(pkg.transaction);
  validateBoundary(pkg.boundary);

  const expectedBurnIdHex = deriveTrustlessBurnIdHex({
    sidechainIdHex: target.sidechainIdHex,
    sidechainTxHashHex: target.sidechainTxHashHex,
    eventIndex: target.eventIndex,
  });
  if (expectedBurnIdHex !== target.burnIdHex) {
    throw new Error('package burn ID does not match the target sidechain event identity');
  }
  const recipientHash = blake2b256Hex(Buffer.from(target.recipientErgoTreeHex, 'hex'));
  if (recipientHash !== target.recipientErgoTreeHashHex) {
    throw new Error('package recipient ErgoTree does not match its proved recipient hash');
  }
  const leaf = encodeTrustlessBurnLeaf({
    sidechainIdHex: target.sidechainIdHex,
    sidechainBlockHashHex: target.executionBlockHashHex,
    burnIdHex: target.burnIdHex,
    sidechainTxHashHex: target.sidechainTxHashHex,
    eventIndex: target.eventIndex,
    recipientErgoTreeHashHex: target.recipientErgoTreeHashHex,
    amountNanoErg: target.amountNanoErg,
    assetIdHex: target.assetIdHex,
  });
  const proofValidation = validateTrustlessBurnInclusionProofEnvelope({
    bridgeEventRootHex: target.bridgeEventRootHex,
    leaf,
    leafIndex: target.inclusion.leafIndex,
    leafCount: target.inclusion.leafCount,
    proof: target.inclusion.proof,
  });
  if (!proofValidation.ok) {
    throw new Error(`package burn proof is not canonical: ${proofValidation.errors.join('; ')}`);
  }
  if (target.trackerEntryIndex >= trackerHistory.length) {
    throw new Error('package target tracker entry index is outside tracker history');
  }
  const expectedTrackerKey = deriveAuthenticatedSpvTrackerKey({
    sidechainIdHex: target.sidechainIdHex,
    sidechainHeight: target.sidechainHeight,
    executionBlockHashHex: target.executionBlockHashHex,
  });
  const matchingTrackerIndexes = trackerHistory.flatMap((entry, index) =>
    entry.key === expectedTrackerKey ? [index] : []);
  if (
    matchingTrackerIndexes.length !== 1
    || matchingTrackerIndexes[0] !== target.trackerEntryIndex
  ) {
    throw new Error('package target must bind exactly one tracker history entry');
  }
  const trackerValue = decodeAuthenticatedSpvTrackerValue(
    trackerHistory[target.trackerEntryIndex].value,
  );
  if (trackerValue.bridgeEventRootHex !== target.bridgeEventRootHex) {
    throw new Error('package target bridge event root does not match its tracker entry');
  }
  if (getDupTreeDigest(duplicatePrevention.historyKeys) !== duplicatePrevention.currentDigestHex) {
    throw new Error('package DUP history does not reproduce its current digest');
  }

  const eip12 = transaction.eip12;
  const trackerBox = eip12.dataInputs[0] as BoxLike | undefined;
  const authenticatedDupBox = stripExtension(eip12.inputs[0]);
  const unlockBox = stripExtension(eip12.inputs[1]);
  if (!trackerBox || !authenticatedDupBox || !unlockBox) {
    throw new Error('package transaction must contain exact DUP/vault inputs and one tracker data input');
  }
  assertCanonicalBytesBindBox(canonicalInputBytes.trackerDataInput, trackerBox, 'tracker data input');
  assertCanonicalBytesBindBox(
    canonicalInputBytes.duplicatePreventionInput,
    authenticatedDupBox,
    'DUP input',
  );
  assertCanonicalBytesBindBox(canonicalInputBytes.vaultInput, unlockBox, 'vault input');
  if (
    decodeAvlTreeRegisterDigest(
      authenticatedDupBox.additionalRegisters?.R5 ?? '',
      'package DUP input R5',
    ) !== duplicatePrevention.currentDigestHex
  ) {
    throw new Error('package DUP input R5 does not match the complete history digest');
  }
  const trackerDigestHex = getAuthenticatedSpvTrackerDigest(trackerHistory);
  if (
    trackerBox.additionalRegisters?.R5
    !== encodeAuthenticatedSpvTrackerAvlRegister(trackerDigestHex)
  ) {
    throw new Error('package tracker data input R5 does not match tracker history');
  }

  const prepared = prepareAuthenticatedSettlementUnsignedTxPure({
    contractIdentities: contracts,
    trackerBox,
    authenticatedDupBox,
    unlockBox,
    trackerHistory,
    dupHistoryKeys: duplicatePrevention.historyKeys,
    pegOut: {
      user: '0x0000000000000000000000000000000000000000',
      amount: BigInt(target.amountNanoErg),
      ergoRecipientAddress: target.recipientErgoTreeHex,
      sidechainTxHash: target.sidechainTxHashHex,
      sidechainBlockNumber: targetSidechainBlockNumber,
      sidechainBlockHash: target.executionBlockHashHex,
      sidechainLogIndex: target.eventIndex,
    },
    trackerIdentity: {
      sidechainIdHex: target.sidechainIdHex,
      sidechainHeight: target.sidechainHeight,
      executionBlockHashHex: target.executionBlockHashHex,
    },
    settlementIdentity: {
      source: 'trustless-burn-leaf',
      duplicatePreventionKeyHex: target.burnIdHex,
      bridgeEventRootHex: target.bridgeEventRootHex,
      recipientErgoTreeHashHex: target.recipientErgoTreeHashHex,
      amountNanoErg: target.amountNanoErg,
      assetIdHex: target.assetIdHex,
      trustlessBurnProof: target.inclusion.proof,
    },
    recipientErgoTreeHex: target.recipientErgoTreeHex,
    creationHeight,
  });
  if (canonicalJson(toJsonSafe(prepared.eip12Tx)) !== canonicalJson(eip12)) {
    throw new Error('package EIP-12 transaction does not match deterministic authenticated V2 preparation');
  }
  if (
    canonicalJson(summarizeContextExtensionGuard(prepared))
    !== canonicalJson(transaction.contextExtensionGuard)
  ) {
    throw new Error('package context-extension guard does not match deterministic preparation');
  }
  if (sha256Canonical(eip12) !== transaction.eip12Sha256Hex) {
    throw new Error('package EIP-12 transaction content does not match its SHA-256 digest');
  }
  if (await deriveUnsignedTransactionId(eip12) !== transaction.unsignedTransactionIdHex) {
    throw new Error('package unsigned transaction ID does not match its EIP-12 transaction');
  }
  await assertSigmaBytes(canonicalInputBytes.trackerDataInput, trackerBox, 'tracker data input');
  await assertSigmaBytes(
    canonicalInputBytes.duplicatePreventionInput,
    authenticatedDupBox,
    'DUP input',
  );
  await assertSigmaBytes(canonicalInputBytes.vaultInput, unlockBox, 'vault input');

  const { packageDigestHex: _discarded, ...withoutDigest } = pkg;
  if (sha256Canonical(withoutDigest) !== packageDigestHex) {
    throw new Error('unsigned settlement package content does not match its package digest');
  }
  return deepFreeze(pkg as unknown as AuthenticatedV2UnsignedSettlementPackage);
}

function deriveTargetBinding(
  report: AuthenticatedV2StatefulCheckReadinessReport,
  companion: AuthenticatedV2UnsignedSettlementCompanion,
) {
  const burnIdHex = deriveTrustlessBurnIdHex({
    sidechainIdHex: report.request.sidechainIdHex,
    sidechainTxHashHex: companion.targetBurn.sidechainTxHashHex,
    eventIndex: companion.targetBurn.eventIndex,
  });
  if (burnIdHex !== report.request.burnIdHex) {
    throw new Error('target sidechain transaction hash/event index derives the wrong T9 burn ID');
  }
  const recipientErgoTreeHashHex = blake2b256Hex(
    Buffer.from(companion.targetBurn.recipientErgoTreeHex, 'hex'),
  );
  const amountNanoErg = String(report.request.payoutAmountNanoErg);
  const leaf = encodeTrustlessBurnLeaf({
    sidechainIdHex: report.request.sidechainIdHex,
    sidechainBlockHashHex: companion.targetBurn.executionBlockHashHex,
    burnIdHex,
    sidechainTxHashHex: companion.targetBurn.sidechainTxHashHex,
    eventIndex: companion.targetBurn.eventIndex,
    recipientErgoTreeHashHex,
    amountNanoErg,
    assetIdHex: SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE.assetIdHex,
  });
  const identityMatches = report.trackerObservation.entries.flatMap((entry, index) => (
    entry.sidechainHeight === companion.targetBurn.sidechainHeight
    && entry.executionBlockHashHex === companion.targetBurn.executionBlockHashHex
      ? [{ entry, index }]
      : []
  ));
  if (identityMatches.length !== 1) {
    throw new Error('target burn coordinates must identify exactly one reconstructed tracker entry');
  }
  const { entry, index: trackerEntryIndex } = identityMatches[0];
  const proofValidation = validateTrustlessBurnInclusionProofEnvelope({
    bridgeEventRootHex: entry.bridgeEventRootHex,
    leaf,
    leafIndex: companion.targetBurn.inclusion.leafIndex,
    leafCount: companion.targetBurn.inclusion.leafCount,
    proof: companion.targetBurn.inclusion.proof,
  });
  if (!proofValidation.ok) {
    throw new Error(`target burn proof is not canonical for the tracker root: ${proofValidation.errors.join('; ')}`);
  }
  const pegOut = {
    user: '0x0000000000000000000000000000000000000000',
    amount: BigInt(amountNanoErg),
    ergoRecipientAddress: companion.targetBurn.recipientErgoTreeHex,
    sidechainTxHash: companion.targetBurn.sidechainTxHashHex,
    sidechainBlockNumber: safeSidechainBlockNumber(companion.targetBurn.sidechainHeight),
    sidechainBlockHash: companion.targetBurn.executionBlockHashHex,
    sidechainLogIndex: companion.targetBurn.eventIndex,
  };
  const inclusion = structuredClone(companion.targetBurn.inclusion);
  const packageTarget: AuthenticatedV2UnsignedSettlementPackage['targetBurn'] = {
    trackerEntryIndex,
    sidechainIdHex: report.request.sidechainIdHex,
    sidechainTxHashHex: companion.targetBurn.sidechainTxHashHex,
    sidechainHeight: companion.targetBurn.sidechainHeight,
    executionBlockHashHex: companion.targetBurn.executionBlockHashHex,
    eventIndex: companion.targetBurn.eventIndex,
    burnIdHex,
    amountNanoErg,
    recipientErgoTreeHex: companion.targetBurn.recipientErgoTreeHex,
    recipientErgoTreeHashHex,
    assetIdHex: SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE.assetIdHex,
    bridgeEventRootHex: entry.bridgeEventRootHex,
    inclusion,
  };
  return {
    pegOut,
    trackerIdentity: {
      sidechainIdHex: report.request.sidechainIdHex,
      sidechainHeight: companion.targetBurn.sidechainHeight,
      executionBlockHashHex: companion.targetBurn.executionBlockHashHex,
    },
    settlementIdentity: {
      source: 'trustless-burn-leaf' as const,
      duplicatePreventionKeyHex: burnIdHex,
      bridgeEventRootHex: entry.bridgeEventRootHex,
      recipientErgoTreeHashHex,
      amountNanoErg,
      assetIdHex: SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE.assetIdHex,
      trustlessBurnProof: inclusion.proof,
    },
    packageTarget,
  };
}

function canonicalBoxToBoxLike(box: AuthenticatedV2CanonicalBox): BoxLike {
  return {
    boxId: box.boxIdHex,
    value: box.valueNanoErg,
    ergoTree: box.ergoTreeHex,
    assets: box.assets.map(asset => ({ tokenId: asset.tokenIdHex, amount: asset.amount })),
    additionalRegisters: { ...box.additionalRegisters },
    creationHeight: box.creationHeight,
    transactionId: box.transactionIdHex,
    index: box.outputIndex,
  };
}

function safeSidechainBlockNumber(sidechainHeight: string): number {
  const value = Number(BigInt(sidechainHeight));
  if (!Number.isSafeInteger(value)) {
    throw new Error('target sidechain height must fit the ParsedPegOut safe-integer boundary');
  }
  return value;
}

function canonicalBytes(observation: AuthenticatedV2CanonicalBoxObservation): CanonicalInputBytes {
  return {
    boxIdHex: observation.box.boxIdHex,
    sigmaSerializedHex: observation.sigmaSerializedHex,
    sigmaSerializedSha256Hex: observation.sigmaSerializedSha256Hex,
  };
}

function assertPreparedBoxesRetainT9Identity(
  prepared: PreparedAuthenticatedSettlementUnsignedTxPayload,
  report: AuthenticatedV2StatefulCheckReadinessReport,
): void {
  const expected = [
    canonicalBoxToEip12(report.duplicatePrevention.box),
    canonicalBoxToEip12(report.vault.box),
    canonicalBoxToEip12(report.trackerInput.box),
  ];
  const actual = [
    stripExtension(prepared.eip12Tx.inputs[0]),
    stripExtension(prepared.eip12Tx.inputs[1]),
    prepared.eip12Tx.dataInputs[0],
  ];
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error('deterministic preparation changed a canonical T9 input/data-input identity');
  }
}

function canonicalBoxToEip12(box: AuthenticatedV2CanonicalBox): Record<string, unknown> {
  return {
    boxId: box.boxIdHex,
    value: box.valueNanoErg,
    ergoTree: box.ergoTreeHex,
    assets: box.assets.map(asset => ({ tokenId: asset.tokenIdHex, amount: asset.amount })),
    additionalRegisters: { ...box.additionalRegisters },
    creationHeight: box.creationHeight,
    transactionId: box.transactionIdHex,
    index: box.outputIndex,
  };
}

function summarizeContextExtensionGuard(prepared: PreparedAuthenticatedSettlementUnsignedTxPayload) {
  return {
    status: prepared.contextExtensionGuard.status,
    reason: prepared.contextExtensionGuard.reason,
    effectiveThreshold: prepared.contextExtensionGuard.effectiveThreshold,
    offenderCount: prepared.contextExtensionGuard.offenders.length,
    signingPermitted: false as const,
    broadcastPermitted: false as const,
  };
}

function validatePackageSource(value: unknown): void {
  const source = record(value, 'package source');
  exactKeys(source, [
    'readinessSchema',
    'readinessReportDigestHex',
    'companionSchema',
    'companionDigestHex',
    'environment',
    'observedAt',
  ], 'package source');
  if (source.readinessSchema !== AUTHENTICATED_V2_STATEFUL_CHECK_READINESS_SCHEMA) {
    throw new Error('package source readiness schema is unsupported');
  }
  if (source.companionSchema !== AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_COMPANION_SCHEMA) {
    throw new Error('package source companion schema is unsupported');
  }
  fixedHex(source.readinessReportDigestHex, 32, 'source readiness report digest');
  fixedHex(source.companionDigestHex, 32, 'source companion digest');
  const environment = stringValue(source.environment, 'source environment');
  if (!NON_MAINNET_ENVIRONMENTS.has(environment)) {
    throw new Error('package source environment must be an explicit canonical non-mainnet environment');
  }
  const observedAt = stringValue(source.observedAt, 'source observedAt');
  if (new Date(observedAt).toISOString() !== observedAt) {
    throw new Error('source observedAt must be canonical ISO-8601');
  }
}

function validatePackageTarget(value: unknown): AuthenticatedV2UnsignedSettlementPackage['targetBurn'] {
  const target = record(value, 'package target burn');
  exactKeys(target, [
    'trackerEntryIndex',
    'sidechainIdHex',
    'sidechainTxHashHex',
    'sidechainHeight',
    'executionBlockHashHex',
    'eventIndex',
    'burnIdHex',
    'amountNanoErg',
    'recipientErgoTreeHex',
    'recipientErgoTreeHashHex',
    'assetIdHex',
    'bridgeEventRootHex',
    'inclusion',
  ], 'package target burn');
  const assetIdHex = fixedHex(target.assetIdHex, 32, 'package target asset ID');
  if (assetIdHex !== SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE.assetIdHex) {
    throw new Error('package target must use the ERG asset lane');
  }
  return {
    trackerEntryIndex: nonnegativeSafeInteger(target.trackerEntryIndex, 'target tracker entry index'),
    sidechainIdHex: fixedHex(target.sidechainIdHex, 32, 'target sidechain ID'),
    sidechainTxHashHex: fixedHex(target.sidechainTxHashHex, 32, 'target sidechain transaction hash'),
    sidechainHeight: canonicalUint64String(target.sidechainHeight, 'target sidechain height'),
    executionBlockHashHex: fixedHex(target.executionBlockHashHex, 32, 'target execution block hash'),
    eventIndex: uint32(target.eventIndex, 'target event index'),
    burnIdHex: fixedHex(target.burnIdHex, 32, 'target burn ID'),
    amountNanoErg: canonicalPositiveLongString(target.amountNanoErg, 'target amount'),
    recipientErgoTreeHex: fixedHex(target.recipientErgoTreeHex, 36, 'target recipient ErgoTree'),
    recipientErgoTreeHashHex: fixedHex(target.recipientErgoTreeHashHex, 32, 'target recipient hash'),
    assetIdHex,
    bridgeEventRootHex: fixedHex(target.bridgeEventRootHex, 32, 'target bridge event root'),
    inclusion: validateInclusion(target.inclusion, 'package target inclusion'),
  };
}

function validateContractIdentities(value: unknown): AuthenticatedSettlementContractIdentities {
  const contracts = record(value, 'package contracts');
  exactKeys(contracts, ['tracker', 'duplicatePrevention', 'vault'], 'package contracts');
  const tracker = record(contracts.tracker, 'tracker contract');
  const dup = record(contracts.duplicatePrevention, 'DUP contract');
  const vault = record(contracts.vault, 'vault contract');
  exactKeys(tracker, ['nftId', 'ergoTreeHex'], 'tracker contract');
  exactKeys(dup, ['nftId', 'ergoTreeHex'], 'DUP contract');
  exactKeys(vault, ['ergoTreeHex'], 'vault contract');
  return {
    tracker: {
      nftId: fixedHex(tracker.nftId, 32, 'tracker contract NFT'),
      ergoTreeHex: variableHex(tracker.ergoTreeHex, MAX_ERGO_TREE_BYTES, 'tracker contract ErgoTree'),
    },
    duplicatePrevention: {
      nftId: fixedHex(dup.nftId, 32, 'DUP contract NFT'),
      ergoTreeHex: variableHex(dup.ergoTreeHex, MAX_ERGO_TREE_BYTES, 'DUP contract ErgoTree'),
    },
    vault: {
      ergoTreeHex: variableHex(vault.ergoTreeHex, MAX_ERGO_TREE_BYTES, 'vault contract ErgoTree'),
    },
  };
}

function validateTrackerHistory(value: unknown): AuthenticatedSpvTrackerHistoryEntry[] {
  if (!Array.isArray(value)) throw new Error('package tracker history must be an array');
  const maxEntries = AUTHENTICATED_SPV_TRACKER_MAX_LINEAGE_BOXES - 1;
  if (value.length > maxEntries) {
    throw new Error(`package tracker history must not exceed ${maxEntries} entries`);
  }
  const history = value.map((raw, index) => {
    const entry = record(raw, `package tracker history entry ${index}`);
    exactKeys(entry, ['key', 'value'], `package tracker history entry ${index}`);
    return {
      key: fixedHex(entry.key, 32, `package tracker history key ${index}`),
      value: fixedHex(entry.value, 264, `package tracker history value ${index}`),
    };
  });
  if (new Set(history.map(entry => entry.key)).size !== history.length) {
    throw new Error('package tracker history keys must be unique');
  }
  return history;
}

function validateDuplicatePrevention(value: unknown) {
  const dup = record(value, 'package duplicate prevention');
  exactKeys(dup, ['historyKeys', 'currentDigestHex'], 'package duplicate prevention');
  if (!Array.isArray(dup.historyKeys)) throw new Error('package DUP history keys must be an array');
  if (
    dup.historyKeys.length
    > AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_MAX_DUP_HISTORY_KEYS
  ) {
    throw new Error(
      `package DUP history keys must not exceed ${AUTHENTICATED_V2_UNSIGNED_SETTLEMENT_MAX_DUP_HISTORY_KEYS}`,
    );
  }
  const historyKeys = dup.historyKeys.map((key: unknown, index: number) =>
    fixedHex(key, 32, `package DUP history key ${index}`));
  if (new Set(historyKeys).size !== historyKeys.length) {
    throw new Error('package DUP history keys must be unique');
  }
  return {
    historyKeys,
    currentDigestHex: fixedHex(dup.currentDigestHex, 33, 'package DUP current digest'),
  };
}

function validateCanonicalInputBytes(value: unknown) {
  const bytes = record(value, 'package canonical input bytes');
  exactKeys(bytes, [
    'trackerDataInput', 'duplicatePreventionInput', 'vaultInput',
  ], 'package canonical input bytes');
  return {
    trackerDataInput: validateOneCanonicalInputBytes(bytes.trackerDataInput, 'tracker data input bytes'),
    duplicatePreventionInput: validateOneCanonicalInputBytes(
      bytes.duplicatePreventionInput,
      'DUP input bytes',
    ),
    vaultInput: validateOneCanonicalInputBytes(bytes.vaultInput, 'vault input bytes'),
  };
}

function validateOneCanonicalInputBytes(value: unknown, label: string): CanonicalInputBytes {
  const bytes = record(value, label);
  exactKeys(bytes, ['boxIdHex', 'sigmaSerializedHex', 'sigmaSerializedSha256Hex'], label);
  const sigmaSerializedHex = variableHex(
    bytes.sigmaSerializedHex,
    MAX_SERIALIZED_BOX_BYTES,
    `${label} Sigma bytes`,
  );
  const sigmaSerializedSha256Hex = fixedHex(
    bytes.sigmaSerializedSha256Hex,
    32,
    `${label} Sigma bytes digest`,
  );
  if (sha256Hex(Buffer.from(sigmaSerializedHex, 'hex')) !== sigmaSerializedSha256Hex) {
    throw new Error(`${label} Sigma bytes do not match their digest`);
  }
  return {
    boxIdHex: fixedHex(bytes.boxIdHex, 32, `${label} box ID`),
    sigmaSerializedHex,
    sigmaSerializedSha256Hex,
  };
}

function validateTransactionShape(value: unknown) {
  const transaction = record(value, 'package transaction');
  exactKeys(transaction, [
    'eip12', 'eip12Sha256Hex', 'unsignedTransactionIdHex', 'contextExtensionGuard',
  ], 'package transaction');
  const eip12 = validateEip12(transaction.eip12);
  const guard = record(transaction.contextExtensionGuard, 'package context-extension guard');
  exactKeys(guard, [
    'status',
    'reason',
    'effectiveThreshold',
    'offenderCount',
    'signingPermitted',
    'broadcastPermitted',
  ], 'package context-extension guard');
  if (guard.status !== 'pass' && guard.status !== 'blocked') {
    throw new Error('package context-extension guard status is invalid');
  }
  if (
    guard.reason !== 'unsigned-source-boundary-only'
    && guard.reason !== 'context-extension-serialization-conformance'
  ) {
    throw new Error('package context-extension guard reason is invalid');
  }
  if (guard.signingPermitted !== false || guard.broadcastPermitted !== false) {
    throw new Error('package context-extension guard cannot authorize signing or broadcast');
  }
  return {
    eip12,
    eip12Sha256Hex: fixedHex(transaction.eip12Sha256Hex, 32, 'package EIP-12 digest'),
    unsignedTransactionIdHex: fixedHex(
      transaction.unsignedTransactionIdHex,
      32,
      'package unsigned transaction ID',
    ),
    contextExtensionGuard: {
      status: guard.status as 'pass' | 'blocked',
      reason: guard.reason as 'unsigned-source-boundary-only' | 'context-extension-serialization-conformance',
      effectiveThreshold: nonnegativeSafeInteger(guard.effectiveThreshold, 'guard threshold'),
      offenderCount: nonnegativeSafeInteger(guard.offenderCount, 'guard offender count'),
      signingPermitted: false as const,
      broadcastPermitted: false as const,
    },
  };
}

function validateEip12(value: unknown): PreparedAuthenticatedSettlementUnsignedTxPayload['eip12Tx'] {
  const tx = record(value, 'package EIP-12 transaction');
  exactKeys(tx, ['inputs', 'dataInputs', 'outputs'], 'package EIP-12 transaction');
  if (!Array.isArray(tx.inputs) || tx.inputs.length !== 2) {
    throw new Error('package EIP-12 transaction must contain exactly two inputs');
  }
  if (!Array.isArray(tx.dataInputs) || tx.dataInputs.length !== 1) {
    throw new Error('package EIP-12 transaction must contain exactly one data input');
  }
  if (!Array.isArray(tx.outputs) || tx.outputs.length < 3 || tx.outputs.length > 4) {
    throw new Error('package EIP-12 transaction must contain three or four outputs');
  }
  tx.inputs.forEach((box: unknown, index: number) => validateEip12Box(box, true, `input ${index}`));
  tx.dataInputs.forEach((box: unknown, index: number) => validateEip12Box(box, false, `data input ${index}`));
  tx.outputs.forEach((output: unknown, index: number) => validateOutput(output, index));
  return tx as PreparedAuthenticatedSettlementUnsignedTxPayload['eip12Tx'];
}

function validateEip12Box(value: unknown, withExtension: boolean, label: string): void {
  const box = record(value, `package ${label}`);
  const keys = [
    'boxId', 'value', 'ergoTree', 'assets', 'additionalRegisters',
    'creationHeight', 'transactionId', 'index',
  ];
  if (withExtension) keys.push('extension');
  exactKeys(box, keys, `package ${label}`);
  fixedHex(box.boxId, 32, `${label} box ID`);
  canonicalPositiveLongString(box.value, `${label} value`);
  variableHex(box.ergoTree, MAX_ERGO_TREE_BYTES, `${label} ErgoTree`);
  validateAssets(box.assets, `${label} assets`);
  validateHexRecord(box.additionalRegisters, `${label} registers`);
  nonnegativeSafeInteger(box.creationHeight, `${label} creation height`);
  fixedHex(box.transactionId, 32, `${label} transaction ID`);
  nonnegativeSafeInteger(box.index, `${label} output index`);
  if (withExtension) validateHexRecord(box.extension, `${label} extension`);
}

function validateOutput(value: unknown, index: number): void {
  const output = record(value, `package output ${index}`);
  exactKeys(output, [
    'value', 'ergoTree', 'assets', 'additionalRegisters', 'creationHeight',
  ], `package output ${index}`);
  canonicalPositiveLongString(output.value, `output ${index} value`);
  variableHex(output.ergoTree, MAX_ERGO_TREE_BYTES, `output ${index} ErgoTree`);
  validateAssets(output.assets, `output ${index} assets`);
  validateHexRecord(output.additionalRegisters, `output ${index} registers`);
  nonnegativeSafeInteger(output.creationHeight, `output ${index} creation height`);
}

function validateAssets(value: unknown, label: string): void {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const tokenIds = value.map((raw, index) => {
    const asset = record(raw, `${label} ${index}`);
    exactKeys(asset, ['tokenId', 'amount'], `${label} ${index}`);
    canonicalPositiveLongString(asset.amount, `${label} ${index} amount`);
    return fixedHex(asset.tokenId, 32, `${label} ${index} token ID`);
  });
  if (new Set(tokenIds).size !== tokenIds.length) throw new Error(`${label} contains duplicate token IDs`);
}

function validateHexRecord(value: unknown, label: string): void {
  const item = record(value, label);
  for (const [key, raw] of Object.entries(item)) {
    if (!/^\d+$/.test(key)) {
      if (!/^R[4-9]$/.test(key)) throw new Error(`${label} contains an invalid key`);
    }
    variableHex(raw, MAX_SERIALIZED_BOX_BYTES, `${label}.${key}`);
  }
}

function validateBoundary(value: unknown): void {
  const boundary = record(value, 'package boundary');
  const expected = {
    transactionConstructed: true,
    transactionCheckPerformed: false,
    transactionSigned: false,
    transactionSubmitted: false,
    transactionBroadcast: false,
    deploymentPerformed: false,
    packageDigestAuthenticatesSources: false,
    gate5Closed: false,
    trustlessSettlementClaim: false,
    productionReady: false,
    r9RemainsFinalityAuthority: true,
  };
  exactKeys(boundary, Object.keys(expected), 'package boundary');
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (boundary[key] !== expectedValue) {
      throw new Error(`package boundary.${key} must be ${expectedValue}`);
    }
  }
}

function validateInclusion(
  value: unknown,
  label: string,
): AuthenticatedV2UnsignedSettlementCompanion['targetBurn']['inclusion'] {
  const inclusion = record(value, label);
  exactKeys(inclusion, ['leafIndex', 'leafCount', 'proof'], label);
  const leafCount = positiveSafeInteger(inclusion.leafCount, `${label} leaf count`);
  const leafIndex = nonnegativeSafeInteger(inclusion.leafIndex, `${label} leaf index`);
  if (leafIndex >= leafCount) throw new Error(`${label} leaf index must be less than leaf count`);
  if (!Array.isArray(inclusion.proof)) throw new Error(`${label} proof must be an array`);
  const proof = inclusion.proof.map((raw, index) => {
    const step = record(raw, `${label} proof step ${index}`);
    exactKeys(step, ['side', 'hashHex'], `${label} proof step ${index}`);
    if (step.side !== 'left' && step.side !== 'right') {
      throw new Error(`${label} proof step ${index} side must be left or right`);
    }
    return {
      side: step.side,
      hashHex: fixedHex(step.hashHex, 32, `${label} proof step ${index} hash`),
    };
  });
  return { leafIndex, leafCount, proof };
}

function stripExtension(value: unknown): BoxLike | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const { extension: _discarded, ...box } = value as Record<string, unknown>;
  return box as unknown as BoxLike;
}

function assertCanonicalBytesBindBox(bytes: CanonicalInputBytes, box: BoxLike, label: string): void {
  if (bytes.boxIdHex !== box.boxId) throw new Error(`${label} canonical bytes bind the wrong box ID`);
}

async function assertSigmaBytes(bytes: CanonicalInputBytes, box: BoxLike, label: string): Promise<void> {
  const wasm = await getWasm();
  const parsed = wasm.ErgoBox.from_json(JSON.stringify(box));
  try {
    const serializedHex = Buffer.from(parsed.sigma_serialize_bytes()).toString('hex');
    if (serializedHex !== bytes.sigmaSerializedHex) {
      throw new Error(`${label} does not preserve the exact canonical T9 Sigma bytes`);
    }
    if (parsed.box_id().to_str().toLowerCase() !== bytes.boxIdHex) {
      throw new Error(`${label} canonical T9 bytes recompute a different box ID`);
    }
  } finally {
    parsed.free?.();
  }
}

let wasmPromise: Promise<any> | undefined;

async function getWasm(): Promise<any> {
  if (!wasmPromise) {
    wasmPromise = import('ergo-lib-wasm-nodejs').then(module => module.default ?? module);
  }
  return wasmPromise;
}

async function deriveUnsignedTransactionId(
  eip12: PreparedAuthenticatedSettlementUnsignedTxPayload['eip12Tx'],
): Promise<string> {
  const wasm = await getWasm();
  const unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify({
    inputs: eip12.inputs.map(input => ({ boxId: input.boxId, extension: input.extension })),
    dataInputs: eip12.dataInputs.map(input => ({ boxId: input.boxId })),
    outputs: eip12.outputs,
  }));
  try {
    return unsigned.id().to_str().toLowerCase();
  } finally {
    unsigned.free?.();
  }
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  const normalized = stringValue(value, label);
  if (normalized.length !== bytes * 2 || !/^[0-9a-f]+$/.test(normalized)) {
    throw new Error(`${label} must be ${bytes}-byte canonical lowercase hex`);
  }
  return normalized;
}

function variableHex(value: unknown, maxBytes: number, label: string): string {
  const normalized = stringValue(value, label);
  if (
    normalized.length === 0
    || normalized.length % 2 !== 0
    || normalized.length > maxBytes * 2
    || !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new Error(`${label} must be non-empty canonical lowercase hex within ${maxBytes} bytes`);
  }
  return normalized;
}

function canonicalUint64String(value: unknown, label: string): string {
  const normalized = stringValue(value, label);
  if (!/^(0|[1-9]\d*)$/.test(normalized) || BigInt(normalized) > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} must be a canonical uint64 string`);
  }
  return normalized;
}

function canonicalPositiveLongString(value: unknown, label: string): string {
  const normalized = typeof value === 'number'
    ? (Number.isSafeInteger(value) ? String(value) : '')
    : value;
  if (typeof normalized !== 'string' || !/^[1-9]\d*$/.test(normalized)) {
    throw new Error(`${label} must be a canonical positive integer`);
  }
  if (BigInt(normalized) > 0x7fff_ffff_ffff_ffffn) {
    throw new Error(`${label} exceeds the positive signed Long range`);
  }
  return normalized;
}

function uint32(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 0xffff_ffff) {
    throw new Error(`${label} must be a uint32`);
  }
  return Number(value);
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(value);
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function record(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function exactKeys(value: Record<string, any>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} fields do not match the canonical schema`);
  }
}

function sha256Canonical(value: unknown): string {
  return sha256Hex(Buffer.from(canonicalJson(value), 'utf8'));
}

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function blake2b256Hex(value: Buffer): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function canonicalJson(value: unknown): string {
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => (
    `${JSON.stringify(key)}:${canonicalJson(object[key])}`
  )).join(',')}}`;
}

function toJsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(
      ([key, child]) => [key, toJsonSafe(child)],
    ));
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
