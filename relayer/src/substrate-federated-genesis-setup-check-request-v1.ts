/**
 * Non-executable descriptor for the three federated genesis setup checks.
 * It contains no signer, checker, node transport, submission, or broadcast capability.
 */

import {
  canonicalJson,
  sha256CanonicalJson,
} from './strict-json.js';
import { snapshotStrictData } from './strict-data-snapshot.js';
import {
  assertSubstrateFederatedGenesisProvisioningV1Provenance,
  type SubstrateFederatedGenesisProvisioningV1Plan,
} from './substrate-federated-genesis-provisioning-v1.js';

export const SUBSTRATE_FEDERATED_GENESIS_SETUP_CHECK_REQUEST_V1_SCHEMA =
  'e2s.substrate-federated-genesis-setup-check-request.v1' as const;

const REQUEST_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_GENESIS_SETUP_CHECK_REQUEST_V1';
const TRANSACTION_BODY_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_GENESIS_SETUP_CHECK_TRANSACTION_BODY_V1';
const MATERIALIZED_TRANSACTION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_GENESIS_SETUP_CHECK_MATERIALIZED_TRANSACTION_V1';
const requests = new WeakSet<object>();

type SetupRole = 'tracker' | 'duplicatePrevention' | 'pooledReserve';

export interface SubstrateFederatedGenesisSetupCheckIssuanceV1 {
  readonly ordinal: 0 | 1 | 2;
  readonly role: SetupRole;
  readonly genesisInputBoxIdHex: string;
  readonly singletonTokenIdHex: string;
  readonly unsignedTransactionIdHex: string;
  readonly unsignedTransactionBodyDigestHex: string;
  readonly materializedTransactionDigestHex: string;
  readonly predictedStateOutputBoxIdHex: string;
  readonly stateOutputIndex: 0;
  readonly creationHeight: number;
}

export interface SubstrateFederatedGenesisSetupCheckRequestV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_GENESIS_SETUP_CHECK_REQUEST_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'non_executable_unsigned_setup_check_request';
  readonly requestDigestHex: string;
  readonly sourceBindings: Readonly<{
    readonly provisioningPlanDigestHex: string;
    readonly targetGenerationCandidateIdHex: string;
    readonly targetProfileDigestHex: string;
    readonly genesisObservationReportDigestHex: string;
    readonly trackerCompilerRequestDigestHex: string;
    readonly trackerCompilerReceiptDigestHex: string;
    readonly familyCompilerRequestDigestHex: string;
    readonly familyCompilerReceiptDigestHex: string;
    readonly cutoverGenerationManifestDigestHex: string;
    readonly semanticBaselineGenerationIdHex: string;
  }>;
  readonly target: Readonly<{
    readonly environment: string;
    readonly network: 'testnet';
    readonly genesisHeaderIdHex: string;
    readonly observedTipHeight: number;
    readonly observedTipHeaderIdHex: string;
    readonly issuanceCreationHeight: number;
  }>;
  readonly profile: Readonly<{
    readonly federationProfileIdHex: string;
    readonly familyIdHex: string;
    readonly sourceNetworkIdHex: string;
    readonly sidechainIdHex: string;
    readonly runtimeProfileIdHex: string;
    readonly settlementProfileIdHex: string;
  }>;
  readonly orderedIssuances:
    readonly Readonly<SubstrateFederatedGenesisSetupCheckIssuanceV1>[];
  readonly stages: Readonly<{
    readonly requestFreeze: 'complete';
    readonly signedBytes: 'absent';
    readonly jvmCheck: 'not-performed';
    readonly nodeCheck: 'not-performed';
    readonly submission: 'not-authorized';
    readonly broadcast: 'not-authorized';
    readonly confirmation: 'not-established';
  }>;
  readonly boundaries: Readonly<{
    readonly containsSignedTransactionBytes: false;
    readonly containsSignerCapability: false;
    readonly containsCheckerCapability: false;
    readonly containsNetworkTransportCapability: false;
    readonly containsSubmissionCapability: false;
    readonly containsBroadcastCapability: false;
    readonly targetProfileApprovalAuthenticated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly setupSubmissionAuthorized: false;
    readonly canonicalLineagesEstablished: false;
    readonly profileActivated: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

export function buildSubstrateFederatedGenesisSetupCheckRequestV1(
  plan: Readonly<SubstrateFederatedGenesisProvisioningV1Plan>,
): Readonly<SubstrateFederatedGenesisSetupCheckRequestV1> {
  const request = deriveRequest(plan);
  requests.add(request);
  return request;
}

export function validateSubstrateFederatedGenesisSetupCheckRequestV1(
  value: unknown,
  plan: Readonly<SubstrateFederatedGenesisProvisioningV1Plan>,
): Readonly<SubstrateFederatedGenesisSetupCheckRequestV1> {
  const candidate = snapshotStrictData(value, 'federated setup-check request');
  const expected = deriveRequest(plan);
  if (canonicalJson(candidate) !== canonicalJson(expected)) {
    throw new Error(
      'federated setup-check request does not match the provisioning plan',
    );
  }
  return expected;
}

export function assertSubstrateFederatedGenesisSetupCheckRequestV1Provenance(
  value: unknown,
  plan: Readonly<SubstrateFederatedGenesisProvisioningV1Plan>,
): asserts value is Readonly<SubstrateFederatedGenesisSetupCheckRequestV1> {
  assertSubstrateFederatedGenesisSetupCheckRequestV1ProcessProvenance(value);
  validateSubstrateFederatedGenesisSetupCheckRequestV1(value, plan);
}

export function assertSubstrateFederatedGenesisSetupCheckRequestV1ProcessProvenance(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedGenesisSetupCheckRequestV1> {
  if (value === null || typeof value !== 'object' || !requests.has(value)) {
    throw new Error(
      'federated setup-check request was not built in this process',
    );
  }
  const request = value as Readonly<SubstrateFederatedGenesisSetupCheckRequestV1>;
  const { requestDigestHex, ...binding } = request;
  if (
    !Object.isFrozen(request)
    || requestDigestHex !== sha256CanonicalJson(binding, REQUEST_DIGEST_DOMAIN)
  ) {
    throw new Error('federated setup-check request process identity drifted');
  }
}

function deriveRequest(
  plan: Readonly<SubstrateFederatedGenesisProvisioningV1Plan>,
): Readonly<SubstrateFederatedGenesisSetupCheckRequestV1> {
  assertSubstrateFederatedGenesisProvisioningV1Provenance(plan);
  assertNonAuthorizingPlan(plan);
  const orderedIssuances = deepFreeze([
    issuanceBinding(plan, 0, 'tracker', 'trackerIssuance'),
    issuanceBinding(
      plan,
      1,
      'duplicatePrevention',
      'duplicatePreventionIssuance',
    ),
    issuanceBinding(plan, 2, 'pooledReserve', 'pooledReserveIssuance'),
  ] as const);
  const binding = deepFreeze({
    schema: SUBSTRATE_FEDERATED_GENESIS_SETUP_CHECK_REQUEST_V1_SCHEMA,
    version: 1 as const,
    status: 'non_executable_unsigned_setup_check_request' as const,
    sourceBindings: {
      provisioningPlanDigestHex: plan.planDigestHex,
      targetGenerationCandidateIdHex: plan.targetGenerationCandidateIdHex,
      ...plan.sourceBindings,
    },
    target: { ...plan.target },
    profile: {
      federationProfileIdHex: plan.profile.federationProfileIdHex,
      familyIdHex: plan.profile.familyIdHex,
      sourceNetworkIdHex: plan.profile.sourceNetworkIdHex,
      sidechainIdHex: plan.profile.sidechainIdHex,
      runtimeProfileIdHex: plan.profile.runtimeProfileIdHex,
      settlementProfileIdHex: plan.profile.settlementProfileIdHex,
    },
    orderedIssuances,
    stages: {
      requestFreeze: 'complete' as const,
      signedBytes: 'absent' as const,
      jvmCheck: 'not-performed' as const,
      nodeCheck: 'not-performed' as const,
      submission: 'not-authorized' as const,
      broadcast: 'not-authorized' as const,
      confirmation: 'not-established' as const,
    },
    boundaries: falseBoundaries(),
  });
  return deepFreeze({
    ...binding,
    requestDigestHex: sha256CanonicalJson(binding, REQUEST_DIGEST_DOMAIN),
  });
}

function issuanceBinding(
  plan: Readonly<SubstrateFederatedGenesisProvisioningV1Plan>,
  ordinal: 0 | 1 | 2,
  role: SetupRole,
  transactionRole:
    | 'trackerIssuance'
    | 'duplicatePreventionIssuance'
    | 'pooledReserveIssuance',
): Readonly<SubstrateFederatedGenesisSetupCheckIssuanceV1> {
  const transaction = plan.transactions[transactionRole];
  const lineage = plan.lineages[role];
  const state = plan.boxes[role];
  if (
    transaction.eip12Tx.inputs.length !== 1
    || transaction.eip12Tx.inputs[0]!.boxId !== lineage.genesisInputBoxIdHex
    || lineage.singletonTokenIdHex !== lineage.genesisInputBoxIdHex
    || transaction.txId !== lineage.issuanceTransactionIdHex
    || transaction.outputs[0]!.boxId !== lineage.stateOutputBoxIdHex
    || state.boxId !== lineage.stateOutputBoxIdHex
    || state.transactionId !== transaction.txId
    || state.index !== lineage.stateOutputIndex
    || state.creationHeight !== lineage.creationHeight
    || state.assets.length !== 1
    || state.assets[0]!.tokenId !== lineage.singletonTokenIdHex
    || state.assets[0]!.amount !== '1'
  ) {
    throw new Error(`federated ${role} setup-check lineage drifted`);
  }
  return deepFreeze({
    ordinal,
    role,
    genesisInputBoxIdHex: lineage.genesisInputBoxIdHex,
    singletonTokenIdHex: lineage.singletonTokenIdHex,
    unsignedTransactionIdHex: lineage.issuanceTransactionIdHex,
    unsignedTransactionBodyDigestHex: sha256CanonicalJson(
      transaction.eip12Tx,
      `${TRANSACTION_BODY_DIGEST_DOMAIN}_${role.toUpperCase()}`,
    ),
    materializedTransactionDigestHex: sha256CanonicalJson(
      transaction,
      `${MATERIALIZED_TRANSACTION_DIGEST_DOMAIN}_${role.toUpperCase()}`,
    ),
    predictedStateOutputBoxIdHex: lineage.stateOutputBoxIdHex,
    stateOutputIndex: lineage.stateOutputIndex,
    creationHeight: lineage.creationHeight,
  });
}

function assertNonAuthorizingPlan(
  plan: Readonly<SubstrateFederatedGenesisProvisioningV1Plan>,
): void {
  if (
    plan.status !== 'unsigned_non_authorizing_candidate'
    || plan.stages.construction !== 'unsigned-plan-complete'
    || plan.stages.setupCheckRequest !== 'not-created'
    || plan.stages.jvmCheck !== 'not-performed'
    || plan.stages.signing !== 'not-authorized'
    || plan.stages.submission !== 'not-authorized'
    || plan.stages.broadcastAuthorization !== 'not-granted'
    || plan.stages.confirmation !== 'not-established'
    || Object.values(plan.boundaries).some(value => value !== false)
  ) {
    throw new Error(
      'federated setup-check request requires a non-authorizing provisioning plan',
    );
  }
}

function falseBoundaries(): SubstrateFederatedGenesisSetupCheckRequestV1[
  'boundaries'
] {
  return Object.freeze({
    containsSignedTransactionBytes: false as const,
    containsSignerCapability: false as const,
    containsCheckerCapability: false as const,
    containsNetworkTransportCapability: false as const,
    containsSubmissionCapability: false as const,
    containsBroadcastCapability: false as const,
    targetProfileApprovalAuthenticated: false as const,
    targetNodeAcceptanceEstablished: false as const,
    setupSubmissionAuthorized: false as const,
    canonicalLineagesEstablished: false as const,
    profileActivated: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
