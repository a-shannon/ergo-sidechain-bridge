import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Mnemonic } from 'ethers';

import {
  getDupTreeDigest,
  getPooledReserveEmptyDigest,
} from './avl-bridge.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  deriveLocalWasmRootSignerPublicIdentity,
} from './local-wasm-root-signer-public-identity.js';
import {
  buildSubstrateFederatedCheckpointProfileV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './strict-json.js';

const mocks = vi.hoisted(() => ({
  familyProfile: undefined as unknown as Record<string, unknown>,
  trackerReceipt: undefined as any,
  familyReceipt: undefined as any,
  trackerCompileWait: undefined as Promise<void> | undefined,
  useActualCompilers: false,
  settlementTargetProfile: undefined as any,
  settlementObservation: undefined as any,
  acceptedSettlementObservations: new Set<unknown>(),
  settlementReobservations: [] as Array<
    unknown | ((profile: unknown) => unknown | Promise<unknown>)
  >,
  setupCheckHeaders: [] as any[],
  setupCheckPublicKeyHex: `02${'44'.repeat(32)}`,
  setupCheckMnemonicOverride: undefined as string | undefined,
  setupCheckFailRole: undefined as string | undefined,
  setupCheckNodeIdOverride: undefined as string | undefined,
  prepareSetupCheckBatch: vi.fn(),
  checkSetupTransaction: vi.fn(),
  getSetupCheckHeaders: vi.fn(),
}));

vi.mock(
  './substrate-federated-settlement-family-v1.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('./substrate-federated-settlement-family-v1.js')
    >();
    return {
      ...actual,
      decodeSubstrateFederatedSettlementFamilyV1Profile: vi.fn(
        () => mocks.familyProfile,
      ),
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
      assertSubstrateFederatedTrackerJvmCompilerReceiptV1: vi.fn(
        (receipt: unknown) => receipt,
      ),
      compileSubstrateFederatedTrackerWithPinnedJvmV1: vi.fn(async input => {
        await mocks.trackerCompileWait;
        return mocks.useActualCompilers || mocks.trackerReceipt === undefined
          ? actual.compileSubstrateFederatedTrackerWithPinnedJvmV1(input)
          : mocks.trackerReceipt;
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
      assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1: vi.fn(
        (receipt: unknown) => receipt,
      ),
      compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1: vi.fn(
        async input => mocks.useActualCompilers || mocks.familyReceipt === undefined
          ? actual.compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1(input)
          : mocks.familyReceipt,
      ),
    };
  },
);

vi.mock(
  './substrate-federated-genesis-observation-v1.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('./substrate-federated-genesis-observation-v1.js')
    >();
    return {
      ...actual,
      assertSubstrateFederatedGenesisObservationV1Provenance: vi.fn(
        (profile: unknown, observation: unknown) => {
          if (
            profile !== mocks.settlementTargetProfile
            || (
              observation !== mocks.settlementObservation
              && !mocks.acceptedSettlementObservations.has(observation)
            )
          ) {
            throw new Error('federated genesis observation lacks same-process provenance');
          }
        },
      ),
      observeSubstrateFederatedGenesisV1: vi.fn(async profile => {
        const next = mocks.settlementReobservations.shift();
        if (next === undefined) {
          throw new Error('no isolated setup-check reobservation is available');
        }
        if (mocks.settlementTargetProfile === undefined) {
          mocks.settlementTargetProfile = profile;
        }
        const observation = typeof next === 'function'
          ? await next(profile)
          : next;
        mocks.acceptedSettlementObservations.add(observation);
        return observation;
      }),
    };
  },
);

vi.mock('./ergo-helpers.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./ergo-helpers.js')>();
  return {
    ...actual,
    ngetDirect: mocks.getSetupCheckHeaders,
  };
});

vi.mock('./fleet-signer.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./fleet-signer.js')>();
  return {
    ...actual,
    prepareLocalWasmRootCheckCandidates: mocks.prepareSetupCheckBatch,
    checkSignedTransaction: mocks.checkSetupTransaction,
  };
});

import {
  getSubstrateFederatedTrackerDigestV1Hex,
} from './substrate-federated-burn-settlement-v1.js';
import {
  runBoundedProcess,
} from './pinned-local-native-verifier-build.js';
import {
  compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1,
} from './substrate-federated-settlement-family-jvm-compiler-v1.js';
import {
  compileSubstrateFederatedTrackerWithPinnedJvmV1,
} from './substrate-federated-tracker-jvm-compiler-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetLaunchBaselineV1Provenance,
  buildSubstrateFederatedIsolatedDevnetErgoHistoryV1,
  buildSubstrateFederatedIsolatedDevnetLaunchBaselineV1,
  buildSubstrateFederatedIsolatedDevnetLaunchStatementV1,
  buildSubstrateFederatedIsolatedDevnetRelayerClosureV1,
  deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1,
  type DeriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1Input,
  type SubstrateFederatedAuthoritySafeDevnetHistoryBundleV1,
  type SubstrateFederatedIsolatedDevnetLaunchSignatureV1,
  type SubstrateFederatedIsolatedDevnetTargetPinsV1,
} from './substrate-federated-isolated-devnet-launch-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetGenerationV1Provenance,
  buildSubstrateFederatedIsolatedDevnetGenerationV1,
} from './substrate-federated-isolated-devnet-generation-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetProvisioningV1Provenance,
  buildSubstrateFederatedIsolatedDevnetProvisioningV1,
} from './substrate-federated-isolated-devnet-provisioning-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetSettlementTargetV2Provenance,
  buildSubstrateFederatedIsolatedDevnetSettlementTargetV2,
} from './substrate-federated-isolated-devnet-settlement-target-v2.js';
import {
  assertSubstrateFederatedIsolatedDevnetLocalProvisioningV2Provenance,
  buildSubstrateFederatedIsolatedDevnetLocalProvisioningV2,
} from './substrate-federated-isolated-devnet-local-provisioning-v2.js';
import {
  assertSubstrateFederatedIsolatedDevnetSetupCheckRequestV2Provenance,
  buildSubstrateFederatedIsolatedDevnetSetupCheckRequestV2,
  validateSubstrateFederatedIsolatedDevnetSetupCheckRequestV2,
} from './substrate-federated-isolated-devnet-setup-check-request-v2.js';
import {
  runSubstrateFederatedIsolatedDevnetSetupCheckV2,
  validateSubstrateFederatedIsolatedDevnetSetupCheckReceiptV2,
} from './substrate-federated-isolated-devnet-setup-check-v2.js';
import {
  deriveDevnetRewardErgoTreeHexForDelay,
} from './relayer-core/devnet-reward-consolidation.js';
import {
  replaySubstrateFederatedIsolatedDevnetPortableV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ATTESTATION_PACKET_V1_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_UTXO_HISTORY_V1_SCHEMA,
  takeSubstrateFederatedIsolatedDevnetPortableReplayContinuationV1,
  type SubstrateFederatedIsolatedDevnetPortableReplayV1,
} from './substrate-federated-isolated-devnet-portable-replay-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_ARTIFACT_PATHS_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_REQUEST_V1_SCHEMA,
} from './substrate-federated-isolated-devnet-portable-replay-files-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetMiningCredentialV1,
} from './substrate-federated-isolated-devnet-mining-credential-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance,
  claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2,
  createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2,
} from './substrate-federated-isolated-devnet-setup-check-runner-v2.js';
import {
  createSubstrateFederatedIsolatedDevnetPacketSessionV1,
} from './substrate-federated-isolated-devnet-packet-producer-v1.js';
import {
  buildSubstrateFederatedGreenfieldErgoHistoryV1,
  buildSubstrateFederatedGreenfieldLaunchBaselineV1,
  buildSubstrateFederatedGreenfieldLaunchStatementV1,
  buildSubstrateFederatedGreenfieldRelayerClosureV1,
  buildSubstrateFederatedGreenfieldSourceHistoryV1,
  deriveSubstrateFederatedGreenfieldTargetDescriptorV1,
} from './substrate-federated-greenfield-launch-v1.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
} from './validity-application-pooled-reserve-instance-v4.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';
import {
  buildSubstrateFederatedTrackerCompilerRequestV1,
} from './substrate-federated-tracker-compiler-v1.js';

const HISTORY_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_HISTORY_V1';
const PORTABLE_REPLAY_SCRIPT =
  'src/scripts/replay-substrate-federated-isolated-devnet-launch-v1.ts';
const BRIDGE_ADDRESS = '06'.repeat(20);
const TOKEN_ADDRESS = '07'.repeat(20);
const SOURCE_RUNTIME_DIGEST = '08'.repeat(32);
const BRIDGE_RUNTIME_DIGEST = '09'.repeat(32);
const TOKEN_RUNTIME_DIGEST = '0a'.repeat(32);
const GENESIS_NATIVE_HASH = '0b'.repeat(32);
const TIP_NATIVE_HASH = '0c'.repeat(32);
const TIP_EXECUTION_HASH = '0d'.repeat(32);
const FUNDING_TREE = `0008cd02${'22'.repeat(32)}`;
const TEST_SETUP_CHECK_SIGNER_INPUT = Mnemonic.fromEntropy(
  `0x${'42'.repeat(32)}`,
).phrase;
const MISMATCH_SETUP_CHECK_SIGNER_INPUT = Mnemonic.fromEntropy(
  `0x${'43'.repeat(32)}`,
).phrase;
const BASE_GENESIS_INPUT: Eip12Box = {
  boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5',
  value: '300000000',
  ergoTree: FUNDING_TREE,
  assets: [],
  additionalRegisters: {},
  creationHeight: 110,
  transactionId: '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab',
  index: 0,
};

interface SourceSigner {
  readonly privateKey: KeyObject;
  readonly publicKeyHex: string;
}

let sourceSigners: readonly SourceSigner[];
let descriptorInput: DeriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1Input;
let portableReplayFixturePromise: Promise<PortableReplayFixture> | undefined;

type SetupCheckRequestMutation = readonly [
  string,
  (candidate: any) => void,
];

const SETUP_CHECK_SOURCE_BINDING_FIELDS = [
  'provisioningPlanDigestHex',
  'launchIntentIdHex',
  'settlementTargetDigestHex',
  'sourceAndCompilerClosureDigestHex',
  'compatibilityTargetV1AuditDigestHex',
  'freshObservationDigestHex',
  'genesisPayloadSetDigestHex',
  'provisioningIdentitySetDigestHex',
] as const;

const SETUP_CHECK_STAGE_FIELDS = [
  'requestFreeze',
  'unsignedBytes',
  'signedBytes',
  'jvmCheck',
  'nodeCheck',
  'submission',
  'broadcast',
  'confirmation',
] as const;

const SETUP_CHECK_AUTHORITY_FIELDS = [
  'containsSignedTransactionBytes',
  'containsPrivateKeyOrSignerMaterial',
  'containsSignerCapability',
  'containsJvmCheckerCapability',
  'containsNodeClientOrTransportCapability',
  'containsSubmissionCapability',
  'containsBroadcastCapability',
  'v1TestnetPromotionAccepted',
  'targetNodeAcceptanceEstablished',
  'setupTransactionsSigned',
  'setupTransactionsSubmitted',
  'setupTransactionsBroadcast',
  'canonicalLineagesEstablished',
  'profileActivated',
  'fundsAuthorityEstablished',
  'gate5Closed',
  'trustlessStatusEstablished',
  'productionReadinessEstablished',
] as const;

const SETUP_CHECK_REQUEST_MUTATIONS: readonly SetupCheckRequestMutation[] = [
  ['request digest', candidate => {
    candidate.requestDigestHex = '01'.repeat(32);
  }],
  ['schema family', candidate => {
    candidate.schema = 'e2s.substrate-federated-genesis-setup-check-request.v1';
  }],
  ['version', candidate => {
    candidate.version = 1;
  }],
  ...SETUP_CHECK_SOURCE_BINDING_FIELDS.map(field => [
    `source binding ${field}`,
    (candidate: any) => {
      candidate.sourceBindings[field] = '02'.repeat(32);
    },
  ] as const),
  ['source network scope', candidate => {
    candidate.target.sourceNetworkScope = 'public-testnet';
  }],
  ['V1 testnet promotion', candidate => {
    candidate.target.settlementNetworkScope = 'ergo-testnet';
  }],
  ['target environment', candidate => {
    candidate.target.environment = 'testnet';
  }],
  ['reported network', candidate => {
    candidate.target.nodeReportedNetwork = 'testnet';
  }],
  ['genesis identity', candidate => {
    candidate.target.genesisHeaderIdHex = '03'.repeat(32);
  }],
  ['profile identity', candidate => {
    candidate.target.profileIdHex = '04'.repeat(32);
  }],
  ['profile digest', candidate => {
    candidate.target.profileDigestHex = '05'.repeat(32);
  }],
  ['pre-setup anchor header', candidate => {
    candidate.target.preSetupAnchor.headerIdHex = '06'.repeat(32);
  }],
  ['pre-setup anchor height', candidate => {
    candidate.target.preSetupAnchor.height += 1;
  }],
  ['observation timestamp', candidate => {
    candidate.target.observedAt = '2020-01-01T00:00:00.000Z';
  }],
  ['observation-age policy', candidate => {
    candidate.target.maximumObservationAgeMs += 1;
  }],
  ['primary target origin', candidate => {
    candidate.target.primary.nodeOrigin = 'http://127.0.0.1:9991';
  }],
  ['primary target source ID', candidate => {
    candidate.target.primary.sourceIdHex = '07'.repeat(32);
  }],
  ['witness target origin', candidate => {
    candidate.target.witness.nodeOrigin = 'http://127.0.0.1:9992';
  }],
  ['witness target source ID', candidate => {
    candidate.target.witness.sourceIdHex = '08'.repeat(32);
  }],
  ['signing network prefix', candidate => {
    candidate.checkPolicy.signingNetworkPrefix = 0;
  }],
  ['state-context origin', candidate => {
    candidate.checkPolicy.stateContext.nodeOrigin =
      'http://127.0.0.1:9993';
  }],
  ['state-context method', candidate => {
    candidate.checkPolicy.stateContext.method = 'POST';
  }],
  ['state-context path', candidate => {
    candidate.checkPolicy.stateContext.path = '/info';
  }],
  ['node-check origin', candidate => {
    candidate.checkPolicy.nodeCheck.nodeOrigin = 'http://127.0.0.1:9994';
  }],
  ['node-check method', candidate => {
    candidate.checkPolicy.nodeCheck.method = 'PUT';
  }],
  ['node-check path', candidate => {
    candidate.checkPolicy.nodeCheck.path = '/transactions';
  }],
  ['transaction order', candidate => {
    candidate.checkPolicy.nodeCheck.transactionOrder.reverse();
  }],
  ['same-origin policy', candidate => {
    candidate.checkPolicy.sameOriginRequired = false;
  }],
  ['transport policy', candidate => {
    candidate.checkPolicy.transportPolicy = 'default';
  }],
  ['submission endpoint', candidate => {
    candidate.checkPolicy.submissionEndpointPresent = true;
  }],
  ['broadcast endpoint', candidate => {
    candidate.checkPolicy.broadcastEndpointPresent = true;
  }],
  ['issuance order', candidate => {
    candidate.orderedIssuances.reverse();
  }],
  ['issuance ordinal', candidate => {
    candidate.orderedIssuances[0].ordinal = 2;
  }],
  ['issuance role', candidate => {
    candidate.orderedIssuances[0].role = 'pooled-reserve';
  }],
  ['provisioning identity', candidate => {
    candidate.orderedIssuances[0].provisioningIdentityDigestHex =
      '09'.repeat(32);
  }],
  ['genesis input identity', candidate => {
    candidate.orderedIssuances[0].genesisInputBoxIdHex = '0a'.repeat(32);
  }],
  ['input ErgoTree', candidate => {
    candidate.orderedIssuances[0].requiredInputErgoTreeHex = '0008cd00';
  }],
  ['unsigned transaction ID', candidate => {
    candidate.orderedIssuances[0].unsignedTransactionIdHex = '0b'.repeat(32);
  }],
  ['unsigned transaction body', candidate => {
    candidate.orderedIssuances[0].unsignedTransactionBody.outputs[0]
      .creationHeight += 1;
  }],
  ['unsigned body digest', candidate => {
    candidate.orderedIssuances[0].unsignedTransactionBodyDigestHex =
      '0c'.repeat(32);
  }],
  ['materialized transaction digest', candidate => {
    candidate.orderedIssuances[0].materializedTransactionDigestHex =
      '0d'.repeat(32);
  }],
  ['bytes to sign', candidate => {
    candidate.orderedIssuances[0].bytesToSignHex =
      `00${candidate.orderedIssuances[0].bytesToSignHex.slice(2)}`;
  }],
  ['bytes-to-sign length', candidate => {
    candidate.orderedIssuances[0].bytesToSignBytes += 1;
  }],
  ['bytes-to-sign digest', candidate => {
    candidate.orderedIssuances[0].bytesToSignBlake2b256Hex = '0e'.repeat(32);
  }],
  ['state output box identity', candidate => {
    candidate.orderedIssuances[1].predictedStateOutput.boxIdHex =
      '0f'.repeat(32);
  }],
  ['state output transaction identity', candidate => {
    candidate.orderedIssuances[1].predictedStateOutput.transactionIdHex =
      '10'.repeat(32);
  }],
  ['state output index', candidate => {
    candidate.orderedIssuances[1].predictedStateOutput.index = 1;
  }],
  ['state output height', candidate => {
    candidate.orderedIssuances[1].predictedStateOutput.creationHeight += 1;
  }],
  ['state output body digest', candidate => {
    candidate.orderedIssuances[1].predictedStateOutput.bodyDigestHex =
      '11'.repeat(32);
  }],
  ...SETUP_CHECK_STAGE_FIELDS.map(field => [
    `stage ${field}`,
    (candidate: any) => {
      candidate.stages[field] = 'promoted';
    },
  ] as const),
  ...SETUP_CHECK_AUTHORITY_FIELDS.map(field => [
    `authority boundary ${field}`,
    (candidate: any) => {
      candidate.boundaries[field] = true;
    },
  ] as const),
  ['unknown capability field', candidate => {
    candidate.signer = { sign: 'not-allowed' };
  }],
];

describe('Substrate federated isolated-devnet launch V1', () => {
  beforeAll(async () => {
    sourceSigners = Array.from({ length: 3 }, sourceSigner)
      .sort((left, right) => left.publicKeyHex < right.publicKeyHex ? -1 : 1);
    mocks.setupCheckPublicKeyHex = (
      await deriveLocalWasmRootSignerPublicIdentity(
        TEST_SETUP_CHECK_SIGNER_INPUT,
      )
    ).publicKeyHex;
    descriptorInput = targetInput(historyFixture());
  });

  it('binds the exact persisted G1dA closure under distinct isolated-devnet domains', () => {
    const target = deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1(
      descriptorInput,
    );
    const statement = launchStatement(target);
    const signatures = signStatement(statement.attestationDigestHex);
    const baseline = buildSubstrateFederatedIsolatedDevnetLaunchBaselineV1({
      statement,
      signatures,
    });
    const { descriptorDigestHex, ...descriptorBody } = target;
    expect(descriptorDigestHex).toBe(domainDigest(
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TARGET_DESCRIPTOR_V1',
      descriptorBody,
    ));
    const {
      statementDigestHex,
      attestationDigestHex,
      ...statementBody
    } = statement;
    expect(statementDigestHex).toBe(domainDigest(
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LAUNCH_STATEMENT_V1',
      statementBody,
    ));
    expect(attestationDigestHex).toBe(domainDigest(
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LAUNCH_ATTESTATION_V1',
      {
        statementDigestHex,
        sourceAttestationKeySetDigestHex:
          target.federation.sourceAttestationKeySetDigestHex,
        sourceAttestationThreshold:
          target.federation.sourceAttestationThreshold,
      },
    ));
    const { baselineDigestHex, ...baselineBody } = baseline;
    expect(baselineDigestHex).toBe(domainDigest(
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LAUNCH_BASELINE_V1',
      baselineBody,
    ));

    expect(target).toMatchObject({
      schema: 'e2s.substrate-federated-isolated-devnet-target-descriptor.v1',
      settlementNetworkId: 'ergo-testnet',
      sourceNetworkScope: 'isolated-devnet',
      trustModel: 'federated_non_trustless',
      capturedSourceHistory: {
        status: 'isolated_exact_target_history_collected',
        acceptanceDigestHex:
          descriptorInput.trustPins.expectedAcceptanceDigestHex,
        historyDigestHex: descriptorInput.trustPins.expectedHistoryDigestHex,
        interval: { observedTipHeight: '2', blockCount: 3 },
      },
      checks: {
        exactG1dAArtifactsRehashed: true,
        exactG1dAApplicationJoinedToCompilerClosure: true,
        explicitSourceDomainPinsMatched: true,
        explicitArtifactPinsMatched: true,
        explicitSourceAttestationKeySetPinMatched: true,
      },
      boundaries: {
        sourceDomainObservedInCapturedHistory: false,
        sourceAttestationQuorumVerified: false,
        sourceFinalityAuthenticated: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(statement).toMatchObject({
      schema: 'e2s.substrate-federated-isolated-devnet-launch-statement.v1',
      settlementNetworkId: 'ergo-testnet',
      sourceNetworkScope: 'isolated-devnet',
      routeCoverage: { routeCount: 53 },
      claims: {
        ergoHistoryArtifactsBound: true,
        relayerArtifactClosureBound: true,
        predecessorRoutesAttestedNotInstantiated: true,
      },
    });
    expect(baseline).toMatchObject({
      status: 'authenticated_federated_isolated_devnet_baseline',
      checks: {
        exactSourceAttestationThresholdVerified: true,
        exactG1dAHistoryClosureBound: true,
      },
      boundaries: {
        sourceAttestationQuorumIsLaunchHistoryAuthority: true,
        sourceConsensusIndependentlyVerified: false,
        independentSourceAdministrationEstablished: false,
        sourceFinalityAuthenticated: false,
        targetNodeAcceptanceEstablished: false,
        setupLineagesEstablished: false,
        profileActivated: false,
        fundsAuthorityEstablished: false,
      },
    });
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetLaunchBaselineV1Provenance(baseline)
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetLaunchBaselineV1Provenance({
        ...baseline,
      })
    ).toThrow(/not built in this process/);
  });

  it('rebinds the source/compiler closure to an observed local Ergo devnet under V2', () => {
    const sourceTarget =
      deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1(descriptorInput);
    const { profile, observation } = localSettlementObservation(sourceTarget);
    mocks.settlementTargetProfile = profile;
    mocks.settlementObservation = observation;

    const target = buildSubstrateFederatedIsolatedDevnetSettlementTargetV2({
      ...descriptorInput,
      settlementTargetProfile: profile,
      settlementObservation: observation,
    });
    const {
      schema: _sourceSchema,
      version: _sourceVersion,
      descriptorDigestHex: _sourceDescriptorDigest,
      settlementNetworkId: _sourceSettlementNetwork,
      ...sourceAndCompilerClosure
    } = sourceTarget;
    const { descriptorDigestHex, ...body } = target;
    expect(descriptorDigestHex).toBe(domainDigest(
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETTLEMENT_TARGET_V2',
      body,
    ));
    expect(target.sourceAndCompilerClosureDigestHex).toBe(domainDigest(
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_AND_COMPILER_CLOSURE_V2',
      sourceAndCompilerClosure,
    ));
    expect(target.sourceAndCompilerClosureDigestHex)
      .not.toBe(sourceTarget.descriptorDigestHex);
    expect(target).toMatchObject({
      schema: 'e2s.substrate-federated-isolated-devnet-settlement-target.v2',
      version: 2,
      compatibilityTargetV1AuditDigestHex: sourceTarget.descriptorDigestHex,
      sourceNetworkScope: 'isolated-devnet',
      trustModel: 'federated_non_trustless',
      settlementNetwork: {
        scope: 'ergo-local-devnet',
        nodeReportedNetwork: 'devnet',
        environment: 'patched-devnet',
        profileIdHex: profile.profileIdHex,
        profileDigestHex: profile.profileDigestHex,
        observation: {
          reportDigestHex: observation.reportDigestHex,
          observedAt: observation.observedAt,
          revalidationRequiredBeforeMaterialization: true,
        },
        genesisHeader: {
          idHex: observation.target.genesisHeaderIdHex,
          height: 1,
        },
        observedTip: {
          idHex: observation.target.tipHeaderIdHex,
          height: observation.target.tipHeight,
        },
        genesisInputs: {
          trackerBoxIdHex:
            sourceTarget.lineages.tracker.genesisInputBoxIdHex,
          duplicatePreventionBoxIdHex:
            sourceTarget.lineages.duplicatePrevention.genesisInputBoxIdHex,
          pooledReserveBoxIdHex:
            sourceTarget.lineages.pooledReserve.genesisInputBoxIdHex,
        },
      },
      settlementChecks: {
        sameProcessDualOriginObservationVerified: true,
        exactLocalDevnetNetworkMatched: true,
        exactThreeGenesisInputsMatchedCompiledLineages: true,
        pureErgRegisterFreeInputsObservedAtSnapshot: true,
      },
      materializationBoundary: {
        retainedObservationAuthorizesMaterialization: false,
        freshSameProcessObservationRequired: true,
        exactCanonicalEip12AndSigmaBoxesRequired: true,
        genesisInputsMustRemainInCurrentUtxoView: true,
      },
      settlementBoundaries: {
        compatibilityTargetV1DigestAuthorizesSettlementNetwork: false,
        ergoConsensusIndependentlyAuthenticated: false,
        setupLineagesEstablished: false,
        setupTransactionsChecked: false,
        setupTransactionsSigned: false,
        setupTransactionsSubmitted: false,
        setupTransactionsBroadcast: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(target).not.toHaveProperty('settlementNetworkId');
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetSettlementTargetV2Provenance(target)
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetSettlementTargetV2Provenance({
        ...target,
      })
    ).toThrow(/not built in this process/);
  });

  it('rejects local-settlement provenance, network and environment drift', () => {
    const sourceTarget =
      deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1(descriptorInput);
    const fixture = localSettlementObservation(sourceTarget);
    mocks.settlementTargetProfile = fixture.profile;
    mocks.settlementObservation = fixture.observation;
    const input = {
      ...descriptorInput,
      settlementTargetProfile: fixture.profile,
      settlementObservation: fixture.observation,
    };

    expect(() =>
      buildSubstrateFederatedIsolatedDevnetSettlementTargetV2({
        ...input,
        settlementObservation: structuredClone(fixture.observation),
      })
    ).toThrow(/same-process provenance/);

    const wrongNetwork = structuredClone(fixture.observation);
    wrongNetwork.target.network = 'testnet';
    mocks.settlementObservation = wrongNetwork;
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetSettlementTargetV2({
        ...input,
        settlementObservation: wrongNetwork,
      })
    ).toThrow(/exact devnet observation/);

    const wrongProfileNetwork = structuredClone(fixture.profile);
    wrongProfileNetwork.expectedNetwork = 'testnet';
    mocks.settlementTargetProfile = wrongProfileNetwork;
    mocks.settlementObservation = fixture.observation;
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetSettlementTargetV2({
        ...input,
        settlementTargetProfile: wrongProfileNetwork,
      })
    ).toThrow(/exact devnet observation/);

    const matchingWrongProfile = structuredClone(fixture.profile);
    matchingWrongProfile.expectedNetwork = 'testnet';
    const matchingWrongObservation = structuredClone(fixture.observation);
    matchingWrongObservation.target.network = 'testnet';
    mocks.settlementTargetProfile = matchingWrongProfile;
    mocks.settlementObservation = matchingWrongObservation;
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetSettlementTargetV2({
        ...input,
        settlementTargetProfile: matchingWrongProfile,
        settlementObservation: matchingWrongObservation,
      })
    ).toThrow(/exact devnet observation/);

    const wrongEnvironment = structuredClone(fixture.profile);
    wrongEnvironment.environment = 'testnet';
    mocks.settlementTargetProfile = wrongEnvironment;
    mocks.settlementObservation = fixture.observation;
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetSettlementTargetV2({
        ...input,
        settlementTargetProfile: wrongEnvironment,
      })
    ).toThrow(/devnet environment/);

    const missingRevalidation = structuredClone(fixture.observation);
    missingRevalidation.boundary.revalidationRequiredBeforeMaterialization =
      false;
    mocks.settlementTargetProfile = fixture.profile;
    mocks.settlementObservation = missingRevalidation;
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetSettlementTargetV2({
        ...input,
        settlementObservation: missingRevalidation,
      })
    ).toThrow(/must require revalidation before materialization/);
  });

  it.each([
    ['tracker', 'tracker'],
    ['duplicate-prevention', 'duplicatePrevention'],
    ['pooled-reserve', 'pooledReserve'],
  ] as const)('rejects %s genesis-lineage substitution', (_label, role) => {
    const sourceTarget =
      deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1(descriptorInput);
    const fixture = localSettlementObservation(sourceTarget);
    const wrongLineage = structuredClone(fixture.observation);
    wrongLineage.boxes[role].box.boxId = 'ff'.repeat(32);
    mocks.settlementTargetProfile = fixture.profile;
    mocks.settlementObservation = wrongLineage;
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetSettlementTargetV2({
        ...descriptorInput,
        settlementTargetProfile: fixture.profile,
        settlementObservation: wrongLineage,
      })
    ).toThrow(/genesis inputs differ/);
  });

  it('materializes one deterministic local V2 launch intent from a fresh observation', async () => {
    const fixture = await localProvisioningFixture();
    try {
      const { sourceTarget, retained, settlementTarget, genesisInputs } =
        fixture;
      const freshObservation = await freshLocalSettlementObservation(
        sourceTarget,
        retained.profile,
        genesisInputs,
      );
      mocks.settlementObservation = freshObservation;

      const first =
        await buildSubstrateFederatedIsolatedDevnetLocalProvisioningV2({
          settlementTarget,
          settlementTargetProfile: retained.profile,
          freshSettlementObservation: freshObservation,
        });
      const second =
        await buildSubstrateFederatedIsolatedDevnetLocalProvisioningV2({
          settlementTarget,
          settlementTargetProfile: retained.profile,
          freshSettlementObservation: freshObservation,
        });
      const { planDigestHex, ...body } = first;
      expect(planDigestHex).toBe(domainDigest(
        'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LOCAL_PROVISIONING_V2',
        body,
      ));
      expect(canonicalJson(second)).toBe(canonicalJson(first));
      expect(first).toMatchObject({
      schema: 'e2s.substrate-federated-isolated-devnet-local-provisioning.v2',
      version: 2,
      status: 'fresh_observation_bound_non_authorizing_local_provisioning',
      target: {
        settlementTargetDigestHex: settlementTarget.descriptorDigestHex,
        sourceAndCompilerClosureDigestHex:
          settlementTarget.sourceAndCompilerClosureDigestHex,
        compatibilityTargetV1AuditDigestHex:
          settlementTarget.compatibilityTargetV1AuditDigestHex,
        settlementNetworkScope: 'ergo-local-devnet',
      },
      freshObservation: {
        retainedReportDigestHex:
          retained.observation.reportDigestHex,
        reportDigestHex: freshObservation.reportDigestHex,
        preSetupAnchor: {
          headerIdHex: freshObservation.target.tipHeaderIdHex,
          height: freshObservation.target.tipHeight,
        },
      },
      globalReplay: {
        canonicalBurnIdsHex: [],
        canonicalBurnIdCount: 0,
        duplicatePreventionDigestHex: getDupTreeDigest([]),
        derivation: 'empty-new-local-profile-intent',
        predecessorNonInstantiationAuthenticated: false,
      },
      checks: {
        sameProcessSettlementTargetVerified: true,
        sameProcessFreshObservationVerified: true,
        observationStrictlyNewerThanTargetSnapshot: true,
        localClockFreshnessWindowVerified: true,
        exactCanonicalBoxEvidenceRevalidated: true,
        exactThreeInputsObservedInCurrentUtxoView: true,
        emptyReplayRootDerivedInternally: true,
        retainedSnapshotAcceptedForMaterialization: false,
      },
      execution: {
        networkAccessPerformed: false,
        nodeCheckPerformed: false,
        signedTransactionConstructed: false,
        submissionPerformed: false,
        broadcastPerformed: false,
      },
      boundaries: {
        localCompatibilityIntentOnly: true,
        currentGenesisInputsObservedUnspent: true,
        tipUtxoAtomicityProved: false,
        compatibilityTargetV1DigestAuthorizesSettlementNetwork: false,
        retainedObservationAuthorizesMaterialization: false,
        ergoConsensusIndependentlyAuthenticated: false,
        setupLineagesEstablished: false,
        setupTransactionsChecked: false,
        setupTransactionsSigned: false,
        setupTransactionsSubmitted: false,
        setupTransactionsBroadcast: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
      });
      expect(first).not.toHaveProperty('settlementNetworkId');
      expect(first.provisioning.tracker.identity.creationHeight)
        .toBe(freshObservation.target.tipHeight);
      expect(first.provisioning.duplicatePrevention.identity.creationHeight)
        .toBe(freshObservation.target.tipHeight);
      expect(first.provisioning.pooledReserve.identity.creationHeight)
        .toBe(freshObservation.target.tipHeight);
      expect(first.genesisInputs.tracker).toEqual(genesisInputs.tracker);
      expect(first.genesisInputs.duplicatePrevention)
        .toEqual(genesisInputs.duplicatePrevention);
      expect(first.genesisInputs.pooledReserve)
        .toEqual(genesisInputs.pooledReserve);
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetLocalProvisioningV2Provenance(
          first,
        )
      ).not.toThrow();
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetLocalProvisioningV2Provenance({
          ...first,
        })
      ).toThrow(/not built in this process/);
    } finally {
      fixture.restore();
    }
  });

  it('rejects copied, retained and stale local V2 provisioning inputs', async () => {
    const fixture = await localProvisioningFixture();
    try {
      const { sourceTarget, retained, settlementTarget, genesisInputs } =
        fixture;
      const freshObservation = await freshLocalSettlementObservation(
        sourceTarget,
        retained.profile,
        genesisInputs,
      );
      const input = {
        settlementTarget,
        settlementTargetProfile: retained.profile,
        freshSettlementObservation: freshObservation,
      };
      mocks.settlementObservation = freshObservation;

      await expect(
        buildSubstrateFederatedIsolatedDevnetLocalProvisioningV2({
          ...input,
          settlementTarget: structuredClone(settlementTarget),
        }),
      ).rejects.toThrow(/not built in this process/);
      await expect(
        buildSubstrateFederatedIsolatedDevnetLocalProvisioningV2({
          ...input,
          freshSettlementObservation: structuredClone(freshObservation),
        }),
      ).rejects.toThrow(/same-process provenance/);

      const reusedDigestObservation = structuredClone(freshObservation);
      reusedDigestObservation.reportDigestHex =
        retained.observation.reportDigestHex;
      mocks.settlementObservation = reusedDigestObservation;
      await expect(
        buildSubstrateFederatedIsolatedDevnetLocalProvisioningV2({
          ...input,
          freshSettlementObservation: reusedDigestObservation,
        }),
      ).rejects.toThrow(/newer than the retained target snapshot/);

      const nonNewerObservation = structuredClone(freshObservation);
      nonNewerObservation.observedAt = retained.observation.observedAt;
      mocks.settlementObservation = nonNewerObservation;
      await expect(
        buildSubstrateFederatedIsolatedDevnetLocalProvisioningV2({
          ...input,
          freshSettlementObservation: nonNewerObservation,
        }),
      ).rejects.toThrow(/newer than the retained target snapshot/);

      const futureObservation = structuredClone(freshObservation);
      futureObservation.observedAt = new Date(Date.now() + 10_000).toISOString();
      futureObservation.reportDigestHex = 'd8'.repeat(32);
      mocks.settlementObservation = futureObservation;
      await expect(
        buildSubstrateFederatedIsolatedDevnetLocalProvisioningV2({
          ...input,
          freshSettlementObservation: futureObservation,
        }),
      ).rejects.toThrow(/fixed local clock window/);

      const staleObservation = structuredClone(freshObservation);
      staleObservation.observedAt = '2021-01-01T00:00:00.000Z';
      staleObservation.reportDigestHex = 'd9'.repeat(32);
      mocks.settlementObservation = staleObservation;
      await expect(
        buildSubstrateFederatedIsolatedDevnetLocalProvisioningV2({
          ...input,
          freshSettlementObservation: staleObservation,
        }),
      ).rejects.toThrow(/fixed local clock window/);
    } finally {
      fixture.restore();
    }
  });

  it('rechecks local observation freshness after asynchronous materialization', async () => {
    const fixture = await localProvisioningFixture();
    let nowSpy: ReturnType<typeof vi.spyOn> | undefined;
    try {
      const freshObservation = await freshLocalSettlementObservation(
        fixture.sourceTarget,
        fixture.retained.profile,
        fixture.genesisInputs,
      );
      mocks.settlementObservation = freshObservation;
      const observedAtMs = Date.parse(freshObservation.observedAt);
      nowSpy = vi.spyOn(Date, 'now')
        .mockReturnValue(observedAtMs + 60_001)
        .mockReturnValueOnce(observedAtMs + 59_999);

      await expect(
        buildSubstrateFederatedIsolatedDevnetLocalProvisioningV2({
          settlementTarget: fixture.settlementTarget,
          settlementTargetProfile: fixture.retained.profile,
          freshSettlementObservation: freshObservation,
        }),
      ).rejects.toThrow(/fixed local clock window/);
      expect(nowSpy).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy?.mockRestore();
      fixture.restore();
    }
  });

  it.each([
    ['tracker current UTXO presence', (observation: any) => {
      observation.boxes.tracker.checks.presentInCurrentUtxoView = false;
    }, /does not preserve exact validated evidence/],
    ['duplicate-prevention current UTXO presence', (observation: any) => {
      observation.boxes.duplicatePrevention.checks.presentInCurrentUtxoView =
        false;
    }, /does not preserve exact validated evidence/],
    ['pooled-reserve current UTXO presence', (observation: any) => {
      observation.boxes.pooledReserve.checks.presentInCurrentUtxoView = false;
    }, /does not preserve exact validated evidence/],
    ['tracker Sigma-box digest', (observation: any) => {
      observation.boxes.tracker.sigmaSerializedSha256Hex = 'ff'.repeat(32);
    }, /does not preserve exact validated evidence/],
    ['duplicate-prevention Sigma-box digest', (observation: any) => {
      observation.boxes.duplicatePrevention.sigmaSerializedSha256Hex =
        'ff'.repeat(32);
    }, /does not preserve exact validated evidence/],
    ['pooled-reserve Sigma-box digest', (observation: any) => {
      observation.boxes.pooledReserve.sigmaSerializedSha256Hex =
        'ff'.repeat(32);
    }, /does not preserve exact validated evidence/],
    ['tracker compiled lineage', (observation: any) => {
      observation.boxes.tracker = {
        ...structuredClone(observation.boxes.duplicatePrevention),
        role: 'tracker',
      };
    }, /does not match the requested box ID/],
    ['duplicate-prevention compiled lineage', (observation: any) => {
      observation.boxes.duplicatePrevention = {
        ...structuredClone(observation.boxes.pooledReserve),
        role: 'duplicate-prevention',
      };
    }, /does not match the requested box ID/],
    ['pooled-reserve compiled lineage', (observation: any) => {
      observation.boxes.pooledReserve = {
        ...structuredClone(observation.boxes.tracker),
        role: 'pooled-reserve',
      };
    }, /does not match the requested box ID/],
    ['profile genesis', (_observation: any, profile: any) => {
      profile.expectedGenesisHeaderIdHex = 'dd'.repeat(32);
    }, /profile or genesis differs/],
  ] as const)(
    'rejects local V2 provisioning %s drift',
    async (_label, mutate, expectedError) => {
      const fixture = await localProvisioningFixture();
      try {
        const profile = structuredClone(fixture.retained.profile);
        const observation = await freshLocalSettlementObservation(
          fixture.sourceTarget,
          profile,
          fixture.genesisInputs,
        );
        mutate(observation, profile);
        mocks.settlementTargetProfile = profile;
        mocks.settlementObservation = observation;
        await expect(
          buildSubstrateFederatedIsolatedDevnetLocalProvisioningV2({
            settlementTarget: fixture.settlementTarget,
            settlementTargetProfile: profile,
            freshSettlementObservation: observation,
          }),
        ).rejects.toThrow(expectedError);
      } finally {
        fixture.restore();
      }
    },
  );

  it.each([
    ['remote primary origin', (observation: any) => {
      observation.sources.primary.endpointOrigin = 'https://example.invalid';
    }, /primary node origin must be an exact canonical loopback origin/],
    ['remote witness origin', (observation: any) => {
      observation.sources.witness.endpointOrigin = 'https://example.invalid';
    }, /witness node origin must be an exact canonical loopback origin/],
    ['non-canonical primary origin', (observation: any) => {
      observation.sources.primary.endpointOrigin = 'http://127.0.0.1:9051/';
    }, /primary node origin must be an exact canonical loopback origin/],
    ['shared node origin', (observation: any) => {
      observation.sources.witness.endpointOrigin =
        observation.sources.primary.endpointOrigin;
    }, /requires distinct node origins/],
    ['invalid primary source identity', (observation: any) => {
      observation.sources.primary.sourceIdHex = 'ff';
    }, /primary source ID must be canonical lowercase 32-byte hex/],
    ['invalid witness source identity', (observation: any) => {
      observation.sources.witness.sourceIdHex = 'ff';
    }, /witness source ID must be canonical lowercase 32-byte hex/],
  ] as const)(
    'rejects local setup-check target %s',
    async (_label, mutate, expectedError) => {
      const fixture = await localProvisioningFixture();
      try {
        const freshObservation = await freshLocalSettlementObservation(
          fixture.sourceTarget,
          fixture.retained.profile,
          fixture.genesisInputs,
        );
        mutate(freshObservation);
        mocks.settlementObservation = freshObservation;
        await expect(
          buildSubstrateFederatedIsolatedDevnetLocalProvisioningV2({
            settlementTarget: fixture.settlementTarget,
            settlementTargetProfile: fixture.retained.profile,
            freshSettlementObservation: freshObservation,
          }),
        ).rejects.toThrow(expectedError);
      } finally {
        fixture.restore();
      }
    },
  );

  it('freezes the exact local V2 setup-check bytes without capabilities', async () => {
    const fixture = await localSetupCheckFixture();
    try {
      const first =
        await buildSubstrateFederatedIsolatedDevnetSetupCheckRequestV2(
          fixture.plan,
        );
      const second =
        await buildSubstrateFederatedIsolatedDevnetSetupCheckRequestV2(
          fixture.plan,
        );
      const { requestDigestHex, ...body } = first;
      expect(requestDigestHex).toBe(domainDigest(
        'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETUP_CHECK_REQUEST_V2',
        body,
      ));
      expect(canonicalJson(second)).toBe(canonicalJson(first));
      expect(first).toMatchObject({
        schema:
          'e2s.substrate-federated-isolated-devnet-setup-check-request.v2',
        version: 2,
        status: 'exact_non_executable_local_setup_check_request',
        sourceBindings: {
          provisioningPlanDigestHex: fixture.plan.planDigestHex,
          launchIntentIdHex: fixture.plan.launchIntentIdHex,
          freshObservationDigestHex:
            fixture.freshObservation.reportDigestHex,
          genesisPayloadSetDigestHex:
            fixture.plan.genesisPayloads.payloadSetDigestHex,
          provisioningIdentitySetDigestHex:
            fixture.plan.provisioning.identitySetDigestHex,
        },
        target: {
          sourceNetworkScope: 'isolated-devnet',
          settlementNetworkScope: 'ergo-local-devnet',
          environment: 'patched-devnet',
          nodeReportedNetwork: 'devnet',
          genesisHeaderIdHex:
            fixture.retained.profile.expectedGenesisHeaderIdHex,
          preSetupAnchor: fixture.plan.freshObservation.preSetupAnchor,
          primary: {
            nodeOrigin:
              fixture.freshObservation.sources.primary.endpointOrigin,
            sourceIdHex:
              fixture.freshObservation.sources.primary.sourceIdHex,
          },
          witness: {
            nodeOrigin:
              fixture.freshObservation.sources.witness.endpointOrigin,
            sourceIdHex:
              fixture.freshObservation.sources.witness.sourceIdHex,
          },
        },
        checkPolicy: {
          signingNetworkPrefix: 16,
          stateContext: {
            nodeOrigin:
              fixture.freshObservation.sources.primary.endpointOrigin,
            method: 'GET',
            path: '/blocks/lastHeaders/10',
          },
          nodeCheck: {
            nodeOrigin:
              fixture.freshObservation.sources.primary.endpointOrigin,
            method: 'POST',
            path: '/transactions/check',
            transactionOrder: [
              'tracker',
              'duplicate-prevention',
              'pooled-reserve',
            ],
          },
          sameOriginRequired: true,
          transportPolicy: 'no-redirect-no-proxy',
          submissionEndpointPresent: false,
          broadcastEndpointPresent: false,
        },
        stages: {
          requestFreeze: 'complete',
          unsignedBytes: 'complete',
          signedBytes: 'absent',
          jvmCheck: 'not-performed',
          nodeCheck: 'not-performed',
          submission: 'not-authorized',
          broadcast: 'not-authorized',
          confirmation: 'not-established',
        },
      });
      expect(first.orderedIssuances.map(entry => entry.role)).toEqual([
        'tracker',
        'duplicate-prevention',
        'pooled-reserve',
      ]);
      for (const issuance of first.orderedIssuances) {
        expect(issuance.bytesToSignHex.length)
          .toBe(issuance.bytesToSignBytes * 2);
        expect(issuance.bytesToSignBlake2b256Hex)
          .toBe(issuance.unsignedTransactionIdHex);
        expect(issuance.predictedStateOutput.transactionIdHex)
          .toBe(issuance.unsignedTransactionIdHex);
        expect(issuance.predictedStateOutput.index).toBe(0);
      }
      expect(Object.values(first.boundaries).every(value => value === false))
        .toBe(true);
      expect(first).not.toHaveProperty('signer');
      expect(first).not.toHaveProperty('checker');
      expect(first).not.toHaveProperty('transport');
      expect(first).not.toHaveProperty('submitter');
      expect(first).not.toHaveProperty('broadcaster');

      await expect(
        validateSubstrateFederatedIsolatedDevnetSetupCheckRequestV2(
          structuredClone(first),
          fixture.plan,
        ),
      ).resolves.toEqual(first);
      await expect(
        assertSubstrateFederatedIsolatedDevnetSetupCheckRequestV2Provenance(
          first,
          fixture.plan,
        ),
      ).resolves.toBeUndefined();
      await expect(
        assertSubstrateFederatedIsolatedDevnetSetupCheckRequestV2Provenance(
          structuredClone(first),
          fixture.plan,
        ),
      ).rejects.toThrow(/not built in this process/);
    } finally {
      fixture.restore();
    }
  });

  it.each(SETUP_CHECK_REQUEST_MUTATIONS)(
    'rejects setup-check %s drift',
    async (_label, mutate) => {
      const fixture = await localSetupCheckFixture();
      try {
        const request =
          await buildSubstrateFederatedIsolatedDevnetSetupCheckRequestV2(
            fixture.plan,
          );
        const candidate = structuredClone(request) as any;
        mutate(candidate);
        await expect(
          validateSubstrateFederatedIsolatedDevnetSetupCheckRequestV2(
            candidate,
            fixture.plan,
          ),
        ).rejects.toThrow(/does not match the provisioning plan/);
      } finally {
        fixture.restore();
      }
    },
  );

  it('rejects copied plans and non-data setup-check requests', async () => {
    const fixture = await localSetupCheckFixture();
    try {
      const request =
        await buildSubstrateFederatedIsolatedDevnetSetupCheckRequestV2(
          fixture.plan,
        );
      await expect(
        buildSubstrateFederatedIsolatedDevnetSetupCheckRequestV2(
          structuredClone(fixture.plan),
        ),
      ).rejects.toThrow(/not built in this process/);

      const accessor = structuredClone(request) as any;
      Object.defineProperty(accessor, 'target', {
        enumerable: true,
        get: () => request.target,
      });
      await expect(
        validateSubstrateFederatedIsolatedDevnetSetupCheckRequestV2(
          accessor,
          fixture.plan,
        ),
      ).rejects.toThrow(/must be an own data property/);
      await expect(
        validateSubstrateFederatedIsolatedDevnetSetupCheckRequestV2(
          new Proxy(structuredClone(request), {}),
          fixture.plan,
        ),
      ).rejects.toThrow(/must not be a Proxy/);
    } finally {
      fixture.restore();
    }
  });

  it('rejects a setup-check plan that becomes stale during serialization', async () => {
    const fixture = await localSetupCheckFixture();
    let nowSpy: ReturnType<typeof vi.spyOn> | undefined;
    try {
      const request =
        await buildSubstrateFederatedIsolatedDevnetSetupCheckRequestV2(
          fixture.plan,
        );
      const observedAtMs = Date.parse(fixture.plan.freshObservation.observedAt);
      nowSpy = vi.spyOn(Date, 'now')
        .mockReturnValue(observedAtMs + 60_001)
        .mockReturnValueOnce(observedAtMs + 59_999);
      await expect(
        assertSubstrateFederatedIsolatedDevnetSetupCheckRequestV2Provenance(
          request,
          fixture.plan,
        ),
      ).rejects.toThrow(/exceeded its fixed freshness window/);
      expect(nowSpy).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy?.mockRestore();
      fixture.restore();
    }
  });

  it('runs the exact process-owned G1dG batch without exposing signed bytes or transport', async () => {
    const fixture = await localSetupCheckFixture(
      deriveDevnetRewardErgoTreeHexForDelay(
        mocks.setupCheckPublicKeyHex,
        1,
      ),
    );
    try {
      const request =
        await buildSubstrateFederatedIsolatedDevnetSetupCheckRequestV2(
          fixture.plan,
        );
      configureSetupCheckRuntime(fixture, request);

      const receipt =
        await runSubstrateFederatedIsolatedDevnetSetupCheckV2(
          request,
          TEST_SETUP_CHECK_SIGNER_INPUT,
        );

      expect(receipt).toMatchObject({
        schema:
          'e2s.substrate-federated-isolated-devnet-setup-check-receipt.v2',
        version: 2,
        status: 'PASS',
        requestDigestHex: request.requestDigestHex,
        signer: {
          derivation: 'wasm-root',
          networkPrefix: 16,
          publicKeyHex: mocks.setupCheckPublicKeyHex,
          rewardDelayBlocks: 1,
        },
        stages: {
          syntheticWasmRootSigning: 'complete',
          jvmNodeCheck: 'complete',
          submission: 'not-authorized',
          broadcast: 'not-authorized',
          confirmation: 'not-established',
        },
        boundaries: {
          isolatedLoopbackCompatibilityOnly: true,
          exactThreeTransactionsSigned: true,
          signedTransactionBytesProducedInMemory: true,
          signedTransactionBytesPersisted: false,
          exactThreeJvmNodeChecksPassed: true,
          exactNodeRuntimeIdentityEstablished: false,
          containsSignedTransactionBytes: false,
          containsSubmissionCapability: false,
          containsBroadcastCapability: false,
          canonicalLineagesEstablished: false,
          fundsAuthorityEstablished: false,
          gate5Closed: false,
        },
      });
      expect(receipt.orderedChecks.map(check => check.role)).toEqual([
        'tracker',
        'duplicate-prevention',
        'pooled-reserve',
      ]);
      expect(receipt.orderedChecks.every(check =>
        check.signedTransactionBytesLength > 0
        && check.signedTransactionIdHex === check.nodeTransactionIdHex
      )).toBe(true);
      expect(JSON.stringify(receipt)).not.toContain(TEST_SETUP_CHECK_SIGNER_INPUT);
      expect(JSON.stringify(receipt)).not.toMatch(
        /"(?:signedTx|privateKey|mnemonic|submitter|broadcaster)"/iu,
      );
      expect(mocks.getSetupCheckHeaders).toHaveBeenCalledWith(
        '/blocks/lastHeaders/10',
        request.target.primary.nodeOrigin,
      );
      expect(mocks.prepareSetupCheckBatch).toHaveBeenCalledTimes(1);
      expect(mocks.checkSetupTransaction).toHaveBeenCalledTimes(3);
      expect(mocks.settlementReobservations).toHaveLength(0);

      expect(
        validateSubstrateFederatedIsolatedDevnetSetupCheckReceiptV2(
          structuredClone(receipt),
          structuredClone(request),
        ),
      ).toEqual(receipt);
    } finally {
      fixture.restore();
    }
  });

  it('composes the portable G1dA closure through G1dG in one fixed process', async () => {
    const session =
      await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
    await withPortableReplayFixture(async fixture => {
      configureFixedSetupCheckRunnerRuntime(fixture);

      const receipt = await session.run({
        portableReplayInput: fixture.input,
        primaryNodeOrigin: 'http://127.0.0.1:9051',
        witnessNodeOrigin: 'http://127.0.0.1:9052',
      });

      expect(receipt).toMatchObject({
        schema:
          'e2s.substrate-federated-isolated-devnet-setup-check-receipt.v2',
        status: 'PASS',
        target: {
          genesisHeaderIdHex:
            fixture.statement.histories.ergo.genesis.headerIdHex,
          primary: { nodeOrigin: 'http://127.0.0.1:9051' },
          witness: { nodeOrigin: 'http://127.0.0.1:9052' },
        },
        stages: {
          syntheticWasmRootSigning: 'complete',
          jvmNodeCheck: 'complete',
          submission: 'not-authorized',
          broadcast: 'not-authorized',
        },
        boundaries: {
          exactThreeJvmNodeChecksPassed: true,
          exactNodeRuntimeIdentityEstablished: false,
          canonicalLineagesEstablished: false,
          fundsAuthorityEstablished: false,
          gate5Closed: false,
        },
      });
      expect(mocks.settlementReobservations).toHaveLength(0);
      expect(mocks.prepareSetupCheckBatch).toHaveBeenCalledTimes(1);
      expect(mocks.checkSetupTransaction).toHaveBeenCalledTimes(3);
      expect(mocks.prepareSetupCheckBatch.mock.calls[0]?.[0].mnemonic)
        .toBeTypeOf('string');
      expect(JSON.stringify(receipt)).not.toMatch(
        /"(?:signedTx|privateKey|mnemonic|submitter|broadcaster)"/iu,
      );
      await expect(session.run({
        portableReplayInput: fixture.input,
        primaryNodeOrigin: 'http://127.0.0.1:9051',
        witnessNodeOrigin: 'http://127.0.0.1:9052',
      })).rejects.toThrow(/session is already consumed/);
    }, session.signer.publicKeyHex);
  }, 30_000);

  it('disposes an unused signer-first session before packet construction', async () => {
    const session =
      await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
    expect(() => session.dispose()).not.toThrow();
    expect(() => session.dispose()).not.toThrow();
    await expect(session.run({} as any)).rejects.toThrow(
      /session is already consumed or disposed/,
    );
  });

  it('hands one non-serializable mining credential to the static root', async () => {
    const session =
      await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
    const credential =
      claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2(session);
    expect(Object.keys(credential).sort()).toEqual(['schema', 'version']);
    expect(JSON.stringify(credential)).not.toMatch(/mnemonic|secret|test /iu);
    expect(() =>
      claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2(session)
    ).toThrow(/absent, claimed, or disposed/);
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        structuredClone(credential),
        session.signer.publicKeyHex,
      )
    ).toThrow(/absent, consumed, or revoked/);
    session.dispose();
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetMiningCredentialV1(
        credential,
        session.signer.publicKeyHex,
      )
    ).toThrow(/absent, consumed, or revoked/);
  });

  it('does not transfer signer-first binding provenance through serialization', async () => {
    const session =
      await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
    try {
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(
          session.signer,
        )
      ).not.toThrow();
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(
          structuredClone(session.signer),
        )
      ).toThrow(/signer binding lacks active process provenance/u);
      session.dispose();
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(
          session.signer,
        )
      ).toThrow(/signer binding lacks active process provenance/u);
    } finally {
      session.dispose();
    }
  });

  it('admits only the exact signer-first binding into packet-session creation', async () => {
    const setupSession =
      await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
    try {
      const packetSession =
        createSubstrateFederatedIsolatedDevnetPacketSessionV1(
          setupSession.signer,
        );
      packetSession.dispose();
      expect(() =>
        createSubstrateFederatedIsolatedDevnetPacketSessionV1(
          structuredClone(setupSession.signer),
        )
      ).toThrow(/signer binding lacks active process provenance/u);
      setupSession.dispose();
      expect(() =>
        createSubstrateFederatedIsolatedDevnetPacketSessionV1(
          setupSession.signer,
        )
      ).toThrow(/signer binding lacks active process provenance/u);
    } finally {
      setupSession.dispose();
    }
  });

  it('rejects a fixed session target built for another signer', async () => {
    const session =
      await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
    await withPortableReplayFixture(async fixture => {
      configureFixedSetupCheckRunnerRuntime(fixture);
      await expect(session.run({
        portableReplayInput: fixture.input,
        primaryNodeOrigin: 'http://127.0.0.1:9051',
        witnessNodeOrigin: 'http://127.0.0.1:9052',
      })).rejects.toThrow(/does not control the exact reward inputs/);
    });
  }, 30_000);

  it('rejects any non-fixed setup-check origin before replay compilation', async () => {
    const session =
      await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
    await withPortableReplayFixture(async fixture => {
      const trackerCompiler = vi.mocked(
        compileSubstrateFederatedTrackerWithPinnedJvmV1,
      );
      trackerCompiler.mockClear();

      await expect(
        session.run({
          portableReplayInput: fixture.input,
          primaryNodeOrigin: 'http://127.0.0.1:19051',
          witnessNodeOrigin: 'http://127.0.0.1:9052',
        }),
      ).rejects.toThrow(/primary origin must be exactly/);
      expect(trackerCompiler).not.toHaveBeenCalled();
    });
  });

  it('keeps the G1dG composition root on an exact check-only capability surface', () => {
    const source = readFileSync(
      new URL(
        './substrate-federated-isolated-devnet-setup-check-v2.ts',
        import.meta.url,
      ),
      'utf8',
    );
    const imports = [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/gu)]
      .map(match => match[1]);

    expect(imports).toEqual([
      'node:crypto',
      './ergo-helpers.js',
      './ergo-unsigned-transaction.js',
      './fleet-signer.js',
      './relayer-core/devnet-reward-consolidation.js',
      './strict-data-snapshot.js',
      './strict-json.js',
      './substrate-federated-genesis-observation-v1.js',
      './substrate-federated-isolated-devnet-setup-check-request-v2.js',
    ]);
    expect(source).not.toMatch(
      /\b(?:signTransactionForSubmission|submitSigned|npost|broadcastTransaction|getSignerKeys)\b/u,
    );
    expect(source).not.toMatch(/\bfetch\s*\(/u);
    const transactionEndpointLiterals = [
      ...source.matchAll(/['"`](\/transactions(?:\/[^'"`]*)?)['"`]/gu),
    ].map(match => match[1]);
    expect([...new Set(transactionEndpointLiterals)])
      .toEqual(['/transactions/check']);
    expect(source).not.toMatch(/\b(?:import\s*\(|require\s*\(|process\.env)/u);
  });

  it('keeps the signer-first G1dA-to-G1dG session free of wider capabilities', () => {
    const runner = readFileSync(
      new URL(
        './substrate-federated-isolated-devnet-setup-check-runner-v2.ts',
        import.meta.url,
      ),
      'utf8',
    );
    const execution = readFileSync(
      new URL(
        './substrate-federated-isolated-devnet-setup-check-execution-v2.ts',
        import.meta.url,
      ),
      'utf8',
    );
    const signerIdentity = readFileSync(
      new URL(
        './local-wasm-root-signer-public-identity.ts',
        import.meta.url,
      ),
      'utf8',
    );
    const runnerImports = [
      ...runner.matchAll(/\bfrom\s+['"]([^'"]+)['"]/gu),
    ].map(match => match[1]);
    expect(runnerImports).toEqual([
      './substrate-federated-isolated-devnet-portable-replay-v1.js',
      './substrate-federated-isolated-devnet-setup-check-v2.js',
      './substrate-federated-isolated-devnet-mining-credential-v1.js',
    ]);
    expect([
      ...runner.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu),
    ].map(match => match[1])).toEqual([
      './substrate-federated-isolated-devnet-setup-check-execution-v2.js',
    ]);
    expect(runner).not.toMatch(
      /\bexport\s+(?:async\s+)?function\s+(?:registerSignerBinding|revokeSignerBinding)\b/u,
    );
    const executionImports = [
      ...execution.matchAll(/\bfrom\s+['"]([^'"]+)['"]/gu),
    ].map(match => match[1]);
    expect(executionImports).toEqual([
      'node:crypto',
      'ethers',
      './local-wasm-root-signer-public-identity.js',
      './relayer-core/devnet-reward-consolidation.js',
      './substrate-federated-isolated-devnet-mining-credential-v1.js',
      './substrate-federated-genesis-observation-v1.js',
      './substrate-federated-isolated-devnet-local-provisioning-v2.js',
      './substrate-federated-isolated-devnet-portable-replay-v1.js',
      './substrate-federated-isolated-devnet-settlement-target-v2.js',
      './substrate-federated-isolated-devnet-setup-check-request-v2.js',
      './substrate-federated-isolated-devnet-setup-check-v2.js',
      './strict-json.js',
    ]);
    expect(`${runner}\n${execution}\n${signerIdentity}`).not.toMatch(
      /process\.env|node:(?:fs|http|https|net|tls|child_process)|profile-registry|state-tracker/iu,
    );
    expect(`${runner}\n${execution}\n${signerIdentity}`).not.toMatch(
      /\b(?:signTransactionForSubmission|submitSigned|npost|broadcastTransaction|getSignerKeys|fetch\s*\()/u,
    );
    expect(signerIdentity.match(/\bimport\s*\(/gu) ?? []).toHaveLength(1);
    expect([
      ...signerIdentity.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu),
    ].map(match => match[1])).toEqual(['ergo-lib-wasm-nodejs']);
    expect(execution).toContain("'http://127.0.0.1:9051'");
    expect(execution).toContain("'http://127.0.0.1:9052'");
    expect(execution).toContain('Process termination');
  });

  it.each([
    ['partial JVM node acceptance', () => {
      mocks.setupCheckFailRole = 'pooled-reserve';
    }, /pooled-reserve JVM node check failed/],
    ['JVM/node transaction ID disagreement', () => {
      mocks.setupCheckNodeIdOverride = 'fe'.repeat(32);
    }, /signer and JVM node receipt disagree/],
    ['signer input-tree mismatch', () => {
      mocks.setupCheckMnemonicOverride = MISMATCH_SETUP_CHECK_SIGNER_INPUT;
    }, /does not control the exact reward inputs/],
  ] as const)(
    'rejects G1dG %s without producing a receipt',
    async (_label, mutate, expectedError) => {
      const fixture = await localSetupCheckFixture(
        deriveDevnetRewardErgoTreeHexForDelay(
          mocks.setupCheckPublicKeyHex,
          1,
        ),
      );
      try {
        const request =
          await buildSubstrateFederatedIsolatedDevnetSetupCheckRequestV2(
            fixture.plan,
          );
        configureSetupCheckRuntime(fixture, request);
        mutate();
        await expect(
          runSubstrateFederatedIsolatedDevnetSetupCheckV2(
            request,
            TEST_SETUP_CHECK_SIGNER_INPUT,
          ),
        ).rejects.toThrow(expectedError);
      } finally {
        mocks.setupCheckMnemonicOverride = undefined;
        fixture.restore();
      }
    },
  );

  it.each([
    ['pre-check input replacement', (observations: any[]) => {
      observations[1].boxes.tracker.box.value = '50000001';
    }, /pre-check tracker input drifted/],
    ['post-check tip regression', (observations: any[]) => {
      observations[2].target.tipHeight = observations[1].target.tipHeight - 1;
    }, /post-check observation regressed or drifted/],
    ['post-check same-height replacement', (observations: any[]) => {
      observations[2].target.tipHeight = observations[1].target.tipHeight;
      observations[2].target.tipHeaderIdHex = 'ef'.repeat(32);
    }, /post-check observation replaced the same-height tip/],
  ] as const)(
    'rejects G1dG %s',
    async (_label, mutate, expectedError) => {
      const fixture = await localSetupCheckFixture(
        deriveDevnetRewardErgoTreeHexForDelay(
          mocks.setupCheckPublicKeyHex,
          1,
        ),
      );
      try {
        const request =
          await buildSubstrateFederatedIsolatedDevnetSetupCheckRequestV2(
            fixture.plan,
          );
        configureSetupCheckRuntime(fixture, request);
        mutate(mocks.settlementReobservations);
        await expect(
          runSubstrateFederatedIsolatedDevnetSetupCheckV2(
            request,
            TEST_SETUP_CHECK_SIGNER_INPUT,
          ),
        ).rejects.toThrow(expectedError);
      } finally {
        fixture.restore();
      }
    },
  );

  it('rejects copied G1dF requests before any signer or node-check capability runs', async () => {
    const fixture = await localSetupCheckFixture(
      deriveDevnetRewardErgoTreeHexForDelay(
        mocks.setupCheckPublicKeyHex,
        1,
      ),
    );
    try {
      const request =
        await buildSubstrateFederatedIsolatedDevnetSetupCheckRequestV2(
          fixture.plan,
        );
      configureSetupCheckRuntime(fixture, request);
      await expect(
        runSubstrateFederatedIsolatedDevnetSetupCheckV2(
          structuredClone(request),
          TEST_SETUP_CHECK_SIGNER_INPUT,
        ),
      ).rejects.toThrow(/not built in this process/);
      expect(mocks.getSetupCheckHeaders).not.toHaveBeenCalled();
      expect(mocks.prepareSetupCheckBatch).not.toHaveBeenCalled();
      expect(mocks.checkSetupTransaction).not.toHaveBeenCalled();
    } finally {
      fixture.restore();
    }
  });

  it.each([
    ['role order', (receipt: any) => {
      [receipt.orderedChecks[0], receipt.orderedChecks[1]] =
        [receipt.orderedChecks[1], receipt.orderedChecks[0]];
    }, /tracker setup-check receipt is invalid/],
    ['signed-byte digest', (receipt: any) => {
      receipt.orderedChecks[0].signedTransactionBytesSha256Hex =
        'ff'.repeat(32);
    }, /setup-check signer receipt is invalid/],
    ['checker origin', (receipt: any) => {
      receipt.orderedChecks[0].checker.nodeOrigin = 'http://127.0.0.1:9999';
    }, /tracker setup-check receipt is invalid/],
    ['observation genesis', (receipt: any) => {
      receipt.preCheckObservation.genesisHeaderIdHex = 'fd'.repeat(32);
    }, /pre-check receipt genesis identity drifted/],
    ['observation input set', (receipt: any) => {
      receipt.postCheckObservation.observedInputSetDigestHex = 'fc'.repeat(32);
    }, /receipt post-check observation regressed or drifted/],
    ['same-height observation tip', (receipt: any) => {
      receipt.preCheckObservation.tipHeaderIdHex = 'fb'.repeat(32);
    }, /receipt pre-check observation replaced the same-height tip/],
    ['signer observation tip', (receipt: any) => {
      receipt.signer.stateContextTipIdHex = 'fa'.repeat(32);
    }, /signer context does not bind the pre-sign observation/],
    ['node runtime identity claim', (receipt: any) => {
      receipt.boundaries.exactNodeRuntimeIdentityEstablished = true;
    }, /capability boundary drifted/],
    ['funds authority', (receipt: any) => {
      receipt.boundaries.fundsAuthorityEstablished = true;
    }, /capability boundary drifted/],
    ['signed bytes field', (receipt: any) => {
      receipt.orderedChecks[0].signedTransactionHex = '00';
    }, /fields are not exact/],
  ] as const)(
    'rejects replayed G1dG receipt %s drift',
    async (_label, mutate, expectedError) => {
      const fixture = await localSetupCheckFixture(
        deriveDevnetRewardErgoTreeHexForDelay(
          mocks.setupCheckPublicKeyHex,
          1,
        ),
      );
      try {
        const request =
          await buildSubstrateFederatedIsolatedDevnetSetupCheckRequestV2(
            fixture.plan,
          );
        configureSetupCheckRuntime(fixture, request);
        const receipt = structuredClone(
          await runSubstrateFederatedIsolatedDevnetSetupCheckV2(
            request,
            TEST_SETUP_CHECK_SIGNER_INPUT,
          ),
        ) as any;
        mutate(receipt);
        redigestSetupCheckReceipt(receipt);
        expect(() =>
          validateSubstrateFederatedIsolatedDevnetSetupCheckReceiptV2(
            receipt,
            request,
          )
        ).toThrow(expectedError);
      } finally {
        fixture.restore();
      }
    },
  );

  it.each([
    ['acceptance digest', (input: MutableTargetInput) => {
      input.trustPins.expectedAcceptanceDigestHex = '31'.repeat(32);
    }, /acceptance digest differs/],
    ['history digest', (input: MutableTargetInput) => {
      input.trustPins.expectedHistoryDigestHex = '32'.repeat(32);
    }, /history digest differs/],
    ['source key set', (input: MutableTargetInput) => {
      input.trustPins.expectedSourceAttestationKeySetDigestHex = '33'.repeat(32);
    }, /key-set pin differs/],
    ['source threshold', (input: MutableTargetInput) => {
      input.trustPins.expectedSourceAttestationThreshold = 1;
    }, /threshold pin differs/],
    ['source domain', (input: MutableTargetInput) => {
      input.trustPins.expectedSourceNetworkIdHex = '36'.repeat(32);
    }, /source-network ID differs/],
    ['history artifact pin', (input: MutableTargetInput) => {
      input.trustPins.expectedHistoryArtifacts.runtimeHistorySha256Hex =
        '34'.repeat(32);
    }, /runtime history differs/],
    ['raw history artifact', (input: MutableTargetInput) => {
      input.historyBundle.runtimeHistory[0] ^= 1;
    }, /strict valid JSON|bytes differ/],
  ] as const)('rejects isolated %s drift', (_label, mutate, error) => {
    const input = cloneTargetInput(descriptorInput);
    mutate(input);

    expect(() =>
      deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1(input)
    ).toThrow(error);
  });

  it('rejects a compiler target that differs from the captured source application', () => {
    const input = cloneTargetInput(descriptorInput);
    input.trackerRequest.application.bridgeRuntimeCodeSha256Hex = '35'.repeat(32);

    expect(() =>
      deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1(input)
    ).toThrow(/bridge runtime digest differs/);
  });

  it('rejects authority promotion in a coherently re-digested G1dA receipt', () => {
    const input = cloneTargetInput(descriptorInput);
    const receipt = JSON.parse(
      Buffer.from(input.historyBundle.historyReceipt).toString('utf8'),
    ) as any;
    receipt.boundaries.sourceFinalityAuthenticated = true;
    const { historyDigestHex: _oldDigest, ...body } = receipt;
    receipt.historyDigestHex = sha256CanonicalJson(body, HISTORY_DOMAIN);
    input.historyBundle.historyReceipt = jsonBytes(receipt);
    refreshHistoryReceiptPin(input);
    input.trustPins.expectedHistoryDigestHex = receipt.historyDigestHex;

    expect(() =>
      deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1(input)
    ).toThrow(/authority boundaries are not admissible/);
  });

  it.each([
    ['missing source-history row', (manifest: any) => {
      manifest.blocks.splice(1, 1);
    }, /omit bounded interval rows/],
    ['broken source-history parent', (manifest: any) => {
      manifest.blocks[2].nativeHeader.parentHash = `0x${'ab'.repeat(32)}`;
    }, /parent or block identity drifted/],
    ['unknown nested RPC field', (manifest: any) => {
      manifest.blocks[1].executionBlock.unreviewed = true;
    }, /execution block 1 fields are invalid/],
  ] as const)('rejects coherently re-pinned %s', (_label, mutate, error) => {
    const input = cloneTargetInput(descriptorInput);
    replaceHistoryArtifact(
      input,
      'reportedFinalizedBlocks',
      'reportedFinalizedBlocksSha256Hex',
      mutate,
    );

    expect(() =>
      deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1(input)
    ).toThrow(error);
  });

  it('rejects a coherently re-pinned acceptance with an unknown toolchain field', () => {
    const input = cloneTargetInput(descriptorInput);
    replaceAcceptance(input, (acceptance: any) => {
      acceptance.toolchain.unreviewed = 'not-part-of-v1';
    });

    expect(() =>
      deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1(input)
    ).toThrow(/G1c acceptance toolchain fields are invalid/);
  });

  it('rejects unknown, duplicate, unsorted, insufficient and invalid signatures', () => {
    const target = deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1(
      descriptorInput,
    );
    const statement = launchStatement(target);
    const signatures = signStatement(statement.attestationDigestHex);
    const unknown = sourceSigner();
    const unknownSignature = signatureFor(
      unknown,
      statement.attestationDigestHex,
    );

    expect(() => buildSubstrateFederatedIsolatedDevnetLaunchBaselineV1({
      statement,
      signatures: [signatures[0]!, unknownSignature]
        .sort(sortSignature),
    })).toThrow(/not registered/);
    expect(() => buildSubstrateFederatedIsolatedDevnetLaunchBaselineV1({
      statement,
      signatures: [signatures[0]!, signatures[0]!],
    })).toThrow(/sorted and unique/);
    expect(() => buildSubstrateFederatedIsolatedDevnetLaunchBaselineV1({
      statement,
      signatures: [...signatures].reverse(),
    })).toThrow(/sorted and unique/);
    expect(() => buildSubstrateFederatedIsolatedDevnetLaunchBaselineV1({
      statement,
      signatures: [signatures[0]!],
    })).toThrow(/exact source-attestation threshold/);
    const invalid = structuredClone(signatures) as any;
    const firstByte = Number.parseInt(invalid[0].signatureHex.slice(0, 2), 16);
    invalid[0].signatureHex = `${(firstByte ^ 1).toString(16).padStart(2, '0')}${invalid[0].signatureHex.slice(2)}`;
    expect(() => buildSubstrateFederatedIsolatedDevnetLaunchBaselineV1({
      statement,
      signatures: invalid,
    })).toThrow(/signature is invalid/);
  });

  it('derives the isolated setup payloads under distinct domains without granting authority', () => {
    const target = deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1(
      descriptorInput,
    );
    const statement = launchStatement(target);
    const baseline = buildSubstrateFederatedIsolatedDevnetLaunchBaselineV1({
      statement,
      signatures: signStatement(statement.attestationDigestHex),
    });
    const generation = buildSubstrateFederatedIsolatedDevnetGenerationV1({
      launchBaseline: baseline,
      ...descriptorInput,
    });
    const { manifestDigestHex, ...manifestBody } = generation;
    expect(manifestDigestHex).toBe(domainDigest(
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENERATION_V1',
      manifestBody,
    ));
    expect(generation.target.compilerClosureDigestHex).toBe(domainDigest(
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_COMPILER_CLOSURE_V1',
      target.compiler,
    ));

    const payloads = generation.target.genesisPayloads;
    const emptyTrackerDigestHex = getSubstrateFederatedTrackerDigestV1Hex([]);
    const emptyDepositDigestHex = getPooledReserveEmptyDigest();
    const emptyReplayDigestHex = getDupTreeDigest([]);
    expect(payloads).toMatchObject({
      importedReplayDigestHex: emptyReplayDigestHex,
      emptyTrackerDigestHex,
      emptyDepositDigestHex,
    });
    expect(payloads.payloadSetDigestHex).toBe(domainDigest(
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_PAYLOAD_SET_V1',
      {
        tracker: payloads.tracker,
        duplicatePrevention: payloads.duplicatePrevention,
        pooledReserve: payloads.pooledReserve,
      },
    ));
    for (const payload of [
      payloads.tracker,
      payloads.duplicatePrevention,
      payloads.pooledReserve,
    ]) {
      const { payloadDigestHex, ...payloadBody } = payload;
      expect(payloadDigestHex).toBe(domainDigest(
        'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_PAYLOAD_V1',
        payloadBody,
      ));
    }

    expect(generation).toMatchObject({
      schema: 'e2s.substrate-federated-isolated-devnet-generation.v1',
      status: 'authenticated_non_authorizing_isolated_devnet_generation',
      generation: {
        label: 'substrate-federated-isolated-devnet-v1',
        generationIdHex: statement.activationGenerationIdHex,
        sourceNetworkScope: 'isolated-devnet',
      },
      launchBaseline: {
        baselineDigestHex: baseline.baselineDigestHex,
        sourceAcceptanceDigestHex:
          descriptorInput.trustPins.expectedAcceptanceDigestHex,
        sourceHistoryDigestHex:
          descriptorInput.trustPins.expectedHistoryDigestHex,
      },
      target: {
        descriptorDigestHex: target.descriptorDigestHex,
        genesisPayloads: {
          tracker: {
            role: 'tracker',
            ergoTreeHex: descriptorInput.trackerReceipt.contract.propositionHex,
            assets: [{
              tokenId: descriptorInput.trackerRequest.trackerNftIdHex,
              amount: '1',
            }],
          },
          duplicatePrevention: {
            role: 'duplicate-prevention',
            ergoTreeHex:
              descriptorInput.familyReceipt.contracts.duplicatePrevention
                .propositionHex,
            assets: [{
              tokenId:
                descriptorInput.familyReceipt.profile
                  .duplicatePreventionNftIdHex,
              amount: '1',
            }],
          },
          pooledReserve: {
            role: 'pooled-reserve',
            ergoTreeHex:
              descriptorInput.familyReceipt.contracts.pooledReserve
                .propositionHex,
            assets: [{
              tokenId:
                descriptorInput.familyReceipt.profile.pooledReserveNftIdHex,
              amount: '1',
            }],
          },
          creationHeightsBoundAtMaterialization: false,
          outputIdsBoundAtMaterialization: false,
        },
      },
      globalReplay: {
        canonicalBurnIdsHex: [],
        canonicalBurnIdCount: 0,
        derivation:
          'empty-from-quorum-authenticated-isolated-non-instantiation',
      },
      predecessorRoutes: {
        routeCount: 53,
        everyRouteNotInstantiatedUnderDisclosedQuorum: true,
      },
      checks: {
        sameProcessLaunchBaselineVerified: true,
        exactTargetDescriptorMatchedCompilers: true,
        frozenGreenfieldGenerationAccepted: false,
        callerNonInstantiationClaimsAccepted: false,
      },
      boundaries: {
        isolatedDevnetLaunchBaselineAuthenticated: true,
        predecessorRouteNonInstantiationAcceptedUnderFederatedTrust: true,
        sourceDomainObservedInCapturedHistory: false,
        independentSourceAdministrationEstablished: false,
        sourceFinalityAuthenticated: false,
        trackerLineageEstablished: false,
        nodeCheckPerformed: false,
        signingAuthorityEstablished: false,
        broadcastAuthorityEstablished: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(payloads.tracker.additionalRegisters).toEqual({
      R4: encodeCollByteRegister(Buffer.from(
        target.federation.federationProfileIdHex,
        'hex',
      )),
      R5: encodeAvlTreeRegister(
        Buffer.from(emptyTrackerDigestHex, 'hex'),
        VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
        370,
      ),
      R6: encodeCollByteRegister(Buffer.from(
        target.sourceRuntime.sidechainIdHex,
        'hex',
      )),
      R7: encodeLongRegister(0n),
      R8: encodeIntRegister(0),
      R9: encodeCollByteRegister(Buffer.from(
        target.federation.ergoAdmissionKeySetDigestHex,
        'hex',
      )),
    });
    const familyRegister = encodeCollByteRegister(Buffer.from(
      target.profile.familyIdHex,
      'hex',
    ));
    expect(payloads.duplicatePrevention.additionalRegisters).toEqual({
      R4: familyRegister,
      R5: encodeAvlTreeRegister(
        Buffer.from(emptyReplayDigestHex, 'hex'),
        VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
        1,
      ),
    });
    expect(payloads.pooledReserve.additionalRegisters).toEqual({
      R4: familyRegister,
      R5: encodeAvlTreeRegister(
        Buffer.from(emptyDepositDigestHex, 'hex'),
        VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
        32,
      ),
      R6: encodeLongRegister(0n),
    });
    expect(Object.entries(generation.boundaries)
      .filter(([, value]) => value)
      .map(([key]) => key))
      .toEqual([
        'isolatedDevnetLaunchBaselineAuthenticated',
        'predecessorRouteNonInstantiationAcceptedUnderFederatedTrust',
      ]);
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetGenerationV1Provenance(generation)
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetGenerationV1Provenance(
        structuredClone(generation),
      )
    ).toThrow(/lacks process provenance/);
  });

  it('materializes the exact three isolated unsigned setup identities without granting authority', async () => {
    const genesisInputs = await isolatedGenesisInputs();
    const previousFamilyProfile = mocks.familyProfile;
    try {
      const isolatedInput = targetInput(historyFixture(), {
        tracker: genesisInputs.tracker.boxId,
        duplicatePrevention: genesisInputs.duplicatePrevention.boxId,
        pooledReserve: genesisInputs.pooledReserve.boxId,
      });
      const target = deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1(
        isolatedInput,
      );
      const statement = launchStatement(target);
      const baseline = buildSubstrateFederatedIsolatedDevnetLaunchBaselineV1({
        statement,
        signatures: signStatement(statement.attestationDigestHex),
      });
      const generation = buildSubstrateFederatedIsolatedDevnetGenerationV1({
        launchBaseline: baseline,
        ...isolatedInput,
      });
      const provisioning =
        await buildSubstrateFederatedIsolatedDevnetProvisioningV1({
          generation,
          genesisInputs,
        });
      const { planDigestHex, ...planBody } = provisioning;
      expect(planDigestHex).toBe(domainDigest(
        'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PROVISIONING_V1',
        planBody,
      ));
      expect(provisioning).toMatchObject({
        schema: 'e2s.substrate-federated-isolated-devnet-provisioning.v1',
        status: 'authenticated_non_authorizing_unsigned_provisioning',
        generation: {
          manifestDigestHex: generation.manifestDigestHex,
          baselineDigestHex: baseline.baselineDigestHex,
          targetDescriptorDigestHex: target.descriptorDigestHex,
          setupAnchorHeight: 120,
        },
        checks: {
          sameProcessGenerationVerified: true,
          exactHistoricalGenesisBoxesReparsed: true,
          exactTargetGenesisInputIdsMatched: true,
          exactUnsignedProvisioningIdentitiesBound: true,
          copiedGenerationAccepted: false,
          currentUtxoViewAcceptedAsHistory: false,
        },
        execution: {
          networkAccessPerformed: false,
          signerOrWalletMaterialRead: false,
          nodeCheckPerformed: false,
          signedTransactionConstructed: false,
          submissionPerformed: false,
          broadcastPerformed: false,
        },
      });

      const entries = [
        ['tracker', 'tracker'],
        ['duplicate-prevention', 'duplicatePrevention'],
        ['pooled-reserve', 'pooledReserve'],
      ] as const;
      for (const [role, key] of entries) {
        const entry = provisioning.provisioning[key];
        const inputBox = genesisInputs[key];
        const payload = generation.target.genesisPayloads[key];
        const { identityDigestHex, ...identityBody } = entry.identity;
        expect(identityDigestHex).toBe(domainDigest(
          'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PROVISIONING_IDENTITY_V1',
          identityBody,
        ));
        expect(entry.identity).toMatchObject({
          role,
          genesisInputBoxIdHex: inputBox.boxId,
          unsignedTransactionIdHex: entry.transaction.txId,
          stateOutputBoxIdHex: entry.transaction.outputs[0]!.boxId,
          stateOutputIndex: 0,
          creationHeight: 120,
        });
        expect(entry.transaction.eip12Tx.inputs).toEqual([{
          ...inputBox,
          extension: {},
        }]);
        expect(entry.transaction.eip12Tx.dataInputs).toEqual([]);
        expect(entry.transaction.outputs[0]).toMatchObject({
          transactionId: entry.transaction.txId,
          index: 0,
          value: payload.valueNanoErg,
          ergoTree: payload.ergoTreeHex,
          creationHeight: 120,
          assets: [{ tokenId: inputBox.boxId, amount: '1' }],
          additionalRegisters: payload.additionalRegisters,
        });
        expect(entry.transaction.outputs).toHaveLength(3);
        expect(entry.transaction.outputs[1]).toMatchObject({
          value: (
            BigInt(inputBox.value)
            - BigInt(payload.valueNanoErg)
            - BigInt(MINER_FEE)
          ).toString(),
          ergoTree: inputBox.ergoTree,
          assets: [],
          additionalRegisters: {},
          creationHeight: 120,
        });
        expect(entry.transaction.outputs[2]).toMatchObject({
          value: String(MINER_FEE),
          ergoTree: MINER_FEE_TREE,
          assets: [],
          additionalRegisters: {},
          creationHeight: 120,
        });
      }
      expect(new Set(entries.map(([, key]) =>
        provisioning.provisioning[key].identity.unsignedTransactionIdHex,
      )).size).toBe(3);
      expect(new Set(entries.map(([, key]) =>
        provisioning.provisioning[key].identity.stateOutputBoxIdHex,
      )).size).toBe(3);
      expect(Object.entries(provisioning.boundaries)
        .filter(([, value]) => value)
        .map(([key]) => key))
        .toEqual([
          'isolatedDevnetGenerationAuthenticated',
          'historicalInputBodiesBoundByCanonicalBoxIds',
        ]);
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetProvisioningV1Provenance(
          provisioning,
        )
      ).not.toThrow();
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetProvisioningV1Provenance(
          structuredClone(provisioning),
        )
      ).toThrow(/lacks process provenance/);

      await expect(
        buildSubstrateFederatedIsolatedDevnetProvisioningV1({
          generation: structuredClone(generation),
          genesisInputs,
        }),
      ).rejects.toThrow(/generation lacks process provenance/);
      const inconsistent = structuredClone(genesisInputs) as any;
      inconsistent.tracker.value = (
        BigInt(inconsistent.tracker.value) + 1n
      ).toString();
      await expect(
        buildSubstrateFederatedIsolatedDevnetProvisioningV1({
          generation,
          genesisInputs: inconsistent,
        }),
      ).rejects.toThrow(/box id.*differs|boxId does not match/i);
      const tokenBearing = structuredClone(genesisInputs) as any;
      tokenBearing.tracker.assets = [{
        tokenId: 'ff'.repeat(32),
        amount: '1',
      }];
      await expect(
        buildSubstrateFederatedIsolatedDevnetProvisioningV1({
          generation,
          genesisInputs: tokenBearing,
        }),
      ).rejects.toThrow(/tracker input must be pure ERG/);
      const accessorInput = { genesisInputs } as any;
      Object.defineProperty(accessorInput, 'generation', {
        enumerable: true,
        get: () => generation,
      });
      await expect(
        buildSubstrateFederatedIsolatedDevnetProvisioningV1(accessorInput),
      ).rejects.toThrow(/generation must be an enumerable data property/);

      const replacementGeneration = structuredClone(generation) as any;
      replacementGeneration.manifestDigestHex = 'fe'.repeat(32);
      replacementGeneration.launchBaseline.ergoSetupAnchor.height = 121;
      const mutableInput: any = { generation, genesisInputs };
      const pendingProvisioning =
        buildSubstrateFederatedIsolatedDevnetProvisioningV1(mutableInput);
      mutableInput.generation = replacementGeneration;
      const raceSafeProvisioning = await pendingProvisioning;
      expect(raceSafeProvisioning.generation).toMatchObject({
        manifestDigestHex: generation.manifestDigestHex,
        setupAnchorHeight: 120,
      });

      let proxyGenerationReads = 0;
      const proxyInput = new Proxy({ generation, genesisInputs }, {
        get(target, property, receiver) {
          if (property === 'generation') {
            proxyGenerationReads += 1;
            return replacementGeneration;
          }
          return Reflect.get(target, property, receiver);
        },
      });
      const proxySafeProvisioning =
        await buildSubstrateFederatedIsolatedDevnetProvisioningV1(proxyInput);
      expect(proxyGenerationReads).toBe(0);
      expect(proxySafeProvisioning.generation).toMatchObject({
        manifestDigestHex: generation.manifestDigestHex,
        setupAnchorHeight: 120,
      });
    } finally {
      mocks.familyProfile = previousFamilyProfile;
    }
  });

  it('replays the exact isolated launch and unsigned setup identities from explicit bytes', async () => {
    await withPortableReplayFixture(async fixture => {
      mocks.useActualCompilers = true;
      let report;
      try {
        report = await withoutNodeOptions(() =>
          replaySubstrateFederatedIsolatedDevnetPortableV1(fixture.input)
        );
      } finally {
        mocks.useActualCompilers = false;
      }

      expect(report).toMatchObject({
        schema: 'e2s.substrate-federated-isolated-devnet-portable-replay.v1',
        status: 'portable_authenticated_non_authorizing_replay',
        launch: {
          targetDescriptorDigestHex: fixture.target.descriptorDigestHex,
          statementDigestHex: fixture.statement.statementDigestHex,
          generationManifestDigestHex: fixture.generation.manifestDigestHex,
        },
        provisioning: {
          planDigestHex: fixture.provisioning.planDigestHex,
          identitySetDigestHex:
            fixture.provisioning.provisioning.identitySetDigestHex,
        },
        checks: {
          exactArtifactBytesSnapshotted: true,
          exactPinnedJvmCompilerChainReplayed: true,
          externalStatementRebuiltExactly: true,
          exactSourceAttestationThresholdVerified: true,
          allPredecessorRoutesRebuilt: true,
          exactHistoricalGenesisBoxesReparsed: true,
          exactUnsignedProvisioningIdentitiesRebuilt: true,
        },
        execution: {
          explicitArtifactBundleConsumed: true,
          artifactFileSelectionPerformed: false,
          operatorConfigurationAcceptedAsReplayInput: false,
          networkCapabilityOwnedByReplayCore: false,
          runtimeDatabaseCapabilityOwnedByReplayCore: false,
          deploymentStateCapabilityOwnedByReplayCore: false,
          freshProcessClaimedByReport: false,
          signerOrWalletCapabilityOwnedByReplayCore: false,
          nodeCheckPerformed: false,
          signedTransactionConstructed: false,
          submissionPerformed: false,
          broadcastPerformed: false,
        },
        boundaries: {
          sourceAttestationQuorumIsLaunchHistoryAuthority: true,
          sourceConsensusIndependentlyVerified: false,
          targetNodeAcceptanceEstablished: false,
          setupLineagesEstablished: false,
          fundsAuthorityEstablished: false,
          gate5Closed: false,
          trustlessStatusEstablished: false,
          productionReadinessEstablished: false,
        },
      });
      expect(report.provisioning.tracker).toEqual(
        fixture.provisioning.provisioning.tracker.identity,
      );
      expect(report.provisioning.duplicatePrevention).toEqual(
        fixture.provisioning.provisioning.duplicatePrevention.identity,
      );
      expect(report.provisioning.pooledReserve).toEqual(
        fixture.provisioning.provisioning.pooledReserve.identity,
      );
      expect(() =>
        takeSubstrateFederatedIsolatedDevnetPortableReplayContinuationV1(
          structuredClone(report),
        )
      ).toThrow(/continuation is unavailable/);
      const continuation =
        takeSubstrateFederatedIsolatedDevnetPortableReplayContinuationV1(
          report,
        );
      expect(continuation).toMatchObject({
        expectedSettlementGenesisHeaderIdHex:
          fixture.statement.histories.ergo.genesis.headerIdHex,
        genesisBoxIds: {
          tracker: fixture.target.lineages.tracker.genesisInputBoxIdHex,
          duplicatePrevention:
            fixture.target.lineages.duplicatePrevention.genesisInputBoxIdHex,
          pooledReserve:
            fixture.target.lineages.pooledReserve.genesisInputBoxIdHex,
        },
      });
      expect(() =>
        takeSubstrateFederatedIsolatedDevnetPortableReplayContinuationV1(
          report,
        )
      ).toThrow(/continuation is unavailable/);
    });
  }, 30_000);

  it('reproduces the exact replay report in two clean child processes', async () => {
    await withPortableReplayFixture(async fixture => {
      const root = mkdtempSync(join(tmpdir(), 'e2s-isolated-portable-cli-'));
      try {
        const requestPath = writePortableReplayBundle(root, fixture.input);
        const first = await runIsolatedPortableReplayCli(
          requestPath,
          fixture.input.trustPins,
        );
        const second = await runIsolatedPortableReplayCli(
          requestPath,
          fixture.input.trustPins,
        );
        expect(first.exitCode).toBe(0);
        expect(second.exitCode).toBe(0);
        expect(first.pid).not.toBe(second.pid);
        expect(first.stderr).toBe('');
        expect(second.stderr).toBe('');
        expect(first.stdout).toBe(second.stdout);
        const report = parsePortableReplayReport(first.stdout);
        expect(first.stdout).toBe(`${canonicalJson(report)}\n`);
        expect(first.stdout).not.toContain(root);
        expect(first.stdout).not.toMatch(/[A-Za-z]:[\\/]/);
        expect(report.launch).toMatchObject({
          targetDescriptorDigestHex: fixture.target.descriptorDigestHex,
          statementDigestHex: fixture.statement.statementDigestHex,
          generationManifestDigestHex: fixture.generation.manifestDigestHex,
        });
        expect(report.provisioning).toMatchObject({
          planDigestHex: fixture.provisioning.planDigestHex,
          identitySetDigestHex:
            fixture.provisioning.provisioning.identitySetDigestHex,
          tracker: fixture.provisioning.provisioning.tracker.identity,
          duplicatePrevention:
            fixture.provisioning.provisioning.duplicatePrevention.identity,
          pooledReserve:
            fixture.provisioning.provisioning.pooledReserve.identity,
        });
        expect(report.execution).toMatchObject({
          explicitArtifactBundleConsumed: true,
          artifactFileSelectionPerformed: false,
          operatorConfigurationAcceptedAsReplayInput: false,
          ambientEnvironmentAcceptedAsLaunchAuthority: false,
          networkCapabilityOwnedByReplayCore: false,
          runtimeDatabaseCapabilityOwnedByReplayCore: false,
          signerOrWalletCapabilityOwnedByReplayCore: false,
          nodeCheckPerformed: false,
          submissionPerformed: false,
          broadcastPerformed: false,
          reportContainsLocalPaths: false,
          freshProcessClaimedByReport: false,
        });

        await expect(runIsolatedPortableReplayCli(requestPath, {
          ...fixture.input.trustPins,
          expectedTargetDescriptorDigestHex: 'ff'.repeat(32),
        })).rejects.toThrow(/isolated portable replay child failed/);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }, 180_000);

  it('rejects malformed child-process argument grammars', async () => {
    await withPortableReplayFixture(async fixture => {
      const root = mkdtempSync(join(tmpdir(), 'e2s-isolated-portable-args-'));
      try {
        const requestPath = writePortableReplayBundle(root, fixture.input);
        const valid = portableReplayCliArguments(
          requestPath,
          fixture.input.trustPins,
        );
        const variants = [
          valid.slice(0, -1),
          [...valid, '--unexpected'],
          [valid[2]!, valid[3]!, valid[0]!, valid[1]!, valid[4]!, valid[5]!],
          [valid[0]!, valid[1]!, valid[2]!, valid[3]!, valid[2]!, valid[5]!],
          [valid[0]!, valid[1]!, '--unknown', valid[3]!, valid[4]!, valid[5]!],
        ];
        for (const [index, args] of variants.entries()) {
          await expect(runIsolatedPortableReplayArguments(
            args,
            `isolated portable replay argument case ${index}`,
          )).rejects.toThrow(
            new RegExp(`isolated portable replay argument case ${index} failed`),
          );
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }, 60_000);

  it('keeps the child-process CLI config-free and capability-minimal', () => {
    const source = readFileSync(new URL(
      './scripts/replay-substrate-federated-isolated-devnet-launch-v1.ts',
      import.meta.url,
    ), 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)]
      .map(match => match[1]);

    expect(imports).toEqual([
      '../strict-json.js',
      '../substrate-federated-isolated-devnet-portable-replay-files-v1.js',
      '../substrate-federated-isolated-devnet-portable-replay-v1.js',
    ]);
    expect(source).not.toMatch(/process\.env|dotenv|node:(?:fs|http|https|net|tls)/);
    expect(source).not.toMatch(
      /ergo-client|state-tracker|signer|submitter|transport|broadcast|profile-registry/,
    );
    expect(source).toContain(
      "process.stderr.write('isolated portable replay failed\\n')",
    );
  });

  it('rejects isolated replay trust-pin and signed artifact drift', async () => {
    await withPortableReplayFixture(async fixture => {
      await expect(replaySubstrateFederatedIsolatedDevnetPortableV1({
        ...fixture.input,
        trustPins: {
          ...fixture.input.trustPins,
          expectedTargetDescriptorDigestHex: 'ff'.repeat(32),
        },
      })).rejects.toThrow(/explicit pin/);
      await expect(replaySubstrateFederatedIsolatedDevnetPortableV1({
        ...fixture.input,
        trustPins: {
          ...fixture.input.trustPins,
          expectedSourceAttestationKeySetDigestHex: 'fe'.repeat(32),
        },
      })).rejects.toThrow(/explicit pin/);

      const trackerCompiler = vi.mocked(
        compileSubstrateFederatedTrackerWithPinnedJvmV1,
      );
      const familyCompiler = vi.mocked(
        compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1,
      );
      trackerCompiler.mockClear();
      familyCompiler.mockClear();
      const alteredTargetArtifacts = cloneArtifactBundle(fixture.input.artifacts);
      const alteredPacket = JSON.parse(
        alteredTargetArtifacts.attestationPacket.toString('utf8'),
      );
      alteredPacket.statement.target.sourceRuntime.sidechainIdHex =
        'fd'.repeat(32);
      alteredTargetArtifacts.attestationPacket = jsonBytes(alteredPacket);
      await expect(replaySubstrateFederatedIsolatedDevnetPortableV1({
        artifacts: alteredTargetArtifacts,
        trustPins: fixture.input.trustPins,
      })).rejects.toThrow(/target descriptor does not match/);
      expect(trackerCompiler).not.toHaveBeenCalled();
      expect(familyCompiler).not.toHaveBeenCalled();

      const sharedArtifacts = cloneArtifactBundle(fixture.input.artifacts);
      const sharedTemplate = new Uint8Array(new SharedArrayBuffer(
        sharedArtifacts.trackerTemplate.length,
      ));
      sharedTemplate.set(sharedArtifacts.trackerTemplate);
      sharedArtifacts.trackerTemplate = sharedTemplate as Buffer;
      await expect(replaySubstrateFederatedIsolatedDevnetPortableV1({
        artifacts: sharedArtifacts,
        trustPins: fixture.input.trustPins,
      })).rejects.toThrow(/must not use shared backing memory/);

      const accessorInput = { artifacts: fixture.input.artifacts } as any;
      Object.defineProperty(accessorInput, 'trustPins', {
        enumerable: true,
        get: () => fixture.input.trustPins,
      });
      await expect(
        replaySubstrateFederatedIsolatedDevnetPortableV1(accessorInput),
      ).rejects.toThrow(/trustPins must be an enumerable data property/);

      const crossedSchemaArtifacts = cloneArtifactBundle(
        fixture.input.artifacts,
      );
      const crossedPacket = JSON.parse(
        crossedSchemaArtifacts.attestationPacket.toString('utf8'),
      );
      crossedPacket.schema =
        'e2s.substrate-federated-greenfield-attestation-packet.v1';
      crossedSchemaArtifacts.attestationPacket = jsonBytes(crossedPacket);
      await expect(replaySubstrateFederatedIsolatedDevnetPortableV1({
        artifacts: crossedSchemaArtifacts,
        trustPins: fixture.input.trustPins,
      })).rejects.toThrow(/attestation packet schema is unsupported/);

      const driftedArtifacts = cloneArtifactBundle(fixture.input.artifacts);
      driftedArtifacts.sourceRuntimeHistory = Buffer.concat([
        driftedArtifacts.sourceRuntimeHistory,
        Buffer.from('drift', 'ascii'),
      ]);
      await expect(replaySubstrateFederatedIsolatedDevnetPortableV1({
        artifacts: driftedArtifacts,
        trustPins: fixture.input.trustPins,
      })).rejects.toThrow(/history|artifact|canonical|closure/i);
    });
  });

  it('snapshots every isolated replay artifact before the compiler await', async () => {
    await withPortableReplayFixture(async fixture => {
      const expected = await replaySubstrateFederatedIsolatedDevnetPortableV1(
        fixture.input,
      );
      let releaseCompiler!: () => void;
      mocks.trackerCompileWait = new Promise(resolve => {
        releaseCompiler = resolve;
      });
      try {
        const mutableArtifacts = cloneArtifactBundle(fixture.input.artifacts);
        const mutableInput: any = {
          artifacts: mutableArtifacts,
          trustPins: { ...fixture.input.trustPins },
        };
        const pending = replaySubstrateFederatedIsolatedDevnetPortableV1(
          mutableInput,
        );
        Object.values(mutableArtifacts).forEach((bytes, index) => {
          bytes.fill((index + 1) & 0xff);
        });
        mutableInput.artifacts = cloneArtifactBundle(fixture.input.artifacts);
        mutableInput.trustPins = {
          expectedTargetDescriptorDigestHex: 'ff'.repeat(32),
          expectedSourceAttestationKeySetDigestHex: 'fe'.repeat(32),
        };
        releaseCompiler();

        const report = await pending;
        expect(report).toEqual(expected);
      } finally {
        mocks.trackerCompileWait = undefined;
      }
    });
  });

  it('keeps file selection and operational capabilities out of the replay core', () => {
    const source = readFileSync(new URL(
      './substrate-federated-isolated-devnet-portable-replay-v1.ts',
      import.meta.url,
    ), 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)]
      .map(match => match[1]);

    expect(imports).not.toEqual(expect.arrayContaining([
      'node:fs',
      'node:path',
      'node:http',
      'node:https',
      'node:net',
      'node:tls',
      'node:child_process',
    ]));
    expect(imports.join('\n')).not.toMatch(
      /ergo-client|state-tracker|signer|submit|transport|broadcast|config|environment/,
    );
  });

  it('rejects copied launch authority and compiler closure drift during generation', () => {
    const target = deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1(
      descriptorInput,
    );
    const statement = launchStatement(target);
    const baseline = buildSubstrateFederatedIsolatedDevnetLaunchBaselineV1({
      statement,
      signatures: signStatement(statement.attestationDigestHex),
    });

    expect(() => buildSubstrateFederatedIsolatedDevnetGenerationV1({
      launchBaseline: structuredClone(baseline),
      ...descriptorInput,
    })).toThrow(/was not built in this process/);

    const accessorInput = { ...descriptorInput } as any;
    Object.defineProperty(accessorInput, 'launchBaseline', {
      enumerable: true,
      get: () => baseline,
    });
    expect(() => buildSubstrateFederatedIsolatedDevnetGenerationV1(
      accessorInput,
    )).toThrow(/launchBaseline must be an enumerable data property/);

    const driftedInput = cloneTargetInput(descriptorInput);
    driftedInput.trackerReceipt.receiptDigestHex = '64'.repeat(32);
    expect(() => buildSubstrateFederatedIsolatedDevnetGenerationV1({
      launchBaseline: baseline,
      ...driftedInput,
    } as any)).toThrow(/differs from the exact compiler and history closure/);
  });

  it('does not permit schema or provenance crossing with frozen FED-5G V1', () => {
    const target = deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1(
      descriptorInput,
    );
    const statement = launchStatement(target);
    const greenfieldBaseline = buildGreenfieldBaseline();

    expect(() => buildSubstrateFederatedGreenfieldLaunchBaselineV1({
      statement: statement as any,
      signatures: signStatement(statement.attestationDigestHex),
    })).toThrow(/greenfield launch statement lacks process provenance/);
    expect(() => buildSubstrateFederatedIsolatedDevnetLaunchBaselineV1({
      statement: structuredClone(statement) as any,
      signatures: signStatement(statement.attestationDigestHex),
    })).toThrow(/isolated-devnet launch statement lacks process provenance/);
    expect(() => buildSubstrateFederatedIsolatedDevnetGenerationV1({
      launchBaseline: greenfieldBaseline as any,
      ...descriptorInput,
    })).toThrow(/isolated-devnet launch baseline was not built in this process/);
  });
});

type MutableTargetInput = {
  trackerRequest: any;
  trackerReceipt: any;
  familyTemplates: any;
  familyReceipt: any;
  historyBundle: {
    acceptanceReport: Buffer;
    reportedFinalizedBlocks: Buffer;
    runtimeHistory: Buffer;
    applicationHistory: Buffer;
    historyReceipt: Buffer;
  };
  trustPins: {
    expectedAcceptanceDigestHex: string;
    expectedHistoryDigestHex: string;
    expectedSourceAttestationKeySetDigestHex: string;
    expectedSourceAttestationThreshold: number;
    expectedSourceNetworkIdHex: string;
    expectedSidechainIdHex: string;
    expectedRuntimeProfileIdHex: string;
    expectedSettlementProfileIdHex: string;
    expectedHistoryArtifacts: {
      acceptanceReportSha256Hex: string;
      reportedFinalizedBlocksSha256Hex: string;
      runtimeHistorySha256Hex: string;
      applicationHistorySha256Hex: string;
      historyReceiptSha256Hex: string;
    };
  };
};

interface GenesisInputIds {
  readonly tracker: string;
  readonly duplicatePrevention: string;
  readonly pooledReserve: string;
}

type PortableReplayFixture = Awaited<
  ReturnType<typeof buildPortableReplayFixture>
>;

async function withPortableReplayFixture<T>(
  operation: (fixture: PortableReplayFixture) => Promise<T>,
  setupCheckPublicKeyHex = mocks.setupCheckPublicKeyHex,
): Promise<T> {
  const previous = {
    familyProfile: mocks.familyProfile,
    trackerReceipt: mocks.trackerReceipt,
    familyReceipt: mocks.familyReceipt,
    trackerCompileWait: mocks.trackerCompileWait,
    useActualCompilers: mocks.useActualCompilers,
  };
  try {
    const fixture = setupCheckPublicKeyHex === mocks.setupCheckPublicKeyHex
      ? await (portableReplayFixturePromise ??= buildPortableReplayFixture(
        setupCheckPublicKeyHex,
      ))
      : await buildPortableReplayFixture(setupCheckPublicKeyHex);
    mocks.familyProfile = fixture.compilerMocks.familyProfile;
    mocks.trackerReceipt = fixture.compilerMocks.trackerReceipt;
    mocks.familyReceipt = fixture.compilerMocks.familyReceipt;
    return await operation(fixture);
  } finally {
    mocks.familyProfile = previous.familyProfile;
    mocks.trackerReceipt = previous.trackerReceipt;
    mocks.familyReceipt = previous.familyReceipt;
    mocks.trackerCompileWait = previous.trackerCompileWait;
    mocks.useActualCompilers = previous.useActualCompilers;
  }
}

async function buildPortableReplayFixture(setupCheckPublicKeyHex: string) {
  const genesisInputs = await isolatedGenesisInputs(
    deriveDevnetRewardErgoTreeHexForDelay(
      setupCheckPublicKeyHex,
      1,
    ),
  );
  const history = historyFixture();
  const profile = buildSubstrateFederatedCheckpointProfileV1({
    federationEpoch: '17',
    maxAdmissionValidityBlocks: '64',
    sourceAttestationThreshold: 2,
    sourceAttestationPublicKeysHex:
      sourceSigners.map(value => value.publicKeyHex),
    ergoAdmissionThreshold: 2,
    ergoAdmissionPublicKeysHex: [
      `02${'11'.repeat(32)}`,
      `03${'22'.repeat(32)}`,
      `03${'33'.repeat(32)}`,
    ],
  });
  const application = {
    sourceNetworkIdHex: '41'.repeat(32),
    sidechainIdHex: '42'.repeat(32),
    bridgeAddressHex: BRIDGE_ADDRESS,
    tokenAddressHex: TOKEN_ADDRESS,
    bridgeRuntimeCodeSha256Hex: BRIDGE_RUNTIME_DIGEST,
    bridgeRuntimeCodeBytes: 4_104,
    tokenRuntimeCodeSha256Hex: TOKEN_RUNTIME_DIGEST,
    tokenRuntimeCodeBytes: 2_356,
    sourceRuntimeCodeSha256Hex: SOURCE_RUNTIME_DIGEST,
    sourceRuntimeCodeBytes: 1_969_685,
    runtimeProfileIdHex: '43'.repeat(32),
    settlementProfileIdHex: '44'.repeat(32),
  };
  const trackerTemplate = {
    relativePath: 'contracts/SPVTrackerSubstrateFederatedV1.es',
    source: readFileSync(new URL(
      '../../contracts/SPVTrackerSubstrateFederatedV1.es',
      import.meta.url,
    ), 'utf8'),
  };
  const trackerRequest = buildSubstrateFederatedTrackerCompilerRequestV1({
    template: trackerTemplate,
    trackerGenesisInputBoxIdHex: genesisInputs.tracker.boxId,
    profile,
    application,
  });
  const familyTemplates = {
    duplicatePrevention: {
      relativePath:
        'contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
      source: readFileSync(new URL(
        '../../contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
        import.meta.url,
      ), 'utf8'),
    },
    sourceLock: {
      relativePath: 'contracts/MainChainLockPooledReserveV6.es',
      source: readFileSync(new URL(
        '../../contracts/MainChainLockPooledReserveV6.es',
        import.meta.url,
      ), 'utf8'),
    },
    pooledReserve: {
      relativePath:
        'contracts/MainChainPooledReserveValidityApplicationV6.es',
      source: readFileSync(new URL(
        '../../contracts/MainChainPooledReserveValidityApplicationV6.es',
        import.meta.url,
      ), 'utf8'),
    },
  };
  const familyProfile = {
    trackerNftIdHex: trackerRequest.trackerNftIdHex,
    sourceNetworkIdHex: application.sourceNetworkIdHex,
    sidechainIdHex: application.sidechainIdHex,
    bridgeAddressHex: application.bridgeAddressHex,
    tokenAddressHex: application.tokenAddressHex,
    runtimeProfileIdHex: application.runtimeProfileIdHex,
    settlementProfileIdHex: application.settlementProfileIdHex,
    federationProfileIdHex: profile.profileIdHex,
    sourceAttestationKeySetDigestHex:
      profile.sourceAttestationKeySetDigestHex,
    sourceAttestationThreshold: profile.sourceAttestationThreshold,
    ergoAdmissionKeySetDigestHex: profile.ergoAdmissionKeySetDigestHex,
    ergoAdmissionThreshold: profile.ergoAdmissionThreshold,
    federationEpoch: profile.federationEpoch,
  };
  mocks.familyProfile = familyProfile;
  mocks.trackerReceipt = undefined;
  mocks.trackerCompileWait = undefined;
  const trackerReceipt =
    await withoutNodeOptions(() =>
      compileSubstrateFederatedTrackerWithPinnedJvmV1(trackerRequest)
    );
  mocks.trackerReceipt = trackerReceipt;
  mocks.familyReceipt = undefined;
  const familyCompilerInput = {
    trackerRequest,
    trackerReceipt,
    templates: familyTemplates,
    duplicatePreventionGenesisInputBoxIdHex:
      genesisInputs.duplicatePrevention.boxId,
    pooledReserveGenesisInputBoxIdHex: genesisInputs.pooledReserve.boxId,
  };
  const familyReceipt =
    await withoutNodeOptions(() =>
      compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1(
        familyCompilerInput,
      )
    );
  mocks.familyReceipt = familyReceipt;
  const actualTrackerCompiler = await vi.importActual<
    typeof import('./substrate-federated-tracker-jvm-compiler-v1.js')
  >('./substrate-federated-tracker-jvm-compiler-v1.js');
  const actualFamilyCompiler = await vi.importActual<
    typeof import('./substrate-federated-settlement-family-jvm-compiler-v1.js')
  >('./substrate-federated-settlement-family-jvm-compiler-v1.js');
  actualTrackerCompiler.assertSubstrateFederatedTrackerJvmCompilerReceiptV1(
    trackerReceipt,
    trackerRequest,
  );
  actualFamilyCompiler
    .assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1(
      familyReceipt,
      familyCompilerInput,
    );

  const descriptorInput = {
    trackerRequest,
    trackerReceipt,
    familyTemplates,
    familyReceipt,
    historyBundle: history.bundle,
    trustPins: {
      ...history.pins,
      expectedSourceNetworkIdHex: application.sourceNetworkIdHex,
      expectedSidechainIdHex: application.sidechainIdHex,
      expectedRuntimeProfileIdHex: application.runtimeProfileIdHex,
      expectedSettlementProfileIdHex: application.settlementProfileIdHex,
      expectedSourceAttestationKeySetDigestHex:
        profile.sourceAttestationKeySetDigestHex,
      expectedSourceAttestationThreshold: profile.sourceAttestationThreshold,
    },
  } as unknown as DeriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1Input;
  const target = deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1(
    descriptorInput,
  );
  const ergoGreatestWorkHeadersManifest = Buffer.from('portable-headers');
  const ergoTransactionsManifest = Buffer.from('portable-transactions');
  const ergoUtxoTransitionsManifest = jsonBytes({
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_UTXO_HISTORY_V1_SCHEMA,
    version: 1,
    genesisInputs,
  });
  const ergoHistory = buildSubstrateFederatedIsolatedDevnetErgoHistoryV1({
    target,
    genesisHeaderIdHex: '71'.repeat(32),
    genesisHeight: 1,
    setupAnchorHeaderIdHex: '72'.repeat(32),
    setupAnchorHeight: 120,
    greatestWorkHeadersManifest: ergoGreatestWorkHeadersManifest,
    transactionsManifest: ergoTransactionsManifest,
    utxoTransitionsManifest: ergoUtxoTransitionsManifest,
  });
  const relayerSourceArchive = Buffer.from('portable-source');
  const relayerPackageLock = Buffer.from('portable-lock');
  const relayerRuntimeEntrypointsManifest = Buffer.from('portable-entrypoints');
  const relayerBuildArtifact = Buffer.from('portable-build');
  const relayerClosure = buildSubstrateFederatedIsolatedDevnetRelayerClosureV1({
    target,
    gitCommitSha1Hex: '73'.repeat(20),
    sourceArchive: relayerSourceArchive,
    packageLock: relayerPackageLock,
    runtimeEntrypointsManifest: relayerRuntimeEntrypointsManifest,
    buildArtifact: relayerBuildArtifact,
  });
  const statement = buildSubstrateFederatedIsolatedDevnetLaunchStatementV1({
    activationGenerationIdHex: '74'.repeat(32),
    target,
    ergoHistory,
    relayerClosure,
  });
  const signatures = signStatement(statement.attestationDigestHex);
  const baseline = buildSubstrateFederatedIsolatedDevnetLaunchBaselineV1({
    statement,
    signatures,
  });
  const generation = buildSubstrateFederatedIsolatedDevnetGenerationV1({
    launchBaseline: baseline,
    ...descriptorInput,
  });
  const provisioning =
    await buildSubstrateFederatedIsolatedDevnetProvisioningV1({
      generation,
      genesisInputs,
    });
  return {
    genesisInputs,
    input: {
      artifacts: {
        trackerTemplate: Buffer.from(trackerTemplate.source),
        duplicatePreventionTemplate:
          Buffer.from(familyTemplates.duplicatePrevention.source),
        sourceLockTemplate: Buffer.from(familyTemplates.sourceLock.source),
        pooledReserveTemplate:
          Buffer.from(familyTemplates.pooledReserve.source),
        sourceAcceptanceReport: history.bundle.acceptanceReport,
        sourceReportedFinalizedBlocks: history.bundle.reportedFinalizedBlocks,
        sourceRuntimeHistory: history.bundle.runtimeHistory,
        sourceApplicationHistory: history.bundle.applicationHistory,
        sourceHistoryReceipt: history.bundle.historyReceipt,
        ergoGreatestWorkHeadersManifest,
        ergoTransactionsManifest,
        ergoUtxoTransitionsManifest,
        relayerSourceArchive,
        relayerPackageLock,
        relayerRuntimeEntrypointsManifest,
        relayerBuildArtifact,
        attestationPacket: jsonBytes({
          schema:
            SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ATTESTATION_PACKET_V1_SCHEMA,
          version: 1,
          statement,
          signatures,
        }),
      },
      trustPins: {
        expectedTargetDescriptorDigestHex: target.descriptorDigestHex,
        expectedSourceAttestationKeySetDigestHex:
          target.federation.sourceAttestationKeySetDigestHex,
      },
    },
    target,
    statement,
    generation,
    provisioning,
    compilerMocks: {
      familyProfile,
      trackerReceipt,
      familyReceipt,
    },
  };
}

function writePortableReplayBundle(
  root: string,
  input: PortableReplayFixture['input'],
): string {
  for (const [key, relativePath] of Object.entries(
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_ARTIFACT_PATHS_V1,
  )) {
    const path = join(root, ...relativePath.split('/'));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      input.artifacts[key as keyof typeof input.artifacts],
    );
  }
  const requestPath = join(root, 'portable-replay-request.v1.json');
  writeFileSync(requestPath, jsonBytes({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_REQUEST_V1_SCHEMA,
    version: 1,
    files:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_ARTIFACT_PATHS_V1,
  }));
  return requestPath;
}

async function runIsolatedPortableReplayCli(
  requestPath: string,
  trustPins: PortableReplayFixture['input']['trustPins'],
) {
  return await runIsolatedPortableReplayArguments(
    portableReplayCliArguments(requestPath, trustPins),
    'isolated portable replay child',
  );
}

function portableReplayCliArguments(
  requestPath: string,
  trustPins: PortableReplayFixture['input']['trustPins'],
): string[] {
  return [
    '--request',
    requestPath,
    '--expected-target-descriptor-digest',
    trustPins.expectedTargetDescriptorDigestHex,
    '--expected-source-attestation-key-set-digest',
    trustPins.expectedSourceAttestationKeySetDigestHex,
  ];
}

async function runIsolatedPortableReplayArguments(
  args: readonly string[],
  label: string,
) {
  return await runBoundedProcess({
    executablePath: process.execPath,
    args: [
    'node_modules/tsx/dist/cli.mjs',
    PORTABLE_REPLAY_SCRIPT,
      ...args,
    ],
    cwd: process.cwd(),
    env: portableChildEnvironment(),
    timeoutMs: 120_000,
    maxOutputBytes: 8 * 1024 * 1024,
    label,
  });
}

function portableChildEnvironment(): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of [
    'Path',
    'PATH',
    'JAVA_HOME',
    'SystemRoot',
    'SYSTEMROOT',
    'WINDIR',
    'TEMP',
    'TMP',
    'ComSpec',
    'COMSPEC',
    'PATHEXT',
  ]) {
    const value = process.env[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function parsePortableReplayReport(
  stdout: string,
): SubstrateFederatedIsolatedDevnetPortableReplayV1 {
  return JSON.parse(stdout) as SubstrateFederatedIsolatedDevnetPortableReplayV1;
}

function cloneArtifactBundle<
  T extends Readonly<Record<string, Uint8Array>>,
>(value: T): { -readonly [K in keyof T]: Buffer } {
  return Object.fromEntries(
    Object.entries(value).map(([key, bytes]) => [key, Buffer.from(bytes)]),
  ) as { -readonly [K in keyof T]: Buffer };
}

async function withoutNodeOptions<T>(operation: () => Promise<T>): Promise<T> {
  const original = process.env.NODE_OPTIONS;
  delete process.env.NODE_OPTIONS;
  try {
    return await operation();
  } finally {
    if (original === undefined) {
      delete process.env.NODE_OPTIONS;
    } else {
      process.env.NODE_OPTIONS = original;
    }
  }
}

function targetInput(
  fixture: ReturnType<typeof historyFixture>,
  genesisInputIds: Readonly<GenesisInputIds> = {
    tracker: '46'.repeat(32),
    duplicatePrevention: '55'.repeat(32),
    pooledReserve: '56'.repeat(32),
  },
) {
  const sourceKeys = sourceSigners.map(value => value.publicKeyHex);
  const profile = buildSubstrateFederatedCheckpointProfileV1({
    federationEpoch: '17',
    maxAdmissionValidityBlocks: '64',
    sourceAttestationThreshold: 2,
    sourceAttestationPublicKeysHex: sourceKeys,
    ergoAdmissionThreshold: 2,
    ergoAdmissionPublicKeysHex: [
      `02${'11'.repeat(32)}`,
      `03${'22'.repeat(32)}`,
      `03${'33'.repeat(32)}`,
    ],
  });
  const application = {
    sourceNetworkIdHex: '41'.repeat(32),
    sidechainIdHex: '42'.repeat(32),
    bridgeAddressHex: BRIDGE_ADDRESS,
    tokenAddressHex: TOKEN_ADDRESS,
    bridgeRuntimeCodeSha256Hex: BRIDGE_RUNTIME_DIGEST,
    bridgeRuntimeCodeBytes: 4_104,
    tokenRuntimeCodeSha256Hex: TOKEN_RUNTIME_DIGEST,
    tokenRuntimeCodeBytes: 2_356,
    sourceRuntimeCodeSha256Hex: SOURCE_RUNTIME_DIGEST,
    sourceRuntimeCodeBytes: 1_969_685,
    runtimeProfileIdHex: '43'.repeat(32),
    settlementProfileIdHex: '44'.repeat(32),
  };
  const trackerRequest = {
    requestDigestHex: '45'.repeat(32),
    trackerNftIdHex: genesisInputIds.tracker,
    profile,
    application,
  };
  mocks.familyProfile = {
    trackerNftIdHex: trackerRequest.trackerNftIdHex,
    sourceNetworkIdHex: application.sourceNetworkIdHex,
    sidechainIdHex: application.sidechainIdHex,
    bridgeAddressHex: application.bridgeAddressHex,
    tokenAddressHex: application.tokenAddressHex,
    runtimeProfileIdHex: application.runtimeProfileIdHex,
    settlementProfileIdHex: application.settlementProfileIdHex,
    federationProfileIdHex: profile.profileIdHex,
    sourceAttestationKeySetDigestHex: profile.sourceAttestationKeySetDigestHex,
    sourceAttestationThreshold: profile.sourceAttestationThreshold,
    ergoAdmissionKeySetDigestHex: profile.ergoAdmissionKeySetDigestHex,
    ergoAdmissionThreshold: profile.ergoAdmissionThreshold,
    federationEpoch: profile.federationEpoch,
  };
  const contract = (byte: string) => ({
    contractIdHex: byte.repeat(32),
    resolvedSourceSha256Hex: (Number.parseInt(byte, 16) + 1)
      .toString(16).padStart(2, '0').repeat(32),
    propositionBytes: 2,
    propositionSha256Hex: (Number.parseInt(byte, 16) + 2)
      .toString(16).padStart(2, '0').repeat(32),
    propositionHex: '1001',
  });
  const familyReceipt = {
    familyCompilerRequestDigestHex: '51'.repeat(32),
    receiptDigestHex: '52'.repeat(32),
    compilerLockDigestHex: '53'.repeat(32),
    profile: {
      familyIdHex: '54'.repeat(32),
      encodedProfileHex: '0102',
      duplicatePreventionNftIdHex: genesisInputIds.duplicatePrevention,
      pooledReserveNftIdHex: genesisInputIds.pooledReserve,
    },
    contracts: {
      duplicatePrevention: contract('57'),
      sourceLock: contract('5a'),
      pooledReserve: contract('5d'),
    },
  };
  return {
    trackerRequest,
    trackerReceipt: {
      receiptDigestHex: '61'.repeat(32),
      compilerLockDigestHex: '62'.repeat(32),
      contract: contract('63'),
    },
    familyTemplates: {
      duplicatePrevention: { relativePath: 'dup.es', source: 'dup' },
      sourceLock: { relativePath: 'lock.es', source: 'lock' },
      pooledReserve: { relativePath: 'reserve.es', source: 'reserve' },
    },
    familyReceipt,
    historyBundle: fixture.bundle,
    trustPins: {
      ...fixture.pins,
      expectedSourceNetworkIdHex: application.sourceNetworkIdHex,
      expectedSidechainIdHex: application.sidechainIdHex,
      expectedRuntimeProfileIdHex: application.runtimeProfileIdHex,
      expectedSettlementProfileIdHex: application.settlementProfileIdHex,
      expectedSourceAttestationKeySetDigestHex:
        profile.sourceAttestationKeySetDigestHex,
      expectedSourceAttestationThreshold: profile.sourceAttestationThreshold,
    },
  } as unknown as DeriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1Input;
}

async function isolatedGenesisInputs(
  ergoTree = FUNDING_TREE,
): Promise<Readonly<{
  tracker: Eip12Box;
  duplicatePrevention: Eip12Box;
  pooledReserve: Eip12Box;
}>> {
  const transaction = await materializeUnsignedTransaction({
    inputs: [{ ...BASE_GENESIS_INPUT, extension: {} }],
    dataInputs: [],
    outputs: [
      isolatedGenesisSeed('50000000', ergoTree),
      isolatedGenesisSeed('100000000', ergoTree),
      isolatedGenesisSeed('150000000', ergoTree),
    ],
  }, 'isolated federated historical genesis fixture');
  return Object.freeze({
    tracker: transaction.outputs[0]!,
    duplicatePrevention: transaction.outputs[1]!,
    pooledReserve: transaction.outputs[2]!,
  });
}

async function localProvisioningFixture(ergoTree = FUNDING_TREE) {
  const previousFamilyProfile = mocks.familyProfile;
  try {
    const genesisInputs = await isolatedGenesisInputs(ergoTree);
    const input = targetInput(historyFixture(), {
      tracker: genesisInputs.tracker.boxId,
      duplicatePrevention: genesisInputs.duplicatePrevention.boxId,
      pooledReserve: genesisInputs.pooledReserve.boxId,
    });
    const sourceTarget =
      deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1(input);
    const retained = localSettlementObservation(sourceTarget);
    mocks.settlementTargetProfile = retained.profile;
    mocks.settlementObservation = retained.observation;
    const settlementTarget =
      buildSubstrateFederatedIsolatedDevnetSettlementTargetV2({
        ...input,
        settlementTargetProfile: retained.profile,
        settlementObservation: retained.observation,
      });
    return {
      genesisInputs,
      input,
      sourceTarget,
      retained,
      settlementTarget,
      restore: () => {
        mocks.familyProfile = previousFamilyProfile;
      },
    };
  } catch (error) {
    mocks.familyProfile = previousFamilyProfile;
    throw error;
  }
}

async function localSetupCheckFixture(ergoTree = FUNDING_TREE) {
  const fixture = await localProvisioningFixture(ergoTree);
  try {
    const freshObservation = await freshLocalSettlementObservation(
      fixture.sourceTarget,
      fixture.retained.profile,
      fixture.genesisInputs,
    );
    mocks.settlementObservation = freshObservation;
    const plan =
      await buildSubstrateFederatedIsolatedDevnetLocalProvisioningV2({
        settlementTarget: fixture.settlementTarget,
        settlementTargetProfile: fixture.retained.profile,
        freshSettlementObservation: freshObservation,
      });
    return {
      ...fixture,
      freshObservation,
      plan,
    };
  } catch (error) {
    fixture.restore();
    throw error;
  }
}

function configureSetupCheckRuntime(
  fixture: Awaited<ReturnType<typeof localSetupCheckFixture>>,
  request: Awaited<
    ReturnType<typeof buildSubstrateFederatedIsolatedDevnetSetupCheckRequestV2>
  >,
): void {
  const baseHeight = request.target.preSetupAnchor.height;
  const idAt = (height: number) =>
    height.toString(16).padStart(64, '0');
  const now = Date.now();
  const runtimeObservation = (
    ordinal: number,
    tipHeight: number,
    observedAtOffsetMs: number,
  ) => {
    const observation = structuredClone(fixture.freshObservation) as any;
    observation.reportDigestHex = (0xa0 + ordinal)
      .toString(16)
      .padStart(2, '0')
      .repeat(32);
    observation.observedAt = new Date(now + observedAtOffsetMs).toISOString();
    observation.target.tipHeight = tipHeight;
    observation.target.tipHeaderIdHex = idAt(tipHeight);
    observation.boundary = {
      readOnlyNodeRequestsOnly: true,
      apiKeyOrEnvironmentCredentialRead: false,
      runtimeDatabaseOpened: false,
      deploymentStateOpened: false,
      signerOrWalletMaterialRead: false,
      sourceControlledProfileApprovalAuthenticated: false,
      declaredSourceIdentitiesObservedFromNodes: false,
      independentNodeControlVerified: false,
      nodeAgreementProvesCanonicalConsensus: false,
      tipUtxoAtomicityProved: false,
      targetAcceptanceEstablished: false,
      revalidationRequiredBeforeMaterialization: true,
    };
    observation.authorization = {
      materialize: false,
      check: false,
      sign: false,
      submit: false,
      broadcast: false,
      deploy: false,
      activate: false,
      fundsAuthority: false,
      gate5Closed: false,
      productionReady: false,
    };
    return observation;
  };

  mocks.acceptedSettlementObservations.clear();
  mocks.settlementReobservations = [
    runtimeObservation(1, baseHeight + 1, -600),
    runtimeObservation(2, baseHeight + 1, -400),
    runtimeObservation(3, baseHeight + 2, -200),
  ];
  configureSetupCheckCapabilities(
    request.target.primary.nodeOrigin,
    baseHeight,
  );
}

function configureSetupCheckCapabilities(
  primaryNodeOrigin: string,
  baseHeight: number,
): void {
  const idAt = (height: number) =>
    height.toString(16).padStart(64, '0');
  mocks.setupCheckHeaders = Array.from({ length: 10 }, (_, index) => {
    const height = baseHeight + 1 - index;
    return {
      height,
      id: idAt(height),
      parentId: idAt(height - 1),
    };
  });
  mocks.setupCheckFailRole = undefined;
  mocks.setupCheckNodeIdOverride = undefined;
  mocks.setupCheckMnemonicOverride = undefined;
  mocks.getSetupCheckHeaders.mockReset();
  mocks.getSetupCheckHeaders.mockImplementation(async (
    path: string,
    origin: string,
  ) => {
    if (
      path !== '/blocks/lastHeaders/10'
      || origin !== primaryNodeOrigin
    ) {
      throw new Error('unexpected setup-check header request');
    }
    return mocks.setupCheckHeaders;
  });
  mocks.prepareSetupCheckBatch.mockReset();
  mocks.prepareSetupCheckBatch.mockImplementation(async (input: any) => {
    const tip = mocks.setupCheckHeaders[0]!;
    const signerIdentity = await deriveLocalWasmRootSignerPublicIdentity(
      mocks.setupCheckMnemonicOverride ?? input.mnemonic,
    );
    const signerContext = Object.freeze({
      profile: 'e2s.local-wasm-check-signer.v1',
      pubKeyHex: signerIdentity.publicKeyHex,
      ergoTreeHex: signerIdentity.p2pkErgoTreeHex,
      networkPrefix: 16,
      stateContextTipHeight: tip.height,
      stateContextTipIdHex: tip.id,
    });
    return Object.freeze({
      derivation: 'wasm-root',
      pubKeyHex: signerIdentity.publicKeyHex,
      ergoTreeHex: signerIdentity.p2pkErgoTreeHex,
      stateContextTipHeight: tip.height,
      stateContextTipIdHex: tip.id,
      candidates: Object.freeze(input.candidates.map(
        (candidate: any, index: number) => {
          const objectDigest = createHash('sha256')
            .update(`signed-object:${candidate.role}`, 'utf8')
            .digest('hex');
          const bytesDigest = createHash('sha256')
            .update(`signed-bytes:${candidate.role}`, 'utf8')
            .digest('hex');
          return Object.freeze({
            role: candidate.role,
            expectedTxId: candidate.expectedTxId,
            signedCandidate: Object.freeze({
              profile: 'e2s.local-wasm-signed-check-candidate.v1',
              txId: candidate.expectedTxId,
              signedTransactionDigestHex: objectDigest,
              signedTransactionBytesSha256Hex: bytesDigest,
              signedTransactionBytesLength: 200 + index,
              nodeOrigin: input.nodeOrigin,
              signerContext,
            }),
          });
        },
      )),
    });
  });
  mocks.checkSetupTransaction.mockReset();
  mocks.checkSetupTransaction.mockImplementation(async (
    candidate: any,
    label: string,
    nodeOrigin: string,
  ) => {
    const role = setupRoleFromLabel(label);
    if (mocks.setupCheckFailRole === role) return null;
    const nodeTxId = mocks.setupCheckNodeIdOverride ?? candidate.txId;
    return {
      txId: nodeTxId,
      checkResult: nodeTxId,
      signedTransactionDigestHex: candidate.signedTransactionDigestHex,
      signedTransactionBytesSha256Hex:
        candidate.signedTransactionBytesSha256Hex,
      signedTransactionBytesLength: candidate.signedTransactionBytesLength,
      signerContext: candidate.signerContext,
      checkerIdentity: {
        profile: 'e2s.ergo-node-checker.v1',
        sourceAdapterProfile: 'e2s.ergo-node-check-source-adapter.v1',
        nodeOrigin,
        path: '/transactions/check',
        method: 'POST',
        transportPolicy: 'no-redirect-no-proxy',
      },
    };
  });
}

function configureFixedSetupCheckRunnerRuntime(
  fixture: PortableReplayFixture,
): void {
  const baseHeight = 800;
  const now = Date.now();
  const idAt = (height: number) =>
    height.toString(16).padStart(64, '0');
  const observation = (
    ordinal: number,
    tipHeight: number,
    observedAtOffsetMs: number,
  ) => async (profileValue: unknown) => {
    const profile = profileValue as Record<string, any>;
    const result = await freshLocalSettlementObservation(
      fixture.target,
      profile,
      fixture.genesisInputs,
    ) as any;
    result.reportDigestHex = (0xb0 + ordinal)
      .toString(16)
      .padStart(2, '0')
      .repeat(32);
    result.observedAt = new Date(now + observedAtOffsetMs).toISOString();
    result.target.tipHeight = tipHeight;
    result.target.tipHeaderIdHex = idAt(tipHeight);
    return result;
  };

  mocks.settlementTargetProfile = undefined;
  mocks.settlementObservation = undefined;
  mocks.acceptedSettlementObservations.clear();
  mocks.settlementReobservations = [
    observation(1, baseHeight, -1_000),
    observation(2, baseHeight, -800),
    observation(3, baseHeight + 1, -600),
    observation(4, baseHeight + 1, -400),
    observation(5, baseHeight + 2, -200),
  ];
  configureSetupCheckCapabilities(
    'http://127.0.0.1:9051',
    baseHeight,
  );
}

function setupRoleFromLabel(label: string): string {
  return ['tracker', 'duplicate-prevention', 'pooled-reserve']
    .find(role => label.includes(` ${role} `)) ?? '';
}

function redigestSetupCheckReceipt(receipt: any): void {
  const { receiptDigestHex: _discarded, ...body } = receipt;
  receipt.receiptDigestHex = domainDigest(
    'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETUP_CHECK_RECEIPT_V2',
    body,
  );
}

function localSettlementObservation(
  target: ReturnType<
    typeof deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1
  >,
) {
  const profile = {
    profileIdHex: 'c1'.repeat(32),
    profileDigestHex: 'c2'.repeat(32),
    environment: 'patched-devnet',
    expectedNetwork: 'devnet',
    expectedGenesisHeaderIdHex: 'c4'.repeat(32),
  } as any;
  const observation = {
    reportDigestHex: 'c3'.repeat(32),
    observedAt: '2020-01-01T00:00:00.000Z',
    boundary: {
      revalidationRequiredBeforeMaterialization: true,
    },
    target: {
      network: 'devnet',
      genesisHeaderHeight: 1,
      genesisHeaderIdHex: 'c4'.repeat(32),
      tipHeaderIdHex: 'c5'.repeat(32),
      tipHeight: 799,
    },
    boxes: {
      tracker: {
        box: { boxId: target.lineages.tracker.genesisInputBoxIdHex },
      },
      duplicatePrevention: {
        box: {
          boxId:
            target.lineages.duplicatePrevention.genesisInputBoxIdHex,
        },
      },
      pooledReserve: {
        box: { boxId: target.lineages.pooledReserve.genesisInputBoxIdHex },
      },
    },
  } as any;
  return { profile, observation };
}

async function freshLocalSettlementObservation(
  target: ReturnType<
    typeof deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1
  >,
  profile: Record<string, any>,
  boxes: Readonly<{
    tracker: Eip12Box;
    duplicatePrevention: Eip12Box;
    pooledReserve: Eip12Box;
  }>,
) {
  const imported = await import('ergo-lib-wasm-nodejs');
  const wasm = imported.default ?? imported;
  const observedBox = (
    role: 'tracker' | 'duplicate-prevention' | 'pooled-reserve',
    box: Eip12Box,
  ) => {
    const parsed = wasm.ErgoBox.from_json(JSON.stringify(box));
    try {
      const sigmaSerializedHex = Buffer.from(
        parsed.sigma_serialize_bytes(),
      ).toString('hex');
      return {
        role,
        box,
        sigmaSerializedHex,
        sigmaSerializedSha256Hex: createHash('sha256')
          .update(Buffer.from(sigmaSerializedHex, 'hex'))
          .digest('hex'),
        checks: {
          requestedBoxIdMatched: true,
          boxIdRecomputedFromJson: true,
          sigmaBytesCanonical: true,
          jsonBinaryMatched: true,
          pureErg: true,
          registerFree: true,
          presentInCurrentUtxoView: true,
          creationHeightNotAfterTip: true,
        },
      };
    } finally {
      parsed.free?.();
    }
  };
  return {
    schema: 'e2s.substrate-federated-genesis-observation.v1',
    reportDigestHex: 'd3'.repeat(32),
    status: 'AGREED',
    observedAt: new Date(Date.now() - 1_000).toISOString(),
    profile: {
      profileIdHex: profile.profileIdHex,
      profileDigestHex: profile.profileDigestHex,
      environment: profile.environment,
      expectedNetwork: profile.expectedNetwork,
      expectedGenesisHeaderIdHex: profile.expectedGenesisHeaderIdHex,
    },
    sources: {
      primary: {
        role: 'primary',
        endpointOrigin: 'http://127.0.0.1:9051',
        sourceIdHex: 'd4'.repeat(32),
      },
      witness: {
        role: 'witness',
        endpointOrigin: 'http://127.0.0.1:9052',
        sourceIdHex: 'd5'.repeat(32),
      },
    },
    target: {
      network: 'devnet',
      genesisHeaderHeight: 1,
      genesisHeaderIdHex: profile.expectedGenesisHeaderIdHex,
      tipHeight: 800,
      tipHeaderIdHex: 'd6'.repeat(32),
    },
    boxes: {
      tracker: observedBox('tracker', boxes.tracker),
      duplicatePrevention: observedBox(
        'duplicate-prevention',
        boxes.duplicatePrevention,
      ),
      pooledReserve: observedBox(
        'pooled-reserve',
        boxes.pooledReserve,
      ),
    },
    agreement: {
      distinctOrigins: true,
      distinctDeclaredNodeIdentities: true,
      distinctDeclaredAdministrationIdentities: true,
      sameExpectedNonMainnetNetwork: true,
      exactExpectedGenesisHeaderMatched: true,
      stableMatchingTip: true,
      exactJsonAndSigmaBoxesMatched: true,
      pairwiseDistinctPureErgRegisterFreeBoxes: true,
    },
    boundary: {
      readOnlyNodeRequestsOnly: true,
      apiKeyOrEnvironmentCredentialRead: false,
      runtimeDatabaseOpened: false,
      deploymentStateOpened: false,
      signerOrWalletMaterialRead: false,
      sourceControlledProfileApprovalAuthenticated: false,
      declaredSourceIdentitiesObservedFromNodes: false,
      independentNodeControlVerified: false,
      nodeAgreementProvesCanonicalConsensus: false,
      tipUtxoAtomicityProved: false,
      targetAcceptanceEstablished: false,
      revalidationRequiredBeforeMaterialization: true,
    },
    authorization: {
      materialize: false,
      check: false,
      sign: false,
      submit: false,
      broadcast: false,
      deploy: false,
      activate: false,
      fundsAuthority: false,
      gate5Closed: false,
      productionReady: false,
    },
  } as any;
}

function isolatedGenesisSeed(value: string, ergoTree = FUNDING_TREE) {
  return {
    value,
    ergoTree,
    assets: [],
    additionalRegisters: {},
    creationHeight: 110,
  };
}

function launchStatement(
  target: ReturnType<
    typeof deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1
  >,
) {
  const ergoHistory = buildSubstrateFederatedIsolatedDevnetErgoHistoryV1({
    target,
    genesisHeaderIdHex: '71'.repeat(32),
    genesisHeight: 1,
    setupAnchorHeaderIdHex: '72'.repeat(32),
    setupAnchorHeight: 120,
    greatestWorkHeadersManifest: Buffer.from('headers'),
    transactionsManifest: Buffer.from('transactions'),
    utxoTransitionsManifest: Buffer.from('utxos'),
  });
  const relayerClosure = buildSubstrateFederatedIsolatedDevnetRelayerClosureV1({
    target,
    gitCommitSha1Hex: '73'.repeat(20),
    sourceArchive: Buffer.from('source'),
    packageLock: Buffer.from('lock'),
    runtimeEntrypointsManifest: Buffer.from('entrypoints'),
    buildArtifact: Buffer.from('build'),
  });
  return buildSubstrateFederatedIsolatedDevnetLaunchStatementV1({
    activationGenerationIdHex: '74'.repeat(32),
    target,
    ergoHistory,
    relayerClosure,
  });
}

function buildGreenfieldBaseline() {
  const target = deriveSubstrateFederatedGreenfieldTargetDescriptorV1({
    trackerRequest: descriptorInput.trackerRequest,
    trackerReceipt: descriptorInput.trackerReceipt,
    familyTemplates: descriptorInput.familyTemplates,
    familyReceipt: descriptorInput.familyReceipt,
  });
  const sourceHistory = buildSubstrateFederatedGreenfieldSourceHistoryV1({
    target,
    genesisNativeBlockHashHex: '75'.repeat(32),
    genesisExecutionBlockHashHex: '76'.repeat(32),
    activationNativeBlockHeight: '2',
    activationNativeBlockHashHex: '77'.repeat(32),
    activationExecutionBlockHashHex: '78'.repeat(32),
    finalizedBlocksManifest: Buffer.from('greenfield-finalized-blocks'),
    runtimeUpgradesManifest: Buffer.from('greenfield-runtime-upgrades'),
    applicationDeploymentsManifest: Buffer.from(
      'greenfield-application-deployments',
    ),
  });
  const ergoHistory = buildSubstrateFederatedGreenfieldErgoHistoryV1({
    target,
    genesisHeaderIdHex: '79'.repeat(32),
    genesisHeight: 1,
    setupAnchorHeaderIdHex: '7a'.repeat(32),
    setupAnchorHeight: 120,
    greatestWorkHeadersManifest: Buffer.from('greenfield-headers'),
    transactionsManifest: Buffer.from('greenfield-transactions'),
    utxoTransitionsManifest: Buffer.from('greenfield-utxos'),
  });
  const relayerClosure = buildSubstrateFederatedGreenfieldRelayerClosureV1({
    target,
    gitCommitSha1Hex: '7b'.repeat(20),
    sourceArchive: Buffer.from('greenfield-source'),
    packageLock: Buffer.from('greenfield-lock'),
    runtimeEntrypointsManifest: Buffer.from('greenfield-entrypoints'),
    buildArtifact: Buffer.from('greenfield-build'),
  });
  const statement = buildSubstrateFederatedGreenfieldLaunchStatementV1({
    activationGenerationIdHex: '7c'.repeat(32),
    target,
    sourceHistory,
    ergoHistory,
    relayerClosure,
  });
  return buildSubstrateFederatedGreenfieldLaunchBaselineV1({
    statement,
    signatures: signStatement(statement.attestationDigestHex),
  });
}

function historyFixture(): {
  bundle: SubstrateFederatedAuthoritySafeDevnetHistoryBundleV1;
  pins: Omit<
    SubstrateFederatedIsolatedDevnetTargetPinsV1,
    | 'expectedSourceAttestationKeySetDigestHex'
    | 'expectedSourceAttestationThreshold'
    | 'expectedSourceNetworkIdHex'
    | 'expectedSidechainIdHex'
    | 'expectedRuntimeProfileIdHex'
    | 'expectedSettlementProfileIdHex'
  >;
} {
  const target = {
    frontierCommit: '81'.repeat(20),
    frontierPatchSha256Hex: '82'.repeat(32),
    generatedSpecSha256Hex: '83'.repeat(32),
    nativeGenesisHashHex: GENESIS_NATIVE_HASH,
    acceptedNativeTipHashHex: TIP_NATIVE_HASH,
    acceptedExecutionTipHashHex: TIP_EXECUTION_HASH,
    sourceRuntimeCodeSha256Hex: SOURCE_RUNTIME_DIGEST,
    sourceRuntimeCodeBytes: 1_969_685,
    storageLayoutDigestHex: '84'.repeat(32),
    bridgeAddressHex: BRIDGE_ADDRESS,
    bridgeRuntimeCodeSha256Hex: BRIDGE_RUNTIME_DIGEST,
    bridgeRuntimeCodeBytes: 4_104,
    tokenAddressHex: TOKEN_ADDRESS,
    tokenRuntimeCodeSha256Hex: TOKEN_RUNTIME_DIGEST,
    tokenRuntimeCodeBytes: 2_356,
    binarySha256Hex: '85'.repeat(32),
    processBindingDigestHex: '86'.repeat(32),
  };
  const acceptanceBody = {
    schema: 'e2s.substrate-federated-authority-safe-devnet-acceptance.v1',
    version: 1,
    status: 'isolated_exact_authority_safe_target_accepted',
    source: {
      frontierCommit: target.frontierCommit,
      frontierPatchSha256Hex: target.frontierPatchSha256Hex,
      checkoutDigestHex: '88'.repeat(32),
    },
    toolchain: {
      lockSha256Hex: '87'.repeat(32),
      platformKey: 'win32-x64',
      rustTarget: 'x86_64-pc-windows-msvc',
      cargo: { version: 'cargo 1.82.0', sha256Hex: '90'.repeat(32) },
      rustc: { version: 'rustc 1.82.0', sha256Hex: '91'.repeat(32) },
      git: { version: 'git version 2.54.0', sha256Hex: '92'.repeat(32) },
    },
    binary: {
      byteLength: 96_144_384,
      sha256Hex: target.binarySha256Hex,
      version: 'frontier-template-node.exe 0.0.0-test',
    },
    chainSpec: {
      reproducedBaseByteLength: 3_941_816,
      reproducedBaseSha256Hex: '89'.repeat(32),
      generatedByteLength: 3_962_352,
      generatedSha256Hex: target.generatedSpecSha256Hex,
      nodeAcceptedByteLength: 4_073_595,
      nodeAcceptedSha256Hex: '8a'.repeat(32),
      semanticDigestHex: '8b'.repeat(32),
    },
    runtimeTests: [{
      name: 'bridge_atomicity_tests::authority_safe_genesis_quarantines_owner_mint_without_sudo_or_active_profile',
      outputDigestHex: '93'.repeat(32),
    }, {
      name: 'bridge_atomicity_tests::inactive_profile_rejects_direct_owner_mint_before_evm_and_preserves_authoring',
      outputDigestHex: '94'.repeat(32),
    }],
    observation: {
      nativeGenesisHashHex: `0x${target.nativeGenesisHashHex}`,
      nativeTipHeight: '2',
      runtimeCodeSha256Hex: target.sourceRuntimeCodeSha256Hex,
      storageLayoutDigestHex: target.storageLayoutDigestHex,
      twoNodeConsensusDigestHex: '8c'.repeat(32),
      observationDigestHex: '8d'.repeat(32),
    },
    processes: {
      primaryPeerIdSha256Hex: '8e'.repeat(32),
      witnessPeerIdSha256Hex: '8f'.repeat(32),
      processBindingDigestHex: target.processBindingDigestHex,
    },
    checks: acceptanceChecks(),
    boundaries: acceptanceBoundaries(),
  };
  const acceptance = {
    ...acceptanceBody,
    acceptanceDigestHex: g1cDigest(acceptanceBody),
  };
  const commonManifest = {
    version: 1,
    target: withoutProcessTarget(target),
    firstHeight: '0',
    lastHeight: '2',
  };
  const nativeHashes = [GENESIS_NATIVE_HASH, '95'.repeat(32), TIP_NATIVE_HASH];
  const executionHashes = ['96'.repeat(32), '97'.repeat(32), TIP_EXECUTION_HASH];
  const blocks = nativeHashes.map((nativeBlockHashHex, index) => ({
    height: String(index),
    nativeBlockHashHex,
    nativeHeader: {
      digest: { logs: [] },
      extrinsicsRoot: `0x${'a1'.repeat(32)}`,
      number: `0x${index.toString(16)}`,
      parentHash: `0x${index === 0 ? '00'.repeat(32) : nativeHashes[index - 1]}`,
      stateRoot: `0x${'a2'.repeat(32)}`,
    },
    executionBlockHashHex: executionHashes[index],
    executionBlock: {
      author: `0x${'00'.repeat(20)}`,
      baseFeePerGas: '0x1',
      difficulty: '0x0',
      extraData: '0x',
      gasLimit: '0x1',
      gasUsed: '0x0',
      hash: `0x${executionHashes[index]}`,
      logsBloom: `0x${'00'.repeat(256)}`,
      miner: `0x${'00'.repeat(20)}`,
      nonce: `0x${'00'.repeat(8)}`,
      number: `0x${index.toString(16)}`,
      parentHash: `0x${index === 0 ? '00'.repeat(32) : executionHashes[index - 1]}`,
      receiptsRoot: `0x${'a3'.repeat(32)}`,
      sha3Uncles: `0x${'a4'.repeat(32)}`,
      size: '0x1',
      stateRoot: `0x${'a5'.repeat(32)}`,
      timestamp: `0x${index.toString(16)}`,
      totalDifficulty: '0x0',
      transactions: [],
      transactionsRoot: `0x${'a6'.repeat(32)}`,
      uncles: [],
    },
  }));
  const reportedFinality = ['primary', 'witness'].map(role => ({
    role,
    headHeight: '2',
    headNativeBlockHashHex: TIP_NATIVE_HASH,
    ancestryToAcceptedTip: [{
      height: '2',
      nativeBlockHashHex: TIP_NATIVE_HASH,
      parentNativeBlockHashHex: nativeHashes[1],
    }],
  }));
  const finalized = {
    schema: 'e2s.substrate-federated-authority-safe-devnet-reported-finalized-blocks.v1',
    ...commonManifest,
    finalityAuthority: 'two-owned-node-rpc-reported',
    blocks,
    reportedFinality,
  };
  const runtime = {
    schema: 'e2s.substrate-federated-authority-safe-devnet-runtime-history.v1',
    ...commonManifest,
    states: blocks.map((block, index) => ({
      height: block.height,
      nativeBlockHashHex: block.nativeBlockHashHex,
      runtimeCodeSha256Hex: index === 2 ? SOURCE_RUNTIME_DIGEST : '98'.repeat(32),
      runtimeCodeBytes: index === 2 ? 1_969_685 : 1,
    })),
  };
  const application = {
    schema: 'e2s.substrate-federated-authority-safe-devnet-application-history.v1',
    ...commonManifest,
    bridgeAddressHex: BRIDGE_ADDRESS,
    tokenAddressHex: TOKEN_ADDRESS,
    states: blocks.map((block, index) => ({
      height: block.height,
      executionBlockHashHex: block.executionBlockHashHex,
      bridgeRuntimeCodeSha256Hex: index === 2 ? BRIDGE_RUNTIME_DIGEST : '99'.repeat(32),
      bridgeRuntimeCodeBytes: index === 2 ? 4_104 : 1,
      tokenRuntimeCodeSha256Hex: index === 2 ? TOKEN_RUNTIME_DIGEST : '9a'.repeat(32),
      tokenRuntimeCodeBytes: index === 2 ? 2_356 : 1,
    })),
  };
  const acceptanceReport = jsonBytes(acceptance);
  const reportedFinalizedBlocks = jsonBytes(finalized);
  const runtimeHistory = jsonBytes(runtime);
  const applicationHistory = jsonBytes(application);
  const receiptBody = {
    schema: 'e2s.substrate-federated-authority-safe-devnet-history.v1',
    version: 1,
    status: 'isolated_exact_target_history_collected',
    acceptanceDigestHex: acceptance.acceptanceDigestHex,
    target,
    interval: {
      semantics: 'genesis-through-accepted-observation-tip-inclusive',
      genesisNativeBlockHashHex: GENESIS_NATIVE_HASH,
      observedTipHeight: '2',
      observedTipNativeBlockHashHex: TIP_NATIVE_HASH,
      observedTipExecutionBlockHashHex: TIP_EXECUTION_HASH,
      blockCount: 3,
      reportedFinality,
    },
    artifacts: {
      acceptanceReport: artifact(acceptanceReport),
      reportedFinalizedBlocks: artifact(reportedFinalizedBlocks),
      runtimeHistory: artifact(runtimeHistory),
      applicationHistory: artifact(applicationHistory),
    },
    checks: receiptChecks(),
    boundaries: receiptBoundaries(),
  };
  const receipt = {
    ...receiptBody,
    historyDigestHex: sha256CanonicalJson(receiptBody, HISTORY_DOMAIN),
  };
  const historyReceipt = jsonBytes(receipt);
  return {
    bundle: {
      acceptanceReport,
      reportedFinalizedBlocks,
      runtimeHistory,
      applicationHistory,
      historyReceipt,
    },
    pins: {
      expectedAcceptanceDigestHex: acceptance.acceptanceDigestHex,
      expectedHistoryDigestHex: receipt.historyDigestHex,
      expectedHistoryArtifacts: {
        acceptanceReportSha256Hex: sha256(acceptanceReport),
        reportedFinalizedBlocksSha256Hex: sha256(reportedFinalizedBlocks),
        runtimeHistorySha256Hex: sha256(runtimeHistory),
        applicationHistorySha256Hex: sha256(applicationHistory),
        historyReceiptSha256Hex: sha256(historyReceipt),
      },
    },
  };
}

function withoutProcessTarget(target: Record<string, unknown>) {
  const { binarySha256Hex: _binary, processBindingDigestHex: _process, ...rest } = target;
  return rest;
}

function acceptanceChecks() {
  return {
    exactPatchedSourceCheckoutVerifiedBeforeAndAfter: true,
    exactLockedToolchainVerifiedBeforeAndAfter: true,
    sourceLockedOfflineBuildPassed: true,
    freshIsolatedCargoTargetUsed: true,
    deterministicWasmPathRemappingApplied: true,
    builtInRuntimeBaseSpecReproducedExactly: true,
    runningNodeImageIdentityBoundForBothNodesAndVerifiedBeforeAndAfter: true,
    exactMutualPeerIdentityAndLoopbackIsolationObservedAtActionBoundaries: true,
    spawnedNodeListenersBoundAndReleased: true,
    generatedSpecAcceptedByExactBinary: true,
    nodeAcceptedSpecSemanticallyMatchesGeneratedSpec: true,
    exactTwoNodeRuntimeObservationJoined: true,
    directOwnerMintDryRunRejected: true,
    sourceLockedDirectOwnerMintBlockRejected: true,
    sourceLockedForwardedOwnerMintBlockRejected: true,
    typedQuarantineAndAbsentAuthorityStateObserved: true,
  };
}

function acceptanceBoundaries() {
  return {
    exactAuthoritySafeTargetIdentityObserved: true,
    targetHistoryIntakeEligible: true,
    targetHistoryCollected: false,
    targetHistoryAuthenticated: false,
    independentSourceAdministrationEstablished: false,
    sourceFinalityAuthenticated: false,
    completeBuildToolClosureVerified: false,
    dependencyCacheContentAttested: false,
    independentBuildAttestationVerified: false,
    syntheticDryRunProbeOnly: true,
    probeSubmitted: false,
    probeBroadcast: false,
    federatedLaunchEligible: false,
    mintAuthorized: false,
    settlementAuthorized: false,
    valueLifecycleTransactionConstructed: false,
    signingAuthorized: false,
    submissionAuthorized: false,
    broadcastAuthorized: false,
    profileActivated: false,
    gate5Closed: false,
    trustlessStatusEstablished: false,
    productionReadinessEstablished: false,
  };
}

function receiptChecks() {
  return {
    freshExactTargetAcceptanceConsumed: true,
    exactProcessOwnedObservationTipConsumed: true,
    exactAcceptedTargetIdentityRecheckedAtHistoryTip: true,
    archiveGenesisStateReadFromBothOrigins: true,
    completeBoundedHeightIntervalCollected: true,
    nativeAndExecutionParentChainsContiguous: true,
    bothOriginsMatchedEveryCollectedHeight: true,
    acceptedTipIsAncestorOfEachRpcReportedFinalizedHead: true,
    everyCollectedRowStableAfterCollection: true,
    exactRuntimeAndApplicationHistoryMaterialized: true,
  };
}

function receiptBoundaries() {
  return {
    targetHistoryCollected: true,
    targetHistoryAuthenticated: false,
    sourceAttestationQuorumVerified: false,
    sourceConsensusIndependentlyVerified: false,
    independentSourceAdministrationEstablished: false,
    sourceFinalityAuthenticated: false,
    ergoHistoryCollected: false,
    relayerClosureCollected: false,
    isolatedDevnetTargetDescriptorProduced: false,
    isolatedDevnetLaunchStatementProduced: false,
    portableReplayCompleted: false,
    setupTransactionIdentitiesFrozen: false,
    setupTransactionConstructed: false,
    setupTransactionSigned: false,
    nodeCheckPerformed: false,
    submissionAuthorized: false,
    broadcastAuthorized: false,
    profileActivated: false,
    fundsAuthorityEstablished: false,
    gate5Closed: false,
    trustlessStatusEstablished: false,
    productionReadinessEstablished: false,
  };
}

function sourceSigner(): SourceSigner {
  const { privateKey } = generateKeyPairSync('ed25519');
  const publicKeyDer = createPublicKey(privateKey).export({
    format: 'der',
    type: 'spki',
  });
  return {
    privateKey,
    publicKeyHex: Buffer.from(publicKeyDer).subarray(-32).toString('hex'),
  };
}

function signStatement(digestHex: string) {
  return sourceSigners.slice(0, 2)
    .map(value => signatureFor(value, digestHex))
    .sort(sortSignature);
}

function signatureFor(
  signer: SourceSigner,
  digestHex: string,
): SubstrateFederatedIsolatedDevnetLaunchSignatureV1 {
  return {
    signerPublicKeyHex: signer.publicKeyHex,
    signatureHex: sign(
      null,
      Buffer.from(digestHex, 'hex'),
      signer.privateKey,
    ).toString('hex'),
  };
}

function sortSignature(
  left: SubstrateFederatedIsolatedDevnetLaunchSignatureV1,
  right: SubstrateFederatedIsolatedDevnetLaunchSignatureV1,
) {
  return left.signerPublicKeyHex < right.signerPublicKeyHex ? -1 : 1;
}

function cloneTargetInput(
  input: DeriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1Input,
): MutableTargetInput {
  return structuredClone(input) as unknown as MutableTargetInput;
}

function refreshHistoryReceiptPin(input: MutableTargetInput): void {
  input.trustPins.expectedHistoryArtifacts.historyReceiptSha256Hex =
    sha256(input.historyBundle.historyReceipt);
}

function replaceHistoryArtifact(
  input: MutableTargetInput,
  bundleKey: 'reportedFinalizedBlocks' | 'runtimeHistory' | 'applicationHistory',
  pinKey:
    | 'reportedFinalizedBlocksSha256Hex'
    | 'runtimeHistorySha256Hex'
    | 'applicationHistorySha256Hex',
  mutate: (value: any) => void,
): void {
  const manifest = JSON.parse(
    Buffer.from(input.historyBundle[bundleKey]).toString('utf8'),
  );
  mutate(manifest);
  input.historyBundle[bundleKey] = jsonBytes(manifest);
  input.trustPins.expectedHistoryArtifacts[pinKey] =
    sha256(input.historyBundle[bundleKey]);
  const receipt = JSON.parse(
    Buffer.from(input.historyBundle.historyReceipt).toString('utf8'),
  );
  receipt.artifacts[bundleKey] = artifact(input.historyBundle[bundleKey]);
  replaceReceipt(input, receipt);
}

function replaceAcceptance(
  input: MutableTargetInput,
  mutate: (value: any) => void,
): void {
  const acceptance = JSON.parse(
    Buffer.from(input.historyBundle.acceptanceReport).toString('utf8'),
  );
  mutate(acceptance);
  const { acceptanceDigestHex: _oldDigest, ...body } = acceptance;
  acceptance.acceptanceDigestHex = g1cDigest(body);
  input.historyBundle.acceptanceReport = jsonBytes(acceptance);
  input.trustPins.expectedAcceptanceDigestHex = acceptance.acceptanceDigestHex;
  input.trustPins.expectedHistoryArtifacts.acceptanceReportSha256Hex =
    sha256(input.historyBundle.acceptanceReport);
  const receipt = JSON.parse(
    Buffer.from(input.historyBundle.historyReceipt).toString('utf8'),
  );
  receipt.acceptanceDigestHex = acceptance.acceptanceDigestHex;
  receipt.artifacts.acceptanceReport = artifact(input.historyBundle.acceptanceReport);
  replaceReceipt(input, receipt);
}

function replaceReceipt(input: MutableTargetInput, receipt: any): void {
  const { historyDigestHex: _oldDigest, ...body } = receipt;
  receipt.historyDigestHex = sha256CanonicalJson(body, HISTORY_DOMAIN);
  input.historyBundle.historyReceipt = jsonBytes(receipt);
  input.trustPins.expectedHistoryDigestHex = receipt.historyDigestHex;
  refreshHistoryReceiptPin(input);
}

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
}

function artifact(value: Uint8Array) {
  return { sha256Hex: sha256(value), sizeBytes: value.length };
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function domainDigest(domain: string, value: unknown): string {
  return createHash('sha256')
    .update(domain, 'ascii')
    .update('\0', 'ascii')
    .update(canonicalJson(value), 'utf8')
    .digest('hex');
}

function g1cDigest(value: unknown): string {
  const sort = (child: unknown): unknown => {
    if (Array.isArray(child)) return child.map(sort);
    if (child !== null && typeof child === 'object') {
      return Object.fromEntries(
        Object.entries(child as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, sort(nested)]),
      );
    }
    return child;
  };
  return createHash('sha256')
    .update(JSON.stringify(sort(value)), 'utf8')
    .digest('hex');
}
