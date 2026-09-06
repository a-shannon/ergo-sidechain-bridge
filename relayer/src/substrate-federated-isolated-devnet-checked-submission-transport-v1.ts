import axios from 'axios';

import { sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import {
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding,
  assertLocalWasmCheckedSubmissionHandleV1Provenance,
  assertLocalWasmSignedCheckCandidateProvenance,
  consumeLocalWasmCheckedSubmissionHandleV1,
  type LocalWasmCheckedSubmissionHandleV1,
  type LocalWasmExactBytesSignedCheckCandidate,
} from './fleet-signer.js';
import {
  type ErgoOperationalTransactionExecutionPorts,
} from './relayer-core/ergo-operational-transaction-lifecycle.js';
import {
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
  assertSubstrateFederatedLocalDevnetGenesisDurableAttemptV1,
  type SubstrateFederatedLocalDevnetGenesisExecutionPorts,
  type SubstrateFederatedLocalDevnetGenesisSubmission,
} from './relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV1,
  assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV2,
  assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1,
  assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2,
  type SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1,
  type SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2,
} from './substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizationArtifactV1,
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizerV1,
  type SubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizerV1,
} from './substrate-federated-isolated-devnet-peg-in-committed-vault-broadcast-authorizer-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizationArtifactV1,
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1,
  type SubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1,
} from './substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer-v1.js';
import {
  assertSubstrateFederatedLocalDevnetPegInCommittedVaultDurableAttemptV1,
} from './substrate-federated-local-devnet-peg-in-committed-vault-journal-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1,
  type SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1,
  type SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  claimSubstrateFederatedIsolatedDevnetTrackerFeeFundingTransportV1,
  requireSubstrateFederatedIsolatedDevnetTrackerFeeFundingFinalizationV1,
  type SubstrateFederatedIsolatedDevnetTrackerFeeFundingAttemptV1,
} from './substrate-federated-isolated-devnet-tracker-fee-funding-authority-v1.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKED_SUBMISSION_TRANSPORT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-checked-submission-transport.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKED_SUBMISSION_TRANSPORT_V2_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-checked-submission-transport.v2' as const;

const SUBMISSION_PATH = '/transactions' as const;
const SUBMISSION_TIMEOUT_MS = 30_000;
const TRANSPORT_PROFILES = Object.freeze({
  1: Object.freeze({
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKED_SUBMISSION_TRANSPORT_V1_SCHEMA,
    domain: 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKED_SUBMISSION_RESPONSE_V1',
  }),
  2: Object.freeze({
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKED_SUBMISSION_TRANSPORT_V2_SCHEMA,
    domain: 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKED_SUBMISSION_RESPONSE_V2',
  }),
  3: Object.freeze({
    schema: 'e2s.substrate-federated-isolated-devnet-tracker-fee-funding-transport.v1',
    domain: 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_FEE_FUNDING_RESPONSE_V1',
  }),
});
type TransportVersion = keyof typeof TRANSPORT_PROFILES;
type GenesisAuthorizer = Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1
  | SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2>;

type Transport =
  SubstrateFederatedLocalDevnetGenesisExecutionPorts['transport'];
type PegInSubmitter =
  ErgoOperationalTransactionExecutionPorts['submitter'];
type AcceptedOrAmbiguousSubmission = Exclude<
  SubstrateFederatedLocalDevnetGenesisSubmission,
  Readonly<{ status: 'rejected' }>
>;
const FEE_FUNDING_SUBMISSIONS = new WeakMap<object, Readonly<SubstrateFederatedIsolatedDevnetTrackerFeeFundingAttemptV1>>();

/** Only the separately authorized, durably reserved operator-fee transaction. */
export async function submitSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1(
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  attempt: Readonly<SubstrateFederatedIsolatedDevnetTrackerFeeFundingAttemptV1>,
): Promise<AcceptedOrAmbiguousSubmission> {
  const { check, binding, authorization } =
    await claimSubstrateFederatedIsolatedDevnetTrackerFeeFundingTransportV1(attempt, target);
  const handle = check.checkedAcceptance.submissionHandle;
  assertExactAttemptBinding(handle, check.signedCandidate, attempt.expectedTxId,
    target.primaryNodeOrigin, check.signedCandidate.signedTransactionDigestHex,
    handle.checkResponseDigestHex);
  const submission = await consumeLocalWasmCheckedSubmissionHandleV1(handle, check.signedCandidate,
    async signed => await submitExactTransaction(signed, attempt.expectedTxId,
      attempt.durableAttemptDigestHex, authorization.authorizationDigestHex,
      handle, binding, 3));
  FEE_FUNDING_SUBMISSIONS.set(submission, attempt);
  return submission;
}

export function finalizeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1(
  attempt: Readonly<SubstrateFederatedIsolatedDevnetTrackerFeeFundingAttemptV1>,
  submission: AcceptedOrAmbiguousSubmission,
) {
  if (FEE_FUNDING_SUBMISSIONS.get(submission) !== attempt) {
    throw new Error('tracker fee funding result lacks exact completed transport provenance');
  }
  FEE_FUNDING_SUBMISSIONS.delete(submission);
  const state = requireSubstrateFederatedIsolatedDevnetTrackerFeeFundingFinalizationV1(attempt);
  return state.finalizeErgoOperationalTransactionAttempt({
    expectedTxId: attempt.expectedTxId, durableAttemptDigestHex: attempt.durableAttemptDigestHex,
    disposition: submission.status, submittedTxId: submission.submittedTxId,
    responseDigestHex: submission.responseDigestHex,
  });
}

/**
 * Create the only transport that may consume a FED-6-LAB checked submission
 * handle. It is credential-free, exact-origin, one-shot, and never retries.
 */
export function createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1(
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  authorizer:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1>,
): Readonly<Transport> {
  return createGenesisTransport(target, authorizer, 1);
}

export function createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV2(
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  authorizer: Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2>,
): Readonly<Transport> {
  return createGenesisTransport(target, authorizer, 2);
}

// The factory fixes the authority profile; callers cannot inject its guards.
function createGenesisTransport(
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  authorizer: GenesisAuthorizer,
  version: TransportVersion,
): Readonly<Transport> {
  const binding =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  if (version === 1) {
    assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1(
      authorizer as Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1>, target);
  } else {
    assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2(
      authorizer as Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2>, target);
  }
  if (
    target.primaryNodeOrigin
      !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN
    || target.primaryMining !== true
    || target.witnessReadOnly !== true
  ) {
    throw new Error('isolated checked transport target binding is invalid');
  }
  return Object.freeze({
    submit: async attempt => {
      assertSubstrateFederatedLocalDevnetGenesisDurableAttemptV1(attempt);
      const currentBinding =
        assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
      if (
        currentBinding.processBindingDigestHex !== binding.processBindingDigestHex
        || currentBinding.executionTargetIdentityDigestHex
          !== binding.executionTargetIdentityDigestHex
        || attempt.reconciliationIdentityDigestHex
          !== binding.executionTargetIdentityDigestHex
      ) {
        throw new Error('isolated checked transport process binding changed');
      }
      const checked =
        attempt.candidate.authorization.revalidated.checked;
      const expectation = {
        revalidated: attempt.candidate.authorization.revalidated,
        preTransportEvidence:
          attempt.candidate.authorization.preTransportEvidence,
        authorizationDigestHex:
          attempt.candidate.authorization.authorizationDigestHex,
      };
      const artifact = attempt.candidate.authorization.authorizationArtifact;
      if (version === 1) {
        assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV1(
          authorizer as Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1>,
          artifact, expectation);
      } else {
        assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV2(
          authorizer as Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2>,
          artifact, expectation);
      }
      const admission = checked.signed.admission;
      if (
        admission.nodeOrigin
          !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN
      ) {
        throw new Error('isolated checked transport target origin changed');
      }

      const signedCandidate = checked.signed.signerArtifact;
      assertLocalWasmSignedCheckCandidateProvenance(signedCandidate);
      const exactSignedCandidate =
        signedCandidate as LocalWasmExactBytesSignedCheckCandidate;
      if (
        typeof exactSignedCandidate.signedTransactionBytesSha256Hex !== 'string'
        || typeof exactSignedCandidate.signedTransactionBytesLength !== 'number'
      ) {
        throw new Error('isolated checked transport requires exact signed bytes');
      }

      const submissionHandle = checked.checkerArtifact;
      assertLocalWasmCheckedSubmissionHandleV1Provenance(submissionHandle);
      const exactHandle =
        submissionHandle as Readonly<LocalWasmCheckedSubmissionHandleV1>;
      assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding(
        exactHandle,
        binding,
      );
      assertExactAttemptBinding(
        exactHandle,
        exactSignedCandidate,
        admission.expectedTxId,
        admission.nodeOrigin,
        checked.signed.signedTransactionDigestHex,
        checked.checkResponseDigestHex,
      );

      return await consumeLocalWasmCheckedSubmissionHandleV1(
        exactHandle,
        exactSignedCandidate,
        async signedTransaction => await submitExactTransaction(
          signedTransaction,
          admission.expectedTxId,
          attempt.durableAttemptDigestHex,
          attempt.candidate.authorization.authorizationDigestHex,
          exactHandle,
          binding,
          version,
        ),
      );
    },
  });
}

/** Submit one exact source-lock creation after its dedicated authorization. */
export function createSubstrateFederatedIsolatedDevnetPegInSourceLockCheckedSubmissionTransportV1(
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  authorizer:
    Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1>,
): Readonly<PegInSubmitter> {
  const binding =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1(
    authorizer,
    target,
  );
  if (
    target.primaryNodeOrigin
      !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN
    || target.primaryMining !== true
    || target.witnessReadOnly !== true
  ) {
    throw new Error('isolated source-lock transport target binding is invalid');
  }
  return Object.freeze({
    submit: async attempt => {
      const current =
        assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
      if (
        current.processBindingDigestHex !== binding.processBindingDigestHex
        || current.executionTargetIdentityDigestHex
          !== binding.executionTargetIdentityDigestHex
      ) {
        throw new Error('isolated source-lock transport process binding changed');
      }
      assertSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizationArtifactV1(
        authorizer,
        attempt.authorization,
      );
      const checked = attempt.authorization.revalidated.checked;
      const admission = checked.signed.admission;
      if (
        checked.signed.nodeOrigin
          !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN
      ) {
        throw new Error('isolated source-lock transport target origin changed');
      }
      const signedCandidate = checked.signed.signerArtifact;
      assertLocalWasmSignedCheckCandidateProvenance(signedCandidate);
      const exactSignedCandidate =
        signedCandidate as LocalWasmExactBytesSignedCheckCandidate;
      if (
        typeof exactSignedCandidate.signedTransactionBytesSha256Hex !== 'string'
        || typeof exactSignedCandidate.signedTransactionBytesLength !== 'number'
      ) {
        throw new Error('isolated source-lock transport requires exact signed bytes');
      }
      const submissionHandle = checked.checkerArtifact;
      assertLocalWasmCheckedSubmissionHandleV1Provenance(submissionHandle);
      const exactHandle =
        submissionHandle as Readonly<LocalWasmCheckedSubmissionHandleV1>;
      assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding(
        exactHandle,
        binding,
      );
      assertExactAttemptBinding(
        exactHandle,
        exactSignedCandidate,
        admission.expectedTxId,
        checked.signed.nodeOrigin,
        checked.signed.signedTransactionDigestHex,
        checked.checkResponseDigestHex,
      );
      return await consumeLocalWasmCheckedSubmissionHandleV1(
        exactHandle,
        exactSignedCandidate,
        async signedTransaction => await submitExactTransaction(
          signedTransaction,
          admission.expectedTxId,
          attempt.durableAttemptDigestHex,
          attempt.authorization.authorizationDigestHex,
          exactHandle,
          binding,
        ),
      );
    },
  });
}

/** Submit one exact source-lock-to-reserve transition after its authorization. */
export function createSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckedSubmissionTransportV1(
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  authorizer:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizerV1>,
): Readonly<PegInSubmitter> {
  const binding =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizerV1(
    authorizer,
    target,
  );
  if (
    target.primaryNodeOrigin
      !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN
    || target.primaryMining !== true
    || target.witnessReadOnly !== true
  ) {
    throw new Error(
      'isolated committed-vault transport target binding is invalid',
    );
  }
  return Object.freeze({
    submit: async attempt => {
      const current =
        assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
      if (
        current.processBindingDigestHex !== binding.processBindingDigestHex
        || current.executionTargetIdentityDigestHex
          !== binding.executionTargetIdentityDigestHex
      ) {
        throw new Error(
          'isolated committed-vault transport process binding changed',
        );
      }
      assertSubstrateFederatedLocalDevnetPegInCommittedVaultDurableAttemptV1(
        authorizer,
        attempt,
      );
      assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizationArtifactV1(
        authorizer,
        attempt.authorization,
      );
      const checked = attempt.authorization.revalidated.checked;
      const admission = checked.signed.admission;
      if (
        checked.signed.nodeOrigin
          !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN
      ) {
        throw new Error(
          'isolated committed-vault transport target origin changed',
        );
      }
      const signedCandidate = checked.signed.signerArtifact;
      assertLocalWasmSignedCheckCandidateProvenance(signedCandidate);
      const exactSignedCandidate =
        signedCandidate as LocalWasmExactBytesSignedCheckCandidate;
      if (
        typeof exactSignedCandidate.signedTransactionBytesSha256Hex !== 'string'
        || typeof exactSignedCandidate.signedTransactionBytesLength !== 'number'
      ) {
        throw new Error(
          'isolated committed-vault transport requires exact signed bytes',
        );
      }
      const submissionHandle = checked.checkerArtifact;
      assertLocalWasmCheckedSubmissionHandleV1Provenance(submissionHandle);
      const exactHandle =
        submissionHandle as Readonly<LocalWasmCheckedSubmissionHandleV1>;
      assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding(
        exactHandle,
        binding,
      );
      assertExactAttemptBinding(
        exactHandle,
        exactSignedCandidate,
        admission.expectedTxId,
        checked.signed.nodeOrigin,
        checked.signed.signedTransactionDigestHex,
        checked.checkResponseDigestHex,
      );
      return await consumeLocalWasmCheckedSubmissionHandleV1(
        exactHandle,
        exactSignedCandidate,
        async signedTransaction => await submitExactTransaction(
          signedTransaction,
          admission.expectedTxId,
          attempt.durableAttemptDigestHex,
          attempt.authorization.authorizationDigestHex,
          exactHandle,
          binding,
        ),
      );
    },
  });
}

function assertExactAttemptBinding(
  handle: Readonly<LocalWasmCheckedSubmissionHandleV1>,
  signedCandidate: LocalWasmExactBytesSignedCheckCandidate,
  expectedTxId: string,
  nodeOrigin: string,
  signedTransactionDigestHex: string,
  checkResponseDigestHex: string,
): void {
  if (
    handle.txId !== expectedTxId
    || handle.nodeOrigin !== nodeOrigin
    || handle.signedTransactionDigestHex !== signedTransactionDigestHex
    || handle.signedTransactionDigestHex
      !== signedCandidate.signedTransactionDigestHex
    || handle.signedTransactionBytesSha256Hex
      !== signedCandidate.signedTransactionBytesSha256Hex
    || handle.signedTransactionBytesLength
      !== signedCandidate.signedTransactionBytesLength
    || handle.checkResponseDigestHex !== checkResponseDigestHex
  ) {
    throw new Error('isolated checked transport binding changed before submission');
  }
}

async function submitExactTransaction(
  signedTransaction: Readonly<Record<string, unknown>>,
  expectedTxId: string,
  durableAttemptDigestHex: string,
  authorizationDigestHex: string,
  handle: Readonly<LocalWasmCheckedSubmissionHandleV1>,
  binding:
    Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>,
  version: TransportVersion = 1,
): Promise<AcceptedOrAmbiguousSubmission> {
  try {
    const response = await axios.post(
      `${SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN}${SUBMISSION_PATH}`,
      signedTransaction,
      {
        headers: { 'Content-Type': 'application/json' },
        maxRedirects: 0,
        proxy: false,
        timeout: SUBMISSION_TIMEOUT_MS,
        maxContentLength: 1_024,
      },
    );
    const submittedTxId = canonicalTxId(response.data);
    if (submittedTxId !== expectedTxId) {
      return ambiguousResponse({
        outcome: 'ambiguous_success_response',
        httpStatus: finiteHttpStatus(response.status),
        observedTxId: submittedTxId,
        expectedTxId,
        durableAttemptDigestHex,
        authorizationDigestHex,
        handle,
        binding,
      }, version);
    }
    return Object.freeze({
      status: 'accepted' as const,
      submittedTxId,
      responseDigestHex: responseDigest({
        outcome: 'accepted',
        httpStatus: finiteHttpStatus(response.status),
        observedTxId: submittedTxId,
        expectedTxId,
        durableAttemptDigestHex,
        authorizationDigestHex,
        handle,
        binding,
      }, version),
    });
  } catch (error) {
    const httpStatus = axios.isAxiosError(error)
      ? finiteHttpStatus(error.response?.status)
      : null;
    return ambiguousResponse({
      outcome: httpStatus === null
        ? 'ambiguous_no_response'
        : 'ambiguous_http_response',
      httpStatus,
      observedTxId: null,
      expectedTxId,
      durableAttemptDigestHex,
      authorizationDigestHex,
      handle,
      binding,
    }, version);
  }
}

function ambiguousResponse(
  input: SubmissionDigestInput,
  version: TransportVersion = 1,
): AcceptedOrAmbiguousSubmission {
  return Object.freeze({
    status: 'ambiguous' as const,
    submittedTxId: null,
    responseDigestHex: responseDigest(input, version),
  });
}

interface SubmissionDigestInput {
  readonly outcome:
    | 'accepted'
    | 'ambiguous_success_response'
    | 'ambiguous_http_response'
    | 'ambiguous_no_response';
  readonly httpStatus: number | null;
  readonly observedTxId: string | null;
  readonly expectedTxId: string;
  readonly durableAttemptDigestHex: string;
  readonly authorizationDigestHex: string;
  readonly handle: Readonly<LocalWasmCheckedSubmissionHandleV1>;
  readonly binding:
    Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
}

function responseDigest(input: SubmissionDigestInput, version: TransportVersion = 1): string {
  return sha256CanonicalJson({
    schema: TRANSPORT_PROFILES[version].schema,
    outcome: input.outcome,
    nodeOrigin: SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
    path: SUBMISSION_PATH,
    method: 'POST',
    httpStatus: input.httpStatus,
    observedTxId: input.observedTxId,
    expectedTxId: input.expectedTxId,
    durableAttemptDigestHex: input.durableAttemptDigestHex,
    authorizationDigestHex: input.authorizationDigestHex,
    processBindingDigestHex: input.binding.processBindingDigestHex,
    reconciliationIdentityDigestHex:
      input.binding.executionTargetIdentityDigestHex,
    signedTransactionDigestHex: input.handle.signedTransactionDigestHex,
    signedTransactionBytesSha256Hex:
      input.handle.signedTransactionBytesSha256Hex,
    signedTransactionBytesLength: input.handle.signedTransactionBytesLength,
    checkResponseDigestHex: input.handle.checkResponseDigestHex,
  }, TRANSPORT_PROFILES[version].domain);
}

function canonicalTxId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/^0x/iu, '').toLowerCase();
  return /^[0-9a-f]{64}$/u.test(normalized) ? normalized : null;
}

function finiteHttpStatus(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 100
    && Number(value) <= 599
    ? Number(value)
    : null;
}
