import {
  createHash,
  generateKeyPairSync,
  sign as signMessage,
  type KeyObject,
} from 'crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assertNativeVerifierAttestationValidationReportProvenance,
  assertReviewedIndependentlyAttestedNativeVerifierProfileProvenance,
  canonicalNativeVerifierAttestationMessage,
  deriveNativeVerifierAttestorPolicyDigestHex,
  deriveNativeVerifierAttestationCoreDigestHex,
  deriveNativeVerifierSourceManifestSha256,
  loadReviewedNativeVerifierAttestorLock,
  validateNativeVerifierAttestorLock,
  validateNativeVerifierAttestationAgainstPolicy,
  verifyReviewedIndependentlyAttestedNativeVerifierProfile,
  type NativeVerifierAttestationPacket,
  type NativeVerifierAttestationStatement,
  type NativeVerifierAttestorLock,
} from './independently-attested-native-verifier-profile.js';
import {
  NATIVE_RUNTIME_DEPENDENCY_MANIFEST_SCHEMA,
  NATIVE_VERIFIER_EXECUTION_POLICY_SCHEMA,
  deriveNativeRuntimeDependencyManifestSha256,
  deriveNativeVerifierExecutionPolicySha256,
  validateNativeVerifierExecutionPolicyAgainstProfile,
  type NativeRuntimeDependencyManifest,
  type NativeRuntimeDependencyManifests,
  type NativeVerifierExecutionPolicy,
} from './native-verifier-execution-policy.js';

const directory = dirname(fileURLToPath(import.meta.url));
const bridgeRoot = resolve(directory, '..', '..');
const consensusSourceLock = JSON.parse(readFileSync(
  resolve(bridgeRoot, 'sources', 'consensus-source-lock.json'),
  'utf8',
)) as {
  frontier: {
    commit: string;
    cargoLockBlob: string;
    patchSha256: string;
  };
};
const consensusSourceLockSha256 = sha256File(
  resolve(bridgeRoot, 'sources', 'consensus-source-lock.json'),
);
const nativeVectorSha256 = sha256File(
  resolve(bridgeRoot, 'relayer', 'test-vectors', 'native-finalized-bridge-checkpoint-v2.json'),
);
const frontierVectorSha256 = sha256File(
  resolve(bridgeRoot, 'relayer', 'test-vectors', 'frontier-bridge-event-root-v1.json'),
);

const temporaryRoots: string[] = [];

afterEach(() => {
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

interface Fixture {
  verifierPath: string;
  codecPath: string;
  builderPrivateKey: KeyObject;
  reviewerPrivateKey: KeyObject;
  attestorLock: NativeVerifierAttestorLock;
  packet: NativeVerifierAttestationPacket;
  policy: NativeVerifierExecutionPolicy;
  manifests: NativeRuntimeDependencyManifests;
}

describe('independently attested native verifier profile', () => {
  it('verifies two externally signed roles, exact source closure, exact binaries, and fail-closed boundaries', () => {
    const fixture = validFixture();
    const verified = validateNativeVerifierAttestationAgainstPolicy({
      bridgeRoot,
      attestorLock: fixture.attestorLock,
      packet: fixture.packet,
      verifierExecutablePath: fixture.verifierPath,
      codecExecutablePath: fixture.codecPath,
      evaluatedAt: '2026-07-12T12:00:00.000Z',
    });

    expect(verified.schema).toBe('e2s.native-verifier-attestation-validation-report.v2');
    expect(verified.profileId).toBe('institutional-win32-x64-v1');
    expect(verified.attestation.statementDigestHex).toBe(fixture.packet.statementDigestHex);
    expect(verified.attestation.statementCoreDigestHex).toBe(
      fixture.policy.bindings.attestationCoreDigestHex,
    );
    expect(verified.attestation.policyDigestHex).toBe(
      deriveNativeVerifierAttestorPolicyDigestHex(fixture.attestorLock),
    );
    expect(verified.attestation.builderSignatureVerified).toBe(true);
    expect(verified.attestation.reviewerSignatureVerified).toBe(true);
    expect(verified.attestation.actorKeysDisjoint).toBe(true);
    expect(verified.attestation.organizationsDeclaredDisjoint).toBe(true);
    expect(verified.source.consensusSourceLockSha256).toBe(consensusSourceLockSha256);
    expect(verified.timestamps).toEqual(fixture.packet.statement.timestamps);
    expect(verified.dependencies).toEqual(fixture.packet.statement.dependencies);
    expect(verified.executionPolicySha256).toBe(
      fixture.packet.statement.executionPolicySha256,
    );
    expect(verified.boundary).toEqual({
      relativeToSuppliedPolicy: true,
      reviewedTrustRootsLoaded: false,
      executionCapabilityIssued: false,
      exactBinaryBytesMatched: true,
      completeBuildToolClosureAttested: true,
      dependencyClosureAttested: true,
      osProcessContainmentAttested: true,
      organizationalIndependenceCryptographicallyProven: false,
      provisioningIntegrated: false,
      trackerAttestorSeparated: false,
      ergoExtensionAnchorVerified: false,
      onChainAcceptanceVerified: false,
      committeeBypassPrevented: false,
      admissionEligible: false,
      gate5Closed: false,
      productionReady: false,
    });

    expect(() => assertNativeVerifierAttestationValidationReportProvenance(verified))
      .not.toThrow();
    const executionPolicy = validateNativeVerifierExecutionPolicyAgainstProfile({
      profile: verified,
      policy: fixture.policy,
      runtimeDependencyManifests: fixture.manifests,
      evaluatedAt: '2026-07-12T12:00:00.000Z',
    });
    expect(executionPolicy.executionPolicySha256).toBe(
      fixture.packet.statement.executionPolicySha256,
    );

    expect(() => assertReviewedIndependentlyAttestedNativeVerifierProfileProvenance(
      verified,
    )).toThrow(/reviewed.*provenance/i);
  });

  it('keeps the reviewed source registry inert until external attestor keys are approved', () => {
    const fixture = validFixture();
    const reviewedLock = loadReviewedNativeVerifierAttestorLock();
    expect(reviewedLock.profiles).toEqual([]);
    expect(() => verifyReviewedIndependentlyAttestedNativeVerifierProfile({
      packet: fixture.packet,
      verifierExecutablePath: fixture.verifierPath,
      codecExecutablePath: fixture.codecPath,
    })).toThrow(/active attestor profile/i);
  });

  it('validates attestor key material and validity windows before a lock is described as valid', () => {
    const inverted = validFixture().attestorLock;
    inverted.profiles[0].validFrom = '2027-02-01T00:00:00.000Z';
    expect(() => validateNativeVerifierAttestorLock(inverted)).toThrow(/validity window/i);

    const wrongKeyId = validFixture().attestorLock;
    wrongKeyId.profiles[0].reviewer.keyIdHex = hash('a');
    expect(() => validateNativeVerifierAttestorLock(wrongKeyId)).toThrow(/public key.*key ID/i);
  });

  it('rejects a signature made by a self-supplied key absent from the reviewed policy', () => {
    const fixture = validFixture();
    const rogue = generateKeyPairSync('ed25519');
    const rogueKey = publicKey(rogue.publicKey);
    fixture.packet.statement.actors.reviewerKeyIdHex = rogueKey.keyIdHex;
    fixture.packet.statement.actors.reviewerOrganizationId = 'rogue-self-approver';
    resign(fixture, { reviewerPrivateKey: rogue.privateKey });

    expect(() => verify(fixture)).toThrow(/reviewer key.*reviewed policy/i);
  });

  it('rejects the same signing key or organization in builder and reviewer roles', () => {
    const sameKey = validFixture();
    const builder = sameKey.attestorLock.profiles[0].builder;
    sameKey.attestorLock.profiles[0].reviewer = {
      role: 'independent-reviewer',
      organizationId: 'review-organization',
      keyIdHex: builder.keyIdHex,
      publicKeySpkiDerHex: builder.publicKeySpkiDerHex,
    };
    sameKey.packet.statement.actors.reviewerKeyIdHex = builder.keyIdHex;
    resign(sameKey, { reviewerPrivateKey: sameKey.builderPrivateKey });
    expect(() => verify(sameKey)).toThrow(/distinct signing keys/i);

    const sameOrganization = validFixture();
    sameOrganization.attestorLock.profiles[0].reviewer.organizationId = 'build-organization';
    sameOrganization.packet.statement.actors.reviewerOrganizationId = 'build-organization';
    resign(sameOrganization);
    expect(() => verify(sameOrganization)).toThrow(/distinct organizations/i);
  });

  it('rejects alternate non-canonical SPKI encodings of the same Ed25519 key', () => {
    const fixture = validFixture();
    const reviewer = fixture.attestorLock.profiles[0].reviewer;
    const alternateDer = `${reviewer.publicKeySpkiDerHex}00`;
    reviewer.publicKeySpkiDerHex = alternateDer;
    reviewer.keyIdHex = sha256(Buffer.from(alternateDer, 'hex'));
    fixture.packet.statement.actors.reviewerKeyIdHex = reviewer.keyIdHex;
    resign(fixture);

    expect(() => verify(fixture)).toThrow(/canonical SPKI DER/i);
  });

  it('rejects statement mutation and an invalid detached signature', () => {
    const mutated = validFixture();
    mutated.packet.statement.conformance.outputManifestSha256 = hash('f');
    expect(() => verify(mutated)).toThrow(/statement digest/i);

    const invalidSignature = validFixture();
    invalidSignature.packet.signatures.reviewer.signatureHex = '00'.repeat(64);
    expect(() => verify(invalidSignature)).toThrow(/reviewer signature/i);
  });

  it('rejects a changed execution policy binding and the superseded v1 schema', () => {
    const changedPolicy = validFixture();
    changedPolicy.packet.statement.executionPolicySha256 = hash('a');
    expect(() => verify(changedPolicy)).toThrow(/statement digest/i);

    const superseded = validFixture();
    superseded.packet.statement.schema =
      'e2s.native-verifier-attestation-statement.v1' as never;
    resign(superseded);
    expect(() => verify(superseded)).toThrow(/schema/i);
  });

  it('rejects source-lock, Frontier, patch, Cargo.lock, and verifier-source drift', () => {
    for (const mutate of [
      (statement: NativeVerifierAttestationStatement) => {
        statement.source.consensusSourceLockSha256 = hash('a');
      },
      (statement: NativeVerifierAttestationStatement) => {
        statement.source.frontierCommit = 'a'.repeat(40);
      },
      (statement: NativeVerifierAttestationStatement) => {
        statement.source.frontierPatchSha256 = hash('a');
      },
      (statement: NativeVerifierAttestationStatement) => {
        statement.source.cargoLockGitBlobId = 'a'.repeat(40);
      },
      (statement: NativeVerifierAttestationStatement) => {
        statement.source.verifierSourceManifestSha256 = hash('a');
      },
    ]) {
      const fixture = validFixture();
      mutate(fixture.packet.statement);
      resign(fixture);
      expect(() => verify(fixture)).toThrow(/source|Frontier|patch|Cargo\.lock/i);
    }
  });

  it('rejects a canonical source lock whose tracked Frontier patch bytes have drifted', () => {
    const fixture = validFixture();
    const isolatedBridgeRoot = mkdtempSync(join(tmpdir(), 'e2s-attested-source-root-'));
    temporaryRoots.push(isolatedBridgeRoot);
    mkdirSync(resolve(isolatedBridgeRoot, 'sources', 'frontier'), { recursive: true });
    mkdirSync(resolve(isolatedBridgeRoot, 'relayer', 'test-vectors'), { recursive: true });
    copyFileSync(
      resolve(bridgeRoot, 'sources', 'consensus-source-lock.json'),
      resolve(isolatedBridgeRoot, 'sources', 'consensus-source-lock.json'),
    );
    const isolatedPatch = resolve(
      isolatedBridgeRoot,
      'sources',
      'frontier',
      '0001-bridge-runtime-commitment.patch',
    );
    copyFileSync(
      resolve(bridgeRoot, 'sources', 'frontier', '0001-bridge-runtime-commitment.patch'),
      isolatedPatch,
    );
    copyFileSync(
      resolve(bridgeRoot, 'relayer', 'test-vectors', 'native-finalized-bridge-checkpoint-v2.json'),
      resolve(isolatedBridgeRoot, 'relayer', 'test-vectors', 'native-finalized-bridge-checkpoint-v2.json'),
    );
    copyFileSync(
      resolve(bridgeRoot, 'relayer', 'test-vectors', 'frontier-bridge-event-root-v1.json'),
      resolve(isolatedBridgeRoot, 'relayer', 'test-vectors', 'frontier-bridge-event-root-v1.json'),
    );
    const patchBytes = readFileSync(isolatedPatch);
    patchBytes[patchBytes.length - 1] ^= 0x01;
    writeFileSync(isolatedPatch, patchBytes);

    expect(() => validateNativeVerifierAttestationAgainstPolicy({
      bridgeRoot: isolatedBridgeRoot,
      attestorLock: fixture.attestorLock,
      packet: fixture.packet,
      verifierExecutablePath: fixture.verifierPath,
      codecExecutablePath: fixture.codecPath,
      evaluatedAt: '2026-07-12T12:00:00.000Z',
    })).toThrow(/Frontier patch bytes/i);
  });

  it('rejects incomplete dependency and build-tool closures', () => {
    const dependency = validFixture();
    (dependency.packet.statement.dependencies as unknown as Record<string, unknown>)
      .sharedMutableCacheUsed = true;
    resign(dependency);
    expect(() => verify(dependency)).toThrow(/dependency closure/i);

    const tools = validFixture();
    (tools.packet.statement.tools as unknown as Record<string, unknown>).includesWindowsSdk = false;
    resign(tools);
    expect(() => verify(tools)).toThrow(/tool closure/i);
  });

  it('rejects weakened build isolation or process containment', () => {
    const build = validFixture();
    (build.packet.statement.build as unknown as Record<string, unknown>).freshEmptyTarget = false;
    resign(build);
    expect(() => verify(build)).toThrow(/build isolation/i);

    const containment = validFixture();
    (containment.packet.statement.containment as unknown as Record<string, unknown>).killOnClose = false;
    resign(containment);
    expect(() => verify(containment)).toThrow(/process containment/i);

    const unsupported = validFixture();
    unsupported.packet.statement.containment.mechanism = 'pid-polling-only' as never;
    resign(unsupported);
    expect(() => verify(unsupported)).toThrow(/containment mechanism/i);
  });

  it('rejects binary mutation, size drift, and duplicate artifact roles', () => {
    const changedBytes = validFixture();
    writeFileSync(
      changedBytes.verifierPath,
      Buffer.alloc(readFileSync(changedBytes.verifierPath).length, 0x78),
    );
    expect(() => verify(changedBytes)).toThrow(/verifier.*digest/i);

    const size = validFixture();
    size.packet.statement.artifacts.codec.sizeBytes += 1;
    resign(size);
    expect(() => verify(size)).toThrow(/codec.*size/i);

    const duplicateRole = validFixture();
    duplicateRole.packet.statement.artifacts.codec.role = 'bridge-checkpoint-verifier' as never;
    resign(duplicateRole);
    expect(() => verify(duplicateRole)).toThrow(/artifact roles/i);
  });

  it('rejects revoked/out-of-window attestors and forbidden authority reuse', () => {
    const revoked = validFixture();
    revoked.attestorLock.profiles[0].status = 'revoked';
    expect(() => verify(revoked)).toThrow(/active attestor profile/i);

    const outsideWindow = validFixture();
    outsideWindow.packet.statement.timestamps.reviewedAt = '2027-01-02T00:00:00.000Z';
    resign(outsideWindow);
    expect(() => verify(outsideWindow)).toThrow(/validity window/i);

    const authorityReuse = validFixture();
    authorityReuse.attestorLock.profiles[0].forbiddenAuthorityKeyIds = [
      authorityReuse.attestorLock.profiles[0].reviewer.keyIdHex,
    ];
    expect(() => verify(authorityReuse)).toThrow(/forbidden authority/i);
  });

  it('rejects any profile that claims provisioning, admission, Gate 5, trustlessness, or production readiness', () => {
    for (const mutate of [
      (statement: NativeVerifierAttestationStatement) => {
        statement.boundaries.provisioningIntegrated = true as false;
      },
      (statement: NativeVerifierAttestationStatement) => {
        statement.boundaries.admissionEligible = true as false;
      },
      (statement: NativeVerifierAttestationStatement) => {
        statement.boundaries.gate5Closed = true as false;
      },
      (statement: NativeVerifierAttestationStatement) => {
        statement.boundaries.productionReady = true as false;
      },
    ]) {
      const fixture = validFixture();
      mutate(fixture.packet.statement);
      resign(fixture);
      expect(() => verify(fixture)).toThrow(/boundary|claim/i);
    }
  });

  it('rejects unknown fields instead of accepting an extensible signed object', () => {
    const fixture = validFixture();
    (fixture.packet.statement as unknown as Record<string, unknown>).unexpected = true;
    resign(fixture);
    expect(() => verify(fixture)).toThrow(/exactly/i);
  });
});

function validFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'e2s-native-attestation-test-'));
  temporaryRoots.push(root);
  const verifierPath = join(root, process.platform === 'win32' ? 'verifier.exe' : 'verifier');
  const codecPath = join(root, process.platform === 'win32' ? 'codec.exe' : 'codec');
  writeFileSync(verifierPath, 'attested-verifier-bytes');
  writeFileSync(codecPath, 'attested-codec-bytes');

  const builder = generateKeyPairSync('ed25519');
  const reviewer = generateKeyPairSync('ed25519');
  const builderPublic = publicKey(builder.publicKey);
  const reviewerPublic = publicKey(reviewer.publicKey);
  const profileId = 'institutional-win32-x64-v1';
  const statement: NativeVerifierAttestationStatement = {
    schema: 'e2s.native-verifier-attestation-statement.v2',
    profileId,
    attestationId: 'build-2026-07-12-review-01',
    canonicalization: 'e2s-canonical-json-v1',
    signatureAlgorithm: 'ed25519',
    timestamps: {
      builtAt: '2026-07-12T09:00:00.000Z',
      reviewedAt: '2026-07-12T11:00:00.000Z',
    },
    source: {
      consensusSourceLockSha256,
      frontierCommit: consensusSourceLock.frontier.commit,
      frontierPatchSha256: consensusSourceLock.frontier.patchSha256,
      cargoLockGitBlobId: consensusSourceLock.frontier.cargoLockBlob,
      verifierSourceManifestSha256: deriveNativeVerifierSourceManifestSha256(
        JSON.parse(readFileSync(
          resolve(bridgeRoot, 'sources', 'consensus-source-lock.json'),
          'utf8',
        )),
      ),
    },
    dependencies: {
      mode: 'vendored-content-addressed',
      manifestSha256: hash('1'),
      crateCount: 321,
      cargoLocked: true,
      cargoOffline: true,
      cargoFrozen: true,
      sharedMutableCacheUsed: false,
    },
    tools: {
      completeClosureManifestSha256: hash('2'),
      toolCount: 18,
      includesCompilerDriver: true,
      includesLinker: true,
      includesWindowsSdk: true,
      includesInvokedHelpers: true,
    },
    build: {
      platform: 'win32-x64',
      rustTarget: 'x86_64-pc-windows-msvc',
      profile: 'release',
      cargoArguments: [
        'build',
        '--locked',
        '--offline',
        '--frozen',
        '--release',
        '-p',
        'bridge-checkpoint-verifier',
        '--bins',
      ],
      workingTreeIdentitySha256: hash('3'),
      environmentAllowlistSha256: hash('4'),
      freshEmptyTarget: true,
      preexistingOutputsRejected: true,
      sourceValidatedBeforeAndAfter: true,
    },
    containment: {
      mechanism: 'windows-job-object-kill-on-close',
      evidenceSha256: hash('5'),
      killOnClose: true,
      descendantsContained: true,
      inheritedHandlesContained: true,
      timeoutTerminationTested: true,
      outputLimitTerminationTested: true,
    },
    artifacts: {
      verifier: {
        role: 'bridge-checkpoint-verifier',
        sha256: sha256File(verifierPath),
        sizeBytes: readFileSync(verifierPath).length,
      },
      codec: {
        role: 'bridge-rpc-proof-codec',
        sha256: sha256File(codecPath),
        sizeBytes: readFileSync(codecPath).length,
      },
    },
    executionPolicySha256: hash('6'),
    conformance: {
      nativeCheckpointVectorSha256: nativeVectorSha256,
      frontierBurnVectorSha256: frontierVectorSha256,
      outputManifestSha256: hash('8'),
      status: 'PASS',
    },
    actors: {
      builderKeyIdHex: builderPublic.keyIdHex,
      builderOrganizationId: 'build-organization',
      reviewerKeyIdHex: reviewerPublic.keyIdHex,
      reviewerOrganizationId: 'review-organization',
    },
    boundaries: {
      externalBuildPerformed: true,
      independentReproductionPerformed: true,
      completeBuildToolClosureAttested: true,
      dependencyClosureAttested: true,
      osProcessContainmentAttested: true,
      provisioningIntegrated: false,
      trackerAttestorSeparated: false,
      ergoExtensionAnchorVerified: false,
      onChainAcceptanceVerified: false,
      committeeBypassPrevented: false,
      admissionEligible: false,
      gate5Closed: false,
      productionReady: false,
    },
  };
  const manifests: NativeRuntimeDependencyManifests = {
    verifier: runtimeManifest(
      'bridge-checkpoint-verifier',
      statement.artifacts.verifier.sha256,
      statement.artifacts.verifier.sizeBytes,
    ),
    codec: runtimeManifest(
      'bridge-rpc-proof-codec',
      statement.artifacts.codec.sha256,
      statement.artifacts.codec.sizeBytes,
    ),
  };
  const policy = executionPolicy(statement, manifests);
  statement.executionPolicySha256 = deriveNativeVerifierExecutionPolicySha256(policy);
  const attestorLock: NativeVerifierAttestorLock = {
    schemaVersion: 1,
    kind: 'bridge-native-verifier-attestor-lock',
    canonicalization: 'e2s-canonical-json-v1',
    signatureAlgorithm: 'ed25519',
    profiles: [{
      profileId,
      status: 'active',
      validFrom: '2026-07-01T00:00:00.000Z',
      validUntil: '2027-01-01T00:00:00.000Z',
      builder: {
        role: 'builder',
        organizationId: 'build-organization',
        keyIdHex: builderPublic.keyIdHex,
        publicKeySpkiDerHex: builderPublic.spkiDerHex,
      },
      reviewer: {
        role: 'independent-reviewer',
        organizationId: 'review-organization',
        keyIdHex: reviewerPublic.keyIdHex,
        publicKeySpkiDerHex: reviewerPublic.spkiDerHex,
      },
      forbiddenAuthorityKeyIds: [hash('f')],
    }],
    boundaries: {
      runtimeProfilesCannotAddTrustRoots: true,
      cryptographyDoesNotProveOrganizationalIndependence: true,
      provisioningIntegrationRequiredForAdmission: true,
      trackerAttestorSeparationRequired: true,
    },
  };
  const packet = {
    statement,
    statementDigestHex: '',
    signatures: {
      builder: { keyIdHex: builderPublic.keyIdHex, signatureHex: '' },
      reviewer: { keyIdHex: reviewerPublic.keyIdHex, signatureHex: '' },
    },
  } as NativeVerifierAttestationPacket;
  const fixture = {
    verifierPath,
    codecPath,
    builderPrivateKey: builder.privateKey,
    reviewerPrivateKey: reviewer.privateKey,
    attestorLock,
    packet,
    policy,
    manifests,
  };
  resign(fixture);
  return fixture;
}

function executionPolicy(
  statement: NativeVerifierAttestationStatement,
  manifests: NativeRuntimeDependencyManifests,
): NativeVerifierExecutionPolicy {
  const limits = {
    timeoutMs: 30_000,
    requestLimitBytes: 32 * 1024 * 1024,
    stdoutLimitBytes: 16 * 1024 * 1024,
    stderrLimitBytes: 64 * 1024,
  };
  return {
    schema: NATIVE_VERIFIER_EXECUTION_POLICY_SCHEMA,
    profileId: statement.profileId,
    attestationId: statement.attestationId,
    policyId: 'native-verifier-execution-2026-07-12-01',
    canonicalization: 'e2s-canonical-json-v1',
    validity: {
      notBefore: '2026-07-12T11:30:00.000Z',
      expiresAt: '2026-12-31T00:00:00.000Z',
      policyEpoch: 1,
    },
    bindings: {
      attestationCoreDigestHex: deriveNativeVerifierAttestationCoreDigestHex(statement),
      buildDependencyManifestSha256: statement.dependencies.manifestSha256,
      launcher: {
        sha256: hash('9'),
        sizeBytes: 34_567,
        sourceManifestSha256: hash('a'),
      },
    },
    environment: {
      variables: ['SystemRoot', 'TEMP', 'TMP'],
      temp: 'staged-directory',
      workingDirectory: 'staged-directory',
      pathInherited: false,
      libraryPathInherited: false,
    },
    targets: {
      verifier: {
        role: 'bridge-checkpoint-verifier',
        artifactSha256: statement.artifacts.verifier.sha256,
        artifactSizeBytes: statement.artifacts.verifier.sizeBytes,
        runtimeDependencyManifestSha256:
          deriveNativeRuntimeDependencyManifestSha256(manifests.verifier),
        invocations: [{
          operation: 'verify-checkpoint',
          argvTemplate: [
            { kind: 'literal', value: '--trusted-anchor-digest' },
            {
              kind: 'parameter',
              name: 'trustedAnchorDigestHex',
              format: 'lowercase-0x-sha256',
            },
          ],
          requestSchema: 'e2s.native-finalized-bridge-checkpoint-request.v2',
          resultSchema: 'e2s.native-finalized-bridge-checkpoint-verification.v2',
        }],
        limits: { ...limits },
      },
      codec: {
        role: 'bridge-rpc-proof-codec',
        artifactSha256: statement.artifacts.codec.sha256,
        artifactSizeBytes: statement.artifacts.codec.sizeBytes,
        runtimeDependencyManifestSha256:
          deriveNativeRuntimeDependencyManifestSha256(manifests.codec),
        invocations: [
          codecInvocation(
            'encode-headers',
            '--encode-headers',
            'e2s.substrate-rpc-header-encoding-request.v1',
            'e2s.substrate-rpc-header-encoding-result.v1',
          ),
          codecInvocation(
            'inspect-warp-proof',
            '--inspect-warp-proof',
            'e2s.substrate-rpc-warp-inspection-request.v2',
            'e2s.substrate-rpc-warp-inspection-result.v2',
          ),
          codecInvocation(
            'inspect-finality-proof',
            '--inspect-finality-proof',
            'e2s.substrate-rpc-finality-inspection-request.v1',
            'e2s.substrate-rpc-finality-inspection-result.v1',
          ),
        ],
        limits: { ...limits },
      },
    },
    boundaries: {
      launcherAtomicBootstrapProven: false,
      loadedModuleClosureEnforced: false,
      executionAdmissionGranted: false,
      gate5Closed: false,
      productionReady: false,
    },
  };
}

function runtimeManifest<Role extends NativeRuntimeDependencyManifest['role']>(
  role: Role,
  artifactSha256: string,
  artifactSizeBytes: number,
): NativeRuntimeDependencyManifest<Role> {
  return {
    schema: NATIVE_RUNTIME_DEPENDENCY_MANIFEST_SCHEMA,
    role,
    artifactSha256,
    artifactSizeBytes,
    platform: 'win32-x64',
    systemDlls: ['kernel32.dll'],
    delayLoadedDlls: [],
    nonSystemDependencies: [],
    sidecars: [],
    dynamicLibraryLoadingReviewedAbsent: true,
    boundaries: {
      loadedModuleClosureEnforced: false,
      dynamicLoadsCryptographicallyExcluded: false,
    },
  };
}

function codecInvocation(
  operation: 'encode-headers' | 'inspect-warp-proof' | 'inspect-finality-proof',
  mode: string,
  requestSchema: string,
  resultSchema: string,
) {
  return {
    operation,
    argvTemplate: [{ kind: 'literal' as const, value: mode }],
    requestSchema,
    resultSchema,
  };
}

function verify(fixture: Fixture) {
  return validateNativeVerifierAttestationAgainstPolicy({
    bridgeRoot,
    attestorLock: fixture.attestorLock,
    packet: fixture.packet,
    verifierExecutablePath: fixture.verifierPath,
    codecExecutablePath: fixture.codecPath,
    evaluatedAt: '2026-07-12T12:00:00.000Z',
  });
}

function resign(
  fixture: Fixture,
  overrides: {
    builderPrivateKey?: KeyObject;
    reviewerPrivateKey?: KeyObject;
  } = {},
): void {
  const message = canonicalNativeVerifierAttestationMessage(fixture.packet.statement);
  fixture.packet.statementDigestHex = sha256(message);
  fixture.packet.signatures.builder.keyIdHex = fixture.packet.statement.actors.builderKeyIdHex;
  fixture.packet.signatures.reviewer.keyIdHex = fixture.packet.statement.actors.reviewerKeyIdHex;
  fixture.packet.signatures.builder.signatureHex = signMessage(
    null,
    message,
    overrides.builderPrivateKey ?? fixture.builderPrivateKey,
  ).toString('hex');
  fixture.packet.signatures.reviewer.signatureHex = signMessage(
    null,
    message,
    overrides.reviewerPrivateKey ?? fixture.reviewerPrivateKey,
  ).toString('hex');
}

function publicKey(key: KeyObject): { keyIdHex: string; spkiDerHex: string } {
  const der = key.export({ type: 'spki', format: 'der' });
  return {
    keyIdHex: sha256(der),
    spkiDerHex: der.toString('hex'),
  };
}

function sha256File(path: string): string {
  return sha256(readFileSync(path));
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function hash(nibble: string): string {
  return nibble.repeat(64);
}
