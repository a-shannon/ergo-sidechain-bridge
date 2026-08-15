import {
  evaluateErgoSpvBranchTargetDepth,
} from './ergo-settlement-core/ergo-autolykos-v2-spv-branch.js';
import {
  decodeErgoAutolykosV2RelayRuntimeWitnessV1,
  deriveErgoAutolykosV2RelayRuntimeWitnessIdV1Hex,
  ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_MAX_BYTES,
} from './ergo-settlement-core/ergo-autolykos-v2-relay-runtime-witness-v1.js';
import {
  replayErgoAutolykosV2RelayWitnessV1,
} from './ergo-settlement-core/ergo-autolykos-v2-relay-witness-v1.js';
import {
  computeErgoHeaderId,
  serializeErgoHeaderIdentity,
} from './ergo-settlement-core/ergo-header-id.js';
import {
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';
import {
  buildFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3,
} from './frontier-ergo-autolykos-committed-vault-utxo-runtime-derived-statement-v3.js';
import {
  assertErgoUtxoStateRuntimeWitnessRetainedReplayV1Provenance,
  replayErgoUtxoStateRuntimeWitnessRetainedPacketV1,
  type ErgoUtxoStateRuntimeWitnessRetainedPacketV1,
} from './relayer-core/ergo-utxo-state-runtime-witness-retained-packet-v1.js';

export const ERGO_UTXO_STATE_RUNTIME_BRANCH_COMPOSITION_V1_SCHEMA =
  'e2s.ergo-utxo-state-runtime-branch-composition.v1' as const;
export const ERGO_UTXO_STATE_RUNTIME_BRANCH_COMPOSITION_V1_STATUS =
  'NON_AUTHORIZING_RETAINED_UTXO_SUPPLIED_BRANCH_COMPOSED' as const;
export const ERGO_UTXO_STATE_RUNTIME_BRANCH_COMPOSITION_V1_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:ergo-utxo-state-runtime-branch-composition:v1' as const;

const COMPOSITIONS = new WeakSet<object>();

export interface ErgoUtxoStateRuntimeBranchCompositionV1 {
  readonly schema: typeof ERGO_UTXO_STATE_RUNTIME_BRANCH_COMPOSITION_V1_SCHEMA;
  readonly status: typeof ERGO_UTXO_STATE_RUNTIME_BRANCH_COMPOSITION_V1_STATUS;
  readonly retainedPacket: Readonly<{
    packetDigestHex: string;
    sourceCaptureDigestHex: string;
    transactionWitnessIdHex: string;
    utxoWitnessIdHex: string;
  }>;
  readonly suppliedBranch: Readonly<{
    relayWitnessIdHex: string;
    spvProfileIdHex: string;
    checkpointHeaderIdHex: string;
    checkpointHeight: number;
    suppliedBranchCount: number;
    selectedTipHeaderIdHex: string;
    selectedTipHeight: number;
    selectedCumulativeWork: string;
    targetHeaderIdHex: string;
    targetHeight: number;
    confirmations: number;
    requiredConfirmations: number;
  }>;
  readonly runtimeStatementV3: Readonly<{
    statementIdHex: string;
    statementHex: string;
  }>;
  readonly checks: Readonly<{
    retainedPacketDigestAndWitnessesReplayed: true;
    everySuppliedBranchVerified: true;
    selectedBranchGreatestWorkAmongSupplied: true;
    exactTargetHeaderMatchedRetainedCapture: true;
    targetPolicyDepthSatisfied: true;
    runtimeStatementV3Rebuilt: true;
  }>;
  readonly authority: Readonly<{
    nodeObservationProvenancePersisted: false;
    checkpointExternallyAuthenticated: false;
    completeCompetingBranchKnowledgeEstablished: false;
    globallyCanonicalErgoConsensusAccepted: false;
    deterministicFinalityEstablished: false;
    currentUtxoMembershipEstablished: false;
    transactionExecutionValidated: false;
    runtimeAdmissionAuthorized: false;
    mintAuthorized: false;
    fundsAuthorityEstablished: false;
    gate5Closed: false;
    productionReady: false;
  }>;
  readonly limitations: readonly string[];
  readonly compositionDigestHex: string;
}

export interface BuildErgoUtxoStateRuntimeBranchCompositionV1Input {
  readonly retainedPacket: Readonly<ErgoUtxoStateRuntimeWitnessRetainedPacketV1>;
  readonly relayWitnessBytes: Uint8Array;
  readonly expectedSpvProfileIdHex: string;
}

export function buildErgoUtxoStateRuntimeBranchCompositionV1(
  value: BuildErgoUtxoStateRuntimeBranchCompositionV1Input,
): Readonly<ErgoUtxoStateRuntimeBranchCompositionV1> {
  const input = exactDataObject(value, [
    'retainedPacket',
    'relayWitnessBytes',
    'expectedSpvProfileIdHex',
  ], 'retained UTXO supplied-branch composition input');
  const retained = replayErgoUtxoStateRuntimeWitnessRetainedPacketV1(
    input.retainedPacket,
  );
  assertErgoUtxoStateRuntimeWitnessRetainedReplayV1Provenance(retained);
  const relayWitnessBytes = exactBytes(
    input.relayWitnessBytes,
    ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_MAX_BYTES,
    'relay runtime witness',
  );
  const expectedSpvProfileIdHex = exactLowerHex(
    input.expectedSpvProfileIdHex,
    32,
    'expected SPV profile ID',
  );
  const relay = decodeErgoAutolykosV2RelayRuntimeWitnessV1(
    relayWitnessBytes,
    expectedSpvProfileIdHex,
  );
  const replayedRelay = replayErgoAutolykosV2RelayWitnessV1(relay);
  const targetHeaderBytes = serializeErgoHeaderIdentity(replayedRelay.targetHeader);
  if (targetHeaderBytes.toString('hex') !== retained.packet.targetHeaderBytesHex) {
    throw new Error('supplied branch target header does not match the retained capture');
  }
  const targetHeaderId = computeErgoHeaderId(replayedRelay.targetHeader);
  const depth = evaluateErgoSpvBranchTargetDepth(
    replayedRelay.currentBranch,
    targetHeaderId,
  );
  if (!depth.included || !depth.depthSatisfied || depth.targetHeight === null) {
    throw new Error('retained target does not satisfy the supplied branch depth policy');
  }
  const selectedTip = replayedRelay.currentBranch.headers.at(-1);
  if (selectedTip === undefined) {
    throw new Error('supplied current branch has no selected tip');
  }
  const runtimeStatementV3 =
    buildFrontierErgoAutolykosCommittedVaultUtxoRuntimeStatementV3({
      relayWitnessBytes,
      expectedSpvProfileIdHex,
      transactionWitnessBytes: Buffer.from(
        retained.packet.transactionWitnessBytesHex,
        'hex',
      ),
      expectedTransactionProfile: retained.packet.expectedTransactionProfile,
      utxoWitnessBytes: Buffer.from(retained.packet.utxoWitnessBytesHex, 'hex'),
    });
  if (
    runtimeStatementV3.statement.targetHeaderIdHex !== retained.packet.targetHeaderIdHex
    || runtimeStatementV3.statement.transactionWitnessIdHex
      !== retained.packet.transactionWitnessIdHex
    || runtimeStatementV3.statement.utxoWitnessIdHex
      !== retained.packet.utxoWitnessIdHex
  ) {
    throw new Error('runtime statement V3 does not preserve retained witness identities');
  }
  const checkpointHeaderIdHex = computeErgoHeaderId(
    replayedRelay.checkpoint.header,
  ).toString('hex');
  const body = {
    schema: ERGO_UTXO_STATE_RUNTIME_BRANCH_COMPOSITION_V1_SCHEMA,
    status: ERGO_UTXO_STATE_RUNTIME_BRANCH_COMPOSITION_V1_STATUS,
    retainedPacket: {
      packetDigestHex: retained.packet.packetDigestHex,
      sourceCaptureDigestHex: retained.packet.sourceCaptureDigestHex,
      transactionWitnessIdHex: retained.packet.transactionWitnessIdHex,
      utxoWitnessIdHex: retained.packet.utxoWitnessIdHex,
    },
    suppliedBranch: {
      relayWitnessIdHex: deriveErgoAutolykosV2RelayRuntimeWitnessIdV1Hex(
        relayWitnessBytes,
        expectedSpvProfileIdHex,
      ),
      spvProfileIdHex: expectedSpvProfileIdHex,
      checkpointHeaderIdHex,
      checkpointHeight: replayedRelay.checkpoint.header.height,
      suppliedBranchCount: 1 + replayedRelay.competingBranches.length,
      selectedTipHeaderIdHex: selectedTip.headerId.toString('hex'),
      selectedTipHeight: selectedTip.header.height,
      selectedCumulativeWork: replayedRelay.currentBranch.cumulativeWork.toString(),
      targetHeaderIdHex: targetHeaderId.toString('hex'),
      targetHeight: depth.targetHeight,
      confirmations: depth.confirmations,
      requiredConfirmations: replayedRelay.profile.requiredConfirmations,
    },
    runtimeStatementV3: {
      statementIdHex: runtimeStatementV3.statementIdHex,
      statementHex: runtimeStatementV3.statementHex,
    },
    checks: {
      retainedPacketDigestAndWitnessesReplayed: true as const,
      everySuppliedBranchVerified: true as const,
      selectedBranchGreatestWorkAmongSupplied: true as const,
      exactTargetHeaderMatchedRetainedCapture: true as const,
      targetPolicyDepthSatisfied: true as const,
      runtimeStatementV3Rebuilt: true as const,
    },
    authority: {
      nodeObservationProvenancePersisted: false as const,
      checkpointExternallyAuthenticated: false as const,
      completeCompetingBranchKnowledgeEstablished: false as const,
      globallyCanonicalErgoConsensusAccepted: false as const,
      deterministicFinalityEstablished: false as const,
      currentUtxoMembershipEstablished: false as const,
      transactionExecutionValidated: false as const,
      runtimeAdmissionAuthorized: false as const,
      mintAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
    },
    limitations: [
      'The retained packet replays cryptographic bytes; it does not preserve process-local node-adapter provenance.',
      'The checkpoint is supplied by the SPV profile and is not externally authenticated by this composition.',
      'Greatest-work selection covers every supplied branch, not every branch that may exist on the Ergo network.',
      'A depth threshold is policy evidence, not deterministic finality or globally canonical consensus.',
      'No runtime, daemon, mint, signer, submitter, broadcaster, funds route, Gate 5, trustless, or readiness authority consumes this result.',
    ] as const,
  };
  const composition = deepFreeze({
    ...body,
    compositionDigestHex: sha256CanonicalJson(
      body,
      ERGO_UTXO_STATE_RUNTIME_BRANCH_COMPOSITION_V1_DIGEST_DOMAIN,
    ),
  });
  COMPOSITIONS.add(composition);
  return composition;
}

export function assertErgoUtxoStateRuntimeBranchCompositionV1Provenance(
  value: unknown,
): asserts value is Readonly<ErgoUtxoStateRuntimeBranchCompositionV1> {
  if (typeof value !== 'object' || value === null || !COMPOSITIONS.has(value)) {
    throw new Error('retained UTXO supplied-branch composition lacks process provenance');
  }
}

function exactDataObject(
  value: unknown,
  fields: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain data object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const symbolKeys = Object.getOwnPropertySymbols(value);
  const actualKeys = Object.getOwnPropertyNames(descriptors).sort();
  const expectedKeys = [...fields].sort();
  if (
    symbolKeys.length !== 0
    || actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(`${label} must contain exactly ${fields.join(', ')}`);
  }
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const descriptor = descriptors[field]!;
    if (!('value' in descriptor) || descriptor.enumerable !== true) {
      throw new Error(`${label}.${field} must be an enumerable data property`);
    }
    result[field] = descriptor.value;
  }
  return result;
}

function exactBytes(value: unknown, maximum: number, label: string): Buffer {
  if (!(value instanceof Uint8Array)) throw new Error(`${label} must be bytes`);
  const bytes = Buffer.from(value);
  if (bytes.length === 0 || bytes.length > maximum) {
    throw new Error(`${label} length is outside its bound`);
  }
  return bytes;
}

function exactLowerHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || value.length !== bytes * 2
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be canonical ${bytes}-byte lowercase hexadecimal`);
  }
  return value;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (typeof value !== 'object' || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}
