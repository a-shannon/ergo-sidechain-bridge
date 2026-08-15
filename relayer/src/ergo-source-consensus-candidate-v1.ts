import {
  assertErgoBlockTransactionCommitmentVerificationProvenance,
  type ErgoBlockTransactionCommitmentVerification,
} from './adapters/ergo-block-transaction-commitment.js';
import {
  evaluateErgoSpvBranchTargetDepth,
  selectHeavierErgoAutolykosV2Branch,
  type VerifiedErgoAutolykosV2Branch,
} from './ergo-settlement-core/ergo-autolykos-v2-spv-branch.js';
import {
  computeErgoHeaderId,
  serializeErgoHeaderIdentity,
  type ErgoHeaderIdentityFields,
} from './ergo-settlement-core/ergo-header-id.js';
import {
  sha256CanonicalJson,
} from './strict-json.js';

export const ERGO_SOURCE_CONSENSUS_CANDIDATE_V1_SCHEMA =
  'e2s.ergo-source-consensus-candidate.v1' as const;
export const ERGO_SOURCE_CONSENSUS_CANDIDATE_V1_STATUS =
  'non_authorizing_candidate' as const;
export const ERGO_SOURCE_CONSENSUS_CANDIDATE_V1_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:ergo-source-consensus-candidate:v1' as const;
export const ERGO_SOURCE_CONSENSUS_WP01C_VERIFICATION_V1_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:ergo-source-consensus-wp01c-verification:v1' as const;

const MAX_COMPETING_BRANCHES = 31;
const CANDIDATES = new WeakSet<object>();

interface KnownBranchIdentityV1 {
  readonly role: 'current' | 'competing';
  readonly tipHeaderIdHex: string;
  readonly tipHeight: number;
  readonly cumulativeWork: string;
}

export interface ErgoSourceConsensusCandidateV1 {
  readonly schema: typeof ERGO_SOURCE_CONSENSUS_CANDIDATE_V1_SCHEMA;
  readonly status: typeof ERGO_SOURCE_CONSENSUS_CANDIDATE_V1_STATUS;
  readonly branchSet: Readonly<{
    profileIdHex: string;
    sourceNetworkIdHex: string;
    checkpointHeaderIdHex: string;
    checkpointHeight: number;
    knownBranches: readonly Readonly<KnownBranchIdentityV1>[];
    knownBranchesDigestHex: string;
    selectedTipHeaderIdHex: string;
    selectedTipHeight: number;
    selectedCumulativeWork: string;
  }>;
  readonly targetHeader: Readonly<{
    headerIdHex: string;
    height: number;
    blockVersion: number;
    transactionsRootHex: string;
    canonicalHeaderBytesHex: string;
    confirmations: number;
    requiredConfirmations: number;
  }>;
  readonly transaction: Readonly<{
    wp01cVerificationDigestHex: string;
    commitmentTxIdHex: string;
    transactionSigmaDigestHex: string;
    transactionIndex: number;
    transactionCount: number;
  }>;
  readonly checks: Readonly<{
    everyKnownBranchProcessVerified: true;
    strictlyGreaterWorkSelectionApplied: true;
    exactTargetHeaderInSelectedBranch: true;
    targetPolicyDepthSatisfied: true;
    staticWp01cVerificationProvenanceBound: true;
    wp01cVerificationMatchesExactTargetHeader: true;
  }>;
  readonly authority: Readonly<{
    checkpointExternallyAuthenticated: false;
    completeCompetingBranchKnowledgeEstablished: false;
    globallyCanonicalErgoConsensusAccepted: false;
    deterministicFinalityEstablished: false;
    jvmPostEip37DifferentialComplete: false;
    runtimeRelayStateAuthenticated: false;
    depositSourceAndVaultLifecycleAuthenticated: false;
    persistedReceiptAcceptedAsAuthority: false;
    mintAuthorized: false;
    daemonAdmissionAuthorized: false;
    signingAuthorized: false;
    submissionAuthorized: false;
    broadcastAuthorized: false;
    fundsAuthorityEstablished: false;
    gate5Closed: false;
    productionReady: false;
  }>;
  readonly limitations: readonly string[];
  readonly candidateDigestHex: string;
}

export interface BuildErgoSourceConsensusCandidateV1Input {
  readonly currentBranch: VerifiedErgoAutolykosV2Branch;
  readonly competingBranches: readonly VerifiedErgoAutolykosV2Branch[];
  readonly targetHeader: ErgoHeaderIdentityFields;
  readonly staticCommitmentVerification:
    Readonly<ErgoBlockTransactionCommitmentVerification>;
}

/**
 * Joins locally known Autolykos branch work to one static WP-01C transaction
 * verification. The output is evidence only and cannot authorize mint.
 */
export function buildErgoSourceConsensusCandidateV1(
  input: BuildErgoSourceConsensusCandidateV1Input,
): Readonly<ErgoSourceConsensusCandidateV1> {
  const snapshot = snapshotExactDataObject(input, [
    'currentBranch',
    'competingBranches',
    'targetHeader',
    'staticCommitmentVerification',
  ], 'Ergo source-consensus candidate input');
  const currentBranch = snapshot.currentBranch as
    VerifiedErgoAutolykosV2Branch;
  const competingBranches = snapshotDenseDataArray(
    snapshot.competingBranches,
    MAX_COMPETING_BRANCHES,
    'Ergo competing branches',
  ) as VerifiedErgoAutolykosV2Branch[];
  const targetHeader = snapshotHeader(snapshot.targetHeader);
  const staticCommitmentVerification =
    snapshot.staticCommitmentVerification as
      Readonly<ErgoBlockTransactionCommitmentVerification>;
  assertErgoBlockTransactionCommitmentVerificationProvenance(
    staticCommitmentVerification,
  );

  let selected = selectHeavierErgoAutolykosV2Branch(
    currentBranch,
    currentBranch,
  );
  const knownBranches: KnownBranchIdentityV1[] = [];
  const seenTips = new Set<string>();
  const addBranch = (
    branch: VerifiedErgoAutolykosV2Branch,
    role: KnownBranchIdentityV1['role'],
  ): void => {
    selected = selectHeavierErgoAutolykosV2Branch(selected, branch);
    const tip = branch.headers.at(-1);
    if (tip === undefined) {
      throw new Error('verified Ergo SPV branch has no suffix tip');
    }
    const tipHeaderIdHex = tip.headerId.toString('hex');
    if (seenTips.has(tipHeaderIdHex)) {
      throw new Error('Ergo known branch set contains a duplicate tip');
    }
    seenTips.add(tipHeaderIdHex);
    knownBranches.push({
      role,
      tipHeaderIdHex,
      tipHeight: tip.header.height,
      cumulativeWork: branch.cumulativeWork.toString(),
    });
  };
  addBranch(currentBranch, 'current');
  for (const branch of competingBranches) {
    addBranch(branch, 'competing');
  }

  const targetHeaderBytes = serializeErgoHeaderIdentity(targetHeader);
  const targetHeaderId = computeErgoHeaderId(targetHeader);
  const targetHeaderIdHex = targetHeaderId.toString('hex');
  const selectedTarget = selected.headers.find(
    header => header.headerId.equals(targetHeaderId),
  );
  if (
    selectedTarget === undefined
    || !serializeErgoHeaderIdentity(selectedTarget.header).equals(
      targetHeaderBytes,
    )
  ) {
    throw new Error(
      'exact target header is not present in the selected known Ergo branch',
    );
  }
  const depth = evaluateErgoSpvBranchTargetDepth(selected, targetHeaderId);
  if (!depth.included || !depth.depthSatisfied || depth.targetHeight === null) {
    throw new Error('target header does not satisfy the selected branch depth policy');
  }

  const verification = staticCommitmentVerification;
  const transactionsRootHex = Buffer.from(
    targetHeader.transactionsRoot,
  ).toString('hex');
  if (
    verification.headerIdHex !== targetHeaderIdHex
    || verification.height !== targetHeader.height
    || verification.blockVersion !== targetHeader.version
    || verification.transactionsRootHex !== transactionsRootHex
  ) {
    throw new Error(
      'static WP-01C verification does not match the exact selected target header',
    );
  }

  const selectedTip = selected.headers.at(-1)!;
  const body = {
    schema: ERGO_SOURCE_CONSENSUS_CANDIDATE_V1_SCHEMA,
    status: ERGO_SOURCE_CONSENSUS_CANDIDATE_V1_STATUS,
    branchSet: {
      profileIdHex: selected.profileId.toString('hex'),
      sourceNetworkIdHex: selected.sourceNetworkId.toString('hex'),
      checkpointHeaderIdHex: selected.checkpointHeaderId.toString('hex'),
      checkpointHeight: selected.checkpointHeight,
      knownBranches,
      knownBranchesDigestHex: sha256CanonicalJson(knownBranches),
      selectedTipHeaderIdHex: selectedTip.headerId.toString('hex'),
      selectedTipHeight: selectedTip.header.height,
      selectedCumulativeWork: selected.cumulativeWork.toString(),
    },
    targetHeader: {
      headerIdHex: targetHeaderIdHex,
      height: depth.targetHeight,
      blockVersion: targetHeader.version,
      transactionsRootHex,
      canonicalHeaderBytesHex: targetHeaderBytes.toString('hex'),
      confirmations: depth.confirmations,
      requiredConfirmations: selected.requiredConfirmations,
    },
    transaction: {
      wp01cVerificationDigestHex: sha256CanonicalJson(
        verification,
        ERGO_SOURCE_CONSENSUS_WP01C_VERIFICATION_V1_DIGEST_DOMAIN,
      ),
      commitmentTxIdHex: verification.transactionIdHex,
      transactionSigmaDigestHex: verification.transactionSigmaDigestHex,
      transactionIndex: verification.transactionIndex,
      transactionCount: verification.transactionCount,
    },
    checks: {
      everyKnownBranchProcessVerified: true as const,
      strictlyGreaterWorkSelectionApplied: true as const,
      exactTargetHeaderInSelectedBranch: true as const,
      targetPolicyDepthSatisfied: true as const,
      staticWp01cVerificationProvenanceBound: true as const,
      wp01cVerificationMatchesExactTargetHeader: true as const,
    },
    authority: {
      checkpointExternallyAuthenticated: false as const,
      completeCompetingBranchKnowledgeEstablished: false as const,
      globallyCanonicalErgoConsensusAccepted: false as const,
      deterministicFinalityEstablished: false as const,
      jvmPostEip37DifferentialComplete: false as const,
      runtimeRelayStateAuthenticated: false as const,
      depositSourceAndVaultLifecycleAuthenticated: false as const,
      persistedReceiptAcceptedAsAuthority: false as const,
      mintAuthorized: false as const,
      daemonAdmissionAuthorized: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
    },
    limitations: [
      'The checkpoint, difficulty context, and checkpoint cumulative work are profile inputs, not self-authenticating facts.',
      'Selection covers only the branches explicitly supplied to this process and does not prove complete branch knowledge.',
      'Policy depth on the selected known branch is not deterministic finality or global canonicality.',
      'Static WP-01C provenance authenticates exact header and signed-transaction bytes, not recency or canonical-chain membership.',
      'Serialized receipt source and vault identities are deliberately excluded until fresh semantic transition verification exists.',
      'No runtime relay state, restart/reorg recovery, mint admission, signing, submission, broadcast, or funds authority is connected.',
    ] as const,
  };
  const candidate = deepFreeze({
    ...body,
    candidateDigestHex: sha256CanonicalJson(
      body,
      ERGO_SOURCE_CONSENSUS_CANDIDATE_V1_DIGEST_DOMAIN,
    ),
  });
  CANDIDATES.add(candidate);
  return candidate;
}

export function assertErgoSourceConsensusCandidateV1Provenance(
  value: unknown,
): asserts value is Readonly<ErgoSourceConsensusCandidateV1> {
  if (
    typeof value !== 'object'
    || value === null
    || !CANDIDATES.has(value)
  ) {
    throw new Error(
      'Ergo source-consensus candidate was not produced by the V1 builder',
    );
  }
}

function snapshotExactDataObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== keys.length
    || actual.some(key => typeof key !== 'string' || !keys.includes(key))
  ) {
    throw new Error(`${label} must contain exactly: ${keys.join(', ')}`);
  }
  const snapshot: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new Error(`${label}.${key} must be a data property`);
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function snapshotDenseDataArray(
  value: unknown,
  maximumLength: number,
  label: string,
): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as
    Record<PropertyKey, PropertyDescriptor>;
  const lengthDescriptor = descriptors.length;
  const lengthValue: unknown = lengthDescriptor?.value;
  if (
    lengthDescriptor === undefined
    || !('value' in lengthDescriptor)
    || typeof lengthValue !== 'number'
    || !Number.isSafeInteger(lengthValue)
    || lengthValue < 0
    || lengthValue > maximumLength
  ) {
    throw new Error(`${label} length is invalid`);
  }
  const length = lengthValue;
  const allowedKeys = new Set(['length']);
  const snapshot: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    allowedKeys.add(key);
    const descriptor = descriptors[key];
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new Error(`${label}[${index}] must be a dense data property`);
    }
    snapshot.push(descriptor.value);
  }
  if (
    Reflect.ownKeys(descriptors).some(
      key => typeof key !== 'string' || !allowedKeys.has(key),
    )
  ) {
    throw new Error(`${label} must not contain extra properties`);
  }
  return snapshot;
}

function snapshotHeader(value: unknown): ErgoHeaderIdentityFields {
  const requiredKeys = [
    'version',
    'parentId',
    'adProofsRoot',
    'stateRoot',
    'transactionsRoot',
    'timestamp',
    'nBits',
    'height',
    'extensionHash',
    'votes',
    'powSolution',
  ] as const;
  const raw = snapshotDataObjectWithOptional(
    value,
    requiredKeys,
    ['unparsedBytes'],
    'Ergo source-consensus target header',
  );
  const pow = snapshotDataObjectWithOptional(
    raw.powSolution,
    ['publicKey', 'nonce'],
    ['oneTimePublicKey', 'distance'],
    'Ergo source-consensus target PoW solution',
  );
  return {
    version: raw.version as number,
    parentId: copyBytes(raw.parentId, 'target parent ID'),
    adProofsRoot: copyBytes(raw.adProofsRoot, 'target AD proofs root'),
    stateRoot: copyBytes(raw.stateRoot, 'target state root'),
    transactionsRoot: copyBytes(
      raw.transactionsRoot,
      'target transactions root',
    ),
    timestamp: raw.timestamp as bigint,
    nBits: raw.nBits as number,
    height: raw.height as number,
    extensionHash: copyBytes(raw.extensionHash, 'target extension hash'),
    votes: copyBytes(raw.votes, 'target votes'),
    ...(raw.unparsedBytes === undefined
      ? {}
      : {
        unparsedBytes: copyBytes(
          raw.unparsedBytes,
          'target unparsed bytes',
        ),
      }),
    powSolution: {
      publicKey: copyBytes(pow.publicKey, 'target Autolykos public key'),
      nonce: copyBytes(pow.nonce, 'target Autolykos nonce'),
      ...(pow.oneTimePublicKey === undefined
        ? {}
        : {
          oneTimePublicKey: copyBytes(
            pow.oneTimePublicKey,
            'target Autolykos one-time public key',
          ),
        }),
      ...(pow.distance === undefined ? {} : { distance: pow.distance as bigint }),
    },
  };
}

function snapshotDataObjectWithOptional(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.some(
      key => typeof key !== 'string'
        || (!requiredKeys.includes(key) && !optionalKeys.includes(key)),
    )
    || requiredKeys.some(key => descriptors[key] === undefined)
  ) {
    throw new Error(`${label} contains missing or unknown properties`);
  }
  const snapshot: Record<string, unknown> = {};
  for (const key of [...requiredKeys, ...optionalKeys]) {
    const descriptor = descriptors[key];
    if (descriptor === undefined) continue;
    if (!('value' in descriptor)) {
      throw new Error(`${label}.${key} must be a data property`);
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function copyBytes(value: unknown, label: string): Buffer {
  if (!(value instanceof Uint8Array)) {
    throw new Error(`${label} must be bytes`);
  }
  return Buffer.from(value);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}
