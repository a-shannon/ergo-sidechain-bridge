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
    refreshPinnedLocalPegInCausalMintTransitionV3ExecutionIdentity:
      mocks.refreshIdentity,
    assertPinnedLocalPegInCausalMintTransitionV3ExecutionIdentityProvenance:
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
  assertPinnedLocalCausalV3ResultCandidateEvaluatorProvenance,
  assertPinnedLocalCausalV3ResultCandidateFromEvaluatorProvenance,
  createPinnedLocalCausalV3ResultCandidateEvaluator,
  projectPinnedLocalCausalV3ReportedReceiptIdentity,
} from './native-peg-in-causal-mint-transition-v3-execution-authority.js';
import * as candidateEvaluatorModule from './native-peg-in-causal-mint-transition-v3-execution-authority.js';
import {
  deriveNativeFinalizedPegInCausalMintTransitionV3ExactRequestDigestHex,
  type NativeFinalizedPegInCausalMintTransitionV3Request,
} from './native-finalized-peg-in-causal-mint-transition-v3.js';
import type {
  PinnedLocalNativeVerifierBuild,
  PinnedLocalPegInCausalMintTransitionV3ExecutionIdentity,
} from './pinned-local-native-verifier-build.js';

const LAUNCHER_SHA256_HEX = `0x${'11'.repeat(32)}`;
const VERIFIER_SHA256_HEX = `0x${'22'.repeat(32)}`;
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
const VERIFIER_PATH = resolve('bridge-causal-v3-verifier.exe');
const POLICY_NOT_BEFORE = Date.parse('2026-07-22T09:00:00.000Z');
const POLICY_EXPIRES = Date.parse('2026-07-22T11:00:00.000Z');
const BUILD = Object.freeze({}) as PinnedLocalNativeVerifierBuild;
const SUBSTITUTE_BUILD = Object.freeze({}) as PinnedLocalNativeVerifierBuild;

interface Vector {
  trustedAnchorDigestHex: string;
  request: NativeFinalizedPegInCausalMintTransitionV3Request;
  expected: Record<string, unknown>;
}

const vector = JSON.parse(readFileSync(
  new URL('../test-vectors/native-finalized-peg-in-causal-mint-transition-v3.json', import.meta.url),
  'utf8',
)) as Vector;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-22T10:00:00.000Z'));
  mocks.getExecution.mockReturnValue({
    pegInCausalMintTransitionV3VerifierExecutablePath: VERIFIER_PATH,
    pegInCausalMintTransitionV3VerifierSha256Hex: VERIFIER_SHA256_HEX,
  });
  mocks.refreshIdentity.mockReturnValue(executionIdentity());
  mocks.runContained.mockResolvedValue(containedResult(
    Buffer.from(JSON.stringify(vector.expected), 'utf8'),
  ));
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('pinned local causal V3 execution authority', () => {
  it('keeps raw execution and stdout capabilities out of the public module API', () => {
    expect(candidateEvaluatorModule).not.toHaveProperty(
      'createPinnedLocalCausalV3ExecutionAuthority',
    );
    expect(candidateEvaluatorModule).not.toHaveProperty(
      'assertPinnedLocalCausalV3ExecutionAuthorityResultProvenance',
    );
  });

  it('revalidates source identity around one exact candidate evaluation', async () => {
    const evaluator = createEvaluator();
    const requestBytes = Buffer.from(JSON.stringify(vector.request), 'utf8');
    const candidate = await evaluator.evaluate({
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      request: vector.request,
    });

    expect(mocks.refreshIdentity).toHaveBeenCalledTimes(3);
    expect(mocks.assertIdentity).toHaveBeenCalledTimes(3);
    expect(mocks.getExecution).toHaveBeenCalledTimes(2);
    expect(mocks.runContained).toHaveBeenCalledWith({
      launcherPath: LAUNCHER_PATH,
      launcherSha256Hex: LAUNCHER_SHA256_HEX,
      targetPath: VERIFIER_PATH,
      targetSha256Hex: VERIFIER_SHA256_HEX,
      targetArgs: [
        '--trusted-anchor-digest',
        vector.trustedAnchorDigestHex,
      ],
      policyNotBeforeUnixMs: POLICY_NOT_BEFORE,
      policyExpiresAtUnixMs: POLICY_EXPIRES,
      timeoutMs: 30_000,
      requestLimitBytes: 32 * 1024 * 1024,
      stdoutLimitBytes: 16 * 1024 * 1024,
      stderrLimitBytes: 64 * 1024,
      requestBytes,
      authority: {
        profileDigestHex: candidate.execution.authorityProfileDigestHex,
        policyDigestHex: `0x${candidate.execution.executionPolicySha256}`,
        policyEpoch: 7,
        recordVersion: 'v2',
        allowedSystemDlls: ['kernel32.dll', 'ntdll.dll'],
      },
    });
    expect(candidate).toMatchObject({
      requestDigestHex:
        deriveNativeFinalizedPegInCausalMintTransitionV3ExactRequestDigestHex(
          requestBytes,
        ),
      trustAnchorDigestHex: vector.trustedAnchorDigestHex,
      quarantinedChildOutput: {
        sha256Hex: sha256(Buffer.from(JSON.stringify(vector.expected), 'utf8')),
        contentExposed: false,
        proofClaimsAccepted: false,
      },
      boundary: {
        brokerSelfImageBoundToAuthorityRecordV2: true,
        launcherInstallationActivationCampaignCompleted: false,
        launcherAtomicBootstrapProven: false,
        candidateOnly: true,
        nativeVerifierExecutionAuthenticated: false,
        sourceProofExecutionAuthenticated: false,
        independentBuildAttestationVerified: false,
        localConformanceOnly: true,
        admissionEligible: false,
        mintAuthorized: false,
        gate5Closed: false,
      },
    });
    expect(candidate).not.toHaveProperty('stdout');
    assertPinnedLocalCausalV3ResultCandidateEvaluatorProvenance(evaluator);
    assertPinnedLocalCausalV3ResultCandidateFromEvaluatorProvenance({
      evaluator,
      candidate,
      expectedRequestDigestHex: candidate.requestDigestHex,
    });
    const transition = (vector.expected as any).causalTransition;
    const expectedReceipt = receiptExpectation();
    expect(projectPinnedLocalCausalV3ReportedReceiptIdentity({
      evaluator,
      candidate,
      expectedRequestDigestHex: candidate.requestDigestHex,
      expected: expectedReceipt,
    })).toMatchObject({
      admissionReceiptScaleSha256Hex: sha256(Buffer.from(
        transition.admissionReceiptScaleHex.slice(2),
        'hex',
      )),
      admissionExpiresAtNativeHeight: transition.admissionExpiresAtNativeHeight,
      parentNativeBlockHashHex: (vector.expected as any).headerBinding.parentNativeBlockHashHex,
      parentNativeHeight: '1024',
      childNativeBlockHashHex: (vector.expected as any).headerBinding.childNativeBlockHashHex,
      childNativeHeight: '1025',
    });
    expect(() => projectPinnedLocalCausalV3ReportedReceiptIdentity({
      evaluator,
      candidate,
      expectedRequestDigestHex: candidate.requestDigestHex,
      expected: { ...expectedReceipt, sourceProofDigestHex: `0x${'ff'.repeat(32)}` },
    })).toThrow(/reported runtime admission receipt/i);
  });

  it.each([
    'recordKeyHex',
    'causalProfileIdHex',
    'sourceIntentIdHex',
    'admissionIdHex',
    'proofSystemIdHex',
    'proofProfileIdHex',
    'admissionReceiptStorageKeyHex',
    'sourceProofRequestDigestHex',
    'sourceProofResultIdHex',
    'sourceProofDigestHex',
    'verifierExecutableSha256Hex',
    'verifierProfileIdHex',
    'admissionExpiresAtNativeHeight',
    'sourceProofIssuedAtNativeHeight',
  ] as const)('rejects an isolated expected receipt %s substitution', async field => {
    const evaluator = createEvaluator();
    const candidate = await evaluator.evaluate({
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      request: vector.request,
    });
    const expected: Record<string, unknown> = receiptExpectation();
    if (field === 'admissionReceiptStorageKeyHex') {
      expected[field] = `${expected[field] as string}00`;
    } else if (field === 'admissionExpiresAtNativeHeight') {
      expected[field] = '1101';
    } else if (field === 'sourceProofIssuedAtNativeHeight') {
      expected[field] = '1021';
    } else {
      expected[field] = `0x${'ff'.repeat(32)}`;
    }
    expect(() => projectPinnedLocalCausalV3ReportedReceiptIdentity({
      evaluator,
      candidate,
      expectedRequestDigestHex: candidate.requestDigestHex,
      expected: expected as any,
    })).toThrow(/reported runtime admission receipt|predates source-proof issuance/i);
  });

  it('digest-binds a semantically valid change to the private receipt bytes', async () => {
    const firstEvaluator = createEvaluator();
    const firstCandidate = await firstEvaluator.evaluate({
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      request: vector.request,
    });
    const first = projectPinnedLocalCausalV3ReportedReceiptIdentity({
      evaluator: firstEvaluator,
      candidate: firstCandidate,
      expectedRequestDigestHex: firstCandidate.requestDigestHex,
      expected: receiptExpectation(),
    });

    const changed = structuredClone(vector.expected) as any;
    const receipt = Buffer.from(
      changed.causalTransition.admissionReceiptScaleHex.slice(2),
      'hex',
    );
    receipt.writeBigUInt64LE(1021n, 225);
    changed.causalTransition.admissionReceiptScaleHex = `0x${receipt.toString('hex')}`;
    mocks.runContained.mockResolvedValueOnce(containedResult(
      Buffer.from(JSON.stringify(changed), 'utf8'),
    ));
    const secondEvaluator = createEvaluator();
    const secondCandidate = await secondEvaluator.evaluate({
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      request: vector.request,
    });
    const second = projectPinnedLocalCausalV3ReportedReceiptIdentity({
      evaluator: secondEvaluator,
      candidate: secondCandidate,
      expectedRequestDigestHex: secondCandidate.requestDigestHex,
      expected: receiptExpectation(),
    });

    expect(second.admissionAdmittedAtNativeHeight).toBe('1021');
    expect(second.admissionReceiptScaleSha256Hex)
      .not.toBe(first.admissionReceiptScaleSha256Hex);
    expect(second.receiptIdentityDigestHex).not.toBe(first.receiptIdentityDigestHex);
  });

  it('keeps the original build capability when the caller mutates options mid-execution', async () => {
    const options = {
      build: BUILD,
      launcherPath: LAUNCHER_PATH,
      launcherSha256Hex: LAUNCHER_SHA256_HEX,
      policyEpoch: 7,
      policyNotBeforeUnixMs: POLICY_NOT_BEFORE,
      policyExpiresAtUnixMs: POLICY_EXPIRES,
      allowedSystemDlls: ['kernel32.dll', 'ntdll.dll'],
    };
    const evaluator = createPinnedLocalCausalV3ResultCandidateEvaluator(options);
    mocks.runContained.mockImplementationOnce(async () => {
      options.build = SUBSTITUTE_BUILD;
      return containedResult(Buffer.from(JSON.stringify(vector.expected), 'utf8'));
    });

    await evaluator.evaluate({
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      request: vector.request,
    });

    expect(options.build).toBe(SUBSTITUTE_BUILD);
    expect(mocks.refreshIdentity.mock.calls.map(call => call[0])).toEqual([
      BUILD,
      BUILD,
      BUILD,
    ]);
    expect(mocks.getExecution.mock.calls.map(call => call[0])).toEqual([
      BUILD,
      BUILD,
    ]);
  });

  it('rejects aggregate source or toolchain identity drift before returning a candidate', async () => {
    const evaluator = createEvaluator();
    mocks.refreshIdentity
      .mockReturnValueOnce(executionIdentity())
      .mockReturnValueOnce(executionIdentity({
        identityDigestHex: `0x${'66'.repeat(32)}`,
      }));

    await expect(evaluator.evaluate({
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      request: vector.request,
    })).rejects.toThrow(/source identity changed/i);
  });

  it('rejects executable target drift before launching the contained process', async () => {
    const evaluator = createEvaluator();
    mocks.getExecution.mockReturnValueOnce({
      pegInCausalMintTransitionV3VerifierExecutablePath: VERIFIER_PATH,
      pegInCausalMintTransitionV3VerifierSha256Hex: `0x${'65'.repeat(32)}`,
    });

    await expect(evaluator.evaluate({
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      request: vector.request,
    })).rejects.toThrow(/execution target changed/i);
    expect(mocks.runContained).not.toHaveBeenCalled();
  });

  it('rejects tracked vector identity drift before launching the contained process', async () => {
    const evaluator = createEvaluator();
    mocks.refreshIdentity.mockReturnValueOnce(executionIdentity({
      vectorCanonicalSha256Hex: `0x${'66'.repeat(32)}`,
    }));

    await expect(evaluator.evaluate({
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      request: vector.request,
    })).rejects.toThrow(/source identity changed/i);
    expect(mocks.runContained).not.toHaveBeenCalled();
  });

  it('rejects a policy that expires while the broker is running', async () => {
    const evaluator = createEvaluator();
    mocks.runContained.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date(POLICY_EXPIRES));
      return containedResult(Buffer.from('late-output'));
    });

    await expect(evaluator.evaluate({
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      request: vector.request,
    })).rejects.toThrow(/outside its validity window/i);
  });

  it('rejects malformed roots, weakened broker boundaries, and unregistered clones', async () => {
    const evaluator = createEvaluator();
    await expect(evaluator.evaluate({
      trustedAnchorDigestHex: `0x${'AA'.repeat(32)}`,
      request: vector.request,
    })).rejects.toThrow(/lowercase/i);

    mocks.runContained.mockResolvedValueOnce(containedResult(
      Buffer.from('output'),
      { brokerSelfImageBoundToAuthorityRecordV2: false },
    ));
    await expect(evaluator.evaluate({
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      request: vector.request,
    })).rejects.toThrow(/contained execution boundary is invalid/i);

    mocks.runContained.mockResolvedValueOnce(containedResult(
      Buffer.from('output'),
      { launcherInstallationActivationCampaignCompleted: true },
    ));
    await expect(evaluator.evaluate({
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      request: vector.request,
    })).rejects.toThrow(/contained execution boundary is invalid/i);

    mocks.runContained.mockResolvedValueOnce(containedResult(
      Buffer.from('output'),
      { executionAdmissionGranted: true },
    ));
    await expect(evaluator.evaluate({
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      request: vector.request,
    })).rejects.toThrow(/contained execution boundary is invalid/i);

    const candidate = await evaluator.evaluate({
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      request: vector.request,
    });
    expect(() => assertPinnedLocalCausalV3ResultCandidateFromEvaluatorProvenance({
      evaluator,
      candidate: structuredClone(candidate),
      expectedRequestDigestHex: candidate.requestDigestHex,
    })).toThrow(/provenance is missing/i);
    expect(() => assertPinnedLocalCausalV3ResultCandidateEvaluatorProvenance({
      ...evaluator,
    })).toThrow(/provenance is missing/i);
  });

  it('pins a sorted DLL allowlist and a canonical launcher installation', () => {
    expect(() => createEvaluator({
      allowedSystemDlls: ['ntdll.dll', 'kernel32.dll'],
    })).toThrow(/sorted and unique/i);
    expect(() => createEvaluator({
      launcherPath: resolve('launcher.exe'),
    })).toThrow(/canonical digest-addressed v2 installation/i);
  });
});

function createEvaluator(overrides: Partial<{
  launcherPath: string;
  allowedSystemDlls: readonly string[];
}> = {}) {
  return createPinnedLocalCausalV3ResultCandidateEvaluator({
    build: BUILD,
    launcherPath: overrides.launcherPath ?? LAUNCHER_PATH,
    launcherSha256Hex: LAUNCHER_SHA256_HEX,
    policyEpoch: 7,
    policyNotBeforeUnixMs: POLICY_NOT_BEFORE,
    policyExpiresAtUnixMs: POLICY_EXPIRES,
    allowedSystemDlls:
      overrides.allowedSystemDlls ?? ['kernel32.dll', 'ntdll.dll'],
  });
}

function receiptExpectation() {
  const transition = (vector.expected as any).causalTransition;
  return {
    recordKeyHex: transition.recordKeyHex,
    causalProfileIdHex: transition.causalProfileIdHex,
    sourceIntentIdHex: transition.sourceIntentIdHex,
    admissionIdHex: transition.admissionIdHex,
    proofSystemIdHex: transition.proofSystemIdHex,
    proofProfileIdHex: transition.proofProfileIdHex,
    admissionReceiptStorageKeyHex: vector.request.statement.admissionReceiptStorageKeyHex,
    sourceProofRequestDigestHex: transition.sourceProofRequestDigestHex,
    sourceProofResultIdHex: transition.sourceProofResultIdHex,
    sourceProofDigestHex: transition.sourceProofDigestHex,
    verifierExecutableSha256Hex: transition.verifierExecutableSha256Hex,
    verifierProfileIdHex: transition.verifierProfileIdHex,
    admissionExpiresAtNativeHeight: transition.admissionExpiresAtNativeHeight,
    sourceProofIssuedAtNativeHeight: '0',
  };
}

function executionIdentity(overrides: Partial<{
  identityDigestHex: string;
  executableSha256Hex: string;
  vectorCanonicalSha256Hex: string;
}> = {}): PinnedLocalPegInCausalMintTransitionV3ExecutionIdentity {
  return Object.freeze({
    schema: 'e2s.pinned-local-peg-in-causal-mint-transition-v3-execution-identity.v1',
    status: 'PINNED_LOCAL_CAUSAL_V3_EXECUTION_IDENTITY_REFRESHED',
    identityDigestHex: overrides.identityDigestHex ?? IDENTITY_DIGEST_HEX,
    sourceIdentity: {
      consensusSourceLockSha256: '1e0c1e1b7848e47ce3d07a2697ff2b1ca02492d49afcfdd5cc09f1819c957380',
      frontierCommit: '75329a2df49e2cc7981485392c31160929d1bd48',
      frontierPatchSha256: 'c5e9b7fd36977e387e96049813afd634ae4317c591860c2b017303418ab336ab',
    },
    toolchain: {
      platformKey: 'win32-x64',
      rustTarget: 'x86_64-pc-windows-msvc',
      cargo: { version: 'cargo pinned', sha256: '77'.repeat(32) },
      rustc: { version: 'rustc pinned', sha256: '88'.repeat(32) },
      git: { version: 'git pinned', sha256: '99'.repeat(32) },
    },
    executable: {
      sha256Hex: overrides.executableSha256Hex ?? VERIFIER_SHA256_HEX,
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
      gate5Closed: false,
    },
  }) as PinnedLocalPegInCausalMintTransitionV3ExecutionIdentity;
}

function containedResult(
  stdout: Buffer,
  boundaryOverrides: Partial<{
    brokerSelfImageBoundToAuthorityRecordV2: boolean;
    launcherInstallationActivationCampaignCompleted: boolean;
    executionAdmissionGranted: boolean;
  }> = {},
) {
  return {
    stdout,
    boundary: {
      trustedLauncherInstallationRequired: true as const,
      launcherDigestMatchedBeforeAndAfter: true as const,
      brokerSelfImageBoundToAuthorityRecordV2:
        boundaryOverrides.brokerSelfImageBoundToAuthorityRecordV2 ?? true,
      launcherInstallationActivationCampaignCompleted:
        boundaryOverrides.launcherInstallationActivationCampaignCompleted ?? false,
      launcherAtomicBootstrapProven: false as const,
      targetAtomicityDelegatedToBroker: true as const,
      targetAtomicityObservedByTypeScript: false as const,
      executionAdmissionGranted:
        boundaryOverrides.executionAdmissionGranted ?? false,
      gate5Closed: false as const,
      productionReady: false as const,
    },
  };
}

function sha256(value: Buffer): string {
  return `0x${createHash('sha256').update(value).digest('hex')}`;
}
