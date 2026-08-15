import { getDupTreeDigest } from './avl-bridge.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
} from './ergo-encoding.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';
import {
  assertValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Packet,
  type ValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Packet,
} from './validity-application-pooled-reserve-authenticated-v2-replay-import-v4.js';
import {
  assertValidityApplicationPooledReserveErgoCutoverObservationV4Provenance,
  validateValidityApplicationPooledReserveErgoCutoverObservationV4Report,
  type ValidityApplicationPooledReserveErgoCutoverObservationV4Report,
} from './validity-application-pooled-reserve-ergo-cutover-observation-v4.js';
import {
  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate,
  VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
  type ValidityApplicationPooledReserveInstanceV4Candidate,
} from './validity-application-pooled-reserve-instance-v4.js';

export const VALIDITY_APPLICATION_POOLED_RESERVE_HISTORICAL_REPLAY_GENESIS_V4_SCHEMA =
  'e2s.validity-application-pooled-reserve-historical-replay-genesis.v4' as const;

const PACKET_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_HISTORICAL_REPLAY_GENESIS_PACKET_V4';
const AUTHENTICATED_V2_DUP_ROUTE_ID =
  'ergo-double-unlock-prevention-authenticated';
const DUP_VALUE_BYTES = 1;
const packets = new WeakSet<object>();

export interface EmptyObservedHistoricalReplayContributionV4Input {
  readonly kind: 'empty-observed-lineage';
  readonly routeId: string;
  readonly instanceId: string;
  readonly lineagePacketDigestHex: string;
}

export interface AuthenticatedV2HistoricalReplayContributionV4Input {
  readonly kind: 'authenticated-v2-replay-import';
  readonly routeId: string;
  readonly instanceId: string;
  readonly lineagePacketDigestHex: string;
  readonly replayImport: Readonly<
    ValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Packet
  >;
}

export type HistoricalReplayGenesisContributionV4Input =
  | EmptyObservedHistoricalReplayContributionV4Input
  | AuthenticatedV2HistoricalReplayContributionV4Input;

export interface BuildValidityApplicationPooledReserveHistoricalReplayGenesisV4Input {
  readonly compiledInstance: Readonly<
    ValidityApplicationPooledReserveInstanceV4Candidate
  >;
  readonly cutoverObservation: Readonly<
    ValidityApplicationPooledReserveErgoCutoverObservationV4Report
  >;
  readonly contributions: readonly Readonly<
    HistoricalReplayGenesisContributionV4Input
  >[];
}

export interface HistoricalReplayGenesisContributionV4 {
  readonly kind:
    | 'empty-observed-lineage'
    | 'authenticated-v2-replay-import';
  readonly routeId: string;
  readonly sourceSurface: string;
  readonly instanceId: string;
  readonly lineagePacketDigestHex: string;
  readonly lineageClassification: 'never-funded' | 'raw-reconstructed';
  readonly rawReplayKeyCount: number;
  readonly replayImportPacketDigestHex: string | null;
  readonly canonicalBurnIdsHex: readonly string[];
}

export interface ValidityApplicationPooledReserveHistoricalReplayGenesisV4Packet {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_HISTORICAL_REPLAY_GENESIS_V4_SCHEMA;
  readonly version: 4;
  readonly packetDigestHex: string;
  readonly lineage: Readonly<{
    readonly lineageProfileIdHex: string;
    readonly encodedLineageProfileHex: string;
  }>;
  readonly observation: Readonly<{
    readonly cutoverObservationReportDigestHex: string;
    readonly routeProfileDigestHex: string;
    readonly requirementsDigestHex: string;
    readonly networkId: 'ergo-testnet';
    readonly stableSnapshot: ValidityApplicationPooledReserveErgoCutoverObservationV4Report[
      'observation'
    ]['stableSnapshot'];
    readonly sourceIdDigestsHex: readonly [string, string];
  }>;
  readonly contributions: readonly Readonly<
    HistoricalReplayGenesisContributionV4
  >[];
  readonly duplicatePreventionGenesis: Readonly<{
    readonly canonicalBurnIdsHex: readonly string[];
    readonly digestHex: string;
    readonly registers: Readonly<{
      readonly R4: string;
      readonly R5: string;
    }>;
  }>;
  readonly boundaries: Readonly<{
    readonly cutoverObservationValidatedInProcess: true;
    readonly exactContributionPerObservedLineage: true;
    readonly deterministicInsertOnlyGenesisBuilt: true;
    readonly allObservedHistoricalLineagesComposed: true;
    readonly profileInstanceInventoryExhaustiveAuthenticated: false;
    readonly legacyRoutesRetired: false;
    readonly profileActivated: false;
    readonly transactionConstructed: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly nodeCheckPerformed: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

type ObservedLineage = ValidityApplicationPooledReserveErgoCutoverObservationV4Report[
  'historicalDupLineages'
][number];

export function buildValidityApplicationPooledReserveHistoricalReplayGenesisV4(
  input: BuildValidityApplicationPooledReserveHistoricalReplayGenesisV4Input,
): Readonly<
  ValidityApplicationPooledReserveHistoricalReplayGenesisV4Packet
> {
  exactDataObject(input, [
    'compiledInstance',
    'cutoverObservation',
    'contributions',
  ], 'historical replay-genesis V4 input');
  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate(
    input.compiledInstance,
  );
  assertValidityApplicationPooledReserveErgoCutoverObservationV4Provenance(
    input.cutoverObservation,
  );
  const observation =
    validateValidityApplicationPooledReserveErgoCutoverObservationV4Report(
      input.cutoverObservation,
    );
  if (!Array.isArray(input.contributions)) {
    throw new Error('historical replay-genesis contributions must be an array');
  }

  const observedByKey = new Map<string, ObservedLineage>();
  for (const lineage of observation.historicalDupLineages) {
    assertLineageBoundToObservation(lineage, observation);
    const key = lineageKey(lineage.routeId, lineage.instanceId);
    if (observedByKey.has(key)) {
      throw new Error(`cutover observation repeats historical DUP lineage ${key}`);
    }
    observedByKey.set(key, lineage);
  }

  const suppliedByKey = new Map<
    string,
    Readonly<HistoricalReplayGenesisContributionV4Input>
  >();
  for (const [index, contribution] of input.contributions.entries()) {
    const normalized = normalizeContributionInput(contribution, index);
    const key = lineageKey(normalized.routeId, normalized.instanceId);
    if (!observedByKey.has(key)) {
      throw new Error(`historical replay-genesis contribution ${index} references unknown lineage ${key}`);
    }
    if (suppliedByKey.has(key)) {
      throw new Error(`historical replay-genesis contains duplicate contribution for ${key}`);
    }
    suppliedByKey.set(key, normalized);
  }
  if (suppliedByKey.size !== observedByKey.size) {
    const missing = [...observedByKey.keys()].filter(key => !suppliedByKey.has(key));
    throw new Error(
      `historical replay-genesis omits observed lineages: ${missing.join(', ')}`,
    );
  }

  const contributions: HistoricalReplayGenesisContributionV4[] = [];
  for (const [key, lineage] of observedByKey.entries()) {
    const contribution = suppliedByKey.get(key);
    if (contribution === undefined) {
      throw new Error(`historical replay-genesis omits observed lineage ${key}`);
    }
    contributions.push(buildContribution(
      input.compiledInstance,
      lineage,
      contribution,
    ));
  }
  contributions.sort(compareContributionIdentity);

  const canonicalBurnIdsHex = contributions
    .flatMap(contribution => contribution.canonicalBurnIdsHex)
    .map((burnIdHex, index) => fixedHex(
      burnIdHex,
      32,
      `global canonical burn ID ${index}`,
    ))
    .sort();
  assertStrictlySortedUnique(
    canonicalBurnIdsHex,
    'global canonical burn IDs across historical lineages',
  );
  const digestHex = fixedHex(
    getDupTreeDigest([...canonicalBurnIdsHex]),
    33,
    'global historical replay-genesis AVL digest',
  );
  const lineageProfileIdHex = prefixedFixedHex(
    input.compiledInstance.lineageProfileIdHex,
    32,
    'compiled V4 lineage profile ID',
  );
  const registers = {
    R4: encodeCollByteRegister(Buffer.from(lineageProfileIdHex.slice(2), 'hex')),
    R5: encodeAvlTreeRegister(
      Buffer.from(digestHex, 'hex'),
      VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
      DUP_VALUE_BYTES,
    ),
  };
  const sourceIdDigestsHex = observation.observation.sourceIdDigestsHex.map(
    (digest, index) => fixedHex(digest, 32, `cutover source ID digest ${index}`),
  ).sort() as [string, string];

  const binding = {
    schema:
      VALIDITY_APPLICATION_POOLED_RESERVE_HISTORICAL_REPLAY_GENESIS_V4_SCHEMA,
    version: 4 as const,
    lineage: {
      lineageProfileIdHex,
      encodedLineageProfileHex: variablePrefixedHex(
        input.compiledInstance.encodedLineageProfileHex,
        'compiled V4 encoded lineage profile',
      ),
    },
    observation: {
      cutoverObservationReportDigestHex: fixedHex(
        observation.reportDigestHex,
        32,
        'cutover observation report digest',
      ),
      routeProfileDigestHex: fixedHex(
        observation.profile.profileDigestHex,
        32,
        'cutover route-profile digest',
      ),
      requirementsDigestHex: fixedHex(
        observation.profile.requirementsDigestHex,
        32,
        'cutover requirements digest',
      ),
      networkId: observation.profile.networkId,
      stableSnapshot: observation.observation.stableSnapshot,
      sourceIdDigestsHex,
    },
    contributions,
    duplicatePreventionGenesis: {
      canonicalBurnIdsHex,
      digestHex,
      registers,
    },
    boundaries: {
      cutoverObservationValidatedInProcess: true as const,
      exactContributionPerObservedLineage: true as const,
      deterministicInsertOnlyGenesisBuilt: true as const,
      allObservedHistoricalLineagesComposed: true as const,
      profileInstanceInventoryExhaustiveAuthenticated: false as const,
      legacyRoutesRetired: false as const,
      profileActivated: false as const,
      transactionConstructed: false as const,
      targetNodeAcceptanceEstablished: false as const,
      nodeCheckPerformed: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const packet = deepFreeze({
    ...binding,
    packetDigestHex: sha256CanonicalJson(binding, PACKET_DIGEST_DOMAIN),
  });
  packets.add(packet);
  return packet;
}

export function assertValidityApplicationPooledReserveHistoricalReplayGenesisV4Provenance(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveHistoricalReplayGenesisV4Packet
> {
  if (value === null || typeof value !== 'object' || !packets.has(value)) {
    throw new Error(
      'historical replay-genesis V4 packet was not built in this process',
    );
  }
}

function buildContribution(
  compiled: Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>,
  lineage: ObservedLineage,
  contribution: Readonly<HistoricalReplayGenesisContributionV4Input>,
): HistoricalReplayGenesisContributionV4 {
  const lineagePacketDigestHex = fixedHex(
    contribution.lineagePacketDigestHex,
    32,
    `historical lineage ${lineage.routeId}/${lineage.instanceId} packet digest`,
  );
  if (lineagePacketDigestHex !== lineage.packetDigestHex) {
    throw new Error(
      `historical replay-genesis contribution for ${lineage.routeId}/${lineage.instanceId} `
      + 'does not bind the observed lineage packet',
    );
  }
  if (contribution.kind === 'empty-observed-lineage') {
    if (lineage.rawInsertedKeysHex.length !== 0) {
      throw new Error(
        `nonempty historical lineage ${lineage.routeId}/${lineage.instanceId} `
        + 'requires supported mapping and source-admission evidence',
      );
    }
    return {
      kind: contribution.kind,
      routeId: lineage.routeId,
      sourceSurface: lineage.sourceSurface,
      instanceId: lineage.instanceId,
      lineagePacketDigestHex,
      lineageClassification: lineage.classification,
      rawReplayKeyCount: 0,
      replayImportPacketDigestHex: null,
      canonicalBurnIdsHex: [],
    };
  }
  if (lineage.routeId !== AUTHENTICATED_V2_DUP_ROUTE_ID) {
    throw new Error(
      `nonempty historical lineage ${lineage.routeId}/${lineage.instanceId} `
      + 'has no supported replay-import adapter',
    );
  }
  if (lineage.rawInsertedKeysHex.length === 0) {
    throw new Error(
      `empty historical lineage ${lineage.routeId}/${lineage.instanceId} `
      + 'must use an explicit empty-observed-lineage contribution',
    );
  }

  const replayImport = contribution.replayImport;
  assertValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Packet(
    replayImport,
  );
  assertReplayImportBoundToCompiledInstance(replayImport, compiled);
  assertReplayImportBoundToObservedLineage(replayImport, lineage);
  const canonicalBurnIdsHex = replayImport.duplicatePreventionGenesis
    .canonicalBurnIdsHex.map((burnIdHex, index) => fixedHex(
      burnIdHex,
      32,
      `authenticated V2 canonical burn ID ${index}`,
    ));
  assertStrictlySortedUnique(
    canonicalBurnIdsHex,
    'authenticated V2 canonical burn IDs',
  );
  assertReplayImportGenesis(replayImport, compiled, canonicalBurnIdsHex);

  return {
    kind: contribution.kind,
    routeId: lineage.routeId,
    sourceSurface: lineage.sourceSurface,
    instanceId: lineage.instanceId,
    lineagePacketDigestHex,
    lineageClassification: lineage.classification,
    rawReplayKeyCount: lineage.rawInsertedKeysHex.length,
    replayImportPacketDigestHex: fixedHex(
      replayImport.packetDigestHex,
      32,
      'authenticated V2 replay-import packet digest',
    ),
    canonicalBurnIdsHex,
  };
}

function assertReplayImportBoundToCompiledInstance(
  replayImport: Readonly<
    ValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Packet
  >,
  compiled: Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>,
): void {
  if (
    prefixedFixedHex(
      replayImport.lineage.lineageProfileIdHex,
      32,
      'authenticated V2 replay-import lineage profile ID',
    ) !== prefixedFixedHex(
      compiled.lineageProfileIdHex,
      32,
      'compiled V4 lineage profile ID',
    )
    || replayImport.lineage.encodedLineageProfileHex
      !== compiled.encodedLineageProfileHex
  ) {
    throw new Error(
      'authenticated V2 replay import does not match the compiled V4 lineage',
    );
  }
}

function assertReplayImportBoundToObservedLineage(
  replayImport: Readonly<
    ValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Packet
  >,
  lineage: ObservedLineage,
): void {
  if (
    fixedHex(
      replayImport.source.authenticatedV2DuplicatePreventionNftIdHex,
      32,
      'authenticated V2 replay-import DUP NFT ID',
    ) !== lineage.singletonTokenIdHex
    || variableHex(
      replayImport.source.authenticatedV2DuplicatePreventionErgoTreeHex,
      'authenticated V2 replay-import DUP ErgoTree',
    ) !== lineage.ergoTreeHex
    || fixedHex(
      replayImport.source.authenticatedV2GenesisBoxIdHex,
      32,
      'authenticated V2 replay-import genesis box ID',
    ) !== lineage.genesisBoxIdHex
    || fixedHex(
      replayImport.source.authenticatedV2TipBoxIdHex,
      32,
      'authenticated V2 replay-import tip box ID',
    ) !== lineage.tipBoxIdHex
    || fixedHex(
      replayImport.source.authenticatedV2TipDigestHex,
      33,
      'authenticated V2 replay-import tip digest',
    ) !== lineage.tipDigestHex
    || canonicalUint64(
      replayImport.source.authenticatedV2TipCounter,
      'authenticated V2 replay-import tip counter',
    ) !== lineage.tipCounter
  ) {
    throw new Error(
      'authenticated V2 replay import differs from the observed historical lineage',
    );
  }

  const observedRawKeys = lineage.rawInsertedKeysHex.map((keyHex, index) =>
    fixedHex(keyHex, 32, `observed authenticated V2 raw replay key ${index}`)
  ).sort();
  assertStrictlySortedUnique(
    observedRawKeys,
    'observed authenticated V2 raw replay keys',
  );
  const importedLegacyKeys = replayImport.imports.map((entry, index) => {
    if (
      entry.legacyKeySemantics !== 'canonical-v4-burn-id'
      || fixedHex(
        entry.legacyHistoryKeyHex,
        32,
        `authenticated V2 imported history key ${index}`,
      ) !== fixedHex(
        entry.canonicalBurnIdHex,
        32,
        `authenticated V2 imported canonical burn ID ${index}`,
      )
    ) {
      throw new Error(
        'authenticated V2 replay import must bind each observed event-level key to the same canonical burn ID',
      );
    }
    return fixedHex(
      entry.legacyHistoryKeyHex,
      32,
      `authenticated V2 imported history key ${index}`,
    );
  }).sort();
  assertStrictlySortedUnique(
    importedLegacyKeys,
    'authenticated V2 imported history keys',
  );
  if (canonicalJson(importedLegacyKeys) !== canonicalJson(observedRawKeys)) {
    throw new Error(
      'authenticated V2 replay import does not cover the exact observed raw lineage keys',
    );
  }
}

function assertReplayImportGenesis(
  replayImport: Readonly<
    ValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Packet
  >,
  compiled: Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>,
  canonicalBurnIdsHex: readonly string[],
): void {
  const digestHex = fixedHex(
    getDupTreeDigest([...canonicalBurnIdsHex]),
    33,
    'authenticated V2 replay-import AVL digest',
  );
  const profileIdHex = prefixedFixedHex(
    compiled.lineageProfileIdHex,
    32,
    'compiled V4 lineage profile ID',
  );
  const expectedRegisters = {
    R4: encodeCollByteRegister(Buffer.from(profileIdHex.slice(2), 'hex')),
    R5: encodeAvlTreeRegister(
      Buffer.from(digestHex, 'hex'),
      VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
      DUP_VALUE_BYTES,
    ),
  };
  const importedIds = replayImport.imports.map((entry, index) => fixedHex(
    entry.canonicalBurnIdHex,
    32,
    `authenticated V2 import canonical burn ID ${index}`,
  )).sort();
  if (
    canonicalJson(importedIds) !== canonicalJson(canonicalBurnIdsHex)
    || replayImport.duplicatePreventionGenesis.digestHex !== digestHex
    || canonicalJson(replayImport.duplicatePreventionGenesis.registers)
      !== canonicalJson(expectedRegisters)
  ) {
    throw new Error(
      'authenticated V2 replay import does not encode the exact deterministic V4 DUP genesis',
    );
  }
  const expectedBoundaries = {
    authenticatedV2LineageImported: true,
    allLineagesImported: false,
    legacyRoutesRetired: false,
    profileActivated: false,
    transactionConstructed: false,
    targetNodeAcceptanceEstablished: false,
    nodeCheckPerformed: false,
    signingAuthorityEstablished: false,
    submissionAuthorityEstablished: false,
    broadcastAuthorityEstablished: false,
    fundsAuthorityEstablished: false,
    gate5Closed: false,
    trustlessStatusEstablished: false,
    productionReadinessEstablished: false,
  };
  if (canonicalJson(replayImport.boundaries) !== canonicalJson(expectedBoundaries)) {
    throw new Error('authenticated V2 replay import authority boundaries are invalid');
  }
}

function assertLineageBoundToObservation(
  lineage: ObservedLineage,
  observation: Readonly<
    ValidityApplicationPooledReserveErgoCutoverObservationV4Report
  >,
): void {
  if (
    lineage.profileDigestHex !== observation.profile.profileDigestHex
    || lineage.requirementsDigestHex !== observation.profile.requirementsDigestHex
    || lineage.networkId !== observation.profile.networkId
  ) {
    throw new Error(
      `historical lineage ${lineage.routeId}/${lineage.instanceId} profile identity drifted`,
    );
  }
  if (
    canonicalJson(lineage.stableSnapshot)
      !== canonicalJson(observation.observation.stableSnapshot)
  ) {
    throw new Error(
      `historical lineage ${lineage.routeId}/${lineage.instanceId} snapshot drifted`,
    );
  }
  const lineageSources = lineage.sourceIdDigestsHex.map((digest, index) =>
    fixedHex(digest, 32, `historical lineage source ID digest ${index}`)
  ).sort();
  const observationSources = observation.observation.sourceIdDigestsHex.map(
    (digest, index) => fixedHex(
      digest,
      32,
      `cutover observation source ID digest ${index}`,
    ),
  ).sort();
  if (canonicalJson(lineageSources) !== canonicalJson(observationSources)) {
    throw new Error(
      `historical lineage ${lineage.routeId}/${lineage.instanceId} source pair drifted`,
    );
  }
}

function normalizeContributionInput(
  value: Readonly<HistoricalReplayGenesisContributionV4Input>,
  index: number,
): Readonly<HistoricalReplayGenesisContributionV4Input> {
  const record = exactDataObject(
    value,
    value?.kind === 'authenticated-v2-replay-import'
      ? ['kind', 'routeId', 'instanceId', 'lineagePacketDigestHex', 'replayImport']
      : ['kind', 'routeId', 'instanceId', 'lineagePacketDigestHex'],
    `historical replay-genesis contribution ${index}`,
  );
  if (
    record.kind !== 'empty-observed-lineage'
    && record.kind !== 'authenticated-v2-replay-import'
  ) {
    throw new Error(`historical replay-genesis contribution ${index} kind is unsupported`);
  }
  const routeId = nonemptyString(record.routeId, `contribution ${index} route ID`);
  const instanceId = nonemptyString(
    record.instanceId,
    `contribution ${index} instance ID`,
  );
  const lineagePacketDigestHex = fixedHex(
    record.lineagePacketDigestHex,
    32,
    `contribution ${index} lineage packet digest`,
  );
  if (record.kind === 'empty-observed-lineage') {
    return { kind: record.kind, routeId, instanceId, lineagePacketDigestHex };
  }
  return {
    kind: record.kind,
    routeId,
    instanceId,
    lineagePacketDigestHex,
    replayImport: record.replayImport as Readonly<
      ValidityApplicationPooledReserveAuthenticatedV2ReplayImportV4Packet
    >,
  };
}

function compareContributionIdentity(
  left: HistoricalReplayGenesisContributionV4,
  right: HistoricalReplayGenesisContributionV4,
): number {
  return compareCodeUnits(left.routeId, right.routeId)
    || compareCodeUnits(left.instanceId, right.instanceId);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function lineageKey(routeId: string, instanceId: string): string {
  return `${routeId}/${instanceId}`;
}

function assertStrictlySortedUnique(values: readonly string[], label: string): void {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1] >= values[index]) {
      throw new Error(`${label} must be strictly sorted and unique`);
    }
  }
}

function exactDataObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  if (canonicalJson(actualKeys) !== canonicalJson(expectedKeys)) {
    throw new Error(`${label} must contain exactly: ${expectedKeys.join(', ')}`);
  }
  return value as Record<string, unknown>;
}

function nonemptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new Error(`${label} must be a nonempty trimmed string`);
  }
  return value;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  if (
    normalized.length !== bytes * 2
    || !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new Error(`${label} must be ${bytes}-byte lowercase hex`);
  }
  return normalized;
}

function prefixedFixedHex(value: unknown, bytes: number, label: string): string {
  return `0x${fixedHex(value, bytes, label)}`;
}

function variableHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be nonempty lowercase hex`);
  }
  return value;
}

function variablePrefixedHex(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  return `0x${variableHex(normalized, label)}`;
}

function canonicalUint64(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical uint64 string`);
  }
  const parsed = BigInt(value);
  if (parsed > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} exceeds uint64`);
  }
  return value;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (value !== null && typeof value === 'object') {
    const object = value as object;
    if (seen.has(object)) return value;
    seen.add(object);
    for (const child of Object.values(object)) deepFreeze(child, seen);
    Object.freeze(object);
  }
  return value;
}
