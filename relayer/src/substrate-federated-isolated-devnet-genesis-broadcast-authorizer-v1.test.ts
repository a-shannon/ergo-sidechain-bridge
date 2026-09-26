import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertBatch: vi.fn(),
  assertBatchV3: vi.fn(),
  assertNativeBatch: vi.fn(),
  assertConfirmationArtifact: vi.fn(),
  assertConfirmationObserver: vi.fn(),
  assertHandleBinding: vi.fn(),
  assertHandleProvenance: vi.fn(),
  assertRevalidationArtifact: vi.fn(),
  assertRevalidationArtifactV2: vi.fn(),
  assertNativeRevalidationArtifact: vi.fn(),
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
    assertSubstrateFederatedIsolatedDevnetGenesisRevalidationArtifactV2:
      mocks.assertRevalidationArtifactV2,
    assertSubstrateFederatedNativeGenesisRevalidationArtifactV1:
      mocks.assertNativeRevalidationArtifact,
  }),
);

vi.mock('./substrate-federated-isolated-devnet-ergo-node-process-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1:
    mocks.assertTarget,
}));

vi.mock('./substrate-federated-isolated-devnet-setup-check-execution-v2.js', () => ({
  assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV2:
    mocks.assertBatch,
  assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV3:
    mocks.assertBatchV3,
  assertSubstrateFederatedNativeGenesisSetupExecutionBatchV1:
    mocks.assertNativeBatch,
}));

import {
  assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV1,
  assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1,
  assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV1,
  createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1,
  assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV2,
  assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2,
  assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV2,
  createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2,
  assertSubstrateFederatedNativeGenesisBroadcastAuthorizationArtifactV1,
  assertSubstrateFederatedNativeGenesisBroadcastAuthorizerV1,
  assertSubstrateFederatedNativeGenesisSetupConfirmedV1,
  createSubstrateFederatedNativeGenesisBroadcastAuthorizerV1,
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
const REVALIDATORS = Object.freeze({
  1: Object.freeze({
    schema: 'e2s.substrate-federated-isolated-devnet-genesis-revalidator.v1',
  }),
  2: Object.freeze({
    schema: 'e2s.substrate-federated-isolated-devnet-genesis-revalidator.v2',
  }),
  native: Object.freeze({
    schema: 'e2s.substrate-federated-native-genesis-revalidator.v1',
  }),
});
const CONFIRMATION_OBSERVER = Object.freeze({
  schema:
    'e2s.substrate-federated-isolated-devnet-genesis-confirmation-observer.v1',
  reconciliationIdentityDigestHex: EXECUTION_IDENTITY,
});

type CoreRole = 'tracker' | 'duplicatePrevention' | 'pooledReserve';
type SetupRole = 'tracker' | 'duplicate-prevention' | 'pooled-reserve';
const PROFILES = [1, 2, 'native'] as const;
type Version = typeof PROFILES[number];

const APIS = {
  1: {
    create: createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1,
    assertAuthorizer: assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1,
    assertArtifact: assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV1,
    assertConfirmed: assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV1,
    assertBatch: mocks.assertBatch,
    assertRevalidationArtifact: mocks.assertRevalidationArtifact,
  },
  2: {
    create: createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2,
    assertAuthorizer: assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2,
    assertArtifact: assertSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizationArtifactV2,
    assertConfirmed: assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV2,
    assertBatch: mocks.assertBatchV3,
    assertRevalidationArtifact: mocks.assertRevalidationArtifactV2,
  },
  native: {
    create: createSubstrateFederatedNativeGenesisBroadcastAuthorizerV1,
    assertAuthorizer: assertSubstrateFederatedNativeGenesisBroadcastAuthorizerV1,
    assertArtifact: assertSubstrateFederatedNativeGenesisBroadcastAuthorizationArtifactV1,
    assertConfirmed: assertSubstrateFederatedNativeGenesisSetupConfirmedV1,
    assertBatch: mocks.assertNativeBatch,
    assertRevalidationArtifact: mocks.assertNativeRevalidationArtifact,
  },
} as const;

interface EvidenceRecord {
  readonly version: Version;
  readonly checked: object;
  readonly phase: 'post-check' | 'pre-transport';
  readonly evidence: Readonly<Record<string, unknown>>;
}

let batches = new WeakMap<object, Version>();
let checkedVersions = new WeakMap<object, Version>();
let currentProcessBinding = PROCESS_BINDING;
let currentExecutionIdentity = EXECUTION_IDENTITY;
let currentBatchProcessBinding = PROCESS_BINDING;
let currentBatchExecutionIdentity = EXECUTION_IDENTITY;
let handles = new WeakSet<object>();
let consumedHandles = new WeakSet<object>();
let evidenceRecords = new WeakMap<object, EvidenceRecord>();
let confirmationRecords = new WeakMap<object, Readonly<{
  expectedTxId: string;
  confirmation: Readonly<Record<string, unknown>>;
}>>();

beforeEach(() => {
  vi.clearAllMocks();
  batches = new WeakMap<object, Version>();
  checkedVersions = new WeakMap<object, Version>();
  currentProcessBinding = PROCESS_BINDING;
  currentExecutionIdentity = EXECUTION_IDENTITY;
  currentBatchProcessBinding = PROCESS_BINDING;
  currentBatchExecutionIdentity = EXECUTION_IDENTITY;
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
  for (const version of PROFILES) {
    APIS[version].assertBatch.mockImplementation((value: object, target: unknown) => {
      if (batches.get(value) !== version || target !== TARGET) {
        throw new Error('synthetic setup batch provenance is missing');
      }
      return Object.freeze({
        processBindingDigestHex: currentBatchProcessBinding,
        executionTargetIdentityDigestHex: currentBatchExecutionIdentity,
      });
    });
  }
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
  for (const version of PROFILES) {
    APIS[version].assertRevalidationArtifact.mockImplementation((
      revalidator: unknown,
      artifact: object,
      expectation: Readonly<Record<string, unknown>>,
    ) => {
      const record = evidenceRecords.get(artifact);
      const evidence = record?.evidence;
      if (
        revalidator !== REVALIDATORS[version]
        || record === undefined
        || record.version !== version
        || record.checked !== expectation.checkedCandidate
        || record.phase !== expectation.phase
        || (record.checked as any).signed.admission.role !== expectation.role
        || (record.checked as any).signed.admission.expectedTxId !== expectation.expectedTxId
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
  }
});

function harness(version: Version) {
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
    checkedVersions.set(checked, version);
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
  batches.set(batch, version);
  const authorizer = APIS[version].create(
    TARGET as any,
    batch as any,
    REVALIDATORS[version] as any,
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
    version: checkedVersions.get(checked)!,
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

function expectedDigest(
  version: Version,
  input: ReturnType<typeof authorizationInput>,
  ordinal: number,
): string {
  const checked = input.revalidated.checked;
  const admission = checked.signed.admission;
  const projectEvidence = (value: Readonly<Record<string, unknown>>) => ({
    observedAtHeight: value.observedAtHeight,
    observedTipHeaderIdHex: value.observedTipHeaderIdHex,
    sourceBoxDigestHex: value.sourceBoxDigestHex,
    sourceBoxSigmaSerializedSha256Hex: value.sourceBoxSigmaSerializedSha256Hex,
    observationDigestHex: value.observationDigestHex,
  });
  const projection = {
    schema: version === 'native'
      ? 'e2s.substrate-federated-native-genesis-broadcast-authorizer.v1'
      : `e2s.substrate-federated-isolated-devnet-genesis-broadcast-authorizer.v${version}`,
    authorizationScope: version === 'native'
      ? 'fed-native-local-synthetic-genesis-setup-only'
      : 'fed-6-lab-local-synthetic-genesis-setup-only',
    processBindingDigestHex: PROCESS_BINDING,
    executionTargetIdentityDigestHex: EXECUTION_IDENTITY,
    requestDigestHex: REQUEST_DIGEST,
    role: admission.role,
    ordinal,
    targetGenesisHeaderIdHex: admission.targetGenesisHeaderIdHex,
    expectedTxId: admission.expectedTxId,
    admissionDigestHex: admission.admissionDigestHex,
    sourceBoxId: admission.sourceBoxId,
    signedTransactionDigestHex: checked.signed.signedTransactionDigestHex,
    checkResponseDigestHex: checked.checkResponseDigestHex,
    postCheck: projectEvidence(input.revalidated.postCheckEvidence),
    preTransport: projectEvidence(input.preTransportEvidence),
  };
  // Independent encoding and hashing; do not call the production digest helper.
  const canonical = JSON.stringify(projection, (_key, value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]))
      : value);
  return createHash('sha256')
    .update(version === 'native'
      ? 'E2S_SUBSTRATE_FEDERATED_NATIVE_GENESIS_BROADCAST_AUTHORIZATION_V1'
      : `E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_BROADCAST_AUTHORIZATION_V${version}`, 'ascii')
    .update('\0', 'ascii')
    .update(canonical, 'utf8')
    .digest('hex');
}

describe.each(PROFILES)('genesis broadcast authorizer profile %s', (version) => {
  const api = APIS[version];
  const otherProfiles = PROFILES.filter(profile => profile !== version);
  const setup = () => harness(version);

  it('issues and reasserts one exact authorization for each canonical role', () => {
    const { authorizer, checkedByRole } = setup();
    api.assertAuthorizer(
      authorizer as any,
      TARGET as any,
    );
    expect(() => api.assertConfirmed(authorizer as any, TARGET as any))
      .toThrow('isolated genesis setup is not canonically confirmed');
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
      expect(authorizer.schema).toBe(
        version === 'native'
          ? 'e2s.substrate-federated-native-genesis-broadcast-authorizer.v1'
          : `e2s.substrate-federated-isolated-devnet-genesis-broadcast-authorizer.v${version}`,
      );
      expect(result.authorizationArtifact).toEqual({
        schema: authorizer.schema,
        version: version === 'native' ? 1 : version,
        authorizationScope: version === 'native'
          ? 'fed-native-local-synthetic-genesis-setup-only'
          : 'fed-6-lab-local-synthetic-genesis-setup-only',
        role,
        ordinal: digests.size,
        expectedTxId: input.revalidated.checked.signed.admission.expectedTxId,
        authorizationDigestHex: expectedDigest(version, input, digests.size),
      });
      expect(result.authorizationDigestHex).toBe(expectedDigest(version, input, digests.size));
      expect(Object.isFrozen(result.authorizationArtifact)).toBe(true);
      digests.add(result.authorizationDigestHex);
      api.assertArtifact(
        authorizer as any,
        result.authorizationArtifact,
        {
          ...input,
          authorizationDigestHex: result.authorizationDigestHex,
        },
      );
      expect(() => api.assertConfirmed(authorizer as any, TARGET as any))
        .toThrow('isolated genesis setup is not canonically confirmed');
      authorizer.acknowledgeCanonicalConfirmation(
        role,
        confirmation(checkedByRole.get(role)),
      );
    }
    expect(digests.size).toBe(3);
    expect(api.assertRevalidationArtifact).toHaveBeenCalledTimes(12);
    expect(api.assertBatch).toHaveBeenCalled();
    for (const otherProfile of otherProfiles) {
      expect(APIS[otherProfile].assertRevalidationArtifact).not.toHaveBeenCalled();
      expect(APIS[otherProfile].assertBatch).not.toHaveBeenCalled();
    }
    api.assertConfirmed(
      authorizer as any,
      TARGET as any,
    );
    for (const otherProfile of otherProfiles) {
      expect(() => APIS[otherProfile].assertConfirmed(authorizer as any, TARGET as any))
        .toThrow('isolated genesis broadcast authorizer version differs');
    }
  });

  it.each(otherProfiles)('rejects profile %s batch factory and authorizer guard', oppositeVersion => {
    const opposite = APIS[oppositeVersion];
    const { authorizer, batch } = setup();
    expect(() => opposite.create(
      TARGET as any,
      batch as any,
      REVALIDATORS[oppositeVersion] as any,
      CONFIRMATION_OBSERVER as any,
    )).toThrow('synthetic setup batch provenance is missing');
    expect(() => opposite.assertAuthorizer(authorizer as any, TARGET as any))
      .toThrow('isolated genesis broadcast authorizer version differs');
    expect(() => api.assertAuthorizer(authorizer as any, TARGET as any)).not.toThrow();
  });

  it.each(otherProfiles)('rejects profile %s artifact guard for an otherwise exact authorization', oppositeVersion => {
    const opposite = APIS[oppositeVersion];
    const { authorizer, checkedByRole } = setup();
    const input = authorizationInput(checkedByRole.get('tracker'));
    const result = authorizer.authorize(input.revalidated, input.preTransportEvidence);
    const expectation = { ...input, authorizationDigestHex: result.authorizationDigestHex };
    expect(() => api.assertArtifact(authorizer as any, result.authorizationArtifact, expectation))
      .not.toThrow();
    expect(() => opposite.assertArtifact(authorizer as any, result.authorizationArtifact, expectation))
      .toThrow('isolated genesis broadcast authorizer version differs');
  });

  it.each(otherProfiles)('rejects profile %s revalidator through the exact artifact guard on authorize', oppositeVersion => {
    const opposite = APIS[oppositeVersion];
    const { batch, checkedByRole } = setup();
    const wrong = api.create(
      TARGET as any,
      batch as any,
      REVALIDATORS[oppositeVersion] as any,
      CONFIRMATION_OBSERVER as any,
    );
    const input = authorizationInput(checkedByRole.get('tracker'));
    expect(() => wrong.authorize(input.revalidated, input.preTransportEvidence))
      .toThrow('synthetic revalidation artifact is not exact');
    expect(api.assertRevalidationArtifact).toHaveBeenCalledWith(
      REVALIDATORS[oppositeVersion],
      input.revalidated.postCheckEvidence.revalidationArtifact,
      expect.objectContaining({ checkedCandidate: input.revalidated.checked, phase: 'post-check' }),
    );
    expect(opposite.assertRevalidationArtifact).not.toHaveBeenCalled();
  });

  it.each(PROFILES)('prevents another profile %s instance from authorizing the same handle', (otherVersion) => {
    const { authorizer, batch, checkedByRole } = setup();
    const otherBatch = Object.freeze({ ...batch });
    batches.set(otherBatch, otherVersion);
    const other = APIS[otherVersion].create(
      TARGET as any,
      otherBatch as any,
      REVALIDATORS[otherVersion] as any,
      CONFIRMATION_OBSERVER as any,
    );
    const checked = checkedByRole.get('tracker');
    const input = authorizationInput(checked);
    authorizer.authorize(input.revalidated, input.preTransportEvidence);
    checkedVersions.set(checked, otherVersion);
    const otherInput = authorizationInput(checked);
    expect(() => other.authorize(otherInput.revalidated, otherInput.preTransportEvidence))
      .toThrow('checked handle is already authorized');
  });

  it.each(PROFILES)('rejects an artifact presented to a different profile %s instance', (otherVersion) => {
    const { authorizer, batch, checkedByRole } = setup();
    const otherBatch = Object.freeze({ ...batch });
    batches.set(otherBatch, otherVersion);
    const other = APIS[otherVersion].create(
      TARGET as any,
      otherBatch as any,
      REVALIDATORS[otherVersion] as any,
      CONFIRMATION_OBSERVER as any,
    );
    const input = authorizationInput(checkedByRole.get('tracker'));
    const result = authorizer.authorize(input.revalidated, input.preTransportEvidence);
    expect(() => APIS[otherVersion].assertArtifact(other as any, result.authorizationArtifact, {
      ...input,
      authorizationDigestHex: result.authorizationDigestHex,
    })).toThrow('lacks exact process provenance');
  });

  it.each(['revalidated', 'preTransportEvidence', 'authorizationDigestHex'] as const)(
    'rejects an isolated %s expectation substitution', (field) => {
      const { authorizer, checkedByRole } = setup();
      const input = authorizationInput(checkedByRole.get('tracker'));
      const result = authorizer.authorize(input.revalidated, input.preTransportEvidence);
      const expectation = { ...input, authorizationDigestHex: result.authorizationDigestHex };
      const replacement = field === 'authorizationDigestHex'
        ? hex('90') : Object.freeze({ ...expectation[field] });
      expect(() => api.assertArtifact(authorizer as any, result.authorizationArtifact, {
        ...expectation,
        [field]: replacement,
      })).toThrow('lacks exact process provenance');
      expect(() => api.assertArtifact(authorizer as any, result.authorizationArtifact, expectation))
        .not.toThrow();
    },
  );

  it('invalidates an existing authorization when its handle is consumed', () => {
    const { authorizer, checkedByRole } = setup();
    const checked = checkedByRole.get('tracker');
    const input = authorizationInput(checked);
    const result = authorizer.authorize(input.revalidated, input.preTransportEvidence);
    const expectation = { ...input, authorizationDigestHex: result.authorizationDigestHex };
    api.assertArtifact(authorizer as any, result.authorizationArtifact, expectation);
    consumedHandles.add(checked.checkerArtifact);
    expect(() => api.assertArtifact(authorizer as any, result.authorizationArtifact, expectation))
      .toThrow('checked handle provenance is missing');
  });

  it.each([
    ['target', 'processBindingDigestHex'],
    ['target', 'executionTargetIdentityDigestHex'],
    ['batch', 'processBindingDigestHex'],
    ['batch', 'executionTargetIdentityDigestHex'],
  ] as const)(
    'rejects isolated %s %s replacement before authorization and at artifact consumption', (owner, field) => {
      const { authorizer, checkedByRole } = setup();
      const input = authorizationInput(checkedByRole.get('tracker'));
      const replace = (changed: boolean) => {
        if (owner === 'batch' && field === 'processBindingDigestHex') {
          currentBatchProcessBinding = changed ? hex('91') : PROCESS_BINDING;
        } else if (owner === 'batch') {
          currentBatchExecutionIdentity = changed ? hex('92') : EXECUTION_IDENTITY;
        } else if (field === 'processBindingDigestHex') {
          currentProcessBinding = changed ? hex('91') : PROCESS_BINDING;
        } else {
          currentExecutionIdentity = changed ? hex('92') : EXECUTION_IDENTITY;
        }
      };
      replace(true);
      expect(() => authorizer.authorize(input.revalidated, input.preTransportEvidence))
        .toThrow('broadcast authorizer process changed');
      replace(false);
      const result = authorizer.authorize(input.revalidated, input.preTransportEvidence);
      replace(true);
      expect(() => api.assertArtifact(authorizer as any, result.authorizationArtifact, {
        ...input,
        authorizationDigestHex: result.authorizationDigestHex,
      })).toThrow('broadcast authorizer process changed');
    },
  );

  describe.each(['post-check', 'pre-transport'] as const)('%s exact evidence', (phase) => {
    it.each([
      ['sourceBoxId', hex('93')],
      ['targetGenesisHeaderIdHex', hex('94')],
      ['observedAtHeight', 122],
      ['observedTipHeaderIdHex', hex('95')],
      ['sourceBoxDigestHex', hex('96')],
      ['sourceBoxSigmaSerializedSha256Hex', hex('97')],
      ['observationDigestHex', hex('98')],
      ['revalidationArtifact', Object.freeze({ copied: true })],
    ] as const)('rejects isolated %s substitution without reserving the handle', (field, value) => {
      const { authorizer, checkedByRole } = setup();
      const input = authorizationInput(checkedByRole.get('tracker'));
      const postCheckEvidence = phase === 'post-check'
        ? Object.freeze({ ...input.revalidated.postCheckEvidence, [field]: value })
        : input.revalidated.postCheckEvidence;
      const preTransportEvidence = phase === 'pre-transport'
        ? Object.freeze({ ...input.preTransportEvidence, [field]: value })
        : input.preTransportEvidence;
      expect(() => authorizer.authorize(
        Object.freeze({ checked: input.revalidated.checked, postCheckEvidence }),
        preTransportEvidence,
      )).toThrow('synthetic revalidation artifact is not exact');
      expect(() => authorizer.authorize(input.revalidated, input.preTransportEvidence)).not.toThrow();
    });

    it.each(otherProfiles)('rejects retained evidence changed to profile %s through the matching guard', oppositeVersion => {
      const { authorizer, checkedByRole } = setup();
      const input = authorizationInput(checkedByRole.get('tracker'));
      const result = authorizer.authorize(input.revalidated, input.preTransportEvidence);
      const artifact = phase === 'post-check'
        ? input.revalidated.postCheckEvidence.revalidationArtifact
        : input.preTransportEvidence.revalidationArtifact;
      const record = evidenceRecords.get(artifact)!;
      evidenceRecords.set(artifact, Object.freeze({ ...record, version: oppositeVersion }));
      expect(() => api.assertArtifact(authorizer as any, result.authorizationArtifact, {
        ...input,
        authorizationDigestHex: result.authorizationDigestHex,
      })).toThrow('synthetic revalidation artifact is not exact');
    });
  });

  it('rejects setup authorization outside the canonical dependency order', () => {
    const { authorizer, checkedByRole } = setup();
    const input = authorizationInput(checkedByRole.get('duplicatePrevention'));
    expect(() => authorizer.authorize(
      input.revalidated,
      input.preTransportEvidence,
    )).toThrow('authorization order is invalid');
  });

  it('rejects one checked handle reused across setup roles', () => {
    const { batch } = setup();
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
    batches.set(duplicateBatch, version);
    expect(() =>
      api.create(
        TARGET as any,
        duplicateBatch as any,
        REVALIDATORS[version] as any,
        CONFIRMATION_OBSERVER as any,
      )).toThrow('role or handle is duplicated');
  });

  it('requires exact predecessor confirmation before the next role', () => {
    const { authorizer, checkedByRole } = setup();
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
    for (const [field, value, error] of [
      ['observedAtHeight', 140, 'genesis confirmation lacks consistent final depth'],
      ['confirmationHeight', 130, 'genesis confirmation lacks consistent final depth'],
      ['confirmations', 11, 'genesis confirmation lacks consistent final depth'],
      ['observationDigestHex', hex('80'), 'confirmation artifact is not exact'],
      ['confirmationHeaderIdHex', hex('81'), 'confirmation artifact is not exact'],
    ] as const) {
      expect(() => authorizer.acknowledgeCanonicalConfirmation(
        'tracker',
        Object.freeze({ ...trackerConfirmation, [field]: value }),
      ), field).toThrow(error);
    }
    expect(() => authorizer.acknowledgeCanonicalConfirmation(
      'tracker',
      Object.freeze({ ...trackerConfirmation, observedAtHeight: 140, confirmationHeight: 130 }),
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

  it.each(['post-check', 'pre-transport'] as const)('rejects %s phase substitution and copied authorization artifacts', phase => {
    const { authorizer, checkedByRole } = setup();
    const input = authorizationInput(checkedByRole.get('tracker'));
    const swappedPost = phase === 'post-check' ? Object.freeze({
      ...input.revalidated.postCheckEvidence,
      revalidationArtifact: input.preTransportEvidence.revalidationArtifact,
    }) : input.revalidated.postCheckEvidence;
    const swappedPre = phase === 'pre-transport' ? Object.freeze({
      ...input.preTransportEvidence,
      revalidationArtifact: input.revalidated.postCheckEvidence.revalidationArtifact,
    }) : input.preTransportEvidence;
    expect(() => authorizer.authorize(
      Object.freeze({
        checked: input.revalidated.checked,
        postCheckEvidence: swappedPost,
      }),
      swappedPre,
    )).toThrow('synthetic revalidation artifact is not exact');

    const exact = authorizer.authorize(
      input.revalidated,
      input.preTransportEvidence,
    );
    expect(() =>
      api.assertArtifact(
        authorizer as any,
        structuredClone(exact.authorizationArtifact),
        {
          ...input,
          authorizationDigestHex: exact.authorizationDigestHex,
        },
      )).toThrow('lacks exact process provenance');
  });

  it.each(['sourceBoxDigestHex', 'sourceBoxSigmaSerializedSha256Hex'] as const)(
    'rejects isolated %s drift between post-check and pre-transport', (field) => {
      const { authorizer, checkedByRole } = setup();
      const checked = checkedByRole.get('tracker');
      const postCheckEvidence = evidence(checked, 'post-check');
      const preTransportEvidence = evidence(checked, 'pre-transport', {
        [field]: hex('75'),
      });
      expect(() => authorizer.authorize(
        Object.freeze({ checked, postCheckEvidence }),
        preTransportEvidence,
      )).toThrow('revalidation continuity changed');
    },
  );

  it('rejects a regressing pre-transport observation height', () => {
    const { authorizer, checkedByRole } = setup();
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
    const { authorizer, checkedByRole } = setup();
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
    const { authorizer } = setup();
    expect(() =>
      api.assertAuthorizer(
        Object.freeze({ ...authorizer }) as any,
        TARGET as any,
      )).toThrow('lacks provenance');
    expect(() =>
      api.assertAuthorizer(
        authorizer as any,
        Object.freeze({ ...TARGET }) as any,
      )).toThrow('lacks provenance');
  });

  it.each(['target disposal', 'batch revocation'] as const)(
    'rejects %s at authorization, artifact consumption and confirmation', cause => {
      const { authorizer, batch, checkedByRole } = setup();
      const tracker = checkedByRole.get('tracker');
      const input = authorizationInput(tracker);
      const result = authorizer.authorize(input.revalidated, input.preTransportEvidence);
      const expectation = { ...input, authorizationDigestHex: result.authorizationDigestHex };
      const trackerConfirmation = confirmation(tracker);
      authorizer.acknowledgeCanonicalConfirmation('tracker', trackerConfirmation);
      api.assertArtifact(authorizer as any, result.authorizationArtifact, expectation);
      const next = authorizationInput(checkedByRole.get('duplicatePrevention'));
      if (cause === 'target disposal') {
        mocks.assertTarget.mockImplementation(() => { throw new Error('synthetic target disposed'); });
      } else {
        batches.delete(batch);
      }
      const error = cause === 'target disposal' ? 'synthetic target disposed' : 'synthetic setup batch provenance is missing';
      expect(() => authorizer.authorize(next.revalidated, next.preTransportEvidence)).toThrow(error);
      expect(() => api.assertArtifact(authorizer as any, result.authorizationArtifact, expectation)).toThrow(error);
      expect(() => api.assertAuthorizer(authorizer as any, TARGET as any)).toThrow(error);
      expect(() => api.assertConfirmed(authorizer as any, TARGET as any)).toThrow(error);
      expect(() => authorizer.acknowledgeCanonicalConfirmation('tracker', trackerConfirmation)).toThrow(error);
    },
  );
});
