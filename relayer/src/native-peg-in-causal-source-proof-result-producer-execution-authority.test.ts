import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  getExecution: vi.fn(),
  refreshIdentity: vi.fn(),
  assertIdentity: vi.fn(),
  runContained: vi.fn(),
}));

vi.mock('./pinned-local-native-verifier-build.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./pinned-local-native-verifier-build.js')
  >();
  return {
    ...actual,
    getPinnedLocalNativeVerifierExecution: mocks.getExecution,
    refreshPinnedLocalPegInCausalSourceProofResultProducerV1ExecutionIdentity:
      mocks.refreshIdentity,
    assertPinnedLocalPegInCausalSourceProofResultProducerV1ExecutionIdentityProvenance:
      mocks.assertIdentity,
  };
});

vi.mock('./native-contained-process.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./native-contained-process.js')
  >();
  return {
    ...actual,
    runNativeContainedProcess: mocks.runContained,
  };
});

import {
  assertPinnedLocalCausalSourceProofProducerCandidateEvaluatorProvenance,
  assertPinnedLocalCausalSourceProofProducerCandidateFromEvaluatorProvenance,
  assertPinnedLocalCausalSourceProofProducerCandidateResultIdentityProvenance,
  createPinnedLocalCausalSourceProofProducerCandidateEvaluator,
} from './native-peg-in-causal-source-proof-result-producer-execution-authority.js';
import * as producerModule from './native-peg-in-causal-source-proof-result-producer-execution-authority.js';
import {
  buildPegInCausalSourceProofResultFieldsV1,
  derivePegInCausalSourceProofRequestV1DigestHex,
  derivePegInCausalSourceProofResultIdV1Hex,
  type PegInCausalSourceProofRequestV1,
  type PegInCausalSourceProofResultFieldsV1,
} from './peg-in-causal-source-proof-admission-v1.js';
import type {
  PinnedLocalNativeVerifierBuild,
  PinnedLocalPegInCausalSourceProofResultProducerV1ExecutionIdentity,
} from './pinned-local-native-verifier-build.js';

const LAUNCHER_SHA256_HEX = `0x${'11'.repeat(32)}`;
const PRODUCER_SHA256_HEX = `0x${'87'.repeat(32)}`;
const VECTOR_SHA256_HEX = `0x${'33'.repeat(32)}`;
const IDENTITY_DIGEST_HEX = `0x${'44'.repeat(32)}`;
const LAUNCHER_PATH = [
  'C:',
  'Program Files',
  'E2SBridge',
  'NativeExecution',
  'v2',
  'Images',
  LAUNCHER_SHA256_HEX.slice(2),
  'bridge-contained-launcher.exe',
].join('\\');
const PRODUCER_PATH = resolve('bridge-source-proof-result-producer.exe');
const POLICY_NOT_BEFORE = Date.parse('2026-07-22T09:00:00.000Z');
const POLICY_EXPIRES = Date.parse('2026-07-22T11:00:00.000Z');
const BUILD = Object.freeze({}) as PinnedLocalNativeVerifierBuild;

interface AdmissionVector {
  request: PegInCausalSourceProofRequestV1;
  result: PegInCausalSourceProofResultFieldsV1;
}

interface ProducerVector {
  request: Record<string, unknown>;
  expected: Record<string, unknown>;
}

const vector = JSON.parse(readFileSync(
  new URL('../test-vectors/peg-in-causal-source-proof-admission-v1.json', import.meta.url),
  'utf8',
)) as AdmissionVector;
const producerVector = JSON.parse(readFileSync(
  new URL(
    '../test-vectors/peg-in-causal-source-proof-result-producer-v1.json',
    import.meta.url,
  ),
  'utf8',
)) as ProducerVector;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-22T10:00:00.000Z'));
  mocks.getExecution.mockReturnValue({
    pegInCausalSourceProofResultV1ProducerExecutablePath: PRODUCER_PATH,
    pegInCausalSourceProofResultV1ProducerSha256Hex: PRODUCER_SHA256_HEX,
  });
  mocks.refreshIdentity.mockReturnValue(executionIdentity());
  mocks.runContained.mockResolvedValue(containedResult(producerOutput()));
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('pinned local causal source-proof result producer authority', () => {
  it('keeps raw execution, stdout, signing, and lifecycle capabilities private', () => {
    expect(producerModule).not.toHaveProperty('createSourceProofProducerExecutionAuthority');
    expect(producerModule).not.toHaveProperty('executeSourceProofProducer');
    expect(producerModule).not.toHaveProperty('parseSourceProofProducerOutput');
    expect(producerModule).not.toHaveProperty('signPegInCausalSourceProofResultFieldsV1Fixture');
    expect(producerModule).not.toHaveProperty('createPegInCausalAdmissionProofReferenceV1');
  });

  it('contains one canonical producer request and returns only a quarantined candidate', async () => {
    const evaluator = createEvaluator();
    const candidate = await evaluator.evaluate({
      request: vector.request,
      issuedAtNativeHeight: '1001',
      expiresAtNativeHeight: '1017',
    });

    expect(mocks.refreshIdentity).toHaveBeenCalledTimes(3);
    expect(mocks.assertIdentity).toHaveBeenCalledTimes(3);
    expect(mocks.getExecution).toHaveBeenCalledTimes(2);
    expect(mocks.runContained).toHaveBeenCalledTimes(1);
    const launch = mocks.runContained.mock.calls[0]![0] as Record<string, unknown>;
    expect(launch).toMatchObject({
      launcherPath: LAUNCHER_PATH,
      launcherSha256Hex: LAUNCHER_SHA256_HEX,
      targetPath: PRODUCER_PATH,
      targetSha256Hex: PRODUCER_SHA256_HEX,
      targetArgs: [],
      policyNotBeforeUnixMs: POLICY_NOT_BEFORE,
      policyExpiresAtUnixMs: POLICY_EXPIRES,
      timeoutMs: 30_000,
      requestLimitBytes: 1024 * 1024,
      stdoutLimitBytes: 64 * 1024,
      stderrLimitBytes: 64 * 1024,
    });
    expect(Buffer.isBuffer(launch.requestBytes)).toBe(true);
    const childRequest = JSON.parse((launch.requestBytes as Buffer).toString('utf8')) as {
      schema: string;
      candidateIdHex: string;
      admissionProfileCanonicalHex: string;
      sourceIntentCanonicalHex: string;
      statementCanonicalHex: string;
      issuedAtNativeHeight: string;
      expiresAtNativeHeight: string;
    };
    expect(childRequest).toMatchObject({
      schema: 'e2s.peg-in-causal-source-proof-result-producer-request.v1',
      candidateIdHex: vector.request.candidateIdHex,
      issuedAtNativeHeight: '1001',
      expiresAtNativeHeight: '1017',
    });
    expect(childRequest).toEqual(producerVector.request);
    expect(Buffer.from(childRequest.admissionProfileCanonicalHex.slice(2), 'hex')).toHaveLength(313);
    expect(Buffer.from(childRequest.sourceIntentCanonicalHex.slice(2), 'hex')).toHaveLength(229);
    expect(Buffer.from(childRequest.statementCanonicalHex.slice(2), 'hex')).toHaveLength(381);
    expect(candidate).toMatchObject({
      requestDigestHex: derivePegInCausalSourceProofRequestV1DigestHex(vector.request),
      quarantinedChildOutput: {
        sha256Hex: sha256(producerOutput()),
        sizeBytes: producerOutput().length.toString(),
        contentExposed: false,
        resultFieldsAcceptedAsAuthority: false,
      },
      boundary: {
        candidateOnly: true,
        brokerSelfImageBoundToAuthorityRecordV2: true,
        launcherInstallationActivationCampaignCompleted: false,
        launcherAtomicBootstrapProven: false,
        producerOutputShapeValidated: true,
        sourceProofExecutionAuthenticated: false,
        sourceCanonicalityVerified: false,
        signaturesProduced: false,
        signingAuthorized: false,
        runtimePendingAdmissionWritten: false,
        lifecycleAdmissionAdvanced: false,
        mintAuthorized: false,
        submissionAuthorized: false,
        broadcastAuthorized: false,
        gate5Closed: false,
        productionReadinessVerified: false,
      },
    });
    expect(candidate).not.toHaveProperty('stdout');
    expect(candidate).not.toHaveProperty('result');
    expect(candidate).not.toHaveProperty('signatures');
    assertPinnedLocalCausalSourceProofProducerCandidateEvaluatorProvenance(evaluator);
    assertPinnedLocalCausalSourceProofProducerCandidateFromEvaluatorProvenance({
      evaluator,
      candidate,
      expectedRequestDigestHex: candidate.requestDigestHex,
    });
    const resultIdHex = derivePegInCausalSourceProofResultIdV1Hex(
      buildPegInCausalSourceProofResultFieldsV1({
        request: vector.request,
        issuedAtNativeHeight: '1001',
        expiresAtNativeHeight: '1017',
      }),
    );
    expect(() => assertPinnedLocalCausalSourceProofProducerCandidateResultIdentityProvenance({
      evaluator,
      candidate,
      expectedRequestDigestHex: candidate.requestDigestHex,
      expectedResultIdHex: resultIdHex,
    })).not.toThrow();
    expect(() => assertPinnedLocalCausalSourceProofProducerCandidateResultIdentityProvenance({
      evaluator,
      candidate,
      expectedRequestDigestHex: candidate.requestDigestHex,
      expectedResultIdHex: `0x${'ff'.repeat(32)}`,
    })).toThrow(/result identity provenance is missing/i);
  });

  it('binds the static compatibility profile and distinct producer identity into policy', async () => {
    const candidate = await createEvaluator().evaluate({
      request: vector.request,
      issuedAtNativeHeight: '1001',
      expiresAtNativeHeight: '1017',
    });
    const launch = mocks.runContained.mock.calls[0]![0] as {
      authority: { profileDigestHex: string; policyDigestHex: string; recordVersion: string };
    };
    expect(launch.authority).toEqual({
      profileDigestHex: candidate.execution.authorityProfileDigestHex,
      policyDigestHex: `0x${candidate.execution.executionPolicySha256}`,
      policyEpoch: 7,
      recordVersion: 'v2',
      allowedSystemDlls: ['kernel32.dll', 'ntdll.dll'],
    });
    expect(candidate.execution).toMatchObject({
      sourceExecutionIdentityDigestHex: IDENTITY_DIGEST_HEX,
      producerExecutableSha256Hex: PRODUCER_SHA256_HEX,
      producerVectorCanonicalSha256Hex: VECTOR_SHA256_HEX,
    });
  });

  it('rejects source identity, executable, and vector drift before returning a candidate', async () => {
    const sourceDrift = createEvaluator();
    mocks.refreshIdentity
      .mockReturnValueOnce(executionIdentity())
      .mockReturnValueOnce(executionIdentity({ identityDigestHex: `0x${'55'.repeat(32)}` }));
    await expect(sourceDrift.evaluate(evaluationInput())).rejects.toThrow(/source identity changed/i);
    expect(mocks.runContained).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    mocks.getExecution.mockReturnValue({
      pegInCausalSourceProofResultV1ProducerExecutablePath: PRODUCER_PATH,
      pegInCausalSourceProofResultV1ProducerSha256Hex: PRODUCER_SHA256_HEX,
    });
    mocks.refreshIdentity.mockReturnValue(executionIdentity());
    mocks.runContained.mockResolvedValue(containedResult(producerOutput()));
    const targetDrift = createEvaluator();
    mocks.getExecution.mockReturnValueOnce({
      pegInCausalSourceProofResultV1ProducerExecutablePath: PRODUCER_PATH,
      pegInCausalSourceProofResultV1ProducerSha256Hex: `0x${'66'.repeat(32)}`,
    });
    await expect(targetDrift.evaluate(evaluationInput())).rejects.toThrow(/execution target changed/i);
    expect(mocks.runContained).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.getExecution.mockReturnValue({
      pegInCausalSourceProofResultV1ProducerExecutablePath: PRODUCER_PATH,
      pegInCausalSourceProofResultV1ProducerSha256Hex: PRODUCER_SHA256_HEX,
    });
    mocks.refreshIdentity.mockReturnValue(executionIdentity());
    mocks.runContained.mockResolvedValue(containedResult(producerOutput()));
    const vectorDrift = createEvaluator();
    mocks.refreshIdentity.mockReturnValue(executionIdentity({
      vectorCanonicalSha256Hex: `0x${'77'.repeat(32)}`,
    }));
    await expect(vectorDrift.evaluate(evaluationInput())).rejects.toThrow(/source identity changed/i);
    expect(mocks.runContained).not.toHaveBeenCalled();
  });

  it('rejects invalid source bindings before launching the producer', async () => {
    const evaluator = createEvaluator();
    const wrongConsumption = structuredClone(vector.request);
    (wrongConsumption.sourceConsumption as { vaultBoxIdHex: string }).vaultBoxIdHex =
      `0x${'99'.repeat(32)}`;
    await expect(evaluator.evaluate({
      ...evaluationInput(),
      request: wrongConsumption,
    })).rejects.toThrow(/vault box/i);
    expect(mocks.runContained).not.toHaveBeenCalled();

    const staleWindow = { ...evaluationInput(), expiresAtNativeHeight: '1066' };
    await expect(evaluator.evaluate(staleWindow)).rejects.toThrow(/validity window/i);
    expect(mocks.runContained).not.toHaveBeenCalled();
  });

  it('preserves the V1 object and proof bounds at the producer boundary', async () => {
    const evaluator = createEvaluator();
    const largerValidProof = {
      ...structuredClone(vector.request),
      finalityProofCanonicalHex: `0x${'ab'.repeat(4097)}`,
    };
    mocks.runContained.mockResolvedValueOnce(containedResult(producerOutputFor({
      request: largerValidProof,
      issuedAtNativeHeight: '1001',
      expiresAtNativeHeight: '1017',
    })));
    const candidate = await evaluator.evaluate({
      ...evaluationInput(),
      request: largerValidProof,
    });
    expect(candidate.boundary.sourceCanonicalityVerified).toBe(false);

    const oversizedProof = {
      ...structuredClone(vector.request),
      finalityProofCanonicalHex: `0x${'ab'.repeat(65537)}`,
    };
    await expect(evaluator.evaluate({
      ...evaluationInput(),
      request: oversizedProof,
    })).rejects.toThrow(/canonical finality proof exceeds 65536 bytes/i);
    expect(mocks.runContained).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed or authority-claiming child output', async () => {
    const evaluator = createEvaluator();
    for (const output of [
      Buffer.alloc(0),
      Buffer.from('{}\n'),
      Buffer.from('{"schema":'),
    ]) {
      mocks.runContained.mockResolvedValueOnce(containedResult(output));
      await expect(evaluator.evaluate(evaluationInput())).rejects.toThrow(/producer stdout/i);
    }

    for (const [field, value] of [
      ['admissionBindingsValidated', false],
      ['canonicalObjectsHashed', false],
      ['sourceCanonicalityVerified', true],
      ['sourceProofExecutionAuthenticated', true],
      ['signaturesProduced', true],
      ['signingAuthorized', true],
      ['runtimeAdmissionWritten', true],
      ['lifecycleAdvanced', true],
      ['mintAuthorized', true],
      ['reconciliationHoldReleaseAuthorized', true],
      ['submissionAuthorized', true],
      ['broadcastAuthorized', true],
      ['gate5Closed', true],
      ['productionReady', true],
    ] as const) {
      const claiming = JSON.parse(producerOutput().toString('utf8')) as {
        boundary: Record<string, boolean>;
      };
      claiming.boundary[field] = value;
      mocks.runContained.mockResolvedValueOnce(containedResult(
        Buffer.from(JSON.stringify(claiming), 'utf8'),
      ));
      await expect(evaluator.evaluate(evaluationInput())).rejects
        .toThrow(/fail-closed boundary/i);
    }
  });

  it('rejects extra, missing, or individually drifted result fields', async () => {
    const evaluator = createEvaluator();
    const outerExtra = JSON.parse(producerOutput().toString('utf8')) as Record<string, unknown>;
    outerExtra.verified = true;
    const nestedExtra = JSON.parse(producerOutput().toString('utf8')) as {
      result: Record<string, unknown>;
    };
    nestedExtra.result.verified = true;
    const missing = JSON.parse(producerOutput().toString('utf8')) as {
      result: Record<string, unknown>;
    };
    delete missing.result.finalityProofBlake2b256Hex;
    const drifted = JSON.parse(producerOutput().toString('utf8')) as {
      result: Record<string, unknown>;
    };
    drifted.result.finalityProofBlake2b256Hex = `0x${'99'.repeat(32)}`;

    for (const output of [outerExtra, nestedExtra, missing, drifted]) {
      mocks.runContained.mockResolvedValueOnce(containedResult(
        Buffer.from(JSON.stringify(output), 'utf8'),
      ));
      await expect(evaluator.evaluate(evaluationInput())).rejects
        .toThrow(/result fields|must contain exactly|unexpected fields/i);
    }
  });

  it('rejects weakened broker boundaries, campaign claims, and cloned candidates', async () => {
    const evaluator = createEvaluator();
    mocks.runContained.mockResolvedValueOnce(containedResult(producerOutput(), {
      brokerSelfImageBoundToAuthorityRecordV2: false,
    }));
    await expect(evaluator.evaluate(evaluationInput())).rejects.toThrow(/contained execution/i);

    mocks.runContained.mockResolvedValueOnce(containedResult(producerOutput(), {
      launcherInstallationActivationCampaignCompleted: true,
    }));
    await expect(evaluator.evaluate(evaluationInput())).rejects.toThrow(/contained execution/i);

    const candidate = await evaluator.evaluate(evaluationInput());
    expect(() => assertPinnedLocalCausalSourceProofProducerCandidateFromEvaluatorProvenance({
      evaluator,
      candidate: structuredClone(candidate),
      expectedRequestDigestHex: candidate.requestDigestHex,
    })).toThrow(/provenance is missing/i);

    const otherEvaluator = createEvaluator();
    expect(() => assertPinnedLocalCausalSourceProofProducerCandidateFromEvaluatorProvenance({
      evaluator: otherEvaluator,
      candidate,
      expectedRequestDigestHex: candidate.requestDigestHex,
    })).toThrow(/provenance is missing/i);
  });

  it('rejects policy expiry and mutable caller substitution', async () => {
    const options = evaluatorOptions();
    const evaluator = createPinnedLocalCausalSourceProofProducerCandidateEvaluator(options);
    mocks.runContained.mockImplementationOnce(async () => {
      options.build = Object.freeze({}) as PinnedLocalNativeVerifierBuild;
      vi.setSystemTime(new Date(POLICY_EXPIRES));
      return containedResult(producerOutput());
    });
    await expect(evaluator.evaluate(evaluationInput())).rejects.toThrow(/validity window/i);
    expect(mocks.refreshIdentity.mock.calls.every(call => call[0] === BUILD)).toBe(true);
  });

  it('pins a sorted DLL allowlist and canonical V2 launcher installation', () => {
    expect(() => createEvaluator({ allowedSystemDlls: ['ntdll.dll', 'kernel32.dll'] }))
      .toThrow(/sorted and unique/i);
    expect(() => createEvaluator({ launcherPath: resolve('launcher.exe') }))
      .toThrow(/canonical digest-addressed v2 installation/i);
  });
});

function createEvaluator(overrides: Partial<{
  launcherPath: string;
  allowedSystemDlls: readonly string[];
}> = {}) {
  return createPinnedLocalCausalSourceProofProducerCandidateEvaluator({
    ...evaluatorOptions(),
    ...overrides,
  });
}

function evaluatorOptions() {
  return {
    build: BUILD,
    launcherPath: LAUNCHER_PATH,
    launcherSha256Hex: LAUNCHER_SHA256_HEX,
    policyEpoch: 7,
    policyNotBeforeUnixMs: POLICY_NOT_BEFORE,
    policyExpiresAtUnixMs: POLICY_EXPIRES,
    allowedSystemDlls: ['kernel32.dll', 'ntdll.dll'] as readonly string[],
  };
}

function evaluationInput() {
  return {
    request: vector.request,
    issuedAtNativeHeight: '1001',
    expiresAtNativeHeight: '1017',
  };
}

function executionIdentity(overrides: Partial<{
  identityDigestHex: string;
  vectorCanonicalSha256Hex: string;
}> = {}): PinnedLocalPegInCausalSourceProofResultProducerV1ExecutionIdentity {
  return Object.freeze({
    schema: 'e2s.pinned-local-peg-in-causal-source-proof-result-producer-v1-execution-identity.v1',
    status: 'PINNED_LOCAL_CAUSAL_SOURCE_PROOF_RESULT_PRODUCER_V1_EXECUTION_IDENTITY_REFRESHED',
    identityDigestHex: overrides.identityDigestHex ?? IDENTITY_DIGEST_HEX,
    sourceIdentity: {
      consensusSourceLockSha256: 'aa'.repeat(32),
      frontierCommit: 'bb'.repeat(20),
      frontierPatchSha256: 'cc'.repeat(32),
    },
    toolchain: {
      platformKey: 'win32-x64',
      rustTarget: 'x86_64-pc-windows-msvc',
      cargo: { version: 'cargo', sha256: '11'.repeat(32) },
      rustc: { version: 'rustc', sha256: '22'.repeat(32) },
      git: { version: 'git', sha256: '33'.repeat(32) },
    },
    executable: {
      sha256Hex: PRODUCER_SHA256_HEX,
      vectorCanonicalSha256Hex:
        overrides.vectorCanonicalSha256Hex ?? VECTOR_SHA256_HEX,
    },
    boundary: {
      sourceLocksReloaded: true,
      sourceCheckoutRevalidated: true,
      toolchainReobserved: true,
      executableDigestReobserved: true,
      trackedVectorBuildBindingPreserved: true,
      independentBuildAttestationVerified: false,
      completeBuildToolClosureVerified: false,
      dependencyCacheContentAttested: false,
      localConformanceOnly: true,
      admissionEligible: false,
      sourceCanonicalityVerified: false,
      sourceProofExecutionAuthenticated: false,
      gate5Closed: false,
    },
  }) as unknown as PinnedLocalPegInCausalSourceProofResultProducerV1ExecutionIdentity;
}

function producerOutput(): Buffer {
  return Buffer.from(JSON.stringify(producerVector.expected), 'utf8');
}

function producerOutputFor(input: {
  request: PegInCausalSourceProofRequestV1;
  issuedAtNativeHeight: string;
  expiresAtNativeHeight: string;
}): Buffer {
  const result = buildPegInCausalSourceProofResultFieldsV1(input);
  return Buffer.from(JSON.stringify({
    ...producerVector.expected,
    requestDigestHex: result.requestDigestHex,
    result,
  }), 'utf8');
}

function containedResult(
  stdout: Buffer,
  boundaryOverrides: Record<string, unknown> = {},
) {
  return Object.freeze({
    stdout,
    boundary: Object.freeze({
      trustedLauncherInstallationRequired: true,
      launcherDigestMatchedBeforeAndAfter: true,
      brokerSelfImageBoundToAuthorityRecordV2: true,
      launcherInstallationActivationCampaignCompleted: false,
      launcherAtomicBootstrapProven: false,
      targetAtomicityDelegatedToBroker: true,
      targetAtomicityObservedByTypeScript: false,
      executionAdmissionGranted: false,
      gate5Closed: false,
      productionReady: false,
      ...boundaryOverrides,
    }),
  });
}

function sha256(value: Buffer): string {
  return `0x${createHash('sha256').update(value).digest('hex')}`;
}
