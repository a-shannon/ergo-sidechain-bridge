import {
  createHash,
  generateKeyPairSync,
  sign as signMessage,
  type KeyObject,
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
  deriveNativeVerifierSourceManifestSha256,
  type NativeVerifierAttestorLock,
} from './independently-attested-native-verifier-profile.js';
import {
  canonicalNativePegInRuntimeIdentityV2AttestationMessage,
  validateNativePegInRuntimeIdentityV2AttestationAgainstPolicy,
  type NativePegInRuntimeIdentityV2AttestationPacket,
  type NativePegInRuntimeIdentityV2AttestationStatement,
  type NativePegInRuntimeIdentityV2AttestationValidationReport,
} from './native-peg-in-runtime-identity-v2-verifier-attestation.js';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const BRIDGE_ROOT = resolve(MODULE_DIRECTORY, '..', '..');
const SOURCE_LOCK_PATH = resolve(
  BRIDGE_ROOT,
  'sources',
  'consensus-source-lock.json',
);
const VECTOR_PATH = resolve(
  BRIDGE_ROOT,
  'relayer',
  'test-vectors',
  'native-finalized-peg-in-runtime-identity-v2.json',
);

export interface NativePegInRuntimeIdentityV2VerifierAttestationFixture {
  bridgeRoot: string;
  verifierExecutablePath: string;
  packet: NativePegInRuntimeIdentityV2AttestationPacket;
  report: NativePegInRuntimeIdentityV2AttestationValidationReport;
  attestorLock: NativeVerifierAttestorLock;
  signStatement(
    statement: NativePegInRuntimeIdentityV2AttestationStatement,
  ): NativePegInRuntimeIdentityV2AttestationPacket;
  dispose(): void;
}

export function createNativePegInRuntimeIdentityV2VerifierAttestationFixture():
NativePegInRuntimeIdentityV2VerifierAttestationFixture {
  const root = mkdtempSync(join(tmpdir(), 'e2s-native-v2-attestation-'));
  try {
    const verifierExecutablePath = join(
      root,
      process.platform === 'win32' ? 'native-v2-verifier.exe' : 'native-v2-verifier',
    );
    writeFileSync(
      verifierExecutablePath,
      Buffer.from('synthetic-reviewed-native-v2-verifier'),
    );

    const builder = generateKeyPairSync('ed25519');
    const reviewer = generateKeyPairSync('ed25519');
    const builderPublic = publicKey(builder.publicKey);
    const reviewerPublic = publicKey(reviewer.publicKey);
    const sourceLockBytes = readFileSync(SOURCE_LOCK_PATH);
    const sourceLock = JSON.parse(sourceLockBytes.toString('utf8')) as {
      frontier: {
        commit: string;
        patchSha256: string;
        cargoLockBlob: string;
      };
    };
    const artifactBytes = readFileSync(verifierExecutablePath);
    const statement: NativePegInRuntimeIdentityV2AttestationStatement = {
      schema: 'e2s.native-peg-in-runtime-identity-v2-attestation-statement.v1',
      profileId: 'native-peg-in-runtime-identity-v2-win32-x64-v1',
      attestationId: 'native-peg-in-runtime-identity-v2-2026-07-17-review-01',
      canonicalization: 'e2s-canonical-json-v1',
      signatureAlgorithm: 'ed25519',
      timestamps: {
        builtAt: '2026-07-17T09:00:00.000Z',
        reviewedAt: '2026-07-17T11:00:00.000Z',
      },
      source: {
        consensusSourceLockSha256: sha256(sourceLockBytes),
        frontierCommit: sourceLock.frontier.commit,
        frontierPatchSha256: sourceLock.frontier.patchSha256,
        cargoLockGitBlobId: sourceLock.frontier.cargoLockBlob,
        verifierSourceManifestSha256:
          deriveNativeVerifierSourceManifestSha256(sourceLock),
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
          '--bin',
          'bridge-peg-in-runtime-identity-v2-verifier',
        ],
        workingTreeIdentitySha256: hash('3'),
        environmentAllowlistSha256: hash('4'),
        freshEmptyTarget: true,
        preexistingOutputsRejected: true,
        sourceValidatedBeforeAndAfter: true,
      },
      artifact: {
        role: 'bridge-peg-in-runtime-identity-v2-verifier',
        sha256: sha256(artifactBytes),
        sizeBytes: artifactBytes.length,
      },
      executionPolicySha256: hash('5'),
      conformance: {
        pegInRuntimeIdentityVectorSha256: sha256(readFileSync(VECTOR_PATH)),
        outputManifestSha256: hash('6'),
        status: 'PASS',
      },
      actors: {
        builderKeyIdHex: builderPublic.keyIdHex,
        builderOrganizationId: 'native-v2-build-organization',
        reviewerKeyIdHex: reviewerPublic.keyIdHex,
        reviewerOrganizationId: 'native-v2-review-organization',
      },
      boundaries: {
        externalBuildPerformed: true,
        independentReproductionPerformed: true,
        completeBuildToolClosureAttested: true,
        dependencyClosureAttested: true,
        nativeV2VerifierArtifactReviewed: true,
        runtimeBuildAttestedSeparately: true,
        executionCapabilityIssued: false,
        targetRuntimeBuildIdentityVerified: false,
        runtimeCodeIdentityVerified: false,
        historicalMintAbsenceVerified: false,
        committedVaultTransitionVerified: false,
        mintAuthorityGranted: false,
        gate5Closed: false,
        productionReady: false,
      },
    };
    const attestorLock = buildAttestorLock(
      statement.profileId,
      builderPublic,
      reviewerPublic,
    );
    const signStatement = (
      nextStatement: NativePegInRuntimeIdentityV2AttestationStatement,
    ): NativePegInRuntimeIdentityV2AttestationPacket => signedPacket(
      nextStatement,
      builder.privateKey,
      reviewer.privateKey,
    );
    const packet = signStatement(statement);
    const report = validateNativePegInRuntimeIdentityV2AttestationAgainstPolicy({
      bridgeRoot: BRIDGE_ROOT,
      attestorLock,
      packet,
      verifierExecutablePath,
      evaluatedAt: '2026-07-17T12:00:00.000Z',
    });
    return {
      bridgeRoot: BRIDGE_ROOT,
      verifierExecutablePath,
      packet,
      report,
      attestorLock,
      signStatement,
      dispose: () => rmSync(root, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function signedPacket(
  statement: NativePegInRuntimeIdentityV2AttestationStatement,
  builderPrivateKey: KeyObject,
  reviewerPrivateKey: KeyObject,
): NativePegInRuntimeIdentityV2AttestationPacket {
  const message =
    canonicalNativePegInRuntimeIdentityV2AttestationMessage(statement);
  return {
    statement: structuredClone(statement),
    statementDigestHex: sha256(message),
    signatures: {
      builder: {
        keyIdHex: statement.actors.builderKeyIdHex,
        signatureHex: signMessage(
          null,
          message,
          builderPrivateKey,
        ).toString('hex'),
      },
      reviewer: {
        keyIdHex: statement.actors.reviewerKeyIdHex,
        signatureHex: signMessage(
          null,
          message,
          reviewerPrivateKey,
        ).toString('hex'),
      },
    },
  };
}

function buildAttestorLock(
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
        organizationId: 'native-v2-build-organization',
        keyIdHex: builder.keyIdHex,
        publicKeySpkiDerHex: builder.spkiDerHex,
      },
      reviewer: {
        role: 'independent-reviewer',
        organizationId: 'native-v2-review-organization',
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

function publicKey(key: KeyObject): {
  keyIdHex: string;
  spkiDerHex: string;
} {
  const der = key.export({ type: 'spki', format: 'der' });
  return {
    keyIdHex: sha256(der),
    spkiDerHex: der.toString('hex'),
  };
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function hash(nibble: string): string {
  return nibble.repeat(64);
}
