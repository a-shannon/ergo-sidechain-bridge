import { createHash } from 'crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  observeAuthenticatedSpvTrackerFromDistinctNodeOrigins,
  validateAuthenticatedSpvTrackerDualObservationReport,
  type AuthenticatedSpvTrackerDualObservationRequest,
  type AuthenticatedSpvTrackerNodeSourceFactory,
} from './authenticated-spv-tracker-dual-observation.js';
import type {
  AuthenticatedSpvTrackerNodeSource,
} from './authenticated-spv-tracker-read-only-node-client.js';
import { buildBridgeCheckpointCommitmentV1 } from './bridge-checkpoint-commitment.js';
import { deriveBridgeFinalityProgramIdHex } from './bridge-finality-proof.js';
import {
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
} from './ergo-encoding.js';
import {
  encodeAuthenticatedSpvTrackerAvlRegister,
  deriveAuthenticatedSpvTrackerKey,
  encodeAuthenticatedSpvTrackerValue,
  getAuthenticatedSpvTrackerDigest,
} from './spv-tracker-authenticated.js';

const SIDECHAIN_ID = '11'.repeat(32);
const TRACKER_NFT_ID = '12'.repeat(32);
const TRACKER_TREE = `1008cd02${'13'.repeat(32)}`;
const TRACKER_BOX_ID = '21'.repeat(32);
const TRACKER_TX_ID = '22'.repeat(32);
const BEST_HEADER_ID = '31'.repeat(32);
const FINALITY_ATTESTOR =
  '08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const OBSERVED_AT = '2026-07-14T12:00:00.000Z';

function request(overrides: Partial<AuthenticatedSpvTrackerDualObservationRequest> = {}) {
  return {
    environment: 'testnet',
    primaryNodeUrl: 'http://127.0.0.1:9053',
    witnessNodeUrl: 'http://127.0.0.1:9054',
    trackerNftIdHex: TRACKER_NFT_ID,
    trackerGenesisBoxIdHex: TRACKER_BOX_ID,
    trackerErgoTreeHex: TRACKER_TREE,
    sidechainIdHex: SIDECHAIN_ID,
    ...overrides,
  };
}

function emptyTrackerSource(options: {
  network?: string;
  bestHeaderId?: string;
  tipBoxId?: string;
} = {}): AuthenticatedSpvTrackerNodeSource {
  const tipBoxId = options.tipBoxId ?? TRACKER_BOX_ID;
  const box = {
    boxId: tipBoxId,
    transactionId: TRACKER_TX_ID,
    index: 0,
    inclusionHeight: 100,
    ergoTree: TRACKER_TREE,
    assets: [{ tokenId: TRACKER_NFT_ID, amount: 1 }],
    additionalRegisters: {
      R4: encodeLongRegister(0),
      R5: encodeAuthenticatedSpvTrackerAvlRegister(getAuthenticatedSpvTrackerDigest([])),
      R6: encodeCollByteRegister(Buffer.from(SIDECHAIN_ID, 'hex')),
      R7: encodeLongRegister(0),
      R8: encodeIntRegister(0),
      R9: FINALITY_ATTESTOR,
    },
    spentTransactionId: null,
    spendingProof: null,
  };
  return {
    getInfo: vi.fn(async () => ({ fullHeight: 120, network: options.network ?? 'testnet' })),
    getIndexedHeight: vi.fn(async () => ({ indexedHeight: 120, fullHeight: 120 })),
    getBestHeader: vi.fn(async () => ({
      id: options.bestHeaderId ?? BEST_HEADER_ID,
      parentId: '32'.repeat(32),
      height: 120,
      extensionHash: '33'.repeat(32),
    })),
    getIndexedBoxesByTokenId: vi.fn(async () => [box]),
    getTransaction: vi.fn(async () => null),
    getBlockHeaderById: vi.fn(async () => null),
    getBoxByIdOrNull: vi.fn(async (boxId: string) => boxId === tipBoxId ? box : null),
  };
}

function sourceFactory(
  primary: AuthenticatedSpvTrackerNodeSource = emptyTrackerSource(),
  witness: AuthenticatedSpvTrackerNodeSource = emptyTrackerSource(),
): AuthenticatedSpvTrackerNodeSourceFactory {
  return vi.fn((nodeUrl: string) => nodeUrl.endsWith(':9053') ? primary : witness);
}

function withCanonicalReportDigest<T extends { reportDigestHex: string }>(report: T): T {
  const { reportDigestHex: _discarded, ...withoutDigest } = report;
  report.reportDigestHex = createHash('sha256')
    .update(canonicalJson(withoutDigest), 'utf8')
    .digest('hex');
  return report;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => (
    `${JSON.stringify(key)}:${canonicalJson(object[key])}`
  )).join(',')}}`;
}

describe('authenticated tracker dual-source observation', () => {
  it('produces and validates a digest-bound report after exact two-source reconstruction', async () => {
    const primary = emptyTrackerSource();
    const witness = emptyTrackerSource();
    const factory = sourceFactory(primary, witness);
    const report = await observeAuthenticatedSpvTrackerFromDistinctNodeOrigins(request(), {
      createSource: factory,
      now: () => new Date(OBSERVED_AT),
    });

    expect(validateAuthenticatedSpvTrackerDualObservationReport(report)).toEqual(report);
    expect(report).toEqual(expect.objectContaining({
      status: 'AGREED',
      observedAt: OBSERVED_AT,
      sources: {
        primary: {
          role: 'primary',
          endpointOrigin: 'http://127.0.0.1:9053',
          network: 'testnet',
        },
        witness: {
          role: 'witness',
          endpointOrigin: 'http://127.0.0.1:9054',
          network: 'testnet',
        },
      },
      tracker: expect.objectContaining({
        nftIdHex: TRACKER_NFT_ID,
        genesisBoxIdHex: TRACKER_BOX_ID,
        finalityAttestorSigmaPropRegisterHex: FINALITY_ATTESTOR,
        sidechainIdHex: SIDECHAIN_ID,
        tipBoxIdHex: TRACKER_BOX_ID,
        tipDigestHex: getAuthenticatedSpvTrackerDigest([]),
        observedTip: {
          idHex: BEST_HEADER_ID,
          parentIdHex: '32'.repeat(32),
          height: 120,
          extensionRootHex: '33'.repeat(32),
        },
      }),
      entries: [],
      boundary: expect.objectContaining({
        readOnlyNodeRequestsOnly: true,
        independentNodeControlVerified: false,
        nodeAgreementProvesCanonicalConsensus: false,
        reportDigestAuthenticatesSource: false,
        observationDigestRecomputedFromReport: false,
        proofPayloadVerifiedByErgo: false,
        grandpaFinalityVerifiedByErgo: false,
        r9FinalityAuthority: true,
        gate5Closed: false,
      }),
    }));
    expect(report.reportDigestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(primary.getInfo).toHaveBeenCalledTimes(2);
    expect(witness.getInfo).toHaveBeenCalledTimes(2);
    expect(Object.values(report.authorization).every(value => value === false)).toBe(true);
  });

  it('rejects same-origin, credential-bearing, and path-bearing targets before source creation', async () => {
    const factory = sourceFactory();
    await expect(observeAuthenticatedSpvTrackerFromDistinctNodeOrigins(request({
      witnessNodeUrl: 'http://127.0.0.1:9053',
    }), { createSource: factory })).rejects.toThrow(/distinct node origins/i);
    await expect(observeAuthenticatedSpvTrackerFromDistinctNodeOrigins(request({
      primaryNodeUrl: 'http://user:pass@127.0.0.1:9053',
    }), { createSource: factory })).rejects.toThrow(/credentials/i);
    await expect(observeAuthenticatedSpvTrackerFromDistinctNodeOrigins(request({
      primaryNodeUrl: 'http://127.0.0.1:9053/node',
    }), { createSource: factory })).rejects.toThrow(/root origin/i);
    expect(factory).not.toHaveBeenCalled();
  });

  it('rejects mainnet, network disagreement, source reuse, and snapshot disagreement', async () => {
    await expect(observeAuthenticatedSpvTrackerFromDistinctNodeOrigins(request(), {
      createSource: sourceFactory(emptyTrackerSource({ network: 'mainnet' })),
    })).rejects.toThrow(/explicitly non-mainnet/i);

    await expect(observeAuthenticatedSpvTrackerFromDistinctNodeOrigins(request(), {
      createSource: sourceFactory(
        emptyTrackerSource({ network: 'testnet' }),
        emptyTrackerSource({ network: 'devnet' }),
      ),
    })).rejects.toThrow(/same non-mainnet network/i);

    await expect(observeAuthenticatedSpvTrackerFromDistinctNodeOrigins(request({
      environment: 'testnet',
    }), {
      createSource: sourceFactory(
        emptyTrackerSource({ network: 'devnet' }),
        emptyTrackerSource({ network: 'devnet' }),
      ),
    })).rejects.toThrow(/expected Ergo node network testnet does not match/i);

    const reused = emptyTrackerSource();
    await expect(observeAuthenticatedSpvTrackerFromDistinctNodeOrigins(request(), {
      createSource: () => reused,
    })).rejects.toThrow(/distinct source instances/i);

    await expect(observeAuthenticatedSpvTrackerFromDistinctNodeOrigins(request(), {
      createSource: sourceFactory(
        emptyTrackerSource(),
        emptyTrackerSource({ bestHeaderId: 'ff'.repeat(32) }),
      ),
    })).rejects.toThrow(/independent Ergo observations disagree/i);

    const driftingPrimary = emptyTrackerSource();
    const driftingWitness = emptyTrackerSource();
    (driftingPrimary.getInfo as any)
      .mockResolvedValueOnce({ network: 'testnet' })
      .mockResolvedValueOnce({ network: 'devnet' });
    (driftingWitness.getInfo as any)
      .mockResolvedValueOnce({ network: 'testnet' })
      .mockResolvedValueOnce({ network: 'devnet' });
    await expect(observeAuthenticatedSpvTrackerFromDistinctNodeOrigins(request(), {
      createSource: sourceFactory(driftingPrimary, driftingWitness),
    })).rejects.toThrow(/expected Ergo node network testnet does not match/i);
  });

  it('accepts the patched-devnet environment only with devnet node identities', async () => {
    const report = await observeAuthenticatedSpvTrackerFromDistinctNodeOrigins(request({
      environment: 'patched-devnet',
    }), {
      createSource: sourceFactory(
        emptyTrackerSource({ network: 'devnet' }),
        emptyTrackerSource({ network: 'devnet' }),
      ),
      now: () => new Date(OBSERVED_AT),
    });

    expect(report.environment).toBe('patched-devnet');
    expect(validateAuthenticatedSpvTrackerDualObservationReport(report)).toEqual(report);
  });

  it('requires the exact provisioned tracker genesis on both observations', async () => {
    await expect(observeAuthenticatedSpvTrackerFromDistinctNodeOrigins(request({
      trackerGenesisBoxIdHex: 'ff'.repeat(32),
    }), {
      createSource: sourceFactory(),
    })).rejects.toThrow(/expected genesis box/i);
  });

  it('binds every reported entry to its encoded checkpoint and derived commitment', async () => {
    const base = await observeAuthenticatedSpvTrackerFromDistinctNodeOrigins(request(), {
      createSource: sourceFactory(),
      now: () => new Date(OBSERVED_AT),
    });
    const checkpoint = buildBridgeCheckpointCommitmentV1({
      sidechainIdHex: SIDECHAIN_ID,
      sidechainHeight: 1_024,
      sidechainConsensusBlockHashHex: '41'.repeat(32),
      executionBlockHashHex: '42'.repeat(32),
      bridgeEventRootHex: '43'.repeat(32),
      burnLeafCount: 1,
      finalityAuthoritySetId: 7,
      finalityAuthoritySetHashHex: '44'.repeat(32),
      finalityProofHashHex: '45'.repeat(32),
    });
    const finality = {
      proofSystemId: 1 as const,
      statementDigestHex: '51'.repeat(32),
      programIdHex: deriveBridgeFinalityProgramIdHex(),
      verifierProfileIdHex: '52'.repeat(32),
      proofPayloadDigestHex: '53'.repeat(32),
      proofDigestHex: '54'.repeat(32),
    };
    const entry = {
      keyHex: deriveAuthenticatedSpvTrackerKey({
        sidechainIdHex: SIDECHAIN_ID,
        sidechainHeight: 1_024,
        executionBlockHashHex: checkpoint.checkpoint.executionBlockHashHex,
      }),
      valueHex: encodeAuthenticatedSpvTrackerValue({
        bridgeEventRootHex: checkpoint.checkpoint.bridgeEventRootHex,
        checkpointCommitmentHex: checkpoint.checkpointCommitmentHex,
        anchorHeaderIdHex: '55'.repeat(32),
        anchorHeaderHeight: 900,
        finalityProofSystemId: finality.proofSystemId,
        finalityStatementDigestHex: finality.statementDigestHex,
        finalityProgramIdHex: finality.programIdHex,
        finalityVerifierProfileIdHex: finality.verifierProfileIdHex,
        finalityProofPayloadDigestHex: finality.proofPayloadDigestHex,
        finalityProofDigestHex: finality.proofDigestHex,
      }),
      encodedCheckpointHex: checkpoint.encodedCheckpointHex,
      sidechainIdHex: SIDECHAIN_ID,
      sidechainHeight: '1024',
      executionBlockHashHex: checkpoint.checkpoint.executionBlockHashHex,
      bridgeEventRootHex: checkpoint.checkpoint.bridgeEventRootHex,
      checkpointCommitmentHex: checkpoint.checkpointCommitmentHex,
      anchorHeaderIdHex: '55'.repeat(32),
      anchorHeaderHeight: 900,
      finality,
    };
    const report = withCanonicalReportDigest(structuredClone(base) as any);
    report.entries = [entry];
    report.tracker.tipDigestHex = getAuthenticatedSpvTrackerDigest([{
      key: entry.keyHex,
      value: entry.valueHex,
    }]);
    withCanonicalReportDigest(report);
    expect(validateAuthenticatedSpvTrackerDualObservationReport(report)).toEqual(report);

    const otherCheckpoint = buildBridgeCheckpointCommitmentV1({
      ...checkpoint.checkpoint,
      executionBlockHashHex: 'ff'.repeat(32),
    });
    const tampered = structuredClone(report) as any;
    tampered.entries[0].encodedCheckpointHex = otherCheckpoint.encodedCheckpointHex;
    withCanonicalReportDigest(tampered);
    expect(() => validateAuthenticatedSpvTrackerDualObservationReport(tampered))
      .toThrow(/checkpoint execution block hash does not match/i);

    const disconnected = structuredClone(report) as any;
    disconnected.entries = [];
    withCanonicalReportDigest(disconnected);
    expect(() => validateAuthenticatedSpvTrackerDualObservationReport(disconnected))
      .toThrow(/do not reproduce the tracker tip digest/i);
  });

  it('rejects reworded authority claims and tampered content even when JSON remains well formed', async () => {
    const report = await observeAuthenticatedSpvTrackerFromDistinctNodeOrigins(request(), {
      createSource: sourceFactory(),
      now: () => new Date(OBSERVED_AT),
    });

    const unauthorized = structuredClone(report);
    unauthorized.authorization.broadcast = true as false;
    expect(() => validateAuthenticatedSpvTrackerDualObservationReport(unauthorized))
      .toThrow(/authorization\.broadcast must be false/i);

    const premature = structuredClone(report);
    premature.boundary.gate5Closed = true as false;
    expect(() => validateAuthenticatedSpvTrackerDualObservationReport(premature))
      .toThrow(/boundary\.gate5Closed must be false/i);

    const noncanonicalNetwork = structuredClone(report);
    noncanonicalNetwork.sources.primary.network = 'TESTNET';
    withCanonicalReportDigest(noncanonicalNetwork);
    expect(() => validateAuthenticatedSpvTrackerDualObservationReport(noncanonicalNetwork))
      .toThrow(/network must be canonical lowercase/i);

    const digestDrift = structuredClone(report);
    digestDrift.tracker.tipBoxIdHex = 'aa'.repeat(32);
    expect(() => validateAuthenticatedSpvTrackerDualObservationReport(digestDrift))
      .toThrow(/report digest/i);
  });
});
