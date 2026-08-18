import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertBatch: vi.fn(),
  assertConfirmationArtifact: vi.fn(),
  assertConfirmationObserver: vi.fn(),
  assertHandleBinding: vi.fn(),
  assertHandleProvenance: vi.fn(),
  assertRevalidationArtifact: vi.fn(),
  assertTarget: vi.fn(),
}));

vi.mock(
  './substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1:
      mocks.assertConfirmationArtifact,
    assertSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1:
      mocks.assertConfirmationObserver,
  }),
);

vi.mock('./fleet-signer.js', () => ({
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding:
    mocks.assertHandleBinding,
  assertLocalWasmCheckedSubmissionHandleV1Provenance:
    mocks.assertHandleProvenance,
}));

vi.mock(
  './substrate-federated-isolated-devnet-genesis-revalidator-v1.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetGenesisRevalidationArtifactV1:
      mocks.assertRevalidationArtifact,
  }),
);

vi.mock('./substrate-federated-isolated-devnet-ergo-node-process-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1:
    mocks.assertTarget,
}));

vi.mock('./substrate-federated-isolated-devnet-setup-check-execution-v2.js', () => ({
  assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV2:
    mocks.assertBatch,
}));

import {
  assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV1,
  assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1,
  assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV1,
  createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1,
} from './substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.js';
import {
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_EXECUTION_V1_SCHEMA,
  deriveSubstrateFederatedLocalDevnetGenesisAdmissionDigestV1,
} from './relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';

const hex = (byte: string): string => byte.repeat(32);
const PRIMARY_ORIGIN = 'http://127.0.0.1:9051' as const;
const WITNESS_ORIGIN = 'http://127.0.0.1:9052' as const;
const REQUEST_DIGEST = hex('11');
const GENESIS_HEADER_ID = hex('12');
const PROCESS_BINDING = hex('13');
const EXECUTION_IDENTITY = hex('14');
const BOX_DIGEST = hex('15');
const SIGMA_DIGEST = hex('16');

const BINDING = Object.freeze({
  processBindingDigestHex: PROCESS_BINDING,
  executionTargetIdentityDigestHex: EXECUTION_IDENTITY,
});
const TARGET = Object.freeze({
  primaryNodeOrigin: PRIMARY_ORIGIN,
  witnessNodeOrigin: WITNESS_ORIGIN,
  primaryMining: true as const,
  witnessReadOnly: true as const,
});
const REVALIDATOR = Object.freeze({
  schema: 'e2s.substrate-federated-isolated-devnet-genesis-revalidator.v1',
});
const CONFIRMATION_OBSERVER = Object.freeze({
  schema:
    'e2s.substrate-federated-isolated-devnet-genesis-confirmation-observer.v1',
  reconciliationIdentityDigestHex: EXECUTION_IDENTITY,
});

type CoreRole = 'tracker' | 'duplicatePrevention' | 'pooledReserve';
type SetupRole = 'tracker' | 'duplicate-prevention' | 'pooled-reserve';

interface EvidenceRecord {
  readonly checked: object;
  readonly phase: 'post-check' | 'pre-transport';
  readonly evidence: Readonly<Record<string, unknown>>;
}

let activeBatch: object;
let currentProcessBinding = PROCESS_BINDING;
let currentExecutionIdentity = EXECUTION_IDENTITY;
let handles = new WeakSet<object>();
let consumedHandles = new WeakSet<object>();
let evidenceRecords = new WeakMap<object, EvidenceRecord>();
let confirmationRecords = new WeakMap<object, Readonly<{
  expectedTxId: string;
  confirmation: Readonly<Record<string, unknown>>;
}>>();

beforeEach(() => {
  vi.clearAllMocks();
  currentProcessBinding = PROCESS_BINDING;
  currentExecutionIdentity = EXECUTION_IDENTITY;
  handles = new WeakSet<object>();
  consumedHandles = new WeakSet<object>();
  evidenceRecords = new WeakMap<object, EvidenceRecord>();
  confirmationRecords = new WeakMap();
  mocks.assertTarget.mockImplementation((value: unknown) => {
    if (value !== TARGET) {
      throw new Error('synthetic execution target provenance is missing');
    }
    return Object.freeze({
      processBindingDigestHex: currentProcessBinding,
      executionTargetIdentityDigestHex: currentExecutionIdentity,
    });
  });
  mocks.assertBatch.mockImplementation((value: unknown, target: unknown) => {
    if (value !== activeBatch || target !== TARGET) {
      throw new Error('synthetic setup batch provenance is missing');
    }
    return Object.freeze({
      processBindingDigestHex: currentProcessBinding,
      executionTargetIdentityDigestHex: currentExecutionIdentity,
    });
  });
  mocks.assertConfirmationObserver.mockImplementation((
    value: unknown,
    reconciliationIdentityDigestHex: string,
  ) => {
    if (
      value !== CONFIRMATION_OBSERVER
      || reconciliationIdentityDigestHex !== currentExecutionIdentity
    ) {
      throw new Error('synthetic confirmation observer provenance is missing');
    }
  });
  mocks.assertConfirmationArtifact.mockImplementation((
    artifact: object,
    reconciliationIdentityDigestHex: string,
    targetGenesisHeaderIdHex: string,
    expectedTxId: string,
    expectedConfirmation: Readonly<Record<string, unknown>>,
  ) => {
    const record = confirmationRecords.get(artifact);
    const confirmation = record?.confirmation;
    if (
      record === undefined
      || reconciliationIdentityDigestHex !== EXECUTION_IDENTITY
      || targetGenesisHeaderIdHex !== GENESIS_HEADER_ID
      || record.expectedTxId !== expectedTxId
      || expectedConfirmation.observerArtifact !== artifact
      || confirmation?.status !== expectedConfirmation.status
      || confirmation?.confirmations !== expectedConfirmation.confirmations
      || confirmation?.observedAtHeight
        !== expectedConfirmation.observedAtHeight
      || confirmation?.observationDigestHex
        !== expectedConfirmation.observationDigestHex
      || confirmation?.confirmationHeight
        !== expectedConfirmation.confirmationHeight
      || confirmation?.confirmationHeaderIdHex
        !== expectedConfirmation.confirmationHeaderIdHex
    ) {
      throw new Error('synthetic confirmation artifact is not exact');
    }
  });
  mocks.assertHandleProvenance.mockImplementation((value: unknown) => {
    if (
      value === null
      || typeof value !== 'object'
      || !handles.has(value)
      || consumedHandles.has(value)
    ) {
      throw new Error('synthetic checked handle provenance is missing');
    }
  });
  mocks.assertHandleBinding.mockImplementation((
    value: unknown,
    binding: Readonly<{
      processBindingDigestHex: string;
      executionTargetIdentityDigestHex: string;
    }>,
  ) => {
    mocks.assertHandleProvenance(value);
    if (
      binding.processBindingDigestHex !== PROCESS_BINDING
      || binding.executionTargetIdentityDigestHex !== EXECUTION_IDENTITY
    ) {
      throw new Error('synthetic checked handle execution binding changed');
    }
  });
  mocks.assertRevalidationArtifact.mockImplementation((
    revalidator: unknown,
    artifact: object,
    expectation: Readonly<Record<string, unknown>>,
  ) => {
    const record = evidenceRecords.get(artifact);
    const evidence = record?.evidence;
    if (
      revalidator !== REVALIDATOR
      || record === undefined
      || record.checked !== expectation.checkedCandidate
      || record.phase !== expectation.phase
      || evidence?.sourceBoxId !== expectation.sourceBoxId
      || evidence?.targetGenesisHeaderIdHex
        !== expectation.targetGenesisHeaderIdHex
      || evidence?.observedAtHeight !== expectation.observedAtHeight
      || evidence?.observedTipHeaderIdHex
        !== expectation.observedTipHeaderIdHex
      || evidence?.sourceBoxDigestHex !== expectation.sourceBoxDigestHex
      || evidence?.sourceBoxSigmaSerializedSha256Hex
        !== expectation.sourceBoxSigmaSerializedSha256Hex
      || evidence?.observationDigestHex !== expectation.observationDigestHex
    ) {
      throw new Error('synthetic revalidation artifact is not exact');
    }
  });
});

function harness() {
  const specs = [
    ['tracker', 'tracker', '21', '31', '41', '51'],
    ['duplicatePrevention', 'duplicate-prevention', '22', '32', '42', '52'],
    ['pooledReserve', 'pooled-reserve', '23', '33', '43', '53'],
  ] as const;
  const checkedByRole = new Map<CoreRole, any>();
  const transactions = specs.map(([
    coreRole,
    setupRole,
    sourceByte,
    txByte,
    signedByte,
    checkByte,
  ], ordinal) => {
    const sourceBoxId = hex(sourceByte);
    const expectedTxId = hex(txByte);
    const unsignedTransactionBody = Object.freeze({
      inputs: Object.freeze([Object.freeze({
        boxId: sourceBoxId,
        extension: Object.freeze({}),
      })]),
      dataInputs: Object.freeze([]),
      outputs: Object.freeze([]),
    });
    const signedCandidate = Object.freeze({
      role: setupRole,
      txId: expectedTxId,
      nodeOrigin: PRIMARY_ORIGIN,
      signedTransactionDigestHex: hex(signedByte),
    });
    const submissionHandle = Object.freeze({
      txId: expectedTxId,
      checkResponseDigestHex: hex(checkByte),
    });
    handles.add(submissionHandle);
    const admissionBinding = Object.freeze({
      role: coreRole,
      planDigestHex: REQUEST_DIGEST,
      targetGenesisHeaderIdHex: GENESIS_HEADER_ID,
      expectedTxId,
      sourceBoxId,
      inputBoxIds: Object.freeze([sourceBoxId]),
      attemptedAtHeight: 120,
      nodeOrigin: PRIMARY_ORIGIN,
    });
    const admission = Object.freeze({
      schema: SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_EXECUTION_V1_SCHEMA,
      ...admissionBinding,
      admissionDigestHex:
        deriveSubstrateFederatedLocalDevnetGenesisAdmissionDigestV1(
          admissionBinding,
        ),
      unsignedTransaction: unsignedTransactionBody,
    });
    const checked = Object.freeze({
      signed: Object.freeze({
        admission,
        signedTransactionDigestHex: signedCandidate.signedTransactionDigestHex,
        signerArtifact: signedCandidate,
      }),
      checkResponseDigestHex: submissionHandle.checkResponseDigestHex,
      checkerArtifact: submissionHandle,
    });
    checkedByRole.set(coreRole, checked);
    return Object.freeze({
      issuance: Object.freeze({
        ordinal: ordinal as 0 | 1 | 2,
        role: setupRole as SetupRole,
        genesisInputBoxIdHex: sourceBoxId,
        unsignedTransactionIdHex: expectedTxId,
        unsignedTransactionBody,
      }),
      signedCandidate,
      checkedAcceptance: Object.freeze({
        checked: Object.freeze({ txId: expectedTxId }),
        submissionHandle,
      }),
    });
  });
  const batch = Object.freeze({
    receipt: Object.freeze({}),
    request: Object.freeze({
      requestDigestHex: REQUEST_DIGEST,
      target: Object.freeze({
        genesisHeaderIdHex: GENESIS_HEADER_ID,
        primary: Object.freeze({
          nodeOrigin: PRIMARY_ORIGIN,
          sourceIdHex: hex('61'),
        }),
        witness: Object.freeze({
          nodeOrigin: WITNESS_ORIGIN,
          sourceIdHex: hex('62'),
        }),
      }),
    }),
    targetBinding: BINDING,
    orderedTransactions: Object.freeze(transactions),
  });
  activeBatch = batch;
  const authorizer =
    createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1(
      TARGET as any,
      batch as any,
      REVALIDATOR as any,
      CONFIRMATION_OBSERVER as any,
    );
  return { authorizer, batch, checkedByRole };
}

function confirmation(checked: any) {
  const observerArtifact = Object.freeze({
    expectedTxId: checked.signed.admission.expectedTxId,
  });
  const value = Object.freeze({
    status: 'confirmed' as const,
    confirmations: 10,
    observedAtHeight: 139,
    observationDigestHex: hex('78'),
    confirmationHeight: 129,
    confirmationHeaderIdHex: hex('79'),
    observerArtifact,
  });
  confirmationRecords.set(observerArtifact, Object.freeze({
    expectedTxId: checked.signed.admission.expectedTxId,
    confirmation: value,
  }));
  return value;
}

function evidence(
  checked: any,
  phase: 'post-check' | 'pre-transport',
  overrides: Readonly<Record<string, unknown>> = {},
) {
  const artifact = Object.freeze({ phase });
  const value = Object.freeze({
    sourceBoxId: checked.signed.admission.sourceBoxId,
    sourceBoxUnspent: true as const,
    targetGenesisHeaderIdHex: GENESIS_HEADER_ID,
    observedAtHeight: phase === 'post-check' ? 120 : 121,
    observedTipHeaderIdHex:
      phase === 'post-check' ? hex('71') : hex('72'),
    sourceBoxDigestHex: BOX_DIGEST,
    sourceBoxSigmaSerializedSha256Hex: SIGMA_DIGEST,
    observationDigestHex:
      phase === 'post-check' ? hex('73') : hex('74'),
    revalidationArtifact: artifact,
    ...overrides,
  });
  evidenceRecords.set(artifact, Object.freeze({
    checked,
    phase,
    evidence: value,
  }));
  return value;
}

function authorizationInput(checked: any) {
  const postCheckEvidence = evidence(checked, 'post-check');
  const preTransportEvidence = evidence(checked, 'pre-transport');
  return {
    revalidated: Object.freeze({ checked, postCheckEvidence }),
    preTransportEvidence,
  };
}

describe('isolated devnet genesis broadcast authorizer V1', () => {
  it('issues and reasserts one exact authorization for each canonical role', () => {
    const { authorizer, checkedByRole } = harness();
    assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1(
      authorizer,
      TARGET as any,
    );
    const digests = new Set<string>();
    for (const role of [
      'tracker',
      'duplicatePrevention',
      'pooledReserve',
    ] as const) {
      const input = authorizationInput(checkedByRole.get(role));
      const result = authorizer.authorize(
        input.revalidated,
        input.preTransportEvidence,
      );
      expect(result.authorizationDigestHex).toMatch(/^[0-9a-f]{64}$/u);
      digests.add(result.authorizationDigestHex);
      assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV1(
        authorizer,
        result.authorizationArtifact,
        {
          ...input,
          authorizationDigestHex: result.authorizationDigestHex,
        },
      );
      authorizer.acknowledgeCanonicalConfirmation(
        role,
        confirmation(checkedByRole.get(role)),
      );
    }
    expect(digests.size).toBe(3);
    expect(mocks.assertRevalidationArtifact).toHaveBeenCalledTimes(12);
    assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV1(
      authorizer,
      TARGET as any,
    );
  });

  it('rejects setup authorization outside the canonical dependency order', () => {
    const { authorizer, checkedByRole } = harness();
    const input = authorizationInput(checkedByRole.get('duplicatePrevention'));
    expect(() => authorizer.authorize(
      input.revalidated,
      input.preTransportEvidence,
    )).toThrow('authorization order is invalid');
  });

  it('rejects one checked handle reused across setup roles', () => {
    const { batch } = harness();
    const duplicateBatch = Object.freeze({
      ...batch,
      orderedTransactions: Object.freeze([
        batch.orderedTransactions[0],
        Object.freeze({
          ...batch.orderedTransactions[1],
          checkedAcceptance: Object.freeze({
            ...batch.orderedTransactions[1].checkedAcceptance,
            submissionHandle:
              batch.orderedTransactions[0].checkedAcceptance.submissionHandle,
          }),
        }),
        batch.orderedTransactions[2],
      ]),
    });
    activeBatch = duplicateBatch;
    expect(() =>
      createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1(
        TARGET as any,
        duplicateBatch as any,
        REVALIDATOR as any,
        CONFIRMATION_OBSERVER as any,
      )).toThrow('role or handle is duplicated');
  });

  it('requires exact predecessor confirmation before the next role', () => {
    const { authorizer, checkedByRole } = harness();
    const tracker = checkedByRole.get('tracker');
    const trackerInput = authorizationInput(tracker);
    authorizer.authorize(
      trackerInput.revalidated,
      trackerInput.preTransportEvidence,
    );
    const duplicatePrevention = checkedByRole.get('duplicatePrevention');
    const duplicateInput = authorizationInput(duplicatePrevention);
    expect(() => authorizer.authorize(
      duplicateInput.revalidated,
      duplicateInput.preTransportEvidence,
    )).toThrow('predecessor confirmation is required');
    expect(() => authorizer.acknowledgeCanonicalConfirmation(
      'duplicatePrevention',
      confirmation(tracker),
    )).toThrow('does not match a pending role');

    const trackerConfirmation = confirmation(tracker);
    expect(() => authorizer.acknowledgeCanonicalConfirmation(
      'tracker',
      Object.freeze({
        ...trackerConfirmation,
        observerArtifact: Object.freeze({ forged: true }),
      }),
    )).toThrow('confirmation artifact is not exact');
    expect(() => authorizer.acknowledgeCanonicalConfirmation(
      'tracker',
      Object.freeze({
        ...trackerConfirmation,
        observedAtHeight: 140,
        confirmationHeight: 130,
      }),
    )).toThrow('confirmation artifact is not exact');
    authorizer.acknowledgeCanonicalConfirmation(
      'tracker',
      trackerConfirmation,
    );
    expect(() => authorizer.authorize(
      duplicateInput.revalidated,
      duplicateInput.preTransportEvidence,
    )).not.toThrow();
  });

  it('rejects phase substitution and copied authorization artifacts', () => {
    const { authorizer, checkedByRole } = harness();
    const input = authorizationInput(checkedByRole.get('tracker'));
    const swappedPost = Object.freeze({
      ...input.revalidated.postCheckEvidence,
      revalidationArtifact:
        input.preTransportEvidence.revalidationArtifact,
    });
    expect(() => authorizer.authorize(
      Object.freeze({
        checked: input.revalidated.checked,
        postCheckEvidence: swappedPost,
      }),
      input.preTransportEvidence,
    )).toThrow('synthetic revalidation artifact is not exact');

    const exact = authorizer.authorize(
      input.revalidated,
      input.preTransportEvidence,
    );
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV1(
        authorizer,
        structuredClone(exact.authorizationArtifact),
        {
          ...input,
          authorizationDigestHex: exact.authorizationDigestHex,
        },
      )).toThrow('lacks exact process provenance');
  });

  it('rejects source-byte drift between post-check and pre-transport', () => {
    const { authorizer, checkedByRole } = harness();
    const checked = checkedByRole.get('tracker');
    const postCheckEvidence = evidence(checked, 'post-check');
    const preTransportEvidence = evidence(checked, 'pre-transport', {
      sourceBoxDigestHex: hex('75'),
    });
    expect(() => authorizer.authorize(
      Object.freeze({ checked, postCheckEvidence }),
      preTransportEvidence,
    )).toThrow('revalidation continuity changed');
  });

  it('rejects a regressing pre-transport observation height', () => {
    const { authorizer, checkedByRole } = harness();
    const checked = checkedByRole.get('tracker');
    const postCheckEvidence = evidence(checked, 'post-check');
    const preTransportEvidence = evidence(checked, 'pre-transport', {
      observedAtHeight: 119,
    });
    expect(() => authorizer.authorize(
      Object.freeze({ checked, postCheckEvidence }),
      preTransportEvidence,
    )).toThrow('revalidation continuity changed');
  });

  it('rejects consumed handles and process replacement before authorization', () => {
    const { authorizer, checkedByRole } = harness();
    const checked = checkedByRole.get('tracker');
    const handle = checked.checkerArtifact as object;
    consumedHandles.add(handle);
    const consumedInput = authorizationInput(checked);
    expect(() => authorizer.authorize(
      consumedInput.revalidated,
      consumedInput.preTransportEvidence,
    )).toThrow('checked handle provenance is missing');

    consumedHandles.delete(handle);
    currentProcessBinding = hex('76');
    const driftedInput = authorizationInput(checked);
    expect(() => authorizer.authorize(
      driftedInput.revalidated,
      driftedInput.preTransportEvidence,
    )).toThrow('broadcast authorizer process changed');
  });

  it('rejects a copied authorizer and a different target', () => {
    const { authorizer } = harness();
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1(
        Object.freeze({ ...authorizer }) as any,
        TARGET as any,
      )).toThrow('lacks provenance');
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1(
        authorizer,
        Object.freeze({ ...TARGET }) as any,
      )).toThrow('lacks provenance');
  });
});
