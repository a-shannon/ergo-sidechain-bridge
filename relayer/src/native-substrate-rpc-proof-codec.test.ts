import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';

import {
  createAuthorityBoundNativeSubstrateRpcProofCodec,
  createPolicyBoundContainedNativeSubstrateRpcProofCodec,
  createNativeSubstrateRpcProofCodec,
  NATIVE_RPC_CODEC_STDOUT_LIMIT_BYTES,
  RPC_FINALITY_INSPECTION_RESULT_SCHEMA,
  RPC_HEADER_ENCODING_RESULT_SCHEMA,
  RPC_WARP_INSPECTION_RESULT_SCHEMA,
} from './native-substrate-rpc-proof-codec.js';
import { deriveExecutableInvocationSha256Hex } from './native-executable-pin.js';
import type {
  NativeContainedProcessInput,
  NativeContainedProcessResult,
} from './native-contained-process.js';
import type { NativeVerifierExecutionAuthority } from './native-verifier-execution-authority.js';
import { createNativeVerifierAttestationExecutionFixture } from './native-verifier-attestation-fixture.test-helper.js';

const runNativeContainedProcessMock = vi.hoisted(() => vi.fn());
const authorityProvenanceMocks = vi.hoisted(() => ({
  assertAuthority: vi.fn(),
  assertResult: vi.fn(),
}));
vi.mock('./native-contained-process.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./native-contained-process.js')>();
  return {
    ...actual,
    runNativeContainedProcess: runNativeContainedProcessMock,
  };
});
vi.mock('./native-verifier-execution-authority.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./native-verifier-execution-authority.js')
  >();
  return {
    ...actual,
    assertNativeVerifierExecutionAuthorityProvenance:
      authorityProvenanceMocks.assertAuthority,
    assertNativeVerifierExecutionAuthorityResultProvenance:
      authorityProvenanceMocks.assertResult,
  };
});

afterEach(() => {
  runNativeContainedProcessMock.mockReset();
  authorityProvenanceMocks.assertAuthority.mockReset();
  authorityProvenanceMocks.assertResult.mockReset();
  vi.useRealTimers();
});

const hash = (byte: string): string => `0x${byte.repeat(64)}`;
const executableSha256Hex =
  `0x${createHash('sha256').update(readFileSync(process.execPath)).digest('hex')}`;
const invocationPins = (
  executableDigest: string,
  executableArgs: readonly string[],
) => ({
  encodeHeaders: deriveExecutableInvocationSha256Hex(
    executableDigest,
    [...executableArgs, '--encode-headers'],
  ),
  inspectWarpProof: deriveExecutableInvocationSha256Hex(
    executableDigest,
    [...executableArgs, '--inspect-warp-proof'],
  ),
  inspectFinalityProof: deriveExecutableInvocationSha256Hex(
    executableDigest,
    [...executableArgs, '--inspect-finality-proof'],
  ),
});
const fakeCodecScript = String.raw`
const chunks=[];
process.stdin.on('data',chunk=>chunks.push(chunk));
process.stdin.on('end',()=>{
  const request=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const mode=process.argv[1];
  if(mode==='--encode-headers'){
    process.stdout.write(JSON.stringify({
      schema:'${RPC_HEADER_ENCODING_RESULT_SCHEMA}',
      headers:request.headers.map((entry,index)=>({
        hashHex:entry.expectedHashHex,
        number:String(index+1),
        parentHashHex:'${hash('1')}',
        stateRootHex:'${hash('2')}',
        headerScaleHex:'0x00'
      }))
    }));
  }else if(mode==='--inspect-warp-proof'){
    process.stdout.write(JSON.stringify({
      schema:'${RPC_WARP_INSPECTION_RESULT_SCHEMA}',
      sourceTargetHashHex:'${hash('4')}',
      sourceTargetNumber:'4',
      sourceTargetParentHashHex:'${hash('3')}',
      sourceTargetHeaderScaleHex:'0x01',
      sourceComplete:true,
      sourceFragmentCount:2,
      stoppedBeforeHorizon:true,
      selectedFragmentCount:1,
      selectedProofScaleHex:'0x02',
      selectedTargetHashHex:'${hash('3')}',
      selectedTargetNumber:'3',
      selectedTargetParentHashHex:'${hash('2')}',
      selectedTargetHeaderScaleHex:'0x00',
      cryptographicallyVerified:false
    }));
  }else if(mode==='--inspect-finality-proof'){
    process.stdout.write(JSON.stringify({
      schema:'${RPC_FINALITY_INSPECTION_RESULT_SCHEMA}',
      horizonHashHex:'${hash('3')}',
      horizonNumber:'3',
      canonicalJustificationScaleHex:'0x00',
      unknownHeaderCount:1,
      cryptographicallyVerified:false
    }));
  }else{process.exitCode=2;}
});
`;

function fakeCodec() {
  const executableArgs = ['-e', fakeCodecScript, '--'];
  return createNativeSubstrateRpcProofCodec({
    executablePath: process.execPath,
    expectedExecutableSha256Hex: executableSha256Hex,
    expectedExecutableInvocationSha256Hex: invocationPins(
      executableSha256Hex,
      executableArgs,
    ),
    executableArgs,
  });
}

describe('createNativeSubstrateRpcProofCodec', () => {
  it('matches the contained broker stdout limit', () => {
    expect(NATIVE_RPC_CODEC_STDOUT_LIMIT_BYTES).toBe(16 * 1024 * 1024);
  });

  it('normalizes all three acquisition-only codec operations', async () => {
    const codec = fakeCodec();
    expect(codec.executionBoundary).toEqual({
      mode: 'direct-process-acquisition-only',
      executionPolicyValidated: false,
      containedProcessRequired: false,
      cryptographicVerificationProvided: false,
      settlementAuthorityGranted: false,
    });
    await expect(codec.encodeHeaders([{
      expectedHashHex: hash('4'),
      header: {
        parentHash: hash('1'),
        number: '0x1',
        stateRoot: hash('2'),
        extrinsicsRoot: hash('5'),
        digest: { logs: [] },
      },
    }])).resolves.toEqual([{
      hashHex: hash('4'),
      number: '1',
      parentHashHex: hash('1'),
      stateRootHex: hash('2'),
      headerScaleHex: '0x00',
    }]);
    await expect(codec.inspectWarpProof('0x00', '4')).resolves.toEqual({
      sourceTargetHashHex: hash('4'),
      sourceTargetNumber: '4',
      sourceTargetParentHashHex: hash('3'),
      sourceTargetHeaderScaleHex: '0x01',
      sourceComplete: true,
      sourceFragmentCount: 2,
      stoppedBeforeHorizon: true,
      selectedFragmentCount: 1,
      selectedProofScaleHex: '0x02',
      selectedTargetHashHex: hash('3'),
      selectedTargetNumber: '3',
      selectedTargetParentHashHex: hash('2'),
      selectedTargetHeaderScaleHex: '0x00',
      cryptographicallyVerified: false,
    });
    await expect(codec.inspectFinalityProof('0x00')).resolves.toEqual({
      horizonHashHex: hash('3'),
      horizonNumber: '3',
      canonicalJustificationScaleHex: '0x00',
      unknownHeaderCount: 1,
      cryptographicallyVerified: false,
    });
  });

  it('rejects malformed requests before spawning and unsafe native claims after spawning', async () => {
    const codec = fakeCodec();
    await expect(codec.inspectWarpProof('00', '4')).rejects.toThrow(/0x-prefixed/);
    await expect(codec.encodeHeaders([])).rejects.toThrow(/between 1/);

    const unsafeScript = `process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(JSON.stringify({schema:'${RPC_WARP_INSPECTION_RESULT_SCHEMA}',sourceTargetHashHex:'${hash('4')}',sourceTargetNumber:'4',sourceTargetParentHashHex:'${hash('3')}',sourceTargetHeaderScaleHex:'0x01',sourceComplete:true,sourceFragmentCount:2,stoppedBeforeHorizon:true,selectedFragmentCount:1,selectedProofScaleHex:'0x02',selectedTargetHashHex:'${hash('3')}',selectedTargetNumber:'3',selectedTargetParentHashHex:'${hash('2')}',selectedTargetHeaderScaleHex:'0x00',cryptographicallyVerified:true})));`;
    const unsafe = createNativeSubstrateRpcProofCodec({
      executablePath: process.execPath,
      expectedExecutableSha256Hex: executableSha256Hex,
      expectedExecutableInvocationSha256Hex: invocationPins(
        executableSha256Hex,
        ['-e', unsafeScript, '--'],
      ),
      executableArgs: ['-e', unsafeScript, '--'],
    });
    await expect(unsafe.inspectWarpProof('0x00', '4')).rejects.toThrow(/boundary/);
  });

  it('rejects relative executables and native failures without exposing stderr', async () => {
    expect(() => createNativeSubstrateRpcProofCodec({
      executablePath: 'codec',
      expectedExecutableSha256Hex: executableSha256Hex,
      expectedExecutableInvocationSha256Hex: invocationPins(
        executableSha256Hex,
        [],
      ),
    })).toThrow(
      /absolute path/,
    );
    const rejectingArgs = ['-e', "process.stdin.resume();process.stdin.on('end',()=>{console.error('private detail');process.exitCode=2;});", '--'];
    const rejecting = createNativeSubstrateRpcProofCodec({
      executablePath: process.execPath,
      expectedExecutableSha256Hex: executableSha256Hex,
      expectedExecutableInvocationSha256Hex: invocationPins(
        executableSha256Hex,
        rejectingArgs,
      ),
      executableArgs: rejectingArgs,
    });
    const error = await rejecting.inspectFinalityProof('0x00').then(
      () => undefined,
      reason => reason as Error,
    );
    expect(error?.message).toBe('native RPC codec rejected the request');
    expect(error?.message).not.toContain('private detail');
  });

  it('rejects a codec executable that differs from the reviewed pin', async () => {
    const executableArgs = ['-e', fakeCodecScript, '--'];
    const codec = createNativeSubstrateRpcProofCodec({
      executablePath: process.execPath,
      expectedExecutableSha256Hex: hash('f'),
      expectedExecutableInvocationSha256Hex: invocationPins(
        hash('f'),
        executableArgs,
      ),
      executableArgs,
    });
    await expect(codec.inspectFinalityProof('0x00')).rejects.toThrow(/reviewed pin/i);
  });

  it('rejects codec arguments that differ from the reviewed invocation pins', async () => {
    const codec = createNativeSubstrateRpcProofCodec({
      executablePath: process.execPath,
      expectedExecutableSha256Hex: executableSha256Hex,
      expectedExecutableInvocationSha256Hex: invocationPins(
        executableSha256Hex,
        [],
      ),
      executableArgs: ['-e', fakeCodecScript, '--'],
    });
    await expect(codec.inspectFinalityProof('0x00')).rejects.toThrow(/argv pin/i);
  });

  it('routes every policy-bound operation through the contained broker contract', async () => {
    const fixture = createNativeVerifierAttestationExecutionFixture();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-12T13:00:00.000Z'));
    runNativeContainedProcessMock.mockImplementation(async (
      input: NativeContainedProcessInput,
    ): Promise<NativeContainedProcessResult> => {
      const mode = input.targetArgs[0];
      const request = JSON.parse(input.requestBytes.toString('utf8')) as Record<string, unknown>;
      const output = mode === '--encode-headers'
        ? {
            schema: RPC_HEADER_ENCODING_RESULT_SCHEMA,
            headers: [{
              hashHex: hash('4'),
              number: '1',
              parentHashHex: hash('1'),
              stateRootHex: hash('2'),
              headerScaleHex: '0x00',
            }],
          }
        : mode === '--inspect-warp-proof'
          ? {
              schema: RPC_WARP_INSPECTION_RESULT_SCHEMA,
              sourceTargetHashHex: hash('4'),
              sourceTargetNumber: '4',
              sourceTargetParentHashHex: hash('3'),
              sourceTargetHeaderScaleHex: '0x01',
              sourceComplete: true,
              sourceFragmentCount: 2,
              stoppedBeforeHorizon: true,
              selectedFragmentCount: 1,
              selectedProofScaleHex: '0x02',
              selectedTargetHashHex: hash('3'),
              selectedTargetNumber: '3',
              selectedTargetParentHashHex: hash('2'),
              selectedTargetHeaderScaleHex: '0x00',
              cryptographicallyVerified: false,
            }
          : {
              schema: RPC_FINALITY_INSPECTION_RESULT_SCHEMA,
              horizonHashHex: hash('3'),
              horizonNumber: '3',
              canonicalJustificationScaleHex: '0x00',
              unknownHeaderCount: 1,
              cryptographicallyVerified: false,
            };
      expect(request.schema).toMatch(/^e2s\.substrate-rpc-/);
      return containedResult(output);
    });
    try {
      const codec = createPolicyBoundContainedNativeSubstrateRpcProofCodec({
        profile: fixture.profile,
        executionPolicy: fixture.policy,
        runtimeDependencyManifests: fixture.manifests,
        launcherPath: fixture.launcherPath,
        codecExecutablePath: fixture.codecPath,
      });
      expect(codec.executionBoundary).toEqual({
        mode: 'policy-bound-contained-acquisition-only',
        executionPolicyValidatedPerLaunch: true,
        containedProcessRequired: true,
        cryptographicVerificationProvided: false,
        settlementAuthorityGranted: false,
      });

      await codec.encodeHeaders([{
        expectedHashHex: hash('4'),
        header: {
          parentHash: hash('1'),
          number: '0x1',
          stateRoot: hash('2'),
          extrinsicsRoot: hash('5'),
          digest: { logs: [] },
        },
      }]);
      await codec.inspectWarpProof('0x00', '4');
      await codec.inspectFinalityProof('0x00');

      const calls = runNativeContainedProcessMock.mock.calls.map(
        ([input]) => input as NativeContainedProcessInput,
      );
      expect(calls.map(call => call.targetArgs)).toEqual([
        ['--encode-headers'],
        ['--inspect-warp-proof'],
        ['--inspect-finality-proof'],
      ]);
      for (const call of calls) {
        expect(call).toMatchObject({
          launcherPath: fixture.launcherPath,
          launcherSha256Hex: `0x${fixture.policy.bindings.launcher.sha256}`,
          targetPath: fixture.codecPath,
          targetSha256Hex: `0x${fixture.policy.targets.codec.artifactSha256}`,
          timeoutMs: 30_000,
          requestLimitBytes: 32 * 1024 * 1024,
          stdoutLimitBytes: 16 * 1024 * 1024,
          stderrLimitBytes: 64 * 1024,
        });
      }
    } finally {
      fixture.dispose();
    }
  });

  it('routes acquisition through a source-refreshed authority capability', async () => {
    const fixture = createNativeVerifierAttestationExecutionFixture();
    const execute = vi.fn(async (input: { operation: string }) => {
      const output = input.operation === 'encode-headers'
        ? {
            schema: RPC_HEADER_ENCODING_RESULT_SCHEMA,
            headers: [{
              hashHex: hash('4'),
              number: '1',
              parentHashHex: hash('1'),
              stateRootHex: hash('2'),
              headerScaleHex: '0x00',
            }],
          }
        : input.operation === 'inspect-warp-proof'
          ? {
              schema: RPC_WARP_INSPECTION_RESULT_SCHEMA,
              sourceTargetHashHex: hash('4'),
              sourceTargetNumber: '4',
              sourceTargetParentHashHex: hash('3'),
              sourceTargetHeaderScaleHex: '0x01',
              sourceComplete: true,
              sourceFragmentCount: 1,
              stoppedBeforeHorizon: true,
              selectedFragmentCount: 0,
              selectedProofScaleHex: null,
              selectedTargetHashHex: null,
              selectedTargetNumber: null,
              selectedTargetParentHashHex: null,
              selectedTargetHeaderScaleHex: null,
              cryptographicallyVerified: false,
            }
          : {
              schema: RPC_FINALITY_INSPECTION_RESULT_SCHEMA,
              horizonHashHex: hash('3'),
              horizonNumber: '3',
              canonicalJustificationScaleHex: '0x00',
              unknownHeaderCount: 1,
              cryptographicallyVerified: false,
            };
      return {
        stdout: Buffer.from(JSON.stringify(output), 'utf8'),
        operation: input.operation,
      };
    });
    const authority = {
      declaration: {
        profileId: fixture.policy.profileId,
        attestationId: fixture.policy.attestationId,
        policyId: fixture.policy.policyId,
        executionPolicySha256: fixture.profile.executionPolicySha256,
        policyEpoch: fixture.policy.validity.policyEpoch,
        launcherPath: fixture.launcherPath,
        verifierExecutablePath: fixture.verifierPath,
        codecExecutablePath: fixture.codecPath,
        verifierExecutableSha256Hex:
          `0x${fixture.policy.targets.verifier.artifactSha256}`,
        codecExecutableSha256Hex: `0x${fixture.policy.targets.codec.artifactSha256}`,
        codecExecutableInvocationSha256Hex: invocationPins(
          `0x${fixture.policy.targets.codec.artifactSha256}`,
          [],
        ),
      },
      execute,
    } as unknown as NativeVerifierExecutionAuthority;
    try {
      const codec = createAuthorityBoundNativeSubstrateRpcProofCodec(authority);
      expect(codec.executionBoundary).toEqual({
        mode: 'source-refreshed-authority-contained-acquisition-only',
        sourceOwnedAttestorLockReloadedPerLaunch: true,
        executionPolicyValidatedPerLaunch: true,
        installerEpochFloorRequired: true,
        containedProcessRequired: true,
        cryptographicVerificationProvided: false,
        settlementAuthorityGranted: false,
      });

      await codec.encodeHeaders([{
        expectedHashHex: hash('4'),
        header: {
          parentHash: hash('1'),
          number: '0x1',
          stateRoot: hash('2'),
          extrinsicsRoot: hash('5'),
          digest: { logs: [] },
        },
      }]);
      await codec.inspectWarpProof('0x00', '4');
      await codec.inspectFinalityProof('0x00');

      expect(execute.mock.calls.map(([input]) => input.operation)).toEqual([
        'encode-headers',
        'inspect-warp-proof',
        'inspect-finality-proof',
      ]);
      expect(authorityProvenanceMocks.assertAuthority).toHaveBeenCalledWith(authority);
      expect(authorityProvenanceMocks.assertResult).toHaveBeenCalledTimes(3);
      expect(runNativeContainedProcessMock).not.toHaveBeenCalled();
    } finally {
      fixture.dispose();
    }
  });

  it('revalidates policy freshness before each contained codec launch', async () => {
    const fixture = createNativeVerifierAttestationExecutionFixture();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-12T13:00:00.000Z'));
    runNativeContainedProcessMock.mockResolvedValue(containedResult({
      schema: RPC_FINALITY_INSPECTION_RESULT_SCHEMA,
      horizonHashHex: hash('3'),
      horizonNumber: '3',
      canonicalJustificationScaleHex: '0x00',
      unknownHeaderCount: 1,
      cryptographicallyVerified: false,
    }));
    try {
      const codec = createPolicyBoundContainedNativeSubstrateRpcProofCodec({
        profile: fixture.profile,
        executionPolicy: fixture.policy,
        runtimeDependencyManifests: fixture.manifests,
        launcherPath: fixture.launcherPath,
        codecExecutablePath: fixture.codecPath,
      });

      await expect(codec.inspectFinalityProof('0x00')).resolves.toMatchObject({
        cryptographicallyVerified: false,
      });
      vi.setSystemTime(new Date(fixture.policy.validity.expiresAt));
      await expect(codec.inspectFinalityProof('0x00')).rejects.toThrow(/expired/i);
      expect(runNativeContainedProcessMock).toHaveBeenCalledTimes(1);
    } finally {
      fixture.dispose();
    }
  });

  it.each([
    ['generic contained-process result without V2 authority binding', {
      brokerSelfImageBoundToAuthorityRecordV2: false,
    }, /brokerSelfImageBoundToAuthorityRecordV2 is invalid/i],
    ['contained-process result that claims a completed launcher campaign', {
      launcherInstallationActivationCampaignCompleted: true,
    }, /launcherInstallationActivationCampaignCompleted is invalid/i],
  ])('rejects a %s', async (_label, boundaryOverrides, expectedError) => {
    const fixture = createNativeVerifierAttestationExecutionFixture();
    const result = containedResult({
      schema: RPC_FINALITY_INSPECTION_RESULT_SCHEMA,
      horizonHashHex: hash('3'),
      horizonNumber: '3',
      canonicalJustificationScaleHex: '0x00',
      unknownHeaderCount: 1,
      cryptographicallyVerified: false,
    });
    runNativeContainedProcessMock.mockResolvedValue({
      ...result,
      boundary: {
        ...result.boundary,
        ...boundaryOverrides,
      },
    });
    try {
      const codec = createPolicyBoundContainedNativeSubstrateRpcProofCodec({
        profile: fixture.profile,
        executionPolicy: fixture.policy,
        runtimeDependencyManifests: fixture.manifests,
        launcherPath: fixture.launcherPath,
        codecExecutablePath: fixture.codecPath,
      });

      await expect(codec.inspectFinalityProof('0x00')).rejects.toThrow(expectedError);
    } finally {
      fixture.dispose();
    }
  });
});

function containedResult(output: unknown): NativeContainedProcessResult {
  return {
    stdout: Buffer.from(JSON.stringify(output), 'utf8'),
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
