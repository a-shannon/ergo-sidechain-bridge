import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  assertReadOnlyTarget: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(),
  },
}));

vi.mock('./substrate-federated-isolated-devnet-ergo-node-process-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetOwnedCheckpointTargetV1:
    mocked.assertReadOnlyTarget,
}));

import { buildErgoExtensionMembershipProof } from './ergo-settlement-core/ergo-extension-membership.js';
import { computeErgoHeaderId } from './ergo-settlement-core/ergo-header-id.js';
import {
  assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1,
  observeSubstrateFederatedIsolatedDevnetCheckpointAnchorV1,
} from './substrate-federated-isolated-devnet-checkpoint-anchor-observer-v1.js';

const PRIMARY = 'http://127.0.0.1:9051';
const WITNESS = 'http://127.0.0.1:9052';
const GENESIS_ID_HEX = '01'.repeat(32);
const EXTENSION_VALUE_HEX = 'ab'.repeat(64);
const TARGET = Object.freeze({
  primaryNodeOrigin: PRIMARY,
  witnessNodeOrigin: WITNESS,
  miningStopped: true as const,
});
const BINDING = Object.freeze({
  processBindingDigestHex: '11'.repeat(32),
  executionTargetIdentityDigestHex: '22'.repeat(32),
});

describe('isolated devnet checkpoint anchor observer V1', () => {
  let primary: NodeFixture;
  let witness: NodeFixture;

  beforeEach(() => {
    vi.clearAllMocks();
    primary = nodeFixture();
    witness = structuredClone(primary);
    mocked.assertReadOnlyTarget.mockReturnValue(BINDING);
    vi.mocked(axios.create).mockImplementation(config => {
      const fixture = config?.baseURL === PRIMARY ? primary : witness;
      return {
        get: vi.fn(async (path: string) => ({
          data: responseFor(fixture, path),
        })),
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

interface RawHeader extends Record<string, unknown> {
  id: string;
  parentId: string;
  height: number;
  extensionHash: string;
}

function nodeFixture(startHeight = 11, endHeight = 20): NodeFixture {
  const extensionFields = [
    ['0100', Buffer.from('side-field', 'ascii').toString('hex')],
    ['0401', EXTENSION_VALUE_HEX],
  ];
  const headers = headerChain(
    extensionRootHex(extensionFields),
    false,
    startHeight,
    endHeight,
  );
  return {
    fullHeight: endHeight,
    headers,
    lastHeadersNewestFirst: false,
    extensionFields,
    block: {
      header: headers[0]!,
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
  if (path === `/blocks/${fixture.headers[0]!.id}`) return fixture.block;
  throw new Error(`unexpected checkpoint observer path: ${path}`);
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
): RawHeader[] {
  const ascending: RawHeader[] = [];
  let parentId = '40'.repeat(32);
  for (let height = startHeight; height <= endHeight; height += 1) {
    const extensionHash = height === endHeight
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
        d: 0,
      },
    });
    parentId = id;
  }
  return ascending.reverse();
}
