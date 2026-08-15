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
  canonicalPegInRuntimeBuildAttestationMessage,
  derivePegInRuntimeBuildAttestationPacketSha256Hex,
  derivePegInRuntimeSourceManifestSha256,
  validatePegInRuntimeBuildAttestationAgainstPolicy,
  type PegInRuntimeBuildAttestationPacket,
  type PegInRuntimeBuildAttestationStatement,
  type PegInRuntimeBuildAttestationValidationReport,
  type PegInRuntimeBuildAttestorLock,
} from './peg-in-runtime-build-attestation.js';
import {
  deriveNativeVerifierSourceManifestSha256,
} from './independently-attested-native-verifier-profile.js';

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

export interface PegInRuntimeBuildAttestationFixture {
  bridgeRoot: string;
  runtimeCodePath: string;
  packet: PegInRuntimeBuildAttestationPacket;
  report: PegInRuntimeBuildAttestationValidationReport;
  attestorLock: PegInRuntimeBuildAttestorLock;
  packetSha256Hex: string;
  signStatement(
    statement: PegInRuntimeBuildAttestationStatement,
  ): PegInRuntimeBuildAttestationPacket;
  dispose(): void;
}

export function createPegInRuntimeBuildAttestationFixture():
PegInRuntimeBuildAttestationFixture {
  const root = mkdtempSync(join(tmpdir(), 'e2s-runtime-attestation-'));
  try {
    const runtimeCodePath = join(root, 'frontier-template-runtime.compact.wasm');
    writeFileSync(runtimeCodePath, Buffer.from('synthetic-reviewed-runtime-wasm'));
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
        runtimeManifestBlob: string;
      };
    };
    const statement: PegInRuntimeBuildAttestationStatement = {
      schema: 'e2s.peg-in-runtime-build-attestation-statement.v1',
      profileId: 'frontier-runtime-build-v1',
      attestationId: 'frontier-runtime-2026-07-17-review-01',
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
        runtimeManifestGitBlobId: sourceLock.frontier.runtimeManifestBlob,
        completeSourceManifestSha256:
          deriveNativeVerifierSourceManifestSha256(sourceLock),
        runtimeSourceManifestSha256:
          derivePegInRuntimeSourceManifestSha256(sourceLock),
      },
      dependencies: {
        mode: 'vendored-content-addressed',
        manifestSha256: hash('1'),
        crateCount: 512,
        cargoLocked: true,
        cargoOffline: true,
        cargoFrozen: true,
        sharedMutableCacheUsed: false,
      },
      tools: {
        completeClosureManifestSha256: hash('2'),
        toolCount: 24,
        includesRustc: true,
        includesCargo: true,
        includesLinker: true,
        includesWasmOptimizer: true,
        includesInvokedHelpers: true,
      },
      build: {
        platform: 'win32-x64',
        wasmRustTarget: 'wasm32-unknown-unknown',
        profile: 'release',
        cargoArguments: [
          'build',
          '--locked',
          '--offline',
          '--frozen',
          '--release',
          '-p',
          'frontier-template-node',
        ],
        workingTreeIdentitySha256: hash('3'),
        environmentAllowlistSha256: hash('4'),
        freshEmptyTarget: true,
        preexistingOutputsRejected: true,
        sourceValidatedBeforeAndAfter: true,
      },
      artifact: {
        role: 'frontier-template-runtime-compact-wasm',
        sha256: sha256(readFileSync(runtimeCodePath)),
        sizeBytes: readFileSync(runtimeCodePath).length,
      },
      conformance: {
        pegInRuntimeIdentityVectorSha256: sha256(readFileSync(VECTOR_PATH)),
        outputManifestSha256: hash('5'),
        status: 'PASS',
      },
      actors: {
        builderKeyIdHex: builderPublic.keyIdHex,
        builderOrganizationId: 'runtime-build-organization',
        reviewerKeyIdHex: reviewerPublic.keyIdHex,
        reviewerOrganizationId: 'runtime-review-organization',
      },
      boundaries: {
        externalBuildPerformed: true,
        independentReproductionPerformed: true,
        completeBuildToolClosureAttested: true,
        dependencyClosureAttested: true,
        runtimeCodeArtifactReviewed: true,
        nativeVerifierAttestedSeparately: true,
        runtimeUpgradeHistoryVerified: false,
        cutoverPolicyVerified: false,
        historicalMintAbsenceVerified: false,
        committedVaultTransitionVerified: false,
        mintAuthorityGranted: false,
        admissionEligible: false,
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
      nextStatement: PegInRuntimeBuildAttestationStatement,
    ): PegInRuntimeBuildAttestationPacket =>
      signedPacket(nextStatement, builder.privateKey, reviewer.privateKey);
    const packet = signStatement(statement);
    const report = validatePegInRuntimeBuildAttestationAgainstPolicy({
      bridgeRoot: BRIDGE_ROOT,
      attestorLock,
      packet,
      runtimeCodePath,
      evaluatedAt: '2026-07-17T12:00:00.000Z',
    });
    return {
      bridgeRoot: BRIDGE_ROOT,
      runtimeCodePath,
      packet,
      report,
      attestorLock,
      packetSha256Hex:
        derivePegInRuntimeBuildAttestationPacketSha256Hex(packet),
      signStatement,
      dispose: () => rmSync(root, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function signedPacket(
  statement: PegInRuntimeBuildAttestationStatement,
  builderPrivateKey: KeyObject,
  reviewerPrivateKey: KeyObject,
): PegInRuntimeBuildAttestationPacket {
  const message = canonicalPegInRuntimeBuildAttestationMessage(statement);
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
): PegInRuntimeBuildAttestorLock {
  return {
    schemaVersion: 1,
    kind: 'bridge-peg-in-runtime-build-attestor-lock',
    canonicalization: 'e2s-canonical-json-v1',
    signatureAlgorithm: 'ed25519',
    profiles: [{
      profileId,
      status: 'active',
      validFrom: '2026-07-01T00:00:00.000Z',
      validUntil: '2027-01-01T00:00:00.000Z',
      builder: {
        role: 'builder',
        organizationId: 'runtime-build-organization',
        keyIdHex: builder.keyIdHex,
        publicKeySpkiDerHex: builder.spkiDerHex,
      },
      reviewer: {
        role: 'independent-reviewer',
        organizationId: 'runtime-review-organization',
        keyIdHex: reviewer.keyIdHex,
        publicKeySpkiDerHex: reviewer.spkiDerHex,
      },
      forbiddenAuthorityKeyIds: [hash('f')],
    }],
    boundaries: {
      runtimeProfilesCannotAddTrustRoots: true,
      cryptographyDoesNotProveOrganizationalIndependence: true,
      runtimeUpgradeHistoryRequiredForHistoricalAbsence: true,
      cutoverPolicyRequiredForMintAuthority: true,
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
