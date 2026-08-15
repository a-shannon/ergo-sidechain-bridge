import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  encodeAvlTreeRegister,
} from './ergo-encoding.js';
import {
  encodeRuntimeBridgeCommitmentScaleHex,
} from './finalized-bridge-checkpoint.js';
import {
  buildSubstrateFederatedCheckpointProfileV1,
  buildSubstrateFederatedCheckpointStatementV1,
  type SubstrateFederatedCheckpointProfileV1,
  type SubstrateFederatedCheckpointProfileV1Input,
  type SubstrateFederatedCheckpointStatementV1,
  type SubstrateFederatedCheckpointStatementV1Input,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  buildSubstrateFederatedBurnSettlementV1FixtureInput,
  buildSubstrateFederatedBurnSettlementV1FixturePacket,
  getSubstrateFederatedSettlementFamilyV1FixtureIdentity,
} from './substrate-federated-burn-settlement-v1-fixture.js';
import type {
  SubstrateFederatedTrackerHistoryEntryV1,
} from './substrate-federated-burn-settlement-v1.js';
import {
  decodeSubstrateFederatedSettlementFamilyV1Profile,
  type SubstrateFederatedSettlementFamilyV1Identity,
} from './substrate-federated-settlement-family-v1.js';
import {
  assertSubstrateFederatedCheckpointTrackerProducerV1Provenance,
  collectSubstrateFederatedCheckpointTrackerProducerV1,
  consumeSubstrateFederatedCheckpointTrackerProducerV1,
  createSubstrateFederatedCheckpointTrackerSourceSetV1,
  recollectSubstrateFederatedCheckpointTrackerProducerV1,
  type SubstrateFederatedTrackerErgoSourceV1,
} from './substrate-federated-checkpoint-tracker-producer-v1.js';
import {
  ReadOnlySubstrateFinalityRpc,
  type SubstrateRpcTransport,
} from './substrate-finality-provider.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
  type Eip12OutputCandidate,
} from './unsigned-ergo-transaction.js';

interface TrackerVector {
  readonly input: {
    readonly profile: SubstrateFederatedCheckpointProfileV1Input;
    readonly statement: Omit<
      SubstrateFederatedCheckpointStatementV1Input,
      'profile'
    >;
  };
}

interface BaseFixture {
  readonly familyIdentity:
    Readonly<SubstrateFederatedSettlementFamilyV1Identity>;
  readonly checkpointProfile:
    Readonly<SubstrateFederatedCheckpointProfileV1>;
  readonly checkpointStatement:
    Readonly<SubstrateFederatedCheckpointStatementV1>;
  readonly trackerHistory:
    readonly SubstrateFederatedTrackerHistoryEntryV1[];
  readonly trackerBox: Eip12Box;
  readonly commitmentScaleHex: string;
  readonly anchorHeaderIdHex: string;
  readonly anchorHeaderHeight: number;
}

interface SubstrateViewOptions {
  readonly finalizedHeadHashHex?: string;
  readonly commitmentScaleHex?: string;
  readonly driftFinalizedHeadOnRecheck?: boolean;
  readonly driftCanonicalTargetOnRecheck?: boolean;
}

interface ErgoViewOptions {
  readonly trackerBox?: Eip12Box;
  readonly tipIdHex?: string;
  readonly tipHeight?: number;
  readonly canonicalAnchorIdsHex?: readonly string[];
  readonly anchorIsAncestor?: boolean;
  readonly missingHeaderAtHeight?: number;
  readonly wrongHeaderIdAtHeight?: number;
  readonly wrongHeaderHeightAtHeight?: number;
  readonly driftIntermediateHeaderAtHeight?: number;
}

const TRACKER_VECTOR = JSON.parse(readFileSync(
  new URL(
    '../test-vectors/substrate-federated-v1-tracker-admission.json',
    import.meta.url,
  ),
  'utf8',
)) as TrackerVector;
const FINALIZED_HEAD_HASH_HEX = '44'.repeat(32);
const FINALIZED_HEAD_HEIGHT = 2_500;
const ERGO_TIP_ID_HEX = '90'.repeat(32);
const ERGO_TIP_HEIGHT = 1_038;

let base: BaseFixture;

beforeAll(async () => {
  const familyIdentity =
    getSubstrateFederatedSettlementFamilyV1FixtureIdentity();
  const [settlementInput, settlementPacket] = await Promise.all([
    buildSubstrateFederatedBurnSettlementV1FixtureInput(),
    buildSubstrateFederatedBurnSettlementV1FixturePacket(),
  ]);
  const checkpointProfile = buildSubstrateFederatedCheckpointProfileV1(
    TRACKER_VECTOR.input.profile,
  );
  const checkpointStatement = buildSubstrateFederatedCheckpointStatementV1({
    profile: checkpointProfile,
    ...TRACKER_VECTOR.input.statement,
    bridgeEventRootHex:
      settlementPacket.tracker.decodedValue.bridgeEventRootHex,
    burnLeafCount: settlementPacket.tracker.decodedValue.burnLeafCount,
  });
  base = {
    familyIdentity,
    checkpointProfile,
    checkpointStatement,
    trackerHistory: settlementInput.trackerState.history,
    trackerBox: settlementInput.trackerState.dataInput,
    commitmentScaleHex: encodeRuntimeBridgeCommitmentScaleHex({
      sidechainIdHex: checkpointStatement.sidechainIdHex,
      sidechainHeight: checkpointStatement.sourceNativeBlockHeight,
      executionBlockHashHex: checkpointStatement.executionBlockHashHex,
      bridgeEventRootHex: checkpointStatement.bridgeEventRootHex,
      burnLeafCount: checkpointStatement.burnLeafCount,
    }),
    anchorHeaderIdHex:
      settlementPacket.tracker.decodedValue.anchorHeaderIdHex,
    anchorHeaderHeight:
      settlementPacket.tracker.decodedValue.anchorHeaderHeight,
  };
});

describe('substrate federated checkpoint/tracker producer V1', () => {
  it('collects one exact dual-source checkpoint and tracker view without authority', async () => {
    const result = await collect({});

    expect(result).toMatchObject({
      status: 'checkpoint_tracker_observed_non_authorizing',
      finalizedSourceState: {
        targetNativeBlockHashHex:
          base.checkpointStatement.sourceNativeBlockHashHex,
        targetNativeHeight:
          base.checkpointStatement.sourceNativeBlockHeight,
        reportedFinalizedHeadHashHex: FINALIZED_HEAD_HASH_HEX,
        reportedFinalizedHeadHeight: String(FINALIZED_HEAD_HEIGHT),
        bridgeEventRootHex: base.checkpointStatement.bridgeEventRootHex,
        burnLeafCount: base.checkpointStatement.burnLeafCount,
      },
      ergoTrackerState: {
        trackerBoxIdHex: base.trackerBox.boxId,
        trackerEntryKeyHex: base.trackerHistory[0].key,
        trackerEntryValueHex: base.trackerHistory[0].value,
        anchorHeaderIdHex: base.anchorHeaderIdHex,
        anchorHeaderHeight: base.anchorHeaderHeight,
        anchorDepth: ERGO_TIP_HEIGHT - base.anchorHeaderHeight,
        observedErgoTipIdHex: ERGO_TIP_ID_HEX,
        observedErgoTipHeight: ERGO_TIP_HEIGHT,
      },
      boundary: {
        readOnlyRpc: true,
        exactCheckpointCommitmentObserved: true,
        exactApplicationProfileBound: true,
        exactTrackerEntryBoundToTipDigest: true,
        anchorAncestryObservedByBothSources: true,
        matchingDistinctSubstrateSourceObservations: true,
        matchingDistinctErgoSourceObservations: true,
        stateProofCaptured: true,
        stateProofVerified: false,
        sourceFinalityCryptographicallyVerified: false,
        ergoConsensusCryptographicallyVerified: false,
        trackerAdmissionAuthorized: false,
        payoutAuthorized: false,
        signingAuthorized: false,
        submissionAuthorized: false,
        broadcastAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(result.trackerState.dataInput).toEqual(base.trackerBox);
    expect(result.trackerState.history).toEqual(base.trackerHistory);
    expect(Object.isFrozen(result)).toBe(true);
    expect(() =>
      assertSubstrateFederatedCheckpointTrackerProducerV1Provenance(result)
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedCheckpointTrackerProducerV1Provenance(
        structuredClone(result),
      )
    ).toThrow(/provenance is missing/i);
    consumeSubstrateFederatedCheckpointTrackerProducerV1(result);
    expect(() =>
      consumeSubstrateFederatedCheckpointTrackerProducerV1(result)
    ).toThrow(/already consumed/i);
  });

  it('recollects only through the original checkpoint and tracker ports', async () => {
    const initial = await collect({});
    const recollected =
      await recollectSubstrateFederatedCheckpointTrackerProducerV1(initial);

    expect(recollected.finalizedSourceState.stateObservationDigestHex).toBe(
      initial.finalizedSourceState.stateObservationDigestHex,
    );
    expect(recollected.ergoTrackerState.stateObservationDigestHex).toBe(
      initial.ergoTrackerState.stateObservationDigestHex,
    );
    expect(() => recollectSubstrateFederatedCheckpointTrackerProducerV1(
      structuredClone(initial),
    )).toThrow(/recollection provenance is missing|provenance is missing/i);
  });

  it('rejects copied source-set provenance and shared source transports', async () => {
    const sources = buildSources({});
    await expect(collect({ sources: structuredClone(sources) }))
      .rejects.toThrow(/source-set provenance is missing/i);

    const transport = new CheckpointFixtureTransport(
      'https://shared-source.example.test',
      {},
    );
    const rpc = new ReadOnlySubstrateFinalityRpc(transport);
    expect(() => createSubstrateFederatedCheckpointTrackerSourceSetV1({
      primarySubstrateRpc: rpc,
      witnessSubstrateRpc: rpc,
      primaryErgoSource: new TrackerErgoFixtureSource(
        'https://primary-ergo.example.test',
        {},
      ),
      witnessErgoSource: new TrackerErgoFixtureSource(
        'https://witness-ergo.example.test',
        {},
      ),
    })).toThrow(/distinct Substrate transports/i);
  });

  it('rejects a runtime commitment that differs from the exact statement', async () => {
    const exactCommitment = {
      sidechainIdHex: base.checkpointStatement.sidechainIdHex,
      sidechainHeight: base.checkpointStatement.sourceNativeBlockHeight,
      executionBlockHashHex: base.checkpointStatement.executionBlockHashHex,
      bridgeEventRootHex: base.checkpointStatement.bridgeEventRootHex,
      burnLeafCount: base.checkpointStatement.burnLeafCount,
    };
    const mutations = [
      { sidechainIdHex: 'fe'.repeat(32) },
      {
        sidechainHeight: (
          BigInt(exactCommitment.sidechainHeight) + 1n
        ).toString(),
      },
      { executionBlockHashHex: 'fd'.repeat(32) },
      { bridgeEventRootHex: 'fc'.repeat(32) },
      { burnLeafCount: exactCommitment.burnLeafCount + 1 },
    ];

    for (const mutation of mutations) {
      const mismatchedCommitment = encodeRuntimeBridgeCommitmentScaleHex({
        ...exactCommitment,
        ...mutation,
      });
      await expect(collect({
        primarySubstrate: { commitmentScaleHex: mismatchedCommitment },
        witnessSubstrate: { commitmentScaleHex: mismatchedCommitment },
      })).rejects.toThrow(/differs from the exact statement/i);
    }
  });

  it('rejects a checkpoint statement outside the exact settlement family', async () => {
    const checkpointStatement = buildSubstrateFederatedCheckpointStatementV1({
      profile: base.checkpointProfile,
      ...TRACKER_VECTOR.input.statement,
      bridgeAddressHex: 'aa'.repeat(20),
      bridgeEventRootHex: base.checkpointStatement.bridgeEventRootHex,
      burnLeafCount: base.checkpointStatement.burnLeafCount,
    });

    await expect(collect({ checkpointStatement }))
      .rejects.toThrow(/differs from the settlement-family profile/i);
  });

  it('rejects disagreement between individually valid Substrate views', async () => {
    await expect(collect({
      witnessSubstrate: { finalizedHeadHashHex: '45'.repeat(32) },
    })).rejects.toThrow(/sources disagree on the checkpoint state/i);
  });

  it('rejects finalized-head or canonical-target drift during collection', async () => {
    await expect(collect({
      primarySubstrate: { driftFinalizedHeadOnRecheck: true },
    })).rejects.toThrow(/source view changed during collection/i);

    await expect(collect({
      primarySubstrate: { driftCanonicalTargetOnRecheck: true },
    })).rejects.toThrow(/source view changed during collection/i);
  });

  it('rejects absent or duplicate tracker history before observing funds state', async () => {
    await expect(collect({ trackerHistory: [] }))
      .rejects.toThrow(/history must not be empty/i);
    await expect(collect({
      trackerHistory: new Array(16_386).fill(base.trackerHistory[0]),
    })).rejects.toThrow(/history exceeds 16385 entries/i);
    await expect(collect({
      trackerHistory: [
        ...base.trackerHistory,
        { ...base.trackerHistory[0] },
      ],
    })).rejects.toThrow(/duplicate keys/i);
  });

  it('rejects a canonical tracker singleton whose R5 differs from the history', async () => {
    const trackerBox = await rebox(base.trackerBox, {
      additionalRegisters: {
        ...base.trackerBox.additionalRegisters,
        R5: encodeAvlTreeRegister(Buffer.alloc(32, 0xff), 0x01, 370),
      },
    }, 'federated checkpoint tracker R5 mismatch');

    await expect(collect({
      primaryErgo: { trackerBox },
      witnessErgo: { trackerBox },
    })).rejects.toThrow(/tip digest differs from the supplied exact history/i);
  });

  it('rejects a noncanonical or insufficiently deep anchor', async () => {
    await expect(collect({
      primaryErgo: { canonicalAnchorIdsHex: ['ab'.repeat(32)] },
      witnessErgo: { canonicalAnchorIdsHex: ['ab'.repeat(32)] },
    })).rejects.toThrow(/anchor is not canonical/i);
    await expect(collect({
      primaryErgo: { tipHeight: base.anchorHeaderHeight + 8 },
      witnessErgo: { tipHeight: base.anchorHeaderHeight + 8 },
    })).rejects.toThrow(/anchor lacks required depth/i);
    await expect(collect({
      primaryErgo: { anchorIsAncestor: false },
      witnessErgo: { anchorIsAncestor: false },
    })).rejects.toThrow(/anchor is not an ancestor/i);
  });

  it('rejects a missing parent in the selected anchor ancestry', async () => {
    const missingHeight = base.anchorHeaderHeight + 4;
    await expect(collect({
      primaryErgo: { missingHeaderAtHeight: missingHeight },
      witnessErgo: { missingHeaderAtHeight: missingHeight },
    })).rejects.toThrow(/ancestry has a missing parent header/i);
  });

  it('rejects a parent whose ID differs from the selected ancestry', async () => {
    const driftHeight = base.anchorHeaderHeight + 4;
    await expect(collect({
      primaryErgo: { wrongHeaderIdAtHeight: driftHeight },
      witnessErgo: { wrongHeaderIdAtHeight: driftHeight },
    })).rejects.toThrow(/ancestry parent identity drifted/i);
  });

  it('rejects a parent whose height differs from the selected ancestry', async () => {
    const driftHeight = base.anchorHeaderHeight + 4;
    await expect(collect({
      primaryErgo: { wrongHeaderHeightAtHeight: driftHeight },
      witnessErgo: { wrongHeaderHeightAtHeight: driftHeight },
    })).rejects.toThrow(/ancestry parent identity drifted/i);
  });

  it('rejects an anchor ancestry deeper than the bounded walk', async () => {
    const oversizedTipHeight = base.anchorHeaderHeight + 16_385;
    await expect(collect({
      primaryErgo: { tipHeight: oversizedTipHeight },
      witnessErgo: { tipHeight: oversizedTipHeight },
    })).rejects.toThrow(/ancestry exceeds 16384 headers/i);
  });

  it('rejects witness-only drift in an intermediate ancestry header', async () => {
    await expect(collect({
      witnessErgo: {
        driftIntermediateHeaderAtHeight: base.anchorHeaderHeight + 4,
      },
    })).rejects.toThrow(/sources disagree on the tracker or anchor state/i);
  });

  it('rejects disagreement between individually valid Ergo tracker views', async () => {
    await expect(collect({
      witnessErgo: { tipIdHex: '91'.repeat(32) },
    })).rejects.toThrow(/sources disagree on the tracker or anchor state/i);
  });
});

async function collect(options: {
  readonly sources?: ReturnType<
    typeof createSubstrateFederatedCheckpointTrackerSourceSetV1
  >;
  readonly primarySubstrate?: SubstrateViewOptions;
  readonly witnessSubstrate?: SubstrateViewOptions;
  readonly primaryErgo?: ErgoViewOptions;
  readonly witnessErgo?: ErgoViewOptions;
  readonly trackerHistory?:
    readonly SubstrateFederatedTrackerHistoryEntryV1[];
  readonly checkpointStatement?:
    Readonly<SubstrateFederatedCheckpointStatementV1>;
}) {
  return collectSubstrateFederatedCheckpointTrackerProducerV1({
    sources: options.sources ?? buildSources(options),
    checkpointProfile: base.checkpointProfile,
    checkpointStatement:
      options.checkpointStatement ?? base.checkpointStatement,
    familyIdentity: base.familyIdentity,
    trackerHistory: options.trackerHistory ?? base.trackerHistory,
  });
}

function buildSources(options: {
  readonly primarySubstrate?: SubstrateViewOptions;
  readonly witnessSubstrate?: SubstrateViewOptions;
  readonly primaryErgo?: ErgoViewOptions;
  readonly witnessErgo?: ErgoViewOptions;
}) {
  return createSubstrateFederatedCheckpointTrackerSourceSetV1({
    primarySubstrateRpc: new ReadOnlySubstrateFinalityRpc(
      new CheckpointFixtureTransport(
        'https://primary-source.example.test',
        options.primarySubstrate ?? {},
      ),
    ),
    witnessSubstrateRpc: new ReadOnlySubstrateFinalityRpc(
      new CheckpointFixtureTransport(
        'https://witness-source.example.test',
        options.witnessSubstrate ?? {},
      ),
    ),
    primaryErgoSource: new TrackerErgoFixtureSource(
      'https://primary-ergo.example.test',
      options.primaryErgo ?? {},
    ),
    witnessErgoSource: new TrackerErgoFixtureSource(
      'https://witness-ergo.example.test',
      options.witnessErgo ?? {},
    ),
  });
}

class CheckpointFixtureTransport implements SubstrateRpcTransport {
  private finalizedHeadCalls = 0;
  private blockHashCalls = 0;

  constructor(
    readonly canonicalOrigin: string,
    private readonly options: SubstrateViewOptions,
  ) {}

  request<T = unknown>(
    method: string,
    params: readonly unknown[],
  ): Promise<T> {
    const finalizedHead = this.options.finalizedHeadHashHex
      ?? FINALIZED_HEAD_HASH_HEX;
    if (method === 'chain_getFinalizedHead') {
      this.finalizedHeadCalls += 1;
      const value = this.options.driftFinalizedHeadOnRecheck
        && this.finalizedHeadCalls > 1
        ? '46'.repeat(32)
        : finalizedHead;
      return Promise.resolve(`0x${value}` as T);
    }
    if (method === 'chain_getBlockHash') {
      this.blockHashCalls += 1;
      const value = this.options.driftCanonicalTargetOnRecheck
        && this.blockHashCalls > 1
        ? '47'.repeat(32)
        : base.checkpointStatement.sourceNativeBlockHashHex;
      return Promise.resolve(`0x${value}` as T);
    }
    if (method === 'chain_getHeader') {
      const requested = String(params[0]).replace(/^0x/i, '').toLowerCase();
      const isTarget = requested
        === base.checkpointStatement.sourceNativeBlockHashHex;
      return Promise.resolve({
        parentHash: `0x${isTarget ? '02'.repeat(32) : '43'.repeat(32)}`,
        number: `0x${(
          isTarget
            ? Number(base.checkpointStatement.sourceNativeBlockHeight)
            : FINALIZED_HEAD_HEIGHT
        ).toString(16)}`,
        stateRoot: `0x${isTarget ? '55'.repeat(32) : '56'.repeat(32)}`,
        extrinsicsRoot:
          `0x${isTarget ? '65'.repeat(32) : '66'.repeat(32)}`,
        digest: { logs: [] },
      } as T);
    }
    if (method === 'state_getStorage') {
      return Promise.resolve(
        `0x${this.options.commitmentScaleHex ?? base.commitmentScaleHex}` as T,
      );
    }
    if (method === 'state_getReadProof') {
      return Promise.resolve({
        at: params[1],
        proof: ['0x0102', '0x0304'],
      } as T);
    }
    return Promise.reject(new Error(`unexpected RPC method: ${method}`));
  }
}

class TrackerErgoFixtureSource
implements SubstrateFederatedTrackerErgoSourceV1 {
  private readonly trackerBox: Eip12Box;
  private readonly tipIdHex: string;
  private readonly tipHeight: number;
  private readonly canonicalAnchorIdsHex: readonly string[];
  private readonly anchorIsAncestor: boolean;

  constructor(
    readonly observationSourceId: string,
    private readonly options: ErgoViewOptions,
  ) {
    this.trackerBox = options.trackerBox ?? base.trackerBox;
    this.tipIdHex = options.tipIdHex ?? ERGO_TIP_ID_HEX;
    this.tipHeight = options.tipHeight ?? ERGO_TIP_HEIGHT;
    this.canonicalAnchorIdsHex = options.canonicalAnchorIdsHex
      ?? [base.anchorHeaderIdHex];
    this.anchorIsAncestor = options.anchorIsAncestor ?? true;
  }

  getIndexedHeight(): Promise<unknown> {
    return Promise.resolve({
      indexedHeight: this.tipHeight,
      fullHeight: this.tipHeight,
    });
  }

  getBestHeader(): Promise<unknown> {
    return Promise.resolve({
      id: this.tipIdHex,
      parentId: this.selectedHeaderIdAtHeight(this.tipHeight - 1),
      height: this.tipHeight,
      extensionRoot: '92'.repeat(32),
    });
  }

  getIndexedBoxesByTokenId(_tokenId: string): Promise<unknown[]> {
    return Promise.resolve([{
      ...this.trackerBox,
      inclusionHeight: base.anchorHeaderHeight,
      spentTransactionId: null,
      spendingProof: null,
    }]);
  }

  getBoxByIdOrNull(boxId: string): Promise<unknown | null> {
    return Promise.resolve(
      boxId === this.trackerBox.boxId ? this.trackerBox : null,
    );
  }

  getBlockHeaderById(headerId: string): Promise<unknown | null> {
    if (
      headerId === base.anchorHeaderIdHex
      && !this.anchorIsAncestor
    ) {
      return Promise.resolve({
        id: base.anchorHeaderIdHex,
        parentId: '0d'.repeat(32),
        height: base.anchorHeaderHeight,
        extensionRoot: '93'.repeat(32),
      });
    }
    for (
      let height = base.anchorHeaderHeight;
      height <= this.tipHeight;
      height += 1
    ) {
      if (headerId === this.selectedHeaderIdAtHeight(height)) {
        if (this.options.missingHeaderAtHeight === height) {
          return Promise.resolve(null);
        }
        return Promise.resolve({
          id: this.options.wrongHeaderIdAtHeight === height
            ? 'ef'.repeat(32)
            : headerId,
          parentId: height === base.anchorHeaderHeight
            ? '0d'.repeat(32)
            : this.selectedHeaderIdAtHeight(height - 1),
          height: this.options.wrongHeaderHeightAtHeight === height
            ? height + 1
            : height,
          extensionRoot: height === base.anchorHeaderHeight
            ? '93'.repeat(32)
            : this.options.driftIntermediateHeaderAtHeight === height
              ? '95'.repeat(32)
              : '94'.repeat(32),
        });
      }
    }
    return Promise.resolve(null);
  }

  getBlockHeaderIdsAtHeight(_height: number): Promise<string[]> {
    return Promise.resolve([...this.canonicalAnchorIdsHex]);
  }

  private selectedHeaderIdAtHeight(height: number): string {
    if (height === this.tipHeight) return this.tipIdHex;
    if (height === base.anchorHeaderHeight) {
      return this.anchorIsAncestor
        ? base.anchorHeaderIdHex
        : 'ac'.repeat(32);
    }
    return height.toString(16).padStart(64, '0');
  }
}

async function rebox(
  box: Eip12Box,
  changes: Partial<Eip12OutputCandidate>,
  label: string,
): Promise<Eip12Box> {
  const transaction = await materializeUnsignedTransaction({
    inputs: [{ ...box, extension: {} }],
    dataInputs: [],
    outputs: [{
      value: box.value,
      ergoTree: box.ergoTree,
      assets: box.assets,
      additionalRegisters: box.additionalRegisters,
      creationHeight: box.creationHeight,
      ...changes,
    }],
  }, label);
  return transaction.outputs[0];
}
