import {
  createHash,
  createPublicKey,
  verify,
} from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildSubstrateFederatedCheckpointProfileV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import { canonicalJson } from './strict-json.js';

const mocks = vi.hoisted(() => ({
  sourceHistory: undefined as any,
  ergoHistory: undefined as any,
  trackerInputs: [] as any[],
  trackerCompilerInputs: [] as any[],
  familyCompilerInputs: [] as any[],
  targetInputs: [] as any[],
  ergoHistoryInputs: [] as any[],
  relayerClosureInputs: [] as any[],
  statementInputs: [] as any[],
  baselineInputs: [] as any[],
  replayInputs: [] as any[],
  trackerCompileEntered: undefined as (() => void) | undefined,
  trackerCompileWait: undefined as Promise<void> | undefined,
  tamperRelayerRole: undefined as string | undefined,
  tamperRelayerSetDigest: false,
  ergoAdmissionSigner: undefined as any,
  packetSignerBinding: undefined as any,
  launchStatements: new WeakSet<object>(),
  ergoHistoryV1Provenance: vi.fn((value: any) => {
    if (
      value !== mocks.ergoHistory
      || value?.receipt?.schema
        !== 'e2s.substrate-federated-isolated-devnet-ergo-history-artifacts.v1'
    ) {
      throw new Error(
        'isolated-devnet Ergo history artifacts lack process provenance',
      );
    }
  }),
  ergoHistoryV2Provenance: vi.fn((value: any) => {
    if (
      value !== mocks.ergoHistory
      || value?.receipt?.schema
        !== 'e2s.substrate-federated-isolated-devnet-ergo-history-artifacts.v2'
    ) {
      throw new Error(
        'snapshot-anchored Ergo history artifacts lack process provenance',
      );
    }
  }),
}));

vi.mock(
  './substrate-federated-authority-safe-devnet-history-v1.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('./substrate-federated-authority-safe-devnet-history-v1.js')
    >();
    return {
      ...actual,
      assertSubstrateFederatedAuthoritySafeDevnetHistoryV1Provenance:
        vi.fn((value: unknown) => {
          if (value !== mocks.sourceHistory) {
            throw new Error('authority-safe devnet history provenance is missing');
          }
        }),
    };
  },
);

vi.mock(
  './substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('./substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js')
    >();
    return {
      ...actual,
      assertSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1Provenance:
        mocks.ergoHistoryV1Provenance,
      assertSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2Provenance:
        mocks.ergoHistoryV2Provenance,
    };
  },
);

vi.mock(
  './substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance:
      vi.fn((value: unknown) => {
        if (value !== mocks.ergoAdmissionSigner) {
          throw new Error(
            'isolated setup-check signer binding lacks active process provenance',
          );
        }
      }),
  }),
);

vi.mock(
  './substrate-federated-tracker-compiler-v1.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('./substrate-federated-tracker-compiler-v1.js')
    >();
    return {
      ...actual,
      buildSubstrateFederatedTrackerCompilerRequestV1: vi.fn((input: any) => {
        mocks.trackerInputs.push(input);
        return Object.freeze({
          requestDigestHex: 'a1'.repeat(32),
          trackerNftIdHex: input.trackerGenesisInputBoxIdHex,
          profile: input.profile,
          application: input.application,
        });
      }),
    };
  },
);

vi.mock(
  './substrate-federated-tracker-jvm-compiler-v1.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('./substrate-federated-tracker-jvm-compiler-v1.js')
    >();
    return {
      ...actual,
      compileSubstrateFederatedTrackerWithPinnedJvmV1:
        vi.fn(async (input: any) => {
          mocks.trackerCompilerInputs.push(input);
          mocks.trackerCompileEntered?.();
          await mocks.trackerCompileWait;
          return Object.freeze({
            receiptDigestHex: 'a2'.repeat(32),
            contract: Object.freeze({ contractIdHex: 'a3'.repeat(32) }),
          });
        }),
    };
  },
);

vi.mock(
  './substrate-federated-settlement-family-jvm-compiler-v1.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('./substrate-federated-settlement-family-jvm-compiler-v1.js')
    >();
    return {
      ...actual,
      compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1:
        vi.fn(async (input: any) => {
          mocks.familyCompilerInputs.push(input);
          return Object.freeze({
            receiptDigestHex: 'a4'.repeat(32),
            profile: Object.freeze({
              duplicatePreventionNftIdHex:
                input.duplicatePreventionGenesisInputBoxIdHex,
              pooledReserveNftIdHex:
                input.pooledReserveGenesisInputBoxIdHex,
            }),
          });
        }),
    };
  },
);

vi.mock(
  './substrate-federated-isolated-devnet-launch-v1.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('./substrate-federated-isolated-devnet-launch-v1.js')
    >();
    return {
      ...actual,
      deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1:
        vi.fn((input: any) => {
          mocks.targetInputs.push(input);
          return Object.freeze({
            descriptorDigestHex: 'b1'.repeat(32),
            federation: Object.freeze({
              federationProfileIdHex:
                input.trackerRequest.profile.profileIdHex,
              sourceAttestationPublicKeysHex:
                input.trackerRequest.profile.sourceAttestationPublicKeysHex,
              sourceAttestationKeySetDigestHex:
                input.trackerRequest.profile.sourceAttestationKeySetDigestHex,
              sourceAttestationThreshold:
                input.trackerRequest.profile.sourceAttestationThreshold,
            }),
            lineages: Object.freeze({
              tracker: Object.freeze({
                genesisInputBoxIdHex: input.trackerRequest.trackerNftIdHex,
              }),
              duplicatePrevention: Object.freeze({
                genesisInputBoxIdHex:
                  input.familyReceipt.profile.duplicatePreventionNftIdHex,
              }),
              pooledReserve: Object.freeze({
                genesisInputBoxIdHex:
                  input.familyReceipt.profile.pooledReserveNftIdHex,
              }),
            }),
          });
        }),
      buildSubstrateFederatedIsolatedDevnetErgoHistoryV1:
        vi.fn((input: any) => {
          mocks.ergoHistoryInputs.push(input);
          return Object.freeze({ historyDigestHex: 'b2'.repeat(32) });
        }),
      buildSubstrateFederatedIsolatedDevnetRelayerClosureV1:
        vi.fn((input: any) => {
          mocks.relayerClosureInputs.push(input);
          return Object.freeze({ closureDigestHex: 'b3'.repeat(32) });
        }),
      buildSubstrateFederatedIsolatedDevnetLaunchStatementV1:
        vi.fn((input: any) => {
          mocks.statementInputs.push(input);
          const statementDigestHex = 'b4'.repeat(32);
          const statement = Object.freeze({
            schema:
              'e2s.substrate-federated-isolated-devnet-launch-statement.v1',
            version: 1,
            target: input.target,
            activationGenerationIdHex: input.activationGenerationIdHex,
            statementDigestHex,
            attestationDigestHex:
              actual.deriveSubstrateFederatedIsolatedDevnetLaunchAttestationDigestV1({
                statementDigestHex,
                sourceAttestationKeySetDigestHex:
                  input.target.federation.sourceAttestationKeySetDigestHex,
                sourceAttestationThreshold:
                  input.target.federation.sourceAttestationThreshold,
              }),
          });
          mocks.launchStatements.add(statement);
          return statement;
        }),
      assertSubstrateFederatedIsolatedDevnetLaunchStatementV1Provenance:
        vi.fn((value: unknown) => {
          if (
            value === null
            || typeof value !== 'object'
            || !mocks.launchStatements.has(value)
          ) {
            throw new Error(
              'isolated-devnet launch statement lacks process provenance',
            );
          }
        }),
      buildSubstrateFederatedIsolatedDevnetLaunchBaselineV1:
        vi.fn((input: any) => {
          mocks.baselineInputs.push(input);
          assertSignatures(input.statement.attestationDigestHex, input.signatures);
          return Object.freeze({ baselineDigestHex: 'b6'.repeat(32) });
        }),
    };
  },
);

vi.mock(
  './substrate-federated-isolated-devnet-relayer-artifacts-v1.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('./substrate-federated-isolated-devnet-relayer-artifacts-v1.js')
    >();
    return {
      ...actual,
      produceSubstrateFederatedIsolatedDevnetRelayerArtifactsV1:
        vi.fn(async (input: any) => {
          mkdirSync(input.destinationDirectory);
          const contents = {
            sourceArchive: Buffer.from('real-source-archive'),
            packageLock: Buffer.from('real-package-lock'),
            runtimeEntrypoints: Buffer.from('real-runtime-entrypoints'),
            buildArtifact: Buffer.from('real-build-artifact'),
          };
          const files = actual
            .SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_ARTIFACT_FILES_V1;
          const artifacts = Object.fromEntries(Object.entries(contents).map(
            ([role, bytes]) => {
              const file = files[role as keyof typeof files];
              writeFileSync(join(input.destinationDirectory, file), bytes);
              return [role, Object.freeze({
                file,
                sizeBytes: bytes.byteLength,
                sha256Hex: sha256(bytes),
              })];
            },
          ));
          if (mocks.tamperRelayerRole !== undefined) {
            const role = mocks.tamperRelayerRole as keyof typeof contents;
            const file = files[role];
            writeFileSync(
              join(input.destinationDirectory, file),
              Buffer.from('tampered-artifact'),
            );
          }
          return Object.freeze({
            schema:
              'e2s.substrate-federated-isolated-devnet-relayer-artifacts.v1',
            version: 1,
            headCommitSha1Hex: input.expectedHeadCommitSha1Hex,
            artifactSetDigestHex: mocks.tamperRelayerSetDigest
              ? 'b7'.repeat(32)
              : sha256(Buffer.from(canonicalJson(artifacts), 'utf8')),
            artifacts: Object.freeze(artifacts),
            boundaries: Object.freeze({}),
          });
        }),
    };
  },
);

vi.mock(
  './substrate-federated-isolated-devnet-portable-replay-v1.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('./substrate-federated-isolated-devnet-portable-replay-v1.js')
    >();
    return {
      ...actual,
      replaySubstrateFederatedIsolatedDevnetPortableV1:
        vi.fn(async (input: any) => {
          mocks.replayInputs.push(input);
          const packet = JSON.parse(
            Buffer.from(input.artifacts.attestationPacket).toString('utf8'),
          );
          return Object.freeze({
            reportDigestHex: 'b8'.repeat(32),
            launch: Object.freeze({
              targetDescriptorDigestHex:
                input.trustPins.expectedTargetDescriptorDigestHex,
              statementDigestHex: packet.statement.statementDigestHex,
              attestationDigestHex: packet.statement.attestationDigestHex,
              baselineDigestHex: 'b6'.repeat(32),
              activationGenerationIdHex:
                packet.statement.activationGenerationIdHex,
            }),
          });
        }),
    };
  },
);

import {
  assertSubstrateFederatedIsolatedDevnetPacketV1Provenance,
  createSubstrateFederatedIsolatedDevnetPacketSessionV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PACKET_PRODUCER_V1_SCHEMA,
} from './substrate-federated-isolated-devnet-packet-producer-v1.js';

const temporaryRoots: string[] = [];
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sourceHistory = sourceHistory();
  mocks.ergoHistory = ergoHistory();
  mocks.trackerInputs = [];
  mocks.trackerCompilerInputs = [];
  mocks.familyCompilerInputs = [];
  mocks.targetInputs = [];
  mocks.ergoHistoryInputs = [];
  mocks.relayerClosureInputs = [];
  mocks.statementInputs = [];
  mocks.baselineInputs = [];
  mocks.replayInputs = [];
  mocks.trackerCompileEntered = undefined;
  mocks.trackerCompileWait = undefined;
  mocks.tamperRelayerRole = undefined;
  mocks.tamperRelayerSetDigest = false;
  mocks.ergoAdmissionSigner = Object.freeze({
    publicKeyHex: `02${'44'.repeat(32)}`,
    p2pkErgoTreeHex: `0008cd${'44'.repeat(33)}`,
    rewardInputErgoTrees: Object.freeze({
      delay1: '10010100d17300',
      delay720: '1002d00500d17300',
    }),
    networkPrefix: 16,
  });
  mocks.packetSignerBinding = undefined;
});

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('isolated-devnet portable packet producer', () => {
  it('joins exact artifacts, signs only the statement, and replays the packet', async () => {
    const session = packetSession();
    expect(session.signer.sourceAttestationThreshold).toBe(2);
    expect(session.signer.sourceAttestationPublicKeysHex).toHaveLength(3);
    expect([...session.signer.sourceAttestationPublicKeysHex].sort()).toEqual(
      session.signer.sourceAttestationPublicKeysHex,
    );

    const result = await session.produce(packetInput());

    assertSubstrateFederatedIsolatedDevnetPacketV1Provenance(result);
    expect(result.receipt.schema).toBe(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PACKET_PRODUCER_V1_SCHEMA,
    );
    expect(result.receipt.status).toBe(
      'process_owned_portable_packet_replayed',
    );
    expect(Object.keys(result.receipt.artifacts)).toHaveLength(17);
    expect(mocks.trackerCompilerInputs).toHaveLength(1);
    expect(mocks.familyCompilerInputs).toHaveLength(1);
    expect(mocks.replayInputs).toEqual([result.portableReplayInput]);
    expect(mocks.baselineInputs[0].signatures).toHaveLength(2);
    expect(result.receipt.boundaries).toMatchObject({
      sourceAttestationKeysShareOneProcessCustody: true,
      sourceAttestationPrivateKeysRetainedAfterPacket: false,
      operationalSourceAttestationCapabilityEstablished: false,
      packetEligibleForActivation: false,
      independentAttestorCustodyEstablished: false,
      sourceConsensusIndependentlyVerified: false,
      ergoConsensusIndependentlyVerified: false,
      targetNodeAcceptanceEstablished: false,
      setupTransactionSigned: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    });
    const packet = JSON.parse(
      Buffer.from(
        result.portableReplayInput.artifacts.attestationPacket,
      ).toString('utf8'),
    );
    expect(packet.signatures.map((value: any) => value.signerPublicKeyHex))
      .toEqual(session.signer.sourceAttestationPublicKeysHex.slice(0, 2));
  });

  it('consumes the exact snapshot-anchored V2 Ergo history producer', async () => {
    mocks.ergoHistory = ergoHistory(2);
    const session = packetSession();

    const result = await session.produce(packetInput());

    assertSubstrateFederatedIsolatedDevnetPacketV1Provenance(result);
    expect(result.receipt.status).toBe(
      'process_owned_portable_packet_replayed',
    );
    expect(mocks.ergoHistoryV2Provenance).toHaveBeenCalledTimes(1);
    expect(mocks.ergoHistoryV1Provenance).not.toHaveBeenCalled();

    const copied = structuredClone(mocks.ergoHistory);
    const copiedSession = packetSession();
    await expect(
      copiedSession.produce(packetInput(mocks.sourceHistory, copied)),
    ).rejects.toThrow(/lack process provenance/u);
  });

  it('snapshots mutable source history before the first asynchronous compiler', async () => {
    const original = Buffer.from(mocks.sourceHistory.artifacts.acceptanceReport);
    let entered!: () => void;
    const compilerEntered = new Promise<void>(resolve => { entered = resolve; });
    let release!: () => void;
    mocks.trackerCompileWait = new Promise<void>(resolve => { release = resolve; });
    mocks.trackerCompileEntered = entered;
    const session = packetSession();

    const pending = session.produce(packetInput());
    await compilerEntered;
    mocks.sourceHistory.artifacts.acceptanceReport.fill(0);
    release();
    const result = await pending;

    expect(Buffer.from(
      result.portableReplayInput.artifacts.sourceAcceptanceReport,
    )).toEqual(original);
  });

  it('fails closed when a published relayer artifact differs from its receipt', async () => {
    mocks.tamperRelayerRole = 'buildArtifact';
    const session = packetSession();

    await expect(session.produce(packetInput())).rejects.toThrow(
      /buildArtifact artifact content drifted|buildArtifact artifact is not stable/u,
    );
    await expect(session.produce(packetInput())).rejects.toThrow(
      /already consumed or disposed/u,
    );
  });

  it('fails closed when the relayer artifact-set receipt is inconsistent', async () => {
    mocks.tamperRelayerSetDigest = true;
    const session = packetSession();

    await expect(session.produce(packetInput())).rejects.toThrow(
      /relayer artifact-set digest drifted/u,
    );
    await expect(session.produce(packetInput())).rejects.toThrow(
      /already consumed or disposed/u,
    );
  });

  it('is one-shot, disposable, and rejects serialized packet provenance', async () => {
    const disposed = packetSession();
    disposed.dispose();
    await expect(disposed.produce(packetInput())).rejects.toThrow(
      /already consumed or disposed/u,
    );

    const session = packetSession();
    const result = await session.produce(packetInput());
    await expect(session.produce(packetInput())).rejects.toThrow(
      /already consumed or disposed/u,
    );
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetPacketV1Provenance(
        structuredClone(result),
      )
    ).toThrow(/lacks process provenance/u);
  });

  it('detects mutation of returned non-authorizing artifact copies', async () => {
    const session = packetSession();
    const result = await session.produce(packetInput());
    const bytes = result.portableReplayInput.artifacts
      .sourceAcceptanceReport as Buffer;
    bytes[0] ^= 0xff;

    expect(() =>
      assertSubstrateFederatedIsolatedDevnetPacketV1Provenance(result)
    ).toThrow(/content drifted/u);
  });

  it('requires both process-owned history producers', async () => {
    const source = mocks.sourceHistory;
    mocks.sourceHistory = undefined;
    const first = packetSession();
    await expect(first.produce(packetInput(source))).rejects.toThrow(
      /history provenance is missing/u,
    );

    mocks.sourceHistory = source;
    const ergo = mocks.ergoHistory;
    mocks.ergoHistory = undefined;
    const second = packetSession();
    await expect(second.produce(packetInput(source, ergo))).rejects.toThrow(
      /Ergo history artifacts lack process provenance/u,
    );
  });

  it('requires a process-owned setup signer and exact authority-profile pins', async () => {
    expect(() =>
      createSubstrateFederatedIsolatedDevnetPacketSessionV1(
        structuredClone(mocks.ergoAdmissionSigner),
      )
    ).toThrow(/signer binding lacks active process provenance/u);

    for (const field of [
      'federationProfileIdHex',
      'sourceAttestationKeySetDigestHex',
      'ergoAdmissionKeySetDigestHex',
    ] as const) {
      const session = packetSession();
      const input = packetInput();
      await expect(session.produce({
        ...input,
        expectedProfilePins: {
          ...input.expectedProfilePins,
          [field]: 'ff'.repeat(32),
        },
      })).rejects.toThrow(/profile pin differs|key set pin differs/u);
    }
  });

  it('revalidates the active setup signer immediately before production', async () => {
    const session = packetSession();
    const input = packetInput();
    mocks.ergoAdmissionSigner = undefined;

    await expect(session.produce(input)).rejects.toThrow(
      /signer binding lacks active process provenance/u,
    );
    expect(mocks.trackerCompilerInputs).toHaveLength(0);
    await expect(session.produce(input)).rejects.toThrow(
      /already consumed or disposed/u,
    );
  });

  it('contains no network, signer execution, checker, submitter, or broadcast import', () => {
    const source = readFileSync(new URL(
      './substrate-federated-isolated-devnet-packet-producer-v1.ts',
      import.meta.url,
    ), 'utf8');
    expect(source).toContain(
      "from './substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js'",
    );
    expect(source).not.toMatch(
      /createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2|registerSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2|revokeSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2/u,
    );
    expect(source).not.toMatch(/from ['"](?:node:https?|\.\/fleet-signer|.*submitter|.*broadcaster)/u);
    expect(source).not.toMatch(/\bfetch\s*\(|\bprocess\.env\b|\/transactions\/check/u);
  });
});

function packetInput(
  source = mocks.sourceHistory,
  ergo = mocks.ergoHistory,
) {
  const root = mkdtempSync(join(tmpdir(), 'bridge-packet-v1-'));
  temporaryRoots.push(root);
  const signer = mocks.packetSignerBinding;
  if (signer === undefined) {
    throw new Error('packet test signer binding is missing');
  }
  const profile = buildSubstrateFederatedCheckpointProfileV1({
    federationEpoch: 1,
    maxAdmissionValidityBlocks: 64,
    sourceAttestationThreshold: signer.sourceAttestationThreshold,
    sourceAttestationPublicKeysHex:
      signer.sourceAttestationPublicKeysHex,
    ergoAdmissionThreshold: signer.ergoAdmissionThreshold,
    ergoAdmissionPublicKeysHex: signer.ergoAdmissionPublicKeysHex,
  });
  return {
    sourceHistory: source,
    ergoHistory: ergo,
    expectedProfilePins: {
      federationProfileIdHex: profile.profileIdHex,
      sourceAttestationKeySetDigestHex:
        profile.sourceAttestationKeySetDigestHex,
      ergoAdmissionKeySetDigestHex: profile.ergoAdmissionKeySetDigestHex,
    },
    relayerArtifacts: {
      bridgeRoot: join(root, 'bridge-root'),
      gitExecutable: join(root, 'git.exe'),
      wasmPackExecutable: join(root, 'wasm-pack.exe'),
      expectedHeadCommitSha1Hex: 'c1'.repeat(20),
      destinationDirectory: join(root, 'artifacts'),
    },
  };
}

function packetSession() {
  const session = createSubstrateFederatedIsolatedDevnetPacketSessionV1(
    mocks.ergoAdmissionSigner,
  );
  mocks.packetSignerBinding = session.signer;
  return session;
}

function sourceHistory() {
  const artifacts = {
    acceptanceReport: Buffer.from('source-acceptance'),
    reportedFinalizedBlocksManifest: Buffer.from('source-finality'),
    runtimeHistoryManifest: Buffer.from('source-runtime'),
    applicationHistoryManifest: Buffer.from('source-application'),
  };
  const target = {
    frontierCommit: 'd1'.repeat(20),
    frontierPatchSha256Hex: 'd2'.repeat(32),
    generatedSpecSha256Hex: 'd3'.repeat(32),
    nativeGenesisHashHex: 'd4'.repeat(32),
    acceptedNativeTipHashHex: 'd5'.repeat(32),
    acceptedExecutionTipHashHex: 'd6'.repeat(32),
    sourceRuntimeCodeSha256Hex: 'd7'.repeat(32),
    sourceRuntimeCodeBytes: 2_000_000,
    storageLayoutDigestHex: 'd8'.repeat(32),
    bridgeAddressHex: '06'.repeat(20),
    bridgeRuntimeCodeSha256Hex: 'd9'.repeat(32),
    bridgeRuntimeCodeBytes: 4_104,
    tokenAddressHex: '07'.repeat(20),
    tokenRuntimeCodeSha256Hex: 'da'.repeat(32),
    tokenRuntimeCodeBytes: 2_356,
    binarySha256Hex: 'db'.repeat(32),
    processBindingDigestHex: 'dc'.repeat(32),
  };
  return {
    acceptance: Object.freeze({}),
    receipt: {
      schema: 'e2s.substrate-federated-authority-safe-devnet-history.v1',
      version: 1,
      status: 'isolated_exact_target_history_collected',
      acceptanceDigestHex: 'dd'.repeat(32),
      historyDigestHex: 'de'.repeat(32),
      target,
      interval: Object.freeze({}),
      artifacts: {
        acceptanceReport: artifact(artifacts.acceptanceReport),
        reportedFinalizedBlocks:
          artifact(artifacts.reportedFinalizedBlocksManifest),
        runtimeHistory: artifact(artifacts.runtimeHistoryManifest),
        applicationHistory: artifact(artifacts.applicationHistoryManifest),
      },
      checks: Object.freeze({}),
      boundaries: Object.freeze({}),
    },
    artifacts,
  };
}

function ergoHistory(version: 1 | 2 = 1) {
  const genesisBoxIds = {
    tracker: 'e1'.repeat(32),
    duplicatePrevention: 'e2'.repeat(32),
    pooledReserve: 'e3'.repeat(32),
  };
  return {
    receipt: {
      schema:
        `e2s.substrate-federated-isolated-devnet-ergo-history-artifacts.v${version}`,
      version,
      status: version === 1
        ? 'matching_non_authorizing_ergo_history'
        : 'matching_non_authorizing_snapshot_anchored_ergo_history',
      reportDigestHex: 'e4'.repeat(32),
      target: {
        network: 'devnet',
        genesisHeaderIdHex: 'e5'.repeat(32),
        genesisHeight: 1,
        setupAnchorHeaderIdHex: 'e6'.repeat(32),
        setupAnchorHeight: 120,
        headerCount: 120,
      },
      genesisBoxIds,
    },
    artifacts: {
      greatestWorkHeadersManifest: `${canonicalJson({ headers: [] })}\n`,
      transactionsManifest: `${canonicalJson({ transactions: [] })}\n`,
      utxoTransitionsManifest: `${canonicalJson({
        schema: 'e2s.substrate-federated-isolated-devnet-ergo-utxo-history.v1',
        version: 1,
        genesisInputs: {},
      })}\n`,
    },
  };
}

function assertSignatures(digestHex: string, signatures: readonly any[]): void {
  expect(signatures).toHaveLength(2);
  for (const signature of signatures) {
    const publicKey = createPublicKey({
      key: Buffer.concat([
        ED25519_SPKI_PREFIX,
        Buffer.from(signature.signerPublicKeyHex, 'hex'),
      ]),
      format: 'der',
      type: 'spki',
    });
    expect(verify(
      null,
      Buffer.from(digestHex, 'hex'),
      publicKey,
      Buffer.from(signature.signatureHex, 'hex'),
    )).toBe(true);
  }
}

function artifact(bytes: Uint8Array) {
  return { sizeBytes: bytes.byteLength, sha256Hex: sha256(bytes) };
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
