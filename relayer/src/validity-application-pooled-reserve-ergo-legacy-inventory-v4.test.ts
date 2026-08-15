import { createECDH, createHash } from 'node:crypto';

import { Network } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { describe, expect, it, vi } from 'vitest';

const authenticatedReconstructions = vi.hoisted(() => new WeakSet<object>());
const replayImports = vi.hoisted(() => new WeakSet<object>());
const historicalDupPackets = vi.hoisted(() => new WeakSet<object>());

vi.mock('./authenticated-v2-cache-recovery.js', async importOriginal => ({
  ...await importOriginal<typeof import('./authenticated-v2-cache-recovery.js')>(),
  assertAuthenticatedV2ReadOnlyReconstructionProvenance: (value: unknown) => {
    if (
      value === null
      || typeof value !== 'object'
      || !authenticatedReconstructions.has(value)
    ) {
      throw new Error('authenticated V2 read-only reconstruction provenance is missing');
    }
  },
}));
vi.mock(
  './validity-application-pooled-reserve-authenticated-v2-replay-import-v4.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import(
        './validity-application-pooled-reserve-authenticated-v2-replay-import-v4.js'
      )
    >(),
    assertValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Packet:
      (value: unknown) => {
        if (
          value === null
          || typeof value !== 'object'
          || !replayImports.has(value)
        ) {
          throw new Error('authenticated V2 replay import provenance is missing');
        }
      },
  }),
);
vi.mock(
  './validity-application-pooled-reserve-historical-dup-lineage-v4.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import(
        './validity-application-pooled-reserve-historical-dup-lineage-v4.js'
      )
    >(),
    assertValidityApplicationPooledReserveHistoricalDupLineageV4Provenance:
      (value: unknown) => {
        if (
          value === null
          || typeof value !== 'object'
          || !historicalDupPackets.has(value)
        ) {
          throw new Error('historical DUP lineage reconstruction was not built in this process');
        }
      },
  }),
);

import {
  EMPTY_AVL_DIGEST,
  encodeAvlTreeRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
} from './ergo-encoding.js';
import {
  HISTORICAL_DUP_FAMILIES_V4,
} from './validity-application-pooled-reserve-historical-dup-lineage-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4,
} from './validity-application-pooled-reserve-cutover-candidate-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_INVENTORY_V4_STATUS,
  assertValidityApplicationPooledReserveErgoLegacyInventoryV4Packet,
  buildValidityApplicationPooledReserveErgoLegacyInventoryV4,
  validateValidityApplicationPooledReserveErgoLegacyInventoryV4Packet,
  type BuildValidityApplicationPooledReserveErgoLegacyInventoryV4Input,
} from './validity-application-pooled-reserve-ergo-legacy-inventory-v4.js';
import {
  buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4,
  type ValidityApplicationPooledReserveErgoLegacyRouteProfileV4,
} from './validity-application-pooled-reserve-ergo-legacy-route-profile-v4.js';

const importedWasm: any = await import('ergo-lib-wasm-nodejs');
const TEST_WASM = importedWasm.default ?? importedWasm;
const HEADER_ID = '91'.repeat(32);
const PARENT_ID = '92'.repeat(32);
const EXTENSION_ROOT = '93'.repeat(32);
const SNAPSHOT_HEIGHT = 100;
const PRIMARY_SOURCE_ID = 'https://primary.example.test';
const WITNESS_SOURCE_ID = 'https://witness.example.test';
const MCL_ROUTE = routeIdFor('contracts/MainChainLock.es');
const CAUSAL_LOCK_ROUTE = routeIdFor('contracts/MainChainLockCausalV2.es');
const TRACKER_ROUTE = routeIdFor('contracts/SPVTrackerAuthenticated.es');
const DUP_ROUTE = routeIdFor('contracts/DoubleUnlockPreventionAuthenticated.es');
const VAULT_ROUTE = routeIdFor('contracts/MainChainAggregateUnlockAuthenticated.es');

interface RouteBoxes {
  readonly indexed: any[];
  readonly current: any[];
}

function routeIdFor(sourceSurface: string): string {
  const requirement =
    VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4
      .find(candidate => candidate.sourceSurface === sourceSurface);
  if (requirement === undefined) throw new Error(`missing test route ${sourceSurface}`);
  return requirement.routeId;
}

function profile(
  options: {
    additionalAuthenticatedV2Generations?: boolean;
    omitTrackerSingletonIdentity?: boolean;
    fundedDupRouteId?: string;
  } = {},
) {
  const requirements =
    VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4
      .filter(requirement => requirement.layer === 'ergo');
  const routes = requirements.map((requirement, index) => {
    const ergoTreeHex = tree(index);
    const singleton = requirement.routeClass === 'tracker'
      || requirement.routeClass === 'duplicate-prevention'
      || requirement.routeClass === 'sidechain-state';
    const omitSingleton =
      options.omitTrackerSingletonIdentity
      && requirement.routeId === TRACKER_ROUTE;
    const instances = [{
      instanceId: `route-${String(index).padStart(2, '0')}`,
      address: ErgoAddress.fromErgoTree(
        ergoTreeHex,
        Network.Testnet,
      ).toString(),
      ergoTreeHex,
      ergoTreeSha256Hex: sha256Hex(
        Buffer.from(ergoTreeHex, 'hex'),
      ),
      singletonTokenIdHex: singleton && !omitSingleton
        ? byteHex(index + 1)
        : null,
      genesisBoxIdHex: singleton && !omitSingleton
        ? byteHex(index + 65)
        : null,
    }];
    if (
      options.additionalAuthenticatedV2Generations
      && (
        requirement.routeId === TRACKER_ROUTE
        || requirement.routeId === DUP_ROUTE
      )
    ) {
      const historicalIndex =
        requirements.length + (requirement.routeId === TRACKER_ROUTE ? 1 : 2);
      instances.push({
        instanceId: `historical-${String(index).padStart(2, '0')}`,
        address: ErgoAddress.fromErgoTree(
          ergoTreeHex,
          Network.Testnet,
        ).toString(),
        ergoTreeHex,
        ergoTreeSha256Hex: sha256Hex(
          Buffer.from(ergoTreeHex, 'hex'),
        ),
        singletonTokenIdHex: byteHex(historicalIndex + 1),
        genesisBoxIdHex: byteHex(historicalIndex + 65),
      });
    }
    return {
      routeId: requirement.routeId,
      sourceSurface: requirement.sourceSurface,
      requiredDisposition: requirement.requiredDisposition,
      instances,
    };
  });
  if (options.fundedDupRouteId !== undefined) {
    const route = routes.find(candidate =>
      candidate.routeId === options.fundedDupRouteId
    );
    if (route === undefined) throw new Error('missing funded DUP test route');
    const instance = route.instances[0]!;
    instance.genesisBoxIdHex = historicalDupGenesisBox(instance).boxId;
  }
  return buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4({
    network: {
      networkId: 'ergo-testnet',
      addressNetworkPrefix: 16,
    },
    reviewedSource: {
      sourceRevisionHex: 'a1'.repeat(20),
      basis: [{
        reference: 'repository://bridge/legacy-route-inventory-test',
        sha256Hex: 'a2'.repeat(32),
      }],
    },
    routes,
  });
}

function tree(index: number): string {
  const privateKey = Buffer.alloc(32);
  privateKey[31] = index + 1;
  const ecdh = createECDH('secp256k1');
  ecdh.setPrivateKey(privateKey);
  return `1008cd${ecdh.getPublicKey(undefined, 'compressed').toString('hex')}`;
}

function byteHex(value: number): string {
  return value.toString(16).padStart(2, '0').repeat(32);
}

function routeInstance(
  value: Readonly<ValidityApplicationPooledReserveErgoLegacyRouteProfileV4>,
  routeId: string,
) {
  const route = value.routes.find(candidate => candidate.routeId === routeId);
  if (route === undefined || route.instances.length === 0) {
    throw new Error(`test route ${routeId} has no exact instance`);
  }
  const instance = route.instances.find(candidate =>
    candidate.instanceId.startsWith('route-')
  );
  if (instance === undefined) {
    throw new Error(`test route ${routeId} has no current instance`);
  }
  return instance;
}

function materializeBox(input: {
  readonly transactionIdHex: string;
  readonly outputIndex: number;
  readonly ergoTreeHex: string;
  readonly valueNanoErg: number;
  readonly singletonTokenIdHex?: string;
  readonly registers?: Readonly<Record<string, string>>;
}): any {
  const value = TEST_WASM.BoxValue.from_i64(
    TEST_WASM.I64.from_str(String(input.valueNanoErg)),
  );
  const contract = TEST_WASM.Contract.new(
    TEST_WASM.ErgoTree.from_base16_bytes(input.ergoTreeHex),
  );
  const builder = new TEST_WASM.ErgoBoxCandidateBuilder(
    value,
    contract,
    90,
  );
  try {
    if (input.singletonTokenIdHex !== undefined) {
      builder.add_token(
        TEST_WASM.TokenId.from_str(input.singletonTokenIdHex),
        TEST_WASM.TokenAmount.from_i64(TEST_WASM.I64.from_str('1')),
      );
    }
    for (const [name, encoded] of Object.entries(input.registers ?? {})) {
      builder.set_register_value(
        TEST_WASM.NonMandatoryRegisterId[name],
        TEST_WASM.Constant.decode_from_base16(encoded),
      );
    }
    const candidate = builder.build();
    const transactionId = TEST_WASM.TxId.from_str(input.transactionIdHex);
    const box = TEST_WASM.ErgoBox.from_box_candidate(
      candidate,
      transactionId,
      input.outputIndex,
    );
    try {
      return box.to_js_eip12();
    } finally {
      box.free?.();
      transactionId.free?.();
      candidate.free?.();
    }
  } finally {
    builder.free?.();
  }
}

function historicalDupGenesisBox(input: {
  readonly ergoTreeHex: string;
  readonly singletonTokenIdHex: string | null;
}): any {
  if (input.singletonTokenIdHex === null) {
    throw new Error('historical DUP test instance lacks singleton identity');
  }
  return materializeBox({
    transactionIdHex: '51'.repeat(32),
    outputIndex: 0,
    ergoTreeHex: input.ergoTreeHex,
    valueNanoErg: 300_000_000,
    singletonTokenIdHex: input.singletonTokenIdHex,
    registers: {
      R4: encodeLongRegister(0),
      R5: encodeAvlTreeRegister(Buffer.from(EMPTY_AVL_DIGEST, 'hex'), 0x0b, 1),
      R6: encodeSigmaPropRegister(tree(31).slice('1008cd'.length)),
    },
  });
}

function routeBoxes(
  profileValue: Readonly<ValidityApplicationPooledReserveErgoLegacyRouteProfileV4>,
  options: {
    authenticatedV2?: boolean;
    historicalDupRouteId?: string;
  } = {},
): Map<string, RouteBoxes> {
  const result = new Map<string, RouteBoxes>();
  for (const route of profileValue.routes) {
    for (const instance of route.instances) {
      result.set(instance.address, { indexed: [], current: [] });
    }
  }
  const fundedInstance = routeInstance(profileValue, MCL_ROUTE);
  const funded = materializeBox({
    transactionIdHex: '11'.repeat(32),
    outputIndex: 0,
    ergoTreeHex: fundedInstance.ergoTreeHex,
    valueNanoErg: 500_000_000,
  });
  result.set(fundedInstance.address, {
    indexed: [{ ...structuredClone(funded), spentTransactionId: null }],
    current: [structuredClone(funded)],
  });

  const drainedInstance = routeInstance(profileValue, CAUSAL_LOCK_ROUTE);
  const drained = materializeBox({
    transactionIdHex: '12'.repeat(32),
    outputIndex: 0,
    ergoTreeHex: drainedInstance.ergoTreeHex,
    valueNanoErg: 600_000_000,
  });
  result.set(drainedInstance.address, {
    indexed: [{
      ...structuredClone(drained),
      spentTransactionId: '13'.repeat(32),
    }],
    current: [],
  });

  if (options.historicalDupRouteId !== undefined) {
    const instance = routeInstance(profileValue, options.historicalDupRouteId);
    const box = historicalDupGenesisBox(instance);
    if (box.boxId !== instance.genesisBoxIdHex) {
      throw new Error('historical DUP test genesis differs from profile');
    }
    result.set(instance.address, {
      indexed: [{ ...structuredClone(box), spentTransactionId: null }],
      current: [structuredClone(box)],
    });
  }

  if (options.authenticatedV2) {
    for (const [routeId, transactionByte] of [
      [TRACKER_ROUTE, 0x21],
      [DUP_ROUTE, 0x22],
      [VAULT_ROUTE, 0x23],
    ] as const) {
      const instance = routeInstance(profileValue, routeId);
      if (routeId === options.historicalDupRouteId) continue;
      const box = materializeBox({
        transactionIdHex: byteHex(transactionByte),
        outputIndex: 0,
        ergoTreeHex: instance.ergoTreeHex,
        valueNanoErg: 300_000_000,
        singletonTokenIdHex: instance.singletonTokenIdHex ?? undefined,
      });
      result.set(instance.address, {
        indexed: [{ ...structuredClone(box), spentTransactionId: null }],
        current: [structuredClone(box)],
      });
    }
  }
  return result;
}

function source(
  sourceId: string,
  boxesByAddress: Map<string, RouteBoxes>,
  options: {
    readonly failAddress?: string;
    readonly binaryMismatchAddress?: string;
    readonly driftSnapshot?: boolean;
  } = {},
): BuildValidityApplicationPooledReserveErgoLegacyInventoryV4Input[
  'primarySource'
] {
  let snapshotReads = 0;
  const allCurrent = () => [...boxesByAddress.entries()].flatMap(
    ([address, entry]) =>
      entry.current.map(box => ({ address, box })),
  );
  return {
    observationSourceId: sourceId,
    beginAuthenticatedTrackerReconstruction: vi.fn(),
    endAuthenticatedTrackerReconstruction: vi.fn(),
    getInfo: vi.fn(async () => ({ network: 'testnet' })),
    getIndexedHeight: vi.fn(async () => {
      snapshotReads += 1;
      const height =
        options.driftSnapshot && snapshotReads > 1
          ? SNAPSHOT_HEIGHT + 1
          : SNAPSHOT_HEIGHT;
      return { indexedHeight: height, fullHeight: height };
    }),
    getBestHeader: vi.fn(async () => {
      const drifted = options.driftSnapshot && snapshotReads > 1;
      return {
        id: drifted ? '94'.repeat(32) : HEADER_ID,
        parentId: PARENT_ID,
        height: drifted ? SNAPSHOT_HEIGHT + 1 : SNAPSHOT_HEIGHT,
        extensionRoot: EXTENSION_ROOT,
      };
    }),
    getIndexedBoxesByAddress: vi.fn(async address => {
      if (address === options.failAddress) throw new Error('bounded query failed');
      return structuredClone(boxesByAddress.get(address)?.indexed ?? []);
    }),
    getUnspentBoxesByAddress: vi.fn(async address => {
      if (address === options.failAddress) throw new Error('bounded query failed');
      return structuredClone(boxesByAddress.get(address)?.current ?? []);
    }),
    getBoxBinaryByIdOrNull: vi.fn(async boxId => {
      const match = allCurrent().find(entry => entry.box.boxId === boxId);
      if (match === undefined) return null;
      if (match.address === options.binaryMismatchAddress) {
        return { bytes: '00' };
      }
      return sigmaBinary(match.box);
    }),
    getIndexedBoxesByTokenId: vi.fn(async () => []),
    getTransaction: vi.fn(async () => null),
    getBlockHeaderById: vi.fn(async () => null),
    getBoxByIdOrNull: vi.fn(async boxId =>
      structuredClone(allCurrent().find(entry => entry.box.boxId === boxId)?.box ?? null)
    ),
  };
}

async function sigmaBinary(box: any): Promise<{ bytes: string }> {
  const parsed = TEST_WASM.ErgoBox.from_json(JSON.stringify(box));
  try {
    return {
      bytes: Buffer.from(parsed.sigma_serialize_bytes()).toString('hex'),
    };
  } finally {
    parsed.free?.();
  }
}

function input(
  profileValue: ReturnType<typeof profile>,
  primaryBoxes: Map<string, RouteBoxes>,
  witnessBoxes = structuredClone(primaryBoxes),
  options: {
    readonly primary?: Parameters<typeof source>[2];
    readonly witness?: Parameters<typeof source>[2];
    readonly authenticatedV2?: any;
    readonly replayImport?: any;
    readonly historicalDupLineages?: readonly any[];
  } = {},
): BuildValidityApplicationPooledReserveErgoLegacyInventoryV4Input {
  return {
    profile: profileValue,
    primarySource: source(PRIMARY_SOURCE_ID, primaryBoxes, options.primary),
    witnessSource: source(WITNESS_SOURCE_ID, witnessBoxes, options.witness),
    authenticatedV2: options.authenticatedV2 ?? null,
    replayImport: options.replayImport ?? null,
    historicalDupLineages: options.historicalDupLineages ?? [],
    observedAt: () => new Date('2026-07-30T15:00:00.000Z'),
  };
}

function authenticatedV2Fixture(
  profileValue: ReturnType<typeof profile>,
  boxesByAddress: Map<string, RouteBoxes>,
) {
  const trackerInstance = routeInstance(profileValue, TRACKER_ROUTE);
  const dupInstance = routeInstance(profileValue, DUP_ROUTE);
  const vaultInstance = routeInstance(profileValue, VAULT_ROUTE);
  const trackerBox = boxesByAddress.get(trackerInstance.address)!.current[0]!;
  const dupBox = boxesByAddress.get(dupInstance.address)!.current[0]!;
  const vaultBox = boxesByAddress.get(vaultInstance.address)!.current[0]!;
  const reconstruction = {
    schema: 'e2s.authenticated-v2-read-only-reconstruction.v1',
    observedTip: {
      idHex: HEADER_ID,
      parentIdHex: PARENT_ID,
      height: SNAPSHOT_HEIGHT,
      extensionRootHex: EXTENSION_ROOT,
    },
    reconstructionDigests: {
      tracker: '31'.repeat(32),
      duplicatePrevention: '32'.repeat(32),
      vault: '33'.repeat(32),
    },
    tracker: {
      trackerNftIdHex: trackerInstance.singletonTokenIdHex,
      genesisBoxId: trackerInstance.genesisBoxIdHex,
      tipBoxId: trackerBox.boxId,
    },
    duplicatePrevention: {
      duplicatePreventionNftIdHex: dupInstance.singletonTokenIdHex,
      duplicatePreventionErgoTreeHex: dupInstance.ergoTreeHex,
      genesisBoxIdHex: dupInstance.genesisBoxIdHex,
      tipBoxIdHex: dupBox.boxId,
      tipDigestHex: '34'.repeat(33),
      tipCounter: '1',
      historyKeys: ['35'.repeat(32)],
      indexedHeight: SNAPSHOT_HEIGHT,
      fullHeight: SNAPSHOT_HEIGHT,
      observationDigestHex: '32'.repeat(32),
    },
    vault: {
      vaultAddress: vaultInstance.address,
      vaultErgoTreeHex: vaultInstance.ergoTreeHex,
      currentUnspentBoxIdsHex: [vaultBox.boxId],
      unresolvedRootProvenanceBoxIdsHex: [],
      sources: {
        primary: PRIMARY_SOURCE_ID,
        witness: WITNESS_SOURCE_ID,
      },
    },
  } as any;
  authenticatedReconstructions.add(reconstruction);
  const replayImport = {
    packetDigestHex: '36'.repeat(32),
    source: {
      authenticatedV2ReconstructionDigestHex:
        reconstruction.duplicatePrevention.observationDigestHex,
      authenticatedV2DuplicatePreventionNftIdHex:
        reconstruction.duplicatePrevention.duplicatePreventionNftIdHex,
      authenticatedV2DuplicatePreventionErgoTreeHex:
        reconstruction.duplicatePrevention.duplicatePreventionErgoTreeHex,
      authenticatedV2GenesisBoxIdHex:
        reconstruction.duplicatePrevention.genesisBoxIdHex,
      authenticatedV2TipBoxIdHex:
        reconstruction.duplicatePrevention.tipBoxIdHex,
      authenticatedV2TipDigestHex:
        reconstruction.duplicatePrevention.tipDigestHex,
      authenticatedV2TipCounter:
        reconstruction.duplicatePrevention.tipCounter,
    },
    imports: [{
      canonicalBurnIdHex: reconstruction.duplicatePrevention.historyKeys[0],
    }],
  } as any;
  replayImports.add(replayImport);
  return { reconstruction, replayImport };
}

async function historicalDupPacket(
  profileValue: ReturnType<typeof profile>,
  boxesByAddress: Map<string, RouteBoxes>,
  routeId: string,
  options: {
    readonly rawKeysHex?: readonly string[];
    readonly tipDigestHex?: string;
    readonly tipCounter?: string;
  } = {},
): Promise<any> {
  const route = profileValue.routes.find(candidate => candidate.routeId === routeId);
  if (route === undefined) throw new Error(`missing historical DUP route ${routeId}`);
  const instance = routeInstance(profileValue, routeId);
  const descriptor = HISTORICAL_DUP_FAMILIES_V4.find(candidate =>
    candidate.routeId === routeId
  );
  if (descriptor === undefined) throw new Error(`missing descriptor ${routeId}`);
  const routeBoxSet = boxesByAddress.get(instance.address)!;
  const rawKeysHex = [...(options.rawKeysHex ?? [])];
  const funded = routeBoxSet.indexed.length > 0;
  const tip = routeBoxSet.current[0] ?? null;
  const tipBinary = tip === null ? null : await sigmaBinary(tip);
  const packet = {
    schema: 'e2s.validity-application-pooled-reserve-historical-dup-lineage.v4',
    version: 4,
    classification: funded ? 'raw-reconstructed' : 'never-funded',
    packetDigestHex: sha256Text(`packet:${routeId}:${instance.instanceId}`),
    profileDigestHex: profileValue.profileDigestHex,
    requirementsDigestHex: profileValue.requirementsDigestHex,
    networkId: profileValue.network.networkId,
    routeId,
    sourceSurface: route.sourceSurface,
    instanceId: instance.instanceId,
    address: instance.address,
    ergoTreeHex: instance.ergoTreeHex,
    singletonTokenIdHex: instance.singletonTokenIdHex,
    genesisBoxIdHex: instance.genesisBoxIdHex,
    descriptor,
    stableSnapshot: {
      indexedHeight: SNAPSHOT_HEIGHT,
      fullHeight: SNAPSHOT_HEIGHT,
      bestHeader: {
        idHex: HEADER_ID,
        parentIdHex: PARENT_ID,
        height: SNAPSHOT_HEIGHT,
        extensionRootHex: EXTENSION_ROOT,
      },
    },
    genesisObservedBoxIdHex: funded ? routeBoxSet.indexed[0].boxId : null,
    tipBoxIdHex: tip?.boxId ?? null,
    tipDigestHex: options.tipDigestHex ?? EMPTY_AVL_DIGEST,
    tipCounter: options.tipCounter ?? '0',
    tipSigmaSerializedHex: tipBinary?.bytes ?? null,
    tipSigmaSerializedSha256Hex: tipBinary === null
      ? null
      : sha256Hex(Buffer.from(tipBinary.bytes, 'hex')),
    rawInsertedKeysHex: rawKeysHex,
    lineageBoxes: routeBoxSet.indexed.map(box => ({
      boxIdHex: box.boxId,
      transactionIdHex: box.transactionId,
      outputIndex: box.index,
      creationHeight: box.creationHeight,
      inclusionHeight: box.creationHeight,
      valueNanoErg: String(box.value),
      ergoTreeHex: box.ergoTree,
      singletonTokenIdHex: box.assets[0].tokenId,
      registers: structuredClone(box.additionalRegisters),
      spentTransactionIdHex: box.spentTransactionId,
    })),
    transitions: [],
    observationDigestHex: sha256Text(`observation:${routeId}:${instance.instanceId}`),
    sourceIdDigestsHex: [
      sha256Text(PRIMARY_SOURCE_ID),
      sha256Text(WITNESS_SOURCE_ID),
    ].sort(),
    distinctSourceAgreement: true,
    historicalScriptLimitations: {
      strongerProfileSingletonEnforcedOffChain: true,
      scriptTokenStrength: descriptor.tokenStrength,
      declaredKeyIntent: descriptor.declaredKeyIntent,
      observedKeySemantics: descriptor.observedKeySemantics,
      rawKeysPromotedToCanonicalEvents: false,
      contextExtensionDigestValidation:
        'producer-attested-format-and-packet-digest-only',
      spendingBlockIdValidation:
        'producer-attested-format-and-packet-digest-only',
    },
    boundaries: {
      readOnlyReconstruction: true,
      localPersistenceConsulted: false,
      sourceOperationalIndependenceAuthenticated: false,
      ergoConsensusAuthenticated: false,
      transactionInclusionAuthenticated: false,
      canonicalEventMappingEstablished: false,
      globalGenesisBuilt: false,
      allHistoricalLineagesImported: false,
      inventoryExhaustive: false,
      routeRetired: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
    },
  };
  historicalDupPackets.add(packet);
  return packet;
}

async function allNeverFundedHistoricalDupPackets(
  profileValue: ReturnType<typeof profile>,
  boxesByAddress: Map<string, RouteBoxes>,
): Promise<any[]> {
  return Promise.all(profileValue.routes
    .filter(route => route.routeClass === 'duplicate-prevention')
    .flatMap(route => route.instances.map(() =>
      historicalDupPacket(profileValue, boxesByAddress, route.routeId)
    )));
}

describe('pooled-reserve V4 Ergo legacy route inventory', () => {
  it('classifies exact two-source history without converting observations into retirement authority', async () => {
    const profileValue = profile();
    const boxes = routeBoxes(profileValue);

    const packet = await buildValidityApplicationPooledReserveErgoLegacyInventoryV4(
      input(profileValue, boxes),
    );
    const duplicatePreventionInstanceCount = profileValue.routes
      .filter(route => route.routeClass === 'duplicate-prevention')
      .reduce((sum, route) => sum + route.instances.length, 0);
    const routesWithObservationBlockers = new Set([
      MCL_ROUTE,
      TRACKER_ROUTE,
      VAULT_ROUTE,
      ...profileValue.routes
        .filter(route => route.routeClass === 'duplicate-prevention')
        .map(route => route.routeId),
    ]).size;

    expect(packet.status)
      .toBe(VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_INVENTORY_V4_STATUS);
    expect(packet.summary).toEqual({
      routeCount: profileValue.routes.length,
      instanceCount: profileValue.routes.length,
      fundedRouteCount: 1,
      drainedRouteCount: 1,
      neverFundedRouteCount: profileValue.routes.length - 2,
      unresolvedRouteCount: 0,
      routesWithObservationBlockers,
      duplicatePreventionInstanceCount,
      historicalLineagePacketCount: 0,
      historicalLineageMissingCount: duplicatePreventionInstanceCount,
      historicalLineageJoinedCount: 0,
      historicalFundedLineageReplayedCount: 0,
      historicalNeverFundedInstanceConfirmedCount: 0,
      historicalLineagesAwaitingSourceEvidenceCount: 0,
      routesRetired: 0,
    });
    expect(packet.routes.find(route => route.routeId === MCL_ROUTE))
      .toEqual(expect.objectContaining({
        classification: 'funded',
        retirementEvidenceDigestHex: null,
        retirementDeclarationEligible: false,
        blockerCodes: [
          'current-funds-present',
          'retirement-evidence-required',
        ],
      }));
    expect(packet.routes.find(route => route.routeId === CAUSAL_LOCK_ROUTE))
      .toEqual(expect.objectContaining({
        classification: 'drained',
        retirementDeclarationEligible: false,
        blockerCodes: ['retirement-evidence-required'],
      }));
    expect(packet.routes.every(route =>
      route.inventoryEvidenceDigestHex.length === 64
      && route.retirementDeclarationEligible === false
    )).toBe(true);
    expect(packet.authenticatedV2.reconstructionSupplied).toBe(false);
    expect(packet.historicalDuplicatePrevention).toHaveLength(
      duplicatePreventionInstanceCount,
    );
    expect(packet.historicalDuplicatePrevention.every(entry =>
      entry.packetDigestHex === null
      && entry.blockerCodes.includes('historical-dup-lineage-missing')
      && entry.canonicalSourceFinalityEstablished === false
      && entry.replayGenesisEligible === false
      && entry.fundsAuthorityEstablished === false
    )).toBe(true);
    expect(Object.values(packet.authority).every(value => value === false))
      .toBe(true);
    expect(packet.profile.instanceInventoryExhaustive).toBe(false);
    expect(packet.observation.sourceIdDigestsHex)
      .not.toContain(PRIMARY_SOURCE_ID);
    expect(Object.isFrozen(packet)).toBe(true);
    expect(() =>
      assertValidityApplicationPooledReserveErgoLegacyInventoryV4Packet(packet)
    ).not.toThrow();
    expect(
      validateValidityApplicationPooledReserveErgoLegacyInventoryV4Packet(
        structuredClone(packet),
        profileValue,
      ).packetDigestHex,
    ).toBe(packet.packetDigestHex);
    expect(() =>
      assertValidityApplicationPooledReserveErgoLegacyInventoryV4Packet(
        structuredClone(packet),
      )
    ).toThrow(/not built in this process/);
  });

  it('binds the same-process authenticated V2 tracker, DUP, vault, and canonical replay import', async () => {
    const profileValue = profile({ fundedDupRouteId: DUP_ROUTE });
    const boxes = routeBoxes(profileValue, {
      authenticatedV2: true,
      historicalDupRouteId: DUP_ROUTE,
    });
    const authenticated = authenticatedV2Fixture(profileValue, boxes);
    const historical = await historicalDupPacket(profileValue, boxes, DUP_ROUTE, {
      rawKeysHex: authenticated.reconstruction.duplicatePrevention.historyKeys,
      tipDigestHex: authenticated.reconstruction.duplicatePrevention.tipDigestHex,
      tipCounter: authenticated.reconstruction.duplicatePrevention.tipCounter,
    });

    const packet = await buildValidityApplicationPooledReserveErgoLegacyInventoryV4(
      input(profileValue, boxes, structuredClone(boxes), {
        authenticatedV2: authenticated.reconstruction,
        replayImport: authenticated.replayImport,
        historicalDupLineages: [historical],
      }),
    );

    expect(packet.authenticatedV2).toEqual({
      reconstructionSupplied: true,
      reconstructionDigests:
        authenticated.reconstruction.reconstructionDigests,
      currentInputs: {
        trackerBoxIdHex: authenticated.reconstruction.tracker.tipBoxId,
        duplicatePreventionBoxIdHex:
          authenticated.reconstruction.duplicatePrevention.tipBoxIdHex,
        vaultBoxIdsHex:
          authenticated.reconstruction.vault.currentUnspentBoxIdsHex,
      },
      replayImportPacketDigestHex: authenticated.replayImport.packetDigestHex,
      canonicalReplayKeyCount: 1,
      allHistoricalReplayLineagesImported: false,
    });
    expect(packet.routes.find(route => route.routeId === DUP_ROUTE)
      ?.blockerCodes).not.toContain('authenticated-v2-replay-import-missing');
    expect(packet.historicalDuplicatePrevention.find(entry =>
      entry.routeId === DUP_ROUTE
    )).toEqual(expect.objectContaining({
      status: 'authenticated-v2-lineage-and-replay-import-agree',
      declaredKeyIntent: 'event-level-burn-id',
      observedKeySemantics: 'opaque-32-byte-replay-key',
      exactInventoryJoinEstablished: true,
      canonicalEventMappingEstablished: true,
      sourceAdmissionEvidenceJoined: true,
      canonicalSourceFinalityEstablished: false,
      replayGenesisEligible: false,
      fundsAuthorityEstablished: false,
      blockerCodes: [],
    }));
    expect(packet.summary).toEqual(expect.objectContaining({
      historicalLineagePacketCount: 1,
      historicalLineageJoinedCount: 1,
      historicalFundedLineageReplayedCount: 1,
      historicalNeverFundedInstanceConfirmedCount: 0,
      historicalLineagesAwaitingSourceEvidenceCount: 0,
    }));
    expect(
      validateValidityApplicationPooledReserveErgoLegacyInventoryV4Packet(
        structuredClone(packet),
        profileValue,
      ).packetDigestHex,
    ).toBe(packet.packetDigestHex);
  });

  it('selects the exact current V2 singletons while retaining older generations', async () => {
    const profileValue = profile({
      additionalAuthenticatedV2Generations: true,
    });
    const boxes = routeBoxes(profileValue, { authenticatedV2: true });
    const authenticated = authenticatedV2Fixture(profileValue, boxes);

    const packet = await buildValidityApplicationPooledReserveErgoLegacyInventoryV4(
      input(profileValue, boxes, structuredClone(boxes), {
        authenticatedV2: authenticated.reconstruction,
        replayImport: authenticated.replayImport,
      }),
    );

    for (const routeId of [TRACKER_ROUTE, DUP_ROUTE]) {
      const route = packet.routes.find(candidate => candidate.routeId === routeId);
      expect(route?.instances).toHaveLength(2);
      expect(route?.instances.find(instance =>
        instance.instanceId.startsWith('historical-')
      )).toEqual(expect.objectContaining({
        classification: 'never-funded',
        currentUtxoCount: 0,
      }));
    }
    expect(packet.authenticatedV2.reconstructionSupplied).toBe(true);
    expect(packet.authenticatedV2.canonicalReplayKeyCount).toBe(1);
  });

  it('joins explicit never-funded packets for every profiled DUP instance without creating authority', async () => {
    const profileValue = profile();
    const boxes = routeBoxes(profileValue);
    const historicalDupLineages = await allNeverFundedHistoricalDupPackets(
      profileValue,
      boxes,
    );

    const packet = await buildValidityApplicationPooledReserveErgoLegacyInventoryV4(
      input(profileValue, boxes, structuredClone(boxes), {
        historicalDupLineages,
      }),
    );

    expect(packet.summary.historicalLineagePacketCount)
      .toBe(historicalDupLineages.length);
    expect(packet.summary.historicalLineageMissingCount).toBe(0);
    expect(packet.summary.historicalLineageJoinedCount)
      .toBe(historicalDupLineages.length);
    expect(packet.summary.historicalFundedLineageReplayedCount).toBe(0);
    expect(packet.summary.historicalNeverFundedInstanceConfirmedCount)
      .toBe(historicalDupLineages.length);
    expect(packet.historicalDuplicatePrevention.every(entry =>
      entry.status === 'never-funded'
      && entry.observedKeySemantics === 'opaque-32-byte-replay-key'
      && entry.exactInventoryJoinEstablished
      && entry.blockerCodes.length === 0
      && !entry.canonicalEventMappingEstablished
      && !entry.sourceAdmissionEvidenceJoined
      && !entry.canonicalSourceFinalityEstablished
      && !entry.replayGenesisEligible
      && !entry.fundsAuthorityEstablished
    )).toBe(true);
  });

  it('keeps opaque keys with declared transaction-hash intent blocked on mapping and source admission', async () => {
    const routeId = HISTORICAL_DUP_FAMILIES_V4.find(descriptor =>
      descriptor.declaredKeyIntent === 'sidechain-burn-transaction-hash'
    )!.routeId;
    const profileValue = profile({ fundedDupRouteId: routeId });
    const boxes = routeBoxes(profileValue, { historicalDupRouteId: routeId });
    const historical = await historicalDupPacket(profileValue, boxes, routeId, {
      rawKeysHex: ['61'.repeat(32)],
      tipCounter: '1',
    });

    const packet = await buildValidityApplicationPooledReserveErgoLegacyInventoryV4(
      input(profileValue, boxes, structuredClone(boxes), {
        historicalDupLineages: [historical],
      }),
    );
    const coverage = packet.historicalDuplicatePrevention.find(entry =>
      entry.routeId === routeId
    );
    expect(coverage).toEqual(expect.objectContaining({
      status: 'opaque-transaction-hash-intent-event-mapping-and-source-admission-required',
      declaredKeyIntent: 'sidechain-burn-transaction-hash',
      observedKeySemantics: 'opaque-32-byte-replay-key',
      rawKeyCount: 1,
      canonicalEventMappingEstablished: false,
      sourceAdmissionEvidenceJoined: false,
      canonicalSourceFinalityEstablished: false,
      replayGenesisEligible: false,
      fundsAuthorityEstablished: false,
      blockerCodes: [
        'historical-dup-event-mapping-required',
        'historical-dup-source-admission-required',
      ],
    }));
    expect(packet.summary).toEqual(expect.objectContaining({
      historicalLineageJoinedCount: 1,
      historicalFundedLineageReplayedCount: 1,
      historicalNeverFundedInstanceConfirmedCount: 0,
      historicalLineagesAwaitingSourceEvidenceCount: 1,
    }));
    expect(packet.routes.find(route => route.routeId === routeId)?.blockerCodes)
      .toEqual(expect.arrayContaining([
        'historical-dup-event-mapping-required',
        'historical-dup-source-admission-required',
      ]));
  });

  it('keeps opaque keys with declared event-id intent blocked outside exact authenticated V2 admission', async () => {
    const routeId = HISTORICAL_DUP_FAMILIES_V4.find(descriptor =>
      descriptor.declaredKeyIntent === 'event-level-burn-id'
      && descriptor.routeId !== DUP_ROUTE
    )!.routeId;
    const profileValue = profile({ fundedDupRouteId: routeId });
    const boxes = routeBoxes(profileValue, { historicalDupRouteId: routeId });
    const historical = await historicalDupPacket(profileValue, boxes, routeId, {
      rawKeysHex: ['62'.repeat(32)],
      tipCounter: '1',
    });

    const packet = await buildValidityApplicationPooledReserveErgoLegacyInventoryV4(
      input(profileValue, boxes, structuredClone(boxes), {
        historicalDupLineages: [historical],
      }),
    );
    const coverage = packet.historicalDuplicatePrevention.find(entry =>
      entry.routeId === routeId
    );
    expect(coverage).toEqual(expect.objectContaining({
      status: 'opaque-event-id-intent-mapping-and-source-admission-required',
      declaredKeyIntent: 'event-level-burn-id',
      observedKeySemantics: 'opaque-32-byte-replay-key',
      rawKeyCount: 1,
      exactInventoryJoinEstablished: true,
      canonicalEventMappingEstablished: false,
      sourceAdmissionEvidenceJoined: false,
      canonicalSourceFinalityEstablished: false,
      replayGenesisEligible: false,
      fundsAuthorityEstablished: false,
      blockerCodes: [
        'historical-dup-event-mapping-required',
        'historical-dup-source-admission-required',
      ],
    }));
    expect(packet.summary).toEqual(expect.objectContaining({
      historicalLineageJoinedCount: 1,
      historicalFundedLineageReplayedCount: 1,
      historicalNeverFundedInstanceConfirmedCount: 0,
      historicalLineagesAwaitingSourceEvidenceCount: 1,
    }));
  });

  it('rejects unknown, duplicate, and cloned historical DUP packet provenance', async () => {
    const profileValue = profile();
    const boxes = routeBoxes(profileValue);
    const routeId = HISTORICAL_DUP_FAMILIES_V4[0].routeId;

    const duplicate = await historicalDupPacket(profileValue, boxes, routeId);
    await expect(buildValidityApplicationPooledReserveErgoLegacyInventoryV4(
      input(profileValue, boxes, structuredClone(boxes), {
        historicalDupLineages: [duplicate, duplicate],
      }),
    )).rejects.toThrow(/duplicated/);

    const cloned = await historicalDupPacket(profileValue, boxes, routeId);
    await expect(buildValidityApplicationPooledReserveErgoLegacyInventoryV4(
      input(profileValue, boxes, structuredClone(boxes), {
        historicalDupLineages: [structuredClone(cloned)],
      }),
    )).rejects.toThrow(/not built in this process/);

    const unknown = await historicalDupPacket(profileValue, boxes, routeId);
    unknown.instanceId = 'unknown-instance';
    await expect(buildValidityApplicationPooledReserveErgoLegacyInventoryV4(
      input(profileValue, boxes, structuredClone(boxes), {
        historicalDupLineages: [unknown],
      }),
    )).rejects.toThrow(/not an exact profiled instance/);
  });

  it('requires the historical DUP packet array in the exact input schema', async () => {
    const profileValue = profile();
    const boxes = routeBoxes(profileValue);
    const missing = input(profileValue, boxes) as any;
    delete missing.historicalDupLineages;

    await expect(buildValidityApplicationPooledReserveErgoLegacyInventoryV4(missing))
      .rejects.toThrow(/unknown or missing fields/);
  });

  it('rejects every historical DUP profile, source, snapshot, route, and singleton binding drift', async () => {
    const profileValue = profile();
    const boxes = routeBoxes(profileValue);
    const routeId = HISTORICAL_DUP_FAMILIES_V4[0].routeId;
    const cases: readonly [string, (packet: any) => void][] = [
      ['profile', packet => { packet.profileDigestHex = '71'.repeat(32); }],
      ['requirements', packet => { packet.requirementsDigestHex = '72'.repeat(32); }],
      ['network', packet => { packet.networkId = 'ergo-mainnet'; }],
      ['source pair', packet => { packet.sourceIdDigestsHex[0] = '73'.repeat(32); }],
      ['snapshot', packet => { packet.stableSnapshot.bestHeader.idHex = '74'.repeat(32); }],
      ['route', packet => { packet.routeId = `${packet.routeId}-wrong`; }],
      ['source surface', packet => { packet.sourceSurface = 'contracts/Wrong.es'; }],
      ['instance', packet => { packet.instanceId = `${packet.instanceId}-wrong`; }],
      ['address', packet => { packet.address = `${packet.address}x`; }],
      ['tree', packet => { packet.ergoTreeHex = tree(30); }],
      ['NFT', packet => { packet.singletonTokenIdHex = '75'.repeat(32); }],
      ['genesis', packet => { packet.genesisBoxIdHex = '76'.repeat(32); }],
    ];
    for (const [label, mutate] of cases) {
      const historical = await historicalDupPacket(profileValue, boxes, routeId);
      mutate(historical);
      await expect(
        buildValidityApplicationPooledReserveErgoLegacyInventoryV4(
          input(profileValue, boxes, structuredClone(boxes), {
            historicalDupLineages: [historical],
          }),
        ),
        label,
      ).rejects.toThrow();
    }
  });

  it('rejects historical DUP lineage, register, and exact current-tip drift', async () => {
    const routeId = HISTORICAL_DUP_FAMILIES_V4[0].routeId;
    const profileValue = profile({ fundedDupRouteId: routeId });
    const boxes = routeBoxes(profileValue, { historicalDupRouteId: routeId });
    const cases: readonly [string, (packet: any) => void][] = [
      ['lineage transaction', packet => {
        packet.lineageBoxes[0].transactionIdHex = '81'.repeat(32);
      }],
      ['registers', packet => {
        packet.lineageBoxes[0].registers.R4 = encodeLongRegister(2);
      }],
      ['tip identity', packet => { packet.tipBoxIdHex = '82'.repeat(32); }],
      ['tip binary', packet => {
        packet.tipSigmaSerializedSha256Hex = '83'.repeat(32);
      }],
    ];
    for (const [label, mutate] of cases) {
      const historical = await historicalDupPacket(profileValue, boxes, routeId);
      mutate(historical);
      await expect(
        buildValidityApplicationPooledReserveErgoLegacyInventoryV4(
          input(profileValue, boxes, structuredClone(boxes), {
            historicalDupLineages: [historical],
          }),
        ),
        label,
      ).rejects.toThrow(/historical DUP lineage/);
    }
  });

  it('does not let a supplied packet promote drained or unresolved DUP inventory', async () => {
    const routeId = HISTORICAL_DUP_FAMILIES_V4[0].routeId;
    const profileValue = profile({ fundedDupRouteId: routeId });
    const instance = routeInstance(profileValue, routeId);

    const drainedBoxes = routeBoxes(profileValue, {
      historicalDupRouteId: routeId,
    });
    const drainedEntry = drainedBoxes.get(instance.address)!;
    drainedEntry.indexed[0].spentTransactionId = '84'.repeat(32);
    (drainedEntry as any).current = [];
    const drainedPacket = await historicalDupPacket(
      profileValue,
      drainedBoxes,
      routeId,
    );
    await expect(buildValidityApplicationPooledReserveErgoLegacyInventoryV4(
      input(profileValue, drainedBoxes, structuredClone(drainedBoxes), {
        historicalDupLineages: [drainedPacket],
      }),
    )).rejects.toThrow(/cannot promote drained inventory/);

    const unresolvedBoxes = routeBoxes(profileValue, {
      historicalDupRouteId: routeId,
    });
    const unresolvedPacket = await historicalDupPacket(
      profileValue,
      unresolvedBoxes,
      routeId,
    );
    await expect(buildValidityApplicationPooledReserveErgoLegacyInventoryV4(
      input(profileValue, unresolvedBoxes, structuredClone(unresolvedBoxes), {
        witness: { failAddress: instance.address },
        historicalDupLineages: [unresolvedPacket],
      }),
    )).rejects.toThrow(/cannot promote unresolved inventory/);
  });

  it('rejects authenticated V2 historical DUP drift against reconstruction and replay import', async () => {
    const profileValue = profile({ fundedDupRouteId: DUP_ROUTE });
    const boxes = routeBoxes(profileValue, {
      authenticatedV2: true,
      historicalDupRouteId: DUP_ROUTE,
    });
    const authenticated = authenticatedV2Fixture(profileValue, boxes);
    const historical = await historicalDupPacket(profileValue, boxes, DUP_ROUTE, {
      rawKeysHex: authenticated.reconstruction.duplicatePrevention.historyKeys,
      tipDigestHex: authenticated.reconstruction.duplicatePrevention.tipDigestHex,
      tipCounter: authenticated.reconstruction.duplicatePrevention.tipCounter,
    });
    authenticated.replayImport.source.authenticatedV2TipCounter = '2';

    await expect(buildValidityApplicationPooledReserveErgoLegacyInventoryV4(
      input(profileValue, boxes, structuredClone(boxes), {
        authenticatedV2: authenticated.reconstruction,
        replayImport: authenticated.replayImport,
        historicalDupLineages: [historical],
      }),
    )).rejects.toThrow(/lineage, reconstruction, and replay import disagree/);
  });

  it('refuses to assign observed singleton-route boxes without an exact token lineage', async () => {
    const profileValue = profile({ omitTrackerSingletonIdentity: true });
    const boxes = routeBoxes(profileValue);
    const tracker = routeInstance(profileValue, TRACKER_ROUTE);
    const observed = materializeBox({
      transactionIdHex: '3a'.repeat(32),
      outputIndex: 0,
      ergoTreeHex: tracker.ergoTreeHex,
      valueNanoErg: 300_000_000,
      singletonTokenIdHex: '3b'.repeat(32),
    });
    boxes.set(tracker.address, {
      indexed: [{ ...structuredClone(observed), spentTransactionId: null }],
      current: [structuredClone(observed)],
    });

    const packet = await buildValidityApplicationPooledReserveErgoLegacyInventoryV4(
      input(profileValue, boxes),
    );
    const route = packet.routes.find(candidate =>
      candidate.routeId === TRACKER_ROUTE
    );
    expect(route).toEqual(expect.objectContaining({
      classification: 'unresolved',
    }));
    expect(route?.blockerCodes).toContain('singleton-identity-required');
  });

  it('preserves one valid cross-source disagreement as an unresolved route', async () => {
    const profileValue = profile();
    const primaryBoxes = routeBoxes(profileValue);
    const witnessBoxes = structuredClone(primaryBoxes);
    const instance = routeInstance(profileValue, MCL_ROUTE);
    const alternate = materializeBox({
      transactionIdHex: '41'.repeat(32),
      outputIndex: 0,
      ergoTreeHex: instance.ergoTreeHex,
      valueNanoErg: 500_000_001,
    });
    witnessBoxes.set(instance.address, {
      indexed: [{ ...structuredClone(alternate), spentTransactionId: null }],
      current: [structuredClone(alternate)],
    });

    const packet = await buildValidityApplicationPooledReserveErgoLegacyInventoryV4(
      input(profileValue, primaryBoxes, witnessBoxes),
    );

    expect(packet.routes.find(route => route.routeId === MCL_ROUTE))
      .toEqual(expect.objectContaining({
        classification: 'unresolved',
        blockerCodes: [
          'retirement-evidence-required',
          'source-disagreement',
        ],
      }));
    expect(packet.summary.unresolvedRouteCount).toBe(1);
  });

  it('records a bounded query or canonical-binary failure as unresolved and continues other routes', async () => {
    const profileValue = profile();
    const boxes = routeBoxes(profileValue);
    const failed = routeInstance(profileValue, CAUSAL_LOCK_ROUTE);
    const binaryMismatch = routeInstance(profileValue, MCL_ROUTE);

    const packet = await buildValidityApplicationPooledReserveErgoLegacyInventoryV4(
      input(profileValue, boxes, structuredClone(boxes), {
        primary: { failAddress: failed.address },
        witness: { binaryMismatchAddress: binaryMismatch.address },
      }),
    );

    expect(packet.routes.find(route => route.routeId === CAUSAL_LOCK_ROUTE)
      ?.blockerCodes).toContain('primary-observation-failed');
    expect(packet.routes.find(route => route.routeId === MCL_ROUTE)
      ?.blockerCodes).toContain('witness-observation-failed');
    expect(packet.summary.unresolvedRouteCount).toBe(2);
  });

  it('rejects network, snapshot, source identity, and budget-hook drift for the complete packet', async () => {
    const profileValue = profile();
    const boxes = routeBoxes(profileValue);
    const drifted = input(profileValue, boxes, structuredClone(boxes), {
      witness: { driftSnapshot: true },
    });
    await expect(
      buildValidityApplicationPooledReserveErgoLegacyInventoryV4(drifted),
    ).rejects.toThrow(/changed during observation/);

    const same = input(profileValue, boxes);
    (same as any).witnessSource = same.primarySource;
    await expect(
      buildValidityApplicationPooledReserveErgoLegacyInventoryV4(same),
    ).rejects.toThrow(/distinct source instances/);

    const missingHook = input(profileValue, boxes);
    (missingHook.witnessSource as any).endAuthenticatedTrackerReconstruction =
      undefined;
    await expect(
      buildValidityApplicationPooledReserveErgoLegacyInventoryV4(missingHook),
    ).rejects.toThrow(/budget hooks must be paired/);
  });

  it('rejects forged profile, authenticated reconstruction, or replay provenance', async () => {
    const profileValue = profile();
    const boxes = routeBoxes(profileValue, { authenticatedV2: true });
    await expect(
      buildValidityApplicationPooledReserveErgoLegacyInventoryV4({
        ...input(profileValue, boxes),
        profile: structuredClone(profileValue),
      }),
    ).rejects.toThrow(/profile was not built in this process/);

    const authenticated = authenticatedV2Fixture(profileValue, boxes);
    await expect(
      buildValidityApplicationPooledReserveErgoLegacyInventoryV4(
        input(profileValue, boxes, structuredClone(boxes), {
          authenticatedV2: structuredClone(authenticated.reconstruction),
        }),
      ),
    ).rejects.toThrow(/reconstruction provenance/);
    await expect(
      buildValidityApplicationPooledReserveErgoLegacyInventoryV4(
        input(profileValue, boxes, structuredClone(boxes), {
          authenticatedV2: authenticated.reconstruction,
          replayImport: structuredClone(authenticated.replayImport),
        }),
      ),
    ).rejects.toThrow(/replay import provenance/);
  });

  it('rejects replay-import evidence without the reconstruction that produced it', async () => {
    const profileValue = profile();
    const boxes = routeBoxes(profileValue, { authenticatedV2: true });
    const authenticated = authenticatedV2Fixture(profileValue, boxes);

    await expect(
      buildValidityApplicationPooledReserveErgoLegacyInventoryV4(
        input(profileValue, boxes, structuredClone(boxes), {
          replayImport: authenticated.replayImport,
        }),
      ),
    ).rejects.toThrow(/requires its read-only reconstruction/);
  });
});

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
