/**
 * Exact, non-executable target-check request for the distinct V5 setup.
 * It freezes what a future authorized JVM/node check must consume and prove.
 */

import { sha256CanonicalJson } from './strict-json.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V5_STATUS,
  assertValidityApplicationPooledReserveCutoverEligibilityV5Provenance,
  type ValidityApplicationPooledReserveCutoverEligibilityV5Candidate,
} from './validity-application-pooled-reserve-cutover-eligibility-v5.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_PROVISIONING_V5_SCHEMA,
  assertValidityApplicationPooledReserveProvisioningV5Provenance,
  type ValidityApplicationPooledReserveProvisioningV5Plan,
} from './validity-application-pooled-reserve-provisioning-v5.js';
import type {
  Eip12UnsignedTransaction,
  MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';

export const VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_REQUEST_V5_SCHEMA =
  'e2s.validity-application-pooled-reserve-target-check-request.v5' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_REQUEST_V5_STATUS =
  'blocked_non_authorizing_request' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_RECEIPT_V5_SCHEMA =
  'e2s.validity-application-pooled-reserve-target-check-receipt.v5' as const;

const REQUEST_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_REQUEST_V5';
const TRANSACTION_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_REQUEST_V5_TRANSACTION';
const CONTRACT_FAMILY_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_REQUEST_V5_CONTRACTS';
const requests = new WeakSet<object>();

type SetupRole =
  | 'tracker-issuance'
  | 'duplicate-prevention-issuance'
  | 'pooled-reserve-issuance';

export interface BuildValidityApplicationPooledReserveTargetCheckRequestV5Input {
  readonly cutoverEligibility: Readonly<
    ValidityApplicationPooledReserveCutoverEligibilityV5Candidate
  >;
  readonly provisioningPlan: Readonly<
    ValidityApplicationPooledReserveProvisioningV5Plan
  >;
}

export interface ValidityApplicationPooledReserveTargetCheckRequestV5Candidate {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_REQUEST_V5_SCHEMA;
  readonly version: 5;
  readonly status:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_REQUEST_V5_STATUS;
  readonly requestDigestHex: string;
  readonly source: Readonly<{
    readonly cutoverEligibilityCandidateDigestHex: string;
    readonly provisioningPlanDigestHex: string;
  }>;
  readonly target: Readonly<{
    readonly network: Readonly<{
      readonly ergoNetworkId: 'ergo-testnet';
      readonly ergoAddressNetworkPrefix: 16;
      readonly p2sAddressHeader: 19;
      readonly ergoGenesisBlockIdHex: string;
      readonly sourceNetworkIdHex: string;
      readonly sidechainIdHex: string;
      readonly settlementProfileIdHex: string;
    }>;
    readonly profile: Readonly<{
      readonly targetLineageProfileIdHex: string;
      readonly sourceRuntimeLineageProfileIdHex: string;
      readonly sourceRuntimeProfileIdHex: string;
      readonly burnBindingDigestHex: string;
      readonly finalityPolicyIdHex: string;
      readonly proofSystemIdHex: string;
      readonly proofProfileIdHex: string;
      readonly approvedTrustAnchorDigestHex: string;
      readonly contractFamilyDigestHex: string;
    }>;
    readonly checkTransport: Readonly<{
      readonly method: 'POST';
      readonly path: '/transactions/check';
    }>;
  }>;
  readonly transactions: readonly Readonly<{
    readonly role: SetupRole;
    readonly unsignedTxIdHex: string;
    readonly unsignedTransactionDigestHex: string;
    readonly predictedOutputBoxIdHex: string;
    readonly eip12Tx: Readonly<Eip12UnsignedTransaction>;
  }>[];
  readonly receiptPolicy: Readonly<{
    readonly requiredReceiptSchema:
      typeof VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_RECEIPT_V5_SCHEMA;
    readonly expectedReceiptCount: 3;
    readonly exactRoleOrderRequired: true;
    readonly exactRequestDigestRequired: true;
    readonly exactTargetNetworkRequired: true;
    readonly exactActivatedProfileRequired: true;
    readonly exactUnsignedTransactionIdsRequired: true;
    readonly independentUnsignedTransactionIdDerivationRequired: true;
    readonly signedAndNodeTransactionIdsMustEqualUnsignedId: true;
    readonly signedTransactionDigestPerTransactionRequired: true;
    readonly localJvmReductionReceiptRequired: true;
    readonly targetNodeCheckReceiptRequired: true;
    readonly checkerIdentityDigestRequired: true;
    readonly sameCheckerIdentityRequired: true;
    readonly sameNodeOriginRequired: true;
    readonly sameNodeVersionRequired: true;
    readonly sameActivationGenerationRequired: true;
    readonly sameStateContextRequired: true;
    readonly responseDigestPerTransactionRequired: true;
    readonly processProvenanceRequired: true;
    readonly allTransactionsMustPass: true;
  }>;
  readonly blockers: readonly string[];
  readonly checks: Readonly<{
    readonly sameProcessEligibilityVerified: true;
    readonly sameProcessProvisioningVerified: true;
    readonly exactEligibilityPlanBindingMatched: true;
    readonly exactTargetNetworkAndProfileMatched: true;
    readonly exactThreeTransactionSetBound: true;
    readonly checkOnlyTransportDeclared: true;
  }>;
  readonly boundaries: Readonly<{
    readonly targetNodeSelected: false;
    readonly targetNetworkIdentityAuthenticated: false;
    readonly profileActivated: false;
    readonly signerCustodyAuthorized: false;
    readonly requestExecutable: false;
    readonly receiptProvenanceAuthenticated: false;
    readonly nodeCheckPerformed: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly singletonLineageEstablished: false;
    readonly reserveLineageEstablished: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly confirmationEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

export function buildValidityApplicationPooledReserveTargetCheckRequestV5(
  input: BuildValidityApplicationPooledReserveTargetCheckRequestV5Input,
): Readonly<ValidityApplicationPooledReserveTargetCheckRequestV5Candidate> {
  assertExactKeys(input, [
    'cutoverEligibility',
    'provisioningPlan',
  ], 'pooled-reserve V5 target-check request input');
  assertValidityApplicationPooledReserveCutoverEligibilityV5Provenance(
    input.cutoverEligibility,
  );
  assertValidityApplicationPooledReserveProvisioningV5Provenance(
    input.provisioningPlan,
  );
  assertEligibilityRemainsBlocked(input.cutoverEligibility);
  assertProvisioningRemainsUnsigned(input.provisioningPlan);
  assertEligibilityPlanBinding(
    input.cutoverEligibility,
    input.provisioningPlan,
  );

  const transactions = deepFreeze([
    bindTransaction(
      'tracker-issuance',
      input.provisioningPlan.transactions.trackerIssuance,
      input.cutoverEligibility.targetV5.transactionIdentities
        .trackerIssuanceTxIdHex,
      input.cutoverEligibility.targetV5.transactionIdentities.trackerBoxIdHex,
    ),
    bindTransaction(
      'duplicate-prevention-issuance',
      input.provisioningPlan.transactions.duplicatePreventionIssuance,
      input.cutoverEligibility.targetV5.transactionIdentities
        .duplicatePreventionIssuanceTxIdHex,
      input.cutoverEligibility.targetV5.transactionIdentities
        .duplicatePreventionBoxIdHex,
    ),
    bindTransaction(
      'pooled-reserve-issuance',
      input.provisioningPlan.transactions.pooledReserveIssuance,
      input.cutoverEligibility.targetV5.transactionIdentities
        .pooledReserveIssuanceTxIdHex,
      input.cutoverEligibility.targetV5.transactionIdentities
        .pooledReserveBoxIdHex,
    ),
  ]);
  if (
    new Set(transactions.map(transaction => transaction.unsignedTxIdHex)).size
      !== transactions.length
    || new Set(
      transactions.map(transaction => transaction.predictedOutputBoxIdHex),
    ).size !== transactions.length
  ) {
    throw new Error('V5 target-check transactions and outputs must be pairwise distinct');
  }

  const eligibility = input.cutoverEligibility;
  const provisioning = input.provisioningPlan;
  const binding = {
    schema:
      VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_REQUEST_V5_SCHEMA,
    version: 5 as const,
    status:
      VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_REQUEST_V5_STATUS,
    source: {
      cutoverEligibilityCandidateDigestHex: fixedHex(
        eligibility.candidateDigestHex,
        32,
        'V5 cutover-eligibility candidate digest',
      ),
      provisioningPlanDigestHex: fixedHex(
        provisioning.planDigestHex,
        32,
        'V5 provisioning plan digest',
      ),
    },
    target: {
      network: deepFreeze({ ...provisioning.targetNetwork }),
      profile: deepFreeze({
        targetLineageProfileIdHex: provisioning.profile.targetLineageProfileIdHex,
        sourceRuntimeLineageProfileIdHex:
          provisioning.profile.sourceRuntimeLineageProfileIdHex,
        sourceRuntimeProfileIdHex:
          provisioning.profile.sourceRuntimeProfileIdHex,
        burnBindingDigestHex: provisioning.profile.burnBindingDigestHex,
        finalityPolicyIdHex: provisioning.profile.finalityPolicyIdHex,
        proofSystemIdHex: provisioning.profile.proofSystemIdHex,
        proofProfileIdHex: provisioning.profile.proofProfileIdHex,
        approvedTrustAnchorDigestHex:
          provisioning.profile.approvedTrustAnchorDigestHex,
        contractFamilyDigestHex: sha256CanonicalJson(
          provisioning.contracts,
          CONTRACT_FAMILY_DIGEST_DOMAIN,
        ),
      }),
      checkTransport: {
        method: 'POST' as const,
        path: '/transactions/check' as const,
      },
    },
    transactions,
    receiptPolicy: {
      requiredReceiptSchema:
        VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_RECEIPT_V5_SCHEMA,
      expectedReceiptCount: 3 as const,
      exactRoleOrderRequired: true as const,
      exactRequestDigestRequired: true as const,
      exactTargetNetworkRequired: true as const,
      exactActivatedProfileRequired: true as const,
      exactUnsignedTransactionIdsRequired: true as const,
      independentUnsignedTransactionIdDerivationRequired: true as const,
      signedAndNodeTransactionIdsMustEqualUnsignedId: true as const,
      signedTransactionDigestPerTransactionRequired: true as const,
      localJvmReductionReceiptRequired: true as const,
      targetNodeCheckReceiptRequired: true as const,
      checkerIdentityDigestRequired: true as const,
      sameCheckerIdentityRequired: true as const,
      sameNodeOriginRequired: true as const,
      sameNodeVersionRequired: true as const,
      sameActivationGenerationRequired: true as const,
      sameStateContextRequired: true as const,
      responseDigestPerTransactionRequired: true as const,
      processProvenanceRequired: true as const,
      allTransactionsMustPass: true as const,
    },
    blockers: deepFreeze([
      'reviewed-target-node-is-not-selected',
      'target-network-identity-is-not-authenticated',
      'v5-profile-activation-is-not-authenticated',
      'target-node-ingress-policy-is-not-established',
      'signer-custody-is-not-authorized',
      'same-target-check-receipts-are-not-collected',
    ]),
    checks: {
      sameProcessEligibilityVerified: true as const,
      sameProcessProvisioningVerified: true as const,
      exactEligibilityPlanBindingMatched: true as const,
      exactTargetNetworkAndProfileMatched: true as const,
      exactThreeTransactionSetBound: true as const,
      checkOnlyTransportDeclared: true as const,
    },
    boundaries: {
      targetNodeSelected: false as const,
      targetNetworkIdentityAuthenticated: false as const,
      profileActivated: false as const,
      signerCustodyAuthorized: false as const,
      requestExecutable: false as const,
      receiptProvenanceAuthenticated: false as const,
      nodeCheckPerformed: false as const,
      targetNodeAcceptanceEstablished: false as const,
      singletonLineageEstablished: false as const,
      reserveLineageEstablished: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      confirmationEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const request = deepFreeze({
    ...binding,
    requestDigestHex: sha256CanonicalJson(binding, REQUEST_DIGEST_DOMAIN),
  });
  requests.add(request);
  return request;
}

export function assertValidityApplicationPooledReserveTargetCheckRequestV5Provenance(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveTargetCheckRequestV5Candidate
> {
  if (value === null || typeof value !== 'object' || !requests.has(value)) {
    throw new Error(
      'pooled-reserve V5 target-check request was not built in this process',
    );
  }
}

function assertEligibilityPlanBinding(
  eligibility: Readonly<
    ValidityApplicationPooledReserveCutoverEligibilityV5Candidate
  >,
  provisioning: Readonly<ValidityApplicationPooledReserveProvisioningV5Plan>,
): void {
  const target = eligibility.targetV5;
  if (
    target.provisioningPlanDigestHex !== provisioning.planDigestHex
    || sha256CanonicalJson(target.targetNetwork)
      !== sha256CanonicalJson(provisioning.targetNetwork)
    || target.lineageProfileIdHex
      !== provisioning.profile.targetLineageProfileIdHex
    || target.sourceRuntimeLineageProfileIdHex
      !== provisioning.profile.sourceRuntimeLineageProfileIdHex
    || target.sourceRuntimeProfileIdHex
      !== provisioning.profile.sourceRuntimeProfileIdHex
    || target.burnBindingDigestHex !== provisioning.profile.burnBindingDigestHex
    || target.finalityPolicy.policyIdHex
      !== provisioning.profile.finalityPolicyIdHex
    || target.finalityPolicy.proofSystemIdHex
      !== provisioning.profile.proofSystemIdHex
    || target.finalityPolicy.proofProfileIdHex
      !== provisioning.profile.proofProfileIdHex
    || target.finalityPolicy.approvedTrustAnchorDigestHex
      !== provisioning.profile.approvedTrustAnchorDigestHex
  ) {
    throw new Error('V5 target-check request does not bind the exact eligibility plan');
  }
  for (const role of [
    'tracker',
    'duplicatePrevention',
    'sourceLock',
    'pooledReserve',
  ] as const) {
    if (
      target.contractIds[role] !== provisioning.contracts[role].contractIdHex
      || sha256CanonicalJson(target.contractArtifacts[role])
        !== sha256CanonicalJson({
          templateSha256Hex: provisioning.contracts[role].templateSha256Hex,
          resolvedSourceSha256Hex:
            provisioning.contracts[role].resolvedSourceSha256Hex,
          propositionSha256Hex:
            provisioning.contracts[role].propositionSha256Hex,
        })
    ) {
      throw new Error(`V5 target-check request ${role} contract binding drifted`);
    }
  }
}

function bindTransaction(
  role: SetupRole,
  transaction: Readonly<MaterializedUnsignedTransaction>,
  expectedTxIdHex: string,
  expectedOutputBoxIdHex: string,
): Readonly<{
  role: SetupRole;
  unsignedTxIdHex: string;
  unsignedTransactionDigestHex: string;
  predictedOutputBoxIdHex: string;
  eip12Tx: Readonly<Eip12UnsignedTransaction>;
}> {
  const unsignedTxIdHex = fixedHex(
    transaction.txId,
    32,
    `${role} unsigned transaction ID`,
  );
  const predictedOutputBoxIdHex = fixedHex(
    transaction.outputs[0]?.boxId,
    32,
    `${role} predicted output box ID`,
  );
  if (
    unsignedTxIdHex !== fixedHex(
      expectedTxIdHex,
      32,
      `${role} eligibility transaction ID`,
    )
    || predictedOutputBoxIdHex !== fixedHex(
      expectedOutputBoxIdHex,
      32,
      `${role} eligibility output box ID`,
    )
  ) {
    throw new Error(`${role} does not match the cutover-eligibility identity`);
  }
  const eip12Tx = deepFreeze(structuredClone(transaction.eip12Tx));
  return deepFreeze({
    role,
    unsignedTxIdHex,
    unsignedTransactionDigestHex: sha256CanonicalJson(
      eip12Tx,
      `${TRANSACTION_DIGEST_DOMAIN}:${role}`,
    ),
    predictedOutputBoxIdHex,
    eip12Tx,
  });
}

function assertEligibilityRemainsBlocked(
  eligibility: Readonly<
    ValidityApplicationPooledReserveCutoverEligibilityV5Candidate
  >,
): void {
  if (
    eligibility.status
      !== VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V5_STATUS
    || Object.values(eligibility.boundaries).some(value => value !== false)
  ) {
    throw new Error('V5 cutover eligibility is no longer a blocked precondition');
  }
}

function assertProvisioningRemainsUnsigned(
  provisioning: Readonly<ValidityApplicationPooledReserveProvisioningV5Plan>,
): void {
  if (
    provisioning.schema
      !== VALIDITY_APPLICATION_POOLED_RESERVE_PROVISIONING_V5_SCHEMA
    || provisioning.version !== 5
    || provisioning.stages.construction !== 'unsigned-plan-complete'
    || provisioning.stages.jvmCheck !== 'not-performed'
    || provisioning.stages.signing !== 'not-authorized'
    || provisioning.stages.submission !== 'not-authorized'
    || provisioning.stages.broadcastAuthorization !== 'not-granted'
    || provisioning.stages.confirmation !== 'not-established'
    || Object.values(provisioning.boundaries).some(value => value !== false)
  ) {
    throw new Error('V5 provisioning is no longer an unsigned non-authorizing plan');
  }
}

function assertExactKeys(
  value: object,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort(compareCodeUnits);
  const wanted = [...expected].sort(compareCodeUnits);
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    throw new Error(`${label} fields are not exact`);
  }
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be canonical lowercase ${bytes}-byte hex`);
  }
  return value;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}
