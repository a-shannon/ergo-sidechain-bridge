import {
  createErgoCommittedVaultCurrentStatePortV1,
} from './adapters/ergo-committed-vault-current-state.js';
import {
  verifyErgoBlockTransactionCommitment,
} from './adapters/ergo-block-transaction-commitment.js';
import {
  replayErgoAutolykosV2RelayWitnessV1,
} from './ergo-settlement-core/ergo-autolykos-v2-relay-witness-v1.js';
import { computeErgoHeaderId } from './ergo-settlement-core/ergo-header-id.js';
import { sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import {
  buildErgoSourceCommittedVaultCandidateV1,
} from './ergo-source-committed-vault-candidate-v1.js';
import {
  buildErgoSourceConsensusCandidateV1,
} from './ergo-source-consensus-candidate-v1.js';
import {
  buildFrontierErgoAutolykosCommittedVaultSourceProofCandidateV1,
} from './frontier-ergo-autolykos-committed-vault-source-proof-v1.js';
import {
  normalizeErgoSourceRelayWitnessPacketV1,
  type ErgoSourceRelayWitnessPacketStoreV1,
  type ErgoSourceRelayWitnessPacketV1,
} from './relayer-core/ergo-source-relay-witness-packet-v1.js';

export const ERGO_SOURCE_RELAY_RECOVERY_V1_SCHEMA =
  'e2s.ergo-source-relay-recovery.v1' as const;
export const ERGO_SOURCE_RELAY_RECOVERY_V1_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:ergo-source-relay-recovery:v1' as const;

const RECOVERIES = new WeakSet<object>();

export interface ErgoSourceRelayRecoveryV1 {
  readonly schema: typeof ERGO_SOURCE_RELAY_RECOVERY_V1_SCHEMA;
  readonly status: 'replayed_non_authorizing_candidate';
  readonly relayIdHex: string;
  readonly generation: number;
  readonly packetDigestHex: string;
  readonly sourceConsensusCandidateDigestHex: string;
  readonly committedVaultCandidateDigestHex: string;
  readonly selectedTipHeaderIdHex: string;
  readonly sourceBoxIdHex: string;
  readonly vaultBoxIdHex: string;
  readonly frontierStatementIdHex: string;
  readonly frontierStatementHex: string;
  readonly checks: Readonly<{
    rawBranchWitnessReverified: true;
    rawBlockAndSignedTransactionReverified: true;
    rawSourceAndVaultSemanticsReverified: true;
    orderedCurrentStateReadsReplayed: true;
    frontierStatementRebuilt: true;
  }>;
  readonly authority: Readonly<{
    persistedPacketAcceptedAsProof: false;
    checkpointExternallyAuthenticated: false;
    completeCompetingBranchKnowledgeEstablished: false;
    globallyCanonicalErgoConsensusAccepted: false;
    deterministicFinalityEstablished: false;
    transactionExecutionValidated: false;
    runtimeProofAccepted: false;
    mintAuthorized: false;
    daemonAdmissionAuthorized: false;
    signingAuthorized: false;
    submissionAuthorized: false;
    broadcastAuthorized: false;
    fundsAuthorityEstablished: false;
    gate5Closed: false;
    productionReady: false;
  }>;
  readonly recoveryDigestHex: string;
}

export type RecoverLatestErgoSourceRelayWitnessV1Result =
  | Readonly<{ status: 'missing' }>
  | Readonly<{ status: 'unavailable' }>
  | Readonly<{
    status: 'replayed';
    recovery: Readonly<ErgoSourceRelayRecoveryV1>;
  }>;

/**
 * Rebuilds every process-owned verification object from raw packet inputs.
 * No persisted result, status, candidate digest, or process brand is trusted.
 */
export async function replayErgoSourceRelayWitnessPacketV1(
  packetValue: Readonly<ErgoSourceRelayWitnessPacketV1>,
): Promise<Readonly<ErgoSourceRelayRecoveryV1>> {
  const packet = normalizeErgoSourceRelayWitnessPacketV1(packetValue);
  const relay = replayErgoAutolykosV2RelayWitnessV1(
    packet.consensusWitness,
  );
  const targetHeaderIdHex = computeErgoHeaderId(
    relay.targetHeader,
  ).toString('hex');
  const verification = await verifyErgoBlockTransactionCommitment({
    block: packet.block,
    expectedHeaderIdHex: targetHeaderIdHex,
    expectedHeight: relay.targetHeader.height,
    expectedTransactionIdHex: packet.commitmentTransactionIdHex,
    expectedTransaction: packet.signedCommitmentTransaction,
  });
  const sourceConsensusCandidate = buildErgoSourceConsensusCandidateV1({
    currentBranch: relay.currentBranch,
    competingBranches: relay.competingBranches,
    targetHeader: relay.targetHeader,
    staticCommitmentVerification: verification,
  });

  let cursor = 0;
  const currentStatePort = createErgoCommittedVaultCurrentStatePortV1({
    sourceNetworkIdHex: packet.route.sourceNetworkIdHex,
    backend: {
      async getBoxByIdOrNull(boxIdHex: string): Promise<unknown | null> {
        const read = packet.currentStateReads[cursor];
        if (read === undefined || read.sequence !== cursor) {
          throw new Error('Ergo source relay current-state replay is exhausted');
        }
        if (read.boxIdHex !== boxIdHex) {
          throw new Error('Ergo source relay current-state replay query drifted');
        }
        cursor += 1;
        return read.box === null ? null : structuredClone(read.box);
      },
    },
  });
  const committedVaultCandidate = await buildErgoSourceCommittedVaultCandidateV1({
    sourceConsensusCandidate,
    signedCommitmentTransaction: packet.signedCommitmentTransaction,
    refundableSourceBox: packet.refundableSourceBox,
    currentStatePort,
    route: packet.route,
  });
  if (cursor !== packet.currentStateReads.length) {
    throw new Error('Ergo source relay current-state replay was not fully consumed');
  }
  if (committedVaultCandidate.transition.sourceBoxIdHex !== packet.relayIdHex) {
    throw new Error('Ergo source relay ID does not match the verified source box');
  }
  const frontier =
    buildFrontierErgoAutolykosCommittedVaultSourceProofCandidateV1({
      sourceConsensusCandidate,
      committedVaultCandidate,
    });
  const body = {
    schema: ERGO_SOURCE_RELAY_RECOVERY_V1_SCHEMA,
    status: 'replayed_non_authorizing_candidate' as const,
    relayIdHex: packet.relayIdHex,
    generation: packet.generation,
    packetDigestHex: packet.packetDigestHex,
    sourceConsensusCandidateDigestHex:
      sourceConsensusCandidate.candidateDigestHex,
    committedVaultCandidateDigestHex:
      committedVaultCandidate.candidateDigestHex,
    selectedTipHeaderIdHex:
      sourceConsensusCandidate.branchSet.selectedTipHeaderIdHex,
    sourceBoxIdHex: committedVaultCandidate.transition.sourceBoxIdHex,
    vaultBoxIdHex: committedVaultCandidate.transition.vaultBoxIdHex,
    frontierStatementIdHex: frontier.statementIdHex,
    frontierStatementHex: frontier.statementHex,
    checks: {
      rawBranchWitnessReverified: true as const,
      rawBlockAndSignedTransactionReverified: true as const,
      rawSourceAndVaultSemanticsReverified: true as const,
      orderedCurrentStateReadsReplayed: true as const,
      frontierStatementRebuilt: true as const,
    },
    authority: {
      persistedPacketAcceptedAsProof: false as const,
      checkpointExternallyAuthenticated: false as const,
      completeCompetingBranchKnowledgeEstablished: false as const,
      globallyCanonicalErgoConsensusAccepted: false as const,
      deterministicFinalityEstablished: false as const,
      transactionExecutionValidated: false as const,
      runtimeProofAccepted: false as const,
      mintAuthorized: false as const,
      daemonAdmissionAuthorized: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
    },
  };
  const recovery = deepFreeze({
    ...body,
    recoveryDigestHex: sha256CanonicalJson(
      body,
      ERGO_SOURCE_RELAY_RECOVERY_V1_DIGEST_DOMAIN,
    ),
  });
  RECOVERIES.add(recovery);
  return recovery;
}

export async function recoverLatestErgoSourceRelayWitnessV1(input: Readonly<{
  store: ErgoSourceRelayWitnessPacketStoreV1;
  relayIdHex: string;
}>): Promise<RecoverLatestErgoSourceRelayWitnessV1Result> {
  const read = input.store.readLatest(input.relayIdHex);
  if (read.status === 'unavailable') {
    return Object.freeze({ status: 'unavailable' as const });
  }
  if (read.packet === null) {
    return Object.freeze({ status: 'missing' as const });
  }
  return Object.freeze({
    status: 'replayed' as const,
    recovery: await replayErgoSourceRelayWitnessPacketV1(read.packet),
  });
}

export function assertErgoSourceRelayRecoveryV1Provenance(
  value: unknown,
): asserts value is Readonly<ErgoSourceRelayRecoveryV1> {
  if (typeof value !== 'object' || value === null || !RECOVERIES.has(value)) {
    throw new Error('Ergo source relay recovery was not rebuilt in this process');
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}
