import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';

const processBoundary = vi.hoisted(() => ({
  active: true,
  processBindingDigestHex: '11'.repeat(32),
  reconciliationIdentityDigestHex: '12'.repeat(32),
  target: Object.freeze({
    primaryNodeOrigin: 'http://127.0.0.1:9051' as const,
    witnessNodeOrigin: 'http://127.0.0.1:9052' as const,
    primaryMining: true as const,
    witnessReadOnly: true as const,
  }),
}));

const rpc = vi.hoisted(() => ({
  primaryGet: vi.fn(),
  witnessGet: vi.fn(),
  clientConfigs: [] as Array<Readonly<{
    baseURL?: string;
    timeout?: number;
  }>>,
  requests: [] as Array<Readonly<{
    origin: string;
    path: string;
    options?: Readonly<{ timeout?: number }>;
  }>>,
}));

vi.mock('./substrate-federated-isolated-devnet-ergo-node-process-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1: (
    value: unknown,
  ) => {
    if (!processBoundary.active || value !== processBoundary.target) {
      throw new Error(
        'isolated Ergo execution target is not owned by the active mining action',
      );
    }
    return Object.freeze({
      processBindingDigestHex: processBoundary.processBindingDigestHex,
      executionTargetIdentityDigestHex:
        processBoundary.reconciliationIdentityDigestHex,
    });
  },
}));

vi.mock('axios', () => ({
  default: {
    create: (config: Readonly<{ baseURL?: string; timeout?: number }>) => {
      rpc.clientConfigs.push(config);
      return {
        get: (path: string, options?: Readonly<{ timeout?: number }>) => {
          const origin = config.baseURL ?? '';
          rpc.requests.push({ origin, path, ...(options === undefined ? {} : { options }) });
          return origin === 'http://127.0.0.1:9051'
            ? rpc.primaryGet(path)
            : rpc.witnessGet(path);
        },
      };
    },
    isAxiosError: (error: unknown) =>
      typeof error === 'object'
      && error !== null
      && (error as { isAxiosError?: unknown }).isAxiosError === true,
  },
}));

import {
  assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1,
  createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1,
  reobserveSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1,
  projectSubstrateFederatedIsolatedDevnetConfirmationProgressV1 as projectProgress,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_CONFIRMATION_OBSERVATION_MAX_MS_V1,
} from './substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js';

const GENESIS_HEADER_ID = '21'.repeat(32);
const TX_ID = '22'.repeat(32);
const INCLUSION_HEADER_ID = '23'.repeat(32);

const INDEX_PATH = '/blockchain/indexedHeight';
const POOL_PATH = `/transactions/unconfirmed/byTransactionId/${TX_ID}`;
function httpError(status: number) { return { isAxiosError: true, response: { status, data: 'not exported' } }; }
function progressObserver() {
  return createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
    processBoundary.target, GENESIS_HEADER_ID, TX_ID,
  );
}
function progressOf(observer: ReturnType<typeof progressObserver>) {
  return projectProgress(observer, TX_ID, processBoundary.reconciliationIdentityDigestHex);
}
function installProgressResponses(input: Readonly<{
  index?: unknown; pool?: unknown; indexError?: unknown; poolError?: unknown;
}> = {}) {
  installCanonicalResponses();
  for (const get of [rpc.primaryGet, rpc.witnessGet]) {
    const original = get.getMockImplementation()!;
    get.mockImplementation(async (path: string) => {
      if (path === `/blockchain/transaction/byId/${TX_ID}`) throw httpError(404);
      if (path === INDEX_PATH) {
        if ('indexError' in input) throw input.indexError;
        return { data: 'index' in input ? input.index : { indexedHeight: 18, fullHeight: 20 } };
      }
      if (path === POOL_PATH) {
        if ('poolError' in input) throw input.poolError;
        return { data: 'pool' in input ? input.pool : { id: TX_ID, privateExtra: 'not exported' } };
      }
      return original(path);
    });
  }
}

beforeEach(() => {
  processBoundary.active = true;
  rpc.primaryGet.mockReset();
  rpc.witnessGet.mockReset();
  rpc.clientConfigs.length = 0;
  rpc.requests.length = 0;
});

describe('isolated confirmation progress diagnostics', () => {
  it('keeps the default observer and its V1 digest unchanged', async () => {
    installProgressResponses();
    const plain = createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(processBoundary.target, GENESIS_HEADER_ID);
    const baseline = await plain.observe(TX_ID, processBoundary.target.primaryNodeOrigin);
    expect(progressOf(plain)).toBeNull();
    expect(rpc.requests.some(row => row.path === INDEX_PATH || row.path === POOL_PATH)).toBe(false);
    const observer = progressObserver();
    const observed = await observer.observe(TX_ID, processBoundary.target.primaryNodeOrigin);
    if (observed === null || baseline === null) throw new Error('missing confirmation observation');
    expect(observed.observationDigestHex).toBe(baseline.observationDigestHex);
    expect(Object.keys(observer)).toEqual(Object.keys(plain));
    expect(SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_CONFIRMATION_OBSERVATION_MAX_MS_V1).toBe(50_000);
    expect(rpc.requests.filter(row => row.path === INDEX_PATH || row.path === POOL_PATH))
      .toHaveLength(4);
    expect(rpc.requests.filter(row => row.options).every(row => row.options?.timeout === 2_000)).toBe(true);
  });

  it('projects bounded per-node data without exposing response bodies or confirmation authority', async () => {
    installProgressResponses();
    const original = rpc.witnessGet.getMockImplementation()!;
    rpc.witnessGet.mockImplementation(async (path: string) => {
      if (path === POOL_PATH) throw httpError(404);
      if (path === INDEX_PATH) return { data: { indexedHeight: 16, fullHeight: 20 } };
      return original(path);
    });
    const observer = progressObserver();
    expect(progressOf(observer)).toBeNull();
    const observed = await observer.observe(TX_ID, processBoundary.target.primaryNodeOrigin);
    if (observed === null) throw new Error('missing confirmation observation');
    expect(observed.status).toBe('not_found');
    const progress = progressOf(observer)!;
    expect(progress).toMatchObject({
      schema: 'e2s.substrate-federated-isolated-devnet-confirmation-progress.v1', version: 1,
      expectedErgoTransactionIdHex: TX_ID, executionTargetIdentityDigestHex: processBoundary.reconciliationIdentityDigestHex,
      targetGenesisHeaderIdHex: GENESIS_HEADER_ID, observationSequence: 1,
      primary: { fullHeightBefore: 20, fullHeightAfter: 20, index: { status: 'observed', indexedHeight: 18, fullHeight: 20 }, pool: { status: 'present' } },
      witness: { index: { status: 'observed', indexedHeight: 16, fullHeight: 20 }, pool: { status: 'not_found' } },
    });
    expect(progress.observedAtUnixMs).toBeGreaterThan(0);
    expect(JSON.stringify(progress)).not.toMatch(/privateExtra|not exported|spendingProof/);
    const { diagnosticDigestHex, ...payload } = progress;
    expect(diagnosticDigestHex).toBe(sha256CanonicalJson(payload, 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CONFIRMATION_PROGRESS_V1'));
    for (const value of [progress, progress.primary, progress.witness, progress.primary.index, progress.primary.pool]) expect(Object.isFrozen(value)).toBe(true);
    expect(() => assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1(
      progress, observer.reconciliationIdentityDigestHex, GENESIS_HEADER_ID, TX_ID,
      { ...observed, observerArtifact: progress },
    )).toThrow(/lacks exact process provenance/);
    expect(projectProgress({ ...observer }, TX_ID, observer.reconciliationIdentityDigestHex)).toBeNull();
    expect(projectProgress(observer, '24'.repeat(32), observer.reconciliationIdentityDigestHex)).toBeNull();
    expect(projectProgress(observer, TX_ID, '25'.repeat(32))).toBeNull();
    processBoundary.active = false;
    expect(progressOf(observer)).toBeNull();
  });

  it.each([
    ['null', null], ['array', []], ['string height', { indexedHeight: '18', fullHeight: 20 }],
    ['negative', { indexedHeight: -1, fullHeight: 20 }], ['fraction', { indexedHeight: 1.5, fullHeight: 20 }],
    ['above full', { indexedHeight: 21, fullHeight: 20 }], ['unsafe full', { indexedHeight: 0, fullHeight: 2 ** 53 }],
    ['before window', { indexedHeight: 18, fullHeight: 19 }], ['after window', { indexedHeight: 18, fullHeight: 21 }],
  ])('keeps malformed index data optional: %s', async (_label, index) => {
    installProgressResponses({ index });
    const observer = progressObserver();
    expect((await observer.observe(TX_ID, processBoundary.target.primaryNodeOrigin))?.status).toBe('not_found');
    expect(progressOf(observer)?.primary.index).toEqual({ status: 'unavailable', reason: 'invalid_response', httpStatus: null });
    expect(progressOf(observer)?.primary.pool.status).toBe('present');
  });

  it.each([null, [], {}, { id: '24'.repeat(32) }, { id: `0x${TX_ID}` }])('rejects malformed pool data without affecting confirmation: %j', async pool => {
    installProgressResponses({ pool });
    const observer = progressObserver();
    expect((await observer.observe(TX_ID, processBoundary.target.primaryNodeOrigin))?.status).toBe('not_found');
    expect(progressOf(observer)?.primary.pool).toEqual({ status: 'unavailable', reason: 'invalid_response', httpStatus: null });
  });

  it.each([
    ['indexError', httpError(404), 'index', 'http_error', 404],
    ['indexError', httpError(500), 'index', 'http_error', 500],
    ['poolError', httpError(500), 'pool', 'http_error', 500],
    ['poolError', new Error('private exception'), 'pool', 'request_failed', null],
    ['indexError', { isAxiosError: true, code: 'ECONNABORTED' }, 'index', 'request_failed', null],
  ] as const)('classifies optional endpoint failures: %s %j', async (key, error, field, reason, httpStatus) => {
    installProgressResponses({ [key]: error });
    const observer = progressObserver();
    expect((await observer.observe(TX_ID, processBoundary.target.primaryNodeOrigin))?.status).toBe('not_found');
    expect(progressOf(observer)?.primary[field]).toEqual({ status: 'unavailable', reason, httpStatus });
    expect(JSON.stringify(progressOf(observer))).not.toMatch(/private exception|ECONNABORTED|not exported/);
  });

  it('clears old data after failed identity or malformed request and never captures another transaction', async () => {
    installProgressResponses();
    const observer = progressObserver();
    await observer.observe(TX_ID, processBoundary.target.primaryNodeOrigin);
    expect(progressOf(observer)).not.toBeNull();
    await expect(observer.observe('bad', processBoundary.target.primaryNodeOrigin)).rejects.toThrow();
    expect(progressOf(observer)).toBeNull();
    await observer.observe(TX_ID, processBoundary.target.primaryNodeOrigin);
    rpc.primaryGet.mockRejectedValueOnce(new Error('identity unavailable'));
    await expect(observer.observe(TX_ID, processBoundary.target.primaryNodeOrigin)).rejects.toThrow('identity unavailable');
    expect(progressOf(observer)).toBeNull();
    const before = rpc.requests.filter(row => row.path === INDEX_PATH).length;
    await expect(observer.observe('24'.repeat(32), processBoundary.target.primaryNodeOrigin)).rejects.toThrow();
    expect(rpc.requests.filter(row => row.path === INDEX_PATH)).toHaveLength(before);
  });

  it('drains diagnostic reads before propagating the original required read error', async () => {
    installProgressResponses();
    const original = rpc.primaryGet.getMockImplementation()!;
    const failure = new Error('original required read');
    let finish!: (value: unknown) => void;
    rpc.primaryGet.mockImplementation(async (path: string) => {
      if (path === `/blockchain/transaction/byId/${TX_ID}`) throw failure;
      if (path === INDEX_PATH) return new Promise(resolve => { finish = resolve; });
      return original(path);
    });
    const observer = progressObserver();
    let settled = false;
    const observed = observer.observe(TX_ID, processBoundary.target.primaryNodeOrigin).catch(error => { settled = true; return error; });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    expect(settled).toBe(false);
    finish({ data: { indexedHeight: 18, fullHeight: 20 } });
    expect(await observed).toBe(failure);
    expect(progressOf(observer)).toBeNull();
  });

  it.each([
    ['disagreement', /observations disagree/], ['id', /another transaction/],
    ['count', /confirmation count/], ['inclusion', /canonical inclusion header/],
  ] as const)('publishes nothing when a late required check fails: %s', async (fault, rejection) => {
    installProgressResponses();
    const observer = progressObserver();
    await observer.observe(TX_ID, processBoundary.target.primaryNodeOrigin);
    expect(progressOf(observer)).not.toBeNull();
    for (const [get, primary] of [[rpc.primaryGet, true], [rpc.witnessGet, false]] as const) {
      const original = get.getMockImplementation()!;
      get.mockImplementation(async (path: string) => {
        if (path === `/blockchain/transaction/byId/${TX_ID}`) {
          if (!primary && fault === 'disagreement') throw httpError(404);
          return { data: { ...transaction(10),
            ...(primary && fault === 'id' ? { id: '24'.repeat(32) } : {}),
            ...(primary && fault === 'count' ? { numConfirmations: -1 } : {}),
          } };
        }
        if (path === '/blocks/at/10' && primary && fault === 'inclusion') return { data: ['25'.repeat(32)] };
        return original(path);
      });
    }
    await expect(observer.observe(TX_ID, processBoundary.target.primaryNodeOrigin)).rejects.toThrow(rejection);
    expect(progressOf(observer)).toBeNull();
  });

  it('can capture successful canonical observation with an independently unavailable witness index', async () => {
    installProgressResponses();
    for (const [get, primary] of [[rpc.primaryGet, true], [rpc.witnessGet, false]] as const) {
      const original = get.getMockImplementation()!;
      get.mockImplementation(async (path: string) => {
        if (path === `/blockchain/transaction/byId/${TX_ID}`) return { data: transaction(10) };
        if (!primary && path === INDEX_PATH) throw httpError(500);
        return original(path);
      });
    }
    const observer = progressObserver();
    expect((await observer.observe(TX_ID, processBoundary.target.primaryNodeOrigin))?.status).toBe('confirmed');
    expect(progressOf(observer)?.primary.index.status).toBe('observed');
    expect(progressOf(observer)?.witness.index).toEqual({ status: 'unavailable', reason: 'http_error', httpStatus: 500 });
  });

  it('does not let an older overlapping request replace a newer snapshot', async () => {
    installProgressResponses();
    const original = rpc.primaryGet.getMockImplementation()!;
    let finish!: (value: unknown) => void;
    let reads = 0;
    rpc.primaryGet.mockImplementation(async (path: string) => {
      if (path === INDEX_PATH && ++reads === 1) return new Promise(resolve => { finish = resolve; });
      return original(path);
    });
    const observer = progressObserver();
    const older = observer.observe(TX_ID, processBoundary.target.primaryNodeOrigin);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await observer.observe(TX_ID, processBoundary.target.primaryNodeOrigin);
    const latest = progressOf(observer);
    expect(latest?.observationSequence).toBe(2);
    finish({ data: { indexedHeight: 10, fullHeight: 20 } });
    await older;
    expect(progressOf(observer)).toBe(latest);
  });
});

describe('isolated devnet genesis confirmation observer V1', () => {
  it('bounds the exact five-wave confirmed observation topology', async () => {
    installCanonicalResponses();
    const observer =
      createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
        processBoundary.target,
        GENESIS_HEADER_ID,
      );
    await observer.observe(TX_ID, processBoundary.target.primaryNodeOrigin);

    expect(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_CONFIRMATION_OBSERVATION_MAX_MS_V1,
    ).toBe(50_000);
    expect(rpc.clientConfigs).toHaveLength(2);
    expect(rpc.clientConfigs.every(config => config.timeout === 10_000)).toBe(true);
    expect(rpc.requests).toEqual([
      { origin: processBoundary.target.primaryNodeOrigin, path: '/info' },
      { origin: processBoundary.target.primaryNodeOrigin, path: '/blocks/at/1' },
      { origin: processBoundary.target.witnessNodeOrigin, path: '/info' },
      { origin: processBoundary.target.witnessNodeOrigin, path: '/blocks/at/1' },
      {
        origin: processBoundary.target.primaryNodeOrigin,
        path: `/blockchain/transaction/byId/${TX_ID}`,
      },
      {
        origin: processBoundary.target.witnessNodeOrigin,
        path: `/blockchain/transaction/byId/${TX_ID}`,
      },
      { origin: processBoundary.target.primaryNodeOrigin, path: '/info' },
      { origin: processBoundary.target.primaryNodeOrigin, path: '/blocks/at/1' },
      { origin: processBoundary.target.witnessNodeOrigin, path: '/info' },
      { origin: processBoundary.target.witnessNodeOrigin, path: '/blocks/at/1' },
      { origin: processBoundary.target.primaryNodeOrigin, path: '/blocks/at/10' },
      { origin: processBoundary.target.witnessNodeOrigin, path: '/blocks/at/10' },
    ]);
  });

  it('binds a dual-node canonical confirmation to the active process target', async () => {
    installCanonicalResponses();
    const observer =
      createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
        processBoundary.target,
        GENESIS_HEADER_ID,
      );

    const confirmation = await observer.observe(
      TX_ID,
      processBoundary.target.primaryNodeOrigin,
    );

    expect(confirmation).toMatchObject({
      status: 'confirmed',
      confirmations: 10,
      observedAtHeight: 20,
      confirmationHeight: 10,
      confirmationHeaderIdHex: INCLUSION_HEADER_ID,
    });
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1(
        confirmation!.observerArtifact,
        processBoundary.reconciliationIdentityDigestHex,
        GENESIS_HEADER_ID,
        TX_ID,
        confirmation!,
      )
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1(
        { ...confirmation!.observerArtifact },
        processBoundary.reconciliationIdentityDigestHex,
        GENESIS_HEADER_ID,
        TX_ID,
        confirmation!,
      )
    ).toThrow(/lacks exact process provenance/);

    processBoundary.active = false;
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1(
        confirmation!.observerArtifact,
        processBoundary.reconciliationIdentityDigestHex,
        GENESIS_HEADER_ID,
        TX_ID,
        confirmation!,
      )
    ).toThrow(/not owned by the active mining action/);
  });

  it('accepts confirmation depth observed while both node tips advance', async () => {
    installCanonicalResponses({
      primaryFullHeights: [20, 21],
      witnessFullHeights: [20, 21],
      primaryConfirmations: 10,
      witnessConfirmations: 11,
    });
    const observer =
      createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
        processBoundary.target,
        GENESIS_HEADER_ID,
      );

    const confirmation = await observer.observe(
      TX_ID,
      processBoundary.target.primaryNodeOrigin,
    );

    expect(confirmation).toMatchObject({
      status: 'confirmed',
      confirmations: 10,
      observedAtHeight: 20,
      confirmationHeight: 10,
      confirmationHeaderIdHex: INCLUSION_HEADER_ID,
    });
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1(
        confirmation!.observerArtifact,
        processBoundary.reconciliationIdentityDigestHex,
        GENESIS_HEADER_ID,
        TX_ID,
        confirmation!,
      )
    ).not.toThrow();
  });

  it.each(['primary', 'witness'] as const)(
    'rejects %s node-height regression across one observation',
    async regressingRole => {
      installCanonicalResponses({
        primaryFullHeights: regressingRole === 'primary'
          ? [20, 19]
          : [20, 20],
        witnessFullHeights: regressingRole === 'witness'
          ? [20, 19]
          : [20, 20],
      });
      const observer =
        createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
          processBoundary.target,
          GENESIS_HEADER_ID,
        );

      await expect(observer.observe(
        TX_ID,
        processBoundary.target.primaryNodeOrigin,
      )).rejects.toThrow(/node height regressed during observation/);
    },
  );

  it('rejects confirmation artifact reuse against another genesis', async () => {
    installCanonicalResponses();
    const observer =
      createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
        processBoundary.target,
        GENESIS_HEADER_ID,
      );
    const confirmation = await observer.observe(
      TX_ID,
      processBoundary.target.primaryNodeOrigin,
    );

    expect(() =>
      assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1(
        confirmation!.observerArtifact,
        processBoundary.reconciliationIdentityDigestHex,
        'ff'.repeat(32),
        TX_ID,
        confirmation!,
      )
    ).toThrow(/lacks exact process provenance/);
  });

  it('reobserves the exact transaction through the artifact-owned observer', async () => {
    installCanonicalResponses();
    const observer =
      createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
        processBoundary.target,
        GENESIS_HEADER_ID,
      );
    const first = await observer.observe(
      TX_ID,
      processBoundary.target.primaryNodeOrigin,
    );
    const replacementHeaderId = '25'.repeat(32);
    installCanonicalResponses({
      fullHeight: 21,
      inclusionHeight: 11,
      inclusionHeaderId: replacementHeaderId,
    });

    const latest =
      await reobserveSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1({
        artifact: first!.observerArtifact,
        expectedReconciliationIdentityDigestHex:
          processBoundary.reconciliationIdentityDigestHex,
        expectedTargetGenesisHeaderIdHex: GENESIS_HEADER_ID,
        expectedTxId: TX_ID,
        priorConfirmation: first!,
      });

    expect(latest).toMatchObject({
      status: 'confirmed',
      observedAtHeight: 21,
      confirmationHeight: 11,
      confirmationHeaderIdHex: replacementHeaderId,
    });
    expect(latest.observerArtifact).not.toBe(first!.observerArtifact);
  });

  it('rejects a genuine pending artifact wrapped as a fabricated confirmation', async () => {
    installCanonicalResponses();
    rpc.primaryGet.mockImplementation(async (path: string) => {
      if (path === '/info') return { data: { network: 'devnet', fullHeight: 19 } };
      if (path === '/blocks/at/1') return { data: [GENESIS_HEADER_ID] };
      if (path === `/blockchain/transaction/byId/${TX_ID}`) {
        return { data: transaction(9) };
      }
      throw new Error(`unexpected primary path ${path}`);
    });
    rpc.witnessGet.mockImplementation(async (path: string) => {
      if (path === '/info') return { data: { network: 'devnet', fullHeight: 19 } };
      if (path === '/blocks/at/1') return { data: [GENESIS_HEADER_ID] };
      if (path === `/blockchain/transaction/byId/${TX_ID}`) {
        return { data: transaction(9) };
      }
      throw new Error(`unexpected witness path ${path}`);
    });
    const observer =
      createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
        processBoundary.target,
        GENESIS_HEADER_ID,
      );
    const pending = await observer.observe(
      TX_ID,
      processBoundary.target.primaryNodeOrigin,
    );
    expect(pending).toMatchObject({ status: 'pending', confirmations: 9 });
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1(
        pending!.observerArtifact,
        processBoundary.reconciliationIdentityDigestHex,
        GENESIS_HEADER_ID,
        TX_ID,
        pending!,
      )
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1(
        pending!.observerArtifact,
        processBoundary.reconciliationIdentityDigestHex,
        GENESIS_HEADER_ID,
        TX_ID,
        Object.freeze({
          ...pending!,
          status: 'confirmed' as const,
          confirmations: 10,
          confirmationHeight: 9,
          confirmationHeaderIdHex: INCLUSION_HEADER_ID,
        }),
      )
    ).toThrow(/fields differ from the observed artifact/);
  });

  it('rejects an inclusion-inclusive confirmation count', async () => {
    installCanonicalResponses();
    rpc.primaryGet.mockImplementation(async (path: string) => {
      if (path === '/info') return { data: { network: 'devnet', fullHeight: 20 } };
      if (path === '/blocks/at/1') return { data: [GENESIS_HEADER_ID] };
      if (path === `/blockchain/transaction/byId/${TX_ID}`) {
        return { data: transaction(11) };
      }
      throw new Error(`unexpected primary path ${path}`);
    });
    const observer =
      createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
        processBoundary.target,
        GENESIS_HEADER_ID,
      );

    await expect(observer.observe(TX_ID, processBoundary.target.primaryNodeOrigin))
      .rejects.toThrow(/primary confirmation depth is inconsistent/);
  });

  it('rejects a confirmation depth below the pre-observation height', async () => {
    installCanonicalResponses({
      primaryFullHeights: [21, 22],
      witnessFullHeights: [21, 22],
      primaryConfirmations: 10,
      witnessConfirmations: 10,
    });
    const observer =
      createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
        processBoundary.target,
        GENESIS_HEADER_ID,
      );

    await expect(observer.observe(TX_ID, processBoundary.target.primaryNodeOrigin))
      .rejects.toThrow(/primary confirmation depth is inconsistent/);
  });

  it('rejects cloned and expired process capabilities', async () => {
    installCanonicalResponses();
    expect(() =>
      createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
        { ...processBoundary.target },
        GENESIS_HEADER_ID,
      )
    ).toThrow(/not owned by the active mining action/);

    const observer =
      createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
        processBoundary.target,
        GENESIS_HEADER_ID,
      );
    processBoundary.active = false;
    await expect(observer.observe(TX_ID, processBoundary.target.primaryNodeOrigin))
      .rejects.toThrow(/not owned by the active mining action/);
  });

  it('fails closed when only one node observes the transaction', async () => {
    installCanonicalResponses();
    rpc.witnessGet.mockImplementation(async (path: string) => {
      if (path === '/info') return { data: { network: 'devnet', fullHeight: 19 } };
      if (path === '/blocks/at/1') return { data: [GENESIS_HEADER_ID] };
      if (path === `/blockchain/transaction/byId/${TX_ID}`) {
        throw { isAxiosError: true, response: { status: 404 } };
      }
      throw new Error(`unexpected witness path ${path}`);
    });
    const observer =
      createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
        processBoundary.target,
        GENESIS_HEADER_ID,
      );

    await expect(observer.observe(TX_ID, processBoundary.target.primaryNodeOrigin))
      .rejects.toThrow(/transaction observations disagree/);
  });

  it('rejects a canonical inclusion-header disagreement', async () => {
    installCanonicalResponses();
    rpc.witnessGet.mockImplementation(async (path: string) => {
      if (path === '/info') return { data: { network: 'devnet', fullHeight: 20 } };
      if (path === '/blocks/at/1') return { data: [GENESIS_HEADER_ID] };
      if (path === `/blockchain/transaction/byId/${TX_ID}`) {
        return { data: transaction(10) };
      }
      if (path === '/blocks/at/10') return { data: ['24'.repeat(32)] };
      throw new Error(`unexpected witness path ${path}`);
    });
    const observer =
      createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
        processBoundary.target,
        GENESIS_HEADER_ID,
      );

    await expect(observer.observe(TX_ID, processBoundary.target.primaryNodeOrigin))
      .rejects.toThrow(/not in its canonical inclusion header/);
  });
});

function installCanonicalResponses(
  input: Readonly<{
    fullHeight?: number;
    primaryFullHeights?: readonly [number, number];
    witnessFullHeights?: readonly [number, number];
    primaryConfirmations?: number;
    witnessConfirmations?: number;
    inclusionHeight?: number;
    inclusionHeaderId?: string;
  }> = {},
): void {
  const fullHeight = input.fullHeight ?? 20;
  const inclusionHeight = input.inclusionHeight ?? 10;
  const inclusionHeaderId = input.inclusionHeaderId ?? INCLUSION_HEADER_ID;
  const confirmations = fullHeight - inclusionHeight;
  const primaryFullHeights = input.primaryFullHeights
    ?? [fullHeight, fullHeight];
  const witnessFullHeights = input.witnessFullHeights
    ?? [fullHeight, fullHeight];
  let primaryInfoReads = 0;
  let witnessInfoReads = 0;
  rpc.primaryGet.mockImplementation(async (path: string) => {
    if (path === '/info') {
      return {
        data: {
          network: 'devnet',
          fullHeight: primaryFullHeights[Math.min(primaryInfoReads++, 1)],
        },
      };
    }
    if (path === '/blocks/at/1') return { data: [GENESIS_HEADER_ID] };
    if (path === `/blockchain/transaction/byId/${TX_ID}`) {
      return {
        data: transaction(
          input.primaryConfirmations ?? confirmations,
          inclusionHeight,
          inclusionHeaderId,
        ),
      };
    }
    if (path === `/blocks/at/${inclusionHeight}`) {
      return { data: [inclusionHeaderId] };
    }
    throw new Error(`unexpected primary path ${path}`);
  });
  rpc.witnessGet.mockImplementation(async (path: string) => {
    if (path === '/info') {
      return {
        data: {
          network: 'devnet',
          fullHeight: witnessFullHeights[Math.min(witnessInfoReads++, 1)],
        },
      };
    }
    if (path === '/blocks/at/1') return { data: [GENESIS_HEADER_ID] };
    if (path === `/blockchain/transaction/byId/${TX_ID}`) {
      return {
        data: transaction(
          input.witnessConfirmations ?? confirmations,
          inclusionHeight,
          inclusionHeaderId,
        ),
      };
    }
    if (path === `/blocks/at/${inclusionHeight}`) {
      return { data: [inclusionHeaderId] };
    }
    throw new Error(`unexpected witness path ${path}`);
  });
}

function transaction(
  confirmations: number,
  inclusionHeight = 10,
  headerId = INCLUSION_HEADER_ID,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    id: TX_ID,
    numConfirmations: confirmations,
    inclusionHeight,
    headerId,
  });
}
