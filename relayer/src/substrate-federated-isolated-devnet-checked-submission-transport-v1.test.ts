import { beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => {
  const expectedTxId = '03'.repeat(32);
  const signedTransactionDigestHex = '05'.repeat(32);
  const signedTransactionBytesSha256Hex = '15'.repeat(32);
  const checkResponseDigestHex = '06'.repeat(32);
  const nodeOrigin = 'http://127.0.0.1:9051' as const;
  const signedCandidate = Object.freeze({
    profile: 'synthetic-signed-candidate',
    txId: expectedTxId,
    nodeOrigin,
    signedTransactionDigestHex,
    signedTransactionBytesSha256Hex,
    signedTransactionBytesLength: 321,
    signerContext: Object.freeze({ profile: 'synthetic-signer' }),
  });
  const checkedHandle = Object.freeze({
    profile: 'e2s.local-wasm-checked-submission-handle.v1',
    txId: expectedTxId,
    nodeOrigin,
    signedTransactionDigestHex,
    signedTransactionBytesSha256Hex,
    signedTransactionBytesLength: 321,
    checkResponseDigestHex,
    checkerIdentity: Object.freeze({
      nodeOrigin,
      path: '/transactions/check',
      method: 'POST',
      transportPolicy: 'no-redirect-no-proxy',
    }),
  });
  const authorizer = Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-genesis-broadcast-authorizer.v1',
  });
  const authorizationArtifact = Object.freeze({
    role: 'lab-authorization',
  });
  return {
    expectedTxId,
    signedTransactionDigestHex,
    signedTransactionBytesSha256Hex,
    checkResponseDigestHex,
    nodeOrigin,
    signedCandidate,
    checkedHandle,
    authorizer,
    authorizationArtifact,
    handleProcessBindingDigestHex: '11'.repeat(32),
    handleExecutionTargetIdentityDigestHex: '10'.repeat(32),
    signedTransaction: Object.freeze({ id: expectedTxId, proofs: ['opaque'] }),
    consumed: false,
    consume: vi.fn(),
  };
});

const node = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock(
  './substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1: (
      value: unknown,
      target: unknown,
    ) => {
      if (
        value !== boundary.authorizer
        || target !== processBoundary.target
      ) {
        throw new Error('synthetic broadcast authorizer provenance is missing');
      }
    },
    assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV1: (
      value: unknown,
      artifact: unknown,
      expectation: Readonly<{ authorizationDigestHex: string }>,
    ) => {
      if (
        value !== boundary.authorizer
        || artifact !== boundary.authorizationArtifact
        || expectation.authorizationDigestHex !== AUTHORIZATION_DIGEST
      ) {
        throw new Error('synthetic broadcast authorization is missing');
      }
    },
  }),
);

const processBoundary = vi.hoisted(() => ({
  reconciliationIdentityDigestHex: '10'.repeat(32),
  processBindingDigestHex: '11'.repeat(32),
  assertionCount: 0,
  expireAfterAssertion: Number.POSITIVE_INFINITY,
  target: Object.freeze({
    primaryNodeOrigin: 'http://127.0.0.1:9051' as const,
    witnessNodeOrigin: 'http://127.0.0.1:9052' as const,
    primaryMining: true as const,
    witnessReadOnly: true as const,
  }),
}));

vi.mock('./fleet-signer.js', () => ({
  assertLocalWasmSignedCheckCandidateProvenance: (value: unknown) => {
    if (value !== boundary.signedCandidate) {
      throw new Error('synthetic signed candidate provenance is missing');
    }
  },
  assertLocalWasmCheckedSubmissionHandleV1Provenance: (value: unknown) => {
    if (value !== boundary.checkedHandle || boundary.consumed) {
      throw new Error('synthetic checked handle provenance is missing');
    }
  },
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding: (
    value: unknown,
    binding: Readonly<{
      processBindingDigestHex: string;
      executionTargetIdentityDigestHex: string;
    }>,
  ) => {
    if (
      value !== boundary.checkedHandle
      || binding.processBindingDigestHex
        !== boundary.handleProcessBindingDigestHex
      || binding.executionTargetIdentityDigestHex
        !== boundary.handleExecutionTargetIdentityDigestHex
    ) {
      throw new Error('synthetic checked handle execution binding changed');
    }
  },
  consumeLocalWasmCheckedSubmissionHandleV1: boundary.consume,
}));

vi.mock('axios', () => ({
  default: {
    post: node.post,
    isAxiosError: (error: unknown) =>
      typeof error === 'object'
      && error !== null
      && (error as { isAxiosError?: unknown }).isAxiosError === true,
  },
}));

vi.mock('./substrate-federated-isolated-devnet-ergo-node-process-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1: (
    value: unknown,
  ) => {
    processBoundary.assertionCount += 1;
    if (
      value !== processBoundary.target
      || processBoundary.assertionCount > processBoundary.expireAfterAssertion
    ) {
      throw new Error('synthetic execution target provenance is missing');
    }
    return Object.freeze({
      processBindingDigestHex: processBoundary.processBindingDigestHex,
      executionTargetIdentityDigestHex:
        processBoundary.reconciliationIdentityDigestHex,
    });
  },
}));

import {
  createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1,
} from './substrate-federated-isolated-devnet-checked-submission-transport-v1.js';
import {
  executeSubstrateFederatedLocalDevnetGenesisV1,
  type SubstrateFederatedLocalDevnetGenesisExecutionPorts,
} from './relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';

const PLAN_DIGEST = '01'.repeat(32);
const GENESIS_HEADER_ID = '02'.repeat(32);
const SOURCE_BOX_ID = '04'.repeat(32);
const POST_CHECK_DIGEST = '07'.repeat(32);
const PRE_TRANSPORT_DIGEST = '08'.repeat(32);
const AUTHORIZATION_DIGEST = '09'.repeat(32);
const ATTEMPT_DIGEST = '0a'.repeat(32);
const JOURNAL_DIGEST = '0c'.repeat(32);
const CONFIRMATION_DIGEST = '0d'.repeat(32);

beforeEach(() => {
  processBoundary.processBindingDigestHex = '11'.repeat(32);
  processBoundary.reconciliationIdentityDigestHex = '10'.repeat(32);
  processBoundary.assertionCount = 0;
  processBoundary.expireAfterAssertion = Number.POSITIVE_INFINITY;
  boundary.consumed = false;
  boundary.consume.mockReset();
  boundary.consume.mockImplementation(async (
    handle: unknown,
    signedCandidate: unknown,
    consume: (signedTransaction: Readonly<Record<string, unknown>>) =>
      Promise<unknown>,
  ) => {
    if (
      handle !== boundary.checkedHandle
      || signedCandidate !== boundary.signedCandidate
      || boundary.consumed
    ) {
      throw new Error('synthetic checked handle is unavailable');
    }
    boundary.consumed = true;
    return await consume(boundary.signedTransaction);
  });
  node.post.mockReset();
});

function ports(overrides: Readonly<{
  signedTransactionDigestHex?: string;
  checkResponseDigestHex?: string;
  authorizationArtifact?: object;
}> = {}): SubstrateFederatedLocalDevnetGenesisExecutionPorts {
  return {
    signer: {
      sign: async () => ({
        signedTransactionDigestHex: overrides.signedTransactionDigestHex
          ?? boundary.signedTransactionDigestHex,
        signerArtifact: boundary.signedCandidate,
      }),
    },
    checker: {
      check: async () => ({
        checkResponseDigestHex: overrides.checkResponseDigestHex
          ?? boundary.checkResponseDigestHex,
        checkerArtifact: boundary.checkedHandle,
      }),
    },
    revalidator: {
      revalidate: async (_checked, phase) => ({
        sourceBoxId: SOURCE_BOX_ID,
        sourceBoxUnspent: true,
        targetGenesisHeaderIdHex: GENESIS_HEADER_ID,
        observedAtHeight: phase === 'post-check' ? 720 : 721,
        observedTipHeaderIdHex: '91'.repeat(32),
        sourceBoxDigestHex: '92'.repeat(32),
        sourceBoxSigmaSerializedSha256Hex: '93'.repeat(32),
        observationDigestHex: phase === 'post-check'
          ? POST_CHECK_DIGEST
          : PRE_TRANSPORT_DIGEST,
        revalidationArtifact: Object.freeze({ phase }),
      }),
    },
    broadcastAuthorizer: {
      authorize: () => ({
        authorizationDigestHex: AUTHORIZATION_DIGEST,
        authorizationArtifact: overrides.authorizationArtifact
          ?? boundary.authorizationArtifact,
      }),
    },
    journal: {
      reserve: () => ({
        durableAttemptDigestHex: ATTEMPT_DIGEST,
        reconciliationIdentityDigestHex:
          processBoundary.reconciliationIdentityDigestHex,
        durableArtifact: Object.freeze({ role: 'durable-attempt' }),
      }),
      finalize: ({ submission }) => ({
        status: submission.status,
        journalDigestHex: JOURNAL_DIGEST,
      }),
      confirm: () => {
        throw new Error('not-found transaction cannot be confirmed');
      },
    },
    transport:
      createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1(
        processBoundary.target,
        boundary.authorizer as any,
      ),
    confirmationObserver: {
      observe: async () => ({
        status: 'not_found',
        confirmations: 0,
        observedAtHeight: 721,
        observationDigestHex: CONFIRMATION_DIGEST,
        confirmationHeight: null,
        confirmationHeaderIdHex: null,
        observerArtifact: Object.freeze({ role: 'confirmation-observer' }),
      }),
    },
  };
}

async function execute(overrides: Readonly<{
  expectedTxId?: string;
  signedTransactionDigestHex?: string;
  checkResponseDigestHex?: string;
  authorizationArtifact?: object;
}> = {}) {
  return await executeSubstrateFederatedLocalDevnetGenesisV1({
    role: 'tracker',
    planDigestHex: PLAN_DIGEST,
    targetGenesisHeaderIdHex: GENESIS_HEADER_ID,
    expectedTxId: overrides.expectedTxId ?? boundary.expectedTxId,
    sourceBoxId: SOURCE_BOX_ID,
    inputBoxIds: [SOURCE_BOX_ID],
    attemptedAtHeight: 720,
    nodeOrigin: boundary.nodeOrigin,
    unsignedTransaction: Object.freeze({ inputs: [{ boxId: SOURCE_BOX_ID }] }),
  }, ports(overrides));
}

describe('isolated devnet checked submission transport V1', () => {
  it('posts the exact checked object once to the credential-free loopback endpoint', async () => {
    node.post.mockResolvedValue({
      status: 200,
      data: boundary.expectedTxId,
    });

    await expect(execute()).resolves.toMatchObject({
      status: 'accepted',
      submittedTxId: boundary.expectedTxId,
      confirmationStatus: 'not_found',
    });
    expect(node.post).toHaveBeenCalledTimes(1);
    expect(node.post).toHaveBeenCalledWith(
      'http://127.0.0.1:9051/transactions',
      boundary.signedTransaction,
      {
        headers: { 'Content-Type': 'application/json' },
        maxRedirects: 0,
        proxy: false,
        timeout: 30_000,
        maxContentLength: 1_024,
      },
    );
    expect(JSON.stringify(node.post.mock.calls[0]?.[2])).not.toMatch(
      /api[_-]?key|authorization|cookie|proxy.*true/i,
    );
  });

  it('contains a forged authorization before consuming signed bytes', async () => {
    node.post.mockResolvedValue({
      status: 200,
      data: boundary.expectedTxId,
    });

    await expect(execute({
      authorizationArtifact: Object.freeze({ role: 'forged-authorization' }),
    })).resolves.toMatchObject({
      status: 'ambiguous',
      submittedTxId: null,
      confirmationStatus: 'not_found',
    });
    expect(boundary.consumed).toBe(false);
    expect(boundary.consume).not.toHaveBeenCalled();
    expect(node.post).not.toHaveBeenCalled();
  });

  it('contains a handle checked under a replaced execution process', async () => {
    processBoundary.processBindingDigestHex = '12'.repeat(32);
    node.post.mockResolvedValue({
      status: 200,
      data: boundary.expectedTxId,
    });

    await expect(execute()).resolves.toMatchObject({
      status: 'ambiguous',
      submittedTxId: null,
      transportAttempted: true,
    });
    expect(boundary.consume).not.toHaveBeenCalled();
    expect(node.post).not.toHaveBeenCalled();
  });

  it('keeps HTTP 400 ambiguous because the exact transaction may already be in mempool', async () => {
    node.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: 'private node diagnostic' },
    });

    await expect(execute()).resolves.toMatchObject({
      status: 'ambiguous',
      submittedTxId: null,
      confirmationStatus: 'not_found',
    });
    expect(node.post).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['timeout without a response', { isAxiosError: true, code: 'ETIMEDOUT' }],
    ['retryable 429 response', { isAxiosError: true, response: { status: 429 } }],
    ['server error after request receipt', { isAxiosError: true, response: { status: 500 } }],
  ])('classifies %s as ambiguous and never retries', async (_name, error) => {
    node.post.mockRejectedValue(error);

    await expect(execute()).resolves.toMatchObject({
      status: 'ambiguous',
      submittedTxId: null,
      confirmationStatus: 'not_found',
    });
    expect(node.post).toHaveBeenCalledTimes(1);
  });

  it('treats a successful response with another transaction ID as ambiguous', async () => {
    node.post.mockResolvedValue({ status: 200, data: 'ff'.repeat(32) });

    await expect(execute()).resolves.toMatchObject({
      status: 'ambiguous',
      submittedTxId: null,
    });
    expect(node.post).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['expected transaction ID', { expectedTxId: 'e1'.repeat(32) }],
    ['signed transaction digest', { signedTransactionDigestHex: 'e2'.repeat(32) }],
    ['check response digest', { checkResponseDigestHex: 'e3'.repeat(32) }],
  ])('rejects %s drift before POST', async (_name, overrides) => {
    node.post.mockResolvedValue({
      status: 200,
      data: boundary.expectedTxId,
    });

    await expect(execute(overrides)).resolves.toMatchObject({
      status: 'ambiguous',
      submittedTxId: null,
    });
    expect(node.post).not.toHaveBeenCalled();
  });

  it('cannot reuse the same checked handle after a timeout with unknown effect', async () => {
    node.post
      .mockRejectedValueOnce({ isAxiosError: true, code: 'ETIMEDOUT' })
      .mockResolvedValue({
        status: 200,
        data: boundary.expectedTxId,
      });

    await expect(execute()).resolves.toMatchObject({
      status: 'ambiguous',
      submittedTxId: null,
    });
    await expect(execute()).resolves.toMatchObject({
      status: 'ambiguous',
      submittedTxId: null,
    });
    expect(node.post).toHaveBeenCalledTimes(1);
  });

  it('rejects an execution target that expires after transport construction', async () => {
    processBoundary.expireAfterAssertion = 1;

    await expect(execute()).resolves.toMatchObject({
      status: 'ambiguous',
      submittedTxId: null,
    });
    expect(node.post).not.toHaveBeenCalled();
    expect(boundary.consume).not.toHaveBeenCalled();
  });
});
