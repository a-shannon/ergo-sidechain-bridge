import {
  createHash,
  generateKeyPairSync,
  sign as signMessage,
} from 'crypto';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  canonicalNativeVerifierAttestationMessage,
  deriveNativeVerifierAttestationCoreDigestHex,
  deriveNativeVerifierSourceManifestSha256,
  validateNativeVerifierAttestationAgainstPolicy,
  type NativeVerifierAttestationPacket,
  type NativeVerifierAttestationStatement,
  type NativeVerifierAttestationValidationReport,
  type NativeVerifierAttestorLock,
} from './independently-attested-native-verifier-profile.js';
import {
  NATIVE_RUNTIME_DEPENDENCY_MANIFEST_SCHEMA,
  NATIVE_VERIFIER_EXECUTION_POLICY_SCHEMA,
  deriveNativeRuntimeDependencyManifestSha256,
  deriveNativeVerifierExecutionPolicySha256,
  type NativeRuntimeDependencyManifest,
  type NativeRuntimeDependencyManifests,
  type NativeVerifierExecutionPolicy,
} from './native-verifier-execution-policy.js';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const bridgeRoot = resolve(moduleDirectory, '..', '..');
const consensusSourceLockPath = resolve(
  bridgeRoot,
  'sources',
  'consensus-source-lock.json',
);
const consensusSourceLock = JSON.parse(readFileSync(
  consensusSourceLockPath,
  'utf8',
)) as {
  frontier: {
    commit: string;
    cargoLockBlob: string;
    patchSha256: string;
  };
};

export interface NativeVerifierAttestationExecutionFixture {
  packet: NativeVerifierAttestationPacket;
  profile: NativeVerifierAttestationValidationReport;
  policy: NativeVerifierExecutionPolicy;
  manifests: NativeRuntimeDependencyManifests;
  verifierPath: string;
  codecPath: string;
  launcherPath: string;
  dispose(): void;
}

export interface NativeVerifierAttestationExecutionFixtureWithPolicy<Policy> {
  packet: NativeVerifierAttestationPacket;
  profile: NativeVerifierAttestationValidationReport;
  policy: Policy;
  manifests: NativeRuntimeDependencyManifests;
  verifierPath: string;
  codecPath: string;
  launcherPath: string;
  dispose(): void;
}

export function createNativeVerifierAttestationExecutionFixture():
NativeVerifierAttestationExecutionFixture {
  return createNativeVerifierAttestationExecutionFixtureWithPolicy<NativeVerifierExecutionPolicy>({
    createPolicy: executionPolicy,
    derivePolicySha256: deriveNativeVerifierExecutionPolicySha256,
  });
}

export function createNativeVerifierAttestationExecutionFixtureWithPolicy<Policy>(
  options: {
    createPolicy(
      statement: NativeVerifierAttestationStatement,
      manifests: NativeRuntimeDependencyManifests,
    ): Policy;
    derivePolicySha256(policy: Policy): string;
  },
): NativeVerifierAttestationExecutionFixtureWithPolicy<Policy> {
  const root = mkdtempSync(join(tmpdir(), 'e2s-native-policy-fixture-'));
  try {
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
        consensusSourceLockSha256: sha256File(consensusSourceLockPath),
        frontierCommit: consensusSourceLock.frontier.commit,
        frontierPatchSha256: consensusSourceLock.frontier.patchSha256,
        cargoLockGitBlobId: consensusSourceLock.frontier.cargoLockBlob,
        verifierSourceManifestSha256: deriveNativeVerifierSourceManifestSha256(
          JSON.parse(readFileSync(consensusSourceLockPath, 'utf8')) as unknown,
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
        nativeCheckpointVectorSha256: sha256File(resolve(
          bridgeRoot,
          'relayer',
          'test-vectors',
          'native-finalized-bridge-checkpoint-v2.json',
        )),
        frontierBurnVectorSha256: sha256File(resolve(
          bridgeRoot,
          'relayer',
          'test-vectors',
          'frontier-bridge-event-root-v1.json',
        )),
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
    const launcherPath = 'C:\\trusted\\bridge-contained-launcher.exe';
    const policy = options.createPolicy(statement, manifests);
    statement.executionPolicySha256 = options.derivePolicySha256(policy);
    const attestorLock = attestorPolicy(
      profileId,
      builderPublic,
      reviewerPublic,
    );
    const message = canonicalNativeVerifierAttestationMessage(statement);
    const packet: NativeVerifierAttestationPacket = {
      statement,
      statementDigestHex: sha256(message),
      signatures: {
        builder: {
          keyIdHex: builderPublic.keyIdHex,
          signatureHex: signMessage(null, message, builder.privateKey).toString('hex'),
        },
        reviewer: {
          keyIdHex: reviewerPublic.keyIdHex,
          signatureHex: signMessage(null, message, reviewer.privateKey).toString('hex'),
        },
      },
    };
    const profile = validateNativeVerifierAttestationAgainstPolicy({
      bridgeRoot,
      attestorLock,
      packet,
      verifierExecutablePath: verifierPath,
      codecExecutablePath: codecPath,
      evaluatedAt: '2026-07-12T12:00:00.000Z',
    });
    return {
      packet,
      profile,
      policy,
      manifests,
      verifierPath,
      codecPath,
      launcherPath,
      dispose: () => rmSync(root, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
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

function attestorPolicy(
  profileId: string,
  builder: { keyIdHex: string; spkiDerHex: string },
  reviewer: { keyIdHex: string; spkiDerHex: string },
): NativeVerifierAttestorLock {
  return {
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
        keyIdHex: builder.keyIdHex,
        publicKeySpkiDerHex: builder.spkiDerHex,
      },
      reviewer: {
        role: 'independent-reviewer',
        organizationId: 'review-organization',
        keyIdHex: reviewer.keyIdHex,
        publicKeySpkiDerHex: reviewer.spkiDerHex,
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

function publicKey(key: ReturnType<typeof generateKeyPairSync>['publicKey']): {
  keyIdHex: string;
  spkiDerHex: string;
} {
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
