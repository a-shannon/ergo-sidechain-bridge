import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

const authorityProvenanceMocks = vi.hoisted(() => ({
  assertAuthority: vi.fn(),
  assertResult: vi.fn(),
}));

vi.mock('./native-peg-in-verifier-execution-authority.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./native-peg-in-verifier-execution-authority.js')
  >();
  return {
    ...actual,
    assertNativePegInVerifierExecutionAuthorityProvenance:
      authorityProvenanceMocks.assertAuthority,
    assertNativePegInVerifierExecutionAuthorityResultProvenance:
      authorityProvenanceMocks.assertResult,
  };
});

import { NATIVE_FINALIZED_BRIDGE_CHECKPOINT_REQUEST_SCHEMA } from './native-finalized-bridge-checkpoint.js';
import {
  assertAuthorityBoundNativeFinalizedPegInStateVerificationProvenance,
  assertAuthorityBoundNativeFinalizedPegInStateVerificationFromVerifierProvenance,
  assertAuthorityBoundNativeFinalizedPegInStateVerifierProvenance,
  createAuthorityBoundNativeFinalizedPegInStateVerifier,
  NATIVE_FINALIZED_PEG_IN_STATE_REQUEST_SCHEMA,
  NATIVE_FINALIZED_PEG_IN_STATE_VERIFICATION_SCHEMA,
  PEG_IN_RUNTIME_STATE_STATEMENT_SCHEMA,
  normalizeNativeFinalizedPegInStateRequest,
  validateNativeFinalizedPegInStatePayloadBindings,
} from './native-finalized-peg-in-state.js';
import { deriveExecutableInvocationSha256Hex } from './native-executable-pin.js';
import type { NativePegInVerifierExecutionAuthority } from './native-peg-in-verifier-execution-authority.js';

const vector = JSON.parse(readFileSync(
  new URL('../test-vectors/native-finalized-peg-in-state-v1.json', import.meta.url),
  'utf8',
)) as {
  schema: string;
  trustedAnchorDigestHex: string;
  membership: { request: unknown; expected: unknown };
  nonMembership: { request: unknown; expected: unknown };
};

describe('native finalized Peg-In Runtime State V1', () => {
  it('binds the real Rust membership and non-membership vectors without mint authority', () => {
    expect(vector.schema).toBe('e2s.native-finalized-peg-in-state.vector.v1');
    expect(NATIVE_FINALIZED_PEG_IN_STATE_REQUEST_SCHEMA).not.toBe(
      NATIVE_FINALIZED_BRIDGE_CHECKPOINT_REQUEST_SCHEMA,
    );
    for (const entry of [vector.membership, vector.nonMembership]) {
      const request = normalizeNativeFinalizedPegInStateRequest(entry.request);
      const result = validateFixture(request, entry.expected);
      expect(request.schema).toBe(NATIVE_FINALIZED_PEG_IN_STATE_REQUEST_SCHEMA);
      expect(request.statement.schema).toBe(PEG_IN_RUNTIME_STATE_STATEMENT_SCHEMA);
      expect(result.schema).toBe(NATIVE_FINALIZED_PEG_IN_STATE_VERIFICATION_SCHEMA);
      expect(result.trustAnchorDigestHex).toBe(vector.trustedAnchorDigestHex);
      expect(result.boundary).toEqual({
        sidechainFinalityVerified: true,
        statementRuntimeStateVerified: true,
        historicalMintAbsenceVerified: false,
        runtimeCodeIdentityVerified: false,
        committedVaultTransitionVerified: false,
        mintAuthorized: false,
        transactionMutationEnabled: false,
        gate5Closed: false,
      });
    }
  });

  it('binds the exact peg-in CLI result to one source-refreshed authority capability', async () => {
    const request = normalizeNativeFinalizedPegInStateRequest(vector.membership.request);
    const execute = vi.fn(async () => ({
      stdout: Buffer.from(JSON.stringify(vector.membership.expected), 'utf8'),
      operation: 'verify-peg-in-state' as const,
    }));
    const executableSha256Hex = `0x${'ab'.repeat(32)}`;
    const authority = {
      declaration: {
        operation: 'verify-peg-in-state',
        profileId: 'institutional-win32-x64-v1',
        attestationId: 'build-2026-07-12-review-01',
        policyId: 'native-peg-in-verifier-execution-2026-07-12-01',
        executionPolicySha256: '11'.repeat(32),
        policyEpoch: 1,
        verifierExecutableSha256Hex: executableSha256Hex,
      },
      execute,
    } as unknown as NativePegInVerifierExecutionAuthority;
    const verifier = createAuthorityBoundNativeFinalizedPegInStateVerifier(authority);
    expect(() => assertAuthorityBoundNativeFinalizedPegInStateVerifierProvenance(verifier))
      .not.toThrow();

    expect(verifier.executionBoundary).toEqual({
      mode: 'source-refreshed-authority-contained-proof-only',
      sourceOwnedAttestorLockReloadedPerLaunch: true,
      executionPolicyValidatedPerLaunch: true,
      containedProcessRequired: true,
      runtimeCodeIdentityVerified: false,
      mintAuthorityGranted: false,
      settlementAuthorityGranted: false,
      gate5Closed: false,
    });
    expect(verifier.deriveExecutableInvocationSha256Hex(vector.trustedAnchorDigestHex)).toBe(
      deriveExecutableInvocationSha256Hex(executableSha256Hex, [
        '--verify-peg-in-state',
        '--trusted-anchor-digest',
        vector.trustedAnchorDigestHex,
      ]),
    );

    const verification = await verifier.verify({
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      request,
    });
    expect(execute).toHaveBeenCalledWith({
      operation: 'verify-peg-in-state',
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      requestBytes: Buffer.from(JSON.stringify(request), 'utf8'),
    });
    expect(verification.boundary.mintAuthorized).toBe(false);
    expect(() => assertAuthorityBoundNativeFinalizedPegInStateVerificationProvenance({
      authority,
      verification,
      expectedRequestDigestHex: verification.requestDigestHex,
    })).not.toThrow();
    expect(() =>
      assertAuthorityBoundNativeFinalizedPegInStateVerificationFromVerifierProvenance({
        verifier,
        verification,
        expectedRequestDigestHex: verification.requestDigestHex,
      })).not.toThrow();
    expect(() => assertAuthorityBoundNativeFinalizedPegInStateVerificationProvenance({
      authority,
      verification: structuredClone(verification),
      expectedRequestDigestHex: verification.requestDigestHex,
    })).toThrow(/provenance/i);
    expect(() => assertAuthorityBoundNativeFinalizedPegInStateVerifierProvenance({
      verify: vi.fn(),
    })).toThrow(/provenance/i);
  });

  it('rejects an authority result for any operation other than verify-peg-in-state', async () => {
    const authority = {
      declaration: {
        operation: 'verify-peg-in-state',
        executionPolicySha256: '11'.repeat(32),
        verifierExecutableSha256Hex: `0x${'ab'.repeat(32)}`,
      },
      execute: vi.fn(async () => ({
        stdout: Buffer.from(JSON.stringify(vector.membership.expected), 'utf8'),
        operation: 'verify-checkpoint',
      })),
    } as unknown as NativePegInVerifierExecutionAuthority;
    const verifier = createAuthorityBoundNativeFinalizedPegInStateVerifier(authority);
    await expect(verifier.verify({
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      request: normalizeNativeFinalizedPegInStateRequest(vector.membership.request),
    })).rejects.toThrow(/operation/i);
  });

  it('keeps historical membership independent of the current profile and non-membership current-only', () => {
    const member = validateFixture(vector.membership.request, vector.membership.expected);
    expect(member.runtimeState.outcome).toBe('MEMBERSHIP');
    expect(member.record).not.toBeNull();
    expect(member.runtimeState.profileStorageKeyHex).toBeNull();
    expect(member.runtimeState.profileStorageValueScaleHex).toBeNull();
    expect(member.profile).toBeNull();

    const absent = validateFixture(vector.nonMembership.request, vector.nonMembership.expected);
    expect(absent.runtimeState.outcome).toBe('NON_MEMBERSHIP');
    expect(absent.runtimeState.profileStorageKeyHex).not.toBeNull();
    expect(absent.profile).not.toBeNull();
    expect(absent.runtimeState.recordStorageValueScaleHex).toBeNull();
    expect(absent.record).toBeNull();
    expect(absent.boundary.historicalMintAbsenceVerified).toBe(false);
  });

  it('rejects burn-schema reuse, mixed checkpoints, arbitrary keys, and statement drift', () => {
    const burnSchema = clone(vector.membership.request) as Record<string, unknown>;
    burnSchema.schema = NATIVE_FINALIZED_BRIDGE_CHECKPOINT_REQUEST_SCHEMA;
    expect(() => normalizeNativeFinalizedPegInStateRequest(burnSchema)).toThrow(/schema/i);

    const mixedProof = clone(vector.membership.request) as Record<string, unknown>;
    mixedProof.runtimeStateProofNodesHex = (
      clone(vector.nonMembership.request) as Record<string, unknown>
    ).runtimeStateProofNodesHex;
    expect(() => validateFixture(mixedProof, vector.membership.expected)).toThrow(
      /request digest|proof/i,
    );

    const wrongBox = clone(vector.membership.request) as {
      statement: { ergoBoxIdHex: string };
    };
    wrongBox.statement.ergoBoxIdHex = `0x${'99'.repeat(32)}`;
    expect(() => normalizeNativeFinalizedPegInStateRequest(wrongBox)).toThrow(/Ergo box ID/i);

    const wrongStorageKey = clone(vector.membership.expected) as {
      runtimeState: { recordStorageKeyHex: string };
    };
    wrongStorageKey.runtimeState.recordStorageKeyHex = `0x${'aa'.repeat(80)}`;
    expect(() => validateFixture(vector.membership.request, wrongStorageKey)).toThrow(
      /derived identity/i,
    );

    const alteredRecord = clone(vector.membership.request) as {
      statement: { record: { expectedRecordScaleHex: string } };
    };
    alteredRecord.statement.record.expectedRecordScaleHex =
      `${alteredRecord.statement.record.expectedRecordScaleHex.slice(0, -2)}08`;
    expect(() => validateFixture(alteredRecord, vector.membership.expected)).toThrow(
      /request digest|record/i,
    );

    const coupledMembership = clone(vector.membership.request) as {
      statement: Record<string, unknown>;
    };
    coupledMembership.statement.expectedProfileScaleHex = (
      clone(vector.nonMembership.request) as {
        statement: { expectedProfileScaleHex: string };
      }
    ).statement.expectedProfileScaleHex;
    expect(() => normalizeNativeFinalizedPegInStateRequest(coupledMembership)).toThrow(
      /membership statement|unexpected field/i,
    );

    const unscopedNonMembership = clone(vector.nonMembership.request) as {
      statement: Record<string, unknown>;
    };
    delete unscopedNonMembership.statement.expectedProfileScaleHex;
    expect(() => normalizeNativeFinalizedPegInStateRequest(unscopedNonMembership)).toThrow(
      /non-membership statement|unexpected field/i,
    );
  });

  it('binds exact verifier stdin bytes and an independently supplied trust anchor', () => {
    const exactBytes = canonicalRequestBytes(vector.membership.request);
    expect(() => validateNativeFinalizedPegInStatePayloadBindings({
      requestBytes: exactBytes,
      trustedAnchorDigestHex: `0x${'99'.repeat(32)}`,
      verification: vector.membership.expected,
    })).toThrow(/independently supplied trust anchor/i);

    const whitespaceChangedBytes = Buffer.concat([exactBytes, Buffer.from('\n', 'utf8')]);
    expect(() => validateNativeFinalizedPegInStatePayloadBindings({
      requestBytes: whitespaceChangedBytes,
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      verification: vector.membership.expected,
    })).toThrow(/request digest/i);

    const alteredDigest = clone(vector.membership.expected) as { requestDigestHex: string };
    alteredDigest.requestDigestHex = `0x${'aa'.repeat(32)}`;
    expect(() => validateFixture(vector.membership.request, alteredDigest)).toThrow(
      /request digest/i,
    );
  });

  it('rejects non-membership payload values and any claim-boundary escalation', () => {
    const injectedRecord = clone(vector.nonMembership.expected) as {
      runtimeState: { recordStorageValueScaleHex: string | null };
    };
    injectedRecord.runtimeState.recordStorageValueScaleHex = (
      clone(vector.membership.expected) as {
        runtimeState: { recordStorageValueScaleHex: string };
      }
    ).runtimeState.recordStorageValueScaleHex;
    expect(() => validateFixture(vector.nonMembership.request, injectedRecord)).toThrow(
      /must not contain a record/i,
    );

    for (const field of [
      'historicalMintAbsenceVerified',
      'runtimeCodeIdentityVerified',
      'committedVaultTransitionVerified',
      'mintAuthorized',
      'transactionMutationEnabled',
      'gate5Closed',
    ] as const) {
      const escalated = clone(vector.nonMembership.expected) as {
        boundary: Record<string, boolean>;
      };
      escalated.boundary[field] = true;
      expect(() => validateFixture(vector.nonMembership.request, escalated)).toThrow(
        /boundary|remain false/i,
      );
    }
  });
});

function clone<T>(value: T): T {
  return structuredClone(value);
}

function canonicalRequestBytes(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(normalizeNativeFinalizedPegInStateRequest(value)), 'utf8');
}

function validateFixture(
  request: unknown,
  verification: unknown,
): ReturnType<typeof validateNativeFinalizedPegInStatePayloadBindings> {
  return validateNativeFinalizedPegInStatePayloadBindings({
    requestBytes: canonicalRequestBytes(request),
    trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
    verification,
  });
}
