import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    create: (config: Readonly<{ baseURL?: string }>) => ({
      get: config.baseURL === 'http://127.0.0.1:9051'
        ? rpc.primaryGet
        : rpc.witnessGet,
    }),
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
} from './substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js';

const GENESIS_HEADER_ID = '21'.repeat(32);
const TX_ID = '22'.repeat(32);
const INCLUSION_HEADER_ID = '23'.repeat(32);

beforeEach(() => {
  processBoundary.active = true;
  rpc.primaryGet.mockReset();
  rpc.witnessGet.mockReset();
});

describe('isolated devnet genesis confirmation observer V1', () => {
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
