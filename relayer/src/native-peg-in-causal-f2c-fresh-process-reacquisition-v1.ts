import { createHash } from 'node:crypto';

import {
  collectNativeFinalizedPegInCausalMintTransitionV3Candidate,
  type CollectNativePegInCausalMintTransitionV3CandidateInput,
} from './native-checkpoint-proof-collector.js';
import {
  createNativePegInCausalF2cPreflightV1,
  finalizeNativePegInCausalF2cCompositionV1,
  type NativePegInCausalF2cCompositionV1Candidate,
} from './native-peg-in-causal-f2c-composition-v1.js';
import {
  assertPinnedLocalCausalSourceProofProducerCandidateEvaluatorProvenance,
  type PinnedLocalCausalSourceProofProducerCandidateEvaluator,
} from './native-peg-in-causal-source-proof-result-producer-execution-authority.js';
import {
  appendPegInCausalAdmissionLifecycleEventV1,
  createPegInCausalAdmissionLifecycleJournalV1,
  createPegInCausalAdmissionProofReferenceV1,
  createPegInCausalAdmissionSecurityRegistryV1,
} from './peg-in-causal-admission-lifecycle-v1.js';
import {
  validatePegInCausalSourceProofEnvelopeV1,
  type PegInCausalSourceProofEnvelopeV1,
  type PegInCausalSourceProofRequestV1,
} from './peg-in-causal-source-proof-admission-v1.js';

export interface NativePegInCausalF2cFreshProcessReacquisitionV1Input {
  readonly causalV3Collection: CollectNativePegInCausalMintTransitionV3CandidateInput;
  readonly sourceProofProducerEvaluator:
    PinnedLocalCausalSourceProofProducerCandidateEvaluator;
  readonly sourceProofRequest: PegInCausalSourceProofRequestV1;
  readonly sourceProofEnvelope: PegInCausalSourceProofEnvelopeV1;
}

const CAUSAL_V3_COLLECTION_KEYS = [
  'codec',
  'contractStateStatement',
  'deadlineMs',
  'evaluator',
  'eventStatement',
  'executionIdentityStatement',
  'maxAttempts',
  'rpc',
  'rpcConcurrency',
  'targetNativeBlockHashHex',
  'trustAnchor',
  'trustedAnchorDigestHex',
] as const;

/**
 * Reacquire every process-provenant F2c input after restart.
 *
 * The source-owned V3 collector and both protected evaluators run again. A
 * lifecycle journal is created only after the signed envelope and every
 * non-lifecycle identity binding pass. The result remains a deny-only local
 * candidate and grants no mint, signing, submission, broadcast or Gate 5
 * authority.
 */
export async function reacquireNativePegInCausalF2cAfterRestartV1(
  input: NativePegInCausalF2cFreshProcessReacquisitionV1Input,
): Promise<NativePegInCausalF2cCompositionV1Candidate> {
  assertExactKeys(input, [
    'causalV3Collection',
    'sourceProofEnvelope',
    'sourceProofProducerEvaluator',
    'sourceProofRequest',
  ], 'causal F2c fresh-process reacquisition input');
  const inputSnapshot = {
    causalV3Collection: input.causalV3Collection,
    sourceProofEnvelope: input.sourceProofEnvelope,
    sourceProofProducerEvaluator: input.sourceProofProducerEvaluator,
    sourceProofRequest: input.sourceProofRequest,
  };
  assertNoUnexpectedKeys(
    inputSnapshot.causalV3Collection,
    CAUSAL_V3_COLLECTION_KEYS,
    'causal F2c V3 collection input',
  );
  assertPinnedLocalCausalSourceProofProducerCandidateEvaluatorProvenance(
    inputSnapshot.sourceProofProducerEvaluator,
  );

  const sourceProofRequest = deepFreeze(
    structuredClone(inputSnapshot.sourceProofRequest),
  );
  const sourceProofEnvelope = deepFreeze(
    structuredClone(inputSnapshot.sourceProofEnvelope),
  );
  const sourceProofProducerEvaluator = inputSnapshot.sourceProofProducerEvaluator;
  const causalV3Collection = snapshotCollectionInput(
    inputSnapshot.causalV3Collection,
  );

  const recollected =
    await collectNativeFinalizedPegInCausalMintTransitionV3Candidate(
      causalV3Collection,
    );
  const currentNativeHeight = canonicalUint64(
    recollected.collection.acquisition.finalizedHeadNumber,
    'recollected finalized native height',
  );
  const sourceProofResult = validatePegInCausalSourceProofEnvelopeV1({
    request: sourceProofRequest,
    envelope: sourceProofEnvelope,
    currentNativeHeight,
  });
  const sourceProofProducerCandidate = await sourceProofProducerEvaluator.evaluate({
    request: sourceProofRequest,
    issuedAtNativeHeight: sourceProofResult.issuedAtNativeHeight,
    expiresAtNativeHeight: sourceProofResult.expiresAtNativeHeight,
  });
  const preflight = createNativePegInCausalF2cPreflightV1({
    causalV3Evaluator: causalV3Collection.evaluator,
    causalV3Candidate: recollected.candidate,
    causalV3Request: recollected.collection.request,
    sourceProofProducerEvaluator,
    sourceProofProducerCandidate,
    sourceProofRequest,
    sourceProofResult,
    currentNativeHeight,
  });

  const registry = createPegInCausalAdmissionSecurityRegistryV1();
  const proof = createPegInCausalAdmissionProofReferenceV1(sourceProofResult);
  const initialJournal = createPegInCausalAdmissionLifecycleJournalV1(
    sourceProofResult.candidateIdHex,
  );
  const admitted = appendPegInCausalAdmissionLifecycleEventV1({
    journal: initialJournal,
    registry,
    currentNativeHeight,
    event: {
      formatVersion: 1,
      eventIdHex: deriveAdmissionEventIdHex({
        candidateIdHex: sourceProofResult.candidateIdHex,
        sourceProofResultIdHex: sourceProofResult.sourceProofResultIdHex,
        validatedAtNativeHeight: sourceProofResult.validatedAtNativeHeight,
        currentNativeHeight,
        causalV3RequestDigestHex: recollected.candidate.requestDigestHex,
      }),
      candidateIdHex: sourceProofResult.candidateIdHex,
      kind: 'proof',
      proof,
    },
  });

  return finalizeNativePegInCausalF2cCompositionV1({
    preflight,
    lifecycleJournal: admitted.journal,
  });
}

function snapshotCollectionInput(
  input: CollectNativePegInCausalMintTransitionV3CandidateInput,
): CollectNativePegInCausalMintTransitionV3CandidateInput {
  return Object.freeze({
    rpc: input.rpc,
    codec: input.codec,
    trustAnchor: deepFreeze(structuredClone(input.trustAnchor)),
    targetNativeBlockHashHex: input.targetNativeBlockHashHex,
    ...(input.deadlineMs === undefined ? {} : { deadlineMs: input.deadlineMs }),
    ...(input.rpcConcurrency === undefined
      ? {}
      : { rpcConcurrency: input.rpcConcurrency }),
    executionIdentityStatement: deepFreeze(
      structuredClone(input.executionIdentityStatement),
    ),
    eventStatement: deepFreeze(structuredClone(input.eventStatement)),
    contractStateStatement: deepFreeze(
      structuredClone(input.contractStateStatement),
    ),
    trustedAnchorDigestHex: input.trustedAnchorDigestHex,
    evaluator: input.evaluator,
    ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
  });
}

function deriveAdmissionEventIdHex(input: {
  readonly candidateIdHex: string;
  readonly sourceProofResultIdHex: string;
  readonly validatedAtNativeHeight: string;
  readonly currentNativeHeight: string;
  readonly causalV3RequestDigestHex: string;
}): string {
  return `0x${createHash('sha256')
    .update(Buffer.from('E2S_PEG_IN_CAUSAL_F2C_FRESH_PROCESS_ADMISSION_EVENT_V1', 'utf8'))
    .update(Buffer.from([0]))
    .update(Buffer.from(JSON.stringify(input), 'utf8'))
    .digest('hex')}`;
}

function canonicalUint64(value: unknown, label: string): string {
  let parsed: bigint;
  try {
    parsed = typeof value === 'bigint' ? value : BigInt(value as string | number);
  } catch {
    throw new Error(`${label} must be an unsigned 64-bit integer`);
  }
  if (
    parsed < 0n
    || parsed > ((1n << 64n) - 1n)
    || (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0))
    || (typeof value === 'string' && value !== parsed.toString())
  ) {
    throw new Error(`${label} must be an unsigned 64-bit integer`);
  }
  return parsed.toString();
}

function assertExactKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has an unexpected field set`);
  }
}

function assertNoUnexpectedKeys(
  value: unknown,
  allowed: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const unexpected = Object.keys(value).filter(key => !allowed.includes(key));
  if (unexpected.length > 0) {
    throw new Error(`${label} has an unexpected field set`);
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
