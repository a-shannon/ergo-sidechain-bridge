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
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, sep } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildSubstrateFederatedCheckpointProfileV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import { encodePegInSourceIntentV2Hex } from './peg-in-causal-admission-v2.js';
import { canonicalJson } from './strict-json.js';
import {
  buildSubstrateFederatedSettlementFamilyV1CompilerRequest,
} from './substrate-federated-settlement-family-v1.js';

const mocks = vi.hoisted(() => ({
  spawnSync: vi.fn(),
  runProcess: vi.fn(),
  inspectBaseline: vi.fn(),
  validateToolchain: vi.fn(),
  createBuildWorkspace: vi.fn(),
  workspaceCleanup: vi.fn(),
  consumerCargoTargetDirectory: undefined as string | undefined,
  consumerCargoHomeDirectory: undefined as string | undefined,
  cargoTestResult: undefined as any,
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
  tamperTargetRuntimeProfileId: false,
  tamperTargetErgoAdmissionDigest: false,
  ergoAdmissionSigner: undefined as any,
  packetSignerBinding: undefined as any,
  committedPacket: undefined as any,
  targetDescriptor: undefined as any,
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

vi.mock('node:child_process', () => ({
  spawnSync: mocks.spawnSync,
}));

vi.mock('./consensus-source-baseline.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./consensus-source-baseline.js')
  >();
  return { ...actual, inspectConsensusSourceBaseline: mocks.inspectBaseline };
});

vi.mock('./pinned-local-native-verifier-build.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./pinned-local-native-verifier-build.js')
  >();
  return {
    ...actual,
    createPinnedLocalNativeBuildWorkspace: mocks.createBuildWorkspace,
    runBoundedProcess: mocks.runProcess,
    validateNativeVerifierToolchainLock: mocks.validateToolchain,
  };
});

vi.mock(
  './substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.js',
  () => ({
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_REQUIRED_SUCCESSOR_DEPTH_V1: 10,
    assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationForCandidateV1:
      vi.fn((observation, batch, candidate, target) => {
        if (
          mocks.committedPacket === undefined
          || observation !== MINT_OBSERVATION
          || batch !== MINT_BATCH
          || candidate !== MINT_CANDIDATE
          || target !== MINT_ERGO_TARGET
        ) {
          throw new Error('committed-vault candidate provenance missing');
        }
        return mocks.committedPacket;
      }),
  }),
);

vi.mock(
  './substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('./substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js')
    >();
    return {
      ...actual,
      consumeSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceForDraftV1:
        vi.fn((receipt: unknown, draft: any) => {
          if (receipt !== MINT_EVIDENCE_RECEIPT) {
            return actual.consumeSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceForDraftV1(
              receipt as never,
              draft,
            );
          }
          return MINT_EVIDENCE;
        }),
    };
  },
);

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
          const request =
            buildSubstrateFederatedSettlementFamilyV1CompilerRequest({
              templates: input.templates,
              duplicatePreventionGenesisInputBoxIdHex:
                input.duplicatePreventionGenesisInputBoxIdHex,
              pooledReserveGenesisInputBoxIdHex:
                input.pooledReserveGenesisInputBoxIdHex,
              tracker: {
                contractIdHex: input.trackerReceipt.contract.contractIdHex,
                templateSourceSha256Hex: 'a6'.repeat(32),
                trackerNftIdHex: input.trackerRequest.trackerNftIdHex,
                sourceNetworkIdHex:
                  input.trackerRequest.application.sourceNetworkIdHex,
                sidechainIdHex:
                  input.trackerRequest.application.sidechainIdHex,
                bridgeAddressHex:
                  input.trackerRequest.application.bridgeAddressHex,
                tokenAddressHex:
                  input.trackerRequest.application.tokenAddressHex,
                runtimeProfileIdHex:
                  input.trackerRequest.application.runtimeProfileIdHex,
                settlementProfileIdHex:
                  input.trackerRequest.application.settlementProfileIdHex,
                federationProfileIdHex:
                  input.trackerRequest.profile.profileIdHex,
                sourceAttestationKeySetDigestHex:
                  input.trackerRequest.profile
                    .sourceAttestationKeySetDigestHex,
                sourceAttestationThreshold:
                  input.trackerRequest.profile.sourceAttestationThreshold,
                ergoAdmissionKeySetDigestHex:
                  input.trackerRequest.profile.ergoAdmissionKeySetDigestHex,
                ergoAdmissionThreshold:
                  input.trackerRequest.profile.ergoAdmissionThreshold,
                federationEpoch:
                  input.trackerRequest.profile.federationEpoch,
              },
            });
          return Object.freeze({
            receiptDigestHex: 'a4'.repeat(32),
            profile: request.profile,
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
          const descriptor = Object.freeze({
            descriptorDigestHex: 'b1'.repeat(32),
            profile: Object.freeze({
              familyIdHex: input.familyReceipt.profile.familyIdHex,
              encodedProfileHex:
                input.familyReceipt.profile.encodedProfileHex,
              settlementProfileIdHex:
                input.trackerRequest.application.settlementProfileIdHex,
            }),
            sourceRuntime: Object.freeze({
              ...input.trackerRequest.application,
              runtimeProfileIdHex: mocks.tamperTargetRuntimeProfileId
                ? 'fe'.repeat(32)
                : input.trackerRequest.application.runtimeProfileIdHex,
            }),
            federation: Object.freeze({
              federationProfileIdHex:
                input.trackerRequest.profile.profileIdHex,
              federationEpoch:
                input.trackerRequest.profile.federationEpoch,
              maxAdmissionValidityBlocks:
                input.trackerRequest.profile.maxAdmissionValidityBlocks,
              sourceAttestationPublicKeysHex:
                input.trackerRequest.profile.sourceAttestationPublicKeysHex,
              sourceAttestationKeySetDigestHex:
                input.trackerRequest.profile.sourceAttestationKeySetDigestHex,
              sourceAttestationThreshold:
                input.trackerRequest.profile.sourceAttestationThreshold,
              ergoAdmissionPublicKeysHex:
                input.trackerRequest.profile.ergoAdmissionPublicKeysHex,
              ergoAdmissionKeySetDigestHex:
                mocks.tamperTargetErgoAdmissionDigest
                  ? 'fd'.repeat(32)
                  : input.trackerRequest.profile.ergoAdmissionKeySetDigestHex,
              ergoAdmissionThreshold:
                input.trackerRequest.profile.ergoAdmissionThreshold,
            }),
            lineages: Object.freeze({
              tracker: Object.freeze({
                genesisInputBoxIdHex: input.trackerRequest.trackerNftIdHex,
                singletonTokenIdHex: input.trackerRequest.trackerNftIdHex,
              }),
              duplicatePrevention: Object.freeze({
                genesisInputBoxIdHex:
                  input.familyReceipt.profile.duplicatePreventionNftIdHex,
                singletonTokenIdHex:
                  input.familyReceipt.profile.duplicatePreventionNftIdHex,
              }),
              pooledReserve: Object.freeze({
                genesisInputBoxIdHex:
                  input.familyReceipt.profile.pooledReserveNftIdHex,
                singletonTokenIdHex:
                  input.familyReceipt.profile.pooledReserveNftIdHex,
              }),
            }),
          });
          mocks.targetDescriptor = descriptor;
          return descriptor;
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
  assertSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1,
  assertSubstrateFederatedIsolatedDevnetPacketCheckpointAttestationReceiptV3Provenance,
  assertSubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2Provenance,
  assertSubstrateFederatedIsolatedDevnetPacketV1Provenance,
  assertSubstrateFederatedIsolatedDevnetPacketV2Provenance,
  claimSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1,
  consumeSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1,
  createSubstrateFederatedIsolatedDevnetPacketCheckpointContinuationSessionV3,
  createSubstrateFederatedIsolatedDevnetPacketContinuationSessionV2,
  createSubstrateFederatedIsolatedDevnetPacketSessionV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PACKET_CHECKPOINT_ATTESTATION_V3_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PACKET_PRODUCER_V1_SCHEMA,
} from './substrate-federated-isolated-devnet-packet-producer-v1.js';
import {
  collectSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceV1,
} from './substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerReceiptV2Provenance,
  preflightSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2,
  runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2,
} from './substrate-federated-isolated-devnet-frontier-mint-proof-consumer-v2.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
} from './substrate-federated-isolated-devnet-frontier-lab-application-v1.js';
import {
  buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1,
} from './substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_MAX_PENDING_BLOCKS_V2,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_RUNTIME_ACTIVATION_HEIGHT_V2,
  assertSubstrateFederatedIsolatedDevnetMintSourceProofReceiptV2Provenance,
} from './substrate-federated-isolated-devnet-source-attestation-session-v1.js';

const temporaryRoots: string[] = [];
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const h32 = (byte: string): string => `0x${byte.repeat(32)}`;
const h20 = (byte: string): string => `0x${byte.repeat(20)}`;
const MINT_BATCH = Object.freeze({ role: 'mint-batch' });
const MINT_ERGO_TARGET = Object.freeze({ role: 'mint-ergo-target' });
const MINT_CANDIDATE = Object.freeze({ candidateDigestHex: h32('81') });
const MINT_FINALITY_PATH = Object.freeze([
  h32('82'),
  h32('85'),
  h32('86'),
  h32('87'),
  h32('88'),
  h32('89'),
  h32('8a'),
  h32('8b'),
  h32('8c'),
  h32('8d'),
  h32('83'),
]);
const MINT_OBSERVATION = Object.freeze({
  expectedTxId: h32('95'),
  sourceLockBoxIdHex: h32('96'),
  reserveSuccessorBoxIdHex: h32('97'),
  confirmationHeight: 500,
  confirmationHeaderIdHex: h32('82'),
  confirmationObservationDigestHex: h32('a0'),
  finalityTargetHeight: 510,
  finalityTargetHeaderIdHex: h32('83'),
  requiredSuccessorDepth: 10,
  finalityPathHeaderIdsHex: MINT_FINALITY_PATH,
  observedTipHeight: 512,
  observedTipHeaderIdHex: h32('a1'),
  processBindingDigestHex: h32('a2'),
  executionTargetIdentityDigestHex: h32('a3'),
  primaryObservationDigestHex: h32('a4'),
  witnessObservationDigestHex: h32('a5'),
  observationDigestHex: h32('84'),
});
const MINT_EVIDENCE = Object.freeze({
  sourceLockBoxCanonicalHex: '0x0102',
  reserveTransitionTransactionCanonicalHex: '0x0304',
  successorReserveBoxCanonicalHex: '0x0506',
  inclusionProofCanonicalHex: '0x0708',
  checkpointAncestryCanonicalHex: '0x090a',
  finalityProofCanonicalHex: '0x0b0c',
  verifierExecutableSha256Hex: h32('0d'),
});
const MINT_EVIDENCE_RECEIPT: any = Object.freeze({
  receiptDigestHex: h32('0e'),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cargoTestResult = undefined;
  mocks.inspectBaseline.mockReturnValue(passingConsumerSourceBaseline());
  mocks.validateToolchain.mockReturnValue({ errors: [] });
  mocks.spawnSync.mockImplementation((executable, arguments_, options) => {
    if (arguments_.length === 1 && arguments_[0] === '--version') {
      const versions: Record<string, string> = {
        'cargo.exe': 'cargo 1.82.0 (8f40fc59f 2024-08-21)',
        cargo: 'cargo 1.82.0 (8f40fc59f 2024-08-21)',
        'rustc.exe': 'rustc 1.82.0 (f6e511eec 2024-10-15)',
        rustc: 'rustc 1.82.0 (f6e511eec 2024-10-15)',
        'git.exe': 'git version 2.54.0.windows.1',
        git: 'git version 2.54.0.windows.1',
      };
      return {
        error: undefined,
        signal: null,
        status: 0,
        stdout: `${versions[basename(executable)]}\n`,
        stderr: '',
      };
    }
    throw new Error(`unexpected synchronous process: ${basename(executable)}`);
  });
  mocks.runProcess.mockImplementation(async input => {
    if (mocks.cargoTestResult instanceof Error) {
      throw mocks.cargoTestResult;
    }
    if (mocks.cargoTestResult !== undefined) return mocks.cargoTestResult;
    return passingCargoProcessResult(input);
  });
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
  mocks.tamperTargetRuntimeProfileId = false;
  mocks.tamperTargetErgoAdmissionDigest = false;
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
  mocks.committedPacket = undefined;
  mocks.targetDescriptor = undefined;
});

afterEach(() => {
  vi.unstubAllEnvs();
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

  it('permits one mint proof attempt only after a completed packet', async () => {
    const beforePacket = packetContinuationSession();
    expect(() => beforePacket.produceMintSourceProof({} as never, {} as never)).toThrow(
      /requires one completed packet/u,
    );
    beforePacket.dispose();

    const session = packetContinuationSession();
    const packet = await session.produce(packetInput());
    expect(() => session.produceMintSourceProof(packet, {} as never)).toThrow(
      /must contain exactly/u,
    );
    expect(() => session.produceMintSourceProof(packet, {} as never)).toThrow(
      /requires one completed packet/u,
    );
  });

  it('issues one opaque relayer lineage from the exact process-owned packet', async () => {
    const session = packetContinuationSession();
    const packet = await session.produce(packetInput());
    const lineage =
      claimSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1(packet);

    expect(lineage).toMatchObject({
      headCommitSha1Hex: 'c1'.repeat(20),
      relayerArtifactSetDigestHex:
        packet.receipt.relayerArtifactSetDigestHex,
      packetReceiptDigestHex: packet.receipt.receiptDigestHex,
    });
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1(lineage)
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1(
        structuredClone(lineage),
      )
    ).toThrow(/lacks process provenance/u);
    expect(() =>
      claimSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1(packet)
    ).toThrow(/already claimed/u);
    expect(
      consumeSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1(lineage),
    ).toBe(lineage);
    expect(() =>
      consumeSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1(lineage)
    ).toThrow(/already consumed/u);
    session.dispose();
  });

  it('joins the exact completed packet to one settlement-family mint proof', async () => {
    const session = packetContinuationSession();
    const packet = await session.produce(packetInput());
    const target = requiredTargetDescriptor();
    const draft = mintDraftForTarget(target);
    const evidenceReceipt =
      collectSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceV1({
        draft,
        batch: MINT_BATCH as never,
        target: MINT_ERGO_TARGET as never,
        candidate: MINT_CANDIDATE as never,
        committedVaultObservation: MINT_OBSERVATION as never,
      });
    const proofInput = Object.freeze({
      draft,
      evidenceReceipt,
      issuedAtNativeHeight: '4',
      expiresAtNativeHeight: '36',
    });

    const packetReceipt = session.produceMintSourceProof(packet, proofInput);
    const receipt = packetReceipt.sourceProof;
    const runtimeProfile = receipt.request.runtimeProfile;

    expect(receipt).toMatchObject({
      version: 2,
      status: 'collected_federated_source_proof_produced',
      sourceEvidenceReceiptDigestHex: evidenceReceipt.receiptDigestHex,
      mintReservationDraftDigestHex: draft.draftDigestHex,
      mintReservationStatementIdHex: draft.statementIdHex,
      mintIdentityHex: draft.reservationKeyHex,
      settlementFamilyIdHex: target.profile.familyIdHex,
      encodedSettlementFamilyProfileHex: target.profile.encodedProfileHex,
      checks: {
        exactSameProcessDraftBound: true,
        exactTargetDescriptorBound: true,
        exactSettlementFamilyIdBound: true,
        runtimeProfileDerivedFromExactSettlementFamily: true,
        callerSuppliedRuntimeProfileAccepted: false,
        exactSelectedProfileBound: true,
        exactRequestResultBound: true,
        exactThresholdSignatureSetVerified: true,
        boundedValidityWindowVerified: true,
        exactSourceEvidenceReceiptBound: true,
        oneShotCapabilityConsumed: true,
      },
      boundary: {
        evidenceBytesCallerSupplied: false,
        sourceEvidenceCollectionProvenanceEstablished: true,
        runtimeProfileActivated: false,
        runtimeReservationWritten: false,
        mintExecuted: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(normalized(receipt.targetDescriptorDigestHex)).toBe(
      target.descriptorDigestHex,
    );
    expect(normalized(runtimeProfile.lineageProfileIdHex)).toBe(
      target.profile.familyIdHex,
    );
    expect(normalized(runtimeProfile.sourceNetworkIdHex)).toBe(
      target.sourceRuntime.sourceNetworkIdHex,
    );
    expect(normalized(runtimeProfile.sidechainIdHex)).toBe(
      target.sourceRuntime.sidechainIdHex,
    );
    expect(normalized(runtimeProfile.bridgeAddressHex)).toBe(
      target.sourceRuntime.bridgeAddressHex,
    );
    expect(normalized(runtimeProfile.tokenAddressHex)).toBe(
      target.sourceRuntime.tokenAddressHex,
    );
    expect(normalized(runtimeProfile.bridgeRuntimeCodeSha256Hex)).toBe(
      target.sourceRuntime.bridgeRuntimeCodeSha256Hex,
    );
    expect(runtimeProfile.bridgeRuntimeCodeBytes).toBe(
      target.sourceRuntime.bridgeRuntimeCodeBytes,
    );
    expect(normalized(runtimeProfile.tokenRuntimeCodeSha256Hex)).toBe(
      target.sourceRuntime.tokenRuntimeCodeSha256Hex,
    );
    expect(runtimeProfile.tokenRuntimeCodeBytes).toBe(
      target.sourceRuntime.tokenRuntimeCodeBytes,
    );
    expect(runtimeProfile.activationHeight).toBe(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_RUNTIME_ACTIVATION_HEIGHT_V2,
    );
    expect(runtimeProfile.maxPendingBlocks).toBe(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_MAX_PENDING_BLOCKS_V2,
    );
    expect(runtimeProfile.sourceProofProfileIdHex).toBe(
      receipt.sourceProofProfileIdHex,
    );
    expect(receipt.sourceProofProfileScaleHex).toMatch(
      /^0x[0-9a-f]+$/u,
    );
    expect(normalized(runtimeProfile.sourceProofSystemIdHex)).toMatch(
      /^[0-9a-f]{64}$/u,
    );
    expect(receipt.signatureVerification.signatures).toHaveLength(2);
    expect(packet.receipt).toMatchObject({
      version: 2,
      boundaries: {
        sourceAttestationPrivateKeysRetainedAfterPacket: true,
      },
    });
    expect(packetReceipt).toMatchObject({
      version: 2,
      status: 'packet_bound_collected_federated_source_proof_produced',
      packetReceiptDigestHex: packet.receipt.receiptDigestHex,
      targetDescriptorDigestHex: packet.receipt.targetDescriptorDigestHex,
      sourceProofReceiptDigestHex: receipt.receiptDigestHex,
      checks: {
        exactPacketObjectBound: true,
        packetProvenanceRevalidatedImmediatelyBeforeSigning: true,
        exactSourceEvidenceReceiptBound: true,
        callerSuppliedTargetOrRuntimeAuthorityAccepted: false,
      },
    });
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetPacketV2Provenance(packet)
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2Provenance(
        packetReceipt,
      )
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetMintSourceProofReceiptV2Provenance(
        receipt,
      )
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetMintSourceProofReceiptV2Provenance(
        structuredClone(receipt),
      )
    ).toThrow(/lacks process provenance/u);
    expect(() => session.produceMintSourceProof(packet, proofInput)).toThrow(
      /requires one completed packet/u,
    );
  });

  it('retains one source-attestation session across packet, mint, and checkpoint', async () => {
    const beforePacket = packetCheckpointContinuationSession();
    expect(() => beforePacket.produceMintSourceProof(
      {} as never,
      {} as never,
    )).toThrow(/requires one completed packet/u);
    expect(() => beforePacket.produceCheckpointAttestation(
      {} as never,
      {} as never,
      checkpointInput(),
    )).toThrow(/requires one completed mint source-proof/u);
    beforePacket.dispose();

    const session = packetCheckpointContinuationSession();
    const packet = await session.produce(packetInput());
    expect(() => session.produceCheckpointAttestation(
      packet,
      {} as never,
      checkpointInput(),
    )).toThrow(/requires one completed mint source-proof/u);
    const mintSourceProof = session.produceMintSourceProof(packet, {
      draft: mintDraftForTarget(requiredTargetDescriptor()),
      evidenceReceipt: MINT_EVIDENCE_RECEIPT,
      issuedAtNativeHeight: '4',
      expiresAtNativeHeight: '36',
    });
    const checkpoint = session.produceCheckpointAttestation(
      packet,
      mintSourceProof,
      checkpointInput(),
    );

    expect(checkpoint).toMatchObject({
      schema:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PACKET_CHECKPOINT_ATTESTATION_V3_SCHEMA,
      version: 3,
      status: 'packet_mint_bound_synthetic_federated_checkpoint_attested',
      packetReceiptDigestHex: packet.receipt.receiptDigestHex,
      mintSourceProofReceiptDigestHex: mintSourceProof.receiptDigestHex,
      sourceProofReceiptDigestHex: mintSourceProof.sourceProofReceiptDigestHex,
      targetDescriptorDigestHex: packet.receipt.targetDescriptorDigestHex,
      checks: {
        exactPacketObjectBound: true,
        exactMintSourceProofReceiptObjectBound: true,
        packetAndMintProvenanceRevalidatedImmediatelyBeforeCheckpoint: true,
        exactTargetDescriptorBound: true,
        packetThenMintThenCheckpointOrderingEstablished: true,
        exactCheckpointAttestationReceiptBound: true,
        oneShotContinuationConsumed: true,
      },
      boundary: {
        processOwnedSyntheticCustodyOnly: true,
        thresholdSourceAttestationVerified: true,
        independentAttestorCustodyEstablished: false,
        packetMintBeforeCheckpointLifecycleEstablished: true,
        applicationBurnReceiptBound: false,
        sourceConsensusIndependentlyVerified: false,
        deterministicSourceFinalityEstablished: false,
        ergoAnchorEstablished: false,
        trackerAdmissionEstablished: false,
        replayInsertionEstablished: false,
        payoutAuthorized: false,
        ergoTransactionSigningAuthorized: false,
        submissionAuthorized: false,
        broadcastAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(checkpoint.checkpointAttestation).toMatchObject({
      status: 'synthetic_federated_checkpoint_attested',
      targetDescriptorDigestHex: packet.receipt.targetDescriptorDigestHex,
      checkpointStatement: {
        sourceNativeBlockHeight: '7',
        sourceNativeBlockHashHex: normalized(h32('61')),
        executionBlockHashHex: normalized(h32('62')),
        bridgeEventRootHex: normalized(h32('63')),
        burnLeafCount: 1,
        admissionValidFromErgoHeight: '2000',
        admissionExpiresAtErgoHeight: '2064',
      },
      boundary: {
        mintBeforeCheckpointLifecycleEstablished: false,
      },
    });
    expect(checkpoint.checkpointAttestation.signatures).toHaveLength(2);
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetPacketCheckpointAttestationReceiptV3Provenance(
        checkpoint,
      )
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetPacketCheckpointAttestationReceiptV3Provenance(
        structuredClone(checkpoint),
      )
    ).toThrow(/lacks process provenance/u);
    expect(() => session.produceCheckpointAttestation(
      packet,
      mintSourceProof,
      checkpointInput(),
    )).toThrow(/requires one completed mint source-proof/u);
    expect(() => session.produceMintSourceProof(
      packet,
      {} as never,
    )).toThrow(/requires one completed packet/u);
  });

  it('rejects copied packet or mint receipts at the checkpoint boundary', async () => {
    const copiedPacket = await checkpointReadySession();
    expect(() => copiedPacket.session.produceCheckpointAttestation(
      structuredClone(copiedPacket.packet),
      copiedPacket.mintSourceProof,
      checkpointInput(),
    )).toThrow(/different packet or mint source-proof/u);
    expect(() => copiedPacket.session.produceCheckpointAttestation(
      copiedPacket.packet,
      copiedPacket.mintSourceProof,
      checkpointInput(),
    )).toThrow(/requires one completed mint source-proof/u);

    const copiedMint = await checkpointReadySession();
    expect(() => copiedMint.session.produceCheckpointAttestation(
      copiedMint.packet,
      structuredClone(copiedMint.mintSourceProof),
      checkpointInput(),
    )).toThrow(/different packet or mint source-proof/u);
    expect(() => copiedMint.session.produceCheckpointAttestation(
      copiedMint.packet,
      copiedMint.mintSourceProof,
      checkpointInput(),
    )).toThrow(/requires one completed mint source-proof/u);
  });

  it('closes the retained session after an invalid checkpoint attempt or disposal', async () => {
    const invalid = await checkpointReadySession();
    expect(() => invalid.session.produceCheckpointAttestation(
      invalid.packet,
      invalid.mintSourceProof,
      {
        ...checkpointInput(),
        burnLeafCount: 0,
      },
    )).toThrow(/burn leaf count must be a positive uint32/u);
    expect(() => invalid.session.produceCheckpointAttestation(
      invalid.packet,
      invalid.mintSourceProof,
      checkpointInput(),
    )).toThrow(/requires one completed mint source-proof/u);

    const disposed = await checkpointReadySession();
    disposed.session.dispose();
    expect(() => disposed.session.produceCheckpointAttestation(
      disposed.packet,
      disposed.mintSourceProof,
      checkpointInput(),
    )).toThrow(/requires one completed mint source-proof/u);
  });

  it('closes the retained session after packet or mint production fails', async () => {
    const failedPacket = packetCheckpointContinuationSession();
    const invalidPacketInput = packetInput();
    await expect(failedPacket.produce({
      ...invalidPacketInput,
      expectedProfilePins: {
        ...invalidPacketInput.expectedProfilePins,
        federationProfileIdHex: 'ff'.repeat(32),
      },
    })).rejects.toThrow(/profile pin differs/u);
    await expect(failedPacket.produce(packetInput())).rejects.toThrow(
      /already consumed or disposed/u,
    );

    const failedMint = packetCheckpointContinuationSession();
    const packet = await failedMint.produce(packetInput());
    expect(() => failedMint.produceMintSourceProof(
      packet,
      {} as never,
    )).toThrow(/must contain exactly/u);
    expect(() => failedMint.produceMintSourceProof(
      packet,
      {} as never,
    )).toThrow(/requires one completed packet/u);

    mocks.tamperTargetRuntimeProfileId = true;
    const targetDrift = packetCheckpointContinuationSession();
    const driftedPacket = await targetDrift.produce(packetInput());
    expect(() => targetDrift.produceMintSourceProof(driftedPacket, {
      draft: mintDraftForTarget(requiredTargetDescriptor()),
      evidenceReceipt: MINT_EVIDENCE_RECEIPT,
      issuedAtNativeHeight: '4',
      expiresAtNativeHeight: '36',
    })).toThrow(/runtime profile ID differs/u);
    expect(() => targetDrift.produceMintSourceProof(
      driftedPacket,
      {} as never,
    )).toThrow(/requires one completed packet/u);
  });

  it('feeds only the exact packet-bound dynamic proof into the atomic Frontier consumer', async () => {
    const session = packetContinuationSession();
    const packet = await session.produce(packetInput());
    const target = requiredTargetDescriptor();
    const draft = mintDraftForTarget(target);
    const evidenceReceipt =
      collectSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceV1({
        draft,
        batch: MINT_BATCH as never,
        target: MINT_ERGO_TARGET as never,
        candidate: MINT_CANDIDATE as never,
        committedVaultObservation: MINT_OBSERVATION as never,
      });
    const packetProof = session.produceMintSourceProof(packet, {
      draft,
      evidenceReceipt,
      issuedAtNativeHeight: '4',
      expiresAtNativeHeight: '36',
    });
    const root = mkdtempSync(join(tmpdir(), 'bridge-frontier-proof-consumer-'));
    temporaryRoots.push(root);
    const paths = createConsumerPaths(root);
    vi.stubEnv('E2S_UNRELATED_TEST_VALUE', 'must-not-leak');
    const input = Object.freeze({
      proofReceipt: packetProof,
      ...paths,
      offline: true,
    });

    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2({
        ...input,
        proofReceipt: structuredClone(packetProof),
      })
    ).rejects.toThrow(/lacks process provenance/u);
    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2({
        ...input,
        targetDescriptorDigestHex: h32('ff'),
      } as never)
    ).rejects.toThrow(/must contain exactly/u);

    const receipt =
      await runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2(input);

    expect(() =>
      assertSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerReceiptV2Provenance(
        receipt,
      )
    ).not.toThrow();
    expect(receipt).toMatchObject({
      status: 'packet_bound_proof_consumed_by_frontier_lab',
      packetProofReceiptDigestHex: packetProof.receiptDigestHex,
      sourceProofReceiptDigestHex: packetProof.sourceProof.receiptDigestHex,
      sourceEvidenceReceiptDigestHex: evidenceReceipt.receiptDigestHex,
      checks: {
        exactPacketProofProvenanceRevalidated: true,
        exactCollectedSourceEvidenceBoundaryConsumed: true,
        exactSourceLockRevalidatedBeforeAndAfter: true,
        exactToolchainRevalidatedBeforeAndAfter: true,
        exactDynamicSourceProfileConsumed: true,
        exactDynamicSourceProofEnvelopeConsumed: true,
        exactDynamicSourceProofMarkerConsumed: true,
        directParentReservationAndMintAcceptedAtomically: true,
        unreservedSiblingRejectedAtomically: true,
        callerSuppliedAuthorityFieldsAccepted: false,
        toolsAuthenticatedBeforeFirstExecution: true,
        freshConsumerOwnedCargoTargetUsed: true,
        configurationIsolatedCargoHomeUsed: true,
        cargoProcessTreeContainedBeforeCleanup: true,
      },
      boundary: {
        isolatedTestClientOnly: true,
        localSourceAndToolIdentityOnly: true,
        completeBuildToolClosureVerified: false,
        dependencyCacheContentAttested: false,
        atomicSourceAndToolSnapshotEstablished: false,
        exclusiveNonAdversarialSameUserExecutionRequired: true,
        callerSuppliedEvidenceBytesAccepted: false,
        sourceEvidenceCollectionProvenanceEstablished: true,
        sourceCanonicalityIndependentlyVerified: false,
        ergoPowAuthenticated: false,
        externalTargetNodeAcceptanceEstablished: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(mocks.spawnSync).toHaveBeenCalledTimes(6);
    expect(mocks.runProcess).toHaveBeenCalledTimes(1);
    const cargoCall = mocks.runProcess.mock.calls.find(
      ([processInput]) => processInput.args[0] === 'test',
    );
    expect(cargoCall).toBeDefined();
    const [processInput] = cargoCall!;
    expect(processInput.executablePath).toBe(paths.cargoExecutablePath);
    expect(processInput.args).toContain(
      'bridge_federated_lab_reservation_tests::federated_lab_direct_parent_mint_is_atomic_and_rejects_unreserved_sibling',
    );
    expect(processInput.args).toContain('--exact');
    expect(processInput.env.BRIDGE_LAB_FEDERATED_SOURCE_PROOF_PROFILE_SCALE_HEX)
      .toBe(packetProof.sourceProof.sourceProofProfileScaleHex);
    expect(processInput.env.BRIDGE_LAB_FEDERATED_SOURCE_PROOF_PROFILE_ID_HEX)
      .toBe(packetProof.sourceProof.sourceProofProfileIdHex);
    expect(processInput.env.BRIDGE_LAB_FEDERATED_MINT_SOURCE_PROOF_ENVELOPE_V4_HEX)
      .toBe(packetProof.sourceProof.sourceProofEnvelopeScaleHex);
    expect(processInput.env.BRIDGE_LAB_FEDERATED_MINT_RESERVATION_STATEMENT_V4_HEX)
      .toBe(packetProof.sourceProof.request.statementHex);
    expect(processInput.env.CARGO_NET_OFFLINE).toBe('true');
    expect(processInput.env.CARGO_HOME).toBe(
      mocks.consumerCargoHomeDirectory,
    );
    expect(processInput.env.CARGO_TARGET_DIR).toBe(
      mocks.consumerCargoTargetDirectory,
    );
    expect(processInput.env.RUSTC).toBe(paths.rustcExecutablePath);
    expect(processInput.env.E2S_UNRELATED_TEST_VALUE).toBeUndefined();
    expect(processInput.label).toBe('Frontier packet-proof Cargo consumer');
    expect(processInput.timeoutMs).toBeGreaterThan(0);
    expect(processInput.timeoutMs).toBeLessThanOrEqual(29 * 60_000);
    expect(mocks.workspaceCleanup).toHaveBeenCalledTimes(1);
    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2(input)
    ).rejects.toThrow(/already consumed/u);
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerReceiptV2Provenance(
        structuredClone(receipt),
      )
    ).toThrow(/lacks process provenance/u);
  });

  it('preflights exact canonical consumer paths without consuming a proof', () => {
    const root = mkdtempSync(join(tmpdir(), 'bridge-frontier-preflight-'));
    temporaryRoots.push(root);
    const paths = createConsumerPaths(root);

    expect(
      preflightSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2({
        ...paths,
        offline: true,
      }),
    ).toEqual({ ...paths, offline: true });
    expect(() =>
      preflightSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2({
        ...paths,
        cargoExecutablePath: 'relative/cargo',
        offline: true,
      })
    ).toThrow(/Cargo executable must be an existing regular file/u);
    expect(() =>
      preflightSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2({
        ...paths,
        frontierSourceDirectory:
          `${paths.frontierSourceDirectory}${sep}..${sep}${basename(paths.frontierSourceDirectory)}`,
        offline: true,
      })
    ).toThrow(/path must be canonical and non-symlinked/u);
    const linkedRoot = join(root, 'linked-root');
    symlinkSync(
      root,
      linkedRoot,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    expect(() =>
      preflightSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2({
        ...paths,
        frontierSourceDirectory: join(
          linkedRoot,
          basename(paths.frontierSourceDirectory),
        ),
        offline: true,
      })
    ).toThrow(/path must be canonical and non-symlinked/u);
    expect(mocks.runProcess).not.toHaveBeenCalled();
  });

  it('rejects an out-of-envelope consumer timeout before process execution', async () => {
    const session = packetContinuationSession();
    const packet = await session.produce(packetInput());
    const packetProof = session.produceMintSourceProof(packet, {
      draft: mintDraftForTarget(requiredTargetDescriptor()),
      evidenceReceipt: MINT_EVIDENCE_RECEIPT,
      issuedAtNativeHeight: '4',
      expiresAtNativeHeight: '36',
    });
    const root = mkdtempSync(join(tmpdir(), 'bridge-frontier-timeout-'));
    temporaryRoots.push(root);

    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2(
        Object.freeze({
          proofReceipt: packetProof,
          ...createConsumerPaths(root),
          offline: true,
        }),
        performance.now() + 31 * 60_000,
      ),
    ).rejects.toThrow(/deadline must be within/u);
    expect(mocks.runProcess).not.toHaveBeenCalled();
  });

  it('rejects concurrent consumption of one packet proof capability', async () => {
    const session = packetContinuationSession();
    const packet = await session.produce(packetInput());
    const packetProof = session.produceMintSourceProof(packet, {
      draft: mintDraftForTarget(requiredTargetDescriptor()),
      evidenceReceipt: MINT_EVIDENCE_RECEIPT,
      issuedAtNativeHeight: '4',
      expiresAtNativeHeight: '36',
    });
    const root = mkdtempSync(join(tmpdir(), 'bridge-frontier-concurrent-'));
    temporaryRoots.push(root);
    const input = Object.freeze({
      proofReceipt: packetProof,
      ...createConsumerPaths(root),
      offline: true,
    });
    let enterProcess!: () => void;
    const processEntered = new Promise<void>(resolvePromise => {
      enterProcess = resolvePromise;
    });
    let releaseProcess!: () => void;
    const processRelease = new Promise<void>(resolvePromise => {
      releaseProcess = resolvePromise;
    });
    mocks.runProcess.mockImplementationOnce(async processInput => {
      enterProcess();
      await processRelease;
      return passingCargoProcessResult(processInput);
    });

    const firstConsumption =
      runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2(input);
    await processEntered;
    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2(input),
    ).rejects.toThrow(/already consumed or active/u);
    releaseProcess();
    await expect(firstConsumption).resolves.toBeDefined();
    expect(mocks.runProcess).toHaveBeenCalledTimes(1);
    expect(mocks.workspaceCleanup).toHaveBeenCalledTimes(1);
  });

  it('executes the same packet proof that the one-shot guard admitted', async () => {
    const sessionA = packetContinuationSession();
    const packetA = await sessionA.produce(packetInput());
    const proofA = sessionA.produceMintSourceProof(packetA, {
      draft: mintDraftForTarget(requiredTargetDescriptor()),
      evidenceReceipt: MINT_EVIDENCE_RECEIPT,
      issuedAtNativeHeight: '4',
      expiresAtNativeHeight: '36',
    });
    const sessionB = packetContinuationSession();
    const packetB = await sessionB.produce(packetInput());
    const proofB = sessionB.produceMintSourceProof(packetB, {
      draft: mintDraftForTarget(requiredTargetDescriptor()),
      evidenceReceipt: MINT_EVIDENCE_RECEIPT,
      issuedAtNativeHeight: '4',
      expiresAtNativeHeight: '35',
    });
    const rootA = mkdtempSync(join(tmpdir(), 'bridge-frontier-guarded-proof-a-'));
    const rootB = mkdtempSync(join(tmpdir(), 'bridge-frontier-guarded-proof-b-'));
    temporaryRoots.push(rootA, rootB);
    const targetInput = {
      proofReceipt: proofA,
      ...createConsumerPaths(rootA),
      offline: true,
    };
    let proofReceiptReads = 0;
    const substitutingInput = new Proxy(targetInput, {
      get(target, property, receiver) {
        if (property === 'proofReceipt') {
          proofReceiptReads += 1;
          return proofReceiptReads === 1 ? proofA : proofB;
        }
        return Reflect.get(target, property, receiver);
      },
    });

    const receiptA =
      await runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2(
        substitutingInput,
      );

    expect(receiptA.packetProof).toBe(proofA);
    expect(receiptA.packetProofReceiptDigestHex).toBe(proofA.receiptDigestHex);
    expect(proofReceiptReads).toBe(1);
    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2(
        Object.freeze({
          proofReceipt: proofB,
          ...createConsumerPaths(rootB),
          offline: true,
        }),
      ),
    ).resolves.toMatchObject({
      packetProof: proofB,
      packetProofReceiptDigestHex: proofB.receiptDigestHex,
    });
    expect(mocks.runProcess).toHaveBeenCalledTimes(2);
  });

  it('does not accept a successful Cargo exit that ran zero atomic mint tests', async () => {
    const session = packetContinuationSession();
    const packet = await session.produce(packetInput());
    const packetProof = session.produceMintSourceProof(packet, {
      draft: mintDraftForTarget(requiredTargetDescriptor()),
      evidenceReceipt: MINT_EVIDENCE_RECEIPT,
      issuedAtNativeHeight: '4',
      expiresAtNativeHeight: '36',
    });
    const root = mkdtempSync(join(tmpdir(), 'bridge-frontier-zero-tests-'));
    temporaryRoots.push(root);
    const paths = createConsumerPaths(root);
    mocks.cargoTestResult = {
      error: undefined,
      signal: null,
      status: 0,
      stdout: 'test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured',
      stderr: '',
    };
    const input = Object.freeze({
      proofReceipt: packetProof,
      ...paths,
      offline: true,
    });

    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2(input)
    ).rejects.toThrow(/did not execute the exact atomic mint test/u);
    mocks.cargoTestResult = undefined;
    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2(input)
    ).resolves.toBeDefined();
    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2(input)
    ).rejects.toThrow(/already consumed/u);
  });

  it('requires the exact dynamic proof marker and remains retryable on failure', async () => {
    const session = packetContinuationSession();
    const packet = await session.produce(packetInput());
    const packetProof = session.produceMintSourceProof(packet, {
      draft: mintDraftForTarget(requiredTargetDescriptor()),
      evidenceReceipt: MINT_EVIDENCE_RECEIPT,
      issuedAtNativeHeight: '4',
      expiresAtNativeHeight: '36',
    });
    const root = mkdtempSync(join(tmpdir(), 'bridge-frontier-marker-'));
    temporaryRoots.push(root);
    const input = Object.freeze({
      proofReceipt: packetProof,
      ...createConsumerPaths(root),
      offline: true,
    });
    mocks.cargoTestResult = {
      error: undefined,
      signal: null,
      status: 0,
      stdout: [
        'running 1 test',
        'test bridge_federated_lab_reservation_tests::federated_lab_direct_parent_mint_is_atomic_and_rejects_unreserved_sibling ... ok',
        'test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured',
      ].join('\n'),
      stderr: '',
    };

    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2(input)
    ).rejects.toThrow(/lacks the exact dynamic proof marker/u);
    mocks.cargoTestResult = undefined;
    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2(input)
    ).resolves.toBeDefined();
  });

  it('revalidates the source lock after Cargo and keeps a failed proof retryable', async () => {
    const session = packetContinuationSession();
    const packet = await session.produce(packetInput());
    const packetProof = session.produceMintSourceProof(packet, {
      draft: mintDraftForTarget(requiredTargetDescriptor()),
      evidenceReceipt: MINT_EVIDENCE_RECEIPT,
      issuedAtNativeHeight: '4',
      expiresAtNativeHeight: '36',
    });
    const root = mkdtempSync(join(tmpdir(), 'bridge-frontier-source-drift-'));
    temporaryRoots.push(root);
    const input = Object.freeze({
      proofReceipt: packetProof,
      ...createConsumerPaths(root),
      offline: true,
    });
    mocks.inspectBaseline
      .mockReturnValueOnce(passingConsumerSourceBaseline())
      .mockReturnValueOnce({
        ...passingConsumerSourceBaseline(),
        status: 'BLOCKED',
        errors: ['checkout drift'],
      })
      .mockReturnValue(passingConsumerSourceBaseline());

    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2(input)
    ).rejects.toThrow(/differs from the complete source lock/u);
    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2(input)
    ).resolves.toBeDefined();
  });

  it('authenticates every build tool before its first execution and remains retryable', async () => {
    const session = packetContinuationSession();
    const packet = await session.produce(packetInput());
    const packetProof = session.produceMintSourceProof(packet, {
      draft: mintDraftForTarget(requiredTargetDescriptor()),
      evidenceReceipt: MINT_EVIDENCE_RECEIPT,
      issuedAtNativeHeight: '4',
      expiresAtNativeHeight: '36',
    });
    const root = mkdtempSync(join(tmpdir(), 'bridge-frontier-tool-prehash-'));
    temporaryRoots.push(root);
    const input = Object.freeze({
      proofReceipt: packetProof,
      ...createConsumerPaths(root),
      offline: true,
    });
    mocks.validateToolchain
      .mockReset()
      .mockReturnValueOnce({ errors: ['cargo digest drift'] })
      .mockReturnValue({ errors: [] });

    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2(input)
    ).rejects.toThrow(/digests differ before first execution/u);
    expect(mocks.spawnSync).not.toHaveBeenCalled();
    expect(mocks.createBuildWorkspace).not.toHaveBeenCalled();
    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2(input)
    ).resolves.toBeDefined();
  });

  it('rejects post-Cargo tool drift before invoking the changed tool and remains retryable', async () => {
    const session = packetContinuationSession();
    const packet = await session.produce(packetInput());
    const packetProof = session.produceMintSourceProof(packet, {
      draft: mintDraftForTarget(requiredTargetDescriptor()),
      evidenceReceipt: MINT_EVIDENCE_RECEIPT,
      issuedAtNativeHeight: '4',
      expiresAtNativeHeight: '36',
    });
    const root = mkdtempSync(join(tmpdir(), 'bridge-frontier-tool-posthash-'));
    temporaryRoots.push(root);
    const input = Object.freeze({
      proofReceipt: packetProof,
      ...createConsumerPaths(root),
      offline: true,
    });
    mocks.validateToolchain
      .mockReset()
      .mockReturnValueOnce({ errors: [] })
      .mockReturnValueOnce({ errors: [] })
      .mockReturnValueOnce({ errors: ['rustc digest drift'] })
      .mockReturnValue({ errors: [] });

    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2(input)
    ).rejects.toThrow(/digests differ before first execution/u);
    expect(mocks.workspaceCleanup).toHaveBeenCalledTimes(1);
    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2(input)
    ).resolves.toBeDefined();
  });

  it('rejects inherited Cargo configuration before Cargo and remains retryable', async () => {
    const session = packetContinuationSession();
    const packet = await session.produce(packetInput());
    const packetProof = session.produceMintSourceProof(packet, {
      draft: mintDraftForTarget(requiredTargetDescriptor()),
      evidenceReceipt: MINT_EVIDENCE_RECEIPT,
      issuedAtNativeHeight: '4',
      expiresAtNativeHeight: '36',
    });
    const root = mkdtempSync(join(tmpdir(), 'bridge-frontier-cargo-config-'));
    temporaryRoots.push(root);
    const input = Object.freeze({
      proofReceipt: packetProof,
      ...createConsumerPaths(root),
      offline: true,
    });
    const cargoConfigDirectory = join(root, '.cargo');
    const cargoConfigPath = join(cargoConfigDirectory, 'config.toml');
    mkdirSync(cargoConfigDirectory);
    writeFileSync(cargoConfigPath, '[target.any]\nrunner = "false"\n');

    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2(input)
    ).rejects.toThrow(/Cargo configuration must be absent/u);
    expect(mocks.runProcess).not.toHaveBeenCalled();
    rmSync(cargoConfigPath);
    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2(input)
    ).resolves.toBeDefined();
  });

  it('consumes the packet proof capability on a cross-target draft', async () => {
    const session = packetContinuationSession();
    const packet = await session.produce(packetInput());
    const target = requiredTargetDescriptor();
    const draft = mintDraftForTarget(target, {
      sidechainIdHex: h32('ff'),
    });
    const proofInput = Object.freeze({
      draft,
      evidenceReceipt: MINT_EVIDENCE_RECEIPT,
      issuedAtNativeHeight: '4',
      expiresAtNativeHeight: '36',
    });

    expect(() => session.produceMintSourceProof(packet, proofInput)).toThrow(
      /sidechain ID differs/u,
    );
    expect(() => session.produceMintSourceProof(packet, proofInput)).toThrow(
      /requires one completed packet/u,
    );
  });

  it('rejects a settlement family whose runtime identity differs from the signed target', async () => {
    mocks.tamperTargetRuntimeProfileId = true;
    const session = packetContinuationSession();
    const packet = await session.produce(packetInput());
    const proofInput = Object.freeze({
      draft: mintDraftForTarget(requiredTargetDescriptor()),
      evidenceReceipt: MINT_EVIDENCE_RECEIPT,
      issuedAtNativeHeight: '4',
      expiresAtNativeHeight: '36',
    });

    expect(() => session.produceMintSourceProof(packet, proofInput)).toThrow(
      /runtime profile ID differs/u,
    );
  });

  it('rejects a settlement family whose Ergo admission differs from the signed target', async () => {
    mocks.tamperTargetErgoAdmissionDigest = true;
    const session = packetContinuationSession();
    const packet = await session.produce(packetInput());
    const proofInput = Object.freeze({
      draft: mintDraftForTarget(requiredTargetDescriptor()),
      evidenceReceipt: MINT_EVIDENCE_RECEIPT,
      issuedAtNativeHeight: '4',
      expiresAtNativeHeight: '36',
    });

    expect(() => session.produceMintSourceProof(packet, proofInput)).toThrow(
      /Ergo admission key-set digest differs/u,
    );
  });

  it('rejects copied packets and caller-supplied target authority', async () => {
    const copiedPacketSession = packetContinuationSession();
    const packet = await copiedPacketSession.produce(packetInput());
    const draft = mintDraftForTarget(requiredTargetDescriptor());
    const proofInput = Object.freeze({
      draft,
      evidenceReceipt: MINT_EVIDENCE_RECEIPT,
      issuedAtNativeHeight: '4',
      expiresAtNativeHeight: '36',
    });

    expect(() => copiedPacketSession.produceMintSourceProof(
      structuredClone(packet),
      proofInput,
    )).toThrow(/different completed packet/u);

    const callerAuthoritySession = packetContinuationSession();
    const secondPacket = await callerAuthoritySession.produce(packetInput());
    const secondDraft = mintDraftForTarget(requiredTargetDescriptor());
    expect(() => callerAuthoritySession.produceMintSourceProof(
      secondPacket,
      {
        draft: secondDraft,
        evidenceReceipt: MINT_EVIDENCE_RECEIPT,
        issuedAtNativeHeight: '4',
        expiresAtNativeHeight: '36',
        targetDescriptorDigestHex: h32('ff'),
      } as never,
    )).toThrow(/must contain exactly/u);

    const copiedEvidenceSession = packetContinuationSession();
    const thirdPacket = await copiedEvidenceSession.produce(packetInput());
    expect(() => copiedEvidenceSession.produceMintSourceProof(
      thirdPacket,
      {
        draft: mintDraftForTarget(requiredTargetDescriptor()),
        evidenceReceipt: structuredClone(MINT_EVIDENCE_RECEIPT),
        issuedAtNativeHeight: '4',
        expiresAtNativeHeight: '36',
      },
    )).toThrow(/evidence receipt lacks process provenance/u);

    const rawEvidenceSession = packetContinuationSession();
    const fourthPacket = await rawEvidenceSession.produce(packetInput());
    expect(() => rawEvidenceSession.produceMintSourceProof(
      fourthPacket,
      {
        draft: mintDraftForTarget(requiredTargetDescriptor()),
        evidence: MINT_EVIDENCE,
        issuedAtNativeHeight: '4',
        expiresAtNativeHeight: '36',
      } as never,
    )).toThrow(/must contain exactly/u);
  });

  it('revalidates packet bytes before the one-shot mint signature', async () => {
    const session = packetContinuationSession();
    const packet = await session.produce(packetInput());
    const proofInput = Object.freeze({
      draft: mintDraftForTarget(requiredTargetDescriptor()),
      evidenceReceipt: MINT_EVIDENCE_RECEIPT,
      issuedAtNativeHeight: '4',
      expiresAtNativeHeight: '36',
    });
    const bytes = packet.portableReplayInput.artifacts
      .sourceAcceptanceReport as Buffer;
    bytes[0] ^= 0xff;

    expect(() => session.produceMintSourceProof(packet, proofInput)).toThrow(
      /content drifted/u,
    );
    expect(() => session.produceMintSourceProof(packet, proofInput)).toThrow(
      /requires one completed packet/u,
    );
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

function requiredTargetDescriptor(): any {
  if (mocks.targetDescriptor === undefined) {
    throw new Error('packet test target descriptor is missing');
  }
  return mocks.targetDescriptor;
}

function createConsumerPaths(root: string) {
  const frontierSourceDirectory = join(root, 'frontier');
  const consumerCargoTargetDirectory = join(root, 'consumer-cargo-target');
  const consumerCargoHomeDirectory = join(
    consumerCargoTargetDirectory,
    'cargo-home',
  );
  const toolDirectory = join(root, 'tools');
  mkdirSync(frontierSourceDirectory);
  mkdirSync(consumerCargoTargetDirectory);
  mkdirSync(consumerCargoHomeDirectory);
  mkdirSync(toolDirectory);
  writeFileSync(join(frontierSourceDirectory, 'Cargo.lock'), 'locked-cargo');
  writeFileSync(
    join(frontierSourceDirectory, 'rust-toolchain.toml'),
    '[toolchain]\nchannel = "1.82.0"\n',
  );
  const cargoExecutablePath = join(
    toolDirectory,
    process.platform === 'win32' ? 'cargo.exe' : 'cargo',
  );
  const rustcExecutablePath = join(
    toolDirectory,
    process.platform === 'win32' ? 'rustc.exe' : 'rustc',
  );
  const gitExecutablePath = join(
    toolDirectory,
    process.platform === 'win32' ? 'git.exe' : 'git',
  );
  writeFileSync(cargoExecutablePath, 'cargo');
  writeFileSync(rustcExecutablePath, 'rustc');
  writeFileSync(gitExecutablePath, 'git');
  mocks.createBuildWorkspace.mockReturnValue({
    buildTargetPath: consumerCargoTargetDirectory,
    cargoHomePath: consumerCargoHomeDirectory,
    cleanup: mocks.workspaceCleanup,
  });
  mocks.consumerCargoTargetDirectory = consumerCargoTargetDirectory;
  mocks.consumerCargoHomeDirectory = consumerCargoHomeDirectory;
  return Object.freeze({
    frontierSourceDirectory,
    cargoExecutablePath,
    rustcExecutablePath,
    gitExecutablePath,
  });
}

function passingCargoProcessResult(input: any) {
  const proofHex = input.env
    .BRIDGE_LAB_FEDERATED_MINT_SOURCE_PROOF_ENVELOPE_V4_HEX as string;
  const proofDigest = createHash('sha256')
    .update(Buffer.from(proofHex.slice(2), 'hex'))
    .digest('hex');
  return {
    pid: 1234,
    exitCode: 0 as const,
    stdout: [
      `bridge-lab-dynamic-source-proof-sha256=0x${proofDigest}`,
      'running 1 test',
      'test bridge_federated_lab_reservation_tests::federated_lab_direct_parent_mint_is_atomic_and_rejects_unreserved_sibling ... ok',
      '',
      'test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 2 filtered out; finished in 0.01s',
    ].join('\n'),
    stderr: '',
  };
}

function passingConsumerSourceBaseline() {
  return Object.freeze({
    schemaVersion: 1 as const,
    kind: 'bridge-consensus-source-baseline-report' as const,
    status: 'PASS' as const,
    errors: [] as string[],
    checks: Object.freeze({
      lockBindingsValidated: true,
      solidityBuildClosureArtifactsValidated: true,
      frontierCheckoutRequired: true,
      frontierCheckoutValidated: true,
      ergoCheckoutRequired: false,
      ergoCheckoutValidated: false,
    }),
    sourceIdentity: Object.freeze({
      solidityBuildManifestSha256: '11'.repeat(32),
      frontierCommit: '22'.repeat(20),
      frontierPatchSha256: '33'.repeat(32),
      ergoBaseCommit: '44'.repeat(20),
      ergoPatchSha256: '55'.repeat(32),
    }),
    boundaries: Object.freeze({
      sidechainFinalityImplemented: false,
      runtimeCommitmentProducerImplemented: true,
      grandpaAuthorityTransitionVerificationImplemented: true,
      hashLinkedGrandpaVerificationImplemented: true,
      nativeRuntimeCommitmentStateVerificationImplemented: true,
      nativeFinalizedCheckpointVerificationImplemented: true,
      nativeRpcProofCodecImplemented: true,
      trustlessBurnVerificationImplemented: false,
      gate5Closed: false,
    }),
  });
}

function mintDraftForTarget(
  target: any,
  overrides: Readonly<{ sidechainIdHex?: string }> = {},
) {
  const amountNanoErg = '10000000';
  const sourceIntentHex = encodePegInSourceIntentV2Hex({
    formatVersion: 2,
    sourceNetworkIdHex: target.sourceRuntime.sourceNetworkIdHex,
    sidechainIdHex:
      overrides.sidechainIdHex ?? target.sourceRuntime.sidechainIdHex,
    bridgeAddressHex: target.sourceRuntime.bridgeAddressHex,
    tokenAddressHex: target.sourceRuntime.tokenAddressHex,
    settlementProfileIdHex: target.profile.settlementProfileIdHex,
    admissionProfileIdHex: target.profile.familyIdHex,
    sourceAssetIdHex: h32('00'),
    amountNanoErg,
    recipientAddressHex: h20('91'),
  });
  const reservePredecessor = mintEvidenceBox('98', 'b0', 0);
  const sourceLock = mintEvidenceBox('96', 'b1', 0);
  const transitionFeeFunding = mintEvidenceBox('99', 'b1', 1);
  const reserveSuccessor = mintEvidenceBox('97', '95', 0);
  const reserveTransition = Object.freeze({
    txId: h32('95'),
    eip12Tx: Object.freeze({
      inputs: Object.freeze([
        Object.freeze({ ...reservePredecessor, extension: Object.freeze({}) }),
        Object.freeze({ ...sourceLock, extension: Object.freeze({}) }),
        Object.freeze({ ...transitionFeeFunding, extension: Object.freeze({}) }),
      ]),
      dataInputs: Object.freeze([]),
      outputs: Object.freeze([{
        value: reserveSuccessor.value,
        ergoTree: reserveSuccessor.ergoTree,
        assets: reserveSuccessor.assets,
        additionalRegisters: reserveSuccessor.additionalRegisters,
        creationHeight: reserveSuccessor.creationHeight,
      }]),
    }),
    outputs: Object.freeze([reserveSuccessor]),
  });
  mocks.committedPacket = Object.freeze({
    familyIdHex: target.profile.familyIdHex,
    familyCompiler: Object.freeze({ bindingDigestHex: h32('92') }),
    sourceIntentHex,
    depositCommitmentHex: h32('93'),
    reserve: Object.freeze({
      outputDigestHex: `0x01${'94'.repeat(32)}`,
      outputLiabilityNanoErg: amountNanoErg,
    }),
    transactions: Object.freeze({
      reserveTransition,
    }),
    boxes: Object.freeze({
      reservePredecessor,
      sourceLock,
      transitionFeeFunding,
      reserveSuccessor,
    }),
  });
  return buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1({
    batch: MINT_BATCH as never,
    target: MINT_ERGO_TARGET as never,
    candidate: MINT_CANDIDATE as never,
    committedVaultObservation: MINT_OBSERVATION as never,
  });
}

function mintEvidenceBox(idByte: string, txByte: string, index: number) {
  return Object.freeze({
    boxId: h32(idByte),
    value: '10000000',
    ergoTree: `0008cd02${'11'.repeat(33)}`,
    assets: Object.freeze([]),
    additionalRegisters: Object.freeze({}),
    creationHeight: 490,
    transactionId: h32(txByte),
    index,
  });
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/^0x/u, '');
}

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

function packetContinuationSession() {
  const session =
    createSubstrateFederatedIsolatedDevnetPacketContinuationSessionV2(
      mocks.ergoAdmissionSigner,
    );
  mocks.packetSignerBinding = session.signer;
  return session;
}

function packetCheckpointContinuationSession() {
  const session =
    createSubstrateFederatedIsolatedDevnetPacketCheckpointContinuationSessionV3(
      mocks.ergoAdmissionSigner,
    );
  mocks.packetSignerBinding = session.signer;
  return session;
}

async function checkpointReadySession() {
  const session = packetCheckpointContinuationSession();
  const packet = await session.produce(packetInput());
  const mintSourceProof = session.produceMintSourceProof(packet, {
    draft: mintDraftForTarget(requiredTargetDescriptor()),
    evidenceReceipt: MINT_EVIDENCE_RECEIPT,
    issuedAtNativeHeight: '4',
    expiresAtNativeHeight: '36',
  });
  return { session, packet, mintSourceProof };
}

function checkpointInput() {
  return Object.freeze({
    sourceNativeBlockHeight: '7',
    sourceNativeBlockHashHex: h32('61'),
    executionBlockHashHex: h32('62'),
    bridgeEventRootHex: h32('63'),
    burnLeafCount: 1,
    admissionValidFromErgoHeight: '2000',
    admissionExpiresAtErgoHeight: '2064',
  });
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
    bridgeAddressHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1.slice(2),
    bridgeRuntimeCodeSha256Hex: 'd9'.repeat(32),
    bridgeRuntimeCodeBytes: 4_104,
    tokenAddressHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1.slice(2),
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
