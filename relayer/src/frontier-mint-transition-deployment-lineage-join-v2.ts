import {
  buildFrontierMintTransitionDeploymentLineageJoinCandidate,
  type FrontierMintTransitionDeploymentLineageJoinCandidate,
} from './frontier-mint-transition-deployment-lineage-join.js';
import { sha256CanonicalJson } from './strict-json.js';

export const FRONTIER_MINT_TRANSITION_DEPLOYMENT_LINEAGE_JOIN_V2_SCHEMA =
  'e2s.native-finalized-peg-in-mint-transition-deployment-lineage-join-candidate.v2' as const;
export const FRONTIER_MINT_TRANSITION_DEPLOYMENT_LINEAGE_JOIN_V2_DIGEST_DOMAIN =
  'e2s.native-finalized-peg-in-mint-transition-deployment-lineage-join-candidate.digest.v2' as const;

const JOIN_V2_CANDIDATES = new WeakSet<object>();

export type FrontierMintTransitionDeploymentLineageJoinV2Input = Parameters<
  typeof buildFrontierMintTransitionDeploymentLineageJoinCandidate
>[0];

export interface FrontierMintTransitionDeploymentLineageJoinV2Candidate {
  readonly schema: typeof FRONTIER_MINT_TRANSITION_DEPLOYMENT_LINEAGE_JOIN_V2_SCHEMA;
  readonly status: 'non_authorizing_candidate';
  readonly v1CandidateDigestHex: string;
  readonly mintTransitionRequestDigestHex: string;
  readonly contractStateLineageJoinDigestHex: string;
  readonly contractStateRequestDigestHex: string;
  readonly trustAnchorDigestHex: string;
  readonly nativeFinalityStatementDigestHex: string;
  readonly target: FrontierMintTransitionDeploymentLineageJoinCandidate['target'];
  readonly contracts: FrontierMintTransitionDeploymentLineageJoinCandidate['contracts'];
  readonly pegIn: FrontierMintTransitionDeploymentLineageJoinCandidate['pegIn'] & Readonly<{
    sidechainIdHex: string;
  }>;
  readonly transition: FrontierMintTransitionDeploymentLineageJoinCandidate['transition'] &
    Readonly<{
      nativeProcessedRecordStorageKeyHex: string;
      evmProcessedPegInStorageKeyHex: string;
    }>;
  readonly checks: FrontierMintTransitionDeploymentLineageJoinCandidate['checks'] &
    Readonly<{
      exactRuntimeRecordIdentityBound: true;
      replayStorageKeysProjected: true;
      v1CandidateIdentityPreserved: true;
    }>;
  readonly authority: FrontierMintTransitionDeploymentLineageJoinCandidate['authority'];
  readonly limitations: readonly string[];
  readonly candidateDigestHex: string;
}

/**
 * Extend the frozen T20C V1 join without changing its schema or digest. The V2
 * projection adds only fields needed by later committed-vault correlation.
 */
export function buildFrontierMintTransitionDeploymentLineageJoinV2Candidate(
  input: FrontierMintTransitionDeploymentLineageJoinV2Input,
): FrontierMintTransitionDeploymentLineageJoinV2Candidate {
  const v1 = buildFrontierMintTransitionDeploymentLineageJoinCandidate(input);
  const mint = input.mintTransitionCandidate;
  const eventCandidate = mint.contractStateVerification.eventVerification;
  const record = eventCandidate.executionIdentity.record;
  const event = eventCandidate.event;

  if (
    record.ergoBoxIdHex !== v1.pegIn.ergoBoxIdHex
    || record.recipientHex !== v1.pegIn.recipientHex
    || record.amountNanoErg !== v1.pegIn.amountNanoErg
    || record.transactionHashHex !== v1.pegIn.transactionHashHex
    || record.eventIndex !== v1.pegIn.globalEventIndex
    || event.ergoBoxIdHex !== v1.pegIn.ergoBoxIdHex
  ) {
    throw new Error('mint transition runtime record differs from the exact V1 PegIn join');
  }

  const pegIn = deepFreeze({
    ...v1.pegIn,
    sidechainIdHex: record.sidechainIdHex,
  });
  const transition = deepFreeze({
    ...v1.transition,
    nativeProcessedRecordStorageKeyHex:
      mint.transition.parentNativeProcessedRecordStorageKeyHex,
    evmProcessedPegInStorageKeyHex:
      mint.contractStateVerification.contractState.processedPegInStorageKeyHex,
  });
  const checks = deepFreeze({
    ...v1.checks,
    exactRuntimeRecordIdentityBound: true as const,
    replayStorageKeysProjected: true as const,
    v1CandidateIdentityPreserved: true as const,
  });
  const limitations = Object.freeze([
    ...v1.limitations,
    'the V2 projection preserves and references the complete V1 candidate identity rather than reinterpreting V1 bytes',
  ]);
  const binding = {
    schema: FRONTIER_MINT_TRANSITION_DEPLOYMENT_LINEAGE_JOIN_V2_SCHEMA,
    status: 'non_authorizing_candidate' as const,
    v1CandidateDigestHex: v1.candidateDigestHex,
    mintTransitionRequestDigestHex: v1.mintTransitionRequestDigestHex,
    contractStateLineageJoinDigestHex: v1.contractStateLineageJoinDigestHex,
    contractStateRequestDigestHex: v1.contractStateRequestDigestHex,
    trustAnchorDigestHex: v1.trustAnchorDigestHex,
    nativeFinalityStatementDigestHex: v1.nativeFinalityStatementDigestHex,
    target: v1.target,
    contracts: v1.contracts,
    pegIn,
    transition,
    checks,
    authority: v1.authority,
    limitations,
  } as const;
  const candidate = deepFreeze({
    ...binding,
    candidateDigestHex: `0x${sha256CanonicalJson(
      binding,
      FRONTIER_MINT_TRANSITION_DEPLOYMENT_LINEAGE_JOIN_V2_DIGEST_DOMAIN,
    )}`,
  });
  JOIN_V2_CANDIDATES.add(candidate);
  return candidate;
}

export function assertFrontierMintTransitionDeploymentLineageJoinV2CandidateProvenance(
  value: unknown,
): asserts value is FrontierMintTransitionDeploymentLineageJoinV2Candidate {
  if (!value || typeof value !== 'object' || !JOIN_V2_CANDIDATES.has(value)) {
    throw new Error('Frontier mint-transition deployment-lineage V2 join provenance is missing');
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
