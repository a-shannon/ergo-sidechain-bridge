import { writeFileSync } from 'fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  assertPegInRuntimeBuildAttestationValidationProvenance,
  derivePegInRuntimeBuildAttestationPacketSha256Hex,
  loadReviewedPegInRuntimeBuildAttestorLock,
  validatePegInRuntimeBuildAttestationAgainstPolicy,
  validatePegInRuntimeBuildAttestorLock,
  verifyReviewedPegInRuntimeBuildAttestation,
} from './peg-in-runtime-build-attestation.js';
import {
  createPegInRuntimeBuildAttestationFixture,
  type PegInRuntimeBuildAttestationFixture,
} from './peg-in-runtime-build-attestation-fixture.test-helper.js';

let fixture: PegInRuntimeBuildAttestationFixture;

beforeEach(() => {
  fixture = createPegInRuntimeBuildAttestationFixture();
});

afterEach(() => {
  fixture.dispose();
});

describe('peg-in runtime build attestation', () => {
  it('authenticates the exact reviewed runtime bytes without claiming lineage or mint authority', () => {
    expect(fixture.report.attestation.packetSha256Hex)
      .toBe(derivePegInRuntimeBuildAttestationPacketSha256Hex(fixture.packet));
    expect(fixture.report.artifact).toEqual(fixture.packet.statement.artifact);
    expect(fixture.report.boundary).toEqual({
      relativeToSuppliedPolicy: true,
      reviewedTrustRootsLoaded: false,
      exactRuntimeCodeBytesMatched: true,
      completeBuildToolClosureAttested: true,
      dependencyClosureAttested: true,
      organizationalIndependenceCryptographicallyProven: false,
      executionCapabilityIssued: false,
      nativeVerifierAttestedSeparately: true,
      runtimeUpgradeHistoryVerified: false,
      cutoverPolicyVerified: false,
      historicalMintAbsenceVerified: false,
      targetRuntimeBuildIdentityVerified: false,
      runtimeCodeIdentityVerified: false,
      committedVaultTransitionVerified: false,
      mintAuthorityGranted: false,
      admissionEligible: false,
      gate5Closed: false,
      productionReady: false,
    });
    expect(() =>
      assertPegInRuntimeBuildAttestationValidationProvenance(fixture.report))
      .not.toThrow();
    expect(() =>
      assertPegInRuntimeBuildAttestationValidationProvenance(
        structuredClone(fixture.report),
      ))
      .toThrow(/provenance/i);
  });

  it('rejects artifact substitution and source-lock drift', () => {
    writeFileSync(fixture.runtimeCodePath, 'different-runtime-bytes');
    expect(() => validate()).toThrow(/size|digest/i);
    writeFileSync(
      fixture.runtimeCodePath,
      Buffer.from('synthetic-reviewed-runtime-wasm'),
    );

    const statement = structuredClone(fixture.packet.statement);
    statement.source.frontierPatchSha256 = 'a'.repeat(64);
    expect(() => validate(fixture.signStatement(statement)))
      .toThrow(/canonical lock/i);
  });

  it('rejects invalid signatures, revoked profiles, and actor reuse', () => {
    const signature = structuredClone(fixture.packet);
    signature.signatures.reviewer.signatureHex = '0'.repeat(128);
    expect(() => validate(signature)).toThrow(/reviewer signature/i);

    const revoked = structuredClone(fixture.attestorLock);
    revoked.profiles[0].status = 'revoked';
    expect(() => validate(fixture.packet, revoked)).toThrow(/no active profile/i);

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
      .toThrow(/separate from bridge authorities/i);
  });

  it('rejects an attestation before its declared review time', () => {
    const statement = structuredClone(fixture.packet.statement);
    statement.timestamps.reviewedAt = '2026-07-17T12:00:00.001Z';
    expect(() => validate(fixture.signStatement(statement)))
      .toThrow(/review is not yet effective/i);
  });

  it('rejects command, closure, unknown-field, and premature authority drift', () => {
    const mutations: Array<(statement: Record<string, any>) => void> = [
      statement => { statement.build.cargoArguments[1] = '--unlocked'; },
      statement => { statement.dependencies.cargoOffline = false; },
      statement => { statement.tools.includesWasmOptimizer = false; },
      statement => { statement.boundaries.runtimeUpgradeHistoryVerified = true; },
      statement => { statement.boundaries.cutoverPolicyVerified = true; },
      statement => { statement.boundaries.historicalMintAbsenceVerified = true; },
      statement => { statement.boundaries.mintAuthorityGranted = true; },
      statement => { statement.boundaries.gate5Closed = true; },
      statement => { statement.allowMint = false; },
    ];
    for (const mutate of mutations) {
      const statement = structuredClone(
        fixture.packet.statement,
      ) as unknown as Record<string, any>;
      mutate(statement);
      expect(() => validate(fixture.signStatement(
        statement as typeof fixture.packet.statement,
      ))).toThrow();
    }
  });

  it('keeps the source-owned runtime registry empty and fail-closed', () => {
    const lock = loadReviewedPegInRuntimeBuildAttestorLock();
    expect(validatePegInRuntimeBuildAttestorLock(lock).profiles).toEqual([]);
    expect(() => verifyReviewedPegInRuntimeBuildAttestation({
      packet: fixture.packet,
      runtimeCodePath: fixture.runtimeCodePath,
      evaluatedAt: '2026-07-17T12:00:00.000Z',
    })).toThrow(/no active profile/i);
  });
});

function validate(
  packet = fixture.packet,
  attestorLock = fixture.attestorLock,
) {
  return validatePegInRuntimeBuildAttestationAgainstPolicy({
    bridgeRoot: fixture.bridgeRoot,
    attestorLock,
    packet,
    runtimeCodePath: fixture.runtimeCodePath,
    evaluatedAt: '2026-07-17T12:00:00.000Z',
  });
}
