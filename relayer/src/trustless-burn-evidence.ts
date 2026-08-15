import { basename } from 'path';

import { isIsoCalendarDate, validateIsoDateField } from './evidence-date.js';
import { validateGitCommitField } from './evidence-git.js';
import {
  hasUnresolvedIssueMarker,
  normalizeEvidenceMarkerText,
  validateEvidenceHygiene,
} from './evidence-hygiene.js';
import {
  evidenceTargetInspectionVariants,
  hasEvidenceLocalOnlyInspectionReference,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from './evidence-sensitive-target.js';
import {
  validateDuplicateRequiredFields,
  validateRequiredNames,
} from './evidence-required-names.js';
import { readEvidenceJsonTarget } from './evidence-json-target-path.js';
import {
  classifyPublicationClaimText,
  validateReviewerDecisionSummaryClaimBoundary,
} from './publication-claim-boundary.js';
import {
  encodeTrustlessBurnLeaf,
  verifyTrustlessBurnSettlementBinding,
  type TrustlessBurnLeafInput,
  type TrustlessBurnMerkleProofStep,
} from './trustless-burn-proof.js';
import {
  validateTrustlessBurnNegativeProofCases,
  type TrustlessBurnNegativeProofCase,
} from './trustless-burn-proof-vector.js';
import {
  validateTrustlessBurnContractAcceptanceReportJson,
} from './trustless-burn-contract-acceptance-report.js';
import {
  deriveSpvTrackerKey,
  encodeSpvTrackerValue,
  type SpvTrackerEntry,
} from './spv-tracker.js';
import { TRUSTLESS_OBSERVATION_RECONCILE_COMMAND } from './trustless-observation-reconciliation.js';

export type TrustlessBurnEvidenceStatus = 'pending' | 'linked' | 'blocker';
export type ReviewerDecision = 'approve' | 'block';

export interface RequiredComponentRow {
  component: string;
  requiredProperty: string;
  evidence: string;
  status: string;
}

export interface CommitmentFormatRow {
  field: string;
  valueOrEncoding: string;
  evidence: string;
  status: string;
}

export interface BurnProofBindingRow {
  field: string;
  bindingRule: string;
  evidence: string;
  status: string;
}

export interface NegativeProofRow {
  check: string;
  expectedResult: string;
  evidence: string;
  status: string;
}

export interface PositiveProofRow {
  check: string;
  expectedResult: string;
  evidence: string;
  status: string;
}

export interface TrustlessBurnLocalProofVector {
  leaf: TrustlessBurnLeafInput;
  bridgeEventRootHex: string;
  proof: TrustlessBurnMerkleProofStep[];
  duplicatePreventionKeyHex: string;
  recipientErgoTreeHashHex: string;
  amountNanoErg: string | number;
  assetIdHex?: string;
  negativeCases?: TrustlessBurnNegativeProofCase[];
}

export interface PublicationDecisionFields {
  trustlessBurnVerificationImplemented: string;
  releaseSupported: string;
  productionReadyClaimAllowed: string;
  testnetProductionCandidateClaimAllowed: string;
  transitionalTrustedBurnPathDisabled: string;
  criticalHighFindingsOpen: string;
  releaseNotesUpdated: string;
  requiredReleaseChecklistUpdates: string;
  requiredReleaseNoteUpdates: string;
  reviewerDecisionSummary: string;
}

export interface ReviewerSignoffRow {
  role: string;
  name: string;
  decision: string;
  date: string;
  notes: string;
}

export interface TrustlessBurnClassificationFields {
  evidenceName: string;
  gitCommit: string;
  releaseLevel: string;
  environment: string;
  broadcastMode: string;
  trustPath: string;
  reviewer: string;
  date: string;
}

export interface TrustlessBurnEvidenceValidation {
  status: 'PASS' | 'BLOCKED';
  classification: Partial<TrustlessBurnClassificationFields>;
  componentRows: RequiredComponentRow[];
  commitmentRows: CommitmentFormatRow[];
  burnProofRows: BurnProofBindingRow[];
  localProofVector?: TrustlessBurnLocalProofVector;
  localProofVectorReportTarget?: string;
  positiveRows: PositiveProofRow[];
  negativeRows: NegativeProofRow[];
  publicationDecision: Partial<PublicationDecisionFields>;
  reviewerRows: ReviewerSignoffRow[];
  errors: string[];
  message: string;
}

interface ParsedRows<T> {
  rows: T[];
  errors: string[];
}

const REQUIRED_SECTIONS = [
  '## Evidence Classification',
  '## Required Components',
  '## Commitment Format',
  '## Burn Proof Binding',
  '## Local Proof Vector',
  '## Positive Proof Acceptance',
  '## Negative Tests',
  '## Publication Decision',
  '## Reviewer Sign-Off',
];

const REQUIRED_CLASSIFICATION_FIELDS = [
  'Evidence name',
  'Git commit',
  'Release level',
  'Environment',
  'Broadcast mode',
  'Trust path',
  'Reviewer',
  'Date',
];

export const REQUIRED_TRUSTLESS_BURN_COMPONENTS = [
  'Sidechain commitment format',
  'Ergo extension-section anchoring',
  'Sidechain header/finality verifier',
  'SPV relay contract or tracker',
  'Burn commitment tree',
  'Burn inclusion proof',
  'DUP settlement binding',
  'Reorg handling',
  'Independent review',
];
const REQUIRED_COMPONENTS = REQUIRED_TRUSTLESS_BURN_COMPONENTS;

const REQUIRED_COMPONENT_PROPERTY_MARKERS: Record<string, { pattern: RegExp; message: string }[]> = {
  'Sidechain commitment format': [
    {
      pattern: /(stable|versioned)/i,
      message: 'must state stable or versioned commitment format',
    },
    {
      pattern: /(sidechain|commitment)/i,
      message: 'must identify sidechain commitment semantics',
    },
  ],
  'Ergo extension-section anchoring': [
    {
      pattern: /\b0x04(?:xx|[0-9a-f]{2})\b/i,
      message: 'must mention the 0x04xx extension keyspace',
    },
    {
      pattern: /extension/i,
      message: 'must identify Ergo extension-section anchoring',
    },
  ],
  'Sidechain header/finality verifier': [
    {
      pattern: /header/i,
      message: 'must identify sidechain header verification',
    },
    {
      pattern: /finality/i,
      message: 'must identify sidechain finality verification',
    },
  ],
  'SPV relay contract or tracker': [
    {
      pattern: /SPV/i,
      message: 'must identify SPV relay or tracker evidence',
    },
    {
      pattern: /(authenticated|commitment|history)/i,
      message: 'must identify authenticated commitment history',
    },
  ],
  'Burn commitment tree': [
    {
      pattern: /(burn|tree)/i,
      message: 'must identify the burn commitment tree',
    },
    {
      pattern: /Blake2b/i,
      message: 'must identify Blake2b-compatible hashing',
    },
  ],
  'Burn inclusion proof': [
    {
      pattern: /(inclusion|included)/i,
      message: 'must identify burn inclusion verification',
    },
    {
      pattern: /(proof|on-chain|contract)/i,
      message: 'must identify on-chain proof acceptance',
    },
  ],
  'DUP settlement binding': [
    {
      pattern: /DUP/i,
      message: 'must identify DUP duplicate-prevention binding',
    },
    {
      pattern: /(settlement|burn)/i,
      message: 'must bind settlement to the proved burn',
    },
  ],
  'Reorg handling': [
    {
      pattern: /reorg/i,
      message: 'must identify sidechain reorg handling',
    },
    {
      pattern: /(cannot release|blocked|rejected|rollback|reverted)/i,
      message: 'must state reverted commitments cannot release ERG',
    },
  ],
  'Independent review': [
    {
      pattern: /independent/i,
      message: 'must state independent review',
    },
    {
      pattern: /(consensus|commitment|proof|operator)/i,
      message: 'must cover consensus, commitment, proof, or operator recovery review',
    },
  ],
};

export const REQUIRED_TRUSTLESS_BURN_COMMITMENT_FIELDS = [
  'sidechainId',
  'sidechainHeight',
  'sidechainHeaderHash',
  'bridgeEventRoot',
  'ergoAnchorHeight',
  'commitmentPrefix',
  'hashFunction',
  'finalityRule',
];
const REQUIRED_COMMITMENT_FIELDS = REQUIRED_TRUSTLESS_BURN_COMMITMENT_FIELDS;

export const REQUIRED_TRUSTLESS_BURN_PROOF_FIELDS = [
  'burnId',
  'recipientErgoTreeHash',
  'amountNanoErg',
  'sidechainTxHash',
  'sidechainBlockHash',
  'eventIndex',
  'inclusionPath',
  'duplicatePreventionKey',
  'settlementTxBinding',
];
const REQUIRED_BURN_PROOF_FIELDS = REQUIRED_TRUSTLESS_BURN_PROOF_FIELDS;

const CONCRETE_COMMITMENT_HEX_FIELDS = new Set([
  'sidechainId',
  'sidechainHeaderHash',
  'bridgeEventRoot',
]);
const CONCRETE_COMMITMENT_INTEGER_FIELDS = new Set([
  'sidechainHeight',
  'ergoAnchorHeight',
]);
const CONCRETE_BURN_HEX_FIELDS = new Set([
  'burnId',
  'recipientErgoTreeHash',
  'sidechainTxHash',
  'sidechainBlockHash',
  'duplicatePreventionKey',
]);
const CONCRETE_BURN_INTEGER_FIELDS = new Set([
  'amountNanoErg',
  'eventIndex',
]);

const REQUIRED_COMMITMENT_FIELD_MARKERS: Record<string, { pattern: RegExp; message: string }[]> = {
  commitmentPrefix: [
    {
      pattern: /\b0x04(?:xx|[0-9a-f]{2})\b/i,
      message: 'must mention the 0x04xx extension keyspace',
    },
  ],
  hashFunction: [
    {
      pattern: /blake2b/i,
      message: 'must mention Blake2b-compatible hashing',
    },
  ],
};

const REQUIRED_BURN_BINDING_MARKERS: Record<string, { pattern: RegExp; message: string }[]> = {
  recipientErgoTreeHash: [
    {
      pattern: /recipient/i,
      message: 'must bind the payout recipient',
    },
  ],
  amountNanoErg: [
    {
      pattern: /amount/i,
      message: 'must bind the payout amount',
    },
  ],
  inclusionPath: [
    {
      pattern: /(inclusion|membership)/i,
      message: 'must describe inclusion or membership verification',
    },
    {
      pattern: /(tree|root|commitment)/i,
      message: 'must bind to the committed burn tree or root',
    },
  ],
  duplicatePreventionKey: [
    {
      pattern: /(dup|duplicate)/i,
      message: 'must bind to duplicate prevention',
    },
    {
      pattern: /burn/i,
      message: 'must bind duplicate prevention to the burn identifier',
    },
  ],
  settlementTxBinding: [
    {
      pattern: /settlement/i,
      message: 'must bind the proof to the settlement transaction',
    },
    {
      pattern: /(recipient|amount|payout)/i,
      message: 'must bind the settlement payout fields',
    },
  ],
};

export const REQUIRED_TRUSTLESS_BURN_POSITIVE_CHECKS = [
  'Valid burn proof acceptance',
];
const REQUIRED_POSITIVE_CHECKS = REQUIRED_TRUSTLESS_BURN_POSITIVE_CHECKS;

const POSITIVE_TEST_EXPECTED_RESULT_PATTERN = /\b(accepted|approved|passed|validated|verified)\b/i;

const REQUIRED_POSITIVE_EVIDENCE_MARKERS: Record<string, { pattern: RegExp; message: string }[]> = {
  'Valid burn proof acceptance': [
    {
      pattern: /burn[- ]proof|burn proof/i,
      message: 'evidence must identify accepted burn proof execution',
    },
    {
      pattern: /inclusion|membership/i,
      message: 'evidence must identify accepted inclusion or membership proof',
    },
    {
      pattern: /DUP|duplicate/i,
      message: 'evidence must identify duplicate-prevention binding',
    },
    {
      pattern: /settlement|payout/i,
      message: 'evidence must identify settlement payout binding',
    },
    {
      pattern: /burnId|burn[- ]id|burn identifier/i,
      message: 'evidence must identify the accepted burn ID',
    },
    {
      pattern: /bridgeEventRoot\s+(?:0x)?[0-9a-f]{64}\b/i,
      message: 'evidence must identify the accepted bridgeEventRoot commitment',
    },
    {
      pattern: /settlement[- ]tx|settlement transaction|tx binding/i,
      message: 'evidence must identify settlement transaction binding',
    },
    {
      pattern: /recipient/i,
      message: 'evidence must identify accepted recipient binding',
    },
    {
      pattern: /amount/i,
      message: 'evidence must identify accepted amount binding',
    },
  ],
};

export const REQUIRED_TRUSTLESS_BURN_NEGATIVE_CHECKS = [
  'Wrong sidechain ID',
  'Wrong recipient',
  'Wrong amount',
  'Reused burn ID',
  'Reorged sidechain block',
  'Unfinalized sidechain block',
  'Stale SPV tracker digest',
  'Wrong Ergo anchor height',
  'Malformed inclusion path',
  'Trusted-oracle fallback presented as trustless',
];
const REQUIRED_NEGATIVE_CHECKS = REQUIRED_TRUSTLESS_BURN_NEGATIVE_CHECKS;

const REQUIRED_NEGATIVE_EVIDENCE_MARKERS: Record<string, { pattern: RegExp; message: string }[]> = {
  'Wrong sidechain ID': [
    {
      pattern: /wrong[- ]sidechain[- ]id|sidechain id|sidechainId/i,
      message: 'evidence must identify wrong sidechain ID rejection',
    },
  ],
  'Wrong recipient': [
    {
      pattern: /wrong[- ]recipient|recipient/i,
      message: 'evidence must identify wrong recipient rejection',
    },
  ],
  'Wrong amount': [
    {
      pattern: /wrong[- ]amount|amount/i,
      message: 'evidence must identify wrong amount rejection',
    },
  ],
  'Reused burn ID': [
    {
      pattern: /reused[- ]burn[- ]id|burn id|burnId|duplicate/i,
      message: 'evidence must identify reused burn ID rejection',
    },
  ],
  'Reorged sidechain block': [
    {
      pattern: /reorg|sidechain[- ]block|sidechain block/i,
      message: 'evidence must identify reorged sidechain block rejection',
    },
  ],
  'Unfinalized sidechain block': [
    {
      pattern: /unfinalized|not[- ]final|finality|sidechain[- ]block|sidechain block/i,
      message: 'evidence must identify unfinalized sidechain block rejection',
    },
  ],
  'Stale SPV tracker digest': [
    {
      pattern: /stale[- ]spv[- ]tracker[- ]digest|spv|tracker|digest/i,
      message: 'evidence must identify stale SPV tracker digest rejection',
    },
  ],
  'Wrong Ergo anchor height': [
    {
      pattern: /wrong[- ]ergo[- ]anchor[- ]height|ergo[- ]anchor|anchor[- ]height/i,
      message: 'evidence must identify wrong Ergo anchor height rejection',
    },
  ],
  'Malformed inclusion path': [
    {
      pattern: /malformed[- ]inclusion[- ]path|inclusion[- ]path|membership/i,
      message: 'evidence must identify malformed inclusion path rejection',
    },
  ],
  'Trusted-oracle fallback presented as trustless': [
    {
      pattern: /trusted[- ]oracle|oracle[- ]fallback|trusted[- ]oracle[- ]fallback|fallback[- ]presented/i,
      message: 'evidence must identify trusted-oracle fallback rejection',
    },
  ],
};

const LOCAL_PROOF_CORE_NEGATIVE_CASES_BY_ROW: Record<string, string[]> = {
  'Wrong sidechain ID': ['wrong-sidechain-id'],
  'Wrong recipient': ['wrong-recipient'],
  'Wrong amount': ['wrong-amount'],
  'Reused burn ID': ['wrong-burn-id', 'wrong-event-index', 'wrong-duplicate-prevention-key'],
  'Stale SPV tracker digest': ['wrong-bridge-event-root'],
  'Malformed inclusion path': ['malformed-inclusion-path'],
};

const REQUIRED_PUBLICATION_DECISION_FIELDS = [
  'Trustless burn verification implemented',
  'Release supported',
  'Production-ready claim allowed',
  'Testnet production-candidate claim allowed',
  'Transitional trusted burn path disabled',
  'Critical/high findings open',
  'Release notes updated',
  'Required release checklist updates',
  'Required release-note updates',
  'Reviewer decision summary',
];

export const REQUIRED_TRUSTLESS_BURN_REVIEWER_ROLES = [
  'Protocol reviewer',
  'Security reviewer',
  'Operator reviewer',
];
const REQUIRED_REVIEWER_ROLES = REQUIRED_TRUSTLESS_BURN_REVIEWER_ROLES;

const ALLOWED_STATUSES = new Set<TrustlessBurnEvidenceStatus>(['pending', 'linked', 'blocker']);
const ALLOWED_RELEASE_LEVELS = new Set([
  'validated PoC',
  'institutional reference',
  'production deployment candidate',
]);
const ALLOWED_ENVIRONMENTS = new Set(['local offline', 'patched devnet', 'testnet', 'staging']);
const ALLOWED_BROADCAST_MODES = new Set(['disabled', 'dry-run']);
const ALLOWED_TRUST_PATHS = new Set([
  'transitional trusted burn path',
  'trustless burn proof path',
]);
const ALLOWED_YES_NO = new Set(['yes', 'no']);
const ALLOWED_REVIEWER_DECISIONS = new Set<ReviewerDecision>(['approve', 'block']);
const NEGATIVE_TEST_EXPECTED_RESULT_PATTERN = /\b(rejected|blocked|refused|failed)\b/i;
const PROOF_EXPECTED_RESULT_ALTERNATIVE_PATTERN =
  /\b(?:accepted|approved|passed|validated|verified|rejected|blocked|refused|failed)\b\s*\/\s*\b(?:accepted|approved|passed|validated|verified|rejected|blocked|refused|failed)\b/i;
const HEX_32_BYTE_PATTERN = /(?:^|[^0-9a-fA-F])(?:0x)?([0-9a-fA-F]{64})(?![0-9a-fA-F])/g;
const NON_NEGATIVE_INTEGER_TOKEN_PATTERN = /\b\d+\b/g;
const NON_NEGATIVE_INTEGER_VALUE_PATTERN = /^\d+$/;
const UINT64_MAX = 0xffff_ffff_ffff_ffffn;
const LOCAL_PROOF_VECTOR_TOP_LEVEL_FIELDS = new Set([
  'leaf',
  'bridgeEventRootHex',
  'proof',
  'duplicatePreventionKeyHex',
  'recipientErgoTreeHashHex',
  'amountNanoErg',
  'assetIdHex',
  'negativeCases',
]);
const LOCAL_PROOF_VECTOR_LEAF_FIELDS = new Set([
  'sidechainIdHex',
  'sidechainBlockHashHex',
  'burnIdHex',
  'sidechainTxHashHex',
  'eventIndex',
  'recipientErgoTreeHashHex',
  'amountNanoErg',
  'assetIdHex',
]);
const LOCAL_PROOF_VECTOR_PROOF_STEP_FIELDS = new Set(['side', 'hashHex']);
const LOCAL_PROOF_VECTOR_PROOF_HASH_HEX_PATTERN = /^(?:0x)?[0-9a-fA-F]{64}$/;
const LOCAL_PROOF_VECTOR_NEGATIVE_CASE_FIELDS = new Set(['name', 'leaf', 'settlementBinding', 'expectedErrors']);
const LOCAL_PROOF_VECTOR_NEGATIVE_SETTLEMENT_BINDING_FIELDS = new Set([
  'bridgeEventRootHex',
  'proof',
  'duplicatePreventionKeyHex',
  'recipientErgoTreeHashHex',
  'amountNanoErg',
  'assetIdHex',
]);
const PROOF_VECTOR_REPORT_TOP_LEVEL_FIELDS = new Set(['schemaVersion', 'command', 'status', 'errors', 'boundary', 'reports']);
const PROOF_VECTOR_REPORT_BOUNDARY_FIELDS = new Set([
  'readOnly',
  'localProofCoreOnly',
  'gate5Closure',
  'settlementReadiness',
  'broadcastAuthorization',
  'productionClaimSupport',
  'testnetProductionCandidateClaimSupport',
]);
const PROOF_VECTOR_REPORT_RESULT_FIELDS = new Set([
  'label',
  'status',
  'message',
  'errors',
  'bridgeEventRootHex',
  'leafHashHex',
  'leafCount',
  'proofNodeCount',
  'negativeCaseResults',
]);
const PROOF_VECTOR_REPORT_NEGATIVE_CASE_RESULT_FIELDS = new Set([
  'name',
  'status',
  'expectedErrors',
  'observedErrors',
]);
const ANCHOR_OBSERVATION_REPORT_TOP_LEVEL_FIELDS = new Set([
  'schemaVersion',
  'command',
  'status',
  'reason',
  'bridgeEventRootHex',
  'extensionKey',
  'minHeight',
  'maxHeight',
  'observedAt',
  'sourceLabel',
  'network',
  'nodeUrl',
  'commandLine',
  'workingDirectory',
  'heightsScanned',
  'extensionReadsSucceeded',
  'extensionReadsFailed',
  'linkedAnchor',
  'readFailures',
  'boundary',
]);
const ANCHOR_OBSERVATION_LINKED_ANCHOR_FIELDS = new Set([
  'key',
  'bridgeEventRootHex',
  'ergoAnchorHeight',
  'headerId',
]);
const ANCHOR_OBSERVATION_BOUNDARY_FIELDS = new Set([
  'readOnly',
  'publicObservationInputOnly',
  'deploymentStateOpened',
  'runtimeDatabaseOpened',
  'secretOrEnvironmentFileRead',
  'signingOrWalletMaterialRead',
  'transactionBroadcastOrMutation',
  'gate5Closure',
  'settlementReadiness',
  'productionClaimSupport',
  'testnetProductionCandidateClaimSupport',
]);
const SPV_TRACKER_OBSERVATION_REPORT_TOP_LEVEL_FIELDS = new Set([
  'schemaVersion',
  'command',
  'status',
  'reason',
  'observedAt',
  'sourceLabel',
  'network',
  'nodeUrl',
  'commandLine',
  'workingDirectory',
  'trackerBox',
  'expectedEntry',
  'historyLength',
  'trackerDigestHex',
  'rebuiltTrackerDigestHex',
  'expectedKeyHex',
  'expectedValueHex',
  'observedValueHex',
  'proofDigestHex',
  'getProofHex',
  'decodedValue',
  'sidechainFinality',
  'boundary',
]);
const SPV_TRACKER_OBSERVATION_TRACKER_BOX_FIELDS = new Set(['boxId', 'nftId']);
const SPV_TRACKER_OBSERVATION_ENTRY_FIELDS = new Set([
  'sidechainIdHex',
  'sidechainHeight',
  'sidechainHeaderHashHex',
  'bridgeEventRootHex',
  'ergoAnchorHeight',
]);
const SPV_TRACKER_OBSERVATION_DECODED_VALUE_FIELDS = new Set([
  'bridgeEventRootHex',
  'ergoAnchorHeight',
]);
const SPV_TRACKER_OBSERVATION_SIDECHAIN_FINALITY_FIELDS = new Set([
  'finalityRule',
  'sidechainBlockHeight',
  'observedSidechainHeight',
  'requiredConfirmations',
  'observedConfirmations',
  'status',
]);
const SPV_TRACKER_OBSERVATION_BOUNDARY_FIELDS = new Set([
  'readOnly',
  'publicObservationInputOnly',
  'deploymentStateOpened',
  'runtimeDatabaseOpened',
  'secretOrEnvironmentFileRead',
  'signingOrWalletMaterialRead',
  'nodeOrRpcRequestPerformed',
  'transactionBroadcastOrMutation',
  'gate5Closure',
  'settlementReadiness',
  'productionClaimSupport',
  'testnetProductionCandidateClaimSupport',
]);
const OBSERVATION_RECONCILIATION_REPORT_TOP_LEVEL_FIELDS = new Set([
  'schemaVersion',
  'command',
  'status',
  'reason',
  'observedAt',
  'commandLine',
  'workingDirectory',
  'anchorObservationReportTarget',
  'spvTrackerObservationReportTarget',
  'anchorObservationStatus',
  'spvTrackerObservationStatus',
  'anchorBridgeEventRootHex',
  'spvBridgeEventRootHex',
  'reconciledBridgeEventRootHex',
  'anchorErgoAnchorHeight',
  'spvErgoAnchorHeight',
  'reconciledErgoAnchorHeight',
  'checks',
  'boundary',
]);
const OBSERVATION_RECONCILIATION_CHECK_FIELDS = new Set([
  'name',
  'status',
  'detail',
]);
const OBSERVATION_RECONCILIATION_BOUNDARY_FIELDS = new Set([
  'readOnly',
  'publicObservationInputsOnly',
  'anchorObservationJsonReused',
  'spvTrackerObservationJsonReused',
  'nodeOrRpcRequestPerformed',
  'deploymentStateOpened',
  'runtimeDatabaseOpened',
  'secretOrEnvironmentFileRead',
  'signingOrWalletMaterialRead',
  'transactionBroadcastOrMutation',
  'gate5Closure',
  'settlementReadiness',
  'productionClaimSupport',
  'testnetProductionCandidateClaimSupport',
]);

function parseMarkdownTableRows(table: string): string[][] {
  return table
    .split(/\r?\n/)
    .filter(line => line.startsWith('|'))
    .filter(line => !/^\|\s*-/.test(line))
    .slice(1)
    .map(line =>
      line
        .slice(1, -1)
        .split('|')
        .map(cell => cell.trim()),
    );
}

export function parseRequiredComponentRows(markdown: string): RequiredComponentRow[] {
  return parseTableBetween(markdown, '## Required Components', '## Commitment Format').map(row => {
    if (row.length !== 4) throw new Error(`Malformed Required Components row: ${row.join(' | ')}`);
    return {
      component: row[0],
      requiredProperty: row[1],
      evidence: row[2],
      status: row[3],
    };
  });
}

export function validateTrustlessBurnEvidence(markdown: string): TrustlessBurnEvidenceValidation {
  const classification = parseEvidenceClassification(markdown);
  const components = parseRowsSafely(() => parseRequiredComponentRows(markdown));
  const commitments = parseRowsSafely(() => parseCommitmentRows(markdown));
  const burnProofs = parseRowsSafely(() => parseBurnProofRows(markdown));
  const localProofVector = parseLocalProofVector(markdown);
  const positives = parseRowsSafely(() => parsePositiveRows(markdown));
  const negatives = parseRowsSafely(() => parseNegativeRows(markdown));
  const reviewers = parseRowsSafely(() => parseReviewerRows(markdown));
  const publicationDecision = parsePublicationDecision(markdown);
  const componentRows = components.rows;
  const commitmentRows = commitments.rows;
  const burnProofRows = burnProofs.rows;
  const positiveRows = positives.rows;
  const negativeRows = negatives.rows;
  const reviewerRows = reviewers.rows;
  const errors = [
    ...validateEvidenceHygiene(markdown, 'Trustless Burn Evidence'),
    ...validateRequiredSections(markdown),
    ...validateClassification(markdown),
    ...validatePublicationDecision(publicationDecision, markdown),
    ...components.errors,
    ...commitments.errors,
    ...burnProofs.errors,
    ...positives.errors,
    ...negatives.errors,
    ...reviewers.errors,
    ...validateComponentRows(componentRows),
    ...validateCommitmentRows(commitmentRows),
    ...validateAnchorObservationReport(componentRows, commitmentRows),
    ...validateSpvTrackerObservationReport(componentRows, commitmentRows),
    ...validateObservationReconciliationReport(componentRows, commitmentRows),
    ...validateBurnProofRows(burnProofRows),
    ...localProofVector.errors,
    ...validateLocalProofVector(localProofVector.vector, commitmentRows, burnProofRows),
    ...validateLocalProofVectorReport(localProofVector.reportTarget, localProofVector.vector),
    ...validatePositiveRows(positiveRows),
    ...validatePositiveProofInstanceBinding(positiveRows, commitmentRows, burnProofRows),
    ...validateContractEquivalentAcceptanceReport(positiveRows, commitmentRows, burnProofRows),
    ...validateNegativeRows(negativeRows, localProofVector.vector),
    ...validateDistinctCompletedTrustlessBurnEvidenceTargets(
      componentRows,
      commitmentRows,
      burnProofRows,
      positiveRows,
      negativeRows,
    ),
    ...validateLocalProofVectorReportTargetReuse(
      localProofVector.reportTarget,
      componentRows,
      commitmentRows,
      burnProofRows,
      positiveRows,
      negativeRows,
      publicationDecision,
    ),
    ...validateReviewerRows(reviewerRows),
    ...validateReviewerIdentityConsistency(markdown, reviewerRows),
    ...validateReviewerDateConsistency(markdown, reviewerRows),
  ];

  if (errors.length > 0) {
    return {
      status: 'BLOCKED',
      classification,
      componentRows,
      commitmentRows,
      burnProofRows,
      localProofVector: localProofVector.vector,
      localProofVectorReportTarget: localProofVector.reportTarget,
      positiveRows,
      negativeRows,
      publicationDecision,
      reviewerRows,
      errors,
      message: `Trustless burn evidence BLOCKED: ${errors.length} structural issue(s).`,
    };
  }

  return {
    status: 'PASS',
    classification,
    componentRows,
    commitmentRows,
    burnProofRows,
    localProofVector: localProofVector.vector,
    localProofVectorReportTarget: localProofVector.reportTarget,
    positiveRows,
    negativeRows,
    publicationDecision,
    reviewerRows,
    errors: [],
    message: `Trustless burn evidence PASS: ${positiveRows.length} positive proof acceptance row and ${burnProofRows.length} burn proof binding rows are linked.`,
  };
}

function parseRowsSafely<T>(parseRows: () => T[]): ParsedRows<T> {
  try {
    return { rows: parseRows(), errors: [] };
  } catch (error) {
    return {
      rows: [],
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

function parseCommitmentRows(markdown: string): CommitmentFormatRow[] {
  return parseTableBetween(markdown, '## Commitment Format', '## Burn Proof Binding').map(row => {
    if (row.length !== 4) throw new Error(`Malformed Commitment Format row: ${row.join(' | ')}`);
    return {
      field: row[0],
      valueOrEncoding: row[1],
      evidence: row[2],
      status: row[3],
    };
  });
}

function parseBurnProofRows(markdown: string): BurnProofBindingRow[] {
  return parseTableBetween(markdown, '## Burn Proof Binding', '## Local Proof Vector').map(row => {
    if (row.length !== 4) throw new Error(`Malformed Burn Proof Binding row: ${row.join(' | ')}`);
    return {
      field: row[0],
      bindingRule: row[1],
      evidence: row[2],
      status: row[3],
    };
  });
}

function parseLocalProofVector(markdown: string): {
  vector?: TrustlessBurnLocalProofVector;
  reportTarget?: string;
  errors: string[];
} {
  const section = sectionBetween(markdown, '## Local Proof Vector', '## Positive Proof Acceptance');
  const reportTarget = parseLocalProofVectorReportTarget(section);
  const match = /```json\s*([\s\S]*?)```/i.exec(section);
  if (!match) {
    return { reportTarget, errors: ['Local Proof Vector: fenced json block is required'] };
  }

  try {
    const parsed = JSON.parse(match[1]) as unknown;
    if (!isRecord(parsed)) {
      return { reportTarget, errors: ['Local Proof Vector: json block must be an object'] };
    }
    return {
      vector: parsed as unknown as TrustlessBurnLocalProofVector,
      reportTarget,
      errors: [],
    };
  } catch (err: any) {
    return { reportTarget, errors: [`Local Proof Vector: invalid JSON: ${err?.message ?? String(err)}`] };
  }
}

function parseLocalProofVectorReportTarget(section: string): string | undefined {
  const match = /^Proof-vector validation report:\s*(.+?)\s*$/im.exec(section);
  return match?.[1]?.trim();
}

function parsePositiveRows(markdown: string): PositiveProofRow[] {
  return parseTableBetween(markdown, '## Positive Proof Acceptance', '## Negative Tests').map(row => {
    if (row.length !== 4) throw new Error(`Malformed Positive Proof Acceptance row: ${row.join(' | ')}`);
    return {
      check: row[0],
      expectedResult: row[1],
      evidence: row[2],
      status: row[3],
    };
  });
}

function parseNegativeRows(markdown: string): NegativeProofRow[] {
  return parseTableBetween(markdown, '## Negative Tests', '## Publication Decision').map(row => {
    if (row.length !== 4) throw new Error(`Malformed Negative Tests row: ${row.join(' | ')}`);
    return {
      check: row[0],
      expectedResult: row[1],
      evidence: row[2],
      status: row[3],
    };
  });
}

function parseEvidenceClassification(markdown: string): TrustlessBurnEvidenceValidation['classification'] {
  const fields = parseTwoColumnTable(sectionBetween(markdown, '## Evidence Classification', '## Required Components'));
  return {
    evidenceName: fields.get('Evidence name'),
    gitCommit: fields.get('Git commit'),
    releaseLevel: fields.get('Release level'),
    environment: fields.get('Environment'),
    broadcastMode: fields.get('Broadcast mode'),
    trustPath: fields.get('Trust path'),
    reviewer: fields.get('Reviewer'),
    date: fields.get('Date'),
  };
}

function parsePublicationDecision(markdown: string): Partial<PublicationDecisionFields> {
  const fields = parseTwoColumnTable(sectionBetween(markdown, '## Publication Decision', '## Reviewer Sign-Off'));
  return {
    trustlessBurnVerificationImplemented: fields.get('Trustless burn verification implemented'),
    releaseSupported: fields.get('Release supported'),
    productionReadyClaimAllowed: fields.get('Production-ready claim allowed'),
    testnetProductionCandidateClaimAllowed: fields.get('Testnet production-candidate claim allowed'),
    transitionalTrustedBurnPathDisabled: fields.get('Transitional trusted burn path disabled'),
    criticalHighFindingsOpen: fields.get('Critical/high findings open'),
    releaseNotesUpdated: fields.get('Release notes updated'),
    requiredReleaseChecklistUpdates: fields.get('Required release checklist updates'),
    requiredReleaseNoteUpdates: fields.get('Required release-note updates'),
    reviewerDecisionSummary: fields.get('Reviewer decision summary'),
  };
}

function parseReviewerRows(markdown: string): ReviewerSignoffRow[] {
  return parseTableBetween(markdown, '## Reviewer Sign-Off').map(row => {
    if (row.length !== 5) throw new Error(`Malformed Reviewer Sign-Off row: ${row.join(' | ')}`);
    return { role: row[0], name: row[1], decision: row[2], date: row[3], notes: row[4] };
  });
}

function validateRequiredSections(markdown: string): string[] {
  const errors: string[] = [];
  let lastIndex = -1;

  for (const section of REQUIRED_SECTIONS) {
    const index = markdown.indexOf(section);
    if (index < 0) {
      errors.push(`${section}: missing required section`);
      continue;
    }
    if (index <= lastIndex) errors.push(`${section}: section appears out of order`);
    lastIndex = index;
  }

  return errors;
}

function validateClassification(markdown: string): string[] {
  const section = sectionBetween(markdown, '## Evidence Classification', '## Required Components');
  const fields = parseTwoColumnTable(section);
  const errors = validateDuplicateRequiredFields(
    'Evidence Classification',
    parseTwoColumnFieldNames(section),
    REQUIRED_CLASSIFICATION_FIELDS,
  );

  for (const field of REQUIRED_CLASSIFICATION_FIELDS) {
    if (isBlank(fields.get(field) ?? '')) errors.push(`Evidence Classification: ${field} is required`);
  }

  validateAllowedField(errors, fields, 'Evidence Classification', 'Release level', ALLOWED_RELEASE_LEVELS);
  validateAllowedField(errors, fields, 'Evidence Classification', 'Environment', ALLOWED_ENVIRONMENTS);
  validateAllowedField(errors, fields, 'Evidence Classification', 'Broadcast mode', ALLOWED_BROADCAST_MODES);
  validateAllowedField(errors, fields, 'Evidence Classification', 'Trust path', ALLOWED_TRUST_PATHS);
  validateGitCommitField(errors, fields, 'Evidence Classification', 'Git commit');
  validateIsoDateField(errors, fields, 'Evidence Classification', 'Date');
  if (fields.get('Release level') === 'production deployment candidate' && fields.get('Environment') !== 'testnet') {
    errors.push(
      'Evidence Classification: production deployment candidate requires exact Evidence Classification Environment = testnet',
    );
  }

  if (fields.get('Trust path') === 'transitional trusted burn path') {
    errors.push('Evidence Classification: Trust path must be trustless burn proof path before Gate 5 evidence can pass');
  }

  return errors;
}

function validatePublicationDecision(
  fields: Partial<PublicationDecisionFields>,
  markdown: string,
): string[] {
  const publicationSection = sectionBetween(markdown, '## Publication Decision', '## Reviewer Sign-Off');
  const rawFields = parseTwoColumnTable(publicationSection);
  const errors = validateDuplicateRequiredFields(
    'Publication Decision',
    parseTwoColumnFieldNames(publicationSection),
    REQUIRED_PUBLICATION_DECISION_FIELDS,
  );

  for (const field of REQUIRED_PUBLICATION_DECISION_FIELDS) {
    if (isBlank(rawFields.get(field) ?? '')) errors.push(`Publication Decision: ${field} is required`);
  }

  validateAllowedField(errors, rawFields, 'Publication Decision', 'Trustless burn verification implemented', ALLOWED_YES_NO);
  validateAllowedField(errors, rawFields, 'Publication Decision', 'Release supported', ALLOWED_RELEASE_LEVELS);
  validateAllowedField(errors, rawFields, 'Publication Decision', 'Production-ready claim allowed', ALLOWED_YES_NO);
  validateAllowedField(errors, rawFields, 'Publication Decision', 'Testnet production-candidate claim allowed', ALLOWED_YES_NO);
  validateAllowedField(errors, rawFields, 'Publication Decision', 'Transitional trusted burn path disabled', ALLOWED_YES_NO);
  validateAllowedField(errors, rawFields, 'Publication Decision', 'Release notes updated', ALLOWED_YES_NO);

  if (fields.trustlessBurnVerificationImplemented === 'no') {
    errors.push('Publication Decision: Trustless burn verification implemented must be yes before Gate 5 evidence can pass');
  }
  if (fields.transitionalTrustedBurnPathDisabled === 'no') {
    errors.push('Publication Decision: transitional trusted burn path must be disabled before Gate 5 evidence can pass');
  }
  if (fields.releaseNotesUpdated === 'no') {
    errors.push('Publication Decision: release notes must be updated before Gate 5 evidence can pass');
  }

  const releaseLevel = parseTwoColumnTable(
    sectionBetween(markdown, '## Evidence Classification', '## Required Components'),
  ).get('Release level') ?? '';
  if (!isBlank(fields.releaseSupported ?? '') && fields.releaseSupported !== releaseLevel) {
    errors.push('Publication Decision: Release supported must match Evidence Classification Release level');
  }
  if (releaseLevel === 'production deployment candidate' && fields.releaseSupported !== 'production deployment candidate') {
    errors.push(
      'Publication Decision: production deployment candidate evidence requires exact `Release supported = production deployment candidate`',
    );
  }
  if (fields.productionReadyClaimAllowed === 'yes') {
    errors.push(
      'Publication Decision: Production-ready claim allowed must be no; trustless burn evidence can only support testnet production-candidate claims',
    );
  }
  if (
    fields.testnetProductionCandidateClaimAllowed === 'yes' &&
    releaseLevel !== 'production deployment candidate'
  ) {
    errors.push('Publication Decision: testnet production-candidate claim requires production deployment candidate evidence');
  }
  if (
    releaseLevel === 'production deployment candidate' &&
    fields.testnetProductionCandidateClaimAllowed !== 'yes'
  ) {
    errors.push(
      'Publication Decision: production deployment candidate evidence requires exact `Testnet production-candidate claim allowed = yes`',
    );
  }

  if (!isBlank(fields.criticalHighFindingsOpen ?? '') && !isExactZero(fields.criticalHighFindingsOpen ?? '')) {
    errors.push('Publication Decision: critical/high findings open must be 0 before Gate 5 evidence can pass');
  }
  errors.push(
    ...validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Decision: Reviewer decision summary',
      summary: fields.reviewerDecisionSummary ?? '',
      releaseSupported: fields.releaseSupported,
      releaseSupportFieldLabel: 'Release supported',
      productionReadyClaimAllowed: fields.productionReadyClaimAllowed,
      testnetProductionCandidateClaimAllowed: fields.testnetProductionCandidateClaimAllowed,
      requireNumericCriticalHighFindingClosure: true,
    }),
  );
  if (
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    hasContradictoryTrustlessBurnDecisionBinding(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary must not include contradictory trustless-burn decision bindings',
    );
  }
  if (
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    !isActionableReviewerDecisionSummary(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary must mention release support, trustless burn verification implementation, production-ready claim handling, testnet production-candidate claim handling, transitional trusted burn path handling, and critical/high findings',
    );
  }
  if (
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    !hasExactTrustlessBurnVerificationImplementedBinding(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary must use exact Trustless burn verification implemented = yes',
    );
  }
  if (
    fields.productionReadyClaimAllowed === 'no' &&
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    !hasExactProductionReadyClaimDeniedBinding(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary must use exact Production-ready claim allowed = no',
    );
  }
  if (
    (fields.testnetProductionCandidateClaimAllowed === 'yes' ||
      fields.testnetProductionCandidateClaimAllowed === 'no') &&
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    !hasExactTestnetProductionCandidateClaimAllowedBinding(
      fields.reviewerDecisionSummary ?? '',
      fields.testnetProductionCandidateClaimAllowed,
    )
  ) {
    errors.push(
      `Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = ${fields.testnetProductionCandidateClaimAllowed}`,
    );
  }
  if (
    !isBlank(fields.releaseSupported ?? '') &&
    fields.releaseSupported !== 'none' &&
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    !hasExactReleaseSupportedBinding(fields.reviewerDecisionSummary ?? '', fields.releaseSupported ?? '')
  ) {
    errors.push(
      `Publication Decision: Reviewer decision summary must use exact Release supported = ${fields.releaseSupported}`,
    );
  }
  if (
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    usesProseOnlyTrustedPathClosure(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary must use exact Transitional trusted burn path disabled = yes',
    );
  }
  if (
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    usesNonExactCriticalHighFindingClosure(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary must use exact Critical/high findings open = 0',
    );
  }
  if (leavesCriticalHighFindingsOpen(fields.reviewerDecisionSummary ?? '')) {
    errors.push('Publication Decision: Reviewer decision summary must not leave critical/high findings open');
  }
  if (
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    !disablesTransitionalTrustedBurnPathInReviewerSummary(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary: transitional trusted burn path handling must be disabled, blocked, or not allowed',
    );
  }
  if (approvesTrustedFallbackPath(fields.reviewerDecisionSummary ?? '')) {
    errors.push('Publication Decision: Reviewer decision summary must not approve trusted fallback paths');
  }
  if (!isBlank(fields.requiredReleaseChecklistUpdates ?? '')) {
    if (!hasEvidenceMarker(fields.requiredReleaseChecklistUpdates ?? '')) {
      errors.push('Publication Decision: Required release checklist updates must include a link, command, or artifact marker');
    } else if (!hasCompletedEvidenceTarget(fields.requiredReleaseChecklistUpdates ?? '')) {
      errors.push(
        'Publication Decision: Required release checklist updates must include a completed Gate 5 checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
    } else if (!identifiesGate5ChecklistUpdateEvidence(fields.requiredReleaseChecklistUpdates ?? '')) {
      errors.push(
        'Publication Decision: Required release checklist updates must identify completed Gate 5 checklist update evidence',
      );
    }
    if (!hasNoContradictoryTrustlessBurnEvidenceMarker(fields.requiredReleaseChecklistUpdates ?? '')) {
      errors.push(
        'Publication Decision: Required release checklist updates must not include contradictory trustless-burn failure markers',
      );
    }
    if (hasContradictoryTrustlessBurnDecisionBinding(fields.requiredReleaseChecklistUpdates ?? '')) {
      errors.push(
        'Publication Decision: Required release checklist updates must not include contradictory trustless-burn decision bindings',
      );
    }
    if (containsMainnetProductionClaim(fields.requiredReleaseChecklistUpdates ?? '')) {
      errors.push(
        'Publication Decision: Required release checklist updates must not contain mainnet production claim wording',
      );
    }
    if (containsProductionReadyClaim(fields.requiredReleaseChecklistUpdates ?? '')) {
      errors.push(
        'Publication Decision: Required release checklist updates must not contain production-ready claim wording',
      );
    }
    if (
      fields.productionReadyClaimAllowed === 'no' &&
      !hasExactProductionReadyClaimDeniedBinding(fields.requiredReleaseChecklistUpdates ?? '')
    ) {
      errors.push(
        'Publication Decision: Required release checklist updates must use exact Production-ready claim allowed = no',
      );
    }
    if (approvesTrustedFallbackPath(fields.requiredReleaseChecklistUpdates ?? '')) {
      errors.push('Publication Decision: Required release checklist updates must not approve trusted fallback paths');
    }
    if (usesProseOnlyTrustedPathClosure(fields.requiredReleaseChecklistUpdates ?? '')) {
      errors.push(
        'Publication Decision: Required release checklist updates must use exact Transitional trusted burn path disabled = yes; prose-only trusted path closure is not accepted',
      );
    }
    if (
      fields.transitionalTrustedBurnPathDisabled === 'yes' &&
      !hasExactTransitionalTrustedBurnPathDisabledBinding(fields.requiredReleaseChecklistUpdates ?? '')
    ) {
      errors.push(
        'Publication Decision: Required release checklist updates must use exact Transitional trusted burn path disabled = yes',
      );
    }
    if (
      fields.trustlessBurnVerificationImplemented === 'yes' &&
      !hasExactTrustlessBurnVerificationImplementedBinding(fields.requiredReleaseChecklistUpdates ?? '')
    ) {
      errors.push(
        'Publication Decision: Required release checklist updates must use exact Trustless burn verification implemented = yes',
      );
    }
    if (
      releaseLevel === 'production deployment candidate' &&
      !hasExactProductionCandidateReleaseSupportedBinding(fields.requiredReleaseChecklistUpdates ?? '')
    ) {
      errors.push(
        'Publication Decision: Required release checklist updates must use exact Release supported = production deployment candidate',
      );
    }
    if (
      (fields.testnetProductionCandidateClaimAllowed === 'yes' ||
        fields.testnetProductionCandidateClaimAllowed === 'no') &&
      !hasExactTestnetProductionCandidateClaimAllowedBinding(
        fields.requiredReleaseChecklistUpdates ?? '',
        fields.testnetProductionCandidateClaimAllowed,
      )
    ) {
      errors.push(
        `Publication Decision: Required release checklist updates must use exact Testnet production-candidate claim allowed = ${fields.testnetProductionCandidateClaimAllowed}`,
      );
    }
    if (
      (isExactZero(fields.criticalHighFindingsOpen ?? '') &&
        !hasExactCriticalHighFindingsOpenBinding(fields.requiredReleaseChecklistUpdates ?? '')) ||
      usesNonExactCriticalHighFindingClosure(fields.requiredReleaseChecklistUpdates ?? '')
    ) {
      errors.push(
        'Publication Decision: Required release checklist updates must use exact numeric Critical/high findings open = 0; textual or shorthand critical/high finding terms are not accepted',
      );
    }
  }
  if (!isBlank(fields.requiredReleaseNoteUpdates ?? '')) {
    if (!hasEvidenceMarker(fields.requiredReleaseNoteUpdates ?? '')) {
      errors.push('Publication Decision: Required release-note updates must include a link, command, or artifact marker');
    } else if (!hasCompletedEvidenceTarget(fields.requiredReleaseNoteUpdates ?? '')) {
      errors.push(
        'Publication Decision: Required release-note updates must include a completed Gate 5 release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
    } else if (!identifiesGate5ReleaseNoteUpdateEvidence(fields.requiredReleaseNoteUpdates ?? '')) {
      errors.push(
        'Publication Decision: Required release-note updates must identify completed Gate 5 release-note update evidence',
      );
    }
    if (!hasNoContradictoryTrustlessBurnEvidenceMarker(fields.requiredReleaseNoteUpdates ?? '')) {
      errors.push(
        'Publication Decision: Required release-note updates must not include contradictory trustless-burn failure markers',
      );
    }
    if (hasContradictoryTrustlessBurnDecisionBinding(fields.requiredReleaseNoteUpdates ?? '')) {
      errors.push(
        'Publication Decision: Required release-note updates must not include contradictory trustless-burn decision bindings',
      );
    }
    if (containsMainnetProductionClaim(fields.requiredReleaseNoteUpdates ?? '')) {
      errors.push(
        'Publication Decision: Required release-note updates must not contain mainnet production claim wording',
      );
    }
    if (containsProductionReadyClaim(fields.requiredReleaseNoteUpdates ?? '')) {
      errors.push(
        'Publication Decision: Required release-note updates must not contain production-ready claim wording',
      );
    }
    if (
      fields.productionReadyClaimAllowed === 'no' &&
      !hasExactProductionReadyClaimDeniedBinding(fields.requiredReleaseNoteUpdates ?? '')
    ) {
      errors.push(
        'Publication Decision: Required release-note updates must use exact Production-ready claim allowed = no',
      );
    }
    if (approvesTrustedFallbackPath(fields.requiredReleaseNoteUpdates ?? '')) {
      errors.push('Publication Decision: Required release-note updates must not approve trusted fallback paths');
    }
    if (usesProseOnlyTrustedPathClosure(fields.requiredReleaseNoteUpdates ?? '')) {
      errors.push(
        'Publication Decision: Required release-note updates must use exact Transitional trusted burn path disabled = yes; prose-only trusted path closure is not accepted',
      );
    }
    if (
      fields.transitionalTrustedBurnPathDisabled === 'yes' &&
      !hasExactTransitionalTrustedBurnPathDisabledBinding(fields.requiredReleaseNoteUpdates ?? '')
    ) {
      errors.push(
        'Publication Decision: Required release-note updates must use exact Transitional trusted burn path disabled = yes',
      );
    }
    if (
      fields.trustlessBurnVerificationImplemented === 'yes' &&
      !hasExactTrustlessBurnVerificationImplementedBinding(fields.requiredReleaseNoteUpdates ?? '')
    ) {
      errors.push(
        'Publication Decision: Required release-note updates must use exact Trustless burn verification implemented = yes',
      );
    }
    if (
      releaseLevel === 'production deployment candidate' &&
      !hasExactProductionCandidateReleaseSupportedBinding(fields.requiredReleaseNoteUpdates ?? '')
    ) {
      errors.push(
        'Publication Decision: Required release-note updates must use exact Release supported = production deployment candidate',
      );
    }
    if (
      (fields.testnetProductionCandidateClaimAllowed === 'yes' ||
        fields.testnetProductionCandidateClaimAllowed === 'no') &&
      !hasExactTestnetProductionCandidateClaimAllowedBinding(
        fields.requiredReleaseNoteUpdates ?? '',
        fields.testnetProductionCandidateClaimAllowed,
      )
    ) {
      errors.push(
        `Publication Decision: Required release-note updates must use exact Testnet production-candidate claim allowed = ${fields.testnetProductionCandidateClaimAllowed}`,
      );
    }
    if (
      (isExactZero(fields.criticalHighFindingsOpen ?? '') &&
        !hasExactCriticalHighFindingsOpenBinding(fields.requiredReleaseNoteUpdates ?? '')) ||
      usesNonExactCriticalHighFindingClosure(fields.requiredReleaseNoteUpdates ?? '')
    ) {
      errors.push(
        'Publication Decision: Required release-note updates must use exact numeric Critical/high findings open = 0; textual or shorthand critical/high finding terms are not accepted',
      );
    }
  }
  if (
    hasCompletedTrustlessBurnChecklistUpdateEvidence(fields.requiredReleaseChecklistUpdates ?? '') &&
    hasCompletedTrustlessBurnReleaseNoteUpdateEvidence(fields.requiredReleaseNoteUpdates ?? '') &&
    haveSharedConcreteEvidenceTarget(
      fields.requiredReleaseChecklistUpdates ?? '',
      fields.requiredReleaseNoteUpdates ?? '',
    )
  ) {
    errors.push(
      'Publication Decision: required release checklist updates and required release-note updates must use distinct completed Gate 5 evidence targets',
    );
  }

  return errors;
}

function validateComponentRows(rows: RequiredComponentRow[]): string[] {
  const errors = validateRequiredNames('Required Components', rows.map(row => row.component), REQUIRED_COMPONENTS);

  for (const row of rows) {
    if (!REQUIRED_COMPONENTS.includes(row.component)) {
      errors.push(`Required Components: ${row.component}: unexpected component`);
    }
    validateLinkedStatus(errors, 'Required Components', row.component, row.status);
    if (isBlank(row.requiredProperty)) {
      errors.push(`Required Components: ${row.component}: required property is required`);
    }
    if (!isBlank(row.requiredProperty) && !hasNoContradictoryTrustlessBurnEvidenceMarker(row.requiredProperty)) {
      errors.push(`Required Components: ${row.component}: required property must not include contradictory trustless-burn failure markers`);
    }
    for (const marker of REQUIRED_COMPONENT_PROPERTY_MARKERS[row.component] ?? []) {
      if (!marker.pattern.test(row.requiredProperty)) {
        errors.push(`Required Components: ${row.component}: ${marker.message}`);
      }
    }
    if (row.status === 'linked') {
      if (!hasEvidenceMarker(row.evidence)) {
        errors.push(`Required Components: ${row.component}: linked status requires an evidence marker`);
      } else if (!hasCompletedTrustlessBurnEvidenceTarget(row.evidence)) {
        errors.push(
          `Required Components: ${row.component}: linked status requires completed component evidence, a non-template evidence link, or an artifact marker`,
        );
      }
      if (!hasNoContradictoryTrustlessBurnEvidenceMarker(row.evidence)) {
        errors.push(`Required Components: ${row.component}: evidence must not include contradictory trustless-burn failure markers`);
      }
      if (approvesTrustedFallbackPath(row.evidence)) {
        errors.push(`Required Components: ${row.component}: evidence must not approve trusted fallback paths`);
      }
    }
  }

  return errors;
}

function validateCommitmentRows(rows: CommitmentFormatRow[]): string[] {
  const errors = validateRequiredNames('Commitment Format', rows.map(row => row.field), REQUIRED_COMMITMENT_FIELDS);

  for (const row of rows) {
    if (!REQUIRED_COMMITMENT_FIELDS.includes(row.field)) {
      errors.push(`Commitment Format: ${row.field}: unexpected field`);
    }
    validateLinkedStatus(errors, 'Commitment Format', row.field, row.status);
    if (isBlank(row.valueOrEncoding)) {
      errors.push(`Commitment Format: ${row.field}: value or encoding is required`);
    }
    if (!isBlank(row.valueOrEncoding) && !hasNoContradictoryTrustlessBurnEvidenceMarker(row.valueOrEncoding)) {
      errors.push(`Commitment Format: ${row.field}: value or encoding must not include contradictory trustless-burn failure markers`);
    }
    if (!isBlank(row.valueOrEncoding) && CONCRETE_COMMITMENT_HEX_FIELDS.has(row.field)) {
      validateExactlyOneHex32Value(
        errors,
        'Commitment Format',
        row.field,
        row.valueOrEncoding,
        'value or encoding',
      );
    }
    if (!isBlank(row.valueOrEncoding) && CONCRETE_COMMITMENT_INTEGER_FIELDS.has(row.field)) {
      validateIntegerValue(errors, 'Commitment Format', row.field, row.valueOrEncoding, 'value or encoding');
    }
    if (row.status === 'linked') {
      if (!hasEvidenceMarker(row.evidence)) {
        errors.push(`Commitment Format: ${row.field}: linked status requires an evidence marker`);
      } else if (!hasCompletedTrustlessBurnEvidenceTarget(row.evidence)) {
        errors.push(
          `Commitment Format: ${row.field}: linked status requires completed commitment evidence, a non-template evidence link, or an artifact marker`,
        );
      }
      if (!hasNoContradictoryTrustlessBurnEvidenceMarker(row.evidence)) {
        errors.push(`Commitment Format: ${row.field}: evidence must not include contradictory trustless-burn failure markers`);
      }
      if (approvesTrustedFallbackPath(row.evidence)) {
        errors.push(`Commitment Format: ${row.field}: evidence must not approve trusted fallback paths`);
      }
    }
    for (const marker of REQUIRED_COMMITMENT_FIELD_MARKERS[row.field] ?? []) {
      if (!marker.pattern.test(row.valueOrEncoding)) {
        errors.push(`Commitment Format: ${row.field}: ${marker.message}`);
      }
    }
  }

  return errors;
}

function validateAnchorObservationReport(
  componentRows: RequiredComponentRow[],
  commitmentRows: CommitmentFormatRow[],
): string[] {
  const row = componentRows.find(candidate => candidate.component === 'Ergo extension-section anchoring');
  if (!row || row.status !== 'linked') return [];

  const reportTarget = parseAnchorObservationReportTarget(row.evidence);
  if (!reportTarget) {
    return [
      'Required Components: Ergo extension-section anchoring: Anchor observation report target is required before linked extension anchoring can pass',
    ];
  }

  const read = readEvidenceJsonTarget(reportTarget, 'Anchor observation report');
  if (read.errors.length > 0) {
    return read.errors.map(error => `Anchor observation report: ${error}`);
  }
  if (!isRecord(read.json)) {
    return ['Anchor observation report: JSON report must be an object'];
  }

  const report = read.json;
  const errors: string[] = [];
  const expectedBridgeEventRootHex = commitmentHexField(commitmentRows, 'bridgeEventRoot');
  const expectedErgoAnchorHeight = commitmentIntegerField(commitmentRows, 'ergoAnchorHeight');

  validateAnchorObservationAllowedFields(errors, 'top-level', report, ANCHOR_OBSERVATION_REPORT_TOP_LEVEL_FIELDS);
  if (report.schemaVersion !== 1) {
    errors.push('Anchor observation report: schemaVersion must be 1');
  }
  if (report.command !== 'trustless:anchor-observe') {
    errors.push('Anchor observation report: command must be trustless:anchor-observe');
  }
  if (report.status !== 'LINKED') {
    errors.push('Anchor observation report: status must be LINKED');
  }
  if (report.extensionKey !== '0401') {
    errors.push('Anchor observation report: extensionKey must be 0401');
  }
  validateAnchorObservationIso(errors, 'observedAt', report.observedAt);
  validateAnchorObservationPositiveInteger(errors, 'heightsScanned', report.heightsScanned);
  validateAnchorObservationPositiveInteger(errors, 'extensionReadsSucceeded', report.extensionReadsSucceeded);
  validateAnchorObservationNonNegativeInteger(errors, 'extensionReadsFailed', report.extensionReadsFailed);
  validateAnchorObservationNonNegativeInteger(errors, 'minHeight', report.minHeight);
  validateAnchorObservationNonNegativeInteger(errors, 'maxHeight', report.maxHeight);
  if (
    typeof report.minHeight === 'number' &&
    typeof report.maxHeight === 'number' &&
    report.minHeight > report.maxHeight
  ) {
    errors.push('Anchor observation report: minHeight must be less than or equal to maxHeight');
  }
  if (!Array.isArray(report.readFailures)) {
    errors.push('Anchor observation report: readFailures must be an array');
  }

  if (!expectedBridgeEventRootHex) {
    errors.push('Anchor observation report: Commitment Format bridgeEventRoot must expose one 32-byte value');
  } else if (normalizeOptionalHex32(report.bridgeEventRootHex) !== expectedBridgeEventRootHex) {
    errors.push('Anchor observation report: bridgeEventRootHex must match Commitment Format bridgeEventRoot');
  }

  if (expectedErgoAnchorHeight === undefined) {
    errors.push('Anchor observation report: Commitment Format ergoAnchorHeight must expose one non-negative integer');
  }

  if (!isRecord(report.linkedAnchor)) {
    errors.push('Anchor observation report: linkedAnchor is required when status is LINKED');
  } else {
    validateAnchorObservationAllowedFields(
      errors,
      'linkedAnchor',
      report.linkedAnchor,
      ANCHOR_OBSERVATION_LINKED_ANCHOR_FIELDS,
    );
    if (report.linkedAnchor.key !== '0401') {
      errors.push('Anchor observation report: linkedAnchor.key must be 0401');
    }
    if (expectedBridgeEventRootHex && normalizeOptionalHex32(report.linkedAnchor.bridgeEventRootHex) !== expectedBridgeEventRootHex) {
      errors.push('Anchor observation report: linkedAnchor.bridgeEventRootHex must match Commitment Format bridgeEventRoot');
    }
    if (normalizeOptionalHex32(report.linkedAnchor.headerId) === undefined) {
      errors.push('Anchor observation report: linkedAnchor.headerId must be a 32-byte hex string');
    }
    const linkedAnchorHeight = report.linkedAnchor.ergoAnchorHeight;
    if (
      typeof linkedAnchorHeight !== 'number' ||
      !Number.isSafeInteger(linkedAnchorHeight) ||
      linkedAnchorHeight < 0
    ) {
      errors.push('Anchor observation report: linkedAnchor.ergoAnchorHeight must be a non-negative safe integer');
    } else {
      if (expectedErgoAnchorHeight !== undefined && linkedAnchorHeight !== expectedErgoAnchorHeight) {
        errors.push('Anchor observation report: linkedAnchor.ergoAnchorHeight must match Commitment Format ergoAnchorHeight');
      }
      if (
        typeof report.minHeight === 'number' &&
        typeof report.maxHeight === 'number' &&
        (linkedAnchorHeight < report.minHeight || linkedAnchorHeight > report.maxHeight)
      ) {
        errors.push('Anchor observation report: linkedAnchor.ergoAnchorHeight must be within minHeight/maxHeight');
      }
    }
  }

  if (!isRecord(report.boundary)) {
    errors.push('Anchor observation report: boundary must be an object');
  } else {
    validateAnchorObservationAllowedFields(errors, 'boundary', report.boundary, ANCHOR_OBSERVATION_BOUNDARY_FIELDS);
    requireAnchorBoundary(errors, report.boundary, 'readOnly', true);
    requireAnchorBoundary(errors, report.boundary, 'publicObservationInputOnly', true);
    requireAnchorBoundary(errors, report.boundary, 'deploymentStateOpened', false);
    requireAnchorBoundary(errors, report.boundary, 'runtimeDatabaseOpened', false);
    requireAnchorBoundary(errors, report.boundary, 'secretOrEnvironmentFileRead', false);
    requireAnchorBoundary(errors, report.boundary, 'signingOrWalletMaterialRead', false);
    requireAnchorBoundary(errors, report.boundary, 'transactionBroadcastOrMutation', false);
    requireAnchorBoundary(errors, report.boundary, 'gate5Closure', false);
    requireAnchorBoundary(errors, report.boundary, 'settlementReadiness', false);
    requireAnchorBoundary(errors, report.boundary, 'productionClaimSupport', false);
    requireAnchorBoundary(errors, report.boundary, 'testnetProductionCandidateClaimSupport', false);
  }

  return errors;
}

function parseAnchorObservationReportTarget(evidence: string): string | undefined {
  const match = /\bAnchor observation report:\s*([^;\n|]+)/i.exec(evidence);
  return match?.[1]?.trim();
}

function parseContractEquivalentAcceptanceReportTarget(evidence: string): string | undefined {
  const match = /\bContract-equivalent acceptance report:\s*([^;\n|]+)/i.exec(evidence);
  return match?.[1]?.trim();
}

function commitmentHexField(rows: CommitmentFormatRow[], field: string): string | undefined {
  const row = rows.find(candidate => candidate.field === field);
  if (!row) return undefined;
  const values = extractHex32Values(row.valueOrEncoding).map(value => value.toLowerCase());
  return values.length === 1 ? values[0] : undefined;
}

function commitmentIntegerField(rows: CommitmentFormatRow[], field: string): number | undefined {
  const row = rows.find(candidate => candidate.field === field);
  if (!row) return undefined;
  const values = [...row.valueOrEncoding.matchAll(NON_NEGATIVE_INTEGER_TOKEN_PATTERN)].map(match => match[0]);
  if (values.length !== 1) return undefined;
  const parsed = Number(values[0]);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function validateAnchorObservationAllowedFields(
  errors: string[],
  label: string,
  value: Record<string, unknown>,
  allowedFields: Set<string>,
): void {
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) {
      errors.push(`Anchor observation report: ${label} unexpected field ${field} is not allowed`);
    }
  }
}

function validateAnchorObservationIso(errors: string[], field: string, value: unknown): void {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    errors.push(`Anchor observation report: ${field} must be an ISO-compatible timestamp`);
  }
}

function validateAnchorObservationPositiveInteger(errors: string[], field: string, value: unknown): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    errors.push(`Anchor observation report: ${field} must be a positive safe integer`);
  }
}

function validateAnchorObservationNonNegativeInteger(errors: string[], field: string, value: unknown): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    errors.push(`Anchor observation report: ${field} must be a non-negative safe integer`);
  }
}

function normalizeOptionalHex32(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  return /^[0-9a-fA-F]{64}$/.test(clean) ? clean.toLowerCase() : undefined;
}

function requireAnchorBoundary(
  errors: string[],
  boundary: Record<string, unknown>,
  field: string,
  expected: boolean,
): void {
  if (boundary[field] !== expected) {
    errors.push(`Anchor observation report: boundary.${field} must be ${expected}`);
  }
}

function validateSpvTrackerObservationReport(
  componentRows: RequiredComponentRow[],
  commitmentRows: CommitmentFormatRow[],
): string[] {
  const row = componentRows.find(candidate => candidate.component === 'SPV relay contract or tracker');
  if (!row || row.status !== 'linked') return [];

  const reportTarget = parseSpvTrackerObservationReportTarget(row.evidence);
  if (!reportTarget) {
    return [
      'Required Components: SPV relay contract or tracker: SPV tracker observation report target is required before linked SPV tracker evidence can pass',
    ];
  }

  const read = readEvidenceJsonTarget(reportTarget, 'SPV tracker observation report');
  if (read.errors.length > 0) {
    return read.errors.map(error => `SPV tracker observation report: ${error}`);
  }
  if (!isRecord(read.json)) {
    return ['SPV tracker observation report: JSON report must be an object'];
  }

  const report = read.json;
  const errors: string[] = [];
  const expectedSidechainIdHex = commitmentHexField(commitmentRows, 'sidechainId');
  const expectedSidechainHeight = commitmentIntegerField(commitmentRows, 'sidechainHeight');
  const expectedSidechainHeaderHashHex = commitmentHexField(commitmentRows, 'sidechainHeaderHash');
  const expectedBridgeEventRootHex = commitmentHexField(commitmentRows, 'bridgeEventRoot');
  const expectedErgoAnchorHeight = commitmentIntegerField(commitmentRows, 'ergoAnchorHeight');

  validateSpvTrackerObservationAllowedFields(
    errors,
    'top-level',
    report,
    SPV_TRACKER_OBSERVATION_REPORT_TOP_LEVEL_FIELDS,
  );
  if (report.schemaVersion !== 1) {
    errors.push('SPV tracker observation report: schemaVersion must be 1');
  }
  if (report.command !== 'trustless:spv-tracker-observe') {
    errors.push('SPV tracker observation report: command must be trustless:spv-tracker-observe');
  }
  if (report.status !== 'LINKED') {
    errors.push('SPV tracker observation report: status must be LINKED');
  }
  validateSpvTrackerObservationIso(errors, 'observedAt', report.observedAt);
  validateSpvTrackerObservationPositiveInteger(errors, 'historyLength', report.historyLength);

  const trackerDigestHex = normalizeOptionalHexBytes(report.trackerDigestHex, 33);
  const rebuiltTrackerDigestHex = normalizeOptionalHexBytes(report.rebuiltTrackerDigestHex, 33);
  const proofDigestHex = normalizeOptionalHexBytes(report.proofDigestHex, 33);
  const expectedKeyHex = normalizeOptionalHex32(report.expectedKeyHex);
  const expectedValueHex = normalizeOptionalHexBytes(report.expectedValueHex, 36);
  const observedValueHex = normalizeOptionalHexBytes(report.observedValueHex, 36);
  validateSpvTrackerObservationHex(errors, 'trackerDigestHex', trackerDigestHex, '33-byte hex string');
  validateSpvTrackerObservationHex(errors, 'rebuiltTrackerDigestHex', rebuiltTrackerDigestHex, '33-byte hex string');
  validateSpvTrackerObservationHex(errors, 'proofDigestHex', proofDigestHex, '33-byte hex string');
  validateSpvTrackerObservationHex(errors, 'expectedKeyHex', expectedKeyHex, '32-byte hex string');
  validateSpvTrackerObservationHex(errors, 'expectedValueHex', expectedValueHex, '36-byte hex string');
  validateSpvTrackerObservationHex(errors, 'observedValueHex', observedValueHex, '36-byte hex string');
  if (typeof report.getProofHex !== 'string' || !/^[0-9a-fA-F]+$/.test(report.getProofHex) || report.getProofHex.length % 2 !== 0) {
    errors.push('SPV tracker observation report: getProofHex must be non-empty even-length hex');
  }

  if (trackerDigestHex && rebuiltTrackerDigestHex && trackerDigestHex !== rebuiltTrackerDigestHex) {
    errors.push('SPV tracker observation report: rebuiltTrackerDigestHex must match trackerDigestHex');
  }
  if (trackerDigestHex && proofDigestHex && trackerDigestHex !== proofDigestHex) {
    errors.push('SPV tracker observation report: proofDigestHex must match trackerDigestHex');
  }
  if (expectedValueHex && observedValueHex && expectedValueHex !== observedValueHex) {
    errors.push('SPV tracker observation report: observedValueHex must match expectedValueHex');
  }

  if (!expectedSidechainIdHex) {
    errors.push('SPV tracker observation report: Commitment Format sidechainId must expose one 32-byte value');
  }
  if (expectedSidechainHeight === undefined) {
    errors.push('SPV tracker observation report: Commitment Format sidechainHeight must expose one non-negative integer');
  }
  if (!expectedSidechainHeaderHashHex) {
    errors.push('SPV tracker observation report: Commitment Format sidechainHeaderHash must expose one 32-byte value');
  }
  if (!expectedBridgeEventRootHex) {
    errors.push('SPV tracker observation report: Commitment Format bridgeEventRoot must expose one 32-byte value');
  }
  if (expectedErgoAnchorHeight === undefined) {
    errors.push('SPV tracker observation report: Commitment Format ergoAnchorHeight must expose one non-negative integer');
  }

  const entry = validateSpvTrackerObservationExpectedEntry(
    errors,
    report.expectedEntry,
    expectedSidechainIdHex,
    expectedSidechainHeight,
    expectedSidechainHeaderHashHex,
    expectedBridgeEventRootHex,
    expectedErgoAnchorHeight,
  );
  if (entry) {
    try {
      const derivedKey = deriveSpvTrackerKey(entry);
      const derivedValue = encodeSpvTrackerValue(entry);
      if (expectedKeyHex && expectedKeyHex !== derivedKey) {
        errors.push('SPV tracker observation report: expectedKeyHex must match expectedEntry');
      }
      if (expectedValueHex && expectedValueHex !== derivedValue) {
        errors.push('SPV tracker observation report: expectedValueHex must match expectedEntry');
      }
    } catch {
      errors.push('SPV tracker observation report: expectedEntry must derive a valid tracker key/value');
    }
  }

  validateSpvTrackerObservationDecodedValue(
    errors,
    report.decodedValue,
    expectedBridgeEventRootHex,
    expectedErgoAnchorHeight,
  );
  validateSpvTrackerObservationSidechainFinality(
    errors,
    report.sidechainFinality,
    expectedSidechainHeight,
  );
  validateSpvTrackerObservationTrackerBox(errors, report.trackerBox);
  validateSpvTrackerObservationBoundary(errors, report.boundary);

  return errors;
}

function parseSpvTrackerObservationReportTarget(evidence: string): string | undefined {
  const match = /\bSPV tracker observation report:\s*([^;\n|]+)/i.exec(evidence);
  return match?.[1]?.trim();
}

function validateSpvTrackerObservationExpectedEntry(
  errors: string[],
  value: unknown,
  expectedSidechainIdHex: string | undefined,
  expectedSidechainHeight: number | undefined,
  expectedSidechainHeaderHashHex: string | undefined,
  expectedBridgeEventRootHex: string | undefined,
  expectedErgoAnchorHeight: number | undefined,
): SpvTrackerEntry | undefined {
  if (!isRecord(value)) {
    errors.push('SPV tracker observation report: expectedEntry must be an object');
    return undefined;
  }
  validateSpvTrackerObservationAllowedFields(
    errors,
    'expectedEntry',
    value,
    SPV_TRACKER_OBSERVATION_ENTRY_FIELDS,
  );
  const sidechainIdHex = normalizeOptionalHex32(value.sidechainIdHex);
  const sidechainHeaderHashHex = normalizeOptionalHex32(value.sidechainHeaderHashHex);
  const bridgeEventRootHex = normalizeOptionalHex32(value.bridgeEventRootHex);
  const sidechainHeight = value.sidechainHeight;
  const ergoAnchorHeight = value.ergoAnchorHeight;
  if (!sidechainIdHex) {
    errors.push('SPV tracker observation report: expectedEntry.sidechainIdHex must be a 32-byte hex string');
  } else if (expectedSidechainIdHex && sidechainIdHex !== expectedSidechainIdHex) {
    errors.push('SPV tracker observation report: expectedEntry.sidechainIdHex must match Commitment Format sidechainId');
  }
  if (
    typeof sidechainHeight !== 'number' ||
    !Number.isSafeInteger(sidechainHeight) ||
    sidechainHeight < 0
  ) {
    errors.push('SPV tracker observation report: expectedEntry.sidechainHeight must be a non-negative safe integer');
  } else if (expectedSidechainHeight !== undefined && sidechainHeight !== expectedSidechainHeight) {
    errors.push('SPV tracker observation report: expectedEntry.sidechainHeight must match Commitment Format sidechainHeight');
  }
  if (!sidechainHeaderHashHex) {
    errors.push('SPV tracker observation report: expectedEntry.sidechainHeaderHashHex must be a 32-byte hex string');
  } else if (expectedSidechainHeaderHashHex && sidechainHeaderHashHex !== expectedSidechainHeaderHashHex) {
    errors.push('SPV tracker observation report: expectedEntry.sidechainHeaderHashHex must match Commitment Format sidechainHeaderHash');
  }
  if (!bridgeEventRootHex) {
    errors.push('SPV tracker observation report: expectedEntry.bridgeEventRootHex must be a 32-byte hex string');
  } else if (expectedBridgeEventRootHex && bridgeEventRootHex !== expectedBridgeEventRootHex) {
    errors.push('SPV tracker observation report: expectedEntry.bridgeEventRootHex must match Commitment Format bridgeEventRoot');
  }
  if (
    typeof ergoAnchorHeight !== 'number' ||
    !Number.isSafeInteger(ergoAnchorHeight) ||
    ergoAnchorHeight < 0
  ) {
    errors.push('SPV tracker observation report: expectedEntry.ergoAnchorHeight must be a non-negative safe integer');
  } else if (expectedErgoAnchorHeight !== undefined && ergoAnchorHeight !== expectedErgoAnchorHeight) {
    errors.push('SPV tracker observation report: expectedEntry.ergoAnchorHeight must match Commitment Format ergoAnchorHeight');
  }

  if (
    !sidechainIdHex ||
    typeof sidechainHeight !== 'number' ||
    !Number.isSafeInteger(sidechainHeight) ||
    sidechainHeight < 0 ||
    !sidechainHeaderHashHex ||
    !bridgeEventRootHex ||
    typeof ergoAnchorHeight !== 'number' ||
    !Number.isSafeInteger(ergoAnchorHeight) ||
    ergoAnchorHeight < 0
  ) {
    return undefined;
  }
  return {
    sidechainIdHex,
    sidechainHeight,
    sidechainHeaderHashHex,
    bridgeEventRootHex,
    ergoAnchorHeight,
  };
}

function validateSpvTrackerObservationDecodedValue(
  errors: string[],
  value: unknown,
  expectedBridgeEventRootHex: string | undefined,
  expectedErgoAnchorHeight: number | undefined,
): void {
  if (!isRecord(value)) {
    errors.push('SPV tracker observation report: decodedValue must be an object');
    return;
  }
  validateSpvTrackerObservationAllowedFields(
    errors,
    'decodedValue',
    value,
    SPV_TRACKER_OBSERVATION_DECODED_VALUE_FIELDS,
  );
  const bridgeEventRootHex = normalizeOptionalHex32(value.bridgeEventRootHex);
  if (!bridgeEventRootHex) {
    errors.push('SPV tracker observation report: decodedValue.bridgeEventRootHex must be a 32-byte hex string');
  } else if (expectedBridgeEventRootHex && bridgeEventRootHex !== expectedBridgeEventRootHex) {
    errors.push('SPV tracker observation report: decodedValue.bridgeEventRootHex must match Commitment Format bridgeEventRoot');
  }
  const ergoAnchorHeight = value.ergoAnchorHeight;
  if (
    typeof ergoAnchorHeight !== 'number' ||
    !Number.isSafeInteger(ergoAnchorHeight) ||
    ergoAnchorHeight < 0
  ) {
    errors.push('SPV tracker observation report: decodedValue.ergoAnchorHeight must be a non-negative safe integer');
  } else if (expectedErgoAnchorHeight !== undefined && ergoAnchorHeight !== expectedErgoAnchorHeight) {
    errors.push('SPV tracker observation report: decodedValue.ergoAnchorHeight must match Commitment Format ergoAnchorHeight');
  }
}

function validateSpvTrackerObservationSidechainFinality(
  errors: string[],
  value: unknown,
  expectedSidechainHeight: number | undefined,
): void {
  if (!isRecord(value)) {
    errors.push('SPV tracker observation report: sidechainFinality must be an object');
    return;
  }
  validateSpvTrackerObservationAllowedFields(
    errors,
    'sidechainFinality',
    value,
    SPV_TRACKER_OBSERVATION_SIDECHAIN_FINALITY_FIELDS,
  );
  if (typeof value.finalityRule !== 'string' || value.finalityRule.trim().length === 0) {
    errors.push('SPV tracker observation report: sidechainFinality.finalityRule must be a non-empty string');
  }

  const sidechainBlockHeight = value.sidechainBlockHeight;
  const observedSidechainHeight = value.observedSidechainHeight;
  const requiredConfirmations = value.requiredConfirmations;
  const observedConfirmations = value.observedConfirmations;

  if (
    typeof sidechainBlockHeight !== 'number' ||
    !Number.isSafeInteger(sidechainBlockHeight) ||
    sidechainBlockHeight < 0
  ) {
    errors.push('SPV tracker observation report: sidechainFinality.sidechainBlockHeight must be a non-negative safe integer');
  } else if (expectedSidechainHeight !== undefined && sidechainBlockHeight !== expectedSidechainHeight) {
    errors.push('SPV tracker observation report: sidechainFinality.sidechainBlockHeight must match Commitment Format sidechainHeight');
  }

  if (
    typeof observedSidechainHeight !== 'number' ||
    !Number.isSafeInteger(observedSidechainHeight) ||
    observedSidechainHeight < 0
  ) {
    errors.push('SPV tracker observation report: sidechainFinality.observedSidechainHeight must be a non-negative safe integer');
  }
  if (
    typeof requiredConfirmations !== 'number' ||
    !Number.isSafeInteger(requiredConfirmations) ||
    requiredConfirmations <= 0
  ) {
    errors.push('SPV tracker observation report: sidechainFinality.requiredConfirmations must be a positive safe integer');
  }
  if (
    typeof observedConfirmations !== 'number' ||
    !Number.isSafeInteger(observedConfirmations) ||
    observedConfirmations < 0
  ) {
    errors.push('SPV tracker observation report: sidechainFinality.observedConfirmations must be a non-negative safe integer');
  }

  if (
    typeof sidechainBlockHeight === 'number' &&
    Number.isSafeInteger(sidechainBlockHeight) &&
    sidechainBlockHeight >= 0 &&
    typeof observedSidechainHeight === 'number' &&
    Number.isSafeInteger(observedSidechainHeight) &&
    observedSidechainHeight >= 0 &&
    typeof observedConfirmations === 'number' &&
    Number.isSafeInteger(observedConfirmations) &&
    observedConfirmations >= 0 &&
    observedConfirmations !== Math.max(0, observedSidechainHeight - sidechainBlockHeight)
  ) {
    errors.push('SPV tracker observation report: sidechainFinality.observedConfirmations must equal observedSidechainHeight - sidechainBlockHeight floored at zero');
  }
  if (
    typeof observedConfirmations === 'number' &&
    Number.isSafeInteger(observedConfirmations) &&
    observedConfirmations >= 0 &&
    typeof requiredConfirmations === 'number' &&
    Number.isSafeInteger(requiredConfirmations) &&
    requiredConfirmations > 0 &&
    observedConfirmations < requiredConfirmations
  ) {
    errors.push('SPV tracker observation report: sidechainFinality.observedConfirmations must be greater than or equal to requiredConfirmations');
  }
  if (value.status !== 'FINALIZED') {
    errors.push('SPV tracker observation report: sidechainFinality.status must be FINALIZED');
  }
}

function validateSpvTrackerObservationTrackerBox(errors: string[], value: unknown): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    errors.push('SPV tracker observation report: trackerBox must be an object');
    return;
  }
  validateSpvTrackerObservationAllowedFields(
    errors,
    'trackerBox',
    value,
    SPV_TRACKER_OBSERVATION_TRACKER_BOX_FIELDS,
  );
  if (!normalizeOptionalHex32(value.boxId)) {
    errors.push('SPV tracker observation report: trackerBox.boxId must be a 32-byte hex string');
  }
  if (!normalizeOptionalHex32(value.nftId)) {
    errors.push('SPV tracker observation report: trackerBox.nftId must be a 32-byte hex string');
  }
}

function validateSpvTrackerObservationBoundary(errors: string[], value: unknown): void {
  if (!isRecord(value)) {
    errors.push('SPV tracker observation report: boundary must be an object');
    return;
  }
  validateSpvTrackerObservationAllowedFields(
    errors,
    'boundary',
    value,
    SPV_TRACKER_OBSERVATION_BOUNDARY_FIELDS,
  );
  requireSpvTrackerObservationBoundary(errors, value, 'readOnly', true);
  requireSpvTrackerObservationBoundary(errors, value, 'publicObservationInputOnly', true);
  requireSpvTrackerObservationBoundary(errors, value, 'deploymentStateOpened', false);
  requireSpvTrackerObservationBoundary(errors, value, 'runtimeDatabaseOpened', false);
  requireSpvTrackerObservationBoundary(errors, value, 'secretOrEnvironmentFileRead', false);
  requireSpvTrackerObservationBoundary(errors, value, 'signingOrWalletMaterialRead', false);
  requireSpvTrackerObservationBoundary(errors, value, 'nodeOrRpcRequestPerformed', false);
  requireSpvTrackerObservationBoundary(errors, value, 'transactionBroadcastOrMutation', false);
  requireSpvTrackerObservationBoundary(errors, value, 'gate5Closure', false);
  requireSpvTrackerObservationBoundary(errors, value, 'settlementReadiness', false);
  requireSpvTrackerObservationBoundary(errors, value, 'productionClaimSupport', false);
  requireSpvTrackerObservationBoundary(errors, value, 'testnetProductionCandidateClaimSupport', false);
}

function validateSpvTrackerObservationAllowedFields(
  errors: string[],
  label: string,
  value: Record<string, unknown>,
  allowedFields: Set<string>,
): void {
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) {
      errors.push(`SPV tracker observation report: ${label} unexpected field ${field} is not allowed`);
    }
  }
}

function validateSpvTrackerObservationIso(errors: string[], field: string, value: unknown): void {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    errors.push(`SPV tracker observation report: ${field} must be an ISO-compatible timestamp`);
  }
}

function validateSpvTrackerObservationPositiveInteger(errors: string[], field: string, value: unknown): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    errors.push(`SPV tracker observation report: ${field} must be a positive safe integer`);
  }
}

function validateSpvTrackerObservationHex(
  errors: string[],
  field: string,
  normalized: string | undefined,
  label: string,
): void {
  if (!normalized) {
    errors.push(`SPV tracker observation report: ${field} must be a ${label}`);
  }
}

function normalizeOptionalHexBytes(value: unknown, expectedBytes: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  return new RegExp(`^[0-9a-fA-F]{${expectedBytes * 2}}$`).test(clean)
    ? clean.toLowerCase()
    : undefined;
}

function requireSpvTrackerObservationBoundary(
  errors: string[],
  boundary: Record<string, unknown>,
  field: string,
  expected: boolean,
): void {
  if (boundary[field] !== expected) {
    errors.push(`SPV tracker observation report: boundary.${field} must be ${expected}`);
  }
}

function validateObservationReconciliationReport(
  componentRows: RequiredComponentRow[],
  commitmentRows: CommitmentFormatRow[],
): string[] {
  const anchorRow = componentRows.find(candidate => candidate.component === 'Ergo extension-section anchoring');
  const spvRow = componentRows.find(candidate => candidate.component === 'SPV relay contract or tracker');
  if (anchorRow?.status !== 'linked' || spvRow?.status !== 'linked') return [];

  const anchorReconciliationTarget = parseObservationReconciliationReportTarget(anchorRow.evidence);
  const spvReconciliationTarget = parseObservationReconciliationReportTarget(spvRow.evidence);
  if (!anchorReconciliationTarget && !spvReconciliationTarget) {
    return [
      'Required Components: Observation reconciliation report target is required before linked anchor and SPV tracker evidence can pass',
    ];
  }

  const errors: string[] = [];
  if (
    anchorReconciliationTarget &&
    spvReconciliationTarget &&
    normalizeObservationReconciliationTarget(anchorReconciliationTarget) !==
      normalizeObservationReconciliationTarget(spvReconciliationTarget)
  ) {
    errors.push(
      'Observation reconciliation report: anchor and SPV component rows must reference the same reconciliation report target',
    );
  }

  const reportTarget = anchorReconciliationTarget ?? spvReconciliationTarget;
  if (!reportTarget) return errors;

  const read = readEvidenceJsonTarget(reportTarget, 'Observation reconciliation report');
  if (read.errors.length > 0) {
    return [
      ...errors,
      ...read.errors.map(error => `Observation reconciliation report: ${error}`),
    ];
  }
  if (!isRecord(read.json)) {
    return [...errors, 'Observation reconciliation report: JSON report must be an object'];
  }

  const report = read.json;
  const expectedBridgeEventRootHex = commitmentHexField(commitmentRows, 'bridgeEventRoot');
  const expectedErgoAnchorHeight = commitmentIntegerField(commitmentRows, 'ergoAnchorHeight');
  const anchorObservationReportTarget = parseAnchorObservationReportTarget(anchorRow.evidence);
  const spvTrackerObservationReportTarget = parseSpvTrackerObservationReportTarget(spvRow.evidence);

  validateObservationReconciliationAllowedFields(
    errors,
    'top-level',
    report,
    OBSERVATION_RECONCILIATION_REPORT_TOP_LEVEL_FIELDS,
  );
  if (report.schemaVersion !== 1) {
    errors.push('Observation reconciliation report: schemaVersion must be 1');
  }
  if (report.command !== TRUSTLESS_OBSERVATION_RECONCILE_COMMAND) {
    errors.push(`Observation reconciliation report: command must be ${TRUSTLESS_OBSERVATION_RECONCILE_COMMAND}`);
  }
  if (report.status !== 'LINKED') {
    errors.push('Observation reconciliation report: status must be LINKED');
  }
  validateObservationReconciliationIso(errors, 'observedAt', report.observedAt);

  if (anchorObservationReportTarget) {
    validateObservationReconciliationTargetMatch(
      errors,
      'anchorObservationReportTarget',
      report.anchorObservationReportTarget,
      anchorObservationReportTarget,
      'Required Components anchor observation report target',
    );
  }
  if (spvTrackerObservationReportTarget) {
    validateObservationReconciliationTargetMatch(
      errors,
      'spvTrackerObservationReportTarget',
      report.spvTrackerObservationReportTarget,
      spvTrackerObservationReportTarget,
      'Required Components SPV tracker observation report target',
    );
  }

  if (report.anchorObservationStatus !== 'LINKED') {
    errors.push('Observation reconciliation report: anchorObservationStatus must be LINKED');
  }
  if (report.spvTrackerObservationStatus !== 'LINKED') {
    errors.push('Observation reconciliation report: spvTrackerObservationStatus must be LINKED');
  }

  if (!expectedBridgeEventRootHex) {
    errors.push('Observation reconciliation report: Commitment Format bridgeEventRoot must expose one 32-byte value');
  } else {
    validateObservationReconciliationHex32(
      errors,
      'reconciledBridgeEventRootHex',
      report.reconciledBridgeEventRootHex,
      expectedBridgeEventRootHex,
    );
    validateObservationReconciliationOptionalHex32(
      errors,
      'anchorBridgeEventRootHex',
      report.anchorBridgeEventRootHex,
      expectedBridgeEventRootHex,
    );
    validateObservationReconciliationOptionalHex32(
      errors,
      'spvBridgeEventRootHex',
      report.spvBridgeEventRootHex,
      expectedBridgeEventRootHex,
    );
  }

  if (expectedErgoAnchorHeight === undefined) {
    errors.push('Observation reconciliation report: Commitment Format ergoAnchorHeight must expose one non-negative integer');
  } else {
    validateObservationReconciliationRequiredHeight(
      errors,
      'reconciledErgoAnchorHeight',
      report.reconciledErgoAnchorHeight,
      expectedErgoAnchorHeight,
    );
    validateObservationReconciliationOptionalHeight(
      errors,
      'anchorErgoAnchorHeight',
      report.anchorErgoAnchorHeight,
      expectedErgoAnchorHeight,
    );
    validateObservationReconciliationOptionalHeight(
      errors,
      'spvErgoAnchorHeight',
      report.spvErgoAnchorHeight,
      expectedErgoAnchorHeight,
    );
  }

  validateObservationReconciliationChecks(errors, report.checks);
  validateObservationReconciliationBoundary(errors, report.boundary);

  return errors;
}

function parseObservationReconciliationReportTarget(evidence: string): string | undefined {
  const match = /\bObservation reconciliation report:\s*([^;\n|]+)/i.exec(evidence);
  return match?.[1]?.trim();
}

function normalizeObservationReconciliationTarget(value: string): string {
  return value.trim().replace(/\\/g, '/').toLowerCase();
}

function validateObservationReconciliationAllowedFields(
  errors: string[],
  label: string,
  value: Record<string, unknown>,
  allowedFields: Set<string>,
): void {
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) {
      errors.push(`Observation reconciliation report: ${label} unexpected field ${field} is not allowed`);
    }
  }
}

function validateObservationReconciliationIso(errors: string[], field: string, value: unknown): void {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    errors.push(`Observation reconciliation report: ${field} must be an ISO-compatible timestamp`);
  }
}

function validateObservationReconciliationTargetMatch(
  errors: string[],
  field: string,
  value: unknown,
  expectedTarget: string,
  expectedLabel: string,
): void {
  if (
    typeof value !== 'string' ||
    normalizeObservationReconciliationTarget(value) !== normalizeObservationReconciliationTarget(expectedTarget)
  ) {
    errors.push(`Observation reconciliation report: ${field} must match ${expectedLabel}`);
  }
}

function validateObservationReconciliationHex32(
  errors: string[],
  field: string,
  value: unknown,
  expectedHex: string,
): void {
  if (normalizeOptionalHex32(value) !== expectedHex) {
    errors.push(`Observation reconciliation report: ${field} must match Commitment Format bridgeEventRoot`);
  }
}

function validateObservationReconciliationOptionalHex32(
  errors: string[],
  field: string,
  value: unknown,
  expectedHex: string,
): void {
  if (value !== undefined) {
    validateObservationReconciliationHex32(errors, field, value, expectedHex);
  }
}

function validateObservationReconciliationRequiredHeight(
  errors: string[],
  field: string,
  value: unknown,
  expectedHeight: number,
): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    errors.push(`Observation reconciliation report: ${field} must be a non-negative safe integer`);
  } else if (value !== expectedHeight) {
    errors.push(`Observation reconciliation report: ${field} must match Commitment Format ergoAnchorHeight`);
  }
}

function validateObservationReconciliationOptionalHeight(
  errors: string[],
  field: string,
  value: unknown,
  expectedHeight: number,
): void {
  if (value !== undefined) {
    validateObservationReconciliationRequiredHeight(errors, field, value, expectedHeight);
  }
}

function validateObservationReconciliationChecks(errors: string[], value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push('Observation reconciliation report: checks must be a non-empty array');
    return;
  }
  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(`Observation reconciliation report: checks[${index}] must be an object`);
      return;
    }
    validateObservationReconciliationAllowedFields(
      errors,
      `checks[${index}]`,
      entry,
      OBSERVATION_RECONCILIATION_CHECK_FIELDS,
    );
    if (entry.status !== 'PASS') {
      errors.push(`Observation reconciliation report: checks[${index}].status must be PASS`);
    }
  });
}

function validateObservationReconciliationBoundary(errors: string[], value: unknown): void {
  if (!isRecord(value)) {
    errors.push('Observation reconciliation report: boundary must be an object');
    return;
  }
  validateObservationReconciliationAllowedFields(
    errors,
    'boundary',
    value,
    OBSERVATION_RECONCILIATION_BOUNDARY_FIELDS,
  );
  requireObservationReconciliationBoundary(errors, value, 'readOnly', true);
  requireObservationReconciliationBoundary(errors, value, 'publicObservationInputsOnly', true);
  requireObservationReconciliationBoundary(errors, value, 'anchorObservationJsonReused', true);
  requireObservationReconciliationBoundary(errors, value, 'spvTrackerObservationJsonReused', true);
  requireObservationReconciliationBoundary(errors, value, 'nodeOrRpcRequestPerformed', false);
  requireObservationReconciliationBoundary(errors, value, 'deploymentStateOpened', false);
  requireObservationReconciliationBoundary(errors, value, 'runtimeDatabaseOpened', false);
  requireObservationReconciliationBoundary(errors, value, 'secretOrEnvironmentFileRead', false);
  requireObservationReconciliationBoundary(errors, value, 'signingOrWalletMaterialRead', false);
  requireObservationReconciliationBoundary(errors, value, 'transactionBroadcastOrMutation', false);
  requireObservationReconciliationBoundary(errors, value, 'gate5Closure', false);
  requireObservationReconciliationBoundary(errors, value, 'settlementReadiness', false);
  requireObservationReconciliationBoundary(errors, value, 'productionClaimSupport', false);
  requireObservationReconciliationBoundary(errors, value, 'testnetProductionCandidateClaimSupport', false);
}

function requireObservationReconciliationBoundary(
  errors: string[],
  boundary: Record<string, unknown>,
  field: string,
  expected: boolean,
): void {
  if (boundary[field] !== expected) {
    errors.push(`Observation reconciliation report: boundary.${field} must be ${expected}`);
  }
}

function validateBurnProofRows(rows: BurnProofBindingRow[]): string[] {
  const errors = validateRequiredNames('Burn Proof Binding', rows.map(row => row.field), REQUIRED_BURN_PROOF_FIELDS);

  for (const row of rows) {
    if (!REQUIRED_BURN_PROOF_FIELDS.includes(row.field)) {
      errors.push(`Burn Proof Binding: ${row.field}: unexpected field`);
    }
    validateLinkedStatus(errors, 'Burn Proof Binding', row.field, row.status);
    if (isBlank(row.bindingRule)) {
      errors.push(`Burn Proof Binding: ${row.field}: binding rule is required`);
    }
    if (!isBlank(row.bindingRule) && !hasNoContradictoryTrustlessBurnEvidenceMarker(row.bindingRule)) {
      errors.push(`Burn Proof Binding: ${row.field}: binding rule must not include contradictory trustless-burn failure markers`);
    }
    if (!isBlank(row.bindingRule) && CONCRETE_BURN_HEX_FIELDS.has(row.field)) {
      validateExactlyOneHex32Value(
        errors,
        'Burn Proof Binding',
        row.field,
        row.bindingRule,
        'binding rule',
      );
    }
    if (!isBlank(row.bindingRule) && CONCRETE_BURN_INTEGER_FIELDS.has(row.field)) {
      validateExactlyOneIntegerToken(errors, 'Burn Proof Binding', row.field, row.bindingRule, 'binding rule');
      validatePositiveBurnAmount(errors, row.field, row.bindingRule);
    }
    if (row.status === 'linked') {
      if (!hasEvidenceMarker(row.evidence)) {
        errors.push(`Burn Proof Binding: ${row.field}: linked status requires an evidence marker`);
      } else if (!hasCompletedTrustlessBurnEvidenceTarget(row.evidence)) {
        errors.push(
          `Burn Proof Binding: ${row.field}: linked status requires completed burn-proof evidence, a non-template evidence link, or an artifact marker`,
        );
      }
      if (!hasNoContradictoryTrustlessBurnEvidenceMarker(row.evidence)) {
        errors.push(`Burn Proof Binding: ${row.field}: evidence must not include contradictory trustless-burn failure markers`);
      }
      if (approvesTrustedFallbackPath(row.evidence)) {
        errors.push(`Burn Proof Binding: ${row.field}: evidence must not approve trusted fallback paths`);
      }
    }
    for (const marker of REQUIRED_BURN_BINDING_MARKERS[row.field] ?? []) {
      if (!marker.pattern.test(row.bindingRule)) {
        errors.push(`Burn Proof Binding: ${row.field}: ${marker.message}`);
      }
    }
  }

  return errors;
}

function validateLocalProofVector(
  vector: TrustlessBurnLocalProofVector | undefined,
  commitmentRows: CommitmentFormatRow[],
  burnProofRows: BurnProofBindingRow[],
): string[] {
  if (vector === undefined) return [];

  const errors: string[] = [];
  for (const field of Object.keys(vector)) {
    if (!LOCAL_PROOF_VECTOR_TOP_LEVEL_FIELDS.has(field)) {
      errors.push(`Local Proof Vector: unexpected field ${field} is not allowed in embedded local proof-core evidence`);
    }
  }
  validateLocalProofVectorNestedFields(errors, vector);

  const leaf = isRecord(vector.leaf) ? vector.leaf : undefined;
  if (leaf === undefined) errors.push('Local Proof Vector: leaf must be an object');
  if (!Array.isArray(vector.proof)) errors.push('Local Proof Vector: proof must be an array');
  if (Array.isArray(vector.proof) && vector.proof.length === 0) {
    errors.push('Local Proof Vector: proof must include at least one structured inclusion proof node');
  }

  if (leaf !== undefined && Array.isArray(vector.proof)) {
    try {
      const result = verifyTrustlessBurnSettlementBinding({
        leaf: vector.leaf,
        bridgeEventRootHex: vector.bridgeEventRootHex,
        proof: vector.proof,
        duplicatePreventionKeyHex: vector.duplicatePreventionKeyHex,
        recipientErgoTreeHashHex: vector.recipientErgoTreeHashHex,
        amountNanoErg: vector.amountNanoErg,
        assetIdHex: vector.assetIdHex,
      });
      errors.push(...result.errors.map(error => `Local Proof Vector: ${error}`));
    } catch (err: any) {
      errors.push(`Local Proof Vector: ${err?.message ?? String(err)}`);
    }
  }

  errors.push(...validateTrustlessBurnNegativeProofCases(vector.negativeCases, {
    leaf: vector.leaf,
    bridgeEventRootHex: vector.bridgeEventRootHex,
    proof: Array.isArray(vector.proof) ? vector.proof : [],
  }).map(error => `Local Proof Vector: ${error}`));

  compareHexValue(
    errors,
    'sidechainIdHex',
    leaf?.sidechainIdHex,
    concreteHexValue(commitmentRows, 'sidechainId', 'valueOrEncoding'),
    'Commitment Format sidechainId',
  );
  compareHexValue(
    errors,
    'bridgeEventRootHex',
    vector.bridgeEventRootHex,
    concreteHexValue(commitmentRows, 'bridgeEventRoot', 'valueOrEncoding'),
    'Commitment Format bridgeEventRoot',
  );
  compareHexValue(
    errors,
    'burnIdHex',
    leaf?.burnIdHex,
    concreteHexValue(burnProofRows, 'burnId', 'bindingRule'),
    'Burn Proof Binding burnId',
  );
  compareHexValue(
    errors,
    'recipientErgoTreeHashHex',
    vector.recipientErgoTreeHashHex,
    concreteHexValue(burnProofRows, 'recipientErgoTreeHash', 'bindingRule'),
    'Burn Proof Binding recipientErgoTreeHash',
  );
  compareHexValue(
    errors,
    'leaf.recipientErgoTreeHashHex',
    leaf?.recipientErgoTreeHashHex,
    concreteHexValue(burnProofRows, 'recipientErgoTreeHash', 'bindingRule'),
    'Burn Proof Binding recipientErgoTreeHash',
  );
  compareHexValue(
    errors,
    'sidechainTxHashHex',
    leaf?.sidechainTxHashHex,
    concreteHexValue(burnProofRows, 'sidechainTxHash', 'bindingRule'),
    'Burn Proof Binding sidechainTxHash',
  );
  compareHexValue(
    errors,
    'sidechainBlockHashHex',
    leaf?.sidechainBlockHashHex,
    concreteHexValue(burnProofRows, 'sidechainBlockHash', 'bindingRule'),
    'Burn Proof Binding sidechainBlockHash',
  );
  compareHexValue(
    errors,
    'duplicatePreventionKeyHex',
    vector.duplicatePreventionKeyHex,
    concreteHexValue(burnProofRows, 'duplicatePreventionKey', 'bindingRule'),
    'Burn Proof Binding duplicatePreventionKey',
  );
  compareIntegerValue(
    errors,
    'amountNanoErg',
    vector.amountNanoErg,
    concreteIntegerValue(burnProofRows, 'amountNanoErg'),
    'Burn Proof Binding amountNanoErg',
  );
  compareIntegerValue(
    errors,
    'leaf.amountNanoErg',
    leaf?.amountNanoErg,
    concreteIntegerValue(burnProofRows, 'amountNanoErg'),
    'Burn Proof Binding amountNanoErg',
  );
  compareIntegerValue(
    errors,
    'eventIndex',
    leaf?.eventIndex,
    concreteIntegerValue(burnProofRows, 'eventIndex'),
    'Burn Proof Binding eventIndex',
  );

  return errors;
}

function validateLocalProofVectorNestedFields(
  errors: string[],
  vector: TrustlessBurnLocalProofVector,
): void {
  validateUnexpectedLocalProofVectorFields(
    errors,
    'leaf',
    vector.leaf,
    LOCAL_PROOF_VECTOR_LEAF_FIELDS,
  );
  if (Array.isArray(vector.proof)) {
    vector.proof.forEach((step, index) => {
      if (!isRecord(step)) {
        errors.push(`Local Proof Vector: proof[${index}] must be an object with side and hashHex`);
        return;
      }
      validateUnexpectedLocalProofVectorFields(
        errors,
        `proof[${index}]`,
        step,
        LOCAL_PROOF_VECTOR_PROOF_STEP_FIELDS,
      );
      validateLocalProofVectorProofStepShape(errors, `proof[${index}]`, step);
    });
  }
  if (!Array.isArray(vector.negativeCases)) return;

  vector.negativeCases.forEach((negativeCase, index) => {
    const label = isRecord(negativeCase) && typeof negativeCase.name === 'string' && negativeCase.name.trim().length > 0
      ? negativeCase.name.trim()
      : String(index);
    validateUnexpectedLocalProofVectorFields(
      errors,
      `negativeCases[${label}]`,
      negativeCase,
      LOCAL_PROOF_VECTOR_NEGATIVE_CASE_FIELDS,
    );
    if (isRecord(negativeCase) && Array.isArray(negativeCase.expectedErrors)) {
      negativeCase.expectedErrors.forEach((expectedError, errorIndex) => {
        if (typeof expectedError !== 'string' || expectedError.trim().length === 0) {
          errors.push(
            `Local Proof Vector: negativeCases[${label}].expectedErrors[${errorIndex}] must be a non-empty proof-core error string`,
          );
        }
      });
    }
    if (isRecord(negativeCase) && isRecord(negativeCase.leaf)) {
      validateUnexpectedLocalProofVectorFields(
        errors,
        `negativeCases[${label}].leaf`,
        negativeCase.leaf,
        LOCAL_PROOF_VECTOR_LEAF_FIELDS,
      );
    }
    if (isRecord(negativeCase) && isRecord(negativeCase.settlementBinding)) {
      validateUnexpectedLocalProofVectorFields(
        errors,
        `negativeCases[${label}].settlementBinding`,
        negativeCase.settlementBinding,
        LOCAL_PROOF_VECTOR_NEGATIVE_SETTLEMENT_BINDING_FIELDS,
      );
      const proof = negativeCase.settlementBinding.proof;
      if (Array.isArray(proof)) {
        if (proof.length === 0) {
          errors.push(
            `Local Proof Vector: negativeCases[${label}].settlementBinding.proof must include at least one structured proof step when provided`,
          );
        }
        proof.forEach((step, stepIndex) => {
          if (!isRecord(step)) {
            errors.push(
              `Local Proof Vector: negativeCases[${label}].settlementBinding.proof[${stepIndex}] must be an object with side and hashHex`,
            );
            return;
          }
          validateUnexpectedLocalProofVectorFields(
            errors,
            `negativeCases[${label}].settlementBinding.proof[${stepIndex}]`,
            step,
            LOCAL_PROOF_VECTOR_PROOF_STEP_FIELDS,
          );
          validateLocalProofVectorProofStepShape(
            errors,
            `negativeCases[${label}].settlementBinding.proof[${stepIndex}]`,
            step,
          );
        });
      }
    }
  });
}

function validateLocalProofVectorProofStepShape(
  errors: string[],
  label: string,
  step: Record<string, unknown>,
): void {
  if (step.side !== 'left' && step.side !== 'right') {
    errors.push(`Local Proof Vector: ${label}.side must be left or right`);
  }
  if (typeof step.hashHex !== 'string' || !LOCAL_PROOF_VECTOR_PROOF_HASH_HEX_PATTERN.test(step.hashHex.trim())) {
    errors.push(`Local Proof Vector: ${label}.hashHex must be a 32-byte hex string`);
  }
}

function validateUnexpectedLocalProofVectorFields(
  errors: string[],
  label: string,
  value: unknown,
  allowedFields: Set<string>,
): void {
  if (!isRecord(value)) return;
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) {
      errors.push(`Local Proof Vector: ${label} unexpected field ${field} is not allowed in embedded local proof-core evidence`);
    }
  }
}

function validateLocalProofVectorReport(
  reportTarget: string | undefined,
  vector: TrustlessBurnLocalProofVector | undefined,
): string[] {
  if (!reportTarget) {
    return ['Local Proof Vector report: Proof-vector validation report target is required before Gate 5 evidence can pass'];
  }

  const read = readEvidenceJsonTarget(reportTarget, 'Proof-vector validation report');
  if (read.errors.length > 0) {
    return read.errors.map(error => `Local Proof Vector report: ${error}`);
  }

  const report = read.json;
  const errors: string[] = [];
  if (!isRecord(report)) {
    return ['Local Proof Vector report: JSON report must be an object'];
  }

  validateProofVectorReportAllowedFields(errors, 'top-level', report, PROOF_VECTOR_REPORT_TOP_LEVEL_FIELDS);
  if (report.schemaVersion !== 1) {
    errors.push('Local Proof Vector report: schemaVersion must be 1');
  }
  if (report.command !== 'trustless:proof-vector:validate') {
    errors.push('Local Proof Vector report: command must be trustless:proof-vector:validate');
  }
  if (report.status !== 'PASS') {
    errors.push('Local Proof Vector report: status must be PASS');
  }
  if (!Object.prototype.hasOwnProperty.call(report, 'errors') || !Array.isArray(report.errors)) {
    errors.push('Local Proof Vector report: top-level errors must be an empty array');
  } else if (report.errors.length > 0) {
    errors.push('Local Proof Vector report: top-level errors must be empty for PASS');
  }
  validateProofVectorTopLevelAuthority(errors, report);

  const boundary = isRecord(report.boundary) ? report.boundary : undefined;
  if (!boundary) {
    errors.push('Local Proof Vector report: boundary must be an object');
  } else {
    validateProofVectorReportAllowedFields(errors, 'boundary', boundary, PROOF_VECTOR_REPORT_BOUNDARY_FIELDS);
    requireBooleanBoundary(errors, boundary, 'readOnly', true);
    requireBooleanBoundary(errors, boundary, 'localProofCoreOnly', true);
    requireBooleanBoundary(errors, boundary, 'gate5Closure', false);
    requireBooleanBoundary(errors, boundary, 'settlementReadiness', false);
    requireBooleanBoundary(errors, boundary, 'broadcastAuthorization', false);
    requireBooleanBoundary(errors, boundary, 'productionClaimSupport', false);
    requireBooleanBoundary(errors, boundary, 'testnetProductionCandidateClaimSupport', false);
    validateProofVectorBoundaryAuthority(errors, boundary);
  }

  if (!Array.isArray(report.reports)) {
    errors.push('Local Proof Vector report: reports must be an array');
    return errors;
  }
  const reports = report.reports;
  if (reports.length === 0) {
    errors.push('Local Proof Vector report: reports must include a proof-vector result');
    return errors;
  }
  if (reports.length !== 1) {
    errors.push('Local Proof Vector report: reports must include exactly one proof-vector result bound to the embedded Local Proof Vector');
    return errors;
  }

  const passReport = reports[0];
  if (!isRecord(passReport)) {
    errors.push('Local Proof Vector report: proof-vector result must be an object');
    return errors;
  }
  validateProofVectorReportAllowedFields(errors, 'proof-vector result', passReport, PROOF_VECTOR_REPORT_RESULT_FIELDS);
  validateProofVectorResultAuthority(errors, passReport);
  const localProofNodeCount = Array.isArray(vector?.proof) ? vector.proof.length : undefined;
  if (passReport.status !== 'PASS') {
    errors.push('Local Proof Vector report: proof-vector result status must be PASS');
  }
  validateProofVectorResultLabel(errors, passReport.label);
  if (typeof passReport.message !== 'string' || passReport.message.trim().length === 0) {
    errors.push('Local Proof Vector report: proof-vector result message is required');
  } else {
    validateProofVectorReportMessageBoundary(errors, passReport.message);
  }
  if (!Array.isArray(passReport.errors)) {
    errors.push('Local Proof Vector report: proof-vector result errors must be an empty array');
  } else if (passReport.errors.length > 0) {
    errors.push('Local Proof Vector report: proof-vector result errors must be empty for PASS');
  }
  validateProofVectorReportResultShape(errors, passReport);
  if (passReport.bridgeEventRootHex !== vector?.bridgeEventRootHex) {
    errors.push('Local Proof Vector report: bridgeEventRootHex must match Local Proof Vector bridgeEventRootHex');
  }
  if (vector && isRecord(vector.leaf)) {
    try {
      const localLeafHashHex = encodeTrustlessBurnLeaf(vector.leaf).leafHashHex;
      if (passReport.leafHashHex !== localLeafHashHex) {
        errors.push('Local Proof Vector report: leafHashHex must match Local Proof Vector canonical leaf hash');
      }
    } catch (err: any) {
      errors.push(`Local Proof Vector report: unable to compute Local Proof Vector leaf hash: ${err?.message ?? String(err)}`);
    }
  } else if (vector) {
    errors.push('Local Proof Vector report: Local Proof Vector leaf must be an object before report leafHashHex can be checked');
  }
  if (passReport.proofNodeCount !== localProofNodeCount) {
    errors.push('Local Proof Vector report: proofNodeCount must match Local Proof Vector proof length');
  }
  if (
    typeof passReport.leafCount === 'number' &&
    Number.isSafeInteger(passReport.leafCount) &&
    passReport.leafCount >= 2 &&
    localProofNodeCount !== undefined &&
    expectedProofDepth(passReport.leafCount) !== localProofNodeCount
  ) {
    errors.push('Local Proof Vector report: leafCount must match Local Proof Vector proof depth');
  }
  if (typeof passReport.message === 'string') {
    validateProofVectorReportMessageMetrics(errors, passReport.message, passReport.leafCount, passReport.proofNodeCount);
    validateProofVectorReportCanonicalMessage(errors, passReport.message, passReport.leafCount, passReport.proofNodeCount);
  }
  validateProofVectorReportNegativeCaseResults(errors, passReport.negativeCaseResults, vector?.negativeCases);

  return errors;
}

function validateProofVectorReportResultShape(
  errors: string[],
  result: Record<string, unknown>,
): void {
  if (
    typeof result.bridgeEventRootHex !== 'string' ||
    !LOCAL_PROOF_VECTOR_PROOF_HASH_HEX_PATTERN.test(result.bridgeEventRootHex.trim())
  ) {
    errors.push('Local Proof Vector report: bridgeEventRootHex must be a 32-byte hex string');
  }
  if (
    typeof result.leafHashHex !== 'string' ||
    !LOCAL_PROOF_VECTOR_PROOF_HASH_HEX_PATTERN.test(result.leafHashHex.trim())
  ) {
    errors.push('Local Proof Vector report: leafHashHex must be a 32-byte hex string');
  }
  validateProofVectorReportLeafCount(errors, result.leafCount);
  validateProofVectorReportProofNodeCount(errors, result.proofNodeCount);
}

function validateProofVectorReportLeafCount(errors: string[], leafCount: unknown): void {
  if (typeof leafCount !== 'number' || leafCount < 2) {
    errors.push('Local Proof Vector report: leafCount must be at least 2');
    return;
  }
  if (!Number.isInteger(leafCount)) {
    errors.push('Local Proof Vector report: leafCount must be an integer');
  }
  if (!Number.isSafeInteger(leafCount)) {
    errors.push('Local Proof Vector report: leafCount must be a safe integer');
  }
}

function validateProofVectorReportProofNodeCount(errors: string[], proofNodeCount: unknown): void {
  if (typeof proofNodeCount !== 'number' || proofNodeCount < 1) {
    errors.push('Local Proof Vector report: proofNodeCount must be at least 1');
    return;
  }
  if (!Number.isInteger(proofNodeCount)) {
    errors.push('Local Proof Vector report: proofNodeCount must be an integer');
  }
  if (!Number.isSafeInteger(proofNodeCount)) {
    errors.push('Local Proof Vector report: proofNodeCount must be a safe integer');
  }
}

function validateProofVectorReportNegativeCaseResults(
  errors: string[],
  negativeCaseResults: unknown,
  negativeCases: TrustlessBurnNegativeProofCase[] | undefined,
): void {
  if (!Array.isArray(negativeCaseResults)) {
    errors.push('Local Proof Vector report: negativeCaseResults must be an array');
    return;
  }

  if (!Array.isArray(negativeCases)) {
    errors.push('Local Proof Vector report: negativeCaseResults cannot be checked without Local Proof Vector negativeCases');
    return;
  }

  const expectedByName = new Map(
    negativeCases
      .filter(candidate => typeof candidate?.name === 'string')
      .map(candidate => [candidate.name.trim(), candidate.expectedErrors]),
  );
  const seenNames = new Set<string>();

  for (let index = 0; index < negativeCaseResults.length; index += 1) {
    const result = negativeCaseResults[index];
    if (!isRecord(result)) {
      errors.push(`Local Proof Vector report: negativeCaseResults[${index}] must be an object`);
      continue;
    }
    validateProofVectorReportAllowedFields(
      errors,
      `negativeCaseResults[${index}]`,
      result,
      PROOF_VECTOR_REPORT_NEGATIVE_CASE_RESULT_FIELDS,
    );

    const name = typeof result.name === 'string' ? result.name.trim() : '';
    const label = name || String(index);
    if (name.length === 0) {
      errors.push(`Local Proof Vector report: negativeCaseResults[${index}].name is required`);
      continue;
    }
    if (seenNames.has(name)) {
      errors.push(`Local Proof Vector report: negativeCaseResults[${label}] duplicate negative case result`);
    }
    seenNames.add(name);

    if (!expectedByName.has(name)) {
      errors.push(`Local Proof Vector report: negativeCaseResults[${label}] must match a Local Proof Vector negativeCase`);
    }
    if (result.status !== 'REJECTED') {
      errors.push(`Local Proof Vector report: negativeCaseResults[${label}].status must be REJECTED`);
    }

    const expectedErrors = validateProofVectorReportErrorList(
      errors,
      `negativeCaseResults[${label}].expectedErrors`,
      result.expectedErrors,
    );
    const observedErrors = validateProofVectorReportErrorList(
      errors,
      `negativeCaseResults[${label}].observedErrors`,
      result.observedErrors,
    );
    const vectorExpectedErrors = expectedByName.get(name);
    if (vectorExpectedErrors && !sameStringList(expectedErrors, vectorExpectedErrors)) {
      errors.push(`Local Proof Vector report: negativeCaseResults[${label}].expectedErrors must match Local Proof Vector expectedErrors`);
    }
    if (!sameStringList(observedErrors, expectedErrors)) {
      errors.push(`Local Proof Vector report: negativeCaseResults[${label}].observedErrors must match expectedErrors`);
    }
  }

  for (const name of expectedByName.keys()) {
    if (!seenNames.has(name)) {
      errors.push(`Local Proof Vector report: negativeCaseResults must include ${name}`);
    }
  }
}

function validateProofVectorReportErrorList(
  errors: string[],
  label: string,
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    errors.push(`Local Proof Vector report: ${label} must be a non-empty array`);
    return [];
  }
  const result: string[] = [];
  value.forEach((entry, index) => {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      errors.push(`Local Proof Vector report: ${label}[${index}] must be a non-empty proof-core error string`);
      return;
    }
    result.push(entry);
  });
  if (result.length === 0) {
    errors.push(`Local Proof Vector report: ${label} must contain at least one proof-core error`);
  }
  return result;
}

function sameStringList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function expectedProofDepth(leafCount: number): number {
  let depth = 0;
  let levelWidth = leafCount;
  while (levelWidth > 1) {
    depth += 1;
    levelWidth = Math.ceil(levelWidth / 2);
  }
  return depth;
}

function validateProofVectorReportMessageBoundary(errors: string[], message: string): void {
  const requiredMarkers = [
    {
      pattern: /\bgate5Claim=false\b/i,
      message: 'proof-vector result message must state gate5Claim=false',
    },
    {
      pattern: /\bcontractsChanged=false\b/i,
      message: 'proof-vector result message must state contractsChanged=false',
    },
    {
      pattern: /\blocal proof-core evidence only\b/i,
      message: 'proof-vector result message must state local proof-core evidence only',
    },
    {
      pattern:
        /\bnot Gate 5 closure, settlement readiness, broadcast authorization, production claim support, or testnet production-candidate claim support\b/i,
      message:
        'proof-vector result message must deny Gate 5 closure, settlement readiness, broadcast authorization, production claim support, and testnet production-candidate claim support',
    },
  ];

  for (const marker of requiredMarkers) {
    if (!marker.pattern.test(message)) {
      errors.push(`Local Proof Vector report: ${marker.message}`);
    }
  }

  if (hasContradictoryProofVectorMessageAuthority(message)) {
    errors.push(
      'Local Proof Vector report: proof-vector result message must not assert production deployment, Gate 5 closure, settlement readiness, broadcast authorization, or claim support',
    );
  }
}

function hasContradictoryProofVectorMessageAuthority(message: string): boolean {
  return [
    /\b(?:production\s+(?:deployment|release|readiness|claim(?:\s+support)?)|mainnet)\s+(?:approved|allowed|supported|ready|enabled|greenlit|certified|cleared|go(?:[ -]?live)?|pass(?:ed)?)\b/i,
    /\b(?:gate\s*5\s+closure|settlement\s+readiness|broadcast\s+authorization|production\s+claim\s+support)\s+(?:approved|allowed|supported|ready|enabled|greenlit|certified|cleared|go(?:[ -]?live)?|pass(?:ed)?)\b/i,
    /\b(?:approved|allowed|supported|ready|enabled|greenlit|certified|cleared|go(?:[ -]?live)?|pass(?:ed)?)\s+(?:for\s+)?(?:production\s+(?:deployment|release|readiness|claim(?:\s+support)?)|mainnet|gate\s*5\s+closure|settlement\s+readiness|broadcast\s+authorization)\b/i,
  ].some(pattern => pattern.test(message));
}

function validateProofVectorReportMessageMetrics(
  errors: string[],
  message: string,
  leafCount: unknown,
  proofNodeCount: unknown,
): void {
  validateProofVectorReportMessageMetric(errors, message, 'leafCount', leafCount);
  validateProofVectorReportMessageMetric(errors, message, 'proofNodes', proofNodeCount);
}

function validateProofVectorReportCanonicalMessage(
  errors: string[],
  message: string,
  leafCount: unknown,
  proofNodeCount: unknown,
): void {
  const expected = expectedProofVectorReportMessage(leafCount, proofNodeCount);
  if (!expected || message === expected) return;

  errors.push('Local Proof Vector report: proof-vector result message must match canonical local proof-core boundary text');
}

function expectedProofVectorReportMessage(leafCount: unknown, proofNodeCount: unknown): string | undefined {
  if (typeof leafCount !== 'number' || !Number.isInteger(leafCount)) return undefined;
  if (typeof proofNodeCount !== 'number' || !Number.isInteger(proofNodeCount)) return undefined;

  return (
    `Trustless burn proof vector PASS: leafCount=${leafCount}, proofNodes=${proofNodeCount}, ` +
    'gate5Claim=false, contractsChanged=false; local proof-core evidence only, not Gate 5 closure, ' +
    'settlement readiness, broadcast authorization, production claim support, or testnet production-candidate claim support.'
  );
}

function validateProofVectorReportMessageMetric(
  errors: string[],
  message: string,
  key: 'leafCount' | 'proofNodes',
  expected: unknown,
): void {
  if (typeof expected !== 'number' || !Number.isInteger(expected)) return;

  const expectedText = String(expected);
  const values = proofVectorReportMessageMetricValues(message, key);
  if (!values.includes(expectedText)) {
    errors.push(`Local Proof Vector report: proof-vector result message must state ${key}=${expectedText}`);
  }
  if (values.some(value => value !== expectedText)) {
    errors.push(`Local Proof Vector report: proof-vector result message must not include contradictory ${key} values`);
  }
}

function proofVectorReportMessageMetricValues(message: string, key: 'leafCount' | 'proofNodes'): string[] {
  const values: string[] = [];
  const pattern = new RegExp(`\\b${key}=([0-9]+)\\b`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(message)) !== null) {
    values.push(match[1]);
  }
  return values;
}

function requireBooleanBoundary(
  errors: string[],
  boundary: Record<string, unknown>,
  field: string,
  expected: boolean,
): void {
  if (boundary[field] !== expected) {
    errors.push(`Local Proof Vector report: boundary.${field} must be ${expected}`);
  }
}

function validateProofVectorBoundaryAuthority(errors: string[], boundary: Record<string, unknown>): void {
  validateProofVectorAuthorityFields(errors, boundary, 'boundary', new Set(['readOnly', 'localProofCoreOnly']));
}

function validateProofVectorResultAuthority(errors: string[], result: Record<string, unknown>): void {
  validateProofVectorAuthorityFields(
    errors,
    result,
    'proof-vector result',
    new Set(),
    new Set([
      'status',
      'message',
      'errors',
      'bridgeEventRootHex',
      'leafHashHex',
      'leafCount',
      'proofNodeCount',
      'negativeCaseResults',
    ]),
  );
}

function validateProofVectorTopLevelAuthority(errors: string[], report: Record<string, unknown>): void {
  const structuralFields = new Set(['schemaVersion', 'command', 'status', 'errors', 'boundary', 'reports']);
  for (const [field, value] of Object.entries(report)) {
    if (structuralFields.has(field)) continue;
    validateProofVectorAuthorityFields(errors, { [field]: value }, 'top-level');
  }
}

function validateProofVectorReportAllowedFields(
  errors: string[],
  label: string,
  value: Record<string, unknown>,
  allowedFields: Set<string>,
): void {
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) {
      errors.push(
        `Local Proof Vector report: ${label} unexpected field ${field} is not allowed in proof-vector validation report`,
      );
    }
  }
}

function validateProofVectorAuthorityFields(
  errors: string[],
  node: unknown,
  displayPath: string,
  topLevelAllowlist = new Set<string>(),
  structuralFieldAllowlist = new Set<string>(),
): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => {
      validateProofVectorAuthorityFields(errors, item, `${displayPath}[${index}]`, topLevelAllowlist, structuralFieldAllowlist);
    });
    return;
  }
  if (!isRecord(node)) return;

  for (const [field, value] of Object.entries(node)) {
    const fieldPath = displayPath === 'proof-vector result'
      ? `${displayPath} ${field}`
      : `${displayPath}.${field}`;
    const isAllowedTopLevelField = topLevelAllowlist.has(field) && displayPath === 'boundary';
    const isAllowedStructuralField = structuralFieldAllowlist.has(field) && displayPath === 'proof-vector result';
    const hasAuthorityField = isProofVectorAuthorityField(field);
    const hasAuthorityValue = hasAuthorityField
      ? isAuthorityAffirmingValue(value)
      : isNeutralAuthorityAffirmingValue(value);
    if (!isAllowedTopLevelField && !isAllowedStructuralField && hasAuthorityValue) {
      errors.push(`Local Proof Vector report: ${fieldPath} must not be authority-affirming for local proof-core evidence`);
    }
    if (Array.isArray(value) || isRecord(value)) {
      validateProofVectorAuthorityFields(errors, value, fieldPath, topLevelAllowlist, structuralFieldAllowlist);
    }
  }
}

function isProofVectorAuthorityField(field: string): boolean {
  const normalized = field.toLowerCase().replace(/[^a-z0-9]/g, '');
  return /(?:broadcast|claim|production|prod|mainnet|mainnetwork|mainchain|livenet|settlement|closure|gate5|contract|ready|candidate|rollout|distribut(?:ion|ed|able|ing)?|list(?:ed|ing)?|publicuse|operatoruse|institutionaluse|suitab(?:le|ility)|eligib(?:le|ility)|endors(?:e|ed|ement)|recommend(?:ed|ation)?|adopt(?:ed|ion)?|compli(?:ance|ant)|qualifi(?:ed|cation)|accredit(?:ed|ation)|validat(?:e|ed|es|ing|ion|or)?|verifi(?:ed|cation|er|es|able)?|attest(?:ed|ation)?|assur(?:e|ed|ance)|sanction(?:ed)?|guarante(?:e|ed)|warrant(?:ed|y)?|clear(?:ed|ance)|licen[cs](?:e|ed|ing)?|entitle(?:d|ment)?|recogn(?:ition|i[sz](?:e|ed|es|ing))|waiv(?:e|ed|er|ing)?|exempt(?:ed|ion|ions?)?|except(?:ed|ion|ions?)?|overrid(?:e|den|ing|es)?|audit(?:ed|ing)?|review(?:ed|ing)?|signoff|signoffed|accept(?:ed|ance|ing)?|risk|blocker|finding|disposition|mitigat(?:e|ed|ion|ing)?|resol(?:ve|ved|ution)|safe(?:ty)?|secur(?:e|ity)|trusted|trustworthy|confiden(?:ce|t)|stabil(?:e|ity|iz(?:e|ed|ation)?)?|matur(?:e|ity)|reliab(?:le|ility)|robust(?:ness)?|grade|battle(?:tested)?|harden(?:ed|ing)?|sla|slo|servicelevel|uptime|coverage|generalavailability|publicavailability|publication|publish(?:ed|able|ing)?|marketready|activ(?:e|ation|ated)|operational|deploy(?:ment|ed|able)?|certifi(?:ed|cation)|authori[sz](?:e|ed|es|ing|ation)|approval|approved|permission|permit|release|launch|golive|ship(?:ped|ping)?|promot(?:e|ed|ion))/i
    .test(normalized);
}

function isAuthorityAffirmingValue(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  if (typeof value === 'string') {
    return isAuthorityAffirmingText(value);
  }
  if (Array.isArray(value)) {
    return value.some(item => isAuthorityAffirmingValue(item));
  }
  if (isRecord(value)) {
    return Object.values(value).some(item => isAuthorityAffirmingValue(item));
  }
  return false;
}

function isNeutralAuthorityAffirmingValue(value: unknown): boolean {
  if (typeof value === 'string') return isAuthorityAffirmingText(value);
  if (Array.isArray(value)) return value.some(item => isNeutralAuthorityAffirmingValue(item));
  if (isRecord(value)) return Object.values(value).some(item => isNeutralAuthorityAffirmingValue(item));
  return false;
}

function isAuthorityAffirmingText(value: string): boolean {
  return /\b(?:true|yes|ok|enabled|allowed|approved|accepted|active|activated|available|availability|ga|public|prod|production|published|publishable|listed|distributed|rollout|rolled[ -]?out|suitable|eligible|endorsed|recommended|adopted|compliant|qualified|accredited|validated|verified|attested|assured|sanctioned|guaranteed|warranted|cleared|licensed|licenced|entitled|recognized|recognised|waived|exempt|exempted|excepted|override|overridden|audited|reviewed|signed[ -]?off|safe|secure|trusted|trustworthy|confident|stable|mature|reliable|robust|battle[ -]?tested|(?:enterprise|institutional|operator|exchange|bank|release|production|testnet)[ -]?grade|hardened|proven|met|satisfied|covered|green|low|resolved|closed|mitigated|certified|complete|completed|operational|authori[sz]ed|permitted|granted|supported|ready|pass|passed|go|greenlit|launched|released|deployed|deployable|shipped|shipping|promoted|live)\b/i
    .test(value.trim());
}

function isBlockedProofVectorLabel(label: string): boolean {
  const trimmed = label.trim();
  return /^<.*>$/.test(trimmed) || /\bblocked JSON evidence target\b/i.test(trimmed);
}

function validateProofVectorResultLabel(errors: string[], label: unknown): void {
  if (typeof label !== 'string' || label.trim().length === 0) {
    errors.push('Local Proof Vector report: proof-vector result label is required');
    return;
  }
  if (isBlockedProofVectorLabel(label)) {
    errors.push('Local Proof Vector report: proof-vector result label must not be a blocked evidence target placeholder');
  }
  if (isUnsafeProofVectorResultLabel(label)) {
    errors.push(
      'Local Proof Vector report: proof-vector result label must not contain local paths, URI schemes, secrets, or runtime-state references',
    );
  }
}

function isUnsafeProofVectorResultLabel(label: string): boolean {
  const normalized = label.trim().replace(/\\/g, '/').toLowerCase();
  if (
    hasLocalAbsoluteProofVectorLabel(normalized) ||
    hasLocalFileProofVectorLabel(normalized) ||
    hasUriSchemeProofVectorLabel(normalized)
  ) {
    return true;
  }
  return evidenceTargetInspectionVariants(normalized).some(candidate =>
    hasEvidenceLocalOnlyInspectionReference(candidate) ||
    hasSecretOrRuntimeProofVectorLabel(candidate),
  );
}

function hasSecretOrRuntimeProofVectorLabel(normalized: string): boolean {
  if (
    isEvidenceRuntimeDatabaseTarget(normalized) ||
    isEvidenceSecretOrRuntimeName(normalized, { includeDeployedState: true })
  ) {
    return true;
  }
  return normalized
    .split(/[\/\s,;=()]+/)
    .some(segment => {
      const cleaned = segment.replace(/[),;]+$/g, '');
      return (
        isEvidenceEnvironmentFileName(cleaned) ||
        isEvidenceRuntimeDatabaseTarget(cleaned) ||
        isEvidenceSecretOrRuntimeName(cleaned, { includeDeployedState: true })
      );
    });
}

function hasLocalAbsoluteProofVectorLabel(normalized: string): boolean {
  return /(?:^|[\s([,{])(?:[a-z]:\/|\/)/i.test(normalized);
}

function hasLocalFileProofVectorLabel(normalized: string): boolean {
  return /(?:^|[\s([,{])file:\/\/\/(?:[a-z]:|\/)/i.test(normalized);
}

function hasUriSchemeProofVectorLabel(normalized: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(normalized);
}

function validatePositiveRows(rows: PositiveProofRow[]): string[] {
  const errors = validateRequiredNames('Positive Proof Acceptance', rows.map(row => row.check), REQUIRED_POSITIVE_CHECKS);

  for (const row of rows) {
    if (!REQUIRED_POSITIVE_CHECKS.includes(row.check)) {
      errors.push(`Positive Proof Acceptance: ${row.check}: unexpected check`);
    }
    validateLinkedStatus(errors, 'Positive Proof Acceptance', row.check, row.status);
    if (isBlank(row.expectedResult)) {
      errors.push(`Positive Proof Acceptance: ${row.check}: expected result is required`);
    }
    if (!isBlank(row.expectedResult) && !POSITIVE_TEST_EXPECTED_RESULT_PATTERN.test(row.expectedResult)) {
      errors.push(
        `Positive Proof Acceptance: ${row.check}: expected result must state accepted, approved, passed, validated, or verified`,
      );
    }
    if (!isBlank(row.expectedResult) && hasSlashDelimitedProofExpectedResultAlternative(row.expectedResult)) {
      errors.push(
        `Positive Proof Acceptance: ${row.check}: expected result must use one exact positive outcome without slash-delimited alternatives`,
      );
    }
    if (!isBlank(row.expectedResult) && !hasNoContradictoryTrustlessBurnEvidenceMarker(row.expectedResult)) {
      errors.push(`Positive Proof Acceptance: ${row.check}: expected result must not include contradictory trustless-burn failure markers`);
    }
    if (row.status === 'linked') {
      if (!hasEvidenceMarker(row.evidence)) {
        errors.push(`Positive Proof Acceptance: ${row.check}: linked status requires an evidence marker`);
      } else if (!hasCompletedTrustlessBurnEvidenceTarget(row.evidence)) {
        errors.push(
          `Positive Proof Acceptance: ${row.check}: linked status requires completed positive proof evidence, a non-template evidence link, or an artifact marker`,
        );
      }
      if (!hasNoContradictoryTrustlessBurnEvidenceMarker(row.evidence)) {
        errors.push(`Positive Proof Acceptance: ${row.check}: evidence must not include contradictory trustless-burn failure markers`);
      }
      if (approvesTrustedFallbackPath(row.evidence)) {
        errors.push(`Positive Proof Acceptance: ${row.check}: evidence must not approve trusted fallback paths`);
      }
      for (const marker of REQUIRED_POSITIVE_EVIDENCE_MARKERS[row.check] ?? []) {
        if (!marker.pattern.test(row.evidence)) {
          errors.push(`Positive Proof Acceptance: ${row.check}: ${marker.message}`);
        }
      }
    }
  }

  return errors;
}

function validatePositiveProofInstanceBinding(
  positiveRows: PositiveProofRow[],
  commitmentRows: CommitmentFormatRow[],
  burnProofRows: BurnProofBindingRow[],
): string[] {
  const positiveRow = positiveRows.find(row => row.check === 'Valid burn proof acceptance');
  if (!positiveRow || positiveRow.status !== 'linked') return [];

  const errors: string[] = [];
  const expectedBridgeEventRoot = concreteHexValue(commitmentRows, 'bridgeEventRoot', 'valueOrEncoding');
  const expectedBurnId = concreteHexValue(burnProofRows, 'burnId', 'bindingRule');
  const expectedRecipient = concreteHexValue(burnProofRows, 'recipientErgoTreeHash', 'bindingRule');
  const expectedAmount = concreteIntegerValue(burnProofRows, 'amountNanoErg');
  const expectedSidechainTxHash = concreteHexValue(burnProofRows, 'sidechainTxHash', 'bindingRule');
  const expectedSidechainBlockHash = concreteHexValue(burnProofRows, 'sidechainBlockHash', 'bindingRule');
  const expectedEventIndex = concreteIntegerValue(burnProofRows, 'eventIndex');
  const expectedDuplicatePreventionKey = concreteHexValue(burnProofRows, 'duplicatePreventionKey', 'bindingRule');
  const evidence = positiveRow.evidence;

  if (expectedBridgeEventRoot && !containsNamedHex32Value(evidence, 'bridgeEventRoot', expectedBridgeEventRoot)) {
    errors.push(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must match Commitment Format bridgeEventRoot',
    );
  }
  if (expectedBurnId && !containsNamedHex32Value(evidence, 'burnId', expectedBurnId)) {
    errors.push('Positive Proof Acceptance: Valid burn proof acceptance: evidence must match Burn Proof Binding burnId');
  }
  if (
    expectedRecipient &&
    !containsAnyNamedHex32Value(evidence, ['recipientErgoTreeHash', 'recipient'], expectedRecipient)
  ) {
    errors.push(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must match Burn Proof Binding recipientErgoTreeHash',
    );
  }
  if (expectedAmount && !containsAmountValue(evidence, expectedAmount)) {
    errors.push(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must match Burn Proof Binding amountNanoErg',
    );
  }
  if (expectedSidechainTxHash && !containsNamedHex32Value(evidence, 'sidechainTxHash', expectedSidechainTxHash)) {
    errors.push(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must match Burn Proof Binding sidechainTxHash',
    );
  }
  if (expectedSidechainBlockHash && !containsNamedHex32Value(evidence, 'sidechainBlockHash', expectedSidechainBlockHash)) {
    errors.push(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must match Burn Proof Binding sidechainBlockHash',
    );
  }
  if (expectedEventIndex && !containsNamedIntegerValue(evidence, 'eventIndex', expectedEventIndex)) {
    errors.push(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must match Burn Proof Binding eventIndex',
    );
  }
  if (
    expectedDuplicatePreventionKey &&
    !containsNamedHex32Value(evidence, 'duplicatePreventionKey', expectedDuplicatePreventionKey)
  ) {
    errors.push(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must match Burn Proof Binding duplicatePreventionKey',
    );
  }

  return errors;
}

function validateContractEquivalentAcceptanceReport(
  positiveRows: PositiveProofRow[],
  commitmentRows: CommitmentFormatRow[],
  burnProofRows: BurnProofBindingRow[],
): string[] {
  const positiveRow = positiveRows.find(row => row.check === 'Valid burn proof acceptance');
  if (!positiveRow || positiveRow.status !== 'linked') return [];

  const reportTarget = parseContractEquivalentAcceptanceReportTarget(positiveRow.evidence);
  if (!reportTarget) return [];

  const read = readEvidenceJsonTarget(reportTarget, 'Contract-equivalent acceptance report');
  if (read.errors.length > 0) {
    return read.errors.map(error => `Contract-equivalent acceptance report: ${error}`);
  }
  if (!isRecord(read.json)) {
    return ['Contract-equivalent acceptance report: JSON report must be an object'];
  }

  const report = read.json;
  const errors = validateTrustlessBurnContractAcceptanceReportJson(report)
    .map(error => `Contract-equivalent acceptance report: ${stripContractAcceptanceReportError(error)}`);

  if (report.status !== 'PASS') {
    errors.push('Contract-equivalent acceptance report: status must be PASS');
  }
  if (report.structuralIssues !== 0) {
    errors.push('Contract-equivalent acceptance report: structuralIssues must be 0');
  }

  const identity = isRecord(report.identity) ? report.identity : {};
  const positiveAcceptance = isRecord(report.positiveAcceptance) ? report.positiveAcceptance : {};
  const derived = isRecord(positiveAcceptance.derived) ? positiveAcceptance.derived : {};

  compareReportHex(
    errors,
    'identity.sidechainIdHex',
    identity.sidechainIdHex,
    commitmentHexField(commitmentRows, 'sidechainId'),
    'Commitment Format sidechainId',
  );
  compareReportNumber(
    errors,
    'sidechainHeight',
    report.sidechainHeight,
    commitmentIntegerField(commitmentRows, 'sidechainHeight'),
    'Commitment Format sidechainHeight',
  );
  compareReportHex(
    errors,
    'identity.bridgeEventRootHex',
    identity.bridgeEventRootHex,
    concreteHexValue(commitmentRows, 'bridgeEventRoot', 'valueOrEncoding'),
    'Commitment Format bridgeEventRoot',
  );
  compareReportHex(
    errors,
    'positiveAcceptance.derived.merkleRootHex',
    derived.merkleRootHex,
    concreteHexValue(commitmentRows, 'bridgeEventRoot', 'valueOrEncoding'),
    'Commitment Format bridgeEventRoot',
  );
  compareReportNumber(
    errors,
    'identity.ergoAnchorHeight',
    identity.ergoAnchorHeight,
    commitmentIntegerField(commitmentRows, 'ergoAnchorHeight'),
    'Commitment Format ergoAnchorHeight',
  );
  compareReportNumber(
    errors,
    'positiveAcceptance.derived.ergoAnchorHeight',
    derived.ergoAnchorHeight,
    commitmentIntegerField(commitmentRows, 'ergoAnchorHeight'),
    'Commitment Format ergoAnchorHeight',
  );
  compareReportHex(
    errors,
    'identity.burnIdHex',
    identity.burnIdHex,
    concreteHexValue(burnProofRows, 'burnId', 'bindingRule'),
    'Burn Proof Binding burnId',
  );
  compareReportHex(
    errors,
    'identity.duplicatePreventionKeyHex',
    identity.duplicatePreventionKeyHex,
    concreteHexValue(burnProofRows, 'duplicatePreventionKey', 'bindingRule'),
    'Burn Proof Binding duplicatePreventionKey',
  );
  compareReportHex(
    errors,
    'identity.recipientErgoTreeHashHex',
    identity.recipientErgoTreeHashHex,
    concreteHexValue(burnProofRows, 'recipientErgoTreeHash', 'bindingRule'),
    'Burn Proof Binding recipientErgoTreeHash',
  );
  compareReportString(
    errors,
    'identity.amountNanoErg',
    identity.amountNanoErg,
    concreteIntegerValue(burnProofRows, 'amountNanoErg'),
    'Burn Proof Binding amountNanoErg',
  );
  compareReportHex(
    errors,
    'identity.sidechainTxHashHex',
    identity.sidechainTxHashHex,
    concreteHexValue(burnProofRows, 'sidechainTxHash', 'bindingRule'),
    'Burn Proof Binding sidechainTxHash',
  );
  compareReportHex(
    errors,
    'identity.sidechainBlockHashHex',
    identity.sidechainBlockHashHex,
    concreteHexValue(burnProofRows, 'sidechainBlockHash', 'bindingRule'),
    'Burn Proof Binding sidechainBlockHash',
  );
  compareReportNumber(
    errors,
    'identity.eventIndex',
    identity.eventIndex,
    numberFromDecimalString(concreteIntegerValue(burnProofRows, 'eventIndex')),
    'Burn Proof Binding eventIndex',
  );

  if (positiveAcceptance.accepted !== true) {
    errors.push('Contract-equivalent acceptance report: positiveAcceptance.accepted must be true');
  }
  validateContractEquivalentNegativeCases(errors, report.negativeCases);

  return errors;
}

function stripContractAcceptanceReportError(error: string): string {
  return error.replace(/^--trustless-burn-contract-acceptance-json\s+/, '');
}

function compareReportHex(
  errors: string[],
  field: string,
  actual: unknown,
  expected: string | null | undefined,
  expectedLabel: string,
): void {
  if (!expected) return;
  if (typeof actual !== 'string' || actual.toLowerCase() !== expected.toLowerCase()) {
    errors.push(`Contract-equivalent acceptance report: ${field} must match ${expectedLabel}`);
  }
}

function compareReportString(
  errors: string[],
  field: string,
  actual: unknown,
  expected: string | null | undefined,
  expectedLabel: string,
): void {
  if (!expected) return;
  if (String(actual) !== expected) {
    errors.push(`Contract-equivalent acceptance report: ${field} must match ${expectedLabel}`);
  }
}

function compareReportNumber(
  errors: string[],
  field: string,
  actual: unknown,
  expected: number | undefined,
  expectedLabel: string,
): void {
  if (expected === undefined) return;
  if (actual !== expected) {
    errors.push(`Contract-equivalent acceptance report: ${field} must match ${expectedLabel}`);
  }
}

function numberFromDecimalString(value: string | null): number | undefined {
  if (value === null || !/^[0-9]+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function validateContractEquivalentNegativeCases(errors: string[], value: unknown): void {
  if (!Array.isArray(value)) return;
  const required = new Set([
    'tracker-event-root-drift',
    'malformed-inclusion-path',
    'stale-ergo-anchor',
    'payout-value-drift',
    'recipient-tree-drift',
    'tracker-key-drift',
    'spent-dup-key',
    'bad-proof-side-byte',
  ]);
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (name.length > 0) seen.add(name);
    if (entry.status !== 'REJECTED') {
      errors.push(`Contract-equivalent acceptance report: negativeCases[${name || index}].status must be REJECTED`);
    }
  });
  for (const name of required) {
    if (!seen.has(name)) {
      errors.push(`Contract-equivalent acceptance report: negativeCases must include ${name}`);
    }
  }
}

function validateNegativeRows(
  rows: NegativeProofRow[],
  localProofVector: TrustlessBurnLocalProofVector | undefined,
): string[] {
  const errors = validateRequiredNames('Negative Tests', rows.map(row => row.check), REQUIRED_NEGATIVE_CHECKS);

  for (const row of rows) {
    if (!REQUIRED_NEGATIVE_CHECKS.includes(row.check)) {
      errors.push(`Negative Tests: ${row.check}: unexpected check`);
    }
    validateLinkedStatus(errors, 'Negative Tests', row.check, row.status);
    if (isBlank(row.expectedResult)) {
      errors.push(`Negative Tests: ${row.check}: expected result is required`);
    }
    if (!isBlank(row.expectedResult) && !NEGATIVE_TEST_EXPECTED_RESULT_PATTERN.test(row.expectedResult)) {
      errors.push(
        `Negative Tests: ${row.check}: expected result must state rejected, blocked, refused, or failed`,
      );
    }
    if (!isBlank(row.expectedResult) && hasSlashDelimitedProofExpectedResultAlternative(row.expectedResult)) {
      errors.push(
        `Negative Tests: ${row.check}: expected result must use one exact fail-closed outcome without slash-delimited alternatives`,
      );
    }
    if (row.status === 'linked') {
      if (!hasEvidenceMarker(row.evidence)) {
        errors.push(`Negative Tests: ${row.check}: linked status requires an evidence marker`);
      } else if (!hasCompletedTrustlessBurnEvidenceTarget(row.evidence)) {
        errors.push(
          `Negative Tests: ${row.check}: linked status requires completed negative-test evidence, a non-template evidence link, or an artifact marker`,
        );
      }
      if (!hasNoContradictoryTrustlessBurnEvidenceMarker(row.evidence)) {
        errors.push(`Negative Tests: ${row.check}: evidence must not include contradictory trustless-burn failure markers`);
      }
      if (approvesTrustedFallbackPath(row.evidence)) {
        errors.push(`Negative Tests: ${row.check}: evidence must not approve trusted fallback paths`);
      }
      for (const marker of REQUIRED_NEGATIVE_EVIDENCE_MARKERS[row.check] ?? []) {
        if (!marker.pattern.test(row.evidence)) {
          errors.push(`Negative Tests: ${row.check}: ${marker.message}`);
        }
      }
      if (extractHex32Values(row.evidence).length === 0) {
        errors.push(
          `Negative Tests: ${row.check}: evidence must include at least one concrete 32-byte rejected proof or burn identifier`,
        );
      }
    }
  }

  errors.push(...validateTrustlessBurnLocalProofCoreNegativeRowBindings(rows, localProofVector));

  return errors;
}

interface CompletedTrustlessBurnEvidenceTargetBinding {
  target: string;
  label: string;
}

function validateDistinctCompletedTrustlessBurnEvidenceTargets(
  componentRows: RequiredComponentRow[],
  commitmentRows: CommitmentFormatRow[],
  burnProofRows: BurnProofBindingRow[],
  positiveRows: PositiveProofRow[],
  negativeRows: NegativeProofRow[],
): string[] {
  const bindings = [
    ...componentRows.flatMap(row => completedTrustlessBurnEvidenceTargetBindings(
      `Required Components: ${row.component}`,
      row.status,
      row.evidence,
    )),
    ...commitmentRows.flatMap(row => completedTrustlessBurnEvidenceTargetBindings(
      `Commitment Format: ${row.field}`,
      row.status,
      row.evidence,
    )),
    ...burnProofRows.flatMap(row => completedTrustlessBurnEvidenceTargetBindings(
      `Burn Proof Binding: ${row.field}`,
      row.status,
      row.evidence,
    )),
    ...positiveRows.flatMap(row => completedTrustlessBurnEvidenceTargetBindings(
      `Positive Proof Acceptance: ${row.check}`,
      row.status,
      row.evidence,
    )),
    ...negativeRows.flatMap(row => completedTrustlessBurnEvidenceTargetBindings(
      `Negative Tests: ${row.check}`,
      row.status,
      row.evidence,
    )),
  ];

  const errors: string[] = [];
  const firstLabelByTarget = new Map<string, string>();
  for (const binding of bindings) {
    const previousLabel = firstLabelByTarget.get(binding.target);
    if (previousLabel === undefined) {
      firstLabelByTarget.set(binding.target, binding.label);
      continue;
    }
    if (previousLabel !== binding.label) {
      errors.push(
        `Trustless burn evidence: completed evidence target ${binding.target} is reused by ${previousLabel} and ${binding.label}`,
      );
    }
  }

  return errors;
}

function validateLocalProofVectorReportTargetReuse(
  reportTarget: string | undefined,
  componentRows: RequiredComponentRow[],
  commitmentRows: CommitmentFormatRow[],
  burnProofRows: BurnProofBindingRow[],
  positiveRows: PositiveProofRow[],
  negativeRows: NegativeProofRow[],
  publicationDecision: Partial<PublicationDecisionFields>,
): string[] {
  if (!reportTarget) return [];

  const normalizedReportTarget = normalizeEvidenceTarget(reportTarget);
  if (!isConcreteEvidenceTarget(normalizedReportTarget)) return [];

  const rowBindings = [
    ...componentRows.flatMap(row => completedTrustlessBurnEvidenceTargetBindings(
      `Required Components: ${row.component}`,
      row.status,
      row.evidence,
    )),
    ...commitmentRows.flatMap(row => completedTrustlessBurnEvidenceTargetBindings(
      `Commitment Format: ${row.field}`,
      row.status,
      row.evidence,
    )),
    ...burnProofRows.flatMap(row => completedTrustlessBurnEvidenceTargetBindings(
      `Burn Proof Binding: ${row.field}`,
      row.status,
      row.evidence,
    )),
    ...positiveRows.flatMap(row => completedTrustlessBurnEvidenceTargetBindings(
      `Positive Proof Acceptance: ${row.check}`,
      row.status,
      row.evidence,
    )),
    ...negativeRows.flatMap(row => completedTrustlessBurnEvidenceTargetBindings(
      `Negative Tests: ${row.check}`,
      row.status,
      row.evidence,
    )),
  ];

  const publicationBindings = [
    ...completedTrustlessBurnPublicationUpdateEvidenceTargetBindings(
      'Publication Decision: Required release checklist updates',
      publicationDecision.requiredReleaseChecklistUpdates ?? '',
      hasCompletedTrustlessBurnChecklistUpdateEvidence,
    ),
    ...completedTrustlessBurnPublicationUpdateEvidenceTargetBindings(
      'Publication Decision: Required release-note updates',
      publicationDecision.requiredReleaseNoteUpdates ?? '',
      hasCompletedTrustlessBurnReleaseNoteUpdateEvidence,
    ),
  ];

  return [
    ...rowBindings
      .filter(binding => binding.target === normalizedReportTarget)
      .map(binding =>
        `${binding.label}: linked status must not reuse the Local Proof Vector report target as completed row evidence`,
      ),
    ...publicationBindings
      .filter(binding => binding.target === normalizedReportTarget)
      .map(binding =>
        `${binding.label} must not reuse the Local Proof Vector report target as completed publication-update evidence`,
      ),
  ];
}

function completedTrustlessBurnEvidenceTargetBindings(
  label: string,
  status: string,
  evidence: string,
): CompletedTrustlessBurnEvidenceTargetBinding[] {
  if (status !== 'linked' || !hasCompletedTrustlessBurnEvidenceTarget(evidence)) return [];

  const targets = new Set(
    extractCompletedTrustlessBurnEvidenceTargets(evidence)
      .map(normalizeEvidenceTarget)
      .filter(isConcreteEvidenceTarget),
  );

  return [...targets].map(target => ({ target, label }));
}

function completedTrustlessBurnPublicationUpdateEvidenceTargetBindings(
  label: string,
  value: string,
  isCompletedPublicationUpdateEvidence: (value: string) => boolean,
): CompletedTrustlessBurnEvidenceTargetBinding[] {
  if (!isCompletedPublicationUpdateEvidence(value)) return [];

  const targets = new Set(
    extractCompletedTrustlessBurnEvidenceTargets(value)
      .map(normalizeEvidenceTarget)
      .filter(isConcreteEvidenceTarget),
  );

  return [...targets].map(target => ({ target, label }));
}

export function validateTrustlessBurnLocalProofCoreNegativeRowBindings(
  rows: NegativeProofRow[],
  localProofVector: TrustlessBurnLocalProofVector | undefined,
): string[] {
  if (!localProofVector || !Array.isArray(localProofVector.negativeCases)) return [];

  const errors: string[] = [];
  const negativeCaseByName = new Map(
    localProofVector.negativeCases
      .filter(candidate => typeof candidate?.name === 'string')
      .map(candidate => [candidate.name.trim(), candidate]),
  );

  for (const [check, negativeCaseNames] of Object.entries(LOCAL_PROOF_CORE_NEGATIVE_CASES_BY_ROW)) {
    const row = rows.find(candidate => candidate.check === check);
    if (!row || row.status !== 'linked') continue;

    for (const negativeCaseName of negativeCaseNames) {
      const negativeCase = negativeCaseByName.get(negativeCaseName);
      if (!negativeCase) {
        errors.push(`Negative Tests: ${check}: Local Proof Vector negativeCase ${negativeCaseName} is required`);
        continue;
      }

      if (!citesLocalNegativeCase(row.evidence, negativeCaseName)) {
        errors.push(`Negative Tests: ${check}: evidence must cite Local Proof Vector negativeCase ${negativeCaseName}`);
      }
      if (!citesExpectedNegativeCaseError(row.evidence, negativeCase.expectedErrors)) {
        errors.push(
          `Negative Tests: ${check}: evidence must cite observed Local Proof Vector negativeCase ${negativeCaseName} error`,
        );
      }
    }
  }

  return errors;
}

function citesLocalNegativeCase(evidence: string, negativeCaseName: string): boolean {
  const escapedName = escapeRegExp(negativeCaseName);
  return new RegExp(
    `\\b(?:local proof vector\\s+)?negative\\s*case\\b[^\\n|;]{0,80}\\b${escapedName}\\b|\\bnegativeCases(?:\\.|\\[)${escapedName}\\b`,
    'i',
  ).test(evidence);
}

function citesExpectedNegativeCaseError(evidence: string, expectedErrors: string[]): boolean {
  return expectedErrors.some(error =>
    typeof error === 'string' &&
    error.trim().length > 0 &&
    exactProofCoreErrorPattern(error).test(evidence),
  );
}

function exactProofCoreErrorPattern(error: string): RegExp {
  const exactError = escapeRegExp(error.trim()).replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${exactError}\\s*(?:$|[.;,|)\\]\\r\\n])`, 'i');
}

function validateReviewerRows(rows: ReviewerSignoffRow[]): string[] {
  const errors = validateRequiredNames('Reviewer Sign-Off', rows.map(row => row.role), REQUIRED_REVIEWER_ROLES);

  for (const row of rows) {
    if (!REQUIRED_REVIEWER_ROLES.includes(row.role)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: unexpected role`);
    }
    if (isBlank(row.name)) errors.push(`Reviewer Sign-Off: ${row.role}: name is required`);
    if (!ALLOWED_REVIEWER_DECISIONS.has(row.decision as ReviewerDecision)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: decision must be approve or block`);
    } else if (row.decision !== 'approve') {
      errors.push(`Reviewer Sign-Off: ${row.role}: decision must be approve before Gate 5 evidence can pass`);
    }
    if (isBlank(row.date)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: date is required`);
    } else if (!isIsoCalendarDate(row.date)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: Date must use YYYY-MM-DD`);
    }
    if (isBlank(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes are required`);
    } else if (containsMainnetProductionClaim(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not contain mainnet production claim wording`);
    } else if (containsProductionReadyClaim(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not contain production-ready claim wording`);
    } else if (!isActionableReviewerNote(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must state a concrete trustless-burn outcome`);
    }
    if (!isBlank(row.notes) && !hasNoContradictoryTrustlessBurnEvidenceMarker(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not include contradictory trustless-burn failure markers`);
    }
    if (!isBlank(row.notes) && hasContradictoryTrustlessBurnDecisionBinding(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not include contradictory trustless-burn decision bindings`);
    }
    if (!isBlank(row.notes) && approvesTrustedFallbackPath(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not approve trusted fallback paths`);
    }
    if (!isBlank(row.notes) && leavesCriticalHighFindingsOpen(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not leave critical/high findings open`);
    }
  }

  return errors;
}

function containsMainnetProductionClaim(value: string): boolean {
  return classifyPublicationClaimText(value).hasMainnetProductionClaim;
}

function containsProductionReadyClaim(value: string): boolean {
  return classifyPublicationClaimText(value).hasProductionReadyClaim;
}

export function hasTrustlessBurnComponentProperty(component: string, requiredProperty: string): boolean {
  const markers = REQUIRED_COMPONENT_PROPERTY_MARKERS[component];
  return (
    Boolean(markers) &&
    hasNoContradictoryTrustlessBurnEvidenceMarker(requiredProperty) &&
    markers.every(marker => marker.pattern.test(requiredProperty))
  );
}

export function hasCompletedTrustlessBurnEvidenceTarget(evidence: string): boolean {
  const completedEvidenceText = trustlessBurnCompletedEvidenceText(evidence);
  return (
    hasCompletedEvidenceTarget(evidence) &&
    hasTrustlessBurnCompletedEvidenceMarker(completedEvidenceText) &&
    hasNoContradictoryTrustlessBurnEvidenceMarker(evidence)
  );
}

export function hasTrustlessBurnCommitmentFieldEncoding(field: string, valueOrEncoding: string): boolean {
  if (!REQUIRED_COMMITMENT_FIELDS.includes(field) || isBlank(valueOrEncoding)) return false;
  if (!hasNoContradictoryTrustlessBurnEvidenceMarker(valueOrEncoding)) return false;
  if (CONCRETE_COMMITMENT_HEX_FIELDS.has(field) && extractHex32Values(valueOrEncoding).length !== 1) return false;
  if (CONCRETE_COMMITMENT_INTEGER_FIELDS.has(field) && !NON_NEGATIVE_INTEGER_VALUE_PATTERN.test(valueOrEncoding.trim())) {
    return false;
  }
  return (REQUIRED_COMMITMENT_FIELD_MARKERS[field] ?? []).every(marker => marker.pattern.test(valueOrEncoding));
}

export function hasTrustlessBurnProofBinding(field: string, bindingRule: string): boolean {
  if (!REQUIRED_BURN_PROOF_FIELDS.includes(field) || isBlank(bindingRule)) return false;
  if (!hasNoContradictoryTrustlessBurnEvidenceMarker(bindingRule)) return false;
  if (CONCRETE_BURN_HEX_FIELDS.has(field) && extractHex32Values(bindingRule).length !== 1) return false;
  if (CONCRETE_BURN_INTEGER_FIELDS.has(field)) {
    const integerTokens = [...bindingRule.matchAll(NON_NEGATIVE_INTEGER_TOKEN_PATTERN)].map(match => match[0]);
    if (integerTokens.length !== 1) return false;
    if (field === 'amountNanoErg' && !isPositiveUint64IntegerText(integerTokens[0])) return false;
  }
  return (REQUIRED_BURN_BINDING_MARKERS[field] ?? []).every(marker => marker.pattern.test(bindingRule));
}

export function hasTrustlessBurnPositiveProofEvidence(
  check: string,
  expectedResult: string,
  evidence: string,
): boolean {
  return (
    REQUIRED_POSITIVE_CHECKS.includes(check) &&
    POSITIVE_TEST_EXPECTED_RESULT_PATTERN.test(expectedResult) &&
    !hasSlashDelimitedProofExpectedResultAlternative(expectedResult) &&
    hasNoContradictoryTrustlessBurnEvidenceMarker(expectedResult) &&
    hasNoContradictoryTrustlessBurnEvidenceMarker(evidence) &&
    hasCompletedTrustlessBurnEvidenceTarget(evidence) &&
    (REQUIRED_POSITIVE_EVIDENCE_MARKERS[check] ?? []).every(marker => marker.pattern.test(evidence))
  );
}

export function hasTrustlessBurnNegativeProofEvidence(
  check: string,
  expectedResult: string,
  evidence: string,
): boolean {
  return (
    REQUIRED_NEGATIVE_CHECKS.includes(check) &&
    NEGATIVE_TEST_EXPECTED_RESULT_PATTERN.test(expectedResult) &&
    !hasSlashDelimitedProofExpectedResultAlternative(expectedResult) &&
    hasNoContradictoryTrustlessBurnEvidenceMarker(evidence) &&
    hasCompletedTrustlessBurnEvidenceTarget(evidence) &&
    (REQUIRED_NEGATIVE_EVIDENCE_MARKERS[check] ?? []).every(marker => marker.pattern.test(evidence)) &&
    extractHex32Values(evidence).length > 0
  );
}

export function isActionableTrustlessBurnReviewerNote(value: string): boolean {
  return hasNoContradictoryTrustlessBurnEvidenceMarker(value) && isActionableReviewerNote(value);
}

export function hasCompletedTrustlessBurnChecklistUpdateEvidence(value: string): boolean {
  return (
    hasCompletedTrustlessBurnEvidenceTarget(value) &&
    identifiesGate5ChecklistUpdateEvidence(value) &&
    hasNoContradictoryTrustlessBurnEvidenceMarker(value)
  );
}

export function hasCompletedTrustlessBurnReleaseNoteUpdateEvidence(value: string): boolean {
  return (
    hasCompletedTrustlessBurnEvidenceTarget(value) &&
    identifiesGate5ReleaseNoteUpdateEvidence(value) &&
    hasNoContradictoryTrustlessBurnEvidenceMarker(value)
  );
}

function hasTrustlessBurnCompletedEvidenceMarker(value: string): boolean {
  if (hasNegatedTrustlessBurnCompletedEvidenceMarker(value)) return false;
  return (
    /\bcompleted\b/i.test(value) ||
    extractArtifactTargets(value).some(target => /(?:^|[\/_.-])completed(?:[\/_.-]|$)/i.test(target))
  );
}

function hasNegatedTrustlessBurnCompletedEvidenceMarker(value: string): boolean {
  return /\b(?:not|never|without|missing|lacks?)\s+completed\b|\bnot[-_]+completed\b|\buncompleted\b/i
    .test(value);
}

function findTrustlessBurnValidationTargetBinding(value: string): RegExpExecArray | null {
  return /\b(?:validated[-_/\s]+target|validated[-_/\s]+input|trustless[-_/\s]+validate[-_/\s]+target|trustless[-_/\s]+burn[-_/\s]+validation[-_/\s]+target)\b/i
    .exec(value);
}

export function hasNoContradictoryTrustlessBurnEvidenceMarker(value: string): boolean {
  return !hasContradictoryTrustlessBurnEvidenceMarker(value);
}

function hasContradictoryTrustlessBurnEvidenceMarker(value: string): boolean {
  const normalized = normalizeEvidenceMarkerText(value);
  return (
    /\b(?:status|result|validation|validator|command|run|outcome|output)\s*[:=]?\s*(?:FAIL(?:ED)?|BLOCKED|ERROR)\b/i.test(normalized) ||
    /\b(?:FAIL(?:ED)?|BLOCKED|ERROR)\b\s+(?:validation|validator|command|run|result|status|outcome|output)\b/i.test(normalized) ||
    hasAmbiguousTrustlessBurnResultCount(normalized) ||
    /\bexit\s+code\s*[:=]?\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\berrors?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    hasUnresolvedIssueMarker(normalized) ||
    /\bstructural\s+issues?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\b[1-9]\d*\s+structural\s+issues?\b/i.test(normalized)
  );
}

function hasAmbiguousTrustlessBurnResultCount(value: string): boolean {
  return /\b(?:errors?|structural\s+issues?)\s*(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(value);
}

function hasSlashDelimitedProofExpectedResultAlternative(value: string): boolean {
  return PROOF_EXPECTED_RESULT_ALTERNATIVE_PATTERN.test(value);
}

function approvesTrustedFallbackPath(value: string): boolean {
  const trustedFallbackPath =
    '(?:transitional trusted burn path(?: handling)?|trusted burn path(?: handling)?|trusted oracle fallback|oracle fallback|trusted fallback)';
  const approvalTerm =
    '(?:accept|accepted|accepts|approve|approved|approves|allow|allowed|allows|enable|enabled|enables|support|supported|supports|permit|permitted|permits|clear|cleared|clears|grant|granted|grants|authori[sz]e|authori[sz]ed|authori[sz]es|certify|certified|certifies|endorse|endorsed|endorses|recommend|recommended|recommends|accredit|accredited|accredits|use as trustless|used as trustless|uses as trustless)';

  return normalizedTrustlessBurnEvidenceTextSegments(value).some(normalized =>
    trustlessBurnTextApprovesSubject(normalized, trustedFallbackPath, approvalTerm),
  );
}

function trustlessBurnTextApprovesSubject(
  normalized: string,
  subject: string,
  approval: string,
): boolean {
  const approvalConnector =
    '(?:\\s+(?!\\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,3}';
  const approvalSubjectConnector =
    '(?:\\s+(?!\\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,1}';

  return [
    new RegExp(`\\b${subject}\\b${approvalConnector}\\s+${approval}\\b`, 'gi'),
    new RegExp(`\\b${approval}\\b${approvalSubjectConnector}\\s+${subject}\\b`, 'gi'),
  ].some(pattern => hasUnnegatedTrustlessBurnApproval(normalized, pattern));
}

function hasUnnegatedTrustlessBurnApproval(normalized: string, pattern: RegExp): boolean {
  for (const match of normalized.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = normalized.slice(Math.max(0, index - 32), index);
    if (!/\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)(?:\s+of)?\s+$/.test(prefix)) return true;
  }
  return false;
}

function hasExactTransitionalTrustedBurnPathDisabledBinding(value: string): boolean {
  return /\bTransitional trusted burn path disabled\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactTrustlessBurnVerificationImplementedBinding(value: string): boolean {
  return /\bTrustless burn verification implemented\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactProductionReadyClaimDeniedBinding(value: string): boolean {
  return /\bProduction-ready claim allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactProductionCandidateReleaseSupportedBinding(value: string): boolean {
  return hasExactReleaseSupportedBinding(value, 'production deployment candidate');
}

function hasExactReleaseSupportedBinding(value: string, expected: string): boolean {
  return new RegExp(`\\bRelease supported\\s*=\\s*${escapeRegExp(expected)}\\s*(?:$|[.;,|)\\]\\r\\n])`, 'i').test(value);
}

function hasExactTestnetProductionCandidateClaimAllowedBinding(
  value: string,
  expected: 'yes' | 'no',
): boolean {
  return new RegExp(`\\bTestnet production-candidate claim allowed\\s*=\\s*${expected}\\s*(?:$|[.;,|)\\]\\r\\n])`, 'i').test(value);
}

function hasContradictoryTrustlessBurnDecisionBinding(value: string): boolean {
  return (
    hasMixedTrustlessBurnDecisionBindings(
      value,
      'Release supported',
      'none|validated\\s+PoC|institutional\\s+reference|production\\s+deployment\\s+candidate',
    ) ||
    hasOpposingTrustlessBurnDecisionBindings(value, 'Trustless burn verification implemented') ||
    hasOpposingTrustlessBurnDecisionBindings(value, 'Production[-\\s]+ready claim allowed') ||
    hasOpposingTrustlessBurnDecisionBindings(value, 'Testnet production[-\\s]+candidate claim allowed') ||
    hasOpposingTrustlessBurnDecisionBindings(value, 'Transitional trusted burn path disabled') ||
    hasMixedZeroAndNonzeroTrustlessBurnDecisionBindings(value, 'Critical/high findings open')
  );
}

function hasMixedTrustlessBurnDecisionBindings(
  value: string,
  fieldPattern: string,
  valuePattern: string,
): boolean {
  return exactTrustlessBurnDecisionBindingValues(value, fieldPattern, valuePattern).size > 1;
}

function hasOpposingTrustlessBurnDecisionBindings(value: string, fieldPattern: string): boolean {
  const values = exactTrustlessBurnDecisionBindingValues(value, fieldPattern, 'yes|no');
  return values.has('yes') && values.has('no');
}

function hasMixedZeroAndNonzeroTrustlessBurnDecisionBindings(value: string, fieldPattern: string): boolean {
  const values = exactTrustlessBurnDecisionBindingValues(value, fieldPattern, '\\d+');
  return values.has('0') && Array.from(values).some(count => count !== '0');
}

function exactTrustlessBurnDecisionBindingValues(
  value: string,
  fieldPattern: string,
  valuePattern: string,
): Set<string> {
  const pattern = new RegExp(
    `\\b${fieldPattern}\\s*=\\s*(${valuePattern})\\s*(?:$|[.;,|)\\]\\r\\n])`,
    'ig',
  );
  return new Set(
    Array.from(value.matchAll(pattern), match => normalizeDecisionSummary(match[1] ?? '')),
  );
}

function usesProseOnlyTrustedPathClosure(value: string): boolean {
  const normalized = normalizeDecisionSummary(value);
  const trustedPath =
    '(?:transitional trusted burn path(?: handling)?|trusted burn path(?: handling)?|trusted oracle fallback|oracle fallback|trusted fallback)';
  return (
    (
      new RegExp(`\\b${trustedPath}\\s+(?:disabled|blocked|not allowed)\\b`).test(normalized) ||
      new RegExp(`\\b(?:disabled|blocked|not allowed)\\s+${trustedPath}\\b`).test(normalized)
    ) &&
    !hasExactTransitionalTrustedBurnPathDisabledBinding(value)
  );
}

function criticalHighFindingsSubjectPattern(): string {
  return '(?:critical high|critical and high|critical or high|critical|high)\\s+findings?';
}

function hasExactCriticalHighFindingsOpenBinding(value: string): boolean {
  return /\bCritical\/high findings open\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function usesTextualCriticalHighFindingClosure(value: string): boolean {
  const normalized = normalizeDecisionSummary(value);
  const subject = criticalHighFindingsSubjectPattern();
  const textualClosure = '(?:zero|none|no|closed|resolved|mitigated|n a)';
  return (
    new RegExp(`\\b${subject}\\s+(?:are\\s+)?(?:open\\s+)?${textualClosure}\\b`).test(normalized) ||
    new RegExp(`\\bopen\\s+${subject}\\s+${textualClosure}\\b`).test(normalized) ||
    new RegExp(`\\b${textualClosure}\\s+(?:open\\s+)?${subject}\\b`).test(normalized)
  );
}

function usesNumericCriticalHighFindingClosure(value: string): boolean {
  const normalized = normalizeDecisionSummary(value);
  const subject = criticalHighFindingsSubjectPattern();
  return (
    new RegExp(`\\b${subject}\\s+(?:are\\s+)?open\\s+0\\b`).test(normalized) ||
    new RegExp(`\\bopen\\s+${subject}\\s+0\\b`).test(normalized) ||
    new RegExp(`\\b${subject}\\s+0\\b`).test(normalized) ||
    new RegExp(`\\b${subject}\\s+(?:closure|count|handling)\\s+0\\b`).test(normalized) ||
    new RegExp(`\\b0\\s+(?:open\\s+)?${subject}\\b`).test(normalized)
  );
}

function usesNonExactCriticalHighFindingClosure(value: string): boolean {
  return (
    (usesTextualCriticalHighFindingClosure(value) || usesNumericCriticalHighFindingClosure(value)) &&
    !hasExactCriticalHighFindingsOpenBinding(value)
  );
}

function leavesCriticalHighFindingsOpen(value: string): boolean {
  const subject = criticalHighFindingsSubjectPattern();
  const unresolvedState = '(?:pending|unresolved|outstanding|remaining|awaiting|waiting(?:\\s+(?:for|on))?|deferred)';
  return normalizedTrustlessBurnEvidenceTextSegments(value).some(segment => {
    if (trustlessBurnSummaryConfirmsNoOpenCriticalHighFindings(segment, subject)) return false;
    return (
      new RegExp(`\\b${subject}\\s+open\\s+(?!0\\b|none\\b|no\\b|closed\\b)\\S+\\b`).test(segment) ||
      new RegExp(`\\b${subject}\\s+(?:count|total)\\s+(?!0\\b|zero\\b|none\\b|no\\b|closed\\b|resolved\\b|mitigated\\b)\\S+\\s+${unresolvedState}\\b`).test(segment) ||
      new RegExp(`\\bopen\\s+${subject}\\b`).test(segment) ||
      new RegExp(`\\b${subject}\\s+${unresolvedState}\\b`).test(segment) ||
      new RegExp(`\\b${unresolvedState}\\s+${subject}\\b`).test(segment)
    );
  });
}

function trustlessBurnSummaryConfirmsNoOpenCriticalHighFindings(segment: string, subject: string): boolean {
  return new RegExp(`\\b(?:no|none|zero|without|absence|absent|lack|lacks|lacking)(?:\\s+of)?\\s+(?:open\\s+)?${subject}\\b`).test(segment);
}

function normalizedTrustlessBurnEvidenceTextSegments(value: string): string[] {
  return value
    .split(/[\n\r|;]+|[.]\s+/)
    .map(segment => normalizeDecisionSummary(segment))
    .filter(segment => segment.length > 0);
}

function validateReviewerIdentityConsistency(markdown: string, rows: ReviewerSignoffRow[]): string[] {
  const classification = parseTwoColumnTable(
    sectionBetween(markdown, '## Evidence Classification', '## Required Components'),
  );
  const classifiedReviewer = classification.get('Reviewer')?.trim() ?? '';
  const protocolReviewerSignoff = rows.find(row => row.role === 'Protocol reviewer')?.name.trim() ?? '';

  if (
    classifiedReviewer.length > 0 &&
    protocolReviewerSignoff.length > 0 &&
    classifiedReviewer !== protocolReviewerSignoff
  ) {
    return ['Reviewer Sign-Off: Protocol reviewer: name must match Evidence Classification Reviewer'];
  }

  return [];
}

function validateReviewerDateConsistency(markdown: string, rows: ReviewerSignoffRow[]): string[] {
  const classification = parseTwoColumnTable(
    sectionBetween(markdown, '## Evidence Classification', '## Required Components'),
  );
  const classificationDate = classification.get('Date')?.trim() ?? '';
  if (!isIsoCalendarDate(classificationDate)) return [];

  return rows
    .filter(row => isIsoCalendarDate(row.date) && row.date < classificationDate)
    .map(row => `Reviewer Sign-Off: ${row.role}: Date must not be before Evidence Classification Date`);
}

function validateLinkedStatus(errors: string[], section: string, label: string, status: string): void {
  if (!ALLOWED_STATUSES.has(status as TrustlessBurnEvidenceStatus)) {
    errors.push(`${section}: ${label}: status must be pending, linked, or blocker`);
    return;
  }
  if (status !== 'linked') {
    errors.push(`${section}: ${label}: status must be linked before Gate 5 evidence can pass`);
  }
}

function validateExactlyOneHex32Value(
  errors: string[],
  section: string,
  field: string,
  value: string,
  label: string,
): void {
  if (extractHex32Values(value).length !== 1) {
    errors.push(`${section}: ${field}: ${label} must include exactly one 32-byte hex value`);
  }
}

function validateIntegerValue(
  errors: string[],
  section: string,
  field: string,
  value: string,
  label: string,
): void {
  if (!NON_NEGATIVE_INTEGER_VALUE_PATTERN.test(value.trim())) {
    errors.push(`${section}: ${field}: ${label} must be a non-negative integer`);
  }
}

function validateExactlyOneIntegerToken(
  errors: string[],
  section: string,
  field: string,
  value: string,
  label: string,
): void {
  if ([...value.matchAll(NON_NEGATIVE_INTEGER_TOKEN_PATTERN)].length !== 1) {
    errors.push(`${section}: ${field}: ${label} must include exactly one non-negative integer`);
  }
}

function validatePositiveBurnAmount(errors: string[], field: string, value: string): void {
  if (field !== 'amountNanoErg') return;
  const integerTokens = [...value.matchAll(NON_NEGATIVE_INTEGER_TOKEN_PATTERN)].map(match => match[0]);
  if (integerTokens.length !== 1) return;
  if (!/^(?!0+$)\d+$/.test(integerTokens[0])) {
    errors.push('Burn Proof Binding: amountNanoErg: binding rule must include a positive nanoERG amount');
  } else if (!isPositiveUint64IntegerText(integerTokens[0])) {
    errors.push('Burn Proof Binding: amountNanoErg: binding rule must fit uint64 amountNanoErg');
  }
}

function isPositiveUint64IntegerText(value: string): boolean {
  const normalized = value.trim();
  return /^(?!0+$)\d+$/.test(normalized) && BigInt(normalized) <= UINT64_MAX;
}

function extractHex32Values(value: string): string[] {
  return [...value.matchAll(HEX_32_BYTE_PATTERN)].map(match => match[1]);
}

function concreteHexValue(
  rows: Array<CommitmentFormatRow | BurnProofBindingRow>,
  field: string,
  valueKey: 'valueOrEncoding' | 'bindingRule',
): string | null {
  const row = rows.find(candidate => 'field' in candidate && candidate.field === field);
  if (!row) return null;
  const value = valueKey === 'valueOrEncoding'
    ? (row as CommitmentFormatRow).valueOrEncoding
    : (row as BurnProofBindingRow).bindingRule;
  const values = extractHex32Values(value);
  return values.length === 1 ? values[0].toLowerCase() : null;
}

function concreteIntegerValue(rows: BurnProofBindingRow[], field: string): string | null {
  const row = rows.find(candidate => candidate.field === field);
  if (!row) return null;
  const values = [...row.bindingRule.matchAll(NON_NEGATIVE_INTEGER_TOKEN_PATTERN)].map(match => match[0]);
  return values.length === 1 ? values[0] : null;
}

function containsAmountValue(value: string, expectedAmount: string): boolean {
  return new RegExp(`\\bamount(?:NanoErg)?\\s*(?:=|:)?\\s*${escapeRegExp(expectedAmount)}\\b`, 'i').test(value);
}

function containsNamedHex32Value(value: string, field: string, expectedHex: string): boolean {
  return new RegExp(`\\b${escapeRegExp(field)}\\s*(?:=|:)?\\s*(?:0x)?${escapeRegExp(expectedHex)}\\b`, 'i').test(value);
}

function containsAnyNamedHex32Value(value: string, fields: string[], expectedHex: string): boolean {
  return fields.some(field => containsNamedHex32Value(value, field, expectedHex));
}

function containsNamedIntegerValue(value: string, field: string, expectedValue: string): boolean {
  return new RegExp(`\\b${escapeRegExp(field)}\\s*(?:=|:)?\\s*${escapeRegExp(expectedValue)}\\b`, 'i').test(value);
}

function compareHexValue(
  errors: string[],
  vectorField: string,
  actual: unknown,
  expected: string | null,
  expectedLabel: string,
): void {
  if (!expected) return;
  const actualHex = normalizeHex32Value(actual);
  if (!actualHex || actualHex !== expected.toLowerCase()) {
    errors.push(`Local Proof Vector: ${vectorField} must match ${expectedLabel}`);
  }
}

function compareIntegerValue(
  errors: string[],
  vectorField: string,
  actual: unknown,
  expected: string | null,
  expectedLabel: string,
): void {
  if (!expected) return;
  const actualInteger = normalizeIntegerValue(actual);
  if (actualInteger !== expected) {
    errors.push(`Local Proof Vector: ${vectorField} must match ${expectedLabel}`);
  }
}

function normalizeHex32Value(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/^0x/i, '').toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

function normalizeIntegerValue(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') return null;
  const normalized = String(value);
  return /^\d+$/.test(normalized) ? BigInt(normalized).toString() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isActionableReviewerNote(value: string): boolean {
  return (
    /\b(accept|accepted|approve|approved|verify|verified|validate|validated|confirm|confirmed|pass|passed|fail|failed|block|blocked|reject|rejected|refuse|refused|match|matched|reconcile|reconciled|complete|completed)\b/i.test(value) &&
    /\b(trustless burn|burn proof|burn inclusion|sidechain commitment|commitment format|extension|0x04xx|Blake2b|SPV|finality|DUP|duplicate|settlement binding|reorg|recipient|amount|anchor|trusted[- ]oracle)\b/i.test(value)
  );
}

function isActionableReviewerDecisionSummary(value: string): boolean {
  const normalized = normalizeDecisionSummary(value);
  return (
    /\brelease supported\b/i.test(normalized) &&
    /\btrustless burn verification implemented\b|\btrustless burn verification implementation\b|\btrustless burn implemented\b/i.test(normalized) &&
    hasExactTrustlessBurnVerificationImplementedBinding(value) &&
    /\bproduction ready claim handling\b/i.test(normalized) &&
    /\btestnet production candidate claim handling\b/i.test(normalized) &&
    /\btransitional trusted burn path handling\b/i.test(normalized) &&
    /\bcritical high findings\b|\bcritical and high findings\b|\bcritical or high findings\b/i.test(normalized)
  );
}

function disablesTransitionalTrustedBurnPathInReviewerSummary(value: string): boolean {
  const normalized = normalizeDecisionSummary(value);
  return (
    hasExactTransitionalTrustedBurnPathDisabledBinding(value) ||
    /\btransitional trusted burn path handling\s+(?:disabled|blocked|not allowed)\b/i.test(normalized)
  );
}

function normalizeDecisionSummary(value: string): string {
  return normalizeEvidenceMarkerText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function validateAllowedField(
  errors: string[],
  fields: Map<string, string>,
  section: string,
  field: string,
  allowed: Set<string>,
): void {
  const value = fields.get(field) ?? '';
  if (!isBlank(value) && !allowed.has(value)) {
    errors.push(`${section}: ${field} must be one of ${[...allowed].join(', ')}`);
  }
}

function parseTableBetween(markdown: string, startHeading: string, endHeading?: string): string[][] {
  const section = sectionBetween(markdown, startHeading, endHeading);
  const firstTableLine = section.search(/^\|/m);
  if (firstTableLine < 0) throw new Error(`${startHeading}: table not found`);
  return parseMarkdownTableRows(section.slice(firstTableLine));
}

function parseTwoColumnFieldNames(section: string): string[] {
  return parseMarkdownTableRows(section)
    .filter(row => row.length >= 2)
    .map(row => row[0]);
}

function parseTwoColumnTable(section: string): Map<string, string> {
  const fields = new Map<string, string>();
  const rows = parseMarkdownTableRows(section);
  for (const row of rows) {
    if (row.length >= 2) fields.set(row[0], row[1]);
  }
  return fields;
}

function sectionBetween(markdown: string, startHeading: string, endHeading?: string): string {
  const start = markdown.indexOf(startHeading);
  if (start < 0) return '';

  const contentStart = start + startHeading.length;
  const end = endHeading ? markdown.indexOf(endHeading, contentStart) : markdown.length;
  return markdown.slice(contentStart, end < 0 ? markdown.length : end);
}

function hasEvidenceMarker(value: string): boolean {
  return (
    /\[[^\]]+\]\([^)]+\)/.test(value) ||
    /\bnpm run [A-Za-z0-9:_-]+\b/.test(value) ||
    /(?:^|\s)artifact:\/\//.test(value)
  );
}

function hasCompletedEvidenceMarker(value: string): boolean {
  return (
    hasCompletedArtifactTarget(value) ||
    hasNonTemplateMarkdownLink(value) ||
    hasCommandOutputMarker(value)
  );
}

function hasCompletedEvidenceTarget(value: string): boolean {
  const completedEvidenceText = trustlessBurnCompletedEvidenceText(value);
  return !hasLocalOnlyEvidenceTarget(value) &&
    !hasClaimEscalatingTrustlessBurnEvidenceReference(value) &&
    (hasCompletedArtifactTarget(completedEvidenceText) || hasNonTemplateMarkdownLink(completedEvidenceText));
}

function hasCompletedArtifactTarget(value: string): boolean {
  return extractArtifactTargets(value).some(isConcreteArtifactTarget);
}

function extractArtifactTargets(value: string): string[] {
  return [...value.matchAll(/(?:^|\s)(artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;]+)/g)]
    .map(([, target]) => target.replace(/[.;]+$/g, ''));
}

function extractEvidenceTargets(value: string): string[] {
  return [
    ...extractArtifactTargets(value),
    ...[...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(([, target]) => target),
  ];
}

function extractCompletedTrustlessBurnEvidenceTargets(value: string): string[] {
  return extractEvidenceTargets(trustlessBurnCompletedEvidenceText(value));
}

function trustlessBurnCompletedEvidenceText(value: string): string {
  return value
    .split(/[;\n]+/)
    .map(segment => {
      const targetBinding = findTrustlessBurnValidationTargetBinding(segment);
      return targetBinding
        ? segment.slice(0, targetBinding.index).trim()
        : segment.trim();
    })
    .filter(segment => segment.length > 0)
    .join('; ');
}

function normalizeEvidenceTarget(target: string): string {
  return target.split('#')[0].split('?')[0].replace(/[),;]+$/g, '').trim().toLowerCase();
}

function haveSharedConcreteEvidenceTarget(left: string, right: string): boolean {
  const leftTargets = new Set(
    extractCompletedTrustlessBurnEvidenceTargets(left)
      .map(normalizeEvidenceTarget)
      .filter(isConcreteEvidenceTarget),
  );
  return extractCompletedTrustlessBurnEvidenceTargets(right)
    .map(normalizeEvidenceTarget)
    .filter(isConcreteEvidenceTarget)
    .some(target => leftTargets.has(target));
}

function isConcreteArtifactTarget(target: string): boolean {
  const match = /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/(.+)$/i.exec(target.trim());
  if (match === null) return false;
  if (hasClaimEscalatingTrustlessBurnEvidenceTarget(target)) return false;
  if (isSensitiveOrRuntimeTrustlessBurnEvidenceTarget(target)) return false;
  const path = match[1].split(/[?#]/, 1)[0];
  return path.split(/[\\/]+/).every(segment => !isNonConcreteArtifactSegment(segment));
}

function isNonConcreteArtifactSegment(segment: string): boolean {
  const normalized = segment.toLowerCase().replace(/\.[a-z0-9]+$/i, '');
  return (
    /(?:^|[-_.])(?:not[-_]?completed|uncompleted)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])template(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|trustless|burn|commitment|component|positive|negative|local|vector|report|spv|dup|inclusion|release|checklist)|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:placeholder|generic|todo|tbd)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])sample(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|trustless|burn|commitment|component|positive|negative|local|vector|report|spv|dup|inclusion|release|checklist)|$)/i.test(normalized) ||
    /(?:^|[-_.])example(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|validator|trustless|burn|commitment|component|positive|negative|local|vector|report|spv|dup|inclusion|release|checklist)|$)/i.test(normalized)
  );
}

function hasNonTemplateMarkdownLink(value: string): boolean {
  const links = [...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)];
  return links.some(([, rawTarget]) => isConcreteEvidenceTarget(rawTarget));
}

function isConcreteEvidenceTarget(target: string): boolean {
  const trimmed = target.trim();
  if (hasClaimEscalatingTrustlessBurnEvidenceTarget(trimmed)) return false;
  if (/^artifact:\/\//i.test(trimmed)) return isConcreteArtifactTarget(trimmed);
  const path = trimmed.split(/[?#]/, 1)[0];
  if (isLocalOnlyEvidenceTarget(path)) return false;
  if (isSensitiveOrRuntimeTrustlessBurnEvidenceTarget(path)) return false;
  return (
    !/-template\.md$/i.test(path) &&
    path.split(/[\\/]+/).every(segment => !isNonConcreteArtifactSegment(segment))
  );
}

function isSensitiveOrRuntimeTrustlessBurnEvidenceTarget(target: string): boolean {
  const normalized = target.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized).some(isSensitiveOrRuntimeTrustlessBurnEvidenceInspectionTarget);
}

function isSensitiveOrRuntimeTrustlessBurnEvidenceInspectionTarget(normalizedTarget: string): boolean {
  const name = basename(normalizedTarget);
  return (
    hasTrustlessBurnEnvironmentTargetSegment(normalizedTarget) ||
    hasTrustlessBurnRuntimeDatabaseTargetSegment(normalizedTarget) ||
    isEvidenceEnvironmentFileName(name) ||
    isEvidenceSecretOrRuntimeName(normalizedTarget, { includeDeployedState: true }) ||
    isEvidenceRuntimeDatabaseTarget(normalizedTarget)
  );
}

function hasTrustlessBurnEnvironmentTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\/\s,;=()]+/)
    .some(segment => isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasTrustlessBurnRuntimeDatabaseTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\s,;=()]+/)
    .some(segment => isEvidenceRuntimeDatabaseTarget(segment.replace(/[),;]+$/g, '')));
}

function hasClaimEscalatingTrustlessBurnEvidenceReference(value: string): boolean {
  return extractEvidenceTargets(value)
    .some(target => hasClaimEscalatingTrustlessBurnEvidenceTarget(target));
}

function hasClaimEscalatingTrustlessBurnEvidenceTarget(target: string): boolean {
  const claim = classifyPublicationClaimText(normalizeEvidenceTarget(target));
  return claim.hasProductionClaim;
}

function hasLocalOnlyEvidenceTarget(value: string): boolean {
  const normalized = value.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized).some(hasLocalOnlyEvidenceInspectionText);
}

function hasLocalOnlyEvidenceInspectionText(normalized: string): boolean {
  return hasEvidenceLocalOnlyInspectionReference(normalized);
}

function isLocalOnlyEvidenceTarget(value: string): boolean {
  const normalized = value.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized).some(isLocalOnlyEvidenceInspectionTarget);
}

function isLocalOnlyEvidenceInspectionTarget(normalized: string): boolean {
  return (
    hasEvidenceLocalOnlyInspectionReference(normalized) ||
    /^file:\/\//i.test(normalized) ||
    /^[a-z]:\//i.test(normalized) ||
    /^\/\/[^/]/.test(normalized) ||
    /^\/(?:users?|home|tmp|var|private|mnt|volumes|etc)(?:\/|$)/i.test(normalized)
  );
}

function hasCommandOutputMarker(value: string): boolean {
  return (
    /\bnpm run [A-Za-z0-9:_-]+\b/.test(value) &&
    /\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i.test(value)
  );
}

function identifiesGate5ChecklistUpdateEvidence(value: string): boolean {
  return identifiesTrustlessBurnPublicationEvidenceKind(value, 'completed Gate 5 checklist update evidence');
}

function identifiesGate5ReleaseNoteUpdateEvidence(value: string): boolean {
  return identifiesTrustlessBurnPublicationEvidenceKind(value, 'completed Gate 5 release-note update evidence');
}

function identifiesTrustlessBurnPublicationEvidenceKind(value: string, evidenceKind: string): boolean {
  const normalizedKind = normalizeTrustlessBurnEvidenceKind(evidenceKind);
  return trustlessBurnPublicationEvidenceTargetsIdentifyKind(value, normalizedKind) ||
    trustlessBurnPublicationEvidenceKindTextSegments(value)
      .some(segment =>
        segment === normalizedKind ||
        segment.startsWith(`${normalizedKind} `)
      );
}

function trustlessBurnPublicationEvidenceTargetsIdentifyKind(value: string, normalizedKind: string): boolean {
  const expectedSlug = normalizedKind.replace(/\s+/g, '-');
  return extractCompletedTrustlessBurnEvidenceTargets(value)
    .some(target => normalizeTrustlessBurnPublicationEvidenceTargetBasename(target) === expectedSlug);
}

function normalizeTrustlessBurnPublicationEvidenceTargetBasename(target: string): string {
  const normalizedTarget = normalizeEvidenceTarget(target).replace(/\\/g, '/');
  const basename = normalizedTarget.split('/').filter(Boolean).pop() ?? normalizedTarget;
  return normalizeTrustlessBurnEvidenceKind(basename.replace(/\.[a-z0-9]+$/i, '')).replace(/\s+/g, '-');
}

function trustlessBurnPublicationEvidenceKindTextSegments(value: string): string[] {
  return value
    .split(/[;\n|]+/)
    .map(stripLeadingTrustlessBurnEvidenceTarget)
    .map(normalizeTrustlessBurnEvidenceKind)
    .filter(segment => segment.length > 0);
}

function stripLeadingTrustlessBurnEvidenceTarget(value: string): string {
  const trimmed = value.trim();
  const markdownMatch = /^\[[^\]]+\]\([^)]+\)/.exec(trimmed);
  if (markdownMatch) return trimmed.slice(markdownMatch[0].length).replace(/^[\s,.:;-]+/, '');

  const artifactMatch = /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;|]+/i.exec(trimmed);
  if (artifactMatch) return trimmed.slice(artifactMatch[0].length).replace(/^[\s,.:;-]+/, '');

  return trimmed;
}

function normalizeTrustlessBurnEvidenceKind(value: string): string {
  return normalizeEvidenceMarkerText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isZeroLike(value: string): boolean {
  return /^(0|none|no|n\/a)$/i.test(value.trim());
}

function isExactZero(value: string): boolean {
  return /^0$/.test(value.trim());
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}
