import blakejs from 'blakejs';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, expect, it, vi } from 'vitest';

const authorityProvenanceMocks = vi.hoisted(() => ({
  assertAuthority: vi.fn(),
  assertResult: vi.fn(),
}));

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

import {
  assertNativeVerifiedBridgeCheckpointProvenance,
  assertNativeVerifiedBridgeCheckpointAuthorityExecutionProvenance,
  assertNativeVerifiedBridgeCheckpointExecutableProvenance,
  assertNativeCheckpointAggregateFinalityProofProvenance,
  buildNativeCheckpointAggregateFinalityProofV1,
  buildNativeVerifiedBridgeCheckpoint,
  createAuthorityBoundNativeFinalizedBridgeCheckpointVerifier,
  MAX_NATIVE_VERIFIER_STDERR_BYTES,
  MAX_NATIVE_VERIFIER_STDOUT_BYTES,
  verifyNativeFinalizedBridgeCheckpoint,
  type NativeFinalizedBridgeCheckpointRequest,
  type NativeFinalizedBridgeCheckpointVerification,
  type NativeFinalizedBridgeCheckpointVerificationPayload,
} from './native-finalized-bridge-checkpoint.js';
import { decodeAggregateFinalityProofV1 } from './bridge-finality-proof.js';
import type { NativeVerifierExecutionAuthority } from './native-verifier-execution-authority.js';
import { deriveGrandpaJustificationHashHex } from './bridge-checkpoint-commitment.js';
import { deriveExecutableInvocationSha256Hex } from './native-executable-pin.js';

const hash = (byte: string) => `0x${byte.repeat(64)}`;
const executableSha256Hex =
  `0x${createHash('sha256').update(readFileSync(process.execPath)).digest('hex')}`;

const authoritySetDomain = Buffer.from('E2S_GRANDPA_AUTHORITY_SET_V1', 'utf8');
const trustAnchorDomain = Buffer.from('E2S_GRANDPA_TRUST_ANCHOR_V1', 'utf8');
const bridgeCommitmentStorageKeyHex =
  '0xaf86fef4216ac2bcd1c592b204011ad00d2d4fb825af1fcd4c2be9f955a780c5';

function hexBytes(value: string): Buffer {
  return Buffer.from(value.slice(2), 'hex');
}

function digestHex(bytes: Buffer): string {
  return `0x${Buffer.from(blakejs.blake2b(bytes, undefined, 32)).toString('hex')}`;
}

function authoritySetHash(authorityListScaleHex: string): string {
  return digestHex(Buffer.concat([
    authoritySetDomain,
    hexBytes(authorityListScaleHex),
  ]));
}

function trustAnchorDigest(value: NativeFinalizedBridgeCheckpointRequest): string {
  const checkpointNumber = Buffer.alloc(8);
  checkpointNumber.writeBigUInt64BE(BigInt(value.trustAnchor.checkpointNumber));
  const setId = Buffer.alloc(8);
  setId.writeBigUInt64BE(BigInt(value.trustAnchor.grandpaSetId));
  return digestHex(Buffer.concat([
    trustAnchorDomain,
    hexBytes(value.trustAnchor.sidechainIdHex),
    hexBytes(value.trustAnchor.checkpointHashHex),
    checkpointNumber,
    setId,
    hexBytes(authoritySetHash(value.trustAnchor.authorityListScaleHex)),
  ]));
}

function commitmentScaleHex(value: {
  sidechainIdHex: string;
  sidechainHeight: string;
  executionBlockHashHex: string;
  bridgeEventRootHex: string;
  burnLeafCount: number;
}): string {
  const height = Buffer.alloc(8);
  height.writeBigUInt64LE(BigInt(value.sidechainHeight));
  const count = Buffer.alloc(4);
  count.writeUInt32LE(value.burnLeafCount);
  return `0x${Buffer.concat([
    Buffer.from([1]),
    hexBytes(value.sidechainIdHex),
    height,
    hexBytes(value.executionBlockHashHex),
    hexBytes(value.bridgeEventRootHex),
    count,
  ]).toString('hex')}`;
}

const request: NativeFinalizedBridgeCheckpointRequest = {
  schema: 'e2s.native-finalized-bridge-checkpoint-request.v2',
  trustAnchor: {
    sidechainIdHex: hash('1'),
    checkpointHashHex: hash('2'),
    checkpointNumber: '10',
    grandpaSetId: '7',
    authorityListScaleHex: '0x0401',
  },
  targetNativeBlockHashHex: hash('4'),
  targetHeaderScaleHex: '0x0102',
  linkedGrandpaProofs: [{
    ancestryHeadersScaleHex: ['0x0304'],
    proofScaleHex: '0x0506',
  }],
  checkpointTailHeadersScaleHex: ['0x0708'],
  finalityProofScaleHex: '0x0607',
  runtimeStateProofNodesHex: ['0x0a0b'],
};
const trustedAnchorDigestHex = trustAnchorDigest(request);

function requestDigestHex(value: NativeFinalizedBridgeCheckpointRequest): string {
  const bytes = Buffer.from(JSON.stringify(value), 'utf8');
  return `0x${Buffer.from(blakejs.blake2b(bytes, undefined, 32)).toString('hex')}`;
}

function validVerification(): NativeFinalizedBridgeCheckpointVerificationPayload {
  const finalitySigningAuthorityListScaleHex = '0x0801';
  const commitment = {
    sidechainIdHex: request.trustAnchor.sidechainIdHex,
    sidechainHeight: '42',
    executionBlockHashHex: hash('7'),
    bridgeEventRootHex: hash('8'),
    burnLeafCount: 1,
  };
  return {
    schema: 'e2s.native-finalized-bridge-checkpoint-verification.v2',
    status: 'NATIVE_CHECKPOINT_VERIFIED_RELATIVE_TO_REVIEWED_TRUST_ROOT',
    requestDigestHex: requestDigestHex(request),
    trustAnchorDigestHex: trustedAnchorDigestHex,
    target: {
      nativeBlockHashHex: request.targetNativeBlockHashHex,
      nativeHeight: '42',
      stateRootHex: hash('5'),
    },
    authority: {
      finalitySigningSetId: '8',
      finalitySigningAuthorityListScaleHex,
      finalitySigningAuthoritySetHashHex: authoritySetHash(
        finalitySigningAuthorityListScaleHex,
      ),
      transitionCount: 1,
      linkedAncestryVerified: true,
    },
    finality: {
      horizonHashHex: hash('9'),
      horizonHeight: '43',
      canonicalJustificationScaleHex: '0x0809',
      verified: true,
    },
    runtimeState: {
      storageKeyHex: bridgeCommitmentStorageKeyHex,
      storageValueScaleHex: commitmentScaleHex(commitment),
      proofNodeCount: request.runtimeStateProofNodesHex.length,
      proofBytes: 2,
      verified: true,
    },
    commitment,
    boundary: {
      sidechainFinalityVerified: true,
      ergoExtensionAnchorVerified: false,
      onChainAcceptanceVerified: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
    },
  };
}

function outputScript(value: unknown): string {
  const encoded = Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
  return `
const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
  JSON.parse(Buffer.concat(chunks).toString('utf8'));
  process.stdout.write(Buffer.from('${encoded}', 'base64'));
});`;
}

function invoke(script: string, timeoutMs = 2_000) {
  const executableArgs = ['-e', script, '--'];
  return verifyNativeFinalizedBridgeCheckpoint({
    executablePath: process.execPath,
    expectedExecutableSha256Hex: executableSha256Hex,
    expectedExecutableInvocationSha256Hex: deriveExecutableInvocationSha256Hex(
      executableSha256Hex,
      [...executableArgs, '--trusted-anchor-digest', trustedAnchorDigestHex],
    ),
    executableArgs,
    timeoutMs,
    trustedAnchorDigestHex,
    request,
  });
}

describe('verifyNativeFinalizedBridgeCheckpoint', () => {
  it('accepts one exact digest-bound native verification result', async () => {
    await expect(invoke(outputScript(validVerification()))).resolves.toEqual(
      validVerification(),
    );
  });

  it('binds contained verifier results to the exact source-refreshed authority capability', async () => {
    const execute = vi.fn(async () => ({
      stdout: Buffer.from(JSON.stringify(validVerification()), 'utf8'),
      operation: 'verify-checkpoint' as const,
    }));
    const authority = {
      declaration: {
        profileId: 'institutional-win32-x64-v1',
        attestationId: 'build-2026-07-12-review-01',
        policyId: 'native-verifier-execution-2026-07-12-01',
        executionPolicySha256: '11'.repeat(32),
        policyEpoch: 1,
        launcherPath: process.execPath,
        verifierExecutablePath: process.execPath,
        codecExecutablePath: fileURLToPath(import.meta.url),
        verifierExecutableSha256Hex: executableSha256Hex,
        codecExecutableSha256Hex: hash('c'),
        codecExecutableInvocationSha256Hex: {
          encodeHeaders: hash('d'),
          inspectWarpProof: hash('e'),
          inspectFinalityProof: hash('f'),
        },
      },
      execute,
    } as unknown as NativeVerifierExecutionAuthority;
    const verifier = createAuthorityBoundNativeFinalizedBridgeCheckpointVerifier(authority);

    expect(verifier.executionBoundary).toEqual({
      mode: 'source-refreshed-authority-contained-candidate-only',
      sourceOwnedAttestorLockReloadedPerLaunch: true,
      executionPolicyValidatedPerLaunch: true,
      installerEpochFloorRequired: true,
      containedProcessRequired: true,
      settlementAuthorityGranted: false,
      gate5Closed: false,
    });
    expect(verifier.deriveExecutableInvocationSha256Hex(trustedAnchorDigestHex)).toBe(
      deriveExecutableInvocationSha256Hex(executableSha256Hex, [
        '--trusted-anchor-digest',
        trustedAnchorDigestHex,
      ]),
    );
    const verification = await verifier.verify({ trustedAnchorDigestHex, request });
    const checkpoint = buildNativeVerifiedBridgeCheckpoint(verification);
    expect(execute).toHaveBeenCalledWith({
      operation: 'verify-checkpoint',
      trustedAnchorDigestHex,
      requestBytes: Buffer.from(JSON.stringify(request), 'utf8'),
    });
    assertNativeVerifiedBridgeCheckpointAuthorityExecutionProvenance(
      checkpoint,
      authority,
    );
    const directCheckpoint = buildNativeVerifiedBridgeCheckpoint(
      await invoke(outputScript(validVerification())),
    );
    expect(() => assertNativeVerifiedBridgeCheckpointAuthorityExecutionProvenance(
      directCheckpoint,
      authority,
    )).toThrow(/lacks source-refreshed authority/i);
  });

  it('accepts a descendant finality horizon and extracted canonical justification', async () => {
    const result = validVerification();
    expect(result.finality.horizonHashHex).not.toBe(result.target.nativeBlockHashHex);
    expect(result.finality.horizonHeight).not.toBe(result.target.nativeHeight);
    expect(result.finality.canonicalJustificationScaleHex).not.toBe(
      request.finalityProofScaleHex,
    );

    await expect(invoke(outputScript(result))).resolves.toEqual(result);
  });

  it('rejects an internally inconsistent final authority-set hash', async () => {
    const result = validVerification();
    result.authority.finalitySigningAuthoritySetHashHex = hash('6');

    await expect(invoke(outputScript(result))).rejects.toThrow(/authority-set hash/i);
  });

  it('rejects a verifier result that does not echo the exact request digest', async () => {
    const result = validVerification();
    result.requestDigestHex = hash('9');

    await expect(invoke(outputScript(result))).rejects.toThrow(/request digest/i);
  });

  it('rejects a self-consistent request anchor that does not match the independent trust root', async () => {
    const changedRequest = structuredClone(request);
    changedRequest.trustAnchor.checkpointHashHex = hash('a');
    const selfConsistentDigest = trustAnchorDigest(changedRequest);
    expect(selfConsistentDigest).not.toBe(trustedAnchorDigestHex);

    const executableArgs = ['-e', outputScript(validVerification()), '--'];
    await expect(verifyNativeFinalizedBridgeCheckpoint({
      executablePath: process.execPath,
      expectedExecutableSha256Hex: executableSha256Hex,
      expectedExecutableInvocationSha256Hex: deriveExecutableInvocationSha256Hex(
        executableSha256Hex,
        [...executableArgs, '--trusted-anchor-digest', trustedAnchorDigestHex],
      ),
      executableArgs,
      timeoutMs: 2_000,
      trustedAnchorDigestHex,
      request: changedRequest,
    })).rejects.toThrow(/independently supplied digest/i);
  });

  it('rejects a verifier executable that differs from the reviewed pin', async () => {
    const executableArgs = ['-e', outputScript(validVerification()), '--'];
    await expect(verifyNativeFinalizedBridgeCheckpoint({
      executablePath: process.execPath,
      expectedExecutableSha256Hex: hash('f'),
      expectedExecutableInvocationSha256Hex: deriveExecutableInvocationSha256Hex(
        hash('f'),
        [...executableArgs, '--trusted-anchor-digest', trustedAnchorDigestHex],
      ),
      executableArgs,
      timeoutMs: 2_000,
      trustedAnchorDigestHex,
      request,
    })).rejects.toThrow(/reviewed pin/i);
  });

  it('rejects executable arguments that differ from the reviewed invocation pin', async () => {
    const script = outputScript(validVerification());
    await expect(verifyNativeFinalizedBridgeCheckpoint({
      executablePath: process.execPath,
      expectedExecutableSha256Hex: executableSha256Hex,
      expectedExecutableInvocationSha256Hex: deriveExecutableInvocationSha256Hex(
        executableSha256Hex,
        ['--trusted-anchor-digest', trustedAnchorDigestHex],
      ),
      executableArgs: ['-e', script, '--'],
      timeoutMs: 2_000,
      trustedAnchorDigestHex,
      request,
    })).rejects.toThrow(/argv pin/i);
  });

  it('rejects unknown output fields', async () => {
    await expect(invoke(outputScript({
      ...validVerification(),
      trustedRemoteBoolean: true,
    }))).rejects.toThrow(/unknown field/i);
  });

  it('rejects a nonzero verifier exit without trusting its stderr', async () => {
    const script = `
process.stdin.resume();
process.stdin.on('end', () => {
  process.stderr.write('remote detail must not become authority');
  process.exit(17);
});`;

    await expect(invoke(script)).rejects.toThrow(/exited with code 17/i);
  });

  it('kills and rejects a verifier that exceeds the timeout', async () => {
    const script = `
process.stdin.resume();
process.stdin.on('end', () => setTimeout(() => {}, 10_000));`;

    await expect(invoke(script, 100)).rejects.toThrow(/timed out/i);
  });

  it('kills and rejects oversized stdout before parsing it', async () => {
    const script = `
process.stdin.resume();
process.stdin.on('end', () => {
  process.stdout.write('x'.repeat(${MAX_NATIVE_VERIFIER_STDOUT_BYTES + 1}));
});`;

    await expect(invoke(script)).rejects.toThrow(/stdout exceeds/i);
  });

  it('kills and rejects oversized stderr without reflecting its contents', async () => {
    const script = `
process.stdin.resume();
process.stdin.on('end', () => {
  process.stderr.write('s'.repeat(${MAX_NATIVE_VERIFIER_STDERR_BYTES + 1}));
});`;

    await expect(invoke(script)).rejects.toThrow(/stderr exceeds/i);
  });

  it('rejects trailing non-JSON stdout', async () => {
    const encoded = Buffer.from(JSON.stringify(validVerification()), 'utf8').toString('base64');
    const script = `
process.stdin.resume();
process.stdin.on('end', () => {
  process.stdout.write(Buffer.from('${encoded}', 'base64'));
  process.stdout.write('trailing');
});`;

    await expect(invoke(script)).rejects.toThrow(/exactly one JSON result/i);
  });

  it('rejects a malformed fail-closed boundary', async () => {
    const result = validVerification();
    result.boundary.sidechainFinalityVerified = false as true;

    await expect(invoke(outputScript(result))).rejects.toThrow(
      /boundary\.sidechainFinalityVerified/i,
    );
  });

  it('builds 0x0401 from the native result and commits the extracted justification', async () => {
    const verification = await invoke(outputScript(validVerification()));
    const built = buildNativeVerifiedBridgeCheckpoint(verification);

    expect(built.status).toBe('NATIVE_VERIFIED');
    expect(built.checkpointCommitment.checkpoint.sidechainConsensusBlockHashHex)
      .toBe(request.targetNativeBlockHashHex.slice(2));
    expect(built.checkpointCommitment.checkpoint.finalityAuthoritySetHashHex)
      .toBe(verification.authority.finalitySigningAuthoritySetHashHex.slice(2));
    expect(built.checkpointCommitment.checkpoint.finalityProofHashHex).toBe(
      deriveGrandpaJustificationHashHex(
        hexBytes(verification.finality.canonicalJustificationScaleHex),
      ),
    );
    expect(built.checkpointCommitment.checkpoint.finalityProofHashHex).not.toBe(
      deriveGrandpaJustificationHashHex(hexBytes(request.finalityProofScaleHex)),
    );
    expect(built.finalityStatement).toMatchObject({
      encodedCheckpointHex: built.checkpointCommitment.encodedCheckpointHex,
      checkpointCommitmentHex: built.checkpointCommitment.checkpointCommitmentHex,
      trustedAnchorDigestHex: verification.trustAnchorDigestHex.slice(2),
      finalityHorizonHeight: verification.finality.horizonHeight,
      finalityHorizonHashHex: verification.finality.horizonHashHex.slice(2),
    });
    expect(built.checks.canonicalFinalityStatementBound).toBe(true);
    const aggregateProof = buildNativeCheckpointAggregateFinalityProofV1({
      checkpoint: built,
      request,
    });
    expect(aggregateProof.verifierProfileIdHex).toBe(executableSha256Hex.slice(2));
    expect(aggregateProof.statementDigestHex).toBe(
      built.finalityStatement.statementDigestHex,
    );
    expect(decodeAggregateFinalityProofV1(aggregateProof.encodedProofHex))
      .toEqual(aggregateProof);
    expect(() => assertNativeCheckpointAggregateFinalityProofProvenance(
      aggregateProof,
      built,
    )).not.toThrow();
    expect(() => assertNativeCheckpointAggregateFinalityProofProvenance(
      structuredClone(aggregateProof),
      built,
    )).toThrow(/aggregate finality proof provenance/i);
    expect(built.boundary).toEqual({
      checkpointCandidateOnly: true,
      sidechainFinalityVerified: true,
      ergoExtensionAnchorVerified: false,
      onChainAcceptanceVerified: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
    });
    expect(Object.isFrozen(verification)).toBe(true);
    expect(Object.isFrozen(verification.commitment)).toBe(true);
    expect(Object.isFrozen(built)).toBe(true);
    expect(Object.isFrozen(built.checkpointCommitment)).toBe(true);
    expect(Object.isFrozen(built.finalityStatement)).toBe(true);
  });

  it('refuses to envelope a request other than the exact natively verified request', async () => {
    const verification = await invoke(outputScript(validVerification()));
    const built = buildNativeVerifiedBridgeCheckpoint(verification);
    const driftedRequest = structuredClone(request);
    driftedRequest.targetNativeBlockHashHex = hash('e');

    expect(() => buildNativeCheckpointAggregateFinalityProofV1({
      checkpoint: built,
      request: driftedRequest,
    })).toThrow(/request does not match the verified checkpoint/i);
  });

  it('refuses a structurally valid object that did not come from the verifier adapter', () => {
    expect(() => buildNativeVerifiedBridgeCheckpoint(
      validVerification() as unknown as NativeFinalizedBridgeCheckpointVerification,
    )).toThrow(/verifier provenance/i);
  });

  it('refuses a structurally identical checkpoint that was reconstructed outside the builder', async () => {
    const verification = await invoke(outputScript(validVerification()));
    const built = buildNativeVerifiedBridgeCheckpoint(verification);
    expect(() => assertNativeVerifiedBridgeCheckpointProvenance(
      structuredClone(built),
    )).toThrow(/checkpoint provenance/i);
    expect(() => assertNativeVerifiedBridgeCheckpointProvenance(built)).not.toThrow();
  });

  it('binds a checkpoint to the exact verifier path and digest used by the adapter', async () => {
    const verification = await invoke(outputScript(validVerification()));
    const built = buildNativeVerifiedBridgeCheckpoint(verification);
    expect(() => assertNativeVerifiedBridgeCheckpointExecutableProvenance(built, {
      executablePath: process.execPath,
      executableSha256Hex,
    })).not.toThrow();
    expect(() => assertNativeVerifiedBridgeCheckpointExecutableProvenance(built, {
      executablePath: process.execPath,
      executableSha256Hex: hash('f'),
    })).toThrow(/digest does not match/i);
    expect(() => assertNativeVerifiedBridgeCheckpointExecutableProvenance(built, {
      executablePath: fileURLToPath(import.meta.url),
      executableSha256Hex,
    })).toThrow(/different executable/i);
  });

  it('prevents a branded verifier result from being mutated before checkpoint construction', async () => {
    const verification = await invoke(outputScript(validVerification()));
    expect(() => {
      verification.boundary.ergoExtensionAnchorVerified = true as false;
    }).toThrow();
    expect(() => {
      verification.commitment.bridgeEventRootHex = hash('f');
    }).toThrow();
    expect(buildNativeVerifiedBridgeCheckpoint(verification).boundary)
      .toMatchObject({ ergoExtensionAnchorVerified: false, gate5Closed: false });
  });
});
