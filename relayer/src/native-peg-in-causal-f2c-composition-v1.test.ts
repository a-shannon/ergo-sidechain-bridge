import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertProducerIdentity: vi.fn(),
  assertV3Identity: vi.fn(),
  collectV3: vi.fn(),
  getExecution: vi.fn(),
  refreshProducerIdentity: vi.fn(),
  refreshV3Identity: vi.fn(),
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
      mocks.refreshV3Identity,
    assertPinnedLocalPegInCausalMintTransitionV3ExecutionIdentityProvenance:
      mocks.assertV3Identity,
    refreshPinnedLocalPegInCausalSourceProofResultProducerV1ExecutionIdentity:
      mocks.refreshProducerIdentity,
    assertPinnedLocalPegInCausalSourceProofResultProducerV1ExecutionIdentityProvenance:
      mocks.assertProducerIdentity,
  };
});

vi.mock('./native-contained-process.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./native-contained-process.js')>();
  return { ...actual, runNativeContainedProcess: mocks.runContained };
});

vi.mock('./native-checkpoint-proof-collector.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./native-checkpoint-proof-collector.js')
  >();
  return {
    ...actual,
    collectNativeFinalizedPegInCausalMintTransitionV3Candidate: mocks.collectV3,
  };
});

import {
  assertNativePegInCausalF2cCompositionV1Provenance,
  createNativePegInCausalF2cPreflightV1,
  createNativePegInCausalF2cCompositionV1,
  finalizeNativePegInCausalF2cCompositionV1,
  type NativePegInCausalF2cCompositionV1Input,
  type NativePegInCausalF2cPreflightV1Input,
} from './native-peg-in-causal-f2c-composition-v1.js';
import {
  reacquireNativePegInCausalF2cAfterRestartV1,
  type NativePegInCausalF2cFreshProcessReacquisitionV1Input,
} from './native-peg-in-causal-f2c-fresh-process-reacquisition-v1.js';
import {
  createNativePegInCausalF2dDualOriginCampaignReportV1,
  createNativePegInCausalF2dInstallationDeclarationsV1,
  createNativePegInCausalF2dSingleRunReportV1,
  validateNativePegInCausalF2dDualOriginCampaignReportV1,
  validateNativePegInCausalF2dInstallationDeclarationsV1,
} from './native-peg-in-causal-f2d-dual-origin-campaign-v1.js';
import {
  createNativePegInCausalF2eInputValidationV1,
  createNativePegInCausalF2eOperatorHandoffV1,
  validateNativePegInCausalF2eInputValidationV1,
  validateNativePegInCausalF2eOperatorHandoffV1,
} from './native-peg-in-causal-f2e-operator-handoff-v1.js';
import {
  deriveCampaignInputManifestDigestHex,
  deriveNativePegInCausalF2dSingleRunWorkerRequestDigestHex,
  executeNativePegInCausalF2dCampaign,
  parseNativePegInCausalF2dSingleRunWorkerRequestV1,
  parseNativePegInCausalF2dDualOriginCampaignArgs,
  runNativePegInCausalF2dDualOriginCampaignCli,
  type CampaignInputManifestV1,
} from './scripts/run-native-peg-in-causal-f2d-dual-origin-campaign.js';
import {
  bindTrackedInstallerObservation,
  observeWindowsHost,
  parseNativePegInCausalF2eOperatorHandoffArgs,
  runNativePegInCausalF2eOperatorHandoffCli,
}
  from './scripts/native-peg-in-causal-f2e-operator-handoff.js';
import { readNativePegInCausalF2dWorkerInput }
  from './scripts/native-peg-in-causal-f2d-campaign-worker.js';
import { createPinnedLocalCausalV3ResultCandidateEvaluator }
  from './native-peg-in-causal-mint-transition-v3-execution-authority.js';
import { createPinnedLocalCausalSourceProofProducerCandidateEvaluator }
  from './native-peg-in-causal-source-proof-result-producer-execution-authority.js';
import {
  appendPegInCausalAdmissionLifecycleEventV1,
  createPegInCausalAdmissionLifecycleJournalV1,
  createPegInCausalAdmissionProofReferenceV1,
  createPegInCausalAdmissionSecurityRegistryV1,
  projectPegInCausalAdmissionLifecycleAfterRestartV1,
  type PegInCausalAdmissionLifecycleJournalV1,
  type PegInCausalAdmissionObservationKindV1,
} from './peg-in-causal-admission-lifecycle-v1.js';
import {
  buildPegInCausalSourceProofResultFieldsV1,
  validatePegInCausalSourceProofEnvelopeV1,
  type PegInCausalSourceProofRequestV1,
  type PegInCausalSourceProofResultV1,
} from './peg-in-causal-source-proof-admission-v1.js';
import {
  createPegInCausalSourceProofEnvelopeV1Fixture,
  createPegInCausalSourceProofRequestV1Fixture,
  fixtureHash,
} from './peg-in-causal-source-proof-admission-v1.test-helper.js';
import {
  decodePegInConsumedAdmissionV3Hex,
  derivePegInCausalAdmissionIdV2Hex,
  derivePegInCausalAdmissionProfileIdV2Hex,
  derivePegInSourceIntentIdV2Hex,
  encodePegInConsumedAdmissionV3Hex,
} from './peg-in-causal-admission-v2.js';
import {
  decodePegInRuntimeRecordV1ScaleHex,
  derivePegInRuntimeRecordKeyV1Hex,
} from './peg-in-runtime-state.js';
import type {
  PinnedLocalNativeVerifierBuild,
  PinnedLocalPegInCausalMintTransitionV3ExecutionIdentity,
  PinnedLocalPegInCausalSourceProofResultProducerV1ExecutionIdentity,
} from './pinned-local-native-verifier-build.js';

const LAUNCHER_SHA256_HEX = `0x${'11'.repeat(32)}`;
const V3_VERIFIER_SHA256_HEX = `0x${'22'.repeat(32)}`;
const PRODUCER_SHA256_HEX = `0x${'87'.repeat(32)}`;
const V3_VECTOR_SHA256_HEX = `0x${'33'.repeat(32)}`;
const PRODUCER_VECTOR_SHA256_HEX = `0x${'34'.repeat(32)}`;
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
const LAUNCHER_PROGRAM_FILES_PATH = LAUNCHER_PATH.split('\\').slice(0, 2).join('\\');
const V3_VERIFIER_PATH = resolve('bridge-causal-v3-verifier.exe');
const PRODUCER_PATH = resolve('bridge-source-proof-result-producer.exe');
const POLICY_NOT_BEFORE = Date.parse('2026-07-22T09:00:00.000Z');
const POLICY_EXPIRES = Date.parse('2026-07-22T11:00:00.000Z');
const BUILD = Object.freeze({}) as PinnedLocalNativeVerifierBuild;
const CURRENT_NATIVE_HEIGHT = '1026';

function createF2dSingleRunReportForTest(
  input: Omit<
    Parameters<typeof createNativePegInCausalF2dSingleRunReportV1>[0],
    'workerRequestDigestHex'
  >,
) {
  return createNativePegInCausalF2dSingleRunReportV1({
    ...input,
    workerRequestDigestHex: fixtureHash(`worker-request:${input.rpcOrigin}`),
  });
}

const v3Vector = JSON.parse(readFileSync(new URL(
  '../test-vectors/native-finalized-peg-in-causal-mint-transition-v3.json',
  import.meta.url,
), 'utf8')) as {
  trustedAnchorDigestHex: string;
  request: NativePegInCausalF2cCompositionV1Input['causalV3Request'];
  expected: Record<string, any>;
};
const producerVector = JSON.parse(readFileSync(new URL(
  '../test-vectors/peg-in-causal-source-proof-result-producer-v1.json',
  import.meta.url,
), 'utf8')) as { expected: Record<string, any> };

let activeSourceRequest: PegInCausalSourceProofRequestV1;
let activeV3Output: Record<string, any>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-22T10:00:00.000Z'));
  mocks.collectV3.mockReset();
  mocks.getExecution.mockReturnValue({
    pegInCausalMintTransitionV3VerifierExecutablePath: V3_VERIFIER_PATH,
    pegInCausalMintTransitionV3VerifierSha256Hex: V3_VERIFIER_SHA256_HEX,
    pegInCausalSourceProofResultV1ProducerExecutablePath: PRODUCER_PATH,
    pegInCausalSourceProofResultV1ProducerSha256Hex: PRODUCER_SHA256_HEX,
  });
  mocks.refreshV3Identity.mockReturnValue(v3ExecutionIdentity());
  mocks.refreshProducerIdentity.mockReturnValue(producerExecutionIdentity());
  mocks.runContained.mockImplementation(async input => {
    if (input.targetPath === V3_VERIFIER_PATH) {
      return containedResult(Buffer.from(JSON.stringify(activeV3Output), 'utf8'));
    }
    if (input.targetPath === PRODUCER_PATH) {
      const child = JSON.parse(input.requestBytes.toString('utf8')) as {
        issuedAtNativeHeight: string;
        expiresAtNativeHeight: string;
      };
      const result = buildPegInCausalSourceProofResultFieldsV1({
        request: activeSourceRequest,
        issuedAtNativeHeight: child.issuedAtNativeHeight,
        expiresAtNativeHeight: child.expiresAtNativeHeight,
      });
      return containedResult(Buffer.from(JSON.stringify({
        ...producerVector.expected,
        requestDigestHex: result.requestDigestHex,
        result,
      }), 'utf8'));
    }
    throw new Error('unexpected contained target');
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('native peg-in causal F2c composition V1', () => {
  it('joins exact process-provenant identities without exposing or granting authority', async () => {
    const fixture = await createFixture('positive');
    const candidate = createNativePegInCausalF2cCompositionV1(fixture.input);

    expect(candidate).toMatchObject({
      candidateIdHex: fixture.sourceProofResult.admissionIdHex,
      sourceProof: {
        requestDigestHex: fixture.sourceProofResult.requestDigestHex,
        resultIdHex: fixture.sourceProofResult.sourceProofResultIdHex,
        proofDigestHex: fixture.sourceProofResult.sourceProofDigestHex,
      },
      causalV3: {
        admissionAdmittedAtNativeHeight: '1020',
        admissionExpiresAtNativeHeight: '1064',
        parentNativeHeight: '1024',
        childNativeHeight: '1025',
      },
      lifecycle: {
        status: 'admitted',
        currentNativeHeight: CURRENT_NATIVE_HEIGHT,
      },
      quarantinedChildOutputs: { contentExposed: false },
      boundary: {
        sameProcessCausalV3CandidateProvenanceVerified: true,
        sameProcessSourceProofProducerCandidateProvenanceVerified: true,
        sameProcessFederatedSourceProofResultProvenanceVerified: true,
        sourceRequestToRuntimeRecordBindingsVerified: true,
        reportedRuntimeAdmissionReceiptIdentityJoined: true,
        denyOnlyLifecycleReferenceJoined: true,
        nativeVerifierExecutionAuthenticated: false,
        reportedRuntimeAdmissionReceiptAuthenticated: false,
        sourceProofExecutionAuthenticated: false,
        sourceCanonicalityVerified: false,
        sidechainFinalityVerified: false,
        runtimePendingAdmissionWritten: false,
        lifecycleIsFundsAuthority: false,
        committedVaultTransitionVerified: false,
        mintAuthorized: false,
        daemonAdmissionAuthorized: false,
        reconciliationHoldReleaseAuthorized: false,
        signingAuthorized: false,
        submissionAuthorized: false,
        broadcastAuthorized: false,
        gate5Closed: false,
        productionReadinessVerified: false,
      },
    });
    expect(candidate).not.toHaveProperty('stdout');
    expect(candidate).not.toHaveProperty('admissionReceiptScaleHex');
    expect(candidate).not.toHaveProperty('signatures');
    assertNativePegInCausalF2cCompositionV1Provenance(candidate);
    expect(() => assertNativePegInCausalF2cCompositionV1Provenance(
      structuredClone(candidate),
    )).toThrow(/provenance is missing/i);
  });

  it('preflights every non-lifecycle binding before creating a journal', async () => {
    const fixture = await createPreflightFixture('preflight-positive');
    const preflight = createNativePegInCausalF2cPreflightV1(fixture.input);

    expect(preflight).toMatchObject({
      candidateIdHex: fixture.sourceProofResult.candidateIdHex,
      boundary: {
        nonLifecycleBindingsVerified: true,
        lifecycleCreated: false,
        lifecycleJoined: false,
        mintAuthorized: false,
        broadcastAuthorized: false,
        gate5Closed: false,
      },
    });
    expect(preflight).not.toHaveProperty('sourceProofResult');
    expect(preflight).not.toHaveProperty('causalV3Candidate');
    expect(() => finalizeNativePegInCausalF2cCompositionV1({
      preflight: structuredClone(preflight),
      lifecycleJournal: createLifecycleJournal(
        'preflight-clone',
        fixture.sourceProofResult,
      ),
    })).toThrow(/preflight process provenance is missing/i);

    const retryFixture = await createPreflightFixture('preflight-late-failure', {
      runtimeMutation: 'amountNanoErg',
    });
    expect(() => createNativePegInCausalF2cPreflightV1(retryFixture.input))
      .toThrow(/runtime amount differs/i);
    expect(() => createPegInCausalAdmissionLifecycleJournalV1(
      retryFixture.sourceProofResult.candidateIdHex,
    )).not.toThrow();

    const expired = await createPreflightFixture('preflight-expired');
    expect(() => createNativePegInCausalF2cPreflightV1({
      ...expired.input,
      currentNativeHeight: '1064',
    })).toThrow(/source-proof result is not fresh/i);
    expect(() => createPegInCausalAdmissionLifecycleJournalV1(
      expired.sourceProofResult.candidateIdHex,
    )).not.toThrow();

    const futureValidated = await createPreflightFixture(
      'preflight-future-validation',
      { sourceProofValidatedAtNativeHeight: '1027' },
    );
    expect(() => createNativePegInCausalF2cPreflightV1({
      ...futureValidated.input,
      currentNativeHeight: CURRENT_NATIVE_HEIGHT,
    })).toThrow(/source-proof result is not fresh/i);
    expect(() => createPegInCausalAdmissionLifecycleJournalV1(
      futureValidated.sourceProofResult.candidateIdHex,
    )).not.toThrow();
  });

  it('finalizes one genuine preflight exactly once with a current lifecycle head', async () => {
    const fixture = await createPreflightFixture('preflight-finalize');
    const preflight = createNativePegInCausalF2cPreflightV1(fixture.input);
    const lifecycleJournal = createLifecycleJournal(
      'preflight-finalize',
      fixture.sourceProofResult,
    );
    const candidate = finalizeNativePegInCausalF2cCompositionV1({
      preflight,
      lifecycleJournal,
    });

    assertNativePegInCausalF2cCompositionV1Provenance(candidate);
    expect(candidate.lifecycle.currentNativeHeight).toBe(CURRENT_NATIVE_HEIGHT);
    expect(() => finalizeNativePegInCausalF2cCompositionV1({
      preflight,
      lifecycleJournal,
    })).toThrow(/already finalized/i);
  });

  it('rejects cloned or cross-process inputs instead of reconstructing authority', async () => {
    const fixture = await createFixture('process-bound');
    for (const replacement of [
      { causalV3Candidate: structuredClone(fixture.input.causalV3Candidate) },
      {
        sourceProofProducerCandidate:
          structuredClone(fixture.input.sourceProofProducerCandidate),
      },
      { sourceProofResult: structuredClone(fixture.input.sourceProofResult) },
      { lifecycleJournal: structuredClone(fixture.input.lifecycleJournal) },
    ]) {
      expect(() => createNativePegInCausalF2cCompositionV1({
        ...fixture.input,
        ...replacement,
      })).toThrow(/provenance is missing/i);
    }
  });

  it.each([
    'sidechainIdHex',
    'bridgeAddressHex',
    'tokenAddressHex',
    'sourceBoxIdHex',
    'recipientAddressHex',
    'amountNanoErg',
    'profileRevision',
    'activationHeight',
  ] as const)('rejects a fully formed source admission with different runtime %s', async field => {
    const fixture = await createFixture(`runtime-${field}`, { runtimeMutation: field });
    expect(() => createNativePegInCausalF2cCompositionV1(fixture.input))
      .toThrow(/runtime .* differs/i);
  });

  it.each([
    'causalProfileIdHex',
    'sourceIntentIdHex',
    'admissionIdHex',
    'sourceProofRequestDigestHex',
    'sourceProofResultIdHex',
    'sourceProofDigestHex',
    'verifierExecutableSha256Hex',
    'admissionExpiresAtNativeHeight',
  ] as const)('rejects a reported runtime receipt with substituted %s', async field => {
    const fixture = await createFixture(`receipt-${field}`, { receiptMutation: field });
    expect(() => createNativePegInCausalF2cCompositionV1(fixture.input))
      .toThrow(/reported runtime admission receipt/i);
  });

  it('binds the F2b candidate to the exact derived result validity window', async () => {
    const fixture = await createFixture('producer-window', {
      producerExpiresAtNativeHeight: '1063',
    });
    expect(() => createNativePegInCausalF2cCompositionV1(fixture.input))
      .toThrow(/result identity provenance is missing/i);
  });

  it('rejects a runtime receipt admitted before source-proof issuance', async () => {
    const fixture = await createFixture('receipt-before-proof', {
      receiptAdmittedAtNativeHeight: '999',
    });
    expect(() => createNativePegInCausalF2cCompositionV1(fixture.input))
      .toThrow(/predates source-proof issuance/i);
  });

  it('accepts historical receipt admission before a fresh envelope revalidation', async () => {
    const fixture = await createFixture('fresh-revalidation', {
      sourceProofValidatedAtNativeHeight: CURRENT_NATIVE_HEIGHT,
    });
    expect(() => createNativePegInCausalF2cCompositionV1(fixture.input))
      .not.toThrow();
  });

  it('rejects a genuine lifecycle head for another admission', async () => {
    const expected = await createFixture('lifecycle-expected');
    const foreign = await createFixture('lifecycle-foreign');
    expect(() => createNativePegInCausalF2cCompositionV1({
      ...expected.input,
      lifecycleJournal: foreign.input.lifecycleJournal,
    })).toThrow(/different candidate|proof reference .* differs/i);
  });

  it.each([
    'stale_anchor',
    'source_reorg',
    'checkpoint_conflict',
    'rpc_disagreement',
  ] as const)('keeps the %s lifecycle hold fail-closed', async hold => {
    const fixture = await createFixture(`hold-${hold}`, { hold });
    expect(() => createNativePegInCausalF2cCompositionV1(fixture.input))
      .toThrow(/not a current admitted deny-only head/i);
  });

  it('requires fresh reproof after restart or complete journal loss', async () => {
    const fixture = await createFixture('restart');
    const restarted = projectPegInCausalAdmissionLifecycleAfterRestartV1(
      fixture.sourceProofResult.candidateIdHex,
    );
    expect(restarted).toMatchObject({
      status: 'pending',
      observationHold: true,
      observationHoldReason: 'restart_reproof_required',
      boundary: { processJournalProvenanceVerified: false },
    });
    expect(() => createNativePegInCausalF2cCompositionV1({
      ...fixture.input,
      lifecycleJournal: JSON.parse(
        JSON.stringify(fixture.input.lifecycleJournal),
      ) as unknown as PegInCausalAdmissionLifecycleJournalV1,
    })).toThrow(/process provenance is missing/i);
  });

  it('rejects an expired lifecycle proof and additive composition fields', async () => {
    const fixture = await createFixture('expiry');
    expect(() => createNativePegInCausalF2cCompositionV1({
      ...fixture.input,
      currentNativeHeight: '1064',
    })).toThrow(/not fresh/i);
    expect(() => createNativePegInCausalF2cCompositionV1({
      ...fixture.input,
      currentNativeHeight: '1024',
    })).toThrow(/predates the reported transition/i);
    expect(() => createNativePegInCausalF2cCompositionV1({
      ...fixture.input,
      unexpected: true,
    } as any)).toThrow(/unexpected field set/i);
  });
});

describe('native peg-in causal F2c fresh-process reacquisition V1', () => {
  it('recollects and re-executes both native candidates before deriving a new journal', async () => {
    const fixture = configureFreshReacquisitionFixture('fresh-positive');
    const candidate = await reacquireNativePegInCausalF2cAfterRestartV1(
      fixture.input,
    );

    assertNativePegInCausalF2cCompositionV1Provenance(candidate);
    expect(mocks.collectV3).toHaveBeenCalledOnce();
    expect(mocks.runContained).toHaveBeenCalledTimes(2);
    expect(candidate).toMatchObject({
      candidateIdHex: fixture.sourceProofResult.candidateIdHex,
      lifecycle: {
        status: 'admitted',
        currentNativeHeight: CURRENT_NATIVE_HEIGHT,
        proofResultIdHex: fixture.sourceProofResult.sourceProofResultIdHex,
      },
      boundary: {
        nativeVerifierExecutionAuthenticated: false,
        sourceProofExecutionAuthenticated: false,
        sourceCanonicalityVerified: false,
        sidechainFinalityVerified: false,
        committedVaultTransitionVerified: false,
        mintAuthorized: false,
        signingAuthorized: false,
        submissionAuthorized: false,
        broadcastAuthorized: false,
        gate5Closed: false,
        productionReadinessVerified: false,
      },
    });
  });

  it('snapshots the signed envelope before the first asynchronous recollection', async () => {
    const fixture = configureFreshReacquisitionFixture('fresh-envelope-snapshot');
    let releaseCollector!: () => void;
    const collectorGate = new Promise<void>(resolveGate => {
      releaseCollector = resolveGate;
    });
    mocks.collectV3.mockReset();
    mocks.collectV3.mockImplementationOnce(async collectionInput => {
      await collectorGate;
      return {
        collection: {
          request: v3Vector.request,
          acquisition: { finalizedHeadNumber: CURRENT_NATIVE_HEIGHT },
        },
        candidate: await collectionInput.evaluator.evaluate({
          trustedAnchorDigestHex: v3Vector.trustedAnchorDigestHex,
          request: v3Vector.request,
        }),
      };
    });

    const mutableInput = {
      ...fixture.input,
      sourceProofEnvelope: structuredClone(fixture.input.sourceProofEnvelope),
    };
    const pending = reacquireNativePegInCausalF2cAfterRestartV1(mutableInput);
    (mutableInput.sourceProofEnvelope.result as any).expiresAtNativeHeight = '1063';
    (mutableInput.sourceProofEnvelope.signatures[0] as any).signatureHex =
      `0x${'00'.repeat(64)}`;
    releaseCollector();

    const candidate = await pending;
    expect(candidate.sourceProof.resultIdHex)
      .toBe(fixture.sourceProofResult.sourceProofResultIdHex);
  });

  it('rejects old lifecycle or result-shaped fields before any recollection', async () => {
    const fixture = configureFreshReacquisitionFixture('fresh-old-state');
    await expect(reacquireNativePegInCausalF2cAfterRestartV1({
      ...fixture.input,
      lifecycleJournal: {},
    } as any)).rejects.toThrow(/unexpected field set/i);
    await expect(reacquireNativePegInCausalF2cAfterRestartV1({
      ...fixture.input,
      sourceProofResult: fixture.sourceProofResult,
    } as any)).rejects.toThrow(/unexpected field set/i);
    await expect(reacquireNativePegInCausalF2cAfterRestartV1({
      ...fixture.input,
      causalV3Collection: {
        ...fixture.input.causalV3Collection,
        candidate: {},
      },
    } as any)).rejects.toThrow(/V3 collection input has an unexpected field set/i);
    expect(mocks.collectV3).not.toHaveBeenCalled();
  });

  it('leaves no journal when recollection or non-lifecycle binding fails', async () => {
    const rpcFailure = configureFreshReacquisitionFixture('fresh-rpc-failure', {
      collectorError: new Error('rpc disagreement during recollection'),
    });
    await expect(reacquireNativePegInCausalF2cAfterRestartV1(rpcFailure.input))
      .rejects.toThrow(/rpc disagreement/i);
    expect(() => createPegInCausalAdmissionLifecycleJournalV1(
      rpcFailure.sourceProofResult.candidateIdHex,
    )).not.toThrow();

    const mismatch = configureFreshReacquisitionFixture('fresh-binding-failure', {
      runtimeMutation: 'amountNanoErg',
    });
    await expect(reacquireNativePegInCausalF2cAfterRestartV1(mismatch.input))
      .rejects.toThrow(/runtime amount differs/i);
    expect(() => createPegInCausalAdmissionLifecycleJournalV1(
      mismatch.sourceProofResult.candidateIdHex,
    )).not.toThrow();
  });

  it('fails closed on stale signed evidence without creating a journal', async () => {
    const fixture = configureFreshReacquisitionFixture('fresh-expired', {
      finalizedHeadNumber: '1064',
    });
    await expect(reacquireNativePegInCausalF2cAfterRestartV1(fixture.input))
      .rejects.toThrow(/stale|validity window/i);
    expect(mocks.runContained).toHaveBeenCalledTimes(1);
    expect(() => createPegInCausalAdmissionLifecycleJournalV1(
      fixture.sourceProofResult.candidateIdHex,
    )).not.toThrow();
  });
});

describe('native peg-in causal F2d dual-origin campaign V1', () => {
  it('derives the two exact role-distinct V2 installer records without installing them', () => {
    const fixture = configureFreshReacquisitionFixture('installation-declarations');
    const report = createNativePegInCausalF2dInstallationDeclarationsV1({
      generatedAt: new Date('2026-07-22T12:00:00.000Z'),
      causalV3Evaluator: fixture.input.causalV3Collection.evaluator,
      sourceProofProducerEvaluator: fixture.input.sourceProofProducerEvaluator,
    });

    expect(report).toMatchObject({
      status: 'V2_INSTALLATION_DECLARATIONS_DERIVED_WITHOUT_ACTIVATION',
      launcherSha256Hex: LAUNCHER_SHA256_HEX,
      profiles: [
        {
          role: 'causal-v3-verifier',
          authorityRecordVersion: 'v2',
          installerProfileKind: 'V2Immutable',
          installerArguments: {
            BrokerPath: LAUNCHER_PATH,
            BrokerSha256: LAUNCHER_SHA256_HEX.slice(2),
            PolicyDigestSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
            ProfileDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
            MinimumPolicyEpoch: 7,
          },
          activationCampaignCompleted: false,
          fundsAuthorityGranted: false,
        },
        {
          role: 'source-proof-result-producer',
          authorityRecordVersion: 'v2',
          activationCampaignCompleted: false,
          fundsAuthorityGranted: false,
        },
      ],
      boundary: {
        installationPerformed: false,
        activationCampaignCompleted: false,
        executionPerformed: false,
        fundsAuthorityGranted: false,
        gate5Closed: false,
      },
    });
    expect(report.profiles[0].authorityProfileDigestHex)
      .not.toBe(report.profiles[1].authorityProfileDigestHex);
    expect(report.profiles[0].executionPolicySha256)
      .not.toBe(report.profiles[1].executionPolicySha256);
    expect(() => validateNativePegInCausalF2dInstallationDeclarationsV1({
      ...report,
      profiles: [{
        ...report.profiles[0],
        installerArguments: {
          ...report.profiles[0].installerArguments,
          ProfileDigest: fixtureHash('wrong-installer-profile').slice(2),
        },
      }, report.profiles[1]],
    })).toThrow(/installer|profile digest|report digest/i);
  });

  it('validates the public F2e proof input without reinterpreting it as execution evidence', () => {
    const manifest = campaignInputManifest();
    const canonicalDigestHex = deriveCampaignInputManifestDigestHex(manifest);
    const report = createNativePegInCausalF2eInputValidationV1({
      validatedAt: new Date('2026-07-22T12:00:00.000Z'),
      manifestBytes: Buffer.from(JSON.stringify(manifest), 'utf8'),
    });

    expect(report).toMatchObject({
      status: 'PUBLIC_PROOF_INPUT_VALIDATED_WITHOUT_EXECUTION',
      input: {
        canonicalDigestHex,
        targetNativeBlockHashHex: manifest.targetNativeBlockHashHex,
      },
      boundary: {
        syntaxAndSemanticShapeValidated: true,
        proofSignaturesReverified: false,
        executionPerformed: false,
        broadcastAuthorized: false,
        gate5Closed: false,
      },
    });
    expect(() => validateNativePegInCausalF2eInputValidationV1({
      ...report,
      input: {
        ...report.input,
        canonicalDigestHex: fixtureHash('different-public-input'),
      },
    })).toThrow(/digest/i);
    expect(() => createNativePegInCausalF2eInputValidationV1({
      validatedAt: new Date('2026-07-22T12:00:00.000Z'),
      manifestBytes: Buffer.from('{}', 'utf8'),
    })).toThrow(/input|field|schema/i);
  });

  it('derives the Windows x64 known folder from exactly one bounded query result', () => {
    const programFilesPath = resolve('synthetic-program-files');
    const queryProgramFiles = vi.fn(() => `${programFilesPath}\r\n`);
    expect(observeWindowsHost({
      platform: 'win32',
      architecture: 'x64',
      queryProgramFiles,
    })).toEqual({
      platform: 'win32',
      architecture: 'x64',
      process64Bit: true,
      programFilesX64Path: programFilesPath,
      knownFolderSource: 'dotnet-special-folder-program-files',
    });
    expect(queryProgramFiles).toHaveBeenCalledOnce();
    expect(() => observeWindowsHost({
      platform: 'win32',
      architecture: 'x64',
      queryProgramFiles: () => (
        `${programFilesPath}\n${resolve('synthetic-program-files-x86')}\n`
      ),
    })).toThrow(/known-folder query failed/i);
    expect(() => observeWindowsHost({
      platform: 'linux',
      architecture: 'x64',
      queryProgramFiles,
    })).toThrow(/64-bit Windows x64/i);
  });

  it('binds the installer only to one expected repository and exact tracked HEAD bytes', () => {
    const trackedBytes = Buffer.from('reviewed installer bytes', 'utf8');
    const root = join(tmpdir(), 'f2e-tracked-worktree');
    const file = {
      path: join(root, 'install.ps1'),
      sizeBytes: trackedBytes.length,
      sha256Hex: `0x${createHash('sha256').update(trackedBytes).digest('hex')}`,
    };
    expect(bindTrackedInstallerObservation({
      file,
      repositoryRoot: root,
      expectedRepositoryRoot: root,
      repositoryCommitHex: 'ab'.repeat(20),
      trackedBytes,
    })).toMatchObject({
      ...file,
      repositoryCommitHex: 'ab'.repeat(20),
      trackedBlobSha256Hex: file.sha256Hex,
    });
    expect(() => bindTrackedInstallerObservation({
      file,
      repositoryRoot: join(tmpdir(), 'foreign-worktree'),
      expectedRepositoryRoot: root,
      repositoryCommitHex: 'ab'.repeat(20),
      trackedBytes,
    })).toThrow(/expected bridge worktree/i);
    expect(() => bindTrackedInstallerObservation({
      file,
      repositoryRoot: root,
      expectedRepositoryRoot: root,
      repositoryCommitHex: 'ab'.repeat(20),
      trackedBytes: Buffer.from('different tracked bytes', 'utf8'),
    })).toThrow(/tracked HEAD bytes/i);
  });

  it('separates the reviewed broker source from the immutable installed V2 path', () => {
    const fixture = configureFreshReacquisitionFixture('operator-handoff');
    const declarations = createNativePegInCausalF2dInstallationDeclarationsV1({
      generatedAt: new Date('2026-07-22T12:00:00.000Z'),
      causalV3Evaluator: fixture.input.causalV3Collection.evaluator,
      sourceProofProducerEvaluator: fixture.input.sourceProofProducerEvaluator,
    });
    const manifest = campaignInputManifest();
    const file = (path: string, sha256Hex = fixtureHash(`file:${path}`)) => ({
      path,
      sizeBytes: 128,
      sha256Hex,
    });
    const brokerSourcePath = resolve('reviewed', 'bridge-contained-launcher.exe');
    const installerScriptPath = resolve('bridge', 'scripts', 'install.ps1');
    const campaignInputPath = resolve('operator', 'public-proof-input.json');
    const campaignOutputPath = resolve('operator', 'dual-origin-report.json');
    const report = createNativePegInCausalF2eOperatorHandoffV1({
      generatedAt: new Date('2026-07-22T12:00:00.000Z'),
      campaignInputPath,
      campaignOutputPath,
      campaignInputDigestHex: deriveCampaignInputManifestDigestHex(manifest),
      declarations,
      host: {
        platform: 'win32',
        architecture: 'x64',
        process64Bit: true,
        programFilesX64Path: LAUNCHER_PROGRAM_FILES_PATH,
        knownFolderSource: 'dotnet-special-folder-program-files',
      },
      brokerSource: file(brokerSourcePath, LAUNCHER_SHA256_HEX),
      installerScript: {
        ...file(installerScriptPath),
        repositoryCommitHex: 'ab'.repeat(20),
        trackedBlobSha256Hex: fixtureHash(`file:${installerScriptPath}`),
      },
      frontierSourcePath: resolve('source', 'frontier-patched'),
      cargo: file(resolve('tools', 'cargo.exe')),
      rustc: file(resolve('tools', 'rustc.exe')),
      git: file(resolve('tools', 'git.exe')),
      primaryRpcOrigin: 'http://127.0.0.1:9944',
      witnessRpcOrigin: 'http://127.0.0.1:9945',
      policyEpoch: 7,
      policyNotBeforeUnixMs: POLICY_NOT_BEFORE,
      policyExpiresAtUnixMs: POLICY_EXPIRES,
      allowedSystemDlls: ['kernel32.dll', 'ntdll.dll'],
    });
    expect(report.profiles[0].installationParameters.BrokerPath).toBe(brokerSourcePath);
    expect(report.profiles[0].inspectionParameters.BrokerPath).toBe(LAUNCHER_PATH);
    expect(report.execute.arguments).toContain(LAUNCHER_PATH);
    expect(report.execute.outputPath).toBe(campaignOutputPath);
    expect(report).toMatchObject({
      status: 'PROTECTED_HOST_PREREQUISITES_BOUND_WITHOUT_ACTIVATION',
      host: {
        installedLauncherPath: LAUNCHER_PATH,
        installedLauncherMatchesObservedKnownFolder: true,
      },
      boundary: {
        installationPerformed: false,
        registryWrite: false,
        proofExecutionPerformed: false,
        broadcastAuthorized: false,
        gate5Closed: false,
      },
    });
    expect(() => validateNativePegInCausalF2eOperatorHandoffV1({
      ...report,
      prerequisites: {
        ...report.prerequisites,
        brokerSource: {
          ...report.prerequisites.brokerSource,
          sha256Hex: fixtureHash('wrong-broker-source'),
        },
      },
    })).toThrow(/broker source digest/i);
    expect(() => validateNativePegInCausalF2eOperatorHandoffV1({
      ...report,
      profiles: [{
        ...report.profiles[0],
        installationParameters: {
          ...report.profiles[0].installationParameters,
          BrokerPath: LAUNCHER_PATH,
        },
      }, report.profiles[1]],
    })).toThrow(/parameters differ/i);
  });

  it('keeps validate-input independent from protected-host arguments', () => {
    expect(parseNativePegInCausalF2eOperatorHandoffArgs([
      '--mode', 'validate-input',
      '--input', 'public-proof-input.json',
      '--out', 'validation.json',
    ]).errors).toEqual([]);
    expect(parseNativePegInCausalF2eOperatorHandoffArgs([
      '--mode', 'validate-input',
      '--input', 'public-proof-input.json',
      '--out', 'validation.json',
      '--broker-source', resolve('reviewed', 'launcher.exe'),
    ]).errors).toContain('--broker-source applies only to host-preflight mode');
  });

  it('writes a create-only F2e input-validation receipt without deriving a host profile', async () => {
    const root = mkdtempSync(join(tmpdir(), 'f2e-input-validation-'));
    const inputPath = join(root, 'public-proof-input.json');
    const outputPath = join(root, '.operator-campaign', 'input-validation.json');
    writeFileSync(inputPath, `${JSON.stringify(campaignInputManifest())}\n`, 'utf8');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await runNativePegInCausalF2eOperatorHandoffCli([
        '--mode', 'validate-input',
        '--input', inputPath,
        '--out', outputPath,
      ], {
        cwd: root,
        bridgeRoot: root,
        now: () => new Date('2026-07-22T12:00:00.000Z'),
      });
      expect(JSON.parse(readFileSync(outputPath, 'utf8'))).toMatchObject({
        status: 'PUBLIC_PROOF_INPUT_VALIDATED_WITHOUT_EXECUTION',
        boundary: {
          installationPerformed: false,
          executionPerformed: false,
          broadcastAuthorized: false,
        },
      });
      await expect(runNativePegInCausalF2eOperatorHandoffCli([
        '--mode', 'validate-input',
        '--input', inputPath,
        '--out', outputPath,
      ], {
        cwd: root,
        bridgeRoot: root,
      })).rejects.toThrow(/exist|new file/i);
    } finally {
      log.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects non-local outputs and campaign-input replacement during host preflight', async () => {
    const root = mkdtempSync(join(tmpdir(), 'f2e-host-boundaries-'));
    const inputPath = join(root, 'public-proof-input.json');
    const outsideOutputPath = join(root, 'outside-validation.json');
    const outputPath = join(root, '.operator-campaign', 'host-handoff.json');
    const campaignOutputPath = join(root, '.operator-campaign', 'dual-origin.json');
    const manifest = campaignInputManifest();
    writeFileSync(inputPath, `${JSON.stringify(manifest)}\n`, 'utf8');
    const fixture = configureFreshReacquisitionFixture('host-preflight-drift');
    const declarations = createNativePegInCausalF2dInstallationDeclarationsV1({
      generatedAt: new Date('2026-07-22T12:00:00.000Z'),
      causalV3Evaluator: fixture.input.causalV3Collection.evaluator,
      sourceProofProducerEvaluator: fixture.input.sourceProofProducerEvaluator,
    });
    const hostArgs = [
      '--mode', 'host-preflight',
      '--input', inputPath,
      '--out', outputPath,
      '--campaign-out', campaignOutputPath,
      '--broker-source', join(root, 'reviewed-launcher.exe'),
      '--primary-rpc-url', 'http://127.0.0.1:9944',
      '--witness-rpc-url', 'http://127.0.0.1:9945',
      '--frontier-source', join(root, 'frontier-patched'),
      '--cargo', join(root, 'cargo.exe'),
      '--rustc', join(root, 'rustc.exe'),
      '--git', join(root, 'git.exe'),
      '--launcher-path', LAUNCHER_PATH,
      '--launcher-sha256', LAUNCHER_SHA256_HEX,
      '--policy-epoch', '7',
      '--policy-not-before-unix-ms', String(POLICY_NOT_BEFORE),
      '--policy-expires-at-unix-ms', String(POLICY_EXPIRES),
      '--allowed-system-dll', 'kernel32.dll',
    ];
    try {
      await expect(runNativePegInCausalF2eOperatorHandoffCli([
        '--mode', 'validate-input',
        '--input', inputPath,
        '--out', outsideOutputPath,
      ], {
        cwd: root,
        bridgeRoot: root,
      })).rejects.toThrow(/\.operator-campaign/i);
      expect(existsSync(outsideOutputPath)).toBe(false);

      await expect(runNativePegInCausalF2eOperatorHandoffCli(hostArgs, {
        cwd: root,
        bridgeRoot: root,
        now: () => new Date('2026-07-22T12:00:00.000Z'),
        deriveDeclarations: async () => {
          writeFileSync(inputPath, `${JSON.stringify({
            ...manifest,
            collectionDeadlineMs: manifest.collectionDeadlineMs + 1,
          })}\n`, 'utf8');
          return declarations;
        },
        observeHost: () => observeWindowsHost({
          platform: 'win32',
          architecture: 'x64',
          queryProgramFiles: () => `${LAUNCHER_PROGRAM_FILES_PATH}\r\n`,
        }),
        observeDirectory: path => path,
        observeFile: (path, label) => ({
          path,
          sizeBytes: 128,
          sha256Hex: label === 'broker source'
            ? LAUNCHER_SHA256_HEX
            : fixtureHash(`observed:${label}`),
        }),
        observeInstaller: path => ({
          path,
          sizeBytes: 128,
          sha256Hex: fixtureHash('tracked-installer'),
          repositoryCommitHex: 'cd'.repeat(20),
          trackedBlobSha256Hex: fixtureHash('tracked-installer'),
        }),
      })).rejects.toThrow(/input changed during host preflight/i);
      expect(existsSync(outputPath)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('writes a non-executing host-preflight handoff with exact source and installed paths', async () => {
    const root = mkdtempSync(join(tmpdir(), 'f2e-host-preflight-'));
    const inputPath = join(root, 'public-proof-input.json');
    const outputPath = join(root, '.operator-campaign', 'host-handoff.json');
    const campaignOutputPath = join(root, '.operator-campaign', 'dual-origin.json');
    writeFileSync(inputPath, `${JSON.stringify(campaignInputManifest())}\n`, 'utf8');
    const fixture = configureFreshReacquisitionFixture('host-preflight-cli');
    const declarations = createNativePegInCausalF2dInstallationDeclarationsV1({
      generatedAt: new Date('2026-07-22T12:00:00.000Z'),
      causalV3Evaluator: fixture.input.causalV3Collection.evaluator,
      sourceProofProducerEvaluator: fixture.input.sourceProofProducerEvaluator,
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await runNativePegInCausalF2eOperatorHandoffCli([
        '--mode', 'host-preflight',
        '--input', inputPath,
        '--out', outputPath,
        '--campaign-out', campaignOutputPath,
        '--broker-source', join(root, 'reviewed-launcher.exe'),
        '--primary-rpc-url', 'http://127.0.0.1:9944',
        '--witness-rpc-url', 'http://127.0.0.1:9945',
        '--frontier-source', join(root, 'frontier-patched'),
        '--cargo', join(root, 'cargo.exe'),
        '--rustc', join(root, 'rustc.exe'),
        '--git', join(root, 'git.exe'),
        '--launcher-path', LAUNCHER_PATH,
        '--launcher-sha256', LAUNCHER_SHA256_HEX,
        '--policy-epoch', '7',
        '--policy-not-before-unix-ms', String(POLICY_NOT_BEFORE),
        '--policy-expires-at-unix-ms', String(POLICY_EXPIRES),
        '--allowed-system-dll', 'kernel32.dll',
        '--allowed-system-dll', 'ntdll.dll',
      ], {
        cwd: root,
        bridgeRoot: root,
        now: () => new Date('2026-07-22T12:00:00.000Z'),
        deriveDeclarations: async () => declarations,
        observeHost: () => ({
          platform: 'win32',
          architecture: 'x64',
          process64Bit: true,
          programFilesX64Path: LAUNCHER_PROGRAM_FILES_PATH,
          knownFolderSource: 'dotnet-special-folder-program-files',
        }),
        observeDirectory: path => path,
        observeFile: (path, label) => ({
          path,
          sizeBytes: 128,
          sha256Hex: label === 'broker source'
            ? LAUNCHER_SHA256_HEX
            : fixtureHash(`observed:${label}`),
        }),
        observeInstaller: path => ({
          path,
          sizeBytes: 128,
          sha256Hex: fixtureHash('tracked-installer'),
          repositoryCommitHex: 'cd'.repeat(20),
          trackedBlobSha256Hex: fixtureHash('tracked-installer'),
        }),
      });
      const report = JSON.parse(readFileSync(outputPath, 'utf8'));
      expect(report).toMatchObject({
        status: 'PROTECTED_HOST_PREREQUISITES_BOUND_WITHOUT_ACTIVATION',
        execute: {
          outputPath: campaignOutputPath,
        },
        boundary: {
          installationPerformed: false,
          installerExecutionAuthorized: false,
          proofExecutionPerformed: false,
        },
      });
      expect(report.profiles[0]).toMatchObject({
        installationParameters: {
          BrokerPath: join(root, 'reviewed-launcher.exe'),
        },
        inspectionParameters: {
          BrokerPath: LAUNCHER_PATH,
          InspectOnly: true,
        },
      });
      expect(report.execute.arguments).toContain(
        deriveCampaignInputManifestDigestHex(campaignInputManifest()),
      );
    } finally {
      log.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('retains one exact agreed identity from two run reports without promoting authority', async () => {
    const primaryFixture = configureFreshReacquisitionFixture('dual-agreement');
    const primaryCandidate = await reacquireNativePegInCausalF2cAfterRestartV1(
      primaryFixture.input,
    );
    const primaryRun = createF2dSingleRunReportForTest({
      capturedAt: new Date('2026-07-22T11:58:00.000Z'),
      rpcOrigin: 'http://127.0.0.1:9944',
      launcherSha256Hex: LAUNCHER_SHA256_HEX,
      candidate: primaryCandidate,
    });
    const witnessRun = createF2dSingleRunReportForTest({
      capturedAt: new Date('2026-07-22T11:59:00.000Z'),
      rpcOrigin: 'http://127.0.0.1:9945/',
      launcherSha256Hex: LAUNCHER_SHA256_HEX,
      candidate: primaryCandidate,
    });

    const report = createNativePegInCausalF2dDualOriginCampaignReportV1({
      capturedAt: new Date('2026-07-22T12:00:00.000Z'),
      primaryRun,
      witnessRun,
    });

    expect(report).toMatchObject({
      status: 'DUAL_ORIGIN_F2D_CANDIDATES_AGREE_WITHOUT_AUTHORITY',
      observations: {
        primaryRpcOrigin: 'http://127.0.0.1:9944/',
        witnessRpcOrigin: 'http://127.0.0.1:9945/',
        candidateIdentityDigestHex: primaryCandidate.identityDigestHex,
      },
      candidate: {
        candidateIdHex: primaryCandidate.candidateIdHex,
        causalV3: {
          parentNativeBlockHashHex: primaryCandidate.causalV3.parentNativeBlockHashHex,
          childNativeBlockHashHex: primaryCandidate.causalV3.childNativeBlockHashHex,
        },
      },
      boundary: {
        separateWorkerRequestsRequired: true,
        serializedReportsDoNotProveProcessExecution: true,
        exactCandidateAgreementRequired: true,
        originAgreementIsNotConsensusProof: true,
        launcherInstallationActivationCampaignCompleted: false,
        sourceCanonicalityVerified: false,
        sidechainFinalityVerified: false,
        mintAuthorized: false,
        broadcastAuthorized: false,
        gate5Closed: false,
        productionReadinessVerified: false,
      },
    });
    expect(report).not.toHaveProperty('sourceProofEnvelope');
    expect(report).not.toHaveProperty('stdout');
    expect(() => validateNativePegInCausalF2dDualOriginCampaignReportV1(report))
      .not.toThrow();
  });

  it('rejects equivalent origins, candidate disagreement, cloned provenance, and report mutation', async () => {
    const primaryFixture = configureFreshReacquisitionFixture('dual-primary');
    const primaryCandidate = await reacquireNativePegInCausalF2cAfterRestartV1(
      primaryFixture.input,
    );
    const witnessFixture = configureFreshReacquisitionFixture('dual-witness');
    const witnessCandidate = await reacquireNativePegInCausalF2cAfterRestartV1(
      witnessFixture.input,
    );
    const primaryRun = createF2dSingleRunReportForTest({
      capturedAt: new Date('2026-07-22T11:58:00.000Z'),
      rpcOrigin: 'http://127.0.0.1:9944',
      launcherSha256Hex: LAUNCHER_SHA256_HEX,
      candidate: primaryCandidate,
    });
    const witnessRun = createF2dSingleRunReportForTest({
      capturedAt: new Date('2026-07-22T11:59:00.000Z'),
      rpcOrigin: 'http://127.0.0.1:9945',
      launcherSha256Hex: LAUNCHER_SHA256_HEX,
      candidate: witnessCandidate,
    });

    expect(() => createNativePegInCausalF2dDualOriginCampaignReportV1({
      capturedAt: new Date('2026-07-22T12:00:00.000Z'),
      primaryRun,
      witnessRun: createF2dSingleRunReportForTest({
        capturedAt: new Date('2026-07-22T11:59:00.000Z'),
        rpcOrigin: 'http://127.0.0.1:9944/',
        launcherSha256Hex: LAUNCHER_SHA256_HEX,
        candidate: primaryCandidate,
      }),
    })).toThrow(/distinct RPC origins/i);
    expect(() => createNativePegInCausalF2dDualOriginCampaignReportV1({
      capturedAt: new Date('2026-07-22T12:00:00.000Z'),
      primaryRun,
      witnessRun,
    }))
      .toThrow(/candidate disagreement/i);
    expect(() => createF2dSingleRunReportForTest({
      capturedAt: new Date('2026-07-22T11:59:00.000Z'),
      rpcOrigin: 'http://127.0.0.1:9945',
      launcherSha256Hex: LAUNCHER_SHA256_HEX,
      candidate: structuredClone(primaryCandidate),
    })).toThrow(/provenance is missing/i);

    const report = createNativePegInCausalF2dDualOriginCampaignReportV1({
      capturedAt: new Date('2026-07-22T12:00:00.000Z'),
      primaryRun,
      witnessRun: createF2dSingleRunReportForTest({
        capturedAt: new Date('2026-07-22T11:59:00.000Z'),
        rpcOrigin: 'http://127.0.0.1:9945',
        launcherSha256Hex: LAUNCHER_SHA256_HEX,
        candidate: primaryCandidate,
      }),
    });
    expect(() => validateNativePegInCausalF2dDualOriginCampaignReportV1({
      ...report,
      observations: {
        ...report.observations,
        candidateIdentityDigestHex: fixtureHash('mutated-campaign-report'),
      },
    })).toThrow(/report digest|candidate identity/i);
    expect(() => validateNativePegInCausalF2dDualOriginCampaignReportV1({
      ...report,
      candidate: {
        ...report.candidate,
        sourceProof: {
          ...report.candidate.sourceProof,
          unexpected: fixtureHash('unexpected-source-proof-field'),
        },
      },
    })).toThrow(/source-proof.*field set/i);
    expect(() => validateNativePegInCausalF2dDualOriginCampaignReportV1({
      ...report,
      candidate: {
        ...report.candidate,
        sourceProof: {
          ...report.candidate.sourceProof,
          proofDigestHex: fixtureHash('different-source-proof-digest'),
        },
      },
    })).toThrow(/candidate identity digest/i);
  });

  it('parses an explicit host command and writes a new validated report only', async () => {
    const parsed = parseNativePegInCausalF2dDualOriginCampaignArgs([
      '--mode', 'execute',
      '--input', 'campaign-input.json',
      '--expected-input-sha256', deriveCampaignInputManifestDigestHex(
        campaignInputManifest(),
      ),
      '--out', 'campaign-output.json',
      '--primary-rpc-url', 'http://127.0.0.1:9944',
      '--witness-rpc-url', 'http://127.0.0.1:9945',
      '--frontier-source', 'C:\\source\\frontier',
      '--cargo', 'C:\\tools\\cargo.exe',
      '--rustc', 'C:\\tools\\rustc.exe',
      '--git', 'C:\\tools\\git.exe',
      '--launcher-path', LAUNCHER_PATH,
      '--launcher-sha256', LAUNCHER_SHA256_HEX,
      '--policy-epoch', '7',
      '--policy-not-before-unix-ms', String(POLICY_NOT_BEFORE),
      '--policy-expires-at-unix-ms', String(POLICY_EXPIRES),
      '--allowed-system-dll', 'kernel32.dll',
      '--allowed-system-dll', 'ntdll.dll',
    ]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.allowedSystemDlls).toEqual(['kernel32.dll', 'ntdll.dll']);

    const primaryFixture = configureFreshReacquisitionFixture('cli-campaign');
    const primaryCandidate = await reacquireNativePegInCausalF2cAfterRestartV1(
      primaryFixture.input,
    );
    const report = createNativePegInCausalF2dDualOriginCampaignReportV1({
      capturedAt: new Date('2026-07-22T12:00:00.000Z'),
      primaryRun: createF2dSingleRunReportForTest({
        capturedAt: new Date('2026-07-22T11:58:00.000Z'),
        rpcOrigin: 'http://127.0.0.1:9944',
        launcherSha256Hex: LAUNCHER_SHA256_HEX,
        candidate: primaryCandidate,
      }),
      witnessRun: createF2dSingleRunReportForTest({
        capturedAt: new Date('2026-07-22T11:59:00.000Z'),
        rpcOrigin: 'http://127.0.0.1:9945',
        launcherSha256Hex: LAUNCHER_SHA256_HEX,
        candidate: primaryCandidate,
      }),
    });
    const root = mkdtempSync(join(tmpdir(), 'f2d-dual-campaign-'));
    const inputPath = join(root, 'campaign-input.json');
    const outputPath = join(root, 'campaign-output.json');
    writeFileSync(inputPath, `${JSON.stringify(campaignInputManifest())}\n`, 'utf8');
    const execute = vi.fn(async () => report);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const argv = [
      '--mode', 'execute',
      '--input', inputPath,
      '--expected-input-sha256', deriveCampaignInputManifestDigestHex(
        campaignInputManifest(),
      ),
      '--out', outputPath,
      '--primary-rpc-url', 'http://127.0.0.1:9944',
      '--witness-rpc-url', 'http://127.0.0.1:9945',
      '--frontier-source', 'C:\\source\\frontier',
      '--cargo', 'C:\\tools\\cargo.exe',
      '--rustc', 'C:\\tools\\rustc.exe',
      '--git', 'C:\\tools\\git.exe',
      '--launcher-path', LAUNCHER_PATH,
      '--launcher-sha256', LAUNCHER_SHA256_HEX,
      '--policy-epoch', '7',
      '--policy-not-before-unix-ms', String(POLICY_NOT_BEFORE),
      '--policy-expires-at-unix-ms', String(POLICY_EXPIRES),
      '--allowed-system-dll', 'kernel32.dll',
      '--allowed-system-dll', 'ntdll.dll',
    ];
    try {
      const digestIndex = argv.indexOf('--expected-input-sha256') + 1;
      const wrongDigestArgv = [...argv];
      wrongDigestArgv[digestIndex] = fixtureHash('wrong-campaign-input');
      await expect(runNativePegInCausalF2dDualOriginCampaignCli(wrongDigestArgv, {
        cwd: root,
        bridgeRoot: root,
        execute,
      })).rejects.toThrow(/canonical digest/i);
      expect(execute).not.toHaveBeenCalled();
      await runNativePegInCausalF2dDualOriginCampaignCli(argv, {
        cwd: root,
        bridgeRoot: root,
        execute,
      });
      expect(execute).toHaveBeenCalledOnce();
      expect(JSON.parse(readFileSync(outputPath, 'utf8'))).toEqual(report);
      await expect(runNativePegInCausalF2dDualOriginCampaignCli(argv, {
        cwd: root,
        bridgeRoot: root,
        execute,
      })).rejects.toThrow(/exist|new file/i);
    } finally {
      log.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('runs each RPC origin in a separate worker request before comparing reports', async () => {
    const fixture = configureFreshReacquisitionFixture('worker-isolation');
    const candidate = await reacquireNativePegInCausalF2cAfterRestartV1(fixture.input);
    const runs: ReturnType<typeof createNativePegInCausalF2dSingleRunReportV1>[] = [];
    const root = mkdtempSync(join(tmpdir(), 'f2d-worker-isolation-'));
    const capturedAt = new Date('2026-07-22T12:00:00.000Z');
    const args = parseNativePegInCausalF2dDualOriginCampaignArgs([
      '--mode', 'execute',
      '--input', 'campaign-input.json',
      '--expected-input-sha256', deriveCampaignInputManifestDigestHex(
        campaignInputManifest(),
      ),
      '--out', 'campaign-output.json',
      '--primary-rpc-url', 'http://127.0.0.1:9944',
      '--witness-rpc-url', 'http://127.0.0.1:9945',
      '--frontier-source', join(root, 'frontier'),
      '--cargo', join(root, 'cargo.exe'),
      '--rustc', join(root, 'rustc.exe'),
      '--git', join(root, 'git.exe'),
      '--launcher-path', join(root, 'launcher.exe'),
      '--launcher-sha256', LAUNCHER_SHA256_HEX,
      '--policy-epoch', '7',
      '--policy-not-before-unix-ms', String(POLICY_NOT_BEFORE),
      '--policy-expires-at-unix-ms', String(POLICY_EXPIRES),
      '--allowed-system-dll', 'kernel32.dll',
      '--allowed-system-dll', 'ntdll.dll',
    ]);
    const runWorker = vi.fn(async (request: unknown) => {
      const parsed = parseNativePegInCausalF2dSingleRunWorkerRequestV1(request);
      expect(Object.keys(parsed).sort()).toEqual([
        'allowedSystemDlls',
        'campaignInput',
        'capturedAtIso',
        'cargoExecutablePath',
        'frontierSourcePath',
        'gitExecutablePath',
        'launcherPath',
        'launcherSha256Hex',
        'policyEpoch',
        'policyExpiresAtUnixMs',
        'policyNotBeforeUnixMs',
        'rpcOrigin',
        'rustcExecutablePath',
        'schema',
      ]);
      const report = createNativePegInCausalF2dSingleRunReportV1({
        capturedAt: new Date(parsed.capturedAtIso),
        rpcOrigin: parsed.rpcOrigin,
        launcherSha256Hex: parsed.launcherSha256Hex,
        workerRequestDigestHex:
          deriveNativePegInCausalF2dSingleRunWorkerRequestDigestHex(parsed),
        candidate,
      });
      runs.push(report);
      if (runs.length === 1) {
        args.witnessRpcUrl = 'http://127.0.0.1:9999';
        capturedAt.setUTCSeconds(1);
      }
      return report;
    });
    try {
      await expect(executeNativePegInCausalF2dCampaign({
        args: {
          ...args,
          expectedInputSha256Hex: fixtureHash('wrong-core-input-digest'),
        },
        manifest: campaignInputManifest(),
        cwd: root,
        capturedAt,
      }, { runWorker })).rejects.toThrow(/canonical digest/i);
      expect(runWorker).not.toHaveBeenCalled();

      const report = await executeNativePegInCausalF2dCampaign({
        args,
        manifest: campaignInputManifest(),
        cwd: root,
        capturedAt,
      }, { runWorker });

      expect(runWorker).toHaveBeenCalledTimes(2);
      expect(runWorker.mock.calls.map(([request]) => (
        parseNativePegInCausalF2dSingleRunWorkerRequestV1(request).rpcOrigin
      ))).toEqual([
        'http://127.0.0.1:9944/',
        'http://127.0.0.1:9945/',
      ]);
      expect(report).toMatchObject({
        status: 'DUAL_ORIGIN_F2D_CANDIDATES_AGREE_WITHOUT_AUTHORITY',
        capturedAtIso: '2026-07-22T12:00:00.000Z',
        observations: {
          primaryRunReportDigestHex: runs[0].reportDigestHex,
          witnessRunReportDigestHex: runs[1].reportDigestHex,
        },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects worker requests with unknown fields or non-canonical origins', () => {
    const root = resolve('C:\\campaign');
    const request = {
      schema: 'e2s.native-peg-in-causal-f2d-single-run-worker-request.v1',
      campaignInput: campaignInputManifest(),
      capturedAtIso: '2026-07-22T12:00:00.000Z',
      rpcOrigin: 'http://127.0.0.1:9944/',
      frontierSourcePath: join(root, 'frontier'),
      cargoExecutablePath: join(root, 'cargo.exe'),
      rustcExecutablePath: join(root, 'rustc.exe'),
      gitExecutablePath: join(root, 'git.exe'),
      launcherPath: join(root, 'launcher.exe'),
      launcherSha256Hex: LAUNCHER_SHA256_HEX,
      policyEpoch: 7,
      policyNotBeforeUnixMs: POLICY_NOT_BEFORE,
      policyExpiresAtUnixMs: POLICY_EXPIRES,
      allowedSystemDlls: ['kernel32.dll', 'ntdll.dll'],
    };

    expect(parseNativePegInCausalF2dSingleRunWorkerRequestV1(request))
      .toEqual(request);
    expect(() => parseNativePegInCausalF2dSingleRunWorkerRequestV1({
      ...request,
      unexpected: true,
    })).toThrow(/missing or unknown fields/i);
    expect(() => parseNativePegInCausalF2dSingleRunWorkerRequestV1({
      ...request,
      rpcOrigin: 'http://127.0.0.1:9944/#fragment',
    })).toThrow(/canonical|query|fragment/i);
    expect(() => parseNativePegInCausalF2dSingleRunWorkerRequestV1({
      ...request,
      rpcOrigin: 'https://node.example/rpc-a',
    })).toThrow(/origin|path/i);
    expect(() => parseNativePegInCausalF2dSingleRunWorkerRequestV1({
      ...request,
      allowedSystemDlls: ['ntdll.dll', 'kernel32.dll'],
    })).toThrow(/sorted/i);
    for (const field of [
      'trustAnchor',
      'executionIdentityStatement',
      'eventStatement',
      'contractStateStatement',
      'sourceProofRequest',
      'sourceProofEnvelope',
    ] as const) {
      expect(() => parseNativePegInCausalF2dSingleRunWorkerRequestV1({
        ...request,
        campaignInput: {
          ...request.campaignInput,
          [field]: {
            ...request.campaignInput[field],
            unexpectedSerializedState: fixtureHash(`unexpected:${field}`),
          },
        },
      }), field).toThrow(/unexpected|unknown|field/i);
    }

    const requestDigestHex =
      deriveNativePegInCausalF2dSingleRunWorkerRequestDigestHex(request);
    expect(requestDigestHex).toMatch(/^0x[0-9a-f]{64}$/);
    expect(deriveNativePegInCausalF2dSingleRunWorkerRequestDigestHex({
      ...request,
      capturedAtIso: '2026-07-22T12:00:01.000Z',
    })).not.toBe(requestDigestHex);
    expect(deriveNativePegInCausalF2dSingleRunWorkerRequestDigestHex({
      ...request,
      campaignInput: {
        ...request.campaignInput,
        targetNativeBlockHashHex: fixtureHash('different-request-target'),
      },
    })).not.toBe(requestDigestHex);
  });

  it('rejects worker request input as soon as the bounded byte limit is exceeded', async () => {
    const limit = 8 * 1024 * 1024;
    await expect(readNativePegInCausalF2dWorkerInput(Readable.from([
      Buffer.from('{}', 'utf8'),
    ]))).resolves.toEqual(Buffer.from('{}', 'utf8'));
    await expect(readNativePegInCausalF2dWorkerInput(Readable.from([
      Buffer.alloc(limit, 0x20),
      Buffer.from('x', 'utf8'),
    ]))).rejects.toThrow(/byte limit/i);
  });

  it('rejects a valid worker report attributed to another origin or complete request', async () => {
    const fixture = configureFreshReacquisitionFixture('worker-origin-binding');
    const candidate = await reacquireNativePegInCausalF2cAfterRestartV1(fixture.input);
    const wrongOriginReport = createF2dSingleRunReportForTest({
      capturedAt: new Date('2026-07-22T11:58:00.000Z'),
      rpcOrigin: 'http://127.0.0.1:9955',
      launcherSha256Hex: LAUNCHER_SHA256_HEX,
      candidate,
    });
    const wrongRequestReport = createF2dSingleRunReportForTest({
      capturedAt: new Date('2026-07-22T12:00:00.000Z'),
      rpcOrigin: 'http://127.0.0.1:9944',
      launcherSha256Hex: LAUNCHER_SHA256_HEX,
      candidate,
    });
    const root = mkdtempSync(join(tmpdir(), 'f2d-worker-origin-'));
    const args = parseNativePegInCausalF2dDualOriginCampaignArgs([
      '--mode', 'execute',
      '--input', 'campaign-input.json',
      '--expected-input-sha256', deriveCampaignInputManifestDigestHex(
        campaignInputManifest(),
      ),
      '--out', 'campaign-output.json',
      '--primary-rpc-url', 'http://127.0.0.1:9944',
      '--witness-rpc-url', 'http://127.0.0.1:9945',
      '--frontier-source', join(root, 'frontier'),
      '--cargo', join(root, 'cargo.exe'),
      '--rustc', join(root, 'rustc.exe'),
      '--git', join(root, 'git.exe'),
      '--launcher-path', join(root, 'launcher.exe'),
      '--launcher-sha256', LAUNCHER_SHA256_HEX,
      '--policy-epoch', '7',
      '--policy-not-before-unix-ms', String(POLICY_NOT_BEFORE),
      '--policy-expires-at-unix-ms', String(POLICY_EXPIRES),
      '--allowed-system-dll', 'kernel32.dll',
    ]);
    try {
      await expect(executeNativePegInCausalF2dCampaign({
        args,
        manifest: campaignInputManifest(),
        cwd: root,
        capturedAt: new Date('2026-07-22T12:00:00.000Z'),
      }, {
        runWorker: async () => wrongOriginReport,
      })).rejects.toThrow(/requested RPC origin/i);
      await expect(executeNativePegInCausalF2dCampaign({
        args,
        manifest: campaignInputManifest(),
        cwd: root,
        capturedAt: new Date('2026-07-22T12:00:00.000Z'),
      }, {
        runWorker: async () => wrongRequestReport,
      })).rejects.toThrow(/complete requested input/i);
      const sameOriginWorker = vi.fn();
      await expect(executeNativePegInCausalF2dCampaign({
        args: {
          ...args,
          witnessRpcUrl: 'http://127.0.0.1:9944/',
        },
        manifest: campaignInputManifest(),
        cwd: root,
        capturedAt: new Date('2026-07-22T12:00:00.000Z'),
      }, {
        runWorker: sameOriginWorker,
      })).rejects.toThrow(/distinct RPC origins/i);
      expect(sameOriginWorker).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects incomplete, duplicate, or implicit operational arguments', () => {
    const parsed = parseNativePegInCausalF2dDualOriginCampaignArgs([
      '--input', 'first.json',
      '--input', 'second.json',
      '--unknown', 'value',
    ]);
    expect(parsed.errors).toEqual(expect.arrayContaining([
      '--mode is required',
      '--input may be provided only once',
      'unknown option: --unknown',
      'unknown option: value',
      '--out is required',
      '--expected-input-sha256 is required',
      '--primary-rpc-url is required',
      '--witness-rpc-url is required',
      '--frontier-source is required',
      '--launcher-path is required',
      '--allowed-system-dll is required at least once',
    ]));
  });
});

type FixtureOptions = {
  hold?: PegInCausalAdmissionObservationKindV1;
  producerExpiresAtNativeHeight?: string;
  receiptAdmittedAtNativeHeight?: string;
  sourceProofValidatedAtNativeHeight?: string;
  receiptMutation?:
    | 'causalProfileIdHex'
    | 'sourceIntentIdHex'
    | 'admissionIdHex'
    | 'sourceProofRequestDigestHex'
    | 'sourceProofResultIdHex'
    | 'sourceProofDigestHex'
    | 'verifierExecutableSha256Hex'
    | 'admissionExpiresAtNativeHeight';
  runtimeMutation?:
    | 'sidechainIdHex'
    | 'bridgeAddressHex'
    | 'tokenAddressHex'
    | 'sourceBoxIdHex'
    | 'recipientAddressHex'
    | 'amountNanoErg'
    | 'profileRevision'
    | 'activationHeight';
};

async function createFixture(
  label: string,
  options: FixtureOptions = {},
) {
  const preflight = await createPreflightFixture(label, options);
  const lifecycleJournal = createLifecycleJournal(
    label,
    preflight.sourceProofResult,
    options.hold,
  );
  return {
    sourceProofResult: preflight.sourceProofResult,
    input: {
      ...preflight.input,
      lifecycleJournal,
    } satisfies NativePegInCausalF2cCompositionV1Input,
  };
}

async function createPreflightFixture(
  label: string,
  options: FixtureOptions = {},
) {
  const sourceProofRequest = createAlignedSourceRequest(label, options.runtimeMutation);
  activeSourceRequest = sourceProofRequest;
  const envelope = createPegInCausalSourceProofEnvelopeV1Fixture({
    request: sourceProofRequest,
    issuedAtNativeHeight: '1000',
    expiresAtNativeHeight: '1064',
  });
  const sourceProofResult = validatePegInCausalSourceProofEnvelopeV1({
    request: sourceProofRequest,
    envelope,
    currentNativeHeight: options.sourceProofValidatedAtNativeHeight ?? '1001',
  });
  activeV3Output = integratedV3Output(sourceProofRequest, sourceProofResult, options);

  const causalV3Evaluator = createPinnedLocalCausalV3ResultCandidateEvaluator(
    evaluatorOptions(),
  );
  const sourceProofProducerEvaluator =
    createPinnedLocalCausalSourceProofProducerCandidateEvaluator(evaluatorOptions());
  const causalV3Candidate = await causalV3Evaluator.evaluate({
    trustedAnchorDigestHex: v3Vector.trustedAnchorDigestHex,
    request: v3Vector.request,
  });
  const sourceProofProducerCandidate = await sourceProofProducerEvaluator.evaluate({
    request: sourceProofRequest,
    issuedAtNativeHeight: '1000',
    expiresAtNativeHeight: options.producerExpiresAtNativeHeight ?? '1064',
  });
  return {
    sourceProofResult,
    input: {
      causalV3Evaluator,
      causalV3Candidate,
      causalV3Request: v3Vector.request,
      sourceProofProducerEvaluator,
      sourceProofProducerCandidate,
      sourceProofRequest,
      sourceProofResult,
      currentNativeHeight: CURRENT_NATIVE_HEIGHT,
    } satisfies NativePegInCausalF2cPreflightV1Input,
  };
}

function configureFreshReacquisitionFixture(
  label: string,
  options: {
    collectorError?: Error;
    finalizedHeadNumber?: string;
    runtimeMutation?: FixtureOptions['runtimeMutation'];
  } = {},
) {
  const sourceProofRequest = createAlignedSourceRequest(label, options.runtimeMutation);
  activeSourceRequest = sourceProofRequest;
  const sourceProofEnvelope = createPegInCausalSourceProofEnvelopeV1Fixture({
    request: sourceProofRequest,
    issuedAtNativeHeight: '1000',
    expiresAtNativeHeight: '1064',
  });
  const sourceProofResult = validatePegInCausalSourceProofEnvelopeV1({
    request: sourceProofRequest,
    envelope: sourceProofEnvelope,
    currentNativeHeight: CURRENT_NATIVE_HEIGHT,
  });
  activeV3Output = integratedV3Output(sourceProofRequest, sourceProofResult, {});
  const causalV3Evaluator = createPinnedLocalCausalV3ResultCandidateEvaluator(
    evaluatorOptions(),
  );
  const sourceProofProducerEvaluator =
    createPinnedLocalCausalSourceProofProducerCandidateEvaluator(evaluatorOptions());
  if (options.collectorError) {
    mocks.collectV3.mockRejectedValueOnce(options.collectorError);
  } else {
    mocks.collectV3.mockImplementationOnce(async collectionInput => ({
      collection: {
        request: v3Vector.request,
        acquisition: {
          finalizedHeadNumber:
            options.finalizedHeadNumber ?? CURRENT_NATIVE_HEIGHT,
        },
      },
      candidate: await collectionInput.evaluator.evaluate({
        trustedAnchorDigestHex: v3Vector.trustedAnchorDigestHex,
        request: v3Vector.request,
      }),
    }));
  }
  return {
    sourceProofResult,
    input: {
      causalV3Collection: {
        rpc: {},
        codec: {},
        trustAnchor: {},
        targetNativeBlockHashHex: fixtureHash(`${label}-target`),
        executionIdentityStatement: {},
        eventStatement: {},
        contractStateStatement: {},
        trustedAnchorDigestHex: v3Vector.trustedAnchorDigestHex,
        evaluator: causalV3Evaluator,
      } as unknown as NativePegInCausalF2cFreshProcessReacquisitionV1Input[
        'causalV3Collection'
      ],
      sourceProofProducerEvaluator,
      sourceProofRequest,
      sourceProofEnvelope,
    } satisfies NativePegInCausalF2cFreshProcessReacquisitionV1Input,
  };
}

function createAlignedSourceRequest(
  label: string,
  mutation?:
    | 'sidechainIdHex'
    | 'bridgeAddressHex'
    | 'tokenAddressHex'
    | 'sourceBoxIdHex'
    | 'recipientAddressHex'
    | 'amountNanoErg'
    | 'profileRevision'
    | 'activationHeight',
): PegInCausalSourceProofRequestV1 {
  const base = createPegInCausalSourceProofRequestV1Fixture(label);
  const runtimeRecord = decodePegInRuntimeRecordV1ScaleHex(
    v3Vector.request.mintTransitionRequest.contractStateRequest.eventRequest
      .executionIdentityRequest.statement.expectedRecordScaleHex,
  );
  const tokenAddressHex =
    v3Vector.request.mintTransitionRequest.contractStateRequest.statement.tokenAddressHex;
  const admissionProfile: PegInCausalSourceProofRequestV1['admissionProfile'] = {
    ...base.admissionProfile,
    sidechainIdHex: runtimeRecord.sidechainIdHex,
    bridgeAddressHex: runtimeRecord.bridgeAddress,
    tokenAddressHex,
    profileRevision: runtimeRecord.profileRevision,
    activationHeight: runtimeRecord.profileActivationHeight,
  };
  if (mutation === 'sidechainIdHex') {
    (admissionProfile as any).sidechainIdHex = fixtureHash(`${label}-different-sidechain`);
  } else if (mutation === 'bridgeAddressHex') {
    (admissionProfile as any).bridgeAddressHex = base.admissionProfile.bridgeAddressHex;
  } else if (mutation === 'tokenAddressHex') {
    (admissionProfile as any).tokenAddressHex = base.admissionProfile.tokenAddressHex;
  } else if (mutation === 'profileRevision') {
    (admissionProfile as any).profileRevision =
      (BigInt(runtimeRecord.profileRevision) + 1n).toString();
  } else if (mutation === 'activationHeight') {
    (admissionProfile as any).activationHeight =
      (BigInt(runtimeRecord.profileActivationHeight) + 1n).toString();
  }
  const sourceBoxIdHex = mutation === 'sourceBoxIdHex'
    ? fixtureHash(`${label}-different-source-box`)
    : runtimeRecord.ergoBoxIdHex;
  const sourceIntent = {
    ...base.sourceIntent,
    sidechainIdHex: admissionProfile.sidechainIdHex,
    bridgeAddressHex: admissionProfile.bridgeAddressHex,
    tokenAddressHex: admissionProfile.tokenAddressHex,
    admissionProfileIdHex: derivePegInCausalAdmissionProfileIdV2Hex(admissionProfile),
    amountNanoErg: mutation === 'amountNanoErg'
      ? (BigInt(runtimeRecord.amountNanoErg) + 1n).toString()
      : runtimeRecord.amountNanoErg,
    recipientAddressHex: mutation === 'recipientAddressHex'
      ? base.sourceIntent.recipientAddressHex
      : runtimeRecord.recipientAddress,
  };
  const statement = {
    ...base.statement,
    sourceIntentIdHex: derivePegInSourceIntentIdV2Hex(sourceIntent),
    legacyMintIdentityHex: derivePegInRuntimeRecordKeyV1Hex({
      sidechainIdHex: admissionProfile.sidechainIdHex,
      ergoBoxIdHex: sourceBoxIdHex,
    }),
    sourceBoxIdHex,
  };
  return {
    ...base,
    candidateIdHex: derivePegInCausalAdmissionIdV2Hex(statement),
    admissionProfile,
    sourceIntent,
    statement,
    sourceConsumption: {
      ...base.sourceConsumption,
      consumedSourceBoxIdHex: statement.sourceBoxIdHex,
    },
  };
}

function integratedV3Output(
  request: PegInCausalSourceProofRequestV1,
  result: PegInCausalSourceProofResultV1,
  options: {
    receiptAdmittedAtNativeHeight?: string;
    receiptMutation?: string;
  },
): Record<string, any> {
  const output = structuredClone(v3Vector.expected);
  const transition = output.causalTransition;
  transition.causalProfileIdHex = derivePegInCausalAdmissionProfileIdV2Hex(
    request.admissionProfile,
  );
  transition.sourceIntentIdHex = derivePegInSourceIntentIdV2Hex(request.sourceIntent);
  transition.admissionIdHex = result.admissionIdHex;
  transition.sourceProofRequestDigestHex = result.requestDigestHex;
  transition.sourceProofResultIdHex = result.sourceProofResultIdHex;
  transition.sourceProofDigestHex = result.sourceProofDigestHex;
  transition.verifierExecutableSha256Hex = result.verifierExecutableSha256Hex;
  transition.verifierProfileIdHex = result.verifierProfileIdHex;
  transition.admissionExpiresAtNativeHeight = result.expiresAtNativeHeight;
  if (options.receiptMutation) {
    if (options.receiptMutation === 'admissionExpiresAtNativeHeight') {
      transition.admissionExpiresAtNativeHeight = '1065';
    } else {
      transition[options.receiptMutation] = fixtureHash(
        `${request.candidateIdHex}-${options.receiptMutation}`,
      );
    }
  }
  const consumed = decodePegInConsumedAdmissionV3Hex(transition.consumedAdmissionV3Hex);
  transition.consumedAdmissionV3Hex = encodePegInConsumedAdmissionV3Hex({
    ...consumed,
    admissionIdHex: transition.admissionIdHex,
    sourceIntentIdHex: transition.sourceIntentIdHex,
  });
  transition.admissionReceiptScaleHex = encodeReceipt({
    profileIdHex: transition.causalProfileIdHex,
    admissionIdHex: transition.admissionIdHex,
    sourceProofRequestDigestHex: transition.sourceProofRequestDigestHex,
    sourceProofResultIdHex: transition.sourceProofResultIdHex,
    sourceProofDigestHex: transition.sourceProofDigestHex,
    verifierExecutableSha256Hex: transition.verifierExecutableSha256Hex,
    verifierProfileIdHex: transition.verifierProfileIdHex,
    admittedAtNativeHeight: options.receiptAdmittedAtNativeHeight ?? '1020',
    expiresAtNativeHeight: transition.admissionExpiresAtNativeHeight,
  });
  return output;
}

function createLifecycleJournal(
  label: string,
  result: PegInCausalSourceProofResultV1,
  hold?: PegInCausalAdmissionObservationKindV1,
): PegInCausalAdmissionLifecycleJournalV1 {
  const registry = createPegInCausalAdmissionSecurityRegistryV1();
  let journal = createPegInCausalAdmissionLifecycleJournalV1(result.candidateIdHex);
  const proof = createPegInCausalAdmissionProofReferenceV1(result);
  journal = appendPegInCausalAdmissionLifecycleEventV1({
    journal,
    registry,
    currentNativeHeight: CURRENT_NATIVE_HEIGHT,
    event: {
      formatVersion: 1,
      eventIdHex: fixtureHash(`${label}-admission`),
      candidateIdHex: result.candidateIdHex,
      kind: 'proof',
      proof,
    },
  }).journal;
  if (hold) {
    journal = appendPegInCausalAdmissionLifecycleEventV1({
      journal,
      registry,
      currentNativeHeight: CURRENT_NATIVE_HEIGHT,
      event: {
        formatVersion: 1,
        eventIdHex: fixtureHash(`${label}-${hold}`),
        candidateIdHex: result.candidateIdHex,
        kind: 'observation',
        source: 'rpc',
        observation: hold,
        evidenceIdHex: fixtureHash(`${label}-${hold}-evidence`),
      },
    }).journal;
  }
  return journal;
}

function encodeReceipt(input: {
  profileIdHex: string;
  admissionIdHex: string;
  sourceProofRequestDigestHex: string;
  sourceProofResultIdHex: string;
  sourceProofDigestHex: string;
  verifierExecutableSha256Hex: string;
  verifierProfileIdHex: string;
  admittedAtNativeHeight: string;
  expiresAtNativeHeight: string;
}): string {
  const height = (value: string): Buffer => {
    const bytes = Buffer.alloc(8);
    bytes.writeBigUInt64LE(BigInt(value));
    return bytes;
  };
  return `0x${Buffer.concat([
    Buffer.from([1]),
    ...[
      input.profileIdHex,
      input.admissionIdHex,
      input.sourceProofRequestDigestHex,
      input.sourceProofResultIdHex,
      input.sourceProofDigestHex,
      input.verifierExecutableSha256Hex,
      input.verifierProfileIdHex,
    ].map(value => Buffer.from(value.slice(2), 'hex')),
    height(input.admittedAtNativeHeight),
    height(input.expiresAtNativeHeight),
  ]).toString('hex')}`;
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

function campaignInputManifest(): CampaignInputManifestV1 {
  const executionIdentityRequest = v3Vector.request.mintTransitionRequest
    .contractStateRequest.eventRequest.executionIdentityRequest;
  const eventRequest = v3Vector.request.mintTransitionRequest
    .contractStateRequest.eventRequest;
  const contractStateRequest = v3Vector.request.mintTransitionRequest.contractStateRequest;
  const sourceProofRequest = createAlignedSourceRequest('campaign-input-manifest');
  const sourceProofEnvelope = createPegInCausalSourceProofEnvelopeV1Fixture({
    request: sourceProofRequest,
    issuedAtNativeHeight: '1000',
    expiresAtNativeHeight: '1064',
  });
  return {
    schema: 'e2s.native-peg-in-causal-f2d-campaign-input.v1' as const,
    targetNativeBlockHashHex: executionIdentityRequest.targetNativeBlockHashHex,
    trustAnchor: executionIdentityRequest.trustAnchor,
    executionIdentityStatement: executionIdentityRequest.statement,
    eventStatement: eventRequest.statement,
    contractStateStatement: contractStateRequest.statement,
    trustedAnchorDigestHex: v3Vector.trustedAnchorDigestHex,
    sourceProofRequest,
    sourceProofEnvelope,
    rpcTimeoutMs: 10_000,
    nativeTimeoutMs: 30_000,
    collectionDeadlineMs: 120_000,
    rpcConcurrency: 8,
    maxAttempts: 2,
  };
}

function v3ExecutionIdentity(): PinnedLocalPegInCausalMintTransitionV3ExecutionIdentity {
  return Object.freeze({
    schema: 'e2s.pinned-local-peg-in-causal-mint-transition-v3-execution-identity.v1',
    status: 'PINNED_LOCAL_CAUSAL_V3_EXECUTION_IDENTITY_REFRESHED',
    identityDigestHex: `0x${'44'.repeat(32)}`,
    sourceIdentity: sourceIdentity(),
    toolchain: toolchain(),
    executable: {
      sha256Hex: V3_VERIFIER_SHA256_HEX,
      vectorCanonicalSha256Hex: V3_VECTOR_SHA256_HEX,
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

function producerExecutionIdentity():
PinnedLocalPegInCausalSourceProofResultProducerV1ExecutionIdentity {
  return Object.freeze({
    schema:
      'e2s.pinned-local-peg-in-causal-source-proof-result-producer-v1-execution-identity.v1',
    status:
      'PINNED_LOCAL_CAUSAL_SOURCE_PROOF_RESULT_PRODUCER_V1_EXECUTION_IDENTITY_REFRESHED',
    identityDigestHex: `0x${'45'.repeat(32)}`,
    sourceIdentity: sourceIdentity(),
    toolchain: toolchain(),
    executable: {
      sha256Hex: PRODUCER_SHA256_HEX,
      vectorCanonicalSha256Hex: PRODUCER_VECTOR_SHA256_HEX,
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

function sourceIdentity() {
  return {
    consensusSourceLockSha256: 'aa'.repeat(32),
    frontierCommit: 'bb'.repeat(20),
    frontierPatchSha256: 'cc'.repeat(32),
  };
}

function toolchain() {
  return {
    platformKey: 'win32-x64',
    rustTarget: 'x86_64-pc-windows-msvc',
    cargo: { version: 'cargo pinned', sha256: '11'.repeat(32) },
    rustc: { version: 'rustc pinned', sha256: '22'.repeat(32) },
    git: { version: 'git pinned', sha256: '33'.repeat(32) },
  };
}

function containedResult(stdout: Buffer) {
  return {
    stdout,
    boundary: {
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
    },
  };
}
