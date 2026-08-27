import axios from 'axios';

import { sha256CanonicalJson } from '../../ergo-settlement-core/strict-json.js';
import {
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding,
  assertLocalWasmCheckedSubmissionHandleV1Provenance,
  assertLocalWasmSignedCheckCandidateProvenance,
  consumeLocalWasmCheckedSubmissionHandleV1,
  type LocalWasmCheckedSubmissionHandleV1,
  type LocalWasmExactBytesSignedCheckCandidate,
} from '../../fleet-signer.js';
import type {
  SubstrateFederatedLocalDevnetGenesisSubmission,
} from '../../relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';
import {
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
} from '../../relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKED_SUBMISSION_TRANSPORT_V1_SCHEMA,
} from '../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV1,
  type SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1,
  type SubstrateFederatedIsolatedDevnetTrackerTransportTargetV1,
} from '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1,
  type SubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1,
} from '../../substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import {
  assertSubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1,
  claimSubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1,
  consumeSubstrateFederatedIsolatedDevnetTrackerTransportPreflightV1,
  issueSubstrateFederatedIsolatedDevnetTrackerTransportResultV1,
  type SubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1,
  type SubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1,
  type SubstrateFederatedIsolatedDevnetTrackerTransportJournalV1,
  type SubstrateFederatedIsolatedDevnetTrackerTransportPreflightV1,
  type SubstrateFederatedIsolatedDevnetTrackerTransportResultV1,
} from './substrate-federated-isolated-devnet-tracker-transport-attempt-v1.js';

const SUBMISSION_PATH = '/transactions' as const;
const SUBMISSION_TIMEOUT_MS = 30_000;
const SUBMISSION_RESPONSE_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKED_SUBMISSION_RESPONSE_V1';

type AcceptedOrAmbiguousSubmission = Exclude<
  SubstrateFederatedLocalDevnetGenesisSubmission,
  Readonly<{ status: 'rejected' }>
>;

/**
 * Consume one exact tracker check only after its immutable attempt is durable.
 * The HTTP result is transport evidence only; canonical admission is observed
 * by a later, separate lifecycle step.
 */
export async function submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1(
  input: Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportTargetV1>;
    executionCheck:
      Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1>;
    authorization:
      Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1>;
    journal:
      Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportJournalV1>;
    attempt:
      Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1>;
    preflight:
      Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportPreflightV1>;
  }>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetTrackerTransportResultV1>> {
  const binding =
    assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV1(
      input.target,
    );
  const checkedBinding =
    assertSubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1(
      input.executionCheck,
      input.target,
    );
  assertSubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1(
    input.authorization,
    input.target,
    input.executionCheck,
  );
  if (
    input.target.primaryNodeOrigin
      !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN
    || input.target.primaryMining !== false
    || input.target.witnessReadOnly !== true
    || input.target.miningStopped !== true
    || input.target.checkpointBound !== true
    || input.target.reservationFreshnessCheckBound !== true
    || input.target.trackerTransport !== true
    || checkedBinding.processBindingDigestHex
      !== binding.processBindingDigestHex
    || checkedBinding.executionTargetIdentityDigestHex
      !== binding.executionTargetIdentityDigestHex
    || input.authorization.processBindingDigestHex
      !== binding.processBindingDigestHex
    || input.authorization.executionTargetIdentityDigestHex
      !== binding.executionTargetIdentityDigestHex
  ) {
    throw new Error('isolated tracker transport target binding changed');
  }

  const signedCandidate = input.executionCheck.signedCandidate;
  assertLocalWasmSignedCheckCandidateProvenance(signedCandidate);
  const exactSignedCandidate =
    signedCandidate as LocalWasmExactBytesSignedCheckCandidate;
  const submissionHandle =
    input.executionCheck.checkedAcceptance.submissionHandle;
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
    input.authorization.expectedTransactionIdHex,
    input.target.primaryNodeOrigin,
    input.authorization.signedTransactionDigestHex,
    input.authorization.checkResponseDigestHex,
  );
  if (
    exactSignedCandidate.signedTransactionBytesSha256Hex
      !== input.authorization.signedTransactionBytesSha256Hex
    || exactSignedCandidate.signedTransactionBytesLength
      !== input.authorization.signedTransactionBytesLength
    || input.attempt.expectedTransactionIdHex
      !== input.authorization.expectedTransactionIdHex
    || input.attempt.authorization !== input.authorization
  ) {
    throw new Error('isolated tracker transport signed binding changed');
  }

  const persisted =
    claimSubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1(
      input.journal,
      input.attempt,
      input.authorization,
    );
  if (
    persisted.status !== 'pending'
    || persisted.expectedTransactionIdHex
      !== input.authorization.expectedTransactionIdHex
    || persisted.durableAttemptDigestHex
      !== input.attempt.durableAttemptDigestHex
  ) {
    throw new Error('isolated tracker transport durable attempt changed');
  }

  const submission = await consumeLocalWasmCheckedSubmissionHandleV1(
    exactHandle,
    exactSignedCandidate,
    async signedTransaction => {
      consumeSubstrateFederatedIsolatedDevnetTrackerTransportPreflightV1(
        input.preflight,
        {
          target: input.target,
          executionCheck: input.executionCheck,
          authorization: input.authorization,
          journal: input.journal,
          attempt: input.attempt,
        },
      );
      return await submitExactTransaction(
        signedTransaction,
        input.authorization.expectedTransactionIdHex,
        input.attempt.durableAttemptDigestHex,
        input.authorization.authorizationDigestHex,
        exactHandle,
        binding,
      );
    },
  );
  if (
    typeof submission.responseDigestHex !== 'string'
    || !/^[0-9a-f]{64}$/u.test(submission.responseDigestHex)
  ) {
    throw new Error('isolated tracker transport response digest is missing');
  }
  return issueSubstrateFederatedIsolatedDevnetTrackerTransportResultV1(
    input.journal,
    input.attempt,
    Object.freeze({
    status: submission.status,
    submittedTransactionIdHex: submission.submittedTxId,
    responseDigestHex: submission.responseDigestHex,
    }),
  );
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
      });
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
      }),
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
    });
  }
}

function ambiguousResponse(
  input: SubmissionDigestInput,
): AcceptedOrAmbiguousSubmission {
  return Object.freeze({
    status: 'ambiguous' as const,
    submittedTxId: null,
    responseDigestHex: responseDigest(input),
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

function responseDigest(input: SubmissionDigestInput): string {
  return sha256CanonicalJson({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKED_SUBMISSION_TRANSPORT_V1_SCHEMA,
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
  }, SUBMISSION_RESPONSE_DIGEST_DOMAIN);
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
