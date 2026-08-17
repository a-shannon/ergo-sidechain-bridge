import axios from 'axios';

import { sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import {
  assertLocalWasmCheckedSubmissionHandleV1Provenance,
  assertLocalWasmSignedCheckCandidateProvenance,
  consumeLocalWasmCheckedSubmissionHandleV1,
  type LocalWasmCheckedSubmissionHandleV1,
  type LocalWasmExactBytesSignedCheckCandidate,
} from './fleet-signer.js';
import {
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
  assertSubstrateFederatedLocalDevnetGenesisDurableAttemptV1,
  type SubstrateFederatedLocalDevnetGenesisExecutionPorts,
  type SubstrateFederatedLocalDevnetGenesisSubmission,
} from './relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKED_SUBMISSION_TRANSPORT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-checked-submission-transport.v1' as const;

const SUBMISSION_PATH = '/transactions' as const;
const SUBMISSION_TIMEOUT_MS = 30_000;
const SUBMISSION_RESPONSE_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKED_SUBMISSION_RESPONSE_V1';

type Transport =
  SubstrateFederatedLocalDevnetGenesisExecutionPorts['transport'];

/**
 * Create the only transport that may consume a FED-6-LAB checked submission
 * handle. It is credential-free, exact-origin, one-shot, and never retries.
 */
export function createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1():
  Readonly<Transport> {
  return Object.freeze({
    submit: async attempt => {
      assertSubstrateFederatedLocalDevnetGenesisDurableAttemptV1(attempt);
      const checked =
        attempt.candidate.authorization.revalidated.checked;
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
): Promise<SubstrateFederatedLocalDevnetGenesisSubmission> {
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
    });
  }
}

function ambiguousResponse(
  input: SubmissionDigestInput,
): SubstrateFederatedLocalDevnetGenesisSubmission {
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
