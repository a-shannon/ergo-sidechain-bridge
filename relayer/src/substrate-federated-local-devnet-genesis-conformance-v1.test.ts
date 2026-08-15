import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const rootCheckMock = vi.hoisted(() => ({
  prepare: vi.fn(),
  check: vi.fn(),
}));

vi.mock('./fleet-signer.js', () => ({
  prepareLocalWasmRootCheckCandidates: rootCheckMock.prepare,
  checkSignedTransaction: rootCheckMock.check,
}));

import {
  buildSubstrateFederatedCheckpointProfileV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  buildSubstrateFederatedGenesisTargetProfileV1,
  observeSubstrateFederatedGenesisV1,
  type SubstrateFederatedGenesisObservationV1,
  type SubstrateFederatedGenesisTargetProfileV1,
} from './substrate-federated-genesis-observation-v1.js';
import {
  buildSubstrateFederatedLocalDevnetGenesisConformanceV1,
  runSubstrateFederatedLocalDevnetGenesisCheckV1,
  type BuildSubstrateFederatedLocalDevnetGenesisConformanceV1Input,
  type SubstrateFederatedLocalDevnetGenesisConformanceV1Plan,
} from './substrate-federated-local-devnet-genesis-conformance-v1.js';
import {
  deriveDevnetRewardErgoTreeHexForDelay,
} from './relayer-core/devnet-reward-consolidation.js';
import type {
  SubstrateFederatedSettlementFamilyV1Template,
} from './substrate-federated-settlement-family-v1.js';
import {
  compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1,
} from './substrate-federated-settlement-family-jvm-compiler-v1.js';
import {
  buildSubstrateFederatedTrackerCompilerRequestV1,
} from './substrate-federated-tracker-compiler-v1.js';
import {
  compileSubstrateFederatedTrackerWithPinnedJvmV1,
} from './substrate-federated-tracker-jvm-compiler-v1.js';
import {
  normalizeEip12Box,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

const GENESIS_HEADER_ID =
  '6c152022e41a106225e25061b5acfc96967a02f41117754132a47330e9f8ad01';
const TIP_HEADER_ID = '02'.repeat(32);
const ROOT_PUBLIC_KEY =
  '02029f90252749989d63abfa557c5c7e2a304143ccb9330df62d3b38b321923398';
const GENESIS_BOX_SIGMA_HEX = [
  '8086c1bafb011002040208cd02029f90252749989d63abfa557c5c7e2a304143ccb9330df62d3b38b321923398ea02d192a39a8cc7a701730073010200006213c74a842ad4a0f9f47d21cd8374e94ddf56fb8bf889a194a841bd77a0229b01',
  '8086c1bafb011002040208cd02029f90252749989d63abfa557c5c7e2a304143ccb9330df62d3b38b321923398ea02d192a39a8cc7a701730073010300009b501a21a71e481b7d3560e957d16dd38384dce3a227abdc94ad82ca326a57d401',
  '8086c1bafb011002040208cd02029f90252749989d63abfa557c5c7e2a304143ccb9330df62d3b38b321923398ea02d192a39a8cc7a70173007301040000f5bb266ee8522b43b35ed49bc6a15942d5bf25d7bc15068f2edd64424dda952401',
] as const;

const trackerTemplate = readFileSync(new URL(
  '../../contracts/SPVTrackerSubstrateFederatedV1.es',
  import.meta.url,
), 'utf8');
const vector = JSON.parse(readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-tracker-admission.json',
  import.meta.url,
), 'utf8')) as any;

interface Fixture {
  readonly tracker: Eip12Box;
  readonly duplicatePrevention: Eip12Box;
  readonly pooledReserve: Eip12Box;
  readonly sigmaByBoxId: ReadonlyMap<string, string>;
}

let fixture: Fixture;
let profile: Readonly<SubstrateFederatedGenesisTargetProfileV1>;
let observation: Readonly<SubstrateFederatedGenesisObservationV1>;
let input: BuildSubstrateFederatedLocalDevnetGenesisConformanceV1Input;
let plan: Readonly<SubstrateFederatedLocalDevnetGenesisConformanceV1Plan>;
let primary: Server;
let witness: Server;

describe('Substrate federated local devnet genesis conformance V1', () => {
  beforeEach(() => {
    rootCheckMock.prepare.mockReset();
    rootCheckMock.prepare.mockImplementation(async (request: any) => ({
      derivation: 'wasm-root',
      pubKeyHex: ROOT_PUBLIC_KEY,
      ergoTreeHex: `0008cd${ROOT_PUBLIC_KEY}`,
      stateContextTipHeight: 121,
      stateContextTipIdHex: '03'.repeat(32),
      candidates: request.candidates.map((candidate: any, index: number) => ({
        role: candidate.role,
        expectedTxId: candidate.expectedTxId,
        signedCandidate: Object.freeze({
          profile: 'local-wasm-signed-check-candidate-v1',
          txId: candidate.expectedTxId,
          signedTransactionDigestHex: `${index + 1}`.padStart(64, '0'),
          nodeOrigin: request.nodeOrigin,
          signerContext: Object.freeze({
            profile: 'local-wasm-check-signer-v1',
            pubKeyHex: ROOT_PUBLIC_KEY,
            ergoTreeHex: `0008cd${ROOT_PUBLIC_KEY}`,
            networkPrefix: 16,
            stateContextTipHeight: 121,
            stateContextTipIdHex: '03'.repeat(32),
          }),
        }),
      })),
    }));
    rootCheckMock.check.mockReset();
    rootCheckMock.check.mockImplementation(async (
      candidate: any,
      _label: string,
      nodeOrigin: string,
    ) => ({
      txId: candidate.txId,
      checkResult: candidate.txId,
      signedTransactionDigestHex: candidate.signedTransactionDigestHex,
      signerContext: candidate.signerContext,
      checkerIdentity: {
        profile: 'ergo-node-checker-v1',
        sourceAdapterProfile: 'ergo-node-check-source-adapter-v1',
        nodeOrigin,
        path: '/transactions/check',
        method: 'POST',
        transportPolicy: 'no-redirect-no-proxy',
      },
    }));
  });

  beforeAll(async () => {
    fixture = await genesisFixture();
    primary = nodeServer(fixture);
    witness = nodeServer(fixture);
    const [primaryOrigin, witnessOrigin] = await Promise.all([
      listen(primary),
      listen(witness),
    ]);
    profile = buildSubstrateFederatedGenesisTargetProfileV1({
      profileIdHex: hash('local-devnet-profile'),
      environment: 'patched-devnet',
      expectedNetwork: 'devnet',
      expectedGenesisHeaderIdHex: GENESIS_HEADER_ID,
      primaryNodeOrigin: primaryOrigin,
      primaryNodeIdentityDigestHex: hash('primary-node'),
      primaryAdministrationIdentityDigestHex: hash('primary-admin'),
      witnessNodeOrigin: witnessOrigin,
      witnessNodeIdentityDigestHex: hash('witness-node'),
      witnessAdministrationIdentityDigestHex: hash('witness-admin'),
      trackerGenesisBoxIdHex: fixture.tracker.boxId,
      duplicatePreventionGenesisBoxIdHex: fixture.duplicatePrevention.boxId,
      pooledReserveGenesisBoxIdHex: fixture.pooledReserve.boxId,
    });
    observation = await observeSubstrateFederatedGenesisV1(profile, {
      now: () => new Date('2026-08-12T18:00:00.000Z'),
    });

    input = await buildConformanceInput(fixture, profile, observation, 1);
    plan = await buildSubstrateFederatedLocalDevnetGenesisConformanceV1(input);
  }, 120_000);

  afterAll(async () => {
    await Promise.all([close(primary), close(witness)]);
  });

  it('materializes three empty-history devnet candidates without FED authority', () => {
    expect(plan.status).toBe('local_devnet_unsigned_non_authorizing_candidate');
    expect(plan.target).toMatchObject({
      environment: 'patched-devnet',
      network: 'devnet',
      genesisHeaderIdHex: GENESIS_HEADER_ID,
      rewardDelay: 1,
    });
    expect(plan.replay).toMatchObject({
      fixturePolicy: 'fresh-isolated-devnet-empty-history',
      canonicalBurnIdCount: 0,
    });
    expect(Object.values(plan.transactions)).toHaveLength(3);
    expect(Object.values(plan.boxes).map(box => box.assets[0]?.tokenId)).toEqual([
      fixture.tracker.boxId,
      fixture.duplicatePrevention.boxId,
      fixture.pooledReserve.boxId,
    ]);
    expect(Object.values(plan.boundaries).every(value => value === false)).toBe(true);
  });

  it('reobserves, derives, root-signs and checks all three candidates without submit', async () => {
    const report = await runSubstrateFederatedLocalDevnetGenesisCheckV1(
      plan,
      { mnemonic: 'synthetic in-memory test input' },
    );

    expect(report.status).toBe('PASS');
    expect(report.checks).toHaveLength(3);
    expect(report.checks.every(check => check.status === 'PASS')).toBe(true);
    expect(report.rewardDelay).toBe(plan.target.rewardDelay);
    expect(rootCheckMock.prepare).toHaveBeenCalledTimes(1);
    expect(rootCheckMock.check).toHaveBeenCalledTimes(3);
    expect(report.checks.every(check =>
      /^[0-9a-f]{64}$/.test(
        check.signedTransactionCanonicalJsonSha256Hex,
      ))).toBe(true);
    expect(report.postCheckObservation).toMatchObject({
      exactGenesisInputsStillUnspent: true,
      tipDidNotRegress: true,
    });
    expect(report.boundaries).toMatchObject({
      nodeCheckPerformed: true,
      publicTestnetFed6Closed: false,
      registrationCandidateProduced: false,
      singletonLineagesEstablished: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      gate5Closed: false,
    });
    expect(JSON.stringify(report))
      .not.toMatch(/mnemonic|privateKey|"signedTx"|"proofs"/i);
  });

  it('rejects a signer that does not control the observed reward inputs', async () => {
    rootCheckMock.prepare.mockImplementationOnce(async () => ({
      derivation: 'wasm-root',
      pubKeyHex: `03${'55'.repeat(32)}`,
      ergoTreeHex: `0008cd03${'55'.repeat(32)}`,
      stateContextTipHeight: 121,
      stateContextTipIdHex: '03'.repeat(32),
      candidates: [],
    }));
    await expect(runSubstrateFederatedLocalDevnetGenesisCheckV1(
      plan,
      { mnemonic: 'synthetic wrong in-memory test input' },
    )).rejects.toThrow(/not controlled by the root signer/);
    expect(rootCheckMock.check).not.toHaveBeenCalled();
  });

  it('rejects delay-1 reward inputs when the target reward delay is 720', async () => {
    const standardPlan = await buildSubstrateFederatedLocalDevnetGenesisConformanceV1({
      ...input,
      rewardDelay: 720,
    });
    await expect(runSubstrateFederatedLocalDevnetGenesisCheckV1(
      standardPlan,
      { mnemonic: 'synthetic standard-policy mismatch input' },
    )).rejects.toThrow(/not controlled by the root signer/);
    expect(rootCheckMock.check).not.toHaveBeenCalled();
  });

  it('accepts exact standard-delay inputs and rejects the reciprocal delay mismatch', async () => {
    const standardFixture = await generatedRewardFixture(720);
    const standardPrimary = nodeServer(standardFixture);
    const standardWitness = nodeServer(standardFixture);
    try {
      const [primaryOrigin, witnessOrigin] = await Promise.all([
        listen(standardPrimary),
        listen(standardWitness),
      ]);
      const standardProfile = buildSubstrateFederatedGenesisTargetProfileV1({
        profileIdHex: hash('local-devnet-standard-delay-profile'),
        environment: 'patched-devnet',
        expectedNetwork: 'devnet',
        expectedGenesisHeaderIdHex: GENESIS_HEADER_ID,
        primaryNodeOrigin: primaryOrigin,
        primaryNodeIdentityDigestHex: hash('standard-primary-node'),
        primaryAdministrationIdentityDigestHex: hash('standard-primary-admin'),
        witnessNodeOrigin: witnessOrigin,
        witnessNodeIdentityDigestHex: hash('standard-witness-node'),
        witnessAdministrationIdentityDigestHex: hash('standard-witness-admin'),
        trackerGenesisBoxIdHex: standardFixture.tracker.boxId,
        duplicatePreventionGenesisBoxIdHex:
          standardFixture.duplicatePrevention.boxId,
        pooledReserveGenesisBoxIdHex: standardFixture.pooledReserve.boxId,
      });
      const standardObservation = await observeSubstrateFederatedGenesisV1(
        standardProfile,
        { now: () => new Date('2026-08-12T19:00:00.000Z') },
      );
      const standardInput = await buildConformanceInput(
        standardFixture,
        standardProfile,
        standardObservation,
        720,
      );
      const standardPlan =
        await buildSubstrateFederatedLocalDevnetGenesisConformanceV1(
          standardInput,
        );
      const report = await runSubstrateFederatedLocalDevnetGenesisCheckV1(
        standardPlan,
        { mnemonic: 'synthetic standard-delay test input' },
      );

      expect(standardPlan.target.rewardDelay).toBe(720);
      expect(standardPlan.planDigestHex).not.toBe(plan.planDigestHex);
      expect(report).toMatchObject({
        status: 'PASS',
        rewardDelay: 720,
        boundaries: {
          submissionPerformed: false,
          broadcastPerformed: false,
        },
      });
      const fastOnStandardPlan =
        await buildSubstrateFederatedLocalDevnetGenesisConformanceV1({
          ...standardInput,
          rewardDelay: 1,
        });
      await expect(runSubstrateFederatedLocalDevnetGenesisCheckV1(
        fastOnStandardPlan,
        { mnemonic: 'synthetic reciprocal-delay mismatch input' },
      )).rejects.toThrow(/not controlled by the root signer/);
      expect(rootCheckMock.check).toHaveBeenCalledTimes(3);
    } finally {
      await Promise.all([
        close(standardPrimary),
        close(standardWitness),
      ]);
    }
  }, 120_000);

  it('rejects malformed signer and checker receipt identities', async () => {
    rootCheckMock.prepare.mockImplementationOnce(async (request: any) => ({
      derivation: 'wasm-root',
      pubKeyHex: ROOT_PUBLIC_KEY,
      ergoTreeHex: `0008cd${ROOT_PUBLIC_KEY}`,
      stateContextTipHeight: 121,
      stateContextTipIdHex: 'not-a-header-id',
      candidates: request.candidates.map((candidate: any) => ({
        role: candidate.role,
        expectedTxId: candidate.expectedTxId,
        signedCandidate: {
          txId: candidate.expectedTxId,
          signedTransactionDigestHex: '11'.repeat(32),
        },
      })),
    }));
    await expect(runSubstrateFederatedLocalDevnetGenesisCheckV1(
      plan,
      { mnemonic: 'synthetic malformed receipt input' },
    )).rejects.toThrow(/state-context tip ID/);
  });

  it('rejects copied plans and remains outside registration consumers', async () => {
    await expect(runSubstrateFederatedLocalDevnetGenesisCheckV1(
      structuredClone(plan),
      { mnemonic: 'synthetic copied-plan test input' },
    )).rejects.toThrow(/same-process provenance/);

    const registration = readFileSync(new URL(
      './substrate-federated-inactive-registration-candidate-v1.ts',
      import.meta.url,
    ), 'utf8');
    const registry = readFileSync(new URL(
      './reviewed-native-checkpoint-settlement-profiles.ts',
      import.meta.url,
    ), 'utf8');
    expect(registration).not.toContain('local-devnet-genesis-conformance');
    expect(registry).not.toContain('local-devnet-genesis-conformance');
  });

  it('wires only loopback observation, opaque root signing and no-submit checks', () => {
    const script = readFileSync(new URL(
      './scripts/check-substrate-federated-local-devnet-genesis.ts',
      import.meta.url,
    ), 'utf8');
    const conformance = readFileSync(new URL(
      './substrate-federated-local-devnet-genesis-conformance-v1.ts',
      import.meta.url,
    ), 'utf8');
    const packageJson = JSON.parse(readFileSync(new URL(
      '../package.json',
      import.meta.url,
    ), 'utf8')) as { scripts: Record<string, string> };
    const secretRemoval = script.indexOf(
      'delete process.env[args.mnemonicEnvironmentVariable]',
    );
    const firstJvmCompile = script.indexOf(
      'await compileSubstrateFederatedTrackerWithPinnedJvmV1',
    );

    expect(script).toContain("const PRIMARY_ORIGIN = 'http://127.0.0.1:9051'");
    expect(script).toContain("const WITNESS_ORIGIN = 'http://127.0.0.1:9052'");
    expect(script).toContain("'--reward-delay'");
    expect(secretRemoval).toBeGreaterThan(-1);
    expect(secretRemoval).toBeLessThan(firstJvmCompile);
    expect(conformance).toContain('prepareLocalWasmRootCheckCandidates');
    expect(conformance).toContain('checkSignedTransaction(');
    expect(`${script}\n${conformance}`)
      .not.toMatch(/\bnpost(?:Direct)?\b|submitTransaction|broadcastTransaction/);
    expect(packageJson.scripts['federated:local-devnet:genesis-check'])
      .toBe('tsx src/scripts/check-substrate-federated-local-devnet-genesis.ts');
  });
});

async function genesisFixture(): Promise<Fixture> {
  const imported = await import('ergo-lib-wasm-nodejs');
  const wasm = imported.default ?? imported;
  const boxes = await Promise.all(GENESIS_BOX_SIGMA_HEX.map(async (sigmaHex, index) => {
    const parsed = wasm.ErgoBox.sigma_parse_bytes(Buffer.from(sigmaHex, 'hex'));
    try {
      return normalizeEip12Box(
        parsed.to_js_eip12(),
        `local devnet canonical genesis box ${index}`,
      );
    } finally {
      parsed.free?.();
    }
  }));
  const [tracker, duplicatePrevention, pooledReserve] = boxes;
  const sigmaByBoxId = new Map<string, string>();
  for (const [index, box] of boxes.entries()) {
    sigmaByBoxId.set(box.boxId, GENESIS_BOX_SIGMA_HEX[index]!);
  }
  return { tracker, duplicatePrevention, pooledReserve, sigmaByBoxId };
}

async function generatedRewardFixture(
  rewardDelay: 1 | 720,
): Promise<Fixture> {
  const imported = await import('ergo-lib-wasm-nodejs');
  const wasm = imported.default ?? imported;
  const rewardTree = deriveDevnetRewardErgoTreeHexForDelay(
    ROOT_PUBLIC_KEY,
    rewardDelay,
  );
  const boxes: Eip12Box[] = [];
  const sigmaByBoxId = new Map<string, string>();
  for (let index = 0; index < 3; index += 1) {
    const value = wasm.BoxValue.from_i64(wasm.I64.from_str('67500000000'));
    const tree = wasm.ErgoTree.from_base16_bytes(rewardTree);
    const contract = wasm.Contract.new(tree);
    const builder = new wasm.ErgoBoxCandidateBuilder(
      value,
      contract,
      index + 2,
    );
    try {
      const candidate = builder.build();
      const transactionId = wasm.TxId.from_str(`${index + 1}`.repeat(64));
      const box = wasm.ErgoBox.from_box_candidate(candidate, transactionId, 0);
      try {
        const normalized = await normalizeEip12Box(
          box.to_js_eip12(),
          `generated reward box ${index}`,
        );
        boxes.push(normalized);
        sigmaByBoxId.set(
          normalized.boxId,
          Buffer.from(box.sigma_serialize_bytes()).toString('hex'),
        );
      } finally {
        box.free?.();
        transactionId.free?.();
        candidate.free?.();
      }
    } finally {
      builder.free?.();
    }
  }
  return {
    tracker: boxes[0]!,
    duplicatePrevention: boxes[1]!,
    pooledReserve: boxes[2]!,
    sigmaByBoxId,
  };
}

function buildTrackerRequest(trackerGenesisInputBoxIdHex: string) {
  const statement = vector.input.statement;
  return buildSubstrateFederatedTrackerCompilerRequestV1({
    template: {
      relativePath: 'contracts/SPVTrackerSubstrateFederatedV1.es',
      source: trackerTemplate,
    },
    trackerGenesisInputBoxIdHex,
    profile: buildSubstrateFederatedCheckpointProfileV1(vector.input.profile),
    application: {
      sourceNetworkIdHex: statement.sourceNetworkIdHex,
      sidechainIdHex: statement.sidechainIdHex,
      bridgeAddressHex: statement.bridgeAddressHex,
      tokenAddressHex: statement.tokenAddressHex,
      bridgeRuntimeCodeSha256Hex: statement.bridgeRuntimeCodeSha256Hex,
      bridgeRuntimeCodeBytes: statement.bridgeRuntimeCodeBytes,
      tokenRuntimeCodeSha256Hex: statement.tokenRuntimeCodeSha256Hex,
      tokenRuntimeCodeBytes: statement.tokenRuntimeCodeBytes,
      sourceRuntimeCodeSha256Hex: statement.sourceRuntimeCodeSha256Hex,
      sourceRuntimeCodeBytes: statement.sourceRuntimeCodeBytes,
      runtimeProfileIdHex: statement.runtimeProfileIdHex,
      settlementProfileIdHex: statement.settlementProfileIdHex,
    },
  });
}

async function buildConformanceInput(
  source: Fixture,
  targetProfile: Readonly<SubstrateFederatedGenesisTargetProfileV1>,
  targetObservation: Readonly<SubstrateFederatedGenesisObservationV1>,
  rewardDelay: 1 | 720,
): Promise<BuildSubstrateFederatedLocalDevnetGenesisConformanceV1Input> {
  const trackerRequest = buildTrackerRequest(source.tracker.boxId);
  const parentNodeOptions = process.env.NODE_OPTIONS;
  delete process.env.NODE_OPTIONS;
  try {
    const trackerReceipt =
      await compileSubstrateFederatedTrackerWithPinnedJvmV1(trackerRequest);
    const templates = familyTemplates();
    const familyReceipt =
      await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1({
        trackerRequest,
        trackerReceipt,
        templates,
        duplicatePreventionGenesisInputBoxIdHex:
          source.duplicatePrevention.boxId,
        pooledReserveGenesisInputBoxIdHex: source.pooledReserve.boxId,
      });
    return {
      rewardDelay,
      targetProfile,
      observation: targetObservation,
      trackerRequest,
      trackerReceipt,
      familyTemplates: templates,
      familyReceipt,
    };
  } finally {
    if (parentNodeOptions === undefined) {
      delete process.env.NODE_OPTIONS;
    } else {
      process.env.NODE_OPTIONS = parentNodeOptions;
    }
  }
}

function familyTemplates() {
  return {
    duplicatePrevention: template(
      'contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
    ),
    sourceLock: template('contracts/MainChainLockPooledReserveV6.es'),
    pooledReserve: template(
      'contracts/MainChainPooledReserveValidityApplicationV6.es',
    ),
  };
}

function template(relativePath: string): SubstrateFederatedSettlementFamilyV1Template {
  return {
    relativePath,
    source: readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8'),
  };
}

function nodeServer(source: Fixture): Server {
  const boxes = new Map([
    [source.tracker.boxId, source.tracker],
    [source.duplicatePrevention.boxId, source.duplicatePrevention],
    [source.pooledReserve.boxId, source.pooledReserve],
  ]);
  return createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (path === '/info') return sendJson(response, 200, { network: 'devnet', fullHeight: 120 });
    if (path === '/blocks/lastHeaders/1') {
      return sendJson(response, 200, [{ id: TIP_HEADER_ID, height: 120 }]);
    }
    if (path === '/blocks/lastHeaders/10') {
      return sendJson(response, 200, [{ id: '03'.repeat(32), height: 121 }]);
    }
    if (path === '/blocks/at/1') return sendJson(response, 200, [GENESIS_HEADER_ID]);
    const binary = path.match(/^\/utxo\/byIdBinary\/([0-9a-f]{64})$/);
    if (binary) {
      const bytes = source.sigmaByBoxId.get(binary[1]!);
      return sendJson(response, bytes === undefined ? 404 : 200, { bytes });
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

async function close(server: Server | undefined): Promise<void> {
  if (server === undefined) return;
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
