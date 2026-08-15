import {
  createPublicKey,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  buildSubstrateFederatedCheckpointProfileV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  buildSubstrateFederatedGreenfieldErgoHistoryV1,
  buildSubstrateFederatedGreenfieldGenerationV1,
  buildSubstrateFederatedGreenfieldLaunchBaselineV1,
  buildSubstrateFederatedGreenfieldLaunchStatementV1,
  buildSubstrateFederatedGreenfieldRelayerClosureV1,
  buildSubstrateFederatedGreenfieldSourceHistoryV1,
  deriveSubstrateFederatedGreenfieldTargetDescriptorV1,
  type SubstrateFederatedGreenfieldLaunchSignatureV1,
  type SubstrateFederatedGreenfieldLaunchStatementV1,
} from './substrate-federated-greenfield-launch-v1.js';
import {
  buildSubstrateFederatedGenesisTargetProfileV1,
  observeSubstrateFederatedGenesisV1,
} from './substrate-federated-genesis-observation-v1.js';
import {
  buildSubstrateFederatedGenesisProvisioningV1,
  buildSubstrateFederatedGreenfieldGenesisProvisioningV1,
} from './substrate-federated-genesis-provisioning-v1.js';
import {
  compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1,
  type CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV1Input,
} from './substrate-federated-settlement-family-jvm-compiler-v1.js';
import type {
  SubstrateFederatedSettlementFamilyV1Template,
} from './substrate-federated-settlement-family-v1.js';
import {
  compileSubstrateFederatedTrackerWithPinnedJvmV1,
} from './substrate-federated-tracker-jvm-compiler-v1.js';
import {
  buildSubstrateFederatedTrackerCompilerRequestV1,
} from './substrate-federated-tracker-compiler-v1.js';
import { ORIGINAL_NODE_OPTIONS } from './test-node-env.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

const GENESIS_HEADER_ID = '91'.repeat(32);
const TIP_HEADER_ID = '92'.repeat(32);
const FUNDING_TREE = `0008cd02${'22'.repeat(32)}`;
const SOURCE_NETWORK_ID = '01'.repeat(32);
const SIDECHAIN_ID = '02'.repeat(32);
const BRIDGE_ADDRESS = '03'.repeat(20);
const TOKEN_ADDRESS = '04'.repeat(20);
const RUNTIME_PROFILE_ID = '05'.repeat(32);
const SETTLEMENT_PROFILE_ID = '06'.repeat(32);
const BASE_INPUT: Eip12Box = {
  boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5',
  value: '300000000',
  ergoTree: FUNDING_TREE,
  assets: [],
  additionalRegisters: {},
  creationHeight: 110,
  transactionId: '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab',
  index: 0,
};
const ERGO_KEYS = Object.freeze([
  '0227562580bbfc2cf3f72b3dbb725f30f358ca545209255458536adcf1a4aad871',
  '02671c8e95c0237797901a6cdb2ef8e6599400578385455f3423f77e43df39aad5',
  '03b6447502eeff10813c6c7a01e1f2c3a97c54bbeeb3f9206984ccb0e63b0c56f3',
]);

interface SourceSigner {
  readonly publicKeyHex: string;
  readonly privateKey: KeyObject;
}

interface GenesisFixture {
  readonly tracker: Eip12Box;
  readonly duplicatePrevention: Eip12Box;
  readonly pooledReserve: Eip12Box;
  readonly sigmaByBoxId: ReadonlyMap<string, string>;
}

let fixture: GenesisFixture;
let sourceSigners: readonly SourceSigner[];
let descriptorInput: Parameters<
  typeof deriveSubstrateFederatedGreenfieldTargetDescriptorV1
>[0];
let targetDescriptor: ReturnType<
  typeof deriveSubstrateFederatedGreenfieldTargetDescriptorV1
>;
let sourceHistory: ReturnType<
  typeof buildSubstrateFederatedGreenfieldSourceHistoryV1
>;
let ergoHistory: ReturnType<
  typeof buildSubstrateFederatedGreenfieldErgoHistoryV1
>;
let relayerClosure: ReturnType<
  typeof buildSubstrateFederatedGreenfieldRelayerClosureV1
>;
let statement: Readonly<SubstrateFederatedGreenfieldLaunchStatementV1>;
let signatures: readonly Readonly<SubstrateFederatedGreenfieldLaunchSignatureV1>[];
let generation: ReturnType<typeof buildSubstrateFederatedGreenfieldGenerationV1>;
let provisioningInput: Parameters<
  typeof buildSubstrateFederatedGreenfieldGenesisProvisioningV1
>[0];

describe('Substrate federated greenfield launch V1', () => {
  beforeAll(async () => {
    if (
      ORIGINAL_NODE_OPTIONS !== undefined
      || process.env.NODE_OPTIONS !== '--no-deprecation'
    ) {
      throw new Error('Vitest parent NODE_OPTIONS is not the reviewed harness value');
    }
    fixture = await genesisFixture();
    sourceSigners = Array.from({ length: 3 }, sourceSigner)
      .sort((left, right) => left.publicKeyHex < right.publicKeyHex ? -1 : 1);
    const profile = buildSubstrateFederatedCheckpointProfileV1({
      federationEpoch: '17',
      maxAdmissionValidityBlocks: '64',
      sourceAttestationThreshold: 2,
      sourceAttestationPublicKeysHex:
        sourceSigners.map(value => value.publicKeyHex),
      ergoAdmissionThreshold: 2,
      ergoAdmissionPublicKeysHex: ERGO_KEYS,
    });
    const trackerRequest = buildSubstrateFederatedTrackerCompilerRequestV1({
      template: contractTemplate('contracts/SPVTrackerSubstrateFederatedV1.es'),
      trackerGenesisInputBoxIdHex: fixture.tracker.boxId,
      profile,
      application: {
        sourceNetworkIdHex: SOURCE_NETWORK_ID,
        sidechainIdHex: SIDECHAIN_ID,
        bridgeAddressHex: BRIDGE_ADDRESS,
        tokenAddressHex: TOKEN_ADDRESS,
        bridgeRuntimeCodeSha256Hex: '07'.repeat(32),
        bridgeRuntimeCodeBytes: 12_345,
        tokenRuntimeCodeSha256Hex: '08'.repeat(32),
        tokenRuntimeCodeBytes: 6_789,
        sourceRuntimeCodeSha256Hex: '09'.repeat(32),
        sourceRuntimeCodeBytes: 54_321,
        runtimeProfileIdHex: RUNTIME_PROFILE_ID,
        settlementProfileIdHex: SETTLEMENT_PROFILE_ID,
      },
    });
    const templates = familyTemplates();
    const parentNodeOptions = process.env.NODE_OPTIONS;
    delete process.env.NODE_OPTIONS;
    let trackerReceipt;
    let familyReceipt;
    try {
      trackerReceipt =
        await compileSubstrateFederatedTrackerWithPinnedJvmV1(trackerRequest);
      familyReceipt =
        await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1({
          trackerRequest,
          trackerReceipt,
          templates,
          duplicatePreventionGenesisInputBoxIdHex:
            fixture.duplicatePrevention.boxId,
          pooledReserveGenesisInputBoxIdHex: fixture.pooledReserve.boxId,
        });
    } finally {
      process.env.NODE_OPTIONS = parentNodeOptions;
    }
    descriptorInput = {
      trackerRequest,
      trackerReceipt,
      familyTemplates: templates,
      familyReceipt,
    };
    targetDescriptor =
      deriveSubstrateFederatedGreenfieldTargetDescriptorV1(descriptorInput);
    sourceHistory =
      buildSubstrateFederatedGreenfieldSourceHistoryV1({
        target: targetDescriptor,
        genesisNativeBlockHashHex: '0a'.repeat(32),
        genesisExecutionBlockHashHex: '0b'.repeat(32),
        activationNativeBlockHeight: '24',
        activationNativeBlockHashHex: '0c'.repeat(32),
        activationExecutionBlockHashHex: '0d'.repeat(32),
        finalizedBlocksManifest: bytes('source-finalized-blocks'),
        runtimeUpgradesManifest: bytes('source-runtime-upgrades'),
        applicationDeploymentsManifest: bytes('source-application-deployments'),
      });
    ergoHistory = buildSubstrateFederatedGreenfieldErgoHistoryV1({
      target: targetDescriptor,
      genesisHeaderIdHex: GENESIS_HEADER_ID,
      genesisHeight: 1,
      setupAnchorHeaderIdHex: TIP_HEADER_ID,
      setupAnchorHeight: 120,
      greatestWorkHeadersManifest: bytes('ergo-greatest-work-headers'),
      transactionsManifest: bytes('ergo-transactions'),
      utxoTransitionsManifest: bytes('ergo-utxo-transitions'),
    });
    relayerClosure =
      buildSubstrateFederatedGreenfieldRelayerClosureV1({
        target: targetDescriptor,
        gitCommitSha1Hex: '0e'.repeat(20),
        sourceArchive: bytes('relayer-source-archive'),
        packageLock: bytes('relayer-package-lock'),
        runtimeEntrypointsManifest: bytes('relayer-runtime-entrypoints'),
        buildArtifact: bytes('relayer-build-artifact'),
      });
    statement = buildSubstrateFederatedGreenfieldLaunchStatementV1({
      activationGenerationIdHex: '0f'.repeat(32),
      target: targetDescriptor,
      sourceHistory,
      ergoHistory,
      relayerClosure,
    });
    signatures = sourceSigners.slice(0, 2).map(sourceSignerValue => ({
      signerPublicKeyHex: sourceSignerValue.publicKeyHex,
      signatureHex: sign(
        null,
        Buffer.from(statement.attestationDigestHex, 'hex'),
        sourceSignerValue.privateKey,
      ).toString('hex'),
    }));
    const launchBaseline =
      buildSubstrateFederatedGreenfieldLaunchBaselineV1({
        statement,
        signatures,
      });
    generation = buildSubstrateFederatedGreenfieldGenerationV1({
      launchBaseline,
      ...descriptorInput,
    });
    const observed = await observeFixture(fixture);
    provisioningInput = {
      targetProfile: observed.targetProfile,
      observation: observed.observation,
      ...descriptorInput,
      generationManifest: generation,
    };
  }, 120_000);

  it('binds one attested genesis-to-activation baseline to all 53 predecessor routes', () => {
    expect(statement.routeCoverage.routeCount).toBe(53);
    expect(statement.routeCoverage.routes.every(
      route => route.disposition === 'not-instantiated',
    )).toBe(true);
    expect(new Set(statement.routeCoverage.routes.map(
      route => route.evidenceComponent,
    ))).toEqual(new Set([
      'source-genesis-history',
      'ergo-genesis-history',
      'shipped-relayer-closure',
    ]));
    expect(generation.globalReplay).toEqual({
      sourcePacketDigestHex: expect.stringMatching(/^[0-9a-f]{64}$/),
      canonicalBurnIdsHex: [],
      canonicalBurnIdCount: 0,
      duplicatePreventionDigestHex: expect.stringMatching(/^[0-9a-f]{66}$/),
      derivation: 'empty-from-quorum-authenticated-non-instantiation',
    });
    expect(generation.checks).toMatchObject({
      exactStaticPredecessorRouteSetMatched: true,
      emptyReplayRootDerivedInternally: true,
      emptyReplayClaimAuthenticatedBySourceQuorum: true,
      migrationArtifactAcceptedAsGreenfieldAuthority: false,
      callerNonInstantiationClaimsAccepted: false,
    });
  });

  it('feeds the exact authenticated baseline into unsigned genesis provisioning', async () => {
    const plan = await buildSubstrateFederatedGreenfieldGenesisProvisioningV1(
      provisioningInput,
    );
    expect(plan.schema)
      .toBe('e2s.substrate-federated-greenfield-genesis-provisioning.v1');
    expect(plan.sourceBindings).toMatchObject({
      greenfieldLaunchBaselineDigestHex:
        generation.launchBaseline.baselineDigestHex,
      greenfieldLaunchStatementDigestHex:
        generation.launchBaseline.statementDigestHex,
      greenfieldSourceHistoryDigestHex:
        generation.launchBaseline.sourceHistoryDigestHex,
      greenfieldErgoHistoryDigestHex:
        generation.launchBaseline.ergoHistoryDigestHex,
      greenfieldRelayerClosureDigestHex:
        generation.launchBaseline.relayerClosureDigestHex,
      signedErgoGenesisHeaderIdHex: GENESIS_HEADER_ID,
      signedErgoGenesisHeight: 1,
      signedErgoSetupAnchorHeaderIdHex: TIP_HEADER_ID,
      signedErgoSetupAnchorHeight: 120,
    });
    expect(plan.sourceBindings)
      .not.toHaveProperty('cutoverGenerationManifestDigestHex');
    expect(plan.sourceBindings)
      .not.toHaveProperty('semanticBaselineGenerationIdHex');
    expect(plan.replay.canonicalBurnIdsHex).toEqual([]);
    expect(plan.checks).toMatchObject({
      sameProcessGreenfieldGenerationVerified: true,
      authenticatedGreenfieldLaunchBaselineConsumed: true,
      allPredecessorRoutesNotInstantiatedUnderFederatedTrust: true,
      emptyReplayDerivedFromQuorumAuthenticatedNonInstantiation: true,
      exactSignedErgoHistoryMatchedObservation: true,
      migrationCutoverArtifactConsumed: false,
    });
    expect(plan.checks)
      .not.toHaveProperty('sameProcessCutoverGenerationVerified');
    expect(plan.checks)
      .not.toHaveProperty('globalReplayImportedIntoDuplicatePrevention');
    expect(Object.values(plan.transactions)).toHaveLength(3);
    expect(Object.values(plan.lineages).every(
      lineage => /^[0-9a-f]{64}$/.test(lineage.issuanceTransactionIdHex),
    )).toBe(true);
    expect(plan.boundaries).toMatchObject({
      greenfieldLaunchBaselineAuthenticated: true,
      predecessorRouteNonInstantiationAcceptedUnderFederatedTrust: true,
      targetNetworkConsensusAuthenticated: false,
      profileActivated: false,
      fundsAuthorityEstablished: false,
      trustlessStatusEstablished: false,
    });
  });

  it('does not allow the migration provisioner to consume the greenfield generation', async () => {
    await expect(buildSubstrateFederatedGenesisProvisioningV1(
      provisioningInput as any,
    )).rejects.toThrow(/mode does not match the generation schema/i);
  });

  it('does not allow the greenfield provisioner to consume a migration schema', async () => {
    const migrationShapedGeneration = structuredClone(generation) as any;
    migrationShapedGeneration.schema =
      'e2s.substrate-federated-cutover-generation.v1';
    await expect(buildSubstrateFederatedGreenfieldGenesisProvisioningV1({
      ...provisioningInput,
      generationManifest: migrationShapedGeneration,
    } as any)).rejects.toThrow(/mode does not match the generation schema/i);
  });

  it('rejects a signed Ergo history spliced onto another observed chain', async () => {
    for (const chain of [
      { genesisHeaderIdHex: '15'.repeat(32) },
      { tipHeaderIdHex: '16'.repeat(32) },
      { tipHeight: 121 },
    ]) {
      const observed = await observeFixture(fixture, chain);
      await expect(buildSubstrateFederatedGreenfieldGenesisProvisioningV1({
        ...provisioningInput,
        targetProfile: observed.targetProfile,
        observation: observed.observation,
      })).rejects.toThrow(/signed Ergo genesis or setup anchor/i);
    }
  });

  it('rejects raw history byte drift under the original quorum signatures', () => {
    const changedSource = buildSubstrateFederatedGreenfieldSourceHistoryV1({
      target: targetDescriptor,
      genesisNativeBlockHashHex: '0a'.repeat(32),
      genesisExecutionBlockHashHex: '0b'.repeat(32),
      activationNativeBlockHeight: '24',
      activationNativeBlockHashHex: '0c'.repeat(32),
      activationExecutionBlockHashHex: '0d'.repeat(32),
      finalizedBlocksManifest: bytes('changed-source-finalized-blocks'),
      runtimeUpgradesManifest: bytes('source-runtime-upgrades'),
      applicationDeploymentsManifest: bytes('source-application-deployments'),
    });
    const changedErgo = buildSubstrateFederatedGreenfieldErgoHistoryV1({
      target: targetDescriptor,
      genesisHeaderIdHex: GENESIS_HEADER_ID,
      genesisHeight: 1,
      setupAnchorHeaderIdHex: TIP_HEADER_ID,
      setupAnchorHeight: 120,
      greatestWorkHeadersManifest: bytes('ergo-greatest-work-headers'),
      transactionsManifest: bytes('changed-ergo-transactions'),
      utxoTransitionsManifest: bytes('ergo-utxo-transitions'),
    });
    const changedRelayer =
      buildSubstrateFederatedGreenfieldRelayerClosureV1({
        target: targetDescriptor,
        gitCommitSha1Hex: '0e'.repeat(20),
        sourceArchive: bytes('relayer-source-archive'),
        packageLock: bytes('relayer-package-lock'),
        runtimeEntrypointsManifest: bytes('relayer-runtime-entrypoints'),
        buildArtifact: bytes('changed-relayer-build-artifact'),
      });
    const changedStatements = [
      buildLaunchStatement({ sourceHistory: changedSource }),
      buildLaunchStatement({ ergoHistory: changedErgo }),
      buildLaunchStatement({ relayerClosure: changedRelayer }),
    ];
    for (const changedStatement of changedStatements) {
      expect(() => buildSubstrateFederatedGreenfieldLaunchBaselineV1({
        statement: changedStatement,
        signatures,
      })).toThrow(/signature is invalid/i);
    }
  });

  it('rejects compiler-target substitution and unknown or duplicate signers', () => {
    const changedRequest = structuredClone(
      provisioningInput.trackerRequest,
    ) as any;
    changedRequest.application.runtimeProfileIdHex = '17'.repeat(32);
    expect(() => deriveSubstrateFederatedGreenfieldTargetDescriptorV1({
      ...descriptorInput,
      trackerRequest: changedRequest,
    })).toThrow(/request|receipt|digest|match/i);

    const unknownSigner = sourceSigner();
    const unknownSignature = {
      signerPublicKeyHex: unknownSigner.publicKeyHex,
      signatureHex: sign(
        null,
        Buffer.from(statement.attestationDigestHex, 'hex'),
        unknownSigner.privateKey,
      ).toString('hex'),
    };
    expect(() => buildSubstrateFederatedGreenfieldLaunchBaselineV1({
      statement,
      signatures: [signatures[0]!, unknownSignature]
        .sort((left, right) => left.signerPublicKeyHex < right.signerPublicKeyHex
          ? -1
          : 1),
    })).toThrow(/key is not registered/i);
    expect(() => buildSubstrateFederatedGreenfieldLaunchBaselineV1({
      statement,
      signatures: [signatures[0]!, signatures[0]!],
    })).toThrow(/strictly sorted and unique/i);
  });

  it('rejects copied statements, copied baselines, signature drift and noncanonical quorum sets', () => {
    const copiedStatement = structuredClone(statement) as any;
    expect(() => buildSubstrateFederatedGreenfieldLaunchBaselineV1({
      statement: copiedStatement,
      signatures,
    })).toThrow(/statement lacks process provenance/i);

    const changedSignature = structuredClone(signatures) as any;
    const changedSignatureBytes = Buffer.from(
      changedSignature[0].signatureHex,
      'hex',
    );
    changedSignatureBytes[0] ^= 0x01;
    changedSignature[0].signatureHex = changedSignatureBytes.toString('hex');
    expect(() => buildSubstrateFederatedGreenfieldLaunchBaselineV1({
      statement,
      signatures: changedSignature,
    })).toThrow(/signature is invalid/i);

    expect(() => buildSubstrateFederatedGreenfieldLaunchBaselineV1({
      statement,
      signatures: [signatures[0]!],
    })).toThrow(/exact source-attestation threshold/i);

    expect(() => buildSubstrateFederatedGreenfieldLaunchBaselineV1({
      statement,
      signatures: [...signatures].reverse(),
    })).toThrow(/strictly sorted and unique/i);

    expect(() => buildSubstrateFederatedGreenfieldGenerationV1({
      launchBaseline: structuredClone(
        buildSubstrateFederatedGreenfieldLaunchBaselineV1({
          statement,
          signatures,
        }),
      ) as any,
      trackerRequest: provisioningInput.trackerRequest,
      trackerReceipt: provisioningInput.trackerReceipt,
      familyTemplates: provisioningInput.familyTemplates,
      familyReceipt: provisioningInput.familyReceipt,
    })).toThrow(/launch baseline was not built in this process/i);
  });
});

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

function bytes(value: string): Buffer {
  return Buffer.from(value, 'ascii');
}

function buildLaunchStatement(overrides: Partial<{
  sourceHistory: typeof sourceHistory;
  ergoHistory: typeof ergoHistory;
  relayerClosure: typeof relayerClosure;
}>): Readonly<SubstrateFederatedGreenfieldLaunchStatementV1> {
  return buildSubstrateFederatedGreenfieldLaunchStatementV1({
    activationGenerationIdHex: '0f'.repeat(32),
    target: targetDescriptor,
    sourceHistory: overrides.sourceHistory ?? sourceHistory,
    ergoHistory: overrides.ergoHistory ?? ergoHistory,
    relayerClosure: overrides.relayerClosure ?? relayerClosure,
  });
}

function familyTemplates(): CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV1Input[
  'templates'
] {
  return {
    duplicatePrevention: contractTemplate(
      'contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
    ),
    sourceLock: contractTemplate('contracts/MainChainLockPooledReserveV6.es'),
    pooledReserve: contractTemplate(
      'contracts/MainChainPooledReserveValidityApplicationV6.es',
    ),
  };
}

function contractTemplate(
  relativePath: string,
): SubstrateFederatedSettlementFamilyV1Template {
  return {
    relativePath,
    source: readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8'),
  };
}

async function genesisFixture(): Promise<GenesisFixture> {
  const materialized = await materializeUnsignedTransaction({
    inputs: [{ ...BASE_INPUT, extension: {} }],
    dataInputs: [],
    outputs: [
      stateSeed('50000000'),
      stateSeed('100000000'),
      stateSeed('150000000'),
    ],
  }, 'federated greenfield genesis fixture');
  const [tracker, duplicatePrevention, pooledReserve] = materialized.outputs;
  const sigmaByBoxId = new Map<string, string>();
  for (const box of materialized.outputs) {
    sigmaByBoxId.set(box.boxId, await sigmaBytes(box));
  }
  return { tracker, duplicatePrevention, pooledReserve, sigmaByBoxId };
}

function stateSeed(value: string) {
  return {
    value,
    ergoTree: FUNDING_TREE,
    assets: [],
    additionalRegisters: {},
    creationHeight: 110,
  };
}

async function sigmaBytes(box: Eip12Box): Promise<string> {
  const imported = await import('ergo-lib-wasm-nodejs');
  const wasm = imported.default ?? imported;
  const parsed = wasm.ErgoBox.from_json(JSON.stringify(box));
  try {
    return Buffer.from(parsed.sigma_serialize_bytes()).toString('hex');
  } finally {
    parsed.free?.();
  }
}

async function observeFixture(
  target: GenesisFixture,
  chain: Readonly<{
    genesisHeaderIdHex?: string;
    tipHeight?: number;
    tipHeaderIdHex?: string;
  }> = {},
) {
  const genesisHeaderIdHex = chain.genesisHeaderIdHex ?? GENESIS_HEADER_ID;
  const tipHeight = chain.tipHeight ?? 120;
  const tipHeaderIdHex = chain.tipHeaderIdHex ?? TIP_HEADER_ID;
  const primary = nodeServer(
    target,
    genesisHeaderIdHex,
    tipHeight,
    tipHeaderIdHex,
  );
  const witness = nodeServer(
    target,
    genesisHeaderIdHex,
    tipHeight,
    tipHeaderIdHex,
  );
  const [primaryOrigin, witnessOrigin] = await Promise.all([
    listen(primary),
    listen(witness),
  ]);
  try {
    const targetProfile = buildSubstrateFederatedGenesisTargetProfileV1({
      profileIdHex: '10'.repeat(32),
      environment: 'testnet',
      expectedNetwork: 'testnet',
      expectedGenesisHeaderIdHex: genesisHeaderIdHex,
      primaryNodeOrigin: primaryOrigin,
      primaryNodeIdentityDigestHex: '11'.repeat(32),
      primaryAdministrationIdentityDigestHex: '12'.repeat(32),
      witnessNodeOrigin: witnessOrigin,
      witnessNodeIdentityDigestHex: '13'.repeat(32),
      witnessAdministrationIdentityDigestHex: '14'.repeat(32),
      trackerGenesisBoxIdHex: target.tracker.boxId,
      duplicatePreventionGenesisBoxIdHex: target.duplicatePrevention.boxId,
      pooledReserveGenesisBoxIdHex: target.pooledReserve.boxId,
    });
    const observation = await observeSubstrateFederatedGenesisV1(
      targetProfile,
      { now: () => new Date('2026-08-13T12:00:00.000Z') },
    );
    return { targetProfile, observation };
  } finally {
    await Promise.all([close(primary), close(witness)]);
  }
}

function nodeServer(
  target: GenesisFixture,
  genesisHeaderIdHex: string,
  tipHeight: number,
  tipHeaderIdHex: string,
): Server {
  const boxes = new Map([
    [target.tracker.boxId, target.tracker],
    [target.duplicatePrevention.boxId, target.duplicatePrevention],
    [target.pooledReserve.boxId, target.pooledReserve],
  ]);
  return createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (path === '/info') {
      return sendJson(response, 200, { network: 'testnet', fullHeight: tipHeight });
    }
    if (path === '/blocks/lastHeaders/1') {
      return sendJson(response, 200, [{ id: tipHeaderIdHex, height: tipHeight }]);
    }
    if (path === '/blocks/at/1') {
      return sendJson(response, 200, [genesisHeaderIdHex]);
    }
    const binary = path.match(/^\/utxo\/byIdBinary\/([0-9a-f]{64})$/);
    if (binary) {
      const serialized = target.sigmaByBoxId.get(binary[1]!);
      return sendJson(response, serialized === undefined ? 404 : 200, {
        bytes: serialized,
      });
    }
    const json = path.match(/^\/utxo\/byId\/([0-9a-f]{64})$/);
    if (json) {
      const box = boxes.get(json[1]!);
      return sendJson(response, box === undefined ? 404 : 200, box ?? {});
    }
    return sendJson(response, 404, {});
  });
}

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
}
