import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

const replayPackets = vi.hoisted(() => new WeakSet<object>());

vi.mock(
  './validity-application-pooled-reserve-historical-replay-genesis-v4.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('./validity-application-pooled-reserve-historical-replay-genesis-v4.js')
    >();
    return {
      ...actual,
      assertValidityApplicationPooledReserveHistoricalReplayGenesisV4Provenance(
        value: unknown,
      ) {
        if (
          value === null
          || typeof value !== 'object'
          || !replayPackets.has(value)
        ) {
          throw new Error(
            'historical replay genesis was not built in this process',
          );
        }
      },
    };
  },
);

import { getDupTreeDigest } from './avl-bridge.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
} from './ergo-encoding.js';
import {
  buildValidityApplicationPooledReserveBurnSettlementV6,
} from './validity-application-pooled-reserve-burn-settlement-v6.js';
import {
  buildValidityApplicationPooledReserveBurnSettlementV6FixtureInput,
} from './validity-application-pooled-reserve-burn-settlement-v6-fixture.js';
import {
  buildValidityApplicationPooledReserveBurnFamilyV6CompilerFixtureInput,
} from './validity-application-pooled-reserve-burn-family-v6-fixture.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_REPLAY_CUTOVER_V6_SCHEMA,
  assertValidityApplicationPooledReserveReplayCutoverV6Provenance,
  buildValidityApplicationPooledReserveReplayCutoverV6,
  type BuildValidityApplicationPooledReserveReplayCutoverV6Input,
} from './validity-application-pooled-reserve-replay-cutover-v6.js';

const INSERT_ONLY_AVL_FLAGS = 0x01;

describe('pooled-reserve V6 global replay cutover', () => {
  it('rebinds the exact global V4 replay state into the V6 DUP singleton', async () => {
    const input = await fixture();
    const packet = await buildValidityApplicationPooledReserveReplayCutoverV6(
      input,
    );
    const expectedDigest = getDupTreeDigest([
      ...input.historicalReplayGenesis.duplicatePreventionGenesis
        .canonicalBurnIdsHex,
    ]);

    expect(packet.schema)
      .toBe(VALIDITY_APPLICATION_POOLED_RESERVE_REPLAY_CUTOVER_V6_SCHEMA);
    expect(packet.version).toBe(6);
    expect(packet.sourceReplay.canonicalBurnIdsHex).toEqual(
      input.historicalReplayGenesis.duplicatePreventionGenesis
        .canonicalBurnIdsHex,
    );
    expect(packet.sourceReplay).toMatchObject({
      sourceV4LineageProfileIdHex:
        input.compiledInstance.sourceRuntimeLineageProfileIdHex,
      canonicalBurnIdCount: 2,
      duplicatePreventionDigestHex: expectedDigest,
    });
    expect(packet.targetLineage).toMatchObject({
      lineageProfileIdHex: input.compiledInstance.lineageProfileIdHex,
      duplicatePreventionGenesisInputBoxIdHex:
        input.compiledInstance.genesis.duplicatePreventionInputBoxIdHex,
      duplicatePreventionNftIdHex:
        input.compiledInstance.genesis.duplicatePreventionNftIdHex,
      duplicatePreventionContractIdHex:
        input.compiledInstance.contracts.duplicatePrevention.receipt
          .contractIdHex,
    });
    expect(packet.registers).toEqual({
      R4: encodeCollByteRegister(Buffer.from(
        input.compiledInstance.lineageProfileIdHex,
        'hex',
      )),
      R5: encodeAvlTreeRegister(
        Buffer.from(expectedDigest, 'hex'),
        INSERT_ONLY_AVL_FLAGS,
        1,
      ),
    });
    expect(packet.duplicatePreventionBox).toMatchObject({
      boxId: packet.transaction.outputs[0]!.boxId,
      ergoTree:
        input.compiledInstance.contracts.duplicatePrevention.receipt
          .propositionHex,
      assets: [{
        tokenId: input.compiledInstance.genesis.duplicatePreventionNftIdHex,
        amount: '1',
      }],
      additionalRegisters: packet.registers,
    });
    expect(packet.invariants).toEqual({
      globalReplayPacketConsumed: true,
      sourceV4LineageMatched: true,
      targetV6LineageRebound: true,
      replayDigestPreserved: true,
      exactV6ContractAndSingletonBound: true,
      unsignedIssuanceOnly: true,
    });
    expect(Object.values(packet.boundaries).every(value => value === false))
      .toBe(true);
    expect(() =>
      assertValidityApplicationPooledReserveReplayCutoverV6Provenance(packet)
    ).not.toThrow();
    expect(() =>
      assertValidityApplicationPooledReserveReplayCutoverV6Provenance(
        structuredClone(packet),
      )
    ).toThrow(/not built in this process/);
  });

  it('feeds the imported replay state into the local V6 settlement constructor', async () => {
    const cutoverInput = await fixture();
    const cutover = await buildValidityApplicationPooledReserveReplayCutoverV6(
      cutoverInput,
    );
    const settlementInput =
      await buildValidityApplicationPooledReserveBurnSettlementV6FixtureInput();
    const settlement = await buildValidityApplicationPooledReserveBurnSettlementV6({
      ...settlementInput,
      duplicatePreventionState: {
        predecessor: cutover.duplicatePreventionBox,
        historyKeys: cutover.sourceReplay.canonicalBurnIdsHex,
      },
    });

    expect(settlement.duplicatePrevention.inputDigestHex)
      .toBe(cutover.sourceReplay.duplicatePreventionDigestHex);
    expect(settlement.invariants.duplicatePreventionInsertedOnce).toBe(true);
  });

  it('rejects settlement when the claimed burn was already imported', async () => {
    const settlementInput =
      await buildValidityApplicationPooledReserveBurnSettlementV6FixtureInput();
    const claimedBurnId = settlementInput.claim.burnLeaf.burnIdHex;
    const cutoverInput = await fixture([claimedBurnId]);
    const cutover = await buildValidityApplicationPooledReserveReplayCutoverV6(
      cutoverInput,
    );

    await expect(buildValidityApplicationPooledReserveBurnSettlementV6({
      ...settlementInput,
      duplicatePreventionState: {
        predecessor: cutover.duplicatePreventionBox,
        historyKeys: cutover.sourceReplay.canonicalBurnIdsHex,
      },
    })).rejects.toThrow(/already present in replay history/);
  });

  it('rejects a caller that omits an imported burn from the supplied history', async () => {
    const settlementInput =
      await buildValidityApplicationPooledReserveBurnSettlementV6FixtureInput();
    const cutoverInput = await fixture([
      settlementInput.claim.burnLeaf.burnIdHex,
    ]);
    const cutover = await buildValidityApplicationPooledReserveReplayCutoverV6(
      cutoverInput,
    );

    await expect(buildValidityApplicationPooledReserveBurnSettlementV6({
      ...settlementInput,
      duplicatePreventionState: {
        predecessor: cutover.duplicatePreventionBox,
        historyKeys: [],
      },
    })).rejects.toThrow(/duplicate-prevention identity or history digest mismatch/);
  });

  it('rejects source-lineage, replay-state, provenance and genesis drift', async () => {
    const base = await fixture();

    const wrongLineage = cloneReplay(base.historicalReplayGenesis);
    wrongLineage.lineage.lineageProfileIdHex = `0x${'91'.repeat(32)}`;
    refreshReplayRegisters(wrongLineage);
    replayPackets.add(wrongLineage);
    await expect(buildValidityApplicationPooledReserveReplayCutoverV6({
      ...base,
      historicalReplayGenesis: wrongLineage,
    })).rejects.toThrow(/exact V4 source runtime lineage/);

    const unsorted = cloneReplay(base.historicalReplayGenesis);
    unsorted.duplicatePreventionGenesis.canonicalBurnIdsHex.reverse();
    refreshReplayRegisters(unsorted);
    replayPackets.add(unsorted);
    await expect(buildValidityApplicationPooledReserveReplayCutoverV6({
      ...base,
      historicalReplayGenesis: unsorted,
    })).rejects.toThrow(/strictly sorted and unique/);

    const wrongDigest = cloneReplay(base.historicalReplayGenesis);
    wrongDigest.duplicatePreventionGenesis.digestHex = 'ff'.repeat(33);
    replayPackets.add(wrongDigest);
    await expect(buildValidityApplicationPooledReserveReplayCutoverV6({
      ...base,
      historicalReplayGenesis: wrongDigest,
    })).rejects.toThrow(/exact global V4 replay state/);

    await expect(buildValidityApplicationPooledReserveReplayCutoverV6({
      ...base,
      historicalReplayGenesis: cloneReplay(base.historicalReplayGenesis),
    })).rejects.toThrow(/not built in this process/);

    await expect(buildValidityApplicationPooledReserveReplayCutoverV6({
      ...base,
      compiledInstance: structuredClone(base.compiledInstance),
    })).rejects.toThrow(/not built from the reviewed compiler family/);

    await expect(buildValidityApplicationPooledReserveReplayCutoverV6({
      ...base,
      duplicatePreventionGenesisInputBox: {
        ...base.duplicatePreventionGenesisInputBox,
        boxId: '92'.repeat(32),
      },
    })).rejects.toThrow(/not a valid EIP-12 box|does not match the compiled lineage/);

    await expect(buildValidityApplicationPooledReserveReplayCutoverV6({
      ...base,
      duplicatePreventionGenesisInputBox: {
        ...base.duplicatePreventionGenesisInputBox,
        assets: [{ tokenId: '93'.repeat(32), amount: '1' }],
      },
    })).rejects.toThrow(/not a valid EIP-12 box|must be pure ERG/);
  });
});

async function fixture(
  burnIds = ['71'.repeat(32), '72'.repeat(32)],
): Promise<BuildValidityApplicationPooledReserveReplayCutoverV6Input> {
  const settlement =
    await buildValidityApplicationPooledReserveBurnSettlementV6FixtureInput();
  const compilerFixture =
    await buildValidityApplicationPooledReserveBurnFamilyV6CompilerFixtureInput();
  const canonicalBurnIdsHex = [...burnIds].map(value =>
    value.toLowerCase().replace(/^0x/, '')
  ).sort();
  const historicalReplayGenesis = replayPacket(
    settlement.compiledInstance.sourceRuntimeLineageProfileIdHex,
    canonicalBurnIdsHex,
  );
  replayPackets.add(historicalReplayGenesis);
  return {
    compiledInstance: settlement.compiledInstance,
    historicalReplayGenesis,
    duplicatePreventionGenesisInputBox:
      compilerFixture.genesis.duplicatePreventionInput,
    duplicatePreventionNanoErg: '10000000',
    creationHeight: 112,
  };
}

function replayPacket(
  sourceLineageProfileIdHex: string,
  canonicalBurnIdsHex: readonly string[],
): any {
  const digestHex = getDupTreeDigest([...canonicalBurnIdsHex]);
  return {
    packetDigestHex: sha256Hex(`packet:${canonicalBurnIdsHex.join(':')}`),
    lineage: {
      lineageProfileIdHex: `0x${sourceLineageProfileIdHex}`,
      encodedLineageProfileHex: `0x${'41'.repeat(64)}`,
    },
    observation: {
      cutoverObservationReportDigestHex:
        sha256Hex(`observation:${canonicalBurnIdsHex.join(':')}`),
    },
    duplicatePreventionGenesis: {
      canonicalBurnIdsHex: [...canonicalBurnIdsHex],
      digestHex,
      registers: {
        R4: encodeCollByteRegister(Buffer.from(
          sourceLineageProfileIdHex,
          'hex',
        )),
        R5: encodeAvlTreeRegister(
          Buffer.from(digestHex, 'hex'),
          INSERT_ONLY_AVL_FLAGS,
          1,
        ),
      },
    },
  };
}

function cloneReplay(packet: any): any {
  return structuredClone(packet);
}

function refreshReplayRegisters(packet: any): void {
  const sourceLineageProfileIdHex = packet.lineage.lineageProfileIdHex
    .replace(/^0x/, '');
  const digestHex = getDupTreeDigest([
    ...packet.duplicatePreventionGenesis.canonicalBurnIdsHex,
  ]);
  packet.duplicatePreventionGenesis.digestHex = digestHex;
  packet.duplicatePreventionGenesis.registers = {
    R4: encodeCollByteRegister(Buffer.from(
      sourceLineageProfileIdHex,
      'hex',
    )),
    R5: encodeAvlTreeRegister(
      Buffer.from(digestHex, 'hex'),
      INSERT_ONLY_AVL_FLAGS,
      1,
    ),
  };
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
