import { spawnSync } from 'node:child_process';
import {
  createPublicKey,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

function yieldToTestWorker(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

import {
  buildSubstrateFederatedCheckpointProfileV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  canonicalJson,
} from './strict-json.js';
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
  buildSubstrateFederatedGreenfieldGenesisProvisioningV1,
} from './substrate-federated-genesis-provisioning-v1.js';
import {
  replaySubstrateFederatedGreenfieldPortableV1,
  SUBSTRATE_FEDERATED_GREENFIELD_ATTESTATION_PACKET_V1_SCHEMA,
  SUBSTRATE_FEDERATED_GREENFIELD_ERGO_UTXO_HISTORY_V1_SCHEMA,
  SUBSTRATE_FEDERATED_GREENFIELD_PORTABLE_REPLAY_REQUEST_V1_SCHEMA,
  type SubstrateFederatedGreenfieldPortableReplayReportV1,
} from './substrate-federated-greenfield-portable-replay-v1.js';
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
import {
  materializeUnsignedTransaction,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

const SCRIPT = 'src/scripts/replay-substrate-federated-greenfield-launch-v1.ts';
const GENESIS_HEADER_ID = '91'.repeat(32);
const SETUP_ANCHOR_HEADER_ID = '92'.repeat(32);
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
const FILES = Object.freeze({
  trackerTemplate: 'contracts/SPVTrackerSubstrateFederatedV1.es',
  duplicatePreventionTemplate:
    'contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
  sourceLockTemplate: 'contracts/MainChainLockPooledReserveV6.es',
  pooledReserveTemplate:
    'contracts/MainChainPooledReserveValidityApplicationV6.es',
  sourceFinalizedBlocksManifest: 'artifacts/source-finalized-blocks.bin',
  sourceRuntimeUpgradesManifest: 'artifacts/source-runtime-upgrades.bin',
  sourceApplicationDeploymentsManifest:
    'artifacts/source-application-deployments.bin',
  ergoGreatestWorkHeadersManifest: 'artifacts/ergo-greatest-work-headers.bin',
  ergoTransactionsManifest: 'artifacts/ergo-transactions.bin',
  ergoUtxoTransitionsManifest: 'artifacts/ergo-utxo-transitions.json',
  relayerSourceArchive: 'artifacts/relayer-source-archive.bin',
  relayerPackageLock: 'artifacts/relayer-package-lock.bin',
  relayerRuntimeEntrypointsManifest:
    'artifacts/relayer-runtime-entrypoints.bin',
  relayerBuildArtifact: 'artifacts/relayer-build-artifact.bin',
  attestationPacket: 'attestation/launch-packet.json',
});

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

let testRoot: string;
let bundleRoot: string;
let fixture: GenesisFixture;
let sourceSigners: readonly SourceSigner[];
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
let provisioningPlan: Awaited<ReturnType<
  typeof buildSubstrateFederatedGreenfieldGenesisProvisioningV1
>>;
let rawArtifacts: Readonly<Record<string, Buffer>>;

describe('Substrate federated greenfield portable replay V1', () => {
  beforeAll(async () => {
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
      template: contractTemplate(FILES.trackerTemplate),
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
    const [trackerReceipt, familyReceipt] = await withoutNodeOptions(
      async () => {
        const compiledTracker =
          await compileSubstrateFederatedTrackerWithPinnedJvmV1(trackerRequest);
        await yieldToTestWorker();
        const compiledFamily =
          await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1({
            trackerRequest,
            trackerReceipt: compiledTracker,
            templates,
            duplicatePreventionGenesisInputBoxIdHex:
              fixture.duplicatePrevention.boxId,
            pooledReserveGenesisInputBoxIdHex: fixture.pooledReserve.boxId,
          });
        await yieldToTestWorker();
        return [compiledTracker, compiledFamily] as const;
      },
    );
    const descriptorInput = {
      trackerRequest,
      trackerReceipt,
      familyTemplates: templates,
      familyReceipt,
    };
    targetDescriptor =
      deriveSubstrateFederatedGreenfieldTargetDescriptorV1(descriptorInput);
    rawArtifacts = buildRawArtifacts(fixture);
    sourceHistory = buildSubstrateFederatedGreenfieldSourceHistoryV1({
      target: targetDescriptor,
      genesisNativeBlockHashHex: '0a'.repeat(32),
      genesisExecutionBlockHashHex: '0b'.repeat(32),
      activationNativeBlockHeight: '24',
      activationNativeBlockHashHex: '0c'.repeat(32),
      activationExecutionBlockHashHex: '0d'.repeat(32),
      finalizedBlocksManifest: rawArtifacts[FILES.sourceFinalizedBlocksManifest]!,
      runtimeUpgradesManifest: rawArtifacts[FILES.sourceRuntimeUpgradesManifest]!,
      applicationDeploymentsManifest:
        rawArtifacts[FILES.sourceApplicationDeploymentsManifest]!,
    });
    ergoHistory = buildErgoHistory(
      rawArtifacts[FILES.ergoUtxoTransitionsManifest]!,
    );
    relayerClosure = buildSubstrateFederatedGreenfieldRelayerClosureV1({
      target: targetDescriptor,
      gitCommitSha1Hex: '0e'.repeat(20),
      sourceArchive: rawArtifacts[FILES.relayerSourceArchive]!,
      packageLock: rawArtifacts[FILES.relayerPackageLock]!,
      runtimeEntrypointsManifest:
        rawArtifacts[FILES.relayerRuntimeEntrypointsManifest]!,
      buildArtifact: rawArtifacts[FILES.relayerBuildArtifact]!,
    });
    statement = buildLaunchStatement(ergoHistory);
    signatures = signStatement(statement);
    const launchBaseline = buildSubstrateFederatedGreenfieldLaunchBaselineV1({
      statement,
      signatures,
    });
    generation = buildSubstrateFederatedGreenfieldGenerationV1({
      launchBaseline,
      ...descriptorInput,
    });
    const observed = await observeFixture(fixture);
    provisioningPlan =
      await buildSubstrateFederatedGreenfieldGenesisProvisioningV1({
        targetProfile: observed.targetProfile,
        observation: observed.observation,
        ...descriptorInput,
        generationManifest: generation,
      });
    testRoot = mkdtempSync(join(tmpdir(), 'e2s-greenfield-portable-'));
    bundleRoot = join(testRoot, 'base');
    writeBundle(bundleRoot, statement, signatures, rawArtifacts);
  }, 180_000);

  afterAll(() => {
    if (testRoot !== undefined) {
      rmSync(testRoot, { recursive: true, force: true });
    }
  });

  it('rebuilds the exact authenticated launch and provisioning identities in fresh processes', async () => {
    const first = runCli(requestPath(bundleRoot));
    await yieldToTestWorker();
    const second = runCli(requestPath(bundleRoot));
    await yieldToTestWorker();
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(first.stderr).toBe('');
    expect(second.stderr).toBe('');
    const firstReport = parseReport(first.stdout);
    const secondReport = parseReport(second.stdout);
    expect(firstReport).toEqual(secondReport);
    expect(first.stdout).toBe(`${canonicalJson(firstReport)}\n`);
    expect(first.stdout).not.toContain(testRoot);
    expect(first.stdout).not.toMatch(/[A-Za-z]:[\\/]/);
    expect(firstReport.launch).toMatchObject({
      targetDescriptorDigestHex: targetDescriptor.descriptorDigestHex,
      statementDigestHex: statement.statementDigestHex,
      attestationDigestHex: statement.attestationDigestHex,
      baselineDigestHex: generation.launchBaseline.baselineDigestHex,
      generationManifestDigestHex: generation.manifestDigestHex,
      activationGenerationIdHex: generation.generation.generationIdHex,
    });
    expect(firstReport.trustPins).toMatchObject({
      expectedTargetDescriptorDigestHex: targetDescriptor.descriptorDigestHex,
      expectedSourceAttestationKeySetDigestHex:
        targetDescriptor.federation.sourceAttestationKeySetDigestHex,
      pinSetDigestHex: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(firstReport.provisioning.tracker).toMatchObject({
      genesisInputBoxIdHex: provisioningPlan.lineages.tracker.genesisInputBoxIdHex,
      unsignedTransactionIdHex:
        provisioningPlan.lineages.tracker.issuanceTransactionIdHex,
      stateOutputBoxIdHex: provisioningPlan.lineages.tracker.stateOutputBoxIdHex,
    });
    expect(firstReport.provisioning.duplicatePrevention).toMatchObject({
      genesisInputBoxIdHex:
        provisioningPlan.lineages.duplicatePrevention.genesisInputBoxIdHex,
      unsignedTransactionIdHex:
        provisioningPlan.lineages.duplicatePrevention.issuanceTransactionIdHex,
      stateOutputBoxIdHex:
        provisioningPlan.lineages.duplicatePrevention.stateOutputBoxIdHex,
    });
    expect(firstReport.provisioning.pooledReserve).toMatchObject({
      genesisInputBoxIdHex:
        provisioningPlan.lineages.pooledReserve.genesisInputBoxIdHex,
      unsignedTransactionIdHex:
        provisioningPlan.lineages.pooledReserve.issuanceTransactionIdHex,
      stateOutputBoxIdHex:
        provisioningPlan.lineages.pooledReserve.stateOutputBoxIdHex,
    });
    expect(firstReport.checks).toEqual({
      exactRawArtifactsRehashed: true,
      exactPinnedJvmCompilerChainReplayed: true,
      externalStatementRebuiltExactly: true,
      exactSourceAttestationThresholdVerified: true,
      allPredecessorRoutesRebuilt: true,
      emptyReplayRootDerivedInternally: true,
      exactHistoricalGenesisBoxesReparsed: true,
      exactUnsignedProvisioningIdentitiesRebuilt: true,
      explicitTargetDescriptorPinMatched: true,
      explicitSourceAttestationKeySetPinMatched: true,
      deserializedBaselineAccepted: false,
      deserializedGenerationAccepted: false,
      currentUtxoViewAcceptedAsHistory: false,
    });
    expect(firstReport.execution).toEqual({
      explicitRequestBundleRead: true,
      operatorConfigurationFileRead: false,
      pinnedCompilerRuntimeMetadataRead: true,
      ambientEnvironmentAcceptedAsLaunchAuthority: false,
      networkAccessPerformed: false,
      runtimeDatabaseOpened: false,
      deploymentStateOpened: false,
      signerOrWalletMaterialRead: false,
      signedTransactionConstructed: false,
      reportContainsLocalPaths: false,
      freshProcessClaimedByReport: false,
    });
    expect(firstReport.boundaries).toEqual({
      sourceAttestationQuorumIsLaunchHistoryAuthority: true,
      sourceConsensusIndependentlyVerified: false,
      ergoConsensusIndependentlyVerified: false,
      currentGenesisInputsObservedUnspent: false,
      targetNodeAcceptanceEstablished: false,
      setupLineagesEstablished: false,
      profileActivated: false,
      signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false,
      callerSuppliedTrustPinsEstablishTargetApproval: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    });
  }, 180_000);

  it('rejects a valid self-signed packet when either explicit trust pin differs', async () => {
    for (const pins of [
      trustPins({ expectedTargetDescriptorDigestHex: 'aa'.repeat(32) }),
      trustPins({ expectedSourceAttestationKeySetDigestHex: 'bb'.repeat(32) }),
    ]) {
      const result = runCli(requestPath(bundleRoot), pins);
      await yieldToTestWorker();
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('portable greenfield replay failed\n');
    }
  });

  it('rejects one raw artifact drift under the original signed statement', async () => {
    const target = copyBundle('raw-drift');
    writeFileSync(
      join(target, FILES.relayerBuildArtifact),
      Buffer.from('relayer-build-artifact-drift', 'ascii'),
    );
    const result = runCli(requestPath(target));
    await yieldToTestWorker();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('portable greenfield replay failed\n');
    expect(result.stderr).not.toContain(target);
  }, 120_000);

  it('rejects a quorum-signed history containing an inconsistent genesis box body', async () => {
    const target = copyBundle('bad-genesis-box');
    const manifest = JSON.parse(
      rawArtifacts[FILES.ergoUtxoTransitionsManifest]!.toString('utf8'),
    ) as any;
    manifest.genesisInputs.tracker.value =
      (BigInt(manifest.genesisInputs.tracker.value) + 1n).toString();
    const changedManifest = Buffer.from(`${canonicalJson(manifest)}\n`, 'utf8');
    writeFileSync(join(target, FILES.ergoUtxoTransitionsManifest), changedManifest);
    const changedErgoHistory = buildErgoHistory(changedManifest);
    const changedStatement = buildLaunchStatement(changedErgoHistory);
    writeCanonical(join(target, FILES.attestationPacket), {
      schema: SUBSTRATE_FEDERATED_GREENFIELD_ATTESTATION_PACKET_V1_SCHEMA,
      version: 1,
      statement: changedStatement,
      signatures: signStatement(changedStatement),
    });
    const result = runCli(requestPath(target));
    await yieldToTestWorker();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('portable greenfield replay failed\n');
  }, 120_000);

  it('rejects unknown authority fields, duplicate JSON keys, traversal and sensitive paths before compilation', async () => {
    const request = portableRequest();
    const variants: Array<{ name: string; bytes: Buffer }> = [];
    variants.push({
      name: 'unknown-authority-field',
      bytes: canonicalBytes({ ...request, baseline: { accepted: true } }),
    });
    variants.push({
      name: 'traversal',
      bytes: canonicalBytes({
        ...request,
        files: { ...request.files, relayerBuildArtifact: '../outside.bin' },
      }),
    });
    variants.push({
      name: 'sensitive-path',
      bytes: canonicalBytes({
        ...request,
        files: { ...request.files, relayerBuildArtifact: 'artifacts/credentials.txt' },
      }),
    });
    const canonicalRequest = canonicalJson(request);
    variants.push({
      name: 'duplicate-key',
      bytes: Buffer.from(
        `{"schema":"${SUBSTRATE_FEDERATED_GREENFIELD_PORTABLE_REPLAY_REQUEST_V1_SCHEMA}",${canonicalRequest.slice(1)}\n`,
        'utf8',
      ),
    });
    for (const variant of variants) {
      const path = join(testRoot, `${variant.name}.json`);
      writeFileSync(path, variant.bytes);
      await expect(
        replaySubstrateFederatedGreenfieldPortableV1(path, trustPins()),
        variant.name,
      ).rejects.toThrow();
    }
  });

  it('rejects a canonical artifact path replaced by a symlink', async () => {
    const target = copyBundle('symlink-artifact');
    const artifact = join(target, FILES.relayerBuildArtifact);
    const retained = join(target, 'retained-build-artifact.bin');
    renameSync(artifact, retained);
    try {
      symlinkSync(retained, artifact, 'file');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      expect(['EPERM', 'EACCES', 'UNKNOWN']).toContain(code);
      return;
    }
    await expect(
      replaySubstrateFederatedGreenfieldPortableV1(
        requestPath(target),
        trustPins(),
      ),
    ).rejects.toThrow(/regular non-symlink file/i);
  });

  it('keeps network, persistence, operator configuration, signer and submitter ports out of the replay surface', () => {
    const sources = [
      readFileSync(new URL(
        './substrate-federated-greenfield-portable-replay-v1.ts',
        import.meta.url,
      ), 'utf8'),
      readFileSync(new URL(
        './scripts/replay-substrate-federated-greenfield-launch-v1.ts',
        import.meta.url,
      ), 'utf8'),
    ];
    for (const source of sources) {
      expect(source).not.toMatch(/node:http|node:https|axios|\bfetch\s*\(/);
      expect(source).not.toMatch(/process\.env|dotenv/);
      expect(source).not.toMatch(/(?:ergo|sidechain)-client|state-tracker|database/);
      expect(source).not.toMatch(/fleet-signer|submitter|broadcaster|profile-registry/);
    }
  });
});

function buildRawArtifacts(target: GenesisFixture): Readonly<Record<string, Buffer>> {
  return Object.freeze({
    [FILES.sourceFinalizedBlocksManifest]: bytes('source-finalized-blocks'),
    [FILES.sourceRuntimeUpgradesManifest]: bytes('source-runtime-upgrades'),
    [FILES.sourceApplicationDeploymentsManifest]:
      bytes('source-application-deployments'),
    [FILES.ergoGreatestWorkHeadersManifest]: bytes('ergo-greatest-work-headers'),
    [FILES.ergoTransactionsManifest]: bytes('ergo-transactions'),
    [FILES.ergoUtxoTransitionsManifest]: canonicalBytes({
      schema: SUBSTRATE_FEDERATED_GREENFIELD_ERGO_UTXO_HISTORY_V1_SCHEMA,
      version: 1,
      genesisInputs: {
        tracker: target.tracker,
        duplicatePrevention: target.duplicatePrevention,
        pooledReserve: target.pooledReserve,
      },
    }),
    [FILES.relayerSourceArchive]: bytes('relayer-source-archive'),
    [FILES.relayerPackageLock]: bytes('relayer-package-lock'),
    [FILES.relayerRuntimeEntrypointsManifest]: bytes('relayer-runtime-entrypoints'),
    [FILES.relayerBuildArtifact]: bytes('relayer-build-artifact'),
  });
}

function buildErgoHistory(utxoTransitionsManifest: Buffer) {
  return buildSubstrateFederatedGreenfieldErgoHistoryV1({
    target: targetDescriptor,
    genesisHeaderIdHex: GENESIS_HEADER_ID,
    genesisHeight: 1,
    setupAnchorHeaderIdHex: SETUP_ANCHOR_HEADER_ID,
    setupAnchorHeight: 120,
    greatestWorkHeadersManifest:
      rawArtifacts[FILES.ergoGreatestWorkHeadersManifest]!,
    transactionsManifest: rawArtifacts[FILES.ergoTransactionsManifest]!,
    utxoTransitionsManifest,
  });
}

function buildLaunchStatement(
  exactErgoHistory: typeof ergoHistory,
): Readonly<SubstrateFederatedGreenfieldLaunchStatementV1> {
  return buildSubstrateFederatedGreenfieldLaunchStatementV1({
    activationGenerationIdHex: '0f'.repeat(32),
    target: targetDescriptor,
    sourceHistory,
    ergoHistory: exactErgoHistory,
    relayerClosure,
  });
}

function signStatement(
  exactStatement: Readonly<SubstrateFederatedGreenfieldLaunchStatementV1>,
): readonly Readonly<SubstrateFederatedGreenfieldLaunchSignatureV1>[] {
  return sourceSigners.slice(0, 2).map(signer => ({
    signerPublicKeyHex: signer.publicKeyHex,
    signatureHex: sign(
      null,
      Buffer.from(exactStatement.attestationDigestHex, 'hex'),
      signer.privateKey,
    ).toString('hex'),
  }));
}

function writeBundle(
  root: string,
  exactStatement: Readonly<SubstrateFederatedGreenfieldLaunchStatementV1>,
  exactSignatures: readonly Readonly<SubstrateFederatedGreenfieldLaunchSignatureV1>[],
  artifacts: Readonly<Record<string, Buffer>>,
): void {
  for (const path of Object.values(FILES)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
  }
  for (const path of Object.values(FILES).slice(0, 4)) {
    writeFileSync(join(root, path), contractTemplate(path).source, 'utf8');
  }
  for (const [path, content] of Object.entries(artifacts)) {
    writeFileSync(join(root, path), content);
  }
  writeCanonical(join(root, FILES.attestationPacket), {
    schema: SUBSTRATE_FEDERATED_GREENFIELD_ATTESTATION_PACKET_V1_SCHEMA,
    version: 1,
    statement: exactStatement,
    signatures: exactSignatures,
  });
  writeCanonical(requestPath(root), portableRequest());
}

function portableRequest() {
  return {
    schema: SUBSTRATE_FEDERATED_GREENFIELD_PORTABLE_REPLAY_REQUEST_V1_SCHEMA,
    version: 1,
    files: FILES,
  };
}

function requestPath(root: string): string {
  return join(root, 'request.json');
}

function copyBundle(name: string): string {
  const target = join(testRoot, name);
  cpSync(bundleRoot, target, { recursive: true });
  return target;
}

function writeCanonical(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, canonicalBytes(value));
}

function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
}

function runCli(
  path: string,
  pins = trustPins(),
) {
  return spawnSync(process.execPath, [
    'node_modules/tsx/dist/cli.mjs',
    SCRIPT,
    '--request',
    path,
    '--expected-target-descriptor-digest',
    pins.expectedTargetDescriptorDigestHex,
    '--expected-source-attestation-key-set-digest',
    pins.expectedSourceAttestationKeySetDigestHex,
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: portableChildEnvironment(),
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function trustPins(overrides: Partial<{
  expectedTargetDescriptorDigestHex: string;
  expectedSourceAttestationKeySetDigestHex: string;
}> = {}) {
  return {
    expectedTargetDescriptorDigestHex:
      overrides.expectedTargetDescriptorDigestHex
      ?? targetDescriptor.descriptorDigestHex,
    expectedSourceAttestationKeySetDigestHex:
      overrides.expectedSourceAttestationKeySetDigestHex
      ?? targetDescriptor.federation.sourceAttestationKeySetDigestHex,
  };
}

function portableChildEnvironment(): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of [
    'Path',
    'PATH',
    'JAVA_HOME',
    'SystemRoot',
    'SYSTEMROOT',
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

function parseReport(stdout: string): SubstrateFederatedGreenfieldPortableReplayReportV1 {
  return JSON.parse(stdout) as SubstrateFederatedGreenfieldPortableReplayReportV1;
}

async function withoutNodeOptions<T>(operation: () => Promise<T>): Promise<T> {
  const previous = process.env.NODE_OPTIONS;
  delete process.env.NODE_OPTIONS;
  try {
    return await operation();
  } finally {
    if (previous === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = previous;
  }
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

function bytes(value: string): Buffer {
  return Buffer.from(value, 'ascii');
}

function familyTemplates(): CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV1Input[
  'templates'
] {
  return {
    duplicatePrevention: contractTemplate(FILES.duplicatePreventionTemplate),
    sourceLock: contractTemplate(FILES.sourceLockTemplate),
    pooledReserve: contractTemplate(FILES.pooledReserveTemplate),
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
  }, 'federated portable greenfield genesis fixture');
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

async function observeFixture(target: GenesisFixture) {
  const primary = nodeServer(target);
  const witness = nodeServer(target);
  const [primaryOrigin, witnessOrigin] = await Promise.all([
    listen(primary),
    listen(witness),
  ]);
  try {
    const targetProfile = buildSubstrateFederatedGenesisTargetProfileV1({
      profileIdHex: '10'.repeat(32),
      environment: 'testnet',
      expectedNetwork: 'testnet',
      expectedGenesisHeaderIdHex: GENESIS_HEADER_ID,
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

function nodeServer(target: GenesisFixture): Server {
  const boxes = new Map([
    [target.tracker.boxId, target.tracker],
    [target.duplicatePrevention.boxId, target.duplicatePrevention],
    [target.pooledReserve.boxId, target.pooledReserve],
  ]);
  return createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (path === '/info') {
      return sendJson(response, 200, { network: 'testnet', fullHeight: 120 });
    }
    if (path === '/blocks/lastHeaders/1') {
      return sendJson(response, 200, [{ id: SETUP_ANCHOR_HEADER_ID, height: 120 }]);
    }
    if (path === '/blocks/at/1') {
      return sendJson(response, 200, [GENESIS_HEADER_ID]);
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

function sendJson(response: ServerResponse, status: number, value: unknown): void {
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
