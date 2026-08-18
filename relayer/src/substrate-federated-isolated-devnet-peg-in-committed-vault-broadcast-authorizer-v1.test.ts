import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertCandidate: vi.fn(),
  assertExecutionCheck: vi.fn(),
  assertHandleBinding: vi.fn(),
  assertHandle: vi.fn(),
  assertSigned: vi.fn(),
  assertSourceLockObservation: vi.fn(),
  assertTarget: vi.fn(),
  checkSignedTransaction: vi.fn(),
  normalizeEip12Box: vi.fn(),
  boxes: new Map<string, unknown>(),
  tipCalls: new Map<string, number>(),
  tipHeight: 101,
  tipIdHex: '',
  driftAfterFreshCheck: false,
}));

vi.mock('./authenticated-spv-tracker-read-only-node-client.js', () => ({
  AuthenticatedSpvTrackerReadOnlyNodeClient: class {
    readonly origin: string;

    constructor(origin: string) {
      this.origin = origin;
    }

    async getBestHeader() {
      const calls = (mocks.tipCalls.get(this.origin) ?? 0) + 1;
      mocks.tipCalls.set(this.origin, calls);
      return {
        id: mocks.tipIdHex,
        height:
          mocks.tipHeight
          + (mocks.driftAfterFreshCheck && calls >= 3 ? 1 : 0),
      };
    }

    async getBoxByIdOrNull(boxId: string) {
      return mocks.boxes.get(boxId) ?? null;
    }
  },
}));
vi.mock('./fleet-signer.js', () => ({
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding:
    mocks.assertHandleBinding,
  assertLocalWasmCheckedSubmissionHandleV1Provenance: mocks.assertHandle,
  assertLocalWasmSignedCheckCandidateProvenance: mocks.assertSigned,
  checkSignedTransaction: mocks.checkSignedTransaction,
}));
vi.mock('./substrate-federated-isolated-devnet-ergo-node-process-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1:
    mocks.assertTarget,
}));
vi.mock('./substrate-federated-isolated-devnet-peg-in-candidate-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetPegInCandidateV1:
    mocks.assertCandidate,
}));
vi.mock(
  './substrate-federated-isolated-devnet-peg-in-source-lock-output-observer-v1.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1:
      mocks.assertSourceLockObservation,
  }),
);
vi.mock(
  './substrate-federated-isolated-devnet-reward-input-discovery-v1.js',
  () => ({
    SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN:
      'http://127.0.0.1:9051',
    SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN:
      'http://127.0.0.1:9052',
  }),
);
vi.mock('./substrate-federated-isolated-devnet-setup-check-execution-v2.js', () => ({
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCheckV1:
    mocks.assertExecutionCheck,
}));
vi.mock('./unsigned-ergo-transaction.js', () => ({
  normalizeEip12Box: mocks.normalizeEip12Box,
}));

import {
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizationArtifactV1,
  createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1,
} from './substrate-federated-isolated-devnet-peg-in-committed-vault-broadcast-authorizer-v1.js';
import {
  PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
} from './relayer-core/ergo-operational-transaction-lifecycle.js';

const hex = (byte: string): string => byte.repeat(32);
const PRIMARY = 'http://127.0.0.1:9051' as const;
const WITNESS = 'http://127.0.0.1:9052' as const;
const BINDING = Object.freeze({
  processBindingDigestHex: hex('11'),
  executionTargetIdentityDigestHex: hex('12'),
});
const TARGET = Object.freeze({
  primaryNodeOrigin: PRIMARY,
  witnessNodeOrigin: WITNESS,
  primaryMining: true as const,
  witnessReadOnly: true as const,
});

function box(boxId: string) {
  return Object.freeze({
    boxId,
    value: '1000000',
    ergoTree: '00',
    assets: Object.freeze([]),
    additionalRegisters: Object.freeze({}),
    creationHeight: 90,
    transactionId: hex('90'),
    index: 0,
  });
}

function fixture() {
  const sourceFunding = box(hex('21'));
  const reservePredecessor = box(hex('22'));
  const sourceLock = box(hex('23'));
  const transitionFeeFunding = box(hex('24'));
  const reserveTransitionTxId = hex('25');
  const sourceLockTxId = hex('26');
  const eip12Tx = Object.freeze({
    inputs: Object.freeze([
      Object.freeze({ boxId: reservePredecessor.boxId }),
      Object.freeze({ boxId: sourceLock.boxId }),
      Object.freeze({ boxId: transitionFeeFunding.boxId }),
    ]),
  });
  const packet = Object.freeze({
    boxes: Object.freeze({
      sourceFundingInput: sourceFunding,
      reservePredecessor,
      sourceLock,
      transitionFeeFunding,
    }),
    transactions: Object.freeze({
      sourceLockCreation: Object.freeze({ txId: sourceLockTxId }),
      reserveTransition: Object.freeze({
        txId: reserveTransitionTxId,
        eip12Tx,
      }),
    }),
  });
  const batch = Object.freeze({
    request: Object.freeze({ requestDigestHex: hex('27') }),
  });
  const candidate = Object.freeze({
    candidateDigestHex: hex('28'),
    depositPacket: packet,
  });
  const signerContext = Object.freeze({
    profile: 'e2s.local-wasm-check-signer.v1',
    pubKeyHex: hex('29'),
    ergoTreeHex: `0008cd${hex('29')}`,
    networkPrefix: 16,
    stateContextTipHeight: 99,
    stateContextTipIdHex: hex('30'),
  });
  const signedCandidate = Object.freeze({
    profile: 'e2s.local-wasm-signed-check-candidate.v1',
    txId: reserveTransitionTxId,
    signedTransactionDigestHex: hex('31'),
    signedTransactionBytesSha256Hex: hex('32'),
    signedTransactionBytesLength: 456,
    nodeOrigin: PRIMARY,
    signerContext,
  });
  const checkerIdentity = Object.freeze({
    profile: 'e2s.ergo-node-checker.v1',
    sourceAdapterProfile: 'e2s.ergo-node-json-source.v1',
    nodeOrigin: PRIMARY,
    path: '/transactions/check' as const,
    method: 'POST' as const,
    transportPolicy: 'no-redirect-no-proxy' as const,
  });
  const handle = Object.freeze({
    profile: 'e2s.local-wasm-checked-submission-handle.v1',
    txId: reserveTransitionTxId,
    nodeOrigin: PRIMARY,
    signedTransactionDigestHex: signedCandidate.signedTransactionDigestHex,
    signedTransactionBytesSha256Hex:
      signedCandidate.signedTransactionBytesSha256Hex,
    signedTransactionBytesLength: signedCandidate.signedTransactionBytesLength,
    checkResponseDigestHex: hex('33'),
    checkerIdentity,
  });
  const executionCheck = Object.freeze({
    receipt: Object.freeze({
      unsignedTransactionIdHex: reserveTransitionTxId,
      signedTransactionIdHex: reserveTransitionTxId,
      reservePredecessorBoxIdHex: reservePredecessor.boxId,
      sourceLockBoxIdHex: sourceLock.boxId,
      transitionFeeFundingBoxIdHex: transitionFeeFunding.boxId,
      unsignedTransactionDigestHex: hex('34'),
      signedTransactionCanonicalJsonSha256Hex:
        signedCandidate.signedTransactionDigestHex,
      receiptDigestHex: hex('35'),
    }),
    signedCandidate,
    checkedAcceptance: Object.freeze({ submissionHandle: handle }),
  });
  const sourceLockObservation = Object.freeze({
    expectedTxId: sourceLockTxId,
    sourceFundingBoxIdHex: sourceFunding.boxId,
    sourceLockBoxIdHex: sourceLock.boxId,
    transitionFeeFundingBoxIdHex: transitionFeeFunding.boxId,
    processBindingDigestHex: BINDING.processBindingDigestHex,
    executionTargetIdentityDigestHex: BINDING.executionTargetIdentityDigestHex,
    confirmationHeight: 100,
    confirmationObservationDigestHex: hex('36'),
    observationDigestHex: hex('37'),
    boundaries: Object.freeze({
      sourceFundingSpent: true as const,
      sourceLockUnspentAndExact: true as const,
      transitionFeeFundingUnspentAndExact: true as const,
    }),
  });
  const admission = Object.freeze({
    operationProfile: PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
    expectedTxId: reserveTransitionTxId,
    sourceBoxId: reservePredecessor.boxId,
    inputBoxIds: Object.freeze([
      reservePredecessor.boxId,
      sourceLock.boxId,
      transitionFeeFunding.boxId,
    ]),
    targetSidechainHeight: null,
    targetSidechainBlockHashHex: null,
    heartbeatKeyHex: null,
    unsignedTransaction: eip12Tx,
    bindingDigestHex: hex('38'),
  });
  const checked = Object.freeze({
    signed: Object.freeze({
      admission,
      nodeOrigin: PRIMARY,
      signedTransactionDigestHex: signedCandidate.signedTransactionDigestHex,
      signerArtifact: signedCandidate,
    }),
    checkResponseDigestHex: handle.checkResponseDigestHex,
    checkerArtifact: handle,
  });
  const input = Object.freeze({
    target: TARGET,
    batch,
    candidate,
    executionCheck,
    sourceLockObservation,
  });
  const freshCheck = Object.freeze({
    txId: reserveTransitionTxId,
    checkResult: Object.freeze({ accepted: true }),
    signedTransactionDigestHex: signedCandidate.signedTransactionDigestHex,
    signedTransactionBytesSha256Hex:
      signedCandidate.signedTransactionBytesSha256Hex,
    signedTransactionBytesLength: signedCandidate.signedTransactionBytesLength,
    signerContext,
    checkerIdentity,
  });

  mocks.assertCandidate.mockImplementation((value, valueBatch, valueTarget) => {
    if (value !== candidate || valueBatch !== batch || valueTarget !== TARGET) {
      throw new Error('candidate provenance missing');
    }
    return packet;
  });
  mocks.assertExecutionCheck.mockImplementation((value, valueTarget) => {
    if (value !== executionCheck || valueTarget !== TARGET) {
      throw new Error('execution-check provenance missing');
    }
    return BINDING;
  });
  mocks.assertSourceLockObservation.mockImplementation((value, valueTarget) => {
    if (value !== sourceLockObservation || valueTarget !== TARGET) {
      throw new Error('source-lock observation provenance missing');
    }
  });
  mocks.checkSignedTransaction.mockResolvedValue(freshCheck);
  mocks.boxes.set(reservePredecessor.boxId, reservePredecessor);
  mocks.boxes.set(sourceLock.boxId, sourceLock);
  mocks.boxes.set(transitionFeeFunding.boxId, transitionFeeFunding);

  return { checked, executionCheck, freshCheck, input, signedCandidate };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.boxes.clear();
  mocks.tipCalls.clear();
  mocks.tipHeight = 101;
  mocks.tipIdHex = hex('40');
  mocks.driftAfterFreshCheck = false;
  mocks.assertTarget.mockImplementation(value => {
    if (value !== TARGET) throw new Error('target provenance missing');
    return BINDING;
  });
  mocks.assertHandleBinding.mockImplementation((_handle, binding) => {
    if (binding !== BINDING) throw new Error('execution binding changed');
  });
  mocks.normalizeEip12Box.mockImplementation(async value => value);
});

describe('isolated committed-vault broadcast authorizer V1', () => {
  it('rechecks exact signed bytes and authorizes one current transition', async () => {
    const f = fixture();
    const session =
      createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1(
        f.input as never,
      );
    const revalidation = await session.revalidator.revalidate(f.checked as never);
    const revalidated = Object.freeze({
      checked: f.checked,
      revalidationDigestHex: revalidation.revalidationDigestHex,
    });
    const evidence = session.broadcastAuthorizer.authorize(revalidated as never);
    const authorization = Object.freeze({
      revalidated,
      authorizationDigestHex: evidence.authorizationDigestHex,
      authorizationArtifact: evidence.authorizationArtifact,
    });

    expect(mocks.checkSignedTransaction).toHaveBeenCalledWith(
      f.signedCandidate,
      'isolated local committed-vault pre-transport recheck',
      PRIMARY,
    );
    expect(session.takePreTransportObservation()).toMatchObject({
      observedTipHeight: 101,
      observedTipHeaderIdHex: hex('40'),
    });
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizationArtifactV1(
        session.broadcastAuthorizer,
        authorization as never,
      )
    ).not.toThrow();
    expect(() => session.takePreTransportObservation()).toThrow(/consumed/);
  });

  it('fails closed when the exact transaction expires before transport', async () => {
    const f = fixture();
    const session =
      createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1(
        f.input as never,
      );
    mocks.tipHeight = 10_000;
    mocks.checkSignedTransaction.mockResolvedValue(null);

    await expect(session.revalidator.revalidate(f.checked as never))
      .rejects.toThrow(/fresh JVM check rejected/);
    expect(mocks.checkSignedTransaction).toHaveBeenCalledOnce();
  });

  it('rejects a second authorization session for one promoted execution check', () => {
    const f = fixture();
    createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1(
      f.input as never,
    );
    expect(() =>
      createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1(
        f.input as never,
      )
    ).toThrow(/already claimed/);
  });

  it('rejects concurrent revalidation and tip drift during the fresh check', async () => {
    const f = fixture();
    const session =
      createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1(
        f.input as never,
      );
    mocks.driftAfterFreshCheck = true;

    const first = session.revalidator.revalidate(f.checked as never);
    await expect(session.revalidator.revalidate(f.checked as never))
      .rejects.toThrow(/one-shot/);
    await expect(first).rejects.toThrow(/tip changed during fresh JVM check/);
  });
});
