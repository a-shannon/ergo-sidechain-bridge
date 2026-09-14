import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import {
  createSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1,
} from './adapters/substrate-federated-isolated-devnet-tracker-transport-response-v1.js';

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
    issuedSignedCandidate: signedCandidate,
    checkedHandle,
    authorizer,
    sourceLockAuthorizer,
    committedVaultAuthorizer,
    authorizationArtifact,
    sourceLockAuthorizationArtifact,
    committedVaultAuthorizationArtifact,
    handleProcessBindingDigestHex: '11'.repeat(32),
    handleExecutionTargetIdentityDigestHex: '10'.repeat(32),
    assertExecutionBinding: vi.fn(),
    signedTransaction: Object.freeze({ id: expectedTxId, proofs: ['opaque'] }),
    consumed: false,
    consume: vi.fn(),
  };
});

const node = vi.hoisted(() => ({
  post: vi.fn(),
}));

const genesisBoundary = vi.hoisted(() => ({
  authorizerNative: Object.freeze({
    schema: 'e2s.substrate-federated-native-genesis-broadcast-authorizer.v1',
  }),
  authorizationArtifactNative: Object.freeze({ role: 'native-authorization-v1' }),
  assertAuthorizerNative: vi.fn(),
  assertAuthorizationNative: vi.fn(),
  authorizerV2: Object.freeze({
    schema: 'e2s.substrate-federated-isolated-devnet-genesis-broadcast-authorizer.v2',
  }),
  authorizationArtifactV2: Object.freeze({ role: 'lab-authorization-v2' }),
  events: [] as string[],
  assertAuthorizerV1: vi.fn(),
  assertAuthorizerV2: vi.fn(),
  assertAuthorizationV1: vi.fn(),
  assertAuthorizationV2: vi.fn(),
}));

const journalBoundary = vi.hoisted(() => ({
  durableArtifact: Object.freeze({ role: 'committed-vault-durable-attempt' }),
  assertDurableAttempt: vi.fn(),
}));

const trackerBoundary = vi.hoisted(() => ({
  target: Object.freeze({
    primaryNodeOrigin: 'http://127.0.0.1:9051' as const,
    witnessNodeOrigin: 'http://127.0.0.1:9052' as const,
    primaryMining: true as const,
    witnessReadOnly: true as const,
    checkpointBound: true as const,
    reservationFreshnessCheckBound: true as const,
    trackerTransport: true as const,
    sameProcessCanonicalConfirmation: true as const,
    candidateMiningRequiresExpectedTransaction: true as const,
    expectedTransactionIdHex: '03'.repeat(32),
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
    assertSubstrateFederatedNativeGenesisBroadcastAuthorizerV1:
      genesisBoundary.assertAuthorizerNative,
    assertSubstrateFederatedNativeGenesisBroadcastAuthorizationArtifactV1:
      genesisBoundary.assertAuthorizationNative,
    assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1:
      genesisBoundary.assertAuthorizerV1,
    assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2:
      genesisBoundary.assertAuthorizerV2,
    assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV1:
      genesisBoundary.assertAuthorizationV1,
    assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV2:
      genesisBoundary.assertAuthorizationV2,
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
  reservationFreshnessProcessBindingDigestHex: '19'.repeat(32),
  reservationFreshnessExecutionTargetIdentityDigestHex: '1a'.repeat(32),
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
    genesisBoundary.events.push('signed-candidate');
    if (value !== boundary.issuedSignedCandidate) {
      throw new Error('synthetic signed candidate provenance is missing');
    }
  },
  assertLocalWasmCheckedSubmissionHandleV1Provenance: (value: unknown) => {
    genesisBoundary.events.push('checked-handle');
    if (value !== boundary.checkedHandle || boundary.consumed) {
      throw new Error('synthetic checked handle provenance is missing');
    }
  },
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding:
    boundary.assertExecutionBinding,
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
  assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV2: (
    value: unknown,
  ) => {
    if (value !== trackerBoundary.target) {
      throw new Error('synthetic tracker transport target is missing');
    }
    return Object.freeze({
      processBindingDigestHex: processBoundary.processBindingDigestHex,
      executionTargetIdentityDigestHex:
        processBoundary.reconciliationIdentityDigestHex,
      reservationFreshnessProcessBindingDigestHex:
        processBoundary.reservationFreshnessProcessBindingDigestHex,
      reservationFreshnessExecutionTargetIdentityDigestHex:
        processBoundary.reservationFreshnessExecutionTargetIdentityDigestHex,
    });
  },
}));

import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKED_SUBMISSION_TRANSPORT_V1_SCHEMA,
  createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1,
  createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV2,
  createSubstrateFederatedNativeGenesisCheckedSubmissionTransportV1,
  createSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckedSubmissionTransportV1,
  createSubstrateFederatedIsolatedDevnetPegInSourceLockCheckedSubmissionTransportV1,
  projectSubstrateFederatedIsolatedDevnetCheckedSubmissionDiagnostic as projectDiagnostic,
} from './substrate-federated-isolated-devnet-checked-submission-transport-v1.js';
import {
  submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1,
} from './apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-checked-transport-v1.js';
import {
  projectSubstrateFederatedIsolatedDevnetTrackerCheckedSubmissionFailureV1,
  type SubstrateFederatedIsolatedDevnetTrackerCheckedSubmissionFailureCodeV1,
} from './relayer-core/substrate-federated-isolated-devnet-tracker-transport-managed-phase-v9.js';
import {
  PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
  executeErgoOperationalTransaction,
} from './relayer-core/ergo-operational-transaction-lifecycle.js';
import {
  executeSubstrateFederatedLocalDevnetGenesisV1,
  assertSubstrateFederatedLocalDevnetGenesisDurableAttemptV1,
  type SubstrateFederatedLocalDevnetGenesisDurableAttempt,
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
const TRACKER_SUBMISSION_RESPONSE_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKED_SUBMISSION_RESPONSE_V1';

type GenesisVersion = 1 | 2 | 'native';
function genesisProfile(version: GenesisVersion) {
  if (version === 'native') return {
    authorizer: genesisBoundary.authorizerNative,
    artifact: genesisBoundary.authorizationArtifactNative,
    authorizerGuard: genesisBoundary.assertAuthorizerNative,
    artifactGuard: genesisBoundary.assertAuthorizationNative,
    factory: createSubstrateFederatedNativeGenesisCheckedSubmissionTransportV1,
  };
  return {
    authorizer: version === 1 ? boundary.authorizer : genesisBoundary.authorizerV2,
    artifact: version === 1 ? boundary.authorizationArtifact : genesisBoundary.authorizationArtifactV2,
    authorizerGuard: version === 1 ? genesisBoundary.assertAuthorizerV1 : genesisBoundary.assertAuthorizerV2,
    artifactGuard: version === 1 ? genesisBoundary.assertAuthorizationV1 : genesisBoundary.assertAuthorizationV2,
    factory: version === 1 ? createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1
      : createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV2,
  };
}

beforeEach(() => {
  genesisBoundary.events.length = 0;
  boundary.issuedSignedCandidate = boundary.signedCandidate;
  for (const version of [1, 2, 'native'] as const) {
    const { authorizer, artifact, authorizerGuard, artifactGuard } = genesisProfile(version);
    authorizerGuard.mockReset();
    authorizerGuard.mockImplementation((value: unknown, target: unknown) => {
      genesisBoundary.events.push(`authorizer-v${version}`);
      if (value !== authorizer || target !== processBoundary.target) {
        throw new Error('synthetic broadcast authorizer provenance is missing');
      }
    });
    artifactGuard.mockReset();
    artifactGuard.mockImplementation((
      value: unknown,
      authorizationArtifact: unknown,
      expectation: Readonly<{ authorizationDigestHex: string }>,
    ) => {
      genesisBoundary.events.push(`authorization-v${version}`);
      if (
        value !== authorizer
        || authorizationArtifact !== artifact
        || expectation.authorizationDigestHex !== AUTHORIZATION_DIGEST
      ) {
        throw new Error('synthetic broadcast authorization is missing');
      }
    });
  }
  processBoundary.processBindingDigestHex = '11'.repeat(32);
  processBoundary.reconciliationIdentityDigestHex = '10'.repeat(32);
  processBoundary.reservationFreshnessProcessBindingDigestHex = '19'.repeat(32);
  processBoundary.reservationFreshnessExecutionTargetIdentityDigestHex =
    '1a'.repeat(32);
  processBoundary.assertionCount = 0;
  processBoundary.expireAfterAssertion = Number.POSITIVE_INFINITY;
  boundary.consumed = false;
  boundary.handleProcessBindingDigestHex = '11'.repeat(32);
  boundary.handleExecutionTargetIdentityDigestHex = '10'.repeat(32);
  boundary.assertExecutionBinding.mockReset();
  boundary.assertExecutionBinding.mockImplementation((
    value: unknown,
    binding: Readonly<{
      processBindingDigestHex: string;
      executionTargetIdentityDigestHex: string;
    }>,
  ) => {
    genesisBoundary.events.push('execution-binding');
    if (
      value !== boundary.checkedHandle
      || !Object.isFrozen(binding)
      || Object.keys(binding).sort().join(',')
        !== 'executionTargetIdentityDigestHex,processBindingDigestHex'
      || binding.processBindingDigestHex
        !== boundary.handleProcessBindingDigestHex
      || binding.executionTargetIdentityDigestHex
        !== boundary.handleExecutionTargetIdentityDigestHex
    ) {
      throw new Error('synthetic checked handle execution binding changed');
    }
  });
  boundary.consume.mockReset();
  boundary.consume.mockImplementation(async (
    handle: unknown,
    signedCandidate: unknown,
    consume: (signedTransaction: Readonly<Record<string, unknown>>) =>
      Promise<unknown>,
  ) => {
    if (
      handle !== boundary.checkedHandle
      || signedCandidate !== boundary.issuedSignedCandidate
      || boundary.consumed
    ) {
      throw new Error('synthetic checked handle is unavailable');
    }
    boundary.consumed = true;
    genesisBoundary.events.push('consume');
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
    receipt: Object.freeze({
      target: Object.freeze({
        processBindingDigestHex: '19'.repeat(32),
        executionTargetIdentityDigestHex: '1a'.repeat(32),
      }),
    }),
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
        || (value as any).receipt.target.processBindingDigestHex
          !== processBoundary.reservationFreshnessProcessBindingDigestHex
        || (value as any).receipt.target.executionTargetIdentityDigestHex
          !== processBoundary
            .reservationFreshnessExecutionTargetIdentityDigestHex
      ) {
        throw new Error('synthetic tracker execution check is missing');
      }
      return Object.freeze({
        processBindingDigestHex: processBoundary.processBindingDigestHex,
        executionTargetIdentityDigestHex:
          processBoundary.reconciliationIdentityDigestHex,
        reservationFreshnessProcessBindingDigestHex:
          processBoundary.reservationFreshnessProcessBindingDigestHex,
        reservationFreshnessExecutionTargetIdentityDigestHex:
          processBoundary.reservationFreshnessExecutionTargetIdentityDigestHex,
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
      const responseClassification =
        createSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1({
          status: submission.status,
          responseCategory: submission.responseCategory,
          httpStatus: submission.httpStatus,
          responseDigestHex: submission.responseDigestHex,
        });
      return Object.freeze({
        status: submission.status,
        submittedTransactionIdHex: submission.submittedTransactionIdHex,
        responseDigestHex: submission.responseDigestHex,
        responseClassification,
        resultArtifact: Object.freeze({ role: 'tracker-transport-result' }),
      });
    },
  );
});

function ports(overrides: Readonly<{
  signedTransactionDigestHex?: string;
  checkResponseDigestHex?: string;
  authorizationArtifact?: object;
}> = {}, version: GenesisVersion = 1): SubstrateFederatedLocalDevnetGenesisExecutionPorts {
  return {
    signer: {
      sign: async () => ({
        signedTransactionDigestHex: overrides.signedTransactionDigestHex
          ?? boundary.signedTransactionDigestHex,
        signerArtifact: boundary.issuedSignedCandidate,
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
          ?? genesisProfile(version).artifact,
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
    transport: genesisProfile(version).factory(
        processBoundary.target,
        genesisProfile(version).authorizer as never,
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
}> = {}, version: GenesisVersion = 1, executionPorts = ports(overrides, version)) {
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
  }, executionPorts);
}

// Issue real lifecycle provenance without exercising transport during setup.
async function genesisAttempt(
  version: GenesisVersion,
  overrides: Parameters<typeof execute>[0] = {},
) {
  const executionPorts = ports(overrides, version);
  let captured: SubstrateFederatedLocalDevnetGenesisDurableAttempt | undefined;
  await execute(overrides, version, {
    ...executionPorts,
    transport: {
      submit: async attempt => {
        assertSubstrateFederatedLocalDevnetGenesisDurableAttemptV1(attempt);
        captured = attempt;
        genesisBoundary.events.push('durable-attempt');
        return {
          status: 'ambiguous',
          submittedTxId: null,
          responseDigestHex: 'ab'.repeat(32),
        };
      },
    },
  });
  if (!captured) throw new Error('synthetic setup did not issue a durable attempt');
  return { transport: executionPorts.transport, attempt: captured };
}

const GENESIS_RESPONSE_PROFILES = [
  {
    version: 'native',
    schema: 'e2s.substrate-federated-native-genesis-checked-submission-transport.v1',
    domain: 'E2S_SUBSTRATE_FEDERATED_NATIVE_GENESIS_CHECKED_SUBMISSION_RESPONSE_V1',
  },
  {
    version: 1,
    schema: 'e2s.substrate-federated-isolated-devnet-checked-submission-transport.v1',
    domain: 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKED_SUBMISSION_RESPONSE_V1',
  },
  {
    version: 2,
    schema: 'e2s.substrate-federated-isolated-devnet-checked-submission-transport.v2',
    domain: 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKED_SUBMISSION_RESPONSE_V2',
  },
] as const;

describe.each(GENESIS_RESPONSE_PROFILES)(
  'fixed genesis checked transport V$version',
  ({ version, schema, domain }) => {
    const { factory, authorizer, artifact, authorizerGuard, artifactGuard } = genesisProfile(version);
    const otherAuthorizer = version === 1
      ? genesisBoundary.authorizerV2 : boundary.authorizer;
    const otherArtifact = version === 1
      ? genesisBoundary.authorizationArtifactV2 : boundary.authorizationArtifact;
    const otherAuthorizerGuard = version === 1
      ? genesisBoundary.assertAuthorizerV2 : genesisBoundary.assertAuthorizerV1;
    const otherArtifactGuard = version === 1
      ? genesisBoundary.assertAuthorizationV2 : genesisBoundary.assertAuthorizationV1;

    function expectNoConsumptionOrPost() {
      expect(boundary.consume).not.toHaveBeenCalled();
      expect(trackerBoundary.beforeCheckedCallback).not.toHaveBeenCalled();
      expect(node.post).not.toHaveBeenCalled();
    }

    function expectedResponseDigest(
      outcome: string,
      httpStatus: number | null,
      observedTxId: string | null,
    ) {
      return sha256CanonicalJson({
        schema,
        outcome,
        nodeOrigin: 'http://127.0.0.1:9051',
        path: '/transactions',
        method: 'POST',
        httpStatus,
        observedTxId,
        expectedTxId: boundary.expectedTxId,
        durableAttemptDigestHex: ATTEMPT_DIGEST,
        authorizationDigestHex: AUTHORIZATION_DIGEST,
        processBindingDigestHex: '11'.repeat(32),
        reconciliationIdentityDigestHex: '10'.repeat(32),
        signedTransactionDigestHex: boundary.signedTransactionDigestHex,
        signedTransactionBytesSha256Hex: boundary.signedTransactionBytesSha256Hex,
        signedTransactionBytesLength: 321,
        checkResponseDigestHex: boundary.checkResponseDigestHex,
      }, domain);
    }

    it('selects only its exact guards, digest profile and credential-free one-shot POST', async () => {
      node.post.mockImplementation(async () => {
        genesisBoundary.events.push('post');
        return { status: 200, data: boundary.expectedTxId };
      });
      const { transport, attempt } = await genesisAttempt(version);

      const result = await transport.submit(attempt);

      expect(result).toEqual({
        status: 'accepted',
        submittedTxId: boundary.expectedTxId,
        responseDigestHex: expectedResponseDigest('accepted', 200, boundary.expectedTxId),
      });
      expect(projectDiagnostic(result)).toEqual({ outcome: 'accepted', httpStatus: 200,
        expectedTxId: boundary.expectedTxId, durableAttemptDigestHex: ATTEMPT_DIGEST,
        responseDigestHex: expectedResponseDigest('accepted', 200, boundary.expectedTxId) });
      expect(Object.isFrozen(projectDiagnostic(result))).toBe(true);
      expect(projectDiagnostic({ ...result })).toBeNull();
      expect(authorizerGuard).toHaveBeenCalledTimes(version === 'native' ? 2 : 1);
      expect(authorizerGuard).toHaveBeenLastCalledWith(
        authorizer, processBoundary.target,
      );
      expect(artifactGuard).toHaveBeenCalledExactlyOnceWith(authorizer, artifact, {
        revalidated: attempt.candidate.authorization.revalidated,
        preTransportEvidence: attempt.candidate.authorization.preTransportEvidence,
        authorizationDigestHex: AUTHORIZATION_DIGEST,
      });
      expect(otherAuthorizerGuard).not.toHaveBeenCalled();
      expect(otherArtifactGuard).not.toHaveBeenCalled();
      expect(genesisBoundary.events).toEqual([
        `authorizer-v${version}`,
        'durable-attempt',
        `authorization-v${version}`,
        'signed-candidate',
        'checked-handle',
        'execution-binding',
        'consume',
        ...(version === 'native' ? ['authorizer-vnative'] : []),
        'post',
      ]);
      expect(boundary.consume).toHaveBeenCalledExactlyOnceWith(
        boundary.checkedHandle, boundary.signedCandidate, expect.any(Function),
      );
      expect(node.post).toHaveBeenCalledExactlyOnceWith(
        'http://127.0.0.1:9051/transactions', boundary.signedTransaction, {
          headers: { 'Content-Type': 'application/json' },
          maxRedirects: 0,
          proxy: false,
          timeout: 30_000,
          maxContentLength: 1_024,
        },
      );
      expect(node.post.mock.calls[0]?.[1]).toBe(boundary.signedTransaction);
      await expect(transport.submit(attempt)).rejects.toThrow(/checked handle provenance/u);
      expect(boundary.consume).toHaveBeenCalledTimes(1);
      expect(node.post).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['inverse-version', (): unknown => otherAuthorizer],
      ['copied', (): unknown => Object.freeze({ ...authorizer })],
      ['missing', (): unknown => undefined],
    ] as const)('rejects a %s authorizer at the factory before any callback', (_name, value) => {
      expect(() => factory(processBoundary.target, value() as never))
        .toThrow(/authorizer provenance/u);
      expect(genesisBoundary.events).toEqual([`authorizer-v${version}`]);
      expect(authorizerGuard).toHaveBeenCalledTimes(1);
      expect(otherAuthorizerGuard).not.toHaveBeenCalled();
      expect(artifactGuard).not.toHaveBeenCalled();
      expect(otherArtifactGuard).not.toHaveBeenCalled();
      expectNoConsumptionOrPost();
    });

    it.each([
      ['inverse-version', () => otherArtifact],
      ['copied', () => Object.freeze({ ...artifact })],
    ] as const)('rejects a %s authorization artifact before handle inspection', async (_name, value) => {
      const { transport, attempt } = await genesisAttempt(version, {
        authorizationArtifact: value(),
      });
      await expect(transport.submit(attempt)).rejects.toThrow(/broadcast authorization/u);
      expect(genesisBoundary.events).toEqual([
        `authorizer-v${version}`, 'durable-attempt', `authorization-v${version}`,
      ]);
      expect(artifactGuard).toHaveBeenCalledTimes(1);
      expect(otherArtifactGuard).not.toHaveBeenCalled();
      expectNoConsumptionOrPost();
    });

    it('rejects missing authorization before durable issuance or transport', async () => {
      const executionPorts = ports({}, version);
      const reserve = vi.fn(executionPorts.journal.reserve);
      const submit = vi.fn(executionPorts.transport.submit);
      await expect(execute({}, version, {
        ...executionPorts,
        broadcastAuthorizer: {
          authorize: () => ({
            authorizationDigestHex: AUTHORIZATION_DIGEST,
            authorizationArtifact: undefined as never,
          }),
        },
        journal: { ...executionPorts.journal, reserve },
        transport: { submit },
      })).rejects.toThrow(/authorization artifact must be an opaque object/u);
      expect(reserve).not.toHaveBeenCalled();
      expect(submit).not.toHaveBeenCalled();
      expectNoConsumptionOrPost();
    });

    it.each([
      ['process', () => { processBoundary.processBindingDigestHex = 'e1'.repeat(32); }],
      ['target identity', () => { processBoundary.reconciliationIdentityDigestHex = 'e2'.repeat(32); }],
    ] as const)('rejects %s drift after construction before authorization or consumption', async (_name, change) => {
      const { transport, attempt } = await genesisAttempt(version);
      change();
      await expect(transport.submit(attempt)).rejects.toThrow(/process binding changed/u);
      expect(artifactGuard).not.toHaveBeenCalled();
      expectNoConsumptionOrPost();
    });

    it.each([
      ['process', () => { boundary.handleProcessBindingDigestHex = 'e3'.repeat(32); }],
      ['target identity', () => { boundary.handleExecutionTargetIdentityDigestHex = 'e4'.repeat(32); }],
    ] as const)('rejects a checked handle from a different %s', async (_name, change) => {
      const { transport, attempt } = await genesisAttempt(version);
      change();
      await expect(transport.submit(attempt)).rejects.toThrow(/execution binding changed/u);
      expect(artifactGuard).toHaveBeenCalledTimes(1);
      expect(boundary.assertExecutionBinding).toHaveBeenCalledTimes(1);
      expectNoConsumptionOrPost();
    });

    it.each([
      ['signedTransactionDigestHex', 'e5'.repeat(32)],
      ['signedTransactionBytesSha256Hex', 'e6'.repeat(32)],
      ['signedTransactionBytesLength', 322],
    ] as const)('rejects isolated signed-candidate %s drift', async (field, value) => {
      // The signer double recognizes this candidate so the real byte-binding check decides.
      boundary.issuedSignedCandidate = Object.freeze({
        ...boundary.signedCandidate, [field]: value,
      });
      const { transport, attempt } = await genesisAttempt(version);
      await expect(transport.submit(attempt)).rejects.toThrow(/binding changed before submission/u);
      expect(boundary.assertExecutionBinding).toHaveBeenCalledTimes(1);
      expectNoConsumptionOrPost();
    });

    it.each([
      'signedTransactionBytesSha256Hex', 'signedTransactionBytesLength',
    ] as const)('rejects missing exact-byte field %s', async field => {
      boundary.issuedSignedCandidate = Object.freeze({
        ...boundary.signedCandidate, [field]: undefined,
      }) as unknown as typeof boundary.signedCandidate;
      const { transport, attempt } = await genesisAttempt(version);
      await expect(transport.submit(attempt)).rejects.toThrow(/requires exact signed bytes/u);
      expectNoConsumptionOrPost();
    });

    it('rejects a handle consumed after authorization without invoking its callback', async () => {
      const { transport, attempt } = await genesisAttempt(version);
      boundary.consumed = true;
      await expect(transport.submit(attempt)).rejects.toThrow(/checked handle provenance/u);
      expect(artifactGuard).toHaveBeenCalledTimes(1);
      expectNoConsumptionOrPost();
    });

    if (version === 'native') {
      it('stops before POST when native custody expires during checked-handle consumption', async () => {
        const { transport, attempt } = await genesisAttempt(version);
        trackerBoundary.beforeCheckedCallback.mockImplementationOnce(async () => {
          authorizerGuard.mockImplementation(() => { throw new Error('native custody expired'); });
        });
        await expect(transport.submit(attempt)).rejects.toThrow(/native custody expired/u);
        expect(artifactGuard).toHaveBeenCalledTimes(1);
        expect(boundary.consume).toHaveBeenCalledTimes(1);
        expect(trackerBoundary.beforeCheckedCallback).toHaveBeenCalledTimes(1);
        expect(node.post).not.toHaveBeenCalled();
        await expect(transport.submit(attempt)).rejects.toThrow();
        expect(boundary.consume).toHaveBeenCalledTimes(1);
        expect(node.post).not.toHaveBeenCalled();
      });
    }

    it.each(['copied attempt', 'copied artifact', 'missing artifact'] as const)(
      'rejects %s durability before authorization or handle consumption', async kind => {
        const { transport, attempt } = await genesisAttempt(version);
        const copy = kind === 'copied attempt' ? { ...attempt } : {
          ...attempt,
          durableArtifact: kind === 'copied artifact'
            ? Object.freeze({ ...attempt.durableArtifact }) : undefined,
        };
        await expect(transport.submit(Object.freeze(copy) as never))
          .rejects.toThrow(/durable attempt lacks process provenance/u);
        expect(artifactGuard).not.toHaveBeenCalled();
        expectNoConsumptionOrPost();
      },
    );

    it('rejects missing journal durability before transport is invoked', async () => {
      const executionPorts = ports({}, version);
      const submit = vi.fn(executionPorts.transport.submit);
      await expect(execute({}, version, {
        ...executionPorts,
        journal: {
          ...executionPorts.journal,
          reserve: () => ({
            durableAttemptDigestHex: ATTEMPT_DIGEST,
            reconciliationIdentityDigestHex: '10'.repeat(32),
            durableArtifact: undefined as never,
          }),
        },
        transport: { submit },
      })).rejects.toThrow(/durable attempt artifact must be an opaque object/u);
      expect(submit).not.toHaveBeenCalled();
      expectNoConsumptionOrPost();
    });

    it.each([
      ['wrong ID', 'ambiguous_success_response', 200, 'ff'.repeat(32)],
      ['no response', 'ambiguous_no_response', null, null],
      ['HTTP 400', 'ambiguous_http_response', 400, null],
      ['HTTP 429', 'ambiguous_http_response', 429, null],
      ['HTTP 500', 'ambiguous_http_response', 500, null],
    ] as const)('keeps %s ambiguous with its exact digest and never retries', async (_name, outcome, status, observedTxId) => {
      node.post.mockImplementation(async () => {
        genesisBoundary.events.push('post');
        if (observedTxId) return { status, data: observedTxId };
        throw status === null
          ? { isAxiosError: true, code: 'ETIMEDOUT' }
          : { isAxiosError: true, response: { status } };
      });
      const { transport, attempt } = await genesisAttempt(version);
      const result = await transport.submit(attempt);
      expect(result).toEqual({
        status: 'ambiguous',
        submittedTxId: null,
        responseDigestHex: expectedResponseDigest(outcome, status, observedTxId),
      });
      expect(projectDiagnostic(result)).toEqual({ outcome, httpStatus: status,
        expectedTxId: boundary.expectedTxId, durableAttemptDigestHex: ATTEMPT_DIGEST,
        responseDigestHex: expectedResponseDigest(outcome, status, observedTxId) });
      expect(Object.isFrozen(projectDiagnostic(result))).toBe(true);
      expect(projectDiagnostic({ ...result })).toBeNull();
      expect(genesisBoundary.events.slice(version === 'native' ? -3 : -2))
        .toEqual(['consume', ...(version === 'native' ? ['authorizer-vnative'] : []), 'post']);
      await expect(transport.submit(attempt)).rejects.toThrow(/checked handle provenance/u);
      expect(boundary.consume).toHaveBeenCalledTimes(1);
      expect(trackerBoundary.beforeCheckedCallback).toHaveBeenCalledTimes(1);
      expect(node.post).toHaveBeenCalledTimes(1);
    });
  },
);

describe('isolated devnet checked submission transport V1', () => {
  it('claims the durable tracker attempt before one exact loopback POST', async () => {
    node.post.mockImplementation(async () => {
      trackerBoundary.events.push('post');
      return { status: 200, data: boundary.expectedTxId };
    });

    const result =
      await submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1({
        target: trackerBoundary.target,
        executionCheck: trackerBoundary.executionCheck as any,
        authorization: trackerBoundary.authorization as any,
        journal: trackerBoundary.journal as any,
        attempt: trackerBoundary.attempt as any,
        preflight: trackerBoundary.preflight as any,
      });
    expect(result).toMatchObject({
      status: 'accepted',
      submittedTransactionIdHex: boundary.expectedTxId,
      responseDigestHex: expect.stringMatching(/^[0-9a-f]{64}$/u),
      responseClassification: {
        status: 'accepted',
        responseCategory: 'accepted',
        httpStatus: 200,
        classificationDigestHex: expect.stringMatching(/^[0-9a-f]{64}$/u),
      },
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
    expect(boundary.assertExecutionBinding).toHaveBeenCalledTimes(1);
    expect(boundary.assertExecutionBinding.mock.calls[0]?.[1]).toEqual({
      processBindingDigestHex: '11'.repeat(32),
      executionTargetIdentityDigestHex: '10'.repeat(32),
    });
    expect(result.responseDigestHex).toBe(sha256CanonicalJson({
      schema:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKED_SUBMISSION_TRANSPORT_V1_SCHEMA,
      outcome: 'accepted',
      nodeOrigin: boundary.nodeOrigin,
      path: '/transactions',
      method: 'POST',
      httpStatus: 200,
      observedTxId: boundary.expectedTxId,
      expectedTxId: boundary.expectedTxId,
      durableAttemptDigestHex: ATTEMPT_DIGEST,
      authorizationDigestHex:
        trackerBoundary.authorization.authorizationDigestHex,
      processBindingDigestHex: '11'.repeat(32),
      reconciliationIdentityDigestHex: '10'.repeat(32),
      signedTransactionDigestHex: boundary.signedTransactionDigestHex,
      signedTransactionBytesSha256Hex:
        boundary.signedTransactionBytesSha256Hex,
      signedTransactionBytesLength: 321,
      checkResponseDigestHex: boundary.checkResponseDigestHex,
    }, TRACKER_SUBMISSION_RESPONSE_DIGEST_DOMAIN));
  });

  it.each([
    [
      'reservation-freshness process digest',
      () => {
        processBoundary.reservationFreshnessProcessBindingDigestHex =
          'ec'.repeat(32);
      },
    ],
    [
      'reservation-freshness execution-target digest',
      () => {
        processBoundary.reservationFreshnessExecutionTargetIdentityDigestHex =
          'ed'.repeat(32);
      },
    ],
  ] as const)(
    'rejects %s drift before durable claim or POST',
    async (_name, arrange) => {
      arrange();
      let failure: unknown;

      try {
        await submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1({
          target: trackerBoundary.target,
          executionCheck: trackerBoundary.executionCheck as any,
          authorization: trackerBoundary.authorization as any,
          journal: trackerBoundary.journal as any,
          attempt: trackerBoundary.attempt as any,
          preflight: trackerBoundary.preflight as any,
        });
      } catch (error) {
        failure = error;
      }

      expect(
        projectSubstrateFederatedIsolatedDevnetTrackerCheckedSubmissionFailureV1(
          failure,
        ),
      ).toBe('authority_binding');
      expect(trackerBoundary.assertExecutionCheck).toHaveBeenCalledTimes(1);
      expect(trackerBoundary.assertAuthorization).not.toHaveBeenCalled();
      expect(trackerBoundary.claimAttempt).not.toHaveBeenCalled();
      expect(boundary.consume).not.toHaveBeenCalled();
      expect(node.post).not.toHaveBeenCalled();
    },
  );

  it('rejects a mining target bound to a foreign transaction before durable claim or POST', async () => {
    const originalTarget = trackerBoundary.target;
    trackerBoundary.target = Object.freeze({
      ...originalTarget,
      expectedTransactionIdHex: 'fa'.repeat(32),
    });
    try {
      let failure: unknown;
      try {
        await submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1({
          target: trackerBoundary.target,
          executionCheck: trackerBoundary.executionCheck as any,
          authorization: trackerBoundary.authorization as any,
          journal: trackerBoundary.journal as any,
          attempt: trackerBoundary.attempt as any,
          preflight: trackerBoundary.preflight as any,
        });
      } catch (error) {
        failure = error;
      }

      expect(
        projectSubstrateFederatedIsolatedDevnetTrackerCheckedSubmissionFailureV1(
          failure,
        ),
      ).toBe('authority_binding');
      expect(trackerBoundary.claimAttempt).not.toHaveBeenCalled();
      expect(boundary.consume).not.toHaveBeenCalled();
      expect(node.post).not.toHaveBeenCalled();
    } finally {
      trackerBoundary.target = originalTarget;
    }
  });

  it.each([
    [
      'process binding digest',
      () => {
        boundary.handleProcessBindingDigestHex = 'ee'.repeat(32);
      },
    ],
    [
      'execution-target identity digest',
      () => {
        boundary.handleExecutionTargetIdentityDigestHex = 'ef'.repeat(32);
      },
    ],
  ] as const)(
    'rejects checked-handle %s drift before durable claim or POST',
    async (_name, arrange) => {
      arrange();
      let failure: unknown;

      try {
        await submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1({
          target: trackerBoundary.target,
          executionCheck: trackerBoundary.executionCheck as any,
          authorization: trackerBoundary.authorization as any,
          journal: trackerBoundary.journal as any,
          attempt: trackerBoundary.attempt as any,
          preflight: trackerBoundary.preflight as any,
        });
      } catch (error) {
        failure = error;
      }

      expect(
        projectSubstrateFederatedIsolatedDevnetTrackerCheckedSubmissionFailureV1(
          failure,
        ),
      ).toBe('authority_binding');
      expect(boundary.assertExecutionBinding).toHaveBeenCalledTimes(1);
      expect(trackerBoundary.claimAttempt).not.toHaveBeenCalled();
      expect(boundary.consume).not.toHaveBeenCalled();
      expect(node.post).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'authority_binding',
      () => trackerBoundary.assertAuthorization.mockImplementationOnce(() => {
        throw new Error('synthetic private authority diagnostic');
      }),
    ],
    [
      'durable_attempt_claim',
      () => trackerBoundary.claimAttempt.mockImplementationOnce(() => {
        throw new Error('synthetic private journal diagnostic');
      }),
    ],
    [
      'checked_handle_consumption',
      () => boundary.consume.mockRejectedValueOnce(
        new Error('synthetic private handle diagnostic'),
      ),
    ],
    [
      'preflight_consumption',
      () => trackerBoundary.consumePreflight.mockImplementationOnce(() => {
        throw new Error('synthetic private preflight diagnostic');
      }),
    ],
    [
      'transport_response_projection',
      () => {
        const failure = Object.create(null) as Record<string, unknown>;
        failure.isAxiosError = true;
        Object.defineProperty(failure, 'response', {
          get: () => {
            throw new Error('synthetic private response diagnostic');
          },
        });
        node.post.mockRejectedValueOnce(failure);
      },
    ],
    [
      'submission_result_validation',
      () => boundary.consume.mockResolvedValueOnce(Object.freeze({
        status: 'accepted',
        submittedTxId: boundary.expectedTxId,
        responseDigestHex: null,
      })),
    ],
    [
      'result_issuance',
      () => {
        node.post.mockResolvedValueOnce({
          status: 200,
          data: boundary.expectedTxId,
        });
        trackerBoundary.issueResult.mockImplementationOnce(() => {
          throw new Error('synthetic private result diagnostic');
        });
      },
    ],
  ] as const)(
    'projects checked-submission failure code %s without using error text',
    async (expectedCode, arrange) => {
      arrange();
      let failure: unknown;
      try {
        await submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1({
          target: trackerBoundary.target,
          executionCheck: trackerBoundary.executionCheck as any,
          authorization: trackerBoundary.authorization as any,
          journal: trackerBoundary.journal as any,
          attempt: trackerBoundary.attempt as any,
          preflight: trackerBoundary.preflight as any,
        });
      } catch (error) {
        failure = error;
      }

      expect(
        projectSubstrateFederatedIsolatedDevnetTrackerCheckedSubmissionFailureV1(
          failure,
        ),
      ).toBe(
        expectedCode satisfies
          SubstrateFederatedIsolatedDevnetTrackerCheckedSubmissionFailureCodeV1,
      );
      expect(
        projectSubstrateFederatedIsolatedDevnetTrackerCheckedSubmissionFailureV1(
          { code: expectedCode },
        ),
      ).toBeNull();
    },
  );

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
      responseClassification: {
        responseCategory: 'ambiguous_no_response',
        httpStatus: null,
      },
    });
    await expect(
      submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1(input),
    ).rejects.toThrow(/checked handle provenance is missing/);
    expect(trackerBoundary.claimAttempt).toHaveBeenCalledTimes(1);
    expect(node.post).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'HTTP response',
      { isAxiosError: true, response: { status: 503, data: 'private node diagnostic' } },
      'ambiguous_http_response',
      503,
    ],
    [
      'successful response with another transaction ID',
      null,
      'ambiguous_success_response',
      200,
    ],
  ] as const)(
    'classifies an ambiguous tracker %s without exposing response content',
    async (_label, failure, responseCategory, httpStatus) => {
      if (failure === null) {
        node.post.mockResolvedValue({ status: 200, data: 'ff'.repeat(32) });
      } else {
        node.post.mockRejectedValue(failure);
      }

      const result =
        await submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1({
          target: trackerBoundary.target,
          executionCheck: trackerBoundary.executionCheck as any,
          authorization: trackerBoundary.authorization as any,
          journal: trackerBoundary.journal as any,
          attempt: trackerBoundary.attempt as any,
          preflight: trackerBoundary.preflight as any,
        });

      expect(result).toMatchObject({
        status: 'ambiguous',
        submittedTransactionIdHex: null,
        responseClassification: {
          responseCategory,
          httpStatus,
          classificationDigestHex: expect.stringMatching(/^[0-9a-f]{64}$/u),
        },
      });
      expect(JSON.stringify(result)).not.toContain('private node diagnostic');
      expect(node.post).toHaveBeenCalledTimes(1);
    },
  );

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
