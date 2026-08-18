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
  assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1,
  type SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1,
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

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKED_SUBMISSION_TRANSPORT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-checked-submission-transport.v1' as const;

const SUBMISSION_PATH = '/transactions' as const;
const SUBMISSION_TIMEOUT_MS = 30_000;
const SUBMISSION_RESPONSE_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKED_SUBMISSION_RESPONSE_V1';

type Transport =
  SubstrateFederatedLocalDevnetGenesisExecutionPorts['transport'];
type PegInSubmitter =
  ErgoOperationalTransactionExecutionPorts['submitter'];
type AcceptedOrAmbiguousSubmission = Exclude<
  SubstrateFederatedLocalDevnetGenesisSubmission,
  Readonly<{ status: 'rejected' }>
>;

/**
 * Create the only transport that may consume a FED-6-LAB checked submission
 * handle. It is credential-free, exact-origin, one-shot, and never retries.
 */
export function createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1(
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  authorizer:
    Readonly<SubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1>,
): Readonly<Transport> {
  const binding =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1(
    authorizer,
    target,
  );
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
      assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV1(
        authorizer,
        attempt.candidate.authorization.authorizationArtifact,
        {
          revalidated: attempt.candidate.authorization.revalidated,
          preTransportEvidence:
            attempt.candidate.authorization.preTransportEvidence,
          authorizationDigestHex:
            attempt.candidate.authorization.authorizationDigestHex,
        },
      );
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
