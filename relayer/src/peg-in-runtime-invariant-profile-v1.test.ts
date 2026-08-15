import {
  createHash,
  generateKeyPairSync,
  sign as signMessage,
  type KeyObject,
} from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  assertPegInRuntimeInvariantReviewValidationProvenanceV1,
  assertPegInRuntimeInvariantSourceBindingMatchesRepositoryV1,
  assertReviewedPegInRuntimeInvariantProfileProvenanceV1,
  canonicalPegInRuntimeInvariantReviewMessageV1,
  derivePegInRuntimeInvariantAbiBindingsV1,
  derivePegInRuntimeInvariantReviewPacketSha256HexV1,
  derivePegInRuntimeInvariantReviewerPolicyDigestHexV1,
  derivePegInRuntimeInvariantSourceBindingV1,
  derivePegInRuntimeInvariantSourceBindingDigestHexV1,
  loadPegInRuntimeInvariantReviewerLockV1,
  validatePegInRuntimeInvariantReviewAgainstPolicyV1,
  validatePegInRuntimeInvariantReviewerLockV1,
  verifyReviewedPegInRuntimeInvariantProfileV1,
  type PegInRuntimeInvariantProfileV1,
  type PegInRuntimeInvariantReviewerLockV1,
  type PegInRuntimeInvariantReviewPacketV1,
} from './peg-in-runtime-invariant-profile-v1.js';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const BRIDGE_ROOT = resolve(MODULE_DIRECTORY, '..', '..');

describe('peg-in runtime invariant profile V1', () => {
  const fixture = createFixture();

  it('binds exact native post-execution and EVM write-before-mint semantics without authority', () => {
    const report = validate(fixture.packet);
    expect(report).toMatchObject({
      status: 'VALIDATED_NON_AUTHORIZING_RUNTIME_INVARIANT_REVIEW',
      profileId: fixture.statement.profileId,
      reviewId: fixture.statement.reviewId,
      reviewPacketSha256Hex:
        derivePegInRuntimeInvariantReviewPacketSha256HexV1(fixture.packet),
      reviewerPolicyDigestHex:
        derivePegInRuntimeInvariantReviewerPolicyDigestHexV1(
          fixture.reviewerLock,
        ),
      runtime: fixture.statement.runtime,
      source: fixture.statement.source,
      semanticBindings: {
        nativeRecordIsPostExecutionEvidence: true,
        evmReplayWritePrecedesExternalTokenMint: true,
        failedMintRollsBackEvmReplayWriteAndEvent: true,
        directTokenMintEntrypointEnumerated: true,
        ownershipMutationEntrypointsEnumerated: true,
        deployedTokenOwnershipRemainsExternalEvidence: true,
        eventAloneDoesNotProveTokenMint: true,
        wholeBlockCallbackRollbackRemainsExternalEvidence: true,
        reproducibleSolidityBuildClosureRemainsExternalEvidence: true,
      },
      boundary: {
        relativeToSuppliedPolicy: true,
        canonicalSourceOwnedReviewerRootsLoaded: false,
        exactSourceBindingApprovedByPolicy: true,
        currentRepositorySourceBytesVerifiedByThisValidator: false,
        reviewerSignatureVerified: true,
        organizationalIndependenceCryptographicallyProven: false,
        deployedBridgeCodeVerified: false,
        deployedTokenCodeVerified: false,
        deployedTokenOwnershipVerified: false,
        completeHistoricalTokenOwnershipVerified: false,
        wholeBlockCallbackRollbackVerified: false,
        reproducibleSolidityBuildClosureVerified: false,
        sidechainFinalityVerified: false,
        runtimeCodeStateProofVerified: false,
        runtimeUpgradeHistoryVerified: false,
        historicalMintAbsenceVerified: false,
        committedVaultTransitionVerified: false,
        mintAuthorized: false,
        admissionEligible: false,
        gate5Closed: false,
        productionReady: false,
      },
    });
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.source)).toBe(true);
    expect(() =>
      assertPegInRuntimeInvariantReviewValidationProvenanceV1(report),
    ).not.toThrow();
    expect(() =>
      assertReviewedPegInRuntimeInvariantProfileProvenanceV1(report),
    ).toThrow(/reviewed.*provenance/i);
  });

  it('derives selectors, topic, and exact repository source identities', () => {
    const abi = derivePegInRuntimeInvariantAbiBindingsV1(BRIDGE_ROOT);
    expect(abi.bridgeMintSelectorHex).toMatch(/^0x[0-9a-f]{8}$/);
    expect(abi.tokenMintSelectorHex).toMatch(/^0x[0-9a-f]{8}$/);
    expect(abi.eventTopicHex).toMatch(/^0x[0-9a-f]{64}$/);
    expect(fixture.statement.evmMint).toMatchObject(abi);

    const source = derivePegInRuntimeInvariantSourceBindingV1(BRIDGE_ROOT);
    expect(source).toEqual(fixture.statement.source);
    expect(() =>
      assertPegInRuntimeInvariantSourceBindingMatchesRepositoryV1(
        BRIDGE_ROOT,
        source,
      ),
    ).not.toThrow();
    expect(source.frontierCommitHex).toMatch(/^[0-9a-f]{40}$/);
    for (const [field, digest] of Object.entries(source)) {
      if (field !== 'frontierCommitHex') {
        expect(digest, field).toMatch(/^0x[0-9a-f]{64}$/);
      }
    }
  });

  it('rejects Frontier patch-byte drift even when the source lock is unchanged', () => {
    const temporaryRoot = mkdtempSync(
      resolve(tmpdir(), 'e2s-runtime-invariant-source-'),
    );
    try {
      for (const pathParts of [
        ['sources', 'consensus-source-lock.json'],
        [
          'sources',
          'frontier',
          '0001-bridge-runtime-commitment.patch',
        ],
        ['solidity', 'ErgoBridge.sol'],
        ['solidity', 'compiled', 'ErgoBridge.abi'],
        ['solidity', 'compiled', 'ErgoBridge.bin'],
        ['solidity', 'SERG.sol'],
        ['solidity', 'compiled', 'SERG.abi'],
        ['solidity', 'compiled', 'SERG.bin'],
      ] as const) {
        const source = resolve(BRIDGE_ROOT, ...pathParts);
        const target = resolve(temporaryRoot, ...pathParts);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(source, target);
      }
      writeFileSync(
        resolve(
          temporaryRoot,
          'sources',
          'frontier',
          '0001-bridge-runtime-commitment.patch',
        ),
        'tampered patch bytes',
        'utf8',
      );
      expect(() =>
        derivePegInRuntimeInvariantSourceBindingV1(temporaryRoot),
      ).toThrow(/patch bytes do not match/i);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('keeps the canonical source-owned reviewer registry empty and fail-closed', () => {
    const lock = loadPegInRuntimeInvariantReviewerLockV1();
    expect(validatePegInRuntimeInvariantReviewerLockV1(lock).profiles)
      .toEqual([]);
    expect(() => verifyReviewedPegInRuntimeInvariantProfileV1({
      packet: fixture.packet,
      // @ts-expect-error canonical validation never accepts a caller clock
      evaluatedAt: '2026-07-17T14:00:00.000Z',
    })).toThrow(/no active profile/i);
  });

  it('rejects invalid signatures, reviewer drift, revoked policy, and stale review windows', () => {
    const invalidSignature = structuredClone(
      fixture.packet,
    ) as MutablePacket;
    invalidSignature.signature.signatureHex = '0'.repeat(128);
    expect(() => validate(invalidSignature)).toThrow(/signature is invalid/i);

    const wrongReviewer = structuredClone(
      fixture.statement,
    ) as MutableProfile;
    wrongReviewer.reviewer.organizationId = 'different-reviewer';
    expect(() => validate(fixture.signStatement(wrongReviewer)))
      .toThrow(/does not match the reviewer lock/i);

    const revoked = structuredClone(
      fixture.reviewerLock,
    ) as MutableReviewerLock;
    revoked.profiles[0]!.status = 'revoked';
    expect(() => validate(fixture.packet, revoked))
      .toThrow(/no active profile/i);

    expect(() => validate(
      fixture.packet,
      fixture.reviewerLock,
      '2027-01-02T00:00:00.000Z',
    )).toThrow(/validity window/i);
  });

  it('rejects source, ABI, runtime, and unknown-field substitutions', () => {
    const source = structuredClone(fixture.statement) as MutableProfile;
    source.source.frontierPatchSha256Hex = hex('aa');
    expect(() => validate(fixture.signStatement(source)))
      .toThrow(/runtime\/source binding.*not approved/i);

    const selector = structuredClone(fixture.statement) as MutableProfile;
    selector.evmMint.bridgeMintSelectorHex = '0x00000000';
    expect(() => validate(fixture.signStatement(selector)))
      .toThrow(/selectors or event topic/i);

    const runtime = structuredClone(fixture.statement) as MutableProfile;
    runtime.runtime.artifactSizeBytes = '01';
    expect(() => validate(fixture.signStatement(runtime)))
      .toThrow(/positive canonical safe integer/i);

    const unknown = structuredClone(fixture.statement) as
      PegInRuntimeInvariantProfileV1 & { verified: boolean };
    unknown.verified = true;
    expect(() => validate(fixture.signUnknownStatement(unknown)))
      .toThrow(/exactly the supported fields/i);
  });

  it('rejects replay-key, native timing, and EVM atomicity weakening one field at a time', () => {
    const mutations: Array<{
      label: string;
      mutate(statement: MutableProfile): void;
      expected: RegExp;
    }> = [
      {
        label: 'replay domain',
        mutate: statement => {
          statement.nativeRecord.replayKeyDomain =
            'E2S_PEG_IN_RECORD_KEY_V2' as typeof statement.nativeRecord.replayKeyDomain;
        },
        expected: /replay-key domain/i,
      },
      {
        label: 'replay field order',
        mutate: statement => {
          statement.nativeRecord.replayKeyComponents =
            ['domain', 'ergoBoxId', 'sidechainId'] as never;
        },
        expected: /replay-key components/i,
      },
      {
        label: 'storage hasher',
        mutate: statement => {
          statement.nativeRecord.storageHasher =
            'Identity' as typeof statement.nativeRecord.storageHasher;
        },
        expected: /native storage hasher/i,
      },
      {
        label: 'native record timing',
        mutate: statement => {
          statement.nativeRecord.recordWrittenAfterSuccessfulEvmExecution =
            false as true;
        },
        expected: /recordWrittenAfterSuccessfulEvmExecution/i,
      },
      {
        label: 'EVM replay ordering',
        mutate: statement => {
          statement.evmMint.replayWriteBeforeExternalTokenMint = false as true;
        },
        expected: /replayWriteBeforeExternalTokenMint/i,
      },
      {
        label: 'failed mint rollback',
        mutate: statement => {
          statement.evmMint.failedTokenMintRollsBackReplayWriteAndEvent =
            false as true;
        },
        expected: /failedTokenMintRollsBackReplayWriteAndEvent/i,
      },
      {
        label: 'event ordering',
        mutate: statement => {
          statement.evmMint.eventEmittedAfterTokenMint = false as true;
        },
        expected: /eventEmittedAfterTokenMint/i,
      },
    ];
    for (const mutation of mutations) {
      const statement = structuredClone(
        fixture.statement,
      ) as MutableProfile;
      mutation.mutate(statement);
      expect(
        () => validate(fixture.signUnknownStatement(statement)),
        mutation.label,
      ).toThrow(mutation.expected);
    }
  });

  it('rejects incomplete mint and ownership-control inventories', () => {
    const missingDirectMint = structuredClone(
      fixture.statement,
    ) as MutableProfile;
    missingDirectMint.mintEntrypoints.manifest.pop();
    expect(() => validate(fixture.signUnknownStatement(missingDirectMint)))
      .toThrow(/bridge and direct token mint routes exactly/i);

    const alternateMint = structuredClone(
      fixture.statement,
    ) as MutableProfile;
    alternateMint.mintEntrypoints.alternateUnboundMintEntrypointCount =
      1 as 0;
    expect(() => validate(fixture.signStatement(alternateMint)))
      .toThrow(/alternate unbound mint entrypoint count/i);

    const missingOwnershipRoute = structuredClone(
      fixture.statement,
    ) as MutableProfile;
    missingOwnershipRoute.mintEntrypoints.ownershipMutationEntrypoints.pop();
    expect(() =>
      validate(fixture.signUnknownStatement(missingOwnershipRoute)),
    ).toThrow(/ownership-mutation entrypoints/i);

    const proxyRoute = structuredClone(
      fixture.statement,
    ) as MutableProfile;
    proxyRoute.mintEntrypoints.proxyDelegateOrFallbackMintRouteCount =
      1 as 0;
    expect(() => validate(fixture.signStatement(proxyRoute)))
      .toThrow(/proxy, delegate, or fallback/i);

    const ownershipNotRequired = structuredClone(
      fixture.statement,
    ) as MutableProfile;
    ownershipNotRequired.mintEntrypoints.requiredDeployedBindings
      .tokenOwnerEqualsReviewedBridge = false as true;
    expect(() => validate(fixture.signStatement(ownershipNotRequired)))
      .toThrow(/tokenOwnerEqualsReviewedBridge/i);
  });

  it('rejects review and authority-claim inflation', () => {
    const decision = structuredClone(fixture.statement) as MutableProfile;
    decision.decision.completeMintEntrypointInventoryReviewed = false as true;
    expect(() => validate(fixture.signStatement(decision)))
      .toThrow(/completeMintEntrypointInventoryReviewed/i);

    const deployed = structuredClone(fixture.statement) as MutableProfile;
    deployed.boundaries.deployedTokenOwnershipVerified = true as false;
    expect(() => validate(fixture.signStatement(deployed)))
      .toThrow(/deployedTokenOwnershipVerified/i);

    const rollback = structuredClone(fixture.statement) as MutableProfile;
    rollback.boundaries.wholeBlockCallbackRollbackVerified = true as false;
    expect(() => validate(fixture.signStatement(rollback)))
      .toThrow(/wholeBlockCallbackRollbackVerified/i);

    const mint = structuredClone(fixture.statement) as MutableProfile;
    mint.boundaries.mintAuthorized = true as false;
    expect(() => validate(fixture.signStatement(mint)))
      .toThrow(/mintAuthorized/i);

    const gate = structuredClone(fixture.statement) as MutableProfile;
    gate.boundaries.gate5Closed = true as false;
    expect(() => validate(fixture.signStatement(gate)))
      .toThrow(/gate5Closed/i);
  });

  it('rejects cloned validation provenance', () => {
    const report = validate(fixture.packet);
    expect(() =>
      assertPegInRuntimeInvariantReviewValidationProvenanceV1(
        structuredClone(report),
      ),
    ).toThrow(/provenance is missing/i);
  });

  function validate(
    packet: PegInRuntimeInvariantReviewPacketV1,
    reviewerLock = fixture.reviewerLock,
    evaluatedAt = '2026-07-17T14:00:00.000Z',
  ) {
    return validatePegInRuntimeInvariantReviewAgainstPolicyV1({
      reviewerLock,
      packet,
      evaluatedAt,
    });
  }
});

type MutableProfile = any;
type MutablePacket = any;
type MutableReviewerLock = any;

function createFixture() {
  const reviewer = generateKeyPairSync('ed25519');
  const publicDer = reviewer.publicKey.export({
    type: 'spki',
    format: 'der',
  });
  const keyIdHex = sha256(publicDer);
  const abi = derivePegInRuntimeInvariantAbiBindingsV1(BRIDGE_ROOT);
  const statement: PegInRuntimeInvariantProfileV1 = {
    schema: 'e2s.peg-in-runtime-invariant-profile.v1',
    profileId: 'frontier-peg-in-invariants-v1',
    reviewId: 'frontier-peg-in-invariants-2026-07-17-01',
    reviewedAt: '2026-07-17T13:00:00.000Z',
    canonicalization: 'e2s-canonical-json-v1',
    signatureAlgorithm: 'ed25519',
    runtime: {
      artifactSha256Hex: hex('11'),
      artifactSizeBytes: '1048576',
      buildAttestationId: 'frontier-runtime-build-2026-07-17-01',
      buildAttestationSha256Hex: hex('22'),
    },
    source: derivePegInRuntimeInvariantSourceBindingV1(BRIDGE_ROOT),
    nativeRecord: {
      pallet: 'BridgeCommitment',
      callback: 'OnBlockStored::on_block_stored',
      storageMap: 'ProcessedPegIns',
      storageHasher: 'Blake2_128Concat',
      storagePrefixHex:
        '0xaf86fef4216ac2bcd1c592b204011ad0e683c528c6fc8006645fa5989173f2e0',
      replayKeyHash: 'Blake2b256',
      replayKeyDomain: 'E2S_PEG_IN_RECORD_KEY_V1',
      replayKeyComponents: ['domain', 'sidechainId', 'ergoBoxId'],
      recordWrittenAfterSuccessfulEvmExecution: true,
      allFallibleValidationBeforeNativeMutation: true,
      priorRecordCausesCallbackErrorBeforeNativeMutation: true,
      recordsMonotonicAndNeverDeleted: true,
      nativeRecordIsNotTheEvmWriteBeforeMintGuard: true,
    },
    evmMint: {
      bridgeContract: 'ErgoBridge',
      bridgeMintSignature: 'mintSERG(address,uint256,bytes32)',
      bridgeMintSelectorHex: abi.bridgeMintSelectorHex,
      replayMapping: 'processedPegIns(bytes32)',
      replayWriteBeforeExternalTokenMint: true,
      tokenContract: 'SERG',
      tokenMintSignature: 'mint(address,uint256)',
      tokenMintSelectorHex: abi.tokenMintSelectorHex,
      eventSignature: 'PegIn(address,uint256,bytes32)',
      eventTopicHex: abi.eventTopicHex,
      eventEmittedAfterTokenMint: true,
      sameEvmTransaction: true,
      failedTokenMintRollsBackReplayWriteAndEvent: true,
    },
    mintEntrypoints: {
      manifest: [
        {
          contract: 'ErgoBridge',
          signature: 'mintSERG(address,uint256,bytes32)',
          authorization: 'onlyOwner',
          role: 'bridge-orchestrated-mint',
        },
        {
          contract: 'SERG',
          signature: 'mint(address,uint256)',
          authorization: 'onlyOwner',
          role: 'token-mint',
        },
      ],
      completeSourceInventoryReviewed: true,
      alternateUnboundMintEntrypointCount: 0,
      ownershipMutationEntrypoints: [
        'ErgoBridge.renounceOwnership()',
        'ErgoBridge.transferOwnership(address)',
        'SERG.renounceOwnership()',
        'SERG.transferOwnership(address)',
      ],
      proxyDelegateOrFallbackMintRouteCount: 0,
      requiredDeployedBindings: {
        bridgeSergTokenEqualsReviewedToken: true,
        tokenOwnerEqualsReviewedBridge: true,
        exactBridgeRuntimeCodeRequired: true,
        exactTokenRuntimeCodeRequired: true,
        independentlyObservedImmediatelyBeforeMintAdmission: true,
      },
    },
    decision: {
      status: 'PASS',
      exactReviewedRepositoryFilesBound: true,
      replayIdentityInvariantReviewed: true,
      evmWriteBeforeMintInvariantReviewed: true,
      failedMintRollbackInvariantReviewed: true,
      completeMintEntrypointInventoryReviewed: true,
      nativePostExecutionRecordSemanticsReviewed: true,
    },
    reviewer: {
      keyIdHex,
      organizationId: 'independent-runtime-review',
    },
    boundaries: {
      sourceSemanticsReviewOnly: true,
      deployedBridgeCodeVerified: false,
      deployedTokenCodeVerified: false,
      deployedTokenOwnershipVerified: false,
      completeHistoricalTokenOwnershipVerified: false,
      wholeBlockCallbackRollbackVerified: false,
      reproducibleSolidityBuildClosureVerified: false,
      sidechainFinalityVerified: false,
      runtimeCodeStateProofVerified: false,
      runtimeUpgradeHistoryVerified: false,
      historicalMintAbsenceVerified: false,
      committedVaultTransitionVerified: false,
      mintAuthorized: false,
      admissionEligible: false,
      gate5Closed: false,
      productionReady: false,
    },
  };
  const reviewerLock: PegInRuntimeInvariantReviewerLockV1 = {
    schemaVersion: 1,
    kind: 'bridge-peg-in-runtime-invariant-reviewer-lock',
    canonicalization: 'e2s-canonical-json-v1',
    signatureAlgorithm: 'ed25519',
    profiles: [{
      profileId: 'frontier-peg-in-invariants-v1',
      status: 'active',
      validFrom: '2026-07-01T00:00:00.000Z',
      validUntil: '2027-01-01T00:00:00.000Z',
      reviewer: {
        role: 'independent-runtime-invariant-reviewer',
        organizationId: 'independent-runtime-review',
        keyIdHex,
        publicKeySpkiDerHex: publicDer.toString('hex'),
      },
      forbiddenAuthorityKeyIds: [sha256(Buffer.from('bridge-authority'))],
      approvedRuntimeSourceBindings: [{
        runtimeArtifactSha256Hex: statement.runtime.artifactSha256Hex,
        runtimeArtifactSizeBytes: statement.runtime.artifactSizeBytes,
        buildAttestationId: statement.runtime.buildAttestationId,
        buildAttestationSha256Hex:
          statement.runtime.buildAttestationSha256Hex,
        sourceBindingDigestHex:
          derivePegInRuntimeInvariantSourceBindingDigestHexV1(
            statement.source,
          ),
      }],
    }],
    boundaries: {
      runtimeProfilesCannotAddTrustRoots: true,
      signaturesDoNotProveOrganizationalIndependence: true,
      sourceReviewDoesNotVerifyDeployedCodeOrOwnership: true,
      runtimeHistoryAndCommittedVaultRemainRequired: true,
    },
  };
  const signUnknownStatement = (
    value: unknown,
  ): PegInRuntimeInvariantReviewPacketV1 => {
    const message = Buffer.concat([
      Buffer.from('E2S_PEG_IN_RUNTIME_INVARIANT_REVIEW_V1\0', 'utf8'),
      Buffer.from(canonicalJson(value), 'utf8'),
    ]);
    return {
      schema: 'e2s.peg-in-runtime-invariant-review-packet.v1',
      statement: value as PegInRuntimeInvariantProfileV1,
      statementDigestHex: prefixedSha256(message),
      signature: {
        keyIdHex,
        signatureHex: signMessage(
          null,
          message,
          reviewer.privateKey,
        ).toString('hex'),
      },
    };
  };
  const signStatement = (
    value: PegInRuntimeInvariantProfileV1,
  ): PegInRuntimeInvariantReviewPacketV1 => {
    const message = canonicalPegInRuntimeInvariantReviewMessageV1(value);
    return {
      schema: 'e2s.peg-in-runtime-invariant-review-packet.v1',
      statement: structuredClone(value),
      statementDigestHex: prefixedSha256(message),
      signature: {
        keyIdHex,
        signatureHex: signMessage(
          null,
          message,
          reviewer.privateKey,
        ).toString('hex'),
      },
    };
  };
  return {
    statement,
    reviewerLock,
    packet: signStatement(statement),
    signStatement,
    signUnknownStatement,
    reviewerPrivateKey: reviewer.privateKey,
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite JSON number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(
      key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`,
    ).join(',')}}`;
  }
  throw new Error('unsupported JSON value');
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function prefixedSha256(value: Buffer): string {
  return `0x${sha256(value)}`;
}

function hex(byte: string): string {
  return `0x${byte.repeat(32)}`;
}
