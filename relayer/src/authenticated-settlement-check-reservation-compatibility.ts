import { createHash } from 'node:crypto';

import {
  runAuthenticatedSettlementCheckReservation,
} from './apps/bridge-daemon/authenticated-settlement-check-reservation.js';
import {
  authorizeAuthenticatedSettlementCheckAdmission,
  assertAuthenticatedSettlementCheckAdmissionProvenance,
  type AuthenticatedSettlementCheckAdmission,
} from './authenticated-settlement-check-admission.js';
import {
  assertAuthenticatedSettlementStableErgoViewProvenance,
  type AuthenticatedSettlementStableErgoView,
} from './authenticated-settlement-ergo-anchor.js';
import {
  authorizeAuthenticatedSettlementExecution,
  assertAuthenticatedSettlementExecutionAuthorizationProvenance,
  type AuthenticatedSettlementExecutionAuthorization,
} from './authenticated-settlement-execution-authorization.js';
import {
  authorizeAuthenticatedSettlementExecutionReservation,
  assertAuthenticatedSettlementExecutionReservationAdmissionProvenance,
  type AuthenticatedSettlementExecutionReservationAdmission,
} from './authenticated-settlement-execution-reservation.js';
import {
  assertAuthenticatedSettlementJvmCheckAcceptanceProvenance,
  assertAuthenticatedSettlementSignedCheckCandidateProvenance,
  assertRevalidatedAuthenticatedSettlementCandidateProvenance,
  type AuthenticatedSettlementJvmCheckAcceptance,
  type AuthenticatedSettlementSignedCheckCandidate,
  type RevalidatedAuthenticatedSettlementCandidate,
} from './authenticated-settlement-jvm-check.js';
import {
  assertAuthenticatedSettlementStableSidechainViewProvenance,
  type AuthenticatedSettlementStableSidechainView,
} from './authenticated-settlement-sidechain-view.js';
import {
  assertPackageBoundAuthenticatedSettlementProvenance,
  type PackageBoundAuthenticatedSettlement,
} from './authenticated-v2-settlement-package-binding.js';
import {
  deriveSubstrateGrandpaV1AuthenticatedSettlementPayoutDigest,
} from './profiles/substrate-grandpa-v1/authenticated-settlement-payout-binding.js';
import {
  selectBridgeSourceProfile,
  type BridgeSourceProfileSelection,
} from './profiles/index.js';
import type {
  AuthenticatedSettlementCheckAdmission as CoreCheckAdmission,
  AuthenticatedSettlementCheckedArtifact,
  AuthenticatedSettlementCheckJournalResult,
  AuthenticatedSettlementExecutionAuthorization as CoreExecutionAuthorization,
  AuthenticatedSettlementExecutionReservation as CoreExecutionReservation,
  AuthenticatedSettlementLifecycleBinding,
  AuthenticatedSettlementLifecycleInput,
  AuthenticatedSettlementPackageBinding,
  AuthenticatedSettlementReservationAdmission,
  AuthenticatedSettlementReservedHandoff,
  AuthenticatedSettlementRevalidation,
  AuthenticatedSettlementSignedArtifact,
  AuthenticatedSettlementStableObservation,
} from './relayer-core/authenticated-settlement-execution-lifecycle.js';
import type { ParsedPegOut } from './sidechain-client.js';
import type {
  AuthenticatedSettlementCandidate,
  AuthenticatedSettlementExecutionReservation,
  StateTracker,
} from './state-tracker.js';

const AUTHENTICATED_SETTLEMENT_PACKAGE_BINDING_DIGEST_DOMAIN =
  'E2S_AUTHENTICATED_SETTLEMENT_PACKAGE_BINDING_V1';
const ERGO_LONG_MAX = 9_223_372_036_854_775_807n;

type Candidate = AuthenticatedSettlementCandidate;
type Prepared = RevalidatedAuthenticatedSettlementCandidate['prepared'];
type SignedArtifact = AuthenticatedSettlementSignedCheckCandidate;
type CoreRevalidation = AuthenticatedSettlementRevalidation<Candidate, Prepared>;
type CorePackageBinding =
  AuthenticatedSettlementPackageBinding<Candidate, Prepared>;
type CoreSigned = AuthenticatedSettlementSignedArtifact<
  Candidate,
  Prepared,
  SignedArtifact
>;
type CoreChecked = AuthenticatedSettlementCheckedArtifact<
  Candidate,
  Prepared,
  SignedArtifact
>;
type CoreStableObservation = AuthenticatedSettlementStableObservation<
  Candidate,
  Prepared,
  SignedArtifact
>;
type CoreAdmission = CoreCheckAdmission<Candidate, Prepared, SignedArtifact>;
type CoreCheckJournal = AuthenticatedSettlementCheckJournalResult<
  Candidate,
  Prepared,
  SignedArtifact
>;
type CoreAuthorization = CoreExecutionAuthorization<
  Candidate,
  Prepared,
  SignedArtifact
>;
type CoreReservationAdmission = AuthenticatedSettlementReservationAdmission<
  Candidate,
  Prepared,
  SignedArtifact
>;
type CoreReservation = CoreExecutionReservation<
  Candidate,
  Prepared,
  SignedArtifact
>;

type AuthenticatedSettlementCheckReservationState = Pick<
  StateTracker,
  | 'getAuthenticatedSettlementCandidate'
  | 'markAuthenticatedSettlementCandidateCheckPassed'
  | 'reserveAuthenticatedSettlementExecution'
>;

export interface AuthenticatedSettlementCheckReservationCompatibilityInput {
  readonly sourceProfileSelection: BridgeSourceProfileSelection;
  readonly candidate: Candidate;
  readonly pegOut: ParsedPegOut;
  readonly expectedPackageDigestHex: string;
}

export interface AuthenticatedSettlementCheckReservationCompatibilityDeps {
  readonly state: AuthenticatedSettlementCheckReservationState;
  revalidate(): Promise<RevalidatedAuthenticatedSettlementCandidate>;
  bindPackage(
    revalidated: RevalidatedAuthenticatedSettlementCandidate,
  ): Promise<PackageBoundAuthenticatedSettlement>;
  sign(
    packageBinding: PackageBoundAuthenticatedSettlement,
    revalidated: RevalidatedAuthenticatedSettlementCandidate,
  ): Promise<AuthenticatedSettlementSignedCheckCandidate>;
  check(
    packageBinding: PackageBoundAuthenticatedSettlement,
    revalidated: RevalidatedAuthenticatedSettlementCandidate,
    signed: AuthenticatedSettlementSignedCheckCandidate,
  ): Promise<AuthenticatedSettlementJvmCheckAcceptance>;
  observeStableErgo(
    revalidated: RevalidatedAuthenticatedSettlementCandidate,
    acceptance: AuthenticatedSettlementJvmCheckAcceptance,
  ): Promise<AuthenticatedSettlementStableErgoView>;
  observeStableSidechain(
    revalidated: RevalidatedAuthenticatedSettlementCandidate,
    acceptance: AuthenticatedSettlementJvmCheckAcceptance,
  ): Promise<AuthenticatedSettlementStableSidechainView>;
}

export interface AuthenticatedSettlementCheckReservationCompatibilityResult {
  readonly handoff: AuthenticatedSettlementReservedHandoff<
    Candidate,
    Prepared,
    SignedArtifact
  >;
  readonly acceptance: AuthenticatedSettlementJvmCheckAcceptance;
  readonly authorization: AuthenticatedSettlementExecutionAuthorization;
  readonly reservation: AuthenticatedSettlementExecutionReservation;
}

/**
 * Bind the existing Substrate/GRANDPA V1 check-only path to the extracted
 * lifecycle without granting any transport or broadcast capability.
 */
export async function runAuthenticatedSettlementCheckReservationCompatibility(
  input: AuthenticatedSettlementCheckReservationCompatibilityInput,
  deps: AuthenticatedSettlementCheckReservationCompatibilityDeps,
): Promise<AuthenticatedSettlementCheckReservationCompatibilityResult> {
  selectBridgeSourceProfile(input.sourceProfileSelection);
  const lifecycleInput = authenticatedSettlementLifecycleInput(input);
  const actualRevalidations =
    new WeakMap<object, RevalidatedAuthenticatedSettlementCandidate>();
  const actualPackageBindings =
    new WeakMap<object, PackageBoundAuthenticatedSettlement>();
  const actualSignedArtifacts =
    new WeakMap<object, AuthenticatedSettlementSignedCheckCandidate>();
  const actualAcceptances =
    new WeakMap<object, AuthenticatedSettlementJvmCheckAcceptance>();
  const actualErgoViews =
    new WeakMap<object, AuthenticatedSettlementStableErgoView>();
  const actualSidechainViews =
    new WeakMap<object, AuthenticatedSettlementStableSidechainView>();
  const actualAdmissions =
    new WeakMap<object, AuthenticatedSettlementCheckAdmission>();
  const actualAuthorizations =
    new WeakMap<object, AuthenticatedSettlementExecutionAuthorization>();
  const actualReservationAdmissions =
    new WeakMap<object, AuthenticatedSettlementExecutionReservationAdmission>();

  let finalAcceptance: AuthenticatedSettlementJvmCheckAcceptance | undefined;
  let finalAuthorization: AuthenticatedSettlementExecutionAuthorization | undefined;
  let finalReservation: AuthenticatedSettlementExecutionReservation | undefined;

  const handoff = await runAuthenticatedSettlementCheckReservation(
    lifecycleInput,
    {
      revalidate: async exactInput => {
        exactObject(exactInput, lifecycleInput, 'lifecycle input');
        const revalidated = await deps.revalidate();
        assertRevalidatedAuthenticatedSettlementCandidateProvenance(revalidated);
        assertRevalidationMatchesInput(revalidated, lifecycleInput, input);
        const result = Object.freeze({
          ...bindingWithExpectedTxId(lifecycleInput, revalidated.expectedTxId),
          input: exactInput,
          prepared: revalidated.prepared,
          revalidationDigestHex: revalidated.revalidationDigestHex,
        });
        actualRevalidations.set(result, revalidated);
        return result;
      },
      bindPackage: async revalidation => {
        const revalidated = mapped(
          actualRevalidations,
          revalidation,
          'revalidated candidate',
        );
        const packageBinding = await deps.bindPackage(revalidated);
        assertPackageBoundAuthenticatedSettlementProvenance(packageBinding);
        assertPackageBindingMatchesLifecycle(
          packageBinding,
          revalidated,
          lifecycleInput,
        );
        const result = Object.freeze({
          ...bindingWithExpectedTxId(lifecycleInput, revalidated.expectedTxId),
          revalidation,
          prepared: revalidation.prepared,
          revalidationDigestHex: revalidation.revalidationDigestHex,
          packageBindingDigestHex:
            deriveAuthenticatedSettlementPackageBindingDigest({
              candidateId: lifecycleInput.candidateId,
              unsignedTxDigestHex: lifecycleInput.unsignedTxDigestHex,
              revalidation,
              packageBinding,
            }),
        });
        actualPackageBindings.set(result, packageBinding);
        return result;
      },
      sign: async packageBinding => {
        const actualPackageBinding = mapped(
          actualPackageBindings,
          packageBinding,
          'package binding',
        );
        const revalidated = mapped(
          actualRevalidations,
          packageBinding.revalidation,
          'package revalidation',
        );
        const signed = await deps.sign(actualPackageBinding, revalidated);
        assertAuthenticatedSettlementSignedCheckCandidateProvenance(signed);
        const result = Object.freeze({
          ...bindingWithExpectedTxId(lifecycleInput, revalidated.expectedTxId),
          packageBinding,
          revalidationDigestHex: packageBinding.revalidationDigestHex,
          packageBindingDigestHex: packageBinding.packageBindingDigestHex,
          signedTransactionDigestHex: signed.signedTransactionDigestHex,
          signerContextDigestHex: signed.signerContextDigestHex,
          signedArtifact: signed,
        });
        actualSignedArtifacts.set(result, signed);
        return result;
      },
      check: async signed => {
        const actualSigned = mapped(
          actualSignedArtifacts,
          signed,
          'signed check candidate',
        );
        const actualPackageBinding = mapped(
          actualPackageBindings,
          signed.packageBinding,
          'signed package binding',
        );
        const revalidated = mapped(
          actualRevalidations,
          signed.packageBinding.revalidation,
          'signed revalidation',
        );
        const acceptance = await deps.check(
          actualPackageBinding,
          revalidated,
          actualSigned,
        );
        assertAuthenticatedSettlementJvmCheckAcceptanceProvenance(acceptance);
        const result = Object.freeze({
          ...bindingWithExpectedTxId(lifecycleInput, revalidated.expectedTxId),
          signed,
          ...checkedDigests(signed, acceptance),
        });
        actualAcceptances.set(result, acceptance);
        finalAcceptance = acceptance;
        return result;
      },
      observeStableErgo: async checked => {
        const acceptance = mapped(
          actualAcceptances,
          checked,
          'checked candidate',
        );
        const revalidated = mapped(
          actualRevalidations,
          checked.signed.packageBinding.revalidation,
          'checked revalidation',
        );
        const view = await deps.observeStableErgo(revalidated, acceptance);
        assertAuthenticatedSettlementStableErgoViewProvenance(view);
        const result = Object.freeze({
          ...bindingWithExpectedTxId(lifecycleInput, revalidated.expectedTxId),
          check: checked,
          ...checkedDigests(checked.signed, acceptance),
          viewDigestHex: view.viewDigestHex,
        });
        actualErgoViews.set(result, view);
        return result;
      },
      observeStableSidechain: async checked => {
        const acceptance = mapped(
          actualAcceptances,
          checked,
          'checked candidate',
        );
        const revalidated = mapped(
          actualRevalidations,
          checked.signed.packageBinding.revalidation,
          'checked revalidation',
        );
        const view = await deps.observeStableSidechain(revalidated, acceptance);
        assertAuthenticatedSettlementStableSidechainViewProvenance(view);
        const result = Object.freeze({
          ...bindingWithExpectedTxId(lifecycleInput, revalidated.expectedTxId),
          check: checked,
          ...checkedDigests(checked.signed, acceptance),
          viewDigestHex: view.viewDigestHex,
        });
        actualSidechainViews.set(result, view);
        return result;
      },
      authorizeCheck: ({ check, stableErgoView, stableSidechainView }) => {
        const acceptance = mapped(
          actualAcceptances,
          check,
          'check acceptance',
        );
        const revalidated = mapped(
          actualRevalidations,
          check.signed.packageBinding.revalidation,
          'check revalidation',
        );
        const ergoView = mapped(
          actualErgoViews,
          stableErgoView,
          'stable Ergo view',
        );
        const sidechainView = mapped(
          actualSidechainViews,
          stableSidechainView,
          'stable sidechain view',
        );
        const admission = authorizeAuthenticatedSettlementCheckAdmission({
          acceptance,
          revalidated,
          stableErgoView: ergoView,
          stableSidechainView: sidechainView,
        });
        const result = Object.freeze({
          ...bindingWithExpectedTxId(lifecycleInput, revalidated.expectedTxId),
          check,
          stableErgoView,
          stableSidechainView,
          ...admissionDigests(check, admission),
        });
        actualAdmissions.set(result, admission);
        return result;
      },
      recordCheck: admission => {
        const actualAdmission = mapped(
          actualAdmissions,
          admission,
          'check admission',
        );
        const applied =
          deps.state.markAuthenticatedSettlementCandidateCheckPassed(
            actualAdmission,
          );
        return Object.freeze({
          ...bindingWithExpectedTxId(lifecycleInput, admission.expectedTxId),
          admission,
          ...admissionDigests(admission.check, actualAdmission),
          applied,
          status: applied ? 'check_passed' : 'changed',
        });
      },
      authorizeExecution: ({ checkAdmission, checkJournal }) => {
        const admission = mapped(
          actualAdmissions,
          checkAdmission,
          'journaled check admission',
        );
        const acceptance = mapped(
          actualAcceptances,
          checkAdmission.check,
          'journaled check acceptance',
        );
        const revalidated = mapped(
          actualRevalidations,
          checkAdmission.check.signed.packageBinding.revalidation,
          'journaled revalidation',
        );
        const packageBinding = mapped(
          actualPackageBindings,
          checkAdmission.check.signed.packageBinding,
          'journaled package binding',
        );
        const stableErgoView = mapped(
          actualErgoViews,
          checkAdmission.stableErgoView,
          'journaled stable Ergo view',
        );
        const stableSidechainView = mapped(
          actualSidechainViews,
          checkAdmission.stableSidechainView,
          'journaled stable sidechain view',
        );
        const authorization = authorizeAuthenticatedSettlementExecution({
          state: deps.state,
          candidateId: lifecycleInput.candidateId,
          revalidated,
          packageBinding,
          acceptance,
          checkAdmission: admission,
          stableErgoView,
          stableSidechainView,
        });
        assertAuthenticatedSettlementExecutionAuthorizationProvenance(
          authorization,
        );
        assertAuthorizationPayoutBinding(
          authorization,
          input,
          lifecycleInput.payoutDigestHex,
        );
        const result = Object.freeze({
          ...bindingWithExpectedTxId(lifecycleInput, authorization.expectedTxId),
          checkAdmission,
          checkJournal,
          ...admissionDigests(checkAdmission.check, admission),
          authorizationDigestHex: authorization.authorizationDigestHex,
        });
        actualAuthorizations.set(result, authorization);
        finalAuthorization = authorization;
        return result;
      },
      authorizeReservation: authorization => {
        const actualAuthorization = mapped(
          actualAuthorizations,
          authorization,
          'execution authorization',
        );
        const admission = authorizeAuthenticatedSettlementExecutionReservation({
          state: deps.state,
          authorization: actualAuthorization,
        });
        assertAuthenticatedSettlementExecutionReservationAdmissionProvenance(
          admission,
        );
        const result = Object.freeze({
          ...bindingWithExpectedTxId(lifecycleInput, admission.expectedTxId),
          authorization,
          ...admissionDigests(
            authorization.checkAdmission.check,
            mapped(
              actualAdmissions,
              authorization.checkAdmission,
              'reservation check admission',
            ),
          ),
          authorizationDigestHex: admission.authorizationDigestHex,
          reservationDigestHex: admission.reservationDigestHex,
        });
        actualReservationAdmissions.set(result, admission);
        return result;
      },
      reserveExecution: admission => {
        const actualAdmission = mapped(
          actualReservationAdmissions,
          admission,
          'execution reservation admission',
        );
        const reservation =
          deps.state.reserveAuthenticatedSettlementExecution(actualAdmission);
        const result = Object.freeze({
          ...bindingWithExpectedTxId(lifecycleInput, reservation.expectedTxId),
          admission,
          ...admissionDigests(
            admission.authorization.checkAdmission.check,
            mapped(
              actualAdmissions,
              admission.authorization.checkAdmission,
              'reserved check admission',
            ),
          ),
          authorizationDigestHex: reservation.authorizationDigestHex,
          reservationDigestHex: reservation.reservationDigestHex,
          applied: true,
          status: reservation.status,
        });
        finalReservation = reservation;
        return result;
      },
    },
  );

  if (!finalAcceptance || !finalAuthorization || !finalReservation) {
    throw new Error(
      'authenticated settlement check reservation did not complete every compatibility stage',
    );
  }
  return Object.freeze({
    handoff,
    acceptance: finalAcceptance,
    authorization: finalAuthorization,
    reservation: finalReservation,
  });
}

export function deriveAuthenticatedSettlementPayoutDigest(input: {
  readonly candidate: Candidate;
  readonly pegOut: ParsedPegOut;
}): string {
  return deriveSubstrateGrandpaV1AuthenticatedSettlementPayoutDigest(
    authenticatedSettlementPayoutBinding(input),
  );
}

export function deriveAuthenticatedSettlementPackageBindingDigest(input: {
  readonly candidateId: string;
  readonly unsignedTxDigestHex: string;
  readonly revalidation: Pick<
    CoreRevalidation,
    'expectedTxId' | 'revalidationDigestHex'
  >;
  readonly packageBinding: PackageBoundAuthenticatedSettlement;
}): string {
  return sha256Canonical({
    domain: AUTHENTICATED_SETTLEMENT_PACKAGE_BINDING_DIGEST_DOMAIN,
    candidateId: fixedHex(input.candidateId, 32, 'candidate ID'),
    expectedTxId: fixedHex(
      input.revalidation.expectedTxId,
      32,
      'revalidated transaction ID',
    ),
    unsignedTxDigestHex: fixedHex(
      input.unsignedTxDigestHex,
      32,
      'unsigned transaction digest',
    ),
    revalidationDigestHex: fixedHex(
      input.revalidation.revalidationDigestHex,
      32,
      'revalidation digest',
    ),
    packageDigestHex: fixedHex(
      input.packageBinding.packageDigestHex,
      32,
      'unsigned package digest',
    ),
    readinessReportDigestHex: fixedHex(
      input.packageBinding.readinessReportDigestHex,
      32,
      'readiness report digest',
    ),
    companionDigestHex: fixedHex(
      input.packageBinding.companionDigestHex,
      32,
      'companion digest',
    ),
    eip12Sha256Hex: fixedHex(
      input.packageBinding.eip12Sha256Hex,
      32,
      'EIP-12 digest',
    ),
  });
}

function authenticatedSettlementLifecycleInput(
  input: AuthenticatedSettlementCheckReservationCompatibilityInput,
): AuthenticatedSettlementLifecycleInput<Candidate> {
  return Object.freeze({
    candidate: input.candidate,
    candidateId: fixedHex(input.candidate.candidateId, 32, 'candidate ID'),
    unsignedTxDigestHex: fixedHex(
      input.candidate.unsignedTxDigest,
      32,
      'unsigned transaction digest',
    ),
    unsignedPackageDigestHex: fixedHex(
      input.expectedPackageDigestHex,
      32,
      'unsigned package digest',
    ),
    payoutDigestHex: deriveAuthenticatedSettlementPayoutDigest(input),
    trackerBoxId: fixedHex(
      input.candidate.trackerBoxId,
      32,
      'tracker box ID',
    ),
    duplicatePreventionBoxId: fixedHex(
      input.candidate.dupInputBoxId,
      32,
      'DUP input box ID',
    ),
  });
}

function authenticatedSettlementPayoutBinding(input: {
  readonly candidate: Candidate;
  readonly pegOut: ParsedPegOut;
}) {
  const candidate = input.candidate;
  const pegOut = input.pegOut;
  const sidechainHeight = nonnegativeBigInt(
    candidate.sidechainHeight,
    'candidate sidechain height',
  );
  if (
    fixedHex(pegOut.sidechainTxHash, 32, 'peg-out transaction hash')
      !== fixedHex(candidate.burnTxHash, 32, 'candidate burn transaction hash')
    || nonnegativeBigInt(
      pegOut.sidechainBlockNumber,
      'peg-out sidechain height',
    ) !== sidechainHeight
    || fixedHex(pegOut.sidechainBlockHash, 32, 'peg-out execution block hash')
      !== fixedHex(
        candidate.sidechainBlockHash,
        32,
        'candidate execution block hash',
      )
    || pegOut.sidechainLogIndex !== candidate.sidechainLogIndex
  ) {
    throw new Error(
      'peg-out payout does not match the authenticated settlement candidate source identity',
    );
  }
  if (
    !Number.isSafeInteger(pegOut.sidechainLogIndex)
    || pegOut.sidechainLogIndex < 0
  ) {
    throw new Error('peg-out event index must be a nonnegative safe integer');
  }
  return {
    candidateId: fixedHex(candidate.candidateId, 32, 'candidate ID'),
    burnId: fixedHex(candidate.burnId, 32, 'burn ID'),
    sidechainId: fixedHex(candidate.sidechainId, 32, 'sidechain ID'),
    burnTxHash: fixedHex(
      candidate.burnTxHash,
      32,
      'burn transaction hash',
    ),
    sidechainHeight,
    executionBlockHash: fixedHex(
      candidate.sidechainBlockHash,
      32,
      'execution block hash',
    ),
    eventIndex: candidate.sidechainLogIndex,
    amountNanoErg: positiveErgoLong(pegOut.amount, 'settlement amount'),
    recipientErgoTreeHex: fixedHex(
      pegOut.ergoRecipientAddress,
      36,
      'recipient ErgoTree',
    ),
    vaultBoxId: fixedHex(
      candidate.vaultBoxId,
      32,
      'settlement vault box ID',
    ),
  };
}

function assertRevalidationMatchesInput(
  revalidated: RevalidatedAuthenticatedSettlementCandidate,
  lifecycleInput: AuthenticatedSettlementLifecycleInput<Candidate>,
  compatibilityInput: AuthenticatedSettlementCheckReservationCompatibilityInput,
): void {
  if (
    fixedHex(revalidated.candidateId, 32, 'revalidated candidate ID')
      !== lifecycleInput.candidateId
    || fixedHex(
      revalidated.unsignedTxDigest,
      32,
      'revalidated unsigned transaction digest',
    ) !== lifecycleInput.unsignedTxDigestHex
    || positiveErgoLong(
      revalidated.amountNanoErg,
      'revalidated settlement amount',
    ) !== positiveErgoLong(
      compatibilityInput.pegOut.amount,
      'requested settlement amount',
    )
    || fixedHex(
      revalidated.recipientErgoTreeHex,
      36,
      'revalidated recipient ErgoTree',
    ) !== fixedHex(
      compatibilityInput.pegOut.ergoRecipientAddress,
      36,
      'requested recipient ErgoTree',
    )
  ) {
    throw new Error(
      'revalidated authenticated settlement does not match the lifecycle input',
    );
  }
}

function assertPackageBindingMatchesLifecycle(
  packageBinding: PackageBoundAuthenticatedSettlement,
  revalidated: RevalidatedAuthenticatedSettlementCandidate,
  lifecycleInput: AuthenticatedSettlementLifecycleInput<Candidate>,
): void {
  if (
    packageBinding.prepared !== revalidated.prepared
    || fixedHex(packageBinding.expectedTxId, 32, 'package transaction ID')
      !== fixedHex(revalidated.expectedTxId, 32, 'revalidated transaction ID')
    || fixedHex(packageBinding.packageDigestHex, 32, 'package digest')
      !== lifecycleInput.unsignedPackageDigestHex
  ) {
    throw new Error(
      'authenticated settlement package binding does not match the lifecycle input',
    );
  }
}

function assertAuthorizationPayoutBinding(
  authorization: AuthenticatedSettlementExecutionAuthorization,
  input: AuthenticatedSettlementCheckReservationCompatibilityInput,
  expectedPayoutDigestHex: string,
): void {
  const actual = deriveAuthenticatedSettlementPayoutDigest({
    candidate: {
      ...input.candidate,
      vaultBoxId: authorization.vaultBoxId,
    },
    pegOut: {
      ...input.pegOut,
      amount: authorization.amountNanoErg,
      ergoRecipientAddress: authorization.recipientErgoTreeHex,
    },
  });
  if (actual !== expectedPayoutDigestHex) {
    throw new Error(
      'execution authorization does not match the exact payout binding',
    );
  }
}

function bindingWithExpectedTxId(
  input: AuthenticatedSettlementLifecycleInput<Candidate>,
  expectedTxId: string,
): AuthenticatedSettlementLifecycleBinding<Candidate> {
  return {
    ...input,
    expectedTxId: fixedHex(
      expectedTxId,
      32,
      'expected settlement transaction ID',
    ),
  };
}

function checkedDigests(
  signed: CoreSigned,
  acceptance: AuthenticatedSettlementJvmCheckAcceptance,
) {
  return {
    revalidationDigestHex: signed.revalidationDigestHex,
    packageBindingDigestHex: signed.packageBindingDigestHex,
    signedTransactionDigestHex: fixedHex(
      acceptance.signedTransactionDigestHex,
      32,
      'signed transaction digest',
    ),
    signerContextDigestHex: fixedHex(
      acceptance.signerContextDigestHex,
      32,
      'signer context digest',
    ),
    checkResponseDigestHex: fixedHex(
      acceptance.checkResponseDigestHex,
      32,
      'JVM check response digest',
    ),
    checkerIdentityDigestHex: fixedHex(
      acceptance.checkerIdentityDigestHex,
      32,
      'checker identity digest',
    ),
  };
}

function admissionDigests(
  check: CoreChecked,
  admission: AuthenticatedSettlementCheckAdmission,
) {
  return {
    revalidationDigestHex: check.revalidationDigestHex,
    packageBindingDigestHex: check.packageBindingDigestHex,
    signedTransactionDigestHex: check.signedTransactionDigestHex,
    signerContextDigestHex: check.signerContextDigestHex,
    checkResponseDigestHex: check.checkResponseDigestHex,
    checkerIdentityDigestHex: check.checkerIdentityDigestHex,
    stableErgoViewDigestHex: fixedHex(
      admission.stableErgoViewDigestHex,
      32,
      'stable Ergo view digest',
    ),
    stableSidechainViewDigestHex: fixedHex(
      admission.stableSidechainViewDigestHex,
      32,
      'stable sidechain view digest',
    ),
    admissionDigestHex: fixedHex(
      admission.admissionDigestHex,
      32,
      'check admission digest',
    ),
  };
}

function mapped<T>(
  map: WeakMap<object, T>,
  value: object,
  label: string,
): T {
  const result = map.get(value);
  if (!result) {
    throw new Error(`${label} compatibility provenance is missing`);
  }
  return result;
}

function exactObject(actual: object, expected: object, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} must retain exact object identity`);
  }
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  const raw = typeof value === 'string' ? value : '';
  const clean = raw.startsWith('0x') ? raw.slice(2) : raw;
  if (
    clean.length !== bytes * 2
    || !/^[0-9a-fA-F]+$/.test(clean)
  ) {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  return clean.toLowerCase();
}

function nonnegativeBigInt(value: bigint | number, label: string): bigint {
  if (
    typeof value === 'number'
    && (!Number.isSafeInteger(value) || value < 0)
  ) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  const result = BigInt(value);
  if (result < 0n) throw new Error(`${label} must be nonnegative`);
  return result;
}

function positiveErgoLong(value: bigint, label: string): bigint {
  const result = BigInt(value);
  if (result <= 0n || result > ERGO_LONG_MAX) {
    throw new Error(`${label} must be a positive Ergo Long`);
  }
  return result;
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('authenticated settlement binding cannot contain non-finite numbers');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    return `{${Object.keys(objectValue)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(objectValue[key])}`)
      .join(',')}}`;
  }
  throw new Error(
    `authenticated settlement binding cannot serialize ${typeof value}`,
  );
}
