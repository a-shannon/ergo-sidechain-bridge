import blakejs from 'blakejs';

import {
  decodeErgoAutolykosV2RelayRuntimeWitnessV1,
  deriveErgoAutolykosV2RelayRuntimeWitnessIdV1Hex,
  ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_FAMILY_ID_HEX,
} from './ergo-settlement-core/ergo-autolykos-v2-relay-runtime-witness-v1.js';
import {
  replayErgoAutolykosV2RelayWitnessV1,
} from './ergo-settlement-core/ergo-autolykos-v2-relay-witness-v1.js';
import {
  computeErgoAutolykosV2SpvProfileId,
  evaluateErgoSpvBranchTargetDepth,
} from './ergo-settlement-core/ergo-autolykos-v2-spv-branch.js';
import {
  computeErgoHeaderId,
  serializeErgoHeaderIdentity,
} from './ergo-settlement-core/ergo-header-id.js';
import {
  decodeErgoScorexTransactionRuntimeWitnessV1,
  ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_FAMILY_ID_HEX,
  type ErgoScorexTransactionRuntimeParserProfileV1,
} from './ergo-settlement-core/ergo-scorex-transaction-runtime-witness-v1.js';
import { sha256Bytes } from './ergo-settlement-core/strict-json.js';
import {
  FRONTIER_ERGO_COMMITTED_VAULT_ROUTE_PROFILE_ID_V1_HEX,
  FRONTIER_ERGO_NATIVE_ERG_ASSET_PROFILE_ID_V1_HEX,
} from './frontier-ergo-autolykos-committed-vault-source-proof-v1.js';

export const FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_STATEMENT_V2_SCHEMA =
  'e2s.frontier-ergo-autolykos-committed-vault-runtime-statement.v2' as const;
export const FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_STATEMENT_V2_FORMAT =
  2 as const;
export const FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_STATEMENT_V2_BYTES =
  978 as const;

export const FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_PROOF_SYSTEM_V2_DOMAIN =
  'E2S_PEG_IN_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_DERIVED_PROOF_SYSTEM_V2' as const;
export const FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_STATEMENT_PROFILE_V2_DOMAIN =
  'E2S_PEG_IN_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_DERIVED_STATEMENT_PROFILE_V2' as const;
export const FRONTIER_ERGO_AUTOLYKOS_SUPPLIED_BRANCH_POLICY_V2_DOMAIN =
  'E2S_PEG_IN_ERGO_AUTOLYKOS_EIP37_SUPPLIED_BRANCH_POLICY_V2' as const;
export const FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_VERIFIER_V2_DOMAIN =
  'E2S_PEG_IN_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_DERIVED_VERIFIER_V2' as const;
export const FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_STATEMENT_ID_V2_DOMAIN =
  'E2S_PEG_IN_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_DERIVED_STATEMENT_ID_V2' as const;
export const FRONTIER_ERGO_AUTOLYKOS_SUPPLIED_BRANCHES_V2_DOMAIN =
  'E2S_PEG_IN_ERGO_AUTOLYKOS_SUPPLIED_BRANCHES_V2' as const;

const DIGEST_BYTES = 32;

export const FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_PROOF_SYSTEM_ID_V2_HEX =
  domainId(FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_PROOF_SYSTEM_V2_DOMAIN);
export const FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_STATEMENT_PROFILE_ID_V2_HEX =
  domainId(FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_STATEMENT_PROFILE_V2_DOMAIN);
export const FRONTIER_ERGO_AUTOLYKOS_SUPPLIED_BRANCH_POLICY_ID_V2_HEX =
  domainId(FRONTIER_ERGO_AUTOLYKOS_SUPPLIED_BRANCH_POLICY_V2_DOMAIN);
export const FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_VERIFIER_PROFILE_ID_V2_HEX =
  domainId(FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_VERIFIER_V2_DOMAIN);

const WITNESS_LEAF_BYTES = 31;
const RECIPIENT_BYTES = 20;
const MAX_BRANCHES = 32;
const MAX_SIGNED_TRANSACTION_BYTES = 64 * 1024;
const MAX_SOURCE_BOX_BYTES = 4 * 1024;
const MAX_CANONICAL_HEADER_BYTES = 4 * 1024;
const MAX_U16 = 0xffff;
const MAX_U32 = 0xffff_ffff;
const MAX_U64 = 0xffff_ffff_ffff_ffffn;
const MAX_U256 = (1n << 256n) - 1n;
const ERGO_LONG_MAX = 0x7fff_ffff_ffff_ffffn;
const RELAY_ENVELOPE_HEADER_BYTES = 72;

export interface BuildFrontierErgoAutolykosCommittedVaultRuntimeStatementV2Input {
  readonly relayWitnessBytes: Uint8Array;
  readonly expectedSpvProfileIdHex: string;
  readonly transactionWitnessBytes: Uint8Array;
  readonly expectedTransactionProfile: ErgoScorexTransactionRuntimeParserProfileV1;
}

export interface FrontierErgoAutolykosCommittedVaultRuntimeStatementV2 {
  readonly formatVersion:
    typeof FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_STATEMENT_V2_FORMAT;
  readonly proofSystemIdHex: string;
  readonly statementProfileIdHex: string;
  readonly suppliedBranchPolicyIdHex: string;
  readonly verifierProfileIdHex: string;
  readonly relayFamilyIdHex: string;
  readonly relayWitnessIdHex: string;
  readonly transactionFamilyIdHex: string;
  readonly transactionParserProfileIdHex: string;
  readonly transactionWitnessIdHex: string;
  readonly spvProfileIdHex: string;
  readonly sourceNetworkIdHex: string;
  readonly checkpointHeaderIdHex: string;
  readonly checkpointHeight: number;
  readonly suppliedBranchesDigestHex: string;
  readonly suppliedBranchCount: number;
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
  readonly transactionIndex: number;
  readonly transactionCount: number;
  readonly transactionIdHex: string;
  readonly signedTransactionSha256Hex: string;
  readonly signedTransactionLength: number;
  readonly transactionWitnessLeafIdHex: string;
  readonly routeProfileIdHex: string;
  readonly assetProfileIdHex: string;
  readonly sourceBoxIdHex: string;
  readonly sourceBoxLength: number;
  readonly sourceInputIndex: number;
  readonly sourceReferenceCount: 1;
  readonly amountNanoErg: string;
  readonly sourceLockErgoTreeSha256Hex: string;
  readonly recipientH160Hex: string;
  readonly depositorErgoTreeSha256Hex: string;
  readonly vaultBoxIdHex: string;
  readonly vaultOutputIndex: 0;
  readonly vaultErgoTreeSha256Hex: string;
  readonly authorityFlags: 0;
}

export interface FrontierErgoAutolykosCommittedVaultRuntimeStatementCandidateV2 {
  readonly schema:
    typeof FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_STATEMENT_V2_SCHEMA;
  readonly status: 'NON_AUTHORIZING_RUNTIME_DERIVED_STATEMENT_BUILT';
  readonly statement: Readonly<FrontierErgoAutolykosCommittedVaultRuntimeStatementV2>;
  readonly statementHex: string;
  readonly statementIdHex: string;
  readonly authority: Readonly<{
    checkpointExternallyAuthenticated: false;
    completeCompetingBranchKnowledgeEstablished: false;
    globallyCanonicalErgoConsensusAccepted: false;
    deterministicFinalityEstablished: false;
    sourceTransactionExecutionValidated: false;
    currentUtxoMembershipEstablished: false;
    runtimeStateMutationAuthorized: false;
    runtimeAdmissionAuthorized: false;
    mintAuthorized: false;
    fundsAuthorityEstablished: false;
    gate5Closed: false;
    productionReady: false;
  }>;
  readonly limitations: readonly string[];
}

export function buildFrontierErgoAutolykosCommittedVaultRuntimeStatementV2(
  value: BuildFrontierErgoAutolykosCommittedVaultRuntimeStatementV2Input,
): Readonly<FrontierErgoAutolykosCommittedVaultRuntimeStatementCandidateV2> {
  const input = exactDataObject(value, [
    'relayWitnessBytes',
    'expectedSpvProfileIdHex',
    'transactionWitnessBytes',
    'expectedTransactionProfile',
  ], 'runtime-derived statement V2 input');
  const relayBytes = exactBytes(input.relayWitnessBytes, 'relay runtime witness');
  const transactionBytes = exactBytes(
    input.transactionWitnessBytes,
    'transaction runtime witness',
  );
  const expectedSpvProfileIdHex = exactHex(
    input.expectedSpvProfileIdHex,
    DIGEST_BYTES,
    'expected SPV profile ID',
  );
  const relayWitness = decodeErgoAutolykosV2RelayRuntimeWitnessV1(
    relayBytes,
    expectedSpvProfileIdHex,
  );
  const relay = replayErgoAutolykosV2RelayWitnessV1(relayWitness);
  const transaction = decodeErgoScorexTransactionRuntimeWitnessV1(
    transactionBytes,
    input.expectedTransactionProfile as ErgoScorexTransactionRuntimeParserProfileV1,
  );
  requireInitialCompatibilityProfile(transaction);

  const targetHeaderIdHex = computeErgoHeaderId(relay.targetHeader).toString('hex');
  const targetTransactionsRootHex = Buffer.from(
    relay.targetHeader.transactionsRoot,
  ).toString('hex');
  if (targetTransactionsRootHex !== transaction.targetTransactionsRootHex) {
    throw new Error('relay and transaction witnesses disagree on target transactions root');
  }
  if (relay.targetHeader.version !== transaction.blockVersion) {
    throw new Error('relay and transaction witnesses disagree on target block version');
  }
  if (transaction.source.valueNanoErg !== transaction.vault.valueNanoErg) {
    throw new Error('transaction witness source and vault amounts disagree');
  }

  const targetDepth = evaluateErgoSpvBranchTargetDepth(
    relay.currentBranch,
    computeErgoHeaderId(relay.targetHeader),
  );
  if (
    !targetDepth.included
    || !targetDepth.depthSatisfied
    || targetDepth.targetHeight !== relay.targetHeader.height
  ) {
    throw new Error('relay target depth is not runtime-derived and satisfied');
  }
  const selectedTip = relay.currentBranch.headers.at(-1)!;
  const canonicalTargetHeader = serializeErgoHeaderIdentity(relay.targetHeader);
  const statement = deepFreeze({
    formatVersion:
      FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_STATEMENT_V2_FORMAT,
    proofSystemIdHex:
      FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_PROOF_SYSTEM_ID_V2_HEX,
    statementProfileIdHex:
      FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_STATEMENT_PROFILE_ID_V2_HEX,
    suppliedBranchPolicyIdHex:
      FRONTIER_ERGO_AUTOLYKOS_SUPPLIED_BRANCH_POLICY_ID_V2_HEX,
    verifierProfileIdHex:
      FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_VERIFIER_PROFILE_ID_V2_HEX,
    relayFamilyIdHex: asHex(
      ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_FAMILY_ID_HEX,
    ),
    relayWitnessIdHex: asHex(
      deriveErgoAutolykosV2RelayRuntimeWitnessIdV1Hex(
        relayBytes,
        expectedSpvProfileIdHex,
      ),
    ),
    transactionFamilyIdHex: asHex(
      ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_FAMILY_ID_HEX,
    ),
    transactionParserProfileIdHex: asHex(transaction.parserProfileIdHex),
    transactionWitnessIdHex: asHex(transaction.witnessIdHex),
    spvProfileIdHex: asHex(
      computeErgoAutolykosV2SpvProfileId(relay.profile).toString('hex'),
    ),
    sourceNetworkIdHex: asHex(relay.witness.profile.sourceNetworkIdHex),
    checkpointHeaderIdHex: asHex(
      computeErgoHeaderId(relay.checkpoint.header).toString('hex'),
    ),
    checkpointHeight: relay.checkpoint.header.height,
    suppliedBranchesDigestHex: asHex(deriveSuppliedBranchesDigestHex(relayBytes)),
    suppliedBranchCount: relay.witness.branches.length,
    selectedTipHeaderIdHex: asHex(selectedTip.headerId.toString('hex')),
    selectedTipHeight: selectedTip.header.height,
    selectedCumulativeWork: relay.currentBranch.cumulativeWork.toString(),
    targetHeaderIdHex: asHex(targetHeaderIdHex),
    targetHeight: relay.targetHeader.height,
    targetBlockVersion: relay.targetHeader.version,
    targetTransactionsRootHex: asHex(targetTransactionsRootHex),
    targetCanonicalHeaderSha256Hex: asHex(sha256Bytes(canonicalTargetHeader)),
    targetCanonicalHeaderLength: canonicalTargetHeader.length,
    confirmations: targetDepth.confirmations,
    requiredConfirmations: relay.profile.requiredConfirmations,
    transactionIndex: transaction.transactionIndex,
    transactionCount: transaction.transactionCount,
    transactionIdHex: asHex(transaction.transactionIdHex),
    signedTransactionSha256Hex: asHex(transaction.signedTransactionSha256Hex),
    signedTransactionLength: transaction.signedTransactionLength,
    transactionWitnessLeafIdHex: asHex(transaction.transactionWitnessLeafIdHex),
    routeProfileIdHex: canonicalPrefixedHex(transaction.routeProfileIdHex),
    assetProfileIdHex: canonicalPrefixedHex(transaction.assetProfileIdHex),
    sourceBoxIdHex: asHex(transaction.source.boxIdHex),
    sourceBoxLength: transaction.source.serializedBytesLength,
    sourceInputIndex: transaction.source.inputIndex,
    sourceReferenceCount: 1 as const,
    amountNanoErg: transaction.source.valueNanoErg,
    sourceLockErgoTreeSha256Hex: asHex(
      transaction.source.sourceLockErgoTreeSha256Hex,
    ),
    recipientH160Hex: asHex(transaction.source.recipientH160Hex),
    depositorErgoTreeSha256Hex: asHex(
      transaction.source.depositorErgoTreeSha256Hex,
    ),
    vaultBoxIdHex: asHex(transaction.vault.boxIdHex),
    vaultOutputIndex: 0 as const,
    vaultErgoTreeSha256Hex: asHex(transaction.vault.vaultErgoTreeSha256Hex),
    authorityFlags: 0 as const,
  });
  const statementBytes = encodeFrontierErgoAutolykosCommittedVaultRuntimeStatementV2(
    statement,
  );
  const decoded = decodeFrontierErgoAutolykosCommittedVaultRuntimeStatementV2(
    statementBytes,
  );
  if (!statementBytes.equals(
    encodeFrontierErgoAutolykosCommittedVaultRuntimeStatementV2(decoded),
  )) {
    throw new Error('runtime-derived statement V2 round-trip drifted');
  }
  return deepFreeze({
    schema: FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_STATEMENT_V2_SCHEMA,
    status: 'NON_AUTHORIZING_RUNTIME_DERIVED_STATEMENT_BUILT' as const,
    statement: decoded,
    statementHex: `0x${statementBytes.toString('hex')}`,
    statementIdHex:
      deriveFrontierErgoAutolykosCommittedVaultRuntimeStatementIdV2Hex(
        statementBytes,
      ),
    authority: {
      checkpointExternallyAuthenticated: false as const,
      completeCompetingBranchKnowledgeEstablished: false as const,
      globallyCanonicalErgoConsensusAccepted: false as const,
      deterministicFinalityEstablished: false as const,
      sourceTransactionExecutionValidated: false as const,
      currentUtxoMembershipEstablished: false as const,
      runtimeStateMutationAuthorized: false as const,
      runtimeAdmissionAuthorized: false as const,
      mintAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
    },
    limitations: [
      'The statement authenticates only the supplied verified relay branch set, not complete global competing-branch knowledge or deterministic finality.',
      'The exact transaction and box bytes are parsed and committed, but transaction execution and current UTXO membership remain separate proof obligations.',
      'No runtime consumer accepts this statement and no daemon, mint, signer, submitter, broadcaster, funds route, Gate 5, or readiness claim consumes it.',
    ] as const,
  });
}

export function encodeFrontierErgoAutolykosCommittedVaultRuntimeStatementV2(
  value: FrontierErgoAutolykosCommittedVaultRuntimeStatementV2,
): Buffer {
  const statement = normalizeStatement(value);
  const writer = new BinaryWriter();
  writer.u8(statement.formatVersion);
  writer.hex(statement.proofSystemIdHex, DIGEST_BYTES);
  writer.hex(statement.statementProfileIdHex, DIGEST_BYTES);
  writer.hex(statement.suppliedBranchPolicyIdHex, DIGEST_BYTES);
  writer.hex(statement.verifierProfileIdHex, DIGEST_BYTES);
  writer.hex(statement.relayFamilyIdHex, DIGEST_BYTES);
  writer.hex(statement.relayWitnessIdHex, DIGEST_BYTES);
  writer.hex(statement.transactionFamilyIdHex, DIGEST_BYTES);
  writer.hex(statement.transactionParserProfileIdHex, DIGEST_BYTES);
  writer.hex(statement.transactionWitnessIdHex, DIGEST_BYTES);
  writer.hex(statement.spvProfileIdHex, DIGEST_BYTES);
  writer.hex(statement.sourceNetworkIdHex, DIGEST_BYTES);
  writer.hex(statement.checkpointHeaderIdHex, DIGEST_BYTES);
  writer.u32(statement.checkpointHeight);
  writer.hex(statement.suppliedBranchesDigestHex, DIGEST_BYTES);
  writer.u16(statement.suppliedBranchCount);
  writer.hex(statement.selectedTipHeaderIdHex, DIGEST_BYTES);
  writer.u32(statement.selectedTipHeight);
  writer.u256(BigInt(statement.selectedCumulativeWork));
  writer.hex(statement.targetHeaderIdHex, DIGEST_BYTES);
  writer.u32(statement.targetHeight);
  writer.u8(statement.targetBlockVersion);
  writer.hex(statement.targetTransactionsRootHex, DIGEST_BYTES);
  writer.hex(statement.targetCanonicalHeaderSha256Hex, DIGEST_BYTES);
  writer.u32(statement.targetCanonicalHeaderLength);
  writer.u32(statement.confirmations);
  writer.u32(statement.requiredConfirmations);
  writer.u32(statement.transactionIndex);
  writer.u32(statement.transactionCount);
  writer.hex(statement.transactionIdHex, DIGEST_BYTES);
  writer.hex(statement.signedTransactionSha256Hex, DIGEST_BYTES);
  writer.u32(statement.signedTransactionLength);
  writer.hex(statement.transactionWitnessLeafIdHex, WITNESS_LEAF_BYTES);
  writer.hex(statement.routeProfileIdHex, DIGEST_BYTES);
  writer.hex(statement.assetProfileIdHex, DIGEST_BYTES);
  writer.hex(statement.sourceBoxIdHex, DIGEST_BYTES);
  writer.u32(statement.sourceBoxLength);
  writer.u32(statement.sourceInputIndex);
  writer.u8(statement.sourceReferenceCount);
  writer.u64(BigInt(statement.amountNanoErg));
  writer.hex(statement.sourceLockErgoTreeSha256Hex, DIGEST_BYTES);
  writer.hex(statement.recipientH160Hex, RECIPIENT_BYTES);
  writer.hex(statement.depositorErgoTreeSha256Hex, DIGEST_BYTES);
  writer.hex(statement.vaultBoxIdHex, DIGEST_BYTES);
  writer.u32(statement.vaultOutputIndex);
  writer.hex(statement.vaultErgoTreeSha256Hex, DIGEST_BYTES);
  writer.u16(statement.authorityFlags);
  const bytes = writer.finish();
  if (
    bytes.length
    !== FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_STATEMENT_V2_BYTES
  ) {
    throw new Error('runtime-derived statement V2 internal length drifted');
  }
  return bytes;
}

export function decodeFrontierErgoAutolykosCommittedVaultRuntimeStatementV2(
  value: Uint8Array,
): Readonly<FrontierErgoAutolykosCommittedVaultRuntimeStatementV2> {
  const bytes = exactFixedBytes(
    value,
    FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_STATEMENT_V2_BYTES,
    'runtime-derived statement V2',
  );
  const reader = new BinaryReader(bytes);
  const statement = normalizeStatement({
    formatVersion: reader.u8(),
    proofSystemIdHex: reader.hex(DIGEST_BYTES),
    statementProfileIdHex: reader.hex(DIGEST_BYTES),
    suppliedBranchPolicyIdHex: reader.hex(DIGEST_BYTES),
    verifierProfileIdHex: reader.hex(DIGEST_BYTES),
    relayFamilyIdHex: reader.hex(DIGEST_BYTES),
    relayWitnessIdHex: reader.hex(DIGEST_BYTES),
    transactionFamilyIdHex: reader.hex(DIGEST_BYTES),
    transactionParserProfileIdHex: reader.hex(DIGEST_BYTES),
    transactionWitnessIdHex: reader.hex(DIGEST_BYTES),
    spvProfileIdHex: reader.hex(DIGEST_BYTES),
    sourceNetworkIdHex: reader.hex(DIGEST_BYTES),
    checkpointHeaderIdHex: reader.hex(DIGEST_BYTES),
    checkpointHeight: reader.u32(),
    suppliedBranchesDigestHex: reader.hex(DIGEST_BYTES),
    suppliedBranchCount: reader.u16(),
    selectedTipHeaderIdHex: reader.hex(DIGEST_BYTES),
    selectedTipHeight: reader.u32(),
    selectedCumulativeWork: reader.u256().toString(),
    targetHeaderIdHex: reader.hex(DIGEST_BYTES),
    targetHeight: reader.u32(),
    targetBlockVersion: reader.u8(),
    targetTransactionsRootHex: reader.hex(DIGEST_BYTES),
    targetCanonicalHeaderSha256Hex: reader.hex(DIGEST_BYTES),
    targetCanonicalHeaderLength: reader.u32(),
    confirmations: reader.u32(),
    requiredConfirmations: reader.u32(),
    transactionIndex: reader.u32(),
    transactionCount: reader.u32(),
    transactionIdHex: reader.hex(DIGEST_BYTES),
    signedTransactionSha256Hex: reader.hex(DIGEST_BYTES),
    signedTransactionLength: reader.u32(),
    transactionWitnessLeafIdHex: reader.hex(WITNESS_LEAF_BYTES),
    routeProfileIdHex: reader.hex(DIGEST_BYTES),
    assetProfileIdHex: reader.hex(DIGEST_BYTES),
    sourceBoxIdHex: reader.hex(DIGEST_BYTES),
    sourceBoxLength: reader.u32(),
    sourceInputIndex: reader.u32(),
    sourceReferenceCount: reader.u8(),
    amountNanoErg: reader.u64().toString(),
    sourceLockErgoTreeSha256Hex: reader.hex(DIGEST_BYTES),
    recipientH160Hex: reader.hex(RECIPIENT_BYTES),
    depositorErgoTreeSha256Hex: reader.hex(DIGEST_BYTES),
    vaultBoxIdHex: reader.hex(DIGEST_BYTES),
    vaultOutputIndex: reader.u32(),
    vaultErgoTreeSha256Hex: reader.hex(DIGEST_BYTES),
    authorityFlags: reader.u16(),
  });
  reader.end();
  const canonical = encodeFrontierErgoAutolykosCommittedVaultRuntimeStatementV2(
    statement,
  );
  if (!canonical.equals(bytes)) {
    throw new Error('runtime-derived statement V2 is not canonically encoded');
  }
  return statement;
}

export function deriveFrontierErgoAutolykosCommittedVaultRuntimeStatementIdV2Hex(
  value: Uint8Array,
): string {
  const bytes = exactFixedBytes(
    value,
    FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_STATEMENT_V2_BYTES,
    'runtime-derived statement V2',
  );
  decodeFrontierErgoAutolykosCommittedVaultRuntimeStatementV2(bytes);
  return asHex(blake2b256(Buffer.concat([
    Buffer.from(
      FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_STATEMENT_ID_V2_DOMAIN,
      'ascii',
    ),
    bytes,
  ])).toString('hex'));
}

export function assertFrontierErgoAutolykosCommittedVaultRuntimeStatementV2Matches(
  statementBytes: Uint8Array,
  witnesses: BuildFrontierErgoAutolykosCommittedVaultRuntimeStatementV2Input,
): Readonly<FrontierErgoAutolykosCommittedVaultRuntimeStatementV2> {
  const actual = decodeFrontierErgoAutolykosCommittedVaultRuntimeStatementV2(
    statementBytes,
  );
  const expected = buildFrontierErgoAutolykosCommittedVaultRuntimeStatementV2(
    witnesses,
  );
  if (expected.statementHex !== `0x${Buffer.from(statementBytes).toString('hex')}`) {
    throw new Error('runtime-derived statement V2 does not match the exact witnesses');
  }
  return actual;
}

function normalizeStatement(
  value: unknown,
): Readonly<FrontierErgoAutolykosCommittedVaultRuntimeStatementV2> {
  const raw = exactDataObject(value, [
    'formatVersion',
    'proofSystemIdHex',
    'statementProfileIdHex',
    'suppliedBranchPolicyIdHex',
    'verifierProfileIdHex',
    'relayFamilyIdHex',
    'relayWitnessIdHex',
    'transactionFamilyIdHex',
    'transactionParserProfileIdHex',
    'transactionWitnessIdHex',
    'spvProfileIdHex',
    'sourceNetworkIdHex',
    'checkpointHeaderIdHex',
    'checkpointHeight',
    'suppliedBranchesDigestHex',
    'suppliedBranchCount',
    'selectedTipHeaderIdHex',
    'selectedTipHeight',
    'selectedCumulativeWork',
    'targetHeaderIdHex',
    'targetHeight',
    'targetBlockVersion',
    'targetTransactionsRootHex',
    'targetCanonicalHeaderSha256Hex',
    'targetCanonicalHeaderLength',
    'confirmations',
    'requiredConfirmations',
    'transactionIndex',
    'transactionCount',
    'transactionIdHex',
    'signedTransactionSha256Hex',
    'signedTransactionLength',
    'transactionWitnessLeafIdHex',
    'routeProfileIdHex',
    'assetProfileIdHex',
    'sourceBoxIdHex',
    'sourceBoxLength',
    'sourceInputIndex',
    'sourceReferenceCount',
    'amountNanoErg',
    'sourceLockErgoTreeSha256Hex',
    'recipientH160Hex',
    'depositorErgoTreeSha256Hex',
    'vaultBoxIdHex',
    'vaultOutputIndex',
    'vaultErgoTreeSha256Hex',
    'authorityFlags',
  ], 'runtime-derived statement V2');
  const statement = {
    formatVersion: uint(raw.formatVersion, 0xff, 'statement format version'),
    proofSystemIdHex: prefixedHex(raw.proofSystemIdHex, DIGEST_BYTES, 'proof-system ID'),
    statementProfileIdHex: prefixedHex(raw.statementProfileIdHex, DIGEST_BYTES, 'statement-profile ID'),
    suppliedBranchPolicyIdHex: prefixedHex(raw.suppliedBranchPolicyIdHex, DIGEST_BYTES, 'supplied-branch policy ID'),
    verifierProfileIdHex: prefixedHex(raw.verifierProfileIdHex, DIGEST_BYTES, 'verifier-profile ID'),
    relayFamilyIdHex: prefixedHex(raw.relayFamilyIdHex, DIGEST_BYTES, 'relay family ID'),
    relayWitnessIdHex: prefixedHex(raw.relayWitnessIdHex, DIGEST_BYTES, 'relay witness ID'),
    transactionFamilyIdHex: prefixedHex(raw.transactionFamilyIdHex, DIGEST_BYTES, 'transaction family ID'),
    transactionParserProfileIdHex: prefixedHex(raw.transactionParserProfileIdHex, DIGEST_BYTES, 'transaction parser-profile ID'),
    transactionWitnessIdHex: prefixedHex(raw.transactionWitnessIdHex, DIGEST_BYTES, 'transaction witness ID'),
    spvProfileIdHex: prefixedHex(raw.spvProfileIdHex, DIGEST_BYTES, 'SPV profile ID'),
    sourceNetworkIdHex: prefixedHex(raw.sourceNetworkIdHex, DIGEST_BYTES, 'source network ID'),
    checkpointHeaderIdHex: prefixedHex(raw.checkpointHeaderIdHex, DIGEST_BYTES, 'checkpoint header ID'),
    checkpointHeight: uint(raw.checkpointHeight, MAX_U32, 'checkpoint height'),
    suppliedBranchesDigestHex: prefixedHex(raw.suppliedBranchesDigestHex, DIGEST_BYTES, 'supplied-branches digest'),
    suppliedBranchCount: uint(raw.suppliedBranchCount, MAX_U16, 'supplied-branch count'),
    selectedTipHeaderIdHex: prefixedHex(raw.selectedTipHeaderIdHex, DIGEST_BYTES, 'selected tip header ID'),
    selectedTipHeight: uint(raw.selectedTipHeight, MAX_U32, 'selected tip height'),
    selectedCumulativeWork: decimal(raw.selectedCumulativeWork, MAX_U256, false, 'selected cumulative work'),
    targetHeaderIdHex: prefixedHex(raw.targetHeaderIdHex, DIGEST_BYTES, 'target header ID'),
    targetHeight: uint(raw.targetHeight, MAX_U32, 'target height'),
    targetBlockVersion: uint(raw.targetBlockVersion, 0xff, 'target block version'),
    targetTransactionsRootHex: prefixedHex(raw.targetTransactionsRootHex, DIGEST_BYTES, 'target transactions root'),
    targetCanonicalHeaderSha256Hex: prefixedHex(raw.targetCanonicalHeaderSha256Hex, DIGEST_BYTES, 'target canonical header SHA-256'),
    targetCanonicalHeaderLength: uint(raw.targetCanonicalHeaderLength, MAX_U32, 'target canonical header length'),
    confirmations: uint(raw.confirmations, MAX_U32, 'target confirmations'),
    requiredConfirmations: uint(raw.requiredConfirmations, MAX_U32, 'required confirmations'),
    transactionIndex: uint(raw.transactionIndex, MAX_U32, 'transaction index'),
    transactionCount: uint(raw.transactionCount, MAX_U32, 'transaction count'),
    transactionIdHex: prefixedHex(raw.transactionIdHex, DIGEST_BYTES, 'transaction ID'),
    signedTransactionSha256Hex: prefixedHex(raw.signedTransactionSha256Hex, DIGEST_BYTES, 'signed transaction SHA-256'),
    signedTransactionLength: uint(raw.signedTransactionLength, MAX_U32, 'signed transaction length'),
    transactionWitnessLeafIdHex: prefixedHex(raw.transactionWitnessLeafIdHex, WITNESS_LEAF_BYTES, 'transaction witness-leaf ID'),
    routeProfileIdHex: prefixedHex(raw.routeProfileIdHex, DIGEST_BYTES, 'route-profile ID'),
    assetProfileIdHex: prefixedHex(raw.assetProfileIdHex, DIGEST_BYTES, 'asset-profile ID'),
    sourceBoxIdHex: prefixedHex(raw.sourceBoxIdHex, DIGEST_BYTES, 'source box ID'),
    sourceBoxLength: uint(raw.sourceBoxLength, MAX_U32, 'source box length'),
    sourceInputIndex: uint(raw.sourceInputIndex, MAX_U32, 'source input index'),
    sourceReferenceCount: uint(raw.sourceReferenceCount, 0xff, 'source-reference count'),
    amountNanoErg: decimal(raw.amountNanoErg, ERGO_LONG_MAX, false, 'native-ERG amount'),
    sourceLockErgoTreeSha256Hex: prefixedHex(raw.sourceLockErgoTreeSha256Hex, DIGEST_BYTES, 'source-lock ErgoTree SHA-256'),
    recipientH160Hex: prefixedHex(raw.recipientH160Hex, RECIPIENT_BYTES, 'recipient H160'),
    depositorErgoTreeSha256Hex: prefixedHex(raw.depositorErgoTreeSha256Hex, DIGEST_BYTES, 'depositor ErgoTree SHA-256'),
    vaultBoxIdHex: prefixedHex(raw.vaultBoxIdHex, DIGEST_BYTES, 'vault box ID'),
    vaultOutputIndex: uint(raw.vaultOutputIndex, MAX_U32, 'vault output index'),
    vaultErgoTreeSha256Hex: prefixedHex(raw.vaultErgoTreeSha256Hex, DIGEST_BYTES, 'vault ErgoTree SHA-256'),
    authorityFlags: uint(raw.authorityFlags, MAX_U16, 'authority flags'),
  };
  const normalized = statement as unknown as
    FrontierErgoAutolykosCommittedVaultRuntimeStatementV2;
  assertStaticStatement(normalized);
  return deepFreeze(normalized);
}

function assertStaticStatement(
  statement: FrontierErgoAutolykosCommittedVaultRuntimeStatementV2,
): void {
  for (const [actual, expected, label] of [
    [statement.formatVersion, FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_STATEMENT_V2_FORMAT, 'format version'],
    [statement.proofSystemIdHex, FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_PROOF_SYSTEM_ID_V2_HEX, 'proof-system ID'],
    [statement.statementProfileIdHex, FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_STATEMENT_PROFILE_ID_V2_HEX, 'statement-profile ID'],
    [statement.suppliedBranchPolicyIdHex, FRONTIER_ERGO_AUTOLYKOS_SUPPLIED_BRANCH_POLICY_ID_V2_HEX, 'supplied-branch policy ID'],
    [statement.verifierProfileIdHex, FRONTIER_ERGO_AUTOLYKOS_COMMITTED_VAULT_RUNTIME_VERIFIER_PROFILE_ID_V2_HEX, 'verifier-profile ID'],
    [statement.relayFamilyIdHex, asHex(ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_FAMILY_ID_HEX), 'relay family ID'],
    [statement.transactionFamilyIdHex, asHex(ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_V1_FAMILY_ID_HEX), 'transaction family ID'],
    [statement.routeProfileIdHex, canonicalPrefixedHex(FRONTIER_ERGO_COMMITTED_VAULT_ROUTE_PROFILE_ID_V1_HEX), 'route-profile ID'],
    [statement.assetProfileIdHex, canonicalPrefixedHex(FRONTIER_ERGO_NATIVE_ERG_ASSET_PROFILE_ID_V1_HEX), 'asset-profile ID'],
  ] as const) {
    if (actual !== expected) throw new Error(`runtime-derived statement V2 ${label} is unsupported`);
  }
  if (statement.suppliedBranchCount < 1 || statement.suppliedBranchCount > MAX_BRANCHES) {
    throw new Error('runtime-derived statement V2 supplied-branch count is unsupported');
  }
  if (
    statement.targetBlockVersion < 2
    || statement.targetBlockVersion > 4
  ) {
    throw new Error('runtime-derived statement V2 block version is unsupported');
  }
  if (
    statement.checkpointHeight >= statement.targetHeight
    || statement.targetHeight > statement.selectedTipHeight
  ) {
    throw new Error('runtime-derived statement V2 height ordering is invalid');
  }
  if (
    statement.confirmations < statement.requiredConfirmations
    || statement.requiredConfirmations < 1
  ) {
    throw new Error('runtime-derived statement V2 confirmation policy is unsatisfied');
  }
  if (
    statement.transactionCount < 1
    || statement.transactionIndex >= statement.transactionCount
  ) {
    throw new Error('runtime-derived statement V2 transaction position is invalid');
  }
  if (
    statement.signedTransactionLength < 1
    || statement.signedTransactionLength > MAX_SIGNED_TRANSACTION_BYTES
    || statement.sourceBoxLength < 1
    || statement.sourceBoxLength > MAX_SOURCE_BOX_BYTES
    || statement.targetCanonicalHeaderLength < 1
    || statement.targetCanonicalHeaderLength > MAX_CANONICAL_HEADER_BYTES
  ) {
    throw new Error('runtime-derived statement V2 byte length is outside its bound');
  }
  if (statement.sourceInputIndex >= 2 || statement.sourceReferenceCount !== 1) {
    throw new Error('runtime-derived statement V2 source reference is unsupported');
  }
  if (statement.vaultOutputIndex !== 0) {
    throw new Error('runtime-derived statement V2 vault output index is unsupported');
  }
  if (statement.authorityFlags !== 0) {
    throw new Error('runtime-derived statement V2 authority flags must remain zero');
  }
}

function requireInitialCompatibilityProfile(
  transaction: ReturnType<typeof decodeErgoScorexTransactionRuntimeWitnessV1>,
): void {
  if (
    canonicalPrefixedHex(transaction.routeProfileIdHex)
      !== canonicalPrefixedHex(FRONTIER_ERGO_COMMITTED_VAULT_ROUTE_PROFILE_ID_V1_HEX)
    || canonicalPrefixedHex(transaction.assetProfileIdHex)
      !== canonicalPrefixedHex(FRONTIER_ERGO_NATIVE_ERG_ASSET_PROFILE_ID_V1_HEX)
  ) {
    throw new Error('transaction witness is not the registered Frontier native-ERG compatibility profile');
  }
}

function deriveSuppliedBranchesDigestHex(relayBytes: Buffer): string {
  if (relayBytes.length < RELAY_ENVELOPE_HEADER_BYTES) {
    throw new Error('relay witness is truncated before branch digest derivation');
  }
  const profileLength = relayBytes.readUInt32BE(50);
  const checkpointLength = relayBytes.readUInt32BE(56);
  const branchesLength = relayBytes.readUInt32BE(62);
  const start = RELAY_ENVELOPE_HEADER_BYTES + profileLength + checkpointLength;
  const end = start + branchesLength;
  if (end > relayBytes.length) {
    throw new Error('relay branch section exceeds the verified witness boundary');
  }
  return blake2b256(Buffer.concat([
    Buffer.from(FRONTIER_ERGO_AUTOLYKOS_SUPPLIED_BRANCHES_V2_DOMAIN, 'ascii'),
    relayBytes.subarray(start, end),
  ])).toString('hex');
}

function domainId(domain: string): string {
  return asHex(blake2b256(Buffer.from(domain, 'ascii')).toString('hex'));
}

function blake2b256(value: Uint8Array): Buffer {
  return Buffer.from(blakejs.blake2b(value, undefined, DIGEST_BYTES));
}

function asHex(value: string): string {
  return `0x${value}`;
}

function canonicalPrefixedHex(value: unknown): string {
  return prefixedHex(value, DIGEST_BYTES, 'profile ID');
}

function prefixedHex(value: unknown, bytes: number, label: string): string {
  return asHex(exactHex(value, bytes, label));
}

function exactHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be lowercase hex`);
  const raw = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-f]+$/.test(raw) || raw.length !== bytes * 2) {
    throw new Error(`${label} must be exactly ${bytes} bytes of lowercase hex`);
  }
  return raw;
}

function exactBytes(value: unknown, label: string): Buffer {
  if (!(value instanceof Uint8Array)) throw new Error(`${label} must be bytes`);
  return Buffer.from(value);
}

function exactFixedBytes(
  value: unknown,
  length: number,
  label: string,
): Buffer {
  const bytes = exactBytes(value, label);
  if (bytes.length !== length) throw new Error(`${label} must be exactly ${length} bytes`);
  return bytes;
}

function exactDataObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, any> {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const symbols = Object.getOwnPropertySymbols(value);
  const actual = Object.getOwnPropertyNames(descriptors).sort();
  const expected = [...keys].sort();
  if (
    symbols.length !== 0
    || actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} must contain exactly ${expected.join(', ')}`);
  }
  const result: Record<string, any> = {};
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new Error(`${label}.${key} must be a data property`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function uint(value: unknown, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum) {
    throw new Error(`${label} must be an unsigned bounded integer`);
  }
  return Number(value);
}

function decimal(
  value: unknown,
  maximum: bigint,
  zeroAllowed: boolean,
  label: string,
): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be canonical unsigned decimal`);
  }
  const parsed = BigInt(value);
  if ((!zeroAllowed && parsed === 0n) || parsed > maximum) {
    throw new Error(`${label} is outside its bound`);
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

class BinaryWriter {
  private readonly chunks: Buffer[] = [];

  u8(value: number): void {
    this.integer(value, 0xff, 1);
  }

  u16(value: number): void {
    this.integer(value, MAX_U16, 2);
  }

  u32(value: number): void {
    this.integer(value, MAX_U32, 4);
  }

  u64(value: bigint): void {
    if (value < 0n || value > MAX_U64) throw new Error('UInt64 value is out of range');
    const bytes = Buffer.alloc(8);
    bytes.writeBigUInt64BE(value);
    this.chunks.push(bytes);
  }

  u256(value: bigint): void {
    if (value < 0n || value > MAX_U256) throw new Error('UInt256 value is out of range');
    const bytes = Buffer.alloc(32);
    let remaining = value;
    for (let index = bytes.length - 1; index >= 0; index -= 1) {
      bytes[index] = Number(remaining & 0xffn);
      remaining >>= 8n;
    }
    this.chunks.push(bytes);
  }

  hex(value: string, bytes: number): void {
    this.chunks.push(Buffer.from(exactHex(value, bytes, 'statement field'), 'hex'));
  }

  finish(): Buffer {
    return Buffer.concat(this.chunks);
  }

  private integer(value: number, maximum: number, length: number): void {
    if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
      throw new Error('statement integer is out of range');
    }
    const bytes = Buffer.alloc(length);
    if (length === 1) bytes.writeUInt8(value);
    else if (length === 2) bytes.writeUInt16BE(value);
    else bytes.writeUInt32BE(value);
    this.chunks.push(bytes);
  }
}

class BinaryReader {
  private offset = 0;

  constructor(private readonly source: Buffer) {}

  u8(): number {
    return this.bytes(1).readUInt8(0);
  }

  u16(): number {
    return this.bytes(2).readUInt16BE(0);
  }

  u32(): number {
    return this.bytes(4).readUInt32BE(0);
  }

  u64(): bigint {
    return this.bytes(8).readBigUInt64BE(0);
  }

  u256(): bigint {
    let value = 0n;
    for (const byte of this.bytes(32)) value = (value << 8n) | BigInt(byte);
    return value;
  }

  hex(length: number): string {
    return asHex(this.bytes(length).toString('hex'));
  }

  end(): void {
    if (this.offset !== this.source.length) {
      throw new Error('runtime-derived statement V2 contains trailing bytes');
    }
  }

  private bytes(length: number): Buffer {
    if (this.offset + length > this.source.length) {
      throw new Error('runtime-derived statement V2 is truncated');
    }
    const value = Buffer.from(this.source.subarray(this.offset, this.offset + length));
    this.offset += length;
    return value;
  }
}
