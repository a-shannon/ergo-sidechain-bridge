import { createHash } from 'node:crypto';

import blakejs from 'blakejs';

import {
  assertErgoSourceCommittedVaultCandidateV1Provenance,
  type ErgoSourceCommittedVaultCandidateV1,
} from './ergo-source-committed-vault-candidate-v1.js';
import {
  assertErgoSourceConsensusCandidateV1Provenance,
  type ErgoSourceConsensusCandidateV1,
} from './ergo-source-consensus-candidate-v1.js';
import {
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
} from './profiles/substrate-grandpa-v1/asset-profile.js';

export const FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_SOURCE_PROOF_V1_SCHEMA =
  'e2s.frontier-ergo-autolykos-committed-vault-source-proof.v1' as const;
export const FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_SOURCE_PROOF_V1_FORMAT = 1 as const;
export const FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_SOURCE_PROOF_V1_STATEMENT_BYTES = 1065;

const PROOF_SYSTEM_DOMAIN =
  'E2S_PEG_IN_ERGO_AUTOLYKOS_COMMITTED_VAULT_SOURCE_PROOF_SYSTEM_V1';
const PROOF_PROFILE_DOMAIN =
  'E2S_PEG_IN_ERGO_AUTOLYKOS_COMMITTED_VAULT_SOURCE_PROOF_PROFILE_V1';
const FINALITY_POLICY_DOMAIN =
  'E2S_PEG_IN_ERGO_AUTOLYKOS_EIP37_GREATEST_WORK_POLICY_V1';
const VERIFIER_PROFILE_DOMAIN =
  'E2S_PEG_IN_ERGO_AUTOLYKOS_COMMITTED_VAULT_VERIFIER_V1';
const ROUTE_PROFILE_DOMAIN =
  'E2S_PEG_IN_ERGO_COMMITTED_VAULT_ROUTE_PROFILE_ID_V1';
const ASSET_PROFILE_DOMAIN =
  'E2S_PEG_IN_ERGO_SOURCE_ASSET_PROFILE_ID_V1';
const STATEMENT_ID_DOMAIN =
  'E2S_PEG_IN_ERGO_AUTOLYKOS_COMMITTED_VAULT_STATEMENT_ID_V1';

const COMMITTED_VAULT_ROUTE_PROFILE = 'committed-vault-v3';
const MAX_KNOWN_BRANCHES = 32;
const MAX_CANONICAL_HEADER_BYTES = 4096;
const ERGO_LONG_MAX = 0x7fff_ffff_ffff_ffffn;
const ZERO_32_HEX = `0x${'00'.repeat(32)}`;

export const FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_PROOF_SYSTEM_ID_V1_HEX =
  domainHash(PROOF_SYSTEM_DOMAIN, Buffer.alloc(0));
export const FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_PROOF_PROFILE_ID_V1_HEX =
  domainHash(PROOF_PROFILE_DOMAIN, Buffer.alloc(0));
export const FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_FINALITY_POLICY_ID_V1_HEX =
  domainHash(FINALITY_POLICY_DOMAIN, Buffer.alloc(0));
export const FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_VERIFIER_PROFILE_ID_V1_HEX =
  domainHash(VERIFIER_PROFILE_DOMAIN, Buffer.alloc(0));
export const FRONTIER_ERGO_COMMITTED_VAULT_ROUTE_PROFILE_ID_V1_HEX =
  domainHash(ROUTE_PROFILE_DOMAIN, Buffer.from(COMMITTED_VAULT_ROUTE_PROFILE, 'utf8'));
export const FRONTIER_ERGO_NATIVE_ERG_ASSET_PROFILE_ID_V1_HEX =
  domainHash(
    ASSET_PROFILE_DOMAIN,
    Buffer.from(SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID, 'utf8'),
  );

export interface FrontierErgoAutolykosCommittedVaultSourceProofStatementV1 {
  readonly formatVersion:
    typeof FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_SOURCE_PROOF_V1_FORMAT;
  readonly proofSystemIdHex: string;
  readonly proofProfileIdHex: string;
  readonly finalityPolicyIdHex: string;
  readonly verifierProfileIdHex: string;
  readonly sourceConsensusCandidateDigestHex: string;
  readonly committedVaultCandidateDigestHex: string;
  readonly spvProfileIdHex: string;
  readonly sourceNetworkIdHex: string;
  readonly checkpointHeaderIdHex: string;
  readonly checkpointHeight: number;
  readonly knownBranchesDigestHex: string;
  readonly knownBranchCount: number;
  readonly selectedTipHeaderIdHex: string;
  readonly selectedTipHeight: number;
  readonly selectedCumulativeWork: string;
  readonly targetHeaderIdHex: string;
  readonly targetHeight: number;
  readonly targetBlockVersion: number;
  readonly targetTransactionsRootHex: string;
  readonly targetCanonicalHeaderSha256Hex: string;
  readonly targetCanonicalHeaderLength: number;
  readonly confirmations: number;
  readonly requiredConfirmations: number;
  readonly wp01cVerificationDigestHex: string;
  readonly transactionIdHex: string;
  readonly transactionSigmaDigestHex: string;
  readonly transactionIndex: number;
  readonly transactionCount: number;
  readonly routeProfileIdHex: string;
  readonly sourceLockErgoTreeSha256Hex: string;
  readonly vaultErgoTreeSha256Hex: string;
  readonly committedTransactionIdHex: string;
  readonly committedTransactionSigmaDigestHex: string;
  readonly transactionSemanticsDigestHex: string;
  readonly sourceBoxIdHex: string;
  readonly sourceBoxContentDigestHex: string;
  readonly sourceInputIndex: number;
  readonly sourceInputCount: number;
  readonly vaultBoxIdHex: string;
  readonly vaultOutputIndex: number;
  readonly currentStateObservationDigestHex: string;
  readonly assetProfileIdHex: string;
  readonly assetIdHex: string;
  readonly amountNanoErg: string;
  readonly recipientH160Hex: string;
  readonly depositorErgoTreeSha256Hex: string;
}

export interface FrontierErgoAutolykosCommittedVaultSourceProofRegistryV1 {
  readonly schema:
    typeof FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_SOURCE_PROOF_V1_SCHEMA;
  readonly formatVersion:
    typeof FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_SOURCE_PROOF_V1_FORMAT;
  readonly proofSystemIdHex: string;
  readonly proofProfileIdHex: string;
  readonly finalityPolicyIdHex: string;
  readonly verifierProfileIdHex: string;
  readonly statementBytes: number;
  readonly boundary: Readonly<{
    staticallyRegistered: true;
    compatibilityFamilyOnly: true;
    compileTimeActivationAllowed: false;
    proofEnvelopeAccepted: false;
    runtimeStateMutationAllowed: false;
    mintAuthorizationAllowed: false;
    pooledReserveV4ReinterpretationAllowed: false;
    reservedStarkProofSystemUsed: false;
  }>;
}

export interface FrontierErgoAutolykosCommittedVaultSourceProofCandidateV1 {
  readonly schema:
    typeof FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_SOURCE_PROOF_V1_SCHEMA;
  readonly status: 'NON_AUTHORIZING_SOURCE_PROOF_STATEMENT_BUILT';
  readonly registry: FrontierErgoAutolykosCommittedVaultSourceProofRegistryV1;
  readonly statement: FrontierErgoAutolykosCommittedVaultSourceProofStatementV1;
  readonly statementHex: string;
  readonly statementIdHex: string;
  readonly authority: Readonly<{
    completeWitnessVerifiedByRuntime: false;
    checkpointExternallyAuthenticated: false;
    completeCompetingBranchKnowledgeEstablished: false;
    globallyCanonicalErgoConsensusAccepted: false;
    deterministicFinalityEstablished: false;
    sourceTransactionExecutionValidated: false;
    runtimeStateMutationAuthorized: false;
    runtimeAdmissionAuthorized: false;
    mintAuthorized: false;
    fundsAuthorityEstablished: false;
    gate5Closed: false;
    productionReady: false;
  }>;
  readonly limitations: readonly string[];
}

export interface BuildFrontierErgoAutolykosCommittedVaultSourceProofCandidateV1Input {
  readonly sourceConsensusCandidate: Readonly<ErgoSourceConsensusCandidateV1>;
  readonly committedVaultCandidate: Readonly<ErgoSourceCommittedVaultCandidateV1>;
}

const STATIC_REGISTRY = deepFreeze({
  schema: FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_SOURCE_PROOF_V1_SCHEMA,
  formatVersion:
    FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_SOURCE_PROOF_V1_FORMAT,
  proofSystemIdHex:
    FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_PROOF_SYSTEM_ID_V1_HEX,
  proofProfileIdHex:
    FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_PROOF_PROFILE_ID_V1_HEX,
  finalityPolicyIdHex:
    FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_FINALITY_POLICY_ID_V1_HEX,
  verifierProfileIdHex:
    FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_VERIFIER_PROFILE_ID_V1_HEX,
  statementBytes:
    FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_SOURCE_PROOF_V1_STATEMENT_BYTES,
  boundary: {
    staticallyRegistered: true as const,
    compatibilityFamilyOnly: true as const,
    compileTimeActivationAllowed: false as const,
    proofEnvelopeAccepted: false as const,
    runtimeStateMutationAllowed: false as const,
    mintAuthorizationAllowed: false as const,
    pooledReserveV4ReinterpretationAllowed: false as const,
    reservedStarkProofSystemUsed: false as const,
  },
});

export function createFrontierErgoAutolykosCommittedVaultSourceProofRegistryV1():
Readonly<FrontierErgoAutolykosCommittedVaultSourceProofRegistryV1> {
  return STATIC_REGISTRY;
}

export function buildFrontierErgoAutolykosCommittedVaultSourceProofCandidateV1(
  input: BuildFrontierErgoAutolykosCommittedVaultSourceProofCandidateV1Input,
): Readonly<FrontierErgoAutolykosCommittedVaultSourceProofCandidateV1> {
  const snapshot = exactDataObject(input, [
    'sourceConsensusCandidate',
    'committedVaultCandidate',
  ], 'Frontier Ergo source-proof candidate input');
  const source = snapshot.sourceConsensusCandidate;
  const committed = snapshot.committedVaultCandidate;
  assertErgoSourceConsensusCandidateV1Provenance(source);
  assertErgoSourceCommittedVaultCandidateV1Provenance(committed);
  assertCandidateJoin(source, committed);

  const canonicalHeader = fixedHexBytes(
    source.targetHeader.canonicalHeaderBytesHex,
    undefined,
    'target canonical Ergo header bytes',
  );
  const statement = deepFreeze({
    formatVersion:
      FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_SOURCE_PROOF_V1_FORMAT,
    proofSystemIdHex:
      FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_PROOF_SYSTEM_ID_V1_HEX,
    proofProfileIdHex:
      FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_PROOF_PROFILE_ID_V1_HEX,
    finalityPolicyIdHex:
      FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_FINALITY_POLICY_ID_V1_HEX,
    verifierProfileIdHex:
      FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_VERIFIER_PROFILE_ID_V1_HEX,
    sourceConsensusCandidateDigestHex:
      asHex(source.candidateDigestHex),
    committedVaultCandidateDigestHex:
      asHex(committed.candidateDigestHex),
    spvProfileIdHex: asHex(source.branchSet.profileIdHex),
    sourceNetworkIdHex: asHex(source.branchSet.sourceNetworkIdHex),
    checkpointHeaderIdHex: asHex(source.branchSet.checkpointHeaderIdHex),
    checkpointHeight: source.branchSet.checkpointHeight,
    knownBranchesDigestHex: asHex(source.branchSet.knownBranchesDigestHex),
    knownBranchCount: source.branchSet.knownBranches.length,
    selectedTipHeaderIdHex: asHex(source.branchSet.selectedTipHeaderIdHex),
    selectedTipHeight: source.branchSet.selectedTipHeight,
    selectedCumulativeWork: source.branchSet.selectedCumulativeWork,
    targetHeaderIdHex: asHex(source.targetHeader.headerIdHex),
    targetHeight: source.targetHeader.height,
    targetBlockVersion: source.targetHeader.blockVersion,
    targetTransactionsRootHex: asHex(source.targetHeader.transactionsRootHex),
    targetCanonicalHeaderSha256Hex: asHex(sha256(canonicalHeader)),
    targetCanonicalHeaderLength: canonicalHeader.length,
    confirmations: source.targetHeader.confirmations,
    requiredConfirmations: source.targetHeader.requiredConfirmations,
    wp01cVerificationDigestHex: asHex(source.transaction.wp01cVerificationDigestHex),
    transactionIdHex: asHex(source.transaction.commitmentTxIdHex),
    transactionSigmaDigestHex: asHex(source.transaction.transactionSigmaDigestHex),
    transactionIndex: source.transaction.transactionIndex,
    transactionCount: source.transaction.transactionCount,
    routeProfileIdHex: FRONTIER_ERGO_COMMITTED_VAULT_ROUTE_PROFILE_ID_V1_HEX,
    sourceLockErgoTreeSha256Hex: asHex(committed.route.sourceLockErgoTreeSha256Hex),
    vaultErgoTreeSha256Hex: asHex(committed.route.vaultErgoTreeSha256Hex),
    committedTransactionIdHex: asHex(committed.transition.transactionIdHex),
    committedTransactionSigmaDigestHex:
      asHex(committed.transition.transactionSigmaDigestHex),
    transactionSemanticsDigestHex:
      asHex(committed.transition.transactionSemanticsDigestHex),
    sourceBoxIdHex: asHex(committed.transition.sourceBoxIdHex),
    sourceBoxContentDigestHex:
      asHex(committed.transition.sourceBoxContentDigestHex),
    sourceInputIndex: committed.transition.sourceInputIndex,
    sourceInputCount: committed.transition.sourceInputCount,
    vaultBoxIdHex: asHex(committed.transition.vaultBoxIdHex),
    vaultOutputIndex: committed.transition.vaultOutputIndex,
    currentStateObservationDigestHex:
      asHex(committed.transition.currentStateObservationDigestHex),
    assetProfileIdHex: FRONTIER_ERGO_NATIVE_ERG_ASSET_PROFILE_ID_V1_HEX,
    assetIdHex: asHex(committed.settlement.assetIdHex),
    amountNanoErg: committed.settlement.amountNanoErg,
    recipientH160Hex: asHex(committed.settlement.recipientH160Hex),
    depositorErgoTreeSha256Hex:
      asHex(committed.settlement.depositorErgoTreeSha256Hex),
  });
  const statementHex = encodeFrontierErgoAutolykosCommittedVaultSourceProofStatementV1Hex(
    statement,
  );
  const decoded = decodeFrontierErgoAutolykosCommittedVaultSourceProofStatementV1Hex(
    statementHex,
  );
  if (JSON.stringify(decoded) !== JSON.stringify(statement)) {
    throw new Error('Frontier Ergo source-proof statement round-trip drifted');
  }
  return deepFreeze({
    schema: FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_SOURCE_PROOF_V1_SCHEMA,
    status: 'NON_AUTHORIZING_SOURCE_PROOF_STATEMENT_BUILT' as const,
    registry: STATIC_REGISTRY,
    statement,
    statementHex,
    statementIdHex:
      deriveFrontierErgoAutolykosCommittedVaultSourceProofStatementIdV1Hex(
        statement,
      ),
    authority: {
      completeWitnessVerifiedByRuntime: false as const,
      checkpointExternallyAuthenticated: false as const,
      completeCompetingBranchKnowledgeEstablished: false as const,
      globallyCanonicalErgoConsensusAccepted: false as const,
      deterministicFinalityEstablished: false as const,
      sourceTransactionExecutionValidated: false as const,
      runtimeStateMutationAuthorized: false as const,
      runtimeAdmissionAuthorized: false as const,
      mintAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
    },
    limitations: [
      'The fixed statement commits to the complete WP-01D public-input surface, not the variable-size branch, transaction, source-box, and vault witness bytes.',
      'The statically registered Frontier consumer rejects production activation and performs no storage transition.',
      'Policy depth and locally selected greatest work do not establish complete branch knowledge or deterministic Ergo finality.',
      'The committed-vault V1 route is a compatibility family and must not be reinterpreted as the pooled-reserve V4 transition.',
      'No daemon, mint, signer, submitter, broadcaster, funds authority, Gate 5, or readiness route consumes this candidate.',
    ] as const,
  });
}

export function encodeFrontierErgoAutolykosCommittedVaultSourceProofStatementV1Hex(
  statement: FrontierErgoAutolykosCommittedVaultSourceProofStatementV1,
): string {
  validateStatement(statement);
  const bytes = Buffer.concat([
    Buffer.from([statement.formatVersion]),
    h256(statement.proofSystemIdHex, 'proof-system ID'),
    h256(statement.proofProfileIdHex, 'proof-profile ID'),
    h256(statement.finalityPolicyIdHex, 'finality-policy ID'),
    h256(statement.verifierProfileIdHex, 'verifier-profile ID'),
    h256(statement.sourceConsensusCandidateDigestHex, 'source candidate digest'),
    h256(statement.committedVaultCandidateDigestHex, 'committed-vault candidate digest'),
    h256(statement.spvProfileIdHex, 'SPV profile ID'),
    h256(statement.sourceNetworkIdHex, 'source network ID'),
    h256(statement.checkpointHeaderIdHex, 'checkpoint header ID'),
    uint32Be(statement.checkpointHeight, 'checkpoint height'),
    h256(statement.knownBranchesDigestHex, 'known-branches digest'),
    uint16Be(statement.knownBranchCount, 'known-branch count'),
    h256(statement.selectedTipHeaderIdHex, 'selected tip header ID'),
    uint32Be(statement.selectedTipHeight, 'selected tip height'),
    uint256Be(statement.selectedCumulativeWork, 'selected cumulative work'),
    h256(statement.targetHeaderIdHex, 'target header ID'),
    uint32Be(statement.targetHeight, 'target height'),
    Buffer.from([statement.targetBlockVersion]),
    h256(statement.targetTransactionsRootHex, 'target transactions root'),
    h256(statement.targetCanonicalHeaderSha256Hex, 'target canonical header SHA-256'),
    uint32Be(statement.targetCanonicalHeaderLength, 'target canonical header length'),
    uint32Be(statement.confirmations, 'target confirmations'),
    uint32Be(statement.requiredConfirmations, 'required confirmations'),
    h256(statement.wp01cVerificationDigestHex, 'WP-01C verification digest'),
    h256(statement.transactionIdHex, 'transaction ID'),
    h256(statement.transactionSigmaDigestHex, 'transaction Sigma digest'),
    uint32Be(statement.transactionIndex, 'transaction index'),
    uint32Be(statement.transactionCount, 'transaction count'),
    h256(statement.routeProfileIdHex, 'route-profile ID'),
    h256(statement.sourceLockErgoTreeSha256Hex, 'source-lock ErgoTree SHA-256'),
    h256(statement.vaultErgoTreeSha256Hex, 'vault ErgoTree SHA-256'),
    h256(statement.committedTransactionIdHex, 'committed transaction ID'),
    h256(statement.committedTransactionSigmaDigestHex, 'committed transaction Sigma digest'),
    h256(statement.transactionSemanticsDigestHex, 'transaction-semantics digest'),
    h256(statement.sourceBoxIdHex, 'source box ID'),
    h256(statement.sourceBoxContentDigestHex, 'source-box content digest'),
    uint32Be(statement.sourceInputIndex, 'source input index'),
    Buffer.from([statement.sourceInputCount]),
    h256(statement.vaultBoxIdHex, 'vault box ID'),
    uint32Be(statement.vaultOutputIndex, 'vault output index'),
    h256(statement.currentStateObservationDigestHex, 'current-state observation digest'),
    h256(statement.assetProfileIdHex, 'asset-profile ID'),
    h256(statement.assetIdHex, 'asset ID', true),
    uint64Be(statement.amountNanoErg, 'amount'),
    fixedHexBytes(statement.recipientH160Hex, 20, 'recipient H160'),
    h256(statement.depositorErgoTreeSha256Hex, 'depositor ErgoTree SHA-256'),
  ]);
  if (
    bytes.length
      !== FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_SOURCE_PROOF_V1_STATEMENT_BYTES
  ) {
    throw new Error('Frontier Ergo source-proof statement length drifted');
  }
  return `0x${bytes.toString('hex')}`;
}

export function decodeFrontierErgoAutolykosCommittedVaultSourceProofStatementV1Hex(
  value: string,
): Readonly<FrontierErgoAutolykosCommittedVaultSourceProofStatementV1> {
  const bytes = fixedHexBytes(
    value,
    FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_SOURCE_PROOF_V1_STATEMENT_BYTES,
    'Frontier Ergo source-proof statement',
  );
  const cursor = new Cursor(bytes);
  const statement = deepFreeze({
    formatVersion: cursor.u8(),
    proofSystemIdHex: cursor.hex(32),
    proofProfileIdHex: cursor.hex(32),
    finalityPolicyIdHex: cursor.hex(32),
    verifierProfileIdHex: cursor.hex(32),
    sourceConsensusCandidateDigestHex: cursor.hex(32),
    committedVaultCandidateDigestHex: cursor.hex(32),
    spvProfileIdHex: cursor.hex(32),
    sourceNetworkIdHex: cursor.hex(32),
    checkpointHeaderIdHex: cursor.hex(32),
    checkpointHeight: cursor.u32(),
    knownBranchesDigestHex: cursor.hex(32),
    knownBranchCount: cursor.u16(),
    selectedTipHeaderIdHex: cursor.hex(32),
    selectedTipHeight: cursor.u32(),
    selectedCumulativeWork: cursor.u256(),
    targetHeaderIdHex: cursor.hex(32),
    targetHeight: cursor.u32(),
    targetBlockVersion: cursor.u8(),
    targetTransactionsRootHex: cursor.hex(32),
    targetCanonicalHeaderSha256Hex: cursor.hex(32),
    targetCanonicalHeaderLength: cursor.u32(),
    confirmations: cursor.u32(),
    requiredConfirmations: cursor.u32(),
    wp01cVerificationDigestHex: cursor.hex(32),
    transactionIdHex: cursor.hex(32),
    transactionSigmaDigestHex: cursor.hex(32),
    transactionIndex: cursor.u32(),
    transactionCount: cursor.u32(),
    routeProfileIdHex: cursor.hex(32),
    sourceLockErgoTreeSha256Hex: cursor.hex(32),
    vaultErgoTreeSha256Hex: cursor.hex(32),
    committedTransactionIdHex: cursor.hex(32),
    committedTransactionSigmaDigestHex: cursor.hex(32),
    transactionSemanticsDigestHex: cursor.hex(32),
    sourceBoxIdHex: cursor.hex(32),
    sourceBoxContentDigestHex: cursor.hex(32),
    sourceInputIndex: cursor.u32(),
    sourceInputCount: cursor.u8(),
    vaultBoxIdHex: cursor.hex(32),
    vaultOutputIndex: cursor.u32(),
    currentStateObservationDigestHex: cursor.hex(32),
    assetProfileIdHex: cursor.hex(32),
    assetIdHex: cursor.hex(32),
    amountNanoErg: cursor.u64(),
    recipientH160Hex: cursor.hex(20),
    depositorErgoTreeSha256Hex: cursor.hex(32),
  }) as Readonly<FrontierErgoAutolykosCommittedVaultSourceProofStatementV1>;
  cursor.done();
  validateStatement(statement);
  const canonical = encodeFrontierErgoAutolykosCommittedVaultSourceProofStatementV1Hex(
    statement,
  );
  if (canonical !== `0x${bytes.toString('hex')}`) {
    throw new Error('Frontier Ergo source-proof statement is not canonical');
  }
  return statement;
}

export function deriveFrontierErgoAutolykosCommittedVaultSourceProofStatementIdV1Hex(
  statement: FrontierErgoAutolykosCommittedVaultSourceProofStatementV1,
): string {
  const encoded = encodeFrontierErgoAutolykosCommittedVaultSourceProofStatementV1Hex(
    statement,
  );
  return domainHash(STATEMENT_ID_DOMAIN, Buffer.from(encoded.slice(2), 'hex'));
}

function assertCandidateJoin(
  source: Readonly<ErgoSourceConsensusCandidateV1>,
  committed: Readonly<ErgoSourceCommittedVaultCandidateV1>,
): void {
  if (
    committed.consensus.sourceConsensusCandidateDigestHex
      !== source.candidateDigestHex
    || committed.consensus.sourceNetworkIdHex !== source.branchSet.sourceNetworkIdHex
    || committed.consensus.selectedTipHeaderIdHex
      !== source.branchSet.selectedTipHeaderIdHex
    || committed.consensus.targetHeaderIdHex !== source.targetHeader.headerIdHex
    || committed.consensus.confirmations !== source.targetHeader.confirmations
    || committed.consensus.requiredConfirmations
      !== source.targetHeader.requiredConfirmations
    || committed.transition.transactionIdHex
      !== source.transaction.commitmentTxIdHex
    || committed.transition.transactionSigmaDigestHex
      !== source.transaction.transactionSigmaDigestHex
  ) {
    throw new Error('WP-01D source and committed-vault candidates do not form one exact join');
  }
  if (committed.route.routeProfileId !== COMMITTED_VAULT_ROUTE_PROFILE) {
    throw new Error('WP-01D committed-vault route profile is unsupported');
  }
  if (
    committed.settlement.assetProfileId
      !== SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID
    || committed.settlement.asset !== 'ERG'
    || committed.settlement.amountUnit !== 'nanoERG'
  ) {
    throw new Error('WP-01D committed-vault asset profile is unsupported');
  }
}

function validateStatement(
  statement: FrontierErgoAutolykosCommittedVaultSourceProofStatementV1,
): void {
  if (
    statement.formatVersion
      !== FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_SOURCE_PROOF_V1_FORMAT
  ) {
    throw new Error('Frontier Ergo source-proof statement version is unsupported');
  }
  for (const [actual, expected, label] of [
    [statement.proofSystemIdHex, FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_PROOF_SYSTEM_ID_V1_HEX, 'proof-system'],
    [statement.proofProfileIdHex, FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_PROOF_PROFILE_ID_V1_HEX, 'proof-profile'],
    [statement.finalityPolicyIdHex, FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_FINALITY_POLICY_ID_V1_HEX, 'finality-policy'],
    [statement.verifierProfileIdHex, FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_VERIFIER_PROFILE_ID_V1_HEX, 'verifier-profile'],
    [statement.routeProfileIdHex, FRONTIER_ERGO_COMMITTED_VAULT_ROUTE_PROFILE_ID_V1_HEX, 'route-profile'],
    [statement.assetProfileIdHex, FRONTIER_ERGO_NATIVE_ERG_ASSET_PROFILE_ID_V1_HEX, 'asset-profile'],
  ] as const) {
    if (normalizeHex(actual, 32, label) !== expected) {
      throw new Error(`Frontier Ergo source-proof ${label} ID is unsupported`);
    }
  }
  for (const [value, label] of [
    [statement.sourceConsensusCandidateDigestHex, 'source candidate digest'],
    [statement.committedVaultCandidateDigestHex, 'committed-vault candidate digest'],
    [statement.spvProfileIdHex, 'SPV profile ID'],
    [statement.sourceNetworkIdHex, 'source network ID'],
    [statement.checkpointHeaderIdHex, 'checkpoint header ID'],
    [statement.knownBranchesDigestHex, 'known-branches digest'],
    [statement.selectedTipHeaderIdHex, 'selected tip header ID'],
    [statement.targetHeaderIdHex, 'target header ID'],
    [statement.targetTransactionsRootHex, 'target transactions root'],
    [statement.targetCanonicalHeaderSha256Hex, 'target canonical header SHA-256'],
    [statement.wp01cVerificationDigestHex, 'WP-01C verification digest'],
    [statement.transactionIdHex, 'transaction ID'],
    [statement.transactionSigmaDigestHex, 'transaction Sigma digest'],
    [statement.sourceLockErgoTreeSha256Hex, 'source-lock ErgoTree SHA-256'],
    [statement.vaultErgoTreeSha256Hex, 'vault ErgoTree SHA-256'],
    [statement.committedTransactionIdHex, 'committed transaction ID'],
    [statement.committedTransactionSigmaDigestHex, 'committed transaction Sigma digest'],
    [statement.transactionSemanticsDigestHex, 'transaction-semantics digest'],
    [statement.sourceBoxIdHex, 'source box ID'],
    [statement.sourceBoxContentDigestHex, 'source-box content digest'],
    [statement.vaultBoxIdHex, 'vault box ID'],
    [statement.currentStateObservationDigestHex, 'current-state observation digest'],
    [statement.depositorErgoTreeSha256Hex, 'depositor ErgoTree SHA-256'],
  ] as const) {
    if (normalizeHex(value, 32, label) === ZERO_32_HEX) {
      throw new Error(`Frontier Ergo source-proof ${label} must be nonzero`);
    }
  }
  if (
    !uint32(statement.checkpointHeight)
    || !uint32(statement.selectedTipHeight)
    || !uint32(statement.targetHeight)
    || statement.checkpointHeight >= statement.targetHeight
    || statement.targetHeight > statement.selectedTipHeight
  ) {
    throw new Error('Frontier Ergo source-proof header heights are invalid');
  }
  if (
    !Number.isSafeInteger(statement.knownBranchCount)
    || statement.knownBranchCount < 1
    || statement.knownBranchCount > MAX_KNOWN_BRANCHES
  ) {
    throw new Error('Frontier Ergo source-proof known-branch count is invalid');
  }
  if (uint256(statement.selectedCumulativeWork, 'selected cumulative work') === 0n) {
    throw new Error('Frontier Ergo source-proof cumulative work must be positive');
  }
  if (
    !Number.isSafeInteger(statement.targetBlockVersion)
    || statement.targetBlockVersion < 2
    || statement.targetBlockVersion > 4
  ) {
    throw new Error('Frontier Ergo source-proof target block version is unsupported');
  }
  if (
    !uint32(statement.targetCanonicalHeaderLength)
    || statement.targetCanonicalHeaderLength === 0
    || statement.targetCanonicalHeaderLength > MAX_CANONICAL_HEADER_BYTES
  ) {
    throw new Error('Frontier Ergo source-proof canonical header length is invalid');
  }
  if (
    !uint32(statement.confirmations)
    || !uint32(statement.requiredConfirmations)
    || statement.confirmations === 0
    || statement.requiredConfirmations === 0
    || statement.confirmations < statement.requiredConfirmations
  ) {
    throw new Error('Frontier Ergo source-proof confirmation policy is unsatisfied');
  }
  if (
    !Number.isSafeInteger(statement.transactionCount)
    || statement.transactionCount < 1
    || !Number.isSafeInteger(statement.transactionIndex)
    || statement.transactionIndex < 0
    || statement.transactionIndex >= statement.transactionCount
  ) {
    throw new Error('Frontier Ergo source-proof transaction position is invalid');
  }
  if (
    normalizeHex(statement.transactionIdHex, 32, 'transaction ID')
      !== normalizeHex(statement.committedTransactionIdHex, 32, 'committed transaction ID')
    || normalizeHex(statement.transactionSigmaDigestHex, 32, 'transaction Sigma digest')
      !== normalizeHex(
        statement.committedTransactionSigmaDigestHex,
        32,
        'committed transaction Sigma digest',
      )
  ) {
    throw new Error('Frontier Ergo source-proof transaction identities disagree');
  }
  if (statement.sourceInputCount !== 1 || statement.vaultOutputIndex !== 0) {
    throw new Error('Frontier Ergo source-proof transition shape is unsupported');
  }
  if (!uint32(statement.sourceInputIndex)) {
    throw new Error('Frontier Ergo source-proof source input index is invalid');
  }
  if (normalizeHex(statement.assetIdHex, 32, 'asset ID') !== ZERO_32_HEX) {
    throw new Error('Frontier Ergo source-proof supports only native ERG');
  }
  const amount = uint64(statement.amountNanoErg, 'amount');
  if (amount === 0n || amount > ERGO_LONG_MAX) {
    throw new Error('Frontier Ergo source-proof amount is outside the positive Ergo Long range');
  }
  normalizeHex(statement.recipientH160Hex, 20, 'recipient H160');
}

class Cursor {
  private offset = 0;

  constructor(private readonly bytes: Buffer) {}

  u8(): number {
    return this.bytes[this.take(1)]!;
  }

  u16(): number {
    return this.bytes.readUInt16BE(this.take(2));
  }

  u32(): number {
    return this.bytes.readUInt32BE(this.take(4));
  }

  u64(): string {
    return this.bytes.readBigUInt64BE(this.take(8)).toString();
  }

  u256(): string {
    return BigInt(`0x${this.bytes.subarray(this.take(32), this.offset).toString('hex')}`)
      .toString();
  }

  hex(length: number): string {
    const start = this.take(length);
    return `0x${this.bytes.subarray(start, start + length).toString('hex')}`;
  }

  done(): void {
    if (this.offset !== this.bytes.length) {
      throw new Error('Frontier Ergo source-proof statement has trailing bytes');
    }
  }

  private take(length: number): number {
    const start = this.offset;
    this.offset += length;
    if (this.offset > this.bytes.length) {
      throw new Error('Frontier Ergo source-proof statement is truncated');
    }
    return start;
  }
}

function exactDataObject<T extends object>(
  value: T,
  keys: readonly string[],
  label: string,
): T {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors).map(String).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} must contain exactly ${expected.join(', ')}`);
  }
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new Error(`${label}.${key} must be a data property`);
    }
  }
  return Object.fromEntries(
    expected.map(key => [key, descriptors[key]!.value]),
  ) as T;
}

function fixedHexBytes(
  value: string,
  expectedLength: number | undefined,
  label: string,
): Buffer {
  if (typeof value !== 'string' || !/^(?:0x)?[0-9a-fA-F]+$/.test(value)) {
    throw new Error(`${label} must be hexadecimal`);
  }
  const raw = value.startsWith('0x') ? value.slice(2) : value;
  if (raw.length % 2 !== 0) throw new Error(`${label} must contain complete bytes`);
  const bytes = Buffer.from(raw, 'hex');
  if (expectedLength !== undefined && bytes.length !== expectedLength) {
    throw new Error(`${label} must be exactly ${expectedLength} bytes`);
  }
  return bytes;
}

function normalizeHex(value: string, length: number, label: string): string {
  return `0x${fixedHexBytes(value, length, label).toString('hex')}`;
}

function asHex(value: string): string {
  return `0x${fixedHexBytes(value, undefined, 'hex value').toString('hex')}`;
}

function h256(value: string, label: string, zeroAllowed = false): Buffer {
  const bytes = fixedHexBytes(value, 32, label);
  if (!zeroAllowed && bytes.equals(Buffer.alloc(32))) {
    throw new Error(`${label} must be nonzero`);
  }
  return bytes;
}

function uint16Be(value: number, label: string): Buffer {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff) {
    throw new Error(`${label} must be an unsigned Uint16`);
  }
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16BE(value);
  return bytes;
}

function uint32(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 0xffff_ffff;
}

function uint32Be(value: number, label: string): Buffer {
  if (!uint32(value)) throw new Error(`${label} must be an unsigned Uint32`);
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function uint64(value: string | number | bigint, label: string): bigint {
  const numeric = typeof value === 'bigint' ? value : BigInt(value);
  if (numeric < 0n || numeric > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} must be an unsigned Uint64`);
  }
  return numeric;
}

function uint64Be(value: string | number | bigint, label: string): Buffer {
  const numeric = uint64(value, label);
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(numeric);
  return bytes;
}

function uint256(value: string | number | bigint, label: string): bigint {
  const numeric = typeof value === 'bigint' ? value : BigInt(value);
  if (numeric < 0n || numeric >= (1n << 256n)) {
    throw new Error(`${label} must be an unsigned Uint256`);
  }
  return numeric;
}

function uint256Be(value: string | number | bigint, label: string): Buffer {
  const numeric = uint256(value, label);
  return Buffer.from(numeric.toString(16).padStart(64, '0'), 'hex');
}

function domainHash(domain: string, body: Uint8Array): string {
  return `0x${Buffer.from(blakejs.blake2b(
    Buffer.concat([Buffer.from(domain, 'ascii'), Buffer.from(body)]),
    undefined,
    32,
  )).toString('hex')}`;
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}
