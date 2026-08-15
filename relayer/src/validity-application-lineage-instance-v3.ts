import { createHash } from 'node:crypto';

import blakejs from 'blakejs';

import {
  encodeBridgeCausalApplicationBindingV2,
  deriveBridgeCausalApplicationBindingV2DigestHex,
} from './bridge-validity-application-statement-v2.js';
import {
  createCommitteeConfig,
  injectCommitteePlaceholders,
  type CommitteeConfig,
} from './committee-config.js';
import {
  assertDerivedPegInCausalLineageProfileV3Candidate,
  type PegInCausalLineageProfileV3Candidate,
} from './peg-in-causal-lineage-profile-v3.js';

export const VALIDITY_APPLICATION_LINEAGE_INSTANCE_V3_SCHEMA =
  'e2s.validity-application-lineage-instance.v3' as const;
export const VALIDITY_APPLICATION_LINEAGE_COMPILER_RECEIPT_V1_SCHEMA =
  'e2s.validity-application-lineage-compiler-receipt.v1' as const;
export const VALIDITY_APPLICATION_LINEAGE_SOURCE_COMMITMENT_POLICY_V1_DOMAIN =
  'E2S_VALIDITY_APPLICATION_LINEAGE_SOURCE_COMMITMENT_POLICY_V1' as const;
export const VALIDITY_APPLICATION_LINEAGE_FINALITY_POLICY_V1_DOMAIN =
  'E2S_VALIDITY_APPLICATION_LINEAGE_FINALITY_POLICY_V1' as const;
export const VALIDITY_APPLICATION_LINEAGE_SIGMASTATE_COMMIT =
  'f78deadd668f801e7fae3bc884283f79c6f484fa' as const;
export const VALIDITY_APPLICATION_LINEAGE_SCALA_VERSION = '2.13.18' as const;
export const VALIDITY_APPLICATION_LINEAGE_SBT_VERSION = '1.12.11' as const;
export const VALIDITY_APPLICATION_LINEAGE_COMPILER_BATCH_V1_SHA256_HEX =
  '280081d89ad8303506b3890559bef047cf6ac1bb2a23b729a7e9903e77cf3132' as const;

const PLACEHOLDER_PATTERN = /[A-Z][A-Z0-9_]+_PLACEHOLDERS?/g;
const TRACKER_PLACEHOLDERS = Object.freeze([
  'VALIDITY_APPLICATION_PROGRAM_ID_PLACEHOLDER',
  'VALIDITY_APPLICATION_VERIFIER_PROFILE_ID_PLACEHOLDER',
  'VALIDITY_APPLICATION_BINDING_PLACEHOLDER',
] as const);
const VAULT_PLACEHOLDERS = Object.freeze([
  'TRACKER_NFT_ID_PLACEHOLDER',
  'DUP_NFT_ID_PLACEHOLDER',
  'VALIDITY_APPLICATION_TRACKER_CONTRACT_ID_PLACEHOLDER',
  'VALIDITY_SOURCE_NETWORK_ID_PLACEHOLDER',
  'VALIDITY_SIDECHAIN_ID_PLACEHOLDER',
  'VALIDITY_APPLICATION_SETTLEMENT_PROFILE_ID_PLACEHOLDER',
  'VALIDITY_APPLICATION_CAUSAL_PROFILE_ID_PLACEHOLDER',
  'VALIDITY_APPLICATION_BRIDGE_ADDRESS_PLACEHOLDER',
  'VALIDITY_APPLICATION_TOKEN_ADDRESS_PLACEHOLDER',
  'VALIDITY_TRUST_ANCHOR_DIGEST_PLACEHOLDER',
  'VALIDITY_APPLICATION_BINDING_DIGEST_PLACEHOLDER',
  'VALIDITY_APPLICATION_PROGRAM_ID_PLACEHOLDER',
  'VALIDITY_APPLICATION_VERIFIER_PROFILE_ID_PLACEHOLDER',
] as const);
const DUP_PLACEHOLDERS = Object.freeze([
  'TRACKER_NFT_ID_PLACEHOLDER',
  'DUP_NFT_ID_PLACEHOLDER',
  'VALIDITY_APPLICATION_TRACKER_CONTRACT_ID_PLACEHOLDER',
  'VALIDITY_SIDECHAIN_ID_PLACEHOLDER',
  'VALIDITY_APPLICATION_SETTLEMENT_PROFILE_ID_PLACEHOLDER',
  'VALIDITY_TRUST_ANCHOR_DIGEST_PLACEHOLDER',
  'VALIDITY_APPLICATION_CAUSAL_VAULT_ERGOTREE_HASH_PLACEHOLDER',
] as const);
const SOURCE_LOCK_PLACEHOLDERS = Object.freeze([
  'CAUSAL_SOURCE_NETWORK_ID_HEX_PLACEHOLDER',
  'CAUSAL_SIDECHAIN_ID_HEX_PLACEHOLDER',
  'CAUSAL_BRIDGE_ADDRESS_HEX_PLACEHOLDER',
  'CAUSAL_TOKEN_ADDRESS_HEX_PLACEHOLDER',
  'CAUSAL_SETTLEMENT_PROFILE_ID_HEX_PLACEHOLDER',
  'CAUSAL_PROFILE_ID_HEX_PLACEHOLDER',
  'CAUSAL_SETTLEMENT_VAULT_CONTRACT_ID_HEX_PLACEHOLDER',
  'COMMITTEE_SIGMAPROP_PLACEHOLDERS',
  'COMMITTEE_THRESHOLD_PLACEHOLDER',
] as const);
const compiledCandidates = new WeakSet<object>();
const pinnedCompilers = new WeakSet<ValidityApplicationLineageCompilerV3>();

export type ValidityApplicationLineageContractRoleV3 =
  | 'tracker'
  | 'causalVault'
  | 'duplicatePrevention'
  | 'sourceLock';

export interface ValidityApplicationLineageTemplatesV3 {
  readonly tracker: string;
  readonly causalVault: string;
  readonly duplicatePrevention: string;
  readonly sourceLock: string;
}

export interface ValidityApplicationLineageRuntimeBindingV3 {
  readonly bridgeRuntimeCodeSha256Hex: string;
  readonly bridgeRuntimeCodeBytes: string | number | bigint;
  readonly tokenRuntimeCodeSha256Hex: string;
  readonly tokenRuntimeCodeBytes: string | number | bigint;
}

export interface ValidityApplicationLineageProofBindingV3 {
  readonly proofSystemIdHex: string;
  readonly proofProfileIdHex: string;
  readonly approvedTrustAnchorDigestHex: string;
  readonly programIdHex: string;
  readonly verifierProfileIdHex: string;
}

export interface ValidityApplicationLineageCompilerRequestV3 {
  readonly role: ValidityApplicationLineageContractRoleV3;
  readonly source: string;
  readonly resolvedSourceSha256Hex: string;
  readonly scriptVersion: 3;
  readonly treeVersion: 0 | 4;
}

export interface ValidityApplicationLineageCompilerReceiptV1 {
  readonly schema:
    typeof VALIDITY_APPLICATION_LINEAGE_COMPILER_RECEIPT_V1_SCHEMA;
  readonly version: 1;
  readonly role: ValidityApplicationLineageContractRoleV3;
  readonly sigmaStateCommit: string;
  readonly scalaVersion: string;
  readonly sbtVersion: string;
  readonly scriptVersion: 3;
  readonly treeVersion: 0 | 4;
  readonly resolvedSourceSha256Hex: string;
  readonly propositionBytes: number;
  readonly propositionSha256Hex: string;
  readonly propositionHex: string;
  readonly contractIdHex: string;
  readonly profileActivated: false;
  readonly nodeCheckPerformed: false;
  readonly signingAuthorityEstablished: false;
  readonly submissionAuthorityEstablished: false;
  readonly broadcastAuthorityEstablished: false;
  readonly fundsAuthorityEstablished: false;
  readonly gate5Closed: false;
}

export interface ValidityApplicationLineageCompilerBatchV1 {
  readonly schema:
    'e2s.validity-application-lineage-compiler-batch.v1';
  readonly version: 1;
  readonly sigmaStateCommit: string;
  readonly scalaVersion: string;
  readonly sbtVersion: string;
  readonly contracts:
    readonly Readonly<ValidityApplicationLineageCompilerReceiptV1>[];
  readonly profileActivated: false;
  readonly nodeCheckPerformed: false;
  readonly signingAuthorityEstablished: false;
  readonly submissionAuthorityEstablished: false;
  readonly broadcastAuthorityEstablished: false;
  readonly fundsAuthorityEstablished: false;
  readonly gate5Closed: false;
}

export type ValidityApplicationLineageCompilerV3 = (
  request: Readonly<ValidityApplicationLineageCompilerRequestV3>,
) => Promise<Readonly<ValidityApplicationLineageCompilerReceiptV1>>;

export interface CompileValidityApplicationLineageInstanceV3Input {
  readonly lineageCandidate:
    Readonly<PegInCausalLineageProfileV3Candidate>;
  readonly templates: ValidityApplicationLineageTemplatesV3;
  readonly runtimeBinding: ValidityApplicationLineageRuntimeBindingV3;
  readonly proofBinding: ValidityApplicationLineageProofBindingV3;
  readonly committee: {
    readonly publicKeys: readonly string[];
    readonly threshold: string | number;
  };
  readonly compiler: ValidityApplicationLineageCompilerV3;
}

export interface CompiledValidityApplicationLineageContractV3 {
  readonly templateSha256Hex: string;
  readonly resolvedSourceSha256Hex: string;
  readonly receipt: Readonly<ValidityApplicationLineageCompilerReceiptV1>;
}

export interface ValidityApplicationLineageInstanceV3Candidate {
  readonly schema: typeof VALIDITY_APPLICATION_LINEAGE_INSTANCE_V3_SCHEMA;
  readonly version: 3;
  readonly lineageProfileIdHex: string;
  readonly encodedLineageProfileHex: string;
  readonly genesis: {
    readonly trackerInputBoxIdHex: string;
    readonly trackerNftIdHex: string;
    readonly duplicatePreventionInputBoxIdHex: string;
    readonly duplicatePreventionNftIdHex: string;
  };
  readonly application: {
    readonly bindingHex: string;
    readonly bindingDigestHex: string;
    readonly programIdHex: string;
    readonly verifierProfileIdHex: string;
    readonly statementContractIdHex: string;
  };
  readonly finalityPolicy: {
    readonly policyIdHex: string;
    readonly proofSystemIdHex: string;
    readonly proofProfileIdHex: string;
    readonly approvedTrustAnchorDigestHex: string;
  };
  readonly sourceCommitmentPolicy: {
    readonly policyIdHex: string;
    readonly threshold: string;
    readonly publicKeys: readonly string[];
  };
  readonly contracts: {
    readonly tracker: CompiledValidityApplicationLineageContractV3;
    readonly causalVault: CompiledValidityApplicationLineageContractV3;
    readonly duplicatePrevention: CompiledValidityApplicationLineageContractV3;
    readonly sourceLock: CompiledValidityApplicationLineageContractV3;
  };
  readonly relations: {
    readonly trackerContractBoundIntoVault: true;
    readonly vaultContractBoundIntoDuplicatePrevention: true;
    readonly vaultContractBoundIntoSourceLock: true;
    readonly singletonIdsDerivedFromGenesisInputs: true;
  };
  readonly boundaries: {
    readonly setupTransactionsConstructed: false;
    readonly sourceLockConsumptionEstablished: false;
    readonly singletonLineagesEstablished: false;
    readonly profileActivated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly nodeCheckPerformed: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  };
}

/**
 * Loads the one reviewed compiler batch locked by this module version.
 *
 * Exact bytes are the authority: callers cannot substitute an arbitrary
 * callback or self-assert compiler metadata. Regenerating this receipt is a
 * separate guarded workflow and requires a new reviewed lock digest.
 */
export function createPinnedValidityApplicationLineageCompilerV3(
  batchJson: string,
): ValidityApplicationLineageCompilerV3 {
  if (
    typeof batchJson !== 'string'
    || batchJson.length === 0
    || batchJson.charCodeAt(0) === 0xfeff
    || batchJson.includes('\r')
    || !Buffer.from(batchJson, 'utf8').equals(Buffer.from(batchJson, 'ascii'))
  ) {
    throw new Error(
      'validity application lineage compiler batch must be non-empty BOM-free LF-only ASCII JSON',
    );
  }
  if (
    sha256Utf8(batchJson)
    !== VALIDITY_APPLICATION_LINEAGE_COMPILER_BATCH_V1_SHA256_HEX
  ) {
    throw new Error(
      'validity application lineage compiler batch does not match the reviewed SHA-256 lock',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(batchJson);
  } catch {
    throw new Error('validity application lineage compiler batch is not valid JSON');
  }
  assertExactKeys(parsed, [
    'schema',
    'version',
    'sigmaStateCommit',
    'scalaVersion',
    'sbtVersion',
    'contracts',
    'profileActivated',
    'nodeCheckPerformed',
    'signingAuthorityEstablished',
    'submissionAuthorityEstablished',
    'broadcastAuthorityEstablished',
    'fundsAuthorityEstablished',
    'gate5Closed',
  ], 'validity application lineage compiler batch');
  const batch = parsed as unknown as ValidityApplicationLineageCompilerBatchV1;
  if (
    batch.schema !== 'e2s.validity-application-lineage-compiler-batch.v1'
    || batch.version !== 1
    || batch.sigmaStateCommit
      !== VALIDITY_APPLICATION_LINEAGE_SIGMASTATE_COMMIT
    || batch.scalaVersion !== VALIDITY_APPLICATION_LINEAGE_SCALA_VERSION
    || batch.sbtVersion !== VALIDITY_APPLICATION_LINEAGE_SBT_VERSION
    || !Array.isArray(batch.contracts)
    || batch.contracts.length !== 4
  ) {
    throw new Error(
      'validity application lineage compiler batch identity is invalid',
    );
  }
  for (const boundary of [
    'profileActivated',
    'nodeCheckPerformed',
    'signingAuthorityEstablished',
    'submissionAuthorityEstablished',
    'broadcastAuthorityEstablished',
    'fundsAuthorityEstablished',
    'gate5Closed',
  ] as const) {
    if (batch[boundary] !== false) {
      throw new Error(
        `validity application lineage compiler batch must keep ${boundary} false`,
      );
    }
  }
  const expectedRoles: readonly ValidityApplicationLineageContractRoleV3[] = [
    'tracker',
    'causalVault',
    'duplicatePrevention',
    'sourceLock',
  ];
  const receipts = new Map<
    ValidityApplicationLineageContractRoleV3,
    Readonly<ValidityApplicationLineageCompilerReceiptV1>
  >();
  for (const [index, receipt] of batch.contracts.entries()) {
    const expectedRole = expectedRoles[index];
    if (expectedRole === undefined) {
      throw new Error('validity application lineage compiler batch role order is invalid');
    }
    validateCompilerReceiptShape(receipt, expectedRole);
    receipts.set(expectedRole, Object.freeze({ ...receipt }));
  }
  const compiler: ValidityApplicationLineageCompilerV3 = async request => {
    const receipt = receipts.get(request.role);
    if (!receipt) {
      throw new Error(`missing pinned ${request.role} compiler receipt`);
    }
    return receipt;
  };
  pinnedCompilers.add(compiler);
  return compiler;
}

export function deriveValidityApplicationLineageSourceCommitmentPolicyIdV1Hex(
  committeeInput: {
    readonly publicKeys: readonly string[];
    readonly threshold: string | number;
  },
): string {
  const committee = normalizeCommittee(committeeInput);
  const threshold = Number(committee.threshold);
  const encoded = Buffer.concat([
    Buffer.from([1]),
    uint16Be(threshold, 'committee threshold'),
    uint16Be(committee.pubKeyHexes.length, 'committee public-key count'),
    ...committee.pubKeyHexes.map(key => Buffer.from(key, 'hex')),
  ]);
  return prefixedBlake2b256(Buffer.concat([
    Buffer.from(
      VALIDITY_APPLICATION_LINEAGE_SOURCE_COMMITMENT_POLICY_V1_DOMAIN,
      'ascii',
    ),
    encoded,
  ]));
}

export function deriveValidityApplicationLineageFinalityPolicyIdV1Hex(
  proofBindingInput: ValidityApplicationLineageProofBindingV3,
): string {
  assertExactKeys(proofBindingInput, [
    'proofSystemIdHex',
    'proofProfileIdHex',
    'approvedTrustAnchorDigestHex',
    'programIdHex',
    'verifierProfileIdHex',
  ], 'validity application lineage proof binding');
  const encoded = Buffer.concat([
    Buffer.from([1]),
    fixedHexBytes(proofBindingInput.proofSystemIdHex, 32, 'proof-system ID'),
    fixedHexBytes(proofBindingInput.proofProfileIdHex, 32, 'proof-profile ID'),
    fixedHexBytes(
      proofBindingInput.approvedTrustAnchorDigestHex,
      32,
      'approved trust-anchor digest',
    ),
    fixedHexBytes(proofBindingInput.programIdHex, 32, 'program ID'),
    fixedHexBytes(
      proofBindingInput.verifierProfileIdHex,
      32,
      'verifier profile ID',
    ),
  ]);
  return prefixedBlake2b256(Buffer.concat([
    Buffer.from(
      VALIDITY_APPLICATION_LINEAGE_FINALITY_POLICY_V1_DOMAIN,
      'ascii',
    ),
    encoded,
  ]));
}

export async function compileValidityApplicationLineageInstanceV3(
  input: CompileValidityApplicationLineageInstanceV3Input,
): Promise<Readonly<ValidityApplicationLineageInstanceV3Candidate>> {
  assertExactKeys(input, [
    'lineageCandidate',
    'templates',
    'runtimeBinding',
    'proofBinding',
    'committee',
    'compiler',
  ], 'validity application lineage compiler input');
  const {
    lineageCandidate,
    templates: templateInput,
    runtimeBinding,
    proofBinding: proofBindingInput,
    committee: committeeInput,
    compiler,
  } = input;
  assertDerivedPegInCausalLineageProfileV3Candidate(lineageCandidate);
  assertExactKeys(templateInput, [
    'tracker',
    'causalVault',
    'duplicatePrevention',
    'sourceLock',
  ], 'validity application lineage templates');
  assertExactKeys(runtimeBinding, [
    'bridgeRuntimeCodeSha256Hex',
    'bridgeRuntimeCodeBytes',
    'tokenRuntimeCodeSha256Hex',
    'tokenRuntimeCodeBytes',
  ], 'validity application lineage runtime binding');
  assertExactKeys(committeeInput, [
    'publicKeys',
    'threshold',
  ], 'validity application lineage committee');
  if (typeof compiler !== 'function') {
    throw new Error('validity application lineage compiler must be a function');
  }
  if (!pinnedCompilers.has(compiler)) {
    throw new Error(
      'validity application lineage compiler must come from the reviewed pinned compiler batch',
    );
  }

  const candidate = lineageCandidate;
  const profile = candidate.profile;
  const templates = normalizeTemplates(templateInput, profile);
  const proofBinding = normalizeProofBinding(proofBindingInput, profile);
  const committee = normalizeCommittee(committeeInput);
  const sourceCommitmentPolicyIdHex =
    deriveValidityApplicationLineageSourceCommitmentPolicyIdV1Hex({
      publicKeys: committee.pubKeyHexes,
      threshold: committee.threshold,
    });
  if (sourceCommitmentPolicyIdHex !== profile.sourceCommitmentPolicyIdHex) {
    throw new Error(
      'source-commitment policy ID does not match the exact committee threshold and key order',
    );
  }

  const applicationBinding = normalizeRuntimeBinding(
    runtimeBinding,
    profile,
    candidate.profileIdHex,
  );
  const trackerSource = resolveTemplate(
    templates.tracker.source,
    [
      [TRACKER_PLACEHOLDERS[0], proofBinding.programIdHex.slice(2)],
      [TRACKER_PLACEHOLDERS[1], proofBinding.verifierProfileIdHex.slice(2)],
      [TRACKER_PLACEHOLDERS[2], applicationBinding.bindingHex],
    ],
    TRACKER_PLACEHOLDERS,
    'validity application lineage tracker',
  );
  const trackerReceipt = await compileAndValidate(
    compiler,
    'tracker',
    trackerSource,
    4,
  );

  const commonSettlementReplacements: ReadonlyArray<readonly [string, string]> = [
    ['TRACKER_NFT_ID_PLACEHOLDER', candidate.genesis.tracker.singletonNftIdHex.slice(2)],
    [
      'DUP_NFT_ID_PLACEHOLDER',
      candidate.genesis.duplicatePrevention.singletonNftIdHex.slice(2),
    ],
    [
      'VALIDITY_APPLICATION_TRACKER_CONTRACT_ID_PLACEHOLDER',
      trackerReceipt.contractIdHex,
    ],
    ['VALIDITY_SIDECHAIN_ID_PLACEHOLDER', profile.sidechainIdHex.slice(2)],
    [
      'VALIDITY_APPLICATION_SETTLEMENT_PROFILE_ID_PLACEHOLDER',
      profile.settlementProfileIdHex.slice(2),
    ],
    [
      'VALIDITY_TRUST_ANCHOR_DIGEST_PLACEHOLDER',
      proofBinding.approvedTrustAnchorDigestHex.slice(2),
    ],
  ];
  const vaultSource = resolveTemplate(
    templates.causalVault.source,
    [
      ...commonSettlementReplacements,
      ['VALIDITY_SOURCE_NETWORK_ID_PLACEHOLDER', profile.sourceNetworkIdHex.slice(2)],
      [
        'VALIDITY_APPLICATION_CAUSAL_PROFILE_ID_PLACEHOLDER',
        candidate.profileIdHex.slice(2),
      ],
      [
        'VALIDITY_APPLICATION_BRIDGE_ADDRESS_PLACEHOLDER',
        profile.bridgeAddressHex.slice(2),
      ],
      [
        'VALIDITY_APPLICATION_TOKEN_ADDRESS_PLACEHOLDER',
        profile.tokenAddressHex.slice(2),
      ],
      [
        'VALIDITY_APPLICATION_BINDING_DIGEST_PLACEHOLDER',
        applicationBinding.bindingDigestHex,
      ],
      [
        'VALIDITY_APPLICATION_PROGRAM_ID_PLACEHOLDER',
        proofBinding.programIdHex.slice(2),
      ],
      [
        'VALIDITY_APPLICATION_VERIFIER_PROFILE_ID_PLACEHOLDER',
        proofBinding.verifierProfileIdHex.slice(2),
      ],
    ],
    VAULT_PLACEHOLDERS,
    'validity application lineage causal vault',
  );
  const vaultReceipt = await compileAndValidate(
    compiler,
    'causalVault',
    vaultSource,
    0,
  );

  const duplicatePreventionSource = resolveTemplate(
    templates.duplicatePrevention.source,
    [
      ...commonSettlementReplacements,
      [
        'VALIDITY_APPLICATION_CAUSAL_VAULT_ERGOTREE_HASH_PLACEHOLDER',
        vaultReceipt.contractIdHex,
      ],
    ],
    DUP_PLACEHOLDERS,
    'validity application lineage duplicate prevention',
  );
  const duplicatePreventionReceipt = await compileAndValidate(
    compiler,
    'duplicatePrevention',
    duplicatePreventionSource,
    0,
  );

  const sourceLockBeforeCommittee = resolveTemplate(
    templates.sourceLock.source,
    [
      [
        'CAUSAL_SOURCE_NETWORK_ID_HEX_PLACEHOLDER',
        profile.sourceNetworkIdHex.slice(2),
      ],
      [
        'CAUSAL_SIDECHAIN_ID_HEX_PLACEHOLDER',
        profile.sidechainIdHex.slice(2),
      ],
      [
        'CAUSAL_BRIDGE_ADDRESS_HEX_PLACEHOLDER',
        profile.bridgeAddressHex.slice(2),
      ],
      [
        'CAUSAL_TOKEN_ADDRESS_HEX_PLACEHOLDER',
        profile.tokenAddressHex.slice(2),
      ],
      [
        'CAUSAL_SETTLEMENT_PROFILE_ID_HEX_PLACEHOLDER',
        profile.settlementProfileIdHex.slice(2),
      ],
      [
        'CAUSAL_PROFILE_ID_HEX_PLACEHOLDER',
        candidate.profileIdHex.slice(2),
      ],
      [
        'CAUSAL_SETTLEMENT_VAULT_CONTRACT_ID_HEX_PLACEHOLDER',
        vaultReceipt.contractIdHex,
      ],
    ],
    SOURCE_LOCK_PLACEHOLDERS.slice(0, 7),
    'validity application lineage source lock',
    false,
  );
  const sourceLockSource = injectCommitteePlaceholders(
    sourceLockBeforeCommittee,
    committee,
  );
  assertNoPlaceholders(
    sourceLockSource,
    SOURCE_LOCK_PLACEHOLDERS,
    'validity application lineage source lock',
  );
  const sourceLockReceipt = await compileAndValidate(
    compiler,
    'sourceLock',
    sourceLockSource,
    0,
  );

  const result = Object.freeze({
    schema: VALIDITY_APPLICATION_LINEAGE_INSTANCE_V3_SCHEMA,
    version: 3 as const,
    lineageProfileIdHex: candidate.profileIdHex,
    encodedLineageProfileHex: candidate.encodedProfileHex,
    genesis: Object.freeze({
      trackerInputBoxIdHex: profile.trackerGenesisInputBoxIdHex,
      trackerNftIdHex: candidate.genesis.tracker.singletonNftIdHex,
      duplicatePreventionInputBoxIdHex:
        profile.duplicatePreventionGenesisInputBoxIdHex,
      duplicatePreventionNftIdHex:
        candidate.genesis.duplicatePrevention.singletonNftIdHex,
    }),
    application: Object.freeze({
      bindingHex: applicationBinding.bindingHex,
      bindingDigestHex: applicationBinding.bindingDigestHex,
      programIdHex: proofBinding.programIdHex,
      verifierProfileIdHex: proofBinding.verifierProfileIdHex,
      statementContractIdHex: trackerReceipt.contractIdHex,
    }),
    finalityPolicy: Object.freeze({
      policyIdHex: profile.finalityPolicyIdHex,
      proofSystemIdHex: proofBinding.proofSystemIdHex,
      proofProfileIdHex: proofBinding.proofProfileIdHex,
      approvedTrustAnchorDigestHex:
        proofBinding.approvedTrustAnchorDigestHex,
    }),
    sourceCommitmentPolicy: Object.freeze({
      policyIdHex: sourceCommitmentPolicyIdHex,
      threshold: committee.threshold,
      publicKeys: Object.freeze([...committee.pubKeyHexes]),
    }),
    contracts: Object.freeze({
      tracker: contractResult(templates.tracker.sha256Hex, trackerReceipt),
      causalVault: contractResult(
        templates.causalVault.sha256Hex,
        vaultReceipt,
      ),
      duplicatePrevention: contractResult(
        templates.duplicatePrevention.sha256Hex,
        duplicatePreventionReceipt,
      ),
      sourceLock: contractResult(
        templates.sourceLock.sha256Hex,
        sourceLockReceipt,
      ),
    }),
    relations: Object.freeze({
      trackerContractBoundIntoVault: true as const,
      vaultContractBoundIntoDuplicatePrevention: true as const,
      vaultContractBoundIntoSourceLock: true as const,
      singletonIdsDerivedFromGenesisInputs: true as const,
    }),
    boundaries: Object.freeze({
      setupTransactionsConstructed: false as const,
      sourceLockConsumptionEstablished: false as const,
      singletonLineagesEstablished: false as const,
      profileActivated: false as const,
      targetNodeAcceptanceEstablished: false as const,
      nodeCheckPerformed: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    }),
  });
  compiledCandidates.add(result);
  return result;
}

export function assertCompiledValidityApplicationLineageInstanceV3Candidate(
  value: unknown,
): asserts value is Readonly<ValidityApplicationLineageInstanceV3Candidate> {
  if (
    value === null
    || typeof value !== 'object'
    || !compiledCandidates.has(value)
  ) {
    throw new Error(
      'validity application lineage instance V3 candidate must be compiled from a same-process derived lineage profile',
    );
  }
}

function normalizeTemplates(
  templates: ValidityApplicationLineageTemplatesV3,
  profile: Readonly<PegInCausalLineageProfileV3Candidate['profile']>,
): {
  tracker: { source: string; sha256Hex: string };
  causalVault: { source: string; sha256Hex: string };
  duplicatePrevention: { source: string; sha256Hex: string };
  sourceLock: { source: string; sha256Hex: string };
} {
  return {
    tracker: exactTemplate(
      templates.tracker,
      profile.validityTrackerTemplateSha256Hex,
      TRACKER_PLACEHOLDERS,
      'validity application lineage tracker template',
    ),
    causalVault: exactTemplate(
      templates.causalVault,
      profile.causalVaultTemplateSha256Hex,
      VAULT_PLACEHOLDERS,
      'validity application lineage causal-vault template',
    ),
    duplicatePrevention: exactTemplate(
      templates.duplicatePrevention,
      profile.duplicatePreventionTemplateSha256Hex,
      DUP_PLACEHOLDERS,
      'validity application lineage duplicate-prevention template',
    ),
    sourceLock: exactTemplate(
      templates.sourceLock,
      profile.sourceLockTemplateSha256Hex,
      SOURCE_LOCK_PLACEHOLDERS,
      'validity application lineage source-lock template',
    ),
  };
}

function normalizeProofBinding(
  proofBinding: ValidityApplicationLineageProofBindingV3,
  profile: Readonly<PegInCausalLineageProfileV3Candidate['profile']>,
): {
  proofSystemIdHex: string;
  proofProfileIdHex: string;
  approvedTrustAnchorDigestHex: string;
  programIdHex: string;
  verifierProfileIdHex: string;
} {
  assertExactKeys(proofBinding, [
    'proofSystemIdHex',
    'proofProfileIdHex',
    'approvedTrustAnchorDigestHex',
    'programIdHex',
    'verifierProfileIdHex',
  ], 'validity application lineage proof binding');
  const normalized = {
    proofSystemIdHex: prefixedFixedHex(
      proofBinding.proofSystemIdHex,
      32,
      'proof-system ID',
    ),
    proofProfileIdHex: prefixedFixedHex(
      proofBinding.proofProfileIdHex,
      32,
      'proof-profile ID',
    ),
    approvedTrustAnchorDigestHex: prefixedFixedHex(
      proofBinding.approvedTrustAnchorDigestHex,
      32,
      'approved trust-anchor digest',
    ),
    programIdHex: prefixedFixedHex(
      proofBinding.programIdHex,
      32,
      'program ID',
    ),
    verifierProfileIdHex: prefixedFixedHex(
      proofBinding.verifierProfileIdHex,
      32,
      'verifier profile ID',
    ),
  };
  if (normalized.proofSystemIdHex !== profile.proofSystemIdHex) {
    throw new Error('proof-system ID does not match the lineage profile');
  }
  if (normalized.proofProfileIdHex !== profile.proofProfileIdHex) {
    throw new Error('proof-profile ID does not match the lineage profile');
  }
  const finalityPolicyIdHex =
    deriveValidityApplicationLineageFinalityPolicyIdV1Hex(normalized);
  if (finalityPolicyIdHex !== profile.finalityPolicyIdHex) {
    throw new Error(
      'finality-policy ID does not bind the exact proof, trust-anchor, program, and verifier identities',
    );
  }
  return normalized;
}

function normalizeRuntimeBinding(
  runtimeBinding: ValidityApplicationLineageRuntimeBindingV3,
  profile: Readonly<PegInCausalLineageProfileV3Candidate['profile']>,
  causalProfileIdHex: string,
): { bindingHex: string; bindingDigestHex: string } {
  const binding = encodeBridgeCausalApplicationBindingV2({
    sourceNetworkIdHex: profile.sourceNetworkIdHex.slice(2),
    sidechainIdHex: profile.sidechainIdHex.slice(2),
    bridgeAddressHex: profile.bridgeAddressHex.slice(2),
    tokenAddressHex: profile.tokenAddressHex.slice(2),
    settlementProfileIdHex: profile.settlementProfileIdHex.slice(2),
    causalProfileIdHex: causalProfileIdHex.slice(2),
    bridgeRuntimeCodeSha256Hex: fixedHex(
      runtimeBinding.bridgeRuntimeCodeSha256Hex,
      32,
      'bridge runtime code SHA-256',
    ),
    bridgeRuntimeCodeBytes: canonicalUint32(
      runtimeBinding.bridgeRuntimeCodeBytes,
      'bridge runtime code bytes',
    ),
    tokenRuntimeCodeSha256Hex: fixedHex(
      runtimeBinding.tokenRuntimeCodeSha256Hex,
      32,
      'token runtime code SHA-256',
    ),
    tokenRuntimeCodeBytes: canonicalUint32(
      runtimeBinding.tokenRuntimeCodeBytes,
      'token runtime code bytes',
    ),
  });
  return {
    bindingHex: binding.toString('hex'),
    bindingDigestHex:
      deriveBridgeCausalApplicationBindingV2DigestHex(binding),
  };
}

async function compileAndValidate(
  compiler: ValidityApplicationLineageCompilerV3,
  role: ValidityApplicationLineageContractRoleV3,
  source: string,
  treeVersion: 0 | 4,
): Promise<Readonly<ValidityApplicationLineageCompilerReceiptV1>> {
  const resolvedSourceSha256Hex = sha256Utf8(source);
  const request = Object.freeze({
    role,
    source,
    resolvedSourceSha256Hex,
    scriptVersion: 3 as const,
    treeVersion,
  });
  const receipt = await compiler(request);
  assertExactKeys(receipt, [
    'schema',
    'version',
    'role',
    'sigmaStateCommit',
    'scalaVersion',
    'sbtVersion',
    'scriptVersion',
    'treeVersion',
    'resolvedSourceSha256Hex',
    'propositionBytes',
    'propositionSha256Hex',
    'propositionHex',
    'contractIdHex',
    'profileActivated',
    'nodeCheckPerformed',
    'signingAuthorityEstablished',
    'submissionAuthorityEstablished',
    'broadcastAuthorityEstablished',
    'fundsAuthorityEstablished',
    'gate5Closed',
  ], `${role} compiler receipt`);
  if (
    receipt.schema !== VALIDITY_APPLICATION_LINEAGE_COMPILER_RECEIPT_V1_SCHEMA
    || receipt.version !== 1
    || receipt.role !== role
    || receipt.sigmaStateCommit !== VALIDITY_APPLICATION_LINEAGE_SIGMASTATE_COMMIT
    || receipt.scalaVersion !== VALIDITY_APPLICATION_LINEAGE_SCALA_VERSION
    || receipt.sbtVersion !== VALIDITY_APPLICATION_LINEAGE_SBT_VERSION
    || receipt.scriptVersion !== 3
    || receipt.treeVersion !== treeVersion
    || receipt.resolvedSourceSha256Hex !== resolvedSourceSha256Hex
  ) {
    throw new Error(`${role} compiler receipt identity does not match the request`);
  }
  for (const boundary of [
    'profileActivated',
    'nodeCheckPerformed',
    'signingAuthorityEstablished',
    'submissionAuthorityEstablished',
    'broadcastAuthorityEstablished',
    'fundsAuthorityEstablished',
    'gate5Closed',
  ] as const) {
    if (receipt[boundary] !== false) {
      throw new Error(`${role} compiler receipt must keep ${boundary} false`);
    }
  }
  const propositionHex = variableHex(
    receipt.propositionHex,
    `${role} proposition`,
  );
  if (
    !Number.isSafeInteger(receipt.propositionBytes)
    || receipt.propositionBytes <= 0
    || receipt.propositionBytes !== propositionHex.length / 2
  ) {
    throw new Error(`${role} proposition byte count is invalid`);
  }
  const proposition = Buffer.from(propositionHex, 'hex');
  if (
    fixedHex(receipt.propositionSha256Hex, 32, `${role} proposition SHA-256`)
    !== sha256Bytes(proposition)
  ) {
    throw new Error(`${role} proposition SHA-256 does not match its bytes`);
  }
  if (
    fixedHex(receipt.contractIdHex, 32, `${role} contract ID`)
    !== blake2b256Hex(proposition)
  ) {
    throw new Error(`${role} contract ID does not match its proposition bytes`);
  }
  return Object.freeze({
    ...receipt,
    propositionHex,
    propositionSha256Hex: receipt.propositionSha256Hex.toLowerCase(),
    contractIdHex: receipt.contractIdHex.toLowerCase(),
  });
}

function validateCompilerReceiptShape(
  receipt: unknown,
  expectedRole: ValidityApplicationLineageContractRoleV3,
): asserts receipt is Readonly<ValidityApplicationLineageCompilerReceiptV1> {
  assertExactKeys(receipt, [
    'schema',
    'version',
    'role',
    'sigmaStateCommit',
    'scalaVersion',
    'sbtVersion',
    'scriptVersion',
    'treeVersion',
    'resolvedSourceSha256Hex',
    'propositionBytes',
    'propositionSha256Hex',
    'propositionHex',
    'contractIdHex',
    'profileActivated',
    'nodeCheckPerformed',
    'signingAuthorityEstablished',
    'submissionAuthorityEstablished',
    'broadcastAuthorityEstablished',
    'fundsAuthorityEstablished',
    'gate5Closed',
  ], `${expectedRole} pinned compiler receipt`);
  const typed = receipt as unknown as ValidityApplicationLineageCompilerReceiptV1;
  if (
    typed.schema !== VALIDITY_APPLICATION_LINEAGE_COMPILER_RECEIPT_V1_SCHEMA
    || typed.version !== 1
    || typed.role !== expectedRole
    || typed.sigmaStateCommit
      !== VALIDITY_APPLICATION_LINEAGE_SIGMASTATE_COMMIT
    || typed.scalaVersion !== VALIDITY_APPLICATION_LINEAGE_SCALA_VERSION
    || typed.sbtVersion !== VALIDITY_APPLICATION_LINEAGE_SBT_VERSION
    || typed.scriptVersion !== 3
    || typed.treeVersion !== (expectedRole === 'tracker' ? 4 : 0)
  ) {
    throw new Error(`${expectedRole} pinned compiler receipt identity is invalid`);
  }
  for (const boundary of [
    'profileActivated',
    'nodeCheckPerformed',
    'signingAuthorityEstablished',
    'submissionAuthorityEstablished',
    'broadcastAuthorityEstablished',
    'fundsAuthorityEstablished',
    'gate5Closed',
  ] as const) {
    if (typed[boundary] !== false) {
      throw new Error(
        `${expectedRole} pinned compiler receipt must keep ${boundary} false`,
      );
    }
  }
  const propositionHex = variableHex(
    typed.propositionHex,
    `${expectedRole} pinned proposition`,
  );
  if (
    !Number.isSafeInteger(typed.propositionBytes)
    || typed.propositionBytes <= 0
    || typed.propositionBytes !== propositionHex.length / 2
  ) {
    throw new Error(
      `${expectedRole} pinned proposition byte count is invalid`,
    );
  }
  const proposition = Buffer.from(propositionHex, 'hex');
  if (
    fixedHex(
      typed.propositionSha256Hex,
      32,
      `${expectedRole} pinned proposition SHA-256`,
    ) !== sha256Bytes(proposition)
    || fixedHex(
      typed.contractIdHex,
      32,
      `${expectedRole} pinned contract ID`,
    ) !== blake2b256Hex(proposition)
  ) {
    throw new Error(
      `${expectedRole} pinned proposition identity is invalid`,
    );
  }
  fixedHex(
    typed.resolvedSourceSha256Hex,
    32,
    `${expectedRole} pinned resolved-source SHA-256`,
  );
}

function contractResult(
  templateSha256Hex: string,
  receipt: Readonly<ValidityApplicationLineageCompilerReceiptV1>,
): Readonly<CompiledValidityApplicationLineageContractV3> {
  return Object.freeze({
    templateSha256Hex,
    resolvedSourceSha256Hex: receipt.resolvedSourceSha256Hex,
    receipt,
  });
}

function exactTemplate(
  source: unknown,
  expectedSha256Hex: string,
  expectedPlaceholders: readonly string[],
  label: string,
): { source: string; sha256Hex: string } {
  if (
    typeof source !== 'string'
    || source.length === 0
    || source.charCodeAt(0) === 0xfeff
    || source.includes('\r')
  ) {
    throw new Error(`${label} must be non-empty BOM-free LF-only UTF-8 text`);
  }
  if (!Buffer.from(source, 'utf8').equals(Buffer.from(source, 'ascii'))) {
    throw new Error(`${label} must contain ASCII bytes only`);
  }
  const sha256Hex = fixedHex(expectedSha256Hex, 32, `${label} SHA-256`);
  if (sha256Utf8(source) !== sha256Hex) {
    throw new Error(`${label} does not match the lineage profile SHA-256`);
  }
  assertExactPlaceholderSet(source, expectedPlaceholders, label);
  return { source, sha256Hex };
}

function resolveTemplate(
  source: string,
  replacements: ReadonlyArray<readonly [string, string]>,
  expectedPlaceholders: readonly string[],
  label: string,
  requireFullyResolved = true,
): string {
  let resolved = source;
  const replacementKeys = replacements.map(([key]) => key);
  if (new Set(replacementKeys).size !== replacementKeys.length) {
    throw new Error(`${label} replacements must not repeat a placeholder`);
  }
  for (const [placeholder, value] of replacements) {
    const matches = resolved.split(placeholder).length - 1;
    if (matches !== 1) {
      throw new Error(`${label} must contain ${placeholder} exactly once`);
    }
    resolved = resolved.replace(placeholder, value);
  }
  if (requireFullyResolved) {
    assertNoPlaceholders(resolved, expectedPlaceholders, label);
  }
  return resolved;
}

function assertExactPlaceholderSet(
  source: string,
  expected: readonly string[],
  label: string,
): void {
  const observed = source.match(PLACEHOLDER_PATTERN) ?? [];
  const sortedObserved = [...observed].sort();
  const sortedExpected = [...expected].sort();
  if (
    sortedObserved.length !== sortedExpected.length
    || sortedObserved.some((value, index) => value !== sortedExpected[index])
  ) {
    throw new Error(`${label} placeholder set does not match the expected role`);
  }
  for (const placeholder of expected) {
    if (observed.filter(value => value === placeholder).length !== 1) {
      throw new Error(`${label} must contain ${placeholder} exactly once`);
    }
  }
}

function assertNoPlaceholders(
  source: string,
  expected: readonly string[],
  label: string,
): void {
  const unresolved = source.match(PLACEHOLDER_PATTERN) ?? [];
  if (unresolved.length !== 0) {
    const expectedUnresolved = unresolved.filter(value =>
      expected.includes(value)
    );
    throw new Error(
      `${label} retains unresolved placeholder ${
        (expectedUnresolved[0] ?? unresolved[0])
      }`,
    );
  }
}

function normalizeCommittee(input: {
  readonly publicKeys: readonly string[];
  readonly threshold: string | number;
}): CommitteeConfig {
  if (!Array.isArray(input.publicKeys)) {
    throw new Error('committee publicKeys must be an array');
  }
  const threshold =
    typeof input.threshold === 'number'
      ? String(input.threshold)
      : input.threshold;
  if (typeof threshold !== 'string') {
    throw new Error('committee threshold must be a string or number');
  }
  return createCommitteeConfig(input.publicKeys, threshold);
}

function canonicalUint32(
  value: string | number | bigint,
  label: string,
): number {
  const text = typeof value === 'string' ? value : value.toString();
  if (!/^(0|[1-9][0-9]*)$/.test(text)) {
    throw new Error(`${label} must be a canonical decimal uint32`);
  }
  const parsed = BigInt(text);
  if (parsed > 0xffff_ffffn) {
    throw new Error(`${label} must fit uint32`);
  }
  return Number(parsed);
}

function uint16Be(value: number, label: string): Buffer {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 0xffff) {
    throw new Error(`${label} must fit a positive uint16`);
  }
  const result = Buffer.alloc(2);
  result.writeUInt16BE(value);
  return result;
}

function fixedHexBytes(
  value: unknown,
  bytes: number,
  label: string,
): Buffer {
  return Buffer.from(fixedHex(value, bytes, label), 'hex');
}

function prefixedFixedHex(
  value: unknown,
  bytes: number,
  label: string,
): string {
  return `0x${fixedHex(value, bytes, label)}`;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  const clean =
    typeof value === 'string' && value.startsWith('0x')
      ? value.slice(2)
      : value;
  if (
    typeof clean !== 'string'
    || !/^[0-9a-f]+$/.test(clean)
    || clean.length !== bytes * 2
  ) {
    throw new Error(`${label} must be exactly ${bytes} lowercase hex bytes`);
  }
  if (/^0+$/.test(clean)) {
    throw new Error(`${label} must not be zero`);
  }
  return clean;
}

function variableHex(value: unknown, label: string): string {
  const clean =
    typeof value === 'string' && value.startsWith('0x')
      ? value.slice(2)
      : value;
  if (
    typeof clean !== 'string'
    || clean.length === 0
    || clean.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(clean)
  ) {
    throw new Error(`${label} must be non-empty lowercase even-length hex`);
  }
  return clean;
}

function sha256Utf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sha256Bytes(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function blake2b256Hex(value: Buffer): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function prefixedBlake2b256(value: Buffer): string {
  return `0x${blake2b256Hex(value)}`;
}

function assertExactKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length
    || actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${label} must contain exactly ${expected.join(', ')}`);
  }
}
