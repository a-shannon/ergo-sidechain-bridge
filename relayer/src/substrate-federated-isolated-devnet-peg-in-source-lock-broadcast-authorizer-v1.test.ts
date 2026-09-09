import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertCandidate: vi.fn(),
  assertCandidateV2: vi.fn(),
  assertExecutionCheck: vi.fn(),
  assertHandleBinding: vi.fn(),
  assertHandle: vi.fn(),
  assertOwnedReward: vi.fn(),
  assertSigned: vi.fn(),
  assertTarget: vi.fn(),
}));

vi.mock('./substrate-federated-isolated-devnet-ergo-node-process-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1:
    mocks.assertTarget,
}));
vi.mock('./substrate-federated-isolated-devnet-peg-in-candidate-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetPegInCandidateV1:
    mocks.assertCandidate,
}));
vi.mock('./substrate-federated-isolated-devnet-peg-in-candidate-v2.js', () => ({
  assertSubstrateFederatedIsolatedDevnetPegInCandidateV2: mocks.assertCandidateV2,
}));
vi.mock(
  './substrate-federated-isolated-devnet-reward-input-discovery-v1.js',
  () => ({
    SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN:
      'http://127.0.0.1:9051',
    SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN:
      'http://127.0.0.1:9052',
  }),
);
vi.mock(
  './substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1:
      mocks.assertOwnedReward,
  }),
);
vi.mock('./substrate-federated-isolated-devnet-setup-check-execution-v2.js', () => ({
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCheckV1:
    mocks.assertExecutionCheck,
}));
vi.mock('./fleet-signer.js', () => ({
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding:
    mocks.assertHandleBinding,
  assertLocalWasmCheckedSubmissionHandleV1Provenance: mocks.assertHandle,
  assertLocalWasmSignedCheckCandidateProvenance: mocks.assertSigned,
}));

import {
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizationArtifactV1,
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1,
  createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1,
  createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV2,
} from './substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer-v1.js';
import {
  admitErgoOperationalTransaction,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
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
const SOURCE_ID = hex('21');
const TX_ID = hex('22');
const UNSIGNED = Object.freeze({ inputs: [{ boxId: SOURCE_ID }] });
const PACKET = Object.freeze({
  boxes: Object.freeze({ sourceFundingInput: Object.freeze({ boxId: SOURCE_ID }) }),
  transactions: Object.freeze({
    sourceLockCreation: Object.freeze({ txId: TX_ID, eip12Tx: UNSIGNED }),
  }),
});
const BATCH = Object.freeze({ request: Object.freeze({ requestDigestHex: hex('23') }) });
const CANDIDATE = Object.freeze({
  candidateDigestHex: hex('24'),
  depositPacket: PACKET,
});
const SIGNED_CANDIDATE = Object.freeze({
  txId: TX_ID,
  signedTransactionDigestHex: hex('25'),
});
const HANDLE = Object.freeze({
  txId: TX_ID,
  nodeOrigin: PRIMARY,
  signedTransactionDigestHex: hex('25'),
  signedTransactionBytesSha256Hex: hex('26'),
  signedTransactionBytesLength: 123,
  checkResponseDigestHex: hex('27'),
});
const CHECK = Object.freeze({
  receipt: Object.freeze({
    sourceFundingBoxIdHex: SOURCE_ID,
    unsignedTransactionIdHex: TX_ID,
    signedTransactionIdHex: TX_ID,
    unsignedTransactionDigestHex: hex('28'),
    signedTransactionCanonicalJsonSha256Hex: hex('25'),
    receiptDigestHex: hex('29'),
  }),
  signedCandidate: SIGNED_CANDIDATE,
  checkedAcceptance: Object.freeze({ submissionHandle: HANDLE }),
});

function observation(byte: string, tipHeight: number) {
  return Object.freeze({
    reportDigestHex: hex(byte),
    sources: Object.freeze({
      primaryNodeOrigin: PRIMARY,
      witnessNodeOrigin: WITNESS,
    }),
    target: Object.freeze({
      network: 'devnet' as const,
      tipHeight,
      tipHeaderIdHex: hex(byte === '31' ? '33' : '34'),
    }),
    genesisInputs: Object.freeze({
      tracker: Object.freeze({ boxId: SOURCE_ID }),
    }),
    boundary: Object.freeze({
      fixedDualLoopbackOrigins: true as const,
      targetBinaryRevalidationRequired: true as const,
    }),
  });
}

const OWNED_OBSERVATIONS = new WeakMap<
  object,
  Readonly<{ observation: ReturnType<typeof observation>; binding: typeof BINDING }>
>();

function ownedObservation(value: ReturnType<typeof observation>) {
  const owned = Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-owned-reward-input-discovery.v1',
    observation: value,
    processBindingDigestHex: BINDING.processBindingDigestHex,
    executionTargetIdentityDigestHex:
      BINDING.executionTargetIdentityDigestHex,
  });
  OWNED_OBSERVATIONS.set(owned, Object.freeze({ observation: value, binding: BINDING }));
  return owned;
}

function fixture(
  create: typeof createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1
    | typeof createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV2
    = createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1,
  candidate: object = CANDIDATE,
  batch: object = BATCH,
) {
  const postCheck = ownedObservation(observation('31', 100));
  const preTransport = ownedObservation(observation('32', 101));
  const authorizer =
    create({
      target: TARGET as never,
      batch: batch as never,
      candidate: candidate as never,
      executionCheck: CHECK as never,
      postCheck: postCheck as never,
      preTransport: preTransport as never,
    });
  const admission = admitErgoOperationalTransaction({
    operationProfile:
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
    expectedTxId: TX_ID,
    sourceBoxId: SOURCE_ID,
    inputBoxIds: [SOURCE_ID],
    attemptedAtHeight: 99,
    unsignedTransaction: UNSIGNED,
  });
  const revalidated = Object.freeze({
    checked: Object.freeze({
      signed: Object.freeze({
        admission,
        nodeOrigin: PRIMARY,
        signedTransactionDigestHex: hex('25'),
        signerArtifact: SIGNED_CANDIDATE,
      }),
      checkResponseDigestHex: hex('27'),
      checkerArtifact: HANDLE,
    }),
    revalidationDigestHex: authorizer.revalidationDigestHex,
  });
  return { authorizer, revalidated };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertTarget.mockImplementation((value: unknown) => {
    if (value !== TARGET) throw new Error('target provenance missing');
    return BINDING;
  });
  mocks.assertCandidate.mockImplementation((candidate, batch, target) => {
    if (candidate !== CANDIDATE || batch !== BATCH || target !== TARGET) {
      throw new Error('candidate provenance missing');
    }
    return PACKET;
  });
  mocks.assertExecutionCheck.mockImplementation((value, target) => {
    if (value !== CHECK || target !== TARGET) {
      throw new Error('execution-check provenance missing');
    }
    return BINDING;
  });
  mocks.assertOwnedReward.mockImplementation((value, target) => {
    const material = OWNED_OBSERVATIONS.get(value);
    const current = mocks.assertTarget(target);
    if (
      material === undefined
      || target !== TARGET
      || value.processBindingDigestHex !== current.processBindingDigestHex
      || value.executionTargetIdentityDigestHex
        !== current.executionTargetIdentityDigestHex
      || material.binding.processBindingDigestHex
        !== current.processBindingDigestHex
      || material.binding.executionTargetIdentityDigestHex
        !== current.executionTargetIdentityDigestHex
    ) {
      throw new Error('owned reward-input discovery lacks target provenance');
    }
    return material.observation;
  });
});

describe('isolated source-lock V2 authorization boundary (mocked provenance and check fields)', () => {
  const candidateV2 = Object.freeze({ ...CANDIDATE, version: 2 });
  const batchV3 = Object.freeze({ ...BATCH, version: 3 });
  const create = createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV2;
  const input = () => ({
    target: TARGET as never, batch: batchV3 as never, candidate: candidateV2 as never,
    executionCheck: CHECK as never,
    postCheck: ownedObservation(observation('31', 100)) as never,
    preTransport: ownedObservation(observation('32', 101)) as never,
  });

  beforeEach(() => {
    mocks.assertCandidateV2.mockImplementation((candidate, batch, target) => {
      if (candidate !== candidateV2 || batch !== batchV3 || target !== TARGET) {
        throw new Error('V2 candidate provenance missing');
      }
      return PACKET;
    });
  });

  it('authorizes the exact V2 candidate once while retaining generic V1 artifact semantics', () => {
    const { authorizer, revalidated } = fixture(create, candidateV2, batchV3);
    const evidence = authorizer.authorize(revalidated as never);
    expect(evidence.authorizationArtifact).toMatchObject({ version: 1, expectedTxId: TX_ID });
    expect(() => assertSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizationArtifactV1(
      authorizer, { revalidated, ...evidence } as never,
    )).not.toThrow();
    expect(() => authorizer.authorize(revalidated as never)).toThrow(/one-shot/);
    expect(mocks.assertCandidate).not.toHaveBeenCalled();
    expect(mocks.assertCandidateV2).toHaveBeenCalledWith(candidateV2, batchV3, TARGET);
  });

  it.each(['V1 candidate', 'copied candidate', 'V1 setup', 'copied target', 'copied check', 'copied postcheck'] as const)(
    'rejects %s before creating V2 authorization authority', fault => {
      const supplied = input();
      if (fault === 'V1 candidate') supplied.candidate = CANDIDATE as never;
      if (fault === 'copied candidate') supplied.candidate = { ...candidateV2 } as never;
      if (fault === 'V1 setup') supplied.batch = BATCH as never;
      if (fault === 'copied target') supplied.target = { ...TARGET } as never;
      if (fault === 'copied check') supplied.executionCheck = { ...CHECK } as never;
      if (fault === 'copied postcheck') supplied.postCheck = { ...ownedObservation(observation('31', 100)) } as never;
      expect(() => create(supplied)).toThrow(/provenance/);
    },
  );

  it('keeps the old entrypoint strictly V1', () => {
    expect(() => createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1(input()))
      .toThrow(/candidate provenance/);
    expect(mocks.assertCandidateV2).not.toHaveBeenCalled();
  });

  it('rechecks the retained V2 guard when authorizing', () => {
    const { authorizer, revalidated } = fixture(create, candidateV2, batchV3);
    mocks.assertCandidateV2.mockImplementation(() => { throw new Error('V2 candidate revoked'); });
    expect(() => authorizer.authorize(revalidated as never)).toThrow(/V2 candidate revoked/);
  });

  it('reads getter-backed candidate and target slots once for the retained guard', () => {
    let candidateReads = 0;
    let targetReads = 0;
    const supplied = {
      ...input(),
      get candidate() { return (++candidateReads === 1 ? candidateV2 : { ...candidateV2 }) as never; },
      get target() { return (++targetReads === 1 ? TARGET : { ...TARGET }) as never; },
    };
    const authorizer = create(supplied);
    expect(() => assertSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1(authorizer, TARGET as never))
      .not.toThrow();
    expect(candidateReads).toBe(1);
    expect(targetReads).toBe(1);
  });

  it.each(['processBindingDigestHex', 'executionTargetIdentityDigestHex'] as const)(
    'rejects retained %s drift before authorization', field => {
      const { authorizer, revalidated } = fixture(create, candidateV2, batchV3);
      mocks.assertTarget.mockReturnValue({ ...BINDING, [field]: hex('ee') });
      expect(() => authorizer.authorize(revalidated as never)).toThrow(/binding changed/);
    },
  );

  it('rejects a backwards V2 pre-transport observation', () => {
    expect(() => create({ ...input(), preTransport: ownedObservation(observation('32', 99)) as never }))
      .toThrow(/moved backwards/);
  });
});

describe('isolated source-lock broadcast authorizer V1', () => {
  it('authorizes one exact checked and freshly revalidated source-lock creation', () => {
    const { authorizer, revalidated } = fixture();
    const evidence = authorizer.authorize(revalidated as never);
    const authorization = Object.freeze({
      revalidated,
      authorizationDigestHex: evidence.authorizationDigestHex,
      authorizationArtifact: evidence.authorizationArtifact,
    });
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizationArtifactV1(
        authorizer,
        authorization as never,
      )
    ).not.toThrow();
    expect(() => authorizer.authorize(revalidated as never)).toThrow(/one-shot/);
  });

  it('rejects a backwards pre-transport view and any copied authorization', () => {
    expect(() =>
      createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        executionCheck: CHECK as never,
        postCheck: ownedObservation(observation('31', 100)) as never,
        preTransport: ownedObservation(observation('32', 99)) as never,
      })
    ).toThrow(/moved backwards/);

    const { authorizer, revalidated } = fixture();
    const evidence = authorizer.authorize(revalidated as never);
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizationArtifactV1(
        authorizer,
        {
          revalidated,
          authorizationDigestHex: evidence.authorizationDigestHex,
          authorizationArtifact: { ...evidence.authorizationArtifact },
        } as never,
      )
    ).toThrow(/provenance/);
  });

  it('rejects copied or cross-process funding bindings', () => {
    const postCheck = ownedObservation(observation('31', 100));
    const preTransport = ownedObservation(observation('32', 101));
    expect(() =>
      createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        executionCheck: CHECK as never,
        postCheck: { ...postCheck } as never,
        preTransport: preTransport as never,
      })
    ).toThrow(/target provenance/);

    mocks.assertTarget.mockReturnValue(Object.freeze({
      processBindingDigestHex: hex('9'),
      executionTargetIdentityDigestHex: hex('8'),
    }));
    expect(() =>
      createSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        executionCheck: CHECK as never,
        postCheck: postCheck as never,
        preTransport: preTransport as never,
      })
    ).toThrow(/target provenance/);
  });

  it('rejects another operation profile before an authorization can exist', () => {
    const { authorizer, revalidated } = fixture();
    const wrong = Object.freeze({
      ...revalidated,
      checked: Object.freeze({
        ...revalidated.checked,
        signed: Object.freeze({
          ...revalidated.checked.signed,
          admission: Object.freeze({
            ...revalidated.checked.signed.admission,
            operationProfile: 'e2s.peg-in-committed-vault-operation.v1',
          }),
        }),
      }),
    });
    expect(() => authorizer.authorize(wrong as never)).toThrow(/binding changed/);
  });
});
