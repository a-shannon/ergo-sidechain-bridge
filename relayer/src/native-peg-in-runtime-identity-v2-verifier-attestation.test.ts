import { writeFileSync } from 'fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  loadReviewedNativeVerifierAttestorLock,
  validateNativeVerifierAttestorLock,
} from './independently-attested-native-verifier-profile.js';
import {
  MAX_NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_VERIFIER_ARTIFACT_SIZE_BYTES,
  assertNativePegInRuntimeIdentityV2AttestationValidationProvenance,
  deriveNativePegInRuntimeIdentityV2AttestationCoreDigestHex,
  validateNativePegInRuntimeIdentityV2AttestationAgainstPolicy,
  verifyReviewedNativePegInRuntimeIdentityV2Attestation,
  type NativePegInRuntimeIdentityV2AttestationPacket,
  type NativePegInRuntimeIdentityV2AttestationStatement,
} from './native-peg-in-runtime-identity-v2-verifier-attestation.js';
import {
  createNativePegInRuntimeIdentityV2VerifierAttestationFixture,
  type NativePegInRuntimeIdentityV2VerifierAttestationFixture,
} from './native-peg-in-runtime-identity-v2-verifier-attestation-fixture.test-helper.js';

let fixture: NativePegInRuntimeIdentityV2VerifierAttestationFixture;

beforeEach(() => {
  fixture = createNativePegInRuntimeIdentityV2VerifierAttestationFixture();
});

afterEach(() => {
  fixture.dispose();
});

describe('native peg-in runtime identity V2 verifier attestation', () => {
  it('authenticates the exact V2 verifier without issuing execution or funds authority', () => {
    expect(fixture.report.attestation.statementCoreDigestHex).toBe(
      deriveNativePegInRuntimeIdentityV2AttestationCoreDigestHex(
        fixture.packet.statement,
      ),
    );
    expect(fixture.report.artifact).toEqual(fixture.packet.statement.artifact);
    expect(fixture.report.executionPolicySha256).toBe(
      fixture.packet.statement.executionPolicySha256,
    );
    expect(fixture.report.boundary).toEqual({
      relativeToSuppliedPolicy: true,
      reviewedTrustRootsLoaded: false,
      exactV2VerifierBytesMatched: true,
      completeBuildToolClosureAttested: true,
      dependencyClosureAttested: true,
      organizationalIndependenceCryptographicallyProven: false,
      executionCapabilityIssued: false,
      runtimeBuildAttestedSeparately: true,
      targetRuntimeBuildIdentityVerified: false,
      runtimeCodeIdentityVerified: false,
      historicalMintAbsenceVerified: false,
      committedVaultTransitionVerified: false,
      mintAuthorityGranted: false,
      gate5Closed: false,
      productionReady: false,
    });
    expect(() =>
      assertNativePegInRuntimeIdentityV2AttestationValidationProvenance(
        fixture.report,
      )).not.toThrow();
    expect(() =>
      assertNativePegInRuntimeIdentityV2AttestationValidationProvenance(
        structuredClone(fixture.report),
      )).toThrow(/provenance/i);
  });

  it('rejects verifier artifact substitution and canonical source drift', () => {
    writeFileSync(fixture.verifierExecutablePath, 'substituted-native-v2-bytes');
    expect(() => validate()).toThrow(/size|digest/i);
    writeFileSync(
      fixture.verifierExecutablePath,
      Buffer.from('synthetic-reviewed-native-v2-verifier'),
    );

    const statement = structuredClone(fixture.packet.statement);
    statement.source.frontierPatchSha256 = 'a'.repeat(64);
    expect(() => validate(fixture.signStatement(statement)))
      .toThrow(/canonical lock/i);
  });

  it('rejects dependency, tool, and build command drift', () => {
    const mutations: Array<(
      statement: NativePegInRuntimeIdentityV2AttestationStatement,
    ) => void> = [
      statement => { statement.dependencies.cargoOffline = false as true; },
      statement => {
        statement.dependencies.sharedMutableCacheUsed = true as false;
      },
      statement => { statement.tools.includesLinker = false as true; },
      statement => { statement.tools.includesWindowsSdk = false as true; },
      statement => { statement.build.cargoArguments[1] = '--unlocked'; },
      statement => { statement.build.freshEmptyTarget = false as true; },
      statement => {
        statement.build.sourceValidatedBeforeAndAfter = false as true;
      },
    ];
    for (const mutate of mutations) {
      const statement = structuredClone(fixture.packet.statement);
      mutate(statement);
      expect(() => validate(fixture.signStatement(statement))).toThrow();
    }
  });

  it('rejects invalid signatures and reused, revoked, or forbidden roles', () => {
    const signature = structuredClone(fixture.packet);
    signature.signatures.reviewer.signatureHex = '0'.repeat(128);
    expect(() => validate(signature)).toThrow(/reviewer signature/i);

    const revoked = structuredClone(fixture.attestorLock);
    revoked.profiles[0].status = 'revoked';
    expect(() => validate(fixture.packet, revoked)).toThrow(/no active profile/i);

    const sameKey = structuredClone(fixture.attestorLock);
    sameKey.profiles[0].reviewer.keyIdHex =
      sameKey.profiles[0].builder.keyIdHex;
    expect(() => validate(fixture.packet, sameKey))
      .toThrow(/distinct signing keys/i);

    const sameOrganization = structuredClone(fixture.attestorLock);
    sameOrganization.profiles[0].reviewer.organizationId =
      sameOrganization.profiles[0].builder.organizationId;
    expect(() => validate(fixture.packet, sameOrganization))
      .toThrow(/distinct organizations/i);

    const forbidden = structuredClone(fixture.attestorLock);
    forbidden.profiles[0].forbiddenAuthorityKeyIds = [
      forbidden.profiles[0].builder.keyIdHex,
    ];
    expect(() => validate(fixture.packet, forbidden))
      .toThrow(/forbidden authority key/i);
  });

  it('rejects future review times and oversized executable declarations before reading bytes', () => {
    const futureReview = structuredClone(fixture.packet.statement);
    futureReview.timestamps.reviewedAt = '2026-07-17T12:00:00.001Z';
    expect(() => validate(fixture.signStatement(futureReview)))
      .toThrow(/review is not yet effective/i);

    const oversized = structuredClone(fixture.packet.statement);
    oversized.artifact.sizeBytes =
      MAX_NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_VERIFIER_ARTIFACT_SIZE_BYTES + 1;
    expect(() => validate(fixture.signStatement(oversized)))
      .toThrow(/exceeds/i);
  });

  it('rejects unsigned policy drift and canonical vector mismatch', () => {
    const policyDrift = structuredClone(fixture.packet);
    policyDrift.statement.executionPolicySha256 = '7'.repeat(64);
    expect(() => validate(policyDrift)).toThrow(/statement digest/i);

    const vectorDrift = structuredClone(fixture.packet.statement);
    vectorDrift.conformance.pegInRuntimeIdentityVectorSha256 = '8'.repeat(64);
    expect(() => validate(fixture.signStatement(vectorDrift)))
      .toThrow(/conformance vector/i);
  });

  it('rejects unknown fields at packet, statement, and nested boundaries', () => {
    const mutations: Array<(
      packet: Record<string, any>,
    ) => NativePegInRuntimeIdentityV2AttestationPacket> = [
      packet => {
        packet.allowMint = false;
        return packet as NativePegInRuntimeIdentityV2AttestationPacket;
      },
      packet => {
        packet.statement.allowMint = false;
        return fixture.signStatement(
          packet.statement as NativePegInRuntimeIdentityV2AttestationStatement,
        );
      },
      packet => {
        packet.statement.boundaries.admissionEligible = false;
        return fixture.signStatement(
          packet.statement as NativePegInRuntimeIdentityV2AttestationStatement,
        );
      },
    ];
    for (const mutate of mutations) {
      const packet = structuredClone(
        fixture.packet,
      ) as unknown as Record<string, any>;
      expect(() => validate(mutate(packet))).toThrow(/supported fields/i);
    }
  });

  it('rejects every premature execution, settlement, or readiness authority', () => {
    const fields = [
      'executionCapabilityIssued',
      'targetRuntimeBuildIdentityVerified',
      'runtimeCodeIdentityVerified',
      'historicalMintAbsenceVerified',
      'committedVaultTransitionVerified',
      'mintAuthorityGranted',
      'gate5Closed',
      'productionReady',
    ] as const;
    for (const field of fields) {
      const statement = structuredClone(fixture.packet.statement);
      statement.boundaries[field] = true as never;
      expect(() => validate(fixture.signStatement(statement)))
        .toThrow(/premature authority or readiness claim/i);
    }
  });

  it('keeps the canonical source-owned attestor registry empty and fail-closed', () => {
    const lock = loadReviewedNativeVerifierAttestorLock();
    expect(validateNativeVerifierAttestorLock(lock).profiles).toEqual([]);
    expect(() => verifyReviewedNativePegInRuntimeIdentityV2Attestation({
      packet: fixture.packet,
      verifierExecutablePath: fixture.verifierExecutablePath,
      evaluatedAt: '2026-07-17T12:00:00.000Z',
    })).toThrow(/no active profile/i);
  });
});

function validate(
  packet = fixture.packet,
  attestorLock = fixture.attestorLock,
) {
  return validateNativePegInRuntimeIdentityV2AttestationAgainstPolicy({
    bridgeRoot: fixture.bridgeRoot,
    attestorLock,
    packet,
    verifierExecutablePath: fixture.verifierExecutablePath,
    evaluatedAt: '2026-07-17T12:00:00.000Z',
  });
}
