import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  assertActiveTarget: vi.fn(),
  assertFrozenTarget: vi.fn(),
  assertFreshnessTarget: vi.fn(),
  assertReadOnlyTarget: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(),
  },
}));

vi.mock('./substrate-federated-isolated-devnet-ergo-node-process-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV1:
    mocked.assertActiveTarget,
  assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2:
    mocked.assertFrozenTarget,
  assertSubstrateFederatedIsolatedDevnetOwnedCheckpointTargetV1:
    mocked.assertReadOnlyTarget,
  assertSubstrateFederatedIsolatedDevnetOwnedTrackerReservationFreshnessTargetV1:
    mocked.assertFreshnessTarget,
}));

import { buildErgoExtensionMembershipProof } from './ergo-settlement-core/ergo-extension-membership.js';
import { computeErgoHeaderId } from './ergo-settlement-core/ergo-header-id.js';
import {
  assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1,
  assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV1,
  assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2,
  assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessObservationV1,
  observeSubstrateFederatedIsolatedDevnetCheckpointAnchorV1,
  observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV1,
  observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV2,
  observeSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessV1,
} from './substrate-federated-isolated-devnet-checkpoint-anchor-observer-v1.js';

const PRIMARY = 'http://127.0.0.1:9051';
const WITNESS = 'http://127.0.0.1:9052';
const GENESIS_ID_HEX = '01'.repeat(32);
const EXTENSION_VALUE_HEX = 'ab'.repeat(64);
const POW_DISTANCE_DECIMAL = '9007199254740993123456789';
const TARGET = Object.freeze({
  primaryNodeOrigin: PRIMARY,
  witnessNodeOrigin: WITNESS,
  miningStopped: true as const,
});
const ACTIVE_TARGET = Object.freeze({
  primaryNodeOrigin: PRIMARY,
  witnessNodeOrigin: WITNESS,
  primaryMining: true as const,
  witnessReadOnly: true as const,
  checkpointBound: true as const,
});
const FROZEN_TARGET = Object.freeze({
  primaryNodeOrigin: PRIMARY,
  witnessNodeOrigin: WITNESS,
  primaryMining: false as const,
  primaryReadOnly: true as const,
  witnessReadOnly: true as const,
  miningStopped: true as const,
  checkpointBound: true as const,
});
const FRESHNESS_TARGET = Object.freeze({
  ...FROZEN_TARGET,
  reservationFreshnessRevalidation: true as const,
});
const BINDING = Object.freeze({
  processBindingDigestHex: '11'.repeat(32),
  executionTargetIdentityDigestHex: '22'.repeat(32),
});

describe('isolated devnet checkpoint anchor observer V1', () => {
  let primary: NodeFixture;
  let witness: NodeFixture;
  let mutateResponse: ((
    path: string,
    response: MutableNodeResponse,
  ) => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    primary = nodeFixture();
    witness = structuredClone(primary);
    mutateResponse = undefined;
    mocked.assertActiveTarget.mockReturnValue(BINDING);
    mocked.assertFrozenTarget.mockReturnValue(BINDING);
    mocked.assertFreshnessTarget.mockReturnValue(BINDING);
    mocked.assertReadOnlyTarget.mockReturnValue(BINDING);
    vi.mocked(axios.create).mockImplementation(config => {
      const fixture = config?.baseURL === PRIMARY ? primary : witness;
      return {
        get: vi.fn(async (path: string) => {
          const response: MutableNodeResponse = {
            data: rawNodeJson(responseFor(fixture, path)),
            headers: {},
            status: 200,
          };
          mutateResponse?.(path, response);
          return response;
        }),
      } as any;
    });
  });

  it('binds exact canonical headers and 0x0401 membership across both nodes', async () => {
    const observed =
      await observeSubstrateFederatedIsolatedDevnetCheckpointAnchorV1({
        target: TARGET,
        targetGenesisHeaderIdHex: GENESIS_ID_HEX,
        expectedPriorHeaderIdHex: headerAt(primary, 18).id,
        expectedPriorHeight: 18,
        expectedExtensionValueHex: EXTENSION_VALUE_HEX,
      });

    expect(observed.extensionKeyHex).toBe('0401');
    expect(observed.extensionValueHex).toBe(EXTENSION_VALUE_HEX);
    expect(observed.anchorHeaderIdHex).toBe(primary.headers[0]!.id);
    expect(observed.anchorHeight).toBe(primary.fullHeight);
    expect(observed.priorHeaderIdHex).toBe(headerAt(primary, 18).id);
    expect(observed.priorHeight).toBe(18);
    expect(observed.headers).toHaveLength(10);
    expect(observed.headers[0]!.canonicalHeaderBytesHex)
      .toMatch(/^[0-9a-f]+$/u);
    expect(
      (observed.headers[0]!.raw.powSolutions as Record<string, unknown>).d,
    ).toBe(POW_DISTANCE_DECIMAL);
    expect(observed.boundaries).toEqual({
      primaryAndWitnessAgreed: true,
      miningStoppedDuringObservation: true,
      priorSnapshotAncestryEstablished: true,
      exactExtensionMembershipRecomputed: true,
      ergoPowAuthenticated: false,
      trackerAdmissionEstablished: false,
      signingPerformed: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
    });
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1(
        observed,
      )
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1(
        structuredClone(observed),
      )
    ).toThrow(/lacks exact process provenance/);
    expect(mocked.assertReadOnlyTarget).toHaveBeenCalledTimes(2);
    expect(axios.create).toHaveBeenCalledTimes(2);
    for (const [config] of vi.mocked(axios.create).mock.calls) {
      expect(config).toEqual(expect.objectContaining({
        responseType: 'arraybuffer',
        decompress: false,
        headers: expect.objectContaining({
          Accept: 'application/json',
          'Accept-Encoding': 'identity',
        }),
      }));
      const transforms = config?.transformResponse;
      expect(Array.isArray(transforms)).toBe(true);
      const raw = Buffer.from('{"d":9007199254740993123456789}', 'utf8');
      const [transform] = transforms as readonly unknown[];
      expect(typeof transform).toBe('function');
      expect((transform as (
        value: unknown,
        headers: unknown,
        status: number,
      ) => unknown)(raw, {}, 200)).toBe(raw);
    }
  });

  it('rejects an already-decoded string response body', async () => {
    mutateResponse = (path, response) => {
      if (path === '/info') {
        response.data = '{"network":"devnet","fullHeight":20}';
      }
    };
    await expect(observe()).rejects.toThrow(/body must remain raw bytes/);
  });

  it.each([
    ['absent', undefined],
    ['non-success', 500],
  ] as const)('rejects an %s HTTP status', async (_label, status) => {
    mutateResponse = (path, response) => {
      if (path === '/info') response.status = status;
    };
    await expect(observe()).rejects.toThrow(/failed with HTTP status/);
  });

  it('rejects a compressed response body', async () => {
    mutateResponse = (path, response) => {
      if (path === '/info') response.headers['content-encoding'] = 'gzip';
    };
    await expect(observe()).rejects.toThrow(/must use identity encoding/);
  });

  it('rejects a response body beyond the explicit byte bound', async () => {
    mutateResponse = (path, response) => {
      if (path === '/info') response.data = Buffer.alloc(512 * 1024 + 1);
    };
    await expect(observe()).rejects.toThrow(/exceeds the response byte bound/);
  });

  it('rejects a response body that is not canonical UTF-8', async () => {
    mutateResponse = (path, response) => {
      if (path === '/info') response.data = Buffer.from([0xc3, 0x28]);
    };
    await expect(observe()).rejects.toThrow(/must use canonical UTF-8/);
  });

  it('rejects dual-node disagreement before accepting membership', async () => {
    witness.extensionFields[1]![1] = 'cd'.repeat(64);
    await expect(observe()).rejects.toThrow(/observations disagree/);
  });

  it('rejects a different expected checkpoint value', async () => {
    await expect(observe('cd'.repeat(64)))
      .rejects.toThrow(/does not contain the exact 0x0401 value/);
  });

  it('rejects extension fields that do not reproduce the anchor root', async () => {
    const chain = headerChain('ef'.repeat(32));
    primary.headers = chain;
    witness.headers = structuredClone(chain);
    primary.block.header = primary.headers[0]!;
    witness.block.header = witness.headers[0]!;
    await expect(observe()).rejects.toThrow(/do not match the header root/);
  });

  it('rejects a canonical but discontinuous header window', async () => {
    const chain = headerChain(extensionRootHex(), true);
    primary.headers = chain;
    witness.headers = structuredClone(chain);
    primary.block.header = primary.headers[0]!;
    witness.block.header = witness.headers[0]!;
    await expect(observe()).rejects.toThrow(/lineage is broken/);
  });

  it('rejects a newest-first response that violates the Ergo Node API order', async () => {
    primary.lastHeadersNewestFirst = true;
    witness = structuredClone(primary);
    await expect(observe()).rejects.toThrow(/oldest-to-newest/);
  });

  it('rejects a header window that does not extend the exact prior snapshot', async () => {
    await expect(observe(EXTENSION_VALUE_HEX, 'ff'.repeat(32)))
      .rejects.toThrow(/does not extend the exact prior process snapshot/);
  });

  it('fetches the complete bounded ancestry when the prior snapshot is older than ten headers', async () => {
    primary = nodeFixture(5, 20);
    witness = structuredClone(primary);
    const observed =
      await observeSubstrateFederatedIsolatedDevnetCheckpointAnchorV1({
        target: TARGET,
        targetGenesisHeaderIdHex: GENESIS_ID_HEX,
        expectedPriorHeaderIdHex: headerAt(primary, 5).id,
        expectedPriorHeight: 5,
        expectedExtensionValueHex: EXTENSION_VALUE_HEX,
      });

    expect(observed.headers).toHaveLength(16);
    expect(observed.headers.at(-1)?.height).toBe(5);
  });

  it('rejects ancestry beyond the explicit observation bound', async () => {
    primary.fullHeight = 300;
    witness = structuredClone(primary);
    await expect(
      observeSubstrateFederatedIsolatedDevnetCheckpointAnchorV1({
        target: TARGET,
        targetGenesisHeaderIdHex: GENESIS_ID_HEX,
        expectedPriorHeaderIdHex: GENESIS_ID_HEX,
        expectedPriorHeight: 1,
        expectedExtensionValueHex: EXTENSION_VALUE_HEX,
      }),
    ).rejects.toThrow(/ancestry exceeds the explicit header bound/);
  });

  it('rejects process-binding drift across the network read', async () => {
    mocked.assertReadOnlyTarget
      .mockReturnValueOnce(BINDING)
      .mockReturnValueOnce({
        ...BINDING,
        processBindingDigestHex: '33'.repeat(32),
      });
    await expect(observe()).rejects.toThrow(/process binding changed/);
  });

  it('preserves the V1 active-target observation semantics', async () => {
    primary = nodeFixture(13, 22, 20);
    witness = structuredClone(primary);
    const anchor = primary.block.header;

    const observed =
      await observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV1({
        target: ACTIVE_TARGET,
        targetGenesisHeaderIdHex: GENESIS_ID_HEX,
        expectedAnchorHeaderIdHex: anchor.id,
        expectedAnchorHeight: anchor.height,
        expectedAnchorExtensionRootHex: anchor.extensionHash,
        expectedExtensionValueHex: EXTENSION_VALUE_HEX,
      });

    expect(observed.headers).toHaveLength(10);
    expect(observed.headers[0]!.height).toBe(22);
    expect(observed.anchorContextIndex).toBe(2);
    expect(observed.anchorHeaderIdHex).toBe(anchor.id);
    expect(observed.boundaries).toEqual({
      primaryAndWitnessAgreed: true,
      primaryMiningDuringObservation: true,
      checkpointBoundActiveTarget: true,
      exactCheckpointRetainedInCurrentContext: true,
      exactExtensionMembershipRecomputed: true,
      ergoPowAuthenticated: false,
      trackerAdmissionEstablished: false,
      signingPerformed: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
    });
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV1(
        observed,
      )
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV1(
        structuredClone(observed),
      )
    ).toThrow(/lacks exact process provenance/);
    expect(mocked.assertActiveTarget).toHaveBeenCalledTimes(2);
  });

  it('rebinds the retained anchor into the V2 frozen context', async () => {
    primary = nodeFixture(13, 22, 20);
    witness = structuredClone(primary);
    const anchor = primary.block.header;

    const observed =
      await observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV2({
        target: FROZEN_TARGET,
        targetGenesisHeaderIdHex: GENESIS_ID_HEX,
        expectedAnchorHeaderIdHex: anchor.id,
        expectedAnchorHeight: anchor.height,
        expectedAnchorExtensionRootHex: anchor.extensionHash,
        expectedExtensionValueHex: EXTENSION_VALUE_HEX,
      });

    expect(observed.boundaries).toMatchObject({
      primaryAndWitnessAgreed: true,
      miningStoppedDuringObservation: true,
      checkpointBoundFrozenTarget: true,
    });
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2(
        observed,
      )
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2(
        structuredClone(observed),
      )
    ).toThrow(/lacks exact process provenance/);
    expect(mocked.assertFrozenTarget).toHaveBeenCalledTimes(2);
  });

  it('rejects a frozen context that no longer retains the exact anchor', async () => {
    primary = nodeFixture(13, 22, 20);
    witness = structuredClone(primary);
    await expect(
      observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV2({
        target: FROZEN_TARGET,
        targetGenesisHeaderIdHex: GENESIS_ID_HEX,
        expectedAnchorHeaderIdHex: 'ff'.repeat(32),
        expectedAnchorHeight: 20,
        expectedAnchorExtensionRootHex: extensionRootHex(),
        expectedExtensionValueHex: EXTENSION_VALUE_HEX,
      }),
    ).rejects.toThrow(/does not retain the anchor/);
  });

  it('rejects frozen primary and witness tip disagreement', async () => {
    primary = nodeFixture(13, 22, 20);
    witness = structuredClone(primary);
    witness.fullHeight = 23;
    await expect(
      observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV2({
        target: FROZEN_TARGET,
        targetGenesisHeaderIdHex: GENESIS_ID_HEX,
        expectedAnchorHeaderIdHex: primary.block.header.id,
        expectedAnchorHeight: primary.block.header.height,
        expectedAnchorExtensionRootHex: primary.block.header.extensionHash,
        expectedExtensionValueHex: EXTENSION_VALUE_HEX,
      }),
    ).rejects.toThrow(/not contiguous oldest-to-newest|observations disagree/);
  });

  it('re-observes the exact anchor under the reservation-freshness target', async () => {
    primary = nodeFixture(13, 22, 20);
    witness = structuredClone(primary);
    const anchor = primary.block.header;

    const observed =
      await observeSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessV1({
        target: FRESHNESS_TARGET,
        targetGenesisHeaderIdHex: GENESIS_ID_HEX,
        expectedAnchorHeaderIdHex: anchor.id,
        expectedAnchorHeight: anchor.height,
        expectedAnchorExtensionRootHex: anchor.extensionHash,
        expectedExtensionValueHex: EXTENSION_VALUE_HEX,
      });

    expect(observed.schema).toBe(
      'e2s.substrate-federated-isolated-devnet-tracker-reservation-freshness-observation.v1',
    );
    expect(observed.anchorHeaderIdHex).toBe(anchor.id);
    expect(observed.extensionValueHex).toBe(EXTENSION_VALUE_HEX);
    expect(observed.boundaries).toEqual({
      primaryAndWitnessAgreed: true,
      miningStoppedDuringObservation: true,
      checkpointBoundReservationFreshnessTarget: true,
      exactCheckpointRetainedInCurrentContext: true,
      exactExtensionMembershipRecomputed: true,
      durableReservationBound: false,
      trackerInputRevalidated: false,
      jvmTransactionRechecked: false,
      ergoPowAuthenticated: false,
      signingPerformed: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
    });
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessObservationV1(
        observed,
      )
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessObservationV1(
        structuredClone(observed),
      )
    ).toThrow(/lacks exact process provenance/);
    expect(mocked.assertFreshnessTarget).toHaveBeenCalledTimes(2);
    expect(mocked.assertFrozenTarget).not.toHaveBeenCalled();
  });

  it('rejects the tracker-check target at the reservation-freshness boundary', async () => {
    primary = nodeFixture(13, 22, 20);
    witness = structuredClone(primary);
    const anchor = primary.block.header;

    await expect(
      observeSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessV1({
        target: FROZEN_TARGET as typeof FRESHNESS_TARGET,
        targetGenesisHeaderIdHex: GENESIS_ID_HEX,
        expectedAnchorHeaderIdHex: anchor.id,
        expectedAnchorHeight: anchor.height,
        expectedAnchorExtensionRootHex: anchor.extensionHash,
        expectedExtensionValueHex: EXTENSION_VALUE_HEX,
      }),
    ).rejects.toThrow(/dedicated frozen read-only target/);
    expect(mocked.assertFreshnessTarget).not.toHaveBeenCalled();
  });

  it('rejects reservation-freshness dual-node extension disagreement', async () => {
    primary = nodeFixture(13, 22, 20);
    witness = structuredClone(primary);
    witness.extensionFields[1]![1] = 'cd'.repeat(64);
    const anchor = primary.block.header;

    await expect(
      observeSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessV1({
        target: FRESHNESS_TARGET,
        targetGenesisHeaderIdHex: GENESIS_ID_HEX,
        expectedAnchorHeaderIdHex: anchor.id,
        expectedAnchorHeight: anchor.height,
        expectedAnchorExtensionRootHex: anchor.extensionHash,
        expectedExtensionValueHex: EXTENSION_VALUE_HEX,
      }),
    ).rejects.toThrow(/observations disagree/);
  });

  it('rejects reservation-freshness process-binding drift', async () => {
    primary = nodeFixture(13, 22, 20);
    witness = structuredClone(primary);
    const anchor = primary.block.header;
    mocked.assertFreshnessTarget
      .mockReturnValueOnce(BINDING)
      .mockReturnValueOnce({
        ...BINDING,
        processBindingDigestHex: '33'.repeat(32),
      });

    await expect(
      observeSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessV1({
        target: FRESHNESS_TARGET,
        targetGenesisHeaderIdHex: GENESIS_ID_HEX,
        expectedAnchorHeaderIdHex: anchor.id,
        expectedAnchorHeight: anchor.height,
        expectedAnchorExtensionRootHex: anchor.extensionHash,
        expectedExtensionValueHex: EXTENSION_VALUE_HEX,
      }),
    ).rejects.toThrow(/process binding changed during observation/);
  });

  async function observe(
    expectedExtensionValueHex = EXTENSION_VALUE_HEX,
    expectedPriorHeaderIdHex = headerAt(primary, 18).id,
  ) {
    return await observeSubstrateFederatedIsolatedDevnetCheckpointAnchorV1({
      target: TARGET,
      targetGenesisHeaderIdHex: GENESIS_ID_HEX,
      expectedPriorHeaderIdHex,
      expectedPriorHeight: 18,
      expectedExtensionValueHex,
    });
  }
});

interface NodeFixture {
  fullHeight: number;
  headers: RawHeader[];
  lastHeadersNewestFirst: boolean;
  extensionFields: string[][];
  block: { header: RawHeader; extension: { fields: string[][] } };
}

interface MutableNodeResponse {
  data: unknown;
  headers: Record<string, string>;
  status: number | undefined;
}

interface RawHeader extends Record<string, unknown> {
  id: string;
  parentId: string;
  height: number;
  extensionHash: string;
}

function nodeFixture(
  startHeight = 11,
  endHeight = 20,
  anchorHeight = endHeight,
): NodeFixture {
  const extensionFields = [
    ['0100', Buffer.from('side-field', 'ascii').toString('hex')],
    ['0401', EXTENSION_VALUE_HEX],
  ];
  const headers = headerChain(
    extensionRootHex(extensionFields),
    false,
    startHeight,
    endHeight,
    anchorHeight,
  );
  const anchorHeader = headers.find(header => header.height === anchorHeight);
  if (anchorHeader === undefined) {
    throw new Error(`missing fixture anchor header ${anchorHeight}`);
  }
  return {
    fullHeight: endHeight,
    headers,
    lastHeadersNewestFirst: false,
    extensionFields,
    block: {
      header: anchorHeader,
      extension: { fields: extensionFields },
    },
  };
}

function responseFor(fixture: NodeFixture, path: string): unknown {
  if (path === '/info') {
    return { network: 'devnet', fullHeight: fixture.fullHeight };
  }
  if (path === '/blocks/at/1') return [GENESIS_ID_HEX];
  const headerCountMatch = /^\/blocks\/lastHeaders\/(\d+)$/u.exec(path);
  if (headerCountMatch !== null) {
    const newestFirst = fixture.headers.slice(0, Number(headerCountMatch[1]));
    return fixture.lastHeadersNewestFirst
      ? newestFirst
      : [...newestFirst].reverse();
  }
  if (path === `/blocks/${fixture.block.header.id}`) return fixture.block;
  throw new Error(`unexpected checkpoint observer path: ${path}`);
}

function rawNodeJson(value: unknown): Buffer {
  const encoded = JSON.stringify(value).replaceAll(
    `\"d\":\"${POW_DISTANCE_DECIMAL}\"`,
    `\"d\":${POW_DISTANCE_DECIMAL}`,
  );
  return Buffer.from(encoded, 'utf8');
}

function headerAt(fixture: NodeFixture, height: number): RawHeader {
  const header = fixture.headers.find(candidate => candidate.height === height);
  if (header === undefined) throw new Error(`missing fixture header ${height}`);
  return header;
}

function extensionRootHex(fields = [
  ['0100', Buffer.from('side-field', 'ascii').toString('hex')],
  ['0401', EXTENSION_VALUE_HEX],
]): string {
  return buildErgoExtensionMembershipProof(
    fields.map(([keyHex, valueHex]) => ({
      key: Buffer.from(keyHex!, 'hex'),
      value: Buffer.from(valueHex!, 'hex'),
    })),
    Buffer.from('0401', 'hex'),
  ).root.toString('hex');
}

function headerChain(
  anchorExtensionRootHex: string,
  breakLatestParent = false,
  startHeight = 11,
  endHeight = 20,
  anchorHeight = endHeight,
): RawHeader[] {
  const ascending: RawHeader[] = [];
  let parentId = '40'.repeat(32);
  for (let height = startHeight; height <= endHeight; height += 1) {
    const extensionHash = height === anchorHeight
      ? anchorExtensionRootHex
      : Buffer.alloc(32, height).toString('hex');
    const effectiveParentId = height === endHeight && breakLatestParent
      ? 'fe'.repeat(32)
      : parentId;
    const identity = {
      version: 2,
      parentId: Buffer.from(effectiveParentId, 'hex'),
      adProofsRoot: Buffer.alloc(32, height + 1),
      stateRoot: Buffer.alloc(33, height + 2),
      transactionsRoot: Buffer.alloc(32, height + 3),
      timestamp: BigInt(1_700_000_000_000 + height),
      nBits: 0x01010000,
      height,
      extensionHash: Buffer.from(extensionHash, 'hex'),
      votes: Buffer.alloc(3),
      powSolution: {
        publicKey: Buffer.concat([
          Buffer.from([2]),
          Buffer.alloc(32, height + 4),
        ]),
        nonce: Buffer.alloc(8, height + 5),
      },
    };
    const id = computeErgoHeaderId(identity).toString('hex');
    ascending.push({
      id,
      version: identity.version,
      parentId: effectiveParentId,
      adProofsRoot: Buffer.from(identity.adProofsRoot).toString('hex'),
      stateRoot: Buffer.from(identity.stateRoot).toString('hex'),
      transactionsRoot: Buffer.from(identity.transactionsRoot).toString('hex'),
      timestamp: Number(identity.timestamp),
      nBits: identity.nBits,
      height,
      extensionHash,
      votes: Buffer.from(identity.votes).toString('hex'),
      powSolutions: {
        pk: Buffer.from(identity.powSolution.publicKey).toString('hex'),
        w: Buffer.concat([
          Buffer.from([2]),
          Buffer.alloc(32, height + 6),
        ]).toString('hex'),
        n: Buffer.from(identity.powSolution.nonce).toString('hex'),
        d: POW_DISTANCE_DECIMAL,
      },
    });
    parentId = id;
  }
  return ascending.reverse();
}
