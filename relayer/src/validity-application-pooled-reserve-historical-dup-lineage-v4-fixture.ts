import { createECDH, createHash } from 'node:crypto';

import { Network } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';

import type { AuthenticatedV2VaultChainSource } from './authenticated-v2-vault-reconstruction.js';
import {
  assertPooledReserveBurnTrackerV4ContextProvenance,
} from './pooled-reserve-burn-tracker-v4.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';
import {
  assertValidityApplicationPooledReserveBurnSettlementV4Packet,
} from './validity-application-pooled-reserve-burn-settlement-v4.js';
import {
  assertValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture,
  buildValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture,
  type ValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture,
} from './validity-application-pooled-reserve-burn-settlement-v4-fixture.js';
import {
  buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4,
  type ValidityApplicationPooledReserveErgoLegacyRouteProfileV4,
} from './validity-application-pooled-reserve-ergo-legacy-route-profile-v4.js';
import {
  assertValidityApplicationPooledReserveHistoricalDupLineageV4Provenance,
  reconstructValidityApplicationPooledReserveHistoricalDupLineageV4,
  type ValidityApplicationPooledReserveHistoricalDupLineageV4,
} from './validity-application-pooled-reserve-historical-dup-lineage-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4,
} from './validity-application-pooled-reserve-legacy-route-requirements-v4.js';
import type { Eip12Box } from './unsigned-ergo-transaction.js';

export const
VALIDITY_APPLICATION_POOLED_RESERVE_HISTORICAL_DUP_LINEAGE_V4_INTEGRATED_FIXTURE_SCHEMA =
  'e2s.validity-application-pooled-reserve-historical-dup-lineage-integrated-fixture.v1' as const;

const DUP_ROUTE_ID = 'ergo-double-unlock-prevention-pooled-reserve-v4';
const SETUP_BLOCK_ID = sha256Text('pooled-reserve-v4-dup-setup-block');
const SETTLEMENT_BLOCK_ID = sha256Text('pooled-reserve-v4-dup-settlement-block');
const BEST_HEADER_ID = sha256Text('pooled-reserve-v4-dup-best-header');
const BEST_PARENT_ID = sha256Text('pooled-reserve-v4-dup-best-parent');
const EXTENSION_ROOT = sha256Text('pooled-reserve-v4-dup-extension-root');
const BEST_HEIGHT = 140;
const PROFILE_BASIS =
  'repository://bridge/pooled-reserve-v4-integrated-dup-fixture';

type LegacyRoute =
  ValidityApplicationPooledReserveErgoLegacyRouteProfileV4['routes'][number];
type LegacyInstance = LegacyRoute['instances'][number];

export interface ValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_HISTORICAL_DUP_LINEAGE_V4_INTEGRATED_FIXTURE_SCHEMA;
  readonly version: 1;
  readonly settlementFixture: Readonly<
    ValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture
  >;
  readonly sourceProfile: Readonly<
    ValidityApplicationPooledReserveErgoLegacyRouteProfileV4
  >;
  readonly route: LegacyRoute;
  readonly instance: LegacyInstance;
  readonly historicalLineage: Readonly<
    ValidityApplicationPooledReserveHistoricalDupLineageV4
  >;
  readonly bindings: Readonly<{
    readonly lineageProfileIdHex: string;
    readonly applicationBindingDigestHex: string;
    readonly trackerStatementDigestHex: string;
    readonly trackerKeyHex: string;
    readonly trackerValueHex: string;
    readonly checkpointCommitmentHex: string;
    readonly bridgeEventRootHex: string;
    readonly burnLeafHex: string;
    readonly burnIdHex: string;
    readonly recipientErgoTreeHex: string;
    readonly amountNanoErg: string;
    readonly payoutBoxIdHex: string;
    readonly settlementTransactionIdHex: string;
    readonly duplicatePreventionPredecessorBoxIdHex: string;
    readonly duplicatePreventionSuccessorBoxIdHex: string;
    readonly duplicatePreventionInputDigestHex: string;
    readonly duplicatePreventionOutputDigestHex: string;
    readonly historicalTransitionContextDigestHex: string;
  }>;
  readonly joinDigestHex: string;
  readonly boundaries: Readonly<{
    readonly fixtureOnly: true;
    readonly distinctSyntheticViewsMatched: true;
    readonly localPersistenceConsulted: false;
    readonly canonicalEventMappingEstablished: false;
    readonly sourceAdmissionEstablished: false;
    readonly ergoConsensusAuthenticated: false;
    readonly sidechainFinalityEstablished: false;
    readonly proofSystemActivated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
  }>;
}

const fixtures = new WeakSet<object>();
let exactFixturePromise: Promise<Readonly<
  ValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture
>> | undefined;

export function
buildValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture(
  settlementFixture?: Readonly<
    ValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture
  >,
): Promise<Readonly<
  ValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture
>> {
  if (settlementFixture !== undefined) {
    return buildFixture(settlementFixture);
  }
  exactFixturePromise ??= buildValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture()
    .then(buildFixture);
  return exactFixturePromise;
}

export function
assertValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture
> {
  if (value === null || typeof value !== 'object' || !fixtures.has(value)) {
    throw new Error(
      'pooled-reserve V4 integrated historical DUP fixture must be built in this process',
    );
  }
}

async function buildFixture(
  settlementFixture: Readonly<
    ValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture
  >,
): Promise<Readonly<
  ValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture
>> {
  assertValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture(
    settlementFixture,
  );
  assertPooledReserveBurnTrackerV4ContextProvenance(
    settlementFixture.trackerContext,
  );
  assertValidityApplicationPooledReserveBurnSettlementV4Packet(
    settlementFixture.settlementPacket,
  );

  const sourceProfile = buildSourceProfile(settlementFixture);
  const route = sourceProfile.routes.find(candidate =>
    candidate.routeId === DUP_ROUTE_ID
  );
  if (route === undefined || route.instances.length !== 1) {
    throw new Error('integrated historical DUP fixture route is unavailable');
  }
  const instance = route.instances[0]!;
  const sourceData = await buildSourceData(settlementFixture, instance);
  const historicalLineage =
    await reconstructValidityApplicationPooledReserveHistoricalDupLineageV4({
      profile: sourceProfile,
      route,
      instance,
      primarySource: buildSource('fixture://pooled-reserve-v4-dup-primary', sourceData),
      witnessSource: buildSource('fixture://pooled-reserve-v4-dup-witness', sourceData),
    });
  assertValidityApplicationPooledReserveHistoricalDupLineageV4Provenance(
    historicalLineage,
  );

  const bindings = assertExactJoin(settlementFixture, historicalLineage);
  const boundaries = deepFreeze({
    fixtureOnly: true as const,
    distinctSyntheticViewsMatched: true as const,
    localPersistenceConsulted: false as const,
    canonicalEventMappingEstablished: false as const,
    sourceAdmissionEstablished: false as const,
    ergoConsensusAuthenticated: false as const,
    sidechainFinalityEstablished: false as const,
    proofSystemActivated: false as const,
    targetNodeAcceptanceEstablished: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
    signingAuthorized: false as const,
    submissionAuthorized: false as const,
    broadcastAuthorized: false as const,
  });
  const digestInput = {
    schema:
      VALIDITY_APPLICATION_POOLED_RESERVE_HISTORICAL_DUP_LINEAGE_V4_INTEGRATED_FIXTURE_SCHEMA,
    version: 1 as const,
    sourceProfileDigestHex: sourceProfile.profileDigestHex,
    historicalLineagePacketDigestHex: historicalLineage.packetDigestHex,
    bindings,
    boundaries,
  };
  const result = deepFreeze({
    ...digestInput,
    settlementFixture,
    sourceProfile,
    route,
    instance,
    historicalLineage,
    joinDigestHex: sha256CanonicalJson(
      digestInput,
      'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_HISTORICAL_DUP_JOIN_V4',
    ),
  });
  fixtures.add(result);
  return result;
}

function buildSourceProfile(
  fixture: Readonly<
    ValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture
  >,
): Readonly<ValidityApplicationPooledReserveErgoLegacyRouteProfileV4> {
  const exactTree = cleanHex(
    fixture.compiledInstance.contracts.duplicatePrevention.receipt.propositionHex,
  );
  const exactNft = cleanHex(
    fixture.compiledInstance.genesis.duplicatePreventionNftIdHex,
  );
  const exactGenesis = cleanHex(
    fixture.provisioning.boxes.duplicatePrevention.boxId,
  );
  const ergoRequirements =
    VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4
      .filter(requirement => requirement.layer === 'ergo');
  return buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4({
    network: { networkId: 'ergo-testnet', addressNetworkPrefix: 16 },
    reviewedSource: {
      sourceRevisionHex: sha256Text(
        `fixture-source:${fixture.compiledInstance.lineageProfileIdHex}`,
      ).slice(0, 40),
      basis: [{
        reference: PROFILE_BASIS,
        sha256Hex: sha256Text(canonicalJson({
          lineageProfileIdHex: fixture.compiledInstance.lineageProfileIdHex,
          duplicatePreventionNftIdHex: exactNft,
          duplicatePreventionGenesisBoxIdHex: exactGenesis,
        })),
      }],
    },
    routes: ergoRequirements.map((requirement, index) => {
      const exact = requirement.routeId === DUP_ROUTE_ID;
      const ergoTreeHex = exact ? exactTree : deterministicP2pkTree(index + 1);
      const singleton = requirement.routeClass === 'tracker'
        || requirement.routeClass === 'duplicate-prevention'
        || requirement.routeClass === 'sidechain-state';
      return {
        routeId: requirement.routeId,
        sourceSurface: requirement.sourceSurface,
        requiredDisposition: requirement.requiredDisposition,
        instances: [{
          instanceId: `fixture-${String(index).padStart(2, '0')}`,
          address: ErgoAddress.fromErgoTree(
            ergoTreeHex,
            Network.Testnet,
          ).toString(),
          ergoTreeHex,
          ergoTreeSha256Hex: sha256HexBytes(ergoTreeHex),
          singletonTokenIdHex: exact
            ? exactNft
            : singleton
              ? sha256Text(`fixture-token:${requirement.routeId}`)
              : null,
          genesisBoxIdHex: exact
            ? exactGenesis
            : singleton
              ? sha256Text(`fixture-genesis:${requirement.routeId}`)
              : null,
        }],
      };
    }),
  });
}

interface SourceData {
  readonly address: string;
  readonly tokenIdHex: string;
  readonly indexed: readonly unknown[];
  readonly current: readonly unknown[];
  readonly transactions: Readonly<Record<string, Record<string, unknown>>>;
  readonly headers: Readonly<Record<string, Record<string, unknown>>>;
  readonly tipBoxIdHex: string;
  readonly tipSigmaHex: string;
}

async function buildSourceData(
  fixture: Readonly<
    ValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture
  >,
  instance: LegacyInstance,
): Promise<Readonly<SourceData>> {
  const issuance = fixture.provisioning.transactions.duplicatePreventionIssuance;
  const settlement = fixture.settlementPacket.transaction;
  const predecessor = fixture.settlementPacket.boxes.duplicatePreventionPredecessor;
  const successor = fixture.settlementPacket.boxes.duplicatePreventionSuccessor;
  const settlementInput = settlement.eip12Tx.inputs[1];
  if (
    cleanHex(predecessor.boxId) !== instance.genesisBoxIdHex
    || cleanHex(predecessor.assets[0]?.tokenId ?? '') !== instance.singletonTokenIdHex
    || cleanHex(settlementInput?.boxId ?? '') !== cleanHex(predecessor.boxId)
    || cleanHex(successor.transactionId) !== cleanHex(settlement.txId)
    || successor.index !== 1
  ) {
    throw new Error('integrated settlement and profiled DUP lineage disagree');
  }
  const context = structuredClone(settlementInput.extension ?? {});
  if (canonicalJson(context) !== canonicalJson(fixture.settlementPacket.contextExtension)) {
    throw new Error('integrated settlement DUP context differs from its packet');
  }
  const indexed = [
    {
      ...structuredClone(predecessor),
      inclusionHeight: predecessor.creationHeight,
      spentTransactionId: settlement.txId,
      spendingProof: { proofBytes: '', extension: context },
    },
    {
      ...structuredClone(successor),
      inclusionHeight: successor.creationHeight,
      spentTransactionId: null,
      spendingProof: null,
    },
  ];
  const current = [structuredClone(successor)];
  const transactions = {
    [cleanHex(issuance.txId)]: sourceTransaction(
      issuance,
      SETUP_BLOCK_ID,
      predecessor.creationHeight,
    ),
    [cleanHex(settlement.txId)]: sourceTransaction(
      settlement,
      SETTLEMENT_BLOCK_ID,
      successor.creationHeight,
    ),
  };
  const headers = {
    [SETUP_BLOCK_ID]: sourceHeader(
      SETUP_BLOCK_ID,
      sha256Text('pooled-reserve-v4-dup-setup-parent'),
      predecessor.creationHeight,
    ),
    [SETTLEMENT_BLOCK_ID]: sourceHeader(
      SETTLEMENT_BLOCK_ID,
      SETUP_BLOCK_ID,
      successor.creationHeight,
    ),
  };
  return deepFreeze({
    address: instance.address,
    tokenIdHex: instance.singletonTokenIdHex!,
    indexed,
    current,
    transactions,
    headers,
    tipBoxIdHex: cleanHex(successor.boxId),
    tipSigmaHex: await sigmaSerializeBox(successor),
  });
}

function buildSource(
  observationSourceId: string,
  data: Readonly<SourceData>,
): AuthenticatedV2VaultChainSource {
  return {
    observationSourceId,
    async getInfo() {
      return { network: 'testnet' };
    },
    async getIndexedHeight() {
      return { indexedHeight: BEST_HEIGHT, fullHeight: BEST_HEIGHT };
    },
    async getBestHeader() {
      return sourceHeader(BEST_HEADER_ID, BEST_PARENT_ID, BEST_HEIGHT);
    },
    async getIndexedBoxesByAddress(address: string) {
      return address === data.address
        ? structuredClone([...data.indexed])
        : [];
    },
    async getUnspentBoxesByAddress(address: string) {
      return address === data.address
        ? structuredClone([...data.current])
        : [];
    },
    async getIndexedBoxesByTokenId(tokenId: string) {
      return cleanHex(tokenId) === data.tokenIdHex
        ? structuredClone([...data.indexed])
        : [];
    },
    async getTransaction(transactionId: string) {
      return structuredClone(data.transactions[cleanHex(transactionId)] ?? null);
    },
    async getBlockHeaderById(blockId: string) {
      return structuredClone(data.headers[cleanHex(blockId)] ?? null);
    },
    async getBoxByIdOrNull(boxId: string) {
      return cleanHex(boxId) === data.tipBoxIdHex
        ? structuredClone(data.current[0])
        : null;
    },
    async getBoxBinaryByIdOrNull(boxId: string) {
      return cleanHex(boxId) === data.tipBoxIdHex
        ? { bytes: data.tipSigmaHex }
        : null;
    },
  };
}

function sourceTransaction(
  transaction: Readonly<{
    readonly txId: string;
    readonly eip12Tx: Readonly<{
      readonly inputs: readonly Readonly<{
        readonly boxId: string;
        readonly extension?: Readonly<Record<string, string>>;
      }>[];
      readonly dataInputs: readonly Readonly<{ readonly boxId: string }>[];
    }>;
    readonly outputs: readonly Eip12Box[];
  }>,
  blockId: string,
  inclusionHeight: number,
): Record<string, unknown> {
  return {
    id: cleanHex(transaction.txId),
    blockId,
    inclusionHeight,
    inputs: transaction.eip12Tx.inputs.map(input => ({
      boxId: cleanHex(input.boxId),
      spendingProof: {
        proofBytes: '',
        extension: structuredClone(input.extension ?? {}),
      },
    })),
    dataInputs: transaction.eip12Tx.dataInputs.map(input => ({
      boxId: cleanHex(input.boxId),
    })),
    outputs: structuredClone(transaction.outputs),
  };
}

function assertExactJoin(
  fixture: Readonly<
    ValidityApplicationPooledReserveBurnSettlementV4IntegratedFixture
  >,
  lineage: Readonly<ValidityApplicationPooledReserveHistoricalDupLineageV4>,
): ValidityApplicationPooledReserveHistoricalDupLineageV4IntegratedFixture[
  'bindings'
] {
  const compiled = fixture.compiledInstance;
  const tracker = fixture.trackerContext;
  const settlement = fixture.settlementPacket;
  const transition = lineage.transitions[0];
  const predecessor = settlement.boxes.duplicatePreventionPredecessor;
  const successor = settlement.boxes.duplicatePreventionSuccessor;
  const failed = [
    [lineage.classification === 'raw-reconstructed', 'classification'],
    [lineage.transitions.length === 1, 'transition count'],
    [lineage.lineageBoxes.length === 2, 'lineage box count'],
    [
      tracker.statement.applicationBindingDigestHex
        === cleanHex(compiled.application.burnBindingDigestHex),
      'application binding',
    ],
    [
      cleanHex(settlement.lineageProfileIdHex)
        === cleanHex(compiled.lineageProfileIdHex),
      'lineage profile',
    ],
    [
      settlement.tracker.keyHex === tracker.trackerTransition.trackerKeyHex,
      'tracker key',
    ],
    [
      settlement.tracker.valueHex === tracker.trackerTransition.trackerValueHex,
      'tracker value',
    ],
    [
      settlement.tracker.inputDigestHex
        === tracker.trackerTransition.successorDigestHex,
      'tracker input digest',
    ],
    [
      settlement.burn.duplicatePreventionKeyHex
        === settlement.burn.leaf.burnIdHex,
      'burn replay key',
    ],
    [transition?.rawInsertedKeysHex.length === 1, 'inserted-key count'],
    [
      transition?.rawInsertedKeysHex[0] === settlement.burn.leaf.burnIdHex,
      'inserted burn ID',
    ],
    [
      transition?.inputBoxIdHex === cleanHex(predecessor.boxId),
      'DUP predecessor',
    ],
    [
      transition?.successorBoxIdHex === cleanHex(successor.boxId),
      'DUP successor',
    ],
    [
      transition?.spendingTransactionIdHex
        === cleanHex(settlement.transaction.txId),
      'settlement transaction',
    ],
    [
      lineage.tipDigestHex === settlement.duplicatePrevention.outputDigestHex,
      'DUP output digest',
    ],
    [lineage.genesisBoxIdHex === cleanHex(predecessor.boxId), 'lineage genesis'],
    [lineage.tipBoxIdHex === cleanHex(successor.boxId), 'lineage tip'],
  ].find(([matched]) => matched !== true);
  if (failed !== undefined) {
    throw new Error(
      `integrated tracker, settlement and historical DUP lineage disagree at ${failed[1]}`,
    );
  }
  return deepFreeze({
    lineageProfileIdHex: settlement.lineageProfileIdHex,
    applicationBindingDigestHex: tracker.statement.applicationBindingDigestHex,
    trackerStatementDigestHex: tracker.statement.digestHex,
    trackerKeyHex: settlement.tracker.keyHex,
    trackerValueHex: settlement.tracker.valueHex,
    checkpointCommitmentHex:
      settlement.tracker.decodedValue.checkpointCommitmentHex,
    bridgeEventRootHex: settlement.tracker.decodedValue.bridgeEventRootHex,
    burnLeafHex: settlement.burn.leaf.encodedLeafHex,
    burnIdHex: settlement.burn.leaf.burnIdHex,
    recipientErgoTreeHex: settlement.burn.recipientErgoTreeHex,
    amountNanoErg: settlement.burn.leaf.amountNanoErg,
    payoutBoxIdHex: cleanHex(settlement.boxes.payout.boxId),
    settlementTransactionIdHex: cleanHex(settlement.transaction.txId),
    duplicatePreventionPredecessorBoxIdHex: cleanHex(predecessor.boxId),
    duplicatePreventionSuccessorBoxIdHex: cleanHex(successor.boxId),
    duplicatePreventionInputDigestHex:
      settlement.duplicatePrevention.inputDigestHex,
    duplicatePreventionOutputDigestHex:
      settlement.duplicatePrevention.outputDigestHex,
    historicalTransitionContextDigestHex:
      transition.contextExtensionDigestHex,
  });
}

function sourceHeader(
  id: string,
  parentId: string,
  height: number,
): Record<string, unknown> {
  return { id, parentId, height, extensionRoot: EXTENSION_ROOT };
}

async function sigmaSerializeBox(box: Eip12Box): Promise<string> {
  const imported = await import('ergo-lib-wasm-nodejs');
  const wasm = imported.default ?? imported;
  const parsed = wasm.ErgoBox.from_json(JSON.stringify(box));
  try {
    return Buffer.from(parsed.sigma_serialize_bytes()).toString('hex');
  } finally {
    parsed.free?.();
  }
}

function deterministicP2pkTree(seed: number): string {
  const ecdh = createECDH('secp256k1');
  const key = Buffer.alloc(32);
  key.writeUInt32BE(seed + 1, 28);
  ecdh.setPrivateKey(key);
  return `1008cd${ecdh.getPublicKey(undefined, 'compressed').toString('hex')}`;
}

function cleanHex(value: string): string {
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error('integrated historical DUP fixture expected canonical hex');
  }
  return clean.toLowerCase();
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sha256HexBytes(value: string): string {
  return createHash('sha256').update(Buffer.from(cleanHex(value), 'hex')).digest('hex');
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value as object)) {
    return value;
  }
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}
