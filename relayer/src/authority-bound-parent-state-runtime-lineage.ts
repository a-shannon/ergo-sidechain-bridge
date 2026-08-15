import { createHash } from 'node:crypto';

import {
  assertAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluatorProvenance,
  assertAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateFromEvaluatorProvenance,
  type AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2Candidate,
  type AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator,
} from './authority-bound-native-finalized-peg-in-runtime-identity-v2.js';
import {
  collectNativeFinalizedPegInRuntimeIdentityV2Candidate,
  type CollectedNativePegInRuntimeIdentityV2Candidate,
} from './native-checkpoint-proof-collector.js';
import type { NativeFinalizedBridgeCheckpointRequest } from './native-finalized-bridge-checkpoint.js';
import {
  deriveNativeFinalizedPegInRuntimeIdentityV2RequestDigestHex,
  deriveNativeFinalizedPegInRuntimeIdentityV2TargetHeaderIdentity,
  normalizeNativeFinalizedPegInRuntimeIdentityV2Request,
  type NativeFinalizedPegInRuntimeIdentityV2Request,
} from './native-finalized-peg-in-runtime-identity-v2.js';
import type { NativeSubstrateRpcProofCodec } from './native-substrate-rpc-proof-codec.js';
import {
  assertPegInRuntimeRecordMatchesProfileGenerationV1,
  decodePegInRuntimeProfileV1ScaleHex,
  decodePegInRuntimeRecordV1ScaleHex,
  encodePegInRuntimeProfileV1ScaleHex,
} from './peg-in-runtime-state.js';
import {
  PEG_IN_RUNTIME_IDENTITY_STATEMENT_V2_SCHEMA,
  SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
  normalizePegInRuntimeIdentityStatementV2,
  type PegInRuntimeCodeIdentityV2,
  type PegInRuntimeIdentityStatementV2,
} from './peg-in-runtime-identity-v2.js';
import type { ReadOnlySubstrateFinalityRpc } from './substrate-finality-provider.js';

export const AUTHORITY_BOUND_PARENT_STATE_RUNTIME_LINEAGE_SCHEMA =
  'e2s.authority-bound-parent-state-runtime-lineage-expectation-candidate.v2' as const;
export const AUTHORITY_BOUND_PARENT_STATE_RUNTIME_LINEAGE_STATUS =
  'BOUND_QUARANTINED_PARENT_TARGET_RUNTIME_EXPECTATION_CANDIDATE' as const;
export const COLLECTED_PARENT_STATE_RUNTIME_LINEAGE_SCHEMA =
  'e2s.collected-parent-state-runtime-lineage-expectation-candidate.v2' as const;

const LINEAGE_DIGEST_DOMAIN = Buffer.from(
  'E2S_AUTHORITY_BOUND_PARENT_STATE_RUNTIME_LINEAGE_V2\0',
  'utf8',
);

declare const PARENT_STATE_LINEAGE_BRAND: unique symbol;
declare const COLLECTED_PARENT_STATE_LINEAGE_BRAND: unique symbol;

export interface AuthorityBoundParentStateRuntimeLineagePayload {
  readonly schema: typeof AUTHORITY_BOUND_PARENT_STATE_RUNTIME_LINEAGE_SCHEMA;
  readonly status: typeof AUTHORITY_BOUND_PARENT_STATE_RUNTIME_LINEAGE_STATUS;
  readonly lineageDigestHex: string;
  readonly trustAnchorDigestHex: string;
  readonly sidechainIdHex: string;
  readonly ergoBoxIdHex: string;
  readonly parentState: RuntimeLineageStateExpectation & {
    readonly recordOutcome: 'NON_MEMBERSHIP';
    readonly expectedProfileScaleHex: string;
  };
  readonly executionState: RuntimeLineageStateExpectation & {
    readonly executionBlockHashHex: string;
    readonly parentHashHex: string;
    readonly recordOutcome: 'MEMBERSHIP';
    readonly recordStorageValueScaleHex: string;
    readonly recordTransactionHashHex: string;
    readonly recordEventIndex: number;
  };
  readonly expectedProducerRuntime: PegInRuntimeCodeIdentityV2;
  readonly runtimeCodeExpectationChangedInExecutionBlock: boolean;
  readonly boundary: {
    readonly exactParentTargetRequestBindingChecked: true;
    readonly expectedProducerRuntimeSelectedFromParentRequest: true;
    readonly recordExecutionIdentityDecoded: true;
    readonly recordNativeHeightBindingChecked: true;
    readonly executionBlockHashMappedToNativeState: false;
    readonly childOutputContentExposed: false;
    readonly childProofClaimsAccepted: false;
    readonly launcherInstallationActivationCampaignCompleted: false;
    readonly sidechainFinalityVerified: false;
    readonly parentStateRuntimeCodeStateProofVerified: false;
    readonly executionStateRuntimeCodeStateProofVerified: false;
    readonly runtimeUpgradeHistoryVerified: false;
    readonly historicalMintAbsenceVerified: false;
    readonly cutoverPolicyVerified: false;
    readonly committedVaultTransitionVerified: false;
    readonly mintAuthorized: false;
    readonly transactionMutationEnabled: false;
    readonly gate5Closed: false;
    readonly productionReady: false;
  };
}

export type AuthorityBoundParentStateRuntimeLineage =
  AuthorityBoundParentStateRuntimeLineagePayload & {
    readonly [PARENT_STATE_LINEAGE_BRAND]: true;
  };

interface RuntimeLineageStateExpectation {
  readonly nativeBlockHashHex: string;
  readonly nativeHeight: string;
  readonly stateRootHex: string;
  readonly requestDigestHex: string;
  readonly quarantinedChildOutputSha256Hex: string;
  readonly expectedRuntimeCode: PegInRuntimeCodeIdentityV2;
}

export interface AuthorityBoundRuntimeStateCandidateInput {
  readonly request: NativeFinalizedPegInRuntimeIdentityV2Request;
  readonly evaluator:
    AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator;
  readonly candidate:
    AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2Candidate;
}

export interface CollectAuthorityBoundParentStateRuntimeLineageInput {
  readonly rpc: ReadOnlySubstrateFinalityRpc;
  readonly codec: NativeSubstrateRpcProofCodec;
  readonly trustAnchor: NativeFinalizedBridgeCheckpointRequest['trustAnchor'];
  readonly trustedAnchorDigestHex: string;
  readonly executionTargetNativeBlockHashHex: string;
  readonly expectedExecutionBlockHashHex: string;
  readonly executionStatement: PegInRuntimeIdentityStatementV2;
  readonly parentEvaluator:
    AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator;
  readonly executionEvaluator:
    AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator;
  readonly deadlineMs?: number;
  readonly rpcConcurrency?: number;
  readonly maxAttempts?: number;
}

export interface CollectedAuthorityBoundParentStateRuntimeLineagePayload {
  readonly schema: typeof COLLECTED_PARENT_STATE_RUNTIME_LINEAGE_SCHEMA;
  readonly parent: CollectedNativePegInRuntimeIdentityV2Candidate;
  readonly execution: CollectedNativePegInRuntimeIdentityV2Candidate;
  readonly lineage: AuthorityBoundParentStateRuntimeLineage;
}

export type CollectedAuthorityBoundParentStateRuntimeLineage =
  CollectedAuthorityBoundParentStateRuntimeLineagePayload & {
    readonly [COLLECTED_PARENT_STATE_LINEAGE_BRAND]: true;
  };

const AUTHORITY_BOUND_PARENT_STATE_LINEAGES = new WeakSet<object>();
const COLLECTED_PARENT_STATE_LINEAGES = new WeakSet<object>();

export function createAuthorityBoundParentStateRuntimeLineage(input: {
  readonly parent: AuthorityBoundRuntimeStateCandidateInput;
  readonly execution: AuthorityBoundRuntimeStateCandidateInput;
}): AuthorityBoundParentStateRuntimeLineage {
  const parentRequest =
    normalizeNativeFinalizedPegInRuntimeIdentityV2Request(
      input?.parent?.request,
    );
  const executionRequest =
    normalizeNativeFinalizedPegInRuntimeIdentityV2Request(
      input?.execution?.request,
    );
  const parentRequestDigestHex =
    deriveNativeFinalizedPegInRuntimeIdentityV2RequestDigestHex(parentRequest);
  const executionRequestDigestHex =
    deriveNativeFinalizedPegInRuntimeIdentityV2RequestDigestHex(
      executionRequest,
    );
  assertAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateFromEvaluatorProvenance({
    evaluator: input?.parent?.evaluator,
    candidate: input?.parent?.candidate,
    expectedRequestDigestHex: parentRequestDigestHex,
  });
  assertAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateFromEvaluatorProvenance({
    evaluator: input?.execution?.evaluator,
    candidate: input?.execution?.candidate,
    expectedRequestDigestHex: executionRequestDigestHex,
  });

  const parentStatement = parentRequest.statement;
  const executionStatement = executionRequest.statement;
  if (
    parentStatement.record.outcome !== 'nonMembership'
    || !('expectedProfileScaleHex' in parentStatement)
  ) {
    throw new Error(
      'parent-state runtime lineage requires peg-in record non-membership',
    );
  }
  if (
    executionStatement.record.outcome !== 'membership'
    || !('expectedRecordScaleHex' in executionStatement.record)
  ) {
    throw new Error(
      'execution-state runtime lineage requires peg-in record membership',
    );
  }
  assertSameTrustAnchor(parentRequest, executionRequest);
  if (
    parentStatement.ergoBoxIdHex
    !== executionStatement.ergoBoxIdHex
  ) {
    throw new Error(
      'parent and execution runtime lineage requests bind different Ergo deposits',
    );
  }
  if (
    input.parent.candidate.trustAnchorDigestHex
    !== input.execution.candidate.trustAnchorDigestHex
  ) {
    throw new Error(
      'parent and execution runtime lineage candidates bind different trust anchors',
    );
  }

  const parentHeader =
    deriveNativeFinalizedPegInRuntimeIdentityV2TargetHeaderIdentity(
      parentRequest.targetHeaderScaleHex,
    );
  const executionHeader =
    deriveNativeFinalizedPegInRuntimeIdentityV2TargetHeaderIdentity(
      executionRequest.targetHeaderScaleHex,
    );
  if (
    parentHeader.nativeBlockHashHex
      !== parentRequest.targetNativeBlockHashHex
    || executionHeader.nativeBlockHashHex
      !== executionRequest.targetNativeBlockHashHex
  ) {
    throw new Error(
      'parent-state runtime lineage request header hash binding changed',
    );
  }
  if (executionHeader.parentHashHex !== parentHeader.nativeBlockHashHex) {
    throw new Error(
      'execution runtime lineage header does not directly descend from the parent request',
    );
  }
  if (
    BigInt(executionHeader.nativeHeight)
    !== BigInt(parentHeader.nativeHeight) + 1n
  ) {
    throw new Error(
      'parent and execution runtime lineage heights are not consecutive',
    );
  }

  const record = decodePegInRuntimeRecordV1ScaleHex(
    executionStatement.record.expectedRecordScaleHex,
  );
  const profile = decodePegInRuntimeProfileV1ScaleHex(
    parentStatement.expectedProfileScaleHex,
  );
  assertPegInRuntimeRecordMatchesProfileGenerationV1(record, profile);
  if (
    record.sidechainIdHex !== executionRequest.trustAnchor.sidechainIdHex
    || record.ergoBoxIdHex !== executionStatement.ergoBoxIdHex
  ) {
    throw new Error(
      'execution record identity does not match the runtime lineage request',
    );
  }
  if (
    BigInt(record.sidechainHeight) !== BigInt(executionHeader.nativeHeight)
  ) {
    throw new Error(
      'execution record height does not bind the exact native execution state height',
    );
  }

  const parentRuntime = parentStatement.runtimeCode;
  const executionRuntime = executionStatement.runtimeCode;
  if (
    parentRuntime.artifactSha256Hex
      === executionRuntime.artifactSha256Hex
    && parentRuntime.artifactSizeBytes
      !== executionRuntime.artifactSizeBytes
  ) {
    throw new Error(
      'identical runtime code digests cannot bind different artifact sizes',
    );
  }
  const runtimeCodeExpectationChangedInExecutionBlock =
    parentRuntime.artifactSha256Hex
    !== executionRuntime.artifactSha256Hex;
  const digestBody = {
    trustAnchorDigestHex: input.parent.candidate.trustAnchorDigestHex,
    sidechainIdHex: executionRequest.trustAnchor.sidechainIdHex,
    ergoBoxIdHex: executionStatement.ergoBoxIdHex,
    parentState: {
      nativeBlockHashHex: parentHeader.nativeBlockHashHex,
      nativeHeight: parentHeader.nativeHeight,
      stateRootHex: parentHeader.stateRootHex,
      requestDigestHex: parentRequestDigestHex,
      quarantinedChildOutputSha256Hex:
        input.parent.candidate.quarantinedChildOutput.sha256Hex,
      expectedRuntimeCode: parentRuntime,
      recordOutcome: 'NON_MEMBERSHIP' as const,
      expectedProfileScaleHex:
        parentStatement.expectedProfileScaleHex,
    },
    executionState: {
      nativeBlockHashHex: executionHeader.nativeBlockHashHex,
      executionBlockHashHex: record.executionBlockHashHex,
      parentHashHex: executionHeader.parentHashHex,
      nativeHeight: executionHeader.nativeHeight,
      stateRootHex: executionHeader.stateRootHex,
      requestDigestHex: executionRequestDigestHex,
      quarantinedChildOutputSha256Hex:
        input.execution.candidate.quarantinedChildOutput.sha256Hex,
      expectedRuntimeCode: executionRuntime,
      recordOutcome: 'MEMBERSHIP' as const,
      recordStorageValueScaleHex:
        executionStatement.record.expectedRecordScaleHex,
      recordTransactionHashHex: String(record.transactionHashHex),
      recordEventIndex: record.eventIndex,
    },
    expectedProducerRuntime: parentRuntime,
    runtimeCodeExpectationChangedInExecutionBlock,
  };
  const boundary = {
    exactParentTargetRequestBindingChecked: true as const,
    expectedProducerRuntimeSelectedFromParentRequest: true as const,
    recordExecutionIdentityDecoded: true as const,
    recordNativeHeightBindingChecked: true as const,
    executionBlockHashMappedToNativeState: false as const,
    childOutputContentExposed: false as const,
    childProofClaimsAccepted: false as const,
    launcherInstallationActivationCampaignCompleted: false as const,
    sidechainFinalityVerified: false as const,
    parentStateRuntimeCodeStateProofVerified: false as const,
    executionStateRuntimeCodeStateProofVerified: false as const,
    runtimeUpgradeHistoryVerified: false as const,
    historicalMintAbsenceVerified: false as const,
    cutoverPolicyVerified: false as const,
    committedVaultTransitionVerified: false as const,
    mintAuthorized: false as const,
    transactionMutationEnabled: false as const,
    gate5Closed: false as const,
    productionReady: false as const,
  };
  const lineage = deepFreeze({
    schema: AUTHORITY_BOUND_PARENT_STATE_RUNTIME_LINEAGE_SCHEMA,
    status: AUTHORITY_BOUND_PARENT_STATE_RUNTIME_LINEAGE_STATUS,
    lineageDigestHex: sha256Digest(digestBody),
    ...digestBody,
    boundary,
  }) as AuthorityBoundParentStateRuntimeLineage;
  AUTHORITY_BOUND_PARENT_STATE_LINEAGES.add(lineage);
  return lineage;
}

export async function collectAuthorityBoundParentStateRuntimeLineage(
  input: CollectAuthorityBoundParentStateRuntimeLineageInput,
): Promise<CollectedAuthorityBoundParentStateRuntimeLineage> {
  const snapshot = snapshotParentStateRuntimeLineageCollectionInput(input);
  assertAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluatorProvenance(
    snapshot.parentEvaluator,
  );
  assertAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluatorProvenance(
    snapshot.executionEvaluator,
  );
  const executionStatement = snapshot.executionStatement;
  if (executionStatement.record.outcome !== 'membership') {
    throw new Error(
      'parent-state runtime lineage collection requires an execution membership statement',
    );
  }
  const executionRecord = decodePegInRuntimeRecordV1ScaleHex(
    executionStatement.record.expectedRecordScaleHex,
  );
  if (
    executionRecord.executionBlockHashHex
    !== snapshot.expectedExecutionBlockHashHex
  ) {
    throw new Error(
      'runtime lineage execution statement does not bind the expected EVM execution block',
    );
  }

  const execution =
    await collectNativeFinalizedPegInRuntimeIdentityV2Candidate({
      rpc: snapshot.rpc,
      codec: snapshot.codec,
      trustAnchor: snapshot.trustAnchor,
      trustedAnchorDigestHex: snapshot.trustedAnchorDigestHex,
      targetNativeBlockHashHex: snapshot.executionTargetNativeBlockHashHex,
      statement: executionStatement,
      evaluator: snapshot.executionEvaluator,
      deadlineMs: snapshot.deadlineMs,
      rpcConcurrency: snapshot.rpcConcurrency,
      maxAttempts: snapshot.maxAttempts,
    });
  const executionHeader =
    deriveNativeFinalizedPegInRuntimeIdentityV2TargetHeaderIdentity(
      execution.collection.request.targetHeaderScaleHex,
    );
  if (
    executionHeader.nativeBlockHashHex
      !== execution.collection.request.targetNativeBlockHashHex
    || executionHeader.nativeBlockHashHex
      !== snapshot.executionTargetNativeBlockHashHex
    || BigInt(executionRecord.sidechainHeight)
      !== BigInt(executionHeader.nativeHeight)
  ) {
    throw new Error(
      'runtime lineage collected native execution identity or record height differs from the snapshotted target',
    );
  }

  const parentStatement: PegInRuntimeIdentityStatementV2 = {
    schema: PEG_IN_RUNTIME_IDENTITY_STATEMENT_V2_SCHEMA,
    ergoBoxIdHex: executionStatement.ergoBoxIdHex,
    expectedProfileScaleHex: encodePegInRuntimeProfileV1ScaleHex({
      formatVersion: 1,
      sidechainIdHex: String(executionRecord.sidechainIdHex),
      bridgeAddress: String(executionRecord.bridgeAddress),
      profileRevision: executionRecord.profileRevision,
      activationHeight: executionRecord.profileActivationHeight,
    }),
    record: {
      outcome: 'nonMembership',
    },
    runtimeCode:
      expectedRuntimeCodeIdentityFromEvaluator(snapshot.parentEvaluator),
  };
  const parent =
    await collectNativeFinalizedPegInRuntimeIdentityV2Candidate({
      rpc: snapshot.rpc,
      codec: snapshot.codec,
      trustAnchor: snapshot.trustAnchor,
      trustedAnchorDigestHex: snapshot.trustedAnchorDigestHex,
      targetNativeBlockHashHex: executionHeader.parentHashHex,
      statement: parentStatement,
      evaluator: snapshot.parentEvaluator,
      deadlineMs: snapshot.deadlineMs,
      rpcConcurrency: snapshot.rpcConcurrency,
      maxAttempts: snapshot.maxAttempts,
    });
  const lineage = createAuthorityBoundParentStateRuntimeLineage({
    parent: {
      request: parent.collection.request,
      evaluator: snapshot.parentEvaluator,
      candidate: parent.candidate,
    },
    execution: {
      request: execution.collection.request,
      evaluator: snapshot.executionEvaluator,
      candidate: execution.candidate,
    },
  });

  const collected = deepFreeze({
    schema: COLLECTED_PARENT_STATE_RUNTIME_LINEAGE_SCHEMA,
    parent,
    execution,
    lineage,
  }) as CollectedAuthorityBoundParentStateRuntimeLineage;
  COLLECTED_PARENT_STATE_LINEAGES.add(collected);
  return collected;
}

function snapshotParentStateRuntimeLineageCollectionInput(
  input: CollectAuthorityBoundParentStateRuntimeLineageInput,
) {
  if (!input || typeof input !== 'object') {
    throw new Error('parent-state runtime lineage collection input is missing');
  }
  const trustAnchor = Object.freeze({
    sidechainIdHex: fixedPrefixedHex(
      input.trustAnchor?.sidechainIdHex,
      32,
      'runtime lineage sidechain ID',
    ),
    checkpointHashHex: fixedPrefixedHex(
      input.trustAnchor?.checkpointHashHex,
      32,
      'runtime lineage checkpoint hash',
    ),
    checkpointNumber: canonicalUnsignedDecimal(
      input.trustAnchor?.checkpointNumber,
      'runtime lineage checkpoint number',
    ),
    grandpaSetId: canonicalUnsignedDecimal(
      input.trustAnchor?.grandpaSetId,
      'runtime lineage GRANDPA set ID',
    ),
    authorityListScaleHex: variablePrefixedHex(
      input.trustAnchor?.authorityListScaleHex,
      'runtime lineage authority list',
    ),
  });
  const executionStatement = deepFreeze(
    normalizePegInRuntimeIdentityStatementV2(
      input.executionStatement,
      trustAnchor.sidechainIdHex,
    ),
  );
  return Object.freeze({
    rpc: input.rpc,
    codec: input.codec,
    trustAnchor,
    trustedAnchorDigestHex: fixedPrefixedHex(
      input.trustedAnchorDigestHex,
      32,
      'runtime lineage trusted anchor digest',
    ),
    executionTargetNativeBlockHashHex: fixedPrefixedHex(
      input.executionTargetNativeBlockHashHex,
      32,
      'runtime lineage native execution target',
    ),
    expectedExecutionBlockHashHex: fixedPrefixedHex(
      input.expectedExecutionBlockHashHex,
      32,
      'runtime lineage EVM execution target',
    ),
    executionStatement,
    parentEvaluator: input.parentEvaluator,
    executionEvaluator: input.executionEvaluator,
    deadlineMs: input.deadlineMs,
    rpcConcurrency: input.rpcConcurrency,
    maxAttempts: input.maxAttempts,
  });
}

export function assertAuthorityBoundParentStateRuntimeLineageProvenance(
  value: unknown,
): asserts value is AuthorityBoundParentStateRuntimeLineage {
  if (
    !value
    || typeof value !== 'object'
    || !AUTHORITY_BOUND_PARENT_STATE_LINEAGES.has(value)
  ) {
    throw new Error(
      'authority-bound parent-state runtime lineage provenance is missing',
    );
  }
}

export function assertCollectedAuthorityBoundParentStateRuntimeLineageProvenance(
  value: unknown,
): asserts value is CollectedAuthorityBoundParentStateRuntimeLineage {
  if (
    !value
    || typeof value !== 'object'
    || !COLLECTED_PARENT_STATE_LINEAGES.has(value)
  ) {
    throw new Error(
      'collected parent-state runtime lineage provenance is missing',
    );
  }
}

function expectedRuntimeCodeIdentityFromEvaluator(
  evaluator:
    AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator,
): PegInRuntimeCodeIdentityV2 {
  return {
    storageKeyHex: SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
    artifactSha256Hex: evaluator.runtimeCodeSha256Hex,
    artifactSizeBytes: evaluator.runtimeCodeSizeBytes,
    buildAttestationId: evaluator.runtimeBuildAttestationId,
    buildAttestationSha256Hex:
      evaluator.runtimeBuildPacketSha256Hex,
  };
}

function assertSameTrustAnchor(
  parentRequest: NativeFinalizedPegInRuntimeIdentityV2Request,
  executionRequest: NativeFinalizedPegInRuntimeIdentityV2Request,
): void {
  const parent = parentRequest.trustAnchor;
  const execution = executionRequest.trustAnchor;
  if (
    parent.sidechainIdHex !== execution.sidechainIdHex
    || parent.checkpointHashHex !== execution.checkpointHashHex
    || parent.checkpointNumber !== execution.checkpointNumber
    || parent.grandpaSetId !== execution.grandpaSetId
    || parent.authorityListScaleHex !== execution.authorityListScaleHex
  ) {
    throw new Error(
      'parent and execution runtime lineage requests bind different trust anchors',
    );
  }
}

function sha256Digest(value: unknown): string {
  return `0x${createHash('sha256')
    .update(LINEAGE_DIGEST_DOMAIN)
    .update(Buffer.from(JSON.stringify(value), 'utf8'))
    .digest('hex')}`;
}

function fixedPrefixedHex(
  value: unknown,
  bytes: number,
  label: string,
): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be exactly ${bytes} lowercase bytes`);
  }
  return value;
}

function variablePrefixedHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || !/^0x(?:[0-9a-f]{2})+$/.test(value)
  ) {
    throw new Error(`${label} must be non-empty lowercase bytes`);
  }
  return value;
}

function canonicalUnsignedDecimal(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical unsigned decimal string`);
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}
