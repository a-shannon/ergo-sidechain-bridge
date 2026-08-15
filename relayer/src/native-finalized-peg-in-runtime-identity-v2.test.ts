import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { NATIVE_FINALIZED_PEG_IN_STATE_REQUEST_SCHEMA } from './native-finalized-peg-in-state.js';
import {
  MAX_PEG_IN_RUNTIME_IDENTITY_V2_PROOF_BYTES,
  MAX_PEG_IN_RUNTIME_IDENTITY_V2_PROOF_NODE_BYTES,
  MAX_PEG_IN_RUNTIME_IDENTITY_V2_PROOF_NODES,
  NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_REQUEST_SCHEMA,
  NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_STATUS,
  NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_VERIFICATION_SCHEMA,
  deriveNativeFinalizedPegInRuntimeIdentityV2RequestDigestHex,
  deriveNativeFinalizedPegInRuntimeIdentityV2TargetHeaderIdentity,
  normalizeNativeFinalizedPegInRuntimeIdentityV2Request,
  validateNativeFinalizedPegInRuntimeIdentityV2PayloadBindings,
} from './native-finalized-peg-in-runtime-identity-v2.js';

const vector = JSON.parse(readFileSync(
  new URL(
    '../test-vectors/native-finalized-peg-in-runtime-identity-v2.json',
    import.meta.url,
  ),
  'utf8',
)) as {
  schema: string;
  trustedAnchorDigestHex: string;
  membership: { request: unknown; expected: unknown };
  nonMembership: { request: unknown; expected: unknown };
};

describe('native finalized peg-in runtime identity V2 payload bindings', () => {
  it('binds both Rust vector branches without attestation or mint authority', () => {
    expect(vector.schema).toBe('e2s.native-finalized-peg-in-runtime-identity.vector.v2');
    for (const entry of [vector.membership, vector.nonMembership]) {
      const request = normalizeNativeFinalizedPegInRuntimeIdentityV2Request(entry.request);
      const result = validateFixture(entry.request, entry.expected);
      expect(request.schema).toBe(
        NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_REQUEST_SCHEMA,
      );
      expect(result.schema).toBe(
        NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_VERIFICATION_SCHEMA,
      );
      expect(result.status).toBe(NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_STATUS);
      expect(result.boundary).toEqual({
        sidechainFinalityVerified: true,
        statementRuntimeStateVerified: true,
        runtimeCodeStateProofVerified: true,
        runtimeBuildAttestationVerified: false,
        historicalMintAbsenceVerified: false,
        runtimeCodeIdentityVerified: false,
        committedVaultTransitionVerified: false,
        mintAuthorized: false,
        transactionMutationEnabled: false,
        gate5Closed: false,
      });
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.runtimeState)).toBe(true);
      expect(Object.isFrozen(result.boundary)).toBe(true);
    }
  });

  it('preserves historical membership and current-profile non-membership semantics', () => {
    const membership = validateFixture(
      vector.membership.request,
      vector.membership.expected,
    );
    expect(membership.runtimeState.outcome).toBe('MEMBERSHIP');
    expect(membership.profile).toBeNull();
    expect(membership.record).not.toBeNull();

    const nonMembership = validateFixture(
      vector.nonMembership.request,
      vector.nonMembership.expected,
    );
    expect(nonMembership.runtimeState.outcome).toBe('NON_MEMBERSHIP');
    expect(nonMembership.profile).not.toBeNull();
    expect(nonMembership.record).toBeNull();
  });

  it('derives the exact parent hash from the canonical target SCALE header', () => {
    const request = normalizeNativeFinalizedPegInRuntimeIdentityV2Request(
      vector.membership.request,
    );
    const result = validateFixture(
      vector.membership.request,
      vector.membership.expected,
    );
    const identity =
      deriveNativeFinalizedPegInRuntimeIdentityV2TargetHeaderIdentity(
        request.targetHeaderScaleHex,
      );

    expect(identity).toEqual({
      nativeBlockHashHex: result.target.nativeBlockHashHex,
      parentHashHex: `0x${request.targetHeaderScaleHex.slice(2, 66)}`,
      nativeHeight: result.target.nativeHeight,
      stateRootHex: result.target.stateRootHex,
      runtimeEnvironmentUpdatedDigestPresent: false,
    });
  });

  it('accepts every supported canonical Substrate digest item shape', () => {
    const request = normalizeNativeFinalizedPegInRuntimeIdentityV2Request(
      vector.membership.request,
    );
    const digestScaleHex = [
      '14',
      '00', '08', 'aabb',
      '04', '42414245', '04', 'cc',
      '05', '47525041', '00',
      '06', '42414245', '0c', '010203',
      '08',
    ].join('');
    const headerScaleHex =
      `${request.targetHeaderScaleHex.slice(0, -2)}${digestScaleHex}`;
    const expected =
      deriveNativeFinalizedPegInRuntimeIdentityV2TargetHeaderIdentity(
        request.targetHeaderScaleHex,
      );

    const identity =
      deriveNativeFinalizedPegInRuntimeIdentityV2TargetHeaderIdentity(
        headerScaleHex,
      );

    expect(identity.parentHashHex).toBe(expected.parentHashHex);
    expect(identity.nativeHeight).toBe(expected.nativeHeight);
    expect(identity.stateRootHex).toBe(expected.stateRootHex);
    expect(identity.runtimeEnvironmentUpdatedDigestPresent).toBe(true);
    expect(identity.nativeBlockHashHex).not.toBe(
      expected.nativeBlockHashHex,
    );
  });

  it.each([
    [
      'an oversized encoding',
      (headerScaleHex: string) =>
        `${headerScaleHex}${'00'.repeat(64 * 1024)}`,
      /exceeds 65536 bytes/i,
    ],
    [
      'trailing bytes',
      (headerScaleHex: string) => `${headerScaleHex}00`,
      /trailing bytes/i,
    ],
    [
      'an excessive digest count',
      (headerScaleHex: string) =>
        `${headerScaleHex.slice(0, -2)}0504`,
      /digest exceeds 256 logs/i,
    ],
    [
      'a noncanonical digest count',
      (headerScaleHex: string) =>
        `${headerScaleHex.slice(0, -2)}0100`,
      /digest log count is noncanonical/i,
    ],
    [
      'truncated digest vector',
      (headerScaleHex: string) => `${headerScaleHex.slice(0, -2)}04`,
      /digest.*truncated/i,
    ],
    [
      'a truncated digest engine ID',
      (headerScaleHex: string) =>
        `${headerScaleHex.slice(0, -2)}04044241`,
      /digest engine ID is truncated/i,
    ],
    [
      'a noncanonical digest payload length',
      (headerScaleHex: string) =>
        `${headerScaleHex.slice(0, -2)}04000100`,
      /digest payload length is noncanonical/i,
    ],
    [
      'a truncated digest payload',
      (headerScaleHex: string) =>
        `${headerScaleHex.slice(0, -2)}040008aa`,
      /digest payload is truncated/i,
    ],
    [
      'unknown digest variant',
      (headerScaleHex: string) => `${headerScaleHex.slice(0, -2)}04ff`,
      /digest variant 255 is unsupported/i,
    ],
  ])('rejects target SCALE headers with %s', (_label, mutate, error) => {
    const request = normalizeNativeFinalizedPegInRuntimeIdentityV2Request(
      vector.membership.request,
    );

    expect(() =>
      deriveNativeFinalizedPegInRuntimeIdentityV2TargetHeaderIdentity(
        mutate(request.targetHeaderScaleHex),
      ),
    ).toThrow(error);
  });

  it('rejects V1/V2 request and result schema crossing', () => {
    const v1Request = clone(vector.membership.request) as Record<string, unknown>;
    v1Request.schema = NATIVE_FINALIZED_PEG_IN_STATE_REQUEST_SCHEMA;
    expect(() =>
      normalizeNativeFinalizedPegInRuntimeIdentityV2Request(v1Request),
    ).toThrow(/schema/i);

    const wrongResult = clone(vector.membership.expected) as Record<string, unknown>;
    wrongResult.schema = 'e2s.native-finalized-peg-in-state-verification.v1';
    expect(() => validateFixture(vector.membership.request, wrongResult)).toThrow(/schema/i);
  });

  it.each([
    ['missing request field', (request: Record<string, unknown>) => {
      delete request.statement;
    }],
    ['unknown request field', (request: Record<string, unknown>) => {
      request.unexpected = true;
    }],
    ['missing result field', (_request: Record<string, unknown>, result: Record<string, unknown>) => {
      delete result.target;
    }],
    ['unknown result field', (_request: Record<string, unknown>, result: Record<string, unknown>) => {
      result.unexpected = true;
    }],
    ['wrong status', (_request: Record<string, unknown>, result: Record<string, unknown>) => {
      result.status = 'NATIVE_PEG_IN_STATE_VERIFIED_RELATIVE_TO_REVIEWED_TRUST_ROOT';
    }],
  ])('rejects %s', (_label, mutate) => {
    const request = clone(vector.membership.request) as Record<string, unknown>;
    const result = clone(vector.membership.expected) as Record<string, unknown>;
    mutate(request, result);
    expect(() => validateFixture(request, result)).toThrow();
  });

  it('binds the exact request bytes and independently supplied trust anchor', () => {
    const exactBytes = canonicalRequestBytes(vector.membership.request);
    expect(() => validateNativeFinalizedPegInRuntimeIdentityV2PayloadBindings({
      requestBytes: exactBytes,
      trustedAnchorDigestHex: `0x${'aa'.repeat(32)}`,
      verification: vector.membership.expected,
    })).toThrow(/independently supplied trust anchor/i);

    expect(() => validateNativeFinalizedPegInRuntimeIdentityV2PayloadBindings({
      requestBytes: Buffer.concat([exactBytes, Buffer.from('\n')]),
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      verification: vector.membership.expected,
    })).toThrow(/request digest/i);

    const drifted = clone(vector.membership.expected) as { requestDigestHex: string };
    drifted.requestDigestHex = `0x${'aa'.repeat(32)}`;
    expect(() => validateFixture(vector.membership.request, drifted)).toThrow(
      /request digest/i,
    );
  });

  it.each([
    ['code key', 'runtimeCodeStorageKeyHex', '0x3a436f6465'],
    ['code digest', 'runtimeCodeSha256Hex', `0x${'aa'.repeat(32)}`],
    ['code size', 'runtimeCodeSizeBytes', '40'],
    ['attestation ID', 'buildAttestationId', 'other-runtime-review-01'],
    ['attestation digest', 'buildAttestationSha256Hex', `0x${'aa'.repeat(32)}`],
  ])('rejects %s drift from the statement', (_label, field, value) => {
    const result = clone(vector.membership.expected) as {
      runtimeState: Record<string, unknown>;
    };
    result.runtimeState[field] = value;
    expect(() => validateFixture(vector.membership.request, result)).toThrow(
      /storage key|differs from the statement/i,
    );
  });

  it('rejects proof count and byte drift in the result', () => {
    const count = clone(vector.membership.expected) as {
      runtimeState: { proofNodeCount: number };
    };
    count.runtimeState.proofNodeCount += 1;
    expect(() => validateFixture(vector.membership.request, count)).toThrow(
      /proof-node count/i,
    );

    const bytes = clone(vector.membership.expected) as {
      runtimeState: { proofBytes: number };
    };
    bytes.runtimeState.proofBytes += 1;
    expect(() => validateFixture(vector.membership.request, bytes)).toThrow(
      /proof byte count/i,
    );
  });

  it('enforces the V2 request proof node-count bound', () => {
    const request = clone(vector.membership.request) as {
      runtimeStateProofNodesHex: string[];
    };
    request.runtimeStateProofNodesHex = Array.from(
      { length: MAX_PEG_IN_RUNTIME_IDENTITY_V2_PROOF_NODES + 1 },
      () => '0x01',
    );
    expect(() =>
      normalizeNativeFinalizedPegInRuntimeIdentityV2Request(request),
    ).toThrow(/exceeds 512 nodes/i);
  });

  it('rejects duplicate V2 request proof nodes', () => {
    const request = clone(vector.membership.request) as {
      runtimeStateProofNodesHex: string[];
    };
    request.runtimeStateProofNodesHex = ['0x01', '0x01'];
    expect(() =>
      normalizeNativeFinalizedPegInRuntimeIdentityV2Request(request),
    ).toThrow(/duplicate nodes/i);
  });

  it('enforces the V2 per-node and aggregate proof byte bounds', () => {
    const oversizedNode = clone(vector.membership.request) as {
      runtimeStateProofNodesHex: string[];
    };
    oversizedNode.runtimeStateProofNodesHex = [
      `0x${'01'.repeat(MAX_PEG_IN_RUNTIME_IDENTITY_V2_PROOF_NODE_BYTES + 1)}`,
    ];
    expect(() =>
      normalizeNativeFinalizedPegInRuntimeIdentityV2Request(oversizedNode),
    ).toThrow(/proof node 0 exceeds/i);

    const aggregate = clone(vector.membership.request) as {
      runtimeStateProofNodesHex: string[];
    };
    aggregate.runtimeStateProofNodesHex = [
      `0x${'01'.repeat(MAX_PEG_IN_RUNTIME_IDENTITY_V2_PROOF_NODE_BYTES)}`,
      `0x${'02'.repeat(MAX_PEG_IN_RUNTIME_IDENTITY_V2_PROOF_NODE_BYTES)}`,
      '0x03',
    ];
    expect(() =>
      normalizeNativeFinalizedPegInRuntimeIdentityV2Request(aggregate),
    ).toThrow(new RegExp(`exceeds ${MAX_PEG_IN_RUNTIME_IDENTITY_V2_PROOF_BYTES} bytes`));
  });

  it.each([
    ['target hash', (result: Record<string, unknown>) => {
      (result.target as Record<string, unknown>).nativeBlockHashHex = `0x${'aa'.repeat(32)}`;
    }],
    ['target height', (result: Record<string, unknown>) => {
      (result.target as Record<string, unknown>).nativeHeight = '1023';
    }],
    ['target state root', (result: Record<string, unknown>) => {
      (result.target as Record<string, unknown>).stateRootHex = `0x${'aa'.repeat(32)}`;
    }],
    ['authority set ID', (result: Record<string, unknown>) => {
      (result.authority as Record<string, unknown>).finalitySigningSetId = '8';
    }],
    ['authority set hash', (result: Record<string, unknown>) => {
      (result.authority as Record<string, unknown>).finalitySigningAuthoritySetHashHex =
        `0x${'aa'.repeat(32)}`;
    }],
    ['finality horizon', (result: Record<string, unknown>) => {
      (result.finality as Record<string, unknown>).horizonHeight = '1023';
    }],
    ['membership record output', (result: Record<string, unknown>) => {
      (result.record as Record<string, unknown>).amountNanoErg = '2000001';
    }],
  ])('rejects inherited %s drift through the V1 validator', (_label, mutate) => {
    const result = clone(vector.membership.expected) as Record<string, unknown>;
    mutate(result);
    expect(() => validateFixture(vector.membership.request, result)).toThrow();
  });

  it('binds the target tuple to the exact SCALE header bytes', () => {
    const request = clone(vector.membership.request) as {
      targetHeaderScaleHex: string;
    };
    const result = clone(vector.membership.expected) as {
      requestDigestHex: string;
    };
    const lastByte = Number.parseInt(request.targetHeaderScaleHex.slice(-2), 16);
    request.targetHeaderScaleHex = `${request.targetHeaderScaleHex.slice(0, -2)}${
      (lastByte ^ 0x01).toString(16).padStart(2, '0')
    }`;
    result.requestDigestHex =
      deriveNativeFinalizedPegInRuntimeIdentityV2RequestDigestHex(request);

    expect(() => validateFixture(request, result)).toThrow(
      /target SCALE header digest|target header hash/i,
    );
  });

  it('keeps V2 proof material outside daemon and reconciliation authority', () => {
    for (const sourceName of [
      'relayer-daemon.ts',
      'peg-in-runtime-reconciliation.ts',
    ]) {
      const source = readFileSync(new URL(`./${sourceName}`, import.meta.url), 'utf8');
      expect(source).not.toContain(
        'collectNativeFinalizedPegInRuntimeIdentityV2Request',
      );
      expect(source).not.toContain(
        'validateNativeFinalizedPegInRuntimeIdentityV2PayloadBindings',
      );
      expect(source).not.toContain(
        'NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_VERIFICATION_SCHEMA',
      );
    }
  });

  it('rejects inherited non-membership profile drift through the V1 validator', () => {
    const result = clone(vector.nonMembership.expected) as {
      profile: Record<string, unknown>;
    };
    result.profile.profileRevision = '5';
    expect(() => validateFixture(vector.nonMembership.request, result)).toThrow(
      /profile output differs/i,
    );
  });

  it('rejects every authority-boundary flip', () => {
    for (const field of [
      'sidechainFinalityVerified',
      'statementRuntimeStateVerified',
      'runtimeCodeStateProofVerified',
    ]) {
      const result = clone(vector.membership.expected) as {
        boundary: Record<string, boolean>;
      };
      result.boundary[field] = false;
      expect(() => validateFixture(vector.membership.request, result)).toThrow(
        /boundary|remain true/i,
      );
    }
    for (const field of [
      'runtimeBuildAttestationVerified',
      'historicalMintAbsenceVerified',
      'runtimeCodeIdentityVerified',
      'committedVaultTransitionVerified',
      'mintAuthorized',
      'transactionMutationEnabled',
      'gate5Closed',
    ]) {
      const result = clone(vector.membership.expected) as {
        boundary: Record<string, boolean>;
      };
      result.boundary[field] = true;
      expect(() => validateFixture(vector.membership.request, result)).toThrow(
        /boundary|remain false/i,
      );
    }
  });
});

function canonicalRequestBytes(value: unknown): Buffer {
  return Buffer.from(
    JSON.stringify(normalizeNativeFinalizedPegInRuntimeIdentityV2Request(value)),
    'utf8',
  );
}

function validateFixture(
  request: unknown,
  verification: unknown,
): ReturnType<typeof validateNativeFinalizedPegInRuntimeIdentityV2PayloadBindings> {
  return validateNativeFinalizedPegInRuntimeIdentityV2PayloadBindings({
    requestBytes: canonicalRequestBytes(request),
    trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
    verification,
  });
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
