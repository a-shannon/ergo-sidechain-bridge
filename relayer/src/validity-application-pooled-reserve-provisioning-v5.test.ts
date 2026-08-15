import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import ts from 'typescript';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const historicalPackets = vi.hoisted(() => new WeakSet<object>());

vi.mock(
  './validity-application-pooled-reserve-historical-replay-genesis-v4.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import(
        './validity-application-pooled-reserve-historical-replay-genesis-v4.js'
      )
    >();
    return {
      ...actual,
      assertValidityApplicationPooledReserveHistoricalReplayGenesisV4Provenance(
        value: unknown,
      ) {
        if (
          value === null
          || typeof value !== 'object'
          || !historicalPackets.has(value)
        ) {
          throw new Error(
            'historical replay genesis was not built in this process',
          );
        }
      },
    };
  },
);

import {
  getDupTreeDigest,
  getPooledReserveEmptyDigest,
} from './avl-bridge.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_TRACKER_VALUE_V5_BYTES,
  getValidityApplicationPooledReserveTrackerDigestV5Hex,
} from './validity-application-pooled-reserve-burn-settlement-v5.js';
import {
  buildValidityApplicationPooledReserveBurnFamilyV5CompilerFixture,
  buildValidityApplicationPooledReserveBurnFamilyV5CompilerFixtureInput,
} from './validity-application-pooled-reserve-burn-family-v5-fixture.js';
import {
  buildValidityApplicationPooledReserveInstanceV5,
  type ValidityApplicationPooledReserveInstanceV5Candidate,
} from './validity-application-pooled-reserve-instance-v5.js';
import {
  assertValidityApplicationPooledReserveProvisioningV5Provenance,
  buildValidityApplicationPooledReserveProvisioningV5,
  type BuildValidityApplicationPooledReserveProvisioningV5Input,
} from './validity-application-pooled-reserve-provisioning-v5.js';
import type {
  Eip12Box,
  MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';

const BRIDGE_ROOT = resolve(import.meta.dirname, '..', '..');
const COMPILER_RECEIPT_JSON = readFileSync(resolve(
  BRIDGE_ROOT,
  'relayer',
  'test-vectors',
  'validity-application-pooled-reserve-compiler-v5.json',
), 'utf8');
const SOURCE_PATH = resolve(
  import.meta.dirname,
  'validity-application-pooled-reserve-provisioning-v5.ts',
);
const INSERT_ONLY_AVL_FLAGS = 0x01;

let compiled: Readonly<ValidityApplicationPooledReserveInstanceV5Candidate>;
let trackerGenesisInputBox: Eip12Box;
let duplicatePreventionGenesisInputBox: Eip12Box;
let settlementVaultGenesisInputBox: Eip12Box;

beforeAll(async () => {
  const [compilerRequest, fixtureInput] = await Promise.all([
    buildValidityApplicationPooledReserveBurnFamilyV5CompilerFixture(),
    buildValidityApplicationPooledReserveBurnFamilyV5CompilerFixtureInput(),
  ]);
  compiled = buildValidityApplicationPooledReserveInstanceV5({
    compilerRequest,
    compilerBatchJson: COMPILER_RECEIPT_JSON,
  });
  ({
    trackerInput: trackerGenesisInputBox,
    duplicatePreventionInput: duplicatePreventionGenesisInputBox,
    pooledReserveInput: settlementVaultGenesisInputBox,
  } = fixtureInput.genesis);
});

describe('validity application pooled-reserve provisioning V5', () => {
  it('builds one deterministic, network-bound unsigned plan', async () => {
    const first = await buildValidityApplicationPooledReserveProvisioningV5(
      buildInput(),
    );
    const second = await buildValidityApplicationPooledReserveProvisioningV5(
      buildInput(),
    );

    expect(second).toEqual(first);
    expect(first.targetNetwork).toEqual({
      ergoNetworkId: 'ergo-testnet',
      ergoAddressNetworkPrefix: 16,
      p2sAddressHeader: 19,
      ergoGenesisBlockIdHex: '66'.repeat(32),
      sourceNetworkIdHex: '11'.repeat(32),
      sidechainIdHex: '22'.repeat(32),
      settlementProfileIdHex: '55'.repeat(32),
    });
    expect(first.profile).toMatchObject({
      targetLineageProfileIdHex: compiled.lineageProfileIdHex,
      sourceRuntimeLineageProfileIdHex:
        compiled.sourceRuntimeLineageProfileIdHex,
      sourceRuntimeProfileIdHex: compiled.application.runtimeProfileIdHex,
      burnBindingDigestHex: compiled.application.burnBindingDigestHex,
    });
    expect(first.contracts).toEqual(Object.fromEntries(
      Object.entries(compiled.contracts).map(([role, contract]) => [role, {
        templateSha256Hex: contract.templateSha256Hex,
        resolvedSourceSha256Hex: contract.resolvedSourceSha256Hex,
        propositionSha256Hex: contract.receipt.propositionSha256Hex,
        contractIdHex: contract.receipt.contractIdHex,
      }]),
    ));
    expect(new Set(Object.values(first.transactions).map(tx => tx.txId)).size)
      .toBe(3);
    expect(Object.values(first.transactions).map(tx =>
      tx.eip12Tx.inputs[0]?.boxId
    )).toEqual([
      compiled.genesis.trackerInputBoxIdHex,
      compiled.genesis.duplicatePreventionInputBoxIdHex,
      compiled.genesis.settlementVaultInputBoxIdHex,
    ]);
    expect(first.lineage).toMatchObject({
      trackerGenesisInputBoxIdHex: compiled.genesis.trackerInputBoxIdHex,
      trackerNftIdHex: compiled.genesis.trackerNftIdHex,
      duplicatePreventionGenesisInputBoxIdHex:
        compiled.genesis.duplicatePreventionInputBoxIdHex,
      duplicatePreventionNftIdHex:
        compiled.genesis.duplicatePreventionNftIdHex,
      pooledReserveGenesisInputBoxIdHex:
        compiled.genesis.settlementVaultInputBoxIdHex,
      pooledReserveNftIdHex: compiled.genesis.settlementVaultNftIdHex,
      historicalReplayGenesisPacketDigestHex: '81'.repeat(32),
      cutoverObservationReportDigestHex: '82'.repeat(32),
      plannedCanonicalBurnIdsHex: [
        '71'.repeat(32),
        '72'.repeat(32),
      ],
      plannedCanonicalBurnIdCount: 2,
      plannedReplayDigestHex: getDupTreeDigest([
        '71'.repeat(32),
        '72'.repeat(32),
      ]),
    });
    expect(Object.values(first.invariants).every(Boolean)).toBe(true);
    expect(first.stages).toEqual({
      construction: 'unsigned-plan-complete',
      jvmCheck: 'not-performed',
      signing: 'not-authorized',
      submission: 'not-authorized',
      broadcastAuthorization: 'not-granted',
      confirmation: 'not-established',
    });
    expect(Object.values(first.boundaries).every(value => value === false))
      .toBe(true);
    expect(first.boundaries.targetNetworkIdentityAuthenticated).toBe(false);
    expect(first.boundaries.replayInventoryExhaustivenessAuthenticated)
      .toBe(false);
    expect(first.boundaries.legacyRoutesRetired).toBe(false);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.transactions.trackerIssuance.eip12Tx.inputs))
      .toBe(true);
    expect(() =>
      assertValidityApplicationPooledReserveProvisioningV5Provenance(first)
    ).not.toThrow();
    expect(() =>
      assertValidityApplicationPooledReserveProvisioningV5Provenance(
        structuredClone(first),
      )
    ).toThrow(/not built in this process/);
  });

  it('constructs the exact tracker, replay, and zero-liability reserve states', async () => {
    const plan = await buildValidityApplicationPooledReserveProvisioningV5(
      buildInput(),
    );
    const profileRegister = encodeCollByteRegister(Buffer.from(
      compiled.lineageProfileIdHex,
      'hex',
    ));
    const trackerRegisters = {
      R4: profileRegister,
      R5: encodeAvlTreeRegister(
        Buffer.from(
          getValidityApplicationPooledReserveTrackerDigestV5Hex([]),
          'hex',
        ),
        INSERT_ONLY_AVL_FLAGS,
        VALIDITY_APPLICATION_POOLED_RESERVE_TRACKER_VALUE_V5_BYTES,
      ),
      R6: encodeCollByteRegister(Buffer.from('22'.repeat(32), 'hex')),
      R7: encodeLongRegister(0),
      R8: encodeIntRegister(0),
      R9: encodeCollByteRegister(Buffer.from('aa'.repeat(32), 'hex')),
    };
    const dupRegisters = {
      R4: profileRegister,
      R5: encodeAvlTreeRegister(
        Buffer.from(getDupTreeDigest([
          '71'.repeat(32),
          '72'.repeat(32),
        ]), 'hex'),
        INSERT_ONLY_AVL_FLAGS,
        1,
      ),
    };
    const reserveRegisters = {
      R4: profileRegister,
      R5: encodeAvlTreeRegister(
        Buffer.from(getPooledReserveEmptyDigest(), 'hex'),
        INSERT_ONLY_AVL_FLAGS,
        32,
      ),
      R6: encodeLongRegister(0),
    };

    assertSingletonIssuance(
      plan.transactions.trackerIssuance,
      plan.boxes.tracker,
      compiled.genesis.trackerNftIdHex,
      compiled.contracts.tracker.receipt.propositionHex,
      trackerRegisters,
    );
    assertSingletonIssuance(
      plan.transactions.duplicatePreventionIssuance,
      plan.boxes.duplicatePrevention,
      compiled.genesis.duplicatePreventionNftIdHex,
      compiled.contracts.duplicatePrevention.receipt.propositionHex,
      dupRegisters,
    );
    assertSingletonIssuance(
      plan.transactions.pooledReserveIssuance,
      plan.boxes.pooledReserve,
      compiled.genesis.settlementVaultNftIdHex,
      compiled.contracts.pooledReserve.receipt.propositionHex,
      reserveRegisters,
    );
    expect(plan.pooledReserveGenesisSeedNanoErg).toBe('2000000');
  });

  it('rejects network, profile, provenance, and schema drift', async () => {
    const networkCases: readonly [string, unknown][] = [
      ['network', 'ergo-mainnet'],
      ['prefix', 0],
      ['genesis', '00'.repeat(32)],
      ['source', '91'.repeat(32)],
      ['sidechain', '92'.repeat(32)],
      ['settlement profile', '93'.repeat(32)],
    ];
    for (const [label, replacement] of networkCases) {
      const input = buildInput();
      const targetNetwork = { ...input.targetNetwork } as any;
      const field = {
        network: 'ergoNetworkId',
        prefix: 'ergoAddressNetworkPrefix',
        genesis: 'ergoGenesisBlockIdHex',
        source: 'sourceNetworkIdHex',
        sidechain: 'sidechainIdHex',
        'settlement profile': 'settlementProfileIdHex',
      }[label]!;
      targetNetwork[field] = replacement;
      await expect(buildValidityApplicationPooledReserveProvisioningV5({
        ...input,
        targetNetwork,
      })).rejects.toThrow(/testnet|nonzero|compiled settlement profile/);
    }

    await expect(buildValidityApplicationPooledReserveProvisioningV5({
      ...buildInput(),
      compiledInstance: structuredClone(compiled),
    })).rejects.toThrow(/not built from the reviewed compiler family/);
    const clonedReplay = structuredClone(buildInput().historicalReplayGenesis);
    await expect(buildValidityApplicationPooledReserveProvisioningV5({
      ...buildInput(),
      historicalReplayGenesis: clonedReplay,
    })).rejects.toThrow(/historical replay genesis was not built/);
    await expect(buildValidityApplicationPooledReserveProvisioningV5({
      ...buildInput(),
      targetNetwork: {
        ...buildInput().targetNetwork,
        authority: true,
      },
    } as unknown as BuildValidityApplicationPooledReserveProvisioningV5Input))
      .rejects.toThrow(/unknown or missing fields/);
  });

  it('digest-binds a supplied target genesis without authenticating it', async () => {
    const first = await buildValidityApplicationPooledReserveProvisioningV5(
      buildInput(),
    );
    const input = buildInput();
    const second = await buildValidityApplicationPooledReserveProvisioningV5({
      ...input,
      targetNetwork: {
        ...input.targetNetwork,
        ergoGenesisBlockIdHex: '67'.repeat(32),
      },
    });

    expect(second.planDigestHex).not.toBe(first.planDigestHex);
    expect(second.targetNetwork.ergoGenesisBlockIdHex).toBe('67'.repeat(32));
    expect(second.boundaries.targetNetworkIdentityAuthenticated).toBe(false);
  });

  it('rejects genesis, funding, and height drift before any later capability', async () => {
    await expect(buildValidityApplicationPooledReserveProvisioningV5({
      ...buildInput(),
      trackerGenesisInputBox: duplicatePreventionGenesisInputBox,
    })).rejects.toThrow(/does not match the compiled lineage/);
    await expect(buildValidityApplicationPooledReserveProvisioningV5({
      ...buildInput(),
      settlementVaultGenesisInputBox: {
        ...settlementVaultGenesisInputBox,
        assets: [{ tokenId: '94'.repeat(32), amount: '1' }],
      },
    })).rejects.toThrow(/valid EIP-12 box|pure ERG/);
    await expect(buildValidityApplicationPooledReserveProvisioningV5({
      ...buildInput(),
      values: {
        ...buildInput().values,
        pooledReserveNanoErg: '99000000',
      },
    })).rejects.toThrow(/underfunded/);
    await expect(buildValidityApplicationPooledReserveProvisioningV5({
      ...buildInput(),
      values: {
        ...buildInput().values,
        trackerNanoErg: '98000000',
      },
    })).rejects.toThrow(/dust output/);
    await expect(buildValidityApplicationPooledReserveProvisioningV5({
      ...buildInput(),
      fees: { trackerIssuanceNanoErg: 1.5 },
    })).rejects.toThrow(/exact integer/);
    await expect(buildValidityApplicationPooledReserveProvisioningV5({
      ...buildInput(),
      creationHeights: {
        ...buildInput().creationHeights,
        trackerIssuance: trackerGenesisInputBox.creationHeight - 1,
      },
    })).rejects.toThrow(/predates its genesis input/);
  });

  it('has an exact source-only static dependency closure', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');
    const sourceFile = ts.createSourceFile(
      SOURCE_PATH,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const imports: string[] = [];
    for (const statement of sourceFile.statements) {
      if (
        (ts.isImportDeclaration(statement)
          || ts.isExportDeclaration(statement))
        && statement.moduleSpecifier
      ) {
        expect(ts.isStringLiteral(statement.moduleSpecifier)).toBe(true);
        imports.push((statement.moduleSpecifier as ts.StringLiteral).text);
      }
      if (
        ts.isImportEqualsDeclaration(statement)
        && ts.isExternalModuleReference(statement.moduleReference)
        && statement.moduleReference.expression
      ) {
        expect(ts.isStringLiteral(statement.moduleReference.expression))
          .toBe(true);
        imports.push(
          (statement.moduleReference.expression as ts.StringLiteral).text,
        );
      }
    }
    imports.sort();
    expect(imports).toEqual([
      './avl-bridge.js',
      './ergo-encoding.js',
      './peg-in-pooled-reserve-lineage-profile-v4.js',
      './strict-json.js',
      './unsigned-ergo-transaction.js',
      './validity-application-pooled-reserve-burn-settlement-v5.js',
      './validity-application-pooled-reserve-historical-replay-genesis-v4.js',
      './validity-application-pooled-reserve-instance-v5.js',
      './validity-application-pooled-reserve-replay-cutover-v5.js',
    ]);

    const dynamicImports: ts.Node[] = [];
    const forbiddenIdentifiers: string[] = [];
    const forbidden = new Set([
      'Bun',
      'Deno',
      'WebSocket',
      'XMLHttpRequest',
      'fetch',
      'process',
      'require',
    ]);
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node)
        && node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        dynamicImports.push(node);
      }
      if (ts.isIdentifier(node) && forbidden.has(node.text)) {
        forbiddenIdentifiers.push(node.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    expect(dynamicImports).toEqual([]);
    expect(forbiddenIdentifiers).toEqual([]);
  });
});

function buildInput(): BuildValidityApplicationPooledReserveProvisioningV5Input {
  const historicalReplayGenesis = replayPacket([
    '71'.repeat(32),
    '72'.repeat(32),
  ]);
  historicalPackets.add(historicalReplayGenesis);
  return {
    compiledInstance: compiled,
    historicalReplayGenesis,
    targetNetwork: {
      ergoNetworkId: 'ergo-testnet',
      ergoAddressNetworkPrefix: 16,
      ergoGenesisBlockIdHex: '66'.repeat(32),
      sourceNetworkIdHex: '11'.repeat(32),
      sidechainIdHex: '22'.repeat(32),
      settlementProfileIdHex: '55'.repeat(32),
    },
    trackerGenesisInputBox,
    duplicatePreventionGenesisInputBox,
    settlementVaultGenesisInputBox,
    values: {
      trackerNanoErg: '2000000',
      duplicatePreventionNanoErg: '2000000',
      pooledReserveNanoErg: '2000000',
    },
    fees: {
      trackerIssuanceNanoErg: MINER_FEE,
      duplicatePreventionIssuanceNanoErg: MINER_FEE,
      pooledReserveIssuanceNanoErg: MINER_FEE,
    },
    creationHeights: {
      trackerIssuance: 112,
      duplicatePreventionIssuance: 112,
      pooledReserveIssuance: 112,
    },
  };
}

function replayPacket(canonicalBurnIdsHex: readonly string[]): any {
  const digestHex = getDupTreeDigest([...canonicalBurnIdsHex]);
  const sourceLineageProfileIdHex = compiled.sourceRuntimeLineageProfileIdHex;
  return {
    packetDigestHex: '81'.repeat(32),
    lineage: {
      lineageProfileIdHex: `0x${sourceLineageProfileIdHex}`,
      encodedLineageProfileHex: `0x${'41'.repeat(64)}`,
    },
    observation: {
      cutoverObservationReportDigestHex: '82'.repeat(32),
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

function assertSingletonIssuance(
  transaction: Readonly<MaterializedUnsignedTransaction>,
  box: Eip12Box,
  nftIdHex: string,
  propositionHex: string,
  registers: Record<string, string>,
): void {
  expect(transaction.eip12Tx.inputs).toHaveLength(1);
  expect(transaction.eip12Tx.inputs[0]).toMatchObject({
    boxId: nftIdHex,
    extension: {},
  });
  expect(transaction.eip12Tx.dataInputs).toEqual([]);
  expect(transaction.eip12Tx.outputs).toHaveLength(3);
  expect(transaction.eip12Tx.outputs[0]).toMatchObject({
    value: '2000000',
    ergoTree: propositionHex,
    assets: [{ tokenId: nftIdHex, amount: '1' }],
    additionalRegisters: registers,
    creationHeight: 112,
  });
  expect(transaction.eip12Tx.outputs[1]).toMatchObject({
    value: '96900000',
    assets: [],
    additionalRegisters: {},
    creationHeight: 112,
  });
  expect(transaction.eip12Tx.outputs[2]).toMatchObject({
    value: String(MINER_FEE),
    ergoTree: MINER_FEE_TREE,
    assets: [],
    additionalRegisters: {},
    creationHeight: 112,
  });
  expect(box).toMatchObject(transaction.outputs[0]!);
}
