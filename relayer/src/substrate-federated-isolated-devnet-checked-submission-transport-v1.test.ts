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
  const sourceLockAuthorizer = Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer.v1',
  });
  const committedVaultAuthorizer = Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-broadcast-authorizer.v1',
  });
  const authorizationArtifact = Object.freeze({
    role: 'lab-authorization',
  });
  const sourceLockAuthorizationArtifact = Object.freeze({
    role: 'source-lock-lab-authorization',
  });
  const committedVaultAuthorizationArtifact = Object.freeze({
    role: 'committed-vault-lab-authorization',
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
    sourceLockAuthorizer,
    committedVaultAuthorizer,
    authorizationArtifact,
    sourceLockAuthorizationArtifact,
    committedVaultAuthorizationArtifact,
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

const journalBoundary = vi.hoisted(() => ({
  durableArtifact: Object.freeze({ role: 'committed-vault-durable-attempt' }),
  assertDurableAttempt: vi.fn(),
}));

const trackerBoundary = vi.hoisted(() => ({
  target: Object.freeze({
    primaryNodeOrigin: 'http://127.0.0.1:9051' as const,
    witnessNodeOrigin: 'http://127.0.0.1:9052' as const,
    primaryMining: false as const,
    witnessReadOnly: true as const,
    miningStopped: true as const,
    checkpointBound: true as const,
    reservationFreshnessCheckBound: true as const,
    trackerTransport: true as const,
  }),
  authorization: Object.freeze({
    expectedTransactionIdHex: '03'.repeat(32),
    processBindingDigestHex: '11'.repeat(32),
    executionTargetIdentityDigestHex: '10'.repeat(32),
    signedTransactionDigestHex: '05'.repeat(32),
    signedTransactionBytesSha256Hex: '15'.repeat(32),
    signedTransactionBytesLength: 321,
    checkResponseDigestHex: '06'.repeat(32),
    authorizationDigestHex: '18'.repeat(32),
  }),
  journal: Object.freeze({ role: 'tracker-transport-journal' }),
  attempt: undefined as unknown,
  preflight: undefined as unknown,
  executionCheck: undefined as unknown,
  persisted: undefined as unknown,
  claimed: false,
  events: [] as string[],
  beforeCheckedCallback: vi.fn(),
  assertAuthorization: vi.fn(),
  assertExecutionCheck: vi.fn(),
  consumePreflight: vi.fn(),
  claimAttempt: vi.fn(),
  issueResult: vi.fn(),
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

vi.mock(
  './substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer-v1.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1: (
      value: unknown,
      target: unknown,
    ) => {
      if (
        value !== boundary.sourceLockAuthorizer
        || target !== processBoundary.target
      ) {
        throw new Error('synthetic source-lock authorizer provenance is missing');
      }
    },
    assertSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizationArtifactV1: (
      value: unknown,
      authorization: Readonly<{ authorizationArtifact?: unknown }>,
    ) => {
      if (
        value !== boundary.sourceLockAuthorizer
        || authorization.authorizationArtifact
          !== boundary.sourceLockAuthorizationArtifact
      ) {
        throw new Error('synthetic source-lock authorization is missing');
      }
    },
  }),
);

vi.mock(
  './substrate-federated-isolated-devnet-peg-in-committed-vault-broadcast-authorizer-v1.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizerV1: (
      value: unknown,
      target: unknown,
    ) => {
      if (
        value !== boundary.committedVaultAuthorizer
        || target !== processBoundary.target
      ) {
        throw new Error(
          'synthetic committed-vault authorizer provenance is missing',
        );
      }
    },
    assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizationArtifactV1: (
      value: unknown,
      authorization: Readonly<{ authorizationArtifact?: unknown }>,
    ) => {
      if (
        value !== boundary.committedVaultAuthorizer
        || authorization.authorizationArtifact
          !== boundary.committedVaultAuthorizationArtifact
      ) {
        throw new Error(
          'synthetic committed-vault authorization is missing',
        );
      }
    },
  }),
);

vi.mock(
  './substrate-federated-local-devnet-peg-in-committed-vault-journal-v1.js',
  () => ({
    assertSubstrateFederatedLocalDevnetPegInCommittedVaultDurableAttemptV1:
      journalBoundary.assertDurableAttempt,
  }),
);

vi.mock(
  './substrate-federated-isolated-devnet-setup-check-execution-v2.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1:
      trackerBoundary.assertExecutionCheck,
  }),
);

vi.mock(
  './apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-transport-attempt-v1.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1:
      trackerBoundary.assertAuthorization,
    consumeSubstrateFederatedIsolatedDevnetTrackerTransportPreflightV1:
      trackerBoundary.consumePreflight,
    claimSubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1:
      trackerBoundary.claimAttempt,
    issueSubstrateFederatedIsolatedDevnetTrackerTransportResultV1:
      trackerBoundary.issueResult,
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
  assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV1: (
    value: unknown,
  ) => {
    if (value !== trackerBoundary.target) {
      throw new Error('synthetic tracker transport target is missing');
    }
    return Object.freeze({
      processBindingDigestHex: processBoundary.processBindingDigestHex,
      executionTargetIdentityDigestHex:
        processBoundary.reconciliationIdentityDigestHex,
      reservationFreshnessProcessBindingDigestHex: '19'.repeat(32),
      reservationFreshnessExecutionTargetIdentityDigestHex: '1a'.repeat(32),
    });
  },
}));

import {
  createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1,
  createSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckedSubmissionTransportV1,
  createSubstrateFederatedIsolatedDevnetPegInSourceLockCheckedSubmissionTransportV1,
} from './substrate-federated-isolated-devnet-checked-submission-transport-v1.js';
import {
  submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1,
} from './apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-checked-transport-v1.js';
import {
  PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
  executeErgoOperationalTransaction,
} from './relayer-core/ergo-operational-transaction-lifecycle.js';
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
const SOURCE_LOCK_BOX_ID = '16'.repeat(32);
const TRANSITION_FEE_BOX_ID = '17'.repeat(32);

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
    trackerBoundary.events.push('consume');
    await trackerBoundary.beforeCheckedCallback();
    return await consume(boundary.signedTransaction);
  });
  node.post.mockReset();
  journalBoundary.assertDurableAttempt.mockReset();
  journalBoundary.assertDurableAttempt.mockImplementation(
    (_authorizer, attempt) => {
      if (attempt.durableArtifact !== journalBoundary.durableArtifact) {
        throw new Error('synthetic durable journal provenance is missing');
      }
    },
  );
  trackerBoundary.claimed = false;
  trackerBoundary.events.length = 0;
  trackerBoundary.beforeCheckedCallback.mockReset();
  trackerBoundary.executionCheck = Object.freeze({
    signedCandidate: boundary.signedCandidate,
    checkedAcceptance: Object.freeze({
      submissionHandle: boundary.checkedHandle,
    }),
  });
  trackerBoundary.attempt = Object.freeze({
    expectedTransactionIdHex: boundary.expectedTxId,
    durableAttemptDigestHex: ATTEMPT_DIGEST,
    authorization: trackerBoundary.authorization,
  });
  trackerBoundary.preflight = Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-tracker-transport-preflight.v1',
  });
  trackerBoundary.persisted = Object.freeze({
    status: 'pending' as const,
    expectedTransactionIdHex: boundary.expectedTxId,
    durableAttemptDigestHex: ATTEMPT_DIGEST,
  });
  trackerBoundary.assertExecutionCheck.mockReset();
  trackerBoundary.assertExecutionCheck.mockImplementation(
    (value: unknown, target: unknown) => {
      if (
        value !== trackerBoundary.executionCheck
        || target !== trackerBoundary.target
      ) {
        throw new Error('synthetic tracker execution check is missing');
      }
      return Object.freeze({
        processBindingDigestHex: processBoundary.processBindingDigestHex,
        executionTargetIdentityDigestHex:
          processBoundary.reconciliationIdentityDigestHex,
      });
    },
  );
  trackerBoundary.assertAuthorization.mockReset();
  trackerBoundary.assertAuthorization.mockImplementation(
    (value: unknown, target: unknown, executionCheck: unknown) => {
      if (
        value !== trackerBoundary.authorization
        || target !== trackerBoundary.target
        || executionCheck !== trackerBoundary.executionCheck
      ) {
        throw new Error('synthetic tracker transport authorization is missing');
      }
    },
  );
  trackerBoundary.consumePreflight.mockReset();
  trackerBoundary.consumePreflight.mockImplementation(
    (value: unknown, input: Readonly<Record<string, unknown>>) => {
      if (
        value !== trackerBoundary.preflight
        || input.target !== trackerBoundary.target
        || input.executionCheck !== trackerBoundary.executionCheck
        || input.authorization !== trackerBoundary.authorization
        || input.journal !== trackerBoundary.journal
        || input.attempt !== trackerBoundary.attempt
      ) {
        throw new Error('synthetic tracker transport preflight is missing');
      }
      if ((trackerBoundary.persisted as { status: string }).status !== 'pending') {
        throw new Error('tracker transport preflight durable state changed');
      }
      trackerBoundary.events.push('preflight');
    },
  );
  trackerBoundary.claimAttempt.mockReset();
  trackerBoundary.claimAttempt.mockImplementation(
    (journal: unknown, attempt: unknown, authorization: unknown) => {
      if (
        journal !== trackerBoundary.journal
        || attempt !== trackerBoundary.attempt
        || authorization !== trackerBoundary.authorization
        || trackerBoundary.claimed
      ) {
        throw new Error('synthetic durable tracker attempt is unavailable');
      }
      trackerBoundary.claimed = true;
      trackerBoundary.events.push('claim');
      return trackerBoundary.persisted;
    },
  );
  trackerBoundary.issueResult.mockReset();
  trackerBoundary.issueResult.mockImplementation(
    (journal: unknown, attempt: unknown, submission: any) => {
      if (
        journal !== trackerBoundary.journal
        || attempt !== trackerBoundary.attempt
        || !trackerBoundary.claimed
      ) {
        throw new Error('synthetic tracker transport result is unavailable');
      }
      trackerBoundary.events.push('issue-result');
      return Object.freeze({
        ...submission,
        resultArtifact: Object.freeze({ role: 'tracker-transport-result' }),
      });
    },
  );
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
  it('claims the durable tracker attempt before one exact loopback POST', async () => {
    node.post.mockImplementation(async () => {
      trackerBoundary.events.push('post');
      return { status: 200, data: boundary.expectedTxId };
    });

    await expect(
      submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1({
        target: trackerBoundary.target,
        executionCheck: trackerBoundary.executionCheck as any,
        authorization: trackerBoundary.authorization as any,
        journal: trackerBoundary.journal as any,
        attempt: trackerBoundary.attempt as any,
        preflight: trackerBoundary.preflight as any,
      }),
    ).resolves.toMatchObject({
      status: 'accepted',
      submittedTransactionIdHex: boundary.expectedTxId,
      responseDigestHex: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
    expect(trackerBoundary.events).toEqual([
      'claim',
      'consume',
      'preflight',
      'post',
      'issue-result',
    ]);
    expect(node.post).toHaveBeenCalledTimes(1);
    expect(node.post.mock.calls[0]?.[0]).toBe(
      'http://127.0.0.1:9051/transactions',
    );
    expect(node.post.mock.calls[0]?.[1]).toBe(boundary.signedTransaction);
  });

  it('rejects durable-state drift after claim and before the checked callback POST', async () => {
    trackerBoundary.beforeCheckedCallback.mockImplementationOnce(() => {
      trackerBoundary.persisted = Object.freeze({
        status: 'ambiguous' as const,
        expectedTransactionIdHex: boundary.expectedTxId,
        durableAttemptDigestHex: ATTEMPT_DIGEST,
      });
    });

    await expect(
      submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1({
        target: trackerBoundary.target,
        executionCheck: trackerBoundary.executionCheck as any,
        authorization: trackerBoundary.authorization as any,
        journal: trackerBoundary.journal as any,
        attempt: trackerBoundary.attempt as any,
        preflight: trackerBoundary.preflight as any,
      }),
    ).rejects.toThrow(/preflight durable state changed/u);
    expect(trackerBoundary.events).toEqual(['claim', 'consume']);
    expect(trackerBoundary.consumePreflight).toHaveBeenCalledOnce();
    expect(node.post).not.toHaveBeenCalled();
    expect(trackerBoundary.issueResult).not.toHaveBeenCalled();
  });

  it('keeps an uncertain tracker POST ambiguous and cannot claim it twice', async () => {
    node.post.mockRejectedValue({ isAxiosError: true, code: 'ETIMEDOUT' });
    const input = {
      target: trackerBoundary.target,
      executionCheck: trackerBoundary.executionCheck as any,
      authorization: trackerBoundary.authorization as any,
      journal: trackerBoundary.journal as any,
      attempt: trackerBoundary.attempt as any,
      preflight: trackerBoundary.preflight as any,
    };

    await expect(
      submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1(input),
    ).resolves.toMatchObject({
      status: 'ambiguous',
      submittedTransactionIdHex: null,
    });
    await expect(
      submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1(input),
    ).rejects.toThrow(/checked handle provenance is missing/);
    expect(trackerBoundary.claimAttempt).toHaveBeenCalledTimes(1);
    expect(node.post).toHaveBeenCalledTimes(1);
  });

  it('rejects copied tracker transport authority before claim or POST', async () => {
    await expect(
      submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1({
        target: trackerBoundary.target,
        executionCheck: trackerBoundary.executionCheck as any,
        authorization: { ...trackerBoundary.authorization } as any,
        journal: trackerBoundary.journal as any,
        attempt: trackerBoundary.attempt as any,
        preflight: trackerBoundary.preflight as any,
      }),
    ).rejects.toThrow(/transport authorization is missing/);
    expect(trackerBoundary.claimAttempt).not.toHaveBeenCalled();
    expect(trackerBoundary.consumePreflight).not.toHaveBeenCalled();
    expect(boundary.consume).not.toHaveBeenCalled();
    expect(node.post).not.toHaveBeenCalled();
  });

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

  it('uses the same exact-byte one-shot transport for the dedicated source-lock authorization', async () => {
    node.post.mockResolvedValue({
      status: 200,
      data: boundary.expectedTxId,
    });
    const transport =
      createSubstrateFederatedIsolatedDevnetPegInSourceLockCheckedSubmissionTransportV1(
        processBoundary.target,
        boundary.sourceLockAuthorizer as any,
      );

    const result = await executeErgoOperationalTransaction({
      operationProfile:
        'e2s.substrate-federated-local-devnet-peg-in-source-lock-operation.v1',
      expectedTxId: boundary.expectedTxId,
      sourceBoxId: SOURCE_BOX_ID,
      inputBoxIds: [SOURCE_BOX_ID],
      attemptedAtHeight: 720,
      targetSidechainHeight: null,
      targetSidechainBlockHashHex: null,
      heartbeatKeyHex: null,
      unsignedTransaction: Object.freeze({ inputs: [{ boxId: SOURCE_BOX_ID }] }),
    }, {
      signer: {
        sign: async () => ({
          nodeOrigin: boundary.nodeOrigin,
          signedTransactionDigestHex: boundary.signedTransactionDigestHex,
          signerArtifact: boundary.signedCandidate,
        }),
      },
      checker: {
        check: async () => ({
          checkResponseDigestHex: boundary.checkResponseDigestHex,
          checkerArtifact: boundary.checkedHandle,
        }),
      },
      revalidator: {
        revalidate: async () => ({ revalidationDigestHex: POST_CHECK_DIGEST }),
      },
      broadcastAuthorizer: {
        authorize: () => ({
          authorizationDigestHex: AUTHORIZATION_DIGEST,
          authorizationArtifact: boundary.sourceLockAuthorizationArtifact,
        }),
      },
      journal: {
        reserve: () => ({
          durableAttemptDigestHex: ATTEMPT_DIGEST,
          durableArtifact: Object.freeze({ role: 'source-lock-attempt' }),
        }),
        finalize: ({ submission }) => ({
          status: submission.status,
          journalDigestHex: JOURNAL_DIGEST,
        }),
      },
      submitter: transport,
    });

    expect(result).toMatchObject({
      status: 'accepted',
      expectedTxId: boundary.expectedTxId,
      submittedTxId: boundary.expectedTxId,
      durableAttemptRecorded: true,
    });
    expect(node.post).toHaveBeenCalledTimes(1);
    expect(node.post.mock.calls[0]?.[0]).toBe('http://127.0.0.1:9051/transactions');
    expect(node.post.mock.calls[0]?.[1]).toBe(boundary.signedTransaction);
  });

  it('uses the exact checked bytes once for the committed-vault authorization', async () => {
    node.post.mockResolvedValue({
      status: 200,
      data: boundary.expectedTxId,
    });
    const transport =
      createSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckedSubmissionTransportV1(
        processBoundary.target,
        boundary.committedVaultAuthorizer as any,
      );

    const result = await executeErgoOperationalTransaction({
      operationProfile: PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
      expectedTxId: boundary.expectedTxId,
      sourceBoxId: SOURCE_BOX_ID,
      inputBoxIds: [SOURCE_BOX_ID, SOURCE_LOCK_BOX_ID, TRANSITION_FEE_BOX_ID],
      attemptedAtHeight: 720,
      targetSidechainHeight: null,
      targetSidechainBlockHashHex: null,
      heartbeatKeyHex: null,
      unsignedTransaction: Object.freeze({
        inputs: [
          { boxId: SOURCE_BOX_ID },
          { boxId: SOURCE_LOCK_BOX_ID },
          { boxId: TRANSITION_FEE_BOX_ID },
        ],
      }),
    }, {
      signer: {
        sign: async () => ({
          nodeOrigin: boundary.nodeOrigin,
          signedTransactionDigestHex: boundary.signedTransactionDigestHex,
          signerArtifact: boundary.signedCandidate,
        }),
      },
      checker: {
        check: async () => ({
          checkResponseDigestHex: boundary.checkResponseDigestHex,
          checkerArtifact: boundary.checkedHandle,
        }),
      },
      revalidator: {
        revalidate: async () => ({ revalidationDigestHex: POST_CHECK_DIGEST }),
      },
      broadcastAuthorizer: {
        authorize: () => ({
          authorizationDigestHex: AUTHORIZATION_DIGEST,
          authorizationArtifact:
            boundary.committedVaultAuthorizationArtifact,
        }),
      },
      journal: {
        reserve: () => ({
          durableAttemptDigestHex: ATTEMPT_DIGEST,
          durableArtifact: journalBoundary.durableArtifact,
        }),
        finalize: ({ submission }) => ({
          status: submission.status,
          journalDigestHex: JOURNAL_DIGEST,
        }),
      },
      submitter: transport,
    });

    expect(result).toMatchObject({
      status: 'accepted',
      expectedTxId: boundary.expectedTxId,
      submittedTxId: boundary.expectedTxId,
      durableAttemptRecorded: true,
    });
    expect(node.post).toHaveBeenCalledTimes(1);
    expect(node.post.mock.calls[0]?.[0]).toBe(
      'http://127.0.0.1:9051/transactions',
    );
    expect(node.post.mock.calls[0]?.[1]).toBe(boundary.signedTransaction);
    expect(boundary.consume).toHaveBeenCalledTimes(1);
    expect(journalBoundary.assertDurableAttempt).toHaveBeenCalledTimes(1);
    expect(node.post).toHaveBeenCalledTimes(1);
  });

  it('rejects forged durability evidence before consuming bytes or posting', async () => {
    const transport =
      createSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckedSubmissionTransportV1(
        processBoundary.target,
        boundary.committedVaultAuthorizer as any,
      );

    const submission = await transport.submit({
      authorization: {
        revalidated: {
          checked: {
            signed: {
              admission: { expectedTxId: boundary.expectedTxId },
            },
          },
        },
      },
      durableAttemptDigestHex: ATTEMPT_DIGEST,
      durableArtifact: Object.freeze({ role: 'forged-attempt' }),
    } as never).then(
      () => 'submitted' as const,
      error => error as Error,
    );

    expect(submission).toBeInstanceOf(Error);
    expect((submission as Error).message).toMatch(/journal provenance is missing/);
    expect(boundary.consume).not.toHaveBeenCalled();
    expect(node.post).not.toHaveBeenCalled();
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
