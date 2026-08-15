import { beforeAll, describe, expect, it } from 'vitest';

import {
  encodeCollByteRegister,
  encodeLongRegister,
} from './ergo-encoding.js';
import {
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';
import {
  buildSubstrateFederatedBurnSettlementV1FixturePacket,
  getSubstrateFederatedSettlementFamilyV1FixtureIdentity,
} from './substrate-federated-burn-settlement-v1-fixture.js';
import {
  assertSubstrateFederatedSettlementPredecessorProducerV1Provenance,
  collectSubstrateFederatedSettlementPredecessorProducerV1,
  consumeSubstrateFederatedSettlementPredecessorProducerV1,
  createSubstrateFederatedSettlementPredecessorSourceSetV1,
  getSubstrateFederatedSettlementPredecessorPacketBindingV1,
  recollectSubstrateFederatedSettlementPredecessorProducerV1,
  type SubstrateFederatedSettlementPredecessorErgoSourceV1,
} from './substrate-federated-settlement-predecessor-producer-v1.js';
import {
  decodeSubstrateFederatedSettlementFamilyV1Profile,
} from './substrate-federated-settlement-family-v1.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
  type Eip12OutputCandidate,
} from './unsigned-ergo-transaction.js';

const TIP_ID_HEX = '90'.repeat(32);
const TIP_HEIGHT = 1_038;
const INCLUSION_HEIGHT = 1_020;
const PACKET_BINDING_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_SETTLEMENT_PREDECESSOR_PACKET_V1';
const BOX_IDENTITY_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_SETTLEMENT_PREDECESSOR_BOX_V1';

type FamilyIdentity = ReturnType<
  typeof getSubstrateFederatedSettlementFamilyV1FixtureIdentity
>;
type SettlementPacket = Awaited<ReturnType<
  typeof buildSubstrateFederatedBurnSettlementV1FixturePacket
>>;

interface BaseFixture {
  readonly familyIdentity: FamilyIdentity;
  readonly packet: SettlementPacket;
  readonly reserveNftIdHex: string;
  readonly duplicatePreventionNftIdHex: string;
}

interface SourceOptions {
  readonly tipIdHex?: string;
  readonly tipHeight?: number;
  readonly driftTipOnRecheck?: boolean;
  readonly reserveBox?: Eip12Box;
  readonly duplicatePreventionBox?: Eip12Box;
  readonly feeFundingBox?: Eip12Box;
  readonly reserveIndexedBoxes?: readonly unknown[];
  readonly duplicatePreventionIndexedBoxes?: readonly unknown[];
  readonly missingCanonicalBoxIds?: readonly string[];
}

let base: BaseFixture;

beforeAll(async () => {
  const familyIdentity =
    getSubstrateFederatedSettlementFamilyV1FixtureIdentity();
  const packet = await buildSubstrateFederatedBurnSettlementV1FixturePacket();
  const profile = decodeSubstrateFederatedSettlementFamilyV1Profile(
    familyIdentity.profile,
  );
  base = {
    familyIdentity,
    packet,
    reserveNftIdHex: profile.pooledReserveNftIdHex,
    duplicatePreventionNftIdHex: profile.duplicatePreventionNftIdHex,
  };
});

describe('substrate federated settlement predecessor producer V1', () => {
  it('collects the exact current FED-3 inputs without authority', async () => {
    const result = await collect({});

    expect(result).toMatchObject({
      status: 'settlement_predecessors_observed_non_authorizing',
      familyIdHex: base.familyIdentity.profile.familyIdHex,
      settlementTransactionIdHex: base.packet.transaction.txId,
      settlementPacketBindingDigestHex:
        getSubstrateFederatedSettlementPredecessorPacketBindingV1(base.packet),
      predecessorState: {
        reserve: {
          boxIdHex: base.packet.boxes.reservePredecessor.boxId,
          indexedLineageBoxCount: 1,
        },
        duplicatePrevention: {
          boxIdHex:
            base.packet.boxes.duplicatePreventionPredecessor.boxId,
          indexedLineageBoxCount: 1,
        },
        feeFunding: {
          boxIdHex: base.packet.boxes.feeFundingInput.boxId,
        },
        observedErgoTipIdHex: TIP_ID_HEX,
        observedErgoTipHeight: TIP_HEIGHT,
      },
      boundary: {
        readShapedSourcePortUsed: true,
        exactReserveSingletonObserved: true,
        exactDuplicatePreventionSingletonObserved: true,
        exactExternalFeeUtxoObserved: true,
        exactSettlementPacketBound: true,
        stableIndexedTipObservedByBothSources: true,
        matchingDistinctErgoSourceObservations: true,
        producerPersistencePortUsed: false,
        sourceImplementationSideEffectsVerifiedAbsent: false,
        localObservationAuthoritative: false,
        ergoConsensusCryptographicallyVerified: false,
        predecessorFundsAuthorityEstablished: false,
        trackerAdmissionAuthorized: false,
        payoutAuthorized: false,
        checkPassed: false,
        signingAuthorized: false,
        submissionAuthorized: false,
        broadcastAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.predecessorState.reserve.box)).toBe(true);
    expect(() =>
      assertSubstrateFederatedSettlementPredecessorProducerV1Provenance(result)
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedSettlementPredecessorProducerV1Provenance(
        structuredClone(result),
      )
    ).toThrow(/producer provenance is missing/i);
    consumeSubstrateFederatedSettlementPredecessorProducerV1(result);
    expect(() =>
      consumeSubstrateFederatedSettlementPredecessorProducerV1(result)
    ).toThrow(/already consumed/i);
  });

  it('recollects the same process-owned sources into a fresh one-shot result', async () => {
    const first = await collect({});
    consumeSubstrateFederatedSettlementPredecessorProducerV1(first);

    const second = await recollectSubstrateFederatedSettlementPredecessorProducerV1(
      first,
    );

    expect(second).not.toBe(first);
    expect(second.predecessorState.stateObservationDigestHex).toBe(
      first.predecessorState.stateObservationDigestHex,
    );
    expect(() =>
      consumeSubstrateFederatedSettlementPredecessorProducerV1(second)
    ).not.toThrow();
  });

  it('binds the exact transaction and all three complete box identities', () => {
    const packet = base.packet;
    expect(getSubstrateFederatedSettlementPredecessorPacketBindingV1(packet))
      .toBe(sha256CanonicalJson({
        familyIdHex: packet.familyIdHex,
        settlementTransactionIdHex: packet.transaction.txId,
        reserveBoxIdentityDigestHex:
          testBoxIdentityDigest(packet.boxes.reservePredecessor),
        duplicatePreventionBoxIdentityDigestHex:
          testBoxIdentityDigest(packet.boxes.duplicatePreventionPredecessor),
        feeFundingBoxIdentityDigestHex:
          testBoxIdentityDigest(packet.boxes.feeFundingInput),
      }, PACKET_BINDING_DOMAIN));
  });

  it('rejects copied source provenance, shared objects, and shared origins', async () => {
    const sources = buildSources({});
    await expect(collect({ sources: structuredClone(sources) }))
      .rejects.toThrow(/source-set provenance is missing/i);

    const shared = new PredecessorFixtureSource(
      'https://shared-ergo.example.test',
      {},
    );
    expect(() => createSubstrateFederatedSettlementPredecessorSourceSetV1({
      primaryErgoSource: shared,
      witnessErgoSource: shared,
    })).toThrow(/distinct source objects/i);
    expect(() => createSubstrateFederatedSettlementPredecessorSourceSetV1({
      primaryErgoSource: new PredecessorFixtureSource(
        'https://shared-ergo.example.test',
        {},
      ),
      witnessErgoSource: new PredecessorFixtureSource(
        'https://shared-ergo.example.test/',
        {},
      ),
    })).toThrow(/distinct origins/i);
  });

  it('rejects a copied settlement packet before observing chain state', async () => {
    await expect(collect({
      packet: structuredClone(base.packet) as SettlementPacket,
    })).rejects.toThrow(/packet was not built in this process/i);
  });

  it('rejects missing, duplicate, or oversized singleton lineages', async () => {
    const alternateReserve = await rebox(
      base.packet.boxes.reservePredecessor,
      { creationHeight: base.packet.boxes.reservePredecessor.creationHeight + 1 },
      'alternate reserve singleton',
    );
    const duplicateUnspent = [
      indexed(base.packet.boxes.reservePredecessor),
      indexed(alternateReserve),
    ];
    const duplicateIds = [
      indexed(base.packet.boxes.reservePredecessor),
      {
        ...indexed(base.packet.boxes.reservePredecessor),
        spentTransactionId: 'a0'.repeat(32),
      },
    ];
    const oversized = new Array(16_386).fill(null).map((_, index) => ({
      ...indexed(base.packet.boxes.reservePredecessor),
      boxId: index.toString(16).padStart(64, '0'),
    }));

    for (const reserveIndexedBoxes of [[], duplicateUnspent, oversized]) {
      await expect(collect({
        primary: { reserveIndexedBoxes },
        witness: { reserveIndexedBoxes },
      })).rejects.toThrow(/reserve index must contain|one unspent singleton/i);
    }
    await expect(collect({
      primary: { reserveIndexedBoxes: duplicateIds },
      witness: { reserveIndexedBoxes: duplicateIds },
    })).rejects.toThrow(/reserve index contains duplicate boxes/i);
  });

  it('rejects a spending proof or future singleton height', async () => {
    const spendingProof = [{
      ...indexed(base.packet.boxes.reservePredecessor),
      spendingProof: { proofBytes: '00' },
    }];
    await expect(collect({
      primary: { reserveIndexedBoxes: spendingProof },
      witness: { reserveIndexedBoxes: spendingProof },
    })).rejects.toThrow(/unspent federated reserve tip has a spending proof/i);

    const future = [{
      ...indexed(base.packet.boxes.duplicatePreventionPredecessor),
      inclusionHeight: TIP_HEIGHT + 1,
    }];
    await expect(collect({
      primary: { duplicatePreventionIndexedBoxes: future },
      witness: { duplicatePreventionIndexedBoxes: future },
    })).rejects.toThrow(/duplicate-prevention singleton is ahead/i);
  });

  it('rejects spent reserve or DUP inputs and an absent fee input', async () => {
    const reserveSpent = [{
      ...indexed(base.packet.boxes.reservePredecessor),
      spentTransactionId: 'a1'.repeat(32),
    }];
    await expect(collect({
      primary: { reserveIndexedBoxes: reserveSpent },
      witness: { reserveIndexedBoxes: reserveSpent },
    })).rejects.toThrow(/reserve index must contain one unspent singleton/i);

    const dupSpent = [{
      ...indexed(base.packet.boxes.duplicatePreventionPredecessor),
      spentTransactionId: 'a2'.repeat(32),
    }];
    await expect(collect({
      primary: { duplicatePreventionIndexedBoxes: dupSpent },
      witness: { duplicatePreventionIndexedBoxes: dupSpent },
    })).rejects.toThrow(/duplicate-prevention index must contain one unspent singleton/i);

    const missingFee = [base.packet.boxes.feeFundingInput.boxId];
    await expect(collect({
      primary: { missingCanonicalBoxIds: missingFee },
      witness: { missingCanonicalBoxIds: missingFee },
    })).rejects.toThrow(/external-fee input is absent/i);
  });

  it('rejects a noncanonical reserve or DUP singleton', async () => {
    for (const missingCanonicalBoxIds of [[
      base.packet.boxes.reservePredecessor.boxId,
    ], [
      base.packet.boxes.duplicatePreventionPredecessor.boxId,
    ]]) {
      await expect(collect({
        primary: { missingCanonicalBoxIds },
        witness: { missingCanonicalBoxIds },
      })).rejects.toThrow(/singleton is absent from the UTXO set/i);
    }
  });

  it('rejects wrong contracts, NFTs, registers, and fee shape', async () => {
    const wrongReserveContract = await rebox(
      base.packet.boxes.reservePredecessor,
      { ergoTree: base.packet.boxes.feeFundingInput.ergoTree },
      'wrong reserve contract',
    );
    const wrongReserveNft = await rebox(
      base.packet.boxes.duplicatePreventionPredecessor,
      {
        ergoTree: base.packet.boxes.reservePredecessor.ergoTree,
        additionalRegisters:
          base.packet.boxes.reservePredecessor.additionalRegisters,
      },
      'wrong reserve NFT',
    );
    const wrongDupRegister = await rebox(
      base.packet.boxes.duplicatePreventionPredecessor,
      {
        additionalRegisters: {
          ...base.packet.boxes.duplicatePreventionPredecessor.additionalRegisters,
          R4: encodeCollByteRegister(Buffer.alloc(32, 0xff)),
        },
      },
      'wrong DUP register',
    );
    const tokenizedFee = await rebox(
      base.packet.boxes.duplicatePreventionPredecessor,
      {
        ergoTree: base.packet.boxes.feeFundingInput.ergoTree,
        additionalRegisters: {},
      },
      'tokenized fee input',
    );
    const wrongReserveAvl = await rebox(
      base.packet.boxes.reservePredecessor,
      {
        additionalRegisters: {
          ...base.packet.boxes.reservePredecessor.additionalRegisters,
          R5: base.packet.boxes.duplicatePreventionPredecessor
            .additionalRegisters.R5,
        },
      },
      'wrong reserve AVL profile',
    );
    const excessiveReserveLiability = await rebox(
      base.packet.boxes.reservePredecessor,
      {
        additionalRegisters: {
          ...base.packet.boxes.reservePredecessor.additionalRegisters,
          R6: encodeLongRegister(
            BigInt(base.packet.boxes.reservePredecessor.value) + 1n,
          ),
        },
      },
      'excessive reserve liability',
    );
    const wrongDupAvl = await rebox(
      base.packet.boxes.duplicatePreventionPredecessor,
      {
        additionalRegisters: {
          ...base.packet.boxes.duplicatePreventionPredecessor.additionalRegisters,
          R5: base.packet.boxes.reservePredecessor.additionalRegisters.R5,
        },
      },
      'wrong DUP AVL profile',
    );

    for (const mutation of [{ reserveBox: wrongReserveContract }, {
      reserveBox: wrongReserveNft,
    }, {
      reserveBox: wrongReserveAvl,
    }, {
      reserveBox: excessiveReserveLiability,
    }, {
      duplicatePreventionBox: wrongDupRegister,
    }, {
      duplicatePreventionBox: wrongDupAvl,
    }, {
      feeFundingBox: tokenizedFee,
    }]) {
      await expect(collect({
        primary: mutation,
        witness: mutation,
      })).rejects.toThrow(/identity is invalid|registers are invalid|not exact pure ERG/i);
    }
  });

  it('rejects each stable source box when its exact identity differs from the packet', async () => {
    for (const [role, box] of [
      ['reserveBox', base.packet.boxes.reservePredecessor],
      ['duplicatePreventionBox', base.packet.boxes.duplicatePreventionPredecessor],
      ['feeFundingBox', base.packet.boxes.feeFundingInput],
    ] as const) {
      const changed = await rebox(
        box,
        { creationHeight: box.creationHeight + 1 },
        `packet-drifted ${role}`,
      );
      await expect(collect({
        primary: { [role]: changed },
        witness: { [role]: changed },
      })).rejects.toThrow(/differs from the settlement packet/i);
    }
  });

  it('rejects a moving source view during collection', async () => {
    await expect(collect({
      primary: { driftTipOnRecheck: true },
    })).rejects.toThrow(/view changed during collection/i);
  });

  it('rejects disagreement between individually valid Ergo source views', async () => {
    await expect(collect({
      witness: { tipIdHex: '91'.repeat(32) },
    })).rejects.toThrow(/sources disagree on current state/i);
  });
});

function testBoxIdentityDigest(value: Readonly<Eip12Box>): string {
  return sha256CanonicalJson({
    boxId: value.boxId,
    value: value.value,
    ergoTree: value.ergoTree,
    assets: value.assets,
    additionalRegisters: value.additionalRegisters,
    creationHeight: value.creationHeight,
    transactionId: value.transactionId,
    index: value.index,
  }, BOX_IDENTITY_DOMAIN);
}

async function collect(options: {
  readonly sources?: ReturnType<
    typeof createSubstrateFederatedSettlementPredecessorSourceSetV1
  >;
  readonly packet?: SettlementPacket;
  readonly primary?: SourceOptions;
  readonly witness?: SourceOptions;
}) {
  return collectSubstrateFederatedSettlementPredecessorProducerV1({
    sources: options.sources ?? buildSources({
      primary: options.primary,
      witness: options.witness,
    }),
    familyIdentity: base.familyIdentity,
    settlementPacket: options.packet ?? base.packet,
  });
}

function buildSources(options: {
  readonly primary?: SourceOptions;
  readonly witness?: SourceOptions;
}) {
  return createSubstrateFederatedSettlementPredecessorSourceSetV1({
    primaryErgoSource: new PredecessorFixtureSource(
      'https://reserve-primary.example.test',
      options.primary ?? {},
    ),
    witnessErgoSource: new PredecessorFixtureSource(
      'https://reserve-witness.example.test',
      options.witness ?? {},
    ),
  });
}

class PredecessorFixtureSource
implements SubstrateFederatedSettlementPredecessorErgoSourceV1 {
  private bestHeaderCalls = 0;
  private readonly reserveBox: Eip12Box;
  private readonly duplicatePreventionBox: Eip12Box;
  private readonly feeFundingBox: Eip12Box;
  private readonly tipIdHex: string;
  private readonly tipHeight: number;

  constructor(
    readonly observationSourceId: string,
    private readonly options: SourceOptions,
  ) {
    this.reserveBox = options.reserveBox
      ?? base.packet.boxes.reservePredecessor;
    this.duplicatePreventionBox = options.duplicatePreventionBox
      ?? base.packet.boxes.duplicatePreventionPredecessor;
    this.feeFundingBox = options.feeFundingBox
      ?? base.packet.boxes.feeFundingInput;
    this.tipIdHex = options.tipIdHex ?? TIP_ID_HEX;
    this.tipHeight = options.tipHeight ?? TIP_HEIGHT;
  }

  getIndexedHeight(): Promise<unknown> {
    return Promise.resolve({
      indexedHeight: this.tipHeight,
      fullHeight: this.tipHeight,
    });
  }

  getBestHeader(): Promise<unknown> {
    this.bestHeaderCalls += 1;
    return Promise.resolve({
      id: this.options.driftTipOnRecheck && this.bestHeaderCalls > 1
        ? '92'.repeat(32)
        : this.tipIdHex,
      parentId: '8f'.repeat(32),
      height: this.tipHeight,
      extensionRoot: '93'.repeat(32),
    });
  }

  getIndexedBoxesByTokenId(tokenId: string): Promise<unknown[]> {
    if (tokenId === base.reserveNftIdHex) {
      return Promise.resolve([...(this.options.reserveIndexedBoxes ?? [
        indexed(this.reserveBox),
      ])]);
    }
    if (tokenId === base.duplicatePreventionNftIdHex) {
      return Promise.resolve([...(this.options.duplicatePreventionIndexedBoxes ?? [
        indexed(this.duplicatePreventionBox),
      ])]);
    }
    return Promise.resolve([]);
  }

  getBoxByIdOrNull(boxId: string): Promise<unknown | null> {
    if (this.options.missingCanonicalBoxIds?.includes(boxId)) {
      return Promise.resolve(null);
    }
    if (
      boxId === this.reserveBox.boxId
      || boxId === base.packet.boxes.reservePredecessor.boxId
    ) {
      return Promise.resolve(this.reserveBox);
    }
    if (
      boxId === this.duplicatePreventionBox.boxId
      || boxId === base.packet.boxes.duplicatePreventionPredecessor.boxId
    ) {
      return Promise.resolve(this.duplicatePreventionBox);
    }
    if (
      boxId === this.feeFundingBox.boxId
      || boxId === base.packet.boxes.feeFundingInput.boxId
    ) {
      return Promise.resolve(this.feeFundingBox);
    }
    return Promise.resolve(null);
  }
}

function indexed(box: Eip12Box) {
  return {
    ...box,
    inclusionHeight: INCLUSION_HEIGHT,
    spentTransactionId: null,
    spendingProof: null,
  };
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
