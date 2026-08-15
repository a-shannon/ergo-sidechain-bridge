import { createHash } from 'crypto';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

import { describe, expect, it } from 'vitest';

import {
  deriveAuthenticatedV2InitialBinding,
  deriveAuthenticatedV2InitialBindingFromFundingObservation,
  validateAuthenticatedV2InitialBindingReport,
  type AuthenticatedV2InitialBindingCompiler,
  type AuthenticatedV2InitialBindingCompilerIdentity,
} from './authenticated-v2-initial-binding.js';
import type { AuthenticatedV2ContractTemplates } from './authenticated-v2-canonical-contracts.js';
import { loadCanonicalAuthenticatedV2ContractTemplates } from './authenticated-v2-canonical-contracts.js';
import type { ResolvedAuthenticatedV2ContractSources } from './authenticated-v2-contract-sources.js';
import {
  AUTHENTICATED_V2_FUNDING_OBSERVATION_SCHEMA,
  initialBindingRequestFromFundingObservation,
  observeAuthenticatedV2Funding,
  type AuthenticatedV2FundingObservationFetch,
} from './authenticated-v2-funding-observation.js';
import {
  parseAuthenticatedV2FundingObservationArgs,
  runAuthenticatedV2FundingObservationCli,
} from './scripts/observe-authenticated-v2-funding.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';
import {
  AUTHENTICATED_V2_PROVISIONING_INPUT_SCHEMA,
  hydrateAuthenticatedV2ProvisioningInput,
} from './scripts/plan-authenticated-v2-provisioning.js';

const COMMITTEE_PUBKEY =
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const FINALITY_ATTESTOR_PUBKEY =
  '02671c8e95c0237797901a6cdb2ef8e6599400578385455f3423f77e43df39aad5';
const FUNDING_TREE = `0008cd02${COMMITTEE_PUBKEY.slice(2)}`;
const BASE_INPUT: Eip12Box = {
  boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5',
  value: '300000000',
  ergoTree: `0008cd02${'22'.repeat(32)}`,
  assets: [],
  additionalRegisters: {},
  creationHeight: 110,
  transactionId: '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab',
  index: 0,
};
const TIP_ID = 'aa'.repeat(32);
const OBSERVED_AT = '2026-07-12T12:00:00.000Z';
const BINDING_SOURCES = {
  tracker: '{ sigmaProp(true) }',
  unlock: '{ val tracker = fromBase16("TRACKER_NFT_ID_PLACEHOLDER"); val dup = fromBase16("DUP_NFT_ID_PLACEHOLDER"); sigmaProp(tracker != dup) }',
  duplicatePrevention: '{ val tracker = fromBase16("TRACKER_NFT_ID_PLACEHOLDER"); val unlock = fromBase16("AUTHENTICATED_UNLOCK_HASH_PLACEHOLDER"); sigmaProp(tracker != unlock) }',
} as const;
const BINDING_COMPILER_IDENTITY: AuthenticatedV2InitialBindingCompilerIdentity = {
  execution: 'pinned-resolver-free-jvm',
  compilerLockDigestHex: '0b'.repeat(32),
  sourceBaselineDigestHex: '0c'.repeat(32),
  platform: 'win32-x64',
  nodeVersion: '24.14.0',
  nodeExecutableSha256: '01'.repeat(32),
  gitVersion: '2.54.0.windows.1',
  gitExecutableSha256: '02'.repeat(32),
  relayerPackageLockSha256: '03'.repeat(32),
  ergoNodeBaseCommit: '04'.repeat(20),
  consensusSourceLockSha256: '05'.repeat(32),
  ergoPatchSha256: '06'.repeat(32),
  sigmaStateVersion: '6.0.2',
  sigmaStateArtifactSha256: '07'.repeat(32),
  runtimeBundleSha256: '08'.repeat(32),
  runtimeClasspathSha256: '09'.repeat(32),
  javaHomeSha256: '0a'.repeat(32),
  networkPrefix: 16,
  scriptVersion: 3,
  treeVersion: 0,
};

interface Fixture {
  tracker: Eip12Box;
  dupVault: Eip12Box;
  trackerBytes: string;
  dupVaultBytes: string;
}

async function fundingFixture(options: {
  trackerAssets?: Eip12Box['assets'];
  creationHeight?: number;
} = {}): Promise<Fixture> {
  const materialized = await materializeUnsignedTransaction({
    inputs: [{ ...BASE_INPUT, extension: {} }],
    dataInputs: [],
    outputs: [
      {
        value: '100000000',
        ergoTree: FUNDING_TREE,
        assets: options.trackerAssets ?? [],
        additionalRegisters: {},
        creationHeight: options.creationHeight ?? 110,
      },
      {
        value: '200000000',
        ergoTree: FUNDING_TREE,
        assets: [],
        additionalRegisters: {},
        creationHeight: options.creationHeight ?? 110,
      },
    ],
  }, 'funding observation fixture');
  const [tracker, dupVault] = materialized.outputs;
  return {
    tracker,
    dupVault,
    trackerBytes: await sigmaBytes(tracker),
    dupVaultBytes: await sigmaBytes(dupVault),
  };
}

async function sigmaBytes(box: Eip12Box): Promise<string> {
  const imported = await import('ergo-lib-wasm-nodejs');
  const wasm = imported.default ?? imported;
  const parsed = wasm.ErgoBox.from_json(JSON.stringify(box));
  return Buffer.from(parsed.sigma_serialize_bytes()).toString('hex');
}

function bindingTemplates(): AuthenticatedV2ContractTemplates {
  const template = (sourceTemplate: string) => ({
    sourceTemplate,
    sourceTemplateSha256Hex: createHash('sha256').update(sourceTemplate, 'utf8').digest('hex'),
  });
  return {
    tracker: template(BINDING_SOURCES.tracker),
    unlock: template(BINDING_SOURCES.unlock),
    duplicatePrevention: template(BINDING_SOURCES.duplicatePrevention),
  };
}

function bindingCompiler(): AuthenticatedV2InitialBindingCompiler {
  return async (resolved: ResolvedAuthenticatedV2ContractSources) => {
    const contracts = Object.fromEntries(
      (['tracker', 'unlock', 'duplicatePrevention'] as const).map((role, index) => {
        const ergoTreeHex = `${10 + index}${createHash('sha256')
          .update(resolved[role].source, 'utf8')
          .digest('hex')}`;
        return [role, {
          role,
          resolvedSourceSha256Hex: resolved[role].resolvedSourceSha256Hex,
          ergoTreeHex,
          ergoTreeSha256Hex: createHash('sha256')
            .update(Buffer.from(ergoTreeHex, 'hex'))
            .digest('hex'),
        }];
      }),
    ) as Awaited<ReturnType<AuthenticatedV2InitialBindingCompiler>>['observation']['contracts'];
    return {
      identity: BINDING_COMPILER_IDENTITY,
      observation: { contracts },
    };
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function pathOf(input: string | URL | Request): string {
  return new URL(String(input)).pathname;
}

function observationFetch(
  fixture: Fixture,
  options: {
    network?: string;
    postTipId?: string;
    trackerStatus?: number;
    trackerJson?: unknown;
    trackerBytes?: string;
  } = {},
): { fetchFn: AuthenticatedV2FundingObservationFetch; calls: Array<{ path: string; init?: RequestInit }> } {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  let tipReads = 0;
  const fetchFn: AuthenticatedV2FundingObservationFetch = async (input, init) => {
    const path = pathOf(input);
    calls.push({ path, init });
    if (path === '/info') {
      return jsonResponse({ network: options.network ?? 'testnet', fullHeight: 120 });
    }
    if (path === '/blocks/lastHeaders/1') {
      tipReads += 1;
      return jsonResponse([{
        id: tipReads > 1 ? (options.postTipId ?? TIP_ID) : TIP_ID,
        height: 120,
      }]);
    }
    if (path === `/utxo/byId/${fixture.tracker.boxId}`) {
      return jsonResponse(options.trackerJson ?? fixture.tracker, options.trackerStatus ?? 200);
    }
    if (path === `/utxo/byIdBinary/${fixture.tracker.boxId}`) {
      return jsonResponse({ bytes: options.trackerBytes ?? fixture.trackerBytes });
    }
    if (path === `/utxo/byId/${fixture.dupVault.boxId}`) return jsonResponse(fixture.dupVault);
    if (path === `/utxo/byIdBinary/${fixture.dupVault.boxId}`) {
      return jsonResponse({ bytes: fixture.dupVaultBytes });
    }
    throw new Error(`unexpected read-only path ${path}`);
  };
  return { fetchFn, calls };
}

function request(fixture: Fixture) {
  return {
    environment: 'patched-devnet',
    nodeUrl: 'http://127.0.0.1:9052',
    trackerFundingBoxId: fixture.tracker.boxId,
    dupVaultFundingBoxId: fixture.dupVault.boxId,
  };
}

describe('authenticated V2 funding observation', () => {
  it('binds two canonical pure-ERG UTXOs to one stable non-mainnet node tip', async () => {
    const fixture = await fundingFixture();
    const observed = observationFetch(fixture);
    const report = await observeAuthenticatedV2Funding(request(fixture), {
      fetch: observed.fetchFn,
      now: () => new Date(OBSERVED_AT),
    });

    expect(report.schema).toBe(AUTHENTICATED_V2_FUNDING_OBSERVATION_SCHEMA);
    expect(report.status).toBe('OBSERVED');
    expect(report.node).toEqual({
      endpointOrigin: 'http://127.0.0.1:9052',
      network: 'testnet',
      tipHeight: 120,
      tipIdHex: TIP_ID,
      snapshotDigestHex: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(report.boxes.tracker.box).toEqual(fixture.tracker);
    expect(report.boxes.duplicatePreventionVault.box).toEqual(fixture.dupVault);
    expect(report.boxes.tracker.sigmaSerializedHex).toBe(fixture.trackerBytes);
    expect(report.downstream.initialBindingInput).toEqual({
      schema: 'e2s.authenticated-v2-initial-binding-input.v1',
      environment: 'patched-devnet',
      trackerFundingBoxId: fixture.tracker.boxId,
      dupVaultFundingBoxId: fixture.dupVault.boxId,
    });
    expect(report.downstream.provisioningFundingBoxes).toEqual({
      trackerFundingBox: fixture.tracker,
      dupVaultFundingBox: fixture.dupVault,
    });
    expect(report.boundary.currentUtxoViewObserved).toBe(true);
    expect(report.boundary.tipUtxoAtomicityProved).toBe(false);
    expect(report.boundary.globalCanonicalityProved).toBe(false);
    expect(report.boundary.revalidationRequiredBeforeSetup).toBe(true);
    expect(Object.values(report.authorization).every(value => value === false)).toBe(true);
    expect(report.reportDigestHex).toMatch(/^[0-9a-f]{64}$/);

    expect(await initialBindingRequestFromFundingObservation(report)).toEqual({
      report,
      request: {
        environment: 'patched-devnet',
        trackerFundingBoxId: fixture.tracker.boxId,
        dupVaultFundingBoxId: fixture.dupVault.boxId,
      },
      binding: {
        reportDigestHex: report.reportDigestHex,
        snapshotDigestHex: report.node.snapshotDigestHex,
        observedAt: OBSERVED_AT,
        nodeNetwork: 'testnet',
        tipHeight: 120,
        tipIdHex: TIP_ID,
      },
      provisioningFundingBoxes: {
        trackerFundingBox: fixture.tracker,
        dupVaultFundingBox: fixture.dupVault,
      },
      observations: {
        tracker: {
          box: fixture.tracker,
          sigmaSerializedHex: fixture.trackerBytes,
          sigmaSerializedSha256Hex: createHash('sha256')
            .update(Buffer.from(fixture.trackerBytes, 'hex'))
            .digest('hex'),
        },
        duplicatePreventionVault: {
          box: fixture.dupVault,
          sigmaSerializedHex: fixture.dupVaultBytes,
          sigmaSerializedSha256Hex: createHash('sha256')
            .update(Buffer.from(fixture.dupVaultBytes, 'hex'))
            .digest('hex'),
        },
      },
    });

    expect(observed.calls.map(call => call.path)).toEqual([
      '/info',
      '/blocks/lastHeaders/1',
      `/utxo/byId/${fixture.tracker.boxId}`,
      `/utxo/byIdBinary/${fixture.tracker.boxId}`,
      `/utxo/byId/${fixture.dupVault.boxId}`,
      `/utxo/byIdBinary/${fixture.dupVault.boxId}`,
      '/info',
      '/blocks/lastHeaders/1',
    ]);
    for (const call of observed.calls) {
      expect(call.init?.method).toBe('GET');
      expect(call.init?.redirect).toBe('error');
      expect(call.init?.signal).toBeInstanceOf(AbortSignal);
      const headers = new Headers(call.init?.headers);
      expect(headers.has('Authorization')).toBe(false);
      expect(headers.has('api_key')).toBe(false);
    }
  });

  it('rejects tampered observation reports before deriving an initial binding request', async () => {
    const fixture = await fundingFixture();
    const report = await observeAuthenticatedV2Funding(request(fixture), {
      fetch: observationFetch(fixture).fetchFn,
      now: () => new Date(OBSERVED_AT),
    });
    const tampered = structuredClone(report);
    tampered.node.tipIdHex = 'bb'.repeat(32);
    await expect(initialBindingRequestFromFundingObservation(tampered)).rejects.toThrow(/digest/i);

    const crossField = structuredClone(report);
    crossField.downstream.initialBindingInput.trackerFundingBoxId = 'cc'.repeat(32);
    const { reportDigestHex: _discarded, ...withoutDigest } = crossField;
    crossField.reportDigestHex = await canonicalSha256(withoutDigest);
    await expect(initialBindingRequestFromFundingObservation(crossField)).rejects.toThrow(/tracker.*match/i);

    for (const key of Object.keys(report.authorization) as Array<keyof typeof report.authorization>) {
      const unauthorized = structuredClone(report);
      unauthorized.authorization[key] = true as false;
      const { reportDigestHex: _oldDigest, ...unauthorizedWithoutDigest } = unauthorized;
      unauthorized.reportDigestHex = await canonicalSha256(unauthorizedWithoutDigest);
      await expect(initialBindingRequestFromFundingObservation(unauthorized))
        .rejects.toThrow(new RegExp(`${key} must be false`, 'i'));
    }

    const rehashedBinaryDrift = structuredClone(report);
    rehashedBinaryDrift.boxes.tracker.sigmaSerializedHex = fixture.dupVaultBytes;
    rehashedBinaryDrift.boxes.tracker.sigmaSerializedSha256Hex = createHash('sha256')
      .update(Buffer.from(fixture.dupVaultBytes, 'hex'))
      .digest('hex');
    const { reportDigestHex: _binaryDigest, ...binaryWithoutDigest } = rehashedBinaryDrift;
    rehashedBinaryDrift.reportDigestHex = await canonicalSha256(binaryWithoutDigest);
    await expect(initialBindingRequestFromFundingObservation(rehashedBinaryDrift))
      .rejects.toThrow(/JSON and binary box observations do not match/i);

    const provisioningDrift = structuredClone(report);
    provisioningDrift.downstream.provisioningFundingBoxes.trackerFundingBox.value = '99999999';
    const { reportDigestHex: _provisioningDigest, ...provisioningWithoutDigest } = provisioningDrift;
    provisioningDrift.reportDigestHex = await canonicalSha256(provisioningWithoutDigest);
    await expect(initialBindingRequestFromFundingObservation(provisioningDrift))
      .rejects.toThrow(/box id.*differs|does not match the observed box/i);
  });

  it('derives a bound compiler report only through the validated observation wrapper', async () => {
    const fixture = await fundingFixture();
    const observation = await observeAuthenticatedV2Funding(request(fixture), {
      fetch: observationFetch(fixture).fetchFn,
      now: () => new Date(OBSERVED_AT),
    });
    const report = await deriveAuthenticatedV2InitialBindingFromFundingObservation(
      observation,
      { templates: bindingTemplates(), compile: bindingCompiler() },
    );

    expect(report.fundingObservation).toEqual({
      status: 'bound',
      reportDigestHex: observation.reportDigestHex,
      snapshotDigestHex: observation.node.snapshotDigestHex,
      observedAt: OBSERVED_AT,
      nodeNetwork: 'testnet',
      tipHeight: 120,
      tipIdHex: TIP_ID,
      revalidationRequiredBeforeSetup: true,
    });
    expect(Object.values(report.authorization).every(value => value === false)).toBe(true);

    const validatedFunding = await initialBindingRequestFromFundingObservation(observation);
    const validatedBinding = validateAuthenticatedV2InitialBindingReport(
      report,
      validatedFunding,
      bindingTemplates(),
    );
    expect(validatedBinding.provenance).toEqual({
      reportDigestHex: report.reportDigestHex,
      inputDigestHex: report.inputDigestHex,
    });
    expect(validatedBinding.contracts.unlock.ergoTreeHex)
      .toBe(report.provisioningContracts.unlock.ergoTreeHex);
  });

  it('rejects rehashed initial-binding reports with semantic provenance drift', async () => {
    const fixture = await fundingFixture();
    const observation = await observeAuthenticatedV2Funding(request(fixture), {
      fetch: observationFetch(fixture).fetchFn,
      now: () => new Date(OBSERVED_AT),
    });
    const templates = bindingTemplates();
    const report = await deriveAuthenticatedV2InitialBindingFromFundingObservation(
      observation,
      { templates, compile: bindingCompiler() },
    );
    const funding = await initialBindingRequestFromFundingObservation(observation);

    const staleOuterDigest = structuredClone(report);
    staleOuterDigest.inputDigestHex = '41'.repeat(32);
    expect(() => validateAuthenticatedV2InitialBindingReport(
      staleOuterDigest,
      funding,
      templates,
    )).toThrow(/report digest/i);

    const rehashedInputDrift = structuredClone(report);
    rehashedInputDrift.inputDigestHex = '42'.repeat(32);
    const { reportDigestHex: _inputDigest, ...inputWithoutDigest } = rehashedInputDrift;
    rehashedInputDrift.reportDigestHex = await canonicalSha256(inputWithoutDigest);
    expect(() => validateAuthenticatedV2InitialBindingReport(
      rehashedInputDrift,
      funding,
      templates,
    )).toThrow(/input digest/i);

    const rehashedCompilerDrift = structuredClone(report);
    rehashedCompilerDrift.compiler.nodeVersion = '24.14.1';
    const { reportDigestHex: _compilerDigest, ...compilerWithoutDigest } =
      rehashedCompilerDrift;
    rehashedCompilerDrift.reportDigestHex = await canonicalSha256(compilerWithoutDigest);
    expect(() => validateAuthenticatedV2InitialBindingReport(
      rehashedCompilerDrift,
      funding,
      templates,
    )).toThrow(/compiler identity.*digest/i);

    const rehashedFixedPointDrift = structuredClone(report);
    rehashedFixedPointDrift.dependencyBinding.fixedPointVerified = false as true;
    const { reportDigestHex: _fixedPointDigest, ...fixedPointWithoutDigest } =
      rehashedFixedPointDrift;
    rehashedFixedPointDrift.reportDigestHex = await canonicalSha256(fixedPointWithoutDigest);
    expect(() => validateAuthenticatedV2InitialBindingReport(
      rehashedFixedPointDrift,
      funding,
      templates,
    )).toThrow(/three-pass fixed point/i);

    for (const key of Object.keys(report.authorization) as Array<keyof typeof report.authorization>) {
      const rehashedAuthorization = structuredClone(report);
      rehashedAuthorization.authorization[key] = true as false;
      const { reportDigestHex: _authorizationDigest, ...authorizationWithoutDigest } =
        rehashedAuthorization;
      rehashedAuthorization.reportDigestHex = await canonicalSha256(authorizationWithoutDigest);
      expect(() => validateAuthenticatedV2InitialBindingReport(
        rehashedAuthorization,
        funding,
        templates,
      )).toThrow(new RegExp(`${key} must be false`, 'i'));
    }

    const rehashedContractDrift = structuredClone(report);
    rehashedContractDrift.provisioningContracts.unlock.ergoTreeHex = 'ff00';
    rehashedContractDrift.provisioningContracts.unlock.ergoTreeSha256Hex = createHash('sha256')
      .update(Buffer.from('ff00', 'hex'))
      .digest('hex');
    const { reportDigestHex: _contractDigest, ...contractWithoutDigest } = rehashedContractDrift;
    rehashedContractDrift.reportDigestHex = await canonicalSha256(contractWithoutDigest);
    expect(() => validateAuthenticatedV2InitialBindingReport(
      rehashedContractDrift,
      funding,
      templates,
    )).toThrow(/unlock.*contract.*does not match|ErgoTrees must be distinct/i);

    const rehashedResolvedSourceDrift = structuredClone(report);
    rehashedResolvedSourceDrift.resolvedContracts.unlock.resolvedSourceSha256Hex =
      '43'.repeat(32);
    const { reportDigestHex: _resolvedDigest, ...resolvedWithoutDigest } =
      rehashedResolvedSourceDrift;
    rehashedResolvedSourceDrift.reportDigestHex = await canonicalSha256(resolvedWithoutDigest);
    expect(() => validateAuthenticatedV2InitialBindingReport(
      rehashedResolvedSourceDrift,
      funding,
      templates,
    )).toThrow(/unlock resolved contract does not match/i);

    const unobserved = await deriveAuthenticatedV2InitialBinding(
      request(fixture),
      { templates, compile: bindingCompiler() },
    );
    expect(() => validateAuthenticatedV2InitialBindingReport(
      unobserved,
      funding,
      templates,
    )).toThrow(/funding observation.*exactly|funding observation.*match/i);
  });

  it('hydrates provisioning v5 only from the two complete cross-bound reports', async () => {
    const fixture = await fundingFixture();
    const observation = await observeAuthenticatedV2Funding(request(fixture), {
      fetch: observationFetch(fixture).fetchFn,
      now: () => new Date(OBSERVED_AT),
    });
    const bridgeRoot = fileURLToPath(new URL('../../', import.meta.url));
    const templates = loadCanonicalAuthenticatedV2ContractTemplates(bridgeRoot);
    const initialBinding = await deriveAuthenticatedV2InitialBindingFromFundingObservation(
      observation,
      { templates, compile: bindingCompiler() },
    );
    const rawInput = {
      schema: AUTHENTICATED_V2_PROVISIONING_INPUT_SCHEMA,
      fundingObservation: observation,
      initialBinding,
      provisioningCreationHeight: 120,
      settlementCreationHeight: 130,
      sidechainIdHex: '11'.repeat(32),
      committeePubKeyHex: COMMITTEE_PUBKEY,
      trackerFinalityAttestorPubKeyHex: FINALITY_ATTESTOR_PUBKEY,
      values: {},
      vault: {},
      checkpoint: {},
      settlement: {},
    };
    const hydrated = await hydrateAuthenticatedV2ProvisioningInput(rawInput);

    expect(hydrated.environment).toBe('patched-devnet');
    expect(hydrated.trackerFinalityAttestorPubKeyHex)
      .toBe(FINALITY_ATTESTOR_PUBKEY);
    expect(hydrated.trackerFundingBox).toEqual(fixture.tracker);
    expect(hydrated.dupVaultFundingBox).toEqual(fixture.dupVault);
    expect(hydrated.contracts.unlock.ergoTreeHex)
      .toBe(initialBinding.provisioningContracts.unlock.ergoTreeHex);
    expect(hydrated.provenance).toEqual({
      fundingObservation: {
        reportDigestHex: observation.reportDigestHex,
        snapshotDigestHex: observation.node.snapshotDigestHex,
        observedAt: OBSERVED_AT,
        nodeNetwork: 'testnet',
        tipHeight: 120,
        tipIdHex: TIP_ID,
      },
      initialBinding: {
        reportDigestHex: initialBinding.reportDigestHex,
        inputDigestHex: initialBinding.inputDigestHex,
      },
      revalidationRequiredBeforeSetup: true,
    });

    for (const staleSchema of [
      'e2s.authenticated-v2-staged-provisioning-input.v1',
      'e2s.authenticated-v2-staged-provisioning-input.v2',
      'e2s.authenticated-v2-staged-provisioning-input.v4',
    ]) {
      await expect(hydrateAuthenticatedV2ProvisioningInput({
        ...rawInput,
        schema: staleSchema,
      })).rejects.toThrow(/staged-provisioning-input\.v5/i);
    }
    for (const [field, injected] of [
      ['environment', 'patched-devnet'],
      ['trackerFundingBox', fixture.tracker],
      ['dupVaultFundingBox', fixture.dupVault],
      ['contracts', initialBinding.provisioningContracts],
    ] as const) {
      await expect(hydrateAuthenticatedV2ProvisioningInput({
        ...rawInput,
        [field]: injected,
      })).rejects.toThrow(/must contain exactly/i);
    }

    const rebound = structuredClone(initialBinding);
    if (rebound.fundingObservation.status !== 'bound') {
      throw new Error('test fixture must retain a bound funding observation');
    }
    rebound.fundingObservation.reportDigestHex = 'e1'.repeat(32);
    const { reportDigestHex: _reboundDigest, ...reboundWithoutDigest } = rebound;
    rebound.reportDigestHex = await canonicalSha256(reboundWithoutDigest);
    await expect(hydrateAuthenticatedV2ProvisioningInput({
      ...rawInput,
      initialBinding: rebound,
    })).rejects.toThrow(/funding observation does not match/i);
  });

  it('rejects mainnet or unknown node networks before reading funding boxes', async () => {
    const fixture = await fundingFixture();
    for (const network of ['mainnet', 'private-chain']) {
      const observed = observationFetch(fixture, { network });
      await expect(observeAuthenticatedV2Funding(request(fixture), {
        fetch: observed.fetchFn,
        now: () => new Date(OBSERVED_AT),
      })).rejects.toThrow(/non-mainnet|mainnet/i);
      expect(observed.calls.map(call => call.path)).toEqual(['/info']);
    }
  });

  it('rejects a tip change across the observation window', async () => {
    const fixture = await fundingFixture();
    const observed = observationFetch(fixture, { postTipId: 'bb'.repeat(32) });
    await expect(observeAuthenticatedV2Funding(request(fixture), {
      fetch: observed.fetchFn,
      now: () => new Date(OBSERVED_AT),
    })).rejects.toThrow(/tip changed/i);
  });

  it('rejects a box whose canonical creation height is above the observed tip', async () => {
    const fixture = await fundingFixture({ creationHeight: 121 });
    await expect(observeAuthenticatedV2Funding(request(fixture), {
      fetch: observationFetch(fixture).fetchFn,
      now: () => new Date(OBSERVED_AT),
    })).rejects.toThrow(/creation height exceeds the observed node tip/i);
  });

  it('does not misclassify an absent UTXO as spent', async () => {
    const fixture = await fundingFixture();
    const observed = observationFetch(fixture, { trackerStatus: 404 });
    await expect(observeAuthenticatedV2Funding(request(fixture), {
      fetch: observed.fetchFn,
      now: () => new Date(OBSERVED_AT),
    })).rejects.toThrow(/not present in the current UTXO view.*unknown, spent, reorged, or unavailable/i);
  });

  it('rejects token-bearing funding, JSON identity drift, and JSON/binary disagreement independently', async () => {
    const tokenFixture = await fundingFixture({
      trackerAssets: [{ tokenId: BASE_INPUT.boxId, amount: '1' }],
    });
    await expect(observeAuthenticatedV2Funding(request(tokenFixture), {
      fetch: observationFetch(tokenFixture).fetchFn,
      now: () => new Date(OBSERVED_AT),
    })).rejects.toThrow(/pure ERG/i);

    const fixture = await fundingFixture();
    const driftedJson = { ...fixture.tracker, boxId: '44'.repeat(32) };
    await expect(observeAuthenticatedV2Funding(request(fixture), {
      fetch: observationFetch(fixture, { trackerJson: driftedJson }).fetchFn,
      now: () => new Date(OBSERVED_AT),
    })).rejects.toThrow(/box id.*differs|boxId does not match/i);

    await expect(observeAuthenticatedV2Funding(request(fixture), {
      fetch: observationFetch(fixture, { trackerBytes: fixture.dupVaultBytes }).fetchFn,
      now: () => new Date(OBSERVED_AT),
    })).rejects.toThrow(/JSON and binary observations do not match/i);
  });

  it('rejects ambiguous IDs and credential-bearing or non-root node targets before fetch', async () => {
    const fixture = await fundingFixture();
    const neverFetch: AuthenticatedV2FundingObservationFetch = async () => {
      throw new Error('fetch must not run');
    };
    for (const override of [
      { dupVaultFundingBoxId: fixture.tracker.boxId },
      { trackerFundingBoxId: fixture.tracker.boxId.toUpperCase() },
      { nodeUrl: 'http://user:pass@127.0.0.1:9052' },
      { nodeUrl: 'http://127.0.0.1:9052/api' },
      { nodeUrl: 'http://127.0.0.1:9052?token=secret' },
    ]) {
      await expect(observeAuthenticatedV2Funding({ ...request(fixture), ...override }, {
        fetch: neverFetch,
        now: () => new Date(OBSERVED_AT),
      })).rejects.toThrow();
    }
  });

  it('bounds node response size before parsing untrusted JSON', async () => {
    const fixture = await fundingFixture();
    const fetchFn: AuthenticatedV2FundingObservationFetch = async () => new Response(
      'x'.repeat(2 * 1024 * 1024 + 1),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
    await expect(observeAuthenticatedV2Funding(request(fixture), {
      fetch: fetchFn,
      now: () => new Date(OBSERVED_AT),
    })).rejects.toThrow(/response exceeded/i);
  });
});

async function canonicalSha256(value: unknown): Promise<string> {
  const canonical = (item: unknown): string => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') {
      return JSON.stringify(item);
    }
    if (typeof item === 'number') return JSON.stringify(item);
    if (Array.isArray(item)) return `[${item.map(canonical).join(',')}]`;
    const record = item as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
  };
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

describe('authenticated V2 funding observation CLI', () => {
  it('requires every network and identity argument exactly once', () => {
    const parsed = parseAuthenticatedV2FundingObservationArgs([
      '--environment', 'patched-devnet',
      '--node-url', 'http://127.0.0.1:9052',
      '--tracker-funding-box-id', '11'.repeat(32),
      '--dup-vault-funding-box-id', '22'.repeat(32),
      '--out', 'reports/funding-observation.json',
    ]);
    expect(parsed.errors).toEqual([]);
    expect(parsed).toMatchObject({
      environment: 'patched-devnet',
      nodeUrl: 'http://127.0.0.1:9052',
      trackerFundingBoxId: '11'.repeat(32),
      dupVaultFundingBoxId: '22'.repeat(32),
      out: 'reports/funding-observation.json',
    });
    expect(parseAuthenticatedV2FundingObservationArgs([]).errors).toEqual([
      '--environment is required',
      '--node-url is required',
      '--tracker-funding-box-id is required',
      '--dup-vault-funding-box-id is required',
      '--out is required',
    ]);
    expect(parseAuthenticatedV2FundingObservationArgs([
      '--environment', 'testnet', '--environment', 'devnet',
    ]).errors).toContain('--environment may be provided only once');
  });

  it('writes one new guarded report without reading an input file or runtime defaults', async () => {
    const fixture = await fundingFixture();
    const observed = observationFetch(fixture);
    const out = `tmp-funding-observation-${process.pid}-${Date.now()}.json`;
    const outPath = join(process.cwd(), out);
    try {
      await runAuthenticatedV2FundingObservationCli([
        '--environment', 'patched-devnet',
        '--node-url', 'http://127.0.0.1:9052',
        '--tracker-funding-box-id', fixture.tracker.boxId,
        '--dup-vault-funding-box-id', fixture.dupVault.boxId,
        '--out', out,
      ], {
        cwd: process.cwd(),
        fetch: observed.fetchFn,
        now: () => new Date(OBSERVED_AT),
      });

      expect(existsSync(outPath)).toBe(true);
      const report = JSON.parse(readFileSync(outPath, 'utf8'));
      expect(report.status).toBe('OBSERVED');
      expect(report.authorization.execute).toBe(false);
      expect(JSON.stringify(report)).not.toMatch(/privateKeyHex|mnemonic|deployed_state\.json|\.env/i);
    } finally {
      rmSync(outPath, { force: true });
    }
  });

  it('keeps the observer outside configuration, signer, transaction, and broadcast modules', () => {
    const core = readFileSync(
      new URL('./authenticated-v2-funding-observation.ts', import.meta.url),
      'utf8',
    );
    const cli = readFileSync(
      new URL('./scripts/observe-authenticated-v2-funding.ts', import.meta.url),
      'utf8',
    );
    const source = `${core}\n${cli}`;
    expect(source).not.toMatch(/from ['"]\.\.?\/.*(?:config|ergo-client|fleet-signer|broadcast-policy|state-tracker)/i);
    expect(source).not.toMatch(/\/transactions(?:\/check)?|submitTransaction|signAndCheck|signAndSubmit|wallet/i);
    expect(source).not.toMatch(/process\.env|dotenv/i);
  });
});
